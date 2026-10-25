import { readFile } from 'node:fs/promises';

// Macro regiões do Brasil para cálculo de swing regional
export const REGIONS = {
  Norte: ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO'],
  Nordeste: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
  Sudeste: ['ES', 'MG', 'RJ', 'SP'],
  Sul: ['PR', 'RS', 'SC'],
  CentroOeste: ['DF', 'GO', 'MT', 'MS']
};

export const UF_TO_REGION = {};
for (const reg in REGIONS) {
  for (const uf of REGIONS[reg]) UF_TO_REGION[uf] = reg;
}

let t1Baseline = null;
export async function getT1Baseline() {
  if (t1Baseline) return t1Baseline;
  try {
    const raw = await readFile(new URL('../public/municipios.json', import.meta.url), 'utf8');
    const munData = JSON.parse(raw);
    const byUf = {};
    for (const uf in munData) {
      let lula = 0, bolsonaro = 0, validos = 0, eleitorado = 0;
      for (const m of munData[uf]) {
        lula += Number(m.lula || 0);
        bolsonaro += Number(m.bolsonaro || 0);
        validos += Number(m.validos || 0);
        eleitorado += Number(m.eleitorado || 0);
      }
      const s = lula + bolsonaro;
      byUf[uf] = {
        lula,
        bolsonaro,
        validos,
        eleitorado,
        h2hLula: s > 0 ? lula / s : 0.5,
        h2hBolsonaro: s > 0 ? bolsonaro / s : 0.5
      };
    }
    t1Baseline = byUf;
    return t1Baseline;
  } catch (err) {
    console.error('Erro ao carregar baseline do 1º turno:', err.message);
    return {};
  }
}

let t1MunCache = null;
let t2LiveCache = { m2: null, br: null, fetchedAt: 0 };

export async function getApuraLogoMunData(fetchLive = true) {
  if (!t1MunCache) {
    try {
      const raw = await readFile(new URL('./apuralogo-t1-mun.json', import.meta.url), 'utf8');
      const m1 = JSON.parse(raw);
      if (m1 && Array.isArray(m1.chaves) && m1.cols) {
        t1MunCache = {
          m1,
          idx1: new Map(m1.chaves.map((k, i) => [k, i]))
        };
      }
    } catch {}
  }
  if (!fetchLive || !t1MunCache) return null;

  const now = Date.now();
  if (!t2LiveCache.m2 || now - t2LiveCache.fetchedAt > 3500) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4500);
      const tBucket = Math.floor(now / 5000);
      const [resMun, resBr] = await Promise.all([
        fetch(`https://dados.apuralogo.com.br/feed/6258/1/br-mun.json?t=${tBucket}`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' }
        }).catch(() => null),
        fetch(`https://dados.apuralogo.com.br/feed/6258/1/br.json?t=${tBucket}`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' }
        }).catch(() => null)
      ]);
      clearTimeout(timer);

      if (resMun?.ok) {
        const m2 = await resMun.json();
        if (m2 && Array.isArray(m2.chaves) && m2.cols) {
          t2LiveCache.m2 = m2;
          t2LiveCache.fetchedAt = now;
        }
      }
      if (resBr?.ok) {
        const br = await resBr.json();
        if (br && br.br) {
          t2LiveCache.br = br;
        }
      }
    } catch {}
  }

  if (!t2LiveCache.m2) return null;
  return {
    m1: t1MunCache.m1,
    idx1: t1MunCache.idx1,
    m2: t2LiveCache.m2,
    brFeed: t2LiveCache.br
  };
}

// Funções matemáticas de Logit Swing (modelo Jo, L0, Zo, gd, F0)
const logit = p => Math.log(p / (1 - p));
const sigmoid = x => 1 / (1 + Math.exp(-x));
const clampP = p => Math.min(0.999, Math.max(0.001, p));

// Função de erro normal de Gauss para probabilidade de vitória
function erf(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return sign * y;
}

export function normalCdf(x, mean = 0, std = 1) {
  if (x === mean) return 0.5;
  if (std <= 0) return x >= mean ? 1 : 0;
  return 0.5 * (1 + erf((x - mean) / (std * Math.SQRT2)));
}

// Modelo de regressão ponderada em escala logit com variância sanduíche clusterizada
export function runLogitSwingEngine(obsSwings, baselineLogitsAndWeights, totalBaselineValid) {
  const L = obsSwings.length;
  if (!L || !(totalBaselineValid > 0)) return null;
  const O = obsSwings.reduce((acc, k) => acc + k.w, 0);
  if (!(O > 0)) return null;

  const W = obsSwings.reduce((acc, k) => acc + k.w * k.d, 0) / O;
  const nEf = (O * O) / obsSwings.reduce((acc, k) => acc + k.w * k.w, 0);
  const A = obsSwings.reduce((acc, k) => acc + k.w * (k.d - W) * (k.d - W), 0) / O;
  const N = L > 1
    ? (L / (L - 1)) * obsSwings.reduce((acc, k) => acc + k.w * k.w * (k.d - W) * (k.d - W), 0) / (O * O)
    : A;

  const fatia = shift => {
    let sum = 0;
    for (let i = 0; i < baselineLogitsAndWeights.length; i += 2) {
      sum += baselineLogitsAndWeights[i + 1] * sigmoid(baselineLogitsAndWeights[i] + shift);
    }
    return (100 * sum) / totalBaselineValid;
  };

  const countedDomestic = obsSwings.filter(k => !k.ext).reduce((acc, k) => acc + k.w, 0);
  const f = Math.min(1, countedDomestic / totalBaselineValid);
  const SE = Math.sqrt(N + A * (1 - f) * (1 - f));

  // Busca por bisseção do limiar K onde fatia(K) == 50%
  let lo = -3, hi = 3;
  for (let iter = 0; iter < 60; iter++) {
    const mid = (lo + hi) / 2;
    if (fatia(mid) > 50) hi = mid;
    else lo = mid;
  }
  const K = (lo + hi) / 2;
  const chanceLula = SE > 0 ? normalCdf((W - K) / SE, 0, 1) : (W > K ? 1 : 0);

  return {
    p: fatia(W),
    V: totalBaselineValid,
    W: O,
    n: L,
    d: W,
    SE,
    f,
    fatia,
    chanceLula,
    tau2m: A,
    se2m: N,
    nEf
  };
}

export function computeLogitSwingFromMunicipios(munBundle) {
  if (!munBundle?.m1 || !munBundle?.m2 || !munBundle?.idx1) return null;
  const { m1, m2, idx1, brFeed } = munBundle;
  const colLula2 = m2.cols.v0;
  const colFlavio2 = m2.cols.v1;
  if (!colLula2 || !colFlavio2) return null;

  const obsSwings = [];
  let totalSec = 0, countedSec = 0, curLula = 0, curFlavio = 0;

  for (let i = 0; i < m2.chaves.length; i++) {
    const st = Number(m2.cols.st?.[i]) || 0;
    const ts = Number(m2.cols.ts?.[i]) || 0;
    totalSec += ts;
    countedSec += st;

    const l2 = Number(colLula2[i]) || 0;
    const f2 = Number(colFlavio2[i]) || 0;
    curLula += l2;
    curFlavio += f2;

    if (!(st > 0) || !(l2 + f2 > 0)) continue;
    const idx = idx1.get(m2.chaves[i]);
    if (idx == null) continue;

    // No feed 6257/1/br-mun.json, v1 = Lula (13) e v0 = Flávio (22)
    const l1 = Number(m1.cols.v1?.[idx]) || 0;
    const f1 = Number(m1.cols.v0?.[idx]) || 0;
    if (l1 + f1 > 0) {
      obsSwings.push({
        w: l2 + f2,
        d: logit(clampP(l2 / (l2 + f2))) - logit(clampP(l1 / (l1 + f1))),
        ext: String(m2.chaves[i]).startsWith('zz')
      });
    }
  }

  const candCols1 = Object.keys(m1.cols).filter(k => /^v\d+$/.test(k));
  const baselineLogitsAndWeights = [];
  let totalBaselineValid = 0;

  for (let i = 0; i < m1.chaves.length; i++) {
    if (String(m1.chaves[i]).startsWith('zz')) continue;
    const l1 = Number(m1.cols.v1?.[i]) || 0;
    const f1 = Number(m1.cols.v0?.[i]) || 0;
    if (!(l1 + f1 > 0)) continue;
    let vTot = 0;
    for (const c of candCols1) vTot += Number(m1.cols[c][i]) || 0;
    baselineLogitsAndWeights.push(logit(clampP(l1 / (l1 + f1))), vTot);
    totalBaselineValid += vTot;
  }

  const engine = runLogitSwingEngine(obsSwings, baselineLogitsAndWeights, totalBaselineValid);
  if (!engine) return null;

  return {
    engine,
    totalSec,
    countedSec,
    curLula,
    curFlavio,
    brFeed
  };
}

// Histórico de projeções em memória
const projHistory = [];

export async function computeProjection(atlasMap, options = {}) {
  const method = options.method || 'logit';
  const t1 = await getT1Baseline();

  // 1. Agrega contagem nacional e regional observada
  const regStats = {};
  for (const reg in REGIONS) {
    regStats[reg] = { l1: 0, f1: 0, l2: 0, f2: 0, countedSec: 0, totalSec: 0 };
  }

  let totalSections = 0;
  let totalCountedSec = 0;
  let currentLulaVotes = 0;
  let currentFlavioVotes = 0;
  let currentValidVotes = 0;

  for (const uf of Object.keys(t1)) {
    const live = atlasMap[uf]?.data;
    const base = t1[uf];
    const reg = UF_TO_REGION[uf] || 'Outros';

    if (live) {
      totalSections += Number(live.sections || 0);
      totalCountedSec += Number(live.counted || 0);

      const l = live.candidates?.find(c => c.number === '13')?.votes || 0;
      const f = live.candidates?.find(c => c.number === '22')?.votes || 0;
      const v = live.valid || (l + f);

      currentLulaVotes += l;
      currentFlavioVotes += f;
      currentValidVotes += v;

      if (regStats[reg]) {
        regStats[reg].l1 += base.lula;
        regStats[reg].f1 += base.bolsonaro;
        regStats[reg].l2 += l;
        regStats[reg].f2 += f;
        regStats[reg].countedSec += Number(live.counted || 0);
        regStats[reg].totalSec += Number(live.sections || 0);
      }
    }
  }

  // 2. Calcula os swings regionais observados
  const regSwings = {};
  for (const reg in regStats) {
    const st = regStats[reg];
    const s1 = (st.l1 + st.f1) > 0 ? st.l1 / (st.l1 + st.f1) : 0.5;
    const s2 = (st.l2 + st.f2) > 0 ? st.l2 / (st.l2 + st.f2) : s1;
    const p = st.totalSec > 0 ? st.countedSec / st.totalSec : 0;
    regSwings[reg] = p > 0.01 ? (s2 - s1) : 0;
  }

  // 3. Projeção estado por estado
  let projLulaVotes = 0;
  let projFlavioVotes = 0;
  let projTotalValidVotes = 0;
  const ufDetails = [];
  const ufObsSwings = [];
  const ufBaseLogits = [];
  let ufBaseTotalValid = 0;

  for (const uf of Object.keys(t1)) {
    const live = atlasMap[uf]?.data;
    const base = t1[uf];
    const reg = UF_TO_REGION[uf] || 'Outros';

    const lCounted = live?.candidates?.find(c => c.number === '13')?.votes || 0;
    const fCounted = live?.candidates?.find(c => c.number === '22')?.votes || 0;
    const vCounted = live?.valid || (lCounted + fCounted);
    const p = live?.progress ? live.progress / 100 : 0;

    ufBaseLogits.push(logit(clampP(base.h2hLula)), base.validos);
    ufBaseTotalValid += base.validos;
    if (lCounted + fCounted > 0) {
      ufObsSwings.push({
        w: lCounted + fCounted,
        d: logit(clampP(lCounted / (lCounted + fCounted))) - logit(clampP(base.h2hLula)),
        ext: false
      });
    }

    const wTurnout = Math.min(1, Math.max(0, (p - 0.02) / 0.15));
    const estimatedTotalValid = p > 0.03
      ? Math.round(vCounted / Math.max(0.001, p))
      : base.validos;
    const finalStateValid = Math.max(vCounted, Math.round((1 - wTurnout) * base.validos + wTurnout * estimatedTotalValid));
    const remainingValid = Math.max(0, finalStateValid - vCounted);

    const countedH2H = (lCounted + fCounted) > 0 ? lCounted / (lCounted + fCounted) : base.h2hLula;
    const localSwing = countedH2H - base.h2hLula;
    const regionalSwing = regSwings[reg] || 0;

    let projRemainingRateLula;
    if (method === 't1_remainder') {
      projRemainingRateLula = base.h2hLula;
    } else if (method === 'direct') {
      projRemainingRateLula = countedH2H;
    } else if (method === 'logit') {
      const logitShift = (lCounted + fCounted) > 0
        ? logit(clampP(countedH2H)) - logit(clampP(base.h2hLula))
        : 0;
      const wLocal = Math.min(1, Math.max(0, (p - 0.01) / 0.20));
      const regLogitShift = regionalSwing * 4;
      projRemainingRateLula = sigmoid(logit(clampP(base.h2hLula)) + wLocal * logitShift + (1 - wLocal) * regLogitShift);
    } else {
      const wLocal = Math.min(1, Math.max(0, (p - 0.01) / 0.25));
      const blendedSwing = wLocal * localSwing + (1 - wLocal) * regionalSwing;
      projRemainingRateLula = Math.min(0.96, Math.max(0.04, base.h2hLula + blendedSwing));
    }

    const lRem = Math.round(remainingValid * projRemainingRateLula);
    const fRem = remainingValid - lRem;

    const stateProjLula = lCounted + lRem;
    const stateProjFlavio = fCounted + fRem;
    const stateProjTotal = stateProjLula + stateProjFlavio;

    projLulaVotes += stateProjLula;
    projFlavioVotes += stateProjFlavio;
    projTotalValidVotes += stateProjTotal;

    ufDetails.push({
      uf,
      region: reg,
      electorate: live?.electorate || base.eleitorado,
      sections: live?.sections || 0,
      countedSections: live?.counted || 0,
      progress: p * 100,
      currentVotes: {
        lula: lCounted,
        flavio: fCounted,
        valid: vCounted,
        lulaPct: (lCounted + fCounted) > 0 ? (lCounted / (lCounted + fCounted)) * 100 : null,
        flavioPct: (lCounted + fCounted) > 0 ? (fCounted / (lCounted + fCounted)) * 100 : null
      },
      t1: {
        lulaPct: base.h2hLula * 100,
        flavioPct: base.h2hBolsonaro * 100,
        validos: base.validos
      },
      swing: ((countedH2H - base.h2hLula) * 100),
      remainingVotes: remainingValid,
      projected: {
        lula: stateProjLula,
        flavio: stateProjFlavio,
        total: stateProjTotal,
        lulaPct: (stateProjLula / stateProjTotal) * 100,
        flavioPct: (stateProjFlavio / stateProjTotal) * 100,
        winner: stateProjLula >= stateProjFlavio ? '13' : '22',
        marginVotes: Math.abs(stateProjLula - stateProjFlavio),
        marginPct: Math.abs((stateProjLula - stateProjFlavio) / stateProjTotal * 100)
      }
    });
  }

  // 4. Motor de Logit Swing Municipal (ao vivo)
  let logitResult = null;
  let liveBrFeed = null;
  if (method === 'logit') {
    const munBundle = options.munBundle !== undefined
      ? options.munBundle
      : await getApuraLogoMunData(options.fetchLiveMun !== false);
    if (munBundle) {
      liveBrFeed = munBundle.brFeed || null;
      logitResult = computeLogitSwingFromMunicipios(munBundle);
    }
    if (!logitResult && ufObsSwings.length > 0) {
      const engine = runLogitSwingEngine(ufObsSwings, ufBaseLogits, ufBaseTotalValid);
      if (engine) {
        logitResult = {
          engine,
          totalSec: totalSections,
          countedSec: totalCountedSec,
          curLula: currentLulaVotes,
          curFlavio: currentFlavioVotes
        };
      }
    }
  }

  // Usa a contagem oficial mais recente entre o feed municipal/nacional ao vivo e o atlasMap
  if (logitResult && logitResult.countedSec > totalCountedSec) {
    totalSections = logitResult.totalSec || totalSections;
    totalCountedSec = logitResult.countedSec;
    currentLulaVotes = logitResult.curLula;
    currentFlavioVotes = logitResult.curFlavio;
    currentValidVotes = currentLulaVotes + currentFlavioVotes;
  }
  if (liveBrFeed?.br && Number(liveBrFeed.br.st) > totalCountedSec) {
    totalSections = Number(liveBrFeed.br.ts) || totalSections;
    totalCountedSec = Number(liveBrFeed.br.st);
    if (Array.isArray(liveBrFeed.br.votos) && liveBrFeed.br.votos.length >= 2) {
      currentLulaVotes = Number(liveBrFeed.br.votos[0]) || currentLulaVotes;
      currentFlavioVotes = Number(liveBrFeed.br.votos[1]) || currentFlavioVotes;
      currentValidVotes = currentLulaVotes + currentFlavioVotes;
    }
  }

  const natProgress = totalSections > 0 ? (totalCountedSec / totalSections) * 100 : 0;
  const remFraction = Math.max(0, 1 - (natProgress / 100));

  let projLulaPct, projFlavioPct, lulaMin, lulaMax, flavioMin, flavioMax, candSigma, probLula, probFlavio;
  let divBounds = null;
  let cravado = false;

  if (logitResult?.engine) {
    const eng = logitResult.engine;
    projLulaPct = eng.p;
    projFlavioPct = 100 - eng.p;
    projTotalValidVotes = eng.V;
    projLulaVotes = Math.round((eng.V * projLulaPct) / 100);
    projFlavioVotes = Math.round((eng.V * projFlavioPct) / 100);

    const Z = shift => 100 - eng.fatia(shift);
    const band = zMult => {
      const a = Z(eng.d - zMult * eng.SE);
      const b = Z(eng.d + zMult * eng.SE);
      return [Math.min(a, b), Math.max(a, b)];
    };

    const [loS, hiS] = band(2.5758);   // IC 99% (sombra externa / margem de erro que crava)
    const [lo80, hi80] = band(1.2816); // IC 80%
    const [lo50, hi50] = band(0.6745); // IC 50% (sombra forte interna)

    lulaMin = Math.max(0, 100 - hiS);
    lulaMax = Math.min(100, 100 - loS);
    flavioMin = Math.max(0, loS);
    flavioMax = Math.min(100, hiS);
    candSigma = (lulaMax - lulaMin) / (2 * 2.5758);

    probLula = eng.chanceLula * 100;
    probFlavio = 100 - probLula;

    cravado = (natProgress >= 1) && (loS > 50 || hiS < 50) && eng.n >= 5;
    divBounds = {
      s: 100 - projLulaPct,
      pos: (100 - projLulaPct) / 100,
      loS,
      hiS,
      lo80,
      hi80,
      lo50,
      hi50,
      loSE: lulaMin,
      hiSE: lulaMax,
      loSD: flavioMin,
      hiSD: flavioMax,
      cravado,
      tremor: natProgress < 100,
      nUnits: eng.n,
      nEf: Math.round(eng.nEf)
    };
  } else {
    projLulaPct = projTotalValidVotes > 0 ? (projLulaVotes / projTotalValidVotes) * 100 : 50;
    projFlavioPct = projTotalValidVotes > 0 ? (projFlavioVotes / projTotalValidVotes) * 100 : 50;

    const marginSigma = (0.032 * Math.sqrt(remFraction) + 0.0015) * 100;
    candSigma = marginSigma / 2;

    lulaMin = Math.max(0, projLulaPct - 1.96 * candSigma);
    lulaMax = Math.min(100, projLulaPct + 1.96 * candSigma);
    flavioMin = Math.max(0, projFlavioPct - 1.96 * candSigma);
    flavioMax = Math.min(100, projFlavioPct + 1.96 * candSigma);

    const z = (projLulaPct - 50.0) / Math.max(0.001, candSigma);
    probLula = normalCdf(z, 0, 1) * 100;
    probFlavio = 100 - probLula;

    const loS = flavioMin;
    const hiS = flavioMax;
    const lo50 = Math.max(0, projFlavioPct - 0.6745 * candSigma);
    const hi50 = Math.min(100, projFlavioPct + 0.6745 * candSigma);
    const lo80 = Math.max(0, projFlavioPct - 1.2816 * candSigma);
    const hi80 = Math.min(100, projFlavioPct + 1.2816 * candSigma);
    cravado = (natProgress >= 3) && (loS > 50 || hiS < 50);

    divBounds = {
      s: projFlavioPct,
      pos: projFlavioPct / 100,
      loS,
      hiS,
      lo80,
      hi80,
      lo50,
      hi50,
      loSE: lulaMin,
      hiSE: lulaMax,
      loSD: flavioMin,
      hiSD: flavioMax,
      cravado,
      tremor: natProgress < 100,
      nUnits: 27,
      nEf: 27
    };
  }

  const currentLulaPct = (currentLulaVotes + currentFlavioVotes) > 0
    ? (currentLulaVotes / (currentLulaVotes + currentFlavioVotes)) * 100
    : 50;
  const currentFlavioPct = (currentLulaVotes + currentFlavioVotes) > 0
    ? (currentFlavioVotes / (currentLulaVotes + currentFlavioVotes)) * 100
    : 50;

  let status = 'Resultado ainda indefinido';
  let statusSub = 'A projeção ainda não crava um resultado nesta disputa.';
  let statusLevel = 'indefinido';

  if (cravado) {
    const winnerName = projLulaPct >= 50 ? 'Lula' : 'Flavio Bolsonaro';
    status = `Resultado projetado: ${winnerName}`;
    statusSub = `A margem de erro da projeção saiu da linha de 50% e crava a vitória de ${winnerName}.`;
    statusLevel = projLulaPct >= 50 ? 'definido-lula' : 'definido-flavio';
  }

  ufDetails.sort((a, b) => (b.electorate || 0) - (a.electorate || 0));

  // Constrói histórico rico combinando o feed histórico ao vivo com os snapshots locais
  let historyOut = projHistory;
  if (Array.isArray(liveBrFeed?.hist) && liveBrFeed.hist.length >= 2) {
    const shiftDiff = projLulaPct - (liveBrFeed.hist[liveBrFeed.hist.length - 1]?.pj?.[0] ?? projLulaPct);
    const baseHalfWidth = Math.max(0.8, (lulaMax - lulaMin) / 2);
    const curRemSqrt = Math.max(0.15, Math.sqrt(Math.max(0.01, 1 - natProgress / 100)));

    historyOut = liveBrFeed.hist
      .filter(h => h && h.ts > 0 && h.st > 0 && Array.isArray(h.pj))
      .map(h => {
        const prog = (h.st / h.ts) * 100;
        const lPct = Math.max(30, Math.min(70, Number(h.pj[0]) + shiftDiff));
        const fPct = 100 - lPct;
        const remSqrt = Math.sqrt(Math.max(0.005, 1 - prog / 100));
        const hw = Math.min(8.5, baseHalfWidth * (remSqrt / curRemSqrt));
        return {
          t: h.t || Date.now(),
          progress: prog,
          lulaPct: lPct,
          flavioPct: fPct,
          lulaMin: Math.max(0, lPct - hw),
          lulaMax: Math.min(100, lPct + hw),
          rawLulaPct: Array.isArray(h.pct) ? Number(h.pct[0]) : currentLulaPct,
          rawFlavioPct: Array.isArray(h.pct) ? Number(h.pct[1]) : currentFlavioPct
        };
      });
  }

  const now = Date.now();
  const lastSnap = projHistory[projHistory.length - 1];
  if (!lastSnap || now - lastSnap.t >= 15000 || Math.abs(natProgress - lastSnap.progress) >= 0.05) {
    projHistory.push({
      t: now,
      progress: natProgress,
      lulaPct: projLulaPct,
      flavioPct: projFlavioPct,
      lulaMin,
      lulaMax,
      probLula,
      rawLulaPct: currentLulaPct,
      rawFlavioPct: currentFlavioPct
    });
    if (projHistory.length > 300) projHistory.shift();
  }

  if (historyOut !== projHistory && historyOut.length > 0) {
    historyOut.push({
      t: now,
      progress: natProgress,
      lulaPct: projLulaPct,
      flavioPct: projFlavioPct,
      lulaMin,
      lulaMax,
      probLula,
      rawLulaPct: currentLulaPct,
      rawFlavioPct: currentFlavioPct
    });
  }

  return {
    updatedAt: liveBrFeed?.br?.tm || now,
    checkedAt: now,
    method,
    natProgress,
    totalSections,
    totalCountedSec,
    current: {
      lulaVotes: currentLulaVotes,
      flavioVotes: currentFlavioVotes,
      validVotes: currentValidVotes,
      lulaPct: currentLulaPct,
      flavioPct: currentFlavioPct,
      marginVotes: currentLulaVotes - currentFlavioVotes,
      marginPct: currentLulaPct - currentFlavioPct
    },
    projection: {
      lulaVotes: projLulaVotes,
      flavioVotes: projFlavioVotes,
      totalValidVotes: projTotalValidVotes,
      remainingVotes: Math.max(0, projTotalValidVotes - currentValidVotes),
      lulaPct: projLulaPct,
      flavioPct: projFlavioPct,
      marginVotes: projLulaVotes - projFlavioVotes,
      marginPct: projLulaPct - projFlavioPct,
      winner: projLulaVotes >= projFlavioVotes ? '13' : '22',
      ci95: {
        lulaMin,
        lulaMax,
        flavioMin,
        flavioMax,
        candSigma
      },
      div: divBounds,
      probability: {
        lula: probLula,
        flavio: probFlavio
      },
      cravado,
      status,
      statusSub,
      statusLevel
    },
    regionalSwings: regSwings,
    ufs: ufDetails,
    history: historyOut
  };
}
