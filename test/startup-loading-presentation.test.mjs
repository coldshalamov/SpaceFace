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

test('canonical game shell and transition wire the shared staged loading presenter', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const newGame = readFileSync(new URL('../src/ui/screens/newGame.js', import.meta.url), 'utf8');
  const mainMenu = readFileSync(new URL('../src/ui/screens/mainMenu.js', import.meta.url), 'utf8');
  const probe = readFileSync(new URL('../scripts/probe-startup-transition.mjs', import.meta.url), 'utf8');
  const precompile = readFileSync(new URL('../src/render/precompile.js', import.meta.url), 'utf8');
  const readiness = readFileSync(new URL('../src/render/pipelineReadiness.js', import.meta.url), 'utf8');
  const renderer = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');

  assert.match(html, /data-loading-label/);
  assert.match(html, /data-loading-detail/);
  assert.match(html, /data-loading-progress/);
  assert.match(main, /createLoadingPresenter\(\{ document, bus \}\)/);
  assert.match(main, /reportProgress:\s*\(stage\)\s*=>\s*bus\.emit\('game:loadingProgress'/);
  assert.match(main, /yieldForPresentation:\s*nextPaint/);
  assert.match(newGame, /assets\/ships\/release\/ui\/kestrel_v5_starter_portrait\.png/);
  assert.doesNotMatch(newGame, /\/evidence\//,
    'packaged New Game must not depend on authoring evidence excluded from the retail bundle');
  assert.doesNotMatch(newGame, /createShipPreviewMount/,
    'New Game must not decode a second full Kestrel in another WebGL context');
  assert.match(mainMenu, /\.sf-continue-fade\s*\{[^}]*z-index:1900/,
    'Continue location veil must stay below the shared z-index 2000 loading shell');
  assert.doesNotMatch(probe, /fade\.classList\.contains\('open'\)/,
    'Continue proof must capture the visible loader without waiting for an impossible veil gap');
  assert.doesNotMatch(renderer, /loadingAdmission[\s\S]{0,300}?warmScenePipelines/,
    'startup pipeline admission must not force-render the authored batch on the main thread');
  assert.doesNotMatch(precompile,
    /residentBufferWarm\s*=\s*await\s+warmResidentSceneWithShadowPipelines/,
    'startup precompile must not render the complete live scene under the loading shell');
  assert.match(renderer, /captureOpeningPipelinePlan[\s\S]{0,160}?capturePending/,
    'startup must freeze a finite authored-root pipeline watermark');
  assert.doesNotMatch(readiness, /compileCurrentPipelines|waitForAuthoredGpuResidency/,
    'startup must never invoke the diagnostic installed-scene compiler or a moving residency wait');
  assert.match(renderer, /this\.state\.mode === 'loading'\) return false/,
    'the covered world must not render behind the loading shell');
  assert.match(renderer, /_deferNoncriticalMeshStreaming[\s\S]{0,1500}?_meshReconcileDirty = true/,
    'noncritical sector roots must resume only after the first completed flight draw');
  assert.match(renderer, /openingFrameStarted[\s\S]{0,900}?this\._renderOpeningPostFrame\(scene, cam\.obj\)/,
    'the exact scoped opening frame must render under the loading shell before handoff');
  assert.match(renderer,
    /state\.mode === 'loading'[\s\S]{0,900}?precompilePipelines\(renderer, scene, cam\.obj, \{[\s\S]{0,240}?sector,[\s\S]{0,240}?includeGlobalPipelines:\s*true/,
    'hardware startup must admit current-sector and global shader variants behind the loading shell');
  assert.doesNotMatch(renderer, /deferredStartupPrecompile|backgroundPipelinePrecompileReady/,
    'current-sector shader admission must not begin after the first playable frame');
  assert.match(renderer, /gpu\.software[\s\S]{0,300}?bounded on-demand pipeline admission/,
    'software renderers must not pay a multi-second speculative sector compile');
  assert.match(renderer, /gpu\.software[\s\S]{0,900}?state\.render\.dynResScale = dynFloor[\s\S]{0,120}?this\._applySize\(\)/,
    'software renderers must begin at their emergency scale instead of freezing the first full-size frame');
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
