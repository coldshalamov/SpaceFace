// Actual combat kernel +705 runtime composition. Spawn/input ports do not claim a
// native solver, full flight, firing cadence, heat, aim, or renderer acceptance.
import assert from 'node:assert/strict';
import { ordinaryNestLatch } from './test-nest-line-admission.mjs';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { combat as combatProto, makeEnemySpawnSpec } from '../src/systems/combat.js';
import { WEAPONS } from '../src/data/weapons.js';
import { runtime, applyNestBroodSpawnSpec, default as definition } from '../src/data/encounters/705-the-nest.js';
import { recordNestOutcome } from '../src/systems/nestVisit.js';
import { initCampaignSidecar, recordBeatStep, getBeatStepStatus } from '../src/story/campaign47a/campaignTransitions.js';
// Source-extracted actual impact producer; collision geometry/impulse are explicit inputs,
// not a native collision claim. Cosmetic trauma mapping is the only substituted dependency.
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
const physicsPath = process.env.NEST_PHYSICS_SOURCE || new URL('../src/core/physics.js', import.meta.url);
const physicsSource = fs.readFileSync(physicsPath, 'utf8');
const impactStart = physicsSource.indexOf('const _impactTraumaCtx =');
const impactEnd = physicsSource.indexOf('function directContactImpactOptions', impactStart);
assert(impactStart >= 0 && impactEnd > impactStart);
const emitPhysicsImpact = vm.runInNewContext(physicsSource.slice(impactStart, impactEnd)
  + '\nfunction finiteOrZero(value) { return Number.isFinite(value) ? value : 0; }\nemitPhysicsImpact;',
  { traumaFromContact: () => 0 });
console.log(JSON.stringify({ physicsImpactSource: String(physicsPath), sha256: createHash('sha256').update(physicsSource).digest('hex'),
  qualification: 'Actual emitPhysicsImpact producer; declared contact inputs and cosmetic trauma port, not native collision.' }));
function contact(h, wasp, impulse=100) {
  const plug=h.state.entities.get(h.live.data.nest.doorIds[0]);
  wasp.pos={x:plug.pos.x,z:plug.pos.z-16};
  return emitPhysicsImpact(h.bus,h.state,plug,wasp,impulse,{impactScale:1},{...plug.pos},{tick:h.state.tick});
}
function harness({authored=false}={}) {
  const state = createGameState(705); state.mode = 'flight'; state.run = { kind: 'adventure' };
  state.simTime = 10; state.playerId = 1; state.player.flags = {}; state.player.credits = 0;
  state.entities = new Map(); state.entityList = [];
  let next = 2;
  const spawn = spec => { const e = { id: next++, alive: true, ...spec, data: structuredClone(spec.data || {}) }; state.entities.set(e.id,e); state.entityList.push(e); return e; };
  const player = { id: 1, type: 'ship', isPlayer: true, alive: true, team: 'player', hull: 100, hullMax: 100,
    pos: { x: 650, z: 0 }, vel: { x: 0, z: 0 }, radius: 10, mass: 55, data: {}, flags: {} };
  state.entities.set(1,player); state.entityList.push(player);
  state.story.beatIndex=2; initCampaignSidecar(state,10);
  // Preexisting checkpoint only: the positive Nest outcome still comes from its runtime.
  state.story.campaign47a.stepProgress['2']={completed:['cinder_board','compost'],updatedAtS:9};
  const bus = createBus(), events = [];
  bus.on('encounter:resolved',p=>recordBeatStep(state,'encounter:resolved',p,state.simTime));
  bus.on('entity:killed', p=>events.push(p));
  const helpers = { spawnEntity: spawn, removeEntity(id) { const e=state.entities.get(id); if(e)e.alive=false;state.entities.delete(id); } };
  const combat = Object.assign({},combatProto,{state,bus,helpers});
  bus.on('projectile:hit',p=>combat.onHit(p));
  const live={id:authored?'campaign47a:charon:nest:v1':'nest-combat-proof',shapeId:'the_nest',squadId:'nest-combat-proof',sectorId:'sector_charon_expanse',
    phase:'pending',anchor:{x:0,z:0},plan:{zoneCenter:{x:0,z:0},ships:[]},data:{authoredNestVisit:authored},ids:[],roles:{},shape:definition};
  const d={state,bus,helpers,now:()=>state.simTime,player:()=>player,say:()=>{},emit:(n,p)=>bus.emit(n,p),
    spawnShips(lv,specs){return specs.map(sh=>{const spec=makeEnemySpawnSpec(sh.archetype,sh.level,sh.pos,{factionId:sh.factionId,startedTick:state.tick});
      applyNestBroodSpawnSpec(spec,lv,sh.nestActorSlot);const e=spawn(spec);lv.ids.push(e.id);lv.roles[e.id]=sh.role;return e.id;});},
    spawnProp(lv,o){return spawn({type:'beacon',pos:{...o.pos},vel:{x:0,z:0},radius:o.radius,mass:o.mass,hull:1,hullMax:1,data:{storyPropKind:o.storyPropKind,tetherable:true,encounterId:lv.id}});},
    resolve(lv,outcome){assert.equal(recordNestOutcome(d,lv,outcome),true,'actual owner accepts only runtime terminal proof');lv.phase='done';lv.outcome=outcome;bus.emit('encounter:resolved',{shape:'the_nest',encounterId:lv.id,outcome,sectorId:lv.sectorId});},abort(lv,why){lv.phase='done';lv.outcome='aborted:'+why;}};
  state.encounterDirector={live:{[live.id]:live}};
  bus.on('entity:killed',p=>runtime.event(d,live,state,'squadKill',p));
  bus.on('physics:impact',p=>runtime.event(d,live,state,'physicsImpact',p));
  runtime.fire(d,live,state); assert.equal(live.phase,'conflict');
  return {state,player,d,live,combat,bus,events,carrier:state.entities.get(live.data.nest.carrierId)};
}
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name);}
test('starter pulse produces damage and a real combat death on the actual Nest archetype',()=>{
  const h=harness(), pulse=WEAPONS.find(w=>w.id==='wpn_pulse_laser_s');
  const before={hull:h.carrier.hull,armor:h.carrier.armor,shield:h.carrier.shield}; let shots=0;
  while(h.carrier.alive!==false&&shots<500){const result=h.combat.onHit({targetId:h.carrier.id,ownerId:h.player.id,damage:pulse.dmg,damageType:pulse.damageType,weaponId:pulse.id,pos:{...h.carrier.pos}});assert.equal(result.ok,true);shots++;}
  assert.equal(h.carrier.alive,false); assert(h.carrier.hull<before.hull); assert.equal(h.events.filter(e=>e.id===h.carrier.id).length,1);
  runtime.tick(h.d,h.live,h.state,h.state.simTime); assert.equal(h.live.outcome,'carrier_down');
  assert.deepEqual(getBeatStepStatus(h.state,2).completed,['cinder_board','compost','nest'],'real runtime receipt completes the guarded story step');
  console.log(JSON.stringify({before,shots,hullAfter:h.carrier.hull}));
});
test('actual impact producer at exposed plug routes damage death once; later tick cannot reuse Wasp',()=>{
  const h=harness(); h.state.simTime=h.live.data.nest.nextLaunchS+.1;runtime.tick(h.d,h.live,h.state,h.state.simTime);
  const wasp=h.state.entities.get(h.live.data.nest.waspIds[0]);assert(wasp);
  runtime.event(h.d,h.live,h.state,'tetherAttached',{actorId:h.player.id,targetId:wasp.id});contact(h,wasp);
  assert.equal(h.live.data.nest.returnHits,0,'contact queues only; no reentrant kill');
  runtime.tick(h.d,h.live,h.state,h.state.simTime);assert.equal(wasp.alive,false);assert.equal(h.live.data.nest.returnHits,1);assert.equal(h.events.filter(e=>e.id===wasp.id).length,1);
  runtime.tick(h.d,h.live,h.state,h.state.simTime);assert.equal(h.live.data.nest.returnHits,1);
});
test('actual invulnerability rejection cannot mint a return or consume the Wasp',()=>{
  const h=harness(); h.state.simTime=h.live.data.nest.nextLaunchS+.1;runtime.tick(h.d,h.live,h.state,h.state.simTime);
  const wasp=h.state.entities.get(h.live.data.nest.waspIds[0]);
  runtime.event(h.d,h.live,h.state,'tetherAttached',{actorId:h.player.id,targetId:wasp.id});
  contact(h,wasp); wasp.flags ||= {}; wasp.flags.invuln=true;
  runtime.tick(h.d,h.live,h.state,h.state.simTime);
  assert.notEqual(wasp.alive,false); assert.equal(h.live.data.nest.returnHits,0);
  assert.equal(h.events.filter(e=>e.id===wasp.id).length,0);
});
test('stationary marked Wasp beside an open plug has no return without physical contact',()=>{
  const h=harness();h.state.simTime=h.live.data.nest.nextLaunchS+.1;runtime.tick(h.d,h.live,h.state,h.state.simTime);
  const wasp=h.state.entities.get(h.live.data.nest.waspIds[0]),plug=h.state.entities.get(h.live.data.nest.doorIds[0]);
  runtime.event(h.d,h.live,h.state,'tetherAttached',{actorId:h.player.id,targetId:wasp.id});
  wasp.pos={...plug.pos};runtime.tick(h.d,h.live,h.state,h.state.simTime);
  assert.notEqual(wasp.alive,false);assert.equal(h.live.data.nest.returnHits,0);
  assert.equal(contact(h,wasp,0),0);runtime.tick(h.d,h.live,h.state,h.state.simTime);assert.equal(h.live.data.nest.returnHits,0);
});
test('real living departure writes the accepted escape receipt and opens Registry Writ',()=>{
  const h=harness();h.player.pos={x:3100,z:0};runtime.tick(h.d,h.live,h.state,h.state.simTime);
  assert.equal(h.live.outcome,'carrier_escapes');assert.deepEqual(getBeatStepStatus(h.state,2).completed,['cinder_board','compost','nest']);
});
if (process.argv.includes('--native-proof')) {
  const nativePath=process.env.NEST_NATIVE_FIT_SOURCE || new URL('./test-nest-native-fit.mjs',import.meta.url);
  const source=fs.readFileSync(nativePath,'utf8'),end=source.indexOf("const enemies=read('src/data/enemies.js')");
  assert(end>0,'Native-fit actual geometry setup required');
  const setup=source.slice(0,end)
    .replace('const context=vm.createContext({', "read('src/core/convexPlanarFan.js');const {mergeConvexPlanarFan}=await import(pathToFileURL(file('src/core/convexPlanarFan.js')));\nconst context=vm.createContext({mergeConvexPlanarFan,")
    .replace("convexPlanarParts:no('convex fan'),",'');
  const moduleSource=setup+"\nvm.runInContext('const PLANAR_FAN_PARTS=new WeakMap();'+fn(sg,'convexPlanarParts'),context);\nconst api=context.api; export {api,RAPIER};";
  const {api,RAPIER}=await import('data:text/javascript;base64,'+Buffer.from(moduleSource).toString('base64'));
  for (const mode of ['nearest','preview']) test(`ordinary ${mode} compact Wasp latch drives native collision and actual return death`,()=>{
    const h=harness({authored:true});h.state.simTime=h.live.data.nest.nextLaunchS+.1;runtime.tick(h.d,h.live,h.state,h.state.simTime);
    const wasp=h.state.entities.get(h.live.data.nest.waspIds[0]),plug=h.state.entities.get(h.live.data.nest.doorIds[0]);
    assert.equal(wasp.mass,16);assert.equal(wasp.radius,9);wasp.pos={x:h.player.pos.x+80,z:h.player.pos.z};
    const {events,host,kernel}=ordinaryNestLatch(h,wasp,mode);assert.equal(events.filter(e=>e.attachmentId).length,1);assert.equal(wasp.data.thrownBy,'player');
    assert.equal(kernel.attachments.cut(host._active.attachmentId,h.player.id,'player_release').ok,true);
    api.admit(wasp);api.admit(plug);const wb=api.recipe(wasp),ps=api.resolvePhysicsBodySpec(plug);
    assert(wb.manifest.id.startsWith('skin:'),'actual measured Wasp proxy, not radius-ball substitute');
    const world=new RAPIER.World({x:0,y:0,z:0}),queue=new RAPIER.EventQueue(true);world.timestep=1/60;
    let observed=0,steps=0,measured=null;
    try {
      const pb=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(plug.pos.x,0,plug.pos.z).setAdditionalMass(ps.mass));
      const pc=world.createCollider(api.buildBallColliderDesc(RAPIER,ps,api.contactMaterialFor(plug,ps),true,plug),pb);
      const rb=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(plug.pos.x,0,plug.pos.z-90).setAdditionalMass(16).setLinvel(0,0,100).setCcdEnabled(true));
      const colliders=wb.descs.map(desc=>world.createCollider(desc,rb)),handles=new Set(colliders.map(c=>c.handle));
      for(;steps<100&&observed===0;steps++) {
        world.step(queue);const wp=rb.translation(),pp=pb.translation();wasp.pos={x:wp.x,z:wp.z};plug.pos={x:pp.x,z:pp.z};
        queue.drainContactForceEvents(event=>{
          const ah=event.collider1(),bh=event.collider2();if(!((ah===pc.handle&&handles.has(bh))||(bh===pc.handle&&handles.has(ah))))return;
          const impulse=event.totalForceMagnitude()*world.timestep;if(!(impulse>0))return;
          let point=null;const wc=colliders.find(c=>c.handle===(ah===pc.handle?bh:ah));
          world.contactPair(pc,wc,manifold=>{if(!point&&manifold.numSolverContacts()>0)point=manifold.solverContactPoint(0);});
          assert(point,'native manifold contact point required');h.state.tick++;
          emitPhysicsImpact(h.bus,h.state,plug,wasp,impulse,{impactScale:1},{x:point.x,z:point.z},{tick:h.state.tick,backend:'rapier'});
          observed++;measured={impulse,point:{x:point.x,z:point.z},proxy:wb.manifest.id,waspMass:wasp.mass,steps:steps+1};
        });
      }
      assert(observed>0,'bounded moving Wasp must contact actual plug');assert.equal(h.live.data.nest.returnHits,0,'native callback queues, not reentrant reward');
      runtime.tick(h.d,h.live,h.state,h.state.simTime);assert.equal(wasp.alive,false);assert.equal(h.live.data.nest.returnHits,1);
      assert.equal(h.events.filter(e=>e.id===wasp.id).length,1);runtime.tick(h.d,h.live,h.state,h.state.simTime);assert.equal(h.live.data.nest.returnHits,1);
      console.log(JSON.stringify({nativeWaspReturn:{...measured,mode,radius:wasp.radius},qualification:'Actual measured Wasp proxy + actual plug descriptor, Rapier force/manifold to actual impact emitter/runtime/damage. Bounded isolated contact, not full game flight.'}));
    } finally {queue.free();world.free();}
  });
}
console.log(`nest-combat: ${passed} actual-owner groups passed; input/spawn ports, not native flight.`);
