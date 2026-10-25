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
// Small territories absent from Natural Earth's 1:110m polygons remain selectable as markers.
const small={Singapura:[103.82,1.35],Malta:[14.38,35.94],Bahrain:[50.55,26.07],Bahrein:[50.55,26.07],'Hong Kong':[114.17,22.32],'Cabo Verde':[-23.61,15.12],Maurício:[57.55,-20.2],Luxemburgo:[6.13,49.61],Andorra:[1.52,42.51],'São Tomé e Príncipe':[6.73,.34],Maldivas:[73.5,4.17],Barbados:[-59.55,13.19]};

export function initMaps({getAtlas,getStates,getBrazil,onSelect}){
 let mode='brasil',world=null,exterior=null,selected=null,municipios=null,citySearch='',cityLimit=80,zoom=1,pan=[0,0],drag=null,animId=null;
 const main=document.querySelector('main');
 main.insertAdjacentHTML('afterbegin',`<section id="maps-page" hidden><div class="map-heading"><div class="map-heading-title"><span class="eyebrow">MAPA ELEITORAL · 2º TURNO</span><h1>Um país. <em>Pelo mundo.</em></h1></div><div class="map-toolbar"><div class="tabs"><button data-map-mode="brasil" class="selected">Brasil</button><button data-map-mode="mundo">Mundo · Exterior</button></div><span id="map-freshness">Consultando resultados…</span><button id="map-refresh">↻ Atualizar</button></div></div><div class="map-candidate-bar" id="map-candidate-bar"><div class="map-cand-side lula"><img src="/lula.webp" class="cand-bar-photo" alt="Lula"><div class="cand-bar-meta"><div class="cand-bar-title"><strong>Lula</strong> <small>PT · 13</small></div><div class="cand-bar-pct red-text" id="bar-lula-pct">—</div></div><div class="cand-bar-votes" id="bar-lula-votes">0 votos</div></div><div class="map-bar-center"><div class="map-bar-track"><div class="map-bar-fill-lula" id="bar-track-lula" style="width:50%"></div><div class="map-bar-fill-bolsonaro" id="bar-track-bolsonaro" style="width:50%"></div></div><div class="map-bar-status" id="bar-status-text">TOTALIZAÇÃO NACIONAL</div></div><div class="map-cand-side bolsonaro"><div class="cand-bar-votes" id="bar-bolsonaro-votes">0 votos</div><div class="cand-bar-meta right"><div class="cand-bar-title"><small>PL · 22</small> <strong>Flávio Bolsonaro</strong></div><div class="cand-bar-pct blue-text" id="bar-bolsonaro-pct">—</div></div><img src="/bolsonaro.webp" class="cand-bar-photo" alt="Flávio Bolsonaro"></div></div><div class="map-layout"><div class="map-canvas-wrap"><div class="map-controls"><button id="zoom-in" aria-label="Ampliar mapa">+</button><button id="zoom-out" aria-label="Reduzir mapa">−</button><button id="zoom-reset">Enquadrar</button></div><div id="heat-map" class="heat-map"></div><div class="map-footer-bar"><div class="heat-legend"><span class="red-text"><img src="/lula.webp" class="legend-photo" alt="Lula"> Lula · 13</span><div class="heat-gradient-wrap"><div class="heat-gradient"></div><small>Vantagem Lula 13 ← Empate → Vantagem Flávio 22</small></div><span class="blue-text"><img src="/bolsonaro.webp" class="legend-photo" alt="Flávio Bolsonaro"> Flávio · 22</span></div><p class="map-caption">Intensidade = diferença percentual dos votos válidos</p></div></div><aside class="map-detail" id="map-detail"></aside></div><div class="map-source" id="map-source"></div></section>`);
 document.querySelector('nav').innerHTML='<a href="#mapas" class="current">01 · Mapa</a><a href="#painel">02 · Apuração</a>';
 document.querySelector('.columns').hidden=true;document.querySelector('.transparency').hidden=true;
 const root=document.querySelector('#maps-page'),canvas=document.querySelector('#heat-map');

 function route(){const show=location.hash!=='#painel';document.body.classList.toggle('maps-view',show);root.hidden=!show;document.querySelectorAll('nav a').forEach(a=>a.classList.toggle('current',a.hash===(show?'#mapas':'#painel')));if(show)render()}
 window.addEventListener('hashchange',route);

 function countries(){const out={};for(const c of exterior?.data?.cidades||[]){const k=key(c.pais),v=out[k]??={name:c.pais,red:0,blue:0,sections:0,totalSections:0,cities:[],sourceKind:'external-bu'};v.red+=c['13'];v.blue+=c['22'];v.sections+=c.secoes;v.totalSections+=c.de;v.cities.push(c)}return out}
 function dataFor(code){if(mode==='mundo')return countries()[code];const r=getAtlas()[code],d=r?.data;return {name:getStates()[code]||code,red:d?.candidates.find(c=>c.number==='13')?.votes||0,blue:d?.candidates.find(c=>c.number==='22')?.votes||0,sections:d?.counted,totalSections:d?.sections,generated:d?.generated,error:r?.error}}

 function regionCards(){return Object.entries(regions).map(([name,codes])=>{const rows=codes.map(dataFor),red=rows.reduce((s,d)=>s+d.red,0),blue=rows.reduce((s,d)=>s+d.blue,0),sections=rows.reduce((s,d)=>s+(d.sections||0),0),all=rows.reduce((s,d)=>s+(d.totalSections||0),0),available=codes.filter(c=>getAtlas()[c]?.data&&!getAtlas()[c]?.error).length;return `<article class="region-card"><div class="region-heading"><b>Região ${name}</b><small>${all?(sections/all*100).toFixed(1).replace('.',',')+'%':'—'} apurado</small></div><div class="region-votes"><span class="red-text">13 · <strong>${fmt(red)}</strong></span><span class="blue-text">22 · <strong>${fmt(blue)}</strong></span></div><div class="region-split"><i style="width:${red+blue?red/(red+blue)*100:0}%"></i><i style="width:${red+blue?blue/(red+blue)*100:0}%"></i></div>${available<codes.length?`<small class="coverage">${available}/${codes.length} UFs disponíveis</small>`:''}<details class="region-expand"><summary>Ver estados da região</summary><div class="region-states">${codes.map(c=>`<button data-country="${c}">${c}</button>`).join('')}</div></details></article>`}).join('')}

 function updateCandidateBar(){
  const barLulaPct=document.querySelector('#bar-lula-pct'),barBolsonaroPct=document.querySelector('#bar-bolsonaro-pct');
  const barLulaVotes=document.querySelector('#bar-lula-votes'),barBolsonaroVotes=document.querySelector('#bar-bolsonaro-votes');
  const barTrackLula=document.querySelector('#bar-track-lula'),barTrackBolsonaro=document.querySelector('#bar-track-bolsonaro');
  const barStatus=document.querySelector('#bar-status-text');
  if(!barLulaPct)return;
  let red=0,blue=0,label='';
  if(selected){
   const d=dataFor(selected);
   if(d&&(d.red>0||d.blue>0)){red=d.red;blue=d.blue;label=mode==='brasil'?`ESTADO: ${d.name} (${selected})`:`EXTERIOR: ${d.name}`}
  }
  if(!red&&!blue){
   if(mode==='brasil'){
    const atlas=getAtlas();
    for(const k in atlas){const cands=atlas[k]?.data?.candidates||[];red+=cands.find(c=>c.number==='13')?.votes||0;blue+=cands.find(c=>c.number==='22')?.votes||0}
    label=selected?`${dataFor(selected).name} (sem votos parciais) · Total Nacional`:'TOTALIZAÇÃO GERAL · BRASIL';
   }else{
    red=exterior?.data?.total?.['13']||0;blue=exterior?.data?.total?.['22']||0;label='EXTERIOR · TOTAL DOS BOLETINS';
   }
  }
  const tot=red+blue,lPct=tot?(red/tot*100):50,bPct=tot?(blue/tot*100):50;
  barLulaPct.textContent=tot?lPct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%':'—';
  barBolsonaroPct.textContent=tot?bPct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%':'—';
  barLulaVotes.textContent=fmt(red)+' votos';barBolsonaroVotes.textContent=fmt(blue)+' votos';
  barTrackLula.style.width=lPct+'%';barTrackBolsonaro.style.width=bPct+'%';
  barStatus.textContent=label;
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

 function animateView(targetPan,targetZoom,duration=800){
  if(animId)cancelAnimationFrame(animId);
  const startPan=[...pan],startZoom=zoom,startTime=performance.now();
  function step(now){
   const elapsed=now-startTime,t=Math.min(1,elapsed/duration);
   const ease=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
   pan=[startPan[0]+(targetPan[0]-startPan[0])*ease,startPan[1]+(targetPan[1]-startPan[1])*ease];
   zoom=startZoom+(targetZoom-startZoom)*ease;
   view();
   if(t<1)animId=requestAnimationFrame(step);else{animId=null;pan=[...targetPan];zoom=targetZoom;view()}
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
     animateView([cx-(w/targetZoom)/2,cy-(h/targetZoom)/2],targetZoom,800);
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
     animateView([cx-(w/targetZoom)/2,cy-(h/targetZoom)/2],targetZoom,800);
     return;
    }
   }
   const cName=countries()[code]?.name,coord=cName?small[cName]:null;
   if(coord){
    const[cx,cy]=project(coord),targetZoom=5;
    animateView([cx-(w/targetZoom)/2,cy-(h/targetZoom)/2],targetZoom,800);
    return;
   }
  }
 }

 function selectPlace(code){
  selected=code;citySearch='';cityLimit=80;zoomTo(code);render();
 }

 function renderCityRows(cities){
  return cities.map(c=>{
   const vTot=c.lula+c.bolsonaro;
   const lPct=vTot?(c.lula/vTot*100).toFixed(1).replace('.',',')+'%':'—';
   const bPct=vTot?(c.bolsonaro/vTot*100).toFixed(1).replace('.',',')+'%':'—';
   const lWidth=vTot?(c.lula/vTot*100):50,bWidth=vTot?(c.bolsonaro/vTot*100):50;
   const leadClass=c.lula>c.bolsonaro?'lula-lead':c.bolsonaro>c.lula?'bolsonaro-lead':'';
   return `<div class="mun-card ${leadClass}"><div class="mun-top"><b class="mun-name">${esc(c.nome)}</b><span class="mun-valid">${fmt(c.validos)} votos válidos</span></div><div class="mun-bar"><i class="mun-fill-red" style="width:${lWidth}%"></i><i class="mun-fill-blue" style="width:${bWidth}%"></i></div><div class="mun-votes"><span class="red-text"><img src="/lula.webp" class="mini-photo" alt="Lula"> Lula 13 · <strong>${lPct}</strong> <small>(${fmt(c.lula)})</small></span><span class="blue-text"><img src="/bolsonaro.webp" class="mini-photo" alt="Flávio"> Flávio 22 · <strong>${bPct}</strong> <small>(${fmt(c.bolsonaro)})</small></span></div></div>`
  }).join('');
 }

 function detail(){
  const el=document.querySelector('#map-detail');
  const d=selected?dataFor(selected):null;
  if(!d){
   el.innerHTML=mode==='brasil'?`<span class="eyebrow">RESUMO NACIONAL</span><h2>Por região</h2><div class="regional-legend"><span class="red-text"><img src="/lula.webp" class="legend-photo" alt="Lula"> Lula · 13</span><span class="blue-text"><img src="/bolsonaro.webp" class="legend-photo" alt="Flávio Bolsonaro"> Flávio · 22</span></div>${regionCards()}${exterior?.data?`<button class="exterior-region" data-map-mode="mundo"><b>◎ Votos no Exterior ↗</b><span class="red-text"><img src="/lula.webp" class="mini-photo" alt="Lula"> 13 · ${fmt(exterior.data.total['13'])}</span><span class="blue-text"><img src="/bolsonaro.webp" class="mini-photo" alt="Flávio"> 22 · ${fmt(exterior.data.total['22'])}</span><small>${fmt(exterior.data.total.secoes)} seções apuradas no exterior</small></button>`:''}<p class="footnote">Clique em um estado para aproximar e visualizar todas as cidades.</p>`:`<span class="eyebrow">BRASILEIROS NO EXTERIOR</span><h2>Por país</h2>${exterior?.data?`<div class="map-total"><strong>${fmt(exterior.data.total['13']+exterior.data.total['22'])}</strong><span>votos válidos apurados no exterior</span></div><p>${fmt(exterior.data.total.secoes)} de ${fmt(exterior.data.total.de)} seções coletadas.</p>`:''}<div class="map-country-list">${Object.entries(countries()).sort((a,b)=>(b[1].red+b[1].blue)-(a[1].red+a[1].blue)).map(([k,c])=>`<button data-country="${k}"><span>${esc(c.name)}</span><span><b class="red-text">13 · ${fmt(c.red)}</b><b class="blue-text">22 · ${fmt(c.blue)}</b></span></button>`).join('')}</div>`;
   return;
  }
  const total=d.red+d.blue;const percent=n=>total?(n/total*100).toLocaleString('pt-BR',{maximumFractionDigits:2})+'%':'—';
  const stateCities=mode==='brasil'?(municipios?.[selected]||[]):[];
  const filterList=()=>citySearch.trim()?stateCities.filter(c=>norm(c.nome).includes(norm(citySearch))):stateCities;
  const filtered=filterList();

  el.innerHTML=`<button class="back-countries" id="map-back">← Voltar para ${mode==='mundo'?'todos os países':'todos os estados'}</button><span class="eyebrow">${mode==='mundo'?'VOTOS NO EXTERIOR':'PRESIDENTE · TOTALIZAÇÃO'}</span><h2>${esc(d.name)}</h2><div class="map-candidate red"><img src="/lula.webp" class="detail-photo" alt="Lula"><div class="map-candidate-info"><span>Lula <small>PT · 13</small></span><strong>${percent(d.red)}</strong></div><b>${fmt(d.red)} votos</b></div><div class="map-candidate blue"><img src="/bolsonaro.webp" class="detail-photo" alt="Flávio Bolsonaro"><div class="map-candidate-info"><span>Flávio Bolsonaro <small>PL · 22</small></span><strong>${percent(d.blue)}</strong></div><b>${fmt(d.blue)} votos</b></div><p class="map-diff">${total?'Diferença: '+fmt(Math.abs(d.red-d.blue))+' votos':'Aguardando apuração nesta localidade'}</p><p class="map-sections">${fmt(d.sections)} de ${fmt(d.totalSections)} seções ${mode==='mundo'?'coletadas':'totalizadas'}</p>${d.error?'<p class="map-warning">Consulta oficial indisponível no momento.</p>':''}${mode==='brasil'?'<button id="map-open">Abrir painel detalhado deste estado ↗</button>':''}${mode==='brasil'?`<div class="state-cities-section"><div class="state-cities-header"><h3>Cidades de ${esc(d.name)} <small>(${stateCities.length})</small></h3><input type="search" id="city-search" value="${esc(citySearch)}" placeholder="Buscar cidade (ex: Campinas)..." class="city-search-input"></div><div class="city-list" id="city-results-container">${filtered.length===0?'<p class="footnote">Nenhuma cidade encontrada.</p>':renderCityRows(filtered.slice(0,cityLimit))}</div>${filtered.length>cityLimit?`<button id="btn-more-cities" class="btn-more-cities">Ver mais cidades (+${filtered.length-cityLimit})</button>`:''}</div>`:`<h3>Cidades com boletins apurados</h3><div class="city-results">${d.cities.map(c=>`<div><b>${esc(c.nome)}</b><span class="red-text">13 · ${fmt(c['13'])}</span><span class="blue-text">22 · ${fmt(c['22'])}</span><small>${c.secoes}/${c.de} seções</small></div>`).join('')}</div>`}`;

  if(mode==='brasil'){
   const input=el.querySelector('#city-search');
   if(input){
    input.oninput=e=>{
     citySearch=e.target.value;cityLimit=80;
     const container=el.querySelector('#city-results-container'),more=el.querySelector('#btn-more-cities');
     const list=filterList();
     if(container)container.innerHTML=list.length===0?'<p class="footnote">Nenhuma cidade encontrada.</p>':renderCityRows(list.slice(0,cityLimit));
     if(more){more.style.display=list.length>cityLimit?'block':'none';more.textContent=`Ver mais cidades (+${list.length-cityLimit})`}
    };
   }
   const more=el.querySelector('#btn-more-cities');
   if(more){
    more.onclick=()=>{
     cityLimit+=80;const container=el.querySelector('#city-results-container');
     const list=filterList();
     if(container)container.innerHTML=renderCityRows(list.slice(0,cityLimit));
     more.style.display=list.length>cityLimit?'block':'none';
     more.textContent=`Ver mais cidades (+${list.length-cityLimit})`;
    };
   }
  }
 }

 function path(geom,project){const polys=geom.type==='Polygon'?[geom.coordinates]:geom.coordinates;return polys.map(p=>p.map(r=>r.map((v,i)=>{const[x,y]=project(v);return(i?'L':'M')+x.toFixed(2)+','+y.toFixed(2)}).join('')+'Z').join('')).join('')}
 function view(){const svg=canvas.querySelector('svg');if(!svg)return;const width=mode==='brasil'?440:1000,height=mode==='brasil'?440:520;svg.setAttribute('viewBox',`${pan[0]} ${pan[1]} ${width/zoom} ${height/zoom}`)}

 function render(){
  const geo=mode==='brasil'?getBrazil():world;
  if(!geo){canvas.innerHTML='<p class="empty">Carregando malha geográfica…</p>';detail();updateCandidateBar();return}
  const groups=countries(),matched=new Set();
  const project=mode==='brasil'?([x,y])=>[(x+75)*10,(7-y)*10]:([x,y])=>[(x+180)*1000/360,(85-y)*520/170];
  const shapes=geo.features.filter(f=>mode==='brasil'||f.properties.iso!=='AQ').map(f=>{
   const code=mode==='brasil'?ids[f.properties.codarea]:key(f.properties.name);
   const d=mode==='brasil'?dataFor(code):groups[code];if(d)matched.add(code);
   const name=mode==='brasil'?getStates()[code]:f.properties.name;
   return `<path d="${path(f.geometry,project)}" fill="${heatColor(d?.red||0,d?.blue||0)}" class="${code===selected?'map-selected':''}" ${d||mode==='brasil'?`data-place="${esc(code)}" tabindex="0" role="button" aria-label="${esc(name)}"`:''}><title>${esc(name)}${d?` · Lula: ${fmt(d.red)} · Flávio Bolsonaro: ${fmt(d.blue)}`:' · sem boletins disponíveis'}</title></path>`
  }).join('');
  const markers=mode==='mundo'?Object.entries(groups).filter(([k])=>!matched.has(k)).map(([k,d])=>{
   const coord=small[d.name];if(!coord)return '';const[x,y]=project(coord);
   return `<circle cx="${x}" cy="${y}" r="5" fill="${heatColor(d.red,d.blue)}" class="${k===selected?'map-selected':''}" data-place="${k}" tabindex="0" role="button" aria-label="${esc(d.name)}"><title>${esc(d.name)} · ${fmt(d.red+d.blue)} votos</title></circle>`
  }).join(''):'';

  canvas.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" aria-label="Mapa de calor ${mode==='brasil'?'do Brasil':'mundial dos votos brasileiros no exterior'}">${shapes}${markers}</svg>`;
  view();detail();updateCandidateBar();

  document.querySelector('#map-freshness').textContent=mode==='mundo'?(exterior?.error?'Última carga preservada':exterior?.data?'Boletins: '+new Date(exterior.data.gerado).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Aguardando feed do exterior'):'Fonte: totalização oficial do TSE · atualização a cada 60 s';
  document.querySelector('#map-source').innerHTML=mode==='mundo'?`<b>Fonte dos dados:</b> boletins de urna do exterior agregados pelo <a href="https://seuimposto.com/" target="_blank" rel="noopener">seuimposto.com ↗</a>. Malha: Natural Earth.`:'<b>Fonte dos dados:</b> arquivos oficiais de totalização do Tribunal Superior Eleitoral (TSE). Malha: IBGE.';
 }

 async function refresh(){try{const r=await fetch('/api/exterior');if(!r.ok)throw Error('Feed indisponível');exterior=await r.json();document.dispatchEvent(new CustomEvent('exterior-update',{detail:exterior}));render()}catch{exterior={...exterior,error:'Falha de conexão'};render()}}

 root.addEventListener('click',e=>{
  const b=e.target.closest('[data-map-mode]');
  if(b){mode=b.dataset.mapMode;root.querySelectorAll('[data-map-mode]').forEach(x=>x.classList.toggle('selected',x===b));selectPlace(null);return}
  const c=e.target.closest('[data-country]');if(c){selectPlace(c.dataset.country);return}
  if(e.target.closest('#map-back')){selectPlace(null);return}
  if(e.target.closest('#map-open')){onSelect(selected);location.hash='#painel'}
 });

 canvas.addEventListener('click',e=>{if(drag?.moved)return;const p=e.target.closest('[data-place]');if(p)selectPlace(p.dataset.place)});
 canvas.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){const p=e.target.closest('[data-place]');if(p){e.preventDefault();selectPlace(p.dataset.place)}}});

 canvas.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY,start:[...pan],moved:false,place:e.target.closest('[data-place]')?.dataset.place};canvas.setPointerCapture(e.pointerId)};
 canvas.onpointermove=e=>{if(!drag||!canvas.hasPointerCapture(e.pointerId))return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>5)drag.moved=true;const scale=(mode==='brasil'?440:1000)/canvas.clientWidth/zoom;pan=[drag.start[0]-dx*scale,drag.start[1]-dy*scale];view()};
 canvas.onpointerup=e=>{if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);if(drag?.moved)setTimeout(()=>{drag=null},0);else{const place=drag?.place;drag=null;if(place)selectPlace(place)}};

 function changeZoom(factor){const next=Math.max(1,Math.min(8,zoom*factor)),w=mode==='brasil'?440:1000,h=mode==='brasil'?440:520;pan=[pan[0]+w/zoom/2-w/next/2,pan[1]+h/zoom/2-h/next/2];zoom=next;view()}
 document.querySelector('#zoom-in').onclick=()=>changeZoom(1.5);
 document.querySelector('#zoom-out').onclick=()=>changeZoom(1/1.5);
 document.querySelector('#zoom-reset').onclick=()=>selectPlace(null);
 document.querySelector('#map-refresh').onclick=refresh;

 fetch('/municipios.json').then(r=>r.json()).then(d=>{municipios=d;if(selected&&mode==='brasil')detail()}).catch(()=>{});
 fetch('/world.json').then(r=>r.json()).then(g=>{world=g;render()}).catch(()=>{canvas.textContent='Não foi possível carregar a malha mundial.'});
 refresh();setInterval(refresh,30000);document.addEventListener('atlas-update',render);route();return {render};
}
