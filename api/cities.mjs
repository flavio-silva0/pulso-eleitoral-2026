import { readFile } from 'node:fs/promises';

let config = null;
const cache = new Map();

async function loadConfig() {
  if (!config) {
    try {
      const txt = await readFile(new URL('../lib/tse-municipios.json', import.meta.url), 'utf8');
      config = JSON.parse(txt);
    } catch {
      const res = await fetch('https://resultados.tse.jus.br/oficial/ele2026/6258/config/mun-e006258-cm.json');
      config = await res.json();
    }
  }
  return config;
}

export async function getLiveCities(uf) {
  const ufUpper = (uf || '').toUpperCase();
  const ufLower = ufUpper.toLowerCase();
  const cached = cache.get(ufUpper);
  if (cached && Date.now() - cached.time < 15000) {
    return cached.data;
  }

  const cfg = await loadConfig();
  const stateObj = cfg.abr?.find(a => a.cd?.toLowerCase() === ufLower);
  if (!stateObj) return [];
  const municipalities = stateObj.mu || [];

  const results = [];
  const batchSize = 40;
  for (let i = 0; i < municipalities.length; i += batchSize) {
    const batch = municipalities.slice(i, i + batchSize);
    const chunk = await Promise.all(batch.map(async m => {
      try {
        const url = `https://resultados.tse.jus.br/oficial/ele2026/6258/dados/${ufLower}/${ufLower}${m.cd}-c0001-e006258-u.json`;
        const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if (!r.ok) return { cd: m.cd, nome: m.nm, lula: 0, bolsonaro: 0, validos: 0, secoes: 0, totalSecoes: 0, apurado: false };
        const d = await r.json();
        const st = Number(d.s?.st || 0);
        const ts = Number(d.s?.ts || 0);
        const cands = d.carg?.[0]?.agr?.flatMap(a => a.par.flatMap(p => p.cand)) || [];
        const lula = Number(cands.find(c => c.n === '13')?.vap || 0);
        const bolsonaro = Number(cands.find(c => c.n === '22')?.vap || 0);
        const validos = Number(d.v?.vv || (lula + bolsonaro));
        return {
          cd: m.cd,
          nome: m.nm,
          lula,
          bolsonaro,
          validos,
          secoes: st,
          totalSecoes: ts,
          apurado: st > 0
        };
      } catch {
        return { cd: m.cd, nome: m.nm, lula: 0, bolsonaro: 0, validos: 0, secoes: 0, totalSecoes: 0, apurado: false };
      }
    }));
    results.push(...chunk);
  }

  results.sort((a, b) => {
    if (a.apurado && !b.apurado) return -1;
    if (!a.apurado && b.apurado) return 1;
    if (a.apurado && b.apurado) return b.validos - a.validos;
    return a.nome.localeCompare(b.nome);
  });

  cache.set(ufUpper, { time: Date.now(), data: results });
  return results;
}

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const uf = (url.searchParams.get('uf') || 'SP').toUpperCase();
    const data = await getLiveCities(uf);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 's-maxage=15, stale-while-revalidate=30'
    });
    return res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Erro ao consultar cidades', message: e.message }));
  }
}
