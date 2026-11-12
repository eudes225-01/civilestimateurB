// src/constants.js
// Référentiels du moteur de calcul — types de murs, planchers, toitures,
// systèmes constructifs/de fondation, ratios d'acier, paramètres par défaut.
// Aucune logique de calcul ici : uniquement des données et deux utilitaires
// numériques partagés par tous les modules.

export const TVA = 0.18

export const round2 = (n) => Math.round((n || 0) * 100) / 100
export const num = (v, d = 0) => (v === '' || v === null || v === undefined || isNaN(+v) ? d : +v)

/**
 * Nombre d'occurrences d'un élément (champ `nb`).
 * Champ vide / absent / illisible → 1 (comportement historique : un élément saisi
 * sans nombre compte pour un). Un 0 saisi est RESPECTÉ : l'élément ne compte pas.
 * (Avant : `num(v, 1) || 1` transformait silencieusement 0 en 1.)
 */
export const qte = (v) => {
  if (v === '' || v === null || v === undefined || isNaN(+v)) return 1
  return Math.max(0, +v)
}

// Poids linéique des aciers HA, en kg/m, par diamètre (mm).
export const ACIER = { 6: 0.222, 8: 0.395, 10: 0.617, 12: 0.888, 14: 1.208, 16: 1.578, 20: 2.466, 25: 3.853 }

// Dosages des bétons et ouvrages (sacs de ciment de 50 kg et granulats, par m³ d'ouvrage).
// Valeurs historiques du moteur (Lot B) : béton armé 350 kg/m³ = 7 sacs ; propreté 150 kg/m³ = 3 sacs ;
// sable 0,40 m³ et gravier 0,80 m³ par m³ de béton frais (propreté et BA) ; banché 4 sacs/m³ ; moellons 2,5 sacs/m³.
export const DOSAGES = {
  ba350:     { cimentSacs: 7,   sableM3: 0.40, gravierM3: 0.80 },
  proprete:  { cimentSacs: 3,   sableM3: 0.40, gravierM3: 0.80 },
  banche:    { cimentSacs: 4 },
  moellons:  { cimentSacs: 2.5 },
  enduit:    { cimentSacsM2: 0.12, dosageKgM3: 350 },
}

// Ratios d'acier par élément, kg/m³ sauf hourdisM2 en kg/m² (A5).
// semelleFilante / semelleIsolee : ratio unique 50 scindé en deux (Lot B) —
// valeurs par défaut = milieu de la fourchette du document Lot C (35-50
// filante, 50-70 isolée). Porté depuis civilestimateurF.
//
// Oct. 2026 : poteau / poutre / chaînage / longrine / dalle pleine alignés sur
// la table du Lot C (milieu de fourchette, comme semelles) — décision de
// l'équipe : la table Lot C fait foi sur l'avant-métré manuel de Fès.
//   chaînages & poutres 80–100 → 90 ; poteaux 100–130 → 115 ; dalle 70–90 → 80.
// radier, linteau, dalleTP, hourdisM2 : hors table Lot C, inchangés.
export const RATIOS_ACIER_DEFAUT = {
  semelleFilante: 42, semelleIsolee: 60, chainage: 90, longrine: 90, radier: 80,
  poteau: 115, poutre: 90, linteau: 120,
  dallePleine: 80, dalleTP: 35, hourdisM2: 9,
  // Voiles (plan de coffrage) : hors table Lot C — valeur provisoire alignée sur
  // la dalle pleine (80), à valider par l'équipe puis à ajuster dans l'interface.
  voile: 80,
}

// ── Types de murs (A4) ─────────────────────────────────────────────────────
// Paramètres de pose PAR TYPE DE BLOC (tous modifiables via params.mortier.parType) :
//   blocsM2       nombre de blocs au m² (joints compris)
//   pertesKey     clé du pourcentage de pertes dans les paramètres projet
//   mortierM3M2   volume de mortier de pose par m² de mur (valeur historique unique : 0,022 m³/m²)
//   dosageKgM3    dosage du mortier de pose, kg de ciment par m³ de mortier (350 kg/m³ = 7 sacs de 50 kg)
//   blocsParSac   règle indicative « 1 sac de ciment pour N blocs » (défaut 70 ; utilisée seulement
//                 si params.mortier.mode === 'blocsParSac'). À ajuster selon la dimension du bloc,
//                 l'épaisseur des joints et la recette du mortier.
export const MORTIER_DEFAUT = { mortierM3M2: 0.022, dosageKgM3: 350, blocsParSac: 70 }
export const SAC_CIMENT_KG = 50
export const TYPES_MUR = {
  brique10: { lab: 'Cloison brique creuse 10', ep: 0.10, code: 'mur_brique10', blocsM2: 16.7, pertesKey: 'pertesBrique', ...MORTIER_DEFAUT },
  agglo10:  { lab: 'Agglos creux 10',           ep: 0.10, code: 'mur_agglo10',  blocsM2: 12.5, pertesKey: 'pertesAgglo',  ...MORTIER_DEFAUT },
  agglo15:  { lab: 'Agglos creux 15',           ep: 0.15, code: '6019…2241',    blocsM2: 12.5, pertesKey: 'pertesAgglo',  ...MORTIER_DEFAUT },
  agglo20:  { lab: 'Agglos creux 20 (porteur)', ep: 0.20, code: 'mur_agglo20',  blocsM2: 12.5, pertesKey: 'pertesAgglo',  ...MORTIER_DEFAUT },
}
// Catégories de murs (métré par ouvrage). Un mur appartient à UNE catégorie :
//   explicite (m.categorie) > soubassement > position (extérieur / mitoyen) > porteur/cloison selon le bloc.
export const CATEGORIES_MUR = {
  exterieur:    { lab: 'Murs extérieurs' },
  porteur:      { lab: 'Murs porteurs intérieurs' },
  cloison:      { lab: 'Cloisons intérieures' },
  mitoyen:      { lab: 'Murs mitoyens' },
  soubassement: { lab: 'Murs de soubassement' },
}
export const MURS_PORTEURS = ['agglo15', 'agglo20']

// ── Types de plancher par niveau (A3) ──────────────────────────────────────
// Types historiques conservés (compatibilité des projets enregistrés) :
//   hourdis15 / hourdis20 = corps creux dont la sous-face (poutrelles apparentes ou plane) n'est PAS précisée
//   → quantités inchangées, mais le statut « sous-face à confirmer » est remonté.
// Types précis (moteur v3) :
//   corpsCreuxApparent : poutrelles-hourdis, poutrelles apparentes en sous-face
//   corpsCreuxPlan     : poutrelles-hourdis, sous-face plane (poutrelles non apparentes)
//   nervuree           : dalle nervurée (exige entraxe + section des nervures saisis)
// Pour le corps creux : betonM2 = béton total (nervures + table de compression) en m³/m² ;
// tableM = épaisseur de la table de compression (le « +5 » de 15+5) ; entrevousM2 = entrevous/m²
// pertes incluses (hypothèse historique : 8,33 théoriques + ≈ 2 % pour 15+5).
export const CORPS_CREUX = {
  15: { lab: 'Corps creux 15+5', code: 'plancher_h15', haut: 0.15, tableM: 0.05, betonM2: 0.080, entrevousM2: 8.5 },
  20: { lab: 'Corps creux 20+5', code: 'plancher_h20', haut: 0.20, tableM: 0.05, betonM2: 0.095, entrevousM2: 7.0 },
}
export const TYPES_PLANCHER = {
  aucun:       { lab: 'Aucun plancher haut',         code: null },
  dallePleine: { lab: 'Dalle pleine BA',             code: '6019…2376' },
  hourdis15:   { lab: 'Hourdis 15+5 (corps creux, sous-face non précisée)', code: 'plancher_h15', betonM2: 0.080, entrevousM2: 8.5, corpsCreux: 15, sousFace: null },
  hourdis20:   { lab: 'Hourdis 20+5 (corps creux, sous-face non précisée)', code: 'plancher_h20', betonM2: 0.095, entrevousM2: 7.0, corpsCreux: 20, sousFace: null },
  corpsCreuxApparent: { lab: 'Corps creux — poutrelles apparentes en sous-face', code: null, corpsCreux: null, sousFace: 'apparent' },
  corpsCreuxPlan:     { lab: 'Corps creux — sous-face plane (poutrelles non apparentes)', code: null, corpsCreux: null, sousFace: 'plan' },
  nervuree:    { lab: 'Dalle nervurée',              code: '6019…2376' },
  dalleTP:     { lab: 'Dalle sur terre-plein',       code: 'dalle_tp' },
}
export const PLANCHERS_CORPS_CREUX = ['hourdis15', 'hourdis20', 'corpsCreuxApparent', 'corpsCreuxPlan']
// Planchers SUSPENDUS (coffrage de sous-face possible) ; dalleTP repose sur le sol : jamais de sous-face coffrée.
export const PLANCHERS_SUSPENDUS_COFFRES = ['dallePleine', 'nervuree']

// ── Toitures ────────────────────────────────────────────────────────────────
// `coef` = coefficient FORFAITAIRE appliqué à la surface en plan quand aucune pente n'est lue :
//   surface de couverture = surface projetée (avec débord) × coef.
// Il regroupe la pente géométrique de référence (1/cos α) et, pour tuiles / shingle, un forfait de
// recouvrement + pertes. Il ne contient PAS le débord (le débord est ajouté à la surface projetée).
//   bac      : pente ~30° → 1/cos 30° = 1,155 ; forfait 1,15 (recouvrement et pertes non ajoutés)
//   tuiles   : pente ~35° → 1/cos 35° = 1,22 ; forfait 1,30 (≈ +6 % recouvrement / pertes)
//   shingle  : pente ~30° → 1,155 ; forfait 1,20 (≈ +4 % pertes de coupe)
//   terrasse : 1,00 (plat)
export const TOITURES = {
  bac:      { lab: 'Tôle bac aluzinc + charpente bois', coef: 1.15, code: 'toit_bac',      pente: '2 pans, ~30°', coefGeom: 1.155, forfaitSup: 'aucun (1,15 ≈ 1/cos 30°)' },
  tuiles:   { lab: 'Tuiles + charpente bois',           coef: 1.30, code: 'toit_tuiles',   pente: '4 pans, ~35°', coefGeom: 1.221, forfaitSup: '≈ +6 % recouvrement / pertes' },
  shingle:  { lab: 'Bardeaux bitumés (shingle)',        coef: 1.20, code: 'toit_shingle',  pente: '2 pans, ~30°', coefGeom: 1.155, forfaitSup: '≈ +4 % pertes de coupe' },
  terrasse: { lab: 'Toit-terrasse (étanchéité)',        coef: 1.00, code: 'toit_terrasse', pente: 'Plat / accessible', coefGeom: 1.0, forfaitSup: 'aucun' },
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
  // Terrassement (Lot B) : Cf = foisonnement, Cp = tassement/compactage.
  // Défaut = "Terre de barre" (sol le plus courant en zone centre du Bénin) ;
  // saisi / modifié par l'utilisateur — le moteur ne le déduit d'aucune ville.
  // Porté depuis civilestimateurF.
  terrassement: { sol: 'Terre de barre', cf: 1.25, cp: 1.15, bloquant: false },
}

// ── Modes de chiffrage du DQE ────────────────────────────────────────────────
//   compose    : prix unitaire « fourniture + main-d'œuvre + matériel » par ouvrage. Les composants
//                (acier, coffrage, granulats, ciment) restent visibles dans la liste des matériaux
//                et dans le DQE (lignes « inclus »), mais ne sont PAS ajoutés une 2ᵉ fois au total.
//   decompose  : béton (mise en œuvre), ciment, granulats, acier, coffrage sont chiffrés séparément ;
//                le poste global « béton armé complet » n'est alors plus facturé.
export const MODES_CHIFFRAGE = {
  compose:   { lab: 'Prix composés (fourniture + pose + main-d\'œuvre par ouvrage)' },
  decompose: { lab: 'Prix décomposés (béton, ciment, granulats, acier et coffrage chiffrés séparément)' },
}
export const MODE_CHIFFRAGE_DEFAUT = 'compose'
// Bornes admises pour le coefficient K (aléas + frais généraux + bénéfice) ; hors bornes → alerte bloquante
// sauf si params.autoriserKHorsBornes === true.
export const K_BORNES = { min: 1.0, max: 2.0 }

// Mode de calcul du ciment de pose : règle du document de référence « Métrés en bâtiment » (problème 2) —
// 1 sac de ciment monte 70 agglos : N_sacs = N_agglos / 70. Le mode 'volume' (volume de mortier × dosage)
// reste disponible (params.mortier.mode = 'volume').
export const MORTIER_MODE_DEFAUT = 'blocsParSac'
// Déduction de hauteur des murs (problème 1) : H_net = Ht − Hs − Hbp − n·ec, où Hs = hauteur des semelles
// isolées, Hbp = hauteur du béton de propreté, ec = épaisseur d'un chaînage, n = nombre de chaînages (2).
// DÉSACTIVÉE par défaut : n'activez que si la hauteur saisie du mur est la hauteur TOTALE (sinon double déduction).
export const DEDUCTION_HAUTEUR_DEFAUT = { actif: false, Hs: 0, Hbp: 0, ec: 0.2, nChainages: 2 }
// Pertes sur entrevous/hourdis quand leurs dimensions sont saisies (document : marge de 5 à 10 %).
export const PERTES_HOURDIS_DEFAUT = 5

export const PARAMS_DEFAUT = {
  modeChiffrage: MODE_CHIFFRAGE_DEFAUT,
  deductionHauteur: { ...DEDUCTION_HAUTEUR_DEFAUT },
  pertesHourdis: PERTES_HOURDIS_DEFAUT,
  // Mortier de pose : mode 'blocsParSac' (défaut : 1 sac pour 70 blocs, par type de bloc) ou
  // 'volume' (volume de mortier × dosage — formule historique). parType : surcharges par type de bloc.
  mortier: { mode: MORTIER_MODE_DEFAUT, parType: {} },
  // Forme de dallage en béton de propreté 150 kg/m³ : indépendante de la dalle, une seule fois au RDC.
  formeDallage: { actif: false, surface: null, epaisseur: null, eauCimentRatio: null },
  systeme: 'murs',
  Hetage: 3, epDalle: 0.15, K: 1.30, toiture: 'bac',
  // Scénario toiture : aucune, estimation sans plan, plan à déposer ; null impose confirmation.
  toiturePresence: null, acrotereHauteur: 0.40,
  pertesAgglo: 7, pertesBrique: 8,
  ratiosAcier: { ...RATIOS_ACIER_DEFAUT },
  linteau: { b: 0.20, h: 0.25, appui: 0.20 },
  ouv: { pL: 0.90, pH: 2.10, fL: 1.20, fH: 1.20 },
  emprise: null,
  // Chaînage haut (Lot C / fiche Eurocode §3.C) : obligatoire dès qu'il y a de
  // la maçonnerie porteuse, section mini 15×20 cm. Appliqué à chaque niveau
  // porteur hors système « ossature » ; désactivable (actif:false) si les
  // poutres de ceinture sont déjà saisies en poutres.
  chainageHaut: { actif: true, b: 0.20, h: 0.20 },
  // Largeur par défaut d'un poteau traversant un mur (déduction §2A Lot C).
  largPoteau: 0.20,
  fondation: { ...FONDATION_DEFAUT },
  planFlags: {},      // renseigné par la lecture de plan (ex : toitTerrasseDetecte)
  // Confirmations par donnée : { [cle]: { etat: 'confirmee'|'corrigee', valeur, par, date } }.
  // Une donnée sans confirmation est « à confirmer » (voir couverture.js). Trace interne : jamais dans le PDF client.
  confirmations: {},
  faces2: true,       // legacy
}
