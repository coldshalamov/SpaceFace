// Runtime-owned POI proximity identification must toast the chart name, not a raw id or a
// humanized slug. A runtimeOwner POI (poi_rubric_marking_line, ...) mints no marker entity, so
// the identify path resolves no carrier data.name and the toast used to fall through to the
// internal id — later to the slug fallback — while rec.name already carried the authored label.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { SECTORS } from '../src/data/sectors.js';
import { world as worldProto } from '../src/systems/world.js';

const SECTOR_ID = 'sector_tethys_junction';
const RUBRIC_ID = 'poi_rubric_marking_line';
const SPLIT_ID = 'poi_tethys_split_station';

function sectorDefinition() {
  return SECTORS.find((sector) => sector.id === SECTOR_ID);
}

function poiDefinition(id) {
  return sectorDefinition()?.pois.find((poi) => poi.id === id);
}

function boot(seed = 4711) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 12;
  state.tick = 720;

  const bus = createBus();
  const log = [];
  const rawEmit = bus.emit.bind(bus);
  bus.emit = (event, payload) => {
    log.push({ event, payload });
    return rawEmit(event, payload);
  };

  let nextId = 1;
  const spawnEntity = (spec) => {
    const entity = {
      ...spec,
      id: nextId++,
      alive: spec.alive !== false,
      pos: { ...(spec.pos || { x: 0, z: 0 }) },
      vel: { ...(spec.vel || { x: 0, z: 0 }) },
      data: { ...(spec.data || {}) },
      flags: { ...(spec.flags || {}) },
    };
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
    return entity;
  };
  const registry = { get: () => null };
  const world = Object.assign({}, worldProto);
  world.init({ state, bus, helpers: { hash32, mulberry32, spawnEntity }, registry });

  state.world.currentSectorId = SECTOR_ID;
  const active = { id: SECTOR_ID, stations: [], fields: [], gates: [], pois: [], hazards: [] };
  const discovery = { discovered: true, visitedCount: 1, pois: {}, fieldsDepleted: {} };
  state.world.discovery[SECTOR_ID] = discovery;
  world._spawnPOIs(sectorDefinition(), active, discovery, () => 0.5);
  state.world.activeSector = active;

  // Runtime-owner POIs mint no marker entity: the projection rides active.pois alone, and the
  // player parks on its authored anchor so the proximity read identifies it on the first tick.
  const projection = active.pois.find((entry) => entry.poiId === RUBRIC_ID);
  const player = spawnEntity({
    type: 'ship', team: 0,
    pos: { x: projection.pos.x, z: projection.pos.z },
    vel: { x: 0, z: 0 }, radius: 10, hull: 100, hullMax: 100, data: {},
  });
  state.playerId = player.id;
  return { state, log, world, projection, player };
}

test('a runtime-owned POI identified by proximity toasts its chart name', () => {
  const rubric = poiDefinition(RUBRIC_ID);
  assert.equal(rubric.runtimeOwner, 'rubric', 'fixture: the marking line must be runtime-owned');
  assert.notEqual(rubric.name, rubric.id, 'fixture: the row must author a chart name');
  assert.notEqual(
    rubric.name,
    rubric.id.replace(/^poi_/, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    'fixture: the chart name must differ from the humanized slug, or the pin proves nothing',
  );

  const harness = boot();
  assert.equal(harness.projection.runtimeOwned, true, 'the projection must be the markerless shape');
  assert.equal(harness.projection.id, null, 'the projection must mint no marker entity');
  assert.equal(harness.projection.name, rubric.name, 'the projection must carry the chart name');

  harness.world._tickPOIScan(harness.state);

  const rec = harness.state.world.discovery[SECTOR_ID].pois[RUBRIC_ID];
  assert.equal(rec.identified, true, 'proximity must identify the runtime-owned POI');
  assert.equal(rec.name, rubric.name);

  const toasts = harness.log.filter((entry) => entry.event === 'toast'
    && /Landmark identified/.test(String(entry.payload?.text || '')));
  assert.ok(toasts.length >= 1, 'identification must toast');
  const rubricToast = toasts.find((entry) => entry.payload.text.includes(rubric.name));
  assert.ok(rubricToast, `the toast must carry the chart name "${rubric.name}" — `
    + `got: ${toasts.map((entry) => entry.payload.text).join(' | ')}`);
  assert.ok(!rubricToast.payload.text.includes(RUBRIC_ID), 'the toast must not leak the raw id');
});

test('every identified runtime-owned POI in the sector toasts its authored chart name, never a slug or id', () => {
  const harness = boot();

  const runtimePois = sectorDefinition().pois.filter((poi) => poi.runtimeOwner);
  assert.ok(runtimePois.length >= 2, 'fixture: the sector must field several runtime-owned POIs');
  // One proximity pass per site: the projections sit thousands of WU apart, so the player
  // parks on each anchor in turn and the scan identifies from there.
  for (const poi of runtimePois) {
    const projection = harness.state.world.activeSector.pois.find((entry) => entry.poiId === poi.id);
    harness.player.pos.x = projection.pos.x;
    harness.player.pos.z = projection.pos.z;
    harness.world._tickPOIScan(harness.state);
  }

  for (const poi of runtimePois) {
    const rec = harness.state.world.discovery[SECTOR_ID].pois[poi.id];
    assert.equal(rec.identified, true, `${poi.id} must identify by proximity`);
    const toast = harness.log.find((entry) => entry.event === 'toast'
      && String(entry.payload?.text || '').startsWith('Landmark identified: ')
      && entry.payload.text.includes(poi.name));
    assert.ok(toast, `${poi.id} must toast its chart name "${poi.name}"`);
    assert.ok(!toast.payload.text.includes(poi.id), `${poi.id}: the toast must not leak the raw id`);
    assert.equal(toast.payload.text, `Landmark identified: ${poi.name}`,
      `${poi.id}: the toast must be exactly the chart name, not the humanized slug`);
  }
  // The Split Station's chart name differs from its slug only by the leading article — the
  // exact-equality pin above is what catches the slug fallback.
  assert.equal(poiDefinition(SPLIT_ID).name, 'The Split Station');
});
