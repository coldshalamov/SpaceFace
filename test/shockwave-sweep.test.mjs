// Shockwave sweep (hull-burst overhaul family, `combat.tumbleFling`): the traveling front
// that re-pushes loose bodies as it overtakes them, and the force threshold that grades
// each shove into tumble / wobble / silence. Pure law tests plus a live bombs-system
// integration pass; the wreck impact-split admission law is exercised on the same harness.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bombScenario } from './helpers/bombScenario.mjs';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import {
  SHOCKWAVE_SWEEP_LAW,
  advanceSweepFront,
  createShockwaveSweep,
  resolveSweepPass,
} from '../src/combat/shockwaveSweep.js';
import { aftermathWrecks } from '../src/systems/aftermathWrecks.js';

const DT = 1 / 60;
function near(a, b, tolerance = 1e-9) { assert.ok(Math.abs(a - b) <= tolerance, `${a} ≈ ${b}`); }

function withTumbleFling(value, run) {
  const prev = COMBAT_FLAGS.tumbleFling;
  COMBAT_FLAGS.tumbleFling = value;
  try { run(); } finally { COMBAT_FLAGS.tumbleFling = prev; }
}

function body(id, spec = {}) {
  return {
    id,
    alive: true,
    type: 'asteroid',
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 8,
    mass: 16,
    ...spec,
  };
}

test('the sweep front advances at the wave speed and spends itself at max radius', () => {
  const sweep = createShockwaveSweep({ bombId: 7, x: 10, z: -10, blastRadius: 130 });
  assert.ok(sweep);
  near(sweep.maxRadius, 130 * SHOCKWAVE_SWEEP_LAW.maxRadiusFrac);
  const first = advanceSweepFront(sweep, DT);
  assert.ok(first.alive);
  near(first.prevRadius, 0);
  near(first.radius, SHOCKWAVE_SWEEP_LAW.waveSpeedWuPerS * DT);
  let guard = 0;
  while (advanceSweepFront(sweep, DT).alive && guard++ < 600) { /* sweep to the end */ }
  assert.ok(guard < 600, 'front retires on its own');
  near(sweep.frontRadius, sweep.maxRadius);
});

test('sweep creation is degenerate-safe and a replacement front resets in place', () => {
  assert.equal(createShockwaveSweep({ bombId: 1, blastRadius: 0 }), null);
  assert.equal(createShockwaveSweep({ bombId: 1, blastRadius: -5 }), null);
  const sweep = createShockwaveSweep({ bombId: 3, x: 0, z: 0, blastRadius: 100 });
  advanceSweepFront(sweep, 0.5);
  sweep.passed.add(11);
  const replaced = createShockwaveSweep({
    bombId: 3, x: 5, z: 5, blastRadius: 150, existing: sweep,
  });
  assert.equal(replaced, sweep, 'one sweep per bomb: the collapse reuses the record');
  near(sweep.frontRadius, 0);
  assert.equal(sweep.passed.size, 0);
  near(sweep.maxRadius, 150 * SHOCKWAVE_SWEEP_LAW.maxRadiusFrac);
  const foreign = createShockwaveSweep({ bombId: 4, x: 0, z: 0, blastRadius: 100, existing: sweep });
  assert.ok(foreign && foreign !== sweep, 'a different bomb mints its own front');
  near(sweep.frontRadius, 0, 1e-9);
  near(sweep.maxRadius, 150 * SHOCKWAVE_SWEEP_LAW.maxRadiusFrac, 1e-9);
});

test('the tumble threshold grades the wave shove: tumble, wobble, silence', () => {
  const sweep = createShockwaveSweep({ bombId: 9, x: 0, z: 0, blastRadius: 130 });
  // One front position per read, like the sim's per-tick pass.
  const front = 34; // just past the light and heavy bodies (30/25 WU + radius)
  // Light body: life = 1 - 34/145.6, so 300 * life / 16 ≈ 14.4 WU/s — a tumble kick.
  const light = body(101, { pos: { x: 30, z: 0 } });
  const kick = resolveSweepPass(sweep, light, front);
  assert.ok(kick, 'light body inside the front is passed');
  assert.equal(kick.level, 'tumble');
  near(kick.deltaV, SHOCKWAVE_SWEEP_LAW.passImpulseWu * (1 - front / sweep.maxRadius) / 16);
  assert.equal(kick.dirX, 1, 'push reads outward along the radial');
  near(kick.dirZ, 0);
  near(kick.contact.x, 30 - 8, 1e-9);
  // Spin obeys ω = spinPerDeltaV·ΔV·2·lever/R, clamped, and the parity bias signs it.
  const expectedSpin = Math.max(-SHOCKWAVE_SWEEP_LAW.maxSpinRadPerS, Math.min(
    SHOCKWAVE_SWEEP_LAW.maxSpinRadPerS,
    SHOCKWAVE_SWEEP_LAW.spinPerDeltaV * kick.deltaV * 2 * kick.lever / 8,
  ));
  near(kick.spinYaw, expectedSpin);

  // Heavy body: 300 / 60 = 5 WU/s — a wobble, never a tumble.
  const heavy = body(103, { mass: 60, pos: { x: 0, z: 25 } });
  const wobble = resolveSweepPass(sweep, heavy, front);
  assert.ok(wobble);
  assert.equal(wobble.level, 'wobble');

  // Very heavy body: ~300 * 0.59 / 200 ≈ 0.9 WU/s at its own front — below the wobble
  // floor, and permanently passed.
  const massif = body(105, { mass: 200, pos: { x: 0, z: 40 } });
  assert.equal(resolveSweepPass(sweep, massif, 60), null);
  assert.equal(resolveSweepPass(sweep, massif, sweep.maxRadius), null, 'a sub-wobble body is not re-read');

  // A body the front has not reached yet is untouched and unmarked.
  const far = body(107, { pos: { x: 400, z: 0 } });
  assert.equal(resolveSweepPass(createShockwaveSweep({ bombId: 10, x: 0, z: 0, blastRadius: 130 }), far, 20), null);
});

test('pass receipts are deterministic and renderer-safe (frozen, complete)', () => {
  const make = () => {
    const sweep = createShockwaveSweep({ bombId: 11, ownerId: 5, weaponId: 'bomb_concussion', x: 0, z: 0, blastRadius: 130 });
    return resolveSweepPass(sweep, body(77, { pos: { x: 20, z: 12 } }), 34);
  };
  const a = make();
  const b = make();
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  assert.ok(Object.isFrozen(a));
  for (const key of ['schemaVersion', 'bombId', 'ownerId', 'weaponId', 'targetId', 'level', 'deltaV', 'dirX', 'dirZ', 'lever', 'spinYaw', 'frontRadius', 'contact']) {
    assert.ok(key in a, `receipt carries ${key}`);
  }
});

test('a detonation sweeps the field: nearest loose body answered first, craft untouched', () => {
  withTumbleFling(true, () => {
    const t = bombScenario();
    try {
      const passes = [];
      const cues = [];
      t.bus.on('combat:shockwavePass', (p) => passes.push(p));
      t.bus.on('presentation:vfxCue', (p) => { if (p.id === 'combat.shockwaveSweep') cues.push(p); });
      // Loose matter on the bomb's side of the player, at two distances. Real wreck
      // entities always carry a data block — the harness must author one too.
      const rock = t.spawn({ type: 'asteroid', mass: 16, radius: 8, pos: { x: -40, z: 0 } });
      const junk = t.spawn({ type: 'wreck', mass: 40, radius: 6, pos: { x: -100, z: 0 }, data: { kind: 'wreck' } });
      const bomb = t.drop('bomb_concussion');
      t.tick(31);
      t.system.commandDetonate(t.player.id);
      // The command primes; the warning phase resolves into the real detonation a few
      // ticks later — the wave (and its cue) exist only once the front is born.
      t.tick(40);
      assert.equal(t.events('detonated').length, 1, 'the bomb detonated');
      assert.equal(cues.length, 1, 'the wave announces itself');
      assert.ok(passes.length >= 2, 'both loose bodies were overtaken');
      const rockIdx = passes.findIndex((p) => p.targetId === rock.id);
      const junkIdx = passes.findIndex((p) => p.targetId === junk.id);
      assert.ok(rockIdx >= 0 && junkIdx >= 0, 'rock and wreck both answered');
      assert.ok(rockIdx < junkIdx, 'the wave arrives nearest first');
      assert.equal(passes.find((p) => p.targetId === rock.id).level, 'tumble');
      assert.equal(passes.find((p) => p.targetId === junk.id).level, 'wobble');
      // The front's momentum is real: dynamic loose bodies take a shockwave_sweep impulse.
      const sweepImpulses = t.impulses.filter((r) => r.reason === 'shockwave_sweep');
      const targets = new Set(sweepImpulses.map((r) => r.entityId));
      assert.ok(targets.has(rock.id) && targets.has(junk.id), 'dynamic loose bodies are pushed by the front');
      assert.equal(sweepImpulses.find((r) => r.entityId === rock.id).provenance.tag, 'bomb_shockwave');
      assert.ok(!targets.has(t.player.id), 'craft keep their tuned instant-shove economy');
      assert.ok(bomb.data.phase === 'spent' || bomb.data.phase === 'field' || bomb.alive === false);
      // The front retires: no further passes after its lifetime.
      const count = passes.length;
      t.tick(80);
      assert.equal(passes.length, count, 'the wave ends');
    } finally { t.close(); }
  });
});

test('with tumbleFling off (the frozen 47-A profile) no wave exists at all', () => {
  withTumbleFling(false, () => {
    const t = bombScenario();
    try {
      const passes = [];
      t.bus.on('combat:shockwavePass', (p) => passes.push(p));
      t.spawn({ type: 'asteroid', mass: 16, radius: 8, pos: { x: -40, z: 0 } });
      t.drop('bomb_concussion');
      t.tick(31);
      t.system.commandDetonate(t.player.id);
      t.tick(40);
      assert.equal(passes.length, 0);
      assert.equal(t.impulses.filter((r) => r.reason === 'shockwave_sweep').length, 0);
    } finally { t.close(); }
  });
});

function wreckSplitHarness() {
  const t = bombScenario();
  const wreckSystem = Object.create(aftermathWrecks);
  wreckSystem.init({ state: t.state, bus: t.bus, helpers: t.helpers, registry: { get: () => null } });
  return { t, wreckSystem };
}

function wreckChips(state) {
  return (state.entityList || []).filter((e) => e && e.type === 'wreck' && e.data && e.data.collisionTearOff);
}

test('a wreck hitting hard sheds chips; cooldown, lifetime cap and the mass floor hold', () => {
  withTumbleFling(true, () => {
    const { t, wreckSystem } = wreckSplitHarness();
    try {
      const rock = t.spawn({ type: 'asteroid', mass: 500, radius: 20, pos: { x: 60, z: 0 } });
      const wreck = t.spawn({ type: 'wreck', mass: 40, radius: 7, pos: { x: 0, z: 0 }, data: { kind: 'wreck' } });
      const emit = (dp) => t.bus.emit('physics:impact', {
        aId: wreck.id, bId: rock.id, dp, impulse: dp, normal: { x: 1, z: 0 }, pos: { x: 30, z: 0 },
      });
      // 1200 / 40 = 30 WU/s: tumble-class force, one chip.
      emit(1200);
      assert.equal(wreckChips(t.state).length, 1);
      // Cooldown: an immediate second slam sheds nothing.
      emit(1200);
      assert.equal(wreckChips(t.state).length, 1);
      // Heavy class: >= 34 WU/s after the cooldown, two chips.
      t.state.tick += 70;
      t.state.simTime += 70 * DT;
      emit(1600);
      assert.equal(wreckChips(t.state).length, 3, 'heavy slam sheds two chips');
      // Lifetime cap: this wreck is done shedding.
      t.state.tick += 70;
      t.state.simTime += 70 * DT;
      emit(1600);
      assert.equal(wreckChips(t.state).length, 3);
      // Sub-threshold force never sheds, and a feather-mass wreck never sheds at all.
      emit(120);
      assert.equal(wreckChips(t.state).length, 3);
      const feather = t.spawn({ type: 'wreck', mass: 1, radius: 3, pos: { x: -50, z: 0 } });
      t.bus.emit('physics:impact', { aId: feather.id, bId: rock.id, dp: 400, impulse: 400, normal: { x: -1, z: 0 }, pos: { x: -25, z: 0 } });
      assert.equal(wreckChips(t.state).length, 3);
      // Chips inherit the wreck's world line plus a fling: they are real dynamic debris.
      const chip = wreckChips(t.state)[0];
      assert.equal(chip.data.collisionTearOffOf, wreck.id);
      assert.ok(chip.physicsBody && chip.physicsBody.dynamic !== false);
    } finally {
      wreckSystem.destroy();
      t.close();
    }
  });
});

test('with tumbleFling off a hard wreck impact sheds nothing (47-A goldens hold)', () => {
  withTumbleFling(false, () => {
    const { t, wreckSystem } = wreckSplitHarness();
    try {
      const rock = t.spawn({ type: 'asteroid', mass: 500, radius: 20, pos: { x: 60, z: 0 } });
      const wreck = t.spawn({ type: 'wreck', mass: 40, radius: 7, pos: { x: 0, z: 0 } });
      t.bus.emit('physics:impact', { aId: wreck.id, bId: rock.id, dp: 1200, impulse: 1200, normal: { x: 1, z: 0 }, pos: { x: 30, z: 0 } });
      assert.equal(wreckChips(t.state).length, 0);
    } finally {
      wreckSystem.destroy();
      t.close();
    }
  });
});
