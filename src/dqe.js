// src/dqe.js
// DQE — postes par lots, un prix par type d'ouvrage, détail traçable (A9).
import { round2, TVA, TYPES_MUR } from './constants.js'

export function buildDQE(totaux, prixMap = {}, K = 1.30) {
  const px = (k) => prixMap[k] ?? 0
  const t = totaux
  const f = t.fondation || {}
  const lignes = []
  const L = (n, des, u, q, code, detail) => { if (q > 0) lignes.push({ n, des, u, q: round2(q), code, detail }) }

  // 1 — Terrassement
  L('1.1', 'Fouille en pleine masse', 'm³', t.volPleineMasse, 'fouille_pm', (f.detail?.fouilles || []).filter((d) => /pleine masse/i.test(d.lib)))
  L('1.2', 'Fouilles en puits, rigoles ou tranchées', 'm³', f.volFouilles, '6019…1676', (f.detail?.fouilles || []).filter((d) => !/pleine masse/i.test(d.lib)))
  L('1.3', 'Mise en remblai ou évacuation des terres', 'm³', t.volRemblai, 'remblai')

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
  L('8.1', `Couverture — ${t.toiture?.lab || 'toiture'}`, 'm²', t.surfToiture, t.toiture?.code || 'toit_bac')

  const lignesPU = lignes.map((l) => {
    const pu = Math.round(px(l.code) * K)
    return { ...l, pu, montant: Math.round(l.q * pu) }
  })
  const ht = lignesPU.reduce((s, l) => s + l.montant, 0)
  return {
    lignes: lignesPU,
    ht, tva: Math.round(ht * TVA), ttc: Math.round(ht * (1 + TVA)),
    perimetre: 'DQE gros œuvre (terrassement → couverture) — HORS SECOND ŒUVRE : assainissement, étanchéité détaillée, revêtements, faux plafonds, plomberie, électricité et menuiseries non compris.',
  }
}
