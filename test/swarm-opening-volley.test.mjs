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
test('first pack places three ordinary mites beyond a real pebble without changing quota or furniture',()=>{
 const a=fixture(), b=fixture(); const lane=layout(a); assert.ok(lane);
 assert.equal(lane.rockId,2);const before=structuredClone(a.stone);
 const count=a.engine.spawnWave(a.state);b.engine.spawnWave(b.state);
 assert.equal(count+a.engine.view.pendingCount,swarmBroodPopulation(1));
 const bodies=a.engine._bodies;
 for(let i=0;i<3;i++){
  assert.equal(bodies.liveFamilyId[bodies.family[i]],'mite');
  assert.equal(bodies.px[i],lane.points[i].x);assert.equal(bodies.pz[i],lane.points[i].z);
 }
 assert.deepEqual(a.stone,before);assert.deepEqual(Array.from(bodies.px),Array.from(b.engine._bodies.px));
 const alive=Array.from(bodies.alive).reduce((n,x)=>n+x,0);
 a.engine.spawnWave(a.state);assert.equal(Array.from(bodies.alive).reduce((n,x)=>n+x,0),alive);
 tick(a);assert.notEqual(bodies.px[0],lane.points[0].x,'ordinary living flock moves; no target dummies');
});
for(const condition of ['missing','moving','dead','oversized','noncolliding','static','spent','later-wave','mutator','other-arena','upgraded'])test(`ordinary arrival fallback: ${condition}`,()=>{
 const f=fixture();
 if(condition==='missing')f.state.entities.delete(2);
 if(condition==='moving')f.stone.vel.x=20;
 if(condition==='dead')f.stone.alive=false;
 if(condition==='oversized')f.stone.radius=30;
 if(condition==='noncolliding')f.stone.collides=false;
 if(condition==='static')f.stone.physicsBody.dynamic=false;
 if(condition==='spent')f.stone.data.openingPocket=false;
 if(condition==='later-wave')f.state.run.wave=2;
 if(condition==='mutator')f.state.run.arenaMutators=['test'];
 if(condition==='other-arena')f.state.run.arenaId='cryo';
 if(condition==='upgraded')f.state.rockCore={ratingT:1};
 assert.equal(layout(f),null);
 const n=f.engine.spawnWave(f.state);assert.equal(n+f.engine.view.pendingCount,swarmBroodPopulation(1));
});
test('a moving obstruction rejects the whole trio, never a partial authored pack',()=>{
 const f=fixture();const lane=layout(f);const obstacle={id:3,type:'wreck',alive:true,collides:true,
  pos:{x:lane.points[2].x,z:lane.points[2].z+30},vel:{x:0,z:-60},radius:8};
 f.state.entities.set(3,obstacle);assert.equal(layout(f),null);
 f.engine.spawnWave(f.state);const b=f.engine._bodies;
 assert.notEqual(b.px[0],lane.points[0].x);
});
test('deterministic nearest safe pebble fallback and translated court',()=>{
 const f=fixture();const second={...structuredClone(f.stone),id:3,pos:{x:0,z:100}};
 f.state.entities.set(3,second);f.stone.vel.x=10;
 const lane=layout(f);assert.equal(lane.rockId,3);
 for(const e of f.state.entities.values()){e.pos.x+=1000;e.pos.z-=800;}
 const moved=layout(f);for(let i=0;i<3;i++){assert.equal(moved.points[i].x,lane.points[i].x+1000);assert.equal(moved.points[i].z,lane.points[i].z-800);}
});

import { createSimulation } from '../src/core/sim.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { physics } from '../src/core/physics.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';

test('actual opening pocket and wave release admit a lane without inventing a prop', t=>{
 const sim=createSimulation({seed:4242,systems:[swarmArena]});t.after(()=>sim.dispose());
 const {state,bus}=sim;state.mode='flight';
 state.run={...createRunState({kind:'survival',ruleset:'swarm',seed:4242,arenaId:'helios_core'}),phase:'active',wave:1,arenaId:'helios_core'};
 const p=sim.spawn({type:'ship',pos:{x:0,z:0},vel:{x:0,z:0},radius:8,mass:40,collides:true,hull:100,data:{}});state.playerId=p.id;
 bus.emit('run:wavePlanned',{wave:1,plan:{swarm:{},openingLesson:{holdTicks:600}}});
 const owner=sim.registry.get('swarmArena');
 const lane=planSwarmOpeningVolley(state,state.run,1,plan(),3);assert.ok(lane,'production opening furniture offers a clear lane');
 const rock=state.entities.get(lane.rockId);assert.ok(rock.data.openingPocket || rock.data.openingLesson);
 const before=state.entityList.length;
 bus.emit('run:waveStarted',{wave:1});
 assert.equal(owner._brood.view.aliveCount,0,'single-hull lesson is not interrupted');
 bus.emit('run:openingLessonReleased',{});
 for(let i=0;i<185;i++){state.tick++;state.simTime+=1/60;owner.update(1/60,state);if(owner._brood.view.aliveCount>0)break;}
 const b=owner._brood._bodies;assert.ok(Math.abs(b.px[0]-lane.points[0].x)<1);assert.ok(Math.abs(b.pz[0]-lane.points[0].z)<1);
 assert.equal(state.entityList.length,before,'no extra projectile, prop, or dummy');
});

test('native physical pebble crosses the authored living lane and produces the normal collision receipt',async t=>{
 const sim=createSimulation({seed:4242,systems:[swarmArena,physics]});t.after(()=>sim.dispose());
 const {state,bus}=sim;state.mode='flight';state.settings.gameplay.physicsBackend='rapier-dynamic';
 state.run={...createRunState({kind:'survival',ruleset:'swarm',seed:4242,arenaId:'helios_core'}),phase:'active',wave:1,arenaId:'helios_core'};
 const p=sim.spawn({type:'ship',pos:{x:0,z:0},vel:{x:0,z:0},radius:8,mass:40,collides:true,hull:100,data:{}});state.playerId=p.id;
 const rock=sim.spawn({type:'asteroid',pos:{x:88,z:0},vel:{x:0,z:0},radius:8,mass:50,collides:true,
  physicsBody:{dynamic:true,mass:50,radius:8},data:{swarmArenaDebris:true,openingPocket:true}});
 const owner=sim.registry.get('swarmArena'),engine=owner._brood;engine.prepareWave(state.run,1);engine.spawnWave(state);
 const b=engine._bodies;assert.equal(b.px[0],133);const life=b.serial[0];
 noteSwarmPilotAction(state);
 assert.equal(await sim.registry.get('physics').prepareBackend(state),true);
 const kills=[];bus.on('swarm:broodKills',x=>kills.push(x));
 // Physical owner route; injected test impulse substitutes for the player's loaded swing.
 // Neither the native rock nor the living pack is repositioned after admission.
 queuePhysicsImpulse(rock,{x:6000,y:0,z:0},{kind:'test_opening_throw',actorId:p.id});
 for(let i=0;i<90&&b.alive[0];i++)sim.step(1/60);
 assert.ok(rock.pos.x>88);assert.equal(b.serial[0],life);assert.equal(b.alive[0],0);
 assert.ok(kills.some(k=>k.cause==='collision'),'existing collision kill owner, not scripted death');
});

test('clear target seats never promise a throw through an intervening body',()=>{
 const f=fixture();const lane=layout(f);assert.ok(lane);
 f.state.entities.set(3,{id:3,type:'asteroid',alive:true,collides:true,pos:{x:110,z:0},vel:{x:0,z:0},radius:5});
 assert.equal(layout(f),null);
});
