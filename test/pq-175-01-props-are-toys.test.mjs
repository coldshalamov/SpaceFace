// PQ-175.01 — each arena's props are toys. Seed 17510.
// Three usable props per room; a scenario uses them to kill or escape.
// Hazards move mass (debris / debris_current / nebula). Never radiation.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import {
  ARENA_MODULE_LIBRARY,
  ARENA_TOY_DT,
  ARENA_TOY_HAZARDS,
  ARENA_TOY_LIGHT_MASS,
  ARENA_TOY_LIGHT_RADIUS,
  ARENA_TOY_MAX,
  ARENA_TOY_MIN,
  CRUSHER_CYCLE,
  listArenaToys,
  playArenaToyScenario,
  previewArenaModule,
  validateArenaModuleLibrary,
  validateArenaToys,
} from '../src/data/arenaModuleLibrary.js';
import { CINDER_ARENA_ID } from '../src/systems/cinderSluiceArena.js';
import { CRYO_ARENA_ID } from '../src/systems/cryoDriftArena.js';
import { LAGRANGE_ARENA_ID } from '../src/systems/lagrangeCrucible.js';
import { mines } from '../src/systems/mines.js';
import { STORM_ARENA_ID } from '../src/systems/stormLatticeArena.js';
import {
  ARENA_FIELD_SLOT_IDS,
  dominantGate,
  planArenaInstall,
  survivalArena,
} from '../src/systems/survivalArena.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';

const SEED = 17510;
const ARENAS = [LAGRANGE_ARENA_ID, CINDER_ARENA_ID, CRYO_ARENA_ID, STORM_ARENA_ID];

function formatRow(row) {
  return [
    `PQ-175.01 seed=${row.seed}`,
    `arena=${row.arenaId}`,
    `toys=${row.used.join(',')}`,
    `killed=${row.killed}`,
    `escaped=${row.escaped}`,
    `hazards=${row.hazards.join(',')}`,
    `ok=${row.ok}`,
  ].join(' ');
}

test('library still names four laws and idle rooms stay inside two field slots', () => {
  const check = validateArenaModuleLibrary();
  assert.equal(check.ok, true, JSON.stringify(check.issues));
  assert.equal(ARENA_MODULE_LIBRARY.length, 4);
  for (const mod of ARENA_MODULE_LIBRARY) {
    const preview = previewArenaModule(mod.id, 'idle');
    assert.equal(preview.ok, true, mod.id);
    assert.ok(preview.fieldCount <= 2, `${mod.id} field budget`);
    assert.ok(preview.toyCount <= ARENA_TOY_MAX, `${mod.id} toy budget`);
  }
});

test('per arena idle install authors three toys and never radiation', () => {
  for (const arenaId of ARENAS) {
    const preview = previewArenaModule(arenaId, 'idle');
    const toys = listArenaToys(preview.install);
    assert.ok(toys.length >= ARENA_TOY_MIN, `${arenaId} toy count ${toys.length}`);
    const check = validateArenaToys(toys);
    assert.equal(check.ok, true, `${arenaId} ${JSON.stringify(check.issues)}`);
    for (const toy of toys) {
      assert.ok(ARENA_TOY_HAZARDS.includes(toy.hazardType), `${arenaId} ${toy.id} hazard`);
      assert.notEqual(toy.hazardType, 'radiation');
    }
  }
});

test('seed 17510: each arena uses three props to kill or escape', () => {
  const rows = [];
  for (const arenaId of ARENAS) {
    const row = playArenaToyScenario(arenaId, SEED);
    console.log(formatRow(row));
    rows.push(row);
    assert.equal(row.seed, SEED);
    assert.ok(row.used.length >= ARENA_TOY_MIN, `${arenaId} used ${row.used.length}`);
    assert.ok(row.killed > 0 || row.escaped > 0, `${arenaId} neither killed nor escaped`);
    assert.equal(row.hazards.includes('radiation'), false);
    assert.equal(row.ok, true, `${arenaId} ${JSON.stringify(row.proofs)}`);
  }
  assert.equal(rows.length, 4);
});

test('crushers kill in surge and sit still in calm', () => {
  for (const arenaId of ARENAS) {
    const row = playArenaToyScenario(arenaId, SEED);
    const crushers = row.proofs.filter((proof) => proof.kind === 'crusher');
    for (const proof of crushers) {
      assert.equal(proof.surgeKilled, true, `${arenaId} ${proof.id} surge`);
      assert.equal(proof.calmKilled, false, `${arenaId} ${proof.id} calm`);
      assert.ok(proof.surgeSpeed >= 30, `${arenaId} ${proof.id} speed ${proof.surgeSpeed}`);
    }
  }
});

test('validateArenaToys rejects a radiation aura', () => {
  const bad = validateArenaToys([{
    id: 'glow',
    kind: 'crusher',
    verb: 'kill',
    hazardType: 'radiation',
  }]);
  assert.equal(bad.ok, false);
  assert.ok(bad.issues.some((item) => item.rule === 'hazard'));
});

const LIVE_ANCHOR = { x: 400, z: -120 };

function makeFakeFields() {
  const live = new Map();
  return {
    name: 'fields',
    live,
    registerEnvironmental(spec) {
      const id = String(spec && spec.id != null ? spec.id : 'field');
      const record = { ...spec, id, tag: 'environmental', durationS: Infinity };
      live.set(id, record);
      return record;
    },
    registerExternal(spec) { return this.registerEnvironmental(spec); },
    unregisterExternal(id) { return live.delete(String(id)); },
    updateExternal(id, patch) {
      const record = live.get(String(id));
      if (!record || !patch) return null;
      Object.assign(record, patch);
      return record;
    },
    hasExternal(id) { return live.has(String(id)); },
  };
}

function bootLive({ seed = SEED, anchor = LIVE_ANCHOR } = {}) {
  const state = createGameState(seed);
  state.simTime = 0;
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload });
      raw.emit(event, payload);
    },
  };
  const helpers = {
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = {
        ...spec,
        id,
        alive: true,
        pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 },
      };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const player = {
    id: state.nextEntityId++,
    alive: true,
    type: 'ship',
    team: 0,
    pos: { ...anchor },
    vel: { x: 0, z: 0 },
    mass: ARENA_TOY_LIGHT_MASS,
    radius: ARENA_TOY_LIGHT_RADIUS,
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  const fakeFields = makeFakeFields();
  const registry = { get: (name) => (name === 'fields' ? fakeFields : null) };
  const ctx = { state, bus, helpers, registry };
  mines.init(ctx);
  survivalArena.init(ctx);
  return { state, bus, emitted, fakeFields, player, helpers };
}

function installLiveRun(harness, { arenaId, seed = SEED, wave = 1 } = {}) {
  const run = createRunState({ kind: 'survival', ruleset: 'scored', seed });
  run.arenaId = arenaId;
  run.phase = 'wave_intro';
  run.wave = wave;
  harness.state.run = run;
  return run;
}

function emitLivePlanned(harness, { arenaId, seed = SEED, wave = 1 } = {}) {
  const plan = planWave({ seed, arenaId, wave });
  assert.notEqual(plan.ok, false, `${arenaId} wave ${wave} must plan`);
  harness.bus.emit('run:wavePlanned', { wave, plan, tick: 0 });
  return plan;
}

function named(emitted, event) {
  return emitted.filter((entry) => entry.event === event);
}

function bodySpeed(entity) {
  const vel = entity && entity.vel && typeof entity.vel === 'object' ? entity.vel : null;
  const vx = Number.isFinite(entity && entity.vx) ? entity.vx : (vel && Number.isFinite(vel.x) ? vel.x : 0);
  const vz = Number.isFinite(entity && entity.vz) ? entity.vz : (vel && Number.isFinite(vel.z) ? vel.z : 0);
  return Math.hypot(vx, vz);
}

function alongDir(pos, dir, distance) {
  const length = Math.hypot(dir.x, dir.z) || 1;
  return {
    x: pos.x + (dir.x / length) * distance,
    z: pos.z + (dir.z / length) * distance,
  };
}

function spawnLightAt(harness, pos) {
  return harness.helpers.spawnEntity({
    type: 'ship',
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    mass: ARENA_TOY_LIGHT_MASS,
    radius: ARENA_TOY_LIGHT_RADIUS,
  });
}

test('live survivalArena install on seed 17510 registers authored toys, not a third field', () => {
  for (const arenaId of ARENAS) {
    const h = bootLive({ seed: SEED });
    installLiveRun(h, { arenaId, seed: SEED });
    const plan = emitLivePlanned(h, { arenaId, seed: SEED });
    const expected = planArenaInstall({
      arenaPhase: plan.arenaPhase,
      arenaId,
      wave: 1,
      seed: SEED,
      anchor: LIVE_ANCHOR,
      laneGate: dominantGate(plan),
    });
    const toys = listArenaToys(expected);
    const installed = named(h.emitted, 'survivalArena:installed').at(-1);
    const diag = survivalArena.diagnostics();
    assert.ok(installed, `${arenaId} install event`);
    assert.ok(installed.payload.toys >= ARENA_TOY_MIN, `${arenaId} event toys ${installed.payload.toys}`);
    assert.equal(diag.toyCount, toys.length, `${arenaId} diagnostic count`);
    assert.deepEqual(diag.toyIds.slice().sort(), toys.map((toy) => toy.id).sort(), `${arenaId} toy ids`);
    assert.ok(h.fakeFields.live.size <= ARENA_FIELD_SLOT_IDS.length, `${arenaId} field slots ${h.fakeFields.live.size}`);
    for (const toy of diag.toys) {
      assert.ok(ARENA_TOY_HAZARDS.includes(toy.hazardType), `${arenaId} ${toy.id} hazard`);
      assert.notEqual(toy.hazardType, 'radiation');
    }
    for (const id of h.fakeFields.live.keys()) {
      assert.ok(ARENA_FIELD_SLOT_IDS.includes(id), `${arenaId} invented slot ${id}`);
    }
    survivalArena.destroy();
  }
});

test('live crushers slam in surge and sit still in calm', () => {
  for (const arenaId of ARENAS) {
    const h = bootLive({ seed: SEED });
    installLiveRun(h, { arenaId, seed: SEED });
    const plan = emitLivePlanned(h, { arenaId, seed: SEED });
    const expected = planArenaInstall({
      arenaPhase: plan.arenaPhase,
      arenaId,
      wave: 1,
      seed: SEED,
      anchor: LIVE_ANCHOR,
      laneGate: dominantGate(plan),
    });
    const crushers = listArenaToys(expected).filter((toy) => toy.kind === 'crusher');
    if (crushers.length === 0) {
      survivalArena.destroy();
      continue;
    }
    for (const crusher of crushers) {
      const mouth = alongDir(crusher.pos, crusher.dir, 4);
      const surgeBody = spawnLightAt(h, mouth);
      h.state.simTime = CRUSHER_CYCLE.warningS + 0.2;
      for (let i = 0; i < 180; i++) {
        survivalArena.update(ARENA_TOY_DT, h.state);
        h.state.simTime += ARENA_TOY_DT;
      }
      const surgeSpeed = bodySpeed(surgeBody);
      assert.ok(surgeSpeed >= 30, `${arenaId} ${crusher.id} surge ${surgeSpeed}`);

      const calmBody = spawnLightAt(h, mouth);
      h.state.simTime = CRUSHER_CYCLE.warningS + CRUSHER_CYCLE.surgeS + 0.2;
      for (let i = 0; i < 60; i++) {
        survivalArena.update(ARENA_TOY_DT, h.state);
        h.state.simTime += ARENA_TOY_DT;
      }
      assert.equal(bodySpeed(calmBody), 0, `${arenaId} ${crusher.id} calm`);
    }
    survivalArena.destroy();
  }
});

test('live shutter cuts a shot without adding a field slot', () => {
  const h = bootLive({ seed: SEED });
  installLiveRun(h, { arenaId: STORM_ARENA_ID, seed: SEED });
  const plan = emitLivePlanned(h, { arenaId: STORM_ARENA_ID, seed: SEED });
  const expected = planArenaInstall({
    arenaPhase: plan.arenaPhase,
    arenaId: STORM_ARENA_ID,
    wave: 1,
    seed: SEED,
    anchor: LIVE_ANCHOR,
    laneGate: dominantGate(plan),
  });
  const shutter = listArenaToys(expected).find((toy) => toy.kind === 'shutter');
  assert.ok(shutter, 'storm shutter');
  const mid = {
    x: (shutter.a.x + shutter.b.x) * 0.5,
    z: (shutter.a.z + shutter.b.z) * 0.5,
  };
  const tangent = { x: shutter.b.x - shutter.a.x, z: shutter.b.z - shutter.a.z };
  const n = { x: -tangent.z, z: tangent.x };
  const nLen = Math.hypot(n.x, n.z) || 1;
  const from = { x: mid.x + (n.x / nLen) * 20, z: mid.z + (n.z / nLen) * 20 };
  const shot = h.helpers.spawnEntity({
    type: 'projectile',
    pos: from,
    vel: { x: -(n.x / nLen) * 80, z: -(n.z / nLen) * 80 },
  });
  const fieldsBefore = h.fakeFields.live.size;
  survivalArena.update(ARENA_TOY_DT, h.state);
  assert.equal(shot.alive, false, 'shutter must cut the shot');
  assert.equal(h.fakeFields.live.size, fieldsBefore);
  assert.ok(h.fakeFields.live.size <= ARENA_FIELD_SLOT_IDS.length);
  survivalArena.destroy();
});
