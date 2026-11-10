// S6 — a readable horde (design/program/finish/swarm/PLANS.md S6).
// The horde reads on the five toxic hues at draw scale ×1.5; collisions stay untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SWARM_BROOD_FAMILIES, swarmBroodFamily } from '../src/data/swarmBrood.js';
import { swarmBroodCharacterFor, SWARM_BROOD_CHARACTER } from '../src/data/swarmCharacter.js';

// The plan's five toxic hues — every family sits on exactly one of them.
const HUES = [
  [1.00, 0.38, 0.05], // electric orange — mite, charger
  [1.00, 0.48, 0.04], // electric orange (hot dash variant)
  [0.45, 1.00, 0.08], // acid green — spitter
  [0.52, 0.95, 0.16], // acid green — spore drift
  [1.00, 0.10, 0.55], // hot pink — lantern cyst
  [1.00, 0.82, 0.42], // white-gold — glassback
  [0.95, 0.72, 0.28], // white-gold — bellows
  [0.62, 0.18, 1.00], // violet — leecher
  [0.55, 0.22, 1.00], // violet — wake eel
];

test('every base brood family carries the E1 ×1.5 draw scale from the character sheet', () => {
  for (const family of SWARM_BROOD_FAMILIES) {
    const row = swarmBroodCharacterFor(family.id);
    assert.ok(row, `${family.id} has a character-sheet row`);
    assert.equal(row.drawScale, 1.5, `${family.id} draws at ×1.5`);
    // Collision honesty: the draw scale never touched the sim radius band.
    assert.ok(family.radius > 0 && family.radius < 12, `${family.id} radius still in the light band`);
  }
  assert.equal(SWARM_BROOD_CHARACTER.length, SWARM_BROOD_FAMILIES.length, 'sheet covers every base family');
});

test('every base brood family sits saturated on one of the five toxic hues', () => {
  for (const family of SWARM_BROOD_FAMILIES) {
    const [r, g, b] = family.bodyColor;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    assert.ok(max >= 0.9, `${family.id} is saturated (peak ${max.toFixed(2)})`);
    assert.ok(max - min >= 0.5, `${family.id} is not a pastel (spread ${(max - min).toFixed(2)})`);
    const onHue = HUES.some((h) => Math.hypot(h[0] - r, h[1] - g, h[2] - b) < 0.12);
    assert.ok(onHue, `${family.id} sits on a named hue, got [${r}, ${g}, ${b}]`);
    // The emissive is a lit version of the same hue, not a different voice.
    const [er, eg, eb] = family.bodyEmissive;
    assert.ok(Math.hypot(er - r * 0.85, eg - g * 0.85, eb - b * 0.85) < 0.45,
      `${family.id} emissive is its own hue lit`);
  }
});

test('no two families share the same hue pair — a watcher reads family from colour', () => {
  const seen = new Set();
  for (const family of SWARM_BROOD_FAMILIES) {
    const key = family.bodyColor.map((c) => c.toFixed(2)).join(',');
    assert.ok(!seen.has(key), `${family.id} reuses ${key}`);
    seen.add(key);
  }
});

test('the palette stays off the player\'s cyan and gold', () => {
  for (const family of SWARM_BROOD_FAMILIES) {
    const [r, g, b] = family.bodyColor;
    // Cyan = high green+blue, low red. Gold = high red+green, low blue.
    const cyanish = g > 0.7 && b > 0.7 && r < 0.4;
    const goldish = r > 0.9 && g > 0.7 && b < 0.25;
    assert.ok(!cyanish, `${family.id} reads cyan — that is the player's`);
    assert.ok(!goldish || family.id === 'glassback' || family.id === 'bellows',
      `${family.id} reads gold — white-gold is reserved for the armoured pair`);
  }
});

test('swarmBroodFamily resolves every sheet family id', () => {
  for (const row of SWARM_BROOD_CHARACTER) {
    assert.ok(swarmBroodFamily(row.familyId), row.familyId);
  }
});
