// Asteroid appear-latency probe: on the real game route, measures for every
// asteroid — live entity and dormant field-ledger row alike — the frame it
// enters the camera frustum vs. the frame a real GL draw call is issued for
// it in the presented scene pass, and WHY nothing drew in between.
//
//   node scripts/probe-asteroid-appear.mjs              (headed, ~3-4 min)
//   node scripts/probe-asteroid-appear.mjs --headless
//   --seed=4242 --flight-ms=175000
//
// Boot mirrors probe-frame-solid.mjs (shared server.js, system Chrome/Edge,
// menu -> game:new -> flight). The instrument only observes; flight uses
// public controls (W thrust, A/D yaw). The dock/interact key is never pressed.
//
// "Drawn" ground truth: the probe wraps renderer.renderBufferDirect (outermost,
// on top of the game's own guard wrappers) to know which Object3D is being
// drawn, and the WebGL2 context draw functions to stamp that object whenever a
// real GL draw issues inside the presented pass (guard depth > 0, non
// depth/distance material). If the game's unready-program guard refuses the
// draw, no GL call happens and the object is correctly NOT stamped.
//
// Output: .devshots/asteroid-appear/<stamp>.json + screenshots in the same folder.
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
// No simLane param by default — the game's own lane default is what the user
// plays. --sim-lane=worker|main forces it for A/B runs.
const SIM_LANE = (process.argv.find((arg) => arg.startsWith('--sim-lane=')) || '').slice(11) || null;
if (SIM_LANE && !['main', 'worker'].includes(SIM_LANE)) throw new Error('invalid sim-lane');
const FLIGHT_BUDGET_MS = Number(
  (process.argv.find((arg) => arg.startsWith('--flight-ms=')) || '--flight-ms=175000').slice(12));
if (!Number.isSafeInteger(SEED) || SEED <= 0 || !Number.isFinite(FLIGHT_BUDGET_MS)) {
  throw new Error('invalid seed or flight-ms');
}
const OUT_DIR = `${ROOT}.devshots/asteroid-appear`;
const POLL_MS = 110;
const MAX_SHOTS = 6;
const SHOT_MIN_GAP_MS = 1000;
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
// In-page instrument. Must stay self-contained: page.evaluate serializes the
// function source; nothing from module scope may be referenced inside.
// ---------------------------------------------------------------------------
async function installAsteroidAppearProbe() {
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
  const poolModule = await import('/src/render/asteroidInstancePool.js');
  const membership = poolModule.asteroidInstanceMembership;

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

  // Outermost renderBufferDirect wrapper: installed after flight starts, so it
  // sits on top of the game's unready-draw guard and perf-counter wrappers.
  const innerRbd = renderer.renderBufferDirect;
  renderer.renderBufferDirect = function sfAsteroidAppearRbd(camera, sceneArg, geometry, material, object, group) {
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
    // Only the presented scene pass is bracketed by the guard depth; admission's
    // off-camera touches and warmup submissions run with depth 0.
    if (!((renderer.__sfUnreadyDrawGuardDepth | 0) > 0)) return;
    const material = probe.currentMaterial;
    const type = material && material.type;
    if (type && /Depth|Distance/.test(String(type))) return; // shadow/depth pass
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
    'drawElementsInstancedBaseVertexBaseInstance', 'drawArraysInstancedBaseInstance',
    'multiDrawElementsWEBGL', 'multiDrawArraysWEBGL',
    'multiDrawElementsInstancedWEBGL', 'multiDrawArraysInstancedWEBGL',
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
  try {
    const ext = renderer.extensions && typeof renderer.extensions.get === 'function'
      ? renderer.extensions.get('WEBGL_multi_draw') : null;
    if (ext && typeof ext === 'object') {
      for (const name of [
        'multiDrawElementsWEBGL', 'multiDrawArraysWEBGL',
        'multiDrawElementsInstancedWEBGL', 'multiDrawArraysInstancedWEBGL',
      ]) wrapFn(ext, name, `ext.${name}`);
    }
    const extBase = renderer.extensions && typeof renderer.extensions.get === 'function'
      ? renderer.extensions.get('WEBGL_multi_draw_instanced_base_vertex_base_instance') : null;
    if (extBase && typeof extBase === 'object') {
      for (const name of [
        'multiDrawElementsInstancedBaseVertexBaseInstanceWEBGL',
        'multiDrawArraysInstancedBaseInstanceWEBGL',
      ]) wrapFn(extBase, name, `extBase.${name}`);
    }
  } catch (_) { /* extension surface absent — the gl.* set still covers it */ }

  const rec = {
    frames: 0,
    episodes: [],
    counts: { onTime: 0, late: 0, leftUndrawn: 0, removedUndrawn: 0 },
    lanes: [],
    lastUndrawn: { frame: -1, t: -1, count: 0, items: [] },
    peakUndrawn: { count: 0, frame: -1 },
    populations: { liveMax: 0, dormantMax: 0 },
    blinks: [],
    blinkCounts: {},
    promotions: [],
    ramTimeline: [],
    ramPromotedAt: null,
    errors: [],
  };
  probe.ramTargetId = null;
  const track = new Map();
  const frustum = new THREE.Frustum();
  const projView = new THREE.Matrix4();
  const sphere = new THREE.Sphere(new THREE.Vector3(), 1);
  const seenThisFrame = new Set();
  let lastLaneAt = 0;

  const kindOf = (data) => (data && data.opticStructureId
    ? `optic:${data.opticMaterial || 'unknown'}`
    : `rock:${(data && data.typeId) || 'unknown'}`);

  // Dormant rows freeze their stored pos at shelf time; drift rows keep moving
  // (ledgerAwarePos does the same ballistic projection the renderer's feed uses).
  const rowPos = (row, simTime, out) => {
    const last = Number.isFinite(row.lastExactT) ? row.lastExactT : simTime;
    const drift = Math.max(0, simTime - last);
    out.x = (Number(row.pos && row.pos.x) || 0) + (Number(row.vel && row.vel.x) || 0) * drift;
    out.z = (Number(row.pos && row.pos.z) || 0) + (Number(row.vel && row.vel.z) || 0) * drift;
    return out;
  };
  const rowPosScratch = { x: 0, z: 0 };

  const openEpisode = (id, item, now, dist) => ({
    id,
    kind: item.kind,
    dormantAtEntry: item.dormant,
    dormantAtDraw: null,
    enteredAt: now,
    distAtEntry: dist,
    distAtDraw: null,
    undrawnFrames: 0,
    drawnFrames: 0,
    reasons: {},
    firstReason: null,
    firstFlags: null,
    firstDetail: null,
    firstDebug: null,
    promotedDuringEpisode: false,
    promoteReason: null,
    closedAt: null,
    closeKind: null,
    closeDetail: null,
    msLate: null,
    msUndrawn: null,
  });

  const closeEpisode = (t, now, closeKind, closeDetail) => {
    const ep = t.episode;
    if (!ep) return;
    ep.closedAt = now;
    ep.closeKind = closeKind;
    ep.closeDetail = closeDetail || null;
    if (closeKind === 'onTime' || closeKind === 'late') {
      ep.msLate = Math.round(now - ep.enteredAt);
      rec.counts[closeKind === 'onTime' ? 'onTime' : 'late']++;
    } else {
      ep.msUndrawn = Math.round(now - ep.enteredAt);
      rec.counts[closeKind === 'removedUndrawn' ? 'removedUndrawn' : 'leftUndrawn']++;
    }
    rec.episodes.push(ep);
    t.episode = null;
  };

  const rootFlags = (root, id, item, af) => {
    const ud = root.userData || {};
    const activity = (item.entity && item.entity.activity) || (item.row && item.row.activity) || null;
    return {
      geometryPending: ud.geometryPending === true,
      pipelinesPending: ud.pipelinesPending === true,
      sfAdmittedOnce: ud.sfAdmittedOnce === true,
      authoredAssetState: ud.authoredAssetState || null,
      inGlass: !!(af && af.renderGlassIds && typeof af.renderGlassIds.has === 'function'
        && af.renderGlassIds.has(id)),
      inRunway: !!(af && af.renderRunwayIds && typeof af.renderRunwayIds.has === 'function'
        && af.renderRunwayIds.has(id)),
      presentationTier: (activity && activity.presentationTier) || null,
      simTier: (activity && activity.simTier) || null,
    };
  };

  // Ground-truth drawn verdict, then (when undrawn) the first failing reason.
  const evaluateItem = (id, item, frame, af) => {
    const meshes = render._meshes;
    const root = (meshes && meshes.get(id)) || item.mesh || null;
    let subtreeStamped = false;
    if (root && typeof root.traverse === 'function') {
      root.traverse((o) => {
        if (subtreeStamped) return;
        if ((o.isMesh || o.isInstancedMesh) && o.__sfProbeDrawnFrame === frame) subtreeStamped = true;
      });
    }
    const pool = render._asteroidInstancePool || null;
    const mem = membership(pool, id);
    const owned = pool && pool.byEntity && pool.byEntity.get(id);
    const bucket = owned && owned.bucket;
    let bucketStamped = false;
    if (bucket) {
      if (bucket.mesh && bucket.mesh.__sfProbeDrawnFrame === frame) bucketStamped = true;
      const retiringMesh = bucket.retiring && bucket.retiring.mesh;
      if (!bucketStamped && retiringMesh && retiringMesh.__sfProbeDrawnFrame === frame) bucketStamped = true;
    }
    const memOut = {
      registered: mem.registered === true,
      submitted: mem.submitted === true,
      submittedIndex: mem.submittedIndex,
      variant: mem.variant ?? null,
      adopted: mem.adopted === true,
    };
    if (subtreeStamped || (mem.registered && mem.submitted && bucketStamped)) {
      return { drawn: true, via: subtreeStamped ? 'subtree' : 'bucket', mem: memOut, root };
    }
    const out = { drawn: false, reason: 'other', flags: null, detail: null, mem: memOut, root };
    if (!root) { out.reason = 'noMesh'; return out; }
    let top = root;
    while (top.parent) top = top.parent;
    if (top !== scene) { out.reason = 'detached'; return out; }
    out.flags = rootFlags(root, id, item, af);
    let hidden = false;
    for (let node = root; node; node = node.parent) {
      if (node.visible === false) { hidden = true; break; }
    }
    if (hidden) { out.reason = 'rootHidden'; return out; }
    if (!mem.registered) { out.reason = 'poolNotRegistered'; return out; }
    out.detail = {
      membership: {
        variant: mem.variant ?? null,
        adopted: mem.adopted === true,
        submittedIndex: mem.submittedIndex,
        poolMeshUuid: mem.poolMeshUuid || null,
      },
    };
    if (!mem.submitted) { out.reason = 'poolNotSubmitted'; return out; }
    const bucketMesh = bucket && bucket.mesh;
    const bucketDrawable = !!(bucketMesh && bucketMesh.visible !== false
      && (bucketMesh.count == null || bucketMesh.count > 0));
    if (!bucketDrawable) {
      out.reason = 'poolMeshHidden';
      out.detail.bucket = {
        meshExists: !!bucketMesh,
        visible: bucketMesh ? bucketMesh.visible !== false : null,
        count: bucketMesh ? bucketMesh.count : null,
        pipelinesPending: !!(bucketMesh && bucketMesh.userData && bucketMesh.userData.pipelinesPending),
      };
      return out;
    }
    const material = (bucketMesh && bucketMesh.material) || (bucket && bucket.material) || null;
    let program = null;
    try {
      const props = material && renderer.properties && typeof renderer.properties.get === 'function'
        ? renderer.properties.get(material) : null;
      const current = props && props.currentProgram;
      program = {
        hasProgram: !!current,
        ready: current && typeof current.isReady === 'function' ? current.isReady() === true : null,
      };
    } catch (error) {
      program = { error: String(error && error.message ? error.message : error).slice(0, 160) };
    }
    out.reason = 'programUnready';
    out.detail.material = { type: material ? String(material.type || null) : null, program };
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
    const frame = probe.frame; // stamps from the presented pass carry this value
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
    const simTime = Number.isFinite(state.simTime) ? state.simTime : (state.tick | 0) / 60;
    const af = r.activityFrame || null;
    const field = state.world && state.world.asteroidField;
    const rocks = field && Array.isArray(field.rocks) ? field.rocks : [];
    const undrawnNow = [];
    let onScreenCount = 0;
    let dormantOnScreen = 0;
    let liveOnScreen = 0;
    seenThisFrame.clear();

    const visit = (id, item) => {
      const pos = item.pos;
      if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return;
      seenThisFrame.add(id);
      sphere.center.set(pos.x - ox, 0, pos.z - oz);
      sphere.radius = Math.max(1, Number(item.radius) || 1);
      const onScreen = frustum.intersectsSphere(sphere);
      let t = track.get(id);
      if (!onScreen) {
        if (t && t.episode) closeEpisode(t, now, 'leftUndrawn', 'leftFrustum');
        if (t) { t.onScreen = false; t.seenDrawn = false; }
        return;
      }
      onScreenCount++;
      if (item.dormant) dormantOnScreen++; else liveOnScreen++;
      const dist = Number.isFinite(px) ? Math.round(Math.hypot(pos.x - px, pos.z - pz)) : null;
      if (!t) {
        t = { episode: null, onScreen: false, dormantPrev: item.dormant, rowRef: item.row || null };
        track.set(id, t);
      }
      if (t.dormantPrev === true && item.dormant === false) {
        const priorRow = t.rowRef;
        const reason = (priorRow && priorRow.promoteReason)
          || (priorRow && priorRow.liveEntityId != null ? 'promoted' : 'unknown');
        t.promotedAt = now;
        t.promoteReason = reason;
        rec.promotions.push({ id, t: Math.round(now - probe.installedAt), reason, kind: item.kind });
        if (t.episode) {
          t.episode.promotedDuringEpisode = true;
          t.episode.promoteReason = reason;
        }
      }
      if (!t.episode) t.episode = openEpisode(id, item, now, dist);
      const ep = t.episode;
      const verdict = evaluateItem(id, item, frame, af);
      // Blink: previously drawn on this on-screen stint, undrawn this frame.
      if (verdict.drawn) {
        t.seenDrawn = true;
      } else if (t.seenDrawn) {
        const bkey = `${item.kind}|${item.dormant ? 'dormant' : 'live'}`;
        const bc = rec.blinkCounts[bkey] || (rec.blinkCounts[bkey] = { n: 0, reasons: {}, promotedWithin1s: 0 });
        bc.n++;
        bc.reasons[verdict.reason] = (bc.reasons[verdict.reason] || 0) + 1;
        const promotedMsAgo = t.promotedAt != null ? Math.round(now - t.promotedAt) : null;
        if (promotedMsAgo != null && promotedMsAgo < 1000) bc.promotedWithin1s++;
        if (rec.blinks.length < 200) {
          rec.blinks.push({
            id, kind: item.kind, dormant: item.dormant, frame,
            t: Math.round(now - probe.installedAt),
            reason: verdict.reason,
            flags: verdict.flags || null,
            promotedMsAgo,
          });
        }
      }
      // Ram-target frame timeline (driver sets probe.ramTargetId).
      if (probe.ramTargetId === id && rec.ramTimeline.length < 2400) {
        const rud = (verdict.root && verdict.root.userData) || {};
        rec.ramTimeline.push({
          t: Math.round(now - probe.installedAt), frame,
          drawn: verdict.drawn === true,
          reason: verdict.drawn ? null : verdict.reason,
          dormant: item.dormant,
          dist,
          geometryPending: rud.geometryPending === true,
          pipelinesPending: rud.pipelinesPending === true,
          admittedOnce: rud.sfAdmittedOnce === true,
          pool: verdict.mem || null,
        });
        if (t.promotedAt != null && rec.ramPromotedAt == null) {
          rec.ramPromotedAt = Math.round(t.promotedAt - probe.installedAt);
        }
      }
      if (verdict.drawn) {
        ep.drawnFrames++;
        ep.dormantAtDraw = item.dormant;
        ep.distAtDraw = dist;
        ep.drawVia = verdict.via;
        closeEpisode(t, now, ep.undrawnFrames === 0 ? 'onTime' : 'late', 'drawn');
      } else {
        ep.undrawnFrames++;
        ep.reasons[verdict.reason] = (ep.reasons[verdict.reason] || 0) + 1;
        if (ep.undrawnFrames === 1) {
          ep.firstReason = verdict.reason;
          ep.firstFlags = verdict.flags || null;
          ep.firstDetail = verdict.detail || null;
          try {
            ep.firstDebug = typeof r.debugGeometryPending === 'function'
              ? r.debugGeometryPending(id) : 'debugGeometryPending unavailable';
          } catch (error) {
            ep.firstDebug = `error: ${String(error && error.message ? error.message : error).slice(0, 160)}`;
          }
        }
        undrawnNow.push({
          id, kind: item.kind, dormant: item.dormant,
          reason: verdict.reason, dist,
          gx: Math.round(pos.x * 10) / 10, gz: Math.round(pos.z * 10) / 10,
        });
      }
      t.onScreen = true;
      t.dormantPrev = item.dormant;
      if (item.row) t.rowRef = item.row;
    };

    const list = state.entityList || [];
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || e.alive === false || e.type !== 'asteroid' || !e.pos) continue;
      // Worker lane: dormant field rows arrive in entityList as fieldResident
      // mirrors (the aux channel); world.asteroidField stays empty on the facade.
      const dormant = e.fieldResident === true;
      visit(e.id, {
        entity: e, row: dormant ? e : null, dormant,
        kind: kindOf(e.data), pos: e.pos, radius: e.radius, mesh: e.mesh || null,
      });
      if (dormant) rec.dormantPopulation = (rec.dormantPopulation || 0) + 1;
    }
    rec.populations.dormantMax = Math.max(rec.populations.dormantMax, (rec.dormantPopulation || 0) + rocks.length);
    rec.dormantPopulation = 0;
    for (let i = 0; i < rocks.length; i++) {
      const row = rocks[i];
      if (!row || row.alive === false || row.liveEntityId != null || !row.pos) continue;
      // A same-tick promotion resolves the id to the live entity; the entity leg
      // already visited it.
      if (seenThisFrame.has(row.id)) continue;
      const pos = rowPos(row, simTime, rowPosScratch);
      visit(row.id, {
        entity: null, row, dormant: true,
        kind: kindOf(row.data), pos: { x: pos.x, z: pos.z }, radius: row.radius,
        mesh: row.mesh || null,
      });
    }
    // Rows/entities that vanished entirely while an episode was open.
    for (const [id, t] of track) {
      if (!seenThisFrame.has(id)) {
        if (t.episode) closeEpisode(t, now, 'removedUndrawn', 'rowOrEntityGone');
        t.onScreen = false;
        t.seenDrawn = false;
      }
    }
    rec.lastUndrawn = { frame, t: Math.round(now - probe.installedAt), count: undrawnNow.length, items: undrawnNow };
    if (undrawnNow.length > rec.peakUndrawn.count) {
      rec.peakUndrawn = { count: undrawnNow.length, frame };
    }
    if (onScreenCount > rec.maxOnScreen) rec.maxOnScreen = onScreenCount;
    rec.maxOnScreen = Math.max(rec.maxOnScreen || 0, onScreenCount);
    rec.liveOnScreenMax = Math.max(rec.liveOnScreenMax || 0, liveOnScreen);
    rec.dormantOnScreenMax = Math.max(rec.dormantOnScreenMax || 0, dormantOnScreen);

    // Lane depth sample every 250 ms.
    if (now - lastLaneAt >= 250) {
      lastLaneAt = now;
      const queue = render._meshBuildQueue;
      const head = render._meshBuildQueueHead | 0;
      const held = renderer.userData && renderer.userData.spacefacePendingPipelineSubjects;
      const queuePos = {};
      if (Array.isArray(queue)) {
        for (const u of undrawnNow.slice(0, 16)) {
          const idx = queue.indexOf(u.id);
          queuePos[u.id] = idx >= 0 ? idx - head : -1;
        }
      }
      rec.lanes.push({
        t: Math.round(now - probe.installedAt),
        meshBuildQueue: Array.isArray(queue) ? queue.length - head : null,
        pipelineSubjects: held && typeof held.size === 'number' ? held.size : null,
        onScreen: onScreenCount,
        undrawn: undrawnNow.length,
        queuePos,
      });
    }
    probe.frame++;
  };
  requestAnimationFrame(tick);

  const validate = () => {
    let stamped = 0;
    let drawableMeshes = 0;
    scene.traverse((o) => {
      if (o.isMesh || o.isInstancedMesh) {
        drawableMeshes++;
        if (o.__sfProbeDrawnFrame === probe.frame || o.__sfProbeDrawnFrame === probe.frame - 1) stamped++;
      }
    });
    const pool = render._asteroidInstancePool || null;
    let buckets = 0;
    let bucketsVisible = 0;
    let bucketsStamped = 0;
    if (pool) {
      const all = [];
      if (Array.isArray(pool.variants)) for (const b of pool.variants) if (b) all.push(b);
      if (pool.keyed && typeof pool.keyed.values === 'function') for (const b of pool.keyed.values()) all.push(b);
      for (const bucket of all) {
        if (!bucket || !bucket.mesh) continue;
        buckets++;
        if (bucket.mesh.visible !== false && bucket.mesh.count > 0) bucketsVisible++;
        if (bucket.mesh.__sfProbeDrawnFrame === probe.frame || bucket.mesh.__sfProbeDrawnFrame === probe.frame - 1) bucketsStamped++;
      }
    }
    let registered = 0;
    let submitted = 0;
    if (pool && pool.byEntity) {
      registered = pool.byEntity.size;
      for (const owned of pool.byEntity.values()) {
        if (owned && owned.bucket && owned.bucket.entityIds && owned.bucket.entityIds.includes(owned.record && owned.record.entityId)) submitted++;
      }
    }
    return {
      frame: probe.frame,
      drawStamps: probe.drawStamps,
      stampedObjects: probe.stampedObjects,
      stampedMeshesInScene: stamped,
      drawableMeshes,
      buckets, bucketsVisible, bucketsStamped,
      poolRegistered: registered, poolSubmitted: submitted,
      glWrapped: probe.glWrapped.slice(),
      guardDepth: renderer.__sfUnreadyDrawGuardDepth,
      presentCount: SF.state.render && SF.state.render.presentCount,
    };
  };

  // Current undrawn set with projected screen positions for screenshot metadata.
  const snapshot = () => {
    const items = (rec.lastUndrawn && rec.lastUndrawn.items) || [];
    const camera = SF.state.render && SF.state.render.camera;
    const origin = (SF.state.world && SF.state.world.frameOrigin) || { x: 0, z: 0 };
    const w = window.innerWidth || 1600;
    const h = window.innerHeight || 900;
    const v = new THREE.Vector3();
    const out = { frame: rec.lastUndrawn.frame, t: rec.lastUndrawn.t, count: items.length, items: [] };
    for (const it of items) {
      let sx = null;
      let sy = null;
      let behind = null;
      try {
        v.set(it.gx - (Number(origin.x) || 0), 0, it.gz - (Number(origin.z) || 0)).project(camera);
        sx = Math.round((v.x * 0.5 + 0.5) * w);
        sy = Math.round((1 - (v.y * 0.5 + 0.5)) * h);
        behind = v.z > 1;
      } catch (_) { /* camera unavailable */ }
      out.items.push({
        id: it.id, kind: it.kind, dormant: it.dormant, reason: it.reason,
        dist: it.dist, x: sx, y: sy, behind,
      });
    }
    return out;
  };

  window.__SF_ASTEROID_PROBE__ = {
    probe,
    rec,
    validate,
    snapshot,
    stop: () => { probe.stop = true; },
  };
  return { installed: true, glWrapped: probe.glWrapped.length, rbdWrapped: probe.rbdWrapped };
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------
const port = await freePort();
const server = spawn(process.execPath, ['server.js', String(port)], {
  cwd: ROOT,
  stdio: 'ignore',
  env: {
    ...process.env,
    SPACEFACE_PLAYER_STORE_DIR: '',
    SPACEFACE_USER_CONTENT_DIR: '',
  },
});
let browser = null;
const consoleErrors = [];
const dumpErrors = () => {
  if (!consoleErrors.length) return;
  console.log(`  page errors (${consoleErrors.length}):`);
  for (const e of consoleErrors.slice(0, 12)) console.log(`    ${e}`);
};
try {
  const baseUrl = `http://127.0.0.1:${port}/`;
  await waitForServer(baseUrl);
  browser = await chromium.launch({
    headless: HEADLESS,
    executablePath: browserPath || undefined,
    args: [
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--window-size=1600,900',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (error) => consoleErrors.push(`[pageerror] ${String(error).slice(0, 300)}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    if (msg.location()?.url?.includes('__spaceface_player_store')) return;
    consoleErrors.push(`[${msg.type()}] ${msg.text().slice(0, 300)}`);
  });
  await page.addInitScript(() => {
    for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
      const original = console[method].bind(console);
      console[method] = (...args) => original(...args.map((arg) => (
        typeof arg === 'string' && arg.length > 4096 ? `${arg.slice(0, 4096)}…[+${arg.length - 4096} chars]` : arg
      )));
    }
    try {
      sessionStorage.setItem('sf.cinematicSeen', '1');
    } catch (_) { /* storage unavailable */ }
    window.__SF_CONTEXT_LOSSES__ = 0;
    document.addEventListener('webglcontextlost', () => { window.__SF_CONTEXT_LOSSES__++; }, true);
    try { localStorage.removeItem('sf.simLane'); } catch (_) { /* storage gated */ }
  });
  await page.goto(SIM_LANE ? `${baseUrl}?simLane=${SIM_LANE}` : baseUrl,
    { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 300_000 });
  await page.bringToFront();

  await page.evaluate((seed) => window.SF.bus.emit('game:new', { name: 'Asteroid Appear', seed }), SEED);
  await page.waitForFunction(() => {
    const state = window.SF && window.SF.state;
    return state && state.mode === 'flight'
      && Number.isFinite(state.render && state.render.firstPlayableFrameAt);
  }, null, { timeout: 600_000 });

  const routeIdentity = await page.evaluate(() => ({
    seed: window.SF.state.meta && window.SF.state.meta.seed,
    sector: window.SF.state.world && window.SF.state.world.currentSectorId,
    entities: window.SF.state.entityList.filter((e) => e && e.alive !== false).length,
    fieldRocks: (window.SF.state.world.asteroidField && window.SF.state.world.asteroidField.rocks || []).length,
    fieldResidentMirrors: window.SF.state.entityList.filter((e) => e && e.alive !== false && e.fieldResident === true).length,
    simLaneDiag: (window.SF.state && window.SF.state.simLaneDiag) || (window.SF.ctx && window.SF.ctx.simLane) || null,
  }));
  // Lane tell: the facade's asteroidField.rocks is populated only on the main
  // lane; on the worker lane dormant rows ride the aux read model instead.
  routeIdentity.laneGuess = SIM_LANE
    || (routeIdentity.fieldRocks > 0 || routeIdentity.fieldResidentMirrors === 0 ? 'main?' : 'worker?');
  console.log(`route=adventure seed=${SEED} simLane=${SIM_LANE} ${JSON.stringify(routeIdentity)}`);

  const install = await page.evaluate(installAsteroidAppearProbe);
  console.log(`  probe install: ${JSON.stringify(install)}`);
  if (!install || install.installed !== true) {
    throw new Error(`probe install failed: ${JSON.stringify(install)}`);
  }

  // Ground-truth validation: give the presented pass a second, then confirm
  // ordinary drawables get stamped.
  await page.waitForTimeout(1500);
  const validation = await page.evaluate(() => window.__SF_ASTEROID_PROBE__.validate());
  console.log(`  ground truth: ${JSON.stringify(validation)}`);
  const groundTruthOk = !!(validation && validation.drawStamps > 0
    && (validation.stampedMeshesInScene > 0 || validation.bucketsStamped > 0));
  if (!groundTruthOk) {
    console.warn('  WARNING: draw stamp never fired — the "drawn" ground truth is suspect.');
  }

  const gpuRenderer = await page.evaluate(() => {
    try {
      const gl = document.createElement('canvas').getContext('webgl2');
      const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : null;
    } catch (_) { return null; }
  });

  // --- Sector staging ---------------------------------------------------------
  // The adventure spawn sector (helios_prime) seeds only live asteroids — no
  // dormant field rows and no optic lattice — so it cannot reproduce the
  // reported defect. Stage into the Ceres belt via the same worldCall lane the
  // frame-solid ceres route uses, then relocate ~1.6 kWU off the nearest diamond
  // lattice cell so the approach happens under public controls.
  const STAGE_SECTOR = 'sector_ceres_belt';
  const staging = { sector: STAGE_SECTOR, enterSector: 'skipped', relocate: 'skipped' };
  await page.evaluate(async (sectorId) => {
    const { laneCommandSink, laneRpc } = await import('/src/core/simLaneCommands.js');
    if (laneCommandSink()) {
      await laneRpc('worldCall', { method: 'enterSector', sectorId });
    } else {
      window.SF.registry.get('world').enterSector(sectorId);
    }
  }, STAGE_SECTOR);
  staging.enterSector = 'ok';
  // Wait for the belt's dormant field to materialize: rocks plus at least one
  // diamond lattice cell. Dormant rows surface two ways: world.asteroidField.
  // rocks on the main lane, or fieldResident mirrors inside entityList when the
  // sim runs on the worker lane (the aux channel).
  const staged = await page.waitForFunction(() => {
    const s = window.SF && window.SF.state;
    if (!s || !s.entityList) return null;
    let rocks = 0;
    let diamond = 0;
    const table = s.world && s.world.asteroidField && s.world.asteroidField.rocks;
    if (Array.isArray(table)) {
      for (const row of table) {
        if (!row || row.alive === false) continue;
        rocks++;
        if (row.data && row.data.opticStructureId && row.data.opticMaterial === 'diamond') diamond++;
      }
    }
    for (const e of s.entityList) {
      if (!e || e.alive === false || e.type !== 'asteroid') continue;
      if (e.fieldResident === true) rocks++;
      if (e.data && e.data.opticStructureId && e.data.opticMaterial === 'diamond') diamond++;
    }
    return (rocks > 0 || diamond > 0) ? { rocks, diamond } : null;
  }, null, { timeout: 120_000, polling: 500 }).then((h) => h.jsonValue()).catch(() => null);
  staging.fieldAfterEnter = staged;
  console.log(`  staging: enterSector ${STAGE_SECTOR} -> ${JSON.stringify(staged)}`);
  if (!staged) {
    console.warn('  WARNING: no dormant field / diamond lattice materialized — route will degrade');
  }

  // Relocate outside the nearest diamond lattice so every cell starts dormant
  // and out of the decode disc, with the lattice dead ahead for the approach.
  const relocatedTo = await page.evaluate(() => {
    const s = window.SF.state;
    const p = s.entities.get(s.playerId);
    const eachAsteroid = (cb) => {
      for (const e of s.entityList) {
        if (e && e.alive !== false && e.type === 'asteroid' && e.pos) cb(e);
      }
      const table = s.world && s.world.asteroidField && s.world.asteroidField.rocks;
      if (Array.isArray(table)) {
        for (const row of table) {
          if (row && row.alive !== false && row.liveEntityId == null && row.pos && !s.entities.get(row.id)) cb(row);
        }
      }
    };
    // Nearest diamond cell, then the whole structure's extent so the spawn
    // clears every cell, not just the closest one.
    let nearest = null;
    let nearestD = Infinity;
    eachAsteroid((row) => {
      const data = row.data;
      if (!data || !data.opticStructureId || data.opticMaterial !== 'diamond') return;
      const d = Math.hypot(row.pos.x - p.pos.x, row.pos.z - p.pos.z);
      if (d < nearestD) { nearestD = d; nearest = row; }
    });
    if (!nearest) return null;
    const structureId = nearest.data.opticStructureId;
    let cx = 0;
    let cz = 0;
    let n = 0;
    let extent = 0;
    const cells = [];
    eachAsteroid((row) => {
      if (!row.data || row.data.opticStructureId !== structureId) return;
      cells.push(row);
      cx += row.pos.x; cz += row.pos.z; n++;
    });
    cx /= n; cz /= n;
    for (const row of cells) extent = Math.max(extent, Math.hypot(row.pos.x - cx, row.pos.z - cz));
    // Standoff: full lattice extent + 3 kWU — outside the optic decode disc so
    // every lattice cell stays dormant until the flown approach.
    const dx = p.pos.x - cx;
    const dz = p.pos.z - cz;
    const d = Math.hypot(dx, dz) || 1;
    const standoff = extent + 3000;
    const pose = {
      x: cx + (dx / d) * standoff,
      z: cz + (dz / d) * standoff,
      heading: Math.atan2(-dz, -dx), // nose at the lattice
    };
    return { pose, structureId, cells: n, extent: Math.round(extent), centroid: { x: cx, z: cz } };
  });
  if (relocatedTo) {
    await page.evaluate(async (pose) => {
      const { laneCommandSink, laneRpc } = await import('/src/core/simLaneCommands.js');
      if (laneCommandSink()) {
        await laneRpc('worldCall', { method: 'relocatePlayerInSector', pose, opts: { reason: 'asteroid-appear-stage' } });
      } else {
        window.SF.registry.get('world').relocatePlayerInSector(pose, { reason: 'asteroid-appear-stage' });
      }
    }, relocatedTo.pose);
    staging.relocate = `ok -> (${Math.round(relocatedTo.pose.x)}, ${Math.round(relocatedTo.pose.z)})`
      + ` heading=${relocatedTo.pose.heading.toFixed(2)} structure=${relocatedTo.structureId}`
      + ` cells=${relocatedTo.cells} extent=${relocatedTo.extent}`;
    await page.waitForTimeout(1200);
  }

  // --- Heading calibration --------------------------------------------------
  // rot-vs-velocity offset: thrust briefly, then compare vel bearing to rot.
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1400);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(250);
  const calThrust = await page.evaluate(() => {
    const p = window.SF.state.entities.get(window.SF.state.playerId);
    return p && p.pos && p.vel ? { rot: p.rot, vx: p.vel.x, vz: p.vel.z, speed: Math.hypot(p.vel.x, p.vel.z) } : null;
  });
  let headingOffset = 0;
  if (calThrust && calThrust.speed > 0.5) {
    headingOffset = wrapAngle(Math.atan2(calThrust.vz, calThrust.vx) - calThrust.rot);
  }
  // Yaw sign for A: hold A briefly, observe rot delta.
  const rotBefore = calThrust ? calThrust.rot : 0;
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(350);
  await page.keyboard.up('KeyA');
  const rotAfterA = await page.evaluate(() => {
    const p = window.SF.state.entities.get(window.SF.state.playerId);
    return p ? p.rot : 0;
  });
  const aSign = Math.sign(wrapAngle(rotAfterA - rotBefore)) || -1;
  console.log(`  calibration: headingOffset=${(headingOffset * 180 / Math.PI).toFixed(1)}deg`
    + ` aSign=${aSign} (cal rot=${calThrust ? calThrust.rot.toFixed(3) : '?'} speed=${calThrust ? calThrust.speed.toFixed(1) : '?'})`);

  // --- Waypoint planning ----------------------------------------------------
  const waypoints = await page.evaluate(() => {
    const s = window.SF.state;
    const p = s.entities.get(s.playerId);
    const px = p.pos.x;
    const pz = p.pos.z;
    const out = { player: { x: px, z: pz }, diamond: null, cluster: null };
    // Nearest diamond optic lattice cell (dormant row or live entity).
    let best = null;
    let bestD = Infinity;
    const consider = (id, data, pos) => {
      if (!data || !data.opticStructureId || data.opticMaterial !== 'diamond' || !pos) return;
      const d = Math.hypot(pos.x - px, pos.z - pz);
      if (d < bestD) { bestD = d; best = { id, x: pos.x, z: pos.z, structureId: data.opticStructureId }; }
    };
    const field = s.world && s.world.asteroidField;
    const rocks = field && Array.isArray(field.rocks) ? field.rocks : [];
    for (const row of rocks) {
      if (row && row.alive !== false && row.liveEntityId == null) consider(row.id, row.data, row.pos);
    }
    for (const e of s.entityList) {
      if (e && e.alive !== false && e.type === 'asteroid') consider(e.id, e.data, e.pos);
    }
    if (best) out.diamond = { ...best, startDist: Math.round(bestD) };

    // Optic cell positions first — the ordinary-rock cluster must sit >= 600 WU
    // clear of every lattice cell so its episodes start as plain dormant rocks.
    const opticCells = [];
    const collectOptic = (row) => {
      if (row && row.data && row.data.opticStructureId && row.pos) opticCells.push(row.pos);
    };
    for (const row of rocks) {
      if (row && row.alive !== false && row.liveEntityId == null) collectOptic(row);
    }
    for (const e of s.entityList) {
      if (e && e.alive !== false && e.type === 'asteroid') collectOptic(e);
    }
    const clearOfOptics = (x, z) => {
      for (const oc of opticCells) {
        if (Math.hypot(x - oc.x, z - oc.z) < 600) return false;
      }
      return true;
    };
    // Densest nearby cluster of NON-optic dormant field rows: 400-WU cells, the
    // winner's 3x3 neighborhood count decides.
    const CELL = 400;
    const cells = new Map();
    const rows2 = [];
    const addRow = (row) => {
      const x = row.pos.x;
      const z = row.pos.z;
      if (Math.hypot(x - px, z - pz) > 9000) return;
      if (row.data && row.data.opticStructureId) return; // not ordinary
      if (!clearOfOptics(x, z)) return;
      rows2.push({ x, z });
      const key = `${Math.floor(x / CELL)}:${Math.floor(z / CELL)}`;
      let cell = cells.get(key);
      if (!cell) { cell = { cx: Math.floor(x / CELL), cz: Math.floor(z / CELL), n: 0 }; cells.set(key, cell); }
      cell.n++;
    };
    for (const row of rocks) {
      if (row && row.alive !== false && row.liveEntityId == null && row.pos) addRow(row);
    }
    for (const e of s.entityList) {
      // dormant mirrors on the worker lane only; live entities are not "field rows"
      if (e && e.alive !== false && e.type === 'asteroid' && e.fieldResident === true && e.pos) addRow(e);
    }
    let bestCell = null;
    let bestCount = 0;
    for (const cell of cells.values()) {
      let n = 0;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const other = cells.get(`${cell.cx + dx}:${cell.cz + dz}`);
          if (other) n += other.n;
        }
      }
      if (n > bestCount) { bestCount = n; bestCell = cell; }
    }
    if (bestCell) {
      let cx = 0;
      let cz = 0;
      let n = 0;
      for (const row of rows2) {
        if (Math.floor(row.x / CELL) === bestCell.cx && Math.floor(row.z / CELL) === bestCell.cz) {
          cx += row.x; cz += row.z; n++;
        }
      }
      if (n > 0) {
        out.cluster = {
          x: cx / n, z: cz / n, rowsInCell: n, rowsWithin800: bestCount,
          startDist: Math.round(Math.hypot(cx / n - px, cz / n - pz)),
        };
      }
    }
    return out;
  });
  console.log(`  waypoints: ${JSON.stringify(waypoints)}`);

  // --- Steering -------------------------------------------------------------
  const held = { w: false, a: false, d: false };
  const setHeld = async (want) => {
    if (want.w !== held.w) { held.w = want.w; await (want.w ? page.keyboard.down('KeyW') : page.keyboard.up('KeyW')); }
    if (want.a !== held.a) { held.a = want.a; await (want.a ? page.keyboard.down('KeyA') : page.keyboard.up('KeyA')); }
    if (want.d !== held.d) { held.d = want.d; await (want.d ? page.keyboard.down('KeyD') : page.keyboard.up('KeyD')); }
  };
  const releaseAll = () => setHeld({ w: false, a: false, d: false });

  const shots = [];
  let lastShotAt = 0;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  mkdirSync(OUT_DIR, { recursive: true });
  const maybeScreenshot = async (snap) => {
    if (!(snap.undrawnCount > 0)) return;
    if (shots.length >= MAX_SHOTS) return;
    if (Date.now() - lastShotAt < SHOT_MIN_GAP_MS) return;
    lastShotAt = Date.now();
    let meta = null;
    try {
      meta = await page.evaluate(() => window.__SF_ASTEROID_PROBE__.snapshot());
    } catch { /* snapshot failed — still take the shot */ }
    const file = `${OUT_DIR}/${stamp}-shot${shots.length}.png`;
    try {
      await page.screenshot({ path: file });
      shots.push({
        file: `${stamp}-shot${shots.length}.png`,
        undrawnCount: meta ? meta.count : snap.undrawnCount,
        frame: meta ? meta.frame : snap.frame,
        items: meta ? meta.items : null,
      });
      console.log(`  shot ${shots.length}: ${snap.undrawnCount} undrawn on screen -> ${file}`);
    } catch (error) {
      console.warn(`  screenshot failed: ${error && error.message ? error.message : error}`);
    }
  };

  const poll = async () => {
    const snap = await page.evaluate(() => {
      const s = window.SF && window.SF.state;
      if (!s) return { mode: 'gone' };
      const p = s.entities && s.entities.get(s.playerId);
      const pr = window.__SF_ASTEROID_PROBE__;
      return {
        mode: s.mode,
        px: p && p.pos ? p.pos.x : NaN,
        pz: p && p.pos ? p.pos.z : NaN,
        rot: p ? p.rot : NaN,
        vx: p && p.vel ? p.vel.x : 0,
        vz: p && p.vel ? p.vel.z : 0,
        frames: pr ? pr.rec.frames : -1,
        episodes: pr ? pr.rec.episodes.length : -1,
        undrawnCount: pr && pr.rec.lastUndrawn ? pr.rec.lastUndrawn.count : -1,
        peakUndrawn: pr && pr.rec.peakUndrawn ? pr.rec.peakUndrawn.count : -1,
      };
    });
    return snap;
  };

  const phases = [];
  const modeLeaves = [];
  const routeStart = Date.now();
  let routeDeadlineHit = false;

  const fly = async ({ name, target, doneDist, pastDist, limitMs }) => {
    const start = Date.now();
    let closest = Infinity;
    let lastDist = NaN;
    let loggedMode = null;
    const aimOffset = pastDist != null ? 150 : 0;
    // Aim at a point offset to the side of the target so it crosses the frame.
    let aim = { x: target.x, z: target.z };
    if (aimOffset) {
      const first = await poll();
      if (Number.isFinite(first.px)) {
        const dx = target.x - first.px;
        const dz = target.z - first.pz;
        const d = Math.hypot(dx, dz) || 1;
        aim = { x: target.x + (-dz / d) * aimOffset, z: target.z + (dx / d) * aimOffset };
      }
    }
    const done = { reason: 'timeout' };
    while (Date.now() - start < limitMs) {
      if (Date.now() - routeStart > FLIGHT_BUDGET_MS) { routeDeadlineHit = true; done.reason = 'budget'; break; }
      const snap = await poll();
      if (snap.mode !== 'flight') {
        if (snap.mode !== loggedMode) {
          loggedMode = snap.mode;
          modeLeaves.push({ phase: name, mode: snap.mode, at: Date.now() - start });
          console.log(`  ${name}: mode=${snap.mode} — releasing keys, waiting for flight`);
        }
        await releaseAll();
        await page.waitForTimeout(POLL_MS);
        continue;
      }
      loggedMode = null;
      if (!Number.isFinite(snap.px)) { await page.waitForTimeout(POLL_MS); continue; }
      const dist = Math.hypot(target.x - snap.px, target.z - snap.pz);
      if (dist < closest) closest = dist;
      if (doneDist != null && dist <= doneDist) { done.reason = `dist<${doneDist}`; lastDist = dist; break; }
      if (pastDist != null && dist > closest + pastDist && closest < Infinity) {
        done.reason = `passed(+${pastDist} past closest ${Math.round(closest)})`; lastDist = dist; break;
      }
      lastDist = dist;
      // Steer the nose toward the aim point; thrust once roughly aligned.
      const desired = Math.atan2(aim.z - snap.pz, aim.x - snap.px);
      const heading = snap.rot + headingOffset;
      const err = wrapAngle(desired - heading);
      const aligned = Math.abs(err) < 0.5;
      await setHeld({
        w: aligned,
        a: aSign > 0 ? err > 0.10 : err < -0.10,
        d: aSign > 0 ? err < -0.10 : err > 0.10,
      });
      await maybeScreenshot(snap);
      await page.waitForTimeout(POLL_MS);
    }
    await releaseAll();
    const rec = { phase: name, ms: Date.now() - start, endDist: Math.round(lastDist || 0), minDist: Math.round(closest), done: done.reason, aim };
    phases.push(rec);
    console.log(`  ${name}: ${(rec.ms / 1000).toFixed(1)}s end=${rec.endDist} min=${rec.minDist} done=${done.reason}`);
    return rec;
  };

  // --- Route ----------------------------------------------------------------
  if (waypoints.diamond) {
    await fly({ name: 'diamond-passby', target: waypoints.diamond, pastDist: 400, limitMs: 65_000 });
    await fly({ name: 'diamond-return', target: waypoints.diamond, doneDist: 70, limitMs: 55_000 });
  } else {
    console.log('  no diamond optic lattice found — skipping waypoint 1');
    phases.push({ phase: 'diamond-passby', skipped: 'no diamond lattice found' });
  }
  if (waypoints.cluster && !routeDeadlineHit) {
    await fly({ name: 'cluster-passby', target: waypoints.cluster, pastDist: 400, limitMs: 55_000 });
    if (!routeDeadlineHit) {
      await fly({ name: 'cluster-return', target: waypoints.cluster, doneDist: 120, limitMs: 45_000 });
    }
  } else if (!routeDeadlineHit) {
    // Fallback: cruise straight ahead through whatever field is there.
    const ahead = await page.evaluate(() => {
      const s = window.SF.state;
      const p = s.entities.get(s.playerId);
      const heading = p.rot;
      return { x: p.pos.x + Math.cos(heading) * 2500, z: p.pos.z + Math.sin(heading) * 2500 };
    });
    await fly({ name: 'open-cruise', target: ahead, pastDist: 400, limitMs: 45_000 });
  }

  // --- Ram leg: a dormant ordinary rock (radius >= 8) near the cluster,
  // flown straight into until it promotes. -------------------------------
  const ramTarget = await page.evaluate(() => {
    const s = window.SF.state;
    const p = s.entities.get(s.playerId);
    let best = null;
    let bestD = Infinity;
    const consider = (row) => {
      if (!row || row.alive === false || !row.pos) return;
      if (row.data && row.data.opticStructureId) return; // ordinary rocks only
      if (!(Number(row.radius) >= 8)) return;
      const d = Math.hypot(row.pos.x - p.pos.x, row.pos.z - p.pos.z);
      if (d < bestD) { bestD = d; best = row; }
    };
    const rocks = s.world && s.world.asteroidField && s.world.asteroidField.rocks;
    if (Array.isArray(rocks)) {
      for (const row of rocks) if (row && row.liveEntityId == null) consider(row);
    }
    for (const e of s.entityList) {
      if (e && e.alive !== false && e.type === 'asteroid' && e.fieldResident === true) consider(e);
    }
    return best ? { id: best.id, x: best.pos.x, z: best.pos.z, radius: best.radius, dist: Math.round(bestD) } : null;
  });
  let ramResult = null;
  if (ramTarget && !routeDeadlineHit) {
    await page.evaluate((id) => { window.__SF_ASTEROID_PROBE__.probe.ramTargetId = id; }, ramTarget.id);
    console.log(`  ram target id=${ramTarget.id} r=${ramTarget.radius} dist=${ramTarget.dist}`);
    const start = Date.now();
    let contact = null;
    let contactPos = null;
    let contactDir = null;
    let loggedMode = null;
    while (Date.now() - start < 40_000 && !routeDeadlineHit) {
      if (Date.now() - routeStart > FLIGHT_BUDGET_MS) { routeDeadlineHit = true; break; }
      const snap = await page.evaluate((ramId) => {
        const s = window.SF.state;
        const p = s.entities.get(s.playerId);
        const row = s.world && s.world.asteroidField && s.world.asteroidField.byId
          ? s.world.asteroidField.byId.get(ramId) : null;
        const live = s.entities.get(ramId);
        const promoted = !!(live && live.alive !== false && live.fieldResident !== true)
          || (!row && !!live);
        const pos = (row && row.alive !== false && row.pos)
          ? { x: row.pos.x + (row.vel ? row.vel.x * Math.max(0, s.simTime - (row.lastExactT || s.simTime)) : 0),
              z: row.pos.z + (row.vel ? row.vel.z * Math.max(0, s.simTime - (row.lastExactT || s.simTime)) : 0) }
          : (live && live.pos ? { x: live.pos.x, z: live.pos.z } : null);
        return {
          mode: s.mode, px: p.pos.x, pz: p.pos.z, rot: p.rot,
          vx: p.vel ? p.vel.x : 0, vz: p.vel ? p.vel.z : 0,
          tx: pos && pos.x, tz: pos && pos.z, promoted,
          undrawnCount: window.__SF_ASTEROID_PROBE__.rec.lastUndrawn.count,
        };
      }, ramTarget.id);
      if (snap.mode !== 'flight') {
        if (snap.mode !== loggedMode) { loggedMode = snap.mode; console.log(`  ram: mode=${snap.mode}`); }
        await releaseAll(); await page.waitForTimeout(POLL_MS); continue;
      }
      loggedMode = null;
      if (!Number.isFinite(snap.tx)) { await page.waitForTimeout(POLL_MS); continue; }
      const dist = Math.hypot(snap.tx - snap.px, snap.tz - snap.pz);
      if (!contact && snap.promoted) {
        contact = { at: Date.now() - start, dist: Math.round(dist) };
        contactPos = { x: snap.tx, z: snap.tz };
        const speed = Math.hypot(snap.vx || 0, snap.vz || 0) || 1;
        contactDir = { x: (snap.vx || 0) / speed, z: (snap.vz || 0) / speed };
        console.log(`  ram contact at +${(contact.at / 1000).toFixed(1)}s dist=${contact.dist}`);
        try { await page.screenshot({ path: `${OUT_DIR}/${stamp}-ram-contact.png` }); } catch (_) {}
      }
      // Aim at the rock until promoted; afterwards keep the same heading to
      // carry ~300 WU clear.
      const aim = contact
        ? { x: contactPos.x + contactDir.x * 400, z: contactPos.z + contactDir.z * 400 }
        : { x: snap.tx, z: snap.tz };
      if (contact && dist > 300) break;
      const desired = Math.atan2(aim.z - snap.pz, aim.x - snap.px);
      const err = wrapAngle(desired - (snap.rot + headingOffset));
      await setHeld({
        w: Math.abs(err) < 0.5,
        a: aSign > 0 ? err > 0.10 : err < -0.10,
        d: aSign > 0 ? err < -0.10 : err > 0.10,
      });
      await maybeScreenshot(snap);
      await page.waitForTimeout(POLL_MS);
    }
    await releaseAll();
    ramResult = { target: ramTarget, promoted: !!contact, contact };
    phases.push({ phase: 'ram', ms: Date.now() - start, done: contact ? 'promoted' : 'timeout', target: ramTarget.id });
    // keep the timeline's +3s tail: leave ramTargetId armed while drifting clear
    await page.waitForTimeout(3000);
    await page.evaluate(() => { window.__SF_ASTEROID_PROBE__.probe.ramTargetId = null; });
  } else {
    console.log('  no dormant ordinary rock for the ram leg');
  }
  await releaseAll();

  await page.evaluate(() => { window.__SF_ASTEROID_PROBE__.stop(); });
  const probeOut = await page.evaluate(() => {
    const pr = window.__SF_ASTEROID_PROBE__;
    return pr ? { rec: pr.rec, frame: pr.probe.frame, drawStamps: pr.probe.drawStamps, glWrapped: pr.probe.glWrapped } : null;
  });
  const contextLosses = await page.evaluate(() => window.__SF_CONTEXT_LOSSES__ || 0).catch(() => null);

  // --- Report ----------------------------------------------------------------
  const episodes = (probeOut && probeOut.rec.episodes) || [];
  const pct = (sorted, p) => (sorted.length
    ? Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(p / 100 * sorted.length) - 1)]) : null);
  const byKind = {};
  for (const ep of episodes) {
    const key = `${ep.kind}|${ep.dormantAtEntry ? 'dormant' : 'live'}`;
    const row = byKind[key] || (byKind[key] = {
      episodes: 0, onTime: 0, late: 0, leftUndrawn: 0, removedUndrawn: 0,
      lateMs: [], reasons: {},
    });
    row.episodes++;
    if (ep.closeKind === 'onTime') row.onTime++;
    else if (ep.closeKind === 'late') { row.late++; row.lateMs.push(ep.msLate); }
    else if (ep.closeKind === 'leftUndrawn') row.leftUndrawn++;
    else if (ep.closeKind === 'removedUndrawn') row.removedUndrawn++;
    for (const [reason, n] of Object.entries(ep.reasons || {})) {
      row.reasons[reason] = (row.reasons[reason] || 0) + n;
    }
  }
  const summaryByKind = {};
  for (const [key, row] of Object.entries(byKind)) {
    const sorted = [...row.lateMs].sort((a, b) => a - b);
    summaryByKind[key] = {
      episodes: row.episodes,
      onTime: row.onTime,
      late: row.late,
      leftUndrawn: row.leftUndrawn,
      removedUndrawn: row.removedUndrawn,
      lateP50Ms: pct(sorted, 50),
      lateP95Ms: pct(sorted, 95),
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
    route: 'adventure', seed: SEED, simLane: SIM_LANE, routeIdentity,
    staging,
    groundTruth: { ok: groundTruthOk, validation },
    calibration: { headingOffsetDeg: Math.round(headingOffset * 180 / Math.PI * 10) / 10, aSign },
    waypoints,
    phases,
    modeLeaves,
    contextLosses,
    host: {
      cpu: (cpus()[0] && cpus()[0].model) || null,
      logicalCores: cpus().length,
      loadavg: loadavg(),
      gpuRenderer,
    },
    frames: probeOut ? probeOut.rec.frames : null,
    counts: probeOut ? probeOut.rec.counts : null,
    blinkCounts: probeOut ? probeOut.rec.blinkCounts : null,
    blinks: probeOut ? probeOut.rec.blinks.slice(0, 60) : [],
    promotions: probeOut ? probeOut.rec.promotions.slice(0, 200) : [],
    ram: (() => {
      if (!probeOut) return null;
      const tl = probeOut.rec.ramTimeline || [];
      const at = probeOut.rec.ramPromotedAt;
      const sliced = at != null
        ? tl.filter((r) => r.t >= at - 2000 && r.t <= at + 3000)
        : tl;
      return { target: ramTarget, result: ramResult, promotedAt: at, timelineRawCount: tl.length, timeline: sliced };
    })(),
    populations: probeOut ? probeOut.rec.populations : null,
    maxOnScreen: probeOut ? probeOut.rec.maxOnScreen : null,
    liveOnScreenMax: probeOut ? probeOut.rec.liveOnScreenMax : null,
    dormantOnScreenMax: probeOut ? probeOut.rec.dormantOnScreenMax : null,
    peakUndrawn: probeOut ? probeOut.rec.peakUndrawn : null,
    lanes: probeOut ? probeOut.rec.lanes : [],
    samplerErrors: probeOut ? probeOut.rec.errors : [],
    summaryByKind,
    worstEpisodes: worst,
    episodes,
    screenshots: shots,
  };
  const outPath = `${OUT_DIR}/${stamp}.json`;
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log('\nasteroid-appear probe');
  console.log(`  frames sampled: ${report.frames} drawStamps=${probeOut && probeOut.drawStamps}`
    + ` groundTruth=${groundTruthOk ? 'OK' : 'FAILED'}`);
  console.log(`  episodes: ${episodes.length}  counts=${JSON.stringify(report.counts)}`);
  console.log('  by kind|entry-state:');
  for (const [key, row] of Object.entries(summaryByKind)) {
    console.log(`    ${key}: episodes=${row.episodes} onTime=${row.onTime} late=${row.late}`
      + ` leftUndrawn=${row.leftUndrawn} p50=${row.lateP50Ms}ms p95=${row.lateP95Ms}ms max=${row.lateMaxMs}ms`
      + ` reasons=${JSON.stringify(row.reasons)}`);
  }
  if (worst.length) {
    console.log('  worst episodes:');
    for (const ep of worst.slice(0, 8)) {
      console.log(`    id=${ep.id} ${ep.kind} ${ep.dormantAtEntry ? 'dormant' : 'live'}->${ep.dormantAtDraw === null ? '?' : (ep.dormantAtDraw ? 'dormant' : 'live')}`
        + ` close=${ep.closeKind} late=${ep.msLate}ms undrawnMs=${ep.msUndrawn}`
        + ` distAtEntry=${ep.distAtEntry} firstReason=${ep.firstReason}`
        + ` promote=${ep.promoteReason || '-'}`);
    }
  }
  if (report.blinkCounts && Object.keys(report.blinkCounts).length) {
    console.log(`  blinks: ${JSON.stringify(report.blinkCounts)}`);
  } else {
    console.log('  blinks: none');
  }
  if (report.ram && report.ram.timeline) {
    const tl = report.ram.timeline;
    console.log(`  ram timeline: ${tl.length} frames promotedAt=${report.ram.promotedAt}`);
    for (const row of tl.filter((r, i) => !r.drawn || i % 10 === 0).slice(0, 30)) {
      console.log(`    t=${row.t} f=${row.frame} drawn=${row.drawn} ${row.reason || ''}`
        + ` dormant=${row.dormant} geo=${row.geometryPending} pipe=${row.pipelinesPending}`
        + ` pool=${row.pool ? `${row.pool.registered}/${row.pool.submitted}#${row.pool.submittedIndex}` : '-'}`);
    }
  }
  console.log(`  screenshots: ${shots.length}`);
  console.log(`  report: ${outPath}`);
  dumpErrors();
  if (!groundTruthOk) process.exitCode = 1;
} catch (error) {
  dumpErrors();
  throw error;
} finally {
  if (browser) await browser.close();
  server.kill();
}
