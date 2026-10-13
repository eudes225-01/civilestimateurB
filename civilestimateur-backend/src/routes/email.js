// src/routes/email.js
//   POST /api/email/bienvenue  (connecté) — mail de bienvenue, envoyé une seule fois par compte.
// Le frontend l'appelle à chaque ouverture de session ; le serveur décide s'il faut réellement écrire.
import { Router } from 'express'
import { requireUser } from '../middleware/auth.js'
import { emailLimiter } from '../middleware/rateLimit.js'
import { emailConfigure } from '../services/email.js'
import { envoyerBienvenue } from '../services/notifications.js'
import { libererBienvenue, reserverBienvenue } from '../services/profils.js'
import { supabaseServeurConfigure } from '../services/supabase.js'

export const emailRouter = Router()

emailRouter.post('/email/bienvenue', emailLimiter, requireUser, async (req, res) => {
  if (!emailConfigure() || !supabaseServeurConfigure()) return res.json({ envoye: false, raison: 'non_configure' })
  if (!req.user.email) return res.json({ envoye: false, raison: 'pas_d_adresse' })
  try {
    if (!(await reserverBienvenue(req.user))) return res.json({ envoye: false, raison: 'deja_envoye' })
    try {
      await envoyerBienvenue(req.user)
    } catch (e) {
      await libererBienvenue(req.user.id).catch(() => {}) // le prochain login réessaiera
      throw e
    }
    res.json({ envoye: true })
  } catch (e) {
    console.error('[email/bienvenue]', e.message)
    res.status(502).json({ error: 'email_bienvenue', detail: String(e.message) })
  }
})
