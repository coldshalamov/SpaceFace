#!/usr/bin/env node
// DEMO-BOOT-1 verification probe: does a deep-sky plate actually PROMOTE (upload + go live)
// on the shipped load path? The readiness screenshots sit too early in the fade to answer.
// Boots once to Swarm, then polls the bounded residencies' stats() for up to ~45 s of flight
// and grabs a late screenshot. Run under the game lock like every game boot:
//   node scripts/fleet/game-lock.mjs run -- node scripts/probe-sky-plate.mjs
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

import {
  assertIsolatedElectronRootUrl,
  createIsolatedElectronLaunch,
} from './lib/electronTestIsolation.mjs';
import {
  createElectronCanonicalUrlTracker,
} from './lib/alphaLiveBaselineElectronContracts.mjs';
import { provisionElectronRuntime } from './lib/electronRuntimeProvisioning.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { installCspSafePlaywrightPolling } from './lib/playwrightCspPolling.mjs';
import { collectPageIssues } from './lib/browser-issues.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
process.env.SPACEFACE_EVIDENCE_PLAYER_WORKER_BUNDLE = '1';

const { _electron: electron } = await loadPlaywright();
provisionElectronRuntime({ root: ROOT });

const port = await new Promise((res, rej) => {
  const srv = net.createServer();
  srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => res(p)); });
  srv.on('error', rej);
});
const isolated = createIsolatedElectronLaunch({ root: ROOT, taskId: 'sky-plate', port });
const app = await electron.launch(isolated.options);
try {
  const page = await app.firstWindow({ timeout: 90_000 });
  installCspSafePlaywrightPolling(page);
  const tracker = createElectronCanonicalUrlTracker(page, { pollIntervalMs: 75, allowAnyLoopbackPort: true });
  assertIsolatedElectronRootUrl(await tracker.waitForCanonicalRoot(10_000));
  const issues = collectPageIssues(page, { ignoreProbeWarnings: true });
  await page.waitForLoadState('domcontentloaded', { timeout: 90_000 }).catch(() => {});
  await page.waitForFunction(() => {
    const timeline = window.__SF_BOOT_TIMELINE__;
    return !!(timeline && timeline.marks && timeline.marks.some((m) => m.name === 'title-interactive'));
  }, null, { timeout: 180_000 });
  console.log('[sky-plate] title up — launching swarm');
  await page.locator('[data-screen="mainMenu"] [data-action="swarm"]').first().click({ timeout: 90_000 });
  await page.waitForFunction(() => {
    const st = window.SF && window.SF.state;
    return !!(st && st.mode === 'flight');
  }, null, { timeout: 120_000 });
  console.log('[sky-plate] in flight — polling residencies');
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < 60_000) {
    last = await page.evaluate(() => {
      const bg = window.SF && window.SF.state && window.SF.state.render && window.SF.state.render.spaceBg;
      const plates = bg && bg.deepSkyPlates;
      const bases = bg && bg.deepSkyBases;
      return {
        simTime: window.SF?.state?.simTime ?? null,
        plates: plates ? { stats: plates.stats(), readyId: plates.readyId, failed: [...plates.failedIds] } : null,
        bases: bases ? { stats: bases.stats(), readyId: bases.readyId, failed: [...bases.failedIds] } : null,
      };
    });
    const p = last.plates && last.plates.stats, b = last.bases && last.bases.stats;
    console.log(`[sky-plate] t+${((Date.now() - t0) / 1000).toFixed(0)}s sim=${last.simTime} plates=${JSON.stringify(p)} bases=${JSON.stringify(b)}`);
    if (typeof last.simTime === 'number' && last.simTime > 20) break;
    await page.waitForTimeout(3000);
  }

  // GPU-level truth: render the LIVE plate texture (whichever path loaded it) to an RT and
  // read back actual texels. PlaneGeometry v=0 = file row 0 for a flipY=false KTX2 upload.
  const texelProbe = await page.evaluate(() => {
    const sf = window.SF || {};
    const THREE = sf.THREE;
    const state = sf.state;
    const bg = state && state.render && state.render.spaceBg;
    const renderer = state && state.render && state.render.renderer;
    const tex = bg && bg.deepSkyPlates && bg.deepSkyPlates.activeTexture;
    if (!THREE || !renderer || !tex) return { error: 'no live plate texture' };
    const meta = {
      isCompressedTexture: !!tex.isCompressedTexture,
      flipY: tex.flipY, format: tex.format,
      image: tex.image ? { w: tex.image.width, h: tex.image.height } : null,
      mipmaps: Array.isArray(tex.mipmaps) ? tex.mipmaps.length : null,
      colorSpace: tex.colorSpace, minFilter: tex.minFilter,
    };
    const N = 64;
    const rt = new THREE.WebGLRenderTarget(N, N, { generateMipmaps: false });
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: tex })));
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam);
    const buf = new Uint8Array(N * N * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, N, N, buf);
    renderer.setRenderTarget(null);
    rt.dispose();
    const band = (y0, y1) => {
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = 0; x < N; x++) {
        const i = (y * N + x) * 4; r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; n++;
      }
      return [r / n, g / n, b / n].map((v) => v.toFixed(1)).join(',');
    };
    return { meta, vLow_band: band(0, 8), vMid_band: band(28, 36), vHigh_band: band(56, 64) };
  });
  console.log('[sky-plate] texel probe:', JSON.stringify(texelProbe));

  mkdirSync(resolve(ROOT, '.devshots/perf'), { recursive: true });
  await page.screenshot({ path: resolve(ROOT, '.devshots/perf/sky-plate-soak.png') });
  const errs = issues.errorIssues().map((i) => i.text).slice(0, 20);
  console.log('[sky-plate] final:', JSON.stringify(last));
  console.log('[sky-plate] page errors:', JSON.stringify(errs));
} finally {
  await app.close().catch(() => {});
  isolated.cleanup({ runtimeClosed: true });
  // Electron teardown can leave live handles (gpu/cache); exit hard so the game lock frees.
  process.exit(0);
}
