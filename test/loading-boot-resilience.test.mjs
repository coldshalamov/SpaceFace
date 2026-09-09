// test/loading-boot-resilience.test.mjs
//
// The loading screen hung the game for two days. The cause was three defects stacked in the boot
// path, and the reason nothing caught them is that the failure is RACY — booting the real game
// reproduces it only sometimes, so a boot-based check is not a reliable gate for it.
//
// These tests reproduce the same defects deterministically, in milliseconds, with no browser.
//
// The one law being defended: THE LOADING SCREEN'S ARTWORK IS DECORATION, AND DECORATION MAY NEVER
// PREVENT THE GAME FROM STARTING. Everything below is a specific way that law was broken.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The loading-terminal feature is authored in its own lane and may not be present on every
// checkout. Skip loudly rather than fail: a red test for an absent feature is noise, and noise is
// how a suite stops being trusted. The moment the module lands, these assertions start enforcing.
const ART = fileURLToPath(new URL('../src/ui/loadingTerminalArt.js', import.meta.url));
const HAVE_ART = existsSync(ART);
const skip = HAVE_ART ? false : 'src/ui/loadingTerminalArt.js is not present on this checkout';

// ── a canvas stub that behaves like the real thing in the one way that matters ────────────────
// transferControlToOffscreen() is irreversible: after it succeeds, getContext() throws
// InvalidStateError forever, and a second transfer throws too. Browsers do this; jsdom does not,
// which is precisely why no existing test saw the bug.
function makeCanvas(id = 'c') {
  const canvas = {
    id,
    width: 640,
    height: 380,
    _transferred: false,
    getContext() {
      if (this._transferred) {
        const err = new Error("Failed to execute 'getContext' on 'HTMLCanvasElement': Cannot get context from a canvas that has transferred its control to offscreen.");
        err.name = 'InvalidStateError';
        throw err;
      }
      return { canvas: this, save() {}, restore() {}, clearRect() {}, fillRect() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, arc() {}, translate() {}, rotate() {}, scale() {}, setTransform() {}, measureText: () => ({ width: 10 }), fillText() {}, createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }), putImageData() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }), drawImage() {} };
    },
    transferControlToOffscreen() {
      if (this._transferred) {
        const err = new Error("Failed to execute 'transferControlToOffscreen' on 'HTMLCanvasElement': Cannot transfer control from a canvas that has transferred its control to offscreen.");
        err.name = 'InvalidStateError';
        throw err;
      }
      this._transferred = true;
      return { width: 640, height: 380 };
    },
    getBoundingClientRect: () => ({ width: 640, height: 380, left: 0, top: 0 }),
    addEventListener() {}, removeEventListener() {},
  };
  return canvas;
}

function makeDoc(canvases = {}) {
  return {
    getElementById: (elId) => canvases[elId] || null,
    querySelector: () => null,
    documentElement: { classList: { contains: () => false } },
    createElement: () => ({ style: {}, classList: { add() {}, remove() {}, contains: () => false }, appendChild() {}, setAttribute() {} }),
  };
}

function makeOverlay() {
  return {
    style: {},
    dataset: {},
    classList: { contains: () => false, add() {}, remove() {} },
    addEventListener() {}, removeEventListener() {}, setAttribute() {},
    getBoundingClientRect: () => ({ width: 1440, height: 900, left: 0, top: 0 }),
  };
}

// Install the browser globals the factory probes for, so it takes the OffscreenCanvas branch —
// the branch that actually contains the bug. `workerCtor` lets a test make Worker construction
// fail AFTER the transfer has already happened, which is the exact unrecoverable state.
function withBrowserGlobals(run, { workerCtor } = {}) {
  const saved = {
    Worker: globalThis.Worker, Blob: globalThis.Blob, URL: globalThis.URL,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    devicePixelRatio: globalThis.devicePixelRatio,
  };
  globalThis.Worker = workerCtor || class { postMessage() {} terminate() {} addEventListener() {} };
  globalThis.Blob = globalThis.Blob || class { constructor() {} };
  if (!globalThis.URL.createObjectURL) {
    globalThis.URL.createObjectURL = () => 'blob:stub';
    globalThis.URL.revokeObjectURL = () => {};
  }
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.devicePixelRatio = 1;
  try { return run(); } finally { Object.assign(globalThis, saved); }
}

test('initialising the same canvas twice does not throw', { skip }, async () => {
  // THE BUG. index.html runs an inline module calling bootstrapLoadingTerminal(), and main.js
  // separately calls createLoadingPresenter -> createTerminalArtwork on the SAME element.
  // bootstrapLoadingTerminal guards against re-entry; the direct factory call did not, so the
  // second call re-transferred an already-transferred canvas, fell into its own "graceful"
  // fallback, and threw InvalidStateError out of boot. hideBootOverlay() then never ran.
  const { createTerminalArtwork } = await import('../src/ui/loadingTerminalArt.js');
  const canvas = makeCanvas('boot-terminal-canvas');
  const overlay = makeOverlay();
  const doc = makeDoc({ 'boot-terminal-canvas': canvas });
  withBrowserGlobals(() => {
    const first = createTerminalArtwork({ canvas, overlay, document: doc });
    assert.ok(first, 'first init should produce an instance');
    let second;
    assert.doesNotThrow(() => {
      second = createTerminalArtwork({ canvas, overlay, document: doc });
    }, 'a second init on the same canvas must not throw — this is what hung the loading screen');
    assert.equal(second, first, 'the second init should reuse the first instance, not build a new one');
  });
});

test('a failure after the transfer never falls back to getContext', { skip }, async () => {
  // transferControlToOffscreen() succeeds, THEN Worker construction fails. The old code set
  // offscreenSupported=false in the catch and then called getContext() on a canvas whose control
  // was already gone. There is no context to fall back to; the only correct answer is to give up
  // on the artwork quietly.
  const { createTerminalArtwork } = await import('../src/ui/loadingTerminalArt.js');
  const canvas = makeCanvas('late-fail');
  const overlay = makeOverlay();
  const doc = makeDoc({ 'late-fail': canvas });
  const BoomWorker = class { constructor() { throw new Error('worker blocked (CSP)'); } };
  withBrowserGlobals(() => {
    let art;
    assert.doesNotThrow(() => {
      art = createTerminalArtwork({ canvas, overlay, document: doc });
    }, 'losing the worker after the transfer must degrade, not throw');
    assert.ok(canvas._transferred, 'precondition: the canvas really was transferred');
    assert.ok(art && typeof art.start === 'function', 'a usable no-op instance should still come back');
    assert.doesNotThrow(() => { art.start(); art.updateProgress({ progress: 0.5 }); art.stop(); art.destroy(); });
  }, { workerCtor: BoomWorker });
});

test('the loading presenter survives artwork that throws outright', { skip }, async () => {
  // Belt and braces. Even if the artwork module regresses again in some way not modelled above,
  // createLoadingPresenter must still return a working presenter, because main.js:107 sits
  // upstream of startLoop (215) and hideBootOverlay (228). A throw at 107 means no simulation
  // tick and no dismissed overlay — which is exactly the reported "controls do nothing" and
  // "frozen on the loading screen", from one line.
  const { createLoadingPresenter } = await import('../src/ui/loadingPresenter.js');
  const overlay = makeOverlay();
  const exploding = makeCanvas('boot-terminal-canvas');
  exploding.getContext = () => { throw new Error('boom'); };
  exploding.transferControlToOffscreen = () => { throw new Error('boom'); };
  const doc = {
    ...makeDoc({ 'boot-terminal-canvas': exploding, 'boot-overlay': overlay }),
    getElementById: (elId) => (elId === 'boot-overlay' ? overlay : elId === 'boot-terminal-canvas' ? exploding : null),
    querySelector: () => null,
  };
  const bus = { on: () => () => {}, off: () => {}, emit: () => {} };
  let presenter;
  assert.doesNotThrow(() => {
    presenter = createLoadingPresenter({ document: doc, bus });
  }, 'a broken loading animation must never stop the game from booting');
  assert.ok(presenter && typeof presenter.show === 'function' && typeof presenter.hide === 'function');
  assert.doesNotThrow(() => { presenter.show(); presenter.hide(); presenter.destroy(); });
});
