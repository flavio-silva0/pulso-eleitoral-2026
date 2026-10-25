import http from 'node:http';
import {readFile,mkdir,appendFile} from 'node:fs/promises';
import {states,sourceUrl,normalize} from './lib/tse.mjs';
const cache=new Map(),pending=new Map();
await mkdir('.runtime',{recursive:true});
async function getResult(uf,office){
 const key=`${office}:${uf}`,old=cache.get(key);
 if(old&&Date.now()-old.checkedAt<(old.error?120000:30000))return old;
 if(pending.has(key))return pending.get(key);
 const job=(async()=>{try{
 const response=await fetch(sourceUrl(uf,office),{signal:AbortSignal.timeout(12000),headers:old?.etag?{'If-None-Match':old.etag}:{}});
 if(response.status===304&&old?.data){const v={...old,checkedAt:Date.now(),error:null};cache.set(key,v);return v;}
 if(!response.ok)throw Error(response.status===404?'Arquivo ainda não disponível para esta disputa.':`Fonte TSE indisponível (HTTP ${response.status}).`);
 const data=normalize(await response.json(),uf,office),history=[...(old?.history||[])];
 if(data.generation!==old?.data?.generation){history.push({at:Date.now(),generation:data.generation,progress:data.progress,candidates:data.candidates.map(c=>({number:c.number,votes:c.votes,percent:c.percent}))});await appendFile('.runtime/snapshots.jsonl',JSON.stringify({observedAt:new Date().toISOString(),...data})+'\n');}
 const v={data,checkedAt:Date.now(),etag:response.headers.get('etag'),error:null,history:history.slice(-240)};cache.set(key,v);return v;
 }catch(e){const v={...old,checkedAt:Date.now(),error:e.message};cache.set(key,v);return v;}})().finally(()=>pending.delete(key));pending.set(key,job);return job;
}
const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/brazil.json':'brazil.json'};
let atlasAt=0,atlasData=null,atlasPending=null;
async function atlas(){
 if(atlasData&&Date.now()-atlasAt<60000)return atlasData;
 if(atlasPending)return atlasPending;
 atlasPending=(async()=>{const entries=Object.keys(states),output={};let cursor=0;await Promise.all(Array.from({length:3},async()=>{while(cursor<entries.length){const uf=entries[cursor++];output[uf]=await getResult(uf,'presidente');}}));atlasData=output;atlasAt=Date.now();return output;})().finally(()=>atlasPending=null);return atlasPending;
}
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/atlas'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(await atlas()));}
 if(url.pathname==='/api/results'){
 const uf=(url.searchParams.get('uf')||'BR').toUpperCase(),office=url.searchParams.get('office')||'presidente';
 try{sourceUrl(uf,office)}catch{res.writeHead(400,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:'Seleção inválida'}));}
 const result=await getResult(uf,office);res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});return res.end(JSON.stringify({...result,etag:undefined}));
 }
 if(url.pathname==='/api/states'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(states));}
 if(!files[url.pathname]){res.writeHead(404);return res.end('Não encontrado');}
 res.setHeader('Content-Type',url.pathname.endsWith('.json')?'application/json':url.pathname.endsWith('.js')?'text/javascript; charset=utf-8':url.pathname.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');
 res.setHeader('X-Content-Type-Options','nosniff');res.end(await readFile(new URL(`./public/${files[url.pathname]}`,import.meta.url)));
 }catch{res.writeHead(500);res.end('Erro interno');}});
server.listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log('Pulso Eleitoral: http://localhost:'+ (process.env.PORT||3000)));
