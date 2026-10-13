// src/services/pdf/modele.js
// Validation et assainissement du document reçu du navigateur. Rien de ce qui entre ici
// n'est de confiance : chaînes tronquées, nombres forcés, couleur et logo contrôlés.
// (L'échappement HTML est fait plus loin, au moment de l'écriture du gabarit.)

const MAX = { lignes: 400, sousDetail: 400, composantes: 40, metres: 120, alertes: 100 }

const txt = (v, max = 300) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max)
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const arr = (v, max) => (Array.isArray(v) ? v.slice(0, max) : [])

const COULEUR_DEFAUT = '#1e2a78'
const couleur = (c) => (/^#[0-9a-f]{6}$/i.test(String(c || '')) ? String(c).toLowerCase() : COULEUR_DEFAUT)

// Seuls PNG/JPEG en data-URI, 1,5 Mo max : aucune URL distante n'est jamais chargée par le moteur.
const logo = (l) => (typeof l === 'string' && l.length < 2_000_000 && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(l) ? l : null)

export class ModeleInvalide extends Error {}

export function normaliserModele(raw) {
  if (!raw || typeof raw !== 'object') throw new ModeleInvalide('corps_invalide')
  const lignesRaw = arr(raw.dqe?.lignes, MAX.lignes + 1)
  if (lignesRaw.length === 0) throw new ModeleInvalide('dqe_vide')
  if (lignesRaw.length > MAX.lignes) throw new ModeleInvalide('dqe_trop_long')

  const lignes = lignesRaw.map((l) => ({
    n: txt(l.n, 12), des: txt(l.des, 300), u: txt(l.u, 12),
    q: num(l.q), pu: num(l.pu), montant: num(l.montant),
  }))
  const ht = num(raw.dqe?.ht), tva = num(raw.dqe?.tva), ttc = num(raw.dqe?.ttc)

  const p = raw.proj || {}, b = raw.brand || {}, o = raw.opts || {}, m = raw.meta || {}
  return {
    proj: { titre: txt(p.titre), mo: txt(p.mo), entreprise: txt(p.entreprise), ref: txt(p.ref), ville: txt(p.ville) },
    brand: {
      color: couleur(b.color), logo: logo(b.logo), slogan: txt(b.slogan, 120),
      telephone: txt(b.telephone, 40), email: txt(b.email, 120), adresse: txt(b.adresse, 200),
      rccm: txt(b.rccm, 60), ifu: txt(b.ifu, 60),
    },
    opts: {
      pageGarde: o.pageGarde !== false, sousDetail: o.sousDetail !== false,
      metresComplets: o.metresComplets !== false, pagination: o.pagination !== false,
    },
    dqe: { lignes, ht, tva, ttc },
    sousDetail: arr(raw.sousDetail, MAX.sousDetail).map((s) => ({
      n: txt(s.n, 12), des: txt(s.des, 300), u: txt(s.u, 12),
      composantes: arr(s.composantes, MAX.composantes).map((c) => ({ lib: txt(c.lib, 160), montant: num(c.montant) })),
      deboursesSec: num(s.deboursesSec), coeffK: num(s.coeffK), majoration: num(s.majoration), puVente: num(s.puVente),
    })),
    metres: arr(raw.metres, MAX.metres).map((x) => ({ lib: txt(x.lib, 160), q: num(x.q), u: txt(x.u, 20) })),
    alertes: arr(raw.alertes, MAX.alertes).map((a) => ({
      niveau: ['info', 'attention', 'warn', 'warning', 'error', 'erreur', 'critique', 'bloquante'].includes(String(a.niveau)) ? String(a.niveau) : 'info',
      msg: txt(a.msg, 600),
    })),
    meta: {
      K: num(m.K) || 1.3, toiture: txt(m.toiture, 120), perimetre: txt(m.perimetre, 800),
      prixVersion: txt(m.prixVersion, 60), prixDate: txt(m.prixDate, 40),
      date: txt(m.date, 20) || new Date().toLocaleDateString('fr-FR'),
    },
  }
}
