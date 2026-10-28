// Minimal worker-lane crash diagnostic: boot ?simLane=worker, capture every console
// message / pageerror / failed request, report what the sim worker actually died on.
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const browserPath = process.env.SF_PROBE_BROWSER
  || ['C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((c) => existsSync(c));
const { chromium } = await loadPlaywright();

const port = await new Promise((res) => {
  const s = createNetServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
});
const child = spawn(process.execPath, ['server.js', String(port)], {
  cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true,
  env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '', SPACEFACE_USER_CONTENT_DIR: '' },
});
const server = { baseUrl: `http://127.0.0.1:${port}/`, close: async () => child.kill() };
for (let i = 0; i < 80; i++) {
  try { if ((await fetch(server.baseUrl)).ok) break; } catch (_) {}
  await new Promise((r) => setTimeout(r, 250));
}
const browser = await chromium.launch({ headless: false, executablePath: browserPath, args: ['--window-size=900,700'] });
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.addInitScript(() => {
    const W = window.Worker;
    window.Worker = function (url, opts) {
      const w = new W(url, opts);
      w.addEventListener('error', (e) => console.log('[WORKER-ERROR-EVENT]', JSON.stringify({
        url: String(url).slice(-80), msg: e.message, file: e.filename, line: e.lineno, col: e.colno, err: String(e.error),
      })));
      w.addEventListener('unhandledrejection', (e) => console.log('[WORKER-REJECT]', String(e.reason).slice(0, 400)));
      w.addEventListener('message', (e) => {
        const d = e && e.data;
        if (d && d.__diagWorkerError) console.log('[WORKER-REAL-ERROR]', JSON.stringify(d.__diagWorkerError).slice(0, 900));
      });
      return w;
    };
  });
  await page.route('**/wholeSimBrowserWorker.js', async (route) => {
    const res = await route.fetch();
    const body = await res.text();
    const PRE = `self.addEventListener('error', (e) => { try { self.postMessage({ __diagWorkerError: { kind: 'error', msg: e.message, file: e.filename, line: e.lineno, stack: String(e.error && e.error.stack || '') } }); } catch (_) {} });
self.addEventListener('unhandledrejection', (e) => { try { self.postMessage({ __diagWorkerError: { kind: 'reject', stack: String(e.reason && e.reason.stack || e.reason) } }); } catch (_) {} });
`;
    await route.fulfill({ response: res, body: PRE + body });
  });
  page.on('console', (m) => console.log(`[console:${m.type()}]`, m.text().slice(0, 500)));
  page.on('pageerror', (e) => console.log('[pageerror]', String((e && e.stack) || e).slice(0, 800)));
  page.on('requestfailed', (r) => console.log('[reqfail]', r.url(), r.failure()?.errorText));
  page.on('response', (r) => { if (r.status() >= 400) console.log('[http', r.status() + ']', r.url()); });
  await page.goto(`${server.baseUrl}?simLane=worker`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  const t0 = Date.now();
  let state = 'booting';
  while (Date.now() - t0 < 45000) {
    state = await page.evaluate(() => {
      const sf = window.SF;
      if (!sf || !sf.state) return 'no-sf';
      return JSON.stringify({ mode: sf.state.mode, lane: sf.simLaneInfo || sf.laneInfo || null, closed: sf.simRunner?.closed || null });
    }).catch(() => 'eval-fail');
    if (state.includes('flight') || state.includes('closed":true')) break;
    await page.waitForTimeout(2000);
  }
  console.log('[diag] final state:', state);
} finally {
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}
