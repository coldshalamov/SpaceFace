// PQ-033.02 — the soak harness's read-only GL traps must actually arm on both hosts and must
// actually record the dead-handle delete storm.
//
// The 2026-09-23 v6 acceptance pair proved two gaps the hard way:
// 1. Electron arming gap — `installGlProgramQueryTrap`/`installGlDeleteTrap` were only installed
//    inside `reloadElectronWithTier1Counters` (an opt-in instrumentation path), so the Electron
//    acceptance soak ran both traps disarmed: 256 'does not belong to this context' warnings,
//    zero trapped stacks.
// 2. Delete-predicate gap — the delete trap only recorded handles that FAILED their own isX()
//    check, but the JS binding layer lets stale/foreign wrappers through isX() (the exact
//    failure the program-query trap's comment documents for isProgram()), so the storm would
//    read as zero bad deletes even when armed.
//
// The trap bodies are exported so these tests can run the real in-page source in a vm sandbox
// against a fake WebGL context — the same serialize-the-function-and-run-it-in-the-page thing
// Playwright does.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {
  armGlDeleteTrapInPage,
  armGlProgramQueryTrapInPage,
  installGlDeleteTrap,
  installGlProgramQueryTrap,
  installGlTrapsOnLivePage,
  installPostTeardownGlDeleteTrapCapture,
  readGlDeleteTrap,
  readPostTeardownGlDeleteTrapConsoleMessage,
} from '../scripts/lib/releaseSoakProbe.mjs';

// A minimal WebGL2-like realm. The `__alive` flag simulates the binding-layer behavior under
// test: when true, isX() answers true for a wrapper the GL decoder still rejects ('object does
// not belong to this context' — the muse-lesson case); tests flip it to produce alive:false
// handles. It is mutable so one realm can hold both classes.
function createGlSandbox({ isTextureAnswer = true } = {}) {
  const context = vm.createContext({
    performance: { now: () => 1_234 },
  });
  vm.runInContext(`
    globalThis.__alive = ${isTextureAnswer ? 'true' : 'false'};
    globalThis.__lost = false;
    globalThis.__deleted = [];
    globalThis.WebGL2RenderingContext = class {
      isContextLost() { return globalThis.__lost === true; }
      isTexture(handle) { return handle != null && globalThis.__alive === true; }
      deleteTexture(handle) { globalThis.__deleted.push(handle); }
    };
    globalThis.WebGLRenderingContext = class {};
  `, context);
  return context;
}

// A fake Playwright page whose evaluate runs the passed function inside the sandbox —
// serialize-and-run, exactly how Playwright executes an evaluate payload in the page.
function fakePage(context) {
  return {
    evaluate: async (fn) => vm.runInContext(`(${fn.toString()})()`, context),
  };
}

function runIn(context, source) {
  return vm.runInContext(source, context);
}

test('live-page arming records a delete whose handle passes its own isX check (the storm class)', async () => {
  const context = createGlSandbox({ isTextureAnswer: true });
  await installGlTrapsOnLivePage(fakePage(context));
  runIn(context, `
    const gl = new WebGL2RenderingContext();
    // A looped dispose path keeps every stack frame identical, so the dedup key collapses it
    // to one counted entry — how the real ~10 ms storm arrives from three's dispose loops.
    const storm = () => { for (const t of [{ id: 1 }, { id: 2 }]) gl.deleteTexture(t); };
    storm();
  `);
  // Read-only: the original delete ran exactly once per call.
  assert.equal(runIn(context, 'globalThis.__deleted.length'), 2, 'the trap must never swallow a delete');
  const entries = runIn(context, 'globalThis.__SF_GL_DELETE_TRAP__.slice()');
  assert.equal(entries.length, 1, 'identical deletes dedupe to one entry');
  assert.equal(entries[0].api, 'deleteTexture');
  assert.equal(entries[0].count, 2);
  assert.equal(entries[0].alive, true, 'a binding-layer-accepted wrapper is still recorded');
});

test('handles that fail their own isX check are flagged alive:false', async () => {
  const context = createGlSandbox({ isTextureAnswer: false });
  await installGlTrapsOnLivePage(fakePage(context));
  runIn(context, `
    const gl = new WebGL2RenderingContext();
    gl.deleteTexture({ id: 'dead-handle' });
  `);
  const entries = runIn(context, 'globalThis.__SF_GL_DELETE_TRAP__.slice()');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].alive, false, 'isX-rejected handles must keep the precise alive:false flag');
});

test('arming is idempotent per document and never double-wraps a delete', async () => {
  const context = createGlSandbox({ isTextureAnswer: true });
  await installGlTrapsOnLivePage(fakePage(context));
  await installGlTrapsOnLivePage(fakePage(context));
  runIn(context, `
    const gl = new WebGL2RenderingContext();
    gl.deleteTexture({ id: 'once' });
  `);
  assert.equal(runIn(context, 'globalThis.__deleted.length'), 1, 'a double arm must not stack two wraps');
  const entries = runIn(context, 'globalThis.__SF_GL_DELETE_TRAP__.slice()');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].count, 1);
});

test('the delete trap covers the whole wrapped API surface, including VAOs', async () => {
  const context = vm.createContext({ performance: { now: () => 1 } });
  vm.runInContext(`
    globalThis.__deleted = [];
    globalThis.WebGL2RenderingContext = class {
      isVertexArray(v) { return v != null && v.kind === 'vao'; }
      deleteVertexArray(v) { globalThis.__deleted.push(['deleteVertexArray', v]); }
      deleteBuffer() {}
      deleteProgram() {}
      deleteShader() {}
      deleteFramebuffer() {}
      deleteRenderbuffer() {}
    };
    globalThis.WebGLRenderingContext = class {};
  `, context);
  await installGlTrapsOnLivePage(fakePage(context));
  runIn(context, `
    const gl = new WebGL2RenderingContext();
    gl.deleteVertexArray({ kind: 'vao' });
  `);
  const entries = runIn(context, 'globalThis.__SF_GL_DELETE_TRAP__.slice()');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].api, 'deleteVertexArray', 'the 8x deleteVertexArray storm class must be covered');
  assert.equal(runIn(context, 'globalThis.__deleted.length'), 1);
});

test('the program-query trap still records only driver-rejected (null-result) queries', async () => {
  const context = vm.createContext({ performance: { now: () => 1 } });
  vm.runInContext(`
    globalThis.__queries = [];
    globalThis.WebGL2RenderingContext = class {
      isProgram(p) { return p != null; }
      getProgramParameter(p, pname) { return globalThis.__verdict; }
    };
    globalThis.__verdict = null;
    globalThis.WebGLRenderingContext = class {};
  `, context);
  await installGlTrapsOnLivePage(fakePage(context));
  runIn(context, `
    const gl = new WebGL2RenderingContext();
    gl.getProgramParameter({}, 0x8B84);
    globalThis.__verdict = 1;
    gl.getProgramParameter({}, 0x8B84);
  `);
  const entries = runIn(context, 'globalThis.__SF_PROGRAM_QUERY_TRAP__.slice()');
  assert.equal(entries.length, 1, 'only the null verdict is a dead-program query');
  assert.equal(entries[0].count, 1);
});

test('init-script installation still arms the same bodies (browser route unchanged)', async () => {
  const installed = [];
  const fakeTarget = { addInitScript: async (fn) => installed.push(fn) };
  await installGlProgramQueryTrap(fakeTarget);
  await installGlDeleteTrap(fakeTarget);
  assert.equal(installed.length, 2, 'both init scripts must still be installed');
  assert.equal(installed[0], armGlProgramQueryTrapInPage);
  assert.equal(installed[1], armGlDeleteTrapInPage);
});

test('launchElectron arms the traps on the live page; the browser keeps its context-level install', () => {
  const probe = readFileSync(new URL('../scripts/lib/releaseSoakProbe.mjs', import.meta.url), 'utf8');
  assert.match(probe, /await installGlTrapsOnLivePage\(page\);/,
    'Electron launch must arm the GL traps on the live page — without this the v6 pair ran uninstrumented');
  assert.match(probe, /await installGlDeleteTrap\(context\);/,
    'the browser route keeps its context-level init-script install');
});

// Two hours of routine dispose stacks produce hundreds of distinct caller chains; the storm
// fires once at the END. A drop-on-full cap would reinstate the exact silent crowd-out this
// trap exists to fix, so saturation must evict (oldest common-class first) and be visible.
test('saturated cap FIFO-evicts common entries and still admits the late storm', async () => {
  const context = createGlSandbox({ isTextureAnswer: true });
  await installGlTrapsOnLivePage(fakePage(context));
  runIn(context, `
    const gl = new WebGL2RenderingContext();
    // 200 distinct call sites = 200 distinct stack keys, more than the 128-entry cap.
    ${Array.from({ length: 200 }, (_, i) => `globalThis.k${i} = () => gl.deleteTexture({ id: ${i} });`).join('\n    ')}
    ${Array.from({ length: 200 }, (_, i) => `globalThis.k${i}();`).join('\n    ')}
    // The storm signature late in the run: one looped site, three deletes.
    const storm = () => { for (const t of [{ id: 'a' }, { id: 'b' }, { id: 'c' }]) gl.deleteTexture(t); };
    storm();
  `);
  assert.equal(runIn(context, 'globalThis.__deleted.length'), 203, 'the trap must never swallow a delete');
  const read = await readGlDeleteTrap(fakePage(context));
  assert.equal(read.entries.length, 128, 'the cap still bounds evidence size');
  assert.equal(read.evicted, 73, 'the oldest common-class entries were evicted (72 fill + 1 storm admit)');
  assert.equal(read.dropped, 0, 'nothing is dropped while any common-class entry remains');
  const stormEntry = read.entries.find((entry) => entry.count === 3);
  assert.ok(stormEntry, 'the late storm entry is present — it can never be crowded out');
});

test('a precise alive:false entry is never the eviction victim and saturation is visible', async () => {
  const context = createGlSandbox({ isTextureAnswer: true });
  await installGlTrapsOnLivePage(fakePage(context));
  runIn(context, `
    const gl = new WebGL2RenderingContext();
    ${Array.from({ length: 130 }, (_, i) => `globalThis.k${i} = () => gl.deleteTexture({ id: ${i} });`).join('\n    ')}
    ${Array.from({ length: 130 }, (_, i) => `globalThis.k${i}();`).join('\n    ')}
  `);
  let read = await readGlDeleteTrap(fakePage(context));
  assert.equal(read.entries.length, 128);
  assert.equal(read.evicted, 2);
  // Now the precise class arrives at a saturated cap: it must evict common entries, and
  // previously-recorded alive:false entries must never disappear.
  runIn(context, `
    globalThis.__alive = false;
    (() => {
      const gl = new WebGL2RenderingContext();
      ${Array.from({ length: 3 }, (_, i) => `globalThis.dead${i} = () => gl.deleteTexture({ id: 'dead-${i}' });`).join('\n    ')}
      ${Array.from({ length: 3 }, (_, i) => `globalThis.dead${i}();`).join('\n    ')}
    })();
  `);
  read = await readGlDeleteTrap(fakePage(context));
  assert.equal(read.entries.length, 128, 'cap still bounds the array');
  assert.equal(read.evicted, 5, 'three dead entries were admitted by evicting common entries');
  const deadEntries = read.entries.filter((entry) => entry.alive === false);
  assert.equal(deadEntries.length, 3, 'every alive:false entry survives');
  assert.equal(read.dropped, 0);
});

test('invalid-object candidates use an independent bounded ring with deeper owner evidence', async () => {
  const context = createGlSandbox({ isTextureAnswer: true });
  await installGlTrapsOnLivePage(fakePage(context));
  runIn(context, `
    const gl = new WebGL2RenderingContext();
    ${Array.from({ length: 128 }, (_, i) => `globalThis.normal${i} = () => gl.deleteTexture({ id: 'normal-${i}' });`).join('\n    ')}
    ${Array.from({ length: 128 }, (_, i) => `globalThis.normal${i}();`).join('\n    ')}
    globalThis.__alive = false;
    ${Array.from({ length: 80 }, (_, i) => `globalThis.candidate${i} = () => gl.deleteTexture({ id: 'candidate-${i}' });`).join('\n    ')}
    ${Array.from({ length: 80 }, (_, i) => `globalThis.candidate${i}();`).join('\n    ')}
  `);
  const read = await readGlDeleteTrap(fakePage(context));
  assert.equal(runIn(context, 'globalThis.__deleted.length'), 208, 'candidate capture must never alter the delete call');
  assert.equal(read.entries.length, 128, 'normal evidence remains bounded');
  assert.equal(read.candidates.length, 64, 'candidate evidence has its own bound');
  assert.equal(read.candidateEvicted, 16, 'old candidate callers are evicted only within the candidate ring');
  assert.equal(read.candidateDropped, 0);
  assert(read.candidates.every((entry) => entry.candidate === true));
  assert(read.candidates.every((entry) => entry.candidateReason === 'predelete-isX-false'));
  assert(read.candidates.every((entry) => entry.candidateInterpretation.includes('candidate only')));
  assert(read.candidates.every((entry) => entry.api === 'deleteTexture'));
  assert(read.candidates.every((entry) => entry.phase === 'context-live'));
  assert(read.candidates.every((entry) => Number.isFinite(entry.at)));
  assert(read.candidates.every((entry) => entry.ownerStack.includes('sf-gl-delete-trap')));
});

test('candidate evidence labels the context phase without reading GL error state', async () => {
  const context = createGlSandbox({ isTextureAnswer: true });
  await installGlTrapsOnLivePage(fakePage(context));
  runIn(context, `
    globalThis.__lost = true;
    globalThis.__alive = false;
    const gl = new WebGL2RenderingContext();
    gl.deleteTexture({ id: 'lost-context-candidate' });
  `);
  const read = await readGlDeleteTrap(fakePage(context));
  assert.equal(read.candidates.length, 1);
  assert.equal(read.candidates[0].phase, 'context-lost');
  assert.equal(read.candidates[0].lost, true);
  assert.equal(read.candidates[0].candidate, true);
  assert.equal(runIn(context, 'globalThis.__glErrorReads || 0'), 0,
    'the diagnostic must not consume getError or change GL error state');
});

test('post-teardown capture wraps ordinary registry destroy once and preserves its result', async () => {
  const context = vm.createContext({
    console: { info: (value) => runIn(context, `globalThis.__logs.push(${JSON.stringify(String(value))})`) },
  });
  vm.runInContext(`
    globalThis.__logs = [];
    globalThis.__destroyCalls = 0;
    globalThis.__SF_GL_DELETE_TRAP__ = [{ count: 7, api: 'deleteTexture', alive: true, lost: false, at: 42, stack: 'stack' }];
    Object.defineProperty(globalThis.__SF_GL_DELETE_TRAP__, '__sfSaturation', {
      value: { evicted: 3, dropped: 1 },
      configurable: false,
      enumerable: false,
      writable: false,
    });
    Object.defineProperty(globalThis.__SF_GL_DELETE_TRAP__, '__sfCandidates', {
      value: [{ candidate: true, api: 'deleteTexture', phase: 'context-lost', at: 43, ownerStack: 'owner-stack' }],
      configurable: false,
      enumerable: false,
      writable: false,
    });
    Object.defineProperty(globalThis.__SF_GL_DELETE_TRAP__, '__sfCandidateSaturation', {
      value: { evicted: 5, dropped: 2 },
      configurable: false,
      enumerable: false,
      writable: false,
    });
    globalThis.SF = {
      registry: {
        destroy(value) {
          globalThis.__destroyCalls += 1;
          return { value };
        },
      },
    };
  `, context);

  const page = fakePage(context);
  const firstInstall = await installPostTeardownGlDeleteTrapCapture(page);
  const secondInstall = await installPostTeardownGlDeleteTrapCapture(page);
  assert.equal(firstInstall.installed, true);
  assert.equal(firstInstall.already, false);
  assert.equal(secondInstall.installed, true);
  assert.equal(secondInstall.already, true);

  const result = runIn(context, `globalThis.SF.registry.destroy('ordinary-close')`);
  assert.equal(result.value, 'ordinary-close');
  runIn(context, 'globalThis.SF.registry.destroy(\'second-call\')');
  assert.equal(runIn(context, 'globalThis.__destroyCalls'), 2);
  assert.equal(runIn(context, 'globalThis.__logs.length'), 1, 'capture must publish exactly once');

  const snapshot = readPostTeardownGlDeleteTrapConsoleMessage(runIn(context, 'globalThis.__logs[0]'));
  assert.equal(snapshot.armed, true);
  assert.equal(snapshot.evicted, 3);
  assert.equal(snapshot.dropped, 1);
  assert.equal(snapshot.candidates.length, 1);
  assert.equal(snapshot.candidates[0].phase, 'context-lost');
  assert.equal(snapshot.candidateEvicted, 5);
  assert.equal(snapshot.candidateDropped, 2);
  assert.equal(snapshot.entries[0].count, 7);
  assert.equal(runIn(context, 'Object.isFrozen(globalThis.__SF_GL_DELETE_TRAP_POST_TEARDOWN__)'), true);
  assert.equal(runIn(context, 'Object.isFrozen(globalThis.__SF_GL_DELETE_TRAP_POST_TEARDOWN__.entries)'), true);
  assert.equal(readPostTeardownGlDeleteTrapConsoleMessage('[spaceface] other-message'), null);
});
