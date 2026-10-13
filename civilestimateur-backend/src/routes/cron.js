// src/routes/cron.js
//   POST /api/cron/echeances  — rappels d'expiration + mails d'expiration.
// Protégée par CRON_SECRET (en-tête « Authorization: Bearer <secret> »). À appeler une fois par jour
// (Render Cron Job, cron-job.org…). Alternative sans HTTP : `npm run echeances`.
import { Router } from 'express'
import crypto from 'node:crypto'
import { env } from '../config/env.js'
import { traiterEcheances } from '../services/notifications.js'

export const cronRouter = Router()

function secretValide(entete) {
  const m = /^Bearer\s+(.+)$/i.exec(entete || '')
  if (!m || !env.CRON_SECRET) return false
  const a = Buffer.from(m[1])
  const b = Buffer.from(env.CRON_SECRET)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

cronRouter.post('/cron/echeances', async (req, res) => {
  if (!env.CRON_SECRET) return res.status(503).json({ error: 'cron_non_configure' })
  if (!secretValide(req.get('authorization'))) return res.status(401).json({ error: 'non_autorise' })
  try {
    res.json(await traiterEcheances())
  } catch (e) {
    console.error('[cron/echeances]', e.message)
    res.status(500).json({ error: 'echeances_echec', detail: String(e.message) })
  }
})
