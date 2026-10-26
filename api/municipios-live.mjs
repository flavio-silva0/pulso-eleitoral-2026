import https from 'node:https';

export const municipiosFeedSource = 'https://seuimposto.com/feed/municipios.json';

function fetchFeed() {
  return new Promise((resolve, reject) => {
    const req = https.get(municipiosFeedSource, {
      headers: {
        Referer: 'https://seuimposto.com/',
        'Sec-Fetch-Site': 'same-origin',
        'User-Agent': 'Mozilla/5.0',
        Accept: 'application/json'
      },
      timeout: 12000
    }, res => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(Error(`Feed de municípios indisponível (HTTP ${res.statusCode})`));
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        body += chunk;
        if (body.length > 5000000) req.destroy(Error('Feed muito grande'));
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(Error('Tempo de consulta de municípios excedido')));
    req.on('error', reject);
  });
}

let cached = null;
let inflight = null;

export async function getMunicipiosLive() {
  if (cached && Date.now() - cached.checkedAt < (cached.error ? 8000 : 4000)) {
    return cached;
  }
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const data = await fetchFeed();
      if (!data || data.versao !== 1 || !data.br || !Array.isArray(data.br.f)) {
        throw Error('Formato inválido de municípios');
      }
      cached = { data, checkedAt: Date.now(), error: null };
    } catch (e) {
      cached = { ...(cached || {}), error: e.message, checkedAt: Date.now() };
    }
    return cached;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=4, stale-while-revalidate=8');
  const result = await getMunicipiosLive();
  return res.end(JSON.stringify(result));
}
