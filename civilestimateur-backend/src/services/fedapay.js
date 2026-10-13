// src/services/fedapay.js
// Client minimal de l'API REST FedaPay (aucune dépendance : fetch natif, Node ≥ 18).
// Doc : https://docs.fedapay.com — transactions, jeton de paiement, webhooks.
import crypto from 'node:crypto'
import { env } from '../config/env.js'

const BASES = {
  sandbox: 'https://sandbox-api.fedapay.com/v1',
  live: 'https://api.fedapay.com/v1',
}

/** Statuts FedaPay qui valent « argent reçu ». */
export const STATUTS_PAYES = ['approved', 'transferred']
export const estPaye = (statut) => STATUTS_PAYES.includes(String(statut || '').toLowerCase())

export const fedapayConfigure = () => !!env.FEDAPAY_SECRET_KEY

async function appel(method, chemin, corps) {
  const r = await fetch(`${BASES[env.FEDAPAY_ENV] || BASES.live}${chemin}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.FEDAPAY_SECRET_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: corps ? JSON.stringify(corps) : undefined,
  })
  const texte = await r.text()
  let data = null
  try { data = texte ? JSON.parse(texte) : null } catch { /* réponse non JSON */ }
  if (!r.ok) {
    const detail = data?.message || data?.error || texte.slice(0, 200) || `HTTP ${r.status}`
    throw Object.assign(new Error(`FedaPay ${r.status} : ${detail}`), { status: r.status, fedapay: data })
  }
  return data
}

/** L'API enveloppe l'objet : { "v1/transaction": { … } }. */
const deballer = (data) => data?.['v1/transaction'] || data?.transaction || data

/**
 * Crée une transaction puis son jeton de paiement.
 * @returns {{ id: string, url: string, token: string }}
 */
export async function creerTransaction({ montant, description, callbackUrl, reference, client, metadata }) {
  const customer = {}
  if (client?.email) customer.email = client.email
  if (client?.prenom) customer.firstname = client.prenom
  if (client?.nom) customer.lastname = client.nom

  const tx = deballer(await appel('POST', '/transactions', {
    description,
    amount: Math.round(montant),
    currency: { iso: 'XOF' },
    callback_url: callbackUrl,
    merchant_reference: reference,
    custom_metadata: metadata,
    ...(Object.keys(customer).length ? { customer } : {}),
  }))
  if (!tx?.id) throw new Error('FedaPay : réponse sans identifiant de transaction')

  const jeton = await appel('POST', `/transactions/${encodeURIComponent(tx.id)}/token`)
  if (!jeton?.url) throw new Error('FedaPay : réponse sans URL de paiement')
  return { id: String(tx.id), url: jeton.url, token: jeton.token }
}

/** Relit une transaction (source de vérité du statut de paiement). */
export async function lireTransaction(id) {
  const tx = deballer(await appel('GET', `/transactions/${encodeURIComponent(id)}`))
  if (!tx?.id) throw new Error('FedaPay : transaction introuvable')
  return tx
}

/**
 * Vérifie l'en-tête `X-FEDAPAY-SIGNATURE` (« t=<timestamp>,s=<hmac sha256 hex> »).
 * Signature calculée sur `${t}.${corps brut}` avec le secret du webhook.
 */
export function verifierSignature(corpsBrut, entete, secret) {
  if (!corpsBrut || !entete || !secret) return false
  const morceaux = Object.fromEntries(
    String(entete).split(',').map((p) => {
      const i = p.indexOf('=')
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()]
    }),
  )
  const { t, s } = morceaux
  if (!t || !s) return false
  const attendu = crypto.createHmac('sha256', secret).update(`${t}.${corpsBrut.toString('utf8')}`).digest('hex')
  const a = Buffer.from(attendu)
  const b = Buffer.from(s)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
