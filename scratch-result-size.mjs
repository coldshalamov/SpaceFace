import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './scripts/lib/load-playwright.mjs';
const ROOT = fileURLToPath(new URL('.', import.meta.url));
const { chromium } = await loadPlaywright();
const port = await new Promise((res, rej) => {
  const p = createNetServer(); p.once('error', rej);
  p.listen(0, '127.0.0.1', () => { const port = p.address().port; p.close(() => res(port)); });
});
const server = spawn(process.execPath, ['server.js', String(port)], {
  cwd: ROOT, stdio: 'ignore',
  env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '', SPACEFACE_USER_CONTENT_DIR: '' },
});
let browser = null;
try {
  const base = `http://127.0.0.1:${port}/`;
  const dl = Date.now() + 30_000;
  while (Date.now() < dl) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise(r => setTimeout(r, 150)); }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.addInitScript(() => {
    sessionStorage.setItem('sf.cinematicSeen', '1');
    window.__SPACEFACE_PERF_COUNTERS__ = true;
  });
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 150_000 });
  await page.evaluate(async () => {
    const launch = await import('/src/ui/crucibleLaunch.js');
    const setup = launch.crucibleSetupFor({ seed: 4242 });
    launch.requestCrucibleRun(window.SF.bus, setup.value, setup.ruleset);
  });
  await page.waitForFunction(() => {
    const s = window.SF && window.SF.state;
    return s && s.mode === 'flight' && Number.isFinite(s.render && s.render.firstPlayableFrameAt);
  }, null, { timeout: 180_000 });
  await page.mouse.down();
  await page.waitForTimeout(20000);
  // Size every top-level field the probe's final evaluate returns.
  const sizes = await page.evaluate(() => {
    const state = window.SF.state;
    const measure = (v) => { try { return JSON.stringify(v).length; } catch (e) { return 'THREW ' + String(e && e.message).slice(0, 60); } };
    const snap = state.perfRuntime && state.perfRuntime.getCounterSnapshot
      ? state.perfRuntime.getCounterSnapshot() : null;
    const snapKeys = {};
    if (snap) for (const k of Object.keys(snap)) snapKeys[k] = measure(snap[k]);
    let evMax = null;
    if (snap && Array.isArray(snap.events)) {
      for (const e of snap.events) {
        for (const k of Object.keys(e || {})) {
          const l = typeof e[k] === 'string' ? e[k].length : measure(e[k]);
          if (!evMax || l > evMax.size) evMax = { kind: e.kind, field: k, size: l, head: typeof e[k] === 'string' ? e[k].slice(0, 160) : '' };
        }
      }
    }
    const loopDiag = window.SF.loop && window.SF.loop.getDiagnostics ? window.SF.loop.getDiagnostics() : null;
    const loopKeys = {};
    if (loopDiag) for (const k of Object.keys(loopDiag)) loopKeys[k] = measure(loopDiag[k]);
    return { snapKeys, evMax, loopKeys };
  });
  console.log(JSON.stringify(sizes, null, 1).slice(0, 5000));
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill();
}
