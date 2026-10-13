// src/niveau.js
// Métré d'un niveau : murs + ossature (poteaux/poutres) + linteaux + plancher
// propre au niveau, avec surface nette et déduction des trémies (A2 / A3).
import { num, round2, TYPES_PLANCHER, RATIOS_ACIER_DEFAUT, PARAMS_DEFAUT } from './constants.js'
import { metrerMurs } from './murs.js'
import { metrerLinteaux } from './linteaux.js'

export function metrerNiveau(level, p = {}) {
  const mursInfo = metrerMurs(level, p)
  const HSP = mursInfo.HSP

  // Surface du niveau : surfPlancher saisie > somme des pièces
  const surfPieces = round2((level.pieces || []).reduce((s, pc) => s + num(pc.L) * num(pc.l), 0))
  const surfNiveau = num(level.surfPlancher) > 0 ? num(level.surfPlancher) : surfPieces
  const tremies = Math.max(0, num(level.tremies))
  const surfPlancherNette = Math.max(0, round2(surfNiveau - tremies))

  // ── Ossature (A2) ──
  const detPoteaux = []
  let volPoteaux = 0, coffPoteaux = 0
  ;(level.poteaux || []).forEach((pt) => {
    const nb = num(pt.nb, 1) || 1, a = num(pt.a), b = num(pt.b), H = num(pt.H) || HSP
    if (a <= 0 || b <= 0) return
    const v = round2(nb * a * b * H)
    volPoteaux += v
    detPoteaux.push({ lib: pt.nom || `Poteaux ${a}×${b}`, formule: `${nb} × ${a} × ${b} × ${H}`, q: v, u: 'm³' })
    // Coffrage (Lot B) : poteau autoporteur → périmètre mouillé sur 4 faces.
    coffPoteaux += round2(nb * 2 * (a + b) * H)
  })
  const detPoutres = []
  let volPoutres = 0, coffPoutres = 0
  ;(level.poutres || []).forEach((pu) => {
    const nb = num(pu.nb, 1) || 1, L = num(pu.L), b = num(pu.b), h = num(pu.h)
    if (L <= 0 || b <= 0 || h <= 0) return
    const v = round2(nb * L * b * h)
    volPoutres += v
    detPoutres.push({ lib: pu.nom || `Poutres ${b}×${h}`, formule: `${nb} × ${L} × ${b} × ${h}`, q: v, u: 'm³' })
    // Coffrage (Lot B) : périmètre mouillé = fond + 2 faces latérales
    // (face supérieure non coffrée, coulée avec la dalle/le hourdis).
    coffPoutres += round2(nb * (b + 2 * h) * L)
  })

  // ── Voiles (plan de coffrage : V<n> avec épaisseur) ──
  // Volume = nb × L × ep × H ; coffrage = 2 faces (nb × 2 × L × H). Les tranches
  // d'about ne sont pas comptées (comme les jouées de rive des dalles).
  const detVoiles = []
  let volVoiles = 0, coffVoiles = 0
  ;(level.voiles || []).forEach((v) => {
    const nb = num(v.nb, 1) || 1, L = num(v.L), ep = num(v.ep), H = num(v.H) || HSP
    if (L <= 0 || ep <= 0 || H <= 0) return
    const vol = round2(nb * L * ep * H)
    volVoiles += vol
    coffVoiles += round2(nb * 2 * L * H)
    detVoiles.push({ lib: v.nom || `Voiles ép. ${ep}`, formule: `${nb} × ${L} × ${ep} × ${H}`, q: vol, u: 'm³' })
  })

  // ── Chaînages verticaux (CV<n>) : poteaux raidisseurs noyés dans la maçonnerie ──
  // Pas de coffrage compté : la maçonnerie en constitue déjà deux faces et les
  // sections courantes (15×15 à 20×20) se coffrent en même temps que le mur.
  const detCV = []
  let volCV = 0
  ;(level.chainagesV || []).forEach((c) => {
    const nb = num(c.nb, 1) || 1, a = num(c.a), b = num(c.b), H = num(c.H) || HSP
    if (a <= 0 || b <= 0 || H <= 0) return
    const vol = round2(nb * a * b * H)
    volCV += vol
    detCV.push({ lib: c.nom || `Chaînages verticaux ${a}×${b}`, formule: `${nb} × ${a} × ${b} × ${H}`, q: vol, u: 'm³' })
  })

  const linteaux = metrerLinteaux(mursInfo, p)

  // ── Chaînage haut (Lot C / fiche Eurocode §3.C) ──
  // Ceinture en BA sur les murs porteurs de chaque niveau : section mini
  // 15×20 cm, obligatoire dès qu'il y a de la maçonnerie porteuse. Non
  // appliqué en ossature (poutres saisies) ni si désactivé (chainageHaut.actif
  // = false, ou level.chainageHaut === false).
  const ch = { ...PARAMS_DEFAUT.chainageHaut, ...(p.chainageHaut || {}) }
  const porteur = (p.systeme || PARAMS_DEFAUT.systeme) !== 'ossature'
  let volChainageHaut = 0
  const detChainageHaut = []
  if (ch.actif && level.chainageHaut !== false && porteur && mursInfo.LdevPorteurs > 0) {
    volChainageHaut = round2(mursInfo.LdevPorteurs * num(ch.b, 0.2) * num(ch.h, 0.2))
    detChainageHaut.push({
      lib: 'Chaînage haut (ceinture)',
      formule: `${mursInfo.LdevPorteurs} × ${num(ch.b, 0.2)} × ${num(ch.h, 0.2)}`,
      q: volChainageHaut, u: 'm³',
    })
  }

  // ── Plancher haut du niveau (A3) ──
  // Compat legacy : level.dalle=true (ancien modèle) → dalle pleine.
  const typePl = level.plancher || (level.dalle ? 'dallePleine' : 'aucun')
  const plInfo = TYPES_PLANCHER[typePl] || TYPES_PLANCHER.aucun
  let volPlancher = 0, surfHourdis = 0, entrevous = 0, acierPlancher = 0
  const R = { ...RATIOS_ACIER_DEFAUT, ...(p.ratiosAcier || {}) }
  if (typePl === 'dallePleine') {
    volPlancher = round2(surfPlancherNette * num(level.epDalle, num(p.epDalle, 0.15)))
    acierPlancher = Math.round(volPlancher * R.dallePleine)
  } else if (typePl === 'dalleTP') {
    volPlancher = round2(surfPlancherNette * num(level.epDalle, num(p.epDalle, 0.12)))
    acierPlancher = Math.round(volPlancher * R.dalleTP)
  } else if (typePl === 'hourdis15' || typePl === 'hourdis20') {
    surfHourdis = surfPlancherNette
    volPlancher = round2(surfPlancherNette * plInfo.betonM2)
    entrevous = Math.round(surfPlancherNette * plInfo.entrevousM2)
    acierPlancher = Math.round(surfPlancherNette * R.hourdisM2)
  }

  const mortierPose = round2(mursInfo.Smur * 0.022)

  return {
    nom: level.nom, HSP,
    Ldev: mursInfo.Ldev, LdevPorteurs: mursInfo.LdevPorteurs,
    Ssol: surfPieces, surfPlancher: surfPlancherNette, tremies,
    Smur: mursInfo.Smur, Souv: mursInfo.Souv,
    parTypeMur: mursInfo.parType,
    enduitInt: mursInfo.enduitInt, enduitExt: mursInfo.enduitExt,
    nbPortes: mursInfo.nbPortes, nbFenetres: mursInfo.nbFenetres,
    mortierPose,
    volPoteaux: round2(volPoteaux), volPoutres: round2(volPoutres),
    coffPoteaux: round2(coffPoteaux), coffPoutres: round2(coffPoutres),
    volLinteaux: linteaux.vol,
    volVoiles: round2(volVoiles), coffVoiles: round2(coffVoiles), volCV: round2(volCV),
    volChainageHaut,
    typePlancher: typePl, volPlancher, surfHourdis, entrevous, acierPlancher,
    detail: { poteaux: detPoteaux, poutres: detPoutres, linteaux: linteaux.detail, chainageHaut: detChainageHaut, voiles: detVoiles, chainagesV: detCV },
  }
}
