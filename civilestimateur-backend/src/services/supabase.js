// src/services/supabase.js
// Accès REST (PostgREST) à Supabase avec la clé service_role : réservé au backend.
import { env } from '../config/env.js'

export const supabaseServeurConfigure = () => !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY)

/** Appel PostgREST sur une table (`requete` commence par « ? » ou est vide). */
export async function rest(table, method, requete, corps, prefer) {
  if (!supabaseServeurConfigure()) throw Object.assign(new Error('abonnements_non_configures'), { status: 503 })
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}${requete}`, {
    method,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      // Ancienne clé service_role (JWT « eyJ… ») : aussi envoyée en Bearer. Nouvelle clé secrète
      // (« sb_secret_… ») : l'en-tête apikey suffit, ce n'est pas un JWT.
      ...(env.SUPABASE_SERVICE_ROLE_KEY.startsWith('sb_') ? {} : { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }),
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: corps ? JSON.stringify(corps) : undefined,
  })
  if (!r.ok) throw new Error(`Supabase ${r.status} : ${(await r.text()).slice(0, 200)}`)
  const texte = await r.text()
  return texte ? JSON.parse(texte) : null
}
