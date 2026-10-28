// src/couverture.js
// Couverture de lecture, états de confirmation par donnée, et exceptions à valider.
//
// Plan d'amélioration « lecture de plans » :
//  • on ne bloque plus l'utilisateur par une liste de plans obligatoires : on
//    mesure ce qui est réellement lu (score de couverture, par lot) ;
//  • seules les données ambiguës ou absentes remontent, regroupées par sujet,
//    avec la valeur détectée / appliquée et une alternative ;
//  • chaque donnée a un état : `detectee` | `a_confirmer` | `confirmee` | `corrigee`.
//    Une donnée « à confirmer » bloque l'export ; une valeur par défaut
//    explicitement confirmée ne le bloque plus ;
//  • la trace de confirmation (qui, quand, quelle valeur) vit dans
//    `params.confirmations` (projet enregistré) — jamais dans le PDF client.
//
// Module pur : aucune dépendance, déterministe. Il ne calcule aucune quantité,
// il qualifie celles que le métré a produites.
import { num, round2, FONDATION_DEFAUT, TOITURES } from './constants.js'

export const ETATS = ['detectee', 'a_confirmer', 'confirmee', 'corrigee']

// ── Utilitaires ──────────────────────────────────────────────────────────────
const stable = (v) => {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${k}:${stable(v[k])}`).join(',')}}`
  return JSON.stringify(v ?? null)
}
const identique = (a, b) => stable(a) === stable(b)
const fmt = (n) => String(round2(n)).replace('.', ',')

/** Correction numérique saisie par l'utilisateur pour la donnée `cle` (sinon null). */
const correction = (confirmations, cle) => {
  const c = confirmations?.[cle]
  return c && c.etat === 'corrigee' && num(c.valeur) > 0 ? num(c.valeur) : null
}

/**
 * Paramètres effectifs : applique les corrections numériques confirmées par
 * l'utilisateur (profondeur de fouille, HSP par défaut, pente de toiture).
 * Une confirmation « telle quelle » ne change aucune valeur.
 */
export function parametresEffectifs(p = {}) {
  const c = p.confirmations || {}
  const out = { ...p }
  const prof = correction(c, 'profondeur_fouille')
  if (prof) out.fondation = { ...(p.fondation || {}), profFouille: prof }
  const hsp = correction(c, 'hsp')
  if (hsp) out.Hetage = hsp
  const pente = correction(c, 'toiture_pente')
  if (pente) {
    const base = p.plans?.toiture || {}
    // La pente lue sur le plan prime : la correction ne vaut que si aucune pente n'a été lue.
    const lue = base.pente !== '' && base.pente !== null && base.pente !== undefined && Number.isFinite(+base.pente)
    const pansOk = (base.pans || []).length > 0 && (base.pans || []).every((x) => x.pente !== '' && x.pente !== null && x.pente !== undefined)
    if (!lue && !pansOk) out.plans = { ...(p.plans || {}), toiture: { ...base, pente } }
  }
  return out
}

/**
 * Enregistre (fonction pure) la confirmation d'une donnée.
 * @param {Object} confirmations  état actuel (`params.confirmations`)
 * @param {string} cle            identifiant de l'exception (ex. 'fondation')
 * @param {{valeur?: number, utilisateur?: string, date?: string, valeurAppliquee?: any}} opts
 *        `valeur` fournie → état `corrigee` ; sinon `confirmee` (valeur par défaut acceptée).
 */
export function enregistrerConfirmation(confirmations = {}, cle, { valeur, utilisateur = null, date = new Date().toISOString(), valeurAppliquee = null } = {}) {
  const corrigee = valeur !== undefined && valeur !== null && valeur !== '' && num(valeur, NaN) > 0
  return {
    ...confirmations,
    [cle]: {
      etat: corrigee ? 'corrigee' : 'confirmee',
      valeur: corrigee ? num(valeur) : (valeurAppliquee ?? null),
      par: utilisateur, date,
    },
  }
}

/** Retire une confirmation (retour à l'état « à confirmer »). */
export function retirerConfirmation(confirmations = {}, cle) {
  const { [cle]: _omis, ...reste } = confirmations
  return reste
}

// ── Évaluation ───────────────────────────────────────────────────────────────
const aDuContenu = (lv = {}) => (lv.pieces || []).some((pc) => num(pc.L) > 0 && num(pc.l) > 0)
  || (lv.murs || []).some((m) => num(m.L) > 0)
  || (lv.poteaux || []).length > 0 || (lv.poutres || []).length > 0
  || (lv.voiles || []).length > 0 || num(lv.surfPlancher) > 0

/**
 * @param {Object} t       totaux de metrerProjet()
 * @param {Array}  levels
 * @param {Object} p       paramètres (bruts ou effectifs)
 * @returns {{
 *   vide: boolean, score: number, resume: string,
 *   lots: Array<{cle,lab,statut,taux,poids,detail}>,
 *   aConfirmer: Array<Object>, bloquant: boolean,
 * }}
 */
export function evaluerCouverture(t = {}, levels = [], p = {}) {
  const conf = p.confirmations || {}
  const flags = p.planFlags || {}
  const nivs = levels.map((lv, i) => ({ lv, m: t.parNiveau?.[i] || {}, i, nom: lv?.nom || `Niveau ${i}` }))
  const actifs = nivs.filter(({ lv }) => aDuContenu(lv))
  if (!actifs.length) {
    return { vide: true, score: 0, resume: 'Aucune donnée lue : déposez vos plans ou saisissez les niveaux.', lots: [], aConfirmer: [], bloquant: false }
  }

  const items = []
  // Un item est « à confirmer » tant qu'aucune confirmation n'existe pour sa clé.
  const item = (cle, sujet, mode, question, valeurDetectee, alternative, chapitres, extra = {}) => {
    const c = conf[cle]
    const etat = c ? (c.etat === 'corrigee' ? 'corrigee' : 'confirmee') : 'a_confirmer'
    items.push({
      cle, sujet, mode, question, valeurDetectee, alternative, chapitres, etat,
      valeurRetenue: c?.valeur ?? null, par: c?.par ?? null, date: c?.date ?? null, ...extra,
    })
    return etat
  }

  // ── Fondations & terrassement ──
  const f = p.fondation || {}
  // Anciens projets (sans le drapeau fondationLue) : un plan de fondation lu vaut lecture.
  const fondationLue = flags.fondationLue === true || (flags.fondationLue === undefined && flags.typesLus?.fondation > 0)
  const fondationSaisie = fondationLue || !identique(f, FONDATION_DEFAUT)
  let statutFond = 'lu'
  if (!fondationSaisie) {
    const e = item('fondation', 'Fondations & terrassement', 'confirmer',
      `Aucune fondation lue ni saisie : semelle filante ${fmt(f.semL ?? FONDATION_DEFAUT.semL)} × ${fmt(f.semH ?? FONDATION_DEFAUT.semH)} m, fouille de ${fmt(f.profFouille ?? FONDATION_DEFAUT.profFouille)} m par défaut. Confirmez ces valeurs ou déposez / saisissez le plan de fondation.`,
      { type: f.type ?? FONDATION_DEFAUT.type, semL: f.semL ?? FONDATION_DEFAUT.semL, semH: f.semH ?? FONDATION_DEFAUT.semH, profFouille: f.profFouille ?? FONDATION_DEFAUT.profFouille },
      'Déposer le plan de fondation ou saisir les fondations', ['1', '2'])
    statutFond = e === 'a_confirmer' ? 'defaut' : 'confirme'
  } else if (fondationLue) {
    const profLue = flags.profondeurFouilleLue === true || (f.semelles || []).some((s) => num(s.prof) > 0)
    if (!profLue) {
      const e = item('profondeur_fouille', 'Fondations & terrassement', 'corriger',
        `Profondeur de fouille non trouvée sur le plan : ${fmt(f.profFouille ?? FONDATION_DEFAUT.profFouille)} m appliqué. Confirmez-la ou indiquez la bonne valeur.`,
        { profFouille: f.profFouille ?? FONDATION_DEFAUT.profFouille }, 'Saisir la profondeur (m)', ['1', '2'], { unite: 'm' })
      statutFond = e === 'a_confirmer' ? 'defaut' : 'confirme'
    }
  }
  const volTerr = num(t.volFouille) + num(t.volDeblaisEvacuer)
  const solParDefaut = identique(f.terrassement ?? FONDATION_DEFAUT.terrassement, FONDATION_DEFAUT.terrassement)
  let statutTerr = 'lu'
  if (volTerr > 0 && solParDefaut) {
    const T = f.terrassement ?? FONDATION_DEFAUT.terrassement
    const e = item('sol', 'Fondations & terrassement', 'confirmer',
      `Nature du sol non précisée : « ${T.sol} » par défaut (foisonnement ${fmt(T.cf)}, tassement ${fmt(T.cp)}). Un plan ne prouve pas la nature du sol : confirmez ou modifiez dans Niveaux & métré → Terrassement.`,
      { sol: T.sol, cf: T.cf, cp: T.cp }, 'Modifier le sol dans Niveaux & métré', ['1'])
    statutTerr = e === 'a_confirmer' ? 'defaut' : 'confirme'
  }

  // ── Maçonnerie, par niveau ──
  const sansMurs = actifs.filter(({ m }) => !(num(m.Smur) > 0))
  const tauxMac = actifs.length ? (actifs.length - sansMurs.length) / actifs.length : 0
  let statutMac = tauxMac >= 1 ? 'lu' : tauxMac > 0 ? 'partiel' : 'absent'
  if (sansMurs.length) {
    // Ossature pure : des niveaux sans maçonnerie sont possibles mais doivent être assumés.
    const e = item('lot_maconnerie', 'Maçonnerie', 'confirmer',
      `Maçonnerie absente pour : ${sansMurs.map((x) => x.nom).join(', ')}. Saisissez les murs ou pièces de ces niveaux, ou excluez-les du devis.`,
      { niveaux: sansMurs.map((x) => x.nom) }, 'Saisir les murs du niveau', ['5', '6'], { confirmerLabel: 'Exclure du devis' })
    if (e !== 'a_confirmer') statutMac = 'exclu'
  }

  // ── HSP ──
  const sansHSP = actifs.filter(({ lv }) => !(num(lv.HSP) > 0))
  if (sansHSP.length) {
    const hspDef = num(p.Hetage, 3)
    item('hsp', 'Hauteurs sous plafond', 'corriger',
      `HSP non lue pour ${sansHSP.map((x) => x.nom).join(', ')} : ${fmt(hspDef)} m appliqué. Confirmez-la ou indiquez la bonne valeur (la coupe la donne).`,
      { niveaux: sansHSP.map((x) => x.nom), HSP: hspDef }, 'Saisir la HSP (m)', ['3', '5', '6'], { unite: 'm' })
  }

  // ── Structure (ossature) ──
  const ossature = (p.systeme === 'ossature' || p.systeme === 'mixte') || actifs.some(({ lv }) => (lv.poteaux || []).length || (lv.poutres || []).length || (lv.voiles || []).length)
  const volStruct = num(t.volPoteaux) + num(t.volPoutres) + num(t.volVoiles)
  const statutStruct = !ossature ? null : volStruct > 0 ? 'lu' : 'absent'

  // ── Planchers ──
  const avecPlancher = actifs.filter(({ lv }) => (lv.plancher || (lv.dalle ? 'dallePleine' : 'aucun')) !== 'aucun')
  const plSansSurface = avecPlancher.filter(({ m }) => !(num(m.surfPlancher) > 0))
  const plParDefaut = avecPlancher.filter(({ lv, m }) => lv.plancherSource === 'defaut' && num(m.surfPlancher) > 0)
  let statutPl = !avecPlancher.length ? null : plSansSurface.length === 0 ? 'lu' : plSansSurface.length < avecPlancher.length ? 'partiel' : 'absent'
  if (plSansSurface.length) {
    const e = item('plancher_surface', 'Planchers', 'confirmer',
      `Surface de plancher absente pour : ${plSansSurface.map((x) => x.nom).join(', ')} — le plancher n'est pas chiffré. Saisissez la surface (ou les pièces), ou excluez ce plancher du devis.`,
      { niveaux: plSansSurface.map((x) => x.nom) }, 'Saisir la surface du plancher', ['4'], { confirmerLabel: 'Exclure du devis' })
    if (e !== 'a_confirmer') statutPl = 'exclu'
  }
  if (plParDefaut.length) {
    const e = item('plancher_type', 'Planchers', 'confirmer',
      `Type de plancher non lu pour : ${plParDefaut.map((x) => x.nom).join(', ')} — « ${plParDefaut[0].lv.plancher} » par défaut. Confirmez ou changez-le dans Niveaux & métré.`,
      { niveaux: plParDefaut.map((x) => x.nom), type: plParDefaut[0].lv.plancher }, 'Choisir le type de plancher', ['4'])
    if (e === 'a_confirmer' && statutPl === 'lu') statutPl = 'defaut'
  }

  // ── Enduits (déduits des surfaces de murs validées) ──
  const statutEnd = statutMac === 'absent' || statutMac === 'exclu' ? null : (num(t.enduitInt) + num(t.enduitExt)) > 0 ? 'lu' : 'absent'

  // ── Couverture ──
  const terrasse = (p.toiture || 'bac') === 'terrasse'
  const penteLue = t.toitureDetail?.pentePct !== null && t.toitureDetail?.pentePct !== undefined
    && t.toitureDetail?.surfDeveloppee > 0 && !(t.toitureDetail?.pansSansPente > 0)
  let statutCouv = null
  if (num(t.surfToiture) > 0) {
    statutCouv = 'lu'
    // Après une correction, la pente est appliquée (penteLue devient vrai) mais l'exception reste listée, à l'état « corrigée ».
    if (!terrasse && (!penteLue || correction(conf, 'toiture_pente'))) {
      const key = TOITURES[p.toiture] ? p.toiture : 'bac'
      const lue = !!t.toitureDetail
      const e = item('toiture_pente', 'Couverture', 'corriger',
        `${lue ? 'Pente de toiture non trouvée' : 'Aucun plan de toiture lu'} : coefficient forfaitaire ×${TOITURES[key].coef} (${TOITURES[key].lab}) appliqué à la surface. Confirmez-le ou indiquez la pente (%).`,
        { coef: TOITURES[key].coef, couverture: TOITURES[key].lab }, 'Saisir la pente (%)', ['8'], { unite: '%' })
      statutCouv = e === 'a_confirmer' ? 'defaut' : 'confirme'
    }
    if (t.toitureDetail?.nbPans > 0 && t.toitureDetail?.pansSansPente > 0 && correction(conf, 'toiture_pente')) statutCouv = 'confirme'
  } else {
    statutCouv = 'absent'
    const e = item('lot_couverture', 'Couverture', 'confirmer', 'Aucune surface de couverture : le lot Couverture est absent du devis.', {}, 'Saisir ou déposer le plan de toiture', ['8'], { confirmerLabel: 'Exclure du devis' })
    if (e !== 'a_confirmer') statutCouv = 'exclu'
  }

  // ── Lots & score ──
  const TAUX = { lu: 1, confirme: 1, defaut: 0.5, partiel: 0.5, absent: 0 }
  // Un lot « exclu » (l'utilisateur l'a retiré explicitement du devis) sort du score.
  const lot = (cle, lab, statut, poids) => (statut ? { cle, lab, statut, taux: statut === 'exclu' ? null : TAUX[statut], poids: statut === 'exclu' ? 0 : poids } : null)
  const lots = [
    lot('terrassement', 'Terrassement', statutFond === 'defaut' ? 'defaut' : statutTerr, 1),
    lot('fondations', 'Fondations', statutFond, 2),
    lot('structure', 'Structure (poteaux, poutres, voiles)', statutStruct, 2),
    lot('planchers', 'Planchers', statutPl, 2),
    lot('maconnerie', 'Maçonnerie', statutMac, 2),
    lot('enduits', 'Enduits & peinture', statutEnd, 1),
    lot('couverture', 'Couverture', statutCouv, 1.5),
  ].filter(Boolean)
  // Lots partiels : prorata des niveaux couverts.
  const lm = lots.find((l) => l.cle === 'maconnerie')
  if (lm && lm.statut === 'partiel') lm.taux = round2(tauxMac)
  const lp = lots.find((l) => l.cle === 'planchers')
  if (lp && lp.statut === 'partiel') lp.taux = round2((avecPlancher.length - plSansSurface.length) / avecPlancher.length)

  const poidsTot = lots.reduce((s, l) => s + l.poids, 0)
  const score = poidsTot ? Math.round((lots.reduce((s, l) => s + l.poids * l.taux, 0) / poidsTot) * 100) : 0

  const aConfirmer = items
  const restants = aConfirmer.filter((x) => x.etat === 'a_confirmer')
  const sujets = [...new Set(restants.map((x) => x.cle === 'toiture_pente' ? 'pente de toiture' : x.cle === 'profondeur_fouille' ? 'profondeur de fouille' : x.cle === 'fondation' ? 'fondations' : x.cle === 'sol' ? 'nature du sol' : x.cle === 'hsp' ? 'HSP' : x.sujet.toLowerCase()))]
  const resume = restants.length
    ? `${score} % lu ; ${sujets.join(', ')} à confirmer`
    : `${score} % lu ; aucune donnée à confirmer`

  return { vide: false, score, resume, lots, aConfirmer, bloquant: restants.length > 0 }
}

/**
 * Montants du DQE reposant sur une donnée encore « à confirmer » (ou confirmée
 * par défaut) — signalés avant export.
 * @returns {Array<{cle, sujet, etat, lignes: Array, montant: number}>}
 */
export function montantsIncomplets(dqe = {}, couverture = {}) {
  const lignes = dqe.lignes || []
  return (couverture.aConfirmer || [])
    .filter((x) => x.etat === 'a_confirmer')
    .map((x) => {
      const concernees = lignes.filter((l) => (x.chapitres || []).some((c) => String(l.n).startsWith(`${c}.`)))
      return { cle: x.cle, sujet: x.sujet, etat: x.etat, lignes: concernees.map((l) => l.n), montant: concernees.reduce((s, l) => s + (l.montant || 0), 0) }
    })
    .filter((x) => x.lignes.length > 0)
}

/** Vrai si l'export est autorisé : aucune donnée « à confirmer ». */
export const exportAutorise = (couverture) => !couverture || couverture.vide || !couverture.bloquant
