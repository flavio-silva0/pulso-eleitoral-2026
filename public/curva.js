// Aba 03 · Comparação da curva de apuração do 1º turno (4/out) com a do 2º turno (25/out).
// Eixo horizontal por horário (Brasília) ou por percentual de seções apuradas.
const $ = s => document.querySelector(s);
const nf = d => new Intl.NumberFormat('pt-BR', {minimumFractionDigits: d, maximumFractionDigits: d});
const N1 = nf(1), N2 = nf(2);
const pc = (v, d = 2) => v == null || !Number.isFinite(v) ? '—' : (d === 1 ? N1 : N2).format(v) + '%';
const pp = (v, d = 1) => v == null || !Number.isFinite(v) ? '—' : (d === 1 ? N1 : N2).format(Math.abs(v)) + ' p.p.';
const hhmm = t => { if (t == null || !Number.isFinite(t)) return '—'; const m = Math.round(t), h = Math.floor(m / 60) % 24; return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const hLabel = t => { const m = Math.round(t), h = Math.floor(m / 60) % 24, mm = m % 60; return mm ? `${h}h${String(mm).padStart(2, '0')}` : `${h}h`; };

const state = {x: 'time', y: 'h2h', zoom: 'now', data: null, loading: false, error: null, hover: null};
try { Object.assign(state, JSON.parse(localStorage.getItem('pulso-curva') || '{}'), {data: null, loading: false, error: null, hover: null}); } catch {}
const save = () => { try { localStorage.setItem('pulso-curva', JSON.stringify({x: state.x, y: state.y, zoom: state.zoom})); } catch {} };

// Métricas: entre os dois (13 × 22) ou sobre todos os votos válidos
const metric = {
  h2h: p => { const s = p.l + p.f; return s > 0 ? [p.l / s * 100, p.f / s * 100] : null; },
  valid: p => p.v > 0 ? [p.l / p.v * 100, p.f / p.v * 100] : null
};
const xOf = p => state.x === 'time' ? p.t : p.p;

// Valor interpolado de uma série em x. `hold`: mantém o último valor depois do fim (apuração encerrada).
function at(points, x, hold) {
  const pts = points.filter(p => metric[state.y](p));
  if (!pts.length || x < xOf(pts[0])) return null;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], xa = xOf(a), xb = xOf(b);
    if (x >= xa && x <= xb) {
      const k = xb > xa ? (x - xa) / (xb - xa) : 1, ma = metric[state.y](a), mb = metric[state.y](b);
      return {l: ma[0] + (mb[0] - ma[0]) * k, f: ma[1] + (mb[1] - ma[1]) * k, t: a.t + (b.t - a.t) * k, p: a.p + (b.p - a.p) * k};
    }
  }
  const last = pts[pts.length - 1];
  if (x === xOf(last) || hold) { const m = metric[state.y](last); return {l: m[0], f: m[1], t: last.t, p: last.p, held: x > xOf(last)}; }
  return null;
}

function inject() {
  const html = `
  <section id="curva-page" class="curva-page" hidden aria-labelledby="cv-title">
   <div class="cv-head">
    <div>
     <span class="cv-eyebrow">1º TURNO × 2º TURNO · PRESIDENTE · BRASIL</span>
     <h2 id="cv-title">A curva da apuração</h2>
     <p class="cv-sub">A contagem de hoje comparada com a de 4 de outubro, no mesmo horário ou no mesmo ponto da apuração.</p>
    </div>
    <div class="cv-controls">
     <div class="cv-seg" role="group" aria-label="Eixo horizontal">
      <button data-cv-x="time">Por horário</button><button data-cv-x="pct">Por % apurado</button>
     </div>
     <div class="cv-seg" role="group" aria-label="Base do percentual">
      <button data-cv-y="h2h" title="Percentual considerando só os votos de Lula e Flávio">Lula × Flávio</button><button data-cv-y="valid" title="Percentual sobre todos os votos válidos (no 1º turno inclui os demais candidatos)">% dos válidos</button>
     </div>
     <div class="cv-seg" role="group" aria-label="Escala">
      <button data-cv-zoom="now">Até agora</button><button data-cv-zoom="all">Noite inteira</button>
     </div>
    </div>
   </div>
   <div id="cv-cards" class="cv-cards"></div>
   <div class="cv-panel">
    <div class="cv-legend">
     <span><i class="cv-sw cv-l"></i>Lula</span><span><i class="cv-sw cv-f"></i>Flávio</span>
     <span><svg width="26" height="8" aria-hidden="true"><line x1="0" y1="4" x2="26" y2="4" stroke="currentColor" stroke-width="3"/></svg>2º turno (hoje)</span>
     <span><svg width="26" height="8" aria-hidden="true"><line x1="0" y1="4" x2="26" y2="4" stroke="currentColor" stroke-width="2" stroke-dasharray="5 4" opacity=".6"/></svg>1º turno (4/out)</span>
     <span id="cv-status" class="cv-status"></span>
    </div>
    <div id="cv-chart" class="cv-chart"><p class="cv-empty">Carregando as curvas…</p></div>
    <div id="cv-tip" class="cv-tip" hidden></div>
   </div>
   <p class="cv-foot" id="cv-foot">Fonte: totalização nacional do TSE (seções totalizadas no Brasil e exterior), registrada minuto a minuto por seuimposto.com. "Lula × Flávio" considera só os votos dos dois; no 1º turno havia outros candidatos.</p>
  </section>`;
  const footer = document.querySelector('main > .app-footer');
  if (footer) footer.insertAdjacentHTML('beforebegin', html); else document.querySelector('main').insertAdjacentHTML('beforeend', html);
  document.querySelector('nav')?.querySelector('a[href="#curva"]') || document.querySelector('nav')?.insertAdjacentHTML('beforeend', '<a href="#curva">03 · 1º × 2º turno</a>');
  $('#curva-page').addEventListener('click', e => {
    const b = e.target.closest('[data-cv-x],[data-cv-y],[data-cv-zoom]');
    if (!b) return;
    if (b.dataset.cvX) state.x = b.dataset.cvX;
    if (b.dataset.cvY) state.y = b.dataset.cvY;
    if (b.dataset.cvZoom) state.zoom = b.dataset.cvZoom;
    state.hover = null; save(); render();
  });
}

function domainX(t1, t2) {
  const last2 = t2[t2.length - 1];
  if (state.x === 'pct') {
    const full = [0, 100];
    if (state.zoom === 'all' || !last2) return full;
    const steps = [2, 5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100];
    return [0, steps.find(s => s >= last2.p * 1.2) || 100];
  }
  const firsts = [t1[0]?.t, t2[0]?.t].filter(Number.isFinite);
  const start = firsts.length ? Math.floor(Math.min(...firsts) / 60) * 60 : 1020;
  const done1 = t1.find(p => p.p >= 99.9) || t1[t1.length - 1];
  const fullEnd = Math.max(done1?.t || start + 60, last2?.t || 0, start + 60);
  if (state.zoom === 'all' || !last2) return [start, fullEnd];
  return [start, Math.min(fullEnd, Math.max(last2.t + 20, start + 90))];
}

function niceStep(range, target) {
  const raw = range / Math.max(1, target), pow = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map(m => m * pow).find(s => s >= raw) || 10 * pow;
}

function render() {
  if (!$('#curva-page')) return;
  document.querySelectorAll('[data-cv-x]').forEach(b => b.classList.toggle('selected', b.dataset.cvX === state.x));
  document.querySelectorAll('[data-cv-y]').forEach(b => b.classList.toggle('selected', b.dataset.cvY === state.y));
  document.querySelectorAll('[data-cv-zoom]').forEach(b => b.classList.toggle('selected', b.dataset.cvZoom === state.zoom));
  const d = state.data;
  $('#cv-status').textContent = state.error ? `⚠ ${state.error}` : d ? `Atualizado às ${new Date(d.checkedAt).toLocaleTimeString('pt-BR', {timeZone: 'America/Sao_Paulo'})}` : '';
  $('#cv-status').classList.toggle('err', !!state.error || !!d?.t2?.error);
  if (!d) { $('#cv-cards').innerHTML = ''; $('#cv-chart').innerHTML = `<p class="cv-empty">${state.error ? 'Não foi possível carregar as curvas. Nova tentativa em instantes.' : 'Carregando as curvas…'}</p>`; return; }
  if (d.t2?.error) $('#cv-status').textContent = `⚠ 2º turno: ${d.t2.error} (exibindo última carga)`;
  const t1 = (d.t1?.points || []).filter(p => metric[state.y](p)), t2 = (d.t2?.points || []).filter(p => metric[state.y](p));
  renderCards(t1, t2);
  renderChart(t1, t2);
}

function marginHtml(m, who = '') {
  if (m == null) return '—';
  if (Math.abs(m) < 0.005) return 'Empate';
  return `<b class="${m > 0 ? 'cv-tl' : 'cv-tf'}">${m > 0 ? 'Lula' : 'Flávio'} +${pp(m, 2)}</b>${who}`;
}

function renderCards(t1, t2) {
  const now = t2[t2.length - 1], fin = t1[t1.length - 1];
  const nowM = now && metric[state.y](now);
  const refX = now ? xOf(now) : null;
  const ref = refX == null ? null : at(t1, refX, state.x === 'time');
  const finM = fin && metric[state.y](fin);
  const label = state.x === 'time' ? `às ${hhmm(now?.t)}` : `com ${pc(now?.p)} apurado`;
  const m2 = nowM ? nowM[0] - nowM[1] : null, m1 = ref ? ref.l - ref.f : null, delta = m2 != null && m1 != null ? m2 - m1 : null;
  const pair = (l, f) => `<div class="cv-pair"><span><i class="cv-sw cv-l"></i>Lula <b>${pc(l)}</b></span><span><i class="cv-sw cv-f"></i>Flávio <b>${pc(f)}</b></span></div>`;
  $('#cv-cards').innerHTML = `
   <article class="cv-card">
    <span class="cv-k">2º turno · agora</span>
    ${now ? pair(nowM[0], nowM[1]) : '<div class="cv-pair cv-muted">Aguardando os primeiros votos</div>'}
    <small>${now ? `${pc(now.p)} das seções · carga das ${hhmm(now.t)}` : 'A curva de hoje começa com a primeira carga do TSE.'}</small>
   </article>
   <article class="cv-card">
    <span class="cv-k">1º turno · ${now ? label : 'no mesmo ponto'}</span>
    ${ref ? pair(ref.l, ref.f) : `<div class="cv-pair cv-muted">${now ? 'Ainda sem votos nesse ponto' : '—'}</div>`}
    <small>${ref ? (state.x === 'time' ? (ref.held ? 'apuração já encerrada nesse horário' : `tinha ${pc(ref.p)} das seções apuradas`) : `atingido às ${hhmm(ref.t)} de 4/out`) : ''}${finM ? `${ref ? ' · ' : ''}final: Lula ${pc(finM[0], 1)} · Flávio ${pc(finM[1], 1)}` : ''}</small>
   </article>
   <article class="cv-card">
    <span class="cv-k">Margem Lula − Flávio</span>
    <div class="cv-pair cv-margin"><span>Hoje ${marginHtml(m2)}</span><span>1º turno ${marginHtml(m1)}</span></div>
    <small>${delta == null ? 'A comparação aparece quando houver votos nos dois turnos.' : Math.abs(delta) < 0.005 ? 'Mesma margem do 1º turno.' : `Variação de <b class="${delta > 0 ? 'cv-tl' : 'cv-tf'}">${pp(delta, 2)} a favor de ${delta > 0 ? 'Lula' : 'Flávio'}</b> em relação ao 1º turno ${state.x === 'time' ? 'no mesmo horário' : 'no mesmo % apurado'}.`}</small>
   </article>`;
}

let geo = null;
function renderChart(t1, t2) {
  const el = $('#cv-chart');
  if (!t1.length && !t2.length) { el.innerHTML = '<p class="cv-empty">Sem dados das curvas ainda.</p>'; return; }
  const W = Math.max(300, Math.round(el.clientWidth)), H = Math.max(220, Math.round(el.clientHeight));
  const narrow = W < 520, m = {l: 40, r: narrow ? 46 : 58, t: 12, b: 26};
  const [x0, x1] = domainX(t1, t2);
  const inX = p => xOf(p) >= x0 && xOf(p) <= x1;
  // Domínio vertical a partir dos pontos visíveis
  const vals = [];
  for (const s of [t1, t2]) for (const p of s) if (inX(p)) vals.push(...metric[state.y](p));
  for (const s of [t1, t2]) for (const x of [x0, x1]) { const v = at(s, x, false); if (v) vals.push(v.l, v.f); }
  let y0, y1;
  if (!vals.length) { y0 = 0; y1 = 100; }
  else if (state.y === 'h2h') { const dv = Math.max(2, ...vals.map(v => Math.abs(v - 50))) + 1; y0 = 50 - dv; y1 = 50 + dv; }
  else { y0 = Math.min(...vals) - 1.5; y1 = Math.max(...vals) + 1.5; }
  const ys = niceStep(y1 - y0, H < 300 ? 4 : 6);
  y0 = Math.max(0, Math.floor(y0 / ys) * ys); y1 = Math.min(100, Math.ceil(y1 / ys) * ys);
  const X = x => m.l + (x - x0) / (x1 - x0 || 1) * (W - m.l - m.r), Y = v => m.t + (1 - (v - y0) / (y1 - y0 || 1)) * (H - m.t - m.b);
  geo = {W, H, m, x0, x1, X, Y, t1, t2};

  // Eixos e grade
  let grid = '';
  for (let v = y0; v <= y1 + 1e-9; v += ys) grid += `<line class="cv-grid${state.y === 'h2h' && Math.abs(v - 50) < 1e-9 ? ' cv-mid' : ''}" x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}"/><text class="cv-ax" x="${m.l - 6}" y="${Y(v) + 3.5}" text-anchor="end">${Number.isInteger(v) ? v : N1.format(v)}%</text>`;
  const xs = state.x === 'time' ? [15, 30, 60, 120, 180].find(s => (x1 - x0) / s <= (W - m.l - m.r) / 64) || 240 : niceStep(x1 - x0, Math.floor((W - m.l - m.r) / 60));
  for (let v = Math.ceil(x0 / xs) * xs; v <= x1 + 1e-9; v += xs) grid += `<line class="cv-tick" x1="${X(v)}" x2="${X(v)}" y1="${m.t}" y2="${H - m.b}"/><text class="cv-ax" x="${X(v)}" y="${H - m.b + 16}" text-anchor="middle">${state.x === 'time' ? hLabel(v) : (Number.isInteger(v) ? v : N1.format(v)) + '%'}</text>`;

  const path = (pts, k) => { let s = ''; for (const p of pts) { const v = metric[state.y](p)[k]; s += `${s ? 'L' : 'M'}${X(xOf(p)).toFixed(1)},${Y(v).toFixed(1)}`; } return s; };
  // Inclui um ponto além das bordas para a linha encostar no limite (recortada pelo clipPath)
  const visible = pts => { const i0 = Math.max(0, pts.findIndex(p => xOf(p) >= x0) - 1); let i1 = pts.findIndex(p => xOf(p) > x1); i1 = i1 < 0 ? pts.length : i1 + 1; return pts.slice(i0, i1); };
  const v1 = visible(t1), v2 = visible(t2);
  // No modo horário, o 1º turno terminado segue como linha reta até o fim do eixo
  const tail = (pts, all) => { if (state.x !== 'time' || !all.length) return pts; const last = all[all.length - 1]; return xOf(last) < x1 && pts.includes(last) ? [...pts, {...last, t: x1}] : pts; };
  const s1 = tail(v1, t1);
  let lines = `<path class="cv-line cv-t1 cv-l" d="${path(s1, 0)}"/><path class="cv-line cv-t1 cv-f" d="${path(s1, 1)}"/>`;
  lines += `<path class="cv-line cv-t2 cv-l" d="${path(v2, 0)}"/><path class="cv-line cv-t2 cv-f" d="${path(v2, 1)}"/>`;
  const last = t2[t2.length - 1];
  let ends = '';
  if (last && inX(last)) {
    const mv = metric[state.y](last), lx = X(xOf(last));
    let ly = Y(mv[0]), fy = Y(mv[1]);
    if (Math.abs(ly - fy) < 14) { const mid = (ly + fy) / 2, s = ly <= fy ? -7 : 7; ly = mid + s; fy = mid - s; }
    ends = `<circle class="cv-dot cv-l" cx="${lx}" cy="${Y(mv[0])}" r="4"/><circle class="cv-dot cv-f" cx="${lx}" cy="${Y(mv[1])}" r="4"/>
     <text class="cv-end cv-tl" x="${lx + 7}" y="${ly + 4}">${pc(mv[0], 1)}</text><text class="cv-end cv-tf" x="${lx + 7}" y="${fy + 4}">${pc(mv[1], 1)}</text>`;
  }
  el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Curvas de Lula e Flávio no 1º e no 2º turno, ${state.x === 'time' ? 'por horário' : 'por percentual apurado'}">
    <defs><clipPath id="cv-clip"><rect x="${m.l}" y="0" width="${W - m.l - m.r}" height="${H}"/></clipPath></defs>
    ${grid}<g clip-path="url(#cv-clip)">${lines}</g>${ends}
    <g id="cv-hover"></g><rect class="cv-hit" x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}"/></svg>`;
  if (state.hover != null) hover(state.hover);
}

function hover(x) {
  const g = $('#cv-hover'), tip = $('#cv-tip');
  if (!geo || !g) return;
  if (x == null) { g.innerHTML = ''; tip.hidden = true; return; }
  const {X, Y, m, H, t1, t2, W} = geo;
  const a1 = at(t1, x, state.x === 'time'), a2 = at(t2, x, false);
  const px = X(x);
  let dots = `<line class="cv-guide" x1="${px}" x2="${px}" y1="${m.t}" y2="${H - m.b}"/>`;
  for (const [a, cls] of [[a1, 'cv-t1'], [a2, 'cv-t2']]) if (a) dots += `<circle class="cv-hdot cv-l ${cls}" cx="${px}" cy="${Y(a.l)}" r="3.5"/><circle class="cv-hdot cv-f ${cls}" cx="${px}" cy="${Y(a.f)}" r="3.5"/>`;
  g.innerHTML = dots;
  const row = (name, a, extra) => a ? `<div class="cv-trow"><span class="cv-tn">${name}</span><span class="cv-tl">${pc(a.l)}</span><span class="cv-tf">${pc(a.f)}</span></div><div class="cv-tsub">${extra(a)}</div>` : `<div class="cv-trow"><span class="cv-tn">${name}</span><span class="cv-muted">sem votos</span></div>`;
  const head = state.x === 'time' ? `Às ${hhmm(x)}` : `Com ${pc(x)} apurado`;
  const ex = a => state.x === 'time' ? (a.held ? 'apuração encerrada' : `${pc(a.p)} apurado`) : `às ${hhmm(a.t)}`;
  const diff = a1 && a2 ? (a2.l - a2.f) - (a1.l - a1.f) : null;
  tip.innerHTML = `<div class="cv-th">${head}</div><div class="cv-trow cv-thd"><span></span><span>Lula</span><span>Flávio</span></div>${row('2º turno', a2, ex)}${row('1º turno', a1, ex)}${diff != null ? `<div class="cv-tdiff">Margem mudou <b class="${diff >= 0 ? 'cv-tl' : 'cv-tf'}">${pp(diff, 2)} p/ ${diff >= 0 ? 'Lula' : 'Flávio'}</b></div>` : ''}`;
  tip.hidden = false;
  const tw = tip.offsetWidth, chart = $('#cv-chart'), ox = chart.offsetLeft, oy = chart.offsetTop;
  let left = ox + px + 14;
  if (left + tw > ox + W - 4) left = ox + px - tw - 14;
  tip.style.left = `${Math.max(ox + 4, left)}px`;
  tip.style.top = `${oy + m.t + 6}px`;
}

function bindHover() {
  const el = $('#cv-chart');
  const pick = e => {
    if (!geo || !e.target.closest('.cv-hit')) return null;
    const r = el.getBoundingClientRect(), px = e.clientX - r.left;
    const x = geo.x0 + (px - geo.m.l) / (geo.W - geo.m.l - geo.m.r) * (geo.x1 - geo.x0);
    return Math.min(geo.x1, Math.max(geo.x0, x));
  };
  el.addEventListener('pointermove', e => { const x = pick(e); state.hover = x; hover(x); });
  el.addEventListener('pointerdown', e => { const x = pick(e); state.hover = x; hover(x); });
  el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { state.hover = null; hover(null); } });
}

async function load() {
  if (state.loading) return;
  state.loading = true;
  try {
    const r = await fetch('/api/curva', {cache: 'no-store'});
    if (!r.ok) throw Error('Servidor indisponível');
    const d = await r.json();
    if (!d?.t1 || !d?.t2) throw Error('Resposta inválida');
    state.data = d; state.error = null;
  } catch (e) { state.error = e.message; }
  finally { state.loading = false; }
  if (active()) render();
}

const active = () => location.hash === '#curva';
function route() {
  const on = active();
  document.body.classList.toggle('curva-view', on);
  $('#curva-page').hidden = !on;
  if (on) { document.querySelectorAll('nav a').forEach(a => a.classList.toggle('current', a.hash === '#curva')); render(); if (!state.data || Date.now() - (state.data.checkedAt || 0) > 10000) load(); }
}

inject();
bindHover();
let lastSize = '';
new ResizeObserver(([e]) => { const s = `${Math.round(e.contentRect.width)}x${Math.round(e.contentRect.height)}`; if (s !== lastSize) { lastSize = s; if (active()) render(); } }).observe($('#cv-chart'));
window.addEventListener('hashchange', route);
route();
load();
setInterval(() => { if (active() && !document.hidden) load(); }, 15000);
