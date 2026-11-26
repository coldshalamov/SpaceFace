// Lead look (LIGHT): why do station floodlights not show? Boots the Helios opening, parks the player ~180 WU off
// the nearest station, and reports every Nocturne source that station owns (enabled, gain, intensity, range, position
// relative to the hull), which ones are resident in a real light slot, and the director's score ranking. Shoots a
// frame with the station in view (frozen), then again with each resident light removed for contrast.
//   node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/station-lights.mjs <outPrefix>
import { chromium as rawChromium } from 'playwright';
import { quietChromium } from '../../lib/quietLaunch.mjs';
const chromium = quietChromium(rawChromium);
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const PORT = 8175;
const out = process.argv[2] || '.devshots/fleet/looks/light/stn';
mkdirSync(dirname(out), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: process.cwd(), stdio: 'ignore' });
try {
  await sleep(2500);
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 160)));
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });
  await page.goto(`http://127.0.0.1:${PORT}/?sector=helios_core${process.argv.includes('--live') ? '' : '&shot=1'}`, { waitUntil: 'commit', timeout: 120_000 });
  const t0 = Date.now();
  while (Date.now() - t0 < 300_000) {
    const ok = page.locator('.sf-confirm__ok');
    if (await ok.first().isVisible().catch(() => false)) await ok.first().click().catch(() => {});
    if (process.argv.includes('--live')) {
      const ok2 = await page.evaluate(() => { const s = window.SF && window.SF.state; return !!s && s.mode === 'flight' && (s.entityList || []).length > 20; }).catch(() => false);
      if (ok2) { await sleep(8000); break; }
    } else if (await page.evaluate(() => window.__sfShotReady === true).catch(() => false)) break;
    await sleep(1500);
  }
  await sleep(3000);
  // Fly there: players are physics-held, so aim at the nearest station with the cursor and hold W until close.
  const aim = await page.evaluate(() => {
    const st = window.SF.state, p = st.entities.get(st.playerId); let best = null, bd = 1e9;
    for (const e of st.entityList) if (e.type === 'station' && e.alive !== false && st.render.nocturne._options.meshes.has(e.id)) {
      const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z); if (d < bd) { bd = d; best = e; }
    }
    return best && { id: best.id, dx: best.pos.x - p.pos.x, dz: best.pos.z - p.pos.z, radius: best.radius };
  });
  const len = Math.hypot(aim.dx, aim.dz);
  await page.mouse.move(640 + (aim.dx / len) * 420, 360 + (aim.dz / len) * 280);
  await page.keyboard.down('w');
  const tFly = Date.now(); let dist = 1e9;
  while (Date.now() - tFly < 60_000) {
    dist = await page.evaluate((id) => { const st = window.SF.state, p = st.entities.get(st.playerId), e = st.entities.get(id); return Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z); }, aim.id);
    if (dist < ((aim.radius || 60) + 190)) break;
    await sleep(250);
  }
  await page.keyboard.up('w');
  const park = await page.evaluate(async (id) => {
    window.SF.timeEffects.set('bench:freeze', { scale: 0 });
    const st = window.SF.state, p = st.entities.get(st.playerId), e = st.entities.get(id);
    return { station: id, dist: Math.round(Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z)), arch: e.data && e.data.stationType };
  }, aim.id);
  console.log('park', JSON.stringify(park));
  await sleep(2500);
  const rep = await page.evaluate(async () => {
    const mod = await import('/src/render/nocturne/content.js');
    const st = window.SF.state, n = st.render.nocturne, meshes = n._options.meshes;
    const owners = [];
    for (const rec of n.content.records.values()) {
      if (rec.entity.type !== 'station') continue;
      const root = rec.root;
      owners.push({ id: rec.entity.id, archetype: rec.archetype, radius: rec.radius, hasRoot: !!root, rootPos: root && root.position.toArray().map((x) => Math.round(x)),
        lights: rec.lights.map((l) => ({ id: l.id.split(':').pop(), profile: l.definition.profile, explicit: l.explicit, socket: l.socket && l.socket.name, emitter: !!l.emitter,
          enabled: l.source.enabled, gain: +l.source.gain.toFixed(2), type: l.source.type, intensity: Math.round(l.source.intensity), range: l.source.range,
          pos: l.source.position.toArray().map((x) => Math.round(x)), score: +(l.source._selectionScore || 0).toFixed(3), priority: l.source.priority })) });
    }
    const slots = n.director.slots.map((s) => ({ kind: s.kind, id: s.source && s.source.id, I: Math.round(s.light.intensity) }));
    const e2 = st.entityList.find((e) => e.type === 'station' && meshes.has(e.id)); const r2 = e2 && meshes.get(e2.id);
    const dbg = e2 && { arch: mod.resolveNocturneArchetype(e2), dataNoct: e2.data && e2.data.nocturne, rootNoct: r2.userData.nocturne, vis: r2.visible, parent: !!r2.parent, collides: e2.collides, pos: e2.pos, player: st.entities.get(st.playerId).pos, children: r2.children.length, cand: n.content._candidateEntity.filter(Boolean).map((x) => x.id + ':' + x.type) };
    const stn = st.entityList.filter((e) => e.type === 'station' && meshes.has(e.id)).map((e) => ({ id: e.id, hasMesh: meshes.has(e.id), arch: e.data && (e.data.archetypeGlb || e.data.stationTypeId || e.data.stationType), kind: e.kind, hasView: !!(e.view && e.view.root), rec: n.content.records.has(e.id) }));
    return { dbg, stn, owners, slots, candidates: n.director.getDiagnostics().candidates, owned: n.content.diagnostics };
  });
  console.log(JSON.stringify(rep));
  await page.screenshot({ path: `${out}-frame.png` });
  await browser.close();
} finally { server.kill(); setTimeout(() => process.exit(0), 500); }
