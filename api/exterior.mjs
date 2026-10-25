import {getExterior} from '../lib/exterior.mjs';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const data = await getExterior();
  return res.end(JSON.stringify(data));
}
