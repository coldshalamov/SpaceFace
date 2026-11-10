// A minimum-ring point must not become permanently unsafe through sin/cos roundoff.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { mulberry32 } from '../src/core/rng.js';
import { makeBudgetApi, spawnBudget } from '../src/systems/spawnBudget.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { batchStreamSeed, materializeWaveBatch, gateBearing } from '../src/systems/waveMaterialization.js';
import { SWARM_MIN_ARRIVAL_WU, resetSwarmPressureState } from '../src/data/swarmMode.js';

const DT = 1 / 60;
const JACKAL = { ownerId: 'survival-wave:6', enemyId: 'mine_layer_jackal', count: 1, wave: 6, seed: 7,
  packageIndex: 3, batchIndex: 3, gateGroup: 'diagonal_a', distance: 230, swarm: true };

function room({ seed = 7, wave = 6, origin = { x: 0, z: 0 } } = {}) {
  resetSwarmPressureState();
  const state = createGameState(seed), bus = createBus();
  state.mode = 'flight';
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed }),
    phase: 'active', wave, arenaId: 'helios_core' };
  const budget = makeBudgetApi(state);
  const helpers = { spawnBudget: budget, spawnEntity(spec) {
    const e = { ...spec, id: state.nextEntityId++, alive: true, collides: true,
      pos: { ...spec.pos }, vel: { ...(spec.vel || { x: 0, z: 0 }) } };
    state.entities.set(e.id, e); state.entityList.push(e); return e;
  }, removeEntity(id) {
    const e = state.entities.get(id); if (!e) return;
    e.alive = false; state.entities.delete(id);
    state.entityList = state.entityList.filter(other => other !== e);
    bus.emit('entity:destroyed', { id, entity: e });
  } };
  bus.on('entity:destroyed', p => budget.releaseEntity(p.id, p.entity));
  const player = helpers.spawnEntity({ type: 'ship', pos: origin, radius: 8, mass: 40, data: {} });
  state.playerId = player.id;
  return { state, bus, helpers, budget, player };
}

function planned(seed, wave, swarmStake = 'exhibition') {
  return planWave({ seed, wave, swarmStake, swarmThreats: ['thick_pack'],
    ruleset: 'swarm', arenaId: 'helios_core' });
}

test('seed7 round6 Jackal admits at the strict screen boundary, deterministically', () => {
  const rng = mulberry32(batchStreamSeed(7, 6, 3, 3));
  const angle = Math.PI + (rng() - 0.5) * Math.PI / 16;
  const radius = Math.max(SWARM_MIN_ARRIVAL_WU, 230 * (1 + (rng() - 0.5) * 0.36));
  assert.equal(radius, SWARM_MIN_ARRIVAL_WU);
  assert.ok(Math.hypot(Math.cos(angle) * radius, Math.sin(angle) * radius) < radius,
    'the formerly rejected intended boundary point is reproduced');
  const poses = [];
  for (let repeat = 0; repeat < 3; repeat++) {
    const h = room(), before = { ...h.player.pos };
    const receipt = materializeWaveBatch(h, JACKAL);
    assert.equal(receipt.admitted, 1, 'an empty gate cannot defer its authored debut forever');
    assert.equal(receipt.deferred, undefined);
    const entity = h.state.entities.get(receipt.spawnedIds[0]);
    const d = Math.hypot(entity.pos.x, entity.pos.z);
    assert.ok(d >= SWARM_MIN_ARRIVAL_WU && d < SWARM_MIN_ARRIVAL_WU + 1e-5);
    assert.deepEqual(h.player.pos, before, 'placement does not move the pilot');
    assert.equal(h.budget.current(), 1);
    assert.equal(entity.data.runWave, 6);
    assert.equal(entity.data.ai.swarmFireHoldUntil, 2.5);
    poses.push(entity.pos);
  }
  assert.deepEqual(poses[0], poses[1]); assert.deepEqual(poses[1], poses[2]);
});

test('minimum-ring singles retain safe admissions at every gate and translated origins', () => {
  const gates = ['front', 'ne', 'diagonal_b', 'se', 'rear', 'sw', 'diagonal_a', 'nw'];
  for (const origin of [{ x: 0, z: 0 }, { x: 1200, z: -900 }, { x: -900000, z: 700000 }]) {
    for (let seed = 1; seed <= 24; seed++) for (const gateGroup of gates) {
      const h = room({ origin });
      const receipt = materializeWaveBatch(h, { ...JACKAL, seed, gateGroup, distance: 100 });
      assert.equal(receipt.admitted, 1, `${JSON.stringify({ origin, seed, gateGroup })}`);
      const e = h.state.entities.get(receipt.spawnedIds[0]);
      assert.ok(Math.hypot(e.pos.x - origin.x, e.pos.z - origin.z) >= SWARM_MIN_ARRIVAL_WU);
    }
  }
});

test('real obstruction still defers and releases its budget reservation, then safely retries', () => {
  const h = room();
  const rock = h.helpers.spawnEntity({ type: 'asteroid', radius: 1500, pos: { x: 0, z: 0 } });
  const denied = materializeWaveBatch(h, JACKAL);
  assert.equal(denied.admitted, 0); assert.equal(denied.deferred, 1);
  assert.equal(denied.reason, 'unsafe_arrival'); assert.equal(h.budget.current(), 0);
  h.helpers.removeEntity(rock.id);
  assert.equal(materializeWaveBatch(h, JACKAL).admitted, 1);
});

test('adventure and already-distant lone arrivals keep their exact seeded positions', () => {
  for (const swarm of [false, true]) {
    const h = room(), distance = 600;
    const rng = mulberry32(batchStreamSeed(7, 6, 3, 3));
    const bearing = gateBearing(JACKAL.gateGroup);
    const angle = Math.atan2(bearing.z, bearing.x) + (rng() - 0.5) * Math.PI / 16;
    const radius = distance * (1 + (rng() - 0.5) * 0.36);
    const expected = { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
    const receipt = materializeWaveBatch(h, { ...JACKAL, swarm, distance });
    assert.equal(receipt.admitted, 1);
    assert.deepEqual(h.state.entities.get(receipt.spawnedIds[0]).pos, expected);
  }
});

test('Foundry1–7 finite ship debt clears for four seeds and stakes after initial idle', () => {
  for (const seed of [1, 7, 4242, 99999]) for (const stake of ['exhibition', 'contender', 'veteran', 'ironbound']) {
    for (let wave = 1; wave <= 7; wave++) {
      const h = room({ seed, wave }), sys = Object.create(survivalWave), plan = planned(seed, wave, stake);
      sys.init(h);
      h.bus.emit('run:wavePlanned', { wave, plan }); h.bus.emit('run:waveStarted', { wave });
      let kills = 0;
      for (let tick = 0; tick < 2100 && !sys._cleared; tick++) {
        h.state.tick++; h.state.simTime += DT;
        h.state.input.fire = tick >= 900; // Actual input path, no direct first-act latch.
        sys.update();
        if (tick < 900) continue;
        for (const e of [...h.state.entityList]) if (e.alive !== false && e.type !== 'beacon'
          && e.data?.runCohort === 'survival') {
          e.alive = false; h.bus.emit('entity:killed', { id: e.id, tick: h.state.tick });
          h.helpers.removeEntity(e.id); kills++;
        }
      }
      assert.equal(sys._pending.length, 0, `${seed}/${stake}/${wave} pending`);
      assert.equal(sys._cleared, true, `${seed}/${stake}/${wave} clear`);
      assert.equal(kills, plan.swarm.killTarget, 'no quota reduction or fabricated extra body');
      assert.equal(h.budget.current(), 0, 'all entity-bound reservations release');
      sys.destroy();
    }
  }
});

test('ordinary wave owner admits the Jackal on the real native simulation clock', async t => {
  resetSwarmPressureState();
  const sim = createSimulation({ seed: 7, systems: [spawnBudget, survivalWave, physics] });
  t.after(() => sim.dispose());
  const { state, bus } = sim;
  state.mode = 'flight'; state.render.sectorShellAdmission = false;
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 7 }),
    wave: 6, phase: 'active', arenaId: 'helios_core' };
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 40, hull: 100, collides: true, data: {} });
  state.playerId = player.id; state.input.fire = true;
  const owner = sim.registry.get('physics');
  assert.equal(await owner.prepareBackend(state), true);
  const plan = planned(7, 6), admissions = [];
  bus.on('run:waveMaterialized', p => admissions.push(p));
  bus.emit('run:wavePlanned', { wave: 6, plan }); bus.emit('run:waveStarted', { wave: 6 });
  let jackal = null;
  for (let tick = 0; tick < 900 && !jackal; tick++) {
    sim.step(DT);
    for (const e of [...state.entityList]) if (e.alive !== false && e.type !== 'beacon'
      && e.data?.runCohort === 'survival') {
      if (e.data?.lootTableId === 'mine_layer_jackal') jackal = e;
      else {
        e.alive = false; bus.emit('entity:killed', { id: e.id, tick: state.tick });
        sim.helpers.removeEntity(e.id);
      }
    }
  }
  assert.ok(jackal, 'the actual finite schedule owes and admits its Jackal');
  assert.equal(admissions.filter(p => p.enemyId === JACKAL.enemyId && p.admitted > 0).length, 1);
  assert.ok(Math.hypot(jackal.pos.x - player.pos.x, jackal.pos.z - player.pos.z) >= SWARM_MIN_ARRIVAL_WU);
  assert.ok(owner._sg02.records.get(jackal.id)?.colliders.length > 0, 'real Rapier body exists');
  const flare = state.entityList.find(e => e.data?.swarmGateFlare
    && e.data?.gateGroup === JACKAL.gateGroup);
  assert.ok(flare, 'the native proof retains the real visible arrival flare');
  assert.equal(flare.physicsBody, false);
  assert.equal(flare.collides, false);
  assert.equal(owner._sg02.records.has(flare.id), false, 'a visual flare has no native body');
  for (let tick = 0; tick < 45; tick++) {
    sim.step(DT);
    assert.deepEqual(owner._sg02.sampleSolidContacts(jackal.id), []);
  }
  assert.ok(Math.hypot(jackal.vel.x, jackal.vel.z) < 0.001, 'no penetration impulse');
  assert.equal(Math.hypot(player.pos.x, player.pos.z), 0, 'stationary pilot stays put');
  t.diagnostic(JSON.stringify({ native: true, admittedAtTick: admissions.find(p => p.enemyId === JACKAL.enemyId && p.admitted > 0).tick,
    jackalDistance: Math.hypot(jackal.pos.x, jackal.pos.z), quota: plan.swarm.killTarget }));
});

test('an already-distant native arrival never collides with its own lit gate', async t => {
  const sim = createSimulation({ seed: 7, systems: [spawnBudget, survivalWave, physics] });
  t.after(() => sim.dispose());
  const { state } = sim;
  state.mode = 'flight'; state.render.sectorShellAdmission = false;
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 7 }),
    wave: 6, phase: 'active', arenaId: 'helios_core' };
  state.playerId = sim.spawn({ type: 'ship', pos: { x: 0, z: 0 }, radius: 8,
    mass: 40, hull: 100, data: {} }).id;
  const native = sim.registry.get('physics');
  assert.equal(await native.prepareBackend(state), true);
  const receipt = materializeWaveBatch(sim, { ...JACKAL, distance: 600 });
  assert.equal(receipt.admitted, 1, 'this distant arrival admitted before the ring fix too');
  sim.registry.get('survivalWave')._lightArrivalGate(receipt);
  const body = state.entities.get(receipt.spawnedIds[0]);
  const flare = state.entityList.find(e => e.data?.swarmGateFlare);
  assert.ok(flare, 'the flare is not removed to avoid testing it');
  for (let tick = 0; tick < 45; tick++) {
    sim.step(DT);
    assert.deepEqual(native._sg02.sampleSolidContacts(body.id), []);
    assert.ok(Math.hypot(body.vel.x, body.vel.z) < 0.001, 'no manufactured collision impulse');
  }
  assert.equal(native._sg02.records.has(flare.id), false);
});
