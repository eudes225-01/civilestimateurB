// src/fondationsLotA.js
// Lot A — Recherche : Fondations (Koty Maxwell & Kpoïté Dossou Samuel, août
// 2026). Couche de RECOMMANDATION géotechnique : zone → contrainte admissible
// → type de fondation → géométrie de fouille suggérée.
//
// Principe : ce module ne calcule AUCUN volume et ne modifie AUCUNE valeur
// saisie par l'utilisateur. Il produit des suggestions (valeurs par défaut,
// type de fondation recommandé, justification) que l'UI peut afficher et
// pré-remplir, et que validation.js peut comparer au choix réel de
// l'utilisateur pour lever une alerte — jamais pour décider à sa place
// (politique produit : « aucune décision automatique »).
import { num, round2 } from './constants.js'
import { FONDATIONS } from '../data/fondations.js'
import {
  SEUILS_CONTRAINTE, CONTEXTES_SOL, DEBORDS_TRAVAIL, MATELAS_DRAINANT,
  TABLE_DECISION, SEUIL_NIVEAUX_PIEUX,
} from '../data/lotA.js'

/** Zone géotechnique d'une ville, ou null si ville inconnue/non renseignée. */
export function resolveZone(ville) {
  return (ville && FONDATIONS.villes[ville]) || null
}

/** Classe une contrainte admissible (bar) selon la table §2.2 du Lot A. */
export function classifierContrainte(bar) {
  const v = num(bar)
  if (v >= SEUILS_CONTRAINTE.bonne) return 'bonne'
  if (v >= SEUILS_CONTRAINTE.moyenne) return 'moyenne'
  return 'faible'
}

/**
 * Contrainte admissible retenue pour le projet : surcharge utilisateur
 * (`fondation.contrainteAdmissible`) prioritaire, sinon valeur par défaut
 * (milieu de fourchette) de la zone de la ville.
 */
export function resolveContrainteAdmissible(ville, contrainteOverride) {
  const overrideVal = num(contrainteOverride, 0)
  if (overrideVal > 0) {
    return { valeur: round2(overrideVal), source: 'utilisateur', zone: resolveZone(ville), fourchette: null }
  }
  const zoneKey = resolveZone(ville)
  const zone = zoneKey && FONDATIONS.zones[zoneKey]
  if (!zone) return { valeur: null, source: 'inconnue', zone: null, fourchette: null }
  return {
    valeur: zone.contrainteAdmissible.defaut,
    source: 'zone', zone: zoneKey,
    fourchette: zone.contrainteAdmissible,
  }
}

/**
 * Contexte de sol (pour la profondeur d'ancrage §3.1) : surcharge
 * utilisateur prioritaire, sinon valeur par défaut de la zone.
 */
export function resolveContexteSol(ville, contexteOverride) {
  if (contexteOverride && CONTEXTES_SOL[contexteOverride]) {
    return { contexte: contexteOverride, source: 'utilisateur', zone: resolveZone(ville) }
  }
  const zoneKey = resolveZone(ville)
  const zone = zoneKey && FONDATIONS.zones[zoneKey]
  if (!zone) return { contexte: 'stable', source: 'defaut', zone: null }
  return { contexte: zone.contexteSol, source: 'zone', zone: zoneKey }
}

/** Profondeur d'ancrage minimale recommandée (§3.1), pour un contexte de sol donné. */
export function suggererProfondeurAncrage(contexte) {
  const c = CONTEXTES_SOL[contexte] || CONTEXTES_SOL.stable
  return { contexte: contexte || 'stable', label: c.label, ...c.profondeurAncrage }
}

/** Débord de travail de fouille (§3.2–§3.4), pour un type de fondation donné. */
export function suggererDebordTravail(typeFondation) {
  return DEBORDS_TRAVAIL[typeFondation] || DEBORDS_TRAVAIL.filante
}

/**
 * Épaisseur de matelas drainant sous radier (§3.4), applicable en sol
 * compressible (zones côtière/lagunaire). Retourne `applicable: false`
 * ailleurs — l'utilisateur reste libre d'en ajouter un malgré tout.
 */
export function suggererMatelasDrainant(ville) {
  const zoneKey = resolveZone(ville)
  const applicable = !!zoneKey && MATELAS_DRAINANT.zonesConcernees.includes(zoneKey)
  return { applicable, min: MATELAS_DRAINANT.min, max: MATELAS_DRAINANT.max, defaut: applicable ? MATELAS_DRAINANT.defaut : 0, note: MATELAS_DRAINANT.note }
}

/**
 * Table de décision §2.2 : contrainte admissible × système constructif →
 * type de fondation recommandé + justification.
 */
export function recommanderTypeFondation(contrainteBar, systeme) {
  const classification = classifierContrainte(contrainteBar)
  const sys = TABLE_DECISION[classification][systeme] ? systeme : 'murs'
  const reco = TABLE_DECISION[classification][sys]
  return { classification, ...reco }
}

/**
 * Recommandation complète pour un projet : agrège zone, contrainte
 * admissible, contexte de sol, type de fondation recommandé et profondeur/
 * débord suggérés. C'est l'unique point d'entrée que l'UI et les
 * validations croisées doivent utiliser.
 *
 * @param {Object} opts
 * @param {string}  opts.ville
 * @param {string}  opts.systeme              'murs' | 'ossature' | 'mixte'
 * @param {number}  [opts.contrainteOverride]  contrainte admissible saisie par l'utilisateur (bar)
 * @param {string}  [opts.contexteSolOverride] contexte de sol saisi par l'utilisateur
 * @param {number}  [opts.nbNiveaux]           nombre de niveaux du projet (RDC compris)
 */
export function recommanderFondationProjet({ ville, systeme = 'murs', contrainteOverride, contexteSolOverride, nbNiveaux = 1 } = {}) {
  const contrainte = resolveContrainteAdmissible(ville, contrainteOverride)
  const contexte = resolveContexteSol(ville, contexteSolOverride)
  const zoneKey = contrainte.zone || contexte.zone
  const zone = zoneKey ? FONDATIONS.zones[zoneKey] : null

  if (contrainte.valeur === null) {
    return {
      ville: ville || null, zone: null, contrainte, contexte, zoneInfo: null,
      recommandation: null, profondeurAncrage: null, debordTravail: null, matelasDrainant: null,
      horsPerimetre: false,
    }
  }

  const recommandation = recommanderTypeFondation(contrainte.valeur, systeme)
  const profondeurAncrage = suggererProfondeurAncrage(contexte.contexte)
  const debordTravail = suggererDebordTravail(
    recommandation.type === 'radier' ? 'radier' : recommandation.type === 'isolees' ? 'isolee' : 'filante',
  )
  const matelasDrainant = recommandation.type === 'radier' ? suggererMatelasDrainant(ville) : null

  // Hors périmètre de calcul automatique (§2.1) : sol très faible portance
  // (faible) + bâtiment > R+2 → fondations profondes, à signaler.
  const horsPerimetre = recommandation.classification === 'faible' && num(nbNiveaux, 1) > SEUIL_NIVEAUX_PIEUX

  return {
    ville: ville || null, zone: zoneKey, zoneInfo: zone,
    contrainte, contexte, recommandation,
    profondeurAncrage, debordTravail, matelasDrainant,
    horsPerimetre,
    basFondPossible: !!zone?.basFondPossible,
  }
}
