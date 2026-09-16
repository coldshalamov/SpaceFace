// Bomb-bay verbs must be rebindable and taught everywhere the older verbs are: the
// settings remap grids (keyboard + pad) and the help screen's Flight and Gamepad
// tables. Every other shipped flight verb already has all three; the bomb bay
// shipped without them.
import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULTS } from '../src/systems/input.js';
import { GAMEPAD_DEFAULT_BINDINGS } from '../src/systems/gamepad.js';
import {
  GAMEPAD_REBIND_LABELS,
  GAMEPAD_REBINDABLE,
  REBIND_LABELS,
  REBINDABLE,
} from '../src/ui/screens/settings.js';
import { controlSections } from '../src/ui/screens/help.js';

test('bomb-bay actions are rebindable on keyboard and pad with labels', () => {
  for (const action of ['dropBomb', 'cycleBomb']) {
    assert.ok(REBINDABLE.includes(action), `${action} has a keyboard remap row`);
    assert.ok(REBIND_LABELS[action] && REBIND_LABELS[action].length > 0, `${action} has a keyboard label`);
    assert.ok(GAMEPAD_REBINDABLE.includes(action), `${action} has a pad remap row`);
    assert.ok(GAMEPAD_REBIND_LABELS[action] && GAMEPAD_REBIND_LABELS[action].length > 0, `${action} has a pad label`);
  }
});

test('bomb-bay remap rows resolve to the shipped default bindings', () => {
  assert.deepEqual(DEFAULTS.BINDINGS.dropBomb, ['Digit9']);
  assert.deepEqual(DEFAULTS.BINDINGS.cycleBomb, ['Comma']);
  assert.deepEqual([...GAMEPAD_DEFAULT_BINDINGS.dropBomb], ['dRight']);
  assert.deepEqual([...GAMEPAD_DEFAULT_BINDINGS.cycleBomb], ['dLeft']);
});

test('help screen teaches the bomb bay on keyboard and pad', () => {
  const sections = Object.fromEntries(controlSections({}).map(([title, rows]) => [title, rows]));
  const flight = sections.Flight || [];
  assert.ok(flight.some((row) => row[1] === 'dropBomb'), 'Flight teaches drop bomb');
  assert.ok(flight.some((row) => row[1] === 'cycleBomb'), 'Flight teaches cycle payload');
  const pad = sections['Gamepad (Xbox / PlayStation)'] || [];
  const padText = pad.map((row) => `${row[0]} ${row[2]}`).join('\n');
  assert.match(padText, /Drop bomb.*D-Pad Right/);
  assert.match(padText, /Cycle bomb-bay payload.*D-Pad Left/);
});
