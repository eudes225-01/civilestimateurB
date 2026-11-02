// src/middleware/access.js
// Accès et crédits CST. Tout compte connecté (statut « standard ») accède gratuitement aux projets, au métré,
// aux prix, au DQE et à l'export PDF. Seule la LECTURE AUTOMATIQUE DES PLANS (/api/analyse-plan) consomme des
// crédits CST, au nombre de tokens traités (voir services/lectures.js). Un administrateur a le statut « admin » :
// il n'est jamais débité. Avec APP_GRATUITE=oui (version gratuite), plus aucun crédit n'est exigé ni débité.
//
// Le solde est lu côté serveur dans Supabase (tables écrites uniquement par le backend : webhook / confirmation
// FedaPay, lectures) pour l'utilisateur identifié par son jeton de session. Aucun en-tête fourni par le client
// ne vaut preuve de solde.
import { env } from '../config/env.js'
import { creditsConfigures, dernierAchat, soldeUtilisateur } from '../services/credits.js'
import { fedapayConfigure } from '../services/fedapay.js'
import { forfaits, tarifPublic, USAGES_CREDITS } from '../services/tarifs.js'

/**
 * Administrateur : adresse e-mail (confirmée) listée dans EMAIL_ADMIN. Aucun crédit à acheter.
 * L'adresse doit être vérifiée par Supabase, pour qu'on ne puisse pas s'en prévaloir sans la posséder.
 */
export function estAdmin(user) {
  const email = String(user?.email || '').trim().toLowerCase()
  if (!email || !user?.emailVerifie) return false
  return env.EMAIL_ADMINS.some((a) => a.toLowerCase() === email)
}

export function accessState() {
  if (env.APP_GRATUITE) {
    return { creditsRequis: false, gratuite: true, message: 'Version gratuite : toutes les fonctionnalités, lecture de plans comprise, sont ouvertes à tout compte connecté.', usagesCredits: [], minimumLecture: 0, forfaits: [], tarif: null }
  }
  return {
    creditsRequis: true,
    message: 'La lecture automatique des plans consomme des crédits CST, selon les tokens traités.',
    usagesCredits: USAGES_CREDITS,
    minimumLecture: env.CST_MINIMUM_LECTURE,
    forfaits: forfaits(),
    tarif: tarifPublic(),
  }
}

/** État d'accès complet pour un utilisateur (éventuellement anonyme). */
export async function etatUtilisateur(user) {
  const base = {
    ...accessState(),
    statut: 'standard', // standard | admin
    admin: false,
    solde: 0,
    aDejaAchete: false,
    paiementDisponible: fedapayConfigure() && creditsConfigures(),
    devise: 'XOF',
  }
  // Les administrateurs sont distingués dans les DEUX modes (jamais débités, statut « admin »).
  if (estAdmin(user)) return { ...base, admin: true, statut: 'admin', paiementDisponible: base.paiementDisponible && !env.APP_GRATUITE, message: 'Accès administrateur : lecture de plans sans crédits.' }
  if (env.APP_GRATUITE) return { ...base, statut: 'gratuit', paiementDisponible: false }
  if (!user || !creditsConfigures()) return base
  try {
    const [solde, achat] = await Promise.all([soldeUtilisateur(user.id), dernierAchat(user.id)])
    return { ...base, solde, aDejaAchete: !!achat }
  } catch (e) {
    console.error('[access] lecture du solde :', e.message)
    return { ...base, soldeIndisponible: true }
  }
}

/** Connexion exigée (même quand REQUIRE_AUTH est désactivé en développement) : on doit savoir à qui rattacher le solde. */
export function exigerUtilisateur(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'auth_requise', ...accessState() })
  return next()
}

/** Échoue « fermé » : sans base de crédits configurée, la lecture payante est indisponible (503), sauf pour un administrateur. */
export function exigerCredits(req, res, next) {
  if (env.APP_GRATUITE || estAdmin(req.user) || creditsConfigures()) return next()
  return res.status(503).json({ error: 'credits_non_configures', ...accessState() })
}
