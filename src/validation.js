// src/validation.js
// Passe de validations croisées (A7) — la moindre incohérence de saisie doit
// remonter une alerte plutôt que de produire un devis silencieusement faux.
// Les données de fondation (type, profondeurs, dimensions) sont saisies par
// l'utilisateur ou lues sur le plan de fondation : aucune recommandation par
// ville / zone géotechnique n'est faite par le moteur.
import { num, round2, TOITURES, TYPES_MUR, MURS_PORTEURS } from './constants.js'

/**
 * Vérifie la cohérence du projet métré et retourne un tableau d'alertes.
 * @param {Object} t        - totaux calculés par metrerProjet()
 * @param {Array}  levels   - niveaux saisis par l'utilisateur
 * @param {Object} p        - paramètres du projet (systeme, toiture, planFlags, fondation…)
 */
export function validerCoherence(t, levels, p) {
  const alertes = []
  const add = (niveau, msg) => alertes.push({ niveau, msg })
  const flags = p.planFlags || {}

  // Toiture vs plan lu / emprise
  if (flags.toitTerrasseDetecte && p.toiture !== 'terrasse') {
    add('bloquante', `Le plan lu montre un TOIT-TERRASSE, mais la couverture sélectionnée est « ${TOITURES[p.toiture]?.lab || p.toiture} ». Corrigez le type de toiture avant d'exporter.`)
  }
  // Pente lue sur le plan de toiture vs type de couverture choisi
  const pente = t.toitureDetail?.pentePct
  if (pente !== null && pente !== undefined) {
    if (p.toiture === 'terrasse' && pente > 10) {
      add('attention', `Plan de toiture : pente de ${pente} % lue, incompatible avec un toit-terrasse (pente faible, quelques %) — vérifiez le type de couverture.`)
    } else if (p.toiture !== 'terrasse' && pente <= 3) {
      add('attention', `Plan de toiture : pente de ${pente} % lue, trop faible pour « ${TOITURES[p.toiture]?.lab || p.toiture} » — s'agit-il d'un toit-terrasse ?`)
    }
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

  // Épaisseur des murs porteurs selon le nombre de niveaux (fiche Eurocode §3.A) :
  // R+0 → 15 cm, R+1 → 20 cm, R+2 → 25 cm ; au-delà, calcul obligatoire.
  if ((p.systeme === 'murs' || !p.systeme) && levels.length >= 1) {
    const nbNiv = levels.length
    const iRez = Math.max(0, levels.findIndex((lv) => lv?.rez))
    const typesRez = Object.keys(t.parNiveau?.[iRez]?.parTypeMur || {}).filter((k) => MURS_PORTEURS.includes(k))
    if (nbNiv > 3) {
      add('attention', `Bâtiment R+${nbNiv - 1} en murs porteurs : au-delà de R+2, un calcul de structure est obligatoire (la fiche Eurocode ne couvre pas ce cas).`)
    } else if (typesRez.length) {
      const epMin = [0.15, 0.20, 0.25][nbNiv - 1]
      const trop = typesRez.filter((k) => TYPES_MUR[k].ep + 1e-9 < epMin)
      if (trop.length) {
        add('attention', `Murs porteurs du RDC en « ${trop.map((k) => TYPES_MUR[k].lab).join(', ')} » : épaisseur minimale de ${Math.round(epMin * 100)} cm requise pour R+${nbNiv - 1} (fiche Eurocode §3.A). Choisissez des agglos ${Math.round(epMin * 100)} ou prévoyez une ossature.`)
      }
    }
  }

  // Mode « pièces » : cloisons communes comptées deux fois (périmètre complet
  // de chaque pièce) — saisir les murs un par un (avec jonctions T/X) pour
  // obtenir des longueurs développées exactes (Lot C §1).
  levels.forEach((lv, i) => {
    const nbPieces = (lv.pieces || []).filter((pc) => num(pc.L) > 0 && num(pc.l) > 0).length
    if (nbPieces >= 2 && !(lv.murs && lv.murs.length)) {
      add('attention', `Niveau « ${lv.nom || i} » : ${nbPieces} pièces saisies en mode simple — le périmètre de chaque pièce est compté en entier, donc les murs mitoyens sont comptés deux fois et tous les murs sont traités comme porteurs. Saisissez les murs un par un pour un métré fiable.`)
    }
  })

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
  // extérieur obligatoires, seule règle dure du Lot B. Porté depuis
  // civilestimateurF.
  if (p.fondation?.terrassement?.bloquant) {
    add('bloquante', `Sol « ${p.fondation.terrassement.sol || 'argiles noires / vases'} » détecté : purge totale du déblai obligatoire (aucun réemploi en remblai) et apport extérieur de matériau (ex. sable) à chiffrer séparément. Étude géotechnique obligatoire avant chantier.`)
  }

  return alertes
}
