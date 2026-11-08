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

// Forfaits de crédits CST (montants en FCFA, séparés par des virgules). Valeur invalide → forfaits par défaut.
const FORFAITS_DEFAUT = [2500, 5000, 10000, 20000]
function parseForfaits(raw) {
  const l = [...new Set(String(raw || '').split(/[,;\s]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0).map(Math.round))].sort((a, b) => a - b)
  return l.length ? l : FORFAITS_DEFAUT
}

// Date d'entrée en vigueur de l'expiration des crédits (ISO, ex. 2026-12-01). Vide ou invalide → expiration DÉSACTIVÉE :
// aucun solde n'est jamais remis à zéro. Seuls les achats payés à partir de cette date sont concernés.
function parseDepuis(raw) {
  const t = String(raw || '').trim()
  if (!t) return ''
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString()
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
  // Clé serveur Supabase (service_role) : UNIQUEMENT pour écrire les achats et soldes de crédits
  // depuis le backend (webhook FedaPay, lecture de plans). Ne jamais la mettre côté frontend.
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  // ── Mode de l'application ──
  // APP_GRATUITE=oui : version GRATUITE (aucun crédit débité, aucun paiement ; un compte connecté suffit).
  // APP_GRATUITE=non (défaut) : version PAYANTE (lecture de plans facturée en crédits CST).
  APP_GRATUITE: /^(oui|true|1|yes)$/i.test(String(process.env.APP_GRATUITE || '').trim()),
  // ── FedaPay (achat de crédits CST) ──
  FEDAPAY_SECRET_KEY: process.env.FEDAPAY_SECRET_KEY || '',
  // 'sandbox' ou 'live'. Par défaut déduit du préfixe de la clé (sk_sandbox_… / sk_live_…).
  FEDAPAY_ENV: FEDAPAY_ENV,
  // URL de retour après paiement (page du frontend). Vide : on utilise l'origine de la requête.
  FEDAPAY_CALLBACK: process.env.FEDAPAY_CALLBACK || '',
  // Secret du webhook (« whsec_… », affiché dans FedaPay → Webhooks).
  FEDAPAY_WEBHOOK_SECRET: process.env.FEDAPAY_WEBHOOK_SECRET || '',
  // ── Crédits CST (CivilEstimator) : fixés ICI, jamais par le client ──
  // Forfaits proposés, en FCFA (XOF). Le client choisit l'un d'eux ; tout autre montant est refusé.
  CST_FORFAITS: parseForfaits(process.env.CST_FORFAITS),
  // Nombre de CST crédités pour 1 FCFA payé.
  CST_PAR_FCFA: Number(process.env.CST_PAR_FCFA) || 1,
  // Solde minimum exigé pour DÉMARRER une lecture de plans.
  CST_MINIMUM_LECTURE: Number(process.env.CST_MINIMUM_LECTURE) || 2500,
  // Tarif de la lecture : CST débités par million de tokens traités (texte + images lus / texte produit).
  CST_PRIX_ENTREE_MILLION: Number(process.env.CST_PRIX_ENTREE_MILLION) || 3000,
  CST_PRIX_SORTIE_MILLION: Number(process.env.CST_PRIX_SORTIE_MILLION) || 15000,
  // ── Expiration des crédits (tâche planifiée « échéances ») ──
  // Validité en mois après le DERNIER achat payé ; rappel e-mail RAPPEL_JOURS jours avant ; actif seulement si CREDITS_EXPIRATION_DEPUIS est renseigné.
  CREDITS_VALIDITE_MOIS: Number(process.env.CREDITS_VALIDITE_MOIS) > 0 ? Math.round(Number(process.env.CREDITS_VALIDITE_MOIS)) : 1,
  CREDITS_EXPIRATION_DEPUIS: parseDepuis(process.env.CREDITS_EXPIRATION_DEPUIS),
  RAPPEL_JOURS: Number(process.env.RAPPEL_JOURS) > 0 ? Math.round(Number(process.env.RAPPEL_JOURS)) : 5,
  // Secret de la route POST /api/cron/echeances (en-tête « Authorization: Bearer <secret> ») ; sans lui la route répond 503.
  CRON_SECRET: process.env.CRON_SECRET || '',
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
}

/** Avertit au démarrage des fonctionnalités désactivées faute de configuration. */
export function warnMissingConfig() {
  if (env.APP_GRATUITE) console.warn('[config] APP_GRATUITE=oui — version gratuite : aucun crédit débité, paiement FedaPay désactivé.')
  if (env.REQUIRE_AUTH && (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY)) {
    console.warn('[config] REQUIRE_AUTH actif mais SUPABASE_URL / SUPABASE_ANON_KEY absents — les routes protégées répondront 503.')
  }
  if (!env.ANTHROPIC_API_KEY) {
    console.warn('[config] ANTHROPIC_API_KEY absent — /api/analyse-plan répondra 501 tant que la clé n\'est pas renseignée.')
  }
  if (!env.FEDAPAY_SECRET_KEY) {
    console.warn('[config] FEDAPAY_SECRET_KEY absent — /api/fedapay/init répondra 501 (achat de crédits CST impossible).')
  } else {
    if (!['sandbox', 'live'].includes(env.FEDAPAY_ENV)) {
      console.warn(`[config] FEDAPAY_ENV="${env.FEDAPAY_ENV}" invalide (attendu : sandbox ou live).`)
    }
    const cleSandbox = /^sk_sandbox/i.test(env.FEDAPAY_SECRET_KEY)
    if ((env.FEDAPAY_ENV === 'sandbox') !== cleSandbox) {
      console.warn('[config] FEDAPAY_ENV ne correspond pas à la clé (sk_sandbox_… ↔ sandbox, sk_live_… ↔ live) — FedaPay répondra 401.')
    }
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      console.warn('[config] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY absents — les achats et soldes de crédits ne pourront pas être enregistrés (503).')
    }
    if (!env.FEDAPAY_WEBHOOK_SECRET) {
      console.warn('[config] FEDAPAY_WEBHOOK_SECRET absent — le webhook est accepté sans signature (le statut est tout de même revérifié auprès de FedaPay).')
    }
  }
  if (!env.RESEND_API_KEY) {
    console.warn('[config] RESEND_API_KEY absent — aucun e-mail ne sera envoyé (bienvenue, paiements).')
  } else if (/@resend\.dev>?$/i.test(env.EMAIL_FROM.trim())) {
    console.warn('[config] EMAIL_FROM utilise resend.dev — Resend ne livre alors qu\'à l\'adresse de votre compte. Vérifiez un domaine pour écrire aux clients.')
  }
}
