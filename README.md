# civilestimateur-engine

Moteur de calcul **CivilEstimator** — métré, DQE, sous-détail des prix
unitaires et recommandations géotechniques (Lot A — Fondations). C'est la
**source de vérité unique** du projet CivilEstimator : ce package est
consommé à la fois par ce dépôt (l'API Express, dans
[`civilestimateur-backend/`](civilestimateur-backend)) et par le frontend
([`civilestimateurF`](https://github.com/eudes225-01/civilestimateurF)),
qui l'installe comme dépendance Git.

> Avant août 2026, le moteur existait en deux copies maintenues à la main
> (une version ESM côté frontend, une version CommonJS côté backend), avec
> un risque réel de divergence silencieuse entre les deux applications. Ce
> package élimine cette duplication : il n'existe plus qu'un seul fichier
> de formules, à un seul endroit.

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
