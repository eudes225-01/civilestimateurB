// src/services/supabase.js
// Accès REST (PostgREST) à Supabase avec la clé service_role : réservé au backend.
import { env } from '../config/env.js'

export const supabaseServeurConfigure = () => !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY)

function enTetesService() {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    // Ancienne clé service_role (JWT « eyJ… ») : aussi envoyée en Bearer. Nouvelle clé secrète
    // (« sb_secret_… ») : l'en-tête apikey suffit, ce n'est pas un JWT.
    ...(env.SUPABASE_SERVICE_ROLE_KEY.startsWith('sb_') ? {} : { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }),
  }
}

/**
 * Supprime définitivement un compte (Supabase Auth, API Admin). Les tables profils, projets et
 * abonnements sont liées à auth.users en « on delete cascade » : leurs lignes disparaissent avec lui.
 * Un compte déjà absent (404) compte comme supprimé.
 */
export async function supprimerUtilisateurAuth(userId) {
  if (!supabaseServeurConfigure()) throw Object.assign(new Error('suppression_non_configuree'), { status: 503 })
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: enTetesService(),
  })
  if (!r.ok && r.status !== 404) throw new Error(`Supabase ${r.status} : ${(await r.text()).slice(0, 200)}`)
}

/** Appel PostgREST sur une table (`requete` commence par « ? » ou est vide). */
export async function rest(table, method, requete, corps, prefer) {
  if (!supabaseServeurConfigure()) throw Object.assign(new Error('abonnements_non_configures'), { status: 503 })
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}${requete}`, {
    method,
    headers: {
      ...enTetesService(),
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: corps ? JSON.stringify(corps) : undefined,
  })
  if (!r.ok) throw new Error(`Supabase ${r.status} : ${(await r.text()).slice(0, 200)}`)
  const texte = await r.text()
  return texte ? JSON.parse(texte) : null
}
