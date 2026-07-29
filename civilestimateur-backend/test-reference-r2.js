// test-reference-r2.js
// « Règle d'or » du rapport d'insuffisances : l'avant-métré manuel du R+2 de Fès
// sert de jeu de tests de référence. Chaque évolution du moteur doit reproduire
// ses quantités à ±5 % (±10 % pour les postes approximés à la saisie).
//   node test-reference-r2.js   (ou : npm test)

const { metrerProjet } = require('./lib/metre')

// ── Données de référence : R+2 mixte (commerces + habitation), Fès ──────────
// Fondations : 15 semelles isolées S1–S4 à −1,50 m + chaînages + longrines
// + gros béton banché + moellons + fouille en pleine masse (avant-métré manuel).
const fondation = {
  type: 'isolees',
  profFouille: 1.5,
  epProprete: 0.10,
  pleineMasse: { actif: true, surface: 14.01 * 8, prof: 0.5 },   // 56,04 m³
  semelles: [
    // fouille L×l ; béton Lba×lba×h (dimensions distinctes, comme au métré manuel)
    { type: 'S1', nb: 3, L: 1.15, l: 1.15, prof: 1.5, Lba: 1.05, lba: 1.05, h: 0.25 },
    { type: 'S2', nb: 5, L: 1.40, l: 1.30, prof: 1.5, Lba: 1.20, lba: 1.20, h: 0.30 },
    { type: 'S3', nb: 3, L: 1.70, l: 1.70, prof: 1.5, Lba: 1.50, lba: 1.50, h: 0.40 },
    { type: 'S4', nb: 4, L: 2.50, l: 1.40, prof: 1.5, Lba: 1.20, lba: 2.40, h: 0.40 },
  ],
  avantPoteaux: [
    { nb: 1,  a: 0.5, b: 0.25, H: 1.15 },
    { nb: 2,  a: 0.5, b: 0.25, H: 1.00 },
    { nb: 6,  a: 0.3, b: 0.25, H: 1.10 },
    { nb: 12, a: 0.3, b: 0.25, H: 1.00 },
    { nb: 2,  a: 0.3, b: 0.25, H: 1.15 },
  ],
  chainages: [
    { nom: 'CH1 Axe A', nb: 1, L: 7.57, bF: 0.6, prof: 1.5, b: 0, h: 0 },
    { nom: 'CH1 Axe E', nb: 1, L: 7.35, bF: 0.6, prof: 1.5, b: 0, h: 0 },
    { nom: 'CH2 Fil 1', nb: 1, L: 4.40, bF: 0.6, prof: 1.5, b: 0, h: 0 },
    { nom: 'CH2 Fil 8', nb: 1, L: 3.00, bF: 0.6, prof: 1.5, b: 0, h: 0 },
  ],
  longrines: [
    { nom: 'L1',  nb: 1, L: 2.41, bF: 0.6, prof: 1.5, b: 0, h: 0 },
    { nom: 'L2',  nb: 1, L: 2.09, bF: 0.6, prof: 1.5, b: 0, h: 0 },
    { nom: 'L3',  nb: 1, L: 0.56, bF: 0.6, prof: 1.5, b: 0, h: 0 },
    { nom: 'L4',  nb: 2, L: 1.35, bF: 0.6, prof: 1.5, b: 0, h: 0 },
    { nom: 'L5',  nb: 2, L: 1.06, bF: 0.6, prof: 1.5, b: 0, h: 0 },
    { nom: 'L6',  nb: 1, L: 1.97, bF: 0.6, prof: 1.5, b: 0, h: 0 },
    { nom: 'L7',  nb: 1, L: 1.82, bF: 0.6, prof: 1.5, b: 0, h: 0 },
    { nom: 'L8',  nb: 1, L: 0.65, bF: 0.6, prof: 1.5, b: 0, h: 0 },
    { nom: 'L9',  nb: 1, L: 1.00, bF: 0.6, prof: 1.5, b: 0, h: 0 },
    { nom: 'L10', nb: 1, L: 1.67, bF: 0.6, prof: 1.5, b: 0, h: 0 },
    { nom: 'L11', nb: 1, L: 1.27, bF: 0.6, prof: 1.5, b: 0, h: 0 },
  ],
  banche:   { actif: true, b: 0.40, h: 0.95 },  // sous longrines
  moellons: { actif: true, b: 0.50, h: 1.25 },  // sous chaînages
  arase: true,
  herisson: { actif: true, surface: 113.20 },
}

const levels = [
  {
    nom: 'Rez-de-chaussée (commerces)', rez: true, HSP: 4.0,
    plancher: 'hourdis15', surfPlancher: 94.03,
    pieces: [], murs: [],
    poteaux: [
      { nom: 'P1', nb: 20, a: 0.30, b: 0.25, H: 4.2 },
      { nom: 'P2', nb: 2,  a: 0.50, b: 0.25, H: 4.2 },
      { nom: 'R',  nb: 2,  a: 0.30, b: 0.25, H: 4.2 },
    ],
    poutres: [{ nom: 'Poutres RDC (agrégé)', nb: 1, L: 74.94, b: 0.25, h: 0.40 }], // ≈ 7,494 m³
  },
  {
    nom: '1er étage', HSP: 2.9,
    plancher: 'hourdis15', surfPlancher: 74.28,
    poteaux: [
      { nom: 'P1+P2', nb: 15, a: 0.30, b: 0.25, H: 3.1 },
      { nom: 'R',     nb: 2,  a: 0.30, b: 0.25, H: 3.1 },
    ],
    poutres: [{ nom: 'Poutres étage (agrégé)', nb: 1, L: 73.68, b: 0.25, h: 0.40 }], // ≈ 7,368 m³
  },
  {
    nom: '2e étage', HSP: 2.9,
    plancher: 'hourdis15', surfPlancher: 74.28,
    poteaux: [
      { nom: 'P1+P2', nb: 15, a: 0.30, b: 0.25, H: 3.1 },
      { nom: 'R',     nb: 2,  a: 0.30, b: 0.25, H: 3.1 },
    ],
    poutres: [{ nom: 'Poutres étage (agrégé)', nb: 1, L: 73.68, b: 0.25, h: 0.40 }],
  },
]

const params = {
  systeme: 'ossature',
  toiture: 'terrasse',
  emprise: 14.01 * 8.08, // 113,20 m²
  fondation,
  planFlags: { toitTerrasseDetecte: true },
}

// ── Exécution ────────────────────────────────────────────────────────────────
const { totaux, alertes } = metrerProjet(levels, params)
const f = totaux.fondation

// Valeurs de référence (avant-métré manuel R+2 Fès)
const REF = [
  //  libellé                                  obtenu                                        attendu   tolérance
  ['Fouilles puits/rigoles/tranchées (m³)',    f.volFouilles,                                 89.75,   0.05],
  ['Fouille en pleine masse (m³)',             f.volPleineMasse,                              56.04,   0.01],
  ['Béton de propreté (m³)',                   f.volProprete,                                  5.92,   0.05],
  ['BA fondations semelles+av.-poteaux (m³)',  f.volBAsemelles + f.volBAavantPoteaux,         12.17,   0.05],
  ['Gros béton banché (m³)',                   f.volBanche,                                    6.94,   0.05],
  ['Moellons en fondation (m³)',               f.volMoellons,                                 13.81,   0.05],
  ['BA poteaux + raidisseurs (m³)',            totaux.volPoteaux,                             15.89,   0.02],
  ['BA poutres (m³)',                          totaux.volPoutres,                             22.23,   0.02],
  ['Planchers hourdis 15+5 (m²)',              totaux.surfHourdis,                           242.59,   0.01],
  ['Étanchéité toiture-terrasse (m²)',         totaux.surfToiture,                            74.28,   0.01],
]

let ok = 0, ko = 0
console.log('══ Test de référence R+2 Fès — moteur v2 ══\n')
REF.forEach(([lib, got, want, tol]) => {
  const ecart = Math.abs(got - want) / want
  const pass = ecart <= tol
  pass ? ok++ : ko++
  console.log(`${pass ? '✔' : '✘'} ${lib.padEnd(44)} obtenu ${String(got).padStart(8)}  attendu ${want}  (écart ${(ecart * 100).toFixed(1)} %, tol. ±${tol * 100} %)`)
})

// Acier : contre-calcul du rapport ≈ 7,5–8 t (ratios par élément)
const acierOK = totaux.acierKg >= 6800 && totaux.acierKg <= 9200
acierOK ? ok++ : ko++
console.log(`${acierOK ? '✔' : '✘'} ${'Acier HA total (kg) dans [6 800 ; 9 200]'.padEnd(44)} obtenu ${totaux.acierKg}  (rapport : ≈ 7 500–8 000 kg)`)

// Garde-fous : le paramétrage cohérent ne doit lever aucune alerte bloquante
const bloquantes = alertes.filter((a) => a.niveau === 'bloquante')
const alertOK = bloquantes.length === 0
alertOK ? ok++ : ko++
console.log(`${alertOK ? '✔' : '✘'} Aucune alerte bloquante sur données cohérentes (${alertes.length} alerte(s) au total)`)
alertes.forEach((a) => console.log(`    [${a.niveau}] ${a.msg}`))

// Garde-fou toiture : sélectionner « tôle » sur ce plan doit lever une alerte bloquante
const { alertes: alertesToit } = metrerProjet(levels, { ...params, toiture: 'bac' })
const toitAlerte = alertesToit.some((a) => a.niveau === 'bloquante' && /TOIT-TERRASSE/i.test(a.msg))
toitAlerte ? ok++ : ko++
console.log(`${toitAlerte ? '✔' : '✘'} Alerte bloquante « tôle sélectionnée / terrasse détectée » bien levée (cas B4 du rapport)`)

console.log(`\n${ko === 0 ? 'SUCCÈS' : 'ÉCHEC'} — ${ok} test(s) passés, ${ko} échoué(s).`)
process.exit(ko === 0 ? 0 : 1)
