// src/fondations.js
// Fondations (A1) — trois systèmes, modélisés par éléments : filante /
// semelles isolées + longrines / radier, avec pleine masse, banché, moellons,
// arase et hérissonnage en options communes.
//
// Ces formules de volume sont figées par le test de référence (avant-métré
// manuel R+2 Fès, test/reference-r2.test.js). Toutes les données de fondation
// (type, profondeurs, dimensions) sont saisies par l'utilisateur ou lues sur le
// plan de fondation : le moteur n'en propose aucune d'après la ville.
//
// Moteur v3 :
//  • sortie détaillée par ouvrage (`semellesFilantes`, `semellesIsolees`, `rigoles`) : dimensions, fouille,
//    propreté, béton, acier ESTIMÉ (ratio kg/m³ — pas un ferraillage), remblai indicatif, matériaux associés ;
//  • terrassement : réemploi des terres, purge de sol impropre et apport extérieur sont des choix explicites
//    (voir `terrasser`) — plus d'évacuation totale ET d'apport total facturés systématiquement ;
//  • aucun arrondi intermédiaire (arrondi à 2 décimales uniquement sur les lignes de détail `q`).
import { num, qte, round2, FONDATION_DEFAUT, RATIOS_ACIER_DEFAUT, DOSAGES } from './constants.js'

const matBeton = (vBA, vBP) => ({
  cimentSacs: vBA * DOSAGES.ba350.cimentSacs + vBP * DOSAGES.proprete.cimentSacs,
  sableM3: vBA * DOSAGES.ba350.sableM3 + vBP * DOSAGES.proprete.sableM3,
  gravierM3: vBA * DOSAGES.ba350.gravierM3 + vBP * DOSAGES.proprete.gravierM3,
})

/**
 * Terrassement — bilan déblais / remblais, avec choix explicites.
 *   Vdéblais_place   = fouilles + pleine masse (volume en place)
 *   Vremblai_compacté = Vdéblais_place − Vouvrages_enterrés (vides à remblayer)
 *   Besoin_brut      = Vremblai_compacté × Cp (tassement)
 * Trois cas, jamais cumulés par défaut :
 *   1. PURGE (sol impropre : terrassement.bloquant ou terrassement.purge.actif) : tout le déblai est évacué
 *      (× Cf) ET un matériau d'apport extérieur (Cp du sable 1,10) remplace le remblai — activé d'office, mais
 *      une justification est exigée (alerte bloquante sinon).
 *   2. RÉEMPLOI (défaut ; terrassement.reemploi.actif ≠ false, taux ∈ [0;1], défaut 1) : les terres excavées
 *      servent au remblai à hauteur de min(besoin, déblais × taux) ; seul le surplus est évacué (× Cf) ;
 *      un apport extérieur n'existe que si les terres disponibles ne suffisent pas (apport complémentaire).
 *   3. SANS RÉEMPLOI (reemploi.actif === false, pas de purge) : tout est évacué ; le remblai n'est chiffré
 *      que si l'apport extérieur est explicitement activé (terrassement.apportExterieur.actif) — sinon il est
 *      signalé « non pourvu ».
 */
export function terrasser({ vDeblaisPlace, vEnterre, T = {} }) {
  const cf = num(T.cf, 1.25), cp = num(T.cp, 1.15)
  const vRemblai = Math.max(0, vDeblaisPlace - vEnterre)
  const besoinBrut = vRemblai * cp
  const purge = !!T.bloquant || T.purge?.actif === true
  const ree = T.reemploi
  const reemploiActif = !(ree === false || ree?.actif === false)
  const taux = Math.min(1, Math.max(0, num(ree?.taux, 1)))
  const apportActif = T.apportExterieur?.actif === true
  const alertes = []
  let mode, reemploi = 0, evacuer, apport = 0, nonPourvu = 0, justifie = null

  if (purge) {
    mode = 'purge'
    evacuer = vDeblaisPlace * cf
    apport = vRemblai * 1.10 // Cp « sable / gravier » — matériau de substitution (document Lot B)
    justifie = String(T.purge?.justification || T.justification || '').trim() || null
    if (!justifie) alertes.push({ niveau: 'bloquante', msg: 'Purge de sol impropre activée sans justification : indiquez la cause (étude géotechnique, sol rencontré) pour justifier l\'évacuation totale et l\'apport extérieur.' })
  } else if (reemploiActif) {
    mode = 'reemploi'
    reemploi = Math.min(besoinBrut, vDeblaisPlace * taux)
    apport = Math.max(0, besoinBrut - reemploi)
    evacuer = Math.max(0, vDeblaisPlace - reemploi) * cf
    if (apport > 1e-9) alertes.push({ niveau: 'info', msg: `Terrassement : les terres excavées (${round2(vDeblaisPlace * taux)} m³ réemployables) ne suffisent pas au remblai (${round2(besoinBrut)} m³) — apport complémentaire de ${round2(apport)} m³.` })
    if (vDeblaisPlace > 0) alertes.push({ niveau: 'info', msg: `Terrassement : réemploi des terres excavées supposé à ${Math.round(taux * 100)} % — à confirmer (sol réutilisable ?). Sol impropre : activer « purge » ; sol non réutilisable : désactiver le réemploi.` })
  } else {
    mode = 'evacuation'
    evacuer = vDeblaisPlace * cf
    if (apportActif) {
      apport = besoinBrut
      if (!String(T.apportExterieur?.justification || '').trim()) alertes.push({ niveau: 'attention', msg: 'Apport extérieur de remblai activé sans justification — précisez pourquoi les terres excavées ne sont pas réemployées.' })
    } else if (vRemblai > 0) {
      nonPourvu = vRemblai
      alertes.push({ niveau: 'attention', msg: `Terrassement : ni réemploi des terres ni apport extérieur déclarés — ${round2(vRemblai)} m³ de remblai ne sont pas chiffrés. Activez l'apport extérieur (avec justification) ou le réemploi.` })
    }
  }
  return {
    mode, cf, cp, vDeblaisPlace, vRemblai, besoinBrut,
    reemploi, taux: reemploiActif ? taux : 0, evacuer, apport, nonPourvu, justification: justifie, alertes,
  }
}

export function metrerFondation(fRaw = {}, ctx = {}) {
  const f = { ...FONDATION_DEFAUT, ...fRaw,
    pleineMasse: { ...FONDATION_DEFAUT.pleineMasse, ...(fRaw.pleineMasse || {}) },
    banche: { ...FONDATION_DEFAUT.banche, ...(fRaw.banche || {}) },
    moellons: { ...FONDATION_DEFAUT.moellons, ...(fRaw.moellons || {}) },
    herisson: { ...FONDATION_DEFAUT.herisson, ...(fRaw.herisson || {}) },
    terrassement: { ...FONDATION_DEFAUT.terrassement, ...(fRaw.terrassement || {}) },
  }
  const R = { ...RATIOS_ACIER_DEFAUT, ...(ctx.ratiosAcier || {}) }
  const out = {
    type: f.type,
    volPleineMasse: 0, volFouilles: 0, volProprete: 0,
    volBAsemelles: 0, volBAavantPoteaux: 0, volBAchainages: 0, volBAlongrines: 0, volBAradier: 0,
    volBanche: 0, volMoellons: 0, surfArase: 0, surfHerisson: 0, volRemblai: 0,
    lineaireFonde: 0,
    // Détail par ouvrage (v3). `acierKg` = ESTIMATION par ratio (statut 'estime'), pas un ferraillage.
    semellesFilantes: [], semellesIsolees: [], rigoles: [], radier: null,
    detail: { fouilles: [], proprete: [], ba: [], divers: [] },
  }
  const emprise = num(ctx.emprise)
  const ratioSem = f.type === 'isolees' ? R.semelleIsolee : R.semelleFilante
  const remblaiIndic = (vF, vBP, vBA) => Math.max(0, vF - vBP - vBA)

  // Fouille en pleine masse (commune, optionnelle)
  if (f.pleineMasse.actif) {
    const S = num(f.pleineMasse.surface) > 0 ? num(f.pleineMasse.surface) : emprise
    out.volPleineMasse = S * num(f.pleineMasse.prof, 0.5)
    out.detail.fouilles.push({ lib: 'Fouille en pleine masse', formule: `${round2(S)} × ${f.pleineMasse.prof}`, q: round2(out.volPleineMasse), u: 'm³' })
  }

  if (f.type === 'radier') {
    const S = emprise
    const ep = num(f.epRadier, 0.3), eP = num(f.epProprete, 0.05), prof = num(f.profFouille, 0.6)
    out.volBAradier = S * ep
    out.volProprete = S * eP
    out.volFouilles = S * prof
    out.detail.fouilles.push({ lib: 'Fouille sous radier', formule: `${round2(S)} × ${f.profFouille}`, q: round2(out.volFouilles), u: 'm³' })
    out.detail.ba.push({ lib: 'Radier général BA', formule: `${round2(S)} × ${f.epRadier}`, q: round2(out.volBAradier), u: 'm³' })
    out.radier = {
      ref: 'Radier général', surface: S, epaisseur: ep, profFouille: prof,
      volFouille: out.volFouilles, volProprete: out.volProprete, volBA: out.volBAradier,
      acierKg: out.volBAradier * R.radier, acierStatut: 'estime', remblaiIndicatif: remblaiIndic(out.volFouilles, out.volProprete, out.volBAradier),
      materiaux: matBeton(out.volBAradier, out.volProprete),
    }
  } else if (f.type === 'isolees') {
    // Semelles isolées
    ;(f.semelles || []).forEach((s) => {
      const nb = qte(s.nb), L = num(s.L), l = num(s.l)
      if (L <= 0 || l <= 0 || nb <= 0) return
      const prof = num(s.prof, num(f.profFouille, 1.5))
      const h = num(s.h, num(f.semH, 0.3))
      const vF = nb * L * l * prof
      const Lba = num(s.Lba, L), lba = num(s.lba, l)
      const vBA = nb * Lba * lba * h
      const vBP = nb * L * l * num(f.epProprete, 0.1)
      out.volFouilles += vF; out.volBAsemelles += vBA; out.volProprete += vBP
      const tag = s.type ? ` ${s.type}` : ''
      out.detail.fouilles.push({ lib: `Fouille semelles${tag}`, formule: `${nb} × ${L} × ${l} × ${prof}`, q: round2(vF), u: 'm³' })
      out.detail.ba.push({ lib: `BA semelles${tag}`, formule: `${nb} × ${Lba} × ${lba} × ${h}`, q: round2(vBA), u: 'm³' })
      out.detail.proprete.push({ lib: `Propreté semelles${tag}`, formule: `${nb} × ${L} × ${l} × ${f.epProprete}`, q: round2(vBP), u: 'm³' })
      out.semellesIsolees.push({
        ref: s.type || `S${out.semellesIsolees.length + 1}`, nb,
        fouille: { L, l, prof }, beton: { L: Lba, l: lba, h }, epProprete: num(f.epProprete, 0.1),
        volFouille: vF, volProprete: vBP, volBA: vBA,
        acierKg: vBA * ratioSem, acierRatio: ratioSem, acierStatut: 'estime',
        remblaiIndicatif: remblaiIndic(vF, vBP, vBA),
        materiaux: matBeton(vBA, vBP),
      })
    })
    // Avant-poteaux
    ;(f.avantPoteaux || []).forEach((ap) => {
      const nb = qte(ap.nb), a = num(ap.a), b = num(ap.b), H = num(ap.H)
      if (a <= 0 || b <= 0 || H <= 0 || nb <= 0) return
      const v = nb * a * b * H
      out.volBAavantPoteaux += v
      out.detail.ba.push({ lib: 'BA avant-poteaux', formule: `${nb} × ${a} × ${b} × ${H}`, q: round2(v), u: 'm³' })
    })
    // Chaînages / longrines : fouilles (rigoles) + BA + ouvrages associés
    const rigole = (lst, nomG, bFDef) => {
      let lin = 0
      ;(lst || []).forEach((c) => {
        const nb = qte(c.nb), L = num(c.L)
        if (L <= 0 || nb <= 0) return
        lin += nb * L
        const bF = num(c.bF, bFDef)
        const prof = num(c.prof, num(f.profFouille, 1.5))
        const vF = nb * L * bF * prof
        out.volFouilles += vF
        const nomC = `${nomG}${c.nom ? ` — ${c.nom}` : ''}`
        out.detail.fouilles.push({ lib: `Fouille rigole ${nomC}`, formule: `${nb} × ${L} × ${bF} × ${prof}`, q: round2(vF), u: 'm³' })
        const vBP = nb * L * bF * num(f.epProprete, 0.1)
        out.volProprete += vBP
        out.detail.proprete.push({ lib: `Propreté ${nomC}`, formule: `${nb} × ${L} × ${bF} × ${f.epProprete}`, q: round2(vBP), u: 'm³' })
        const b = num(c.b, 0.2), h = num(c.h, 0.2)
        const vBA = nb * L * b * h
        if (nomG === 'chaînage') out.volBAchainages += vBA
        else out.volBAlongrines += vBA
        out.detail.ba.push({ lib: `BA ${nomC}`, formule: `${nb} × ${L} × ${b} × ${h}`, q: round2(vBA), u: 'm³' })
        const ratio = nomG === 'chaînage' ? R.chainage : R.longrine
        out.rigoles.push({
          type: nomG, ref: c.nom || nomG, nb, L, bF, prof, b, h,
          volFouille: vF, volProprete: vBP, volBA: vBA, acierKg: vBA * ratio, acierRatio: ratio, acierStatut: 'estime',
          remblaiIndicatif: remblaiIndic(vF, vBP, vBA), materiaux: matBeton(vBA, vBP),
        })
        // Ouvrages associés
        if (nomG === 'longrine' && f.banche.actif) {
          const vB = nb * L * num(f.banche.b, 0.4) * num(f.banche.h, 0.95)
          out.volBanche += vB
          out.detail.divers.push({ lib: `Béton banché — ${c.nom || 'longrine'}`, formule: `${nb} × ${L} × ${f.banche.b} × ${f.banche.h}`, q: round2(vB), u: 'm³' })
          if (f.arase) out.surfArase += nb * L * num(f.banche.b, 0.4)
        }
        if (nomG === 'chaînage' && f.moellons.actif) {
          const vM = nb * L * num(f.moellons.b, 0.5) * num(f.moellons.h, 1.25)
          out.volMoellons += vM
          out.detail.divers.push({ lib: `Moellons — ${c.nom || 'chaînage'}`, formule: `${nb} × ${L} × ${f.moellons.b} × ${f.moellons.h}`, q: round2(vM), u: 'm³' })
          if (f.arase) out.surfArase += nb * L * num(f.moellons.b, 0.5)
        }
      })
      return lin
    }
    out.lineaireFonde = rigole(f.chainages, 'chaînage', 0.6) + rigole(f.longrines, 'longrine', 0.6)
  } else {
    // ── filante (défaut / legacy) ──
    const lin = num(f.lineaire) > 0 ? num(f.lineaire) : num(ctx.LdevPorteurs)
    const semL = num(f.semL, 0.4), semH = num(f.semH, 0.2), prof = num(f.profFouille, 0.6)
    const eP = num(f.epProprete, 0.05)
    out.lineaireFonde = lin
    out.volFouilles = semL * prof * lin
    out.volProprete = semL * eP * lin
    out.volBAsemelles = semL * semH * lin
    out.volBAchainages = 0.20 * 0.20 * lin
    out.detail.fouilles.push({ lib: 'Fouille en rigole (filante)', formule: `${semL} × ${prof} × ${round2(lin)}`, q: round2(out.volFouilles), u: 'm³' })
    out.detail.ba.push({ lib: 'BA semelle filante', formule: `${semL} × ${semH} × ${round2(lin)}`, q: round2(out.volBAsemelles), u: 'm³' })
    out.detail.ba.push({ lib: 'BA chaînage bas', formule: `0,20 × 0,20 × ${round2(lin)}`, q: round2(out.volBAchainages), u: 'm³' })
    if (lin > 0) {
      out.semellesFilantes.push({
        ref: 'Semelle filante', longueur: lin, largeur: semL, hauteur: semH, profFouille: prof, epProprete: eP,
        volFouille: out.volFouilles, volProprete: out.volProprete, volBA: out.volBAsemelles,
        volChainageBas: out.volBAchainages,
        acierKg: out.volBAsemelles * R.semelleFilante + out.volBAchainages * R.chainage, acierStatut: 'estime',
        remblaiIndicatif: remblaiIndic(out.volFouilles, out.volProprete, out.volBAsemelles + out.volBAchainages),
        materiaux: matBeton(out.volBAsemelles + out.volBAchainages, out.volProprete),
      })
    }
  }

  // Hérissonnage (commun, optionnel)
  if (f.herisson.actif) {
    out.surfHerisson = num(f.herisson.surface) > 0 ? num(f.herisson.surface) : emprise
    out.detail.divers.push({ lib: 'Hérissonnage en pierres sèches', formule: `${round2(out.surfHerisson)}`, q: round2(out.surfHerisson), u: 'm²' })
  }

  // Terrassement (Lot B) : foisonnement / tassement, réemploi / purge / apport explicites (voir `terrasser`).
  const enPlace = out.volProprete + out.volBAsemelles + out.volBAavantPoteaux
    + out.volBAchainages + out.volBAlongrines + out.volBAradier + out.volBanche + out.volMoellons
  const terr = terrasser({ vDeblaisPlace: out.volFouilles + out.volPleineMasse, vEnterre: enPlace, T: f.terrassement })
  out.terrassement = terr
  out.volDeblaisEvacuer = terr.evacuer
  out.volRemblaisApport = terr.apport
  out.volReemploi = terr.reemploi
  out.volRemblaiNonPourvu = terr.nonPourvu
  out.terrassementMode = terr.mode
  out.terrassementSol = f.terrassement.sol
  out.terrassementBloquant = !!f.terrassement.bloquant
  out.alertes = terr.alertes
  // Conservé pour compatibilité (anciens exports/PDF) : Vremblais_compacté, avant coefficient de tassement.
  out.volRemblai = terr.vRemblai

  // Détail par ouvrage : déblais évacués répartis au prorata des fouilles (indication ; le total fait foi).
  const vF = out.volFouilles + out.volPleineMasse
  const part = (v) => (vF > 0 ? v / vF : 0)
  ;[...out.semellesFilantes, ...out.semellesIsolees, ...out.rigoles].forEach((e) => {
    e.deblaisEvacuesIndicatif = terr.evacuer * part(e.volFouille)
  })
  return out
}
