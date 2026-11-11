# Changelog

## 3.0.2 — forme de dallage et toit-dalle (novembre 2026)

- Ajout d'une forme de dallage en mortier, indépendante de la dalle béton et comptée une seule fois au RDC ; quantités de ciment, sable et eau si le ratio eau/ciment est renseigné.
- Le prix unitaire de la forme est à saisir dans l'onglet Prix ; il n'est pas inventé.
- Le dernier niveau terminé par une dalle structurelle n'ajoute pas de lot de couverture.

## 3.0.0 — moteur v3 (novembre 2026)

**Priorité : fiabilité des quantités et absence de double comptage.**

- `modeChiffrage` (`compose` | `decompose`) : un composant n'est jamais facturé deux fois ; `dqe.inclus` liste ce qui est compris dans un prix composé.
- Nouvelle sortie `materiaux` (lignes + synthèse) distincte du DQE.
- Murs par catégorie (extérieur / porteur / cloison / mitoyen / soubassement) ; soubassement séparé de l'élévation, dimensions jamais inventées.
- Mortier de pose et ciment des joints configurables par type de bloc ; ciment ventilé (béton / pose / enduits / autres).
- Fondations : détail par ouvrage (acier estimé, remblai, déblais, matériaux).
- Terrassement : réemploi des terres, purge de sol impropre, apport extérieur explicites.
- Planchers : corps creux apparent / plan, 15+5 / 20+5, poutrelles sur entraxe saisi, dalle nervurée ; **dalle sur terre-plein sans coffrage de sous-face**.
- Toiture : couverture = surface projetée lue × coefficient (plus de repli sur l'emprise) ; pignons reliés aux murs.
- Validation de schéma sans dépendance ; K borné ; `nb = 0` respecté ; montants entiers ; arrondis à l'affichage.
- Types TypeScript (`types/index.d.ts`) + `npm run typecheck`.
- PDF : mode de chiffrage, composants inclus, total indicatif, matériaux, hypothèses, données à confirmer, version/date des prix.

**Changements de comportement** (justifiés) : défaut `compose` (total HT plus bas qu'en v2, qui comptait BA + acier + granulats + coffrage) ;
réemploi des terres par défaut (moins d'évacuation / d'apport) ; deux tests (`K : appliqué une seule fois`, `DQE — postes sans prix`) passent explicitement en mode décomposé,
le sable n'étant facturé à part que dans ce mode ; `prix.json` régénéré (champ `inclut`, libellés précisés, 5 postes ajoutés).

### 3.0.0 — ajouts d'après le document « Métrés en bâtiment — formules v3 »
- Ciment de pose : `N_sacs = N_agglos ÷ 70` devient le **défaut** (le mode `volume` reste disponible) ; sacs arrondis au supérieur à la commande.
- Déduction de hauteur des murs `Ht − Hs − Hbp − n·ec` (optionnelle, désactivée par défaut).
- Hourdis `N = S ÷ S_hourdis` (dimensions saisies, pertes réglables) ; poutrelles `Np = L_perp ÷ entraxe + 1`.
