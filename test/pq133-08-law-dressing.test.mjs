// PQ-133.08 — law-arena authored dressing: the Lagrange Crucible's pylon pair and the Cinder
// Sluice's shutter/crusher/current mouth are render-owned geometry installed off the arena's own
// survivalArena:installed/released events, and the wave-10 boss's law role (tidal_engine /
// chain_tug) is stamped onto the shared dreadnought hull at materialization.
//
// These tests prove: the event payloads carry the finalized geometry; the render tracker builds
// real meshes scoped to the law arenas only; machinery animates on the authored clocks; the boss
// dressing propagates hull→kind; and everything releases cleanly.

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import {
  CINDER_ARENA_ID,
  CINDER_BOSS_ROLE,
} from '../src/systems/cinderSluiceArena.js';
import {
  LAGRANGE_ARENA_ID,
  LAGRANGE_BOSS_ROLE,
} from '../src/systems/lagrangeCrucible.js';
import { createLawArenaDressing } from '../src/render/lawArenaDressing.js';
import { mines } from '../src/systems/mines.js';
import { survivalArena } from '../src/systems/survivalArena.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { lawArenaBossDressing, materializeWaveBatch } from '../src/systems/waveMaterialization.js';

const SEED = 7;
const ANCHOR = { x: 400, z: -120 };

function makeFakeFields() {
  const live = new Map();
  return {
    name: 'fields',
    live,
    registerEnvironmental(spec) {
      const id = String(spec && spec.id != null ? spec.id : 'field');
      const record = { ...spec, id, tag: 'environmental' };
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

function boot({ seed = SEED, anchor = ANCHOR } = {}) {
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
    spawnBudget: {
      request: (n) => n,
      bindEntity: () => true,
      releaseSome() {},
    },
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
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  const fakeFields = makeFakeFields();
  const registry = { get: (name) => (name === 'fields' ? fakeFields : null) };
  const ctx = { state, bus, helpers, registry };
  mines.init(ctx);
  survivalArena.init(ctx);
  return { state, bus, emitted, helpers, fakeFields, player };
}

function named(emitted, event) {
  return emitted.filter((entry) => entry.event === event);
}

function installRun(harness, { wave = 1, arenaId = 'helios_core', kind = 'survival' } = {}) {
  const run = createRunState({ kind, ruleset: 'scored', seed: SEED });
  run.arenaId = arenaId;
  run.phase = 'wave_intro';
  run.wave = wave;
  harness.state.run = run;
  return run;
}

function emitPlanned(harness, { wave = 1, arenaId }) {
  const plan = planWave({ seed: SEED, arenaId, wave });
  assert.notEqual(plan.ok, false, `${arenaId} wave ${wave} must plan`);
  harness.bus.emit('run:wavePlanned', { wave, plan, tick: 0 });
  return plan;
}

function bossMesh() {
  const mesh = new THREE.Group();
  const hull = new THREE.Group();
  mesh.add(hull);
  mesh.userData.hull = hull;
  return mesh;
}

function meshesUnder(root) {
  const out = [];
  root.traverse((n) => { if (n.isMesh) out.push(n); });
  return out;
}

// ---- event payload ----

test('survivalArena:installed carries the finalized geometry the dressing renders', () => {
  const h = boot();
  installRun(h, { arenaId: LAGRANGE_ARENA_ID, wave: 3 });
  emitPlanned(h, { arenaId: LAGRANGE_ARENA_ID, wave: 3 });
  const installed = named(h.emitted, 'survivalArena:installed');
  assert.equal(installed.length, 1);
  const p = installed[0].payload;
  assert.equal(p.arenaId, LAGRANGE_ARENA_ID);
  assert.equal(typeof p.installedAtSim, 'number');
  assert.equal(p.fieldSpecs.length, 2, 'two wells');
  assert.equal(p.fieldSpecs[0].kind, 'well');
  assert.ok(Number.isFinite(p.fieldSpecs[0].center.x));
  assert.ok(p.toySpecs.some((toy) => toy.kind === 'shutter' && toy.a && toy.b), 'ridge shutter spec');
  assert.ok(p.toySpecs.filter((toy) => toy.kind === 'current').length === 2, 'two current toys');
});

test('cinder install exposes cone + shutter + crusher + current specs', () => {
  const h = boot();
  installRun(h, { arenaId: CINDER_ARENA_ID, wave: 3 });
  emitPlanned(h, { arenaId: CINDER_ARENA_ID, wave: 3 });
  const p = named(h.emitted, 'survivalArena:installed')[0].payload;
  assert.equal(p.arenaId, CINDER_ARENA_ID);
  assert.ok(p.fieldSpecs.some((f) => f.kind === 'cone'));
  assert.ok(p.toySpecs.some((t) => t.kind === 'crusher' && t.anvil && t.cycle), 'crusher spec');
  assert.ok(p.toySpecs.some((t) => t.kind === 'current' && t.center && t.dir), 'current spec');
});

test('survivalArena:released carries the arenaId for scoped teardown', () => {
  const h = boot();
  installRun(h, { arenaId: LAGRANGE_ARENA_ID, wave: 3 });
  emitPlanned(h, { arenaId: LAGRANGE_ARENA_ID, wave: 3 });
  h.bus.emit('run:waveCleared', { wave: 3 });
  const released = named(h.emitted, 'survivalArena:released');
  assert.equal(released.length, 1);
  assert.equal(released[0].payload.arenaId, LAGRANGE_ARENA_ID);
});

// ---- room dressing tracker ----

function lagrangePayload() {
  return {
    arenaId: LAGRANGE_ARENA_ID,
    installedAtSim: 10,
    fieldSpecs: [
      { kind: 'well', center: { x: -180, z: 0 }, radius: 500, strength: 110 },
      { kind: 'well', center: { x: 180, z: 0 }, radius: 500, strength: 110 },
    ],
    toySpecs: [
      { id: 'ridge_shutter', kind: 'shutter', a: { x: 10, z: -36 }, b: { x: 10, z: 36 } },
      { id: 'throw_current', kind: 'current', center: { x: -156, z: 0 }, dir: { x: 1, z: 0 } },
      { id: 'saddle_current', kind: 'current', center: { x: 156, z: 0 }, dir: { x: -1, z: 0 } },
    ],
  };
}

function cinderPayload() {
  return {
    arenaId: CINDER_ARENA_ID,
    installedAtSim: 10,
    fieldSpecs: [
      { kind: 'cone', center: { x: -200, z: 0 }, dir: { x: 1, z: 0 }, radius: 620, strength: 150 },
    ],
    toySpecs: [
      { id: 'sluice_current', kind: 'current', center: { x: -200, z: 0 }, dir: { x: 1, z: 0 } },
      { id: 'lane_shutter', kind: 'shutter', a: { x: -40, z: -40 }, b: { x: -40, z: 40 } },
      {
        id: 'mouth_crusher', kind: 'crusher',
        pos: { x: 90, z: 0 }, anvil: { x: 122, z: 0 }, dir: { x: 1, z: 0 },
        cycle: { warningS: 2, surgeS: 3.5, calmS: 6.5 },
      },
    ],
  };
}

test('lagrange install builds pylons on both wells, a shutter bar, and two current mouths', () => {
  const dressing = createLawArenaDressing();
  const scene = new THREE.Scene();
  const count = dressing.handleInstall(lagrangePayload(), scene);
  const room = dressing.peekRoom();
  assert.ok(room && room.root.parent === scene, 'room attached to the scene');
  assert.equal(count, 5, '2 pylons + shutter + 2 mouths');
  const pylons = room.parts.filter((p) => p.root.name === 'law_pylon');
  assert.equal(pylons.length, 2);
  assert.equal(pylons[0].root.position.x, -180);
  assert.equal(pylons[1].root.position.x, 180);
  assert.equal(room.parts.filter((p) => p.root.name === 'law_shutter').length, 1);
  assert.equal(room.parts.filter((p) => p.root.name === 'law_current_mouth').length, 2);
  // real geometry only — never a camera card
  for (const m of meshesUnder(room.root)) {
    assert.notEqual(m.type, 'Sprite');
    assert.ok(m.geometry && m.geometry.type !== 'PlaneGeometry', 'no flat cards');
  }
});

test('cinder install dedupes the cone anchor onto its mouth and builds the crusher', () => {
  const dressing = createLawArenaDressing();
  const scene = new THREE.Scene();
  const count = dressing.handleInstall(cinderPayload(), scene);
  const room = dressing.peekRoom();
  assert.ok(room);
  // The cone sits exactly on the sluice_current mouth — one anchor, not two.
  assert.equal(room.parts.filter((p) => p.root.name === 'law_pylon').length, 0);
  assert.equal(room.parts.filter((p) => p.root.name === 'law_current_mouth').length, 1);
  assert.equal(room.parts.filter((p) => p.root.name === 'law_crusher').length, 1);
  assert.equal(room.parts.filter((p) => p.root.name === 'law_shutter').length, 1);
  assert.equal(count, 3);
});

test('room machinery animates on the authored clocks, scoped to law arenas', () => {
  const dressing = createLawArenaDressing();
  const scene = new THREE.Scene();
  dressing.handleInstall(lagrangePayload(), scene);
  const room = dressing.peekRoom();
  const shutter = room.parts.find((p) => p.root.name === 'law_shutter');
  const cutter = meshesUnder(shutter.root).find((m) => m.name === 'law_shutter_cutter');
  dressing.updateRoom(11, 1 / 60, {});
  const x0 = cutter.position.x;
  dressing.updateRoom(12.5, 1.5, {});
  assert.notEqual(cutter.position.x, x0, 'cutter sweeps the beam');

  // reduced motion holds the sweep mid-beam and slows the pylon collars
  dressing.handleReleased();
  dressing.handleInstall(lagrangePayload(), scene);
  const pylon = dressing.peekRoom().parts.find((p) => p.root.name === 'law_pylon');
  const collar = pylon.root.children.find((c) => c.name === 'law_pylon_collar');
  dressing.updateRoom(11, 0, {});
  const r0 = collar.rotation.y;
  dressing.updateRoom(13, 2, { reducedMotion: true });
  assert.ok(collar.rotation.y - r0 < 0.2, 'reduced motion slows the collar');
});

test('crusher jaw travels pos→anvil only during the authored surge window', () => {
  const dressing = createLawArenaDressing();
  const scene = new THREE.Scene();
  dressing.handleInstall(cinderPayload(), scene);
  const room = dressing.peekRoom();
  const crusher = room.parts.find((p) => p.root.name === 'law_crusher');
  const jaw = crusher.root.children.find((c) => c.name === 'law_crusher_jaw');
  // elapsed 10s install anchor: warning = elapsed 0..2
  dressing.updateRoom(11, 1 / 60, {}); // elapsed 1 -> warning: jaw cocked at 0
  assert.equal(jaw.position.x, 0);
  dressing.updateRoom(13.0, 1 / 60, {}); // elapsed 3 -> mid-surge: jaw slammed home
  assert.ok(jaw.position.x >= 30, `jaw travelled, got ${jaw.position.x}`);
  dressing.updateRoom(19, 1 / 60, {}); // elapsed 9 -> calm retract
  assert.ok(jaw.position.x < 30, `jaw retracting, got ${jaw.position.x}`);
});

test('a non-law arena installs no room dressing; duplicate installs replace cleanly', () => {
  const dressing = createLawArenaDressing();
  const scene = new THREE.Scene();
  dressing.handleInstall({ arenaId: 'helios_core', fieldSpecs: [], toySpecs: [] }, scene);
  assert.equal(dressing.peekRoom(), null, 'helios is not a law room');
  dressing.handleInstall(lagrangePayload(), scene);
  assert.equal(scene.children.length, 1);
  dressing.handleInstall(lagrangePayload(), scene); // duplicate install
  assert.equal(scene.children.length, 1, 'old root removed before the new one lands');
  dressing.handleReleased();
  assert.equal(dressing.peekRoom(), null);
  assert.equal(scene.children.length, 0, 'release removes the room root');
});

// ---- boss dressing ----

test('lawArenaBossDressing resolves only on hull+role+law arena', () => {
  assert.equal(
    lawArenaBossDressing(LAGRANGE_ARENA_ID, 'dreadnought_boss', 'elite').kind, 'tidal_engine');
  assert.equal(
    lawArenaBossDressing(CINDER_ARENA_ID, 'dreadnought_boss', 'elite').kind, 'chain_tug');
  assert.equal(lawArenaBossDressing('helios_core', 'dreadnought_boss', 'elite'), null);
  assert.equal(lawArenaBossDressing(LAGRANGE_ARENA_ID, 'wasp_swarmer', 'elite'), null);
  assert.equal(lawArenaBossDressing(LAGRANGE_ARENA_ID, 'dreadnought_boss', 'mass'), null);
  assert.equal(lawArenaBossDressing(null, 'dreadnought_boss', 'elite'), null);
});

test('materializeWaveBatch stamps bossDressing on the wave-10 package only', () => {
  const h = boot();
  const ctx = { state: h.state, helpers: h.helpers };
  const receipt = materializeWaveBatch(ctx, {
    ownerId: 'w10', enemyId: 'dreadnought_boss', level: 4, count: 1,
    seed: SEED, wave: 10, role: 'elite', arenaId: LAGRANGE_ARENA_ID,
  });
  assert.equal(receipt.admitted, 1);
  const boss = h.state.entities.get(receipt.spawnedIds[0]);
  assert.equal(boss.data.bossDressing.kind, 'tidal_engine');
  assert.equal(boss.data.bossDressing.law, LAGRANGE_ARENA_ID);

  const chaff = materializeWaveBatch(ctx, {
    ownerId: 'w10', enemyId: 'wasp_swarmer', level: 4, count: 1,
    seed: SEED, wave: 10, role: 'mass', arenaId: LAGRANGE_ARENA_ID,
  });
  const wasp = h.state.entities.get(chaff.spawnedIds[0]);
  assert.equal(wasp.data.bossDressing, undefined, 'chaff never wears the dressing');
});

test('tidal_engine dressing attaches under the hull and its drums counter-rotate', () => {
  const dressing = createLawArenaDressing();
  const entity = {
    id: 'boss-9', type: 'ship', alive: true, radius: 60,
    data: { bossDressing: { kind: 'tidal_engine' } },
  };
  const mesh = bossMesh();
  dressing.updateBossDressing(entity, mesh, 0, 1 / 60, {});
  const group = mesh.userData.hull.children.find((c) => c.name === 'tidal_engine_dressing');
  assert.ok(group, 'dressing attached under the hull');
  const drums = group.children.filter((c) => c.name === 'tidal_vane_drum');
  assert.equal(drums.length, 2);
  for (let i = 1; i <= 90; i++) dressing.updateBossDressing(entity, mesh, i / 60, 1 / 60, {});
  assert.ok(drums[0].rotation.x !== 0, 'vane drums spin');
  assert.ok(Math.sign(drums[0].rotation.x) !== Math.sign(drums[1].rotation.x),
    'the two drums counter-rotate');
  for (const m of meshesUnder(group)) {
    assert.ok(m.geometry.type !== 'PlaneGeometry' && m.type !== 'Sprite', 'real geometry');
  }
});

test('chain_tug dressing carries winch drums and releases on kill', () => {
  const dressing = createLawArenaDressing();
  const entity = {
    id: 'boss-10', type: 'ship', alive: true, radius: 60,
    data: { bossDressing: { kind: 'chain_tug' } },
  };
  const mesh = bossMesh();
  dressing.updateBossDressing(entity, mesh, 0, 1 / 60, {});
  const group = mesh.userData.hull.children.find((c) => c.name === 'chain_tug_dressing');
  assert.ok(group);
  assert.equal(group.children.filter((c) => c.name === 'chain_winch_drum').length, 2);
  for (let i = 1; i <= 90; i++) dressing.updateBossDressing(entity, mesh, i / 60, 1 / 60, {});
  entity.alive = false;
  dressing.updateBossDressing(entity, mesh, 2, 1 / 60, {});
  const rec = dressing.peekBoss('boss-10');
  assert.equal(rec.phase, 'release');
  for (let i = 0; i < 10; i++) dressing.updateBossDressing(entity, mesh, 2.2 + i * 0.1, 0.1, {});
  assert.equal(rec.phase, 'done');
  assert.equal(mesh.userData.hull.children.find((c) => c.name === 'chain_tug_dressing'), undefined,
    'dressing detached after release');
});

test('a plain dreadnought in a law arena never grows dressing; prune drops dead records', () => {
  const dressing = createLawArenaDressing();
  const plain = { id: 'b1', type: 'ship', alive: true, radius: 60, data: {} };
  const mesh = bossMesh();
  dressing.updateBossDressing(plain, mesh, 0, 1 / 60, {});
  assert.equal(mesh.userData.hull.children.length, 0, 'no dressing without a kind');

  const boss = {
    id: 'b2', type: 'ship', alive: true, radius: 60,
    data: { bossDressing: { kind: 'chain_tug' } },
  };
  dressing.updateBossDressing(boss, mesh, 0, 1 / 60, {});
  assert.ok(dressing.peekBoss('b2'));
  dressing.prune(new Set(['other']));
  assert.equal(dressing.peekBoss('b2'), null);
  assert.equal(mesh.userData.hull.children.length, 0);
});
