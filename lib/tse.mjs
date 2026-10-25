export const states = {AC:'Acre',AL:'Alagoas',AP:'Amapá',AM:'Amazonas',BA:'Bahia',CE:'Ceará',DF:'Distrito Federal',ES:'Espírito Santo',GO:'Goiás',MA:'Maranhão',MT:'Mato Grosso',MS:'Mato Grosso do Sul',MG:'Minas Gerais',PA:'Pará',PB:'Paraíba',PR:'Paraná',PE:'Pernambuco',PI:'Piauí',RJ:'Rio de Janeiro',RN:'Rio Grande do Norte',RS:'Rio Grande do Sul',RO:'Rondônia',RR:'Roraima',SC:'Santa Catarina',SP:'São Paulo',SE:'Sergipe',TO:'Tocantins',ZZ:'Exterior'};
export function sourceUrl(uf='BR',office='presidente') {
 if (uf!=='BR'&&!states[uf]) throw Error('UF inválida');
 if (!['presidente','governador'].includes(office)||office==='governador'&&['BR','ZZ'].includes(uf)) throw Error('Cargo/abrangência inválidos');
 const election=office==='presidente'?'6258':'6260',cargo=office==='presidente'?'0001':'0003';
 return `https://resultados.tse.jus.br/oficial/ele2026/${election}/dados/${uf.toLowerCase()}/${uf.toLowerCase()}-c${cargo}-e00${election}-u.json`;
}
const num=v=>{if(v===undefined||v===null||v==='')return null;const n=Number(String(v).replace(',','.'));if(!Number.isFinite(n)||n<0)throw Error('Valor inválido na fonte');return n};
export function normalize(raw,uf,office){
 if(raw.t!=='2'||raw.f!=='o'||raw.ele!==(office==='presidente'?'6258':'6260')||raw.cdabr?.toUpperCase()!==uf||!raw.s||!Array.isArray(raw.carg))throw Error('Arquivo incompatível com o segundo turno oficial');
 const cargo=raw.carg.find(c=>c.cd===(office==='presidente'?'1':'3'));if(!cargo)throw Error('Cargo ausente');
 const candidates=(cargo.agr||[]).flatMap(a=>(a.par||[]).flatMap(p=>(p.cand||[]).map(c=>({number:c.n,name:c.nmu,party:p.sg,votes:num(c.vap),percent:num(c.pvap),elected:c.e==='s',status:c.st,vice:c.vs?.map(v=>v.nmu).join(', ')})))).sort((a,b)=>(b.votes-a.votes)||a.number.localeCompare(b.number));
 return {uf,office,candidates,progress:num(raw.s.pst),sections:num(raw.s.ts),counted:num(raw.s.st),electorate:num(raw.e?.te),turnout:num(raw.e?.c),abstentions:num(raw.e?.a),valid:num(raw.v?.vv),blank:num(raw.v?.vb),nulls:num(raw.v?.tvn),finished:raw.and==='f',generated:`${raw.dg} ${raw.hg}`,generation:raw.idg,source:sourceUrl(uf,office)};
}
