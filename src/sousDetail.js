// src/sousDetail.js
// Sous-Détail des Prix Unitaires (SDPU) — décomposition du déboursé sec
// (matériaux + main d'œuvre + matériel) pour chaque poste du DQE, conformément
// aux usages des bureaux d'études BTP au Bénin (méthode RPR 26.2).
//
// Pour chaque poste, on exprime la composition du prix de base (bi, avant
// majoration par K) en parts de matériaux, main d'œuvre et matériel/divers.
// Ces clés de répartition sont des moyennes de marché indicatives ; un BET
// peut les ajuster selon ses propres bordereaux de sous-détail.

// Répartition (%) du déboursé sec par poste — calée sur les pratiques du
// marché béninois pour des ouvrages de bâtiment courant (BTP résidentiel/tertiaire).
const REPARTITIONS = {
  '6019…1676': { mat: 10, mo: 75, mat2: 15 },   // Fouille en rigole (sol meuble)
  '6019…1677': { mat: 8,  mo: 78, mat2: 14 },   // Fouille en rigole (sol dur)
  '6019…1198': { mat: 70, mo: 20, mat2: 10 },   // Béton de propreté 150 kg/m³
  '6019…1195': { mat: 72, mo: 20, mat2: 8  },   // Béton armé semelles/chaînage 350 kg/m³
  '6019…2376': { mat: 70, mo: 22, mat2: 8  },   // Dalle pleine BA 350 kg/m³
  '6019…2241': { mat: 55, mo: 38, mat2: 7  },   // Maçonnerie agglos creux 15
  'enduit':     { mat: 45, mo: 48, mat2: 7  },   // Enduit mortier de ciment
  '6019…2812':  { mat: 60, mo: 35, mat2: 5  },   // Peinture acrylique
  'acierHA':    { mat: 82, mo: 16, mat2: 2  },   // Aciers HA (façonnage + pose)
  'toit_bac':       { mat: 65, mo: 28, mat2: 7 },
  'toit_tuiles':    { mat: 70, mo: 25, mat2: 5 },
  'toit_shingle':   { mat: 68, mo: 26, mat2: 6 },
  'toit_terrasse':  { mat: 62, mo: 30, mat2: 8 },
  'porte90':    { mat: 80, mo: 18, mat2: 2  },
  'fenetre':    { mat: 82, mo: 16, mat2: 2  },
  'carrelage':  { mat: 58, mo: 38, mat2: 4  },
  'ciment50':   { mat: 96, mo: 2,  mat2: 2  },
  'ciment42':   { mat: 96, mo: 2,  mat2: 2  },
  // Postes du moteur v2
  'fouille_pm':   { mat: 5,  mo: 45, mat2: 50 },  // engin dominant
  // Lot B — terrassement Cf/Cp : évacuation = chargement/transport (engin
  // dominant, proche de fouille_pm) ; remblai d'apport = matériau dominant.
  // Répartitions indicatives, à ajuster par un BET si besoin.
  'evacuation_deblais': { mat: 5,  mo: 40, mat2: 55 },
  'remblai_apport':     { mat: 55, mo: 25, mat2: 20 },
  // Lot B — granulats : matériau + transport dominants, main d'œuvre faible
  // (livraison en vrac). Répartitions indicatives.
  'sable':        { mat: 70, mo: 8,  mat2: 22 },
  'gravier':      { mat: 70, mo: 8,  mat2: 22 },
  // Lot B — coffrage : bois + main d'œuvre de façonnage/pose/dépose,
  // matériel (étais, huile de décoffrage) minoritaire. Répartitions indicatives.
  'coffrage_poteau': { mat: 35, mo: 55, mat2: 10 },
  'coffrage_poutre': { mat: 35, mo: 55, mat2: 10 },
  'coffrage_dalle':  { mat: 30, mo: 50, mat2: 20 },  // étaiement plus lourd
  'radier':       { mat: 70, mo: 22, mat2: 8  },
  'banche':       { mat: 68, mo: 26, mat2: 6  },
  'moellons':     { mat: 55, mo: 40, mat2: 5  },
  'arase':        { mat: 55, mo: 40, mat2: 5  },
  'herisson':     { mat: 60, mo: 35, mat2: 5  },
  'ba_elevation': { mat: 68, mo: 24, mat2: 8  },  // coffrage inclus dans MO/matériel
  'plancher_h15': { mat: 72, mo: 22, mat2: 6  },
  'plancher_h20': { mat: 72, mo: 22, mat2: 6  },
  'dalle_tp':     { mat: 70, mo: 22, mat2: 8  },
  'mur_brique10': { mat: 52, mo: 41, mat2: 7  },
  'mur_agglo10':  { mat: 54, mo: 39, mat2: 7  },
  'mur_agglo20':  { mat: 57, mo: 36, mat2: 7  },
  'enduit_int':   { mat: 45, mo: 48, mat2: 7  },
  'enduit_ext':   { mat: 47, mo: 46, mat2: 7  },
}

const DEFAULT_REPARTITION = { mat: 60, mo: 32, mat2: 8 }

/** Libellés des composantes du déboursé sec. */
export const COMPOSANTES = {
  mat:  'Matériaux',
  mo:   "Main d'œuvre",
  mat2: 'Matériel & frais divers',
}

/**
 * Construit le sous-détail (déboursé sec décomposé) pour chaque ligne du DQE.
 * @param {Array} lignesDQE - lignes issues de buildDQE() : { n, des, u, q, pu, montant, code }
 * @param {Object} prixMap  - map {code: prix unitaire de base saisi (avant K)}
 * @param {number} K        - coefficient de majoration (aléas + bénéfice + frais généraux)
 */
export function buildSousDetail(lignesDQE = [], prixMap = {}, K = 1.3) {
  return lignesDQE.map((l) => {
    const pub = prixMap[l.code] ?? 0 // prix unitaire de base (déboursé sec), avant K
    const rep = REPARTITIONS[l.code] || DEFAULT_REPARTITION
    const total = rep.mat + rep.mo + rep.mat2

    const partMat  = Math.round((pub * rep.mat)  / total)
    const partMo   = Math.round((pub * rep.mo)   / total)
    const partMat2 = Math.max(0, pub - partMat - partMo) // ajustement pour somme exacte

    const deboursesSec = pub
    const majoration = Math.round(pub * (K - 1)) // aléas, frais généraux, bénéfice
    const puVente = Math.round(pub * K)

    return {
      n: l.n,
      des: l.des,
      u: l.u,
      code: l.code,
      composantes: [
        { lib: COMPOSANTES.mat,  montant: partMat },
        { lib: COMPOSANTES.mo,   montant: partMo },
        { lib: COMPOSANTES.mat2, montant: partMat2 },
      ],
      deboursesSec,
      coeffK: K,
      majoration,
      puVente,
      q: l.q,
      montantTotal: Math.round((l.q || 0) * puVente),
    }
  })
}
