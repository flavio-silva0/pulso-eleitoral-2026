import {states, sourceUrl, normalize} from '../lib/tse.mjs';

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
      if (!response.ok) throw Error(response.status === 404 ? 'Arquivo ainda não disponível' : `HTTP ${response.status}`);
      const data = normalize(await response.json(), uf, office);
      const v = {data, checkedAt: Date.now(), etag: response.headers.get('etag'), error: null};
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

let atlasAt = 0, atlasData = null, atlasPending = null;

async function atlas() {
  if (atlasData && Date.now() - atlasAt < 60000) return atlasData;
  if (atlasPending) return atlasPending;

  atlasPending = (async () => {
    const entries = Object.keys(states);
    const output = {};
    let cursor = 0;
    await Promise.all(
      Array.from({length: 4}, async () => {
        while (cursor < entries.length) {
          const uf = entries[cursor++];
          output[uf] = await getResult(uf, 'presidente');
        }
      })
    );
    atlasData = output;
    atlasAt = Date.now();
    return output;
  })().finally(() => atlasPending = null);

  return atlasPending;
}

export default async function handler(req, res) {
  try {
    const data = await atlas();
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 's-maxage=30, stale-while-revalidate=60'
    });
    return res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(500, {'Content-Type': 'application/json'});
    return res.end(JSON.stringify({error: 'Erro interno', message: e.message}));
  }
}
