import test from 'node:test';
import assert from 'node:assert/strict';
import {archive, archivedResponse} from '../lib/archive.mjs';

test('arquivo nacional concluído sem somar novamente o exterior',()=>{
 const br=archivedResponse('results',new URLSearchParams('uf=BR')).body;
 const all=archivedResponse('results',new URLSearchParams('uf=TODOS')).body;
 assert.deepEqual(all.data,br.data);
 assert.equal(br.data.finished,true);
 assert.equal(br.data.progress,100);
 assert.equal(br.data.candidates.reduce((sum,c)=>sum+c.votes,0),br.data.valid);
 assert.equal(br.data.candidates.filter(c=>c.elected).length,1);
 assert.equal(br.data.generated,'25/10/2026 23:27:02');
});
test('consulta não altera o horário original e não acessa fontes remotas',()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=()=>{throw Error('Consulta externa indevida');};
 try{
  for(const path of ['results','atlas','cities','exterior','municipios-live','curva']){
   assert.deepEqual(archivedResponse(path),archivedResponse(path));
   assert.equal(archivedResponse(path).status,200);
  }
 }finally{globalThis.fetch=previous;}
});
test('Bahia preserva 417 municípios e reconcilia votos e seções com a UF',()=>{
 const cities=archivedResponse('cities',new URLSearchParams('uf=BA')).body;
 const state=archive.results['presidente:BA'].data;
 assert.equal(cities.length,417);
 for(const [key,number] of [['lula','13'],['bolsonaro','22']])assert.equal(cities.reduce((sum,c)=>sum+c[key],0),state.candidates.find(c=>c.number===number).votes);
 assert.equal(cities.reduce((sum,c)=>sum+c.secoes,0),state.counted);
});
test('contagem municipal ausente não é apresentada como zero votos',()=>{
 const cities=archivedResponse('cities',new URLSearchParams('uf=SP')).body;
 const missing=cities.filter(c=>!c.apurado);
 assert.ok(missing.length>0);
 for(const c of missing){assert.equal(c.lula,null);assert.equal(c.bolsonaro,null);}
 assert.ok(archive.reconciliation.some(r=>r.uf==='SP'));
});
test('acompanhamento e projeção encerrados e entradas inválidas rejeitadas',()=>{
 assert.equal(archivedResponse('presence').status,410);
 for(const method of ['logit','bayesian','t1_remainder','direct']){const r=archivedResponse('projecao',new URLSearchParams({method}));assert.equal(r.status,200);assert.equal(r.body.demonstration,true);assert.equal(r.body.ufs.length,27);assert.deepEqual(r.body.history,[]);}
 assert.equal(archivedResponse('projecao',new URLSearchParams('method=invalid')).status,400);
 for(const query of ['uf=XX','office=invalid','office=governador&uf=BR'])assert.equal(archivedResponse('results',new URLSearchParams(query)).status,400);
 assert.equal(archivedResponse('cities',new URLSearchParams('uf=XX')).status,400);
 const missing=archivedResponse('results',new URLSearchParams('office=governador&uf=SP')).body;
 assert.ok(missing.error);assert.equal(missing.data,undefined);
});
