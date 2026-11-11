// src/dqe.js
// DQE — postes par lots, un prix par type d'ouvrage, détail traçable (A9).
import { round2, TVA, TYPES_MUR, MODES_CHIFFRAGE, MODE_CHIFFRAGE_DEFAUT, K_BORNES, DOSAGES, CATEGORIES_MUR } from './constants.js'
import { PRIX, PRIX_VERSION, PRIX_DATE } from '../data/prix.js'
import { validerPrix } from './schema.js'
import { APPAREILS_SANITAIRES, RESEAUX_PLOMBERIE } from './plomberie.js'

// ── Surface de panneau de mur sous toiture (pignon) — Lot C ──
// Formule : S = h×(L1+L2) + (L1²×P1)/2 + (L2²×P2)/2
//   h  = hauteur du mur jusqu'à l'égout de toiture
//   L1, L2 = largeurs horizontales de chaque versant jusqu'au faîtage
//   P1, P2 = pentes des versants (P = tan(angle), sans unité)
// Cas particuliers : pente unique → L2=0 (S = h×L1 + L1²×P1/2) ;
// double pente symétrique (L1=L2, P1=P2=P) → S = 2×h×L1 + L1²×P.
//
// Moteur v3 : les triangles de pignon sont désormais branchés au métré des murs (projet.js) dès que le plan de
// toiture fournit les pignons (plans.toiture.pignons : L1, P1…, voir toiture.js → surfaceTrianglesPignon). Cette
// fonction (panneau complet, rectangle + triangles) reste exportée pour les calculs autonomes.
export function surfacePignon({ h = 0, L1 = 0, L2 = 0, P1 = 0, P2 = 0 } = {}) {
  const num = (v) => (v === '' || v === null || v === undefined || isNaN(+v) ? 0 : +v)
  const H = num(h), l1 = num(L1), l2 = num(L2), p1 = num(P1), p2 = num(P2)
  return round2(H * (l1 + l2) + (l1 * l1 * p1) / 2 + (l2 * l2 * p2) / 2)
}

// Composants (acier, coffrage, granulats, ciment…) COMPRIS dans le prix composé d'un code (cf. data/prix.js → `inclut`).
const PRIX_PAR_CODE = Object.fromEntries(PRIX.map((x) => [x.code, x]))

/**
 * DQE financier. Le mode de chiffrage (`opts.modeChiffrage` > `totaux.modeChiffrage` > « compose ») garantit
 * qu'un même composant n'est JAMAIS facturé deux fois :
 *
 *  • compose   : chaque ouvrage béton armé est facturé à son prix composé COMPLET (béton + acier + coffrage +
 *                main-d'œuvre). Acier, coffrage, ciment et granulats de ces ouvrages sont listés dans `inclus`
 *                (non facturés en plus). Seuls restent facturés à part les composants que le prix de l'ouvrage
 *                ne comprend pas (acier des planchers à corps creux « hors acier », rives d'une dalle sur terre-plein).
 *  • decompose : les ouvrages béton sont facturés en « mise en œuvre seule » (`beton_mo`) et leurs composants
 *                séparément : ciment, sable, gravier, acier, coffrage. Le prix composé n'est plus facturé.
 *                Les postes composés par nature (maçonnerie, planchers à corps creux, banché, moellons,
 *                enduits, couverture) restent à leur prix composé dans les deux modes.
 *
 * Arrondis : le DQE facture la quantité AFFICHÉE (2 décimales) × un prix unitaire entier en FCFA ; chaque
 * montant est un entier et le total HT la somme des montants (règle documentée dans le README).
 *
 * @param {Object} totaux  sortie de metrerProjet().totaux
 * @param {Object} prixMap { code → prix de base HT (avant K) }
 * @param {number} K       coefficient (aléas + frais généraux + bénéfice)
 * @param {{ modeChiffrage?: 'compose'|'decompose', autoriserKHorsBornes?: boolean, couverture?: Object, inclut?: Object<string,string[]> }} [opts]
 */
export function buildDQE(totaux, prixMap = {}, K = 1.30, opts = {}) {
  const t = totaux
  const f = t.fondation || {}
  const mode = MODES_CHIFFRAGE[opts.modeChiffrage] ? opts.modeChiffrage : (MODES_CHIFFRAGE[t.modeChiffrage] ? t.modeChiffrage : MODE_CHIFFRAGE_DEFAUT)
  const decompose = mode === 'decompose'
  // Périmètre d'un prix : surcharge `opts.inclut` (issue de prix.json) > base du moteur.
  const comprend = (code, composant) => (opts.inclut?.[code] ?? PRIX_PAR_CODE[code]?.inclut ?? []).includes(composant)

  // ── Validation stricte : prix ≥ 0, K borné (ou explicitement autorisé) ──
  const alertes = []
  validerPrix(prixMap).forEach((e) => alertes.push({ niveau: 'bloquante', msg: e.msg }))
  if (!(Number.isFinite(+K) && +K > 0)) alertes.push({ niveau: 'bloquante', msg: `Coefficient K invalide (${K}).` })
  else if (!opts.autoriserKHorsBornes && (+K < K_BORNES.min || +K > K_BORNES.max)) alertes.push({ niveau: 'bloquante', msg: `Coefficient K = ${K} hors des bornes admises [${K_BORNES.min} ; ${K_BORNES.max}] — corrigez-le ou autorisez-le explicitement.` })
  const Kok = Number.isFinite(+K) && +K > 0 ? +K : 1
  const px = (k) => { const v = +prixMap[k]; return Number.isFinite(v) && v > 0 ? v : 0 }

  const lignes = []
  const inclus = [] // composants métrés mais NON facturés en plus (déjà compris dans un prix composé)
  const L = (n, des, u, q, code, detail, extra = {}) => { if (q > 0) lignes.push({ n, des, u, q: round2(q), code, detail, ...extra }) }
  const I = (des, u, q, dans) => { if (q > 0) inclus.push({ des, u, q: round2(q), inclusDans: dans }) }
  // Poste béton : prix composé (compose) ou mise en œuvre seule (décomposé).
  const LB = (n, des, q, code, detail) => {
    if (decompose) L(n, `${des} — mise en œuvre seule (ciment, granulats, acier, coffrage chiffrés à part)`, 'm³', q, 'beton_mo', detail)
    else L(n, des, 'm³', q, code, detail)
  }

  // 1 — Terrassement (réemploi / purge / apport : voir fondations.js → terrasser)
  L('1.1', 'Fouille en pleine masse', 'm³', t.volPleineMasse, 'fouille_pm', (f.detail?.fouilles || []).filter((d) => /pleine masse/i.test(d.lib)))
  L('1.2', 'Fouilles en puits, rigoles ou tranchées', 'm³', f.volFouilles, '6019…1676', (f.detail?.fouilles || []).filter((d) => !/pleine masse/i.test(d.lib)))
  L('1.3', 'Évacuation des déblais (foisonnement)', 'm³', t.volDeblaisEvacuer, 'evacuation_deblais')
  L('1.4', t.terrassementMode === 'purge' ? 'Remblai — apport extérieur (purge de sol impropre)' : 'Remblai — apport de matériau (compactage)', 'm³', t.volRemblaisApport, 'remblai_apport')
  if (t.volReemploi > 0) I('Remblai avec terres excavées réemployées (aucun apport ni évacuation pour ce volume)', 'm³', t.volReemploi, 'réemploi des déblais (1.2)')

  // 2 — Fondations
  LB('2.1', 'Béton de propreté dosé 150 kg/m³', t.volProprete, '6019…1198', f.detail?.proprete)
  LB('2.2', 'Béton armé fondations 350 kg/m³ (semelles + avant-poteaux)', t.volSemelle, '6019…1195',
    (f.detail?.ba || []).filter((d) => /semelle|avant-poteau|filante/i.test(d.lib)))
  LB('2.3', 'Béton armé chaînages & longrines 350 kg/m³', t.volChainageBas, '6019…1195',
    (f.detail?.ba || []).filter((d) => /cha[îi]nage|longrine/i.test(d.lib)))
  LB('2.4', 'Radier général BA 350 kg/m³', f.volBAradier, 'radier', (f.detail?.ba || []).filter((d) => /radier/i.test(d.lib)))
  L('2.5', 'Gros béton banché', 'm³', t.volBanche, 'banche', (f.detail?.divers || []).filter((d) => /banché/i.test(d.lib)))
  L('2.6', 'Maçonnerie de moellons en fondation', 'm³', t.volMoellons, 'moellons', (f.detail?.divers || []).filter((d) => /moellons/i.test(d.lib)))
  L('2.7', 'Arase étanche', 'm²', t.surfArase, 'arase')
  L('2.8', 'Hérissonnage en pierres sèches', 'm²', t.surfHerisson, 'herisson')

  // 3 — Structure en élévation (A2)
  const detNiv = (key) => (t.parNiveau || []).flatMap((m) => (m.detail?.[key] || []).map((d) => ({ ...d, lib: `${m.nom || 'Niveau'} — ${d.lib}` })))
  LB('3.1', 'Béton armé poteaux & raidisseurs 350 kg/m³', t.volPoteaux, 'ba_elevation', detNiv('poteaux'))
  LB('3.2', 'Béton armé poutres 350 kg/m³', t.volPoutres, 'ba_elevation', detNiv('poutres'))
  LB('3.3', 'Linteaux en béton armé', t.volLinteaux, 'ba_elevation', detNiv('linteaux'))
  LB('3.4', 'Chaînages hauts (ceintures) en béton armé', t.volChainageHaut, 'ba_elevation', detNiv('chainageHaut'))
  LB('3.5', 'Béton armé voiles 350 kg/m³', t.volVoiles, 'ba_elevation', detNiv('voiles'))
  LB('3.6', 'Chaînages verticaux en béton armé', t.volCV, 'ba_elevation', detNiv('chainagesV'))

  // 4 — Planchers (A3), regroupés par ouvrage (code de prix)
  const pls = t.planchers || []
  const somme = (pred, cle) => pls.filter(pred).reduce((s, m) => s + (m[cle] || 0), 0)
  const detPl = (pred) => pls.filter(pred).flatMap((m) => (m.detail || []).map((d) => ({ ...d, lib: `${m.niveau || 'Niveau'} — ${d.lib}` })))
  const dp = (m) => m.typePlancher === 'dallePleine' || m.typePlancher === 'nervuree'
  LB('4.1', 'Dalle pleine / nervurée BA 350 kg/m³', somme(dp, 'vol'), '6019…2376', detPl(dp))
  const cc = (h) => (m) => m.hauteurCorpsCreux === h
  const libSF = (h) => {
    const sf = [...new Set(pls.filter(cc(h)).map((m) => m.sousFace))]
    return sf.length === 1 && sf[0] === 'apparent' ? ', poutrelles apparentes' : sf.length === 1 && sf[0] === 'plan' ? ', sous-face plane' : ''
  }
  L('4.2', `Plancher corps creux 15+5 (poutrelles + entrevous + table de compression${libSF(15)})`, 'm²', somme(cc(15), 'surfNette'), 'plancher_h15', detPl(cc(15)))
  L('4.3', `Plancher corps creux 20+5 (poutrelles + entrevous + table de compression${libSF(20)})`, 'm²', somme(cc(20), 'surfNette'), 'plancher_h20', detPl(cc(20)))
  const tp = (m) => m.typePlancher === 'dalleTP'
  LB('4.4', 'Dalle sur terre-plein (sans coffrage de sous-face)', somme(tp, 'vol'), 'dalle_tp', detPl(tp))
  L('4.5', 'Forme de dallage en mortier de ciment (RDC)', 'm³', t.volFormeDallage, 'forme_dallage_mortier')
  L('4.6', 'Enduit de sous-face de plancher', 'm²', somme((m) => m.finitionSousFace === 'enduit', 'surfSousFace'), 'enduit_int')
  L('4.7', 'Faux plafond', 'm²', somme((m) => m.finitionSousFace === 'faux_plafond', 'surfSousFace'), 'faux_plafond')

  // 5 — Maçonnerie par type (A4) — élévation ; soubassement à part
  let i5 = 1
  Object.entries(t.parTypeMur || {}).forEach(([type, v]) => {
    const inf = TYPES_MUR[type]
    if (inf && v.surf > 0) L(`5.${i5++}`, `Maçonnerie — ${inf.lab}`, 'm²', v.surf, inf.code, v.detail)
  })
  const sb = t.soubassement
  if (sb) {
    Object.entries(sb.types || {}).forEach(([type, x]) => {
      if (x.surfNette > 0) L(`5.${i5++}`, `Maçonnerie de soubassement — ${TYPES_MUR[type]?.lab || type}`, 'm²', x.surfNette, 'mur_soubassement', sb.detail)
    })
    L(`5.${i5++}`, 'Enduit hydrofuge de soubassement', 'm²', sb.enduitHydrofuge, 'enduit_hydrofuge')
  }

  // 6 — Enduits / peinture (A6)
  L('6.1', 'Enduit intérieur au mortier de ciment', 'm²', t.enduitInt, 'enduit_int')
  L('6.2', 'Enduit extérieur au mortier de ciment', 'm²', t.enduitExt, 'enduit_ext')
  L('6.3', 'Peinture (faces enduites)', 'm²', round2((t.enduitInt || 0) + (t.enduitExt || 0)), '6019…2812')

  // 7 — Acier (A5) — estimation par ratios
  const acierParCode = t.acierParCode || {}
  if (decompose) {
    L('7.1', 'Aciers HA — estimation par ratios (ferraillage non détaillé), tous éléments', 'kg', t.acierKg, 'acierHA', t.acierDetail)
  } else {
    let factur = 0, dedans = 0
    Object.entries(acierParCode).forEach(([code, kg]) => { if (comprend(code, 'acier')) dedans += kg; else factur += kg })
    L('7.1', 'Aciers HA des planchers à corps creux — estimation (prix de plancher « hors acier »)', 'kg', Math.round(factur), 'acierHA',
      (t.acierDetail || []).filter((d) => /Planchers/.test(d.lib)))
    I('Aciers HA des ouvrages en béton armé — estimation par ratios', 'kg', dedans, 'prix composés du béton armé (2.x, 3.x, 4.1, 4.4)')
  }

  // 8 — Couverture (formule affichée = formule appliquée)
  L('8.1', `Couverture — ${t.toiture?.lab || 'toiture'}`, 'm²', t.surfToiture, t.toiture?.code || 'toit_bac', t.toitureCalcul?.detail)
  L('8.2', 'Faîtière (faîtage)', 'ml', t.toitureDetail?.faitageL, 'toit_faitiere')
  L('8.3', 'Noues', 'ml', t.toitureDetail?.noueL, 'toit_noue')
  L('8.4', 'Chéneaux / gouttières', 'ml', t.toitureDetail?.cheneauL, 'toit_cheneau')

  // 9 — Ciment et granulats du béton. Base : tout le béton SAUF celui des planchers à corps creux (compris dans leur prix).
  const vBeton = t.volBetonDecomposable ?? t.volBA ?? 0
  const sable = ((t.volProprete || 0) + vBeton) * DOSAGES.ba350.sableM3
  const gravier = ((t.volProprete || 0) + vBeton) * DOSAGES.ba350.gravierM3
  const cimentB = vBeton * DOSAGES.ba350.cimentSacs + (t.volProprete || 0) * DOSAGES.proprete.cimentSacs
  if (decompose) {
    L('9.1', 'Ciment pour béton (CEM II 32.5, sacs de 50 kg)', 'sac', Math.ceil(cimentB - 1e-9), 'ciment50')
    L('9.2', 'Sable pour béton (propreté + béton armé)', 'm³', sable, 'sable')
    L('9.3', 'Gravier pour béton (propreté + béton armé)', 'm³', gravier, 'gravier')
  } else {
    I('Ciment pour béton (sacs de 50 kg)', 'sac', Math.ceil(cimentB - 1e-9), 'prix composés du béton (2.x, 3.x, 4.x)')
    I('Sable pour béton', 'm³', sable, 'prix composés du béton')
    I('Gravier pour béton', 'm³', gravier, 'prix composés du béton')
  }

  // 10 — Coffrage. Sous-face : planchers SUSPENDUS uniquement ; jamais sous une dalle sur terre-plein.
  const cof = t.coffrageParCode || {}
  if (decompose) {
    L('10.1', 'Coffrage poteaux', 'm²', t.coffPoteaux, 'coffrage_poteau')
    L('10.2', 'Coffrage poutres', 'm²', t.coffPoutres, 'coffrage_poutre')
    L('10.3', 'Coffrage dalle suspendue (sous-face — hors rives)', 'm²', t.coffDalle, 'coffrage_dalle')
    L('10.4', 'Coffrage voiles (2 faces)', 'm²', t.coffVoiles, 'coffrage_voile')
    L('10.5', 'Coffrage de rives de dalle', 'm²', t.coffRives, 'coffrage_rive')
  } else {
    const horsPrix = Object.entries(cof).filter(([c]) => !comprend(c, 'coffrage')).reduce((s, [, v]) => s + v, 0)
    L('10.5', 'Coffrage de rives de dalle (non compris dans le prix de la dalle)', 'm²', horsPrix, 'coffrage_rive')
    I('Coffrage poteaux, poutres, voiles, dalles suspendues', 'm²', (t.coffPoteaux || 0) + (t.coffPoutres || 0) + (t.coffVoiles || 0) + (t.coffDalle || 0) + (t.coffRives || 0) - horsPrix, 'prix composés du béton armé (3.x, 4.1)')
  }

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
    const pu = Math.round(px(l.code) * Kok)
    const base = PRIX_PAR_CODE[l.code]
    // « estimé » : prix par défaut de la base marqué estime et non modifié par l'utilisateur.
    const estime = !!base?.estime && px(l.code) === base.bi
    return { ...l, pu, montant: Math.round(l.q * pu), ...(estime ? { estime: true } : {}) }
  })
  const ht = lignesPU.reduce((s, l) => s + l.montant, 0)
  const tva = Math.round(ht * TVA)
  // Postes métrés mais sans prix (0 FCFA) : ils n'ajoutent rien au total, qui paraît alors complet alors qu'il ne l'est pas.
  const sansPrix = lignesPU.filter((l) => l.pu <= 0).map(({ n, des, u, q, code }) => ({ n, des, u, q, code }))
  const estimes = lignesPU.filter((l) => l.estime).map(({ n, des, code, montant }) => ({ n, des, code, montant }))

  // « Complet » n'est jamais affiché si un poste est sans prix, estimé, exclu ou à confirmer.
  const raisons = []
  if (sansPrix.length) raisons.push(`${sansPrix.length} poste(s) sans prix`)
  if (estimes.length) raisons.push(`${estimes.length} poste(s) à prix estimé par défaut`)
  if ((t.soubassementACompleter || []).length) raisons.push('soubassement incomplet (dimensions à compléter)')
  if ((t.planchers || []).some((m) => m.statut === 'a_confirmer')) raisons.push('plancher à confirmer (données manquantes)')
  const ouverts = (opts.couverture?.aConfirmer || []).filter((x) => x.etat === 'a_confirmer')
  if (ouverts.length) raisons.push(`${ouverts.length} donnée(s) à confirmer`)
  if (lignesPU.some((l) => l.code === 'acierHA')) raisons.push('acier facturé sur estimation par ratios (pas de ferraillage détaillé)')
  if (t.terrassementMode === 'evacuation' && t.volRemblaiNonPourvu > 0) raisons.push('remblai non pourvu')
  if (t.formeDallage?.actif && t.volFormeDallage > 0 && !t.formeDallage.eauCimentRatio) raisons.push('ratio eau/ciment de la forme de dallage non renseigné')
  const bloquant = alertes.some((a) => a.niveau === 'bloquante')
  const complet = raisons.length === 0 && !bloquant

  const hors = ['assainissement', 'étanchéité détaillée', 'revêtements', 'menuiseries',
    ...(t.plomberie ? [] : ['plomberie']), ...(t.electricite ? [] : ['électricité'])]
  const inclusPerim = [t.plomberie && 'plomberie', t.electricite && 'électricité'].filter(Boolean)
  const perimetre = `DQE gros œuvre (terrassement → ${t.toitureAbsente ? 'toit-dalle' : 'couverture'})${inclusPerim.length ? ` + ${inclusPerim.join(' et ')} (décompte sur plan)` : ''} — mode « ${MODES_CHIFFRAGE[mode].lab} ». `
    + (decompose
      ? 'Béton, ciment, granulats, acier et coffrage chiffrés séparément ; maçonnerie, planchers à corps creux, banché, moellons, enduits et couverture restent à leur prix composé. '
      : 'Béton armé facturé à son prix composé complet (acier, coffrage et granulats compris, listés « inclus », non refacturés) ; acier des planchers à corps creux facturé à part. ')
    + `HORS SECOND ŒUVRE : ${hors.join(', ')} non compris. Les quantités de matériaux (liste de commande) sont fournies séparément.`

  return {
    mode, modeLabel: MODES_CHIFFRAGE[mode].lab,
    lignes: lignesPU, inclus, sansPrix, estimes,
    incomplet: sansPrix.length > 0,
    complet, statut: complet ? 'complet' : 'indicatif', raisonsIncomplet: raisons,
    libelleTotal: complet ? 'Total HT' : 'Total HT INDICATIF (postes estimés, incomplets ou à confirmer)',
    alertes, bloquant,
    ht, tva, ttc: ht + tva,
    K: Kok,
    baseDePrix: { version: PRIX_VERSION, date: PRIX_DATE },
    perimetre,
    hypotheses: t.hypotheses || [],
  }
}
