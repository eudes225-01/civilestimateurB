// test/premium.test.js
// Pas de formule gratuite : DQE (calcul), PDF et analyse de plan exigent un abonnement actif.
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

describe('routes payantes : abonnement actif obligatoire', () => {
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

  for (const [chemin, corps] of [['/api/calcul', calcul], ['/api/pdf/devis', { dqe: { lignes: [] } }], ['/api/analyse-plan', { messages: [] }]]) {
    test(`${chemin} — sans jeton → 401`, async () => { assert.equal((await appel(chemin, null, corps)).status, 401) })
    test(`${chemin} — connecté sans abonnement → 402`, async () => {
      const r = await appel(chemin, 'jeton-sans-abo', corps)
      assert.equal(r.status, 402)
      assert.equal((await r.json()).error, 'premium_required')
    })
  }

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
    const etat = await (await fetch(`${base}/api/access`, { headers: { authorization: 'Bearer jeton-admin' } })).json()
    assert.equal(etat.abonne, true)
    assert.equal(etat.admin, true)
  })
  test('même adresse mais e-mail non confirmé → pas administrateur (402)', async () => {
    assert.equal((await appel('/api/calcul', 'jeton-admin-non-verifie', calcul)).status, 402)
  })
  test('GET /api/access — reflète l\'abonnement du jeton', async () => {
    const lire = async (jeton) => (await fetch(`${base}/api/access`, { headers: { authorization: `Bearer ${jeton}` } })).json()
    assert.equal((await lire('jeton-abonne')).abonne, true)
    assert.equal((await lire('jeton-sans-abo')).abonne, false)
  })
})
