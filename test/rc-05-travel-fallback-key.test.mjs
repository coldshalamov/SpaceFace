// RC-05 / RC-06 — the travel-drive fallback key and the label it prints.
//
// RC-05: the stock travelBurn array shipped ['NumLock','KeyH'], but the UI router opens Help on
// h/H unconditionally and the window-level flight adapter ignores preventDefault — one press
// fired the drive AND opened Help. The fallback is F8 now: a row-key every chassis ships that no
// interface verb owns (F1–F5/F7/F9 are taken). Num Lock stays the authored primary (ADR D5).
//
// RC-06: the rail socket used to print the first binding — "DRIVE NUM LOCK" — a key many laptops
// do not have. resolveSlotLabels now prefers the first non-lock code after the slot's own digit;
// NUM LOCK prints only when it is the sole binding. Binding arrays are never reordered.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULTS,
  applyFlightKeyEvent,
  resolveActionLabel,
} from '../src/systems/input.js';
import { INTERFACE_KEY_OWNERS } from '../src/ui/screens/settings.js';
import { resolveSlotLabels, resolveSlotKeys } from '../src/ui/powerRail.js';
import { verbBindingLabel } from '../src/onboarding/verbSpeech.js';

const SCHEMES = { pilot: 'pilot', classic: 'classic', 'helm-assist': 'helm-assist' };

function flightHost() {
  // The fixed-tick keyboard seam: _keys is the held map, _keyEdgeQueue the press edges the
  // flight tick consumes (travelBurn is a SAMPLED_EDGE_ACTION, not a held axis).
  return { _keys: Object.create(null), state: { settings: {} } };
}

test('RC-05: the fallback seat is F8 in the default table and in every shipped scheme', () => {
  const b = DEFAULTS.BINDINGS.travelBurn;
  assert.equal(b[0], 'NumLock', 'Num Lock stays the authored default');
  assert.deepEqual(b, ['NumLock', 'F8']);
  for (const name of Object.values(SCHEMES)) {
    assert.deepEqual(DEFAULTS.SCHEMES[name].travelBurn, ['NumLock', 'F8'],
      `${name} scheme inherits the same fallback`);
  }
});

test('RC-05: F8 owns no interface verb — Help cannot open under the fallback press', () => {
  // The reserved-code table is the contract seam both directions: it names the owner a
  // candidate code would fire, and the settings capture refuses to seat a flight verb on it.
  assert.equal(INTERFACE_KEY_OWNERS.get('KeyH'), 'Help', 'h/H stays bound to Help — untouched');
  assert.equal(INTERFACE_KEY_OWNERS.get('F8'), undefined,
    'F8 is free: pressing it cannot reach the Help router case');
  // The whole class this defect belongs to: no stock flight seat may land on an interface code.
  for (const [name, scheme] of Object.entries(DEFAULTS.SCHEMES)) {
    for (const [action, codes] of Object.entries(scheme)) {
      for (const code of codes) {
        assert.equal(INTERFACE_KEY_OWNERS.get(code), undefined,
          `${name}.${action} seats ${code}, which the interface owns`);
      }
    }
  }
});

test('RC-05: pressing F8 queues the travelBurn edge; Num Lock still does', () => {
  const host = flightHost();
  assert.equal(applyFlightKeyEvent(host, { code: 'F8', pressed: true }), true);
  const edge = host._keyEdgeQueue[0];
  assert.ok(edge, 'the press reaches the sampled-edge queue the flight tick drains');
  assert.equal(edge.action, 'travelBurn');
  assert.equal(edge.code, 'F8');
  assert.equal(edge.pressed, true);

  const hostNum = flightHost();
  applyFlightKeyEvent(hostNum, { code: 'NumLock', pressed: true });
  assert.equal(hostNum._keyEdgeQueue[0].action, 'travelBurn', 'Num Lock remains a live seat');

  // Release edges do not re-fire (travelBurn is a latch; only the press is an edge).
  const host2 = flightHost();
  applyFlightKeyEvent(host2, { code: 'F8', pressed: true });
  const n = host2._keyEdgeQueue.length;
  applyFlightKeyEvent(host2, { code: 'F8', pressed: false });
  assert.equal(host2._keyEdgeQueue.length, n, 'keyup queues no second edge');
});

test('RC-05: the lesson and HUD key label name a key the player can press', () => {
  const state = { settings: {} };
  const spoken = verbBindingLabel(state, 'travelBurn', 'kbm');
  assert.equal(spoken, 'Num Lock/F8', 'the lesson lists the live seats, F8 among them');
  assert.equal(resolveActionLabel(state, 'travelBurn'), 'Num Lock/F8');
});

test('RC-06: the socket prefers the non-lock binding; NUM LOCK only when it is alone', () => {
  const stock = DEFAULTS.BINDINGS;
  const labels = resolveSlotLabels(stock);
  assert.equal(labels[0], 'F8', 'the drive socket prints the usable fallback, not NUM LOCK');

  const soleLock = resolveSlotLabels({ ...stock, travelBurn: ['NumLock'] });
  assert.equal(soleLock[0], 'Num Lock', 'a sole Num Lock still prints its name');

  const rebindLock = resolveSlotLabels({ ...stock, travelBurn: ['CapsLock', 'KeyG'] });
  assert.equal(rebindLock[0], 'G', 'a lock-first rebind still surfaces the pressable key');

  const lockOnly = resolveSlotLabels({ ...stock, travelBurn: ['CapsLock'] });
  assert.equal(lockOnly[0], 'Caps Lock', 'a lock is named when nothing else is bound');

  // The key line keeps every binding in authored order behind the displayed label.
  const keys = resolveSlotKeys(stock);
  assert.equal(keys[0], 'F8 · Num Lock', 'the tip lists all seats, primary label first');
});

test('RC-06: a slot with its own rank digit still prints the digit', () => {
  const b = { ...DEFAULTS.BINDINGS, tether: ['Space', 'KeyF', 'Digit3'] };
  assert.equal(resolveSlotLabels(b)[3], '3', 'the hotbar rank wins where one is bound');
  // A lock code outranks nothing — but a digit still wins over a lock for its own slot.
  const mixed = { ...DEFAULTS.BINDINGS, chargeDetonate: ['NumLock', 'Digit2', 'KeyR'] };
  assert.equal(resolveSlotLabels(mixed)[2], '2', 'digit preference is unchanged by the lock filter');
});
