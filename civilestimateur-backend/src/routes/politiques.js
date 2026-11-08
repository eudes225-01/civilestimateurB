// src/routes/politiques.js
//   GET  /api/politiques             texte des politiques d'utilisation (cohérence frontend / PDF)
//   POST /api/politiques/acceptation (connecté) enregistre la preuve d'acceptation des conditions (accueil)
import { Router } from 'express'
import { requireUser } from '../middleware/auth.js'
import { emailLimiter } from '../middleware/rateLimit.js'
import { aAccepteConditions, enregistrerAcceptation } from '../services/preuves.js'
import { DATE, SECTIONS, VERSION } from '../services/politiquesTexte.js'
import { supabaseServeurConfigure } from '../services/supabase.js'

export const politiquesRouter = Router()

politiquesRouter.get('/politiques', (_req, res) => {
  res.json({ version: VERSION, date: DATE, sections: SECTIONS })
})

// Vérifie si la version en vigueur a déjà été acceptée à l'entrée de l'application.
politiquesRouter.get('/politiques/acceptation', requireUser, async (req, res) => {
  if (!supabaseServeurConfigure()) return res.json({ acceptee: false, version: VERSION, enregistre: false })
  try {
    const acceptee = await aAccepteConditions(req.user.id, 'accueil')
    res.json({ acceptee, version: VERSION, enregistre: true })
  } catch (e) {
    console.error('[politiques/acceptation:lecture]', e.message)
    res.status(502).json({ error: 'acceptation_lecture_echec' })
  }
})

// Le serveur enregistre SA version du texte (celle qui fait foi) et note celle affichée par l'interface.
politiquesRouter.post('/politiques/acceptation', emailLimiter, requireUser, async (req, res) => {
  if (!supabaseServeurConfigure()) return res.json({ enregistre: false, raison: 'non_configure' })
  try {
    await enregistrerAcceptation({ userId: req.user.id, email: req.user.email, nom: req.user.nom, contexte: 'accueil', versionClient: req.body?.version })
    res.json({ enregistre: true, version: VERSION })
  } catch (e) {
    console.error('[politiques/acceptation]', e.message)
    res.status(502).json({ error: 'acceptation_echec' })
  }
})
