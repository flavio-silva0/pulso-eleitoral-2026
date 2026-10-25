import {states, sourceUrl, normalize} from '../lib/tse.mjs';
import {getExterior, exteriorResult, combineBrasilAndExterior} from '../lib/exterior.mjs';

const cache = new Map(), pending = new Map();

async function getResult(uf, office) {
  const key = `${office}:${uf}`, old = cache.get(key);
  if (old && Date.now() - old.checkedAt < (old.error ? 120000 : 30000)) return old;
  if (pending.has(key)) return pending.get(key);

  const job = (async () => {
    try {
      const response = await fetch(sourceUrl(uf, office), {
        signal: AbortSignal.timeout(12000),
        headers: old?.etag ? {'If-None-Match': old.etag} : {}
      });
      if (response.status === 304 && old?.data) {
        const v = {...old, checkedAt: Date.now(), error: null};
        cache.set(key, v);
        return v;
      }
      if (!response.ok) throw Error(response.status === 404 ? 'Arquivo ainda não disponível para esta disputa.' : `Fonte TSE indisponível (HTTP ${response.status}).`);
      const data = normalize(await response.json(), uf, office);
      const history = [...(old?.history || [])];
      if (data.generation !== old?.data?.generation) {
        history.push({
          at: Date.now(),
          generation: data.generation,
          progress: data.progress,
          candidates: data.candidates.map(c => ({number: c.number, votes: c.votes, percent: c.percent}))
        });
      }
      const v = {data, checkedAt: Date.now(), etag: response.headers.get('etag'), error: null, history: history.slice(-240)};
      cache.set(key, v);
      return v;
    } catch (e) {
      const v = {...old, checkedAt: Date.now(), error: e.message};
      cache.set(key, v);
      return v;
    }
  })().finally(() => pending.delete(key));

  pending.set(key, job);
  return job;
}

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const uf = (url.searchParams.get('uf') || 'BR').toUpperCase();
    const office = url.searchParams.get('office') || 'presidente';

    if (uf === 'TODOS') {
      if (office !== 'presidente') {
        res.writeHead(400, {'Content-Type': 'application/json'});
        return res.end(JSON.stringify({error: 'Seleção inválida'}));
      }
      const brRes = await getResult('BR', 'presidente');
      const zzRes = await getResult('ZZ', 'presidente');
      const feed = await getExterior();
      const combined = combineBrasilAndExterior(brRes.data, feed.data, zzRes.data);
      const key = 'presidente:TODOS';
      const old = cache.get(key);
      const history = [...(old?.history || [])];
      if (combined && combined.generation !== old?.data?.generation) {
        history.push({
          at: Date.now(),
          generation: combined.generation,
          progress: combined.progress,
          candidates: combined.candidates.map(c => ({number: c.number, votes: c.votes, percent: c.percent}))
        });
      }
      const v = {
        data: combined,
        checkedAt: Math.max(brRes.checkedAt || 0, feed.checkedAt || 0),
        error: brRes.error || feed.error || null,
        history: history.slice(-240),
        note: 'Totalização do Brasil somada aos boletins de urna apurados no exterior.'
      };
      cache.set(key, v);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      return res.end(JSON.stringify(v));
    }

    try {
      sourceUrl(uf, office);
    } catch {
      res.writeHead(400, {'Content-Type': 'application/json'});
      return res.end(JSON.stringify({error: 'Seleção inválida'}));
    }

    let result = await getResult(uf, office);
    if (uf === 'ZZ' && office === 'presidente' && !(result.data?.counted > 0)) {
      const feed = await getExterior();
      if (feed.data) {
        result = {
          ...result,
          data: exteriorResult(result.data, feed.data),
          officialData: result.data,
          checkedAt: feed.checkedAt,
          error: feed.error,
          history: [],
          note: 'Contagem de boletins do exterior agregada pelo seuimposto.com; ainda não é a totalização oficial. Não somada ao placar nacional.'
        };
      }
    }

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    return res.end(JSON.stringify({...result, etag: undefined}));
  } catch (e) {
    res.writeHead(500, {'Content-Type': 'application/json'});
    return res.end(JSON.stringify({error: 'Erro interno', message: e.message}));
  }
}
