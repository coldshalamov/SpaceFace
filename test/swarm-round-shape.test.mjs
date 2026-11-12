// S10 — the shape of a round.
//   * Arrivals enter through gates with a lit flare; no hostile materialises inside
//     1.3 screens of the pilot (AUDIT E4).
//   * The last three come to you: <=3 actionable hulls, all off-frame, commit to
//     pack_pursuit and are named on `swarm:lastThree` for edge pointers.
//   * ROUND N already rides `swarm:roundSlam` (Lane S). Waves run long enough to feel
//     like a round, not a burst — measured here under a scripted competent pilot.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { createSimulation } from '../src/core/sim.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { shouldSyncPhysicsBodyEntity } from '../src/core/physicsAuthority.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { makeEnemySpawnSpec } from '../src/systems/enemySpawnSpec.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { actions } from '../src/systems/actions.js';
import { weapons } from '../src/systems/weapons.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { combat } from '../src/systems/combat.js';
import {
  SWARM_GATE_FLARE_S,
  SWARM_LAST_THREE_DOCTRINE,
  SWARM_LAST_THREE_MAX,
  SWARM_LAST_THREE_OFFSCREEN_WU,
  SWARM_MIN_ARRIVAL_WU,
  SWARM_SPAWN_DISTANCE,
  resetSwarmPressureState,
} from '../src/data/swarmMode.js';

const DT = 1 / 60;
const ARENA = 'helios_core';
const SEED = 7;

// One wave's live room: a real swarm run state, the real wave owner, real spawn plumbing.
// Mirrors swarm-runtime-maturity's room() so the two suites read the same way.
function room(seed = SEED, wave = 1) {
  resetSwarmPressureState();
  const state = createGameState(seed);
  state.run = Object.assign(
    createRunState({ kind: 'survival', ruleset: 'swarm', seed }),
    { wave, phase: 'active' },
  );
  state.mode = 'flight';
  const bus = createBus();
  const events = [];
  const emit = bus.emit.bind(bus);
  bus.emit = (event, payload) => { events.push({ event, payload }); emit(event, payload); };
  const player = {
    id: state.nextEntityId++, type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, mass: 400, data: {},
  };
  state.playerId = player.id;
  state.entities.set(player.id, player);
  state.entityList.push(player);
  const budget = makeBudgetApi(state);
  bus.on('entity:destroyed', (p) => budget.releaseEntity(p.id, p.entity));
  const helpers = {
    spawnBudget: budget,
    spawnEntity(spec) {
      const e = {
        ...spec, id: state.nextEntityId++, alive: true,
        pos: { ...spec.pos }, vel: { ...(spec.vel || { x: 0, z: 0 }) },
      };
      state.entities.set(e.id, e);
      state.entityList.push(e);
      return e;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (!entity) return;
      entity.alive = false;
      state.entities.delete(id);
      state.entityList = state.entityList.filter((e) => e !== entity);
      bus.emit('entity:destroyed', { id, entity });
    },
  };
  const sys = Object.create(survivalWave);
  sys.init({ state, bus, helpers });
  return { state, bus, helpers, events, budget, player, sys };
}

function beginWave(h, wave = h.state.run.wave, seed = SEED) {
  const plan = planWave({ seed, arenaId: ARENA, wave, ruleset: 'swarm' });
  assert.ok(plan && plan.ok !== false, `wave ${wave} plans`);
  h.bus.emit('run:wavePlanned', { wave, plan });
  h.bus.emit('run:waveStarted', { wave });
  return plan;
}

function tick(h, n = 1) {
  for (let i = 0; i < n; i++) {
    h.state.simTime += DT;
    h.state.tick += 1;
    h.sys.update();
  }
}

function liveHostiles(h) {
  return h.state.entityList.filter((e) => e
    && e.alive !== false && e.data && e.data.runCohort === 'survival'
    && e.data.swarmGateFlare !== true && e.type !== 'beacon');
}

// The kill path the real emitters use: the body is dead before the receipt lands
// (SF-069), and its despawn then releases the spawn-budget slot it held — skipping
// the destroyed receipt would strand reservations and starve the arrival stream.
function kill(h, entity) {
  entity.alive = false;
  h.bus.emit('entity:killed', { id: entity.id, tick: h.state.tick });
  h.helpers.removeEntity(entity.id);
}

test('arrivals: every hostile materialises at or beyond the 1.3-screen line', () => {
  for (const wave of [1, 2, 3, 5]) {
    const h = room(SEED, wave);
    beginWave(h, wave);
    const born = [];
    // Watch the entity list grow across the whole arrival window and record each
    // hostile's own spawn position — the materialisation point, not where it drifted.
    const seen = new Set();
    for (let t = 0; t < 60 * 30; t++) {
      h.state.simTime += DT;
      h.state.tick += 1;
      h.sys.update();
      for (const e of liveHostiles(h)) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        born.push({ id: e.id, x: e.pos.x, z: e.pos.z });
      }
      if (h.sys._admittedTotal >= h.sys._plannedBodies && seen.size >= h.sys._plannedBodies) break;
    }
    assert.ok(born.length >= 5, `wave ${wave} fields a crowd (${born.length})`);
    for (const b of born) {
      const d = Math.hypot(b.x - h.player.pos.x, b.z - h.player.pos.z);
      assert.ok(
        d >= SWARM_MIN_ARRIVAL_WU,
        `wave ${wave} body ${b.id} materialised ${d.toFixed(1)} WU out (< ${SWARM_MIN_ARRIVAL_WU})`,
      );
    }
  }
});

test('gate flare: a one-second lit beacon stands where each group entered', () => {
  const h = room(SEED, 2);
  // The fixture retires entities from entityList outright, so count flare spawns on
  // the port itself — a swept flare still answers for its entrance.
  const spawned = [];
  const origSpawn = h.helpers.spawnEntity;
  h.helpers.spawnEntity = (spec) => {
    const e = origSpawn(spec);
    spawned.push(e);
    return e;
  };
  beginWave(h, 2);
  // Opening groups are spaced by the arrival gap so each reads as its own entrance.
  tick(h, 240);
  const materialized = h.events.filter((e) => e.event === 'run:waveMaterialized'
    && e.payload && e.payload.admitted > 0);
  assert.ok(materialized.length >= 2, 'the opening burst lands as visible groups');
  for (const m of materialized) {
    assert.ok(m.payload.arrival && Number.isFinite(m.payload.arrival.x),
      'the materialized receipt names the group entry point for presentation');
  }
  // The flares are swept a second after they light, so they are counted from the
  // spawn port's ledger — a still-alive one is at most the most recent group's.
  const flares = spawned.filter((e) => e.data && e.data.swarmGateFlare === true);
  assert.equal(flares.length, materialized.length, 'one flare per admitted group');
  for (const [index, flare] of flares.entries()) {
    assert.equal(flare.type, 'beacon');
    assert.equal(flare.data.storyPropKind, 'claim_beacon', 'the beacon lamp still recognizes the cue');
    assert.equal(flare.collides, false);
    assert.equal(shouldSyncPhysicsBodyEntity({ ...flare, alive: true }), false,
      'the gate marker has no physics body even during its lit lifetime');
    assert.equal(flare.data.masslineTetherable, false);
    const ttl = flare.data.despawnAt - (flare.data.expireAt - SWARM_GATE_FLARE_S);
    assert.ok(ttl > 0.9 && ttl <= SWARM_GATE_FLARE_S + 1e-6,
      `flare lives ~${SWARM_GATE_FLARE_S}s (got ${ttl})`);
    // Flares and materialized receipts are produced in the same batch order.
    const { wave, gateGroup, arrival } = materialized[index].payload;
    assert.equal(flare.data.wave, wave);
    assert.equal(flare.data.gateGroup, gateGroup);
    assert.deepEqual(flare.pos, { x: arrival.x, z: arrival.z });
  }
  // Every flare still in the entity store is inside its promised second — the sweep
  // retires the rest rather than leaving spent lights on the field.
  const now = h.state.simTime;
  for (const e of h.state.entityList) {
    if (e.data && e.data.swarmGateFlare === true) {
      assert.ok(e.data.despawnAt > now, 'an alive flare is still within its second');
    }
  }
});

test('one gate per group: opening groups arrive on distinct bearings (waves 1-3)', () => {
  for (const wave of [1, 2, 3]) {
    const h = room(SEED, wave);
    const plan = beginWave(h, wave);
    // C01-04: the course authors the groups — the law is that each lands on its own
    // bearing (round 1's ten-Wasp charge is one group, one gate; rounds 2-3 spread).
    const opening = plan.packages.filter((p) => Number.isInteger(p.atTick));
    const gates = new Set(opening.map((p) => p.gateGroup).filter(Boolean));
    assert.equal(gates.size, opening.length,
      `wave ${wave} gives every scheduled group its own gate (${[...gates]})`);
    tick(h, 90);
    const byGate = new Map();
    for (const m of h.events.filter((e) => e.event === 'run:waveMaterialized')) {
      const g = m.payload.gateGroup;
      byGate.set(g, (byGate.get(g) || 0) + 1);
    }
    // Every admitted group reports exactly one gate — a group never splits across doors,
    // and every group due inside the window has reported.
    const due = opening.filter((p) => p.atTick < 90).length;
    assert.equal(byGate.size, due, `wave ${wave} groups came through ${byGate.size} gates`);
  }
});

test('the last three commit to pack_pursuit and are named once for edge pointers', () => {
  const h = room(SEED, 1);
  beginWave(h, 1);
  tick(h, 30);
  const hostiles = liveHostiles(h);
  assert.ok(hostiles.length >= 4, 'the wave fields more than the last-three band');
  // Resolve all but three, then park the survivors 400 WU out — off-frame, parked.
  for (const e of hostiles.slice(3)) kill(h, e);
  const tail = liveHostiles(h);
  assert.equal(tail.length, 3);
  const bearings = [[1, 0], [-0.7, 0.7], [0, -1]];
  tail.forEach((e, i) => {
    const [ux, uz] = bearings[i];
    e.pos.x = h.player.pos.x + ux * 400;
    e.pos.z = h.player.pos.z + uz * 400;
    e.data.ai = e.data.ai || {};
  });
  tick(h, 2);
  const calls = h.events.filter((e) => e.event === 'swarm:lastThree');
  assert.equal(calls.length, 1, 'the pointer receipt fires once');
  assert.equal(calls[0].payload.ids.length, 3);
  for (const e of tail) {
    assert.equal(e.data.ai.combatDoctrineId, SWARM_LAST_THREE_DOCTRINE,
      'committed hull grinds in on pack_pursuit');
    assert.equal(e.data.ai.swarmLastStand, true);
  }
  // An on-screen tail leaves the fight alone.
  const h2 = room(SEED + 1, 1);
  beginWave(h2, 1);
  tick(h2, 30);
  const hostiles2 = liveHostiles(h2);
  for (const e of hostiles2.slice(3)) kill(h2, e);
  const tail2 = liveHostiles(h2);
  tail2[0].pos.x = h2.player.pos.x + 100; // inside the frame
  tail2[0].pos.z = h2.player.pos.z;
  tail2[1].pos.x = h2.player.pos.x + 400;
  tail2[1].pos.z = h2.player.pos.z;
  tail2[2].pos.x = h2.player.pos.x - 400;
  tail2[2].pos.z = h2.player.pos.z;
  tick(h2, 2);
  assert.equal(h2.events.filter((e) => e.event === 'swarm:lastThree').length, 0,
    'a hull still in frame keeps the whole pack honest — no commit');
});

test('committed hulls actually close: 3 parked at 400 WU are inside 200 WU within 8 s', async () => {
  const sim = createSimulation({
    seed: 4242,
    systems: [combat, createTacticalAISystem(), actions, flightV3, weapons, aiPorts],
    updateOrder: [],
  });
  const native = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  sim.helpers.combatPhysics = native;
  try {
    const state = sim.state;
    state.mode = 'flight';
    state.physicsRuntime = { diagnostics: { backend: 'rapier-dynamic', sg02Ready: true } };
    const player = sim.spawn({
      type: 'ship', isPlayer: true, team: 0, pos: { x: 0, z: 0 },
      radius: 8, mass: 100, hull: 100, hullMax: 100, collides: true,
      physicsBody: { schemaVersion: 1, dynamic: true, shape: 'ball', radius: 8, mass: 100, inertiaY: 3200 },
    });
    state.playerId = player.id;
    const bearings = [[1, 0], [-0.7, 0.7], [0, -1]];
    const tail = bearings.map(([ux, uz], i) => {
      const spec = makeEnemySpawnSpec('wasp_swarmer', 1, { x: ux * 400, z: uz * 400 }, {});
      const e = sim.spawn(spec);
      e.data = e.data || {};
      e.data.runCohort = 'survival';
      e.data.ai = e.data.ai || {};
      // The cohort admission block from waveMaterialization, verbatim where it
      // matters for flight: lawful would spawn the hull inert on the arena floor.
      e.data.ai.spawnContext = 'encounter';
      e.data.ai.forcePlayerTarget = true;
      e.data.ai.huntPlayer = true;
      e.data.ai.moraleImmune = true;
      e.data.ai.surrenderImmune = true;
      e.data.ai.activity = { kind: 'attack_run', reason: 'survival_pursuit', targetId: player.id, anchor: null };
      e.data.combat = { targetId: player.id };
      e.data.ai.lawful = false;
      e.data.ai.roe = 'weapons_free';
      e.data.ai.motive = 'arena_contract';
      e.data.ai.engagementTrigger = 'authorized_hostile_spawn';
      // What _commitLastThree writes: the pursuit doctrine plus the stand marker.
      e.data.ai.combatDoctrineId = SWARM_LAST_THREE_DOCTRINE;
      e.data.ai.swarmLastStand = true;
      return e;
    });
    native.syncFromEntities(state.entityList);
    state.input.actions = {};
    state.input.aimAngle = 0;
    state.input.fire = false;
    const tai = sim.registry.get('tacticalAI');
    const fly = sim.registry.get(flightV3.name);
    const ports = sim.registry.get('aiPorts');
    const act = sim.registry.get('actions');
    // The pack grinds in on press-and-orbit beats, so a committed hull crosses the
    // 200 WU line on the way to its ring rather than parking on it — "within 200
    // WU in ≤8 s" reads as crossing, which is what ends the hunting.
    const closest = new Map(tail.map((e) => [e.id, Infinity]));
    for (let t = 0; t < 8 * 60; t++) {
      state.simTime += DT;
      state.tick += 1;
      state.spatialHash.rebuild(state.entityList);
      tai.update(DT, state);
      act.update(DT, state);
      fly.update(DT, state);
      ports.update(DT, state);
      native.step(DT, state.tick);
      for (const e of tail) {
        const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
        if (d < closest.get(e.id)) closest.set(e.id, d);
      }
    }
    for (const e of tail) {
      assert.ok(closest.get(e.id) < 200,
        `committed hull's closest approach was ${closest.get(e.id).toFixed(1)} WU (< 200)`);
    }
  } finally {
    sim.dispose();
  }
});

test('wave lengths: waves 1-6 play long enough to be rounds, not bursts', () => {
  const durations = [];
  // Wave 5 is the cadence boss round: its length is the champion fight, not the
  // chaff arc, and it owes no quota — the round-band check is for the quota waves.
  for (let wave = 1; wave <= 6; wave++) {
    if (wave === 5) continue;
    const h = room(SEED + wave, wave);
    beginWave(h, wave);
    // Scripted competence: ~0.55 resolved kills a second, always the nearest
    // threat — a decent pilot on a starter kit once dodging and repositioning
    // are priced in, not a bench-optimised one.
    let clearTick = null;
    for (let t = 0; t < 60 * 240; t++) {
      h.state.simTime += DT;
      h.state.tick += 1;
      h.sys.update();
      if (t % 110 === 30) {
        const live = liveHostiles(h);
        if (live.length > 0) {
          live.sort((a, b) =>
            ((a.pos.x - h.player.pos.x) ** 2 + (a.pos.z - h.player.pos.z) ** 2)
            - ((b.pos.x - h.player.pos.x) ** 2 + (b.pos.z - h.player.pos.z) ** 2));
          kill(h, live[0]);
        }
      }
      const cleared = h.events.find((e) => e.event === 'run:waveCleared');
      if (cleared) { clearTick = t; break; }
    }
    assert.ok(clearTick != null, `wave ${wave} clears under a competent pilot`);
    durations.push({ wave, seconds: +(clearTick / 60).toFixed(1) });
  }
  console.table(durations);
  for (const { wave, seconds } of durations) {
    // Wave 1 is the pinned 15-body lesson wave — it resolves in ~half a minute by
    // design; the 60–90 s band starts at wave 2.
    const floor = wave === 1 ? 20 : 45;
    assert.ok(seconds >= floor && seconds <= 100,
      `wave ${wave} ran ${seconds}s — outside the ${floor}-100s round band (target 60-90)`);
  }
});
