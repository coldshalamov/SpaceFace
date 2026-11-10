// WORLD-37: the depot patrol your claim summoned shows on the chart as a moving law
// presence. A supported depot with a live patrol beat publishes one depot-patrol marker
// that follows the patrol hull; lapsed, resolving and off-sector beats draw nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { buildClaimOwnershipMarkers } from '../src/ui/galaxyMap.js';
import { depotPatrolMarker, DEPOT_PATROL_SHAPE_ID } from '../src/systems/claims.js';

const SEED = 4242;
const SECTOR = 'sector_ceres_belt';
const ENCOUNTER_ID = 'depot-patrol:relay-1:3';

function boot() {
  const state = createGameState(SEED);
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  state.entityList = state.entityList || [];
  return state;
}

function relayBody() {
  return {
    id: 'relay-1',
    name: 'Rookery Relay',
    owned: true,
    sectorId: SECTOR,
    x: 1000,
    z: -500,
    spec: { id: 'spec_relay', status: 'active' },
    depotSupport: {
      supported: true,
      since: 10,
      stockedAt: 10,
      dryAt: 0,
      lapsedAt: 0,
      lapseReason: null,
      rotations: 3,
      completedRotations: 2,
      patrol: {
        encounterId: ENCOUNTER_ID,
        anchor: { x: 1350, z: -500 },
        requestedAt: 10,
        nextAt: 0,
        lastDenied: null,
        announced: true,
      },
    },
  };
}

function patrolHull(id, x, z) {
  return {
    id, type: 'ship', alive: true, team: 4, radius: 10,
    pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0,
    data: { ai: { squadId: ENCOUNTER_ID } },
  };
}

function stateWith(body, hulls = []) {
  const state = boot();
  state.claims.bodies = [body];
  for (const hull of hulls) {
    state.entities.set(hull.id, hull);
    state.entityList.push(hull);
  }
  return state;
}

function patrolMarkers(state) {
  return buildClaimOwnershipMarkers(state, SECTOR)
    .filter((marker) => marker.kind === 'depot-patrol');
}

test('a live patrol beat publishes one moving marker on the hull', () => {
  const body = relayBody();
  const state = stateWith(body, [patrolHull(77, 1400, -480)]);
  const found = patrolMarkers(state);
  assert.equal(found.length, 1, 'exactly one patrol marker');
  const marker = found[0];
  assert.equal(marker.id, 'depot-patrol:relay-1');
  assert.equal(marker.claimId, 'relay-1');
  assert.equal(marker.targetEntityId, 77);
  assert.equal(marker.role, 'PATROL');
  assert.ok(marker.drawPos && Number.isFinite(marker.drawPos.x), 'chart position resolves');

  // The beat moves: the marker follows the hull, not the stored anchor.
  const moved = patrolHull(77, 1500, -300);
  const state2 = stateWith(body, [moved]);
  const movedMarker = patrolMarkers(state2)[0];
  assert.ok(movedMarker, 'still exactly one marker');
  assert.notDeepEqual(
    [movedMarker.x, movedMarker.z],
    [marker.x, marker.y ?? marker.z],
    'world position updates with the hull',
  );
  assert.notDeepEqual(movedMarker.drawPos, marker.drawPos, 'chart position updates with the hull');
});

test('an unresolvable hull falls back to the stored anchor, then the body', () => {
  const anchored = patrolMarkers(stateWith(relayBody(), []));
  assert.equal(anchored.length, 1);
  assert.equal(anchored[0].x, 1350);
  assert.equal(anchored[0].targetEntityId, null);

  const body = relayBody();
  body.depotSupport.patrol.anchor = null;
  const bare = patrolMarkers(stateWith(body, []));
  assert.equal(bare.length, 1);
  assert.equal(bare[0].x, 1000, 'falls back to the depot body');
});

test('lapsed, resolving and off-sector beats draw nothing', () => {
  const hull = patrolHull(77, 1400, -480);
  const lapsed = relayBody();
  lapsed.depotSupport.supported = false;
  assert.equal(patrolMarkers(stateWith(lapsed, [hull])).length, 0, 'lapsed support draws nothing');

  const resolving = relayBody();
  resolving.depotSupport.patrol.encounterId = null;
  assert.equal(patrolMarkers(stateWith(resolving, [hull])).length, 0, 'a resolving beat draws nothing');

  const away = relayBody();
  away.sectorId = 'sector_helios';
  assert.equal(patrolMarkers(stateWith(away, [hull])).length, 0, 'an off-sector depot draws nothing here');
});

test('the projector is pure: null unless supported with a live beat', () => {
  const body = relayBody();
  const live = { x: 5, z: 6 };
  assert.deepEqual(depotPatrolMarker(body, live).x, 5, 'live hull wins');
  assert.deepEqual(
    depotPatrolMarker(body, null),
    { bodyId: 'relay-1', encounterId: ENCOUNTER_ID, x: 1350, z: -500 },
    'stored anchor next',
  );
  const unsupported = relayBody();
  unsupported.depotSupport.supported = false;
  assert.equal(depotPatrolMarker(unsupported, live), null);
  const idle = relayBody();
  idle.depotSupport.patrol.encounterId = null;
  assert.equal(depotPatrolMarker(idle, live), null);
  assert.equal(depotPatrolMarker(null, live), null);
  assert.ok(DEPOT_PATROL_SHAPE_ID, 'the beat shape id exists for the follow contract');
});
