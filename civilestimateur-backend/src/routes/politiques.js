// src/routes/politiques.js
import { Router } from 'express'

export const politiquesRouter = Router()

// Politiques d'utilisation (servies aussi en API pour cohérence frontend/PDF).
politiquesRouter.get('/politiques', (_req, res) => {
  res.json({
    version: '1.0',
    sections: [
      { t: 'Objet & valeur des résultats', c: "Outil d'aide au métré. Quantités et prix indicatifs (Guide du métré Bénin + RPR 26.2). Les données de fondation sont saisies par l'utilisateur ou lues sur le plan de fondation. Ne remplacent ni le CCTP/CPT, ni les prix réels, ni une étude géotechnique. L'utilisateur reste responsable de son offre." },
      { t: 'Calcul automatique', c: "Calculs déterministes appliquant des formules publiques et des coefficients modifiables. Aucune décision automatique à la place de l'utilisateur." },
      { t: 'Abonnement', c: "Pas de formule gratuite : à partir de l'étape DQE, l'accès est réservé aux abonnés (abonnement FedaPay). Sans abonnement actif, le DQE et l'export PDF restent verrouillés." },
      { t: 'Paiements', c: 'Traités par FedaPay (Mobile Money/carte). Aucune donnée bancaire stockée.' },
      { t: 'Données & confidentialité', c: 'Saisies utilisées uniquement pour produire le métré. Aucune revente de données de projet.' },
      { t: 'Limitation de responsabilité', c: "Éditeur non responsable d'un chiffrage erroné, prix périmé ou fondation inadaptée. Cadre : marchés publics (DNCMP/ARMP), fiscalité (DGI)." },
      { t: 'Propriété & usage', c: "Documents générés appartiennent à l'utilisateur. Extraction massive ou revente de la base interdite." },
    ],
  })
})
