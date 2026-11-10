import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { environmentalMachinery } from '../src/systems/environmentalMachinery.js';
import { createOrchardMotorState } from '../src/core/anvilOrchardNative.js';
import { ORCHARD_GEOMETRY as G, orchardFrameBodySpec } from '../src/data/anvilOrchardBody.js';
import { ANVIL_ORCHARD, createOrchardRecord } from '../src/data/anvilOrchard.js';
import { PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';

import assert from 'node:assert/strict';
import { setup } from './fixtures/anvil-orchard-custody-source.mjs';
import { ready } from './fixtures/anvil-orchard-custody-ready.mjs';
import { combat } from '../src/systems/combat.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { scalarHitToDamagePacket } from '../src/combat/damage.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';

async function shockWorld({release=true}={}) {
  const h = release ? await ready() : await setup();
  if(!release){assert.equal(h.accept(),4);h.pod=h.sim.state.entityList.find(e=>e.data?.orchardKind==='pod');}
  const registry=h.sim.registry, resolve=registry.get.bind(registry);
  h.combat={...combat};
  registry.get=name=>name==='combat'?h.combat:resolve(name);
  h.combat.init(registry.ctx);
  h.consequences={...collisionConsequences}; h.consequences.init(registry.ctx);
  h.impacts=[]; h.damage=[]; h.losses=[];
  h.sim.bus.on('physics:impact',p=>{if(p.aId===h.pod.id||p.bId===h.pod.id)h.impacts.push(structuredClone(p));});
  h.sim.bus.on('combat:damage',p=>{if(p.targetId===h.pod.id)h.damage.push(structuredClone(p));});
  h.sim.bus.on('entity:destroyed',p=>{if(p.id===h.pod.id)h.losses.push(p.id);});
  h.step=(beforeResolve=null)=>{
    h.sim.state.tick++;h.sim.state.simTime=h.sim.state.tick/60;
    h.owner.step(1/60,h.sim.state.tick);
    h.owner.publishCompletedOrchardContacts(h.owner.completedOrchardTail(),()=>h.facade._emitSg02ContactImpacts(h.sim.state));
    beforeResolve?.();
    // Focused native-contact harness drives the same post-tail event. The separate
    // manifest-relative sim.step case below proves production emits it before sweep.
    h.sim.bus.emit('physics:contactsCompleted',{backend:'rapier-dynamic',tick:h.sim.state.tick});
    h.sim.registry.systems[0].lifetimeSweep(0,h.sim.state);
  };
  const close=h.close; h.close=()=>{h.consequences.destroy();close();};
  return h;
}

for(const speed of [5,40,60]) test(`actual native ${speed} WU/s pod contact uses existing collision damage`,async()=>{
  const prev=COMBAT_FLAGS.weaponImpulseConsequences;COMBAT_FLAGS.weaponImpulseConsequences=true;
  const h=await shockWorld();
  try{
    const cargo=structuredClone(h.sim.state.player.cargo), credits=h.sim.state.player.credits;
    const dir={x:Math.cos(h.frame.rot),z:Math.sin(h.frame.rot)};
    const wall=h.sim.spawn({type:'station',pos:{x:h.pod.pos.x+dir.x*60,z:h.pod.pos.z+dir.z*60},
      radius:8,mass:1000000,hull:1e9,hullMax:1e9,physicsBody:{dynamic:false,mass:1000000,radius:8,shape:'sphere',material:'station'}});
    h.owner.syncFromEntities(h.sim.state.entityList);
    queuePhysicsImpulse(h.pod,{x:dir.x*speed*h.pod.physicsBody.mass,y:0,z:dir.z*speed*h.pod.physicsBody.mass});
    for(let n=0;n<900 && h.pod.alive!==false && !h.impacts.some(p=>p.aId===wall.id||p.bId===wall.id);n++)h.step();
    const impact=h.impacts.find(p=>p.aId===wall.id||p.bId===wall.id);
    assert.ok(impact,JSON.stringify(h.impacts));
    assert.equal(impact.backend,'rapier-dynamic');assert.ok(impact.impulse>0);
    console.log('POD_SHOCK',JSON.stringify({speed,impact,hull:h.pod.hull,damage:h.damage.length}));
    if(speed===5){assert.equal(h.pod.hull,100);assert.equal(h.damage.length,0);}
    else if(speed===40){
      assert.ok(h.pod.hull>0 && h.pod.hull<100);assert.equal(h.damage.length,1);
      const hull=h.pod.hull;
      for(let n=0;n<3;n++)h.sim.bus.emit('physics:impact',impact);
      h.sim.bus.flush();assert.equal(h.pod.hull,hull);assert.equal(h.damage.length,1);
      h.sim.state.tick+=20;h.sim.bus.emit('physics:impact',impact);h.sim.bus.flush();
      assert.equal(h.pod.hull,hull,'stale-tick replay cannot evade pair cooldown');
    }
    else {assert.equal(h.pod.alive,false);assert.equal(h.losses.length,1);assert.equal(h.sim.state.sites.anvilOrchard.lots[0].outcome,'lost');
      assert.equal(h.sim.state.sites.anvilOrchard.sourceRemaining,44);
      assert.deepEqual(h.sim.state.player.cargo,cargo);assert.equal(h.sim.state.player.credits,credits);
      assert.equal(h.sim.state.entityList.filter(e=>e.alive!==false&&e.data?.commodityId===h.pod.data.commodityId).length,0);
      h.sim.registry.systems[0].lifetimeSweep(0,h.sim.state);assert.equal(h.losses.length,1);
    }
  } finally{h.close();COMBAT_FLAGS.weaponImpulseConsequences=prev;}
});

// Rejection tests inject invalid event envelopes only; positive damage above requires
// a real native contact. A copied identity never serves as a positive fixture.
for(const refusal of ['stowed','copied','dead','replaced-life','missing-generation','stale-generation','custom-backend','save-cancel','world-replaced'])
  test(`shock refuses ${refusal} without changing finite custody`,async()=>{
    const prev=COMBAT_FLAGS.weaponImpulseConsequences;COMBAT_FLAGS.weaponImpulseConsequences=true;
    const h=await shockWorld({release:refusal!=='stowed'});
    const state=h.sim.state;
    try{
      let target=h.pod;
      const other=h.sim.spawn({type:'station',pos:{x:14000,z:9400},radius:8,hull:100,mass:1000000});
      if(refusal==='copied') target=h.sim.spawn({type:'payload',pos:{...h.pod.pos},hull:100,hullMax:100,
        radius:h.pod.radius,physicsBody:structuredClone(h.pod.physicsBody),data:structuredClone(h.pod.data)});
      const row=structuredClone(state.sites.anvilOrchard);
      const impact={consequenceKernelVersion:1,backend:'rapier-dynamic',tick:state.tick,
        aId:target.id,bId:other.id,aGeneration:target.occupantGeneration,bGeneration:other.occupantGeneration,
        impulse:600,preSolveClosingSpeed:60,pos:{...target.pos},normal:{x:1,z:0}};
      if(refusal==='dead')target.alive=false;
      if(refusal==='missing-generation')delete impact.aGeneration;
      if(refusal==='stale-generation')impact.aGeneration--;
      if(refusal==='custom-backend')impact.backend='custom';
      h.sim.bus.emit('physics:impact',impact);
      if(refusal==='replaced-life'){
        const replacement={...target,occupantGeneration:target.occupantGeneration+1};
        state.entities.set(target.id,replacement);
      }
      if(refusal==='save-cancel'){
        h.owner.syncFromEntities(state.entityList);
        const saves=h.sim.registry.get('save');
        assert.equal(saves.loadEnvelope(JSON.parse(JSON.stringify(saves.serialize('shock-pending')))),true);
      }
      const oldWorld=h.owner.world;
      if(refusal==='world-replaced')h.owner.world={};
      try{h.sim.bus.flush();}finally{h.owner.world=oldWorld;}
      assert.equal(target.hull,100);assert.equal(h.damage.length,0);
      assert.deepEqual(state.sites.anvilOrchard,row);
    }finally{h.close();COMBAT_FLAGS.weaponImpulseConsequences=prev;}
  });

test('same native contact still shocks the pod when its other endpoint dies before deferred resolution',async()=>{
  const prev=COMBAT_FLAGS.weaponImpulseConsequences;COMBAT_FLAGS.weaponImpulseConsequences=true;
  const h=await shockWorld();
  try{
    const dir={x:Math.cos(h.frame.rot),z:Math.sin(h.frame.rot)};
    const wall=h.sim.spawn({type:'station',pos:{x:h.pod.pos.x+dir.x*60,z:h.pod.pos.z+dir.z*60},
      radius:8,mass:1000000,hull:100,hullMax:100,physicsBody:{dynamic:false,mass:1000000,radius:8,shape:'sphere',material:'station'}});
    h.owner.syncFromEntities(h.sim.state.entityList);
    let killedDuringContact=false;
    h.sim.bus.on('physics:impact',p=>{
      if(killedDuringContact || ![p.aId,p.bId].includes(wall.id))return;
      // Fixture injects another lawful damage packet at this exact contact boundary;
      // the pod's own shock still comes solely from its measured native impact.
      const packet=scalarHitToDamagePacket({damage:1000,damageType:'kinetic'});
      packet.flags={allowAnyTarget:true};
      h.combat.kernel.routeDamage({targetId:wall.id,packet,origin:{kind:'collision',id:'ordering-fixture'}});
      killedDuringContact=wall.alive===false;
    });
    queuePhysicsImpulse(h.pod,{x:dir.x*40*h.pod.physicsBody.mass,y:0,z:dir.z*40*h.pod.physicsBody.mass});
    for(let n=0;n<200 && !killedDuringContact;n++)h.step();
    assert.equal(killedDuringContact,true);
    assert.equal(h.damage.length,1);assert.ok(h.pod.hull>0 && h.pod.hull<100);
    assert.equal(h.sim.state.sites.anvilOrchard.lots[0].outcome,'retained');
  }finally{h.close();COMBAT_FLAGS.weaponImpulseConsequences=prev;}
});

test('native capture generations survive batched emission when a callback replaces a later endpoint',async()=>{
  const prev=COMBAT_FLAGS.weaponImpulseConsequences;COMBAT_FLAGS.weaponImpulseConsequences=true;
  const h=await shockWorld();
  try{
    const dir={x:Math.cos(h.frame.rot),z:Math.sin(h.frame.rot)};
    const wall=h.sim.spawn({type:'station',pos:{x:h.pod.pos.x+dir.x*60,z:h.pod.pos.z+dir.z*60},
      radius:8,mass:1000000,hull:1000,hullMax:1000,physicsBody:{dynamic:false,mass:1000000,radius:8,shape:'sphere',material:'station'}});
    h.owner.syncFromEntities(h.sim.state.entityList);
    queuePhysicsImpulse(h.pod,{x:dir.x*40*h.pod.physicsBody.mass,y:0,z:dir.z*40*h.pod.physicsBody.mass});
    let captured=[];
    for(let n=0;n<200 && !captured.length;n++){
      h.sim.state.tick++;h.owner.step(1/60,h.sim.state.tick);
      h.owner.publishCompletedOrchardContacts(h.owner.completedOrchardTail(),()=>{captured=h.owner.drainContactImpacts();});
    }
    const native=captured.find(p=>[p.aId,p.bId].includes(wall.id));assert.ok(native);
    const generation=h.pod.occupantGeneration;
    assert.equal(native.aId===h.pod.id?native.aGeneration:native.bGeneration,generation);
    // Duplicate the genuine captured receipt solely to exercise a batched emitter's
    // reentrant boundary; this test is negative and never uses it to award damage.
    const drain=h.owner.drainContactImpacts;
    h.owner.drainContactImpacts=()=>[native,native];
    let emitted=0,replacement;
    h.sim.bus.on('physics:impact',()=>{
      if(++emitted!==1)return;
      replacement={...h.pod,occupantGeneration:generation+1};
      h.sim.state.entities.set(h.pod.id,replacement);
    });
    try{h.facade._emitSg02ContactImpacts(h.sim.state);}finally{h.owner.drainContactImpacts=drain;}
    h.sim.bus.flush();
    assert.equal(emitted,2);
    for(const receipt of h.impacts)assert.equal(receipt.aId===h.pod.id?receipt.aGeneration:receipt.bGeneration,generation);
    assert.equal(replacement.hull,100);assert.equal(h.damage.length,0);
  }finally{h.close();COMBAT_FLAGS.weaponImpulseConsequences=prev;}
});

for(const boundary of ['ordinary','world-replaced','cancelled'])
test(`manifest-relative sim.step shock boundary: ${boundary}`,async()=>{
  const prev=COMBAT_FLAGS.weaponImpulseConsequences;COMBAT_FLAGS.weaponImpulseConsequences=true;
  let onCompleted=null, completedEvents=0;
  const boundaryObserver={name:'shockBoundaryObserver',init({bus}){
    bus.on('physics:contactsCompleted',()=>{completedEvents++;onCompleted?.();});
  }};
  const systems=[boundaryObserver,asteroidSites,physics,environmentalMachinery,combat,collisionConsequences];
  const byName=new Map(systems.map(s=>[s.name,s]));
  const updateOrder=PRODUCTION_UPDATE_ORDER.filter(name=>byName.has(name)).map(name=>byName.get(name));
  assert.ok(updateOrder.indexOf(collisionConsequences)<updateOrder.indexOf(physics));
  const sim=createSimulation({systems,updateOrder});
  try{
    const state=sim.state;state.mode='flight';state.world.currentSectorId=ANVIL_ORCHARD.sectorId;
    state.settings.gameplay.physicsBackend='rapier-dynamic';
    const worker=sim.spawn({type:'ship',isPlayer:true,pos:{x:13500,z:8300},radius:6,hull:100,hullMax:100,
      data:{defId:'ship_kestrel',fittings:[],anvilSlingWitness:true,itinerary:{kind:'anvil_work',role:'collector',phase:'collect'}}});
    state.playerId=worker.id;
    const frame=sim.spawn({type:'wreck',pos:{x:13200,z:8300},rot:.713,radius:G.radius,hull:300,
      flags:{persistent:true},physicsBody:orchardFrameBodySpec(),data:{orchardId:ANVIL_ORCHARD.id,
        orchardKind:'frame',worldRecordId:G.worldRecordId,placeId:'place_anvil_storm_orchard',
        authoredAssetId:G.assetId,authoredPayloadAssetId:G.assetId,masslineTetherable:false,
        orchardCollars:createOrchardMotorState()}});
    const facade=sim.registry.get('physics');assert.equal(await facade.prepareBackend(state),true);
    state.sites.anvilOrchard=createOrchardRecord(0);
    const machine=sim.registry.get('environmentalMachinery'),owner=facade._sg02;
    assert.equal(machine.acceptOrchardNewPod(worker,{frame,socket:1,qty:4,commodityId:ANVIL_ORCHARD.commodityId}),4);
    const pod=state.entityList.find(e=>e.data?.orchardKind==='pod');
    assert.equal(owner.requestOrchardFiniteRelease(frame,1,state),true);
    // Fixture opening only. Every impact tick below uses the real host and current manifest order.
    for(let tick=1;tick<=30;tick++){state.tick=tick;owner.step(1/60,tick);
      owner.publishCompletedOrchardContacts(owner.completedOrchardTail(),()=>owner.drainContactImpacts());}
    assert.equal(owner.prepareOrchardPodHandoff(frame,pod,1,state).commit(),true);
    const dir={x:Math.cos(frame.rot),z:Math.sin(frame.rot)};
    const wall=sim.spawn({type:'station',pos:{x:pod.pos.x+dir.x*60,z:pod.pos.z+dir.z*60},radius:8,
      mass:1000000,hull:1e9,hullMax:1e9,physicsBody:{dynamic:false,mass:1000000,radius:8,shape:'sphere',material:'station'}});
    let contactTick=null,destroyed=0;
    sim.bus.on('physics:impact',p=>{if([p.aId,p.bId].includes(pod.id)&&[p.aId,p.bId].includes(wall.id))contactTick=state.tick;});
    sim.bus.on('entity:destroyed',p=>{if(p.entity===pod)destroyed++;});
    const world=owner.world;
    onCompleted=()=>{
      assert.equal(facade._sg02.orchardAuthorityAvailable(),true,'hook runs after native contact phase closes');
      if(boundary==='world-replaced')owner.world={};
      if(boundary==='cancelled')sim.registry.get('collisionConsequences').destroy();
    };
    queuePhysicsImpulse(pod,{x:dir.x*60*pod.physicsBody.mass,y:0,z:dir.z*60*pod.physicsBody.mass});
    try{
      for(let n=0;n<150 && contactTick===null;n++){
        sim.step();
        if(contactTick===null)assert.equal(completedEvents,0,'no-impact ticks emit no completed-contact hook');
      }
    }finally{owner.world=world;}
    assert.equal(contactTick,state.tick);assert.equal(completedEvents,1);
    if(boundary==='ordinary'){
      assert.equal(pod.alive,false);
      assert.equal(destroyed,1,'the ordinary sweep settles the finite loss on the impact tick');
      assert.equal(state.sites.anvilOrchard.lots[0].outcome,'lost');
    }else{
      assert.equal(pod.hull,100);assert.equal(destroyed,0);
      assert.equal(state.sites.anvilOrchard.lots[0].outcome,'retained');
    }
  }finally{sim.dispose();COMBAT_FLAGS.weaponImpulseConsequences=prev;}
});
