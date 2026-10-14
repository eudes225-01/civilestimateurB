// src/routes/confirmation.js
//   POST /api/abonnement/confirmation/renvoyer  (connecté) — renvoie par e-mail la confirmation d'abonnement
//   (PDF + conditions d'utilisation) à l'adresse du compte.
import { Router } from 'express'
import { requireUser } from '../middleware/auth.js'
import { renvoiLimiter } from '../middleware/rateLimit.js'
import { ConfirmationIndisponible, renvoyerConfirmation } from '../services/confirmations.js'

export const confirmationRouter = Router()

confirmationRouter.post('/abonnement/confirmation/renvoyer', renvoiLimiter, requireUser, async (req, res) => {
  try {
    res.json(await renvoyerConfirmation(req.user))
  } catch (e) {
    if (e instanceof ConfirmationIndisponible) return res.status(e.status).json({ error: e.code })
    console.error('[confirmation/renvoi]', e.message)
    res.status(502).json({ error: 'renvoi_echec' })
  }
})
