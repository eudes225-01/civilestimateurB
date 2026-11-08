// @ts-check
// src/acier.js
// Acier HA — ESTIMATION par ratio (kg/m³ de béton, kg/m² pour les hourdis). Ce n'est PAS un ferraillage détaillé :
// tant qu'aucun plan de ferraillage n'est saisi, chaque ligne porte le statut « estimé » et le logiciel ne doit
// jamais être présenté comme une note de calcul de structure.
//
// Chaque ligne d'acier est rattachée au CODE DE PRIX de l'ouvrage porteur (`codePrix`) : c'est ce qui permet au
// DQE de savoir si l'acier est déjà inclus dans le prix composé de l'ouvrage (béton armé complet) ou s'il doit être
// facturé à part (plancher à corps creux « hors acier », mode décomposé).
import { num, round2, RATIOS_ACIER_DEFAUT } from './constants.js'

/** Code de prix de l'ouvrage porteur d'un plancher d'après son type (et la hauteur du corps creux). */
export function codePrixPlancher(pl) {
  if (!pl) return null
  if (pl.typePlancher === 'dallePleine' || pl.typePlancher === 'nervuree') return '6019…2376'
  if (pl.typePlancher === 'dalleTP') return 'dalle_tp'
  if (pl.hauteurCorpsCreux === 15) return 'plancher_h15'
  if (pl.hauteurCorpsCreux === 20) return 'plancher_h20'
  return null
}

/**
 * @param {{ parNiveau?: any[], fondation?: any, ratios?: Record<string, number> }} args
 * @returns {{ total:number, detail:Array<any>, lignes:Array<any>, parCode:Record<string, number> }}
 *   total   : kg (non arrondi)
 *   detail  : lignes agrégées par élément (format historique `acierDetail`)
 *   lignes  : une ligne par élément ET par niveau (pour la liste de matériaux)
 *   parCode : kg par code de prix d'ouvrage
 */
export function calculerAcier({ parNiveau = [], fondation = /** @type {any} */ ({}), ratios = {} }) {
  const R = { ...RATIOS_ACIER_DEFAUT, ...ratios }
  const lignes = []
  /** @type {Record<string, number>} */
  const parCode = {}
  /** @type {Map<string, any>} */
  const agr = new Map() // lib → { vol, ratio, kg }
  /** @param {{ lib: string, vol: number, ratio: number, niveau?: string|null, codePrix: string, ouvrage?: string }} a */
  const ajouter = ({ lib, vol, ratio, niveau = null, codePrix, ouvrage }) => {
    if (!(vol > 0)) return
    const kg = vol * ratio
    lignes.push({ lib, ouvrage: ouvrage || lib, niveau, vol, ratio, kg, codePrix, formule: `${round2(vol)} m³ × ${ratio} kg/m³`, statut: 'estime' })
    parCode[codePrix] = (parCode[codePrix] || 0) + kg
    const a = agr.get(lib) || { vol: 0, kg: 0, ratio, codePrix }
    a.vol += vol; a.kg += kg
    agr.set(lib, a)
  }
  const ratioSemelle = fondation.type === 'isolees' ? R.semelleIsolee : R.semelleFilante
  const FOND = 'Fondations'
  ajouter({ lib: 'Semelles', vol: fondation.volBAsemelles, ratio: ratioSemelle, niveau: FOND, codePrix: '6019…1195' })
  ajouter({ lib: 'Avant-poteaux', vol: fondation.volBAavantPoteaux, ratio: R.poteau, niveau: FOND, codePrix: '6019…1195' })
  ajouter({ lib: 'Chaînages', vol: fondation.volBAchainages, ratio: R.chainage, niveau: FOND, codePrix: '6019…1195' })
  ajouter({ lib: 'Longrines', vol: fondation.volBAlongrines, ratio: R.longrine, niveau: FOND, codePrix: '6019…1195' })
  ajouter({ lib: 'Radier', vol: fondation.volBAradier, ratio: R.radier, niveau: FOND, codePrix: 'radier' })

  // Élévation : une ligne par niveau, agrégée par élément dans `detail`.
  /** @type {Array<[string, string, number]>} */
  const ELEV = [
    ['Poteaux', 'volPoteaux', R.poteau], ['Poutres', 'volPoutres', R.poutre], ['Linteaux', 'volLinteaux', R.linteau],
    ['Voiles', 'volVoiles', R.voile ?? RATIOS_ACIER_DEFAUT.voile], ['Chaînages verticaux', 'volCV', R.chainage],
    ['Chaînages hauts', 'volChainageHaut', R.chainage],
  ]
  ELEV.forEach(([lib, cle, ratio]) => {
    parNiveau.forEach((m, i) => ajouter({ lib, vol: m[cle], ratio, niveau: m.nom || `Niveau ${i}`, codePrix: 'ba_elevation' }))
  })

  // Planchers : dalle pleine / terre-plein / nervurée au ratio volumique ; corps creux au ratio surfacique (treillis + chapeaux).
  let acierPlanchers = 0
  parNiveau.forEach((m, i) => {
    const pl = m.plancher
    if (!pl || !(pl.acier > 0)) return
    const niveau = m.nom || `Niveau ${i}`
    const codePrix = codePrixPlancher(pl)
    const corps = pl.hauteurCorpsCreux != null
    const lib = corps ? `Plancher corps creux ${pl.hauteurCorpsCreux}+5` : (pl.typePlancher === 'dalleTP' ? 'Dalle sur terre-plein' : 'Dalle pleine')
    lignes.push({
      lib, ouvrage: lib, niveau, vol: corps ? pl.surfNette : pl.vol, ratio: corps ? R.hourdisM2 : pl.acier / (pl.vol || 1), kg: pl.acier, codePrix,
      formule: corps ? `${round2(pl.surfNette)} m² × ${R.hourdisM2} kg/m²` : `${round2(pl.vol)} m³ × ${round2(pl.acier / (pl.vol || 1))} kg/m³`, statut: 'estime',
    })
    parCode[codePrix] = (parCode[codePrix] || 0) + pl.acier
    acierPlanchers += pl.acier
  })

  const detail = []
  let total = 0
  agr.forEach((a, lib) => {
    detail.push({ lib, formule: `${round2(a.vol)} m³ × ${a.ratio} kg/m³`, q: Math.round(a.kg), u: 'kg', codePrix: a.codePrix, statut: 'estime' })
    total += a.kg
  })
  if (acierPlanchers > 0) {
    detail.push({ lib: 'Planchers (dalles + hourdis)', formule: 'par niveau, selon type', q: acierPlanchers, u: 'kg', statut: 'estime' })
    total += acierPlanchers
  }
  return { total, detail, lignes, parCode }
}
