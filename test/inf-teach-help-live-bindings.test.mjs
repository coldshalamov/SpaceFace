// INF-teach (WF-14) — "each new verb is taught the moment you need it" closes through Help.
//
// The first-hour rail deliberately names TOOLS, never keys ("Lines name the tool, never the key
// — bindings are rebindable", hudAttention.js). Help is therefore the at-need answer to "which
// key is that" — the pad sheet already listed every pad verb, but the keyboard sheet listed only
// 24 of the 31 listable flight actions (of DEFAULT_BINDINGS' 32 keys, fire is the mouse and is
// listed; autopursuit is the retired empty field). Seven bound verbs (scanPulse, siteBeam,
// cruise, deployBeacon, bulletTime, cloak, jettisonLot) appeared nowhere on it, so a keyboard
// pilot who opened Help at
// the seam beat's "Pulse the scanner." moment found no scanner anywhere (Settings had it; Help
// is where a player looks). Same-shape precedent: G15 (test/help-flight-verbs.test.mjs) fixed
// travelBurn/chargeThrow/chargeDetonate for exactly "I press keys and I don't know what they
// do"; test/bomb-remap-help.test.mjs set the completeness law for new verbs.
//
// Fixed seed 4242. Live owners only: input.js bindings, help.js controlSections,
// settings.js remap grid, onboarding.js BEATS. No goldens, no headed processes.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import {
  DEFAULTS,
  formatBindingCode,
  resolveActionCodes,
  resolveActionLabel,
} from '../src/systems/input.js';
import { controlSections } from '../src/ui/screens/help.js';
import { REBIND_LABELS, REBINDABLE } from '../src/ui/screens/settings.js';
import { BEATS } from '../src/systems/onboarding.js';

const SEED = 4242;

// Retired inert compatibility field (input.js VERB_BINDINGS): carries no codes, teaches nothing.
const RETIRED = new Set(['autopursuit']);

function keyboardActions(state) {
  const where = new Map();
  for (const [title, rows] of controlSections(state)) {
    for (const [label, action] of rows) {
      if (!action) continue;
      assert.ok(!where.has(action), `${action} is listed twice (also under ${title})`);
      where.set(action, title);
    }
  }
  return where;
}

test('Help lists every live keyboard verb exactly once (seed 4242)', () => {
  const state = createGameState(SEED);
  state.settings.gameplay.controlScheme = 'pilot';
  const where = keyboardActions(state);
  const live = Object.keys(DEFAULTS.BINDINGS).filter((a) => !RETIRED.has(a));
  for (const action of live) {
    assert.ok(where.has(action), `${action} must be listed in Help's keyboard sections`);
  }
  assert.equal(where.get('scanPulse'), 'Flight', 'the scanner verb lives in the Flight band');
});

test('the seven gap verbs are the ones that were missing, and they render live bindings', () => {
  const state = createGameState(SEED);
  state.settings.gameplay.controlScheme = 'pilot';
  const where = keyboardActions(state);
  for (const action of ['scanPulse', 'siteBeam', 'cruise', 'deployBeacon', 'bulletTime', 'cloak', 'jettisonLot']) {
    assert.equal(where.get(action), 'Flight', `${action} has a Flight row`);
  }
  // Live bindings, not literals: a rebind moves the printed key (the ladder renders
  // resolveActionLabel — help.js keyLabel), the pad sheet keeps its own resolution.
  assert.equal(resolveActionCodes(state, 'scanPulse')[0], 'KeyC', 'PILOT default scanner key');
  state.settings.controls.bindings = { scanPulse: ['KeyJ'] };
  assert.equal(formatBindingCode(resolveActionCodes(state, 'scanPulse')[0]), 'J');
  assert.equal(resolveActionLabel(state, 'scanPulse'), 'J', 'a remap re-labels the help row');
});

test('the rail names the scanner tool at the seam beat, and Help answers with the live key', () => {
  const seam = BEATS.find((b) => b.key === 'seam');
  assert.ok(seam, 'the first-hour rail has a seam beat');
  assert.match(seam.line, /scanner/i, `the seam beat teaches the scanner tool (got: ${seam.line})`);
  const state = createGameState(SEED);
  assert.equal(resolveActionLabel(state, 'scanPulse'), 'C',
    'the scanner moment is answerable: Help shows C, the live PILOT binding');
});

test('every live bound verb has a keyboard remap row and label (the bomb-bay law, generalized)', () => {
  const rebindable = new Set(REBINDABLE);
  for (const [action, codes] of Object.entries(DEFAULTS.BINDINGS)) {
    if (!codes.length) continue; // fire is the mouse; autopursuit is the retired empty field
    assert.ok(rebindable.has(action), `${action} has a keyboard remap row`);
    assert.ok(REBIND_LABELS[action] && REBIND_LABELS[action].length > 0, `${action} has a remap label`);
  }
});
