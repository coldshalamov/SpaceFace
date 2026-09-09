import assert from 'node:assert/strict';
import test from 'node:test';

import {
  drawSeeded,
  hash32,
  makeStream,
  mulberry32,
  stepMulberry32,
  wrapAngle,
} from '../src/core/rng.js';

test('mulberry32 retains the canonical seed-47 vector', () => {
  const rng = mulberry32(47);
  assert.deepEqual([rng(), rng(), rng()], [
    0.62949686544016,
    0.09637522185221314,
    0.4719408228993416,
  ]);
  assert.equal(hash32('SpaceFace', 47, 'flight'), 3492337613);
});

test('serializable stepping matches the stateful stream across save and restore', () => {
  const stateful = mulberry32(47);
  let seed = 47;
  for (let draw = 0; draw < 8; draw += 1) {
    const next = stepMulberry32(seed);
    assert.equal(next.value, stateful());
    seed = next.seed;
  }

  const owner = JSON.parse(JSON.stringify({ encounterSeed: seed }));
  const expected = stepMulberry32(seed);
  assert.equal(drawSeeded(owner, 'encounterSeed', 999), expected.value);
  assert.equal(owner.encounterSeed, expected.seed);
});

test('named streams isolate subsystem draw order', () => {
  const combatA = makeStream(47, 'combat');
  const economyA = makeStream(47, 'economy');
  const combatB = makeStream(47, 'combat');
  const economyB = makeStream(47, 'economy');

  const combatValues = [combatA(), combatA(), combatA()];
  economyA();
  economyA();
  assert.deepEqual(combatValues, [combatB(), combatB(), combatB()]);
  economyB();
  economyB();
  assert.equal(economyA(), economyB());
});

test('drawSeeded initializes invalid or zero state from a nonzero fallback', () => {
  const owner = { seed: 0 };
  const value = drawSeeded(owner, 'seed', 47);
  assert.equal(value, stepMulberry32(47).value);
  assert.equal(owner.seed, stepMulberry32(47).seed);
  assert.throws(() => drawSeeded(null, 'seed', 47), /object owner/);
});

test('wrapAngle preserves the documented (-PI, PI] interval', () => {
  assert.equal(wrapAngle(-Math.PI), Math.PI);
  assert.equal(wrapAngle(Math.PI), Math.PI);
  assert.equal(wrapAngle(3 * Math.PI), Math.PI);
  assert.equal(wrapAngle(-3 * Math.PI), Math.PI);
  assert.equal(wrapAngle(0), 0);
});
