// src/prixStore.js
// Base de prix servie par le backend, modifiable SANS toucher au code :
// le fichier data/prix.json (version, date, postes) surcharge, poste par poste
// (clé = `code`), la base de référence livrée avec le moteur.
//
//  • un poste absent du JSON garde le prix du moteur ;
//  • un poste invalide (prix négatif ou non numérique, code inconnu) est ignoré
//    et signalé dans `avertissements` — la base reste toujours utilisable ;
//  • JSON absent ou illisible : repli complet sur le moteur (source = 'moteur').
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const FICHIER_DEFAUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'prix.json')

const nombreValide = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0

/**
 * @param {{ base: Array, version: string, date: string, fichier?: string }} opts
 *   base/version/date : base de référence du moteur (PRIX, PRIX_VERSION, PRIX_DATE)
 */
export function chargerPrix({ base, version, date, fichier = FICHIER_DEFAUT }) {
  const repli = (avertissements = []) => ({ version, date, postes: base, source: 'moteur', avertissements })
  let brut
  try {
    // Un éventuel BOM (marque d'ordre des octets, ajouté par certains éditeurs / téléphones) fait échouer JSON.parse : on l'ignore.
    brut = JSON.parse(fs.readFileSync(fichier, 'utf8').replace(/^\uFEFF/, ''))
  } catch (e) {
    return e.code === 'ENOENT'
      ? repli([`prix.json introuvable (${fichier}) — base du moteur utilisée.`])
      : repli([`prix.json illisible (${e.message}) — base du moteur utilisée.`])
  }
  if (!brut || !Array.isArray(brut.postes)) return repli(['prix.json : champ « postes » manquant — base du moteur utilisée.'])

  const avertissements = []
  const parCode = new Map(base.map((p) => [p.code, p]))
  const surcharges = new Map()
  for (const p of brut.postes) {
    if (!p || !parCode.has(p.code)) { avertissements.push(`Code inconnu ignoré : ${p?.code ?? '(vide)'}`); continue }
    if (!nombreValide(p.bi)) { avertissements.push(`Prix invalide ignoré pour ${p.code} (bi = ${p.bi})`); continue }
    if (p.sac != null && !nombreValide(p.sac)) { avertissements.push(`Prix du sac invalide ignoré pour ${p.code}`); continue }
    surcharges.set(p.code, p)
  }
  const postes = base.map((ref) => {
    const s = surcharges.get(ref.code)
    if (!s) return ref
    return {
      ...ref,
      designation: typeof s.designation === 'string' && s.designation.trim() ? s.designation : ref.designation,
      unite: typeof s.unite === 'string' && s.unite.trim() ? s.unite : ref.unite,
      bi: s.bi,
      sac: s.sac === undefined ? ref.sac : s.sac,
    }
  })
  return {
    version: typeof brut.version === 'string' && brut.version.trim() ? brut.version : version,
    date: typeof brut.date === 'string' && brut.date.trim() ? brut.date : date,
    postes, source: 'json', avertissements,
  }
}
