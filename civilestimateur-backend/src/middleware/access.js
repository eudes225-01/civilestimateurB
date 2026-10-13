// src/middleware/access.js
// Accès Premium = période de lancement gratuite (3 mois) OU abonnement FedaPay actif.
//
// L'abonnement est vérifié côté serveur dans Supabase (table abonnements, écrite uniquement
// par le webhook / la confirmation FedaPay) pour l'utilisateur identifié par son jeton de
// session. Aucun en-tête fourni par le client ne vaut preuve d'abonnement.
import { env } from '../config/env.js'
import { abonnementActif, abonnementsConfigures } from '../services/abonnements.js'
import { fedapayConfigure } from '../services/fedapay.js'

const LANCEMENT = new Date(env.LANCEMENT_DATE)
const FIN_GRATUIT = new Date(LANCEMENT)
FIN_GRATUIT.setMonth(FIN_GRATUIT.getMonth() + 3)

const fmt = (d) => new Date(d).toLocaleDateString('fr-FR')

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
      ? `Accès gratuit à toutes les fonctionnalités jusqu'au ${fmt(FIN_GRATUIT)} (J-${joursRestants}).`
      : `Période de lancement terminée. Abonnement requis pour le Premium.`,
  }
}

/** État d'accès complet pour un utilisateur (éventuellement anonyme). */
export async function etatUtilisateur(user) {
  const base = {
    ...accessState(),
    abonne: false,
    finAbonnement: null,
    paiementDisponible: fedapayConfigure() && abonnementsConfigures(),
    abonnement: { montant: env.FEDAPAY_MONTANT, devise: 'XOF', dureeJours: env.FEDAPAY_DUREE_JOURS },
  }
  if (!user || !abonnementsConfigures()) return base
  try {
    const ab = await abonnementActif(user.id)
    if (ab) {
      return { ...base, abonne: true, finAbonnement: ab.fin, message: `Abonnement actif jusqu'au ${fmt(ab.fin)}.` }
    }
  } catch (e) {
    console.error('[access] lecture abonnement :', e.message)
  }
  return base
}

export async function requirePremium(req, res, next) {
  const st = accessState()
  if (st.gratuit) return next()
  if (!req.user) return res.status(401).json({ error: 'auth_requise', ...st })
  if (!abonnementsConfigures()) return res.status(503).json({ error: 'abonnements_non_configures', ...st })
  try {
    if (await abonnementActif(req.user.id)) return next()
  } catch (e) {
    console.error('[access] lecture abonnement :', e.message)
    return res.status(503).json({ error: 'abonnements_indisponibles' })
  }
  return res.status(402).json({ error: 'premium_required', ...st })
}
