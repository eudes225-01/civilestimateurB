// src/routes/fedapay.js
// Abonnement Premium via FedaPay :
//   POST /api/fedapay/init     (connecté) crée la transaction et renvoie l'URL de paiement
//   POST /api/fedapay/verify   (connecté) confirme un paiement au retour du navigateur
//   POST /api/fedapay/webhook  (FedaPay)  confirme un paiement même si l'utilisateur ferme l'onglet
// Le prix et la durée sont fixés côté serveur (env) ; un paiement n'est jamais cru sur parole :
// son statut est relu auprès de FedaPay avant d'activer l'abonnement.
import { Router } from 'express'
import crypto from 'node:crypto'
import { env } from '../config/env.js'
import { requireUser } from '../middleware/auth.js'
import { paiementLimiter } from '../middleware/rateLimit.js'
import { creerTransaction, fedapayConfigure, verifierSignature } from '../services/fedapay.js'
import { abonnementsConfigures, derniereEnAttente, enregistrerTransaction } from '../services/abonnements.js'
import { confirmerTransaction } from '../services/paiement.js'

export const fedapayRouter = Router()

function exigerConfig(_req, res, next) {
  if (!fedapayConfigure()) {
    return res.status(501).json({
      error: 'fedapay_non_configure',
      aide: 'Renseignez FEDAPAY_SECRET_KEY (et FEDAPAY_ENV si besoin) dans les variables d’environnement du serveur.',
    })
  }
  if (!abonnementsConfigures()) {
    return res.status(503).json({
      error: 'abonnements_non_configures',
      aide: 'Renseignez SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY (clé service_role) pour enregistrer les abonnements.',
    })
  }
  next()
}

/** URL de retour après paiement : variable d'env, sinon origine (autorisée par CORS) du site appelant. */
function urlRetour(req) {
  const base = env.FEDAPAY_CALLBACK || req.headers.origin || env.ALLOWED_ORIGINS.find((o) => o.startsWith('https://')) || ''
  if (!base) return undefined
  return `${base.replace(/\/+$/, '')}/?paiement=retour`
}

// ── Création d'une transaction d'abonnement ─────────────────────────────────────
fedapayRouter.post('/fedapay/init', exigerConfig, paiementLimiter, requireUser, async (req, res) => {
  try {
    const montant = env.FEDAPAY_MONTANT // jamais lu dans le corps de la requête
    const [prenom, ...reste] = (req.user.nom || '').trim().split(/\s+/).filter(Boolean)
    const tx = await creerTransaction({
      montant,
      description: `Abonnement Premium CivilEstimateur (${env.FEDAPAY_DUREE_JOURS} jours)`,
      callbackUrl: urlRetour(req),
      reference: `ce-${crypto.randomUUID()}`,
      client: { email: req.user.email, prenom, nom: reste.join(' ') || undefined },
      metadata: { user_id: req.user.id },
    })
    await enregistrerTransaction({ userId: req.user.id, txId: tx.id, montant })
    res.json({ url: tx.url, id: tx.id, montant, devise: 'XOF' })
  } catch (e) {
    console.error('[fedapay/init]', e.message)
    res.status(502).json({ error: 'fedapay_init', detail: String(e.message) })
  }
})

// ── Confirmation au retour du navigateur ────────────────────────────────────────
fedapayRouter.post('/fedapay/verify', exigerConfig, paiementLimiter, requireUser, async (req, res) => {
  try {
    const id = req.body?.id ? String(req.body.id) : await derniereEnAttente(req.user.id)
    if (!id) return res.json({ statut: 'aucune_transaction', actif: false })
    const r = await confirmerTransaction(id, { userId: req.user.id })
    if (r.statut === 'interdit') return res.status(403).json({ error: 'transaction_interdite' })
    res.json({ ...r, id })
  } catch (e) {
    console.error('[fedapay/verify]', e.message)
    res.status(502).json({ error: 'fedapay_verify', detail: String(e.message) })
  }
})

// ── Webhook FedaPay ─────────────────────────────────────────────────────────────
// À déclarer dans FedaPay → Webhooks : https://<backend>/api/fedapay/webhook
// (événements transaction.approved au minimum). Le corps brut est conservé par app.js
// (req.rawBody) : la signature se calcule sur les octets exacts reçus, pas sur le JSON re-sérialisé.
fedapayRouter.post('/fedapay/webhook', async (req, res) => {
  if (!fedapayConfigure() || !abonnementsConfigures()) return res.status(503).json({ error: 'non_configure' })

  if (env.FEDAPAY_WEBHOOK_SECRET) {
    const ok = verifierSignature(req.rawBody, req.get('x-fedapay-signature'), env.FEDAPAY_WEBHOOK_SECRET)
    if (!ok) return res.status(401).json({ error: 'signature_invalide' })
  }

  const evt = req.body || {}
  const nom = String(evt.name || evt.event || '')
  const txId = evt.entity?.id ?? evt.data?.id
  if (!nom.startsWith('transaction.') || !txId) return res.sendStatus(200) // événement sans intérêt ici

  try {
    const r = await confirmerTransaction(txId) // statut relu chez FedaPay
    console.log(`[fedapay/webhook] ${nom} tx=${txId} → ${r.statut}${r.actif ? ' (abonnement actif)' : ''}`)
    res.json({ ok: true, statut: r.statut })
  } catch (e) {
    console.error('[fedapay/webhook]', e.message)
    res.status(500).json({ error: 'webhook_echec' }) // FedaPay réessaiera
  }
})
