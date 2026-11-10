// FB-008 — the speed gauge shows overspeed the kernel deliberately preserves.
// Seed 4242. The band is |vel| − governed combat speed. The 100% mark does not move.
// Below the governed speed the band is zero.

import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveGovernedCombatSpeed } from '../src/core/flight/propulsionCatalog.js';
import { overspeedBand, overspeedBandScale, setKitGauge, velocityRailModel } from '../src/ui/views/velocityRail.js';

const SEED = 4242;

test('FB-008: a seed-4242 exit above governed speed is a band, and decay clears it', () => {
  const governed = 140;
  const ship = {
    id: 1,
    combatSpeed: governed,
    maxSpeed: 172,
    vel: { x: governed + 26, z: 0 },
  };
  const state = { seed: SEED, tick: 0, simTime: 0 };
  const reference = resolveGovernedCombatSpeed(ship, state, ship.maxSpeed);
  assert.equal(reference, governed, 'the gauge keys off governed combat speed, not legacy maxSpeed');
  const speed = Math.hypot(ship.vel.x, ship.vel.z);
  const above = velocityRailModel(speed, reference);
  assert.equal(above.overspeed, overspeedBand(speed, reference));
  assert.equal(above.overspeed, 26);
  assert.equal(above.fraction, 1, 'the 100% mark stays the governed speed');
  assert.equal(above.aboveReference, true);

  ship.vel.x = governed - 8;
  const decayed = Math.hypot(ship.vel.x, ship.vel.z);
  const below = velocityRailModel(decayed, reference);
  assert.equal(below.overspeed, 0);
  assert.ok(below.fraction < 1);
});

function gauge() {
  const node = () => {
    const attrs = new Map();
    const box = {
      textContent: '',
      style: {},
      setAttribute(k, v) { attrs.set(k, String(v)); },
      getAttribute: (k) => attrs.get(k) ?? null,
      hasAttribute: (k) => attrs.has(k),
      removeAttribute(k) { attrs.delete(k); },
    };
    return box;
  };
  const root = node();
  const source = node();
  const fill = node();
  const over = node();
  const cursor = node();
  const digits = node();
  const glyphs = Array.from({ length: 5 }, node);
  source.textContent = '0';
  const selectors = {
    '[data-k="speed"]': source,
    '.sf-speed__digits': digits,
    '.sf-speed__reference b': node(),
    '.sf-speed__extent': node(),
    '.sf-speed__fill': fill,
    '.sf-speed__over': over,
    '.sf-speed__cursor': cursor,
  };
  root.querySelector = (sel) => selectors[sel] ?? null;
  root.querySelectorAll = () => glyphs;
  root.addEventListener = () => {};
  return { root, source, fill, over, cursor };
}

test('FB-008: the second-color band shows the earned surplus and the 100% mark stays', () => {
  const governed = 140;
  const { root, source, fill, over, cursor } = gauge();
  source.textContent = '166';
  setKitGauge(root, 166, governed);
  assert.equal(root.getAttribute('data-overspeed'), '26');
  assert.equal(fill.style.transform, 'scaleX(1)');
  assert.equal(cursor.style.transform, 'translateX(100.000%)');
  assert.equal(over.style.transform, `scaleX(${overspeedBandScale(26, governed)})`);
  assert.ok(overspeedBandScale(26, governed) > 0);
  assert.ok(overspeedBandScale(26, governed) < 1);
  assert.match(root.getAttribute('aria-valuetext'), /26 earned past the governed mark/);
  assert.match(root.getAttribute('aria-valuetext'), /above reference, not a speed limit/);

  source.textContent = '132';
  setKitGauge(root, 132, governed);
  assert.equal(root.getAttribute('data-overspeed'), '0');
  assert.equal(over.style.transform, 'scaleX(0)');
  assert.notEqual(fill.style.transform, 'scaleX(1)');
  assert.doesNotMatch(root.getAttribute('aria-valuetext'), /earned past/);
});
