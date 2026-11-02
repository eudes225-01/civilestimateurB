// src/services/email.js
// Envoi d'e-mails via l'API REST de Resend (fetch natif, aucune dépendance) + modèles des 4 messages.
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
const nombre = (m) => new Intl.NumberFormat('fr-FR').format(Number(m) || 0).replace(/[\u202f\u00a0]/g, ' ')
export const formatMontant = (m) => `${nombre(m)} FCFA`
export const formatCst = (m) => `${nombre(m)} CST`

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

// ── Les 4 messages ──────────────────────────────────────────────────────────────

/** 1. Bienvenue (première connexion). */
export function mailBienvenue({ nom }) {
  const sujet = 'Bienvenue sur CivilEstimateur'
  // Version gratuite : aucune mention des crédits CST.
  const lecture = env.APP_GRATUITE ? 'lecture de plans.' : 'export PDF. La lecture automatique des plans fonctionne avec des crédits CST, que vous rechargez quand vous le souhaitez.'
  const lectureTexte = env.APP_GRATUITE ? 'lecture de plans.' : 'export PDF. La lecture automatique des plans fonctionne avec des crédits CST.'
  return {
    subject: sujet,
    html: gabarit({
      titre: sujet,
      paragraphes: [
        salut(nom),
        'Votre compte est prêt. Vous pouvez dès maintenant estimer vos projets de construction : métré, devis quantitatif et estimatif, ' + lecture,
        'Vos projets sont enregistrés dans votre espace et vous les retrouvez à chaque connexion.',
      ],
      bouton: lienApp('Ouvrir CivilEstimateur'),
    }),
    text: texte(salutTexte(nom), 'Votre compte est prêt. Vous pouvez dès maintenant estimer vos projets de construction : métré, devis quantitatif et estimatif, ' + lectureTexte, env.APP_URL),
  }
}

/** 2. Paiement confirmé (client) : crédits ajoutés. */
export function mailPaiementConfirme({ nom, montant, credits, solde, avecPdf = false, versionConditions = '' }) {
  const sujet = 'Paiement confirmé — vos crédits CST sont disponibles'
  return {
    subject: sujet,
    html: gabarit({
      titre: 'Paiement confirmé',
      paragraphes: [
        salut(nom),
        'Merci ! Votre paiement est bien reçu et vos crédits CST ont été ajoutés à votre solde.',
        ...(avecPdf ? [`Vous trouverez en pièce jointe la <strong>confirmation de votre achat</strong>, avec l’intégralité des conditions d’utilisation${versionConditions ? ` (version ${esc(versionConditions)})` : ''}. Conservez-la précieusement.`] : []),
      ],
      details: [['Montant payé', formatMontant(montant)], ['Crédits ajoutés', formatCst(credits)], ...(solde != null ? [['Votre solde', formatCst(solde)]] : [])],
      bouton: lienApp('Ouvrir CivilEstimateur'),
    }),
    text: texte(salutTexte(nom), 'Votre paiement est bien reçu : vos crédits CST ont été ajoutés.', avecPdf && 'La confirmation de votre achat et les conditions d\'utilisation complètes sont en pièce jointe (PDF).', `Montant payé : ${formatMontant(montant)}`, `Crédits ajoutés : ${formatCst(credits)}`, solde != null && `Votre solde : ${formatCst(solde)}`, env.APP_URL),
  }
}

/** 2b. Renvoi de la confirmation d'achat (à la demande du client). */
export function mailConfirmationRenvoyee({ nom, montant, credits, versionConditions }) {
  const sujet = 'Votre confirmation d’achat de crédits CivilEstimateur'
  return {
    subject: sujet,
    html: gabarit({
      titre: 'Votre confirmation d’achat',
      paragraphes: [
        salut(nom),
        `Comme demandé, voici de nouveau la confirmation de votre achat de crédits CST, avec l’intégralité des conditions d’utilisation${versionConditions ? ` (version ${esc(versionConditions)})` : ''}, en pièce jointe (PDF).`,
      ],
      details: [['Montant payé', formatMontant(montant)], ...(credits != null ? [['Crédits obtenus', formatCst(credits)]] : [])],
    }),
    text: texte(salutTexte(nom), 'Voici de nouveau la confirmation de votre achat de crédits CST et les conditions d\'utilisation complètes, en pièce jointe (PDF).', `Montant payé : ${formatMontant(montant)}`, credits != null && `Crédits obtenus : ${formatCst(credits)}`),
  }
}

/** 3. Notification admin à chaque paiement reçu. */
export function mailPaiementAdmin({ nom, email, montant, credits, txId }) {
  const sujet = `Paiement reçu — ${formatMontant(montant)} (${nom || email || 'client'})`
  return {
    subject: sujet,
    html: gabarit({
      titre: 'Nouveau paiement reçu',
      paragraphes: ['Un client vient d’acheter des crédits CST.'],
      details: [['Client', nom || '—'], ['E-mail', email || '—'], ['Montant', formatMontant(montant)], ['Crédits ajoutés', formatCst(credits)], ['Transaction FedaPay', `#${txId}`]],
    }),
    text: texte(sujet, `Client : ${nom || '—'} <${email || '—'}>`, `Crédits ajoutés : ${formatCst(credits)}`, `Transaction FedaPay : #${txId}`),
  }
}

/** 4. Paiement refusé ou annulé. */
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
          ? 'Le paiement de vos crédits CST a été annulé : aucun montant n’a été débité.'
          : 'Le paiement de vos crédits CST a été refusé par votre opérateur : aucun crédit n’a été ajouté.',
        'Vous pouvez réessayer à tout moment, avec le même moyen de paiement (après vérification de votre solde) ou un autre.',
      ],
      details: montant ? [['Montant', formatMontant(montant)]] : [],
      bouton: lienApp('Réessayer le paiement'),
    }),
    text: texte(salutTexte(nom), annule ? 'Votre paiement a été annulé : aucun montant n\'a été débité.' : 'Votre paiement a été refusé : aucun crédit n\'a été ajouté.', 'Vous pouvez réessayer à tout moment.', env.APP_URL),
  }
}
