// A/B perf attribution for the space background: rAF p95 with bg on / off / low tier.
// Headed chromium so the real GPU renders (headless = SwiftShader = useless numbers).
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { chromium } from 'playwright';

const ROOT = 'C:/Users/93rob/Documents/GitHub/SpaceFace';

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

const port = await findFreePort(8194);
const child = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: 'ignore' });
const url = `http://127.0.0.1:${port}/`;
for (let i = 0; i < 80; i++) {
  try { const r = await fetch(url); if (r.ok) break; } catch (_) {}
  await new Promise((r) => setTimeout(r, 250));
}

const browser = await chromium.launch({ headless: false, args: ['--window-position=2000,0'] });
const page = await browser.newPage({ viewport: { width: 1830, height: 973 } });
try {
  await page.goto(`${url}?debug=flight`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 20000 });
  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'Perf AB' }));
  await page.waitForFunction(() => window.SF.state.mode === 'flight' && window.SF.state.playerId, null, { timeout: 90000 });
  await page.waitForTimeout(4000); // warmup

  const measure = () => page.evaluate(() => new Promise((resolve) => {
    const samples = [];
    let last = performance.now();
    let n = 0;
    function tick(t) {
      samples.push(t - last); last = t;
      if (++n < 300) requestAnimationFrame(tick);
      else {
        samples.sort((a, b) => a - b);
        resolve({
          p50: samples[(samples.length * 0.5) | 0].toFixed(1),
          p95: samples[(samples.length * 0.95) | 0].toFixed(1),
          mean: (samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(1),
        });
      }
    }
    requestAnimationFrame(tick);
  }));

  const on = await measure();
  await page.evaluate(() => { window.SF.state.render.spaceBg.group.visible = false; });
  await page.waitForTimeout(800);
  const off = await measure();
  await page.evaluate(() => { window.SF.state.render.spaceBg.group.visible = true; window.SF.bg.forceTier('low'); });
  await page.waitForTimeout(1500);
  const low = await measure();
  // default tier again, but hide ONLY the live stars/flares → separates texture-bandwidth
  // cost (the 3 tile quads) from point/instance cost
  await page.evaluate(() => { window.SF.bg.forceTier('default'); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const bg = window.SF.state.render.spaceBg;
    bg.stars.pts.visible = false; bg.flares.mesh.visible = false;
  });
  await page.waitForTimeout(800);
  const noStars = await measure();
  // and the inverse: stars on, tile layers hidden
  await page.evaluate(() => {
    const bg = window.SF.state.render.spaceBg;
    bg.stars.pts.visible = true; bg.flares.mesh.visible = true;
    for (const L of bg.layers) L.mesh.visible = false;
  });
  await page.waitForTimeout(800);
  const noTiles = await measure();
  await page.evaluate(() => {
    const bg = window.SF.state.render.spaceBg;
    for (const L of bg.layers) L.mesh.visible = true;
    window.SF.bg.forceTier('mid');
  });
  await page.waitForTimeout(1500);
  const mid = await measure();
  const stats = await page.evaluate(() => window.SF.bg.stats());
  console.log(JSON.stringify({ bgOn: on, bgOff: off, bgLowTier: low, defaultNoStars: noStars, defaultNoTiles: noTiles, midTier: mid, stats }, null, 1));
} finally {
  await browser.close();
  child.kill();
}
