import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { createBus } from '../src/core/eventBus.js';
import { resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { createBroodEngine } from '../src/systems/swarmBrood.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';
import { swarmQuota, swarmConcurrent, resetSwarmPressureState } from '../src/data/swarmMode.js';
import { swarmBroodPopulation } from '../src/data/swarmBrood.js';
import { SWARM_FOUNDRY_SCORE, swarmFoundryRound } from '../src/data/swarmFoundryScore.js';
import { swarmRoundPreview } from '../src/data/swarmLadder.js';

const DT = 1 / 60;
const planFor = (wave, extra = {}) => planWave({ seed: 4242, arenaId: 'helios_core', wave, ruleset: 'swarm', ...extra });
function fixture(wave, withShipOwner = false) {
  resetSwarmPressureState();
  const state = createGameState(4242), bus = createBus(), events = [];
  state.mode = 'flight'; state.rockCore = { ratingT: 0 };
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
    phase: 'active', wave, arenaId: 'helios_core' };
  const emit = bus.emit.bind(bus);
  bus.emit = (type, payload) => { events.push({ type, payload, tick: state.tick }); emit(type, payload); };
  const add = spec => {
    const e = { id: state.nextEntityId++, alive: true, collides: true, vel: { x: 0, z: 0 }, ...spec };
    state.entities.set(e.id, e); state.entityList.push(e); return e;
  };
  const player = add({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 8, mass: 40,
    hull: 10000, data: {} });
  state.playerId = player.id;
  const rock = add({ type: 'asteroid', pos: { x: 88, z: 0 }, radius: 8, mass: 50,
    data: { swarmArenaDebris: true, openingPocket: true } });
  resolvePhysicsBodySpec(player); resolvePhysicsBodySpec(rock);
  const plan = planFor(wave);
  const engine = createBroodEngine({ getState: () => state, bus });
  engine.prepareWave(state.run, wave, plan);
  let ships;
  if (withShipOwner) {
    const budget = makeBudgetApi(state);
    ships = Object.create(survivalWave);
    ships.init({ state, bus, helpers: { spawnBudget: budget, spawnEntity: add } });
    bus.emit('run:wavePlanned', { wave, plan });
    bus.emit('run:waveStarted', { wave });
  }
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      state.tick++; state.simTime += DT;
      ships?.update(); engine.step(state);
    }
  };
  return { state, bus, events, add, player, rock, plan, engine, ships, tick };
}
function census(engine) {
  const b = engine._bodies, counts = {};
  for (let i = 0; i < b.alive.length; i++) if (b.alive[i]) {
    const id = b.liveFamilyId[b.family[i]]; counts[id] = (counts[id] || 0) + 1;
  }
  return counts;
}
const admitted = h => h.state.entityList.filter(e => e.data?.runCohort === 'survival' && e.type !== 'beacon');



for (const wave of [26,27,28]) test(`Mooring ${wave} preserves finite quota and original room`,()=>{
 const p=planFor(wave);assert.ok(!p.error,JSON.stringify(p));
 assert.equal(p.swarm.killTarget,swarmQuota(wave));assert.equal(p.swarm.concurrent,swarmConcurrent(wave));
 assert.equal(p.swarm.act.id,'mooring_line');assert.equal(p.swarm.act.round,wave-25);
 assert.equal(p.arenaPhase,{26:'loose_plate',27:'furnace_active',28:'shutter_slow'}[wave]);
 const preview=swarmRoundPreview({arenaId:'helios_core',wave,seed:4242,plan:p});
 assert.equal(preview.foreground.title,p.swarm.foundry.title);
 const specialist=p.packages.filter(p=>p.staged);assert.equal(specialist.length,wave===28?2:1);
 assert.ok(specialist.every(p=>p.atTick===0&&p.readAfterTicks===1));
 assert.ok(p.packages.filter(pkg=>!pkg.staged).every(pkg=>pkg.readAfterTicks===p.swarm.foundry.shipReadTicks));
 for(const extra of [{arenaId:'the_hive'},{mutators:['dense']},{circuitRound:1}]) assert.equal(swarmFoundryRound({arenaId:'helios_core',wave,...extra}),null);
});
for (const wave of [26,27,28]) test(`Mooring ${wave} specialist gets a real live read before debt arrives`,()=>{
 const h=fixture(wave,true);try{
 const reserved=()=>h.engine._splitter().reserve+h.engine._mother().reserve+h.engine._reserve().left+h.engine._hive().sacBudget+h.engine.view.machineReserve;
 assert.equal(h.engine.view.aliveCount+h.engine.view.pendingCount+reserved(),swarmBroodPopulation(wave));
 h.tick(300);assert.equal(admitted(h).length,0);assert.equal(h.engine.view.aliveCount,0);
 noteSwarmPilotAction(h.state);h.engine.spawnWave(h.state);h.tick(2);
 const expected={26:['bruiser_brawler'],27:['tether_control_raider'],28:['field_anchor_controller','tether_control_raider']}[wave];
 assert.deepEqual(admitted(h).map(e=>e.data.lootTableId).sort(),expected.sort());
 assert.equal(h.engine.view.aliveCount,0);
 h.state.mode='menu';h.tick(400);assert.equal(h.engine.view.aliveCount,0);assert.equal(admitted(h).length,expected.length);h.state.mode='flight';
 h.tick(h.plan.swarm.foundry.shipReadTicks+60);assert.ok(h.engine.view.aliveCount>0);assert.ok(admitted(h).length>expected.length);
 const removed=h.events.filter(e=>e.type==='swarm:broodKills').reduce((sum,e)=>sum+(e.payload.removedCount||0),0);
 assert.equal(h.engine.view.aliveCount+h.engine.view.pendingCount+removed+reserved(),swarmBroodPopulation(wave));
 assert.equal(h.events.filter(e=>e.type==='run:waveCleared').length,0);
 }finally{h.ships.destroy();h.engine.destroy?.();}
});
test('later Breaker Yard remains outside Foundry score',()=>{for(const w of [31,32,33,34])assert.equal(planFor(w).swarm.foundry,undefined);});
