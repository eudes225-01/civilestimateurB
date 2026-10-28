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
import { num, round2 } from './constants.js'

const somme = (liste) => round2((liste || []).reduce((s, x) => s + num(typeof x === 'object' ? x?.L : x) * (num(x?.nb, 1) || 1), 0))
const coefPente = (pct) => Math.sqrt(1 + (num(pct) / 100) ** 2)

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

  if (surfDeveloppee <= 0) {
    add('attention', 'Plan de toiture : pente ou surface illisible — la surface de couverture reste calculée avec le coefficient standard du type de toiture.')
  }

  const faitageL = somme(ex.faitages), noueL = somme(ex.noues), egoutL = somme(ex.egouts), cheneauL = somme(ex.cheneaux)
  const detail = []
  if (surfDeveloppee > 0) {
    detail.push({
      lib: `Surface développée (${source})`,
      formule: `${surfProjetee} m² × √(1+(${pentePct}/100)²) = ${surfDeveloppee} m²`,
      q: surfDeveloppee, u: 'm²',
    })
  }
  if (faitageL > 0) detail.push({ lib: 'Faîtage', formule: `${faitageL} m`, q: faitageL, u: 'ml' })
  if (noueL > 0) detail.push({ lib: 'Noues', formule: `${noueL} m`, q: noueL, u: 'ml' })
  if (egoutL > 0) detail.push({ lib: 'Égouts', formule: `${egoutL} m`, q: egoutL, u: 'ml' })
  if (cheneauL > 0) detail.push({ lib: 'Chéneaux', formule: `${cheneauL} m`, q: cheneauL, u: 'ml' })

  return {
    pentePct, debord, source, pansSansPente, nbPans: pans.length,
    surfProjetee, surfDeveloppee,
    coefMoyen: surfProjetee > 0 && surfDeveloppee > 0 ? round2(surfDeveloppee / surfProjetee) : null,
    faitageL, noueL, egoutL, cheneauL,
    detail, alertes,
  }
}
