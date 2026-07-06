// One-shot probe: inspect sector state + onSectorEnter behavior in the live game.
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
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

const port = await findFreePort(8300);
const child = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: 'ignore' });
const url = `http://127.0.0.1:${port}/`;
for (let i = 0; i < 80; i++) {
  try { const r = await fetch(url); if (r.ok) break; } catch (_) {}
  await new Promise((r) => setTimeout(r, 250));
}
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
try {
  await page.goto(`${url}?debug=flight`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 20000 });
  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'Probe' }));
  await page.waitForFunction(() => window.SF.state.mode === 'flight' && window.SF.state.playerId, null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  const out = await page.evaluate(() => {
    const sf = window.SF;
    const bg = sf.state.render.spaceBg;
    const world = sf.state.world || {};
    const sectors = world.sectors;
    const vals = sectors ? Object.values(sectors) : [];
    const sample = vals[0];
    const fringe = vals.find((x) => x.palette && x.palette.nebulaTint === 0x8a1e1e);
    let applied = null;
    let err = null;
    try {
      if (fringe) { bg.onSectorEnter(fringe); applied = { palette: bg.currentPaletteName, skySeed: bg.skySeed, sectorId: bg._sectorId }; }
    } catch (e) { err = e.message + '\n' + (e.stack || '').slice(0, 300); }
    return {
      sectorsType: typeof sectors,
      count: vals.length,
      keys: sectors ? Object.keys(sectors).slice(0, 12) : null,
      sampleId: sample && sample.id,
      samplePaletteKeys: sample && sample.palette ? Object.keys(sample.palette) : null,
      sampleNebulaTint: sample && sample.palette ? sample.palette.nebulaTint : null,
      fringeFound: !!fringe,
      fringeId: fringe && fringe.id,
      bgSectorIdBefore: bg._sectorId,
      applied, err,
      hasOnSectorEnter: typeof bg.onSectorEnter,
    };
  });
  console.log(JSON.stringify(out, null, 1));
} finally {
  await browser.close();
  child.kill();
}
