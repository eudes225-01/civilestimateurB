// test/prix-json.test.js — prix modifiables par fichier JSON, sans toucher au code.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PRIX, PRIX_VERSION, PRIX_DATE } from '../src/index.js'
import { chargerPrix } from '../civilestimateur-backend/src/prixStore.js'

const base = { base: PRIX, version: PRIX_VERSION, date: PRIX_DATE }
const tmp = (contenu) => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'prix-')), 'prix.json')
  fs.writeFileSync(f, typeof contenu === 'string' ? contenu : JSON.stringify(contenu))
  return f
}

describe('Base de prix par fichier JSON', () => {
  test('le prix.json livré reproduit exactement la base du moteur', () => {
    const r = chargerPrix(base)
    assert.equal(r.source, 'json')
    assert.deepEqual(r.avertissements, [])
    assert.deepEqual(r.postes, PRIX)
    assert.equal(r.version, PRIX_VERSION)
  })
  test('modifier un montant dans le JSON change le prix, sans toucher aux autres', () => {
    const f = tmp({ version: 'RPR 27.1', date: '2027-03', postes: [{ code: 'ciment50', bi: 7200, sac: 7200 }] })
    const r = chargerPrix({ ...base, fichier: f })
    assert.equal(r.version, 'RPR 27.1')
    const c = r.postes.find((p) => p.code === 'ciment50')
    assert.equal(c.bi, 7200); assert.equal(c.sac, 7200)
    assert.equal(c.designation, PRIX.find((p) => p.code === 'ciment50').designation)
    assert.equal(r.postes.length, PRIX.length)
    assert.deepEqual(r.postes.filter((p) => p.code !== 'ciment50'), PRIX.filter((p) => p.code !== 'ciment50'))
  })
  test('« estime » : le prix.json fait foi (présent = estimation, absent = prix réel)', () => {
    const f = tmp({ postes: [{ code: 'san_wc', bi: 65000, estime: true }, { code: 'sable', bi: 7500 }] })
    const r = chargerPrix({ ...base, fichier: f })
    assert.equal(r.postes.find((p) => p.code === 'san_wc').estime, true)
    const sable = r.postes.find((p) => p.code === 'sable')
    assert.equal(sable.bi, 7500)
    assert.equal('estime' in sable, false, 'un prix réel saisi retire la mention « estimé »')
  })
  test('JSON absent : repli sur le moteur', () => {
    const r = chargerPrix({ ...base, fichier: '/inexistant/prix.json' })
    assert.equal(r.source, 'moteur'); assert.deepEqual(r.postes, PRIX)
  })
  test('JSON cassé : repli sur le moteur avec avertissement', () => {
    const r = chargerPrix({ ...base, fichier: tmp('{ pas du json') })
    assert.equal(r.source, 'moteur'); assert.equal(r.avertissements.length, 1)
  })
  test('poste invalide ou inconnu : ignoré et signalé', () => {
    const f = tmp({ postes: [{ code: 'sable', bi: -5 }, { code: 'sable', bi: 'abc' }, { code: 'zzz', bi: 1 }, { code: 'gravier', bi: 18000 }] })
    const r = chargerPrix({ ...base, fichier: f })
    assert.equal(r.avertissements.length, 3)
    assert.equal(r.postes.find((p) => p.code === 'sable').bi, PRIX.find((p) => p.code === 'sable').bi)
    assert.equal(r.postes.find((p) => p.code === 'gravier').bi, 18000)
  })
})
