// Shockwave sweep (hull-burst overhaul family, `combat.tumbleFling`): the traveling front
// that re-pushes loose bodies as it overtakes them, and the force threshold that grades
// each shove into tumble / wobble / silence. Pure law tests plus a live bombs-system
// integration pass; the wreck impact-split admission law is exercised on the same harness.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bombScenario } from './helpers/bombScenario.mjs';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { readRecentImpulseProvenance } from '../src/combat/impulseKernel.js';
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
  const sweep = createShockwaveSweep({ bombId: 9, x: 0, z: 0, blastRadius: 130, passImpulseWu: 300 });
  // One front position per read, like the sim's per-tick pass. Small bodies pin the
  // area coupling at its 0.2 floor, keeping the grade far under the saturation cap.
  const front = 34; // just past the light and heavy bodies (30/25 WU + radius)
  const life = (d) => Math.pow(1 - d / sweep.maxRadius, SHOCKWAVE_SWEEP_LAW.lifeCurve);
  const area = (r) => Math.min(SHOCKWAVE_SWEEP_LAW.areaFactorMax,
    Math.max(SHOCKWAVE_SWEEP_LAW.areaFactorMin, (r / SHOCKWAVE_SWEEP_LAW.waveRefRadius) ** 2));
  // Light body: 300·18·0.2·life(28)/16 ≈ 58 WU/s — a tumble kick.
  const light = body(101, { pos: { x: 30, z: 0 }, radius: 2 });
  const kick = resolveSweepPass(sweep, light, front);
  assert.ok(kick, 'light body inside the front is passed');
  assert.equal(kick.level, 'tumble');
  near(kick.deltaV, 300 * SHOCKWAVE_SWEEP_LAW.waveAreaGain * area(2) * life(28) / 16);
  assert.equal(kick.dirX, 1, 'push reads outward along the radial');
  near(kick.dirZ, 0);
  near(kick.contact.x, 30 - 2, 1e-9);
  // Spin obeys ω = spinPerDeltaV·ΔV·2·lever/R, clamped, and the parity biases sign it.
  const expectedSpin = Math.max(-SHOCKWAVE_SWEEP_LAW.maxSpinRadPerS, Math.min(
    SHOCKWAVE_SWEEP_LAW.maxSpinRadPerS,
    SHOCKWAVE_SWEEP_LAW.spinPerDeltaV * kick.deltaV * 2 * kick.lever / light.radius,
  ));
  near(kick.spinYaw, expectedSpin);

  // Heavy body: ~15.9 WU/s at the area floor vs 60 mass — a wobble, never a tumble.
  const heavy = body(103, { mass: 110, radius: 2, pos: { x: 0, z: 25 } });
  const wobble = resolveSweepPass(sweep, heavy, front);
  assert.ok(wobble);
  assert.equal(wobble.level, 'wobble');

  // Very heavy body: ~2.2 WU/s at its own front — below the wobble floor, and
  // permanently passed.
  const massif = body(105, { mass: 400, radius: 2, pos: { x: 0, z: 40 } });
  assert.equal(resolveSweepPass(sweep, massif, 60), null);
  assert.equal(resolveSweepPass(sweep, massif, sweep.maxRadius), null, 'a sub-wobble body is not re-read');

  // THE review-blocking case: a real field rock (mass 400, radius 8) near a concussion
  // blast must visibly tumble — the area coupling is what gives the wave purchase on
  // heavy, large-section matter.
  const fieldRock = body(106, { mass: 400, radius: 8, pos: { x: 28, z: 0 } });
  const rockKick = resolveSweepPass(createShockwaveSweep({ bombId: 12, x: 0, z: 0, blastRadius: 130, passImpulseWu: 300 }), fieldRock, 40);
  assert.equal(rockKick.level, 'tumble', 'a mass-400 radius-8 rock near the blast tumbles');
  near(rockKick.deltaV, 300 * SHOCKWAVE_SWEEP_LAW.waveAreaGain * area(8) * life(20) / 400, 1e-9);

  // A body the front has not reached yet is untouched and unmarked.
  const far = body(107, { pos: { x: 400, z: 0 } });
  assert.equal(resolveSweepPass(createShockwaveSweep({ bombId: 10, x: 0, z: 0, blastRadius: 130, passImpulseWu: 300 }), far, 20), null);
});

test('the wave inherits the payload impulse: zero-impulse payloads birth no wave, the shove saturates', () => {
  // A "does not blast on arrival" payload carries no momentum budget: every body is
  // silently passed, no matter how light.
  const quiet = createShockwaveSweep({ bombId: 21, x: 0, z: 0, blastRadius: 130, passImpulseWu: 0 });
  const rock = body(109, { pos: { x: 10, z: 0 }, mass: 2 });
  assert.equal(resolveSweepPass(quiet, rock, 20), null);
  assert.equal(resolveSweepPass(quiet, rock, 20), null, 'marked passed even with no wave');
  // A paper-mass chip cannot be flung past cruise: the graded shove saturates and the
  // denominator has a floor, but a saturating hit on light debris is still tumble-class.
  const chip = body(111, { pos: { x: 6, z: 0 }, mass: 0.3, radius: 2 });
  const sweep = createShockwaveSweep({ bombId: 22, x: 0, z: 0, blastRadius: 130, passImpulseWu: 300 });
  const shove = resolveSweepPass(sweep, chip, 10);
  assert.equal(shove.level, 'tumble');
  assert.equal(shove.deltaV, SHOCKWAVE_SWEEP_LAW.maxPassDeltaV, 'the shove saturates at the law cap');
});

test('the lever bias takes both signs across the id space (a volley tumbles both ways)', () => {
  const seen = new Set();
  for (let id = 1; id <= 40; id++) {
    const sweep = createShockwaveSweep({ bombId: 1000 + id, x: 0, z: 0, blastRadius: 130, passImpulseWu: 600 });
    const kick = resolveSweepPass(sweep, body(id, { pos: { x: 12, z: 0 }, mass: 16 }), 12);
    if (kick && kick.level === 'tumble') seen.add(kick.lever);
  }
  assert.ok(seen.has(1) && seen.has(-1), `both spin flanks occur, saw: ${[...seen].join(',')}`);
});

test('pass receipts are deterministic and renderer-safe (frozen, complete)', () => {
  const make = () => {
    const sweep = createShockwaveSweep({ bombId: 11, ownerId: 5, weaponId: 'bomb_concussion', x: 0, z: 0, blastRadius: 130, passImpulseWu: 300 });
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
      assert.equal(passes.find((p) => p.targetId === junk.id).level, 'tumble',
        'the wreck is light for its radius (area coupling): the wave tumbles it too');
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

test('a sector transition or save load retires live fronts (stale coordinates never push)', () => {
  withTumbleFling(true, () => {
    const t = bombScenario();
    try {
      t.spawn({ type: 'asteroid', mass: 16, radius: 8, pos: { x: -40, z: 0 } });
      t.drop('bomb_concussion');
      t.tick(31);
      t.system.commandDetonate(t.player.id);
      t.tick(3); // warning resolves; a front is live
      t.bus.emit('save:loaded');
      const before = t.impulses.filter((r) => r.reason === 'shockwave_sweep').length;
      t.tick(60);
      assert.equal(t.impulses.filter((r) => r.reason === 'shockwave_sweep').length, before,
        'no body is pushed by a front that outlived its world');
    } finally { t.close(); }
  });
});

test('a refused sweep impulse still reaches physics authority but writes no provenance', () => {
  withTumbleFling(true, () => {
    const t = bombScenario({ acceptImpulse: false });
    try {
      const rock = t.spawn({ type: 'asteroid', mass: 16, radius: 8, pos: { x: -40, z: 0 } });
      t.drop('bomb_concussion');
      t.tick(31);
      t.system.commandDetonate(t.player.id);
      t.tick(30);
      const hits = t.impulses.filter((r) => r.entityId === rock.id && r.reason === 'shockwave_sweep');
      assert.ok(hits.length >= 1, 'the pass attempt reached physics authority');
      assert.equal(readRecentImpulseProvenance(rock, t.state.tick), null,
        'a refused push leaves no kill-credit record on the body');
    } finally { t.close(); }
  });
});

test('the singularity opening births no wave; its collapse does', () => {
  withTumbleFling(true, () => {
    const t = bombScenario();
    try {
      const cues = [];
      const passes = [];
      t.bus.on('presentation:vfxCue', (p) => { if (p.id === 'combat.shockwaveSweep') cues.push(p); });
      t.bus.on('combat:shockwavePass', (p) => passes.push(p));
      t.spawn({ type: 'asteroid', mass: 400, radius: 8, pos: { x: -40, z: 0 } });
      const bomb = t.drop('bomb_singularity');
      t.tick(31);
      t.system.commandDetonate(t.player.id);
      t.tick(6);
      assert.equal(cues.length, 0, 'impulse-0 opening: no wave, no ring');
      // The field decays for 2.8 s, then the collapse detonation fires with its authored
      // collapseImpulse — the only live wave this payload ever births.
      t.tick(240);
      assert.equal(t.events('detonated').filter((p) => p.trigger === 'collapse').length, 1, 'the collapse fired');
      assert.equal(cues.length, 1, 'the collapse births exactly one wave');
      assert.ok(passes.length >= 1, 'the collapse front answered the nearby rock');
    } finally { t.close(); }
  });
});

test('the live cap evicts only for a NEW bomb and never for a zero-impulse one', () => {
  withTumbleFling(true, () => {
    const t = bombScenario();
    try {
      const def = { id: 'bomb_concussion', radius: 130, impulse: 1800 };
      const gooDef = { id: 'bomb_goo', radius: 120, impulse: 0 };
      const sweepAt = (i) => t.system._spawnSweep(
        { id: 9000 + i, data: { ownerId: 1 } }, i === 99 ? gooDef : def,
        { x: i * 10, z: 0 }, t.state,
      );
      for (let i = 0; i < 4; i++) sweepAt(i);
      assert.equal(t.system._sweeps.length, 4);
      const oldestId = t.system._sweeps[0].bombId;
      sweepAt(4);
      assert.equal(t.system._sweeps.length, 4, 'the cap holds');
      assert.ok(!t.system._sweeps.some((s) => s.bombId === oldestId), 'the oldest front made room');
      // A re-detonation replaces in place: nothing else is evicted.
      const before = t.system._sweeps.map((s) => s.bombId);
      sweepAt(2);
      assert.equal(t.system._sweeps.length, 4);
      assert.deepEqual(t.system._sweeps.map((s) => s.bombId), before, 'replacement never evicts');
      // A zero-impulse payload at a full cap births nothing and evicts nothing.
      sweepAt(99);
      assert.equal(t.system._sweeps.length, 4);
      assert.deepEqual(t.system._sweeps.map((s) => s.bombId), before);
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
