// X5 final review — the long Help sheet must not teach a key the live context refuses.
// The short card was already filtered; the Interface / Gamepad / Touch reference below it still
// listed Star-map, Local map, Tech tree and Codex in a fight. The rows stay (discoverability) and
// carry the reason the gate refuses them.

import test from 'node:test';
import assert from 'node:assert/strict';

import { controlSections } from '../src/ui/screens/help.js';

const ENEMY = { id: 2, team: 1, alive: true };
const player = (extra = {}) => ({ id: 1, team: 0, hull: 100, hullMax: 100, ...extra });

function state({ targetId = null, playerOver = {}, ...over } = {}) {
  return {
    mode: 'flight',
    playerId: 1,
    run: null,
    ui: {},
    settings: { gameplay: { controlScheme: 'pilot' }, controls: {} },
    player: { targetId },
    entities: { get: (id) => (id === 1 ? player(playerOver) : id === 2 ? ENEMY : null) },
    ...over,
  };
}

function section(sections, heading) {
  const found = sections.find(([name]) => name === heading);
  assert.ok(found, `${heading} section exists`);
  return new Map(found[1].map((row) => [row[0], row]));
}

const IN_COMBAT = 'Unavailable in combat';
/** The note is the last cell; short rows omit the empty key cell, so do not index blindly. */
const noteOf = (row) => (row.includes(IN_COMBAT) ? IN_COMBAT : undefined);

test('combat marks the long Interface rows the UI gate refuses', () => {
  const sections = controlSections(state({ targetId: 2 }));
  const interfaceRows = section(sections, 'Interface (fixed keys)');
  for (const label of ['Star-map', 'Local system map', 'Tech tree', 'Codex']) {
    const row = interfaceRows.get(label);
    assert.ok(row, `${label} stays on the reference sheet`);
    assert.equal(noteOf(row), IN_COMBAT, `${label} is marked refused in combat`);
  }
  // The allowed instruments keep their rows clean: a fight can still pause, read, and save.
  for (const label of ['Mission log', 'Cargo hold', 'Comms log', 'Help', 'Pause']) {
    const row = interfaceRows.get(label);
    assert.ok(row, `${label} stays on the reference sheet`);
    assert.equal(noteOf(row), undefined, `${label} is not marked refused`);
  }
});

test('combat marks the Gamepad and Touch rows that open the refused screens', () => {
  const sections = controlSections(state({ targetId: 2 }));
  const pad = section(sections, 'Gamepad (Xbox / PlayStation)');
  for (const label of ['Open star-map', 'Open codex']) {
    assert.equal(noteOf(pad.get(label)), IN_COMBAT, `${label} is marked refused`);
  }
  assert.equal(noteOf(pad.get('Open mission log')), undefined, 'the mission log stays reachable');
  const touch = section(sections, 'Touch (phone / tablet)');
  for (const label of ['Open local map', 'Open star-map']) {
    assert.equal(noteOf(touch.get(label)), IN_COMBAT, `${label} is marked refused`);
  }
});

test('combat marks refused flight verbs too, and follows the low-hull flee', () => {
  const healthy = section(controlSections(state({ targetId: 2 })), 'Flight');
  assert.equal(noteOf(healthy.get('Travel burn (latch a long burn)')), IN_COMBAT,
    'a healthy fight refuses the travel burn');
  assert.equal(noteOf(healthy.get('Cruise drive (charge/drop)')), IN_COMBAT,
    'a fight refuses the cruise drive');
  assert.equal(noteOf(healthy.get('Fire weapons')), undefined, 'fire is admitted');
  const wounded = section(controlSections(state({ targetId: 2, playerOver: { hull: 10, hullMax: 100 } })), 'Flight');
  assert.equal(noteOf(wounded.get('Travel burn (latch a long burn)')), undefined,
    'the low-hull flee stays unmarked, because the gate admits it');
});

test('out of combat the full reference is unchanged', () => {
  const sections = controlSections(state());
  for (const heading of ['Interface (fixed keys)', 'Gamepad (Xbox / PlayStation)', 'Touch (phone / tablet)']) {
    for (const [, row] of section(sections, heading)) {
      assert.equal(noteOf(row), undefined, `${heading} row ${row[0]} carries no refusal note`);
    }
  }
  const interfaceRows = section(sections, 'Interface (fixed keys)');
  assert.ok(interfaceRows.has('Star-map'), 'flight still lists the chart key');
  assert.ok(interfaceRows.has('Tech tree'), 'flight still lists the tech key');
});
