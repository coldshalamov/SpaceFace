// Station-occlusion witness: does the chase frame lose the player's hull to station
// geometry on a real dock approach? Boots adventure (New Game), undocks, autopilots
// back to the home station, and samples every ~800 ms: camera pose, the structural
// clearance floor, and a camera->player raycast against structural roots.
//
//   node scripts/probe-station-occlusion.mjs            (headed)
//   node scripts/probe-station-occlusion.mjs --headless
//
// Writes .devshots/station-occlusion/report.json + PNGs for law-of-the-glass review.
// Host saturation makes frame numbers informational only.
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = path.join(ROOT, '.devshots', 'station-occlusion');
const HEADLESS = process.argv.includes('--headless');
const STATION_ID = process.env.SF_OCCL_STATION || 'station_helios';
const MAP_MODE = process.env.SF_OCCL_MAP === '1';
const { chromium } = await loadPlaywright();
const { resolveCorridorAxisWorld, resolveBerthWorld, resolveCollisionProxyManifest, effectiveCorridorBearingDeg } =
  await import(path.join(ROOT, 'src', 'data', 'collisionProxyManifests.js'));

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
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* not up yet */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
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
const report = { station: STATION_ID, samples: [], consoleErrors: [] };

try {
  await waitForServer(`http://127.0.0.1:${port}/`);
  browser = await chromium.launch({
    headless: HEADLESS,
    args: [
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--window-size=1600,900',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (error) => report.consoleErrors.push(`[pageerror] ${String(error).slice(0, 300)}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (text.includes('404') && /__spaceface_player_store/.test(msg.location()?.url || text)) return;
    report.consoleErrors.push(`[console] ${text.slice(0, 300)}`);
  });

  await page.addInitScript(() => {
    sessionStorage.setItem('sf.cinematicSeen', '1');
    try {
      if (!localStorage.getItem('sf.settings.profile.v1')) {
        localStorage.setItem('sf.settings.profile.v1', JSON.stringify({
          version: 1,
          settings: { accessibility: { motionPreference: 'system' }, video: { motionReduce: true } },
        }));
      }
    } catch (_) { /* storage unavailable */ }

    // One sample: camera pose, the structural clearance floor the camera consumed, the
    // station's authored state, and — only where a structural box pierces the segment —
    // the triangle-level hits that name the real occluder.
    window.__SF_OCCL_SAMPLE__ = () => {
      const SF = window.SF;
      const st = SF && SF.state;
      const render = SF && SF.registry && SF.registry.get && SF.registry.get('render');
      if (!SF || !st || !render) return { error: 'no state/render' };
      const THREE = SF.THREE;
      const player = st.entities && st.entities.get(st.playerId);
      const rig = render.cam || null;
      const cam = rig && (rig.isCamera ? rig : (rig.obj || rig.camera || rig.cam));
      if (!player || !player.pos || !cam) return { error: 'no player/camera' };
      cam.updateMatrixWorld();
      const camPos = cam.position;
      const p = new THREE.Vector3(player.pos.x, player.pos.y || 0, player.pos.z);
      const ndc = p.clone().project(cam);
      const floor = typeof render._cameraClearanceAt === 'function'
        ? render._cameraClearanceAt(camPos.x, camPos.z, camPos.y) : null;
      const segHits = [];
      const ray = new THREE.Ray(camPos.clone(), p.clone().sub(camPos).normalize());
      const distToPlayer = camPos.distanceTo(p);
      const box = new THREE.Box3();
      const raycaster = new THREE.Raycaster(camPos.clone(), ray.direction, 0.1, distToPlayer - 0.5);
      for (const [id, m] of render._meshes || []) {
        const kind = m && m.userData && m.userData.kind;
        if (!['station', 'place', 'asteroid', 'wreck'].includes(kind)) continue;
        box.setFromObject(m);
        if (box.isEmpty()) continue;
        const hit = ray.intersectBox(box, new THREE.Vector3());
        if (!hit) continue;
        const d = camPos.distanceTo(hit);
        if (d >= distToPlayer) continue;
        const real = raycaster.intersectObject(m, true)
          .filter((h) => h.object && h.object.visible !== false)
          .slice(0, 3)
          .map((h) => ({
            object: h.object.name || h.object.type,
            dist: Math.round(h.distance),
            parentChain: (() => { const c = []; let n = h.object; while (n && c.length < 5) { c.push(n.name || n.type); n = n.parent; } return c; })(),
          }));
        segHits.push({
          id, kind, name: m.name || '',
          authored: m.userData && m.userData.authoredAssetState,
          boxSpan: Math.round(Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z)),
          boxMaxY: Math.round(box.max.y), hitDist: Math.round(d), realHits: real,
        });
      }
      segHits.sort((a, b) => a.hitDist - b.hitDist);
      // Station root state + span for the decode story.
      let stationState = null;
      for (const [id, m] of render._meshes || []) {
        if (!m || !m.userData || m.userData.kind !== 'station') continue;
        const b = new THREE.Box3().setFromObject(m);
        stationState = {
          id, authored: m.userData.authoredAssetState || 'none',
          span: b.isEmpty() ? null : Math.round(Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z)),
          maxY: b.isEmpty() ? null : Math.round(b.max.y),
        };
        break;
      }
      return {
        playerPos: [Math.round(player.pos.x), Math.round(player.pos.z)],
        camPos: [Math.round(camPos.x), Math.round(camPos.y), Math.round(camPos.z)],
        clearanceFloor: floor === -Infinity ? 'none' : (floor == null ? 'n/a' : Math.round(floor)),
        playerNdc: [+ndc.x.toFixed(2), +ndc.y.toFixed(2), +ndc.z.toFixed(3)],
        occluders: segHits.slice(0, 6),
        stationState,
        mode: st.mode,
      };
    };
  });

  await page.goto(`http://127.0.0.1:${port}/?demo=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 150_000 });

  // Title -> New Game -> Launch (the adventure route; same verbs a player clicks).
  await page.waitForSelector('[data-action="newGame"]', { timeout: 60_000 });
  await page.click('[data-action="newGame"]');
  await page.waitForSelector('.sf-ng-launch:not([aria-disabled="true"])', { timeout: 60_000 });
  await page.click('.sf-ng-launch');
  await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 240_000 });
  await page.waitForFunction(() => Number.isFinite(window.SF.state.render
    && window.SF.state.render.firstPlayableFrameAt), null, { timeout: 180_000 });
  await sleep(4000); // let the camera settle + admission decode

  const station = await page.evaluate((id) => {
    const st = window.SF.state;
    for (const e of st.entities.values()) {
      if (e.id === id || e.stationId === id || (e.data && e.data.stationId === id)) {
        const pos = e.pos || e;
        return { id: e.id, x: pos.x, z: pos.z, dockRadius: e.dockRadius || (e.data && e.data.dockRadius) || (e.r || 90) };
      }
    }
    return null;
  }, STATION_ID);
  if (!station) throw new Error(`no ${STATION_ID} in this world`);
  report.stationPos = [Math.round(station.x), Math.round(station.z)];
  report.dockRadius = station.dockRadius;

  if (MAP_MODE) {
    // Park the player next to the station so the authored package commits during the wait.
    await page.evaluate(([id, sx, sz, r]) => {
      const st = window.SF.state;
      if (st.ui) { st.ui.docked = false; st.ui.dockedStationId = null; }
      window.SF.bus.emit('dock:undocked', { stationId: id });
      const p = st.entities.get(st.playerId);
      if (p && p.pos) {
        if (typeof p.pos.set === 'function') p.pos.set(sx + r * 2.4, 0, sz + r * 2.4);
        else { p.pos.x = sx + r * 2.4; p.pos.z = sz + r * 2.4; }
        if (p.vel) { p.vel.x = 0; p.vel.y = 0; p.vel.z = 0; }
      }
    }, [STATION_ID, station.x, station.z, station.dockRadius]);

    const authoredDeadline = Date.now() + 180_000;
    let stationData = null;
    while (Date.now() < authoredDeadline) {
      stationData = await page.evaluate((id) => {
        const st = window.SF.state;
        const render = window.SF.registry.get('render');
        let ent = null;
        for (const e of st.entities.values()) {
          if (e.id === id || e.stationId === id || (e.data && e.data.stationId === id)) { ent = e; break; }
        }
        if (!ent) return { error: 'no entity' };
        const root = render._meshes.get(ent.id);
        const state = root && root.userData ? root.userData.authoredAssetState || 'none' : 'noroot';
        return {
          state,
          pos: { x: ent.pos.x, z: ent.pos.z },
          rot: ent.rot || 0,
          dockRadius: (ent.data && ent.data.dockRadius) || null,
          collisionProxy: (ent.data && ent.data.collisionProxy) || null,
          corridorBearingDeg: (ent.data && ent.data.corridorBearingDeg) ?? null,
          placeScale: (ent.data && ent.data.placeScale) ?? null,
          authoredWorldScale: root && root.userData ? root.userData.authoredWorldScale ?? null : null,
        };
      }, STATION_ID);
      if (stationData && stationData.state && String(stationData.state).startsWith('authored')) break;
      await sleep(1500);
    }
    if (!stationData || stationData.error || !String(stationData.state).startsWith('authored')) {
      throw new Error(`station never committed authored visual: ${JSON.stringify(stationData)}`);
    }
    report.stationData = stationData;

    const fakeEntity = { pos: stationData.pos, rot: stationData.rot, data: { dockRadius: stationData.dockRadius, corridorBearingDeg: stationData.corridorBearingDeg, collisionProxy: stationData.collisionProxy } };
    const manifest = resolveCollisionProxyManifest(fakeEntity);
    const axis = resolveCorridorAxisWorld(fakeEntity, manifest);
    const berth = resolveBerthWorld(fakeEntity, manifest);
    const bearing = effectiveCorridorBearingDeg(manifest, fakeEntity);
    report.corridor = { bearingDeg: bearing, axis, berth };

    // Polar roof map + corridor-lane ceiling profile, raycast against the real authored meshes.
    const mapResult = await page.evaluate(([id, axisArg, berthArg, bearingArg]) => {
      const SF = window.SF;
      const st = SF.state;
      const render = SF.registry.get('render');
      const THREE = SF.THREE;
      let ent = null;
      for (const e of st.entities.values()) {
        if (e.id === id || e.stationId === id || (e.data && e.data.stationId === id)) { ent = e; break; }
      }
      const root = render._meshes.get(ent.id);
      if (!root) return { error: 'no root' };
      root.updateMatrixWorld(true);
      const sx = ent.pos.x, sz = ent.pos.z;
      const box = new THREE.Box3();
      // Every descendant object's world box — the coarse occupancy source.
      const children = [];
      root.traverse((o) => {
        if (!o.isMesh && !o.isLine && !o.isPoints) return;
        if (o.visible === false) return;
        box.setFromObject(o);
        if (box.isEmpty()) return;
        children.push({
          name: o.name || o.type,
          min: [Math.round(box.min.x - sx), Math.round(box.min.y), Math.round(box.min.z - sz)],
          max: [Math.round(box.max.x - sx), Math.round(box.max.y), Math.round(box.max.z - sz)],
        });
      });
      const raycaster = new THREE.Raycaster();
      const down = new THREE.Vector3(0, -1, 0);
      const dropRay = (wx, wz) => {
        raycaster.set(new THREE.Vector3(wx, 520, wz), down);
        raycaster.far = 600;
        const hits = raycaster.intersectObject(root, true).filter((h) => h.object && h.object.visible !== false);
        if (!hits.length) return null;
        const h = hits[0];
        return { ceiling: Math.round(h.point.y), object: h.object.name || h.object.type };
      };
      // Lane profile: along the corridor axis from berth out past the mouth, three lateral offsets.
      const lat = new THREE.Vector3(-axisArg.z, 0, axisArg.x);
      const lane = [];
      for (let d = 20; d <= 240; d += 10) {
        for (const off of [-25, 0, 25]) {
          const wx = sx + axisArg.x * d + lat.x * off;
          const wz = sz + axisArg.z * d + lat.z * off;
          lane.push({ d, off, ...(dropRay(wx, wz) || { ceiling: null }) });
        }
      }
      // Angular roof map at corridor-band radii.
      const rings = [];
      for (const r of [50, 70, 90, 110, 130, 160, 200, 260, 340, 430]) {
        const covered = [];
        const gaps = [];
        for (let deg = 0; deg < 360; deg += 4) {
          const a = deg * Math.PI / 180;
          const hit = dropRay(sx + Math.cos(a) * r, sz + Math.sin(a) * r);
          (hit && hit.ceiling > 18 ? covered : gaps).push(deg);
        }
        rings.push({ r, coveredPct: Math.round(covered.length / 90 * 100), coverArcs: arcsOf(covered), gapArcs: arcsOf(gaps) });
      }
      function arcsOf(degs) {
        if (!degs.length) return [];
        const set = new Set(degs);
        const arcs = [];
        let start = null;
        // unwrap: extend 0..359 linearly, merge wrap arc at the end
        for (let deg = 0; deg <= 360; deg += 4) {
          const inSet = set.has(deg % 360);
          if (inSet && start === null) start = deg;
          if (!inSet && start !== null) { arcs.push([start % 360, deg % 360]); start = null; }
        }
        if (arcs.length > 1 && set.has(0) && set.has(356)) {
          const first = arcs.shift(); const last = arcs.pop();
          arcs.unshift([last[0], first[1]]);
        }
        return arcs;
      }
      // Wall test: horizontal rays along the lane at ship height toward the core.
      const inward = [];
      for (const off of [-25, 0, 25]) {
        const from = new THREE.Vector3(sx + axisArg.x * 240 + lat.x * off, 8, sz + axisArg.z * 240 + lat.z * off);
        const dir = new THREE.Vector3(-axisArg.x, 0, -axisArg.z);
        raycaster.set(from, dir);
        raycaster.far = 230;
        const hits = raycaster.intersectObject(root, true)
          .filter((h) => h.object && h.object.visible !== false)
          .slice(0, 6)
          .map((h) => ({ d: Math.round(h.distance), y: Math.round(h.point.y), o: h.object.name || h.object.type }));
        inward.push({ off, hits });
      }
      return { children, lane, rings, inward, berthCeiling: dropRay(berthArg.x, berthArg.z) };
    }, [STATION_ID, axis, berth, bearing]);

    report.map = mapResult;
    fs.writeFileSync(path.join(OUT_DIR, 'map.json'), JSON.stringify(report, null, 1));
    const compact = mapResult.rings.map((r) => `r=${r.r} covered=${r.coveredPct}% gaps=${JSON.stringify(r.gapArcs)}`).join('\n');
    console.log(`corridor bearing ${bearing}deg; berth ceiling ${JSON.stringify(mapResult.berthCeiling)}\n${compact}`);
    console.log(`lane ceiling profile:\n` + mapResult.lane.filter((l) => l.off === 0).map((l) => `d=${l.d} ceil=${l.ceiling}`).join('\n'));
    console.log(`[map] wrote ${OUT_DIR}/map.json`);

    // Park the hull at a ring of bearings inside the footprint and photograph each frame —
    // the difference between "open deck lane" and "under the roof" is the fix decision.
    let mapShot = 0;
    for (const deg of [135, 165, 195, 250, 310]) {
      for (const r of [80, 140]) {
        await page.evaluate(([id, degArg, rArg]) => {
          const st = window.SF.state;
          let ent = null;
          for (const e of st.entities.values()) {
            if (e.id === id || e.stationId === id || (e.data && e.data.stationId === id)) { ent = e; break; }
          }
          const a = degArg * Math.PI / 180;
          const p = st.entities.get(st.playerId);
          const x = ent.pos.x + Math.cos(a) * rArg;
          const z = ent.pos.z + Math.sin(a) * rArg;
          if (typeof p.pos.set === 'function') p.pos.set(x, 0, z); else { p.pos.x = x; p.pos.z = z; }
          if (p.vel) { p.vel.x = 0; p.vel.y = 0; p.vel.z = 0; }
        }, [STATION_ID, deg, r]);
        await sleep(2600);
        const name = `map-${String(mapShot++).padStart(2, '0')}-b${deg}-r${r}.png`;
        await page.screenshot({ path: path.join(OUT_DIR, name) });
        console.log(`[map-shot] ${name}`);
      }
    }
  } else {

  // Undock the same way the walk does, park outside the dock ring, then let the real
  // autopilot fly the approach — the decode runway runs during the leg, so the authored
  // station is the mesh the camera actually meets.
  await page.evaluate(([id, sx, sz, r]) => {
    const st = window.SF.state;
    if (st.ui) { st.ui.docked = false; st.ui.dockedStationId = null; }
    window.SF.bus.emit('dock:undocked', { stationId: id });
    const p = st.entities.get(st.playerId);
    if (p && p.pos) {
      if (typeof p.pos.set === 'function') p.pos.set(sx + r * 3.2, 0, sz + r * 3.2);
      else { p.pos.x = sx + r * 3.2; p.pos.z = sz + r * 3.2; }
      if (p.vel) { p.vel.x = 0; p.vel.y = 0; p.vel.z = 0; }
    }
  }, [STATION_ID, station.x, station.z, station.dockRadius]);
  // The authored GLB decodes on its own runway; on software-GL hosts that takes minutes.
  // Hold at the park point until the committed visual is the one the camera meets, so
  // approach samples describe authored occlusion rather than the hidden-substrate gap.
  const authoredDeadline = Date.now() + 240_000;
  while (Date.now() < authoredDeadline) {
    const state = await page.evaluate((id) => {
      const st = window.SF.state;
      const render = window.SF.registry.get('render');
      for (const e of st.entities.values()) {
        if (e.id === id || e.stationId === id || (e.data && e.data.stationId === id)) {
          const root = render._meshes.get(e.id);
          return root && root.userData ? root.userData.authoredAssetState || 'none' : 'noroot';
        }
      }
      return 'noent';
    }, STATION_ID);
    if (String(state).startsWith('authored')) break;
    await sleep(1500);
  }
  await sleep(1500);
  await page.evaluate((id) => {
    const st = window.SF.state;
    let s = null;
    for (const e of st.entities.values()) {
      if (e.id === id || e.stationId === id || (e.data && e.data.stationId === id)) { s = e; break; }
    }
    st.nav.autopilot = s
      ? { active: true, targetEntityId: s.id, target: null, label: 'occl-probe', arrivalRadius: Math.max(30, (s.dockRadius || 90) * 0.8), status: 'cruise' }
      : { active: false, target: null, targetEntityId: null, label: '', arrivalRadius: 36, status: 'idle' };
  }, STATION_ID);

  let shotIdx = 0;
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    const s = await page.evaluate((id) => {
      const out = window.__SF_OCCL_SAMPLE__();
      const st = window.SF.state;
      const p = st.entities.get(st.playerId);
      let stE = null;
      for (const e of st.entities.values()) {
        if (e.id === id || e.stationId === id || (e.data && e.data.stationId === id)) { stE = e; break; }
      }
      const sp = stE && (stE.pos || stE);
      const pp = p && p.pos;
      out.distToStation = (sp && pp) ? Math.round(Math.hypot(sp.x - pp.x, sp.z - pp.z)) : null;
      return out;
    }, STATION_ID);
    if (s.error) throw new Error(s.error);
    s.occluded = s.occluders && s.occluders.some((o) => o.realHits && o.realHits.length > 0);
    report.samples.push(s);
    console.log(`[sample] d=${s.distToStation} camY=${s.camPos && s.camPos[1]} floor=${s.clearanceFloor} station=${s.stationState && s.stationState.authored}:${s.stationState && s.stationState.span} occl=${s.occluders ? s.occluders.length : '?'}`);
    if (s.occluded || (s.stationState && s.stationState.span > 300 && s.distToStation < s.stationState.span * 0.6)) {
      const name = `${String(shotIdx++).padStart(2, '0')}-d${s.distToStation}.png`;
      await page.screenshot({ path: path.join(OUT_DIR, name) });
      s.shot = name;
    }
    if (s.distToStation != null && s.distToStation < station.dockRadius) break;
    await sleep(800);
  }

  fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 1));
  const occludedCount = report.samples.filter((s) => s.occluded).length;
  console.log(`[done] ${report.samples.length} samples, ${occludedCount} occluded -> ${OUT_DIR}`);
  }
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill();
}
