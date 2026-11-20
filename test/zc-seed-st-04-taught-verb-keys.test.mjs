// SEED-ST-04 — each taught-verb beat line carries its live bound key, rebind-safe.
//
// taughtVerbLine is a pure resolver: the key label comes from the live binding registry at
// speak time, so the test drives it against a stub state whose bindings are the pilot scheme's
// defaults and then against a rebound state, and pins both the appended label and the untouched
// line when no label resolves (touch, unknown action).
import test from 'node:test';
import assert from 'node:assert/strict';

import { taughtVerbLine, BEATS } from '../src/systems/onboarding.js';

/** A minimal state whose key bindings read as the pilot scheme defaults. */
function stateWithBindings(bindings, device = 'keyboard') {
  return {
    input: { promptDevice: device },
    settings: { controls: { bindings: { ...bindings } } },
  };
}

test('opening flight prompts name the current default bindings', () => {
  const st = stateWithBindings({});
  assert.equal(taughtVerbLine(st, 'thrust', 'Thrust until speed passes forty.'),
    'Thrust until speed passes forty. (W/↑)');
  assert.equal(taughtVerbLine(st, 'tether', 'Latch the loose rock.'), 'Latch the loose rock. (F)');
  assert.equal(taughtVerbLine(st, 'tether:target:acquired', 'Latch it. Massline.'),
    'Latch it. Massline. (F)');
  assert.equal(taughtVerbLine(st, 'burst', 'Fire a short burst into the raider.'),
    'Fire a short burst into the raider. (LMB)');
});

test('scanner and mining prompts name the available tool and follow a remap', () => {
  const scan = (st) => taughtVerbLine(st, 'seam', 'Pulse the scanner.');
  const mine = (st) => taughtVerbLine(st, 'seam:scan:hit', 'Beam the bright seams.');
  const keyboard = stateWithBindings({});
  assert.equal(scan(keyboard), 'Pulse the scanner. Hold Q and choose Scan.');
  assert.equal(mine(keyboard), 'Beam the bright seams. Hold Q and choose Mine Beam.');
  const rebound = stateWithBindings({ scanPulse: ['KeyC'], contextWheel: ['KeyT'] });
  assert.equal(scan(rebound), 'Pulse the scanner. (C)');
  assert.equal(mine(rebound), 'Beam the bright seams. Hold T and choose Mine Beam.');
  assert.equal(scan(stateWithBindings({ scanPulse: ['KeyC'] }, 'gamepad')),
    'Pulse the scanner. Hold Y and choose Scan.');
  assert.equal(scan(stateWithBindings({}, 'touch')), 'Pulse the scanner. Tap Powers → Flight → Scan.');
  assert.equal(mine(stateWithBindings({}, 'touch')), 'Beam the bright seams. Hold Mine.');
});

test('the label is live: a rebound tether key is the one that prints', () => {
  const st = stateWithBindings({ tether: ['KeyQ'] });
  assert.equal(taughtVerbLine(st, 'tether:target:acquired', 'Latch it. Massline.'),
    'Latch it. Massline. (Q)');
});

test('no label resolves to no suffix — the authored line stands', () => {
  const touch = stateWithBindings({}, 'touch');
  assert.equal(taughtVerbLine(touch, 'thrust', 'Thrust until speed passes forty.'),
    'Thrust until speed passes forty.');
  assert.equal(taughtVerbLine({}, 'brake', 'Brake below ten.'), 'Brake below ten.',
    'an untaught id passes through untouched');
  assert.equal(taughtVerbLine({}, 'thrust', ''), '');
});

test('SEED-ST-05: the winch line names the whole reel chord with live labels', () => {
  const st = stateWithBindings({});
  assert.equal(taughtVerbLine(st, 'tether:tether:latched', 'Winch in. Hold tether to reel.'),
    'Winch in. Hold F — W/↑ reels in.');
  const rebound = stateWithBindings({ tether: ['KeyQ'], forward: ['KeyT'], brake: ['KeyZ'] });
  assert.equal(taughtVerbLine(rebound, 'tether:tether:latched', 'Winch in. Hold tether to reel.'),
    'Winch in. Hold Q — T reels in, Z pays out.');
  assert.equal(taughtVerbLine(stateWithBindings({}, 'touch'), 'tether:tether:latched', 'Winch in. Hold tether to reel.'),
    'Winch in. Hold tether to reel.', 'touch resolves no labels — the authored line stands');
});

test('the beat table itself is untouched — lines stay authored, keys join at speak time', () => {
  assert.equal(BEATS.find((b) => b.key === 'thrust').line, 'Thrust until speed passes forty.');
  assert.equal(BEATS.find((b) => b.key === 'seam').followups[0].line, 'Beam the bright seams.');
});
