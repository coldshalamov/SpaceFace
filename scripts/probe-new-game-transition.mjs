#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { createGameServer } = require('./lib/gameServer.cjs');

const server = createGameServer({ root: ROOT, async: true, devDiagnostics: true });
await new Promise((resolveListen, rejectListen) => {
  server.once('error', rejectListen);
  server.listen(0, '127.0.0.1', resolveListen);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const base = `http://127.0.0.1:${address.port}/`;

let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const browserLog = [];
  page.on('console', (message) => browserLog.push({ type: message.type(), text: message.text() }));
  page.on('pageerror', (error) => browserLog.push({ type: 'pageerror', text: String(error?.stack || error) }));
  page.on('requestfailed', (request) => browserLog.push({
    type: 'requestfailed',
    text: `${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`,
  }));

  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF?.state && window.SF?.bus && window.SF?.registry, null, { timeout: 20_000 });
  await page.evaluate(() => {
    const trace = [];
    const state = window.SF.state;
    const bus = window.SF.bus;
    const save = window.SF.registry.get('save');
    const stamp = (event, payload = null) => trace.push({
      at: performance.now(), event, payload,
      mode: state.mode,
      playerId: state.playerId,
      entityCount: state.entityList.length,
      restoring: !!save?._restoring,
      pendingRunTransition: !!save?._pendingRunTransition,
    });
    for (const event of ['mode:changed', 'game:started', 'game:startFailed', 'save:error']) {
      bus.on(event, (payload) => stamp(event, payload));
    }
    const originalDefer = save.deferRunTransition.bind(save);
    save.deferRunTransition = (callback) => {
      stamp('save.deferRunTransition:before');
      const deferred = originalDefer(callback);
      stamp('save.deferRunTransition:after', { deferred });
      return deferred;
    };
    window.__NEW_GAME_PROBE__ = { trace, startedAt: performance.now() };
    stamp('probe:ready', { gameNewListeners: bus._listeners?.get('game:new')?.size || 0 });
    bus.emit('game:new', { name: 'Transition Probe', seed: 47, difficulty: 'casual' });
    stamp('probe:emitted');
  });

  const checkpoints = [];
  for (const waitMs of [0, 50, 250, 1000, 3000, 7000, 15000]) {
    if (waitMs) await page.waitForTimeout(waitMs - (checkpoints.at(-1)?.waitMs || 0));
    checkpoints.push(await page.evaluate(async (checkpointMs) => {
      const state = window.SF.state;
      const save = window.SF.registry.get('save');
      const player = state.entityList.find((entity) => entity?.id === state.playerId);
      const { getAuthoredAssetDiagnostic } = await import('/src/render/assetLoader.js');
      const diagnosticUrls = [
        'assets/ships/parts/wholeships/kestrel.glb',
        'assets/ships/parts/places/place_station_trade_hub.glb',
        'assets/ships/release/parts/wholeships/kestrel.glb',
        'assets/ships/release/parts/places/place_station_trade_hub.glb',
      ];
      const authoredDiagnostics = {};
      for (const url of diagnosticUrls) {
        const error = await getAuthoredAssetDiagnostic(state.render?.renderer, url, url.includes('/wholeships/') ? 'hull' : 'place');
        authoredDiagnostics[url] = error ? String(error?.stack || error) : null;
      }
      return {
        waitMs: checkpointMs,
        mode: state.mode,
        playerId: state.playerId,
        playerFound: !!player,
        entityCount: state.entityList.length,
        restoring: !!save?._restoring,
        pendingRunTransition: !!save?._pendingRunTransition,
        timeEffects: state.timeEffects,
        assetErrors: state.render?.assetErrors,
        authoredDiagnostics,
        trace: window.__NEW_GAME_PROBE__.trace,
      };
    }, waitMs));
    if (checkpoints.at(-1).mode === 'flight' || checkpoints.at(-1).trace.some((entry) => entry.event === 'game:startFailed')) break;
  }

  console.log(JSON.stringify({ base, checkpoints, browserLog }, null, 2));
} finally {
  if (browser) await browser.close().catch(() => {});
  await new Promise((resolveClose) => server.close(resolveClose));
}
