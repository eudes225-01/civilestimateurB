// src/murs.js
// Murs, cloisons, soubassements, enduits par face, blocs et mortier de pose, pour un niveau (A4, A6).
//
// Moteur v3 : en plus des totaux historiques (parType, Smur, Ldev, enduits), le métré est ventilé par
// CATÉGORIE d'ouvrage (extérieur / porteur intérieur / cloison / mitoyen / soubassement) avec, pour chacune :
// surface brute, ouvertures, surface nette, longueur développée, épaisseur, blocs (pertes incluses),
// mortier de pose, ciment et sable de joint, enduits intérieur / extérieur.
//
// Les murs de SOUBASSEMENT (m.categorie === 'soubassement') ne sont jamais mélangés à l'élévation :
// ils sont exclus de Smur / Ldev / LdevPorteurs / parType / enduits d'élévation et restituent leur propre
// bloc `soubassement`. Leurs dimensions ne sont jamais inventées : longueur, hauteur et type de bloc sont
// obligatoires, sinon le mur est écarté et une alerte « à compléter » est émise.
import {
  num, qte, round2, TYPES_MUR, MURS_PORTEURS, PARAMS_DEFAUT, CATEGORIES_MUR, MORTIER_DEFAUT, SAC_CIMENT_KG,
  MORTIER_MODE_DEFAUT, DEDUCTION_HAUTEUR_DEFAUT,
} from './constants.js'

/** Convertit les pièces (mode simple / legacy) en murs implicites agglos 15. */
export function mursDepuisPieces(level, p) {
  return (level.pieces || [])
    .filter((pc) => num(pc.L) > 0 && num(pc.l) > 0)
    .map((pc) => ({
      nom: pc.nom || 'Pièce', type: 'agglo15', nb: 1,
      L: round2(2 * (num(pc.L) + num(pc.l))),
      H: num(pc.H) || num(level.HSP) || num(p.Hetage, 3),
      position: 'interieur',
      portes: num(pc.portes), fenetres: num(pc.fenetres),
      _derive: true,
    }))
}

/** Paramètres de pose effectifs d'un type de bloc : défauts du type < surcharges `params.mortier.parType[type]`. */
export function paramsBloc(type, p = {}) {
  const base = TYPES_MUR[type] || TYPES_MUR.agglo15
  const sur = p.mortier?.parType?.[type] || {}
  const pick = (k) => (num(sur[k], NaN) > 0 ? num(sur[k]) : base[k] ?? MORTIER_DEFAUT[k])
  const pertesDef = num(p[base.pertesKey], base.pertesKey === 'pertesBrique' ? 8 : 7)
  const surPertes = sur.pertesPct !== undefined && sur.pertesPct !== '' && num(sur.pertesPct, NaN) >= 0
  return {
    ...base,
    blocsM2: pick('blocsM2'),
    mortierM3M2: pick('mortierM3M2'),
    dosageKgM3: pick('dosageKgM3'),
    blocsParSac: pick('blocsParSac'),
    pertesPct: surPertes ? num(sur.pertesPct) : pertesDef,
  }
}

/**
 * Mortier de pose, ciment et sable de joint pour une surface nette de mur d'un type de bloc.
 * Deux modes (params.mortier.mode) :
 *   'blocsParSac' (défaut) : ciment = blocs / blocsParSac (« 1 sac pour 70 blocs », document de référence,
 *                            problème 2) ; mortier déduit = ciment × 50 / dosage
 *   'volume'               : mortier = S × volume/m² ; ciment = mortier × dosage / 50 kg  (formule historique)
 * Le nombre de sacs À COMMANDER est arrondi au sac entier supérieur (liste de matériaux).
 * Le sable de mortier = mortier × params.mortier.sableM3ParM3 (défaut 1,0 m³ de sable / m³ de mortier : hypothèse).
 */
export function mortierPoseBloc(type, surfNette, p = {}) {
  const b = paramsBloc(type, p)
  const mode = (p.mortier?.mode ?? MORTIER_MODE_DEFAUT) === 'volume' ? 'volume' : 'blocsParSac'
  const sableM3ParM3 = num(p.mortier?.sableM3ParM3, NaN) > 0 ? num(p.mortier.sableM3ParM3) : 1.0
  const blocsExact = surfNette * b.blocsM2 * (1 + b.pertesPct / 100)
  let mortierM3, cimentSacs, formule
  if (mode === 'blocsParSac') {
    cimentSacs = blocsExact / b.blocsParSac
    mortierM3 = (cimentSacs * SAC_CIMENT_KG) / b.dosageKgM3
    formule = `${round2(blocsExact)} blocs ÷ ${b.blocsParSac} blocs/sac = ${round2(cimentSacs)} sacs`
  } else {
    mortierM3 = surfNette * b.mortierM3M2
    cimentSacs = (mortierM3 * b.dosageKgM3) / SAC_CIMENT_KG
    formule = `${round2(surfNette)} m² × ${b.mortierM3M2} m³/m² = ${round2(mortierM3)} m³ de mortier × ${b.dosageKgM3} kg/m³ ÷ ${SAC_CIMENT_KG} = ${round2(cimentSacs)} sacs`
  }
  return {
    blocsExact, blocs: Math.round(blocsExact),
    mortierM3, cimentSacs, cimentKg: cimentSacs * SAC_CIMENT_KG,
    sableM3: mortierM3 * sableM3ParM3,
    blocsParSacEquivalent: cimentSacs > 0 ? blocsExact / cimentSacs : null,
    mode, formule, params: { blocsM2: b.blocsM2, pertesPct: b.pertesPct, mortierM3M2: b.mortierM3M2, dosageKgM3: b.dosageKgM3, blocsParSac: b.blocsParSac },
  }
}

/** Catégorie d'ouvrage d'un mur : explicite > soubassement > position > porteur / cloison selon le bloc. */
export function categorieMur(m, type) {
  if (CATEGORIES_MUR[m.categorie]) return m.categorie
  if (m.soubassement === true) return 'soubassement'
  const pos = m.position || 'interieur'
  if (pos === 'exterieur') return 'exterieur'
  if (pos === 'mitoyen') return 'mitoyen'
  return MURS_PORTEURS.includes(type) ? 'porteur' : 'cloison'
}

const vide = () => ({
  brute: 0, ouvertures: 0, poteaux: 0, nette: 0, Ldev: 0, enduitInt: 0, enduitExt: 0,
  parType: {}, // type → { nette, Ldev, ep }
})

export function metrerMurs(level, p) {
  const ouv = p.ouv || PARAMS_DEFAUT.ouv
  const HSP = num(level.HSP) || num(p.Hetage, 3)
  const murs = (level.murs && level.murs.length) ? level.murs : mursDepuisPieces(level, p)

  const parType = {}   // élévation uniquement : { agglo15: { surf, blocs, detail[] }, … }
  const parCat = {}    // toutes catégories : { exterieur: {…}, soubassement: {…}, … }
  let Ldev = 0, LdevPorteurs = 0, Souv = 0, enduitInt = 0, enduitExt = 0
  let nbPortes = 0, nbFenetres = 0
  const detail = []
  const alertes = []
  const aCompleter = [] // soubassements écartés faute de dimensions

  murs.forEach((m, idx) => {
    const t = TYPES_MUR[m.type] ? m.type : 'agglo15'
    const cat = categorieMur(m, t)
    const sous = cat === 'soubassement'
    const nb = qte(m.nb)
    const Laxe = num(m.L)
    // Soubassement : la hauteur n'est JAMAIS déduite de la HSP du niveau (elle n'a aucun rapport).
    const Hsaisie = sous ? num(m.H) : (num(m.H) || HSP)
    // Déduction de hauteur (problème 1) : H = Ht − Hs − Hbp − n·ec — jamais pour un soubassement.
    const dd = { ...DEDUCTION_HAUTEUR_DEFAUT, ...(p.deductionHauteur || {}) }
    const deduire = !sous && m.deduireHauteur !== false && (dd.actif || m.deduireHauteur === true)
    const nCh = num(m.nChainages, num(dd.nChainages, 2))
    const dHaut = deduire ? num(m.Hs, num(dd.Hs)) + num(m.Hbp, num(dd.Hbp)) + nCh * num(m.ec, num(dd.ec, 0.2)) : 0
    const H = Math.max(0, Hsaisie - dHaut)
    const ep = num(m.ep) > 0 ? num(m.ep) : TYPES_MUR[t].ep
    const nom = m.nom || `${CATEGORIES_MUR[cat].lab} ${idx + 1}`

    if (sous && (!(Laxe > 0) || !(H > 0) || !TYPES_MUR[m.type])) {
      const manque = [!(Laxe > 0) && 'longueur', !(H > 0) && 'hauteur', !TYPES_MUR[m.type] && 'type de bloc'].filter(Boolean)
      aCompleter.push({ nom, manque })
      alertes.push({ niveau: 'attention', msg: `Soubassement « ${nom} » : ${manque.join(', ')} à compléter — le mur n'est pas compté (dimensions non inventées).` })
      return
    }
    // Longueur développée (Lot C §1) : LD = L_axe − ½·b·(nT + 2·nX).
    // Jonction en L : 0 ; en T : ½·b ; en X : b. Sans jonction saisie, LD = L.
    const nT = Math.max(0, num(m.jonctionsT)), nX = Math.max(0, num(m.jonctionsX))
    const corrJonc = ep * (0.5 * nT + nX)
    const L = Math.max(0, Laxe - corrJonc)
    if (L <= 0 || H <= 0 || nb <= 0) return
    const np = num(m.portes), nf = num(m.fenetres)
    const pL = num(m.pL, ouv.pL), pH = num(m.pH, ouv.pH)
    const fL = num(m.fL, ouv.fL), fH = num(m.fH, ouv.fH)
    const sOuv = np * pL * pH + nf * fL * fH
    const brute = nb * L * H
    // Déduction des poteaux traversant le mur (Lot C §2A) : largeur × hauteur.
    const nPot = Math.max(0, num(m.poteaux))
    const sPot = nPot * num(m.largPoteau, num(p.largPoteau, PARAMS_DEFAUT.largPoteau)) * H
    const nette = Math.max(0, brute - nb * (sOuv + sPot))

    // Enduits par face (A6)
    const pos = m.position || 'interieur'
    let eInt = 0, eExt = 0
    if (pos === 'exterieur') { eExt = nette; eInt = nette }
    else if (pos === 'mitoyen') { eInt = nette }
    else { eInt = 2 * nette }

    // Ventilation par catégorie
    const c = (parCat[cat] ||= vide())
    c.brute += brute; c.ouvertures += nb * sOuv; c.poteaux += nb * sPot; c.nette += nette; c.Ldev += nb * L
    c.enduitInt += eInt; c.enduitExt += eExt
    const ct = (c.parType[t] ||= { nette: 0, Ldev: 0, ep })
    ct.nette += nette; ct.Ldev += nb * L
    if (sous && m.enduitHydrofuge) c.hydrofuge = (c.hydrofuge || 0) + (pos === 'interieur' ? 2 * nette : nette)

    const ligne = {
      lib: m.nom || TYPES_MUR[t].lab,
      formule: `${nb} × ${round2(L)} × ${round2(H)}${dHaut ? ` [Ht ${Hsaisie} − ${round2(dHaut)} (semelle, propreté, chaînages)]` : ''}${sOuv ? ` − ${round2(nb * sOuv)} (ouv.)` : ''}${sPot ? ` − ${round2(nb * sPot)} (poteaux)` : ''}${corrJonc ? ` [LD = ${round2(Laxe)} − ${round2(corrJonc)} jonctions]` : ''}`,
      q: round2(nette), u: 'm²', categorie: cat,
    }
    detail.push({ ...m, type: t, categorie: cat, surfNette: round2(nette), surfBrute: round2(brute), Ldev: round2(nb * L) })

    if (sous) { (c.detail ||= []).push(ligne); return } // ← hors élévation

    if (!parType[t]) parType[t] = { surf: 0, blocs: 0, detail: [] }
    parType[t].surf += nette
    parType[t].detail.push(ligne)
    Ldev += nb * L
    // Un mur déclaré « cloison » n'est jamais porteur, même en agglo 15/20.
    if (MURS_PORTEURS.includes(t) && cat !== 'cloison') LdevPorteurs += nb * L
    Souv += nb * sOuv
    nbPortes += nb * np; nbFenetres += nb * nf
    enduitInt += eInt; enduitExt += eExt
  })

  // Blocs, mortier, ciment, sable de joint — par type (élévation) puis par catégorie.
  let mortierPoseM3 = 0, cimentPoseSacs = 0, sablePoseM3 = 0
  Object.entries(parType).forEach(([t, v]) => {
    const mp = mortierPoseBloc(t, v.surf, p)
    v.blocsExact = mp.blocsExact
    v.blocs = mp.blocs
    v.mortier = { m3: mp.mortierM3, cimentSacs: mp.cimentSacs, sableM3: mp.sableM3, formule: mp.formule, mode: mp.mode, params: mp.params, blocsParSacEquivalent: mp.blocsParSacEquivalent }
    mortierPoseM3 += mp.mortierM3; cimentPoseSacs += mp.cimentSacs; sablePoseM3 += mp.sableM3
  })

  const parCategorie = {}
  Object.entries(parCat).forEach(([cat, c]) => {
    const types = {}
    let blocsExact = 0, blocs = 0, mortierM3 = 0, cimentSacs = 0, sableM3 = 0
    Object.entries(c.parType).forEach(([t, x]) => {
      const mp = mortierPoseBloc(t, x.nette, p)
      types[t] = {
        lab: TYPES_MUR[t].lab, ep: x.ep, surfNette: x.nette, Ldev: x.Ldev,
        blocsExact: mp.blocsExact, blocs: mp.blocs, mortierM3: mp.mortierM3, cimentSacs: mp.cimentSacs, sableM3: mp.sableM3,
        formule: mp.formule, params: mp.params,
      }
      blocsExact += mp.blocsExact; blocs += mp.blocs; mortierM3 += mp.mortierM3; cimentSacs += mp.cimentSacs; sableM3 += mp.sableM3
    })
    parCategorie[cat] = {
      lab: CATEGORIES_MUR[cat].lab, categorie: cat,
      surfBrute: c.brute, surfOuvertures: c.ouvertures, surfPoteaux: c.poteaux, surfNette: c.nette,
      Ldev: c.Ldev,
      epaisseurs: [...new Set(Object.values(c.parType).map((x) => x.ep))],
      types, blocsExact, blocs, mortierM3, cimentSacs, sableM3,
      enduitInt: c.enduitInt, enduitExt: c.enduitExt,
      ...(c.hydrofuge ? { enduitHydrofuge: c.hydrofuge } : {}),
      ...(c.detail ? { detail: c.detail } : {}),
    }
  })

  const Smur = Object.values(parType).reduce((s, v) => s + v.surf, 0)
  return {
    murs: detail, parType, parCategorie,
    soubassement: parCategorie.soubassement || null, soubassementACompleter: aCompleter,
    Ldev, LdevPorteurs, Smur, Souv, enduitInt, enduitExt,
    mortierPoseM3, cimentPoseSacs, sablePoseM3,
    nbPortes, nbFenetres, HSP, alertes,
  }
}
