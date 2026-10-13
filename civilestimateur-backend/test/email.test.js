// test/email.test.js
// Teste les e-mails Resend SANS réseau : fetch est remplacé par de faux Resend / Supabase / FedaPay.
import { test, describe, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'

process.env.FEDAPAY_SECRET_KEY = 'sk_sandbox_test'
process.env.SUPABASE_URL = 'https://demo.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test'
process.env.FEDAPAY_MONTANT = '5000'
process.env.FEDAPAY_DUREE_JOURS = '30'
process.env.RESEND_API_KEY = 're_test_123'
process.env.EMAIL_FROM = 'CivilEstimateur <no-reply@exemple.test>'
process.env.EMAIL_ADMIN = 'admin@exemple.test, testeur@exemple.test'
process.env.APP_URL = 'https://app.exemple.test'
process.env.RAPPEL_JOURS = '3'

const fedapay = await import('../src/services/fedapay.js')
const { confirmerTransaction } = await import('../src/services/paiement.js')
const { enregistrerTransaction } = await import('../src/services/abonnements.js')
const { traiterEcheances, attendreNotifications } = await import('../src/services/notifications.js')
const { reserverBienvenue } = await import('../src/services/profils.js')
const mails = await import('../src/services/email.js')

const realFetch = globalThis.fetch
const JOUR = 86400000
const USER = '11111111-1111-1111-1111-111111111111'
let tables, transactions, envoyes, resendEnPanne

const reponse = (corps, status = 200) => new Response(corps === null ? '' : JSON.stringify(corps), { status, headers: { 'content-type': 'application/json' } })

// Mini PostgREST générique (eq, neq, gt, lte, is.null, not.is.null ; order, limit, on_conflict).
function fauxSupabase(url, init) {
  const u = new URL(url)
  const table = u.pathname.replace('/rest/v1/', '')
  const lignes = tables[table]
  const methode = init.method || 'GET'
  const corps = init.body ? JSON.parse(init.body) : null
  const reserves = new Set(['select', 'order', 'limit', 'on_conflict'])
  const filtres = [...u.searchParams.entries()].filter(([k]) => !reserves.has(k))
  const ok = (l) => filtres.every(([k, v]) => {
    const x = l[k]
    if (v === 'is.null') return x === null || x === undefined
    if (v === 'not.is.null') return x !== null && x !== undefined
    const [op, ...r] = v.split('.'); const val = r.join('.')
    if (op === 'eq') return String(x) === val
    if (op === 'neq') return String(x) !== val
    if (op === 'gt') return x && new Date(x) > new Date(val)
    if (op === 'lte') return x && new Date(x) <= new Date(val)
    throw new Error(`filtre non géré : ${k}=${v}`)
  })
  if (methode === 'POST') {
    const cle = u.searchParams.get('on_conflict') || 'id'
    if (!lignes.some((l) => l[cle] === corps[cle])) lignes.push({ debut: null, fin: null, ...corps, id: corps.id || `id-${lignes.length + 1}` })
    return reponse(null, 201)
  }
  if (methode === 'PATCH') {
    const cibles = lignes.filter(ok)
    cibles.forEach((l) => Object.assign(l, corps))
    return reponse(cibles)
  }
  let res = lignes.filter(ok)
  const ordre = u.searchParams.get('order')
  if (ordre) { const [champ, dir] = ordre.split('.'); res.sort((a, b) => (dir === 'desc' ? -1 : 1) * String(a[champ]).localeCompare(String(b[champ]))) }
  return reponse(res.slice(0, Number(u.searchParams.get('limit')) || 100))
}

function fauxFedapay(url, init) {
  const chemin = new URL(url).pathname.replace(/^\/v1/, '')
  const methode = init.method || 'GET'
  if (methode === 'POST' && chemin === '/transactions') {
    const c = JSON.parse(init.body); const id = 2000 + Object.keys(transactions).length
    transactions[id] = { id, status: 'pending', amount: c.amount, custom_metadata: c.custom_metadata }
    return reponse({ 'v1/transaction': transactions[id] }, 201)
  }
  if (methode === 'POST' && /\/token$/.test(chemin)) return reponse({ token: 't', url: 'https://sandbox-process.fedapay.com/t' }, 201)
  const m = /^\/transactions\/(\d+)$/.exec(chemin)
  return m && transactions[m[1]] ? reponse({ 'v1/transaction': transactions[m[1]] }) : reponse({ message: 'Not found' }, 404)
}

before(() => {
  globalThis.fetch = async (url, init = {}) => {
    const s = String(url)
    if (s === 'https://api.resend.com/emails') {
      if (resendEnPanne) return reponse({ name: 'application_error', message: 'panne simulée' }, 500)
      assert.equal(init.headers.Authorization, 'Bearer re_test_123')
      envoyes.push({ ...JSON.parse(init.body), cle: init.headers['Idempotency-Key'] })
      return reponse({ id: `msg_${envoyes.length}` })
    }
    if (s.startsWith('https://demo.supabase.co/rest/v1/')) return fauxSupabase(s, init)
    if (s.includes('fedapay.com')) return fauxFedapay(s, init)
    throw new Error(`appel réseau inattendu : ${s}`)
  }
})
after(() => { globalThis.fetch = realFetch })
beforeEach(() => {
  tables = { abonnements: [], profils: [{ id: USER, email: 'awa@client.test', nom: 'Awa Dossou' }] }
  transactions = {}; envoyes = []; resendEnPanne = false
})

async function payer(statut = 'approved', montant = 5000) {
  const tx = await fedapay.creerTransaction({ montant, description: 'Abo', reference: 'r', metadata: { user_id: USER } })
  await enregistrerTransaction({ userId: USER, txId: tx.id, montant })
  transactions[tx.id].status = statut
  return tx.id
}
const abo = (extra) => ({ id: `ab-${tables.abonnements.length + 1}`, user_id: USER, statut: 'actif', fedapay_transaction_id: `t${tables.abonnements.length + 1}`, debut: new Date(Date.now() - 20 * JOUR).toISOString(), ...extra })

describe('modèles', () => {
  test('le nom venant de Google est échappé (pas d’injection HTML)', () => {
    const m = mails.mailBienvenue({ nom: '<script>alert(1)</script> Eve' })
    assert.ok(!m.html.includes('<script>'))
    assert.ok(m.html.includes('&lt;script&gt;'))
  })
  test('paiement confirmé : montant et date de fin visibles', () => {
    const m = mails.mailPaiementConfirme({ nom: 'Awa Dossou', montant: 5000, fin: '2026-11-11T12:00:00Z' })
    assert.match(m.html, /5 000 FCFA/)
    assert.match(m.html, /11 novembre 2026/)
    assert.match(m.html, /Bonjour Awa,/)
  })
  test('refusé et annulé ont des sujets distincts', () => {
    assert.match(mails.mailPaiementEchoue({ statut: 'declined' }).subject, /refusé/)
    assert.match(mails.mailPaiementEchoue({ statut: 'canceled' }).subject, /annulé/)
  })
})

describe('Resend', () => {
  test('erreur Resend → exception explicite', async () => {
    resendEnPanne = true
    await assert.rejects(mails.envoyer({ to: 'a@b.c', subject: 's', html: 'h' }), /Resend 500 : panne simulée/)
  })
})

describe('bienvenue', () => {
  test('réservée une seule fois par compte (création du profil si absent)', async () => {
    assert.equal(await reserverBienvenue({ id: USER, email: 'awa@client.test', nom: 'Awa' }), true)
    assert.equal(await reserverBienvenue({ id: USER, email: 'awa@client.test', nom: 'Awa' }), false)
    const neuf = '33333333-3333-3333-3333-333333333333'
    assert.equal(await reserverBienvenue({ id: neuf, email: 'n@client.test', nom: '' }), true)
    assert.ok(tables.profils.find((p) => p.id === neuf))
  })
})

describe('paiement confirmé', () => {
  test('client (montant + fin) ET admin reçoivent un mail', async () => {
    const id = await payer()
    const r = await confirmerTransaction(id, { userId: USER })
    await attendreNotifications()
    assert.equal(envoyes.length, 2)
    const client = envoyes.find((m) => m.to[0] === 'awa@client.test')
    const admin = envoyes.find((m) => m.to[0] === 'admin@exemple.test')
    assert.match(client.html, /5 000 FCFA/)
    assert.ok(client.html.includes(mails.formatDate(r.fin)))
    assert.match(admin.subject, /Paiement reçu/)
    assert.deepEqual(admin.to, ['admin@exemple.test', 'testeur@exemple.test'])
    assert.equal(client.from, 'CivilEstimateur <no-reply@exemple.test>')
  })

  test('webhook + retour navigateur : un seul jeu de mails', async () => {
    const id = await payer()
    await confirmerTransaction(id)
    await confirmerTransaction(id, { userId: USER })
    await attendreNotifications()
    assert.equal(envoyes.length, 2)
  })

  test('panne Resend : l’abonnement est activé quand même', async () => {
    resendEnPanne = true
    const r = await confirmerTransaction(await payer(), { userId: USER })
    await attendreNotifications()
    assert.equal(r.actif, true)
    assert.equal(tables.abonnements[0].statut, 'actif')
  })
})

describe('paiement refusé ou annulé', () => {
  for (const statut of ['declined', 'canceled']) {
    test(`${statut} → un mail au client, une seule fois`, async () => {
      const id = await payer(statut)
      await confirmerTransaction(id, { userId: USER })
      await confirmerTransaction(id, { userId: USER })
      await attendreNotifications()
      assert.equal(envoyes.length, 1)
      assert.equal(envoyes[0].to[0], 'awa@client.test')
      assert.match(envoyes[0].subject, statut === 'declined' ? /refusé/ : /annulé/)
    })
  }
  test('paiement en attente → aucun mail', async () => {
    await confirmerTransaction(await payer('pending'), { userId: USER })
    await attendreNotifications()
    assert.equal(envoyes.length, 0)
  })
  test('mail d’échec non parti → réessayé au passage suivant', async () => {
    const id = await payer('declined')
    resendEnPanne = true
    await confirmerTransaction(id); await attendreNotifications()
    resendEnPanne = false
    await confirmerTransaction(id); await attendreNotifications()
    assert.equal(envoyes.length, 1)
  })
})

describe('rappel et expiration', () => {
  test('rappel quand il reste ≤ 3 jours, une seule fois', async () => {
    tables.abonnements.push(abo({ fin: new Date(Date.now() + 2 * JOUR).toISOString() }))
    const a = await traiterEcheances()
    const b = await traiterEcheances()
    assert.equal(a.rappels, 1); assert.equal(b.rappels, 0)
    assert.equal(envoyes.length, 1)
    assert.match(envoyes[0].subject, /expire dans (2|3) jours|expire demain/)
  })
  test('trop tôt (10 jours restants) → rien', async () => {
    tables.abonnements.push(abo({ fin: new Date(Date.now() + 10 * JOUR).toISOString() }))
    assert.equal((await traiterEcheances()).rappels, 0)
    assert.equal(envoyes.length, 0)
  })
  test('expiré → mail d’expiration, statut « expire », une seule fois', async () => {
    tables.abonnements.push(abo({ fin: new Date(Date.now() - JOUR).toISOString() }))
    const a = await traiterEcheances()
    const b = await traiterEcheances()
    assert.equal(a.expirations, 1); assert.equal(b.expirations, 0)
    assert.equal(tables.abonnements[0].statut, 'expire')
    assert.match(envoyes[0].subject, /a expiré/)
  })
  test('abonnement déjà renouvelé → ni rappel ni expiration', async () => {
    tables.abonnements.push(abo({ fin: new Date(Date.now() + 1 * JOUR).toISOString() }))
    tables.abonnements.push(abo({ fin: new Date(Date.now() + 31 * JOUR).toISOString() }))
    const r = await traiterEcheances()
    assert.equal(r.rappels, 0)
    assert.equal(envoyes.length, 0)
  })
  test('Resend en panne → rien n’est marqué envoyé, le prochain passage réessaie', async () => {
    tables.abonnements.push(abo({ fin: new Date(Date.now() + 2 * JOUR).toISOString() }))
    resendEnPanne = true
    const a = await traiterEcheances()
    resendEnPanne = false
    const b = await traiterEcheances()
    assert.equal(a.erreurs, 1); assert.equal(b.rappels, 1)
  })
})
