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
