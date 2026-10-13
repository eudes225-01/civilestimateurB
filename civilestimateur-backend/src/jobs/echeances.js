// src/jobs/echeances.js
// Tâche planifiée (Render Cron Job) : `npm run echeances`.
// Envoie les rappels d'expiration et les mails d'expiration, puis s'arrête.
import { warnMissingConfig } from '../config/env.js'
import { traiterEcheances } from '../services/notifications.js'

warnMissingConfig()
try {
  const bilan = await traiterEcheances()
  console.log('[echeances]', JSON.stringify(bilan))
  process.exit(bilan.erreurs ? 1 : 0)
} catch (e) {
  console.error('[echeances] échec :', e.message)
  process.exit(1)
}
