// src/services/expirationCredits.js
// Expiration des crédits CST : rappel avant l'échéance, puis remise à zéro.
//
// Règle (documentée aussi dans supabase/migration-expiration-credits.sql et le README) :
//   • échéance du solde = date du DERNIER achat payé + `validiteMois` mois (un nouvel achat repousse l'échéance) ;
//   • seuls les crédits ajoutés par des achats payés à partir de `depuis` expirent ; le solde antérieur reste protégé,
//     même après une recharge. Les débits consomment les crédits expirants en premier ;
//   • rappel par e-mail `rappelJours` jours avant l'échéance (une seule fois par achat) ;
//   • à l'échéance, seuls les crédits expirants restants sont supprimés (fonction SQL atomique) et le client est prévenu.
// Ce module ne dépend ni de la base ni de l'e-mail : tout passe par des « ports » injectés (testable hors ligne).

/** Ajoute `mois` mois à une date (UTC) ; le jour est ramené à la fin du mois cible si nécessaire (31 janv. + 1 mois → 28/29 févr.). */
export function ajouterMois(date, mois) {
  const d = new Date(date)
  const jour = d.getUTCDate()
  const r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + mois, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()))
  const dernier = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate()
  r.setUTCDate(Math.min(jour, dernier))
  return r
}

const MS_JOUR = 86_400_000

/**
 * Phase d'un achat à l'instant `now` : 'hors_perimetre' (acheté avant `depuis`), 'actif' (rappel pas encore dû),
 * 'rappel' (dans la fenêtre de rappel) ou 'expire' (échéance atteinte).
 */
export function phaseExpiration({ payeLe, now, validiteMois, rappelJours, depuis }) {
  const paye = new Date(payeLe)
  if (!depuis || !(paye >= new Date(depuis))) return { phase: 'hors_perimetre', expireLe: null }
  const expireLe = ajouterMois(paye, validiteMois)
  const t = new Date(now)
  if (t >= expireLe) return { phase: 'expire', expireLe }
  if (t >= new Date(expireLe.getTime() - rappelJours * MS_JOUR)) return { phase: 'rappel', expireLe, joursRestants: Math.max(1, Math.ceil((expireLe - t) / MS_JOUR)) }
  return { phase: 'actif', expireLe }
}

/**
 * @param {Object} p
 * @param {Date}   [p.now]
 * @param {{ validiteMois: number, rappelJours: number, depuis: string }} p.config  `depuis` vide → fonctionnalité désactivée
 * @param {Object} p.ports   accès base et e-mail (injectés)
 *   ports.candidats({ depuis, avant })   achats payés (≥ depuis, ≤ avant) dont l'échéance n'est pas encore traitée
 *   ports.dernierAchat(userId)           dernier achat payé du client
 *   ports.solde(userId)                  solde CST
 *   ports.reserverRappel(achatId)        vrai si ce passage « gagne » l'envoi (une seule fois) ; libererRappel(achatId) en cas d'échec d'envoi
 *   ports.marquerTraite(achatId)         l'échéance de cet achat n'est plus à surveiller
 *   ports.expirer(userId, ref)           remise à zéro atomique → { credits }
 *   ports.envoyerRappel({userId, solde, expireLe, joursRestants}) / ports.envoyerExpire({userId, credits})
 * @returns {Promise<{ actif: boolean, examines: number, rappels: number, expires: number, creditsPerdus: number, ignores: number, erreurs: number }>}
 */
export async function traiterExpirationCredits({ now = new Date(), config, ports }) {
  const bilan = { actif: !!config.depuis, examines: 0, rappels: 0, expires: 0, creditsPerdus: 0, ignores: 0, erreurs: 0 }
  if (!config.depuis || !(config.validiteMois > 0)) return bilan // sécurité : sans date d'entrée en vigueur, AUCUN solde n'est touché
  // Un achat n'est « candidat » que si son rappel est dû : payé avant (now − validité + rappelJours).
  const seuilRappel = new Date(ajouterMois(now, -config.validiteMois).getTime() + config.rappelJours * MS_JOUR)
  const candidats = await ports.candidats({ depuis: config.depuis, avant: seuilRappel.toISOString() })

  for (const achat of candidats) {
    bilan.examines++
    try {
      const phase = phaseExpiration({ payeLe: achat.paye_le, now, validiteMois: config.validiteMois, rappelJours: config.rappelJours, depuis: config.depuis })
      if (phase.phase === 'hors_perimetre' || phase.phase === 'actif') { bilan.ignores++; continue }

      // Un achat plus récent repousse l'échéance : celui-ci n'est plus à surveiller.
      const dernier = await ports.dernierAchat(achat.user_id)
      if (dernier && dernier.id !== achat.id) { await ports.marquerTraite(achat.id); bilan.ignores++; continue }

      const solde = await ports.solde(achat.user_id)
      if (!(solde > 0)) { await ports.marquerTraite(achat.id); bilan.ignores++; continue }

      if (phase.phase === 'rappel') {
        if (achat.rappel_expiration_le) { bilan.ignores++; continue } // déjà rappelé
        if (!(await ports.reserverRappel(achat.id))) { bilan.ignores++; continue }
        try {
          await ports.envoyerRappel({ userId: achat.user_id, solde, expireLe: phase.expireLe, joursRestants: phase.joursRestants })
          bilan.rappels++
        } catch (e) {
          await ports.libererRappel(achat.id).catch(() => {}) // sera retenté au prochain passage
          throw e
        }
        continue
      }

      // phase 'expire' : remise à zéro atomique, puis traçabilité, puis mail (un échec de mail ne rend jamais les crédits).
      const r = await ports.expirer(achat.user_id, `expiration/${achat.id}`, achat.id)
      await ports.marquerTraite(achat.id)
      if (r.credits > 0) {
        bilan.expires++; bilan.creditsPerdus += r.credits
        await ports.envoyerExpire({ userId: achat.user_id, credits: r.credits }).catch((e) => { bilan.erreurs++; console.error('[echeances/mail-expiration]', e.message) })
      }
    } catch (e) {
      bilan.erreurs++
      console.error(`[echeances] achat ${achat?.id} :`, e.message)
    }
  }
  return bilan
}
