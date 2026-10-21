// src/services/validerMessages.js
// Validation stricte du champ `messages` relayé à l'API Anthropic (/api/analyse-plan). Chaque requête valide
// est facturée : on n'accepte que la forme réellement émise par le frontend (images JPEG/PNG/WebP en base64
// + texte) et on RECONSTRUIT l'objet envoyé (liste blanche) pour qu'aucun champ inattendu — outils, system,
// cache_control, document, URL distante… — ne traverse le proxy.
export const LIMITES = Object.freeze({
  MESSAGES: 4,            // le frontend n'en envoie qu'un ; marge pour de futurs échanges courts
  BLOCS: 6,               // blocs (image/texte) par message
  IMAGES: 4,              // images par message
  TEXTE: 20_000,          // caractères par bloc texte
  IMAGE_B64: 10_000_000,  // caractères base64 par image (~7,5 Mo)
  TOTAL_B64: 20_000_000,  // base64 cumulé sur toute la requête
})

const MEDIA = new Set(['image/jpeg', 'image/png', 'image/webp'])
const B64 = /^[A-Za-z0-9+/]+={0,2}$/

export class MessagesInvalides extends Error {}
const refus = (m) => { throw new MessagesInvalides(m) }

/** @returns {Array<{role:string, content:Array}>} copie nettoyée ; lève MessagesInvalides sinon. */
export function validerMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) refus('messages : tableau non vide requis')
  if (messages.length > LIMITES.MESSAGES) refus(`messages : ${LIMITES.MESSAGES} au maximum`)
  let totalB64 = 0

  return messages.map((m, i) => {
    if (!m || typeof m !== 'object' || Array.isArray(m)) refus(`messages[${i}] : objet attendu`)
    if (m.role !== 'user' && m.role !== 'assistant') refus(`messages[${i}].role : « user » ou « assistant »`)
    // Un message du modèle (assistant) ne peut être que du texte ; les images viennent de l'utilisateur.
    const blocs = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content
    if (!Array.isArray(blocs) || blocs.length === 0) refus(`messages[${i}].content : texte ou liste de blocs requis`)
    if (blocs.length > LIMITES.BLOCS) refus(`messages[${i}].content : ${LIMITES.BLOCS} blocs au maximum`)
    let images = 0

    const content = blocs.map((b, j) => {
      const ou = `messages[${i}].content[${j}]`
      if (!b || typeof b !== 'object') refus(`${ou} : objet attendu`)
      if (b.type === 'text') {
        if (typeof b.text !== 'string' || !b.text.trim()) refus(`${ou}.text : chaîne non vide requise`)
        if (b.text.length > LIMITES.TEXTE) refus(`${ou}.text : ${LIMITES.TEXTE} caractères au maximum`)
        return { type: 'text', text: b.text }
      }
      if (b.type === 'image') {
        if (m.role !== 'user') refus(`${ou} : image réservée au rôle « user »`)
        if (++images > LIMITES.IMAGES) refus(`messages[${i}] : ${LIMITES.IMAGES} images au maximum`)
        const s = b.source
        if (!s || s.type !== 'base64' || !MEDIA.has(s.media_type)) refus(`${ou}.source : base64 jpeg/png/webp requis`)
        if (typeof s.data !== 'string' || s.data.length === 0 || s.data.length > LIMITES.IMAGE_B64) refus(`${ou}.source.data : image absente ou trop volumineuse`)
        if (!B64.test(s.data)) refus(`${ou}.source.data : base64 invalide`)
        totalB64 += s.data.length
        if (totalB64 > LIMITES.TOTAL_B64) refus('messages : volume d’images total trop élevé')
        return { type: 'image', source: { type: 'base64', media_type: s.media_type, data: s.data } }
      }
      return refus(`${ou}.type : « text » ou « image » uniquement`)
    })
    return { role: m.role, content }
  })
}
