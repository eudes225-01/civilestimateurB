// src/routes/analysePlan.js
// Proxy "calcul automatique avancé" (analyse de plan, optionnel). Relaie vers
// l'API Anthropic SANS exposer la clé au frontend. Présenté côté utilisateur
// comme "calcul automatique" (pas "IA") pour ne pas dérouter les clients.
//
// Sécurité : cette route déclenche un appel facturé à l'API Anthropic à
// chaque requête — elle est protégée par un rate-limit dédié
// (analysePlanLimiter) en plus du rate-limit global, ce qui n'existait pas
// avant la refonte.
import { Router } from 'express'
import { env } from '../config/env.js'
import { requirePremium } from '../middleware/access.js'
import { analysePlanLimiter } from '../middleware/rateLimit.js'

export const analysePlanRouter = Router()

analysePlanRouter.post('/analyse-plan', analysePlanLimiter, requirePremium, async (req, res) => {
  try {
    if (!env.ANTHROPIC_API_KEY) {
      return res.status(501).json({ error: 'analyse_non_configuree' })
    }
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: env.ANTHROPIC_MODEL,
        max_tokens: env.ANTHROPIC_MAX_TOKENS,
        messages: req.body.messages || [],
      }),
    })
    const data = await r.json()
    res.status(r.status).json(data)
  } catch (e) {
    res.status(500).json({ error: 'proxy', detail: String(e.message) })
  }
})
