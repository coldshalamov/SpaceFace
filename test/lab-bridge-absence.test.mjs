// Prove the live-route stepping bridge is ABSENT from production output (Phase 4 §8).
// Uses esbuild dropLabels the same way build-bundle.mjs does — does not run the full asset copy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

import {
  LIVE_ROUTE_BRIDGE_API,
  LIVE_ROUTE_BRIDGE_FORBIDDEN,
  installLiveRouteBridge,
} from '../src/testing/lab/liveRouteBridge.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('build-bundle.mjs drops SF_DEBUG_ONLY labels', () => {
  const src = readFileSync(join(ROOT, 'scripts/build-bundle.mjs'), 'utf8');
  assert.match(src, /dropLabels:\s*\[\s*['"]SF_DEBUG_ONLY['"]\s*\]/);
  assert.match(src, /__SPACEFACE_PRODUCTION__:\s*['"]true['"]/);
});

test('main.js installs labBridge only inside SF_DEBUG_ONLY', () => {
  const main = readFileSync(join(ROOT, 'src/main.js'), 'utf8');
  // Dynamic import of liveRouteBridge + labBridge assignment must sit under SF_DEBUG_ONLY.
  assert.match(
    main,
    /SF_DEBUG_ONLY:\s*if\s*\(\s*SF_DEBUG\s*\)\s*\{[\s\S]*?liveRouteBridge\.js[\s\S]*?labBridge\s*=/,
  );
  // Static top-level import of the bridge module is forbidden (would enter the production graph).
  assert.doesNotMatch(main, /^import\s+.*liveRouteBridge/m);
  // Only one labBridge assignment site.
  const assigns = main.match(/labBridge\s*=/g) || [];
  assert.equal(assigns.length, 1);
});

test('esbuild dropLabels strips bridge symbols from a production-like transform', async () => {
  const bridgeSrc = readFileSync(join(ROOT, 'src/testing/lab/liveRouteBridge.js'), 'utf8');
  // Synthetic entry mirrors main.js: bridge only under SF_DEBUG_ONLY.
  const entry = `
    const SF_DEBUG = typeof __SPACEFACE_PRODUCTION__ !== 'undefined' ? !__SPACEFACE_PRODUCTION__ : true;
    window.KEEP_ME = 'production-ok';
    SF_DEBUG_ONLY: if (SF_DEBUG) {
      window.SF = window.SF || {};
      window.SF.labBridge = {
        pauseAutomaticLoop() { return { ok: true }; },
        resumeAutomaticLoop() { return { ok: true }; },
        loadCompiledScenario() { return { ok: true }; },
        applyRawControlEvents() { return { ok: true }; },
        stepTicks() { return { ok: true }; },
        snapshot() { return { ok: true }; },
        checkpoint() { return { ok: true }; },
        renderOnce() { return { ok: true }; },
        destroyScenario() { return { ok: true }; },
      };
    }
  `;
  const result = await esbuild.build({
    stdin: {
      contents: entry,
      resolveDir: ROOT,
      sourcefile: 'lab-bridge-absence-entry.js',
      loader: 'js',
    },
    bundle: false,
    write: false,
    minify: true,
    dropLabels: ['SF_DEBUG_ONLY'],
    define: {
      __SPACEFACE_PRODUCTION__: 'true',
    },
    format: 'esm',
    target: ['chrome110'],
  });
  const out = result.outputFiles.map((f) => f.text).join('\n');
  assert.match(out, /production-ok|KEEP_ME/);
  for (const name of LIVE_ROUTE_BRIDGE_API) {
    assert.equal(out.includes(name), false, `production output must not contain bridge method ${name}`);
  }
  assert.equal(out.includes('labBridge'), false, 'production output must not contain labBridge');
  // Source module still has the API for debug — this test only covers the dropLabels gate.
  assert.ok(bridgeSrc.includes('pauseAutomaticLoop'));
});

test('bridge API does not expose forbidden mutation surfaces', () => {
  const fakeSf = {
    state: {
      timeScale: 1,
      tick: 0,
      simTime: 0,
      mode: 'flight',
      playerId: 1,
      entities: new Map([[1, { id: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, alive: true, hull: 100 }]]),
      entityList: [{ id: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, alive: true, hull: 100 }],
      input: { keys: {}, moveX: 0, moveZ: 0, turnIntent: 0, boost: false },
      player: {},
      settings: { gameplay: {} },
      meta: { seed: 1 },
    },
    registry: {
      step() {},
      renderUpdate() {},
    },
    helpers: {},
  };
  const bridge = installLiveRouteBridge(fakeSf);
  for (const name of LIVE_ROUTE_BRIDGE_API) {
    assert.equal(typeof bridge[name], 'function', name);
  }
  for (const name of LIVE_ROUTE_BRIDGE_FORBIDDEN) {
    assert.equal(bridge[name], undefined, `forbidden ${name}`);
  }
  assert.equal(Object.isFrozen(bridge), true);
  const pause = bridge.pauseAutomaticLoop();
  assert.equal(pause.ok, true);
  // Pause must go through time-effects owner (single writer) — effective scale 0.
  assert.equal(fakeSf.state.timeScale, 0);
  const snap = bridge.snapshot();
  assert.equal(snap.ok, true);
  assert.equal(snap.paused, true);
  const resume = bridge.resumeAutomaticLoop();
  assert.equal(resume.ok, true);
  assert.equal(fakeSf.state.timeScale, 1);
});

test('FIX1: bridge source does not assign state.timeScale directly', () => {
  const bridgeSrc = readFileSync(join(ROOT, 'src/testing/lab/liveRouteBridge.js'), 'utf8');
  assert.match(bridgeSrc, /createTimeEffects/);
  assert.match(bridgeSrc, /LAB_LIVE_ROUTE_TIME_SOURCE|lab:live-route/);
  assert.doesNotMatch(bridgeSrc, /\.timeScale\s*=/);
});

test('FIX6: loadCompiledScenario rejects non-player entities instead of silent skip', () => {
  const fakeSf = {
    state: {
      timeScale: 1,
      tick: 0,
      simTime: 0,
      mode: 'flight',
      playerId: 1,
      entities: new Map([[1, { id: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, alive: true, hull: 100 }]]),
      entityList: [{ id: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, alive: true, hull: 100 }],
      input: { keys: {}, moveX: 0, moveZ: 0, turnIntent: 0, boost: false },
      player: {},
      settings: { gameplay: {} },
      meta: { seed: 1 },
    },
    registry: { step() {}, renderUpdate() {} },
    helpers: {},
  };
  const bridge = installLiveRouteBridge(fakeSf);
  const result = bridge.loadCompiledScenario({
    id: 'massline.unsupported-on-live-route',
    entities: [
      { alias: 'player', isPlayer: true, pos: { x: 0, z: 0 } },
      { alias: 'anchor', isPlayer: false, pos: { x: 120, z: 0 } },
    ],
    attachments: [{ defId: 'tether_standard', ownerAlias: 'player', targetAlias: 'anchor' }],
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'unsupported');
  assert.match(String(result.reason), /non-player|attachment/i);
});


test('optional: if build/web exists, bridge symbols are absent', () => {
  const webMain = join(ROOT, 'build/web/main.js');
  if (!existsSync(webMain)) {
    // Not required to rebuild full production assets in Phase 4 unit gate.
    return;
  }
  const text = readFileSync(webMain, 'utf8');
  for (const name of ['pauseAutomaticLoop', 'loadCompiledScenario', 'labBridge', 'installLiveRouteBridge']) {
    assert.equal(text.includes(name), false, `build/web/main.js must not contain ${name}`);
  }
});
