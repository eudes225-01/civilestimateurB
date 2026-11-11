// @ts-check
// src/materiaux.js
// Liste des QUANTITÉS DE MATÉRIAUX (besoins chantier) — sortie distincte du DQE financier.
//
// La liste est TOUJOURS produite, quel que soit le mode de chiffrage (composé ou décomposé) : elle dit ce qu'il
// faut commander, pas ce qui est facturé. Chaque ligne porte : code, désignation, unité, quantité, formule,
// ouvrage source, niveau concerné, statut (calculé / estimé / à confirmer).
//
// Statuts :
//   calcule      quantité géométrique directe (blocs, volumes, surfaces, longueurs saisies)
//   estime       dépend d'une hypothèse (ratio d'acier, dosage ciment/granulats, volume de mortier/m², pertes)
//   a_confirmer  dépend d'une donnée absente, par défaut ou ambiguë (entraxe, sous-face, soubassement incomplet…)
import { num, round2, TYPES_MUR, CATEGORIES_MUR, DOSAGES, SAC_CIMENT_KG } from './constants.js'
import { codePrixPlancher } from './acier.js'

const DESIGNATIONS = {
  ciment_beton: 'Ciment pour béton (sacs de 50 kg)',
  ciment_mortier_pose: 'Ciment pour mortier de pose / joints (sacs de 50 kg)',
  ciment_enduit: 'Ciment pour enduits (sacs de 50 kg)',
  ciment_autres: 'Ciment pour autres ouvrages (banché, moellons…) (sacs de 50 kg)',
  sable_beton: 'Sable pour béton', sable_mortier: 'Sable pour mortier de pose / joints', sable_enduit: 'Sable pour enduits',
  gravier_beton: 'Gravier pour béton',
  mortier_pose: 'Mortier de pose (volume)',
  acier_ha: 'Acier HA (estimé par ratio)',
  coffrage: 'Coffrage',
  beton_proprete: 'Béton de propreté', beton_arme: 'Béton armé',
  beton_nervures: 'Béton des nervures', beton_table_compression: 'Béton de table de compression',
  poutrelles: 'Poutrelles', entrevous_15: 'Entrevous / hourdis 15 cm', entrevous_20: 'Entrevous / hourdis 20 cm',
  beton_banche: 'Gros béton banché', moellons: 'Moellons', arase: 'Arase étanche', herisson: 'Hérissonnage en pierres sèches',
  enduit_sous_face: 'Finition de sous-face (enduit / faux plafond)',
}
const designationSynthese = (code, repli) => (code.startsWith('bloc_') && TYPES_MUR[code.slice(5)]
  ? `${TYPES_MUR[code.slice(5)].lab} — blocs, pertes incluses` : (DESIGNATIONS[code] || repli))
const UNITES = { u: 'u', sac: 'sacs', m3: 'm³', m2: 'm²', ml: 'ml', kg: 'kg' }

/**
 * @param {Object} a
 * @param {Array}  a.parNiveau   résultats de metrerNiveau (valeurs non arrondies)
 * @param {Object} a.fondation   résultat de metrerFondation
 * @param {Object} a.acier       résultat de calculerAcier
 * @param {Object} [a.pignons]   { lignes: [{ nom, type, surf, nb }] } murs de pignon intégrés au métré
 * @param {Object} [a.p]         paramètres effectifs du projet
 * @param {Object} [a.formeDallage] forme de mortier ajoutée une seule fois au RDC
 * @param {string[]} [a.famillesAConfirmer] familles de matériaux rendues « à confirmer » par une exception ouverte
 */
export function construireMateriaux({ parNiveau = [], fondation = {}, acier = { lignes: [] }, pignons = null, formeDallage = {}, p = {}, famillesAConfirmer = [] }) {
  const lignes = []
  const push = (code, designation, unite, quantite, formule, ouvrage, niveau, statut, famille, extra = {}) => {
    if (!(quantite > 1e-9)) return
    lignes.push({ code, designation, unite: UNITES[unite] || unite, quantite: round2(quantite), quantiteExacte: quantite, formule, ouvrage, niveau, statut, famille, ...extra })
  }
  const des = (code, suffixe) => (suffixe ? `${DESIGNATIONS[code]} — ${suffixe}` : DESIGNATIONS[code])

  // Béton coulé d'un ouvrage → ciment / sable / gravier (dosage BA 350 kg/m³ ou propreté 150 kg/m³).
  const materiauxBeton = (vol, kind, ouvrage, niveau, famille) => {
    const d = DOSAGES[kind]
    const lib = kind === 'proprete' ? 'béton de propreté 150' : 'béton armé 350'
    push('ciment_beton', DESIGNATIONS.ciment_beton, 'sac', vol * d.cimentSacs, `${round2(vol)} m³ × ${d.cimentSacs} sacs/m³ (${lib})`, ouvrage, niveau, 'estime', famille)
    push('sable_beton', DESIGNATIONS.sable_beton, 'm3', vol * d.sableM3, `${round2(vol)} m³ × ${d.sableM3} m³/m³`, ouvrage, niveau, 'estime', famille)
    push('gravier_beton', DESIGNATIONS.gravier_beton, 'm3', vol * d.gravierM3, `${round2(vol)} m³ × ${d.gravierM3} m³/m³`, ouvrage, niveau, 'estime', famille)
  }
  const ba = (vol, ouvrage, niveau, famille, f = null) => {
    push('beton_arme', DESIGNATIONS.beton_arme, 'm3', vol, f || `volume de ${ouvrage}`, ouvrage, niveau, 'calcule', famille)
    materiauxBeton(vol, 'ba350', ouvrage, niveau, famille)
  }

  // ── Fondations ──────────────────────────────────────────────────────────────
  const FOND = 'Fondations'
  const elements = [
    ...(fondation.semellesFilantes || []).map((e) => ({ ouvrage: e.ref, vBA: e.volBA, vCh: e.volChainageBas, vBP: e.volProprete })),
    ...(fondation.semellesIsolees || []).map((e) => ({ ouvrage: `Semelles ${e.ref} (×${e.nb})`, vBA: e.volBA, vBP: e.volProprete })),
    ...(fondation.rigoles || []).map((e) => ({ ouvrage: `${e.type === 'chaînage' ? 'Chaînage bas' : 'Longrine'} ${e.ref}`, vBA: e.volBA, vBP: e.volProprete })),
    ...(fondation.radier ? [{ ouvrage: 'Radier général', vBA: fondation.radier.volBA, vBP: fondation.radier.volProprete }] : []),
  ]
  elements.forEach((e) => {
    if (e.vBP > 0) {
      push('beton_proprete', DESIGNATIONS.beton_proprete, 'm3', e.vBP, `volume de propreté de ${e.ouvrage}`, e.ouvrage, FOND, 'calcule', 'fondation')
      materiauxBeton(e.vBP, 'proprete', e.ouvrage, FOND, 'fondation')
    }
    if (e.vBA > 0) ba(e.vBA, e.ouvrage, FOND, 'fondation')
    if (e.vCh > 0) ba(e.vCh, `${e.ouvrage} — chaînage bas`, FOND, 'fondation')
  })
  if (fondation.volBAavantPoteaux > 0) ba(fondation.volBAavantPoteaux, 'Avant-poteaux', FOND, 'fondation')
  if (fondation.volBanche > 0) {
    push('beton_banche', DESIGNATIONS.beton_banche, 'm3', fondation.volBanche, 'volume banché sous longrines', 'Béton banché', FOND, 'calcule', 'fondation')
    push('ciment_autres', DESIGNATIONS.ciment_autres, 'sac', fondation.volBanche * DOSAGES.banche.cimentSacs, `${round2(fondation.volBanche)} m³ × ${DOSAGES.banche.cimentSacs} sacs/m³`, 'Béton banché', FOND, 'estime', 'fondation')
  }
  if (fondation.volMoellons > 0) {
    push('moellons', DESIGNATIONS.moellons, 'm3', fondation.volMoellons, 'volume de moellons sous chaînages', 'Maçonnerie de moellons', FOND, 'calcule', 'fondation')
    push('ciment_autres', DESIGNATIONS.ciment_autres, 'sac', fondation.volMoellons * DOSAGES.moellons.cimentSacs, `${round2(fondation.volMoellons)} m³ × ${DOSAGES.moellons.cimentSacs} sacs/m³`, 'Maçonnerie de moellons', FOND, 'estime', 'fondation')
  }
  if (fondation.surfArase > 0) push('arase', DESIGNATIONS.arase, 'm2', fondation.surfArase, 'surface d\'arase', 'Arase étanche', FOND, 'calcule', 'fondation')
  if (fondation.surfHerisson > 0) push('herisson', DESIGNATIONS.herisson, 'm2', fondation.surfHerisson, 'surface de hérissonnage', 'Hérissonnage', FOND, 'calcule', 'fondation')

  // Forme de dallage en mortier : volume indépendant du béton de la dalle, une seule fois au RDC.
  if (formeDallage.actif && formeDallage.volume > 0) {
    const v = formeDallage.volume
    const dosage = formeDallage.dosageKgM3 || 350
    const sableRatio = formeDallage.sableM3ParM3 || 1
    const cimentKg = v * dosage
    push('mortier_forme_dallage', 'Mortier pour forme de dallage', 'm3', v, `${round2(formeDallage.surface)} m² × ${formeDallage.epaisseur} m`, 'Forme de dallage', 'RDC', 'estime', 'formeDallage')
    push('ciment_forme_dallage', 'Ciment pour forme de dallage (sacs de 50 kg)', 'sac', cimentKg / SAC_CIMENT_KG, `${round2(v)} m³ × ${dosage} kg/m³ ÷ ${SAC_CIMENT_KG} kg/sac`, 'Forme de dallage', 'RDC', 'estime', 'formeDallage')
    push('sable_forme_dallage', 'Sable pour forme de dallage', 'm3', v * sableRatio, `${round2(v)} m³ de mortier × ${sableRatio} m³ de sable/m³`, 'Forme de dallage', 'RDC', 'estime', 'formeDallage')
    if (formeDallage.eauCimentRatio > 0) {
      push('eau_forme_dallage', 'Eau de gâchage pour forme de dallage', 'L', cimentKg * formeDallage.eauCimentRatio, `${round2(cimentKg)} kg de ciment × ${formeDallage.eauCimentRatio} L/kg`, 'Forme de dallage', 'RDC', 'estime', 'formeDallage')
    }
  }

  // ── Niveaux ─────────────────────────────────────────────────────────────────
  parNiveau.forEach((m, i) => {
    const niv = m.nom || `Niveau ${i}`
    // Maçonnerie par catégorie et type de bloc (soubassement inclus, sous sa propre catégorie).
    Object.entries(m.parCategorieMur || {}).forEach(([cat, c]) => {
      const sous = cat === 'soubassement'
      const famille = sous ? 'soubassement' : 'maconnerie'
      const ouvrage = CATEGORIES_MUR[cat]?.lab || cat
      Object.entries(c.types).forEach(([t, x]) => {
        push(`bloc_${t}`, `${TYPES_MUR[t].lab} — blocs, pertes incluses`, 'u', x.blocsExact,
          `${round2(x.surfNette)} m² × ${x.params.blocsM2} blocs/m² × (1 + ${x.params.pertesPct} %)`, ouvrage, niv, sous ? 'calcule' : 'calcule', famille, { epaisseur: x.ep })
        push('mortier_pose', DESIGNATIONS.mortier_pose, 'm3', x.mortierM3, x.formule, `${ouvrage} — ${TYPES_MUR[t].lab}`, niv, 'estime', famille)
        push('ciment_mortier_pose', DESIGNATIONS.ciment_mortier_pose, 'sac', x.cimentSacs, x.formule, `${ouvrage} — ${TYPES_MUR[t].lab}`, niv, 'estime', famille)
        push('sable_mortier', DESIGNATIONS.sable_mortier, 'm3', x.sableM3, `${round2(x.mortierM3)} m³ de mortier × ${num(p.mortier?.sableM3ParM3, 1)} m³ de sable/m³`, `${ouvrage} — ${TYPES_MUR[t].lab}`, niv, 'estime', famille)
      })
      // Enduits : élévation = enduit intérieur + extérieur ; soubassement = seulement l'enduit hydrofuge saisi.
      const surfEnd = sous ? (c.enduitHydrofuge || 0) : (c.enduitInt + c.enduitExt)
      if (surfEnd > 0) {
        const sacs = surfEnd * DOSAGES.enduit.cimentSacsM2
        push('ciment_enduit', DESIGNATIONS.ciment_enduit, 'sac', sacs, `${round2(surfEnd)} m² × ${DOSAGES.enduit.cimentSacsM2} sac/m²`, `Enduits — ${ouvrage}`, niv, 'estime', sous ? 'soubassement' : 'enduit')
        push('sable_enduit', DESIGNATIONS.sable_enduit, 'm3', (sacs * SAC_CIMENT_KG) / DOSAGES.enduit.dosageKgM3 * num(p.mortier?.sableM3ParM3, 1), `${round2(sacs)} sacs × 50 kg ÷ ${DOSAGES.enduit.dosageKgM3} kg/m³ de mortier`, `Enduits — ${ouvrage}`, niv, 'estime', sous ? 'soubassement' : 'enduit')
      }
    })
    // Béton armé d'élévation
    ;[
      ['Poteaux', m.volPoteaux], ['Poutres', m.volPoutres], ['Linteaux', m.volLinteaux], ['Chaînage haut', m.volChainageHaut],
      ['Voiles', m.volVoiles], ['Chaînages verticaux', m.volCV],
    ].forEach(([lib, v]) => { if (v > 0) ba(v, lib, niv, 'elevation') })
    ;[['poteaux', m.coffPoteaux], ['poutres', m.coffPoutres], ['voiles (2 faces)', m.coffVoiles]].forEach(([lib, v]) => {
      push('coffrage', des('coffrage', lib), 'm2', v, `développé de coffrage des ${lib}`, `Coffrage ${lib}`, niv, 'calcule', 'elevation')
    })

    // Plancher
    const pl = m.plancher
    if (pl && pl.typePlancher !== 'aucun') {
      const famille = 'plancher'
      const st = pl.statut === 'a_confirmer' ? 'a_confirmer' : null
      const oPl = `Plancher — ${pl.typePlancher}`
      if (pl.hauteurCorpsCreux != null) {
        const code = `entrevous_${pl.hauteurCorpsCreux}`
        push(code, DESIGNATIONS[code], 'u', pl.entrevous, pl.entrevousFormule, oPl, niv, st || (pl.entrevousFormule?.includes('S_hourdis') ? 'estime' : 'calcule'), famille)
        push('poutrelles', DESIGNATIONS.poutrelles, 'ml', pl.poutrellesL, pl.poutrellesFormule, oPl, niv, 'calcule', famille, { nombre: pl.poutrellesNb })
        if (pl.poutrellesL == null) lignes.push({ code: 'poutrelles', designation: DESIGNATIONS.poutrelles, unite: 'ml', quantite: 0, quantiteExacte: 0, formule: 'entraxe non saisi — non comptées', ouvrage: oPl, niveau: niv, statut: 'a_confirmer', famille })
        push('beton_nervures', DESIGNATIONS.beton_nervures, 'm3', pl.volNervures, 'surface × béton de nervures par m²', oPl, niv, 'estime', famille)
        push('beton_table_compression', DESIGNATIONS.beton_table_compression, 'm3', pl.volTable, 'surface × épaisseur de table', oPl, niv, 'calcule', famille)
        materiauxBeton(pl.vol, 'ba350', oPl, niv, famille)
        if (pl.surfSousFace > 0) push('enduit_sous_face', DESIGNATIONS.enduit_sous_face, 'm2', pl.surfSousFace, `finition « ${pl.finitionSousFace} »`, oPl, niv, pl.sousFace === 'apparent' ? 'a_confirmer' : 'calcule', famille)
      } else if (pl.vol > 0) {
        ba(pl.vol, oPl, niv, famille)
        if (pl.typePlancher === 'nervuree') {
          push('beton_nervures', DESIGNATIONS.beton_nervures, 'm3', pl.volNervures, 'nervures saisies', oPl, niv, 'calcule', famille)
          push('beton_table_compression', DESIGNATIONS.beton_table_compression, 'm3', pl.volTable, 'table saisie', oPl, niv, 'calcule', famille)
        }
      } else if (st) {
        lignes.push({ code: 'beton_arme', designation: DESIGNATIONS.beton_arme, unite: 'm³', quantite: 0, quantiteExacte: 0, formule: 'données manquantes — plancher non chiffré', ouvrage: oPl, niveau: niv, statut: 'a_confirmer', famille })
      }
      push('coffrage', des('coffrage', 'dalle, sous-face'), 'm2', pl.coffSousFace, pl.typePlancher === 'nervuree' ? 'fond + flancs de nervures' : 'surface nette de plancher suspendu', `Coffrage ${oPl}`, niv, 'calcule', famille)
      push('coffrage', des('coffrage', 'rives de dalle'), 'm2', pl.coffRives, `${pl.perimetre} m de périmètre × épaisseur`, `Coffrage rives — ${oPl}`, niv, 'calcule', famille)
    }
  })

  // Pignons (triangles sous toiture) intégrés au métré des murs
  ;(pignons?.lignes || []).forEach((g) => {
    const t = TYPES_MUR[g.type] ? g.type : 'agglo15'
    const x = g.mat
    if (!x) return
    push(`bloc_${t}`, `${TYPES_MUR[t].lab} — blocs, pertes incluses`, 'u', x.blocsExact, `${round2(g.surfTotale)} m² de pignon × ${x.params.blocsM2} blocs/m² × (1 + ${x.params.pertesPct} %)`, `Pignon — ${g.nom}`, 'Toiture (pignons)', 'estime', 'maconnerie')
    push('ciment_mortier_pose', DESIGNATIONS.ciment_mortier_pose, 'sac', x.cimentSacs, x.formule, `Pignon — ${g.nom}`, 'Toiture (pignons)', 'estime', 'maconnerie')
    push('sable_mortier', DESIGNATIONS.sable_mortier, 'm3', x.sableM3, `${round2(x.mortierM3)} m³ de mortier`, `Pignon — ${g.nom}`, 'Toiture (pignons)', 'estime', 'maconnerie')
    push('mortier_pose', DESIGNATIONS.mortier_pose, 'm3', x.mortierM3, x.formule, `Pignon — ${g.nom}`, 'Toiture (pignons)', 'estime', 'maconnerie')
    const sacs = 2 * g.surfTotale * DOSAGES.enduit.cimentSacsM2
    push('ciment_enduit', DESIGNATIONS.ciment_enduit, 'sac', sacs, `${round2(2 * g.surfTotale)} m² (2 faces) × ${DOSAGES.enduit.cimentSacsM2} sac/m²`, `Enduits — pignon ${g.nom}`, 'Toiture (pignons)', 'estime', 'enduit')
  })

  // Acier (estimé par ratio) et coffrage sont issus de calculerAcier / niveaux
  acier.lignes.forEach((l) => {
    push('acier_ha', DESIGNATIONS.acier_ha, 'kg', l.kg, `${l.formule} (ratio — pas un ferraillage détaillé)`, l.ouvrage, l.niveau || 'Projet', 'estime', l.niveau === FOND ? 'fondation' : (String(l.lib).startsWith('Dalle') || String(l.lib).startsWith('Plancher') ? 'plancher' : 'elevation'))
  })

  // Une donnée encore « à confirmer » (fondation par défaut, plancher sans surface…) rend à confirmer les matériaux de sa famille.
  const aConf = new Set(famillesAConfirmer)
  lignes.forEach((l) => { if (aConf.has(l.famille) && l.statut !== 'a_confirmer') l.statut = 'a_confirmer' })

  // Synthèse par code
  const ordre = new Map()
  lignes.forEach((l) => {
    const k = l.code
    const s = ordre.get(k) || { code: k, designation: designationSynthese(k, l.designation), unite: l.unite, quantiteExacte: 0, ouvrages: new Set(), niveaux: new Set(), statuts: new Set() }
    s.quantiteExacte += l.quantiteExacte
    s.ouvrages.add(l.ouvrage); s.niveaux.add(l.niveau); s.statuts.add(l.statut)
    ordre.set(k, s)
  })
  const unitesDiscretes = new Set(['u', 'sac', 'sacs'])
  const synthese = [...ordre.values()].map((s) => ({
    code: s.code, designation: s.designation, unite: s.unite,
    quantite: round2(s.quantiteExacte),
    quantiteCommande: unitesDiscretes.has(s.unite) || s.unite === 'kg' ? Math.ceil(s.quantiteExacte - 1e-9) : round2(s.quantiteExacte),
    ouvrages: [...s.ouvrages], niveaux: [...s.niveaux],
    statut: s.statuts.has('a_confirmer') ? 'a_confirmer' : s.statuts.has('estime') ? 'estime' : 'calcule',
    formule: 'somme des lignes détaillées',
  }))
  return { lignes, synthese }
}
