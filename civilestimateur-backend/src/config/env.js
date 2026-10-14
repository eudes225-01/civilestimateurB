// src/config/env.js
// Lecture centralisée des variables d'environnement. Un seul endroit à
// modifier pour ajouter/renommer une variable ; les valeurs par défaut sont
// documentées ici plutôt qu'éparpillées dans les routes.
import 'dotenv/config'

function parseOrigins(raw) {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    // Correctif : un slash final ne matchera jamais l'en-tête `Origin` du
    // navigateur (qui n'en porte jamais). L'ancienne valeur par défaut
    // (".../vercel.app/") ne matchait donc jamais en pratique.
    .map((s) => s.replace(/\/+$/, ''))
}

const FEDAPAY_KEY = process.env.FEDAPAY_SECRET_KEY || ''
const FEDAPAY_ENV = (process.env.FEDAPAY_ENV || (/^sk_sandbox/i.test(FEDAPAY_KEY) ? 'sandbox' : 'live')).toLowerCase()

const DEFAULT_ALLOWED_ORIGINS = 'http://localhost:5173,https://civilestimator-archinova.store,https://civilestimateur-archinova.vercel.app'
const ORIGINES = parseOrigins(process.env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS)

export const env = {
  PORT: Number(process.env.PORT) || 8080,
  NODE_ENV: process.env.NODE_ENV || 'development',
  ALLOWED_ORIGINS: ORIGINES,
  // Prévisualisations Vercel : *-eudes-avgms-projects.vercel.app
  VERCEL_PREVIEW_PATTERN: /^https:\/\/[a-z0-9-]+-eudes-avgms-projects\.vercel\.app$/,
  // Comptes (Supabase Auth, connexion Google). Le backend vérifie le jeton de session
  // auprès de Supabase ; il n'a besoin que de l'URL et de la clé publique (anon).
  SUPABASE_URL: (process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
  // Connexion obligatoire pour les routes qui coûtent de l'argent (lecture de plans).
  // Par défaut : exigée en production, facultative en développement.
  REQUIRE_AUTH: process.env.REQUIRE_AUTH ? process.env.REQUIRE_AUTH === 'true' : process.env.NODE_ENV === 'production',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
  ANTHROPIC_MAX_TOKENS: Number(process.env.ANTHROPIC_MAX_TOKENS) || 16000,
  // Clé serveur Supabase (service_role) : UNIQUEMENT pour écrire les abonnements depuis le
  // backend (webhook FedaPay). Ne jamais la mettre côté frontend.
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  // ── FedaPay (abonnement Premium) ──
  FEDAPAY_SECRET_KEY: process.env.FEDAPAY_SECRET_KEY || '',
  // 'sandbox' ou 'live'. Par défaut déduit du préfixe de la clé (sk_sandbox_… / sk_live_…).
  FEDAPAY_ENV: FEDAPAY_ENV,
  // URL de retour après paiement (page du frontend). Vide : on utilise l'origine de la requête.
  FEDAPAY_CALLBACK: process.env.FEDAPAY_CALLBACK || '',
  // Secret du webhook (« whsec_… », affiché dans FedaPay → Webhooks).
  FEDAPAY_WEBHOOK_SECRET: process.env.FEDAPAY_WEBHOOK_SECRET || '',
  // Prix et durée de l'abonnement : fixés ICI, jamais par le client.
  FEDAPAY_MONTANT: Number(process.env.FEDAPAY_MONTANT) || 5000, // FCFA (XOF)
  FEDAPAY_DUREE_JOURS: Number(process.env.FEDAPAY_DUREE_JOURS) || 30,
  // ── E-mails (Resend) ──
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  // Expéditeur : doit utiliser le domaine vérifié dans Resend (civilestimator-archinova.store).
  EMAIL_FROM: process.env.EMAIL_FROM || 'CivilEstimateur <no-reply@civilestimator-archinova.store>',
  // Destinataires des notifications « paiement reçu » : une ou plusieurs adresses séparées par des virgules.
  EMAIL_ADMIN: process.env.EMAIL_ADMIN || 'archinova87@gmail.com',
  EMAIL_ADMINS: (process.env.EMAIL_ADMIN || 'archinova87@gmail.com').split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean),
  // Adresse de réponse des clients (facultatif ; par défaut l'adresse admin).
  EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO || 'archinova87@gmail.com',
  // Lien des boutons dans les e-mails (site du frontend).
  APP_URL: (process.env.APP_URL || process.env.FEDAPAY_CALLBACK || ORIGINES.find((o) => o.startsWith('https://')) || '').replace(/\/+$/, ''),
  // Rappel envoyé quand il reste au plus N jours d'abonnement.
  RAPPEL_JOURS: Number(process.env.RAPPEL_JOURS) || 3,
  // Secret de la tâche planifiée (POST /api/cron/echeances). Vide : route désactivée.
  CRON_SECRET: process.env.CRON_SECRET || '',
}

/** Avertit au démarrage des fonctionnalités désactivées faute de configuration. */
export function warnMissingConfig() {
  if (env.REQUIRE_AUTH && (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY)) {
    console.warn('[config] REQUIRE_AUTH actif mais SUPABASE_URL / SUPABASE_ANON_KEY absents — les routes protégées répondront 503.')
  }
  if (!env.ANTHROPIC_API_KEY) {
    console.warn('[config] ANTHROPIC_API_KEY absent — /api/analyse-plan répondra 501 tant que la clé n\'est pas renseignée.')
  }
  if (!env.FEDAPAY_SECRET_KEY) {
    console.warn('[config] FEDAPAY_SECRET_KEY absent — /api/fedapay/init répondra 501 (abonnement Premium non activable).')
  } else {
    if (!['sandbox', 'live'].includes(env.FEDAPAY_ENV)) {
      console.warn(`[config] FEDAPAY_ENV="${env.FEDAPAY_ENV}" invalide (attendu : sandbox ou live).`)
    }
    const cleSandbox = /^sk_sandbox/i.test(env.FEDAPAY_SECRET_KEY)
    if ((env.FEDAPAY_ENV === 'sandbox') !== cleSandbox) {
      console.warn('[config] FEDAPAY_ENV ne correspond pas à la clé (sk_sandbox_… ↔ sandbox, sk_live_… ↔ live) — FedaPay répondra 401.')
    }
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      console.warn('[config] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY absents — les paiements ne pourront pas être enregistrés (503).')
    }
    if (!env.FEDAPAY_WEBHOOK_SECRET) {
      console.warn('[config] FEDAPAY_WEBHOOK_SECRET absent — le webhook est accepté sans signature (le statut est tout de même revérifié auprès de FedaPay).')
    }
  }
  if (!env.RESEND_API_KEY) {
    console.warn('[config] RESEND_API_KEY absent — aucun e-mail ne sera envoyé (bienvenue, paiements, rappels).')
  } else if (/@resend\.dev>?$/i.test(env.EMAIL_FROM.trim())) {
    console.warn('[config] EMAIL_FROM utilise resend.dev — Resend ne livre alors qu\'à l\'adresse de votre compte. Vérifiez un domaine pour écrire aux clients.')
  }
}
