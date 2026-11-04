// inf-wound-smoke — the smoke a wounded ship trails comes out of the wounds it actually has.
//
// The trail tick only ever read `hull / hullMax` and breathed a generic grey blob from the hull
// centre, while the scar book already held hull-local wound seats with severities, ages and the
// striking weapon's own colors. A ship hit twice on one flank smoked symmetrically; nothing on
// screen said WHERE it was hurt or WHICH gun opened it. Now the smoke rises from the hottest
// recorded wounds, the freshest hardest-hit flank smokes hardest, and a wound inside the vent
// window breathes a beat of the striking weapon's tinted vapor before it greys. Field/DoT damage
// with no contact scar keeps the legacy centre offsets.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  WOUND_SMOKE_MAX,
  WOUND_VENT_S,
  collectHullWounds,
  resolveWoundBeat,
  woundHeat,
  woundWorldPoint,
} from '../src/render/vfx/woundSmoke.js';

function bookWith(slots) {
  return { capacity: 24, slots, serial: slots.length + 1 };
}

function scar(hullId, born, severity, weapon = null) {
  return {
    hullId,
    lx: 2, lz: -1, ux: 0, uz: 1,
    severity,
    born,
    serial: 1,
    wr: weapon ? weapon[0] : null,
    wg: weapon ? weapon[1] : null,
    wb: weapon ? weapon[2] : null,
  };
}

const NOW = 100;

test('the hottest wounds come first and the plan caps at the emitter budget', () => {
  const book = bookWith([
    scar('h1', NOW - 10, 0.3),                 // old, light
    scar('h1', NOW - 0.2, 0.7),                // fresh, heavy — should lead
    scar('h1', NOW - 4, 0.5),                  // mid
    scar('h2', NOW - 1, 0.9),                  // another hull, never collected
    scar('h1', NOW - 6, 0.2),
    scar('h1', NOW - 2, 0.6),
    scar('h1', NOW - 3, 0.55),                 // would outrank if the cap leaked
  ]);
  const out = [];
  const wounds = collectHullWounds(book, 'h1', NOW, out);
  assert.equal(wounds.length, WOUND_SMOKE_MAX);
  assert.equal(wounds[0].slot.severity, 0.7, 'the fresh heavy wound leads the plan');
  // Sorted hottest first — the emitter round-robins a ranked damage map.
  for (let i = 1; i < wounds.length; i++) {
    assert.ok(wounds[i - 1].heat >= wounds[i].heat, 'plan is ordered by heat');
  }
  // Every slot belongs to the hull that was asked for.
  for (const row of wounds) assert.equal(row.slot.hullId, 'h1');
});

test('a fresh severe wound outranks an older one even at equal severity', () => {
  const fresh = scar('h1', NOW - 0.5, 0.5);
  const old = scar('h1', NOW - 40, 0.5);
  assert.ok(woundHeat(fresh, NOW) > woundHeat(old, NOW));
  // Persistence across a fight: an old scar still smokes, it just loses to fresh metal.
  assert.ok(woundHeat(old, NOW) > 0);
});

test('wounds convert from hull-local seats to the world the scar lines draw in', () => {
  const hull = { id: 'h1', alive: true, pos: { x: 500, z: -220 }, rot: Math.PI / 2 };
  const slot = scar('h1', NOW - 1, 0.6);
  slot.lx = 3; slot.lz = -2;
  const out = {};
  const point = woundWorldPoint(slot, hull, out);
  assert.equal(point, out);
  // rot 90°: world = pos + (c*lx - s*lz, s*lx + c*lz) = (500 - lz, 220... ) — check exact maths.
  const c = Math.cos(Math.PI / 2);
  const s = Math.sin(Math.PI / 2);
  assert.ok(Math.abs(out.x - (500 + c * 3 - s * -2)) < 1e-9);
  assert.ok(Math.abs(out.z - (-220 + s * 3 + c * -2)) < 1e-9);
});

test('a dead or unpositioned hull hosts no wound point', () => {
  const slot = scar('h1', NOW - 1, 0.6);
  assert.equal(woundWorldPoint(slot, { alive: false, pos: { x: 0, z: 0 }, rot: 0 }, {}), null);
  assert.equal(woundWorldPoint(slot, { alive: true, pos: null, rot: 0 }, {}), null);
  assert.equal(woundWorldPoint(null, { alive: true, pos: { x: 0, z: 0 }, rot: 0 }, {}), null);
});

test('a fresh named-weapon wound vents the weapon tint; it greys inside the vent window', () => {
  const plasma = [1.0, 0.42, 0.08];
  const slot = scar('h1', NOW - 0.3, 0.6, plasma);
  const beat = resolveWoundBeat(slot, NOW, {});
  assert.ok(beat.vent01 > 0 && beat.vent01 <= 1, 'inside the vent window');
  assert.ok(beat.r > 0.5, 'plasma red carries into the vapor');
  assert.ok(beat.b < 0.45, 'cool blue channels stay low');
  // Past the window the vent is over — the grey smoke keeps saying "hurt here".
  const cooled = resolveWoundBeat(scar('h1', NOW - WOUND_VENT_S - 0.01, 0.6, plasma), NOW, {});
  assert.equal(cooled.vent01, 0);
  assert.ok(cooled.r < 0.5);
});

test('collisions and unnamed legacy scars never vent a color they do not have', () => {
  const beat = resolveWoundBeat(scar('h1', NOW - 0.2, 0.6, null), NOW, {});
  assert.equal(beat.vent01, 0);
  // An unnamed wound still smokes.
  assert.ok(beat.heat > 0);
});

test('a reused beat scratch never carries a stale vent or tint', () => {
  const out = {};
  resolveWoundBeat(scar('h1', NOW - 0.2, 0.6, [1, 0.4, 0.1]), NOW, out);
  assert.ok(out.vent01 > 0);
  resolveWoundBeat(scar('h1', NOW - 30, 0.2, null), NOW, out);
  assert.equal(out.vent01, 0);
});

test('absent books and hulls without wounds plan nothing', () => {
  assert.equal(collectHullWounds(null, 'h1', NOW, []).length, 0);
  assert.equal(collectHullWounds(bookWith([scar('h2', NOW, 0.9)]), 'h1', NOW, []).length, 0);
  assert.equal(collectHullWounds(bookWith([]), 'h1', NOW, []).length, 0);
});

test('the live owner is wired: the trail tick smokes the scar book, not the hull centre', () => {
  const vfx = readFileSync(new URL('../src/render/vfx.js', import.meta.url), 'utf8');
  // The import line may grow (later wound reads share the module); pin the symbols, not the set.
  assert.match(vfx, /import \{[^}]*collectHullWounds[^}]*\} from '\.\/vfx\/woundSmoke\.js';/);
  assert.match(vfx, /import \{[^}]*resolveWoundBeat[^}]*\} from '\.\/vfx\/woundSmoke\.js';/);
  assert.match(vfx, /collectHullWounds\(causeLayer\.scars, e\.id, this\._causeNow\(\)/,
    'the emitter reads the same scar book the scar lines draw from');
  assert.match(vfx, /beat\.vent01 > 0/, 'the fresh wound breathes its weapon tint');
  // The fallback stays: field/DoT damage with no scars still smokes from the hull.
  assert.match(vfx, /venting from multiple breaches/);
});
