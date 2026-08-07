// data/lotA.js
// Tables génériques du Lot A — Recherche : Fondations (Koty Maxwell &
// Kpoïté Dossou Samuel, août 2026), indépendantes de la zone géotechnique.
// Ces valeurs sont indicatives et modifiables — voir l'avertissement
// méthodologique du document source : elles servent de base par défaut à
// l'estimation, avec recommandation d'étude géotechnique avant exécution.
//
// Règle de choix des valeurs par défaut : quand le Lot A donne une fourchette
// (ex. « 15 à 20 cm »), le moteur retient le MILIEU de la fourchette comme
// valeur par défaut éditable — ni le plus optimiste ni le plus conservateur,
// cohérent avec le principe déjà appliqué aux dosages/prix (Lot D/E).

// ── §2.2 — Seuils de classification de la contrainte admissible ────────────
// bonne ≥ 2 bar · moyenne : [1 ; 2[ bar · faible < 1 bar
export const SEUILS_CONTRAINTE = { bonne: 2.0, moyenne: 1.0 }

// ── §3.1 — Profondeur d'ancrage minimale recommandée, par contexte de sol ──
export const CONTEXTES_SOL = {
  stable: {
    label: 'Sol sableux/latéritique stable, hors zone argileuse',
    profondeurAncrage: { min: 0.40, max: 0.50, defaut: 0.45, unite: 'm', note: 'sous terrain naturel décapé' },
  },
  argileux: {
    label: 'Sol argileux avec risque de retrait-gonflement saisonnier',
    profondeurAncrage: { min: 0.80, max: 1.00, defaut: 0.90, unite: 'm', note: 'sous terrain naturel décapé' },
  },
  nappe_proche: {
    label: 'Présence de nappe phréatique proche (zone côtière/lagunaire)',
    profondeurAncrage: { min: 0.30, max: null, defaut: 0.30, unite: 'm', note: 'sous le niveau des plus basses eaux connues, ou radier' },
  },
}

// ── §3.2 à §3.4 — Débord de travail par type de fondation ───────────────────
// Semelle isolée (fouille en puits) : dimension semelle + débord de chaque côté.
// Semelle filante (fouille en rigole) : largeur semelle + débord de chaque côté.
// Radier (pleine fouille) : emprise + débord périphérique (bêche).
export const DEBORDS_TRAVAIL = {
  isolee:  { label: 'Semelle isolée — fouille en puits',        min: 0.15, max: 0.20, defaut: 0.175, unite: 'm' },
  filante: { label: 'Semelle filante — fouille en rigole',      min: 0.10, max: 0.15, defaut: 0.125, unite: 'm' },
  radier:  { label: 'Radier général — pleine fouille',          min: 0.20, max: 0.30, defaut: 0.25,  unite: 'm' },
}

// ── §3.4 — Couche de forme / matelas drainant sous radier en sol compressible ─
// Recommandé en zone lagunaire/côtière (sol compressible) ; sans objet ailleurs.
export const MATELAS_DRAINANT = {
  min: 0.20, max: 0.40, defaut: 0.30, unite: 'm',
  zonesConcernees: ['zone_côtière', 'zone_lagunaire'],
  note: 'Tout-venant compacté recommandé en zone lagunaire/côtière (sol compressible).',
}

// ── §2.2 — Table de décision : contrainte admissible × système constructif ──
// Résultat : { type (aligné sur SYSTEMES_FONDATION), variante, justification }
export const TABLE_DECISION = {
  bonne: {
    ossature: { type: 'isolees', variante: 'standard',  justification: "Sol de bonne portance (≥ 2 bar) et charges ponctuelles : semelles isolées sous chaque poteau." },
    murs:     { type: 'filante', variante: 'standard',  justification: "Sol de bonne portance (≥ 2 bar) et charges linéaires : semelles filantes continues sous les murs porteurs." },
    mixte:    { type: 'isolees', variante: 'mixte',     justification: "Sol de bonne portance (≥ 2 bar) : semelles isolées sous poteaux, complétées par des semelles filantes (longrines) sous les murs porteurs secondaires." },
  },
  moyenne: {
    ossature: { type: 'isolees', variante: 'elargie',   justification: "Sol de portance moyenne (1–2 bar) : semelles isolées à base élargie (majoration de la surface d'appui)." },
    murs:     { type: 'filante', variante: 'renforcee', justification: "Sol de portance moyenne (1–2 bar) : semelles filantes renforcées (largeur majorée)." },
    mixte:    { type: 'filante', variante: 'continue',  justification: "Sol de portance moyenne (1–2 bar) et structure mixte : semelles filantes continues reliant l'ensemble des points d'appui (effet radier partiel)." },
  },
  faible: {
    ossature: { type: 'radier', variante: 'standard',   justification: "Sol de faible portance (< 1 bar : vase, argile molle) : radier général, qui répartit la charge sur toute l'emprise du bâtiment." },
    murs:     { type: 'radier', variante: 'standard',   justification: "Sol de faible portance (< 1 bar : vase, argile molle) : radier général, qui répartit la charge sur toute l'emprise du bâtiment." },
    mixte:    { type: 'radier', variante: 'standard',   justification: "Sol de faible portance (< 1 bar : vase, argile molle) : radier général, qui répartit la charge sur toute l'emprise du bâtiment." },
  },
}

// Hors périmètre de calcul automatique du Lot A : au-delà de R+2 sur sol très
// faible portance, ou charges concentrées élevées → fondations profondes
// (pieux), à signaler comme « cas à faire étudier » plutôt qu'à chiffrer.
export const SEUIL_NIVEAUX_PIEUX = 3 // R+2 = 3 niveaux (RDC + 2 étages)
