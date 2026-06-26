import assert from 'node:assert/strict';

import { clampFocusToPlayerSafeRect, resolveChaseComposition } from '../src/render/camera.js';

function ship(id, x, z, team = 'enemy') {
  return {
    id,
    type: 'ship',
    team,
    hull: 100,
    alive: true,
    pos: { x, z },
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
near(threat.x, 90, 'combat threat bias should push toward the target without zooming out');
near(threat.z, 0, 'combat threat bias should preserve lateral alignment');

const despawnedThreat = ship(5, 500, 0, 'enemy');
despawnedThreat.alive = false;
const deadThreatState = stateWith([player, despawnedThreat]);
const deadThreat = resolveChaseComposition(deadThreatState, player, { x: 0, z: 0 });
assert.equal(deadThreat.nearbyEnemies, 0, 'dead hostiles should not count as active threats');
assert.equal(deadThreat.hasThreatFocus, false, 'dead hostiles should not pull camera composition');
near(deadThreat.x, 0, 'dead hostile should leave player focus unchanged');

const tetherState = stateWith([player, payload(3, 320, 0)], {
  att_payload: { id: 'att_payload', state: 'active', ownerId: 1, targetId: 3 },
});
const tether = resolveChaseComposition(tetherState, player, { x: 0, z: 0 });
assert.equal(tether.nearbyEnemies, 0, 'payload tether should not masquerade as a hostile');
assert.equal(tether.hasThreatFocus, false, 'payload-only framing should not report threat focus');
assert.equal(tether.hasTetherFocus, true, 'active player tether should become a composition anchor');
near(tether.x, 76.8, 'payload tether bias should compose toward the Massline endpoint');

const combinedState = stateWith([player, ship(2, 500, 0, 'enemy'), payload(3, 320, 0)], {
  att_payload: { id: 'att_payload', state: 'active', ownerId: 1, targetId: 3 },
  att_broken: { id: 'att_broken', state: 'broken', ownerId: 1, targetId: 2 },
});
const combined = resolveChaseComposition(combinedState, player, { x: 0, z: 0 });
assert.equal(combined.nearbyEnemies, 1, 'combined combat+tether framing should keep threat count');
assert.equal(combined.hasThreatFocus, true, 'combined framing should include threat focus');
assert.equal(combined.hasTetherFocus, true, 'combined framing should include tether focus');
near(combined.x, 166.8, 'combined framing should include both threat and Massline endpoint bias');

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

console.log('Camera composition checks OK');
