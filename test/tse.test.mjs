import test from 'node:test';
import assert from 'node:assert/strict';
import {normalize,sourceUrl} from '../lib/tse.mjs';
const fixture=()=>({t:'2',f:'o',ele:'6258',cdabr:'br',dg:'25/10/2026',hg:'18:00:00',idg:'1',and:'p',s:{pst:'50,25',st:'50',ts:'100'},e:{c:'1000',a:'100'},v:{vv:'900',vb:'40',tvn:'60'},carg:[{cd:'1',agr:[{par:[{sg:'AA',cand:[{n:'10',nmu:'Candidato de teste A',vap:'600',pvap:'66,67',e:'n'}]},{sg:'BB',cand:[{n:'20',nmu:'Candidato de teste B',vap:'300',pvap:'33,33',e:'n'}]}]}]}]});
test('preserva votos, decimais brasileiros e liderança sem declarar eleito',()=>{const d=normalize(fixture(),'BR','presidente');assert.equal(d.candidates[0].votes,600);assert.equal(d.candidates[0].percent,66.67);assert.equal(d.progress,50.25);assert.equal(d.candidates[0].elected,false);assert.equal(d.nulls,60)});
test('rejeita simulados, turno errado e outra abrangência',()=>{for(const delta of [{f:'s'},{t:'1'},{ele:'6257'},{cdabr:'sp'}])assert.throws(()=>normalize({...fixture(),...delta},'BR','presidente'))});
test('ausente não vira zero e negativo é rejeitado',()=>{const raw=fixture();delete raw.v.vv;assert.equal(normalize(raw,'BR','presidente').valid,null);raw.s.st='-1';assert.throws(()=>normalize(raw,'BR','presidente'))});
test('limita destinos e separa eleição estadual',()=>{assert.throws(()=>sourceUrl('../evil'));assert.throws(()=>sourceUrl('BR','governador'));assert.equal(sourceUrl('AC','governador'),'https://resultados.tse.jus.br/oficial/ele2026/6260/dados/ac/ac-c0003-e006260-u.json')});
