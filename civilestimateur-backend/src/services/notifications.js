// src/services/notifications.js
// Qui reçoit quel e-mail, et quand. Les envois liés au paiement partent en arrière-plan : une panne
// d'e-mail ne doit JAMAIS bloquer ni faire échouer le crédit d'un achat payé.
import { env } from '../config/env.js'
import {
  enregistrerAchat, libererEchec, reserverEchec, soldeUtilisateur, soldeExpirableUtilisateur, achatsAEcheance, dernierAchatPaye,
  reserverRappelExpiration, libererRappelExpiration, marquerExpirationTraitee, expirerCredits,
} from './credits.js'
import { emailConfigure, envoyer, mailBienvenue, mailPaiementAdmin, mailPaiementConfirme, mailPaiementEchoue, mailRappelExpirationCredits, mailCreditsExpires } from './email.js'
import { traiterExpirationCredits } from './expirationCredits.js'
import { lireProfil } from './profils.js'
import { genererConfirmationPdf, nomFichierConfirmation } from './pdf/confirmationPdf.js'
import { USAGES_CREDITS } from './tarifs.js'
import { VERSION as VERSION_CONDITIONS } from './politiquesTexte.js'
import { marquerEnvoi } from './preuves.js'

// Envois en cours (permet aux tests et à l'arrêt du serveur d'attendre leur fin).
const enCours = new Set()
function arrierePlan(nom, promesse) {
  const p = promesse.catch((e) => console.error(`[email/${nom}]`, e.message)).finally(() => enCours.delete(p))
  enCours.add(p)
  return p
}
export const attendreNotifications = () => Promise.allSettled([...enCours])

// ── 1. Bienvenue ────────────────────────────────────────────────────────────────
export const envoyerBienvenue = ({ email, nom }) => envoyer({ to: email, ...mailBienvenue({ nom }) })

// ── 2 + 3. Paiement confirmé : client + notification admin ──────────────────────
export function notifierPaiementConfirme({ userId, txId, montant, credits, solde }) {
  if (!emailConfigure()) return Promise.resolve()
  return arrierePlan('paiement', (async () => {
    const profil = await lireProfil(userId)
    const nom = profil?.nom || ''
    const email = profil?.email || ''
    // Chaque envoi est indépendant : l'échec de l'un n'empêche pas l'autre.
    const envois = []
    if (email) {
      // PDF « confirmation + conditions complètes » joint au mail. S'il ne peut pas être généré (Chromium
      // indisponible, serveur occupé), le client reçoit quand même son mail de confirmation, sans pièce jointe.
      let pieceJointe = null
      try {
        const pdf = await genererConfirmationPdf({ nom, email, txId, montant, credits, solde, fonctionnalites: USAGES_CREDITS })
        pieceJointe = [{ filename: nomFichierConfirmation(txId), content: pdf }]
      } catch (e) {
        console.error('[email/paiement] PDF de confirmation non généré :', e.message)
      }
      envois.push(envoyer({
        to: email,
        ...mailPaiementConfirme({ nom, montant, credits, solde, avecPdf: !!pieceJointe, versionConditions: VERSION_CONDITIONS }),
        ...(pieceJointe ? { attachments: pieceJointe } : {}),
        idempotencyKey: `paiement-client/${txId}`,
      }).then(async (id) => {
        // Preuve : l'e-mail est parti (la date d'envoi complète la ligne créée au crédit).
        await marquerEnvoi(txId, !!pieceJointe).catch((e) => console.error('[preuve/envoi]', e.message))
        return id
      }))
    } else {
      console.warn(`[email/paiement] pas d'adresse pour l'utilisateur ${userId} — mail client non envoyé`)
    }
    envois.push(envoyer({ to: env.EMAIL_ADMINS, ...mailPaiementAdmin({ nom, email, montant, credits, txId }), idempotencyKey: `paiement-admin/${txId}` }))
    const res = await Promise.allSettled(envois)
    const echec = res.find((r) => r.status === 'rejected')
    if (echec) throw echec.reason
  })())
}

// ── 4. Paiement refusé ou annulé ────────────────────────────────────────────────
export function notifierEchecPaiement({ userId, txId, statut, montant, credits }) {
  if (!emailConfigure()) return Promise.resolve()
  return arrierePlan('echec', (async () => {
    await enregistrerAchat({ userId, txId, montant, credits }) // sans effet si la ligne existe (le suivi s'y accroche)
    if (!(await reserverEchec(txId))) return // déjà notifié (webhook + retour navigateur)
    try {
      const profil = await lireProfil(userId)
      if (!profil?.email) throw new Error(`pas d'adresse pour l'utilisateur ${userId}`)
      await envoyer({ to: profil.email, ...mailPaiementEchoue({ nom: profil.nom, statut, montant }), idempotencyKey: `echec/${txId}` })
    } catch (e) {
      await libererEchec(txId).catch(() => {})
      throw e
    }
  })())
}

// ── 5. Échéances des crédits : rappel avant l'expiration, puis remise à zéro (tâche planifiée) ─────
// Appelée par `npm run echeances` (Render Cron Job) ou `POST /api/cron/echeances` (secret CRON_SECRET), une fois par jour.
export function traiterEcheances(now = new Date()) {
  const destinataire = async (userId) => {
    const profil = await lireProfil(userId)
    if (!profil?.email) throw new Error(`pas d'adresse pour l'utilisateur ${userId}`)
    return profil
  }
  return traiterExpirationCredits({
    now,
    config: { validiteMois: env.CREDITS_VALIDITE_MOIS, rappelJours: env.RAPPEL_JOURS, depuis: env.CREDITS_EXPIRATION_DEPUIS },
    ports: {
      candidats: achatsAEcheance,
      dernierAchat: dernierAchatPaye,
      solde: soldeExpirableUtilisateur,
      reserverRappel: reserverRappelExpiration,
      libererRappel: libererRappelExpiration,
      marquerTraite: marquerExpirationTraitee,
      expirer: expirerCredits,
      envoyerRappel: async ({ userId, solde, expireLe, joursRestants }) => {
        if (!emailConfigure()) throw new Error('e-mail non configuré')
        const p = await destinataire(userId)
        await envoyer({ to: p.email, ...mailRappelExpirationCredits({ nom: p.nom, solde, expireLe, joursRestants }), idempotencyKey: `rappel-expiration/${userId}/${expireLe.toISOString().slice(0, 10)}` })
      },
      envoyerExpire: async ({ userId, credits }) => {
        if (!emailConfigure()) return
        const p = await destinataire(userId)
        await envoyer({ to: p.email, ...mailCreditsExpires({ nom: p.nom, credits }), idempotencyKey: `credits-expires/${userId}/${new Date(now).toISOString().slice(0, 10)}` })
      },
    },
  })
}
