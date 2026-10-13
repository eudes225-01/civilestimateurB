// src/engine.js
// Point d'entrée unique vers civilestimateur-engine (moteur de calcul +
// données de référence), qui vit à la racine de ce dépôt (voir /package.json
// et /src/index.js à la racine). Toutes les routes importent le moteur via
// ce fichier plutôt que de coder en dur la profondeur du chemin relatif —
// un seul endroit à corriger si l'arborescence change un jour.
export * from '../../src/index.js'
