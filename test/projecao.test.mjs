import test from 'node:test';
import assert from 'node:assert/strict';
import { getT1Baseline, normalCdf, computeProjection, REGIONS } from '../lib/projecao.mjs';

test('carrega baseline do 1º turno com as 27 UFs brasileiras', async () => {
  const base = await getT1Baseline();
  const ufs = Object.keys(base);
  assert.equal(ufs.length, 27);
  assert.ok(base['SP'].eleitorado > 30000000);
  assert.ok(base['BA'].h2hLula > 0.65);
  assert.ok(base['SC'].h2hBolsonaro > 0.60);
});

test('normalCdf calcula corretamente a probabilidade gaussiana', () => {
  assert.equal(normalCdf(0, 0, 1), 0.5);
  assert.ok(Math.abs(normalCdf(1.96, 0, 1) - 0.975) < 0.005);
  assert.ok(Math.abs(normalCdf(-1.96, 0, 1) - 0.025) < 0.005);
  assert.ok(normalCdf(3, 0, 1) > 0.99);
  assert.ok(normalCdf(-3, 0, 1) < 0.01);
});

test('computeProjection projeta resultado, intervalo de 95% e probabilidade', async () => {
  const base = await getT1Baseline();
  const mockAtlas = {};

  // Simula apuração inicial com viés Sul/Sudeste (onde Flávio é forte apurando rápido)
  for (const uf in base) {
    const isSouth = REGIONS.Sul.includes(uf) || uf === 'SP';
    const progress = isSouth ? 60 : 10;
    const t1Lula = base[uf].h2hLula;
    const countedValid = Math.round(base[uf].validos * (progress / 100));
    // Simula pequena oscilação de 1 pp
    const lulaCounted = Math.round(countedValid * (t1Lula + 0.01));
    const flavioCounted = countedValid - lulaCounted;

    mockAtlas[uf] = {
      data: {
        uf,
        sections: 1000,
        counted: Math.round(1000 * (progress / 100)),
        progress,
        valid: countedValid,
        electorate: base[uf].eleitorado,
        candidates: [
          { number: '13', votes: lulaCounted },
          { number: '22', votes: flavioCounted }
        ]
      }
    };
  }

  const proj = await computeProjection(mockAtlas, { method: 'bayesian' });

  assert.ok(proj.projection.lulaPct > 45 && proj.projection.lulaPct < 55);
  assert.ok(proj.projection.flavioPct > 45 && proj.projection.flavioPct < 55);
  assert.equal(Math.round(proj.projection.lulaPct + proj.projection.flavioPct), 100);

  // Intervalo de 95%
  assert.ok(proj.projection.ci95.lulaMin <= proj.projection.lulaPct);
  assert.ok(proj.projection.ci95.lulaMax >= proj.projection.lulaPct);

  // Probabilidade de vitória
  assert.ok(proj.projection.probability.lula >= 0 && proj.projection.probability.lula <= 100);
  assert.equal(Math.round(proj.projection.probability.lula + proj.projection.probability.flavio), 100);

  // Detalhes por estado
  assert.equal(proj.ufs.length, 27);
  const sp = proj.ufs.find(u => u.uf === 'SP');
  assert.ok(sp);
  assert.ok(sp.remainingVotes > 0);
  assert.ok(sp.projected.total > sp.currentVotes.valid);
});
