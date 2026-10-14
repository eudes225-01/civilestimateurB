// src/middleware/access.js
// Accès Premium = abonnement FedaPay actif. Deux fonctionnalités seulement sont verrouillées :
//   • les DÉPÔTS de plans (lecture automatique des plans → /api/analyse-plan),
//   • l'EXPORT PDF du devis (/api/pdf/devis).
// Tout le reste (projets, niveaux & métré, prix, DQE, calcul) est accessible à tout compte connecté
// (statut « standard »). Un abonnement actif donne le statut « premium » ; un administrateur a
// le statut « admin » et accède à 100 % des fonctionnalités sans payer.
//
// L'abonnement est vérifié côté serveur dans Supabase (table abonnements, écrite uniquement
// par le webhook / la confirmation FedaPay) pour l'utilisateur identifié par son jeton de
// session. Aucun en-tête fourni par le client ne vaut preuve d'abonnement.
import { env } from '../config/env.js'
import { abonnementActif, abonnementsConfigures } from '../services/abonnements.js'
import { fedapayConfigure } from '../services/fedapay.js'

const fmt = (d) => new Date(d).toLocaleDateString('fr-FR')

/**
 * Administrateur : adresse e-mail (confirmée) listée dans EMAIL_ADMIN. Aucun abonnement à payer.
 * L'adresse doit être vérifiée par Supabase, pour qu'on ne puisse pas s'en prévaloir sans la posséder.
 */
export function estAdmin(user) {
  const email = String(user?.email || '').trim().toLowerCase()
  if (!email || !user?.emailVerifie) return false
  return env.EMAIL_ADMINS.some((a) => a.toLowerCase() === email)
}

const MESSAGE_REQUIS = 'Abonnement Premium requis pour déposer des plans et exporter le PDF.'

/** Fonctionnalités réservées au Premium (affichées dans le récapitulatif de paiement). */
export const FONCTIONNALITES_PREMIUM = [
  { cle: 'depots', libelle: 'Dépôt et lecture automatique des plans (fondation, coupe, toiture, plomberie, électricité…)' },
  { cle: 'export_pdf', libelle: 'Export PDF professionnel du devis (logo, couleurs, mentions légales)' },
]

export function accessState() {
  return { premiumRequis: true, message: MESSAGE_REQUIS, fonctionnalitesPremium: FONCTIONNALITES_PREMIUM }
}

/** État d'accès complet pour un utilisateur (éventuellement anonyme). */
export async function etatUtilisateur(user) {
  const base = {
    ...accessState(),
    abonne: false,
    statut: 'standard', // standard | premium | admin
    debutAbonnement: null,
    finAbonnement: null,
    paiementDisponible: fedapayConfigure() && abonnementsConfigures(),
    abonnement: { montant: env.FEDAPAY_MONTANT, devise: 'XOF', dureeJours: env.FEDAPAY_DUREE_JOURS },
  }
  if (estAdmin(user)) return { ...base, abonne: true, admin: true, statut: 'admin', message: 'Accès administrateur : toutes les fonctionnalités, sans abonnement.' }
  if (!user || !abonnementsConfigures()) return base
  try {
    const ab = await abonnementActif(user.id)
    if (ab) {
      return { ...base, abonne: true, statut: 'premium', debutAbonnement: ab.debut || null, finAbonnement: ab.fin, message: `Abonnement Premium actif jusqu'au ${fmt(ab.fin)}.` }
    }
  } catch (e) {
    console.error('[access] lecture abonnement :', e.message)
  }
  return base
}

/** Échoue « fermé » : sans session valide → 401, sans abonnement actif → 402. */
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
  return res.status(402).json({ error: 'premium_required', ...st })
}
