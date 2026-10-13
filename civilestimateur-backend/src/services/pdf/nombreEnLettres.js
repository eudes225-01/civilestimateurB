// src/services/pdf/nombreEnLettres.js
// Entier → lettres en français (« Arrêté le présent devis à la somme de … »).
// Règles : quatre-vingts / cents prennent un « s » seulement s'ils terminent le nombre
// ou précèdent « mille » : « quatre-vingt mille » mais « quatre-vingts francs » ;
// « mille » est invariable ; « million(s) » et « milliard(s) » s'accordent.

const UNITES = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
  'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf']
const DIZAINES = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante']

// 0 ≤ n < 100. `final` : le nombre termine l'énoncé (« quatre-vingts »).
function moinsDeCent(n, final) {
  if (n < 20) return UNITES[n]
  const d = Math.floor(n / 10), u = n % 10
  if (d <= 6) {
    if (u === 0) return DIZAINES[d]
    if (u === 1) return `${DIZAINES[d]} et un`
    return `${DIZAINES[d]}-${UNITES[u]}`
  }
  if (d === 7) return u === 1 ? 'soixante et onze' : `soixante-${UNITES[10 + u]}`
  if (d === 8) return u === 0 ? (final ? 'quatre-vingts' : 'quatre-vingt') : `quatre-vingt-${UNITES[u]}`
  return `quatre-vingt-${UNITES[10 + u]}` // 90-99
}

// 0 ≤ n < 1000
function moinsDeMille(n, final) {
  const c = Math.floor(n / 100), r = n % 100
  let s = ''
  if (c > 0) {
    s = c === 1 ? 'cent' : `${UNITES[c]} cent`
    if (r === 0) return c > 1 && final ? `${s}s` : s
    s += ' '
  }
  return s + moinsDeCent(r, final)
}

export function nombreEnLettres(valeur) {
  let n = Math.round(Math.abs(Number(valeur) || 0))
  if (n === 0) return 'zéro'
  if (n >= 1e12) return String(n)
  const milliards = Math.floor(n / 1e9); n %= 1e9
  const millions = Math.floor(n / 1e6); n %= 1e6
  const milliers = Math.floor(n / 1e3); const reste = n % 1e3
  const parts = []
  if (milliards) parts.push(`${moinsDeMille(milliards, false)} milliard${milliards > 1 ? 's' : ''}`)
  if (millions) parts.push(`${moinsDeMille(millions, false)} million${millions > 1 ? 's' : ''}`)
  if (milliers) parts.push(milliers === 1 ? 'mille' : `${moinsDeMille(milliers, false)} mille`)
  if (reste) parts.push(moinsDeMille(reste, true))
  return parts.join(' ')
}
