// test/gratuite.test.js
// Variable APP_GRATUITE : « non » = version payante (comportement historique), « oui » = version gratuite.
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'

process.env.REQUIRE_AUTH = 'true'
const { env } = await import('../src/config/env.js')
const { etatUtilisateur, requirePremium } = await import('../src/middleware/access.js')
const { createApp } = await import('../src/app.js')

const faireRes = () => {
  const r = { code: null, corps: null }
  r.status = (c) => { r.code = c; return r }
  r.json = (b) => { r.corps = b; return r }
  return r
}
const passe = async (req) => { const res = faireRes(); let ok = false; await requirePremium(req, res, () => { ok = true }); return { ok, res } }

describe('APP_GRATUITE', () => {
  const avant = env.APP_GRATUITE
  after(() => { env.APP_GRATUITE = avant })

  test('non : version payante, un compte sans abonnement est bloqué', async () => {
    env.APP_GRATUITE = false
    const e = await etatUtilisateur({ id: 'u1', email: 'a@b.c', emailVerifie: true })
    assert.equal(e.premiumRequis, true)
    assert.equal(e.abonne, false)
    assert.equal(e.statut, 'standard')
    const r = await passe({ user: { id: 'u1', email: 'a@b.c', emailVerifie: true } })
    assert.equal(r.ok, false)
  })

  test('oui : version gratuite, état sans abonnement ni paiement', async () => {
    env.APP_GRATUITE = true
    const e = await etatUtilisateur({ id: 'u1', email: 'a@b.c', emailVerifie: true })
    assert.equal(e.gratuite, true)
    assert.equal(e.premiumRequis, false)
    assert.equal(e.abonne, true)
    assert.equal(e.statut, 'gratuit')
    assert.equal(e.paiementDisponible, false)
    assert.deepEqual(e.fonctionnalitesPremium, [])
  })

  test('oui : un compte connecté passe, mais sans session on reste bloqué (401)', async () => {
    env.APP_GRATUITE = true
    assert.equal((await passe({ user: { id: 'u1', email: 'a@b.c', emailVerifie: true } })).ok, true)
    const sans = await passe({})
    assert.equal(sans.ok, false)
    assert.equal(sans.res.code, 401)
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
