// Camera-clearance witness: in the real game, does the chase camera ever sit inside a solid, and
// how smoothly does it get out of the way? Boots New Game, parks the player near a structure,
// autopilots into it, and records EVERY rendered frame in-page (rAF hook): camera pose, the roof
// under the camera's column, the glide scale, and the glide's own diagnostics.
//
//   node scripts/probe-camera-clearance.mjs --headless
//   SF_CLEAR_STATION=station_helios SF_CLEAR_ZOOM=55 node scripts/probe-camera-clearance.mjs --headless
//
// Writes .devshots/camera-clearance/report.json (+ report.md summary). Frame counts are
// informational on saturated hosts; the invariants are geometric: insideFrames must be 0 and
// hardClampFrames should be ~0 (anticipation did the work).
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = path.join(ROOT, '.devshots', 'camera-clearance');
const HEADLESS = process.argv.includes('--headless');
const STATION_ID = process.env.SF_CLEAR_STATION || 'station_helios';
const { chromium } = await loadPlaywright();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function waitForServer(url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch { /* not up yet */ }
    await sleep(150);
  }
  throw new Error(`game server did not answer at ${url}`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const port = await freePort();
const server = spawn(process.execPath, ['server.js', String(port)], {
  cwd: ROOT,
  stdio: 'ignore',
  env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '', SPACEFACE_USER_CONTENT_DIR: '' },
});
let browser = null;
const report = { station: STATION_ID, consoleErrors: [] };

try {
  await waitForServer(`http://127.0.0.1:${port}/`);
  browser = await chromium.launch({
    headless: HEADLESS,
    args: ['--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--window-size=1600,900'],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (error) => report.consoleErrors.push(`[pageerror] ${String(error).slice(0, 300)}`));
  await page.addInitScript(() => {
    sessionStorage.setItem('sf.cinematicSeen', '1');
    window.__SF_CLEAR__ = { on: false, frames: [] };
    const tick = () => {
      const rec = window.__SF_CLEAR__;
      const SF = window.SF;
      const st = SF && SF.state;
      const render = SF && SF.registry && SF.registry.get && SF.registry.get('render');
      const rig = render && render.cam;
      const cam = rig && rig.obj;
      const p = st && st.entities && st.entities.get(st.playerId);
      if (rec.on && cam && p && render._cameraClearanceAt && render._cameraClearanceAt.roofAt) {
        const roof = render._cameraClearanceAt.roofAt(cam.position.x, cam.position.z, 0);
        const c = st.camera || {};
        rec.frames.push([
          performance.now(), cam.position.x, cam.position.y, cam.position.z,
          roof === -Infinity ? null : roof, c.clearanceScale || 1,
          p.pos.x, p.pos.z, c.clearanceDiag ? c.clearanceDiag.hardFrames : 0,
        ]);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  await page.goto(`http://127.0.0.1:${port}/?demo=1`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 150_000 });
  await page.waitForSelector('[data-action="newGame"]', { timeout: 60_000 });
  await page.click('[data-action="newGame"]');
  await page.waitForSelector('.sf-ng-launch:not([aria-disabled="true"])', { timeout: 60_000 });
  await page.click('.sf-ng-launch');
  await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 240_000 });
  await page.waitForFunction(() => Number.isFinite(window.SF.state.render
    && window.SF.state.render.firstPlayableFrameAt), null, { timeout: 180_000 });
  await sleep(4000);

  const park = await page.evaluate((id) => {
    const st = window.SF.state;
    let s = null;
    for (const e of st.entities.values()) {
      if (e.id === id || e.stationId === id || (e.data && e.data.stationId === id)) { s = e; break; }
    }
    if (!s) return null;
    const r = (s.data && s.data.dockRadius) || s.dockRadius || 90;
    if (st.ui) { st.ui.docked = false; st.ui.dockedStationId = null; }
    window.SF.bus.emit('dock:undocked', { stationId: s.id });
    const p = st.entities.get(st.playerId);
    p.pos.x = s.pos.x + r * 3.2;
    p.pos.z = s.pos.z + r * 3.2;
    if (p.vel) { p.vel.x = 0; p.vel.y = 0; p.vel.z = 0; }
    return { id: s.id, r };
  }, STATION_ID);
  if (!park) throw new Error(`no ${STATION_ID} in this world`);
  report.park = park;

  const authoredDeadline = Date.now() + 240_000;
  while (Date.now() < authoredDeadline) {
    const state = await page.evaluate((id) => {
      const render = window.SF.registry.get('render');
      const root = render._meshes.get(id);
      return root && root.userData ? root.userData.authoredAssetState || 'none' : 'noroot';
    }, park.id);
    if (String(state).startsWith('authored')) break;
    await sleep(1500);
  }
  await sleep(1500);

  const zoom = Number(process.env.SF_CLEAR_ZOOM) || 0;
  if (zoom) await page.evaluate((level) => window.SF.bus.emit('camera:zoom', { level }), zoom);
  report.zoom = zoom || 'default';
  report.stationRoofAtCenter = await page.evaluate((id) => {
    const st = window.SF.state;
    const s = st.entities.get(id);
    const render = window.SF.registry.get('render');
    const f = render._cameraClearanceAt.roofAt;
    // The roof query lives in RENDER-LOCAL space (the chase-camera frame membrane re-origins the
    // scene near the player); a sim position must cross the membrane first or the query reads a
    // column ~1.5 km from the station and reports "no roof" for a body that is right there —
    // which is exactly what the 2026-09-29 report recorded (atCenter/atEdge/far all null with the
    // camera inside the model). Same conversion the renderer uses for table rows.
    const membrane = render._frameMembrane;
    const local = membrane && typeof membrane.toLocal === 'function'
      ? membrane.toLocal(s.pos, { x: 0, z: 0 })
      : { x: s.pos.x, z: s.pos.z };
    const root = render._meshes.get(id);
    const rootPos = root && root.position ? { x: root.position.x, z: root.position.z } : null;
    const stamp = root && root.userData ? {
      kind: root.userData.kind,
      state: root.userData.authoredAssetState || null,
      geometryPending: root.userData.geometryPending === true,
      box: root.userData.cameraClearanceBox && root.userData.cameraClearanceBox.box
        ? { maxY: root.userData.cameraClearanceBox.box.maxY, bvh: root.userData.cameraClearanceBox.bvhQuery === true }
        : null,
    } : null;
    const finite = (v) => (v === -Infinity ? null : v);
    return {
      simPos: { x: s.pos.x, z: s.pos.z },
      renderLocal: local,
      rootPos,
      stamp,
      atCenter: finite(f(local.x, local.z, 0)),
      atEdge: finite(f(local.x + 80, local.z, 0)),
      far: finite(f(local.x + 900, local.z, 0)),
    };
  }, park.id);
  console.log('[roof]', JSON.stringify(report.stationRoofAtCenter));
  await page.evaluate((id) => {
    const st = window.SF.state;
    window.__SF_CLEAR__.frames.length = 0;
    window.__SF_CLEAR__.on = true;
    st.nav.autopilot = { active: true, targetEntityId: id, target: null, label: 'clear-probe', arrivalRadius: 4, status: 'cruise' };
  }, park.id);

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await sleep(500);
    const near = await page.evaluate((id) => {
      const st = window.SF.state;
      const s = st.entities.get(id);
      const p = st.entities.get(st.playerId);
      return s && p ? Math.hypot(s.pos.x - p.pos.x, s.pos.z - p.pos.z) : null;
    }, park.id);
    console.log(`[flight] distance to structure ${near == null ? '?' : Math.round(near)}`);
    if (near != null && near < 12) break;
  }
  await sleep(2500);

  const frames = await page.evaluate(() => { window.__SF_CLEAR__.on = false; return window.__SF_CLEAR__.frames; });
  let inside = 0;
  let minMargin = Infinity;
  let peakY = 0;
  let peakScale = 1;
  let maxAccel = 0;
  for (let i = 0; i < frames.length; i++) {
    const [, , y, , roof, scale] = frames[i];
    if (roof != null) {
      const margin = y - roof;
      if (margin < minMargin) minMargin = margin;
      if (margin < -0.01) inside++;
    }
    if (y > peakY) peakY = y;
    if (scale > peakScale) peakScale = scale;
    if (i >= 2) {
      const dt1 = (frames[i][0] - frames[i - 1][0]) / 1000;
      const dt0 = (frames[i - 1][0] - frames[i - 2][0]) / 1000;
      if (dt1 > 0 && dt0 > 0) {
        const v1 = (frames[i][2] - frames[i - 1][2]) / dt1;
        const v0 = (frames[i - 1][2] - frames[i - 2][2]) / dt0;
        maxAccel = Math.max(maxAccel, Math.abs(v1 - v0) / ((dt1 + dt0) / 2));
      }
    }
  }
  const last = frames[frames.length - 1] || [];
  report.summary = {
    frames: frames.length,
    insideFrames: inside,
    minMarginWu: minMargin === Infinity ? null : +minMargin.toFixed(2),
    peakCameraY: Math.round(peakY),
    peakScale: +peakScale.toFixed(3),
    hardClampFrames: last[8] || 0,
    maxVerticalAccelWuS2: Math.round(maxAccel),
  };
  fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify({ ...report, frames: frames.length ? frames.filter((_, i) => i % 6 === 0) : [] }));
  fs.writeFileSync(path.join(OUT_DIR, 'report.md'), `# Camera clearance witness\n\n${JSON.stringify(report.summary, null, 2)}\n`);
  console.log('[summary]', JSON.stringify(report.summary));
  if (inside > 0) process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill();
}
