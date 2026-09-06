import assert from 'node:assert/strict';
import test from 'node:test';

import { assessFriendlyFireLane, FRIENDLY_FIRE_CORRIDOR_WU } from '../src/ai/fireDiscipline.js';

function ship(id, x, z, team = 1, radius = 8) {
  return {
    id, type: 'ship', alive: true, team, radius,
    pos: { x, z }, vel: { x: 0, z: 0 },
  };
}

test('an allied hull in the ballistic lane blocks the shot', () => {
  const shooter = ship(1, 0, 0);
  const target = ship(2, 100, 0, 0);
  const ally = ship(3, 50, 0, 1, 8);
  const result = assessFriendlyFireLane({
    shooter,
    target,
    aimAngle: 0,
    entities: [shooter, target, ally],
    corridor: FRIENDLY_FIRE_CORRIDOR_WU,
  });
  assert.equal(result.clear, false);
  assert.equal(result.blockerId, 3);
  assert.equal(result.reason, 'ally_in_lane');
});

test('an empty lane and a lateral ally both stay clear', () => {
  const shooter = ship(1, 0, 0);
  const target = ship(2, 100, 0, 0);
  const empty = assessFriendlyFireLane({
    shooter, target, aimAngle: 0, entities: [shooter, target],
  });
  assert.equal(empty.clear, true);
  assert.equal(empty.blockerId, null);

  const wide = ship(4, 50, 40, 1, 8);
  const lateral = assessFriendlyFireLane({
    shooter, target, aimAngle: 0, entities: [shooter, target, wide],
  });
  assert.equal(lateral.clear, true);
});
