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
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise(r => setTimeout(r, 150)); }
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
  await page.waitForTimeout(6000);
  const out = await page.evaluate(() => {
    const snap = window.SF.state.perfRuntime.getCounterSnapshot();
    const big = snap.events.reduce((a, b) => (String(b.subject||'').length > String((a&&a.subject)||'').length ? b : a), null);
    if (!big) return null;
    const subj = String(big.subject || '');
    return {
      len: subj.length,
      head: subj.slice(0, 300),
      tail: subj.slice(-300),
      kind: big.kind,
      // classify: does it look like JSON / base64 / source?
      looksJson: subj.startsWith('{') || subj.startsWith('['),
      sampleMid: subj.slice(subj.length >> 1, (subj.length >> 1) + 200),
    };
  });
  console.log(JSON.stringify(out, null, 1));
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill();
}
