// The Survival room participates: `plan.arenaPhase` finally has a consumer.
//
// Before survivalArena the eight authored arenaPhase values were validated, planned, hashed and
// then dropped, so ten waves were the same room. These tests pin the four things that make the
// consumer safe to ship: it is a strict no-op off a live Survival run, each phase is a DIFFERENT
// room (asserted on the installed spec contents, not on a non-zero install count), the same seed
// rebuilds the same room, and nothing it installs outlives the wave.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { FIELD_MAX_ACTIVE } from '../src/data/fields.js';
import { MINE_OWNER_CAP, MINE_TYPE, countOwnerMines, mines } from '../src/systems/mines.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import {
  ARENA_FIELD_SLOT_IDS,
  ARENA_MINE_MAX,
  ARENA_MINE_OWNER,
  SURVIVAL_ARENA_PHASES,
  dominantGate,
  planArenaInstall,
  survivalArena,
} from '../src/systems/survivalArena.js';

const ARENA = 'helios_core';
const SEED = 7;
const ANCHOR = { x: 400, z: -120 };

// ---------------------------------------------------------------------------------------------
// Harness — same shape as test/crucible-wave-materialization.test.mjs, plus a fake `fields` system
// behind a fake registry. The fake mirrors the real public surface (registerEnvironmental /
// unregisterExternal / updateExternal / hasExternal) and, crucially, records the live set so
// "the cap is never exceeded" and "everything installed is released" are checkable rather than
// vacuous. The MINES system is the real one, so the real per-owner cap is exercised.
// ---------------------------------------------------------------------------------------------

function makeFakeFields() {
  const live = new Map();
  const calls = [];
  let peak = 0;
  return {
    name: 'fields',
    live,
    calls,
    get peak() { return peak; },
    registerEnvironmental(spec) {
      calls.push({ call: 'registerEnvironmental', spec });
      const id = String(spec && spec.id != null ? spec.id : 'field');
      const record = { ...spec, id, tag: 'environmental', durationS: Infinity };
      live.set(id, record);           // kernel register is upsert-by-id
      if (live.size > peak) peak = live.size;
      return record;
    },
    registerExternal(spec) { return this.registerEnvironmental(spec); },
    unregisterExternal(id) {
      calls.push({ call: 'unregisterExternal', id });
      return live.delete(String(id));
    },
    updateExternal(id, patch) {
      const record = live.get(String(id));
      if (!record || !patch) return null;
      Object.assign(record, patch);
      return record;
    },
    hasExternal(id) { return live.has(String(id)); },
  };
}

function boot({ seed = SEED, anchor = ANCHOR, withFields = true } = {}) {
  const state = createGameState(seed);
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
  const player = { id: state.nextEntityId++, alive: true, type: 'ship', team: 0, pos: { ...anchor } };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;

  const fakeFields = withFields ? makeFakeFields() : null;
  const registry = { get: (name) => (name === 'fields' ? fakeFields : null) };
  const ctx = { state, bus, helpers, registry };

  mines.init(ctx);
  survivalArena.init(ctx);
  return { state, bus, raw, emitted, helpers, registry, fakeFields, ctx, player };
}

function named(emitted, event) {
  return emitted.filter((entry) => entry.event === event);
}

function realPlan(wave, seed = SEED) {
  const plan = planWave({ seed, arenaId: ARENA, wave });
  assert.equal(plan.ok, undefined, `wave ${wave} must plan cleanly`);
  assert.equal(typeof plan.arenaPhase, 'string');
  return plan;
}

/** Drive a live Survival run into `state.run` without importing runSession (not this file's seam). */
function installRun(harness, { wave = 1, phase = 'wave_intro', seed = SEED } = {}) {
  const run = createRunState({ kind: 'survival', ruleset: 'scored', seed });
  run.arenaId = ARENA;
  run.phase = phase;
  run.wave = wave;
  harness.state.run = run;
  return run;
}

function planWaveOn(harness, wave, seed = SEED) {
  const plan = realPlan(wave, seed);
  harness.bus.emit('run:wavePlanned', { wave, plan, tick: 0 });
  return plan;
}

function liveArenaMines(state) {
  return state.entityList.filter((e) => e && e.alive && e.type === MINE_TYPE
    && (e.ownerId === ARENA_MINE_OWNER || (e.data && e.data.ownerId === ARENA_MINE_OWNER)));
}

/** The whole authored ten-wave ladder, so every one of the eight phases is exercised for real. */
const WAVE_PHASES = (() => {
  const out = new Map();
  for (let wave = 1; wave <= 10; wave++) out.set(wave, realPlan(wave).arenaPhase);
  return out;
})();

// ---------------------------------------------------------------------------------------------
// 1. The authored data really does carry eight distinct phases (the premise this file consumes).
// ---------------------------------------------------------------------------------------------

test('the ten authored waves carry the eight arenaPhase values this system consumes', () => {
  const seen = new Set(WAVE_PHASES.values());
  assert.equal(seen.size, 8);
  for (const phase of seen) assert.ok(SURVIVAL_ARENA_PHASES.includes(phase), `unknown phase ${phase}`);
});

// ---------------------------------------------------------------------------------------------
// 2. Strict no-op unless a live Survival run asked for the room.
// ---------------------------------------------------------------------------------------------

function assertInstalledNothing(harness, why) {
  assert.equal(harness.fakeFields.live.size, 0, `${why}: registered a field`);
  assert.equal(named(harness.emitted, 'mines:placeRequest').length, 0, `${why}: requested a mine`);
  assert.equal(named(harness.emitted, 'encounter:telegraph').length, 0, `${why}: telegraphed cover`);
  assert.equal(liveArenaMines(harness.state).length, 0, `${why}: left a mine`);
}

test('strict no-op when state.run is absent', () => {
  const h = boot();
  h.state.run = null;
  planWaveOn(h, 10);
  assertInstalledNothing(h, 'run absent');
});

test('strict no-op when state.run is malformed', () => {
  for (const [why, value] of [
    ['array', []],
    ['string', 'survival'],
    ['missing keys', { kind: 'survival', phase: 'active' }],
    ['bad phase', (() => { const r = createRunState({ kind: 'survival', seed: SEED }); r.phase = 'nope'; return r; })()],
    ['non-integer wave', (() => { const r = createRunState({ kind: 'survival', seed: SEED }); r.phase = 'active'; r.wave = 1.5; return r; })()],
  ]) {
    const h = boot();
    h.state.run = value;
    planWaveOn(h, 10);
    assertInstalledNothing(h, why);
  }
});

test('strict no-op for a run that is not kind survival, or is phase inactive', () => {
  for (const [why, mutate] of [
    ['adventure run', (r) => { r.kind = 'adventure'; }],
    ['lab run', (r) => { r.kind = 'lab'; }],
    ['inactive phase', (r) => { r.phase = 'inactive'; }],
  ]) {
    const h = boot();
    const run = installRun(h, { wave: 10, phase: 'active' });
    mutate(run);
    planWaveOn(h, 10);
    assertInstalledNothing(h, why);
  }
});

test('strict no-op for a failed plan, and for a plan with no arenaPhase', () => {
  const h = boot();
  installRun(h, { wave: 10, phase: 'active' });
  h.bus.emit('run:wavePlanned', { wave: 10, plan: planWave({ seed: SEED, arenaId: 'nope', wave: 10 }) });
  assertInstalledNothing(h, 'failed plan');
  const stripped = { ...realPlan(10) };
  delete stripped.arenaPhase;
  h.bus.emit('run:wavePlanned', { wave: 10, plan: stripped });
  assertInstalledNothing(h, 'plan without arenaPhase');
});

test("an unknown arenaPhase is an inert room, never a guessed one", () => {
  const h = boot();
  installRun(h, { wave: 10, phase: 'active' });
  const plan = { ...realPlan(10), arenaPhase: 'trapdoor_of_unknowing' };
  h.bus.emit('run:wavePlanned', { wave: 10, plan });
  assertInstalledNothing(h, 'unknown phase');
});

test('never writes state.run', () => {
  const h = boot();
  installRun(h, { wave: 10, phase: 'active' });
  const before = JSON.stringify(h.state.run);
  planWaveOn(h, 10);
  assert.equal(JSON.stringify(h.state.run), before);
  h.bus.emit('run:waveCleared', { wave: 10 });
  assert.equal(JSON.stringify(h.state.run), before);
  h.bus.emit('run:ended', { outcome: 'victory' });
  assert.equal(JSON.stringify(h.state.run), before);
});

// ---------------------------------------------------------------------------------------------
// 3. Eight phases, eight different rooms — asserted on the spec CONTENTS.
// ---------------------------------------------------------------------------------------------

function roomSignature(install) {
  return JSON.stringify({
    fields: install.fields.map((f) => ({
      kind: f.kind,
      radius: f.radius,
      strength: f.strength,
      falloff: f.falloff,
      damping: f.damping || 0,
      directed: !!f.dir,
    })),
    mines: install.mines.length,
    cover: install.cover,
  });
}

test('every arenaPhase builds a room no other phase builds', () => {
  const signatures = new Map();
  for (const phase of SURVIVAL_ARENA_PHASES) {
    const install = planArenaInstall({ arenaPhase: phase, wave: 5, seed: SEED, anchor: ANCHOR, laneGate: 'ne' });
    const signature = roomSignature(install);
    for (const [other, sig] of signatures) {
      assert.notEqual(signature, sig, `${phase} builds the same room as ${other}`);
    }
    signatures.set(phase, signature);
  }
  assert.equal(signatures.size, 8);
});

test('idle installs nothing, every other phase installs something', () => {
  for (const phase of SURVIVAL_ARENA_PHASES) {
    const install = planArenaInstall({ arenaPhase: phase, wave: 3, seed: SEED, anchor: ANCHOR });
    const installs = install.fields.length + install.mines.length + (install.cover ? 1 : 0);
    if (phase === 'idle') assert.equal(installs, 0, 'idle must install nothing');
    else assert.ok(installs > 0, `${phase} installed nothing`);
  }
});

test('the room reaches the kernel: each live phase registers exactly the fields it planned', () => {
  for (const [wave, phase] of WAVE_PHASES) {
    const h = boot();
    installRun(h, { wave, phase: 'wave_intro' });
    const plan = planWaveOn(h, wave);
    const expected = planArenaInstall({
      arenaPhase: plan.arenaPhase,
      wave,
      seed: SEED,
      anchor: ANCHOR,
      laneGate: dominantGate(plan),
    });
    assert.equal(h.fakeFields.live.size, expected.fields.length, `wave ${wave} (${phase}) field count`);
    for (const spec of expected.fields) {
      const record = h.fakeFields.live.get(spec.id);
      assert.ok(record, `wave ${wave} missing field ${spec.id}`);
      assert.equal(record.kind, spec.kind);
      assert.equal(record.radius, spec.radius);
      assert.equal(record.strength, spec.strength);
    }
    assert.equal(liveArenaMines(h.state).length, expected.mines.length, `wave ${wave} mine count`);
    assert.equal(named(h.emitted, 'encounter:telegraph').length, expected.cover ? 1 : 0, `wave ${wave} cover`);
  }
});

test('the room is anchored on the player and steered by the wave\'s own gate', () => {
  const h = boot({ anchor: { x: 1000, z: -1000 } });
  installRun(h, { wave: 5, phase: 'wave_intro' });   // furnace_active — centred on the anchor
  planWaveOn(h, 5);
  const record = h.fakeFields.live.get(ARENA_FIELD_SLOT_IDS[0]);
  assert.equal(record.kind, 'repulsor');
  assert.equal(record.center.x, 1000);
  assert.equal(record.center.z, -1000);

  // shutter_lane_close aims across the gate the wave's biggest batch actually uses.
  const plan = realPlan(8);
  const lane = dominantGate(plan);
  assert.ok(typeof lane === 'string' && lane.length > 0);
  const withGate = planArenaInstall({ arenaPhase: 'shutter_lane_close', wave: 8, seed: SEED, anchor: ANCHOR, laneGate: lane });
  const otherGate = planArenaInstall({ arenaPhase: 'shutter_lane_close', wave: 8, seed: SEED, anchor: ANCHOR, laneGate: lane === 'front' ? 'rear' : 'front' });
  assert.notDeepEqual(withGate.fields[0].center, otherGate.fields[0].center);
});

// ---------------------------------------------------------------------------------------------
// 4. Determinism.
// ---------------------------------------------------------------------------------------------

test('same seed + same wave => the same room, every time', () => {
  for (const phase of SURVIVAL_ARENA_PHASES) {
    for (let wave = 1; wave <= 10; wave++) {
      const a = planArenaInstall({ arenaPhase: phase, wave, seed: 12345, anchor: ANCHOR, laneGate: 'sw' });
      const b = planArenaInstall({ arenaPhase: phase, wave, seed: 12345, anchor: ANCHOR, laneGate: 'sw' });
      assert.deepEqual(a, b, `${phase} w${wave} is not reproducible`);
    }
  }
});

test('the live system reproduces the same registered fields from the same seed', () => {
  const snapshot = (seed) => {
    const h = boot({ seed });
    installRun(h, { wave: 10, phase: 'wave_intro', seed });
    planWaveOn(h, 10, seed);
    return JSON.stringify([...h.fakeFields.live.entries()]);
  };
  assert.equal(snapshot(SEED), snapshot(SEED));
  assert.notEqual(snapshot(SEED), snapshot(SEED + 1));
});

test('a different seed moves the room', () => {
  for (const phase of ['shutter_slow', 'shutter_alternating', 'boss', 'loose_plate']) {
    const a = planArenaInstall({ arenaPhase: phase, wave: 6, seed: 11, anchor: ANCHOR });
    const b = planArenaInstall({ arenaPhase: phase, wave: 6, seed: 222222, anchor: ANCHOR });
    assert.notDeepEqual(a.fields, b.fields, `${phase} ignored the seed`);
  }
});

test('the same seed builds a different room for a different wave', () => {
  const a = planArenaInstall({ arenaPhase: 'shutter_slow', wave: 3, seed: SEED, anchor: ANCHOR });
  const b = planArenaInstall({ arenaPhase: 'shutter_slow', wave: 4, seed: SEED, anchor: ANCHOR });
  assert.notDeepEqual(a.fields, b.fields);
});

// ---------------------------------------------------------------------------------------------
// 5. Caps.
// ---------------------------------------------------------------------------------------------

test('no phase ever asks for more than two of the six field slots', () => {
  assert.ok(ARENA_FIELD_SLOT_IDS.length <= FIELD_MAX_ACTIVE - 3,
    'the room must leave the player Well + Repulsor + Cone their slots');
  for (const phase of SURVIVAL_ARENA_PHASES) {
    for (let wave = 1; wave <= 10; wave++) {
      const install = planArenaInstall({ arenaPhase: phase, wave, seed: wave * 977, anchor: ANCHOR });
      assert.ok(install.fields.length <= ARENA_FIELD_SLOT_IDS.length, `${phase} asked for ${install.fields.length} fields`);
      const ids = new Set(install.fields.map((f) => f.id));
      assert.equal(ids.size, install.fields.length, `${phase} reused a slot id`);
      for (const id of ids) assert.ok(ARENA_FIELD_SLOT_IDS.includes(id), `${phase} invented slot ${id}`);
    }
  }
});

test('ten waves back to back, with no clear between, never exceed the field cap', () => {
  const h = boot();
  for (let wave = 1; wave <= 10; wave++) {
    installRun(h, { wave, phase: 'wave_intro' });
    planWaveOn(h, wave);
    assert.ok(h.fakeFields.live.size <= ARENA_FIELD_SLOT_IDS.length,
      `wave ${wave} left ${h.fakeFields.live.size} arena fields live`);
    assert.ok(h.fakeFields.live.size < FIELD_MAX_ACTIVE);
  }
  assert.ok(h.fakeFields.peak <= ARENA_FIELD_SLOT_IDS.length, `peak was ${h.fakeFields.peak}`);
  assert.ok(h.fakeFields.peak <= FIELD_MAX_ACTIVE);
  // Cover ownership is never allowed to accumulate either: one resolve for every telegraph.
  const telegraphs = named(h.emitted, 'encounter:telegraph').length;
  const resolves = named(h.emitted, 'encounter:resolved').length;
  assert.ok(telegraphs > 0, 'no wave asked for cover');
  assert.equal(resolves, telegraphs - 1, 'each re-arm must resolve the previous cover');
  h.bus.emit('run:ended', { outcome: 'defeat' });
  assert.equal(named(h.emitted, 'encounter:resolved').length, telegraphs);
});

test('the room stays well inside the per-owner mine cap and never lays an unowned mine', () => {
  const h = boot();
  assert.ok(ARENA_MINE_MAX <= MINE_OWNER_CAP);
  for (let wave = 1; wave <= 10; wave++) {
    installRun(h, { wave, phase: 'wave_intro' });
    planWaveOn(h, wave);
    assert.ok(countOwnerMines(h.state, ARENA_MINE_OWNER) <= ARENA_MINE_MAX,
      `wave ${wave} laid ${countOwnerMines(h.state, ARENA_MINE_OWNER)} mines`);
  }
  for (const request of named(h.emitted, 'mines:placeRequest')) {
    // A null ownerId would skip the cap entirely (mines.js:52) — that is a cap bypass, not a mine.
    assert.equal(request.payload.ownerId, ARENA_MINE_OWNER);
    // Team is read from the player, not defaulted: `teamOf` answers 1 for an unknown owner, which
    // would have quietly aimed the room's mines at the player instead of the hostiles.
    assert.equal(request.payload.team, 0);
  }
  assert.equal(named(h.emitted, 'mines:capReached').length, 0);
});

// ---------------------------------------------------------------------------------------------
// 6. Release: nothing the room installs outlives the wave.
// ---------------------------------------------------------------------------------------------

function assertFullyReleased(h, why) {
  assert.equal(h.fakeFields.live.size, 0, `${why}: a field survived`);
  assert.equal(liveArenaMines(h.state).length, 0, `${why}: a mine survived`);
  assert.equal(
    named(h.emitted, 'encounter:resolved').length,
    named(h.emitted, 'encounter:telegraph').length,
    `${why}: cover ownership was never released`,
  );
}

for (const [why, finish] of [
  ['run:waveCleared', (h, wave) => h.bus.emit('run:waveCleared', { wave })],
  ['run:ended', (h) => h.bus.emit('run:ended', { outcome: 'defeat' })],
  ['newGame', (h) => survivalArena.newGame()],
  ['destroy', (h) => survivalArena.destroy()],
]) {
  test(`every phase releases everything it installed on ${why}`, () => {
    for (const [wave, phase] of WAVE_PHASES) {
      const h = boot();
      installRun(h, { wave, phase: 'wave_intro' });
      planWaveOn(h, wave);
      finish(h, wave);
      assertFullyReleased(h, `${phase} on ${why}`);
    }
  });
}

test('the boss room — the loudest one — leaves nothing behind', () => {
  const h = boot();
  installRun(h, { wave: 10, phase: 'wave_intro' });
  planWaveOn(h, 10);
  assert.equal(h.fakeFields.live.size, 2);
  assert.equal(liveArenaMines(h.state).length, ARENA_MINE_MAX);
  assert.equal(named(h.emitted, 'encounter:telegraph').length, 1);

  h.bus.emit('run:waveCleared', { wave: 10 });
  assertFullyReleased(h, 'boss');
  for (const id of ARENA_FIELD_SLOT_IDS) assert.equal(h.fakeFields.hasExternal(id), false);
  // A second teardown is idempotent — it must not emit a second, unpaired resolve.
  h.bus.emit('run:ended', { outcome: 'victory' });
  assert.equal(named(h.emitted, 'encounter:resolved').length, 1);
});

test('teardown only takes the room\'s own mines, never the player\'s', () => {
  const h = boot();
  installRun(h, { wave: 8, phase: 'wave_intro' });
  h.bus.emit('mines:placeRequest', { ownerId: h.player.id, pos: { x: 10, z: 10 }, team: 0 });
  planWaveOn(h, 8);
  const playerMines = () => h.state.entityList.filter((e) => e && e.alive && e.type === MINE_TYPE
    && e.ownerId === h.player.id).length;
  assert.equal(playerMines(), 1);
  assert.ok(liveArenaMines(h.state).length > 0);

  h.bus.emit('run:waveCleared', { wave: 8 });
  assert.equal(liveArenaMines(h.state).length, 0);
  assert.equal(playerMines(), 1, 'the player\'s own mine was swept up');
});

test('a wave that plans while the previous room is still up replaces it, never stacks on it', () => {
  const h = boot();
  installRun(h, { wave: 10, phase: 'wave_intro' });
  planWaveOn(h, 10);
  assert.equal(h.fakeFields.live.size, 2);
  const boss = new Set(h.fakeFields.live.keys());

  installRun(h, { wave: 5, phase: 'wave_intro' });   // furnace_active — one field
  planWaveOn(h, 5);
  assert.equal(h.fakeFields.live.size, 1);
  assert.equal(liveArenaMines(h.state).length, 0, 'the boss mines outlived the boss wave');
  assert.ok(boss.has(ARENA_FIELD_SLOT_IDS[1]));
  assert.equal(h.fakeFields.hasExternal(ARENA_FIELD_SLOT_IDS[1]), false);
});

test('a kernel wipe under our feet is not reported as a release, and leaves nothing dangling', () => {
  const h = boot();
  installRun(h, { wave: 10, phase: 'wave_intro' });
  planWaveOn(h, 10);
  // fields._clearAll (sector change / save load) empties the kernel without telling us.
  h.fakeFields.live.clear();
  h.bus.emit('sector:enter', { sectorId: 'x' });
  h.bus.emit('run:waveCleared', { wave: 10 });
  assert.equal(h.fakeFields.live.size, 0);
  assert.equal(h.fakeFields.calls.filter((c) => c.call === 'unregisterExternal').length, 0,
    'unregistered ids the kernel no longer held');
  assertFullyReleased(h, 'kernel wipe');
});

test('a missing fields system does not stop the mines or the cover, and does not throw', () => {
  const h = boot({ withFields: false });
  installRun(h, { wave: 10, phase: 'wave_intro' });
  planWaveOn(h, 10);
  assert.equal(liveArenaMines(h.state).length, ARENA_MINE_MAX);
  assert.equal(named(h.emitted, 'encounter:telegraph').length, 1);
  h.bus.emit('run:waveCleared', { wave: 10 });
  assert.equal(liveArenaMines(h.state).length, 0);
  assert.equal(named(h.emitted, 'encounter:resolved').length, 1);
});

test('the system has no update method — it costs nothing on a quiet tick', () => {
  assert.equal(typeof survivalArena.update, 'undefined');
  assert.equal(typeof survivalArena.init, 'function');
  assert.equal(typeof survivalArena.destroy, 'function');
  assert.equal(typeof survivalArena.newGame, 'function');
});
