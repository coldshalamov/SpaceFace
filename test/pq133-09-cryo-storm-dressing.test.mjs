// PQ-133.09 — Cryo Drift + Storm Lattice authored dressing: the quadrant rails + coolant/heat
// props, the conductor pylon ring + graph wires + orbiting relays, and the wave-10 boss roles
// (manifold_warden / grid_tyrant) dressed on the shared dreadnought hull.
//
// These tests prove: the roomSpec key carries the law's extra authored shape on
// survivalArena:installed; zero-strength occupancy markers never grow generic pylons; relays
// ride the sim's own orbit kernel pose; the boss dressing propagates hull→kind and animates;
// and the .08 lagrange/cinder path is undisturbed.

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { CRYO_ARENA_ID, CRYO_BOSS_ROLE } from '../src/systems/cryoDriftArena.js';
import {
  STORM_ARENA_ID,
  STORM_BOSS_ROLE,
  placeStormRelays,
} from '../src/systems/stormLatticeArena.js';
import { LAGRANGE_ARENA_ID } from '../src/systems/lagrangeCrucible.js';
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

// ---- install payload: roomSpec carries the law's extra shape ----

test('cryo install exposes the thermal map, props, island and field radius', () => {
  const h = boot();
  installRun(h, { arenaId: CRYO_ARENA_ID, wave: 3 });
  emitPlanned(h, { arenaId: CRYO_ARENA_ID, wave: 3 });
  const p = named(h.emitted, 'survivalArena:installed')[0].payload;
  assert.equal(p.arenaId, CRYO_ARENA_ID);
  assert.ok(p.roomSpec && p.roomSpec.at, 'roomSpec carries the room centre');
  assert.ok(p.roomSpec.thermal && typeof p.roomSpec.thermal.nw === 'string', 'thermal map');
  assert.ok(Number.isFinite(p.roomSpec.islandRadius), 'island radius');
  assert.ok(Number.isFinite(p.roomSpec.fieldRadius), 'field radius');
  assert.equal(p.roomSpec.props.coolant.length, 1);
  assert.equal(p.roomSpec.props.heat.length, 1);
  assert.ok(p.toySpecs.some((t) => t.kind === 'plate' && t.normal), 'bank plate specs');
  assert.ok(p.toySpecs.some((t) => t.kind === 'shutter' && t.a && t.b), 'frost shutter spec');
  // Occupancy markers arrive as zero-strength fields — the dressing must not anchor on them.
  assert.ok(p.fieldSpecs.every((f) => f.strength === 0), 'cryo fields are occupancy only');
});

test('storm install exposes the pylon ring and relay seed poses', () => {
  const h = boot();
  installRun(h, { arenaId: STORM_ARENA_ID, wave: 3 });
  emitPlanned(h, { arenaId: STORM_ARENA_ID, wave: 3 });
  const p = named(h.emitted, 'survivalArena:installed')[0].payload;
  assert.equal(p.arenaId, STORM_ARENA_ID);
  assert.equal(p.roomSpec.pylons.length, 6, 'six conductor pylons');
  assert.equal(p.roomSpec.relays.length, 2, 'two relays');
  assert.ok(Number.isFinite(p.roomSpec.islandRadius));
});

// ---- room dressing tracker ----

test('cryo install builds the quadrant frame, both props, plates and the shutter — no occupancy pylons', () => {
  const dressing = createLawArenaDressing();
  const scene = new THREE.Scene();
  dressing.handleInstall({
    arenaId: CRYO_ARENA_ID,
    installedAtSim: 5,
    fieldSpecs: [
      { kind: 'well', center: { x: -300, z: 0 }, radius: 70, strength: 0 },
      { kind: 'repulsor', center: { x: 300, z: 0 }, radius: 70, strength: 0 },
    ],
    toySpecs: [
      { id: 'frost_shutter', kind: 'shutter', a: { x: 0, z: -32 }, b: { x: 0, z: 32 } },
      { id: 'ice_plate', kind: 'plate', pos: { x: 0, z: -90 }, normal: { x: 0, z: 1 }, halfWidth: 28 },
      { id: 'heat_plate', kind: 'plate', pos: { x: 0, z: 90 }, normal: { x: 0, z: -1 }, halfWidth: 28 },
    ],
    roomSpec: {
      at: { x: 0, z: 0 },
      thermal: { nw: 'cold', ne: 'hot', sw: 'cold', se: 'hot' },
      islandRadius: 48,
      fieldRadius: 420,
      props: { coolant: [{ x: -300, z: 0 }], heat: [{ x: 300, z: 0 }] },
    },
  }, scene);
  const room = dressing.peekRoom();
  assert.ok(room);
  const names = room.parts.map((p) => p.root.name);
  assert.ok(names.includes('cryo_frame'), 'quadrant frame installed');
  assert.ok(names.includes('cryo_tank'), 'coolant tank at the well marker');
  assert.ok(names.includes('cryo_manifold'), 'heat manifold at the repulsor marker');
  assert.ok(names.includes('law_plate_ice_plate') && names.includes('law_plate_heat_plate'));
  assert.ok(names.includes('law_shutter'), 'frost shutter bar');
  assert.equal(names.filter((n) => n === 'law_pylon').length, 0,
    'zero-strength occupancy markers never grow pylons');

  // Corner posts sit at the authored quadrant corners — cryoQuadrantKey: north = +z.
  const frame = room.parts.find((p) => p.root.name === 'cryo_frame').root;
  const postAt = (k) => frame.children.find((c) => c.name === `cryo_post_${k}`);
  const R = 420 * 0.5;
  for (const [k, ex, ez] of [['nw', -R, R], ['ne', R, R], ['sw', -R, -R], ['se', R, -R]]) {
    const post = postAt(k);
    assert.ok(post, `post ${k} exists`);
    assert.ok(Math.abs(post.position.x - ex) < 1e-6 && Math.abs(post.position.z - ez) < 1e-6,
      `post ${k} at ${post.position.x.toFixed(0)},${post.position.z.toFixed(0)} — expected ${ex},${ez}`);
  }
  // Lamp tint follows the thermal map, not the post's name order.
  const lampHex = (k) => postAt(k).children.find((c) => c.name === 'cryo_post_lamp')
    .material.emissive.getHex();
  assert.equal(lampHex('nw'), lampHex('sw'), 'both cold quadrants share the tide tint');
  assert.equal(lampHex('ne'), lampHex('se'), 'both hot quadrants share the ember tint');
  assert.notEqual(lampHex('nw'), lampHex('ne'), 'cold and hot posts differ');

  for (const m of meshesUnder(room.root)) {
    assert.notEqual(m.type, 'Sprite');
    assert.ok(m.geometry && m.geometry.type !== 'PlaneGeometry', 'no flat cards');
  }
  dressing.handleReleased();
  assert.equal(dressing.peekRoom(), null);
  assert.equal(scene.children.length, 0);
});

test('storm install builds six pylons, the graph wires, and two orbiting relays', () => {
  const dressing = createLawArenaDressing();
  const scene = new THREE.Scene();
  const at = { x: 100, z: 50 };
  // The same poses the sim publishes on the install payload.
  const pylons = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    pylons.push({ id: `pylon_${i}`, pos: { x: at.x + Math.cos(a) * 96, z: at.z + Math.sin(a) * 96 } });
  }
  const relays = placeStormRelays(at, 0).map((r, i) => ({ id: r.id, pos: r.pos }));
  dressing.handleInstall({
    arenaId: STORM_ARENA_ID,
    installedAtSim: 5,
    fieldSpecs: [
      { kind: 'repulsor', center: relays[0].pos, radius: 14, strength: 0 },
      { kind: 'repulsor', center: relays[1].pos, radius: 14, strength: 0 },
    ],
    toySpecs: [
      { id: 'grid_shutter', kind: 'shutter', a: { x: at.x - 28, z: at.z }, b: { x: at.x + 28, z: at.z } },
    ],
    roomSpec: { at, islandRadius: 32, pylons, relays },
  }, scene);
  const room = dressing.peekRoom();
  assert.ok(room);
  assert.equal(room.parts.filter((p) => p.root.name.startsWith('storm_pylon_')).length, 6);
  assert.equal(room.parts.filter((p) => p.root.name.startsWith('storm_relay_')).length, 2);
  assert.ok(room.parts.some((p) => p.root.name === 'storm_wire'), 'graph edges drawn');
  assert.equal(room.parts.filter((p) => p.root.name === 'law_pylon').length, 0,
    'relay occupancy markers grow no generic pylons');
  assert.equal(room.relayWires.length, 2, 'one feed beam per relay');
  assert.ok(room.relayWires.every((rw) => rw.beam.isMesh && rw.beam.parent === room.root));

  // Relay buoys ride the sim's own orbit kernel — pose equality, not a lookalike.
  const relayPart = room.parts.find((p) => p.root.name === 'storm_relay_0');
  dressing.updateRoom(40, 1 / 60, {});
  const expected = placeStormRelays(at, 40)[0];
  assert.ok(Math.abs(relayPart.root.position.x - expected.pos.x) < 1e-6,
    `relay x ${relayPart.root.position.x} vs kernel ${expected.pos.x}`);
  assert.ok(Math.abs(relayPart.root.position.z - expected.pos.z) < 1e-6);
  // Feed beams track the relay's nearest pylon — they only exist while a node is in range.
  const rw0 = room.relayWires[0];
  assert.equal(rw0.beam.visible, true, 'feed beam lit while a pylon is in conduct range');
  dressing.handleReleased();
  assert.equal(scene.children.length, 0);
});

test('reduced motion and reduced flash hold on the .09 rooms', () => {
  const dressing = createLawArenaDressing();
  const scene = new THREE.Scene();
  const at = { x: 0, z: 0 };
  const pylons = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    pylons.push({ id: `pylon_${i}`, pos: { x: Math.cos(a) * 96, z: Math.sin(a) * 96 } });
  }
  dressing.handleInstall({
    arenaId: STORM_ARENA_ID,
    installedAtSim: 0,
    fieldSpecs: [],
    toySpecs: [],
    roomSpec: { at, islandRadius: 32, pylons, relays: placeStormRelays(at, 0) },
  }, scene);
  const pylon = dressing.peekRoom().parts.find((p) => p.root.name === 'storm_pylon_pylon_0');
  const coil = meshesUnder(pylon.root).find((m) => m.name === 'storm_pylon_coil');
  dressing.updateRoom(10, 1 / 60, {});
  const r0 = coil.rotation.z;
  dressing.updateRoom(11, 1, { reducedMotion: true });
  assert.ok(coil.rotation.z - r0 < 0.1, 'reduced motion slows the coil');
});

// ---- boss dressing ----

test('lawArenaBossDressing resolves the .09 roles on hull+role+law', () => {
  assert.equal(
    lawArenaBossDressing(CRYO_ARENA_ID, CRYO_BOSS_ROLE.hullId, CRYO_BOSS_ROLE.role).kind,
    'manifold_warden');
  assert.equal(
    lawArenaBossDressing(STORM_ARENA_ID, STORM_BOSS_ROLE.hullId, STORM_BOSS_ROLE.role).kind,
    'grid_tyrant');
  assert.equal(lawArenaBossDressing(CRYO_ARENA_ID, 'wasp_swarmer', 'elite'), null);
  assert.equal(lawArenaBossDressing(STORM_ARENA_ID, 'dreadnought_boss', 'mass'), null);
});

test('materializeWaveBatch stamps the .09 dressing kinds', () => {
  const h = boot();
  const ctx = { state: h.state, helpers: h.helpers };
  const cryo = materializeWaveBatch(ctx, {
    ownerId: 'w10', enemyId: 'dreadnought_boss', level: 4, count: 1,
    seed: SEED, wave: 10, role: 'elite', arenaId: CRYO_ARENA_ID,
  });
  assert.equal(h.state.entities.get(cryo.spawnedIds[0]).data.bossDressing.kind, 'manifold_warden');
  const storm = materializeWaveBatch(ctx, {
    ownerId: 'w10', enemyId: 'dreadnought_boss', level: 4, count: 1,
    seed: SEED, wave: 10, role: 'elite', arenaId: STORM_ARENA_ID,
  });
  assert.equal(h.state.entities.get(storm.spawnedIds[0]).data.bossDressing.kind, 'grid_tyrant');
});

test('manifold_warden dressing carries four tumbling arms on a collar and releases on kill', () => {
  const dressing = createLawArenaDressing();
  const entity = {
    id: 'boss-c', type: 'ship', alive: true, radius: 60,
    data: { bossDressing: { kind: 'manifold_warden' } },
  };
  const mesh = bossMesh();
  dressing.updateBossDressing(entity, mesh, 0, 1 / 60, {});
  const group = mesh.userData.hull.children.find((c) => c.name === 'manifold_warden_dressing');
  assert.ok(group, 'dressing attached under the hull');
  const collar = group.children.find((c) => c.name === 'manifold_collar');
  const arms = collar.children.filter((c) => c.name === 'manifold_arm');
  assert.equal(arms.length, 4);
  const armBase = arms[0].rotation.x;
  for (let i = 1; i <= 90; i++) dressing.updateBossDressing(entity, mesh, i / 60, 1 / 60, {});
  assert.ok(collar.rotation.x !== 0, 'collar rolls');
  assert.ok(Math.abs(arms[0].rotation.x - armBase) > 1e-3, 'arms gimbal');
  for (const m of meshesUnder(group)) {
    assert.ok(m.geometry.type !== 'PlaneGeometry' && m.type !== 'Sprite', 'real geometry');
  }
  entity.alive = false;
  dressing.updateBossDressing(entity, mesh, 2, 1 / 60, {});
  for (let i = 0; i < 10; i++) dressing.updateBossDressing(entity, mesh, 2.2 + i * 0.1, 0.1, {});
  assert.equal(mesh.userData.hull.children.find((c) => c.name === 'manifold_warden_dressing'), undefined);
});

test('grid_tyrant dressing orbits four relay drones around the hull', () => {
  const dressing = createLawArenaDressing();
  const entity = {
    id: 'boss-s', type: 'ship', alive: true, radius: 60,
    data: { bossDressing: { kind: 'grid_tyrant' } },
  };
  const mesh = bossMesh();
  dressing.updateBossDressing(entity, mesh, 0, 1 / 60, {});
  const group = mesh.userData.hull.children.find((c) => c.name === 'grid_tyrant_dressing');
  assert.ok(group);
  const ring = group.children.find((c) => c.name === 'tyrant_drone_ring');
  assert.equal(ring.children.filter((c) => c.children.some((d) => d.name === 'tyrant_drone')).length, 4);
  for (let i = 1; i <= 90; i++) dressing.updateBossDressing(entity, mesh, i / 60, 1 / 60, {});
  assert.ok(ring.rotation.x !== 0, 'drone ring orbits');
  dressing.prune(new Set());
  assert.equal(mesh.userData.hull.children.find((c) => c.name === 'grid_tyrant_dressing'), undefined);
});

test('the .08 lagrange/cinder path is undisturbed by the .09 gates', () => {
  const dressing = createLawArenaDressing();
  const scene = new THREE.Scene();
  dressing.handleInstall({
    arenaId: LAGRANGE_ARENA_ID,
    installedAtSim: 10,
    fieldSpecs: [
      { kind: 'well', center: { x: -180, z: 0 }, radius: 500, strength: 110 },
      { kind: 'well', center: { x: 180, z: 0 }, radius: 500, strength: 110 },
    ],
    toySpecs: [
      { id: 'ridge_shutter', kind: 'shutter', a: { x: 10, z: -36 }, b: { x: 10, z: 36 } },
      { id: 'throw_current', kind: 'current', center: { x: -156, z: 0 }, dir: { x: 1, z: 0 } },
    ],
  }, scene);
  const room = dressing.peekRoom();
  assert.equal(room.parts.filter((p) => p.root.name === 'law_pylon').length, 2,
    'real-strength wells still get their pylons');
  dressing.handleReleased();
});
