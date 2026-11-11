// Lead look (G18-02b): start a Swarm round, click the canvas, hold Q, photograph, report whether the
// context wheel (#sf-context-wheel) is visible, then aim at the first slice and release Q over it —
// the script prints the aimed action and the fired result read back from game state.
// Run under the lock:
//   node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/context-wheel.mjs [out-prefix]
// Done = the printed wheel line shows "visible":true with a non-zero size, the -held.png shows it,
// and the fired line names the slice the release actually chose.
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
  // Returning-player route: the cinematic title splash shows once per session and is a real
  // aria-modal overlay — left up it swallows the Launch click and the Q hold below.
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });
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
  // Defensive: if the splash still mounted (seed race), dismiss it — any click closes it.
  const splash = page.locator('#cinematic-splash');
  if (await splash.count()) {
    await splash.click({ timeout: 5000 }).catch(() => {});
    await page.waitForSelector('#cinematic-splash', { state: 'detached', timeout: 8000 }).catch(() => {});
    await sleep(400);
  }
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
  // Aim at the first slice: the wedge's own face position is the real on-screen seat — move the
  // pointer there (still holding Q), let the move reach the sim lane and back, then read which
  // wedge the dial marked .is-aimed.
  const aimPt = await page.evaluate(() => {
    const wedge = document.querySelector('#sf-context-wheel .sf-cwheel__wedge');
    const face = wedge && wedge.querySelector('.sf-cwheel__face');
    if (!face) return null;
    const r = face.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, action: wedge.dataset.action };
  });
  let aimed = null;
  if (aimPt) {
    await page.mouse.move(aimPt.x, aimPt.y);
    await sleep(600);
    aimed = await page.evaluate(() => {
      const el = document.querySelector('#sf-context-wheel .sf-cwheel__wedge.is-aimed');
      return el ? el.dataset.action : null;
    });
  }
  console.log('aimed', JSON.stringify({ target: aimPt && aimPt.action, aimed }));
  await page.keyboard.up('q');
  await sleep(500);
  // The released choice is a wheel verb: toggle slices latch on (wheelLatches + the merged hold
  // flag), tap slices mint one edge. Read the authoritative input mirror back from the game.
  const fired = await page.evaluate(() => {
    const s = window.SF && window.SF.state;
    const input = s && s.input;
    return {
      wheelOpen: !!(s && s.ui && s.ui.contextWheelOpen),
      latches: input && input.wheelLatches ? { ...input.wheelLatches } : null,
      brake: input ? !!input.brake : null,
      actions: input ? Object.keys(input.actions || {}).filter((k) => input.actions[k]) : null,
    };
  });
  console.log('fired', JSON.stringify({ action: aimed || (aimPt && aimPt.action) || null, ...fired }));
  await browser.close();
} finally {
  server.kill();
}
