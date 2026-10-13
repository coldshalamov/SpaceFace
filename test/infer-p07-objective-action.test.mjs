// I025 — a follow-up scan objective must name the action and the place the
// completion check actually listens for, in plain words.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { SECTORS } from '../src/data/sectors.js';
import { buildPoiCausalOffer } from '../src/missions/poiCausalOffers.js';
import { missions as missionsProto } from '../src/systems/missions.js';

const SEED = 4242;
const SOURCE_SECTOR_ID = 'sector_helios_prime';
const SOURCE_STATION_ID = 'station_helios';

function boot() {
  const state = createGameState(SEED);
  state.mode = 'flight';
  state.simTime = 20;
  state.playerId = 1;
  state.player.credits = 5000;
  state.player.stats = state.player.stats || {};
  state.world.currentSectorId = SOURCE_SECTOR_ID;
  state.missions = {
    boards: {}, active: [], completedLog: [], receipts: [], nextId: 1, config: null,
  };
  state.story = { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 };
  state.ui = state.ui || {};
  state.nav = state.nav || {};
  const said = [];
  const bus = createBus();
  const missions = Object.assign({}, missionsProto);
  missions.init({
    state,
    bus,
    helpers: {
      hash32,
      mulberry32,
      voice: {
        say(payload) {
          said.push(payload && payload.text);
          return true;
        },
      },
    },
    registry: { get() { return null; } },
  });
  return { state, bus, missions, said };
}

function rawId(text) {
  return /[a-z]+_[a-z0-9_]+/.test(text) || /poicr:/.test(text) || /signal:entity/.test(text);
}

test('the tracked follow-up names the scan and the linked place', () => {
  const { state, bus, missions, said } = boot();
  const offer = buildPoiCausalOffer({
    seed: SEED,
    aftermath: {
      behaviorId: 'poib:sector_helios_prime:derelict_salvage:zone-0',
      familyId: 'derelict_salvage',
      sectorId: SOURCE_SECTOR_ID,
      zoneId: 'zone-0',
      fingerprint: 'pb_causal_4242',
      resolvedDay: 1,
      cause: 'A registry fragment survived the wreck.',
    },
    stationId: SOURCE_STATION_ID,
    factionId: 'faction_scn',
    zoneName: 'Ledger Wreck',
  });
  assert.ok(offer);
  state.missions.boards[SOURCE_STATION_ID] = { slots: [offer] };
  assert.equal(missions.acceptMission(offer.id), true);
  const mission = state.missions.active.find((row) => row && row.sourceOfferId === offer.id);
  assert.ok(mission);
  const follow = mission.params.poiSignalFollowup;
  const sector = SECTORS.find((row) => row.id === mission.destSectorId);
  assert.equal(follow.targetType, 'wreck');
  assert.ok(sector && sector.name);

  assert.equal(missions.trackMission(mission.id), true);
  const reason = state.nav.waypoint && state.nav.waypoint.reason;
  const spoken = said.find((line) => typeof line === 'string' && line.startsWith('Tracking:'));
  assert.equal(reason, `Scan the linked derelict in ${sector.name}`);
  assert.equal(rawId(reason), false);
  assert.equal(reason.includes(follow.targetRecordId), false);
  assert.ok(spoken && spoken.includes(reason));
  assert.equal(rawId(spoken), false);

  missions.trackMission(mission.id);
  assert.equal(state.nav.waypoint.reason, reason);

  state.world.currentSectorId = mission.destSectorId;
  bus.emit('scan:completed', { targetId: null, sectorId: mission.destSectorId });
  assert.equal(mission.status, 'active');
});
