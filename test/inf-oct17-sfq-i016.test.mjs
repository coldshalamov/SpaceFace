// SFQ-I016 — a locked heavy hull (mass >= HEAVY_AS_TERRAIN_MASS = 150) must surface a
// concise mass-response token in the target-condition readout, because concussions and
// shoves move it less and never trigger the screen-clearing shove beat. Light/medium
// hulls (mass < 150) stay quiet: nothing about their mass-response needs saying.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { HEAVY_AS_TERRAIN_MASS } from '../src/combat/impulseKernel.js';
import { targetConditionReadout } from '../src/ui/targetCondition.js';
import { createTargetPanel } from '../src/ui/targetPanel.js';

const HEAVY_TOKEN = 'HEAVY MASS · SHOVE RESISTANT';

function bootState() {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.simTime = 0;
  state.playerId = 1;
  return state;
}

function addShip(state, id, mass, x) {
  const ship = {
    id, type: 'ship', alive: true, team: 1, mass, radius: 8, rot: 0,
    pos: { x, z: 0 }, vel: { x: 0, z: 0 },
    hull: 500, hullMax: 500, shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0,
    cap: 40, capMax: 40, capRegen: 6,
  };
  state.entities.set(id, ship);
  if (Array.isArray(state.entityList)) state.entityList.push(ship);
  else state.entityList = [ship];
  return ship;
}

test('locking a heavy hull surfaces the mass-response token', () => {
  assert.equal(HEAVY_AS_TERRAIN_MASS, 150, 'the catalog pins the heavy boundary at 150');
  const state = bootState();
  const heavy = addShip(state, 2, HEAVY_AS_TERRAIN_MASS, 40);
  const readout = targetConditionReadout(state, heavy);
  assert.ok(readout, 'a locked heavy hull reads a condition, even with a clean combat record');
  assert.equal(readout.heavyMass, true, 'the heavy-mass fact is stamped on the readout');
  assert.match(readout.text, /HEAVY MASS · SHOVE RESISTANT/,
    'the panel names the mass response in player words, never a raw mass id');
  const again = targetConditionReadout(state, heavy);
  assert.deepEqual(again, readout, 'the same sim state answers the same fact twice');
});

test('a boundary-minus-one hull stays quiet', () => {
  const state = bootState();
  const medium = addShip(state, 3, HEAVY_AS_TERRAIN_MASS - 1, 40);
  const readout = targetConditionReadout(state, medium);
  if (readout) {
    assert.equal(readout.heavyMass, null, 'no heavy-mass fact below the boundary');
    assert.doesNotMatch(readout.text, /HEAVY MASS/,
      'light/medium hulls print nothing about their mass response');
  } else {
    assert.equal(readout, null, 'a clean light hull reads no condition at all');
  }
});

test('the target panel reaches the same readout for the locked heavy hull', async () => {
  assert.equal(typeof createTargetPanel, 'function', 'the panel loader resolves on the default route');
  const state = bootState();
  const heavy = addShip(state, 2, 300, 40);
  const readout = targetConditionReadout(state, heavy);
  assert.ok(readout && readout.text.includes(HEAVY_TOKEN),
    'the locked heavy hull carries the token the panel row prints');
});
