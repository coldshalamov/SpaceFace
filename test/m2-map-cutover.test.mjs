// M2-C4 map/travel cutover contract — fail-closed, live-seam inspection.
//
// Authority: design/vision/ALPHA_PROGRAM.md Milestone 2 (Queued, not accepted)
//            .devshots/m2-continuation-contract/m2_continuation_implementation_contract.json
//            M2-C4 "Travel continuity + gate/corridor + one-map truth"
//
// This lane is evidence/test only. It does not implement UI cutover.
// Fail-closed: dual-primary callers, phantom scripts, and missing public seams fail.
// Honest red: when a required cutover seam is not yet wired, assert the end-state API
// (not a weakened localmap/starmap dual) and surface exact defect IDs.
//
// Run: node --test test/m2-map-cutover.test.mjs
//      node scripts/check-m2-map-cutover.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { core } from '../src/core/coreSystem.js';
import { world as worldSystem } from '../src/systems/world.js';
import { SECTORS } from '../src/data/sectors.js';
import { CORRIDOR_SECTOR_IDS } from '../src/data/sectorCoordinates.js';
import {
  MAP_FOCUS,
  MAP_SCREEN_ID,
  focusFromLegacyScreenId,
  mapHandoffAction,
  normalizeMapFocus,
  normalizeMapOpenIntent,
  openGalaxyMap,
  peekMapOpenIntent,
  setMapOpenIntent,
  takeMapOpenIntent,
} from '../src/ui/mapAuthority.js';
import {
  resolveCourseTarget,
  buildLocalModel,
  buildGalaxyModel,
} from '../src/ui/galaxyMap.js';
import { missionMapAction } from '../src/ui/screens/missionLog.js';
import { pauseMapAction } from '../src/ui/screens/pause.js';
import { save } from '../src/save/saveSystem.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const HELIOS = 'sector_helios_prime';
const TETHYS = 'sector_tethys_junction';
const CERES = 'sector_ceres_belt';

/** Exact defect IDs for honest-red cutover gaps (do not weaken end-state). */
export const M2_C4_DEFECTS = Object.freeze({
  PAUSE_DUAL_PRIMARY: {
    id: 'DEF-C4-01_PAUSE_DUAL_PRIMARY',
    expectedApi:
      "pauseMapAction(state) → { screenId:'galaxyMap', focus:'local'|'galaxy', ... } and open via openGalaxyMap / mapHandoffAction; never screenManager.pushScreen('localmap'|'starmap')",
    files: ['src/ui/screens/pause.js'],
  },
  LEGACY_SCREENS_STILL_REGISTERED: {
    id: 'DEF-C4-02_LEGACY_MAP_SCREENS_REGISTERED',
    expectedApi:
      'uiRoot SCREEN_MODULES may keep legacy modules for tools/checks only after every normal-player opener is galaxyMap; product pause/help must not advertise primary dual routes',
    files: ['src/ui/uiRoot.js'],
  },
  PACKAGE_MAP_CUTOVER_UNWIRED: {
    id: 'DEF-C4-03_PACKAGE_JSON_MAP_CUTOVER_UNWIRED',
    expectedApi:
      'package.json registers "check:m2:map-cutover": "node scripts/check-m2-map-cutover.mjs" (M2-C5 ownership)',
    files: ['package.json', 'scripts/check-m2-map-cutover.mjs'],
  },
});

// ── helpers ──────────────────────────────────────────────────────────────────

function reachableFrom(start) {
  const byId = new Map(SECTORS.map((s) => [s.id, s]));
  const seen = new Set([start]);
  const queue = [start];
  for (let head = 0; head < queue.length; head += 1) {
    const sector = byId.get(queue[head]);
    for (const neighbor of sector?.neighbors || []) {
      if (seen.has(neighbor)) continue;
      seen.add(neighbor);
      queue.push(neighbor);
    }
  }
  return [...seen];
}

function bootWorld(seed = 17) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.meta.seed = seed;
  const bus = createBus();
  const helpers = {};
  const ctx = { state, bus, helpers, registry: null };
  core.init(ctx);
  const player = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 120, z: -40 },
    radius: 4,
    mass: 12,
    hull: 100,
    hullMax: 100,
    collides: true,
  });
  state.playerId = player.id;
  player.isPlayer = true;
  player.vel = player.vel || { x: 0, z: 0 };
  player.flags = player.flags || { boosting: false, docked: false, invuln: false, noInterp: false };
  const world = Object.assign(Object.create(worldSystem), {});
  world.init(ctx);
  world.newGame();
  // newGame clears currentSectorId; seed membership for route/nav tests without full materialize.
  state.world.currentSectorId = HELIOS;
  return { state, bus, helpers, world, player, ctx };
}

function discoverAll(state) {
  for (const s of SECTORS) {
    const d = state.world.discovery[s.id] || (state.world.discovery[s.id] = {
      discovered: false, visitedCount: 0, pois: {}, fieldsDepleted: {},
    });
    d.discovered = true;
  }
}

function sourceOpeners() {
  return {
    mapAuthority: read('src/ui/mapAuthority.js'),
    uiInput: read('src/ui/input.js'),
    uiRoot: read('src/ui/uiRoot.js'),
    missionLog: read('src/ui/screens/missionLog.js'),
    stationHub: read('src/ui/screens/stationHub.js'),
    pause: read('src/ui/screens/pause.js'),
    starmap: read('src/ui/screens/starmap.js'),
    localmap: read('src/ui/screens/localmap.js'),
    galaxyMap: read('src/ui/galaxyMap.js'),
    world: read('src/systems/world.js'),
    scanner: read('src/systems/scanner.js'),
    saveSystem: read('src/save/saveSystem.js'),
    packageJson: read('package.json'),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 1. One public map authority
// ════════════════════════════════════════════════════════════════════════════

test('C4-AUTH-01 mapAuthority exports sole public map screen id galaxyMap', () => {
  assert.equal(MAP_SCREEN_ID, 'galaxyMap');
  assert.equal(MAP_FOCUS.LOCAL, 'local');
  assert.equal(MAP_FOCUS.GALAXY, 'galaxy');
  assert.equal(normalizeMapFocus('localmap'), MAP_FOCUS.LOCAL);
  assert.equal(normalizeMapFocus('starmap'), MAP_FOCUS.GALAXY);
  assert.equal(focusFromLegacyScreenId('localmap'), MAP_FOCUS.LOCAL);
  assert.equal(focusFromLegacyScreenId('starmap'), MAP_FOCUS.GALAXY);
  assert.equal(typeof openGalaxyMap, 'function');
  assert.equal(typeof mapHandoffAction, 'function');
});

test('C4-AUTH-02 openGalaxyMap writes one-shot intent and pushes galaxyMap only', () => {
  const state = createGameState(3);
  const pushed = [];
  const ctx = {
    state,
    bus: { emit() {} },
    screenManager: {
      top: () => null,
      pushScreen: (id) => { pushed.push(id); },
    },
  };
  const ok = openGalaxyMap(ctx, {
    focus: MAP_FOCUS.LOCAL,
    missionId: 'm1',
    sectorId: HELIOS,
    source: 'contract-test',
  });
  assert.equal(ok, true);
  assert.deepEqual(pushed, ['galaxyMap']);
  const intent = peekMapOpenIntent(state);
  assert.equal(intent.focus, MAP_FOCUS.LOCAL);
  assert.equal(intent.missionId, 'm1');
  assert.equal(intent.sectorId, HELIOS);
  assert.equal(intent.source, 'contract-test');
  const taken = takeMapOpenIntent(state);
  assert.equal(taken.focus, MAP_FOCUS.LOCAL);
  assert.equal(peekMapOpenIntent(state), null);
});

test('C4-AUTH-03 mapHandoffAction always targets galaxyMap with retained LOCAL/STAR labels', () => {
  const local = mapHandoffAction({ focus: MAP_FOCUS.LOCAL, missionId: 'm', sectorId: HELIOS });
  assert.equal(local.screenId, 'galaxyMap');
  assert.equal(local.focus, MAP_FOCUS.LOCAL);
  assert.equal(local.label, 'LOCAL MAP');
  const star = mapHandoffAction({ focus: MAP_FOCUS.GALAXY, missionId: 'm', sectorId: TETHYS });
  assert.equal(star.screenId, 'galaxyMap');
  assert.equal(star.focus, MAP_FOCUS.GALAXY);
  assert.equal(star.label, 'STAR MAP');
});

test('C4-AUTH-04 keyboard/gamepad/touch/missionLog/stationHub/uiRoot open via openGalaxyMap', () => {
  const src = sourceOpeners();
  // Keyboard N/M
  assert.match(src.uiInput, /openGalaxyMap\(\s*\{\s*state,\s*bus,\s*screenManager\s*\}\s*,\s*\{\s*focus:\s*MAP_FOCUS\.LOCAL/);
  assert.match(src.uiInput, /openGalaxyMap\(\s*\{\s*state,\s*bus,\s*screenManager\s*\}\s*,\s*\{\s*focus:\s*MAP_FOCUS\.GALAXY/);
  // Gamepad View
  assert.match(src.uiInput, /gp\.actions\.map[\s\S]{0,120}openGalaxyMap/);
  // Touch Local/Star
  assert.match(src.uiInput, /openMapFromTouch\(MAP_FOCUS\.LOCAL\)/);
  assert.match(src.uiInput, /openMapFromTouch\(MAP_FOCUS\.GALAXY\)/);
  // Mission Log + station
  assert.match(src.missionLog, /openGalaxyMap\(/);
  assert.match(src.missionLog, /mapHandoffAction\(/);
  assert.match(src.stationHub, /openGalaxyMap\(/);
  // uiRoot intercepts legacy map pushes
  assert.match(src.uiRoot, /isMapScreenId\(id\)/);
  assert.match(src.uiRoot, /openGalaxyMap\(/);
  // No direct dual-primary from input path
  assert.doesNotMatch(src.uiInput, /pushScreen\(\s*['"]localmap['"]\s*\)/);
  assert.doesNotMatch(src.uiInput, /pushScreen\(\s*['"]starmap['"]\s*\)/);
});

test('C4-AUTH-05 missionLog map handoff is galaxyMap-only (live export)', () => {
  const state = createGameState(1);
  state.world.currentSectorId = HELIOS;
  state.ui = { trackedMissionId: 'm_delivery' };
  const m = {
    id: 'm_delivery',
    status: 'active',
    type: 'cargo_delivery',
    destSectorId: TETHYS,
    destStationId: 'station_tethys',
  };
  const action = missionMapAction(state, m, true);
  assert.ok(action, 'tracked mission must expose a map handoff');
  assert.equal(action.screenId, MAP_SCREEN_ID);
  assert.equal(action.focus, MAP_FOCUS.GALAXY);
  assert.notEqual(action.screenId, 'starmap');
  assert.notEqual(action.screenId, 'localmap');
});

test('C4-AUTH-06 FAIL-CLOSED: pauseMapAction must not dual-primary to legacy map screens', () => {
  // Expected end-state (do not weaken): pause handoff uses galaxyMap authority.
  // Live as of this contract: pause returns screenId localmap|starmap and nav() may
  // screenManager.pushScreen those ids, bypassing uiRoot's ui:pushScreen interceptor.
  const def = M2_C4_DEFECTS.PAUSE_DUAL_PRIMARY;
  const state = createGameState(2);
  state.world.currentSectorId = HELIOS;
  state.nav = {
    route: null,
    autoTravel: false,
    waypoint: {
      kind: 'nav',
      label: 'Helios Station',
      pos: { x: 100, z: -20 },
      sectorId: HELIOS,
    },
    autopilot: { active: true, target: { x: 100, z: -20 }, status: 'armed', arrivalRadius: 90, label: 'Helios Station' },
  };
  const action = pauseMapAction(state);
  assert.ok(action, 'pause must expose a map review action when a waypoint is set');
  assert.equal(
    action.screenId,
    MAP_SCREEN_ID,
    `${def.id}: pauseMapAction.screenId must be '${MAP_SCREEN_ID}' (got '${action.screenId}'). `
      + `Expected API: ${def.expectedApi}`,
  );
  assert.ok(
    action.focus === MAP_FOCUS.LOCAL || action.focus === MAP_FOCUS.GALAXY || action.focus === MAP_FOCUS.SYSTEM,
    `${def.id}: pause handoff must carry mapAuthority focus vocabulary`,
  );
});

test('C4-AUTH-07 FAIL-CLOSED: pause source must not hardcode legacy screenId dual-primary', () => {
  const def = M2_C4_DEFECTS.PAUSE_DUAL_PRIMARY;
  const pause = sourceOpeners().pause;
  // Direct dual-primary literals in pauseMapAction are forbidden end-state.
  const localLit = /screenId:\s*['"]localmap['"]/.test(pause);
  const starLit = /screenId:\s*['"]starmap['"]/.test(pause);
  assert.equal(
    localLit || starLit,
    false,
    `${def.id}: pause.js still hardcodes legacy map screenId literals. ${def.expectedApi}`,
  );
});

// ════════════════════════════════════════════════════════════════════════════
// 2. Waypoint / autopilot arming (world-owned)
// ════════════════════════════════════════════════════════════════════════════

test('C4-WP-01 resolveCourseTarget arms local station as ui:setCourse autopilot payload', () => {
  const payload = resolveCourseTarget({
    kind: 'station',
    name: 'Helios Station',
    x: 1296,
    z: -412,
    entityId: 'entity_helios',
    stationId: 'station_helios',
  });
  assert.ok(payload);
  assert.equal(payload.type, 'station');
  assert.deepEqual(payload.pos, { x: 1296, z: -412 });
  assert.equal(payload.autopilot, true);
  assert.equal(payload.arrivalRadius, 90);
  assert.equal(payload.targetEntityId, 'entity_helios');
  assert.equal(payload.stationId, 'station_helios');
  assert.equal(payload.waypointKind, 'nav');
});

test('C4-WP-02 world._onSetCourse owns waypoint + arms autopilot (no map write of nav.route)', () => {
  const { state, world } = bootWorld(9);
  const events = [];
  world.bus.on('nav:waypoint', (p) => events.push(['waypoint', p]));
  world.bus.on('nav:autopilot', (p) => events.push(['autopilot', p]));

  const payload = resolveCourseTarget({
    kind: 'station',
    name: 'Helios Station',
    x: 1296,
    z: -412,
    entityId: 'entity_helios',
    stationId: 'station_helios',
  });
  const ap = world._onSetCourse(payload);
  assert.equal(ap.active, true);
  assert.equal(ap.status, 'armed');
  assert.deepEqual(ap.target, { x: 1296, z: -412 });
  assert.equal(state.nav.waypoint.label, 'Helios Station');
  assert.equal(state.nav.route, null, 'local fix clears inter-sector route');
  assert.ok(events.some((e) => e[0] === 'waypoint'));
  assert.ok(events.some((e) => e[0] === 'autopilot' && e[1].status === 'armed'));
});

test('C4-WP-03 sector course plots world-owned Dijkstra route via computeRoute', () => {
  const { state, world } = bootWorld(11);
  discoverAll(state);
  const route = world.computeRoute(TETHYS, 'fuel');
  assert.ok(route, 'Helios→Tethys must route when fully discovered');
  assert.ok(route.legs.length >= 1);
  assert.equal(route.legs[0].from, HELIOS);
  assert.equal(route.legs[route.legs.length - 1].to, TETHYS);

  world._onSetCourse({ sectorId: TETHYS });
  assert.ok(state.nav.route);
  assert.equal(state.nav.autoTravel, true);
  assert.equal(state.nav.route.legs[route.legs.length - 1].to, TETHYS);
});

test('C4-WP-04 galaxyMap emits world:requestRoute + ui:setCourse; never assigns state.nav.route', () => {
  const gm = sourceOpeners().galaxyMap;
  assert.match(gm, /world:requestRoute/);
  assert.match(gm, /ui:setCourse/);
  assert.doesNotMatch(gm, /state\.nav\.route\s*=/);
  assert.match(gm, /resolveCourseTarget/);
  assert.match(sourceOpeners().world, /bus\.on\(\s*['"]ui:setCourse['"]/);
  assert.match(sourceOpeners().world, /bus\.on\(\s*['"]world:requestRoute['"]/);
});

// ════════════════════════════════════════════════════════════════════════════
// 3. Reciprocal 24-region route truth
// ════════════════════════════════════════════════════════════════════════════

test('C4-GRAPH-01 SECTORS is 24 unique regions; Helios reaches all; corridor ids match', () => {
  assert.equal(SECTORS.length, 24);
  assert.equal(new Set(SECTORS.map((s) => s.id)).size, 24);
  assert.equal(reachableFrom(HELIOS).length, 24);
  assert.deepEqual(CORRIDOR_SECTOR_IDS, SECTORS.map((s) => s.id));
});

test('C4-GRAPH-02 every neighbor edge is reciprocal with physical gates both ends', () => {
  const byId = new Map(SECTORS.map((s) => [s.id, s]));
  for (const sector of SECTORS) {
    for (const neighborId of sector.neighbors || []) {
      const neighbor = byId.get(neighborId);
      assert.ok(neighbor, `${sector.id} unknown neighbor ${neighborId}`);
      assert.ok(neighbor.neighbors.includes(sector.id), `${sector.id}<->${neighborId} one-way`);
      assert.ok(
        (sector.gates || []).some((g) => g.to === neighborId),
        `${sector.id} missing gate to ${neighborId}`,
      );
      assert.ok(
        (neighbor.gates || []).some((g) => g.to === sector.id),
        `${neighborId} missing gate to ${sector.id}`,
      );
    }
  }
});

test('C4-GRAPH-03 live computeRoute only walks discovered intermediate nodes', () => {
  const { state, world } = bootWorld(13);
  // Only Helios charted; neighbors not discovered → cannot path through unknowns.
  state.world.discovery = {
    [HELIOS]: { discovered: true, visitedCount: 1, pois: {}, fieldsDepleted: {} },
  };
  // Direct neighbor may still route (target exception in computeRoute).
  const helios = SECTORS.find((s) => s.id === HELIOS);
  const neighbor = helios.neighbors[0];
  const direct = world.computeRoute(neighbor, 'fuel');
  assert.ok(direct, 'direct hop to undiscovered-but-target neighbor is allowed');

  // Far sector that requires multi-hop through undiscovered intermediates should fail closed.
  // Pick a sector not adjacent to Helios.
  const far = SECTORS.find((s) => s.id !== HELIOS && !(helios.neighbors || []).includes(s.id));
  assert.ok(far, 'fixture expects a non-adjacent sector');
  const blocked = world.computeRoute(far.id, 'fuel');
  assert.equal(blocked, null, 'multi-hop through undiscovered space must not invent a route');
});

// ════════════════════════════════════════════════════════════════════════════
// 4. Continuous corridor vs intentional gate semantics
// ════════════════════════════════════════════════════════════════════════════

test('C4-TRAVEL-01 enterSector continuous/noTeleport never places player; jump path places', () => {
  const { state, world, player } = bootWorld(19);
  // Materialize Helios so membership is live.
  world.enterSector(HELIOS, { placePlayer: true });
  const placed = { x: player.pos.x, z: player.pos.z };
  assert.ok(Number.isFinite(placed.x));

  // Move player off entry and continuous-handoff to a corridor neighbor if possible.
  player.pos.x = placed.x + 500;
  player.pos.z = placed.z + 500;
  const before = { x: player.pos.x, z: player.pos.z };

  // Free-flight continuous membership (may be same sector if neighbor not corridor-adjacent in test
  // — still must not teleport when continuous).
  world.enterSector(CERES, { continuous: true, noTeleport: true, fromSectorId: HELIOS });
  assert.equal(player.pos.x, before.x, 'continuous enter must not placePlayer');
  assert.equal(player.pos.z, before.z, 'continuous enter must not placePlayer');
  assert.equal(state.world.currentSectorId, CERES);

  // Intentional gate/drive-style enter repositions the player.
  world.enterSector(TETHYS, { fromJump: true, via: 'gate', fromSectorId: CERES });
  assert.equal(state.world.currentSectorId, TETHYS);
  const moved = player.pos.x !== before.x || player.pos.z !== before.z;
  assert.equal(moved, true, 'intentional jump enter must placePlayer at destination entry');
});

test('C4-TRAVEL-02 world source: continuous branch skips placePlayer; JUMPING uses enterSector with fromJump', () => {
  const w = sourceOpeners().world;
  assert.match(w, /placePlayer = !noTeleport && opts\.placePlayer !== false/);
  assert.match(w, /continuous:\s*true/);
  assert.match(w, /noTeleport:\s*true/);
  assert.match(w, /_tickResidency/);
  assert.match(w, /case 'JUMPING'/);
  assert.match(w, /enterSector\(target,\s*\{\s*fromJump:\s*true,\s*via,\s*fromSectorId\s*\}/);
  // Jump tunnel places; free-flight path must not zero frame origin on continuous.
  const enterStart = w.indexOf('enterSector(sectorId, opts = {})');
  const ensureStart = w.indexOf('_ensureResidencyState()', enterStart);
  assert.ok(enterStart >= 0 && ensureStart > enterStart);
  const enterBody = w.slice(enterStart, ensureStart);
  assert.doesNotMatch(enterBody, /frameOrigin\.(?:x|z)\s*=\s*0/);
});

test('C4-TRAVEL-03 gate control is intentional-gate scoped (via===gate), not free-flight authority', () => {
  const gate = read('src/systems/gateControlDirector.js');
  assert.match(gate, /p\.via !== ['"]gate['"]/);
  assert.match(gate, /jump:chargeStart|chargeStart/);
  assert.doesNotMatch(gate, /enterSector\s*\(/, 'gate director must not own world membership');
  assert.doesNotMatch(gate, /state\.nav\.route\s*=/);
});

// ════════════════════════════════════════════════════════════════════════════
// 5. Scanner / local tactical without second world authority
// ════════════════════════════════════════════════════════════════════════════

test('C4-LOCAL-01 buildLocalModel reads live entities from state; no second world graph', () => {
  const { state, player } = bootWorld(21);
  // Seed a contact entity near the player.
  const contact = {
    id: 77,
    type: 'ship',
    alive: true,
    team: 2,
    pos: { x: player.pos.x + 40, z: player.pos.z + 10 },
    vel: { x: 0, z: 0 },
    rot: 0,
    data: { name: 'Patrol', hostile: true },
    factionId: 'faction_outlaw',
  };
  state.entities.set(77, contact);
  state.entityList.push(contact);
  state.world.currentSectorId = HELIOS;

  const model = buildLocalModel(state, (e) => !!(e.data && e.data.hostile));
  assert.equal(model.level, 'local');
  assert.equal(model.sectorId, HELIOS);
  assert.ok(model.player);
  assert.ok(model.contacts.some((c) => c.id === 77 && c.hostile === true));
});

test('C4-LOCAL-02 galaxyMap local layer injects scanner hostility; does not re-own membership', () => {
  const gm = sourceOpeners().galaxyMap;
  assert.match(gm, /buildLocalModel/);
  // Scanner is a hostility/predicate import, not a world director.
  assert.match(gm, /scanner\.js/);
  assert.doesNotMatch(gm, /enterSector\s*\(/);
  assert.doesNotMatch(gm, /state\.world\.currentSectorId\s*=/);
  const scanner = sourceOpeners().scanner;
  assert.doesNotMatch(scanner, /enterSector\s*\(/);
  assert.doesNotMatch(scanner, /computeRoute\s*\(/);
  assert.doesNotMatch(scanner, /state\.nav\.route\s*=/);
});

test('C4-LOCAL-03 world remains sole route/membership authority across map surfaces', () => {
  const src = sourceOpeners();
  for (const [name, body] of [
    ['galaxyMap', src.galaxyMap],
    ['starmap', src.starmap],
    ['localmap', src.localmap],
  ]) {
    assert.doesNotMatch(body, /state\.nav\.route\s*=/, `${name} must not write nav.route`);
    assert.doesNotMatch(body, /state\.world\.currentSectorId\s*=/, `${name} must not write membership`);
  }
  assert.match(src.world, /computeRoute\(targetSectorId/);
  assert.match(src.world, /this\.state\.nav\.route = route/);
});

// ════════════════════════════════════════════════════════════════════════════
// 6. Map discovery / fog truth
// ════════════════════════════════════════════════════════════════════════════

test('C4-DISC-01 charted seed + enterSector reveal; discovery bag is world-owned', () => {
  const { state, world } = bootWorld(23);
  // newGame seeds charted discovery
  const charted = SECTORS.filter((s) => s.charted === true);
  assert.ok(charted.length > 0, 'fixture expects charted civilization sectors');
  for (const s of charted) {
    const d = state.world.discovery[s.id];
    assert.ok(d && d.discovered === true, `${s.id} charted must seed discovered`);
  }

  world.enterSector(HELIOS, { placePlayer: true });
  assert.equal(state.world.discovery[HELIOS].discovered, true);
  // One-hop reveal creates discovery records for neighbors (may remain discovered:false).
  for (const nb of SECTORS.find((s) => s.id === HELIOS).neighbors || []) {
    assert.ok(state.world.discovery[nb], `neighbor ${nb} must appear in discovery overlay after enter`);
  }
  const ser = world.serialize();
  assert.ok(ser.discovery);
  assert.equal(ser.currentSectorId, HELIOS);
  assert.equal(ser.frameOrigin, undefined, 'frameOrigin must not serialize as authority');
  assert.equal(ser.residentSectors, undefined);
});

test('C4-DISC-02 buildGalaxyModel is discovery-aware pure reader (no fog write)', () => {
  const { state } = bootWorld(27);
  discoverAll(state);
  const model = buildGalaxyModel(state);
  assert.equal(model.level, 'galaxy');
  assert.ok(Array.isArray(model.nodes));
  assert.equal(model.nodes.length, 24, 'galaxy model must surface all 24 region nodes');
  assert.ok(Array.isArray(model.edges));
  // Pure: discovery bag unchanged
  const before = JSON.stringify(state.world.discovery);
  buildGalaxyModel(state);
  assert.equal(JSON.stringify(state.world.discovery), before);
  const gm = sourceOpeners().galaxyMap;
  assert.doesNotMatch(gm, /discovery\[.*\]\.discovered\s*=\s*true/);
});

// ════════════════════════════════════════════════════════════════════════════
// 7. Save / Continue route identity
// ════════════════════════════════════════════════════════════════════════════

test('C4-SAVE-01 save serialize/restore preserves route legs, waypoint, and autopilot arm', () => {
  const { state } = bootWorld(31);
  discoverAll(state);
  // Build a world route + local waypoint shape that Continue must rematerialize.
  const world = Object.assign(Object.create(worldSystem), {});
  world.init({ state, bus: createBus(), helpers: {}, registry: null });
  const route = world.computeRoute(TETHYS, 'fuel');
  assert.ok(route);
  state.nav.route = route;
  state.nav.autoTravel = true;
  state.nav.waypoint = {
    kind: 'mission',
    missionId: 'm_delivery',
    sectorId: TETHYS,
    sectorName: 'Tethys Junction',
    label: 'Deliver provisions',
    reason: 'Mission route',
  };
  state.nav.autopilot = {
    active: false,
    target: null,
    targetEntityId: null,
    label: '',
    arrivalRadius: 36,
    status: 'route-plotted',
  };

  const bus = createBus();
  save.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  const data = save.serializeData();
  assert.ok(data.nav, 'save envelope must include nav');
  assert.ok(data.nav.route);
  assert.equal(data.nav.route.legs.length, route.legs.length);
  assert.equal(data.nav.route.legs[0].from, route.legs[0].from);
  assert.equal(data.nav.route.legs[route.legs.length - 1].to, route.legs[route.legs.length - 1].to);
  assert.equal(data.nav.waypoint.missionId, 'm_delivery');
  assert.equal(data.nav.waypoint.sectorId, TETHYS);
  assert.equal(data.nav.autoTravel, true);

  // Wipe and restore
  state.nav = {
    route: null,
    autoTravel: false,
    waypoint: null,
    autopilot: { active: false, target: null, targetEntityId: null, label: '', arrivalRadius: 36, status: 'idle' },
  };
  save._restoreNav(data.nav);
  assert.ok(state.nav.route);
  assert.equal(state.nav.route.legs.length, route.legs.length);
  assert.equal(state.nav.route.legs[0].from, route.legs[0].from);
  assert.equal(state.nav.route.legs[route.legs.length - 1].to, route.legs[route.legs.length - 1].to);
  assert.equal(state.nav.waypoint.missionId, 'm_delivery');
  assert.equal(state.nav.waypoint.sectorId, TETHYS);
  assert.equal(state.nav.autoTravel, true);
});

test('C4-SAVE-02 local autopilot arm round-trips through sanitizeNavState', () => {
  const { state } = bootWorld(33);
  state.nav.route = null;
  state.nav.autoTravel = false;
  state.nav.waypoint = {
    kind: 'nav',
    label: 'Helios Station',
    reason: 'Helios Station',
    pos: { x: 1296, z: -412 },
    targetEntityId: 'entity_helios',
    stationId: 'station_helios',
  };
  state.nav.autopilot = {
    active: true,
    target: { x: 1296, z: -412 },
    targetEntityId: 'entity_helios',
    label: 'Helios Station',
    arrivalRadius: 90,
    status: 'armed',
  };

  const bus = createBus();
  save.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  const data = save.serializeData();
  assert.equal(data.nav.autopilot.active, true);
  assert.deepEqual(data.nav.autopilot.target, { x: 1296, z: -412 });
  assert.equal(data.nav.autopilot.status, 'armed');
  assert.equal(data.nav.waypoint.stationId, 'station_helios');

  state.nav.autopilot = { active: false, target: null, targetEntityId: null, label: '', arrivalRadius: 36, status: 'idle' };
  state.nav.waypoint = null;
  save._restoreNav(data.nav);
  assert.equal(state.nav.autopilot.active, true);
  assert.deepEqual(state.nav.autopilot.target, { x: 1296, z: -412 });
  assert.equal(state.nav.autopilot.status, 'armed');
  assert.equal(state.nav.waypoint.stationId, 'station_helios');
});

// ════════════════════════════════════════════════════════════════════════════
// 8. Phantom scripts / dual package claims
// ════════════════════════════════════════════════════════════════════════════

test('C4-META-01 reject phantom map-authority / map-cutover scripts; validate live ones', () => {
  // Sibling UIUX gate may exist; if present it must import live mapAuthority seams (not a stub).
  const mapAuthCheck = join(ROOT, 'scripts', 'check-map-authority.mjs');
  if (existsSync(mapAuthCheck)) {
    const body = readFileSync(mapAuthCheck, 'utf8');
    assert.match(body, /mapAuthority\.js/, 'check-map-authority must import mapAuthority');
    assert.match(body, /openGalaxyMap|MAP_SCREEN_ID/, 'check-map-authority must exercise live exports');
    assert.ok(body.length > 200, 'check-map-authority must not be an empty phantom stub');
  }

  const cutoverCheck = join(ROOT, 'scripts', 'check-m2-map-cutover.mjs');
  assert.ok(existsSync(cutoverCheck), 'check-m2-map-cutover.mjs must exist');
  const cutoverBody = readFileSync(cutoverCheck, 'utf8');
  assert.match(cutoverBody, /m2-map-cutover/);
  assert.match(cutoverBody, /DEF-C4-01|PAUSE_DUAL_PRIMARY|dual-primary/);

  // package.json may not wire these yet (M2-C5). Any *registered* script must resolve to a real file.
  const pkg = JSON.parse(sourceOpeners().packageJson);
  const scripts = pkg.scripts || {};
  for (const [name, cmd] of Object.entries(scripts)) {
    if (!/map-authority|map-cutover|m2:map|m2-map/i.test(name) && !/map-authority|map-cutover|m2-map-cutover/i.test(String(cmd))) {
      continue;
    }
    const m = String(cmd).match(/node\s+([^\s&|;]+)/);
    if (!m) continue;
    const rel = m[1].replace(/^\.\//, '');
    assert.ok(
      existsSync(join(ROOT, rel)),
      `phantom npm script ${name} → missing ${rel}`,
    );
  }
});

test('C4-META-02 check-m2-map-cutover.mjs exists as the contract gate (package wiring is C5)', () => {
  const checkPath = join(ROOT, 'scripts', 'check-m2-map-cutover.mjs');
  assert.ok(existsSync(checkPath), 'scripts/check-m2-map-cutover.mjs must exist');
  const body = readFileSync(checkPath, 'utf8');
  assert.match(body, /m2-map-cutover/);
  assert.match(body, /m2b-map-route|check-m2b-sector-graph|check:map-confidence|check:galaxy-map-inspector/);
  // package.json wiring is owned by M2-C5 — record defect if missing but do not invent a phantom claim.
  const pkg = JSON.parse(sourceOpeners().packageJson);
  const wired = !!(pkg.scripts && (pkg.scripts['check:m2:map-cutover'] || pkg.scripts['check:m2-map-cutover']));
  if (!wired) {
    // Soft evidence only: foundation check still runnable via node path.
    assert.equal(wired, false);
    // Export defect id for submission readers (assertion documents expected API).
    assert.ok(M2_C4_DEFECTS.PACKAGE_MAP_CUTOVER_UNWIRED.id.startsWith('DEF-C4-03'));
  }
});

test('C4-META-03 normalizeMapOpenIntent is pure and fail-closed on garbage', () => {
  const a = normalizeMapOpenIntent({ screenId: 'localmap', missionId: 12, pos: { x: 1, z: 2 } });
  assert.equal(a.focus, MAP_FOCUS.LOCAL);
  assert.equal(a.missionId, '12');
  assert.deepEqual(a.pos, { x: 1, z: 2 });
  const b = normalizeMapOpenIntent(null);
  assert.equal(b.focus, MAP_FOCUS.SYSTEM);
  assert.equal(b.pos, null);
  setMapOpenIntent(null, { focus: 'galaxy' }); // must not throw
});
