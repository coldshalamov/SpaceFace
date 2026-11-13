// LOOK-05A look: Swarm round N rocks. Boots a round, reports what the on-screen rocks wear
// (placeId / authored vs procedural, materials), and shoots frames (plain + zoomed on the nearest rocks).
//   node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/rocks.mjs <outPrefix> <round>
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
const PORT = 8171;
const out = process.argv[2] || '.devshots/fleet/looks/look05a/rocks';
const round = Number(process.argv[3] || 3);
mkdirSync(dirname(out), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: process.cwd(), stdio: 'ignore' });
try {
  await sleep(2500);
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 160)));
  await page.goto(`http://127.0.0.1:${PORT}/?swarmRound=${round}`);
  const t0 = Date.now(); let live = 0;
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
  await sleep(2500);
  const report = await page.evaluate(() => {
    const SF = window.SF; const r = SF.registry.get('render'); const rows = [];
    for (const e of SF.state.entityList || []) {
      if (!e || e.alive === false || e.type !== 'asteroid') continue;
      const root = r._meshes && r._meshes.get(e.id); if (!root) continue;
      const mats = new Set(); let tex = 0;
      root.traverse((o) => { if (o.isMesh && o.material) for (const m of [].concat(o.material)) { mats.add(`${m.name || m.type}|c${m.color ? m.color.getHexString() : ''}|map${!!m.map}|nrm${!!m.normalMap}|orm${!!m.aoMap}`); if (m.map) tex++; } });
      rows.push({ id: e.id, defId: e.defId || e.typeId, place: e.data && e.data.placeId, mat: e.data && e.data.material, r: Math.round(e.radius), state: root.userData.authoredAssetState, skin: root.userData.authoredGeologySkin, mats: [...mats].slice(0, 6) });
    }
    return rows;
  });
  writeFileSync(`${out}-report.json`, JSON.stringify(report, null, 1));
  console.log('rocks', report.length, JSON.stringify(report.slice(0, 6)));
  await page.screenshot({ path: `${out}-plain.png` });
  // Zoom: park the camera nearer by pushing the zoom control if the game exposes one.
  await page.evaluate(() => { const s = window.SF.state; if (s.camera) { s.camera.zoomTarget = 0.45; s.camera.zoom = 0.45; } });
  await sleep(1500);
  await page.screenshot({ path: `${out}-zoom.png` });
  await browser.close();
} finally { server.kill(); }
