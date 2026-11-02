// Finish Lane 3 — galaxy-map commit/route truth (.devshots/finish/lane3/fix-galaxymap/PACKET.md).
// The chart's commit gestures, its LOCAL wheel, its trade-lane rows and its inspector copy.
// Run: node --test --test-isolation=none test/galaxy-map-commit-route-truth.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildLocalModel, commitCoursePayload, galaxyMapScreen, galaxyPresenceInspectorHtml,
  mapSearchTargetPriority } from '../src/ui/galaxyMap.js';
import { SECTORS } from '../src/data/sectors.js';
import { REGIONAL_ECONOMY_PROFILES } from '../src/data/regionalEconomyProfiles.js';

function recordingBus() {
  const events = [];
  return {
    events,
    emit(name, payload) { events.push({ name, payload }); },
    names() { return events.map((e) => e.name); },
    find(name) { return events.find((e) => e.name === name) || null; },
  };
}

function chartState(currentSectorId = 'sector_helios_prime') {
  const sectors = {};
  for (const s of SECTORS) sectors[s.id] = { ...s, neighbors: (s.neighbors || []).slice() };
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, hull: 100, hullMax: 100, data: {} };
  return {
    mode: 'flight',
    playerId: 1,
    player: { heat: 0 },
    entities: new Map([[1, player]]),
    entityList: [player],
    world: { currentSectorId, sectors, discovered: Object.keys(sectors) },
    nav: { route: null, waypoint: null, autopilot: null },
  };
}

/** A headless chart: the real screen methods over a recording bus, DOM-free. */
function headlessChart(state) {
  const bus = recordingBus();
  const chart = Object.create(galaxyMapScreen);
  chart._ctx = { state, bus };
  chart._visible = true;
  chart._previewPts = null;
  chart.refresh = () => {};
  chart._draw = () => {};
  chart._wake = () => {};
  return { chart, bus };
}

const helios = SECTORS.find((s) => s.id === 'sector_helios_prime');
const neighbourId = helios.neighbors[0];
const neighbourIds = new Set(helios.neighbors);
const farSector = SECTORS.find((s) => s.id !== helios.id && !neighbourIds.has(s.id));

test('double-click / released line on a neighbour emits world:requestJump with the chosen sector', () => {
  const { chart, bus } = headlessChart(chartState());
  const target = { kind: 'sector', id: neighbourId, sectorId: neighbourId, name: 'Neighbour' };
  assert.equal(chart._commitCourse(target), true);
  const jump = bus.find('world:requestJump');
  assert.ok(jump, `commit must emit world:requestJump (got ${bus.names().join(', ')})`);
  assert.equal(jump.payload.targetSectorId, neighbourId);
  assert.equal(jump.payload.via, 'gate');
  const course = bus.find('ui:setCourse');
  assert.ok(course && course.payload.sectorId === neighbourId, 'the course is armed toward the same sector');
  assert.ok(bus.names().includes('ui:popScreen'), 'a jump is a commitment the pilot leaves the chart with');
});

test('chart contact model exposes only explicitly targetable payloads and binds the course to that body', () => {
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, data: {} };
  const buoy = { id: 44, type: 'payload', alive: true, pos: { x: 310, z: -35 },
    data: { name: '44-C loose lane buoy', worldSiteTargetable: true, missionTag: 'm_44c' } };
  const ordinaryCargo = { id: 45, type: 'payload', alive: true, pos: { x: 320, z: -35 },
    data: { name: 'Unclaimed cargo' } };
  const sector = { id: 'sector_glyph_test', name: 'Local Test', position: { x: 0, z: 0 }, stations: [] };
  const state = {
    mode: 'flight', playerId: player.id, player: { targetId: null },
    world: { currentSectorId: sector.id }, content: { sectors: [sector] },
    ui: { trackedMissionId: 'm_44c' },
    missions: { active: [{ id: 'm_44c', status: 'active', targetEntityIds: [buoy.id] }] },
    entities: new Map([[player.id, player], [buoy.id, buoy], [ordinaryCargo.id, ordinaryCargo]]),
    entityList: [player, buoy, ordinaryCargo], nav: { route: null, waypoint: null, autopilot: null },
    entityIndex: { __spacefaceEntityIndexV1: true, ready: true, shipLike: [], stations: [],
      asteroids: [], payloads: [buoy, ordinaryCargo] },
  };
  const model = buildLocalModel(state, () => false);
  const objective = model.contacts.find((contact) => contact.id === buoy.id);
  assert.ok(objective, 'the explicitly targetable authored mission payload is a local chart contact');
  assert.equal(model.contacts.some((contact) => contact.id === ordinaryCargo.id), false,
    'ordinary cargo remains outside the public target/search list');
  assert.equal(mapSearchTargetPriority(state, objective), 950,
    'the tracked contract target is promoted above a coincidental static map-name match');
  const course = commitCoursePayload(state, objective);
  assert.equal(course.type, 'payload');
  assert.equal(course.label, buoy.data.name);
  assert.equal(course.targetEntityId, buoy.id, 'chart course keeps the exact live payload binding');
});

test('a multi-hop commit plots (route + course), never jumps, and keeps the chart open for Engage', () => {
  assert.ok(farSector, 'fixture needs a non-neighbour sector');
  const { chart, bus } = headlessChart(chartState());
  const target = { kind: 'sector', id: farSector.id, sectorId: farSector.id, name: farSector.name };
  assert.equal(chart._commitCourse(target), true);
  assert.equal(bus.find('world:requestJump'), null);
  assert.equal(bus.find('world:requestRoute').payload.targetSectorId, farSector.id);
  assert.equal(bus.find('ui:setCourse').payload.sectorId, farSector.id);
  assert.ok(!bus.names().includes('ui:popScreen'), 'the plot must not dismiss the only Engage control');
});

test('a closed gate refuses out loud and arms nothing', () => {
  const { chart, bus } = headlessChart(chartState());
  const gate = { kind: 'gate', closed: true, x: 100, z: 200, name: 'Vale Gate', targetSectorId: neighbourId };
  assert.equal(chart._commitCourse(gate), false);
  assert.equal(bus.find('ui:setCourse'), null);
  assert.equal(bus.find('world:requestJump'), null);
  const toast = bus.find('toast');
  assert.ok(toast && toast.payload.text, 'the refusal is voiced');
});

test('LOCAL wheel zooms (cam.zoom moves) and the world point under the cursor stays put', () => {
  const { chart } = headlessChart(chartState());
  const field = { x: 0, y: 0, width: 800, height: 600 };
  const cam = { cx: 500, cy: -300, zoom: 1.5 };
  Object.assign(chart, {
    _hub: null,
    _zoom: 4,
    _targetZoom: 4,
    _cams: { galaxy: { cx: 0, cy: 0, zoom: 1 }, system: { cx: 0, cy: 0, zoom: 1.5 }, local: cam },
    _view: { level: 'local', baseScale: 0.4 },
    _canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) },
    _activeLevel: () => 'local',
    _clearField: () => field,
    _syncScaleButtons: () => {},
    _triggerIris: () => {},
  });
  const baseScale = 0.4;
  const fieldCx = 400, fieldCy = 300;
  // Inverse of _drawLocal's sx/sz: screen -> world.
  const worldAt = (mx, my) => ({
    x: cam.cx - (mx - fieldCx) / (baseScale * cam.zoom),
    z: cam.cy - (my - fieldCy) / (baseScale * cam.zoom),
  });
  const mx = 610, my = 170;
  const before = worldAt(mx, my);
  chart._onWheel({ preventDefault() {}, clientX: mx, clientY: my, deltaY: -100 });
  assert.ok(Math.abs(cam.zoom - 1.5 * 1.15) < 1e-9, `cam.zoom must scale with the notch (got ${cam.zoom})`);
  const after = worldAt(mx, my);
  assert.ok(Math.abs(after.x - before.x) < 1e-6 && Math.abs(after.z - before.z) < 1e-6,
    'cursor-anchored: the point under the cursor does not slide');
  chart._onWheel({ preventDefault() {}, clientX: mx, clientY: my, deltaY: 100 });
  assert.ok(Math.abs(cam.zoom - 1.5) < 1e-9, 'a notch back restores the scale');
});

test('a remote trade-lane row plots the destination sector, keeps nav.route, and stays on the chart', () => {
  const state = chartState('sector_helios_prime');
  const ceres = SECTORS.find((s) => (s.stations || []).some((st) => st.id === 'station_ceres'));
  assert.ok(ceres && ceres.id !== 'sector_helios_prime', 'fixture: station_ceres lives in another sector');
  const { chart, bus } = headlessChart(state);
  chart._updateEngageControl = () => {};
  chart._updateRailSections = () => {};
  chart._activateTradeLane('station_ceres');
  const course = bus.find('ui:setCourse');
  assert.ok(course, 'the lane arms a course');
  assert.equal(course.payload.type, 'sector', 'a sector plot, never a positional fix that nulls nav.route');
  assert.equal(course.payload.pos, undefined);
  assert.equal(course.payload.sectorId, ceres.id);
  assert.equal(bus.find('world:requestRoute').payload.targetSectorId, ceres.id);
  assert.equal(bus.find('world:requestJump'), null, 'plotting is not jumping');
  assert.ok(!bus.names().includes('ui:popScreen'), 'the chart stays open');
});

test('inspector copy: presence phase, services, hazards and the economy dossier are words, not ids', () => {
  const presence = galaxyPresenceInspectorHtml([
    { factionId: 'faction_verge_layers', factionName: 'Verge', color: '#fff', phase: 'observer' },
  ]);
  assert.match(presence, /Watching/);
  assert.doesNotMatch(presence, />observer</);

  const state = chartState('sector_helios_prime');
  state.world.sectors.sector_helios_prime.stations = [
    { id: 'station_test_yard', services: ['black_market', 'module_craft', 'scan_tech', 'ore_buy'] },
  ];
  const { chart } = headlessChart(state);
  chart._selectedTarget = { kind: 'sector', id: 'sector_helios_prime', sectorId: 'sector_helios_prime' };
  const services = chart._servicesTabHtml(state);
  for (const raw of ['black_market', 'module_craft', 'scan_tech', 'ore_buy', '>station_test_yard<']) {
    assert.ok(!services.includes(raw), `services tab must not print ${raw}`);
  }
  assert.match(services, /Black Market/);
  assert.match(services, /Module Craft/);
  assert.match(services, /Ore buy/);
  assert.match(services, /Test Yard/);

  const profile = REGIONAL_ECONOMY_PROFILES.find((p) => p && p.identityKey && p.identityKey.includes('_'));
  assert.ok(profile, 'fixture: an economy profile with an id-shaped identity key');
  const sectorId = profile.sectorId || (Array.isArray(profile.sectorIds) ? profile.sectorIds[0] : null);
  assert.ok(sectorId, 'fixture: profile names its sector');
  const threatState = chartState(sectorId);
  threatState.world.sectors[sectorId].hazards = [{ type: 'dense_asteroid' }];
  const threat = headlessChart(threatState).chart;
  threat._selectedTarget = { kind: 'sector', id: sectorId, sectorId };
  const html = threat._threatTabHtml(threatState);
  assert.ok(!html.includes(profile.identityKey), `identity must not print ${profile.identityKey}`);
  assert.ok(!html.includes(profile.primaryRole + ' /') && !html.includes('>' + profile.primaryRole + '<'),
    `role stack must not print raw ${profile.primaryRole}`);
  assert.ok(!html.includes('dense_asteroid'), 'hazard type is words');
  assert.match(html, /Dense Asteroid/);
});
