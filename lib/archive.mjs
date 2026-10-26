import {readFileSync} from 'node:fs';
import {states} from './tse.mjs';

export const archive = JSON.parse(readFileSync(new URL('../data/election-archive.json', import.meta.url), 'utf8'));
export function archivedResponse(path, params = new URLSearchParams()) {
  if (path === 'states') return {status: 200, body: states};
  if (path === 'archive') return {status: 200, body: {capturedAt: archive.capturedAt, generated: archive.results['presidente:BR'].data.generated, reconciliation: archive.reconciliation}};
  if (['presence','projecao'].includes(path)) return {status: 410, body: {archived: true, error: 'Acompanhamento ao vivo encerrado. Consulte os resultados.'}};
  if (path === 'atlas') return {status: 200, body: Object.fromEntries(Object.keys(states).map(uf => [uf, archive.results[`presidente:${uf}`]]))};
  if (['exterior','municipios-live','curva'].includes(path)) return {status: 200, body: archive[path]};
  const uf = (params.get('uf') || (path === 'cities' ? 'SP' : 'TODOS')).toUpperCase();
  if (path === 'cities') return states[uf] && uf !== 'ZZ' ? {status: 200, body: (archive.cities[uf] || []).map(c => c.apurado || c.secoes > 0 ? c : {...c, lula: null, bolsonaro: null, validos: null, secoes: null, totalSecoes: null})} : {status: 400, body: {error: 'UF inválida'}};
  if (path === 'results') {
    const office = params.get('office') || 'presidente';
    if (!['presidente','governador'].includes(office) || (!states[uf] && !['BR','TODOS'].includes(uf)) || (office === 'governador' && ['BR','TODOS','ZZ'].includes(uf))) return {status: 400, body: {error: 'Seleção inválida'}};
    // O total nacional já inclui o exterior. Não somar novamente o feed de BUs.
    const result = archive.results[`${office}:${uf === 'TODOS' ? 'BR' : uf}`];
    return {status: 200, body: {...result, error: result?.data ? null : 'Sem resultado de segundo turno disponível no arquivo desta disputa.', archived: true, capturedAt: archive.capturedAt}};
  }
  return {status: 404, body: {error: 'Não encontrado'}};
}
export function serveArchive(req, res, path) {
  const url = new URL(req.url, 'http://localhost');
  const {status, body} = archivedResponse(path, url.searchParams);
  res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300, s-maxage=86400'});
  res.end(JSON.stringify(body));
}
