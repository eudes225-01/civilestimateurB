// test/document-metres.test.js
// Formules du document de référence « Métrés en bâtiment — problèmes et formules de résolution » (v3),
// vérifiées sur des exemples chiffrés à la main.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { metrerProjet } from '../src/index.js'

const proche = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b} (±${tol})`)
const niv = (extra = {}) => ({ nom: 'RDC', rez: true, HSP: 3, surfPlancher: 100, plancher: 'aucun', ...extra })

describe('Problème 1 : S = (Ld − Lp) × (Ht − Hs − Hbp − 2·ec) − Sb', () => {
  // Ld = 40 m ; 4 poteaux de 0,2 m (Lp = 0,8 m) ; Ht = 3,6 m ; Hs = 0,4 ; Hbp = 0,1 ; ec = 0,2 ; 1 porte 0,9 × 2,1 (Sb = 1,89)
  const mur = { type: 'agglo20', position: 'exterieur', L: 40, H: 3.6, poteaux: 4, largPoteau: 0.2, portes: 1, pL: 0.9, pH: 2.1 }
  const ded = { actif: true, Hs: 0.4, Hbp: 0.1, ec: 0.2, nChainages: 2 }
  test('avec déduction de hauteur activée', () => {
    const r = metrerProjet([niv({ murs: [mur] })], { deductionHauteur: ded })
    // (40 − 0,8) × (3,6 − 0,4 − 0,1 − 0,4) − 1,89 = 39,2 × 2,7 − 1,89 = 103,95
    proche(r.totaux.Smur, 39.2 * 2.7 - 1.89, 0.02)
  })
  test('désactivée par défaut : la hauteur saisie est prise telle quelle (pas de double déduction)', () => {
    const r = metrerProjet([niv({ murs: [mur] })], {})
    proche(r.totaux.Smur, 39.2 * 3.6 - 1.89, 0.02)
  })
  test('surcharge par mur (Hs, Hbp, ec) et exclusion (deduireHauteur: false)', () => {
    const a = metrerProjet([niv({ murs: [{ ...mur, Hs: 0.5, Hbp: 0, ec: 0.15 }] })], { deductionHauteur: ded })
    proche(a.totaux.Smur, 39.2 * (3.6 - 0.5 - 0 - 0.3) - 1.89, 0.02)
    const b = metrerProjet([niv({ murs: [{ ...mur, deduireHauteur: false }] })], { deductionHauteur: ded })
    proche(b.totaux.Smur, 39.2 * 3.6 - 1.89, 0.02)
  })
  test('le soubassement n\'est jamais soumis à la déduction de hauteur', () => {
    const r = metrerProjet([niv({ murs: [{ categorie: 'soubassement', type: 'agglo20', L: 40, H: 0.6 }] })], { deductionHauteur: ded })
    proche(r.totaux.soubassement.surfNette, 24)
  })
})

describe('Problème 2 : N_sacs = N_agglos / 70, arrondi au sac entier supérieur', () => {
  test('agglos 40×20 : N = S × 12,5 (+ pertes), sacs = N ÷ 70, à commander arrondi au-dessus', () => {
    const r = metrerProjet([niv({ murs: [{ type: 'agglo20', position: 'exterieur', L: 40, H: 3 }] })], { pertesAgglo: 0 })
    assert.equal(r.totaux.agglos, 1500)                                  // 120 m² × 12,5
    const s = r.materiaux.synthese.find((m) => m.code === 'ciment_mortier_pose')
    proche(s.quantite, 1500 / 70)                                         // 21,43
    assert.equal(s.quantiteCommande, 22)                                  // arrondi supérieur
  })
  test('agglos du soubassement et des cloisons inclus dans le même compte', () => {
    const r = metrerProjet([niv({ murs: [
      { type: 'agglo20', position: 'exterieur', L: 40, H: 3 },
      { type: 'agglo10', position: 'interieur', L: 20, H: 3 },
      { categorie: 'soubassement', type: 'agglo20', position: 'exterieur', L: 40, H: 0.6 }] })], { pertesAgglo: 0 })
    const n = 1500 + 750 + 300
    proche(r.materiaux.synthese.find((m) => m.code === 'ciment_mortier_pose').quantite, n / 70, 0.02)
  })
})

describe('Problème 6 : hourdis N = S_dalle / S_hourdis ; poutrelles Np = L_perp / entraxe + 1', () => {
  const cc = { plancher: 'corpsCreuxPlan', corpsCreux: 15, surfPlancher: 60, entraxe: 0.6, longueurPerpPoutrelles: 6, porteePoutrelle: 10 }
  test('hourdis 60 × 20 cm sur 60 m², pertes 5 %', () => {
    const r = metrerProjet([niv(cc)], { })
    const p = r.totaux.planchers[0]
    assert.equal(p.entrevous, 510)                                       // pas de dimension saisie → hypothèse du type (8,5/m²)
    const r2 = metrerProjet([niv({ ...cc, dimHourdis: { L: 0.6, l: 0.2 } })], {})
    // 60 ÷ 0,12 = 500 hourdis × 1,05 = 525
    assert.equal(r2.totaux.planchers[0].entrevous, 525)
    assert.equal(r2.materiaux.synthese.find((m) => m.code === 'entrevous_15').statut, 'calcule')
  })
  test('pertes des hourdis réglables (10 %)', () => {
    const r = metrerProjet([niv({ ...cc, dimHourdis: { L: 0.6, l: 0.2 }, pertesHourdis: 10 })], {})
    assert.equal(r.totaux.planchers[0].entrevous, 550)
  })
  test('sans dimensions : hypothèse historique conservée, statut « estimé »', () => {
    const r = metrerProjet([niv({ ...cc, surfPlancher: 100 })], {})
    assert.equal(r.totaux.planchers[0].entrevous, 850)
    assert.equal(r.materiaux.synthese.find((m) => m.code === 'entrevous_15').statut, 'estime')
  })
  test('poutrelles : 6 m ÷ 0,60 m + 1 = 11, longueur 11 × 10 m', () => {
    const p = metrerProjet([niv(cc)], {}).totaux.planchers[0]
    assert.equal(p.poutrellesNb, 11)
    proche(p.poutrellesL, 110)
    assert.match(p.poutrellesFormule, /\+ 1 = 11/)
  })
  test('quotient non entier : arrondi supérieur puis + 1 (5 m ÷ 0,6 → 9 + 1)', () => {
    const p = metrerProjet([niv({ ...cc, longueurPerpPoutrelles: 5 })], {}).totaux.planchers[0]
    assert.equal(p.poutrellesNb, 10)
  })
  test('L_perp non saisi : l\'orientation n\'est pas devinée, longueur = S ÷ entraxe', () => {
    const p = metrerProjet([niv({ ...cc, longueurPerpPoutrelles: '', porteePoutrelle: '' })], {}).totaux.planchers[0]
    assert.equal(p.poutrellesNb, null)                                   // portée seule ne suffit pas sans L_perp
    proche(p.poutrellesL, 60 / 0.6)
  })
})

describe('Problème 7 : table de compression V = S × e', () => {
  test('60 m² × 5 cm = 3 m³', () => {
    const r = metrerProjet([niv({ plancher: 'corpsCreuxPlan', corpsCreux: 15, surfPlancher: 60, entraxe: 0.6 })], {})
    proche(r.materiaux.synthese.find((m) => m.code === 'beton_table_compression').quantite, 3)
    const r2 = metrerProjet([niv({ plancher: 'corpsCreuxPlan', corpsCreux: 15, surfPlancher: 60, entraxe: 0.6, tableCompression: 0.04 })], {})
    proche(r2.materiaux.synthese.find((m) => m.code === 'beton_table_compression').quantite, 2.4)
  })
})

describe('Récapitulatif : formules de base déjà conformes', () => {
  test('S = L × l (Σ pièces) ; S_mur = L × H ; semelles V = L×l×h et N×L×l×h', () => {
    const r = metrerProjet([niv({ surfPlancher: '', pieces: [{ L: 5, l: 4 }, { L: 3, l: 3 }] })], {})
    assert.equal(r.parNiveau[0].Ssol, 29)                                // Σ S_pièces
    const f = metrerProjet([niv()], { systeme: 'ossature', fondation: { type: 'isolees', semelles: [{ type: 'S1', nb: 4, L: 1.2, l: 1.2, h: 0.4 }] } }).totaux.fondation
    proche(f.volBAsemelles, 4 * 1.2 * 1.2 * 0.4)
    const g = metrerProjet([niv()], { fondation: { type: 'filante', lineaire: 40, semL: 0.5, semH: 0.25 } }).totaux.fondation
    proche(g.volBAsemelles, 40 * 0.5 * 0.25)
  })
})
