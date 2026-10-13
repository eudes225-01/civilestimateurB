// src/middleware/rateLimit.js
// Limite les appels aux routes qui ont un coût réel côté fournisseur (proxy
// Anthropic, facturé par appel) ou qui pourraient servir à abuser l'API.
// Correctif sécurité : avant cette refonte, /api/analyse-plan n'avait aucune
// limite — n'importe qui pouvait consommer le crédit Anthropic du projet.
import rateLimit from 'express-rate-limit'

export const analysePlanLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                   // 20 analyses de plan / 15 min / IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'trop_de_requetes', message: "Trop d'analyses de plan depuis cette adresse. Réessayez dans quelques minutes." },
})

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
})

// Création/vérification de paiement : évite de marteler l'API FedaPay depuis une même adresse.
export const paiementLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'trop_de_requetes', message: 'Trop de tentatives de paiement. Réessayez dans quelques minutes.' },
})

// Mail de bienvenue : le frontend l'appelle à chaque ouverture de session, le serveur n'envoie qu'une fois.
export const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'trop_de_requetes' },
})

// Génération de PDF (Chromium) : coûteuse en mémoire/CPU, donc limitée par adresse.
export const pdfLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'trop_de_requetes', message: 'Trop de PDF générés depuis cette adresse. Réessayez dans quelques minutes.' },
})

// Profil et suppression de compte : appels peu fréquents, la suppression est irréversible.
export const compteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'trop_de_requetes' },
})
