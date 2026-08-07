// src/middleware/access.js
// État de l'accès Premium (période de lancement gratuite, 3 mois).
//
// ⚠️ Périmètre volontairement limité : ce middleware distingue seulement
// « période gratuite en cours » / « terminée ». Il n'existe à ce jour aucune
// vérification réelle d'abonnement (pas de compte, pas de JWT, pas de
// persistance en base) — hors gratuité, toute requête Premium est refusée.
// L'ancien code acceptait un en-tête `x-subscription: active` non signé
// comme preuve d'abonnement : n'importe qui pouvait le forger. Ce contournement
// trivial a été supprimé ; le TODO ci-dessous documente le remplacement réel
// à implémenter lors de l'intégration effective de FedaPay.
//
// TODO(paiement) : après confirmation du webhook FedaPay (routes/fedapay.js),
// persister l'abonnement (base de données) et émettre un jeton signé
// (JWT) vérifié ici, avant d'ouvrir requirePremium hors période gratuite.
import { env } from '../config/env.js'

const LANCEMENT = new Date(env.LANCEMENT_DATE)
const FIN_GRATUIT = new Date(LANCEMENT)
FIN_GRATUIT.setMonth(FIN_GRATUIT.getMonth() + 3)

export function accessState() {
  const now = new Date()
  const gratuit = now < FIN_GRATUIT
  const joursRestants = Math.max(0, Math.ceil((FIN_GRATUIT - now) / 86400000))
  return {
    gratuit,
    joursRestants,
    finGratuit: FIN_GRATUIT.toISOString(),
    premiumRequis: !gratuit,
    message: gratuit
      ? `Accès gratuit à toutes les fonctionnalités jusqu'au ${FIN_GRATUIT.toLocaleDateString('fr-FR')} (J-${joursRestants}).`
      : `Période de lancement terminée. Abonnement FedaPay requis pour le Premium.`,
  }
}

export function requirePremium(_req, res, next) {
  const st = accessState()
  if (st.gratuit) return next()
  return res.status(402).json({ error: 'premium_required', ...st })
}
