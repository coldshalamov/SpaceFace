// TEACH-09 — "The Help screen lists the live pad chords, read from the live binding table".
//
// Before this line the Help Gamepad sheet had a frozen literal table and an early return that
// served it whenever the resolved map was the stock one — i.e. on the DEFAULT route, for every
// player who had never opened Settings → Controls. Four of the 22 GAMEPAD_DEFAULT_BINDINGS
// (accept, tabPrev, tabNext, hullBurst) appeared nowhere on the sheet at all, even though
// Settings offered a rebind row for every one of them.
//
// Run: node --test test/teach-09-pad-chord-sheet.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { gamepadControlRows, GAMEPAD_ROW_ACTIONS } from '../src/ui/screens/help.js';
import {
  resolveGamepadBindings, GAMEPAD_DEFAULT_BINDINGS, GAMEPAD_BUTTON_LABELS, GAMEPAD_DUAL_LABELS,
  gamepadButtonNames,
} from '../src/systems/gamepad.js';

function padState(custom) {
  const settings = { controls: { gamepad: { enabled: true, deadzone: 0.12, invertY: false } } };
  if (custom) settings.controls.gamepad.bindings = custom;
  return { settings };
}

function byLabel(rows) {
  return new Map(rows.map(row => [row[0], row[2]]));
}

test('every pad binding the game declares has exactly one row, and no row invents a verb', () => {
  // The heart of the done-check. Proven over the row table itself rather than over rendered text,
  // so adding a binding to GAMEPAD_DEFAULT_BINDINGS without adding a Help row fails HERE.
  const declared = Object.keys(GAMEPAD_DEFAULT_BINDINGS).sort();
  const listed = GAMEPAD_ROW_ACTIONS.map(([, action]) => action).sort();
  assert.deepEqual(listed, declared,
    'Help\'s row table must cover every declared pad binding, and only declared bindings');

  const labels = GAMEPAD_ROW_ACTIONS.map(([label]) => label);
  assert.equal(new Set(labels).size, labels.length, 'two rows share a label');

  const rows = gamepadControlRows(null);
  assert.equal(rows.length, declared.length + 4,
    'one row per binding, plus two sticks and two verbs a pad does not own');
  for (const expected of ['Accept / confirm', 'Station tab: previous', 'Station tab: next']) {
    assert.ok(rows.some(r => r[0] === expected), `Help is missing a row for "${expected}"`);
  }
  // The hull burst is a boost upgrade now (owner principle 2026-09-30): no pad binding, so no row.
  assert.ok(!rows.some(r => r[0] === 'Hull burst'), 'no phantom row for the retired burst verb');
});

test('a player who never opens Settings still reads the dual Xbox/PlayStation register', () => {
  // The regression this line exists for: a stock map must render the shipped copy, not a
  // differently-spelled one, and must not fall back to "no button".
  const rows = byLabel(gamepadControlRows(null));
  assert.equal(rows.get('Fire'), 'RT / R2');
  assert.equal(rows.get('Mine beam'), 'LT / L2');
  assert.equal(rows.get('Boost'), 'RB / R1');
  assert.equal(rows.get('Brake / reverse'), 'LB / L1');
  assert.equal(rows.get('Shove (repulsor)'), 'Y / △');
  assert.equal(rows.get('Accept / confirm'), 'A / Cross');
  assert.equal(rows.get('Massline'), 'A / Cross');
  assert.equal(rows.get('Countermeasure'), 'R3');
  assert.equal(rows.get('Drop bomb'), 'D-Pad Right');
  assert.equal(rows.get('Cycle bomb-bay payload'), 'D-Pad Left');
  assert.equal(rows.get('Cycle target'), 'X / □');
  assert.equal(rows.get('Open star-map'), 'View / Select');
  assert.equal(rows.get('Open codex'), 'Guide (or Pause → Codex)');
  assert.equal(rows.get('Pause'), 'Start / Options');
  assert.equal(rows.get('Dock / activate'), 'B / ○ (when prompted)');
  assert.equal(rows.get('Cancel / back'), 'B / ○');
  assert.equal(rows.get('Station tab: previous'), 'LB / L1');
  assert.equal(rows.get('Station tab: next'), 'RB / R1');
  assert.equal(rows.get('Travel burn'), 'L3');
  assert.equal(rows.get('Auto-target'), 'D-Pad Up');
  assert.equal(rows.get('Detonate charge'), 'D-Pad Down');
});

test('the frozen default map and a null map render the same sheet', () => {
  assert.deepEqual(gamepadControlRows(GAMEPAD_DEFAULT_BINDINGS), gamepadControlRows(null));
});

test('a remap re-labels the sheet in the same short register Settings shows', () => {
  // The dual Xbox/PlayStation pairing is only true of the shipped layout. After a rebind the
  // sheet must name the button the player actually moved the verb to, in the same register the
  // Settings remap row uses, or the two screens disagree again.
  const map = resolveGamepadBindings(padState({ codex: [], dock: ['home'] }).settings);
  assert.deepEqual(map.dock, ['home']);
  const rows = byLabel(gamepadControlRows(map));
  assert.equal(rows.get('Dock / activate'), 'Home (when prompted)');
  assert.equal(rows.get('Fire'), 'RT', 'an untouched verb keeps the stock button');
  assert.equal(rows.get('Massline'), 'A');
});

test('no button is invented: every printed name comes from the label vocabulary', () => {
  // The Do-not: do not hardcode the list. No standard button name may reach player text, and the
  // dual spellings live in exactly one place — the gamepad vocabulary owner.
  const stdNames = new Set(Object.keys(GAMEPAD_BUTTON_LABELS));
  const printed = new Set();
  for (const row of gamepadControlRows(null)) {
    for (const token of String(row[2]).split(/[\s/→]+/)) printed.add(token.trim());
  }
  for (const name of stdNames) {
    assert.ok(!printed.has(name), `raw standard name "${name}" leaked into player-facing text`);
  }
  // Every dual spelling must be a real button's spelling, not invented copy.
  for (const [name, dual] of Object.entries(GAMEPAD_DUAL_LABELS)) {
    assert.ok(stdNames.has(name), `GAMEPAD_DUAL_LABELS names unknown button "${name}"`);
    assert.equal(typeof dual, 'string');
    assert.ok(dual.length > 0);
  }

  const helpSource = readFileSync(new URL('../src/ui/screens/help.js', import.meta.url), 'utf8');
  for (const literal of ['RT / R2', 'LB / L1', 'Y / △', 'A / Cross', 'X / □', 'View / Select', 'B / ○']) {
    assert.ok(!helpSource.includes(literal),
      `Help hardcodes the button spelling "${literal}"; it must be projected from the vocabulary`);
  }
});

test('a multi-button binding names every button it holds instead of truncating to the first', () => {
  // A binding is an ARRAY precisely so a verb can answer to more than one button, and reading
  // [0] silently drops the rest. Note honestly: through resolveGamepadBindings a chord is
  // currently unreachable — all 17 standard buttons have a single owner and share legality is
  // limited to a modal/flight pair plus accept|massline — so this pins the defensive behaviour
  // at the projection seam rather than claiming a live player path.
  const chordMap = { ...GAMEPAD_DEFAULT_BINDINGS, fire: ['r2', 'r3'] };
  const rows = byLabel(gamepadControlRows(chordMap));
  assert.equal(rows.get('Fire'), 'RT or R3', 'a chord must not lose its second button');

  assert.deepEqual(gamepadButtonNames('fire', chordMap), ['r2', 'r3']);
  assert.deepEqual(gamepadButtonNames('fire', { fire: ['not_a_button', 'r2'] }), ['r2'],
    'unknown standard names are dropped, known ones kept in order');
  assert.deepEqual(gamepadButtonNames('fire', { fire: 'r2' }), [],
    'a bare string is not a binding list');
});

test('an unbound button says so, and the retired burst verb leaves no phantom row', () => {
  // Two different causes, two different sentences. A verb the game ships with no default button
  // is the game's gap; saying "unbound — Settings" there blames the player's profile.
  const cleared = byLabel(gamepadControlRows(
    resolveGamepadBindings(padState({ countermeasure: [] }).settings)));
  assert.equal(cleared.get('Countermeasure'), 'unbound — Settings → Controls',
    'a binding the player cleared is their choice and says so');

  // The hull burst is a boost upgrade now (owner principle 2026-09-30): no pad verb, so the sheet
  // must not carry a Hull burst row at all — an unbound row for a keyless verb teaches a ghost.
  const shipped = byLabel(gamepadControlRows(null));
  assert.ok(!shipped.has('Hull burst'), 'no Hull burst row: the upgrade rides the boost button');
  assert.ok(!('hullBurst' in GAMEPAD_DEFAULT_BINDINGS), 'and no pad action to bind');
});

test('the static rows are keyed by label, so inserting a row cannot mis-target one', () => {
  // An index-keyed "these rows have no action" set silently freezes the WRONG row the first time
  // a row is inserted above it. The four static rows must be named, not numbered.
  const helpSource = readFileSync(new URL('../src/ui/screens/help.js', import.meta.url), 'utf8');
  assert.ok(!/GAMEPAD_STATIC_ROW_INDEXES/.test(helpSource),
    'static rows must not be marked by index');
  assert.match(helpSource, /GAMEPAD_STATIC_LABELS/);
  const rows = byLabel(gamepadControlRows(null));
  assert.equal(rows.get('Fly (yaw + throttle)'), 'Left stick');
  assert.equal(rows.get('Aim weapons'), 'Right stick');
  assert.equal(rows.get('Anchor Mass Seed'), 'keyboard verb — rebind under Settings → Controls');
  assert.equal(rows.get('Open mission log'), 'Start / Options → Pause → Mission Log');
});
