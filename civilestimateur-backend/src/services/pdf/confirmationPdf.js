// src/services/pdf/confirmationPdf.js
// PDF « Confirmation d'abonnement + Conditions d'utilisation », joint à l'e-mail de paiement confirmé.
// Il reproduit l'INTÉGRALITÉ des conditions en vigueur au moment du paiement (version et date incluses) :
// le client garde ainsi la trace de ce qu'il a accepté en payant.
import { env } from '../../config/env.js'
import { DATE, SECTIONS, VERSION } from '../politiquesTexte.js'
import { css, esc, fmt } from './devisHtml.js'
import { fontFaceCss } from './fonts.js'

const COULEUR = '#1e2a78'
const jour = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Porto-Novo' })
const txt = (v, max = 200) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max)

// Point d'extension : les tests remplacent le rendu pour ne pas lancer Chromium. Import différé : puppeteer et
// pdf-lib ne sont chargés qu'au premier PDF.
export const hooks = {
  rendu: async (html, options) => (await import('./rendu.js')).genererPdfDepuisHtml(html, options),
}

/**
 * @param {{ nom?: string, email?: string, txId: string|number, montant: number, debut: Date|string, fin: Date|string,
 *           renouvellement?: boolean, fonctionnalites?: {libelle:string}[], date?: Date|string,
 *           conditions?: { version: string, date: string, sections: {t:string,c:string}[] }, duplicata?: Date|string }} d
 * `conditions` : texte exact accepté lors du paiement (preuve Supabase) ; absent → conditions en vigueur.
 * `duplicata` : date d'édition d'un renvoi (le document est alors marqué « Duplicata »).
 */
export function buildConfirmationHtml(d) {
  const nom = txt(d.nom), email = txt(d.email, 120)
  const C = d.conditions?.sections?.length ? d.conditions : { version: VERSION, date: DATE, sections: SECTIONS }
  const sections = [...C.sections]
  if (env.EMAIL_REPLY_TO) sections.push({ t: '11. Contact', c: `Une question, un paiement à vérifier, une demande sur vos données : ${env.EMAIL_REPLY_TO}.` })
  const lignes = [
    ['Client', nom || '—'], ['E-mail', email || '—'],
    ['Opération', d.renouvellement ? 'Prolongation de l’abonnement Premium' : 'Souscription à l’abonnement Premium'],
    ['Montant payé', `${fmt(d.montant)} FCFA`], ['Mode de paiement', 'FedaPay (Mobile Money ou carte)'],
    ['Transaction FedaPay', `#${txt(d.txId, 40)}`], ['Date du paiement', jour(d.date || new Date())],
    ['Période d’accès Premium', `du ${jour(d.debut)} au ${jour(d.fin)}`],
  ]
  const fonctions = (d.fonctionnalites || []).map((f) => `<li>${esc(f.libelle)}</li>`).join('')
  const extra = `
.cf h1{margin:0 0 1mm;font-size:19pt}.cf .sous{color:var(--muted);font-size:8.6pt;margin:0 0 6mm}
.cf .kv{grid-template-columns:44mm 1fr;font-size:9pt;gap:1.8mm 4mm}.cf .kv dd{font-weight:600}
.cf ul{margin:1mm 0 0;padding-left:4.5mm;font-size:8.8pt}.cf li{margin:.8mm 0}
.cgu{margin-top:8mm}.cgu .sec{margin-bottom:4mm}
.cgu section{margin:0 0 4.2mm;break-inside:avoid}.cgu h3{margin:0 0 1mm;font-size:9.6pt}.cgu p{margin:0;font-size:8.8pt;line-height:1.55;color:#3a342d;text-align:justify;hyphens:auto}
.fin-note{margin-top:6mm;font-size:8pt;color:var(--muted);border-top:.25mm solid var(--line);padding-top:3mm}
@page{size:A4;margin:25mm 16mm 20mm}`
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'">
<title>Confirmation d’abonnement — CivilEstimateur</title><style>${css(COULEUR)}${extra}</style></head><body class="cf">
<h1 class="disp">Confirmation d’abonnement</h1>
<p class="sous">Abonnement Premium CivilEstimateur — conditions d’utilisation version ${esc(C.version)} du ${esc(C.date)}${d.duplicata ? ` · <b>Duplicata édité le ${esc(jour(d.duplicata))}</b>` : ''}</p>
<div class="card"><h3>Récapitulatif du paiement</h3><dl class="kv">${lignes.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>
${fonctions ? `<div class="card" style="margin-top:4mm"><h3>Fonctionnalités Premium incluses</h3><ul>${fonctions}</ul></div>` : ''}
<div class="cgu"><div class="sec"><div><h2>Conditions d’utilisation</h2><p>Version ${esc(C.version)} — en vigueur au ${esc(jour(d.date || new Date()))}</p></div></div>
${sections.map((s) => `<section><h3>${esc(s.t)}</h3><p>${esc(s.c)}</p></section>`).join('')}
</div>
<p class="fin-note">Ce document confirme votre paiement et reproduit l’intégralité des conditions d’utilisation applicables à la date de celui-ci. En utilisant le service Premium, vous reconnaissez les avoir lues et acceptées. Conservez-le avec votre e-mail de confirmation.</p>
</body></html>`
}

const entete = `<style>${fontFaceCss()}</style><div style="width:100%;margin:0;font-family:'Inter',Arial,sans-serif"><div style="height:13mm;background:${COULEUR};color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 16mm;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact"><span style="font-family:'Space Grotesk',Arial,sans-serif;font-weight:700;font-size:10pt">CivilEstimateur</span><span style="font-size:7pt;opacity:.88">Confirmation d’abonnement et conditions d’utilisation</span></div></div>`
const pied = `<style>${fontFaceCss()}</style><div style="width:100%;padding:0 16mm;box-sizing:border-box;font-family:'Inter',Arial,sans-serif;font-size:6.8pt;color:#8c847b;display:flex;justify-content:space-between"><span>CivilEstimateur — ArchiNova · conditions v${esc(VERSION)}</span><span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`

/** @returns {Promise<Buffer>} le PDF (Chromium) ; lève si le moteur est indisponible. */
export function genererConfirmationPdf(d) {
  return hooks.rendu(buildConfirmationHtml(d), {
    format: 'A4', displayHeaderFooter: true, headerTemplate: entete, footerTemplate: pied,
    margin: { top: '25mm', bottom: '20mm', left: '16mm', right: '16mm' },
  })
}

export const nomFichierConfirmation = (txId) => `Confirmation_abonnement_CivilEstimateur_${String(txId).replace(/[^\w-]+/g, '_').slice(0, 40)}.pdf`
