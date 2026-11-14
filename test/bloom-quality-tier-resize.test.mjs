import assert from 'node:assert/strict';
import test from 'node:test';
import { createBloom } from '../src/render/bloom.js';
import { getPostRenderTargetTelemetry } from '../src/render/postTelemetry.js';

function harness() {
  let target = null;
  const draws = [];
  return {
    draws,
    renderer: {
      capabilities: { isWebGL2: false, maxSamples: 0 },
      autoClear: true,
      getRenderTarget: () => target,
      setRenderTarget(value) { target = value; },
      setViewport() {}, getViewport(out) { return out.set(0, 0, 844, 390); },
      setScissor() {}, getScissor(out) { return out.set(0, 0, 844, 390); },
      setScissorTest() {}, getScissorTest() { return false; },
      clear() {},
      render() { draws.push(target); },
    },
  };
}

function targets(bloom) {
  return bloom.contextLossResources().filter((resource) => resource.isWebGLRenderTarget);
}

function assertLevels(bloom, expected) {
  const d = bloom.diagnostics();
  assert.equal(d.levels, expected);
  assert.equal(d.bloomPasses, expected);
}

for (const option of ['bloomLevels', 'maxLevels']) {
  test(`${option} applies both directions without resize and retains steady targets`, () => {
    const h = harness();
    const bloom = createBloom(h.renderer, 844, 390);
    try {
      bloom.setContentScale(0.34);
      const original = targets(bloom);
      const disposed = [];
      for (const target of original) target.addEventListener('dispose', () => disposed.push(target));
      assertLevels(bloom, 4); // Tier two deliberately means four halo levels.
      bloom.setOptions({ [option]: 1 });
      assertLevels(bloom, 1);
      const narrow = targets(bloom);
      // LOOK-04: a tier change only picks how many allocated levels run; nothing is freed or allocated,
      // so auto-quality stepping mid-flight can't hitch on render-target churn.
      assert.equal(narrow.length, 5);
      assert.ok(narrow.every((target) => original.includes(target)), 'every target is reused');
      assert.equal(disposed.length, 0, 'a tier change disposes nothing');
      bloom.render({}, {});
      assert.equal(h.draws.length, 3, 'scene, one bloom pass, composite');
      bloom.setOptions({ [option]: 2 });
      assertLevels(bloom, 4);
      const wide = targets(bloom);
      assert.equal(wide.length, 5);
      assert.ok(narrow.every((target) => wide.includes(target)));
      assert.equal(disposed.length, 0);
      const d = bloom.diagnostics();
      assert.equal(d.contentScale, 0.34);
      assert.equal(d.contentWidth, 287);
      assert.equal(d.contentHeight, 133);
      h.draws.length = 0;
      const allocationsBefore = getPostRenderTargetTelemetry().renderTargetAllocationsTotal;
      let steadyDisposals = 0;
      for (const target of wide) target.addEventListener('dispose', () => steadyDisposals++);
      for (let frame = 0; frame < 3; frame++) {
        bloom.setOptions({ [option]: 2 });
        bloom.setSize(844, 390);
        bloom.render({}, {});
        assert.deepEqual(targets(bloom), wide, 'steady frames neither replace nor allocate targets');
      }
      assert.equal(getPostRenderTargetTelemetry().renderTargetAllocationsTotal, allocationsBefore);
      assert.equal(steadyDisposals, 0);
      assert.equal(h.draws.length, 27, 'each wide frame has scene, four bloom downsamples, three upsamples, composite');
      assert.equal(disposed.length, 0);
    } finally { bloom.dispose(); }
  });
}

test('quality survives orientation resize, disabled updates and compositor reconstruction', () => {
  const h = harness();
  let bloom = createBloom(h.renderer, 844, 390);
  try {
    bloom.setOptions({ bloomLevels: 1 });
    assertLevels(bloom, 1);
    bloom.setSize(390, 844);
    assertLevels(bloom, 1);
    bloom.setOptions({ bloomLevels: 2 });
    assertLevels(bloom, 1); // Small-width gate still limits portrait.
    bloom.setSize(844, 390);
    assertLevels(bloom, 4);
    bloom.enabled = false;
    bloom.setOptions({ bloomLevels: 1 });
    assertLevels(bloom, 0);
    assert.equal(targets(bloom).length, 1);
    bloom.enabled = true;
    assertLevels(bloom, 1);
    bloom.rebuild();
    assertLevels(bloom, 1);
    bloom.dispose();
    // Continue creates a fresh compositor before applying saved video options.
    bloom = createBloom(h.renderer, 844, 390);
    bloom.setOptions({ bloomLevels: 1 });
    assertLevels(bloom, 1);
    bloom.setSize(844, 390, 1688, 780);
    const before = bloom.diagnostics();
    bloom.setOptions({ bloomLevels: 2 });
    assertLevels(bloom, 4);
    assert.equal(bloom.diagnostics().casSharpenActive, before.casSharpenActive);
    assert.deepEqual(bloom.diagnostics().casSharpenTarget, before.casSharpenTarget);
  } finally { bloom.dispose(); }
});
