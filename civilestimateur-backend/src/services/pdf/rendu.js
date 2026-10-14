// src/services/pdf/rendu.js
// HTML → PDF avec Chromium (Puppeteer). Le navigateur est lancé à la première demande,
// réutilisé, puis fermé après une période d'inactivité (économise la mémoire de l'instance).
// Deux rendus (couverture sans en-tête / corps avec en-tête+pied de page) sont fusionnés
// avec pdf-lib ; la numérotation « Page X / Y » exclut donc la couverture.
import { PDFDocument } from 'pdf-lib'
import { buildCoverHtml, buildBodyHtml, buildHeaderTemplate, buildFooterTemplate, MARGES } from './devisHtml.js'

const IDLE_MS = 2 * 60 * 1000
const MAX_PARALLELE = 2   // Chromium est gourmand : au-delà, on file d'attente
const MAX_ATTENTE = 4     // file pleine → 503, le navigateur de l'utilisateur bascule sur son export local

let navigateur = null
let lancement = null
let minuteur = null
let actifs = 0
const attente = []

export class ServeurOccupe extends Error {}

async function obtenirNavigateur() {
  if (navigateur?.connected) return navigateur
  if (!lancement) {
    lancement = import('puppeteer').then(({ default: puppeteer }) => puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--font-render-hinting=none'],
    })).then((b) => {
      navigateur = b
      b.on('disconnected', () => { if (navigateur === b) navigateur = null })
      return b
    }).finally(() => { lancement = null })
  }
  return lancement
}

function armerInactivite() {
  clearTimeout(minuteur)
  minuteur = setTimeout(async () => {
    if (actifs > 0) return armerInactivite()
    const b = navigateur; navigateur = null
    await b?.close().catch(() => {})
  }, IDLE_MS)
  minuteur.unref?.()
}

async function avecPlace(fn) {
  if (actifs >= MAX_PARALLELE) {
    if (attente.length >= MAX_ATTENTE) throw new ServeurOccupe('file_pleine')
    await new Promise((ok) => attente.push(ok))
  } else actifs++
  try { return await fn() } finally {
    const suivant = attente.shift()
    if (suivant) suivant() // la place est transmise telle quelle au suivant
    else actifs--
  }
}

async function htmlVersPdf(browser, html, options) {
  const page = await browser.newPage()
  try {
    page.setDefaultTimeout(45_000)
    // Aucune requête sortante : seules les data-URI (polices, logo) sont autorisées.
    await page.setRequestInterception(true)
    page.on('request', (req) => (/^(data|about):/i.test(req.url()) ? req.continue() : req.abort()))
    await page.emulateMediaType('print')
    await page.setContent(html, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    return await page.pdf({ printBackground: true, ...options })
  } finally {
    await page.close().catch(() => {})
  }
}

/** @param {object} modele  modèle déjà validé par normaliserModele() */
export async function genererDevisPdf(modele) {
  return avecPlace(async () => {
    clearTimeout(minuteur)
    try {
      const browser = await obtenirNavigateur()
      const sortie = await PDFDocument.create()

      if (modele.opts.pageGarde) {
        const couv = await htmlVersPdf(browser, buildCoverHtml(modele), { preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } })
        const d = await PDFDocument.load(couv)
        // Garde-fou : une couverture ne doit jamais déborder sur une 2ᵉ page.
        const pages = await sortie.copyPages(d, [0])
        pages.forEach((p) => sortie.addPage(p))
      }

      const corps = await htmlVersPdf(browser, buildBodyHtml(modele), {
        format: 'A4', margin: MARGES, displayHeaderFooter: true,
        headerTemplate: buildHeaderTemplate(modele), footerTemplate: buildFooterTemplate(modele),
      })
      const d = await PDFDocument.load(corps)
      const pages = await sortie.copyPages(d, d.getPageIndices())
      pages.forEach((p) => sortie.addPage(p))

      const titre = `Devis quantitatif estimatif${modele.proj.titre ? ` — ${modele.proj.titre}` : ''}`
      sortie.setTitle(titre)
      sortie.setAuthor(modele.proj.entreprise || 'CivilEstimateur')
      sortie.setSubject('Bordereau des prix et devis quantitatif estimatif')
      sortie.setCreator('CivilEstimateur')
      sortie.setProducer('CivilEstimateur (Chromium + pdf-lib)')
      sortie.setLanguage('fr-FR')
      sortie.setCreationDate(new Date())
      return Buffer.from(await sortie.save())
    } finally {
      armerInactivite()
    }
  })
}

/**
 * Rendu générique HTML → PDF (un seul passage, sans fusion) : documents courts comme la confirmation
 * d'abonnement. Mêmes garde-fous que le devis : file d'attente, aucune requête sortante.
 * @returns {Promise<Buffer>}
 */
export async function genererPdfDepuisHtml(html, options) {
  return avecPlace(async () => {
    clearTimeout(minuteur)
    try {
      const browser = await obtenirNavigateur()
      return Buffer.from(await htmlVersPdf(browser, html, options))
    } finally {
      armerInactivite()
    }
  })
}

/** Fermeture propre (arrêt du serveur, tests). */
export async function fermerNavigateur() {
  clearTimeout(minuteur)
  const b = navigateur; navigateur = null
  await b?.close().catch(() => {})
}
