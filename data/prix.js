// data/prix.js
// Base de prix RPR 26.2 (mars 2026) — marché du Bénin.
// Source de vérité unique du projet (backend + frontend).
// Champs : code, designation, unite, bi (prix de base HT), sac (prix/sac ciment si applicable).

export const PRIX_VERSION = 'RPR 26.2'
export const PRIX_DATE = '2026-03'

export const PRIX = [
  // ── Terrassement ────────────────────────────────────────────────────────────
  { code: '6019…1676', designation: 'Fouille en rigole (sol meuble)',          unite: 'm3',  bi: 4500,   sac: null  },
  { code: '6019…1677', designation: 'Fouille en rigole (sol dur / latérite)',  unite: 'm3',  bi: 7200,   sac: null  },

  // ── Béton ────────────────────────────────────────────────────────────────────
  { code: '6019…1198', designation: 'Béton de propreté 150 kg/m³',            unite: 'm3',  bi: 62000,  sac: null  },
  { code: '6019…1195', designation: 'Béton armé 350 kg/m³ (fondations)',       unite: 'm3',  bi: 148000, sac: null  },
  { code: '6019…2376', designation: 'Dalle pleine BA 350 kg/m³',              unite: 'm3',  bi: 165000, sac: null  },

  // ── Maçonnerie ───────────────────────────────────────────────────────────────
  { code: '6019…2241', designation: 'Maçonnerie agglos creux 15 (élévation)',  unite: 'm2',  bi: 8500,   sac: null  },

  // ── Enduit / peinture ────────────────────────────────────────────────────────
  { code: 'enduit',    designation: 'Enduit mortier de ciment (2 faces)',      unite: 'm2',  bi: 3800,   sac: null  },
  { code: '6019…2812', designation: 'Peinture acrylique sur enduit',           unite: 'm2',  bi: 2500,   sac: null  },

  // ── Ferraillage ──────────────────────────────────────────────────────────────
  { code: 'acierHA',   designation: 'Aciers HA (façonnage + pose)',            unite: 'kg',  bi: 950,    sac: null  },

  // ── Ciment (prix au sac 50 kg) ───────────────────────────────────────────────
  { code: 'ciment50',  designation: 'Ciment CEM II 32.5 (sac 50 kg)',          unite: 'sac', bi: 6500,   sac: 6500  },
  { code: 'ciment42',  designation: 'Ciment CEM I 42.5 (sac 50 kg)',           unite: 'sac', bi: 7200,   sac: 7200  },

  // ── Menuiserie (indicatif) ───────────────────────────────────────────────────
  { code: 'porte90',   designation: 'Porte isoplane 90×210 (fournie+posée)',   unite: 'u',   bi: 45000,  sac: null  },
  { code: 'fenetre',   designation: 'Fenêtre alu 120×120 (fournie+posée)',     unite: 'u',   bi: 55000,  sac: null  },

  // ── Carrelage (indicatif) ────────────────────────────────────────────────────
  { code: 'carrelage', designation: 'Carrelage grès cérame (pose incluse)',    unite: 'm2',  bi: 14500,  sac: null  },

  // ── Toiture / couverture (charpente + couverture posées) ──────────────────────
  { code: 'toit_bac',      designation: 'Couverture tôle bac aluzinc + charpente bois', unite: 'm2', bi: 9500,  sac: null },
  { code: 'toit_tuiles',   designation: 'Couverture tuiles + charpente bois',           unite: 'm2', bi: 19000, sac: null },
  { code: 'toit_shingle',  designation: 'Couverture bardeaux bitumés (shingle)',        unite: 'm2', bi: 13500, sac: null },
  { code: 'toit_terrasse', designation: 'Toit-terrasse — étanchéité multicouche',       unite: 'm2', bi: 12000, sac: null },

  // ── Terrassement complémentaire (moteur v2) ─────────────────────────────────
  { code: 'fouille_pm',   designation: 'Fouille en pleine masse (engin)',                 unite: 'm3', bi: 3500,   sac: null },
  { code: 'remblai',      designation: 'Mise en remblai ou évacuation des terres',        unite: 'm3', bi: 2500,   sac: null },

  // ── Fondations complémentaires (semelles isolées / radier) ──────────────────
  { code: 'radier',       designation: 'Radier général BA 350 kg/m³',                     unite: 'm3', bi: 160000, sac: null },
  { code: 'banche',       designation: 'Gros béton banché (cyclopéen)',                   unite: 'm3', bi: 95000,  sac: null },
  { code: 'moellons',     designation: 'Maçonnerie de moellons en fondation',             unite: 'm3', bi: 45000,  sac: null },
  { code: 'arase',        designation: 'Arase étanche (chape hydrofuge)',                 unite: 'm2', bi: 3500,   sac: null },
  { code: 'herisson',     designation: 'Hérissonnage en pierres sèches',                  unite: 'm2', bi: 2500,   sac: null },

  // ── Structure en élévation (ossature poteaux-poutres) ───────────────────────
  { code: 'ba_elevation', designation: 'Béton armé en élévation 350 kg/m³ (poteaux/poutres/linteaux)', unite: 'm3', bi: 175000, sac: null },

  // ── Planchers par type ───────────────────────────────────────────────────────
  { code: 'plancher_h15', designation: 'Plancher hourdis 15+5 (entrevous + compression, hors acier)',  unite: 'm2', bi: 26000, sac: null },
  { code: 'plancher_h20', designation: 'Plancher hourdis 20+5 (entrevous + compression, hors acier)',  unite: 'm2', bi: 30000, sac: null },
  { code: 'dalle_tp',     designation: 'Dalle sur terre-plein (béton légèrement armé)',   unite: 'm3', bi: 145000, sac: null },

  // ── Maçonnerie par type de mur ───────────────────────────────────────────────
  { code: 'mur_brique10', designation: 'Cloison brique creuse 10 (élévation)',            unite: 'm2', bi: 6500,   sac: null },
  { code: 'mur_agglo10',  designation: 'Maçonnerie agglos creux 10 (élévation)',          unite: 'm2', bi: 7000,   sac: null },
  { code: 'mur_agglo20',  designation: 'Maçonnerie agglos creux 20 — porteur (élévation)',unite: 'm2', bi: 10500,  sac: null },

  // ── Enduits intérieur / extérieur (prix distincts) ───────────────────────────
  { code: 'enduit_int',   designation: 'Enduit intérieur au mortier de ciment',           unite: 'm2', bi: 3500,   sac: null },
  { code: 'enduit_ext',   designation: 'Enduit extérieur au mortier de ciment',           unite: 'm2', bi: 4200,   sac: null },
]
