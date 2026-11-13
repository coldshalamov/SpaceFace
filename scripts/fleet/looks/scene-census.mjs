// Lead look: which drawn objects in a live Swarm fight are see-through, and why. Boots ?swarmRound=N,
// waits for the fight, then lists every visible mesh whose material blends (transparent or
// opacity < 1), grouped by object/material name, with its entity type when it maps to one. Also
// saves a frame with the biggest see-through bodies outlined in the console list.
//
//   node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/scene-census.mjs [outPrefix] [round]
//
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const PORT = 8164;
const out = process.argv[2] || '.devshots/fleet/looks/census/run';
const round = Number(process.argv[3] || 20);
mkdirSync(dirname(out), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: process.cwd(), stdio: 'ignore' });

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
    const scene = r.scene || (window.SF.renderer && window.SF.renderer.scene) || null;
    const camera = r.camera || (window.SF.renderer && window.SF.renderer.camera) || null;
    if (!scene) return { error: 'no scene', keys: Object.keys(r).slice(0, 60) };
    const groups = new Map();
    const v = { x: 0, y: 0, z: 0 };
    let total = 0;
    scene.traverseVisible((o) => {
      if (!o.isMesh && !o.isInstancedMesh && !o.isSprite && !o.isPoints) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        const blends = m.transparent === true || (typeof m.opacity === 'number' && m.opacity < 0.999);
        if (!blends) continue;
        total++;
        let owner = o; let ent = null;
        while (owner && !ent) { ent = owner.userData && (owner.userData.entityId ?? owner.userData.id ?? null); owner = owner.parent; }
        const e = ent != null && s.entities && s.entities.get ? s.entities.get(ent) : null;
        const key = `${o.isInstancedMesh ? 'inst:' : ''}${o.name || o.type}|${m.name || m.type}|${e ? e.type + ':' + (e.defId || (e.data && (e.data.kind || e.data.shipClass)) || '') : 'no-entity'}`;
        const g = groups.get(key) || { n: 0, opacity: [], depthWrite: m.depthWrite, blending: m.blending, count: 0, scale: 0 };
        g.n++;
        if (g.opacity.length < 4) g.opacity.push(+(m.opacity ?? 1).toFixed(2));
        g.count += o.isInstancedMesh ? o.count : 1;
        o.getWorldScale && (() => { const ws = o.getWorldScale(new o.position.constructor()); g.scale = Math.max(g.scale, +Math.max(ws.x, ws.z).toFixed(1)); })();
        groups.set(key, g);
      }
    });
    const rows = [...groups.entries()].sort((a, b) => b[1].scale - a[1].scale).slice(0, 40)
      .map(([k, g]) => `${k} ×${g.count} op=${g.opacity.join('/')} dw=${g.depthWrite} bl=${g.blending} scale≤${g.scale}`);
    // Detail for the big blended lit bodies (the usual suspects for see-through rocks).
    const detail = [];
    scene.traverseVisible((o) => {
      if (!o.isMesh || detail.length >= 12) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!m || !(m.transparent || m.opacity < 0.999) || !(m.isMeshPhysicalMaterial || m.isMeshStandardMaterial)) return;
      const chain = [];
      let p = o; while (p && chain.length < 6) { chain.push(`${p.name || p.type}${p.userData && Object.keys(p.userData).length ? '{' + Object.keys(p.userData).slice(0, 5).join(',') + '}' : ''}`); p = p.parent; }
      const wp = o.getWorldPosition(new o.position.constructor());
      detail.push({ chain: chain.join(' < '), geo: o.geometry && (o.geometry.name || o.geometry.type), mat: m.name, color: m.color && m.color.getHexString(), op: m.opacity, transmission: m.transmission, pos: [Math.round(wp.x), Math.round(wp.y), Math.round(wp.z)] });
    });
    return { total, rows, detail, cam: camera ? camera.type : null };
  });
  console.log(JSON.stringify(report, null, 1).slice(0, 6000));
  await browser.close();
} finally {
  server.kill();
  setTimeout(() => process.exit(0), 500);
}
