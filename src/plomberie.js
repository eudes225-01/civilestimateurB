// src/plomberie.js
// Plan de plomberie — décompte des appareils sanitaires et des linéaires de
// canalisation par réseau (EF, EC, EU, EV, EP, AEP) et par diamètre, plus les
// regards. Module « Appareils sanitaires, assainissement » du document de
// codification des plans.
//
// Entrée = DONNÉES BRUTES lues puis validées par l'utilisateur (aucun calcul
// côté lecture) :
//   appareils : [{ type, nb, piece? }]
//   reseaux   : [{ reseau, diam, L, pente?, nom? }]   (L en m, pente en %)
//   regards   : [{ nom?, nb }]
// Sortie = quantités déterministes + alertes de cohérence.
import { num, round2 } from './constants.js'

export const RESEAUX_PLOMBERIE = {
  EF:  { lab: 'Eau froide',                  evac: false },
  EC:  { lab: 'Eau chaude',                  evac: false },
  AEP: { lab: 'Adduction eau potable',       evac: false },
  EU:  { lab: 'Eaux usées',                  evac: true  },
  EV:  { lab: 'Eaux vannes',                 evac: true  },
  EP:  { lab: 'Eaux pluviales',              evac: true  },
}

export const APPAREILS_SANITAIRES = {
  wc:        { lab: 'WC' },
  lavabo:    { lab: 'Lavabo / vasque' },
  douche:    { lab: 'Douche' },
  baignoire: { lab: 'Baignoire' },
  evier:     { lab: 'Évier' },
  autre:     { lab: 'Autre appareil' },
}

const sansAccent = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

/** « WC », « toilette » → 'wc' ; « Évier » → 'evier' ; inconnu → 'autre'. */
export function normaliserAppareil(t) {
  const s = sansAccent(t)
  if (/^(wc|toilette|water)/.test(s)) return 'wc'
  if (/(lavabo|vasque|lave-?main)/.test(s)) return 'lavabo'
  if (/douche/.test(s)) return 'douche'
  if (/baignoire/.test(s)) return 'baignoire'
  if (/evier/.test(s)) return 'evier'
  return 'autre'
}

/** « eau froide », « ef », « EU » → 'EF' / 'EU' ; inconnu → null. */
export function normaliserReseau(r) {
  const s = sansAccent(r).toUpperCase().replace(/[^A-Z]/g, '')
  if (RESEAUX_PLOMBERIE[s]) return s
  const t = sansAccent(r)
  if (/eau\s*froide/.test(t)) return 'EF'
  if (/eau\s*chaude/.test(t)) return 'EC'
  if (/vanne/.test(t)) return 'EV'
  if (/usee/.test(t)) return 'EU'
  if (/pluvi/.test(t)) return 'EP'
  if (/potable|adduction/.test(t)) return 'AEP'
  return null
}

export function metrerPlomberie(ex = {}) {
  const appareils = {}
  const detail = []
  const alertes = []
  const add = (niveau, msg) => alertes.push({ niveau, msg })

  ;(ex.appareils || []).forEach((a) => {
    const nb = num(a.nb, 1) || 1
    const k = normaliserAppareil(a.type)
    appareils[k] = (appareils[k] || 0) + nb
  })
  const nbAppareils = Object.values(appareils).reduce((s, n) => s + n, 0)
  Object.entries(appareils).forEach(([k, n]) => {
    detail.push({ lib: APPAREILS_SANITAIRES[k].lab, formule: `${n} u`, q: n, u: 'u' })
  })

  const reseaux = {}
  let sansPente = 0, reseauInconnu = 0
  ;(ex.reseaux || []).forEach((r) => {
    const k = normaliserReseau(r.reseau)
    const L = num(r.L)
    if (L <= 0) return
    if (!k) { reseauInconnu++; return }
    const nb = num(r.nb, 1) || 1
    const diam = num(r.diam)
    const dKey = diam > 0 ? String(diam) : 'n.c.'
    const R = (reseaux[k] ||= { L: 0, parDiam: {} })
    const ml = round2(nb * L)
    R.L = round2(R.L + ml)
    R.parDiam[dKey] = round2((R.parDiam[dKey] || 0) + ml)
    if (RESEAUX_PLOMBERIE[k].evac && !(num(r.pente) > 0)) sansPente++
  })
  Object.entries(reseaux).forEach(([k, R]) => {
    const parts = Object.entries(R.parDiam).map(([d, l]) => `${d === 'n.c.' ? 'Ø n.c.' : `Ø${d}`} : ${l} m`).join(' ; ')
    detail.push({ lib: `Réseau ${k} — ${RESEAUX_PLOMBERIE[k].lab}`, formule: parts, q: R.L, u: 'ml' })
  })
  const longueurTotale = round2(Object.values(reseaux).reduce((s, R) => s + R.L, 0))

  const nbRegards = (ex.regards || []).reduce((s, r) => s + (num(r.nb, 1) || 1), 0)
  if (nbRegards > 0) detail.push({ lib: 'Regards', formule: `${nbRegards} u`, q: nbRegards, u: 'u' })

  // ── Cohérence ──
  if (nbAppareils > 0 && !reseaux.EF && !reseaux.AEP) {
    add('attention', `Plan de plomberie : ${nbAppareils} appareil(s) sanitaire(s) mais aucune canalisation d'alimentation (EF / AEP) lue — linéaires d'eau froide à compléter.`)
  }
  if ((appareils.wc || 0) > 0 && !reseaux.EV && !reseaux.EU) {
    add('attention', `Plan de plomberie : ${appareils.wc} WC sans réseau d'évacuation (EV / EU) lu — linéaires d'évacuation à compléter.`)
  }
  if (sansPente > 0) {
    add('info', `Plan de plomberie : ${sansPente} tronçon(s) d'évacuation sans pente lue (%) — à vérifier sur plan avant exécution.`)
  }
  if (reseauInconnu > 0) {
    add('info', `Plan de plomberie : ${reseauInconnu} tronçon(s) ignoré(s) car le réseau (EF, EC, EU, EV, EP, AEP) n'a pas pu être identifié.`)
  }

  return { nbAppareils, appareils, reseaux, longueurTotale, nbRegards, detail, alertes }
}

// ── Valeurs proposées quand la lecture est insuffisante ─────────────────────
// Listes fermées parmi lesquelles l'utilisateur choisit lorsque le plan ne
// donne pas la valeur (diamètre ou pente illisible). Diamètres extérieurs
// commerciaux courants (mm) ; à valider par le professionnel responsable.
export const DIAMETRES_PLOMBERIE = {
  EF:  [16, 20, 25, 32, 40, 50],
  EC:  [16, 20, 25, 32],
  AEP: [20, 25, 32, 40, 50, 63],
  EU:  [32, 40, 50, 63, 75, 100],
  EV:  [100, 110, 125, 160],
  EP:  [63, 75, 100, 125, 160],
}
/** Pentes d'évacuation proposées (%). */
export const PENTES_EVACUATION = [1, 2, 3, 5]

/** Diamètres proposés pour un réseau (tous réseaux confondus si inconnu). */
export function diametresPour(reseau) {
  const k = normaliserReseau(reseau)
  if (k) return DIAMETRES_PLOMBERIE[k]
  return [...new Set(Object.values(DIAMETRES_PLOMBERIE).flat())].sort((a, b) => a - b)
}

/**
 * Données manquantes ou ambiguës dans une lecture de plomberie : chaque lacune
 * dit où elle se trouve (liste, ligne, champ) pour que l'écran de vérification
 * propose un choix à cet endroit précis. Ne calcule rien.
 * @returns {{liste: 'appareils'|'reseaux'|'global', ligne: number|null, champ: string|null, msg: string}[]}
 */
export function lacunesPlomberie(ex) {
  const lacunes = []
  const pl = ex || {}
  const appareils = pl.appareils || [], reseaux = pl.reseaux || []
  if (!appareils.length && !reseaux.length) {
    lacunes.push({ liste: 'global', ligne: null, champ: null, msg: 'Aucune donnée de plomberie lisible : ajoutez les appareils et les canalisations.' })
  }
  appareils.forEach((a, i) => {
    if (normaliserAppareil(a.type) === 'autre' && !/autre/i.test(String(a.type ?? ''))) {
      lacunes.push({ liste: 'appareils', ligne: i, champ: 'type', msg: `Appareil n° ${i + 1} : type non reconnu — choisissez dans la liste.` })
    }
  })
  reseaux.forEach((r, i) => {
    const k = normaliserReseau(r.reseau)
    if (!k) lacunes.push({ liste: 'reseaux', ligne: i, champ: 'reseau', msg: `Tronçon n° ${i + 1} : réseau non identifié — choisissez EF, EC, EU, EV, EP ou AEP.` })
    if (!(num(r.diam) > 0)) lacunes.push({ liste: 'reseaux', ligne: i, champ: 'diam', msg: `Tronçon n° ${i + 1} : diamètre non lu — choisissez-en un.` })
    if (!(num(r.L) > 0)) lacunes.push({ liste: 'reseaux', ligne: i, champ: 'L', msg: `Tronçon n° ${i + 1} : longueur non lue — saisissez-la.` })
    if (k && RESEAUX_PLOMBERIE[k].evac && !(num(r.pente) > 0)) lacunes.push({ liste: 'reseaux', ligne: i, champ: 'pente', msg: `Tronçon n° ${i + 1} : pente d'évacuation non lue — choisissez-en une.` })
  })
  return lacunes
}
