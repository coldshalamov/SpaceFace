// PB-SWARM-C — SF-067 breaking cover + SF-071 the sluice window.
//
// SF-067: a tagged cover rock wears under real impacts, fractures into two smaller remnant rocks
// that stay physical (colliding, census-owned, massline-throwable), and a remnant that breaks
// again dies without recursing — the room deforms, it never silently deletes.
// SF-071: on the Cinder Sluice the wave's room field is bound to the arena's warning/surge/calm
// machinery cycle — a periodic throw window that is telegraphed (geometry before force), has a
// safe region (outside the wedge), and applies the same law to player and enemy bodies. The pins
// here cover the ARENA path on a SWARM run; kernel-level same-law and phase purity are pinned by
// environmental-machinery.test.mjs and pq133-08-two-arenas.test.mjs.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { normalizeField, sampleFieldAcceleration } from '../src/core/fields/fieldKernel.js';
import { CINDER_SLUICE_FIELD } from '../src/data/environmentalMachinery.js';
import { COMBAT_LAB_ARENAS } from '../src/data/combatLabSetups.js';
import { SWARM_RULESET, swarmArenaPhase } from '../src/data/swarmMode.js';
import {
  CINDER_ARENA_ID,
  CINDER_CURRENT_STRENGTH,
} from '../src/systems/cinderSluiceArena.js';
import {
  ARENA_FIELD_SLOT_IDS,
  survivalArena,
} from '../src/systems/survivalArena.js';
import {
  SWARM_DEBRIS_TAG,
  swarmArena,
} from '../src/systems/swarmArena.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';

const SEED = 4242;
const HELIOS = 'helios_core';

// ---- SF-067 harness --------------------------------------------------------

function bootSwarmArena() {
  const state = createGameState(SEED);
  const bus = createBus();
  const heard = [];
  const rawEmit = bus.emit.bind(bus);
  bus.emit = (event, payload) => {
    heard.push({ event, payload });
    return rawEmit(event, payload);
  };
  const helpers = {
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = {
        ...spec,
        id,
        alive: true,
        pos: { x: spec.pos.x, z: spec.pos.z },
        vel: spec.vel ? { ...spec.vel } : { x: 0, z: 0 },
        data: { ...(spec.data || {}) },
      };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const player = {
    id: state.nextEntityId++, alive: true, type: 'ship',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;

  const ctx = { state, bus, helpers };
  runSession.init(ctx);
  survivalRun.init(ctx);
  swarmArena.init(ctx);
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: SWARM_RULESET, seed: SEED, arenaId: HELIOS });
  state.run.phase = 'active';
  return { state, bus, heard, player, system: swarmArena };
}

function wavePlan(wave) {
  return planWave({ seed: SEED, arenaId: HELIOS, wave, ruleset: SWARM_RULESET });
}

function debrisRocks(h) {
  return h.state.entityList.filter(
    (e) => e.type === 'asteroid' && e.alive !== false && e.data && e.data[SWARM_DEBRIS_TAG] === true,
  );
}

function impact(h, rockId, { speed = 40, dp = 330, tick = 0 } = {}) {
  h.bus.emit('physics:impact', {
    aId: rockId,
    bId: h.player.id,
    preSolveClosingSpeed: speed,
    dp,
    tick,
  });
}

// ---- SF-071 harness --------------------------------------------------------

function fakeFields() {
  const live = new Map();
  const writes = [];
  return {
    name: 'fields',
    live,
    writes,
    registerEnvironmental(spec) {
      const id = String(spec && spec.id != null ? spec.id : 'field');
      const record = { ...spec, id };
      live.set(id, record);
      return record;
    },
    registerExternal(spec) { return this.registerEnvironmental(spec); },
    unregisterExternal(id) { return live.delete(String(id)); },
    updateExternal(id, patch) {
      const record = live.get(String(id));
      if (!record || !patch) return null;
      writes.push({ id, patch: { ...patch } });
      Object.assign(record, patch);
      return record;
    },
    hasExternal(id) { return live.has(String(id)); },
  };
}

function bootCinderSwarm(wave) {
  const plan = planWave({ seed: SEED, arenaId: CINDER_ARENA_ID, wave, ruleset: SWARM_RULESET });
  assert.notEqual(plan.ok, false, `cinder swarm wave ${wave} must plan`);
  const state = {
    run: null,
    tick: 0,
    simTime: 0,
    playerId: 1,
    nextEntityId: 2,
    entities: new Map(),
  };
  state.entities.set(1, {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 400, z: -120 }, vel: { x: 0, z: 0 }, mass: 16, radius: 6,
  });
  const bus = createBus();
  const fields = fakeFields();
  const registry = { get: (name) => (name === 'fields' ? fields : null) };
  const run = createRunState({ kind: 'survival', ruleset: SWARM_RULESET, seed: SEED });
  run.arenaId = CINDER_ARENA_ID;
  run.phase = 'active';
  run.wave = wave;
  state.run = run;
  const system = Object.create(survivalArena);
  system.init({ state, bus, registry, helpers: {} });
  bus.emit('run:wavePlanned', { wave, plan, tick: 0 });
  return { system, state, bus, fields, plan };
}

// ---- SF-067 ---------------------------------------------------------------

test('cover wears only under real hits during a live fight — brushes and paused phases do not chip', () => {
  const h = bootSwarmArena();
  h.bus.emit('run:wavePlanned', { wave: 1, plan: wavePlan(1) });
  const rock = debrisRocks(h)[0];
  assert.ok(rock, 'wave 1 installs tagged cover');

  const hull0 = rock.hull;
  // A brush below the closing-speed floor is a nudge, not damage.
  impact(h, rock.id, { speed: 5, dp: 9999, tick: 0 });
  assert.equal(rock.hull, hull0, 'sub-floor brush must not chip');
  // A real hit chips: hull drops by dp / WEAR_DIV and the render seam mirrors it.
  impact(h, rock.id, { speed: 60, dp: 550, tick: 0 });
  assert.equal(rock.hull, hull0 - 5, 'a real hit wears hull');
  assert.equal(rock.data.oreHP, Math.max(0, Math.round(rock.hull)), 'oreHP mirrors hull');
  assert.ok(rock.data.miningWear > 0, 'wear is visible before the rock lets go');
  // The tick gap: a second impact inside the window does not double-chip the same rock.
  impact(h, rock.id, { speed: 60, dp: 550, tick: 5 });
  assert.equal(rock.hull, hull0 - 5, 'tick gap refuses a same-window second chip');
  impact(h, rock.id, { speed: 60, dp: 550, tick: 11 });
  assert.equal(rock.hull, hull0 - 10, 'the next window chips again');

  // Paused phases leave cover alone entirely.
  const saved = rock.hull;
  h.state.run.phase = 'draft';
  impact(h, rock.id, { speed: 60, dp: 9999, tick: 30 });
  assert.equal(rock.hull, saved, 'a non-active phase never wears cover');
  h.state.run.phase = 'active';
});

test('a worn-through rock fractures into two smaller throwable remnants, owned by the same census', () => {
  const h = bootSwarmArena();
  h.bus.emit('run:wavePlanned', { wave: 1, plan: wavePlan(1) });
  const rock = debrisRocks(h)[0];
  const parentDespawn = rock.data.despawnAt;
  const censusBefore = h.system._ids.length;

  rock.hull = 5;
  h.state.simTime = 100;
  impact(h, rock.id, { speed: 40, dp: 5500, tick: 0 });

  assert.equal(rock.alive, false, 'the parent lets go');
  const fractured = h.heard.find((e) => e.event === 'swarmArena:debrisFractured');
  assert.ok(fractured, 'fracture event emitted');
  assert.equal(fractured.payload.id, rock.id);
  assert.equal(fractured.payload.remnantIds.length, 2, 'two remnants');
  const chunked = h.heard.filter((e) => e.event === 'asteroid:chunked' && e.payload.parentId === rock.id);
  assert.equal(chunked.length, 2, 'one chunk receipt per remnant');
  assert.ok(
    h.heard.some((e) => e.event === 'asteroid:destroyed' && e.payload.id === rock.id),
    'the parent goes through the ordinary destroyed route',
  );

  let censusDelta = 0;
  for (const id of fractured.payload.remnantIds) {
    const rem = h.state.entities.get(id);
    assert.ok(rem && rem.alive !== false, `remnant ${id} is live`);
    assert.ok(rem.collides === true, 'remnant still collides');
    assert.ok(rem.radius < rock.radius, 'remnant is smaller than the parent');
    assert.equal(rem.data[SWARM_DEBRIS_TAG], true, 'remnant stays census-owned');
    assert.equal(rem.data.isChunk, true, 'remnant is marked so physics promotes it dynamic');
    assert.equal(rem.data.tetherPayload, true, 'the massline can pick it up');
    assert.equal(rem.data.terrainAnchor, true, 'remnant still anchors the room');
    assert.ok(
      Number.isFinite(rem.data.despawnAt) && rem.data.despawnAt <= parentDespawn,
      'remnant inherits the parent clock, never outlives it',
    );
    assert.ok(h.system._ids.includes(id), 'remnant joins the debris census');
    censusDelta++;
  }
  assert.equal(h.system._ids.length, censusBefore + censusDelta - 0,
    'census gains the remnants (the dead parent stays listed until the sweep counts it out)');

  // The room deforms, it does not vanish: next-wave setup keeps the remnants alive.
  h.bus.emit('run:wavePlanned', { wave: 2, plan: wavePlan(2) });
  for (const id of fractured.payload.remnantIds) {
    const rem = h.state.entities.get(id);
    assert.ok(rem && rem.alive !== false, 'remnant survives next-wave setup');
  }
});

test('a remnant that breaks again just dies — leftovers never recurse', () => {
  const h = bootSwarmArena();
  h.bus.emit('run:wavePlanned', { wave: 1, plan: wavePlan(1) });
  const rock = debrisRocks(h)[0];
  rock.hull = 5;
  impact(h, rock.id, { speed: 40, dp: 5500, tick: 0 });
  const fractured = h.heard.find((e) => e.event === 'swarmArena:debrisFractured');
  const remnantId = fractured.payload.remnantIds[0];
  const remnant = h.state.entities.get(remnantId);
  const chunksBefore = h.heard.filter((e) => e.event === 'asteroid:chunked').length;

  remnant.hull = 5;
  impact(h, remnantId, { speed: 40, dp: 5500, tick: 20 });

  assert.equal(remnant.alive, false, 'the remnant dies');
  assert.equal(
    h.heard.filter((e) => e.event === 'asteroid:chunked').length,
    chunksBefore,
    'a chunk breaking spawns no further chunks',
  );
  const lastFracture = h.heard.filter((e) => e.event === 'swarmArena:debrisFractured').pop();
  assert.deepEqual(
    lastFracture.payload.remnantIds,
    [],
    'a terminal break reports an empty remnant set — leftovers never recurse',
  );
});

test('run release hands debris to the engine sweep — a mid-fight rock is never yanked', () => {
  const h = bootSwarmArena();
  h.bus.emit('run:wavePlanned', { wave: 1, plan: wavePlan(1) });
  const rocks = debrisRocks(h);
  assert.ok(rocks.length > 0);
  h.system._release('test');
  for (const rock of rocks) {
    assert.ok(rock.alive !== false, 'release does not delete');
    assert.ok(Number.isFinite(rock.data.despawnAt), 'release sets the ordinary despawn clock');
  }
});

// ---- SF-071 ---------------------------------------------------------------

test('cinder is a public swarm route and its cycled phases bind the machinery window', () => {
  assert.ok(
    COMBAT_LAB_ARENAS.some((arena) => arena.id === CINDER_ARENA_ID),
    'cinder_sluice is a selectable arena on the public launch list',
  );
  const cycled = [];
  const steady = [];
  for (let wave = 1; wave <= 8; wave++) {
    const phase = swarmArenaPhase(wave);
    const plan = planWave({ seed: SEED, arenaId: CINDER_ARENA_ID, wave, ruleset: SWARM_RULESET });
    assert.notEqual(plan.ok, false, `cinder swarm wave ${wave} plans`);
    assert.equal(plan.arenaPhase, phase, 'the swarm plan carries its room phase');
    (['idle', 'shutter_slow', 'furnace_active', 'shutter_alternating'].includes(phase)
      ? cycled : steady).push(wave);
  }
  assert.ok(cycled.length >= 3, `cycled rooms exist in the swarm rotation (${cycled})`);
  assert.ok(steady.length >= 1, `steady rooms also exist (${steady})`);
});

test('the sluice window: field strength cycles warning->surge->calm inside a swarm wave', () => {
  const h = bootCinderSwarm(2); // furnace_active — a cycled room
  assert.equal(h.plan.arenaPhase, 'furnace_active');
  assert.equal(h.system._cycleMachinery, true, 'machinery window bound for this room');
  const field = h.fields.live.get(ARENA_FIELD_SLOT_IDS[0]);
  assert.ok(field, 'the room field is installed');

  const strengthAt = (simTime) => {
    h.state.simTime = simTime;
    h.system.update(1 / 60, h.state);
    return h.fields.live.get(ARENA_FIELD_SLOT_IDS[0]).strength;
  };

  // Unregulated machinery: 2s warning, 7s surge, 3s calm, 12s period.
  assert.equal(strengthAt(0.5), 0, 'warning: geometry before force');
  assert.equal(strengthAt(5), CINDER_CURRENT_STRENGTH, 'surge is the authored strength');
  assert.equal(strengthAt(10.5), 0, 'calm: the throw window closes');
  assert.equal(strengthAt(13.5), 0, 'period wraps back into warning');
  assert.equal(strengthAt(17), CINDER_CURRENT_STRENGTH, 'and surges again — deterministic');
  h.system.destroy();
});

test('a steady cinder room does not cycle — the window is bound to the phase, not the arena', () => {
  const h = bootCinderSwarm(1); // loose_plate — not a cycled room
  assert.equal(h.plan.arenaPhase, 'loose_plate');
  assert.equal(h.system._cycleMachinery, false, 'no window on an uncycled phase');
  const field = h.fields.live.get(ARENA_FIELD_SLOT_IDS[0]);
  assert.ok(field, 'the steady current is still installed');
  const authored = field.strength;
  h.state.simTime = 0.5;
  h.system.update(1 / 60, h.state);
  assert.equal(field.strength, authored, 'warning time does not silence a steady room');
  h.system.destroy();
});

test('the window is one physical law: surge carries both teams downstream, the wedge edge is safe', () => {
  const h = bootCinderSwarm(2);
  const record = h.fields.live.get(ARENA_FIELD_SLOT_IDS[0]);
  assert.ok(record, 'installed field');
  const field = normalizeField(record);
  const dir = field.dir;
  const perp = { x: -dir.z, z: dir.x };
  const inside = {
    x: field.center.x + dir.x * field.radius * 0.5,
    z: field.center.z + dir.z * field.radius * 0.5,
  };
  const outside = {
    x: field.center.x + perp.x * field.radius * 0.5,
    z: field.center.z + perp.z * field.radius * 0.5,
  };

  for (const profile of [
    { id: 1, type: 'ship', mass: 28, team: 0, fieldResponseMult: 1 },   // the player
    { id: 9, type: 'ship', mass: 90, team: 1, fieldResponseMult: 1 },   // an enemy
  ]) {
    const accel = sampleFieldAcceleration(inside, { x: 0, z: 0 }, [field], 0, profile, { ax: 0, az: 0 });
    assert.ok(
      accel.ax * dir.x + accel.az * dir.z > 0,
      `team ${profile.team} inside the wedge is carried downstream`,
    );
  }
  const outAccel = sampleFieldAcceleration(outside, { x: 0, z: 0 }, [field], 0,
    { id: 1, type: 'ship', mass: 28, team: 0, fieldResponseMult: 1 }, { ax: 0, az: 0 });
  assert.deepEqual(outAccel, { ax: 0, az: 0 }, 'outside the wedge is the safe region');
  h.system.destroy();
});
