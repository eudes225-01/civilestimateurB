// src/typesPlans.js
// Codification des plans techniques BTP — registre des 8 types de plans et
// routage automatique vers le module d'extraction/calcul adapté.
//
// Source : « CivilEstimator — Codification des plans techniques BTP » (document
// de référence pour la reconnaissance automatique). Chaque type de plan porte
// une « signature » : des codes, des annotations et un cartouche qui permettent
// de savoir à quel type de plan on a affaire AVANT d'extraire quoi que ce soit.
//
// Principe (identique au reste du moteur) : la lecture IA ne décide pas seule.
// Elle remonte le cartouche et les codes qu'elle lit (« SF », « EF », « HSP »,
// « (16+4) »…) ; ce module, déterministe, calcule la classe du plan et tranche
// quand le type déposé par l'utilisateur et le type reconnu divergent.

// ── Registre ────────────────────────────────────────────────────────────────
// `cartouche` : motifs du titre de planche (signal fort).
// `forts`     : codes propres à ce type de plan (poids 2).
// `faibles`   : codes partagés avec d'autres types (poids 1).
export const TYPES_PLANS = {
  fondation: {
    lab: 'Plan de fondation et d\'implantation',
    court: 'Fondation',
    module: 'Fondations, terrassement',
    echelle: '1:50 – 1:100',
    cartouche: [/fondation/i, /implantation/i],
    forts: [/^S[FIC]$/i, /^S\d+$/i, /^BP$/i, /^SF\s*\(/i],
    faibles: [/^TN$/i, /^R$/i, /^L[NG]\d*$/i, /^L\d+$/i],
    repere: 'SF, SI, S<n>, BP, TN · cotes de niveau négatives · hachures de sol',
  },
  plan: {
    lab: 'Vue en plan (par étage)',
    court: 'Plan d\'étage',
    module: 'Murs, cloisons, second œuvre',
    echelle: '1:50 – 1:100',
    cartouche: [/plan\s*(du\s*|de\s*l['’]\s*)?(rdc|rez|r\s*\+\s*\d|[ée]tage|niveau)/i, /^plan\s*(rdc|r\+)/i],
    forts: [/^F\d+$/i, /^B\d+$/i, /^RDC$/i, /^R\s*\+\s*\d+$/i],
    faibles: [/^P\d+$/i],
    repere: 'P<n> (portes), F<n>/B<n> (baies), noms de pièces + surfaces · pas de ferraillage',
  },
  coupe: {
    lab: 'Coupe',
    court: 'Coupe',
    module: 'Hauteurs, niveaux, validation croisée',
    echelle: '1:50 (générale) · 1:10 – 1:20 (détail)',
    cartouche: [/coupe/i],
    forts: [/^HSP$/i, /^NGF$/i, /^NF$/i, /^[A-Z]\s*-\s*[A-Z]$/],
    faibles: [/^TN$/i],
    repere: 'HSP, NF, NGF, TN · repères A-A / B-B · hachures de plusieurs matériaux',
  },
  plomberie: {
    lab: 'Plan de plomberie',
    court: 'Plomberie',
    module: 'Appareils sanitaires, assainissement',
    echelle: '1:50 – 1:100',
    cartouche: [/plomberie/i, /sanitaire/i, /assainissement/i],
    forts: [/^EF$/i, /^EC$/i, /^EU$/i, /^EV$/i, /^EP$/i, /^AEP$/i, /^[ØO⌀]\s*\d+/i, /^WC$/i],
    faibles: [/^R\d+$/i, /^lavabo$/i, /^douche$/i, /^[ée]vier$/i, /^baignoire$/i],
    repere: 'EF / EC / EU / EV / EP / AEP · Ø<n> · pictogrammes sanitaires · pas de structure',
  },
  electricite: {
    lab: 'Plan d\'électricité',
    court: 'Électricité',
    module: 'Lots techniques (forfait / point)',
    echelle: '1:50 – 1:100',
    cartouche: [/[ée]lectri/i, /nf\s*c\s*15/i],
    forts: [/^VV$/i, /^RJ\s*45$/i, /^VDI$/i, /^TGBT$/i, /^TD$/i],
    faibles: [/^BP$/i, /^16\s*A$/i],
    repere: 'points lumineux, VV, RJ45, TGBT / TD · traits pointillés de commande · légende en marge',
  },
  poutraison: {
    lab: 'Plan de poutraison et nervures',
    court: 'Poutraison',
    module: 'Planchers, acier par élément',
    echelle: '1:50 – 1:100',
    cartouche: [/poutraison/i, /plancher/i, /nervure/i],
    forts: [/^N\d+$/i, /\(\s*\d+\s*\+\s*\d+\s*\)/],
    faibles: [/^P\d+\s*\(/i, /\(\s*\d+\s*[x×]\s*\d+\s*\)/i],
    repere: 'N<n> (nervures) · notation (16+4) · P<n>(LxH) · flèches de portée',
  },
  toiture: {
    lab: 'Plan de toiture',
    court: 'Toiture',
    module: 'Couverture, charpente',
    echelle: '1:100',
    cartouche: [/toiture/i, /couverture/i],
    forts: [/fa[iî]tage/i, /^noue$/i, /[ée]gout/i, /ch[ée]neau/i, /^d[ée]bord$/i, /^\d+(?:[.,]\d+)?\s*%$/],
    faibles: [/^pente$/i],
    repere: 'pente en % + flèche · faîtage, noue, égout, chéneau · pas de cloisonnement intérieur',
  },
  coffrage: {
    lab: 'Plan de coffrage',
    court: 'Coffrage',
    module: 'Poteaux, poutres, voiles, dalles',
    echelle: '1:50 – 1:100',
    cartouche: [/coffrage/i],
    forts: [/^V\d+$/i, /^D\d+$/i, /^CV\d+$/i, /^C\d+$/i],
    faibles: [/^P\d+$/i, /^[A-Z]\s*-\s*\d+$/, /\(\s*\d+\s*[x×]\s*\d+\s*\)/i, /^L\d+$/i],
    repere: 'P<n>, V<n>, D<n>, L<n>, CV<n> · sections (LxH) · trame A-1',
  },
}

export const CLES_TYPES_PLANS = Object.keys(TYPES_PLANS)

const POIDS = { cartouche: 10, fort: 2, faible: 1 }

/**
 * Classe un plan à partir des signatures lues dessus.
 * @param {{cartouche?: string|null, codes?: string[]}} lecture
 *        cartouche = titre de planche tel que lu ; codes = codes / mentions lus.
 * @returns {{type: string|null, scores: Object, confiance: 'haute'|'moyenne'|'basse', signaux: Object}}
 */
export function classifierPlan({ cartouche = '', codes = [] } = {}) {
  const titre = String(cartouche || '').trim()
  const lus = [...new Set((Array.isArray(codes) ? codes : []).map((c) => String(c ?? '').trim()).filter(Boolean))]
  const scores = {}
  const signaux = {}

  for (const [cle, t] of Object.entries(TYPES_PLANS)) {
    let s = 0
    const trouves = []
    if (titre && t.cartouche.some((re) => re.test(titre))) { s += POIDS.cartouche; trouves.push(`cartouche « ${titre} »`) }
    for (const code of lus) {
      if (t.forts.some((re) => re.test(code))) { s += POIDS.fort; trouves.push(code) }
      else if (t.faibles.some((re) => re.test(code))) { s += POIDS.faible }
    }
    scores[cle] = s
    signaux[cle] = trouves
  }

  const tri = Object.entries(scores).sort((a, b) => b[1] - a[1])
  const [meilleur, sMax] = tri[0]
  const sSecond = tri[1]?.[1] ?? 0
  if (sMax <= 0) return { type: null, scores, confiance: 'basse', signaux }

  const marge = sMax - sSecond
  const cartoucheNet = titre && TYPES_PLANS[meilleur].cartouche.some((re) => re.test(titre)) && marge >= POIDS.cartouche - 2
  const confiance = cartoucheNet || marge >= 6 ? 'haute' : marge >= 3 ? 'moyenne' : 'basse'
  return { type: meilleur, scores, confiance, signaux }
}

/**
 * Tranche le type final d'une vue lue.
 *  1. la signature (cartouche + codes) l'emporte quand elle est assez nette ;
 *  2. sinon, le type annoncé par la lecture IA s'il est valide ;
 *  3. sinon, le type du dépôt choisi par l'utilisateur.
 * Le résultat dit toujours si la vue a été reclassée, et pourquoi.
 */
export function routerPlan({ typeDepose = null, typeIA = null, cartouche = '', codes = [] } = {}) {
  const valide = (k) => (k && TYPES_PLANS[k] ? k : null)
  const depose = valide(typeDepose)
  const ia = valide(typeIA)
  const sig = classifierPlan({ cartouche, codes })

  let type, source
  if (sig.type && sig.confiance !== 'basse') { type = sig.type; source = 'signature' }
  else if (ia) { type = ia; source = 'lecture' }
  else if (depose) { type = depose; source = 'depot' }
  else if (sig.type) { type = sig.type; source = 'signature' }
  else { type = null; source = 'aucune' }

  const reclasse = !!(depose && type && type !== depose)
  let message = null
  if (reclasse) {
    const pourquoi = source === 'signature' && sig.signaux[type]?.length
      ? ` (signatures : ${sig.signaux[type].slice(0, 5).join(', ')})`
      : ''
    message = `Vue déposée comme « ${TYPES_PLANS[depose].court} » mais reconnue comme « ${TYPES_PLANS[type].court} »${pourquoi} — lue avec l'extracteur « ${TYPES_PLANS[type].court} ».`
  }
  if (!type) message = 'Type de plan non reconnu : la vue est ignorée.'
  return { type, source, reclasse, typeDepose: depose, confiance: sig.confiance, scores: sig.scores, message }
}
