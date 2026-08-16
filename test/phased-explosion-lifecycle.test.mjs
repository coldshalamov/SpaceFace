import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EXPLOSION_CAUSE_SCHEDULES,
  EXPLOSION_STYLE_IDS,
  EXPLOSION_STYLE_SCHEDULES,
  explosionPattern01,
  explosionPatternSigned,
  explosionScheduleFor,
  normalizeExplosionStyle,
  PhasedExplosionLifecycle,
  EXPLOSION_SCHEDULES,
} from '../src/render/combat/phasedExplosions.js';

test('explosion classes have distinct temporal structures and secondary pressure cues', () => {
  const signatures = Object.values(EXPLOSION_SCHEDULES).map((schedule) =>
    schedule.events.map((event) => `${event.phase}@${event.at}`).join('|'));
  assert.equal(new Set(signatures).size, signatures.length);
  for (const schedule of Object.values(EXPLOSION_SCHEDULES)) {
    assert.equal(schedule.events[0].phase, 'ignition');
    assert.ok(schedule.events.some((event) => event.phase === 'debris'));
    assert.ok(schedule.events.some((event) => event.phase === 'residue'));
    const pressure = schedule.events.find((event) => event.phase === 'pressure');
    const rupture = schedule.events.find((event) => event.phase === 'rupture');
    assert.ok(pressure.at >= rupture.at, 'pressure cue must follow the primary rupture');
  }
  const capitalPreRupture = EXPLOSION_SCHEDULES.capital.events
    .filter((event) => event.at < EXPLOSION_SCHEDULES.capital.events.find((event) => event.phase === 'rupture').at);
  assert.ok(capitalPreRupture.length >= 4,
    'capital destruction must propagate through several localized ignition and breakup stages');
  assert.ok(capitalPreRupture.some((event) => event.phase === 'breakup'),
    'capital structure must visibly break up before the main rupture');
});

test('authored explosion irregularity is repeatable without consuming simulation randomness', () => {
  const first = Array.from({ length: 8 }, (_, index) => explosionPattern01(17, 'rupture', index, 2));
  const replay = Array.from({ length: 8 }, (_, index) => explosionPattern01(17, 'rupture', index, 2));
  const nextEvent = Array.from({ length: 8 }, (_, index) => explosionPattern01(18, 'rupture', index, 2));
  assert.deepEqual(replay, first);
  assert.notDeepEqual(nextEvent, first);
  assert.ok(first.every((value) => value >= 0 && value < 1));
  assert.ok(Array.from({ length: 8 }, (_, index) => explosionPatternSigned(17, 'residue', index, 4))
    .every((value) => value >= -1 && value < 1));
});

test('bounded lifecycle emits each phase once and retires cleanly', () => {
  const lifecycle = new PhasedExplosionLifecycle({ capacity: 2 });
  const phases = [];
  lifecycle.start({ classId: 'ordinary', x: 4, z: 8, radius: 10, direction: { x: 1, z: 0 } });
  for (let i = 0; i < 40; i++) lifecycle.update(0.05, (phase, entry) => phases.push(`${phase}:${entry.classId}`));
  assert.equal(new Set(phases).size, phases.length);
  assert.deepEqual(phases, EXPLOSION_SCHEDULES.ordinary.events.map((event) => `${event.phase}:ordinary`));
  assert.equal(lifecycle.activeCount, 0);
});

test('five causal profiles have distinct frozen schedules while generic stays class-compatible', () => {
  const signatures = Object.entries(EXPLOSION_CAUSE_SCHEDULES).map(([cause, schedule]) => [
    cause,
    schedule.events.map((event) => `${event.phase}@${event.at}`).join('|'),
  ]);
  assert.equal(signatures.length, 5);
  assert.equal(new Set(signatures.map(([, signature]) => signature)).size, 5);
  assert.equal(explosionScheduleFor('ordinary', 'generic'), EXPLOSION_SCHEDULES.ordinary,
    'generic callers retain the exact accepted class schedule object');
  assert.equal(explosionScheduleFor('invalid', 'invalid'), EXPLOSION_SCHEDULES.small);
  assert.ok(Object.isFrozen(EXPLOSION_CAUSE_SCHEDULES));
  assert.ok(Object.values(EXPLOSION_CAUSE_SCHEDULES).every((schedule) => Object.isFrozen(schedule)));

  for (const cause of Object.keys(EXPLOSION_CAUSE_SCHEDULES)) {
    const lifecycle = new PhasedExplosionLifecycle({ capacity: 1 });
    const emitted = [];
    lifecycle.start({ classId: 'ordinary', cause });
    for (let i = 0; i < 80; i++) lifecycle.update(0.05, (phase) => emitted.push(phase));
    assert.deepEqual(emitted, explosionScheduleFor('ordinary', cause).events.map((event) => event.phase));
    for (const classId of ['small', 'ordinary', 'capital']) {
      const times = explosionScheduleFor(classId, cause).events.map((event) => event.at);
      assert.deepEqual(times, [...times].sort((a, b) => a - b), `${cause}/${classId} stays chronological`);
    }
  }
});

test('pool capacity remains bounded under dense combat', () => {
  const lifecycle = new PhasedExplosionLifecycle({ capacity: 3 });
  for (let i = 0; i < 12; i++) lifecycle.start({ classId: 'small', x: i, z: 0, radius: 3 });
  assert.equal(lifecycle.activeCount, 3);
  assert.equal(lifecycle.entries.length, 3);
});

test('invalid receipt numerics cannot poison the resident explosion pool', () => {
  const lifecycle = new PhasedExplosionLifecycle({ capacity: 1 });
  const entry = lifecycle.start({
    classId: 'ordinary',
    x: Infinity,
    z: Number.NaN,
    radius: Infinity,
    direction: { x: Infinity, z: Number.NaN },
  });
  assert.ok(Number.isFinite(entry.x));
  assert.ok(Number.isFinite(entry.z));
  assert.ok(Number.isFinite(entry.radius));
  assert.ok(Number.isFinite(entry.dirX));
  assert.ok(Number.isFinite(entry.dirZ));
  lifecycle.update(Infinity, () => {});
  assert.equal(entry.age, 0, 'non-finite frame deltas are ignored rather than corrupting lifecycle age');
});

test('style identity is carried separately and fails closed to ordinary', () => {
  assert.deepEqual([...EXPLOSION_STYLE_IDS], [
    'ordinary', 'terrain_smash', 'chain', 'well_collapse', 'burn_up',
  ]);
  assert.equal(normalizeExplosionStyle('terrain_smash'), 'terrain_smash');
  assert.equal(normalizeExplosionStyle('not-a-style'), 'ordinary');
  assert.equal(normalizeExplosionStyle(null), 'ordinary');
  assert.equal(normalizeExplosionStyle({ id: 'chain' }), 'ordinary');

  const signatures = EXPLOSION_STYLE_IDS.map((styleId) => [
    styleId,
    explosionScheduleFor('ordinary', 'generic', styleId).events
      .map((event) => `${event.phase}@${event.at}`).join('|'),
  ]);
  assert.equal(new Set(signatures.map(([, signature]) => signature)).size, 5);
  assert.equal(
    explosionScheduleFor('ordinary', 'generic', 'ordinary'),
    EXPLOSION_SCHEDULES.ordinary,
  );
  assert.equal(
    explosionScheduleFor('ordinary', 'terrain_collision', 'ordinary'),
    EXPLOSION_CAUSE_SCHEDULES.terrain_collision,
    'ordinary style keeps the legacy cause recipe',
  );
  assert.equal(
    explosionScheduleFor('ordinary', 'terrain_collision', 'terrain_smash'),
    EXPLOSION_STYLE_SCHEDULES.terrain_smash,
    'a style kill uses the style cadence even when the legacy cause is still present',
  );
  assert.equal(
    explosionScheduleFor('ordinary', 'kinetic', 'nope'),
    EXPLOSION_CAUSE_SCHEDULES.kinetic,
  );
  assert.ok(Object.isFrozen(EXPLOSION_STYLE_SCHEDULES));

  const lifecycle = new PhasedExplosionLifecycle({ capacity: 1 });
  const smash = lifecycle.start({
    classId: 'ordinary',
    cause: 'terrain_collision',
    styleId: 'terrain_smash',
    chainDepth: 3,
  });
  assert.equal(smash.cause, 'terrain_collision');
  assert.equal(smash.styleId, 'terrain_smash');
  assert.equal(smash.chainDepth, 0, 'non-chain styles never carry a depth');
  const phases = [];
  for (let i = 0; i < 80; i++) lifecycle.update(0.05, (phase) => phases.push(phase));
  assert.deepEqual(
    phases,
    explosionScheduleFor('ordinary', 'terrain_collision', 'terrain_smash').events
      .map((event) => event.phase),
  );

  const chained = lifecycle.start({
    cause: 'ship_collision',
    styleId: 'chain',
    chainDepth: 3,
  });
  assert.equal(chained.styleId, 'chain');
  assert.equal(chained.chainDepth, 3);
  lifecycle.clear();

  const fallback = lifecycle.start({
    cause: 'ship_collision',
    styleId: 'made-up',
    chainDepth: 9,
  });
  assert.equal(fallback.cause, 'ship_collision');
  assert.equal(fallback.styleId, 'ordinary');
  assert.equal(fallback.chainDepth, 0);
  lifecycle.clear();
  assert.equal(fallback.styleId, 'ordinary');
  assert.equal(fallback.cause, 'generic');
  assert.equal(fallback.chainDepth, 0);
});
