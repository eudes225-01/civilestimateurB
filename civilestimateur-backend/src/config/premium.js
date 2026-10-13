// src/config/premium.js
// Catalogue des fonctionnalités et statuts. UNE seule source de vérité : le frontend affiche
// les mentions « Premium » et le récapitulatif de paiement à partir de ce que renvoie l'API,
// et les routes serveur appliquent le verrou avec `requirePremium`.
//
// Verrouillées (Premium) : uniquement le dépôt/lecture des plans et l'export PDF.
// Tout le reste (saisie, métré, DQE à l'écran, projets) est accessible à tout compte connecté.
import { env } from './env.js'

export const STATUTS = Object.freeze({ STANDARD: 'standard', PREMIUM: 'premium', ADMIN: 'admin' })

export const FONCTIONNALITES = Object.freeze([
  { id: 'saisie_metre', libelle: 'Saisie, métré et DQE à l\u2019écran', premium: false },
  { id: 'projets', libelle: 'Création, enregistrement et suppression de projets', premium: false },
  { id: 'depot_plans', libelle: 'Dépôt et lecture automatique des plans', premium: true },
  { id: 'export_pdf', libelle: 'Export PDF du devis (BPU / DQE)', premium: true },
])

export const MESSAGE_PREMIUM = 'Le dépôt de plans et l\u2019export PDF sont réservés aux abonnés Premium.'

/** Liste des fonctionnalités avec, pour chacune, l'accès de l'utilisateur (`acces`) et la mention `premium`. */
export function fonctionnalitesPour({ premiumActif }) {
  return FONCTIONNALITES.map((f) => ({ ...f, acces: !f.premium || !!premiumActif }))
}

/**
 * Détails de l'offre, affichés avant le paiement : prix, durée, ce que l'abonnement débloque.
 * Le prix et la durée viennent de l'environnement du serveur, jamais du navigateur.
 */
export function offrePremium() {
  const { FEDAPAY_MONTANT: montant, FEDAPAY_DUREE_JOURS: dureeJours } = env
  return {
    nom: 'Premium',
    montant,
    devise: 'XOF',
    dureeJours,
    duree: `${dureeJours} jour${dureeJours > 1 ? 's' : ''}`,
    renouvellement: 'Paiement unique, sans reconduction automatique. Un nouveau paiement avant la fin ajoute la durée à l\u2019abonnement en cours.',
    moyensPaiement: 'Mobile Money ou carte bancaire (FedaPay)',
    debloque: FONCTIONNALITES.filter((f) => f.premium).map(({ id, libelle }) => ({ id, libelle })),
  }
}
