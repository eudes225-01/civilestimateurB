// test/v3-metre-materiaux.test.js
// Moteur v3 : modèle de prix (composé / décomposé), quantités de matériaux, murs par catégorie et soubassement,
// mortier de pose configurable, terrassement (réemploi / purge), planchers à corps creux, toiture et pignons,
// validation stricte. Chaque test porte sur UNE règle métier critique du cahier des charges.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  metrerProjet, buildDQE, PRIX, metrerToiture, validerEntrees, terrasser, mortierPoseBloc, TOITURES,
} from '../src/index.js'

const prix = Object.fromEntries(PRIX.map((p) => [p.code, p.sac || p.bi]))
const proche = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b} (±${tol})`)
const rdc = (extra = {}, plancher = 'dallePleine') => ({
  nom: 'RDC', rez: true, HSP: 3, surfPlancher: 100, plancher,
  murs: [{ type: 'agglo20', position: 'exterieur', L: 40, H: 3 }],
  poteaux: [{ nb: 4, a: 0.2, b: 0.2 }], ...extra,
})
const dqe = (levels, params = {}, K = 1.3, opts = {}) => {
  const r = metrerProjet(levels, params)
  return { r, d: buildDQE(r.totaux, prix, K, { couverture: r.couverture, ...opts }) }
}
const CODES_BA_COMPOSES = ['6019…1198', '6019…1195', '6019…2376', 'radier', 'ba_elevation', 'dalle_tp']
const CODES_COMPOSANTS = ['acierHA', 'sable', 'gravier', 'ciment50', 'coffrage_poteau', 'coffrage_poutre', 'coffrage_dalle', 'coffrage_voile', 'coffrage_rive']

describe('1. Mode composé : aucun composant facturé deux fois', () => {
  const { r, d } = dqe([rdc({ poutres: [{ nb: 2, L: 5, b: 0.2, h: 0.3 }], voiles: [{ nb: 1, L: 3, ep: 0.2 }] })], { modeChiffrage: 'compose' })
  test('le mode est porté par le projet et le DQE', () => {
    assert.equal(r.totaux.modeChiffrage, 'compose')
    assert.equal(d.mode, 'compose')
  })
  test('ni acier, ni granulats, ni ciment, ni coffrage dans les lignes facturées', () => {
    const codes = d.lignes.map((l) => l.code)
    CODES_COMPOSANTS.forEach((c) => assert.ok(!codes.includes(c), `${c} ne doit pas être refacturé`))
  })
  test('ces composants restent visibles : « inclus » dans le DQE et dans la liste de matériaux', () => {
    assert.ok(d.inclus.some((i) => /Aciers HA/.test(i.des) && i.q > 0))
    assert.ok(d.inclus.some((i) => /Ciment/.test(i.des)))
    assert.ok(d.inclus.some((i) => /Coffrage/.test(i.des)))
    const codes = r.materiaux.synthese.map((m) => m.code)
    ;['acier_ha', 'ciment_beton', 'sable_beton', 'gravier_beton', 'coffrage'].forEach((c) => assert.ok(codes.includes(c), c))
  })
  test('le total = somme des lignes (entiers FCFA)', () => {
    assert.equal(d.ht, d.lignes.reduce((s, l) => s + l.montant, 0))
    assert.ok(Number.isInteger(d.ht) && Number.isInteger(d.tva) && d.ttc === d.ht + d.tva)
  })
})

describe('2. Mode décomposé : le prix global n\'est pas facturé en plus de ses composants', () => {
  const { d } = dqe([rdc({ poutres: [{ nb: 2, L: 5, b: 0.2, h: 0.3 }] })], { modeChiffrage: 'decompose' })
  test('aucun prix composé de béton armé n\'est facturé', () => {
    const codes = d.lignes.map((l) => l.code)
    CODES_BA_COMPOSES.forEach((c) => assert.ok(!codes.includes(c), `${c} ne doit pas rester en mode décomposé`))
    assert.ok(codes.includes('beton_mo'))
  })
  test('les composants sont chiffrés séparément', () => {
    const codes = d.lignes.map((l) => l.code)
    ;['acierHA', 'sable', 'gravier', 'ciment50', 'coffrage_poteau', 'coffrage_dalle'].forEach((c) => assert.ok(codes.includes(c) || c === 'coffrage_poteau', c))
    assert.ok(d.inclus.every((i) => !/Aciers|Ciment pour béton|Sable|Gravier/.test(i.des)))
  })
  test('quantité de ciment du DQE = besoin matériaux (béton)', () => {
    const { r, d: dd } = dqe([rdc()], { modeChiffrage: 'decompose' })
    const ligne = dd.lignes.find((l) => l.code === 'ciment50')
    const mat = r.materiaux.synthese.find((m) => m.code === 'ciment_beton')
    assert.equal(ligne.q, mat.quantiteCommande)
  })
})

describe('3. Dalle sur terre-plein : aucun coffrage de sous-face', () => {
  const lv = rdc({ surfPlancher: 100, epDalle: 0.12 }, 'dalleTP')
  test('100 m² → 0 m² de coffrage de sous-face, en tous modes', () => {
    ;['compose', 'decompose'].forEach((mode) => {
      const { r, d } = dqe([lv], { modeChiffrage: mode })
      assert.equal(r.totaux.coffDalle, 0)
      assert.ok(!d.lignes.some((l) => l.code === 'coffrage_dalle'))
      assert.ok(!r.materiaux.lignes.some((l) => l.code === 'coffrage' && /sous-face/.test(l.designation)))
    })
  })
  test('rives : coffrées seulement si le périmètre est connu', () => {
    assert.equal(metrerProjet([lv], {}).totaux.coffRives, 0)
    const r = metrerProjet([{ ...lv, perimetre: 40 }], {})
    proche(r.totaux.coffRives, 40 * 0.12)
    assert.equal(r.totaux.coffDalle, 0)
  })
  test('une dalle SUSPENDUE garde son coffrage de sous-face', () => {
    const r = metrerProjet([rdc({ surfPlancher: 100 }, 'dallePleine')], {})
    assert.equal(r.totaux.coffDalle, 100)
  })
})

describe('4. Toiture : surface lue, jamais retombée sur l\'emprise', () => {
  test('10×10 + débord 1 m, sans pente : 144 m² projetés avant coefficient', () => {
    const t = metrerToiture({ L: 10, l: 10, debord: 1 }, { coefDefaut: TOITURES.bac.coef })
    assert.equal(t.surfProjetee, 144)
    assert.equal(t.methode, 'forfait')
    proche(t.surfCouverture, 144 * 1.15)
  })
  test('dans le projet : la couverture facturée = 144 × coefficient (et non l\'emprise × coefficient)', () => {
    const { r, d } = dqe([rdc()], { toiture: 'bac', plans: { toiture: { L: 10, l: 10, debord: 1 } } })
    proche(r.totaux.surfToiture, 165.6)
    assert.notEqual(r.totaux.surfToiture, 100 * 1.15)
    const l = d.lignes.find((x) => x.n === '8.1')
    assert.match(l.detail[0].formule, /144 m² × 1\.15/)   // formule affichée = formule appliquée
  })
  test('avec une pente lue, la pente prévaut sur le forfait', () => {
    const t = metrerToiture({ L: 10, l: 10, debord: 1, pente: 30 }, { coefDefaut: 1.15 })
    assert.equal(t.methode, 'pente')
    assert.equal(t.surfCouverture, t.surfDeveloppee)
  })
  test('pignons : triangles ajoutés au métré des murs ; sinon alerte « non inclus »', () => {
    const niveauAvecToiture = rdc({ plancher: 'aucun' })
    const sans = metrerProjet([niveauAvecToiture], { toiture: 'bac' })
    assert.ok(sans.alertes.some((a) => /Pignons NON inclus/.test(a.msg)))
    const avec = metrerProjet([niveauAvecToiture], { toiture: 'bac', plans: { toiture: { L: 10, l: 10, debord: 0, pente: 30, pignons: [{ nom: 'P1', nb: 2, L1: 5, P1: 0.5, type: 'agglo15' }] } } })
    proche(avec.totaux.pignons.surfTriangles, 2 * (25 * 0.5) / 2)
    proche(avec.totaux.Smur - sans.totaux.Smur, 12.5)
    assert.ok(!avec.alertes.some((a) => /Pignons NON inclus/.test(a.msg)))
    assert.ok(avec.materiaux.lignes.some((l) => /Pignon/.test(l.ouvrage)))
  })
})

describe('5-6. Terrassement : réemploi, purge, apport extérieur explicites', () => {
  const fond = { type: 'filante', lineaire: 40, semL: 0.5, semH: 0.25, profFouille: 1 }
  const run = (T) => metrerProjet([rdc()], { fondation: { ...fond, terrassement: { sol: 'meuble', cf: 1.25, cp: 1.15, ...T } } })
  test('réemploi (défaut) : pas d\'apport, évacuation réduite', () => {
    const a = run({}).totaux, b = run({ reemploi: { actif: false } }).totaux
    assert.equal(a.terrassementMode, 'reemploi')
    assert.equal(a.volRemblaisApport, 0)
    assert.ok(a.volReemploi > 0)
    assert.ok(a.volDeblaisEvacuer < b.volDeblaisEvacuer)
  })
  test('réemploi partiel : le complément est apporté', () => {
    const t = run({ reemploi: { actif: true, taux: 0.5 } }).totaux
    assert.ok(t.volRemblaisApport > 0 && t.volReemploi > 0)
  })
  test('sans réemploi ni apport déclaré : remblai « non pourvu » + alerte', () => {
    const r = run({ reemploi: { actif: false } })
    assert.equal(r.totaux.volRemblaisApport, 0)
    assert.ok(r.totaux.volRemblaiNonPourvu > 0)
    assert.ok(r.alertes.some((a) => /ni réemploi des terres ni apport/.test(a.msg)))
  })
  test('sans réemploi + apport extérieur activé : évacuation totale ET apport (choix explicite)', () => {
    const t = run({ reemploi: { actif: false }, apportExterieur: { actif: true, justification: 'sol argileux' } }).totaux
    assert.ok(t.volRemblaisApport > 0)
    assert.equal(t.terrassementMode, 'evacuation')
  })
  test('purge de sol impropre : évacuation totale + apport extérieur activés ; justification exigée', () => {
    const sans = run({ bloquant: true })
    assert.equal(sans.totaux.terrassementMode, 'purge')
    assert.ok(sans.totaux.volDeblaisEvacuer > 0 && sans.totaux.volRemblaisApport > 0)
    assert.ok(sans.alertes.some((a) => a.niveau === 'bloquante' && /sans justification/.test(a.msg)))
    const avec = run({ purge: { actif: true, justification: 'étude géotechnique G2 : remblais anciens' } })
    assert.ok(!avec.alertes.some((a) => /sans justification/.test(a.msg)))
    const t = terrasser({ vDeblaisPlace: 20, vEnterre: 7.6, T: { purge: { actif: true, justification: 'x' } } })
    proche(t.evacuer, 20 * 1.25); proche(t.apport, 12.4 * 1.10)
  })
})

describe('7-8. Murs : soubassement séparé, cloisons métrées', () => {
  const murs = [
    { type: 'agglo20', position: 'exterieur', L: 40, H: 3, portes: 1, fenetres: 2 },
    { type: 'agglo10', position: 'interieur', L: 20, H: 3 },
    { categorie: 'soubassement', type: 'agglo20', position: 'exterieur', L: 40, H: 0.6 },
  ]
  const r = metrerProjet([rdc({ murs })], {})
  const sans = metrerProjet([rdc({ murs: murs.slice(0, 2) })], {})
  test('le soubassement n\'est pas mélangé à l\'élévation', () => {
    assert.equal(r.totaux.Smur, sans.totaux.Smur)
    assert.equal(r.totaux.agglos, sans.totaux.agglos)
    assert.equal(r.totaux.enduitExt, sans.totaux.enduitExt)
    proche(r.totaux.soubassement.surfNette, 24)
    assert.ok(r.totaux.parCategorieMur.exterieur && r.totaux.parCategorieMur.cloison)
  })
  test('le soubassement a son propre poste DQE et ses propres matériaux', () => {
    const d = buildDQE(r.totaux, prix, 1.3)
    assert.ok(d.lignes.some((l) => l.code === 'mur_soubassement' && l.q === 24))
    assert.ok(r.materiaux.lignes.some((l) => l.famille === 'soubassement' && l.code === 'bloc_agglo20'))
  })
  test('dimensions absentes : donnée à compléter + alerte, jamais inventées', () => {
    const x = metrerProjet([rdc({ murs: [...murs, { categorie: 'soubassement', type: 'agglo20', L: 10 }] })], {})
    assert.equal(x.totaux.soubassementACompleter.length, 1)
    assert.deepEqual(x.totaux.soubassementACompleter[0].manque, ['hauteur'])
    assert.equal(x.totaux.soubassement.surfNette, 24)
    assert.ok(x.alertes.some((a) => /Soubassement/.test(a.msg)))
    assert.equal(buildDQE(x.totaux, prix, 1.3, { couverture: x.couverture }).complet, false)
  })
  test('cloisons : blocs et mortier par catégorie (20 m × 3 m agglos 10)', () => {
    const c = r.totaux.parCategorieMur.cloison
    proche(c.surfNette, 60)
    assert.equal(c.blocs, Math.round(60 * 12.5 * 1.07))
    assert.deepEqual(c.epaisseurs, [0.1])
    assert.equal(c.types.agglo10.ep, 0.1)
    assert.ok(c.mortierM3 > 0 && c.cimentSacs > 0 && c.sableM3 > 0)
    assert.ok(c.enduitInt > 0)
    assert.ok(r.materiaux.lignes.some((l) => l.code === 'bloc_agglo10' && /Cloisons/.test(l.ouvrage)))
  })
  test('ouvertures, surface brute et longueur développée par catégorie', () => {
    const e = r.totaux.parCategorieMur.exterieur
    proche(e.surfBrute, 120); proche(e.surfOuvertures, 1 * 0.9 * 2.1 + 2 * 1.2 * 1.2); proche(e.surfNette, e.surfBrute - e.surfOuvertures)
    proche(e.Ldev, 40)
  })
})

describe('9. Ciment des joints : règle visible, configurable, par type de bloc', () => {
  const lv = [rdc({ murs: [{ type: 'agglo15', position: 'exterieur', L: 40, H: 3 }, { type: 'agglo20', position: 'interieur', L: 20, H: 3 }] })]
  test('par défaut : règle du document de référence « 1 sac pour 70 blocs »', () => {
    const r = metrerProjet(lv, {})
    const x = r.totaux.parCategorieMur.exterieur.types.agglo15
    assert.equal(r.totaux.parTypeMur.agglo15.mortier.mode, 'blocsParSac')
    proche(x.cimentSacs, x.blocsExact / 70, 0.01)
    assert.ok(r.totaux.hypotheses.some((h) => h.cle === 'mortier' && /70/.test(h.valeur)))
  })
  test('formule historique (volume de mortier × dosage) toujours disponible : mode « volume »', () => {
    const r = metrerProjet(lv, { mortier: { mode: 'volume' } })
    const m = r.totaux.parTypeMur.agglo15.mortier
    assert.equal(m.mode, 'volume')
    proche(m.cimentSacs, 120 * 0.022 * 350 / 50, 1e-6)
    assert.ok(r.totaux.hypotheses.some((h) => h.cle === 'mortier' && /blocs par sac/.test(h.valeur)))
  })
  test('modifiable PAR TYPE de bloc (agglo20 : 55 blocs/sac)', () => {
    const r = metrerProjet(lv, { mortier: { mode: 'blocsParSac', parType: { agglo20: { blocsParSac: 55 } } } })
    const t = r.totaux.parCategorieMur.porteur.types.agglo20
    proche(t.cimentSacs, t.blocsExact / 55, 0.01)
    const a = r.totaux.parCategorieMur.exterieur.types.agglo15
    proche(a.cimentSacs, a.blocsExact / 70, 0.01)
  })
  test('dosage, volume de mortier et pertes surchargeables', () => {
    const a = mortierPoseBloc('agglo15', 100, { mortier: { mode: 'volume' } })
    const b = mortierPoseBloc('agglo15', 100, { mortier: { mode: 'volume', parType: { agglo15: { mortierM3M2: 0.03, dosageKgM3: 400, pertesPct: 10 } } } })
    assert.ok(b.cimentSacs > a.cimentSacs)
    proche(b.blocsExact, 100 * 12.5 * 1.10, 1e-6)
  })
  test('le ciment est ventilé : béton / mortier de pose / enduits / autres', () => {
    const c = metrerProjet(lv, {}).totaux.ciment
    ;['beton', 'mortierPose', 'enduits', 'autres'].forEach((k) => assert.ok(k in c))
    assert.ok(c.mortierPose > 0 && c.enduits > 0)
  })
  test('le total historique cimentSacs est conservé (somme des 4 usages)', () => {
    const t = metrerProjet(lv, {}).totaux
    assert.equal(t.cimentSacs, Math.round(t.ciment.beton + t.ciment.mortierPose + t.ciment.enduits + t.ciment.autres))
  })
})

describe('10. Planchers à corps creux : quantités distinctes', () => {
  const mat = (r, code) => r.materiaux.synthese.find((m) => m.code === code)
  test('15+5 et 20+5 : entrevous et béton de nervures distincts', () => {
    const a = metrerProjet([rdc({ corpsCreux: 15, entraxe: 0.6 }, 'corpsCreuxPlan')], {})
    const b = metrerProjet([rdc({ corpsCreux: 20, entraxe: 0.6 }, 'corpsCreuxPlan')], {})
    assert.ok(mat(a, 'entrevous_15') && !mat(a, 'entrevous_20'))
    assert.ok(mat(b, 'entrevous_20') && !mat(b, 'entrevous_15'))
    assert.notEqual(mat(a, 'entrevous_15').quantite, mat(b, 'entrevous_20').quantite)
    assert.notEqual(mat(a, 'beton_nervures').quantite, mat(b, 'beton_nervures').quantite)
    proche(mat(a, 'beton_table_compression').quantite, 5)   // 100 m² × 5 cm
    proche(mat(a, 'poutrelles').quantite, 100 / 0.6)
  })
  test('historiques hourdis15 / hourdis20 : mêmes quantités qu\'avant, sous-face « à confirmer »', () => {
    const r = metrerProjet([rdc({ entraxe: 0.6 }, 'hourdis15')], {})
    assert.equal(r.totaux.surfHourdis, 100)
    assert.equal(r.totaux.entrevous, 850)
    proche(r.totaux.volDalle, 100 * 0.08)
    assert.ok(r.alertes.some((a) => /sous-face .* non précisée/.test(a.msg)))
  })
  test('poutrelles apparentes vs sous-face plane : type et finition portés par le plancher', () => {
    const a = metrerProjet([rdc({ corpsCreux: 15, entraxe: 0.6, finitionSousFace: 'enduit' }, 'corpsCreuxApparent')], {})
    const p = metrerProjet([rdc({ corpsCreux: 15, entraxe: 0.6, finitionSousFace: 'enduit' }, 'corpsCreuxPlan')], {})
    assert.equal(a.totaux.planchers[0].sousFace, 'apparent')
    assert.equal(p.totaux.planchers[0].sousFace, 'plan')
    assert.equal(mat(a, 'enduit_sous_face').statut, 'a_confirmer')
    assert.equal(mat(p, 'enduit_sous_face').statut, 'calcule')
  })
  test('entraxe absent : poutrelles NON devinées, alerte à confirmer', () => {
    const r = metrerProjet([rdc({ corpsCreux: 15 }, 'corpsCreuxPlan')], {})
    assert.equal(r.totaux.planchers[0].poutrellesL, null)
    assert.ok(r.alertes.some((a) => /entraxe .* non saisi/.test(a.msg)))
    assert.equal(mat(r, 'poutrelles').statut, 'a_confirmer')
    assert.equal(mat(r, 'poutrelles').quantite, 0)
  })
  test('hauteur d\'entrevous non reconnue : plancher non chiffré + alerte bloquante', () => {
    const r = metrerProjet([rdc({}, 'corpsCreuxApparent')], {})
    assert.ok(r.alertes.some((a) => a.niveau === 'bloquante' && /hauteur d'entrevous/.test(a.msg)))
    assert.equal(r.totaux.volDalle, 0)
  })
  test('en mode composé, l\'acier du corps creux (prix « hors acier ») reste facturé, pas celui des dalles pleines', () => {
    const { d } = dqe([rdc({ corpsCreux: 15, entraxe: 0.6 }, 'corpsCreuxPlan')], { modeChiffrage: 'compose' })
    assert.ok(d.lignes.some((l) => l.code === 'acierHA'))
    assert.ok(d.lignes.some((l) => l.code === 'plancher_h15'))
  })
  test('dalle nervurée : exige les données de nervures (sinon à confirmer, pas devinée)', () => {
    const sans = metrerProjet([rdc({}, 'nervuree')], {})
    assert.equal(sans.totaux.volDalle, 0)
    assert.ok(sans.alertes.some((a) => /nervurée/.test(a.msg)))
    const avec = metrerProjet([rdc({ epDalle: 0.05, nervures: { entraxe: 0.6, b: 0.1, h: 0.2, sens: 1 } }, 'nervuree')], {})
    proche(avec.totaux.volDalle, 100 * 0.05 + (100 / 0.6) * 0.1 * 0.2, 0.01)
  })
})

describe('Matériaux : structure complète des lignes', () => {
  const r = metrerProjet([rdc({ surfPlancher: 100, corpsCreux: 15, entraxe: 0.6 }, 'corpsCreuxApparent')], {})
  test('code, désignation, unité, quantité, formule, ouvrage, niveau, statut', () => {
    assert.ok(r.materiaux.lignes.length > 10)
    r.materiaux.lignes.forEach((l) => {
      ;['code', 'designation', 'unite', 'formule', 'ouvrage', 'niveau', 'statut'].forEach((k) => assert.ok(l[k] !== undefined && l[k] !== '', `${l.code}.${k}`))
      assert.ok(typeof l.quantite === 'number')
      assert.ok(['calcule', 'estime', 'a_confirmer'].includes(l.statut))
    })
  })
  test('le ciment de béton / mortier / enduit est distingué', () => {
    const codes = r.materiaux.synthese.map((m) => m.code)
    ;['ciment_beton', 'ciment_mortier_pose', 'ciment_enduit', 'sable_beton', 'sable_mortier', 'gravier_beton', 'bloc_agglo20', 'acier_ha', 'entrevous_15', 'poutrelles', 'coffrage', 'beton_arme']
      .forEach((c) => assert.ok(codes.includes(c), c))
  })
  test('l\'acier n\'est jamais « calculé » (estimé, ou à confirmer)', () => {
    // jamais « calculé » ; « à confirmer » si la fondation est encore par défaut (exception de couverture ouverte)
    r.materiaux.lignes.filter((l) => l.code === 'acier_ha').forEach((l) => assert.ok(['estime', 'a_confirmer'].includes(l.statut), l.statut))
  })
  test('quantité à commander arrondie à l\'unité pour les sacs et les blocs', () => {
    r.materiaux.synthese.filter((m) => ['sacs', 'u'].includes(m.unite)).forEach((m) => assert.ok(Number.isInteger(m.quantiteCommande)))
  })
  test('la liste existe aussi en mode décomposé', () => {
    const d = metrerProjet([rdc()], { modeChiffrage: 'decompose' })
    assert.ok(d.materiaux.synthese.some((m) => m.code === 'ciment_beton'))
  })
  test('le ciment à commander du béton = ciment du DQE décomposé = total des lignes', () => {
    const { r: rr, d } = dqe([rdc()], { modeChiffrage: 'decompose' })
    const somme = rr.materiaux.lignes.filter((l) => l.code === 'ciment_beton').reduce((s, l) => s + l.quantiteExacte, 0)
    assert.equal(d.lignes.find((l) => l.code === 'ciment50').q, Math.ceil(somme - 1e-9))
  })
})

describe('Fondations : sortie détaillée par ouvrage', () => {
  test('semelle filante : dimensions, volumes, acier estimé, matériaux associés', () => {
    const r = metrerProjet([rdc()], { fondation: { type: 'filante', lineaire: 40, semL: 0.5, semH: 0.25, profFouille: 1 } })
    const s = r.totaux.fondation.semellesFilantes[0]
    assert.equal(s.longueur, 40); assert.equal(s.largeur, 0.5); assert.equal(s.hauteur, 0.25); assert.equal(s.profFouille, 1)
    proche(s.volFouille, 20); proche(s.volBA, 5); assert.equal(s.acierStatut, 'estime')
    assert.ok(s.acierKg > 0 && s.materiaux.cimentSacs > 0 && s.remblaiIndicatif >= 0 && s.deblaisEvacuesIndicatif >= 0)
  })
  test('semelles isolées : un détail par type (S1, S2…)', () => {
    const r = metrerProjet([rdc()], { systeme: 'ossature', fondation: { type: 'isolees', profFouille: 1.5, semelles: [{ type: 'S1', nb: 4, L: 1.2, l: 1.2, h: 0.4 }, { type: 'S2', nb: 2, L: 1.5, l: 1.5, h: 0.4 }] } })
    const [a, b] = r.totaux.fondation.semellesIsolees
    assert.equal(a.ref, 'S1'); assert.equal(a.nb, 4); proche(a.volFouille, 4 * 1.44 * 1.5); proche(b.volBA, 2 * 2.25 * 0.4)
    assert.equal(a.acierStatut, 'estime')
  })
})

describe('Validation stricte des données', () => {
  test('nb = 0 est respecté (plus transformé en 1)', () => {
    assert.equal(metrerProjet([rdc({ poteaux: [{ nb: 0, a: 0.2, b: 0.2 }] })], {}).totaux.volPoteaux, 0)
    assert.ok(metrerProjet([rdc({ poteaux: [{ nb: '', a: 0.2, b: 0.2 }] })], {}).totaux.volPoteaux > 0) // vide → 1
    assert.equal(metrerProjet([rdc({ murs: [{ type: 'agglo20', L: 10, H: 3, nb: 0 }] })], {}).totaux.Smur, 0)
  })
  test('dimension négative : alerte bloquante', () => {
    const r = metrerProjet([rdc({ poteaux: [{ nb: 1, a: -0.2, b: 0.2 }] })], {})
    assert.ok(r.alertes.some((a) => a.niveau === 'bloquante' && /négatif/.test(a.msg)))
    assert.equal(r.totaux.volPoteaux, 0)
  })
  test('K hors bornes : alerte bloquante, sauf autorisation explicite', () => {
    const r = metrerProjet([rdc()], {})
    assert.ok(buildDQE(r.totaux, prix, 3).bloquant)
    assert.ok(buildDQE(r.totaux, prix, 0.5).alertes.some((a) => /hors des bornes/.test(a.msg)))
    assert.equal(buildDQE(r.totaux, prix, 3, { autoriserKHorsBornes: true }).bloquant, false)
    assert.equal(buildDQE(r.totaux, prix, 1.3).bloquant, false)
    assert.ok(buildDQE(r.totaux, prix, 'abc').bloquant)
  })
  test('prix négatif : refusé (traité à 0, bloquant)', () => {
    const r = metrerProjet([rdc()], {})
    const d = buildDQE(r.totaux, { ...prix, sable: -5 }, 1.3, { modeChiffrage: 'decompose' })
    assert.ok(d.bloquant)
    assert.ok(d.lignes.find((l) => l.code === 'sable').pu === 0)
  })
  test('mode de chiffrage inconnu : alerte et repli sur « compose »', () => {
    const r = metrerProjet([rdc()], { modeChiffrage: 'nimportequoi' })
    assert.equal(r.totaux.modeChiffrage, 'compose')
    assert.ok(r.alertes.some((a) => /Mode de chiffrage inconnu/.test(a.msg)))
  })
  test('validerEntrees est utilisable seul', () => {
    const v = validerEntrees([{ nom: 'X', HSP: -3 }], { K: 1.3 })
    assert.equal(v.erreurs.length, 1)
  })
  test('aucun DQE « complet » tant que des postes sont estimés', () => {
    const { d } = dqe([rdc()], {})
    assert.equal(d.complet, false)
    assert.match(d.libelleTotal, /INDICATIF/)
    assert.ok(d.raisonsIncomplet.length > 0)
    const base = buildDQE(metrerProjet([rdc()], {}).totaux, Object.fromEntries(PRIX.map((p) => [p.code, p.bi + 1])), 1.3)
    assert.ok(!base.raisonsIncomplet.some((x) => /estimé par défaut/.test(x)))   // prix modifiés → plus « estimés »
  })
  test('le DQE expose mode, périmètre, version et date de la base de prix', () => {
    const { d } = dqe([rdc()], { modeChiffrage: 'decompose' })
    assert.match(d.perimetre, /décomposés/)
    assert.ok(d.baseDePrix.version && d.baseDePrix.date)
    assert.ok(Array.isArray(d.hypotheses) && d.hypotheses.length > 3)
  })
})

describe('Arrondis', () => {
  test('les totaux sont sommés sans arrondi intermédiaire (écart < 0,01 m³ sur 30 poteaux)', () => {
    const r = metrerProjet([rdc({ poteaux: [{ nb: 30, a: 0.15, b: 0.15, H: 2.77 }] })], {})
    proche(r.totaux.volPoteaux, 30 * 0.15 * 0.15 * 2.77, 0.005)
  })
})
