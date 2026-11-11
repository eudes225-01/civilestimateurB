// src/projet.js
// Agrégation projet — combine les niveaux, la fondation, l'acier par élément
// (A5), la toiture, le ciment, les matériaux, et lance la passe de validations
// croisées (A7). C'est le point d'entrée principal du moteur.
//
// Moteur v3 : cumuls SANS arrondi intermédiaire ; les totaux exposés sont arrondis à 2 décimales
// uniquement à l'assemblage final (affichage). Voir README « Arrondis ».
import {
  num, qte, round2, RATIOS_ACIER_DEFAUT, PARAMS_DEFAUT, TOITURES, TYPES_MUR, MODES_CHIFFRAGE, MODE_CHIFFRAGE_DEFAUT, DOSAGES, SAC_CIMENT_KG,
} from './constants.js'
import { metrerNiveau } from './niveau.js'
import { metrerFondation } from './fondations.js'
import { validerCoherence } from './validation.js'
import { validerEntrees } from './schema.js'
import { metrerPlomberie } from './plomberie.js'
import { metrerElectricite } from './electricite.js'
import { metrerToiture } from './toiture.js'
import { mortierPoseBloc } from './murs.js'
import { calculerAcier, codePrixPlancher } from './acier.js'
import { construireMateriaux } from './materiaux.js'
import { parametresEffectifs, evaluerCouverture } from './couverture.js'

/** Copie superficielle dont les nombres sont arrondis à 2 décimales (affichage). */
const arrondir = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' && Number.isFinite(v) ? round2(v) : v]))

// Familles de matériaux rendues « à confirmer » par une exception de couverture encore ouverte.
const FAMILLES_PAR_EXCEPTION = {
  fondation: ['fondation'], profondeur_fouille: ['fondation'], sol: ['fondation'],
  plancher_surface: ['plancher'], plancher_type: ['plancher'], hsp: ['maconnerie', 'elevation', 'enduit'], lot_maconnerie: ['maconnerie', 'enduit'],
}

/**
 * @param {Array}  levels
 * @param {Object} pRaw    - paramètres du projet (système, toiture, fondation saisie
 *                           par l'utilisateur ou lue sur le plan, plans spécialisés…)
 */
export function metrerProjet(levels = [], pRaw = {}) {
  // Les corrections confirmées par l'utilisateur (profondeur de fouille, HSP, pente) sont appliquées ici.
  const p = parametresEffectifs({
    ...PARAMS_DEFAUT, ...pRaw,
    ratiosAcier: { ...RATIOS_ACIER_DEFAUT, ...(pRaw.ratiosAcier || {}) },
    mortier: { ...PARAMS_DEFAUT.mortier, ...(pRaw.mortier || {}) },
  })
  const R = p.ratiosAcier
  const modeChiffrage = MODES_CHIFFRAGE[p.modeChiffrage] ? p.modeChiffrage : MODE_CHIFFRAGE_DEFAUT
  const validation = validerEntrees(levels, p)

  const parNiveauBrut = levels.map((lv) => metrerNiveau(lv, p))

  // Emprise : paramètre > plus grande surface de niveau
  const emprise = num(p.emprise) > 0 ? num(p.emprise)
    : Math.max(0, ...parNiveauBrut.map((m) => Math.max(m.surfPlancher, m.Ssol)), 0)

  const iRez = Math.max(0, levels.findIndex((lv) => lv?.rez))
  const rez = parNiveauBrut[iRez] || { LdevPorteurs: 0, Ldev: 0 }
  const fondation = metrerFondation(p.fondation, {
    emprise, ratiosAcier: R,
    LdevPorteurs: rez.LdevPorteurs || rez.Ldev || 0,
  })

  // Forme de dallage en mortier : élément distinct du plancher, appliqué une seule fois au RDC.
  const formeCfg = { ...PARAMS_DEFAUT.formeDallage, ...(p.formeDallage || {}) }
  const surfForme = num(formeCfg.surface) > 0 ? num(formeCfg.surface) : (rez.surfPlancher || emprise)
  const epForme = num(formeCfg.epaisseur)
  const dosageForme = num(formeCfg.dosageKgM3, 350) > 0 ? num(formeCfg.dosageKgM3, 350) : 350
  const sableForme = num(formeCfg.sableM3ParM3, 1) > 0 ? num(formeCfg.sableM3ParM3, 1) : 1
  const formeDallage = {
    actif: !!formeCfg.actif, surface: surfForme, epaisseur: epForme,
    dosageKgM3: dosageForme, sableM3ParM3: sableForme,
    eauCimentRatio: num(formeCfg.eauCimentRatio) > 0 ? num(formeCfg.eauCimentRatio) : null,
    prixEauM3: formeCfg.prixEauM3 !== '' && formeCfg.prixEauM3 !== null && formeCfg.prixEauM3 !== undefined
      && Number.isFinite(+formeCfg.prixEauM3) && +formeCfg.prixEauM3 >= 0 ? +formeCfg.prixEauM3 : null,
    volume: formeCfg.actif && surfForme > 0 && epForme > 0 ? surfForme * epForme : 0,
  }

  // ── Toiture (calculée avant les agrégats : les pignons s'ajoutent au métré des murs) ──
  const plans = p.plans || {}
  const niveauFinal = levels.at(-1) || {}
  const typePlancherFinal = niveauFinal.plancher || (niveauFinal.dalle ? 'dallePleine' : 'aucun')
  const typesDalleDeToiture = ['dallePleine', 'nervuree', 'hourdis15', 'hourdis20', 'corpsCreuxApparent', 'corpsCreuxPlan']
  const toitKey = p.toiture && TOITURES[p.toiture] ? p.toiture : 'bac'
  // Une dalle terminale supprime la couverture par défaut ; un plan de toiture explicite reste prioritaire.
  const planToitureExplicite = plans.toiture && Object.keys(plans.toiture).length > 0
  const toitureAbsente = typesDalleDeToiture.includes(typePlancherFinal) && toitKey !== 'terrasse' && !planToitureExplicite
  const toit = toitureAbsente ? { lab: 'Pas de couverture (toit-dalle)', coef: 0, code: null } : TOITURES[toitKey]
  const dernier = parNiveauBrut[parNiveauBrut.length - 1]
  const toitureDetail = !toitureAbsente && plans.toiture ? metrerToiture(plans.toiture, { emprise, coefDefaut: toit.coef }) : null
  let toitureCalcul
  if (toitureAbsente) {
    toitureCalcul = { methode: 'aucune', surfProjetee: 0, coef: 0, surfCouverture: 0, source: 'dernier niveau terminé par une dalle', formule: 'Aucune couverture : le dernier niveau est un toit-dalle.' }
  } else if (toitKey === 'terrasse') {
    const S = dernier?.surfPlancher || emprise
    toitureCalcul = { methode: 'terrasse', surfProjetee: S, coef: 1, surfCouverture: S, source: 'surface du dernier plancher', formule: `${round2(S)} m² (toit-terrasse, surface du dernier plancher)` }
  } else if (toitureDetail?.surfCouverture > 0) {
    const d = toitureDetail
    toitureCalcul = {
      methode: d.methode, surfProjetee: d.surfProjetee, coef: d.coefApplique, surfCouverture: d.surfCouverture, source: d.source,
      formule: d.methode === 'pente' ? `${d.surfProjetee} m² × √(1+(${d.pentePct}/100)²) = ${d.surfCouverture} m²` : `${d.surfProjetee} m² × ${d.coefApplique} (forfait ${toit.lab}) = ${d.surfCouverture} m²`,
    }
  } else {
    const S = emprise * toit.coef
    toitureCalcul = { methode: 'emprise', surfProjetee: emprise, coef: toit.coef, surfCouverture: S, source: "emprise du projet (aucun plan de toiture lu)", formule: `${round2(emprise)} m² (emprise) × ${toit.coef} (forfait ${toit.lab}) = ${round2(S)} m²` }
  }
  toitureCalcul.detail = [{ lib: `Surface de couverture (${toitureCalcul.source})`, formule: toitureCalcul.formule, q: round2(toitureCalcul.surfCouverture), u: 'm²' }]
  const surfToiture = toitureCalcul.surfCouverture

  // ── Agrégats élévation / planchers / maçonnerie ──
  const acc = {
    Ldev: 0, LdevPorteurs: 0, Ssol: 0, Smur: 0, Souv: 0,
    enduitInt: 0, enduitExt: 0, mortierPose: 0, cimentPoseSacs: 0, sablePoseM3: 0,
    volPoteaux: 0, volPoutres: 0, volLinteaux: 0, volChainageHaut: 0,
    volVoiles: 0, volCV: 0,
    coffPoteaux: 0, coffPoutres: 0, coffVoiles: 0, coffDalleSousFace: 0, coffRives: 0,
    volPlanchers: 0, volHourdisBeton: 0, surfHourdis: 0, entrevous: 0,
    nbPortes: 0, nbFenetres: 0, nbPoteauxTotal: 0,
  }
  const parTypeMur = {}
  const parCategorieMur = {}
  const alertesMetre = []
  if (formeDallage.actif && !(formeDallage.epaisseur > 0)) {
    alertesMetre.push({ niveau: 'attention', msg: 'Forme de dallage activée au RDC : saisissez son épaisseur pour calculer le volume et ses matériaux.' })
  }
  if (formeDallage.actif && formeDallage.volume > 0 && !formeDallage.eauCimentRatio) {
    alertesMetre.push({ niveau: 'attention', msg: 'Forme de dallage : renseignez le ratio eau/ciment pour calculer le volume d’eau de gâchage.' })
  }
  // Somme les grandeurs cumulables ; `ep` (épaisseur) n'est PAS cumulable : c'est une caractéristique du type de bloc.
  const sommer = (cible, src) => Object.entries(src).forEach(([k, v]) => { if (typeof v === 'number' && k !== 'ep') cible[k] = (cible[k] || 0) + v })

  parNiveauBrut.forEach((m, i) => {
    ;['Ldev', 'LdevPorteurs', 'Ssol', 'Smur', 'Souv', 'enduitInt', 'enduitExt', 'volPoteaux', 'coffPoteaux', 'volPoutres', 'coffPoutres',
      'volLinteaux', 'volVoiles', 'coffVoiles', 'volCV', 'volChainageHaut', 'surfHourdis', 'entrevous', 'nbPortes', 'nbFenetres']
      .forEach((k) => { acc[k] += m[k] })
    acc.mortierPose += m.mortierPose; acc.cimentPoseSacs += m.cimentPoseSacs; acc.sablePoseM3 += m.sablePoseM3
    acc.volPlanchers += m.volPlancher
    if (m.plancher?.hauteurCorpsCreux != null) acc.volHourdisBeton += m.plancher.vol
    acc.coffDalleSousFace += m.coffDalleSousFace; acc.coffRives += m.coffRives
    acc.nbPoteauxTotal += (levels[i]?.poteaux || []).reduce((s, x) => s + qte(x.nb), 0)
    Object.entries(m.parTypeMur).forEach(([tKey, v]) => {
      const a = (parTypeMur[tKey] ||= { surf: 0, blocs: 0, blocsExact: 0, detail: [], mortier: { m3: 0, cimentSacs: 0, sableM3: 0 } })
      a.surf += v.surf; a.blocsExact += v.blocsExact
      a.mortier.m3 += v.mortier.m3; a.mortier.cimentSacs += v.mortier.cimentSacs; a.mortier.sableM3 += v.mortier.sableM3
      a.mortier.mode = v.mortier.mode; a.mortier.params = v.mortier.params
      a.detail.push(...v.detail.map((d) => ({ ...d, lib: `${m.nom || `Niv. ${i}`} — ${d.lib}` })))
    })
    Object.entries(m.parCategorieMur || {}).forEach(([cat, c]) => {
      const a = (parCategorieMur[cat] ||= { lab: c.lab, categorie: cat, types: {}, epaisseurs: [], detail: [] })
      sommer(a, c)
      a.epaisseurs = [...new Set([...a.epaisseurs, ...c.epaisseurs])]
      Object.entries(c.types).forEach(([t, x]) => {
        const at = (a.types[t] ||= { lab: x.lab, ep: x.ep, params: x.params })
        sommer(at, x)
      })
      if (c.detail) a.detail.push(...c.detail.map((d) => ({ ...d, lib: `${m.nom || `Niv. ${i}`} — ${d.lib}` })))
    })
    alertesMetre.push(...m.alertes.map((a) => ({ ...a })))
  })

  // ── Pignons : triangles de maçonnerie sous toiture, ajoutés au métré des murs ──
  const pignons = { lignes: [], surfTriangles: 0, inclus: false }
  ;(toitureDetail?.pignons?.lignes || []).forEach((g) => {
    const t = TYPES_MUR[g.type] ? g.type : 'agglo15'
    if (!TYPES_MUR[g.type]) alertesMetre.push({ niveau: 'info', msg: `Pignon « ${g.nom} » : type de bloc non précisé — agglos 15 supposé.` })
    const surfTotale = g.nb * g.surf
    const mp = mortierPoseBloc(t, surfTotale, p)
    pignons.lignes.push({ ...g, type: t, surfTotale, mat: mp })
    pignons.surfTriangles += surfTotale
    const a = (parTypeMur[t] ||= { surf: 0, blocs: 0, blocsExact: 0, detail: [], mortier: { m3: 0, cimentSacs: 0, sableM3: 0, mode: mp.mode, params: mp.params } })
    a.surf += surfTotale; a.blocsExact += mp.blocsExact
    a.mortier.m3 += mp.mortierM3; a.mortier.cimentSacs += mp.cimentSacs; a.mortier.sableM3 += mp.sableM3
    a.detail.push({ lib: `Pignon — ${g.nom}`, formule: `${g.nb} × (${g.formule})`, q: round2(surfTotale), u: 'm²', categorie: 'exterieur' })
    acc.Smur += surfTotale; acc.enduitInt += surfTotale; acc.enduitExt += surfTotale
    acc.mortierPose += mp.mortierM3; acc.cimentPoseSacs += mp.cimentSacs; acc.sablePoseM3 += mp.sableM3
    const ce = (parCategorieMur.exterieur ||= { lab: 'Murs extérieurs', categorie: 'exterieur', types: {}, epaisseurs: [], detail: [] })
    ce.surfNette = (ce.surfNette || 0) + surfTotale; ce.blocs = (ce.blocs || 0) + mp.blocs; ce.enduitInt = (ce.enduitInt || 0) + surfTotale; ce.enduitExt = (ce.enduitExt || 0) + surfTotale
  })
  pignons.inclus = pignons.lignes.length > 0
  if (toitKey !== 'terrasse' && !pignons.inclus) {
    alertesMetre.push({ niveau: 'attention', msg: "Pignons NON inclus au métré des murs : si la toiture a des pignons (toit à 2 pans), saisissez-les (largeur de versant L1 et pente P1) dans le plan de toiture — blocs, enduits et peinture des triangles de pignon manquent sinon." })
  }

  Object.values(parTypeMur).forEach((v) => { v.blocs = Math.round(v.blocsExact) })

  // ── Acier par élément (A5) — estimation par ratio ──
  const acier = calculerAcier({ parNiveau: parNiveauBrut, fondation, ratios: R })
  const acierKg = Math.round(acier.total)

  // ── Volumes BA totaux ──
  const volBAfondation = fondation.volBAsemelles + fondation.volBAavantPoteaux + fondation.volBAchainages + fondation.volBAlongrines + fondation.volBAradier
  const volBAelevation = acc.volPoteaux + acc.volPoutres + acc.volLinteaux + acc.volChainageHaut + acc.volVoiles + acc.volCV
  const volBA = volBAfondation + volBAelevation + acc.volPlanchers
  // Béton dont le MATÉRIAU est facturable séparément en mode décomposé : tout le béton sauf celui des planchers
  // à corps creux (compris dans le prix du plancher poutrelles + entrevous + table de compression).
  const volBetonDecomposable = volBA - acc.volHourdisBeton

  // ── Lots techniques lus sur plan (plomberie, électricité) ──
  const plomberie = plans.plomberie ? metrerPlomberie(plans.plomberie) : null
  const electricite = plans.electricite ? metrerElectricite(plans.electricite) : null

  // ── Ciment, ventilé par usage (sacs de 50 kg) ──
  const sousb = parCategorieMur.soubassement
  const cimentPoseSacs = acc.cimentPoseSacs + (sousb?.cimentSacs || 0)
  const cimentBeton = volBA * DOSAGES.ba350.cimentSacs + fondation.volProprete * DOSAGES.proprete.cimentSacs
  const cimentEnduit = (acc.enduitInt + acc.enduitExt) * DOSAGES.enduit.cimentSacsM2 + (sousb?.enduitHydrofuge || 0) * DOSAGES.enduit.cimentSacsM2
  const cimentAutres = fondation.volBanche * DOSAGES.banche.cimentSacs + fondation.volMoellons * DOSAGES.moellons.cimentSacs
  const cimentFormeDallage = formeDallage.volume * formeDallage.dosageKgM3 / SAC_CIMENT_KG
  const cimentSacs = Math.round(cimentPoseSacs + cimentBeton + cimentEnduit + cimentAutres + cimentFormeDallage)

  // ── Sable / gravier (dosages béton, Lot B) ──
  // Béton de propreté et béton armé courant partagent le même dosage granulats pour 1 m³ de béton frais :
  // sable 0,40 m³, gravier 0,80 m³ (le « béton de structure haute » n'est pas distingué par le moteur).
  const volSable = (fondation.volProprete + volBA) * DOSAGES.ba350.sableM3
  const volGravier = (fondation.volProprete + volBA) * DOSAGES.ba350.gravierM3

  // ── Coffrage : sous-face des planchers SUSPENDUS uniquement (jamais sous une dalle sur terre-plein) + rives ──
  const coffDalleSsFace = acc.coffDalleSousFace

  // Coffrage et acier par code de prix d'ouvrage (le DQE s'en sert pour ne rien facturer deux fois).
  const coffrageParCode = { ba_elevation: acc.coffPoteaux + acc.coffPoutres + acc.coffVoiles }
  parNiveauBrut.forEach((m) => {
    const c = codePrixPlancher(m.plancher)
    if (c) coffrageParCode[c] = (coffrageParCode[c] || 0) + m.coffDalleSousFace + m.coffRives
  })

  // ── Assemblage des totaux (arrondi d'affichage) ──
  const parNiveau = parNiveauBrut.map(arrondir)
  const aplat = (v) => ({ ...v, surf: round2(v.surf), mortier: arrondir(v.mortier) })
  const parTypeMurOut = Object.fromEntries(Object.entries(parTypeMur).map(([k, v]) => [k, aplat(v)]))
  const parCategorieOut = Object.fromEntries(Object.entries(parCategorieMur).map(([k, c]) => [k, {
    ...arrondir(c), types: Object.fromEntries(Object.entries(c.types).map(([t, x]) => [t, arrondir(x)])),
  }]))
  const totaux = {
    ...arrondir(acc),
    modeChiffrage,
    parTypeMur: parTypeMurOut,
    parCategorieMur: parCategorieOut,
    soubassement: parCategorieOut.soubassement || null,
    soubassementACompleter: parNiveauBrut.flatMap((m) => (m.soubassementACompleter || []).map((x) => ({ niveau: m.nom, ...x }))),
    pignons: { ...pignons, surfTriangles: round2(pignons.surfTriangles), lignes: pignons.lignes.map(({ mat, ...g }) => ({ ...g, blocs: mat.blocs })) },
    emprise: round2(emprise),
    fondation: { ...fondation, ...arrondir(fondation) },
    LdevPorteursRez: round2(rez.LdevPorteurs || 0),
    volFouille: round2(fondation.volFouilles + fondation.volPleineMasse),
    volPleineMasse: round2(fondation.volPleineMasse),
    volProprete: round2(fondation.volProprete),
    volSemelle: round2(fondation.volBAsemelles + fondation.volBAavantPoteaux),
    volChainageBas: round2(fondation.volBAchainages + fondation.volBAlongrines),
    volBanche: round2(fondation.volBanche),
    volMoellons: round2(fondation.volMoellons),
    surfArase: round2(fondation.surfArase),
    surfHerisson: round2(fondation.surfHerisson),
    formeDallage: { ...formeDallage, surface: round2(formeDallage.surface), epaisseur: round2(formeDallage.epaisseur), volume: round2(formeDallage.volume) },
    volFormeDallage: round2(formeDallage.volume),
    volRemblai: round2(fondation.volRemblai),
    volDeblaisEvacuer: round2(fondation.volDeblaisEvacuer),
    volRemblaisApport: round2(fondation.volRemblaisApport),
    volReemploi: round2(fondation.volReemploi),
    volRemblaiNonPourvu: round2(fondation.volRemblaiNonPourvu),
    terrassementMode: fondation.terrassementMode,
    terrassementSol: fondation.terrassementSol,
    terrassementBloquant: fondation.terrassementBloquant,
    volBAfondation: round2(volBAfondation), volBAelevation: round2(volBAelevation),
    volDalle: round2(acc.volPlanchers),
    volBA: round2(volBA), volBetonDecomposable: round2(volBetonDecomposable), volHourdisBeton: round2(acc.volHourdisBeton),
    acierKg,
    acierDetail: acier.detail,
    acierParCode: Object.fromEntries(Object.entries(acier.parCode).map(([k, v]) => [k, round2(v)])),
    coffrageParCode: Object.fromEntries(Object.entries(coffrageParCode).map(([k, v]) => [k, round2(v)])),
    agglos: Object.values(parTypeMur).reduce((s, v) => s + v.blocs, 0),
    enduit: round2(acc.enduitInt + acc.enduitExt),
    cimentSacs,
    ciment: { beton: round2(cimentBeton), mortierPose: round2(cimentPoseSacs), enduits: round2(cimentEnduit), autres: round2(cimentAutres), formeDallage: round2(cimentFormeDallage) },
    volSable: round2(volSable), volGravier: round2(volGravier),
    coffDalle: round2(coffDalleSsFace), coffRives: round2(acc.coffRives),
    surfToiture: round2(surfToiture),
    toitureAbsente,
    toitureCalcul: { ...toitureCalcul, surfCouverture: round2(toitureCalcul.surfCouverture), surfProjetee: round2(toitureCalcul.surfProjetee) },
    toitureDetail, plomberie, electricite,
    toiture: { key: toitureAbsente ? 'aucun' : toitKey, ...toit },
    nbPoteauxRez: (levels[iRez]?.poteaux || []).reduce((s, x) => s + qte(x.nb), 0),
    parNiveau,
    planchers: parNiveauBrut.map((m) => ({ niveau: m.nom, ...m.plancher, detail: m.plancher?.detail || [], alertes: undefined })),
    systeme: p.systeme,
  }

  const alertes = validerCoherence(totaux, levels, p)
  alertes.push(...alertesMetre, ...fondation.alertes, ...validation.alertes)
  ;[toitureDetail, plomberie, electricite].forEach((m) => { if (m?.alertes) alertes.push(...m.alertes) })
  // Couverture de lecture + exceptions à valider (états de confirmation par donnée).
  const couverture = evaluerCouverture(totaux, levels, p)

  // ── Quantités de matériaux (sortie distincte du DQE ; toujours produite) ──
  const famillesAConfirmer = [...new Set((couverture.aConfirmer || []).filter((x) => x.etat === 'a_confirmer').flatMap((x) => FAMILLES_PAR_EXCEPTION[x.cle] || []))]
  const materiaux = construireMateriaux({ parNiveau: parNiveauBrut, fondation, acier, pignons, formeDallage, p, famillesAConfirmer })
  totaux.materiaux = materiaux
  totaux.hypotheses = construireHypotheses({ p, modeChiffrage, totaux, toitureCalcul })

  return { totaux, parNiveau, alertes, couverture, materiaux, validation }
}

/** Hypothèses et paramètres effectivement utilisés (affichés dans l'interface et le PDF). */
function construireHypotheses({ p, modeChiffrage, totaux, toitureCalcul }) {
  const h = []
  const add = (cle, lib, valeur, statut = 'estime') => h.push({ cle, lib, valeur, statut })
  add('modeChiffrage', 'Mode de chiffrage', MODES_CHIFFRAGE[modeChiffrage].lab, 'choisi')
  add('K', 'Coefficient K (aléas + frais généraux + bénéfice)', String(p.K), 'choisi')
  add('dosages', 'Dosages', `BA 350 kg/m³ = ${DOSAGES.ba350.cimentSacs} sacs, sable ${DOSAGES.ba350.sableM3} m³, gravier ${DOSAGES.ba350.gravierM3} m³ par m³ ; propreté 150 kg/m³ = ${DOSAGES.proprete.cimentSacs} sacs/m³`)
  add('acier', 'Acier HA', 'ESTIMATION par ratios kg/m³ (pas de ferraillage détaillé) : ' + Object.entries(p.ratiosAcier).filter(([k]) => ['semelleFilante', 'semelleIsolee', 'chainage', 'poteau', 'poutre', 'dallePleine'].includes(k)).map(([k, v]) => `${k} ${v}`).join(', '))
  const t0 = Object.values(totaux.parTypeMur)[0]
  const mort = t0?.mortier
  add('mortier', 'Mortier de pose', p.mortier?.mode === 'blocsParSac'
    ? `règle « 1 sac pour N blocs » (N par type de bloc, défaut ${TYPES_MUR.agglo15.blocsParSac})`
    : `volume de mortier par m² (${mort?.params?.mortierM3M2 ?? TYPES_MUR.agglo15.mortierM3M2} m³/m²) × dosage ${mort?.params?.dosageKgM3 ?? TYPES_MUR.agglo15.dosageKgM3} kg/m³ ; équivalent ≈ ${mort?.cimentSacs > 0 ? Math.round((t0.blocsExact) / mort.cimentSacs) : '—'} blocs par sac (règle indicative : ${TYPES_MUR.agglo15.blocsParSac})`)
  add('pertes', 'Pertes blocs', `agglos ${p.pertesAgglo} %, briques ${p.pertesBrique} %`)
  add('terrassement', 'Terrassement', `mode « ${totaux.terrassementMode} » (foisonnement ${num(p.fondation?.terrassement?.cf, 1.25)}, tassement ${num(p.fondation?.terrassement?.cp, 1.15)})`)
  add('toiture', 'Surface de couverture', toitureCalcul.formule, toitureCalcul.methode === 'pente' ? 'calcule' : 'estime')
  add('planchers', 'Planchers à corps creux', 'entrevous/m² = hypothèse du type (15+5 : 8,5 ; 20+5 : 7,0, pertes incluses) ; poutrelles comptées seulement si l\'entraxe est saisi', 'estime')
  return h
}
