// src/toiture.js
// Plan de toiture — surface développée à partir de la pente lue (en %) et
// linéaires de faîtage, noues, égouts, chéneaux. Module « Couverture,
// charpente » du document de codification des plans.
//
// Surface développée = surface en plan × √(1 + (pente/100)²).
//
// Entrée = DONNÉES BRUTES lues puis validées par l'utilisateur :
//   pente          : pente générale en % (si une seule pente sur le plan)
//   pans           : [{ nom?, pente, surface }]  surface = emprise en plan du pan (m²)
//   L, l, debord   : dimensions hors-tout du bâtiment en plan et débord (m)
//   surfaceProjetee: surface totale en plan lue (m²), à défaut de pans / L×l
//   faitages / noues / egouts / cheneaux : [{ nom?, L }]  (m)
//   pignons        : [{ nom?, nb?, h, L1, L2?, P1, P2?, type? }] — murs de pignon (triangles sous toiture).
//
// SURFACE DE COUVERTURE (celle qui est facturée) :
//   • pente lue (générale ou par pan) : surface projetée × √(1+(pente/100)²)           → méthode « pente »
//   • sinon, si un coefficient forfaitaire est fourni (ctx.coefDefaut = TOITURES[type].coef) :
//     surface projetée × coefficient forfaitaire                                         → méthode « forfait »
//   La surface projetée est celle LUE (surface annoncée, pans, ou dimensions hors-tout + 2 × débord) : on ne
//   retombe sur l'emprise du bâtiment que si rien d'autre n'est lu. La formule affichée est celle appliquée.
import { num, qte, round2 } from './constants.js'

const somme = (liste) => round2((liste || []).reduce((s, x) => s + num(typeof x === 'object' ? x?.L : x) * (typeof x === 'object' ? qte(x?.nb) : 1), 0))
const coefPente = (pct) => Math.sqrt(1 + (num(pct) / 100) ** 2)

/**
 * Surface des TRIANGLES de pignon (partie de maçonnerie au-dessus de l'égout) — Lot C :
 *   S = L1²·P1/2 + L2²·P2/2   (P = tan α, sans unité ; L1, L2 = demi-largeurs horizontales)
 * La partie rectangulaire h × (L1 + L2) est déjà dans les murs d'élévation (hauteur jusqu'à l'égout).
 * Pente unique : L2 = 0. Double pente symétrique : L1 = L2, P1 = P2.
 */
export function surfaceTrianglesPignon({ L1 = 0, L2 = 0, P1 = 0, P2 = 0 } = {}) {
  const l1 = num(L1), l2 = num(L2), p1 = num(P1), p2 = num(P2)
  return (l1 * l1 * p1) / 2 + (l2 * l2 * p2) / 2
}

/**
 * @param {Object} ex   extraction validée du plan de toiture
 * @param {{emprise?: number, coefDefaut?: number}} ctx  emprise au sol du projet (repli) ; coefficient forfaitaire du type de couverture
 */
export function metrerToiture(ex = {}, ctx = {}) {
  const alertes = []
  const add = (niveau, msg) => alertes.push({ niveau, msg })
  const debord = Math.max(0, num(ex.debord))
  // Coefficient forfaitaire du type de couverture, pour un pan dont la pente est inconnue.
  const coefDefaut = num(ctx.coefDefaut) > 0 ? num(ctx.coefDefaut) : 1

  // ── Surface en plan + coefficient de pente ──
  // Un pan lu avec une surface n'est JAMAIS écarté : s'il n'a pas de pente propre,
  // il prend la pente générale du plan ; à défaut, il reste compté à plat
  // (coefficient 1) et une alerte demande la pente. Avant, un pan sans pente
  // disparaissait en silence du devis.
  let surfProjetee = 0, surfDeveloppee = 0, source = null
  let pansSansPente = 0
  const penteGen = ex.pente !== null && ex.pente !== undefined && ex.pente !== '' ? num(ex.pente, NaN) : NaN
  const penteValide = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(+v) && +v >= 0
  const pans = (ex.pans || []).filter((p) => num(p.surface) > 0)

  if (pans.length) {
    pans.forEach((p) => {
      const s = num(p.surface)
      surfProjetee += s
      if (penteValide(p.pente)) surfDeveloppee += s * coefPente(p.pente)
      else if (Number.isFinite(penteGen)) surfDeveloppee += s * coefPente(penteGen)
      else { surfDeveloppee += s * coefDefaut; pansSansPente += 1 }
    })
    source = 'pans'
    if (pansSansPente) {
      add('attention', `Plan de toiture : ${pansSansPente} pan(s) sans pente lue — surface majorée du coefficient forfaitaire de la couverture (×${coefDefaut}). Confirmez la pente à appliquer.`)
    }
    // Les pans lus doivent couvrir la surface en plan annoncée : sinon un pan manque.
    const ref = num(ex.surfaceProjetee) > 0 ? num(ex.surfaceProjetee)
      : (num(ex.L) > 0 && num(ex.l) > 0 ? (num(ex.L) + 2 * debord) * (num(ex.l) + 2 * debord) : 0)
    if (ref > 0 && surfProjetee < 0.9 * ref) {
      add('attention', `Plan de toiture : les pans lus couvrent ${round2(surfProjetee)} m² en plan pour ${round2(ref)} m² annoncés — un pan semble manquer.`)
    }
  } else {
    if (num(ex.surfaceProjetee) > 0) { surfProjetee = num(ex.surfaceProjetee); source = 'surface lue' }
    else if (num(ex.L) > 0 && num(ex.l) > 0) { surfProjetee = (num(ex.L) + 2 * debord) * (num(ex.l) + 2 * debord); source = 'dimensions + débord' }
    else if (num(ctx.emprise) > 0) {
      surfProjetee = num(ctx.emprise); source = 'emprise du projet'
      add('info', `Plan de toiture : ni surface ni dimensions lues — surface en plan prise égale à l'emprise (${round2(surfProjetee)} m²), débord non intégré.`)
    }
    if (surfProjetee > 0 && Number.isFinite(penteGen)) surfDeveloppee = surfProjetee * coefPente(penteGen)
  }
  surfProjetee = round2(surfProjetee)
  surfDeveloppee = round2(surfDeveloppee)

  // Pente moyenne pondérée par la surface, sur les seuls pans dont la pente est connue.
  const penteDe = (p) => (penteValide(p.pente) ? +p.pente : (Number.isFinite(penteGen) ? penteGen : null))
  const pansPente = pans.filter((p) => penteDe(p) !== null)
  const pentePct = pansPente.length
    ? round2(pansPente.reduce((s, p) => s + penteDe(p) * num(p.surface), 0) / pansPente.reduce((s, p) => s + num(p.surface), 0))
    : (!pans.length && Number.isFinite(penteGen) ? penteGen : null)

  // Surface de couverture facturée : pente lue, sinon forfait × surface projetée LUE.
  let surfCouverture = 0, methode = null, coefApplique = null
  if (surfDeveloppee > 0) {
    surfCouverture = surfDeveloppee
    coefApplique = surfProjetee > 0 ? surfDeveloppee / surfProjetee : null
    methode = 'pente'
  } else if (surfProjetee > 0 && num(ctx.coefDefaut) > 0) {
    surfCouverture = surfProjetee * coefDefaut
    coefApplique = coefDefaut
    methode = 'forfait'
    add('attention', `Plan de toiture : pente non lue — surface de couverture = surface en plan lue (${round2(surfProjetee)} m², source : ${source}) × coefficient forfaitaire ${coefDefaut}. Confirmez la pente (%) pour un calcul exact.`)
  } else if (surfProjetee > 0) {
    add('attention', `Plan de toiture : pente non lue et aucun coefficient forfaitaire fourni — surface en plan lue ${round2(surfProjetee)} m² non développée.`)
  } else {
    add('attention', 'Plan de toiture : pente ou surface illisible — aucune surface de couverture calculée à partir du plan.')
  }
  surfCouverture = round2(surfCouverture)

  // Pignons (triangles sous toiture) : comptés si les données (L1, pente P1) sont saisies.
  const pignons = { nb: 0, surfTriangles: 0, lignes: [] }
  ;(ex.pignons || []).forEach((g, i) => {
    const nb = qte(g.nb)
    const l1 = num(g.L1), l2 = num(g.L2), p1 = num(g.P1), p2 = num(g.P2)
    if (nb <= 0) return
    if (!(l1 > 0 && p1 > 0) && !(l2 > 0 && p2 > 0)) {
      add('attention', `Pignon « ${g.nom || i + 1} » : largeur de versant (L1) et pente (P1) à saisir — pignon non compté.`)
      return
    }
    const s1 = surfaceTrianglesPignon({ L1: l1, L2: l2, P1: p1, P2: p2 })
    pignons.nb += nb
    pignons.surfTriangles += nb * s1
    pignons.lignes.push({ nom: g.nom || `Pignon ${i + 1}`, nb, type: g.type || null, h: num(g.h) || null, surf: s1, formule: `${l1}² × ${p1} / 2${l2 > 0 ? ` + ${l2}² × ${p2} / 2` : ''}` })
  })

  const faitageL = somme(ex.faitages), noueL = somme(ex.noues), egoutL = somme(ex.egouts), cheneauL = somme(ex.cheneaux)
  const detail = []
  if (methode === 'pente') {
    detail.push({
      lib: `Surface développée (${source})`,
      formule: `${surfProjetee} m² × √(1+(${pentePct}/100)²) = ${surfDeveloppee} m²`,
      q: surfDeveloppee, u: 'm²',
    })
  } else if (methode === 'forfait') {
    detail.push({
      lib: `Surface de couverture (${source}, coefficient forfaitaire)`,
      formule: `${surfProjetee} m² × ${coefDefaut} (forfait, pente non lue) = ${surfCouverture} m²`,
      q: surfCouverture, u: 'm²',
    })
  }
  if (faitageL > 0) detail.push({ lib: 'Faîtage', formule: `${faitageL} m`, q: faitageL, u: 'ml' })
  if (noueL > 0) detail.push({ lib: 'Noues', formule: `${noueL} m`, q: noueL, u: 'ml' })
  if (egoutL > 0) detail.push({ lib: 'Égouts', formule: `${egoutL} m`, q: egoutL, u: 'ml' })
  if (cheneauL > 0) detail.push({ lib: 'Chéneaux', formule: `${cheneauL} m`, q: cheneauL, u: 'ml' })

  return {
    pentePct, debord, source, pansSansPente, nbPans: pans.length,
    surfProjetee, surfDeveloppee, surfCouverture, methode, coefApplique: coefApplique === null ? null : round2(coefApplique),
    pignons: { ...pignons, surfTriangles: round2(pignons.surfTriangles) },
    coefMoyen: surfProjetee > 0 && surfDeveloppee > 0 ? round2(surfDeveloppee / surfProjetee) : null,
    faitageL, noueL, egoutL, cheneauL,
    detail, alertes,
  }
}
