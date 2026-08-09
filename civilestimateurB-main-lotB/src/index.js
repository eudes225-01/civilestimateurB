// src/index.js
// API publique de civilestimateur-engine — source de vérité unique du moteur
// de calcul CivilEstimator (métré, DQE, sous-détail, recommandations
// géotechniques Lot A). Consommée par le backend (import relatif, même
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

// ── DQE & sous-détail ─────────────────────────────────────────────────────
export { buildDQE, surfacePignon } from './dqe.js'
export { buildSousDetail, COMPOSANTES } from './sousDetail.js'

// ── Lot A — recommandations géotechniques (fondations) ───────────────────
export {
  resolveZone, classifierContrainte,
  resolveContrainteAdmissible, resolveContexteSol,
  suggererProfondeurAncrage, suggererDebordTravail, suggererMatelasDrainant,
  recommanderTypeFondation, recommanderFondationProjet,
} from './fondationsLotA.js'
export {
  SEUILS_CONTRAINTE, CONTEXTES_SOL, DEBORDS_TRAVAIL, MATELAS_DRAINANT,
  TABLE_DECISION, SEUIL_NIVEAUX_PIEUX,
} from '../data/lotA.js'

// ── Données de référence ──────────────────────────────────────────────────
export { PRIX, PRIX_VERSION, PRIX_DATE } from '../data/prix.js'
export { FONDATIONS } from '../data/fondations.js'
