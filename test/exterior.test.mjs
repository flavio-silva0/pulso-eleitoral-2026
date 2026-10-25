import test from 'node:test';
import assert from 'node:assert/strict';
import {validateExterior,exteriorResult,combineBrasilAndExterior} from '../lib/exterior.mjs';
const fixture=()=>({versao:1,turno:2,gerado:'2026-10-25T19:00:00Z',total:{secoes:1,de:2,apurados:100,'13':60,'22':30,brancos:5,nulos:5},cidades:[{cd:'12345',nome:'Cidade de teste',pais:'País de teste',secoes:1,de:2,apurados:100,'13':60,'22':30,brancos:5,nulos:5}]});
test('confere votos e cobertura sem declarar eleito nem inventar abstenções',()=>{const d=exteriorResult(null,validateExterior(fixture()));assert.equal(d.valid,90);assert.equal(d.progress,50);assert.equal(d.candidates[0].votes,60);assert.equal(d.candidates[0].elected,false);assert.equal(d.abstentions,null);assert.equal(d.sourceKind,'external-bu')});
test('rejeita soma errada, repetição e turno incorreto',()=>{let f=fixture();f.total['13']++;assert.throws(()=>validateExterior(f));f=fixture();f.cidades.push(f.cidades[0]);assert.throws(()=>validateExterior(f));f=fixture();f.turno=1;assert.throws(()=>validateExterior(f))});
test('combina brasil e exterior na abrangencia TODOS',()=>{
 const br={
  candidates:[
   {number:'13',name:'LULA',party:'PT',votes:1000,percent:50,elected:false},
   {number:'22',name:'FLAVIO BOLSONARO',party:'PL',votes:1000,percent:50,elected:false}
  ],
  valid:2000,turnout:2100,blank:50,nulls:50,abstentions:100,sections:500000,counted:1000,progress:0.2,finished:false,generated:'25/10/2026 18:00:00',generation:'1',source:'https://tse.jus.br'
 };
 const feed=validateExterior(fixture());
 const c=combineBrasilAndExterior(br,feed,{counted:0});
 assert.equal(c.uf,'TODOS');
 assert.equal(c.sourceKind,'combined');
 assert.equal(c.candidates.find(x=>x.number==='13').votes,1060);
 assert.equal(c.candidates.find(x=>x.number==='22').votes,1030);
 assert.equal(c.valid,2090);
 assert.equal(c.counted,1001);
 assert.equal(c.blank,55);
 assert.equal(c.nulls,55);
 assert.equal(c.turnout,2200);
});
