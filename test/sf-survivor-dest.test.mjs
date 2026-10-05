// SF-SURVIVOR-DEST — the pod's handoff berth must be a place the rescue can settle.
// rescueStationForSector picked its ladder sight unseen: a gated local desk (Sker
// Bazaar, the Ashfall cache) became the passenger_transport destination, so the offer
// boards a rescue the accept gate correctly refuses — the survivor dies at the board.
// Contract (deterministic, real survivorPod owner):
//   1. a gated-sector promotion names an admitting handoff berth;
//   2. the same promotion at earned standing keeps the authored local desk;
//   3. the concord-house preference still holds when both desks admit.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { SECTORS } from '../src/data/sectors.js';
import { stationBerthAdmits } from '../src/data/frontierRumors.js';
import { survivorPod } from '../src/systems/survivorPod.js';

const STATION_BY_ID = new Map();
for (const sec of SECTORS) for (const st of sec.stations || []) STATION_BY_ID.set(st.id, st);

function boot({ sectorId = 'sector_sker_haven', factions = {} } = {}) {
  const state = {
    mode: 'flight',
    simTime: 30,
    playerId: 1,
    meta: { seed: 4242 },
    entities: new Map(),
    world: { currentSectorId: sectorId },
    factions,
    salvage: { points: [] },
  };
  const entity = { id: 900, type: 'ship', alive: true, pos: { x: 10, z: 10 }, data: {} };
  state.entities.set(900, entity);
  state.salvage.points.push({ id: 'sal_pod_pin', sectorId, entityId: 900 });
  const bus = createBus();
  const sys = Object.create(survivorPod);
  sys.init({ state, bus, helpers: { voice: { say: () => true } }, registry: null });
  return { state, sys };
}

test('a gated-sector promotion names an admitting handoff berth', () => {
  const { state, sys } = boot();
  const rec = sys._promoteSector('sector_sker_haven');
  assert.ok(rec, 'the pod still promotes');
  assert.notEqual(rec.destStationId, 'station_sker',
    'the rescue must not hand off at the repGated Bazaar for a rep-0 pilot');
  const dest = STATION_BY_ID.get(rec.destStationId);
  assert.ok(dest, 'the handoff names a real station');
  const rep = state.factions[dest.factionId] ? state.factions[dest.factionId].rep : 0;
  assert.ok(stationBerthAdmits(dest, rep, state),
    `the handoff berth admits the pilot (got ${rec.destStationId})`);
});

test('earned standing keeps the authored local desk', () => {
  const { sys } = boot({ factions: { faction_reach: { rep: 5 } } });
  const rec = sys._promoteSector('sector_sker_haven');
  assert.equal(rec.destStationId, 'station_sker',
    'the vouched Bazaar is the rescue desk the promotion intended');
});

test('an open concord house still outranks a desk berth', () => {
  // Tethys Junction: station_tethys carries the contract desk but station_customs is the
  // concord house — rung 1 must beat rung 2 when both berths admit.
  const { sys } = boot({ sectorId: 'sector_tethys_junction' });
  const rec = sys._promoteSector('sector_tethys_junction');
  assert.equal(rec.destStationId, 'station_customs',
    'the concord house outranks the desk when both admit');
  assert.equal(rec.destSectorId, 'sector_tethys_junction');
});
