// PQ-146 genuine escape routes: Kickstart (a real rear repulsion-trap blast through the impulse
// charge owner), Needle Thread (a closing pincer of moving hostile hulls) and the Close Shave
// bridge. The threat tracker, the launch witness and the escape settlement read Rapier bodies.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hash32,mulberry32 } from '../src/core/rng.js';
import { makeEntity } from '../src/core/entity.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { createSg02DynamicBodyOwner,createSg02CombatPhysicsPort } from '../src/core/sg02DynamicBodyOwner.js';
import { createCombatKernel } from '../src/combat/kernel.js';
import { stuntGrammar } from '../src/systems/stuntGrammar.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { tumbleStates } from '../src/systems/tumbleStates.js';
import { impulseCharges } from '../src/systems/impulseCharges.js';
import { IMPULSE_CHARGES } from '../src/data/impulseCharges.js';
import { journalFor } from '../src/combat/stuntEvidence.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { resolveGovernedCombatSpeed } from '../src/core/flight/propulsionCatalog.js';
const DT=1/60;
// Stunt gates key to the governed combat cruise the evidence journal resolves for the hull
// (restored fast ceilings, e8d10fed7e). Scripted launches below are re-derived against that
// same resolved number, never against a hardcoded catalog value that a re-tune would stale.
const cruiseOf=(state,entity)=>resolveGovernedCombatSpeed(entity,state);
async function scene({playerSpeed=150,z=0,pursuer=true,closing=50,pursuerOffset=0,survival=false}={}){
  const state=createGameState(14646);state.mode='flight';state.tick=0;state.simTime=0;state.entities.clear();state.entityList.length=0;state.entityIndex=null;state.playerId=0;
  state.settings.gameplay.physicsBackend='rapier-dynamic';state.world.currentSectorId=null;
  if(survival)state.run={kind:'survival',phase:'active',seed:3,wave:1};
  const bus=createBus();let nextId=0;
  const spawn=spec=>{const e=makeEntity({id:nextId++,data:{},...spec});state.entities.set(e.id,e);state.entityList.push(e);bus.emit('entity:spawned',{id:e.id,entity:e});return e;};
  // hullLength 20: a real small-scout hull. The flight witness looks back 8 hull lengths
  // (160 WU here); the dot-default 12 left a 96 WU window that a restored-ceiling crossing
  // (280 WU/s covers 140 WU in its 30-tick lookback) always outran, so no needle could mint.
  const ship=(team,pos,vel,extra={})=>spawn({type:'ship',team,pos,vel,radius:6,mass:16,hull:100,hullMax:100,hullLength:20,physicsBody:{schemaVersion:1,dynamic:true,radius:6,mass:16,inertiaY:48,ccd:true},data:{encounter:{id:'escape'},...extra}});
  const player=ship(0,{x:0,z},{x:playerSpeed,z:0});
  const helpers={hash32,mulberry32,getEntity:id=>state.entities.get(id),spawnEntity:spawn};
  const flag=COMBAT_FLAGS.weaponImpulseConsequences;COMBAT_FLAGS.weaponImpulseConsequences=true;
  const kernel=createCombatKernel({state,bus,helpers}),registry={get:id=>id==='combat'?{kernel}:null};
  const grammar=Object.create(stuntGrammar);grammar.init({state,bus});
  const consequence=Object.create(collisionConsequences);consequence.init({state,bus,registry});
  const tumble=Object.create(tumbleStates);tumble.init({state,bus,registry,helpers});
  const sim=Object.create(physics);sim.init({state,bus,helpers});sim._sg02=await createSg02DynamicBodyOwner({mode:'rapier-dynamic',fixedDt:DT});
  helpers.combatPhysics=createSg02CombatPhysicsPort(sim._sg02);
  const charges=Object.create(impulseCharges);charges.init({state,bus,helpers,registry});
  const hunter=pursuer?ship(1,{x:-50,z:z+pursuerOffset},{x:playerSpeed+closing,z:0},{ai:{huntPlayer:true,activity:{targetId:0}},runCohort:survival?'survival':undefined}):null;
  const tricks=[],bridges=[],impacts=[];
  bus.on('stunt:trickDetected',t=>tricks.push(t));bus.on('stunt:bridge',b=>bridges.push(b));bus.on('physics:impact',p=>{if(p.aId===0||p.bId===0)impacts.push(p);});
  return {state,bus,player,hunter,ship,sim,tricks,bridges,impacts,
    /** The rear repulsion trap detonates `behind` units astern through the production blast owner. */
    trap(behind,def=IMPULSE_CHARGES.charge_repulsion_trap,chargeId='charge_repulsion_trap'){
      charges._blastVictims(state,{pos:{x:player.pos.x-behind,z:player.pos.z},ownerId:0,radius:def.radius,impulse:def.impulse,damage:0,chargeId,excludeId:null,originId:'trap',sourceId:null,aftDrop:false,trigger:'proximity',link:1});},
    steerTo(target,speed){state.input.turn=1;const dx=target.x-player.pos.x,dz=target.z-player.pos.z,len=Math.hypot(dx,dz),vx=speed*dx/len,vz=speed*dz/len;
      sim._sg02.applyImpulse({entityId:0,impulse:{x:player.mass*(vx-player.vel.x),z:player.mass*(vz-player.vel.z)},provenance:{actorId:0},tick:state.tick,reason:'flight'});},
    step(n,each=null){for(let i=0;i<n;i++){state.tick++;state.simTime=state.tick/60;for(const e of state.entityList)e.prevPos.copy(e.pos);each?.(state.tick);sim.update(DT,state);tumble.update(DT,state);grammar.update(DT,state);}},
    root(){return [...journalFor(state).roots.values()].find(r=>r.sourceId===0)||null;},
    close(){charges.destroy?.();tumble.destroy?.();grammar.destroy();consequence.destroy();kernel.dispose();sim._sg02.dispose();COMBAT_FLAGS.weaponImpulseConsequences=flag;}};
}
test('Kickstart: the trap blast launches the player past 1.25 cruise, the speed is kept and the pursuit is beaten',async()=>{
  const s=await scene();try{
    s.step(240,tick=>{if(tick===20)s.trap(20);});
    const root=s.root(),launch=root?.nodes.find(n=>n.kind==='launch_retained');
    const CRUISE=cruiseOf(s.state,s.player);
    assert.equal(root?.kind,'impulse_charge');assert.ok(root.threatAtRoot,'a live pursuit was tracked before the blast');
    assert.ok(launch&&launch.deltaV>=0.3*CRUISE&&launch.exitSpeed>=1.25*CRUISE&&launch.retainedSpeed>=0.9*launch.exitSpeed,JSON.stringify(launch));
    assert.equal(s.impacts.length,0,'no contact spent the escape');
    assert.equal(s.tricks.length,1,JSON.stringify(s.tricks.map(t=>t.trickId)));
    const trick=s.tricks[0];
    assert.equal(trick.trickId,'kickstart');assert.equal(trick.family,'escape');assert.equal(trick.pureEscape,true);
    assert.equal(trick.threatEpisodeId,root.threatAtRoot);assert.equal(trick.consequence.escaped,true);
    assert.ok(root.escape.separationGain>=2*12&&root.escape.displacement>=3*12);
  }finally{s.close();}
});
test('Kickstart negatives: a launch that stays under 1.25 cruise, or a blast with no live threat, names nothing',async()=>{
  const slow=await scene({playerSpeed:60});try{
    slow.step(240,tick=>{if(tick===20)slow.trap(20,IMPULSE_CHARGES.charge_standard,'charge_standard');});
    const root=slow.root();
    assert.ok(root?.escape?.completed===true,'the plate still saved the pilot');
    assert.ok(root.nodes.find(n=>n.kind==='launch_retained')?.exitSpeed<1.25*cruiseOf(slow.state,slow.player));
    assert.equal(slow.tricks.length,0,JSON.stringify(slow.tricks.map(t=>t.trickId)));
  }finally{slow.close();}
  const safe=await scene({pursuer:false});try{
    safe.step(240,tick=>{if(tick===20)safe.trap(20);});
    assert.equal(safe.tricks.length,0);assert.equal(safe.root()?.threatAtRoot,undefined);
  }finally{safe.close();}
});
async function pincer({moving=true,survival=false}={}){
  // The pursuer closes at 120 from 5.5 units off the player's line: its swept pass clears the
  // hull by ~1.6 (inside the 0.35-radius close-shave band, safely off contact). All speeds ride
  // the restored fast ceilings — the crossing must exceed 1.25 cruise, so the choreography is
  // scaled from the pre-restore 140/60 tune.
  const s=await scene({playerSpeed:280,z:24,closing:120,pursuerOffset:5.5,survival});
  const rate=moving?8:0;
  s.ship(1,{x:150,z:19},{x:0,z:-rate},{ai:{huntPlayer:true}});s.ship(1,{x:150,z:-19},{x:0,z:rate},{ai:{huntPlayer:true}});
  s.step(240,tick=>{if(tick===18)s.steerTo({x:150,z:-2},280);});
  return s;
}
test('Needle Thread: a 20-degree correction threads a closing pincer at speed; the subsumed Close Shave is not a second bonus',async()=>{
  const s=await pincer();try{
    const root=s.root(),needle=root?.nodes.find(n=>n.kind==='needle_crossing');
    assert.ok(needle,'the crossing between two moving hostile hulls is witnessed');
    assert.ok(needle.width>=1.1*12&&needle.width<=1.6*12&&Math.abs(needle.priorWidth-needle.width)>=0.2*12,JSON.stringify(needle));
    assert.equal(s.impacts.length,0);
    assert.equal(s.tricks.length,1,JSON.stringify(s.tricks.map(t=>t.trickId)));
    const trick=s.tricks[0];
    assert.equal(trick.trickId,'needle_thread');assert.equal(trick.pureEscape,true);
    assert.equal(root.escape.closeShave,true,`clearance ${root.escape.closestClearance}`);assert.equal(trick.modifiers.closeShave,false,'Needle Thread subsumes its own near miss');
    assert.equal(s.bridges.length,0,'no separate bridge for a subsumed miss');
  }finally{s.close();}
});
test('a parked gate is no Needle Thread: the same dodge past a stationary pair is only a Close Shave bridge that pays nothing',async()=>{
  const s=await pincer({moving:false,survival:true});try{
    const root=s.root();
    assert.equal(root?.needle,undefined);assert.equal(root?.escape?.completed,true);assert.equal(root.escape.closeShave,true);
    assert.equal(s.tricks.length,1);assert.equal(s.tricks[0].trickId,'near_miss');assert.equal(s.tricks[0].role,'bridge');assert.equal(s.tricks[0].baseScore,0);
    assert.equal(s.bridges.length,1);assert.equal(s.bridges[0].trickId,'near_miss');assert.equal(s.bridges[0].actorId,0);
    assert.equal(s.state.stunts.combo.acts.length,0,'a bridge never opens or pays a chain');
    assert.equal(s.state.stunts.combo.activePoints,0);
  }finally{s.close();}
});
