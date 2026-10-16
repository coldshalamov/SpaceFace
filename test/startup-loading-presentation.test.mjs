import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { save } from '../src/save/saveSystem.js';
import { createLoadingPresenter } from '../src/ui/loadingPresenter.js';

test('loading presenter replaces a frozen route with stage progress and releases it at flight', () => {
  const bus = createBus();
  const overlay = fakeElement();
  const label = fakeElement();
  const detail = fakeElement();
  const progress = fakeElement();
  const document = {
    getElementById(id) { return id === 'boot-overlay' ? overlay : null; },
    querySelector(selector) {
      return new Map([
        ['[data-loading-label]', label],
        ['[data-loading-detail]', detail],
        ['[data-loading-progress]', progress],
      ]).get(selector) || null;
    },
  };
  overlay.classList.add('hidden');
  overlay.style.display = 'none';

  const presenter = createLoadingPresenter({ document, bus });
  bus.emit('game:loadingProgress', {
    id: 'authored-visuals',
    progress: 0.5,
    label: 'Building the opening scene',
    detail: 'Loading only assets visible at launch',
  });

  assert.equal(overlay.classList.contains('hidden'), false);
  assert.equal(overlay.style.display, 'flex');
  assert.equal(overlay.attributes.get('aria-busy'), 'true');
  assert.equal(overlay.dataset.loadingStage, 'authored-visuals');
  assert.equal(label.textContent, 'Building the opening scene');
  assert.equal(detail.textContent, 'Loading only assets visible at launch');
  assert.equal(progress.style.width, '50%');

  bus.emit('mode:changed', { mode: 'loading', previousMode: 'menu' });
  assert.equal(label.textContent, 'Building the opening scene',
    'the loading mode event must not overwrite a truthful New Game stage with Continue copy');

  bus.emit('mode:changed', { mode: 'flight', previousMode: 'loading' });
  assert.equal(overlay.classList.contains('hidden'), true);
  assert.equal(overlay.attributes.get('aria-busy'), 'false');
  presenter.destroy();
});

test('loading mode has useful Continue copy before asset-stage events arrive', () => {
  const bus = createBus();
  const overlay = fakeElement();
  const label = fakeElement();
  const document = {
    getElementById: () => overlay,
    querySelector: (selector) => selector === '[data-loading-label]' ? label : null,
  };
  createLoadingPresenter({ document, bus });
  bus.emit('mode:changed', { mode: 'loading', previousMode: 'menu' });

  assert.equal(label.textContent, 'Restoring flight state');
  assert.equal(overlay.classList.contains('hidden'), false);
});

test('Continue restore errors always release the loading shell', () => {
  const bus = createBus();
  const overlay = fakeElement();
  const document = {
    getElementById: () => overlay,
    querySelector: () => null,
  };
  const presenter = createLoadingPresenter({ document, bus });

  bus.emit('game:loadingProgress', { id: 'restoring-save', progress: 0.1 });
  assert.equal(overlay.classList.contains('hidden'), false);
  assert.equal(overlay.attributes.get('aria-busy'), 'true');

  bus.emit('save:error', { slot: 'auto', message: 'Invalid save' });
  assert.equal(overlay.classList.contains('hidden'), true);
  assert.equal(overlay.attributes.get('aria-busy'), 'false');
  presenter.destroy();
});

test('loading bar eases into each stage and keeps creeping while a stage runs', () => {
  // A pumpable rAF: the presenter's smoothing loop only exists when an animation clock does.
  let rafQueue = [];
  const prevRaf = globalThis.requestAnimationFrame;
  const prevCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = (fn) => { rafQueue.push(fn); return rafQueue.length; };
  globalThis.cancelAnimationFrame = () => { rafQueue = []; };
  try {
    const bus = createBus();
    const overlay = fakeElement();
    const progress = fakeElement();
    const pct = fakeElement();
    const document = {
      getElementById(id) { return id === 'boot-overlay' ? overlay : null; },
      querySelector(selector) {
        return new Map([
          ['[data-loading-progress]', progress],
          ['[data-loading-pct]', pct],
        ]).get(selector) || null;
      },
    };
    overlay.classList.add('hidden');
    overlay.style.display = 'none';

    const presenter = createLoadingPresenter({ document, bus });
    const width = () => parseFloat(progress.style.width) || 0;
    // Drain one queued frame per pump step, handing the loop a deterministic clock.
    let clock = 0;
    const pump = (frames, stepMs = 16.7) => {
      const seen = [];
      for (let i = 0; i < frames; i++) {
        const q = rafQueue; rafQueue = [];
        clock += stepMs;
        for (const fn of q) fn(clock);
        seen.push(width());
      }
      return seen;
    };

    bus.emit('game:loadingProgress', { id: 'preparing-run', progress: 0.08, label: 'Preparing' });
    assert.equal(width(), 8, 'a fresh session snaps the bar to the first reported step');

    bus.emit('game:loadingProgress', { id: 'authored-library', progress: 0.25 });
    const ramp = pump(4);
    assert.ok(ramp[0] < 12, `the step must ease, not click — first frames still near 8%, got ${ramp[0]}`);
    assert.ok(ramp.every((v, i) => i === 0 || v >= ramp[i - 1]), 'the bar must never regress mid-stage');

    const approach = pump(60); // ~1s — most of the gap closes, creep already opening headroom
    const settled = approach[approach.length - 1];
    assert.ok(settled > 20 && settled < 30, `should be most of the way to 25% + creep, got ${settled}`);

    const creep = pump(180); // ~3s waiting inside the stage — the bar keeps inching forward
    assert.ok(creep[creep.length - 1] > settled, 'a running stage must keep creeping, not park');
    assert.ok(creep[creep.length - 1] <= 31.5, 'creep stays inside a small overhang past the stage');

    bus.emit('game:loadingProgress', { id: 'authored-visuals', progress: 0.5 });
    const next = pump(30);
    assert.ok(next[next.length - 1] > creep[creep.length - 1] + 2,
      'the next stage accelerates off the step again');
    assert.match(pct.textContent, /%$/, 'the pct readout tracks the smoothed value');
    presenter.destroy();
  } finally {
    globalThis.requestAnimationFrame = prevRaf;
    globalThis.cancelAnimationFrame = prevCancel;
  }
});

test('canonical game shell and transition wire the shared staged loading presenter', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const newGame = readFileSync(new URL('../src/ui/screens/newGame.js', import.meta.url), 'utf8');
  // The title screen owns no CSS (frontend kit); the Continue veil's look lives in styles/ui.css.
  const mainMenu = readFileSync(new URL('../src/ui/screens/mainMenu.js', import.meta.url), 'utf8');
  const uiCss = readFileSync(new URL('../styles/ui.css', import.meta.url), 'utf8');
  const probe = readFileSync(new URL('../scripts/probe-startup-transition.mjs', import.meta.url), 'utf8');
  const precompile = readFileSync(new URL('../src/render/precompile.js', import.meta.url), 'utf8');
  const readiness = readFileSync(new URL('../src/render/pipelineReadiness.js', import.meta.url), 'utf8');
  const renderer = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');

  assert.match(html, /data-loading-label/);
  assert.match(html, /data-loading-detail/);
  assert.match(html, /data-loading-progress/);
  assert.match(main, /createLoadingPresenter\(\{ document, bus, state \}\)/,
    'main wires the presenter with state so the flight handoff can wait for a real presented frame');
  assert.match(main, /reportProgress:\s*\(stage\)\s*=>\s*bus\.emit\('game:loadingProgress'/);
  assert.match(main, /yieldForPresentation:\s*nextPaint/);
  assert.match(newGame, /createStageHull.*'\.\/stageHull\.js'/,
    'New Game must show the authored starter hull via the shared kit-stage mount');
  assert.doesNotMatch(newGame, /\/evidence\//,
    'packaged New Game must not depend on authoring evidence excluded from the retail bundle');
  assert.doesNotMatch(newGame, /createShipPreviewMount/,
    'New Game must not decode a second full Kestrel in another WebGL context');
  assert.match(mainMenu, /className = 'sf-continue-fade'/,
    'Continue must still raise the location veil');
  assert.match(uiCss, /\.sf-continue-fade\s*\{[^}]*z-index:1900/,
    'Continue location veil must stay below the shared z-index 2000 loading shell');
  assert.doesNotMatch(probe, /fade\.classList\.contains\('open'\)/,
    'Continue proof must capture the visible loader without waiting for an impossible veil gap');
  assert.doesNotMatch(renderer, /loadingAdmission[\s\S]{0,300}?warmScenePipelines/,
    'startup pipeline admission must not force-render the authored batch on the main thread');
  assert.doesNotMatch(precompile,
    /residentBufferWarm\s*=\s*await\s+warmResidentSceneWithShadowPipelines/,
    'startup precompile must not render the complete live scene under the loading shell');
  assert.match(renderer, /captureOpeningPipelinePlan/, 'startup must expose the broad compatibility capture');
  assert.match(renderer, /state\.mode === 'loading'[\s\S]{0,700}?opening-submission-plan-owns-first-picture/,
    'loading must bypass the broad authored-root watermark');
  assert.doesNotMatch(readiness, /compileCurrentPipelines|waitForAuthoredGpuResidency/,
    'startup must never invoke the diagnostic installed-scene compiler or a moving residency wait');
  assert.match(renderer, /this\.state\.mode === 'loading'\) return false/,
    'the covered world must not render behind the loading shell');
  assert.match(renderer, /_deferNoncriticalMeshStreaming[\s\S]{0,1500}?_meshReconcileDirty = true/,
    'noncritical sector roots must resume only after the first completed flight draw');
  assert.match(renderer, /createOpeningSubmissionPlan/, 'startup must build an exact first-picture leaf plan');
  assert.match(renderer, /state\.render\.captureOpeningSubmissionPlan/,
    'startup must capture an exact first-picture leaf plan');
  assert.doesNotMatch(renderer, /state\.render\.prepareOpeningGpuResources[\s\S]{0,1800}?_renderOpeningPostFrame\(/,
    'the loading path must not render a hidden discovery frame');
  assert.match(renderer, /opening-submission-plan-owns-first-picture/,
    'speculative global loading pipeline work must yield to exact first-picture admission');
  assert.doesNotMatch(renderer, /deferredStartupPrecompile|backgroundPipelinePrecompileReady/,
    'current-sector shader admission must not begin after the first playable frame');
  assert.match(renderer, /gpu\.software[\s\S]{0,300}?bounded on-demand pipeline admission/,
    'software renderers must not pay a multi-second speculative sector compile');
  assert.match(renderer, /state\.render\.dynResScale = softwareEmergency\.dynFloor[\s\S]{0,120}?this\._applySize\(\)/,
    'software renderers must begin at their emergency scale instead of freezing the first full-size frame');
});

test('flight handoff keeps the shell up until the renderer presents past the mode change', () => {
  // The held-canvas bug: mode -> flight used to drop the shell while the canvas still showed the
  // frozen menu-era picture. With a state wired in, the hide must wait for info.render.frame
  // (three's presented-frame counter — info.frame does not exist) to advance.
  let rafQueue = [];
  const prevRaf = globalThis.requestAnimationFrame;
  const prevCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = (fn) => { rafQueue.push(fn); return rafQueue.length; };
  globalThis.cancelAnimationFrame = () => { rafQueue = []; };
  try {
    const bus = createBus();
    const overlay = fakeElement();
    const document = { getElementById: () => overlay, querySelector: () => null };
    const info = { render: { frame: 10 } };
    const state = { render: { renderer: { info } } };
    const presenter = createLoadingPresenter({ document, bus, state });
    const pump = (frames) => {
      for (let i = 0; i < frames; i++) {
        const q = rafQueue; rafQueue = [];
        for (const fn of q) fn(i * 16.7);
      }
    };

    bus.emit('game:loadingProgress', { id: 'entering-flight', progress: 0.96 });
    assert.equal(overlay.classList.contains('hidden'), false);

    bus.emit('mode:changed', { mode: 'flight', previousMode: 'loading' });
    pump(3);
    assert.equal(overlay.classList.contains('hidden'), false,
      'the mode flag alone must not drop the shell — the canvas still holds the old picture');

    info.render.frame = 11; // the first real flight present
    pump(2);
    assert.equal(overlay.classList.contains('hidden'), true,
      'the shell lifts once a real frame has been presented');
    presenter.destroy();
  } finally {
    globalThis.requestAnimationFrame = prevRaf;
    globalThis.cancelAnimationFrame = prevCancel;
  }
});

test('Continue yields its destructive restore until the loading shell can paint', () => {
  const bus = createBus();
  const deferred = [];
  const loads = [];
  const runtime = Object.create(save);
  runtime.load = (slot) => loads.push(slot);
  runtime.init({
    state: { settings: {} },
    bus,
    helpers: {
      deferLoadedGameRestore(start) {
        deferred.push(start);
        return true;
      },
    },
    registry: {},
  });

  bus.emit('game:load', { slot: 'auto' });
  assert.deepEqual(loads, [], 'restore must not monopolize the same frame as the Continue click');
  assert.equal(deferred.length, 1);

  deferred[0]();
  assert.deepEqual(loads, ['auto']);
});

function fakeElement() {
  const classes = new Set();
  return {
    textContent: '',
    style: {},
    dataset: {},
    attributes: new Map(),
    classList: {
      add(value) { classes.add(value); },
      remove(value) { classes.delete(value); },
      contains(value) { return classes.has(value); },
    },
    setAttribute(name, value) { this.attributes.set(name, String(value)); },
  };
}

class FakeElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.style = {};
    this.dataset = {};
    this.attributes = new Map();
    this.children = [];
    this.listeners = new Map();
    this.parentNode = null;
    this.className = '';
    this._textContent = '';
    this._innerHTML = '';
    this.classList = {
      contains: (name) => this.className.split(/\s+/).includes(name),
      add: (name) => { if (!this.classList.contains(name)) this.className = `${this.className} ${name}`.trim(); },
      remove: (name) => { this.className = this.className.split(/\s+/).filter((part) => part && part !== name).join(' '); },
    };
  }
  set textContent(value) { this._textContent = String(value); }
  get textContent() { return this._textContent + this.children.map((child) => child.textContent).join(''); }
  set innerHTML(value) { this._innerHTML = String(value); }
  get innerHTML() { return this._innerHTML; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  removeAttribute(name) { this.attributes.delete(name); }
  appendChild(child) { child.parentNode?.removeChild(child); this.children.push(child); child.parentNode = this; return child; }
  removeChild(child) { this.children = this.children.filter((item) => item !== child); child.parentNode = null; return child; }
  addEventListener(type, fn) { const rows = this.listeners.get(type) || []; rows.push(fn); this.listeners.set(type, rows); }
  dispatch(type) { for (const fn of this.listeners.get(type) || []) fn({ type, target: this }); }
  focus() { this.focused = true; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const matches = (node) => selector.startsWith('.')
      ? node.classList.contains(selector.slice(1))
      : selector.startsWith('[') ? node.attributes.has(selector.slice(1, -1))
        : selector === node.tagName.toLowerCase();
    const out = [];
    const visit = (node) => { for (const child of node.children) { if (matches(child)) out.push(child); visit(child); } };
    visit(this);
    return out;
  }
}

class FakeBus {
  constructor() { this.listeners = new Map(); this.events = []; }
  on(name, fn) {
    const rows = this.listeners.get(name) || [];
    rows.push(fn); this.listeners.set(name, rows);
    return () => this.listeners.set(name, rows.filter((row) => row !== fn));
  }
  emit(name, payload = {}) {
    this.events.push({ name, payload });
    for (const fn of [...(this.listeners.get(name) || [])]) fn(payload);
  }
}

function fixture(mode = 'loading') {
  const overlay = new FakeElement();
  overlay.id = 'boot-overlay';
  overlay.style.display = 'flex';
  const lockup = new FakeElement();
  lockup.className = 'boot-lockup';
  overlay.appendChild(lockup);
  const parts = {
    '[data-loading-label]': new FakeElement('span'),
    '[data-loading-detail]': new FakeElement('span'),
    '[data-loading-progress]': new FakeElement('span'),
    '[data-loading-pct]': new FakeElement('span'),
  };
  const doc = {
    defaultView: {},
    getElementById: (id) => id === 'boot-overlay' ? overlay : null,
    querySelector: (selector) => parts[selector] || null,
    createElement: (tag) => new FakeElement(tag),
  };
  const priorDocument = globalThis.document;
  globalThis.document = doc;
  const bus = new FakeBus();
  const state = { mode, render: { admissionRunGeneration: 3 } };
  return { doc, overlay, lockup, parts, bus, state, priorDocument };
}

async function makePresenter(f) {
  const { createLoadingPresenter } = await import('../src/ui/loadingPresenter.js');
  return createLoadingPresenter({ document: f.doc, bus: f.bus, state: f.state, hideDelayMs: 5 });
}

test('startup failure stays visible through late progress, menu and save-error events with explicit recovery actions', async () => {
  const f = fixture();
  const presenter = await makePresenter(f);
  try {
    presenter.show({ id: 'gpu-resources', progress: .8, label: 'Preparing flight materials' });
    f.state.mode = 'menu';
    f.bus.emit('mode:changed', { mode: 'menu' });
    f.bus.emit('game:startFailed', {
      code: 'GPU_RESIDENCY_UNAVAILABLE', stage: 'gpu-resources', error: '<img src=x onerror=alert(1)>',
    });
    const pane = f.overlay.querySelector('[data-startup-failure]');
    assert.ok(pane);
    assert.equal(f.overlay.getAttribute('aria-busy'), 'false');
    assert.equal(f.overlay.classList.contains('hidden'), false);
    assert.equal(f.lockup.style.display, 'none', 'busy logo and progress copy are removed');
    assert.match(pane.querySelector('.sf-state__word').textContent, /GPU RESIDENCY UNAVAILABLE/);
    assert.equal(pane.querySelector('.sf-state__fills').textContent, 'The launch stopped during gpu-resources.');
    assert.equal(pane.querySelector('.sf-state__detail').textContent, '<img src=x onerror=alert(1)>');
    assert.equal(pane.querySelectorAll('img').length, 0, 'untrusted error text is never parsed as markup');

    f.bus.emit('game:loadingProgress', { id: 'render-pipelines', generation: 3, progress: .99, label: 'Nearly ready' });
    f.bus.emit('game:loadingProgress', { id: 'stale', generation: 2, progress: .2, label: 'Old launch' });
    f.bus.emit('mode:changed', { mode: 'menu' });
    f.bus.emit('save:error', { reason: 'load_failed', error: 'late duplicate' });
    assert.equal(f.overlay.querySelector('[data-startup-failure]'), pane);
    assert.equal(f.overlay.classList.contains('hidden'), false);

    const buttons = pane.querySelectorAll('button');
    assert.deepEqual(buttons.map((button) => button.textContent), ['Retry', 'Back to menu']);
    buttons[0].dispatch('click');
    assert.equal(f.bus.events.at(-1).name, 'game:retryStart');
    assert.equal(f.overlay.querySelector('[data-startup-failure]'), pane,
      'retry keeps the explanation until the new launch actually begins');
    buttons[1].dispatch('click');
    assert.deepEqual(f.bus.events.slice(-3).map((event) => event.name),
      ['game:exitToMenu', 'ui:closeAll', 'ui:pushScreen']);
    assert.equal(f.bus.events.at(-1).payload.id, 'mainMenu');
    assert.equal(f.overlay.querySelector('[data-startup-failure]'), null);
    assert.equal(f.overlay.classList.contains('hidden'), true, 'Back is the explicit dismissal action');
  } finally {
    presenter.destroy(); globalThis.document = f.priorDocument;
  }
});

test('only a current new session or matching loading mode clears the failure latch', async () => {
  const f = fixture('menu');
  const presenter = await makePresenter(f);
  try {
    f.bus.emit('game:startFailed', { code: 'GAME_START_FAILED', stage: 'startup', error: 'failed once' });
    const originalPane = f.overlay.querySelector('[data-startup-failure]');
    f.bus.emit('mode:changed', { mode: 'loading' });
    assert.equal(f.overlay.querySelector('[data-startup-failure]'), originalPane,
      'stale mode notifications cannot dismiss a current failure');

    f.state.mode = 'loading';
    f.bus.emit('mode:changed', { mode: 'loading' });
    assert.equal(f.overlay.querySelector('[data-startup-failure]'), null);
    assert.equal(f.overlay.getAttribute('aria-busy'), 'true');
    assert.equal(f.lockup.style.display, '', 'the normal loading shell returns for the new session');

    f.state.mode = 'menu';
    f.bus.emit('game:startFailed', { code: 'GAME_START_FAILED', stage: 'startup', error: 'failed again' });
    assert.ok(f.overlay.querySelector('[data-startup-failure]'));
    f.bus.emit('game:new', { source: 'retry' });
    assert.equal(f.overlay.querySelector('[data-startup-failure]'), null);
    f.bus.emit('game:startFailed', { code: 'GAME_START_FAILED', stage: 'startup', error: 'load failed' });
    assert.ok(f.overlay.querySelector('[data-startup-failure]'));
    f.bus.emit('game:load', { source: 'continue' });
    assert.equal(f.overlay.querySelector('[data-startup-failure]'), null,
      'a new Continue intent also releases the prior failure');
  } finally {
    presenter.destroy(); globalThis.document = f.priorDocument;
  }
});

test('load_failed during the active loading shell becomes a startup failure; ordinary save errors do not', async () => {
  const f = fixture('menu'); // Worker mode can still mirror menu when the restore has begun.
  const presenter = await makePresenter(f);
  const startFailures = [];
  f.bus.on('game:startFailed', (payload) => startFailures.push(payload));
  try {
    presenter.show({ id: 'restoring-save', progress: .4, label: 'Restoring save' });
    f.bus.emit('save:error', { reason: 'load_failed', slot: 'latest', error: 'save header checksum mismatch' });
    assert.ok(f.overlay.querySelector('[data-startup-failure]'));
    assert.equal(startFailures.length, 1, 'retry ownership learns about pre-finalizer restore failure');
    assert.equal(startFailures[0].stage, 'save-restore');
    assert.equal(startFailures[0].code, 'SAVE_LOAD_FAILED');
    assert.equal(f.overlay.querySelector('.sf-state__detail').textContent, 'save header checksum mismatch');
  } finally {
    presenter.destroy(); globalThis.document = f.priorDocument;
  }

  const ordinary = fixture('flight');
  const ordinaryPresenter = await makePresenter(ordinary);
  try {
    ordinaryPresenter.show({ id: 'save-write', progress: .2, label: 'Saving' });
    ordinary.bus.emit('save:error', { reason: 'disk_full', error: 'quota exceeded' });
    assert.equal(ordinary.overlay.querySelector('[data-startup-failure]'), null);
    assert.equal(ordinary.overlay.classList.contains('hidden'), true);
  } finally {
    ordinaryPresenter.destroy(); globalThis.document = ordinary.priorDocument;
  }
});
