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
  test('base de prix de référence : les postes à 0 FCFA sont listés', () => {
    const dqe = buildDQE(totaux, mapPrix((p) => p.bi))
    const sansPrix = new Set(dqe.sansPrix.map((l) => l.code))
    assert.equal(dqe.incomplet, dqe.sansPrix.length > 0)
    // le sable et le gravier sont métrés mais sans prix dans la base livrée
    assert.ok(sansPrix.has('sable') && sansPrix.has('gravier'))
    assert.ok(dqe.sansPrix.every((l) => l.q > 0 && l.des && l.n))
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
