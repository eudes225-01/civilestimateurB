// src/middleware/access.js
// Accès Premium = abonnement FedaPay actif, ou administrateur.
//
// Seules deux fonctionnalités sont verrouillées : le dépôt/lecture des plans (/api/analyse-plan)
// et l'export PDF (/api/pdf/devis) — voir src/config/premium.js. Tout le reste est accessible
// à un compte connecté (statut « standard »). Après paiement, le statut devient « premium » ;
// les administrateurs (« admin ») ont accès à 100 % des fonctionnalités, sans abonnement.
//
// L'abonnement est vérifié côté serveur dans Supabase (table abonnements, écrite uniquement
// par le webhook / la confirmation FedaPay) pour l'utilisateur identifié par son jeton de
// session. Aucun en-tête fourni par le client ne vaut preuve d'abonnement.
import { env } from '../config/env.js'
import { MESSAGE_PREMIUM, STATUTS, fonctionnalitesPour, offrePremium } from '../config/premium.js'
import { abonnementActif, abonnementsConfigures } from '../services/abonnements.js'
import { fedapayConfigure } from '../services/fedapay.js'

const fmt = (d) => new Date(d).toLocaleDateString('fr-FR')
const JOUR = 86400000

/**
 * Administrateur : adresse e-mail (confirmée) listée dans EMAIL_ADMIN. Aucun abonnement à payer.
 * L'adresse doit être vérifiée par Supabase, pour qu'on ne puisse pas s'en prévaloir sans la posséder.
 */
export function estAdmin(user) {
  const email = String(user?.email || '').trim().toLowerCase()
  if (!email || !user?.emailVerifie) return false
  return env.EMAIL_ADMINS.some((a) => a.toLowerCase() === email)
}

export function accessState() {
  return { premiumRequis: true, message: MESSAGE_PREMIUM }
}

/** État d'accès complet pour un utilisateur (éventuellement anonyme). */
export async function etatUtilisateur(user) {
  const offre = offrePremium()
  const base = {
    ...accessState(),
    statut: STATUTS.STANDARD,
    abonne: false,
    admin: false,
    finAbonnement: null,
    joursRestants: 0,
    paiementDisponible: fedapayConfigure() && abonnementsConfigures(),
    abonnement: { montant: offre.montant, devise: offre.devise, dureeJours: offre.dureeJours },
    offre,
    fonctionnalites: fonctionnalitesPour({ premiumActif: false }),
  }
  if (estAdmin(user)) {
    return {
      ...base,
      statut: STATUTS.ADMIN,
      abonne: true,
      admin: true,
      message: 'Accès administrateur : toutes les fonctionnalités, sans abonnement.',
      fonctionnalites: fonctionnalitesPour({ premiumActif: true }),
    }
  }
  if (!user || !abonnementsConfigures()) return base
  try {
    const ab = await abonnementActif(user.id)
    if (ab) {
      return {
        ...base,
        statut: STATUTS.PREMIUM,
        abonne: true,
        finAbonnement: ab.fin,
        joursRestants: Math.max(0, Math.ceil((new Date(ab.fin) - Date.now()) / JOUR)),
        message: `Abonnement Premium actif jusqu'au ${fmt(ab.fin)}.`,
        fonctionnalites: fonctionnalitesPour({ premiumActif: true }),
      }
    }
  } catch (e) {
    console.error('[access] lecture abonnement :', e.message)
  }
  return base
}

/** Échoue « fermé » : sans session valide → 401, sans abonnement actif → 402. Les administrateurs passent. */
export async function requirePremium(req, res, next) {
  const st = accessState()
  if (!req.user) return res.status(401).json({ error: 'auth_requise', ...st })
  if (estAdmin(req.user)) return next()
  if (!abonnementsConfigures()) return res.status(503).json({ error: 'abonnements_non_configures', ...st })
  try {
    if (await abonnementActif(req.user.id)) return next()
  } catch (e) {
    console.error('[access] lecture abonnement :', e.message)
    return res.status(503).json({ error: 'abonnements_indisponibles' })
  }
  return res.status(402).json({ error: 'premium_required', ...st, offre: offrePremium() })
}
