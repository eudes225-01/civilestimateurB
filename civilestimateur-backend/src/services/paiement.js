// src/services/paiement.js
// Logique métier du paiement : confirme une transaction auprès de FedaPay (jamais sur la
// seule foi du navigateur ou du corps d'un webhook) puis crédite le solde de crédits CST.
import { estPaye, lireTransaction } from './fedapay.js'
import { crediterAchat, trouverAchat } from './credits.js'
import { notifierEchecPaiement, notifierPaiementConfirme } from './notifications.js'
import { enregistrerConfirmationPaiement } from './preuves.js'
import { lireProfil } from './profils.js'
import { creditsPourMontant, forfaitValide } from './tarifs.js'

/**
 * @param {string|number} txId
 * @param {{ userId?: string }} opts  userId : si fourni, la transaction doit lui appartenir (route /verify).
 * @returns {Promise<{ statut: string, credite: boolean, credits?: number, solde?: number }>}
 *   credite : le paiement est confirmé ET crédité (vrai aussi lors d'un rappel d'une transaction déjà créditée).
 */
export async function confirmerTransaction(txId, { userId } = {}) {
  const tx = await lireTransaction(txId)
  const ligne = await trouverAchat(String(txId))
  const proprietaire = ligne?.user_id || tx.custom_metadata?.user_id || null

  if (userId && proprietaire && proprietaire !== userId) return { statut: 'interdit', credite: false }
  if (!estPaye(tx.status)) {
    const statut = String(tx.status || 'pending')
    // Paiement refusé ou annulé : prévenir le client (une seule fois, voir reserverEchec).
    if (proprietaire && ['declined', 'canceled'].includes(statut.toLowerCase())) {
      const montant = Number(ligne?.montant ?? tx.amount) || 0
      notifierEchecPaiement({ userId: proprietaire, txId: String(txId), statut, montant, credits: Number(ligne?.credits ?? creditsPourMontant(montant)) })
    }
    return { statut, credite: false }
  }
  if (!proprietaire) return { statut: 'inconnue', credite: false }

  // Sans ligne préalable (transaction créée mais achat non enregistré), seul un montant égal à un forfait est accepté.
  if (!ligne && !forfaitValide(tx.amount)) return { statut: 'montant_invalide', credite: false }
  const attendu = Number(ligne?.montant ?? tx.amount)
  if (Number(tx.amount) < attendu) return { statut: 'montant_invalide', credite: false }
  const credits = Number(ligne?.credits ?? creditsPourMontant(attendu))

  const r = await crediterAchat({ txId: String(txId), userId: proprietaire, montant: attendu, credits })
  // « nouveau » n'est vrai que pour l'appel qui a réellement crédité : webhook + retour navigateur → un seul mail.
  if (r.nouveau) {
    // Preuve de confirmation (Supabase) AVANT l'e-mail, qui la complète (date d'envoi). Un échec ici est journalisé
    // mais ne remet jamais en cause des crédits déjà payés et ajoutés.
    try {
      const profil = await lireProfil(proprietaire)
      await enregistrerConfirmationPaiement({ userId: proprietaire, txId: String(txId), montant: attendu, credits, soldeApres: r.solde, email: profil?.email, nom: profil?.nom })
    } catch (e) {
      console.error('[preuve/paiement]', e.message)
    }
    notifierPaiementConfirme({ userId: proprietaire, txId: String(txId), montant: attendu, credits, solde: r.solde })
  }
  return { statut: 'approved', credite: true, credits, solde: r.solde }
}
