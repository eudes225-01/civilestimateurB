// src/routes/prix.js
import { Router } from 'express'
import { PRIX, PRIX_VERSION, PRIX_DATE } from '../engine.js'

export const prixRouter = Router()

// Base de prix RPR + dosages.
prixRouter.get('/prix', (_req, res) => res.json({ version: PRIX_VERSION, date: PRIX_DATE, postes: PRIX }))
