import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import {
  FRONTIER_RUMOR_DAY_SECONDS,
  FRONTIER_RUMOR_KINDS,
  frontierRumorOffer,
  frontierRumorOwned,
  normalizeFrontierRumorState,
} from '../src/data/frontierRumors.js';
import { SECTORS } from '../src/data/sectors.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { world } from '../src/systems/world.js';
import { frontierRumorMapReadouts } from '../src/ui/frontierRumorMapLayer.js';

const STATION_IDS = SECTORS.flatMap((sector) => (sector.stations || []).map((station) => station.id));
const SECTOR_BY_ID = new Map(SECTORS.map((sector) => [sector.id, sector]));

function bareState(seed = 47) {
  const state = createGameState(seed);
  state.player.credits = 20_000;
  state.world.sectors = Object.fromEntries(SECTORS.map((sector) => [sector.id, { ...sector, owner: sector.factionId }]));
  state.world.discovery = {};
  state.world.residentSectors = {};
  state.world.sectorContents = {};
  return state;
}

function offersAcrossDays(state, limit = 80) {
  const rows = [];
  for (let day = 0; day < limit; day++) {
    state.simTime = day * FRONTIER_RUMOR_DAY_SECONDS;
    for (const stationId of STATION_IDS) {
      const offer = frontierRumorOffer(state, stationId);
      if (offer) rows.push(offer);
    }
  }
  return rows;
}

test('bar rumor rotation covers four real regional target kinds without exposing a waypoint', () => {
  const state = bareState(4707);
  const rows = offersAcrossDays(state, 20);
  assert.ok(rows.length > 20, 'authored stations should produce a useful daily card pool');
  assert.deepEqual(
    new Set(rows.map((row) => row.kind)),
    new Set(FRONTIER_RUMOR_KINDS.map((row) => row.id)),
    'daily rotation must surface hunter, vein, anomaly, and cache cards',
  );

  for (const offer of rows) {
    const sector = SECTOR_BY_ID.get(offer.sectorId);
    assert.ok(sector, `${offer.id} names a real sector`);
    assert.ok(Number.isFinite(offer.bearingCenter.x) && Number.isFinite(offer.bearingCenter.z));
    assert.ok(offer.radius >= 360);
    assert.ok(offer.price > 0);
    assert.equal(Object.hasOwn(offer, 'targetPos'), false, 'a sold card must not disclose the target point');
    if (offer.kind === 'vein') {
      assert.ok((sector.fields || []).some((field) => field.id === offer.targetId), 'vein card binds a real field');
    } else if (offer.targetPlaceKind === 'zone') {
      assert.ok(zonesForSector(offer.sectorId).some((zone) => zone.id === offer.targetId),
        `${offer.kind} card binds a real authored zone`);
    } else if (offer.kind === 'anomaly' || offer.kind === 'cache') {
      assert.ok((sector.pois || []).some((poi) => poi.id === offer.targetId && poi.type === offer.kind),
        `${offer.kind} card binds a real authored POI`);
    } else {
      assert.ok(Number(sector.security) < 0.7, 'hunter location binds a genuinely risky region');
    }
  }

  const repeatState = bareState(4707);
  repeatState.simTime = state.simTime;
  assert.deepEqual(
    frontierRumorOffer(repeatState, STATION_IDS[0]),
    frontierRumorOffer(state, STATION_IDS[0]),
    'same seed, station, and sector-day must produce the same card',
  );
});

test('world purchase charges once, saves the search circle, and physical discovery clears it', () => {
  const state = bareState(9191);
  const offer = offersAcrossDays(state, 40).find((row) => row.kind === 'anomaly');
  assert.ok(offer, 'fixture needs a real anomaly card');
  state.simTime = offer.dayIndex * FRONTIER_RUMOR_DAY_SECONDS;
  const events = [];
  const bus = {
    emit(name, payload) {
      events.push({ name, payload });
      if (name === 'economy:chargeCredits') state.player.credits -= payload.amount;
    },
  };
  const priorState = world.state;
  const priorBus = world.bus;
  try {
    world.state = state;
    world.bus = bus;
    const beforeCredits = state.player.credits;
    assert.equal(world._onPurchaseFrontierRumor({ rumorId: offer.id, stationId: offer.sourceStationId }), true);
    assert.equal(frontierRumorOwned(state, offer.id), true);
    assert.equal(state.player.credits, beforeCredits - offer.price);
    assert.equal(events.filter((row) => row.name === 'economy:chargeCredits').length, 1);

    const readout = frontierRumorMapReadouts(state, offer.sectorId);
    assert.equal(readout.length, 1);
    assert.equal(readout[0].courseTarget, null, 'rumor search is never an autopilot course');
    assert.equal(readout[0].fixedPos, null, 'rumor search remains approximate');

    const saved = world.serialize();
    const normalized = normalizeFrontierRumorState(saved.frontierRumors);
    assert.equal(normalized.byId[offer.id].phase, 'rumored', 'search card survives Continue');

    assert.equal(world._onFrontierRumorPoi({ poiId: offer.targetId, sectorId: offer.sectorId }), 1);
    assert.equal(state.world.frontierRumors.byId[offer.id].phase, 'resolved');
    assert.equal(frontierRumorMapReadouts(state, offer.sectorId).length, 0,
      'physically confirming the source removes stale map clutter');
  } finally {
    world.state = priorState;
    world.bus = priorBus;
  }
});

test('bars do not sell coordinates the player has already discovered', () => {
  const state = bareState(31337);
  const offer = offersAcrossDays(state, 40).find((row) => row.kind === 'cache' || row.kind === 'anomaly');
  assert.ok(offer, 'fixture needs a POI rumor');
  state.simTime = offer.dayIndex * FRONTIER_RUMOR_DAY_SECONDS;
  state.world.discovery[offer.sectorId] = {
    discovered: true,
    pois: { [offer.targetId]: { discovered: true, identified: true } },
    fieldsDepleted: {},
  };
  const replacement = frontierRumorOffer(state, offer.sourceStationId);
  assert.ok(!replacement || replacement.targetId !== offer.targetId,
    'an already-known POI must be removed from that day\'s sellable pool');
});

test('hunter and vein cards resolve only through their existing live gameplay seams', () => {
  for (const kind of ['hunter', 'vein']) {
    const state = bareState(kind === 'hunter' ? 7001 : 7002);
    const offer = offersAcrossDays(state, 40).find((row) => row.kind === kind);
    assert.ok(offer, `fixture needs a ${kind} card`);
    state.simTime = offer.dayIndex * FRONTIER_RUMOR_DAY_SECONDS;
    const priorState = world.state;
    const priorBus = world.bus;
    try {
      world.state = state;
      world.bus = { emit() {} };
      assert.equal(world._onPurchaseFrontierRumor({ rumorId: offer.id, stationId: offer.sourceStationId }), true);
      if (kind === 'hunter') {
        assert.equal(world._onFrontierRumorEncounter({ kind: 'patrol_scan', sectorId: offer.sectorId }), 0,
          'ordinary traffic cannot satisfy a hunter card');
        assert.equal(world._onFrontierRumorEncounter({ kind: 'bounty_hunter', sectorId: offer.sectorId }), 1);
      } else {
        state.world.currentSectorId = offer.sectorId;
        world._onFieldDepleted({ fieldId: offer.targetId, depleted: 0.01 });
      }
      assert.equal(state.world.frontierRumors.byId[offer.id].phase, 'resolved');
    } finally {
      world.state = priorState;
      world.bus = priorBus;
    }
  }
});
