import { atlas } from './atlas.mjs';
import { computeProjection } from '../lib/projecao.mjs';

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const method = url.searchParams.get('method') || 'logit';
    const atlasMap = await atlas();
    const data = await computeProjection(atlasMap, { method });
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    });
    return res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Erro interno na projeção', message: e.message }));
  }
}
