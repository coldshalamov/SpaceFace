#!/usr/bin/env node
// Inspect the actual first-sector player route without changing gameplay or the shared save store.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const { createGameServer } = require('./lib/gameServer.cjs');
const browserPath = [
  process.env.SF_BROWSER_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean).find((path) => existsSync(path));
const server = createGameServer({ root: ROOT });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  executablePath: browserPath || undefined,
  args: ['--ignore-gpu-blocklist', '--enable-webgl', '--disable-background-timer-throttling'],
});

async function clickButton(page, label) {
  return page.evaluate((wanted) => {
    const buttons = [...document.querySelectorAll('button')].filter((button) =>
      button.getClientRects().length && !button.disabled
      && getComputedStyle(button).visibility !== 'hidden');
    const match = buttons.find((button) => button.textContent.trim() === wanted)
      || buttons.find((button) => button.textContent.includes(wanted));
    if (!match) return false;
    match.click();
    return true;
  }, label);
}

async function snapshot() {
  const sf = window.SF;
  const state = sf?.state;
  const renderer = sf?.registry?.get?.('render') || state?.render?.system;
  const player = state?.entities?.get(state.playerId);
  const ships = (state?.entityList || [])
    .filter((entity) => entity?.type === 'ship' && entity.alive !== false)
    .map((entity) => {
      const root = entity.mesh || entity.view?.root || null;
      let meshes = 0;
      let presented = 0;
      let boxMeshes = 0;
      root?.traverse((part) => {
        if (!part.isMesh) return;
        meshes++;
        let visible = true;
        for (let node = part; node; node = node.parent) {
          if (node.visible === false) { visible = false; break; }
          if (node === root) break;
        }
        if (visible && part.geometry && part.material) presented++;
        if (visible && part.geometry?.type === 'BoxGeometry') boxMeshes++;
      });
      const distance = player?.pos && entity.pos
        ? Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z)
        : null;
      return {
        id: entity.id,
        player: entity.id === state.playerId,
        defId: entity.data?.defId,
        hostile: entity.team === 1,
        role: entity.data?.lootTableId || entity.data?.trafficRole || null,
        tier: entity.activity?.presentationTier || null,
        distance: distance == null ? null : Math.round(distance),
        assetState: root?.userData?.authoredAssetState || 'missing-mesh',
        visualRoot: root?.userData?.authoredVisualRoot || null,
        requestedAt: root?.userData?.authoredUpgradeRequestedAt || null,
        promised: !!root?.userData?.authoredUpgradePromise,
        mounted: !!root?.parent,
        rootVisible: root?.visible ?? null,
        meshes,
        presented,
        boxMeshes,
      };
    })
    .filter((row) => row.player || row.distance == null || row.distance < 500)
    .sort((a, b) => Number(b.player) - Number(a.player) || a.distance - b.distance);
  const stations = (state?.entityList || []).filter((entity) => entity?.type === 'station')
    .map((entity) => ({
      id: entity.id,
      distance: Math.round(Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z)),
      state: entity.mesh?.userData?.authoredAssetState || 'missing-mesh',
      phase: entity.mesh?.userData?.authoredPreparePhase || null,
      visible: entity.mesh?.visible ?? null,
    })).filter((row) => row.distance < 2000);
  const upgradeQueue = renderer?.scene
    ? (await import('/src/render/partsLibrary.js')).describeAuthoredUpgradeQueue(renderer.scene)
    : null;
  const diagnostics = renderer?.scene?.userData?.authoredUpgradeDiagnostics;
  return {
    mode: state?.mode,
    tick: state?.tick,
    simTime: state?.simTime,
    rendererFrame: state?.render?.frame,
    playerPos: player?.pos && { x: Math.round(player.pos.x), z: Math.round(player.pos.z) },
    playerVel: player?.vel && { x: Math.round(player.vel.x), z: Math.round(player.vel.z) },
    cameraPos: state?.render?.camera?.position && {
      x: Math.round(state.render.camera.position.x),
      z: Math.round(state.render.camera.position.z),
    },
    frameError: state?.render?.lastFrameError || null,
    deferMeshStreaming: state?.render?.deferNoncriticalMeshStreaming,
    firstPlayableFrameAt: state?.render?.firstPlayableFrameAt,
    sectorShellAdmission: state?.render?.sectorShellAdmission,
    meshQueue: renderer?._meshBuildQueue?.length,
    meshQueueHead: renderer?._meshBuildQueueHead,
    upgradeQueue,
    upgradeDiagnostics: diagnostics && {
      activeJobs: diagnostics.activeJobs,
      jobs: diagnostics.jobs?.slice(-10).map(({ key, status, durationMs, startedAtMs, endedAtMs }) =>
        ({ key, status, durationMs, startedAtMs, endedAtMs })),
      partLoads: diagnostics.partLoads?.slice(-4).map(({ url, durationMs }) => ({ url, durationMs })),
    },
    residency: state?.render?.assetResidencyDiagnostics || null,
    onGlassPending: state?.render?.onGlassPending || null,
    playerHull: player?.hull,
    input: state?.input && { thrust: state.input.thrust, axes: state.input.axes },
    inputBlocked: state?.input?.blocked,
    screenStack: state?.ui?.screenStack?.map?.((screen) => screen?.id || screen) || [],
    focusedElement: document.activeElement?.tagName || null,
    bodyClasses: document.body.className,
    ships,
    stations,
  };
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/?debug=flight`, {
    waitUntil: 'commit', timeout: 120000,
  });
  await page.waitForFunction(() => window.SF?.state && window.SF?.bus, null, { timeout: 150000 });
  await page.waitForFunction(() => [...document.querySelectorAll('button')]
    .some((button) => button.textContent.includes('New Game')), null, { timeout: 60000 });
  if (!(await clickButton(page, 'New Game'))) throw new Error('New Game button unavailable');
  await page.waitForTimeout(400);
  if (!(await clickButton(page, 'Launch'))) throw new Error('Launch button unavailable');
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    return state?.mode === 'flight' && !!state.entities?.get(state.playerId)
      && !document.body.classList.contains('ui-modal-open')
      && !document.body.classList.contains('ui-live-screen');
  }, null, { timeout: 180000 });
  await page.evaluate(() => document.activeElement?.blur());
  const fly = process.argv.includes('--fly');
  for (const seconds of (fly ? (process.argv.includes('--short') ? [0, 4, 8] : [0, 4, 8, 15, 30]) : [0, 15, 45, 75])) {
    if (seconds === 4 && fly) {
      await page.mouse.move(720, 450);
      await page.mouse.click(720, 450);
      await page.keyboard.down('KeyW');
      await page.waitForTimeout(500);
      console.log(JSON.stringify({ control: await page.evaluate(() => ({
        focusedElement: document.activeElement?.tagName,
        bodyClasses: document.body.className,
        heldW: window.SF?.registry?.get?.('input')?._keys?.KeyW,
        playerX: window.SF?.state?.entities?.get(window.SF?.state?.playerId)?.pos?.x,
        playerVx: window.SF?.state?.entities?.get(window.SF?.state?.playerId)?.vel?.x,
        inputBlocked: window.SF?.state?.input?.blocked,
        screenStack: window.SF?.state?.ui?.screenStack?.map?.((screen) => screen?.id || screen) || [],
      })) }));
      await page.waitForTimeout(3500);
      await page.keyboard.up('KeyW');
    } else if (seconds > 0) {
      const previous = fly ? ({ 4: 4, 8: 4, 15: 8, 30: 15 })[seconds]
        : ({ 15: 0, 45: 15, 75: 45 })[seconds];
      await page.waitForTimeout((seconds - previous) * 1000);
    }
    console.log(JSON.stringify({ seconds, ...await page.evaluate(snapshot) }));
  }
  if (errors.length) console.log(JSON.stringify({ pageErrors: errors }));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
