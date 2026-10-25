import test from 'node:test';
import assert from 'node:assert/strict';
import { registerClient, getAudienceCount, getBrasiliaTime, getPresenceData } from '../lib/presence.mjs';

test('calcula audiencia ao vivo e registra clientes ativos', () => {
  registerClient('sess-1');
  registerClient('sess-2');
  const count = getAudienceCount();
  assert.ok(count > 1000, 'Audiencia deve ser maior que 1000 durante a apuração');
  assert.equal(typeof count, 'number');
});

test('formata horario de brasilia no padrao HH:MM:SS', () => {
  const time = getBrasiliaTime();
  assert.match(time, /^\d{2}:\d{2}:\d{2}$/, 'Horario deve estar no formato HH:MM:SS');
});

test('retorna dados completos de presenca para a API', () => {
  const data = getPresenceData('sess-test');
  assert.equal(typeof data.count, 'number');
  assert.ok(data.activeClients >= 1);
  assert.equal(typeof data.timestamp, 'number');
  assert.match(data.brasiliaTime, /^\d{2}:\d{2}:\d{2}$/);
});
