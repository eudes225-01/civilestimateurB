// test/dqe-sans-prix.test.js
// Un poste métré mais sans prix (0 FCFA) ne doit pas passer inaperçu : le DQE
// remonte la liste des postes non chiffrés et marque le total comme incomplet.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { metrerProjet, buildDQE, PRIX } from '../src/index.js'

const niveaux = [{ nom: 'RDC', rez: true, HSP: 3, murs: [{ type: 'agglo20', L: 20, H: 3 }] }]
const { totaux } = metrerProjet(niveaux, { systeme: 'murs' })
const mapPrix = (fn) => Object.fromEntries(PRIX.map((p) => [p.code, fn(p)]))

describe('DQE — postes sans prix', () => {
  test('base de prix de référence : tous les postes ont un prix par défaut (plus de ligne à 0 FCFA)', () => {
    assert.ok(PRIX.every((p) => p.bi > 0), 'chaque poste de la base livrée doit avoir un prix moyen par défaut')
    const dqe = buildDQE(totaux, mapPrix((p) => p.bi))
    assert.deepEqual(dqe.sansPrix, [])
    assert.equal(dqe.incomplet, false)
  })
  test('les prix moyens par défaut sont marqués « estimés » (non issus du barème RPR)', () => {
    const estimes = PRIX.filter((p) => p.estime)
    assert.ok(estimes.length >= 29)
    assert.ok(['sable', 'gravier', 'san_wc', 'elec_tableau', 'toit_faitiere'].every((c) => PRIX.find((p) => p.code === c)?.estime === true))
    assert.ok(PRIX.filter((p) => !p.estime).every((p) => p.bi > 0))
  })
  test('tous les prix renseignés : total complet', () => {
    const dqe = buildDQE(totaux, mapPrix(() => 1000))
    assert.equal(dqe.incomplet, false)
    assert.deepEqual(dqe.sansPrix, [])
  })
  test('un poste sans prix ne change pas le total HT', () => {
    const plein = buildDQE(totaux, mapPrix(() => 1000))
    const troue = buildDQE(totaux, { ...mapPrix(() => 1000), sable: 0 })
    assert.ok(troue.ht < plein.ht)
    assert.deepEqual(troue.sansPrix.map((l) => l.code), ['sable'])
  })
})
