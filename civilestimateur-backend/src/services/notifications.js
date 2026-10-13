// src/services/notifications.js
// Qui reçoit quel e-mail, et quand. Les envois liés au paiement partent en arrière-plan : une panne
// d'e-mail ne doit JAMAIS bloquer ni faire échouer l'activation d'un abonnement payé.
import { env } from '../config/env.js'
import { abonnementActif, aExpirer, enregistrerTransaction, aRappeler, libererEchec, libererEnvoi, reserverEchec, reserverEnvoi } from './abonnements.js'
import { emailConfigure, envoyer, mailBienvenue, mailExpiration, mailPaiementAdmin, mailPaiementConfirme, mailPaiementEchoue, mailRappel } from './email.js'
import { lireProfil } from './profils.js'

const JOUR = 86400000

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
export function notifierPaiementConfirme({ userId, txId, montant, fin, renouvellement }) {
  if (!emailConfigure()) return Promise.resolve()
  return arrierePlan('paiement', (async () => {
    const profil = await lireProfil(userId)
    const nom = profil?.nom || ''
    const email = profil?.email || ''
    // Chaque envoi est indépendant : l'échec de l'un n'empêche pas l'autre.
    const envois = []
    if (email) {
      envois.push(envoyer({ to: email, ...mailPaiementConfirme({ nom, montant, fin, renouvellement }), idempotencyKey: `paiement-client/${txId}` }))
    } else {
      console.warn(`[email/paiement] pas d'adresse pour l'utilisateur ${userId} — mail client non envoyé`)
    }
    envois.push(envoyer({ to: env.EMAIL_ADMINS, ...mailPaiementAdmin({ nom, email, montant, fin, txId, renouvellement }), idempotencyKey: `paiement-admin/${txId}` }))
    const res = await Promise.allSettled(envois)
    const echec = res.find((r) => r.status === 'rejected')
    if (echec) throw echec.reason
  })())
}

// ── 5. Paiement refusé ou annulé ────────────────────────────────────────────────
export function notifierEchecPaiement({ userId, txId, statut, montant }) {
  if (!emailConfigure()) return Promise.resolve()
  return arrierePlan('echec', (async () => {
    await enregistrerTransaction({ userId, txId, montant }) // sans effet si la ligne existe (le suivi s'y accroche)
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

// ── 4. Rappel avant expiration + mail d'expiration (tâche planifiée) ─────────────
/**
 * À lancer chaque jour. Idempotent : chaque abonnement ne reçoit qu'un rappel et qu'un mail
 * d'expiration, même si la tâche tourne plusieurs fois. Un abonnement déjà renouvelé n'est pas relancé.
 * @returns {{ rappels: number, expirations: number, ignores: number, erreurs: number }}
 */
export async function traiterEcheances() {
  const bilan = { rappels: 0, expirations: 0, ignores: 0, erreurs: 0 }
  if (!emailConfigure()) return { ...bilan, desactive: 'RESEND_API_KEY absent' }

  const maintenant = Date.now()

  // Rappels : abonnements qui se terminent dans les RAPPEL_JOURS prochains jours.
  for (const ab of await aRappeler(new Date(maintenant + env.RAPPEL_JOURS * JOUR))) {
    try {
      if (!(await reserverEnvoi(ab.id, 'rappel_envoye_le'))) continue
      const suivant = await abonnementActif(ab.user_id) // le plus lointain : s'il dépasse celui-ci, déjà renouvelé
      if (suivant && new Date(suivant.fin) > new Date(ab.fin)) { bilan.ignores++; continue }
      const profil = await lireProfil(ab.user_id)
      if (!profil?.email) { bilan.ignores++; continue }
      try {
        await envoyer({ to: profil.email, ...mailRappel({ nom: profil.nom, fin: ab.fin, joursRestants: Math.ceil((new Date(ab.fin) - maintenant) / JOUR) }), idempotencyKey: `rappel/${ab.id}` })
      } catch (e) { await libererEnvoi(ab.id, 'rappel_envoye_le').catch(() => {}); throw e }
      bilan.rappels++
    } catch (e) { bilan.erreurs++; console.error('[echeances/rappel]', ab.id, e.message) }
  }

  // Expirations : la ligne passe à « expire » et le client est prévenu (sauf s'il a renouvelé entre-temps).
  for (const ab of await aExpirer()) {
    try {
      if (!(await reserverEnvoi(ab.id, 'expiration_envoyee_le', { statut: 'expire' }))) continue
      if (await abonnementActif(ab.user_id)) { bilan.ignores++; continue } // un autre abonnement court encore
      const profil = await lireProfil(ab.user_id)
      if (!profil?.email) { bilan.ignores++; continue }
      try {
        await envoyer({ to: profil.email, ...mailExpiration({ nom: profil.nom, fin: ab.fin }), idempotencyKey: `expiration/${ab.id}` })
      } catch (e) { await libererEnvoi(ab.id, 'expiration_envoyee_le', { statut: 'actif' }).catch(() => {}); throw e }
      bilan.expirations++
    } catch (e) { bilan.erreurs++; console.error('[echeances/expiration]', ab.id, e.message) }
  }

  return bilan
}
