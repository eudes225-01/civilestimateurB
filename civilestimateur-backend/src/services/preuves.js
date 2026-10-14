// src/services/preuves.js
// Preuves de confirmation (table public.preuves_confirmation, voir supabase/schema.sql) : acceptation des conditions
// d'utilisation et confirmation de paiement. Écrites par le backend uniquement ; une preuve par événement (clé unique).
import { createHash } from 'node:crypto'
import { DATE, SECTIONS, VERSION } from './politiquesTexte.js'
import { rest } from './supabase.js'

const T = 'preuves_confirmation'
const q = encodeURIComponent
const CONTEXTES = ['accueil', 'paiement']

/** Conditions en vigueur + empreinte SHA-256 du texte exact (preuve de ce qui a été présenté). */
export function conditionsActuelles() {
  const conditions = { version: VERSION, date: DATE, sections: SECTIONS }
  return { ...conditions, conditions, hash: createHash('sha256').update(JSON.stringify(conditions)).digest('hex') }
}

/** L'utilisateur accepte les conditions (une trace par version et par contexte ; sans effet si déjà enregistrée). */
export async function enregistrerAcceptation({ userId, email, nom, contexte, versionClient }) {
  if (!CONTEXTES.includes(contexte)) throw new Error('contexte_invalide')
  const c = conditionsActuelles()
  await rest(T, 'POST', '?on_conflict=cle', {
    cle: `acceptation/${userId}/${c.version}/${contexte}`, user_id: userId, type: 'acceptation_conditions', contexte,
    version_conditions: c.version, hash_conditions: c.hash, conditions: c.conditions,
    version_client: versionClient ? String(versionClient).slice(0, 20) : null, email: email || null, nom: nom || null,
  }, 'resolution=ignore-duplicates,return=minimal')
}

/** Paiement confirmé : une preuve par transaction (idempotent, webhook + retour navigateur). */
export async function enregistrerConfirmationPaiement({ userId, txId, montant, debut, fin, renouvellement, email, nom }) {
  const c = conditionsActuelles()
  await rest(T, 'POST', '?on_conflict=cle', {
    cle: `paiement/${txId}`, user_id: userId, type: 'confirmation_paiement',
    version_conditions: c.version, hash_conditions: c.hash, conditions: c.conditions,
    fedapay_transaction_id: String(txId), montant, debut: new Date(debut).toISOString(), fin: new Date(fin).toISOString(),
    renouvellement: !!renouvellement, email: email || null, nom: nom || null,
  }, 'resolution=ignore-duplicates,return=minimal')
}

/** L'e-mail de confirmation est parti (avec ou sans PDF joint). */
export async function marquerEnvoi(txId, pdfJoint) {
  await rest(T, 'PATCH', `?cle=eq.${q(`paiement/${txId}`)}`, { email_envoye_le: new Date().toISOString(), pdf_joint: !!pdfJoint })
}

/** Dernière confirmation de paiement de l'utilisateur, ou null. */
export async function lireConfirmation(userId) {
  const l = await rest(T, 'GET', `?user_id=eq.${q(userId)}&type=eq.confirmation_paiement&select=*&order=cree_le.desc&limit=1`)
  return l?.[0] || null
}

export async function marquerRenvoi(cle, renvoisAvant = 0) {
  await rest(T, 'PATCH', `?cle=eq.${q(cle)}`, { renvoyee_le: new Date().toISOString(), renvois: (Number(renvoisAvant) || 0) + 1 })
}
