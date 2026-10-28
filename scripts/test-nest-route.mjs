// Production route/runtime modules with declared actor-admission ports. Not a native solver.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
const aux = process.argv.flatMap((v,i,a) => v === '--aux-root' ? [path.resolve(a[i+1])] : []);
const roots = [root,...aux], coreOnly = process.argv.includes('--core-sector-only');
const find = p => roots.map(r=>path.join(r,p)).find(fs.existsSync);
const inventory=[];
const read = p => { const f=find(p); assert(f,`Missing actual source ${p}`); const b=fs.readFileSync(f); inventory.push({path:p,file:f,sha256:createHash('sha256').update(b).digest('hex')}); return b.toString(); };
const util=find('scripts/compost-clearance-geometry.mjs'); assert(util,'Existing actual clearance-reader utility required');
const {loadClearanceGeometry}=await import(pathToFileURL(util));
const geometry=await loadClearanceGeometry({root,auxRoots:aux});
const context=vm.createContext({console,structuredClone,Map,Set,WeakMap,Object,Number,Math,Array,JSON});
const cache=new Map();
const ports={
 'src/data/collisionProxyManifests.js':['hullEnvelopeWu','proxyOuterRadiusWu','COLLISION_PROXY_MANIFESTS'],
 'src/data/modelTruth.js':['modelTruthProxyManifest'],
 'src/core/physicsAuthority.js':['shouldSyncPhysicsBodyEntity','substanceFor'],
 'src/data/physicsMaterials.js':['PHYSICS_MATERIALS'],
};
function mod(p){
 if(cache.has(p))return cache.get(p);
 let m;
 if(ports[p])m=new vm.SyntheticModule(ports[p],function(){for(const k of ports[p])this.setExport(k,geometry[k]);},{context,identifier:p});
 else if(p==='src/data/frontierRegions/index.js'&&coreOnly)m=new vm.SyntheticModule(['FRONTIER_ORIGINS','FRONTIER_SECTOR_IDS'],function(){this.setExport('FRONTIER_ORIGINS',{});this.setExport('FRONTIER_SECTOR_IDS',[]);},{context,identifier:p});
 else m=new vm.SourceTextModule(read(p),{context,identifier:p});
 cache.set(p,m);return m;
}
const entry=new vm.SourceTextModule(`import * as route from './src/systems/nestVisit.js';import * as data from './src/data/nestVisit.js';import * as nest from './src/data/encounters/705-the-nest.js';import * as campaign from './src/story/campaign47a/campaignTransitions.js';export {route,data,nest,campaign};`,{context,identifier:'entry.mjs'});
await entry.link((s,r)=>mod(path.posix.normalize(path.posix.join(path.posix.dirname(r.identifier),s))));await entry.evaluate();
const {route:R,data:D,nest:N,campaign:C}=entry.namespace;
const plain=x=>JSON.parse(JSON.stringify(x));
function harness(){
 let next=1;const requests=[],events=[];
 const state={mode:'flight',run:{kind:'adventure'},simTime:1000,tick:1,world:{currentSectorId:D.NEST_VISIT.sectorId},story:{beatIndex:2,flags:{}},player:{flags:{}},entities:new Map(),entityList:[],encounterDirector:{live:{}}};
 C.initCampaignSidecar(state,1000);state.story.campaign47a.stepProgress['2']={completed:['cinder_board','compost'],updatedAtS:999};
 const add=spec=>{const e={id:next++,alive:true,hull:460,hullMax:460,armorHp:110,armorMax:110,shield:0,shieldMax:0,cap:100,capMax:100,rot:0,angVel:0,vel:{x:0,z:0},data:{},flags:{},...spec};e.data||={};state.entities.set(e.id,e);state.entityList.push(e);return e;};
 const player=add({type:'ship',radius:10,mass:12,pos:D.nestApproach()});state.playerId=player.id;
 const d={state,helpers:{removeEntity(id){state.entities.delete(id);state.entityList=state.entityList.filter(e=>e.id!==id);}},now:()=>state.simTime,player:()=>state.entities.get(state.playerId),emit:(name,payload)=>events.push({name,payload}),say(){},
  adoptNestActor(live,e,role){if(state.entities.get(e.id)!==e||e.data?.nestEncounterId!==live.id)return false;if(!live.ids.includes(e.id))live.ids.push(e.id);live.roles[e.id]=role;(live.data.nestAdoptedIds||=[]).push(e.id);return true;},
  releaseNestActor(live,e){live.ids=live.ids.filter(id=>id!==e.id);delete live.roles[e.id];return true;},
  canSpawnNestActor(pos,radius){return R.nestSiteClear(state,pos,radius);},
  spawnShips(live,specs){return specs.map(spec=>{let spawn={type:'ship',radius:spec.role==='wasp'?12:30,mass:spec.role==='wasp'?16:520,pos:{...spec.pos},data:{ai:{}},armorHp:110,armorMax:110,shield:0,shieldMax:0,cap:100,capMax:100,hull:spec.role==='wasp'?55:460,hullMax:spec.role==='wasp'?55:460};if(N.applyNestBroodSpawnSpec)N.applyNestBroodSpawnSpec(spawn,live,spec.role==='wasp'?spec.nestActorSlot:'carrier');if(spec.nestSavedActor&&N.applyNestSavedSpawnSpec)spawn=N.applyNestSavedSpawnSpec(spawn,spec.nestSavedActor)||spawn;const e=add(spawn);live.ids.push(e.id);live.roles[e.id]=spec.role;return e.id;});},
  spawnProp(live,opts){let spawn={type:'beacon',pos:{...opts.pos},radius:12,mass:400,data:{storyPropKind:'nest_door'},hull:1,hullMax:1};if(opts.nestSavedActor&&N.applyNestSavedSpawnSpec)spawn=N.applyNestSavedSpawnSpec(spawn,opts.nestSavedActor)||spawn;return add(spawn);},
  entsOf(live,role){return live.ids.map(id=>state.entities.get(id)).filter(e=>e&&(!role||live.roles[e.id]===role));},
  abort(live,reason){live.phase='done';live.outcome='aborted:'+reason;delete state.encounterDirector.live[live.id];events.push({name:'abort',payload:reason});},
  resolve(live,outcome){R.recordNestOutcome(d,live,outcome);live.phase='done';live.outcome=outcome;delete state.encounterDirector.live[live.id];events.push({name:'resolved',payload:outcome});},
  requestAuthoredEncounter(payload){requests.push(plain(payload));if(d.block)return{ok:false,reason:d.block};const live={id:payload.encounterId,shapeId:'the_nest',sectorId:payload.sectorId,anchor:{...payload.anchor},plan:{zoneCenter:{...payload.anchor}},data:{...payload.data},ids:[],roles:{},phase:'new'};state.encounterDirector.live[live.id]=live;N.runtime.fire(d,live,state);return live.phase==='done'?{ok:false,reason:'resolved_on_fire'}:{ok:true,encounterId:live.id};},
 };return{state,d,player,add,requests,events};
}
let passed=0;const test=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
test('first approach requests actual705 with no forcing and a fixed berth',()=>{const h=harness();assert.equal(R.tickNestVisit(h.d).ok,true);assert.equal(h.requests.length,1);assert.equal(h.requests[0].force,undefined);assert.equal(h.requests[0].respectPacing,true);assert.deepEqual(h.requests[0].anchor,plain(D.nestPosition()));assert.equal(h.state.encounterDirector.nestVisit.status,'active');assert.equal(h.state.entities.size,4);R.tickNestVisit(h.d);assert.equal(h.requests.length,1);});
for(const [name,mutate]of[
 ['wrong sector',h=>h.state.world.currentSectorId='sector_helios_core'],['Swarm',h=>h.state.run={kind:'survival',phase:'active'}],['docked',h=>h.state.player.flags.docked=true],['restore barrier',h=>h.d._saveRestoring=true],['dead pilot',h=>h.player.alive=false],['before Compost',h=>h.state.story.campaign47a.stepProgress['2'].completed=['cinder_board']],['outside approach',h=>h.player.pos={x:0,z:0}],['invalid saved visit',h=>h.state.encounterDirector.nestVisit=null],
])test(name+' does not admit or award',()=>{const h=harness();mutate(h);assert.equal(R.tickNestVisit(h.d).ok,false);assert.equal(h.requests.length,0);assert.equal(D.nestOutcomeReceipt(h.state),null);});
test('occupied berth waits without teleporting or moving the player',()=>{const h=harness();const p={...h.player.pos};const e=h.add({type:'pickup',radius:8,mass:20,pos:D.nestPosition(),data:{}});assert.equal(R.tickNestVisit(h.d).reason,'occupied');assert.equal(h.requests.length,0);assert.deepEqual(plain(h.player.pos),p);h.state.entities.delete(e.id);h.state.simTime+=2;assert.equal(R.tickNestVisit(h.d).ok,true);});
test('pacing denial retains readable wait and retries once eligible',()=>{const h=harness();h.d.block='pressure';assert.equal(R.tickNestVisit(h.d).ok,false);assert.equal(h.state.encounterDirector.nestVisit.status,'waiting');assert.match(D.nestWaypoint(h.state).reason,/traffic/);assert.equal(R.tickNestVisit(h.d).reason,'retry_wait');h.state.simTime+=2;h.d.block=null;assert.equal(R.tickNestVisit(h.d).ok,true);});
test('foreign active705 is not copied into a Charon save identity',()=>{const h=harness();h.d.requestAuthoredEncounter({shapeId:'the_nest',encounterId:'foreign',sectorId:'sector_helios_core',anchor:{x:0,z:0},data:{}});assert.equal(R.captureNestVisit(h.d),undefined);assert.equal(h.state.encounterDirector.nestVisit,undefined);});
test('generic abort is not an escape receipt',()=>{const h=harness();R.tickNestVisit(h.d);const live=Object.values(h.state.encounterDirector.live)[0];h.d.abort(live,'sector_exit');assert.equal(D.nestOutcomeReceipt(h.state),null);});
test('hard departure after real contact records escape once',()=>{const h=harness();R.tickNestVisit(h.d);const live=Object.values(h.state.encounterDirector.live)[0];assert.equal(R.leaveNestVisit(h.d,live),true);const receipt=D.nestOutcomeReceipt(h.state);assert.equal(receipt.outcome,'carrier_escapes');assert.equal(R.leaveNestVisit(h.d,live),false);assert.equal(h.events.filter(e=>e.name==='resolved').length,1);assert.equal(C.recordBeatStep(h.state,'encounter:resolved',receipt,1000).ok,true);});
test('save restoring is never a departure outcome',()=>{const h=harness();R.tickNestVisit(h.d);const live=Object.values(h.state.encounterDirector.live)[0];h.d._saveRestoring=true;assert.equal(R.leaveNestVisit(h.d,live),false);assert.equal(D.nestOutcomeReceipt(h.state),null);});
test('captured active visit is bounded and contains no live numeric actor IDs',()=>{const h=harness();R.tickNestVisit(h.d);const saved=plain(R.captureNestVisit(h.d));assert.equal(saved.status,'active');assert.equal(saved.snapshot.doors.length,2);assert.equal(JSON.stringify(saved).includes('carrierId'),false);assert.equal(D.normalizeNestVisit({...saved,sectorId:'sector_helios_core'}),null);});
test('Continue restores actual remaining hull, armor, pose and launch clock with fresh IDs',()=>{
 const h=harness();R.tickNestVisit(h.d);const live=Object.values(h.state.encounterDirector.live)[0];const carrier=h.state.entities.get(live.data.nest.carrierId);
 carrier.hull=123;carrier.armorHp=31;carrier.vel={x:7,z:-3};carrier.rot=.4;carrier.angVel=.2;carrier.cap=17;
 h.state.simTime+=2;const saved=plain(R.captureNestVisit(h.d));
 const restored=harness();restored.add({type:'asteroid',radius:5,pos:{x:100000,z:100000}});restored.state.encounterDirector.nestVisit=saved;
 assert.equal(R.tickNestVisit(restored.d).ok,true);const next=Object.values(restored.state.encounterDirector.live)[0];const body=restored.state.entities.get(next.data.nest.carrierId);
 assert.notEqual(body.id,carrier.id);assert.equal(body.hull,123);assert.equal(body.armorHp,31);assert.equal(body.cap,17);assert.deepEqual(plain(body.vel),{x:7,z:-3});assert.equal(body.rot,.4);assert.equal(body.angVel,.2);
 assert.equal(next.data.nest.remaining,6);assert.equal(next.data.nest.nextLaunchS-restored.state.simTime,saved.snapshot.launchIn);
 assert.equal(restored.requests[0].data.nestResume,true);assert.equal(restored.d._nestResumePermit,null);
});
test('a distant saved active visit cannot reappear beside the pilot or instantly escape',()=>{const h=harness();R.tickNestVisit(h.d);const saved=plain(R.captureNestVisit(h.d));const r=harness();r.state.encounterDirector.nestVisit=saved;r.player.pos={x:saved.anchor.x+3100,z:saved.anchor.z};assert.equal(R.tickNestVisit(r.d).reason,'resume_out_of_reach');assert.equal(r.requests.length,0);assert.equal(D.nestOutcomeReceipt(r.state),null);});
test('death immediately before save is settled by the real runtime without respawning a carrier',()=>{const h=harness();R.tickNestVisit(h.d);const live=Object.values(h.state.encounterDirector.live)[0];const carrier=h.state.entities.get(live.data.nest.carrierId);carrier.alive=false;carrier.hull=0;const saved=R.captureNestVisit(h.d);assert.equal(saved.status,'terminal');assert.equal(saved.receipt.outcome,'carrier_down');const r=harness();r.state.encounterDirector.nestVisit=plain(saved);assert.equal(R.tickNestVisit(r.d).reason,'terminal');assert.equal(r.requests.length,0);});
test('unknown missing actor is not recast as a fresh full-health survivor or victory',()=>{const h=harness();R.tickNestVisit(h.d);const live=Object.values(h.state.encounterDirector.live)[0];h.state.entities.delete(live.data.nest.doorIds[0]);const saved=plain(R.captureNestVisit(h.d));assert.equal(saved.snapshot.doors[0].status,'missing');const r=harness();r.state.encounterDirector.nestVisit=saved;assert.equal(R.tickNestVisit(r.d).ok,false);assert.equal(D.nestOutcomeReceipt(r.state),null);assert.equal(r.state.entities.size,1);});
test('mixed generic restore adopts exact semantic carrier without blocking missing close plugs',()=>{
 const h=harness();R.tickNestVisit(h.d);const live=Object.values(h.state.encounterDirector.live)[0];const saved=plain(R.captureNestVisit(h.d));const original=h.state.entities.get(live.data.nest.carrierId);
 const r=harness();r.state.encounterDirector.nestVisit=saved;const restored=r.add({...plain(original),id:500,data:{...plain(original.data),projectileData:{retained:true}}});
 assert.equal(R.tickNestVisit(r.d).ok,true);const current=Object.values(r.state.encounterDirector.live)[0];assert.equal(current.data.nest.carrierId,500);assert.equal(r.state.entities.get(500),restored);assert.equal(restored.data.projectileData.retained,true);assert.equal(r.state.entities.size,4);
});
test('divergent independently restored cast pose is not overlapped or silently recast',()=>{
 const h=harness();R.tickNestVisit(h.d);const live=Object.values(h.state.encounterDirector.live)[0];const saved=plain(R.captureNestVisit(h.d));const original=h.state.entities.get(live.data.nest.carrierId);const r=harness();r.state.encounterDirector.nestVisit=saved;r.add({...plain(original),id:500,pos:{x:original.pos.x+30,z:original.pos.z}});assert.equal(R.tickNestVisit(r.d).reason,'divergent_saved_actor');assert.equal(r.requests.length,0);
});
test('duplicate semantic restore slots fail closed without deleting either actor',()=>{
 const h=harness();R.tickNestVisit(h.d);const live=Object.values(h.state.encounterDirector.live)[0];const saved=plain(R.captureNestVisit(h.d));const original=h.state.entities.get(live.data.nest.carrierId);const r=harness();r.state.encounterDirector.nestVisit=saved;r.add({...plain(original),id:500});r.add({...plain(original),id:501});assert.equal(R.tickNestVisit(r.d).reason,'ambiguous_saved_actor');assert.equal(r.requests.length,0);assert.equal(r.state.entities.size,3);
});
test('actual director stale-combat cleanup leaves705 physical cast alive',()=>{
 const source=read('src/systems/encounterDirector.js');const start=source.indexOf('  _tickStaleEncounters('),end=source.indexOf('\n  },',start);assert(start>=0&&end>start);const owner=vm.runInNewContext('({'+source.slice(start,end+4)+'})',{STALE_ENCOUNTER_S:180,Math,Object});const h=harness();R.tickNestVisit(h.d);const live=Object.values(h.state.encounterDirector.live)[0];live.deck='combat';live.startedAt=0;const calls=[];owner.aliveCount=()=>1;owner.resolve=(l,o)=>calls.push(o);owner.emit=()=>{};owner._tickStaleEncounters(h.state.encounterDirector,h.state,10000);assert.equal(calls.length,0);assert.equal(live.phase,'conflict');
});
test('serializer projection captures a kill without events, live mutation or rollback side effects',()=>{
 const h=harness();R.tickNestVisit(h.d);const live=Object.values(h.state.encounterDirector.live)[0];const carrier=h.state.entities.get(live.data.nest.carrierId);carrier.alive=false;carrier.hull=0;const before=JSON.stringify(h.state.encounterDirector);const count=h.events.length;
 const projected=R.captureNestVisit(h.d,{settle:false,persist:false});assert.equal(projected.snapshot.carrier.status,'dead');assert.equal(JSON.stringify(h.state.encounterDirector),before);assert.equal(h.events.length,count);assert.equal(live.phase,'conflict');
 const settled=R.captureNestVisit(h.d);assert.equal(settled.status,'terminal');assert.equal(settled.receipt.outcome,'carrier_down');assert.equal(h.events.filter(e=>e.name==='resolved').length,1);
});
test('failed-load rollback pending kill resumes through actual director/runtime once without actors',()=>{
 const source=read('src/systems/encounterDirector.js');const start=source.indexOf('  restoreNestTerminal('),end=source.indexOf('\n  },',start);assert(start>=0&&end>start);
 const terminal=vm.runInNewContext('({'+source.slice(start,end+4)+'})',{normalizeNestVisit:D.normalizeNestVisit,normalizeNestSnapshot:N.normalizeNestSnapshot,settleRestoredNestDeath:N.settleRestoredNestDeath,ensureDirectorState:s=>s.encounterDirector,ENCOUNTERS:{the_nest:{id:'the_nest'}},makeEncounterLiveRecord:(state,item,shape,now)=>({id:item.encounterId,shapeId:shape.id,shape,sectorId:item.sectorId,anchor:item.zoneCenter,data:item.data,ids:[],roles:{},phase:'telegraph'})}).restoreNestTerminal;
 const h=harness();R.tickNestVisit(h.d);const live=Object.values(h.state.encounterDirector.live)[0];const carrier=h.state.entities.get(live.data.nest.carrierId);carrier.alive=false;carrier.hull=0;
 const saved=plain(R.captureNestVisit(h.d,{settle:false,persist:false}));assert.equal(saved.snapshot.pendingCarrierOutcome,'carrier_down');const r=harness();r.state.encounterDirector.nestVisit=saved;r.d.restoreNestTerminal=terminal;r.player.alive=false;
 assert.equal(R.tickNestVisit(r.d).ok,true);assert.equal(r.requests.length,0);assert.equal(r.state.entities.size,1);assert.equal(r.player.alive,false);assert.equal(D.nestOutcomeReceipt(r.state).outcome,'carrier_down');assert.equal(r.events.filter(e=>e.name==='resolved').length,1);R.tickNestVisit(r.d);assert.equal(r.events.filter(e=>e.name==='resolved').length,1);
});
test('actual harass-mercy owner cannot generic-escape the finite Nest cast',()=>{
 const source=read('src/systems/encounterDirector.js');const start=source.indexOf('  _applyHarassMercy('),end=source.indexOf('\n  },',start);const owner=vm.runInNewContext('({'+source.slice(start,end+4)+'})',{Object});const h=harness();R.tickNestVisit(h.d);const live=Object.values(h.state.encounterDirector.live)[0];const carrier=h.state.entities.get(live.data.nest.carrierId);let called=false;owner.resolve=()=>called=true;owner._applyHarassMercy(h.state.encounterDirector,h.state,carrier,{},10000);assert.equal(called,false);assert.equal(live.phase,'conflict');
});
test('authored compact and adopted standard broods preserve their physical variant through route Continue',()=>{
 for(const authored of [true,false]){
  const h=harness();if(authored)R.tickNestVisit(h.d);else h.d.requestAuthoredEncounter({shapeId:'the_nest',encounterId:'random-charon-705',sectorId:D.NEST_VISIT.sectorId,anchor:D.nestPosition(),data:{}});
  const live=Object.values(h.state.encounterDirector.live)[0];h.state.simTime+=5;N.runtime.tick(h.d,live,h.state,h.state.simTime);
  const saved=plain(R.captureNestVisit(h.d)),wasp=h.state.entities.get(live.data.nest.waspIds[0]);assert.equal(wasp.radius,authored?9:12);assert.equal(wasp.mass,16);assert.equal(saved.snapshot.broodVariant,authored?'nursery_compact_v1':'standard');assert.match(D.nestWaypoint(h.state).reason,authored?/bare Line/:/current Line rating T1/);
  const r=harness();r.state.encounterDirector.nestVisit=saved;assert.equal(R.tickNestVisit(r.d).ok,true);const restored=Object.values(r.state.encounterDirector.live)[0],body=r.state.entities.get(restored.data.nest.waspIds[0]);assert.equal(body.radius,authored?9:12);assert.equal(body.mass,16);assert.equal(r.requests[0].data.authoredNestVisit,true);assert.equal(restored.data.nest.broodVariant,saved.snapshot.broodVariant);
 }
});
console.log(JSON.stringify({passed,sources:inventory,qualification:'Production route/runtime with explicit actor admission ports and actual pure geometry readers. No native physics, rendering or full director graph acceptance.'},null,2));
