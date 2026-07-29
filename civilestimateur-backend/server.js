// backend/server.js
// CivilEstimator — API & proxy.
// Déploiement type : Render (Node) ; frontend sur Vercel.
//
//   npm install && npm start
//
// Variables d'environnement : voir .env.example

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const { metrerProjet, buildDQE, TVA } = require('./lib/metre');

const app = express();
app.use(express.json({ limit: '25mb' })); // plans PDF/image en base64

// ---- CORS : limiter aux origines autorisées (Vercel + local) ----
const ALLOWED = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,https://civilestimateur-archinova.vercel.app/')
  .split(',').map((s) => s.trim());
const VERCEL_PREVIEW = /^https:\/\/[a-z0-9-]+-eudes-avgms-projects\.vercel\.app$/;
app.use(cors({
  origin: (origin, cb) => (!origin || ALLOWED.includes(origin) || VERCEL_PREVIEW.test(origin))
    ? cb(null, true) : cb(new Error('Origine non autorisée')),
}));

// ---- chargement des données ----
const PRIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'prix-rpr.json'), 'utf8'));
const FOND = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'fondations.json'), 'utf8'));

// ====== PÉRIODE GRATUITE (3 mois à partir du lancement) ======
const LANCEMENT = new Date(process.env.LANCEMENT_DATE || '2026-06-26T00:00:00Z');
const FIN_GRATUIT = new Date(LANCEMENT); FIN_GRATUIT.setMonth(FIN_GRATUIT.getMonth() + 3);

function accessState() {
  const now = new Date();
  const gratuit = now < FIN_GRATUIT;
  const joursRestants = Math.max(0, Math.ceil((FIN_GRATUIT - now) / 86400000));
  return {
    gratuit,
    joursRestants,
    finGratuit: FIN_GRATUIT.toISOString(),
    // fonctions Premium verrouillées une fois la période terminée (sauf abonnement actif)
    premiumRequis: !gratuit,
    message: gratuit
      ? `Accès gratuit à toutes les fonctionnalités jusqu'au ${FIN_GRATUIT.toLocaleDateString('fr-FR')} (J-${joursRestants}).`
      : `Période de lancement terminée. Abonnement FedaPay requis pour le Premium.`,
  };
}

// petit middleware : vérifie l'accès Premium (gratuit OU abonnement actif)
function requirePremium(req, res, next) {
  const st = accessState();
  const abonneActif = req.headers['x-subscription'] === 'active'; // à remplacer par une vraie vérif (DB/JWT)
  if (st.gratuit || abonneActif) return next();
  return res.status(402).json({ error: 'premium_required', ...st });
}

// ============================ ROUTES ============================

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'CivilEstimator API' }));

// État de l'accès (le bandeau promo du frontend l'interroge)
app.get('/api/access', (_req, res) => res.json(accessState()));

// Base de prix RPR + dosages
app.get('/api/prix', (_req, res) => res.json(PRIX));

// Fondations par zone / ville
app.get('/api/fondations', (_req, res) => res.json(FOND));
app.get('/api/fondations/:ville', (req, res) => {
  const ville = req.params.ville;
  const zoneKey = FOND.villes[ville];
  if (!zoneKey) return res.status(404).json({ error: 'ville_inconnue', villes: Object.keys(FOND.villes) });
  res.json({ ville, zone: zoneKey, ...FOND.zones[zoneKey], avertissement: FOND.avertissement });
});

// Calcul automatique : métré + DQE (déterministe)
// body: { levels: [...], params: {...}, prix: {code: pu} (optionnel), K: 1.30 }
app.post('/api/calcul', (req, res) => {
  try {
    const { levels = [], params = {}, prix, K = 1.30 } = req.body || {};
    const { totaux, parNiveau, alertes } = metrerProjet(levels, params);
    const prixMap = prix || Object.fromEntries(PRIX.postes.map((p) => [p.code, p.sac || p.bi]));
    const dqe = buildDQE(totaux, prixMap, +K || 1.30);
    res.json({ totaux, parNiveau, alertes, dqe, tva: TVA });
  } catch (e) {
    res.status(400).json({ error: 'calcul_invalide', detail: String(e.message) });
  }
});

// ---- FedaPay : init d'une transaction d'abonnement Premium ----
// Pour activer : npm i fedapay, et renseigner FEDAPAY_SECRET_KEY.
app.post('/api/fedapay/init', async (req, res) => {
  try {
    const { montant = 5000, email, description = 'Abonnement Premium CivilEstimator' } = req.body || {};
    if (!process.env.FEDAPAY_SECRET_KEY) {
      return res.status(501).json({ error: 'fedapay_non_configure',
        aide: 'Renseignez FEDAPAY_SECRET_KEY puis décommentez le bloc FedaPay dans server.js.' });
    }
    // const { FedaPay, Transaction } = require('fedapay');
    // FedaPay.setApiKey(process.env.FEDAPAY_SECRET_KEY);
    // FedaPay.setEnvironment(process.env.FEDAPAY_ENV || 'live');
    // const tx = await Transaction.create({
    //   description, amount: montant, currency: { iso: 'XOF' },
    //   callback_url: process.env.FEDAPAY_CALLBACK,
    //   customer: { email: email || 'client@example.com' },
    // });
    // const token = await tx.generateToken();
    // return res.json({ url: token.url, id: tx.id });
    return res.json({ stub: true, montant, message: 'Bloc FedaPay à activer (clé requise).' });
  } catch (e) {
    res.status(500).json({ error: 'fedapay_init', detail: String(e.message) });
  }
});

// ---- FedaPay : webhook de confirmation de paiement ----
app.post('/api/fedapay/webhook', express.json(), (req, res) => {
  // 1) Vérifier la signature du webhook (header 'x-fedapay-signature') avec FEDAPAY_WEBHOOK_SECRET.
  // 2) Si 'transaction.approved' -> activer l'abonnement de l'utilisateur en base.
  // console.log('Webhook FedaPay', req.body?.entity?.status);
  res.sendStatus(200);
});

// ---- Proxy "calcul automatique avancé" (analyse de plan, optionnel) ----
// Relaie vers l'API Anthropic SANS exposer la clé au frontend. Présenté côté
// utilisateur comme "calcul automatique" (pas "IA") pour ne pas dérouter les clients.
app.post('/api/analyse-plan', requirePremium, async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(501).json({ error: 'analyse_non_configuree' });
    }
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 16000,
        messages: req.body.messages || [],
      }),
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: 'proxy', detail: String(e.message) });
  }
});

// Politiques d'utilisation (servies aussi en API pour cohérence frontend/PDF)
app.get('/api/politiques', (_req, res) => {
  res.json({
    version: '1.0',
    sections: [
      { t: 'Objet & valeur des résultats', c: "Outil d'aide au métré. Quantités, prix et fondations indicatifs (Guide du métré Bénin + RPR 26.2). Ne remplacent ni le CCTP/CPT, ni les prix réels, ni une étude géotechnique. L'utilisateur reste responsable de son offre." },
      { t: 'Calcul automatique', c: 'Calculs déterministes appliquant des formules publiques et des coefficients modifiables. Aucune décision automatique à la place de l\'utilisateur.' },
      { t: 'Période gratuite & abonnement', c: `Gratuit pour tous jusqu'au ${FIN_GRATUIT.toLocaleDateString('fr-FR')}. Ensuite, Premium via abonnement FedaPay.` },
      { t: 'Paiements', c: 'Traités par FedaPay (Mobile Money/carte). Aucune donnée bancaire stockée.' },
      { t: 'Données & confidentialité', c: 'Saisies utilisées uniquement pour produire le métré. Aucune revente de données de projet.' },
      { t: 'Limitation de responsabilité', c: "Éditeur non responsable d'un chiffrage erroné, prix périmé ou fondation inadaptée. Cadre : marchés publics (DNCMP/ARMP), fiscalité (DGI)." },
      { t: 'Propriété & usage', c: 'Documents générés appartiennent à l\'utilisateur. Extraction massive ou revente de la base interdite.' },
    ],
  });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`CivilEstimator API → http://localhost:${PORT}`));
