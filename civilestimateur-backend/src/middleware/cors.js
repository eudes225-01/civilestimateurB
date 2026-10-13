// src/middleware/cors.js
// Limite les origines autorisées à consommer l'API : liste explicite
// (ALLOWED_ORIGINS) + prévisualisations Vercel du projet.
import cors from 'cors'
import { env } from '../config/env.js'

export const corsMiddleware = cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true) // requêtes serveur-à-serveur, curl, health checks
    if (env.ALLOWED_ORIGINS.includes(origin)) return cb(null, true)
    if (env.VERCEL_PREVIEW_PATTERN.test(origin)) return cb(null, true)
    cb(new Error('Origine non autorisée'))
  },
})
