// src/middleware/auth.js
// Vérifie la session d'un utilisateur connecté (Supabase Auth / Google).
// Le jeton (Authorization: Bearer <access_token>) est validé auprès de Supabase
// (GET /auth/v1/user) : pas de secret JWT à gérer ici, et la révocation d'une
// session est prise en compte immédiatement.
//
// Échoue « fermé » : si la connexion est exigée mais que Supabase n'est pas
// configuré, la route répond 503 au lieu de s'ouvrir à tout le monde.
import { env } from '../config/env.js'
import { lireIdentite } from '../services/identite.js'

/**
 * Lit et valide le jeton de la requête.
 * @returns {Promise<{ user?: object, status?: number, error?: string }>}
 */
async function lireSession(req) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return { status: 503, error: 'auth_non_configuree' }

  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')
  if (!m) return { status: 401, error: 'auth_requise' }

  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${m[1]}` },
    })
    if (!r.ok) return { status: 401, error: 'session_invalide' }
    const u = await r.json()
    if (!u?.id) return { status: 401, error: 'session_invalide' }
    const identite = lireIdentite(u.user_metadata)
    // emailVerifie : l'adresse est confirmée par Supabase (toujours le cas avec Google). Sert à reconnaître les administrateurs.
    // `nom` reste le nom complet (utilisé par les e-mails et FedaPay) ; prénom, nom de famille et photo servent à l'affichage.
    return {
      user: {
        id: u.id,
        email: u.email || null,
        emailVerifie: !!u.email_confirmed_at,
        nom: identite.nomComplet,
        prenom: identite.prenom,
        nomFamille: identite.nom,
        photo: identite.photo,
      },
    }
  } catch {
    return { status: 503, error: 'auth_indisponible' }
  }
}

/** Connexion exigée seulement si REQUIRE_AUTH (production) ; sinon l'utilisateur est lu s'il est présent. */
export async function requireAuth(req, res, next) {
  if (!env.REQUIRE_AUTH) {
    if (req.headers.authorization) {
      const s = await lireSession(req)
      if (s.user) req.user = s.user
    }
    return next()
  }
  const s = await lireSession(req)
  if (!s.user) return res.status(s.status).json({ error: s.error })
  req.user = s.user
  return next()
}

/** Connexion TOUJOURS exigée (paiement : il faut savoir à qui rattacher l'abonnement). */
export async function requireUser(req, res, next) {
  const s = await lireSession(req)
  if (!s.user) return res.status(s.status).json({ error: s.error })
  req.user = s.user
  return next()
}

/** Renseigne req.user si un jeton valide est présent ; n'échoue jamais. */
export async function optionalAuth(req, _res, next) {
  if (req.headers.authorization) {
    const s = await lireSession(req)
    if (s.user) req.user = s.user
  }
  next()
}
