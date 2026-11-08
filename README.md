# CivilEstimateur Engine

Moteur de calcul **CivilEstimator** — métré, DQE, sous-détail des prix
unitaires et recommandations géotechniques (Lot A — Fondations). C'est la
**source de vérité unique** du projet CivilEstimator : ce package est
consommé à la fois par ce dépôt (l'API Express, dans
[`civilestimateur-backend/`](civilestimateur-backend)) et par le frontend
([`civilestimateurF`](https://github.com/eudes225-01/civilestimateurF)),
qui l'installe comme dépendance Git.

## L'histoire du projet, dans l'ordre

Le fil conducteur est simple : permettre à un professionnel de remonter d'un montant du DQE jusqu'aux quantités, aux matériaux et aux données qui l'ont produit.

1. **Avant août 2026 — deux moteurs à faire converger.** Le frontend et le backend maintenaient chacun leur copie des formules. Cette organisation risquait de produire deux résultats différents pour un même projet. Le moteur partagé présenté ici répond à ce problème : les deux applications s'appuient désormais sur la même source de calcul.
2. **Octobre 2026 — rapprocher les calculs des règles métier.** Les corrections du Lot C ajustent notamment les ratios d'acier et les longueurs développées. En parallèle, la couverture de lecture commence à distinguer ce qui est lu, ce qui manque et ce que le professionnel doit confirmer.
3. **Novembre 2026 — passer au moteur v3.** Les quantités physiques, les besoins en matériaux et le DQE deviennent des sorties séparées. Les prix composés et décomposés sont clarifiés pour éviter le double comptage, et les entrées s'élargissent aux plans spécialisés et aux maquettes IFC.

Cette chronologie explique l'organisation actuelle : un moteur commun, des calculs traçables, puis des contrôles qui rendent visibles les données incertaines. Les détails des versions sont consignés dans le [changelog](CHANGELOG.md).

## Structure

```
civilestimateurB/
├── src/                     ← moteur de calcul (ESM, aucune dépendance externe)
│   ├── constants.js          référentiels (types de murs/planchers/toitures, ratios acier…)
│   ├── murs.js                murs, enduits par face, blocs (A4, A6)
│   ├── linteaux.js            linteaux générés depuis les ouvertures (A2)
│   ├── niveau.js               métré d'un niveau (A2, A3)
│   ├── fondations.js           3 systèmes de fondation, calcul de volumes (A1)
│   ├── projet.js               agrégation projet, acier par élément (A5), alertes (A7)
│   ├── validation.js           validations croisées (A7)
│   ├── dqe.js                  devis quantitatif estimatif, par lots (A9)
│   ├── sousDetail.js           sous-détail des prix unitaires (matériaux/MO/matériel)
│   └── index.js                API publique du package
├── data/
│   └── prix.js                 base de prix RPR 26.2
├── test/                     ← node:test (aucune dépendance de test ajoutée)
│   └── reference-r2.test.js    « règle d'or » : avant-métré manuel R+2 Fès
└── civilestimateur-backend/  ← API Express (déploiement Render), voir son propre README
```

## Utilisation

```js
import { metrerProjet, buildDQE } from 'civilestimateur-engine'

const { totaux, alertes } = metrerProjet(levels, params)
const dqe = buildDQE(totaux, prixMap, params.K)
```

Le backend l'importe en relatif (voir
[`civilestimateur-backend/src/engine.js`](civilestimateur-backend/src/engine.js)).
Le frontend l'installe comme dépendance Git :

```bash
npm install civilestimateur-engine@github:eudes225-01/civilestimateurB#main
```

## Moteur v3 — métré, matériaux et DQE sans double comptage

Le moteur est la **source unique** des formules ; le frontend ne recalcule rien (il appelle `buildDQE` via `src/lib/calcul.js`).
Quatre sorties **distinctes** : quantité physique (`totaux`, `parNiveau`), **besoin matériaux** (`materiaux`), coût / DQE (`buildDQE`),
hypothèses (`totaux.hypotheses`).

### 1. Modèle de prix : `modeChiffrage`
`params.modeChiffrage` = `'compose'` (défaut) ou `'decompose'` ; le mode est repris dans `dqe.mode`, l'interface et le PDF.

| | `compose` | `decompose` |
|---|---|---|
| Béton armé (fondations, élévation, dalles, radier, terre-plein) | prix composé COMPLET (béton + acier + coffrage + main-d'œuvre) | « mise en œuvre seule » (`beton_mo`) |
| Acier, coffrage, ciment, sable, gravier | listés dans `dqe.inclus`, **non facturés** | facturés séparément (`acierHA`, `coffrage_*`, `ciment50`, `sable`, `gravier`) |
| Acier des planchers à corps creux (prix « hors acier ») | facturé à part | facturé |
| Maçonnerie, corps creux, banché, moellons, enduits, couverture | prix composé | prix composé (inchangé) |

Le périmètre de chaque prix composé est porté par `inclut` dans `data/prix.js` (et surchargeable dans `prix.json`). **Ces périmètres sont déduits
des libellés et commentaires de la base RPR 26.2 ; les prix n'ont pas été modifiés — à valider.** Les postes nouveaux (`beton_mo`, `mur_soubassement`,
`enduit_hydrofuge`, `coffrage_rive`, `faux_plafond`) sont des prix moyens `estime: true` à ajuster.

Le DQE n'est jamais présenté comme « complet » (`dqe.complet`, `dqe.statut`, `dqe.libelleTotal`) tant qu'un poste est sans prix, à prix estimé par défaut,
exclu, ou qu'une donnée est à confirmer (`dqe.raisonsIncomplet`).

### 2. Quantités de matériaux — `metrerProjet().materiaux`
`lignes[]` (une par matériau × ouvrage × niveau) et `synthese[]` (par code, avec `quantiteCommande` arrondie à l'unité pour sacs/blocs). Champs : `code`,
`designation`, `unite`, `quantite`, `formule`, `ouvrage`, `niveau`, `statut` (`calcule` | `estime` | `a_confirmer`). Codes : `bloc_<type>`, `mortier_pose`,
`ciment_beton | ciment_mortier_pose | ciment_enduit | ciment_autres`, `sable_beton | sable_mortier | sable_enduit`, `gravier_beton`, `acier_ha`, `coffrage`,
`beton_proprete`, `beton_arme`, `beton_nervures`, `beton_table_compression`, `entrevous_15|20`, `poutrelles`, `beton_banche`, `moellons`…

### 3. Murs par catégorie et soubassement
Catégories : `exterieur`, `porteur`, `cloison`, `mitoyen`, `soubassement` (`m.categorie`, sinon déduite : position, puis bloc porteur/cloison).
Par catégorie : surface brute, ouvertures, surface nette, longueur développée, épaisseur, blocs (pertes incluses), mortier, ciment, sable, enduits.
Le **soubassement** (`m.categorie === 'soubassement'`) n'entre jamais dans `Smur`, `Ldev`, `LdevPorteurs`, `parTypeMur` ni les enduits d'élévation ; longueur,
**hauteur** et type de bloc sont obligatoires, sinon le mur est écarté et listé dans `totaux.soubassementACompleter` (rien n'est inventé).

### 3 bis. Formules du document « Métrés en bâtiment » (v3)
| Problème | Formule | Paramètre |
|---|---|---|
| 1 — surface nette de mur | `S = (Ld − Lp) × (Ht − Hs − Hbp − 2·ec) − Sb` | `params.deductionHauteur = { actif, Hs, Hbp, ec, nChainages }` (surcharge par mur : `Hs`, `Hbp`, `ec`, `nChainages`, `deduireHauteur`). **Désactivée par défaut** (risque de double déduction si la hauteur saisie est déjà nette) ; jamais appliquée au soubassement. `Lp` (poteaux) et `Sb` (baies) étaient déjà déduits. |
| 2 — ciment de pose | `N_sacs = N_agglos ÷ 70`, arrondi au sac supérieur | mode `blocsParSac` (défaut) |
| 6 — hourdis | `N = S_dalle ÷ S_hourdis` × (1 + pertes) | `level.dimHourdis = {L, l}`, `level.pertesHourdis` ou `params.pertesHourdis` (5 % par défaut ; marge 5–10 %). Sans dimensions : hypothèse historique (8,5 / 7,0 par m², pertes ≈ 2 % incluses), statut « estimé ». |
| 6 — poutrelles | `Np = L_perp ÷ entraxe + 1` (quotient arrondi au-dessus) | `level.entraxe`, `level.longueurPerpPoutrelles`, `level.porteePoutrelle` (jamais devinés) |
| 7 — table de compression | `V = S × e` | `level.tableCompression` (5 cm par défaut) |

### 4. Mortier de pose et ciment des joints
Par type de bloc (`params.mortier.parType[type]`) : `blocsM2`, `pertesPct`, `mortierM3M2`, `dosageKgM3`, `blocsParSac`.
- mode `'blocsParSac'` (**défaut**, document de référence « Métrés en bâtiment », problème 2) : `N_sacs = N_agglos ÷ 70` (70 modifiable par type de bloc ; à adapter au bloc, aux joints, à la recette) ; sacs **arrondis à l'entier supérieur** dans la liste de matériaux (`quantiteCommande`) ; mortier déduit = ciment × 50 ÷ dosage ;
- mode `'volume'` (formule historique v2) : `mortier = S × 0,022 m³/m²` ; `ciment = mortier × 350 kg/m³ ÷ 50` (≈ 87 blocs/sac pour des agglos de 12,5/m² + 7 %) ;
- `sable de mortier = mortier × params.mortier.sableM3ParM3` (1,0 m³/m³, hypothèse).
Ciment ventilé : `totaux.ciment = { beton, mortierPose, enduits, autres }` ; `cimentSacs` (historique) en est la somme arrondie.

### 5. Fondations et terrassement
Sorties par ouvrage : `fondation.semellesFilantes[]`, `semellesIsolees[]` (un par type S1, S2…), `rigoles[]`, `radier` — dimensions, fouille, propreté, béton, **acier estimé**
(`acierStatut: 'estime'`), remblai et déblais évacués **indicatifs**, matériaux associés. Les volumes historiques sont inchangés.

Terrassement (`fondation/terrassement`, fonction `terrasser`) — `Vdéblais = fouilles + pleine masse` ; `Vremblai = Vdéblais − Vouvrages enterrés` ; `besoin = Vremblai × Cp` :
1. **purge** (`bloquant` ou `purge.actif`) : évacuation `Vdéblais × Cf` + apport `Vremblai × 1,10` ; justification exigée (alerte bloquante sinon) ;
2. **réemploi** (défaut, `reemploi.taux` = 1) : `réemploi = min(besoin, Vdéblais × taux)` ; `évacuation = (Vdéblais − réemploi) × Cf` ; apport = complément éventuel ;
3. **sans réemploi** (`reemploi.actif = false`) : évacuation totale ; remblai chiffré seulement si `apportExterieur.actif` (justification demandée), sinon « non pourvu » (alerte).
⚠ Le réemploi à 100 % est une **hypothèse par défaut** (signalée en alerte `info`) : confirmez la qualité du sol.

### 6. Planchers
Types : `dallePleine`, `dalleTP`, `corpsCreuxApparent`, `corpsCreuxPlan` (+ `level.corpsCreux` = 15 | 20), `nervuree`, et les historiques `hourdis15|20` (quantités inchangées,
sous-face « non précisée »). Corps creux : entrevous (pertes incluses), béton de nervures (`betonM2 − 0,05`), table de compression (`+5`), treillis/acier, **poutrelles
seulement si `level.entraxe` est saisi** (`longueur = S ÷ entraxe` ; nombre si `porteePoutrelle`), finition de sous-face (`enduit` | `faux_plafond`). L'orientation, l'entraxe
et les portées ne sont jamais devinés (alerte « à confirmer »). **Dalle sur terre-plein : aucun coffrage de sous-face** ; rives = `périmètre × épaisseur` si `level.perimetre`
est saisi ; dalle suspendue : sous-face = surface nette. Dalle nervurée : exige `entraxe`, `b`, `h`, `epDalle`.

### 7. Toiture et pignons
`surface de couverture = surface projetée lue × (coefficient de pente √(1+p²), sinon coefficient forfaitaire du type de toiture)`. La surface projetée est celle **lue**
(surface annoncée, pans, ou dimensions + 2 × débord) : le moteur ne retombe sur l'emprise du bâtiment que si rien n'est lu. Coefficients forfaitaires (`TOITURES`) : bac 1,15
(≈ 1/cos 30°), tuiles 1,30 (1,22 géométrique + ≈ 6 % recouvrement/pertes), shingle 1,20, terrasse 1,00 ; le débord est ajouté à la surface projetée, pas au coefficient.
`totaux.toitureCalcul.formule` est la formule **réellement** appliquée et alimente la ligne 8.1 du DQE. Pignons : `plans.toiture.pignons[]` (`L1`, `P1`, `L2`, `P2`, `nb`, `type`) →
triangles `L1²·P1/2 + L2²·P2/2` ajoutés aux murs (blocs, mortier, enduits) ; sans saisie, alerte « Pignons NON inclus ».

### 8. Validation et arrondis
`src/schema.js` (sans dépendance) : dimensions négatives, mode inconnu, K, pertes, ratios, prix négatifs, plan lu → alertes **bloquantes** (les valeurs invalides sont neutralisées,
jamais d'exception). `nb = 0` est respecté (champ vide → 1). **K** doit être dans `[1 ; 2]` (`K_BORNES`) sauf `autoriserKHorsBornes`. **Arrondis** : cumuls sans arrondi intermédiaire ;
les totaux exposés sont arrondis à 2 décimales à l'assemblage ; le DQE facture la **quantité affichée (2 décimales) × un PU entier FCFA** (règle documentée : le bordereau reste vérifiable) ;
montants entiers, `ttc = ht + tva`.

### 9. TypeScript (adoption progressive)
`types/index.d.ts` décrit le contrat public (entrées, `Totaux`, `Materiaux`, `DQE`) ; `npm run typecheck` vérifie `schema.js`, `acier.js`, `planchers.js`, `materiaux.js` (`// @ts-check`).
Le reste du code reste en JavaScript ESM, sans étape de build.

### Limites connues
- L'acier reste une **estimation par ratios** (pas de ferraillage détaillé, pas de note de calcul).
- Le mode décomposé ne décompose pas la maçonnerie (blocs, mortier, main-d'œuvre) : elle reste au prix composé.
- Étaiement des planchers à corps creux, enduit de sous-face des poutrelles apparentes, remplissage des soubassements : non chiffrés / à confirmer.
- Remblai par ouvrage : indicatif (les totaux de terrassement font foi).

## Fondations : saisie utilisateur et plan de fondation

Le moteur ne recommande **aucune fondation d'après la ville ou la zone
géotechnique**. Le type de fondation, les profondeurs, les dimensions, les
longrines / chaînages, le béton de propreté et le terrassement (foisonnement,
tassement) sont saisis par l'utilisateur ou lus sur le **plan de fondation**
(dépôt « fondation » de la lecture par type). Un plan ne prouve pas la nature
du sol : le contrôle du fond de fouille avant bétonnage reste à la charge du
professionnel responsable.

## Corrections Lot C (oct. 2026)

Décision de l'équipe : en cas de conflit, la **table du Lot C fait foi** sur l'avant-métré manuel de Fès.

- **Ratios d'acier** alignés sur la table Lot C (milieu de fourchette) : chaînages/longrines/poutres 90, poteaux 115, dalle pleine 80 (semelles inchangées : 42 / 60). Effet sur le cas de référence de Fès : acier total 8 371 → 6 857 kg (−18 %).
- **Chaînage haut** (ceinture) ajouté à chaque niveau porteur hors système « ossature » : `params.chainageHaut = { actif, b, h }` (défaut 0,20 × 0,20 m), poste DQE 3.4 + acier. `level.chainageHaut = false` pour l'exclure d'un niveau.
- **Longueurs développées** (§1) : champs optionnels `jonctionsT` / `jonctionsX` sur chaque mur, à renseigner sur le mur continu qui reçoit les branches. LD = L − b·(½·nT + nX).
- **Déduction des poteaux** (§2A) : champs optionnels `poteaux` (nombre) et `largPoteau` (défaut `params.largPoteau` = 0,20 m) sur chaque mur ; surface déduite = nombre × largeur × H.
- **Alertes** : épaisseur minimale des murs porteurs selon le nombre de niveaux (15 / 20 / 25 cm, fiche Eurocode §3.A) ; double comptage en mode « pièces » (≥ 2 pièces sans murs saisis).

Aucun champ nouveau n'est obligatoire : sans saisie, les résultats des murs restent identiques à avant. Le frontend (TabNiveaux) doit exposer `jonctionsT`, `jonctionsX`, `poteaux`, `largPoteau` par mur et `chainageHaut` dans les paramètres.

## Mettre à jour les prix (sans toucher au code)

Les prix servis à l'application viennent de `civilestimateur-backend/data/prix.json` (version, date, postes), qui **surcharge poste par poste** (clé : `code`) la base RPR livrée avec le moteur (`data/prix.js`).

1. Ouvrir `civilestimateur-backend/data/prix.json`, modifier les montants `bi` (prix de base HT en FCFA) et `sac` (prix du sac pour le ciment) ; changer `version` et `date` (ex. `"RPR 27.1"`, `"2027-03"`). Ne pas changer les `code`.
2. Pousser le fichier sur GitHub : Render redéploie et `/api/prix` sert les nouveaux prix. Le frontend les charge au démarrage.
3. Un poste absent du JSON garde le prix du moteur ; un poste invalide (prix négatif, code inconnu) est ignoré et signalé dans `avertissements` de `/api/prix`. JSON absent ou cassé : repli complet sur le moteur.

Les prix déjà modifiés à la main par un utilisateur dans l'onglet Prix sont conservés ; seuls les prix encore « par défaut » suivent la nouvelle base.

## Tests

```bash
npm test
```

Le test de référence (`test/reference-r2.test.js`) est la « règle d'or » du
projet : il reproduit l'avant-métré manuel d'un R+2 réel à ±5 % près (±1–2 %
sur la plupart des postes). **Toute modification du moteur doit continuer à
le faire passer.**

---

## Plans par type (codification des plans techniques BTP)

Le moteur connaît les **8 types de plans** du document de codification
(`src/typesPlans.js`) : fondation, vue en plan, coupe, plomberie, électricité,
poutraison, toiture, coffrage.

| Élément | Rôle |
|---|---|
| `TYPES_PLANS` | Registre : libellé, module cible, signature (cartouche, codes forts/faibles) |
| `classifierPlan({ cartouche, codes })` | Score déterministe de chaque type d'après les codes lus (SF, EF, HSP, (16+4)…) |
| `routerPlan({ typeDepose, typeIA, cartouche, codes })` | Tranche le type final d'une vue : signature > type annoncé par la lecture > type du dépôt ; signale tout reclassement |
| `metrerPlomberie` | Appareils, linéaires par réseau (EF/EC/EU/EV/EP/AEP) et par Ø, regards |
| `metrerElectricite` | Décompte par symbole, convention forfait/point, tableaux |
| `metrerToiture` | Surface développée = surface en plan × √(1+p²), faîtage / noues / égouts / chéneaux |
| `niveau.voiles`, `niveau.chainagesV` | Voiles (V<n>) et chaînages verticaux (CV<n>) du plan de coffrage |

Les données validées des plans spécialisés se passent à `metrerProjet` via
`params.plans = { plomberie, electricite, toiture }`. Sans `plans`, les résultats
sont strictement inchangés (`totaux.plomberie/electricite/toitureDetail = null`).
Le DQE gagne les sections 11 (plomberie), 12 (électricité), 8.2–8.4 (accessoires
de toiture), 3.5–3.6 (voiles, CV) et 10.4 (coffrage voiles). Les nouveaux postes
sont à `bi: 0` dans `data/prix.js` tant que les prix de marché ne sont pas saisis.

Nouveau ratio d'acier `voile` (80 kg/m³, provisoire — hors table Lot C).

## Couverture de lecture et confirmations par donnée (oct. 2026)

Suite au plan d'amélioration « lecture de plans » : plus de liste de plans obligatoires, mais un **score de couverture**
et une étape de validation qui ne remonte que les **exceptions** (données ambiguës ou absentes).

- `metrerProjet()` renvoie en plus `couverture` : `{ score, resume, lots[], aConfirmer[], bloquant }` (module `src/couverture.js`).
  Exemple de résumé : « 78 % lu ; pente de toiture, profondeur de fouille à confirmer ».
- Chaque exception a un état : `a_confirmer` | `confirmee` | `corrigee` (une donnée lue sur plan est `detectee` et n'apparaît pas).
  **Une exception `a_confirmer` bloque l'export** (`exportAutorise(couverture)`) ; une valeur par défaut explicitement confirmée ne le bloque plus.
- La trace (utilisateur, date, valeur retenue) est stockée dans `params.confirmations` (projet enregistré). **Elle n'est jamais envoyée au PDF client.**
  Helpers : `enregistrerConfirmation`, `retirerConfirmation`. Les corrections numériques (profondeur de fouille, HSP par défaut, pente de toiture)
  sont appliquées au calcul par `parametresEffectifs`.
- `montantsIncomplets(dqe, couverture)` indique, par chapitre du DQE, les montants qui reposent sur une donnée encore à confirmer.
- Fondations et terrassement ne sont plus estimés **silencieusement** avec des valeurs par défaut : tant que rien n'est lu ni saisi, la question « fondation » (et « sol ») bloque l'export.
- Toiture : un pan lu avec une surface n'est plus jamais écarté. Sans pente propre il prend la pente générale, à défaut le coefficient forfaitaire de la couverture, avec alerte ; un pan manquant (pans lus < 90 % de la surface annoncée) est signalé.
- Le frontend doit porter `confirmations` dans les paramètres du projet (déjà fait dans civilestimateurF : `ValidationExceptions`).

## Lecture d'une maquette IFC (facultative)

`lireIFC(texte)` (src/ifc.js) lit un fichier IFC (STEP) sans dépendance, dans le navigateur ou sous Node, et renvoie par niveau
les murs (longueur, hauteur, épaisseur → type, position intérieure/extérieure, portes et fenêtres rattachées via les ouvertures),
la surface et l'épaisseur des dalles, les poteaux et poutres (section lue sur le profil, regroupés), la HSP (hauteur de mur médiane).
Il reprend les `BaseQuantities` du fichier, convertit les unités (mm, m, pieds) et **n'invente rien** : un élément sans quantités est
compté puis signalé. Dalles de toiture, type de plancher et pente de toiture ne sont pas déduits (à confirmer).
Règle de priorité (frontend, `consolider`) : si l'IFC fournit les murs / poteaux / poutres d'un niveau, les plans PDF ne peuvent que compléter les données absentes — jamais s'y ajouter.
Limites : IFCZIP non lu ; essayé sur une maquette écrite à la main (`test/fixtures/maquette.js`), à valider sur de vrais exports ArchiCAD / Revit.
