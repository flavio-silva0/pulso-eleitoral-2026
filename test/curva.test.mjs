import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeHistory} from '../lib/curva.mjs';

const fixture = () => ({versao: 1, seq: 1, pontos: [
  {t: 1100, totalizadas: 50, secoes: 100, votos: {'13': 300, '22': 200, '30': 100}, situacao: 'apurando'},
  {t: 1050, totalizadas: 10, secoes: 100, votos: {'13': 60, '22': 40}, situacao: 'apurando'}
]});

test('ordena por minuto e calcula percentual apurado e válidos', () => {
  const {points} = normalizeHistory(fixture());
  assert.deepEqual(points.map(p => p.t), [1050, 1100]);
  assert.equal(points[1].p, 50);
  assert.equal(points[1].v, 600);
  assert.equal(points[1].l, 300);
  assert.equal(points[1].f, 200);
});

test('rejeita cabeçalho, contagens negativas e seções inconsistentes', () => {
  assert.throws(() => normalizeHistory({versao: 2, pontos: []}));
  const neg = fixture(); neg.pontos[0].votos['13'] = -1; assert.throws(() => normalizeHistory(neg));
  const over = fixture(); over.pontos[0].totalizadas = 101; assert.throws(() => normalizeHistory(over));
  const zero = fixture(); zero.pontos[0].secoes = 0; assert.throws(() => normalizeHistory(zero));
});
