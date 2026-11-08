// @ts-check
// src/planchers.js
// Planchers d'un niveau (A3) — moteur v3.
//
// Types : dalle pleine, dalle sur terre-plein, corps creux (poutrelles + hourdis) à poutrelles apparentes
// ou à sous-face plane, dalle nervurée. Les types historiques `hourdis15` / `hourdis20` sont conservés avec
// EXACTEMENT les mêmes quantités qu'avant (le test de référence R+2 en dépend) ; leur sous-face n'étant pas
// précisée, un statut « à confirmer » est remonté.
//
// Règles de coffrage (corrigées) :
//   • dalle sur terre-plein : AUCUN coffrage de sous-face (elle est coulée sur le sol) ; seules les rives
//     peuvent être coffrées, et uniquement si le périmètre est connu (level.perimetre, en m) ;
//   • dalle suspendue (pleine / nervurée) : coffrage de sous-face = surface nette ; rives si périmètre connu ;
//   • corps creux : les entrevous servent de fond de coffrage entre poutrelles ; l'étaiement n'est pas chiffré
//     par le moteur (à prévoir au prix de plancher — voir libellé du prix).
//
// Rien n'est deviné : l'entraxe des poutrelles, leur portée et l'orientation doivent être saisis
// (level.entraxe, level.porteePoutrelle) ; sinon les poutrelles ne sont pas comptées et une alerte
// « à confirmer » est émise.
import { num, round2, TYPES_PLANCHER, CORPS_CREUX, PLANCHERS_CORPS_CREUX, PLANCHERS_SUSPENDUS_COFFRES, RATIOS_ACIER_DEFAUT } from './constants.js'

/**
 * @param {Object} level
 * @param {Object} p       paramètres effectifs du projet
 * @param {{ surfNette: number, nom?: string }} ctx
 */
export function metrerPlancher(level, p, ctx) {
  const S = ctx.surfNette
  const nom = ctx.nom || level.nom || 'Niveau'
  const typePl = TYPES_PLANCHER[level.plancher || (level.dalle ? 'dallePleine' : 'aucun')]
    ? (level.plancher || (level.dalle ? 'dallePleine' : 'aucun')) : 'aucun'
  const R = { ...RATIOS_ACIER_DEFAUT, ...(p.ratiosAcier || {}) }
  const alertes = []
  const add = (niveau, msg) => alertes.push({ niveau, msg: `${nom} : ${msg}` })
  const detail = []

  const out = {
    typePlancher: typePl, surfNette: S,
    vol: 0, volNervures: 0, volTable: 0, surfHourdis: 0, entrevous: 0, hauteurCorpsCreux: null,
    poutrellesL: null, poutrellesNb: null, entraxe: null, entrevousFormule: null, poutrellesFormule: null,
    acier: 0, acierStatut: 'estime',
    coffSousFace: 0, coffRives: 0, perimetre: num(level.perimetre) > 0 ? num(level.perimetre) : null,
    finitionSousFace: null, surfSousFace: 0, sousFace: TYPES_PLANCHER[typePl]?.sousFace ?? null,
    statut: 'calcule', detail, alertes,
  }
  if (typePl === 'aucun' || !(S > 0)) return out

  const ep = (def) => num(level.epDalle, num(p.epDalle, def))

  if (typePl === 'dallePleine') {
    const e = ep(0.15)
    out.vol = S * e
    out.acier = Math.round(out.vol * R.dallePleine)
    out.coffSousFace = S
    detail.push({ lib: 'Dalle pleine BA', formule: `${round2(S)} × ${e}`, q: round2(out.vol), u: 'm³' })
  } else if (typePl === 'dalleTP') {
    const e = ep(0.12)
    out.vol = S * e
    out.acier = Math.round(out.vol * R.dalleTP)
    out.coffSousFace = 0 // coulée sur le sol : pas de sous-face
    detail.push({ lib: 'Dalle sur terre-plein (béton légèrement armé)', formule: `${round2(S)} × ${e}`, q: round2(out.vol), u: 'm³' })
    if (!(out.perimetre > 0)) add('info', "dalle sur terre-plein : périmètre non saisi, coffrage de rive non compté (aucun coffrage de sous-face n'est nécessaire sur le sol).")
  } else if (PLANCHERS_CORPS_CREUX.includes(typePl)) {
    const legacy = TYPES_PLANCHER[typePl].corpsCreux
    const haut = legacy || num(level.corpsCreux, 0)
    const cc = CORPS_CREUX[haut]
    if (!cc) {
      add('bloquante', `plancher corps creux sans hauteur d'entrevous reconnue (« ${level.corpsCreux ?? 'non saisie'} ») — indiquez 15 (15+5) ou 20 (20+5) ; plancher non chiffré.`)
      out.statut = 'a_confirmer'
      return out
    }
    out.hauteurCorpsCreux = haut
    const tableM = num(level.tableCompression, cc.tableM)
    const volNerv = S * Math.max(0, cc.betonM2 - cc.tableM)
    const volTable = S * tableM
    out.volNervures = volNerv; out.volTable = volTable
    out.vol = volNerv + volTable
    out.surfHourdis = S
    // Nombre d'entrevous : N = S_dalle / S_hourdis (problème 6) quand les dimensions de l'entrevous sont saisies
    // (level.dimHourdis = { L, l } en m), majoré des pertes (params.pertesHourdis, 5 % par défaut : marge 5–10 %).
    // Sinon : hypothèse historique du type de plancher (entrevous/m², pertes ≈ 2 % incluses), signalée « estimée ».
    const dh = level.dimHourdis || {}
    if (num(dh.L) > 0 && num(dh.l) > 0) {
      const pertes = num(level.pertesHourdis, num(p.pertesHourdis, 5))
      const brut = S / (num(dh.L) * num(dh.l))
      out.entrevous = Math.ceil(brut * (1 + pertes / 100) - 1e-9)
      out.entrevousFormule = `${round2(S)} m² ÷ (${dh.L} × ${dh.l} m) = ${round2(brut)} × (1 + ${pertes} % de pertes)`
    } else {
      const m2 = num(level.entrevousM2) > 0 ? num(level.entrevousM2) : cc.entrevousM2
      out.entrevous = Math.round(S * m2)
      out.entrevousFormule = `${round2(S)} m² × ${m2} /m² (pertes incluses, hypothèse du type de plancher — saisir les dimensions de l'entrevous pour N = S ÷ S_hourdis)`
    }
    out.acier = Math.round(S * R.hourdisM2)
    detail.push(
      { lib: `Entrevous ${cc.lab}`, formule: out.entrevousFormule, q: out.entrevous, u: 'u' },
      { lib: 'Béton des nervures', formule: `${round2(S)} × ${round2(cc.betonM2 - cc.tableM)}`, q: round2(volNerv), u: 'm³' },
      { lib: `Béton de table de compression (${Math.round(tableM * 100)} cm)`, formule: `${round2(S)} × ${tableM}`, q: round2(volTable), u: 'm³' },
    )
    // Poutrelles : exigent l'entraxe saisi (jamais deviné).
    const entraxe = num(level.entraxe)
    if (entraxe > 0) {
      out.entraxe = entraxe
      const portee = num(level.porteePoutrelle)
      const Lperp = num(level.longueurPerpPoutrelles)
      if (Lperp > 0) {
        // Np = L_perpendiculaire aux poutrelles / entraxe + 1 (problème 6) — l'orientation est fournie par la saisie.
        out.poutrellesNb = Math.ceil(Lperp / entraxe - 1e-9) + 1
        out.poutrellesL = portee > 0 ? out.poutrellesNb * portee : S / entraxe
        out.poutrellesFormule = `${Lperp} m ÷ ${entraxe} m + 1 = ${out.poutrellesNb} poutrelles${portee > 0 ? ` × ${portee} m de portée` : ''}`
        detail.push({ lib: 'Nombre de poutrelles', formule: out.poutrellesFormule, q: out.poutrellesNb, u: 'u' })
        if (!(portee > 0)) add('info', 'portée des poutrelles non saisie : nombre calculé (L_perp ÷ entraxe + 1), longueur totale estimée par surface ÷ entraxe.')
      } else {
        out.poutrellesL = S / entraxe
        if (portee > 0) out.poutrellesNb = Math.ceil(out.poutrellesL / portee - 1e-9)
        out.poutrellesFormule = `${round2(S)} m² ÷ entraxe ${entraxe} m`
        detail.push({ lib: 'Poutrelles (longueur totale)', formule: out.poutrellesFormule, q: round2(out.poutrellesL), u: 'ml' })
        if (!(portee > 0)) add('info', "portée des poutrelles non saisie : longueur totale calculée ; saisissez la dimension perpendiculaire aux poutrelles (L_perp) pour obtenir leur nombre (L_perp ÷ entraxe + 1).")
      }
      if (entraxe < 0.4 || entraxe > 0.7) add('attention', `entraxe de ${entraxe} m inhabituel pour un corps creux (0,40–0,70 m) — vérifiez la trame.`)
    } else {
      out.statut = 'a_confirmer'
      add('attention', 'entraxe des poutrelles non saisi — poutrelles NON comptées (ni orientation ni trame devinées). Saisissez l\'entraxe (et la portée) pour obtenir leur longueur / nombre.')
    }
    // Sous-face
    if (TYPES_PLANCHER[typePl].sousFace === null) {
      out.statut = out.statut === 'calcule' ? 'estime' : out.statut
      add('info', `plancher « ${TYPES_PLANCHER[typePl].lab} » : sous-face (poutrelles apparentes ou plane) non précisée — choisissez « Corps creux — poutrelles apparentes » ou « sous-face plane » pour fixer la finition.`)
    }
    const fin = level.finitionSousFace
    if (fin === 'enduit' || fin === 'faux_plafond') {
      out.finitionSousFace = fin
      out.surfSousFace = S
      detail.push({ lib: fin === 'enduit' ? 'Enduit de sous-face' : 'Faux plafond', formule: `${round2(S)} m²`, q: round2(S), u: 'm²' })
      if (out.sousFace === 'apparent') add('info', 'sous-face apparente (poutrelles + entrevous visibles) : surface de finition prise égale à la surface de plancher, à confirmer.')
    }
  } else if (typePl === 'nervuree') {
    const nv = level.nervures || {}
    const entraxe = num(nv.entraxe), b = num(nv.b), h = num(nv.h), sens = num(nv.sens, 1) === 2 ? 2 : 1
    const e = num(level.epDalle, num(nv.epTable, NaN))
    if (!(entraxe > 0 && b > 0 && h > 0 && e > 0)) {
      out.statut = 'a_confirmer'
      add('attention', 'dalle nervurée : entraxe, section des nervures (b × h) et épaisseur de table nécessaires — plancher non chiffré tant qu\'ils ne sont pas saisis.')
      return out
    }
    const lNerv = (sens * S) / entraxe
    out.volTable = S * e
    out.volNervures = lNerv * b * h
    out.vol = out.volTable + out.volNervures
    out.acier = Math.round(out.vol * R.dallePleine)
    out.coffSousFace = S + 2 * h * lNerv
    detail.push(
      { lib: 'Table de compression', formule: `${round2(S)} × ${e}`, q: round2(out.volTable), u: 'm³' },
      { lib: `Nervures (${sens} sens)`, formule: `${sens} × ${round2(S)} ÷ ${entraxe} × ${b} × ${h}`, q: round2(out.volNervures), u: 'm³' },
    )
  }

  // Rives : coffrées uniquement si le périmètre est connu (dalle pleine, nervurée, terre-plein).
  if (out.perimetre > 0 && (typePl === 'dalleTP' || PLANCHERS_SUSPENDUS_COFFRES.includes(typePl))) {
    const e = typePl === 'nervuree' ? num(level.epDalle, num(level.nervures?.epTable, 0.15)) : ep(typePl === 'dalleTP' ? 0.12 : 0.15)
    out.coffRives = out.perimetre * e
    detail.push({ lib: 'Coffrage de rives', formule: `${out.perimetre} m × ${e}`, q: round2(out.coffRives), u: 'm²' })
  }
  return out
}
