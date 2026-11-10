// inf-scar-identity — the wound remembers the weapon.
//
// A hull scar used to be one fixed amber line no matter what made it: in a furball every mark on
// every hull read identically, and weapon hits left no mark at all. Now an unshielded weapon hit
// leaves a scar that glows in the striking weapon's own colors for SCAR_WEAPON_COOL_S, then cools
// into the shared burn amber; collisions stay unnamed; a re-strike re-heats the wound.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  SCAR_WEAPON_COOL_S,
  createScarBook,
  noteHullScar,
  scarDrawColor,
  scarWorldEnds,
} from '../src/render/vfx/effectsCause.js';

const AMBER = [0.86, 0.62, 0.34];
const ION = [0.04, 0.66, 1.0]; // a cyan ion lance, linear-ish

function hitAt(book, hullId, now, weapon, severity = 0.3) {
  return noteHullScar(book, {
    hullId,
    lx: 1, lz: 2,
    tx: 0.6, tz: 0.8,
    severity,
    now,
    weapon,
  });
}

test('a weapon hit stores the striking weapon color and glows in it while fresh', () => {
  const book = createScarBook(8);
  const slot = hitAt(book, 'hull-1', 10.0, ION);
  assert.equal(slot.wr, ION[0]);
  assert.equal(slot.wg, ION[1]);
  assert.equal(slot.wb, ION[2]);

  const rgb = scarDrawColor(slot, 10.2, [0, 0, 0]);
  // Fresh: the drawn color must be far closer to the ion cyan than to the burn amber.
  const dIon = Math.hypot(rgb[0] - ION[0], rgb[1] - ION[1], rgb[2] - ION[2]);
  const dAmber = Math.hypot(rgb[0] - AMBER[0], rgb[1] - AMBER[1], rgb[2] - AMBER[2]);
  assert.ok(dIon < dAmber, `fresh scar should read ion (dIon=${dIon.toFixed(3)} dAmber=${dAmber.toFixed(3)})`);
});

test('the scar cools into the shared burn amber after SCAR_WEAPON_COOL_S', () => {
  const book = createScarBook(8);
  const slot = hitAt(book, 'hull-1', 0.0, ION);
  const cooled = scarDrawColor(slot, SCAR_WEAPON_COOL_S + 0.01, [0, 0, 0]);
  assert.deepEqual(
    cooled.map((v) => Number(v.toFixed(6))),
    AMBER.map((v) => Number(v.toFixed(6))),
  );
  // Monotonic cool-off: each later sample sits closer to amber than the previous one.
  let prevD = Infinity;
  for (let age = 0; age <= SCAR_WEAPON_COOL_S + 0.001; age += 0.2) {
    const rgb = scarDrawColor(slot, age, [0, 0, 0]);
    const d = Math.hypot(rgb[0] - AMBER[0], rgb[1] - AMBER[1], rgb[2] - AMBER[2]);
    assert.ok(d <= prevD + 1e-9, `cooling must be monotonic at age ${age.toFixed(2)}`);
    prevD = d;
  }
});

test('a collision scar (no weapon named) always draws burn amber', () => {
  const book = createScarBook(8);
  const slot = hitAt(book, 'hull-1', 5.0, null);
  assert.equal(slot.wr, null);
  const fresh = scarDrawColor(slot, 5.0, [0, 0, 0]);
  const old = scarDrawColor(slot, 500.0, [0, 0, 0]);
  assert.deepEqual(fresh, AMBER);
  assert.deepEqual(old, AMBER);
});

test('a re-strike on the same wound re-heats it and re-names the weapon', () => {
  const book = createScarBook(8);
  hitAt(book, 'hull-1', 0.0, ION);
  // Later strike with a different weapon family on the same spot (within the 1.2 wu merge radius).
  const slot = hitAt(book, 'hull-1', 9.0, [1.0, 0.35, 0.08], 0.5);
  assert.equal(book.slots.length, 1, 'merged into the existing wound');
  assert.equal(slot.severity, 0.5, 'severity takes the max');
  const rgb = scarDrawColor(slot, 9.1, [0, 0, 0]);
  assert.ok(rgb[0] > rgb[2], 're-struck wound should read hot-orange now, not ion cyan');
});

test('reusing a capped slot clears the previous life weapon color', () => {
  const book = createScarBook(2);
  hitAt(book, 'hull-a', 1.0, ION);
  hitAt(book, 'hull-b', 2.0, ION);
  // Third hit overflows: the oldest slot (hull-a) is reused, now by an unnamed collision.
  const reused = hitAt(book, 'hull-c', 3.0, null);
  assert.equal(reused.hullId, 'hull-c');
  assert.equal(reused.wr, null, 'stale weapon color must not survive slot reuse');
  assert.deepEqual(scarDrawColor(reused, 3.0, [0, 0, 0]), AMBER);
});

test('weapon color changes only the draw color, never the scar geometry', () => {
  const bookA = createScarBook(8);
  const bookB = createScarBook(8);
  const hull = { id: 'hull-1', alive: true, rot: 0.7, pos: { x: 40, z: -12 } };
  const a = hitAt(bookA, 'hull-1', 4.0, ION);
  const b = hitAt(bookB, 'hull-1', 4.0, null);
  const endsA = scarWorldEnds(a, hull, 4.1);
  const endsB = scarWorldEnds(b, hull, 4.1);
  assert.deepEqual(endsA, endsB, 'identity color must not move or reshape the mark');
});

test('the live owners are wired: unshielded weapon hits name the weapon, collisions stay unnamed', () => {
  const impact = readFileSync(new URL('../src/render/vfx/weaponImpactVfx.js', import.meta.url), 'utf8');
  assert.match(impact, /_noteWeaponHitScar\(pos, tgt, wax \/ wl, waz \/ wl, profile\)/);
  assert.match(
    impact,
    /if \(!hitShield && tgt && tgt\.pos\) \{[\s\S]{0,400}?_noteWeaponHitScar/,
    'the scar is noted for bare-hull hits only, before the presenter paths return',
  );
  const marks = readFileSync(new URL('../src/render/vfx/causeMarks.js', import.meta.url), 'utf8');
  assert.match(marks, /scarDrawColor\(slot, now, this\._scarRgb\)/, 'the draw path colors scars from the slot');
  const vfx = readFileSync(new URL('../src/render/vfx.js', import.meta.url), 'utf8');
  assert.match(vfx, /Collisions stay unnamed/, 'the collision path documents that it names no weapon');
});
