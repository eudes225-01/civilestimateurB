// test/fondations-lotA.test.js
// Tests du Lot A — Recherche : Fondations (contrainte admissible par zone,
// table de décision §2.2, profondeurs/débords suggérés §3.1–3.4) et de son
// intégration dans les alertes de cohérence (A7).
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  classifierContrainte, resolveContrainteAdmissible, resolveContexteSol,
  recommanderTypeFondation, recommanderFondationProjet,
  suggererProfondeurAncrage, suggererDebordTravail, suggererMatelasDrainant,
  metrerProjet,
} from '../src/index.js'

describe('classifierContrainte (§2.2 seuils)', () => {
  test('≥ 2 bar → bonne (borne incluse)', () => {
    assert.equal(classifierContrainte(2.0), 'bonne')
    assert.equal(classifierContrainte(3.25), 'bonne')
  })
  test('[1 ; 2[ bar → moyenne (borne basse incluse)', () => {
    assert.equal(classifierContrainte(1.0), 'moyenne')
    assert.equal(classifierContrainte(1.5), 'moyenne')
  })
  test('< 1 bar → faible', () => {
    assert.equal(classifierContrainte(0.55), 'faible')
    assert.equal(classifierContrainte(0), 'faible')
  })
})

describe('resolveContrainteAdmissible (zone vs surcharge utilisateur)', () => {
  test('Cotonou (côtière) sans surcharge → milieu de fourchette (1,25 bar)', () => {
    const r = resolveContrainteAdmissible('Cotonou', null)
    assert.equal(r.valeur, 1.25)
    assert.equal(r.source, 'zone')
    assert.equal(r.zone, 'zone_côtière')
  })
  test('Surcharge utilisateur prioritaire sur la valeur de zone', () => {
    const r = resolveContrainteAdmissible('Cotonou', 0.9)
    assert.equal(r.valeur, 0.9)
    assert.equal(r.source, 'utilisateur')
  })
  test('Ville inconnue → valeur nulle, source inconnue', () => {
    const r = resolveContrainteAdmissible('Ville Inexistante', null)
    assert.equal(r.valeur, null)
    assert.equal(r.source, 'inconnue')
  })
})

describe('resolveContexteSol', () => {
  test('Porto-Novo (lagunaire) → nappe_proche', () => {
    assert.equal(resolveContexteSol('Porto-Novo', null).contexte, 'nappe_proche')
  })
  test('Parakou (nord) → stable, surcharge utilisateur possible', () => {
    assert.equal(resolveContexteSol('Parakou', null).contexte, 'stable')
    assert.equal(resolveContexteSol('Parakou', 'argileux').contexte, 'argileux')
  })
})

describe('recommanderTypeFondation (table de décision §2.2)', () => {
  test('Bonne portance + ossature → semelles isolées standard', () => {
    const r = recommanderTypeFondation(2.5, 'ossature')
    assert.equal(r.type, 'isolees')
    assert.equal(r.variante, 'standard')
  })
  test('Bonne portance + murs → semelles filantes standard', () => {
    assert.equal(recommanderTypeFondation(2.5, 'murs').type, 'filante')
  })
  test('Moyenne portance + murs → semelles filantes renforcées', () => {
    const r = recommanderTypeFondation(1.5, 'murs')
    assert.equal(r.type, 'filante')
    assert.equal(r.variante, 'renforcee')
  })
  test('Moyenne portance + mixte → filantes continues (effet radier partiel)', () => {
    assert.equal(recommanderTypeFondation(1.5, 'mixte').type, 'filante')
  })
  test('Faible portance → radier général, quel que soit le système', () => {
    assert.equal(recommanderTypeFondation(0.5, 'ossature').type, 'radier')
    assert.equal(recommanderTypeFondation(0.5, 'murs').type, 'radier')
    assert.equal(recommanderTypeFondation(0.5, 'mixte').type, 'radier')
  })
})

describe('Profondeurs et débords suggérés (§3.1–3.4)', () => {
  test('Contexte stable → 0,45 m (milieu 40–50 cm)', () => {
    assert.equal(suggererProfondeurAncrage('stable').defaut, 0.45)
  })
  test('Contexte argileux → 0,90 m (milieu 80–100 cm)', () => {
    assert.equal(suggererProfondeurAncrage('argileux').defaut, 0.90)
  })
  test('Contexte nappe_proche → 0,30 m minimum, sans borne haute', () => {
    const r = suggererProfondeurAncrage('nappe_proche')
    assert.equal(r.defaut, 0.30)
    assert.equal(r.max, null)
  })
  test('Débord de travail semelle isolée → 0,175 m (milieu 15–20 cm)', () => {
    assert.equal(suggererDebordTravail('isolee').defaut, 0.175)
  })
  test('Matelas drainant applicable en zone côtière, pas en zone centre', () => {
    assert.equal(suggererMatelasDrainant('Cotonou').applicable, true)
    assert.equal(suggererMatelasDrainant('Bohicon').applicable, false)
  })
})

describe('recommanderFondationProjet (agrégation complète)', () => {
  test('Porto-Novo (lagunaire, faible portance) → radier recommandé', () => {
    const r = recommanderFondationProjet({ ville: 'Porto-Novo', systeme: 'ossature', nbNiveaux: 1 })
    assert.equal(r.recommandation.classification, 'faible')
    assert.equal(r.recommandation.type, 'radier')
  })
  test('Faible portance + bâtiment > R+2 → hors périmètre (fondations profondes)', () => {
    const r = recommanderFondationProjet({ ville: 'Porto-Novo', systeme: 'ossature', nbNiveaux: 4 })
    assert.equal(r.horsPerimetre, true)
  })
  test('Zone nord/centre → indicateur bas-fond possible exposé', () => {
    assert.equal(recommanderFondationProjet({ ville: 'Parakou', systeme: 'murs' }).basFondPossible, true)
  })
})

describe('Intégration dans les alertes de cohérence (A7 + Lot A)', () => {
  const levelBase = {
    nom: 'RDC', rez: true, HSP: 3, plancher: 'dallePleine', surfPlancher: 80,
    pieces: [], murs: [],
    poteaux: [{ nom: 'P1', nb: 4, a: 0.25, b: 0.25, H: 3 }],
    poutres: [{ nom: 'Poutres', nb: 1, L: 30, b: 0.2, h: 0.35 }],
  }

  test('Zone faible portance + fondation isolées choisie → alerte bloquante Lot A', () => {
    const { alertes } = metrerProjet([levelBase], {
      systeme: 'ossature', emprise: 80, ville: 'Porto-Novo',
      fondation: { type: 'isolees', semelles: [{ nb: 4, L: 1, l: 1, h: 0.3, prof: 1.5 }] },
    })
    const bloquanteLotA = alertes.some((a) => a.niveau === 'bloquante' && /Lot A/i.test(a.msg))
    assert.ok(bloquanteLotA, JSON.stringify(alertes))
  })

  test('Contrainte admissible surchargée par l\'utilisateur en zone « bonne » → pas de bloquante Lot A', () => {
    const { alertes } = metrerProjet([levelBase], {
      systeme: 'ossature', emprise: 80, ville: 'Porto-Novo',
      fondation: {
        type: 'isolees', contrainteAdmissible: 2.5,
        semelles: [{ nb: 4, L: 1, l: 1, h: 0.3, prof: 1.5 }],
      },
    })
    const bloquanteLotA = alertes.some((a) => a.niveau === 'bloquante' && /Lot A/i.test(a.msg))
    assert.equal(bloquanteLotA, false, JSON.stringify(alertes))
  })

  test('Sans ville renseignée → aucune alerte Lot A (pas de zone connue)', () => {
    const { alertes } = metrerProjet([levelBase], {
      systeme: 'ossature', emprise: 80,
      fondation: { type: 'isolees', semelles: [{ nb: 4, L: 1, l: 1, h: 0.3, prof: 1.5 }] },
    })
    assert.equal(alertes.some((a) => /Lot A|contrainte admissible/i.test(a.msg)), false, JSON.stringify(alertes))
  })
})
