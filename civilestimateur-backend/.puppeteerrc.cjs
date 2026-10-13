// Chrome est téléchargé DANS le projet (et non dans ~/.cache) : sur Render, seul le dossier
// du projet survit entre l'étape de build et le démarrage du service.
const { join } = require('path')
module.exports = { cacheDirectory: join(__dirname, '.cache', 'puppeteer') }
