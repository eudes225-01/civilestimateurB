// test/pdf-v3.test.js — gabarit du devis moteur v3 (sans Chromium, sans variables d'environnement).
// Vérifie les tableaux de calcul et l'absence des déclarations et paramètres dans le PDF.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { normaliserModele } from '../src/services/pdf/modele.js'
import { buildBodyHtml, buildCoverHtml, buildFooterTemplate } from '../src/services/pdf/devisHtml.js'
import { metrerProjet, buildDQE, buildSousDetail, PRIX } from '../src/engine.js'

const prix = Object.fromEntries(PRIX.map((p) => [p.code, p.sac || p.bi]))
const niveau = { nom: 'RDC', rez: true, HSP: 3, surfPlancher: 100, plancher: 'corpsCreuxPlan', corpsCreux: 15, murs: [{ type: 'agglo20', position: 'exterieur', L: 40, H: 3 }] }
const modele = (mode) => {
  const r = metrerProjet([niveau], { modeChiffrage: mode })
  const d = buildDQE(r.totaux, prix, 1.3, { couverture: r.couverture })
  return normaliserModele({
    proj: { titre: 'Villa' }, dqe: d, materiaux: r.materiaux.synthese,
    sousDetail: buildSousDetail(d.lignes, prix, 1.3),
    meta: { K: 1.3, prixVersion: d.baseDePrix.version, prixDate: d.baseDePrix.date, perimetre: d.perimetre, modeChiffrage: d.mode },
  })
}

describe('PDF moteur v3', () => {
  test('mode composé : indiqué, composants inclus listés, total indicatif', () => {
    const h = buildBodyHtml(modele('compose'))
    assert.match(h, /non facturés en plus/)
    assert.match(h, /Aciers HA des ouvrages en béton armé/)
    assert.match(h, /Total HT/)
    assert.doesNotMatch(h, /Hypothèses et paramètres|Données à confirmer|Nature des résultats|Arrêté le présent devis|Bon pour accord/)
  })
  test('mode décomposé : indiqué', () => {
    const h = buildBodyHtml(modele('decompose'))
    assert.doesNotMatch(h, /Aciers HA des ouvrages en béton armé/)   // en décomposé, l'acier est facturé, pas « inclus »
  })
  test('DQE classique : ouvrage, unité, quantité, prix unitaire, prix total et sous-totaux', () => {
    const m = modele('compose')
    const h = buildBodyHtml(m)
    assert.match(h, /Quantités de matériaux/)
    assert.match(h, /Désignation des ouvrages/)
    assert.match(h, /Unité/)
    assert.match(h, /Qté/)
    assert.match(h, /Prix U \(FCFA\)/)
    assert.match(h, /Prix total \(FCFA\)/)
    assert.match(h, /Sous-total/)
    assert.doesNotMatch(h, /Composante du déboursé sec|Calcul de la part/)
    const texteVisible = h.replace(/data:[^;]+;base64,[A-Za-z0-9+/=]+/g, '')
    assert.doesNotMatch(texteVisible, /RCCM|IFU|paramètres|hypothèses|coefficient K/i)
    assert.ok(m.materiaux.length > 5)
  })
  test('pied de page : texte RPR demandé et pagination numérique seule', () => {
    const m = modele('decompose')
    m.proj.entreprise = 'Mon entreprise'
    const pied = buildFooterTemplate(m)
    assert.match(pied, /Mon entreprise — barème RPR 26\.2 \(mars 2026\)/)
    assert.match(pied, /<span class="pageNumber"><\/span> \/ <span class="totalPages"><\/span>/)
    const texteVisible = pied.replace(/<style>[\s\S]*?<\/style>/g, '')
    assert.doesNotMatch(texteVisible, /RCCM|IFU|Tél\.|Page |Résultats indicatifs|prix décomposés/)
    assert.doesNotMatch(buildCoverHtml(m), /indicatif/)
  })
  test('modèle : mode inconnu → composé ; champs hostiles tronqués / échappés', () => {
    const m = normaliserModele({ dqe: { lignes: [{ n: '1', des: '<b>x</b>', u: 'm', q: 1, pu: 1, montant: 1 }], mode: 'xx' }, materiaux: [{ designation: '<i>' + 'a'.repeat(500), statut: 'zz' }] })
    assert.equal(m.dqe.mode, 'compose')
    assert.equal(m.materiaux[0].statut, undefined)
    assert.ok(m.materiaux[0].designation.length <= 200)
    assert.doesNotMatch(buildBodyHtml(m), /<i>a/)
  })
})
