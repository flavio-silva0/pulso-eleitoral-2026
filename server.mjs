import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {serveArchive} from './lib/archive.mjs';
const files={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/style.css':'style.css','/brazil.json':'brazil.json','/brasil-topo.json':'brasil-topo.json','/world.json':'world.json','/maps.js':'maps.js','/curva.js':'curva.js','/projecao.js':'projecao.js','/lula.webp':'lula.webp','/bolsonaro.webp':'bolsonaro.webp','/municipios.json':'municipios.json'};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/'))return serveArchive(req,res,url.pathname.slice(5));
  const file=files[url.pathname];
  if(!file){res.writeHead(404);return res.end('Não encontrado');}
  const type=file.endsWith('.json')?'application/json':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.webp')?'image/webp':'text/html';
  res.setHeader('Content-Type',type+'; charset=utf-8');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.end(await readFile(new URL('./public/'+file,import.meta.url)));
 }catch{res.writeHead(500);res.end('Erro interno');}
});
if(!process.env.VERCEL)server.listen(Number(process.env.PORT||3000),()=>console.log('Pulso Eleitoral: http://localhost:'+(process.env.PORT||3000)));
export default server;
