// test/lotC-corrections.test.js
// Corrections issues de la table Lot C et de la fiche Eurocode (oct. 2026) :
// ratios d'acier, longueurs développées (jonctions T/X), déduction des
// poteaux dans la maçonnerie, chaînage haut, épaisseur des murs porteurs.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { metrerProjet, metrerNiveau, RATIOS_ACIER_DEFAUT } from '../src/index.js'

const proche = (got, want, tol = 0.001) => assert.ok(Math.abs(got - want) <= tol, `obtenu ${got}, attendu ${want}`)

describe('Ratios d\'acier — table Lot C', () => {
  const R = RATIOS_ACIER_DEFAUT
  const dans = (v, a, b) => v >= a && v <= b
  test('chaînages / poutres dans 80–100', () => {
    assert.ok(dans(R.chainage, 80, 100) && dans(R.longrine, 80, 100) && dans(R.poutre, 80, 100))
  })
  test('poteaux dans 100–130', () => assert.ok(dans(R.poteau, 100, 130)))
  test('dalle pleine dans 70–90', () => assert.ok(dans(R.dallePleine, 70, 90)))
  test('semelles filante 35–50 / isolée 50–70', () => {
    assert.ok(dans(R.semelleFilante, 35, 50) && dans(R.semelleIsolee, 50, 70))
  })
})

describe('Longueurs développées (Lot C §1)', () => {
  const mur = (extra = {}) => ({ nom: 'M', type: 'agglo15', nb: 1, L: 10, H: 3, ...extra })
  const niv = (m) => metrerNiveau({ HSP: 3, murs: [m] }, {})

  test('sans jonction : LD = L', () => proche(niv(mur()).Ldev, 10))
  test('jonction en L : aucune correction', () => proche(niv(mur({ jonctionsT: 0, jonctionsX: 0 })).Ldev, 10))
  test('2 jonctions en T : LD = L − 2 × ½ × b', () => proche(niv(mur({ jonctionsT: 2 })).Ldev, 10 - 2 * 0.5 * 0.15))
  test('1 jonction en X : LD = L − b', () => proche(niv(mur({ jonctionsX: 1 })).Ldev, 10 - 0.15))
  test('la surface brute suit la longueur développée', () => {
    proche(niv(mur({ jonctionsT: 2 })).Smur, (10 - 0.15) * 3, 0.01)
  })
})

describe('Déduction des poteaux dans la maçonnerie (Lot C §2A)', () => {
  const niv = (m) => metrerNiveau({ HSP: 3, murs: [m] }, {})
  test('sans poteau : surface = L × H', () => proche(niv({ type: 'agglo15', L: 10, H: 3 }).Smur, 30, 0.01))
  test('2 poteaux de 0,20 m : − 2 × 0,20 × H', () => {
    proche(niv({ type: 'agglo15', L: 10, H: 3, poteaux: 2 }).Smur, 30 - 2 * 0.2 * 3, 0.01)
  })
  test('largeur de poteau propre au mur', () => {
    proche(niv({ type: 'agglo15', L: 10, H: 3, poteaux: 2, largPoteau: 0.3 }).Smur, 30 - 2 * 0.3 * 3, 0.01)
  })
})

describe('Chaînage haut (fiche Eurocode §3.C)', () => {
  const rdc = { nom: 'RDC', rez: true, HSP: 3, murs: [{ type: 'agglo20', L: 20, H: 3 }] }
  test('murs porteurs : volume = Ldev porteurs × 0,20 × 0,20 par niveau', () => {
    const { totaux } = metrerProjet([rdc], { systeme: 'murs' })
    proche(totaux.volChainageHaut, 20 * 0.2 * 0.2, 0.01)
    assert.ok(totaux.acierDetail.some((d) => /Chaînages hauts/.test(d.lib)))
  })
  test('ossature : pas de chaînage haut automatique', () => {
    const { totaux } = metrerProjet([rdc], { systeme: 'ossature' })
    assert.equal(totaux.volChainageHaut, 0)
  })
  test('désactivable', () => {
    const { totaux } = metrerProjet([rdc], { systeme: 'murs', chainageHaut: { actif: false } })
    assert.equal(totaux.volChainageHaut, 0)
  })
})

describe('Alertes : épaisseur des murs porteurs et mode pièces', () => {
  const niveau = (type) => ({ nom: 'N', HSP: 3, murs: [{ type, L: 12, H: 3 }] })
  test('R+1 en agglos 15 : alerte épaisseur (20 cm requis)', () => {
    const { alertes } = metrerProjet([{ ...niveau('agglo15'), rez: true }, niveau('agglo15')], { systeme: 'murs' })
    assert.ok(alertes.some((a) => /épaisseur minimale de 20 cm/.test(a.msg)))
  })
  test('R+1 en agglos 20 : pas d\'alerte épaisseur', () => {
    const { alertes } = metrerProjet([{ ...niveau('agglo20'), rez: true }, niveau('agglo20')], { systeme: 'murs' })
    assert.ok(!alertes.some((a) => /épaisseur minimale/.test(a.msg)))
  })
  test('R+0 en agglos 15 : conforme', () => {
    const { alertes } = metrerProjet([{ ...niveau('agglo15'), rez: true }], { systeme: 'murs' })
    assert.ok(!alertes.some((a) => /épaisseur minimale/.test(a.msg)))
  })
  test('mode pièces à 2 pièces : alerte double comptage', () => {
    const lv = [{ nom: 'RDC', rez: true, HSP: 3, pieces: [{ L: 4, l: 4 }, { L: 4, l: 4 }] }]
    const { alertes } = metrerProjet(lv, { systeme: 'murs' })
    assert.ok(alertes.some((a) => /comptés deux fois/.test(a.msg)))
  })
})
