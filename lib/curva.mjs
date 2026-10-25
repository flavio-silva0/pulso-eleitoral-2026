import https from 'node:https';

// Séries minuto a minuto da totalização nacional de presidente (1º e 2º turno),
// publicadas pelo seuimposto.com a partir dos arquivos do TSE.
// `t` = minutos desde 00:00 (horário de Brasília) do dia da eleição; passa de 1440 após a meia-noite.
export const curvaSources = {
  t1: {url: 'https://seuimposto.com/1turno/feed/historico.json', referer: 'https://seuimposto.com/1turno/', date: '2026-10-04', ttl: 10 * 60 * 1000},
  t2: {url: 'https://seuimposto.com/feed/historico.json', referer: 'https://seuimposto.com/', date: '2026-10-25', ttl: 5000}
};

function fetchJson({url, referer}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {headers: {Referer: referer, 'Sec-Fetch-Site': 'same-origin', 'User-Agent': 'Mozilla/5.0', Accept: 'application/json'}, timeout: 12000}, res => {
      if (res.statusCode !== 200) { res.resume(); reject(Error(`Histórico indisponível (HTTP ${res.statusCode})`)); return; }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; if (body.length > 5000000) req.destroy(Error('Histórico muito grande')); });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(Error('Tempo de consulta do histórico excedido')));
    req.on('error', reject);
  });
}

const count = v => { if (!Number.isSafeInteger(v) || v < 0) throw Error('Contagem inválida no histórico'); return v; };

// Converte o histórico bruto em pontos compactos:
// t (minuto), p (% de seções totalizadas), l/f (votos 13/22), v (soma dos votos nominais = válidos)
export function normalizeHistory(raw) {
  if (raw?.versao !== 1 || !Array.isArray(raw.pontos)) throw Error('Histórico incompatível');
  const points = raw.pontos.map(p => {
    if (!p || !Number.isFinite(p.t) || p.t < 0 || !(count(p.secoes) > 0) || count(p.totalizadas) > p.secoes || !p.votos || typeof p.votos !== 'object') throw Error('Ponto inválido no histórico');
    let v = 0;
    for (const k in p.votos) v += count(p.votos[k]);
    return {t: p.t, p: p.totalizadas / p.secoes * 100, c: p.totalizadas, s: p.secoes, l: p.votos['13'] || 0, f: p.votos['22'] || 0, v, st: p.situacao || 'apurando'};
  }).sort((a, b) => a.t - b.t);
  return {seq: raw.seq ?? null, points};
}

const cache = {}, inflight = {};
async function getRound(key) {
  const src = curvaSources[key], old = cache[key];
  if (old && Date.now() - old.checkedAt < (old.error ? 10000 : src.ttl)) return old;
  if (inflight[key]) return inflight[key];
  inflight[key] = (async () => {
    try {
      cache[key] = {...normalizeHistory(await fetchJson(src)), date: src.date, source: src.url, checkedAt: Date.now(), error: null};
    } catch (e) {
      cache[key] = {points: [], ...old, date: src.date, source: src.url, checkedAt: Date.now(), error: e.message};
    }
    return cache[key];
  })().finally(() => { inflight[key] = null; });
  return inflight[key];
}

export async function getCurva() {
  const [t1, t2] = await Promise.all([getRound('t1'), getRound('t2')]);
  return {t1, t2, checkedAt: Date.now(), sourceLabel: 'Totalização nacional do TSE, registrada minuto a minuto por seuimposto.com'};
}
