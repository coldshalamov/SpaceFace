import assert from 'node:assert/strict';

import {
  CAMERA_ZOOM_MAX,
  CHASE_ZOOM_DEFAULT,
  PHYSICS_EARNED_SPEED_ZOOM_MAX,
  SPEED_ZOOM_MAX,
  SPEED_ZOOM_MIN,
  SPEED_ZOOM_SAMPLE_INTERVAL,
  clampFocusToPlayerSafeRect,
  recenterBiasScale,
  resolveChaseComposition,
  resolveExceptionalSpeedZoomFactor,
  resolveInitialChaseZoom,
  resolveSpeedZoomFactor,
} from '../src/render/camera.js';

function ship(id, x, z, team = 'enemy') {
  return {
    id,
    type: 'ship',
    team,
    hull: 100,
    alive: true,
    pos: { x, z },
    data: team === 'enemy' ? { encounter: { id: 'camera-composition-check-hostile' } } : {},
  };
}

function payload(id, x, z) {
  return {
    id,
    type: 'payload',
    alive: true,
    pos: { x, z },
    data: { tetherPayload: true },
  };
}

function stateWith(entities, attachments = {}) {
  return {
    entities: new Map(entities.map((entity) => [entity.id, entity])),
    playerId: 1,
    combat: { attachments: { byId: attachments } },
  };
}

function near(actual, expected, label) {
  assert(Math.abs(actual - expected) < 1e-9, `${label}: expected ${expected}, got ${actual}`);
}

const player = ship(1, 0, 0, 'player');

const threatState = stateWith([player, ship(2, 500, 0, 'enemy')]);
const threat = resolveChaseComposition(threatState, player, { x: 0, z: 0 });
assert.equal(threat.nearbyEnemies, 1, 'nearby hostile should be counted for combat zoom');
assert.equal(threat.hasThreatFocus, true, 'nearest hostile should become a composition anchor');
assert.equal(threat.hasTetherFocus, false, 'threat-only framing should not report tether focus');
near(threat.x, 40, 'combat threat bias should push mildly toward the target');
near(threat.z, 0, 'combat threat bias should preserve lateral alignment');
assert.ok(threat.zoomBias > 0.10 && threat.zoomBias < 0.12, 'combat threat should prefer zoom-out context over large focus displacement');

const despawnedThreat = ship(5, 500, 0, 'enemy');
despawnedThreat.alive = false;
const deadThreatState = stateWith([player, despawnedThreat]);
const deadThreat = resolveChaseComposition(deadThreatState, player, { x: 0, z: 0 });
assert.equal(deadThreat.nearbyEnemies, 0, 'dead hostiles should not count as active threats');
assert.equal(deadThreat.hasThreatFocus, false, 'dead hostiles should not pull camera composition');
near(deadThreat.x, 0, 'dead hostile should leave player focus unchanged');
near(deadThreat.zoomBias, 0, 'dead hostile should not request context zoom');

const tetherState = stateWith([player, payload(3, 320, 0)], {
  att_payload: { id: 'att_payload', state: 'active', ownerId: 1, targetId: 3 },
});
const tether = resolveChaseComposition(tetherState, player, { x: 0, z: 0 });
assert.equal(tether.nearbyEnemies, 0, 'payload tether should not masquerade as a hostile');
assert.equal(tether.hasThreatFocus, false, 'payload-only framing should not report threat focus');
assert.equal(tether.hasTetherFocus, true, 'active player tether should become a composition anchor');
near(tether.x, 38.4, 'payload tether bias should compose gently toward the Massline endpoint');
assert.ok(tether.zoomBias > 0.06 && tether.zoomBias < 0.07, 'payload tether should widen the camera more than it drags focus');

const combinedState = stateWith([player, ship(2, 500, 0, 'enemy'), payload(3, 320, 0)], {
  att_payload: { id: 'att_payload', state: 'active', ownerId: 1, targetId: 3 },
  att_broken: { id: 'att_broken', state: 'broken', ownerId: 1, targetId: 2 },
});
const combined = resolveChaseComposition(combinedState, player, { x: 0, z: 0 });
assert.equal(combined.nearbyEnemies, 1, 'combined combat+tether framing should keep threat count');
assert.equal(combined.hasThreatFocus, true, 'combined framing should include threat focus');
assert.equal(combined.hasTetherFocus, true, 'combined framing should include tether focus');
near(combined.x, 78.4, 'combined framing should include bounded threat and Massline endpoint bias');
near(combined.zoomBias, 0.14, 'combined combat+tether context zoom should cap before feeling like a map peek');

const unrelatedTetherState = stateWith([player, payload(3, 320, 0), ship(4, -200, 0, 'player')], {
  att_unrelated: { id: 'att_unrelated', state: 'active', ownerId: 4, targetId: 3 },
});
const unrelated = resolveChaseComposition(unrelatedTetherState, player, { x: 0, z: 0 });
assert.equal(unrelated.hasTetherFocus, false, 'tethers not attached to the player should not steer the player camera');
near(unrelated.x, 0, 'unrelated tether should leave player focus unchanged');

const wideFocus = clampFocusToPlayerSafeRect({ x: 160, z: 120 }, player, { zoom: 95, fov: 50, aspect: 16 / 9 });
assert.equal(wideFocus.clamped, true, 'camera safety clamp should engage when composition would lose the player');
assert.ok(Math.abs(wideFocus.x - player.pos.x) < 60, 'camera safety clamp should keep player horizontally inside the safe view');
assert.ok(Math.abs(wideFocus.z - player.pos.z) < 40, 'camera safety clamp should keep player vertically inside the safe view');

const calmFocus = clampFocusToPlayerSafeRect({ x: 12, z: 8 }, player, { zoom: 95, fov: 50, aspect: 16 / 9 });
assert.equal(calmFocus.clamped, false, 'camera safety clamp should preserve small loose-follow offsets');
near(calmFocus.x, 12, 'safe focus should preserve horizontal breathing room');
near(calmFocus.z, 8, 'safe focus should preserve vertical breathing room');

const missingFocus = clampFocusToPlayerSafeRect(null, player, { zoom: 95, fov: 50, aspect: 16 / 9 });
assert.equal(missingFocus.clamped, false, 'camera safety clamp should tolerate missing focus during startup');
near(missingFocus.x, player.pos.x, 'missing focus should fall back to the player x position');
near(missingFocus.z, player.pos.z, 'missing focus should fall back to the player z position');

near(recenterBiasScale(0.4, 0.4), 1, 'recenter should start with the current bias instead of snapping to center');
assert.ok(recenterBiasScale(0.383, 0.4) > 0.99, 'recenter should barely move on its first frame');
near(recenterBiasScale(0, 0.4), 0, 'recenter should end fully player-centered');

near(CAMERA_ZOOM_MAX, 330, 'manual camera zoom-out should extend 50 percent beyond the previous 220 ceiling');
near(CHASE_ZOOM_DEFAULT, 144, 'normal gameplay should use the selected wide 144 WU framing');
near(resolveInitialChaseZoom(undefined), CHASE_ZOOM_DEFAULT,
  'missing camera state should fall back to recovery framing');
near(resolveInitialChaseZoom(72), 72,
  'an explicit 72 WU camera selection should retain its exact zoom semantics');
near(resolveInitialChaseZoom(96), 96,
  'an explicit non-default camera selection should retain its exact zoom semantics');
assert.ok(SPEED_ZOOM_SAMPLE_INTERVAL >= 0.1, 'speed zoom target should sample at low cadence, not retarget every render frame');
near(resolveSpeedZoomFactor(0, 120), SPEED_ZOOM_MIN, 'idle speed zoom should keep the tight low-speed factor');
assert.ok(resolveSpeedZoomFactor(60, 120) > 1, 'mid/high speed should naturally widen past base zoom');
near(resolveSpeedZoomFactor(120, 120), SPEED_ZOOM_MAX, 'ship max speed should reach the speed zoom-out cap');
near(resolveSpeedZoomFactor(240, 120, false), SPEED_ZOOM_MAX,
  'unearned overspeed should stay at the ordinary speed zoom cap');
near(resolveExceptionalSpeedZoomFactor(0.5), 1.365,
  'the shared midpoint scalar should open the scene halfway to the exceptional cap');
near(resolveExceptionalSpeedZoomFactor(1), PHYSICS_EARNED_SPEED_ZOOM_MAX,
  'the shared exceptional scalar should reach its bounded wide cap');
near(resolveExceptionalSpeedZoomFactor(99), PHYSICS_EARNED_SPEED_ZOOM_MAX,
  'out-of-range shared scalars should remain bounded');

console.log('Camera composition checks OK');
