import test from 'node:test';
import assert from 'node:assert/strict';
import { LINE_CLASSES, lineClassForIndex, entityOverLineClass, isOverLineClass } from '../src/data/lineProgression.js';

const body = (mass) => ({ mass });
const at = (classIndex) => ({ lineProgression: { classIndex } });

test('a body at or under the class ceiling is latchable and never snaps for weight', () => {
  const cap = lineClassForIndex(1).fullControlMassT;
  assert.equal(entityOverLineClass(at(1), body(cap)), false);
  assert.equal(entityOverLineClass(at(1), body(cap * 0.5)), false);
  assert.equal(isOverLineClass(cap, 1), false);
});

test('anything over the ceiling reads TOO HEAVY (same rule the snap uses)', () => {
  const cap = lineClassForIndex(1).fullControlMassT;
  assert.equal(entityOverLineClass(at(1), body(cap + 1)), true);
  assert.equal(isOverLineClass(cap + 1, 1), true);
});

test('a better line class raises the ceiling for both the tag and the snap', () => {
  assert.ok(LINE_CLASSES.length > 1);
  const cap2 = lineClassForIndex(2).fullControlMassT;
  const cap1 = lineClassForIndex(1).fullControlMassT;
  assert.ok(cap2 >= cap1);
  assert.equal(entityOverLineClass(at(2), body(cap2)), false);
  assert.equal(entityOverLineClass(at(2), body(cap2 + 1)), true);
});

test('the tutorial loose rock is within class for the tag and the snap alike', () => {
  const rock = { mass: 220, data: { rescueRole: 'rock' } };
  assert.equal(entityOverLineClass(at(1), rock), false);
  assert.equal(entityOverLineClass(at(1), { mass: 220, data: {} }), true);
});

// NOTICE-01: the raid beat's raider is the second lesson body — "Latch the raider. Swing him
// into the rock." must never say TOO HEAVY, and the swing must never snap for weight.
test('the tutorial raider is exempt like the lesson rock — the tag and the snap read one rule', () => {
  const raider = { mass: 220, data: { onboarding: true, onboardingRaid: true } };
  assert.equal(entityOverLineClass(at(1), raider), false,
    'the raid beat raider never reads TOO HEAVY');
  assert.equal(entityOverLineClass(at(1), { mass: 220, data: { onboarding: true } }), true,
    'an ordinary onboarding body still reads TOO HEAVY — only the raid raider is exempt');
  assert.equal(entityOverLineClass(at(1), { mass: 220, data: { onboardingRaid: false } }), true,
    'a raider-shaped body without the raid tag still reads TOO HEAVY');
});

import { DOMAIN_EXPAND, DOMAIN_MIRROR_KEYS } from '../scripts/lib/simReadModel.mjs';
test('the release-window state reaches the main thread on the hot cadence (worker lane throw cue)', () => {
  assert.ok(DOMAIN_MIRROR_KEYS.includes('massline2'), 'massline2 is mirrored');
  assert.ok(DOMAIN_EXPAND.massline2 >= 2, 'massline2.throw splits into its own small leaf, signed every pass');
});
