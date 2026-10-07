// SF-SEDNA-DESK — a station that declares no contracts desk, in a sector with no pump, rolls
// no procedural board work. The advertised-desk fiction ("no fuel, no rescue, few questions")
// becomes true at runtime: Sedna's board carries only earned and authored rows — a filed
// reading is not desk work — while fueled sectors and advertised desks keep rolling.
//
// Contract (deterministic, seed 4242, through the real missions owner):
//   1. station_sedna's board contains zero source-less (procedural/recovery) offers;
//   2. station_helios (missions desk), station_eunomia (black-market desk) and
//      station_vesta_outlying_yard (deskless but fueled sector) still roll procedural rows;
//   3. the Ringworld landmark filing still posts at Sedna — earned work is not a desk;
//   4. an epoch refresh rebuilds the deskless board the same way — a procedural row cannot
//      survive a refresh by hiding in retained slots.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { LANDMARK_QUEST_SOURCE } from '../src/data/landmarkMissions.js';
import { missions as missionsProto } from '../src/systems/missions.js';

function boot(seed = 4242) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 12;
  state.tick = 720;
  const bus = createBus();
  const helpers = {
    hash32,
    mulberry32,
    spawnEntity: (spec) => {
      const entity = { id: 9000, alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: {}, ...spec };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
    voice: { say: () => true },
    player: () => state.entities.get(state.playerId),
  };
  const missions = Object.assign({}, missionsProto);
  missions.init({ state, bus, helpers, registry: { get: () => null } });
  return { state, bus, missions };
}

const procedural = (board) => (board && Array.isArray(board.slots) ? board.slots : [])
  .filter((offer) => offer && offer.source == null);

test('a deskless outpost in a fuel-less sector rolls no procedural work', () => {
  const { missions } = boot();
  const sedna = missions.ensureBoard('station_sedna');
  assert.ok(sedna, 'the post still keeps a board for earned filings');
  assert.deepEqual(procedural(sedna), [],
    'no rolled contract or recovery row may post where no desk is advertised and no pump exists');
});

test('desks and fueled sectors keep their procedural boards', () => {
  const { missions } = boot();
  for (const [stationId, why] of [
    ['station_helios', 'a missions desk advertises work'],
    ['station_eunomia', 'a black-market desk advertises work — the fence deals salvage'],
    ['station_vesta_outlying_yard', 'deskless but the sector pumps next door — you can leave'],
  ]) {
    const board = missions.ensureBoard(stationId);
    assert.ok(procedural(board).length > 0, `${stationId}: ${why}`);
  }
});

test('a filed landmark reading still posts at the deskless post', () => {
  const { state, missions } = boot();
  state.world.discovery.sector_sedna_dark = {
    charted: false,
    pois: { poi_sedna_ringworld: { discovered: true, identified: true, identifiedAt: 0 } },
    fieldsDepleted: {},
  };
  const boarded = missions._reconcileLandmarkQuestOffers({ stationId: 'station_sedna' });
  assert.equal(boarded, 1, 'the earned filing reaches the board');
  const board = missions.ensureBoard('station_sedna');
  const filing = board.slots.find((offer) => offer && offer.source === LANDMARK_QUEST_SOURCE);
  assert.ok(filing, 'the Ringworld reading files at the post that asked for it');
  assert.equal(procedural(board).length, 0,
    'and the filing does not wake a procedural desk around it');
});

test('an epoch refresh rebuilds the deskless board the same way', () => {
  const { state, missions } = boot();
  const board = missions.ensureBoard('station_sedna');
  // Even a procedural row left behind by a stale save cannot survive the rebuild.
  board.slots.push({ id: 'mo_stale', type: 'cargo_delivery', stationId: 'station_sedna' });
  state.simTime += (state.missions.config && state.missions.config.refreshSec) || 600;
  const rebuilt = missions.ensureBoard('station_sedna');
  assert.equal(rebuilt.refreshEpoch !== board.refreshEpoch, true, 'the epoch advanced');
  assert.deepEqual(procedural(rebuilt), [],
    'a stranded procedural row is not retained through refresh');
});
