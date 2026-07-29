// PERF: Tier-1 counter substrate — the zero-cost-when-off contract and the GL context wrappers.
//
// These tests exist to defeat one specific failure mode. Almost every budget this system will gate
// on is a ZERO-budget ("post-boot shader compiles: 0", "forced layouts per frame: 0"), and a zero
// budget has a silent failure: a dead hook and a perfectly healthy frame produce the same output.
// A counter suite that only asserts "it reported 0" would pass just as happily if the wrappers were
// never installed at all.
//
// So every counter here is tested in BOTH directions: disabled must not move it, and enabled must.
// The negative assertions are the zero-cost contract; the positive ones are the vacuity guard. Each
// pair is falsifiable — deleting the `if (!enabled) return` guard in perfCounters.js fails the
// disabled tests, and skipping installGlInstrumentation fails the enabled ones.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COUNTER_FIELDS,
  DETERMINISTIC_FIELDS,
  createPerfCounters,
  diffDeterministicCounters,
} from '../src/core/perfCounters.js';
import { installGlInstrumentation } from '../src/render/glInstrumentation.js';

/**
 * Minimal stand-in for a WebGL2 context. Every method records its own invocation and returns a
 * sentinel, so the wrappers can be checked for argument pass-through AND return-value pass-through —
 * a wrapper that swallowed a return value would break `createFramebuffer` in a way no count would
 * reveal.
 */
function createFakeGl() {
  const calls = [];
  const gl = {};
  const methods = [
    'linkProgram', 'compileShader', 'createFramebuffer', 'renderbufferStorage',
    'renderbufferStorageMultisample', 'texImage2D', 'texSubImage2D', 'texStorage2D',
    'generateMipmap', 'bufferData', 'bufferSubData', 'drawArrays', 'drawElements',
    'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements', 'useProgram', 'bindTexture',
  ];
  for (const name of methods) {
    gl[name] = function (...args) {
      calls.push({ name, args, self: this });
      return `${name}:return`;
    };
  }
  return { gl, calls };
}

test('a disabled counter set records nothing, no matter how hard it is called', () => {
  const counters = createPerfCounters();
  assert.equal(counters.isEnabled(), false, 'counters must default to OFF');

  for (let i = 0; i < 5_000; i++) {
    counters.beginFrame();
    counters.countShaderLink('cache-key', 'name');
    counters.countShaderCompile();
    counters.countRenderTargetAllocation(1920, 1080);
    counters.countRenderTargetResize(1920, 1080);
    counters.countTextureUpload(true);
    counters.countTextureUpload(false);
    counters.countMipmapGeneration();
    counters.countBufferUpload(true, 4096);
    counters.countBufferUpload(false, 128);
    counters.countDraw(false);
    counters.countDraw(true);
    counters.countProgramSwitch();
    counters.countTextureBind();
    counters.countDomMutation('childList');
    counters.countLayoutRead();
    counters.countLongTask();
    counters.recordStepsThisFrame(3);
    counters.sampleHeap(1_000_000 + i);
    counters.recordEvent('synthetic', { i });
    counters.endFrame();
  }

  const snapshot = counters.snapshot();
  for (const field of COUNTER_FIELDS) {
    assert.equal(snapshot.totals[field], 0, `${field} must stay 0 while disabled`);
  }
  // The event list and histogram are the allocating paths. If the disabled guard were missing these
  // would hold 512 entries and a histogram bucket — this is the assertion that actually pins
  // "no allocation when off" rather than merely "no counting when off".
  assert.equal(snapshot.events.length, 0, 'no event may be allocated while disabled');
  assert.equal(snapshot.eventsDropped, 0, 'a disabled counter must not even reach the drop path');
  assert.deepEqual(snapshot.stepsPerFrameHistogram, {}, 'no histogram bucket while disabled');
  assert.equal(snapshot.framesObserved, 0, 'endFrame must not advance the frame index while disabled');
  assert.equal(snapshot.nondeterministic.allocation.samples, 0, 'no heap sample while disabled');
});

test('an enabled counter set records every family — the vacuity guard', () => {
  const counters = createPerfCounters();
  counters.setEnabled(true);

  counters.beginFrame();
  counters.countShaderLink('key-a', 'material-a');
  counters.countShaderCompile();
  counters.countRenderTargetAllocation(800, 600);
  counters.countRenderTargetResize(800, 600);
  counters.countTextureUpload(true);
  counters.countTextureUpload(false);
  counters.countMipmapGeneration();
  counters.countBufferUpload(true, 4096);
  counters.countBufferUpload(false, 128);
  counters.countDraw(false);
  counters.countDraw(true);
  counters.countProgramSwitch();
  counters.countTextureBind();
  counters.countDomMutation('childList');
  counters.countDomMutation('attributes');
  counters.countLayoutRead();
  counters.countLongTask();
  counters.recordStepsThisFrame(2);
  counters.endFrame();

  const snapshot = counters.snapshot();
  assert.equal(snapshot.totals.shaderLinks, 1);
  assert.equal(snapshot.totals.shaderCompiles, 1);
  assert.equal(snapshot.totals.renderTargetAllocations, 1);
  assert.equal(snapshot.totals.renderTargetResizes, 1);
  assert.equal(snapshot.totals.textureUploads, 1);
  assert.equal(snapshot.totals.textureSubUploads, 1);
  assert.equal(snapshot.totals.mipmapGenerations, 1);
  assert.equal(snapshot.totals.bufferFullUploads, 1);
  assert.equal(snapshot.totals.bufferPartialUploads, 1);
  assert.equal(snapshot.totals.bufferUploadBytes, 4096 + 128);
  assert.equal(snapshot.totals.drawCalls, 2, 'an instanced draw is still a draw call');
  assert.equal(snapshot.totals.drawInstancedCalls, 1);
  assert.equal(snapshot.totals.programSwitches, 1);
  assert.equal(snapshot.totals.textureBinds, 1);
  assert.equal(snapshot.totals.domMutations, 2);
  assert.equal(snapshot.totals.domChildListMutations, 1);
  assert.equal(snapshot.totals.domAttributeMutations, 1);
  assert.equal(snapshot.totals.layoutReads, 1);
  assert.equal(snapshot.totals.longTasks, 1);
  assert.deepEqual(snapshot.stepsPerFrameHistogram, { 2: 1 });
  assert.equal(snapshot.framesObserved, 1);
});

test('counts are per-frame: beginFrame clears, totals and peak accumulate', () => {
  const counters = createPerfCounters();
  counters.setEnabled(true);

  counters.beginFrame();
  counters.countDraw();
  counters.countDraw();
  counters.countDraw();
  counters.endFrame();

  counters.beginFrame();
  counters.countDraw();
  counters.endFrame();

  const snapshot = counters.snapshot();
  assert.equal(snapshot.totals.drawCalls, 4, 'totals accumulate across frames');
  assert.equal(snapshot.peakPerFrame.drawCalls, 3, 'peak is the worst SINGLE frame, not the total');
  assert.equal(snapshot.nonZeroFrames.drawCalls, 2);
});

test('the boot boundary separates post-boot counts from boot counts', () => {
  const counters = createPerfCounters();
  counters.setEnabled(true);

  // Boot: two frames that each link a program.
  for (let i = 0; i < 2; i++) {
    counters.beginFrame();
    counters.countShaderLink(`boot-${i}`);
    counters.endFrame();
  }
  counters.markBootBoundary();
  counters.beginFrame();
  counters.endFrame();
  // Post-boot: one more link. This is the number every zero-budget in the brief is about.
  counters.beginFrame();
  counters.countShaderLink('post-boot');
  counters.endFrame();

  const snapshot = counters.snapshot();
  assert.equal(snapshot.totals.shaderLinks, 3, 'totals still count the boot ramp');
  assert.equal(snapshot.postBoot.shaderLinks, 1, 'only the post-boundary link is post-boot');
});

test('setEnabled(false) then (true) resets rather than blending two capture windows', () => {
  const counters = createPerfCounters();
  counters.setEnabled(true);
  counters.beginFrame();
  counters.countDraw();
  counters.endFrame();
  counters.setEnabled(false);
  counters.setEnabled(true);

  assert.equal(counters.snapshot().totals.drawCalls, 0,
    're-enabling must start a fresh window; blending two windows produces a report whose provenance '
    + 'is invisible in the output');
});

test('diffDeterministicCounters compares the allowlist and ignores the rest', () => {
  const a = { totals: {} };
  const b = { totals: {} };
  for (const field of COUNTER_FIELDS) { a.totals[field] = 0; b.totals[field] = 0; }

  // drawCalls is culling-dependent and deliberately NOT in the allowlist.
  assert.ok(!DETERMINISTIC_FIELDS.includes('drawCalls'));
  b.totals.drawCalls = 999;
  assert.deepEqual(diffDeterministicCounters(a, b), [],
    'a nondeterministic field must never fail the equivalence gate');

  b.totals.shaderLinks = 1;
  const differences = diffDeterministicCounters(a, b);
  assert.equal(differences.length, 1);
  assert.equal(differences[0].field, 'shaderLinks');
});

// --- GL instrumentation ------------------------------------------------------------------------

test('GL wrappers count every family and pass arguments and return values through', () => {
  const { gl, calls } = createFakeGl();
  const counters = createPerfCounters();
  counters.setEnabled(true);
  const handle = installGlInstrumentation(gl, counters);
  assert.ok(handle.wrapped.includes('linkProgram'), 'linkProgram must be wrapped');

  counters.beginFrame();
  const framebuffer = gl.createFramebuffer();
  gl.linkProgram('program-a');
  gl.compileShader('shader-a');
  gl.renderbufferStorage('target', 'format', 1920, 1080);
  gl.texImage2D('a', 'b', 'c');
  gl.texSubImage2D('a', 'b', 'c');
  gl.generateMipmap('target');
  gl.bufferData('target', new Uint8Array(4096), 'usage');
  gl.bufferSubData('target', 0, new Uint8Array(128));
  gl.drawElements('mode', 6, 'type', 0);
  gl.drawElementsInstanced('mode', 6, 'type', 0, 4);
  counters.endFrame();

  const snapshot = counters.snapshot();
  assert.equal(snapshot.totals.shaderLinks, 1);
  assert.equal(snapshot.totals.shaderCompiles, 1);
  assert.equal(snapshot.totals.renderTargetAllocations, 1);
  assert.equal(snapshot.totals.renderTargetResizes, 1);
  assert.equal(snapshot.totals.textureUploads, 1);
  assert.equal(snapshot.totals.textureSubUploads, 1);
  assert.equal(snapshot.totals.mipmapGenerations, 1);
  assert.equal(snapshot.totals.bufferFullUploads, 1);
  assert.equal(snapshot.totals.bufferPartialUploads, 1);
  assert.equal(snapshot.totals.bufferUploadBytes, 4096 + 128,
    'byte accounting must read byteLength from the payload, not count calls');
  assert.equal(snapshot.totals.drawCalls, 2);
  assert.equal(snapshot.totals.drawInstancedCalls, 1);

  // A wrapper that dropped the return value would break createFramebuffer with no counter effect.
  assert.equal(framebuffer, 'createFramebuffer:return', 'return values must pass through');
  const draw = calls.find((call) => call.name === 'drawElementsInstanced');
  assert.deepEqual(draw.args, ['mode', 6, 'type', 0, 4], 'all arguments must pass through unchanged');
  const storage = calls.find((call) => call.name === 'renderbufferStorage');
  assert.deepEqual(storage.args, ['target', 'format', 1920, 1080]);
  // `this` must remain the context or any native implementation would throw an illegal-invocation.
  assert.ok(draw.self === gl, 'the wrapper must preserve the receiver');
});

test('bufferData counts the size-only overload as bytes', () => {
  const { gl } = createFakeGl();
  const counters = createPerfCounters();
  counters.setEnabled(true);
  installGlInstrumentation(gl, counters);

  counters.beginFrame();
  gl.bufferData('target', 8192, 'usage');   // allocation-only overload: arg is a byte count
  counters.endFrame();

  assert.equal(counters.snapshot().totals.bufferUploadBytes, 8192);
});

test('useProgram and bindTexture count switches, not calls', () => {
  const { gl } = createFakeGl();
  const counters = createPerfCounters();
  counters.setEnabled(true);
  installGlInstrumentation(gl, counters);

  counters.beginFrame();
  gl.useProgram('p1');
  gl.useProgram('p1');   // redundant rebind — THREE does this; it is not a state change
  gl.useProgram('p2');
  gl.bindTexture('t', 'tex1');
  gl.bindTexture('t', 'tex1');
  counters.endFrame();

  const snapshot = counters.snapshot();
  assert.equal(snapshot.totals.programSwitches, 2,
    'counting every useProgram call would measure THREE call patterns rather than GPU state changes');
  assert.equal(snapshot.totals.textureBinds, 1);
});

test('uninstall restores the original methods exactly', () => {
  const { gl } = createFakeGl();
  const counters = createPerfCounters();
  counters.setEnabled(true);
  const before = gl.drawElements;
  const handle = installGlInstrumentation(gl, counters);
  assert.ok(gl.drawElements !== before, 'install must actually replace the method');

  handle.uninstall();
  assert.ok(gl.drawElements === before, 'uninstall must restore the ORIGINAL, not another wrapper');

  counters.beginFrame();
  gl.drawElements('mode', 6, 'type', 0);
  counters.endFrame();
  assert.equal(counters.snapshot().totals.drawCalls, 0, 'an uninstalled context must not count');
});

test('installing twice is a no-op rather than a double count', () => {
  const { gl } = createFakeGl();
  const counters = createPerfCounters();
  counters.setEnabled(true);
  const first = installGlInstrumentation(gl, counters);
  const second = installGlInstrumentation(gl, counters);
  assert.ok(first === second, 'the second install must return the existing handle');

  counters.beginFrame();
  gl.drawElements('mode', 6, 'type', 0);
  counters.endFrame();
  assert.equal(counters.snapshot().totals.drawCalls, 1,
    'double-wrapping would double every count and make uninstall restore a wrapper');

  // And uninstall must still fully restore, not leave one layer behind.
  first.uninstall();
  assert.equal(gl.__sfInstrumentation, undefined);
});

test('a context missing a method is skipped rather than throwing', () => {
  // WebGL1 has no drawArraysInstanced or texStorage2D. Instrumentation must degrade, not explode.
  const { gl } = createFakeGl();
  delete gl.drawArraysInstanced;
  delete gl.texStorage2D;
  const counters = createPerfCounters();
  counters.setEnabled(true);

  const handle = installGlInstrumentation(gl, counters);
  assert.ok(!handle.wrapped.includes('drawArraysInstanced'));
  assert.ok(handle.wrapped.includes('drawElements'), 'present methods are still wrapped');
});
