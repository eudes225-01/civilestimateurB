// src/services/politiquesTexte.js
// Texte des politiques d'utilisation — source unique côté serveur : servi par GET /api/politiques
// et reproduit en intégralité dans le PDF envoyé au client après paiement (services/pdf/confirmationPdf.js).
// Texte identique à celui de l'interface (frontend : src/data/politiques.js) — à modifier ensemble.
export const VERSION = "3.3"
export const DATE = "8 novembre 2026"

export const SECTIONS = [
  {
    "t": "1. Le service",
    "c": "CivilEstimateur produit le métré et le devis quantitatif estimatif (DQE) du gros œuvre en francs CFA, à partir des dimensions que vous saisissez ou des plans que vous déposez. Les quantités s'appuient sur le Guide du métré (Bénin) et les prix sur le barème de prix RPR, que vous pouvez modifier ligne par ligne."
  },
  {
    "t": "2. Valeur des résultats",
    "c": "Les calculs sont déterministes : mêmes données, mêmes résultats, selon des formules publiques et des coefficients que vous contrôlez (coefficient K, prix unitaires, hypothèses de fondation). Le résultat est une estimation professionnelle, pas un engagement de prix : il ne remplace ni le CCTP/CPT, ni un métré d'exécution, ni les prix réels du marché, ni une étude géotechnique. Vous restez responsable de l'offre que vous remettez et des données que vous saisissez."
  },
  {
    "t": "3. Lecture automatique des plans (crédits CST)",
    "c": "Les plans déposés sont transmis à un prestataire d'analyse automatique d'images (Anthropic) pour en extraire dimensions et éléments. Cette lecture peut comporter des erreurs : vous vérifiez et corrigez les valeurs proposées avant tout calcul. Les fichiers de plans ne sont pas conservés sur nos serveurs et ne sont utilisés que pour produire votre métré."
  },
  {
    "t": "4. Gratuit et crédits CST",
    "c": "Avec un compte (connexion Google), l'accès est gratuit pour les projets, les niveaux et le métré, les prix modifiables, le DQE complet, l'export PDF professionnel (page de garde, sous-détail des prix, métrés, logo et mentions légales) et l'enregistrement de vos projets. Seule la lecture automatique des plans consomme des crédits CST (CivilEstimator)."
  },
  {
    "t": "5. Crédits CST et paiement",
    "c": "Les crédits CST s'achètent par forfaits (2 500, 5 000, 10 000 ou 20 000 FCFA) : 1 FCFA payé donne 1 CST. Il n'y a ni abonnement ni renouvellement automatique : vous rechargez quand vous le souhaitez. Les crédits achetés à partir du 1er décembre 2026 sont valables un mois à compter du dernier achat soumis à expiration. Sans nouvelle recharge, seuls les crédits soumis à expiration encore disponibles sont supprimés à l'échéance (un rappel est envoyé par e-mail quelques jours avant). Les crédits présents avant le 1er décembre 2026 et ceux acquis avant cette date restent protégés, y compris après une recharge ultérieure ; les consommations utilisent d'abord les crédits soumis à expiration. Une lecture complète réussie est facturée au minimum 1 197 CST. Si le calcul fondé sur les tokens réellement traités dépasse ce montant, le coût réel supérieur est facturé. Le poids des documents peut augmenter le nombre de tokens traités. Un solde d'au moins 1 197 CST est requis pour démarrer une lecture ; les appels d'analyse qui échouent ne sont pas facturés. Le solde ne peut jamais devenir négatif. Après chaque paiement, vous recevez par e-mail une confirmation accompagnée d'un PDF qui reproduit l'intégralité de ces conditions ; vous pouvez à tout moment vous la faire renvoyer depuis le menu de votre compte. Le paiement est traité par FedaPay (Mobile Money ou carte) : nous ne stockons aucune donnée bancaire."
  },
  {
    "t": "6. Problèmes de paiement et remboursement",
    "c": "Les crédits achetés ne sont pas remboursables, ni en FCFA ni en CST, sauf erreur de notre part. Si une lecture échoue du côté du service d'analyse, les crédits qui lui étaient réservés vous sont restitués. Si un paiement est débité sans que les crédits soient ajoutés, ou en cas de double paiement, contactez-nous : nous corrigeons la situation ou remboursons le montant concerné."
  },
  {
    "t": "7. Vos données",
    "c": "Votre nom et votre adresse e-mail Google servent à créer votre compte, retrouver vos projets et vous envoyer les e-mails de service (confirmation de paiement). Vos saisies restent liées à votre compte. Nous ne revendons ni ne partageons vos données de projet. Vous pouvez supprimer votre compte depuis le menu du compte : votre profil, vos projets, votre solde de crédits et votre historique d'achats sont alors effacés définitivement. Pour pouvoir prouver le contrat, nous conservons la trace de votre acceptation des conditions (version, date) et de la confirmation de chaque paiement ; ces éléments sont effacés avec votre compte."
  },
  {
    "t": "8. Vos documents et usage de la base",
    "c": "Les documents générés (DQE, PDF) vous appartiennent. Le barème de prix et le moteur de calcul restent la propriété de l'éditeur : l'extraction massive, la copie systématique ou la revente de la base sont interdites. Un usage raisonnable est attendu : des limites techniques de débit protègent le service."
  },
  {
    "t": "9. Responsabilité",
    "c": "Nous apportons le plus grand soin au moteur de calcul et aux prix de référence, et nous les tenons à jour. L'éditeur ne peut toutefois être tenu responsable des décisions commerciales ou contractuelles prises sur la seule base d'un devis généré, d'un prix du marché qui a évolué, d'une donnée saisie ou lue de manière erronée, ni d'une fondation inadaptée au sol du terrain. Les résultats doivent être validés par un professionnel avant tout engagement, notamment pour les marchés publics (DNCMP/ARMP) et la fiscalité (DGI)."
  },
  {
    "t": "10. Évolution des conditions",
    "c": "Ces conditions peuvent évoluer, notamment lorsque le service, le barème ou le tarif des crédits change. La version en vigueur est celle affichée sur le site, avec sa date de mise à jour."
  }
]
