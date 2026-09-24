// §22 A4 — a witnessed kill's answering patrol is inside the composed frame
// (one screen is 126 WU), not on a ring ten screens out. The stay-versus-chase
// split still belongs to lawSecurity; this is the arrival that makes the chase visible.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  WITNESS_FRAME_HALF_WU,
  reserveArrivalPoint,
} from '../src/law/authorityResponse.js';

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

test('a far reserve is pulled inside the composed frame and stays off the hull', () => {
  assert.equal(WITNESS_FRAME_HALF_WU, 126);
  for (const seed of [4242, 8008]) {
    const aggressor = { x: 400, z: -80 };
    const arrived = reserveArrivalPoint({
      anchor: { x: 0, z: 0 },
      aggressorPos: aggressor,
      jurisdictionRadius: 1400,
      seed,
      incidentId: `law:frame:${seed}`,
      station: { pos: { x: -2400, z: 900 }, launchRadius: 72 },
      frameHalfWu: WITNESS_FRAME_HALF_WU,
    });
    const again = reserveArrivalPoint({
      anchor: { x: 0, z: 0 },
      aggressorPos: aggressor,
      jurisdictionRadius: 1400,
      seed,
      incidentId: `law:frame:${seed}`,
      station: { pos: { x: -2400, z: 900 }, launchRadius: 72 },
      frameHalfWu: WITNESS_FRAME_HALF_WU,
    });
    assert.deepEqual(arrived, again, `seed ${seed} arrival is stable`);
    const range = dist(arrived, aggressor);
    assert.ok(range < WITNESS_FRAME_HALF_WU, `seed ${seed} chaser at ${range} is outside the frame`);
    assert.ok(range >= 40, `seed ${seed} chaser popped onto the hull (${range})`);
    console.log(`seed ${seed} reserve ${range.toFixed(1)} WU from the aggressor`);
  }
});

test('without a frame request the far ring is unchanged', () => {
  const arrived = reserveArrivalPoint({
    anchor: { x: 0, z: 0 },
    aggressorPos: { x: 100, z: 0 },
    jurisdictionRadius: 1400,
    seed: 4242,
    incidentId: 'law:far',
  });
  assert.ok(dist(arrived, { x: 0, z: 0 }) >= 2000, 'the old ring stays when the frame is not requested');
});
