import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { SpatialHash } from '../src/core/spatialHash.js';
import { hasActiveSpatialHash } from '../src/core/spatialQuery.js';
import { nearestSubmittedInstanceDistanceSq, nearestSubmittedInstanceMetrics } from '../src/render/instanceChunkSubmitPolicy.js';
import { glassHalfExtents } from '../src/render/tabletopPolicy.js';
import { PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';
import { save } from '../src/save/saveSystem.js';
import { mines, MINE_TYPE, countOwnerMines } from '../src/systems/mines.js';
import { scanner } from '../src/systems/scanner.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
function src(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

test('interval autosave is on the live sim tick', () => {
  assert.equal(PRODUCTION_UPDATE_ORDER.at(-1), 'save');
});

test('spatial hash clear drops empty cell maps instead of leaking neighborhoods', () => {
  const hash = new SpatialHash(64);
  const body = { id: 1, alive: true, collides: true, pos: { x: 12000, z: -8000 }, radius: 8 };
  hash.rebuildLayers([], [body], 1);
  assert.ok(hash.buckets.size > 0);
  hash.clear();
  assert.equal(hash.buckets.size, 0);
  assert.equal(hash._staticBuckets.size, 0);
  assert.equal(hash._seenIds.size, 0);
  hash.rebuildLayers([], [body], 2);
  const out = [];
  hash.queryRadius(12000, -8000, 20, out);
  assert.equal(out.includes(body), true);
});

test('queryRadius helper drops dead bodies still sitting in the last hash sync', () => {
  const sim = createSimulation({ seed: 11 });
  const live = sim.spawn({ type: 'ship', pos: { x: 0, z: 0 }, radius: 10, collides: true });
  const dead = sim.spawn({ type: 'ship', pos: { x: 8, z: 0 }, radius: 10, collides: true });
  const hash = new SpatialHash(64);
  hash.rebuildLayers([], [live, dead], 1);
  sim.state.spatialHash = hash;
  assert.equal(hasActiveSpatialHash(hash), true);
  dead.alive = false;
  const nearby = sim.helpers.queryRadius({ x: 0, z: 0 }, 40);
  assert.equal(nearby.includes(live), true);
  assert.equal(nearby.includes(dead), false);
});

test('scan pulse still resolves a non-colliding wreck when the spatial hash is live', () => {
  const sim = createSimulation({ seed: 4701, systems: [scanner] });
  const { state } = sim;
  state.mode = 'flight';
  state.input.actions = state.input.actions || {};
  state.world.currentSectorId = 'sector_test_signals';
  state.world.activeSector = { id: 'sector_test_signals', pois: [] };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 10, hull: 100, hullMax: 100, collides: true, data: {},
  });
  state.playerId = player.id;
  const wreck = sim.spawn({
    type: 'wreck', team: 2, pos: { x: 80, z: 0 }, radius: 10, mass: 0, collides: false,
    data: { salvagePool: { cmdty_scrap_metal: 2 } },
  });
  const hash = new SpatialHash(64);
  hash.rebuildLayers([], [player], 1);
  state.spatialHash = hash;
  assert.equal(hasActiveSpatialHash(hash), true);

  state.input.actions.scanPulse = true;
  sim.runTicks(2);

  assert.equal(wreck.data.scanned, true);
  assert.ok(Array.isArray(wreck.data.manifest));
  assert.equal(wreck.data.manifest[0].qty, 2);
});

test('entity index keeps a dedicated live mine list', () => {
  const sim = createSimulation({ seed: 3251, systems: [mines] });
  const { state } = sim;
  state.mode = 'flight';
  const owner = sim.spawn({
    type: 'ship', team: 1, pos: { x: 400, z: 0 }, radius: 14, hull: 100, hullMax: 100, data: {},
  });
  const placed = sim.registry.get('mines').placeMine({
    ownerId: owner.id, pos: { x: 420, z: 0 }, team: 1,
  });
  assert.ok(placed);
  assert.equal(placed.type, MINE_TYPE);
  assert.equal(state.entityIndex.mines.length, 1);
  assert.equal(state.entityIndex.mines[0], placed);
  assert.equal(countOwnerMines(state, owner.id), 1);

  const impulse = sim.spawn({
    type: 'vectormine', pos: { x: 10, z: 0 }, collides: false, data: { ownerId: owner.id },
  });
  assert.equal(state.entityIndex.vectorMines.includes(impulse), true);
});

test('glass extents cache returns the same numbers without changing the picture', () => {
  const a = glassHalfExtents(144, 50, 16 / 9, 60);
  const b = glassHalfExtents(144, 50, 16 / 9, 60);
  assert.equal(a.halfX, b.halfX);
  assert.equal(a.halfZ, b.halfZ);
  const closer = glassHalfExtents(45, 50, 16 / 9, 60);
  assert.notEqual(closer.halfX, a.halfX);
});

test('instance-chunk nearest metrics match the previous two-pass numbers', () => {
  const array = new Float32Array(32);
  array[12] = 0;
  array[14] = 400;
  const chunk = {
    visibleIndices: new Set([0]),
    mesh: { instanceMatrix: { array } },
  };
  const metrics = nearestSubmittedInstanceMetrics(chunk, 0, 0);
  assert.equal(metrics.nearestSq, nearestSubmittedInstanceDistanceSq(chunk, 0, 0));
  assert.equal(metrics.nearestSq, 400 * 400);
  assert.equal(metrics.nearestAxis, 400);
});

test('event bus drops empty listener sets', () => {
  const bus = createBus();
  const fn = () => {};
  bus.on('foo', fn);
  assert.equal(bus._listeners.has('foo'), true);
  bus.off('foo', fn);
  assert.equal(bus._listeners.has('foo'), false);
});

test('credit pirate tolls never dump the hold, and sealed manifests charge only after cargo fits', () => {
  const parley = src('src/systems/pirateParley.js');
  assert.match(parley, /A credit demand that cannot settle must not dump the hold/);
  const missions = src('src/systems/missions.js');
  const cargoIdx = missions.indexOf('addCargo(state, inst.params.cmdtyId');
  const chargeIdx = missions.indexOf("reason: `collateral:${offer.id}`");
  assert.ok(cargoIdx > 0 && chargeIdx > cargoIdx, 'sealed cargo is tried before collateral is charged');
  const squad = src('src/ai/squad.js');
  assert.match(squad, /const hostile = contact\.hostile === true;/);
  assert.doesNotMatch(squad, /teamMismatch && contact\.threat/);
});

test('save.update requests interval autosave from playtime', () => {
  const sim = createSimulation({ seed: 9, systems: [save] });
  const reasons = [];
  const host = sim.registry.get('save');
  const original = host.requestAutosave;
  host.requestAutosave = function requestAutosave(reason, options) {
    reasons.push(reason);
    return original.call(this, reason, options);
  };
  sim.state.mode = 'flight';
  sim.state.settings.gameplay.autosaveIntervalS = 60;
  sim.state.meta.playtimeS = 60;
  host._lastAutosavePlaytime = 0;
  host._lastAutosaveAt = -Infinity;
  host.update(1 / 60, sim.state);
  assert.equal(reasons[0], 'interval');
});
