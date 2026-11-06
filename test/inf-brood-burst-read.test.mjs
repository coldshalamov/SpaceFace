// inf-brood-burst-read — a brood bomb's death blast finally reads.
//
// The player story: a Lantern Cyst or Bellows dying — or a volatile-marked mite popping —
// shoves every neighbor, shatters neighbors, and can chip the player's hull, yet the glass
// showed nothing. The engine's `swarm:broodBurst` receipt carried the blast (pos, radius,
// familyId, strain) and no render path ever subscribed: a bomb went off invisibly in a
// 200-body furball. Now vfx.js consumes the receipt through broodBurstRead's plan — flash,
// vent, star and a reach-keyed beat light, all wearing the family's own hue.
//
// These tests pin the pure decision layer (src/render/vfx/broodBurstRead.js); the vfx
// adapter spawns exactly what the plan names (subscription wired in vfx.js _subscribe).
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BROOD_BURST_PRIORITY,
  broodBurstColorCss,
  broodBurstHue,
  broodBurstPlan,
  isBroodBurstMoment,
} from '../src/render/vfx/broodBurstRead.js';
import { SWARM_BROOD_FAMILIES } from '../src/data/swarmBrood.js';
import { SWARM_BROOD_LATE_FAMILIES, SWARM_BROOD_STRAINS } from '../src/data/swarmBroodLate.js';
import { SWARM_MACHINE_FAMILIES } from '../src/data/swarmMachine.js';

test('only a real blast receipt plays: finite position, positive reach', () => {
  assert.equal(isBroodBurstMoment(null), false);
  assert.equal(isBroodBurstMoment({ radius: 90 }), false, 'no position is no burst');
  assert.equal(isBroodBurstMoment({ pos: { x: Number.NaN, z: 0 }, radius: 90 }), false,
    'a non-finite position is no burst');
  assert.equal(isBroodBurstMoment({ pos: { x: 5, z: 6 }, radius: 0 }), false,
    'a zero reach is no burst');
  assert.equal(isBroodBurstMoment({ pos: { x: 5, z: 6 }, radius: -3 }), false);
  assert.equal(isBroodBurstMoment({ pos: { x: 5, z: 6 }, radius: 46 }), true);
});

test('the burst wears the family\'s own voice — vent is the body colour, flash burns hot', () => {
  const cyst = SWARM_BROOD_FAMILIES.find((d) => d.id === 'lantern_cyst');
  assert.ok(cyst, 'the live roster names the cyst');
  const hue = broodBurstHue('lantern_cyst', null);
  assert.deepEqual(hue.ventRgb, cyst.bodyColor.map((v) => Math.max(0, Math.min(1, v))),
    'the vent keeps the family\'s body colour');
  for (let i = 0; i < 3; i++) {
    assert.ok(hue.flashRgb[i] > hue.ventRgb[i], 'the core burns hotter than the vent');
    assert.ok(hue.flashRgb[i] <= 1, 'the flash never leaves the gamut');
  }
  // Every live family the engine can name on the receipt resolves — none falls back.
  for (const def of [...SWARM_BROOD_FAMILIES, ...SWARM_BROOD_LATE_FAMILIES, ...SWARM_MACHINE_FAMILIES]) {
    const h = broodBurstHue(def.id, null);
    assert.notDeepEqual(h.ventRgb, broodBurstHue(null, null).ventRgb,
      `${def.id} keeps its own voice instead of the fallback green`);
  }
});

test('a strain pop wears the strain\'s mark tint — the pale-hot mites pop as they cook', () => {
  const volatile = SWARM_BROOD_STRAINS.find((s) => s.id === 'volatile');
  const hue = broodBurstHue('mite', 'volatile');
  assert.deepEqual(hue.ventRgb, volatile.tint.map((v) => Math.max(0, Math.min(1, v))),
    'the strain tint outranks the family body colour');
});

test('unknown names fall to the brood\'s acid green, never to black', () => {
  const hue = broodBurstHue('family_that_never_shipped', null);
  for (const v of hue.ventRgb) assert.ok(v > 0.2, 'the fallback vent stays a colour');
  const strainHue = broodBurstHue('mite', 'strain_that_never_shipped');
  assert.deepEqual(strainHue.ventRgb, broodBurstHue('mite', null).ventRgb,
    'an unknown strain falls through to the family');
});

test('the plan sizes off the receipt\'s actual blast radius — a bellouts reads bigger than a pop', () => {
  const hue = broodBurstHue('lantern_cyst', null);
  const pop = broodBurstPlan(46, hue);    // the volatile strain's blast
  const cyst = broodBurstPlan(90, hue);   // the cyst's authored burst
  const bellows = broodBurstPlan(110, hue);
  assert.ok(bellows.flash.size1 > cyst.flash.size1, 'a wider blast draws a wider core');
  assert.ok(cyst.flash.size1 > pop.flash.size1);
  assert.ok(bellows.vent.size1 > pop.vent.size1, 'the gas reads the reach too');
  assert.ok(bellows.light.distance > pop.light.distance, 'the light reaches like the blast');
  assert.equal(cyst.light.severity, 'beat', 'the light rides the director\'s beat row');
  // The authored band clamps: extremes stay readable, never a screen-wide card.
  const huge = broodBurstPlan(4000, hue);
  assert.ok(huge.flash.size1 <= 10 && huge.light.distance <= 180,
    'the core and light clamp at the authored ceiling');
  assert.ok(broodBurstPlan(46, hue).vent.drift > 0, 'the vent drifts out over the blast');
  // A degenerate radius still builds a playable plan (the adapter gates it anyway).
  const sane = broodBurstPlan(Number.NaN, hue);
  assert.ok(sane.flash.size1 > 0 && sane.vent.op0 > 0);
});

test('the plan\'s colours are valid CSS so the sprite and light paths accept them', () => {
  const plan = broodBurstPlan(90, broodBurstHue('bellows', null));
  for (const part of [plan.flash, plan.vent, plan.star]) {
    assert.match(part.color, /^rgb\(\d+,\d+,\d+\)$/);
  }
  assert.equal(broodBurstColorCss([1.4, -0.2, 0.5]), 'rgb(255,0,128)',
    'the css helper clamps the gamut');
  assert.equal(BROOD_BURST_PRIORITY > 0.5 && BROOD_BURST_PRIORITY < 0.8, true,
    'the burst claims slots between scenery and hull collisions');
});
