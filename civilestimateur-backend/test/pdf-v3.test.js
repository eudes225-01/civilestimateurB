// test/pdf-v3.test.js — gabarit du devis moteur v3 (sans Chromium, sans variables d'environnement).
// Vérifie que le PDF indique : mode de chiffrage, composants inclus, statut indicatif, matériaux, hypothèses,
// données à confirmer, version et date de la base de prix.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { normaliserModele } from '../src/services/pdf/modele.js'
import { buildBodyHtml, buildCoverHtml, buildFooterTemplate } from '../src/services/pdf/devisHtml.js'
import { metrerProjet, buildDQE, PRIX } from '../src/engine.js'

const prix = Object.fromEntries(PRIX.map((p) => [p.code, p.sac || p.bi]))
const niveau = { nom: 'RDC', rez: true, HSP: 3, surfPlancher: 100, plancher: 'corpsCreuxPlan', corpsCreux: 15, murs: [{ type: 'agglo20', position: 'exterieur', L: 40, H: 3 }] }
const modele = (mode) => {
  const r = metrerProjet([niveau], { modeChiffrage: mode })
  const d = buildDQE(r.totaux, prix, 1.3, { couverture: r.couverture })
  return normaliserModele({
    proj: { titre: 'Villa' }, dqe: d, materiaux: r.materiaux.synthese, hypotheses: r.totaux.hypotheses,
    aConfirmer: r.couverture.aConfirmer.filter((x) => x.etat === 'a_confirmer').map((x) => x.cle),
    meta: { K: 1.3, prixVersion: d.baseDePrix.version, prixDate: d.baseDePrix.date, perimetre: d.perimetre, modeChiffrage: d.mode },
  })
}

describe('PDF moteur v3', () => {
  test('mode composé : indiqué, composants inclus listés, total indicatif', () => {
    const h = buildBodyHtml(modele('compose'))
    assert.match(h, /Prix COMPOSÉS/)
    assert.match(h, /non facturés en plus/)
    assert.match(h, /Aciers HA des ouvrages en béton armé/)
    assert.match(h, /Total HT indicatif/)
    assert.match(h, /Montant INDICATIF/)
  })
  test('mode décomposé : indiqué', () => {
    const h = buildBodyHtml(modele('decompose'))
    assert.match(h, /Prix DÉCOMPOSÉS/)
    assert.doesNotMatch(h, /Aciers HA des ouvrages en béton armé/)   // en décomposé, l'acier est facturé, pas « inclus »
  })
  test('matériaux, hypothèses, données à confirmer, base de prix', () => {
    const m = modele('compose')
    const h = buildBodyHtml(m)
    assert.match(h, /Quantités de matériaux/)
    assert.match(h, /Hypothèses et paramètres/)
    assert.match(h, /Données à confirmer/)
    assert.match(h, /RPR 26\.2/)
    assert.ok(m.materiaux.length > 5)
  })
  test('couverture et pied de page : montant indicatif, version du barème et mode', () => {
    const m = modele('decompose')
    assert.match(buildCoverHtml(m), /indicatif/)
    assert.match(buildFooterTemplate(m), /prix décomposés/)
  })
  test('modèle : mode inconnu → composé ; champs hostiles tronqués / échappés', () => {
    const m = normaliserModele({ dqe: { lignes: [{ n: '1', des: '<b>x</b>', u: 'm', q: 1, pu: 1, montant: 1 }], mode: 'xx' }, materiaux: [{ designation: '<i>' + 'a'.repeat(500), statut: 'zz' }] })
    assert.equal(m.dqe.mode, 'compose')
    assert.equal(m.materiaux[0].statut, 'estime')
    assert.ok(m.materiaux[0].designation.length <= 200)
    assert.doesNotMatch(buildBodyHtml(m), /<i>a/)
  })
})
