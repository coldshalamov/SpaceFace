// Diagnostic: boot the game, poll mode + opening ledger until flight or timeout.
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { loadPlaywright } from './scripts/lib/load-playwright.mjs';

const { chromium } = await loadPlaywright();
const port = await new Promise((resolve, reject) => {
  const probe = createNetServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});
const server = spawn(process.execPath, ['server.js', String(port)], {
  stdio: 'ignore',
  env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '', SPACEFACE_USER_CONTENT_DIR: '' },
});
const base = `http://127.0.0.1:${port}/`;
for (let i = 0; i < 200; i++) {
  try { const r = await fetch(base); if (r.ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 150));
}
const browser = await chromium.launch({
  headless: false,
  args: [
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--window-size=1600,900',
  ],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
if (process.env.SF_DISABLE_COOK_WIDENING === '1') {
  await page.addInitScript(() => { window.__SF_DISABLE_COOK_WIDENING = true; });
}
const failed = [];
const errors = [];
page.on('requestfailed', (r) => failed.push(r.url()));
page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
try {
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 150000 });
  console.log('[boot] SF up');
  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'BootProbe' }));
  const t0 = Date.now();
  let lastLog = '';
  while (Date.now() - t0 < 300000) {
    const snap = await page.evaluate(() => {
      const s = window.SF && window.SF.state;
      if (!s) return null;
      const d = (window.__SF_WITNESS__ && window.__SF_WITNESS__.latest) || {};
      const ledger = (s.render && s.render.openingCookLedger || []).map((e) => `${e.step}:${e.outcome || 'run'}`).slice(-8);
      return {
        mode: s.mode,
        firstFrame: !!(s.render && s.render.firstPlayableFrameAt),
        simTime: s.simTime,
        ledger,
        preSubmit: s.render && s.render.openingSubmissionPreSubmitValidation,
        shellAdm: !!(s.render && s.render.sectorShellAdmission),
        deferStream: !!(s.render && s.render.deferNoncriticalMeshStreaming),
        vfxFrozen: !!(s.render && s.render.openingVfxFrozen),
        docked: !!(s.ui && s.ui.docked),
        screens: s.ui && s.ui.screenStack && s.ui.screenStack.length,
        exec: d && d.executedFrames,
        req: d && d.requestedFrames,
        frameErr: d && d.frameErrorCount,
        consecErr: d && d.consecutiveFrameErrors,
        lastErr: d && d.lastFrameError,
        stalled: d && d.presentationStalled,
        suspended: d && d.suspended,
        lifecycle: d && d.lifecycle,
        vis: document.visibilityState,
      };
    }).catch(() => null);
    const line = JSON.stringify(snap);
    if (line !== lastLog) {
      console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, line);
      lastLog = line;
    }
    if (snap && snap.mode === 'flight' && snap.firstFrame) {
      console.log('FLIGHT REACHED');
      break;
    }
    await page.waitForTimeout(3000);
  }
  if (failed.length) console.log('FAILED REQUESTS:', failed.slice(0, 15));
  if (errors.length) console.log('PAGE ERRORS:', errors.slice(0, 10));
} finally {
  await browser.close().catch(() => {});
  server.kill();
}
