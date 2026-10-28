// src/index.js
// API publique de civilestimateur-engine — source de vérité unique du moteur
// de calcul CivilEstimator (métré, DQE, sous-détail, plans par type).
// Consommée par le backend (import relatif, même
// dépôt) et par le frontend (dépendance Git vers ce dépôt).
//
// Refonte août 2026 : ce module remplace l'ancien duo divergent
// frontend/src/lib/metre.js (ESM) ↔ backend/lib/metre.js (CJS, copié à la
// main). Toute évolution du moteur se fait ici, une seule fois.

// ── Référentiels ─────────────────────────────────────────────────────────
export {
  TVA, ACIER, RATIOS_ACIER_DEFAUT,
  TYPES_MUR, MURS_PORTEURS, TYPES_PLANCHER, TOITURES,
  SYSTEMES_FONDATION, SYSTEMES_CONSTRUCTIFS,
  FONDATION_DEFAUT, PARAMS_DEFAUT,
  round2, num,
} from './constants.js'

// ── Moteur de calcul ─────────────────────────────────────────────────────
export { mursDepuisPieces, metrerMurs } from './murs.js'
export { metrerLinteaux } from './linteaux.js'
export { metrerNiveau } from './niveau.js'
export { metrerFondation } from './fondations.js'
export { metrerProjet } from './projet.js'
export { validerCoherence } from './validation.js'
export { lireIFC } from './ifc.js'
export {
  ETATS, evaluerCouverture, parametresEffectifs, enregistrerConfirmation, retirerConfirmation,
  montantsIncomplets, exportAutorise,
} from './couverture.js'

// ── Plans par type (codification des plans techniques BTP) ───────────────
export { TYPES_PLANS, CLES_TYPES_PLANS, classifierPlan, routerPlan } from './typesPlans.js'
export {
  metrerPlomberie, RESEAUX_PLOMBERIE, APPAREILS_SANITAIRES, normaliserAppareil, normaliserReseau,
  DIAMETRES_PLOMBERIE, PENTES_EVACUATION, diametresPour, lacunesPlomberie,
} from './plomberie.js'
export { metrerElectricite, TYPES_ELECTRIQUES, normaliserElementElec } from './electricite.js'
export { metrerToiture } from './toiture.js'

// ── DQE & sous-détail ─────────────────────────────────────────────────────
export { buildDQE, surfacePignon } from './dqe.js'
export { buildSousDetail, COMPOSANTES } from './sousDetail.js'

// ── Données de référence ──────────────────────────────────────────────────
export { PRIX, PRIX_VERSION, PRIX_DATE } from '../data/prix.js'
