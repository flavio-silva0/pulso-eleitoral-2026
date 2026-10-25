import https from 'node:https';
export const exteriorSource='https://seuimposto.com/feed/exterior-bu.json';
function fetchFeed(){return new Promise((resolve,reject)=>{const req=https.get(exteriorSource,{headers:{Referer:'https://seuimposto.com/','Sec-Fetch-Site':'same-origin','User-Agent':'Mozilla/5.0'},timeout:12000},res=>{if(res.statusCode!==200){res.resume();reject(Error(`Feed do exterior indisponível (HTTP ${res.statusCode})`));return}let body='';res.setEncoding('utf8');res.on('data',chunk=>{body+=chunk;if(body.length>2000000)req.destroy(Error('Feed muito grande'))});res.on('end',()=>{try{resolve(JSON.parse(body))}catch(e){reject(e)}});res.on('error',reject)});req.on('timeout',()=>req.destroy(Error('Tempo de consulta do exterior excedido')));req.on('error',reject)})}
const integer=v=>{if(!Number.isSafeInteger(v)||v<0)throw Error('Contagem inválida no feed do exterior');return v};
export function validateExterior(raw){
 if(raw.versao!==1||raw.turno!==2||!Array.isArray(raw.cidades)||!raw.total||!Number.isFinite(Date.parse(raw.gerado)))throw Error('Feed de exterior incompatível');
 const keys=['13','22','brancos','nulos','secoes','apurados'];const sums=Object.fromEntries(keys.map(k=>[k,0]));const seen=new Set();
 for(const c of raw.cidades){if(!/^\d{5}$/.test(c.cd)||seen.has(c.cd)||typeof c.nome!=='string'||typeof c.pais!=='string')throw Error('Cidade inválida ou duplicada');seen.add(c.cd);for(const k of keys)sums[k]+=integer(c[k]);if(c.secoes>integer(c.de)||c['13']+c['22']+c.brancos+c.nulos!==c.apurados)throw Error('Contagem de cidade inconsistente');}
 for(const k of keys)if(sums[k]!==integer(raw.total[k]))throw Error('Total do exterior não confere com as cidades');
 if(raw.total.secoes>integer(raw.total.de))throw Error('Número de seções inconsistente');
 return {...raw,source:exteriorSource,sourceLabel:'Boletins do exterior · agregação seuimposto.com',sourceKind:'external-bu'};
}
let cached=null,inflight=null;
export async function getExterior(){
 if(cached&&Date.now()-cached.checkedAt<(cached.error?120000:30000))return cached;
 if(inflight)return inflight;
 inflight=(async()=>{try{const data=validateExterior(await fetchFeed());cached={data,checkedAt:Date.now(),error:null};}catch(e){cached={...cached,error:e.message,checkedAt:Date.now()}}return cached;})().finally(()=>inflight=null);return inflight;
}
export function exteriorResult(official,feed){
 const t=feed.total,valid=t['13']+t['22'];return {...official,uf:'ZZ',office:'presidente',candidates:[{number:'13',name:'LULA',party:'PT'},{number:'22',name:'FLAVIO BOLSONARO',party:'PL'}].map(c=>({...c,...official?.candidates?.find(o=>o.number===c.number),votes:t[c.number],percent:valid?t[c.number]/valid*100:0,elected:false})).sort((a,b)=>b.votes-a.votes),valid,blank:t.brancos,nulls:t.nulos,turnout:t.apurados,abstentions:null,sections:t.de,counted:t.secoes,progress:t.de?t.secoes/t.de*100:0,finished:false,generated:new Date(feed.gerado).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}),generation:feed.gerado,source:exteriorSource,sourceKind:'external-bu',sourceLabel:feed.sourceLabel};
}
export function combineBrasilAndExterior(br,feed,zzOfficial){
 if(!br){
  if(!feed?.total)return null;
  const t=feed.total,valid=(t['13']||0)+(t['22']||0);
  return {uf:'TODOS',office:'presidente',candidates:[{number:'13',name:'LULA',party:'PT',vice:'GERALDO ALCKMIN',votes:t['13']||0,percent:valid?(t['13']/valid)*100:0,elected:false},{number:'22',name:'FLAVIO BOLSONARO',party:'PL',vice:'ALFREDO GASPAR',votes:t['22']||0,percent:valid?(t['22']/valid)*100:0,elected:false}].sort((a,b)=>b.votes-a.votes),valid,blank:t.brancos||0,nulls:t.nulos||0,turnout:t.apurados||0,abstentions:null,sections:499248,counted:t.secoes||0,progress:(t.secoes/499248)*100,finished:false,generated:`${new Date(feed.gerado).toLocaleTimeString('pt-BR')} (Exterior)`,generation:String(feed.gerado),source:feed.source,sourceKind:'combined',sourceLabel:feed.sourceLabel};
 }
 const zzCounted=zzOfficial?.counted||0;
 if(zzCounted===0&&feed?.total){
  const t=feed.total,extra13=t['13']||0,extra22=t['22']||0,extraValid=extra13+extra22,valid=(br.valid||0)+extraValid,counted=(br.counted||0)+(t.secoes||0),sections=br.sections||499248,progress=sections?(counted/sections)*100:0,turnout=(br.turnout||0)+(t.apurados||0),blank=(br.blank||0)+(t.brancos||0),nulls=(br.nulls||0)+(t.nulos||0);
  let candidateList=[...(br.candidates||[])];
  if(extra13>0&&!candidateList.some(c=>c.number==='13'))candidateList.push({number:'13',name:'LULA',party:'PT',vice:'GERALDO ALCKMIN',votes:0});
  if(extra22>0&&!candidateList.some(c=>c.number==='22'))candidateList.push({number:'22',name:'FLAVIO BOLSONARO',party:'PL',vice:'ALFREDO GASPAR',votes:0});
  if(candidateList.length===0)candidateList=[{number:'13',name:'LULA',party:'PT',vice:'GERALDO ALCKMIN',votes:0},{number:'22',name:'FLAVIO BOLSONARO',party:'PL',vice:'ALFREDO GASPAR',votes:0}];
  const candidates=candidateList.map(c=>{const extra=c.number==='13'?extra13:c.number==='22'?extra22:0,votes=(c.votes||0)+extra;return {...c,votes,percent:valid>0?(votes/valid)*100:0,elected:false}}).sort((a,b)=>(b.votes-a.votes)||a.number.localeCompare(c.number));
  return {...br,uf:'TODOS',office:'presidente',candidates,valid,blank,nulls,turnout,abstentions:br.abstentions,sections,counted,progress,finished:br.finished&&(t.secoes>=t.de),generated:`${br.generated} (BR) · ${new Date(feed.gerado).toLocaleTimeString('pt-BR')} (Ext)`,generation:`${br.generation}-${feed.gerado}`,source:br.source,sourceKind:'combined',sourceLabel:'Totalização TSE (Brasil) + Boletins de urna do exterior (seuimposto.com)'};
 }
 return {...br,uf:'TODOS',office:'presidente',sourceKind:'combined',sourceLabel:'Totalização do Brasil e Exterior'};
}
