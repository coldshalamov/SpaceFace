// Lead look (G18-02): start a Swarm round, click the canvas, hold Q, photograph, and report whether the
// context wheel (#sf-context-wheel) is visible. Run under the lock:
//   node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/context-wheel.mjs [out-prefix]
// Done = the printed wheel line shows "visible":true with a non-zero size, and the -held.png shows it.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = 8161;
const out = process.argv[2] || '.devshots/fleet/looks/context-wheel';
import { mkdirSync } from 'node:fs'; mkdirSync('.devshots/fleet/looks', { recursive: true });
const server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: process.cwd(), stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  await sleep(2500);
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 200)));
  await page.goto(`http://127.0.0.1:${PORT}/?swarmRound=3`);
  const t0 = Date.now();
  let mode = '';
  while (Date.now() - t0 < 180_000) {
    mode = await page.evaluate(() => {
      const s = window.SF && (window.SF.state || (window.SF.getState && window.SF.getState()));
      return s ? `${s.mode}|${s.run && s.run.phase}` : 'no-state';
    }).catch(() => 'eval-failed');
    if (/flight\|(active|fight|armory|preparation)/.test(mode)) break;
    await sleep(2000);
  }
  console.log('mode', mode, `${Math.round((Date.now() - t0) / 1000)}s`);
  await page.screenshot({ path: `${out}-before.png` });
  // If the run waits in the armory, launch the round.
  const launch = page.getByText(/Launch round/i).first();
  if (await launch.isVisible().catch(() => false)) { await launch.click(); await sleep(6000); }
  await page.mouse.click(640, 360); await sleep(400);
  await page.keyboard.down('q'); await sleep(200); console.log('after-q', await page.evaluate(() => JSON.stringify({ wheelOpen: window.SF && window.SF.state && window.SF.state.ui && window.SF.state.ui.contextWheelOpen, inDom: !!document.getElementById('sf-context-wheel'), active: document.activeElement && document.activeElement.id, keys: window.SF && window.SF.state && window.SF.state.input && Object.keys(window.SF.state.input.actions || {}).filter((k) => window.SF.state.input.actions[k]).slice(0, 12) })));
  await sleep(900);
  await page.screenshot({ path: `${out}-held.png` });
  const wheel = await page.evaluate(() => {
    const el = document.getElementById('sf-context-wheel');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { cls: el.className.toString().slice(0, 80), visible: r.width > 0 && getComputedStyle(el).display !== 'none', w: r.width, h: r.height, text: el.innerText.slice(0, 300) };
  });
  console.log('wheel', JSON.stringify(wheel));
  await page.keyboard.up('q');
  await browser.close();
} finally {
  server.kill();
}
