// src/routes/fedapay.js
// Achat de crédits CST via FedaPay :
//   POST /api/fedapay/init     (connecté) crée la transaction du forfait choisi et renvoie l'URL de paiement
//   POST /api/fedapay/verify   (connecté) confirme un paiement au retour du navigateur
//   POST /api/fedapay/webhook  (FedaPay)  confirme un paiement même si l'utilisateur ferme l'onglet
// Les forfaits (montants) et le nombre de CST obtenus sont fixés côté serveur (env) ; le client ne fait que
// choisir l'un des forfaits. Un paiement n'est jamais cru sur parole : son statut est relu auprès de FedaPay
// avant de créditer le solde.
import { Router } from 'express'
import crypto from 'node:crypto'
import { env } from '../config/env.js'
import { requireUser } from '../middleware/auth.js'
import { paiementLimiter } from '../middleware/rateLimit.js'
import { creerTransaction, fedapayConfigure, verifierSignature } from '../services/fedapay.js'
import { creditsConfigures, derniereEnAttente, enregistrerAchat } from '../services/credits.js'
import { confirmerTransaction } from '../services/paiement.js'
import { enregistrerAcceptation } from '../services/preuves.js'
import { creditsPourMontant, forfaitValide } from '../services/tarifs.js'

export const fedapayRouter = Router()

// Version gratuite : aucune transaction ne peut être créée.
function exigerPayant(_req, res, next) {
  if (env.APP_GRATUITE) return res.status(404).json({ error: 'application_gratuite' })
  next()
}

function exigerConfig(_req, res, next) {
  if (!fedapayConfigure()) {
    return res.status(501).json({
      error: 'fedapay_non_configure',
      aide: 'Renseignez FEDAPAY_SECRET_KEY (et FEDAPAY_ENV si besoin) dans les variables d’environnement du serveur.',
    })
  }
  if (!creditsConfigures()) {
    return res.status(503).json({
      error: 'credits_non_configures',
      aide: 'Renseignez SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY (clé service_role) pour enregistrer les crédits.',
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

// ── Création d'une transaction d'achat de crédits ───────────────────────────────
fedapayRouter.post('/fedapay/init', exigerPayant, exigerConfig, paiementLimiter, requireUser, async (req, res) => {
  // Pas de paiement sans acceptation explicite des conditions d'utilisation : la preuve est écrite AVANT la transaction.
  if (req.body?.acceptation !== true) return res.status(400).json({ error: 'conditions_a_accepter' })
  // Le client désigne un forfait ; seul un montant de la liste serveur est accepté (jamais un prix libre).
  const montant = Number(req.body?.forfait)
  if (!forfaitValide(montant)) return res.status(400).json({ error: 'forfait_invalide' })
  const credits = creditsPourMontant(montant)
  try {
    await enregistrerAcceptation({ userId: req.user.id, email: req.user.email, nom: req.user.nom, contexte: 'paiement', versionClient: req.body?.version })
    const [prenom, ...reste] = (req.user.nom || '').trim().split(/\s+/).filter(Boolean)
    const tx = await creerTransaction({
      montant,
      description: `Crédits CST CivilEstimateur (${credits} CST)`,
      callbackUrl: urlRetour(req),
      reference: `ce-${crypto.randomUUID()}`,
      client: { email: req.user.email, prenom, nom: reste.join(' ') || undefined },
      metadata: { user_id: req.user.id, credits },
    })
    await enregistrerAchat({ userId: req.user.id, txId: tx.id, montant, credits })
    res.json({ url: tx.url, id: tx.id, montant, credits, devise: 'XOF' })
  } catch (e) {
    console.error('[fedapay/init]', e.message)
    res.status(502).json({ error: 'fedapay_init', detail: String(e.message) })
  }
})

// ── Confirmation au retour du navigateur ────────────────────────────────────────
fedapayRouter.post('/fedapay/verify', exigerConfig, paiementLimiter, requireUser, async (req, res) => {
  try {
    const id = req.body?.id ? String(req.body.id) : await derniereEnAttente(req.user.id)
    if (!id) return res.json({ statut: 'aucune_transaction', credite: false })
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
  if (!fedapayConfigure() || !creditsConfigures()) return res.status(503).json({ error: 'non_configure' })

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
    console.log(`[fedapay/webhook] ${nom} tx=${txId} → ${r.statut}${r.credite ? ' (crédits ajoutés)' : ''}`)
    res.json({ ok: true, statut: r.statut })
  } catch (e) {
    console.error('[fedapay/webhook]', e.message)
    res.status(500).json({ error: 'webhook_echec' }) // FedaPay réessaiera
  }
})
