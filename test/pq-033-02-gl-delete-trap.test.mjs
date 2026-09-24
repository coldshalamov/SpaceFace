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
  readGlDeleteTrap,
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
    globalThis.__deleted = [];
    globalThis.WebGL2RenderingContext = class {
      isContextLost() { return false; }
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
