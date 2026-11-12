// EC-A06 — the Asteroid Mill joins lawArenaDressing. The sim has always emitted
// survivalArena:installed for the Mill (it is a law arena sim-side), but the presentation
// gate named only lagrange/cinder/cryo/storm, so the room's grind pair rendered nothing.
//
// These tests prove: the real install payload carries the grind cones' kind/center/dir/
// radius; each cone grows a grind mouth (opposed toothed wheels over a throat) aimed down
// its own dir — never a generic pylon; the Mill's wells/repulsors still anchor on pylons;
// the wheels counter-rotate on the same cadence the seam_crusher boss wears; and the .08/.09
// arena gates are undisturbed.

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { MILL_ARENA_ID, MILL_GRIND_OFFSET } from '../src/systems/asteroidMillArena.js';
import { HIVE_ARENA_ID } from '../src/systems/theHiveArena.js';
import { CINDER_ARENA_ID } from '../src/systems/cinderSluiceArena.js';
import { createLawArenaDressing } from '../src/render/lawArenaDressing.js';
import { mines } from '../src/systems/mines.js';
import { survivalArena } from '../src/systems/survivalArena.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';

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

function installRun(harness, { wave = 1, arenaId, kind = 'survival' } = {}) {
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

function meshesUnder(root) {
  const out = [];
  root.traverse((n) => { if (n.isMesh) out.push(n); });
  return out;
}

function installedPayload(harness, wave) {
  installRun(harness, { arenaId: MILL_ARENA_ID, wave });
  emitPlanned(harness, { arenaId: MILL_ARENA_ID, wave });
  const p = named(harness.emitted, 'survivalArena:installed')[0];
  assert.ok(p, `mill wave ${wave} emits survivalArena:installed`);
  return p.payload;
}

// ---- install payload: the grind cones ride fieldSpecs with their shape ----

test('mill install emits grind cones carrying kind/center/dir/radius — the idle pair opposed', () => {
  const h = boot();
  const p = installedPayload(h, 1); // seed 7 wave 1 plans the 'idle' phase
  assert.equal(p.arenaId, MILL_ARENA_ID);
  const cones = p.fieldSpecs.filter((f) => f.kind === 'cone');
  assert.equal(cones.length, 2, 'the idle phase carries the grind pair');
  for (const cone of cones) {
    assert.ok(cone.center && Number.isFinite(cone.center.x) && Number.isFinite(cone.center.z));
    assert.ok(cone.dir && Number.isFinite(cone.dir.x) && Number.isFinite(cone.dir.z));
    assert.ok(Number.isFinite(cone.radius) && cone.radius > 0);
    assert.ok(Number.isFinite(cone.strength) && cone.strength !== 0, 'a live grind, not a marker');
  }
  // Opposed flanks, opposed push — the seam shears, it does not blow down one lane.
  const [a, b] = cones;
  assert.ok(Math.hypot(a.center.x - b.center.x, a.center.z - b.center.z) > MILL_GRIND_OFFSET,
    'the pair sits on opposite flanks');
  assert.ok(a.dir.x * b.dir.x + a.dir.z * b.dir.z < -0.9, 'the cones push opposite ways');
});

test('mill furnace phase carries a grind flank plus the lit repulsor', () => {
  const h = boot();
  const p = installedPayload(h, 5); // seed 7 wave 5 plans 'furnace_active'
  const kinds = p.fieldSpecs.map((f) => f.kind).sort();
  assert.deepEqual(kinds, ['cone', 'repulsor']);
});

// ---- room dressing ----

test('mill install builds a grind mouth per cone — never a generic pylon', () => {
  const h = boot();
  const payload = installedPayload(h, 1);
  const dressing = createLawArenaDressing();
  const scene = new THREE.Scene();
  dressing.handleInstall(payload, scene);
  const room = dressing.peekRoom();
  assert.ok(room, 'the mill room dresses now');
  const mouths = room.parts.filter((p) => p.root.name === 'mill_grind_mouth');
  assert.equal(mouths.length, 2, 'one mouth per grind cone');
  assert.equal(room.parts.filter((p) => p.root.name === 'law_pylon').length, 0,
    'cones never grow field pylons');
  const cones = payload.fieldSpecs.filter((f) => f.kind === 'cone');
  for (let i = 0; i < cones.length; i++) {
    const mouth = mouths[i].root;
    assert.ok(Math.abs(mouth.position.x - cones[i].center.x) < 1e-6
      && Math.abs(mouth.position.z - cones[i].center.z) < 1e-6,
      'the mouth stands where the cone is centred');
    const expectedYaw = -Math.atan2(cones[i].dir.z, cones[i].dir.x);
    assert.ok(Math.abs(mouth.rotation.y - expectedYaw) < 1e-6,
      'the mouth aims down the cone\'s own dir');
    const wheels = mouth.children.filter((c) => c.name === 'mill_grind_wheel');
    assert.equal(wheels.length, 2, 'opposed wheels over the throat');
    assert.ok(meshesUnder(mouth).some((m) => m.name === 'mill_grind_tooth'), 'real teeth');
  }
  for (const m of meshesUnder(room.root)) {
    assert.notEqual(m.type, 'Sprite');
    assert.ok(m.geometry && m.geometry.type !== 'PlaneGeometry', 'no flat cards');
  }
  dressing.handleReleased();
  assert.equal(dressing.peekRoom(), null);
  assert.equal(scene.children.length, 0);
});

test('mill wells and repulsors still anchor on pylons beside the mouth', () => {
  const h = boot();
  const payload = installedPayload(h, 5); // furnace_active: one cone flank + one repulsor
  const dressing = createLawArenaDressing();
  const scene = new THREE.Scene();
  dressing.handleInstall(payload, scene);
  const room = dressing.peekRoom();
  assert.equal(room.parts.filter((p) => p.root.name === 'mill_grind_mouth').length, 1);
  assert.equal(room.parts.filter((p) => p.root.name === 'law_pylon').length, 1,
    'the lit repulsor keeps its field anchor');
  dressing.handleReleased();
});

test('the grind wheels counter-rotate, and reduced motion slows the turn', () => {
  const dressing = createLawArenaDressing();
  const scene = new THREE.Scene();
  dressing.handleInstall({
    arenaId: MILL_ARENA_ID,
    installedAtSim: 0,
    fieldSpecs: [
      { kind: 'cone', center: { x: 0, z: -210 }, dir: { x: 1, z: 0 }, radius: 500, strength: 55 },
    ],
    toySpecs: [],
  }, scene);
  const mouth = dressing.peekRoom().parts.find((p) => p.root.name === 'mill_grind_mouth').root;
  const [w0, w1] = mouth.children.filter((c) => c.name === 'mill_grind_wheel');
  dressing.updateRoom(1, 1, {});
  assert.ok(w0.rotation.z !== 0, 'the wheels turn');
  assert.ok(Math.sign(w0.rotation.z) !== Math.sign(w1.rotation.z), 'opposed wheels counter-rotate');
  const r0 = w0.rotation.z;
  dressing.updateRoom(2, 1, { reducedMotion: true });
  assert.ok(Math.abs(w0.rotation.z - r0) < 0.2, 'reduced motion slows the grind');
  dressing.handleReleased();
});

test('a non-law arena still installs nothing, and the hive stays dark for its own pass', () => {
  const dressing = createLawArenaDressing();
  const scene = new THREE.Scene();
  dressing.handleInstall({
    arenaId: 'helios_core',
    fieldSpecs: [{ kind: 'cone', center: { x: 0, z: 0 }, dir: { x: 1, z: 0 }, radius: 500, strength: 55 }],
  }, scene);
  assert.equal(dressing.peekRoom(), null, 'helios is not a law arena');
  dressing.handleInstall({
    arenaId: HIVE_ARENA_ID,
    fieldSpecs: [{ kind: 'well', center: { x: 0, z: 0 }, radius: 600, strength: 58 }],
  }, scene);
  assert.equal(dressing.peekRoom(), null, 'the hive waits for its own dressing pass');
});

test('the cinder cone/mouth dedupe is undisturbed by the mill gate', () => {
  const dressing = createLawArenaDressing();
  const scene = new THREE.Scene();
  dressing.handleInstall({
    arenaId: CINDER_ARENA_ID,
    installedAtSim: 0,
    fieldSpecs: [
      { kind: 'cone', center: { x: -156, z: 0 }, dir: { x: 1, z: 0 }, radius: 500, strength: 90 },
    ],
    toySpecs: [
      { id: 'throw_current', kind: 'current', center: { x: -156, z: 0 }, dir: { x: 1, z: 0 } },
    ],
  }, scene);
  const room = dressing.peekRoom();
  assert.equal(room.parts.filter((p) => p.root.name === 'mill_grind_mouth').length, 0);
  assert.equal(room.parts.filter((p) => p.root.name === 'law_pylon').length, 0,
    'the backed cone still grows no anchor');
  assert.equal(room.parts.filter((p) => p.root.name === 'law_current_mouth').length, 1,
    'the cinder mouth owns its anchor as before');
  dressing.handleReleased();
});
