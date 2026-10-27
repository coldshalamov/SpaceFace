import assert from 'node:assert/strict';
import test from 'node:test';

import { queuePhysicsImpulse, writePhysicsControl } from '../src/core/physicsAuthority.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { SIM_TIER } from '../src/world/activityClassification.js';

const DT = 1 / 60;

// Dormant-tier dynamic body: exactly the population the island-sleep machinery exists for.
// No player/projectile flag, no job pin, noInterp off → created with setCanSleep(true).
function dormantRock(id, x) {
  return {
    id, occupantGeneration: 1, type: 'asteroid', alive: true,
    radius: 8, mass: 400,
    pos: { x, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    flags: {}, data: {},
    activity: { simTier: SIM_TIER.S3_DORMANT, pinnedExact: false },
    physicsBody: {
      schemaVersion: 1, radius: 8, mass: 400, inertiaY: 12800,
      dynamic: true, ccd: false, revision: 0,
    },
  };
}

test('D191: idle can-sleep bodies actually reach island sleep and stay asleep', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    const rock = dormantRock(1, 0);
    const entities = [rock];
    owner.syncFromEntities(entities);
    owner.step(DT, 0); // _sleepAllowed is initialized inside the first fixed step
    const rec = owner.records.get(rock.id);
    assert.equal(rec._sleepAllowed, true, 'a dormant rock is sleep-eligible');

    // Contract coverage for the narrowed reset path: sleep onset, persistence, and the
    // wake/skip boundary must all survive skipping the reset on clean records.
    let sleptTick = -1;
    for (let t = 1; t < 600 && sleptTick < 0; t++) {
      owner.step(DT, t);
      if (rec.body.isSleeping()) sleptTick = t;
    }
    assert.ok(sleptTick >= 0, 'an idle sleep-eligible body must fall asleep');
    assert.equal(rock.physicsSleeping, true, 'the entity mirrors the native island verdict');

    // Plain idle ticks must never wake it again.
    for (let t = sleptTick + 1; t < sleptTick + 61; t++) owner.step(DT, t);
    assert.equal(rec.body.isSleeping(), true, 'idle steps do not restart the sleep timer');

    // A stale user-force accumulator sitting on a sleeping body is inert bookkeeping:
    // the deferred clear must not wake it (the flag survives until the body is awake
    // and reaches the reset line again).
    rec.body.addForce({ x: 40, y: 0, z: 0 }, false);
    rec._forcesDirty = true;
    owner.step(DT, sleptTick + 62);
    assert.equal(rec.body.isSleeping(), true, 'pending accumulator clearing never wakes');

    // A real commanded force does wake it — and the reset that runs first clears the
    // injected stale force before the new command applies, so exactly one force acts.
    writePhysicsControl(rock, { force: { x: 480, z: 0 }, maxSpeed: 100 });
    owner.step(DT, sleptTick + 63);
    assert.equal(rec.body.isSleeping(), false, 'a new control force wakes the body');
    if (typeof rec.body.userForce === 'function') {
      assert.ok(Math.abs(rec.body.userForce().x - 480) < 1e-6,
        'the reset cleared the stale accumulator before the new force applied');
    }
    for (let t = sleptTick + 64; t < sleptTick + 70; t++) owner.step(DT, t);
    assert.ok(rock.vel.x > 0.01 && rock.pos.x > 0, 'the commanded force integrates');

    // Re-sleep directly, then a queued impulse wakes it the same way.
    rec.body.sleep();
    assert.equal(rec.body.isSleeping(), true);
    queuePhysicsImpulse(rock, { x: 240, z: 0 });
    owner.step(DT, sleptTick + 71);
    assert.equal(rec.body.isSleeping(), false, 'a queued impulse wakes the body');
    assert.ok(Number.isFinite(rock.pos.x) && Number.isFinite(rock.vel.x));
  } finally { owner.dispose(); }
});

test('D191: force reset clears accumulators without waking a sleeping body', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    const rock = dormantRock(1, 0);
    const entities = [rock];
    owner.syncFromEntities(entities);
    const rec = owner.records.get(rock.id);
    owner.step(DT, 0);
    rec.body.sleep();
    assert.equal(rec.body.isSleeping(), true);

    // Native semantics the fix relies on: clearing with wake=false leaves the island
    // asleep, and the accumulator is actually emptied (not merely flagged).
    if (typeof rec.body.userForce === 'function') {
      rec.body.addForce({ x: 40, y: 0, z: 0 }, false);
      rec.body.resetForces(false);
      assert.equal(rec.body.isSleeping(), true, 'resetForces(false) does not wake');
      assert.ok(Math.abs(rec.body.userForce().x) < 1e-9, 'the accumulator is cleared');
    }

    // The owner's production path: put the body to sleep, keep it asleep through
    // ordinary idle stepping.
    rec.body.sleep();
    owner.step(DT, 1);
    assert.equal(rec.body.isSleeping(), true, 'owner stepping preserves sleep');
  } finally { owner.dispose(); }
});

test('D191: clean accumulators no longer pay two WASM resets per eligible record per tick', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    const rock = dormantRock(1, 0);
    const entities = [rock];
    owner.syncFromEntities(entities);
    owner.step(DT, 0); // first step clears the post-creation _forcesDirty marker
    const rec = owner.records.get(rock.id);
    let resets = 0;
    const resetForces = rec.body.resetForces.bind(rec.body);
    const resetTorques = rec.body.resetTorques.bind(rec.body);
    rec.body.resetForces = wake => { resets++; return resetForces(wake); };
    rec.body.resetTorques = wake => { resets++; return resetTorques(wake); };

    // Old code called both every tick for every sleep-eligible body; the narrowed check
    // only calls them when a real addForce/addTorque landed since the last reset.
    for (let t = 1; t <= 60; t++) owner.step(DT, t);
    assert.equal(resets, 0, 'an idle body with zeroed accumulators performs zero resets');

    // A real force write re-arms exactly one clear on the following tick.
    writePhysicsControl(rock, { force: { x: 480, z: 0 }, maxSpeed: 100 });
    owner.step(DT, 61);
    owner.step(DT, 62);
    assert.equal(resets, 2, 'a dirtied accumulator is cleared exactly once');
  } finally { owner.dispose(); }
});
