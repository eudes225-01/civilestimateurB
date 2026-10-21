// test/fedapay.test.js
// Teste le flux de paiement SANS réseau : fetch est remplacé par de faux serveurs FedaPay et
// Supabase (en mémoire). Vérifie la signature du webhook, la création de transaction, l'activation
// idempotente et les refus (mauvais propriétaire, montant insuffisant, paiement non approuvé).
import { test, describe, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

process.env.FEDAPAY_SECRET_KEY = 'sk_sandbox_test'
process.env.FEDAPAY_WEBHOOK_SECRET = 'whsec_test'
process.env.SUPABASE_URL = 'https://demo.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test'
process.env.FEDAPAY_MONTANT = '5000'
process.env.FEDAPAY_DUREE_JOURS = '30'

const { env } = await import('../src/config/env.js')
const fedapay = await import('../src/services/fedapay.js')
const { confirmerTransaction } = await import('../src/services/paiement.js')
const { abonnementActif, enregistrerTransaction } = await import('../src/services/abonnements.js')

const realFetch = globalThis.fetch
let lignes // table abonnements en mémoire
let transactions // transactions côté FedaPay
let appels

function reponse(corps, status = 200) {
  return new Response(corps === null ? '' : JSON.stringify(corps), { status, headers: { 'content-type': 'application/json' } })
}

// Équivalent JS de la fonction SQL activer_abonnement : s'exécute d'un seul bloc synchrone, comme le
// verrou consultatif de Postgres sérialise les activations d'un même utilisateur.
function rpcActiver({ p_tx_id: txId, p_duree_jours: jours }) {
  const l = lignes.find((x) => x.fedapay_transaction_id === txId)
  if (!l) return reponse({ message: 'transaction_inconnue' }, 404)
  if (l.statut !== 'inactif') return reponse([{ fin_abo: l.fin, est_nouveau: false, est_renouvellement: false }])
  const now = new Date()
  const enc = lignes.filter((x) => x.user_id === l.user_id && x.statut === 'actif' && new Date(x.fin) > now).map((x) => new Date(x.fin).getTime())
  const base = enc.length ? Math.max(...enc) : now.getTime()
  const fin = new Date(base + jours * 86400000).toISOString()
  Object.assign(l, { statut: 'actif', debut: now.toISOString(), fin })
  return reponse([{ fin_abo: fin, est_nouveau: true, est_renouvellement: enc.length > 0 }])
}

// Mini PostgREST : gère uniquement les requêtes émises par services/abonnements.js.
function fauxSupabase(url, init) {
  const u = new URL(url)
  const p = u.searchParams
  const methode = init.method || 'GET'
  const eq = (champ) => (p.get(champ) || '').replace(/^eq\./, '')
  const corps = init.body ? JSON.parse(init.body) : null

  if (methode === 'POST' && u.pathname.endsWith('/rpc/activer_abonnement')) return rpcActiver(corps)
  if (methode === 'POST') {
    if (!lignes.some((l) => l.fedapay_transaction_id === corps.fedapay_transaction_id)) {
      lignes.push({ id: crypto.randomUUID(), debut: null, fin: null, cree_le: new Date().toISOString(), ...corps })
    }
    return reponse(null, 201)
  }
  if (methode === 'PATCH') {
    const cibles = lignes.filter((l) => l.fedapay_transaction_id === eq('fedapay_transaction_id') && l.statut !== 'actif')
    cibles.forEach((l) => Object.assign(l, corps))
    return reponse(cibles)
  }
  // GET
  let res = lignes.slice()
  if (p.get('user_id')) res = res.filter((l) => l.user_id === eq('user_id'))
  if (p.get('fedapay_transaction_id') && !p.get('fedapay_transaction_id').startsWith('not.')) res = res.filter((l) => l.fedapay_transaction_id === eq('fedapay_transaction_id'))
  if (p.get('statut')) res = res.filter((l) => l.statut === eq('statut'))
  if (p.get('fin')) res = res.filter((l) => l.fin && new Date(l.fin) > new Date(p.get('fin').replace(/^gt\./, '')))
  res.sort((a, b) => String(b.fin || b.cree_le).localeCompare(String(a.fin || a.cree_le)))
  return reponse(res.slice(0, Number(p.get('limit')) || 100))
}

function fauxFedapay(url, init) {
  const chemin = new URL(url).pathname.replace(/^\/v1/, '')
  const methode = init.method || 'GET'
  assert.equal(init.headers.Authorization, 'Bearer sk_sandbox_test')
  if (methode === 'POST' && chemin === '/transactions') {
    const corps = JSON.parse(init.body)
    const id = 1000 + Object.keys(transactions).length
    transactions[id] = { id, status: 'pending', amount: corps.amount, custom_metadata: corps.custom_metadata, _corps: corps }
    return reponse({ 'v1/transaction': transactions[id] }, 201)
  }
  const jeton = /^\/transactions\/(\d+)\/token$/.exec(chemin)
  if (methode === 'POST' && jeton) return reponse({ token: 'tok_abc', url: `https://sandbox-process.fedapay.com/tok_abc` }, 201)
  const lecture = /^\/transactions\/(\d+)$/.exec(chemin)
  if (methode === 'GET' && lecture) {
    const tx = transactions[lecture[1]]
    return tx ? reponse({ 'v1/transaction': tx }) : reponse({ message: 'Not found' }, 404)
  }
  return reponse({ message: 'route inattendue' }, 500)
}

before(() => {
  globalThis.fetch = async (url, init = {}) => {
    appels.push(String(url))
    if (String(url).startsWith('https://demo.supabase.co/rest/v1/abonnements') || String(url).startsWith('https://demo.supabase.co/rest/v1/rpc/activer_abonnement')) return fauxSupabase(String(url), init)
    if (String(url).includes('fedapay.com')) return fauxFedapay(String(url), init)
    throw new Error(`appel réseau inattendu : ${url}`)
  }
})
after(() => { globalThis.fetch = realFetch })
beforeEach(() => { lignes = []; transactions = {}; appels = [] })

const USER = '11111111-1111-1111-1111-111111111111'
const AUTRE = '22222222-2222-2222-2222-222222222222'

describe('environnement', () => {
  test('FEDAPAY_ENV est déduit de la clé sandbox', () => assert.equal(env.FEDAPAY_ENV, 'sandbox'))
})

describe('signature du webhook', () => {
  const corps = Buffer.from(JSON.stringify({ name: 'transaction.approved', entity: { id: 1000 } }))
  const signer = (t, secret = 'whsec_test') => `t=${t},s=${crypto.createHmac('sha256', secret).update(`${t}.${corps}`).digest('hex')}`

  test('signature valide acceptée', () => assert.equal(fedapay.verifierSignature(corps, signer(1700000000), 'whsec_test'), true))
  test('mauvais secret refusé', () => assert.equal(fedapay.verifierSignature(corps, signer(1700000000, 'autre'), 'whsec_test'), false))
  test('corps modifié refusé', () => assert.equal(fedapay.verifierSignature(Buffer.from('{"x":1}'), signer(1700000000), 'whsec_test'), false))
  test('en-tête absent ou mal formé refusé', () => {
    assert.equal(fedapay.verifierSignature(corps, undefined, 'whsec_test'), false)
    assert.equal(fedapay.verifierSignature(corps, 'n_importe_quoi', 'whsec_test'), false)
  })
})

describe('création de transaction', () => {
  test('envoie montant XOF, callback et métadonnées, renvoie l’URL de paiement', async () => {
    const tx = await fedapay.creerTransaction({
      montant: 5000, description: 'Abo', callbackUrl: 'https://site.test/?paiement=retour', reference: 'ce-1',
      client: { email: 'a@b.c', prenom: 'Awa', nom: 'Dossou' }, metadata: { user_id: USER },
    })
    assert.equal(tx.id, '1000')
    assert.match(tx.url, /^https:\/\/sandbox-process\.fedapay\.com\//)
    const envoye = transactions[1000]._corps
    assert.equal(envoye.amount, 5000)
    assert.deepEqual(envoye.currency, { iso: 'XOF' })
    assert.equal(envoye.callback_url, 'https://site.test/?paiement=retour')
    assert.deepEqual(envoye.customer, { email: 'a@b.c', firstname: 'Awa', lastname: 'Dossou' })
    assert.ok(appels.every((a) => a.startsWith('https://sandbox-api.fedapay.com/v1/')))
  })
})

describe('confirmation et activation', () => {
  async function payer(userId, statut = 'approved', montant = 5000) {
    const tx = await fedapay.creerTransaction({ montant, description: 'Abo', reference: 'r', metadata: { user_id: userId } })
    await enregistrerTransaction({ userId, txId: tx.id, montant })
    transactions[tx.id].status = statut
    return tx.id
  }

  test('paiement approuvé → abonnement actif ~30 jours', async () => {
    const id = await payer(USER)
    const r = await confirmerTransaction(id, { userId: USER })
    assert.equal(r.actif, true)
    const jours = (new Date(r.fin) - Date.now()) / 86400000
    assert.ok(jours > 29.9 && jours <= 30.01, `durée inattendue : ${jours}`)
    assert.ok(await abonnementActif(USER))
  })

  test('idempotent : webhook + retour navigateur ne créditent qu’une fois', async () => {
    const id = await payer(USER)
    const a = await confirmerTransaction(id)
    const b = await confirmerTransaction(id, { userId: USER })
    assert.equal(a.fin, b.fin)
  })

  test('renouvellement : la durée s’ajoute à l’abonnement en cours', async () => {
    const a = await confirmerTransaction(await payer(USER))
    const b = await confirmerTransaction(await payer(USER))
    const ecart = (new Date(b.fin) - new Date(a.fin)) / 86400000
    assert.ok(ecart > 29.9 && ecart < 30.1, `écart inattendu : ${ecart}`)
  })

  test('deux paiements distincts confirmés EN MÊME TEMPS : les deux mois sont crédités', async () => {
    const a = await payer(USER)
    const b = await payer(USER)
    const [ra, rb] = await Promise.all([confirmerTransaction(a), confirmerTransaction(b)])
    const fins = [ra.fin, rb.fin].map((f) => new Date(f).getTime()).sort((x, y) => x - y)
    assert.ok(Math.abs((fins[1] - fins[0]) / 86400000 - 30) < 0.1, 'les deux échéances doivent être espacées de 30 jours')
    const total = (new Date((await abonnementActif(USER)).fin) - Date.now()) / 86400000
    assert.ok(total > 59.9 && total <= 60.01, `durée totale attendue ≈ 60 j, obtenue ${total}`)
  })

  test('rejeu du webhook d’une transaction expirée : aucune durée supplémentaire', async () => {
    const id = await payer(USER)
    await confirmerTransaction(id)
    const ligne = lignes.find((l) => l.fedapay_transaction_id === id)
    Object.assign(ligne, { statut: 'expire', fin: new Date(Date.now() - 86400000).toISOString() })
    const avant = ligne.fin
    await confirmerTransaction(id)
    assert.equal(ligne.statut, 'expire')
    assert.equal(ligne.fin, avant)
    assert.equal(await abonnementActif(USER), null)
  })

  test('paiement en attente / refusé → pas d’abonnement', async () => {
    for (const statut of ['pending', 'declined', 'canceled']) {
      const r = await confirmerTransaction(await payer(USER, statut), { userId: USER })
      assert.equal(r.actif, false)
      assert.equal(r.statut, statut)
    }
    assert.equal(await abonnementActif(USER), null)
  })

  test('la transaction d’un autre utilisateur est refusée', async () => {
    const id = await payer(AUTRE)
    const r = await confirmerTransaction(id, { userId: USER })
    assert.equal(r.statut, 'interdit')
    assert.equal(await abonnementActif(USER), null)
    assert.equal(await abonnementActif(AUTRE), null)
  })

  test('montant inférieur au prix → refusé', async () => {
    const id = await payer(USER, 'approved', 100)
    transactions[id].amount = 100
    lignes.find((l) => l.fedapay_transaction_id === id).montant = 5000 // prix attendu enregistré à l’init
    const r = await confirmerTransaction(id, { userId: USER })
    assert.equal(r.statut, 'montant_invalide')
    assert.equal(await abonnementActif(USER), null)
  })

  test('webhook sans ligne préalable : propriétaire retrouvé via custom_metadata', async () => {
    const tx = await fedapay.creerTransaction({ montant: 5000, description: 'Abo', reference: 'r', metadata: { user_id: USER } })
    transactions[tx.id].status = 'approved'
    const r = await confirmerTransaction(tx.id)
    assert.equal(r.actif, true)
    assert.ok(await abonnementActif(USER))
  })

  test('transaction approuvée sans propriétaire connu → ignorée', async () => {
    const tx = await fedapay.creerTransaction({ montant: 5000, description: 'Abo', reference: 'r' })
    transactions[tx.id].status = 'approved'
    assert.equal((await confirmerTransaction(tx.id)).statut, 'inconnue')
  })
})
