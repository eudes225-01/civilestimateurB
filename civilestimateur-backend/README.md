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
│   └── access.js           état d'accès + requirePremium (abonnement actif obligatoire pour les dépôts de plans et le PDF ; statut standard / premium / admin)
└── routes/
    ├── health.js, access.js, prix.js, calcul.js,
    ├── analysePlan.js, fedapay.js, politiques.js
```

## Routes

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/health` | ping |
| GET | `/api/access` | abonnement de l'utilisateur connecté (`abonne`), prix et durée — aucune période gratuite |
| GET | `/api/prix` | base de prix RPR |
| POST | `/api/calcul` | métré + DQE côté serveur (gratuit, compte connecté) |
| DELETE | `/api/compte` | suppression définitive du compte (corps : `{ "confirmation": "SUPPRIMER" }`) |
| POST | `/api/analyse-plan` | proxy Anthropic (lecture de plan), protégé par `requireAuth` + `requirePremium` + rate-limit dédié |
| POST | `/api/fedapay/init` | crée la transaction FedaPay, renvoie l'URL de paiement (connexion requise) |
| POST | `/api/fedapay/verify` | confirme un paiement au retour du navigateur (connexion requise) |
| POST | `/api/fedapay/webhook` | confirmation signée envoyée par FedaPay |
| POST | `/api/pdf/devis` | PDF du devis rendu en HTML/CSS par Chromium (connexion exigée en production, limité à 20 / 15 min / IP) |
| POST | `/api/email/bienvenue` | mail de bienvenue, envoyé une seule fois par compte (connexion requise) |
| POST | `/api/cron/echeances` | rappels et mails d'expiration, protégé par `CRON_SECRET` |
| GET | `/api/politiques` | CGU servies en JSON |
| POST | `/api/politiques/acceptation` | connecté — enregistre la preuve d'acceptation des conditions (accueil) |
| POST | `/api/abonnement/confirmation/renvoyer` | connecté — renvoie par e-mail le PDF de confirmation (5 / 15 min / IP, 1 renvoi / 2 min) |

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

Les adresses de `EMAIL_ADMIN` sont aussi les **administrateurs** : accès complet (dépôts de plans, PDF, tout le reste) sans abonnement, statut `admin`, à condition que l'e-mail du compte Google soit confirmé.
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
- Premium (payant) : seuls `/api/pdf/devis` et `/api/analyse-plan` (dépôts de plans) exigent une session (401) et un abonnement actif (402). `/api/calcul` (DQE) est gratuit pour tout compte connecté.

## Variables d'environnement

Voir [`.env.example`](.env.example).

## PDF de confirmation d'abonnement (envoyé après paiement)

À chaque paiement confirmé, l'e-mail « Paiement confirmé » part avec un PDF en pièce jointe : récapitulatif
(client, montant, n° de transaction FedaPay, période d'accès, fonctionnalités Premium) puis **l'intégralité des
conditions d'utilisation** en vigueur à cette date (version incluse). Le texte vient de `src/services/politiquesTexte.js`
(le même que `GET /api/politiques` ; à tenir identique à `src/data/politiques.js` du frontend). Gabarit :
`src/services/pdf/confirmationPdf.js`, rendu par le même Chromium que le devis.
- Si le PDF ne peut pas être généré (Chromium indisponible, file pleine), l'e-mail part quand même, sans pièce jointe.
- `EMAIL_REPLY_TO` (par défaut archinova87@gmail.com) est repris comme adresse de contact dans les conditions du PDF.
- En ajoutant ou modifiant une clause, incrémenter `VERSION` et `DATE` dans `politiquesTexte.js`.

## Preuves de confirmation (Supabase) et renvoi de la confirmation

**À faire une fois :** exécuter la section « Migration preuves de confirmation » de `supabase/schema.sql` (SQL Editor → Run).
Elle crée `public.preuves_confirmation`, écrite uniquement par le backend (clé service_role) ; le titulaire peut la lire.

- **Acceptation** : le paiement exige `{ acceptation: true }` dans `POST /api/fedapay/init` (400 `conditions_a_accepter` sinon) ;
  la preuve (version, date, texte exact des conditions, empreinte SHA-256, version affichée par l'interface) est écrite AVANT la
  transaction. Une 2ᵉ preuve est écrite à l'accueil de l'application (contexte `accueil`).
- **Confirmation de paiement** : à l'activation de l'abonnement, une ligne par transaction (n° FedaPay, montant, période, e-mail,
  conditions acceptées) ; `email_envoye_le` / `pdf_joint` sont complétés à l'envoi du mail, `renvoyee_le` / `renvois` à chaque renvoi.
- **Renvoi** : le PDF reprend le texte EXACT des conditions de l'époque (colonne `conditions`) et porte la mention « Duplicata ».
  Il part toujours à l'adresse du compte connecté. Sans preuve (paiement antérieur), on se rabat sur le dernier paiement et les conditions actuelles.
- Les preuves sont supprimées avec le compte (`on delete cascade`), comme l'annonce la clause « Vos données ».
- Interroger une preuve : `select type, contexte, version_conditions, hash_conditions, fedapay_transaction_id, cree_le, email_envoye_le from preuves_confirmation where user_id = '…' order by cree_le;`
