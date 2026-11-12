import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { makeEntity } from '../src/core/entity.js';
import { onboarding, BEATS } from '../src/systems/onboarding.js';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';

function harness(beatKey) {
  const state = createGameState(103);
  state.playerId = 1;
  const player = makeEntity({ type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } });
  player.id = 1;
  state.entities.set(1, player);
  state.entityList.push(player);
  state.onboarding = { active: true, finished: false, currentBeat: BEATS.findIndex(b => b.key === beatKey),
    beatDoneAt: {}, firedFollowups: { 'tether:tether:latched': true }, tetherReeled: true };
  const owner = Object.create(onboarding);
  owner.state = state;
  owner._derelictId = 2;
  owner._miningRockId = 2;
  let seq = 10;
  owner.helpers = { spawnEntity(spec) {
    const entity = makeEntity(spec); entity.id = seq++;
    state.entities.set(entity.id, entity); state.entityList.push(entity); return entity;
  } };
  owner._sayTutorial = () => {};
  owner._setObjectiveWaypoint = () => {};
  return { state, owner };
}

test('a removed tutorial seam rock is restaged without losing already mined progress', () => {
  const { state, owner } = harness('seam');
  state.onboarding.seamOreCollected = 3;
  owner._resolveProximityDone();
  assert.notEqual(owner._miningRockId, 2);
  assert.equal(state.entities.get(owner._miningRockId).data.trainingMining, true);
  assert.equal(state.onboarding.seamOreCollected, 3);
  assert.equal(state.onboarding.beatDoneAt.seam, undefined);
});

test('the tether lesson restages a missing derelict and requires a fresh latch/winch/cut', () => {
  const { state, owner } = harness('tether');
  state.player.targetId = 2;
  owner._resolveProximityDone();
  assert.notEqual(owner._derelictId, 2);
  assert.equal(state.entities.get(owner._derelictId).data.kind, 'derelict');
  assert.equal(state.player.targetId, owner._derelictId);
  assert.equal(state.onboarding.tetherReeled, false);
  assert.equal(state.onboarding.firedFollowups['tether:tether:latched'], undefined);
});

test('a recycled entity id cannot become the tutorial mining target', () => {
  const { state, owner } = harness('seam');
  state.entities.set(2, { id: 2, alive: true, type: 'ship', data: {} });
  owner._resolveProximityDone();
  assert.notEqual(owner._miningRockId, 2);
  assert.equal(state.entities.get(2).type, 'ship');
});

test('a derelict respawn that reuses the old id still resets its physical lesson progress', () => {
  const { state, owner } = harness('tether');
  state.player.targetId = 2;
  owner.helpers.spawnEntity = spec => {
    const replacement = makeEntity(spec); replacement.id = 2;
    state.entities.set(2, replacement); return replacement;
  };
  owner._resolveProximityDone();
  assert.equal(owner._derelictId, 2);
  assert.equal(state.onboarding.tetherReeled, false);
  assert.equal(state.onboarding.firedFollowups['tether:tether:latched'], undefined);
  assert.equal(state.player.targetId, 2);
});

test('first-pull cue yields to tracked work and stays at its home sector across return', () => {
  const { state, owner } = harness('tether');
  owner._setObjectiveWaypoint = onboarding._setObjectiveWaypoint;
  owner._setRescueWaypoint = () => false;
  owner._setMissingThreeWaypoint = () => false;
  owner._refreshBeatPanel = () => {};
  state.world.currentSectorId = 'sector_helios_prime';
  owner._spawnDerelict();
  const target = owner._derelictId;
  owner._setObjectiveWaypoint(false);
  assert.equal(state.nav.waypoint.markerId, 'onboarding:tether');
  assert.match(state.nav.waypoint.reason, /^Optional:/);
  assert.equal(state.onboarding.tetherSectorId, 'sector_helios_prime');

  state.ui.trackedMissionId = '47a';
  state.missions.active = [{ id: '47a', status: 'active' }];
  owner._setObjectiveWaypoint(false);
  assert.equal(state.nav.waypoint, null, 'tracked work receives the primary slot');
  const missionWaypoint = { kind: 'mission', missionId: '47a', pos: { x: 12, z: 34 } };
  state.nav.waypoint = missionWaypoint;
  state.world.currentSectorId = 'sector_ceres';
  owner._resolveProximityDone();
  owner._setObjectiveWaypoint(true);
  assert.equal(owner._derelictId, target, 'no second lesson body is restaged away');
  assert.equal(state.onboarding.tetherReeled, true, 'leaving does not complete or reset progress');
  assert.equal(state.nav.waypoint, missionWaypoint, 'the lesson cannot reclaim the mission route');

  state.world.currentSectorId = 'sector_helios_prime';
  state.ui.trackedMissionId = null;
  state.nav.waypoint = null;
  owner._setObjectiveWaypoint(false);
  assert.equal(state.nav.waypoint.markerId, 'onboarding:tether');
  assert.equal(owner._derelictId, target, 'the original live body resumes when available');
});

test('first-pull home survives a save and legacy ordinary saves return to Helios', () => {
  const { state, owner } = harness('tether');
  state.world.currentSectorId = 'sector_helios_prime';
  owner._spawnDerelict();
  const record = owner.serialize();
  assert.equal(record.tetherSectorId, 'sector_helios_prime');
  state.world.currentSectorId = 'sector_ceres';
  owner.deserialize(record);
  assert.equal(state.onboarding.tetherSectorId, 'sector_helios_prime');
  const before = state.entityList.length;
  owner._resolveProximityDone();
  assert.equal(state.entityList.length, before);
  delete record.tetherSectorId;
  owner.deserialize(record);
  assert.equal(state.onboarding.tetherSectorId, 'sector_helios_prime');
});

test('the same live first-pull body can be worked after crossing a corridor boundary', () => {
  const { state, owner } = harness('tether');
  owner._setObjectiveWaypoint = onboarding._setObjectiveWaypoint;
  owner._setRescueWaypoint = () => false;
  owner._setMissingThreeWaypoint = () => false;
  owner._refreshBeatPanel = () => {};
  state.world.currentSectorId = 'sector_helios_prime';
  owner._spawnDerelict();
  const body = state.entities.get(owner._derelictId);
  state.world.currentSectorId = 'sector_ceres_belt';
  owner._setObjectiveWaypoint(false);
  assert.equal(state.nav.waypoint, null, 'an old Helios body is not a local Ceres cue');

  const ceres = sectorGlobalOrigin('sector_ceres_belt');
  body.pos.x = ceres.x;
  body.pos.z = ceres.z;
  assert.equal(owner._liveTrainingDerelict(), body);
  owner._setObjectiveWaypoint(false);
  assert.equal(state.nav.waypoint.markerId, 'onboarding:tether');
  let event = null;
  owner._onBeatEvent = (name) => { event = name; };
  owner._onTetherReel({ targetId: body.id, after: 30 });
  assert.equal(event, 'tether:reel', 'actual lesson progress remains possible');

  state.entities.set(body.id, { ...body, pos: { ...body.pos } });
  assert.equal(owner._liveTrainingDerelict(), null, 'a recycled life does not inherit the lesson');
});
