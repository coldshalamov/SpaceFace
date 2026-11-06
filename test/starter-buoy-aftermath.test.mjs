import assert from 'node:assert/strict';
import test from 'node:test';

import { firstBuoyReceivingItem, firstBuoyReceivingReceipt } from '../src/missions/starterBuoyAftermath.js';
import { missionReceiptFor } from '../src/systems/missions.js';
import { stationSideEventDirector } from '../src/systems/stationSideEventDirector.js';
import { resolveStationSideEventVfxProfile } from '../src/render/stationSideEventVfx.js';

const STEP_REWARD = { 1: 520, 2: 760, 3: 960 };

function completedBuoy(step = 1, at_s = 100, id = `buoy-${step}`) {
  const mission = {
    id,
    source: 'starterJob',
    type: 'tow_recovery',
    destStationId: 'station_helios',
    destSectorId: 'sector_helios_prime',
    reward_cr: STEP_REWARD[step],
    params: {
      starterWorkdayVersion: 1,
      starterJobId: 'starter_pelican',
      starterStep: step,
      requiredModule: 'mod_winch_hd',
      completionMethod: 'tow_in',
    },
  };
  return missionReceiptFor(mission, 'completed', 'delivered', {
    at_s,
    rewardCr: STEP_REWARD[step],
  });
}

const station = {
  id: 42,
  type: 'station',
  alive: true,
  pos: { x: 1280, z: -420 },
  data: { stationId: 'station_helios', stationTypeId: 'trade_hub' },
};

function makeFixture(receipts = [completedBuoy()]) {
  const player = { id: 1, type: 'ship', alive: true, pos: { ...station.pos }, data: {} };
  const state = {
    mode: 'flight',
    tick: 6000,
    simTime: 110,
    playerId: player.id,
    player: { flags: {} },
    meta: { seed: 4242 },
    world: { currentSectorId: 'sector_helios_prime' },
    missions: { receipts },
    entities: new Map([[player.id, player], [station.id, station]]),
    entityList: [player, station],
    entityIndex: { stations: [station] },
    settings: {},
    camera: {},
  };
  const emitted = [];
  const listeners = new Map();
  const bus = {
    on(name, fn) { listeners.set(name, fn); return () => listeners.delete(name); },
    off(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); },
    emit(name, payload) {
      emitted.push({ name, payload });
      listeners.get(name)?.(payload);
    },
  };
  const director = Object.create(stationSideEventDirector);
  director.init({ state, bus, helpers: {
    spawnEntity() { assert.fail('receiving operation is presentation-only'); },
    spawnBudget: { request() { assert.fail('receiving operation must not reserve spawn budget'); } },
  } });
  return { state, director, emitted, player };
}

function receivingEvents(emitted) {
  return emitted.filter(({ name, payload }) => name === 'station:sideEvent' && payload.receivingMissionId);
}

test('only a paid successful physical Pelican buoy settlement grants receiving provenance', () => {
  const valid = completedBuoy(2, 200);
  assert.deepEqual(valid.starterBuoyRecovery, {
    version: 1,
    jobId: 'starter_pelican',
    step: 2,
    completionMethod: 'tow_in',
  });
  const wrongStep = missionReceiptFor({
    source: 'starterJob', type: 'tow_recovery', destStationId: 'station_helios',
    destSectorId: 'sector_helios_prime',
    params: { starterWorkdayVersion: 1, starterJobId: 'starter_pelican', starterStep: 4,
      requiredModule: 'mod_winch_hd', completionMethod: 'tow_in' },
  }, 'completed', 'delivered', { at_s: 200, rewardCr: 800 });
  const failed = missionReceiptFor({
    source: 'starterJob', type: 'tow_recovery', destStationId: 'station_helios',
    destSectorId: 'sector_helios_prime',
    params: { starterWorkdayVersion: 1, starterJobId: 'starter_pelican', starterStep: 1,
      requiredModule: 'mod_winch_hd', completionMethod: 'tow_in' },
  }, 'failed', 'lost', { at_s: 200, rewardCr: 0 });
  assert.equal(wrongStep.starterBuoyRecovery, undefined);
  assert.equal(failed.starterBuoyRecovery, undefined);
});

test('the exact recent receipt projects one visible repair operation without changing rewards or entities', () => {
  const receipt = completedBuoy();
  const { state, director, emitted, player } = makeFixture([receipt]);
  const entitiesBefore = [...state.entities.keys()];
  const creditsBefore = receipt.rewardCr;

  director.update(1, state);
  director.update(1, state);

  const events = receivingEvents(emitted);
  assert.equal(events.length, 1);
  const payload = events[0].payload;
  assert.equal(payload.eventId, `sse:44c-receiving:${receipt.missionId}`);
  assert.equal(payload.kind, 'repair_drone');
  assert.equal(payload.path, 'hull-crawl');
  assert.equal(payload.budget, 0);
  assert.deepEqual(payload.entityIds, []);
  assert.equal(payload.stationId, '42');
  assert.equal(payload.durationS, 90);
  assert.equal(payload.receivingMissionId, receipt.missionId);
  assert.equal(payload.contextLabel, '44-C receiving check — berth intake');
  assert.ok(resolveStationSideEventVfxProfile(payload.kind), 'existing VFX draws the operation');
  assert.deepEqual([...state.entities.keys()], entitiesBefore);
  assert.equal(player.pos.x, station.pos.x);
  assert.equal(receipt.rewardCr, creditsBefore);
  assert.deepEqual(state.stationSideEvents.buoyReceivingSeenMissionIds, [receipt.missionId]);
});

test('queued receiving work retries after sector exit, then does not replay after presentation', () => {
  const receipt = completedBuoy();
  const { state, director, emitted } = makeFixture([receipt]);
  director._planBuoyReceiving(state, station, state.simTime);
  assert.equal(state.stationSideEvents.pending.filter((item) => item.receivingMissionId).length, 1);
  director._onSectorExit();
  assert.equal(state.stationSideEvents.pending.length, 0);

  director.update(1, state);
  assert.equal(receivingEvents(emitted).length, 1);
  director._onSectorExit();
  state.simTime += 1;
  director.update(1, state);
  assert.equal(receivingEvents(emitted).length, 1);
});

test('newest valid settlement supersedes pending work and firing revalidates the original window', () => {
  const first = completedBuoy(1, 100, 'buoy-one');
  const second = completedBuoy(2, 120, 'buoy-two');
  const { state, director, emitted } = makeFixture([first]);
  director._planBuoyReceiving(state, station, 110);
  state.missions.receipts = [second, first];
  state.simTime = 130;
  director._planBuoyReceiving(state, station, 130);
  assert.deepEqual(state.stationSideEvents.pending
    .filter((item) => item.receivingMissionId).map((item) => item.receivingMissionId), ['buoy-two']);

  state.stationSideEvents.anchorId = String(station.id);
  director._pump(state, station, state.simTime);
  assert.deepEqual(receivingEvents(emitted).map((event) => event.payload.receivingMissionId), ['buoy-two']);
  state.simTime = 300;
  state.stationSideEvents.nextFireAt = 0;
  state.missions.receipts = [completedBuoy(3, 120, 'expired')];
  director._planBuoyReceiving(state, station, state.simTime);
  assert.equal(receivingEvents(emitted).length, 1);
});

test('Continue may show only the remaining original window; survival and other sectors are excluded', () => {
  const receipt = completedBuoy();
  const { state, director, emitted } = makeFixture([receipt]);
  director.update(1, state);
  director._onSaveLoaded();
  state.simTime = 200;
  director.update(1, state);
  const events = receivingEvents(emitted);
  assert.equal(events.length, 2);
  assert.equal(events[1].payload.durationS, 80);

  director._onSaveLoaded();
  state.simTime = 280;
  director.update(1, state);
  state.simTime = 150;
  state.run = { kind: 'survival' };
  assert.equal(firstBuoyReceivingReceipt(state, state.simTime), null);
  assert.equal(firstBuoyReceivingItem(state, station, state.simTime), null);
  state.run = null;
  state.world.currentSectorId = 'sector_ceres_belt';
  assert.equal(firstBuoyReceivingReceipt(state, state.simTime), null);
});
