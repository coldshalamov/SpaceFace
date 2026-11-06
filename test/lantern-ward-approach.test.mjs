import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { world } from '../src/systems/world.js';
import { resolveAutopilotTarget } from '../src/core/flight/flightPresentationReads.js';
import { resolveAutopilotArrivalRadius } from '../src/systems/flightV3.js';
import { buildLocalModel, commitCoursePayload, reconcileMapSelection } from '../src/ui/galaxyMap.js';
import { lanternWardCradleApproach } from '../src/data/lanternWardNavigation.js';
import { lanternWardHardwareSpec, lanternWardCanonicalAnchor } from '../src/data/lanternWardHardware.js';
import { LANTERN_WARD_BODY_CONTRACTS, lanternWardPoint } from '../src/data/lanternWardLayout.js';

function fixture() {
  const state = createGameState(7404);
  state.world.currentSectorId = 'sector_helios_prime';
  const cradle = { ...lanternWardHardwareSpec('cradle'), id: 42, occupantGeneration: 11 };
  const player = { id: 1, type: 'ship', alive: true, radius: 18, pos: { x: 1000, z: -500 },
    vel: { x: 0, z: 0 }, data: {} };
  state.playerId = player.id;
  state.entities = new Map([[player.id, player], [cradle.id, cradle]]);
  state.entityList = [player, cradle];
  const marker = buildLocalModel(state, () => false).contacts.find(contact => contact.entityId === cradle.id);
  assert.ok(marker);
  const arm = payload => {
    world._onSetCourse.call({ state, bus: { emit() {} } }, payload);
    return resolveAutopilotTarget(state, state.nav.autopilot);
  };
  return { state, player, cradle, marker, arm };
}

test('the stable yard cradle remains selected while the real nav owner receives the authored unbound Apron fix', () => {
  const h = fixture(), markerBefore = structuredClone(h.marker), cradleBefore = structuredClone(h.cradle);
  const expected = lanternWardPoint(lanternWardCanonicalAnchor(), 'approach');
  const payload = commitCoursePayload(h.state, h.marker);
  assert.deepEqual(payload.pos, expected);
  assert.equal(payload.arrivalRadius, 40);
  assert.equal(payload.label, 'Lantern Ward · Apron approach');
  assert.equal(payload.targetEntityId, undefined);
  assert.equal(payload.stable, undefined, 'a retained stable binding would silently restore the cradle center');
  const target = h.arm(payload);
  assert.deepEqual({ x: target.x, z: target.z }, expected);
  assert.equal(target.entity, null);
  assert.equal(resolveAutopilotArrivalRadius(h.player, h.state.nav.autopilot, target), 40);
  assert.deepEqual(h.marker, markerBefore, 'navigation does not change the selected contact identity');
  assert.deepEqual(h.cradle, cradleBefore, 'navigation is not a pose or custody writer');
  assert.equal(reconcileMapSelection(h.state, h.marker), h.marker);
});

test('only the original yard pocket receives the approach; carried, moving and foreign-sector cradles keep live tracking', () => {
  for (const mutate of [
    h => { h.cradle.pos.x += LANTERN_WARD_BODY_CONTRACTS.cradle.radius * 2 + 1; },
    h => { h.cradle.pos.z += 800; },
    h => { h.cradle.vel.x = 4; },
    h => { h.cradle.data.lanternWardCustody = { holder: 'player' }; },
    h => { h.cradle.data.sectorId = 'sector_ceres_belt'; },
    h => { h.state.world.currentSectorId = 'sector_ceres_belt'; h.cradle.data.sectorId = 'sector_ceres_belt'; },
  ]) {
    const h = fixture(); mutate(h);
    assert.equal(lanternWardCradleApproach(h.state, h.cradle), null);
    const payload = commitCoursePayload(h.state, h.marker);
    assert.equal(payload.targetEntityId, h.cradle.id);
    assert.deepEqual(payload.stable, h.marker.stable);
    const target = h.arm(payload);
    assert.equal(target.entity, h.cradle);
    assert.deepEqual({ x: target.x, z: target.z }, h.cradle.pos);
  }
});

test('invalid, dead and recycled wrong identities cannot redirect a selection to the Ward approach', () => {
  for (const mutate of [
    h => { h.cradle.alive = false; },
    h => { h.cradle.hull = 0; },
    h => { h.cradle.data.lanternWardInvalid = true; },
    h => { h.cradle.data.lanternWardRole = 'lamp'; },
    h => { h.cradle.data.lanternWardId = 'somewhere_else'; },
    h => { h.cradle.data.homeSectorId = 'sector_ceres_belt'; },
    h => { h.cradle.pos.x = NaN; },
    h => { h.cradle.data.worldRecordId = 'another-cradle'; },
  ]) {
    const h = fixture(); mutate(h);
    assert.equal(lanternWardCradleApproach(h.state, h.cradle), null);
    const payload = commitCoursePayload(h.state, h.marker);
    assert.notEqual(payload.label, 'Lantern Ward · Apron approach');
    assert.equal(payload.arrivalRadius, 48);
  }
  const h = fixture(), old = h.cradle;
  const replacement = { ...old, occupantGeneration: 12, data: { ...old.data, worldRecordId: 'unrelated-payload' } };
  h.state.entities.set(old.id, replacement); h.state.entityList = [h.player, replacement];
  assert.equal(lanternWardCradleApproach(h.state, old), null);
  const payload = commitCoursePayload(h.state, h.marker);
  assert.equal(payload.targetEntityId, undefined, 'the stale stable selection cannot bind a recycled numeric id');
  assert.notEqual(payload.label, 'Lantern Ward · Apron approach');
});

test('durable rematerialization still finds the canonical yard without changing the held selection', () => {
  const h = fixture(), old = h.cradle;
  const replacement = { ...old, id: 57, occupantGeneration: 12, data: { ...old.data } };
  old.alive = false; h.state.entities.delete(old.id); h.state.entities.set(replacement.id, replacement);
  h.state.entityList = [h.player, replacement];
  const payload = commitCoursePayload(h.state, h.marker);
  assert.deepEqual(payload.pos, lanternWardPoint(lanternWardCanonicalAnchor(), 'approach'));
  assert.equal(payload.targetEntityId, undefined);
  assert.equal(h.marker.stable.entityId, old.id);
  assert.equal(reconcileMapSelection(h.state, h.marker).entityId, replacement.id);
});

test('ordinary non-Ward payload courses retain their existing stable live-center behavior', () => {
  const h = fixture();
  h.cradle.data = { name: 'Ordinary loose buoy', worldRecordId: 'buoy:ordinary', worldSiteTargetable: true };
  const marker = buildLocalModel(h.state, () => false).contacts.find(contact => contact.entityId === h.cradle.id);
  const payload = commitCoursePayload(h.state, marker), target = h.arm(payload);
  assert.equal(payload.label, 'Ordinary loose buoy');
  assert.equal(payload.arrivalRadius, 48);
  assert.equal(payload.targetEntityId, h.cradle.id);
  assert.deepEqual(payload.stable, marker.stable);
  assert.equal(target.entity, h.cradle);
  assert.deepEqual({ x: target.x, z: target.z }, h.cradle.pos);
});
