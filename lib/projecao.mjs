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

// Histórico de projeções em memória
const projHistory = [];

export async function computeProjection(atlasMap, options = {}) {
  const method = options.method || 'bayesian'; // 'bayesian' (padrão), 't1_remainder', 'direct'
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
    // O swing regional só ganha peso relevante se a região já começou a totalizar
    regSwings[reg] = p > 0.01 ? (s2 - s1) : 0;
  }

  // 3. Projeção estado por estado
  let projLulaVotes = 0;
  let projFlavioVotes = 0;
  let projTotalValidVotes = 0;
  const ufDetails = [];

  for (const uf of Object.keys(t1)) {
    const live = atlasMap[uf]?.data;
    const base = t1[uf];
    const reg = UF_TO_REGION[uf] || 'Outros';

    const lCounted = live?.candidates?.find(c => c.number === '13')?.votes || 0;
    const fCounted = live?.candidates?.find(c => c.number === '22')?.votes || 0;
    const vCounted = live?.valid || (lCounted + fCounted);
    const p = live?.progress ? live.progress / 100 : 0;

    // Estimativa de votos válidos totais neste estado:
    // Conforme o progresso cresce, o comparecimento real se estabiliza
    const wTurnout = Math.min(1, Math.max(0, (p - 0.02) / 0.15));
    const estimatedTotalValid = p > 0.03
      ? Math.round(vCounted / Math.max(0.001, p))
      : base.validos;
    const finalStateValid = Math.max(vCounted, Math.round((1 - wTurnout) * base.validos + wTurnout * estimatedTotalValid));
    const remainingValid = Math.max(0, finalStateValid - vCounted);

    // Taxa observada na UF até agora
    const countedH2H = (lCounted + fCounted) > 0 ? lCounted / (lCounted + fCounted) : base.h2hLula;
    const localSwing = countedH2H - base.h2hLula;
    const regionalSwing = regSwings[reg] || 0;

    let projRemainingRateLula;
    if (method === 't1_remainder') {
      // Método Conservador: votos restantes votam exatamente como no 1º turno
      projRemainingRateLula = base.h2hLula;
    } else if (method === 'direct') {
      // Extrapolação direta da proporção atual da UF
      projRemainingRateLula = countedH2H;
    } else {
      // Método Bayesiano Padrão com Shrinkage:
      // Se p é baixo, usa swing regional suavizado; conforme p cresce, usa swing local da UF
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

  // 4. Métricas Nacionais
  const natProgress = totalSections > 0 ? (totalCountedSec / totalSections) * 100 : 0;
  const remFraction = Math.max(0, 1 - (natProgress / 100));

  const projLulaPct = projTotalValidVotes > 0 ? (projLulaVotes / projTotalValidVotes) * 100 : 50;
  const projFlavioPct = projTotalValidVotes > 0 ? (projFlavioVotes / projTotalValidVotes) * 100 : 50;

  const currentLulaPct = (currentLulaVotes + currentFlavioVotes) > 0
    ? (currentLulaVotes / (currentLulaVotes + currentFlavioVotes)) * 100
    : 50;
  const currentFlavioPct = (currentLulaVotes + currentFlavioVotes) > 0
    ? (currentFlavioVotes / (currentLulaVotes + currentFlavioVotes)) * 100
    : 50;

  // Incerteza diminui com a raiz dos votos restantes
  // Aos 20% apurados, desvio de ~1,5 pp; aos 80% apurados, desvio de ~0,5 pp
  const marginSigma = (0.032 * Math.sqrt(remFraction) + 0.0015) * 100;
  const candSigma = marginSigma / 2;

  const lulaMin = Math.max(0, projLulaPct - 1.96 * candSigma);
  const lulaMax = Math.min(100, projLulaPct + 1.96 * candSigma);
  const flavioMin = Math.max(0, projFlavioPct - 1.96 * candSigma);
  const flavioMax = Math.min(100, projFlavioPct + 1.96 * candSigma);

  // Probabilidade de vitória de Lula
  const z = (projLulaPct - 50.0) / Math.max(0.001, candSigma);
  const probLula = normalCdf(z, 0, 1) * 100;
  const probFlavio = 100 - probLula;

  // Determinação de status qualitativo do modelo
  let status = 'Apurando';
  let statusLevel = 'neutral';
  if (natProgress < 3) {
    status = 'Apuração inicial · Modelo calibrando dados';
    statusLevel = 'neutral';
  } else if (lulaMin < 50.0 && lulaMax > 50.0) {
    status = 'Empate técnico projetado · Disputa acirrada';
    statusLevel = 'tight';
  } else if (probLula >= 99.5) {
    status = 'Vitória projetada: Lula';
    statusLevel = 'lead-lula';
  } else if (probFlavio >= 99.5) {
    status = 'Vitória projetada: Flávio Bolsonaro';
    statusLevel = 'lead-flavio';
  } else if (probLula >= 80) {
    status = 'Liderança provável: Lula';
    statusLevel = 'lead-lula';
  } else if (probFlavio >= 80) {
    status = 'Liderança provável: Flávio Bolsonaro';
    statusLevel = 'lead-flavio';
  }

  // Ordena detalhes de UF por eleitorado
  ufDetails.sort((a, b) => (b.electorate || 0) - (a.electorate || 0));

  const result = {
    updatedAt: Date.now(),
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
      remainingVotes: projTotalValidVotes - currentValidVotes,
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
      probability: {
        lula: probLula,
        flavio: probFlavio
      },
      status,
      statusLevel
    },
    regionalSwings: regSwings,
    ufs: ufDetails
  };

  // Atualiza histórico temporal para o gráfico
  const now = Date.now();
  const lastSnap = projHistory[projHistory.length - 1];
  if (!lastSnap || now - lastSnap.t >= 45000 || Math.abs(natProgress - lastSnap.progress) >= 0.5) {
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

  result.history = projHistory;
  return result;
}
