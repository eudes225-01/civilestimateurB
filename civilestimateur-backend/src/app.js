// src/app.js
// Assemblage de l'application Express — middlewares puis routes. Séparé de
// server.js pour permettre de tester `createApp()` sans ouvrir de port
// réseau (voir test/app.test.js).
import express from 'express'
import helmet from 'helmet'
import { corsMiddleware } from './middleware/cors.js'
import { apiLimiter } from './middleware/rateLimit.js'
import { healthRouter } from './routes/health.js'
import { accessRouter } from './routes/access.js'
import { prixRouter } from './routes/prix.js'
import { calculRouter } from './routes/calcul.js'
import { analysePlanRouter } from './routes/analysePlan.js'
import { fedapayRouter } from './routes/fedapay.js'
import { emailRouter } from './routes/email.js'
import { cronRouter } from './routes/cron.js'
import { politiquesRouter } from './routes/politiques.js'
import { pdfRouter } from './routes/pdf.js'

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1) // Render est derrière un proxy : sans cela, la limite de débit voit une seule IP pour tous
  app.use(helmet())
  app.use(corsMiddleware)
  app.use(express.json({
    limit: '25mb', // plans PDF/image en base64
    // Corps brut conservé pour le webhook FedaPay : sa signature porte sur les octets exacts reçus.
    verify: (req, _res, buf) => { if (req.originalUrl.startsWith('/api/fedapay/webhook')) req.rawBody = buf },
  }))
  app.use('/api', apiLimiter)

  app.use('/api', healthRouter)
  app.use('/api', accessRouter)
  app.use('/api', prixRouter)
  app.use('/api', calculRouter)
  app.use('/api', analysePlanRouter)
  app.use('/api', fedapayRouter)
  app.use('/api', emailRouter)
  app.use('/api', cronRouter)
  app.use('/api', politiquesRouter)
  app.use('/api', pdfRouter)

  // Gestionnaire d'erreur générique (ex. origine CORS refusée) — évite la
  // page HTML par défaut d'Express sur une API strictement JSON.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error(err)
    res.status(err.status || 500).json({ error: 'erreur_serveur', detail: err.message })
  })

  return app
}
