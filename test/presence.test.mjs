import test from 'node:test';
import assert from 'node:assert/strict';
import { registerClient, unregisterClient, getAudienceCount, getBrasiliaTime, getPresenceData } from '../lib/presence.mjs';

test('calcula audiencia ao vivo apenas com pessoas reais conectadas', () => {
  registerClient('sess-real-1');
  assert.equal(getAudienceCount(), 1, 'Deve contar exatamente 1 pessoa real conectada');
  registerClient('sess-real-2');
  assert.equal(getAudienceCount(), 2, 'Deve contar exatamente 2 pessoas reais conectadas');
  unregisterClient('sess-real-2');
  assert.equal(getAudienceCount(), 1, 'Deve reduzir para 1 quando o cliente desconectar');
});

test('formata horario de brasilia no padrao HH:MM:SS', () => {
  const time = getBrasiliaTime();
  assert.match(time, /^\d{2}:\d{2}:\d{2}$/, 'Horario deve estar no formato HH:MM:SS');
});

test('retorna dados reais de presenca para a API', () => {
  const data = getPresenceData('sess-test');
  assert.equal(typeof data.count, 'number');
  assert.ok(data.count >= 1);
  assert.equal(typeof data.timestamp, 'number');
  assert.match(data.brasiliaTime, /^\d{2}:\d{2}:\d{2}$/);
});
