import test from 'node:test';
import assert from 'node:assert/strict';

import { RECIPES } from '../src/data/audioRecipes.js';
import {
  DISTORTION_CURVE_SOFTCLIP,
  DISTORTION_CURVE_TANH,
  buildDistortionCurve,
  resolveDistortionCurve,
  sampleSoftclip,
  sampleTanhSaturation,
} from '../src/audio/synth.js';

const LEGACY_SOFTCLIP_IDS = Object.freeze(['sfx_wpn_beam_laser', 'sfx_squelch_danger']);

test('softclip and tanh are different transfer functions at the same amount', () => {
  const amount = 0.4;
  const x = 0.1;
  const soft = sampleSoftclip(x, amount);
  const tanh = sampleTanhSaturation(x, amount);
  assert.ok(Math.abs(soft - tanh) > 0.4, `expected a large curve delta, got ${soft} vs ${tanh}`);
});

test('softclip matches the pre-QoL cheap-clip formula', () => {
  const amount = 0.4;
  const k = 20;
  for (const x of [-1, -0.5, -0.1, 0, 0.1, 0.25, 0.5, 1]) {
    const expected = (1 + k) * x / (1 + k * Math.abs(x));
    assert.ok(Math.abs(sampleSoftclip(x, amount) - expected) < 1e-12);
  }
});

test('tanh matches the peak-normalized analog saturation formula', () => {
  const amount = 0.35;
  const drive = 1 + 0.35 * 4;
  const norm = Math.tanh(drive);
  for (const x of [-1, -0.5, -0.1, 0, 0.1, 0.25, 0.5, 1]) {
    const expected = Math.tanh(x * drive) / norm;
    assert.ok(Math.abs(sampleTanhSaturation(x, amount) - expected) < 1e-12);
  }
});

test('untagged recipes keep the pre-QoL soft-clip so authored amounts do not remap', () => {
  assert.equal(resolveDistortionCurve(undefined), DISTORTION_CURVE_SOFTCLIP);
  assert.equal(resolveDistortionCurve('softclip'), DISTORTION_CURVE_SOFTCLIP);
  assert.equal(resolveDistortionCurve('tanh'), DISTORTION_CURVE_TANH);
  const untagged = buildDistortionCurve(0.4);
  const softclip = buildDistortionCurve(0.4, DISTORTION_CURVE_SOFTCLIP);
  const tanh = buildDistortionCurve(0.4, DISTORTION_CURVE_TANH);
  assert.deepEqual(Array.from(untagged), Array.from(softclip));
  assert.notDeepEqual(Array.from(untagged), Array.from(tanh));
});

test('every recipe with distortionAmount names the curve it was authored against', () => {
  const withDistortion = RECIPES.filter((r) => r.distortionAmount);
  assert.ok(withDistortion.length >= 2, 'expected authored distortion recipes');
  for (const recipe of withDistortion) {
    assert.ok(
      recipe.distortionCurve === DISTORTION_CURVE_SOFTCLIP
        || recipe.distortionCurve === DISTORTION_CURVE_TANH,
      `${recipe.id} has distortionAmount ${recipe.distortionAmount} but no named curve`
    );
  }

  for (const id of LEGACY_SOFTCLIP_IDS) {
    const recipe = RECIPES.find((r) => r.id === id);
    assert.ok(recipe, `missing legacy recipe ${id}`);
    assert.equal(recipe.distortionCurve, DISTORTION_CURVE_SOFTCLIP, `${id} must keep the pre-QoL curve`);
  }

  const qol = withDistortion.filter((r) => !LEGACY_SOFTCLIP_IDS.includes(r.id));
  assert.ok(qol.length > 0, 'expected QoL recipes on the tanh curve');
  for (const recipe of qol) {
    assert.equal(recipe.distortionCurve, DISTORTION_CURVE_TANH, `${recipe.id} should use tanh`);
  }
});
