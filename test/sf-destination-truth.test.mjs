// SF-DEST-TRUTH — a contract destination must be a place the contract can settle. The picker
// read `services`/`repGated` off records that never carried them: a 'scan' customs post could
// be a smuggling destination, a rep-gated berth could be a delivery for a pilot it refuses,
// and a 'refine' service on a non-refinery hull was invisible to bulk hauls. (Review F1: an
// explicit `minRep` binds the same dock contract — it is not only repGated berths that vet.)
//
// Contract (deterministic, seed 4242, real missions owner):
//   1. no rolled destination is a repGated station the pilot can't dock;
//   2. standing restores the gated berth — rep ≥1 makes the fence a destination again;
//   3. smuggling never routes to a 'scan' customs sweep;
//   4. the refine-service fallback reaches the fab yards, not just type-'refinery' hulls;
//   5. an explicit minRep berth binds at its own number, not the repGated proxy.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { SECTORS } from '../src/data/sectors.js';
import { missions as missionsProto } from '../src/systems/missions.js';

const ALL_STATIONS = SECTORS.flatMap((sec) => (sec.stations || [])
  .map((st) => ({ ...st, sectorId: sec.id })));
const byId = new Map(ALL_STATIONS.map((s) => [s.id, s]));

function boot(repByFaction = {}, seed = 4242) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 12;
  state.factions = { ...state.factions, ...repByFaction };
  const bus = createBus();
  const helpers = {
    hash32,
    mulberry32,
    spawnEntity: (spec) => ({ id: 1, alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: {}, ...spec }),
    voice: { say: () => true },
    player: () => null,
  };
  const missions = Object.assign({}, missionsProto);
  missions.init({ state, bus, helpers, registry: { get: () => null } });
  return { state, missions };
}

const origins = () => ALL_STATIONS.map((s) => ({ id: s.id, sectorId: s.sectorId, factionId: s.factionId }));

test('no rolled destination is a berth that refuses the pilot', () => {
  const { missions } = boot();
  const gated = ALL_STATIONS.filter((s) => s.repGated === true).map((s) => s.id);
  assert.ok(gated.length >= 2, 'the galaxy has rep-gated berths to prove against');
  for (const info of origins()) {
    for (let k = 0; k < 30; k++) {
      const dest = missions._pickDestination('cargo_delivery', info, mulberry32(k + 1));
      assert.ok(!gated.includes(dest.id), `${info.id} rolled ${dest.id} for a rep-0 pilot`);
    }
  }
});

test('positive standing restores the gated berth', () => {
  // Sedna's only neighbor is Eunomia Gulf — at rep ≥1 the fence is the deterministic pick.
  const { missions } = boot({ faction_understory: { rep: 5 } });
  const sedna = { id: 'station_sedna', sectorId: 'sector_sedna_dark', factionId: 'faction_helix' };
  for (let k = 0; k < 20; k++) {
    const dest = missions._pickDestination('cargo_delivery', sedna, mulberry32(k + 1));
    assert.equal(dest.id, 'station_eunomia', 'standing opens the one near destination');
  }
});

test('smuggling never routes to a customs scan', () => {
  const { missions } = boot();
  const scanned = ALL_STATIONS
    .filter((s) => (s.services || []).includes('scan')).map((s) => s.id);
  assert.ok(scanned.length >= 1, 'the galaxy has customs sweeps to prove against');
  for (const info of origins()) {
    for (let k = 0; k < 20; k++) {
      const dest = missions._pickDestination('smuggling_run', info, mulberry32(k + 1));
      assert.ok(!scanned.includes(dest.id),
        `${info.id} rolled ${dest.id} — a scan post reads the cargo it was meant to miss`);
    }
  }
});

test('a refine service on a fab hull is a bulk-haul destination', () => {
  const { missions } = boot();
  // Vesta's outlying yard is type 'fab' with a 'refine' service — invisible to the picker while
  // station records carried no services. Depot3 sits in the same sector, so it is a near pick.
  const depot = { id: 'station_depot3', sectorId: 'sector_vesta_forge', factionId: 'faction_choir' };
  const seen = new Set();
  for (let k = 0; k < 40; k++) {
    seen.add(missions._pickBulkHaulDestination(depot, mulberry32(k + 1)).id);
  }
  assert.ok(seen.has('station_vesta_outlying_yard'),
    `the yard refines — it must be a bulk destination (seen: ${[...seen].join(', ')})`);
});

test('an explicit minRep berth binds at its own number', () => {
  // Mercenary Outpost vets Quiet standing at rep >= -30 — below it the dock gate refuses and the
  // picker must too; between -30 and 0 the berth opens even though the faction reads hostile.
  const merc = byId.get('station_io_merc');
  assert.ok(merc && Number.isFinite(merc.minRep), 'the galaxy has an explicit-minRep berth');
  const reach = { id: 'station_reach', sectorId: 'sector_io_reach', factionId: 'faction_free' };
  const roll = (rep) => {
    const { missions } = boot({ faction_quiet: { rep } });
    const seen = new Set();
    for (let k = 0; k < 200; k++) {
      seen.add(missions._pickDestination('cargo_delivery', reach, mulberry32(k + 1)).id);
    }
    return seen;
  };
  assert.ok(!roll(-50).has('station_io_merc'), 'rep -50 is below its -30 contract');
  assert.ok(roll(-20).has('station_io_merc'),
    'rep -20 satisfies the -30 contract — a hostile-named faction still docks');
});

test('the Den stays closed until the entrance parcel lands', () => {
  // station_smuggler is a real berth on the chart — but the world stamps dockDeny 'private'
  // on it until the Tethys entrance run is delivered. A picker that names it for a pilot
  // who never ran the parcel writes a contract the world cannot settle.
  const pallas = byId.get('station_smuggler');
  assert.ok(pallas, 'the Den is a real charted berth');
  const drift = { id: 'station_drift', sectorId: 'sector_pallas_drift', factionId: 'faction_mts' };
  const closed = boot();
  for (let k = 0; k < 200; k++) {
    const dest = closed.missions._pickDestination('cargo_delivery', drift, mulberry32(k + 1));
    assert.notEqual(dest.id, 'station_smuggler', 'no entrance run → the Den is not a destination');
  }
  // With the run delivered the berth rejoins the pool like every other open dock.
  const open = boot();
  open.state.world.frontierRumors = {
    byId: {
      'frontier-rumor:station_tethys:tethys-black-market': {
        phase: 'contacted', contactId: 'quiet:tethys-black-market',
        entranceRun: { runId: 'tethys:pallas-entrance:1', phase: 'delivered' },
      },
    },
  };
  const seen = new Set();
  for (let k = 0; k < 400; k++) {
    seen.add(open.missions._pickDestination('cargo_delivery', drift, mulberry32(k + 1)).id);
  }
  assert.ok(seen.has('station_smuggler'),
    `delivered access restores the Den as a destination (seen: ${[...seen].join(', ')})`);
});

test('an authored offer to a refused berth is refused at the board, in words', () => {
  // The pickers keep rolled destinations clean, but authored offers name their own berths —
  // a career stage to the Nyx Fence, a filing at the Den. The accept boundary is the last
  // honest gate: refuse the contract instead of writing one the world cannot settle.
  const offer = (destStationId) => ({
    id: `t_${destStationId}`, type: 'escort', factionId: 'faction_scn', minRep: -149,
    stationId: 'station_helios', destStationId, params: {},
  });
  const rep0 = boot();
  const refused = rep0.missions._acceptPreflight(offer('station_nyx_march'));
  assert.equal(refused.ok, false, 'the Nyx fence denies a rep-0 pilot its berth');
  assert.match(refused.reason, /refuses this berth|standing/i, 'the refusal names the gate');

  const admitted = boot({ faction_quiet: { rep: 5 } });
  assert.equal(admitted.missions._acceptPreflight(offer('station_nyx_march')).ok, true,
    'Quiet standing opens the fence for the same row');

  const denRefused = rep0.missions._acceptPreflight(offer('station_smuggler'));
  assert.equal(denRefused.ok, false, 'the Den refuses freight before the entrance run');
  assert.match(denRefused.reason, /does not take this freight yet/);

  const openDest = rep0.missions._acceptPreflight(offer('station_ceres'));
  assert.equal(openDest.ok, true, 'an open berth accepts as before');

  // The gate is scoped to dock-settled types only — a physical op or a corridor-pull
  // rescue settles without that berth, so the same refused station stays acceptable.
  const physical = rep0.missions._acceptPreflight({ ...offer('station_smuggler'), type: 'tow_recovery' });
  assert.equal(physical.ok, true, 'a tow at the Den site completes on the tether, not the dock');
  const corridorPull = rep0.missions._acceptPreflight({ ...offer('station_smuggler'), type: 'rescue_under_fire' });
  assert.equal(corridorPull.ok, true, 'a corridor-pull rescue never needs the Den berth');
  const bulk = rep0.missions._acceptPreflight({ ...offer('station_smuggler'), type: 'bulk_trade' });
  assert.equal(bulk.ok, false, 'a bulk trade sells at the named buyer — the berth is the door');
});
