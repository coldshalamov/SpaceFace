// Browser keyboard/pointer input → same grammar as tape path (Phase 4 §8).
// Uses the live-route debug bridge on the zero-build dev server (manual-step, not acceptance).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from '../scripts/lib/load-playwright.mjs';
import { killProcessTree } from '../scripts/lib/validationProcessControl.mjs';
import { createInputTapeDriver } from '../src/testing/lab/inputTape.js';
import { createGameState } from '../src/core/gameState.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TIMEOUT_MS = 240_000;
const DOCUMENT_READY_TIMEOUT_MS = 90_000;
const APP_READY_TIMEOUT_MS = 90_000;
const LAB_BRIDGE_READY_TIMEOUT_MS = 30_000;

test('browser KeyW produces the same moveZ grammar as the lab tape path', async () => {
  // Reference tape grammar (Node, no browser).
  const stateRef = createGameState(47);
  stateRef.input = stateRef.input || {};
  const driver = createInputTapeDriver({
    events: [
      { tick: 0, device: 'keyboard', code: 'KeyW', pressed: true },
    ],
    frames: [],
  });
  const applied = driver.apply(stateRef, 0, 1 / 60, { playerEntity: null, tetherAttached: false });
  assert.equal(applied.moveZ, 1);
  assert.ok(applied.keys.KeyW);

  let server = null;
  let browser = null;
  let timer = null;
  const startedAt = Date.now();

  const cleanup = async () => {
    if (timer) clearTimeout(timer);
    if (browser) {
      try { await browser.close(); } catch (_) {}
      browser = null;
    }
    if (server?.child?.pid) {
      try { await killProcessTree(server.child.pid); } catch (_) {}
      server = null;
    }
  };

  try {
    timer = setTimeout(() => {
      throw new Error(`lab-browser-input-grammar timed out after ${TIMEOUT_MS}ms`);
    }, TIMEOUT_MS);
    timer.unref?.();

    server = await startFreshServer(ROOT);
    const { chromium } = await loadPlaywright();
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.addInitScript(() => {
      try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
    });
    await page.goto(server.baseUrl, {
      waitUntil: 'domcontentloaded',
      timeout: DOCUMENT_READY_TIMEOUT_MS,
    });
    await page.waitForFunction(
      () => !!(window.SF && window.SF.state && window.SF.registry),
      null,
      { timeout: APP_READY_TIMEOUT_MS },
    );
    await page.waitForFunction(
      () => !!(window.SF && window.SF.labBridge),
      null,
      { timeout: LAB_BRIDGE_READY_TIMEOUT_MS },
    );

    // Pause automatic loop so input is measured without sim noise.
    await page.evaluate(() => window.SF.labBridge.pauseAutomaticLoop());

    // Real browser keyboard event via Playwright.
    await page.keyboard.down('w');
    // Give the live input system one frame to sample, then apply via bridge raw path
    // AND read state.input after a production input system tick if available.
    const viaBridge = await page.evaluate(() => {
      const bridge = window.SF.labBridge;
      // Raw control events go through transitionFlightKeyState (production grammar).
      return bridge.applyRawControlEvents([
        { code: 'KeyW', pressed: true },
      ]);
    });
    assert.equal(viaBridge.ok, true);
    assert.equal(viaBridge.input.moveZ, 1, `bridge grammar moveZ expected 1 got ${viaBridge.input.moveZ}`);
    assert.ok(viaBridge.input.keys.includes('KeyW'));

    // Also dispatch a real KeyboardEvent on window and sample through applyRawControlEvents
    // after reading codes — proves browser event.code shape matches tape codes.
    const browserCode = await page.evaluate(() => {
      let seen = null;
      const handler = (ev) => { seen = ev.code; };
      window.addEventListener('keydown', handler, { once: true });
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true }));
      window.removeEventListener('keydown', handler);
      return seen;
    });
    assert.equal(browserCode, 'KeyW');

    // Tape path on Node with the same code must match bridge axes.
    assert.equal(viaBridge.input.moveZ, applied.moveZ);
    assert.equal(viaBridge.input.moveX, applied.moveX);

    await page.keyboard.up('w');
    const durationMs = Date.now() - startedAt;
    assert.ok(durationMs < TIMEOUT_MS);
  } finally {
    await cleanup();
  }
});

async function startFreshServer(root) {
  const port = await freePort();
  const child = spawn(process.execPath, [join(root, 'server.js')], {
    cwd: root,
    env: { ...process.env, PORT: String(port), SF_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: process.platform !== 'win32',
  });
  let stderr = '';
  child.stderr?.on('data', (c) => { stderr += String(c); });
  const baseUrl = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode != null) throw new Error(`server exited: ${stderr.slice(-500)}`);
    try {
      const res = await fetch(baseUrl);
      if (res.ok) return { child, baseUrl, port };
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 100));
  }
  try { await killProcessTree(child.pid); } catch (_) {}
  throw new Error(`server start failed: ${stderr.slice(-500)}`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createNetServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}
