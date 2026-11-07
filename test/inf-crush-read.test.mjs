// inf-crush-read — the crush verdict reads at the anvil.
// The survival rooms' crusher bite (inf-crusher-bite) publishes combat:crushed and no render
// or audio path ever subscribed: the room's signature death read like any other hit spray.
// crushRead.js owns the plan; this file pins its decisions. Pure module — no sim chain.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isCrushMoment,
  crushHue,
  crushColorCss,
  crushPlan,
  CRUSH_SPEED_FLOOR_WU,
  CRUSH_SPEED_FULL_WU,
  CRUSH_PRIORITY,
} from '../src/render/vfx/crushRead.js';

const CRUSH = { entityId: 51, toyId: 'crusher_a1', damage: 34, speed: 58, attackerId: 0, t: 120, tick: 7200 };

test('gate: a crush reads only from a target, a positive speed and a positive damage', () => {
  assert.equal(isCrushMoment(CRUSH), true);
  assert.equal(isCrushMoment({ ...CRUSH, speed: 0 }), false, 'a scrape is not a crush');
  assert.equal(isCrushMoment({ ...CRUSH, damage: 0 }), false, 'no bite, no beat');
  assert.equal(isCrushMoment({ ...CRUSH, entityId: null }), false);
  assert.equal(isCrushMoment(null), false);
});

test('hue: the crush wears the collision family steel, never a second language', () => {
  const hue = crushHue();
  for (const c of hue) assert.ok(c >= 0 && c <= 1);
  assert.match(crushColorCss(hue), /^rgb\(\d+,\d+,\d+\)$/);
});

test('plan: the pop keys to the closing band and caps; a bearing flattens, none keeps it round', () => {
  const floor = crushPlan(CRUSH_SPEED_FLOOR_WU, 20, false, 1.2);
  const full = crushPlan(CRUSH_SPEED_FULL_WU, 60, false, 1.2);
  const over = crushPlan(CRUSH_SPEED_FULL_WU + 80, 90, false, 1.2);
  assert.ok(full.pop.size1 > floor.pop.size1, 'a harder crumple pops bigger');
  assert.ok(full.light.peak > floor.light.peak, 'a harder crumple lights harder');
  assert.deepEqual(over.pop, full.pop, 'the band caps — 160 wu/s reads like 80');
  assert.equal(floor.pop.along, 1.2, 'the pop stretches along the closing bearing');
  const blind = crushPlan(58, 34, false, null);
  assert.equal(blind.pop.along, null, 'no bearing, no stretch');
  assert.equal(blind.sparks, null, 'no bearing, no directed fan');
});

test('plan: the kill star exists only when the receipt emptied the hull', () => {
  const killed = crushPlan(58, 34, true, 0);
  const survived = crushPlan(58, 34, false, 0);
  assert.ok(killed.kill, 'a crush kill carries the star');
  assert.equal(survived.kill, null, 'a grind that the hull survived does not');
  assert.ok(killed.kill.life > killed.pop.life * 2, 'the star outlives the pop');
});

test('plan: reduced motion keeps a floor beat and a light — a danger tell is never silenced', () => {
  const full = crushPlan(58, 34, false, 0.5, false);
  const reduced = crushPlan(58, 34, false, 0.5, true);
  assert.ok(reduced.pop.size1 > 2, 'the reduced pop still reads');
  assert.ok(reduced.light.peak > 1, 'the reduced light still lands');
  assert.ok(reduced.light.peak < full.light.peak, 'reduced holds a floor, not the full peak');
});

test('priority: combat band, below the break reads', () => {
  assert.ok(CRUSH_PRIORITY > 0 && CRUSH_PRIORITY <= 1);
});
