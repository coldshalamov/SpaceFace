import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { chromium } from 'playwright';
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

async function findFreePort(start) {
  for (let port = start; port < start + 60; port++) {
    if (await new Promise((resolve) => {
      const s = createNetServer();
      s.once('error', () => resolve(false));
      s.once('listening', () => s.close(() => resolve(true)));
      s.listen(port, '127.0.0.1');
    })) return port;
  }
  throw new Error('no port');
}

async function startServer(port) {
  const child = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: 'pipe' });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  const url = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) throw new Error('server exited\n' + out);
    try { const r = await fetch(url); if (r.ok) return { child, url }; } catch (_) {}
    await new Promise((r) => setTimeout(r, 250));
  }
  child.kill();
  throw new Error('server timeout');
}

async function waitForFlight(page) {
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 15000 });
  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'Bg Capture' }));
  await page.waitForFunction(() => window.SF.state.mode === 'flight' && window.SF.state.playerId && window.SF.state.entities.get(window.SF.state.playerId).mesh, null, { timeout: 90000 });
  try {
    await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some((b) => /begin/i.test(b.textContent || '')), null, { timeout: 3000 });
    await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find((x) => /begin/i.test(x.textContent || '')); if (b) b.click(); });
  } catch (_) {}
  await page.waitForTimeout(1500);
}

async function capture(name, page, opts = {}) {
  const shotDir = join(ROOT, '.devshots', 'spaceBackground');
  await mkdir(shotDir, { recursive: true });
  if (opts.eval) {
    const out = await page.evaluate((fnText) => {
      try {
        const fn = eval('(' + fnText + ')');
        fn();
        const bg = window.SF && window.SF.bg;
        return { ok: true, palette: bg && bg.currentPaletteName, stats: bg && bg.stats() };
      } catch (e) {
        return { ok: false, error: e.message, stack: e.stack };
      }
    }, String(opts.eval));
    console.log(name, JSON.stringify(out));
  }
  // headless rAF is throttled; force a few renders so the canvas reflects the eval changes
  await page.evaluate(() => {
    const r = window.SF && window.SF.state && window.SF.state.render;
    if (r && r.drawPreparedFrame) {
      for (let i = 0; i < 4; i++) r.drawPreparedFrame();
    }
  });
  await page.waitForTimeout(opts.wait || 500);
  const path = join(shotDir, name + '.png');
  await page.screenshot({ path, fullPage: false });
  console.log('saved', path);
}

const port = await findFreePort(8124);
const server = await startServer(port);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1830, height: 973 } });
try {
  await page.goto(`${server.url}?debug=flight`, { waitUntil: 'domcontentloaded' });
  await waitForFlight(page);

  // headless Chromium is SwiftShader → the game auto-picks the low tier. Force the
  // default tier so these art shots show what players on real GPUs will see.
  await capture('00-tier-forced', page, { eval: () => { if (window.SF && window.SF.bg) window.SF.bg.forceTier('default'); }, wait: 1200 });

  // wide default palette
  await capture('01-wide-default', page, { wait: 1000 });

  // alternate palette
  await capture('02-palette-ion', page, { eval: () => { if (window.SF && window.SF.bg) window.SF.bg.setPalette('ION'); }, wait: 1500 });

  // different seed → different sky (player teleports get reset by the sim, so seed
  // variation is how we sample other regions of the aesthetic space)
  await capture('03-seed-var', page, { eval: () => { if (window.SF && window.SF.bg) window.SF.bg.rebake(48151623); }, wait: 1500 });

  // Hero close-ups: reposition the hero in PARALLAX-SCALED bg space so it lands at the
  // view center (the tilted camera looks ~350wu ahead of its own x/z). Direct background
  // manipulation — the sim resets player teleports, so we move the scenery instead.
  await capture('04-wormhole', page, { eval: () => {
    const bg = window.SF.state.render.spaceBg;
    const cam = bg.camera.position;
    const bx = cam.x * 0.10, bz = cam.z * 0.10 + 170;
    if (bg.wormhole) { bg.wormhole.spec.bx = bx; bg.wormhole.spec.bz = bz; }
    else bg._spawnWormhole({ kind: 'wormhole', bx, bz, frac: 0.16 });
  }, wait: 1200 });

  await capture('05-planet-gas', page, { eval: () => {
    const bg = window.SF.state.render.spaceBg;
    const cam = bg.camera.position;
    bg._spawnPlanet({ kind: 'planet', bx: cam.x * 0.055 - 8, bz: cam.z * 0.055 + 170, type: 'gas', frac: 0.30, seed: 4242, lightAngle: 5.6, ring: true, ringTilt: 0.35 });
  }, wait: 1200 });

  await capture('06-planet-rocky', page, { eval: () => {
    const bg = window.SF.state.render.spaceBg;
    const cam = bg.camera.position;
    for (const p of bg.planets) { bg.group.remove(p.sprite); p.sprite.material.dispose(); }
    bg.planets = [];
    bg._spawnPlanet({ kind: 'planet', bx: cam.x * 0.055 + 10, bz: cam.z * 0.055 + 170, type: 'rocky', frac: 0.24, seed: 777, lightAngle: 2.4, ring: false, ringTilt: 0 });
  }, wait: 1200 });

  // per-sector skies: the handler matches palette class by nebulaTint value, so a
  // synthetic sector object is enough to drive it (state.world.sectors is lazily built)
  await capture('07-sector-fringe', page, { eval: () => {
    window.SF.state.render.spaceBg.onSectorEnter({ id: 'capture_fringe', palette: { nebulaTint: 0x8a1e1e } });
  }, wait: 1500 });

  await capture('08-sector-anomaly', page, { eval: () => {
    window.SF.state.render.spaceBg.onSectorEnter({ id: 'capture_anomaly', palette: { nebulaTint: 0x5a1e8a } });
  }, wait: 1500 });

} finally {
  await browser.close();
  server.child.kill();
}
