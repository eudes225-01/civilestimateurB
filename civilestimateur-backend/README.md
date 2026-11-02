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
│   └── access.js           état d'accès (solde de crédits CST, forfaits, tarif ; statut standard / admin) + exigerUtilisateur / exigerCredits
├── services/
│   ├── tarifs.js           forfaits, coût d'une lecture au token, réserve par appel (fonctions pures)
│   ├── credits.js          soldes, achats, réservation et règlement (Supabase, fonctions SQL atomiques)
│   └── lectures.js         lecture de plans facturée : réserve → appel → règlement au coût réel
└── routes/
    ├── health.js, access.js, prix.js, calcul.js,
    ├── analysePlan.js, fedapay.js, politiques.js
```

## Routes

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/health` | ping |
| GET | `/api/access` | solde de crédits CST de l'utilisateur connecté, forfaits, solde minimum de lecture, tarif au token |
| GET | `/api/prix` | base de prix RPR |
| POST | `/api/calcul` | métré + DQE côté serveur (gratuit, compte connecté) |
| DELETE | `/api/compte` | suppression définitive du compte (corps : `{ "confirmation": "SUPPRIMER" }`) |
| POST | `/api/analyse-plan` | proxy Anthropic (lecture de plan) facturé en crédits CST au token ; corps `{ messages, debutLecture? }` ; 402 `credits_insuffisants` sans solde ; rate-limit dédié |
| POST | `/api/fedapay/init` | crée la transaction du forfait choisi (`{ forfait, acceptation }`), renvoie l'URL de paiement (connexion requise) |
| POST | `/api/fedapay/verify` | confirme un paiement au retour du navigateur (connexion requise) |
| POST | `/api/fedapay/webhook` | confirmation signée envoyée par FedaPay |
| POST | `/api/pdf/devis` | PDF du devis rendu en HTML/CSS par Chromium (gratuit, connexion exigée, limité à 20 / 15 min / IP) |
| POST | `/api/email/bienvenue` | mail de bienvenue, envoyé une seule fois par compte (connexion requise) |
| GET | `/api/politiques` | CGU servies en JSON |
| POST | `/api/politiques/acceptation` | connecté — enregistre la preuve d'acceptation des conditions (accueil) |
| POST | `/api/credits/confirmation/renvoyer` | connecté — renvoie par e-mail le PDF de confirmation (5 / 15 min / IP, 1 renvoi / 2 min) |

## Sécurité — état et limites connues

Cette refonte corrige :
- **CORS** : l'ancienne valeur par défaut portait un slash final qui ne
  matchait jamais l'en-tête `Origin` du navigateur.
- **Contournement trivial** : l'ancien code acceptait un en-tête
  `x-subscription: active` non signé comme preuve d'abonnement. Supprimé ; le solde n'est lu que côté serveur.
- **Absence de limite de débit** sur `/api/analyse-plan`, qui déclenche un
  appel facturé à l'API Anthropic à chaque requête. Un rate-limit dédié
  (20 requêtes / 15 min / IP) a été ajouté, en plus d'un rate-limit général.
- En-têtes de sécurité standard via `helmet`.

## Crédits CST et paiement FedaPay

`APP_GRATUITE=oui` désactive tout le dispositif (aucun crédit exigé ni débité, `/api/fedapay/init` répond 404) ; la valeur par défaut `non` active les crédits.

Il n'y a **plus d'abonnement** : la lecture automatique des plans consomme des **crédits CST** (CivilEstimator), achetés
par forfaits. Tout le reste (projets, métré, prix, DQE, export PDF) est gratuit pour un compte connecté.

- **Forfaits** : 2 500, 5 000, 10 000 et 20 000 FCFA (`CST_FORFAITS`) ; 1 FCFA payé = 1 CST (`CST_PAR_FCFA`). Les crédits n'expirent pas.
- **Solde minimum pour démarrer une lecture** : 2 500 CST (`CST_MINIMUM_LECTURE`). Le frontend marque le premier appel d'une
  lecture avec `debutLecture: true` ; le serveur refuse (402 `credits_insuffisants`) si le solde est sous le minimum.
- **Coût d'une lecture = tokens réellement traités** : à chaque appel au service d'analyse, une *réserve* (coût maximal
  plausible, ≈ 330 CST avec les tarifs par défaut) est bloquée atomiquement ; l'usage renvoyé par l'API (`input_tokens`,
  `output_tokens`) donne le coût réel (`CST_PRIX_ENTREE_MILLION` / `CST_PRIX_SORTIE_MILLION`, en CST par million de tokens) ;
  la réserve est alors réglée (l'excédent est restitué, un appel échoué est intégralement restitué). Le solde ne peut jamais
  être négatif, même avec des appels simultanés. Chaque mouvement est tracé dans `credits_mouvements` (tokens inclus).
- **Administrateurs** (`EMAIL_ADMIN`, e-mail confirmé) : jamais débités.

Achat : le client connecté choisit un forfait → `POST /api/fedapay/init` (`{ forfait, acceptation: true }`) ; seul un montant de
la liste serveur est accepté, le nombre de CST est calculé côté serveur. Après paiement, FedaPay appelle le webhook **et** renvoie
le client sur le site (`/?paiement=retour`) qui appelle `POST /api/fedapay/verify`. Dans les deux cas le statut est **relu auprès
de FedaPay** avant de créditer le solde (fonction SQL `crediter_achat`, idempotente : un paiement ne crédite qu'une fois).

Mise en service :
1. Exécuter dans Supabase (SQL Editor) `supabase/migration-credits.sql` (= la section « CRÉDITS CST » de `supabase/schema.sql`) — **à faire AVANT de déployer ce code**
   (tables `credits_soldes`, `achats_credits`, `credits_mouvements` et fonctions `crediter_achat`, `reserver_credits`, `regler_credits`).
   L'ancienne table `abonnements` n'est plus utilisée ; elle peut être conservée (historique) ou supprimée plus tard.
2. Renseigner sur Render : `FEDAPAY_SECRET_KEY`, `FEDAPAY_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`
   (+ `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `FEDAPAY_CALLBACK`). Les anciennes variables `FEDAPAY_MONTANT`, `FEDAPAY_DUREE_JOURS`,
   `RAPPEL_JOURS` et `CRON_SECRET` ne servent plus.
3. Dans FedaPay → Webhooks, créer `https://<backend>/api/fedapay/webhook` (événement `transaction.approved`) et copier le secret `whsec_…`.
4. Vérifier le tarif au token (`CST_PRIX_*`) par rapport au prix réel du modèle utilisé (`ANTHROPIC_MODEL`) et au taux FCFA/USD.
5. Supprimer, si elle existe, la tâche planifiée « échéances » (Render Cron Job ou service externe) : la route `/api/cron/echeances` n'existe plus.
6. Tester d'abord en sandbox (clé `sk_sandbox_…`), puis passer en `sk_live_…`.

## E-mails (Resend)

| Événement | Destinataire | Déclencheur |
|---|---|---|
| Bienvenue | client | première connexion (`POST /api/email/bienvenue`, appelé par le frontend) |
| Paiement confirmé (montant, crédits ajoutés, solde) | client | crédit de l'achat (webhook ou retour navigateur) |
| Paiement reçu | admin (`EMAIL_ADMIN`) | même déclencheur |
| Paiement refusé / annulé | client | webhook ou retour navigateur avec statut `declined` / `canceled` |

Les adresses de `EMAIL_ADMIN` sont aussi les **administrateurs** : lecture de plans sans crédits, statut `admin`, à condition que
l'e-mail du compte Google soit confirmé.

Chaque mail n'est envoyé qu'une fois (colonne `echec_notifie_le`, `email_envoye_le` + clé d'idempotence Resend). Une panne
d'e-mail n'empêche jamais le crédit d'un achat payé. Il n'y a plus de rappel ni d'e-mail d'expiration (pas d'abonnement).

Mise en service :
1. Render → variables : `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_ADMIN` (voir `.env.example`).
2. Resend → Domains : le domaine `civilestimator-archinova.store` doit être au statut « Verified » (enregistrements DNS SPF/DKIM
   ajoutés chez votre registrar). `EMAIL_FROM` utilise ce domaine par défaut.

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
- `/api/pdf/devis` et `/api/calcul` (DQE) sont gratuits pour tout compte connecté (401 sans session). Seule la lecture de plans (`/api/analyse-plan`) consomme des crédits CST (402 sans solde suffisant).

## Variables d'environnement

Voir [`.env.example`](.env.example).

## PDF de confirmation d'achat de crédits (envoyé après paiement)

À chaque paiement confirmé, l'e-mail « Paiement confirmé » part avec un PDF en pièce jointe : récapitulatif
(client, montant, crédits CST obtenus, solde après achat, n° de transaction FedaPay) puis **l'intégralité des
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
- **Confirmation de paiement** : au crédit de l'achat, une ligne par transaction (n° FedaPay, montant, crédits, solde après achat, e-mail,
  conditions acceptées) ; `email_envoye_le` / `pdf_joint` sont complétés à l'envoi du mail, `renvoyee_le` / `renvois` à chaque renvoi.
- **Renvoi** : le PDF reprend le texte EXACT des conditions de l'époque (colonne `conditions`) et porte la mention « Duplicata ».
  Il part toujours à l'adresse du compte connecté. Sans preuve (paiement antérieur), on se rabat sur le dernier achat et les conditions actuelles.
- Les preuves sont supprimées avec le compte (`on delete cascade`), comme l'annonce la clause « Vos données ».
- Interroger une preuve : `select type, contexte, version_conditions, hash_conditions, fedapay_transaction_id, cree_le, email_envoye_le from preuves_confirmation where user_id = '…' order by cree_le;`

## Migration SQL requise (crédits CST)

Exécuter une fois, dans l'éditeur SQL de Supabase, la section « CRÉDITS CST » de `supabase/schema.sql` (idempotente). Sans elle,
l'achat (`/rpc/crediter_achat`) et la lecture de plans (`/rpc/reserver_credits`, `/rpc/regler_credits`) échouent : à faire AVANT
de déployer ce code.

## Verrouiller les dépendances

`package-lock.json` ne contient pas `puppeteer`, `pdf-lib` ni les polices : depuis ce dossier, lancer
`npm install`, puis commiter le `package-lock.json` obtenu (vérifier ensuite avec `npm ci`).
