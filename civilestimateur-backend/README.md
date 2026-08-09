# civilestimateur-backend

API & proxy CivilEstimator (Express 4, ESM). Déploiement : Render (Node) ;
frontend sur Vercel.

Le moteur de calcul (métré, DQE, recommandations Lot A) **ne vit pas dans ce
dossier** : il vit à la racine du dépôt
([`../src`](../src), package `civilestimateur-engine`) et est importé en
relatif via [`src/engine.js`](src/engine.js). Voir le
[README racine](../README.md) pour le moteur lui-même.

## Démarrage

```bash
npm install
cp .env.example .env   # renseigner au minimum ANTHROPIC_API_KEY si besoin de /api/analyse-plan
npm start              # → http://localhost:8080
npm run dev             # avec rechargement automatique (node --watch)
npm test                # test d'intégration (routes, sans dépendance externe)
```

## Architecture

```
src/
├── app.js              création de l'app Express (testable sans ouvrir de port)
├── server.js            point d'entrée (app.listen)
├── engine.js             ré-export du moteur (../../src/index.js)
├── config/
│   └── env.js            lecture centralisée des variables d'environnement
├── middleware/
│   ├── cors.js            origines autorisées (liste + prévisualisations Vercel)
│   ├── rateLimit.js        limites de débit (générale + dédiée /api/analyse-plan)
│   └── access.js           état de la période gratuite + requirePremium
└── routes/
    ├── health.js, access.js, prix.js, fondations.js, calcul.js,
    ├── analysePlan.js, fedapay.js, politiques.js
```

## Routes

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/health` | ping |
| GET | `/api/access` | état de la période gratuite |
| GET | `/api/prix` | base de prix RPR |
| GET | `/api/fondations` · `/api/fondations/:ville` | zones géotechniques |
| GET | `/api/fondations/:ville/recommandation` | **Lot A** — recommandation de fondation (query : `systeme`, `contrainte`, `niveaux`) |
| POST | `/api/calcul` | métré + DQE côté serveur |
| POST | `/api/analyse-plan` | proxy Anthropic (lecture de plan), protégé par `requirePremium` + rate-limit dédié |
| POST | `/api/fedapay/init` · `/api/fedapay/webhook` | abonnement Premium (non implémenté — voir TODO ci-dessous) |
| GET | `/api/politiques` | CGU servies en JSON |

## Sécurité — état et limites connues

Cette refonte corrige :
- **CORS** : l'ancienne valeur par défaut portait un slash final qui ne
  matchait jamais l'en-tête `Origin` du navigateur.
- **Contournement Premium trivial** : l'ancien code acceptait un en-tête
  `x-subscription: active` non signé comme preuve d'abonnement. Supprimé.
- **Absence de limite de débit** sur `/api/analyse-plan`, qui déclenche un
  appel facturé à l'API Anthropic à chaque requête. Un rate-limit dédié
  (20 requêtes / 15 min / IP) a été ajouté, en plus d'un rate-limit général.
- En-têtes de sécurité standard via `helmet`.

**Ce qui reste un TODO assumé** (hors périmètre de cette refonte, qui portait
sur le moteur et le Lot A) : il n'existe **aucune vérification réelle
d'abonnement** — pas de compte utilisateur, pas de JWT, pas de base de
données. Hors période gratuite, `requirePremium` refuse simplement toute
requête (402). Voir les commentaires `TODO(paiement)` dans
`src/middleware/access.js` et `src/routes/fedapay.js` pour le plan
d'implémentation (webhook FedaPay signé → activation persistée → JWT vérifié
ici).

## Variables d'environnement

Voir [`.env.example`](.env.example).
