// test/pdf.test.js
// Teste le gabarit du devis et la route /api/pdf/devis SANS Chromium :
// nombre en lettres, validation du modèle, échappement HTML, forme de la réponse d'erreur.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

const { nombreEnLettres } = await import('../src/services/pdf/nombreEnLettres.js')
const { normaliserModele, ModeleInvalide } = await import('../src/services/pdf/modele.js')
const { buildBodyHtml, buildCoverHtml, buildHeaderTemplate, buildFooterTemplate, fmt } = await import('../src/services/pdf/devisHtml.js')

const brut = (extra = {}) => ({
  proj: { titre: 'Villa <script>alert(1)</script>', entreprise: 'ARCHINOVA & Fils', mo: 'M. Test' },
  brand: { color: '#e0532f', slogan: 'Bâtir juste' },
  dqe: {
    lignes: [
      { n: '1.1', des: 'Fouille en pleine masse', u: 'm³', q: 12.5, pu: 5000, montant: 62500 },
      { n: '2.1', des: 'Béton de propreté', u: 'm³', q: 3, pu: 0, montant: 0 },
    ],
    ht: 62500, tva: 11250, ttc: 73750,
  },
  sousDetail: [{ n: '1.1', des: 'Fouille', u: 'm³', composantes: [{ lib: "Main-d'œuvre", montant: 3000 }], deboursesSec: 3000, coeffK: 1.3, majoration: 900, puVente: 3900 }],
  metres: [{ lib: 'Surface des pièces (Σ niveaux)', q: 84.2, u: 'm²' }],
  alertes: [{ niveau: 'warn', msg: 'Hauteur sous plafond <b>atypique</b>' }],
  meta: { K: 1.3, date: '13/10/2026' },
  ...extra,
})

describe('nombreEnLettres', () => {
  const cas = [
    [0, 'zéro'], [21, 'vingt et un'], [71, 'soixante et onze'], [80, 'quatre-vingts'], [81, 'quatre-vingt-un'],
    [99, 'quatre-vingt-dix-neuf'], [200, 'deux cents'], [201, 'deux cent un'], [1000, 'mille'],
    [80000, 'quatre-vingt mille'], [200000, 'deux cent mille'], [1200000, 'un million deux cent mille'],
    [2000000, 'deux millions'], [12345678, 'douze millions trois cent quarante-cinq mille six cent soixante-dix-huit'],
  ]
  for (const [n, txt] of cas) test(`${n} → ${txt}`, () => assert.equal(nombreEnLettres(n), txt))
})

describe('normaliserModele', () => {
  test('refuse un devis sans poste', () => {
    assert.throws(() => normaliserModele(brut({ dqe: { lignes: [] } })), ModeleInvalide)
    assert.throws(() => normaliserModele(null), ModeleInvalide)
  })
  test('refuse un devis démesuré', () => {
    const lignes = Array.from({ length: 401 }, (_, i) => ({ n: `1.${i}`, des: 'x', u: 'u', q: 1, pu: 1, montant: 1 }))
    assert.throws(() => normaliserModele(brut({ dqe: { lignes } })), ModeleInvalide)
  })
  test('couleur et logo invalides sont écartés', () => {
    const m = normaliserModele(brut({ brand: { color: 'red;}</style><script>', logo: 'https://exemple.test/x.png' } }))
    assert.equal(m.brand.color, '#1e2a78')
    assert.equal(m.brand.logo, null)
  })
  test('nombres non finis ramenés à 0', () => {
    const m = normaliserModele(brut({ dqe: { lignes: [{ n: '1.1', des: 'a', u: 'm', q: 'abc', pu: Infinity, montant: null }], ht: NaN } }))
    assert.deepEqual([m.dqe.lignes[0].q, m.dqe.lignes[0].pu, m.dqe.lignes[0].montant, m.dqe.ht], [0, 0, 0, 0])
  })
})

describe('gabarit HTML', () => {
  const m = normaliserModele(brut())
  test('échappe tout texte venant du client', () => {
    for (const html of [buildBodyHtml(m), buildCoverHtml(m), buildHeaderTemplate(m)]) {
      assert.ok(!html.includes('<script>alert'), 'script injecté')
      assert.ok(!html.includes('<b>atypique</b>'), 'balise injectée')
    }
    assert.ok(buildBodyHtml(m).includes('&lt;b&gt;atypique&lt;/b&gt;'))
  })
  test('CSP interdit scripts et réseau', () => {
    assert.match(buildBodyHtml(m), /default-src 'none'; img-src data:; font-src data:/)
  })
  test('contenu attendu : chapitres, arrêté en lettres, poste sans prix', () => {
    const h = buildBodyHtml(m)
    assert.ok(h.includes('Terrassement') && h.includes('Fondations'))
    assert.ok(h.includes('Soixante-treize mille sept cent cinquante francs CFA'))
    assert.ok(h.includes('prix à renseigner'))
  })
  test('caractères hors police remplacés (Σ, →)', () => {
    const h = buildBodyHtml(m)
    assert.ok(!h.includes('Σ') && h.includes('cumul niveaux'))
  })
  test('formatage des nombres avec espace insécable', () => {
    assert.equal(fmt(1234567), '1\u00A0234\u00A0567')
    assert.equal(fmt(12.5, 2), '12,50')
  })
  test('pagination désactivable, sections optionnelles', () => {
    const sans = normaliserModele(brut({ opts: { pagination: false, sousDetail: false, metresComplets: false } }))
    assert.ok(!buildFooterTemplate(sans).includes('pageNumber'))
    const h = buildBodyHtml(sans)
    assert.ok(!h.includes('Sous-détail des prix') && !h.includes('Récapitulatif des quantités'))
  })
})

// Dépendances (express…) absentes : on saute la partie HTTP plutôt que de casser tout le fichier.
const { createApp } = await import('../src/app.js').catch(() => ({}))

describe('POST /api/pdf/devis', { skip: !createApp && 'dépendances non installées' }, () => {
  let srv, base
  const demarrer = () => new Promise((ok) => { srv = createApp().listen(0, () => { base = `http://127.0.0.1:${srv.address().port}`; ok() }) })
  test('400 si le corps est invalide (sans lancer Chromium)', async () => {
    await demarrer()
    try {
      const r = await fetch(`${base}/api/pdf/devis`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dqe: { lignes: [] } }) })
      assert.equal(r.status, 400)
      assert.equal((await r.json()).error, 'dqe_vide')
    } finally { srv.close() }
  })
})
