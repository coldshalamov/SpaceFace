import { world } from '../src/systems/world.js';
import { galaxyMapScreen, buildSystemModel, resolveMapOpenTarget, commitCoursePayload, applyMapOpenIntentToView, resolveGalaxyMapPrimaryAction } from '../src/ui/galaxyMap.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { stationContacts } from '../src/systems/stationContacts.js';
import { generateContacts, getChoices, buildReply } from '../src/ui/station/barContacts.js';
import { createBarScreen } from '../src/ui/station/screens/bar.js';
import { fakeDom } from './helpers/fake-dom.mjs';
import { ceresArrivalRead, ceresArrivalChoices, ceresArrivalMapOffer, ceresArrivalReply, krollStoryScene } from '../src/story/ceresArrivalStory.js';
import { CERES_NINTH_MOUTH as CUT, worldPoint } from '../src/data/ceresNinthMouth.js';
const clone=v=>JSON.parse(JSON.stringify(v));
const dock=(s,station)=>{s.ui.docked=true;s.ui.dockedStationId=station;s.world.currentSectorId=station==='station_ceres'?CUT.sectorId:'sector_helios_prime';};
const read=(s,station,c,id='ceres_arrival_people')=>buildReply(c.role,id,{state:s,bus:{emit(){}}},station,c);
const receipt=()=>({receiptId:CUT.id+':barge-arrival:01',storyId:CUT.id,bargeIdentity:CUT.id+':barge',receiverIdentity:CUT.id+':receiver',count:1,committed:true,tick:1,simTime:1,approach:'lamps_unseated'});
function mountBar(state, bus) {
  const names = ['document', 'window', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const previous = Object.fromEntries(names.map(k => [k, globalThis[k]]));
  const doc = fakeDom(), make = doc.createElement;
  doc.createElement = tag => {
    const node = make(tag), selectors = new Map();
    Object.assign(node, { isConnected: true, hidden: false, offsetWidth: 10, ownerDocument: doc });
    node.style.getPropertyValue = () => ''; node.style.removeProperty = () => {};
    node.getBoundingClientRect = () => ({ left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 });
    node.querySelector = sel => { if (!selectors.has(sel)) selectors.set(sel, doc.createElement('div')); return selectors.get(sel); };
    node.replaceChildren = (...children) => { node.children = []; children.forEach(c => node.appendChild(c)); };
    node.removeChild = child => { node.children = node.children.filter(c => c !== child); child.parentNode = null; };
    node.remove = () => node.parentNode?.removeChild(node); node.scrollIntoView = () => {};
    node.hasAttribute = key => key in node.attributes; return node;
  };
  doc.createElementNS = (_ns, tag) => doc.createElement(tag); doc.body = doc.createElement('body');
  doc.querySelector = () => null; doc.addEventListener = () => {}; doc.removeEventListener = () => {};
  globalThis.document = doc; globalThis.window = { addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1 };
  globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = () => {};
  const screen = createBarScreen({ state, bus }); screen.onShow();
  const rail = screen.el.querySelector('.sx-bar__rail'), stage = screen.el.querySelector('.sx-bar__stage');
  const click = async (node, attr, value) => {
    const button = doc.createElement('button'); button.setAttribute(attr, value);
    for (const fn of node.listeners.click || []) await fn({ target: { closest: sel => sel === `[${attr}]` ? button : null } });
  };
  return { screen, rail, stage, click, close() { screen.dispose(); for (const k of names) {
    if (previous[k] === undefined) delete globalThis[k]; else globalThis[k] = previous[k];
  } } };
}


test('Helios lead and Ceres host expose the same real apron without replacing work or contacts',()=>{
 const sim=createSimulation({seed:47,systems:[stationContacts],updateOrder:[]}),s=sim.state;
 try{
  for(const station of ['station_helios','station_ceres']){
   dock(s,station);const people=generateContacts(station,s),c=people.find(c=>station==='station_helios'?c.canonicalKey==='kessler':c.id==='contact_station_ceres_0');
   assert.ok(c);assert.equal(people.filter(c=>getChoices(c.role,c).some(q=>q.id==='ceres_arrival_people')).length,1);
   assert.ok(getChoices(c.role,c).some(q=>q.id==='ceres_arrival_map'));
   assert.ok(getChoices(c.role,c).some(q=>q.id===(station==='station_helios'?'ceres_second_measure_shift':'rumors')));
   const before=clone({jobs:s.npcJobs,player:s.player,missions:s.missions});
   assert.match(read(s,station,c).text,/crew|boat/);assert.deepEqual(clone({jobs:s.npcJobs,player:s.player,missions:s.missions}),before);
   const map=ceresArrivalMapOffer(s,station,c);assert.equal(map.focus,station==='station_ceres'?'system':'galaxy');assert.deepEqual(map.pos,station==='station_ceres'?worldPoint(CUT.berth.local):undefined);assert.equal(map.sectorId,CUT.sectorId);
   assert.equal(ceresArrivalMapOffer(s,'station_tethys',c),null);
   assert.equal(ceresArrivalMapOffer(s,station,{...c,id:'foreign',canonicalKey:'foreign'}),null);
   s.ui.docked=false;assert.equal(ceresArrivalMapOffer(s,station,c),null);
  }
 }finally{sim.dispose();}
});
test('ordinary mounted Ceres host choice opens a map-only handoff and preserves the response',async()=>{
 const sim=createSimulation({seed:47,systems:[stationContacts],updateOrder:[]}),s=sim.state;dock(s,'station_ceres');
 const events=[];sim.bus.on('ui:open',e=>events.push(e));let h;
 try{
  h=mountBar(s,sim.bus);await h.click(h.rail,'data-contact','contact_station_ceres_0');
  await h.click(h.stage,'data-choice','ceres_arrival_people');
  assert.match(h.stage.innerHTML,/refinery buys what comes out/);
  const before=clone({nav:s.nav,autopilot:s.autopilot,missions:s.missions,credits:s.player.credits,cargo:s.player.cargo});
  await h.click(h.stage,'data-choice','ceres_arrival_map');
  assert.equal(s.ui.mapOpenIntent.sectorId,CUT.sectorId);assert.deepEqual(s.ui.mapOpenIntent.pos,worldPoint(CUT.berth.local));
  assert.equal(s.ui.mapOpenIntent.source,'station-bar:ceres-arrival');assert.match(h.stage.innerHTML,/course is yours/);
  assert.deepEqual(clone({nav:s.nav,autopilot:s.autopilot,missions:s.missions,credits:s.player.credits,cargo:s.player.cargo}),before);
  s.ui.docked=false;delete s.ui.mapOpenIntent;await h.click(h.stage,'data-choice','ceres_arrival_map');assert.equal(s.ui.mapOpenIntent,undefined);
 }finally{h?.close();sim.dispose();}
});
test('station response requires the exact committed barge receipt and preserves historical rescue after later loss',()=>{
 const sim=createSimulation({seed:47,systems:[],updateOrder:[]}),s=sim.state;dock(s,'station_ceres');
 try{
  const c=generateContacts('station_ceres',s).find(c=>c.id==='contact_station_ceres_0');
  s.npcJobs.ceresNinthMouth={version:1,storyId:CUT.id,objects:{barge:{lost:false}},rescue:receipt()};
  assert.equal(ceresArrivalRead(s).phase,'rescued');assert.match(read(s,'station_ceres',c).text,/crew-transfer entry came through/);
  const saved=clone(s.npcJobs.ceresNinthMouth);
  for(const corrupt of [q=>q.count=9,q=>q.committed=false,q=>q.bargeIdentity='copy',q=>q.simTime=NaN,q=>q.approach='unknown']){
   s.npcJobs.ceresNinthMouth=clone(saved);corrupt(s.npcJobs.ceresNinthMouth.rescue);assert.equal(ceresArrivalRead(s).phase,'waiting');assert.doesNotMatch(read(s,'station_ceres',c).text,/entry came through/);
  }
  s.npcJobs.ceresNinthMouth=clone(saved);s.npcJobs.ceresNinthMouth.objects.barge.lost=true;assert.equal(ceresArrivalRead(s).phase,'rescued');
  s.npcJobs.ceresNinthMouth.rescue=null;assert.equal(ceresArrivalRead(s).phase,'lost');assert.match(read(s,'station_ceres',c).text,/will not call that a rescue/);
 }finally{sim.dispose();}
});
test('Kroll tells truthful optional aftercare and never invents a census or required lamp gate',()=>{
 for(const status of ['waiting','rescued','lost','unavailable'])for(const lights of [0,1,3]){
  const scene=krollStoryScene({status,lights},'arrival','lights');assert.ok(scene.headline&&scene.detail);assert.doesNotMatch(scene.detail,/9 IN|8 OUT|nine came|reward|credits/i);
  if(status==='rescued'&&lights<3)assert.match(scene.detail,/rescue stands either way/);
  if(status==='lost')assert.match(scene.detail,/never happened/);
 }
 assert.match(krollStoryScene({status:'waiting'},'people').detail,/Cathedral Vigil/);
 assert.match(krollStoryScene({status:'waiting'},'work').detail,/reverse out/);
});

test('ordinary Ceres chart exposes one selectable apron before admission, referral selects it and Set Course remains explicit',()=>{
 const sim=createSimulation({seed:47,systems:[],updateOrder:[]}),s=sim.state;
 try{
  s.mode='flight';s.run.kind='adventure';s.world.currentSectorId=CUT.sectorId;dock(s,'station_ceres');
  const c=generateContacts('station_ceres',s).find(c=>c.id==='contact_station_ceres_0');
  const intent={focus:'system',...ceresArrivalMapOffer(s,'station_ceres',c)};
  const before=clone({nav:s.nav,jobs:s.npcJobs,entities:s.entityList.map(e=>e.id)});
  const model=buildSystemModel(s,CUT.sectorId),target=resolveMapOpenTarget(s,intent);
  assert.ok(target);assert.equal(target.kind,'poi');
  assert.equal(model.points.filter(p=>p.id===target.id).length,1);
  assert.deepEqual({x:target.x,z:target.z},worldPoint(CUT.berth.local));
  const view=applyMapOpenIntentToView({},intent,s);assert.equal(view.openTarget.id,target.id);
  assert.deepEqual(clone({nav:s.nav,jobs:s.npcJobs,entities:s.entityList.map(e=>e.id)}),before);
  s.ui.docked=false;const commit=commitCoursePayload(s,target);assert.ok(commit);assert.equal(commit.pos.x,target.x);assert.equal(commit.pos.z,target.z);
  s.world.currentSectorId='sector_helios_prime';const outbound=commitCoursePayload(s,target);assert.equal(outbound.type,'sector');assert.equal(outbound.sectorId,CUT.sectorId);assert.equal(outbound.pos,undefined);
  assert.equal(resolveMapOpenTarget(s,{...intent,source:'unknown'}),null);
  assert.equal(resolveMapOpenTarget(s,{...intent,pos:{x:target.x+1,z:target.z}}),null);
  assert.equal(buildSystemModel(s,'sector_helios_prime').points.filter(p=>p.id===target.id).length,0);
 }finally{sim.dispose();}
});

test('existing worker domain carries rescue and conversation for station aftercare, then clears them on a new game',async()=>{
 const {createDomainDiffer,applyDomainPathUpdate}=await import('../scripts/lib/simReadModel.mjs');
 const state={npcJobs:{byId:{},ceresNinthMouth:{version:1,storyId:CUT.id,objects:{barge:{lost:false}},rescue:null,conversation:{met:false,plan:null}}}};
 const differ=createDomainDiffer(),domains=new Map();
 for(const u of differ.diff(state,1).updates)applyDomainPathUpdate(domains,u);
 const mirror=()=>({npcJobs:{ceresNinthMouth:domains.get('npcJobs.ceresNinthMouth')}});
 assert.equal(ceresArrivalRead(mirror()).phase,'waiting');
 state.npcJobs.ceresNinthMouth.conversation={met:true,plan:'lights'};state.npcJobs.ceresNinthMouth.rescue=receipt();
 for(const u of differ.diff(state,31).updates)applyDomainPathUpdate(domains,u);
 assert.equal(ceresArrivalRead(mirror()).phase,'rescued');assert.equal(ceresArrivalRead(mirror()).plan,'lights');
 state.npcJobs={byId:{}};
 for(const u of differ.diff(state,61).updates)applyDomainPathUpdate(domains,u);
 assert.equal(ceresArrivalRead(mirror()).phase,'unvisited');
});


// Headless canvas recording, not rendered/browser layout. Camera, projection,
// draw-target admission, pointer hit selection and route owner below are real.
function mapScene(stationId, width, height) {
 const sim=createSimulation({seed:47,systems:[{...world,update(){}}],updateOrder:[]});
 const s=sim.state;s.mode='flight';s.run.kind='adventure';dock(s,stationId);
 const events=[];for(const name of ['ui:setCourse','world:requestRoute','world:requestJump','nav:engageRoute'])sim.bus.on(name,p=>events.push([name,p]));
 const chart=Object.create(galaxyMapScreen),canvas={width,height,setAttribute(){},getBoundingClientRect:()=>({left:0,top:0,width,height,right:width,bottom:height})};
 Object.assign(chart,{_ctx:{state:s,bus:sim.bus,registry:sim.registry},_clickTargets:[],_layers:{},_cams:{galaxy:{cx:0,cy:0,zoom:1},system:{cx:0,cy:0,zoom:1.5},local:{cx:0,cy:0,zoom:1.5}},_canvas:canvas,_dpr:1,_root:null,
  _drawSensorLattice(){},_drawLocalPreview(){},_drawEdgeScale(){},_placeLabels:()=>[],refresh(){},_updateEngageControl(){},_updateRailSections(){},_updatePlotControl(){}});
 const grad={addColorStop(){}};
 const g=new Proxy({}, {get:(o,k)=>k in o?o[k]:k==='measureText'?text=>({width:String(text).length*6}):['createLinearGradient','createRadialGradient'].includes(k)?()=>grad:()=>{},set:(o,k,v)=>(o[k]=v,true)});
 const contact=generateContacts(stationId,s).find(c=>stationId==='station_helios'?c.canonicalKey==='kessler':c.id==='contact_station_ceres_0');
 const open=()=>{
  const before=clone({nav:s.nav,sector:s.world.currentSectorId});
  const reply=buildReply(contact.role,'ceres_arrival_map',chart._ctx,stationId,contact);
  const intent=clone(s.ui.mapOpenIntent);chart.onShow(chart._ctx);
  chart._clickTargets=[];
  if(intent.focus==='galaxy')chart._drawGalaxy(g,s,width,height);else chart._drawSystem(g,s,width,height);
  assert.deepEqual(clone({nav:s.nav,sector:s.world.currentSectorId}),before,'opening is not plotting or travelling');
  assert.equal(events.length,0);
  return {reply,intent,target:chart._selectedTarget,drawn:chart._clickTargets.find(t=>t.id===chart._selectedTarget?.id)};
 };
 return {sim,s,events,chart,open,close(){chart.onHide?.();sim.dispose();}};
}
for(const [width,height] of [[1440,900],[900,600],[390,844]]){
 test(`actual Ceres map onShow/draw/click keeps apron visible and nav coordinates global at ${width}x${height}`,()=>{
  const f=mapScene('station_ceres',width,height);
  try{
   const {intent,drawn,target}=f.open();assert.equal(intent.focus,'system');assert.ok(drawn,'selected authored apron must really be drawn and hit-testable');
   const field=f.chart._clearField(width,height);
   assert.ok(drawn.sx>=field.x&&drawn.sx<=field.x+field.width&&drawn.sy>=field.y&&drawn.sy<=field.y+field.height);
   assert.deepEqual(f.chart._camera.focusGlobal,worldPoint(CUT.berth.local),'sector origin is applied exactly once');
   assert.deepEqual({x:f.chart._cams.system.cx,z:f.chart._cams.system.cy},target.drawPos);
   f.chart._selectedTarget=null;f.chart._onCanvasClick({clientX:drawn.sx,clientY:drawn.sy});
   assert.equal(f.chart._selectedTarget.id,target.id);assert.equal(f.chart._selectedTarget.sectorId,CUT.sectorId);
   assert.equal(f.chart._selectedTarget.poiType,'beacon');assert.equal(f.chart._selectedTarget.chartNote,target.chartNote);
   assert.match(f.chart._selectedTarget.chartNote,/Slow near the mast/);
   f.s.ui.docked=false;f.chart._activateSelectedCourse();
   const course=f.events.find(([n])=>n==='ui:setCourse')?.[1];assert.deepEqual(course.pos,worldPoint(CUT.berth.local));
   assert.deepEqual(f.s.nav.waypoint.pos,worldPoint(CUT.berth.local));
   assert.equal(f.events.filter(([n])=>n==='world:requestJump'||n==='world:requestRoute').length,0);
  }finally{f.close();}
 });
 test(`actual Helios referral selects visible Ceres sector and only explicit Plot creates its route at ${width}x${height}`,()=>{
  const f=mapScene('station_helios',width,height);
  try{
   const {intent,drawn,target,reply}=f.open();assert.equal(intent.focus,'galaxy');assert.equal(intent.pos,null);
   assert.equal(target.kind,'sector');assert.equal(target.sectorId,CUT.sectorId);assert.ok(drawn,'Ceres must be a visible clickable galaxy node, not a missing off-sector POI');
   const field=f.chart._clearField(width,height);assert.ok(drawn.sx>=field.x&&drawn.sx<=field.x+field.width&&drawn.sy>=field.y&&drawn.sy<=field.y+field.height);
   assert.match(reply.text,/has not plotted or engaged/);
   assert.ok(!f.chart._clickTargets.some(t=>t.id===CUT.id+':receiving-apron'));
   f.chart._selectedTarget=null;f.chart._onCanvasClick({clientX:drawn.sx,clientY:drawn.sy});assert.equal(f.chart._selectedTarget.id,CUT.sectorId);
   // The existing neighbor primary truthfully says Jump; do not relabel it as plot.
   assert.equal(resolveGalaxyMapPrimaryAction(f.s,f.chart._selectedTarget).kind,'jump');
   assert.equal(f.chart._activatePlotOnlyCourse(),true);
   assert.equal(f.events.filter(([n])=>n==='world:requestRoute').length,1);
   assert.equal(f.events.filter(([n])=>n==='world:requestJump'||n==='nav:engageRoute').length,0);
   const course=f.events.find(([n])=>n==='ui:setCourse')?.[1];assert.equal(course.type,'sector');assert.equal(course.sectorId,CUT.sectorId);assert.equal(course.pos,undefined);
   assert.ok(f.s.nav.route?.legs?.length,'the real world owner must retain the planned route');
   assert.equal(f.s.nav.route.legs.at(-1).to,CUT.sectorId);assert.equal(f.s.world.currentSectorId,'sector_helios_prime');
  }finally{f.close();}
 });
}
