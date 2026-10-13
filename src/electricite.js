// src/electricite.js
// Plan d'électricité (NF C 15-100 / IEC 60617) — décompte par type de symbole.
// Module « Lots techniques (souvent forfait / point) » du document de
// codification des plans.
//
// Entrée = DONNÉES BRUTES lues puis validées par l'utilisateur :
//   elements : [{ type, nb, piece?, repere? }]
//     type   : point_lumineux | interrupteur_simple | va_et_vient |
//              bouton_poussoir | prise_16a | prise_specialisee | rj45 | tableau
//     repere : pour un tableau, « TGBT » ou « TD » ; pour une prise
//              spécialisée, l'usage / la puissance lue (ex. « cuisinière 32A »).
import { num } from './constants.js'

export const TYPES_ELECTRIQUES = {
  point_lumineux:     { lab: 'Points lumineux',                 groupe: 'point'    },
  interrupteur_simple:{ lab: 'Interrupteurs simples',           groupe: 'commande' },
  va_et_vient:        { lab: 'Va-et-vient',                     groupe: 'commande' },
  bouton_poussoir:    { lab: 'Boutons poussoirs',               groupe: 'commande' },
  prise_16a:          { lab: 'Prises de courant 16 A',          groupe: 'point'    },
  prise_specialisee:  { lab: 'Prises spécialisées (circuit dédié)', groupe: 'point' },
  rj45:               { lab: 'Prises RJ45 / VDI',               groupe: 'point'    },
  tableau:            { lab: 'Tableaux électriques (TGBT / TD)', groupe: 'tableau'  },
}

const sansAccent = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

/** Tolère les libellés usuels (« VV », « prise 16A », « RJ45 », « TGBT »…). */
export function normaliserElementElec(t) {
  const s = sansAccent(t).replace(/[\s_-]+/g, ' ')
  if (TYPES_ELECTRIQUES[String(t)]) return String(t)
  if (/^(vv|va et vient|va-et-vient)/.test(s) || /va ?et ?vient/.test(s)) return 'va_et_vient'
  if (/(bouton|poussoir|^bp$)/.test(s)) return 'bouton_poussoir'
  if (/interrupteur/.test(s)) return 'interrupteur_simple'
  if (/(rj ?45|vdi|informatique|telephone)/.test(s)) return 'rj45'
  if (/(specialis|dedie|cuisiniere|chauffe|climatis|lave)/.test(s)) return 'prise_specialisee'
  if (/(prise|^pc$|16 ?a)/.test(s)) return 'prise_16a'
  if (/(tgbt|^td$|tableau|coffret)/.test(s)) return 'tableau'
  if (/(lumin|luminaire|lampe|spot|applique|plafonnier|eclairage)/.test(s)) return 'point_lumineux'
  return null
}

export function metrerElectricite(ex = {}) {
  const parType = {}
  const parPiece = {}
  const tableaux = {}
  const ignores = []
  const alertes = []
  const add = (niveau, msg) => alertes.push({ niveau, msg })

  ;(ex.elements || []).forEach((e) => {
    const k = normaliserElementElec(e.type)
    const nb = num(e.nb, 1) || 1
    if (!k) { ignores.push(String(e.type ?? '?')); return }
    parType[k] = (parType[k] || 0) + nb
    if (e.piece) {
      const P = (parPiece[e.piece] ||= {})
      P[k] = (P[k] || 0) + nb
    }
    if (k === 'tableau') {
      const lu = `${e.repere || ''} ${e.type || ''}`
      const r = /tgbt|g[ée]n[ée]ral/i.test(lu) ? 'TGBT' : /\btd\b|divisionnaire/i.test(lu) ? 'TD' : 'Tableau'
      tableaux[r] = (tableaux[r] || 0) + nb
    }
  })

  const n = (k) => parType[k] || 0
  const nbPointsLumineux = n('point_lumineux')
  const nbCommandes = n('interrupteur_simple') + n('va_et_vient') + n('bouton_poussoir')
  const nbPrises = n('prise_16a') + n('prise_specialisee') + n('rj45')
  // Convention « forfait / point » : un point = un point d'utilisation
  // (lumière, prise de courant, prise spécialisée, RJ45). L'appareillage de
  // commande et les tableaux sont comptés à part.
  const nbPointsForfait = nbPointsLumineux + nbPrises
  const nbTableaux = n('tableau')

  const detail = Object.entries(parType).map(([k, q]) => ({
    lib: TYPES_ELECTRIQUES[k].lab, formule: `${q} u`, q, u: 'u',
  }))

  // ── Cohérence ──
  if (nbPointsLumineux > 0 && nbTableaux === 0) {
    add('attention', 'Plan électrique : aucun tableau (TGBT / TD) lu — à ajouter au décompte.')
  }
  if (nbPointsLumineux > 0 && nbCommandes === 0) {
    add('attention', `Plan électrique : ${nbPointsLumineux} point(s) lumineux mais aucun appareillage de commande lu (interrupteurs, VV, BP).`)
  }
  if (n('va_et_vient') % 2 === 1) {
    add('attention', `Plan électrique : nombre impair de va-et-vient (${n('va_et_vient')}) — un circuit va-et-vient comporte au moins deux commandes ; un symbole a probablement été oublié ou mal classé.`)
  }
  if (ignores.length) {
    add('info', `Plan électrique : ${ignores.length} élément(s) ignoré(s), type de symbole non identifié (${[...new Set(ignores)].slice(0, 4).join(', ')}).`)
  }

  return {
    parType, parPiece, tableaux, detail,
    nbPointsLumineux, nbCommandes, nbPrises, nbPointsForfait, nbTableaux,
    alertes,
  }
}
