// src/services/identite.js
// Identité affichable d'un utilisateur, lue dans les métadonnées Supabase (compte Google :
// given_name / family_name / full_name / avatar_url). Fonction pure, sans appel réseau.

const nettoyer = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()

/** URL de photo acceptée seulement en https (jamais de javascript:, data:, http:). */
function urlPhoto(v) {
  try {
    const u = new URL(String(v || ''))
    return u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

/**
 * @returns {{ prenom: string, nom: string, nomComplet: string, photo: string|null }}
 *   prenom / nom : repris de Google quand ils existent ; sinon le nom complet est coupé au premier espace.
 */
export function lireIdentite(meta = {}) {
  const complet = nettoyer(meta.full_name || meta.name)
  let prenom = nettoyer(meta.given_name || meta.first_name)
  let nom = nettoyer(meta.family_name || meta.last_name)
  if (!prenom && !nom && complet) {
    const [premier, ...reste] = complet.split(' ')
    prenom = premier
    nom = reste.join(' ')
  }
  return {
    prenom,
    nom,
    nomComplet: complet || [prenom, nom].filter(Boolean).join(' '),
    photo: urlPhoto(meta.avatar_url || meta.picture),
  }
}
