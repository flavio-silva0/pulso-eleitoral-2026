import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeHistory, alignSeries} from '../lib/curva.mjs';

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

test('alignSeries alinha 19h (2ºT) com 17h (1ºT) somando 120min ao 1ºT e filtrando pré-19h do 2ºT', () => {
  const t1 = [
    {t: 1020, p: 0, l: 0, f: 0},     // 17:00
    {t: 1042, p: 1.4, l: 60, f: 80}, // 17:22
    {t: 1140, p: 70, l: 500, f: 500} // 19:00
  ];
  const t2 = [
    {t: 1026, p: 0.29, l: 20, f: 16}, // 17:06 (exterior antecipado - deve ser descartado no alinhamento)
    {t: 1141, p: 0.31, l: 23, f: 17}, // 19:01 (início da contagem nacional do 2º turno)
    {t: 1162, p: 3.08, l: 150, f: 140} // 19:22
  ];

  const aligned = alignSeries(t1, t2);

  // t2 descarta 17:06 e preserva 19:01 e 19:22
  assert.equal(aligned.t2.length, 2);
  assert.equal(aligned.t2[0].t, 1141);
  assert.equal(aligned.t2[0].x, 1141);
  assert.equal(aligned.t2[1].x, 1162);

  // t1 ganha +120 minutos: 17:00 -> 19:00; 17:22 -> 19:22
  assert.equal(aligned.t1.length, 3);
  assert.equal(aligned.t1[0].origT, 1020);
  assert.equal(aligned.t1[0].x, 1140); // 17:00 alinhado com 19:00
  assert.equal(aligned.t1[1].origT, 1042);
  assert.equal(aligned.t1[1].x, 1162); // 17:22 alinhado com 19:22
});
