// src/services/confirmations.js
// Renvoi, à la demande du client, de sa confirmation d'abonnement (PDF + conditions) par e-mail.
// Le PDF reprend le texte EXACT des conditions acceptées lors du paiement (preuve Supabase) ; il est
// marqué « Duplicata ». Il part toujours vers l'adresse du compte connecté, jamais vers une adresse fournie.
import { dernierPaiement } from './abonnements.js'
import { emailConfigure, envoyer, mailConfirmationRenvoyee } from './email.js'
import { genererConfirmationPdf, nomFichierConfirmation } from './pdf/confirmationPdf.js'
import { FONCTIONNALITES_PREMIUM } from '../middleware/access.js'
import { lireProfil } from './profils.js'
import { lireConfirmation, marquerRenvoi } from './preuves.js'
import { supabaseServeurConfigure } from './supabase.js'
import { VERSION } from './politiquesTexte.js'

const DELAI_MS = 2 * 60 * 1000 // pas deux renvois à moins de 2 minutes d'écart

export class ConfirmationIndisponible extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status }
}

/** @param {{ id: string, email: string|null, nom?: string }} user  utilisateur authentifié (jeton Supabase vérifié) */
export async function renvoyerConfirmation(user) {
  if (!emailConfigure() || !supabaseServeurConfigure()) throw new ConfirmationIndisponible('email_non_configure', 503)
  if (!user.email) throw new ConfirmationIndisponible('pas_d_adresse', 422)

  const preuve = await lireConfirmation(user.id)
  if (preuve?.renvoyee_le && Date.now() - new Date(preuve.renvoyee_le).getTime() < DELAI_MS) throw new ConfirmationIndisponible('trop_tot', 429)

  // Sans preuve (paiement antérieur à ce journal) : on se rabat sur le dernier paiement confirmé, avec les conditions actuelles.
  const paiement = preuve
    ? { txId: preuve.fedapay_transaction_id, montant: preuve.montant, debut: preuve.debut, fin: preuve.fin, date: preuve.cree_le, renouvellement: preuve.renouvellement }
    : await dernierPaiement(user.id).then((p) => p && { txId: p.fedapay_transaction_id, montant: p.montant, debut: p.debut, fin: p.fin, date: p.debut })
  if (!paiement) throw new ConfirmationIndisponible('aucun_paiement', 404)

  const profil = await lireProfil(user.id)
  const nom = profil?.nom || user.nom || ''
  const version = preuve?.conditions?.version || VERSION

  let pdf
  try {
    pdf = await genererConfirmationPdf({
      nom, email: user.email, ...paiement, fonctionnalites: FONCTIONNALITES_PREMIUM,
      conditions: preuve?.conditions, duplicata: new Date(),
    })
  } catch (e) {
    console.error('[confirmation/renvoi] PDF non généré :', e.message)
    throw new ConfirmationIndisponible('pdf_indisponible', 503)
  }

  await envoyer({
    to: user.email,
    ...mailConfirmationRenvoyee({ nom, montant: paiement.montant, debut: paiement.debut, fin: paiement.fin, versionConditions: version }),
    attachments: [{ filename: nomFichierConfirmation(paiement.txId), content: pdf }],
  })
  if (preuve) await marquerRenvoi(preuve.cle, preuve.renvois).catch((e) => console.error('[preuve/renvoi]', e.message))
  return { envoye: true, email: user.email }
}
