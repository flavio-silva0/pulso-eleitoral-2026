import { getPresenceData } from '../lib/presence.mjs';

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const id = url.searchParams.get('id') || req.headers['x-forwarded-for'] || 'client';
    const data = getPresenceData(id);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.end(JSON.stringify(data));
  } catch {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Erro ao consultar presença' }));
  }
}
