// test/ifc.test.js — lecteur IFC (maquette écrite à la main, voir fixtures/maquette.js)
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { lireIFC, metrerProjet, PARAMS_DEFAUT } from '../src/index.js'
import { ifcMaquette } from './fixtures/maquette.js'

describe('lireIFC', () => {
  test('refuse un fichier qui n\'est pas un IFC', () => {
    const r = lireIFC('Bonjour')
    assert.equal(r.ok, false)
    assert.match(r.message, /pas un IFC valide/)
  })

  test('unités en millimètres : tout est converti en mètres', () => {
    const r = lireIFC(ifcMaquette({ mm: true }))
    assert.equal(r.ok, true)
    assert.equal(r.stats.unitesLongueur, 0.001)
    const rdc = r.niveaux.find((n) => n.nom === 'RDC')
    const nord = rdc.murs.find((m) => m.nom === 'Mur ext. nord')
    assert.equal(nord.L, 10); assert.equal(nord.H, 3)
    assert.equal(nord.type, 'agglo20')
  })

  test('unités en mètres : mêmes résultats', () => {
    const a = lireIFC(ifcMaquette({ mm: true })), b = lireIFC(ifcMaquette({ mm: false }))
    assert.deepEqual(a.niveaux.map((n) => n.murs), b.niveaux.map((n) => n.murs))
    assert.equal(b.stats.unitesLongueur, 1)
  })

  test('niveaux, murs, position extérieure et épaisseur → type de mur', () => {
    const r = lireIFC(ifcMaquette())
    assert.deepEqual(r.niveaux.map((n) => n.nom), ['RDC', 'R+1'])
    const [rdc, r1] = r.niveaux
    assert.equal(rdc.murs.length, 2)                      // le mur sans quantités n'est pas inventé
    assert.equal(rdc.murs.find((m) => m.nom === 'Mur ext. nord').position, 'exterieur')
    assert.equal(rdc.murs.find((m) => m.nom === 'Cloison salon').type, 'agglo10')
    assert.equal(r1.murs[0].type, 'agglo15')
    assert.equal(rdc.HSP, 3); assert.equal(r1.HSP, 2.8)
  })

  test('portes et fenêtres rattachées à leur mur (ouvertures), avec leurs dimensions', () => {
    const nord = lireIFC(ifcMaquette()).niveaux[0].murs.find((m) => m.nom === 'Mur ext. nord')
    assert.equal(nord.portes, 1); assert.equal(nord.fenetres, 1)
    assert.equal(nord.pL, 0.9); assert.equal(nord.pH, 2.1)
    assert.equal(nord.fL, 1.2); assert.equal(nord.fH, 1.2)
  })

  test('poteaux : section lue sur le profil rectangulaire, regroupés', () => {
    const rdc = lireIFC(ifcMaquette()).niveaux[0]
    assert.equal(rdc.poteaux.length, 1)
    assert.deepEqual({ nb: rdc.poteaux[0].nb, a: rdc.poteaux[0].a, b: rdc.poteaux[0].b, H: rdc.poteaux[0].H }, { nb: 2, a: 0.2, b: 0.3, H: 3 })
  })

  test('dalles : surface et épaisseur ; la dalle de toiture n\'est pas reprise mais signalée', () => {
    const r = lireIFC(ifcMaquette())
    assert.equal(r.niveaux[0].surfPlancher, 80)
    assert.equal(r.niveaux[0].epDalle, 0.15)
    assert.equal(r.niveaux[1].surfPlancher, null)
    assert.ok(r.incertitudes.some((m) => /dalle\(s\) de toiture/.test(m)))
  })

  test('éléments sans quantités : comptés comme manquants avec conseil d\'export, jamais inventés', () => {
    const r = lireIFC(ifcMaquette())
    assert.ok(r.incertitudes.some((m) => /sans quantités exploitables/.test(m) && /Base Quantities/.test(m)))
    const sans = lireIFC(ifcMaquette({ avecQuantites: false }))
    assert.equal(sans.niveaux[0].murs.length, 0)
  })

  test('titre du projet repris', () => { assert.equal(lireIFC(ifcMaquette()).titre, 'Villa Test') })

  test('de l\'IFC au métré : les quantités du fichier arrivent au moteur', () => {
    const r = lireIFC(ifcMaquette())
    const levels = r.niveaux.map((n, i) => ({ ...n, rez: i === 0, plancher: 'dallePleine', tremies: '' }))
    const { totaux } = metrerProjet(levels, { ...PARAMS_DEFAUT })
    // Mur nord 10 × 3 − (0,9×2,1 + 1,2×1,2) ; cloison 4 × 3 ; R+1 8 × 2,8
    const attendu = (30 - 1.89 - 1.44) + 12 + 22.4
    assert.ok(Math.abs(totaux.Smur - attendu) < 0.05, `Smur ${totaux.Smur} ≠ ${attendu}`)
    assert.equal(totaux.volPoteaux, 0.36)           // 2 × 0,2 × 0,3 × 3
  })
})
