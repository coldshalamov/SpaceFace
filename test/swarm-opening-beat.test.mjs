import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { mulberry32 } from '../src/core/rng.js';
import { swarmBroodPlan, swarmBroodPopulation } from '../src/data/swarmBrood.js';
import { planSwarmOpeningVolley } from '../src/systems/swarmOpeningVolley.js';
import { broodStreamSeed, createBroodEngine } from '../src/systems/swarmBrood.js';
function fixture({ seed = 4242, rock = true, wave = 1 } = {}) {
  const state = createGameState(seed);
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, radius: 6, mass: 20 };
  state.entities.set(1, player); state.entityList.push(player); state.playerId = 1;
  const stone = { id: 2, type: 'asteroid', alive: true, pos: { x: 88, z: 0 },
    vel: { x: 0, z: 0 }, radius: 8, collides: true, physicsBody: { dynamic: true },
    data: { swarmArenaDebris: true, openingPocket: true } };
  if (rock) { state.entities.set(2, stone); state.entityList.push(stone); }
  state.entityIndex = { __spacefaceEntityIndexV1: true, ready: true,
    asteroids: rock ? [stone] : [], shipLike: [player] };
  state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed });
  Object.assign(state.run, { phase: 'active', wave, arenaId: 'helios_core', arenaMutators: [] });
  state.mode = 'flight';
  const events = [];
  const engine = createBroodEngine({ getState: () => state,
    bus: { emit: (type, payload) => events.push({ type, payload }) } });
  engine.prepareWave(state.run, wave);
  return { state, engine, events, stone, player };
}
function tick(f, n = 1) {
  for (let i = 0; i < n; i++) { f.state.tick++; f.state.simTime += 1 / 60; f.engine.step(f.state); }
}
function plan(seed = 4242, wave = 1) {
  return swarmBroodPlan(wave, mulberry32(broodStreamSeed(seed, wave)));
}


function layout(f) { return planSwarmOpeningVolley(f.state,f.state.run,f.state.run.wave,plan(4242,f.state.run.wave),3); }

import {noteSwarmPilotAction} from '../src/systems/swarmSafety.js';
test('opening volley is a live three-body choice before full planned gate pressure',()=>{
 const f=fixture(),count=f.engine.spawnWave(f.state),v=f.engine.view;assert.equal(count,3);assert.equal(v.aliveCount,3);assert.equal(v.aliveCount+v.pendingCount,swarmBroodPopulation(1));const x=f.engine._bodies.px[0];tick(f,30);assert.equal(v.aliveCount,3);assert.notEqual(f.engine._bodies.px[0],x);assert.equal(f.engine.spawnWave(f.state),0);assert.equal(v.aliveCount+v.pendingCount,swarmBroodPopulation(1));
});
test('idle protection does not spend the six seconds, active play does',()=>{
 const f=fixture();f.engine.spawnWave(f.state);tick(f,420);assert.equal(f.engine.view.aliveCount,3);noteSwarmPilotAction(f.state);tick(f,359);assert.equal(f.engine.view.aliveCount,3);assert.ok(f.engine.view.pendingCount>0);tick(f);assert.ok(f.engine.view.aliveCount>3);assert.equal(f.engine.view.aliveCount+f.engine.view.pendingCount,swarmBroodPopulation(1));
});
test('clearing all three living targets releases the same remainder next owner tick',()=>{
 const f=fixture();f.engine.spawnWave(f.state);const n=f.engine.view.pendingCount;f.engine.onExplosion({pos:{x:150,z:0},radius:60,ownerId:f.player.id});assert.equal(f.engine.view.aliveCount,0);assert.equal(f.engine.view.pendingCount,n);tick(f);assert.equal(f.engine.view.aliveCount+f.engine.view.pendingCount,n);assert.ok(f.engine.view.aliveCount>3);assert.equal(f.events.filter(e=>e.type==='swarm:broodKills').reduce((n,e)=>n+e.payload.count,0),3);
});
for(const phase of ['pause','draft'])test(`${phase} does not silently spend opening combat time`,()=>{
 const f=fixture();f.engine.spawnWave(f.state);noteSwarmPilotAction(f.state);tick(f,120);if(phase==='pause')f.state.mode='pause';else f.state.run.phase='draft';tick(f,600);assert.equal(f.engine.view.aliveCount,3);f.state.mode='flight';f.state.run.phase='active';tick(f,239);assert.equal(f.engine.view.aliveCount,3);tick(f);assert.ok(f.engine.view.aliveCount>3);
});
for(const guard of ['no-rock','other-arena','later-wave','mutator'])test(`${guard} keeps immediate ordinary arrivals`,()=>{const f=fixture({rock:guard!=='no-rock',wave:guard==='later-wave'?2:1});if(guard==='other-arena')f.state.run.arenaId='cryo';if(guard==='mutator')f.state.run.arenaMutators=['test'];assert.ok(f.engine.spawnWave(f.state)>3);});
test('new wave discards old hold and pending population rather than carrying it forward',()=>{
 const f=fixture();f.engine.spawnWave(f.state);noteSwarmPilotAction(f.state);tick(f,60);f.state.run.wave=2;f.engine.prepareWave(f.state.run,2);const spawned=f.engine.spawnWave(f.state);assert.ok(spawned>3);assert.equal(spawned+f.engine.view.pendingCount,swarmBroodPopulation(2));
});
test('fresh engine reconstruction cannot inherit an old pending hold clock',()=>{
 const f=fixture();f.engine.spawnWave(f.state);noteSwarmPilotAction(f.state);tick(f,180);f.engine.clear();const restored=fixture();restored.state.run=structuredClone(f.state.run);restored.engine.prepareWave(restored.state.run,1);assert.equal(restored.engine.spawnWave(restored.state),3);noteSwarmPilotAction(restored.state);tick(restored,360);assert.ok(restored.engine.view.aliveCount>3);assert.equal(restored.engine.view.aliveCount+restored.engine.view.pendingCount,swarmBroodPopulation(1));
});
test('duplicate owner updates do not spend the beat clock twice',()=>{
 const f=fixture();f.engine.spawnWave(f.state);noteSwarmPilotAction(f.state);
 for(let i=0;i<600;i++)f.engine.step(f.state);
 assert.equal(f.engine.view.aliveCount,3);tick(f,359);assert.equal(f.engine.view.aliveCount,3);tick(f);assert.ok(f.engine.view.aliveCount>3);
});
test('interrupted empty trio cannot release through explicit spawn while paused',()=>{
 const f=fixture();f.engine.spawnWave(f.state);f.engine.onExplosion({pos:{x:150,z:0},radius:60,ownerId:f.player.id});f.state.mode='pause';assert.equal(f.engine.spawnWave(f.state),0);assert.equal(f.engine.view.aliveCount,0);f.state.mode='flight';tick(f);assert.ok(f.engine.view.aliveCount>3);
});
import {createSimulation} from '../src/core/sim.js';
import {swarmArena} from '../src/systems/swarmArena.js';
import {physics} from '../src/core/physics.js';
import {queuePhysicsImpulse} from '../src/core/physicsAuthority.js';
test('real opening lesson release admits the beat and run end retires its pending pack',t=>{
 const sim=createSimulation({seed:4242,systems:[swarmArena]});t.after(()=>sim.dispose());const {state,bus}=sim;state.mode='flight';state.run={...createRunState({kind:'survival',ruleset:'swarm',seed:4242}),phase:'active',wave:1,arenaId:'helios_core'};
 const p=sim.spawn({type:'ship',pos:{x:0,z:0},vel:{x:0,z:0},radius:8,mass:40,collides:true,hull:100,data:{}});state.playerId=p.id;
 bus.emit('run:wavePlanned',{wave:1,plan:{swarm:{},openingLesson:{holdTicks:600}}});const owner=sim.registry.get('swarmArena');bus.emit('run:waveStarted',{wave:1});assert.equal(owner._brood.view.aliveCount,0);bus.emit('run:openingLessonReleased',{});
 for(let i=0;i<185&&!owner._brood.view.aliveCount;i++){state.tick++;state.simTime+=1/60;owner.update(1/60,state);}
 assert.equal(owner._brood.view.aliveCount,3);assert.ok(owner._brood.view.pendingCount>0);bus.emit('run:ended',{});assert.equal(owner._brood.view.aliveCount,0);assert.equal(owner._brood.view.pendingCount,0);
});
test('native opening pebble remains usable against the live trio during the pressure beat',async t=>{
 const sim=createSimulation({seed:4242,systems:[swarmArena,physics]});t.after(()=>sim.dispose());const {state,bus}=sim;state.mode='flight';state.settings.gameplay.physicsBackend='rapier-dynamic';state.run={...createRunState({kind:'survival',ruleset:'swarm',seed:4242}),phase:'active',wave:1,arenaId:'helios_core'};
 const p=sim.spawn({type:'ship',pos:{x:0,z:0},vel:{x:0,z:0},radius:8,mass:40,collides:true,hull:100,data:{}});state.playerId=p.id;
 const rock=sim.spawn({type:'asteroid',pos:{x:88,z:0},vel:{x:0,z:0},radius:8,mass:50,collides:true,physicsBody:{dynamic:true,mass:50,radius:8},data:{swarmArenaDebris:true,openingPocket:true}});
 const engine=sim.registry.get('swarmArena')._brood;engine.prepareWave(state.run,1);assert.equal(engine.spawnWave(state),3);const pending=engine.view.pendingCount,kills=[];bus.on('swarm:broodKills',p=>kills.push(p));noteSwarmPilotAction(state);assert.equal(await sim.registry.get('physics').prepareBackend(state),true);
 // Fixture impulse stands in for a loaded swing; positions and live targets stay authored.
 queuePhysicsImpulse(rock,{x:6000,y:0,z:0},{kind:'test_opening_throw',actorId:p.id});
 for(let i=0;i<90&&!kills.length;i++)sim.step(1/60);
 assert.ok(rock.pos.x>88);assert.ok(kills.some(p=>p.cause==='collision'));assert.ok(engine.view.aliveCount<3);assert.equal(engine.view.pendingCount,pending,'partial clear does not release the full pack early');
});
