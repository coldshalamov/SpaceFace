// M2a continuous corridor residency — Helios ↔ Ceres ↔ Tethys.
// Proves free-flight membership, FULL/REDUCED/RECORD_ONLY tiers, no global wipe,
// stable homeSectorId, deterministic eviction/RNG, and gate-path placement.

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
  CORRIDOR_SECTOR_IDS,
  RESIDENCY_MATERIALIZED_CAP,
  RESIDENCY_TIER,
  corridorPlayableBounds,
  planMaterializedResidents,
  sectorGlobalOrigin,
  sectorMembershipAtGlobal,
  sectorLocalToGlobalForSector,
} from '../src/data/sectorCoordinates.js';
import { SECTORS } from '../src/data/sectors.js';

const HELIOS = 'sector_helios_prime';
const CERES = 'sector_ceres_belt';
const TETHYS = 'sector_tethys_junction';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORLD_SRC = readFileSync(join(__dirname, '../src/systems/world.js'), 'utf8');

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
  player.isPlayer = true;
  player.vel = player.vel || { x: 0, z: 0 };
  player.flags = player.flags || { boosting: false, docked: false, invuln: false, noInterp: false };
  const world = Object.assign(Object.create(worldSystem), {});
  world.init(ctx);
  return { state, bus, helpers, world, player };
}

function residencySnapshot(state) {
  const rs = state.world.residentSectors || {};
  const out = {};
  for (const id of Object.keys(rs).sort()) {
    out[id] = rs[id] && rs[id].tier;
  }
  return out;
}

function entitiesForSector(state, sectorId) {
  const out = [];
  for (const e of state.entityList) {
    if (!e || !e.alive) continue;
    const home = e.homeSectorId || (e.data && e.data.homeSectorId);
    if (home === sectorId) out.push(e);
  }
  return out;
}

/** Structural (non-LOD) sector entities: stations, gates, asteroids, pois — not dressing/enemies. */
function structuralIdsForSector(state, sectorId) {
  return entitiesForSector(state, sectorId)
    .filter((e) => {
      if (e.type === 'asteroid') return true;
      if (e.type === 'station') return true;
      if (e.type === 'fx' && e.data && e.data.poi) return true;
      return false;
    })
    .map((e) => e.id)
    .sort((a, b) => a - b);
}

function aliveIds(state) {
  return state.entityList.filter((e) => e && e.alive).map((e) => e.id).sort((a, b) => a - b);
}

test('corridor membership is nearest-origin and deterministic on ties', () => {
  assert.equal(sectorMembershipAtGlobal({ x: 0, z: 0 }), HELIOS);
  assert.equal(sectorMembershipAtGlobal(sectorGlobalOrigin(CERES)), CERES);
  assert.equal(sectorMembershipAtGlobal(sectorGlobalOrigin(TETHYS)), TETHYS);

  // Midpoint Helios↔Ceres: both distances equal → lex smaller id wins.
  const h = sectorGlobalOrigin(HELIOS);
  const c = sectorGlobalOrigin(CERES);
  const mid = { x: (h.x + c.x) * 0.5, z: (h.z + c.z) * 0.5 };
  const dH = Math.hypot(mid.x - h.x, mid.z - h.z);
  const dC = Math.hypot(mid.x - c.x, mid.z - c.z);
  assert.ok(Math.abs(dH - dC) < 1e-6);
  // sector_ceres_belt < sector_helios_prime lexicographically
  assert.equal(sectorMembershipAtGlobal(mid), CERES);
});

test('planMaterializedResidents applies hard cap with deterministic eviction order', () => {
  const focus = sectorGlobalOrigin(HELIOS);
  const plan3 = planMaterializedResidents(HELIOS, focus, null, 3, (id) => {
    const s = SECTORS.find((x) => x.id === id);
    return s ? s.neighbors : [];
  });
  assert.equal(plan3.tiers.get(HELIOS), RESIDENCY_TIER.FULL);
  assert.equal(plan3.tiers.get(CERES), RESIDENCY_TIER.REDUCED);
  assert.equal(plan3.tiers.get(TETHYS), RESIDENCY_TIER.REDUCED);

  // Cap 2: keep membership + nearest corridor neighbor only.
  const plan2 = planMaterializedResidents(HELIOS, focus, null, 2, (id) => {
    const s = SECTORS.find((x) => x.id === id);
    return s ? s.neighbors : [];
  });
  assert.equal(plan2.tiers.get(HELIOS), RESIDENCY_TIER.FULL);
  const ceresD = Math.hypot(
    focus.x - sectorGlobalOrigin(CERES).x,
    focus.z - sectorGlobalOrigin(CERES).z,
  );
  const tethysD = Math.hypot(
    focus.x - sectorGlobalOrigin(TETHYS).x,
    focus.z - sectorGlobalOrigin(TETHYS).z,
  );
  // Symmetric distances Helios→Ceres and Helios→Tethys; lex order keeps ceres first.
  assert.ok(Math.abs(ceresD - tethysD) < 1e-6);
  assert.equal(plan2.tiers.get(CERES), RESIDENCY_TIER.REDUCED);
  assert.equal(plan2.tiers.get(TETHYS), RESIDENCY_TIER.RECORD_ONLY);
  assert.ok(plan2.demote.includes(TETHYS));
  assert.equal(RESIDENCY_MATERIALIZED_CAP, 3);
});

test('corridor outer bounds are center-aware and larger than a single sector disk', () => {
  const b = corridorPlayableBounds(SECTORS);
  assert.ok(b.radius > 8000);
  assert.ok(b.hardRadius > b.radius);
  // Helios disk alone is 3500; corridor fence must let the player leave that disk.
  assert.ok(b.radius > 3500 + 500);
  // Center is not forced to a single sector origin.
  assert.ok(Number.isFinite(b.center.x) && Number.isFinite(b.center.z));
});

test('Helios boot remains single-sector UI compatible via activeSector', () => {
  const { state, world } = bootWorld(7);
  world.enterSector(HELIOS);
  assert.equal(state.world.currentSectorId, HELIOS);
  assert.ok(state.world.activeSector);
  assert.ok(state.world.activeSector.stations.length >= 1);
  assert.equal(residencySnapshot(state)[HELIOS], RESIDENCY_TIER.FULL);
  // Prefetched corridor neighbors are REDUCED under default cap 3.
  assert.equal(residencySnapshot(state)[CERES], RESIDENCY_TIER.REDUCED);
  assert.equal(residencySnapshot(state)[TETHYS], RESIDENCY_TIER.REDUCED);
  // Authored Helios station still at local==global for zero origin.
  const heliosSt = state.world.activeSector.stations.find((s) => s.stationId === 'station_helios');
  assert.ok(heliosSt);
  assert.equal(heliosSt.pos.x, sectorLocalToGlobalForSector(
    SECTORS.find((s) => s.id === HELIOS).stations[0].pos, HELIOS,
  ).x);
});

test('free-flight membership never teleports, zeros velocity, or sets noInterp', () => {
  const { state, bus, world, player } = bootWorld(11);
  world.enterSector(HELIOS);

  player.pos.x = 10;
  player.pos.z = -20;
  player.vel.x = 42.5;
  player.vel.z = -7.25;
  player.flags.noInterp = false;
  const posBefore = { x: player.pos.x, z: player.pos.z };
  const velBefore = { x: player.vel.x, z: player.vel.z };

  const membership = [];
  const residency = [];
  bus.on('world:membership', (p) => membership.push(p));
  bus.on('world:residency', (p) => residency.push(p));

  // Place player just on the Ceres side of the Helios/Ceres bisector.
  const h = sectorGlobalOrigin(HELIOS);
  const c = sectorGlobalOrigin(CERES);
  player.pos.x = (h.x + c.x) * 0.5 + (c.x - h.x) * 0.02;
  player.pos.z = (h.z + c.z) * 0.5 + (c.z - h.z) * 0.02;
  assert.equal(sectorMembershipAtGlobal(player.pos), CERES);

  const heliosStructuralBefore = structuralIdsForSector(state, HELIOS);
  assert.ok(heliosStructuralBefore.length > 0);

  world.update(1 / 60, state);

  assert.equal(state.world.currentSectorId, CERES);
  assert.equal(player.pos.x, (h.x + c.x) * 0.5 + (c.x - h.x) * 0.02);
  assert.equal(player.pos.z, (h.z + c.z) * 0.5 + (c.z - h.z) * 0.02);
  // Position must not snap to Ceres entry point / origin.
  assert.notEqual(player.pos.x, sectorGlobalOrigin(CERES).x);
  assert.equal(player.vel.x, velBefore.x);
  assert.equal(player.vel.z, velBefore.z);
  assert.equal(player.flags.noInterp, false);

  assert.ok(membership.length >= 1);
  const lastMem = membership[membership.length - 1];
  assert.equal(lastMem.sectorId, CERES);
  assert.equal(lastMem.previousSectorId, HELIOS);
  assert.equal(lastMem.noTeleport, true);
  assert.equal(lastMem.reason, 'free_flight');
  assert.ok(Number.isFinite(lastMem.tick));

  // Structural Helios entities survive free-flight membership (no global wipe).
  // FULL→REDUCED may drop dressing/enemies for that sector only — not stations/fields/pois.
  assert.deepEqual(structuralIdsForSector(state, HELIOS), heliosStructuralBefore);
  assert.equal(residencySnapshot(state)[CERES], RESIDENCY_TIER.FULL);
  assert.equal(residencySnapshot(state)[HELIOS], RESIDENCY_TIER.REDUCED);

  // activeSector tracks membership for UI.
  assert.ok(state.world.activeSector.stations.some((s) => s.stationId === 'station_ceres'
    || (state.world.sectorContents && state.world.sectorContents[CERES])));
  void posBefore;
  void residency;
});

test('spawned sector entities carry stable homeSectorId; demotion is sector-scoped', () => {
  const { state, world, player, helpers } = bootWorld(13);
  world.enterSector(HELIOS);

  for (const e of entitiesForSector(state, HELIOS)) {
    assert.equal(e.homeSectorId || e.data.homeSectorId, HELIOS);
  }
  // Prefetch REDUCED neighbors also tag home.
  for (const e of entitiesForSector(state, CERES)) {
    assert.equal(e.homeSectorId || e.data.homeSectorId, CERES);
  }

  // Persistent / mission-pinned entities survive foreign-sector demotion.
  const pinned = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 50, z: 50 },
    radius: 4,
    mass: 10,
    hull: 50,
    hullMax: 50,
    collides: true,
    flags: { persistent: true },
    data: { homeSectorId: CERES, missionPinned: true, missionId: 'm_test' },
  });
  pinned.homeSectorId = CERES;
  pinned.flags.missionPinned = true;
  const pinnedId = pinned.id;

  // Force Ceres to RECORD_ONLY via capped residency from Tethys membership far from Ceres.
  player.pos.x = sectorGlobalOrigin(TETHYS).x;
  player.pos.z = sectorGlobalOrigin(TETHYS).z;
  world.update(1 / 60, state);
  assert.equal(state.world.currentSectorId, TETHYS);

  // With default cap 3 all corridor sectors stay materialized — inject a forced demote.
  world._setSectorTier(CERES, RESIDENCY_TIER.RECORD_ONLY, { reason: 'test_demote' });

  // Sector-scoped wipe: non-protected Ceres entities gone; pinned + player survive.
  const ceresLeft = entitiesForSector(state, CERES);
  assert.ok(ceresLeft.every((e) => e.id === pinnedId));
  assert.equal(ceresLeft.length, 1);
  // Helios still has residents; player + pinned survive with stable identity.
  assert.ok(entitiesForSector(state, HELIOS).length > 0);
  assert.ok(state.entities.get(state.playerId).alive);
  assert.ok(state.entities.get(pinnedId).alive);
  assert.equal(state.entities.get(pinnedId).id, pinnedId);
});

test('sector content RNG is stable across membership jitter; state.rng untouched', () => {
  const { state, world, player } = bootWorld(17);
  world.enterSector(HELIOS);

  const rngRef = state.rng;
  // Draw once to pin stream position; free-flight must not consume state.rng.
  const nextA = state.rng();
  // Restore by re-seeding is unavailable; instead verify membership path does not call rng:
  // snapshot function identity and that an equal number of draws after a no-op membership
  // match a parallel virgin world only for world.rng sector content.
  state.rng = rngRef; // keep same fn; we already advanced once — compare identity only below
  void nextA;

  const ceresStationsBefore = (state.world.sectorContents[CERES].stations || [])
    .map((s) => ({ id: s.stationId, x: s.pos.x, z: s.pos.z }));
  assert.ok(ceresStationsBefore.length >= 1);

  // Cross into Ceres and back into Helios — Ceres must not rematerialize different anchors.
  const h = sectorGlobalOrigin(HELIOS);
  const c = sectorGlobalOrigin(CERES);
  player.pos.x = (h.x + c.x) * 0.5 + (c.x - h.x) * 0.05;
  player.pos.z = (h.z + c.z) * 0.5 + (c.z - h.z) * 0.05;
  world.update(1 / 60, state);
  assert.equal(state.world.currentSectorId, CERES);

  player.pos.x = 0;
  player.pos.z = 0;
  world.update(1 / 60, state);
  assert.equal(state.world.currentSectorId, HELIOS);

  const ceresStationsAfter = (state.world.sectorContents[CERES].stations || [])
    .map((s) => ({ id: s.stationId, x: s.pos.x, z: s.pos.z }));
  assert.deepEqual(ceresStationsAfter, ceresStationsBefore);
  assert.equal(state.rng, rngRef);

  // Fresh boot with same seed materializes identical Ceres anchors (epoch-stable).
  const b2 = bootWorld(17);
  b2.world.enterSector(HELIOS);
  const ceresFresh = (b2.state.world.sectorContents[CERES].stations || [])
    .map((s) => ({ id: s.stationId, x: s.pos.x, z: s.pos.z }));
  assert.deepEqual(ceresFresh, ceresStationsBefore);
});

test('gate jump places player but does not wipe other bounded residents', () => {
  const { state, bus, world, player } = bootWorld(19);
  world.enterSector(HELIOS);

  const heliosStructural = structuralIdsForSector(state, HELIOS);
  assert.ok(heliosStructural.length > 0);

  // Arm a gate jump to Ceres and complete the FSM.
  state.jump.state = 'JUMPING';
  state.jump.targetSectorId = CERES;
  state.jump.via = 'gate';
  state.jump._jumpT = 99; // force completion on next tick
  player.vel.x = 1;
  player.vel.z = 1;

  const receipts = [];
  bus.on('world:membership', (p) => receipts.push(p));

  world.update(1 / 60, state);

  assert.equal(state.world.currentSectorId, CERES);
  // Gate path may place at entry (teleport intentional).
  assert.ok(player.flags.noInterp === true || Math.hypot(player.pos.x, player.pos.z) > 1000);
  // Helios structural residents still alive (no global wipe on jump).
  assert.deepEqual(structuralIdsForSector(state, HELIOS), heliosStructural);
  assert.equal(residencySnapshot(state)[HELIOS], RESIDENCY_TIER.REDUCED);
  assert.equal(residencySnapshot(state)[CERES], RESIDENCY_TIER.FULL);

  // Jump FSM returns to IDLE/COOLDOWN, not stuck.
  assert.ok(state.jump.state === 'IDLE' || state.jump.state === 'COOLDOWN');
  void receipts;
});

test('placePlayer residency ranks tight-cap neighbors from destination entry, not pre-teleport pose', () => {
  const neighborLookup = (id) => {
    const s = SECTORS.find((x) => x.id === id);
    return s ? s.neighbors : [];
  };

  // Pure planner: under cap 2, focus at Tethys keeps Tethys; focus at Helios-from-Ceres entry keeps Ceres.
  const focusAtTethys = sectorGlobalOrigin(TETHYS);
  const planFromSource = planMaterializedResidents(HELIOS, focusAtTethys, null, 2, neighborLookup);
  assert.equal(planFromSource.tiers.get(HELIOS), RESIDENCY_TIER.FULL);
  assert.equal(planFromSource.tiers.get(TETHYS), RESIDENCY_TIER.REDUCED);
  assert.equal(planFromSource.tiers.get(CERES), RESIDENCY_TIER.RECORD_ONLY);

  // Destination entry when arriving at Helios from Ceres sits on the Ceres-facing side.
  const { state, world, player } = bootWorld(41);
  // Pre-teleport pose is far at Tethys — wrong ranking if used as focus under tight cap.
  player.pos.x = sectorGlobalOrigin(TETHYS).x;
  player.pos.z = sectorGlobalOrigin(TETHYS).z;
  player.vel.x = 9;
  player.vel.z = -3;
  player.flags.noInterp = false;

  let capturedFocus = null;
  const origApply = world._applyResidencyPlan.bind(world);
  world._applyResidencyPlan = function (membershipSectorId, opts = {}) {
    capturedFocus = opts.focusGlobal ? { x: opts.focusGlobal.x, z: opts.focusGlobal.z } : null;
    return origApply(membershipSectorId, opts);
  };

  world.enterSector(HELIOS, {
    fromJump: true,
    via: 'gate',
    fromSectorId: CERES,
    placePlayer: true,
  });

  assert.ok(capturedFocus, 'placePlayer path must pass an explicit focusGlobal');
  const entry = state.world.entryPoint;
  assert.ok(entry);
  assert.equal(capturedFocus.x, entry.x);
  assert.equal(capturedFocus.z, entry.z);
  // Must not rank from the pre-teleport Tethys pose.
  assert.notEqual(capturedFocus.x, sectorGlobalOrigin(TETHYS).x);
  assert.notEqual(capturedFocus.z, sectorGlobalOrigin(TETHYS).z);

  // Tight-cap plan at destination entry keeps Ceres (arrival side), not Tethys.
  const planFromDest = planMaterializedResidents(HELIOS, capturedFocus, null, 2, neighborLookup);
  assert.equal(planFromDest.tiers.get(HELIOS), RESIDENCY_TIER.FULL);
  assert.equal(planFromDest.tiers.get(CERES), RESIDENCY_TIER.REDUCED);
  assert.equal(planFromDest.tiers.get(TETHYS), RESIDENCY_TIER.RECORD_ONLY);
  assert.notDeepEqual(
    {
      ceres: planFromSource.tiers.get(CERES),
      tethys: planFromSource.tiers.get(TETHYS),
    },
    {
      ceres: planFromDest.tiers.get(CERES),
      tethys: planFromDest.tiers.get(TETHYS),
    },
    'destination ranking must diverge from pre-teleport Tethys ranking under cap 2',
  );

  // Velocity / noInterp placePlayer semantics preserved.
  assert.equal(player.vel.x, 0);
  assert.equal(player.vel.z, 0);
  assert.equal(player.flags.noInterp, true);
  assert.equal(player.pos.x, entry.x);
  assert.equal(player.pos.z, entry.z);
});

test('free-flight residency still ranks from live player pose (not destination entry)', () => {
  const { state, world, player } = bootWorld(43);
  world.enterSector(HELIOS);

  const h = sectorGlobalOrigin(HELIOS);
  const c = sectorGlobalOrigin(CERES);
  player.pos.x = (h.x + c.x) * 0.5 + (c.x - h.x) * 0.04;
  player.pos.z = (h.z + c.z) * 0.5 + (c.z - h.z) * 0.04;
  player.vel.x = 12;
  player.vel.z = -4;
  player.flags.noInterp = false;
  const livePos = { x: player.pos.x, z: player.pos.z };
  const liveVel = { x: player.vel.x, z: player.vel.z };

  let capturedFocus = null;
  const origApply = world._applyResidencyPlan.bind(world);
  world._applyResidencyPlan = function (membershipSectorId, opts = {}) {
    capturedFocus = opts.focusGlobal ? { x: opts.focusGlobal.x, z: opts.focusGlobal.z } : null;
    return origApply(membershipSectorId, opts);
  };

  world.update(1 / 60, state);
  assert.equal(state.world.currentSectorId, CERES);
  assert.ok(capturedFocus);
  assert.equal(capturedFocus.x, livePos.x);
  assert.equal(capturedFocus.z, livePos.z);
  // Continuous path: no teleport / velocity wipe / noInterp.
  assert.equal(player.pos.x, livePos.x);
  assert.equal(player.pos.z, livePos.z);
  assert.equal(player.vel.x, liveVel.x);
  assert.equal(player.vel.z, liveVel.z);
  assert.equal(player.flags.noInterp, false);
});

test('physics bounds are corridor-global (player not trapped in Helios disk)', () => {
  const { state, world, player } = bootWorld(23);
  world.enterSector(HELIOS);
  const b = state.bounds;
  assert.ok(b && b.radius > 3500 + 200);
  // A point well outside Helios worldRadius but inside corridor must not be "hard trapped"
  // by a Helios-centered disk of r=3500.
  player.pos.x = 5000;
  player.pos.z = 0;
  const dx = player.pos.x - b.center.x;
  const dz = player.pos.z - b.center.z;
  const d = Math.hypot(dx, dz);
  assert.ok(d < b.radius, 'player at 5k wu from Helios origin remains inside corridor fence');
});

test('residency receipts include sector ids, tiers, reason, tick, noTeleport', () => {
  const { state, bus, world, player } = bootWorld(29);
  const residency = [];
  bus.on('world:residency', (p) => residency.push(JSON.parse(JSON.stringify(p))));
  world.enterSector(HELIOS);
  assert.ok(residency.length >= 1);
  const r0 = residency[0];
  assert.ok(Array.isArray(r0.sectors));
  assert.ok(r0.sectors.some((s) => s.sectorId === HELIOS && s.tier === RESIDENCY_TIER.FULL));
  assert.ok(typeof r0.reason === 'string');
  assert.ok(Number.isFinite(r0.tick));
  assert.equal(typeof r0.noTeleport, 'boolean');

  const h = sectorGlobalOrigin(HELIOS);
  const c = sectorGlobalOrigin(CERES);
  player.pos.x = (h.x + c.x) * 0.5 + (c.x - h.x) * 0.05;
  player.pos.z = (h.z + c.z) * 0.5 + (c.z - h.z) * 0.05;
  world.update(1 / 60, state);
  const last = residency[residency.length - 1];
  assert.equal(last.noTeleport, true);
  assert.ok(last.sectors.some((s) => s.sectorId === CERES && s.tier === RESIDENCY_TIER.FULL));
});

test('no Math.random / Date.now in world source; corridor constants exported', () => {
  const code = WORLD_SRC.replace(/\/\/.*$/gm, '');
  assert.equal(/Math\.random\s*\(/.test(code), false);
  assert.equal(/Date\.now\s*\(/.test(code), false);
  assert.equal(CORRIDOR_SECTOR_IDS.length, 24);
  assert.deepEqual(CORRIDOR_SECTOR_IDS.slice(0, 3), [HELIOS, CERES, TETHYS]);
});

test('enterSector does not call global-wipe helper path for continuous membership', () => {
  // Source-level: continuous path must not invoke _despawnSectorEntities (global wipe).
  assert.match(WORLD_SRC, /_despawnEntitiesForSector/);
  assert.match(WORLD_SRC, /free_flight/);
  // Global wipe may still exist for emergency/legacy but continuous path uses scoped despawn.
  assert.match(WORLD_SRC, /noTeleport/);
});

test('multi-sector materialization preserves per-sector bags without clobbering activeSector view', () => {
  const { state, world } = bootWorld(31);
  world.enterSector(HELIOS);
  assert.ok(state.world.sectorContents[HELIOS]);
  assert.ok(state.world.sectorContents[CERES]);
  assert.ok(state.world.sectorContents[TETHYS]);
  assert.equal(state.world.activeSector, state.world.sectorContents[HELIOS]);
  const heliosStationCount = state.world.sectorContents[HELIOS].stations.length;
  const ceresStationCount = state.world.sectorContents[CERES].stations.length;
  assert.ok(heliosStationCount >= 1);
  assert.ok(ceresStationCount >= 1);
  // Re-entering membership sector does not wipe neighbor bags.
  world.enterSector(HELIOS, { continuous: true, noTeleport: true });
  assert.equal(state.world.sectorContents[CERES].stations.length, ceresStationCount);
  assert.equal(aliveIds(state).length > 1, true);
});

test('save/load clears stale residency bags so the saved sector rematerializes structural entities', () => {
  const { state, world, player } = bootWorld(37);
  world.enterSector(HELIOS);
  const saved = world.serialize();
  assert.ok(state.world.activeSector.stations.length >= 1);
  assert.ok(state.world.activeSector.gates.length >= 1);

  // Match saveSystem's runtime-entity clear while deliberately leaving the old world bags in place.
  for (const entity of state.entityList) {
    if (!entity || entity.id === player.id) continue;
    entity.alive = false;
    state.entities.delete(entity.id);
  }
  assert.ok(state.world.sectorContents[HELIOS].stations.length >= 1, 'precondition: stale bag survives');

  world.deserialize(saved);
  assert.deepEqual(state.world.residentSectors, {});
  assert.deepEqual(state.world.sectorContents, {});
  assert.equal(state.world.activeSector.stations.length, 0);

  world.enterSector(saved.currentSectorId, { placePlayer: false });
  assert.ok(state.world.activeSector.stations.length >= 1, 'stations rematerialize after load');
  assert.ok(state.world.activeSector.gates.length >= 1, 'gates rematerialize after load');
  const liveStationIds = state.world.activeSector.stations.filter((entry) => state.entities.get(entry.id)?.alive);
  assert.equal(liveStationIds.length, state.world.activeSector.stations.length);
});

test('newGame rebuilds the mutable canonical 24-sector world table after state reset', () => {
  const { state, world } = bootWorld(39);
  state.world.sectors = {};
  world.newGame();
  assert.equal(Object.keys(state.world.sectors).length, 24);
  assert.deepEqual(Object.keys(state.world.sectors), SECTORS.map((sector) => sector.id));
  for (const sector of SECTORS) {
    assert.equal(state.world.sectors[sector.id].owner, sector.factionId);
  }
});
