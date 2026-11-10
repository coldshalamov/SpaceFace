// Authored-body appear-latency probe: on the real game route, measures for every
// authored entity — ship, station, wreck, drone, payload, fx, beacon — the frame
// it enters the camera frustum vs. the frame a real GL draw call lands for it in
// the presented scene pass, and WHY nothing drew in between. Companion to
// probe-asteroid-appear.mjs (which covers rocks); this covers the authored
// admission pipeline: marker/stand-in coverage, pending hides, queue waits.
//
//   node scripts/probe-authored-appear.mjs              (headed if browser found)
//   node scripts/probe-authored-appear.mjs --headless
//   --seed=4242 --flight-ms=120000
//
// "Drawn" ground truth: wraps renderer.renderBufferDirect (outermost, on top of
// the game's own guard wrappers) plus the WebGL2 draw functions, stamping the
// current Object3D whenever a real GL draw issues inside the presented pass
// (guard depth > 0, non depth/distance material).
//
// Output: .devshots/authored-appear/<stamp>.json
import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { cpus, loadavg } from 'node:os';
import { createServer as createNetServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const HEADLESS = process.argv.includes('--headless');
const browserPath = process.env.SF_PROBE_BROWSER
  || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find((candidate) => existsSync(candidate));
const SEED = Number((process.argv.find((arg) => arg.startsWith('--seed=')) || '--seed=4242').slice(7));
const FLIGHT_BUDGET_MS = Number(
  (process.argv.find((arg) => arg.startsWith('--flight-ms=')) || '--flight-ms=120000').slice(12));
if (!Number.isSafeInteger(SEED) || SEED <= 0 || !Number.isFinite(FLIGHT_BUDGET_MS)) {
  throw new Error('invalid seed or flight-ms');
}
const OUT_DIR = `${ROOT}.devshots/authored-appear`;
const POLL_MS = 110;
const { chromium } = await loadPlaywright();

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
}

async function waitForServer(url, timeoutMs = 30_000) {
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

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// ---------------------------------------------------------------------------
// In-page instrument. Self-contained: page.evaluate serializes the function
// source; nothing from module scope may be referenced inside.
// ---------------------------------------------------------------------------
async function installAuthoredAppearProbe() {
  const SF = window.SF;
  const THREE = SF && SF.THREE;
  if (!SF || !SF.state || !THREE) return { installed: false, reason: 'window.SF / SF.THREE unavailable' };
  const render = SF.registry && SF.registry.get('render');
  const renderer = render && render.renderer;
  const scene = render && render.scene;
  if (!renderer || !scene) return { installed: false, reason: 'no renderer/scene' };
  if (typeof renderer.renderBufferDirect !== 'function') {
    return { installed: false, reason: 'renderBufferDirect missing' };
  }

  const probe = {
    frame: 0,
    currentObject: null,
    currentMaterial: null,
    drawStamps: 0,
    stampedObjects: 0,
    glWrapped: [],
    rbdWrapped: false,
    stop: false,
    installedAt: performance.now(),
  };

  const innerRbd = renderer.renderBufferDirect;
  renderer.renderBufferDirect = function sfAuthoredAppearRbd(camera, sceneArg, geometry, material, object, group) {
    probe.currentObject = object || null;
    probe.currentMaterial = material || null;
    try {
      return innerRbd.call(this, camera, sceneArg, geometry, material, object, group);
    } finally {
      probe.currentObject = null;
      probe.currentMaterial = null;
    }
  };
  probe.rbdWrapped = true;

  const stampDraw = () => {
    const object = probe.currentObject;
    if (!object || object.isObject3D !== true) return;
    if (!((renderer.__sfUnreadyDrawGuardDepth | 0) > 0)) return;
    const material = probe.currentMaterial;
    const type = material && material.type;
    if (type && /Depth|Distance/.test(String(type))) return;
    if (object.__sfProbeDrawnFrame !== probe.frame) {
      object.__sfProbeDrawnFrame = probe.frame;
      probe.stampedObjects++;
    }
    probe.drawStamps++;
  };

  const gl = typeof renderer.getContext === 'function' ? renderer.getContext() : null;
  if (!gl) return { installed: false, reason: 'no gl context' };
  const GL_FNS = [
    'drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced',
    'drawRangeElements', 'drawElementsBaseVertex', 'drawArraysBaseVertex',
    'drawElementsInstancedBaseVertex', 'drawArraysInstancedBaseInstance',
  ];
  const wrapFn = (owner, name, label) => {
    if (!owner || typeof owner[name] !== 'function' || owner[name].__sfAppearWrapped === true) return;
    const original = owner[name];
    const wrapped = function wrappedDraw(...args) {
      const ret = original.apply(this, args);
      stampDraw();
      return ret;
    };
    wrapped.__sfAppearWrapped = true;
    owner[name] = wrapped;
    probe.glWrapped.push(label);
  };
  for (const name of GL_FNS) wrapFn(gl, name, `gl.${name}`);

  const TRACKED_TYPES = new Set(['ship', 'station', 'wreck', 'drone', 'payload', 'fx', 'beacon', 'place']);
  const rec = {
    frames: 0,
    episodes: [],
    counts: { onTime: 0, late: 0, leftUndrawn: 0, removedUndrawn: 0 },
    blinks: [],
    blinkCounts: {},
    lastUndrawn: { frame: -1, t: -1, count: 0, items: [] },
    peakUndrawn: { count: 0, frame: -1 },
    queueTimeline: [],
    errors: [],
  };
  const track = new Map();
  const frustum = new THREE.Frustum();
  const projView = new THREE.Matrix4();
  const sphere = new THREE.Sphere(new THREE.Vector3(), 1);
  const seenThisFrame = new Set();

  const chainVisible = (o) => {
    for (let n = o; n; n = n.parent) if (n.visible === false) return false;
    return true;
  };

  const openEpisode = (id, e, now, dist) => ({
    id,
    type: e.type,
    kind: (e.data && (e.data.defId || e.data.stationId || e.data.placeId || e.data.assetId)) || null,
    enteredAt: now,
    distAtEntry: dist,
    distAtDraw: null,
    undrawnFrames: 0,
    markerFrames: 0,
    drewMarker: false,
    reasons: {},
    firstReason: null,
    firstFlags: null,
    closedAt: null,
    closeKind: null,
    msLate: null,
    msUndrawn: null,
  });

  const closeEpisode = (t, now, closeKind) => {
    const ep = t.episode;
    if (!ep) return;
    ep.closedAt = now;
    ep.closeKind = closeKind;
    if (closeKind === 'onTime' || closeKind === 'late') {
      ep.msLate = Math.round(now - ep.enteredAt);
      rec.counts[closeKind]++;
    } else {
      ep.msUndrawn = Math.round(now - ep.enteredAt);
      rec.counts[closeKind === 'removedUndrawn' ? 'removedUndrawn' : 'leftUndrawn']++;
    }
    rec.episodes.push(ep);
    t.episode = null;
  };

  const rootFlags = (root, e, af) => {
    const ud = (root && root.userData) || {};
    const marker = ud.resolvingMarker || null;
    return {
      authoredAssetState: ud.authoredAssetState || null,
      geometryPending: ud.geometryPending === true,
      pipelinesPending: ud.pipelinesPending === true,
      sfAdmittedOnce: ud.sfAdmittedOnce === true,
      hasMarker: !!marker,
      markerVisible: !!(marker && marker.visible !== false && chainVisible(marker)),
      pendingFallbackDrawn: ud.authoredPendingFallbackDrawn === true,
      geologySkin: ud.authoredGeologySkin === true,
      inGlass: !!(af && af.renderGlassIds && typeof af.renderGlassIds.has === 'function'
        && af.renderGlassIds.has(e.id)),
      inRunway: !!(af && af.renderRunwayIds && typeof af.renderRunwayIds.has === 'function'
        && af.renderRunwayIds.has(e.id)),
      presentationTier: (e.activity && e.activity.presentationTier) || null,
    };
  };

  const _rootWorldPos = new THREE.Vector3();
  const evaluateItem = (id, e, frame, af, ox, oz) => {
    const root = (render._meshes && render._meshes.get(id)) || e.mesh || null;
    let stamped = false;
    let markerStamped = false;
    if (root && typeof root.traverse === 'function') {
      root.traverse((o) => {
        if (o.__sfProbeDrawnFrame === frame) {
          if (o.userData && o.userData.authoredResolvingMarker === true) markerStamped = true;
          else stamped = true;
        }
      });
    }
    const flags = rootFlags(root, e, af);
    if (markerStamped && !stamped) {
      return { drawn: true, via: 'marker', flags, root };
    }
    if (stamped) return { drawn: true, via: 'body', flags, root };
    const out = { drawn: false, reason: 'other', flags, root };
    if (!root) { out.reason = 'noMesh'; return out; }
    let top = root;
    while (top.parent) top = top.parent;
    if (top !== scene) { out.reason = 'detached'; return out; }
    if (!chainVisible(root)) {
      // The pending-hide is the pop class this probe exists to classify.
      if (flags.authoredAssetState === 'loading'
        || flags.authoredAssetState === 'awaiting-authored-admission'
        || flags.authoredAssetState === 'compiling-pipelines') {
        out.reason = flags.hasMarker ? 'pendingMarkerHidden' : 'pendingNoMarker';
      } else if (flags.pipelinesPending) {
        out.reason = 'pipelinesPending';
      } else if (flags.geometryPending) {
        out.reason = 'geometryPending';
      } else {
        out.reason = 'rootHidden';
      }
      return out;
    }
    // Root visible but nothing stamped. Before calling it a void, separate two
    // cases with the ROOT's own bounds — the episode's entry test uses the
    // entity's sim sphere (pos + radius), which undercovers a big authored hull:
    // at screen edges its real meshes cull off one by one (correct), or the
    // mesh sits somewhere the sim pos isn't (a real visibility miss).
    const bbox = new THREE.Box3();
    const rootSphere = new THREE.Sphere(new THREE.Vector3(), 1);
    try {
      root.updateWorldMatrix(true, true);
      bbox.setFromObject(root);
      if (!bbox.isEmpty()) {
        bbox.getBoundingSphere(rootSphere);
        root.getWorldPosition(_rootWorldPos);
        out.detail = {
          sphereRadius: Math.round(rootSphere.radius * 10) / 10,
          sphereInFrustum: frustum.intersectsSphere(rootSphere),
          rootPosDelta: Math.round(Math.hypot(
            _rootWorldPos.x - (e.pos.x - ox),
            _rootWorldPos.z - (e.pos.z - oz)) * 10) / 10,
          entityRadius: Number(e.radius) || null,
        };
        // The union sphere can intersect while every child culls on its own
        // bounds — count the visible drawables and how many intersect on their
        // own terms before calling this a real void.
        const childSphere = new THREE.Sphere(new THREE.Vector3(), 1);
        let visibleMeshes = 0;
        let meshesInFrustum = 0;
        let firstOffMesh = null;
        root.traverse((o) => {
          if (!(o.isMesh || o.isInstancedMesh) || o.visible === false || !o.geometry) return;
          if (!chainVisible(o)) return;
          visibleMeshes++;
          if (o.geometry.boundingSphere === null) {
            try { o.geometry.computeBoundingSphere(); } catch (_) { return; }
          }
          if (!o.geometry.boundingSphere) return;
          childSphere.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
          if (frustum.intersectsSphere(childSphere)) meshesInFrustum++;
          else if (!firstOffMesh) firstOffMesh = o.name || o.uuid.slice(0, 8);
        });
        out.detail.visibleMeshes = visibleMeshes;
        out.detail.meshesInFrustum = meshesInFrustum;
        out.detail.firstOffMesh = firstOffMesh;
        if (out.detail.sphereInFrustum === false) {
          out.reason = 'rootCulledByBounds';
          return out;
        }
        if (visibleMeshes > 0 && meshesInFrustum === 0) {
          out.reason = 'allMeshesCulled';
          return out;
        }
        if (visibleMeshes === 0) {
          out.reason = 'emptySubtree';
          return out;
        }
      } else {
        out.detail = { emptyBounds: true };
      }
    } catch (error) {
      out.detail = { boundsError: String(error && error.message ? error.message : error).slice(0, 120) };
    }
    if (flags.authoredAssetState) { out.reason = 'submittedNothing'; return out; }
    out.reason = 'visibleNotDrawn';
    return out;
  };

  const tick = () => {
    if (probe.stop) return;
    requestAnimationFrame(tick);
    const state = SF.state;
    const r = state && state.render;
    const camera = r && r.camera;
    if (!state || state.mode !== 'flight' || !r || !camera
        || !Number.isFinite(r.firstPlayableFrameAt)
        || !camera.projectionMatrix || !camera.matrixWorldInverse) return;
    const now = performance.now();
    const frame = probe.frame;
    rec.frames++;
    try {
      camera.updateMatrixWorld();
      projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(projView);
    } catch (error) {
      rec.errors.push(`frustum: ${String(error && error.message ? error.message : error).slice(0, 160)}`);
      return;
    }
    const origin = (state.world && state.world.frameOrigin) || { x: 0, z: 0 };
    const ox = Number(origin.x) || 0;
    const oz = Number(origin.z) || 0;
    const player = state.entities && state.entities.get(state.playerId);
    const px = player && player.pos ? player.pos.x : NaN;
    const pz = player && player.pos ? player.pos.z : NaN;
    const af = r.activityFrame || null;
    const undrawnNow = [];
    seenThisFrame.clear();

    if (rec.queueTimeline.length < 4000) {
      try {
        const q = scene.userData && scene.userData.authoredUpgradeDiagnostics;
        if (q) {
          rec.queueTimeline.push({
            t: Math.round(now - probe.installedAt),
            pending: q.jobsQueued ?? q.pending ?? null,
            inFlight: q.activeJobs ?? null,
            slots: q.activeAdmissionSlots ?? null,
          });
        }
      } catch (_) { /* diagnostics are best-effort */ }
    }

    const list = state.entityList || [];
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || e.alive === false || e.isPlayer === true || !e.pos) continue;
      if (!TRACKED_TYPES.has(e.type)) continue;
      const id = e.id;
      seenThisFrame.add(id);
      sphere.center.set(e.pos.x - ox, 0, e.pos.z - oz);
      sphere.radius = Math.max(1, Number(e.radius) || 1);
      const onScreen = frustum.intersectsSphere(sphere);
      let t = track.get(id);
      if (!onScreen) {
        if (t && t.episode) closeEpisode(t, now, 'leftUndrawn');
        if (t) { t.onScreen = false; t.seenDrawn = false; }
        continue;
      }
      const dist = Number.isFinite(px) ? Math.round(Math.hypot(e.pos.x - px, e.pos.z - pz)) : null;
      if (!t) { t = { episode: null, onScreen: false, seenDrawn: false }; track.set(id, t); }
      if (!t.episode) t.episode = openEpisode(id, e, now, dist);
      const ep = t.episode;
      const verdict = evaluateItem(id, e, frame, af, ox, oz);
      if (verdict.drawn) {
        if (verdict.via === 'marker') {
          ep.markerFrames++;
          ep.drewMarker = true;
        } else {
          ep.distAtDraw = dist;
          ep.drawVia = verdict.via;
          closeEpisode(t, now, ep.undrawnFrames === 0 ? 'onTime' : 'late');
        }
        t.seenDrawn = true;
      } else {
        ep.undrawnFrames++;
        ep.reasons[verdict.reason] = (ep.reasons[verdict.reason] || 0) + 1;
        if (ep.undrawnFrames === 1) {
          ep.firstReason = verdict.reason;
          ep.firstFlags = verdict.flags || null;
          ep.firstDetail = verdict.detail || null;
        }
        if (t.seenDrawn) {
          const bkey = `${e.type}`;
          const bc = rec.blinkCounts[bkey] || (rec.blinkCounts[bkey] = { n: 0, reasons: {} });
          bc.n++;
          bc.reasons[verdict.reason] = (bc.reasons[verdict.reason] || 0) + 1;
          if (rec.blinks.length < 200) {
            rec.blinks.push({
              id, type: e.type, frame,
              t: Math.round(now - probe.installedAt),
              reason: verdict.reason, flags: verdict.flags || null,
            });
          }
        }
        undrawnNow.push({ id, type: e.type, reason: verdict.reason, dist });
      }
      t.onScreen = true;
    }
    for (const [id, t] of track) {
      if (!seenThisFrame.has(id)) {
        if (t.episode) closeEpisode(t, now, 'removedUndrawn');
        t.onScreen = false;
        t.seenDrawn = false;
      }
    }
    rec.lastUndrawn = { frame, t: Math.round(now - probe.installedAt), count: undrawnNow.length, items: undrawnNow };
    if (undrawnNow.length > rec.peakUndrawn.count) {
      rec.peakUndrawn = { count: undrawnNow.length, frame };
    }
    probe.frame++;
  };
  requestAnimationFrame(tick);

  window.__SF_AUTHORED_PROBE__ = {
    probe, rec,
    stop() { probe.stop = true; },
  };
  return { installed: true, glWrapped: probe.glWrapped, rbdWrapped: probe.rbdWrapped };
}

// ---------------------------------------------------------------------------
// Boot + route
// ---------------------------------------------------------------------------
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
mkdirSync(OUT_DIR, { recursive: true });
const port = await freePort();
const server = spawn(process.execPath, ['server.js', String(port)], {
  cwd: ROOT,
  env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
server.stdout.on('data', () => {});
server.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));

let browser = null;
const errors = [];
try {
  await waitForServer(`http://127.0.0.1:${port}/`);
  browser = await chromium.launch({
    headless: HEADLESS,
    executablePath: browserPath || undefined,
    args: ['--ignore-gpu-blocklist', '--enable-webgl', '--disable-background-timer-throttling'],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (error) => errors.push(`pageerror: ${String(error).slice(0, 300)}`));

  await page.addInitScript((seed) => {
    try {
      sessionStorage.setItem('sf.cinematicSeen', '1');
      sessionStorage.setItem('sf.seed', String(seed));
    } catch (_) { /* storage unavailable */ }
  }, SEED);
  await page.goto(`http://127.0.0.1:${port}/?seed=${SEED}`, { waitUntil: 'domcontentloaded' });

  const clickButton = (label) => page.evaluate((wanted) => {
    const buttons = [...document.querySelectorAll('button')].filter((button) =>
      button.getClientRects().length && !button.disabled
      && getComputedStyle(button).visibility !== 'hidden');
    const match = buttons.find((button) => button.textContent.trim() === wanted)
      || buttons.find((button) => button.textContent.includes(wanted));
    if (!match) return false;
    match.click();
    return true;
  }, label);

  // Main menu -> New Game -> Launch -> flight.
  await page.waitForFunction(() => window.SF && window.SF.state, null, { timeout: 120_000 });
  for (let i = 0; i < 120; i++) {
    if (await clickButton('New Game')) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(800);
  for (let i = 0; i < 60; i++) {
    if (await clickButton('Launch')) break;
    await page.waitForTimeout(500);
  }
  await page.waitForFunction(() => window.SF.state.mode === 'flight'
    && window.SF.state.render && Number.isFinite(window.SF.state.render.firstPlayableFrameAt),
    null, { timeout: 180_000 });

  const install = await page.evaluate(installAuthoredAppearProbe);
  console.log(`  probe install: ${JSON.stringify(install)}`);
  if (!install.installed) throw new Error(`probe install failed: ${install.reason}`);

  // Ground-truth sanity: stamps are landing in the presented pass.
  await page.waitForTimeout(1500);
  const groundTruth = await page.evaluate(() => {
    const p = window.__SF_AUTHORED_PROBE__;
    return p ? { drawStamps: p.probe.drawStamps, stampedObjects: p.probe.stampedObjects } : null;
  });
  console.log(`  ground truth: ${JSON.stringify(groundTruth)}`);
  const groundTruthOk = !!(groundTruth && groundTruth.drawStamps > 0);

  // Calibrate the heading/steering signs like the asteroid probe does: sample
  // rot before/after a short 'a' pulse.
  const calA = await page.evaluate(() => {
    const p = window.SF.state.entities.get(window.SF.state.playerId);
    return { rot: p.rot, speed: Math.hypot(p.vel.x, p.vel.z) };
  });
  await page.keyboard.down('a');
  await page.waitForTimeout(400);
  await page.keyboard.up('a');
  const calB = await page.evaluate(() => {
    const p = window.SF.state.entities.get(window.SF.state.playerId);
    return { rot: p.rot };
  });
  const dRot = wrapAngle(calB.rot - calA.rot);
  const aSign = dRot > 0 ? -1 : 1; // same convention as the asteroid probe
  console.log(`  calibration: dRot=${(dRot * 180 / Math.PI).toFixed(1)}deg aSign=${aSign} speed=${calA.speed.toFixed(1)}`);

  const held = { w: false, a: false, d: false };
  const setHeld = async (next) => {
    for (const key of ['w', 'a', 'd']) {
      if (held[key] === next[key]) continue;
      held[key] = next[key];
      if (next[key]) await page.keyboard.down(key); else await page.keyboard.up(key);
    }
  };
  const releaseAll = () => setHeld({ w: false, a: false, d: false });

  const routeStart = Date.now();
  const phases = [];
  let routeDeadlineHit = false;

  // Leg list: nearest authored contacts, then an open cruise.
  const pickTargets = await page.evaluate(() => {
    const s = window.SF.state;
    const p = s.entities.get(s.playerId);
    const out = [];
    for (const e of s.entityList) {
      if (!e || e.alive === false || e.isPlayer === true || !e.pos) continue;
      if (!['ship', 'station', 'wreck', 'drone', 'payload', 'beacon'].includes(e.type)) continue;
      const dist = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
      if (dist < 100) continue;
      out.push({ id: e.id, type: e.type, x: e.pos.x, z: e.pos.z, dist: Math.round(dist) });
    }
    out.sort((a, b) => a.dist - b.dist);
    return out.slice(0, 4);
  });
  console.log(`  waypoints: ${JSON.stringify(pickTargets)}`);

  const fly = async ({ name, target, doneDist = 150, pastDist = null, limitMs }) => {
    const start = Date.now();
    let closest = Infinity;
    let lastDist = Infinity;
    let done = { reason: 'timeout' };
    while (Date.now() - start < limitMs && !routeDeadlineHit) {
      if (Date.now() - routeStart > FLIGHT_BUDGET_MS) { routeDeadlineHit = true; break; }
      const snap = await page.evaluate(() => {
        const s = window.SF.state;
        const p = s.entities.get(s.playerId);
        return {
          mode: s.mode, px: p.pos.x, pz: p.pos.z, rot: p.rot,
        };
      });
      if (snap.mode !== 'flight') { await releaseAll(); await page.waitForTimeout(POLL_MS); continue; }
      const aim = target;
      const dist = Math.hypot(aim.x - snap.px, aim.z - snap.pz);
      if (dist < closest) closest = dist;
      lastDist = dist;
      if (doneDist != null && dist <= doneDist) { done = { reason: `reached(<=${doneDist})` }; break; }
      if (pastDist != null && dist > closest + pastDist && closest < Infinity) {
        done = { reason: `passed(+${pastDist})` }; break;
      }
      const desired = Math.atan2(aim.z - snap.pz, aim.x - snap.px);
      const heading = snap.rot; // player nose points along velocity; rot≈heading near-cruise
      const err = wrapAngle(desired - heading);
      const aligned = Math.abs(err) < 0.5;
      await setHeld({
        w: aligned,
        a: aSign > 0 ? err > 0.10 : err < -0.10,
        d: aSign > 0 ? err < -0.10 : err > 0.10,
      });
      await page.waitForTimeout(POLL_MS);
    }
    await releaseAll();
    const rec2 = { phase: name, ms: Date.now() - start, endDist: Math.round(lastDist), minDist: Math.round(closest), done: done.reason };
    phases.push(rec2);
    console.log(`  ${name}: ${(rec2.ms / 1000).toFixed(1)}s end=${rec2.endDist} min=${rec2.minDist} done=${done.reason}`);
  };

  for (let i = 0; i < pickTargets.length && !routeDeadlineHit; i++) {
    const wp = pickTargets[i];
    await fly({ name: `approach-${wp.type}-${wp.id}`, target: wp, doneDist: 180, limitMs: 40_000 });
  }
  if (!routeDeadlineHit) {
    const ahead = await page.evaluate(() => {
      const s = window.SF.state;
      const p = s.entities.get(s.playerId);
      return { x: p.pos.x + Math.cos(p.rot) * 3000, z: p.pos.z + Math.sin(p.rot) * 3000 };
    });
    await fly({ name: 'open-cruise', target: ahead, pastDist: 400, limitMs: 40_000 });
  }
  await releaseAll();

  await page.evaluate(() => { window.__SF_AUTHORED_PROBE__.stop(); });
  const probeOut = await page.evaluate(() => {
    const pr = window.__SF_AUTHORED_PROBE__;
    return pr ? { rec: pr.rec, frame: pr.probe.frame, drawStamps: pr.probe.drawStamps } : null;
  });

  // --- Report ----------------------------------------------------------------
  const episodes = (probeOut && probeOut.rec.episodes) || [];
  const pct = (sorted, p) => (sorted.length
    ? Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(p / 100 * sorted.length) - 1)]) : null);
  const byType = {};
  for (const ep of episodes) {
    const row = byType[ep.type] || (byType[ep.type] = {
      episodes: 0, onTime: 0, late: 0, leftUndrawn: 0, removedUndrawn: 0,
      markerCovered: 0, lateMs: [], reasons: {},
    });
    row.episodes++;
    if (ep.closeKind === 'onTime') row.onTime++;
    else if (ep.closeKind === 'late') { row.late++; row.lateMs.push(ep.msLate); }
    else if (ep.closeKind === 'leftUndrawn') row.leftUndrawn++;
    else if (ep.closeKind === 'removedUndrawn') row.removedUndrawn++;
    if (ep.drewMarker) row.markerCovered++;
    for (const [reason, n] of Object.entries(ep.reasons || {})) {
      row.reasons[reason] = (row.reasons[reason] || 0) + n;
    }
  }
  const summaryByType = {};
  for (const [key, row] of Object.entries(byType)) {
    const sorted = [...row.lateMs].sort((a, b) => a - b);
    summaryByType[key] = {
      episodes: row.episodes, onTime: row.onTime, late: row.late,
      leftUndrawn: row.leftUndrawn, removedUndrawn: row.removedUndrawn,
      markerCovered: row.markerCovered,
      lateP50Ms: pct(sorted, 50), lateP95Ms: pct(sorted, 95),
      lateMaxMs: sorted.length ? sorted[sorted.length - 1] : null,
      reasons: row.reasons,
    };
  }
  const worst = [...episodes]
    .map((ep) => ({ ...ep, severity: ep.msLate != null ? ep.msLate : (ep.msUndrawn != null ? ep.msUndrawn + 1e7 : -1) }))
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 15)
    .map(({ severity, ...ep }) => ep);

  let head = null;
  try { head = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch (_) { /* no git */ }
  const report = {
    at: new Date().toISOString(),
    head,
    headless: HEADLESS,
    route: 'adventure', seed: SEED,
    groundTruth: { ok: groundTruthOk, ...groundTruth },
    phases,
    host: {
      cpu: (cpus()[0] && cpus()[0].model) || null,
      logicalCores: cpus().length,
      loadavg: loadavg(),
    },
    frames: probeOut ? probeOut.rec.frames : null,
    counts: probeOut ? probeOut.rec.counts : null,
    blinkCounts: probeOut ? probeOut.rec.blinkCounts : null,
    blinks: probeOut ? probeOut.rec.blinks.slice(0, 60) : [],
    peakUndrawn: probeOut ? probeOut.rec.peakUndrawn : null,
    queueTimeline: probeOut ? probeOut.rec.queueTimeline.slice(-400) : [],
    samplerErrors: probeOut ? probeOut.rec.errors : [],
    summaryByType,
    worstEpisodes: worst,
    episodes,
  };
  const outPath = `${OUT_DIR}/${stamp}.json`;
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log('\nauthored-appear probe');
  console.log(`  frames sampled: ${report.frames} drawStamps=${probeOut && probeOut.drawStamps}`
    + ` groundTruth=${groundTruthOk ? 'OK' : 'FAILED'}`);
  console.log(`  episodes: ${episodes.length}  counts=${JSON.stringify(report.counts)}`);
  console.log('  by type:');
  for (const [key, row] of Object.entries(summaryByType)) {
    console.log(`    ${key}: episodes=${row.episodes} onTime=${row.onTime} late=${row.late}`
      + ` left=${row.leftUndrawn} removed=${row.removedUndrawn} markerCovered=${row.markerCovered}`
      + ` p50=${row.lateP50Ms}ms p95=${row.lateP95Ms}ms max=${row.lateMaxMs}ms`
      + ` reasons=${JSON.stringify(row.reasons)}`);
  }
  if (worst.length) {
    console.log('  worst episodes:');
    for (const ep of worst.slice(0, 10)) {
      console.log(`    id=${ep.id} ${ep.type} close=${ep.closeKind} late=${ep.msLate}ms`
        + ` undrawnMs=${ep.msUndrawn} distAtEntry=${ep.distAtEntry}`
        + ` firstReason=${ep.firstReason} marker=${ep.drewMarker}`
        + ` flags=${ep.firstFlags ? JSON.stringify(ep.firstFlags) : 'null'}`);
    }
  }
  console.log(`  blinks: ${Object.keys(report.blinkCounts || {}).length ? JSON.stringify(report.blinkCounts) : 'none'}`);
  console.log(`  report: ${outPath}`);
  if (errors.length) console.log(`  page errors: ${JSON.stringify(errors.slice(0, 5))}`);
  if (!groundTruthOk) process.exitCode = 1;
} catch (error) {
  if (errors.length) console.log(`page errors: ${JSON.stringify(errors.slice(0, 10))}`);
  throw error;
} finally {
  if (browser) await browser.close();
  server.kill();
}
