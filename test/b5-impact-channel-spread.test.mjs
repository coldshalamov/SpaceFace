// build_map §22 row B5 — "a slam and a nudge differ on every channel."
//
// The solver caps the contact receipt's momentum near mass·40 WU/s (MAX_CONTACT_DV), so a
// 150 WU/s slam and a 40 WU/s nudge publish the SAME dp/deltaV. Every presentation channel
// must therefore read the receipt's pre-solve closing speed, or the ram is erased. This
// fixture fires the two contacts — identical bodies, identical clamped receipt, only the
// closing speed differs — and asserts each channel's answer differs by a real ratio.
//
// Channels: hit-stop, camera trauma, directed camera kick, contact light, spall (moved mass),
// sound (pitch bend, loudness, recipe tier). Damage numbers are NOT the answer and are never
// asserted here.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { feel, resolveCollisionFeel } from '../src/render/feel.js';
import { resolveCollisionCue } from '../src/audio/audioSystem.js';
import { resolveCollisionConsequence } from '../src/combat/impulseKernel.js';
import {
  collisionImpactLight,
  collisionImpactMagnitude,
} from '../src/render/combat/collisionImpactScale.js';

const SEEDS = [4242, 8008];
const NUDGE = 40;   // WU/s closing — mid knock
const SLAM = 150;   // WU/s closing — the reference slam
const HULL_MASS = 24;
const CLAMPED_DP = HULL_MASS * 40;  // what the solver reports for BOTH contacts

// The consequence receipt the two contacts produce: identical except preSolveClosingSpeed.
function receipt(closingSpeed) {
  return {
    target: { id: 7, type: 'ship', mass: HULL_MASS },
    other: { id: 9, type: 'ship', mass: 60 },
    exchangedMomentum: CLAMPED_DP,
    tick: 120,
    provenance: { actorId: 1, weaponId: null, tag: 'massline', appliedTick: 120 },
    pos: { x: 40, z: 0 },
    normal: { x: -1, z: 0 },
    preSolveClosingSpeed: closingSpeed,
  };
}

function physicsImpact(closingSpeed) {
  return {
    consequenceKernelVersion: 1,
    backend: 'rapier-dynamic',
    tick: 120,
    aId: 1,
    bId: 2,
    dp: CLAMPED_DP,
    impulse: CLAMPED_DP,
    playerInvolved: true,
    playerDeltaV: 40,
    preSolveClosingSpeed: closingSpeed,
    pos: { x: 40, z: 0 },
  };
}

function feelHost() {
  const traumas = [];
  const kicks = [];
  const state = {
    tick: 120,
    simTime: 2,
    mode: 'flight',
    playerId: 1,
    settings: { video: { motionReduce: false } },
    ui: { screenStack: [], docked: false },
    entities: new Map([
      [1, { id: 1, type: 'ship', mass: HULL_MASS, pos: { x: 0, z: 0 } }],
      [2, { id: 2, type: 'ship', mass: 60, pos: { x: 40, z: 0 } }],
    ]),
    render: {
      cameraCtrl: {
        addTrauma: (v) => traumas.push(v),
        impactKick: (x, z, wu) => kicks.push(wu),
      },
    },
    rng: () => { throw new Error('presentation must not consume sim RNG'); },
  };
  const bus = createBus();
  const host = Object.create(feel);
  host._injectStyle = () => {};
  host._mountVignette = () => {};
  host._ensureVignette = () => null;
  host._updateSpeedLines = () => {};
  host.init({ state, bus, timeEffects: createTimeEffects(state) });
  return { state, bus, host, traumas, kicks, frame: (dt = 0) => host.frame(dt, state) };
}

for (const seed of SEEDS) {
  test(`seed ${seed}: every impact channel separates the ${NUDGE} WU/s nudge from the ${SLAM} WU/s slam`, () => {
    const nudgeFeel = resolveCollisionFeel({ pos: { x: 40, z: 0 } }, {
      mode: 'flight', playerDistance: 0, deltaV: NUDGE, feelDeltaV: NUDGE,
      momentum: CLAMPED_DP,
    });
    const slamFeel = resolveCollisionFeel({ pos: { x: 40, z: 0 } }, {
      mode: 'flight', playerDistance: 0, deltaV: NUDGE, feelDeltaV: SLAM,
      momentum: CLAMPED_DP,
    });
    const nudgeReceipt = resolveCollisionConsequence(receipt(NUDGE));
    const slamReceipt = resolveCollisionConsequence(receipt(SLAM));
    const nudgeCue = resolveCollisionCue({
      massA: HULL_MASS, typeA: 'ship', massB: 60, typeB: 'ship',
      dp: CLAMPED_DP, closingSpeed: NUDGE,
    });
    const slamCue = resolveCollisionCue({
      massA: HULL_MASS, typeA: 'ship', massB: 60, typeB: 'ship',
      dp: CLAMPED_DP, closingSpeed: SLAM,
    });

    const table = [
      ['hit-stop (s)', nudgeFeel.hsDur, slamFeel.hsDur],
      ['camera trauma', nudgeFeel.trauma, slamFeel.trauma],
      ['vfx magnitude', collisionImpactMagnitude(nudgeReceipt), collisionImpactMagnitude(slamReceipt)],
      ['light intensity', collisionImpactLight(nudgeReceipt).intensity, collisionImpactLight(slamReceipt).intensity],
      ['light range', collisionImpactLight(nudgeReceipt).range, collisionImpactLight(slamReceipt).range],
      ['spall count', nudgeReceipt.debrisCount, slamReceipt.debrisCount],
      ['audio gain', nudgeCue.gain, slamCue.gain],
      ['audio rate', nudgeCue.rate, slamCue.rate],
    ];
    console.log(`[B5 channel spread] seed=${seed} — same bodies, same clamped receipt ${CLAMPED_DP} dp`);
    console.log('channel            nudge(40)   slam(150)   ratio');
    for (const [name, n, s] of table) {
      console.log(`${name.padEnd(18)} ${String(n.toFixed(3)).padStart(9)}   ${String(s.toFixed(3)).padStart(9)}   ${(s / n).toFixed(2)}x`);
    }

    // Headline channels: >= 2x separation.
    assert.ok(slamFeel.trauma / nudgeFeel.trauma >= 1.8, 'trauma');
    assert.equal(collisionImpactMagnitude(nudgeReceipt), nudgeFeel.trauma);
    assert.equal(collisionImpactMagnitude(slamReceipt), slamFeel.trauma);
    assert.ok(collisionImpactMagnitude(slamReceipt) / collisionImpactMagnitude(nudgeReceipt) >= 1.8, 'vfx magnitude');
    assert.ok(collisionImpactLight(slamReceipt).intensity / collisionImpactLight(nudgeReceipt).intensity >= 1.8, 'light');
    assert.ok(collisionImpactLight(slamReceipt).range / collisionImpactLight(nudgeReceipt).range >= 2, 'light range');
    assert.ok(slamReceipt.debrisCount / Math.max(1, nudgeReceipt.debrisCount) >= 2, 'spall');
    assert.ok(slamCue.gain / nudgeCue.gain >= 2, 'sound volume');

    // Secondary channels: strictly separated by a real margin.
    assert.ok(slamFeel.hsDur / nudgeFeel.hsDur >= 1.5, 'hit-stop');
    assert.ok(nudgeCue.rate / slamCue.rate >= 1.5, 'sound pitch bends down with force');
    assert.notEqual(nudgeFeel.id, slamFeel.id, 'feel recipe tier: knock vs slam');
  });

  test(`seed ${seed}: the live physics:impact beat separates kick and hit-stop on the pre-solve axis`, () => {
    const answers = [NUDGE, SLAM].map((speed) => {
      const { bus, host, traumas, kicks, frame } = feelHost();
      bus.emit('physics:impact', physicsImpact(speed));
      frame();
      return { trauma: traumas[0], hsDur: host._hsTimer, kickWu: kicks[0] };
    });
    const [nudge, slam] = answers;
    console.log(`[B5 live kick] seed=${seed} nudge kick ${nudge.kickWu.toFixed(2)} WU -> slam kick ${slam.kickWu.toFixed(2)} WU`);
    assert.ok(slam.kickWu / nudge.kickWu >= 2,
      `the directed kick must buy with the pre-solve exchange, got ${nudge.kickWu} vs ${slam.kickWu}`);
    assert.ok(slam.trauma > nudge.trauma, 'trauma rises through the live bus');
    assert.ok(slam.hsDur > nudge.hsDur, 'hit-stop rises through the live bus');
  });
}
