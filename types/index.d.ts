// types/index.d.ts
// Déclarations de types PUBLIQUES du moteur (adoption progressive de TypeScript : le code reste en JavaScript ESM,
// sans étape de build ; les types décrivent le contrat consommé par le backend et le frontend).
// Les exports non encore typés sont déclarés `any` et seront typés au fil des évolutions.
// Vérification : `npm run typecheck`.

export type ModeChiffrage = 'compose' | 'decompose'
export type Statut = 'calcule' | 'estime' | 'a_confirmer'
export type NiveauAlerte = 'info' | 'attention' | 'bloquante'
export type CategorieMur = 'exterieur' | 'porteur' | 'cloison' | 'mitoyen' | 'soubassement'
export type TypeBloc = 'brique10' | 'agglo10' | 'agglo15' | 'agglo20'
export type TypePlancher = 'aucun' | 'dallePleine' | 'dalleTP' | 'hourdis15' | 'hourdis20' | 'corpsCreuxApparent' | 'corpsCreuxPlan' | 'nervuree'

/** Nombre ou chaîne vide (champ de formulaire non rempli). */
export type Saisie = number | ''

export interface Alerte { niveau: NiveauAlerte | string; msg: string; chemin?: string }

export interface Mur {
  nom?: string; type?: TypeBloc; categorie?: CategorieMur | ''; soubassement?: boolean
  nb?: Saisie; L?: Saisie; H?: Saisie; ep?: Saisie; Hs?: Saisie; Hbp?: Saisie; nChainages?: Saisie; deduireHauteur?: boolean; position?: 'exterieur' | 'interieur' | 'mitoyen'
  portes?: Saisie; fenetres?: Saisie; jonctionsT?: Saisie; jonctionsX?: Saisie; poteaux?: Saisie
  enduitHydrofuge?: boolean
}
export interface Niveau {
  nom?: string; rez?: boolean; HSP?: Saisie; plancher?: TypePlancher
  surfPlancher?: Saisie; tremies?: Saisie; epDalle?: Saisie; perimetre?: Saisie
  /** Corps creux : hauteur d'entrevous en cm (15 ou 20). Ignoré pour hourdis15 / hourdis20. */
  corpsCreux?: 15 | 20 | ''
  /** Corps creux : entraxe des poutrelles (m) et portée (m) — JAMAIS devinés. */
  entraxe?: Saisie; porteePoutrelle?: Saisie; tableCompression?: Saisie
  finitionSousFace?: 'aucune' | 'enduit' | 'faux_plafond'
  /** Hourdis : N = S ÷ (L × l) × (1 + pertes). Poutrelles : Np = longueurPerpPoutrelles ÷ entraxe + 1. */
  dimHourdis?: { L?: Saisie; l?: Saisie }; pertesHourdis?: Saisie; longueurPerpPoutrelles?: Saisie
  nervures?: { entraxe?: Saisie; b?: Saisie; h?: Saisie; sens?: 1 | 2; epTable?: Saisie }
  murs?: Mur[]; pieces?: Array<{ nom?: string; L?: Saisie; l?: Saisie; H?: Saisie; portes?: Saisie; fenetres?: Saisie }>
  poteaux?: Array<{ nom?: string; nb?: Saisie; a?: Saisie; b?: Saisie; H?: Saisie }>
  poutres?: Array<{ nom?: string; nb?: Saisie; L?: Saisie; b?: Saisie; h?: Saisie }>
  voiles?: Array<{ nom?: string; nb?: Saisie; L?: Saisie; ep?: Saisie; H?: Saisie }>
  chainagesV?: Array<{ nom?: string; nb?: Saisie; a?: Saisie; b?: Saisie; H?: Saisie }>
  chainageHaut?: boolean
}
export interface ParametresMortierBloc { blocsM2?: number; pertesPct?: number; mortierM3M2?: number; dosageKgM3?: number; blocsParSac?: number }
export interface FormeDallage { actif?: boolean; surface?: Saisie; epaisseur?: Saisie; dosageKgM3?: number; sableM3ParM3?: number; gravierM3ParM3?: number; eauCimentRatio?: Saisie }
export interface Terrassement {
  sol?: string; cf?: number; cp?: number; bloquant?: boolean
  reemploi?: boolean | { actif?: boolean; taux?: number }
  purge?: { actif?: boolean; justification?: string }
  apportExterieur?: { actif?: boolean; justification?: string }
}
export interface Pignon { nom?: string; nb?: Saisie; h?: Saisie; L1?: Saisie; L2?: Saisie; P1?: Saisie; P2?: Saisie; type?: TypeBloc }
export interface Parametres {
  modeChiffrage?: ModeChiffrage
  /** Déduction de hauteur des murs : H = Ht − Hs − Hbp − n·ec (désactivée par défaut). */
  deductionHauteur?: { actif?: boolean; Hs?: Saisie; Hbp?: Saisie; ec?: Saisie; nChainages?: Saisie }
  pertesHourdis?: number
  K?: number; autoriserKHorsBornes?: boolean
  formeDallage?: FormeDallage
  mortier?: { /** défaut : 'blocsParSac' (1 sac pour 70 blocs) */ mode?: 'volume' | 'blocsParSac'; sableM3ParM3?: number; parType?: Partial<Record<TypeBloc, ParametresMortierBloc>> }
  systeme?: 'murs' | 'ossature' | 'mixte'; toiture?: 'bac' | 'tuiles' | 'shingle' | 'terrasse'
  toiturePresence?: 'aucune' | 'plan' | 'estimer' | null; acrotereHauteur?: Saisie
  pertesAgglo?: number; pertesBrique?: number; ratiosAcier?: Record<string, number>
  fondation?: { type?: 'filante' | 'isolees' | 'radier'; terrassement?: Terrassement; [k: string]: unknown }
  plans?: { toiture?: { L?: Saisie; l?: Saisie; debord?: Saisie; pente?: Saisie; surfaceProjetee?: Saisie; pignons?: Pignon[]; [k: string]: unknown }; [k: string]: unknown }
  [k: string]: unknown
}

export interface Materiau {
  code: string; designation: string; unite: string; quantite: number; quantiteExacte: number
  formule: string; ouvrage: string; niveau: string; statut: Statut; famille: string
}
export interface MateriauSynthese {
  code: string; designation: string; unite: string; quantite: number; quantiteCommande: number
  ouvrages: string[]; niveaux: string[]; statut: Statut; formule: string
}
export interface Materiaux { lignes: Materiau[]; synthese: MateriauSynthese[] }

export interface Hypothese { cle: string; lib: string; valeur: string; statut: string }
export interface LigneDQE {
  n: string; des: string; u: string; q: number; code: string; pu: number; montant: number; estime?: true
  detail?: Array<{ lib: string; formule?: string; q: number; u: string }>
}
export interface DQE {
  mode: ModeChiffrage; modeLabel: string
  lignes: LigneDQE[]
  /** Composants métrés mais NON facturés en plus (compris dans un prix composé, ou terres réemployées). */
  inclus: Array<{ des: string; u: string; q: number; inclusDans: string }>
  sansPrix: Array<{ n: string; des: string; u: string; q: number; code: string }>
  estimes: Array<{ n: string; des: string; code: string; montant: number }>
  incomplet: boolean; complet: boolean; statut: 'complet' | 'indicatif'; raisonsIncomplet: string[]; libelleTotal: string
  alertes: Alerte[]; bloquant: boolean
  /** Montants entiers en FCFA ; ttc = ht + tva. */
  ht: number; tva: number; ttc: number; K: number
  baseDePrix: { version: string; date: string }
  perimetre: string; hypotheses: Hypothese[]
}
export interface Totaux {
  modeChiffrage: ModeChiffrage
  parCategorieMur: Partial<Record<CategorieMur, any>>
  soubassement: any | null; soubassementACompleter: Array<{ niveau?: string; nom: string; manque: string[] }>
  ciment: { beton: number; mortierPose: number; enduits: number; autres: number; formeDallage?: number }
  cimentSacs: number; acierKg: number; materiaux: Materiaux; hypotheses: Hypothese[]
  formeDallage?: FormeDallage; volFormeDallage?: number; toitureAbsente?: boolean
  toitureCalcul: { methode: 'pente' | 'forfait' | 'emprise' | 'terrasse' | 'aucune'; surfProjetee: number; coef: number | null; surfCouverture: number; source: string; formule: string }
  [k: string]: any
}
export interface ResultatProjet { totaux: Totaux; parNiveau: any[]; alertes: Alerte[]; couverture: any; materiaux: Materiaux; validation: { erreurs: Array<{ chemin: string; msg: string }>; alertes: Alerte[] } }

export function metrerProjet(levels?: Niveau[], params?: Parametres): ResultatProjet
export function buildDQE(totaux: Totaux, prixMap?: Record<string, number>, K?: number,
  opts?: { modeChiffrage?: ModeChiffrage; autoriserKHorsBornes?: boolean; couverture?: any; inclut?: Record<string, string[]> }): DQE
export function metrerPlancher(level: Niveau, p: Parametres, ctx: { surfNette: number; nom?: string }): any
export function construireMateriaux(a: { parNiveau?: any[]; fondation?: any; acier?: any; pignons?: any; formeDallage?: any; p?: Parametres; famillesAConfirmer?: string[] }): Materiaux
export function validerEntrees(levels?: Niveau[], p?: Parametres): { erreurs: Array<{ chemin: string; msg: string }>; alertes: Alerte[] }
export function validerPrix(prixMap?: Record<string, number>): Array<{ code: string; msg: string }>
export function terrasser(a: { vDeblaisPlace: number; vEnterre: number; T?: Terrassement }): any
export function mortierPoseBloc(type: TypeBloc, surfNette: number, p?: Parametres): any
export function metrerToiture(ex: any, ctx?: { emprise?: number; coefDefaut?: number }): any
export function calculerAcier(a: { parNiveau?: any[]; fondation?: any; ratios?: Record<string, number> }): any
export function categorieMur(m: Mur, type: TypeBloc): CategorieMur
export const PRIX: Array<{ code: string; designation: string; unite: string; bi: number; sac: number | null; estime?: boolean; inclut?: string[] }>
export const PRIX_VERSION: string
export const PRIX_DATE: string
export const MODES_CHIFFRAGE: Record<ModeChiffrage, { lab: string }>
export const MODE_CHIFFRAGE_DEFAUT: ModeChiffrage
export const K_BORNES: { min: number; max: number }
export const TVA: number
export function qte(v: unknown): number
export function round2(v: number): number
export function num(v: unknown, d?: number): number
export const ACIER: any
export const APPAREILS_SANITAIRES: any
export const CATEGORIES_MUR: any
export const CLES_TYPES_PLANS: any
export const COMPOSANTES: any
export const CORPS_CREUX: any
export const DIAMETRES_PLOMBERIE: any
export const DOSAGES: any
export const ETATS: any
export const FONDATION_DEFAUT: any
export const GUIDE_EXPORT_ARCHICAD: any
export const MORTIER_DEFAUT: any
export const MURS_PORTEURS: any
export const PARAMS_DEFAUT: any
export const PENTES_EVACUATION: any
export const PLANCHERS_CORPS_CREUX: any
export const PLANCHERS_SUSPENDUS_COFFRES: any
export const RATIOS_ACIER_DEFAUT: any
export const RESEAUX_PLOMBERIE: any
export const SAC_CIMENT_KG: any
export const SYSTEMES_CONSTRUCTIFS: any
export const SYSTEMES_FONDATION: any
export const TOITURES: any
export const TYPES_ELECTRIQUES: any
export const TYPES_MUR: any
export const TYPES_PLANCHER: any
export const TYPES_PLANS: any
export const buildSousDetail: any
export const classifierPlan: any
export const codePrixPlancher: any
export const diagnostiquerEntete: any
export const diametresPour: any
export const enregistrerConfirmation: any
export const evaluerCouverture: any
export const exportAutorise: any
export const lacunesPlomberie: any
export const lireIFC: any
export const metrerElectricite: any
export const metrerFondation: any
export const metrerLinteaux: any
export const metrerMurs: any
export const metrerNiveau: any
export const metrerPlomberie: any
export const montantsIncomplets: any
export const mursDepuisPieces: any
export const normaliserAppareil: any
export const normaliserElementElec: any
export const normaliserReseau: any
export const parametresEffectifs: any
export const paramsBloc: any
export const retirerConfirmation: any
export const routerPlan: any
export const surfacePignon: any
export const surfaceTrianglesPignon: any
export const validerCoherence: any
export const validerPlanLu: any
