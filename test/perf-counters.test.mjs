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
  perfCountersRequested,
  UNSOURCED_FIELDS,
} from '../src/core/perfCounters.js';
import { installGlInstrumentation } from '../src/render/glInstrumentation.js';
import { installDomInstrumentation } from '../src/ui/domInstrumentation.js';
import { ensurePerfRuntime } from '../src/core/perfRuntime.js';
import { startLoop } from '../src/core/loop.js';

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

// --- DOM instrumentation fixtures ---------------------------------------------------------

/** Minimal DOM node: just the parent/child links the mutation filter walks. */
function createFakeNode(tag = 'div') {
  return {
    tagName: String(tag).toUpperCase(),
    parentNode: null,
    childNodes: [],
    appendChild(child) {
      child.parentNode = this;
      this.childNodes.push(child);
      return child;
    },
    setAttribute(name, value) { (this.attributes ||= {})[name] = value; },
  };
}

/**
 * Minimal document: documentElement > body, plus an id registry so the test decides WHEN #hud
 * appears. Install must not require it to exist yet — renderer construction precedes the HUD
 * build, and a root captured once at install would be null forever.
 */
function createFakeDocument() {
  const documentElement = createFakeNode('html');
  const body = documentElement.appendChild(createFakeNode('body'));
  const byId = new Map();
  return {
    documentElement,
    body,
    getElementById(id) { return byId.get(id) ?? null; },
    registerId(id, element) { byId.set(id, element); return element; },
  };
}

function createFakeMutationObserverClass() {
  const instances = [];
  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.observations = [];
      this.disconnects = 0;
      instances.push(this);
    }
    observe(target, options) { this.observations.push({ target, options }); }
    disconnect() { this.disconnects++; }
    /** Test driver: deliver a batch exactly as the browser would — never after disconnect(). */
    deliver(records) { if (this.disconnects === 0) this.callback(records); }
  }
  return { FakeMutationObserver, instances };
}

function createFakePerformanceObserverClass({ supportLongTask = true } = {}) {
  const instances = [];
  class FakePerformanceObserver {
    constructor(callback) {
      this.callback = callback;
      this.disconnects = 0;
      instances.push(this);
    }
    observe(options) {
      if (!supportLongTask) throw new TypeError("'longtask' is not a supported entryType");
      this.observed = options;
    }
    disconnect() { this.disconnects++; }
    deliver(entries) { if (this.disconnects === 0) this.callback({ getEntries: () => entries }); }
  }
  return { FakePerformanceObserver, instances };
}

/**
 * Stand-ins for Element.prototype / HTMLElement.prototype. Every accessor returns the receiver
 * so a wrapper that lost `this` fails loudly; clientWidth additionally carries a SETTER so the
 * byte-identical restore covers the set field, and a write can be proven not to count as a read.
 */
function createFakeElementPrototypes() {
  const elementPrototype = {};
  const htmlElementPrototype = Object.create(elementPrototype);
  const defineAccessor = (proto, name, { withSetter = false } = {}) => {
    Object.defineProperty(proto, name, {
      get: function () { return this; },
      ...(withSetter ? { set: function (v) { this.__assigned = v; } } : {}),
      enumerable: true,
      configurable: true,
    });
  };
  defineAccessor(htmlElementPrototype, 'offsetWidth');
  defineAccessor(htmlElementPrototype, 'offsetHeight');
  defineAccessor(htmlElementPrototype, 'offsetTop');
  defineAccessor(htmlElementPrototype, 'offsetLeft');
  defineAccessor(elementPrototype, 'clientWidth', { withSetter: true });
  defineAccessor(elementPrototype, 'clientHeight');
  defineAccessor(elementPrototype, 'scrollWidth');
  defineAccessor(elementPrototype, 'scrollHeight');
  Object.defineProperty(elementPrototype, 'getBoundingClientRect', {
    value: function (...args) { return { self: this, args }; },
    writable: true,
    enumerable: false,
    configurable: true,
  });
  return { elementPrototype, htmlElementPrototype };
}

function createFakeWindow() {
  return {
    getComputedStyle(el) { return { arg: el, display: 'fake-block' }; },
  };
}

function normalizeDescriptor(desc) {
  if (!desc) return null;
  return {
    get: desc.get ?? null,
    set: desc.set ?? null,
    value: desc.value ?? null,
    writable: desc.writable ?? null,
    enumerable: desc.enumerable,
    configurable: desc.configurable,
  };
}

/** Every descriptor the layout producer could touch, for byte-identical before/after compares. */
function captureLayoutDescriptors({ elementPrototype, htmlElementPrototype }, win) {
  const names = [
    'offsetWidth', 'offsetHeight', 'offsetTop', 'offsetLeft',
    'clientWidth', 'clientHeight', 'scrollWidth', 'scrollHeight',
    'getBoundingClientRect',
  ];
  const captured = {};
  for (const [label, proto] of [['element', elementPrototype], ['htmlElement', htmlElementPrototype]]) {
    for (const name of names) {
      captured[`${label}.${name}`] = normalizeDescriptor(Object.getOwnPropertyDescriptor(proto, name));
    }
  }
  captured['window.getComputedStyle'] = normalizeDescriptor(Object.getOwnPropertyDescriptor(win, 'getComputedStyle'));
  return captured;
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

  // The DOM seam obeys the same zero-cost contract, in both senses of "off".
  //
  // 1. NOT INSTALLED. The only production call site is the renderer's `if (perfCountersRequested())`
  //    block; with the opt-in absent that block never runs, so no observer is constructed and no
  //    prototype descriptor is touched. The gate is replicated literally below so that a regression
  //    making installation unconditional fails this test.
  const prototypes = createFakeElementPrototypes();
  const win = createFakeWindow();
  const mo = createFakeMutationObserverClass();
  const po = createFakePerformanceObserverClass();
  const before = captureLayoutDescriptors(prototypes, win);
  if (perfCountersRequested()) {   // the renderer's gate, verbatim — false under node:test
    installDomInstrumentation(counters, {
      document: createFakeDocument(),
      MutationObserver: mo.FakeMutationObserver,
      PerformanceObserver: po.FakePerformanceObserver,
      elementPrototype: prototypes.elementPrototype,
      htmlElementPrototype: prototypes.htmlElementPrototype,
      window: win,
    });
  }
  assert.equal(mo.instances.length, 0, 'no MutationObserver may exist while instrumentation is off');
  assert.equal(po.instances.length, 0, 'no PerformanceObserver may exist while instrumentation is off');
  assert.deepEqual(captureLayoutDescriptors(prototypes, win), before,
    'Element/HTMLElement/Window descriptors must be untouched while instrumentation is off');

  // 2. INSTALLED AGAINST DISABLED COUNTERS — a combination production never creates, pinned
  //    anyway: the record() guard stops every DOM producer too.
  const doc = createFakeDocument();
  const handle = installDomInstrumentation(counters, {
    document: doc,
    MutationObserver: mo.FakeMutationObserver,
    PerformanceObserver: po.FakePerformanceObserver,
    elementPrototype: prototypes.elementPrototype,
    htmlElementPrototype: prototypes.htmlElementPrototype,
    window: win,
  });
  const hud = doc.registerId('hud', doc.body.appendChild(createFakeNode('div')));
  mo.instances[0].deliver([{ type: 'childList', target: hud }]);
  po.instances[0].deliver([{}]);
  const element = Object.create(prototypes.htmlElementPrototype);
  element.offsetWidth;
  element.getBoundingClientRect();
  win.getComputedStyle(element);
  assert.equal(counters.snapshot().totals.domMutations, 0);
  assert.equal(counters.snapshot().totals.layoutReads, 0);
  assert.equal(counters.snapshot().totals.longTasks, 0);
  handle.uninstall();
  assert.deepEqual(captureLayoutDescriptors(prototypes, win), before,
    'even the belt-and-braces install must uninstall cleanly');
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

test('work recorded OUTSIDE a frame pair still reaches totals', () => {
  // The defect this pins: if totals were accumulated in endFrame() from the per-frame bag, then
  // anything recorded between endFrame() and the next beginFrame() would be wiped by beginFrame()'s
  // reset and never counted. That is not a corner case — it is where most of the interesting work
  // happens:
  //   * the boot shader ramp links before the first presentation frame runs at all, and that ramp is
  //     the positive control that stops a post-boot zero from being vacuous;
  //   * precompilePipelines uses renderer.compileAsync, which completes on a promise continuation;
  //   * texture decodes and asset-load uploads land on their own callbacks.
  // The failure would read as GOOD NEWS — a smaller count, not an error — which is why it needs a
  // test that records with no enclosing frame at all.
  const counters = createPerfCounters();
  counters.setEnabled(true);

  counters.countShaderLink('before-any-frame');   // boot ramp: no frame has begun yet

  counters.beginFrame();
  counters.countShaderLink('inside-frame');
  counters.endFrame();

  counters.countShaderLink('async-continuation'); // e.g. compileAsync resolving between frames

  counters.beginFrame();                          // the reset that used to destroy the above
  counters.endFrame();

  const snapshot = counters.snapshot();
  assert.equal(snapshot.totals.shaderLinks, 3,
    'every link must reach totals regardless of whether a frame was open when it happened');
  assert.equal(snapshot.offFrame.shaderLinks, 2,
    'off-frame work is tracked separately: an async compile and a draw-time cache miss are '
    + 'different defects with different fixes');
  assert.equal(snapshot.peakPerFrame.shaderLinks, 1, 'peak stays a genuinely per-frame figure');
  assert.equal(snapshot.events.length, 3, 'and each one is still attributable');
});

test('the boot boundary applies to off-frame work too', () => {
  const counters = createPerfCounters();
  counters.setEnabled(true);

  counters.countShaderLink('boot-ramp');          // off-frame, pre-boundary
  counters.markBootBoundary();
  counters.countShaderLink('post-boot-async');    // off-frame, post-boundary

  const snapshot = counters.snapshot();
  assert.equal(snapshot.totals.shaderLinks, 2);
  assert.equal(snapshot.postBoot.shaderLinks, 1,
    'a compileAsync that resolves after boot is a post-boot compile even though no frame was open');
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

test('unsourced counters are declared so a vacuous zero cannot be read as healthy', () => {
  // A counter with no producer and a perfectly healthy subsystem both report 0. The list is
  // currently EMPTY — family H was wired in phase 3a and the heap sampler in phase 3c — but the
  // mechanism is pinned for future fields: a snapshot must republish whatever the list holds, the
  // list must reference real counter fields, and nothing on it may also be a deterministic gate
  // signal.
  const counters = createPerfCounters();
  counters.setEnabled(true);
  const snapshot = counters.snapshot();

  assert.deepEqual(snapshot.unsourcedFields, [...UNSOURCED_FIELDS],
    'the snapshot must republish the unsourced list, not drop it');
  for (const field of UNSOURCED_FIELDS) {
    assert.ok(COUNTER_FIELDS.includes(field),
      `${field} is declared unsourced but is not a counter field — a typo here silently un-declares `
      + 'a counter, restoring exactly the vacuous zero this list exists to prevent');
  }
  // Overlap would be incoherent: a field cannot be both a bisectable signal and unmeasured.
  for (const field of UNSOURCED_FIELDS) {
    assert.ok(!DETERMINISTIC_FIELDS.includes(field),
      `${field} cannot be both an equivalence-gate signal and unsourced`);
  }
});

test('the fields wired in phases 3a/3c are sourced and no longer declared unsourced', () => {
  // Wiring a producer without deleting the field from UNSOURCED_FIELDS leaves a measured counter
  // labelled "not measured", and downstream reports discard real data. Nothing else in the suite
  // forces that deletion, so this test does.
  for (const field of [
    'domMutations',
    'domChildListMutations',
    'domAttributeMutations',
    'domCharacterDataMutations',
    'layoutReads',
    'longTasks',
  ]) {
    assert.ok(COUNTER_FIELDS.includes(field), `${field} must remain a declared counter field`);
    assert.ok(!UNSOURCED_FIELDS.includes(field),
      `${field} has a producer now; leaving it unsourced restores exactly the vacuous-zero lie `
      + 'the list exists to prevent');
  }
});

// --- The runtime seam ---------------------------------------------------------------------------

test('the instrumentation opt-in is OFF unless a probe explicitly asks', () => {
  const originalWindow = globalThis.window;
  try {
    // No window at all (node-side sim routes): must not throw, must be off.
    delete globalThis.window;
    assert.equal(perfCountersRequested(), false, 'no window means no instrumentation, not a crash');

    globalThis.window = { location: { search: '' } };
    assert.equal(perfCountersRequested(), false, 'ordinary play must never arm the instrumentation');

    globalThis.window = { location: { search: '?debug=flight&perf=1' } };
    assert.equal(perfCountersRequested(), false,
      'the existing ?perf overlay flag must not arm GL wrapping — it is a different feature');

    globalThis.window = { location: { search: '?perfCounters=1' } };
    assert.equal(perfCountersRequested(), true);

    globalThis.window = { location: { search: '' }, __SPACEFACE_PERF_COUNTERS__: true };
    assert.equal(perfCountersRequested(), true, 'a pre-boot global is how a Playwright probe opts in');
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test('perfRuntime exposes counters on the parity-safe handle, disabled', () => {
  const originalWindow = globalThis.window;
  try {
    delete globalThis.window;
    const state = { entityList: [], settings: {} };
    const perf = ensurePerfRuntime(state);

    assert.ok(perf.tier1, 'counters must hang off perfRuntime, not off the SF_DEBUG-gated window.SF');
    assert.equal(perf.tier1.isEnabled(), false, 'the seam must be inert until a probe arms it');
    assert.equal(typeof perf.getCounterSnapshot, 'function');

    // The counter tier must not leak into the timing report: that report's shape is pinned by
    // existing gates, and blending the two tiers in one document is what the brief forbids.
    const report = perf.getReport();
    assert.equal(report.counters.spatialHash !== undefined, true, 'the pre-existing counters block stays');
    assert.equal(report.tier1, undefined, 'Tier-1 counters must NOT be folded into getReport()');
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
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

// --- DOM instrumentation (family H) ----------------------------------------------------------
//
// Same vacuity discipline as the GL wrappers: a dead observer and a quiet HUD both report 0, so
// the positive control (the count MOVES once #hud exists) and the filter (non-HUD mutations do
// NOT count) are both load-bearing, and both are mutation-proven.

test('DOM mutations are counted even when #hud is created AFTER install', () => {
  // Install happens at renderer construction; the HUD is built later. If the root were resolved
  // once at install it would be null forever and this counter would report a vacuous 0 for the
  // whole session — good news, no error (handoff §9 traps 1 and 2).
  const counters = createPerfCounters();
  counters.setEnabled(true);
  const doc = createFakeDocument();
  const mo = createFakeMutationObserverClass();
  const handle = installDomInstrumentation(counters, {
    document: doc,
    MutationObserver: mo.FakeMutationObserver,
  });

  assert.equal(mo.instances.length, 1, 'exactly one observer is constructed');
  assert.ok(mo.instances[0].observations[0].target === doc.documentElement,
    'the observer attaches to a stable ancestor that outlives the HUD build');
  assert.deepEqual(mo.instances[0].observations[0].options, {
    childList: true, attributes: true, characterData: true, subtree: true,
  });

  // Before #hud exists, delivered mutations cannot be HUD mutations — and must not crash.
  mo.instances[0].deliver([{ type: 'childList', target: doc.body }]);
  assert.equal(counters.snapshot().totals.domMutations, 0);

  // The HUD root appears later; from then on its subtree mutations must move the counter.
  const hud = doc.registerId('hud', doc.body.appendChild(createFakeNode('div')));
  const row = hud.appendChild(createFakeNode('div'));
  const text = createFakeNode('#text');
  text.parentNode = row;

  mo.instances[0].deliver([
    { type: 'childList', target: hud },
    { type: 'attributes', target: row },
    { type: 'characterData', target: text },
  ]);

  const totals = counters.snapshot().totals;
  assert.equal(totals.domMutations, 3,
    'a dead observer and a quiet HUD both report 0 — the counter must MOVE');
  assert.equal(totals.domChildListMutations, 1);
  assert.equal(totals.domAttributeMutations, 1);
  assert.equal(totals.domCharacterDataMutations, 1);

  handle.uninstall();
  assert.equal(mo.instances[0].disconnects, 1, 'uninstall disconnects the observer');
  mo.instances[0].deliver([{ type: 'childList', target: hud }]);
  assert.equal(counters.snapshot().totals.domMutations, 3, 'an uninstalled observer must not count');
});

test('mutations OUTSIDE the #hud subtree are never counted as HUD mutations', () => {
  // The observer sits on a stable ancestor, so its batches contain screens, toasts, alerts —
  // everything. Without the subtree filter the counter would measure "the whole document
  // changes", which is not a HUD signal and would drown the PERF-C05 failure mode in noise.
  const counters = createPerfCounters();
  counters.setEnabled(true);
  const doc = createFakeDocument();
  const mo = createFakeMutationObserverClass();
  const handle = installDomInstrumentation(counters, {
    document: doc,
    MutationObserver: mo.FakeMutationObserver,
  });
  const hud = doc.registerId('hud', doc.body.appendChild(createFakeNode('div')));
  const screens = doc.body.appendChild(createFakeNode('div'));
  const toast = screens.appendChild(createFakeNode('div'));

  mo.instances[0].deliver([
    { type: 'childList', target: doc.body },
    { type: 'childList', target: screens },
    { type: 'attributes', target: toast },
    { type: 'characterData', target: hud },   // the HUD root itself IS inside the filter
  ]);

  const totals = counters.snapshot().totals;
  assert.equal(totals.domMutations, 1, 'only the record inside #hud may count');
  assert.equal(totals.domCharacterDataMutations, 1);
  assert.equal(totals.domChildListMutations, 0, 'document churn outside #hud is not HUD churn');
  handle.uninstall();
});

test('layout reads count once per read and pass values, arguments and receiver through', () => {
  const counters = createPerfCounters();
  counters.setEnabled(true);
  const prototypes = createFakeElementPrototypes();
  const win = createFakeWindow();
  const handle = installDomInstrumentation(counters, {
    elementPrototype: prototypes.elementPrototype,
    htmlElementPrototype: prototypes.htmlElementPrototype,
    window: win,
  });

  const element = Object.create(prototypes.htmlElementPrototype);
  assert.ok(element.offsetWidth === element,
    'the patched getter must return the ORIGINAL value unchanged');
  element.offsetHeight;
  element.offsetTop;
  element.offsetLeft;
  element.clientWidth;
  element.clientHeight;
  element.scrollWidth;
  element.scrollHeight;
  const rect = element.getBoundingClientRect('a', 'b');
  assert.ok(rect.self === element, 'getBoundingClientRect must keep its receiver');
  assert.deepEqual(rect.args, ['a', 'b'], 'arguments must pass through unchanged');
  const style = win.getComputedStyle(element);
  assert.ok(style.arg === element, 'getComputedStyle must receive the element');
  assert.equal(style.display, 'fake-block', 'the original return value passes through');

  assert.equal(counters.snapshot().totals.layoutReads, 10,
    '8 accessor reads + getBoundingClientRect + getComputedStyle');

  element.clientWidth = 7;   // a WRITE through the preserved setter is not a read
  assert.equal(element.__assigned, 7, 'the original setter still runs while patched');
  assert.equal(counters.snapshot().totals.layoutReads, 10, 'writes must not count as reads');

  handle.uninstall();
});

test('uninstall restores every patched descriptor byte-identically', () => {
  // Prototype patching without a proven uninstall leaks into every other test in the process.
  const counters = createPerfCounters();
  counters.setEnabled(true);
  const prototypes = createFakeElementPrototypes();
  const win = createFakeWindow();
  const before = captureLayoutDescriptors(prototypes, win);

  const handle = installDomInstrumentation(counters, {
    elementPrototype: prototypes.elementPrototype,
    htmlElementPrototype: prototypes.htmlElementPrototype,
    window: win,
  });

  // Install must actually change something, or the restore assertion below is vacuous.
  const element = Object.create(prototypes.htmlElementPrototype);
  element.offsetWidth;
  assert.equal(counters.snapshot().totals.layoutReads, 1, 'install must be live before uninstall');

  handle.uninstall();
  assert.deepEqual(captureLayoutDescriptors(prototypes, win), before,
    'get/set/value/writable/enumerable/configurable must all be the originals');

  const readsBefore = counters.snapshot().totals.layoutReads;
  element.offsetWidth;
  element.getBoundingClientRect();
  win.getComputedStyle(element);
  assert.equal(counters.snapshot().totals.layoutReads, readsBefore,
    'a restored prototype must not count');
});

test('missing or non-configurable layout properties are skipped, never forced', () => {
  const counters = createPerfCounters();
  counters.setEnabled(true);
  const prototypes = createFakeElementPrototypes();
  // Make one accessor and one method non-configurable: defineProperty on either would throw, so
  // the installer must not even attempt them.
  Object.defineProperty(prototypes.htmlElementPrototype, 'offsetWidth', {
    get: function () { return 'locked'; },
    enumerable: true,
    configurable: false,
  });
  Object.defineProperty(prototypes.elementPrototype, 'getBoundingClientRect', {
    value: function () { return 'locked-rect'; },
    writable: true,
    enumerable: false,
    configurable: false,
  });
  const win = createFakeWindow();

  let handle;
  assert.doesNotThrow(() => {
    handle = installDomInstrumentation(counters, {
      elementPrototype: prototypes.elementPrototype,
      htmlElementPrototype: prototypes.htmlElementPrototype,
      window: win,
    });
  }, 'a non-configurable property must degrade to a skip, not a boot failure');

  const element = Object.create(prototypes.htmlElementPrototype);
  assert.equal(element.offsetWidth, 'locked', 'the locked getter is untouched');
  assert.equal(element.getBoundingClientRect(), 'locked-rect', 'the locked method is untouched');
  element.clientWidth;
  assert.equal(counters.snapshot().totals.layoutReads, 1,
    'the non-configurable reads are NOT counted; the configurable one is');

  handle.uninstall();
  assert.equal(element.offsetWidth, 'locked', 'and uninstall did not clobber the accessor');
  assert.equal(element.getBoundingClientRect(), 'locked-rect', 'or the method');
});

test('longtask entries count, and uninstall disconnects the observer', () => {
  const counters = createPerfCounters();
  counters.setEnabled(true);
  const po = createFakePerformanceObserverClass();
  const handle = installDomInstrumentation(counters, {
    PerformanceObserver: po.FakePerformanceObserver,
  });
  assert.equal(po.instances.length, 1);
  assert.deepEqual(po.instances[0].observed, { entryTypes: ['longtask'] });

  po.instances[0].deliver([{}, {}, {}]);
  assert.equal(counters.snapshot().totals.longTasks, 3);

  handle.uninstall();
  assert.equal(po.instances[0].disconnects, 1);
  po.instances[0].deliver([{}]);
  assert.equal(counters.snapshot().totals.longTasks, 3, 'a disconnected observer must not count');
});

test('an unsupported longtask entry type degrades to no producer, never a broken install', () => {
  // Firefox/Safari throw from observe({ entryTypes: ['longtask'] }). A measurement probe must
  // never break boot, and the other producers must survive.
  const counters = createPerfCounters();
  counters.setEnabled(true);
  const doc = createFakeDocument();
  const mo = createFakeMutationObserverClass();
  const po = createFakePerformanceObserverClass({ supportLongTask: false });

  let handle;
  assert.doesNotThrow(() => {
    handle = installDomInstrumentation(counters, {
      document: doc,
      MutationObserver: mo.FakeMutationObserver,
      PerformanceObserver: po.FakePerformanceObserver,
    });
  });

  const hud = doc.registerId('hud', doc.body.appendChild(createFakeNode('div')));
  mo.instances[0].deliver([{ type: 'childList', target: hud }]);
  assert.equal(counters.snapshot().totals.domMutations, 1, 'the mutation producer survived');
  assert.equal(counters.snapshot().totals.longTasks, 0);
  handle.uninstall();
});

test('installing DOM instrumentation twice returns the existing handle and never double-counts', () => {
  const counters = createPerfCounters();
  counters.setEnabled(true);
  const doc = createFakeDocument();
  const mo = createFakeMutationObserverClass();
  const options = { document: doc, MutationObserver: mo.FakeMutationObserver };

  const first = installDomInstrumentation(counters, options);
  const second = installDomInstrumentation(counters, options);
  assert.ok(first === second, 'the second install must return the existing handle');
  assert.equal(mo.instances.length, 1, 'a second observer would double every count');

  const hud = doc.registerId('hud', doc.body.appendChild(createFakeNode('div')));
  mo.instances[0].deliver([{ type: 'childList', target: hud }]);
  assert.equal(counters.snapshot().totals.domMutations, 1, 'double-wrapping would double the count');

  first.uninstall();
  const third = installDomInstrumentation(counters, options);
  assert.ok(third !== first, 'after uninstall a fresh install produces a fresh handle');
  assert.equal(mo.instances.length, 2);
  third.uninstall();
});

// --- The frame-loop heap sampler (family G) ---------------------------------------------------

function createRafPump() {
  let nextId = 1;
  const pending = new Map();
  return {
    requestFrame(callback) { const id = nextId++; pending.set(id, callback); return id; },
    cancelFrame(id) { pending.delete(id); },
    flushOne(now) {
      const entry = pending.entries().next().value;
      assert.ok(entry, 'expected one scheduled frame');
      pending.delete(entry[0]);
      entry[1](now);
    },
  };
}

function startHeapTestLoop({ rendererFrames = [] } = {}) {
  const raf = createRafPump();
  const state = {
    accumulator: 0,
    timeScale: 1,
    tick: 0,
    simTime: 0,
    entityList: [],
    settings: {},
    input: {
      moveX: 0, moveZ: 0, turnIntent: 0,
      aimWorld: { x: 0, z: 0 },
      mouseNdc: { x: 0, y: 0 },
      pointerScreen: { x: 0, y: 0, active: false },
      actions: {},
    },
  };
  if (rendererFrames.length > 0) {
    state.render = {
      diagnostics: {
        info: { calls: 0, triangles: 0, geometries: 0, textures: 0, programs: 0 },
      },
    };
  }
  const registry = {
    step(dt, tickBoundary) {
      state.tick++;
      state.simTime += dt;
      tickBoundary.publishInputCommand(state.input, state.tick);
    },
    renderUpdate() {
      const next = rendererFrames.shift();
      if (next) Object.assign(state.render.diagnostics.info, next);
    },
    get() { return null; },
  };
  const controller = startLoop(state, registry, {
    requestFrame: raf.requestFrame,
    cancelFrame: raf.cancelFrame,
    nowMs: () => 1000,
    visibilityTarget: null,
    lifecyclePort: null,
  });
  return { raf, state, controller };
}

test('the presentation loop samples the heap once per frame when performance.memory exists', () => {
  const loop = startHeapTestLoop();
  const tier1 = ensurePerfRuntime(loop.state).tier1;
  tier1.setEnabled(true);
  const originalMemory = Object.getOwnPropertyDescriptor(globalThis.performance, 'memory');
  globalThis.performance.memory = { usedJSHeapSize: 1_000_000 };
  try {
    loop.raf.flushOne(1020);
    globalThis.performance.memory.usedJSHeapSize = 1_100_000;
    loop.raf.flushOne(1040);
    globalThis.performance.memory.usedJSHeapSize = 900_000;
    loop.raf.flushOne(1060);

    const allocation = tier1.snapshot().nondeterministic.allocation;
    assert.equal(allocation.samples, 3, 'one sample per presentation frame');
    assert.equal(allocation.lastHeapBytes, 900_000);
    assert.equal(allocation.heapBytesDeltaTotal, 100_000, 'growth between samples accrues');
    assert.equal(allocation.collectionsDetected, 1, 'a drop reads as a collection');
  } finally {
    if (originalMemory) Object.defineProperty(globalThis.performance, 'memory', originalMemory);
    else delete globalThis.performance.memory;
    loop.controller.destroy();
  }
});

test('heap samples stay out of the deterministic counter fields', () => {
  // GC scheduling is at the VM's discretion; a heap figure must never become a bisectable signal.
  for (const field of COUNTER_FIELDS) assert.ok(!/heap/i.test(field), field);
  for (const field of DETERMINISTIC_FIELDS) assert.ok(!/heap/i.test(field), field);
});

test('a missing performance.memory is a per-frame no-op, never a frame error', () => {
  // Node has no performance.memory, which makes this the unsupported-browser case by default.
  assert.equal(globalThis.performance.memory, undefined,
    'host grew performance.memory: stub it away for this test instead of deleting the assertion');
  const loop = startHeapTestLoop();
  const tier1 = ensurePerfRuntime(loop.state).tier1;
  tier1.setEnabled(true);
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => { errors.push(args); };
  try {
    loop.raf.flushOne(1020);
    loop.raf.flushOne(1040);
    assert.equal(errors.length, 0,
      'a throw at the sample site escapes into the rAF catch and is logged EVERY frame (trap 8)');
    assert.equal(tier1.snapshot().nondeterministic.allocation.samples, 0, 'no memory, no samples');
    assert.equal(tier1.snapshot().framesObserved, 2, 'frames still close cleanly');
  } finally {
    console.error = originalError;
    loop.controller.destroy();
  }
});

test('the presentation loop samples renderer facts after the current frame completes', () => {
  const loop = startHeapTestLoop({ rendererFrames: [
    { calls: 11, triangles: 110, geometries: 3, textures: 5, programs: 2 },
    { calls: 7, triangles: 90, geometries: 4, textures: 6, programs: 3 },
  ] });
  const tier1 = ensurePerfRuntime(loop.state).tier1;
  tier1.setEnabled(true);
  try {
    loop.raf.flushOne(1020);
    loop.raf.flushOne(1040);
    const renderer = tier1.snapshot().nondeterministic.renderer;
    assert.equal(renderer.samples, 2);
    assert.deepEqual(renderer.residency.baseline, { geometries: 3, textures: 5, programs: 2 });
    assert.deepEqual(renderer.residency.end, { geometries: 4, textures: 6, programs: 3 });
    assert.equal(renderer.drawTriangleCounts.drawCallsTotal, 18);
    assert.equal(renderer.drawTriangleCounts.trianglesTotal, 200);
  } finally {
    loop.controller.destroy();
  }
});

test('qualification frame capture retains the full bounded callback window beyond the overlay ring', () => {
  const perf = ensurePerfRuntime({ entityList: [], settings: {} });
  assert.deepEqual(perf.getQualificationFrameReport(), {
    schema: 'spaceface.qualificationFrameIntervals.v1',
    enabled: false,
    capacity: 0,
    samples: 0,
    overflow: 0,
    p50: 0,
    p95: 0,
    p99: 0,
    max: 0,
    raw: [],
  });
  perf.setDisplayIntervalMs(16.7);
  perf.beginQualificationFrameCapture(perf.RING_N + 10);
  let callbackStartMs = 1_000;
  perf.beginFrame(0, callbackStartMs);
  perf.recordFrameCallback(0);
  for (let i = 1; i <= perf.RING_N + 5; i++) {
    callbackStartMs += i;
    perf.beginFrame(i / 1000, callbackStartMs);
    perf.recordFrameCallback(0);
  }

  const overlay = perf.getReport().frameCallbackInterval;
  assert.equal(overlay.samples, perf.RING_N, 'the ordinary diagnostic ring remains bounded');
  assert.equal(overlay.raw, undefined, 'the diagnostic ring is not PQ-025 raw evidence');

  const full = perf.getQualificationFrameReport();
  assert.equal(full.capacity, perf.RING_N + 10);
  assert.equal(full.samples, perf.RING_N + 5);
  assert.equal(full.overflow, 0);
  assert.deepEqual(full.raw.slice(0, 3), [1, 2, 3]);
  assert.deepEqual(full.raw.slice(-3), [183, 184, 185]);
  assert.equal(full.p50, 93);
  assert.equal(full.p95, 175);
  assert.equal(full.p99, 183);
  assert.equal(full.max, 185);

  assert.equal(perf.clearQualificationFrameCapture(), true);
  assert.equal(perf.getQualificationFrameReport().enabled, false, 'cleanup releases the capture buffer');
});

test('qualification frame capture reports overflow instead of truncating silently', () => {
  const perf = ensurePerfRuntime({ entityList: [], settings: {} });
  perf.setDisplayIntervalMs(16.7);
  perf.beginQualificationFrameCapture(2);
  let callbackStartMs = 1_000;
  perf.beginFrame(0, callbackStartMs);
  perf.recordFrameCallback(0);
  for (const interval of [10, 20, 30]) {
    callbackStartMs += interval;
    perf.beginFrame(interval / 1000, callbackStartMs);
    perf.recordFrameCallback(0);
  }
  assert.deepEqual(perf.getQualificationFrameReport().raw, [10, 20]);
  assert.equal(perf.getQualificationFrameReport().overflow, 1);
});

test('perfRuntime missed-vsync accounting requires an explicit display interval', () => {
  const perf = ensurePerfRuntime({ entityList: [], settings: {} });
  perf.beginFrame(0.0501);
  assert.deepEqual(perf.getReport().displayCadence, {
    valid: false,
    displayIntervalMs: null,
    observedIntervals: 0,
    missedVsync: 0,
  });

  assert.throws(() => perf.setDisplayIntervalMs(0), /positive finite/);
  assert.throws(() => perf.setDisplayIntervalMs(16.7), /must be reset/,
    'calibration may not be mixed into already sampled timing data');
  perf.reset();
  perf.setDisplayIntervalMs(16.7);
  let callbackStartMs = 1_000;
  perf.beginFrame(0, callbackStartMs);
  perf.recordFrameCallback(0);
  for (const ms of [10, 16.7, 33.4, 50.1]) {
    callbackStartMs += ms;
    perf.beginFrame(ms / 1000, callbackStartMs);
    perf.recordFrameCallback(0);
  }
  assert.deepEqual(perf.getReport().displayCadence, {
    valid: true,
    displayIntervalMs: 16.7,
    observedIntervals: 4,
    missedVsync: 3,
  });
});

test('renderer owner sampling records baseline, component peaks, end, and draw totals', () => {
  const counters = createPerfCounters();
  const sampleA = { calls: 10, triangles: 100, geometries: 4, textures: 7, programs: 3 };
  const sampleB = { calls: 14, triangles: 80, geometries: 6, textures: 5, programs: 4 };
  const sampleC = { calls: 8, triangles: 120, geometries: 5, textures: 9, programs: 2 };

  assert.equal(counters.sampleRendererFrame(sampleA), false, 'disabled sampling is an inert branch');
  counters.setEnabled(true);
  assert.equal(counters.sampleRendererFrame(sampleA), true);
  assert.equal(counters.sampleRendererFrame(sampleB), true);
  assert.equal(counters.sampleRendererFrame(sampleC), true);
  assert.equal(counters.sampleRendererFrame({ calls: 1 }), false, 'partial diagnostics are unavailable');

  const renderer = counters.snapshot().nondeterministic.renderer;
  assert.equal(renderer.samples, 3);
  assert.equal(renderer.unavailableSamples, 1);
  assert.deepEqual(renderer.residency.baseline, { geometries: 4, textures: 7, programs: 3 });
  assert.deepEqual(renderer.residency.peak, { geometries: 6, textures: 9, programs: 4 });
  assert.deepEqual(renderer.residency.end, { geometries: 5, textures: 9, programs: 2 });
  assert.deepEqual(renderer.drawTriangleCounts, {
    samples: 3,
    drawCallsTotal: 32,
    trianglesTotal: 300,
    drawCallsPeak: 14,
    trianglesPeak: 120,
    drawCallsEnd: 8,
    trianglesEnd: 120,
  });

  counters.reset();
  assert.equal(counters.snapshot().nondeterministic.renderer.samples, 0);
});

test('heap owner sampling records baseline, peak, and end residency without entering equivalence', () => {
  const counters = createPerfCounters();
  counters.setEnabled(true);
  for (const bytes of [100, 140, 90, 120]) counters.sampleHeap(bytes);
  const allocation = counters.snapshot().nondeterministic.allocation;
  assert.equal(allocation.baselineHeapBytes, 100);
  assert.equal(allocation.peakHeapBytes, 140);
  assert.equal(allocation.endHeapBytes, 120);
  for (const field of DETERMINISTIC_FIELDS) assert.ok(!/residency|renderer|triangle|heap/i.test(field));
});
