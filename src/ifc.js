// src/ifc.js
// Lecteur IFC (STEP, ISO 10303-21) sans dépendance : extrait d'une maquette (ArchiCAD, Revit,
// Allplan…) les quantités qui alimentent le métré — par niveau : murs, dalles, poteaux, poutres,
// portes / fenêtres associées aux murs. Fonctionne dans le navigateur comme sous Node.
//
// Principe du plan d'amélioration : on REPREND les quantités du fichier source (`BaseQuantities`),
// on ne les ressaisit pas. Le lecteur ne calcule aucune géométrie : si un élément n'a pas de
// quantités, il est compté puis signalé (« activez l'export des quantités de base »), jamais inventé.
//
// Sortie : une donnée par niveau au format « vue en plan » de la lecture de plans (même schéma que
// l'extracteur PDF), marquée `source: 'ifc'` pour la règle de priorité (pas de double comptage).
//
// Limites connues (signalées à l'utilisateur) : IFCZIP non géré (extraire le .ifc) ; sections de
// poteaux / poutres lues sur profils rectangulaires et circulaires (autres profils → section
// équivalente tirée de CrossSectionArea, confiance basse) ; dalles de toiture non reprises.
import { num, round2 } from './constants.js'

// ── Découpe STEP ─────────────────────────────────────────────────────────────
function decouper(texte) {
  const debut = texte.search(/\bDATA\s*;/i)
  const data = (debut >= 0 ? texte.slice(debut) : texte).replace(/\/\*[\s\S]*?\*\//g, '')
  const entites = new Map()
  const re = /#(\d+)\s*=\s*([A-Za-z0-9_]+)\s*\(/g
  let m
  while ((m = re.exec(data))) {
    const id = +m[1]
    const type = m[2].toUpperCase()
    let i = re.lastIndex, profondeur = 1, enChaine = false
    for (; i < data.length && profondeur > 0; i++) {
      const c = data[i]
      if (enChaine) { if (c === "'") enChaine = false }
      else if (c === "'") enChaine = true
      else if (c === '(') profondeur++
      else if (c === ')') profondeur--
    }
    entites.set(id, { id, type, brut: data.slice(re.lastIndex, i - 1), a: null })
    re.lastIndex = i
  }
  return entites
}

// ── Arguments STEP → valeurs JS ──────────────────────────────────────────────
// $ → null · * → null · #n → {ref} · 'x' → string · .X. → {enum} · nombre · (liste) · TYPE(v) → {type, v}
function args(e) {
  if (!e) return []
  if (!e.a) e.a = parserListe(e.brut)
  return e.a
}
function parserListe(brut) {
  let i = 0
  const s = `${brut})`
  const blancs = () => { while (i < s.length && /\s/.test(s[i])) i++ }
  const valeur = () => {
    blancs()
    const c = s[i]
    if (c === '$' || c === '*') { i++; return null }
    if (c === '#') { const m = /^#(\d+)/.exec(s.slice(i, i + 12)); i += m[0].length; return { ref: +m[1] } }
    if (c === "'") {
      let out = ''; i++
      while (i < s.length) {
        if (s[i] === "'") { if (s[i + 1] === "'") { out += "'"; i += 2; continue } i++; break }
        out += s[i++]
      }
      return out
    }
    if (c === '.') { const j = s.indexOf('.', i + 1); const e = s.slice(i + 1, j); i = j + 1; return { enum: e.toUpperCase() } }
    if (c === '(') { i++; return liste() }
    const n = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(s.slice(i, i + 40))
    if (n) { i += n[0].length; return parseFloat(n[0]) }
    const m = /^[A-Za-z][A-Za-z0-9_]*/.exec(s.slice(i, i + 80))
    if (m) {
      i += m[0].length; blancs()
      if (s[i] === '(') { i++; const l = liste(); return { type: m[0].toUpperCase(), v: l[0] ?? null } }
      return m[0]
    }
    i++; return null
  }
  const liste = () => {
    const out = []
    blancs()
    if (s[i] === ')') { i++; return out }
    for (;;) {
      out.push(valeur()); blancs()
      if (s[i] === ',') { i++; continue }
      if (s[i] === ')') { i++; break }
      if (i >= s.length) break
      i++
    }
    return out
  }
  return liste()
}

// ── Unités ───────────────────────────────────────────────────────────────────
const PREFIXES = { EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3, HECTO: 1e2, DECA: 10, DECI: 1e-1, CENTI: 1e-2, MILLI: 1e-3, MICRO: 1e-6 }

function unites(E) {
  const f = { length: 1, area: null, volume: null }
  const parTypes = {}
  const facteurSI = (u) => {
    if (!u) return 1
    const a = args(u)
    if (u.type === 'IFCSIUNIT') return PREFIXES[a[2]?.enum] ?? 1
    if (u.type === 'IFCCONVERSIONBASEDUNIT') {
      const mesure = E.get(a[3]?.ref)               // IfcMeasureWithUnit(ValueComponent, UnitComponent)
      const ma = args(mesure)
      const v = typeof ma[0] === 'object' && ma[0] ? num(ma[0].v, 1) : num(ma[0], 1)
      return v * facteurSI(E.get(ma[1]?.ref))
    }
    return 1
  }
  for (const e of E.values()) {
    if (e.type !== 'IFCUNITASSIGNMENT') continue
    for (const r of args(e)[0] || []) {
      const u = E.get(r?.ref); if (!u) continue
      const a = args(u)
      const t = u.type === 'IFCSIUNIT' ? a[1]?.enum : a[1]?.enum
      if (t) parTypes[t] = facteurSI(u)
    }
    break
  }
  f.length = parTypes.LENGTHUNIT ?? 1
  f.area = parTypes.AREAUNIT ?? f.length ** 2
  f.volume = parTypes.VOLUMEUNIT ?? f.length ** 3
  return f
}

// ── Quantités et propriétés par élément ──────────────────────────────────────
const QTYPES = { IFCQUANTITYLENGTH: 'length', IFCQUANTITYAREA: 'area', IFCQUANTITYVOLUME: 'volume', IFCQUANTITYCOUNT: 'count', IFCQUANTITYWEIGHT: 'weight' }

function collecterProprietes(E, U) {
  const quant = new Map()   // id élément → { nomMinuscule: valeur SI }
  const props = new Map()   // id élément → { nomMinuscule: valeur }
  const ajouter = (map, id, k, v) => { if (!map.has(id)) map.set(id, {}); const o = map.get(id); if (!(k in o)) o[k] = v }
  for (const e of E.values()) {
    if (e.type !== 'IFCRELDEFINESBYPROPERTIES') continue
    const a = args(e)
    const objets = (a[4] || []).map((r) => r?.ref).filter(Boolean)
    const def = E.get(a[5]?.ref)
    if (!def || !objets.length) continue
    const da = args(def)
    if (def.type === 'IFCELEMENTQUANTITY') {
      for (const qr of da[5] || []) {
        const q = E.get(qr?.ref); const qt = QTYPES[q?.type]; if (!qt) continue
        const qa = args(q)
        const brut = num(qa[3], NaN); if (!Number.isFinite(brut)) continue
        const v = qt === 'length' ? brut * U.length : qt === 'area' ? brut * U.area : qt === 'volume' ? brut * U.volume : brut
        const k = String(qa[0] || '').toLowerCase().replace(/\s+/g, '')
        objets.forEach((id) => ajouter(quant, id, k, v))
      }
    } else if (def.type === 'IFCPROPERTYSET') {
      for (const pr of da[4] || []) {
        const p = E.get(pr?.ref); if (p?.type !== 'IFCPROPERTYSINGLEVALUE') continue
        const pa = args(p)
        let v = pa[2]
        if (v && typeof v === 'object' && 'v' in v) v = v.v
        if (v && typeof v === 'object' && 'enum' in v) v = v.enum === 'T'
        const k = String(pa[0] || '').toLowerCase().replace(/\s+/g, '')
        objets.forEach((id) => ajouter(props, id, k, v))
      }
    }
  }
  return { quant, props }
}

const premier = (o, ...cles) => { for (const k of cles) if (o && Number.isFinite(o[k]) && o[k] > 0) return o[k]; return null }

// ── Section d'un poteau / d'une poutre ───────────────────────────────────────
function profilDe(E, el, U, profondeurMax = 4) {
  const vu = new Set()
  const suivre = (ref, prof) => {
    const n = E.get(ref?.ref); if (!n || vu.has(n.id) || prof > profondeurMax) return null
    vu.add(n.id)
    const a = args(n)
    switch (n.type) {
      case 'IFCPRODUCTDEFINITIONSHAPE': for (const r of a[2] || []) { const x = suivre(r, prof + 1); if (x) return x } return null
      case 'IFCSHAPEREPRESENTATION': for (const r of a[3] || []) { const x = suivre(r, prof + 1); if (x) return x } return null
      case 'IFCMAPPEDITEM': return suivre(a[0], prof + 1)
      case 'IFCREPRESENTATIONMAP': return suivre(a[1], prof + 1)
      case 'IFCEXTRUDEDAREASOLID': { const p = suivre(a[0], prof + 1); return p ? { ...p, profondeur: num(a[3], 0) * U.length } : null }
      case 'IFCRECTANGLEPROFILEDEF': return { forme: 'rect', a: num(a[3]) * U.length, b: num(a[4]) * U.length }
      case 'IFCCIRCLEPROFILEDEF': { const d = 2 * num(a[3]) * U.length; return { forme: 'rond', a: d, b: d } }
      default: return null
    }
  }
  return suivre(args(el)[6], 0)
}

const R2 = (x) => Math.round(x * 100) / 100
const mediane = (l) => { const t = [...l].sort((x, y) => x - y); return t.length ? t[Math.floor(t.length / 2)] : null }

// ── Lecture ──────────────────────────────────────────────────────────────────
const MURS = new Set(['IFCWALL', 'IFCWALLSTANDARDCASE'])
const POTEAUX = new Set(['IFCCOLUMN', 'IFCCOLUMNSTANDARDCASE'])
const POUTRES = new Set(['IFCBEAM', 'IFCBEAMSTANDARDCASE'])
const PORTES = new Set(['IFCDOOR', 'IFCDOORSTANDARDCASE'])
const FENETRES = new Set(['IFCWINDOW', 'IFCWINDOWSTANDARDCASE'])
const DALLES = new Set(['IFCSLAB', 'IFCSLABSTANDARDCASE', 'IFCSLABELEMENTEDCASE'])

/**
 * @param {string} texte  contenu d'un fichier .ifc
 * @returns {{ok: true, titre: string|null, niveaux: Array, incertitudes: string[], stats: Object} | {ok: false, message: string}}
 */
export function lireIFC(texte) {
  if (typeof texte !== 'string' || !/ISO-10303-21/i.test(texte.slice(0, 2000))) {
    return { ok: false, message: 'Ce fichier n\'est pas un IFC valide (en-tête ISO-10303-21 absent). Exportez à nouveau depuis votre logiciel au format IFC (.ifc).' }
  }
  const E = decouper(texte)
  if (!E.size) return { ok: false, message: 'Aucune entité lue dans le fichier IFC.' }
  const U = unites(E)
  const { quant, props } = collecterProprietes(E, U)
  const incertitudes = []

  // Niveaux
  const etages = [...E.values()].filter((e) => e.type === 'IFCBUILDINGSTOREY').map((e) => {
    const a = args(e)
    return { id: e.id, nom: String(a[7] || a[2] || `Niveau ${e.id}`), elevation: num(a[9], 0) * U.length, items: { murs: [], poteaux: [], poutres: [], dalles: [], portes: [], fenetres: [] } }
  }).sort((x, y) => x.elevation - y.elevation)
  const parId = new Map(etages.map((e) => [e.id, e]))

  // Appartenance aux niveaux
  const etageDe = new Map()
  for (const e of E.values()) {
    if (e.type !== 'IFCRELCONTAINEDINSPATIALSTRUCTURE') continue
    const a = args(e); const st = parId.get(a[5]?.ref); if (!st) continue
    for (const r of a[4] || []) etageDe.set(r?.ref, st)
  }
  // Éléments décomposés (IfcRelAggregates : mur composé de couches, etc.) → niveau du parent
  for (const e of E.values()) {
    if (e.type !== 'IFCRELAGGREGATES') continue
    const a = args(e); const st = etageDe.get(a[4]?.ref); if (!st) continue
    for (const r of a[5] || []) if (!etageDe.has(r?.ref)) etageDe.set(r?.ref, st)
  }

  // Ouvertures : porte / fenêtre → ouverture → mur
  const murDeOuverture = new Map()
  for (const e of E.values()) if (e.type === 'IFCRELVOIDSELEMENT') { const a = args(e); murDeOuverture.set(a[5]?.ref, a[4]?.ref) }
  const murDeRemplissage = new Map()
  for (const e of E.values()) if (e.type === 'IFCRELFILLSELEMENT') { const a = args(e); const mur = murDeOuverture.get(a[4]?.ref); if (mur) murDeRemplissage.set(a[5]?.ref, mur) }

  const nbElements = { murs: 0, poteaux: 0, poutres: 0, dalles: 0, portes: 0, fenetres: 0 }
  let sansNiveau = 0
  const defaut = etages.length ? null : { id: 0, nom: 'RDC', elevation: 0, items: { murs: [], poteaux: [], poutres: [], dalles: [], portes: [], fenetres: [] } }
  if (defaut) etages.push(defaut)
  const placer = (el, cle) => {
    let st = etageDe.get(el.id) || defaut
    if (!st) { sansNiveau++; st = etages[0] }
    st.items[cle].push(el); nbElements[cle]++
  }
  for (const e of E.values()) {
    if (MURS.has(e.type)) placer(e, 'murs')
    else if (POTEAUX.has(e.type)) placer(e, 'poteaux')
    else if (POUTRES.has(e.type)) placer(e, 'poutres')
    else if (DALLES.has(e.type)) placer(e, 'dalles')
    else if (PORTES.has(e.type)) placer(e, 'portes')
    else if (FENETRES.has(e.type)) placer(e, 'fenetres')
  }
  if (sansNiveau) incertitudes.push(`IFC : ${sansNiveau} élément(s) sans niveau défini, rattachés au niveau le plus bas — vérifiez.`)
  if (!nbElements.murs && !nbElements.dalles && !nbElements.poteaux && !nbElements.poutres) {
    return { ok: false, message: 'Aucun mur, dalle, poteau ni poutre trouvé dans ce fichier IFC. Vérifiez que l\'export inclut les éléments de construction (et non seulement des meubles ou des symboles).' }
  }

  let sansQuantites = 0, murTypeInconnu = 0, dallesToiture = 0, aireToiture = 0
  const profilsEquiv = { ronds: 0, autres: 0 }

  const niveaux = etages.map((st) => {
    // ── Murs ──
    const portesParMur = new Map(), fenParMur = new Map()
    const cumul = (map, el) => {
      const mur = murDeRemplissage.get(el.id); if (!mur) return
      if (!map.has(mur)) map.set(mur, [])
      map.get(mur).push(quant.get(el.id) || {})
    }
    st.items.portes.forEach((p) => cumul(portesParMur, p))
    st.items.fenetres.forEach((p) => cumul(fenParMur, p))
    const dims = (l, kL, kH) => {
      const ls = l.map((q) => premier(q, 'width', 'overallwidth')).filter(Boolean)
      const hs = l.map((q) => premier(q, 'height', 'overallheight')).filter(Boolean)
      return ls.length === l.length && hs.length === l.length && l.length ? { [kL]: R2(ls.reduce((s, x) => s + x, 0) / ls.length), [kH]: R2(hs.reduce((s, x) => s + x, 0) / hs.length) } : {}
    }

    const murs = []
    st.items.murs.forEach((el, i) => {
      const q = quant.get(el.id) || {}, p = props.get(el.id) || {}
      const H = premier(q, 'height', 'nominalheight')
      let L = premier(q, 'length')
      if (!L) { const aire = premier(q, 'grosssidearea', 'netsidearea'); if (aire && H) L = aire / H }
      if (!L || !H) { sansQuantites++; return }
      const ep = premier(q, 'width', 'thickness')
      const typeMur = ep === null ? 'inconnu' : Math.abs(ep - 0.10) < 0.011 ? 'agglo10' : Math.abs(ep - 0.15) < 0.011 ? 'agglo15' : Math.abs(ep - 0.20) < 0.011 ? 'agglo20' : 'inconnu'
      if (typeMur === 'inconnu') murTypeInconnu++
      const nomEl = String(args(el)[2] || `Mur ${i + 1}`)
      const portes = portesParMur.get(el.id) || [], fen = fenParMur.get(el.id) || []
      murs.push({
        nom: nomEl, type: typeMur, L: R2(L), H: R2(H),
        position: p.isexternal === true ? 'exterieur' : p.isexternal === false ? 'interieur' : 'interieur',
        portes: portes.length, fenetres: fen.length,
        ...dims(portes, 'pL', 'pH'), ...dims(fen, 'fL', 'fH'),
        ...(ep ? { _epaisseur: R2(ep) } : {}),
        confiance: p.isexternal === undefined ? 'moyenne' : 'haute',
      })
    })

    // ── Poteaux / poutres : regroupés par section ──
    const sections = (liste, genre) => {
      const groupes = new Map()
      liste.forEach((el, i) => {
        const q = quant.get(el.id) || {}
        const long = premier(q, 'length', 'height')
        const pr = profilDe(E, el, U)
        let a = pr?.a, b = pr?.b, confiance = 'haute'
        if (!(a > 0 && b > 0)) {
          const aire = premier(q, 'crosssectionarea', 'grosscrosssectionarea')
          if (aire) { a = b = Math.sqrt(aire); confiance = 'basse'; profilsEquiv.autres++ } else { sansQuantites++; return }
        } else if (pr.forme === 'rond') { a = b = Math.sqrt(Math.PI * (a / 2) ** 2); confiance = 'basse'; profilsEquiv.ronds++ }
        const Lg = long || pr?.profondeur
        if (!(Lg > 0)) { sansQuantites++; return }
        const cle = `${R2(a)}|${R2(b)}|${R2(Lg)}`
        if (!groupes.has(cle)) groupes.set(cle, { nb: 0, a: R2(a), b: R2(b), L: R2(Lg), confiance })
        groupes.get(cle).nb++
      })
      return [...groupes.values()].map((g, i) => (genre === 'poteau'
        ? { nom: `Poteaux ${g.a}×${g.b}`, nb: g.nb, a: g.a, b: g.b, H: g.L, confiance: g.confiance }
        : { nom: `Poutres ${g.a}×${g.b}`, nb: g.nb, L: g.L, b: g.a, h: g.b, confiance: g.confiance, _i: i }))
    }
    const poteaux = sections(st.items.poteaux, 'poteau')
    // Poutre : section (largeur, hauteur) — la plus petite dimension est la largeur b, la plus grande la hauteur h.
    const poutres = sections(st.items.poutres, 'poutre').map(({ _i, ...x }) => ({ ...x, b: Math.min(x.b, x.h), h: Math.max(x.b, x.h) }))

    // ── Dalles (hors toiture) ──
    let surfPlancher = 0, volDalles = 0
    st.items.dalles.forEach((el) => {
      const type = args(el)[8]?.enum
      const q = quant.get(el.id) || {}
      const aire = premier(q, 'netarea', 'grossarea', 'area')
      if (type === 'ROOF') { dallesToiture++; aireToiture += aire || 0; return }
      if (!aire) { sansQuantites++; return }
      surfPlancher += aire
      const ep = premier(q, 'depth', 'width')
      volDalles += premier(q, 'netvolume', 'grossvolume', 'volume') ?? (ep ? aire * ep : 0)
    })

    const hauteurs = murs.map((m) => m.H)
    const HSP = mediane(hauteurs)
    return {
      nom: st.nom, HSP: HSP ? R2(HSP) : null,
      surfPlancher: surfPlancher > 0 ? round2(surfPlancher) : null,
      epDalle: surfPlancher > 0 && volDalles > 0 ? R2(volDalles / surfPlancher) : null,
      pieces: [], murs: murs.map(({ _epaisseur, ...m }) => m), poteaux, poutres,
      confiance: 'haute', source: 'ifc', incertitudes: [],
    }
  }).filter((n) => n.murs.length || n.poteaux.length || n.poutres.length || n.surfPlancher)

  if (sansQuantites) incertitudes.push(`IFC : ${sansQuantites} élément(s) sans quantités exploitables (longueur, hauteur, section ou surface) — ils ne sont pas comptés. Dans ArchiCAD, activez l'export des « quantités de base » (Base Quantities) dans le traducteur IFC.`)
  if (murTypeInconnu) incertitudes.push(`IFC : ${murTypeInconnu} mur(s) d'épaisseur autre que 10 / 15 / 20 cm — type « inconnu » à préciser dans la vérification.`)
  if (profilsEquiv.ronds) incertitudes.push(`IFC : ${profilsEquiv.ronds} groupe(s) de poteaux/poutres circulaires remplacés par un carré de même section (volume exact, coffrage approché).`)
  if (profilsEquiv.autres) incertitudes.push(`IFC : ${profilsEquiv.autres} élément(s) de section non rectangulaire — section carrée équivalente tirée de la surface de section (confiance basse).`)
  if (dallesToiture) incertitudes.push(`IFC : ${dallesToiture} dalle(s) de toiture (${round2(aireToiture)} m²) non reprises — la pente et la couverture restent à lire sur le plan de toiture ou à confirmer.`)
  if (niveaux.length && niveaux.every((n) => n.surfPlancher === null)) incertitudes.push('IFC : aucune dalle avec surface lue — la surface de plancher de chaque niveau est à saisir ou à lire sur les plans.')
  incertitudes.push('IFC : le type de plancher (dalle pleine, hourdis) n\'est pas déduit du fichier — à confirmer.')
  if (!niveaux.length) return { ok: false, message: 'Le fichier IFC ne contient aucun élément exploitable pour le métré (murs, dalles, poteaux ou poutres avec quantités).' }

  const proj = [...E.values()].find((e) => e.type === 'IFCPROJECT')
  const nomProj = proj ? String(args(proj)[2] || '').trim() : ''
  return {
    ok: true,
    titre: nomProj && !/^(project|projet|default|sans titre)/i.test(nomProj) ? nomProj : null,
    niveaux, incertitudes,
    stats: { entites: E.size, ...nbElements, niveaux: niveaux.length, unitesLongueur: U.length },
  }
}
