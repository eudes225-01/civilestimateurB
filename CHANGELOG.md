# Changelog

## 3.0.6 — prix estimé distinct pour la forme de dallage (novembre 2026)

- La forme de dallage garde sa propre ligne de prix et reprend 62 000 FCFA/m³ du B.P. comme prix par défaut estimé ; elle reste séparée du poste B.P. des fondations.


## 3.0.5 — forme de dallage en béton de propreté (novembre 2026)

- La forme au RDC est en béton de propreté dosé à 150 kg/m³, comptée une seule fois et séparée de la dalle structurelle.
- Son DQE applique directement le PU du poste B.P. 150 kg/m³ existant (code RPR 6019…1198) au volume mesuré.
- Les matériaux listent aussi ciment, sable, gravier et, si le ratio eau/ciment est renseigné, eau de gâchage.

## 3.0.4 — correction du CI et prix d’eau du mortier (novembre 2026)

- Le prix de l’eau de gâchage est saisi dans les paramètres de la forme (0 si elle est gratuite), sans ajouter de prix nul à la base générale.
- La toiture est omise au-dessus d’une dalle terminale lorsque rien ne décrit explicitement une couverture ; un toit-terrasse conserve son étanchéité.
- Les scénarios de toiture existants décrivent désormais une couverture sans dalle terminale.

## 3.0.3 — prix composé de la forme de dallage (novembre 2026)

- Le PU de la forme est calculé automatiquement par m³ à partir du dosage en ciment, du sable, de l'eau et des prix saisis pour ces composants ; aucun PU forfaitaire n'est demandé.
- Le DQE et son sous-détail affichent les consommations et le coût unitaire de chaque composant. Le prix de l'eau peut être fixé à 0 si elle est disponible gratuitement.
- Le ratio eau/ciment doit être renseigné pour chiffrer le mortier complet.

## 3.0.2 — forme de dallage et toit-dalle (novembre 2026)

- Ajout d'une forme de dallage en mortier, indépendante de la dalle béton et comptée une seule fois au RDC ; quantités de ciment, sable et eau si le ratio eau/ciment est renseigné.
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
