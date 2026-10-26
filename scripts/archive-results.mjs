import {mkdir, writeFile, readFile} from 'node:fs/promises';
import {states, sourceUrl, normalize, tseHeaders} from '../lib/tse.mjs';

const capturedAt = new Date().toISOString();
const archive = {capturedAt, origin: 'https://pulso-eleitoral-2026.vercel.app', results: {}, cities: {}, reconciliation: []};
const jobs = ['BR', ...Object.keys(states)].flatMap(uf => ['presidente', ...(!['BR','ZZ'].includes(uf) ? ['governador'] : [])].map(office => async () => {
  const source = sourceUrl(uf, office);
  let raw;
  try { raw = JSON.parse(await readFile(`data/raw/${office}-${uf}.json`, 'utf8')); } catch {}
  const r = raw ? null : await fetch(source, {headers: tseHeaders, signal: AbortSignal.timeout(20000)});
  if (r?.status === 404 && office === 'governador') {
    archive.results[`${office}:${uf}`] = {error: 'Sem arquivo de segundo turno disponível para esta disputa.', archived: true};
    return;
  }
  if (r && !r.ok) {
    const fallback = await fetch(`${archive.origin}/api/results?uf=${uf}&office=${office}`, {signal: AbortSignal.timeout(60000)});
    const value = await fallback.json();
    if (!value.data && office === 'presidente') throw Error(`Resultado ausente: ${uf}`);
    archive.results[`${office}:${uf}`] = {...value, archived: true};
    return;
  }
  raw ||= await r.json();
  const data = normalize(raw, uf, office);
  archive.results[`${office}:${uf}`] = {data, checkedAt: Date.parse(capturedAt), error: null, history: [], archived: true};
  await writeFile(`data/raw/${office}-${uf}.json`, JSON.stringify(raw));
}));
await mkdir('data/raw', {recursive: true});
let cursor = 0;
await Promise.all(Array.from({length: 4}, async () => {while (cursor < jobs.length) await jobs[cursor++]();}));
if (!archive.results['presidente:BR'].data.finished) throw Error('Totalização nacional não encerrada');
for (const name of ['exterior', 'municipios-live', 'curva']) {
  const r = await fetch(`${archive.origin}/api/${name}`, {signal: AbortSignal.timeout(60000)});
  if (!r.ok) throw Error(`${name}: ${r.status}`);
  archive[name] = await r.json();
  if (archive[name].error || (name === 'curva' ? !archive[name].t2?.points?.length : !archive[name].data)) throw Error(`Arquivo ausente: ${name}`);
  archive[name].archived = true;
}
const ufs = Object.keys(states).filter(uf => uf !== 'ZZ');
cursor = 0;
await Promise.all(Array.from({length: 3}, async () => {
  while (cursor < ufs.length) {
    const uf = ufs[cursor++];
    let cities;
    try { cities = JSON.parse(await readFile(`data/raw/cities-${uf}.json`, 'utf8')); } catch {}
    if (!cities) {
      const r = await fetch(`${archive.origin}/api/cities?uf=${uf}`, {signal: AbortSignal.timeout(60000)});
      if (!r.ok) throw Error(`${uf}: HTTP ${r.status}`);
      cities = await r.json();
      if (!Array.isArray(cities) || !cities.length) throw Error(`Municípios ausentes: ${uf}`);
      await writeFile(`data/raw/cities-${uf}.json`, JSON.stringify(cities));
    }
    const state = archive.results[`presidente:${uf}`].data;
    for (const [key, number] of [['lula','13'], ['bolsonaro','22']]) {
      const total = cities.reduce((sum,c) => sum + c[key], 0);
      const stateTotal = state.candidates.find(c => c.number === number)?.votes;
      if (total !== stateTotal) archive.reconciliation.push({uf, candidate: number, municipalTotal: total, stateTotal});
    }
    archive.cities[uf] = cities;
    console.log(`${uf}: ${cities.length} municípios preservados`);
  }
}));
await writeFile('data/election-archive.json', JSON.stringify(archive));
console.log(`Arquivo salvo: ${capturedAt}`);
