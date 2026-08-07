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

const DEFAULT_ALLOWED_ORIGINS = 'http://localhost:5173,https://civilestimateur-archinova.vercel.app'

export const env = {
  PORT: Number(process.env.PORT) || 8080,
  NODE_ENV: process.env.NODE_ENV || 'development',
  ALLOWED_ORIGINS: parseOrigins(process.env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS),
  // Prévisualisations Vercel : *-eudes-avgms-projects.vercel.app
  VERCEL_PREVIEW_PATTERN: /^https:\/\/[a-z0-9-]+-eudes-avgms-projects\.vercel\.app$/,
  LANCEMENT_DATE: process.env.LANCEMENT_DATE || '2026-06-26T00:00:00Z',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
  ANTHROPIC_MAX_TOKENS: Number(process.env.ANTHROPIC_MAX_TOKENS) || 16000,
  FEDAPAY_SECRET_KEY: process.env.FEDAPAY_SECRET_KEY || '',
  FEDAPAY_ENV: process.env.FEDAPAY_ENV || 'live',
  FEDAPAY_CALLBACK: process.env.FEDAPAY_CALLBACK || '',
  FEDAPAY_WEBHOOK_SECRET: process.env.FEDAPAY_WEBHOOK_SECRET || '',
}

/** Avertit au démarrage des fonctionnalités désactivées faute de configuration. */
export function warnMissingConfig() {
  if (!env.ANTHROPIC_API_KEY) {
    console.warn('[config] ANTHROPIC_API_KEY absent — /api/analyse-plan répondra 501 tant que la clé n\'est pas renseignée.')
  }
  if (!env.FEDAPAY_SECRET_KEY) {
    console.warn('[config] FEDAPAY_SECRET_KEY absent — /api/fedapay/init répondra 501 (abonnement Premium non activable).')
  }
}
