// src/murs.js
// Murs, enduits par face et blocs par type, pour un niveau (A4, A6).
import { num, round2, TYPES_MUR, MURS_PORTEURS, PARAMS_DEFAUT } from './constants.js'

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

export function metrerMurs(level, p) {
  const ouv = p.ouv || PARAMS_DEFAUT.ouv
  const HSP = num(level.HSP) || num(p.Hetage, 3)
  const murs = (level.murs && level.murs.length) ? level.murs : mursDepuisPieces(level, p)

  const parType = {}   // { agglo15: { surf, blocs, detail[] }, … }
  let Ldev = 0, LdevPorteurs = 0, Souv = 0, enduitInt = 0, enduitExt = 0
  let nbPortes = 0, nbFenetres = 0
  const detail = []

  murs.forEach((m) => {
    const t = TYPES_MUR[m.type] ? m.type : 'agglo15'
    const nb = num(m.nb, 1) || 1
    const L = num(m.L), H = num(m.H) || HSP
    if (L <= 0 || H <= 0) return
    const np = num(m.portes), nf = num(m.fenetres)
    const pL = num(m.pL, ouv.pL), pH = num(m.pH, ouv.pH)
    const fL = num(m.fL, ouv.fL), fH = num(m.fH, ouv.fH)
    const sOuv = np * pL * pH + nf * fL * fH
    const brute = nb * L * H
    const nette = Math.max(0, brute - nb * sOuv)

    if (!parType[t]) parType[t] = { surf: 0, blocs: 0, detail: [] }
    parType[t].surf = round2(parType[t].surf + nette)
    parType[t].detail.push({
      lib: m.nom || TYPES_MUR[t].lab,
      formule: `${nb} × ${L} × ${H}${sOuv ? ` − ${round2(nb * sOuv)} (ouv.)` : ''}`,
      q: round2(nette), u: 'm²',
    })

    Ldev += nb * L
    if (MURS_PORTEURS.includes(t)) LdevPorteurs += nb * L
    Souv += nb * sOuv
    nbPortes += nb * np; nbFenetres += nb * nf

    // Enduits par face (A6)
    const pos = m.position || 'interieur'
    if (pos === 'exterieur') { enduitExt += nette; enduitInt += nette }
    else if (pos === 'mitoyen') { enduitInt += nette }
    else { enduitInt += 2 * nette }

    detail.push({ ...m, type: t, surfNette: round2(nette) })
  })

  // Blocs par type, avec pertes par matériau
  Object.entries(parType).forEach(([t, v]) => {
    const inf = TYPES_MUR[t]
    const pertes = 1 + num(p[inf.pertesKey], inf.pertesKey === 'pertesBrique' ? 8 : 7) / 100
    v.blocs = Math.round(v.surf * inf.blocsM2 * pertes)
  })

  const Smur = round2(Object.values(parType).reduce((s, v) => s + v.surf, 0))
  return {
    murs: detail, parType,
    Ldev: round2(Ldev), LdevPorteurs: round2(LdevPorteurs),
    Smur, Souv: round2(Souv),
    enduitInt: round2(enduitInt), enduitExt: round2(enduitExt),
    nbPortes, nbFenetres, HSP,
  }
}
