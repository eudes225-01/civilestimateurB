// src/niveau.js
// Métré d'un niveau : murs + ossature (poteaux/poutres) + linteaux + plancher
// propre au niveau, avec surface nette et déduction des trémies (A2 / A3).
//
// Moteur v3 : les quantités de niveau sont renvoyées SANS arrondi intermédiaire (l'arrondi se fait à
// l'affichage ; seules les lignes de détail `q` sont arrondies à 2 décimales pour la lecture). Le champ
// `nb` d'un élément respecte un 0 saisi (voir qte()).
import { num, qte, round2, RATIOS_ACIER_DEFAUT, PARAMS_DEFAUT } from './constants.js'
import { metrerMurs } from './murs.js'
import { metrerLinteaux } from './linteaux.js'
import { metrerPlancher } from './planchers.js'

export function metrerNiveau(level, p = {}) {
  const mursInfo = metrerMurs(level, p)
  const HSP = mursInfo.HSP
  const nomNiveau = level.nom || 'Niveau'

  // Surface du niveau : surfPlancher saisie > somme des pièces
  const surfPieces = (level.pieces || []).reduce((s, pc) => s + num(pc.L) * num(pc.l), 0)
  const surfNiveau = num(level.surfPlancher) > 0 ? num(level.surfPlancher) : surfPieces
  const tremies = Math.max(0, num(level.tremies))
  const surfPlancherNette = Math.max(0, surfNiveau - tremies)

  // ── Ossature (A2) ──
  const detPoteaux = []
  let volPoteaux = 0, coffPoteaux = 0
  ;(level.poteaux || []).forEach((pt) => {
    const nb = qte(pt.nb), a = num(pt.a), b = num(pt.b), H = num(pt.H) || HSP
    if (a <= 0 || b <= 0 || nb <= 0) return
    const v = nb * a * b * H
    volPoteaux += v
    detPoteaux.push({ lib: pt.nom || `Poteaux ${a}×${b}`, formule: `${nb} × ${a} × ${b} × ${H}`, q: round2(v), u: 'm³' })
    // Coffrage (Lot B) : poteau autoporteur → périmètre mouillé sur 4 faces.
    coffPoteaux += nb * 2 * (a + b) * H
  })
  const detPoutres = []
  let volPoutres = 0, coffPoutres = 0
  ;(level.poutres || []).forEach((pu) => {
    const nb = qte(pu.nb), L = num(pu.L), b = num(pu.b), h = num(pu.h)
    if (L <= 0 || b <= 0 || h <= 0 || nb <= 0) return
    const v = nb * L * b * h
    volPoutres += v
    detPoutres.push({ lib: pu.nom || `Poutres ${b}×${h}`, formule: `${nb} × ${L} × ${b} × ${h}`, q: round2(v), u: 'm³' })
    // Coffrage (Lot B) : périmètre mouillé = fond + 2 faces latérales
    // (face supérieure non coffrée, coulée avec la dalle/le hourdis).
    coffPoutres += nb * (b + 2 * h) * L
  })

  // ── Voiles (plan de coffrage : V<n> avec épaisseur) ──
  // Volume = nb × L × ep × H ; coffrage = 2 faces (nb × 2 × L × H). Les tranches
  // d'about ne sont pas comptées (comme les jouées de rive des dalles).
  const detVoiles = []
  let volVoiles = 0, coffVoiles = 0
  ;(level.voiles || []).forEach((v) => {
    const nb = qte(v.nb), L = num(v.L), ep = num(v.ep), H = num(v.H) || HSP
    if (L <= 0 || ep <= 0 || H <= 0 || nb <= 0) return
    const vol = nb * L * ep * H
    volVoiles += vol
    coffVoiles += nb * 2 * L * H
    detVoiles.push({ lib: v.nom || `Voiles ép. ${ep}`, formule: `${nb} × ${L} × ${ep} × ${H}`, q: round2(vol), u: 'm³' })
  })

  // ── Chaînages verticaux (CV<n>) : poteaux raidisseurs noyés dans la maçonnerie ──
  // Pas de coffrage compté : la maçonnerie en constitue déjà deux faces et les
  // sections courantes (15×15 à 20×20) se coffrent en même temps que le mur.
  const detCV = []
  let volCV = 0
  ;(level.chainagesV || []).forEach((c) => {
    const nb = qte(c.nb), a = num(c.a), b = num(c.b), H = num(c.H) || HSP
    if (a <= 0 || b <= 0 || H <= 0 || nb <= 0) return
    const vol = nb * a * b * H
    volCV += vol
    detCV.push({ lib: c.nom || `Chaînages verticaux ${a}×${b}`, formule: `${nb} × ${a} × ${b} × ${H}`, q: round2(vol), u: 'm³' })
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
    volChainageHaut = mursInfo.LdevPorteurs * num(ch.b, 0.2) * num(ch.h, 0.2)
    detChainageHaut.push({
      lib: 'Chaînage haut (ceinture)',
      formule: `${round2(mursInfo.LdevPorteurs)} × ${num(ch.b, 0.2)} × ${num(ch.h, 0.2)}`,
      q: round2(volChainageHaut), u: 'm³',
    })
  }

  // ── Plancher haut du niveau (A3) — voir planchers.js ──
  const pl = metrerPlancher(level, p, { surfNette: surfPlancherNette, nom: nomNiveau })

  return {
    nom: level.nom, HSP,
    Ldev: mursInfo.Ldev, LdevPorteurs: mursInfo.LdevPorteurs,
    Ssol: surfPieces, surfPlancher: surfPlancherNette, tremies,
    Smur: mursInfo.Smur, Souv: mursInfo.Souv,
    parTypeMur: mursInfo.parType,
    parCategorieMur: mursInfo.parCategorie,
    soubassement: mursInfo.soubassement, soubassementACompleter: mursInfo.soubassementACompleter,
    enduitInt: mursInfo.enduitInt, enduitExt: mursInfo.enduitExt,
    nbPortes: mursInfo.nbPortes, nbFenetres: mursInfo.nbFenetres,
    // Mortier de pose (ancien champ `mortierPose` conservé : m³ de mortier de pose, tous types confondus).
    mortierPose: mursInfo.mortierPoseM3, cimentPoseSacs: mursInfo.cimentPoseSacs, sablePoseM3: mursInfo.sablePoseM3,
    volPoteaux, volPoutres, coffPoteaux, coffPoutres,
    volLinteaux: linteaux.vol,
    volVoiles, coffVoiles, volCV,
    volChainageHaut,
    typePlancher: pl.typePlancher, volPlancher: pl.vol, surfHourdis: pl.surfHourdis, entrevous: pl.entrevous,
    acierPlancher: pl.acier, plancher: pl,
    coffDalleSousFace: pl.coffSousFace, coffRives: pl.coffRives,
    alertes: [...mursInfo.alertes, ...pl.alertes],
    detail: { poteaux: detPoteaux, poutres: detPoutres, linteaux: linteaux.detail, chainageHaut: detChainageHaut, voiles: detVoiles, chainagesV: detCV, plancher: pl.detail },
  }
}
