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
function start(f){assert.equal(f.engine.spawnWave(f.state),3);f.engine.onExplosion({pos:{x:150,z:0},radius:60,ownerId:f.player.id});}
function packet(f){const b=f.engine._bodies;return Array.from(b.alive,(_,i)=>i).filter(i=>b.alive[i]).map(i=>({x:b.px[i],z:b.pz[i],life:b.serial[i]}));}
test('first reinforcement comes down the existing pebble lane, not a disconnected world gate',()=>{
 const f=fixture();start(f);assert.equal(f.engine.spawnWave(f.state),18);for(const p of packet(f)){assert.ok(Math.hypot(p.x-165,p.z)<=30.001);assert.ok(p.x>f.stone.pos.x);}
});
test('a pilot sidestep does not drag the committed encounter gate along',()=>{
 const a=fixture(),b=fixture();start(a);start(b);b.player.pos.z=50;a.engine.spawnWave(a.state);b.engine.spawnWave(b.state);assert.deepEqual(packet(a),packet(b));
});
test('the next packet rotates around the encounter, not the new pilot position',()=>{
 const f=fixture();start(f);f.engine.spawnWave(f.state);f.player.pos.z=-60;tick(f,45);const next=packet(f).filter(p=>p.life>21);assert.equal(next.length,18);for(const p of next)assert.ok(Math.hypot(p.x-165/Math.sqrt(2),p.z-165/Math.sqrt(2))<31);
});
test('flying into the planned lane preserves current-pilot arrival clearance',()=>{
 const f=fixture();start(f);f.player.pos.x=115;f.player.vel.x=25;assert.ok(f.engine.spawnWave(f.state)>0);for(const p of packet(f)){assert.ok(Math.hypot(p.x-f.player.pos.x,p.z-f.player.pos.z)>=71.99999);assert.ok(Math.hypot(p.x-f.player.pos.x,p.z-f.player.pos.z)<=300);}
});
test('leaving local encounter retires the old anchor and uses ordinary safe gate placement',()=>{
 const f=fixture();start(f);f.player.pos.x=500;assert.equal(f.engine.spawnWave(f.state),18);for(const p of packet(f))assert.ok(Math.hypot(p.x-500,p.z+165)<=30.001);
});
test('replacement pilot cannot inherit an old encounter course',()=>{
 const f=fixture();start(f);const replacement={...f.player,pos:{x:0,z:0}};f.state.entities.set(f.player.id,replacement);f.state.entityList[0]=replacement;f.state.entityIndex.shipLike[0]=replacement;f.engine.spawnWave(f.state);for(const p of packet(f))assert.ok(Math.hypot(p.x,p.z+165)<=30.001);
});
test('throwing away the pebble does not teleport it or secretly recenter the course',()=>{
 const f=fixture();start(f);f.stone.pos.x=800;f.stone.vel.x=100;f.engine.spawnWave(f.state);assert.equal(f.stone.pos.x,800);for(const p of packet(f))assert.ok(Math.hypot(p.x-165,p.z)<=30.001);
});
test('translated opening course follows authored geometry instead of absolute world origin',()=>{
 const f=fixture();for(const e of f.state.entities.values()){e.pos.x+=900;e.pos.z-=600;}assert.equal(f.engine.spawnWave(f.state),3);f.engine.onExplosion({pos:{x:1050,z:-600},radius:60,ownerId:f.player.id});f.engine.spawnWave(f.state);for(const p of packet(f))assert.ok(Math.hypot(p.x-1065,p.z+600)<=30.001);
});
test('clear and next-wave preparation discard encounter orientation and anchor',()=>{
 const f=fixture();start(f);f.engine.spawnWave(f.state);f.state.run.wave=2;f.engine.prepareWave(f.state.run,2);assert.ok(f.engine.spawnWave(f.state)>18);assert.equal(f.engine.view.aliveCount+f.engine.view.pendingCount,swarmBroodPopulation(2));
});
import {createSimulation} from '../src/core/sim.js';
import {swarmArena} from '../src/systems/swarmArena.js';
import {physics} from '../src/core/physics.js';
test('native opening furniture produces a lane-aligned reinforcement that actually approaches the pilot',async t=>{
 const sim=createSimulation({seed:4242,systems:[swarmArena,physics]});t.after(()=>sim.dispose());const {state,bus}=sim;state.mode='flight';state.settings.gameplay.physicsBackend='rapier-dynamic';state.run={...createRunState({kind:'survival',ruleset:'swarm',seed:4242}),phase:'active',wave:1,arenaId:'helios_core'};
 const p=sim.spawn({type:'ship',pos:{x:0,z:0},vel:{x:0,z:0},radius:8,mass:40,hull:100,collides:true,data:{}});state.playerId=p.id;
 bus.emit('run:wavePlanned',{wave:1,plan:{swarm:{},openingLesson:{holdTicks:600}}});const lane=planSwarmOpeningVolley(state,state.run,1,plan(),3);assert.ok(lane);const d=Math.hypot(lane.points[0].x,lane.points[0].z),cx=lane.points[0].x/d*165,cz=lane.points[0].z/d*165;
 bus.emit('run:waveStarted',{wave:1});bus.emit('run:openingLessonReleased',{});assert.equal(await sim.registry.get('physics').prepareBackend(state),true);const engine=sim.registry.get('swarmArena')._brood;
 for(let i=0;i<185&&!engine.view.aliveCount;i++)sim.step(1/60);assert.equal(engine.view.aliveCount,3);noteSwarmPilotAction(state);for(let i=0;i<360;i++)sim.step(1/60);
 const b=engine._bodies,slots=Array.from(b.serial,(_,i)=>i).filter(i=>b.alive[i]&&b.serial[i]>=4);assert.equal(slots.length,18);for(const i of slots)assert.ok(Math.hypot(b.px[i]-cx,b.pz[i]-cz)<31);
 const distance=()=>slots.filter(i=>b.alive[i]).reduce((n,i)=>n+Math.hypot(b.px[i]-p.pos.x,b.pz[i]-p.pos.z),0)/slots.filter(i=>b.alive[i]).length;
 const before=distance();for(let i=0;i<30;i++)sim.step(1/60);assert.ok(distance()<before-1,'real flock pursuit leaves the arrival course toward the pilot');
});
test('a newly obstructed course defers unsafe or distant seats and recovers after clearance',()=>{
 const f=fixture();start(f);f.player.pos.z=-120;const blocker={id:99,type:'asteroid',alive:true,collides:true,pos:{x:165,z:0},vel:{x:0,z:0},radius:300};f.state.entities.set(99,blocker);f.state.entityList.push(blocker);f.state.entityIndex.asteroids.push(blocker);
 f.engine.spawnWave(f.state);assert.equal(f.engine.view.aliveCount,0);assert.equal(f.engine.view.pendingCount,97);f.state.entities.delete(99);f.state.entityList.pop();f.state.entityIndex.asteroids.pop();tick(f,45);assert.equal(f.engine.view.aliveCount,18);assert.equal(f.engine.view.pendingCount,79);for(const p of packet(f))assert.ok(Math.hypot(p.x-f.player.pos.x,p.z-f.player.pos.z)<=300.001);
});
test('departure and return during the beat cannot revive the retired course',()=>{
 const f=fixture();f.engine.spawnWave(f.state);f.player.pos.x=121;tick(f);f.player.pos.x=0;f.engine.onExplosion({pos:{x:150,z:0},radius:60,ownerId:f.player.id});assert.equal(f.engine.spawnWave(f.state),18);for(const p of packet(f))assert.ok(Math.hypot(p.x,p.z+165)<=30.001);
});
