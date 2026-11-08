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
import {swarmPlacementIsClear,findSwarmArrival} from '../src/systems/swarmSafety.js';
function bodies(f){const b=f.engine._bodies;return Array.from(b.alive,(_,i)=>i).filter(i=>b.alive[i]).map(i=>({x:b.px[i],z:b.pz[i],r:b.liveFamilyRadius[b.family[i]],life:b.serial[i]}));}
function minimum(ps){let n=Infinity;for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++)n=Math.min(n,Math.hypot(ps[i].x-ps[j].x,ps[i].z-ps[j].z)-ps[i].r-ps[j].r);return n;}
function release(f){f.engine.spawnWave(f.state);f.engine.onExplosion({pos:{x:150,z:0},radius:60,ownerId:f.player.id});f.engine.spawnWave(f.state);}
test('opening packet bodies have a real one-unit surface gap and remain in the planned disc',()=>{
 const f=fixture();release(f);assert.equal(f.engine.view.aliveCount,18);assert.ok(minimum(bodies(f))>=.9999);for(const p of bodies(f))assert.ok(Math.hypot(p.x-165,p.z)<=30.001);
});
test('reservation clearance is independent of solid-terrain clearance and defaults unchanged',()=>{
 const state={entities:new Map()},pos={x:6,z:0},reserved=[{alive:true,pos:{x:0,z:0},radius:2.4}];assert.equal(swarmPlacementIsClear(state,pos,2.4,{reserved,clearance:8}),false);assert.equal(swarmPlacementIsClear(state,pos,2.4,{reserved,clearance:8,reservedClearance:1}),true);
 state.entities.set(1,{id:1,type:'asteroid',alive:true,collides:true,pos:{x:0,z:0},radius:2.4});assert.equal(swarmPlacementIsClear(state,pos,2.4,{reserved,clearance:8,reservedClearance:1}),false);
});
test('invalid reservation override retains shared obstacle margin',()=>{
 const state={entities:new Map()},reserved=[{alive:true,pos:{x:0,z:0},radius:2.4}];for(const value of [NaN,-1,Infinity])assert.equal(swarmPlacementIsClear(state,{x:6,z:0},2.4,{reserved,clearance:8,reservedClearance:value}),false);
});
test('fixed cluster search does not rotate with a harmless pilot sidestep',()=>{
 const a=fixture(),b=fixture();a.engine.spawnWave(a.state);b.engine.spawnWave(b.state);b.player.pos.z=50;for(const f of [a,b]){f.engine.onExplosion({pos:{x:150,z:0},radius:60,ownerId:f.player.id});f.engine.spawnWave(f.state);}assert.deepEqual(bodies(a),bodies(b));
});
test('blocked local packet retains owed population instead of scattering into far seats',()=>{
 const f=fixture();f.engine.spawnWave(f.state);f.engine.onExplosion({pos:{x:150,z:0},radius:60,ownerId:f.player.id});const obstacle={id:90,type:'asteroid',alive:true,collides:true,pos:{x:165,z:0},vel:{x:0,z:0},radius:40};f.state.entities.set(90,obstacle);assert.equal(f.engine.spawnWave(f.state),0);assert.equal(f.engine.view.pendingCount,97);f.state.entities.delete(90);tick(f,45);assert.equal(f.engine.view.aliveCount,18);assert.equal(f.engine.view.pendingCount,79);
});
import {createSimulation} from '../src/core/sim.js';
import {swarmArena} from '../src/systems/swarmArena.js';
import {physics} from '../src/core/physics.js';
for(const seed of [4242,1,42,91])test(`native opening geometry and admission pace seed${seed}`,async t=>{
 const sim=createSimulation({seed,systems:[swarmArena,physics]});t.after(()=>sim.dispose());const {state,bus}=sim;state.mode='flight';state.settings.gameplay.physicsBackend='rapier-dynamic';state.run={...createRunState({kind:'survival',ruleset:'swarm',seed}),phase:'active',wave:1,arenaId:'helios_core'};const player=sim.spawn({type:'ship',pos:{x:0,z:0},vel:{x:0,z:0},radius:8,mass:40,hull:100,collides:true,data:{}});state.playerId=player.id;
 bus.emit('run:wavePlanned',{wave:1,plan:{swarm:{},openingLesson:{holdTicks:600}}});bus.emit('run:waveStarted',{wave:1});bus.emit('run:openingLessonReleased',{});await sim.registry.get('physics').prepareBackend(state);const engine=sim.registry.get('swarmArena')._brood;for(let i=0;i<185&&!engine.view.aliveCount;i++)sim.step(1/60);assert.equal(engine.view.aliveCount,3);noteSwarmPilotAction(state);
 const packets=[];let prior=engine.view.pendingCount,lastLife=3,minGap=Infinity;
 for(let i=1;i<=900&&prior;i++){sim.step(1/60);const n=engine.view.pendingCount;if(n<prior){const ps=bodies({engine}).filter(p=>p.life>lastLife);if(ps.length){minGap=Math.min(minGap,minimum(ps));lastLife=Math.max(...ps.map(p=>p.life));}packets.push([i,prior-n]);}prior=n;}
 t.diagnostic(JSON.stringify({seed,packets,minGap,pending:prior}));assert.equal(prior,0);assert.equal(packets.reduce((n,p)=>n+p[1],0),97);assert.ok(packets.every(p=>p[1]<=18));assert.ok(packets.at(-1)[0]<=675,'all remainder within11.25 active seconds, no sustained trickle');assert.ok(minGap>.9,'native frame preserves distinct arrival silhouettes');
});
