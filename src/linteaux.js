// src/linteaux.js
// Linteaux générés automatiquement depuis les ouvertures des murs (A2).
import { num, qte, round2, PARAMS_DEFAUT } from './constants.js'

export function metrerLinteaux(mursInfo, p) {
  const lt = p.linteau || PARAMS_DEFAUT.linteau
  const ouv = p.ouv || PARAMS_DEFAUT.ouv
  const detail = []
  let vol = 0
  mursInfo.murs.forEach((m) => {
    if (m.categorie === 'soubassement') return // pas de baies en soubassement
    const nb = qte(m.nb)
    const np = num(m.portes) * nb, nf = num(m.fenetres) * nb
    if (np > 0) {
      const L = num(m.pL, ouv.pL) + 2 * lt.appui
      const v = np * L * lt.b * lt.h
      vol += v
      detail.push({ lib: `Linteaux portes — ${m.nom || 'mur'}`, formule: `${np} × ${round2(L)} × ${lt.b} × ${lt.h}`, q: round2(v), u: 'm³' })
    }
    if (nf > 0) {
      const L = num(m.fL, ouv.fL) + 2 * lt.appui
      const v = nf * L * lt.b * lt.h
      vol += v
      detail.push({ lib: `Linteaux fenêtres — ${m.nom || 'mur'}`, formule: `${nf} × ${round2(L)} × ${lt.b} × ${lt.h}`, q: round2(v), u: 'm³' })
    }
  })
  return { vol, detail }
}
