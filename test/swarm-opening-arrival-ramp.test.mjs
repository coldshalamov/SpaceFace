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
function release(f) {
 f.engine.spawnWave(f.state);
 f.engine.onExplosion({pos:{x:150,z:0},radius:60,ownerId:f.player.id});
 tick(f);
}
function conserve(f, killed=3) {assert.equal(f.engine.view.aliveCount+f.engine.view.pendingCount+killed,swarmBroodPopulation(1));}
test('early trio defeat admits one18-body packet rather than the remaining97 at once',()=>{
 const f=fixture();release(f);assert.equal(f.engine.view.aliveCount,18);assert.equal(f.engine.view.pendingCount,79);conserve(f);
 for(let i=0;i<200;i++)assert.equal(f.engine.spawnWave(f.state),0);assert.equal(f.engine.view.aliveCount,18);
});
test('six-second beat timeout enters same bounded ramp with the live trio retained',()=>{
 const f=fixture();f.engine.spawnWave(f.state);noteSwarmPilotAction(f.state);tick(f,360);assert.equal(f.engine.view.aliveCount,21);assert.equal(f.engine.view.pendingCount,79);conserve(f,0);
});
test('successive packets rotate existing gates and spend the finite authored population once',()=>{
 const f=fixture();release(f);const b=f.engine._bodies;
 const first={x:b.px[0],z:b.pz[0]};tick(f,44);assert.equal(f.engine.view.aliveCount,18);tick(f);assert.equal(f.engine.view.aliveCount,36);
 assert.ok(Math.hypot(b.px[18]-first.x,b.pz[18]-first.z)>80,'new gate is spatially distinct');
 for(let packet=0;packet<4;packet++){tick(f,45);conserve(f);}
 assert.equal(f.engine.view.pendingCount,0);assert.equal(f.engine.view.aliveCount,97);tick(f,90);conserve(f);assert.equal(f.engine.spawnWave(f.state),0);
});
for(const phase of ['pause','draft'])test(`${phase} preserves inter-packet time instead of returning a burst`,()=>{
 const f=fixture();release(f);tick(f,20);if(phase==='pause')f.state.mode='pause';else f.state.run.phase='draft';tick(f,600);assert.equal(f.engine.spawnWave(f.state),0);assert.equal(f.engine.view.aliveCount,18);f.state.mode='flight';f.state.run.phase='active';tick(f,24);assert.equal(f.engine.view.aliveCount,18);tick(f);assert.equal(f.engine.view.aliveCount,36);conserve(f);
});
test('duplicate tick and simulation-time jump cannot accumulate a catch-up spawn burst',()=>{
 const f=fixture();release(f);f.state.simTime+=1000;for(let i=0;i<500;i++)f.engine.step(f.state);assert.equal(f.engine.view.pendingCount,79);tick(f,45);assert.equal(f.engine.view.pendingCount,61);
});
test('new wave drops ramp clock; later ordinary population is not throttled',()=>{
 const f=fixture();release(f);f.state.run.wave=2;f.engine.prepareWave(f.state.run,2);assert.ok(f.engine.spawnWave(f.state)>18);assert.equal(f.engine.view.aliveCount+f.engine.view.pendingCount,swarmBroodPopulation(2));
});
test('invalid opening geometry retains existing immediate arrival behavior',()=>{
 const f=fixture({rock:false});assert.equal(f.engine.spawnWave(f.state),100);assert.equal(f.engine.view.pendingCount,0);
});
test('obstructed packet stays pending and recovers in bounded packets after clearance',()=>{
 const f=fixture();release(f);const blocker={id:90,type:'asteroid',alive:true,collides:true,pos:{x:0,z:0},vel:{x:0,z:0},radius:1000};f.state.entities.set(blocker.id,blocker);f.state.entityList.push(blocker);f.state.entityIndex.asteroids.push(blocker);
 tick(f,45);assert.equal(f.engine.view.pendingCount,79,'unsafe seats were not silently discarded');
 f.state.entities.delete(blocker.id);f.state.entityList.pop();f.state.entityIndex.asteroids.pop();tick(f,44);assert.equal(f.engine.view.pendingCount,79);tick(f);assert.equal(f.engine.view.pendingCount,61);
});
import {createSimulation} from '../src/core/sim.js';
import {swarmArena} from '../src/systems/swarmArena.js';
import {physics} from '../src/core/physics.js';
test('production opening furniture and lesson release reach staged arrivals on the native simulation clock',async t=>{
 const sim=createSimulation({seed:4242,systems:[swarmArena,physics]});t.after(()=>sim.dispose());const {state,bus}=sim;state.mode='flight';state.settings.gameplay.physicsBackend='rapier-dynamic';state.run={...createRunState({kind:'survival',ruleset:'swarm',seed:4242}),phase:'active',wave:1,arenaId:'helios_core'};
 const p=sim.spawn({type:'ship',pos:{x:0,z:0},vel:{x:0,z:0},radius:8,mass:40,hull:100,collides:true,data:{}});state.playerId=p.id;
 bus.emit('run:wavePlanned',{wave:1,plan:{swarm:{},openingLesson:{holdTicks:600}}});bus.emit('run:waveStarted',{wave:1});const engine=sim.registry.get('swarmArena')._brood;assert.equal(engine.view.aliveCount,0);bus.emit('run:openingLessonReleased',{});assert.equal(await sim.registry.get('physics').prepareBackend(state),true);
 for(let i=0;i<185&&!engine.view.aliveCount;i++)sim.step(1/60);assert.equal(engine.view.aliveCount,3);noteSwarmPilotAction(state);
 const admissions=[];let prior=engine.view.pendingCount;
 for(let i=0;i<650;i++){sim.step(1/60);const next=engine.view.pendingCount;if(next<prior)admissions.push({tick:state.tick,count:prior-next});prior=next;}
 assert.equal(admissions.reduce((n,p)=>n+p.count,0),97);assert.ok(admissions.every(p=>p.count>0&&p.count<=18));for(let i=1;i<admissions.length;i++)assert.equal(admissions[i].tick-admissions[i-1].tick,45);
 assert.equal(engine.view.pendingCount,0);bus.emit('run:ended',{});assert.equal(engine.view.aliveCount,0);
});
