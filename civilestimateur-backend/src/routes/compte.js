// src/routes/compte.js
//   DELETE /api/compte  (connecté) — supprime définitivement le compte de l'utilisateur et ses données
//   (profil, projets, abonnements). Le client doit confirmer explicitement dans le corps : { confirmation: 'SUPPRIMER' }.
import { Router } from 'express'
import { requireUser } from '../middleware/auth.js'
import { paiementLimiter } from '../middleware/rateLimit.js'
import { supabaseServeurConfigure, supprimerUtilisateur } from '../services/supabase.js'

export const compteRouter = Router()

compteRouter.delete('/compte', paiementLimiter, requireUser, async (req, res) => {
  if (req.body?.confirmation !== 'SUPPRIMER') return res.status(400).json({ error: 'confirmation_requise' })
  if (!supabaseServeurConfigure()) return res.status(503).json({ error: 'abonnements_non_configures' })
  try {
    await supprimerUtilisateur(req.user.id)
    res.json({ supprime: true })
  } catch (e) {
    console.error('[compte/suppression]', e.message)
    res.status(502).json({ error: 'suppression_echec', detail: String(e.message).slice(0, 200) })
  }
})
