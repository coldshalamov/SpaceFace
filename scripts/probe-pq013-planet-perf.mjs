#!/usr/bin/env node
// PQ-013 live-scene frame evidence: rAF p50/p95/p99 + draw calls + JS-heap delta at the REAL
// planet (full sim + registration + bands + sheath), for the three heaviest framings:
// approach / skim(+collector) / reentry(plasma). Headed for real GPU. Complements the spike
// (which measured the throwaway scene) with the shipped vertical.
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'pq013-planet');
await mkdir(OUT, { recursive: true });
const executablePath = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((c) => existsSync(c));
if (!executablePath) throw new Error('Chrome required');

const ownedServer = await acquireVisualProbeServer({ explicitUrl: process.env.SF_PROBE_URL || '', root: ROOT });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: false, executablePath,
  args: ['--ignore-gpu-blocklist', '--enable-webgl', '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion', '--window-size=1440,1020'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
try {
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });
  await page.goto(ownedServer.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.SF?.state && window.SF?.bus), null, { timeout: 30_000 });
  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'PQ013 Perf', seed: 47 }));
  await page.waitForFunction(() => window.SF?.state?.mode === 'flight' && window.SF.state.entities.get(window.SF.state.playerId)?.mesh, null, { timeout: 90_000 });
  await page.waitForTimeout(800);

  await page.evaluate(async () => {
    const SF = window.SF, state = SF.state, THREE = SF.THREE;
    const { PLANET_SITE } = await import('/src/data/planets.js');
    const { ZONE_TETHYS_ANVIL } = await import('/src/data/authoredPlaces.js');
    const { sectorLocalToGlobalForSector } = await import('/src/data/sectorCoordinates.js');
    const centre = sectorLocalToGlobalForSector(ZONE_TETHYS_ANVIL.center, PLANET_SITE.sectorId);
    const dir = new THREE.Vector3();
    state.render.camera.getWorldDirection(dir);
    const l = Math.hypot(dir.x, dir.z) || 1;
    window.__pp = { centre, up: { x: dir.x / l, z: dir.z / l } };
  });

  async function place(r, tangential) {
    await page.evaluate(({ r, tangential }) => {
      const SF = window.SF, state = SF.state;
      const { centre, up } = window.__pp;
      const p = state.entities.get(state.playerId);
      p.pos.x = centre.x - up.x * r;
      p.pos.z = centre.z - up.z * r;
      const tX = -up.z, tZ = up.x;
      p.vel.x = tX * tangential; p.vel.z = tZ * tangential;
      p.rot = tangential > 0 ? Math.atan2(p.vel.z, p.vel.x) : Math.atan2(up.z, up.x);
    }, { r, tangential });
  }

  async function sample(ms, label) {
    const r = await page.evaluate(async (ms) => {
      const diag = window.__THREE_GAME_DIAGNOSTICS__;
      const mem0 = performance.memory ? performance.memory.usedJSHeapSize : 0;
      const deltas = [];
      const calls = [];
      let last = performance.now();
      await new Promise((resolve) => {
        function s(now) {
          deltas.push(now - last); last = now;
          if (diag && diag.info) calls.push(diag.info.calls | 0);
          if (now - t0 > ms) return resolve();
          requestAnimationFrame(s);
        }
        const t0 = performance.now();
        requestAnimationFrame((n) => { last = n; requestAnimationFrame(s); });
      });
      const mem1 = performance.memory ? performance.memory.usedJSHeapSize : 0;
      deltas.sort((a, b) => a - b);
      const q = (p) => deltas[Math.min(deltas.length - 1, Math.floor(p * deltas.length))];
      return {
        n: deltas.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: deltas[deltas.length - 1],
        hitches32: deltas.filter((d) => d > 32).length,
        drawCallsMax: calls.length ? Math.max(...calls) : 0,
        heapDeltaMB: (mem1 - mem0) / 1048576,
      };
    }, ms);
    console.log(`[pq013-perf] ${label}: n=${r.n} p50=${r.p50.toFixed(2)} p95=${r.p95.toFixed(2)} p99=${r.p99.toFixed(2)} max=${r.max.toFixed(1)} hitches>32=${r.hitches32} calls=${r.drawCallsMax} heapDelta=${r.heapDeltaMB.toFixed(1)}MB`);
    return r;
  }

  await place(2600, 0);
  await page.waitForFunction(() => window.SF.state.planet && window.SF.state.planet.active, null, { timeout: 30000 });
  await page.waitForTimeout(2500); // registration + bake + settle
  const out = { capturedAt: new Date().toISOString(), samples: {} };
  out.samples.approach = await sample(6000, 'approach (2600, planet on horizon)');
  await place(950, 52);
  await page.evaluate(() => { window.SF.state.input.actions.toggleSkimCollector = true; });
  await page.waitForTimeout(800);
  out.samples.skim = await sample(6000, 'skim (950, collector on, bands + thin sheath)');
  await place(830, 40);
  await page.waitForFunction(() => {
    const p = window.SF.state.planet.player;
    return p.stage === 'commit' || p.stage === 'breakup';
  }, null, { timeout: 20000 });
  out.samples.reentry = await sample(6000, 'reentry (830, plasma sheath, burn routing)');
  await writeFile(path.join(OUT, 'live-perf-report.json'), JSON.stringify(out, null, 2));
  console.log('PQ013_LIVE_PERF_OK');
} finally {
  await browser.close();
  if (ownedServer && typeof ownedServer.close === 'function') await ownedServer.close();
}
