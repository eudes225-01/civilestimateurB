// test/helpers/faux-supabase.js
// Faux Supabase en mémoire pour les tests, SANS réseau : mini PostgREST (eq, neq, gt, lte, is.null, not.is.null ;
// order, limit, on_conflict) + équivalents JavaScript des trois fonctions SQL de supabase/schema.sql
// (crediter_achat, reserver_credits, regler_credits). Chaque fonction s'exécute d'un seul bloc synchrone, comme
// le verrou de Postgres sérialise les opérations d'un même utilisateur.
// Ce fichier est dans test/ : `node --test` le charge sans y trouver de test (il ne fait rien d'autre).

const reponse = (corps, status = 200) => new Response(corps === null ? '' : JSON.stringify(corps), { status, headers: { 'content-type': 'application/json' } })

export const BASE_URL = 'https://demo.supabase.co'

export function creerFauxSupabase() {
  const etat = { tables: {}, appels: [] }
  const table = (nom) => (etat.tables[nom] ??= [])
  etat.reinitialiser = (init = {}) => { etat.tables = { achats_credits: [], credits_soldes: [], credits_mouvements: [], preuves_confirmation: [], profils: [], ...init }; etat.appels = [] }
  etat.reinitialiser()
  etat.solde = (userId) => table('credits_soldes').find((s) => s.user_id === userId)?.solde ?? 0
  etat.donnerSolde = (userId, solde) => {
    const l = table('credits_soldes').find((s) => s.user_id === userId)
    if (l) { l.solde = solde; l.solde_protege = Math.min(l.solde_protege ?? solde, solde) }
    else table('credits_soldes').push({ user_id: userId, solde, solde_protege: solde })
  }

  // ── Fonctions SQL ──
  function mouvement(user_id, type, montant, solde_apres, ref, extra = {}) {
    table('credits_mouvements').push({ id: `mv-${table('credits_mouvements').length + 1}`, user_id, type, montant, solde_apres, ref, ...extra })
  }
  const rpcs = {
    crediter_achat({ p_tx_id: tx, p_expiration_depuis: depuis = null }) {
      const a = table('achats_credits').find((x) => x.fedapay_transaction_id === tx)
      if (!a) return reponse({ message: 'transaction_inconnue' }, 404)
      if (a.statut !== 'inactif') return reponse([{ solde_apres: etat.solde(a.user_id), credits_ajoutes: 0, est_nouveau: false }])
      Object.assign(a, { statut: 'paye', paye_le: new Date().toISOString() })
      const solde = table('credits_soldes').find((s) => s.user_id === a.user_id)
      const protege = depuis && new Date() >= new Date(depuis) ? 0 : a.credits
      if (solde) { solde.solde += a.credits; solde.solde_protege += protege }
      else table('credits_soldes').push({ user_id: a.user_id, solde: a.credits, solde_protege: protege })
      mouvement(a.user_id, 'achat', a.credits, etat.solde(a.user_id), tx)
      return reponse([{ solde_apres: etat.solde(a.user_id), credits_ajoutes: a.credits, est_nouveau: true }])
    },
    reserver_credits({ p_user_id: uid, p_montant: m, p_ref: ref }) {
      if (!(m > 0)) return reponse({ message: 'montant_invalide' }, 400)
      if (etat.solde(uid) < m) return reponse([{ ok: false, solde_apres: etat.solde(uid) }])
      const s = table('credits_soldes').find((x) => x.user_id === uid)
      const protegeDebite = Math.max(0, m - (s.solde - s.solde_protege))
      s.solde -= m; s.solde_protege -= protegeDebite
      mouvement(uid, 'reservation', -m, etat.solde(uid), ref, { credits_proteges: protegeDebite })
      return reponse([{ ok: true, solde_apres: etat.solde(uid) }])
    },
    regler_credits({ p_user_id: uid, p_reserve: reserve, p_cout: cout, p_ref: ref, p_tokens_entree: te, p_tokens_sortie: ts }) {
      if (!(reserve >= 0) || !(cout >= 0)) return reponse({ message: 'montant_invalide' }, 400)
      if (!table('credits_soldes').some((s) => s.user_id === uid)) return reponse({ message: 'solde_inconnu' }, 404)
      const s = table('credits_soldes').find((x) => x.user_id === uid)
      const r = [...table('credits_mouvements')].reverse().find((x) => x.user_id === uid && x.type === 'reservation' && x.ref === ref && x.montant === -reserve)
      const protegeReserve = Math.min(r?.credits_proteges || 0, reserve)
      let ajust; let protegeDelta = 0
      if (reserve >= cout) {
        ajust = reserve - cout
        protegeDelta = Math.max(0, ajust - (reserve - protegeReserve))
      } else {
        const supplement = Math.min(s.solde, cout - reserve)
        ajust = -supplement
        protegeDelta = -Math.max(0, supplement - (s.solde - s.solde_protege))
      }
      s.solde += ajust; s.solde_protege += protegeDelta
      mouvement(uid, 'regularisation', ajust, etat.solde(uid), ref, { tokens_entree: te, tokens_sortie: ts, credits_proteges: protegeDelta })
      return reponse([{ facture: reserve - ajust, solde_apres: etat.solde(uid) }])
    },
  }

  // ── Mini PostgREST ──
  function postgrest(u, init) {
    const nom = u.pathname.replace('/rest/v1/', '')
    const lignes = table(nom)
    const methode = init.method || 'GET'
    const corps = init.body ? JSON.parse(init.body) : null
    const reserves = new Set(['select', 'order', 'limit', 'on_conflict'])
    const filtres = [...u.searchParams.entries()].filter(([k]) => !reserves.has(k))
    const ok = (l) => filtres.every(([k, v]) => {
      if (k === 'and') {
        return v.replace(/^\(|\)$/g, '').split(',').every((terme) => {
          const [champ, op, ...reste] = terme.split('.')
          const attendu = reste.join('.')
          const valeur = l[champ]
          if (op === 'gte') return valeur != null && new Date(valeur) >= new Date(attendu)
          if (op === 'lte') return valeur != null && new Date(valeur) <= new Date(attendu)
          throw new Error(`filtre and non géré : ${terme}`)
        })
      }
      const x = l[k]
      if (v === 'is.null') return x === null || x === undefined
      if (v === 'not.is.null') return x !== null && x !== undefined
      const [op, ...r] = v.split('.'); const val = r.join('.')
      if (op === 'eq') return String(x) === val
      if (op === 'neq') return String(x) !== val
      if (op === 'gt') return x && new Date(x) > new Date(val)
      if (op === 'lte') return x && new Date(x) <= new Date(val)
      throw new Error(`filtre non géré : ${k}=${v}`)
    })
    if (methode === 'POST') {
      const cle = u.searchParams.get('on_conflict') || 'id'
      if (!lignes.some((l) => l[cle] === corps[cle])) lignes.push({ ...corps, id: corps.id || `id-${lignes.length + 1}`, cree_le: new Date().toISOString() })
      return reponse(null, 201)
    }
    if (methode === 'PATCH') {
      const cibles = lignes.filter(ok)
      cibles.forEach((l) => Object.assign(l, corps))
      return reponse(cibles)
    }
    if (methode === 'DELETE') return reponse(null, 204)
    const res = lignes.filter(ok)
    const ordre = u.searchParams.get('order')
    if (ordre) { const [champ, dir] = ordre.split('.'); res.sort((a, b) => (dir === 'desc' ? -1 : 1) * String(a[champ]).localeCompare(String(b[champ]))) }
    return reponse(res.slice(0, Number(u.searchParams.get('limit')) || 100))
  }

  /** Réponse à une requête Supabase REST, ou null si l'URL n'est pas la sienne. */
  etat.repondre = (url, init = {}) => {
    const s = String(url)
    if (!s.startsWith(`${BASE_URL}/rest/v1/`)) return null
    etat.appels.push(s)
    const u = new URL(s)
    const rpc = /\/rpc\/(\w+)$/.exec(u.pathname)
    if (rpc) return rpcs[rpc[1]] ? rpcs[rpc[1]](JSON.parse(init.body)) : reponse({ message: `fonction inconnue : ${rpc[1]}` }, 404)
    return postgrest(u, init)
  }
  return etat
}
