// src/routes/calcul.js
import { Router } from 'express'
import { metrerProjet, buildDQE, TVA, PRIX } from '../engine.js'
import { requireAuth } from '../middleware/auth.js'

export const calculRouter = Router()

// Calcul automatique : métré + DQE (déterministe). Ouvert à tout compte connecté : le DQE est gratuit
// (seule la lecture automatique des plans consomme des crédits CST).
// body: { levels: [...], params: {...}, prix: {code: pu} (optionnel), K: 1.30, modeChiffrage?: 'compose'|'decompose' }
// Le mode de chiffrage vient de params.modeChiffrage (ou, à défaut, de body.modeChiffrage) ; défaut « compose ».
// Réponse : totaux, parNiveau, alertes, couverture, materiaux (liste de commande), dqe.
calculRouter.post('/calcul', requireAuth, (req, res) => {
  try {
    const { levels = [], params = {}, prix, K = 1.30, modeChiffrage } = req.body || {}
    const p = { ...params, ...(params.modeChiffrage === undefined && modeChiffrage ? { modeChiffrage } : {}) }
    const { totaux, parNiveau, alertes, couverture, materiaux } = metrerProjet(levels, p)
    const prixMap = prix || Object.fromEntries(PRIX.map((x) => [x.code, x.sac || x.bi]))
    // K est transmis tel quel : un K invalide ou hors bornes devient une alerte bloquante du DQE (plus de repli silencieux à 1,30).
    const dqe = buildDQE(totaux, prixMap, K === undefined || K === null || K === '' ? 1.30 : +K,
      { couverture, autoriserKHorsBornes: !!p.autoriserKHorsBornes })
    res.json({ totaux, parNiveau, alertes, couverture, materiaux, dqe, tva: TVA })
  } catch (e) {
    res.status(400).json({ error: 'calcul_invalide', detail: String(e.message) })
  }
})
