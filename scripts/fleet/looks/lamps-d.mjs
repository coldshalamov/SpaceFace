// LOOK-05D look: PROVE THE LIGHT. Boots a Swarm round, freezes the sim clock (the renderer keeps
// drawing, same method as light-tune.mjs), parks the camera beside each lit Foundry thing (Forge pad,
// furnace, wall gun, Crate, Tap, a bank plate, a gate post) and shoots the SAME frozen frame twice:
// arena lamps ON (data.lightPower = 1) then OFF (0). Also reports whether each target is on screen and
// what NOCTURNE has resident.
//
//   node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/lamps-d.mjs <outPrefix> [round]
//
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const PORT = 8173;
const out = process.argv[2] || '.devshots/look05d/lamps/l';
const round = Number(process.argv[3] || 20);
mkdirSync(dirname(out), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: process.cwd(), stdio: 'ignore' });
try {
  await sleep(2500);
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 160)));
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });
  await page.goto(`http://127.0.0.1:${PORT}/?swarmRound=${round}`, { waitUntil: 'commit', timeout: 120_000 });
  const t0 = Date.now();
  while (Date.now() - t0 < 420_000) {
    const ok = page.locator('.sf-confirm__ok');
    if (await ok.first().isVisible().catch(() => false)) await ok.first().click().catch(() => {});
    const launch = page.getByText(/Launch round/i).first();
    if (await launch.isVisible().catch(() => false)) await launch.click({ force: true, timeout: 5000 }).catch(() => {});
    const ready = await page.evaluate(() => { const s = window.SF && window.SF.state; return !!s && s.mode === 'flight'
      && (s.entityList || []).filter((e) => e && e.alive !== false && e.type === 'ship' && !e.isPlayer && e.team !== 0).length >= 3; }).catch(() => false);
    if (ready) break;
    await sleep(1500);
  }
  await sleep(30000); // pad bodies admit (load + pipeline compile) well after the round starts
  await page.evaluate(() => { window.SF.timeEffects.set('bench:freeze', { scale: 0 }); });
  const targets = await page.evaluate(() => {
    const s = window.SF.state; const seen = new Set(); const list = [];
    for (const e of s.entityList || []) {
      if (!e || e.alive === false || e.isPlayer) continue;
      let key = null;
      if (e.data && e.data.swarmFloorPad) key = `pad-${e.data.swarmFloorPad.kind}`;
      else if (e.data && e.data.roomKind) key = `room-${e.data.roomKind}`;
      if (!key || seen.has(key)) continue;
      seen.add(key); list.push({ key, id: e.id });
    }
    return list;
  });
  console.log('targets', targets.map((t) => t.key).join(', '));
  const packaged = await page.evaluate(() => {
    const scene = window.SF.state.render.nocturne.scene; const rows = [];
    scene.traverse((o) => { const u = o.userData || {}; if (u.authoredPackageUrl) rows.push({ name: o.name, url: u.authoredPackageUrl, state: u.authoredAssetState, root: u.authoredVisualRoot, kids: o.children.length, vis: o.visible }); });
    return rows;
  });
  console.log('packaged-props', JSON.stringify(packaged.filter((r) => /weapon_turret|pod_cargo|drill_platform|slurry/.test(r.url))));
  const report = [];
  for (const t of targets) {
    await page.evaluate((id) => {
      const s = window.SF.state; const me = s.entities.get(s.playerId); const e = s.entities.get(id);
      me.pos.x = e.pos.x - 60; me.pos.z = e.pos.z + 25; if (me.vel) { me.vel.x = 0; me.vel.z = 0; }
      window.SF.timeEffects.set('bench:freeze', { scale: 1 });
    }, t.id);
    await sleep(2200);
    await page.evaluate(() => { window.SF.timeEffects.set('bench:freeze', { scale: 0 }); });
    await sleep(1200);
    for (const state of ['on', 'off']) {
      const info = await page.evaluate(async ({ id, state }) => {
        const s = window.SF.state; const n = s.render.nocturne;
        for (const e of s.entityList || []) { if (e && e.data && e.data.nocturne) e.data.lightPower = state === 'on' ? 1 : 0; }
        if (n && n.director && n.director.invalidate) n.director.invalidate();
        await new Promise((r) => setTimeout(r, 1800));
        const e = s.entities.get(id);
        const scr = window.SF.helpers.worldToScreen({ x: e.pos.x, y: 0, z: e.pos.z }, {});
        const slots = n ? n.director.slots.map((sl) => `${sl.source && sl.source.id}:${Math.round(sl.light.intensity)}`) : [];
        return { onScreen: !!(scr && scr.onScreen), at: scr && [Math.round(scr.x), Math.round(scr.y)], media: n && n.content.media ? n.content.media.length : null, slots };
      }, { id: t.id, state });
      await page.screenshot({ path: `${out}-${t.key}-${state}.png` });
      if (state === 'on') {
        info.body = await page.evaluate((id) => {
          const SF = window.SF; const cand = [SF.renderer, SF.state.render && SF.state.render.owner, SF.state.render && SF.state.render.renderer, SF.rendererOwner];
          for (const r of cand) {
            const m = r && (r._meshes || (r.meshes));
            if (m && m.get) {
              const mesh = m.get(id); if (!mesh) return { found: false };
              const u = mesh.userData || {};
              return { found: true, state: u.authoredAssetState, url: u.authoredPackageUrl, visualRoot: u.authoredVisualRoot, kids: mesh.children.length };
            }
          }
          return { keys: Object.keys(SF).slice(0, 30), renderKeys: Object.keys(SF.state.render || {}).slice(0, 30) };
        }, t.id);
      }
      report.push({ target: t.key, state, ...info });
      console.log(t.key, state, JSON.stringify(info));
    }
  }
  writeFileSync(`${out}-report.json`, JSON.stringify(report, null, 2));
  await browser.close();
} finally { server.kill(); setTimeout(() => process.exit(0), 500); }
