// src/fondations.js
// Fondations (A1) — trois systèmes, modélisés par éléments : filante /
// semelles isolées + longrines / radier, avec pleine masse, banché, moellons,
// arase et hérissonnage en options communes.
//
// Ces formules de volume sont figées par le test de référence (avant-métré
// manuel R+2 Fès, test/reference-r2.test.js) : elles ne sont PAS modifiées par
// l'intégration du Lot A. Les recommandations Lot A (contrainte admissible →
// type de fondation, profondeurs d'ancrage et débords de travail suggérés)
// vivent dans fondationsLotA.js et n'agissent qu'en amont, comme aide à la
// saisie — jamais en changeant automatiquement un résultat déjà calculé.
import { num, round2, FONDATION_DEFAUT } from './constants.js'

export function metrerFondation(fRaw = {}, ctx = {}) {
  const f = { ...FONDATION_DEFAUT, ...fRaw,
    pleineMasse: { ...FONDATION_DEFAUT.pleineMasse, ...(fRaw.pleineMasse || {}) },
    banche: { ...FONDATION_DEFAUT.banche, ...(fRaw.banche || {}) },
    moellons: { ...FONDATION_DEFAUT.moellons, ...(fRaw.moellons || {}) },
    herisson: { ...FONDATION_DEFAUT.herisson, ...(fRaw.herisson || {}) },
    terrassement: { ...FONDATION_DEFAUT.terrassement, ...(fRaw.terrassement || {}) },
  }
  const out = {
    type: f.type,
    volPleineMasse: 0, volFouilles: 0, volProprete: 0,
    volBAsemelles: 0, volBAavantPoteaux: 0, volBAchainages: 0, volBAlongrines: 0, volBAradier: 0,
    volBanche: 0, volMoellons: 0, surfArase: 0, surfHerisson: 0, volRemblai: 0,
    lineaireFonde: 0,
    detail: { fouilles: [], proprete: [], ba: [], divers: [] },
  }
  const emprise = num(ctx.emprise)

  // Fouille en pleine masse (commune, optionnelle)
  if (f.pleineMasse.actif) {
    const S = num(f.pleineMasse.surface) > 0 ? num(f.pleineMasse.surface) : emprise
    out.volPleineMasse = round2(S * num(f.pleineMasse.prof, 0.5))
    out.detail.fouilles.push({ lib: 'Fouille en pleine masse', formule: `${round2(S)} × ${f.pleineMasse.prof}`, q: out.volPleineMasse, u: 'm³' })
  }

  if (f.type === 'radier') {
    const S = emprise
    out.volBAradier = round2(S * num(f.epRadier, 0.3))
    out.volProprete = round2(S * num(f.epProprete, 0.05))
    out.volFouilles = round2(S * num(f.profFouille, 0.6))
    out.detail.fouilles.push({ lib: 'Fouille sous radier', formule: `${round2(S)} × ${f.profFouille}`, q: out.volFouilles, u: 'm³' })
    out.detail.ba.push({ lib: 'Radier général BA', formule: `${round2(S)} × ${f.epRadier}`, q: out.volBAradier, u: 'm³' })
  } else if (f.type === 'isolees') {
    // Semelles isolées
    ;(f.semelles || []).forEach((s) => {
      const nb = num(s.nb, 1) || 1, L = num(s.L), l = num(s.l)
      if (L <= 0 || l <= 0) return
      const prof = num(s.prof, num(f.profFouille, 1.5))
      const h = num(s.h, num(f.semH, 0.3))
      const vF = round2(nb * L * l * prof)
      const Lba = num(s.Lba, L), lba = num(s.lba, l)
      const vBA = round2(nb * Lba * lba * h)
      const vBP = round2(nb * L * l * num(f.epProprete, 0.1))
      out.volFouilles += vF; out.volBAsemelles += vBA; out.volProprete += vBP
      const tag = s.type ? ` ${s.type}` : ''
      out.detail.fouilles.push({ lib: `Fouille semelles${tag}`, formule: `${nb} × ${L} × ${l} × ${prof}`, q: vF, u: 'm³' })
      out.detail.ba.push({ lib: `BA semelles${tag}`, formule: `${nb} × ${Lba} × ${lba} × ${h}`, q: vBA, u: 'm³' })
      out.detail.proprete.push({ lib: `Propreté semelles${tag}`, formule: `${nb} × ${L} × ${l} × ${f.epProprete}`, q: vBP, u: 'm³' })
    })
    // Avant-poteaux
    ;(f.avantPoteaux || []).forEach((ap) => {
      const nb = num(ap.nb, 1) || 1, a = num(ap.a), b = num(ap.b), H = num(ap.H)
      if (a <= 0 || b <= 0 || H <= 0) return
      const v = round2(nb * a * b * H)
      out.volBAavantPoteaux += v
      out.detail.ba.push({ lib: 'BA avant-poteaux', formule: `${nb} × ${a} × ${b} × ${H}`, q: v, u: 'm³' })
    })
    // Chaînages / longrines : fouilles (rigoles) + BA + ouvrages associés
    const rigole = (lst, nomG, bFDef) => {
      let lin = 0
      ;(lst || []).forEach((c) => {
        const nb = num(c.nb, 1) || 1, L = num(c.L)
        if (L <= 0) return
        lin += nb * L
        const bF = num(c.bF, bFDef)
        const prof = num(c.prof, num(f.profFouille, 1.5))
        const vF = round2(nb * L * bF * prof)
        out.volFouilles += vF
        out.detail.fouilles.push({ lib: `Fouille rigole ${nomG}${c.nom ? ` — ${c.nom}` : ''}`, formule: `${nb} × ${L} × ${bF} × ${prof}`, q: vF, u: 'm³' })
        const vBP = round2(nb * L * bF * num(f.epProprete, 0.1))
        out.volProprete += vBP
        out.detail.proprete.push({ lib: `Propreté ${nomG}${c.nom ? ` — ${c.nom}` : ''}`, formule: `${nb} × ${L} × ${bF} × ${f.epProprete}`, q: vBP, u: 'm³' })
        const b = num(c.b, 0.2), h = num(c.h, 0.2)
        const vBA = round2(nb * L * b * h)
        if (nomG === 'chaînage') out.volBAchainages += vBA
        else out.volBAlongrines += vBA
        out.detail.ba.push({ lib: `BA ${nomG}${c.nom ? ` — ${c.nom}` : ''}`, formule: `${nb} × ${L} × ${b} × ${h}`, q: vBA, u: 'm³' })
        // Ouvrages associés
        if (nomG === 'longrine' && f.banche.actif) {
          const vB = round2(nb * L * num(f.banche.b, 0.4) * num(f.banche.h, 0.95))
          out.volBanche += vB
          out.detail.divers.push({ lib: `Béton banché — ${c.nom || 'longrine'}`, formule: `${nb} × ${L} × ${f.banche.b} × ${f.banche.h}`, q: vB, u: 'm³' })
          if (f.arase) out.surfArase += round2(nb * L * num(f.banche.b, 0.4))
        }
        if (nomG === 'chaînage' && f.moellons.actif) {
          const vM = round2(nb * L * num(f.moellons.b, 0.5) * num(f.moellons.h, 1.25))
          out.volMoellons += vM
          out.detail.divers.push({ lib: `Moellons — ${c.nom || 'chaînage'}`, formule: `${nb} × ${L} × ${f.moellons.b} × ${f.moellons.h}`, q: vM, u: 'm³' })
          if (f.arase) out.surfArase += round2(nb * L * num(f.moellons.b, 0.5))
        }
      })
      return lin
    }
    out.lineaireFonde = round2(rigole(f.chainages, 'chaînage', 0.6) + rigole(f.longrines, 'longrine', 0.6))
  } else {
    // ── filante (défaut / legacy) ──
    const lin = num(f.lineaire) > 0 ? num(f.lineaire) : num(ctx.LdevPorteurs)
    const semL = num(f.semL, 0.4), semH = num(f.semH, 0.2), prof = num(f.profFouille, 0.6)
    out.lineaireFonde = round2(lin)
    out.volFouilles = round2(semL * prof * lin)
    out.volProprete = round2(semL * num(f.epProprete, 0.05) * lin)
    out.volBAsemelles = round2(semL * semH * lin)
    out.volBAchainages = round2(0.20 * 0.20 * lin)
    out.detail.fouilles.push({ lib: 'Fouille en rigole (filante)', formule: `${semL} × ${prof} × ${round2(lin)}`, q: out.volFouilles, u: 'm³' })
    out.detail.ba.push({ lib: 'BA semelle filante', formule: `${semL} × ${semH} × ${round2(lin)}`, q: out.volBAsemelles, u: 'm³' })
    out.detail.ba.push({ lib: 'BA chaînage bas', formule: `0,20 × 0,20 × ${round2(lin)}`, q: out.volBAchainages, u: 'm³' })
  }

  // Hérissonnage (commun, optionnel)
  if (f.herisson.actif) {
    out.surfHerisson = round2(num(f.herisson.surface) > 0 ? num(f.herisson.surface) : emprise)
    out.detail.divers.push({ lib: 'Hérissonnage en pierres sèches', formule: `${out.surfHerisson}`, q: out.surfHerisson, u: 'm²' })
  }

  // Terrassement (Lot B) : foisonnement / tassement, remplace l'ancien
  // volRemblai unique. Porté depuis civilestimateurF.
  const enPlace = out.volProprete + out.volBAsemelles + out.volBAavantPoteaux
    + out.volBAchainages + out.volBAlongrines + out.volBAradier + out.volBanche + out.volMoellons
  //   Vdéblais_place      = volume excavé en place (fouilles + pleine masse)
  //   Vdéblais_évacuer    = Vdéblais_place × Cf (foisonné, volume à camionner)
  //   Vremblais_compacté  = Vdéblais_place − Vouvrages_enterrés (vide autour des ouvrages)
  //   Vremblais_apport    = Vremblais_compacté × Cp (matériau brut à commander)
  // Cas bloquant (argiles noires/vases, Cp non applicable) : purge totale
  // (tout le déblai est évacué) + apport extérieur chiffré avec le Cp du sable
  // (matériau de substitution type indiqué par le document Lot B).
  const T = f.terrassement
  const vDeblaisPlace = out.volFouilles + out.volPleineMasse
  out.volDeblaisEvacuer = round2(vDeblaisPlace * num(T.cf, 1.25))
  const vRemblaisCompacte = Math.max(0, vDeblaisPlace - enPlace)
  out.volRemblaisApport = T.bloquant
    ? round2(vRemblaisCompacte * 1.10) // Cp "Sable / Gravier" — matériau de substitution
    : round2(vRemblaisCompacte * num(T.cp, 1.15))
  out.terrassementSol = T.sol
  out.terrassementBloquant = !!T.bloquant
  // Conservé pour compatibilité (anciens exports/PDF) : correspond à
  // Vremblais_compacté, avant application du coefficient de foisonnement/tassement.
  out.volRemblai = round2(vRemblaisCompacte)

  out.volFouilles = round2(out.volFouilles)
  out.volProprete = round2(out.volProprete)
  out.volBAsemelles = round2(out.volBAsemelles)
  out.volBAavantPoteaux = round2(out.volBAavantPoteaux)
  out.volBAchainages = round2(out.volBAchainages)
  out.volBAlongrines = round2(out.volBAlongrines)
  out.volBanche = round2(out.volBanche)
  out.volMoellons = round2(out.volMoellons)
  out.surfArase = round2(out.surfArase)
  return out
}
