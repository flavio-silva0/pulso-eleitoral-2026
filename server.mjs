import http from 'node:http';
import {readFile,mkdir,appendFile} from 'node:fs/promises';
import {states,sourceUrl,normalize,tseHeaders} from './lib/tse.mjs';
import {getExterior,exteriorResult,combineBrasilAndExterior} from './lib/exterior.mjs';
import {getLiveCities} from './api/cities.mjs';
import {getPresenceData} from './lib/presence.mjs';
import {getCurva} from './lib/curva.mjs';
const cache=new Map(),pending=new Map();
try{await mkdir('.runtime',{recursive:true});}catch{}
async function getResult(uf,office){
 const key=`${office}:${uf}`,old=cache.get(key);
 if(old&&Date.now()-old.checkedAt<(old.error?2000:3000))return old;
 if(pending.has(key))return pending.get(key);
 const job=(async()=>{try{
 const response=await fetch(`${sourceUrl(uf,office)}?_t=${Date.now()}`,{signal:AbortSignal.timeout(12000),headers:old?.etag?{...tseHeaders,'If-None-Match':old.etag}:tseHeaders});
 if(response.status===304&&old?.data){const v={...old,checkedAt:Date.now(),error:null};cache.set(key,v);return v;}
 if(!response.ok)throw Error(response.status===404?'Arquivo ainda não disponível para esta disputa.':`Fonte TSE indisponível (HTTP ${response.status}).`);
 const data=normalize(await response.json(),uf,office),history=[...(old?.history||[])];
 if(data.generation!==old?.data?.generation){history.push({at:Date.now(),generation:data.generation,progress:data.progress,candidates:data.candidates.map(c=>({number:c.number,votes:c.votes,percent:c.percent}))});try{await appendFile('.runtime/snapshots.jsonl',JSON.stringify({observedAt:new Date().toISOString(),...data})+'\n');}catch{}}
 const v={data,checkedAt:Date.now(),etag:response.headers.get('etag'),error:null,history:history.slice(-240)};cache.set(key,v);return v;
 }catch(e){const v={...old,checkedAt:Date.now(),error:e.message};cache.set(key,v);return v;}})().finally(()=>pending.delete(key));pending.set(key,job);return job;
}
const files={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/style.css':'style.css','/brazil.json':'brazil.json','/world.json':'world.json','/maps.js':'maps.js','/curva.js':'curva.js','/lula.webp':'lula.webp','/bolsonaro.webp':'bolsonaro.webp','/municipios.json':'municipios.json'};
let atlasAt=0,atlasData=null,atlasPending=null;
async function atlas(){
 if(atlasData&&Date.now()-atlasAt<5000)return atlasData;
 if(atlasPending)return atlasPending;
 atlasPending=(async()=>{const entries=Object.keys(states),output={};let cursor=0;await Promise.all(Array.from({length:4},async()=>{while(cursor<entries.length){const uf=entries[cursor++];if(!uf)break;output[uf]=await getResult(uf,'presidente');await new Promise(r=>setTimeout(r,15));}}));atlasData=output;atlasAt=Date.now();return output;})().finally(()=>atlasPending=null);return atlasPending;
}
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/presence'){const id=url.searchParams.get('id')||req.socket.remoteAddress||'client';const isLeaving=url.searchParams.get('leave')==='1'||req.method==='DELETE';res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store, no-cache, must-revalidate');return res.end(JSON.stringify(getPresenceData(id,isLeaving)));}
 if(url.pathname==='/api/exterior'){res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');return res.end(JSON.stringify(await getExterior()));}
 if(url.pathname==='/api/curva'){res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');return res.end(JSON.stringify(await getCurva()));}
 if(url.pathname==='/api/atlas'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(await atlas()));}
 if(url.pathname==='/api/results'){
 const uf=(url.searchParams.get('uf')||'TODOS').toUpperCase(),office=url.searchParams.get('office')||'presidente';
 if(uf==='TODOS'){
  if(office!=='presidente'){res.writeHead(400,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:'Seleção inválida'}));}
  const brRes=await getResult('BR','presidente');
  const zzRes=await getResult('ZZ','presidente');
  const feed=await getExterior();
  const combined=combineBrasilAndExterior(brRes.data,feed.data,zzRes.data);
  const key='presidente:TODOS';
  const old=cache.get(key);
  const history=[...(old?.history||[])];
  if(combined&&combined.generation!==old?.data?.generation){
   history.push({at:Date.now(),generation:combined.generation,progress:combined.progress,candidates:combined.candidates.map(c=>({number:c.number,votes:c.votes,percent:c.percent}))});
   try{await appendFile('.runtime/snapshots.jsonl',JSON.stringify({observedAt:new Date().toISOString(),...combined})+'\n');}catch{}
  }
  const v={data:combined,checkedAt:Math.max(brRes.checkedAt||0,feed.checkedAt||0),error:brRes.error||feed.error||null,history:history.slice(-240),note:'Totalização do Brasil somada aos boletins de urna apurados no exterior.'};
  cache.set(key,v);
  res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  return res.end(JSON.stringify(v));
 }
 try{sourceUrl(uf,office)}catch{res.writeHead(400,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:'Seleção inválida'}));}
 let result=await getResult(uf,office);
 if(uf==='ZZ'&&office==='presidente'&&!(result.data?.counted>0)){const feed=await getExterior();if(feed.data){result={...result,data:exteriorResult(result.data,feed.data),officialData:result.data,checkedAt:feed.checkedAt,error:feed.error,history:[],note:'Boletins de urna oficiais do exterior; apuração preliminar antes da consolidação do TSE.'};}}
 res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});return res.end(JSON.stringify({...result,etag:undefined}));
 }
 if(url.pathname==='/api/states'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(states));}
  if(url.pathname==='/api/cities'){const uf=(url.searchParams.get('uf')||'SP').toUpperCase();res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(await getLiveCities(uf)));}
 if(!files[url.pathname]){res.writeHead(404);return res.end('Não encontrado');}
 res.setHeader('Content-Type',url.pathname.endsWith('.json')?'application/json':url.pathname.endsWith('.js')?'text/javascript; charset=utf-8':url.pathname.endsWith('.css')?'text/css; charset=utf-8':url.pathname.endsWith('.webp')?'image/webp':'text/html; charset=utf-8');
 res.setHeader('X-Content-Type-Options','nosniff');res.end(await readFile(new URL(`./public/${files[url.pathname]}`,import.meta.url)));
 }catch{res.writeHead(500);res.end('Erro interno');}});
if(!process.env.VERCEL){
 server.listen(Number(process.env.PORT||3000),()=>{
  console.log('Pulso Eleitoral: http://localhost:'+ (process.env.PORT||3000));
  atlas().catch(()=>{});
 });
 setInterval(()=>atlas().catch(()=>{}),5000);
}
export default server;
