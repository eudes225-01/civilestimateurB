// src/routes/politiques.js
import { Router } from 'express'
import { accessState } from '../middleware/access.js'

export const politiquesRouter = Router()

// Politiques d'utilisation (servies aussi en API pour cohérence frontend/PDF).
politiquesRouter.get('/politiques', (_req, res) => {
  const { finGratuit } = accessState()
  const fin = new Date(finGratuit)
  res.json({
    version: '1.0',
    sections: [
      { t: 'Objet & valeur des résultats', c: "Outil d'aide au métré. Quantités, prix et fondations indicatifs (Guide du métré Bénin + RPR 26.2 + Lot A Fondations). Ne remplacent ni le CCTP/CPT, ni les prix réels, ni une étude géotechnique. L'utilisateur reste responsable de son offre." },
      { t: 'Calcul automatique', c: "Calculs déterministes appliquant des formules publiques et des coefficients modifiables. Aucune décision automatique à la place de l'utilisateur." },
      { t: 'Période gratuite & abonnement', c: `Gratuit pour tous jusqu'au ${fin.toLocaleDateString('fr-FR')}. Ensuite, Premium via abonnement FedaPay.` },
      { t: 'Paiements', c: 'Traités par FedaPay (Mobile Money/carte). Aucune donnée bancaire stockée.' },
      { t: 'Données & confidentialité', c: 'Saisies utilisées uniquement pour produire le métré. Aucune revente de données de projet.' },
      { t: 'Limitation de responsabilité', c: "Éditeur non responsable d'un chiffrage erroné, prix périmé ou fondation inadaptée. Cadre : marchés publics (DNCMP/ARMP), fiscalité (DGI)." },
      { t: 'Propriété & usage', c: "Documents générés appartiennent à l'utilisateur. Extraction massive ou revente de la base interdite." },
    ],
  })
})
