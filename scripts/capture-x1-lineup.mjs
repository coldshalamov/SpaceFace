#!/usr/bin/env node
// X1 lineup capture — the ordinary route: title -> Swarm -> Ricochet Foundry, then screenshots
// at the gameplay camera. Used to judge the arena-prop finish against
// design/program/finish/campaigns/X1/STYLE_BIBLE.md.
//
//   node scripts/capture-x1-lineup.mjs [--out=.devshots/x1] [--wait=24000]
//   SF_GL=d3d11 node scripts/capture-x1-lineup.mjs     # real GPU instead of SwiftShader
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const { createGameServer } = require('./lib/gameServer.cjs');
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.length ? v.join('=') : true];
}));
const OUT = ROOT + (args.out || '.devshots/x1') + '/';
mkdirSync(OUT, { recursive: true });

const server = createGameServer({ root: ROOT });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  args: process.env.SF_GL === 'd3d11'
    ? ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--disable-background-timer-throttling']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
      '--disable-background-timer-throttling'],
});

const errors = [];
let page = null;
try {
  page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'commit', timeout: 180000 });
  await page.waitForFunction(() => window.SF?.state && window.SF?.bus, null, { timeout: 240000 });

  // The ordinary first-run route: splash -> motion -> First light -> title.
  async function clickText(text, timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const clicked = await page.evaluate((wanted) => {
        const buttons = [...document.querySelectorAll('button')].filter((b) => b.getClientRects().length && !b.disabled);
        const match = buttons.find((b) => b.textContent.trim() === wanted)
          || buttons.find((b) => b.textContent.includes(wanted));
        if (!match) return false;
        match.click();
        return true;
      }, text);
      if (clicked) return true;
      await page.waitForTimeout(150);
    }
    return false;
  }

  if (await clickText('CLICK OR PRESS ANY KEY', 4000)) await page.waitForTimeout(800);
  if (!(await clickText('Full', 4000))) {
    // A profile that has already chosen a motion setting skips the dialog.
  }
  await page.waitForTimeout(800);
  if (!(await clickText('PLAY', 4000))) {
    // First light may already be recorded.
  }
  if (!(await clickText('Swarm', 90000))) {
    // Fall back to the old Crucible door.
    if (!(await clickText('Crucible', 10000))) throw new Error('no Swarm or Crucible entry');
    await clickText('Quick play', 20000);
    await clickText('Choose ship & kit', 20000);
    await clickText('Launch', 60000);
  }

  await page.waitForFunction(() => {
    const s = window.SF?.state;
    return s?.mode === 'flight' && s?.run?.kind === 'survival' && s?.run?.phase !== 'inactive';
  }, null, { timeout: 300000 });
  // A first-run modal can survive the launch; dismiss it once, then let the room settle.
  if (await page.evaluate(() => document.body.classList.contains('ui-modal-open'))) {
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(600);
  }

  // Let the room's authored furniture and the sector sky finish admitting.
  const settle = Math.max(6000, Number(args.wait) || 24000);
  await page.waitForTimeout(settle);

  // Fly a slow circuit so the bank plates, gate and furnace pass through the frame.
  await page.keyboard.down('KeyW');
  const shots = [];
  for (let i = 0; i < 6; i++) {
    if (i === 2) await page.keyboard.down('KeyA');
    if (i === 4) { await page.keyboard.up('KeyA'); await page.keyboard.down('KeyD'); }
    await page.waitForTimeout(1800);
    const name = `foundry-${String(i + 1).padStart(2, '0')}.png`;
    await page.screenshot({ path: OUT + name, timeout: 180000 });
    shots.push(name);
  }
  await page.keyboard.up('KeyW').catch(() => {});
  await page.keyboard.up('KeyD').catch(() => {});

  // A HUD-free frame is the cleanest read of the picture.
  await page.addStyleTag({ content: '#ui-root { visibility: hidden !important; }' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: OUT + 'foundry-clean.png', timeout: 180000 });
  shots.push('foundry-clean.png');

  const state = await page.evaluate(() => {
    const s = window.SF.state;
    return {
      arena: s.run?.arenaId || s.run?.arena || null,
      round: s.run?.wave ?? null,
      mode: s.mode,
      sector: s.world?.currentSectorId ?? null,
      entities: s.entities?.all?.().length ?? null,
    };
  });
  console.log(JSON.stringify({ out: OUT, shots, state, errors }, null, 2));
} finally {
  await page?.close().catch(() => {});
  await browser.close().catch(() => {});
  server.close();
}
