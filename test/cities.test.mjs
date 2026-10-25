import test from 'node:test';
import assert from 'node:assert/strict';
import { getLiveCities } from '../api/cities.mjs';

test('TSE Live Municipalities: Bahia validation', async () => {
  const ba = await getLiveCities('BA');
  assert.equal(ba.length, 417, 'Bahia should have 417 municipalities');

  const counted = ba.filter(c => c.apurado || c.secoes > 0);
  assert.ok(counted.length >= 2, 'Should have at least Salvador and Itapebi counted');

  const salvador = ba.find(c => c.cd === '38490');
  assert.ok(salvador, 'Salvador should exist');
  assert.equal(salvador.nome, 'SALVADOR');
  assert.equal(salvador.lula, 828);
  assert.equal(salvador.bolsonaro, 356);
  assert.equal(salvador.secoes, 4);

  const itapebi = ba.find(c => c.cd === '36277');
  assert.ok(itapebi, 'Itapebi should exist');
  assert.equal(itapebi.nome, 'ITAPEBI');
  assert.equal(itapebi.lula, 320);
  assert.equal(itapebi.bolsonaro, 86);
  assert.equal(itapebi.secoes, 2);

  // Sum of cities must equal the official Bahia state total from TSE
  const lulaTotal = counted.reduce((s, c) => s + c.lula, 0);
  const flavioTotal = counted.reduce((s, c) => s + c.bolsonaro, 0);
  const secoesTotal = counted.reduce((s, c) => s + c.secoes, 0);

  const res = await fetch('https://resultados.tse.jus.br/oficial/ele2026/6258/dados/ba/ba-c0001-e006258-u.json');
  const d = await res.json();
  const cands = d.carg[0].agr.flatMap(a => a.par.flatMap(p => p.cand));
  const lulaState = Number(cands.find(c => c.n === '13').vap);
  const flavioState = Number(cands.find(c => c.n === '22').vap);
  const secoesState = Number(d.s.st);

  assert.equal(lulaTotal, lulaState, 'City Lula sum must equal state Lula total');
  assert.equal(flavioTotal, flavioState, 'City Flávio sum must equal state Flávio total');
  assert.equal(secoesTotal, secoesState, 'City sections sum must equal state sections total');
});

test('TSE Live Municipalities: Pará validation', async () => {
  const pa = await getLiveCities('PA');
  assert.equal(pa.length, 144, 'Pará should have 144 municipalities');

  const counted = pa.filter(c => c.apurado || c.secoes > 0);
  assert.ok(counted.length >= 2, 'Should have at least 2 counted municipalities in Pará');

  const afua = pa.find(c => c.cd === '04057');
  assert.ok(afua, 'Afuá should exist');
  assert.equal(afua.lula, 6761);
  assert.equal(afua.bolsonaro, 2704);
  assert.equal(afua.secoes, 45);
});
