import test from 'node:test';
import assert from 'node:assert/strict';
import { hash32,mulberry32 } from '../src/core/rng.js';
import { makeEntity } from '../src/core/entity.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { weapons } from '../src/systems/weapons.js';
import { combat } from '../src/systems/combat.js';
import { createCombatKernel } from '../src/combat/kernel.js';
import { stuntGrammar } from '../src/systems/stuntGrammar.js';
import { compileAttackSpec } from '../src/combat/attackSpec.js';
import { createLineage } from '../src/combat/attackLineage.js';
import { WEAPONS } from '../src/data/weapons.js';
import { bodyLife,journalFor } from '../src/combat/stuntEvidence.js';
import { sampleProjectileEvidence,serializeProjectileEvidence,restoreProjectileEvidence } from '../src/combat/stuntProjectileEvidence.js';
const DT=1/60;
async function scene(){const state=createGameState(14612);state.mode='flight';state.tick=0;state.simTime=0;state.entities.clear();state.entityList.length=0;state.entityIndex=null;state.playerId=0;state.settings.gameplay.physicsBackend='rapier-dynamic';state.world.currentSectorId=null;const bus=createBus(),events=[];for(const k of ['projectile:hit','combat:damage','entity:killed','combat:projectileConsequence','stunt:trickDetected'])bus.on(k,p=>events.push({k,p}));let nextId=0;
const spawn=spec=>{const e=makeEntity({id:nextId++,data:{},...spec});state.entities.set(e.id,e);state.entityList.push(e);bus.emit('entity:spawned',{id:e.id,entity:e});return e;};const player=spawn({type:'ship',team:0,pos:{x:0,z:0},radius:5,mass:16,hull:100,hullMax:100,maxSpeed:300,data:{encounter:{id:'projectile-proof'}}});
const helpers={hash32,mulberry32,getEntity:id=>state.entities.get(id),spawnEntity:spawn};const gun=Object.create(weapons);gun.init({state,bus,helpers});const kernel=createCombatKernel({state,bus,helpers});const fighting=Object.create(combat);Object.assign(fighting,{state,bus,helpers,kernel});bus.on('projectile:hit',p=>fighting.onHit(p));const grammar=Object.create(stuntGrammar);grammar.init({state,bus});const sim=Object.create(physics);sim.init({state,bus,helpers});sim._sg02=await createSg02DynamicBodyOwner({mode:'rapier-dynamic',fixedDt:DT});
return {state,bus,events,spawn,player,gun,kernel,sim,grammar,step(n=1){for(let i=0;i<n;i++){state.tick++;state.simTime=state.tick/60;for(const e of state.entityList)e.prevPos.copy(e.pos);sampleProjectileEvidence(state,bus);sim.update(DT,state);}},fire(owner,dir,{bank=false,weapon='wpn_siege_lance_l'}={}){const def=WEAPONS.find(w=>w.id===weapon),w={defId:def.id};const result=compileAttackSpec({weaponId:def.id,modifiers:bank?[['mod_bank_shot',1]]:[]});assert.equal(result.ok,true,JSON.stringify(result.issues));const spec=result.spec,lineage=createLineage({spec,createdTick:state.tick,sourceEntityId:owner.id});gun._spawnProjectile(owner,w,def,dir,null,false,state,{spec,liveRuntime:lineage});return state.entityList.at(-1);},close(){gun.destroy();grammar.destroy();kernel.destroy?.();sim._sg02.dispose();}};}
async function bankScene({fly=true,cover=true}={}){const s=await scene();s.player.vel.x=60;s.step(20);if(fly){s.sim._sg02.applyImpulse({entityId:0,impulse:{x:-960,z:960},provenance:{actorId:0},tick:s.state.tick,reason:'flight'});s.step(20);}else{s.step(20);}
const px=s.player.pos.x,pz=s.player.pos.z,combined=10.7,off=7.071067811865475,hit=100-Math.sqrt(combined**2-off**2),nx=(hit-100)/combined,nz=-off/combined,ox=1-2*nx*nx,oz=-2*nx*nz;
s.plate=s.spawn({type:'station',team:2,pos:{x:px+100,z:pz+off},radius:10,mass:1000,hull:10000,hullMax:10000,surfaceMaterial:'reflective',data:{}});
s.target=s.spawn({type:'ship',team:1,pos:{x:px+hit+ox*60,z:pz+oz*60},radius:5,mass:16,hull:100,hullMax:100,data:{encounter:{id:'projectile-proof'}}});
if(cover)s.spawn({type:'asteroid',pos:{x:px+50,z:pz+oz*30},radius:13,mass:1000,data:{}});
s.projectile=s.fire(s.player,0,{bank:true});s.step(25);return s;}
test('Bank Job: real flight, emitted shot, physical reflection, cover and routed kill',async()=>{const s=await bankScene();try{const hits=s.events.filter(e=>e.k==='projectile:hit');assert.ok(hits.length>=2,JSON.stringify(hits.map(e=>[e.p.targetId,e.p.pos])));assert.equal(s.target.alive,false);const receipts=s.events.filter(e=>e.k==='combat:projectileConsequence');assert.equal(receipts.length,1,JSON.stringify({shots:journalFor(s.state).projectiles.shots,contacts:journalFor(s.state).projectiles.contacts}));const tricks=s.events.filter(e=>e.k==='stunt:trickDetected');assert.equal(tricks.length,1);assert.equal(tricks[0].p.trickId,'bank_job');assert.equal(tricks[0].p.actorId,0);assert.equal(s.state.physicsRuntime.diagnostics.backend,'rapier-dynamic');}finally{s.close();}});
test('stationary/straight flight automatic banks and uncovered targets do not award',async()=>{for(const options of [{fly:false},{cover:false}]){const s=await bankScene(options);try{assert.equal(s.target.alive,false,'ordinary reflected damage remains lethal');assert.equal(s.events.filter(e=>e.k==='stunt:trickDetected').length,0,JSON.stringify(options));}finally{s.close();}}});
test('Return to Sender: actual hostile emission and applied Rapier impulse return the same bullet',async()=>{const s=await scene();try{s.player.pos.z=100;const owner=s.spawn({type:'ship',team:1,pos:{x:200,z:0},radius:5,mass:16,hull:100,hullMax:100,data:{encounter:{id:'return-proof'}}});const q=s.fire(owner,Math.PI);s.step(8);const originalOwnerLife=bodyLife(owner,s.state).id;const before=q.vel.x;s.sim._sg02.applyImpulse({entityId:q.id,impulse:{x:-2*before*q.mass,z:0},provenance:{actorId:0},tick:s.state.tick,reason:'impulse_charge'});assert.equal(q.ownerId,0);assert.equal(q.data.stuntProjectile.originalOwnerLife,originalOwnerLife);s.step(20);assert.equal(owner.alive,false);const tricks=s.events.filter(e=>e.k==='stunt:trickDetected');assert.equal(tricks.length,1,JSON.stringify({shots:journalFor(s.state).projectiles.shots,contacts:journalFor(s.state).projectiles.contacts}));assert.equal(tricks[0].p.trickId,'return_to_sender');assert.equal(tricks[0].p.secondaryIds[0],q.id);s.bus.emit('entity:killed',{id:owner.id,killerId:0});assert.equal(s.events.filter(e=>e.k==='stunt:trickDetected').length,1);}finally{s.close();}});
test('consumed projectile contacts survive a save as consumed; a pending shot restores only onto its own body',async()=>{const s=await bankScene();try{
  const before=s.events.filter(e=>e.k==='combat:projectileConsequence').length;assert.equal(before,1);
  const raw=serializeProjectileEvidence(s.state);const consumed=Object.values(raw.contacts).filter(c=>c.emitted);
  assert.equal(consumed.length,1,'the bank kill is a consumed contact record');assert.ok(consumed[0].death&&consumed[0].damage);
  assert.ok(Object.keys(raw.shots).length>=1);
  restoreProjectileEvidence(s.state,structuredClone(raw));
  const record=journalFor(s.state).projectiles;
  assert.equal(Object.values(record.contacts).filter(c=>c.emitted).length,1,'the consumed record is restored as consumed');
  assert.deepEqual(record.playerHistory,[]);assert.deepEqual(record.surfaceHistory,{});
  // Replaying the routed death for the same target cannot publish the consequence again.
  s.bus.emit('entity:killed',{id:s.target.id,killerId:0});s.bus.emit('combat:damage',{targetId:s.target.id,attackerId:0,hullDamage:50,before:{hull:100},after:{hull:50},origin:{stuntProjectileContactId:consumed[0].id,projectileLifeId:consumed[0].projectileLife}});
  assert.equal(s.events.filter(e=>e.k==='combat:projectileConsequence').length,1);
  assert.equal(s.events.filter(e=>e.k==='stunt:trickDetected').length,1);
  // A shot whose body no longer matches its saved life is dropped instead of inheriting provenance.
  const moved=structuredClone(raw);for(const shot of Object.values(moved.shots))shot.lifeId='life:forged';
  restoreProjectileEvidence(s.state,moved);
  assert.equal(Object.keys(journalFor(s.state).projectiles.shots).length,0);
  assert.equal(Object.keys(journalFor(s.state).projectiles.contacts).length,0,'contacts without their shot are dropped with it');
}finally{s.close();}});
