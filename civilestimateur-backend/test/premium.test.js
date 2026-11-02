// test/premium.test.js
// Seuls le PDF et l'analyse de plan (dépôts) exigent un abonnement actif ; le calcul DQE est gratuit (compte connecté).
//   sans jeton → 401 · jeton valide sans abonnement → 402 · jeton valide + abonnement actif → la requête passe.
// Supabase (Auth + table abonnements) est simulé par un petit serveur local.
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'

process.env.REQUIRE_AUTH = 'true'
process.env.ANTHROPIC_API_KEY = '' // analyse-plan répond 501 une fois l'accès accordé

const UTILISATEURS = { 'jeton-abonne': 'u-abonne', 'jeton-sans-abo': 'u-libre', 'jeton-admin': 'u-admin', 'jeton-admin-non-verifie': 'u-admin-nv' }
const EMAILS = { 'u-admin': 'Admin@Test.local', 'u-admin-nv': 'admin@test.local' } // 2e cas : même adresse, mais non confirmée
const faux = http.createServer((req, res) => {
  const json = (code, corps) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(corps)) }
  if (req.url === '/auth/v1/user') {
    const id = UTILISATEURS[(req.headers.authorization || '').replace(/^Bearer /, '')]
    return id ? json(200, { id, email: EMAILS[id] || `${id}@test.local`, email_confirmed_at: id === 'u-admin-nv' ? null : '2026-01-01T00:00:00Z' }) : json(401, { msg: 'invalid' })
  }
  if (req.url.startsWith('/rest/v1/abonnements')) {
    const actif = req.url.includes('user_id=eq.u-abonne') && req.url.includes('statut=eq.actif')
    return json(200, actif ? [{ fin: new Date(Date.now() + 86400000).toISOString() }] : [])
  }
  json(404, {})
})
await new Promise((r) => faux.listen(0, r))

describe('routes : accès gratuit et crédits CST', () => {
  let server, base
  const appel = (chemin, jeton, corps = {}) => fetch(`${base}${chemin}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(jeton ? { authorization: `Bearer ${jeton}` } : {}) },
    body: JSON.stringify(corps),
  })

  before(async () => {
    const { env } = await import('../src/config/env.js')
    env.SUPABASE_URL = `http://127.0.0.1:${faux.address().port}`
    env.SUPABASE_ANON_KEY = 'cle-anon'
    env.SUPABASE_SERVICE_ROLE_KEY = 'cle-service'
    env.EMAIL_ADMINS = ['admin@test.local']
    const { createApp } = await import('../src/app.js')
    server = createApp().listen(0); await new Promise((r) => server.once('listening', r))
    base = `http://127.0.0.1:${server.address().port}`
  })
  after(async () => { await new Promise((r) => server.close(r)); faux.close() })

  const calcul = { levels: [{ nom: 'RDC', rez: true, HSP: 3, plancher: 'dallePleine', surfPlancher: 50, pieces: [], murs: [] }], params: { systeme: 'murs', emprise: 50 } }

  test('/api/pdf/devis — sans jeton → 401', async () => {
    assert.equal((await appel('/api/pdf/devis', null, { dqe: { lignes: [] } })).status, 401)
  })

  test('/api/pdf/devis — connecté sans abonnement → 400', async () => {
    const r = await appel('/api/pdf/devis', 'jeton-sans-abo', { dqe: { lignes: [] } })
    assert.equal(r.status, 400)
    assert.equal((await r.json()).error, 'dqe_vide')
  })

  test('/api/analyse-plan — sans jeton → 401', async () => {
    assert.equal((await appel('/api/analyse-plan', null, { messages: [] })).status, 401)
  })

  test('/api/analyse-plan — sans clé Anthropic → 501', async () => {
    const r = await appel('/api/analyse-plan', 'jeton-sans-abo', { messages: [] })
    assert.equal(r.status, 501)
    assert.equal((await r.json()).error, 'analyse_non_configuree')
  })

  test('/api/calcul — sans jeton → 401', async () => { assert.equal((await appel('/api/calcul', null, calcul)).status, 401) })
  test('/api/calcul — connecté SANS abonnement → 200 (le DQE est gratuit)', async () => {
    const r = await appel('/api/calcul', 'jeton-sans-abo', calcul)
    assert.equal(r.status, 200)
    assert.ok((await r.json()).dqe.lignes.length > 0)
  })
  test('/api/calcul — abonné actif → 200 et DQE calculé', async () => {
    const r = await appel('/api/calcul', 'jeton-abonne', calcul)
    assert.equal(r.status, 200)
    assert.ok((await r.json()).dqe.lignes.length > 0)
  })
  test('/api/pdf/devis — abonné actif → la validation du corps s\'applique (400, sans Chromium)', async () => {
    const r = await appel('/api/pdf/devis', 'jeton-abonne', { dqe: { lignes: [] } })
    assert.equal(r.status, 400)
    assert.equal((await r.json()).error, 'dqe_vide')
  })
  test('/api/analyse-plan — abonné actif → accès accordé (501 : clé Anthropic absente)', async () => {
    assert.equal((await appel('/api/analyse-plan', 'jeton-abonne', { messages: [] })).status, 501)
  })
  test('administrateur (e-mail confirmé listé dans EMAIL_ADMIN) → accès sans abonnement', async () => {
    assert.equal((await appel('/api/calcul', 'jeton-admin', calcul)).status, 200)
    assert.equal((await appel('/api/analyse-plan', 'jeton-admin', { messages: [] })).status, 501)
    assert.equal((await appel('/api/pdf/devis', 'jeton-admin', { dqe: { lignes: [] } })).status, 400)
    const etat = await (await fetch(`${base}/api/access`, { headers: { authorization: 'Bearer jeton-admin' } })).json()
    assert.equal(etat.admin, true)
    assert.equal(etat.statut, 'admin')
  })
  test('même adresse mais e-mail non confirmé → pas administrateur', async () => {
    const etat = await (await fetch(`${base}/api/access`, {
      headers: { authorization: 'Bearer jeton-admin-non-verifie' }
    })).json()
    assert.equal(etat.admin, false)
    assert.equal(etat.statut, 'standard')
    assert.equal((await appel('/api/pdf/devis', 'jeton-admin-non-verifie', { dqe: { lignes: [] } })).status, 400)
  })

  test('DELETE /api/compte — sans confirmation → 400 ; sans jeton → 401', async () => {
    const del = (jeton, corps) => fetch(`${base}/api/compte`, { method: 'DELETE', headers: { 'content-type': 'application/json', ...(jeton ? { authorization: `Bearer ${jeton}` } : {}) }, body: JSON.stringify(corps) })
    assert.equal((await del(null, { confirmation: 'SUPPRIMER' })).status, 401)
    assert.equal((await del('jeton-sans-abo', {})).status, 400)
  })
  test('GET /api/access — renvoie les informations CST', async () => {
    const lire = async (jeton) => (await fetch(`${base}/api/access`, {
      headers: { authorization: `Bearer ${jeton}` }
    })).json()

    const admin = await lire('jeton-admin')
    assert.equal(admin.admin, true)
    assert.equal(admin.statut, 'admin')

    const standard = await lire('jeton-sans-abo')
    assert.equal(standard.admin, false)
    assert.equal(standard.statut, 'standard')
    assert.equal(standard.creditsRequis, true)
  })


})
