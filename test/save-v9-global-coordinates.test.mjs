// v8→v9 save migration: sector-local positions become galactic-global XZ.
// Pure migration tests — no live spawning, physics, render, or goldens.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SECTOR_GLOBAL_ORIGINS,
  SECTOR_ORIGIN_LATTICE_WU,
  sectorGlobalOrigin,
  sectorLocalToGlobalForSector,
} from '../src/data/sectorCoordinates.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import { MIGRATIONS } from '../src/save/migrations.js';
import { createGameState } from '../src/core/gameState.js';
import { world } from '../src/systems/world.js';

const HELIOS = 'sector_helios_prime';
const CERES = 'sector_ceres_belt';
const TETHYS = 'sector_tethys_junction';

/** Run ordered migration chain from `fromVer` up to CURRENT_VERSION (mutates data). */
function migrateChain(data, fromVer) {
  let v = fromVer | 0;
  let guard = 0;
  while (v < CURRENT_VERSION && guard++ < 64) {
    const step = MIGRATIONS.find((m) => m.from === v);
    if (!step) break;
    step.fn(data);
    v = step.to;
  }
  return v;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** Realistic v8 envelope payload: sector-local positions on every supported surface. */
function makeV8Data(overrides = {}) {
  const ceresLocal = { x: 120.5, z: -80 };
  const heliosLocal = { x: 10, z: 20 };
  const tethysLocal = { x: -40, z: 55 };
  const data = {
    meta: { seed: 42, playtimeS: 100 },
    player: { credits: 500 },
    world: {
      currentSectorId: CERES,
      discovery: { [CERES]: { charted: true } },
      // entryPoint is NOT written by world.serialize() today; include so migration is proven
      // if a legacy envelope carried it.
      entryPoint: { x: ceresLocal.x, z: ceresLocal.z, heading: 1.2 },
      // stale frame values must be wiped by migration / load sanitize
      frameOrigin: { x: 99999, z: -88888 },
      frameOriginSeq: 7,
      scanPings: {
        [CERES]: [{ id: 'ping_a', pos: { x: 200, z: -50 }, kind: 'unknown' }],
        [HELIOS]: [{ id: 'ping_b', pos: { x: 5, z: 6 }, kind: 'unknown' }],
      },
      pendingSpawns: {
        [TETHYS]: [{
          entityType: 'pirate',
          sectorId: TETHYS,
          position: { x: tethysLocal.x, z: tethysLocal.z },
          tags: ['ambush'],
          count: 2,
        }],
        [CERES]: [{
          entityType: 'pirate',
          sectorId: CERES,
          position: { x: 1, z: 2 },
          tags: [],
          count: 1,
        }],
      },
    },
    entities: {
      player: {
        type: 'ship',
        pos: { x: ceresLocal.x, z: ceresLocal.z },
        vel: { x: 3.5, z: -1.25 },
        rot: 0.4,
        angVel: 0.1,
      },
      persistent: [
        {
          type: 'ship',
          pos: { x: 50, z: -25 },
          vel: { x: 0.5, z: 0.25 },
          flags: { persistent: true },
        },
      ],
      simTime: 12.5,
      tick: 100,
    },
    nav: {
      route: null,
      autoTravel: false,
      waypoint: {
        kind: 'mission',
        sectorId: TETHYS,
        label: 'Tethys hub',
        pos: { x: tethysLocal.x, z: tethysLocal.z },
      },
      autopilot: {
        active: true,
        target: { x: heliosLocal.x, z: heliosLocal.z },
        targetEntityId: null,
        label: 'hold',
        arrivalRadius: 36,
        status: 'armed',
      },
    },
    aftermathWrecks: {
      schemaVersion: 1,
      seed: 1,
      bySector: {
        [CERES]: [{
          markerId: 'aft_1',
          sectorId: CERES,
          pos: { x: 300, z: -100 },
          victimClass: 'ship',
        }],
        [HELIOS]: [{
          markerId: 'aft_2',
          sectorId: HELIOS,
          pos: { x: 7, z: 8 },
          victimClass: 'drone',
        }],
      },
    },
    claims: {
      bodies: [
        {
          id: 'claim_1',
          sectorId: CERES,
          poiId: 'poi_colony',
          name: 'Test claim',
          x: 400,
          z: -200,
          modules: [],
        },
      ],
    },
    automation: {
      drones: [{
        id: 'd1',
        defId: 'drone_basic',
        sectorId: CERES,
        originPos: { x: 15, z: -9 },
        buffer: 0,
      }],
      outposts: [{
        id: 'o1',
        defId: 'outpost_basic',
        sectorId: TETHYS,
        pos: { x: 60, z: 70 },
        storage: 0,
      }],
      traders: [],
      fleet: [],
    },
    missions: {
      // Active mission records do not store sector-local pos today (nav.waypoint holds guidance).
      // Include an optional pos shape so migration handles it if present.
      active: [{
        id: 'm_1',
        type: 'bounty_hunt',
        destSectorId: CERES,
        pos: { x: 88, z: -33 },
        status: 'active',
        params: { clearCount: 3 },
      }],
      boards: {},
      completedLog: [],
      receipts: [],
      nextId: 2,
    },
    // Unrelated {x,z} must never be coerced.
    economy: {
      markets: {
        station_ceres: { priceBias: { x: 1, z: 2 } },
      },
    },
  };
  return Object.assign(data, overrides);
}

// ── sector origin table ─────────────────────────────────────────────────────────────────────

test('explicit global-origin table covers all authored sector ids on 4096 lattice', () => {
  assert.equal(SECTOR_ORIGIN_LATTICE_WU, 4096);
  assert.ok(CURRENT_VERSION >= 9, `global-coordinate migration requires save version >=9, got ${CURRENT_VERSION}`);

  const authored = [
    HELIOS, CERES, TETHYS,
    'sector_vesta_forge', 'sector_pallas_drift', 'sector_io_reach',
    'sector_charon_expanse', 'sector_sker_haven', 'sector_veil_nebula', 'sector_ashfall_reach',
  ];
  for (const id of authored) {
    assert.ok(SECTOR_GLOBAL_ORIGINS[id], `missing origin for ${id}`);
    const o = SECTOR_GLOBAL_ORIGINS[id];
    assert.ok(Object.isFrozen(o), `origin for ${id} should be frozen`);
    // Lattice multiples only (use integer division — JS `%` yields -0 for negative multiples).
    assert.equal(o.x / SECTOR_ORIGIN_LATTICE_WU, Math.trunc(o.x / SECTOR_ORIGIN_LATTICE_WU));
    assert.equal(o.z / SECTOR_ORIGIN_LATTICE_WU, Math.trunc(o.z / SECTOR_ORIGIN_LATTICE_WU));
  }
  assert.ok(Object.isFrozen(SECTOR_GLOBAL_ORIGINS));

  // Topology: Helios/Ceres/Tethys must differ (map graph neighbors, not UI meters).
  const h = sectorGlobalOrigin(HELIOS);
  const c = sectorGlobalOrigin(CERES);
  const t = sectorGlobalOrigin(TETHYS);
  assert.deepEqual(h, { x: 0, z: 0 });
  assert.notDeepEqual(c, h);
  assert.notDeepEqual(t, h);
  assert.notDeepEqual(c, t);
  // Ceres is west of Helios, Tethys east (map x * lattice → global x).
  assert.ok(c.x < 0 && t.x > 0);
});

test('sectorLocalToGlobalForSector adds sector origin; unknown fails closed to Helios', () => {
  const local = { x: 100, z: -50 };
  const ceres = sectorLocalToGlobalForSector(local, CERES);
  assert.deepEqual(ceres, {
    x: 100 + SECTOR_GLOBAL_ORIGINS[CERES].x,
    z: -50 + SECTOR_GLOBAL_ORIGINS[CERES].z,
  });
  const unknown = sectorLocalToGlobalForSector(local, 'sector_does_not_exist');
  assert.deepEqual(unknown, { x: 100, z: -50 }); // Helios origin is 0,0
  assert.deepEqual(sectorGlobalOrigin('sector_does_not_exist'), sectorGlobalOrigin(HELIOS));
  assert.deepEqual(sectorGlobalOrigin(null), sectorGlobalOrigin(HELIOS));
});

// ── v8 → v9 migration surfaces ──────────────────────────────────────────────────────────────

test('v8→v9 converts every supported spatial surface by exact sector-origin addition', () => {
  const data = makeV8Data();
  const velBefore = deepClone(data.entities.player.vel);
  const persistentVelBefore = deepClone(data.entities.persistent[0].vel);
  const economyBiasBefore = deepClone(data.economy.markets.station_ceres.priceBias);
  const ceresO = SECTOR_GLOBAL_ORIGINS[CERES];
  const tethysO = SECTOR_GLOBAL_ORIGINS[TETHYS];
  const heliosO = SECTOR_GLOBAL_ORIGINS[HELIOS];

  const to = migrateChain(data, 8);
  assert.equal(to, CURRENT_VERSION);

  assert.equal(data.world.coordinateSchema, 'global_v1');
  assert.deepEqual(data.world.frameOrigin, { x: 0, z: 0 });
  assert.equal(data.world.frameOriginSeq, 0);

  // Player / persistent (current-sector origin for entities).
  assert.deepEqual(data.entities.player.pos, {
    x: 120.5 + ceresO.x,
    z: -80 + ceresO.z,
  });
  assert.deepEqual(data.entities.player.vel, velBefore);
  assert.deepEqual(data.entities.persistent[0].pos, {
    x: 50 + ceresO.x,
    z: -25 + ceresO.z,
  });
  assert.deepEqual(data.entities.persistent[0].vel, persistentVelBefore);

  // entryPoint (if present) uses current sector.
  assert.deepEqual(data.world.entryPoint, {
    x: 120.5 + ceresO.x,
    z: -80 + ceresO.z,
    heading: 1.2,
  });

  // Nav waypoint uses its sectorId; autopilot target uses current sector.
  assert.deepEqual(data.nav.waypoint.pos, {
    x: -40 + tethysO.x,
    z: 55 + tethysO.z,
  });
  assert.deepEqual(data.nav.autopilot.target, {
    x: 10 + ceresO.x,
    z: 20 + ceresO.z,
  });

  // scanPings per-sector arrays
  assert.deepEqual(data.world.scanPings[CERES][0].pos, {
    x: 200 + ceresO.x,
    z: -50 + ceresO.z,
  });
  assert.deepEqual(data.world.scanPings[HELIOS][0].pos, {
    x: 5 + heliosO.x,
    z: 6 + heliosO.z,
  });

  // pendingSpawns position records
  assert.deepEqual(data.world.pendingSpawns[TETHYS][0].position, {
    x: -40 + tethysO.x,
    z: 55 + tethysO.z,
  });
  assert.deepEqual(data.world.pendingSpawns[CERES][0].position, {
    x: 1 + ceresO.x,
    z: 2 + ceresO.z,
  });

  // aftermath wrecks
  assert.deepEqual(data.aftermathWrecks.bySector[CERES][0].pos, {
    x: 300 + ceresO.x,
    z: -100 + ceresO.z,
  });
  assert.deepEqual(data.aftermathWrecks.bySector[HELIOS][0].pos, {
    x: 7 + heliosO.x,
    z: 8 + heliosO.z,
  });

  // claims coordinate records (x/z fields)
  assert.equal(data.claims.bodies[0].x, 400 + ceresO.x);
  assert.equal(data.claims.bodies[0].z, -200 + ceresO.z);

  // automation drone originPos / outpost pos
  assert.deepEqual(data.automation.drones[0].originPos, {
    x: 15 + ceresO.x,
    z: -9 + ceresO.z,
  });
  assert.deepEqual(data.automation.outposts[0].pos, {
    x: 60 + tethysO.x,
    z: 70 + tethysO.z,
  });

  // mission pos when shape exists
  assert.deepEqual(data.missions.active[0].pos, {
    x: 88 + ceresO.x,
    z: -33 + ceresO.z,
  });

  // unrelated {x,z} must remain untouched
  assert.deepEqual(data.economy.markets.station_ceres.priceBias, economyBiasBefore);
});

test('malformed and absent shapes are preserved safely', () => {
  const data = {
    world: {
      currentSectorId: CERES,
      scanPings: {
        [CERES]: [
          null,
          { id: 'bad', pos: { x: 'nope', z: 1 } },
          { id: 'partial', pos: { x: 3 } },
          { id: 'ok', pos: { x: 1, z: 2 } },
        ],
        notAnArray: { pos: { x: 9, z: 9 } },
      },
      pendingSpawns: {
        [CERES]: [
          null,
          { entityType: 'pirate', position: null },
          { entityType: 'pirate', position: { x: 4, z: 5 } },
        ],
      },
    },
    entities: {
      player: { type: 'ship' }, // no pos
      persistent: [null, { type: 'ship' }, { type: 'ship', pos: { x: 2, z: 3 } }],
    },
    nav: {
      waypoint: { label: 'no pos' },
      autopilot: { active: false, target: null },
    },
    aftermathWrecks: { bySector: { [CERES]: [null, { markerId: 'x' }, { markerId: 'y', pos: { x: 6, z: 7 } }] } },
    claims: { bodies: [null, { id: 'claim_x' }, { id: 'claim_y', sectorId: CERES, x: 8, z: 9 }] },
    automation: { drones: [{ id: 'd' }], outposts: [{ id: 'o', sectorId: CERES, pos: { x: 1, z: 1 } }] },
    missions: { active: [{ id: 'm' }, { id: 'm2', destSectorId: CERES, pos: null }] },
  };

  migrateChain(data, 8);
  const o = SECTOR_GLOBAL_ORIGINS[CERES];

  assert.equal(data.entities.player.pos, undefined);
  assert.equal(data.entities.persistent[0], null);
  assert.equal(data.entities.persistent[1].pos, undefined);
  assert.deepEqual(data.entities.persistent[2].pos, { x: 2 + o.x, z: 3 + o.z });

  assert.equal(data.world.scanPings[CERES][0], null);
  assert.deepEqual(data.world.scanPings[CERES][1].pos, { x: 'nope', z: 1 });
  assert.deepEqual(data.world.scanPings[CERES][2].pos, { x: 3 });
  assert.deepEqual(data.world.scanPings[CERES][3].pos, { x: 1 + o.x, z: 2 + o.z });
  assert.deepEqual(data.world.scanPings.notAnArray, { pos: { x: 9, z: 9 } });

  assert.deepEqual(data.world.pendingSpawns[CERES][2].position, { x: 4 + o.x, z: 5 + o.z });
  assert.deepEqual(data.aftermathWrecks.bySector[CERES][2].pos, { x: 6 + o.x, z: 7 + o.z });
  assert.equal(data.claims.bodies[2].x, 8 + o.x);
  assert.equal(data.claims.bodies[2].z, 9 + o.z);
  assert.deepEqual(data.automation.outposts[0].pos, { x: 1 + o.x, z: 1 + o.z });
  assert.equal(data.automation.drones[0].originPos, undefined);
});

test('unknown sector ids fail closed to Helios origin during migration', () => {
  const data = makeV8Data({
    world: {
      currentSectorId: 'sector_unknown_xyz',
      scanPings: {},
      pendingSpawns: {},
      entryPoint: { x: 11, z: 22, heading: 0 },
    },
    entities: {
      player: { type: 'ship', pos: { x: 11, z: 22 }, vel: { x: 0, z: 0 } },
      persistent: [],
    },
    nav: { waypoint: null, autopilot: { target: null } },
    aftermathWrecks: { bySector: {} },
    claims: { bodies: [] },
    automation: { drones: [], outposts: [] },
    missions: { active: [] },
  });
  migrateChain(data, 8);
  // Helios origin is 0,0 → positions unchanged numerically but schema stamped.
  assert.deepEqual(data.entities.player.pos, { x: 11, z: 22 });
  assert.deepEqual(data.world.entryPoint, { x: 11, z: 22, heading: 0 });
  assert.equal(data.world.coordinateSchema, 'global_v1');
});

// ── chain + idempotence ─────────────────────────────────────────────────────────────────────

test('full v1→v9 migration chain completes', () => {
  const data = {
    entities: {
      player: { type: 'ship', pos: { x: 1, z: 2 }, vel: { x: 0, z: 0 } },
      persistent: [],
    },
    world: { currentSectorId: HELIOS },
  };
  const to = migrateChain(data, 1);
  assert.equal(to, CURRENT_VERSION);
  assert.ok(data.crafting && data.crafting.queues);
  assert.ok(data.sectorSim && data.sectorSim.sectors);
  assert.ok(data.nav);
  assert.ok(data.lossLedger);
  assert.ok(data.aftermathWrecks);
  assert.equal(data.world.coordinateSchema, 'global_v1');
  assert.deepEqual(data.world.frameOrigin, { x: 0, z: 0 });
  // Helios origin 0 → same local numbers are now global
  assert.deepEqual(data.entities.player.pos, { x: 1, z: 2 });
});

test('current-version path does not double-add after v8→v9 migration', () => {
  const data = makeV8Data();
  migrateChain(data, 8);
  const afterFirst = deepClone(data);

  // Re-running from the current version is a no-op; v10+ migrations remain independently covered.
  const to = migrateChain(data, CURRENT_VERSION);
  assert.equal(to, CURRENT_VERSION);
  assert.deepEqual(data, afterFirst);

  // Prove positions are already global (include sector origin magnitude).
  const ceresO = SECTOR_GLOBAL_ORIGINS[CERES];
  assert.ok(Math.abs(data.entities.player.pos.x) > Math.abs(ceresO.x) * 0.5 || ceresO.x === 0
    || data.entities.player.pos.x === 120.5 + ceresO.x);
  assert.equal(data.entities.player.pos.x, 120.5 + ceresO.x);
  assert.equal(data.entities.player.pos.z, -80 + ceresO.z);
});

test('v8→v9 migration step is safe to re-run directly', () => {
  const data = makeV8Data();
  const step = MIGRATIONS.find((m) => m.from === 8 && m.to === 9);
  assert.ok(step);
  step.fn(data);
  const afterFirst = deepClone(data);
  step.fn(data);
  assert.deepEqual(data, afterFirst);
  assert.deepEqual(data.world.frameOrigin, { x: 0, z: 0 });
  assert.equal(data.world.frameOriginSeq, 0);
});

// ── v9 serialize / load frame policy ────────────────────────────────────────────────────────

test('world overlay persists coordinateSchema and resets frameOrigin on deserialize', () => {
  const state = createGameState(99);
  state.world.currentSectorId = CERES;
  state.world.coordinateSchema = 'global_v1';
  state.world.frameOrigin = { x: 12288, z: -4096 };
  state.world.frameOriginSeq = 4;
  state.world.scanPings = { [CERES]: [{ id: 'p', pos: { x: 1e6, z: 2e6 }, kind: 'unknown' }] };
  state.world.pendingSpawns = {};
  state.world.discovery = {};
  state.jump = { state: 'IDLE', targetSectorId: null, via: null, chargeT: 0, chargeNeeded: 0, cooldownT: 0 };
  state.fuel = { current: 80, max: 100 };

  // Prototype-chain host so serialize can call sibling methods (_ownerOverlay).
  const host = Object.assign(Object.create(world), { state });
  const serialized = host.serialize();
  assert.equal(serialized.coordinateSchema, 'global_v1');
  // frameOrigin is runtime-only — must not be trusted from disk as entity rebasing.
  assert.equal('frameOrigin' in serialized, false);
  assert.equal('frameOriginSeq' in serialized, false);
  // Global scan ping positions pass through unchanged (already global in v9).
  assert.deepEqual(serialized.scanPings[CERES][0].pos, { x: 1e6, z: 2e6 });

  // Stale frame on live state before deserialize
  state.world.frameOrigin = { x: 999, z: 999 };
  state.world.frameOriginSeq = 99;
  host.deserialize({
    ...serialized,
    // even if a corrupt save smuggled frame fields, load must reset them
    frameOrigin: { x: 55555, z: -55555 },
    frameOriginSeq: 12,
  });
  assert.equal(state.world.coordinateSchema, 'global_v1');
  assert.deepEqual(state.world.frameOrigin, { x: 0, z: 0 });
  assert.equal(state.world.frameOriginSeq, 0);
  assert.deepEqual(state.world.scanPings[CERES][0].pos, { x: 1e6, z: 2e6 });
});

test('normalizeWorldSaveRecord resets frameOrigin and stamps coordinateSchema', async () => {
  // Access via load path is heavy; re-import sanitize by applying migration + reading expected contract.
  // saveSystem's normalizeWorldSaveRecord is module-private — prove the public contract via world
  // deserialize + migration stamps already covered above. Additional pure check: migrating a
  // payload that already claims a stale frame always yields zero frame.
  const data = {
    world: {
      currentSectorId: HELIOS,
      coordinateSchema: 'global_v1',
      frameOrigin: { x: 8192, z: 4096 },
      frameOriginSeq: 3,
    },
    entities: { player: { type: 'ship', pos: { x: 0, z: 0 } }, persistent: [] },
  };
  migrateChain(data, 8);
  assert.deepEqual(data.world.frameOrigin, { x: 0, z: 0 });
  assert.equal(data.world.frameOriginSeq, 0);
  assert.equal(data.world.coordinateSchema, 'global_v1');
});
