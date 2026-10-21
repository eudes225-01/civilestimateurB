// Validation du proxy Anthropic : pure fonction, aucun réseau ni serveur.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { validerMessages, MessagesInvalides, LIMITES } from '../src/services/validerMessages.js'

const img = (data = 'QUJD', media_type = 'image/jpeg') => ({ type: 'image', source: { type: 'base64', media_type, data } })
const txt = (text = 'Lis ce plan') => ({ type: 'text', text })
const valide = [{ role: 'user', content: [img(), txt()] }]
const refuse = (m, motif) => assert.throws(() => validerMessages(m), (e) => e instanceof MessagesInvalides && (!motif || motif.test(e.message)))

describe('forme émise par le frontend', () => {
  test('image JPEG + texte → acceptée et recopiée à l’identique', () => assert.deepEqual(validerMessages(valide), valide))
  test('contenu texte simple (chaîne) → converti en bloc texte', () => {
    assert.deepEqual(validerMessages([{ role: 'user', content: 'bonjour' }]), [{ role: 'user', content: [txt('bonjour')] }])
  })
})

describe('refus', () => {
  test('absent, vide ou non tableau', () => { refuse(undefined); refuse([]); refuse('x'); refuse({}) })
  test('trop de messages', () => refuse(Array(LIMITES.MESSAGES + 1).fill(valide[0]), /au maximum/))
  test('rôle inconnu (system, tool…)', () => { refuse([{ role: 'system', content: 'x' }]); refuse([{ role: 'tool', content: 'x' }]) })
  test('type de bloc non autorisé (document, tool_use, URL distante)', () => {
    refuse([{ role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'QUJD' } }] }], /text/)
    refuse([{ role: 'user', content: [{ type: 'tool_use', id: 'a', name: 'b', input: {} }] }])
    refuse([{ role: 'user', content: [{ type: 'image', source: { type: 'url', url: 'https://exemple.test/a.jpg' } }] }], /base64/)
  })
  test('type MIME hors liste ou base64 invalide', () => {
    refuse([{ role: 'user', content: [img('QUJD', 'image/svg+xml')] }])
    refuse([{ role: 'user', content: [img('pas du base64 !')] }], /base64/)
  })
  test('image trop volumineuse ou volume cumulé excessif', () => {
    refuse([{ role: 'user', content: [img('A'.repeat(LIMITES.IMAGE_B64 + 4))] }], /volumineuse/)
    const gros = img('A'.repeat(LIMITES.IMAGE_B64))
    refuse([{ role: 'user', content: [gros, gros, gros] }], /total/)
  })
  test('texte trop long ou vide', () => {
    refuse([{ role: 'user', content: [txt('x'.repeat(LIMITES.TEXTE + 1))] }])
    refuse([{ role: 'user', content: [txt('   ')] }])
  })
  test('trop de blocs / d’images', () => {
    refuse([{ role: 'user', content: Array(LIMITES.BLOCS + 1).fill(txt()) }])
    refuse([{ role: 'user', content: Array(LIMITES.IMAGES + 1).fill(img()) }], /images/)
  })
  test('image dans un message « assistant »', () => refuse([{ role: 'assistant', content: [img()] }], /user/))
})

test('liste blanche : champs inattendus (cache_control, system, tools…) supprimés', () => {
  const sale = [{ role: 'user', extra: 1, content: [{ ...txt(), cache_control: { type: 'ephemeral' } }, { ...img(), cache_control: {} }], tools: [] }]
  assert.deepEqual(validerMessages(sale), valide.map((m) => ({ role: 'user', content: [txt(), img()] })) )
})
