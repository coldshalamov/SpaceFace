import test from 'node:test';
import assert from 'node:assert/strict';

import { meetingDiamondHidden } from '../src/ui/masslineHud.js';

function stateWith(playerMass, anchorMass, payloadId = 4) {
  const entities = new Map([
    [1, { id: 1, mass: playerMass, pos: { x: 0, z: 0 } }],
    [payloadId, { id: payloadId, mass: anchorMass, pos: { x: 40, z: 0 } }],
  ]);
  return {
    playerId: 1,
    entities,
    throwState: { armed: true, payloadId, solution: { valid: true }, selfSolution: { valid: true } },
  };
}

test('VERB-08 a heavy anchor or self-sling hides the meeting diamond', () => {
  const heavy = stateWith(12, 80);
  assert.equal(meetingDiamondHidden(heavy.throwState, heavy), true);

  const self = stateWith(12, 12, 1);
  self.throwState.payloadId = 1;
  assert.equal(meetingDiamondHidden(self.throwState, self), true);

  const light = stateWith(40, 8);
  assert.equal(meetingDiamondHidden(light.throwState, light), false);
});
