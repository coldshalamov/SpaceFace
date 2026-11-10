import assert from 'node:assert/strict';
import test from 'node:test';

import { readPq020FailureSnapshot } from '../scripts/lib/pq020CeresFunctionalRoute.mjs';

test('PQ-020 failure snapshot bounds live autopilot geometry and input diagnostics', async () => {
  const target = {
    id: 103,
    type: 'beacon',
    name: 'Throughline Weigh Beacon',
    alive: true,
    collides: true,
    radius: 18,
    pos: { x: 100, z: 0 },
    data: { poiId: 'poi_ceres_throughline' },
  };
  const flightAutopilot = {
    dist: 100,
    arrivalRadius: 38,
    status: 'avoiding',
    braking: false,
    captureBraking: true,
    avoiding: true,
    turnError: 0.25,
    target: { x: 0, z: 100, entity: target },
  };
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    hull: 240,
    collides: true,
    radius: 12,
    pos: { x: 0, z: 0 },
    vel: { x: 3, z: 4 },
    rot: 0.5,
    angVel: -0.3,
    _flightFrame: { autopilot: flightAutopilot },
  };
  const nearbyNonCandidates = Array.from({ length: 16 }, (_, index) => (
    obstacle(`behind-${String(index).padStart(2, '0')}`, 0, -(index + 1))
  ));
  const guidanceCandidate = obstacle('forward-guidance', 10, 40);
  const outOfLookAhead = obstacle('out-of-lookahead', 0, 80);
  const eligible = [...nearbyNonCandidates, guidanceCandidate, outOfLookAhead];
  eligible[0].name = 'n'.repeat(240);
  eligible[0].data.worldRecordId = 'r'.repeat(240);
  const filtered = [
    { ...obstacle('dead', 0.1), alive: false },
    { ...obstacle('non-colliding', 0.2), collides: false },
    { ...obstacle('projectile', 0.3), type: 'projectile' },
    { ...obstacle('zero-radius-beacon', 0.4), type: 'beacon', radius: 0 },
  ];
  const entities = new Map([
    [player.id, player],
    [target.id, target],
    ...eligible.map((entity) => [entity.id, entity]),
    ...filtered.map((entity) => [entity.id, entity]),
  ]);
  const state = {
    meta: { seed: 47 },
    mode: 'flight',
    tick: 1_234,
    simTime: 20.5,
    timeScale: 1,
    playerId: player.id,
    entities,
    entityList: [player, target, ...eligible, ...filtered],
    world: { currentSectorId: 'sector_ceres_belt', entryPoint: { x: 0, z: 0 } },
    nav: {
      autopilot: {
        active: true,
        label: 'Throughline Weigh Beacon',
        status: 'avoiding',
        distance: 100,
        initialDistance: 140,
        arrivalRadius: 38,
        target: { x: 100, z: 0 },
        targetEntityId: String(target.id),
        _avoidanceSide: -1,
      },
    },
    input: {
      moveX: 0.25,
      moveZ: 0.75,
      turnIntent: -0.4,
      boost: false,
      brake: true,
      actions: { brake: true },
      autopilot: flightAutopilot,
    },
  };

  const snapshot = await readPq020FailureSnapshot(syntheticPage(state));

  assert.equal(snapshot.tick, 1_234);
  assert.deepEqual(snapshot.player, {
    alive: true,
    hull: 240,
    pos: { x: 0, z: 0 },
    vel: { x: 3, z: 4 },
    speed: 5,
    rot: 0.5,
    angVel: -0.3,
    radius: 12,
  });
  assert.equal(snapshot.autopilot.initialDistance, 140);
  assert.deepEqual(snapshot.autopilot.targetEntity, {
    id: 103,
    type: 'beacon',
    name: 'Throughline Weigh Beacon',
    identity: 'poi_ceres_throughline',
    alive: true,
    collides: true,
    radius: 18,
    pos: { x: 100, z: 0 },
  });
  assert.deepEqual(snapshot.input, {
    moveX: 0.25,
    moveZ: 0.75,
    turnIntent: -0.4,
    boost: false,
    brake: true,
    actionBrake: true,
    autopilot: {
      distance: 100,
      arrivalRadius: 38,
      status: 'avoiding',
      braking: false,
      captureBraking: true,
      avoiding: true,
      turnError: 0.25,
      target: { x: 0, z: 100 },
      targetEntityId: 103,
    },
  });
  assert.deepEqual(snapshot.flightTelemetry, { autopilot: snapshot.input.autopilot });
  assert.equal(snapshot.nearbyObstacles.cap, 16);
  assert.equal(snapshot.nearbyObstacles.eligibleCount, 18);
  assert.equal(snapshot.nearbyObstacles.truncated, true);
  assert.equal(snapshot.nearbyObstacles.nearest.length, 16);
  assert.deepEqual(
    snapshot.nearbyObstacles.nearest.slice(0, 3).map((row) => row.id),
    ['behind-00', 'behind-01', 'behind-02'],
    'nearest rows retain deterministic distance order',
  );
  assert.deepEqual(
    snapshot.nearbyObstacles.nearest.slice(0, 3).map((row) => ({
      projectionWU: row.projectionWU,
      lateralWU: row.lateralWU,
      clearanceWU: row.clearanceWU,
      overlappingClearance: row.overlappingClearance,
    })),
    [
      { projectionWU: -1, lateralWU: -0, clearanceWU: 79.1, overlappingClearance: true },
      { projectionWU: -2, lateralWU: -0, clearanceWU: 79.1, overlappingClearance: true },
      { projectionWU: -3, lateralWU: -0, clearanceWU: 79.1, overlappingClearance: true },
    ],
    'course geometry uses the resolved flight target and Flight V3 clearance formula',
  );
  assert.equal(snapshot.nearbyObstacles.nearest.some((row) => row.id === guidanceCandidate.id), false,
    'sixteen nearer behind-course colliders consume the generic nearest receipt');
  assert.equal(snapshot.nearbyObstacles.nearest[0].name.length, 160);
  assert.equal(snapshot.nearbyObstacles.nearest[0].identity.length, 160);
  assert.deepEqual({
    cap: snapshot.avoidanceCandidates.cap,
    count: snapshot.avoidanceCandidates.count,
    truncated: snapshot.avoidanceCandidates.truncated,
    targetDistanceWU: snapshot.avoidanceCandidates.targetDistanceWU,
    arrivalRadiusWU: snapshot.avoidanceCandidates.arrivalRadiusWU,
    lookAheadWU: snapshot.avoidanceCandidates.lookAheadWU,
    maxProjectionWU: snapshot.avoidanceCandidates.maxProjectionWU,
  }, {
    cap: 16,
    count: 1,
    truncated: false,
    targetDistanceWU: 100,
    arrivalRadiusWU: 38,
    lookAheadWU: 180,
    maxProjectionWU: 62,
  });
  assert.equal(snapshot.avoidanceCandidates.candidates.length, 1);
  const [candidate] = snapshot.avoidanceCandidates.candidates;
  const expectedStrength = (1 - 10 / 79.1) * (0.7 + (1 - 40 / 62) * 0.8);
  assert.deepEqual({
    id: candidate.id,
    projectionWU: candidate.projectionWU,
    lateralWU: candidate.lateralWU,
    clearanceWU: candidate.clearanceWU,
    overlappingClearance: candidate.overlappingClearance,
    strength: candidate.strength,
  }, {
    id: 'forward-guidance',
    projectionWU: 40,
    lateralWU: -10,
    clearanceWU: 79.1,
    overlappingClearance: true,
    strength: expectedStrength,
  }, 'the production-matching receipt retains the forward guidance candidate with exact strength');
  assert.equal(snapshot.avoidanceCandidates.candidates.some((row) => row.id === outOfLookAhead.id), false);
  for (const excluded of [player, target, ...filtered]) {
    assert.equal(snapshot.nearbyObstacles.nearest.some((row) => row.id === excluded.id), false);
  }
});

function obstacle(id, x, z = 0) {
  return {
    id,
    type: 'asteroid',
    name: id,
    alive: true,
    collides: true,
    radius: 8,
    pos: { x, z },
    data: { worldRecordId: `record/${id}` },
  };
}

function syntheticPage(state) {
  return {
    isClosed: () => false,
    evaluate: async (evaluate, argument) => {
      const previous = {
        window: globalThis.window,
        document: globalThis.document,
        getComputedStyle: globalThis.getComputedStyle,
      };
      globalThis.window = {
        SF: {
          state,
          ctx: { screenManager: { top: () => 'flight' } },
        },
        __PQ020_H1_TRACE__: { events: [] },
      };
      globalThis.document = {
        body: { classList: { contains: () => false } },
        getElementById: () => null,
        hasFocus: () => true,
      };
      globalThis.getComputedStyle = () => ({ display: 'none' });
      try {
        return await evaluate(argument);
      } finally {
        restoreGlobal('window', previous.window);
        restoreGlobal('document', previous.document);
        restoreGlobal('getComputedStyle', previous.getComputedStyle);
      }
    },
  };
}

function restoreGlobal(name, value) {
  if (value === undefined) delete globalThis[name];
  else globalThis[name] = value;
}
