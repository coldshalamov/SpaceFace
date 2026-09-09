import { createSaveStage } from '../../src/ui/views/saveFrame.js';
import { contractDossierView, termRow } from '../../src/ui/views/contractPresentation.js';
import { navigationFrameHtml } from '../../src/ui/views/navigationFrame.js';
import { CSS as navigationCss } from '../../src/ui/views/navigationStyles.js';
import { injectHudCss } from '../../src/ui/views/hudStyles.js';
import { shipConditionMarkup, hudBarMarkup } from '../../src/ui/views/flightInstruments.js';
import { targetFrameHtml } from '../../src/ui/views/targetFrame.js';
import { createPowerRail, RAIL_SLOTS } from '../../src/ui/powerRail.js';
import { techTreeScreen } from '../../src/ui/screens/techTree.js';
import { TACTICAL_MAP_PALETTE as palette, drawPlayerHull, drawStationGlyph, drawHostileGlyph, drawGateGlyph, drawObjectiveBracket, drawObjectiveCorridor } from '../../src/ui/map/tacticalMapGrammar.js';
import { iconHtml } from '../../src/ui/views/identity.js';
// Isolated evidence, not a game runtime. Exact production view modules with synthetic read models.
// Recorded intents prove UI wiring only; they are never presented as successful gameplay.
import { el, words, rows } from '../../src/ui/kit/dom.js';
import { createTitleFrame, createPauseFrame } from '../../src/ui/views/menuFrames.js';
import { paneBuilder } from '../../src/ui/views/settingsControls.js';
import * as frames from '../../src/ui/views/stationFrames.js';
import { createCommandDock } from '../../src/ui/station/dock.js';
import { marketFamily, marketBrowserHtml, marketRowHtml, marketQuoteHtml, marketTradeHtml, marketReceiptRow as kv, statRow } from '../../src/ui/views/marketPresentation.js';
import { gameOverScreen } from '../../src/ui/screens/gameOver.js';
import { COMMODITIES } from '../../src/data/commodities.js';
import { escapeMarkup as esc } from '../../src/ui/views/identity.js';
const params = new URLSearchParams(globalThis.ORBITAL_FIXTURE_QUERY || location.search), screen = params.get('screen') || 'title', edge = params.get('edge') || '';
const events = [], host = document.querySelector('#screens');
const signal = (type,payload) => {events.push({type,payload});document.querySelector('.qa-intent').textContent='Intent captured: '+type;};
window.ORBITAL_QA = {events,screen,edge,scope:'Production presentation; synthetic values; no simulation or persistence.'};
function root(id,stage=false){const r=el('section','k-screen'+(stage?' k-screen--stage':''));r.dataset.screen=id;r.dataset.kReady='1';r.setAttribute('aria-label',id);host.appendChild(r);document.body.dataset.kScreen=id;return r;}
function append(p,...cs){cs.forEach(c=>p.appendChild(c));return p;}
function header(r,name,sub){const h=el('header','k-title');h.appendChild(el('h1','k-display k-t-title',name));if(sub)h.appendChild(el('p','k-sentence',sub));r.appendChild(h);return h;}
function footer(r){const f=el('footer','k-foot');f.appendChild(words([{action:'close',label:'Back'}],{size:'body',onPick:()=>signal('ui:close',{})}));r.appendChild(f);return f;}
function title(){const r=root('mainMenu',true),f=createTitleFrame(r);f.stage.appendChild(words([
 {action:'continue',label:'Continue',sub:edge==='empty'?'No saved departure. Start a new game.':'Autosave · Kestrel · Ceres · 02h 14m',current:edge!=='empty',disabled:edge==='empty'},
 {action:'newGame',label:'New Game',current:edge==='empty'},{action:'load',label:'Load'},{action:'crucible',label:'Crucible'},{action:'archive',label:'Archive'},{action:'settings',label:'Settings'},{action:'quit',label:'Quit',danger:true}
],{size:'menu',ariaLabel:'Main menu',onPick:a=>signal('ui:'+a,{})}));r.appendChild(el('div','k-fine','SpaceFace · Independent flight'));}
function pause(){const r=root('pause',true),f=createPauseFrame(r);f.briefObjective.textContent='Deliver the sealed cargo to Ceres';f.briefNext.textContent='Next: resume, follow tracked navigation, then dock to complete the handoff.';f.briefSave.textContent='Autosave · 02h 14m · Your current flight is held.';const stage=el('div','k-stage');stage.appendChild(words([
{action:'resume',label:'Resume',current:true},...['Mission Log','Navigation','Your ship','Settings','Save / Load','Photo mode','Help','Main menu'].map(label=>({action:label,label})),{action:'quit',label:'Quit',danger:true}
],{size:'menu',onPick:a=>signal('ui:'+a,{})}));r.appendChild(stage);const foot=el('footer','k-foot');foot.textContent='Esc resumes flight';r.appendChild(foot);}
function settings(){const r=root('settings');header(r,'Settings','Saved with your profile.');const rail=el('nav','k-hang'),stage=el('div','k-stage k-stage--scroll sf-settings-pane');stage.id='sf-settings-pane';stage.setAttribute('role','tabpanel');const values={volume:72,music:46,ui:80,reduce:false,flash:false,contrast:'standard'};
function fill(name){stage.innerHTML='';const b=paneBuilder(stage);stage.setAttribute('aria-label',name);if(name==='Audio'){b.header('Mix');for(const [key,label]of[['volume','Master volume'],['music','Music'],['ui','Interface sounds']])b.slider(label,()=>values[key],0,100,1,n=>n+'%',(n,persist)=>{values[key]=n;signal('settings:changed',{key,value:n,persist});});b.note('Changes are previewed immediately. Release the control to save the value.');b.word('Reset audio',()=>signal('settings:reset',{section:'audio'}));}else if(name==='Access'){b.header('Comfort & readability');b.toggle('Reduce motion',()=>values.reduce,v=>{values.reduce=v;document.documentElement.classList.toggle('sf-reduce-motion',v);signal('settings:changed',{key:'motionReduce',value:v});});b.toggle('Reduce flashes',()=>values.flash,v=>{values.flash=v;signal('settings:changed',{key:'flashReduce',value:v});});b.select('Contrast',()=>values.contrast,[['standard','Standard'],['high','High']],v=>{values.contrast=v;signal('settings:changed',{key:'contrast',value:v});});b.note('Motion and colour never carry essential flight information on their own.');}else if(name==='Controls'){b.header('Flight');for(const[l,k]of[['Throttle','W / S'],['Steer','A / D'],['Boost','Shift'],['Brake','0']])b.key(l,k,()=>signal('controls:rebind',{action:l}));b.shortcut('Pause','Esc / P','Freezes the flight while you review.');}else {b.header(name);b.note('Only presentation controls are mounted in this isolated fixture.');}rail.querySelectorAll('[data-action]').forEach(b=>{const on=b.dataset.action===name;b.setAttribute('aria-selected',String(on));b.setAttribute('aria-current',String(on));});}
rail.appendChild(words(['Audio','Video','Gameplay','Access','Controls'].map(label=>({action:label,label,current:label==='Audio'})),{size:'menu',onPick:fill}));rail.querySelector('ul').classList.add('sf-tabbar');rail.querySelector('ul').setAttribute('role','tablist');rail.querySelectorAll('button').forEach(b=>{b.setAttribute('role','tab');b.setAttribute('aria-controls',stage.id);});append(r,rail,stage);footer(r);fill(edge==='access'?'Access':'Audio');window.ORBITAL_QA.values=values;}
let dock;
function station(initial='market'){const r=root('station');r.innerHTML=frames.stationFrameHtml();r.querySelector('.sxb-berth__name').textContent=edge==='long'?'Ceres — Outer Belt Logistics & Reclamation Cooperative':'Ceres Station';r.querySelector('.sxb-berth__news').textContent='Trade hub · Ceres · Docked';r.querySelector('.sxb-purse__value').textContent='24,680';r.querySelector('.sxb-vitals').innerHTML=[['Hull','86%','repair'],['Fuel','72%','refuel'],['Hold','18 / 60','cargo']].map(([l,v,a])=>`<li class="k-row"><span class="sxb-vital__label">${l}</span><b class="sxb-vital__value">${v}</b><span class="sxb-vital__acts"><button type="button" class="k-word k-word--fine" data-service="${a}">${a==='cargo'?'Open':a==='repair'?'Repair':'Refuel'}</button></span></li>`).join('');const panel=r.querySelector('#sx-panel');const destinations=[['market','Market'],['shipworks','Shipworks'],['contracts','Contracts'],['industry','Industry'],['factions','Factions'],['bar','Bar'],['ledger','Ledger']].map(([id,label])=>({id,label}));const select=id=>{dock.setActive(id);panel.setAttribute('aria-labelledby','sx-tab-'+id);panel.innerHTML='';signal('fixture:facility',{id});if(id==='market')market(panel);else if(id==='shipworks')shipworks(panel);else facility(panel,id);};dock=createCommandDock({destinations,onNavigate:select});r.querySelector('.sxb-ops__dock').appendChild(dock.el);r.addEventListener('click',e=>{const b=e.target.closest('[data-service],[data-act]');if(b)signal(b.dataset.service?'ui:service':'ui:'+b.dataset.act,{service:b.dataset.service});});r.querySelector('.sxb-launch__state').textContent='Leave berth';select(initial);events.length=0;document.querySelector('.qa-intent').textContent='';window.ORBITAL_QA.dock=dock;}
function market(panel){const r=el('div','k-panel k-panel--split sx-mkt');r.innerHTML=frames.marketFrameHtml();panel.appendChild(r);const list=r.querySelector('.sx-mkt__list');list.innerHTML=marketBrowserHtml();const data=COMMODITIES.slice(0,20).map((c,i)=>({id:c.id,name:c.name,category:c.category,legal:c.legality,buy:Math.round(c.basePrice*1.12),sell:Math.round(c.basePrice*.92),avg:c.basePrice,stock:125+i*19,held:i<3?6:0,hist:[c.basePrice*.89,c.basePrice*.91,c.basePrice,c.basePrice*.96,c.basePrice*1.04,c.basePrice*1.01,c.basePrice*1.12],driversSummary:'Illustrative quote. Station demand and freight conditions drive this price.'}));let selected=data[2].id,filter='all',query='',quantity=6,mode='buy';
function quote(){const d=data.find(v=>v.id===selected);if(!d)return;r.querySelector('.sx-mkt__quote').innerHTML=marketQuoteHtml({...d,mode,demandWord:'high'});const receiptHtml=kv('Quantity',quantity+' u')+kv('Average unit',d.buy+' cr/u')+kv('Total cost',quantity*d.buy+' cr','loss')+kv('You hold',d.held+' u')+kv('Credits','24,680 cr')+kv('Hold free','42 u');r.querySelector('.sx-mkt__trade').innerHTML=marketTradeHtml({mode,qty:quantity,canAct:edge!=='unavailable',receiptHtml,note:edge==='unavailable'?'Live quote unavailable.':''});}
function rows(){const shown=data.filter(d=>(filter==='all'||filter==='hold'&&d.held>0||marketFamily(d.category)===filter)&&d.name.toLowerCase().includes(query.toLowerCase()));if(shown.length&&!shown.some(d=>d.id===selected))selected=shown[0].id;list.querySelector('tbody').innerHTML=shown.map(d=>marketRowHtml({...d,selected:d.id===selected,tracked:d.id===data[2].id})).join('');list.querySelector('b').textContent=' · '+shown.length+' of '+data.length;list.querySelectorAll('[data-market-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.marketFilter===filter)));const empty=list.querySelector('.sx-mkt-browser__empty');empty.hidden=shown.length>0;empty.textContent='No commodities match '+query+'.';quote();}
list.addEventListener('input',e=>{if(e.target.matches('[data-market-search]')){query=e.target.value;rows();}});list.addEventListener('click',e=>{const b=e.target.closest('[data-market-filter]'),row=e.target.closest('[data-cmdty]');if(b){filter=b.dataset.marketFilter;rows();}if(row){selected=row.dataset.cmdty;rows();}});list.addEventListener('keydown',e=>{const row=e.target.closest('[data-cmdty]');if(!row)return;const all=[...list.querySelectorAll('[data-cmdty]')];let ix=all.indexOf(row);if(e.key==='ArrowDown')ix=(ix+1)%all.length;else if(e.key==='ArrowUp')ix=(ix-1+all.length)%all.length;else return;e.preventDefault();selected=all[ix].dataset.cmdty;rows();list.querySelector('[aria-selected="true"]').focus();});r.querySelector('.sx-mkt__console').addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled)return;if(b.hasAttribute('data-go')){signal('ui:'+mode,{commodityId:selected,qty:quantity});return;}if(b.dataset.mode){mode=b.dataset.mode;quote();}if(b.dataset.q){quantity=b.dataset.q==='max'?42:Math.max(1,quantity+Number(b.dataset.q));quote();}});rows();if(edge==='empty'){list.querySelector('input').value='No such mineral';query='No such mineral';rows();}}
function shipworks(panel){const r=el('div','k-panel sx-sw');r.innerHTML=frames.shipworksFrameHtml();panel.appendChild(r);r.querySelector('.sx-sw__list').innerHTML=['Kestrel','Mule','Prospector'].map((n,i)=>`<button type="button" class="k-row${i===0?' is-active':''}" aria-selected="${i===0}"><span class="k-row__name">${n}</span><span class="k-row__sub">${i===0?'Active hull':'Fleet slot'}</span></button>`).join('');r.querySelector('.sx-sw__stage').insertAdjacentHTML('beforeend','<div class="qa-unavailable"><strong>3D preview not mounted</strong>The uploaded bundle omits the renderer dependencies. No substitute hull is shown.</div>');r.querySelector('.sx-sw__nameplate').innerHTML='<h2 class="k-display k-t-title">Kestrel</h2><p class="k-caps">Starter · Active ship</p>';r.querySelector('.sx-sw__side').innerHTML='<p class="k-caps">Fitting</p><h3>Ship systems</h3><p class="k-sentence">Select a hardpoint in the full game to inspect its installed module.</p><p class="k-empty">Spatial attachment validation requires the real renderer.</p>';r.querySelector('.sx-sw__stats').innerHTML=`<ul class="k-rows">${statRow('Hull integrity','86 / 100')}${statRow('Shield capacity','120')}${statRow('Cargo capacity','60 u')}${statRow('Flight state','Docked')}</ul>`;}
function facility(panel,id){const f=frames[id+'FrameHtml'],r=el('div','k-panel k-panel--split sx-'+({contracts:'ct',industry:'ind',factions:'fac',bar:'bar',ledger:'ledger'})[id]);panel.appendChild(r);r.innerHTML=f?f():'<nav class="k-hang"></nav><section class="k-stage"></section>';const hang=r.querySelector('.k-hang'),stage=r.querySelector('.k-stage');const labels=id==='contracts'?['Sealed cargo','Ore requisition','Belt patrol']:id==='industry'?['Refined steel','Copper wire','Hull plate']:id==='factions'?['The Cooperative','Port Authority','Independent crews']:id==='bar'?['Dockmaster','Freight broker','Independent pilot']:['Recent activity','Trading','Ship maintenance'];hang.innerHTML='<p class="k-caps">'+esc(id==='contracts'?'Posted here':id==='bar'?'Contacts':id)+'</p>';const select=name=>{stage.innerHTML=`<p class="k-caps">${esc(id)}</p><h2 class="k-display k-t-title">${esc(name)}</h2>`;if(id==='contracts')stage.innerHTML+='<p class="k-sentence">Transport a sealed shipment to the named berth. Keep the cargo intact and dock to complete the handoff.</p><ul class="k-rows">'+statRow('Reward','1,800 cr')+statRow('Destination','Vesta Exchange')+statRow('Cargo','6 u')+statRow('Time remaining','18m 40s')+'</ul>';else if(id==='industry')stage.innerHTML+='<p class="k-sentence">Turn material in your hold into finished components. The operation checks cargo and credits before starting.</p><ul class="k-rows">'+statRow('Input','12 u Iron Ore')+statRow('Output','4 u Refined Steel')+statRow('Service fee','120 cr')+'</ul>';else if(id==='bar')stage.innerHTML+='<blockquote class="k-sentence">“A reliable crew gets asked twice. Find me at the exchange when you have room in the hold.”</blockquote><p class="k-caps">Available lead</p><p class="k-sentence">A freight contact is looking for a pilot.</p>';else stage.innerHTML+='<p class="k-sentence">Presentation-only sample. Reputation and account records remain owned by the game systems.</p><ul class="k-rows">'+statRow('Standing','Neutral')+statRow('Current station','Ceres')+'</ul>';if(id==='contracts'){
 const blocked=edge==='blocked', reason=blocked?'Requires 6 u free cargo space.':'Ship and account ready';
 stage.innerHTML=contractDossierView({typeName:'Delivery',titleHtml:esc(name),clientHtml:'Ceres Freight Cooperative',reward:'1,800',summary:'Transport a sealed shipment to Vesta Exchange. Keep the cargo intact and dock to complete the handoff.',routeHtml:'Ceres Station → Vesta Exchange · 1 jump',riskHtml:'Low risk. Success pays 1,800 cr; failure costs 400 cr collateral.',termsHtml:termRow('Payload','Sealed shipment','6 u')+termRow('Time','18 min 40 s')+termRow('Collateral','400 cr','on failure')+termRow('Readiness',blocked?'BLOCKED':'ROUTE CLEAR',reason),readiness:{blocker:blocked?reason:null},clausesHtml:'',action:{id:'fixture-delivery',ready:!blocked,readyLabel:'Accept',blockedLabel:'Resolve Readiness',aria:blocked?'Cannot accept. '+reason:'Accept sealed cargo contract',reason}});
 stage.querySelector('[data-accept]').addEventListener('click',()=>signal('ui:acceptMission',{missionId:'fixture-delivery'}));return;
 }stage.appendChild(words([{action:id==='contracts'?'accept':id==='industry'?'fabricate':'inspect',label:id==='contracts'?'Accept contract':id==='industry'?'Fabricate':'Review',current:true}],{size:'body',onPick:a=>signal('fixture:'+a,{name})}));};hang.appendChild(words(labels.map((l,i)=>({action:l,label:l,current:i===0})),{size:'body',onPick:select}));select(labels[0]);}
function gameover(){const r=root('gameOver',true),state={settings:{gameplay:{difficulty:edge==='ironman'?'ironman':'standard'}},combat:{lastPlayerDefeat:{fatalSummary:'Hull breached under fire',direction:'Aft',dominantLayer:'hull',damage:47,recovery:{stationName:'Ceres Station',costCr:1200,quotedCostCr:1200,cargoLostQty:8,persistentCargoProtected:2}}}},listeners=new Map(),ctx={state,bus:{emit:signal,on:(k,f)=>{listeners.set(k,f);return()=>listeners.delete(k);}},screenManager:{pushScreen:id=>signal('ui:pushScreen',{id}),popScreen:()=>signal('ui:popScreen',{})}};gameOverScreen.mount(r,ctx);gameOverScreen.onShow(ctx);window.ORBITAL_QA.actualController='gameOverScreen';window.ORBITAL_QA.listeners=listeners;window.ORBITAL_QA.state=state;}

function saves() {
  const r = root('saveLoad'); header(r,'Load','2 saved departures · fixture records');
  const hang = el('div','k-hang'), frame = createSaveStage();
  const records = [
    {id:'quick', name:'Quicksave', sub:'Ceres · Kestrel · 02h 14m', num:'24,680', selected:true},
    {id:'autosave', name:'Autosave', sub:'Vesta · Kestrel · 02h 08m', num:'22,180'},
    {id:'1', name:'Slot 1', sub:'Empty slot', num:''},
  ];
  const select = id => {
    const record = records.find(s=>s.id===id), empty=id==='1';
    frame.shipName.textContent=empty?'Slot 1':'Kestrel';
    frame.scars.textContent=empty?'':'Hull repaired at Ceres';
    frame.titles.textContent='';frame.rapSheet.textContent='';frame.grudge.textContent='';
    frame.objective.textContent=empty?'No saved departure in this slot.':'Deliver the sealed cargo to Vesta Exchange.';
    frame.credits.querySelector('.k-hero__n').textContent=empty?'—':record.num;
    frame.fine.textContent=record.sub;
    frame.actions.replaceChildren(words([{action:'load',label:'Load',current:!empty,disabled:empty},{action:'save',label:'Save here',current:empty},{action:'delete',label:'Delete',disabled:empty,danger:true}],{size:'body',row:true,onPick:a=>signal('fixture:save-control',{action:a,id})}));
  };
  hang.appendChild(rows(records,{ariaLabel:'Saves',onPick:select}));
  hang.addEventListener('focusin',event=>{const row=event.target.closest('[data-id]');if(row)select(row.dataset.id);});
  append(r,hang,frame.stage);footer(r);select(edge==='empty'?'1':'quick');
}

function research() {
  const r=root('techTree'), state={player:{credits:18000,researchPoints:12,researchedNodes:[]}};
  const ctx={state,bus:{emit:signal},screenManager:{popScreen:()=>signal('ui:popScreen',{})}};
  techTreeScreen.mount(r,ctx);techTreeScreen.onShow(ctx);
  const nodes=techTreeScreen._nodes();
  techTreeScreen._selectNode(edge==='locked'?nodes.find(n=>n.prereqs?.length)?.id:nodes[0].id);
  window.ORBITAL_QA.actualController='techTreeScreen';window.ORBITAL_QA.state=state;
}

function navigation() {
  const css=el('style');css.textContent=navigationCss;document.head.appendChild(css);
  const r=root('galaxyMap',true);r.id='sf-galaxymap';
  r.innerHTML=navigationFrameHtml({
    layerButtonsHtml:`<div class="gm-layer-bank"><p class="k-caps">Navigation</p>${['Routes','Stations','Contacts','Resources'].map((name,i)=>`<button type="button" class="gm-layer-btn k-word" aria-pressed="${i<2}" data-layer="${name}"><span class="gm-layer-ico">${iconHtml(i===0?'navigation':i===1?'industry':i===2?'ship':'ore')}</span><span>${name}</span></button>`).join('')}</div>`,
    hintRowsHtml:termRow('Inspect','Click a mark')+termRow('Move view','Drag')+termRow('Zoom','Scroll'),
    markLegendHtml:termRow('Hull','You')+termRow('Bracket','Objective')+termRow('Chevron','Threat'),
  });
  r.querySelector('.gm-stamp').textContent='System scale · projection specimen';
  r.querySelector('[data-focus="system"]').setAttribute('aria-pressed','true');
  r.querySelector('[data-level]').textContent='SYSTEM';
  r.querySelector('#gm-commodity-select').innerHTML='<option>Iron Ore</option><option>Titanium Ore</option>';
  r.querySelector('#gm-frame-reason').textContent='Flight state not mounted in this fixture.';
  r.querySelector('.gm-inspector-details').innerHTML='<div class="gm-ins-name">Vesta Exchange</div><p class="k-sentence">Selected destination</p><ul class="k-rows">'+termRow('Purpose','Cargo handoff')+termRow('Route','Ceres → Vesta')+'</ul><p class="k-sentence">The frame and glyph renderers are production code. This fixture does not validate route execution.</p>';
  r.querySelector('#gm-plot-course-btn').hidden=false;r.querySelector('#gm-plot-reason').textContent='Route owner unavailable in this fixture.';
  r.querySelector('#gm-deck-table').innerHTML='<div class="gm-deck-empty"><strong class="gm-deck-empty-title">No live cargo-lane quotes</strong><span class="gm-deck-empty-body">The fixture does not invent trade advice.</span></div>';
  const ribbon=r.querySelector('#gm-route-ribbon');ribbon.hidden=false;
  r.querySelector('#gm-ribbon-status').textContent='Plotted · not engaged';
  r.querySelector('#gm-ribbon-legs').innerHTML='<li class="gm-ribbon-leg">Ceres Station</li><li class="gm-ribbon-leg" data-leg-state="active">Vesta Exchange</li>';
  r.querySelector('#gm-ribbon-meta').textContent='Illustrative route · native geometry · no simulation';
  r.querySelector('.gm-hint-btn').addEventListener('click',e=>{const h=r.querySelector('.gm-hints');h.hidden=!h.hidden;e.currentTarget.setAttribute('aria-expanded',String(!h.hidden));});
  r.querySelectorAll('[data-layer]').forEach(b=>b.addEventListener('click',()=>b.setAttribute('aria-pressed',String(b.getAttribute('aria-pressed')!=='true'))));
  r.querySelector('.gm-close').addEventListener('click',()=>signal('fixture:close-map',{}));
  const canvas=r.querySelector('canvas'), box=r.getBoundingClientRect(), w=box.width,h=box.height;
  canvas.width=w;canvas.height=h;const g=canvas.getContext('2d');
  const center={x:w*.48,y:h*.5}, dest={x:w*.66,y:h*.41};
  g.strokeStyle='#2c3b2f';g.lineWidth=1;
  for(let x=24;x<w;x+=64){g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke();}
  for(let y=20;y<h;y+=64){g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke();}
  drawObjectiveCorridor(g,{start:center,end:dest,corridorMode:'full'});
  drawPlayerHull(g,center.x,center.y,2.7);
  drawStationGlyph(g,dest.x,dest.y);drawObjectiveBracket(g,dest.x,dest.y);
  drawGateGlyph(g,w*.36,h*.36);drawHostileGlyph(g,w*.62,h*.65,1.4);
  g.fillStyle=palette.ink;g.font='500 14px "Instrument Sans",sans-serif';
  g.fillText('Vesta Exchange',dest.x-45,dest.y-25);g.fillText('Transit gate',w*.36-35,h*.36-20);
  window.ORBITAL_QA.scope='Native chart chrome and tactical glyph renderers; synthetic positions; no galaxyMap controller.';
}

function flight() {
  document.documentElement.dataset.kTemp='flight';injectHudCss();
  const hud=document.querySelector('#hud');hud.style.position='fixed';
  const left=el('div','sf-leftstack'), context=el('div','sf-leftcontext');
  context.innerHTML='<div class="sf-mission-tracker"><p class="k-caps">Tracked delivery</p><strong>Sealed cargo to Vesta</strong><p class="k-t-fine">Dock at Vesta Exchange · 6 u intact</p></div><div class="sf-nav-readout"><strong class="sf-nav-readout__h">Vesta Exchange</strong><div class="sf-nav-readout__sub">2.4 km · approach</div></div>';
  const bars=el('div','sf-bars');bars.innerHTML='<div class="sf-condition-head"><div class="sf-condition-metrics"><span class="sf-cond-stat">Hull <strong>'+(edge==='danger'?'24':'86')+'%</strong></span><span class="sf-cond-stat">Shield <strong>'+(edge==='danger'?'12':'78')+'%</strong></span></div></div>';
  const schematic=el('div','sf-schematic'+(edge==='danger'?' sf-sch-critical':''));schematic.innerHTML=shipConditionMarkup('ship_kestrel');schematic.style.setProperty('--hull-pct',edge==='danger'?'24%':'86%');schematic.setAttribute('role','img');schematic.setAttribute('aria-label',edge==='danger'?'Hull 24 percent; shield 12 percent':'Hull 86 percent; shield 78 percent');
  const shield=schematic.querySelector('.sf-sch-shield');shield.style.strokeDasharray='289';shield.style.strokeDashoffset=edge==='danger'?'254':'64';bars.appendChild(schematic);
  [['energy','Energy',64],['boost','Drive',82],['heat','Heat',edge==='danger'?92:34],['fuel','Fuel',72]].forEach(([mod,label,value])=>{const row=el('div','sf-barrow');row.innerHTML=hudBarMarkup(label,mod);row.querySelector('.sf-bar__fill').style.transform='scaleX('+value/100+')';row.querySelector('.sf-barrow__num').textContent=value+'%';bars.appendChild(row);});
  append(left,context,bars);hud.appendChild(left);
  const right=el('div','sf-rightdock');
  if(edge==='danger'){
    const target=el('div','sf-target sf-hudpanel');target.innerHTML=targetFrameHtml();target.setAttribute('role','status');target.setAttribute('aria-label','Current target');
    target.querySelector('.sf-target__name').textContent='Raider · Interceptor';target.querySelector('.sf-target__faction').textContent='Hostile';target.querySelector('.sf-target__threat').hidden=false;target.querySelector('.sf-target__threat-word').textContent='Closing · elevated threat';target.querySelector('.sf-target__threat-pips').textContent='▰▰▱';target.querySelector('.sf-target__dist').textContent='640 wu';target.querySelector('.sf-target__rangefill').style.transform='scaleX(.64)';target.querySelector('.sf-target__identity').style.display='block';target.querySelector('.sf-target__identity').textContent='Selected contact';right.appendChild(target);
    const alerts=el('div');alerts.id='alerts';alerts.style.cssText='position:absolute;top:24px;left:50%;transform:translateX(-50%)';alerts.innerHTML='<div class="sf-alert sf-alert--danger">Hull critical · break contact</div>';hud.appendChild(alerts);
  }
  const radar=el('canvas');radar.width=240;radar.height=240;radar.setAttribute('aria-label','Radar glyph fixture');radar.style.cssText='width:220px;height:220px;border:1px solid #63765b;background:#101916';right.appendChild(radar);hud.appendChild(right);
  const g=radar.getContext('2d');g.strokeStyle='#526047';[45,80,110].forEach(radius=>{g.beginPath();g.arc(120,120,radius,0,Math.PI*2);g.stroke();});drawPlayerHull(g,120,120,0);drawStationGlyph(g,177,70);drawObjectiveBracket(g,177,70);if(edge==='danger')drawHostileGlyph(g,70,80,1.2);
  const bindings=Object.fromEntries(RAIL_SLOTS.filter(s=>s.action).map(s=>[s.action,['Digit'+s.index]])), rail=createPowerRail({bindings});rail.update({4:{state:'cooling',cooldownMs:4000},7:{state:'armed'},8:{state:'locked'}});hud.appendChild(rail.el);window.ORBITAL_QA.powerRail=rail;
  const note=el('div','qa-world-omitted','World renderer not mounted · production flight instruments only');note.style.cssText='position:fixed;top:45%;left:50%;transform:translateX(-50%);font:13px "Instrument Sans",sans-serif;color:#7a887d;max-width:40vw;text-align:center';document.body.appendChild(note);
  window.ORBITAL_QA.scope='Native instruments/target markup/power-rail/glyph code; synthetic read models; no live flight, targeting or simulation.';
}
try{if(screen==='title')title();else if(screen==='pause')pause();else if(screen==='settings')settings();else if(screen==='gameover')gameover();else if(screen==='saves')saves();else if(screen==='research')research();else if(screen==='navigation')navigation();else if(screen==='flight')flight();else station(screen==='station'?'market':screen);window.ORBITAL_QA.ready=true;}catch(error){document.body.textContent='FIXTURE ERROR: '+error.stack;window.ORBITAL_QA.error=error.stack;throw error;}
