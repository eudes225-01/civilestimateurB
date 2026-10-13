// test/plomberie-lacunes.test.js
// Lecture de plomberie insuffisante : le moteur dit quoi compléter et propose
// des valeurs fermées (diamètres, pentes) au lieu de laisser un champ vide.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { lacunesPlomberie, diametresPour, DIAMETRES_PLOMBERIE, PENTES_EVACUATION } from '../src/index.js'

describe('plomberie — lacunes de lecture', () => {
  test('lecture vide : une lacune globale', () => {
    const l = lacunesPlomberie({ appareils: [], reseaux: [], regards: [] })
    assert.equal(l.length, 1)
    assert.equal(l[0].liste, 'global')
  })
  test('diamètre, pente et réseau manquants sont localisés (ligne + champ)', () => {
    const l = lacunesPlomberie({
      appareils: [{ type: 'WC', nb: 1 }],
      reseaux: [
        { reseau: 'EF', diam: null, L: 12 },
        { reseau: 'EU', diam: 100, L: 8, pente: null },
        { reseau: '???', diam: 50, L: 3 },
      ],
    })
    const cles = l.map((x) => `${x.liste}:${x.ligne}:${x.champ}`)
    assert.ok(cles.includes('reseaux:0:diam'))
    assert.ok(cles.includes('reseaux:1:pente'))
    assert.ok(cles.includes('reseaux:2:reseau'))
    assert.ok(!cles.includes('reseaux:0:pente'), "pas de pente exigée sur un réseau d'alimentation")
  })
  test('lecture complète : aucune lacune', () => {
    const l = lacunesPlomberie({
      appareils: [{ type: 'WC', nb: 2 }],
      reseaux: [{ reseau: 'EU', diam: 100, L: 8, pente: 2 }, { reseau: 'EF', diam: 20, L: 10 }],
    })
    assert.deepEqual(l, [])
  })
  test('valeurs proposées : par réseau, sinon toutes, et pentes fermées', () => {
    assert.deepEqual(diametresPour('EV'), DIAMETRES_PLOMBERIE.EV)
    assert.deepEqual(diametresPour('eau froide'), DIAMETRES_PLOMBERIE.EF)
    assert.ok(diametresPour(null).includes(16) && diametresPour(null).includes(160))
    assert.ok(PENTES_EVACUATION.every((p) => p > 0))
  })
})
