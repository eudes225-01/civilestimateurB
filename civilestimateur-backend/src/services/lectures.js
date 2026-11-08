// src/services/lectures.js
// Lecture de plans facturée en crédits CST, au nombre de tokens réellement traités.
//
// Pour CHAQUE appel au service d'analyse (Anthropic) :
//   1. (premier appel d'une lecture seulement) le solde doit atteindre CST_MINIMUM_LECTURE ;
//   2. une RÉSERVE (coût maximal plausible) est bloquée atomiquement : sans solde suffisant → 402, rien n'est appelé ;
//   3. l'appel est fait ; l'usage (tokens) renvoyé par l'API donne le coût réel ;
//   4. la réserve est réglée : l'excédent est restitué (appel échoué → tout est restitué).
// Un administrateur n'est pas débité. Le solde ne peut jamais devenir négatif.
import crypto from 'node:crypto'
import { env } from '../config/env.js'
import { estAdmin } from '../middleware/access.js'
import { reglerCredits, reserverCredits, soldeUtilisateur } from './credits.js'
import { coutTokens, reserveAppel } from './tarifs.js'

const refus = (solde, requis) => ({ status: 402, body: { error: 'credits_insuffisants', solde, requis, minimum: env.CST_MINIMUM_LECTURE } })

/**
 * @param {{ user: { id: string, email?: string, emailVerifie?: boolean }, messages: object[], debut?: boolean }} p
 *   debut : premier appel d'une lecture (le solde minimum de lecture est alors exigé).
 * @returns {Promise<{ status: number, body: object }>}  body : réponse de l'API d'analyse + `cst: { cout, solde }` (absent pour un administrateur)
 */
export async function lancerAnalyse({ user, messages, debut = false, lectureId = '' }) {
  // Administrateur et version gratuite (APP_GRATUITE) : jamais débités.
  const admin = estAdmin(user) || env.APP_GRATUITE
  const idValide = /^[0-9a-f-]{36}$/i.test(lectureId) ? lectureId : ''
  const ref = idValide ? `lecture/${idValide}/${crypto.randomUUID()}` : crypto.randomUUID()
  const reserve = admin ? 0 : reserveAppel()

  if (!admin) {
    try {
      if (debut) {
        const solde = await soldeUtilisateur(user.id)
        if (solde < env.CST_MINIMUM_LECTURE) return refus(solde, env.CST_MINIMUM_LECTURE)
      }
      const r = await reserverCredits(user.id, reserve, ref)
      if (!r.ok) return refus(r.solde, reserve)
    } catch (e) {
      console.error('[lecture/reservation]', e.message)
      return { status: 503, body: { error: 'credits_indisponibles' } }
    }
  }

  // Règle la réserve ; une panne ici est journalisée avec la référence (la réserve reste alors débitée, jamais plus).
  const regler = async (cout, usage) => {
    try {
      return await reglerCredits({ userId: user.id, reserve, cout, ref, tokensEntree: usage?.input_tokens || 0, tokensSortie: usage?.output_tokens || 0 })
    } catch (e) {
      console.error(`[lecture/reglement] ref=${ref} user=${user.id} reserve=${reserve} cout=${cout} :`, e.message)
      return null
    }
  }

  let reponse, data
  try {
    reponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: env.ANTHROPIC_MODEL, max_tokens: env.ANTHROPIC_MAX_TOKENS, messages }),
    })
    data = await reponse.json()
  } catch (e) {
    if (!admin) await regler(0)
    return { status: 500, body: { error: 'proxy', detail: String(e.message) } }
  }
  if (admin) return { status: reponse.status, body: data }

  let cout = 0
  if (reponse.ok) {
    const u = data?.usage
    if (u && Number.isFinite(u.input_tokens) && Number.isFinite(u.output_tokens)) cout = coutTokens({ entree: u.input_tokens, sortie: u.output_tokens })
    else { cout = reserve; console.error(`[lecture] réponse sans usage — réserve facturée (ref=${ref})`) }
  }
  const r = await regler(cout, reponse.ok ? data?.usage : null)
  return { status: reponse.status, body: r ? { ...data, cst: { cout: r.facture, solde: r.solde } } : data }
}
