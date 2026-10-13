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
│   ├── env.js            lecture centralisée des variables d'environnement
│   └── premium.js        statuts (standard / premium / admin), fonctionnalités verrouillées, détails de l'offre
├── middleware/
│   ├── cors.js            origines autorisées (liste + prévisualisations Vercel)
│   ├── rateLimit.js        limites de débit (générale + dédiée /api/analyse-plan)
│   └── access.js           état d'accès + requirePremium (abonnement actif ou admin, pour le dépôt de plans et l'export PDF)
└── routes/
    ├── health.js, access.js, prix.js, calcul.js, compte.js,
    ├── analysePlan.js, fedapay.js, politiques.js
```

## Routes

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/health` | ping |
| GET | `/api/access` | `statut` (`standard` / `premium` / `admin`), `abonne`, fin d'abonnement, `offre` (prix, durée, ce que l'abonnement débloque) et `fonctionnalites` (chacune avec `premium` et `acces`) |
| GET | `/api/me` | profil de l'utilisateur connecté : `prenom`, `nom`, `photo` (Google), `statut`, fin d'abonnement, fonctionnalités |
| DELETE | `/api/compte` | supprime définitivement le compte, ses projets et son historique d'abonnement ; corps `{ "confirmer": true }` obligatoire |
| GET | `/api/prix` | base de prix RPR |
| POST | `/api/calcul` | métré + DQE côté serveur (compte connecté ; **non verrouillé**) |
| POST | `/api/analyse-plan` | **Premium** — proxy Anthropic (lecture des plans déposés), protégé par `requireAuth` + `requirePremium` + rate-limit dédié |
| POST | `/api/fedapay/init` | crée la transaction FedaPay, renvoie l'URL de paiement et le détail de l'offre (connexion requise) |
| POST | `/api/fedapay/verify` | confirme un paiement au retour du navigateur (connexion requise) |
| POST | `/api/fedapay/webhook` | confirmation signée envoyée par FedaPay |
| POST | `/api/pdf/devis` | **Premium** — PDF du devis rendu en HTML/CSS par Chromium (connexion exigée en production, limité à 20 / 15 min / IP) |
| POST | `/api/email/bienvenue` | mail de bienvenue, envoyé une seule fois par compte (connexion requise) |
| POST | `/api/cron/echeances` | rappels et mails d'expiration, protégé par `CRON_SECRET` |
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

## Paiement FedaPay

Fonctionnement : le client connecté clique « S'abonner » → `POST /api/fedapay/init` crée une
transaction (prix fixé côté serveur : `FEDAPAY_MONTANT`) et renvoie l'URL de paiement FedaPay →
après paiement, FedaPay appelle le webhook **et** renvoie le client sur le site
(`/?paiement=retour`) qui appelle `POST /api/fedapay/verify`. Dans les deux cas le statut est
**relu auprès de FedaPay** avant d'activer l'abonnement (table `abonnements`, clé `service_role`) ;
l'activation est idempotente (un paiement ne crédite qu'une fois) et `requirePremium` lit cette
table pour l'utilisateur identifié par son jeton Supabase.

Mise en service :
1. Exécuter `supabase/schema.sql` dans Supabase (la section « Migration FedaPay » est idempotente).
2. Renseigner sur Render : `FEDAPAY_SECRET_KEY`, `FEDAPAY_WEBHOOK_SECRET`,
   `SUPABASE_SERVICE_ROLE_KEY` (+ `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `FEDAPAY_CALLBACK`).
3. Dans FedaPay → Webhooks, créer `https://<backend>/api/fedapay/webhook` (événement
   `transaction.approved`) et copier le secret `whsec_…`.
4. Tester d'abord en sandbox (clé `sk_sandbox_…`), puis passer en `sk_live_…`.

## E-mails (Resend)

| Événement | Destinataire | Déclencheur |
|---|---|---|
| Bienvenue | client | première connexion (`POST /api/email/bienvenue`, appelé par le frontend) |
| Paiement confirmé (montant + date de fin) | client | activation de l'abonnement (webhook ou retour navigateur) |
| Paiement reçu | admin (`EMAIL_ADMIN`) | même déclencheur |

Les adresses de `EMAIL_ADMIN` sont aussi les **administrateurs** : accès à 100 % des fonctionnalités (dépôt de plans, export PDF, etc.) sans abonnement, avec le statut `admin`, à condition que l'e-mail du compte Google soit confirmé.
| Rappel d'expiration | client | tâche quotidienne, quand il reste ≤ `RAPPEL_JOURS` jours |
| Abonnement expiré | client | tâche quotidienne, après la date de fin |
| Paiement refusé / annulé | client | webhook ou retour navigateur avec statut `declined` / `canceled` |

Chaque mail n'est envoyé qu'une fois (colonnes `*_le` dans Supabase + clé d'idempotence Resend). Une panne
d'e-mail n'empêche jamais l'activation d'un abonnement payé ; pour les rappels, un envoi raté est réessayé au
passage suivant. Un abonnement renouvelé n'est ni rappelé ni déclaré expiré.

Mise en service :
1. Exécuter la section « Migration e-mails Resend » de `supabase/schema.sql`.
2. Render → variables : `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_ADMIN`, `CRON_SECRET` (voir `.env.example`).
3. Resend → Domains : le domaine `civilestimator-archinova.store` doit être au statut « Verified » (enregistrements DNS SPF/DKIM ajoutés chez votre registrar). `EMAIL_FROM` utilise ce domaine par défaut.
4. Render → New → Cron Job, même dépôt, `Build: npm install`, `Command: npm run echeances`,
   planification `0 8 * * *` (avec les mêmes variables d'environnement). Alternative : tâche externe
   qui appelle `POST /api/cron/echeances` avec `Authorization: Bearer <CRON_SECRET>`.

## PDF du devis (HTML/CSS → Chromium)

`POST /api/pdf/devis` reçoit le modèle du document calculé par le frontend (postes, sous-détail, métrés,
logo/couleur/mentions) et renvoie un PDF A4 : couverture, synthèse, DQE par chapitres avec sous-totaux,
arrêté en lettres, signatures, sous-détail des prix, métrés, en-tête/pied de page répétés « Page X / Y ».
Code : `src/services/pdf/` (gabarit `devisHtml.js`, rendu `rendu.js`). Polices Space Grotesk + Inter
embarquées via `@fontsource-variable/*` ; aucune requête réseau pendant le rendu.

**Render — à régler une fois :**
- *Build Command* : `npm install && npx puppeteer browsers install chrome` (le script `npm run build` fait la 2ᵉ partie).
  `.puppeteerrc.cjs` place Chrome dans `.cache/puppeteer`, dossier conservé jusqu'au démarrage.
- Mémoire : Chromium a besoin d'environ 300–400 Mo. L'instance gratuite (512 Mo) est limite ; si le service
  redémarre pendant un export, passer à l'instance *Starter*. Entre-temps le frontend bascule tout seul sur son
  export local simplifié (jsPDF) quand la route répond 5xx.
- Premium : seuls `/api/pdf/devis` et `/api/analyse-plan` (dépôt de plans) exigent une session (401) et un abonnement actif (402) ; les administrateurs passent. `/api/calcul` et les projets restent libres pour tout compte connecté.
- Après paiement confirmé, `statut` passe de `standard` à `premium` (jusqu'à la fin de l'abonnement). Un 402 renvoie aussi `offre`, pour afficher le récapitulatif.

## Variables d'environnement

Voir [`.env.example`](.env.example).
