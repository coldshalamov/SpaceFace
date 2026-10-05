import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRuckusFixture } from '../tools/ruckus/labRuntime.js';
import { RUCKUS as C, freshRuckusMemory, normalizeRuckusMemory, RUCKUS_AUDIO_RECIPES } from '../src/data/ruckus.js';
import { ruckusEntitySpec, ruckusHoldsLine, RUCKUS_GLOBAL_ANCHOR as HOME } from '../src/systems/ruckus.js';
import { legalFetch, retrieverControl, barkImpulse, distanceXZ, speedOf } from '../src/characters/ruckusRules.js';
import { consumePhysicsCommand, resolvePhysicsBodySpec, queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { SECTORS } from '../src/data/sectors.js';
import { RECIPES } from '../src/data/audioRecipes.js';
import { isAttachable } from '../src/systems/tetherGameplay.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER, TABLE_CLOCK_IDS } from '../src/runtime/authoritativeSystemManifest.js';
import { save } from '../src/save/saveSystem.js';
const text = file => readFile(new URL('../'+file,import.meta.url),'utf8');
const alive = f => f.state.entityList.filter(e => e.alive && e.data?.ruckusPart);
const waitForReturn = (f, n) => { for(let i=0;i<60*36 && f.state.ruckus.returns<n;i++)f.step();assert.equal(f.state.ruckus.returns,n,`phase ${f.system._phase}`); };

test('memory is finite, bounded, versioned and strips transient physics/charge state',()=>{
  assert.deepEqual(normalizeRuckusMemory(null),freshRuckusMemory());assert.deepEqual(normalizeRuckusMemory({version:2}),freshRuckusMemory());
  const m=normalizeRuckusMemory({version:1,returns:1e99,hull:-1,visits:NaN,pulses:-4,met:'true',armed:true,bodyId:10});
  assert.equal(m.returns,1e6);assert.equal(m.visits,0);assert.equal(m.destroyed,true);assert.equal(m.hull,0);assert.equal(m.met,false);
  assert.equal(m.armed,undefined);assert.equal(m.bodyId,undefined);assert.deepEqual(normalizeRuckusMemory(m),m);
});
test('one production clock; browser, node, map, audio and every save path are connected',async()=>{
  for(const list of [PRODUCTION_INIT_ORDER,PRODUCTION_UPDATE_ORDER,TABLE_CLOCK_IDS])assert.equal(list.filter(n=>n==='ruckus').length,1);
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('ruckus')<PRODUCTION_UPDATE_ORDER.indexOf('physics'));
  for(const file of ['src/core/registry.js','src/runtime/nodeSystemFactoryTable.js'])assert.match(await text(file),/\['ruckus', ruckus\]/);
  const code=await text('src/save/saveSystem.js');assert.match(code,/data\.ruckus = this\._callSerialize\('ruckus'\)/);assert.match(code,/_callDeserialize\('ruckus', data\.ruckus\)/);
  const plan=save._saveCapturePlan.call({_callSerialize:n=>n==='ruckus'?{version:1,returns:3}:null});assert.equal(plan.find(p=>p[0]==='ruckus')[1]().returns,3);
  const poi=SECTORS.find(s=>s.id===C.sectorId).pois.find(p=>p.runtimeOwner==='ruckus');assert.deepEqual(poi.pos,{...C.anchor});assert.ok(poi.discoveryPlate.body.includes('Massline'));
  for(const r of RUCKUS_AUDIO_RECIPES)assert.ok(RECIPES.some(x=>x.id===r.id));
  assert.match(await text('src/render/visualFactory.js'),/ruckusPart\) return stampBuiltVisual\(buildRuckusVisual\(e\)\)/);
});
test('actual pressure core is a neutral, dynamic, Massline-attachable solid; memorial is not',async()=>{
  const f=await createRuckusFixture();try{
    assert.equal(alive(f).length,2);assert.equal(f.body().data.ai.passive,true);assert.equal(f.body().team,2);
    assert.equal(resolvePhysicsBodySpec(f.core()).dynamic,true);assert.equal(resolvePhysicsBodySpec(f.core()).mass,C.toyMass);
    assert.equal(isAttachable(f.core(),f.player.id,f.state),true);assert.equal(ruckusEntitySpec('memorial').physicsBody,false);
    assert.equal(f.hold(),true);f.run(.2);assert.equal(ruckusHoldsLine(f.state,f.core()),true);f.release(undefined,0);
  }finally{f.destroy();}
});
test('scanner requires actual nearby player pulse and monotonically increasing sequence',async()=>{
  const f=await createRuckusFixture(null,{physics:false});try{
    for(const bad of [{source:'npc'},{scannerId:999},{seq:0},{seq:NaN},{radius:NaN},{radius:1},{pos:{x:0,z:0}}])f.scan(bad);
    assert.equal(f.state.ruckus.met,false);f.scan({seq:40});assert.equal(f.state.ruckus.met,true);assert.equal(f.system._phase,'offer');
    f.scan({seq:40});assert.equal(f.system._phase,'offer');f.scan({seq:41});assert.equal(f.system._phase,'sleep');
  }finally{f.destroy();}
});
test('no automatic invitation/reward without a legal player throw',async()=>{
  const f=await createRuckusFixture();try{f.run(5);assert.equal(f.system._phase,'sleep');assert.equal(f.state.ruckus.returns,0);
    f.scan();queuePhysicsImpulse(f.core(),{x:30*f.core().mass,y:0,z:0});f.run(3);assert.equal(f.system._phase,'offer');assert.equal(f.state.ruckus.returns,0);
    assert.equal(legalFetch({now:1,touchedAt:0,displacement:100,speed:50,held:true}),false);
  }finally{f.destroy();}
});
test('real Rapier: throw, chase, spring-carry and slow drop complete with no body teleport',async()=>{
  const f=await createRuckusFixture();try{
    f.scan();f.throwCore();let previous={...f.body().pos},largestStep=0,sawCarry=false;
    for(let i=0;i<60*35 && !f.state.ruckus.returns;i++) {f.step();const b=f.body();assert.ok(b&&f.core());largestStep=Math.max(largestStep,distanceXZ(previous,b.pos));previous={...b.pos};sawCarry ||= f.system._phase==='carry';}
    assert.equal(f.state.ruckus.returns,1);assert.ok(sawCarry);assert.ok(largestStep<4,`no teleport: ${largestStep}`);assert.ok(speedOf(f.core())<9);
    assert.ok(f.events.some(([n])=>n==='ruckus:retrieved'));assert.equal(f.player.hull,250);
  }finally{f.destroy();}
});
test('real Rapier: three successful throws bond; gift pauses while tethered then actually moves loose bodies',async()=>{
  const f=await createRuckusFixture();try{
    f.scan();for(let n=1;n<=3;n++){f.throwCore({x:n===2?-1:1,z:.25});waitForReturn(f,n);}
    assert.ok(f.events.some(([n,p])=>n==='ruckus:voice'&&p.key==='bonded'));assert.equal(f.system._charge,1);
    f.hold();f.run(5);const remaining=f.system._countdown;f.run(2);assert.equal(f.system._countdown,remaining);assert.equal(f.state.ruckus.pulses,0);
    const c=f.core();const debris=f.helpers.spawnEntity({type:'payload',pos:{x:c.pos.x+38,z:c.pos.z},radius:4,mass:20,hull:50,hullMax:50,
      physicsBody:{dynamic:true,shape:'ball',radius:4,mass:20,material:'debris',useMeasuredSkin:false,contact:{linearDamping:0}}});
    f.release({x:0,z:1},0);f.run(C.pulseSeconds+.1);assert.equal(f.state.ruckus.pulses,1);assert.ok(speedOf(debris)>3);assert.equal(debris.hull,50);
    assert.equal(f.system._charge,0);assert.ok(f.events.some(([n,p])=>n==='ruckus:pulse'&&p.affected>0));
  }finally{f.destroy();}
});
test('pause stops animation time and force writes; taking the core interrupts RUCKUS without fighting the line',async()=>{
  const f=await createRuckusFixture();try{f.scan();f.throwCore();f.run(1);assert.equal(f.system._phase,'chase');
    consumePhysicsCommand(f.body());f.state.timeScale=0;const pose=structuredClone(f.body().data.ruckusPose);f.run(4);
    assert.deepEqual(f.body().data.ruckusPose,pose);assert.equal(consumePhysicsCommand(f.body()),null);
    f.state.timeScale=1;f.hold();f.step();assert.equal(f.system._phase,'offer');assert.equal(ruckusHoldsLine(f.state,f.core()),true);
  }finally{f.destroy();}
});
test('forged or recycled attachment generation does not authorize retrieval',async()=>{
  const f=await createRuckusFixture(null,{physics:false});try{f.hold();const a=f.state.combat.attachments.byId.workshop;
    a.targetGeneration+=1;assert.equal(ruckusHoldsLine(f.state,f.core()),false);a.targetGeneration-=1;a.ownerGeneration+=1;assert.equal(ruckusHoldsLine(f.state,f.core()),false);
  }finally{f.destroy();}
});
test('damage disarms and retreats; death survives restore; new game gives one fresh cohort',async()=>{
  const f=await createRuckusFixture();try{f.scan();f.system._charge=1;const b=f.body();b.hull=700;f.bus.emit('combat:damage',{targetId:b.id,applied:200});
    assert.equal(f.system._phase,'retreat');assert.equal(f.system._charge,0);assert.equal(f.system.serialize().hull,700);
    b.hull=0;b.alive=false;f.bus.emit('entity:killed',{id:b.id});const saved=f.system.serialize();assert.equal(saved.destroyed,true);
    f.system.deserialize(saved);f.bus.emit('save:loaded',{});f.run(1);assert.equal(f.body(),null);assert.equal(alive(f).length,1);assert.equal(alive(f)[0].data.ruckusPart,'memorial');
    f.bus.emit('game:newGame',{});f.step();assert.ok(f.body());assert.equal(alive(f).length,2);
  }finally{f.destroy();}
});
test('restore clears transient charge and duplicate bodies while preserving friendship',async()=>{
  const f=await createRuckusFixture({...freshRuckusMemory(),returns:3,met:true});try{
    f.system._charge=1;f.bus.emit('save:restoring',{});f.system.deserialize(f.system.serialize());f.run(1);assert.equal(alive(f).length,0);
    f.bus.emit('save:loaded',{});f.run(1);f.system._sync();assert.equal(alive(f).length,2);assert.equal(f.state.ruckus.returns,3);assert.equal(f.system._charge,0);
  }finally{f.destroy();}
});
test('bounded yard, far residency, dock and run isolation cleanly remove or disarm owned work',async()=>{
  const f=await createRuckusFixture(null,{physics:false});try{
    for(const kind of ['swarm','survival','lab']){f.state.run.kind=kind;f.bus.emit('sector:enter',{});assert.equal(alive(f).length,0);}
    f.state.run.kind='adventure';f.bus.emit('sector:enter',{});assert.equal(alive(f).length,2);
    f.player.pos.x+=3000;f.step();assert.equal(alive(f).length,0);f.player.pos.x-=3000;f.step();assert.equal(alive(f).length,2);
    f.scan();f.system._charge=1;f.player.flags.docked=true;f.step();assert.equal(f.system._charge,0);
    f.state.world.currentSectorId='elsewhere';f.step();assert.equal(alive(f).length,0);
  }finally{f.destroy();}
});
test('pressure math excludes static, massive and docked bodies and is finite at coincident center',()=>{
  const e={id:1,alive:true,type:'payload',mass:20,pos:{x:0,z:0},vel:{x:0,z:0}};
  assert.ok(Number.isFinite(barkImpulse(e,e.pos).x));
  for(const extra of [{mass:Infinity},{mass:1e6},{physicsBody:false},{physicsBody:{dynamic:false}},{flags:{docked:true}},{alive:false}])assert.equal(barkImpulse({...e,...extra},e.pos),null);
  const command=retrieverControl({...e,rot:0},{x:100,z:100});assert.ok(Math.hypot(command.force.x,command.force.z)<=C.maxAccel*20+.001);
});
test('encounter logic never consumes ambient RNG and repeats deterministically',async()=>{
  const run=async()=>{const f=await createRuckusFixture(null,{physics:false});const old=Math.random;try{Math.random=()=>{throw Error('ambient RNG');};f.scan();f.run(2);return JSON.stringify(f.events.filter(([n])=>n.startsWith('ruckus:')));}finally{Math.random=old;f.destroy();}};
  assert.equal(await run(),await run());
});

test('restored Massline-stunt core is adopted instead of creating an anonymous duplicate',async()=>{
 const f=await createRuckusFixture(null,{physics:false});try{
  const memory=f.system.serialize();f.bus.emit('save:restoring',{});f.system.deserialize(memory);
  const restored=f.helpers.spawnEntity(ruckusEntitySpec('core'));f.bus.emit('save:loaded',{});f.step();
  assert.equal(f.core(),restored);assert.equal(alive(f).filter(e=>e.data.ruckusPart==='core').length,1);assert.equal(f.system._charge,0);
 }finally{f.destroy();}
});
test('recycled body id is not mistaken for RUCKUS; foreign occupant remains untouched',async()=>{
 const f=await createRuckusFixture(null,{physics:false});try{
  const old=f.body();f.helpers.removeEntity(old.id);const foreign={...old,alive:true,data:{foreign:true}};f.state.entities.set(old.id,foreign);f.state.entityList.push(foreign);
  f.step();assert.notEqual(f.body(),foreign);assert.equal(f.state.entities.get(foreign.id),foreign);assert.equal(foreign.data.foreign,true);
 }finally{f.destroy();}
});
