// test/tarifs.test.js
// Tarification des crédits CST : fonctions pures (aucun réseau).
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

const { env } = await import('../src/config/env.js')
const { coutTokens, creditsPourMontant, forfaits, forfaitValide, reserveAppel, tarifPublic, ENTREE_RESERVE_TOKENS } = await import('../src/services/tarifs.js')

describe('forfaits', () => {
  test('forfaits par défaut : 2 500, 5 000, 10 000 et 20 000 FCFA', () => {
    assert.deepEqual(env.CST_FORFAITS, [2500, 5000, 10000, 20000])
    assert.deepEqual(forfaits().map((f) => f.montant), [2500, 5000, 10000, 20000])
  })
  test('1 FCFA payé = 1 CST par défaut', () => {
    assert.equal(env.CST_PAR_FCFA, 1)
    assert.deepEqual(forfaits().map((f) => f.credits), [2500, 5000, 10000, 20000])
    assert.equal(creditsPourMontant(10000), 10000)
  })
  test('seuls les montants de la liste sont des forfaits valides', () => {
    for (const ok of [2500, 5000, 10000, 20000, '5000']) assert.equal(forfaitValide(ok), true, String(ok))
    for (const ko of [0, 1, 2499, 7500, 20001, -5000, NaN, undefined, null, '', 'abc']) assert.equal(forfaitValide(ko), false, String(ko))
  })
  test('le solde minimum de lecture est de 1 197 CST', () => assert.equal(env.CST_MINIMUM_LECTURE, 1197))
})

describe('coût en tokens', () => {
  test('coût = tokens × tarif par million, arrondi au CST supérieur', () => {
    // 3 000 CST / M en entrée, 15 000 CST / M en sortie
    assert.equal(coutTokens({ entree: 1_000_000, sortie: 0 }), 3000)
    assert.equal(coutTokens({ entree: 0, sortie: 1_000_000 }), 15000)
    assert.equal(coutTokens({ entree: 10_000, sortie: 2_000 }), 30 + 30)
    assert.equal(coutTokens({ entree: 1_001, sortie: 0 }), 4) // 3,003 → 4
  })
  test('un appel réussi coûte au moins 1 CST ; entrées négatives ou invalides ignorées', () => {
    assert.equal(coutTokens({ entree: 1, sortie: 1 }), 1)
    assert.equal(coutTokens({}), 1)
    assert.equal(coutTokens({ entree: -500, sortie: 'x' }), 1)
  })
  test('le coût croît avec les tokens', () => {
    assert.ok(coutTokens({ entree: 20_000, sortie: 5_000 }) > coutTokens({ entree: 10_000, sortie: 5_000 }))
    assert.ok(coutTokens({ entree: 10_000, sortie: 9_000 }) > coutTokens({ entree: 10_000, sortie: 5_000 }))
  })
})

describe('réserve par appel', () => {
  test('la réserve couvre le pire cas (sortie maximale + entrée plafonnée) et reste sous le minimum de lecture', () => {
    const pire = coutTokens({ entree: ENTREE_RESERVE_TOKENS, sortie: env.ANTHROPIC_MAX_TOKENS })
    assert.ok(reserveAppel() >= pire - 1, `réserve ${reserveAppel()} < pire cas ${pire}`)
    assert.ok(reserveAppel() < env.CST_MINIMUM_LECTURE)
  })
  test('tarif public exposé au client', () => assert.deepEqual(tarifPublic(), { entreeMillion: 3000, sortieMillion: 15000 }))
})
