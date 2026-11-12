import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import { queuePhysicsImpulse, resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { createBroodEngine } from '../src/systems/swarmBrood.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { planSwarmOpeningCrossfire } from '../src/systems/swarmOpeningCrossfire.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';
import { swarmBroodPopulation } from '../src/data/swarmBrood.js';

const DT = 1 / 60, TOTAL = swarmBroodPopulation(4);
const PLAN = [{ id: 'spitter', count: 58 }, { id: 'mite', count: 87 }];
function fixture({ wave = 4, arenaId = 'helios_core', tier = 0, mutators = [] } = {}) {
  const state = createGameState(4242);
  state.mode = 'flight'; state.rockCore = { ratingT: tier };
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
    phase: 'active', wave, arenaId, arenaMutators: mutators };
  const add = spec => {
    const e = { id: state.nextEntityId++, alive: true, collides: true, vel: { x: 0, z: 0 }, ...spec };
    state.entities.set(e.id, e); state.entityList.push(e); return e;
  };
  const player = add({ type: 'ship', pos: { x: 0, z: 0 }, radius: 8, mass: 40, hull: 100, data: {} });
  state.playerId = player.id;
  const rock = add({ type: 'asteroid', pos: { x: 88, z: 0 }, radius: 8, mass: 50,
    data: { swarmArenaDebris: true, openingPocket: true } });
  resolvePhysicsBodySpec(player); resolvePhysicsBodySpec(rock);
  const events = [];
  const engine = createBroodEngine({ getState: () => state,
    bus: { emit: (type, payload) => events.push({ type, payload }) } });
  engine.prepareWave(state.run, wave);
  return { state, player, rock, add, engine, events };
}
const layout = f => planSwarmOpeningCrossfire(f.state, f.state.run, f.state.run.wave, PLAN, 2.4, 3.4);

for (const mass of [221, 679, 1440, 2592]) test(`crossfire rejects native payload mass ${mass}`, () => {
 const f=fixture(); f.rock.physicsBody={...f.rock.physicsBody,mass};
 assert.equal(layout(f),null);
});
test('physical mass wins over a misleading entity mass',()=>{
 const f=fixture(); f.rock.mass=35;f.rock.physicsBody={...f.rock.physicsBody,mass:2592};assert.equal(layout(f),null);
 f.rock.mass=2592;f.rock.physicsBody={...f.rock.physicsBody,mass:35};assert.equal(layout(f)?.rockId,f.rock.id);
});
test('heavy original scenery yields to a genuine payload without changing either body',()=>{
 const f=fixture();f.rock.physicsBody={...f.rock.physicsBody,mass:2592};
 const other=f.add({...structuredClone(f.rock),id:30,pos:{x:0,z:100},mass:35,physicsBody:{...f.rock.physicsBody,mass:35}});
 const before=structuredClone(f.state.entityList);
 assert.equal(layout(f).rockId,other.id);assert.deepEqual(f.state.entityList,before);
});

test('actual continuation owner supplies an ordinary small stone instead of reauthoring heavy cover',t=>{
 const sim=createSimulation({seed:4242,systems:[swarmArena,combat,physics]});t.after(()=>sim.dispose());
 const {state,bus}=sim;state.mode='flight';state.rockCore={ratingT:0};
 state.run={...createRunState({kind:'survival',ruleset:'swarm',seed:4242}),phase:'active',wave:4,arenaId:'helios_core',arenaMutators:[]};
 const player=sim.spawn({type:'ship',pos:{x:0,z:0},vel:{x:0,z:0},rot:0,radius:8,mass:40,hull:100,hullMax:100,collides:true,data:{}});state.playerId=player.id;
 const heavy=sim.spawn({type:'asteroid',pos:{x:88,z:0},vel:{x:0,z:0},radius:9,mass:2592,physicsBody:{mass:679,radius:13.95,dynamic:true},hull:486,hullMax:486,collides:true,data:{swarmArenaDebris:true,terrainAnchor:true}});
 const arena=sim.registry.get('swarmArena'),engine=arena._brood;engine.prepareWave(state.run,4);
 resolvePhysicsBodySpec(heavy);const before=JSON.stringify(heavy);bus.emit('run:waveStarted',{wave:4});
 const stones=state.entityList.filter(e=>e.data?.openingContinuation===4);
 assert.equal(stones.length,1);assert.equal(JSON.stringify(heavy),before);
 assert.ok(resolvePhysicsBodySpec(stones[0]).mass<=220);
 assert.equal(engine.view.aliveCount,4);assert.equal(engine.view.pendingCount,141);
 assert.equal(planSwarmOpeningCrossfire(arena._openingPlacementState(state),state.run,4,PLAN,2.4,3.4)?.rockId,stones[0].id);
 bus.emit('run:waveStarted',{wave:4});assert.equal(state.entityList.filter(e=>e.data?.openingContinuation===4).length,1);
});
