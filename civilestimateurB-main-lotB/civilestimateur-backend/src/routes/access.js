// src/routes/access.js
import { Router } from 'express'
import { accessState } from '../middleware/access.js'

export const accessRouter = Router()

// État de l'accès (le bandeau promo du frontend l'interroge).
accessRouter.get('/access', (_req, res) => res.json(accessState()))
