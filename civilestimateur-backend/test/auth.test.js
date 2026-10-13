// test/auth.test.js
// Routes protégées : sans session valide → refus ; avec une session reconnue par
// Supabase (simulé par un petit serveur local) → la requête passe.
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'

process.env.LANCEMENT_DATE = new Date().toISOString()
process.env.REQUIRE_AUTH = 'true'
process.env.ANTHROPIC_API_KEY = '' // la route répond 501 une fois l'authentification passée

// Faux Supabase : le jeton « bon-jeton » est valide, tout le reste est refusé.
const faux = http.createServer((req, res) => {
  const ok = req.url === '/auth/v1/user' && req.headers.authorization === 'Bearer bon-jeton' && req.headers.apikey === 'cle-anon'
  res.writeHead(ok ? 200 : 401, { 'content-type': 'application/json' })
  res.end(JSON.stringify(ok ? { id: 'u1', email: 'a@b.c' } : { msg: 'invalid' }))
})
await new Promise((r) => faux.listen(0, r))

describe('authentification des routes protégées', () => {
  let server, base
  const post = (headers = {}) => fetch(`${base}/api/analyse-plan`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ messages: [] }) })

  describe('Supabase non configuré', () => {
    before(async () => {
      const { createApp } = await import('../src/app.js')
      server = createApp().listen(0); await new Promise((r) => server.once('listening', r))
      base = `http://127.0.0.1:${server.address().port}`
    })
    after(() => new Promise((r) => server.close(r)))
    test('connexion exigée mais non configurée → 503 (échec fermé)', async () => {
      assert.equal((await post()).status, 503)
    })
  })

  describe('Supabase configuré', () => {
    before(async () => {
      const { env } = await import('../src/config/env.js')
      env.SUPABASE_URL = `http://127.0.0.1:${faux.address().port}`
      env.SUPABASE_ANON_KEY = 'cle-anon'
      const { createApp } = await import('../src/app.js')
      server = createApp().listen(0); await new Promise((r) => server.once('listening', r))
      base = `http://127.0.0.1:${server.address().port}`
    })
    after(async () => { await new Promise((r) => server.close(r)); faux.close() })
    test('sans jeton → 401', async () => { assert.equal((await post()).status, 401) })
    test('jeton refusé par Supabase → 401', async () => { assert.equal((await post({ authorization: 'Bearer mauvais' })).status, 401) })
    test('jeton valide → la requête passe (501 : clé Anthropic absente)', async () => { assert.equal((await post({ authorization: 'Bearer bon-jeton' })).status, 501) })
    test('les routes publiques restent ouvertes', async () => { assert.equal((await fetch(`${base}/api/health`)).status, 200) })
  })
})
