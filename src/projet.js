// src/projet.js
// Agrégation projet — combine les niveaux, la fondation, l'acier par élément
// (A5), la toiture, le ciment estimé, et lance la passe de validations
// croisées (A7 + Lot A). C'est le point d'entrée principal du moteur.
import { num, round2, RATIOS_ACIER_DEFAUT, PARAMS_DEFAUT, TOITURES } from './constants.js'
import { metrerNiveau } from './niveau.js'
import { metrerFondation } from './fondations.js'
import { validerCoherence } from './validation.js'

/**
 * @param {Array}  levels
 * @param {Object} pRaw    - paramètres du projet ; `pRaw.ville` (optionnel)
 *                           active les vérifications géotechniques Lot A.
 */
export function metrerProjet(levels = [], pRaw = {}) {
  const p = { ...PARAMS_DEFAUT, ...pRaw, ratiosAcier: { ...RATIOS_ACIER_DEFAUT, ...(pRaw.ratiosAcier || {}) } }
  const R = p.ratiosAcier

  const parNiveau = levels.map((lv) => metrerNiveau(lv, p))

  // Emprise : paramètre > plus grande surface de niveau
  const emprise = num(p.emprise) > 0 ? num(p.emprise)
    : round2(Math.max(0, ...parNiveau.map((m) => Math.max(m.surfPlancher, m.Ssol)), 0))

  const iRez = Math.max(0, levels.findIndex((lv) => lv?.rez))
  const rez = parNiveau[iRez] || { LdevPorteurs: 0, Ldev: 0 }
  const fondation = metrerFondation(p.fondation, {
    emprise,
    LdevPorteurs: rez.LdevPorteurs || rez.Ldev || 0,
  })

  // ── Agrégats élévation / planchers / maçonnerie ──
  const acc = {
    Ldev: 0, LdevPorteurs: 0, Ssol: 0, Smur: 0, Souv: 0,
    enduitInt: 0, enduitExt: 0, mortierPose: 0,
    volPoteaux: 0, volPoutres: 0, volLinteaux: 0,
    volPlanchers: 0, surfHourdis: 0, entrevous: 0,
    nbPortes: 0, nbFenetres: 0, nbPoteauxTotal: 0,
  }
  const parTypeMur = {}
  const acierDetail = []
  let acierPlanchers = 0

  parNiveau.forEach((m, i) => {
    acc.Ldev = round2(acc.Ldev + m.Ldev)
    acc.LdevPorteurs = round2(acc.LdevPorteurs + m.LdevPorteurs)
    acc.Ssol = round2(acc.Ssol + m.Ssol)
    acc.Smur = round2(acc.Smur + m.Smur)
    acc.Souv = round2(acc.Souv + m.Souv)
    acc.enduitInt = round2(acc.enduitInt + m.enduitInt)
    acc.enduitExt = round2(acc.enduitExt + m.enduitExt)
    acc.mortierPose = round2(acc.mortierPose + m.mortierPose)
    acc.volPoteaux = round2(acc.volPoteaux + m.volPoteaux)
    acc.volPoutres = round2(acc.volPoutres + m.volPoutres)
    acc.volLinteaux = round2(acc.volLinteaux + m.volLinteaux)
    acc.volPlanchers = round2(acc.volPlanchers + m.volPlancher)
    acc.surfHourdis = round2(acc.surfHourdis + m.surfHourdis)
    acc.entrevous += m.entrevous
    acc.nbPortes += m.nbPortes; acc.nbFenetres += m.nbFenetres
    acierPlanchers += m.acierPlancher
    acc.nbPoteauxTotal += (levels[i]?.poteaux || []).reduce((s, x) => s + (num(x.nb, 1) || 1), 0)
    Object.entries(m.parTypeMur).forEach(([tKey, v]) => {
      if (!parTypeMur[tKey]) parTypeMur[tKey] = { surf: 0, blocs: 0, detail: [] }
      parTypeMur[tKey].surf = round2(parTypeMur[tKey].surf + v.surf)
      parTypeMur[tKey].blocs += v.blocs
      parTypeMur[tKey].detail.push(...v.detail.map((d) => ({ ...d, lib: `${m.nom || `Niv. ${i}`} — ${d.lib}` })))
    })
  })
  const nbPoteauxRez = (levels[iRez]?.poteaux || [])
    .reduce((s, x) => s + (num(x.nb, 1) || 1), 0)

  // ── Acier par élément (A5) ──
  const pushAcier = (lib, vol, ratio) => {
    if (vol <= 0) return 0
    const kg = Math.round(vol * ratio)
    acierDetail.push({ lib, formule: `${round2(vol)} m³ × ${ratio} kg/m³`, q: kg, u: 'kg' })
    return kg
  }
  let acierKg = 0
  acierKg += pushAcier('Semelles', fondation.volBAsemelles, R.semelle)
  acierKg += pushAcier('Avant-poteaux', fondation.volBAavantPoteaux, R.poteau)
  acierKg += pushAcier('Chaînages', fondation.volBAchainages, R.chainage)
  acierKg += pushAcier('Longrines', fondation.volBAlongrines, R.longrine)
  acierKg += pushAcier('Radier', fondation.volBAradier, R.radier)
  acierKg += pushAcier('Poteaux', acc.volPoteaux, R.poteau)
  acierKg += pushAcier('Poutres', acc.volPoutres, R.poutre)
  acierKg += pushAcier('Linteaux', acc.volLinteaux, R.linteau)
  if (acierPlanchers > 0) {
    acierKg += acierPlanchers
    acierDetail.push({ lib: 'Planchers (dalles + hourdis)', formule: 'par niveau, selon type', q: acierPlanchers, u: 'kg' })
  }

  // ── Volumes BA totaux ──
  const volBAfondation = round2(fondation.volBAsemelles + fondation.volBAavantPoteaux
    + fondation.volBAchainages + fondation.volBAlongrines + fondation.volBAradier)
  const volBAelevation = round2(acc.volPoteaux + acc.volPoutres + acc.volLinteaux)
  const volBA = round2(volBAfondation + volBAelevation + acc.volPlanchers)

  // ── Toiture ──
  const toitKey = p.toiture && TOITURES[p.toiture] ? p.toiture : 'bac'
  const toit = TOITURES[toitKey]
  const dernier = parNiveau[parNiveau.length - 1]
  const surfToiture = toitKey === 'terrasse'
    ? round2((dernier?.surfPlancher || emprise))
    : round2(emprise * toit.coef)

  // ── Ciment (estimation) ──
  const cimentSacs = Math.round(
    acc.mortierPose * 7 + volBA * 7 + fondation.volProprete * 3
    + (acc.enduitInt + acc.enduitExt) * 0.12 + fondation.volBanche * 4 + fondation.volMoellons * 2.5
  )

  // ── Totaux (avec les anciens champs pour compatibilité de l'export PDF) ──
  const totaux = {
    ...acc,
    parTypeMur,
    emprise,
    fondation,
    LdevPorteursRez: round2(rez.LdevPorteurs || 0),
    volFouille: round2(fondation.volFouilles + fondation.volPleineMasse),
    volPleineMasse: fondation.volPleineMasse,
    volProprete: fondation.volProprete,
    volSemelle: round2(fondation.volBAsemelles + fondation.volBAavantPoteaux),
    volChainageBas: round2(fondation.volBAchainages + fondation.volBAlongrines),
    volBanche: fondation.volBanche,
    volMoellons: fondation.volMoellons,
    surfArase: fondation.surfArase,
    surfHerisson: fondation.surfHerisson,
    volRemblai: fondation.volRemblai,
    volBAfondation, volBAelevation,
    volDalle: acc.volPlanchers,
    volBA,
    acierKg,
    acierDetail,
    agglos: Object.values(parTypeMur).reduce((s, v) => s + v.blocs, 0),
    enduit: round2(acc.enduitInt + acc.enduitExt),
    cimentSacs,
    surfToiture,
    toiture: { key: toitKey, ...toit },
    nbPoteauxRez,
    parNiveau,
    systeme: p.systeme,
  }

  const alertes = validerCoherence(totaux, levels, p)
  return { totaux, parNiveau, alertes }
}
