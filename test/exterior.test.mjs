import test from 'node:test';
import assert from 'node:assert/strict';
import {validateExterior,exteriorResult} from '../lib/exterior.mjs';
const fixture=()=>({versao:1,turno:2,gerado:'2026-10-25T19:00:00Z',total:{secoes:1,de:2,apurados:100,'13':60,'22':30,brancos:5,nulos:5},cidades:[{cd:'12345',nome:'Cidade de teste',pais:'País de teste',secoes:1,de:2,apurados:100,'13':60,'22':30,brancos:5,nulos:5}]});
test('confere votos e cobertura sem declarar eleito nem inventar abstenções',()=>{const d=exteriorResult(null,validateExterior(fixture()));assert.equal(d.valid,90);assert.equal(d.progress,50);assert.equal(d.candidates[0].votes,60);assert.equal(d.candidates[0].elected,false);assert.equal(d.abstentions,null);assert.equal(d.sourceKind,'external-bu')});
test('rejeita soma errada, repetição e turno incorreto',()=>{let f=fixture();f.total['13']++;assert.throws(()=>validateExterior(f));f=fixture();f.cidades.push(f.cidades[0]);assert.throws(()=>validateExterior(f));f=fixture();f.turno=1;assert.throws(()=>validateExterior(f))});
