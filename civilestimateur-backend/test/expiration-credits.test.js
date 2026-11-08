// test/expiration-credits.test.js — rappel avant l'échéance puis remise à zéro des crédits CST.
// Logique pure + ports factices : aucun accès base ni e-mail (exécutable sans variables d'environnement).
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { ajouterMois, phaseExpiration, traiterExpirationCredits } from '../src/services/expirationCredits.js'

const config = { validiteMois: 1, rappelJours: 5, depuis: '2026-12-01T00:00:00.000Z' }
const d = (s) => new Date(s)

describe('ajouterMois', () => {
  test('+1 mois simple', () => assert.equal(ajouterMois(d('2026-12-10T08:00:00Z'), 1).toISOString(), '2027-01-10T08:00:00.000Z'))
  test('fin de mois : 31 janvier + 1 mois = 28 février', () => assert.equal(ajouterMois(d('2027-01-31T10:00:00Z'), 1).toISOString().slice(0, 10), '2027-02-28'))
  test('année bissextile : 31 janvier 2028 + 1 mois = 29 février', () => assert.equal(ajouterMois(d('2028-01-31T10:00:00Z'), 1).toISOString().slice(0, 10), '2028-02-29'))
  test('mois négatif', () => assert.equal(ajouterMois(d('2027-01-15T00:00:00Z'), -1).toISOString().slice(0, 10), '2026-12-15'))
})

describe('phaseExpiration', () => {
  const base = { validiteMois: 1, rappelJours: 5, depuis: config.depuis }
  const achat = '2026-12-10T08:00:00Z' // échéance : 10 janvier 2027 à 08:00 UTC
  test('avant la fenêtre de rappel : actif', () => assert.equal(phaseExpiration({ ...base, payeLe: achat, now: d('2026-12-20T00:00:00Z') }).phase, 'actif'))
  test('dans la fenêtre (5 jours avant) : rappel, jours restants affichés', () => {
    const r = phaseExpiration({ ...base, payeLe: achat, now: d('2027-01-06T00:00:00Z') })
    assert.equal(r.phase, 'rappel'); assert.equal(r.joursRestants, 5)
  })
  test('à l\'échéance : expire', () => assert.equal(phaseExpiration({ ...base, payeLe: achat, now: d('2027-01-10T08:00:00Z') }).phase, 'expire'))
  test('achat AVANT la date d\'entrée en vigueur : jamais concerné', () => assert.equal(phaseExpiration({ ...base, payeLe: '2026-11-20T00:00:00Z', now: d('2027-06-01T00:00:00Z') }).phase, 'hors_perimetre'))
  test('sans date d\'entrée en vigueur : désactivé', () => assert.equal(phaseExpiration({ ...base, depuis: '', payeLe: achat, now: d('2027-06-01T00:00:00Z') }).phase, 'hors_perimetre'))
})

/** Base factice : achats, soldes, mails envoyés, remises à zéro. */
function monde({ achats, soldes }) {
  const etat = { achats: achats.map((a) => ({ ...a })), soldes: { ...soldes }, rappels: [], expires: [], zero: [] }
  const ports = {
    candidats: async ({ depuis, avant }) => etat.achats.filter((a) => !a.expiration_traitee_le && new Date(a.paye_le) >= new Date(depuis) && new Date(a.paye_le) <= new Date(avant)),
    dernierAchat: async (u) => etat.achats.filter((a) => a.user_id === u).sort((x, y) => new Date(y.paye_le) - new Date(x.paye_le))[0] || null,
    solde: async (u) => etat.soldes[u] || 0,
    reserverRappel: async (id) => { const a = etat.achats.find((x) => x.id === id); if (a.rappel_expiration_le) return false; a.rappel_expiration_le = 'x'; return true },
    libererRappel: async (id) => { etat.achats.find((x) => x.id === id).rappel_expiration_le = null },
    marquerTraite: async (id) => { etat.achats.find((x) => x.id === id).expiration_traitee_le = 'x' },
    expirer: async (u, ref) => { const c = etat.soldes[u] || 0; etat.soldes[u] = 0; etat.zero.push(ref); return { credits: c } },
    envoyerRappel: async (p) => { etat.rappels.push(p) },
    envoyerExpire: async (p) => { etat.expires.push(p) },
  }
  return { etat, ports }
}
const achat = (id, user, paye_le, extra = {}) => ({ id, user_id: user, paye_le, credits: 5000, rappel_expiration_le: null, expiration_traitee_le: null, ...extra })

describe('traiterExpirationCredits', () => {
  test('désactivée (pas de date d\'entrée en vigueur) : aucun solde touché, aucun appel', async () => {
    const { etat, ports } = monde({ achats: [achat('a1', 'u1', '2026-12-10T08:00:00Z')], soldes: { u1: 5000 } })
    const b = await traiterExpirationCredits({ now: d('2027-03-01T00:00:00Z'), config: { ...config, depuis: '' }, ports })
    assert.equal(b.actif, false); assert.equal(etat.soldes.u1, 5000); assert.equal(etat.rappels.length + etat.expires.length, 0)
  })
  test('rappel envoyé dans la fenêtre, une seule fois (deux exécutions le même jour)', async () => {
    const { etat, ports } = monde({ achats: [achat('a1', 'u1', '2026-12-10T08:00:00Z')], soldes: { u1: 4895 } })
    const now = d('2027-01-06T09:00:00Z')
    const b1 = await traiterExpirationCredits({ now, config, ports })
    const b2 = await traiterExpirationCredits({ now, config, ports })
    assert.equal(b1.rappels, 1); assert.equal(b2.rappels, 0)
    assert.equal(etat.rappels.length, 1); assert.equal(etat.rappels[0].solde, 4895); assert.equal(etat.rappels[0].joursRestants, 4)
    assert.equal(etat.soldes.u1, 4895)   // le rappel ne touche jamais au solde
  })
  test('pas de rappel trop tôt', async () => {
    const { etat, ports } = monde({ achats: [achat('a1', 'u1', '2026-12-10T08:00:00Z')], soldes: { u1: 5000 } })
    const b = await traiterExpirationCredits({ now: d('2026-12-25T00:00:00Z'), config, ports })
    assert.equal(b.examines, 0); assert.equal(etat.rappels.length, 0)
  })
  test('à l\'échéance : solde expirant remis à zéro, mail d\'expiration, achat marqué traité (idempotent)', async () => {
    const { etat, ports } = monde({ achats: [achat('a1', 'u1', '2026-12-10T08:00:00Z', { rappel_expiration_le: 'x' })], soldes: { u1: 3200 } })
    const now = d('2027-01-11T00:00:00Z')
    const b1 = await traiterExpirationCredits({ now, config, ports })
    const b2 = await traiterExpirationCredits({ now, config, ports })
    assert.equal(b1.expires, 1); assert.equal(b1.creditsPerdus, 3200); assert.equal(b2.expires, 0)
    assert.equal(etat.soldes.u1, 0); assert.deepEqual(etat.zero, ['expiration/a1']); assert.equal(etat.expires[0].credits, 3200)
  })
  test('un NOUVEL achat repousse l\'échéance : l\'ancien achat n\'expire pas le solde', async () => {
    const { etat, ports } = monde({ achats: [achat('a1', 'u1', '2026-12-10T08:00:00Z'), achat('a2', 'u1', '2027-01-08T08:00:00Z')], soldes: { u1: 9000 } })
    const b = await traiterExpirationCredits({ now: d('2027-01-11T00:00:00Z'), config, ports })
    assert.equal(b.expires, 0); assert.equal(etat.soldes.u1, 9000)
    assert.equal(etat.achats.find((a) => a.id === 'a1').expiration_traitee_le, 'x')   // plus surveillé
    // le nouvel achat expirera le 8 février 2027
    const b2 = await traiterExpirationCredits({ now: d('2027-02-09T00:00:00Z'), config, ports })
    assert.equal(b2.expires, 1); assert.equal(etat.soldes.u1, 0)
  })
  test('solde déjà à 0 : rien à rappeler ni à remettre à zéro, aucun mail', async () => {
    const { etat, ports } = monde({ achats: [achat('a1', 'u1', '2026-12-10T08:00:00Z')], soldes: { u1: 0 } })
    const b = await traiterExpirationCredits({ now: d('2027-01-06T09:00:00Z'), config, ports })
    assert.equal(b.rappels + b.expires, 0); assert.equal(etat.rappels.length + etat.expires.length, 0)
  })
  test('achat antérieur à la date d\'entrée en vigueur : solde jamais touché', async () => {
    const { etat, ports } = monde({ achats: [achat('a0', 'u9', '2026-11-20T08:00:00Z')], soldes: { u9: 12000 } })
    const b = await traiterExpirationCredits({ now: d('2027-03-01T00:00:00Z'), config, ports })
    assert.equal(b.examines, 0); assert.equal(etat.soldes.u9, 12000)
  })
  test('échec d\'envoi du rappel : réservation rendue, retenté au prochain passage, solde intact', async () => {
    const { etat, ports } = monde({ achats: [achat('a1', 'u1', '2026-12-10T08:00:00Z')], soldes: { u1: 4000 } })
    let echoue = true
    const envoyerOriginal = ports.envoyerRappel
    ports.envoyerRappel = async (p) => { if (echoue) throw new Error('smtp'); return envoyerOriginal(p) }
    const now = d('2027-01-06T09:00:00Z')
    const b1 = await traiterExpirationCredits({ now, config, ports })
    assert.equal(b1.erreurs, 1); assert.equal(etat.rappels.length, 0); assert.equal(etat.soldes.u1, 4000)
    echoue = false
    const b2 = await traiterExpirationCredits({ now, config, ports })
    assert.equal(b2.rappels, 1)
  })
  test('échec du mail d\'expiration : les crédits restent à zéro (jamais rendus)', async () => {
    const { etat, ports } = monde({ achats: [achat('a1', 'u1', '2026-12-10T08:00:00Z')], soldes: { u1: 700 } })
    ports.envoyerExpire = async () => { throw new Error('smtp') }
    const b = await traiterExpirationCredits({ now: d('2027-01-11T00:00:00Z'), config, ports })
    assert.equal(etat.soldes.u1, 0); assert.equal(b.expires, 1); assert.equal(b.erreurs, 1)
  })
  test('plusieurs clients : chacun traité selon son propre achat', async () => {
    const { etat, ports } = monde({
      achats: [achat('a1', 'u1', '2026-12-10T08:00:00Z'), achat('a2', 'u2', '2026-12-20T08:00:00Z'), achat('a3', 'u3', '2026-12-10T10:00:00Z')],
      soldes: { u1: 100, u2: 200, u3: 300 },
    })
    const b = await traiterExpirationCredits({ now: d('2027-01-11T00:00:00Z'), config, ports })
    assert.equal(etat.soldes.u1, 0); assert.equal(etat.soldes.u3, 0); assert.equal(etat.soldes.u2, 200)   // u2 expire le 20 janvier
    assert.equal(b.expires, 2)
  })
})
