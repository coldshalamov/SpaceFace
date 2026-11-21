// Lead look: what is drawn on and around each hostile (names, colours), then hides each candidate group and re-shoots. Boots ?swarmRound=N,
// waits for the fight, then lists every visible mesh whose material blends (transparent or
// opacity < 1), grouped by object/material name, with its entity type when it maps to one. Also
// saves a frame with the biggest see-through bodies outlined in the console list.
//
//   node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/scene-census.mjs [outPrefix] [round]
//
import { chromium as rawChromium } from 'playwright';
import { quietChromium } from '../../lib/quietLaunch.mjs';
const chromium = quietChromium(rawChromium);
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const PORT = 8166;
const out = process.argv[2] || '.devshots/fleet/looks/census/run';
const round = Number(process.argv[3] || 20);
mkdirSync(dirname(out), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: process.cwd(), stdio: 'ignore' });
// WATCHDOG: a probe must never hold the shared game lock. Hard stop after 180 s, whatever it is doing.
setTimeout(() => { console.log('watchdog: probe timed out after 180 s'); try { server.kill(); } catch {} process.exit(2); }, 180_000).unref?.();

try {
  await sleep(2500);
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 160)));
  await page.goto(`http://127.0.0.1:${PORT}/?swarmRound=${round}`);
  const t0 = Date.now();
  let live = 0;
  while (Date.now() - t0 < 420_000) {
    const ok = page.locator('.sf-confirm__ok');
    if (await ok.first().isVisible().catch(() => false)) await ok.first().click().catch(() => {});
    const launch = page.getByText(/Launch round/i).first();
    if (await launch.isVisible().catch(() => false)) await launch.click({ force: true, timeout: 5000 }).catch(() => {});
    live = await page.evaluate(() => {
      const s = window.SF && window.SF.state;
      if (!s || s.mode !== 'flight') return 0;
      return (s.entityList || []).filter((e) => e && e.alive !== false && e.type === 'ship' && !e.isPlayer && e.team !== 0).length;
    }).catch(() => 0);
    if (live >= 3) break;
    await sleep(1500);
  }
  console.log(`fight live: ${live} hostiles after ${Math.round((Date.now() - t0) / 1000)} s`);
  await sleep(6000);
  await page.screenshot({ path: `${out}-frame.png` });
  const report = await page.evaluate(() => {
    const s = window.SF.state;
    const r = s.render || {};
    const scene = r.scene || (window.SF.renderer && window.SF.renderer.scene);
    const hostiles = (s.entityList || []).filter((e) => e && e.alive !== false && e.type === 'ship' && !e.isPlayer && e.team !== 0 && e.pos);
    const found = new Map();
    const w = { x: 0, y: 0, z: 0 };
    scene.traverseVisible((o) => {
      if (!(o.isMesh || o.isSprite || o.isLine || o.isPoints || o.isInstancedMesh)) return;
      o.updateWorldMatrix(true, false); w.x = o.matrixWorld.elements[12]; w.z = o.matrixWorld.elements[14];
      let near = null;
      for (const h of hostiles) { const d = Math.hypot(h.pos.x - w.x, h.pos.z - w.z); if (d < 14 && (!near || d < near.d)) near = { d, id: h.id }; }
      if (!near) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      const chain = []; for (let p = o; p && chain.length < 4; p = p.parent) chain.push(p.name || p.type);
      const key = `${chain.join('<')}|${m && m.type}|${m && m.color ? m.color.getHexString() : ''}|${m && m.name || ''}`;
      const f = found.get(key) || { key, n: 0, geom: o.geometry && o.geometry.type, depthTest: m && m.depthTest };
      f.n++; found.set(key, f);
    });
    return [...found.values()].sort((a, b) => b.n - a.n).slice(0, 40);
  });
  for (const f of report) console.log(JSON.stringify(f));
} finally { try { server.kill(); } catch {} }
