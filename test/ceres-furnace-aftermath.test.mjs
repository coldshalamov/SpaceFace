import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createFurnaceIntake } from '../src/systems/furnaceIntake.js';
import { missions } from '../src/systems/missions.js';
import { stationSideEventDirector, ensureState } from '../src/systems/stationSideEventDirector.js';
import { buildMissionBoardContract } from '../src/story/campaign47a/embodiedMissions.js';
import { createCampaign47aState } from '../src/story/campaign47a/campaignSchema.js';
import {
  CERES_FURNACE_INSPECTION_WINDOW_S,
  ceresFurnaceInspectionItem,
  ceresFurnaceInspectionReceipt,
} from '../src/missions/ceresFurnaceAftermath.js';
import {
  FURNACE_MITE_KEYS,
  furnaceLotSpec,
  furnaceLots,
  furnaceMouthGlobal,
} from '../src/missions/furnaceWorksite.js';
import { syncFurnaceWorksite } from '../src/missions/furnaceWorksiteRuntime.js';
import { createInfrastructureMotionTracker } from '../src/render/infrastructureMotion.js';
import {
  createStationSideEventVfxFrameScratch,
  resolveStationSideEventVfxProfile,
  writeStationSideEventVfxFrame,
} from '../src/render/stationSideEventVfx.js';

const POD_COUNT = 3;
const RECEIPT_AT = 100;
const STATION = Object.freeze({
  id: 420,
  type: 'station',
  alive: true,
  pos: { x: -1100, z: 620 },
  radius: 10,
  data: { stationId: 'station_ceres', stationTypeId: 'refinery', sectorId: 'sector_ceres_belt' },
});

function authorFurnaceOffer(state) {
  const offer = buildMissionBoardContract(1, {
    seed: 23,
    epoch: 0,
    state: { story: state.story },
  });
  assert.ok(offer);
  assert.equal(offer.storyTag, 'campaign47a:b1:infested');
  assert.equal(offer.params.furnaceWorksiteVersion, 1);
  return offer;
}

function liveWorksite() {
  const state = createGameState(23);
  state.story = {
    beatIndex: 1,
    branch: null,
    flags: {},
    campaign47a: createCampaign47aState(),
  };
  state.story.campaign47a.stepProgress['1'] = {
    completed: ['alloy_run', 'scale_4'],
    updatedAtS: 0,
  };
  state.missions = { active: [], nextId: 1, boards: {}, completedLog: [], receipts: [] };
  state.world.currentSectorId = 'sector_ceres_belt';
  state.world.alienEcology = { sites: { closed_refinery: { deadFauna: {} } } };
  state.run = { kind: 'adventure' };
  state.mode = 'flight';
  state.simTime = RECEIPT_AT;

  const bus = createBus();
  const owner = Object.create(missions);
  owner.state = state;
  const helpers = {
    spawnEntity(spec) {
      const entity = { ...spec, id: `spawn-${state.nextEntityId++}`, alive: true };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
    removeEntity(id) {
      state.entities.delete(id);
      const index = state.entityList.findIndex((entity) => entity.id === id);
      if (index >= 0) state.entityList.splice(index, 1);
    },
  };
  owner.init({ state, bus, helpers, registry: { get: () => null } });
  const mission = owner._instanceFromOffer(authorFurnaceOffer(state));
  state.missions.active.push(mission);
  for (const lot of furnaceLots(mission)) {
    const entity = { ...furnaceLotSpec(mission, lot), id: `ore-pod-${lot.slot}`, alive: true };
    lot.entityId = entity.id;
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
  }

  const intake = createFurnaceIntake();
  intake.init({ state, bus, helpers });
  return { state, bus, owner, mission, intake };
}

function feedPod(fixture, slot) {
  const lot = fixture.mission.params.furnaceLots[slot];
  const pod = fixture.state.entities.get(lot.entityId);
  assert.ok(pod);
  pod.pos = furnaceMouthGlobal();
  fixture.intake.update();
}

function losePod(fixture, slot) {
  const lot = fixture.mission.params.furnaceLots[slot];
  const pod = fixture.state.entities.get(lot.entityId);
  assert.ok(pod);
  pod.alive = false;
  fixture.bus.emit('entity:killed', { id: pod.id, entity: pod, killerId: 'npc' });
}

function clearMiteSites(fixture) {
  const deadFauna = fixture.state.world.alienEcology.sites.closed_refinery.deadFauna;
  for (const key of FURNACE_MITE_KEYS) deadFauna[key] = true;
  syncFurnaceWorksite(fixture.owner, fixture.mission);
}

function settledWorksite(received) {
  const fixture = liveWorksite();
  for (let slot = 0; slot < POD_COUNT; slot++) {
    if (slot < received) feedPod(fixture, slot);
    else losePod(fixture, slot);
  }
  clearMiteSites(fixture);
  assert.equal(fixture.mission.status, 'completed');
  assert.equal(fixture.state.missions.active.includes(fixture.mission), false);
  assert.equal(fixture.state.missions.furnaceWorksiteAftermath.version, 1,
    'the real settlement cleanup retired the authored physical worksite');
  assert.equal(fixture.state.missions.furnaceWorksiteAftermath.missionId, fixture.mission.id);
  return fixture;
}

function stationReady(fixture) {
  const { state } = fixture;
  const player = { id: 1, type: 'ship', alive: true, pos: { ...STATION.pos }, radius: 12 };
  const station = { ...STATION, pos: { ...STATION.pos }, data: { ...STATION.data } };
  state.playerId = player.id;
  state.entities.set(player.id, player);
  state.entities.set(station.id, station);
  if (!state.entityList.includes(player)) state.entityList.push(player);
  if (!state.entityList.includes(station)) state.entityList.push(station);
  state.entityIndex = { stations: [station] };
  state.ui = { ...(state.ui || {}), docked: false, dockedStationId: null };
  state.player = state.player || {};
  state.player.flags = state.player.flags || {};
  state.player.flags.docked = false;
  state.onboarding = { active: false, finished: true };
  return station;
}

function directorFor(fixture, { consume = true } = {}) {
  const events = [];
  const director = Object.create(stationSideEventDirector);
  director.init({
    state: fixture.state,
    bus: fixture.bus,
    helpers: {
      spawnEntity: () => assert.fail('the inspection is presentation-only'),
      spawnBudget: { request: () => assert.fail('the inspection is budget-free') },
    },
  });
  fixture.bus.on('station:sideEvent', (payload) => events.push(payload));
  if (consume) {
    const motion = createInfrastructureMotionTracker();
    motion.bindEvents(fixture.bus);
    return { director, events, motion };
  }
  return { director, events, motion: null };
}

function copyProjectionState(state) {
  return {
    run: state.run && { ...state.run },
    world: state.world && { ...state.world },
    missions: {
      receipts: state.missions.receipts.map((receipt) => ({ ...receipt })),
      furnaceWorksiteAftermath: {
        ...state.missions.furnaceWorksiteAftermath,
        lots: state.missions.furnaceWorksiteAftermath.lots.map((lot) => ({ ...lot })),
      },
    },
  };
}

for (const result of [
  { received: 3, lost: 0, rewardCr: 480 },
  { received: 2, lost: 1, rewardCr: 320 },
  { received: 0, lost: 3, rewardCr: 0 },
]) {
  test(`actual Ceres settlement ${result.received}/3 received ${result.lost} lost feeds one existing inspection scene`, () => {
    const fixture = settledWorksite(result.received);
    const { state, mission, bus } = fixture;
    const canonical = state.missions.receipts.find((receipt) => receipt.missionId === mission.id);
    assert.ok(canonical, 'missions retained its canonical settlement receipt');
    assert.equal(canonical.id, `${mission.id}:completed`);
    assert.equal(canonical.outcome, 'completed');
    assert.equal(canonical.type, 'patrol_clear');
    assert.equal(canonical.destStationId, 'station_ceres');
    assert.equal(canonical.destSectorId, 'sector_ceres_belt');
    assert.equal(canonical.rewardCr, result.rewardCr, 'zero-pay all-lost completion is still valid');

    const projectionBefore = JSON.stringify(copyProjectionState(state));
    const receipt = ceresFurnaceInspectionReceipt(state, RECEIPT_AT + 10);
    assert.deepEqual(receipt, {
      missionId: mission.id,
      at_s: RECEIPT_AT,
      rewardCr: result.rewardCr,
      received: result.received,
      lost: result.lost,
    });
    assert.equal(JSON.stringify(copyProjectionState(state)), projectionBefore,
      'the reader does not mutate the retired ledger or canonical receipt');

    const station = stationReady(fixture);
    const mesh = { children: [], userData: {} };
    const gantry = {
      name: 'refinery-gantry',
      rotation: { y: 0, z: 0 },
      position: {
        x: 0, y: 0, z: 0,
        set(x, y, z) { this.x = x; this.y = y; this.z = z; },
      },
    };
    mesh.children.push(gantry);
    const { director, events, motion } = directorFor(fixture);
    motion.updateStationMotion(station, mesh, RECEIPT_AT + 10, 1 / 60);
    state.simTime = RECEIPT_AT + 10;
    director.update(1, state);
    assert.equal(events.length, 1);
    const event = events[0];
    assert.equal(event.eventId, `sse:ceres-furnace-inspection:${mission.id}`);
    assert.equal(event.ceresFurnaceMissionId, mission.id);
    assert.equal(event.stationId, String(station.id));
    assert.equal(event.kind, 'repair_drone');
    assert.equal(event.path, 'hull-crawl');
    assert.equal(event.budget, 0);
    assert.deepEqual(event.entityIds, []);
    assert.equal(event.durationS, 90);
    assert.equal(Object.hasOwn(event, 'contextLabel'), false,
      'the existing settlement toast carries counts; no invisible context text is claimed');
    assert.deepEqual(events.map((row) => row.eventId), [event.eventId]);

    const profile = resolveStationSideEventVfxProfile(event.kind);
    assert.equal(profile.silhouette, 'crawler-and-stitch');
    assert.equal(profile.arm.id, 'gantry-slide');
    const frame = writeStationSideEventVfxFrame(
      profile, 0, event.durationS, event.from?.x ?? -100, event.from?.z ?? 0,
      event.to?.x ?? 100, event.to?.z ?? 0, station.pos.x, station.pos.z,
      event.bearing, false, createStationSideEventVfxFrameScratch(),
    );
    assert.ok(Number.isFinite(frame.progress));
    const armRecord = motion.stationArmRecord(station.id);
    assert.equal(armRecord.eventId, event.eventId, 'the existing renderer consumer received the scene');
    assert.equal(armRecord.articulationId, 'gantry-slide');
    motion.updateStationMotion(station, mesh, RECEIPT_AT + 30, 1 / 60);
    assert.ok(gantry.position.x > 0, 'the existing station gantry follows the inspection envelope');
    motion.updateStationMotion(station, mesh, RECEIPT_AT + 101, 1 / 60);
    assert.equal(gantry.position.x, 0, 'the temporary presentation settles back to its authored pose');
    assert.equal(motion.stationArmRecord(station.id).settledS, RECEIPT_AT + 101);
    motion.unbindEvents();

    director.update(1, state);
    director._onSectorExit();
    director.update(1, state);
    assert.equal(events.length, 1, 'a shown inspection stays deduped in this session');
    director.destroy();
    bus.emit('save:loaded');
  });
}

test('invalid, duplicate, stale, future and wrong-sector receipts cannot qualify the inspection', () => {
  const fixture = settledWorksite(2);
  const original = copyProjectionState(fixture.state);
  const now = RECEIPT_AT + 10;
  assert.equal(ceresFurnaceInspectionReceipt(original, now).received, 2);
  for (const mutate of [
    (s) => { s.missions.receipts[0].id = 'wrong:completed'; },
    (s) => { s.missions.receipts[0].outcome = 'failed'; },
    (s) => { s.missions.receipts[0].type = 'cargo_delivery'; },
    (s) => { s.missions.receipts[0].factionId = 'faction_helix'; },
    (s) => { s.missions.receipts[0].destStationId = 'station_helios'; },
    (s) => { s.missions.receipts[0].destSectorId = 'sector_helios_prime'; },
    (s) => { s.missions.receipts[0].rewardCr = -1; },
    (s) => { s.missions.receipts[0].at_s = NaN; },
    (s) => { s.missions.receipts[0].missionId = 'other-mission'; },
    (s) => { s.missions.receipts.push({ ...s.missions.receipts[0] }); },
    (s) => { s.missions.receipts = Array.from({ length: 10 }, (_, i) => ({ id: `other-${i}`, missionId: `other-${i}` })).concat(s.missions.receipts); },
    (s) => { s.world.currentSectorId = 'sector_tethys_junction'; },
    (s) => { s.run.kind = 'survival'; },
  ]) {
    const state = structuredClone(original);
    mutate(state);
    assert.equal(ceresFurnaceInspectionReceipt(state, now), null);
  }
  assert.equal(ceresFurnaceInspectionReceipt(original, RECEIPT_AT - 1), null, 'future receipt is rejected');
  assert.equal(ceresFurnaceInspectionReceipt(original, RECEIPT_AT + CERES_FURNACE_INSPECTION_WINDOW_S), null,
    'the original simulation-time window is finite and exclusive');
});

test('invalid, missing, incomplete or mismatched single worksite ledgers cannot qualify', () => {
  const fixture = settledWorksite(2);
  const original = copyProjectionState(fixture.state);
  const now = RECEIPT_AT + 10;
  for (const mutate of [
    (s) => { s.missions.furnaceWorksiteAftermath.invalid = true; },
    (s) => { s.missions.furnaceWorksiteAftermath.invalid = null; },
    (s) => { s.missions.furnaceWorksiteAftermath.version = 2; },
    (s) => { s.missions.furnaceWorksiteAftermath.missionId = 'another-job'; },
    (s) => { s.missions.furnaceWorksiteAftermath.lots[0].received = true; s.missions.furnaceWorksiteAftermath.lots[0].lost = true; },
    (s) => { s.missions.furnaceWorksiteAftermath.lots[0].received = false; s.missions.furnaceWorksiteAftermath.lots[0].lost = false; },
    (s) => { s.missions.furnaceWorksiteAftermath.lots[0].received = 'yes'; },
    (s) => { s.missions.furnaceWorksiteAftermath.lots[0].received = null; },
    (s) => { s.missions.furnaceWorksiteAftermath.lots[1].slot = 0; },
    (s) => { s.missions.furnaceWorksiteAftermath.lots.pop(); },
    (s) => { s.missions.furnaceWorksiteAftermath.lots[2].slot = 4; },
    (s) => { delete s.missions.furnaceWorksiteAftermath; },
  ]) {
    const state = structuredClone(original);
    mutate(state);
    assert.equal(ceresFurnaceInspectionReceipt(state, now), null);
  }
});

test('the station item requires the Ceres sector, live Ceres anchor and finite position', () => {
  const fixture = settledWorksite(3);
  const station = stationReady(fixture);
  assert.ok(ceresFurnaceInspectionItem(fixture.state, station, RECEIPT_AT + 10));
  for (const invalid of [
    { ...station, data: { ...station.data, stationId: 'station_helios' } },
    { ...station, alive: false },
    { ...station, pos: { x: NaN, z: 0 } },
    { ...station, data: { ...station.data, sectorId: 'sector_tethys_junction' } },
  ]) assert.equal(ceresFurnaceInspectionItem(fixture.state, invalid, RECEIPT_AT + 10), null);
  const noEntityId = { ...station, id: null };
  assert.equal(ceresFurnaceInspectionItem(fixture.state, noEntityId, RECEIPT_AT + 10), null);
});

test('ordinary gates defer presentation; sector exit retries unseen work; Continue reprojects only remaining time', () => {
  for (const blocked of ['mode', 'dock', 'tutorial', 'invisible']) {
    const fixture = settledWorksite(1);
    const station = stationReady(fixture);
    const { state } = fixture;
    const { director, events } = directorFor(fixture, { consume: false });
    if (blocked === 'mode') state.mode = 'station';
    if (blocked === 'dock') state.player.flags.docked = true;
    if (blocked === 'tutorial') state.onboarding = { active: true, finished: false };
    if (blocked === 'invisible') state.entityIndex.stations = [];
    state.simTime = RECEIPT_AT + 10;
    director.update(1, state);
    assert.equal(events.length, 0, blocked);

    state.mode = 'flight';
    state.player.flags.docked = false;
    state.ui.docked = false;
    state.onboarding = { active: false, finished: true };
    state.entityIndex.stations = [station];
    director._onSectorExit();
    director.update(1, state);
    assert.equal(events.length, 1, `${blocked}: an unseen receipt is retried after ordinary flight resumes`);
    director.destroy();
  }

  const fixture = settledWorksite(1);
  stationReady(fixture);
  const { director, events } = directorFor(fixture, { consume: false });
  fixture.state.simTime = RECEIPT_AT + 10;
  director.update(1, fixture.state);
  assert.equal(events.length, 1);
  director._onSectorExit();
  director.update(1, fixture.state);
  assert.equal(events.length, 1, 'a fired scene is not duplicated by sector exit');
  director._onSaveLoaded();
  fixture.state.simTime = RECEIPT_AT + 100;
  director.update(1, fixture.state);
  assert.equal(events.length, 2, 'Continue reprojects the transient scene from canonical records');
  assert.equal(events[1].durationS, 80, 'reprojection is clipped to the original receipt window');
  fixture.state.simTime = RECEIPT_AT + CERES_FURNACE_INSPECTION_WINDOW_S;
  director._onSaveLoaded();
  director.update(1, fixture.state);
  assert.equal(events.length, 2, 'no scene reappears after its original window');
  director.destroy();
});

test('pending Ceres inspection has a separate tag; the Helios planner cannot erase it', () => {
  const fixture = settledWorksite(1);
  const station = stationReady(fixture);
  const { director, events } = directorFor(fixture, { consume: false });
  const item = ceresFurnaceInspectionItem(fixture.state, station, RECEIPT_AT + 10);
  director._planCeresFurnaceInspection(fixture.state, station, RECEIPT_AT + 10);
  assert.equal(fixture.state.stationSideEvents.pending.length, 1);
  assert.equal(fixture.state.stationSideEvents.pending[0].ceresFurnaceMissionId, item.ceresFurnaceMissionId);
  director._planBuoyReceiving(fixture.state, station, RECEIPT_AT + 10);
  assert.equal(fixture.state.stationSideEvents.pending.length, 1);
  assert.equal(fixture.state.stationSideEvents.pending[0].ceresFurnaceMissionId, item.ceresFurnaceMissionId);

  // A stale/invalidated receipt is checked again at fire time and cannot leave an orphan scene.
  fixture.state.missions.receipts.length = 0;
  fixture.state.stationSideEvents.anchorId = String(station.id);
  director._pump(fixture.state, station, RECEIPT_AT + 10);
  assert.equal(events.length, 0);
  assert.equal(fixture.state.stationSideEvents.pending.length, 0);
  director.destroy();
});

test('seen-list normalization is bounded and stable for normal state', () => {
  const state = { stationSideEvents: { ceresFurnaceInspectionSeenMissionIds: ['a', 'b'] } };
  const stable = state.stationSideEvents.ceresFurnaceInspectionSeenMissionIds;
  assert.strictEqual(ensureState(state).ceresFurnaceInspectionSeenMissionIds, stable);
  const malformed = { stationSideEvents: {
    ceresFurnaceInspectionSeenMissionIds: ['dup', 'dup', '', 7, ...Array.from({ length: 12 }, (_, i) => `id-${i}`)],
  } };
  const normalized = ensureState(malformed).ceresFurnaceInspectionSeenMissionIds;
  assert.deepEqual(normalized, Array.from({ length: 10 }, (_, i) => `id-${i + 2}`));
});
