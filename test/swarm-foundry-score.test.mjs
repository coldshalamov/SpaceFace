import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { survivalArena } from '../src/systems/survivalArena.js';
import { createBroodEngine, BROOD_PHASE_WINDUP, BROOD_PHASE_DASH } from '../src/systems/swarmBrood.js';
import { createSwarmEventDirector } from '../src/systems/swarmEvents.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';
import { swarmQuota, swarmConcurrent, resetSwarmPressureState } from '../src/data/swarmMode.js';
import { swarmBroodPopulation } from '../src/data/swarmBrood.js';
import { SWARM_FOUNDRY_SCORE, swarmFoundryRound } from '../src/data/swarmFoundryScore.js';
import { swarmRoundPreview } from '../src/data/swarmLadder.js';
import { swarmMinorEventFor } from '../src/data/swarmEvents.js';

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

for (let wave = 1; wave <= 7; wave++) test(`round ${wave} owns one score without changing its finite debt`, () => {
  const p = planFor(wave);
  assert.ok(!p.error, JSON.stringify(p));
  assert.deepEqual(p.swarm.foundry, SWARM_FOUNDRY_SCORE[wave - 1]);
  assert.equal(p.swarm.killTarget, swarmQuota(wave));
  assert.equal(p.swarm.concurrent, swarmConcurrent(wave));
  assert.equal(p.completionRules.kind, 'cohort');
  assert.equal(p.objective.population, 'ships');
  assert.equal(p.swarm.massGap, undefined);
  const next = swarmRoundPreview({ arenaId: 'helios_core', wave, seed: 4242, plan: p });
  assert.equal(next.foreground.title, p.swarm.foundry.title);
  assert.equal(next.killTarget, p.swarm.killTarget);
  assert.equal(next.event, null);
});

test('other arenas, altered rooms, Circuit, Gauntlet and later waves retain their owners', () => {
  for (const options of [{ arenaId: 'the_hive' }, { mutators: ['heavies_only'] },
    { circuitRound: { kind: 'survive' } }]) assert.equal(planFor(6, options).swarm.foundry, undefined);
  assert.equal(planFor(11).swarm.foundry, undefined);
  assert.equal(planFor(7).swarm.character, undefined, 'the Bank is the round-seven foreground');
  assert.ok(planFor(19).swarm.character, 'later Kraken seats remain');
  assert.ok(planFor(7, { arenaId: 'the_hive' }).swarm.character);
  assert.ok(planFor(6, { arenaId: 'the_hive' }).swarm.massGap);
  assert.equal(swarmFoundryRound({ arenaId: 'helios_core', wave: NaN }), null);
});

test('Spitter and crossfire get active pilot time before the ship stream can enter', () => {
  for (const wave of [3, 4]) {
    const h = fixture(wave, true);
    h.engine.spawnWave(h.state);
    assert.equal(h.engine.view.aliveCount, wave === 3 ? 1 : 4);
    h.tick(600);
    assert.equal(admitted(h).length, 0, 'idle time does not consume the read');
    noteSwarmPilotAction(h.state);
    h.tick(359);
    assert.equal(admitted(h).length, 0);
    h.tick();
    assert.ok(admitted(h).length > 0);
    if (wave === 4) {
      assert.equal(h.ships._pending.some(x => x.entry.debut), true);
      h.tick(359);
      assert.equal(h.ships._pending.some(x => x.entry.debut), true);
      h.tick();
      assert.equal(h.ships._pending.some(x => x.entry.debut), false);
    }
    h.ships.destroy();
  }
});

test('Maw precedes its horde, Spore precedes Dart, and every planned body stays owed', () => {
  const h = fixture(5, true);
  assert.equal(h.ships._bossIds.size, 1, 'Maw materializes at the real owner');
  assert.equal(h.engine.spawnWave(h.state), 0);
  assert.equal(h.engine.view.pendingCount, swarmBroodPopulation(5));
  h.tick(600);
  assert.equal(h.engine.view.aliveCount, 0);
  assert.equal(h.ships._pending.some(x => x.entry.debut), true);
  noteSwarmPilotAction(h.state);
  h.tick(359);
  assert.equal(h.engine.view.aliveCount, 0);
  h.tick(100);
  assert.ok(h.engine.view.aliveCount > 0);
  assert.equal(census(h.engine).spore_drift || 0, 0);
  h.tick(120);
  assert.ok(census(h.engine).spore_drift > 0);
  assert.equal(h.ships._pending.some(x => x.entry.debut), true);
  h.tick(141);
  assert.equal(h.ships._pending.some(x => x.entry.debut), false);
  const deaths = h.events.filter(e => e.type === 'swarm:broodKills').reduce((sum, e) => sum + e.payload.removedCount, 0);
  assert.equal(h.engine.view.aliveCount + h.engine.view.pendingCount + deaths, swarmBroodPopulation(5));
  h.ships.destroy();
});

test('round six keeps its Jackal after the wreck read and does not build a competing wall', () => {
  const h = fixture(6, true);
  h.engine.spawnWave(h.state);
  assert.ok(h.engine.view.aliveCount <= 18);
  noteSwarmPilotAction(h.state); h.tick(479);
  assert.ok(h.ships._pending.some(x => x.entry.enemyId === 'mine_layer_jackal'));
  h.tick();
  assert.equal(h.ships._pending.some(x => x.entry.enemyId === 'mine_layer_jackal'), false);
  assert.equal(h.plan.swarm.massGap, undefined);
  h.ships.destroy();
});

test('the Bank spends three real lives and holds the horde and ships through its read', () => {
  const h = fixture(7, true);
  assert.equal(h.engine.spawnWave(h.state), 3);
  assert.deepEqual(census(h.engine), { charger: 2, spitter: 1 });
  assert.equal(h.engine.view.pendingCount, swarmBroodPopulation(7) - 3);
  assert.equal(admitted(h).length, 0);
  const slots = h.engine._bank().slots;
  h.tick(600);
  assert.equal(admitted(h).length, 0);
  assert.equal(h.engine.view.pendingCount, swarmBroodPopulation(7) - 3);
  assert.equal(h.engine._bank().phase, 'first');
  for (const [slot, life] of slots) {
    assert.equal(h.engine._bodies.serial[slot], life);
    assert.equal(h.engine._bodies.alive[slot], 1, 'idle cannot spend the first Bank pass');
    assert.ok(![BROOD_PHASE_WINDUP, BROOD_PHASE_DASH].includes(h.engine._bodies.phase[slot]));
  }
  assert.equal(h.events.some(e => e.type === 'swarm:broodTelegraph'), false);
  noteSwarmPilotAction(h.state); h.tick(479);
  assert.equal(admitted(h).length, 0);
  h.tick();
  assert.ok(admitted(h).length > 0);
  h.tick(60);
  assert.ok(h.engine.view.pendingCount < swarmBroodPopulation(7) - 3);
  h.ships.destroy();
});

test('blocked Bank uses finite paced fallback rather than withholding a round', () => {
  const h = fixture(7);
  h.rock.alive = false;
  assert.ok(h.engine.spawnWave(h.state) <= 18);
  assert.equal(h.engine.view.aliveCount + h.engine.view.pendingCount, swarmBroodPopulation(7));
  noteSwarmPilotAction(h.state); h.tick(900);
  assert.equal(h.engine.view.pendingCount, 0);
});

test('pause and repeated updates never spend a second score tick; same-seed retry resets it', () => {
  const h = fixture(3, true);
  h.engine.spawnWave(h.state); noteSwarmPilotAction(h.state); h.tick(120);
  const ticks = h.ships._foundryTicks;
  for (let i = 0; i < 500; i++) { h.ships.update(); h.engine.step(h.state); }
  assert.equal(h.ships._foundryTicks, ticks);
  h.state.mode = 'pause'; h.tick(600);
  assert.equal(h.ships._foundryTicks, ticks);
  h.state.mode = 'flight'; h.state.run.phase = 'draft'; h.tick(600);
  assert.equal(h.ships._foundryTicks, ticks);
  h.ships.newGame(); h.engine.clear('new_game');
  h.state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
    wave: 3, phase: 'active', arenaId: 'helios_core' };
  h.bus.emit('run:wavePlanned', { wave: 3, plan: h.plan });
  h.bus.emit('run:waveStarted', { wave: 3 });
  h.engine.prepareWave(h.state.run, 3, h.plan); h.engine.spawnWave(h.state);
  h.tick(600);
  assert.equal(h.ships._foundryTicks, 0);
  assert.equal(h.engine.view.pendingCount, swarmBroodPopulation(3) - 1);
  h.ships.destroy();
});

test('actual event owner obeys the plan and later minor preview matches its real draw', () => {
  const h = fixture(2);
  const director = createSwarmEventDirector({ state: h.state, bus: h.bus, helpers: {} });
  director.init();
  director.setPlan(h.plan, 2);
  h.bus.emit('run:waveStarted', { wave: 2 });
  assert.equal(h.events.some(e => e.type === 'swarm:eventTelegraphed'), false);
  h.bus.emit('run:waveCleared', { wave: 2 });
  h.state.run.wave = 12;
  director.setPlan(planFor(12), 12);
  h.bus.emit('run:waveStarted', { wave: 12 });
  const receipt = h.events.find(e => e.type === 'swarm:eventTelegraphed');
  assert.ok(receipt);
  const next = swarmRoundPreview({ arenaId: 'helios_core', wave: 12, seed: 4242 });
  assert.equal(next.event.name, receipt.payload.name);
  assert.equal(next.event.name, swarmMinorEventFor({ arenaId: 'helios_core', wave: 12, seed: 4242 }).name);
  director.destroy();
});

test('production Arena passes the same score into the native Bank and retains original rock identity', async t => {
  const sim = createSimulation({ seed: 4242, systems: [physics, swarmArena] });
  t.after(() => sim.dispose());
  const { state, bus } = sim; state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic'; state.render.sectorShellAdmission = false;
  assert.equal(await sim.registry.get('physics').prepareBackend(state), true);
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
    wave: 7, phase: 'active', arenaId: 'helios_core' };
  const player = sim.spawn({ type: 'ship', team: 0, alive: true, collides: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, mass: 40, hull: 100, data: {} });
  state.playerId = player.id;
  const arena = sim.registry.get('swarmArena');
  bus.emit('run:wavePlanned', { wave: 7, plan: planFor(7) });
  bus.emit('run:waveStarted', { wave: 7 });
  const engine = arena._brood;
  assert.equal(engine.view.aliveCount, 3);
  assert.equal(engine.view.pendingCount, swarmBroodPopulation(7) - 3);
  const rock = state.entityList.find(e => e.data?.bankOpportunity); assert.ok(rock);
  const rockId = rock.id;
  sim.step(DT);
  assert.equal(state.entities.get(rockId), rock);
});

// Direct director fixtures cannot establish host teardown/plan ordering.
test('the actual room host installs quiet-event policy after rearm and releases it next round', t => {
  const sim = createSimulation({ seed: 4242, systems: [survivalArena] });
  t.after(() => sim.dispose());
  const { state, bus } = sim; state.mode = 'flight';
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
    wave: 2, phase: 'active', arenaId: 'helios_core' };
  state.playerId = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, radius: 8, mass: 40, hull: 100, data: {} }).id;
  const events = []; bus.on('swarm:eventTelegraphed', p => events.push(p));
  bus.emit('run:wavePlanned', { wave: 2, plan: planFor(2) });
  bus.emit('run:waveStarted', { wave: 2 });
  assert.equal(events.length, 0);
  state.run.wave = 12;
  bus.emit('run:wavePlanned', { wave: 12, plan: planFor(12) });
  bus.emit('run:waveStarted', { wave: 12 });
  assert.equal(events.length, 1);
});

test('releasing a foreground read preserves the ordinary spacing between ship packets', () => {
  for (const wave of [2, 3, 4, 7]) {
    const h = fixture(wave, true); h.engine.spawnWave(h.state);
    h.tick(600); noteSwarmPilotAction(h.state); h.tick(900);
    const packets = h.events.filter(e => e.type === 'run:waveMaterialized' && e.payload.admitted > 0
      && !e.payload.debut);
    const ticks = [...new Set(packets.map(e => e.tick))];
    assert.ok(ticks.length >= 2, `round ${wave} has distinct arrivals`);
    // A specialist can have a separate score deadline; compare the ordinary
    // opening packages, identified by their index rather than roster names.
    const ordinary = packets.filter(e => e.payload.atTick < 240);
    const ordinaryTicks = [...new Set(ordinary.map(e => e.tick))];
    assert.ok(ordinaryTicks.length >= 2, `round ${wave} ordinary packets were observed`);
    for (let i = 1; i < ordinaryTicks.length; i++)
      assert.ok(ordinaryTicks[i] - ordinaryTicks[i - 1] >= 80, `round ${wave}: ${ordinaryTicks}`);
    h.ships.destroy();
  }
});
