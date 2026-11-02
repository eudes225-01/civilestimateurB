// src/services/tarifs.js
// Tarification des crédits CST (CivilEstimator) — fonctions pures, sans réseau :
//   • forfaits d'achat (montants FCFA fixés côté serveur) et crédits obtenus,
//   • coût d'une lecture de plans en fonction des tokens réellement traités par le service d'analyse,
//   • réserve bloquée pendant un appel, le temps de connaître son coût réel.
import { env } from '../config/env.js'

const MILLION = 1_000_000

/** Plafond d'entrée (tokens) pris en compte pour la réserve d'un appel : un plan en image + les consignes. */
export const ENTREE_RESERVE_TOKENS = 30000

/** À quoi servent les crédits (affiché dans la fenêtre d'achat, l'e-mail et le PDF de confirmation). */
export const USAGES_CREDITS = [
  { cle: 'lecture_plans', libelle: 'Lecture automatique des plans (fondation, coupe, toiture, plomberie, électricité…), facturée selon le nombre de tokens traités' },
]

export const creditsPourMontant = (montant) => Math.round(Number(montant) * env.CST_PAR_FCFA)

/** Forfaits proposés : [{ montant (FCFA), credits (CST) }]. */
export const forfaits = () => env.CST_FORFAITS.map((montant) => ({ montant, credits: creditsPourMontant(montant) }))

/** Un montant est-il l'un des forfaits ? (le client ne choisit jamais un prix libre) */
export const forfaitValide = (montant) => env.CST_FORFAITS.includes(Number(montant))

/**
 * Coût en CST d'un appel, d'après l'usage renvoyé par l'API d'analyse.
 * Arrondi au CST supérieur ; toujours au moins 1 CST pour un appel réussi.
 */
export function coutTokens({ entree = 0, sortie = 0 } = {}) {
  const e = Math.max(0, Number(entree) || 0)
  const s = Math.max(0, Number(sortie) || 0)
  return Math.max(1, Math.ceil((e * env.CST_PRIX_ENTREE_MILLION + s * env.CST_PRIX_SORTIE_MILLION) / MILLION))
}

/** Réserve bloquée avant chaque appel : coût maximal plausible (sortie maximale + entrée plafonnée). */
export const reserveAppel = () => Math.ceil((env.ANTHROPIC_MAX_TOKENS * env.CST_PRIX_SORTIE_MILLION + ENTREE_RESERVE_TOKENS * env.CST_PRIX_ENTREE_MILLION) / MILLION)

/** Tarif tel qu'affiché au client. */
export const tarifPublic = () => ({ entreeMillion: env.CST_PRIX_ENTREE_MILLION, sortieMillion: env.CST_PRIX_SORTIE_MILLION })
