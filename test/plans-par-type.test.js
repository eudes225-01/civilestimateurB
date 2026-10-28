// test/plans-par-type.test.js
// Codification des plans techniques BTP : classification par signatures,
// routage des vues, et modules de calcul propres à chaque type de plan
// (plomberie, électricité, toiture, voiles / chaînages verticaux du coffrage).
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  TYPES_PLANS, CLES_TYPES_PLANS, classifierPlan, routerPlan,
  metrerPlomberie, metrerElectricite, metrerToiture,
  metrerNiveau, metrerProjet, buildDQE, PRIX, RATIOS_ACIER_DEFAUT,
} from '../src/index.js'

const proche = (got, want, tol = 0.011) => assert.ok(Math.abs(got - want) <= tol, `obtenu ${got}, attendu ${want}`)

describe('Registre des plans', () => {
  test('les 8 types du document de codification sont présents', () => {
    assert.deepEqual(
      [...CLES_TYPES_PLANS].sort(),
      ['coffrage', 'coupe', 'electricite', 'fondation', 'plan', 'plomberie', 'poutraison', 'toiture'],
    )
    CLES_TYPES_PLANS.forEach((k) => {
      assert.ok(TYPES_PLANS[k].lab && TYPES_PLANS[k].module && TYPES_PLANS[k].repere, `${k} incomplet`)
    })
  })
})

describe('classifierPlan — signatures', () => {
  test('cartouche seul suffit', () => {
    const r = classifierPlan({ cartouche: 'PLAN DE FONDATION', codes: [] })
    assert.equal(r.type, 'fondation')
    assert.equal(r.confiance, 'haute')
  })
  test('fondation par les codes (SF, S2, BP, TN)', () => {
    const r = classifierPlan({ codes: ['SF', 'S1', 'S2', 'BP', 'TN', '-1.20'] })
    assert.equal(r.type, 'fondation')
  })
  test('plomberie : réseaux + diamètres + appareils', () => {
    const r = classifierPlan({ codes: ['EF', 'EC', 'EU', 'EV', 'Ø100', 'WC', 'lavabo'] })
    assert.equal(r.type, 'plomberie')
    assert.equal(r.confiance, 'haute')
  })
  test('électricité : VV, RJ45, TGBT', () => {
    assert.equal(classifierPlan({ codes: ['VV', 'RJ45', 'TGBT'] }).type, 'electricite')
  })
  test('poutraison : nervures N<n> et épaisseur composée (16+4)', () => {
    assert.equal(classifierPlan({ codes: ['N1', 'N2', '(16+4)', 'P1(20x40)'] }).type, 'poutraison')
  })
  test('coffrage : V<n>, D<n>, CV<n>, poteaux P<n>', () => {
    assert.equal(classifierPlan({ codes: ['P1', 'P2', 'V1', 'D1', 'CV1'] }).type, 'coffrage')
  })
  test('coupe : HSP / NF / NGF / A-A', () => {
    assert.equal(classifierPlan({ codes: ['HSP', 'NF', 'NGF', 'A-A'] }).type, 'coupe')
  })
  test('plan d\'étage : F<n>/B<n> + RDC', () => {
    assert.equal(classifierPlan({ codes: ['RDC', 'F1', 'F2', 'B1', 'P1'] }).type, 'plan')
  })
  test('toiture : pente %, faîtage, noue', () => {
    assert.equal(classifierPlan({ codes: ['30%', 'faîtage', 'noue', 'égout'] }).type, 'toiture')
  })
  test('aucune signature → null', () => {
    const r = classifierPlan({ codes: ['abc', 'xyz'] })
    assert.equal(r.type, null)
    assert.equal(r.confiance, 'basse')
  })
  test('le cartouche l\'emporte sur des codes ambigus (poteaux P<n> dans un plan de poutraison)', () => {
    const r = classifierPlan({ cartouche: 'PLAN DE POUTRAISON', codes: ['P1', 'P2', 'P3'] })
    assert.equal(r.type, 'poutraison')
  })
})

describe('routerPlan — reclassement des vues', () => {
  test('dépôt cohérent avec la signature : pas de reclassement', () => {
    const r = routerPlan({ typeDepose: 'plomberie', cartouche: 'PLAN DE PLOMBERIE', codes: ['EF', 'EU'] })
    assert.equal(r.type, 'plomberie')
    assert.equal(r.reclasse, false)
    assert.equal(r.message, null)
  })
  test('plan déposé au mauvais endroit → reclassé avec message explicite', () => {
    const r = routerPlan({ typeDepose: 'fondation', cartouche: 'PLAN DE COFFRAGE', codes: ['P1', 'V1', 'D1'] })
    assert.equal(r.type, 'coffrage')
    assert.equal(r.reclasse, true)
    assert.match(r.message, /Fondation/)
    assert.match(r.message, /Coffrage/)
  })
  test('signature faible : le type annoncé par la lecture prime sur le dépôt', () => {
    const r = routerPlan({ typeDepose: 'plan', typeIA: 'coupe', codes: [] })
    assert.equal(r.type, 'coupe')
    assert.equal(r.reclasse, true)
  })
  test('rien de net : on garde le type du dépôt', () => {
    const r = routerPlan({ typeDepose: 'toiture', codes: [] })
    assert.equal(r.type, 'toiture')
    assert.equal(r.reclasse, false)
  })
  test('type invalide partout → vue ignorée', () => {
    const r = routerPlan({ typeDepose: 'inconnu', typeIA: 'nimporte', codes: [] })
    assert.equal(r.type, null)
    assert.ok(r.message)
  })
})

describe('Plomberie', () => {
  const ex = {
    appareils: [{ type: 'WC', nb: 2 }, { type: 'Lavabo', nb: 2 }, { type: 'douche', nb: 1 }, { type: 'Évier', nb: 1 }],
    reseaux: [
      { reseau: 'EF', diam: 20, L: 12 },
      { reseau: 'EF', diam: 25, L: 6 },
      { reseau: 'EV', diam: 100, L: 8, pente: 2 },
      { reseau: 'EU', diam: 50, L: 5 },
    ],
    regards: [{ nb: 3 }],
  }
  const r = metrerPlomberie(ex)
  test('appareils comptés par type', () => {
    assert.equal(r.nbAppareils, 6)
    assert.deepEqual(r.appareils, { wc: 2, lavabo: 2, douche: 1, evier: 1 })
  })
  test('linéaires par réseau et par diamètre', () => {
    proche(r.reseaux.EF.L, 18)
    assert.deepEqual(r.reseaux.EF.parDiam, { 20: 12, 25: 6 })
    proche(r.reseaux.EV.L, 8)
    proche(r.longueurTotale, 31)
    assert.equal(r.nbRegards, 3)
  })
  test('tronçon d\'évacuation sans pente signalé', () => {
    assert.ok(r.alertes.some((a) => /sans pente/.test(a.msg)))
  })
  test('WC sans réseau d\'évacuation signalé', () => {
    const x = metrerPlomberie({ appareils: [{ type: 'wc', nb: 1 }], reseaux: [{ reseau: 'EF', diam: 20, L: 3 }] })
    assert.ok(x.alertes.some((a) => /évacuation/.test(a.msg)))
  })
  test('libellés tolérés (« eau froide », « eaux vannes »)', () => {
    const x = metrerPlomberie({ reseaux: [{ reseau: 'eau froide', diam: 20, L: 4 }, { reseau: 'eaux vannes', diam: 100, L: 2, pente: 1 }] })
    proche(x.reseaux.EF.L, 4)
    proche(x.reseaux.EV.L, 2)
  })
})

describe('Électricité', () => {
  const r = metrerElectricite({
    elements: [
      { type: 'point_lumineux', nb: 10 },
      { type: 'interrupteur_simple', nb: 6 },
      { type: 'va_et_vient', nb: 3 },
      { type: 'prise_16a', nb: 8 },
      { type: 'prise_specialisee', nb: 2, repere: 'cuisinière 32A' },
      { type: 'rj45', nb: 1 },
      { type: 'tableau', nb: 1, repere: 'TGBT' },
    ],
  })
  test('décompte par symbole et forfait / point', () => {
    assert.equal(r.nbPointsLumineux, 10)
    assert.equal(r.nbCommandes, 9)
    assert.equal(r.nbPrises, 11)
    assert.equal(r.nbPointsForfait, 21)
    assert.deepEqual(r.tableaux, { TGBT: 1 })
  })
  test('nombre impair de va-et-vient signalé', () => {
    assert.ok(r.alertes.some((a) => /impair de va-et-vient/.test(a.msg)))
  })
  test('lumières sans tableau signalées', () => {
    const x = metrerElectricite({ elements: [{ type: 'point_lumineux', nb: 4 }, { type: 'interrupteur_simple', nb: 2 }] })
    assert.ok(x.alertes.some((a) => /tableau/.test(a.msg)))
  })
  test('libellés usuels reconnus (VV, RJ45, prise 16A)', () => {
    const x = metrerElectricite({ elements: [{ type: 'VV', nb: 2 }, { type: 'RJ45', nb: 1 }, { type: 'prise 16A', nb: 3 }] })
    assert.equal(x.parType.va_et_vient, 2)
    assert.equal(x.parType.rj45, 1)
    assert.equal(x.parType.prise_16a, 3)
  })
})

describe('Toiture', () => {
  test('surface développée = surface en plan × √(1+p²)', () => {
    const r = metrerToiture({ surfaceProjetee: 100, pente: 30 })
    proche(r.surfDeveloppee, 104.4, 0.05)
    proche(r.coefMoyen, 1.04, 0.01)
  })
  test('dimensions + débord, pente 100 % → coefficient √2', () => {
    const r = metrerToiture({ L: 10, l: 8, debord: 0.5, pente: 100 })
    proche(r.surfProjetee, 99)
    proche(r.surfDeveloppee, 140.01, 0.05)
  })
  test('plusieurs pans : chaque pan a sa pente', () => {
    const r = metrerToiture({ pans: [{ surface: 50, pente: 0 }, { surface: 50, pente: 100 }] })
    proche(r.surfDeveloppee, 50 + 50 * Math.SQRT2, 0.05)
  })
  test('linéaires faîtage / noues / égouts / chéneaux', () => {
    const r = metrerToiture({ surfaceProjetee: 80, pente: 25, faitages: [{ L: 9 }], noues: [{ L: 3 }, { L: 2 }], egouts: [{ L: 9 }, { L: 9 }], cheneaux: [{ L: 18 }] })
    proche(r.faitageL, 9); proche(r.noueL, 5); proche(r.egoutL, 18); proche(r.cheneauL, 18)
  })
  test('pente illisible : pas de surface, alerte', () => {
    const r = metrerToiture({ surfaceProjetee: 80 })
    assert.equal(r.surfDeveloppee, 0)
    assert.ok(r.alertes.length > 0)
  })
  test('repli sur l\'emprise du projet', () => {
    const r = metrerToiture({ pente: 20 }, { emprise: 90 })
    proche(r.surfProjetee, 90)
  })
})

describe('Coffrage : voiles et chaînages verticaux', () => {
  const lv = {
    nom: 'RDC', rez: true, HSP: 2.8,
    voiles: [{ nom: 'V1', nb: 2, L: 3, ep: 0.2, H: 2.8 }],
    chainagesV: [{ nom: 'CV1', nb: 4, a: 0.15, b: 0.15, H: 3 }],
  }
  test('volume et coffrage des voiles, volume des CV', () => {
    const m = metrerNiveau(lv, {})
    proche(m.volVoiles, 3.36)
    proche(m.coffVoiles, 33.6)
    proche(m.volCV, 0.27)
  })
  test('H de voile absente : HSP du niveau', () => {
    const m = metrerNiveau({ HSP: 3, voiles: [{ nb: 1, L: 4, ep: 0.2 }] }, {})
    proche(m.volVoiles, 2.4)
  })
  test('intégration projet : BA élévation, acier voiles, coffrage', () => {
    const { totaux } = metrerProjet([lv], { systeme: 'ossature' })
    proche(totaux.volVoiles, 3.36)
    proche(totaux.volCV, 0.27)
    proche(totaux.coffVoiles, 33.6)
    assert.ok(totaux.volBAelevation >= 3.63 - 0.011)
    const ligne = totaux.acierDetail.find((d) => d.lib === 'Voiles')
    assert.equal(ligne.q, Math.round(3.36 * RATIOS_ACIER_DEFAUT.voile))
  })
  test('le ratio voile est éditable', () => {
    const { totaux } = metrerProjet([lv], { systeme: 'ossature', ratiosAcier: { voile: 100 } })
    assert.equal(totaux.acierDetail.find((d) => d.lib === 'Voiles').q, 336)
  })
})

describe('Intégration projet + DQE', () => {
  const levels = [{ nom: 'RDC', rez: true, HSP: 3, plancher: 'dallePleine', surfPlancher: 80, pieces: [{ nom: 'Salon', L: 8, l: 10 }] }]
  const plans = {
    plomberie: { appareils: [{ type: 'wc', nb: 2 }], reseaux: [{ reseau: 'EF', diam: 20, L: 10 }, { reseau: 'EV', diam: 100, L: 6, pente: 2 }], regards: [{ nb: 2 }] },
    electricite: { elements: [{ type: 'point_lumineux', nb: 8 }, { type: 'interrupteur_simple', nb: 4 }, { type: 'prise_16a', nb: 6 }, { type: 'tableau', nb: 1, repere: 'TD' }] },
    toiture: { surfaceProjetee: 100, pente: 30, faitages: [{ L: 10 }], cheneaux: [{ L: 20 }] },
  }
  const prixMap = Object.fromEntries(PRIX.map((p) => [p.code, p.sac || p.bi]))

  test('sans plans spécialisés : aucun champ ni poste ajouté (non-régression)', () => {
    const { totaux } = metrerProjet(levels, { toiture: 'bac' })
    assert.equal(totaux.plomberie, null)
    assert.equal(totaux.electricite, null)
    assert.equal(totaux.toitureDetail, null)
    const dqe = buildDQE(totaux, prixMap)
    assert.ok(!dqe.lignes.some((l) => /^(11|12)\./.test(l.n)))
    assert.match(dqe.perimetre, /plomberie, électricité/)
  })
  test('avec plans : totaux plomberie / électricité / toiture calculés', () => {
    const { totaux } = metrerProjet(levels, { toiture: 'bac', plans })
    assert.equal(totaux.plomberie.nbAppareils, 2)
    assert.equal(totaux.electricite.nbPointsForfait, 14)
    proche(totaux.surfToiture, 104.4, 0.05)
  })
  test('DQE : sections 11 (plomberie), 12 (électricité) et accessoires de toiture', () => {
    const { totaux } = metrerProjet(levels, { toiture: 'bac', plans })
    const dqe = buildDQE(totaux, prixMap)
    const n = (p) => dqe.lignes.filter((l) => l.n.startsWith(p))
    assert.ok(n('11.').length >= 4)
    assert.equal(n('12.').length, 4)
    assert.ok(dqe.lignes.some((l) => l.n === '8.2' && l.q === 10))
    assert.ok(dqe.lignes.some((l) => l.n === '8.4' && l.q === 20))
    assert.ok(!/plomberie, électricité/.test(dqe.perimetre))
  })
  test('les équipements sont chiffrés au prix moyen par défaut ; un prix remis à 0 reste visible', () => {
    const { totaux } = metrerProjet(levels, { toiture: 'bac', plans })
    const wc = buildDQE(totaux, prixMap).lignes.find((l) => l.code === 'san_wc')
    assert.ok(wc.pu > 0 && wc.montant > 0)
    const wc0 = buildDQE(totaux, { ...prixMap, san_wc: 0 }).lignes.find((l) => l.code === 'san_wc')
    assert.equal(wc0.pu, 0)
    assert.equal(wc0.montant, 0)
  })
  test('alerte : pente forte vs toit-terrasse', () => {
    const { alertes } = metrerProjet(levels, { toiture: 'terrasse', plans })
    assert.ok(alertes.some((a) => /incompatible avec un toit-terrasse/.test(a.msg)))
  })
  test('alertes des modules remontent dans la liste du projet', () => {
    const { alertes } = metrerProjet(levels, { toiture: 'bac', plans: { electricite: { elements: [{ type: 'point_lumineux', nb: 3 }] } } })
    assert.ok(alertes.some((a) => /tableau/.test(a.msg)))
  })
})
