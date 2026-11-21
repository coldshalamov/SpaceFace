// Lead look (LIGHT): prove the bow lamp lands. Boots Swarm round N, parks a big rock in FRONT of the player's
// drawn bow (using the drawn root's forward, not the sim heading), freezes the sim, then reads the live bow
// spot light (world position, direction, angle, penumbra, range, intensity) and for every asteroid within 260 WU
// computes distance, angle off the lamp axis and whether it is inside the cone. Shoots lamps off vs on, cropped
// around the rock, same frame.
//   node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/lamp-geometry.mjs <outPrefix> [round]
import { chromium as rawChromium } from 'playwright';
import { quietChromium } from '../../lib/quietLaunch.mjs';
const chromium = quietChromium(rawChromium);
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const PORT = 8174;
const out = process.argv[2] || '.devshots/fleet/looks/light/geo';
const mode = process.argv[3] || 'swarm'; // swarm | helios
const round = Number(process.argv[4] || 20);
// variants: height:aimDistance:intensity[:decay] comma list (defaults to the shipped lamp, then raised mounts)
// variants: height:aimDistance:intensity[:decay[:beamDensity]]
const variants = (process.argv[5] || '20:105:440:1.2:0,20:105:1500:1.2:0,20:105:2500:1.2:0,20:105:4000:1.2:0,20:105:2500:1.0:0,20:105:1500:1.2:0.0003,20:105:2500:1.2:0.0003,20:105:2500:1.2:0.0006').split(',');
mkdirSync(dirname(out), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: process.cwd(), stdio: 'ignore' });
try {
  await sleep(2500);
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 160)));
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });
  await page.goto(mode === 'swarm' ? `http://127.0.0.1:${PORT}/?swarmRound=${round}` : `http://127.0.0.1:${PORT}/?sector=helios_core&shot=1`, { waitUntil: 'commit', timeout: 120_000 });
  const t0 = Date.now();
  while (Date.now() - t0 < 420_000) {
    const ok = page.locator('.sf-confirm__ok');
    if (await ok.first().isVisible().catch(() => false)) await ok.first().click().catch(() => {});
    const launch = page.getByText(/Launch round/i).first();
    if (await launch.isVisible().catch(() => false)) await launch.click({ force: true, timeout: 5000 }).catch(() => {});
    const live = mode === 'swarm' ? await page.evaluate(() => { const s = window.SF && window.SF.state; return !!s && s.mode === 'flight'
      && (s.entityList || []).filter((e) => e && e.alive !== false && e.type === 'ship' && !e.isPlayer && e.team !== 0).length >= 3; }).catch(() => false)
      : await page.evaluate(() => window.__sfShotReady === true).catch(() => false);
    if (live) break;
    await sleep(1500);
  }
  await sleep(4000);
  // Park the nearest big rock 45 WU past the drawn bow, in the drawn forward direction.
  const placed = await page.evaluate(async (mode) => {
    // Freeze FIRST: the player steers toward the cursor and rocks collide, so a live wait moves the pose.
    window.SF.timeEffects.set('bench:freeze', { scale: 0 });
    await new Promise((r) => setTimeout(r, 400));
    const st = window.SF.state, n = st.render.nocturne, meshes = n._options.meshes;
    const p = st.entities.get(st.playerId), root = meshes.get(p.id);
    const fwd = { x: 1, z: 0 };
    if (root) { const q = root.quaternion; const x = 1 - 2 * (q.y * q.y + q.z * q.z), z = 2 * (q.x * q.z - q.w * q.y) * -1; fwd.x = x; fwd.z = 2 * (q.w * q.y + q.x * q.z) * -1; }
    let best = null, bd = 1e9;
    for (const e of st.entityList) if (mode === 'swarm' ? (e.type === 'asteroid' && e.alive !== false && e.radius > 20)
        : (e.type === 'ship' && e.id !== p.id && e.alive !== false)) {
      const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z); if (d < bd) { bd = d; best = e; }
    }
    // Use the drawn root's own +X axis in world space (the lamp code does the same).
    const v = root.getWorldDirection ? null : null;
    const m = root.matrixWorld.elements; const len = Math.hypot(m[0], m[8]) || 1; fwd.x = m[0] / len; fwd.z = m[2] / len;
    const gap = (best.radius || 10) + 45;
    best.pos.x = p.pos.x + fwd.x * gap; best.pos.z = p.pos.z + fwd.z * gap;
    if (best.vel) { best.vel.x = 0; best.vel.z = 0; }
    if (p.vel) { p.vel.x = 0; p.vel.z = 0; }
    await new Promise((r) => setTimeout(r, 1500));
    return { target: best.id, type: best.type, radius: best.radius, fwd, simRot: p.rot };
  }, mode);
    console.log('placed', JSON.stringify(placed));
  await sleep(2500);
  const geo = await page.evaluate(() => {
    const st = window.SF.state, n = st.render.nocturne, meshes = n._options.meshes, cam = n._options.camera;
    const p = st.entities.get(st.playerId), root = meshes.get(p.id);
    const slot = n.director.slots.find((s) => s.kind === 'spot' && s.source && s.source.critical);
    if (!slot) return { error: 'no critical spot resident', slots: n.director.slots.map((s) => s.source && s.source.id) };
    const L = slot.light, tp = L.target.position;
    const dir = { x: tp.x - L.position.x, y: tp.y - L.position.y, z: tp.z - L.position.z };
    const dl = Math.hypot(dir.x, dir.y, dir.z); dir.x /= dl; dir.y /= dl; dir.z /= dl;
    const rows = [];
    for (const e of st.entityList) {
      if (e.type !== 'asteroid' || e.alive === false) continue;
      const r = meshes.get(e.id); if (!r) continue;
      const rp = r.position;
      const v = { x: rp.x - L.position.x, y: rp.y - L.position.y, z: rp.z - L.position.z };
      const d = Math.hypot(v.x, v.y, v.z); if (d > 300) continue;
      const cos = (v.x * dir.x + v.y * dir.y + v.z * dir.z) / d;
      const off = Math.acos(Math.max(-1, Math.min(1, cos)));
      rows.push({ id: e.id, radius: e.radius, centreDist: +d.toFixed(1), surfaceDist: +(d - e.radius).toFixed(1), offAxisRad: +off.toFixed(3),
        insideCone: off < L.angle, insidePenumbraCore: off < L.angle * (1 - L.penumbra) });
    }
    rows.sort((a, b) => a.centreDist - b.centreDist);
    const rootPos = root.position;
    cam.updateMatrixWorld();
    const sc = (pos) => { const v = pos.clone ? pos.clone() : pos; const q = new (v.constructor)(pos.x, pos.y, pos.z).project(cam); return { x: Math.round((q.x * 0.5 + 0.5) * 1280), y: Math.round((-q.y * 0.5 + 0.5) * 720) }; };
    return { lamp: { id: slot.source.id, pos: L.position.toArray().map((x) => +x.toFixed(1)), target: tp.toArray().map((x) => +x.toFixed(1)),
      dir: [dir.x, dir.y, dir.z].map((x) => +x.toFixed(3)), pitchDeg: +(Math.asin(dir.y) * 180 / Math.PI).toFixed(1), angle: L.angle, penumbra: L.penumbra,
      range: L.distance, decay: L.decay, intensity: +L.intensity.toFixed(1), color: L.color.getHexString(), shadowIntensity: L.shadow && L.shadow.intensity },
      hull: rootPos.toArray().map((x) => +x.toFixed(1)), rocks: rows.slice(0, 6), screen: { hull: sc(rootPos), rock: rows[0] && sc(meshes.get(rows[0].id).position) } };
  });
  console.log(JSON.stringify(geo));
  const c = mode === 'swarm' && geo.screen && geo.screen.rock ? { x: (geo.screen.rock.x + geo.screen.hull.x) / 2, y: geo.screen.rock.y } : (geo.screen && geo.screen.hull) || { x: 640, y: 360 };
  const clip = { x: Math.max(0, Math.min(1280 - 520, c.x - 260)), y: Math.max(0, Math.min(720 - 360, c.y - 180)), width: 520, height: 360 };
  const lamps = (on) => page.evaluate(async (o) => {
    const n = window.SF.state.render.nocturne;
    if (!window.__origHead) window.__origHead = n.headlights.update.bind(n.headlights);
    n.headlights.update = o ? window.__origHead : (...a) => { window.__origHead(...a); for (const r of n.headlights.rows) if (r.source) r.source.enabled = false; };
    n.director.invalidate();
    await new Promise((r) => setTimeout(r, 3500));
  }, on);
  await lamps(false); await page.screenshot({ path: `${out}-off.png`, clip });
  await lamps(true); await page.screenshot({ path: `${out}-on.png`, clip });
  for (const v of variants) {
    const [h, aim, inten, dec, beamD] = v.split(':').map(Number);
    await page.evaluate(async ([h, aim, inten, dec, beamD]) => {
      const n = window.SF.state.render.nocturne; if (!window.__look0) window.__look0 = n.headlights.look;
      const b = window.__look0.beam || {};
      n.headlights.look = { ...window.__look0, height: h, aimDistance: aim, intensity: inten, beam: { ...b, density: beamD } };
      for (const r of n.headlights.rows) if (r.source && dec) r.source.decay = dec;
      n.director.invalidate(); await new Promise((r) => setTimeout(r, 3000));
    }, [h, aim, inten, dec, beamD]);
    const m = await page.evaluate(async () => {
      const info = window.SF.state.render.nocturne.renderer.info; const iv = [];
      await new Promise((res) => { let last = performance.now(); const end = last + 3000; const f = (t) => { iv.push(t - last); last = t; if (t < end) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
      return { meanMs: +(iv.reduce((a, b) => a + b, 0) / iv.length).toFixed(1), calls: info.render.calls, tris: info.render.triangles, media: window.SF.state.render.nocturne.content.media.length };
    });
    console.log(`variant ${v}`, JSON.stringify(m));
    await page.screenshot({ path: `${out}-i${inten}_d${dec}_b${beamD}.png`, clip });
    if (beamD > 0) await page.screenshot({ path: `${out}-i${inten}_d${dec}_b${beamD}-full.png` });
  }
  await page.screenshot({ path: `${out}-on-full.png` });
  await browser.close();
} finally { server.kill(); setTimeout(() => process.exit(0), 500); }
