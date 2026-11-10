// CPU fixtures use the real World/catalog and chart owners. Player flight remains a separate
// ordinary-input check; moving the fixture pilot below is not evidence of flying the ring.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { SECTORS } from '../src/data/sectors.js';
import { VX_FREE_DRIVE_POI, VX_FREE_DRIVE_SECTOR_ID, VX_FREE_DRIVE_MARKERS }
  from '../src/data/vxFreeDriveRing.js';
import { sectorExplorationProgress } from '../src/world/explorationJournal.js';
import { world as worldProto } from '../src/systems/world.js';

// Enable the real inspector's string-building path without creating a browser/GPU context.
globalThis.document = {};
const { buildSystemModel, commitCoursePayload, galaxyMapScreen } = await import('../src/ui/galaxyMap.js');

const SID = VX_FREE_DRIVE_SECTOR_ID;
const BASE = SECTORS.find((sector) => sector.id === SID);

function boot() {
  const state = createGameState(4242);
  const bus = createBus();
  const events = [];
  const emit = bus.emit.bind(bus);
  bus.emit = (event, payload) => { events.push({ event, payload }); return emit(event, payload); };
  let nextId = 1;
  const spawnEntity = (spec) => {
    const entity = { ...spec, id: nextId++, alive: true, pos: { ...spec.pos },
      vel: { x: 0, z: 0 }, data: { ...spec.data }, flags: { ...spec.flags } };
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
    return entity;
  };
  const world = Object.create(worldProto);
  world.init({ state, bus, helpers: { hash32, mulberry32, spawnEntity }, registry: { get: () => null } });
  world.newGame();
  state.mode = 'flight';
  state.world.currentSectorId = SID;
  const player = spawnEntity({ type: 'ship', pos: { x: 0, z: 0 }, team: 0, radius: 14 });
  state.playerId = player.id;
  return { state, bus, events, world, player };
}

function materializePois(harness, sector = harness.state.world.sectors[SID]) {
  const active = harness.world._emptySectorBag();
  const disc = harness.world._discoveryFor(SID);
  const source = mulberry32(4242);
  let draws = 0;
  const rng = () => { draws++; return source(); };
  harness.world._spawnPOIs(sector, active, disc, rng);
  harness.state.world.activeSector = active;
  return { active, disc, draws, nextDraw: source() };
}

test('public Helios catalog exposes one unscored Cracker Run fix at an existing ghost buoy', () => {
  const { state, world } = boot();
  const sector = state.world.sectors[SID];
  const poi = sector.pois.find((row) => row.id === VX_FREE_DRIVE_POI.id);
  assert.equal(poi.name, 'Cracker Run');
  assert.deepEqual(poi.pos, VX_FREE_DRIVE_MARKERS[0].localPos);
  const yard = BASE.pois.find((row) => row.id === 'poi_helios_yard');
  assert.equal(!!poi.hidden, !!yard.hidden, 'same public eligibility as the nearby yard');
  assert.equal(poi.gatedBy, undefined);
  assert.equal(poi.machineGate, undefined);
  assert.deepEqual(sectorExplorationProgress(state, sector), sectorExplorationProgress(state, BASE),
    'navigation identity adds no paid find, chart requirement or survey reward');
  world._registerFreeDriveRingPoi();
  assert.equal(sector.pois.filter((row) => row.id === poi.id).length, 1);
  assert.equal(BASE.pois.some((row) => row.id === poi.id), false, 'static Atlas is not mutated');
  assert.equal(state.world.sectors.sector_ceres_belt.pois, SECTORS.find((s) => s.id === 'sector_ceres_belt').pois,
    'the separate Ceres machinery catalog is untouched');
});

test('navigation registration adds no body and preserves the original content RNG stream', () => {
  const old = boot();
  const added = boot();
  const before = materializePois(old, BASE);
  const after = materializePois(added);
  assert.equal(after.draws, before.draws);
  assert.equal(after.nextDraw, before.nextDraw);
  assert.deepEqual(added.state.entityList, old.state.entityList, 'all original physical/marker identities stay identical');
  assert.deepEqual(after.active.pois.filter((row) => row.poiId !== VX_FREE_DRIVE_POI.id), before.active.pois);
  const projection = after.active.pois.find((row) => row.poiId === VX_FREE_DRIVE_POI.id);
  assert.equal(projection.id, null);
  assert.equal(projection.runtimeOwned, true);
  assert.deepEqual(projection.pos, added.world._toGlobal(VX_FREE_DRIVE_POI.pos, SID));
  assert.deepEqual(after.disc.pois[VX_FREE_DRIVE_POI.id], { discovered: false, identified: false });
});

test('ordinary proximity identifies the named yard once and cold World restore retains it', () => {
  const h = boot();
  const { active } = materializePois(h);
  const projection = active.pois.find((row) => row.poiId === VX_FREE_DRIVE_POI.id);
  // Explicit fixture staging at scanner ranges; no debug discovery flags or rewards.
  h.player.pos = { x: projection.pos.x + 401, z: projection.pos.z };
  h.world._tickPOIScan(h.state);
  const record = h.state.world.discovery[SID].pois[VX_FREE_DRIVE_POI.id];
  assert.equal(record.discovered, false);
  h.player.pos.x = projection.pos.x + 300;
  h.world._tickPOIScan(h.state);
  assert.equal(record.discovered, true);
  assert.equal(record.identified, false);
  h.player.pos.x = projection.pos.x + 199;
  h.world._tickPOIScan(h.state);
  h.world._tickPOIScan(h.state);
  assert.equal(record.identified, true);
  assert.equal(record.name, 'Cracker Run');
  assert.equal(h.events.filter((row) => row.event === 'poi:identified' && row.payload.poiId === VX_FREE_DRIVE_POI.id).length, 1);
  assert.equal(h.events.some((row) => row.event === 'economy:grantCredits'), false);

  const saved = JSON.parse(JSON.stringify(h.world.serialize()));
  const cold = boot();
  cold.world.deserialize(saved);
  materializePois(cold);
  assert.deepEqual(cold.state.world.discovery[SID].pois[VX_FREE_DRIVE_POI.id], record);
  assert.equal(cold.state.world.sectors[SID].pois.filter((row) => row.id === VX_FREE_DRIVE_POI.id).length, 1);
  cold.world._tickPOIScan(cold.state);
  assert.equal(cold.events.some((row) => row.event === 'poi:identified' && row.payload.poiId === VX_FREE_DRIVE_POI.id), false);
});

function inspectorHtml(state, target) {
  let html = null;
  const screen = Object.assign(Object.create(galaxyMapScreen), {
    _ctx: { state }, _root: { querySelector: () => null }, _selectedTarget: target,
    _activeTab: 'overview', _inspectorDetails: {}, _setCourseButton: {},
    _syncPublicIdentity() {}, _updateEngageControl() {}, _updatePlotControl() {},
    _renderTabs() {}, _renderPlaceActions() {}, _renderNoteSlot() {},
    _paintInspectorBody(_state, _details, _button, selectionHtml) { html = selectionHtml; },
  });
  screen._updateInspector();
  return html;
}

test('real chart model, selected-POI reader and course intent retain the yard instructions', () => {
  const h = boot();
  const target = buildSystemModel(h.state, SID).points.find((row) => row.id === VX_FREE_DRIVE_POI.id);
  assert.ok(target, 'the ordinary System model contains the public named place before close discovery');
  assert.equal(target.name, 'Cracker Run');
  assert.equal(target.chartNote, VX_FREE_DRIVE_POI.chartNote);
  assert.deepEqual({ x: target.x, z: target.z }, h.world._toGlobal(VX_FREE_DRIVE_POI.pos, SID));
  const html = inspectorHtml(h.state, target);
  assert.ok(html.includes(VX_FREE_DRIVE_POI.chartNote));
  assert.match(html, /Unscored free flying.*solid berth ribs.*low road.*Helios Claim Cracker.*warning.*southward shove.*calm/);
  assert.ok(inspectorHtml(h.state, { ...target, chartNote: '<script>unsafe & raw</script>' })
    .includes('&lt;script&gt;unsafe &amp; raw&lt;/script&gt;'), 'authored notes are escaped');
  const ordinary = buildSystemModel(h.state, SID).points.find((row) => row.id === 'poi_helios_yard');
  assert.equal(ordinary.chartNote, undefined, 'ordinary POIs gain no invented description');

  const payload = commitCoursePayload(h.state, target);
  assert.deepEqual(payload.pos, { x: target.x, z: target.z });
  assert.equal(payload.label, 'Cracker Run');
  assert.equal(payload.waypointKind, 'local');
  const screen = Object.assign(Object.create(galaxyMapScreen), {
    _ctx: h, _visible: true, _previewPts: null, refresh() {}, _draw() {}, _wake() {},
  });
  assert.equal(screen._commitCourse(target), true);
  assert.deepEqual(h.events.find((row) => row.event === 'ui:setCourse').payload, payload);
  assert.equal(h.events.some((row) => /mission|race|score|lease/i.test(row.event)), false);
});
