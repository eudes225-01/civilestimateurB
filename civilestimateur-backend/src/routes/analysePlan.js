// src/routes/analysePlan.js
// Proxy "calcul automatique avancé" (analyse de plan, optionnel). Relaie vers
// l'API Anthropic SANS exposer la clé au frontend. Présenté côté utilisateur
// comme "calcul automatique" (pas "IA") pour ne pas dérouter les clients.
//
// Sécurité : l'appelant doit être connecté (requireAuth : jeton Supabase vérifié) ;
// chaque appel est facturé en crédits CST d'après les tokens réellement traités (services/lectures.js) ;
// un rate-limit dédié (analysePlanLimiter) s'ajoute au rate-limit global.
//
// Corps : { messages, debutLecture? } — debutLecture=true sur le PREMIER appel d'une lecture :
// le solde minimum de lecture (CST_MINIMUM_LECTURE) est alors exigé.
import { Router } from 'express'
import { env } from '../config/env.js'
import { exigerCredits, exigerUtilisateur } from '../middleware/access.js'
import { requireAuth } from '../middleware/auth.js'
import { analysePlanLimiter } from '../middleware/rateLimit.js'
import { lancerAnalyse } from '../services/lectures.js'
import { MessagesInvalides, validerMessages } from '../services/validerMessages.js'

export const analysePlanRouter = Router()

analysePlanRouter.post('/analyse-plan', analysePlanLimiter, requireAuth, exigerUtilisateur, exigerCredits, async (req, res) => {
  try {
    if (!env.ANTHROPIC_API_KEY) {
      return res.status(501).json({ error: 'analyse_non_configuree' })
    }
    // Validé AVANT tout appel facturé ; `messages` envoyé = copie nettoyée (liste blanche), jamais le corps brut.
    let messages
    try {
      messages = validerMessages(req.body?.messages)
    } catch (e) {
      if (e instanceof MessagesInvalides) return res.status(400).json({ error: 'messages_invalides', detail: e.message })
      throw e
    }
    const { status, body } = await lancerAnalyse({ user: req.user, messages, debut: req.body?.debutLecture === true })
    res.status(status).json(body)
  } catch (e) {
    res.status(500).json({ error: 'proxy', detail: String(e.message) })
  }
})
