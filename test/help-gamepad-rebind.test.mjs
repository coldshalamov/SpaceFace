// INF-059 — rebinding updates the game's own instructions. The Help screen's Controls tab read
// the LIVE keyboard bindings, but its gamepad section printed the stock button names as
// literals: after a pad remap (Settings → Controls, PQ-164.01) the dock chip re-labeled while
// the help kept teaching 'Fire: RT / R2'. The section is now a projection of the resolved pad
// map. These tests pin the stock table byte-for-byte, the remap re-label, the honest unbound
// row, and the screen wiring.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { gamepadControlRows } from '../src/ui/screens/help.js';
import { resolveGamepadBindings, GAMEPAD_DEFAULT_BINDINGS } from '../src/systems/gamepad.js';

function padState(custom) {
  const settings = { controls: { gamepad: { enabled: true, deadzone: 0.12, invertY: false } } };
  if (custom) settings.controls.gamepad.bindings = custom;
  return { settings };
}

test('a stock (or missing) pad map keeps the authored dual-naming table byte for byte', () => {
  const stock = gamepadControlRows(null);
  assert.equal(stock.length, 19);
  assert.deepEqual(stock[2], ['Fire', null, 'RT / R2']);
  assert.deepEqual(stock[6], ['Shove (repulsor)', null, 'Y / △']);
  assert.deepEqual(stock[7], ['Massline', null, 'A / Cross']);
  assert.deepEqual(stock[13], ['Open star-map', null, 'View / Select']);
  assert.deepEqual(stock[17], ['Dock / activate', null, 'B / ○ (when prompted)']);
  assert.deepEqual(gamepadControlRows(GAMEPAD_DEFAULT_BINDINGS), stock, 'the frozen default map renders the same table');
});

test('a pad remap re-labels the help rows: the moved verb names its new button', () => {
  // Guide is the codex. Unbind it, then dock may take that button.
  const map = resolveGamepadBindings(padState({ codex: [], dock: ['home'] }).settings);
  assert.deepEqual(map.dock, ['home'], 'the remap took (share rules keep stolen-button overrides honest)');
  const rows = gamepadControlRows(map);
  assert.deepEqual(rows[17], ['Dock / activate', null, 'Home (when prompted)'], 'dock row follows the remap');
  // Untouched actions keep the stock buttons — named in the live single-glyph register.
  assert.deepEqual(rows[2], ['Fire', null, 'RT'], 'fire row unchanged');
  assert.deepEqual(rows[7], ['Massline', null, 'A'], 'massline row unchanged');
});

test('a deliberately unbound action names itself instead of printing a phantom button', () => {
  const map = resolveGamepadBindings(padState({ countermeasure: [] }).settings);
  assert.deepEqual(map.countermeasure, [], 'explicit empty list stays an unbind');
  const rows = gamepadControlRows(map);
  assert.equal(rows[9][2], 'unbound — Settings → Controls');
});

test('the Help screen feeds the section from the live resolved map, not literals', () => {
  const source = readFileSync(new URL('../src/ui/screens/help.js', import.meta.url), 'utf8');
  assert.match(
    source,
    /gamepadControlRows\(resolveGamepadBindings\(state && state\.settings\)\)/,
    'the Controls tab must project the resolved pad map',
  );
  assert.ok(
    !/\['Gamepad \(Xbox \/ PlayStation\)', \[/.test(source),
    'no inline literal row array in controlSections — the section must come from the projection',
  );
});
