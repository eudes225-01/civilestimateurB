// src/services/pdf/fonts.js
// Polices embarquées dans le HTML (data-URI) : le rendu ne dépend d'aucun accès réseau ni
// d'aucune police installée sur le serveur. Paquets : @fontsource-variable/inter et
// @fontsource-variable/space-grotesk (sous-ensemble « latin » : français complet, €, œ, ², ³…).
import { createRequire } from 'node:module'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const require = createRequire(import.meta.url)
let cache = null

function charger(pkg, famille, poids) {
  try {
    let racine
    try { racine = path.dirname(require.resolve(`${pkg}/package.json`)) } catch { racine = path.resolve(process.cwd(), 'node_modules', pkg) }
    const dir = path.join(racine, 'files')
    const fichier = path.join(dir, `${pkg.split('/')[1].replace('-variable', '')}-latin-wght-normal.woff2`)
    if (!existsSync(fichier)) throw new Error(`fichier absent : ${fichier}`)
    const b64 = readFileSync(fichier).toString('base64')
    return `@font-face{font-family:'${famille}';font-style:normal;font-weight:${poids};font-display:block;src:url(data:font/woff2;base64,${b64}) format('woff2');}`
  } catch (e) {
    console.warn(`[pdf] police ${famille} indisponible (${e.message}) — repli sur les polices système.`)
    return ''
  }
}

/** CSS @font-face (Inter + Space Grotesk), mis en cache après le premier appel. */
export function fontFaceCss() {
  if (!cache) {
    cache = [
      charger('@fontsource-variable/inter', 'Inter', '100 900'),
      charger('@fontsource-variable/space-grotesk', 'Space Grotesk', '300 700'),
    ].join('\n')
  }
  return cache
}
