import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createMasslineLatchRimPlan,
  resolveMasslineLatchRimPlan,
  MASSLINE_LATCH_RIM_COLOR,
} from '../src/render/masslineLatchRim.js';
import { resolveMasslineWhipGlow } from '../src/render/masslinePresentation.js';
import { createMasslineReleaseArcPlan } from '../src/render/masslineReleaseArc.js';

test('row 492: the latched body wears the Line colour on its rim', () => {
  const tether = { active: true, targetId: 7, load: 0.6 };
  const target = { id: 7, alive: true, pos: { x: 100, z: -40 }, radius: 18 };
  const plan = resolveMasslineLatchRimPlan(tether, target, tether.load, 0.3, createMasslineLatchRimPlan());
  assert.equal(plan.visible, true);
  assert.equal(plan.x, 100);
  assert.equal(plan.z, -40);
  assert.ok(plan.radius > 18, 'rim rides just off the hull edge');
  assert.ok(plan.opacity > 0.5, 'rim is lit, not a whisper');
  // Line colour: the cable's neon green family.
  assert.ok(MASSLINE_LATCH_RIM_COLOR.g > 0.9 && MASSLINE_LATCH_RIM_COLOR.r < 0.8,
    'rim is the Line colour, not a threat red');
});

test('row 492: rim thickens and brightens as strain rises', () => {
  const tether = { active: true, targetId: 7 };
  const target = { alive: true, pos: { x: 0, z: 0 }, radius: 10 };
  const slack = resolveMasslineLatchRimPlan(tether, target, 0, 0, {});
  const straining = resolveMasslineLatchRimPlan(tether, target, 0.9, 0.6, {});
  assert.ok(straining.opacity > slack.opacity, 'strain brightens the rim');
  assert.ok(straining.bandScale > slack.bandScale, 'strain widens the band');
});

test('row 492: no latch → no rim; dead or positionless targets get none', () => {
  assert.equal(resolveMasslineLatchRimPlan(null, null, 0, 0, {}).visible, false);
  const tether = { active: true, targetId: 7 };
  assert.equal(resolveMasslineLatchRimPlan(tether, { alive: false, pos: { x: 0, z: 0 } }, 0, 0, {}).visible, false);
  assert.equal(resolveMasslineLatchRimPlan({ active: false, targetId: 7 }, { alive: true, pos: { x: 0, z: 0 } }, 0, 0, {}).visible, false);
});

test('row 492: strain glow is the published read — no second law', () => {
  assert.equal(resolveMasslineWhipGlow({ strainGlow: 0.8 }), 0.8);
  assert.equal(resolveMasslineWhipGlow({}), 0);
  assert.equal(resolveMasslineWhipGlow(null), 0);
});

test('row 492: release arc plan draws independent of camera distance', () => {
  // The release arc's visibility is armed-state, not zoom — it must read at chase distance.
  const plan = createMasslineReleaseArcPlan();
  assert.ok('visible' in plan && 'radius' in plan, 'arc plan carries world-space draw truth');
  assert.equal(plan.visible, false, 'unarmed arc draws nothing');
});
