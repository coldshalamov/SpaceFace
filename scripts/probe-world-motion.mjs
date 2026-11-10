#!/usr/bin/env node
// Direct Electron motion reproduction, including the transforms used by real draw calls.
// Historical source overlays use the same isolated shell; no checkout or player save is changed.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import playerStore from './lib/playerSaveStore.cjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { createIsolatedElectronLaunch, assertIsolatedElectronRootUrl } from './lib/electronTestIsolation.mjs';
import { installCspSafePlaywrightPolling } from './lib/playwrightCspPolling.mjs';
import {
  createElectronCanonicalUrlTracker, createElectronProcessMonitor, closeOwnedElectronRuntime,
} from './lib/alphaLiveBaselineElectronContracts.mjs';
import {
  installWorldMotionObserver, readWorldMotionObserver, disposeWorldMotionObserver,
} from './lib/worldMotionObserver.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const option = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const tag = option('tag') || 'current';
if (!/^[a-zA-Z0-9_-]{1,80}$/.test(tag)) throw new Error('Invalid output tag');
const seconds = Math.max(20, Math.min(600, Number(option('seconds') || 90)));
const overlay = option('overlay');
const lane = option('lane');
const profilePath = option('profile');
const continueDir = option('continue');
const holdTether = process.argv.includes('--hold-tether');
// Keep diagnostics off the desktop unless visibility is explicitly requested.
const hidden = !process.argv.includes('--visible');
const out = path.join(ROOT, '.devshots', 'world-motion', tag);
await fs.mkdir(out, { recursive: true });
const log = (message) => console.log(`[${new Date().toISOString()}] ${message}`);
let app, page, launch, childProcess, canonicalUrlTracker, processMonitor, rootUrl;
let raw, failure, cleanup;
const errors = [], phases = [];
try {
  const { _electron } = await loadPlaywright();
  launch = createIsolatedElectronLaunch({ root: ROOT, taskId: 'world-motion', timeout: 180000,
    baseEnv: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '',
      SPACEFACE_EVIDENCE_ALLOW_BACKGROUND_EXECUTION: hidden ? '1' : '0',
      SPACEFACE_EVIDENCE_HIDE_WINDOW: hidden ? '1' : '0',
      SPACEFACE_BASELINE_SOURCE_MANIFEST: overlay ? path.resolve(ROOT, overlay) : '',
      ...(lane ? { SPACEFACE_SIM_LANE: lane } : {}),
    },
  });
  log(`launch ${tag}`);
  app = await _electron.launch(launch.options);
  childProcess = app.process();
  if (hidden) os.setPriority(childProcess.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
  processMonitor = createElectronProcessMonitor({ electronApp: app, childProcess });
  page = await app.firstWindow({ timeout: 180000 });
  if (!hidden) await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.show(); win.setFullScreen(true); win.focus(); win.webContents.focus();
  });
  installCspSafePlaywrightPolling(page);
  canonicalUrlTracker = createElectronCanonicalUrlTracker(page, {
    bootstrapTimeoutMs: 10000, pollIntervalMs: 75, allowAnyLoopbackPort: true,
  });
  rootUrl = assertIsolatedElectronRootUrl(await canonicalUrlTracker.waitForCanonicalRoot(20000));
  page.on('pageerror', (error) => errors.push(String(error.stack || error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const pairs = continueDir ? Object.fromEntries(Object.entries(
    playerStore.readPlayerStoreKeysSync(path.resolve(ROOT, continueDir)),
  ).filter(([key]) => key.startsWith('sf.save.') || key === 'sf.settings.profile.v1')) : {};
  if (continueDir && !pairs['sf.save.index']) throw new Error('Continue requires an indexed cloned save folder');
  if (profilePath) pairs['sf.settings.profile.v1'] = await fs.readFile(path.resolve(ROOT, profilePath), 'utf8');
  await page.addInitScript((values) => {
    for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
    sessionStorage.setItem('sf.cinematicSeen', '1');
  }, pairs);
  await page.waitForLoadState('domcontentloaded', { timeout: 180000 });
  await page.waitForFunction(() => window.SF?.state && window.SF?.bus, null, { timeout: 90000 });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 });
  if (!hidden) await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.show(); win.setFullScreen(true); win.focus(); win.webContents.focus();
  });
  await page.waitForFunction(() => window.SF?.state, null, { timeout: 90000 });
  const skip = page.getByRole('button', { name: /^(Skip|Skip cinematic)$/i }).first();
  if (await skip.isVisible().catch(() => false)) await skip.click();
  if (continueDir) await page.getByRole('button', { name: 'Continue', exact: true }).click({ timeout: 60000 });
  else {
    await page.getByRole('button', { name: 'New Game', exact: true }).click({ timeout: 60000 });
    await page.locator('#sf-ng-seed').fill('47', { timeout: 30000 });
    await page.getByRole('button', { name: /^Launch$/ }).click({ timeout: 30000 });
  }
  log('waiting for the real flight picture');
  const flightDeadline = Date.now() + 180000;
  let flightReady = false;
  while (Date.now() < flightDeadline) {
    const phase = await page.evaluate(() => {
      const sf = window.SF, s = sf?.state;
      return { mode: s?.mode, scale: s?.timeScale, mesh: !!s?.entities?.get(s.playerId)?.mesh,
        failed: /SAVE\/LOAD FAILED/.test(document.body.innerText),
        failures: sf?.eventTrace?.events?.slice(-30).map(e => ({ type: e.type || e.name || e.event,
          error: String(e.payload?.error?.message || e.payload?.error || e.payload?.message || '') })).filter(e => e.error) };
    });
    if (phase.mode === 'flight' && phase.scale > 0 && phase.mesh) { flightReady = true; break; }
    if (phase.failed) throw new Error('Public launch failed: ' + JSON.stringify(phase));
    await page.waitForTimeout(250);
  }
  if (!flightReady) throw new Error('Flight initialization did not complete');
  await page.locator('#gl-canvas').click({ timeout: 10000 });
  if (!hidden) await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.focus(); win.webContents.focus();
  });
  const authority = await page.evaluate(() => typeof window.SF?.simLaneDiag === 'function' ? 'worker' : 'main');
  log('actual simulation authority: ' + authority);
  if (!lane && authority !== 'main') throw new Error('The default route did not select the single-authority runtime');
  await installWorldMotionObserver(page, { maxSamples: 20000 });
  if (process.argv.includes('--worker-profile')) {
    const profileTarget = await app.evaluate(async ({ BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows()[0].webContents;
      if (contents.debugger.isAttached()) throw new Error('The isolated debugger is already owned');
      contents.debugger.attach('1.3');
      const { targetInfos } = await contents.debugger.sendCommand('Target.getTargets');
      const target = targetInfos.find((item) => item.type === 'worker' && /wholeSimBrowserWorker/.test(item.url));
      if (!target) { contents.debugger.detach(); throw new Error('No authoritative simulation worker target'); }
      const { sessionId } = await contents.debugger.sendCommand('Target.attachToTarget', { targetId: target.targetId, flatten: true });
      globalThis.__SF_MOTION_PROFILE__ = { contents, sessionId };
      await contents.debugger.sendCommand('Profiler.enable', {}, sessionId);
      await contents.debugger.sendCommand('Profiler.setSamplingInterval', { interval: 1000 }, sessionId);
      await contents.debugger.sendCommand('Profiler.start', {}, sessionId);
      return target.url;
    });
    log(`profiling authoritative worker ${profileTarget}`);
  }
  const started = Date.now();
  let stage = 0;
  await page.keyboard.down('KeyW');
  log('recording actual draw transforms during public flight controls');
  while (Date.now() - started < seconds * 1000) {
    const elapsed = Date.now() - started;
    if (stage === 0 && elapsed >= 5000) {
      await page.keyboard.press('ControlLeft+Space');
      phases.push({ elapsed, action: 'nearest-latch' }); stage++;
    } else if (stage === 1 && elapsed >= 10000) {
      await page.keyboard.down('KeyA'); await page.keyboard.down('BracketLeft');
      phases.push({ elapsed, action: 'turn-and-reel' }); stage++;
    } else if (stage === 2 && elapsed >= 35000) {
      await page.keyboard.up('KeyA'); await page.keyboard.up('BracketLeft');
      phases.push({ elapsed, action: 'straight-tow' }); stage++;
    } else if (stage === 3 && elapsed >= 40000) {
      if (!holdTether) await page.keyboard.press('Space');
      phases.push({ elapsed, action: holdTether ? 'continue-tow' : 'cut' }); stage++;
    } else if (stage === 4 && elapsed >= 45000) {
      if (!holdTether) await page.keyboard.press('F5');
      phases.push({ elapsed, action: holdTether ? 'continue-powered-tow' : 'quicksave' }); stage++;
    } else if (stage === 5 && elapsed >= 60000) {
      if (!holdTether) await page.keyboard.up('KeyW');
      phases.push({ elapsed, action: holdTether ? 'powered-tow' : 'coast' }); stage++;
    }
    await page.waitForTimeout(250);
  }
  raw = await readWorldMotionObserver(page);
  await fs.writeFile(path.join(out, 'draw-motion.json'), JSON.stringify(raw));
  if (process.argv.includes('--worker-profile')) {
    const profile = await app.evaluate(async () => {
      const { contents, sessionId } = globalThis.__SF_MOTION_PROFILE__;
      const { profile } = await contents.debugger.sendCommand('Profiler.stop', {}, sessionId);
      await contents.debugger.sendCommand('Target.detachFromTarget', { sessionId });
      contents.debugger.detach();
      delete globalThis.__SF_MOTION_PROFILE__;
      return profile;
    });
    await fs.writeFile(path.join(out, 'simulation-worker.cpuprofile'), JSON.stringify(profile));
  }
  await disposeWorldMotionObserver(page);
  await fs.writeFile(path.join(out, 'draw-motion.json'), JSON.stringify(raw));
  if (!Array.isArray(raw?.draw) || raw.draw.length < 60) {
    await page.screenshot({ path: path.join(out, 'missing-draw.png') });
    const scene = await page.evaluate(() => {
      const sf = window.SF, s = sf?.state, render = sf?.registry?.get?.('render');
      const player = s?.entities?.get(s.playerId);
      const root = player?.mesh;
      const ancestors = []; for (let n = root; n && ancestors.length < 12; n = n.parent) {
        ancestors.push({ name: n.name, type: n.type, visible: n.visible, uuid: n.uuid });
      }
      return { mode: s?.mode, timeScale: s?.timeScale, player: player && {
        type: player.type, name: player.name, defId: player.defId, dataShipId: player.data?.shipId,
      }, ancestors, scene: { uuid: render?.scene?.uuid, type: render?.scene?.type },
      camera: { layers: render?.camera?.layers?.mask, stateLayers: s?.render?.camera?.layers?.mask },
      renderer: render?.renderer?.info?.render, pipeline: s?.render?.pipelineState,
      canvas: { width: document.querySelector('#gl-canvas')?.width, height: document.querySelector('#gl-canvas')?.height } };
    });
    await fs.writeFile(path.join(out, 'missing-draw-scene.json'), JSON.stringify(scene, null, 2));
    throw new Error('The observer did not see enough real ship draws; this run cannot assess world motion');
  }
  log(`real draw samples=${raw.draw.length}, frame samples=${raw.raf?.length}`);
} catch (error) {
  failure = String(error.stack || error);
  log(failure);
} finally {
  if (page && !page.isClosed()) {
    await page.keyboard.up('KeyW').catch(() => {});
    await page.keyboard.up('KeyA').catch(() => {});
    await page.keyboard.up('BracketLeft').catch(() => {});
    await disposeWorldMotionObserver(page).catch(() => {});
  }
  if (app) cleanup = await closeOwnedElectronRuntime({ page, electronApp: app, childProcess,
    canonicalUrlTracker, processMonitor, rootUrl }).catch((error) => ({ pass: false, error: String(error) }));
  if (launch && cleanup?.processCloseConfirmed) launch.cleanup({ runtimeClosed: true });
}
const result = { tag, seconds, overlay: overlay || null, continueDir: continueDir || null, lane: lane || 'default',
  phases, stats: raw?.stats || null, error: failure || null, pageErrors: errors.slice(0, 40), cleanup };
await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ tag, phases, stats: result.stats, error: result.error,
  pageErrors: result.pageErrors, cleanupPass: cleanup?.pass }, null, 2));
if (failure || !cleanup?.pass) process.exitCode = 1;
