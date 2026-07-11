#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8526;
const BASE = `http://127.0.0.1:${PORT}/`;
const OUT = resolve(ROOT, '.devshots/k0-kestrel/normal-routes.json');
const SLOT = 'k0-old-save-route';

const server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  assert.equal(new URL(page.url()).search, '', 'proof must use the canonical player route without query flags');
  await waitForSf(page);
  await page.evaluate(() => {
    sessionStorage.setItem('sf.cinematicSeen', '1');
    window.SF.bus.emit('game:new', { name: 'K0 Normal Route', seed: 47 });
  });
  const newGame = await waitForPlayerWholeShip(page);
  assert.equal(newGame.isPlayer, true, 'new-game player must carry explicit player identity');

  await page.evaluate((slot) => window.SF.bus.emit('game:save', { slot }), SLOT);
  await page.waitForFunction((slot) => !!localStorage.getItem(`sf.save.${slot}`), SLOT);
  const oldSaveFixture = await page.evaluate(async (slot) => {
    const [{ fnv1a }, { CURRENT_VERSION }] = await Promise.all([
      import('/src/save/checksum.js'),
      import('/src/save/migrations.js'),
    ]);
    const key = `sf.save.${slot}`;
    const envelope = JSON.parse(localStorage.getItem(key));
    envelope.version = CURRENT_VERSION - 1;
    if (envelope.data?.meta) envelope.data.meta.version = CURRENT_VERSION - 1;
    if (envelope.data?.entities?.player) delete envelope.data.entities.player.isPlayer;
    envelope.checksum = fnv1a(JSON.stringify(envelope.data));
    localStorage.setItem(key, JSON.stringify(envelope));
    const index = JSON.parse(localStorage.getItem('sf.save.index') || '{}');
    if (index[slot]) index[slot].version = CURRENT_VERSION - 1;
    localStorage.setItem('sf.save.index', JSON.stringify(index));
    return { fromVersion: CURRENT_VERSION - 1, toVersion: CURRENT_VERSION, removedPlayerMarker: true };
  }, SLOT);

  await page.reload({ waitUntil: 'domcontentloaded' });
  assert.equal(new URL(page.url()).search, '', 'Continue proof must remain on the canonical player route');
  await waitForSf(page);
  const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
  await continueButton.waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')]
      .find((candidate) => candidate.textContent?.trim() === 'Continue');
    return !!button && !button.disabled;
  });
  await continueButton.click();
  const continued = await waitForPlayerWholeShip(page);
  assert.equal(continued.isPlayer, true, 'v7 Continue normalization must restore explicit player identity');

  const context = await page.evaluate(() => {
    const state = window.SF.state;
    const player = state.entityList.find((entity) => entity?.id === state.playerId);
    const beforeMeshUuid = player.mesh.uuid;
    const canvas = state.render.renderer.domElement;
    const gl = state.render.renderer.getContext();
    const extension = gl.getExtension('WEBGL_lose_context');
    if (!extension) return { supported: false, beforeMeshUuid };
    extension.loseContext();
    setTimeout(() => extension.restoreContext(), 350);
    return { supported: true, beforeMeshUuid };
  });
  assert.equal(context.supported, true, 'browser must expose WEBGL_lose_context for deterministic restore proof');
  await page.waitForFunction((beforeMeshUuid) => {
    const state = window.SF?.state;
    const player = state?.entityList?.find((entity) => entity?.id === state.playerId);
    const data = player?.mesh?.userData || {};
    return player?.mesh?.uuid !== beforeMeshUuid
      && data.authoredAssetState === 'authored'
      && data.authoredVisualRoot === 'authored-root'
      && data.authoredReadableFallbackRetained === false
      && Object.values(data.authoredSlots || {}).flat()
        .some((url) => String(url).includes('/wholeships/kestrel.glb'));
  }, context.beforeMeshUuid, { timeout: 90_000 });
  const restored = await page.evaluate(() => {
    const state = window.SF.state;
    const player = state.entityList.find((entity) => entity?.id === state.playerId);
    return {
      mode: state.mode,
      isPlayer: player.isPlayer,
      meshUuid: player.mesh.uuid,
      authoredState: player.mesh.userData.authoredAssetState,
      authoredRoot: player.mesh.userData.authoredVisualRoot,
      fallbackRetained: player.mesh.userData.authoredReadableFallbackRetained,
      wholeShip: Object.values(player.mesh.userData.authoredSlots || {}).flat()
        .some((url) => String(url).includes('/wholeships/kestrel.glb')),
      pixelProof: state.render.renderer.domElement.toDataURL('image/png').length,
    };
  });
  assert.ok(restored.pixelProof > 1000, 'restored renderer must produce a non-empty frame');
  assert.deepEqual(pageErrors, [], `canonical route must remain free of page errors: ${pageErrors.join('; ')}`);

  const report = {
    schema: 'spaceface.k0KestrelNormalRoutes.v1',
    route: BASE,
    newGame,
    oldSaveFixture,
    continued,
    contextRestore: restored,
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log('Kestrel canonical new-game, old-save Continue, and context-restore routes: PASS');
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill();
}

async function waitForPlayerWholeShip(page) {
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    const player = state?.entityList?.find((entity) => entity?.id === state.playerId);
    const data = player?.mesh?.userData || {};
    return state?.mode === 'flight'
      && player?.isPlayer === true
      && data.authoredAssetState === 'authored'
      && data.authoredVisualRoot === 'authored-root'
      && data.authoredReadableFallbackRetained === false
      && Object.values(data.authoredSlots || {}).flat()
        .some((url) => String(url).includes('/wholeships/kestrel.glb'));
  }, null, { timeout: 90_000 });
  return page.evaluate(() => {
    const state = window.SF.state;
    const player = state.entityList.find((entity) => entity?.id === state.playerId);
    return {
      mode: state.mode,
      isPlayer: player.isPlayer,
      authoredState: player.mesh.userData.authoredAssetState,
      authoredRoot: player.mesh.userData.authoredVisualRoot,
      fallbackRetained: player.mesh.userData.authoredReadableFallbackRetained,
      wholeShip: Object.values(player.mesh.userData.authoredSlots || {}).flat()
        .some((url) => String(url).includes('/wholeships/kestrel.glb')),
    };
  });
}

async function waitForSf(page) {
  await page.waitForFunction(() => window.SF?.bus && window.SF?.state, null, { timeout: 20_000 });
}

async function waitForServer() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(BASE);
      if (response.ok) return;
    } catch (_) {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`server did not become ready at ${BASE}`);
}
