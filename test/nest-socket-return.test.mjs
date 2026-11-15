// Actual705 runtime with explicit admission/combat ports, not a native flight test.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as N from '../src/data/encounters/705-the-nest.js';
function harness(snapshot) {
 let seq=0;
 const state={entities:new Map(),simTime:0,playerId:'player',story:{flags:{}}};
 const player={id:'player',alive:true,pos:{x:0,z:650},vel:{x:0,z:0},type:'ship',data:{}};
 state.entities.set(player.id,player);
 const events=[]; const controls={denyShips:false,denyDoorAt:-1,denyDamage:false}; let doorCount=0;
 const live={id:'nest-test',shapeId:'the_nest',sectorId:'charon',squadId:'nest-test',ids:[],roles:{},
  plan:{zoneCenter:{x:0,z:0}},shape:N.default,data:snapshot?{nestSnapshot:snapshot}:{},phase:'pending'};
 function entity(spec){ let id; do{id=`npc:${++seq}`;}while(state.entities.has(id)); const e={id,type:spec.type||'ship',alive:true,pos:{...spec.pos},vel:{...(spec.vel||{x:0,z:0})},rot:spec.rot||0,angVel:spec.angVel||0,
  radius:spec.radius||12,mass:spec.mass||16,hull:spec.hull||55,hullMax:spec.hull||55,shield:0,shieldMax:0,data:{ai:{},...(spec.data||{})}}; state.entities.set(id,e);return e; }
 const d={state,adoptNestActor:(lv,e,role)=>{if(!lv.ids.includes(e.id))lv.ids.push(e.id);lv.roles[e.id]=role;return true;},releaseNestActor:(lv,e)=>{lv.ids=lv.ids.filter(id=>id!==e.id);delete lv.roles[e.id];},helpers:{removeEntity:id=>state.entities.delete(id)},now:()=>state.simTime,player:()=>player,
  spawnShips:(lv,specs)=>controls.denyShips?[]:specs.map(s=>{const carrier=s.role==='squad'; const recipe={pos:s.pos,radius:carrier?30:12,mass:carrier?520:16,hull:carrier?460:55,hullMax:carrier?460:55,shieldMax:0,armorMax:0,capMax:0};N.applyNestBroodSpawnSpec(recipe,lv,s.nestActorSlot);N.applyNestSavedSpawnSpec(recipe,s.nestSavedActor);const e=entity(recipe);e.hullMax=recipe.hullMax;e.data.spawnArchetype=s.archetype;lv.ids.push(e.id);lv.roles[e.id]=s.role;return e.id;}),
  spawnProp:(lv,o)=>doorCount++===controls.denyDoorAt?null:entity(N.applyNestSavedSpawnSpec({...o,type:'beacon',hull:1,hullMax:1},o.nestSavedActor)),
  say:(...args)=>events.push({name:'say',args}),
  emit:(name,payload)=>{events.push({name,payload});if(name==='projectile:hit'&&!controls.denyDamage){ const e=state.entities.get(payload.targetId); if(e&&e.alive){e.hull=0;e.alive=false;N.runtime.event(d,live,state,'squadKill',{id:e.id});}}},
  resolve:(lv,outcome)=>{lv.outcome=outcome;lv.phase='done';},abort:(lv,reason)=>{lv.outcome=`aborted:${reason}`;lv.phase='done';}};
 const h={state,player,events,controls,live,d,entity};
 h.fire=()=>N.runtime.fire(d,live,state);
 h.tick=(dt=0.1)=>{state.simTime+=dt;N.runtime.tick(d,live,state,state.simTime);};
 h.carrier=()=>state.entities.get(live.data.nest.carrierId);
 h.door=i=>state.entities.get(live.data.nest.doorIds[i]);
 h.wasp=i=>state.entities.get(live.data.nest.waspIds[i]);
 h.contact=e=>{const c=h.carrier(),door=h.door(0),a=c.rot||0,hit=door&&!door.data.torn?door:c;N.runtime.event(d,live,state,'physicsImpact',{aId:hit.id,bId:e.id,impulse:100,tick:state.tick||0,pos:hit===c?{x:c.pos.x+Math.sin(a)*8.25,z:c.pos.z-Math.cos(a)*8.25}:{...hit.pos}});};
 h.mark=e=>N.runtime.event(d,live,state,'tetherAttached',{actorId:'player',targetId:e.id});
 return h;
}
function launched(n=3){const h=harness();h.fire();for(let i=0;i<n;i++)h.tick(5);return h;}
function returnWasp(h,i){const e=h.wasp(i);h.mark(e);e.pos={x:h.carrier().pos.x,z:h.carrier().pos.z-20};h.contact(e);h.tick(.1);}


import { nestWaypoint } from '../src/data/nestVisit.js';
function compact(snapshot) {
 const h=harness(snapshot);h.live.id='campaign47a:charon:nest:v1';h.live.sectorId='sector_charon_expanse';h.live.data.authoredNestVisit=true;h.fire();return h;
}
function full(h) { for(let i=0;i<6;i++)h.tick(5);h.tick(3);return h; }
function route(h) {
 h.state.encounterDirector={live:{[h.live.id]:h.live},nestVisit:{version:1,status:'active',encounterId:h.live.id,sectorId:h.live.sectorId,anchor:{x:0,z:0},snapshot:N.captureNestRuntime(h.state,h.live,h.state.simTime)}};
 return nestWaypoint(h.state);
}

test('a distant unlatched baffle cannot remotely breach or tear its carrier',()=>{
 const h=full(compact()),door=h.door(1),w=h.wasp(0);door.pos.x+=550;h.mark(w);w.pos={...door.pos};
 N.runtime.event(h.d,h.live,h.state,'physicsImpact',{aId:door.id,bId:w.id,impulse:100,tick:0,pos:{...door.pos}});h.tick();
 assert.equal(h.live.data.nest.returnHits,0);assert.equal(w.alive,true);assert.equal(door.data.nestDetached,true);assert.equal(h.live.data.nest.tornDoors,0);assert.equal(h.live.outcome,undefined);assert.match(door.data.scanLabel,/SCRAP/);assert.equal(h.events.filter(e=>e.name==='projectile:hit').length,0);
 h.mark(door);h.tick();assert.equal(h.live.data.nest.tornDoors,0);assert.equal(door.data.nestTearEligible,undefined);
});
test('physical separation exposes its actual flank without a vent, player tear or encounter completion',()=>{
 const h=compact();h.door(0).pos.x+=25;h.door(1).pos.x+=130;h.tick();assert.equal(h.live.data.nest.tornDoors,0);assert.equal(h.live.data.nest.remaining,6);assert.equal(h.live.data.nest.launched,0);assert.deepEqual(h.carrier().data.nestBayStates,[true,true]);assert.deepEqual(h.carrier().data.nestBayOffsets,[{dx:0,dz:-8.25},{dx:0,dz:8.25}]);
 full(h);assert.equal(h.live.phase,'conflict');assert.equal(h.live.data.nest.returnHits,0);assert.equal(h.live.data.nest.tornDoors,0);assert.equal(h.events.filter(e=>e.payload?.text?.startsWith('BAFFLE DISPLACED')).length,2);
});
test('socket boundary is rotation-aware and rejects remote contact before a scheduled tick',()=>{
 for(const offset of [23.99,24,24.01]){const h=full(compact()),c=h.carrier(),d=h.door(0),w=h.wasp(0);c.rot=Math.PI/2;d.pos={x:24,z:offset};w.pos={...d.pos};h.mark(w);N.runtime.event(h.d,h.live,h.state,'physicsImpact',{aId:d.id,bId:w.id,impulse:100,tick:0,pos:{...d.pos}});h.tick();assert.equal(h.live.data.nest.returnHits,offset<24?1:0);}
});
test('late scrap contact never counts, actual exposed carrier flank does once',()=>{
 const h=full(compact()),d=h.door(1),w=h.wasp(0);d.pos.x+=130;h.tick();h.mark(w);w.pos={...d.pos};N.runtime.event(h.d,h.live,h.state,'physicsImpact',{aId:d.id,bId:w.id,impulse:100,tick:0,pos:{...d.pos}});h.tick();assert.equal(h.live.data.nest.returnHits,0);
 const c=h.carrier();w.pos={x:c.pos.x,z:c.pos.z+8.25};const payload={aId:c.id,bId:w.id,impulse:100,tick:0,pos:{...w.pos}};N.runtime.event(h.d,h.live,h.state,'physicsImpact',payload);h.tick();assert.equal(h.live.data.nest.returnHits,1);N.runtime.event(h.d,h.live,h.state,'physicsImpact',payload);h.tick();assert.equal(h.live.data.nest.returnHits,1);
});
test('seated player pull retains authored 120-WU tear and finite vent after physical detachment',()=>{
 const h=compact(),d=h.door(0);h.mark(d);d.pos.x+=30;h.tick();assert.equal(d.data.nestDetached,true);assert.equal(h.live.data.nest.tornDoors,0);assert.equal(h.live.data.nest.remaining,6);
 d.pos.x+=91;h.tick();assert.equal(h.live.data.nest.tornDoors,1);assert.equal(h.live.data.nest.remaining,0);assert.equal(h.live.data.nest.launched,6);h.tick();assert.equal(h.live.data.nest.tornDoors,1);
});
test('save before separation reconciliation preserves physical truth but cannot manufacture tear attribution',()=>{
 for(const offset of [23.99,24,119.99,550]){const h=full(compact());h.door(1).pos.x+=offset;const raw=N.captureNestRuntime(h.state,h.live,h.state.simTime);assert.equal(raw.doors[1].detached,offset>=24);assert.equal(raw.tornDoors,0);const g=compact(raw);g.tick();assert.equal(g.live.data.nest.tornDoors,0);assert.equal(g.live.data.nest.returnHits,0);assert.equal(g.live.data.nest.remaining,0);assert.equal(g.live.phase,'conflict');}
});
test('legacy displaced saves get no retroactive tear credit even with historical latch flags',()=>{
 const h=full(compact());const raw=N.captureNestRuntime(h.state,h.live,h.state.simTime);raw.doors[0].pos.x+=550;delete raw.doors[0].detached;delete raw.doors[0].tearEligible;raw.doors[0].latched=true;const g=compact(raw);g.tick();assert.equal(g.door(0).data.nestDetached,true);assert.equal(g.live.data.nest.tornDoors,0);assert.equal(g.live.outcome,undefined);
});
test('a valid contact stays earned if the impact subsequently displaces the assembly before consumption',()=>{
 const h=full(compact()),d=h.door(0),w=h.wasp(0);h.mark(w);w.pos={...d.pos};h.contact(w);d.pos.x+=121;const raw=N.captureNestRuntime(h.state,h.live,h.state.simTime);const g=compact(raw);g.tick();assert.equal(g.live.data.nest.returnHits,1);assert.equal(g.live.data.nest.tornDoors,0);
});
test('Continue keeps proven exposure geometry and drops legacy, remote or ineligible pending attempts',()=>{
 const h=full(compact()),w=h.wasp(0);h.mark(w);w.pos={...h.door(0).pos};h.contact(w);const raw=N.captureNestRuntime(h.state,h.live,h.state.simTime);assert.equal(raw.returnContacts.length,1);const valid=compact(raw);valid.tick();assert.equal(valid.live.data.nest.returnHits,1);
 for(const mode of ['legacy','remote','closed','detached','malformed']){const altered=structuredClone(raw),surface=altered.returnContacts[0].surface;if(mode==='legacy')delete altered.returnContacts[0].surface;else if(mode==='remote')surface.targetPos.x+=550;else if(mode==='closed')surface.open=false;else if(mode==='detached')surface.detached=true;else surface.carrierRot=null;const g=compact(altered);g.tick();assert.equal(g.live.data.nest.returnHits,0);assert.equal(g.wasp(0).alive,true);}
});
test('detached scrap remains nonreturning after drifting back and through Continue',()=>{
 const h=full(compact()),d=h.door(1),old={...d.pos};d.pos.x+=30;h.tick();d.pos=old;const g=compact(N.captureNestRuntime(h.state,h.live,h.state.simTime)),w=g.wasp(0),door=g.door(1);g.mark(w);w.pos={...door.pos};N.runtime.event(g.d,g.live,g.state,'physicsImpact',{aId:door.id,bId:w.id,impulse:100,tick:0,pos:{...door.pos}});g.tick();assert.equal(g.live.data.nest.returnHits,0);assert.equal(g.live.data.nest.tornDoors,0);assert.equal(door.data.nestDetached,true);
});
test('Journal reports return progress and insufficient finite ammunition without granting outcomes',()=>{
 const h=full(compact());returnWasp(h,0);for(let i=1;i<5;i++){const w=h.wasp(i);w.alive=false;N.runtime.event(h.d,h.live,h.state,'squadKill',{id:w.id});}const read=route(h);assert.match(read.reason,/Coupling breaches: 1\/3/);assert.match(read.reason,/1 launched Wasp remains alive/);assert.match(read.reason,/Too few remain/);assert.match(read.reason,/Detached baffles are scrap/);assert.equal(h.live.outcome,undefined);delete h.state.encounterDirector.live[h.live.id];assert.match(nestWaypoint(h.state).reason,/Coupling breaches: 1\/3/);
});

test('saved carrier receipts require matching bounded carrier positions',()=>{
 const h=full(compact());h.door(1).pos.x+=50;h.tick();const c=h.carrier(),w=h.wasp(0);h.mark(w);w.pos={x:c.pos.x,z:c.pos.z+8.25};N.runtime.event(h.d,h.live,h.state,'physicsImpact',{aId:c.id,bId:w.id,impulse:100,tick:0,pos:{...w.pos}});const raw=N.captureNestRuntime(h.state,h.live,h.state.simTime);assert.equal(raw.returnContacts.length,1);
 raw.returnContacts[0].surface.carrierPos.extra='discard';raw.returnContacts[0].surface.targetPos.extra='discard';const clean=N.normalizeNestSnapshot(raw);assert.deepEqual(Object.keys(clean.returnContacts[0].surface.carrierPos),['x','z']);assert.deepEqual(Object.keys(clean.returnContacts[0].surface.targetPos),['x','z']);
 raw.returnContacts[0].surface.targetPos.x+=1;assert.equal(N.normalizeNestSnapshot(raw).returnContacts.length,0);
});
test('unspent Journal distinguishes a permanently exposed actual flank from cycling assemblies',()=>{
 const h=compact();h.door(1).pos.x+=50;h.tick();assert.match(route(h).reason,/carrier flank EXPOSED/);assert.equal(h.live.data.nest.remaining,6);assert.equal(h.live.data.nest.tornDoors,0);
});
