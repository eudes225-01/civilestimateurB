// src/routes/pdf.js
//   POST /api/pdf/devis — génère le PDF du devis (HTML/CSS → Chromium) à partir du modèle de document
//   calculé par le frontend (postes, sous-détail, métrés, personnalisation). Renvoie application/pdf.
//
// En cas d'échec (Chromium absent, mémoire, file pleine) la route répond 5xx avec un code JSON :
// le frontend retombe alors sur son export local jsPDF, l'utilisateur n'est jamais bloqué.
import { Router } from 'express'
import { requirePremium } from '../middleware/access.js'
import { requireAuth } from '../middleware/auth.js'
import { pdfLimiter } from '../middleware/rateLimit.js'
import { ModeleInvalide, normaliserModele } from '../services/pdf/modele.js'
import { genererDevisPdf, ServeurOccupe } from '../services/pdf/rendu.js'

export const pdfRouter = Router()

// Réservé aux abonnés : `requireAuth` identifie l'utilisateur, `requirePremium` exige un abonnement actif (402 sinon).
pdfRouter.post('/pdf/devis', pdfLimiter, requireAuth, requirePremium, async (req, res) => {
  let modele
  try {
    modele = normaliserModele(req.body)
  } catch (e) {
    if (e instanceof ModeleInvalide) return res.status(400).json({ error: e.message })
    throw e
  }
  try {
    const pdf = await genererDevisPdf(modele)
    const nom = `BPU_DQE_${(modele.proj.titre || 'projet').replace(/[^\w-]+/g, '_').slice(0, 60)}.pdf`
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': String(pdf.length),
      'Content-Disposition': `attachment; filename="${nom}"`,
      'Cache-Control': 'no-store',
    })
    res.end(pdf)
  } catch (e) {
    if (e instanceof ServeurOccupe) return res.status(503).json({ error: 'serveur_occupe' })
    console.error('[pdf/devis]', e)
    res.status(500).json({ error: 'pdf_indisponible', detail: String(e.message).slice(0, 200) })
  }
})
