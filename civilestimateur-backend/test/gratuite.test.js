// test/gratuite.test.js
// Variable APP_GRATUITE : « non » = version à crédits CST (lecture de plans facturée), « oui » = version gratuite
// (aucun crédit exigé ni débité, aucun paiement).
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'

process.env.REQUIRE_AUTH = 'true'
const { env } = await import('../src/config/env.js')
const { etatUtilisateur, exigerCredits } = await import('../src/middleware/access.js')
const { lancerAnalyse } = await import('../src/services/lectures.js')
const { createApp } = await import('../src/app.js')

const faireRes = () => {
  const r = { code: null, corps: null }
  r.status = (c) => { r.code = c; return r }
  r.json = (b) => { r.corps = b; return r }
  return r
}
const passe = (req) => { const res = faireRes(); let ok = false; exigerCredits(req, res, () => { ok = true }); return { ok, res } }
const user = { id: 'u1', email: 'a@b.c', emailVerifie: true }

describe('APP_GRATUITE', () => {
  const avant = env.APP_GRATUITE
  after(() => { env.APP_GRATUITE = avant })

  test('non : version à crédits, un compte sans base de crédits est bloqué (503)', async () => {
    env.APP_GRATUITE = false
    const e = await etatUtilisateur(user)
    assert.equal(e.creditsRequis, true)
    assert.equal(e.statut, 'standard')
    assert.ok(e.forfaits.length > 0)
    const r = passe({ user })
    assert.equal(r.ok, env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY ? true : false)
  })

  test('oui : état sans crédits ni paiement', async () => {
    env.APP_GRATUITE = true
    const e = await etatUtilisateur(user)
    assert.equal(e.gratuite, true)
    assert.equal(e.creditsRequis, false)
    assert.equal(e.statut, 'gratuit')
    assert.equal(e.paiementDisponible, false)
    assert.deepEqual(e.forfaits, [])
  })

  test('oui : un administrateur reste distingué (statut admin), un compte ordinaire est « gratuit »', async () => {
    env.APP_GRATUITE = true
    const avantAdmins = env.EMAIL_ADMINS
    env.EMAIL_ADMINS = ['admin@b.c']
    try {
      const a = await etatUtilisateur({ id: 'u2', email: 'Admin@b.c', emailVerifie: true })
      assert.equal(a.statut, 'admin')
      assert.equal(a.admin, true)
      assert.equal(a.paiementDisponible, false)
      assert.equal((await etatUtilisateur(user)).statut, 'gratuit')
      // e-mail non confirmé : pas de privilège
      assert.equal((await etatUtilisateur({ id: 'u3', email: 'admin@b.c', emailVerifie: false })).statut, 'gratuit')
    } finally { env.EMAIL_ADMINS = avantAdmins }
  })

  test('oui : exigerCredits laisse passer même sans base de crédits', () => {
    env.APP_GRATUITE = true
    assert.equal(passe({ user }).ok, true)
  })

  test('oui : la lecture n\'est jamais débitée (aucun accès à la base de crédits)', async () => {
    env.APP_GRATUITE = true
    const avantFetch = globalThis.fetch
    const appels = []
    globalThis.fetch = async (url) => { appels.push(String(url)); return new Response(JSON.stringify({ content: [], usage: { input_tokens: 10, output_tokens: 5 } }), { status: 200, headers: { 'content-type': 'application/json' } }) }
    try {
      const r = await lancerAnalyse({ user, messages: [{ role: 'user', content: 'x' }], debut: true })
      assert.equal(r.status, 200)
      assert.equal('cst' in r.body, false)
      assert.deepEqual(appels, ['https://api.anthropic.com/v1/messages'])
    } finally { globalThis.fetch = avantFetch }
  })

  describe('route de paiement', () => {
    let server, base
    before(async () => {
      server = createApp().listen(0)
      await new Promise((r) => server.once('listening', r))
      base = `http://127.0.0.1:${server.address().port}`
    })
    after(() => new Promise((r) => server.close(r)))

    test('oui : /api/fedapay/init répond 404 application_gratuite', async () => {
      env.APP_GRATUITE = true
      const r = await fetch(`${base}/api/fedapay/init`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      assert.equal(r.status, 404)
      assert.equal((await r.json()).error, 'application_gratuite')
    })
  })
})
