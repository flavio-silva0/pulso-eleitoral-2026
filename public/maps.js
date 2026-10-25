const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>n==null?'—':new Intl.NumberFormat('pt-BR').format(n);

export function heatColor(red,blue){
 const total=red+blue;
 if(!total)return 'var(--map-empty,#e2e8f0)';
 const margin=(red-blue)/total;
 if(!margin)return '#f1f5f9';
 const from=[241,245,249],to=margin>0?[220,38,38]:[37,99,235],strength=.2+.8*Math.abs(margin);
 return `rgb(${from.map((v,i)=>Math.round(v+(to[i]-v)*strength)).join(',')})`
}

const ids={'11':'RO','12':'AC','13':'AM','14':'RR','15':'PA','16':'AP','17':'TO','21':'MA','22':'PI','23':'CE','24':'RN','25':'PB','26':'PE','27':'AL','28':'SE','29':'BA','31':'MG','32':'ES','33':'RJ','35':'SP','41':'PR','42':'SC','43':'RS','50':'MS','51':'MT','52':'GO','53':'DF'};
const regions={'Norte':['AC','AM','AP','PA','RO','RR','TO'],'Nordeste':['AL','BA','CE','MA','PB','PE','PI','RN','SE'],'Centro-Oeste':['DF','GO','MS','MT'],'Sudeste':['ES','MG','RJ','SP'],'Sul':['PR','RS','SC']};
const norm=s=>(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const aliases={'tchequia':'republicatcheca','chequia':'republicatcheca','paisesbaixos':'holanda','estadosunidos':'estadosunidosdaamerica','coreiadosul':'coreiadosul','macedoniadonorte':'macedonia'};
const key=s=>aliases[norm(s)]||norm(s);
const small={Singapura:[103.82,1.35],Malta:[14.38,35.94],Bahrain:[50.55,26.07],Bahrein:[50.55,26.07],'Hong Kong':[114.17,22.32],'Cabo Verde':[-23.61,15.12],Maurício:[57.55,-20.2],Luxemburgo:[6.13,49.61],Andorra:[1.52,42.51],'São Tomé e Príncipe':[6.73,.34],Maldivas:[73.5,4.17],Barbados:[-59.55,13.19]};

export function initMaps({getAtlas,getStates,getBrazil,getNational,onSelect,onRefresh}){
 let mode='brasil',world=null,exterior=null,selected=null,lastCheckedAt=Date.now();
 let citySearch='',cityFilter='all',cityLimit=60;
 let zoom=1,pan=[0,0],animId=null;
 const activePointers=new Map();
 let dragStartPos={x:0,y:0},dragStartPan=[0,0];
 let pinchStartDist=0,pinchStartMid={x:0,y:0},pinchStartZoom=1,pinchStartPan=[0,0],pinchFocalPt=null;
 let gestureMoved=false,justGestured=false,targetPlaceCandidate=null;
 const liveCitiesCache=new Map();
 const loadingStates=new Set();

 const main=document.querySelector('main');
 main.insertAdjacentHTML('afterbegin',`
  <section id="maps-page" hidden>
   <div class="map-heading">
    <div class="map-heading-title">
     <span class="eyebrow">MAPA ELEITORAL · 2º TURNO</span>
     <h1>Um país. <em>Pelo mundo.</em></h1>
    </div>
    <div class="map-toolbar">
     <div class="tabs">
      <button data-map-mode="brasil" class="selected">Brasil</button>
      <button data-map-mode="mundo">Mundo · Exterior</button>
     </div>
     <span id="map-freshness">Consultando resultados…</span>
     <button id="map-refresh">↻ Atualizar</button>
    </div>
   </div>

   <div class="map-candidate-bar" id="map-candidate-bar" aria-label="Placar Presidencial">
     <div class="cand-avatar-wrap left">
      <img src="/lula.webp" class="cand-avatar lula" alt="Lula">
     </div>

     <div class="cand-bar-center">
      <div class="cand-bar-top-row">
       <div class="cand-bar-cand left">
        <strong class="cand-name">Lula</strong>
        <span class="cand-badge red">PT · 13</span>
       </div>
       <div class="cand-bar-cand right">
        <span class="cand-badge blue">PL · 22</span>
        <strong class="cand-name">Flávio</strong>
       </div>
      </div>

      <div class="cand-track-wrap" role="img" id="rb-bar-role" aria-label="Confronto de votos">
       <div class="cand-track">
        <div class="cand-fill lula" id="bar-seg-lula" style="width:50%">
         <span class="cand-pct" id="bar-lula-pct">50,00<small>%</small></span>
         <span class="cand-votes" id="bar-lula-votes">0 votos</span>
        </div>
        <div class="cand-fill bolsonaro" id="bar-seg-bolsonaro" style="width:50%">
         <span class="cand-votes" id="bar-bolsonaro-votes">0 votos</span>
         <span class="cand-pct" id="bar-bolsonaro-pct">50,00<small>%</small></span>
        </div>
        <div class="track-seam" id="bar-seam" style="left:50%"></div>
       </div>
       <div class="track-fifty"><em>50%</em></div>
      </div>

      <div class="cand-bar-footer">
       <div class="cand-footer-stats">
        <span class="live-dot-mini"></span>
        <b id="rb-apurado-pct">0,00%</b> <span id="rb-apurado-sub">apurado</span>
       </div>
       <span class="scope-pill" id="bar-status-text">TOTAL GERAL · BRASIL + EXTERIOR</span>
      </div>
     </div>

     <div class="cand-avatar-wrap right">
      <img src="/bolsonaro.webp" class="cand-avatar bolsonaro" alt="Flávio Bolsonaro">
     </div>

     <div class="cand-bar-foot-progress" aria-hidden="true"><i id="rb-foot-bar" style="width:0%"></i></div>
    </div>

   <div class="map-layout">
    <div class="map-canvas-wrap">
     <div class="map-controls">
      <button id="zoom-in" aria-label="Ampliar mapa">+</button>
      <button id="zoom-out" aria-label="Reduzir mapa">−</button>
      <button id="zoom-reset">Enquadrar</button>
     </div>
     <div id="heat-map" class="heat-map"></div>
     <div class="map-tooltip" id="map-tooltip" hidden></div>
     <div class="map-footer-bar">
      <div class="heat-legend">
       <div class="heat-legend-cands">
        <span class="red-text"><img src="/lula.webp" class="legend-photo" alt="Lula"> Lula · 13</span>
        <span class="heat-legend-mid">Empate (50/50)</span>
        <span class="blue-text"><img src="/bolsonaro.webp" class="legend-photo" alt="Flávio"> Flávio · 22</span>
       </div>
       <div class="heat-gradient-wrap">
        <div class="heat-gradient"></div>
        <div class="heat-gradient-labels">
         <span>+100% Lula</span>
         <span>50% / 50%</span>
         <span>+100% Flávio</span>
        </div>
       </div>
      </div>
      <p class="map-caption">Cores refletem a intensidade da vantagem em votos válidos</p>
     </div>
    </div>
    <aside class="map-detail" id="map-detail"></aside>
   </div>
   <div class="map-bottom-bar" id="map-bottom-bar">
    <div class="bottom-live-badge" title="Pessoas acompanhando a apuração ao vivo agora">
     <span class="live-pulse"></span>
     <span class="live-text"><strong class="live-counter-val">1</strong> <span class="live-label-text">pessoa ao vivo</span></span>
    </div>
    <div class="bottom-update">
     <span class="update-label">Última atualização:</span>
     <strong class="last-update-val">—</strong>
     <span class="tz-label">(horário de Brasília)</span>
    </div>
    <div class="map-source" id="map-source"></div>
   </div>
  </section>
 `);

 document.querySelector('nav').innerHTML='<a href="#mapas" class="current">01 · Mapa</a><a href="#painel">02 · Apuração</a>';
 document.querySelector('.columns').hidden=true;
 document.querySelector('.transparency').hidden=true;
 const root=document.querySelector('#maps-page'),canvas=document.querySelector('#heat-map'),tooltip=root.querySelector('#map-tooltip'),mapWrap=root.querySelector('.map-canvas-wrap');
 let activeTooltipPlace=null;

 function hideTooltip(){
  if(tooltip&&!tooltip.hidden){
   tooltip.hidden=true;
   activeTooltipPlace=null;
  }
 }

 function updateTooltipPos(clientX,clientY){
  if(!tooltip||tooltip.hidden)return;
  const wrapRect=mapWrap.getBoundingClientRect();
  const x=clientX-wrapRect.left;
  const y=clientY-wrapRect.top;

  const tipW=tooltip.offsetWidth||290;
  const tipH=tooltip.offsetHeight||160;

  let posX=x-tipW/2;
  let posY=y-tipH-12;

  if(posY<8){
   posY=y+20;
  }
  if(posX<8)posX=8;
  if(posX+tipW>wrapRect.width-8){
   posX=wrapRect.width-tipW-8;
  }
  if(posY+tipH>wrapRect.height-8){
   posY=wrapRect.height-tipH-8;
  }

  tooltip.style.left=`${posX}px`;
  tooltip.style.top=`${posY}px`;
 }

 function route(){
  const show=location.hash!=='#painel';
  document.body.classList.toggle('maps-view',show);
  root.hidden=!show;
  document.querySelectorAll('nav a').forEach(a=>a.classList.toggle('current',a.hash===(show?'#mapas':'#painel')));
  if(location.hash==='#mundo'||location.hash==='#exterior'){
   mode='mundo';
   root.querySelectorAll('[data-map-mode]').forEach(x=>x.classList.toggle('selected',x.dataset.mapMode==='mundo'));
  }else if(location.hash==='#brasil'||location.hash==='#mapas'){
   mode='brasil';
   root.querySelectorAll('[data-map-mode]').forEach(x=>x.classList.toggle('selected',x.dataset.mapMode==='brasil'));
  }
  if(show)render();
 }
 window.addEventListener('hashchange',route);

 function countries(){
  const out={};
  for(const c of exterior?.data?.cidades||[]){
   const k=key(c.pais),v=out[k]??={name:c.pais,red:0,blue:0,sections:0,totalSections:0,cities:[],sourceKind:'external-bu'};
   v.red+=c['13'];
   v.blue+=c['22'];
   v.sections+=c.secoes;
   v.totalSections+=c.de;
   v.cities.push(c);
  }
  return out;
 }

 function dataFor(code){
  if(mode==='mundo')return countries()[code];
  const r=getAtlas()[code],d=r?.data;
  return {
   name:getStates()[code]||code,
   red:d?.candidates?.find(c=>c.number==='13')?.votes||0,
   blue:d?.candidates?.find(c=>c.number==='22')?.votes||0,
   sections:d?.counted||0,
   totalSections:d?.sections||0,
   generated:d?.generated,
   error:r?.error
  };
 }

 function regionCards(){
  return Object.entries(regions).map(([name,codes])=>{
   const rows=codes.map(dataFor);
   const red=rows.reduce((s,d)=>s+d.red,0);
   const blue=rows.reduce((s,d)=>s+d.blue,0);
   const sections=rows.reduce((s,d)=>s+(d.sections||0),0);
   const all=rows.reduce((s,d)=>s+(d.totalSections||0),0);
   const available=codes.filter(c=>getAtlas()[c]?.data&&!getAtlas()[c]?.error).length;
   return `
    <article class="region-card">
     <div class="region-heading">
      <b>Região ${name}</b>
      <small>${all?(sections/all*100).toFixed(1).replace('.',',')+'%':'—'} apurado</small>
     </div>
     <div class="region-votes">
      <span class="red-text">13 · <strong>${fmt(red)}</strong></span>
      <span class="blue-text">22 · <strong>${fmt(blue)}</strong></span>
     </div>
     <div class="region-split">
      <i style="width:${red+blue?red/(red+blue)*100:0}%"></i>
      <i style="width:${red+blue?blue/(red+blue)*100:0}%"></i>
     </div>
     ${available<codes.length?`<small class="coverage">${available}/${codes.length} UFs com dados</small>`:''}
     <details class="region-expand">
      <summary>Ver estados da região</summary>
      <div class="region-states">${codes.map(c=>`<button data-country="${c}">${c}</button>`).join('')}</div>
     </details>
    </article>
   `;
  }).join('');
 }

 function getBrasilTotals(){
  const atlas=getAtlas();
  let red=0,blue=0,counted=0,total=0,valid=0;
  if(atlas){
   for(const k in atlas){
    if(k==='ZZ')continue;
    const d=atlas[k]?.data;
    if(d){
     counted+=(d.counted||0);
     total+=(d.sections||0);
     valid+=(d.valid||0);
     const cands=d.candidates||[];
     red+=cands.find(c=>c.number==='13')?.votes||0;
     blue+=cands.find(c=>c.number==='22')?.votes||0;
    }
   }
  }
  if(total===0&&getNational){
   const nat=getNational();
   if(nat){
    counted=nat.counted||0;
    total=nat.sections||0;
    valid=nat.valid||0;
    const cands=nat.candidates||[];
    red=cands.find(c=>c.number==='13')?.votes||0;
    blue=cands.find(c=>c.number==='22')?.votes||0;
   }
  }
  return {red,blue,counted,total,valid};
 }

 function getExteriorTotals(){
  const t=exterior?.data?.total;
  if(t){
   const red=t['13']||0;
   const blue=t['22']||0;
   const counted=t.secoes||0;
   const total=t.de||0;
   const valid=red+blue;
   return {red,blue,counted,total,valid};
  }
  const zz=getAtlas()?.['ZZ']?.data;
  if(zz){
   const cands=zz.candidates||[];
   const red=cands.find(c=>c.number==='13')?.votes||0;
   const blue=cands.find(c=>c.number==='22')?.votes||0;
   const counted=zz.counted||0;
   const total=zz.sections||0;
   const valid=zz.valid||(red+blue);
   return {red,blue,counted,total,valid};
  }
  return {red:0,blue:0,counted:0,total:0,valid:0};
 }

 function getWorldTotals(){
  const br=getBrasilTotals();
  const ext=getExteriorTotals();

  if(br.total>0){
   return {
    red:br.red+ext.red,
    blue:br.blue+ext.blue,
    counted:br.counted+ext.counted,
    totalSections:br.total+ext.total,
    br,
    ext
   };
  }

  const nat=typeof getNational==='function'?getNational():null;
  if(nat&&nat.sourceKind==='combined'){
   const cands=nat.candidates||[];
   return {
    red:cands.find(c=>c.number==='13')?.votes||0,
    blue:cands.find(c=>c.number==='22')?.votes||0,
    counted:nat.counted||0,
    totalSections:nat.sections||0,
    br,
    ext
   };
  }

  if(nat&&nat.sections>0){
   const cands=nat.candidates||[];
   return {
    red:(cands.find(c=>c.number==='13')?.votes||0)+ext.red,
    blue:(cands.find(c=>c.number==='22')?.votes||0)+ext.blue,
    counted:(nat.counted||0)+ext.counted,
    totalSections:(nat.sections||0)+ext.total,
    br,
    ext
   };
  }

  return {
   red:ext.red,
   blue:ext.blue,
   counted:ext.counted,
   totalSections:ext.total,
   br,
   ext
  };
 }

 function updateCandidateBar(){
  const barLulaPct=document.querySelector('#bar-lula-pct'),barBolsonaroPct=document.querySelector('#bar-bolsonaro-pct');
  const barLulaVotes=document.querySelector('#bar-lula-votes'),barBolsonaroVotes=document.querySelector('#bar-bolsonaro-votes');
  const barSegLula=document.querySelector('#bar-seg-lula'),barSegBolsonaro=document.querySelector('#bar-seg-bolsonaro');
  const barSeam=document.querySelector('#bar-seam');
  const rbHeadline=document.querySelector('#rb-headline');
  const rbApuradoPct=document.querySelector('#rb-apurado-pct');
  const rbApuradoSub=document.querySelector('#rb-apurado-sub');
  const barStatus=document.querySelector('#bar-status-text');
  const rbFootBar=document.querySelector('#rb-foot-bar');
  const barRole=document.querySelector('#rb-bar-role');
  if(!barLulaPct)return;

  const w=getWorldTotals();
  const red=w.red;
  const blue=w.blue;
  const counted=w.counted;
  const totalSections=w.totalSections;
  const br=w.br;
  const ext=w.ext;
  const label='TOTAL GERAL · BRASIL + EXTERIOR';

  const tot=red+blue;
  const lPct=tot?(red/tot*100):50;
  const bPct=tot?(blue/tot*100):50;
  const progressPct=totalSections?(counted/totalSections*100):0;

  let headline='';
  if(tot===0){
   headline='Aguardando apuração';
  }else if(progressPct<1){
   headline='Ainda é cedo: menos de 1% das seções';
  }else if(progressPct>=99.8){
   headline=red>blue?'Lula eleito Presidente da República':'Flávio Bolsonaro eleito Presidente da República';
  }else{
   const diff=Math.abs(lPct-bPct);
   if(diff<0.5){
    headline='Disputa voto a voto';
   }else if(red>blue){
    headline='Lula lidera no total geral (Brasil + Exterior)';
   }else{
    headline='Flávio lidera no total geral (Brasil + Exterior)';
   }
  }

  const lPctStr=tot?lPct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
  const bPctStr=tot?bPct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';

  barLulaPct.innerHTML=`${lPctStr}<small>%</small>`;
  barBolsonaroPct.innerHTML=`${bPctStr}<small>%</small>`;
  barLulaVotes.textContent=fmt(red)+' votos';
  barBolsonaroVotes.textContent=fmt(blue)+' votos';

  if(barSegLula)barSegLula.style.width=lPct+'%';
  if(barSegBolsonaro)barSegBolsonaro.style.width=bPct+'%';

  if(barSeam){
   barSeam.style.left=lPct+'%';
   barSeam.style.display=(tot>0&&lPct>0&&lPct<100)?'block':'none';
  }

  if(barSegLula)barSegLula.classList.toggle('tight',lPct<16);
  if(barSegBolsonaro)barSegBolsonaro.classList.toggle('tight',bPct<16);

  if(rbHeadline)rbHeadline.textContent=headline;

  if(barStatus){
   barStatus.textContent=label;
   barStatus.title=`Soma dos votos: Brasil (${fmt(br.counted)} seções, ${fmt(br.red+br.blue)} votos) + Exterior (${fmt(ext.counted)} seções, ${fmt(ext.red+ext.blue)} votos)`;
  }

  const fmtP=progressPct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%';
  if(rbApuradoPct)rbApuradoPct.textContent=fmtP;
  if(rbApuradoSub){
   if(totalSections>0){
    rbApuradoSub.textContent=`apurado · ${fmt(counted)} de ${fmt(totalSections)} seções`;
   }else{
    rbApuradoSub.textContent='apurado';
   }
  }

  if(rbFootBar)rbFootBar.style.width=Math.min(100,progressPct)+'%';
  if(barRole)barRole.setAttribute('aria-label',`${headline}: Lula ${lPctStr}%, Flávio Bolsonaro ${bPctStr}%`);
 }

 function getFeatureBBox(coords,project){
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  function traverse(c){
   if(typeof c[0]==='number'){const[x,y]=project(c);if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y}
   else{for(const item of c)traverse(item)}
  }
  traverse(coords);
  return {minX,minY,maxX,maxY,w:maxX-minX,h:maxY-minY};
 }

 function animateView(targetPan,targetZoom,duration=750){
  if(animId)cancelAnimationFrame(animId);
  const startPan=[...pan],startZoom=zoom,startTime=performance.now();
  function step(now){
   const elapsed=now-startTime,t=Math.min(1,elapsed/duration);
   const ease=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
   pan=[startPan[0]+(targetPan[0]-startPan[0])*ease,startPan[1]+(targetPan[1]-startPan[1])*ease];
   zoom=startZoom+(targetZoom-startZoom)*ease;
   view();
   if(t<1)animId=requestAnimationFrame(step);
   else{animId=null;pan=[...targetPan];zoom=targetZoom;view()}
  }
  animId=requestAnimationFrame(step);
 }

 function zoomTo(code){
  const w=mode==='brasil'?440:1000,h=mode==='brasil'?440:520;
  if(!code){animateView([0,0],1,700);return}
  const geo=mode==='brasil'?getBrazil():world;
  const project=mode==='brasil'?([x,y])=>[(x+75)*10,(7-y)*10]:([x,y])=>[(x+180)*1000/360,(85-y)*520/170];
  if(mode==='brasil'){
   const feat=geo?.features?.find(f=>ids[f.properties.codarea]===code);
   if(feat){
    const bbox=getFeatureBBox(feat.geometry.coordinates,project);
    if(bbox.w>0&&bbox.h>0){
     const fitZoom=Math.min(w/(bbox.w*1.4),h/(bbox.h*1.4)),targetZoom=Math.max(1.8,Math.min(6.5,fitZoom));
     const cx=bbox.minX+bbox.w/2,cy=bbox.minY+bbox.h/2;
     animateView([cx-(w/targetZoom)/2,cy-(h/targetZoom)/2],targetZoom,750);
     return;
    }
   }
  }else{
   const feat=geo?.features?.find(f=>key(f.properties.name)===code);
   if(feat){
    const bbox=getFeatureBBox(feat.geometry.coordinates,project);
    if(bbox.w>0&&bbox.h>0){
     const fitZoom=Math.min(w/(bbox.w*1.5),h/(bbox.h*1.5)),targetZoom=Math.max(2,Math.min(7,fitZoom));
     const cx=bbox.minX+bbox.w/2,cy=bbox.minY+bbox.h/2;
     animateView([cx-(w/targetZoom)/2,cy-(h/targetZoom)/2],targetZoom,750);
     return;
    }
   }
   const cName=countries()[code]?.name,coord=cName?small[cName]:null;
   if(coord){
    const[cx,cy]=project(coord),targetZoom=5;
    animateView([cx-(w/targetZoom)/2,cy-(h/targetZoom)/2],targetZoom,750);
    return;
   }
  }
 }

 function selectPlace(code){
  hideTooltip();
  selected=code;
  citySearch='';
  cityFilter='all';
  cityLimit=60;
  zoomTo(code);
  render();
  if(mode==='brasil'&&code){
   loadLiveCities(code);
  }
 }

 async function loadLiveCities(uf,force=false){
  if(!uf)return;
  if(!force&&liveCitiesCache.has(uf)){
   renderCitiesSection();
   return;
  }
  loadingStates.add(uf);
  renderCitiesSection();
  try{
   const res=await fetch(`/api/cities?uf=${uf}${force?'&t='+Date.now():''}`);
   if(!res.ok)throw new Error('Falha ao obter cidades');
   const data=await res.json();
   liveCitiesCache.set(uf,data);
  }catch(e){
   console.error('Erro ao buscar cidades ao vivo:',e);
  }finally{
   loadingStates.delete(uf);
   if(selected===uf){
    renderCitiesSection();
   }
  }
 }

 function renderCityRows(cities){
  return cities.map(c=>{
   if(c.apurado||c.secoes>0){
    const vTot=c.lula+c.bolsonaro;
    const lPct=vTot?(c.lula/vTot*100).toFixed(1).replace('.',',')+'%':'—';
    const bPct=vTot?(c.bolsonaro/vTot*100).toFixed(1).replace('.',',')+'%':'—';
    const lWidth=vTot?(c.lula/vTot*100):50;
    const bWidth=vTot?(c.bolsonaro/vTot*100):50;
    const leadClass=c.lula>c.bolsonaro?'lula-lead':c.bolsonaro>c.lula?'bolsonaro-lead':'';
    const pctSecoes=c.totalSecoes?(c.secoes/c.totalSecoes*100).toFixed(1).replace('.',',')+'%':'—';

    return `
     <div class="mun-card counted ${leadClass}">
      <div class="mun-header">
       <div class="mun-name-wrap">
        <b class="mun-name">${esc(c.nome)}</b>
        <span class="mun-badge-live">● ${fmt(c.secoes)}/${fmt(c.totalSecoes)} seções (${pctSecoes})</span>
       </div>
       <span class="mun-total-valid">${fmt(c.validos)} votos válidos</span>
      </div>
      <div class="mun-bar">
       <div class="mun-fill-red" style="width:${lWidth}%"></div>
       <div class="mun-fill-blue" style="width:${bWidth}%"></div>
      </div>
      <div class="mun-cand-row">
       <div class="mun-cand-item red-text">
        <img src="/lula.webp" class="mini-photo" alt="Lula">
        <span>Lula 13</span>
        <strong>${lPct}</strong>
        <small>(${fmt(c.lula)})</small>
       </div>
       <div class="mun-cand-item blue-text">
        <img src="/bolsonaro.webp" class="mini-photo" alt="Flávio">
        <span>Flávio 22</span>
        <strong>${bPct}</strong>
        <small>(${fmt(c.bolsonaro)})</small>
       </div>
      </div>
     </div>
    `;
   }else{
    return `
     <div class="mun-card waiting">
      <div class="mun-header">
       <b class="mun-name">${esc(c.nome)}</b>
       <span class="mun-badge-waiting">0/${fmt(c.totalSecoes)} seções · Aguardando</span>
      </div>
      <div class="mun-bar-empty"></div>
      <div class="mun-waiting-text">Aguardando início da apuração oficial pelo TSE</div>
     </div>
    `;
   }
  }).join('');
 }

 function renderCitiesSection(){
  const container=document.querySelector('#city-results-container');
  const countBadge=document.querySelector('#cities-count-badge');
  const moreBtn=document.querySelector('#btn-more-cities');
  if(!container)return;

  if(!selected||mode!=='brasil'){
   container.innerHTML='';
   return;
  }

  if(loadingStates.has(selected)&&!liveCitiesCache.has(selected)){
   container.innerHTML=`
    <div class="cities-loading">
     <div class="spinner"></div>
     <p>Consultando apuração ao vivo dos municípios no TSE…</p>
    </div>
   `;
   if(countBadge)countBadge.textContent='Consultando TSE…';
   if(moreBtn)moreBtn.style.display='none';
   return;
  }

  const allCities=liveCitiesCache.get(selected)||[];
  const countedList=allCities.filter(c=>c.apurado||c.secoes>0);
  if(countBadge){
   countBadge.innerHTML=countedList.length>0
    ? `<strong class="green-text">${countedList.length}</strong> de ${allCities.length} apurados`
    : `${allCities.length} municípios`;
  }

  let list=allCities;
  if(cityFilter==='counted'){
   list=countedList;
  }
  if(citySearch.trim()){
   const q=norm(citySearch);
   list=list.filter(c=>norm(c.nome).includes(q));
  }

  if(list.length===0){
   container.innerHTML=cityFilter==='counted'&&countedList.length===0
    ? '<div class="cities-empty"><p>Nenhum município deste estado teve votos apurados ainda.</p><small>Assim que o TSE divulgar seções, elas aparecerão aqui ao vivo.</small></div>'
    : '<div class="cities-empty"><p>Nenhum município encontrado com este nome.</p></div>';
   if(moreBtn)moreBtn.style.display='none';
   return;
  }

  container.innerHTML=renderCityRows(list.slice(0,cityLimit));
  if(moreBtn){
   moreBtn.style.display=list.length>cityLimit?'block':'none';
   moreBtn.textContent=`Ver mais municípios (+${list.length-cityLimit})`;
  }
 }

 function detail(){
  const el=document.querySelector('#map-detail');
  const d=selected?dataFor(selected):null;

  if(!d){
   el.innerHTML=mode==='brasil'?`
    <div class="detail-header">
     <div class="detail-title-wrap">
      <span class="eyebrow">RESUMO NACIONAL · 2º TURNO</span>
      <h2>Por Região do Brasil</h2>
     </div>
    </div>
    <div class="regional-legend">
     <span class="red-text"><img src="/lula.webp" class="legend-photo" alt="Lula"> Lula · 13</span>
     <span class="blue-text"><img src="/bolsonaro.webp" class="legend-photo" alt="Flávio"> Flávio · 22</span>
    </div>
    <div class="region-cards-list">
     ${regionCards()}
    </div>
    ${exterior?.data?`
     <button class="exterior-region" data-map-mode="mundo">
      <b>◎ Votos no Exterior ↗</b>
      <span class="red-text"><img src="/lula.webp" class="mini-photo" alt="Lula"> 13 · ${fmt(exterior.data.total['13'])}</span>
      <span class="blue-text"><img src="/bolsonaro.webp" class="mini-photo" alt="Flávio"> 22 · ${fmt(exterior.data.total['22'])}</span>
      <small>${fmt(exterior.data.total.secoes)} seções apuradas no exterior</small>
     </button>
    `:''}
    <p class="footnote">Toque em qualquer estado no mapa para aproximar e ver todos os municípios ao vivo.</p>
   `:`
    <div class="detail-header">
     <div class="detail-title-wrap">
      <span class="eyebrow">BRASILEIROS NO EXTERIOR</span>
      <h2>Por País de Votação</h2>
     </div>
    </div>
    ${exterior?.data?`
     <div class="map-total">
      <strong>${fmt(exterior.data.total['13']+exterior.data.total['22'])}</strong>
      <span>votos válidos apurados no exterior</span>
      <small>${fmt(exterior.data.total.secoes)} de ${fmt(exterior.data.total.de)} seções coletadas</small>
     </div>
    `:''}
    <div class="map-country-list">
     ${Object.entries(countries()).sort((a,b)=>(b[1].red+b[1].blue)-(a[1].red+a[1].blue)).map(([k,c])=>`
      <button data-country="${k}">
       <span class="country-name">${esc(c.name)}</span>
       <span class="country-votes">
        <b class="red-text">13 · ${fmt(c.red)}</b>
        <b class="blue-text">22 · ${fmt(c.blue)}</b>
       </span>
      </button>
     `).join('')}
    </div>
   `;
   return;
  }

  const total=d.red+d.blue;
  const percent=n=>total?(n/total*100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%':'—';
  const pctTotal=d.totalSections?(d.sections/d.totalSections*100).toFixed(2).replace('.',',')+'%':'0%';

  el.innerHTML=`
   <div class="detail-header">
    <button class="back-countries" id="map-back">
     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
     Voltar para ${mode==='mundo'?'todos os países':'todos os estados'}
    </button>
    <div class="detail-title-wrap">
     <span class="eyebrow">${mode==='mundo'?'VOTOS NO EXTERIOR':'PRESIDENTE · TOTALIZAÇÃO OFICIAL'}</span>
     <h2>${esc(d.name)}</h2>
    </div>
   </div>

   <div class="map-candidates-grid">
    <div class="map-cand-box red">
     <div class="map-cand-box-top">
      <img src="/lula.webp" class="detail-photo" alt="Lula">
      <div class="cand-box-id">
       <strong>Lula</strong>
       <small>PT · 13</small>
      </div>
     </div>
     <div class="cand-box-stats">
      <div class="cand-box-pct red-text">${percent(d.red)}</div>
      <div class="cand-box-votes">${fmt(d.red)} votos</div>
     </div>
    </div>

    <div class="map-cand-box blue">
     <div class="map-cand-box-top">
      <img src="/bolsonaro.webp" class="detail-photo" alt="Flávio Bolsonaro">
      <div class="cand-box-id">
       <strong>Flávio Bolsonaro</strong>
       <small>PL · 22</small>
      </div>
     </div>
     <div class="cand-box-stats">
      <div class="cand-box-pct blue-text">${percent(d.blue)}</div>
      <div class="cand-box-votes">${fmt(d.blue)} votos</div>
     </div>
    </div>
   </div>

   <div class="state-summary-card">
    <div class="summary-line">
     <span>Seções apuradas:</span>
     <strong>${fmt(d.sections)} de ${fmt(d.totalSections)} (${pctTotal})</strong>
    </div>
    <div class="summary-line">
     <span>Total de votos válidos:</span>
     <strong>${fmt(total)} votos</strong>
    </div>
    <div class="summary-line">
     <span>Diferença atual:</span>
     <strong>${total?fmt(Math.abs(d.red-d.blue))+' votos ('+(Math.abs(d.red-d.blue)/total*100).toFixed(2).replace('.',',')+'%)':'Aguardando apuração'}</strong>
    </div>
   </div>

   ${d.error?'<div class="map-warning-box">Consulta oficial do TSE indisponível temporariamente.</div>':''}
   ${mode==='brasil'?'<button id="map-open" class="btn-state-panel">Ver apuração completa deste estado no painel ↗</button>':''}

   ${mode==='brasil'?`
    <div class="state-cities-section">
     <div class="state-cities-header">
      <div class="state-cities-title-row">
       <h3>Municípios de ${esc(d.name)}</h3>
       <span class="cities-count-badge" id="cities-count-badge">Carregando…</span>
      </div>
      <div class="cities-filter-tabs">
       <button class="city-filter-btn ${cityFilter==='all'?'active':''}" data-city-filter="all">Todos</button>
       <button class="city-filter-btn ${cityFilter==='counted'?'active':''}" data-city-filter="counted">Com votos apurados</button>
       <button id="city-refresh-btn" class="city-refresh-btn" title="Recarregar dados ao vivo do TSE">↻ Atualizar</button>
      </div>
      <div class="city-search-wrap">
       <input type="search" id="city-search" value="${esc(citySearch)}" placeholder="Buscar município (ex: Salvador)..." class="city-search-input">
      </div>
     </div>
     <div class="city-list" id="city-results-container"></div>
     <button id="btn-more-cities" class="btn-more-cities" style="display:none">Ver mais municípios</button>
    </div>
   `:`
    <div class="exterior-cities-section">
     <h3>Cidades com boletins de urna</h3>
     <div class="city-results">
      ${(d.cities||[]).map(c=>`
       <div class="exterior-city-row">
        <b>${esc(c.nome)}</b>
        <span class="red-text">13 · ${fmt(c['13'])}</span>
        <span class="blue-text">22 · ${fmt(c['22'])}</span>
        <small>${c.secoes}/${c.de} seções apuradas</small>
       </div>
      `).join('')}
     </div>
    </div>
   `}
  `;

  if(mode==='brasil'){
   const input=el.querySelector('#city-search');
   if(input){
    input.oninput=e=>{
     citySearch=e.target.value;
     cityLimit=60;
     renderCitiesSection();
    };
   }
   const filterBtns=el.querySelectorAll('[data-city-filter]');
   filterBtns.forEach(btn=>{
    btn.onclick=()=>{
     cityFilter=btn.dataset.cityFilter;
     filterBtns.forEach(b=>b.classList.toggle('active',b===btn));
     cityLimit=60;
     renderCitiesSection();
    };
   });
   const refreshCityBtn=el.querySelector('#city-refresh-btn');
   if(refreshCityBtn){
    refreshCityBtn.onclick=()=>{
     loadLiveCities(selected,true);
    };
   }
   const moreBtn=el.querySelector('#btn-more-cities');
   if(moreBtn){
    moreBtn.onclick=()=>{
     cityLimit+=60;
     renderCitiesSection();
    };
   }
   renderCitiesSection();
  }
 }

  function getRegionName(uf){
   for(const [r, ufs] of Object.entries(regions)){
    if(ufs.includes(uf)) return r;
   }
   return '';
  }

  function renderTooltipContent(code, placeName){
   if(mode==='brasil'){
    const d=dataFor(code);
    const stateName=getStates()[code]||placeName||code;
    const reg=getRegionName(code);
    const total=(d?.red||0)+(d?.blue||0);
    const hasData=total>0;
    const lVotes=d?.red||0;
    const bVotes=d?.blue||0;
    const lPct=hasData?(lVotes/total*100):50;
    const bPct=hasData?(bVotes/total*100):50;
    const lPctStr=hasData?lPct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%':'—';
    const bPctStr=hasData?bPct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%':'—';
    const diff=Math.abs(lVotes-bVotes);

    let badgeHtml='';
    if(!hasData){
     badgeHtml=`<span class="tip-badge badge-gray">Aguardando votos</span>`;
    }else if(lVotes>bVotes){
     badgeHtml=`<span class="tip-badge badge-red">● Lula +${fmt(diff)}</span>`;
    }else if(bVotes>lVotes){
     badgeHtml=`<span class="tip-badge badge-blue">● Flávio +${fmt(diff)}</span>`;
    }else{
     badgeHtml=`<span class="tip-badge badge-gray">Empate</span>`;
    }

    const sec=d?.sections||0;
    const totSec=d?.totalSections||0;
    const secPct=totSec?(sec/totSec*100).toFixed(1).replace('.',',')+'%':'0%';
    const subText=`${reg?'Região '+reg+' · ':''}${fmt(sec)} de ${fmt(totSec)} seções (${secPct})`;

    return `
     <div class="tip-header">
      <div class="tip-title-row">
       <div class="tip-title">${esc(stateName)} <span class="tip-uf-pill">${esc(code)}</span></div>
       ${badgeHtml}
      </div>
      <div class="tip-sub">${esc(subText)}</div>
     </div>

     <div class="tip-track ${hasData ? '' : 'empty'}">
      ${hasData ? `
       <div class="tip-track-lula" style="width:${lPct}%"></div>
       <div class="tip-track-bolsonaro" style="width:${bPct}%"></div>
      ` : ''}
     </div>

     <div class="tip-candidates">
      <div class="tip-candidate ${hasData&&lVotes>=bVotes?'tip-lead tip-lead-lula':''}">
       <img src="/lula.webp" class="tip-photo tip-photo-lula" alt="Lula">
       <div class="tip-candidate-info">
        <div class="tip-cand-name"><strong>Lula</strong> <small>PT · 13</small></div>
        <div class="tip-cand-votes">${hasData?fmt(lVotes)+' votos':'Sem apuração'}</div>
       </div>
       <div class="tip-cand-pct ${hasData ? 'red-text' : 'muted-text'}">${lPctStr}</div>
      </div>

      <div class="tip-candidate ${hasData&&bVotes>lVotes?'tip-lead tip-lead-bolsonaro':''}">
       <img src="/bolsonaro.webp" class="tip-photo tip-photo-bolsonaro" alt="Flávio Bolsonaro">
       <div class="tip-candidate-info">
        <div class="tip-cand-name"><strong>Flávio Bolsonaro</strong> <small>PL · 22</small></div>
        <div class="tip-cand-votes">${hasData?fmt(bVotes)+' votos':'Sem apuração'}</div>
       </div>
       <div class="tip-cand-pct ${hasData ? 'blue-text' : 'muted-text'}">${bPctStr}</div>
      </div>
     </div>

     <div class="tip-footer">
      <span class="tip-total">Total: <b>${fmt(total)}</b> válidos</span>
      <span class="tip-action">Clique para ver municípios ↗</span>
     </div>
    `;
   }else{
    const groups=countries();
    const d=groups[code];
    const countryName=d?.name||placeName||code;
    const total=(d?.red||0)+(d?.blue||0);
    const hasData=!!d&&total>0;
    const lVotes=d?.red||0;
    const bVotes=d?.blue||0;
    const lPct=hasData?(lVotes/total*100):50;
    const bPct=hasData?(bVotes/total*100):50;
    const lPctStr=hasData?lPct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%':'—';
    const bPctStr=hasData?bPct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%':'—';
    const diff=Math.abs(lVotes-bVotes);

    let badgeHtml='';
    if(!d){
     badgeHtml=`<span class="tip-badge badge-gray">Sem seções</span>`;
    }else if(!hasData){
     badgeHtml=`<span class="tip-badge badge-gray">Aguardando votos</span>`;
    }else if(lVotes>bVotes){
     badgeHtml=`<span class="tip-badge badge-red">● Lula +${fmt(diff)}</span>`;
    }else if(bVotes>lVotes){
     badgeHtml=`<span class="tip-badge badge-blue">● Flávio +${fmt(diff)}</span>`;
    }else{
     badgeHtml=`<span class="tip-badge badge-gray">Empate</span>`;
    }

    if(!d){
     return `
      <div class="tip-header">
       <div class="tip-title-row">
        <div class="tip-title">${esc(countryName)}</div>
        ${badgeHtml}
       </div>
       <div class="tip-sub">Votos no Exterior</div>
      </div>
      <div class="tip-empty-notice">
       <span>Nenhum boletim de urna recebido nesta localidade.</span>
      </div>
      <div class="tip-footer">
       <span class="tip-action">Brasileiros no exterior</span>
      </div>
     `;
    }

    const numCities=d.cities?.length||0;
    const sec=d.sections||0;
    const totSec=d.totalSections||0;
    const cityNames=d.cities?.map(c=>c.nome).slice(0,3).join(', ');
    const moreCount=(d.cities?.length||0)>3?' +'+(d.cities.length-3):'';
    const subText=`Votos no Exterior · ${numCities} ${numCities===1?'cidade':'cidades'}${cityNames?' ('+cityNames+moreCount+')':''} · ${fmt(sec)}/${fmt(totSec)} seções`;

    return `
     <div class="tip-header">
      <div class="tip-title-row">
       <div class="tip-title">${esc(countryName)}</div>
       ${badgeHtml}
      </div>
      <div class="tip-sub">${esc(subText)}</div>
     </div>

     <div class="tip-track">
      <div class="tip-track-lula" style="width:${lPct}%"></div>
      <div class="tip-track-bolsonaro" style="width:${bPct}%"></div>
     </div>

     <div class="tip-candidates">
      <div class="tip-candidate ${hasData&&lVotes>=bVotes?'tip-lead tip-lead-lula':''}">
       <img src="/lula.webp" class="tip-photo tip-photo-lula" alt="Lula">
       <div class="tip-candidate-info">
        <div class="tip-cand-name"><strong>Lula</strong> <small>PT · 13</small></div>
        <div class="tip-cand-votes">${fmt(lVotes)} votos</div>
       </div>
       <div class="tip-cand-pct red-text">${lPctStr}</div>
      </div>

      <div class="tip-candidate ${hasData&&bVotes>lVotes?'tip-lead tip-lead-bolsonaro':''}">
       <img src="/bolsonaro.webp" class="tip-photo tip-photo-bolsonaro" alt="Flávio Bolsonaro">
       <div class="tip-candidate-info">
        <div class="tip-cand-name"><strong>Flávio Bolsonaro</strong> <small>PL · 22</small></div>
        <div class="tip-cand-votes">${fmt(bVotes)} votos</div>
       </div>
       <div class="tip-cand-pct blue-text">${bPctStr}</div>
      </div>
     </div>

     <div class="tip-footer">
      <span class="tip-total">Total: <b>${fmt(total)}</b> válidos</span>
      <span class="tip-action">Clique para ver cidades ↗</span>
     </div>
    `;
   }
  }

 function path(geom,project){
  const polys=geom.type==='Polygon'?[geom.coordinates]:geom.coordinates;
  return polys.map(p=>p.map(r=>r.map((v,i)=>{
   const[x,y]=project(v);
   return(i?'L':'M')+x.toFixed(2)+','+y.toFixed(2);
  }).join('')+'Z').join('')).join('');
 }

 function clampPan(){
  const w=mode==='brasil'?440:1000,h=mode==='brasil'?440:520;
  const marginX=w*0.35,marginY=h*0.35;
  const minX=-marginX,maxX=w+marginX-w/zoom;
  const minY=-marginY,maxY=h+marginY-h/zoom;
  if(minX<=maxX){
   pan[0]=Math.max(minX,Math.min(maxX,pan[0]));
  }else{
   pan[0]=(w-w/zoom)/2;
  }
  if(minY<=maxY){
   pan[1]=Math.max(minY,Math.min(maxY,pan[1]));
  }else{
   pan[1]=(h-h/zoom)/2;
  }
 }

 function getSvgPoint(clientX,clientY){
  if(clientX==null||clientY==null)return null;
  const svg=canvas.querySelector('svg');
  if(!svg)return null;
  try{
   const ctm=svg.getScreenCTM();
   if(ctm){
    const pt=svg.createSVGPoint();
    pt.x=clientX;
    pt.y=clientY;
    const res=pt.matrixTransform(ctm.inverse());
    if(res&&!isNaN(res.x)&&!isNaN(res.y)){
     return {x:res.x,y:res.y};
    }
   }
  }catch{}
  const rect=canvas.getBoundingClientRect();
  if(!rect.width||!rect.height)return null;
  const uX=(clientX-rect.left)/rect.width;
  const uY=(clientY-rect.top)/rect.height;
  const w=mode==='brasil'?440:1000;
  const h=mode==='brasil'?440:520;
  return {
   x:pan[0]+uX*(w/zoom),
   y:pan[1]+uY*(h/zoom)
  };
 }

 function zoomAtPoint(factor,clientX=null,clientY=null){
  hideTooltip();
  if(animId){cancelAnimationFrame(animId);animId=null}
  const w=mode==='brasil'?440:1000,h=mode==='brasil'?440:520;
  const next=Math.max(1,Math.min(16,zoom*factor));
  if(next===zoom)return;

  let focalX=null,focalY=null;
  if(clientX!=null&&clientY!=null){
   const pt=getSvgPoint(clientX,clientY);
   if(pt&&!isNaN(pt.x)&&!isNaN(pt.y)){
    focalX=pt.x;
    focalY=pt.y;
   }
  }
  if(focalX==null||focalY==null){
   focalX=pan[0]+(w/zoom)/2;
   focalY=pan[1]+(h/zoom)/2;
  }

  pan=[
   focalX-(focalX-pan[0])*(zoom/next),
   focalY-(focalY-pan[1])*(zoom/next)
  ];
  zoom=next;
  clampPan();
  view();
 }

 function view(){
  const svg=canvas.querySelector('svg');
  if(!svg)return;
  const width=mode==='brasil'?440:1000,height=mode==='brasil'?440:520;
  svg.setAttribute('viewBox',`${pan[0]} ${pan[1]} ${width/zoom} ${height/zoom}`);
 }

 function render(){
  const geo=mode==='brasil'?getBrazil():world;
  if(!geo){
   canvas.innerHTML='<p class="empty">Carregando malha geográfica…</p>';
   detail();
   updateCandidateBar();
   return;
  }
  const groups=countries(),matched=new Set();
  const project=mode==='brasil'?([x,y])=>[(x+75)*10,(7-y)*10]:([x,y])=>[(x+180)*1000/360,(85-y)*520/170];

  const shapes=geo.features.filter(f=>mode==='brasil'||f.properties.iso!=='AQ').map(f=>{
   const code=mode==='brasil'?ids[f.properties.codarea]:key(f.properties.name);
   const d=mode==='brasil'?dataFor(code):groups[code];
   if(d)matched.add(code);
   const name=mode==='brasil'?getStates()[code]:f.properties.name;
   return `
    <path d="${path(f.geometry,project)}" fill="${heatColor(d?.red||0,d?.blue||0)}" class="${code===selected?'map-selected':''}" ${d||mode==='brasil'?`data-place="${esc(code)}" data-name="${esc(name)}" tabindex="0" role="button" aria-label="${esc(name)}"`:''}>
    </path>
   `;
  }).join('');

  const markers=mode==='mundo'?Object.entries(groups).filter(([k])=>!matched.has(k)).map(([k,d])=>{
   const coord=small[d.name];
   if(!coord)return '';
   const[x,y]=project(coord);
   return `
    <circle cx="${x}" cy="${y}" r="5" fill="${heatColor(d.red,d.blue)}" class="${k===selected?'map-selected':''}" data-place="${k}" data-name="${esc(d.name)}" tabindex="0" role="button" aria-label="${esc(d.name)}">
    </circle>
   `;
  }).join(''):'';

  canvas.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" aria-label="Mapa de calor ${mode==='brasil'?'do Brasil':'mundial dos votos brasileiros no exterior'}">${shapes}${markers}</svg>`;
  view();
  detail();
  updateCandidateBar();

  const formatBrasilia=ts=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(ts?new Date(ts):new Date());
  const nowBrasilia=formatBrasilia(lastCheckedAt||Date.now());
  document.querySelectorAll('.last-update-val').forEach(el=>el.textContent=nowBrasilia);

  const freshness=document.querySelector('#map-freshness');
  if(freshness){
   if(mode==='mundo'){
    freshness.innerHTML=exterior?.error?'Última carga preservada':exterior?.data?`Boletins exterior: <b>${formatBrasilia(exterior.data.gerado)}</b> <small>(horário de Brasília)</small>`:'Aguardando feed do exterior';
   }else{
    freshness.innerHTML=`Fonte: TSE oficial · Atualizado às <b>${nowBrasilia}</b> <small>(horário de Brasília)</small> · a cada 15 s`;
   }
  }

  document.querySelector('#map-source').innerHTML=mode==='mundo'
   ?`<b>Fonte dos dados:</b> boletins de urna oficiais do exterior apurados pelo Tribunal Superior Eleitoral (TSE). Malha: Natural Earth.`
   :'<b>Fonte dos dados:</b> arquivos oficiais de totalização e apuração municipal do Tribunal Superior Eleitoral (TSE). Malha: IBGE.';
 }

 async function refresh(){
  lastCheckedAt=Date.now();
  if(typeof onRefresh==='function')try{onRefresh()}catch{}
  try{
   const r=await fetch('/api/exterior');
   if(!r.ok)throw Error('Feed indisponível');
   exterior=await r.json();
   document.dispatchEvent(new CustomEvent('exterior-update',{detail:exterior}));
   render();
  }catch{
   exterior={...exterior,error:'Falha de conexão'};
   render();
  }
 }

 root.addEventListener('click',e=>{
  const b=e.target.closest('[data-map-mode]');
  if(b){
   mode=b.dataset.mapMode;
   root.querySelectorAll('[data-map-mode]').forEach(x=>x.classList.toggle('selected',x===b));
   selectPlace(null);
   return;
  }
  const c=e.target.closest('[data-country]');
  if(c){
   selectPlace(c.dataset.country);
   return;
  }
  if(e.target.closest('#map-back')){
   selectPlace(null);
   return;
  }
  if(e.target.closest('#map-open')){
   onSelect(selected);
   location.hash='#painel';
  }
 });

 let justSelected=false;

 canvas.addEventListener('click',e=>{
  if(justSelected||justGestured||gestureMoved){
   e.preventDefault();
   e.stopPropagation();
   return;
  }
  const p=e.target.closest('[data-place]')?.getAttribute('data-place')||targetPlaceCandidate;
  if(p)selectPlace(p);
 });
 canvas.addEventListener('keydown',e=>{
  if(['Enter',' '].includes(e.key)){
   const p=e.target.closest('[data-place]');
   if(p){
    e.preventDefault();
    selectPlace(p.getAttribute('data-place')||p.dataset.place);
   }
  }
 });

 canvas.addEventListener('wheel',e=>{
  e.preventDefault();
  let dy=e.deltaY;
  if(e.deltaMode===1)dy*=20;
  else if(e.deltaMode===2)dy*=60;
  const factor=e.ctrlKey
   ? Math.exp(-dy*0.01)
   : Math.exp(-dy*0.0025);
  zoomAtPoint(factor,e.clientX,e.clientY);
 },{passive:false});

 canvas.addEventListener('dblclick',e=>{
  e.preventDefault();
  zoomAtPoint(e.shiftKey?1/1.5:1.5,e.clientX,e.clientY);
 });

 canvas.addEventListener('pointerdown',e=>{
  hideTooltip();
  if(animId){cancelAnimationFrame(animId);animId=null}
  if(e.pointerType==='mouse'&&e.button!==0)return;

  activePointers.set(e.pointerId,{x:e.clientX,y:e.clientY});

  if(activePointers.size===1){
   dragStartPos={x:e.clientX,y:e.clientY};
   dragStartPan=[...pan];
   gestureMoved=false;
   const placeEl=e.target.closest('[data-place]');
   targetPlaceCandidate=placeEl?(placeEl.getAttribute('data-place')||placeEl.dataset.place):null;
  }else if(activePointers.size===2){
   gestureMoved=true;
   targetPlaceCandidate=null;
   canvas.classList.add('is-dragging');
   hideTooltip();
   const [p1,p2]=Array.from(activePointers.values());
   pinchStartDist=Math.hypot(p1.x-p2.x,p1.y-p2.y)||1;
   pinchStartMid={x:(p1.x+p2.x)/2,y:(p1.y+p2.y)/2};
   pinchStartZoom=zoom;
   pinchStartPan=[...pan];
   pinchFocalPt=getSvgPoint(pinchStartMid.x,pinchStartMid.y);
  }
 });

 window.addEventListener('pointermove',e=>{
  if(!activePointers.has(e.pointerId))return;
  activePointers.set(e.pointerId,{x:e.clientX,y:e.clientY});

  if(activePointers.size===1){
   const dx=e.clientX-dragStartPos.x,dy=e.clientY-dragStartPos.y;
   if(!gestureMoved&&Math.hypot(dx,dy)>10){
    gestureMoved=true;
    targetPlaceCandidate=null;
    canvas.classList.add('is-dragging');
    hideTooltip();
   }
   if(gestureMoved){
    const w=mode==='brasil'?440:1000,h=mode==='brasil'?440:520;
    const svg=canvas.querySelector('svg');
    const svgRect=svg?svg.getBoundingClientRect():canvas.getBoundingClientRect();
    const scaleX=(w/zoom)/(svgRect.width||canvas.clientWidth||1);
    const scaleY=(h/zoom)/(svgRect.height||canvas.clientHeight||1);
    pan=[dragStartPan[0]-dx*scaleX,dragStartPan[1]-dy*scaleY];
    clampPan();
    view();
   }
  }else if(activePointers.size>=2){
   gestureMoved=true;
   targetPlaceCandidate=null;
   canvas.classList.add('is-dragging');
   hideTooltip();
   const [p1,p2]=Array.from(activePointers.values()).slice(0,2);
   const curDist=Math.hypot(p1.x-p2.x,p1.y-p2.y)||1;
   const curMid={x:(p1.x+p2.x)/2,y:(p1.y+p2.y)/2};

   if(pinchStartDist>0){
    const scaleFactor=curDist/pinchStartDist;
    const nextZoom=Math.max(1,Math.min(16,pinchStartZoom*scaleFactor));
    const w=mode==='brasil'?440:1000,h=mode==='brasil'?440:520;

    const focalX=pinchFocalPt?pinchFocalPt.x:pinchStartPan[0]+(w/pinchStartZoom)/2;
    const focalY=pinchFocalPt?pinchFocalPt.y:pinchStartPan[1]+(h/pinchStartZoom)/2;

    const zoomPanX=focalX-(focalX-pinchStartPan[0])*(pinchStartZoom/nextZoom);
    const zoomPanY=focalY-(focalY-pinchStartPan[1])*(pinchStartZoom/nextZoom);

    const svg=canvas.querySelector('svg');
    const svgRect=svg?svg.getBoundingClientRect():canvas.getBoundingClientRect();
    const scaleX=(w/nextZoom)/(svgRect.width||canvas.clientWidth||1);
    const scaleY=(h/nextZoom)/(svgRect.height||canvas.clientHeight||1);

    pan=[
     zoomPanX-(curMid.x-pinchStartMid.x)*scaleX,
     zoomPanY-(curMid.y-pinchStartMid.y)*scaleY
    ];
    zoom=nextZoom;
    clampPan();
    view();
   }
  }
 });

 function onPointerEnd(e){
  if(!activePointers.has(e.pointerId))return;
  activePointers.delete(e.pointerId);

  if(activePointers.size===1){
   const remaining=Array.from(activePointers.values())[0];
   dragStartPos={x:remaining.x,y:remaining.y};
   dragStartPan=[...pan];
   gestureMoved=true;
   targetPlaceCandidate=null;
  }else if(activePointers.size===0){
   canvas.classList.remove('is-dragging');
   if(gestureMoved){
    justGestured=true;
    setTimeout(()=>{justGestured=false},100);
   }else if(targetPlaceCandidate){
    const placeToSelect=targetPlaceCandidate;
    justSelected=true;
    setTimeout(()=>{justSelected=false},300);
    selectPlace(placeToSelect);
   }
   targetPlaceCandidate=null;
   gestureMoved=false;
  }
 }

 window.addEventListener('pointerup',onPointerEnd);
 window.addEventListener('pointercancel',onPointerEnd);

 canvas.addEventListener('touchstart',e=>{
  if(e.touches.length>1)e.preventDefault();
 },{passive:false});

 canvas.addEventListener('touchmove',e=>{
  e.preventDefault();
 },{passive:false});

 canvas.addEventListener('gesturestart',e=>e.preventDefault());
 canvas.addEventListener('gesturechange',e=>e.preventDefault());
 canvas.addEventListener('gestureend',e=>e.preventDefault());

 mapWrap.addEventListener('pointermove',e=>{
  if(gestureMoved||activePointers.size>0){
   hideTooltip();
   return;
  }
  const placeEl=e.target.closest('[data-place]');
  if(!placeEl){
   hideTooltip();
   return;
  }
  const code=placeEl.dataset.place;
  const name=placeEl.dataset.name||code;
  if(activeTooltipPlace!==code){
   activeTooltipPlace=code;
   tooltip.innerHTML=renderTooltipContent(code,name);
   tooltip.hidden=false;
  }
  updateTooltipPos(e.clientX,e.clientY);
 });

 mapWrap.addEventListener('pointerleave',hideTooltip);

 canvas.addEventListener('focusin',e=>{
  const placeEl=e.target.closest('[data-place]');
  if(placeEl){
   const code=placeEl.dataset.place;
   const name=placeEl.dataset.name||code;
   activeTooltipPlace=code;
   tooltip.innerHTML=renderTooltipContent(code,name);
   tooltip.hidden=false;
   const elRect=placeEl.getBoundingClientRect();
   updateTooltipPos(elRect.left+elRect.width/2,elRect.top);
  }
 });
 canvas.addEventListener('focusout',hideTooltip);

 document.querySelector('#zoom-in').onclick=()=>zoomAtPoint(1.4);
 document.querySelector('#zoom-out').onclick=()=>zoomAtPoint(1/1.4);
 document.querySelector('#zoom-reset').onclick=()=>selectPlace(null);
 document.querySelector('#map-refresh').onclick=refresh;

 fetch('/world.json').then(r=>r.json()).then(g=>{world=g;render()}).catch(()=>{canvas.textContent='Não foi possível carregar a malha mundial.'});
 refresh();
 setInterval(refresh,15000);
 document.addEventListener('atlas-update',()=>{lastCheckedAt=Date.now();render()});
 route();

 return {render};
}
