// LOOK-05A: Swarm round N with the authored place_rock bodies ADMITTED (waits for them), shoots the frame and
// crops around the authored rocks that are on screen, upscaled 2x so the surface reads.
//   node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/rocks-admitted.mjs <outPrefix> <round>
import { chromium as rawChromium } from 'playwright';
import { quietChromium } from '../../lib/quietLaunch.mjs';
const chromium = quietChromium(rawChromium);
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
const PORT = 8175;
const out = process.argv[2] || '.devshots/fleet/looks/look05a/adm';
const round = Number(process.argv[3] || 3);
mkdirSync(dirname(out), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: process.cwd(), stdio: 'ignore' });
try {
  await sleep(2500);
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 160)));
  page.on('console', (m) => { const t = m.text(); if (/GLSL|shader|WebGLProgram|triplanar/i.test(t) && m.type() !== 'log' && m.type() !== 'info') console.log('console', m.type(), t.slice(0, 700)); });
  await page.goto(`http://127.0.0.1:${PORT}/?swarmRound=${round}`);
  const t0 = Date.now();
  while (Date.now() - t0 < 420_000) {
    const ok = page.locator('.sf-confirm__ok');
    if (await ok.first().isVisible().catch(() => false)) await ok.first().click().catch(() => {});
    const launch = page.getByText(/Launch round/i).first();
    if (await launch.isVisible().catch(() => false)) await launch.click({ force: true, timeout: 5000 }).catch(() => {});
    const live = await page.evaluate(() => { const s = window.SF && window.SF.state; return !!s && s.mode === 'flight' && (s.entityList || []).filter((e) => e && e.alive !== false && e.type === 'ship' && !e.isPlayer && e.team !== 0).length >= 3; }).catch(() => false);
    if (live) break;
    await sleep(1500);
  }
  const probe = () => page.evaluate(() => {
    const SF = window.SF; const r = SF.registry.get('render'); const rows = [];
    for (const e of SF.state.entityList || []) {
      if (!e || e.alive === false || e.type !== 'asteroid' || !(e.data && e.data.placeId)) continue;
      const root = r._meshes && r._meshes.get(e.id); if (!root) continue;
      let tp = 0; root.traverse((o) => { if (o.isMesh && o.material) for (const m of [].concat(o.material)) if (m.userData && m.userData.spacefaceTriplanarRock) tp++; });
      const sc = SF.helpers.worldToScreen({ x: e.pos.x, y: 0, z: e.pos.z }, {});
      rows.push({ id: e.id, place: e.data.placeId, state: root.userData.authoredAssetState, tp, r: Math.round(e.radius), on: !!(sc && sc.onScreen), x: sc && Math.round(sc.x), y: sc && Math.round(sc.y) });
    }
    return rows;
  });
  let rows = [];
  for (let i = 0; i < 100; i++) { rows = await probe(); if (rows.filter((x) => x.tp > 0 && x.on && x.r >= 14).length >= 2) break; await sleep(2000); }
  console.log('admitted rocks on screen', rows.filter((x) => x.tp > 0 && x.on).length, 'of', rows.length, JSON.stringify(rows.slice(0, 8)));
  writeFileSync(`${out}-report.json`, JSON.stringify(rows, null, 1));
  await sleep(1500);
  await page.screenshot({ path: `${out}-plain.png` });
  // crops 2x around up to three admitted rocks
  const sharp = null;
  const picks = rows.filter((x) => x.tp > 0 && x.on && x.x > 40 && x.x < 1240 && x.y > 40 && x.y < 690).sort((a, b) => b.r - a.r).slice(0, 4);
  let n = 0;
  for (const p of picks) {
    const half = Math.max(70, p.r * 7);
    const x0 = Math.max(0, Math.min(1280 - 2 * half, p.x - half)); const y0 = Math.max(0, Math.min(720 - 2 * half, p.y - half));
    const clip = { x: x0, y: y0, width: 2 * half, height: 2 * half };
    await page.screenshot({ path: `${out}-crop${n++}.png`, clip, scale: 'device' });
  }
  await browser.close();
} finally { server.kill(); }
