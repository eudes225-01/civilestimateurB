// src/constants.js
// Référentiels du moteur de calcul — types de murs, planchers, toitures,
// systèmes constructifs/de fondation, ratios d'acier, paramètres par défaut.
// Aucune logique de calcul ici : uniquement des données et deux utilitaires
// numériques partagés par tous les modules.

export const TVA = 0.18

export const round2 = (n) => Math.round((n || 0) * 100) / 100
export const num = (v, d = 0) => (v === '' || v === null || v === undefined || isNaN(+v) ? d : +v)

// Poids linéique des aciers HA, en kg/m, par diamètre (mm).
export const ACIER = { 6: 0.222, 8: 0.395, 10: 0.617, 12: 0.888, 14: 1.208, 16: 1.578, 20: 2.466, 25: 3.853 }

// Ratios d'acier par élément, kg/m³ sauf hourdisM2 en kg/m² (A5).
// semelleFilante / semelleIsolee : ratio unique 50 scindé en deux (Lot B) —
// valeurs par défaut = milieu de la fourchette du document Lot C (35-50
// filante, 50-70 isolée), cohérent avec la méthode déjà appliquée aux
// recommandations Lot A (fondationsLotA.js). Porté depuis civilestimateurF.
export const RATIOS_ACIER_DEFAUT = {
  semelleFilante: 42, semelleIsolee: 60, chainage: 100, longrine: 100, radier: 80,
  poteau: 150, poutre: 130, linteau: 120,
  dallePleine: 90, dalleTP: 35, hourdisM2: 9,
}

// ── Types de murs (A4) ─────────────────────────────────────────────────────
export const TYPES_MUR = {
  brique10: { lab: 'Cloison brique creuse 10', ep: 0.10, code: 'mur_brique10', blocsM2: 16.7, pertesKey: 'pertesBrique' },
  agglo10:  { lab: 'Agglos creux 10',           ep: 0.10, code: 'mur_agglo10',  blocsM2: 12.5, pertesKey: 'pertesAgglo'  },
  agglo15:  { lab: 'Agglos creux 15',           ep: 0.15, code: '6019…2241',    blocsM2: 12.5, pertesKey: 'pertesAgglo'  },
  agglo20:  { lab: 'Agglos creux 20 (porteur)', ep: 0.20, code: 'mur_agglo20',  blocsM2: 12.5, pertesKey: 'pertesAgglo'  },
}
export const MURS_PORTEURS = ['agglo15', 'agglo20']

// ── Types de plancher par niveau (A3) ──────────────────────────────────────
export const TYPES_PLANCHER = {
  aucun:       { lab: 'Aucun plancher haut',         code: null },
  dallePleine: { lab: 'Dalle pleine BA',             code: '6019…2376' },
  hourdis15:   { lab: 'Hourdis 15+5 (corps creux)',  code: 'plancher_h15', betonM2: 0.080, entrevousM2: 8.5 },
  hourdis20:   { lab: 'Hourdis 20+5 (corps creux)',  code: 'plancher_h20', betonM2: 0.095, entrevousM2: 7.0 },
  dalleTP:     { lab: 'Dalle sur terre-plein',       code: 'dalle_tp' },
}

// ── Toitures ────────────────────────────────────────────────────────────────
export const TOITURES = {
  bac:      { lab: 'Tôle bac aluzinc + charpente bois', coef: 1.15, code: 'toit_bac',      pente: '2 pans, ~30°' },
  tuiles:   { lab: 'Tuiles + charpente bois',           coef: 1.30, code: 'toit_tuiles',   pente: '4 pans, ~35°' },
  shingle:  { lab: 'Bardeaux bitumés (shingle)',        coef: 1.20, code: 'toit_shingle',  pente: '2 pans, ~30°' },
  terrasse: { lab: 'Toit-terrasse (étanchéité)',        coef: 1.00, code: 'toit_terrasse', pente: 'Plat / accessible' },
}

// ── Systèmes (A1 / A2) ──────────────────────────────────────────────────────
export const SYSTEMES_FONDATION = {
  filante: { lab: 'Semelle filante sous murs porteurs' },
  isolees: { lab: 'Semelles isolées + chaînages / longrines' },
  radier:  { lab: 'Radier général' },
}
export const SYSTEMES_CONSTRUCTIFS = {
  murs:     { lab: 'Murs porteurs + chaînage' },
  ossature: { lab: 'Ossature poteaux-poutres' },
  mixte:    { lab: 'Mixte (murs porteurs + poteaux)' },
}

export const FONDATION_DEFAUT = {
  type: 'filante',
  semL: 0.40, semH: 0.20, profFouille: 0.60, epProprete: 0.05, lineaire: null,
  pleineMasse: { actif: false, surface: null, prof: 0.50 },
  semelles: [],      // { type:'S1', nb, L, l, h, prof, Lba, lba }
  avantPoteaux: [],  // { nb, a, b, H }
  chainages: [],     // { nom, nb, L, b, h, prof, bF }  (b×h = section BA)
  longrines: [],     // { nom, nb, L, b, h, prof, bF }
  banche:   { actif: false, b: 0.40, h: 0.95 },   // gros béton banché sous longrines
  moellons: { actif: false, b: 0.50, h: 1.25 },   // maçonnerie de moellons sous chaînages
  arase: true,
  herisson: { actif: false, surface: null },
  epRadier: 0.30,
  // ── Lot A (recherche fondations, août 2026) : géotechnique éditable ──────
  // Valeurs par défaut nulles = on utilise la fourchette de la zone (voir
  // fondationsLotA.js). L'utilisateur peut à tout moment surcharger ces deux
  // champs — la logique de sélection ne doit jamais figer une décision à sa
  // place (cas des sites en bas-fond, cf. Lot A §2.2).
  contrainteAdmissible: null,  // bar — override utilisateur, sinon défaut de zone
  contexteSol: null,           // 'stable' | 'argileux' | 'nappe_proche' — override utilisateur
  // Terrassement (Lot B) : Cf = foisonnement, Cp = tassement/compactage.
  // Défaut = "Terre de barre" (sol le plus courant en zone centre du Bénin) ;
  // à pré-remplir depuis data/fondations.js selon la ville choisie, sur le
  // même principe que les recommandations Lot A (jamais imposé, éditable).
  // Porté depuis civilestimateurF.
  terrassement: { sol: 'Terre de barre', cf: 1.25, cp: 1.15, bloquant: false },
}

export const PARAMS_DEFAUT = {
  systeme: 'murs',
  Hetage: 3, epDalle: 0.15, K: 1.30, toiture: 'bac',
  pertesAgglo: 7, pertesBrique: 8,
  ratiosAcier: { ...RATIOS_ACIER_DEFAUT },
  linteau: { b: 0.20, h: 0.25, appui: 0.20 },
  ouv: { pL: 0.90, pH: 2.10, fL: 1.20, fH: 1.20 },
  emprise: null,
  fondation: { ...FONDATION_DEFAUT },
  planFlags: {},      // renseigné par la lecture de plan (ex : toitTerrasseDetecte)
  faces2: true,       // legacy
}
