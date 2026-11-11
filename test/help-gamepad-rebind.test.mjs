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
  assert.equal(new Set(stock.map(([label]) => label)).size, stock.length, 'each taught control has one row');
  assert.deepEqual(stock.find(([label]) => label === 'Chase / overhead camera'),
    ['Chase / overhead camera', null, 'LB / L1 + View / Select']);
  assert.deepEqual(stock[2], ['Fire', null, 'RT / R2']);
  // G18-02 "one set of keys": the pad speaks the same table — RT fire, LT the Line, A boost,
  // X dock, View map, hold-Y the one context wheel. Overflow verbs are wheel slices.
  assert.deepEqual(stock[3], ['Mine beam', null, 'hold Y / △ — context wheel']);
  assert.deepEqual(stock[4], ['Boost', null, 'A / Cross']);
  assert.deepEqual(stock[5], ['Context wheel (hold: aim a slice, release to choose)', null, 'hold Y / △']);
  assert.deepEqual(stock[6], ['Brake / full stop', null, 'hold Y / △ — context wheel']);
  assert.deepEqual(stock[7], ['Shove (repulsor; sets off armed ordnance)', null, 'RB / R1']);
  assert.deepEqual(stock[8], ['Accept / confirm', null, 'A / Cross']);
  assert.deepEqual(stock[9], ['Massline', null, 'LT / L2']);
  assert.deepEqual(stock[11], ['Bomb (selected ordnance)', null, 'D-Pad Right']);
  assert.deepEqual(stock[13], ['Cycle target', null, 'R3']);
  assert.deepEqual(stock[14], ['Open star-map', null, 'View / Select']);
  assert.deepEqual(stock[18], ['Dock / activate', null, 'X / □ (when prompted)']);
  assert.deepEqual(stock[19], ['Cancel / back', null, 'B / ○']);
  assert.deepEqual(stock[20], ['Station tab: previous', null, 'LB / L1']);
  assert.deepEqual(stock[21], ['Station tab: next', null, 'RB / R1']);
  assert.deepEqual(stock[22], ['Travel burn', null, 'hold Y / △ — context wheel']);
  assert.deepEqual(stock[23], ['Auto-target', null, 'D-Pad Up']);
  assert.deepEqual(stock[28], ['Pin (anchor seed)', null, 'D-Pad Down']);
  assert.deepEqual(stock[29], ['Pull (gravity well)', null, 'LB / L1']);
  assert.deepEqual(stock[30], ['Rig (clearing cone / skim scoop)', null, 'B / ○']);
  const taught = [
    ['fire', 'Fire'], ['mine', 'Mine beam'], ['boost', 'Boost'], ['contextWheel', 'Context wheel (hold: aim a slice, release to choose)'],
    ['brake', 'Brake / full stop'],
    ['shove', 'Shove (repulsor; sets off armed ordnance)'], ['accept', 'Accept / confirm'], ['massline', 'Massline'],
    ['countermeasure', 'Countermeasure'], ['bomb', 'Bomb (selected ordnance)'], ['cycleBomb', 'Cycle ordnance'],
    ['cycleTarget', 'Cycle target'], ['map', 'Open star-map'], ['codex', 'Open codex'],
    ['pause', 'Pause'], ['dock', 'Dock / activate'], ['cancel', 'Cancel / back'],
    ['tabPrev', 'Station tab: previous'], ['tabNext', 'Station tab: next'], ['travelBurn', 'Travel burn'],
    ['autoTarget', 'Auto-target'],
    ['scanPulse', 'Scanner pulse'], ['pin', 'Pin (anchor seed)'],
    ['pull', 'Pull (gravity well)'], ['rig', 'Rig (clearing cone / skim scoop)'],
    ['siteBeam', 'World Site beam'],
    ['bulletTime', 'Bullet time'], ['cloak', 'Cloak'],
    ['cruise', 'Cruise drive'], ['deployBeacon', 'Deploy nav beacon'],
    ['jettisonLot', 'Jettison cargo lot'],
    ['gyreSnare', 'Gyre Snare (hold: lash; release: bowl)'],
    ['deployShieldPylon', 'Shield pylons (place / link / recall)'],
    ['steeringView', 'Chase / overhead camera'],
  ];
  assert.deepEqual(taught.map(([action]) => action).sort(), Object.keys(GAMEPAD_DEFAULT_BINDINGS).sort());
  for (const [, label] of taught) assert.equal(stock.some((row) => row[0] === label), true, label);
  assert.deepEqual(gamepadControlRows(GAMEPAD_DEFAULT_BINDINGS), stock, 'the frozen default map renders the same table');
});

test('a pad remap re-labels the help rows: the moved verb names its new button', () => {
  // Guide is the codex. Unbind it, then dock may take that button.
  const map = resolveGamepadBindings(padState({ codex: [], dock: ['home'] }).settings);
  assert.deepEqual(map.dock, ['home'], 'the remap took (share rules keep stolen-button overrides honest)');
  const rows = gamepadControlRows(map);
  assert.deepEqual(rows[18], ['Dock / activate', null, 'Home (when prompted)'], 'dock row follows the remap');
  // Untouched actions keep the stock buttons — named in the live single-glyph register.
  assert.deepEqual(rows[2], ['Fire', null, 'RT'], 'fire row unchanged');
  assert.deepEqual(rows[9], ['Massline', null, 'LT'], 'massline row unchanged');
});

test('a deliberately unbound action names itself instead of printing a phantom button', () => {
  const map = resolveGamepadBindings(padState({ fire: [] }).settings);
  assert.deepEqual(map.fire, [], 'explicit empty list stays an unbind');
  const rows = gamepadControlRows(map);
  assert.equal(rows[2][2], 'unbound — Settings → Controls');
  // A wheel slice keeps naming the wheel — unbinding its (empty) seat changes nothing.
  assert.deepEqual(map.countermeasure, []);
  assert.match(rows[10][2], /context wheel/);
});

test('a chord names every button it holds', () => {
  const map = { ...GAMEPAD_DEFAULT_BINDINGS, fire: ['r2', 'r1'] };
  const rows = gamepadControlRows(map);
  assert.equal(rows[2][2], 'RT or RB');
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
