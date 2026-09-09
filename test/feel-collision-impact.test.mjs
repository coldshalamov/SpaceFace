import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COLLISION_DELTA_V_FLOOR,
  COLLISION_HITSTOP_COOLDOWN,
  HS_IMPACT_MAX,
  HS_IMPACT_MIN,
  COLLISION_UPGRADE_RATIO,
  feel,
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
  // PQ-186.00: the check's message is B9's own first sentence (the audio clauses are owed to
  // PQ-139/PQ-158 and are recorded unreachable in the bench registry).
  const B9_SENTENCE =
    'Every collision with ΔV ≥ 8 WU/s produces hitstop and camera trauma scaled by exchanged momentum.';
  assert.ok(COLLISION_HITSTOP_COOLDOWN > HS_IMPACT_MAX,
    `${VISION}: grind cooldown outlasts the longest collision beat — ${B9_SENTENCE}`);

  const below = resolveCollisionFeel(impactPayload(7.9), flightCtx(7.9));
  assert.equal(below, null,
    `${B9_SENTENCE} — applies to impacts, not to touching (deltaV 7.9 < floor ${COLLISION_DELTA_V_FLOOR})`);

  const atFloor = resolveCollisionFeel(impactPayload(8), flightCtx(8));
  assert.ok(atFloor && atFloor.hsDur >= HS_IMPACT_MIN,
    `${B9_SENTENCE} — at the deltaV floor hitstop is at least one rendered frame`);

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

// PQ-139.00 hardening (adversarial review finding c): the cooldown's "upgrade gate" used a bare
// `>`, so a grind whose deltaV crept up frame over frame re-armed every single frame and
// machine-gunned the beat. Only a MEANINGFULLY harder hit may interrupt an armed beat.
test('a grind that creeps up cannot machine-gun the hitstop; a real slam still interrupts', () => {
  const triggers = [];
  const traumas = [];
  const host = Object.create(feel);
  host.state = {
    mode: 'flight',
    settings: { video: { motionReduce: false } },
    render: { cameraCtrl: { addTrauma: (a) => traumas.push(a) } },
  };
  host._modalClear = () => true;
  host._trigger = (hsDur) => triggers.push(hsDur);
  host._collisionHitstopCooldown = 0;
  host._armedCollisionDeltaV = 0;
  host._pendingCollisionFeel = null;

  const flush = (deltaV) => {
    host._pendingCollisionFeel = resolveCollisionFeel(impactPayload(deltaV), flightCtx(deltaV));
    host._flushPendingCollision();
  };

  // A sliding contact whose exchanged momentum creeps upward, one rendered frame apart.
  for (const dv of [10, 11, 12, 11, 13, 12, 14, 13]) flush(dv);
  assert.equal(triggers.length, 1,
    `${VISION}: a grind is ONE beat, not one per frame (fired ${triggers.length} times for a creeping deltaV)`);
  assert.equal(traumas.length, 1,
    `${VISION}: a grind adds camera trauma once, not once per frame`);

  // A genuinely harder hit during the same cooldown still gets through.
  flush(10 * COLLISION_UPGRADE_RATIO + 1);   // 16 WU/s after a 10 WU/s beat — a real escalation
  assert.equal(triggers.length, 2,
    `${VISION}: a real escalation still interrupts the armed beat`);

  // Once the cooldown has run out, the next impact answers normally.
  host._collisionHitstopCooldown = 0;
  flush(9);
  assert.equal(triggers.length, 3,
    `${VISION}: after the cooldown, the next impact answers again`);
});
