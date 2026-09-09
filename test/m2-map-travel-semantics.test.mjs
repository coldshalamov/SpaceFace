// M2-C4 travel semantics contract — continuous corridor vs intentional gate,
// discovery fog route truth, and save/Continue route identity complements.
//
// Run: node --test test/m2-map-travel-semantics.test.mjs
//      node scripts/check-m2-map-cutover.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { core } from '../src/core/coreSystem.js';
import { world as worldSystem } from '../src/systems/world.js';
import { SECTORS } from '../src/data/sectors.js';
import {
  CORRIDOR_SECTOR_IDS,
  isCorridorSector,
  sectorMembershipAtGlobal,
  sectorGlobalOrigin,
} from '../src/data/sectorCoordinates.js';
import { save } from '../src/save/saveSystem.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const WORLD_SRC = readFileSync(join(ROOT, 'src/systems/world.js'), 'utf8');
const CRUISE_SRC = readFileSync(join(ROOT, 'src/systems/cruise.js'), 'utf8');
const GATE_SRC = readFileSync(join(ROOT, 'src/systems/gateControlDirector.js'), 'utf8');

const HELIOS = 'sector_helios_prime';
const CERES = 'sector_ceres_belt';
const TETHYS = 'sector_tethys_junction';

function bootWorld(seed = 41) {
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
  player.isPlayer = true;
  player.vel = player.vel || { x: 0, z: 0 };
  player.flags = player.flags || { boosting: false, docked: false, invuln: false, noInterp: false };
  const world = Object.assign(Object.create(worldSystem), {});
  world.init(ctx);
  world.newGame();
  return { state, bus, helpers, world, player, ctx };
}

function discoverAll(state) {
  for (const s of SECTORS) {
    state.world.discovery[s.id] = {
      discovered: true,
      visitedCount: 1,
      pois: {},
      fieldsDepleted: {},
    };
  }
}

// ── Continuous corridor membership ──────────────────────────────────────────

test('C4-SEM-01 corridor membership is nearest-origin Voronoi over CORRIDOR_SECTOR_IDS', () => {
  assert.ok(CORRIDOR_SECTOR_IDS.includes(HELIOS));
  assert.ok(isCorridorSector(HELIOS));
  assert.equal(sectorMembershipAtGlobal({ x: 0, z: 0 }), HELIOS);
  assert.equal(sectorMembershipAtGlobal(sectorGlobalOrigin(CERES)), CERES);
  assert.equal(sectorMembershipAtGlobal(sectorGlobalOrigin(TETHYS)), TETHYS);
});

test('C4-SEM-02 continuous enter emits sector:exit/enter with continuous+noTeleport flags', () => {
  const { state, world, bus, player } = bootWorld(43);
  world.enterSector(HELIOS, { placePlayer: true });
  const events = [];
  bus.on('sector:exit', (p) => events.push(['exit', p]));
  bus.on('sector:enter', (p) => events.push(['enter', p]));
  bus.on('world:membership', (p) => events.push(['membership', p]));

  player.pos.x += 10;
  player.pos.z += 10;
  const before = { x: player.pos.x, z: player.pos.z };
  world.enterSector(CERES, { continuous: true, noTeleport: true, fromSectorId: HELIOS });

  const exit = events.find((e) => e[0] === 'exit');
  const enter = events.find((e) => e[0] === 'enter');
  assert.ok(exit, 'continuous handoff must emit sector:exit');
  assert.equal(exit[1].continuous, true);
  assert.equal(exit[1].noTeleport, true);
  assert.ok(enter);
  assert.equal(enter[1].continuous, true);
  assert.equal(enter[1].noTeleport, true);
  assert.equal(player.pos.x, before.x);
  assert.equal(player.pos.z, before.z);
  assert.equal(state.world.currentSectorId, CERES);
});

test('C4-SEM-03 intentional gate/drive enter places player and is not continuous', () => {
  const { state, world, bus, player } = bootWorld(45);
  world.enterSector(HELIOS, { placePlayer: true });
  const events = [];
  bus.on('sector:exit', (p) => events.push(p));
  bus.on('sector:enter', (p) => events.push(p));

  const before = { x: player.pos.x, z: player.pos.z };
  world.enterSector(TETHYS, { fromJump: true, via: 'gate', fromSectorId: HELIOS });
  assert.equal(state.world.currentSectorId, TETHYS);
  assert.ok(player.pos.x !== before.x || player.pos.z !== before.z, 'gate arrival must place player');
  // Last exit for the membership change should not be continuous.
  const exit = events.find((p) => p && p.sectorId === HELIOS);
  assert.ok(exit);
  assert.equal(!!exit.continuous, false);
  assert.equal(!!exit.noTeleport, false);
});

test('C4-SEM-04 _tickResidency only auto-switches corridor free-flight (source contract)', () => {
  assert.match(WORLD_SRC, /_tickResidency\(state\)/);
  assert.match(WORLD_SRC, /sectorMembershipAtGlobal\(player\.pos,\s*CORRIDOR_SECTOR_IDS\)/);
  assert.match(WORLD_SRC, /continuous:\s*true/);
  assert.match(WORLD_SRC, /noTeleport:\s*true/);
  // Must skip while jump tunnel is active.
  assert.match(WORLD_SRC, /jump\.state === 'CHARGING' \|\| state\.jump\.state === 'JUMPING'/);
});

// ── Cruise is speed tier, not map/world authority ───────────────────────────

test('C4-SEM-05 cruise system is travel-speed only; not a second map or membership authority', () => {
  assert.match(CRUISE_SRC, /name:\s*['"]cruise['"]/);
  assert.doesNotMatch(CRUISE_SRC, /enterSector\s*\(/);
  assert.doesNotMatch(CRUISE_SRC, /computeRoute\s*\(/);
  assert.doesNotMatch(CRUISE_SRC, /state\.nav\.route\s*=/);
  assert.doesNotMatch(CRUISE_SRC, /pushScreen\s*\(/);
  assert.doesNotMatch(GATE_SRC, /enterSector\s*\(/);
  assert.match(GATE_SRC, /via !== ['"]gate['"]/);
});

// ── Discovery fog × route ───────────────────────────────────────────────────

test('C4-SEM-06 computeRoute respects discovery; full chart yields 24-reachable paths from Helios', () => {
  const { state, world } = bootWorld(47);
  state.world.currentSectorId = HELIOS;
  discoverAll(state);

  let routed = 0;
  for (const s of SECTORS) {
    if (s.id === HELIOS) continue;
    const route = world.computeRoute(s.id, 'hops');
    if (route && route.legs && route.legs.length) routed += 1;
  }
  assert.equal(routed, 23, 'from Helios with full discovery, every other region must be routable');
});

test('C4-SEM-07 continuous enter does not increment visitedCount; intentional does', () => {
  const { state, world } = bootWorld(49);
  world.enterSector(HELIOS, { placePlayer: true });
  const base = state.world.discovery[HELIOS].visitedCount || 0;

  world.enterSector(CERES, { continuous: true, noTeleport: true, fromSectorId: HELIOS });
  // Leaving Helios continuously should not re-count Helios; Ceres continuous also skips visitedCount++.
  const ceresAfterContinuous = state.world.discovery[CERES].visitedCount || 0;
  assert.equal(ceresAfterContinuous, 0, 'continuous first membership must not bump visitedCount');

  world.enterSector(TETHYS, { fromJump: true, via: 'gate', fromSectorId: CERES });
  assert.ok(
    (state.world.discovery[TETHYS].visitedCount || 0) >= 1,
    'intentional enter must increment visitedCount',
  );
  assert.ok(base >= 1, 'initial intentional Helios enter counts a visit');
});

// ── Save / Continue route + discovery identity ──────────────────────────────

test('C4-SEM-08 world.serialize carries discovery+currentSectorId; save nav carries route identity', () => {
  const { state, world } = bootWorld(51);
  world.enterSector(HELIOS, { placePlayer: true });
  discoverAll(state);
  const route = world.computeRoute(TETHYS, 'fuel');
  assert.ok(route);
  state.nav.route = route;
  state.nav.autoTravel = true;
  state.nav.waypoint = {
    kind: 'mission',
    missionId: 'm1',
    sectorId: TETHYS,
    label: 'Tethys',
  };

  const worldBlob = world.serialize();
  assert.equal(worldBlob.currentSectorId, HELIOS);
  assert.ok(worldBlob.discovery[HELIOS].discovered);
  assert.equal('frameOrigin' in worldBlob, false);
  assert.equal('residentSectors' in worldBlob, false);

  const bus = createBus();
  save.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  const data = save.serializeData();
  assert.deepEqual(
    data.nav.route.legs.map((l) => `${l.from}>${l.to}`),
    route.legs.map((l) => `${l.from}>${l.to}`),
  );

  // Continue rematerialization path: wipe nav, restore, identity holds.
  state.nav = { route: null, autoTravel: false, waypoint: null, autopilot: { active: false, target: null, targetEntityId: null, label: '', arrivalRadius: 36, status: 'idle' } };
  save._restoreNav(data.nav);
  assert.deepEqual(
    state.nav.route.legs.map((l) => `${l.from}>${l.to}`),
    route.legs.map((l) => `${l.from}>${l.to}`),
  );
  assert.equal(state.nav.waypoint.missionId, 'm1');
  assert.equal(state.nav.autoTravel, true);
});

test('C4-SEM-09 world.deserialize restores discovery identity without smuggling residency bags', () => {
  const { state, world } = bootWorld(53);
  world.enterSector(HELIOS, { placePlayer: true });
  const blob = world.serialize();
  blob.residentSectors = { [CERES]: { tier: 'FULL' } }; // smuggled — must ignore
  blob.sectorContents = { [CERES]: { stations: [1] } };
  blob.frameOrigin = { x: 999, z: 999 };

  // Second world instance path: deserialize into same system after clear.
  world.deserialize(blob);
  assert.equal(state.world.currentSectorId, HELIOS);
  assert.ok(state.world.discovery[HELIOS]);
  assert.deepEqual(state.world.residentSectors, {});
  assert.deepEqual(state.world.sectorContents, {});
  assert.equal(state.world.frameOrigin.x, 0);
  assert.equal(state.world.frameOrigin.z, 0);
});
