// NXI-228 — diagnostic GL work stays out of the repaired normal hot path.
// The GL call instrumentation is a method-call counter installed only when the explicit
// perfCounters opt-in is set (?perfCounters=1 or window.__SPACEFACE_PERF_COUNTERS__); the
// uninstrumented path keeps Three's own methods untouched — no wrapper, not even a boolean
// read. No per-entity/per-frame getError/getParameter/checkFramebufferStatus exists at all.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('GL instrumentation installs only under the explicit opt-in', async () => {
  const source = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  const flag = source.indexOf('if (perfCountersRequested())');
  const install = source.indexOf('installGlInstrumentation(instrumentedGl');
  assert.ok(flag > 0, 'perfCountersRequested gate exists');
  assert.ok(install > flag, 'the only installGlInstrumentation call lives inside the gate');
  // Only one instrumentation site, and it is the gated one.
  assert.equal(source.split('installGlInstrumentation').length - 1, 2,
    'one import plus one gated call site, no second installer');
});

test('the normal path issues no diagnostic GL queries', async () => {
  const source = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\.getError\(/, 'no getError in the renderer frame path');
  assert.doesNotMatch(source, /\.getParameter\(/, 'no getParameter in the renderer frame path');
  assert.doesNotMatch(source, /checkFramebufferStatus/, 'no framebuffer status polling');
  // Legitimate context-lifecycle calls are allowed to remain — they are not queries.
  assert.match(source, /isContextLost/, 'context-loss checks stay (they are not diagnostics)');
});

test('the diagnostic module itself performs no GL queries — counting only', async () => {
  const source = await readFile(new URL('../src/render/glInstrumentation.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\.getError\(/);
  assert.doesNotMatch(source, /\.getParameter\(/);
  assert.doesNotMatch(source, /checkFramebufferStatus/);
});

test('the opt-in is explicit and never ambient', async () => {
  const source = await readFile(new URL('../src/core/perfCounters.js', import.meta.url), 'utf8');
  assert.match(source, /__SPACEFACE_PERF_COUNTERS__ === true/);
  assert.match(source, /perfCounters'\) === '1'/);
  assert.match(source, /if \(typeof window === 'undefined'\) return false/);
});
