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
│   ├── fondationsLotA.js       recommandations géotechniques (Lot A, voir plus bas)
│   ├── projet.js               agrégation projet, acier par élément (A5), alertes (A7)
│   ├── validation.js           validations croisées (A7 + Lot A)
│   ├── dqe.js                  devis quantitatif estimatif, par lots (A9)
│   ├── sousDetail.js           sous-détail des prix unitaires (matériaux/MO/matériel)
│   └── index.js                API publique du package
├── data/
│   ├── prix.js                 base de prix RPR 26.2
│   ├── fondations.js            35 villes / 5 zones géotechniques (enrichi Lot A)
│   └── lotA.js                  tables génériques Lot A (débords, profondeurs, seuils)
├── test/                     ← node:test (aucune dépendance de test ajoutée)
│   ├── reference-r2.test.js    « règle d'or » : avant-métré manuel R+2 Fès
│   └── fondations-lotA.test.js  tests du module Lot A
└── civilestimateur-backend/  ← API Express (déploiement Render), voir son propre README
```

## Utilisation

```js
import { metrerProjet, buildDQE, recommanderFondationProjet } from 'civilestimateur-engine'

const { totaux, alertes } = metrerProjet(levels, { ...params, ville: 'Cotonou' })
const dqe = buildDQE(totaux, prixMap, params.K)
```

Le backend l'importe en relatif (voir
[`civilestimateur-backend/src/engine.js`](civilestimateur-backend/src/engine.js)).
Le frontend l'installe comme dépendance Git :

```bash
npm install civilestimateur-engine@github:eudes225-01/civilestimateurB#main
```

## Lot A — Recommandations géotechniques (fondations)

Intégration du document *Lot A — Recherche : Fondations* (Koty Maxwell &
Kpoïté Dossou Samuel, août 2026) : zone géotechnique → contrainte admissible
indicative (bar) → type de fondation recommandé → profondeur d'ancrage et
débord de travail suggérés.

**Principe : recommandation, jamais décision automatique.** Conformément à
la politique produit existante (« aucune décision automatique à la place de
l'utilisateur »), `fondationsLotA.js` ne modifie ni ne remplace les valeurs
saisies par l'utilisateur ni les formules de volume de `fondations.js`
(figées par le test de référence). Il expose :

- `recommanderFondationProjet({ ville, systeme, contrainteOverride, contexteSolOverride, nbNiveaux })`
  — recommandation complète (classification, type suggéré, justification,
  profondeur/débord/matelas drainant suggérés), utilisable pour pré-remplir
  l'UI.
- Une nouvelle alerte **bloquante** dans `validerCoherence()` quand la
  contrainte admissible de la zone est classée « faible » (< 1 bar) et que
  la fondation choisie n'est pas un radier — c'est la seule règle dure du
  Lot A (§2.2 : « faible portance → radier général, quel que soit le
  système »). Les écarts en portance « moyenne » ne lèvent qu'une alerte
  *attention*, pas bloquante.

**Choix des valeurs par défaut.** Le Lot A donne des fourchettes (ex. « 15 à
20 cm » de débord de travail). Le moteur retient systématiquement le
**milieu de la fourchette** comme valeur par défaut éditable — cohérent avec
le principe déjà appliqué aux dosages et prix unitaires (Lot D/E), et avec
l'avertissement méthodologique du document (« valeurs indicatives, à
confirmer par une étude de sol »).

## Tests

```bash
npm test
```

Le test de référence (`test/reference-r2.test.js`) est la « règle d'or » du
projet : il reproduit l'avant-métré manuel d'un R+2 réel à ±5 % près (±1–2 %
sur la plupart des postes). **Toute modification du moteur doit continuer à
le faire passer.**
