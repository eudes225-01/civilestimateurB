// src/routes/fedapay.js
// Intégration FedaPay (abonnement Premium) — non implémentée à ce jour.
// TODO(paiement) : voir src/middleware/access.js pour le plan de mise en
// œuvre complet (webhook signé + persistance + JWT).
import { Router } from 'express'
import { env } from '../config/env.js'

export const fedapayRouter = Router()

// Init d'une transaction d'abonnement Premium.
// Pour activer : npm i fedapay, et renseigner FEDAPAY_SECRET_KEY.
fedapayRouter.post('/fedapay/init', async (req, res) => {
  try {
    const { montant = 5000 } = req.body || {}
    if (!env.FEDAPAY_SECRET_KEY) {
      return res.status(501).json({
        error: 'fedapay_non_configure',
        aide: 'Renseignez FEDAPAY_SECRET_KEY puis implémentez le bloc FedaPay dans src/routes/fedapay.js.',
      })
    }
    // const { FedaPay, Transaction } = await import('fedapay')
    // FedaPay.setApiKey(env.FEDAPAY_SECRET_KEY)
    // FedaPay.setEnvironment(env.FEDAPAY_ENV)
    // const tx = await Transaction.create({ ... })
    // const token = await tx.generateToken()
    // return res.json({ url: token.url, id: tx.id })
    return res.json({ stub: true, montant, message: 'Bloc FedaPay à activer (clé requise).' })
  } catch (e) {
    res.status(500).json({ error: 'fedapay_init', detail: String(e.message) })
  }
})

// Webhook de confirmation de paiement.
// TODO(paiement) : 1) vérifier la signature (header 'x-fedapay-signature',
// FEDAPAY_WEBHOOK_SECRET) ; 2) si 'transaction.approved', activer
// l'abonnement en base. Le corps est déjà parsé par le middleware JSON
// global (app.js) — pas besoin de express.json() ici.
fedapayRouter.post('/fedapay/webhook', (_req, res) => {
  res.sendStatus(200)
})
