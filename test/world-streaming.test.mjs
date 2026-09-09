// M2 world/origin-trigger slice: galactic-global anchors + floating-origin owner in world.js.
// entity.pos remains authoritative global XZ; frameOrigin is runtime-only and never shifts entities.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { world as worldSystem } from '../src/systems/world.js';
import {
  COORDINATE_SCHEMA,
  FRAME_ORIGIN_QUANTUM_WU,
  FRAME_REBASE_THRESHOLD_WU,
  deriveFrameOrigin,
  shouldRebaseFrameOrigin,
  snapFrameOrigin,
} from '../src/core/coordinates.js';
import {
  SECTOR_GLOBAL_ORIGINS,
  corridorPlayableBounds,
  sectorGlobalOrigin,
  sectorLocalToGlobalForSector,
} from '../src/data/sectorCoordinates.js';
import { SECTORS } from '../src/data/sectors.js';

const HELIOS = 'sector_helios_prime';
const CERES = 'sector_ceres_belt';
const TETHYS = 'sector_tethys_junction';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORLD_SRC = readFileSync(join(__dirname, '../src/systems/world.js'), 'utf8');

function sectorData(id) {
  return SECTORS.find((s) => s.id === id);
}

function bootWorld(seed = 42) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.meta.seed = seed;
  const bus = createBus();
  const helpers = {};
  const ctx = { state, bus, helpers, registry: null };
  core.init(ctx);
  const player = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 0, z: 0 },
    radius: 4,
    mass: 12,
    hull: 100,
    hullMax: 100,
    collides: true,
  });
  state.playerId = player.id;
  const world = Object.assign(Object.create(worldSystem), {});
  world.init(ctx);
  return { state, bus, helpers, world, player };
}

function captureEntitySnapshot(state) {
  const out = [];
  for (const e of state.entityList) {
    if (!e || !e.alive) continue;
    out.push({
      id: e.id,
      type: e.type,
      pos: { x: e.pos.x, z: e.pos.z },
      vel: e.vel ? { x: e.vel.x, z: e.vel.z } : null,
    });
  }
  out.sort((a, b) => a.id - b.id);
  return out;
}

function nextRngValue(rng) {
  // Capture the next draw without permanently consuming a shared stream: clone via re-seed is
  // unavailable for mulberry32 closures, so callers snapshot by drawing once and comparing.
  return rng();
}

test('newGame stamps coordinateSchema global_v1 and zero frame origin', () => {
  const { state, world } = bootWorld(7);
  state.world.coordinateSchema = 'legacy';
  state.world.frameOrigin = { x: 9999, z: -8888 };
  state.world.frameOriginSeq = 12;
  world.newGame();
  assert.equal(state.world.coordinateSchema, COORDINATE_SCHEMA);
  assert.equal(state.world.coordinateSchema, 'global_v1');
  assert.deepEqual(state.world.frameOrigin, { x: 0, z: 0 });
  assert.equal(state.world.frameOriginSeq, 0);
});

test('far-sector authored anchors land at sector-local + sector origin (exactly once)', () => {
  const { state, world } = bootWorld(11);
  world.enterSector(CERES);

  const origin = sectorGlobalOrigin(CERES);
  assert.ok(origin.x !== 0 || origin.z !== 0, 'Ceres must not share Helios origin');
  assert.deepEqual(origin, SECTOR_GLOBAL_ORIGINS[CERES]);

  const authored = sectorData(CERES);
  const stations = state.world.activeSector.stations;
  assert.ok(stations.length >= 1);

  for (const st of stations) {
    const def = (authored.stations || []).find((s) => s.id === st.stationId);
    assert.ok(def && def.pos, `missing authored station ${st.stationId}`);
    const expected = sectorLocalToGlobalForSector(def.pos, CERES);
    assert.equal(st.pos.x, expected.x);
    assert.equal(st.pos.z, expected.z);
    const ent = state.entities.get(st.id);
    assert.ok(ent);
    assert.equal(ent.pos.x, expected.x);
    assert.equal(ent.pos.z, expected.z);
    // Not left as pure sector-local.
    assert.ok(Math.abs(ent.pos.x - def.pos.x) > 1 || Math.abs(origin.x) < 1);
  }

  for (const gate of state.world.activeSector.gates) {
    const def = (authored.gates || []).find((g) => g.to === gate.to);
    if (!def || !def.pos) continue;
    const expected = sectorLocalToGlobalForSector(def.pos, CERES);
    assert.equal(gate.pos.x, expected.x);
    assert.equal(gate.pos.z, expected.z);
  }

  for (const poi of state.world.activeSector.pois) {
    const def = (authored.pois || []).find((p) => p.id === poi.poiId);
    if (!def || !def.pos) continue;
    const expected = sectorLocalToGlobalForSector(def.pos, CERES);
    assert.equal(poi.pos.x, expected.x);
    assert.equal(poi.pos.z, expected.z);
  }

  for (const field of state.world.activeSector.fields) {
    const def = (authored.fields || []).find((f) => f.id === field.id);
    if (!def || !def.center) continue;
    const expected = sectorLocalToGlobalForSector(def.center, CERES);
    assert.equal(field.center.x, expected.x);
    assert.equal(field.center.z, expected.z);
  }

  for (const hz of state.world.activeSector.hazards) {
    // Hazard centers are authored local; live records must be global.
    const match = (authored.hazards || []).find(
      (h) => h.type === hz.type && h.radius === hz.radius,
    );
    if (!match) continue;
    const expected = sectorLocalToGlobalForSector(match.center, CERES);
    assert.equal(hz.center.x, expected.x);
    assert.equal(hz.center.z, expected.z);
  }

  // M2a: corridor sectors use a center-aware outer fence, not a single-sector disk trap.
  const corridorBounds = corridorPlayableBounds(SECTORS);
  assert.equal(state.bounds.center.x, corridorBounds.center.x);
  assert.equal(state.bounds.center.z, corridorBounds.center.z);
  assert.equal(state.bounds.radius, corridorBounds.radius);
  assert.ok(state.bounds.radius > (authored.worldRadius || 4000));
});

test('local relative geometry is preserved under global composition', () => {
  const { state, world } = bootWorld(13);
  world.enterSector(CERES);
  const authored = sectorData(CERES);
  const a = authored.stations[0];
  const b = authored.stations[1];
  assert.ok(a && b && a.pos && b.pos);
  const localDx = b.pos.x - a.pos.x;
  const localDz = b.pos.z - a.pos.z;

  const sa = state.world.activeSector.stations.find((s) => s.stationId === a.id);
  const sb = state.world.activeSector.stations.find((s) => s.stationId === b.id);
  assert.ok(sa && sb);
  assert.equal(sb.pos.x - sa.pos.x, localDx);
  assert.equal(sb.pos.z - sa.pos.z, localDz);

  // Gate-to-station relative vectors match authored local geometry.
  const gateDef = authored.gates[0];
  const gate = state.world.activeSector.gates.find((g) => g.to === gateDef.to);
  assert.ok(gate);
  assert.equal(gate.pos.x - sa.pos.x, gateDef.pos.x - a.pos.x);
  assert.equal(gate.pos.z - sa.pos.z, gateDef.pos.z - a.pos.z);
});

test('enterSector entry point is galactic-global for the target sector', () => {
  const { state, world, player } = bootWorld(17);
  // First enter Helios so from-sector is known, then jump path into Ceres via enterSector opts.
  world.enterSector(HELIOS);
  assert.equal(state.world.entryPoint.x, 0);
  assert.equal(state.world.entryPoint.z, 0);

  // Seed a non-zero frame origin; enterSector must not force it back to zero.
  state.world.frameOrigin.x = 4096;
  state.world.frameOrigin.z = -4096;
  state.world.frameOriginSeq = 2;
  const seqBefore = state.world.frameOriginSeq;

  world.enterSector(CERES, { fromSectorId: HELIOS, fromJump: true, via: 'gate' });
  const origin = sectorGlobalOrigin(CERES);
  const entry = state.world.entryPoint;
  // Entry is not pure sector-local near zero for a neighbor arrival (gate approach).
  assert.ok(Math.hypot(entry.x - origin.x, entry.z - origin.z) > 1000);
  // Entry is expressed in global space (near Ceres origin magnitude).
  assert.ok(Math.hypot(entry.x, entry.z) > Math.hypot(origin.x, origin.z) * 0.5);

  assert.equal(player.pos.x, entry.x);
  assert.equal(player.pos.z, entry.z);

  // Do not reset frame origin on sector enter.
  assert.equal(state.world.frameOrigin.x, 4096);
  assert.equal(state.world.frameOrigin.z, -4096);
  assert.equal(state.world.frameOriginSeq, seqBefore);
});

test('rebasing mutates only frameOrigin/seq and leaves every entity global pose untouched', () => {
  const { state, bus, world, player } = bootWorld(19);
  world.enterSector(HELIOS);

  // Place player past rebase threshold; keep other entities at their global anchors.
  player.pos.x = FRAME_REBASE_THRESHOLD_WU + 100;
  player.pos.z = -FRAME_REBASE_THRESHOLD_WU - 50;
  player.vel.x = 3.5;
  player.vel.z = -1.25;
  state.simTime = 44.5;
  state.tick = 9001;

  const before = captureEntitySnapshot(state);
  const simTime = state.simTime;
  const tick = state.tick;
  // Draw once from rng after snapshotting the function identity; compare a second stream step
  // by capturing the value drawn immediately after the update (state.rng must be the same fn
  // and the next draw must match a virgin draw sequence only if we clone — instead we verify
  // the RNG function reference is unchanged and a pre-drawn value equals the post path when
  // no systems consume rng on the no-spawn origin path).
  const rngRef = state.rng;
  const worldRngRef = state.world.rng;

  const shifts = [];
  bus.on('world:originShift', (p) => shifts.push(p));

  world.update(1 / 60, state);

  assert.equal(shifts.length, 1, 'origin shift must fire exactly once');
  const receipt = shifts[0];
  assert.deepEqual(receipt.previous, { x: 0, z: 0 });
  const expectedNext = snapFrameOrigin(player.pos);
  assert.deepEqual(receipt.next, expectedNext);
  assert.equal(receipt.seq, 1);
  assert.deepEqual(state.world.frameOrigin, expectedNext);
  assert.equal(state.world.frameOriginSeq, 1);

  const after = captureEntitySnapshot(state);
  assert.deepEqual(after, before);
  assert.equal(state.simTime, simTime);
  assert.equal(state.tick, tick);
  assert.equal(state.rng, rngRef);
  assert.equal(state.world.rng, worldRngRef);
  assert.equal(player.vel.x, 3.5);
  assert.equal(player.vel.z, -1.25);
});

test('origin shift is threshold/quantum deterministic and fires once per actual shift', () => {
  const { state, bus, world, player } = bootWorld(23);
  world.enterSector(HELIOS);

  const shifts = [];
  bus.on('world:originShift', (p) => shifts.push({ ...p, next: { ...p.next }, previous: { ...p.previous } }));

  // Below threshold: no shift.
  player.pos.x = FRAME_REBASE_THRESHOLD_WU - 1;
  player.pos.z = 0;
  assert.equal(shouldRebaseFrameOrigin(player.pos, state.world.frameOrigin), false);
  world.update(1 / 60, state);
  assert.equal(shifts.length, 0);
  assert.deepEqual(state.world.frameOrigin, { x: 0, z: 0 });
  assert.equal(state.world.frameOriginSeq, 0);

  // Inclusive threshold: shift to snapped quantum.
  player.pos.x = FRAME_REBASE_THRESHOLD_WU;
  player.pos.z = 0;
  assert.equal(shouldRebaseFrameOrigin(player.pos, state.world.frameOrigin), true);
  const expected = deriveFrameOrigin(player.pos, state.world.frameOrigin);
  assert.deepEqual(expected, { x: FRAME_ORIGIN_QUANTUM_WU * 2, z: 0 }); // 8192
  world.update(1 / 60, state);
  assert.equal(shifts.length, 1);
  assert.deepEqual(state.world.frameOrigin, expected);
  assert.equal(state.world.frameOriginSeq, 1);

  // Same focus again: no second event, no seq bump.
  world.update(1 / 60, state);
  world.update(1 / 60, state);
  assert.equal(shifts.length, 1);
  assert.equal(state.world.frameOriginSeq, 1);

  // Move past threshold relative to current origin: second shift only.
  player.pos.x = state.world.frameOrigin.x + FRAME_REBASE_THRESHOLD_WU + 10;
  player.pos.z = FRAME_ORIGIN_QUANTUM_WU * 1.2;
  world.update(1 / 60, state);
  assert.equal(shifts.length, 2);
  assert.equal(state.world.frameOriginSeq, 2);
  assert.deepEqual(shifts[1].previous, shifts[0].next);
  assert.equal(shifts[1].seq, 2);
});

test('serialization keeps global coordinates; frame origin remains runtime-only', () => {
  const { state, world } = bootWorld(29);
  world.enterSector(CERES);
  state.world.frameOrigin = { x: 12288, z: -4096 };
  state.world.frameOriginSeq = 5;

  const station = state.world.activeSector.stations[0];
  const globalPos = { x: station.pos.x, z: station.pos.z };
  assert.ok(Math.abs(globalPos.x) > 1000);

  // Inject a global scan ping / pending spawn to prove overlay passthrough.
  state.world.scanPings = {
    [CERES]: [{ id: 'ping_a', pos: { x: globalPos.x + 10, z: globalPos.z - 5 }, kind: 'unknown' }],
  };
  state.world.pendingSpawns = {
    [TETHYS]: [{
      entityType: 'pirate',
      sectorId: TETHYS,
      position: { x: sectorGlobalOrigin(TETHYS).x + 50, z: sectorGlobalOrigin(TETHYS).z + 25 },
      count: 1,
      tags: [],
    }],
  };

  const data = world.serialize();
  assert.equal(data.coordinateSchema, 'global_v1');
  assert.equal('frameOrigin' in data, false);
  assert.equal('frameOriginSeq' in data, false);
  assert.deepEqual(data.scanPings[CERES][0].pos, { x: globalPos.x + 10, z: globalPos.z - 5 });
  assert.deepEqual(
    data.pendingSpawns[TETHYS][0].position,
    { x: sectorGlobalOrigin(TETHYS).x + 50, z: sectorGlobalOrigin(TETHYS).z + 25 },
  );

  // After deserialize, runtime frame is reset; global overlays preserved.
  state.world.frameOrigin = { x: 1, z: 1 };
  state.world.frameOriginSeq = 99;
  world.deserialize(data);
  assert.equal(state.world.coordinateSchema, 'global_v1');
  assert.deepEqual(state.world.frameOrigin, { x: 0, z: 0 });
  assert.equal(state.world.frameOriginSeq, 0);
  assert.deepEqual(state.world.scanPings[CERES][0].pos, { x: globalPos.x + 10, z: globalPos.z - 5 });
});

test('no Math.random or Date.now call sites in world system source', () => {
  // Strip line comments so policy docs like "never Math.random()" do not false-positive.
  const code = WORLD_SRC.replace(/\/\/.*$/gm, '');
  assert.equal(/Math\.random\s*\(/.test(code), false);
  assert.equal(/Date\.now\s*\(/.test(code), false);
});

test('Helios authored anchors stay at local offsets when sector origin is zero', () => {
  const { state, world } = bootWorld(31);
  world.enterSector(HELIOS);
  const authored = sectorData(HELIOS);
  for (const st of state.world.activeSector.stations) {
    const def = (authored.stations || []).find((s) => s.id === st.stationId);
    assert.ok(def && def.pos);
    assert.equal(st.pos.x, def.pos.x);
    assert.equal(st.pos.z, def.pos.z);
  }
  // Corridor outer fence is global/center-aware (not pinned to Helios origin alone).
  const corridorBounds = corridorPlayableBounds(SECTORS);
  assert.deepEqual(state.bounds.center, corridorBounds.center);
  assert.equal(state.bounds.radius, corridorBounds.radius);
});
