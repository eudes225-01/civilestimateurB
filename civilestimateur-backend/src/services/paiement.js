// src/services/paiement.js
// Logique métier du paiement : confirme une transaction auprès de FedaPay (jamais sur la
// seule foi du navigateur ou du corps d'un webhook) puis active l'abonnement.
import { env } from '../config/env.js'
import { estPaye, lireTransaction } from './fedapay.js'
import { activer, trouverTransaction } from './abonnements.js'
import { notifierEchecPaiement, notifierPaiementConfirme } from './notifications.js'

/**
 * @param {string|number} txId
 * @param {{ userId?: string }} opts  userId : si fourni, la transaction doit lui appartenir (route /verify).
 * @returns {Promise<{ statut: string, actif: boolean, fin?: string }>}
 */
export async function confirmerTransaction(txId, { userId } = {}) {
  const tx = await lireTransaction(txId)
  const ligne = await trouverTransaction(String(txId))
  const proprietaire = ligne?.user_id || tx.custom_metadata?.user_id || null

  if (userId && proprietaire && proprietaire !== userId) return { statut: 'interdit', actif: false }
  if (!estPaye(tx.status)) {
    const statut = String(tx.status || 'pending')
    // Paiement refusé ou annulé : prévenir le client (une seule fois, voir reserverEchec).
    if (proprietaire && ['declined', 'canceled'].includes(statut.toLowerCase())) {
      notifierEchecPaiement({ userId: proprietaire, txId: String(txId), statut, montant: Number(ligne?.montant ?? env.FEDAPAY_MONTANT) })
    }
    return { statut, actif: false }
  }
  if (!proprietaire) return { statut: 'inconnue', actif: false }

  const attendu = Number(ligne?.montant ?? env.FEDAPAY_MONTANT)
  if (Number(tx.amount) < attendu) return { statut: 'montant_invalide', actif: false }

  const { fin, nouveau, renouvellement } = await activer({ txId: String(txId), userId: proprietaire, montant: attendu })
  // « nouveau » n'est vrai que pour l'appel qui a réellement activé : webhook + retour navigateur → un seul mail.
  if (nouveau) notifierPaiementConfirme({ userId: proprietaire, txId: String(txId), montant: attendu, fin, renouvellement })
  return { statut: 'approved', actif: true, fin }
}
