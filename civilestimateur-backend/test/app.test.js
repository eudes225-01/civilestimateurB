// test/app.test.js
// Test d'intégration léger : démarre l'application sur un port éphémère et
// vérifie les routes qui ne dépendent pas d'un service externe (Anthropic,
// FedaPay). Aucune dépendance de test ajoutée : Node possède déjà tout le
// nécessaire (node:test + fetch global).
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
// La période gratuite se calcule depuis LANCEMENT_DATE : on la fixe à aujourd'hui pour que le
// test ne dépende pas de la date du jour (sinon /api/analyse-plan répond 402 une fois la
// période par défaut écoulée). Import dynamique : env.js lit la variable au chargement.
process.env.LANCEMENT_DATE = new Date().toISOString()
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
    assert.equal(typeof (await r.json()).gratuit, 'boolean')
  })

  test('GET /api/prix', async () => {
    const body = await (await fetch(`${base}/api/prix`)).json()
    assert.ok(Array.isArray(body.postes) && body.postes.length > 0)
  })

  test("les anciennes routes /api/fondations n'existent plus (fondation saisie par l'utilisateur)", async () => {
    assert.equal((await fetch(`${base}/api/fondations/Cotonou`)).status, 404)
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

  test('POST /api/fedapay/webhook — sans configuration → 503 (FedaPay réessaiera)', async () => {
    const r = await fetch(`${base}/api/fedapay/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'transaction.approved', entity: { id: 1 } }),
    })
    assert.equal(r.status, 503)
  })

  test('GET /api/access — expose le prix et la durée de l\'abonnement', async () => {
    const body = await (await fetch(`${base}/api/access`)).json()
    assert.equal(body.abonne, false)
    assert.equal(body.abonnement.devise, 'XOF')
    assert.ok(body.abonnement.montant > 0)
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
