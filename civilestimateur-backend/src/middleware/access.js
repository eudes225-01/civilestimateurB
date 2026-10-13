// src/middleware/access.js
// Accès Premium = abonnement FedaPay actif. Il n'y a PAS de période gratuite : les étapes
// « DQE » et « Export PDF » (et les routes serveur qui les alimentent) exigent un abonnement.
//
// L'abonnement est vérifié côté serveur dans Supabase (table abonnements, écrite uniquement
// par le webhook / la confirmation FedaPay) pour l'utilisateur identifié par son jeton de
// session. Aucun en-tête fourni par le client ne vaut preuve d'abonnement.
import { env } from '../config/env.js'
import { abonnementActif, abonnementsConfigures } from '../services/abonnements.js'
import { fedapayConfigure } from '../services/fedapay.js'

const fmt = (d) => new Date(d).toLocaleDateString('fr-FR')

const MESSAGE_REQUIS = 'Abonnement requis à partir de l\u2019étape DQE.'

export function accessState() {
  return { premiumRequis: true, message: MESSAGE_REQUIS }
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

/** Échoue « fermé » : sans session valide → 401, sans abonnement actif → 402. */
export async function requirePremium(req, res, next) {
  const st = accessState()
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
