// src/routes/fondations.js
import { Router } from 'express'
import { FONDATIONS, recommanderFondationProjet } from '../engine.js'

export const fondationsRouter = Router()

// Fondations par zone / ville (données brutes du Lot A).
fondationsRouter.get('/fondations', (_req, res) => res.json(FONDATIONS))

fondationsRouter.get('/fondations/:ville', (req, res) => {
  const { ville } = req.params
  const zoneKey = FONDATIONS.villes[ville]
  if (!zoneKey) return res.status(404).json({ error: 'ville_inconnue', villes: Object.keys(FONDATIONS.villes) })
  res.json({ ville, zone: zoneKey, ...FONDATIONS.zones[zoneKey], avertissement: FONDATIONS.avertissement })
})

// Nouveau (Lot A, août 2026) : recommandation géotechnique complète —
// zone → contrainte admissible → type de fondation → profondeur/débord
// suggérés. Purement informatif : ne modifie jamais la saisie de
// l'utilisateur (politique produit « aucune décision automatique »).
fondationsRouter.get('/fondations/:ville/recommandation', (req, res) => {
  const { ville } = req.params
  const systeme = req.query.systeme || 'murs'
  const contrainteOverride = req.query.contrainte !== undefined ? Number(req.query.contrainte) : undefined
  const nbNiveaux = req.query.niveaux !== undefined ? Number(req.query.niveaux) : 1

  if (!FONDATIONS.villes[ville]) {
    return res.status(404).json({ error: 'ville_inconnue', villes: Object.keys(FONDATIONS.villes) })
  }
  const reco = recommanderFondationProjet({ ville, systeme, contrainteOverride, nbNiveaux })
  res.json(reco)
})
