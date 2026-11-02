// test/fedapay.test.js
// Teste le flux d'achat de crédits SANS réseau : fetch est remplacé par de faux serveurs FedaPay et
// Supabase (en mémoire). Vérifie la signature du webhook, la création de transaction, le crédit idempotent
// du solde et les refus (mauvais propriétaire, montant insuffisant, paiement non approuvé, montant hors forfait).
import { test, describe, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { creerFauxSupabase } from './helpers/faux-supabase.js'

process.env.FEDAPAY_SECRET_KEY = 'sk_sandbox_test'
process.env.FEDAPAY_WEBHOOK_SECRET = 'whsec_test'
process.env.SUPABASE_URL = 'https://demo.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test'

const { env } = await import('../src/config/env.js')
const fedapay = await import('../src/services/fedapay.js')
const { confirmerTransaction } = await import('../src/services/paiement.js')
const { soldeUtilisateur, enregistrerAchat, trouverAchat } = await import('../src/services/credits.js')

const realFetch = globalThis.fetch
const base = creerFauxSupabase()
let transactions // transactions côté FedaPay
let appels

const reponse = (corps, status = 200) => new Response(corps === null ? '' : JSON.stringify(corps), { status, headers: { 'content-type': 'application/json' } })

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
    const s = base.repondre(url, init)
    if (s) return s
    if (String(url).includes('fedapay.com')) return fauxFedapay(String(url), init)
    throw new Error(`appel réseau inattendu : ${url}`)
  }
})
after(() => { globalThis.fetch = realFetch })
beforeEach(() => { base.reinitialiser(); transactions = {}; appels = [] })

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
      montant: 5000, description: 'Crédits', callbackUrl: 'https://site.test/?paiement=retour', reference: 'ce-1',
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

describe('confirmation et crédit du solde', () => {
  async function payer(userId, statut = 'approved', montant = 5000) {
    const tx = await fedapay.creerTransaction({ montant, description: 'Crédits', reference: 'r', metadata: { user_id: userId } })
    await enregistrerAchat({ userId, txId: tx.id, montant, credits: montant })
    transactions[tx.id].status = statut
    return tx.id
  }

  test('paiement approuvé → solde crédité du forfait (1 FCFA = 1 CST)', async () => {
    const id = await payer(USER, 'approved', 5000)
    const r = await confirmerTransaction(id, { userId: USER })
    assert.equal(r.credite, true)
    assert.equal(r.credits, 5000)
    assert.equal(r.solde, 5000)
    assert.equal(await soldeUtilisateur(USER), 5000)
    assert.equal((await trouverAchat(id)).statut, 'paye')
  })

  test('chacun des quatre forfaits crédite le bon nombre de CST', async () => {
    let attendu = 0
    for (const m of [2500, 5000, 10000, 20000]) {
      const r = await confirmerTransaction(await payer(USER, 'approved', m), { userId: USER })
      attendu += m
      assert.equal(r.credits, m)
      assert.equal(await soldeUtilisateur(USER), attendu)
    }
    assert.equal(attendu, 37500)
  })

  test('idempotent : webhook + retour navigateur ne créditent qu’une fois', async () => {
    const id = await payer(USER)
    const a = await confirmerTransaction(id)
    const b = await confirmerTransaction(id, { userId: USER })
    assert.equal(a.solde, 5000)
    assert.equal(b.solde, 5000)
    assert.equal(await soldeUtilisateur(USER), 5000)
    assert.equal(base.tables.credits_mouvements.filter((m) => m.type === 'achat').length, 1)
  })

  test('deux achats s’additionnent au solde existant', async () => {
    await confirmerTransaction(await payer(USER, 'approved', 2500))
    const r = await confirmerTransaction(await payer(USER, 'approved', 10000))
    assert.equal(r.solde, 12500)
  })

  test('deux paiements distincts confirmés EN MÊME TEMPS : les deux sont crédités', async () => {
    const a = await payer(USER, 'approved', 5000)
    const b = await payer(USER, 'approved', 10000)
    await Promise.all([confirmerTransaction(a), confirmerTransaction(b)])
    assert.equal(await soldeUtilisateur(USER), 15000)
  })

  test('paiement en attente / refusé / annulé → aucun crédit', async () => {
    for (const statut of ['pending', 'declined', 'canceled']) {
      const r = await confirmerTransaction(await payer(USER, statut), { userId: USER })
      assert.equal(r.credite, false)
      assert.equal(r.statut, statut)
    }
    assert.equal(await soldeUtilisateur(USER), 0)
  })

  test('la transaction d’un autre utilisateur est refusée', async () => {
    const id = await payer(AUTRE)
    const r = await confirmerTransaction(id, { userId: USER })
    assert.equal(r.statut, 'interdit')
    assert.equal(await soldeUtilisateur(USER), 0)
    assert.equal(await soldeUtilisateur(AUTRE), 0)
  })

  test('montant payé inférieur au forfait enregistré → refusé, aucun crédit', async () => {
    const id = await payer(USER, 'approved', 100)
    transactions[id].amount = 100
    base.tables.achats_credits.find((l) => l.fedapay_transaction_id === id).montant = 5000 // forfait enregistré à l’init
    const r = await confirmerTransaction(id, { userId: USER })
    assert.equal(r.statut, 'montant_invalide')
    assert.equal(await soldeUtilisateur(USER), 0)
  })

  test('webhook sans ligne préalable : propriétaire retrouvé via custom_metadata, montant = un forfait', async () => {
    const tx = await fedapay.creerTransaction({ montant: 10000, description: 'Crédits', reference: 'r', metadata: { user_id: USER } })
    transactions[tx.id].status = 'approved'
    const r = await confirmerTransaction(tx.id)
    assert.equal(r.credite, true)
    assert.equal(await soldeUtilisateur(USER), 10000)
  })

  test('webhook sans ligne préalable et montant HORS forfait → refusé', async () => {
    const tx = await fedapay.creerTransaction({ montant: 7777, description: 'Crédits', reference: 'r', metadata: { user_id: USER } })
    transactions[tx.id].status = 'approved'
    assert.equal((await confirmerTransaction(tx.id)).statut, 'montant_invalide')
    assert.equal(await soldeUtilisateur(USER), 0)
  })

  test('transaction approuvée sans propriétaire connu → ignorée', async () => {
    const tx = await fedapay.creerTransaction({ montant: 5000, description: 'Crédits', reference: 'r' })
    transactions[tx.id].status = 'approved'
    assert.equal((await confirmerTransaction(tx.id)).statut, 'inconnue')
  })
})
