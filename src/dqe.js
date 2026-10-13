// src/dqe.js
// DQE — postes par lots, un prix par type d'ouvrage, détail traçable (A9).
import { round2, TVA, TYPES_MUR } from './constants.js'
import { APPAREILS_SANITAIRES, RESEAUX_PLOMBERIE } from './plomberie.js'

// ── Surface de panneau de mur sous toiture (pignon) — Lot C ──
// Formule : S = h×(L1+L2) + (L1²×P1)/2 + (L2²×P2)/2
//   h  = hauteur du mur jusqu'à l'égout de toiture
//   L1, L2 = largeurs horizontales de chaque versant jusqu'au faîtage
//   P1, P2 = pentes des versants (P = tan(angle), sans unité)
// Cas particuliers : pente unique → L2=0 (S = h×L1 + L1²×P1/2) ;
// double pente symétrique (L1=L2, P1=P2=P) → S = 2×h×L1 + L1²×P.
//
// NON ENCORE BRANCHÉE au métré des murs (metrerMurs) : elle dépend des pentes
// de toiture par pan, une donnée pas encore saisissable dans l'interface
// (saisie des pentes de toiture, à ajouter côté frontend). Fonction prête à
// être appelée dès que cette saisie existera, sur le modèle d'un type de mur
// 'pignon' distinct des murs rectangulaires classiques. Porté depuis
// civilestimateurF pour ne pas perdre cette fonction lors de la bascule du
// frontend vers ce moteur partagé.
export function surfacePignon({ h = 0, L1 = 0, L2 = 0, P1 = 0, P2 = 0 } = {}) {
  const num = (v) => (v === '' || v === null || v === undefined || isNaN(+v) ? 0 : +v)
  const H = num(h), l1 = num(L1), l2 = num(L2), p1 = num(P1), p2 = num(P2)
  return round2(H * (l1 + l2) + (l1 * l1 * p1) / 2 + (l2 * l2 * p2) / 2)
}

export function buildDQE(totaux, prixMap = {}, K = 1.30) {
  const px = (k) => prixMap[k] ?? 0
  const t = totaux
  const f = t.fondation || {}
  const lignes = []
  const L = (n, des, u, q, code, detail) => { if (q > 0) lignes.push({ n, des, u, q: round2(q), code, detail }) }

  // 1 — Terrassement
  L('1.1', 'Fouille en pleine masse', 'm³', t.volPleineMasse, 'fouille_pm', (f.detail?.fouilles || []).filter((d) => /pleine masse/i.test(d.lib)))
  L('1.2', 'Fouilles en puits, rigoles ou tranchées', 'm³', f.volFouilles, '6019…1676', (f.detail?.fouilles || []).filter((d) => !/pleine masse/i.test(d.lib)))
  L('1.3', 'Évacuation des déblais (foisonnement)', 'm³', t.volDeblaisEvacuer, 'evacuation_deblais')
  L('1.4', 'Remblai — apport de matériau (compactage)', 'm³', t.volRemblaisApport, 'remblai_apport')

  // 2 — Fondations
  L('2.1', 'Béton de propreté dosé 150 kg/m³', 'm³', t.volProprete, '6019…1198', f.detail?.proprete)
  L('2.2', 'Béton armé fondations 350 kg/m³ (semelles + avant-poteaux)', 'm³', t.volSemelle, '6019…1195',
    (f.detail?.ba || []).filter((d) => /semelle|avant-poteau|filante/i.test(d.lib)))
  L('2.3', 'Béton armé chaînages & longrines 350 kg/m³', 'm³', t.volChainageBas, '6019…1195',
    (f.detail?.ba || []).filter((d) => /cha[îi]nage|longrine/i.test(d.lib)))
  L('2.4', 'Radier général BA 350 kg/m³', 'm³', f.volBAradier, 'radier', (f.detail?.ba || []).filter((d) => /radier/i.test(d.lib)))
  L('2.5', 'Gros béton banché', 'm³', t.volBanche, 'banche', (f.detail?.divers || []).filter((d) => /banché/i.test(d.lib)))
  L('2.6', 'Maçonnerie de moellons en fondation', 'm³', t.volMoellons, 'moellons', (f.detail?.divers || []).filter((d) => /moellons/i.test(d.lib)))
  L('2.7', 'Arase étanche', 'm²', t.surfArase, 'arase')
  L('2.8', 'Hérissonnage en pierres sèches', 'm²', t.surfHerisson, 'herisson')

  // 3 — Structure en élévation (A2)
  const detNiv = (key) => (t.parNiveau || []).flatMap((m) => (m.detail?.[key] || []).map((d) => ({ ...d, lib: `${m.nom || 'Niveau'} — ${d.lib}` })))
  L('3.1', 'Béton armé poteaux & raidisseurs 350 kg/m³', 'm³', t.volPoteaux, 'ba_elevation', detNiv('poteaux'))
  L('3.2', 'Béton armé poutres 350 kg/m³', 'm³', t.volPoutres, 'ba_elevation', detNiv('poutres'))
  L('3.3', 'Linteaux en béton armé', 'm³', t.volLinteaux, 'ba_elevation', detNiv('linteaux'))
  L('3.4', 'Chaînages hauts (ceintures) en béton armé', 'm³', t.volChainageHaut, 'ba_elevation', detNiv('chainageHaut'))
  L('3.5', 'Béton armé voiles 350 kg/m³', 'm³', t.volVoiles, 'ba_elevation', detNiv('voiles'))
  L('3.6', 'Chaînages verticaux en béton armé', 'm³', t.volCV, 'ba_elevation', detNiv('chainagesV'))

  // 4 — Planchers (A3), par type
  const parPl = (type, key) => round2((t.parNiveau || []).filter((m) => m.typePlancher === type).reduce((s, m) => s + m[key], 0))
  L('4.1', 'Dalle pleine BA 350 kg/m³', 'm³', parPl('dallePleine', 'volPlancher'), '6019…2376')
  L('4.2', 'Plancher hourdis 15+5 (corps creux + compression)', 'm²', parPl('hourdis15', 'surfHourdis'), 'plancher_h15')
  L('4.3', 'Plancher hourdis 20+5 (corps creux + compression)', 'm²', parPl('hourdis20', 'surfHourdis'), 'plancher_h20')
  L('4.4', 'Dalle sur terre-plein', 'm³', parPl('dalleTP', 'volPlancher'), 'dalle_tp')

  // 5 — Maçonnerie par type (A4)
  let i5 = 1
  Object.entries(t.parTypeMur || {}).forEach(([type, v]) => {
    const inf = TYPES_MUR[type]
    if (inf && v.surf > 0) L(`5.${i5++}`, `Maçonnerie — ${inf.lab}`, 'm²', v.surf, inf.code, v.detail)
  })

  // 6 — Enduits / peinture (A6)
  L('6.1', 'Enduit intérieur au mortier de ciment', 'm²', t.enduitInt, 'enduit_int')
  L('6.2', 'Enduit extérieur au mortier de ciment', 'm²', t.enduitExt, 'enduit_ext')
  L('6.3', 'Peinture (faces enduites)', 'm²', round2((t.enduitInt || 0) + (t.enduitExt || 0)), '6019…2812')

  // 7 — Acier (A5)
  L('7.1', 'Aciers HA (ferraillage, tous éléments)', 'kg', t.acierKg, 'acierHA', t.acierDetail)

  // 8 — Couverture
  L('8.1', `Couverture — ${t.toiture?.lab || 'toiture'}`, 'm²', t.surfToiture, t.toiture?.code || 'toit_bac',
    (t.toitureDetail?.detail || []).filter((d) => /surface/i.test(d.lib)))
  // Accessoires de couverture : uniquement si un plan de toiture a été lu.
  L('8.2', 'Faîtière (faîtage)', 'ml', t.toitureDetail?.faitageL, 'toit_faitiere')
  L('8.3', 'Noues', 'ml', t.toitureDetail?.noueL, 'toit_noue')
  L('8.4', 'Chéneaux / gouttières', 'ml', t.toitureDetail?.cheneauL, 'toit_cheneau')

  // 9 — Granulats (Lot B) — dosages béton propreté 150 + BA courant 350
  L('9.1', 'Sable pour béton (propreté + béton armé)', 'm³', t.volSable, 'sable')
  L('9.2', 'Gravier pour béton (propreté + béton armé)', 'm³', t.volGravier, 'gravier')

  // 10 — Coffrage (Lot B) — absent du moteur avant cette version
  L('10.1', 'Coffrage poteaux', 'm²', t.coffPoteaux, 'coffrage_poteau')
  L('10.2', 'Coffrage poutres', 'm²', t.coffPoutres, 'coffrage_poutre')
  L('10.3', 'Coffrage dalle (sous-face — hors jouées de rive)', 'm²', t.coffDalle, 'coffrage_dalle')
  L('10.4', 'Coffrage voiles (2 faces)', 'm²', t.coffVoiles, 'coffrage_voile')

  // 11 — Plomberie & assainissement (plan de plomberie lu) — décompte, prix à renseigner
  const pl = t.plomberie
  if (pl) {
    let i = 1
    Object.entries(pl.appareils || {}).forEach(([k, n]) => L(`11.${i++}`, `Appareil sanitaire — ${APPAREILS_SANITAIRES[k]?.lab || k} (fourni + posé)`, 'u', n, `san_${k}`))
    Object.entries(pl.reseaux || {}).forEach(([k, R]) => L(`11.${i++}`, `Canalisations ${k} — ${RESEAUX_PLOMBERIE[k]?.lab || k}`, 'ml', R.L, `canal_${k.toLowerCase()}`,
      Object.entries(R.parDiam).map(([d, l]) => ({ lib: d === 'n.c.' ? 'Ø non coté' : `Ø${d}`, formule: `${l} m`, q: l, u: 'ml' }))))
    L(`11.${i++}`, 'Regards de visite', 'u', pl.nbRegards, 'regard')
  }

  // 12 — Électricité (plan d'électricité lu) — décompte par symbole, prix à renseigner
  const el = t.electricite
  if (el) {
    const n = (k) => el.parType?.[k] || 0
    L('12.1', 'Points lumineux (fournis + posés)', 'u', n('point_lumineux'), 'elec_point_lum')
    L('12.2', 'Appareillage de commande (interrupteurs, va-et-vient, boutons poussoirs)', 'u', el.nbCommandes, 'elec_commande')
    L('12.3', 'Prises de courant 16 A', 'u', n('prise_16a'), 'elec_prise16')
    L('12.4', 'Prises spécialisées (circuits dédiés)', 'u', n('prise_specialisee'), 'elec_prise_spec')
    L('12.5', 'Prises RJ45 / VDI', 'u', n('rj45'), 'elec_rj45')
    L('12.6', 'Tableaux électriques (TGBT / TD)', 'u', el.nbTableaux, 'elec_tableau')
  }

  const lignesPU = lignes.map((l) => {
    const pu = Math.round(px(l.code) * K)
    return { ...l, pu, montant: Math.round(l.q * pu) }
  })
  const ht = lignesPU.reduce((s, l) => s + l.montant, 0)
  // Postes métrés mais sans prix (0 FCFA) : ils n'ajoutent rien au total, qui
  // paraît alors complet alors qu'il ne l'est pas. On les remonte explicitement.
  const sansPrix = lignesPU.filter((l) => l.pu <= 0).map(({ n, des, u, q, code }) => ({ n, des, u, q, code }))
  return {
    lignes: lignesPU,
    sansPrix,
    incomplet: sansPrix.length > 0,
    ht, tva: Math.round(ht * TVA), ttc: Math.round(ht * (1 + TVA)),
    perimetre: (() => {
      const hors = ['assainissement', 'étanchéité détaillée', 'revêtements', 'faux plafonds',
        ...(t.plomberie ? [] : ['plomberie']), ...(t.electricite ? [] : ['électricité']), 'menuiseries']
      const inclus = [t.plomberie && 'plomberie', t.electricite && 'électricité'].filter(Boolean)
      return `DQE gros œuvre (terrassement → couverture)${inclus.length ? ` + ${inclus.join(' et ')} (décompte sur plan)` : ''} — HORS SECOND ŒUVRE : ${hors.join(', ')} non compris.`
    })(),
  }
}
