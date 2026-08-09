// src/validation.js
// Passe de validations croisées (A7) — la moindre incohérence de saisie doit
// remonter une alerte plutôt que de produire un devis silencieusement faux.
// Depuis août 2026, inclut les vérifications géotechniques du Lot A
// (contrainte admissible de zone vs type de fondation choisi) — ces règles
// ne modifient jamais un résultat déjà calculé, elles se contentent de le
// confronter à la recommandation de fondationsLotA.js.
import { num, round2, TOITURES } from './constants.js'
import { recommanderFondationProjet } from './fondationsLotA.js'

/**
 * Vérifie la cohérence du projet métré et retourne un tableau d'alertes.
 * @param {Object} t        - totaux calculés par metrerProjet()
 * @param {Array}  levels   - niveaux saisis par l'utilisateur
 * @param {Object} p        - paramètres du projet (systeme, toiture, ville, planFlags, fondation…)
 */
export function validerCoherence(t, levels, p) {
  const alertes = []
  const add = (niveau, msg) => alertes.push({ niveau, msg })
  const flags = p.planFlags || {}

  // Toiture vs plan lu / emprise
  if (flags.toitTerrasseDetecte && p.toiture !== 'terrasse') {
    add('bloquante', `Le plan lu montre un TOIT-TERRASSE, mais la couverture sélectionnée est « ${TOITURES[p.toiture]?.lab || p.toiture} ». Corrigez le type de toiture avant d'exporter.`)
  }
  if (t.emprise > 0 && t.surfToiture > 0) {
    const r = t.surfToiture / t.emprise
    if (r < 0.8 || r > 1.6) {
      add('attention', `Surface de couverture (${t.surfToiture} m²) incohérente avec l'emprise au sol (${t.emprise} m²) — vérifiez la toiture et la surface du dernier niveau.`)
    }
  }

  // Linéaire fondé vs murs porteurs (fondation filante)
  if (t.fondation?.type === 'filante' && t.LdevPorteursRez > 0 && t.fondation.lineaireFonde > 0) {
    const r = t.fondation.lineaireFonde / t.LdevPorteursRez
    if (r < 0.7) add('attention', `Seulement ${t.fondation.lineaireFonde} m de murs fondés pour ${t.LdevPorteursRez} m de murs porteurs au RDC (${Math.round(r * 100)} %). Des murs porteurs semblent sans fondation.`)
  }
  if (t.fondation?.type === 'isolees' && t.nbPoteauxRez > 0) {
    const nbSem = (p.fondation?.semelles || []).reduce((s, x) => s + (num(x.nb, 1) || 1), 0)
    if (nbSem > 0 && nbSem < 0.7 * t.nbPoteauxRez) {
      add('attention', `${nbSem} semelle(s) isolée(s) pour ${t.nbPoteauxRez} poteau(x) au RDC — des poteaux semblent non fondés.`)
    }
  }

  // Système constructif vs saisie
  if (p.systeme === 'ossature' && (t.volPoteaux + t.volPoutres) === 0) {
    add('bloquante', `Système « ossature poteaux-poutres » sélectionné mais aucun poteau ni poutre saisi : le béton armé d'élévation est absent du devis.`)
  }
  if ((p.systeme === 'murs' || !p.systeme) && levels.length >= 2 && (t.volPoteaux + t.volPoutres) === 0) {
    add('attention', `Bâtiment R+${levels.length - 1} en « murs porteurs » sans aucun poteau/poutre : dès R+1, une ossature poteaux-poutres est la norme. Vérifiez le système constructif.`)
  }

  // Surfaces de plancher
  levels.forEach((lv, i) => {
    const m = t.parNiveau[i]
    if (!m) return
    if (t.emprise > 0 && m.surfPlancher > 1.3 * t.emprise) {
      add('attention', `Niveau « ${lv.nom || i} » : surface de plancher (${m.surfPlancher} m²) > 130 % de l'emprise (${t.emprise} m²) — surfaces de plusieurs vues probablement mélangées.`)
    }
    if (num(lv.surfPlancher) > 0 && m.Ssol > 0) {
      const ecart = Math.abs(num(lv.surfPlancher) - m.Ssol) / num(lv.surfPlancher)
      if (ecart > 0.05) add('info', `Niveau « ${lv.nom || i} » : somme des pièces (${m.Ssol} m²) ≠ surface de plancher saisie (${lv.surfPlancher} m²) — écart ${Math.round(ecart * 100)} %.`)
    }
    if (m.Smur > 0 && (m.HSP < 2.2 || m.HSP > 6)) add('attention', `Niveau « ${lv.nom || i} » : HSP de ${m.HSP} m inhabituelle — vérifiez la coupe.`)
  })

  // Ratios globaux
  if (t.volBA > 0 && t.acierKg > 0) {
    const ratio = t.acierKg / t.volBA
    if (ratio < 60 || ratio > 140) {
      add('attention', `Ratio d'acier global de ${Math.round(ratio)} kg/m³ hors plage usuelle [60 ; 140] — vérifiez les ratios par élément et les volumes BA.`)
    }
  }
  const surfPlTot = t.parNiveau.reduce((s, m) => s + (m.surfPlancher || 0), 0)
  if (surfPlTot > 0 && (t.volPoteaux + t.volPoutres) > 0) {
    const r = t.volBA / surfPlTot
    if (r < 0.15 || r > 0.45) add('info', `Ratio BA/m² de plancher = ${round2(r)} m³/m² (plage usuelle 0,15–0,45) — à contrôler.`)
  }

  // Fondations vides
  if (t.fondation?.type === 'isolees' && (p.fondation?.semelles || []).length === 0) {
    add('bloquante', `Système « semelles isolées » sélectionné mais aucune semelle saisie : les fondations sont absentes du devis.`)
  }

  // Terrassement — sol argiles noires/vases (Lot B) : purge totale + apport
  // extérieur obligatoires, seule règle dure du Lot B (même principe que la
  // règle bloquante « portance faible → radier » du Lot A). Porté depuis
  // civilestimateurF.
  if (p.fondation?.terrassement?.bloquant) {
    add('bloquante', `Sol « ${p.fondation.terrassement.sol || 'argiles noires / vases'} » détecté : purge totale du déblai obligatoire (aucun réemploi en remblai) et apport extérieur de matériau (ex. sable) à chiffrer séparément. Étude géotechnique obligatoire avant chantier.`)
  }

  // ── Lot A — géotechnique (contrainte admissible vs fondation choisie) ────
  // Ne s'applique que si le projet porte une ville (p.ville) : sans elle, la
  // zone géotechnique — et donc la contrainte admissible — est inconnue.
  if (p.ville) {
    const reco = recommanderFondationProjet({
      ville: p.ville,
      systeme: p.systeme,
      contrainteOverride: p.fondation?.contrainteAdmissible,
      contexteSolOverride: p.fondation?.contexteSol,
      nbNiveaux: levels.length,
    })

    if (reco.recommandation) {
      const { classification, type: typeRecommande } = reco.recommandation
      const typeChoisi = t.fondation?.type

      if (classification === 'faible' && typeChoisi !== 'radier') {
        add('bloquante', `Contrainte admissible du sol estimée à ${reco.contrainte.valeur} bar (portance faible, < 1 bar) — le Lot A impose un radier général dans ce cas, quel que soit le système constructif. Fondation actuelle : « ${typeChoisi} ».`)
      } else if (classification === 'moyenne' && typeChoisi && typeChoisi !== typeRecommande) {
        add('attention', `Contrainte admissible du sol estimée à ${reco.contrainte.valeur} bar (portance moyenne) : le Lot A recommande « ${typeRecommande} » (${reco.recommandation.variante}) plutôt que « ${typeChoisi} ». ${reco.recommandation.justification}`)
      }

      if (reco.horsPerimetre) {
        add('attention', `Portance faible sur un bâtiment de plus de R+2 : hors périmètre de calcul automatique du Lot A — des fondations profondes (pieux) sont probablement nécessaires. Cas à faire étudier par un bureau de sol.`)
      }

      if (reco.basFondPossible && reco.contrainte.source === 'zone') {
        add('info', `Zone « ${reco.zoneInfo?.label} » : si le site est localisé en bas-fond ou vallée, la contrainte admissible peut être bien inférieure à la valeur par défaut de la zone (${reco.contrainte.valeur} bar). Ajustez-la dans l'onglet Projet si besoin.`)
      }
    }
  }

  return alertes
}
