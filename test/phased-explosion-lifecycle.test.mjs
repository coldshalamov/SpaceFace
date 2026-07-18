import assert from 'node:assert/strict';
import test from 'node:test';

import {
  explosionPattern01,
  explosionPatternSigned,
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
