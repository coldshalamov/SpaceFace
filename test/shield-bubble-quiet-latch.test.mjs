import test from 'node:test';
import assert from 'node:assert/strict';
import {
  updateEntityShieldBubblePresentation,
  setShieldBubbleQuietLatchForBench,
  getShieldBubbleQuietLatchForBench,
  shouldPresentShieldBubble,
  SHIELD_BUBBLE_PRESENTATION_EPSILON,
} from '../src/render/weapons/shieldBubblePresentation.js';
import { addShieldContact, clearShieldContacts } from '../src/render/weapons/shieldContacts.js';

function makeBubble(shield = 100) {
  return {
    visible: false,
    material: {
      uniforms: {
        uFlash: { value: 0 },
        uShellTime: { value: 0 },
      },
    },
    userData: {
      _prevShield: shield,
      _prevFlashT: 0,
      _collapseTimer: 0,
      _sfShieldQuietLatched: false,
    },
  };
}

function armQuiet(entity, bubble) {
  // Punch flash then decay until latch.
  bubble.material.uniforms.uFlash.value = 1;
  let now = 1000;
  let sim = 100;
  for (let i = 0; i < 400; i++) {
    now += 0.016;
    sim += 0.016;
    updateEntityShieldBubblePresentation(entity, bubble, now, sim, false);
  }
  return { now, sim };
}

test('shouldPresentShieldBubble idle charged shield stays hidden', () => {
  assert.equal(shouldPresentShieldBubble(100, 0), false);
  assert.equal(shouldPresentShieldBubble(100, SHIELD_BUBBLE_PRESENTATION_EPSILON + 0.01), true);
});

test('quiet latch skips while shield/contact/collapse cold', () => {
  setShieldBubbleQuietLatchForBench(true);
  const entity = { id: 42, shield: 80 };
  const bubble = makeBubble(80);
  const clock = armQuiet(entity, bubble);
  assert.equal(bubble.userData._sfShieldQuietLatched, true, 'expected quiet latch armed');
  const shellBefore = bubble.material.uniforms.uShellTime.value;
  const skipped = updateEntityShieldBubblePresentation(
    entity, bubble, clock.now + 0.016, clock.sim + 0.016, false,
  );
  assert.equal(skipped, true);
  assert.equal(bubble.material.uniforms.uShellTime.value, shellBefore, 'shell clock frozen while latched');
});

test('shield value change wakes quiet latch', () => {
  setShieldBubbleQuietLatchForBench(true);
  const entity = { id: 43, shield: 80 };
  const bubble = makeBubble(80);
  const clock = armQuiet(entity, bubble);
  assert.equal(bubble.userData._sfShieldQuietLatched, true);
  entity.shield = 40; // impact
  const skipped = updateEntityShieldBubblePresentation(
    entity, bubble, clock.now + 0.016, clock.sim + 0.016, false,
  );
  assert.equal(skipped, false);
  assert.equal(bubble.userData._sfShieldQuietLatched, false);
  assert.ok(bubble.material.uniforms.uFlash.value > SHIELD_BUBBLE_PRESENTATION_EPSILON);
});

test('shield regeneration alone stays invisible', () => {
  setShieldBubbleQuietLatchForBench(true);
  const entity = { id: 430, shield: 50 };
  const bubble = makeBubble(40);
  updateEntityShieldBubblePresentation(entity, bubble, 10, 10, false, 1 / 60);
  assert.equal(bubble.visible, false, 'passive regeneration is not a shield-hit visual');
  assert.equal(bubble.material.uniforms.uFlash.value, 0, 'regeneration does not punch the flash channel');
});

test('shield contact wakes quiet latch', () => {
  setShieldBubbleQuietLatchForBench(true);
  clearShieldContacts();
  const entity = { id: 44, shield: 80 };
  const bubble = makeBubble(80);
  const clock = armQuiet(entity, bubble);
  assert.equal(bubble.userData._sfShieldQuietLatched, true);
  addShieldContact(entity.id, 1, 0, 0, 1);
  const skipped = updateEntityShieldBubblePresentation(
    entity, bubble, clock.now + 0.016, clock.sim + 0.016, false,
  );
  assert.equal(skipped, false);
  clearShieldContacts();
});

test('bench toggle off restores always-update', () => {
  setShieldBubbleQuietLatchForBench(false);
  assert.equal(getShieldBubbleQuietLatchForBench(), false);
  const entity = { id: 45, shield: 80 };
  const bubble = makeBubble(80);
  bubble.userData._sfShieldQuietLatched = true;
  const skipped = updateEntityShieldBubblePresentation(entity, bubble, 2000, 200, false);
  assert.equal(skipped, false, 'bench off must not skip');
  setShieldBubbleQuietLatchForBench(true);
});

test('shield break starts collapse and presents', () => {
  setShieldBubbleQuietLatchForBench(true);
  const entity = { id: 46, shield: 80 };
  const bubble = makeBubble(80);
  const clock = armQuiet(entity, bubble);
  entity.shield = 0;
  updateEntityShieldBubblePresentation(entity, bubble, clock.now + 0.016, clock.sim + 0.016, false);
  assert.ok(bubble.userData._collapseTimer > 0);
  assert.equal(bubble.visible, true);
});
