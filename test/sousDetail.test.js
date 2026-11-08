import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSousDetail } from '../src/sousDetail.js'

test('le déboursé sec et la majoration recomposent le PU après arrondi', () => {
  const [poste] = buildSousDetail([{ n: '1.1', des: 'Essai', u: 'u', code: 'inconnu', q: 2 }], { inconnu: 101 }, 1.3)
  assert.equal(poste.puVente, 131)
  assert.equal(poste.majoration, 30)
  assert.equal(poste.deboursesSec + poste.majoration, poste.puVente)
})
