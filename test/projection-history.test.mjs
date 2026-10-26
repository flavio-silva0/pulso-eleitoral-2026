import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {archivedResponse} from '../lib/archive.mjs';

test('histórico recuperado preserva os valores originais e exclui o ponto pós-eleição', () => {
  const raw = JSON.parse(readFileSync(new URL('../data/raw/projection-deployment-a2479da.json', import.meta.url), 'utf8'));
  const response = archivedResponse('projecao').body;
  const cutoff = Date.parse('2026-10-26T03:00:00Z');
  assert.equal(raw.history.length, 407);
  assert.deepEqual(response.history, raw.history.filter(h => h.t < cutoff));
  assert.equal(response.historyRecovery.excludedAfterElection, 1);
  assert.ok(response.historyRecovery.processing.includes('faixa de incerteza reconstruída'));
  assert.equal(response.history.at(-1).t, 1792979141671);
  assert.ok(response.history.at(-1).progress < 95);
  for (const h of response.history) {
    for (const key of ['t','progress','lulaPct','flavioPct','lulaMin','lulaMax']) assert.ok(Number.isFinite(h[key]));
    assert.ok(Math.abs(h.lulaPct + h.flavioPct - 100) < 1e-9);
    assert.ok(h.lulaMin <= h.lulaPct && h.lulaPct <= h.lulaMax);
  }
});

test('trocar método do mostrador não atribui a série recuperada a outro modelo', () => {
  const logit = archivedResponse('projecao').body;
  for (const method of ['bayesian','t1_remainder','direct']) {
    const other = archivedResponse('projecao', new URLSearchParams({method})).body;
    assert.equal(other.method, method);
    assert.equal(other.historyMethod, 'logit');
    assert.deepEqual(other.history, logit.history);
  }
});
