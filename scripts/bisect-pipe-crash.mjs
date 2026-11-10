// Minimal bisect for the PipeTransport overflow: boot the crucible route step by step and
// print markers so we can see which phase emits the >512MB protocol message.
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const port = await new Promise((resolve, reject) => {
  const probe = createNetServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const { port: p } = probe.address();
    probe.close(() => resolve(p));
  });
});
const server = spawn(process.execPath, ['server.js', String(port)], {
  cwd: ROOT,
  stdio: 'ignore',
  env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '', SPACEFACE_USER_CONTENT_DIR: '' },
});
const mark = (s) => console.log(`[${(Date.now() - t0) / 1000}s] ${s}`);
const t0 = Date.now();
let browser = null;
try {
  const baseUrl = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(baseUrl); if (r.ok) break; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  mark('server up');
  browser = await chromium.launch({
    headless: false,
    args: ['--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--window-size=1600,900'],
  });
  mark('browser up');
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (err) => mark(`PAGEERROR ${String(err && err.message || err).slice(0, 300)}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') mark(`CONSOLE ${String(msg.text()).slice(0, 200)}`);
  });
  await page.addInitScript(() => { window.__SPACEFACE_PERF_COUNTERS__ = true; });
  mark('goto...');
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  mark('dom loaded');
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 150_000 });
  mark('SF booted');
  const launched = await page.evaluate(async () => {
    const launch = await import('/src/ui/crucibleLaunch.js');
    const setup = launch.crucibleSetupFor({ seed: 4242 });
    if (!setup || !setup.ok) return false;
    return launch.requestCrucibleRun(window.SF.bus, setup.value, setup.ruleset) !== false;
  });
  mark(`crucible launched=${launched}`);
  const poller = setInterval(async () => {
    try {
      const info = await page.evaluate(() => {
        const s = window.SF && window.SF.state;
        const r = s && s.render || {};
        return {
          mode: s && s.mode,
          simTime: s && s.simTime,
          queue: r.meshBuildQueueLength,
          pending: typeof r.pendingPipelineAdmissions === 'function' ? r.pendingPipelineAdmissions() : r.pendingPipelineCount,
          catalog: r.rosterCatalogProgress
            ? `${r.rosterCatalogProgress.loaded}/${r.rosterCatalogProgress.total}h${r.rosterCatalogProgress.holders}c${r.rosterCatalogProgress.compiles}`
            : null,
          ledger: (r.openingCookLedger || []).map((e) => `${e.step}:${e.outcome}`).join(' '),
        };
      }).catch((e) => ({ err: String(e && e.message || e).slice(0, 120) }));
      mark(`poll ${JSON.stringify(info)}`);
    } catch { /* page gone */ }
  }, 10_000);
  try {
    await page.waitForFunction(() => {
      const state = window.SF && window.SF.state;
      return state && state.mode === 'flight'
        && Number.isFinite(state.render && state.render.firstPlayableFrameAt);
    }, null, { timeout: 180_000 });
    mark('flight reached');
  } finally {
    clearInterval(poller);
  }
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill();
}
