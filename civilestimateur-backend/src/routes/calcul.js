// src/routes/calcul.js
import { Router } from 'express'
import { metrerProjet, buildDQE, TVA, PRIX } from '../engine.js'
import { requireAuth } from '../middleware/auth.js'

export const calculRouter = Router()

// Calcul automatique : métré + DQE (déterministe). Ouvert à tout compte connecté : le DQE est gratuit
// (seuls les dépôts de plans et l'export PDF sont Premium).
// body: { levels: [...], params: {...}, prix: {code: pu} (optionnel), K: 1.30 }
calculRouter.post('/calcul', requireAuth, (req, res) => {
  try {
    const { levels = [], params = {}, prix, K = 1.30 } = req.body || {}
    const { totaux, parNiveau, alertes, couverture } = metrerProjet(levels, params)
    const prixMap = prix || Object.fromEntries(PRIX.map((p) => [p.code, p.sac || p.bi]))
    const dqe = buildDQE(totaux, prixMap, +K || 1.30)
    res.json({ totaux, parNiveau, alertes, couverture, dqe, tva: TVA })
  } catch (e) {
    res.status(400).json({ error: 'calcul_invalide', detail: String(e.message) })
  }
})
