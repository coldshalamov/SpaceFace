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
