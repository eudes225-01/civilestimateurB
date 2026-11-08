// test/credits.test.js
// Routes avec crédits CST, de bout en bout (application Express réelle, services externes simulés) :
//   • lecture de plans : sans jeton 401 · sans solde 402 · avec solde 200 et débit au token ;
//   • PDF, calcul DQE : gratuits pour tout compte connecté ;
//   • achat : seuls les forfaits sont acceptés ; confirmation (retour navigateur et webhook signé) ;
//   • administrateur : jamais débité.
// Supabase (Auth + tables), FedaPay et le service d'analyse sont simulés par un fetch de test (aucun réseau).
import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { creerFauxSupabase } from './helpers/faux-supabase.js'

process.env.REQUIRE_AUTH = 'true'
process.env.SUPABASE_URL = 'https://demo.supabase.co'
process.env.SUPABASE_ANON_KEY = 'cle-anon'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'cle-service'
process.env.ANTHROPIC_API_KEY = 'cle-anthropic-test'
process.env.FEDAPAY_SECRET_KEY = 'sk_sandbox_test'
process.env.FEDAPAY_WEBHOOK_SECRET = 'whsec_test'
process.env.EMAIL_ADMIN = 'admin@test.local'

const UTILISATEURS = { 'jeton-client': 'u-client', 'jeton-riche': 'u-riche', 'jeton-admin': 'u-admin', 'jeton-admin-non-verifie': 'u-admin-nv' }
const EMAILS = { 'u-admin': 'Admin@Test.local', 'u-admin-nv': 'admin@test.local' } // 2e cas : même adresse, non confirmée

const realFetch = globalThis.fetch
const base = creerFauxSupabase()
let transactions, analyses

const json = (corps, status = 200) => new Response(JSON.stringify(corps), { status, headers: { 'content-type': 'application/json' } })

function fauxExterne(url, init = {}) {
  const s = String(url)
  if (s === 'https://demo.supabase.co/auth/v1/user') {
    const id = UTILISATEURS[(init.headers?.authorization || '').replace(/^Bearer /, '')]
    return id ? json({ id, email: EMAILS[id] || `${id}@test.local`, user_metadata: { full_name: 'Awa Dossou' }, email_confirmed_at: id === 'u-admin-nv' ? null : '2026-01-01T00:00:00Z' }) : json({ msg: 'invalid' }, 401)
  }
  const sb = base.repondre(s, init)
  if (sb) return sb
  if (s === 'https://api.anthropic.com/v1/messages') {
    analyses.push(JSON.parse(init.body))
    return json({ id: 'msg_1', content: [{ type: 'text', text: '{}' }], usage: { input_tokens: 8000, output_tokens: 3000 } })
  }
  if (s.includes('fedapay.com')) {
    const chemin = new URL(s).pathname.replace(/^\/v1/, '')
    const methode = init.method || 'GET'
    if (methode === 'POST' && chemin === '/transactions') {
      const c = JSON.parse(init.body); const id = 5000 + Object.keys(transactions).length
      transactions[id] = { id, status: 'pending', amount: c.amount, custom_metadata: c.custom_metadata, _corps: c }
      return json({ 'v1/transaction': transactions[id] }, 201)
    }
    if (methode === 'POST' && /\/token$/.test(chemin)) return json({ token: 't', url: 'https://sandbox-process.fedapay.com/t' }, 201)
    const m = /^\/transactions\/(\d+)$/.exec(chemin)
    return m && transactions[m[1]] ? json({ 'v1/transaction': transactions[m[1]] }) : json({ message: 'Not found' }, 404)
  }
  return null
}

describe('routes avec crédits CST', () => {
  let server, racine
  const appel = (chemin, jeton, corps = {}, methode = 'POST') => realFetch(`${racine}${chemin}`, {
    method: methode,
    headers: { 'content-type': 'application/json', ...(jeton ? { authorization: `Bearer ${jeton}` } : {}) },
    body: methode === 'GET' ? undefined : JSON.stringify(corps),
  })
  const lireAcces = async (jeton) => (await realFetch(`${racine}/api/access`, { headers: jeton ? { authorization: `Bearer ${jeton}` } : {} })).json()
  const messages = [{ role: 'user', content: 'lis ce plan' }]

  before(async () => {
    globalThis.fetch = async (url, init) => fauxExterne(url, init) || realFetch(url, init)
    const { env } = await import('../src/config/env.js')
    env.EMAIL_ADMINS = ['admin@test.local']
    const { createApp } = await import('../src/app.js')
    server = createApp().listen(0); await new Promise((r) => server.once('listening', r))
    racine = `http://127.0.0.1:${server.address().port}`
  })
  after(async () => { globalThis.fetch = realFetch; await new Promise((r) => server.close(r)) })
  beforeEach(() => { base.reinitialiser(); transactions = {}; analyses = [] })

  const calcul = { levels: [{ nom: 'RDC', rez: true, HSP: 3, plancher: 'dallePleine', surfPlancher: 50, pieces: [], murs: [] }], params: { systeme: 'murs', emprise: 50 } }

  describe('lecture de plans (/api/analyse-plan)', () => {
    test('sans jeton → 401', async () => { assert.equal((await appel('/api/analyse-plan', null, { messages })).status, 401) })

    test('connecté sans crédits → 402 credits_insuffisants, rien n’est appelé', async () => {
      const r = await appel('/api/analyse-plan', 'jeton-client', { messages, debutLecture: true })
      assert.equal(r.status, 402)
      const c = await r.json()
      assert.equal(c.error, 'credits_insuffisants')
      assert.equal(c.minimum, 1197)
      assert.equal(c.solde, 0)
      assert.equal(analyses.length, 0)
    })

    test('solde de 1 196 CST → refusé ; 1 197 → accepté (minimum de lecture)', async () => {
      base.donnerSolde('u-client', 1196)
      assert.equal((await appel('/api/analyse-plan', 'jeton-client', { messages, debutLecture: true })).status, 402)
      base.donnerSolde('u-client', 1197)
      assert.equal((await appel('/api/analyse-plan', 'jeton-client', { messages, debutLecture: true })).status, 200)
    })

    test('lecture réussie : réponse du service + bloc cst, solde débité au token (69 CST)', async () => {
      base.donnerSolde('u-riche', 10000)
      const r = await appel('/api/analyse-plan', 'jeton-riche', { messages, debutLecture: true })
      assert.equal(r.status, 200)
      const c = await r.json()
      assert.equal(c.id, 'msg_1')
      assert.deepEqual(c.cst, { cout: 69, solde: 10000 - 69 })
      assert.equal(base.solde('u-riche'), 10000 - 69)
    })

    test('corps invalide → 400 AVANT toute réservation : pas d’appel, pas de débit', async () => {
      base.donnerSolde('u-riche', 10000)
      const r = await appel('/api/analyse-plan', 'jeton-riche', { messages: [], debutLecture: true })
      assert.equal(r.status, 400)
      assert.equal(analyses.length, 0)
      assert.equal(base.solde('u-riche'), 10000)
      assert.equal(base.tables.credits_mouvements.length, 0)
    })

    test('le client ne peut pas imposer le coût ni le solde (champs inconnus ignorés)', async () => {
      base.donnerSolde('u-riche', 10000)
      const r = await appel('/api/analyse-plan', 'jeton-riche', { messages, debutLecture: true, cout: 0, solde: 999999, cst: { cout: 0 } })
      assert.equal((await r.json()).cst.cout, 69)
      assert.equal(base.solde('u-riche'), 10000 - 69)
    })

    test('base de crédits non configurée → 503 (échec fermé)', async () => {
      const { env } = await import('../src/config/env.js')
      const cle = env.SUPABASE_SERVICE_ROLE_KEY; env.SUPABASE_SERVICE_ROLE_KEY = ''
      try { assert.equal((await appel('/api/analyse-plan', 'jeton-client', { messages })).status, 503) } finally { env.SUPABASE_SERVICE_ROLE_KEY = cle }
    })

    test('clé du service d’analyse absente → 501, aucun débit', async () => {
      const { env } = await import('../src/config/env.js')
      base.donnerSolde('u-riche', 10000)
      const cle = env.ANTHROPIC_API_KEY; env.ANTHROPIC_API_KEY = ''
      try { assert.equal((await appel('/api/analyse-plan', 'jeton-riche', { messages })).status, 501) } finally { env.ANTHROPIC_API_KEY = cle }
      assert.equal(base.solde('u-riche'), 10000)
    })
  })

  describe('fonctions gratuites pour tout compte connecté', () => {
    test('/api/calcul — sans jeton → 401 ; connecté SANS crédits → 200', async () => {
      assert.equal((await appel('/api/calcul', null, calcul)).status, 401)
      const r = await appel('/api/calcul', 'jeton-client', calcul)
      assert.equal(r.status, 200)
      assert.ok((await r.json()).dqe.lignes.length > 0)
    })
    test('/api/pdf/devis — sans jeton → 401 ; connecté sans crédits → la validation du corps s’applique (400, pas 402)', async () => {
      assert.equal((await appel('/api/pdf/devis', null, { dqe: { lignes: [] } })).status, 401)
      const r = await appel('/api/pdf/devis', 'jeton-client', { dqe: { lignes: [] } })
      assert.equal(r.status, 400)
      assert.equal((await r.json()).error, 'dqe_vide')
    })
  })

  describe('état d’accès (/api/access)', () => {
    test('anonyme : tarifs publics, solde 0', async () => {
      const a = await lireAcces(null)
      assert.equal(a.statut, 'standard'); assert.equal(a.solde, 0); assert.equal(a.minimumLecture, 1197)
      assert.deepEqual(a.forfaits.map((f) => [f.montant, f.credits]), [[2500, 2500], [5000, 5000], [10000, 10000], [20000, 20000]])
      assert.deepEqual(a.tarif, { entreeMillion: 3000, sortieMillion: 15000 })
      assert.equal(a.paiementDisponible, true)
    })
    test('connecté : reflète le solde et l’historique d’achat', async () => {
      base.donnerSolde('u-riche', 8123)
      let a = await lireAcces('jeton-riche')
      assert.equal(a.solde, 8123); assert.equal(a.aDejaAchete, false)
      base.tables.achats_credits.push({ id: 'a', user_id: 'u-riche', statut: 'paye', fedapay_transaction_id: 'x', montant: 5000, credits: 5000, paye_le: new Date().toISOString() })
      a = await lireAcces('jeton-riche')
      assert.equal(a.aDejaAchete, true)
    })
    test('aucune trace d’abonnement dans la réponse', async () => {
      const a = await lireAcces('jeton-client')
      for (const k of ['abonne', 'abonnement', 'finAbonnement', 'premiumRequis', 'fonctionnalitesPremium']) assert.equal(k in a, false, k)
    })
  })

  describe('administrateur (e-mail confirmé listé dans EMAIL_ADMIN)', () => {
    test('lit des plans sans solde et sans être débité ; statut admin', async () => {
      const r = await appel('/api/analyse-plan', 'jeton-admin', { messages, debutLecture: true })
      assert.equal(r.status, 200)
      assert.equal((await r.json()).cst, undefined)
      assert.equal(base.tables.credits_mouvements.length, 0)
      const a = await lireAcces('jeton-admin')
      assert.equal(a.admin, true); assert.equal(a.statut, 'admin')
    })
    test('même adresse mais e-mail non confirmé → pas administrateur (402)', async () => {
      assert.equal((await appel('/api/analyse-plan', 'jeton-admin-non-verifie', { messages, debutLecture: true })).status, 402)
    })
  })

  describe('achat de crédits (/api/fedapay)', () => {
    const accepter = { acceptation: true, version: '3.3' }

    test('sans acceptation des conditions → 400', async () => {
      assert.equal((await (await appel('/api/fedapay/init', 'jeton-client', { forfait: 5000 })).json()).error, 'conditions_a_accepter')
    })
    test('forfait absent, libre ou inconnu → 400 forfait_invalide, aucune transaction', async () => {
      for (const forfait of [undefined, 1, 2000, 7500, 25000, -5000, 'abc', null]) {
        const r = await appel('/api/fedapay/init', 'jeton-client', { ...accepter, forfait })
        assert.equal(r.status, 400, String(forfait))
        assert.equal((await r.json()).error, 'forfait_invalide')
      }
      assert.equal(Object.keys(transactions).length, 0)
    })
    test('un champ « montant » envoyé par le client est ignoré : seul le forfait compte', async () => {
      const r = await appel('/api/fedapay/init', 'jeton-client', { ...accepter, forfait: 10000, montant: 1, credits: 999999 })
      assert.equal(r.status, 200)
      const c = await r.json()
      assert.deepEqual([c.montant, c.credits], [10000, 10000])
      assert.equal(Object.values(transactions)[0].amount, 10000)
      assert.equal(Object.values(transactions)[0]._corps.custom_metadata.credits, 10000)
    })
    test('forfait valide → URL de paiement, achat « inactif » enregistré, preuve d’acceptation écrite', async () => {
      for (const forfait of [2500, 5000, 10000, 20000]) {
        const c = await (await appel('/api/fedapay/init', 'jeton-client', { ...accepter, forfait })).json()
        assert.match(c.url, /^https:\/\/sandbox-process\.fedapay\.com\//)
        const achat = base.tables.achats_credits.find((a) => a.fedapay_transaction_id === c.id)
        assert.deepEqual([achat.statut, achat.montant, achat.credits, achat.user_id], ['inactif', forfait, forfait, 'u-client'])
      }
      assert.equal(base.tables.preuves_confirmation.filter((p) => p.type === 'acceptation_conditions').length, 1)
      assert.equal(base.solde('u-client'), 0) // payer ne crédite rien tant que FedaPay n’a pas confirmé
    })
    test('sans jeton → 401', async () => { assert.equal((await appel('/api/fedapay/init', null, { ...accepter, forfait: 5000 })).status, 401) })

    test('retour navigateur : transaction approuvée → crédits ajoutés, puis l’achat permet de lire', async () => {
      const c = await (await appel('/api/fedapay/init', 'jeton-client', { ...accepter, forfait: 5000 })).json()
      let v = await (await appel('/api/fedapay/verify', 'jeton-client', { id: c.id })).json()
      assert.equal(v.credite, false); assert.equal(v.statut, 'pending'); assert.equal(base.solde('u-client'), 0)
      transactions[c.id].status = 'approved'
      v = await (await appel('/api/fedapay/verify', 'jeton-client', { id: c.id })).json()
      assert.deepEqual([v.credite, v.credits, v.solde], [true, 5000, 5000])
      await appel('/api/fedapay/verify', 'jeton-client', { id: c.id }) // rejeu : sans effet
      assert.equal(base.solde('u-client'), 5000)
      assert.equal((await appel('/api/analyse-plan', 'jeton-client', { messages, debutLecture: true })).status, 200)
    })
    test('verify sans id : reprend la dernière transaction en attente', async () => {
      const c = await (await appel('/api/fedapay/init', 'jeton-client', { ...accepter, forfait: 2500 })).json()
      transactions[c.id].status = 'approved'
      const v = await (await appel('/api/fedapay/verify', 'jeton-client', {})).json()
      assert.equal(v.credite, true); assert.equal(base.solde('u-client'), 2500)
    })
    test('verify : la transaction d’un autre compte → 403', async () => {
      const c = await (await appel('/api/fedapay/init', 'jeton-client', { ...accepter, forfait: 5000 })).json()
      transactions[c.id].status = 'approved'
      assert.equal((await appel('/api/fedapay/verify', 'jeton-riche', { id: c.id })).status, 403)
      assert.equal(base.solde('u-client'), 0)
    })

    test('webhook : signature valide → crédits ; signature invalide → 401, aucun crédit', async () => {
      const c = await (await appel('/api/fedapay/init', 'jeton-client', { ...accepter, forfait: 20000 })).json()
      transactions[c.id].status = 'approved'
      const corps = JSON.stringify({ name: 'transaction.approved', entity: { id: Number(c.id) } })
      const t = 1700000000
      const sig = (secret) => `t=${t},s=${crypto.createHmac('sha256', secret).update(`${t}.${corps}`).digest('hex')}`
      const envoyer = (secret) => realFetch(`${racine}/api/fedapay/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-fedapay-signature': sig(secret) }, body: corps })
      assert.equal((await envoyer('mauvais-secret')).status, 401)
      assert.equal(base.solde('u-client'), 0)
      assert.equal((await envoyer('whsec_test')).status, 200)
      assert.equal(base.solde('u-client'), 20000)
      assert.equal((await envoyer('whsec_test')).status, 200) // FedaPay réessaie : pas de double crédit
      assert.equal(base.solde('u-client'), 20000)
    })
  })

  describe('compte', () => {
    test('DELETE /api/compte — sans confirmation → 400 ; sans jeton → 401', async () => {
      assert.equal((await appel('/api/compte', null, { confirmation: 'SUPPRIMER' }, 'DELETE')).status, 401)
      assert.equal((await appel('/api/compte', 'jeton-client', {}, 'DELETE')).status, 400)
    })
  })

  describe('route de confirmation (renvoi)', () => {
    test('POST /api/credits/confirmation/renvoyer existe (e-mail non configuré → 503) ; l’ancienne route d’abonnement a disparu', async () => {
      assert.equal((await appel('/api/credits/confirmation/renvoyer', 'jeton-client')).status, 503)
      assert.equal((await appel('/api/abonnement/confirmation/renvoyer', 'jeton-client')).status, 404)
    })
    test('la tâche d’échéances (expiration des crédits) existe : refusée sans secret (503 si CRON_SECRET absent)', async () => {
      assert.equal((await appel('/api/cron/echeances', null)).status, 503)
    })
  })
})
