// src/routes/access.js
import { Router } from 'express'
import { etatUtilisateur } from '../middleware/access.js'
import { optionalAuth } from '../middleware/auth.js'

export const accessRouter = Router()

// État de l'accès (bandeau d'abonnement du frontend). Avec un jeton de session valide,
// la réponse indique aussi si l'utilisateur a un abonnement actif.
accessRouter.get('/access', optionalAuth, async (req, res) => {
  res.json(await etatUtilisateur(req.user))
})
