// src/routes/prix.js
import { Router } from 'express'
import { PRIX, PRIX_VERSION, PRIX_DATE } from '../engine.js'
import { chargerPrix } from '../prixStore.js'

export const prixRouter = Router()

// Base de prix : data/prix.json (modifiable sans code) par-dessus la base RPR du moteur.
prixRouter.get('/prix', (_req, res) => {
  const { version, date, postes, source, avertissements } = chargerPrix({ base: PRIX, version: PRIX_VERSION, date: PRIX_DATE })
  res.json({ version, date, source, avertissements, postes })
})
