// NXI-008 — the G-stick indicator shows the real normalized vector, not the mode flag.
//
// ALREADY TRUE at the instrument: the G combat-stick chrome (#auto-target-flight-stick in
// uiRoot.js) was born consuming the authoritative `state.input.autoTargetVector` — the
// projected result NXB-002 owns — in commit 1dec97a62. Enabled display rides `autoFire`;
// the "actively steering" bright state rides `flightStick.active === true`; the knob rides
// the normalized `screenX/screenY`. `powerRail.js` (this packet's named owner file) exposes
// no G-mode surface at all, so nothing in it can infer steering from auto-fire being on.
//
// This test pins the contract end to end, headlessly:
//   1. the authoritative projection says enabled+neutral ⇒ { active:false, magnitude:0 },
//      a real deflection ⇒ { active:true, magnitude>0 }, and a return to neutral ⇒
//      { active:false } again — the exact done-when transitions;
//   2. the instrument source binds `.is-active` to `flightStick?.active === true` (never to
//      `autoTarget`/`autoFire`), binds the knob transform to `screenX/screenY`, and gates
//      visibility on the mode flag — enabled, not steering.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  projectDynamicFlightStick,
  recordDynamicFlightStick,
  resetDynamicFlightStick,
} from '../src/systems/dynamicFlightStick.js';

function host() {
  const player = { id: 'p', pos: { x: 0, z: 0 } };
  const state = {
    playerId: 'p',
    entities: { get: (id) => (id === 'p' ? player : null) },
    input: { autoFire: true },
  };
  return {
    state,
    helpers: {
      worldToScreen: () => ({ x: 500, y: 300 }),
      raycastToPlane: (n) => ({ x: n.x * 40, z: -n.y * 40 }),
    },
  };
}

test('enabled at neutral reads enabled but not actively steering', () => {
  const h = host();
  resetDynamicFlightStick(h, 1280, 720);
  const vector = projectDynamicFlightStick(h, 1280, 720);
  assert.equal(vector.active, false, 'enabled G mode at rest is not steering');
  assert.equal(vector.magnitude, 0);
  assert.equal(vector.worldX, 0);
  assert.equal(vector.worldZ, 0);
});

test('a real deflection reads active with a bounded normalized vector, and neutral restores inactive', () => {
  const h = host();
  resetDynamicFlightStick(h, 1280, 720);
  // One deliberate swipe well past the deadzone (deadzone is 10px at this radius).
  assert.equal(recordDynamicFlightStick(h, 60, 0, 1280, 720), true);
  const deflected = projectDynamicFlightStick(h, 1280, 720);
  assert.equal(deflected.active, true, 'nonzero stick intent is actively steering');
  assert.ok(deflected.magnitude > 0, `magnitude ${deflected.magnitude} should be positive`);
  assert.ok(Math.abs(deflected.screenX) > 0, 'the normalized screen vector carries the intent');
  assert.ok(Math.hypot(deflected.screenX, deflected.screenY) <= 1 + 1e-9, 'normalized, never >1');

  // Returning the knob to neutral removes the active indication — the indicator must not
  // keep showing "steering" after the hand lets go.
  const stick = h._autoTargetStick;
  recordDynamicFlightStick(h, -stick.xPx, -stick.yPx, 1280, 720);
  const neutral = projectDynamicFlightStick(h, 1280, 720);
  assert.equal(neutral.active, false, 'return-to-neutral is no longer steering');
  assert.equal(neutral.magnitude, 0);
  assert.equal(neutral.worldX, 0);
  assert.equal(neutral.worldZ, 0);
});

test('a neighboring truth: disabling G mode reports inactive with a zeroed vector', () => {
  const h = host();
  resetDynamicFlightStick(h, 1280, 720);
  recordDynamicFlightStick(h, 60, 0, 1280, 720);
  h.state.input.autoFire = false;
  const vector = projectDynamicFlightStick(h, 1280, 720);
  assert.equal(vector.active, false);
  assert.equal(vector.screenX, 0);
  assert.equal(vector.screenY, 0);
  assert.equal(vector.magnitude, 0);
});

test('the instrument binds active styling to the authoritative flag, never to auto-fire', () => {
  const source = readFileSync(new URL('../src/ui/uiRoot.js', import.meta.url), 'utf8');
  // Enabled display: the chrome appears because auto-target mode is on — that is the
  // truthful "enabled" reading and stays.
  assert.match(source, /const autoTarget = !!\(visible && st && st\.input && st\.input\.autoFire\)/,
    'enabled display still rides the mode flag');
  assert.match(source, /autoTargetFlightStick\.style\.display = nextStickDisplay/,
    'the stick chrome is shown while the mode is enabled');
  // Active steering: `.is-active` must be fed by the projected vector's own flag.
  assert.match(source, /const stickActive = flightStick\?\.active === true/,
    'is-active must consume the authoritative active result');
  assert.doesNotMatch(source, /toggle\('is-active',\s*(autoTarget|auto|\bvisible\b)/,
    'is-active must never be inferred from auto-fire being enabled');
  // The knob is the real normalized vector — screenX/screenY straight off the projection.
  assert.match(source, /flightStick\?\.screenX/, 'knob consumes the normalized screen vector');
  assert.match(source, /flightStick\?\.screenY/, 'knob consumes the normalized screen vector');
});

test('the active face is a distinct authored style, not a second chrome element', () => {
  const css = readFileSync(new URL('../styles/ui.css', import.meta.url), 'utf8');
  assert.match(css, /#auto-target-flight-stick\s*\{[^}]*opacity:\s*[\d.]+/,
    'the enabled face exists (dim at rest)');
  assert.match(css, /#auto-target-flight-stick\.is-active\s*\{[^}]*opacity:\s*[\d.]+/,
    'the active face is a state of the same element');
  assert.match(css, /#auto-target-flight-stick\.is-active \.sf-combat-stick__knob/,
    'the knob brightens under active steering');
});
