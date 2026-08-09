// test/reference-r2.test.js
// « Règle d'or » du projet : l'avant-métré manuel du R+2 de Fès sert de jeu
// de tests de référence. Toute évolution du moteur doit reproduire ses
// quantités à ±5 % (±10 % pour les postes approximés à la saisie).
// Porté depuis l'ancien civilestimateur-backend/test-reference-r2.js lors de
// la refonte du moteur en package unique (voir src/index.js).
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { metrerProjet } from '../src/index.js'

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

describe('Référence R+2 Fès (moteur v2)', () => {
  const { totaux, alertes } = metrerProjet(levels, params)
  const f = totaux.fondation

  const REF = [
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

  REF.forEach(([lib, got, want, tol]) => {
    test(`${lib} — écart ≤ ±${tol * 100}%`, () => {
      const ecart = Math.abs(got - want) / want
      assert.ok(ecart <= tol, `obtenu ${got}, attendu ${want}, écart ${(ecart * 100).toFixed(1)}% > ±${tol * 100}%`)
    })
  })

  test('Acier HA total dans [6 800 ; 9 200] kg', () => {
    assert.ok(totaux.acierKg >= 6800 && totaux.acierKg <= 9200, `obtenu ${totaux.acierKg} kg`)
  })

  test('Aucune alerte bloquante sur données cohérentes', () => {
    const bloquantes = alertes.filter((a) => a.niveau === 'bloquante')
    assert.equal(bloquantes.length, 0, JSON.stringify(bloquantes))
  })

  test('Alerte bloquante « tôle sélectionnée / terrasse détectée » (cas B4)', () => {
    const { alertes: alertesToit } = metrerProjet(levels, { ...params, toiture: 'bac' })
    const toitAlerte = alertesToit.some((a) => a.niveau === 'bloquante' && /TOIT-TERRASSE/i.test(a.msg))
    assert.ok(toitAlerte)
  })
})
