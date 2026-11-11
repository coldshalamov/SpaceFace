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
test('six real compact launches keep both intact coupling targets exposed, without a win or refill',()=>{
 const h=full(compact());assert.equal(h.live.data.nest.launched,6);assert.equal(h.live.data.nest.remaining,0);
 assert.deepEqual(h.carrier().data.nestBayStates,[true,true]);assert.equal(h.carrier().data.nestNurserySpent,true);
 assert.equal(h.door(0).data.torn,undefined);assert.equal(h.door(1).data.torn,undefined);assert.match(h.carrier().data.scanLabel,/NURSERY SPENT/);
 const count=h.state.entities.size;h.tick(200);assert.equal(h.state.entities.size,count);assert.equal(h.live.phase,'conflict');assert.equal(h.live.data.nest.returnHits,0);assert.equal(h.state.trophyWall,undefined);
 assert.equal(h.events.filter(e=>e.name==='nest:waspsLaunched').length,6);assert.equal(h.events.filter(e=>e.payload?.text?.startsWith('Six launched.')).length,1);
});
test('first five compact launch windows still close and only actual final admission exposes spent nursery',()=>{
 const h=compact();for(let i=0;i<5;i++){h.tick(5);h.tick(2.1);assert.deepEqual(h.carrier().data.nestBayStates,[false,false]);assert.equal(h.carrier().data.nestNurserySpent,false);}
 assert.equal(h.live.data.nest.remaining,1);h.controls.denyShips=true;h.tick(5);assert.equal(h.live.data.nest.remaining,1);assert.deepEqual(h.carrier().data.nestBayStates,[false,false]);
 h.controls.denyShips=false;h.tick(5);h.tick(3);assert.deepEqual(h.carrier().data.nestBayStates,[true,true]);
});
test('empty standard and legacy casts retain closed windows and prior handling rules',()=>{
 const h=harness();h.fire();full(h);assert.equal(h.live.data.nest.remaining,0);assert.deepEqual(h.carrier().data.nestBayStates,[false,false]);assert.equal(h.carrier().data.nestNurserySpent,false);
 const saved=N.captureNestRuntime(h.state,h.live,h.state.simTime);delete saved.broodVariant;const g=harness(saved);g.fire();assert.deepEqual(g.carrier().data.nestBayStates,[false,false]);
});
test('spent compact coupling still requires real contact, player provenance and accepted combat death',()=>{
 const h=full(compact()),w=h.wasp(0);h.mark(w);w.pos={...h.door(0).pos};h.tick();assert.equal(h.live.data.nest.returnHits,0);
 h.controls.denyDamage=true;h.contact(w);h.tick();assert.equal(h.live.data.nest.returnHits,0);assert.equal(w.alive,true);
 h.controls.denyDamage=false;h.contact(w);h.tick();assert.equal(h.live.data.nest.returnHits,1);assert.equal(w.alive,false);
 h.contact(w);h.tick();assert.equal(h.live.data.nest.returnHits,1);
 const foreign=h.wasp(1);h.contact(foreign);h.tick();assert.equal(h.live.data.nest.returnHits,1);assert.equal(foreign.alive,true);
});
test('three distinct physical returns after the last window retain the canonical gutted outcome',()=>{
 const h=full(compact());for(let i=0;i<3;i++)returnWasp(h,i);assert.equal(h.live.outcome,'carrier_gutted');assert.equal(h.live.data.nest.returnHits,3);assert.match(h.state.trophyWall.plates[0].label,/GUTTED/);assert.equal(h.events.filter(e=>e.name==='projectile:hit').length,4);
});
test('same spent cast restores without a timer extension, extra brood or repeated final-launch cue',()=>{
 const h=full(compact());returnWasp(h,0);const saved=N.captureNestRuntime(h.state,h.live,h.state.simTime);assert.equal(saved.bayOpenIn,0);assert.equal(saved.returnHits,1);
 const g=compact(saved);assert.equal(g.live.data.nest.remaining,0);assert.equal(g.live.data.nest.returnHits,1);assert.deepEqual(g.carrier().data.nestBayStates,[true,true]);assert.equal(g.wasp(0),undefined);assert.equal(g.live.data.nest.waspIds.filter(Boolean).length,5);
 assert.equal(g.events.filter(e=>e.name==='nest:waspsLaunched').length,0);assert.equal(g.events.filter(e=>e.payload?.text?.startsWith('Six launched.')).length,0);
 g.tick(20);assert.equal(g.live.data.nest.launched,6);assert.equal(g.live.phase,'conflict');assert.match(g.events.find(e=>e.name==='say').args[2],/All six have launched/);
});
test('partial compact Continue retains guarded cadence until last admission',()=>{
 const h=compact();h.tick(5);h.tick(3);const g=compact(N.captureNestRuntime(h.state,h.live,h.state.simTime));assert.equal(g.live.data.nest.remaining,5);assert.deepEqual(g.carrier().data.nestBayStates,[false,false]);assert.equal(g.carrier().data.nestNurserySpent,false);
});
test('capacity and clearance refusals retain real brood and issue one deferred notice until a launch succeeds',()=>{
 for(const reason of ['capacity','clearance']){const h=compact();if(reason==='capacity')h.controls.denyShips=true;else h.d.canSpawnNestActor=()=>false;
 h.tick(5);h.tick(5);assert.equal(h.live.data.nest.remaining,6);assert.equal(h.live.data.nest.launched,0);assert.deepEqual(h.carrier().data.nestBayStates,[false,false]);assert.equal(h.events.filter(e=>e.payload?.text?.startsWith('Launch deferred.')).length,1);assert.match(route(h).reason,/Launch deferred/);
 h.controls.denyShips=false;h.d.canSpawnNestActor=()=>true;h.tick(5);assert.equal(h.live.data.nest.launched,1);assert.equal(h.live.data.nest.launchDeferred,false);assert.doesNotMatch(route(h).reason,/Launch deferred/);
 }
});
test('Journal distinguishes spent nursery from active cycling and keeps real-impact, gun and escape options',()=>{
 const h=full(compact()),read=route(h);assert.match(read.label,/spent nursery/);assert.match(read.reason,/All six.*actually launched/);assert.match(read.reason,/Real contact is required/);assert.match(read.reason,/guns or withdrawing alive/);assert.equal(read.targetEntityId,null);
 delete h.state.encounterDirector.live[h.live.id];assert.match(nestWaypoint(h.state).label,/spent nursery/);
});
test('waiting spent brood is neither empty-nest victory nor destroyed carrier',()=>{
 const h=full(compact());h.tick(500);assert.equal(h.live.outcome,undefined);assert.equal(h.carrier().alive,true);assert.equal(h.live.data.nest.tornDoors,0);assert.equal(h.state.trophyWall,undefined);
 h.player.pos.x=3101;h.tick();assert.equal(h.live.outcome,'carrier_escapes');assert.equal(h.state.trophyWall,undefined);
});
test('ordinary carrier death is recorded as destroyed rather than a fabricated gutted return',()=>{
 const h=compact();h.carrier().alive=false;h.tick();assert.equal(h.live.outcome,'carrier_down');assert.match(h.state.trophyWall.plates[0].label,/DESTROYED/);assert.doesNotMatch(h.state.trophyWall.plates[0].label,/GUTTED/);
});

test('standard random deferral and restore never claim Charon or an eastern lane',()=>{
 const h=harness();h.fire();h.controls.denyShips=true;h.tick(5);assert.equal(h.events.some(e=>e.payload?.from==='CHARON LANE WATCH'),false);assert.equal(h.live.data.nest.launchDeferred,undefined);
 const saved=N.captureNestRuntime(h.state,h.live,h.state.simTime),g=harness(saved);g.fire();assert.doesNotMatch(g.events.find(e=>e.name==='say').args[2],/CHARON|eastern/);
});
test('partial vent leaves the torn flank exposed while unadmitted brood stays aboard',()=>{
 const h=compact();h.mark(h.door(0));h.door(0).pos.x+=130;h.controls.denyShips=true;h.tick();assert.equal(h.live.data.nest.remaining,6);assert.equal(h.carrier().data.nestNurserySpent,false);assert.deepEqual(h.carrier().data.nestBayStates,[true,false]);assert.match(h.events.find(e=>e.payload?.text?.startsWith('Launch deferred.')).payload.text,/torn flank remains exposed/);
});
test('late real contact also credits the second intact assembly and a genuinely torn flank',()=>{
 for(const torn of [false,true]){const h=full(compact()),w=h.wasp(0);h.mark(w);let target=h.door(1),pos={...target.pos};
 if(torn){h.mark(target);target.pos.x+=130;h.tick();target=h.carrier();pos={x:target.pos.x,z:target.pos.z+8.25};}
 w.pos={...pos};N.runtime.event(h.d,h.live,h.state,'physicsImpact',{aId:target.id,bId:w.id,impulse:100,tick:0,pos});h.tick();assert.equal(h.live.data.nest.returnHits,1);
 }
});
test('spent Continue with insufficient surviving ammunition keeps gun and escape options without refills',()=>{
 const h=full(compact());for(let i=0;i<5;i++){const w=h.wasp(i);w.alive=false;N.runtime.event(h.d,h.live,h.state,'squadKill',{id:w.id});}
 const g=compact(N.captureNestRuntime(h.state,h.live,h.state.simTime));assert.equal(g.live.data.nest.waspIds.filter(Boolean).length,1);assert.equal(g.live.data.nest.returnHits,0);assert.equal(g.live.data.nest.remaining,0);assert.deepEqual(g.carrier().data.nestBayStates,[true,true]);assert.match(route(g).reason,/guns or withdrawing alive/);g.tick(100);assert.equal(g.live.data.nest.waspIds.filter(Boolean).length,1);
});
