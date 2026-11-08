// test/app.test.js
// Test d'intégration léger : démarre l'application sur un port éphémère et
// vérifie les routes qui ne dépendent pas d'un service externe (Anthropic,
// FedaPay). Aucune dépendance de test ajoutée : Node possède déjà tout le
// nécessaire (node:test + fetch global).
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
// Lecture de plans : session ET crédits CST ; PDF et calcul DQE : session seule (voir test/credits.test.js pour le détail).
// Connexion exigée (comme en production), indépendamment du .env local : sans en-tête, la session est refusée (401) sans appel réseau.
process.env.REQUIRE_AUTH = 'true'
process.env.SUPABASE_URL = 'https://demo.supabase.co'
process.env.SUPABASE_ANON_KEY = 'cle-anon'
const { createApp } = await import('../src/app.js')

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
    const body = await r.json()
    assert.equal(body.creditsRequis, true)
    assert.equal(body.statut, 'standard')
    assert.equal(body.solde, 0)
    assert.deepEqual(body.usagesCredits.map((f) => f.cle), ['lecture_plans'])
    assert.equal('premiumRequis' in body, false) // plus d'abonnement
  })

  test('GET /api/prix', async () => {
    const body = await (await fetch(`${base}/api/prix`)).json()
    assert.ok(Array.isArray(body.postes) && body.postes.length > 0)
  })

  test("les anciennes routes /api/fondations n'existent plus (fondation saisie par l'utilisateur)", async () => {
    assert.equal((await fetch(`${base}/api/fondations/Cotonou`)).status, 404)
  })

  test('POST /api/calcul — sans session → 401 (compte requis, mais DQE gratuit)', async () => {
    const r = await fetch(`${base}/api/calcul`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        levels: [{ nom: 'RDC', rez: true, HSP: 3, plancher: 'dallePleine', surfPlancher: 50, pieces: [], murs: [] }],
        params: { systeme: 'murs', emprise: 50 },
      }),
    })
    assert.equal(r.status, 401)
    assert.equal((await r.json()).error, 'auth_requise')
  })

  test('POST /api/analyse-plan — sans session → 401', async () => {
    const r = await fetch(`${base}/api/analyse-plan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [] }),
    })
    assert.equal(r.status, 401)
  })

  test('POST /api/fedapay/init — sans clé configurée → 501', async () => {
    const r = await fetch(`${base}/api/fedapay/init`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    assert.equal(r.status, 501)
  })

  test('POST /api/fedapay/webhook — sans configuration → 503 (FedaPay réessaiera)', async () => {
    const r = await fetch(`${base}/api/fedapay/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'transaction.approved', entity: { id: 1 } }),
    })
    assert.equal(r.status, 503)
  })

  test('GET /api/access — expose les forfaits de crédits, le solde minimum de lecture et le tarif au token', async () => {
    const body = await (await fetch(`${base}/api/access`)).json()
    assert.equal(body.devise, 'XOF')
    assert.deepEqual(body.forfaits.map((f) => f.montant), [2500, 5000, 10000, 20000])
    assert.equal(body.minimumLecture, 1197)
    assert.ok(body.tarif.entreeMillion > 0 && body.tarif.sortieMillion > 0)
    assert.equal('abonnement' in body, false)
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
