// INF-086 — show why a full hold changes handling. The HUD cargo chip read volume
// only, so a hold of lead and a hold of feathers looked identical while the ship
// flew very differently. Now the chip appends the live handling consequence — the
// same load factor that scales the flown accelerations — and the tooltip names
// carried vs design mass. Volume stays the only capacity: the number bends handling,
// never gates loading.
import test from 'node:test';
import assert from 'node:assert/strict';

import { getDerivedStats } from '../src/systems/ships.js';
import { cargoHandlingNote, cargoMassLine } from '../src/ui/hud.js';

const SHIP = 'ship_kestrel';
const laden = (usedMass) => getDerivedStats(SHIP, [], { cargo: { usedMass } });

test('a heavy load reads its live thrust penalty', () => {
  const derived = laden(50);
  assert.ok(derived.massLoadFactor < 1, 'over design mass');
  const note = cargoHandlingNote(derived);
  assert.ok(note, 'a consequence shows');
  assert.equal(note.text, `-${Math.round((1 - derived.massLoadFactor) * 100)}% thrust`, 'the penalty is the live factor');
  assert.equal(note.pct, Math.round((1 - derived.massLoadFactor) * 100), 'numeric half matches');
});

test('the penalty is the factor flight actually scales by', () => {
  const derived = laden(200);
  assert.equal(derived.propulsion.massLoadFactor, derived.massLoadFactor, 'one number, one owner');
  const note = cargoHandlingNote(derived);
  assert.equal(note.pct, Math.round((1 - derived.propulsion.massLoadFactor) * 100), 'chip and flight agree');
});

test('a light load reads full thrust with its mass stated', () => {
  const derived = laden(0);
  assert.equal(cargoHandlingNote(derived), null, 'no consequence at design mass');
  assert.equal(cargoMassLine(derived), 'Mass: 0 / design 32', 'mass still stated');
});

test('a full-volume load of feathers earns no penalty', () => {
  // The helper takes no volume input at all: only mass bends the readout, so volume
  // can fill without consequence. Feathers are mass 0.5 on a 32-design hull.
  const derived = laden(0.5);
  assert.equal(cargoHandlingNote(derived), null, 'volume never invents a penalty');
});

test('collecting and jettisoning move the readout monotonically', () => {
  const readings = [0, 20, 50, 120, 300].map((m) => {
    const note = cargoHandlingNote(laden(m));
    return note ? note.pct : 0;
  });
  for (let i = 1; i < readings.length; i++) {
    assert.ok(readings[i] >= readings[i - 1], `heavier never reads lighter (${readings.join(',')})`);
  }
  assert.ok(readings.at(-1) > readings[0], 'a full heavy hold reads worse than empty');
});

test('missing mass accounting reads nothing, never zero', () => {
  assert.equal(cargoHandlingNote(null), null, 'null derived');
  assert.equal(cargoHandlingNote({}), null, 'no load factor');
  assert.equal(cargoHandlingNote({ massLoadFactor: 1 }), null, 'exactly design');
  assert.equal(cargoMassLine(null), null, 'null derived');
  assert.equal(cargoMassLine({ cargoMass: 5 }), null, 'no design, no claim');
});
