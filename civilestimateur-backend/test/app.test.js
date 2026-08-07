// test/app.test.js
// Test d'intégration léger : démarre l'application sur un port éphémère et
// vérifie les routes qui ne dépendent pas d'un service externe (Anthropic,
// FedaPay). Aucune dépendance de test ajoutée : Node possède déjà tout le
// nécessaire (node:test + fetch global).
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/app.js'

describe('API CivilEstimator', () => {
  let server, base

  before(async () => {
    const app = createApp()
    server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    base = `http://127.0.0.1:${server.address().port}`
  })

  after(() => new Promise((resolve) => server.close(resolve)))

  test('GET /api/health', async () => {
    const r = await fetch(`${base}/api/health`)
    assert.equal(r.status, 200)
    assert.equal((await r.json()).ok, true)
  })

  test('GET /api/access', async () => {
    const r = await fetch(`${base}/api/access`)
    assert.equal(r.status, 200)
    assert.equal(typeof (await r.json()).gratuit, 'boolean')
  })

  test('GET /api/prix', async () => {
    const body = await (await fetch(`${base}/api/prix`)).json()
    assert.ok(Array.isArray(body.postes) && body.postes.length > 0)
  })

  test('GET /api/fondations/:ville — ville connue', async () => {
    const body = await (await fetch(`${base}/api/fondations/Cotonou`)).json()
    assert.equal(body.zone, 'zone_côtière')
  })

  test('GET /api/fondations/:ville — ville inconnue → 404', async () => {
    const r = await fetch(`${base}/api/fondations/VilleInexistante`)
    assert.equal(r.status, 404)
  })

  test('GET /api/fondations/:ville/recommandation — Lot A (radier en zone lagunaire)', async () => {
    const body = await (await fetch(`${base}/api/fondations/Porto-Novo/recommandation?systeme=ossature`)).json()
    assert.equal(body.recommandation.type, 'radier')
  })

  test('POST /api/calcul — projet minimal', async () => {
    const r = await fetch(`${base}/api/calcul`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        levels: [{ nom: 'RDC', rez: true, HSP: 3, plancher: 'dallePleine', surfPlancher: 50, pieces: [], murs: [] }],
        params: { systeme: 'murs', emprise: 50 },
      }),
    })
    assert.equal(r.status, 200)
    const body = await r.json()
    assert.ok(body.dqe.lignes.length > 0)
  })

  test('POST /api/analyse-plan — sans clé configurée → 501', async () => {
    const r = await fetch(`${base}/api/analyse-plan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [] }),
    })
    assert.equal(r.status, 501)
  })

  test('POST /api/fedapay/init — sans clé configurée → 501', async () => {
    const r = await fetch(`${base}/api/fedapay/init`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    assert.equal(r.status, 501)
  })

  test('CORS : origine non autorisée rejetée', async () => {
    const r = await fetch(`${base}/api/health`, { headers: { Origin: 'https://site-pirate.example' } })
    assert.equal(r.status, 500)
  })

  test('CORS : origine autorisée par défaut (localhost:5173) acceptée', async () => {
    const r = await fetch(`${base}/api/health`, { headers: { Origin: 'http://localhost:5173' } })
    assert.equal(r.status, 200)
  })
})
