import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COLLISION_DELTA_V_FLOOR,
  COLLISION_HITSTOP_COOLDOWN,
  HS_IMPACT_MAX,
  HS_IMPACT_MIN,
  resolveCollisionFeel,
} from '../src/render/feel.js';

const VISION = 'Impacts should answer instantly';

function impactPayload(deltaV) {
  return {
    dp: deltaV * 20,
    trauma: 0.1,
    playerInvolved: true,
    playerDeltaV: deltaV,
    pos: { x: 0, z: 0 },
    normal: { x: 1, z: 0 },
    aId: 1,
    bId: 2,
  };
}

function flightCtx(deltaV, extra = {}) {
  return {
    deltaV,
    playerDistance: 0,
    motionReduce: false,
    mode: 'flight',
    ...extra,
  };
}

test('collision feel ramps hitstop and trauma with exchanged momentum', () => {
  assert.ok(COLLISION_HITSTOP_COOLDOWN > HS_IMPACT_MAX,
    `${VISION}: grind cooldown outlasts the longest collision beat`);

  const below = resolveCollisionFeel(impactPayload(7.9), flightCtx(7.9));
  assert.equal(below, null,
    `${VISION} applies to impacts, not to touching (deltaV 7.9 < floor ${COLLISION_DELTA_V_FLOOR})`);

  const atFloor = resolveCollisionFeel(impactPayload(8), flightCtx(8));
  assert.ok(atFloor && atFloor.hsDur >= HS_IMPACT_MIN,
    `${VISION}: at the deltaV floor hitstop is at least one rendered frame`);

  const rampAt = [8, 20, 60, 150, 300].map((dv) => resolveCollisionFeel(impactPayload(dv), flightCtx(dv)));
  for (let i = 1; i < rampAt.length; i++) {
    assert.ok(rampAt[i] && rampAt[i - 1] && rampAt[i].hsDur >= rampAt[i - 1].hsDur,
      `${VISION}: hsDur is monotone non-decreasing (${[8, 20, 60, 150, 300][i - 1]} -> ${[8, 20, 60, 150, 300][i]})`);
  }
  assert.ok(rampAt[2].hsDur >= rampAt[1].hsDur * 1.35,
    `${VISION}: a scrape is a tick, a slam is a beat (hsDur at 60 is at least 1.35x hsDur at 20)`);
  assert.ok(rampAt[3].hsDur >= rampAt[2].hsDur * 1.35,
    `${VISION}: a scrape is a tick, a slam is a beat (hsDur at 150 is at least 1.35x hsDur at 60)`);

  const absurd = resolveCollisionFeel(impactPayload(5000), flightCtx(5000));
  assert.ok(absurd && absurd.hsDur <= HS_IMPACT_MAX,
    `${VISION}: an absurd impact never freezes the game (hsDur ceiling)`);
  assert.ok(absurd.trauma <= 0.35,
    `${VISION}: an absurd impact never freezes the game (trauma ceiling)`);

  for (const dv of [8, 20, 60, 150, 300, 5000]) {
    assert.equal(
      resolveCollisionFeel(impactPayload(dv), flightCtx(dv, { motionReduce: true })),
      null,
      `${VISION}: motionReduce returns null at deltaV ${dv}`,
    );
  }

  const slamNear = resolveCollisionFeel(impactPayload(150), flightCtx(150, { playerDistance: 0 }));
  const slamFar = resolveCollisionFeel(impactPayload(150), flightCtx(150, { playerDistance: 1200 }));
  assert.ok(slamNear && slamFar && slamFar.trauma < slamNear.trauma,
    `${VISION}: trauma falls off with distance (1200 WU strictly less than at the player)`);

  const first = resolveCollisionFeel(impactPayload(60), flightCtx(60));
  const second = resolveCollisionFeel(impactPayload(60), flightCtx(60));
  assert.equal(first.hsDur, second.hsDur, `${VISION}: pure — hsDur is deterministic`);
  assert.equal(first.fov, second.fov, `${VISION}: pure — fov is deterministic`);
  assert.equal(first.trauma, second.trauma, `${VISION}: pure — trauma is deterministic`);
  assert.equal(first.id, second.id, `${VISION}: pure — tier id is deterministic`);
});
