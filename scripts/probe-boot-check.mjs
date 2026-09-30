// Minimal boot check: does the game reach window.SF on a contended host?
// Captures console errors + pageerrors so a real boot break is named, not timed out on.
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = await new Promise((resolve, reject) => {
  const probe = createNetServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const { port: p } = probe.address().port ? probe.address() : probe.address();
    probe.close(() => resolve(typeof p === 'number' ? p : p.port));
  });
});
const server = spawn(process.execPath, ['server.js', String(port)], {
  cwd: ROOT, stdio: 'ignore',
  env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '', SPACEFACE_USER_CONTENT_DIR: '' },
});
const { chromium } = await loadPlaywright();
let browser = null;
const errors = [];
try {
  const baseUrl = `http://127.0.0.1:${port}/`;
  const deadline = Date.now() + 60_000;
  while (true) {
    try { if ((await fetch(baseUrl)).ok) break; } catch { /* not up */ }
    if (Date.now() > deadline) throw new Error('server never answered');
    await new Promise((r) => setTimeout(r, 200));
  }
  browser = await chromium.launch({ headless: true, args: ['--disable-renderer-backgrounding'] });
  const page = await browser.newPage();
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const loc = m.location && m.location();
    errors.push(`[console] ${m.text().slice(0, 200)} @${loc && loc.url ? loc.url.slice(-80) : '?'}:${loc ? loc.lineNumber : '?'}`);
  });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${String(e && e.stack || e).slice(0, 400)}`));
  page.on('requestfailed', (r) => errors.push(`[reqfail] ${r.url().slice(-80)} ${r.failure()?.errorText}`));
  const t0 = Date.now();
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const booted = await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 120_000 })
    .then(() => true).catch(() => false);
  console.log(JSON.stringify({ booted, ms: Date.now() - t0, errors: errors.slice(0, 20) }, null, 1));
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill();
}
process.exit(0);
