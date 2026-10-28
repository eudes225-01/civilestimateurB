// test/couverture.test.js
// Plan d'amélioration « lecture de plans » : correctifs visibles (K, pans de toiture),
// couverture de lecture, états de confirmation par donnée, blocage / déblocage de l'export.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  metrerProjet, metrerToiture, buildDQE, buildSousDetail, PRIX, PARAMS_DEFAUT, FONDATION_DEFAUT,
  evaluerCouverture, enregistrerConfirmation, retirerConfirmation, montantsIncomplets, exportAutorise,
} from '../src/index.js'

const prixMap = Object.fromEntries(PRIX.map((p) => [p.code, p.sac ?? p.bi]))
const rdc = (extra = {}) => ({
  nom: 'RDC', rez: true, HSP: 3, plancher: 'dallePleine', surfPlancher: 80, tremies: '',
  pieces: [{ nom: 'Salon', L: 8, l: 10, portes: 1, fenetres: 2 }], murs: [], poteaux: [], poutres: [], ...extra,
})
const etage = (extra = {}) => ({ ...rdc(), nom: 'R+1', rez: false, plancher: 'aucun', ...extra })

describe('K : appliqué une seule fois', () => {
  test('prix de base × K, y compris pour un prix « estimé »', () => {
    const { totaux } = metrerProjet([rdc()], { ...PARAMS_DEFAUT })
    const prixEst = { ...prixMap, sable: 9000, gravier: 18000 }
    const dqe = buildDQE(totaux, prixEst, 1.3)
    const sable = dqe.lignes.find((l) => l.code === 'sable')
    assert.equal(sable.pu, 11700)               // 9 000 × 1,30 — pas 15 210
    assert.equal(sable.montant, Math.round(sable.q * 11700))
    const sd = buildSousDetail(dqe.lignes, prixEst, 1.3).find((s) => s.code === 'sable')
    assert.equal(sd.puVente, sable.pu)           // le sous-détail et le DQE s'accordent
    assert.equal(sd.deboursesSec, 9000)
  })
})

describe('Toiture : aucun pan n\'est perdu', () => {
  test('un pan sans pente propre prend la pente générale', () => {
    const r = metrerToiture({ pente: 30, pans: [{ nom: 'A', pente: 30, surface: 50 }, { nom: 'B', pente: '', surface: 50 }] })
    assert.equal(r.nbPans, 2)
    assert.equal(r.surfProjetee, 100)
    assert.ok(Math.abs(r.surfDeveloppee - 100 * Math.sqrt(1 + 0.09)) < 0.02)
    assert.equal(r.pansSansPente, 0)
  })
  test('sans aucune pente : le pan reste compté (coefficient forfaitaire) et une alerte le dit', () => {
    const r = metrerToiture({ pans: [{ nom: 'A', pente: 30, surface: 50 }, { nom: 'B', pente: null, surface: 50 }] }, { coefDefaut: 1.15 })
    assert.equal(r.pansSansPente, 1)
    assert.ok(Math.abs(r.surfDeveloppee - (50 * Math.sqrt(1.09) + 50 * 1.15)) < 0.02)
    assert.ok(r.alertes.some((a) => /sans pente/.test(a.msg)))
  })
  test('pans lus insuffisants par rapport à la surface annoncée : alerte « pan manquant »', () => {
    const r = metrerToiture({ surfaceProjetee: 120, pans: [{ pente: 30, surface: 55 }] })
    assert.ok(r.alertes.some((a) => /pan semble manquer/.test(a.msg)))
  })
})

describe('Couverture de lecture', () => {
  test('projet vide : rien à qualifier', () => {
    const { couverture } = metrerProjet([{ nom: 'RDC', rez: true, pieces: [{ L: '', l: '' }], murs: [], poteaux: [], poutres: [] }], { ...PARAMS_DEFAUT })
    assert.equal(couverture.vide, true)
    assert.equal(exportAutorise(couverture), true)
  })

  test('fondations jamais lues ni saisies : valeurs par défaut à confirmer, export bloqué', () => {
    const { couverture } = metrerProjet([rdc()], { ...PARAMS_DEFAUT })
    const f = couverture.aConfirmer.find((x) => x.cle === 'fondation')
    assert.ok(f, 'question fondation attendue')
    assert.equal(f.etat, 'a_confirmer')
    assert.equal(f.valeurDetectee.profFouille, FONDATION_DEFAUT.profFouille)
    assert.equal(couverture.bloquant, true)
    assert.equal(exportAutorise(couverture), false)
    assert.ok(couverture.score < 100)
    assert.match(couverture.resume, /à confirmer/)
  })

  test('une valeur par défaut explicitement confirmée ne bloque plus', () => {
    let confirmations = {}
    const tout = (conf) => metrerProjet([rdc()], { ...PARAMS_DEFAUT, confirmations: conf }).couverture
    for (const x of tout(confirmations).aConfirmer) {
      confirmations = enregistrerConfirmation(confirmations, x.cle, { utilisateur: 'u1', date: '2026-10-28T10:00:00Z' })
    }
    const c = tout(confirmations)
    assert.equal(c.bloquant, false)
    assert.equal(exportAutorise(c), true)
    const f = c.aConfirmer.find((x) => x.cle === 'fondation')
    assert.equal(f.etat, 'confirmee')
    assert.equal(f.par, 'u1')
    assert.equal(f.date, '2026-10-28T10:00:00Z')
    // retirer la confirmation → à nouveau bloquant
    assert.equal(tout(retirerConfirmation(confirmations, 'fondation')).bloquant, true)
  })

  test('une correction numérique est appliquée au calcul (profondeur de fouille)', () => {
    const lev = [rdc({ murs: [{ nom: 'M1', type: 'agglo15', L: 36, H: 3, position: 'exterieur' }] })]
    const lues = { ...PARAMS_DEFAUT, planFlags: { fondationLue: true, profondeurFouilleLue: false, typesLus: { fondation: 1 } }, fondation: { ...FONDATION_DEFAUT, semL: 0.5 } }
    const avant = metrerProjet(lev, lues)
    const q = avant.couverture.aConfirmer.find((x) => x.cle === 'profondeur_fouille')
    assert.ok(q && q.etat === 'a_confirmer')
    const conf = enregistrerConfirmation({}, 'profondeur_fouille', { valeur: 1.2, utilisateur: 'u1' })
    const apres = metrerProjet(lev, { ...lues, confirmations: conf })
    assert.equal(apres.couverture.aConfirmer.find((x) => x.cle === 'profondeur_fouille').etat, 'corrigee')
    assert.ok(apres.totaux.fondation.volFouilles > avant.totaux.fondation.volFouilles * 1.9, 'fouille ≈ ×2 pour 1,20 m au lieu de 0,60 m')
  })

  test('plan de fondation lu avec profondeur : plus de question sur la fondation', () => {
    const p = { ...PARAMS_DEFAUT, planFlags: { fondationLue: true, profondeurFouilleLue: true, typesLus: { fondation: 1 } }, fondation: { ...FONDATION_DEFAUT, profFouille: 1.2, terrassement: { sol: 'Latérite', cf: 1.3, cp: 1.2, bloquant: false } } }
    const { couverture } = metrerProjet([rdc()], p)
    assert.equal(couverture.aConfirmer.find((x) => x.cle === 'fondation'), undefined)
    assert.equal(couverture.aConfirmer.find((x) => x.cle === 'profondeur_fouille'), undefined)
    assert.equal(couverture.aConfirmer.find((x) => x.cle === 'sol'), undefined)
  })

  test('toiture sans pente : coefficient forfaitaire à confirmer ; la pente saisie est appliquée', () => {
    const base = { ...PARAMS_DEFAUT, toiture: 'bac' }
    const a = metrerProjet([rdc()], base)
    const q = a.couverture.aConfirmer.find((x) => x.cle === 'toiture_pente')
    assert.ok(q && q.etat === 'a_confirmer')
    const conf = enregistrerConfirmation({}, 'toiture_pente', { valeur: 30 })
    const b = metrerProjet([rdc()], { ...base, confirmations: conf })
    assert.ok(Math.abs(b.totaux.surfToiture - 80 * Math.sqrt(1.09)) < 0.5, `surface ${b.totaux.surfToiture}`)
    assert.equal(b.couverture.aConfirmer.find((x) => x.cle === 'toiture_pente').etat, 'corrigee')
  })

  test('toit-terrasse : aucune question de pente', () => {
    const { couverture } = metrerProjet([rdc()], { ...PARAMS_DEFAUT, toiture: 'terrasse' })
    assert.equal(couverture.aConfirmer.find((x) => x.cle === 'toiture_pente'), undefined)
  })

  test('niveau sans maçonnerie ni HSP : exception groupée, jamais une saisie exhaustive', () => {
    const lev = [rdc({ HSP: '' }), etage({ HSP: '', pieces: [], murs: [], surfPlancher: 80, poteaux: [{ nb: 4, a: 0.2, b: 0.2 }] })]
    const { couverture } = metrerProjet(lev, { ...PARAMS_DEFAUT })
    const hsp = couverture.aConfirmer.find((x) => x.cle === 'hsp')
    assert.deepEqual(hsp.valeurDetectee.niveaux, ['RDC', 'R+1'])
    const mac = couverture.aConfirmer.find((x) => x.cle === 'lot_maconnerie')
    assert.deepEqual(mac.valeurDetectee.niveaux, ['R+1'])
    assert.equal(mac.confirmerLabel, 'Exclure du devis')
  })

  test('plancher sans surface : signalé, et exclure le lot le sort du score', () => {
    const lev = [rdc({ surfPlancher: '', pieces: [{ nom: 'S', L: '', l: '' }], murs: [{ nom: 'M', type: 'agglo15', L: 20, H: 3, position: 'exterieur' }] })]
    const a = metrerProjet(lev, { ...PARAMS_DEFAUT })
    const q = a.couverture.aConfirmer.find((x) => x.cle === 'plancher_surface')
    assert.ok(q)
    const lotPl = a.couverture.lots.find((l) => l.cle === 'planchers')
    assert.equal(lotPl.statut, 'absent')
    const b = metrerProjet(lev, { ...PARAMS_DEFAUT, confirmations: enregistrerConfirmation({}, 'plancher_surface', {}) })
    assert.equal(b.couverture.lots.find((l) => l.cle === 'planchers').statut, 'exclu')
  })

  test('le score progresse quand les données arrivent (lecture complète > lecture partielle)', () => {
    const partiel = metrerProjet([rdc()], { ...PARAMS_DEFAUT }).couverture.score
    const complet = metrerProjet([rdc()], {
      ...PARAMS_DEFAUT, planFlags: { fondationLue: true, profondeurFouilleLue: true },
      fondation: { ...FONDATION_DEFAUT, profFouille: 1.2, terrassement: { sol: 'Latérite', cf: 1.3, cp: 1.2 } },
      plans: { toiture: { pente: 30, pans: [{ pente: 30, surface: 80 }, { pente: 30, surface: 12 }] } },
    }).couverture.score
    assert.ok(complet > partiel, `${complet} > ${partiel}`)
    assert.equal(complet, 100)
  })

  test('montants reposant sur une donnée à confirmer : repérés par chapitre du DQE', () => {
    const r = metrerProjet([rdc()], { ...PARAMS_DEFAUT })
    const dqe = buildDQE(r.totaux, prixMap, 1.3)
    const m = montantsIncomplets(dqe, r.couverture)
    const fond = m.find((x) => x.cle === 'fondation')
    assert.ok(fond && fond.montant > 0 && fond.lignes.every((n) => /^[12]\./.test(n)))
  })
})
