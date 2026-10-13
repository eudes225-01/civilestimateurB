// src/routes/compte.js
//   GET    /api/me       (connecté) profil affichable (prénom, nom, photo), statut et abonnement
//   DELETE /api/compte   (connecté) supprime définitivement le compte et ses données
//
// Le statut vient du serveur : « standard » (compte connecté), « premium » (abonnement payé
// actif) ou « admin » (EMAIL_ADMIN, accès à 100 % des fonctionnalités). Créer, enregistrer et
// supprimer un projet passent directement par Supabase (Row Level Security : chacun ne touche
// que ses projets) ; la déconnexion est côté navigateur. Seule la suppression du compte exige
// la clé service_role, donc le serveur.
import { Router } from 'express'
import { etatUtilisateur } from '../middleware/access.js'
import { requireUser } from '../middleware/auth.js'
import { compteLimiter } from '../middleware/rateLimit.js'
import { supprimerUtilisateurAuth } from '../services/supabase.js'

export const compteRouter = Router()

compteRouter.get('/me', compteLimiter, requireUser, async (req, res) => {
  const u = req.user
  const etat = await etatUtilisateur(u)
  res.json({
    id: u.id,
    email: u.email,
    prenom: u.prenom,
    nom: u.nomFamille,
    nomComplet: u.nom,
    photo: u.photo,
    statut: etat.statut,
    admin: etat.admin,
    abonne: etat.abonne,
    finAbonnement: etat.finAbonnement,
    joursRestants: etat.joursRestants,
    fonctionnalites: etat.fonctionnalites,
  })
})

// Irréversible : le corps doit contenir { "confirmer": true } (garde-fou contre un appel accidentel).
// Efface le compte, ses projets, son profil et son historique d'abonnement (cascade en base).
compteRouter.delete('/compte', compteLimiter, requireUser, async (req, res) => {
  if (req.body?.confirmer !== true) return res.status(400).json({ error: 'confirmation_requise' })
  try {
    await supprimerUtilisateurAuth(req.user.id)
    res.json({ supprime: true })
  } catch (e) {
    console.error('[compte/suppression]', e.message)
    if (e.status === 503) return res.status(503).json({ error: 'suppression_non_configuree' })
    res.status(502).json({ error: 'suppression_echec' })
  }
})
