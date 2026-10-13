// src/services/profils.js
// Profils (public.profils) lus/écrits par le backend : e-mail du client et suivi du mail de bienvenue.
import { rest } from './supabase.js'

const q = encodeURIComponent

/** { email, nom } du profil, ou null. */
export async function lireProfil(userId) {
  const l = await rest('profils', 'GET', `?id=eq.${q(userId)}&select=email,nom&limit=1`)
  return l?.[0] || null
}

/**
 * Réserve le mail de bienvenue : vrai UNE seule fois par compte (la première connexion qui arrive ici).
 * Crée le profil s'il manque (comptes antérieurs au trigger).
 */
export async function reserverBienvenue({ id, email, nom }) {
  await rest('profils', 'POST', '?on_conflict=id', { id, email, nom: nom || null }, 'resolution=ignore-duplicates,return=minimal')
  const maj = await rest('profils', 'PATCH', `?id=eq.${q(id)}&bienvenue_envoyee_le=is.null`, { bienvenue_envoyee_le: new Date().toISOString() }, 'return=representation')
  return !!maj?.length
}

export async function libererBienvenue(id) {
  await rest('profils', 'PATCH', `?id=eq.${q(id)}`, { bienvenue_envoyee_le: null })
}
