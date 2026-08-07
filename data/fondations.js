// data/fondations.js
// Recommandations de fondation par ville / zone géotechnique (Bénin).
// Source : études géotechniques de référence et pratiques locales (LNBTP).
// Enrichi août 2026 par le Lot A — Recherche : Fondations (Koty Maxwell &
// Kpoïté Dossou Samuel) : contrainte admissible indicative par zone (bar) et
// contexte de sol dominant, utilisés par src/fondationsLotA.js pour proposer
// — sans jamais l'imposer — un type de fondation et des profondeurs/débords
// par défaut. Ces valeurs restent éditables projet par projet.
// AVERTISSEMENT : indicatif — une étude de sol est obligatoire avant tout chantier.

export const FONDATIONS = {
  avertissement: "Ces données sont indicatives. Une étude géotechnique est obligatoire avant tout projet de construction.",
  // Les 35 plus grandes villes du Bénin (RGPH4, 2013), rattachées à leur zone
  // géotechnique par département : Littoral/Atlantique → côtière (plaine
  // sableuse) ; Ouémé/Mono (zones lagune/lac Ahémé) → lagunaire ; Zou/
  // Collines/Plateau/Couffo (terre de barre) → centre ; Borgou/Alibori/Donga
  // (socle granito-gneissique) → nord ; Atacora (chaîne de l'Atacora,
  // quartzites) → nord-ouest.
  villes: {
    "Cotonou":       "zone_côtière",    // Littoral
    "Abomey-Calavi": "zone_côtière",    // Atlantique
    "Porto-Novo":    "zone_lagunaire",  // Ouémé
    "Parakou":       "zone_nord",       // Borgou
    "Djougou":       "zone_nord_ouest", // Donga
    "Bohicon":       "zone_centre",     // Zou
    "Natitingou":    "zone_nord_ouest", // Atacora
    "Savé":          "zone_centre",     // Collines
    "Abomey":        "zone_centre",     // Zou
    "Nikki":         "zone_nord",       // Borgou
    "Lokossa":       "zone_lagunaire",  // Mono
    "Ouidah":        "zone_côtière",    // Atlantique
    "Dogbo-Tota":    "zone_centre",     // Couffo
    "Kandi":         "zone_nord",       // Alibori
    "Cové":          "zone_centre",     // Zou
    "Malanville":    "zone_nord",       // Alibori
    "Pobé":          "zone_centre",     // Plateau
    "Kérou":         "zone_nord_ouest", // Atacora
    "Savalou":       "zone_centre",     // Collines
    "Sakété":        "zone_centre",     // Plateau
    "Comè":          "zone_lagunaire",  // Mono
    "Bembéréké":     "zone_nord",       // Borgou
    "Bassila":       "zone_nord_ouest", // Donga
    "Banikoara":     "zone_nord",       // Alibori
    "Kétou":         "zone_centre",     // Plateau
    "Dassa-Zoumè":   "zone_centre",     // Collines
    "Tchaourou":     "zone_nord",       // Borgou
    "Allada":        "zone_côtière",    // Atlantique
    "Aplahoué":      "zone_centre",     // Couffo
    "Tanguiéta":     "zone_nord_ouest", // Atacora
    "N'Dali":        "zone_nord",       // Borgou
    "Segbana":       "zone_nord",       // Alibori
    "Athiémé":       "zone_lagunaire",  // Mono
    "Grand-Popo":    "zone_côtière",    // Mono (façade atlantique)
    "Kouandé":       "zone_nord_ouest", // Atacora
  },
  zones: {
    zone_côtière: {
      label: "Zone côtière / sablonneuse",
      sol: "Sable fin côtier, nappe phréatique haute (0,5–2 m).",
      fondation: "Semelle filante élargie (L ≥ 60 cm, H ≥ 30 cm) ou radier général.",
      profondeur: "Minimum 1,20 m sous niveau fini.",
      dosage: "Béton 350 kg/m³ minimum. Imperméabilisant obligatoire.",
      alerte: "Nappe haute : prévoir imperméabilisation et drain périphérique.",
      // ── Lot A ──
      contrainteAdmissible: { min: 1.0, max: 1.5, defaut: 1.25, unite: 'bar' },
      contexteSol: 'nappe_proche',
      natureSol: "Sédiments quaternaires : sable fin à moyen, sable limoneux, poches d'argile ; nappe phréatique très peu profonde, parfois affleurante.",
      vigilance: "Nappe haute → drainage et étanchéité indispensables ; risque de liquéfaction locale en zone très meuble ; éviter fondation en pleine saison des pluies.",
    },
    zone_lagunaire: {
      label: "Zone lagunaire / argileuse",
      sol: "Argile molle, vases, remblais hétérogènes. Portance faible.",
      fondation: "Radier général ou fondations sur pieux selon CBR. Éviter semelles isolées.",
      profondeur: "Minimum 1,50 m ou jusqu'au bon sol.",
      dosage: "Béton 350 kg/m³ avec adjuvant hydrofuge.",
      alerte: "Sol compressible : tassements différentiels probables. Étude obligatoire.",
      // ── Lot A ──
      contrainteAdmissible: { min: 0.3, max: 0.8, defaut: 0.55, unite: 'bar' },
      contexteSol: 'nappe_proche',
      natureSol: "Argile molle à vaseuse, tourbe et matière organique, très forte teneur en eau.",
      vigilance: "Tassements différentiels importants ; radier général ou fondations profondes à privilégier ; purge/substitution de sol souvent nécessaire.",
    },
    zone_centre: {
      label: "Zone de plateau / argilo-latéritique",
      sol: "Argile latéritique, portance moyenne à bonne (CBR 5–15 %).",
      fondation: "Semelle filante standard (L 40 cm, H 20 cm) ou semelle élargie si CBR < 8.",
      profondeur: "0,80 à 1,20 m selon résultats sondage.",
      dosage: "Béton 350 kg/m³.",
      alerte: null,
      // ── Lot A ──
      contrainteAdmissible: { min: 1.5, max: 2.5, defaut: 2.0, unite: 'bar' },
      contexteSol: 'stable',
      natureSol: "Sols ferrugineux tropicaux et argilo-sableux sur socle latéritique, drainage généralement correct.",
      vigilance: "Vérifier l'épaisseur de la couche latéritique meuble en surface ; décaper la terre végétale avant fondation. Cas particulier bas-fonds/vallées : traiter avec la contrainte 'faible portance' (< 1 bar) et confirmer/ajuster la valeur proposée.",
      basFondPossible: true,
    },
    zone_nord: {
      label: "Zone nord / socle granitique",
      sol: "Altérites, cuirasse latéritique, rocher à faible profondeur. Bonne portance.",
      fondation: "Semelle filante standard ou semelle sur rocher.",
      profondeur: "0,60 à 1,00 m (jusqu'au toit du rocher sain).",
      dosage: "Béton 250–300 kg/m³ en rocher, 350 kg/m³ en altérites.",
      alerte: null,
      // ── Lot A ──
      contrainteAdmissible: { min: 2.0, max: 3.0, defaut: 2.5, unite: 'bar' },
      // Valeur alternative explicitement documentée par le Lot A pour les
      // bas-fonds/vallées de cette zone (Niger, Alibori) : sol argileux à
      // faible portance, distinct du plateau.
      contrainteAdmissibleBasFond: { min: 0.8, max: 1.2, defaut: 1.0, unite: 'bar' },
      contexteSol: 'stable',
      natureSol: "Sols ferrugineux tropicaux lessivés, latérite indurée par endroits, argiles sur les bas-fonds/vallées (Niger, Alibori).",
      vigilance: "Forte variabilité sol sec/saison des pluies ; distinguer clairement plateau (bonne portance) et bas-fond (faible portance, retrait-gonflement).",
      basFondPossible: true,
    },
    zone_nord_ouest: {
      label: "Zone de l'Atacora / granitique et gréseux",
      sol: "Cuirasse ferrugineuse, quartzites, sols rocailleux. Très bonne portance.",
      fondation: "Semelle filante ancrée dans le rocher ou en cuirasse.",
      profondeur: "0,60 à 1,20 m.",
      dosage: "Béton 250 kg/m³ minimum.",
      alerte: "Relief accidenté : prévoir terrassement et murettes de soutènement.",
      // ── Lot A ──
      contrainteAdmissible: { min: 2.5, max: 4.0, defaut: 3.25, unite: 'bar' },
      contexteSol: 'stable',
      natureSol: "Substrat souvent proche affleurement rocheux/gravillonnaire (chaîne de l'Atacora), sols peu épais sur relief.",
      vigilance: "Terrain en pente : prévoir redans/fondations étagées ; hétérogénéité forte sur un même site, sondages ponctuels recommandés.",
    },
  },
}
