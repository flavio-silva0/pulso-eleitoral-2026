import {initMaps,heatColor} from './maps.js';
const $=s=>document.querySelector(s),fmt=n=>n==null?'—':new Intl.NumberFormat('pt-BR').format(n),pct=n=>n==null?'—':n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%',escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const regions={'Norte':['AC','AM','AP','PA','RO','RR','TO'],'Nordeste':['AL','BA','CE','MA','PB','PE','PI','RN','SE'],'Centro-Oeste':['DF','GO','MS','MT'],'Sudeste':['ES','MG','RJ','SP'],'Sul':['PR','RS','SC'],'Exterior':['ZZ']};
let uf='TODOS',office='presidente',states={},result=null,sequence=0,favorites=[],atlasData={},geometry=null;
try{favorites=JSON.parse(localStorage.getItem('pulso-favorites')||'[]');if(!Array.isArray(favorites))favorites=[];}catch{}
function toast(t){$('#toast').textContent=t;$('#toast').style.display='block';setTimeout(()=>$('#toast').style.display='none',3200)}
const color=(c,i)=>c.number==='13'?'#b45a4c':c.number==='22'?'#4d76ad':['#4d76ad','#b45a4c','#978339'][i%3];
function selections(){
 renderMap();
 const scopes=office==='presidente'?{TODOS:'Todos (Brasil e Exterior)',BR:'Brasil',...states}:states;
 $('#uf').innerHTML=Object.entries(scopes).filter(([code])=>office==='presidente'||(code!=='ZZ'&&code!=='TODOS')).map(([code,name])=>`<option value="${code}" ${code===uf?'selected':''}>${escape(name)}</option>`).join('');
 document.querySelectorAll('[data-office]').forEach(b=>b.classList.toggle('selected',b.dataset.office===office));
 $('#state-grid').innerHTML=Object.entries(regions).map(([r,codes])=>`<div class="region"><label>${r}</label>${codes.filter(c=>office==='presidente'||c!=='ZZ').map(code=>`<button class="${uf===code?'active':''}" data-uf="${code}" title="${escape(states[code])}" aria-label="Ver ${escape(states[code])}" aria-pressed="${uf===code}">${code}</button>`).join('')}</div>`).join('');
 $('#favorite').textContent=favorites.some(f=>f.uf===uf&&f.office===office)?'★ Favoritado':'☆ Favoritar';
 $('#favorites').innerHTML=favorites.length?favorites.map(f=>`<button data-favorite="${escape(f.office+':'+f.uf)}">★ ${escape(f.uf==='TODOS'?'Todos (Brasil e Exterior)':(states[f.uf]||'Brasil'))} · ${f.office==='presidente'?'Pres.':'Gov.'}</button>`).join(''):'Salve uma disputa para voltar com um clique.';
}
function select(newUf,newOffice=office){uf=newUf;office=newOffice;result=null;selections();load()}
function render(){
 const d=result?.data;$('#scope').textContent=uf==='TODOS'?'Todos (Brasil e Exterior)':(states[uf]||'Brasil');$('#race').textContent=office==='presidente'?'Presidência da República':'Governo estadual';
 if(!d){$('#candidates').innerHTML='<p class="empty">Os dados desta disputa ainda não estão disponíveis. A consulta será repetida automaticamente.</p>';for(const id of ['progress','sections','valid','turnout','invalid','abstentions'])$('#'+id).textContent='—';$('#progressbar').style.width='0%';$('#gap').textContent='Sem resultado disponível';$('#generated').textContent='Fonte: TSE';$('#chart').innerHTML='<p class="empty">Aguardando dados oficiais.</p>';$('#history').innerHTML='';$('#history-count').textContent='0';$('#source').href='https://resultados.tse.jus.br/';return;}
 $('#candidates').innerHTML=d.candidates.map((c,i)=>{const photo=office==='presidente'&&(c.number==='13'?'/lula.webp':c.number==='22'?'/bolsonaro.webp':null);const avatar=photo?`<span class="avatar has-photo"><img src="${photo}" alt="${escape(c.name)}"></span>`:`<span class="avatar">${escape(c.number)}</span>`;return `<article class="candidate" style="--candidate:${color(c,i)}"><div class="candidate-top">${avatar}<div><h3>${escape(c.name)}</h3><small>${escape(c.party)} · ${escape(c.number)}${c.elected?' · ELEITO':''}</small></div></div><div class="candidate-values"><strong>${pct(c.percent)}</strong><span><b>${fmt(c.votes)}</b> votos</span></div><div class="vote-track"><i style="width:${Math.min(100,c.percent||0)}%"></i></div><small class="vice">Vice: ${escape(c.vice||'Não informado')}</small></article>`}).join('');
 $('#progress').textContent=pct(d.progress);$('#sections').textContent=`${fmt(d.counted)} de ${fmt(d.sections)} seções`;$('#progressbar').style.width=`${Math.min(100,d.progress||0)}%`;
 $('#valid').textContent=fmt(d.valid);$('#turnout').textContent=fmt(d.turnout);$('#invalid').textContent=`${fmt(d.blank)} / ${fmt(d.nulls)}`;$('#abstentions').textContent=fmt(d.abstentions);
 const [a,b]=d.candidates;$('#gap').textContent=d.valid>0&&a&&b?(a.votes===b.votes?'Empate na contagem parcial':`Diferença: ${fmt(a.votes-b.votes)} votos · ${pct(a.percent-b.percent).replace('%',' p.p.')}`):'Aguardando os primeiros votos';
 $('#generated').textContent=`${d.sourceKind==='external-bu'?'Boletins oficiais do exterior':d.sourceKind==='combined'?'Totalização TSE + Boletins do exterior':'Carga oficial do TSE'}: ${d.generated}`;$('#source').href=d.source;
 $('.progress-label').innerHTML=`<span><b id="progress">${pct(d.progress)}</b> das seções ${d.sourceKind==='external-bu'?'com boletins coletados':d.sourceKind==='combined'?'apuradas (Brasil + exterior)':'totalizadas'}</span><span id="sections">${fmt(d.counted)} de ${fmt(d.sections)} seções</span>`;
 const history=result.history||[];$('#history-count').textContent=history.length;
 $('#history').innerHTML=history.slice(-4).reverse().map(h=>`<div class="history-row"><time>${new Date(h.at).toLocaleTimeString('pt-BR')}</time><span>${pct(h.progress)} totalizado</span><span>${fmt(h.candidates.reduce((s,c)=>s+c.votes,0))} votos nominais</span></div>`).join('');
 if(history.length<2||!d.valid){$('#chart').innerHTML='<p class="empty">A história da noite começa aqui.<br>A curva aparece quando chegam novas cargas com votos.</p>'}else{
 $('#chart').innerHTML=`<svg viewBox="0 0 480 170" role="img" aria-label="Evolução do percentual de votos válidos, de zero a cem por cento"><text x="0" y="12" font-size="10" fill="currentColor">100%</text><text x="0" y="160" font-size="10" fill="currentColor">0%</text>${d.candidates.map((c,i)=>`<polyline fill="none" stroke="${color(c,i)}" stroke-width="3" points="${history.map((h,j)=>`${35+j/(history.length-1)*435},${155-(h.candidates.find(v=>v.number===c.number)?.percent||0)*1.4}`).join(' ')}"/>`).join('')}</svg>`;
 }
}
const ibgeCodes={'11':'RO','12':'AC','13':'AM','14':'RR','15':'PA','16':'AP','17':'TO','21':'MA','22':'PI','23':'CE','24':'RN','25':'PB','26':'PE','27':'AL','28':'SE','29':'BA','31':'MG','32':'ES','33':'RJ','35':'SP','41':'PR','42':'SC','43':'RS','50':'MS','51':'MT','52':'GO','53':'DF'};
function renderMap(){
 if(!geometry||!$('#brazil-map'))return;
 const project=([x,y])=>[(x+74)*10,(6-y)*10];
 const paths=geometry.features.map(f=>{const code=ibgeCodes[f.properties.codarea],data=atlasData[code]?.data,c=data?.candidates?.[0],second=data?.candidates?.[1],fill=data?.valid>0&&c?.votes>second?.votes?color(c,0):'var(--soft)';const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;const path=polygons.map(p=>p.map(r=>r.map((point,i)=>{const[x,y]=project(point);return(i?'L':'M')+x.toFixed(1)+','+y.toFixed(1)}).join('')+'Z').join('')).join('');return `<path d="${path}" fill="${fill}" stroke="${code===uf?'var(--ink)':'var(--card)'}" stroke-width="${code===uf?2.4:1}" data-map-uf="${code}" data-name="${escape(states[code])}" tabindex="0" role="button" aria-label="Ver ${escape(states[code])}"></path>`}).join('');
 $('#brazil-map').innerHTML=`<svg viewBox="0 0 415 410" aria-label="Mapa dos estados brasileiros, liderança presidencial parcial">${paths}</svg>`;
 const entries=Object.entries(atlasData).sort((a,b)=>(b[1].data?.progress||0)-(a[1].data?.progress||0));
 $('#state-ranking').innerHTML=entries.map(([code,r])=>{const d=r.data,c=d?.candidates?.[0];return `<button class="ranking-row" data-ranking="${code}"><b>${code}</b><span>${escape(states[code])}</span><span>${r.error?'Indisponível':d?.valid?escape(c?.name):'Sem votos'}</span><strong>${pct(d?.progress)}</strong></button>`}).join('');
}
async function loadAtlas(){try{const response=await fetch('/api/atlas');if(!response.ok)throw Error();atlasData=await response.json();renderMap();document.dispatchEvent(new Event('atlas-update'));$('#atlas-status').textContent='Presidente · cores indicam liderança parcial. Cinza: sem votos ou indisponível.'}catch{$('#atlas-status').textContent='Mapa sem atualização. Consulte cada estado pelo seletor.'}}
async function load(){const request=++sequence;$('#refresh').disabled=true;try{
 const response=await fetch(`/api/results?uf=${uf}&office=${office}`);if(!response.ok)throw Error('Servidor indisponível');const data=await response.json();if(request!==sequence)return;result=data;
 const bTime=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(data.checkedAt));
 $('#connection').textContent=data.error?'● FONTE INDISPONÍVEL':'● CONECTADO AO TSE';$('#checked').textContent=`Última consulta: ${bTime} (horário de Brasília)`;
 document.querySelectorAll('.last-update-val').forEach(el=>el.textContent=bTime);
 $('#notice').classList.toggle('error',!!data.error);$('#notice').textContent=data.error?(data.data?'Consulta falhou. Exibindo a última carga recebida. ':'')+data.error:data.data?.finished?'Totalização encerrada segundo o TSE. Consulte a situação de cada candidato.':data.data?.counted===0?'Aguardando a apuração · O TSE ainda não publicou seções totalizadas nesta abrangência. Os votos aparecerão automaticamente.':'Apuração em andamento · Os resultados são parciais e podem mudar a cada atualização.';
 if(data.data?.sourceKind==='external-bu'){$('#connection').textContent=data.error?'● BOLETINS DESATUALIZADOS':'● BOLETINS DO EXTERIOR';$('#notice').textContent=(data.error?'Falha na atualização; exibindo a última carga. ':'')+data.note;}
 if(data.data?.sourceKind==='combined'){$('#connection').textContent=data.error?'● ATUALIZAÇÃO PARCIAL':'● BRASIL + EXTERIOR';$('#notice').textContent=(data.error?'Falha na atualização; exibindo a última carga. ':'')+(data.note||'Totalização do Brasil somada aos boletins de urna do exterior.');}
 render();
 }catch(e){if(request!==sequence)return;$('#connection').textContent='● SEM CONEXÃO';$('#notice').textContent='Não foi possível consultar o servidor. '+(result?.data?'Os números exibidos são da última consulta bem-sucedida.':'Tentaremos novamente automaticamente.');$('#notice').classList.add('error');if(!result)render();}finally{if(request===sequence)$('#refresh').disabled=false}}
$('#uf').onchange=e=>select(e.target.value);document.querySelectorAll('[data-office]').forEach(b=>b.onclick=()=>select(b.dataset.office==='governador'&&['BR','ZZ','TODOS'].includes(uf)?'AC':uf,b.dataset.office));
$('#state-grid').onclick=e=>{const b=e.target.closest('[data-uf]');if(b)select(b.dataset.uf)};
$('#favorites').onclick=e=>{const b=e.target.closest('[data-favorite]');if(b){const[o,u]=b.dataset.favorite.split(':');select(u,o)}};
$('#favorite').onclick=()=>{const index=favorites.findIndex(f=>f.uf===uf&&f.office===office);if(index>=0)favorites.splice(index,1);else favorites.push({uf,office});try{localStorage.setItem('pulso-favorites',JSON.stringify(favorites))}catch{toast('Favoritos disponíveis apenas nesta sessão.')}selections()};
$('#refresh').onclick=load;
$('#fullscreen').onclick=()=>{document.body.classList.toggle('tv');$('#fullscreen').textContent=document.body.classList.contains('tv')?'⛶ Sair do telão':'⛶ Modo telão'};
$('#export').onclick=()=>{if(!result?.data)return toast('Aguarde os dados para exportar.');const d=result.data;const cell=v=>'"'+String(v??'').replaceAll('"','""')+'"';const rows=[['UF','Cargo','Candidato','Número','Partido','Votos','Percentual','Carga TSE','Fonte'],...d.candidates.map(c=>[uf,office,c.name,c.number,c.party,c.votes,c.percent,d.generated,d.source])];const blob=new Blob(['\ufeff'+rows.map(r=>r.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`pulso-${office}-${uf}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Arquivo CSV exportado.')};
function getRegionName(code){
 for(const [r,codes] of Object.entries(regions)){
  if(codes.includes(code)) return r;
 }
 return '';
}

function renderBrazilMapTooltip(code, placeName){
 const r = atlasData[code];
 const d = r?.data;
 const stateName = states[code] || placeName || code;
 const reg = getRegionName(code);
 const cands = d?.candidates || [];
 const lula = cands.find(c => c.number === '13');
 const bolsonaro = cands.find(c => c.number === '22');
 const lVotes = lula?.votes || 0;
 const bVotes = bolsonaro?.votes || 0;
 const total = (d?.valid > 0 ? d.valid : (lVotes + bVotes)) || 0;
 const hasData = total > 0;
 const lPct = hasData ? (lVotes / total * 100) : (lula?.percent || 50);
 const bPct = hasData ? (bVotes / total * 100) : (bolsonaro?.percent || 50);
 const lPctStr = hasData ? pct(lPct) : '—';
 const bPctStr = hasData ? pct(bPct) : '—';
 const diff = Math.abs(lVotes - bVotes);

 let badgeHtml = '';
 if(r?.error){
  badgeHtml = `<span class="tip-badge badge-gray">Consulta indisponível</span>`;
 }else if(!hasData){
  badgeHtml = `<span class="tip-badge badge-gray">Aguardando votos</span>`;
 }else if(lVotes > bVotes){
  badgeHtml = `<span class="tip-badge badge-red">● Lula +${fmt(diff)}</span>`;
 }else if(bVotes > lVotes){
  badgeHtml = `<span class="tip-badge badge-blue">● Flávio +${fmt(diff)}</span>`;
 }else{
  badgeHtml = `<span class="tip-badge badge-gray">Empate</span>`;
 }

 const sec = d?.counted || 0;
 const totSec = d?.sections || 0;
 const secPct = pct(d?.progress || 0);
 const subText = `${reg ? 'Região ' + reg + ' · ' : ''}${fmt(sec)} de ${fmt(totSec)} seções (${secPct})`;

 return `
  <div class="tip-header">
   <div class="tip-title-row">
    <div class="tip-title">${escape(stateName)} <span class="tip-uf-pill">${escape(code)}</span></div>
    ${badgeHtml}
   </div>
   <div class="tip-sub">${escape(subText)}</div>
  </div>

  <div class="tip-track ${hasData ? '' : 'empty'}">
   ${hasData ? `
    <div class="tip-track-lula" style="width:${lPct}%"></div>
    <div class="tip-track-bolsonaro" style="width:${bPct}%"></div>
   ` : ''}
  </div>

  <div class="tip-candidates">
   <div class="tip-candidate ${hasData && lVotes >= bVotes ? 'tip-lead tip-lead-lula' : ''}">
    <img src="/lula.webp" class="tip-photo tip-photo-lula" alt="Lula">
    <div class="tip-candidate-info">
     <div class="tip-cand-name"><strong>Lula</strong> <small>PT · 13</small></div>
     <div class="tip-cand-votes">${hasData ? fmt(lVotes) + ' votos' : 'Sem apuração'}</div>
    </div>
    <div class="tip-cand-pct ${hasData ? 'red-text' : 'muted-text'}">${lPctStr}</div>
   </div>

   <div class="tip-candidate ${hasData && bVotes > lVotes ? 'tip-lead tip-lead-bolsonaro' : ''}">
    <img src="/bolsonaro.webp" class="tip-photo tip-photo-bolsonaro" alt="Flávio Bolsonaro">
    <div class="tip-candidate-info">
     <div class="tip-cand-name"><strong>Flávio Bolsonaro</strong> <small>PL · 22</small></div>
     <div class="tip-cand-votes">${hasData ? fmt(bVotes) + ' votos' : 'Sem apuração'}</div>
    </div>
    <div class="tip-cand-pct ${hasData ? 'blue-text' : 'muted-text'}">${bPctStr}</div>
   </div>
  </div>

  <div class="tip-footer">
   <span class="tip-total">Total: <b>${fmt(total)}</b> válidos</span>
   <span class="tip-action">Clique para selecionar UF ↗</span>
  </div>
 `;
}

$('#state-grid').insertAdjacentHTML('beforebegin','<div id="brazil-map-wrap" class="brazil-map-wrap"><div id="brazil-map" class="brazil-map"></div><div id="brazil-map-tooltip" class="map-tooltip" hidden></div></div><p id="atlas-status" class="footnote">Carregando mapa e resultados por estado…</p>');
$('#historico').insertAdjacentHTML('beforeend','<details class="ranking"><summary>Comparar a apuração dos estados</summary><div class="ranking-label">Presidente · ordenado por seções totalizadas</div><div id="state-ranking"></div></details>');

const bMapWrap = $('#brazil-map-wrap');
const bTooltip = $('#brazil-map-tooltip');
let activeBMPlace = null;

function hideBTooltip(){
 if(bTooltip && !bTooltip.hidden){
  bTooltip.hidden = true;
  activeBMPlace = null;
 }
}

bMapWrap.addEventListener('pointermove', e => {
 const p = e.target.closest('[data-map-uf]');
 if(!p){
  hideBTooltip();
  return;
 }
 const code = p.dataset.mapUf;
 const name = p.dataset.name || code;
 if(activeBMPlace !== code){
  activeBMPlace = code;
  bTooltip.innerHTML = renderBrazilMapTooltip(code, name);
  bTooltip.hidden = false;
 }
 const wrapRect = bMapWrap.getBoundingClientRect();
 const x = e.clientX - wrapRect.left;
 const y = e.clientY - wrapRect.top;
 const tipW = bTooltip.offsetWidth || 280;
 const tipH = bTooltip.offsetHeight || 160;
 let posX = x - tipW / 2;
 let posY = y - tipH - 12;
 if(posY < 8) posY = y + 20;
 if(posX < 8) posX = 8;
 if(posX + tipW > wrapRect.width - 8) posX = wrapRect.width - tipW - 8;
 if(posY + tipH > wrapRect.height - 8) posY = wrapRect.height - tipH - 8;
 bTooltip.style.left = `${posX}px`;
 bTooltip.style.top = `${posY}px`;
});

bMapWrap.addEventListener('pointerleave', hideBTooltip);

$('#brazil-map').onclick=e=>{
 hideBTooltip();
 const p=e.target.closest('[data-map-uf]');
 if(p)select(p.dataset.mapUf,'presidente');
};
$('#brazil-map').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){const p=e.target.closest('[data-map-uf]');if(p){e.preventDefault();hideBTooltip();select(p.dataset.mapUf,'presidente')}}};
$('#state-ranking').onclick=e=>{const b=e.target.closest('[data-ranking]');if(b)select(b.dataset.ranking,'presidente')};
$('#placar').insertAdjacentHTML('beforebegin','<div id="exterior-banner" class="exterior-banner" hidden></div>');
document.addEventListener('exterior-update',e=>{const r=e.detail;if(!r.data)return;const t=r.data.total;$('#exterior-banner').hidden=false;$('#exterior-banner').innerHTML=`<div><span class="eyebrow">${r.error?'ÚLTIMA CARGA · ATUALIZAÇÃO INDISPONÍVEL':'JÁ HÁ VOTOS NO EXTERIOR'}</span><p><span class="banner-candidate"><img src="/lula.webp" class="mini-photo" alt="Lula"> <b>Lula: ${fmt(t['13'])}</b></span> · <span class="banner-candidate"><img src="/bolsonaro.webp" class="mini-photo" alt="Flavio Bolsonaro"> <b>Flavio: ${fmt(t['22'])}</b></span> · ${fmt(t.secoes)} seções coletadas</p><small>Boletins oficiais de urna do exterior · ${new Date(r.data.gerado).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})} · acompanhamento em tempo real.</small></div><button id="open-exterior">Ver exterior ↗</button>`;$('#open-exterior').onclick=()=>select('ZZ')});
initMaps({getAtlas:()=>atlasData,getStates:()=>states,getBrazil:()=>geometry,getNational:()=>(['BR','TODOS'].includes(uf)?result?.data:null),onSelect:u=>select(u,'presidente'),onRefresh:()=>{load();loadAtlas();}});
function updateLiveCounters(count){
 const num=Math.max(1,Number(count)||1);
 const formatted=fmt(num);
 const label=num===1?'pessoa ao vivo':'pessoas ao vivo';
 document.querySelectorAll('.live-counter-val').forEach(el=>el.textContent=formatted);
 document.querySelectorAll('.live-label-text').forEach(el=>el.textContent=label);
}

let clientId=localStorage.getItem('pulso_uid');
if(!clientId){clientId='u_'+Math.random().toString(36).slice(2,10)+Date.now().toString(36);try{localStorage.setItem('pulso_uid',clientId);}catch{}}
async function syncPresence(isLeaving=false){
 try{
  const url=`/api/presence?id=${encodeURIComponent(clientId)}${isLeaving?'&leave=1':''}`;
  if(isLeaving&&navigator.sendBeacon){navigator.sendBeacon(url);return;}
  const res=await fetch(url);
  if(!res.ok)throw Error();
  const d=await res.json();
  if(d?.count!=null)updateLiveCounters(d.count);
  if(d?.brasiliaTime){document.querySelectorAll('.last-update-val').forEach(el=>{if(!el.textContent||el.textContent==='—')el.textContent=d.brasiliaTime;});}
 }catch{
  updateLiveCounters(1);
 }
}
syncPresence();
setInterval(syncPresence,15000);
window.addEventListener('pagehide',()=>syncPresence(true));
window.addEventListener('beforeunload',()=>syncPresence(true));
try{states=await(await fetch('/api/states')).json();selections();await load();geometry=await(await fetch('/brazil.json')).json();renderMap();document.dispatchEvent(new Event('atlas-update'));loadAtlas()}catch{toast('Uma parte do painel não pôde ser carregada. Recarregue a página.')}setInterval(load,3500);setInterval(loadAtlas,6000);
