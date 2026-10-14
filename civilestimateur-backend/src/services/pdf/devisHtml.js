// src/services/pdf/devisHtml.js
// Gabarit HTML/CSS du devis (DQE). Quatre morceaux, assemblés en PDF par rendu.js :
//   - couverture   : page pleine, sans en-tête ni pied de page
//   - corps        : synthèse, DQE par chapitres, sous-détail des prix, métrés
//   - en-tête / pied de page répétés (modèles Chromium, numérotation « Page X / Y »)
// Tout texte venant du client passe par esc() ; aucune ressource externe (CSP stricte).
import { fontFaceCss } from './fonts.js'
import { nombreEnLettres } from './nombreEnLettres.js'

const NBSP = '\u00A0'

// ── Utilitaires ────────────────────────────────────────────────────────────
// Caractères absents du sous-ensemble « latin » des polices : remplacés par un équivalent.
const nettoyer = (s) => String(s ?? '').replace(/→/g, 'à').replace(/Σ/g, 'cumul').replace(/[⚠]/g, '!')
export const esc = (s) => nettoyer(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export function fmt(n, dec = 0) {
  const x = Math.round((Number(n) || 0) * 10 ** dec) / 10 ** dec
  const [ent, frac] = Math.abs(x).toFixed(dec).split('.')
  const milliers = ent.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)
  return `${x < 0 ? '−' : ''}${milliers}${frac ? `,${frac}` : ''}`
}
const pct = (part, total) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0)

const CHAPITRES = {
  1: 'Terrassement', 2: 'Fondations', 3: 'Structure en élévation', 4: 'Planchers', 5: 'Maçonnerie',
  6: 'Enduits et peinture', 7: 'Aciers', 8: 'Couverture', 9: 'Granulats', 10: 'Coffrage',
  11: 'Plomberie et assainissement', 12: 'Électricité',
}

function parChapitre(lignes) {
  const map = new Map()
  for (const l of lignes) {
    const k = parseInt(String(l.n).split('.')[0], 10) || 0
    if (!map.has(k)) map.set(k, { k, titre: CHAPITRES[k] || `Chapitre ${k}`, lignes: [], total: 0 })
    const c = map.get(k)
    c.lignes.push(l)
    c.total += l.montant
  }
  return [...map.values()].sort((a, b) => a.k - b.k)
}

// ── Feuille de style ───────────────────────────────────────────────────────
export function css(color) {
  return `
${fontFaceCss()}
:root{--c:${color};--c-dark:color-mix(in srgb,var(--c) 68%,#000);--c-soft:color-mix(in srgb,var(--c) 8%,#fff);
--c-mid:color-mix(in srgb,var(--c) 16%,#fff);--ink:#1b1814;--muted:#6f675f;--line:#e6dfd5;--paper:#fbf8f3;--warn:#a8650a;--warn-bg:#fdf3df}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{margin:0;padding:0}
body{font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:9pt;line-height:1.45;color:var(--ink);font-variant-numeric:tabular-nums;font-feature-settings:'tnum' 1,'cv11' 1}
h1,h2,h3,.disp{font-family:'Space Grotesk','Inter',Arial,sans-serif;letter-spacing:-.01em}
.num{text-align:right;white-space:nowrap}
.muted{color:var(--muted)}

/* En-tête de section */
.sec{display:flex;align-items:flex-end;gap:4mm;margin:0 0 5mm;padding-bottom:3mm;border-bottom:.35mm solid var(--c)}
.sec .no{font:700 22pt/1 'Space Grotesk',Arial,sans-serif;color:var(--c);opacity:.28}
.sec h2{margin:0;font-size:15pt;font-weight:700;line-height:1.1}
.sec p{margin:1mm 0 0;font-size:8pt;color:var(--muted)}
.brk{break-before:page}
h3.sub{font-size:10pt;margin:4.5mm 0 2mm;font-weight:700}

/* Cartes d'information */
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:4mm}
.card{border:.25mm solid var(--line);border-radius:2.2mm;padding:3.2mm 4.2mm;background:#fff;break-inside:avoid}
.card h3{margin:0 0 2.5mm;font-size:7.5pt;text-transform:uppercase;letter-spacing:.09em;color:var(--c);font-weight:700;font-family:'Inter',Arial,sans-serif}
.kv{display:grid;grid-template-columns:30mm 1fr;gap:.8mm 3mm;font-size:8.4pt}
.kv dt{color:var(--muted)} .kv dd{margin:0;font-weight:500;overflow-wrap:anywhere}

/* Chiffres clés */
.stats{display:grid;grid-template-columns:1fr 1fr 1.35fr;gap:4mm;margin-top:3mm}
.stat{border:.25mm solid var(--line);border-radius:2.2mm;padding:3mm 4.2mm;background:#fff;break-inside:avoid}
.stat .l{font-size:7.2pt;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);font-weight:600}
.stat .v{font:700 15pt/1.15 'Space Grotesk',Arial,sans-serif;margin-top:1.5mm;white-space:nowrap}
.stat .v small{font:500 8pt 'Inter',Arial,sans-serif;color:var(--muted);margin-left:1mm}
.stat.hi{background:var(--c);border-color:var(--c);color:#fff}
.stat.hi .l,.stat.hi .v small{color:rgba(255,255,255,.78)}
.stat.hi .v{font-size:18pt}

/* Répartition par chapitre */
.bars{margin-top:1mm}
.bar{display:grid;grid-template-columns:7mm 52mm 1fr 32mm 12mm;align-items:center;gap:2.5mm;padding:1mm 0;border-bottom:.2mm solid var(--line);font-size:8.2pt;break-inside:avoid}
.bar .k{font:700 9pt 'Space Grotesk',Arial,sans-serif;color:var(--c)}
.bar .t{height:2.6mm;border-radius:1.3mm;background:var(--c-mid);overflow:hidden}
.bar .t i{display:block;height:100%;background:var(--c);border-radius:1.3mm}
.bar .m{text-align:right;font-weight:600;white-space:nowrap} .bar .p{text-align:right;color:var(--muted);white-space:nowrap}

/* Encadrés */
.note{border-radius:2mm;padding:2.4mm 3.6mm;margin-top:2.6mm;font-size:8pt;line-height:1.5;break-inside:avoid}
.note b.t{display:block;font-size:7pt;letter-spacing:.09em;text-transform:uppercase;margin-bottom:1mm}
.note.info{background:var(--c-soft);color:var(--c-dark)} .note.warn{background:var(--warn-bg);color:var(--warn)} .note.gris{background:#f3efe8;color:#5f574f}
.note ul{margin:0;padding-left:4mm} .note li{margin:.4mm 0}
.tag-e{display:inline-block;font-size:6.2pt;font-weight:700;letter-spacing:.06em;padding:.2mm 1.3mm;border-radius:.8mm;background:#f6d9a8;margin-right:1.2mm;vertical-align:1px}
.tag-e.error,.tag-e.erreur,.tag-e.critique,.tag-e.bloquante{background:#f3b9ae;color:#8f2411}

/* Tables */
table{width:100%;border-collapse:collapse;table-layout:fixed}
thead{display:table-header-group} tr{break-inside:avoid}
.dqe th{background:var(--c);color:#fff;font-size:7.4pt;font-weight:600;letter-spacing:.05em;text-transform:uppercase;padding:2.3mm 2mm;text-align:left}
.dqe th.num{text-align:right} .dqe th.ctr,.dqe td.ctr{text-align:center}
.dqe td{padding:1.9mm 2mm;border-bottom:.2mm solid var(--line);font-size:8.3pt;vertical-align:top}
.dqe td.n{color:var(--muted);font-size:7.8pt;white-space:nowrap}
.dqe td.d{overflow-wrap:anywhere}
.dqe tr.chap td{background:var(--c-soft);border-bottom:.3mm solid var(--c-mid);padding:2.2mm 2mm;font:700 8.8pt 'Space Grotesk',Arial,sans-serif;color:var(--c-dark);break-after:avoid}
.dqe tr.chap td .b{display:inline-block;min-width:5.5mm;text-align:center;background:var(--c);color:#fff;border-radius:1mm;padding:.2mm 1.2mm;margin-right:2mm;font-size:8pt}
.dqe tr.st td{border-bottom:.35mm solid var(--c-mid);font-weight:700;font-size:8.2pt;padding:1.8mm 2mm}
.dqe tr.st td.l{text-align:right;color:var(--muted);font-weight:500}
.dqe td.sp{color:#b07418;font-style:italic;font-size:7.4pt}

/* Totaux & arrêté */
.fin{break-inside:avoid;margin-top:6mm}
.recap{width:100%}
.recap td{padding:1.6mm 2.5mm;font-size:8.6pt;border-bottom:.2mm solid var(--line)}
.tot{margin:4mm 0 0 auto;width:86mm;border:.25mm solid var(--line);border-radius:2.2mm;overflow:hidden}
.tot div{display:flex;justify-content:space-between;padding:2.2mm 4mm;font-size:9pt;border-bottom:.2mm solid var(--line)}
.tot div:last-child{border:0;background:var(--c);color:#fff;font:700 11.5pt 'Space Grotesk',Arial,sans-serif;padding:3mm 4mm}
.arrete{margin-top:4mm;padding:3.2mm 4mm;border-left:.9mm solid var(--c);background:var(--c-soft);font-size:8.6pt;border-radius:0 1.6mm 1.6mm 0}
.arrete b{font-weight:700}
.sign{display:grid;grid-template-columns:1fr 1fr;gap:8mm;margin-top:6mm}
.sign div{border:.25mm dashed #c9bfb1;border-radius:2mm;height:30mm;padding:2.5mm 3.5mm;font-size:7.4pt;color:var(--muted)}
.sign b{display:block;color:var(--ink);font-size:8pt;margin-bottom:.5mm}

/* Sous-détail */
.sd-grid{display:grid;grid-template-columns:1fr 1fr;gap:4mm;align-items:start}
.sd{border:.25mm solid var(--line);border-radius:2.2mm;overflow:hidden;break-inside:avoid;background:#fff}
.sd header{padding:2.4mm 3.2mm;background:var(--c-soft);border-bottom:.25mm solid var(--c-mid)}
.sd header b{display:block;font:700 8.4pt/1.25 'Space Grotesk',Arial,sans-serif;color:var(--c-dark)}
.sd header span{font-size:7pt;color:var(--muted)}
.sd table td{padding:1.1mm 3.2mm;font-size:7.6pt;border-bottom:.15mm solid var(--line);vertical-align:middle}
.sd .stk{display:flex;height:1.7mm;margin:0 3.2mm 1.5mm;border-radius:1mm;overflow:hidden;background:var(--c-mid)}
.sd .stk i{display:block;height:100%}
.sd tr.s td{font-weight:700;background:#faf7f2} .sd tr.pv td{background:var(--c);color:#fff;font-weight:700;border:0;padding:1.7mm 3.2mm}
.sd td.p{color:var(--muted);width:11mm}

/* Métrés */
.met td{padding:1.7mm 2.5mm;border-bottom:.2mm solid var(--line);font-size:8.4pt}
.met tr:nth-child(even) td{background:#faf7f2}
.met th{background:#4b4540;color:#fff;font-size:7.4pt;font-weight:600;letter-spacing:.05em;text-transform:uppercase;padding:2.3mm 2.5mm;text-align:left}

/* Couverture */
@page cover{size:A4;margin:0}
.cover{width:210mm;height:296mm;position:relative;overflow:hidden;background:var(--paper)}
.cover .top{position:absolute;inset:0 0 auto 0;height:138mm;background:var(--c);
 background-image:linear-gradient(rgba(255,255,255,.07) .25mm,transparent .25mm),linear-gradient(90deg,rgba(255,255,255,.07) .25mm,transparent .25mm),linear-gradient(135deg,var(--c) 0%,var(--c-dark) 100%);
 background-size:8mm 8mm,8mm 8mm,100% 100%;clip-path:polygon(0 0,100% 0,100% 82%,0 100%)}
.cover .acc{position:absolute;left:0;top:132mm;width:62mm;height:2.2mm;background:#fff;opacity:.9;transform:rotate(-5.7deg);transform-origin:left}
.cover .in{position:absolute;inset:0;padding:20mm 20mm 0}
.cover .brand{display:flex;align-items:center;gap:5mm;color:#fff}
.cover .logo{width:30mm;height:26mm;background:#fff;border-radius:3.5mm;display:grid;place-items:center;padding:2.2mm;box-shadow:0 2mm 6mm rgba(0,0,0,.2)}
.cover .logo img{max-width:100%;max-height:100%;object-fit:contain}
.cover .logo.mono{background:rgba(255,255,255,.14);box-shadow:none;border:.4mm solid rgba(255,255,255,.55);font:700 22pt 'Space Grotesk',Arial,sans-serif;color:#fff}
.cover .brand .nm{font:700 13pt/1.2 'Space Grotesk',Arial,sans-serif;max-width:110mm;overflow-wrap:anywhere}
.cover .brand .sl{font-size:8.5pt;opacity:.82;margin-top:1mm;max-width:110mm}
.cover .kick{margin-top:19mm;color:rgba(255,255,255,.8);font-size:8pt;letter-spacing:.2em;text-transform:uppercase;font-weight:600}
.cover h1{margin:2.5mm 0 0;color:#fff;font-size:33pt;line-height:1.04;font-weight:700;max-width:150mm}
.cover .proj{position:absolute;left:20mm;right:20mm;top:158mm;background:#fff;border-radius:3mm;padding:7mm 8mm;box-shadow:0 3mm 12mm rgba(40,30,20,.12);border:.25mm solid var(--line)}
.cover .proj .kv{grid-template-columns:36mm 1fr;font-size:9.6pt;gap:2.4mm 4mm}
.cover .proj .kv dd{font-weight:600}
.cover .tt{position:absolute;left:20mm;right:20mm;top:226mm;display:flex;align-items:center;justify-content:space-between;gap:6mm}
.cover .tt .l{font-size:7.6pt;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);font-weight:600}
.cover .tt .v{font:700 24pt/1.1 'Space Grotesk',Arial,sans-serif;color:var(--c);margin-top:1mm;white-space:nowrap}
.cover .tt .s{font-size:8pt;color:var(--muted);margin-top:1mm}
.cover .tt .dt{text-align:right;font-size:8pt;color:var(--muted)}
.cover .id{position:absolute;left:20mm;right:20mm;bottom:14mm;padding-top:4mm;border-top:.3mm solid var(--c);font-size:7.6pt;color:var(--muted);line-height:1.6;text-align:center}
.cover .bot{position:absolute;left:0;right:0;bottom:0;height:5mm;background:linear-gradient(90deg,var(--c),var(--c-dark))}
`
}

const page = (titre, color, corps, cssExtra = '') => `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'">
<title>${esc(titre)}</title><style>${css(color)}${cssExtra}</style></head><body>${corps}</body></html>`

// ── Couverture ─────────────────────────────────────────────────────────────
export function buildCoverHtml(m) {
  const { proj, brand, dqe, meta } = m
  const nom = proj.entreprise || 'Entreprise non renseignée'
  const infos = [
    proj.titre && ['Projet', proj.titre], proj.mo && ["Maître d'ouvrage", proj.mo],
    proj.ref && ['Référence / N° marché', proj.ref], proj.ville && ['Localisation', proj.ville],
  ].filter(Boolean)
  const id = [
    brand.adresse, [brand.telephone, brand.email].filter(Boolean).join('  ·  '),
    [brand.rccm && `RCCM ${brand.rccm}`, brand.ifu && `IFU ${brand.ifu}`].filter(Boolean).join('  ·  '),
  ].filter(Boolean)
  const logo = brand.logo
    ? `<div class="logo"><img src="${brand.logo}" alt=""></div>`
    : `<div class="logo mono">${esc((nom[0] || 'E').toUpperCase())}</div>`
  const corps = `<section class="cover"><div class="top"></div><div class="acc"></div>
<div class="in">
  <div class="brand">${logo}<div><div class="nm">${esc(nom)}</div>${brand.slogan ? `<div class="sl">${esc(brand.slogan)}</div>` : ''}</div></div>
  <div class="kick">Bordereau des prix · Gros œuvre</div>
  <h1>Devis quantitatif<br>estimatif</h1>
</div>
${infos.length ? `<div class="proj"><dl class="kv">${infos.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>` : ''}
<div class="tt"><div><div class="l">Montant total TTC</div><div class="v">${fmt(dqe.ttc)} FCFA</div><div class="s">HT ${fmt(dqe.ht)} FCFA · TVA 18 % ${fmt(dqe.tva)} FCFA</div></div>
<div class="dt">Document édité le<br><b style="color:var(--ink)">${esc(meta.date)}</b></div></div>
${id.length ? `<div class="id">${id.map(esc).join('<br>')}</div>` : ''}
<div class="bot"></div></section>`
  return page(`Devis — ${proj.titre || nom}`, brand.color, corps, '@page{size:A4;margin:0}')
}

// ── Corps ──────────────────────────────────────────────────────────────────
function blocSynthese(m, chapitres) {
  const { proj, brand, dqe, meta, alertes } = m
  const infos = [
    proj.titre && ['Projet', proj.titre], proj.mo && ["Maître d'ouvrage", proj.mo],
    proj.entreprise && ['Entreprise / BET', proj.entreprise], proj.ref && ['Référence', proj.ref],
    proj.ville && ['Localisation', proj.ville], meta.toiture && ['Type de toiture', meta.toiture],
    ['Coefficient K', String(meta.K).replace('.', ',')],
  ].filter(Boolean)
  const ent = [
    brand.adresse && ['Adresse', brand.adresse], brand.telephone && ['Téléphone', brand.telephone],
    brand.email && ['E-mail', brand.email], brand.rccm && ['RCCM', brand.rccm], brand.ifu && ['IFU', brand.ifu],
  ].filter(Boolean)
  const kv = (rows) => `<dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`
  const barres = chapitres.map((c) => `<div class="bar"><span class="k">${c.k}</span><span>${esc(c.titre)}</span>
<span class="t"><i style="width:${Math.max(1.5, pct(c.total, dqe.ht))}%"></i></span><span class="m">${fmt(c.total)}</span><span class="p">${fmt(pct(c.total, dqe.ht), 1)} %</span></div>`).join('')
  const nbSansPrix = dqe.lignes.filter((l) => l.pu <= 0).length

  return `<section>
<div class="sec"><span class="no">01</span><div><h2>Synthèse du projet</h2><p>Informations générales, montants et répartition par chapitre</p></div></div>
<div class="grid2"><div class="card"><h3>Projet</h3>${kv(infos)}</div>
<div class="card"><h3>Entreprise</h3>${ent.length ? kv(ent) : '<p class="muted" style="margin:0">Coordonnées non renseignées.</p>'}</div></div>
<div class="stats">
 <div class="stat"><div class="l">Total HT</div><div class="v">${fmt(dqe.ht)}<small>FCFA</small></div></div>
 <div class="stat"><div class="l">TVA 18 %</div><div class="v">${fmt(dqe.tva)}<small>FCFA</small></div></div>
 <div class="stat hi"><div class="l">Total TTC</div><div class="v">${fmt(dqe.ttc)}<small>FCFA</small></div></div></div>
<h3 class="sub">Répartition par chapitre <span class="muted" style="font-weight:400;font-size:8pt">(montants HT, FCFA)</span></h3>
<div class="bars">${barres}</div>
${meta.perimetre ? `<div class="note info"><b class="t">Périmètre du devis</b>${esc(meta.perimetre)}</div>` : ''}
${nbSansPrix ? `<div class="note warn"><b class="t">Postes sans prix (${nbSansPrix})</b>Ces postes sont métrés mais n'ont pas de prix unitaire : ils n'ajoutent rien au total, qui n'est donc pas complet.</div>` : ''}
${alertes.length ? `<div class="note warn"><b class="t">Points à vérifier (${alertes.length})</b><ul>${alertes.map((a) => `<li><span class="tag-e ${esc(a.niveau)}">${esc(a.niveau.toUpperCase())}</span>${esc(a.msg)}</li>`).join('')}</ul></div>` : ''}
</section>`
}

function blocDqe(m, chapitres) {
  const { dqe, brand, proj } = m
  const rows = chapitres.map((c) => `
<tr class="chap"><td colspan="6"><span class="b">${c.k}</span>${esc(c.titre)}</td></tr>
${c.lignes.map((l) => `<tr><td class="n">${esc(l.n)}</td><td class="d">${esc(l.des)}</td><td class="ctr">${esc(l.u)}</td>
<td class="num">${fmt(l.q, 2)}</td>${l.pu > 0 ? `<td class="num">${fmt(l.pu)}</td><td class="num"><b>${fmt(l.montant)}</b></td>` : '<td class="num sp" colspan="2">prix à renseigner</td>'}</tr>`).join('')}
<tr class="st"><td colspan="5" class="l">Sous-total ${c.k} — ${esc(c.titre)}</td><td class="num">${fmt(c.total)}</td></tr>`).join('')

  const lettres = nombreEnLettres(dqe.ttc)
  const arrete = `${lettres.charAt(0).toUpperCase()}${lettres.slice(1)} francs CFA toutes taxes comprises`
  return `<section class="brk">
<div class="sec"><span class="no">02</span><div><h2>Devis quantitatif estimatif</h2><p>Bordereau détaillé par chapitre — prix unitaires majorés du coefficient K</p></div></div>
<table class="dqe"><colgroup><col style="width:13mm"><col><col style="width:11mm"><col style="width:23mm"><col style="width:25mm"><col style="width:31mm"></colgroup>
<thead><tr><th>N°</th><th>Désignation</th><th class="ctr">U</th><th class="num">Quantité</th><th class="num">PU (FCFA)</th><th class="num">Montant HT</th></tr></thead>
<tbody>${rows}</tbody></table>
<div class="fin">
 <h3 class="sub" style="margin-top:0">Récapitulatif</h3>
 <table class="recap"><tbody>${chapitres.map((c) => `<tr><td style="width:9mm;color:var(--c);font-weight:700">${c.k}</td><td>${esc(c.titre)}</td><td class="num" style="width:34mm">${fmt(c.total)}</td></tr>`).join('')}</tbody></table>
 <div class="tot"><div><span>Total HT</span><span>${fmt(dqe.ht)} FCFA</span></div><div><span>TVA 18 %</span><span>${fmt(dqe.tva)} FCFA</span></div><div><span>TOTAL TTC</span><span>${fmt(dqe.ttc)} FCFA</span></div></div>
 <div class="arrete">Arrêté le présent devis à la somme de <b>${esc(arrete)}</b> (${fmt(dqe.ttc)} FCFA).</div>
 <div class="sign"><div><b>Établi par</b>${esc(proj.entreprise || '')}<br>Date, nom et signature</div><div><b>Bon pour accord</b>Le maître d'ouvrage${proj.mo ? ` — ${esc(proj.mo)}` : ''}<br>Date, nom et signature</div></div>
 <div class="note gris"><b class="t">Nature des résultats</b>Estimation établie par le moteur de calcul CivilEstimateur à partir des dimensions saisies et du barème de prix indiqué. Elle ne remplace ni un métré d'exécution, ni une étude technique, ni les prix réels du marché : à valider par le professionnel qui engage l'offre.</div>
</div></section>`
}

function blocSousDetail(m) {
  const cartes = m.sousDetail.map((s) => {
    const tot = s.deboursesSec > 0 ? s.deboursesSec : s.composantes.reduce((a, c) => a + c.montant, 0)
    const teintes = [100, 72, 48, 30, 18, 10]
    const stk = s.composantes.map((c, i) => `<i style="width:${pct(c.montant, tot)}%;background:color-mix(in srgb,var(--c) ${teintes[i % teintes.length]}%,#fff)"></i>`).join('')
    return `<article class="sd"><header><b>${esc(s.n)} — ${esc(s.des)}</b><span>Prix unitaire par ${esc(s.u)}</span></header>
<div style="height:2mm"></div><div class="stk">${stk}</div>
<table><colgroup><col><col style="width:22mm"><col style="width:11mm"></colgroup><tbody>
${s.composantes.map((c) => `<tr><td>${esc(c.lib)}</td><td class="num">${fmt(c.montant)}</td><td class="num p">${fmt(pct(c.montant, tot), 1)} %</td></tr>`).join('')}
<tr class="s"><td>Déboursé sec</td><td class="num">${fmt(s.deboursesSec)}</td><td class="num p">100 %</td></tr>
<tr><td>Majoration (K = ${esc(String(s.coeffK).replace('.', ','))})</td><td class="num">+ ${fmt(s.majoration)}</td><td></td></tr>
<tr class="pv"><td>Prix de vente unitaire</td><td class="num" colspan="2">${fmt(s.puVente)} FCFA</td></tr></tbody></table></article>`
  }).join('')
  return `<section class="brk"><div class="sec"><span class="no">03</span><div><h2>Sous-détail des prix unitaires</h2>
<p>Déboursé sec (matériaux, main-d'œuvre, matériel) avant majoration K — aléas, frais généraux et bénéfice</p></div></div>
<div class="sd-grid">${cartes}</div></section>`
}

function blocMetres(m, no) {
  return `<section class="brk"><div class="sec"><span class="no">${no}</span><div><h2>Récapitulatif des quantités</h2><p>Métrés calculés par le moteur, sans omission</p></div></div>
<table class="met"><colgroup><col><col style="width:38mm"><col style="width:26mm"></colgroup>
<thead><tr><th>Désignation</th><th class="num">Quantité</th><th style="text-align:center">Unité</th></tr></thead>
<tbody>${m.metres.map((x) => `<tr><td>${esc(x.lib)}</td><td class="num"><b>${fmt(x.q, 2)}</b></td><td style="text-align:center" class="muted">${esc(x.u)}</td></tr>`).join('')}</tbody></table></section>`
}

export function buildBodyHtml(m) {
  const chapitres = parChapitre(m.dqe.lignes)
  const parts = [blocSynthese(m, chapitres), blocDqe(m, chapitres)]
  let no = 3
  if (m.opts.sousDetail && m.sousDetail.length) { parts.push(blocSousDetail(m)); no++ }
  if (m.opts.metresComplets && m.metres.length) parts.push(blocMetres(m, String(no).padStart(2, '0')))
  return page(`Devis — ${m.proj.titre || m.proj.entreprise}`, m.brand.color, parts.join(''), '@page{size:A4;margin:25mm 14mm 21mm}')
}

// ── En-tête / pied de page (modèles Chromium : styles en ligne, pas de script) ──
export const MARGES = { top: '25mm', bottom: '21mm', left: '14mm', right: '14mm' }

export function buildHeaderTemplate(m) {
  const { proj, brand } = m
  const nom = proj.entreprise || 'CivilEstimateur'
  const logo = brand.logo ? `<span style="display:inline-block;width:9mm;height:8mm;background:#fff;border-radius:1.4mm;padding:.6mm;margin-left:3mm;vertical-align:middle"><img src="${brand.logo}" style="width:100%;height:100%;object-fit:contain"></span>` : ''
  return `<style>${fontFaceCss()}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style>
<div style="width:100%;margin:0;padding:0;font-family:'Inter',Arial,sans-serif;">
 <div style="width:100%;height:13mm;background:${brand.color};color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 14mm;box-sizing:border-box;">
  <span style="font-family:'Space Grotesk',Arial,sans-serif;font-weight:700;font-size:10pt;letter-spacing:-.01em;">${esc(nom)}</span>
  <span style="font-size:7pt;opacity:.88;">Devis quantitatif estimatif${proj.titre ? ` — ${esc(proj.titre.slice(0, 70))}` : ''}${logo}</span>
 </div>
 <div style="width:100%;height:.9mm;background:linear-gradient(90deg,rgba(0,0,0,.28),rgba(0,0,0,0));"></div>
</div>`
}

export function buildFooterTemplate(m) {
  const { brand, opts, meta } = m
  const legal = [brand.rccm && `RCCM : ${brand.rccm}`, brand.ifu && `IFU : ${brand.ifu}`, brand.telephone && `Tél. : ${brand.telephone}`, brand.email && brand.email].filter(Boolean).join('   ·   ')
  const bareme = `Résultats indicatifs — barème ${meta.prixVersion || 'RPR'}${meta.prixDate ? ` (${meta.prixDate})` : ''} · généré par CivilEstimateur`
  return `<style>${fontFaceCss()}</style>
<div style="width:100%;padding:0 14mm;box-sizing:border-box;font-family:'Inter',Arial,sans-serif;font-size:6.6pt;color:#8c847b;-webkit-print-color-adjust:exact;">
 <div style="border-top:.25mm solid #e6dfd5;padding-top:1.8mm;display:flex;justify-content:space-between;align-items:flex-start;gap:6mm;">
  <div style="line-height:1.55;">${legal ? `<div>${esc(legal)}</div>` : ''}${brand.adresse ? `<div>${esc(brand.adresse)}</div>` : ''}<div style="color:#a79e94;">${esc(bareme)}</div></div>
  ${opts.pagination ? `<div style="font-family:'Space Grotesk',Arial,sans-serif;font-size:8pt;font-weight:600;color:${brand.color};white-space:nowrap;">Page <span class="pageNumber"></span> / <span class="totalPages"></span></div>` : ''}
 </div>
</div>`
}
