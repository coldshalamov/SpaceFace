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

test('a kill beside the station does not drop the patrol inside the station', () => {
  const station = { pos: { x: 0, z: 0 }, launchRadius: 120 };
  const aggressor = { x: 44, z: 0 };
  const arrived = reserveArrivalPoint({
    anchor: aggressor,
    aggressorPos: aggressor,
    jurisdictionRadius: 1400,
    seed: 4242,
    incidentId: 'law:beside-station',
    station,
    frameHalfWu: WITNESS_FRAME_HALF_WU,
  });
  const fromAggressor = dist(arrived, aggressor);
  const fromStation = dist(arrived, station.pos);
  assert.ok(fromAggressor >= 40 && fromAggressor < WITNESS_FRAME_HALF_WU,
    `beside-station range ${fromAggressor}`);
  assert.ok(fromStation >= station.launchRadius,
    `beside-station patrol is inside the station at ${fromStation}`);
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
