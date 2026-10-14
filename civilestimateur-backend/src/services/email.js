// src/services/email.js
// Envoi d'e-mails via l'API REST de Resend (fetch natif, aucune dépendance) + modèles des 6 messages.
// Doc : https://resend.com/docs/api-reference/emails/send-email
import { env } from '../config/env.js'

export const emailConfigure = () => !!env.RESEND_API_KEY

/**
 * Envoie un e-mail. Lève une erreur si Resend refuse ; renvoie null si Resend n'est pas configuré.
 * @param {{ to: string|string[], subject: string, html: string, text?: string, replyTo?: string, idempotencyKey?: string,
 *           attachments?: { filename: string, content: Buffer }[] }} m
 * idempotencyKey : Resend ignore un second envoi portant la même clé (valable 24 h) — filet de sécurité.
 */
export async function envoyer({ to, subject, html, text, replyTo, idempotencyKey, attachments }) {
  if (!emailConfigure()) return null
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      ...(text ? { text } : {}),
      ...(attachments?.length ? { attachments: attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString('base64') })) } : {}),
      ...((replyTo || env.EMAIL_REPLY_TO) ? { reply_to: replyTo || env.EMAIL_REPLY_TO } : {}),
    }),
  })
  const data = await r.json().catch(() => null)
  if (!r.ok) throw new Error(`Resend ${r.status} : ${data?.message || data?.name || 'erreur inconnue'}`)
  return data?.id || null
}

// ── Mise en forme ───────────────────────────────────────────────────────────────

const ECHAPPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
/** Échappe tout texte venant d'un utilisateur (nom Google…) avant de l'insérer dans le HTML. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ECHAPPE[c])

export const formatDate = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Porto-Novo' })
export const formatMontant = (m) => `${new Intl.NumberFormat('fr-FR').format(Number(m) || 0).replace(/[\u202f\u00a0]/g, ' ')} FCFA`

const salut = (nom) => {
  const prenom = String(nom || '').trim().split(/\s+/)[0]
  return prenom ? `Bonjour ${esc(prenom)},` : 'Bonjour,'
}
const salutTexte = (nom) => salut(nom).replace(/&#39;/g, "'").replace(/&amp;/g, '&')

/** Gabarit commun : carte centrée, tableau de détails optionnel, bouton optionnel. */
function gabarit({ titre, paragraphes = [], details = [], bouton, pied = 'CivilEstimateur — ArchiNova' }) {
  const lignes = details
    .map(([k, v]) => `<tr><td style="padding:6px 0;color:#64748b;font-size:14px">${esc(k)}</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#0f172a;font-size:14px">${esc(v)}</td></tr>`)
    .join('')
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#3730a3;padding:18px 24px;color:#ffffff;font-size:16px;font-weight:700">CivilEstimateur</td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:#0f172a">${esc(titre)}</h1>
${paragraphes.map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#334155">${p}</p>`).join('')}
${lignes ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:14px 0;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0">${lignes}</table>` : ''}
${bouton ? `<p style="margin:20px 0 4px"><a href="${esc(bouton.url)}" style="display:inline-block;background:#3730a3;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:15px">${esc(bouton.label)}</a></p>` : ''}
</td></tr>
<tr><td style="padding:14px 24px;background:#f8fafc;color:#94a3b8;font-size:12px">${esc(pied)}</td></tr>
</table></td></tr></table></body></html>`
}

const lienApp = (label) => (env.APP_URL ? { label, url: env.APP_URL } : undefined)
const texte = (...blocs) => blocs.flat().filter(Boolean).join('\n\n')

// ── Les 6 messages ──────────────────────────────────────────────────────────────

/** 1. Bienvenue (première connexion). */
export function mailBienvenue({ nom }) {
  const sujet = 'Bienvenue sur CivilEstimateur'
  return {
    subject: sujet,
    html: gabarit({
      titre: sujet,
      paragraphes: [
        salut(nom),
        'Votre compte est prêt. Vous pouvez dès maintenant estimer vos projets de construction : métré, devis quantitatif et estimatif, lecture de plans.',
        'Vos projets sont enregistrés dans votre espace et vous les retrouvez à chaque connexion.',
      ],
      bouton: lienApp('Ouvrir CivilEstimateur'),
    }),
    text: texte(salutTexte(nom), 'Votre compte est prêt. Vous pouvez dès maintenant estimer vos projets de construction : métré, devis quantitatif et estimatif, lecture de plans.', env.APP_URL),
  }
}

/** 2. Paiement confirmé (client). */
export function mailPaiementConfirme({ nom, montant, fin, renouvellement, avecPdf = false, versionConditions = '' }) {
  const sujet = 'Paiement confirmé — votre abonnement Premium est actif'
  return {
    subject: sujet,
    html: gabarit({
      titre: 'Paiement confirmé',
      paragraphes: [
        salut(nom),
        renouvellement
          ? 'Merci ! Votre abonnement Premium a bien été prolongé.'
          : 'Merci ! Votre paiement est bien reçu et votre abonnement Premium est actif.',
        ...(avecPdf ? [`Vous trouverez en pièce jointe la <strong>confirmation de votre abonnement</strong>, avec l’intégralité des conditions d’utilisation${versionConditions ? ` (version ${esc(versionConditions)})` : ''}. Conservez-la précieusement.`] : []),
      ],
      details: [['Montant payé', formatMontant(montant)], ['Abonnement valable jusqu’au', formatDate(fin)]],
      bouton: lienApp('Accéder au Premium'),
    }),
    text: texte(salutTexte(nom), 'Votre paiement est bien reçu.', avecPdf && 'La confirmation de votre abonnement et les conditions d\'utilisation complètes sont en pièce jointe (PDF).', `Montant payé : ${formatMontant(montant)}`, `Abonnement valable jusqu'au ${formatDate(fin)}`, env.APP_URL),
  }
}

/** 2b. Renvoi de la confirmation d'abonnement (à la demande du client). */
export function mailConfirmationRenvoyee({ nom, montant, debut, fin, versionConditions }) {
  const sujet = 'Votre confirmation d’abonnement CivilEstimateur'
  return {
    subject: sujet,
    html: gabarit({
      titre: 'Votre confirmation d’abonnement',
      paragraphes: [
        salut(nom),
        `Comme demandé, voici de nouveau la confirmation de votre abonnement Premium, avec l’intégralité des conditions d’utilisation${versionConditions ? ` (version ${esc(versionConditions)})` : ''}, en pièce jointe (PDF).`,
      ],
      details: [['Montant payé', formatMontant(montant)], ['Période d’accès', `du ${formatDate(debut)} au ${formatDate(fin)}`]],
    }),
    text: texte(salutTexte(nom), 'Voici de nouveau la confirmation de votre abonnement Premium et les conditions d\'utilisation complètes, en pièce jointe (PDF).', `Montant payé : ${formatMontant(montant)}`, `Période d'accès : du ${formatDate(debut)} au ${formatDate(fin)}`),
  }
}

/** 3. Notification admin à chaque paiement reçu. */
export function mailPaiementAdmin({ nom, email, montant, fin, txId, renouvellement }) {
  const sujet = `Paiement reçu — ${formatMontant(montant)} (${nom || email || 'client'})`
  return {
    subject: sujet,
    html: gabarit({
      titre: 'Nouveau paiement reçu',
      paragraphes: [renouvellement ? 'Un client a <strong>renouvelé</strong> son abonnement.' : 'Un client vient de s’abonner.'],
      details: [['Client', nom || '—'], ['E-mail', email || '—'], ['Montant', formatMontant(montant)], ['Fin d’abonnement', formatDate(fin)], ['Transaction FedaPay', `#${txId}`]],
    }),
    text: texte(sujet, `Client : ${nom || '—'} <${email || '—'}>`, `Fin d'abonnement : ${formatDate(fin)}`, `Transaction FedaPay : #${txId}`),
  }
}

/** 4a. Rappel avant expiration. */
export function mailRappel({ nom, fin, joursRestants }) {
  const j = Math.max(1, joursRestants)
  const sujet = j === 1 ? 'Votre abonnement expire demain' : `Votre abonnement expire dans ${j} jours`
  return {
    subject: sujet,
    html: gabarit({
      titre: sujet,
      paragraphes: [salut(nom), `Votre abonnement Premium se termine le <strong>${esc(formatDate(fin))}</strong>. Renouvelez-le dès maintenant : la durée s’ajoute à celle qu’il vous reste, vous ne perdez rien.`],
      bouton: lienApp('Renouveler mon abonnement'),
    }),
    text: texte(salutTexte(nom), `Votre abonnement Premium se termine le ${formatDate(fin)}. Renouvelez-le : la durée s'ajoute à celle qu'il vous reste.`, env.APP_URL),
  }
}

/** 4b. Expiration. */
export function mailExpiration({ nom, fin }) {
  const sujet = 'Votre abonnement Premium a expiré'
  return {
    subject: sujet,
    html: gabarit({
      titre: sujet,
      paragraphes: [salut(nom), `Votre abonnement Premium s’est terminé le ${esc(formatDate(fin))}. Vos projets sont conservés. Pour retrouver les fonctions Premium, il suffit de vous réabonner.`],
      bouton: lienApp('Me réabonner'),
    }),
    text: texte(salutTexte(nom), `Votre abonnement Premium s'est terminé le ${formatDate(fin)}. Vos projets sont conservés. Pour retrouver le Premium, réabonnez-vous.`, env.APP_URL),
  }
}

/** 5. Paiement refusé ou annulé. */
export function mailPaiementEchoue({ nom, statut, montant }) {
  const annule = String(statut).toLowerCase() === 'canceled'
  const sujet = annule ? 'Votre paiement a été annulé' : 'Votre paiement a été refusé'
  return {
    subject: sujet,
    html: gabarit({
      titre: sujet,
      paragraphes: [
        salut(nom),
        annule
          ? 'Le paiement de votre abonnement Premium a été annulé : aucun montant n’a été débité.'
          : 'Le paiement de votre abonnement Premium a été refusé par votre opérateur : aucun abonnement n’a été activé.',
        'Vous pouvez réessayer à tout moment, avec le même moyen de paiement (après vérification de votre solde) ou un autre.',
      ],
      details: montant ? [['Montant', formatMontant(montant)]] : [],
      bouton: lienApp('Réessayer le paiement'),
    }),
    text: texte(salutTexte(nom), annule ? 'Votre paiement a été annulé : aucun montant n\'a été débité.' : 'Votre paiement a été refusé : aucun abonnement n\'a été activé.', 'Vous pouvez réessayer à tout moment.', env.APP_URL),
  }
}
