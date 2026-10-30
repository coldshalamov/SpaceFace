import test from 'node:test';
import assert from 'node:assert/strict';
import {createLayout,inCradle} from '../src/features/nacre-sluice/layout.mjs';
import {createRecord,restoreRecord,stepRecord,machinery,commandRecord} from '../src/features/nacre-sluice/model.mjs';
import {createAdapter} from '../src/features/nacre-sluice/adapter.mjs';
import {presentationData} from '../src/features/nacre-sluice/presentation.mjs';
const body=(x,z,radius=9)=>({pos:{x,z},vel:{x:0,z:0},radius,hull:600,alive:true});
function fixture() {
  const state={simTime:0,tick:0,mode:'flight',timeScale:1,run:{kind:'adventure'},world:{currentSectorId:'test'},rng:()=>.42,entities:new Map(),playerId:1};
  let next=2;const impulses=[],removals=[],lines=[];
  const player={id:1,occupantGeneration:1,...body(-172,0),mass:16,type:'ship'};state.entities.set(1,player);
  const helpers={spawnEntity(s){const e={...s,id:next++,occupantGeneration:1,alive:true};state.entities.set(e.id,e);return e;},
    removeEntity(id){removals.push(id);state.entities.delete(id);},
    queryRadius(p,r){return [...state.entities.values()].filter(e=>Math.hypot(e.pos.x-p.x,e.pos.z-p.z)<=r);}};
  const ports={impulse(e,j,evidence){impulses.push({e,j,evidence});return true;},torque(){},nativeReady:()=>true,refresh(){},
    attachments:()=>({listForEntity:id=>lines.filter(l=>l.ownerId===id||l.targetId===id),cut(id){const i=lines.findIndex(l=>l.id===id);if(i>=0)lines.splice(i,1);}})};
  const a=createAdapter({state,helpers},ports);const entry=a.enter({origin:{x:0,z:0},sectorId:'test'});
  const admit=()=>{for(const b of a.view().bodies)a.admit({...b,epoch:a.view().epoch});};
  const command=(action,sequence)=>a.command({epoch:a.view().epoch,actorId:1,actorGeneration:1,action,sequence});
  const tick=(n=1)=>{for(let i=0;i<n;i++){state.simTime+=1/60;state.tick++;a.step();}};
  const get=role=>state.entities.get(a.bodyHandle(role)?.id);
  return {a,state,player,impulses,removals,lines,entry,admit,command,tick,get};
}
test('source layout deterministic; bypass clear for the radius-nine core',()=>{
  const l=createLayout(77);assert.deepEqual(l,createLayout(77));assert.equal(l.bodies.length,20);
  // Check a genuine continuous northern polyline against all fixed circular banks.
  const points=[[-112,0],[-172,0],[-172,165],[172,165],[172,0]];
  for(let i=1;i<points.length;i++)for(let t=0;t<=1;t+=.005){const x=points[i-1][0]*(1-t)+points[i][0]*t,z=points[i-1][1]*(1-t)+points[i][1]*t;
    for(const b of l.bodies.filter(b=>b.fixed))assert.ok(Math.hypot(x-b.x,z-b.z)>b.radius+9,`${b.id} blocks bypass`);}
});
test('quiet, telegraph, jet, purge and irreversible physical relief',()=>{
  const r=createRecord();r.accepted=true;const b={plug:body(-18,-28,7)};
  for(let i=0;i<8*60+1;i++)stepRecord(r,1/60,b);assert.equal(machinery(r).stage,'charging');
  for(let i=0;i<4*60;i++)stepRecord(r,1/60,b);assert.equal(machinery(r).stage,'jet');assert.ok(r.pressure>.99);
  b.plug.pos.x+=24;stepRecord(r,1/60,b);assert.equal(machinery(r).stage,'vented');
  b.plug.pos.x-=24;stepRecord(r,1/60,b);assert.equal(r.vented,true);
});
test('cradle uses full body clearance, speed, dwell and reset after a mistake',()=>{
  const r=createRecord();r.accepted=true;const b={core:body(190,0)};
  assert.equal(inCradle(b.core,createLayout().receiver),false);
  b.core.pos.x=172;for(let i=0;i<60;i++)stepRecord(r,1/60,b);assert.equal(r.coreDelivered,false);
  b.core.vel.x=5;stepRecord(r,1/60,b);assert.equal(r.coreDwell,0);b.core.vel.x=0;
  const out=[];for(let i=0;i<121;i++)out.push(...stepRecord(r,1/60,b));assert.equal(r.coreDelivered,true);assert.equal(out.length,1);
  assert.deepEqual(stepRecord(r,1/60,b),[]);
});
test('mid-cycle save restores exact phase and future deterministic outcome',()=>{
  const r=createRecord(8);r.accepted=true;for(let i=0;i<833;i++)stepRecord(r,1/60,{});
  const restored=restoreRecord(JSON.parse(JSON.stringify(r)));assert.deepEqual(machinery(restored),machinery(r));
  for(let i=0;i<601;i++){stepRecord(r,1/60,{});stepRecord(restored,1/60,{});}assert.deepEqual(restored,r);
  assert.throws(()=>restoreRecord({...r,version:2}));assert.throws(()=>restoreRecord({...r,rows:{core:{x:NaN}}}));
});
test('admission and commands reject stale epochs, recycled actors and duplicate sequences',()=>{
  const f=fixture();assert.equal(f.entry.ok,true);assert.equal(f.command('accept',1).ok,false);f.admit();
  assert.equal(f.command('accept',1).ok,true);assert.equal(f.command('accept',1).ok,false);
  f.player.pos={x:-145,z:-29};assert.equal(f.command('purge',2).ok,true);assert.equal(f.command('purge',3).ok,false);
  assert.equal(f.a.command({epoch:f.a.view().epoch-1,sequence:9}).ok,false);
  assert.equal(f.a.admit({...f.a.view().bodies[0],epoch:999}).valueOf(),false);
});
test('destroyed control leaves physical relief and delivery possible',()=>{
  const f=fixture();f.admit();f.command('accept',1);f.get('control').hull=0;f.tick();
  f.player.pos={x:-145,z:-29};assert.equal(f.command('purge',2).reason,'control_destroyed_use_relief');
  f.get('plug').pos.x+=30;f.tick();assert.equal(f.a.view().stage,'vented');
  f.get('core').pos={x:172,z:0};f.tick(121);assert.equal(f.a.view().coreDelivered,true);
});
test('physics ownership, impulse attribution and duplicate step defense',()=>{
  const f=fixture();f.admit();f.command('accept',1);const before=structuredClone(f.get('baffle_w').pos);
  f.tick();assert.deepEqual(f.get('baffle_w').pos,before);assert.equal(f.impulses.length,3);
  f.a.step();assert.equal(f.impulses.length,3);assert.ok(f.impulses.every(x=>x.evidence.source==='nacreSluice' && x.evidence.tick===1));
  f.player.pos={x:-72,z:0};f.tick(750);const jets=f.impulses.filter(x=>x.evidence.reason.startsWith('pressure_'));assert.ok(jets.length>0);
  assert.ok(jets.every(x=>Math.hypot(x.j.x,x.j.z)<=x.e.mass*10/60+.0001));
});
test('loss, save, re-entry and retirement never resurrect or remove a pooled stranger',()=>{
  const f=fixture();f.admit();f.command('accept',1);const e=f.get('core');
  f.state.entities.set(e.id,{...e,occupantGeneration:2,data:{}});f.tick();const saved=f.a.serialize();assert.equal(saved.rows.core.dead,true);
  f.a.leave();assert.ok(f.state.entities.has(e.id));f.a.enter({origin:{x:0,z:0},sectorId:'test',save:saved});f.admit();assert.equal(f.a.bodyHandle('core'),null);
});
test('player line blocks automatic unload; forced teardown cuts only bound originals',()=>{
  const f=fixture();f.admit();const core=f.get('core');f.lines.push({id:8,ownerId:1,targetId:core.id,state:'active'});
  assert.equal(f.a.leave().reason,'player_line_active');assert.equal(f.a.leave({force:true}).ok,true);assert.equal(f.lines.length,0);assert.equal(f.state.entities.size,1);
  f.a.dispose();f.a.dispose();assert.equal(f.a.enter({}).reason,'disposed');
});
test('completion and salvage are separate stable receipts; re-entry cannot replay delivery',()=>{
  const f=fixture();f.admit();f.command('accept',1);f.get('core').pos={x:172,z:0};f.tick(121);
  assert.equal(f.a.settlement().acknowledged,false);const key=f.a.settlement().key;
  assert.equal(f.a.acknowledge('bad'),false);assert.equal(f.a.acknowledge(key),true);
  f.get('salvage').pos={x:172,z:0};f.tick(121);const save=f.a.serialize();f.a.leave();
  f.a.enter({origin:{x:0,z:0},sectorId:'test',save});assert.equal(f.a.bodyHandle('core'),null);assert.equal(f.a.bodyHandle('salvage'),null);
  assert.equal(f.a.settlement().acknowledged,true);assert.equal(f.a.settlement().salvage,true);
});
test('invalid restore preserves current originals; pause and absence consume no cycle',()=>{
  const f=fixture();f.admit();f.command('accept',1);f.tick(60);const save=f.a.serialize();
  assert.throws(()=>f.a.deserialize({version:99}));assert.ok(f.get('core'));
  f.state.timeScale=0;f.tick(180);assert.equal(f.a.serialize().elapsed,save.elapsed);
  f.a.leave();f.state.simTime+=400;f.a.enter({origin:{x:0,z:0},sectorId:'test'});f.admit();f.state.timeScale=1;f.tick();
  assert.ok(f.a.serialize().elapsed-save.elapsed<.02);
});
test('presentation preserves instructions without relying on motion or color',()=>{
  const f=fixture(),v=f.a.view(),p=presentationData(v,{reducedMotion:true});
  assert.match(p.text,/4 m\/s/);assert.ok(p.markers.filter(m=>m.kind==='jet').every(m=>!m.animated));assert.equal(p.signs.length,5);
});
test('purge does not instantly open a pressurized gate; quiet window pays the pressure debt',()=>{
  const r=createRecord();r.accepted=true;r.pressure=1;r.elapsed=14;
  const request={sequence:1,epoch:1,action:'purge'};
  assert.equal(commandRecord(r,request,body(-145,-29),{control:body(-145,-29)}).ok,true);
  assert.equal(machinery(r).targets.gate.z,0);
  for(let i=0;i<101;i++)stepRecord(r,1/60,{});
  assert.equal(machinery(r).targets.gate.z,48);assert.ok(r.purge>10);
});
test('destroying the original core is final while optional salvage remains playable',()=>{
  const f=fixture();f.admit();f.command('accept',1);f.get('core').hull=0;f.tick();
  assert.equal(f.a.view().phase,'lost');f.get('salvage').pos={x:172,z:0};f.tick(121);
  assert.equal(f.a.view().salvageDelivered,true);assert.equal(f.a.settlement(),null);
});
test('re-entry preserves original measured drift and rejects outgoing visual callbacks',()=>{
  const f=fixture();f.admit();f.command('accept',1);const old=f.a.view().bodies[0],epoch=f.a.view().epoch;
  f.get('core').pos={x:-88,z:100};f.get('core').vel={x:3,z:-2};f.get('core').angVel=.7;
  f.a.leave();f.a.enter({origin:{x:0,z:0},sectorId:'test'});
  assert.equal(f.a.admit({...old,epoch}),false);assert.deepEqual(f.get('core').pos,{x:-88,z:100});
  assert.deepEqual(f.get('core').vel,{x:3,z:-2});assert.equal(f.get('core').angVel,.7);
});
test('translated world address keeps mission geometry site-local',()=>{
  const f=fixture();f.a.leave();f.player.pos={x:828,z:-500};
  assert.equal(f.a.enter({origin:{x:1000,z:-500},sectorId:'test'}).ok,true);f.admit();
  assert.equal(f.command('accept',1).ok,true);assert.deepEqual(f.get('core').pos,{x:888,z:-500});
  f.get('core').pos={x:1172,z:-500};f.tick(121);assert.equal(f.a.view().coreDelivered,true);
});
test('retained duplicates fail entry without consuming or cloning their originals',()=>{
  const f=fixture(),core=f.get('core');f.a.leave();
  f.state.entities.set(99,{...core,id:99});f.state.entities.set(100,{...core,id:100});
  const before=f.state.entities.size;const result=f.a.enter({origin:{x:0,z:0},sectorId:'test'});
  assert.equal(result.reason,'duplicate_original');assert.equal(f.state.entities.size,before);assert.equal(f.a.view().active,false);
});
test('long deterministic save sections stay fixed in size and discard unknown role pools',()=>{
  const r=createRecord();r.accepted=true;
  for(let i=0;i<50000;i++)stepRecord(r,1/60,{});
  assert.equal(Object.keys(r.rows).length,0);assert.ok(JSON.stringify(r).length<600);
  const source={...r,rows:{stranger:{x:Infinity}}};assert.deepEqual(restoreRecord(source).rows,{});
});
test('admission binds occupant generation and actor generation, not just numeric IDs',()=>{
  const f=fixture(),b=f.a.view().bodies[0];
  assert.equal(f.a.admit({...b,generation:999,epoch:f.a.view().epoch}),false);f.admit();
  assert.equal(f.a.command({epoch:f.a.view().epoch,actorId:1,actorGeneration:2,sequence:1,action:'accept'}).reason,'stale_actor');
});
