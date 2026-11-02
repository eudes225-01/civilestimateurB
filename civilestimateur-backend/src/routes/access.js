// src/routes/access.js
import { Router } from 'express'
import { etatUtilisateur } from '../middleware/access.js'
import { optionalAuth } from '../middleware/auth.js'

export const accessRouter = Router()

// État de l'accès (crédits CST du frontend) : forfaits, solde minimum de lecture, tarif au token. Avec un jeton de
// session valide, la réponse indique aussi le solde de l'utilisateur.
accessRouter.get('/access', optionalAuth, async (req, res) => {
  res.json(await etatUtilisateur(req.user))
})
