// src/services/credits.js
// Persistance des crédits CST dans Supabase (tables credits_soldes, achats_credits, credits_mouvements) via
// l'API REST PostgREST et la clé service_role : seul le backend écrit, jamais le navigateur.
// Les opérations sensibles (créditer un achat, réserver, régler) sont des FONCTIONS POSTGRES atomiques
// (supabase/schema.sql) : le solde ne peut ni devenir négatif ni être crédité deux fois.
import { env } from '../config/env.js'
import { rest as restTable, rpc } from './supabase.js'

export const creditsConfigures = () => !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY)

const achats = (method, requete, corps, prefer) => restTable('achats_credits', method, requete, corps, prefer)
const q = encodeURIComponent

/** Solde (CST) de l'utilisateur ; 0 s'il n'a jamais acheté. */
export async function soldeUtilisateur(userId) {
  const l = await restTable('credits_soldes', 'GET', `?user_id=eq.${q(userId)}&select=solde&limit=1`)
  return Number(l?.[0]?.solde) || 0
}

export async function trouverAchat(txId) {
  const l = await achats('GET', `?fedapay_transaction_id=eq.${q(txId)}&select=*&limit=1`)
  return l?.[0] || null
}

/** Dernier achat confirmé de l'utilisateur, ou null (sert à renvoyer une confirmation quand aucune preuve n'existe). */
export async function dernierAchat(userId) {
  const l = await achats('GET', `?user_id=eq.${q(userId)}&statut=eq.paye&select=fedapay_transaction_id,montant,credits,paye_le&order=paye_le.desc&limit=1`)
  return l?.[0] || null
}

/** Dernière transaction non encore confirmée de l'utilisateur (retour de paiement sans identifiant). */
export async function derniereEnAttente(userId) {
  const l = await achats('GET', `?user_id=eq.${q(userId)}&statut=eq.inactif&fedapay_transaction_id=not.is.null&select=fedapay_transaction_id&order=cree_le.desc&limit=1`)
  return l?.[0]?.fedapay_transaction_id || null
}

/** Enregistre un achat en attente (statut « inactif ») ; sans effet si la transaction existe déjà. */
export async function enregistrerAchat({ userId, txId, montant, credits }) {
  await achats('POST', '?on_conflict=fedapay_transaction_id', { user_id: userId, statut: 'inactif', fedapay_transaction_id: String(txId), montant, credits }, 'resolution=ignore-duplicates,return=minimal')
}

/**
 * Crédite le solde pour une transaction payée.
 * Tout se fait dans UNE fonction Postgres, `crediter_achat` : webhook + retour navigateur d'une même
 * transaction ne créditent qu'une fois, et deux achats simultanés s'additionnent.
 * @returns {{ solde: number, credits: number, nouveau: boolean }}  credits : crédits ajoutés par CET appel (0 si déjà crédité)
 */
export async function crediterAchat({ txId, userId, montant, credits }) {
  if (!(await trouverAchat(txId))) await enregistrerAchat({ userId, txId, montant, credits })
  const l = await rpc('crediter_achat', { p_tx_id: String(txId) })
  const r = l?.[0]
  if (!r) throw new Error('crediter_achat : réponse vide')
  return { solde: Number(r.solde_apres), credits: Number(r.credits_ajoutes), nouveau: !!r.est_nouveau }
}

/** Bloque `montant` CST avant un appel. @returns {{ ok: boolean, solde: number }} (ok=false : solde insuffisant, rien n'est débité) */
export async function reserverCredits(userId, montant, ref) {
  const l = await rpc('reserver_credits', { p_user_id: userId, p_montant: montant, p_ref: ref })
  const r = l?.[0]
  if (!r) throw new Error('reserver_credits : réponse vide')
  return { ok: !!r.ok, solde: Number(r.solde_apres) }
}

/**
 * Règle un appel : le coût réel remplace la réserve (l'excédent est restitué ; un supplément éventuel est
 * prélevé dans la limite du solde, jamais en dessous de zéro). `cout` = 0 : appel échoué, réserve rendue.
 * @returns {{ facture: number, solde: number }}
 */
export async function reglerCredits({ userId, reserve, cout, ref, tokensEntree = 0, tokensSortie = 0 }) {
  const l = await rpc('regler_credits', { p_user_id: userId, p_reserve: reserve, p_cout: cout, p_ref: ref, p_tokens_entree: tokensEntree, p_tokens_sortie: tokensSortie })
  const r = l?.[0]
  if (!r) throw new Error('regler_credits : réponse vide')
  return { facture: Number(r.facture), solde: Number(r.solde_apres) }
}

// ── Notification d'échec de paiement (colonne echec_notifie_le : un seul e-mail même si webhook/navigateur se répètent) ──

/** Réserve la notification d'échec d'une transaction non payée. */
export async function reserverEchec(txId) {
  const maj = await achats('PATCH', `?fedapay_transaction_id=eq.${q(txId)}&statut=neq.paye&echec_notifie_le=is.null`, { echec_notifie_le: new Date().toISOString() }, 'return=representation')
  return !!maj?.length
}
export async function libererEchec(txId) {
  await achats('PATCH', `?fedapay_transaction_id=eq.${q(txId)}`, { echec_notifie_le: null })
}
