// G05 — corridor opening objective hierarchy.
//
// Pins tracker priority including the pre-first-dock corridor idle state
// (Dock at Helios Station + marker/distance/ETA machinery). Threat slot is
// owned elsewhere and must remain untouched by this packet.
//
// Run:
//   node --test test/corridor-objective-hierarchy.test.mjs
//   node --test test/objective-navigation-hierarchy.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildCorridorOpeningWaypoint,
  CORRIDOR_OPENING_ACTION,
  CORRIDOR_OPENING_FALLBACK_POS,
  CORRIDOR_OPENING_STATION_ID,
  hasActiveTrackedMission,
  hasCorridorFirstDock,
  markCorridorFirstDock,
  missions as missionsProto,
  resolveCorridorOpeningObjective,
} from '../src/systems/missions.js';
import {
  objectiveBearingGlyph,
  objectiveTravelReadout,
} from '../src/ui/hud.js';

// Independent hard-coded corridor fallback (must match CORRIDOR_OPENING_FALLBACK_POS but
// must NOT be imported for bound checks — kills Infinityk-WU / MAX_VALUE mutants).
const FALLBACK_X = 280;
const FALLBACK_Z = -140;
const MARKER_DISTANCE_MAX_WU = 1e6;

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

function baseState(overrides = {}) {
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
  };
  const helios = {
    id: 4,
    type: 'station',
    alive: true,
    pos: { x: 300, z: -100 },
    data: { stationId: CORRIDOR_OPENING_STATION_ID, name: 'Helios Station' },
  };
  const state = {
    playerId: 1,
    simTime: 12,
    entities: new Map([[1, player], [4, helios]]),
    entityList: [player, helios],
    ui: { trackedMissionId: null },
    missions: { active: [] },
    nav: { waypoint: null },
    story: { beatIndex: 0 },
    world: { currentSectorId: 'sector_helios_prime' },
    ...overrides,
  };
  if (overrides.ui) state.ui = { trackedMissionId: null, ...overrides.ui };
  if (overrides.missions) state.missions = { active: [], ...overrides.missions };
  return state;
}

test('pre-first-dock idle resolves the corridor Dock-at-Helios objective', () => {
  const state = baseState();
  assert.equal(hasCorridorFirstDock(state), false);
  assert.equal(hasActiveTrackedMission(state), false);

  const objective = resolveCorridorOpeningObjective(state);
  assert.ok(objective, 'corridor objective is active before first dock');
  assert.equal(objective.action, CORRIDOR_OPENING_ACTION);
  assert.equal(objective.stationId, CORRIDOR_OPENING_STATION_ID);
  assert.match(objective.action, /^Dock\b/, 'immediate-action verb is imperative Dock');
  assert.match(objective.action, /Helios/i);

  const wp = buildCorridorOpeningWaypoint(state);
  assert.ok(wp, 'corridor waypoint feeds marker/distance/ETA machinery');
  assert.equal(wp.kind, 'corridor');
  assert.equal(wp.reason, CORRIDOR_OPENING_ACTION);
  assert.equal(wp.pos.x, 300);
  assert.equal(wp.pos.z, -100);

  const travel = objectiveTravelReadout(state, wp);
  assert.ok(travel.distanceWu > 0, 'distance readout is live');
  assert.ok(travel.distanceText, 'distance text present');
  assert.ok(travel.etaText, 'ETA text present');
  assert.ok(objectiveBearingGlyph(state, wp), 'bearing glyph present');
});

test('tracked active mission suppresses the corridor idle objective', () => {
  const state = baseState({
    ui: { trackedMissionId: 'm_1' },
    missions: { active: [{ id: 'm_1', status: 'active', type: 'cargo_delivery', title: 'Haul' }] },
  });
  assert.equal(hasActiveTrackedMission(state), true);
  assert.equal(resolveCorridorOpeningObjective(state), null);
  assert.equal(buildCorridorOpeningWaypoint(state), null);
});

test('after first dock, corridor idle yields and priority falls through', () => {
  const state = baseState();
  assert.equal(markCorridorFirstDock(state, CORRIDOR_OPENING_STATION_ID, 40), true);
  assert.equal(hasCorridorFirstDock(state), true);
  assert.equal(state.ui.corridorFirstDocked, true);
  assert.equal(state.ui.corridorFirstDockStationId, CORRIDOR_OPENING_STATION_ID);
  assert.equal(resolveCorridorOpeningObjective(state), null);
  assert.equal(buildCorridorOpeningWaypoint(state), null);
  // Idempotent
  assert.equal(markCorridorFirstDock(state, 'station_ceres', 99), false);
  assert.equal(state.ui.corridorFirstDockStationId, CORRIDOR_OPENING_STATION_ID);
});

test('corridor waypoint falls back when Helios is not yet in the entity list', () => {
  const state = baseState();
  state.entityList = [state.entities.get(1)];
  state.entities.delete(4);
  const wp = buildCorridorOpeningWaypoint(state);
  assert.ok(wp);
  // Independent literals (not re-read from the mutated module) + finite marker distance.
  assert.equal(wp.pos.x, FALLBACK_X);
  assert.equal(wp.pos.z, FALLBACK_Z);
  assert.equal(CORRIDOR_OPENING_FALLBACK_POS.x, FALLBACK_X);
  assert.equal(CORRIDOR_OPENING_FALLBACK_POS.z, FALLBACK_Z);
  const travel = objectiveTravelReadout(state, wp);
  assert.ok(Number.isFinite(travel.distanceWu), 'fallback distance must be finite');
  assert.ok(travel.distanceWu >= 0 && travel.distanceWu < MARKER_DISTANCE_MAX_WU,
    `fallback distance must be < 1e6 WU (got ${travel.distanceWu})`);
  assert.doesNotMatch(String(travel.distanceText || ''), /Infinity/i);
});

test('_refreshNavigation never overwrites an existing trade waypoint with corridor idle', () => {
  // Red-first P0 pin: a live trade route must survive corridor idle refresh.
  const state = baseState();
  const tradeWp = {
    kind: 'trade',
    stationId: 'station_ceres',
    sectorId: 'sector_ceres_belt',
    label: 'Ceres Refinery',
    reason: 'Sell cargo at Ceres',
    pos: { x: 900, z: 200 },
  };
  state.nav.waypoint = tradeWp;
  const missions = Object.assign({}, missionsProto);
  missions.init({
    state,
    bus: { on() {}, off() {}, emit() {} },
    helpers: {},
    registry: { get: () => null },
  });
  // Pre-first-dock, no tracked mission — corridor would otherwise claim the slot.
  assert.equal(hasCorridorFirstDock(state), false);
  assert.equal(hasActiveTrackedMission(state), false);
  assert.ok(buildCorridorOpeningWaypoint(state), 'corridor is active when nav is empty');
  missions._refreshNavigation({ silent: true });
  assert.ok(state.nav.waypoint, 'waypoint must remain');
  assert.equal(state.nav.waypoint.kind, 'trade', 'trade waypoint must not become corridor');
  assert.equal(state.nav.waypoint.stationId, 'station_ceres');
  assert.equal(state.nav.waypoint.pos.x, 900);
  assert.equal(state.nav.waypoint.pos.z, 200);
});

test('tracker priority source pins include corridor idle before untracked/story recovery', () => {
  const hud = read('../src/ui/hud.js');
  const missions = read('../src/systems/missions.js');

  assert.match(missions, /export function resolveCorridorOpeningObjective/);
  assert.match(missions, /export function buildCorridorOpeningWaypoint/);
  assert.match(missions, /export function markCorridorFirstDock/);
  assert.match(missions, /markCorridorFirstDock\(this\.state/);
  assert.match(missions, /buildCorridorOpeningWaypoint\(state\)/);
  // P0: corridor install is gated on absent nav.waypoint.
  assert.match(missions, /existingWp|!existingWp|!state\.nav\.waypoint|nav\.waypoint is absent|!existingWp/);

  // HUD: single paint arm — navWaypoint || buildCorridorOpeningWaypoint (no dual branch).
  const trackerBlock = hud.match(/\/\/ --- mission tracker @10Hz ---[\s\S]*?\/\/ --- credits \/ cargo/);
  assert.ok(trackerBlock, 'mission tracker tick block present');
  const block = trackerBlock[0];
  assert.match(block, /navWaypoint\s*\|\|\s*buildCorridorOpeningWaypoint\(state\)/,
    'HUD resolves corridor through the single navWaypoint paint arm');
  assert.doesNotMatch(block, /hasCorridorFirstDock/,
    'HUD no longer dual-gates corridor with hasCorridorFirstDock');
  const corridorIdx = block.indexOf('buildCorridorOpeningWaypoint');
  const trackContractIdx = block.indexOf("coreText('trackContract'");
  const storyIdx = block.indexOf("coreText('chooseStoryAction'");
  assert.ok(corridorIdx > 0, 'corridor idle is in the tracker tick');
  assert.ok(trackContractIdx > corridorIdx, 'untracked-contract recovery follows corridor');
  assert.ok(storyIdx > corridorIdx, 'story recovery follows corridor');
  assert.match(block, /mtMarkerLine\(state, wp/, 'corridor reuses marker/distance/ETA line');
  // Threat slot remains owned by target panel, not the tracker hierarchy.
  assert.doesNotMatch(block, /current-threat|createTargetPanel/);
});
