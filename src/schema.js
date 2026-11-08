// @ts-check
// src/schema.js
// Validation des entrées sensibles — sans dépendance externe (le moteur n'en a aucune).
// Renvoie { erreurs, alertes } : les erreurs sont des violations de schéma (dimension négative, prix négatif,
// unité incohérente…) ; chacune est aussi remontée en alerte BLOQUANTE. Le moteur ne lève jamais d'exception
// à cause d'une saisie : il neutralise la valeur invalide (les calculs ignorent les dimensions ≤ 0) et le dit.
import { num, K_BORNES, MODES_CHIFFRAGE } from './constants.js'

const nombre = (v) => v !== '' && v !== null && v !== undefined && Number.isFinite(+v)
const present = (v) => v !== '' && v !== null && v !== undefined

const CHAMPS_DIM = {
  murs: ['L', 'H', 'ep', 'pL', 'pH', 'fL', 'fH', 'portes', 'fenetres', 'nb', 'poteaux'],
  poteaux: ['nb', 'a', 'b', 'H'], poutres: ['nb', 'L', 'b', 'h'], voiles: ['nb', 'L', 'ep', 'H'], chainagesV: ['nb', 'a', 'b', 'H'],
}

export function validerEntrees(levels = [], p = {}) {
  const erreurs = []
  const err = (chemin, msg) => erreurs.push({ chemin, msg })

  if (!Array.isArray(levels)) err('levels', 'La liste des niveaux doit être un tableau.')
  ;(Array.isArray(levels) ? levels : []).forEach((lv, i) => {
    const nom = lv?.nom || `Niveau ${i}`
    ;['HSP', 'surfPlancher', 'tremies', 'epDalle', 'perimetre', 'entraxe', 'porteePoutrelle'].forEach((k) => {
      if (present(lv?.[k]) && (!nombre(lv[k]) || +lv[k] < 0)) err(`levels[${i}].${k}`, `${nom} : « ${k} » doit être un nombre positif ou nul (reçu : ${lv[k]}).`)
    })
    Object.entries(CHAMPS_DIM).forEach(([liste, champs]) => {
      ;(lv?.[liste] || []).forEach((el, j) => {
        champs.forEach((k) => {
          if (present(el?.[k]) && (!nombre(el[k]) || +el[k] < 0)) err(`levels[${i}].${liste}[${j}].${k}`, `${nom} — ${liste}[${j + 1}] : « ${k} » négatif ou illisible (${el[k]}).`)
        })
      })
    })
    ;(lv?.pieces || []).forEach((pc, j) => {
      ;['L', 'l', 'H'].forEach((k) => { if (present(pc?.[k]) && (!nombre(pc[k]) || +pc[k] < 0)) err(`levels[${i}].pieces[${j}].${k}`, `${nom} — pièce ${j + 1} : « ${k} » négatif ou illisible.`) })
    })
    ;(lv?.murs || []).forEach((m, j) => {
      if (m?.categorie === 'soubassement' && !(num(m.H) > 0)) err(`levels[${i}].murs[${j}].H`, `${nom} — soubassement ${j + 1} : hauteur à saisir.`)
    })
  })

  // Fondation
  const f = p.fondation || {}
  ;['semL', 'semH', 'profFouille', 'epProprete', 'epRadier', 'lineaire'].forEach((k) => {
    if (present(f[k]) && (!nombre(f[k]) || +f[k] < 0)) err(`fondation.${k}`, `Fondation : « ${k} » négatif ou illisible (${f[k]}).`)
  })
  ;(f.semelles || []).forEach((s, j) => {
    ;['nb', 'L', 'l', 'h', 'prof', 'Lba', 'lba'].forEach((k) => { if (present(s?.[k]) && (!nombre(s[k]) || +s[k] < 0)) err(`fondation.semelles[${j}].${k}`, `Semelle ${s?.type || j + 1} : « ${k} » négatif ou illisible.`) })
  })
  ;['chainages', 'longrines'].forEach((lst) => (f[lst] || []).forEach((c, j) => {
    ;['nb', 'L', 'b', 'h', 'bF', 'prof'].forEach((k) => { if (present(c?.[k]) && (!nombre(c[k]) || +c[k] < 0)) err(`fondation.${lst}[${j}].${k}`, `${lst} ${c?.nom || j + 1} : « ${k} » négatif ou illisible.`) })
  }))
  const T = f.terrassement || {}
  ;['cf', 'cp'].forEach((k) => { if (present(T[k]) && (!nombre(T[k]) || +T[k] < 1)) err(`fondation.terrassement.${k}`, `Terrassement : le coefficient « ${k} » doit être ≥ 1 (reçu : ${T[k]}).`) })
  if (present(T.reemploi?.taux) && (!nombre(T.reemploi.taux) || +T.reemploi.taux < 0 || +T.reemploi.taux > 1)) err('fondation.terrassement.reemploi.taux', 'Terrassement : le taux de réemploi doit être compris entre 0 et 1.')

  // Paramètres projet
  if (p.modeChiffrage !== undefined && !MODES_CHIFFRAGE[p.modeChiffrage]) err('modeChiffrage', `Mode de chiffrage inconnu « ${p.modeChiffrage} » (attendu : compose | decompose) — « compose » appliqué.`)
  if (present(p.K)) {
    if (!nombre(p.K) || +p.K <= 0) err('K', `Coefficient K invalide (${p.K}).`)
    else if (!p.autoriserKHorsBornes && (+p.K < K_BORNES.min || +p.K > K_BORNES.max)) err('K', `Coefficient K = ${p.K} hors des bornes admises [${K_BORNES.min} ; ${K_BORNES.max}] — corrigez-le ou autorisez-le explicitement (autoriserKHorsBornes).`)
  }
  ;['pertesAgglo', 'pertesBrique'].forEach((k) => { if (present(p[k]) && (!nombre(p[k]) || +p[k] < 0 || +p[k] > 50)) err(k, `Pertes « ${k} » hors plage [0 ; 50] %.`) })
  Object.entries(p.ratiosAcier || {}).forEach(([k, v]) => { if (present(v) && (!nombre(v) || +v < 0)) err(`ratiosAcier.${k}`, `Ratio d'acier « ${k} » négatif ou illisible.`) })
  Object.entries(p.mortier?.parType || {}).forEach(([t, v]) => {
    ;['blocsM2', 'mortierM3M2', 'dosageKgM3', 'blocsParSac'].forEach((k) => { if (present(v?.[k]) && (!nombre(v[k]) || +v[k] <= 0)) err(`mortier.parType.${t}.${k}`, `Mortier ${t} : « ${k} » doit être > 0.`) })
  })
  return { erreurs, alertes: erreurs.map((e) => ({ niveau: 'bloquante', msg: `Donnée invalide — ${e.msg}`, chemin: e.chemin })) }
}

/** Valide un barème de prix {code: pu} : renvoie les erreurs (prix négatif / non numérique). */
export function validerPrix(prixMap = {}) {
  const erreurs = []
  Object.entries(prixMap).forEach(([code, v]) => {
    if (v === undefined || v === null || v === '') return
    if (!nombre(v) || +v < 0) erreurs.push({ code, msg: `Prix négatif ou illisible pour « ${code} » (${v}).` })
  })
  return erreurs
}

/** Valide un plan lu (extraction) avant métré : renvoie les erreurs bloquantes de schéma. */
export function validerPlanLu(plans = {}) {
  const erreurs = []
  const t = plans?.toiture
  if (t) {
    ;['pente', 'surfaceProjetee', 'L', 'l', 'debord'].forEach((k) => { if (present(t[k]) && (!nombre(t[k]) || +t[k] < 0)) erreurs.push({ chemin: `plans.toiture.${k}`, msg: `Plan de toiture : « ${k} » négatif ou illisible.` }) })
    ;(t.pans || []).forEach((x, j) => { if (present(x?.surface) && (!nombre(x.surface) || +x.surface < 0)) erreurs.push({ chemin: `plans.toiture.pans[${j}].surface`, msg: `Plan de toiture : surface du pan ${j + 1} négative.` }) })
  }
  return erreurs
}
