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

  // Relocation is an existing world-lane RPC.  The old probe wrote the mirrored player pose and
  // nav.autopilot directly; that only moved the main-side read model in worker mode, so the
  // camera could be watched for two minutes without the authoritative hull ever approaching.
  const park = await page.evaluate(async (id) => {
    const st = window.SF.state;
    let s = null;
    for (const e of st.entities.values()) {
      if (e.id === id || e.stationId === id || (e.data && e.data.stationId === id)) { s = e; break; }
    }
    if (!s) return null;
    const r = (s.data && s.data.dockRadius) || s.dockRadius || 90;
    const p = st.entities.get(st.playerId);
    if (!p || !p.pos) return { ok: false, reason: 'player-missing', id: s.id, r };

    // If a route variant leaves the player in the station shell, use the same public undock intent
    // as the flight input layer.  Do not emit dock:undocked directly: the station exit gate owns
    // the committed transition and its pause release.
    if (st.ui?.docked === true || p.flags?.docked === true) {
      window.SF.bus.emit('ui:undock');
      const undockDeadline = performance.now() + 5_000;
      while (window.SF.state?.ui?.docked === true && performance.now() < undockDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (window.SF.state?.ui?.docked === true) {
        return { ok: false, reason: 'undock-did-not-commit', id: s.id, r };
      }
    }

    const dx = s.pos.x - p.pos.x;
    const dz = s.pos.z - p.pos.z;
    const heading = Math.atan2(dz, dx);
    const world = window.SF.registry?.get?.('world');
    if (!world || typeof world.relocatePlayerInSector !== 'function') {
      return { ok: false, reason: 'world-relocation-rpc-missing', id: s.id, r };
    }
    const ack = await world.relocatePlayerInSector({
      x: s.pos.x + r * 3.2,
      z: s.pos.z + r * 3.2,
      heading,
    }, { reason: 'probe:camera-clearance' });
    if (!ack || ack.ok === false || (ack.result === false)) {
      return { ok: false, reason: 'world-relocation-refused', ack: ack || null, id: s.id, r };
    }
    return { ok: true, id: s.id, r, heading };
  }, STATION_ID);
  if (!park) throw new Error(`no ${STATION_ID} in this world`);
  if (park.ok !== true) throw new Error(`camera-clearance setup failed: ${park.reason}`);
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
    const s = st.entities.get(id);
    if (!s || !s.pos) throw new Error(`station ${id} disappeared before course arm`);
    window.__SF_CLEAR__.frames.length = 0;
    window.__SF_CLEAR__.on = true;
    // This is the same ui:setCourse event used by the public map/radar surfaces.  In worker mode
    // the event is forwarded to the simulation lane; no mirrored nav object is mutated here.
    window.SF.bus.emit('ui:setCourse', {
      type: 'station',
      pos: { x: s.pos.x, z: s.pos.z },
      targetEntityId: id,
      label: 'clear-probe',
      waypointKind: 'nav',
      arrivalRadius: 12,
      autopilot: true,
    });
  }, park.id);
  await page.waitForFunction((id) => {
    const ap = window.SF?.state?.nav?.autopilot;
    return ap?.active === true && (ap.targetEntityId === id || ap.target);
  }, park.id, { timeout: 30_000 });

  const deadline = Date.now() + 120_000;
  const approachRange = Math.max(32, Math.min(180, park.r * 1.5));
  let minDistance = Infinity;
  let lastDistance = null;
  let reachedApproach = false;
  while (Date.now() < deadline) {
    await sleep(500);
    const near = await page.evaluate((id) => {
      const st = window.SF.state;
      const s = st.entities.get(id);
      const p = st.entities.get(st.playerId);
      if (!s || !p) return null;
      const distance = Math.hypot(s.pos.x - p.pos.x, s.pos.z - p.pos.z);
      const ap = st.nav?.autopilot;
      return { distance, autopilotActive: ap?.active === true, status: ap?.status || null };
    }, park.id);
    lastDistance = near?.distance ?? null;
    if (Number.isFinite(lastDistance)) minDistance = Math.min(minDistance, lastDistance);
    console.log(`[flight] distance to structure ${lastDistance == null ? '?' : Math.round(lastDistance)}`);
    if (lastDistance != null && lastDistance <= approachRange) {
      reachedApproach = true;
      break;
    }
  }
  await sleep(2500);
  report.route = {
    approachRangeWu: approachRange,
    minDistanceWu: Number.isFinite(minDistance) ? +minDistance.toFixed(2) : null,
    lastDistanceWu: lastDistance == null ? null : +lastDistance.toFixed(2),
    reachedApproach,
  };

  const frames = await page.evaluate(() => { window.__SF_CLEAR__.on = false; return window.__SF_CLEAR__.frames; });
  let inside = 0;
  let minMargin = Infinity;
  let roofFrames = 0;
  let peakY = 0;
  let peakScale = 1;
  let maxAccel = 0;
  for (let i = 0; i < frames.length; i++) {
    const [, , y, , roof, scale] = frames[i];
    if (roof != null) {
      roofFrames++;
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
    roofFrames,
    minMarginWu: minMargin === Infinity ? null : +minMargin.toFixed(2),
    peakCameraY: Math.round(peakY),
    peakScale: +peakScale.toFixed(3),
    hardClampFrames: last[8] || 0,
    maxVerticalAccelWuS2: Math.round(maxAccel),
  };
  report.summary.routeCoverage = {
    reachedApproach,
    nonNullRoofMargin: roofFrames > 0 && minMargin !== Infinity,
    covered: reachedApproach && roofFrames > 0 && minMargin !== Infinity,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify({ ...report, frames: frames.length ? frames.filter((_, i) => i % 6 === 0) : [] }));
  fs.writeFileSync(path.join(OUT_DIR, 'report.md'), `# Camera clearance witness\n\n${JSON.stringify(report.summary, null, 2)}\n`);
  console.log('[summary]', JSON.stringify(report.summary));
  if (inside > 0 || report.summary.routeCoverage.covered !== true) process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill();
}
