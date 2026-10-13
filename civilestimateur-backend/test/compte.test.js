// test/compte.test.js
// Profil affichable (prénom, nom, photo), statut, et suppression de compte.
// Supabase (Auth + API Admin + abonnements) est simulé par un petit serveur local.
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { lireIdentite } from '../src/services/identite.js'

process.env.REQUIRE_AUTH = 'true'

const META = {
  'jeton-google': { id: 'u-google', email: 'ama@test.local', user_metadata: { full_name: 'Ama Dossou Koffi', given_name: 'Ama', family_name: 'Dossou Koffi', avatar_url: 'https://lh3.googleusercontent.com/a/photo' } },
  'jeton-abonne': { id: 'u-abonne', email: 'abo@test.local', user_metadata: { full_name: 'Jean Eudes' } },
  'jeton-admin': { id: 'u-admin', email: 'admin@test.local', user_metadata: { name: 'Chef Admin' } },
}
const supprimes = []
const faux = http.createServer((req, res) => {
  const json = (code, corps) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(corps ?? {})) }
  if (req.url === '/auth/v1/user') {
    const m = META[(req.headers.authorization || '').replace(/^Bearer /, '')]
    return m ? json(200, { ...m, email_confirmed_at: '2026-01-01T00:00:00Z' }) : json(401, { msg: 'invalid' })
  }
  if (req.method === 'DELETE' && req.url.startsWith('/auth/v1/admin/users/')) {
    if (!req.headers.apikey) return json(401, {})
    supprimes.push(decodeURIComponent(req.url.split('/').pop()))
    return json(200, {})
  }
  if (req.url.startsWith('/rest/v1/abonnements')) {
    const actif = req.url.includes('user_id=eq.u-abonne') && req.url.includes('statut=eq.actif')
    return json(200, actif ? [{ fin: new Date(Date.now() + 5 * 86400000).toISOString() }] : [])
  }
  json(404, {})
})
await new Promise((r) => faux.listen(0, r))

describe('lireIdentite', () => {
  test('Google : prénom, nom et photo repris tels quels', () => {
    assert.deepEqual(lireIdentite(META['jeton-google'].user_metadata), { prenom: 'Ama', nom: 'Dossou Koffi', nomComplet: 'Ama Dossou Koffi', photo: 'https://lh3.googleusercontent.com/a/photo' })
  })
  test('sans given_name / family_name : le nom complet est coupé au premier espace', () => {
    const i = lireIdentite({ full_name: 'Jean Eudes Avocegamou' })
    assert.equal(i.prenom, 'Jean')
    assert.equal(i.nom, 'Eudes Avocegamou')
  })
  test('photo : seul https est accepté', () => {
    assert.equal(lireIdentite({ avatar_url: 'http://exemple.com/a.png' }).photo, null)
    assert.equal(lireIdentite({ avatar_url: 'javascript:alert(1)' }).photo, null)
    assert.equal(lireIdentite({ picture: 'https://exemple.com/a.png' }).photo, 'https://exemple.com/a.png')
  })
  test('métadonnées absentes → champs vides, pas d\'erreur', () => {
    assert.deepEqual(lireIdentite(undefined), { prenom: '', nom: '', nomComplet: '', photo: null })
  })
})

describe('GET /api/me et DELETE /api/compte', () => {
  let server, base
  const appel = (methode, chemin, jeton, corps) => fetch(`${base}${chemin}`, {
    method: methode,
    headers: { 'content-type': 'application/json', ...(jeton ? { authorization: `Bearer ${jeton}` } : {}) },
    body: corps ? JSON.stringify(corps) : undefined,
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

  test('/api/me — sans jeton → 401', async () => { assert.equal((await appel('GET', '/api/me')).status, 401) })

  test('/api/me — compte Google sans abonnement : prénom, nom, photo, statut standard', async () => {
    const m = await (await appel('GET', '/api/me', 'jeton-google')).json()
    assert.equal(m.prenom, 'Ama')
    assert.equal(m.nom, 'Dossou Koffi')
    assert.equal(m.photo, 'https://lh3.googleusercontent.com/a/photo')
    assert.equal(m.statut, 'standard')
    assert.equal(m.abonne, false)
    assert.equal(m.fonctionnalites.find((f) => f.id === 'export_pdf').acces, false)
  })
  test('/api/me — abonnement payé actif : statut premium et date de fin', async () => {
    const m = await (await appel('GET', '/api/me', 'jeton-abonne')).json()
    assert.equal(m.statut, 'premium')
    assert.ok(m.finAbonnement && m.joursRestants >= 1)
    assert.equal(m.photo, null)
  })
  test('/api/me — administrateur : statut admin, toutes les fonctionnalités accessibles', async () => {
    const m = await (await appel('GET', '/api/me', 'jeton-admin')).json()
    assert.equal(m.statut, 'admin')
    assert.ok(m.fonctionnalites.every((f) => f.acces))
  })

  test('DELETE /api/compte — sans jeton → 401, rien n\'est supprimé', async () => {
    assert.equal((await appel('DELETE', '/api/compte', null, { confirmer: true })).status, 401)
    assert.deepEqual(supprimes, [])
  })
  test('DELETE /api/compte — sans confirmation → 400, rien n\'est supprimé', async () => {
    const r = await appel('DELETE', '/api/compte', 'jeton-google', {})
    assert.equal(r.status, 400)
    assert.equal((await r.json()).error, 'confirmation_requise')
    assert.deepEqual(supprimes, [])
  })
  test('DELETE /api/compte — confirmé : supprime uniquement le compte du jeton', async () => {
    const r = await appel('DELETE', '/api/compte', 'jeton-google', { confirmer: true })
    assert.equal(r.status, 200)
    assert.equal((await r.json()).supprime, true)
    assert.deepEqual(supprimes, ['u-google'])
  })
})
