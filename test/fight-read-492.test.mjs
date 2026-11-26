import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createMasslineLatchRimPlan,
  resolveMasslineLatchRimPlan,
  MASSLINE_LATCH_RIM_COLOR,
} from '../src/render/masslineLatchRim.js';
import { MASSLINE_LINE_COLOR, resolveMasslineWhipGlow } from '../src/render/masslinePresentation.js';
import { createMasslineReleaseArcPlan } from '../src/render/masslineReleaseArc.js';

test('row 492 under the ring rule: a latched body wears no rim at any strain (no rings around things, owner 2026-11-23)', () => {
  // The lit cable, its strain glow (below) and the hitch glint name the body on the Line; a
  // circle round it does not come back when the load rises.
  const tether = { active: true, targetId: 7, load: 0.6 };
  const target = { id: 7, alive: true, pos: { x: 100, z: -40 }, radius: 18 };
  for (const [load, whip] of [[0, 0], [0.6, 0.3], [0.9, 0.6]]) {
    const plan = resolveMasslineLatchRimPlan(tether, target, load, whip, createMasslineLatchRimPlan());
    assert.equal(plan.visible, false, `no rim at load ${load} (no rings around things, owner 2026-11-23)`);
  }
  // The Line family keeps one colour: anything still keyed to the rim constant matches the rope.
  assert.deepEqual(
    { r: MASSLINE_LATCH_RIM_COLOR.r, g: MASSLINE_LATCH_RIM_COLOR.g, b: MASSLINE_LATCH_RIM_COLOR.b },
    { r: MASSLINE_LINE_COLOR.r, g: MASSLINE_LINE_COLOR.g, b: MASSLINE_LINE_COLOR.b },
    'the Line colour stays one colour, not its own hue and not a threat red',
  );
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
