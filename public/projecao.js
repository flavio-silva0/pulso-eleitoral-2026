// Aba 04 · Projeção Estatística ao Vivo do Segundo Turno Presidencial.
// Mostrador velocímetro (pt-dial), 4 cartões comparativos (ptb), barra hachurada
// de margem de erro (pt-mg-barra) e motor Logit Swing Municipal integrado à identidade Pulso Eleitoral.
const $ = s => document.querySelector(s);
const nf = d => new Intl.NumberFormat('pt-BR', {minimumFractionDigits: d, maximumFractionDigits: d});
const N0 = new Intl.NumberFormat('pt-BR');
const N1 = nf(1), N2 = nf(2);
const pc = (v, d = 2) => v == null || !Number.isFinite(v) ? '—' : (d === 1 ? N1 : N2).format(v) + '%';
const pp = (v, d = 2) => v == null || !Number.isFinite(v) ? '—' : (d === 1 ? N1 : N2).format(Math.abs(v)) + ' p.p.';
const num = v => v == null || !Number.isFinite(v) ? '—' : N0.format(Math.round(v));

const state = {
  method: 'logit',
  regionFilter: 'ALL',
  sortBy: 'electorate',
  data: null,
  loading: false,
  error: null,
  hoverPoint: null,
  nextRefreshSec: 5
};

try {
  const saved = JSON.parse(localStorage.getItem('pulso-projecao') || '{}');
  if (saved.method && ['logit', 'bayesian', 't1_remainder', 'direct'].includes(saved.method)) {
    state.method = saved.method;
  }
  if (saved.sortBy) state.sortBy = saved.sortBy;
} catch {}
const save = () => {
  try {
    localStorage.setItem('pulso-projecao', JSON.stringify({method: state.method, sortBy: state.sortBy}));
  } catch {}
};

// Geometria exata do velocímetro (pt-dial)
const Ze = 150, Ye = 150, me = 132, Ne = 104;
function Je(r, frac) {
  const w = Math.PI * (1 + frac);
  return [Ze + r * Math.cos(w), Ye + r * Math.sin(w)];
}
function Di(f0, f1) {
  const [w, h] = Je(me, f0);
  const [L, O] = Je(me, f1);
  const [W, q] = Je(Ne, f1);
  const [d, A] = Je(Ne, f0);
  const M = v => v.toFixed(2);
  return `M${M(w)},${M(h)} A${me},${me} 0 0 1 ${M(L)},${M(O)} L${M(W)},${M(q)} A${Ne},${Ne} 0 0 0 ${M(d)},${M(A)} Z`;
}
function Gf(f0, f1, rIn, rOut) {
  const [O, W] = Je(rOut, f0);
  const [q, A] = Je(rOut, f1);
  const [M, J] = Je(rIn, f1);
  const [N, H] = Je(rIn, f0);
  const S = v => v.toFixed(2);
  const large = f1 - f0 > 1 ? 1 : 0;
  return `M${S(O)},${S(W)} A${rOut},${rOut} 0 ${large} 1 ${S(q)},${S(A)} L${S(M)},${S(J)} A${rIn},${rIn} 0 ${large} 0 ${S(N)},${S(H)} Z`;
}
const cp = pos => (Math.max(0, Math.min(1, pos)) - 0.5) * 180;

// Mostrador fixo da demonstração após encerramento.
function updateNeedleTremorSpec() {}

function inject() {
  const html = `
  <section id="projecao-page" class="projecao-page" hidden aria-labelledby="pj-title">
   <div class="pj-head">
    <div>
     <span class="pj-eyebrow">MODELO DESENVOLVIDO · DEMONSTRAÇÃO · ELEIÇÃO ENCERRADA</span>
     <h2 id="pj-title">Projeção estatística</h2>
     <p class="pj-sub" id="pj-sub">Modelo logit original, nesta demonstração com a alternativa por UF e dados arquivados após a eleição.</p>
    </div>
    <p class="pj-sub">Modelo desenvolvido por Flavio Silva. Demonstração recalculada com os resultados arquivados das 27 UFs, sem o exterior. Não é uma previsão registrada durante a apuração; a votação oficial está na aba Resultados. O método logit usa aqui a alternativa por UF do motor original.</p>
    <div class="pj-controls">
     <div class="pj-seg" role="group" aria-label="Método de projeção">
      <button data-pj-m="logit" title="Regressão ponderada em escala logit sobre os municípios apurados com variância clusterizada">Logit Municipal</button>
      <button data-pj-m="bayesian" title="Modelo estratificado por UF com ajuste de swing e encolhimento Bayesiano">Estratificado UF</button>
      <button data-pj-m="t1_remainder" title="Aplica o resultado exato do 1º turno aos votos ainda não apurados">1º Turno no restante</button>
      <button data-pj-m="direct" title="Extrapola a proporção atual observada em cada UF">Extrapolação direta</button>
     </div>
     <button id="pj-refresh-btn" class="pj-refresh-btn" title="Recarregar demonstração arquivada">↻ Recarregar arquivo</button>
    </div>
   </div>

   <!-- Grid Principal de 2 Colunas no Desktop: Mostrador à esquerda + Cards e Evolução à direita -->
   <div class="pj-top-grid">
    <!-- Coluna Esquerda: Card Velocímetro Principal -->
    <div id="pj-hero" class="pj-hero">
     <div class="pj-loading">Carregando demonstração preservada…</div>
    </div>

    <!-- Coluna Direita: 3 KPIs + Gráfico Histórico da Projeção -->
    <div class="pj-right-stack">
     <div id="pj-cards" class="pj-cards"></div>

     <div class="pj-panel pj-chart-panel">
      <div class="pj-panel-head">
       <div>
        <span class="pj-panel-eyebrow">REGISTRO DO MODELO</span>
        <h3 class="pj-panel-title">Evolução da Projeção · Logit</h3>
        <p class="pj-panel-desc">406 registros recuperados do deployment original · 25/out, 19h02–22h45 (Brasília). A série Logit permanece a mesma ao alternar os métodos do mostrador.</p>
       </div>
       <div class="pj-chart-legend">
        <span><i class="pj-sw pj-l"></i>Lula (Projetado)</span>
        <span><i class="pj-sw pj-f"></i>Flávio (Projetado)</span>
        <span><span class="pj-ci-sample"></span>Faixa reconstruída</span>
        <span id="pj-status-text" class="pj-status-text"></span>
       </div>
      </div>
      <p class="pj-panel-desc">A API antiga ajustava a curva à última estimativa e reconstruía a faixa de incerteza. O gráfico preserva essa saída; sua cobertura termina em 94,45% das seções.</p>
      <div id="pj-chart" class="pj-chart"><p class="pj-empty">Carregando histórico da projeção…</p></div>
      <div id="pj-chart-tip" class="cv-tip" hidden></div>
     </div>
    </div>
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
      <strong>1. Deslocamento em Escala Logit (Logit Swing)</strong>
      <p>Para cada município com urnas abertas no 2º turno, o modelo calcula a diferença em escala log-odds (logit) entre a votação atual e a votação observada naquele mesmo município no 1º turno.</p>
     </article>
     <article>
      <strong>2. Reponderação pelo Universo Nacional</strong>
      <p>O deslocamento médio ponderado é aplicado de volta à distribuição completa dos 5.570 municípios brasileiros do 1º turno, buscando reduzir o viés de estados ou cidades que apuram mais cedo.</p>
     </article>
     <article>
      <strong>3. Variância Sanduíche e Sombra de Incerteza</strong>
      <p>O erro-padrão combina a dispersão observada entre municípios com a fração de votos ainda não apurados. A sombra no mostrador equivale ao intervalo de 99% (±2,58 desvios) segundo os parâmetros do modelo original.</p>
     </article>
     <article>
      <strong>4. Critério para Cravar Resultado</strong>
      <p>Enquanto a sombra da margem de erro atravessar a linha central de 50%, a disputa permanece como resultado ainda indefinido. Quando toda a sombra sai da linha do meio, a projeção crava o vencedor.</p>
     </article>
    </div>
   </div>
  </section>`;

  const footer = document.querySelector('main > .app-footer');
  if (footer) footer.insertAdjacentHTML('beforebegin', html);
  else document.querySelector('main').insertAdjacentHTML('beforeend', html);

  const page = $('#projecao-page');
  page.addEventListener('click', e => {
    const btnMethod = e.target.closest('[data-pj-m]');
    if (btnMethod) {
      state.method = btnMethod.dataset.pjM;
      save();
      load(true);
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

  // Interação de hover no gráfico histórico
  const chart = $('#pj-chart');
  if (chart) {
    chart.addEventListener('pointermove', onChartMove);
    chart.addEventListener('pointerleave', () => {
      const tip = $('#pj-chart-tip');
      if (tip) tip.hidden = true;
      const hl = $('#pj-hover-layer');
      if (hl) hl.innerHTML = '';
    });
  }
}

function getSombraPaths(p) {
  const div = p.div || {};
  const loS = Math.max(0, Math.min(100, div.loS ?? p.ci95?.flavioMin ?? 45)) / 100;
  const hiS = Math.max(0, Math.min(100, div.hiS ?? p.ci95?.flavioMax ?? 55)) / 100;
  const lo50 = Math.max(loS, Math.min(hiS, (div.lo50 ?? (p.flavioPct - 1)) / 100));
  const hi50 = Math.max(lo50, Math.min(hiS, (div.hi50 ?? (p.flavioPct + 1)) / 100));

  const outerD = (hiS - loS > 0.0005) ? Gf(loS, hiS, Ne - 9, me + 4) : '';
  const innerD = (hi50 - lo50 > 0.0005) ? Gf(lo50, hi50, Ne - 9, me + 4) : '';
  return { outerD, innerD };
}

function buildDialSvg(p) {
  const div = p.div || {};
  const pos = div.pos != null ? div.pos : (p.flavioPct / 100);
  const { outerD, innerD } = getSombraPaths(p);

  const bands = [
    [0.00, 0.30, 'var(--pe)', 0.95],
    [0.30, 0.40, 'var(--pe)', 0.60],
    [0.40, 0.50, 'var(--pe)', 0.30],
    [0.50, 0.60, 'var(--pd)', 0.30],
    [0.60, 0.70, 'var(--pd)', 0.60],
    [0.70, 1.00, 'var(--pd)', 0.95]
  ];

  const arcsHtml = bands
    .map(([a, b, col, op]) => `<path d="${Di(a, b)}" style="fill:${col}" fill-opacity="${op}"/>`)
    .join('');

  const tickLine = (frac, cls, r1, r2) => {
    const [x1, y1] = Je(r1, frac);
    const [x2, y2] = Je(r2, frac);
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="${cls}"/>`;
  };
  const tickLabel = (frac, text) => {
    const deg = Math.min(frac, 1 - frac) * 180;
    const inside = deg >= 22 && deg <= 56;
    const [x, y] = Je(inside ? Ne - 15 : me + 11, frac);
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="pt-tick-rot${inside ? ' dentro' : ''}">${text}</text>`;
  };

  const ticksHtml =
    tickLine(0.30, 'pt-tick', me - 6, me + 3) +
    tickLine(0.70, 'pt-tick', me - 6, me + 3) +
    tickLine(0.40, 'pt-tick', me - 6, me + 3) +
    tickLine(0.60, 'pt-tick', me - 6, me + 3) +
    tickLine(0.50, 'pt-divisa', Ne - 6, me + 6);

  const labelsHtml =
    tickLabel(0.30, 70) +
    tickLabel(0.70, 70) +
    tickLabel(0.40, 60) +
    tickLabel(0.60, 60) +
    tickLabel(0.50, 50);

  const angleDeg = cp(pos).toFixed(2);
  const ariaLabel = `Lula ${pc(p.lulaPct, 1)}, Flavio Bolsonaro ${pc(p.flavioPct, 1)} dos votos válidos.`;

  return `<svg viewBox="-14 0 328 162" class="pt-dial" role="img" aria-label="${ariaLabel}">
    ${arcsHtml}
    <path id="pt-sombra-outer" d="${outerD}" class="pt-sombra"/>
    <path id="pt-sombra-inner" d="${innerD}" class="pt-sombra forte"/>
    ${ticksHtml}
    ${labelsHtml}
    <g class="pt-agulha" style="transform: rotate(${angleDeg}deg)">
      <line x1="${Ze}" y1="${Ye}" x2="${Ze}" y2="${Ye - 118}"/>
      <circle cx="${Ze}" cy="${Ye}" r="8"/>
    </g>
  </svg>`;
}

function renderHero(d) {
  const hero = $('#pj-hero');
  if (!hero || !d?.projection) return;

  const p = d.projection;
  const c = d.current;
  const natP = d.natProgress || 0;
  const ci = p.ci95 || {};
  const div = p.div || {};

  const dt = new Date(d.updatedAt || Date.now());
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  const hourStr = `${hh}h${mm}`;

  const lulaMin = Math.max(0, Math.min(100, ci.lulaMin ?? p.lulaPct));
  const lulaMax = Math.max(lulaMin, Math.min(100, ci.lulaMax ?? p.lulaPct));
  const flavioMin = Math.max(0, Math.min(100, ci.flavioMin ?? p.flavioPct));
  const flavioMax = Math.max(flavioMin, Math.min(100, ci.flavioMax ?? p.flavioPct));

  const barLeft = lulaMin;
  const barMid = Math.max(0, lulaMax - lulaMin);
  const barRight = Math.max(0, 100 - lulaMax);

  updateNeedleTremorSpec(p);

  // Se o card .ponteiro já está montado, atualiza in-place para manter transições suaves ao vivo!
  const existing = hero.querySelector('.ponteiro');
  if (existing) {
    const setTxt = (sel, txt) => {
      const el = existing.querySelector(sel);
      if (el && el.textContent !== txt) el.textContent = txt;
    };
    setTxt('[data-pj-bind="natPct"]', pc(natP, 2));
    setTxt('[data-pj-bind="hourStr"]', hourStr);
    setTxt('[data-pj-bind="lulaProjPct"]', pc(p.lulaPct, 2));
    setTxt('[data-pj-bind="lulaProjVotes"]', `${num(p.lulaVotes)} votos`);
    setTxt('[data-pj-bind="flavioProjPct"]', pc(p.flavioPct, 2));
    setTxt('[data-pj-bind="flavioProjVotes"]', `${num(p.flavioVotes)} votos`);
    setTxt('[data-pj-bind="oficialRotL"]', `Dados arquivados · 27 UFs`);
    setTxt('[data-pj-bind="oficialRotF"]', `Dados arquivados · 27 UFs`);
    setTxt('[data-pj-bind="lulaOficialPct"]', pc(c.lulaPct, 2));
    setTxt('[data-pj-bind="lulaOficialVotes"]', `${num(c.lulaVotes)} votos`);
    setTxt('[data-pj-bind="flavioOficialPct"]', pc(c.flavioPct, 2));
    setTxt('[data-pj-bind="flavioOficialVotes"]', `${num(c.flavioVotes)} votos`);
    setTxt('[data-pj-bind="mgLula"]', `${N1.format(lulaMin)}% a ${N1.format(lulaMax)}%`);
    setTxt('[data-pj-bind="mgFlavio"]', `${N1.format(flavioMin)}% a ${N1.format(flavioMax)}%`);
    setTxt('[data-pj-bind="statusRot"]', p.status);
    setTxt('[data-pj-bind="statusSub"]', p.statusSub || 'A projeção ainda não crava um resultado nesta disputa.');
    setTxt('[data-pj-bind="avSelo"]', p.cravado ? '✓' : '···');

    const avisoEl = existing.querySelector('.tv-aviso');
    if (avisoEl) {
      avisoEl.classList.toggle('definido', !!p.cravado);
      avisoEl.classList.toggle('indefinido', !p.cravado);
    }

    const barL = existing.querySelector('[data-pj-bar="left"]');
    const barM = existing.querySelector('[data-pj-bar="mid"]');
    const barR = existing.querySelector('[data-pj-bar="right"]');
    if (barL) barL.style.width = `${barLeft.toFixed(2)}%`;
    if (barM) barM.style.width = `${barMid.toFixed(2)}%`;
    if (barR) barR.style.width = `${barRight.toFixed(2)}%`;

    const { outerD, innerD } = getSombraPaths(p);
    const outerEl = existing.querySelector('#pt-sombra-outer');
    const innerEl = existing.querySelector('#pt-sombra-inner');
    if (outerEl) outerEl.setAttribute('d', outerD);
    if (innerEl) innerEl.setAttribute('d', innerD);

    const pos = div.pos != null ? div.pos : (p.flavioPct / 100);
    const needle = existing.querySelector('.pt-agulha');
    if (needle) needle.style.transform = `rotate(${cp(pos).toFixed(2)}deg)`;
    return;
  }

  const dialSvg = buildDialSvg(p);
  const sombraTooltip =
    'A sombra é a margem em que a projeção ainda pode mudar de lado: definida pelos parâmetros do modelo original, e se estreita conforme as urnas chegam. Quando ela sai da linha do meio, a projeção crava o resultado; a parte mais escura é o mais provável.';

  hero.innerHTML = `
   <div class="ponteiro com-duelo" style="--pe:#dc2626;--pd:#2563eb">
    <!-- Topo: % das seções apuradas e AO VIVO -->
    <div class="pt-cabeca pt-andamento">
     <span class="pt-pct"><b class="num" data-pj-bind="natPct">${pc(natP, 2)}</b> das seções apuradas</span>
     <span class="pt-and-dir">
      <span class="pill">Demonstração</span>
      <span class="pt-hora" data-pj-bind="hourStr" title="Hora da última totalização do TSE">${hourStr}</span>
     </span>
    </div>

    <!-- Mostrador: candidatos + fotos + dial SVG -->
    <div class="ptd-mostrador">
     <div class="ptd-cand esq com-selo" style="--c:#dc2626">
      <div class="ptd-nome"><span class="fav-cand">★</span> Lula</div>
      <div class="partido">PT · 13</div>
      <div class="ptd-selo"></div>
      <img src="/lula.webp" alt="Lula" class="foto ptd-foto">
     </div>

     <div class="ptd-cand dir com-selo" style="--c:#2563eb">
      <div class="ptd-nome"><span class="fav-cand">★</span> Flavio Bolsonaro</div>
      <div class="partido">PL · 22</div>
      <div class="ptd-selo"></div>
      <img src="/bolsonaro.webp" alt="Flavio Bolsonaro" class="foto ptd-foto">
     </div>

     ${dialSvg}
    </div>

    <!-- Legenda de agulha "projeção" abaixo do pivô -->
    <div class="pt-legenda" title="${sombraTooltip}">
     <span class="ptl-i">
      <svg class="ptl-agulha" viewBox="0 0 16 16" aria-hidden="true">
       <line x1="7.5" y1="13.5" x2="10" y2="2.5"/>
       <circle cx="7.5" cy="13.5" r="2.4"/>
      </svg>projeção
     </span>
    </div>

    <!-- 4 Boxes Comparativos (Projeção para o fim vs Apuração oficial às HHhMM) -->
    <div class="ptb" role="group" aria-label="Números de Lula (à esquerda) e Flavio Bolsonaro (à direita)">
     <div class="ptb-cx pj esq" style="--c:#dc2626">
      <span class="ptb-rot">Projeção para o fim</span>
      <b class="ptb-pct num" data-pj-bind="lulaProjPct">${pc(p.lulaPct, 2)}</b>
      <span class="ptb-vt" data-pj-bind="lulaProjVotes">${num(p.lulaVotes)} votos</span>
     </div>
     <div class="ptb-cx pj dir" style="--c:#2563eb">
      <span class="ptb-rot">Projeção para o fim</span>
      <b class="ptb-pct num" data-pj-bind="flavioProjPct">${pc(p.flavioPct, 2)}</b>
      <span class="ptb-vt" data-pj-bind="flavioProjVotes">${num(p.flavioVotes)} votos</span>
     </div>
     <div class="ptb-cx ag esq">
      <span class="ptb-rot" data-pj-bind="oficialRotL">Dados arquivados · 27 UFs</span>
      <b class="ptb-pct num" data-pj-bind="lulaOficialPct">${pc(c.lulaPct, 2)}</b>
      <span class="ptb-vt" data-pj-bind="lulaOficialVotes">${num(c.lulaVotes)} votos</span>
     </div>
     <div class="ptb-cx ag dir">
      <span class="ptb-rot" data-pj-bind="oficialRotF">Dados arquivados · 27 UFs</span>
      <b class="ptb-pct num" data-pj-bind="flavioOficialPct">${pc(c.flavioPct, 2)}</b>
      <span class="ptb-vt" data-pj-bind="flavioOficialVotes">${num(c.flavioVotes)} votos</span>
     </div>
    </div>

    <!-- Margem de erro (barra tripartida com hachura central) -->
    <div class="pt-chances pt-margem" role="group" aria-label="Margem de erro">
     <div class="pt-ch-topo"><span>Margem de erro</span></div>
     <div class="pt-mg-barra">
      <div class="pt-ch-barra">
       <i data-pj-bar="left" style="width:${barLeft.toFixed(2)}%;background:var(--pe)"></i>
       <i data-pj-bar="mid" class="meio" style="width:${barMid.toFixed(2)}%"></i>
       <i data-pj-bar="right" style="width:${barRight.toFixed(2)}%;background:var(--pd)"></i>
      </div>
      <i class="pt-mg-50" aria-hidden="true"></i>
     </div>
     <div class="pt-ch-itens dois">
      <span class="esq">
       <b class="num mg" data-pj-bind="mgLula">${N1.format(lulaMin)}% a ${N1.format(lulaMax)}%</b>
       <span class="txt">Lula</span>
      </span>
      <span class="dir">
       <b class="num mg" data-pj-bind="mgFlavio">${N1.format(flavioMin)}% a ${N1.format(flavioMax)}%</b>
       <span class="txt">Flavio Bolsonaro</span>
      </span>
     </div>
    </div>

    <!-- Aviso de status (Resultado ainda indefinido / Resultado projetado) -->
    <div class="pt-aviso-slot">
     <div class="tv-aviso ${p.cravado ? 'definido' : 'indefinido'}">
      <div class="av-selo" data-pj-bind="avSelo">${p.cravado ? '✓' : '···'}</div>
      <div>
       <span class="av-rot" data-pj-bind="statusRot">${p.status}</span>
       <span data-pj-bind="statusSub">${p.statusSub || 'A projeção ainda não crava um resultado nesta disputa.'}</span>
      </div>
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

  const ufsByRemaining = [...(d.ufs || [])].sort((a, b) => (b.remainingVotes || 0) - (a.remainingVotes || 0));
  const topRemUfs = ufsByRemaining.slice(0, 3).map(u => `${u.uf} (${num(u.remainingVotes)})`).join(', ');

  cards.innerHTML = `
   <article class="cv-card">
    <span class="cv-k">Líder na Projeção</span>
    <div class="cv-pair"><b class="${leadLula ? 'cv-tl' : 'cv-tf'}">${leadLula ? 'Lula' : 'Flávio'}</b> <span>${pc(leadLula ? p.lulaPct : p.flavioPct, 2)}</span></div>
    <small>Chance estimada pelo modelo: <b>${pc(leadLula ? p.probability.lula : p.probability.flavio, 1)}</b> (${p.div?.nUnits || 27} unidades analisadas).</small>
   </article>

   <article class="cv-card">
    <span class="cv-k">Diferença Projetada</span>
    <div class="cv-pair"><b class="${leadLula ? 'cv-tl' : 'cv-tf'}">+${pp(marginPp, 2)}</b> <span>${num(marginV)} votos</span></div>
    <small>Margem de erro Lula: de ${pc(p.ci95.lulaMin, 1)} a ${pc(p.ci95.lulaMax, 1)}.</small>
   </article>

   <article class="cv-card">
    <span class="cv-k">Votos Válidos por Abrir</span>
    <div class="cv-pair"><b>${num(p.remainingVotes)}</b> <span class="cv-muted">restantes</span></div>
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
    el.innerHTML = '<p class="pj-empty">Sem série histórica de projeções preservada. O mostrador acima apresenta uma demonstração recalculada com os dados arquivados.</p>';
    return;
  }

  const W = Math.max(300, Math.round(el.clientWidth)), H = Math.max(220, Math.round(el.clientHeight));
  const m = {l: 40, r: 44, t: 14, b: 26};

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
  for (let y = Math.ceil(yMin / 2) * 2; y <= yMax; y += 2) {
    const isMid = y === 50;
    grid += `<line class="cv-grid ${isMid ? 'cv-mid' : ''}" x1="${m.l}" x2="${W - m.r}" y1="${Y(y)}" y2="${Y(y)}"/><text class="cv-ax" x="${m.l - 6}" y="${Y(y) + 3.5}" text-anchor="end">${y}%</text>`;
  }

  const stepX = (x1 - x0) <= 20 ? 5 : (x1 - x0) <= 50 ? 10 : 20;
  for (let x = Math.ceil(x0 / stepX) * stepX; x <= x1; x += stepX) {
    grid += `<line class="cv-tick" x1="${X(x)}" x2="${X(x)}" y1="${m.t}" y2="${H - m.b}"/><text class="cv-ax" x="${X(x)}" y="${H - m.b + 16}" text-anchor="middle">${x}%</text>`;
  }

  let areaD = `M${X(hist[0].progress).toFixed(1)},${Y(hist[0].lulaMax).toFixed(1)}`;
  for (let i = 1; i < hist.length; i++) areaD += `L${X(hist[i].progress).toFixed(1)},${Y(hist[i].lulaMax).toFixed(1)}`;
  for (let i = hist.length - 1; i >= 0; i--) areaD += `L${X(hist[i].progress).toFixed(1)},${Y(hist[i].lulaMin).toFixed(1)}`;
  areaD += 'Z';

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

function onChartMove(e) {
  if (!chartGeo || !chartGeo.hist?.length) return;
  const el = $('#pj-chart');
  const tip = $('#pj-chart-tip');
  const hl = $('#pj-hover-layer');
  if (!el || !tip || !hl) return;

  const rect = el.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const {W, H, m, x0, x1, X, Y, hist} = chartGeo;
  const targetProg = x0 + ((px - m.l) / Math.max(1, W - m.l - m.r)) * (x1 - x0);

  let best = hist[0];
  let bestDist = Math.abs(best.progress - targetProg);
  for (const pt of hist) {
    const d = Math.abs(pt.progress - targetProg);
    if (d < bestDist) {
      best = pt;
      bestDist = d;
    }
  }

  const cx = X(best.progress);
  const ly = Y(best.lulaPct);
  const fy = Y(best.flavioPct);

  hl.innerHTML = `
    <line class="cv-guide" x1="${cx}" x2="${cx}" y1="${m.t}" y2="${H - m.b}"/>
    <circle class="cv-hdot cv-l" cx="${cx}" cy="${ly}" r="4.5"/>
    <circle class="cv-hdot cv-f" cx="${cx}" cy="${fy}" r="4.5"/>
  `;

  const dt = new Date(best.t || Date.now());
  const timeStr = dt.toLocaleTimeString('pt-BR', {timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit'});

  tip.innerHTML = `
    <div class="cv-th">${pc(best.progress, 2)} apurado · ${timeStr}</div>
    <div class="cv-trow cv-thd"><span>Candidato</span><span>Projetado</span><span>Oficial</span></div>
    <div class="cv-trow"><span class="cv-tn"><i class="cv-sw cv-l"></i>Lula</span><span class="cv-tl">${pc(best.lulaPct, 2)}</span><span>${pc(best.rawLulaPct, 2)}</span></div>
    <div class="cv-trow"><span class="cv-tn"><i class="cv-sw cv-f"></i>Flávio</span><span class="cv-tf">${pc(best.flavioPct, 2)}</span><span>${pc(best.rawFlavioPct, 2)}</span></div>
    <div class="cv-tdiff">Faixa reconstruída Lula: <b>${pc(best.lulaMin, 1)} a ${pc(best.lulaMax, 1)}</b></div>
  `;
  tip.hidden = false;

  const tipW = 230;
  const left = px + 16 + tipW > W ? Math.max(8, px - tipW - 12) : px + 14;
  tip.style.left = `${left}px`;
  tip.style.top = '48px';
}

function renderTable() {
  const tbody = $('#pj-table-body');
  if (!tbody || !state.data?.ufs) return;

  let list = [...state.data.ufs];

  if (state.regionFilter !== 'ALL') {
    list = list.filter(u => u.region === state.regionFilter);
  }

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

  document.querySelectorAll('[data-pj-m]').forEach(b => b.classList.toggle('selected', b.dataset.pjM === state.method));

  const d = state.data;
  const statusEl = $('#pj-status-text');
  if (statusEl) {
    statusEl.textContent = state.error
      ? `⚠ ${state.error}`
      : d
        ? `Histórico recuperado · captura às ${new Date(d.historyRecovery?.recoveredAt || d.checkedAt || d.updatedAt).toLocaleTimeString('pt-BR', {timeZone: 'America/Sao_Paulo'})}`
        : '';
  }

  const sub = $('#pj-sub');
  if (sub) {
    if (state.method === 'logit') sub.textContent = 'Modelo logit original, nesta demonstração com a alternativa por UF e dados arquivados após a eleição.';
    else if (state.method === 'bayesian') sub.textContent = 'Modelo preditivo estratificado por estado e região com regularização Bayesiana de swing.';
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
  state.nextRefreshSec = 5;
  const refreshBtn = $('#pj-refresh-btn');
  if (refreshBtn) refreshBtn.classList.add('loading');

  try {
    const res = await fetch(`/api/projecao?method=${state.method}`, {cache: 'no-store'});
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
    if (!state.data) load();
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
