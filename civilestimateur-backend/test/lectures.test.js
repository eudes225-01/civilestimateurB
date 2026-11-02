// test/lectures.test.js
// Facturation de la lecture de plans en crédits CST, au nombre de tokens réellement traités — SANS réseau :
// fetch est remplacé par un faux Supabase (en mémoire) et un faux service d'analyse (Anthropic).
import { test, describe, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { creerFauxSupabase } from './helpers/faux-supabase.js'

process.env.SUPABASE_URL = 'https://demo.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test'
process.env.ANTHROPIC_API_KEY = 'cle-anthropic-test'

const { env } = await import('../src/config/env.js')
env.EMAIL_ADMINS = ['admin@test.local']
const { lancerAnalyse } = await import('../src/services/lectures.js')
const { coutTokens, reserveAppel } = await import('../src/services/tarifs.js')

const realFetch = globalThis.fetch
const base = creerFauxSupabase()
let anthropic // { statut, corps } de la prochaine réponse, ou { panne: true }
let appelsAnthropic

const reponse = (corps, status = 200) => new Response(JSON.stringify(corps), { status, headers: { 'content-type': 'application/json' } })

before(() => {
  globalThis.fetch = async (url, init = {}) => {
    const s = base.repondre(url, init)
    if (s) return s
    if (String(url) === 'https://api.anthropic.com/v1/messages') {
      appelsAnthropic.push({ ...JSON.parse(init.body), cle: init.headers['x-api-key'] })
      if (anthropic.panne) throw new Error('réseau coupé')
      return reponse(anthropic.corps, anthropic.statut || 200)
    }
    throw new Error(`appel réseau inattendu : ${url}`)
  }
})
after(() => { globalThis.fetch = realFetch })
beforeEach(() => {
  base.reinitialiser(); appelsAnthropic = []
  anthropic = { corps: { id: 'msg_1', content: [{ type: 'text', text: '{}' }], usage: { input_tokens: 8000, output_tokens: 3000 } } }
})

const USER = { id: 'u-client', email: 'client@test.local', emailVerifie: true }
const ADMIN = { id: 'u-admin', email: 'Admin@Test.local', emailVerifie: true }
const messages = [{ role: 'user', content: 'lis ce plan' }]
const mouvements = (uid) => base.tables.credits_mouvements.filter((m) => m.user_id === uid)

describe('démarrage d’une lecture : solde minimum', () => {
  test('solde sous le minimum (2 500 CST) → 402, rien n’est appelé ni débité', async () => {
    base.donnerSolde(USER.id, 2499)
    const r = await lancerAnalyse({ user: USER, messages, debut: true })
    assert.equal(r.status, 402)
    assert.deepEqual(r.body, { error: 'credits_insuffisants', solde: 2499, requis: 2500, minimum: 2500 })
    assert.equal(appelsAnthropic.length, 0)
    assert.equal(base.solde(USER.id), 2499)
    assert.equal(mouvements(USER.id).length, 0)
  })

  test('aucun achat (pas de solde) → 402 avec solde 0', async () => {
    const r = await lancerAnalyse({ user: USER, messages, debut: true })
    assert.equal(r.status, 402)
    assert.equal(r.body.solde, 0)
    assert.equal(appelsAnthropic.length, 0)
  })

  test('solde pile au minimum → la lecture démarre', async () => {
    base.donnerSolde(USER.id, 2500)
    const r = await lancerAnalyse({ user: USER, messages, debut: true })
    assert.equal(r.status, 200)
    assert.equal(appelsAnthropic.length, 1)
  })
})

describe('facturation au token', () => {
  test('coût = tokens réellement traités ; l’excédent de la réserve est restitué', async () => {
    base.donnerSolde(USER.id, 5000)
    const r = await lancerAnalyse({ user: USER, messages, debut: true })
    const cout = coutTokens({ entree: 8000, sortie: 3000 }) // 24 + 45 = 69 CST
    assert.equal(cout, 69)
    assert.equal(r.status, 200)
    assert.deepEqual(r.body.cst, { cout: 69, solde: 5000 - 69 })
    assert.equal(base.solde(USER.id), 5000 - 69)
    assert.equal(r.body.id, 'msg_1') // la réponse du service d’analyse est transmise telle quelle
  })

  test('le journal garde la réserve, le règlement et les tokens', async () => {
    base.donnerSolde(USER.id, 5000)
    await lancerAnalyse({ user: USER, messages })
    const [res, reg] = mouvements(USER.id)
    assert.equal(res.type, 'reservation'); assert.equal(res.montant, -reserveAppel())
    assert.equal(reg.type, 'regularisation'); assert.equal(reg.montant, reserveAppel() - 69)
    assert.equal(reg.ref, res.ref)
    assert.deepEqual([reg.tokens_entree, reg.tokens_sortie], [8000, 3000])
    assert.equal(res.montant + reg.montant, -69) // somme des mouvements = coût réel
  })

  test('plus de tokens → plus de CST', async () => {
    base.donnerSolde(USER.id, 20000)
    anthropic.corps.usage = { input_tokens: 20000, output_tokens: 10000 }
    const grand = await lancerAnalyse({ user: USER, messages })
    anthropic.corps.usage = { input_tokens: 2000, output_tokens: 500 }
    const petit = await lancerAnalyse({ user: USER, messages })
    assert.ok(grand.body.cst.cout > petit.body.cst.cout)
  })

  test('le prix et les paramètres envoyés au service viennent du serveur (clé, modèle, plafond)', async () => {
    base.donnerSolde(USER.id, 5000)
    await lancerAnalyse({ user: USER, messages })
    assert.equal(appelsAnthropic[0].cle, 'cle-anthropic-test')
    assert.equal(appelsAnthropic[0].max_tokens, env.ANTHROPIC_MAX_TOKENS)
    assert.deepEqual(appelsAnthropic[0].messages, messages)
  })
})

describe('suite d’une lecture (appels suivants)', () => {
  test('sans « début », le minimum de 2 500 n’est plus exigé : seule la réserve de l’appel compte', async () => {
    base.donnerSolde(USER.id, reserveAppel() + 10)
    const r = await lancerAnalyse({ user: USER, messages, debut: false })
    assert.equal(r.status, 200)
  })
  test('solde inférieur à la réserve → 402, aucun appel', async () => {
    base.donnerSolde(USER.id, reserveAppel() - 1)
    const r = await lancerAnalyse({ user: USER, messages, debut: false })
    assert.equal(r.status, 402)
    assert.equal(r.body.requis, reserveAppel())
    assert.equal(appelsAnthropic.length, 0)
    assert.equal(base.solde(USER.id), reserveAppel() - 1)
  })
  test('une lecture de plusieurs appels : le solde baisse de la somme des coûts réels', async () => {
    base.donnerSolde(USER.id, 2500)
    let total = 0
    for (let i = 0; i < 6; i++) { const r = await lancerAnalyse({ user: USER, messages, debut: i === 0 }); assert.equal(r.status, 200); total += r.body.cst.cout }
    assert.equal(base.solde(USER.id), 2500 - total)
    assert.equal(total, 6 * 69)
  })
})

describe('échecs : on ne facture pas ce qui n’a pas été fourni', () => {
  test('panne réseau vers le service d’analyse → 500 et réserve entièrement rendue', async () => {
    base.donnerSolde(USER.id, 3000)
    anthropic = { panne: true }
    const r = await lancerAnalyse({ user: USER, messages })
    assert.equal(r.status, 500)
    assert.equal(r.body.error, 'proxy')
    assert.equal(base.solde(USER.id), 3000)
  })
  test('erreur renvoyée par le service d’analyse (ex. 529 surcharge) → statut transmis, aucun CST débité', async () => {
    base.donnerSolde(USER.id, 3000)
    anthropic = { statut: 529, corps: { type: 'error', error: { type: 'overloaded_error', message: 'surcharge' } } }
    const r = await lancerAnalyse({ user: USER, messages })
    assert.equal(r.status, 529)
    assert.equal(r.body.error.type, 'overloaded_error')
    assert.deepEqual(r.body.cst, { cout: 0, solde: 3000 })
    assert.equal(base.solde(USER.id), 3000)
  })
  test('réponse sans « usage » → la réserve est facturée (jamais gratuit), jamais plus', async () => {
    base.donnerSolde(USER.id, 3000)
    anthropic.corps = { id: 'msg_x', content: [] }
    const r = await lancerAnalyse({ user: USER, messages })
    assert.equal(r.body.cst.cout, reserveAppel())
    assert.equal(base.solde(USER.id), 3000 - reserveAppel())
  })
  test('panne du règlement : la réponse est quand même livrée, seule la réserve reste débitée', async () => {
    base.donnerSolde(USER.id, 3000)
    const f = globalThis.fetch
    globalThis.fetch = async (url, init) => (String(url).endsWith('/rpc/regler_credits') ? reponse({ message: 'panne' }, 500) : f(url, init))
    const log = console.error; console.error = () => {}
    try {
      const r = await lancerAnalyse({ user: USER, messages })
      assert.equal(r.status, 200)
      assert.equal(r.body.cst, undefined)
      assert.equal(base.solde(USER.id), 3000 - reserveAppel())
    } finally { globalThis.fetch = f; console.error = log }
  })
  test('base de crédits en panne à la réservation → 503, aucun appel au service', async () => {
    const f = globalThis.fetch
    globalThis.fetch = async (url, init) => (String(url).includes('/rpc/reserver_credits') ? reponse({ message: 'panne' }, 500) : f(url, init))
    const log = console.error; console.error = () => {}
    try {
      const r = await lancerAnalyse({ user: USER, messages })
      assert.equal(r.status, 503)
      assert.equal(r.body.error, 'credits_indisponibles')
      assert.equal(appelsAnthropic.length, 0)
    } finally { globalThis.fetch = f; console.error = log }
  })
})

describe('le solde ne devient jamais négatif', () => {
  test('appels simultanés : seuls ceux que le solde couvre partent', async () => {
    const n = 5
    base.donnerSolde(USER.id, reserveAppel() * 2 + 5) // couvre exactement 2 réserves
    const res = await Promise.all(Array.from({ length: n }, () => lancerAnalyse({ user: USER, messages })))
    assert.equal(res.filter((r) => r.status === 200).length, 2)
    assert.equal(res.filter((r) => r.status === 402).length, n - 2)
    assert.equal(appelsAnthropic.length, 2)
    assert.ok(base.solde(USER.id) >= 0)
  })
  test('coût réel supérieur à la réserve : supplément prélevé dans la limite du solde, jamais sous zéro', async () => {
    base.donnerSolde(USER.id, reserveAppel() + 3)
    anthropic.corps.usage = { input_tokens: 2_000_000, output_tokens: 500_000 } // bien au-dessus de la réserve
    const r = await lancerAnalyse({ user: USER, messages })
    assert.equal(r.status, 200)
    assert.equal(base.solde(USER.id), 0)
    assert.equal(r.body.cst.cout, reserveAppel() + 3) // tout le solde, pas plus
  })
})

describe('administrateur', () => {
  test('jamais débité, même sans solde ; la réponse n’a pas de bloc cst', async () => {
    const r = await lancerAnalyse({ user: ADMIN, messages, debut: true })
    assert.equal(r.status, 200)
    assert.equal(r.body.cst, undefined)
    assert.equal(appelsAnthropic.length, 1)
    assert.equal(base.tables.credits_mouvements.length, 0)
  })
  test('adresse non confirmée → traité comme un client (402 sans solde)', async () => {
    const r = await lancerAnalyse({ user: { ...ADMIN, emailVerifie: false }, messages, debut: true })
    assert.equal(r.status, 402)
  })
})
