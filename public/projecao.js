// Aba 04 · Projeção Estatística ao Vivo do Segundo Turno Presidencial.
// Modelo preditivo estratificado por estado e região com regularização Bayesiana de swing.
const $ = s => document.querySelector(s);
const nf = d => new Intl.NumberFormat('pt-BR', {minimumFractionDigits: d, maximumFractionDigits: d});
const N0 = new Intl.NumberFormat('pt-BR');
const N1 = nf(1), N2 = nf(2);
const pc = (v, d = 2) => v == null || !Number.isFinite(v) ? '—' : (d === 1 ? N1 : N2).format(v) + '%';
const pp = (v, d = 2) => v == null || !Number.isFinite(v) ? '—' : (d === 1 ? N1 : N2).format(Math.abs(v)) + ' p.p.';
const num = v => v == null || !Number.isFinite(v) ? '—' : N0.format(Math.round(v));

const state = {
  method: 'bayesian',
  regionFilter: 'ALL',
  sortBy: 'electorate', // 'electorate', 'progress', 'lulaProj', 'flavioProj', 'swing'
  data: null,
  loading: false,
  error: null,
  hoverPoint: null
};

try {
  const saved = JSON.parse(localStorage.getItem('pulso-projecao') || '{}');
  if (saved.method) state.method = saved.method;
  if (saved.sortBy) state.sortBy = saved.sortBy;
} catch {}
const save = () => {
  try {
    localStorage.setItem('pulso-projecao', JSON.stringify({method: state.method, sortBy: state.sortBy}));
  } catch {}
};

function inject() {
  const html = `
  <section id="projecao-page" class="projecao-page" hidden aria-labelledby="pj-title">
   <div class="pj-head">
    <div>
     <span class="pj-eyebrow">MODELO ESTATÍSTICO AO VIVO · PRESIDENTE · BRASIL</span>
     <h2 id="pj-title">Projeção do Resultado Final</h2>
     <p class="pj-sub" id="pj-sub">Corrige o viés geográfico e a velocidade desigual de apuração entre estados e regiões.</p>
    </div>
    <div class="pj-controls">
     <div class="pj-seg" role="group" aria-label="Método de projeção">
      <button data-pj-m="bayesian" title="Modelo estratificado por UF com ajuste de swing e encolhimento Bayesiano">Estratificado + Swing</button>
      <button data-pj-m="t1_remainder" title="Aplica o resultado exato do 1º turno aos votos ainda não apurados">1º Turno no restante</button>
      <button data-pj-m="direct" title="Extrapola a proporção atual observada em cada UF">Extrapolação direta</button>
     </div>
     <button id="pj-refresh-btn" class="pj-refresh-btn" title="Atualizar projeção agora">↻ Atualizar</button>
    </div>
   </div>

   <!-- Hero Card da Projeção -->
   <div id="pj-hero" class="pj-hero">
    <div class="pj-loading">Calculando projeção ao vivo…</div>
   </div>

   <!-- 4 Cards de Métricas -->
   <div id="pj-cards" class="pj-cards"></div>

   <!-- Gráfico Histórico da Projeção -->
   <div class="pj-panel pj-chart-panel">
    <div class="pj-panel-head">
     <div>
      <span class="pj-panel-eyebrow">LINHA DO TEMPO</span>
      <h3 class="pj-panel-title">Evolução da Projeção Final</h3>
      <p class="pj-panel-desc">Como a estimativa final do modelo se comportou a cada avanço da apuração nacional.</p>
     </div>
     <div class="pj-chart-legend">
      <span><i class="pj-sw pj-l"></i>Lula (Projetado)</span>
      <span><i class="pj-sw pj-f"></i>Flávio (Projetado)</span>
      <span><span class="pj-ci-sample"></span>Faixa de 95%</span>
      <span id="pj-status-text" class="pj-status-text"></span>
     </div>
    </div>
    <div id="pj-chart" class="pj-chart"><p class="pj-empty">Aguardando dados históricos da projeção…</p></div>
    <div id="pj-chart-tip" class="pj-chart-tip" hidden></div>
   </div>

   <!-- Tabela Raio-X por Estado -->
   <div class="pj-panel pj-table-panel">
    <div class="pj-panel-head">
     <div>
      <span class="pj-panel-eyebrow">ESTADO POR ESTADO</span>
      <h3 class="pj-panel-title">Raio-X da Projeção nas 27 UFs</h3>
      <p class="pj-panel-desc">Progresso da contagem, variação em relação ao 1º turno (swing) e votos faltantes em cada estado.</p>
     </div>
     <div class="pj-table-filters">
      <div class="pj-seg pj-seg-mini" role="group" aria-label="Filtrar por região">
       <button data-pj-reg="ALL" class="selected">Todas</button>
       <button data-pj-reg="Nordeste">Nordeste</button>
       <button data-pj-reg="Sudeste">Sudeste</button>
       <button data-pj-reg="Sul">Sul</button>
       <button data-pj-reg="Norte">Norte</button>
       <button data-pj-reg="CentroOeste">Centro-Oeste</button>
      </div>
      <select id="pj-sort-select" class="pj-select" aria-label="Ordenar estados">
       <option value="electorate">Maior eleitorado</option>
       <option value="progressAsc">Menos apurados (onde mais falta)</option>
       <option value="progressDesc">Mais apurados (quase fechados)</option>
       <option value="lulaProj">Maior % Lula projetado</option>
       <option value="flavioProj">Maior % Flávio projetado</option>
       <option value="swingLula">Maior ganho de Lula vs 1ºT</option>
       <option value="swingFlavio">Maior ganho de Flávio vs 1ºT</option>
      </select>
     </div>
    </div>
    <div class="pj-table-wrap">
     <table class="pj-table" id="pj-table">
      <thead>
       <tr>
        <th>UF</th>
        <th>Região</th>
        <th class="ta-r">Progresso</th>
        <th class="ta-c">Contagem Atual</th>
        <th class="ta-r">1ºT (Ref)</th>
        <th class="ta-r">Swing</th>
        <th class="ta-r">Votos Faltantes</th>
        <th class="ta-c">Projeção Final</th>
        <th class="ta-c">Vencedor Projetado</th>
       </tr>
      </thead>
      <tbody id="pj-table-body">
       <tr><td colspan="9" class="pj-empty">Carregando dados dos estados…</td></tr>
      </tbody>
     </table>
    </div>
   </div>

   <!-- Metodologia -->
   <div class="pj-methodology">
    <h4>Como funciona esta projeção?</h4>
    <div class="pj-method-grid">
     <article>
      <strong>1. Correção do Viés Regional</strong>
      <p>Estados do Sul e Centro-Oeste costumam apurar mais rápido que o Nordeste e periferias metropolitanas. A projeção decompõe o Brasil nas 27 UFs para que cada estado pese estritamente de acordo com seu eleitorado real.</p>
     </article>
     <article>
      <strong>2. Ponderação do Swing</strong>
      <p>Compara o desempenho atual de cada candidato com o 1º turno de 4 de outubro na mesma UF. O modelo detecta a variação do eleitorado (swing) e projeta os votos restantes com base nessa tendência observada.</p>
     </article>
     <article>
      <strong>3. Suavização Bayesiana (Shrinkage)</strong>
      <p>Quando um estado tem poucas seções abertas (< 5%), a taxa local é muito volátil. O modelo aplica contração Bayesiana em direção ao swing médio da sua macrorregião, evitando distorções prematuras.</p>
     </article>
     <article>
      <strong>4. Faixa de Incerteza Dinâmica</strong>
      <p>O intervalo de confiança de 95% e a probabilidade de vitória são calculados a partir da raiz da fração de votos ainda não apurados, encolhendo gradualmente até coincidir com o resultado oficial de 100%.</p>
     </article>
    </div>
   </div>
  </section>`;

  const footer = document.querySelector('main > .app-footer');
  if (footer) footer.insertAdjacentHTML('beforebegin', html);
  else document.querySelector('main').insertAdjacentHTML('beforeend', html);

  // Escuta botões e filtros
  const page = $('#projecao-page');
  page.addEventListener('click', e => {
    const btnMethod = e.target.closest('[data-pj-m]');
    if (btnMethod) {
      state.method = btnMethod.dataset.pjM;
      save();
      load();
      return;
    }
    const btnReg = e.target.closest('[data-pj-reg]');
    if (btnReg) {
      state.regionFilter = btnReg.dataset.pjReg;
      page.querySelectorAll('[data-pj-reg]').forEach(b => b.classList.toggle('selected', b === btnReg));
      renderTable();
      return;
    }
    if (e.target.closest('#pj-refresh-btn')) {
      load(true);
      return;
    }
  });

  const sortSelect = $('#pj-sort-select');
  if (sortSelect) {
    sortSelect.value = state.sortBy;
    sortSelect.addEventListener('change', () => {
      state.sortBy = sortSelect.value;
      save();
      renderTable();
    });
  }
}

function renderHero(d) {
  const hero = $('#pj-hero');
  if (!hero || !d?.projection) return;

  const p = d.projection;
  const c = d.current;
  const natP = d.natProgress || 0;
  const leadLula = p.lulaPct >= p.flavioPct;
  const marginPp = Math.abs(p.lulaPct - p.flavioPct);
  const marginV = Math.abs(p.lulaVotes - p.flavioVotes);

  // Faixa de 95%
  const ci = p.ci95 || {};
  const probL = p.probability?.lula ?? 50;
  const probF = p.probability?.flavio ?? 50;

  // Track bar width
  const trackLulaWidth = Math.max(0, Math.min(100, p.lulaPct));
  const ciLeft = Math.max(0, Math.min(100, ci.lulaMin || p.lulaPct));
  const ciRight = Math.max(0, Math.min(100, ci.lulaMax || p.lulaPct));
  const ciWidth = Math.max(0, ciRight - ciLeft);

  hero.innerHTML = `
   <div class="pj-hero-card">
    <div class="pj-hero-top">
     <div class="pj-cand-col pj-cand-lula ${leadLula ? 'pj-is-leader' : ''}">
      <div class="pj-avatar-wrap">
       <img src="/lula.webp" alt="Lula" class="pj-avatar">
       ${leadLula ? '<span class="pj-crown-badge" title="Líder projetado">PROJETADO</span>' : ''}
      </div>
      <div class="pj-cand-meta">
       <span class="pj-cand-name">Lula</span>
       <span class="pj-cand-party">PT · 13</span>
       <span class="pj-cand-pct red-text">${pc(p.lulaPct, 2)}</span>
       <span class="pj-cand-votes">${num(p.lulaVotes)} votos estimados</span>
       <span class="pj-cand-ci">IC 95%: ${pc(ci.lulaMin, 1)} a ${pc(ci.lulaMax, 1)}</span>
      </div>
     </div>

     <div class="pj-versus-col">
      <span class="pj-versus-badge">×</span>
      <div class="pj-call-status ${p.statusLevel || 'neutral'}">
       <span class="pj-call-dot"></span>
       <strong>${p.status}</strong>
      </div>
      <div class="pj-prob-box">
       <span class="pj-prob-title">Chance de Vitória Estimada</span>
       <div class="pj-prob-split">
        <span class="red-text"><b>${pc(probL, 1)}</b> Lula</span>
        <span class="blue-text"><b>${pc(probF, 1)}</b> Flávio</span>
       </div>
      </div>
     </div>

     <div class="pj-cand-col pj-cand-flavio ${!leadLula ? 'pj-is-leader' : ''}">
      <div class="pj-avatar-wrap">
       <img src="/bolsonaro.webp" alt="Flávio Bolsonaro" class="pj-avatar">
       ${!leadLula ? '<span class="pj-crown-badge" title="Líder projetado">PROJETADO</span>' : ''}
      </div>
      <div class="pj-cand-meta">
       <span class="pj-cand-name">Flávio Bolsonaro</span>
       <span class="pj-cand-party">PL · 22</span>
       <span class="pj-cand-pct blue-text">${pc(p.flavioPct, 2)}</span>
       <span class="pj-cand-votes">${num(p.flavioVotes)} votos estimados</span>
       <span class="pj-cand-ci">IC 95%: ${pc(ci.flavioMin, 1)} a ${pc(ci.flavioMax, 1)}</span>
      </div>
     </div>
    </div>

    <!-- Barra de Projeção com Faixa de Confiança -->
    <div class="pj-track-wrap">
     <div class="pj-track">
      <div class="pj-track-fill pj-fill-lula" style="width: ${trackLulaWidth}%"></div>
      <div class="pj-track-fill pj-fill-flavio" style="width: ${100 - trackLulaWidth}%"></div>
      <div class="pj-track-ci" style="left: ${ciLeft}%; width: ${ciWidth}%" title="Faixa de confiança de 95%: ${pc(ciLeft, 1)} a ${pc(ciRight, 1)}"></div>
      <div class="pj-track-50" title="Linha de 50% (maioria necessária)">
       <span>50%</span>
      </div>
     </div>
     <div class="pj-track-labels">
      <span>0%</span>
      <span class="pj-track-sub">Faixa sombreada indica intervalo de 95% de confiança</span>
      <span>100%</span>
     </div>
    </div>

    <!-- Comparação Projeção vs Contagem Atual -->
    <div class="pj-hero-footer">
     <div class="pj-hfoot-col">
      <span class="pj-hfoot-k">Projeção Final</span>
      <strong class="${leadLula ? 'red-text' : 'blue-text'}">${leadLula ? 'Lula' : 'Flávio'} +${pp(marginPp, 2)}</strong>
      <small>Vantagem projetada de ${num(marginV)} votos</small>
     </div>
     <div class="pj-hfoot-sep"></div>
     <div class="pj-hfoot-col">
      <span class="pj-hfoot-k">Apuração Real do TSE (Agora)</span>
      <strong>${c.lulaPct >= c.flavioPct ? 'Lula' : 'Flávio'} +${pp(Math.abs(c.lulaPct - c.flavioPct), 2)}</strong>
      <small>${pc(natP, 2)} apurado (${num(c.validVotes)} válidos contados)</small>
     </div>
     <div class="pj-hfoot-sep"></div>
     <div class="pj-hfoot-col">
      <span class="pj-hfoot-k">Votos Restantes Estimados</span>
      <strong>${num(p.remainingVotes)}</strong>
      <small>${pc(100 - natP, 1)} das seções a totalizar</small>
     </div>
    </div>
   </div>
  `;
}

function renderCards(d) {
  const cards = $('#pj-cards');
  if (!cards || !d?.projection) return;

  const p = d.projection;
  const leadLula = p.lulaPct >= p.flavioPct;
  const marginPp = Math.abs(p.lulaPct - p.flavioPct);
  const marginV = Math.abs(p.lulaVotes - p.flavioVotes);

  // Identifica onde falta mais apurar
  const ufsByRemaining = [...(d.ufs || [])].sort((a, b) => (b.remainingVotes || 0) - (a.remainingVotes || 0));
  const topRemUfs = ufsByRemaining.slice(0, 3).map(u => `${u.uf} (${num(u.remainingVotes)})`).join(', ');

  cards.innerHTML = `
   <article class="cv-card">
    <span class="cv-k">Vencedor Projetado</span>
    <div class="cv-pair"><b class="${leadLula ? 'cv-tl' : 'cv-tf'}">${leadLula ? 'Lula' : 'Flávio'}</b> <span>${pc(leadLula ? p.lulaPct : p.flavioPct, 2)}</span></div>
    <small>Probabilidade calculada de <b>${pc(leadLula ? p.probability.lula : p.probability.flavio, 1)}</b> de vitória final.</small>
   </article>

   <article class="cv-card">
    <span class="cv-k">Margem Estimada</span>
    <div class="cv-pair"><b class="${leadLula ? 'cv-tl' : 'cv-tf'}">+${pp(marginPp, 2)}</b> <span>${num(marginV)} votos</span></div>
    <small>Intervalo de 95%: de ${pc(p.ci95.lulaMin, 1)} a ${pc(p.ci95.lulaMax, 1)} para Lula.</small>
   </article>

   <article class="cv-card">
    <span class="cv-k">Votos por Abrir</span>
    <div class="cv-pair"><b>${num(p.remainingVotes)}</b> <span class="cv-muted">em aberto</span></div>
    <small>Maiores contingentes faltantes: ${topRemUfs || '—'}.</small>
   </article>
  `;
}

let chartGeo = null;
function renderChart(d) {
  const el = $('#pj-chart');
  if (!el) return;

  const hist = d?.history || [];
  if (hist.length < 2) {
    el.innerHTML = '<p class="pj-empty">O gráfico temporal se forma automaticamente conforme as cargas do TSE chegam.</p>';
    return;
  }

  const W = Math.max(300, Math.round(el.clientWidth)), H = Math.max(200, Math.round(el.clientHeight));
  const m = {l: 40, r: 40, t: 14, b: 26};

  const x0 = Math.floor(Math.min(...hist.map(p => p.progress)) / 5) * 5;
  const x1 = Math.min(100, Math.ceil(Math.max(...hist.map(p => p.progress), x0 + 15) / 5) * 5);

  const vals = [];
  hist.forEach(h => {
    vals.push(h.lulaPct, h.flavioPct, h.lulaMin, h.lulaMax);
  });
  const yMin = Math.max(35, Math.floor(Math.min(...vals) - 1));
  const yMax = Math.min(65, Math.ceil(Math.max(...vals) + 1));

  const X = p => m.l + (p - x0) / (x1 - x0 || 1) * (W - m.l - m.r);
  const Y = v => m.t + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - m.t - m.b);

  chartGeo = {W, H, m, x0, x1, yMin, yMax, X, Y, hist};

  let grid = '';
  // Grade horizontal
  for (let y = Math.ceil(yMin / 2) * 2; y <= yMax; y += 2) {
    const isMid = y === 50;
    grid += `<line class="cv-grid ${isMid ? 'cv-mid' : ''}" x1="${m.l}" x2="${W - m.r}" y1="${Y(y)}" y2="${Y(y)}"/><text class="cv-ax" x="${m.l - 6}" y="${Y(y) + 3.5}" text-anchor="end">${y}%</text>`;
  }

  // Grade vertical (% apurado)
  const stepX = (x1 - x0) <= 20 ? 5 : (x1 - x0) <= 50 ? 10 : 20;
  for (let x = Math.ceil(x0 / stepX) * stepX; x <= x1; x += stepX) {
    grid += `<line class="cv-tick" x1="${X(x)}" x2="${X(x)}" y1="${m.t}" y2="${H - m.b}"/><text class="cv-ax" x="${X(x)}" y="${H - m.b + 16}" text-anchor="middle">${x}%</text>`;
  }

  // Área sombreada do IC 95%
  let areaD = `M${X(hist[0].progress).toFixed(1)},${Y(hist[0].lulaMax).toFixed(1)}`;
  for (let i = 1; i < hist.length; i++) areaD += `L${X(hist[i].progress).toFixed(1)},${Y(hist[i].lulaMax).toFixed(1)}`;
  for (let i = hist.length - 1; i >= 0; i--) areaD += `L${X(hist[i].progress).toFixed(1)},${Y(hist[i].lulaMin).toFixed(1)}`;
  areaD += 'Z';

  // Linhas projetadas
  let lPath = '', fPath = '';
  hist.forEach((h, idx) => {
    const cmd = idx === 0 ? 'M' : 'L';
    lPath += `${cmd}${X(h.progress).toFixed(1)},${Y(h.lulaPct).toFixed(1)}`;
    fPath += `${cmd}${X(h.progress).toFixed(1)},${Y(h.flavioPct).toFixed(1)}`;
  });

  const last = hist[hist.length - 1];
  const lastLx = X(last.progress);
  const lastLy = Y(last.lulaPct);
  const lastFy = Y(last.flavioPct);

  el.innerHTML = `
   <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolução da projeção de Lula e Flávio">
    <defs>
     <clipPath id="pj-clip"><rect x="${m.l}" y="0" width="${W - m.l - m.r}" height="${H}"/></clipPath>
    </defs>
    ${grid}
    <g clip-path="url(#pj-clip)">
     <path class="pj-ci-area" d="${areaD}"/>
     <path class="cv-line cv-l cv-t2" d="${lPath}"/>
     <path class="cv-line cv-f cv-t2" d="${fPath}"/>
    </g>
    <circle class="cv-dot cv-l" cx="${lastLx}" cy="${lastLy}" r="4"/>
    <circle class="cv-dot cv-f" cx="${lastLx}" cy="${lastFy}" r="4"/>
    <text class="cv-end cv-tl" x="${lastLx + 6}" y="${lastLy + 4}">${pc(last.lulaPct, 1)}</text>
    <text class="cv-end cv-tf" x="${lastLx + 6}" y="${lastFy + 4}">${pc(last.flavioPct, 1)}</text>
    <g id="pj-hover-layer"></g>
    <rect class="cv-hit" x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}"/>
   </svg>
  `;
}

function renderTable() {
  const tbody = $('#pj-table-body');
  if (!tbody || !state.data?.ufs) return;

  let list = [...state.data.ufs];

  // Filtro por região
  if (state.regionFilter !== 'ALL') {
    list = list.filter(u => u.region === state.regionFilter);
  }

  // Ordenação
  const s = state.sortBy;
  list.sort((a, b) => {
    if (s === 'electorate') return (b.electorate || 0) - (a.electorate || 0);
    if (s === 'progressAsc') return (a.progress || 0) - (b.progress || 0);
    if (s === 'progressDesc') return (b.progress || 0) - (a.progress || 0);
    if (s === 'lulaProj') return (b.projected?.lulaPct || 0) - (a.projected?.lulaPct || 0);
    if (s === 'flavioProj') return (b.projected?.flavioPct || 0) - (a.projected?.flavioPct || 0);
    if (s === 'swingLula') return (b.swing || 0) - (a.swing || 0);
    if (s === 'swingFlavio') return (a.swing || 0) - (b.swing || 0);
    return 0;
  });

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="pj-empty">Nenhum estado para o filtro selecionado.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(u => {
    const isLulaLead = u.projected.winner === '13';
    const swingLula = u.swing || 0;
    const swingText = swingLula >= 0
      ? `<span class="red-text">+${pp(swingLula, 2)} Lula</span>`
      : `<span class="blue-text">+${pp(-swingLula, 2)} Flávio</span>`;

    const currentCountText = u.currentVotes.valid > 0
      ? `<span class="red-text"><b>${pc(u.currentVotes.lulaPct, 1)}</b></span> × <span class="blue-text"><b>${pc(u.currentVotes.flavioPct, 1)}</b></span>`
      : `<span class="cv-muted">Sem votos</span>`;

    return `
     <tr>
      <td><strong>${u.uf}</strong></td>
      <td><span class="pj-reg-badge">${u.region}</span></td>
      <td class="ta-r">
       <div class="pj-mini-prog-wrap">
        <span>${pc(u.progress, 1)}</span>
        <div class="pj-mini-prog"><div style="width: ${Math.min(100, u.progress)}%"></div></div>
       </div>
      </td>
      <td class="ta-c">${currentCountText}</td>
      <td class="ta-r"><small>${pc(u.t1.lulaPct, 1)} Lula</small></td>
      <td class="ta-r">${swingText}</td>
      <td class="ta-r">${num(u.remainingVotes)}</td>
      <td class="ta-c">
       <span class="red-text font-bold">${pc(u.projected.lulaPct, 1)}</span> × <span class="blue-text font-bold">${pc(u.projected.flavioPct, 1)}</span>
      </td>
      <td class="ta-c">
       <span class="pj-winner-pill ${isLulaLead ? 'red' : 'blue'}">
        ${isLulaLead ? 'Lula' : 'Flávio'} +${pp(u.projected.marginPct, 1)}
       </span>
      </td>
     </tr>
    `;
  }).join('');
}

function render() {
  if (!$('#projecao-page')) return;

  // Atualiza botões selecionados
  document.querySelectorAll('[data-pj-m]').forEach(b => b.classList.toggle('selected', b.dataset.pjM === state.method));

  const d = state.data;
  const statusEl = $('#pj-status-text');
  if (statusEl) {
    statusEl.textContent = state.error
      ? `⚠ ${state.error}`
      : d
        ? `Atualizado às ${new Date(d.updatedAt).toLocaleTimeString('pt-BR', {timeZone: 'America/Sao_Paulo'})}`
        : '';
  }

  const sub = $('#pj-sub');
  if (sub) {
    if (state.method === 'bayesian') sub.textContent = 'Modelo preditivo estratificado por estado e região com regularização Bayesiana de swing.';
    else if (state.method === 't1_remainder') sub.textContent = 'Modelo conservador: votos faltantes de cada UF votam exatamente como no 1º turno.';
    else sub.textContent = 'Extrapolação direta: mantém para o restante de cada UF a proporção exata observada até agora.';
  }

  if (!d) return;

  renderHero(d);
  renderCards(d);
  renderChart(d);
  renderTable();
}

async function load(force = false) {
  if (state.loading && !force) return;
  state.loading = true;
  const refreshBtn = $('#pj-refresh-btn');
  if (refreshBtn) refreshBtn.classList.add('loading');

  try {
    const res = await fetch(`/api/projecao?method=${state.method}&_t=${Date.now()}`, {cache: 'no-store'});
    if (!res.ok) throw Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.data = data;
    state.error = null;
  } catch (err) {
    state.error = err.message;
  } finally {
    state.loading = false;
    if (refreshBtn) refreshBtn.classList.remove('loading');
  }

  if (active()) render();
}

const active = () => location.hash === '#projecao';
function route() {
  const on = active();
  document.body.classList.toggle('projecao-view', on);
  const page = $('#projecao-page');
  if (page) page.hidden = !on;
  if (on) {
    document.querySelectorAll('nav a').forEach(a => a.classList.toggle('current', a.hash === '#projecao'));
    render();
    if (!state.data || Date.now() - (state.data.updatedAt || 0) > 8000) load();
  }
}

inject();
let lastSize = '';
new ResizeObserver(([e]) => {
  const s = `${Math.round(e.contentRect.width)}x${Math.round(e.contentRect.height)}`;
  if (s !== lastSize) {
    lastSize = s;
    if (active() && state.data) renderChart(state.data);
  }
}).observe($('#pj-chart'));

window.addEventListener('hashchange', route);
route();
load();
setInterval(() => {
  if (active() && !document.hidden) load();
}, 12000);
