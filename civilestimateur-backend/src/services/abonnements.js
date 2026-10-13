// src/services/abonnements.js
// Persistance des abonnements dans Supabase (table public.abonnements) via l'API REST
// PostgREST et la clé service_role : seul le backend écrit, jamais le navigateur.
import { env } from '../config/env.js'
import { rest as restTable } from './supabase.js'

export const abonnementsConfigures = () => !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY)

const rest = (method, requete, corps, prefer) => restTable('abonnements', method, requete, corps, prefer)

const q = encodeURIComponent

/** Abonnement actif (non expiré) de l'utilisateur, ou null. */
export async function abonnementActif(userId) {
  const lignes = await rest('GET', `?user_id=eq.${q(userId)}&statut=eq.actif&fin=gt.${q(new Date().toISOString())}&select=fin&order=fin.desc&limit=1`)
  return lignes?.[0] || null
}

export async function trouverTransaction(txId) {
  const lignes = await rest('GET', `?fedapay_transaction_id=eq.${q(txId)}&select=*&limit=1`)
  return lignes?.[0] || null
}

/** Dernière transaction non encore confirmée de l'utilisateur (retour de paiement sans identifiant). */
export async function derniereEnAttente(userId) {
  const lignes = await rest('GET', `?user_id=eq.${q(userId)}&statut=eq.inactif&fedapay_transaction_id=not.is.null&select=fedapay_transaction_id&order=cree_le.desc&limit=1`)
  return lignes?.[0]?.fedapay_transaction_id || null
}

/** Enregistre une transaction en attente (statut « inactif ») ; sans effet si elle existe déjà. */
export async function enregistrerTransaction({ userId, txId, montant }) {
  await rest('POST', '?on_conflict=fedapay_transaction_id', { user_id: userId, statut: 'inactif', fedapay_transaction_id: String(txId), montant }, 'resolution=ignore-duplicates,return=minimal')
}

/**
 * Active l'abonnement lié à une transaction payée. Idempotent : le webhook et le retour
 * navigateur peuvent arriver en double ou en parallèle, la durée n'est ajoutée qu'une fois.
 * @returns {{ fin: string, nouveau: boolean, renouvellement?: boolean }}
 */
export async function activer({ txId, userId, montant }) {
  let ligne = await trouverTransaction(txId)
  if (!ligne) {
    await enregistrerTransaction({ userId, txId, montant })
    ligne = await trouverTransaction(txId)
  }
  if (ligne.statut === 'actif') return { fin: ligne.fin, nouveau: false }

  // Renouvellement : la durée s'ajoute à la fin de l'abonnement en cours, s'il y en a un.
  const encours = await abonnementActif(ligne.user_id)
  const debut = new Date()
  const base = encours ? new Date(encours.fin) : debut
  const fin = new Date(base.getTime() + env.FEDAPAY_DUREE_JOURS * 86400000)

  // Mise à jour conditionnelle (statut ≠ actif) : atomique, évite le double crédit en cas de course.
  const maj = await rest(
    'PATCH',
    `?fedapay_transaction_id=eq.${q(txId)}&statut=neq.actif`,
    { statut: 'actif', debut: debut.toISOString(), fin: fin.toISOString() },
    'return=representation',
  )
  if (!maj?.length) {
    const deja = await trouverTransaction(txId)
    return { fin: deja?.fin || fin.toISOString(), nouveau: false }
  }
  return { fin: maj[0].fin, nouveau: true, renouvellement: !!encours }
}

// ── Suivi des e-mails (colonnes *_le : « déjà envoyé » → un seul envoi, même si webhook/cron se répètent) ──

/**
 * Réserve l'envoi d'un e-mail pour une ligne : met `colonne` à maintenant SI elle est encore vide.
 * Atomique : un seul appelant obtient `true`. `extra` : champs à modifier en même temps.
 */
export async function reserverEnvoi(id, colonne, extra = {}) {
  const maj = await rest('PATCH', `?id=eq.${q(id)}&${colonne}=is.null`, { [colonne]: new Date().toISOString(), ...extra }, 'return=representation')
  return !!maj?.length
}

/** Annule une réservation (l'e-mail n'a pas pu partir : le prochain passage réessaiera). */
export async function libererEnvoi(id, colonne, extra = {}) {
  await rest('PATCH', `?id=eq.${q(id)}`, { [colonne]: null, ...extra })
}

/** Réserve la notification d'échec d'une transaction non payée (webhook et retour navigateur peuvent se doubler). */
export async function reserverEchec(txId) {
  const maj = await rest('PATCH', `?fedapay_transaction_id=eq.${q(txId)}&statut=neq.actif&echec_notifie_le=is.null`, { echec_notifie_le: new Date().toISOString() }, 'return=representation')
  return !!maj?.length
}
export async function libererEchec(txId) {
  await rest('PATCH', `?fedapay_transaction_id=eq.${q(txId)}`, { echec_notifie_le: null })
}

/** Abonnements actifs qui se terminent dans la fenêtre [maintenant ; limite], rappel pas encore envoyé. */
export async function aRappeler(limite) {
  const maintenant = new Date().toISOString()
  return (await rest('GET', `?statut=eq.actif&rappel_envoye_le=is.null&fin=gt.${q(maintenant)}&fin=lte.${q(limite.toISOString())}&select=id,user_id,fin&order=fin.asc&limit=200`)) || []
}

/** Abonnements encore marqués « actif » dont la date de fin est passée, expiration pas encore notifiée. */
export async function aExpirer() {
  return (await rest('GET', `?statut=eq.actif&expiration_envoyee_le=is.null&fin=lte.${q(new Date().toISOString())}&select=id,user_id,fin&order=fin.asc&limit=200`)) || []
}
