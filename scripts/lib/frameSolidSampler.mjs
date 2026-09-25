// In-page sampler for the "sacred player frame" defect class: things on the live screen that
// blink out, reload, regress from their authored body to a stand-in, or lose collision while the
// player is at them. Pass `installFrameSolidSampler` to page.evaluate; it must stay
// self-contained (no outer-scope references). Read the record back from window.__SF_FRAME__.
//
// Counters (all only while mode === 'flight' and the first playable frame has presented):
//   blinks          on-screen for two consecutive frames and visibility went true -> false
//   missingFrames   frames an on-screen entity drew nothing
//   stuckMissing    of those, frames where it had already been on screen >= 1 s
//   rootSwaps       the entity's mesh root object was replaced while on screen (rebuild/reload)
//   regressions     authoredAssetState left 'authored' while on screen (body -> stand-in)
//   stationNoCollider  frames the player was inside a station's dock envelope while that station
//                      was absent from the physics static set
//   frameMs         rAF-to-rAF interval of every flight frame (longest frame, p95/p99)
//   appear          one episode per entity entering the frame: on time (drawn on its first
//                   on-screen frame) or late (ms from entering the frame to first drawn);
//                   leftUndrawn = left the frame again without ever being drawn (a lower bound)
export async function installFrameSolidSampler() {
  const SF = window.SF;
  const THREE = SF && SF.THREE;
  if (!SF || !SF.state || !THREE) throw new Error('window.SF / SF.THREE unavailable');
  const activity = await import('/src/core/worldActivityManager.js');
  const parts = await import('/src/render/partsLibrary.js').catch(() => null);
  const TYPES = new Set(['ship', 'station', 'asteroid', 'wreck', 'drone', 'freighter']);
  const frustum = new THREE.Frustum();
  const projView = new THREE.Matrix4();
  const sphere = new THREE.Sphere(new THREE.Vector3(), 1);
  const track = new Map();
  const rec = {
    frames: 0, blinks: 0, missingFrames: 0, stuckMissing: 0, rootSwaps: 0, regressions: 0,
    stationNearFrames: 0, stationNoCollider: 0, maxOnScreen: 0,
    byType: {}, offenders: {},
    lodFrames: {}, lodSwapsOnScreen: 0, lodSwapKinds: {}, stationBounds: {},
    frameMs: [],
    appear: { episodes: 0, onTime: 0, late: 0, leftUndrawn: 0, lateMs: [], byType: {} },
    // Admission lane depths sampled every 250 ms of flight: authored composition queue, roots held
    // hidden behind a pipeline compile (+ residency + exact-target touch), residency uploads.
    lanes: [],
  };
  let lastFrameAt = 0;
  let lastLaneAt = 0;
  const sampleLanes = (now, render, scene) => {
    if (now - lastLaneAt < 250) return;
    lastLaneAt = now;
    const q = parts && typeof parts.describeAuthoredUpgradeQueue === 'function' && scene
      ? parts.describeAuthoredUpgradeQueue(scene) : null;
    const rendererData = render.renderer && render.renderer.userData;
    const held = rendererData && rendererData.spacefacePendingPipelineSubjects;
    rec.lanes.push({
      t: Math.round(now),
      upgradePending: q ? q.pending | 0 : null,
      upgradeInFlight: q ? q.inFlight | 0 : null,
      upgradeCompiling: q && Number.isFinite(q.compiling) ? q.compiling : null,
      upgradeHeld: q ? q.held === true : null,
      pipelineHeldRoots: held && typeof held.size === 'number' ? held.size : null,
      residencyPending: typeof render.pendingAuthoredGpuResidency === 'function'
        ? Number(render.pendingAuthoredGpuResidency()) || 0 : null,
    });
  };
  const appearType = (type) => rec.appear.byType[type]
    || (rec.appear.byType[type] = { episodes: 0, onTime: 0, late: 0, leftUndrawn: 0, maxLateMs: 0 });
  const closeLate = (e, t, now, drawn) => {
    const ms = Math.round(now - t.onSince);
    const bucket = appearType(e.type);
    if (drawn) { rec.appear.late++; bucket.late++; } else { rec.appear.leftUndrawn++; bucket.leftUndrawn++; }
    rec.appear.lateMs.push(ms);
    if (ms > bucket.maxLateMs) bucket.maxLateMs = ms;
    t.appearOpen = false;
  };
  // Every in-flight shader link with who paid for it. The perf seam's event ring (512) is flooded
  // by buffer uploads and drops most links, so wrap the counter entry point itself.
  rec.links = [];
  // GL handles stay in-page (they do not serialize); resolveFrameSolidLinks() maps them to Three's
  // program cacheKey at report time.
  const linkHandles = [];
  window.__SF_FRAME_LINK_HANDLES__ = linkHandles;
  const tier1 = SF.state.perfRuntime && SF.state.perfRuntime.tier1;
  if (tier1 && typeof tier1.countShaderLink === 'function' && !tier1.__frameSolidWrapped) {
    const original = tier1.countShaderLink;
    tier1.__frameSolidWrapped = true;
    tier1.countShaderLink = function countShaderLinkWitness(...args) {
      if (window.__SF_FRAME_STOP__ !== true && SF.state.mode === 'flight') {
        const drawn = tier1.drawObject || null;
        const material = drawn && drawn.material ? (Array.isArray(drawn.material) ? drawn.material[0] : drawn.material) : null;
        const stack = String((new Error()).stack || '').split('\n').slice(2, 14)
          .map((line) => line.trim().replace(/\(?https?:\/\/[^/]+\//, '(').replace(/\?[^:)]*/, ''))
          .filter((line) => !/countShaderLinkWitness|glInstrumentation/.test(line));
        // Owner of the drawn mesh: first ancestor naming an entity, plus whether admission still
        // held it (a link inside a presented draw on a held root means the hide latch leaked).
        let owner = null;
        for (let node = drawn; node && !owner; node = node.parent) {
          const ud = node.userData || {};
          const id = ud.presentationEntityId ?? ud.entityId ?? ud.sfStableEntityKey ?? null;
          if (id == null) continue;
          const entity = SF.state.entities && SF.state.entities.get ? SF.state.entities.get(id) : null;
          owner = {
            id: String(id),
            node: node.name || node.type,
            type: entity ? entity.type : null,
            defId: entity && entity.data ? (entity.data.defId || entity.data.stationId || null) : null,
            isPlayer: !!(entity && (entity.isPlayer === true || entity.id === SF.state.playerId)),
            pipelinesPending: ud.pipelinesPending === true,
            assetState: ud.authoredAssetState || null,
          };
        }
        // The program this material drew with before (setProgram has not swapped it yet while the
        // new program links), so the report can name the exact parameter that changed.
        let previous = null;
        try {
          const props = material && SF.state.render && SF.state.render.renderer
            && SF.state.render.renderer.properties.get(material);
          if (props) {
            previous = {
              cacheKey: props.currentProgram ? String(props.currentProgram.cacheKey || '') : null,
              name: props.currentProgram ? props.currentProgram.name || null : null,
              materialVersion: material.version,
              compiledVersion: props.__version ?? null,
              envMap: props.envMap ? (props.envMap.uuid || 'set') : null,
              instancing: props.instancing ?? null,
              vertexTangents: props.vertexTangents ?? null,
            };
          }
        } catch (_) { previous = null; }
        rec.links.push({
          frame: rec.frames,
          t: Math.round(performance.now()),
          owner,
          previous,
          instanced: !!(drawn && drawn.isInstancedMesh),
          subject: typeof tier1.admissionSubject === 'string' || typeof tier1.admissionSubject === 'number'
            ? String(tier1.admissionSubject) : null,
          draw: drawn ? `${drawn.name || drawn.type || 'unnamed'}${drawn.isInstancedMesh ? ':instanced' : ''}` : null,
          material: material ? `${material.type}${material.name ? `:${material.name}` : ''}` : null,
          depthPass: !!(drawn && material && (drawn.customDepthMaterial || /Depth|Distance/.test(material.type))),
          stack: stack.slice(0, 8),
        });
        linkHandles.push(args[2] || null);
      }
      return original.apply(this, args);
    };
  }
  window.__SF_FRAME__ = rec;
  window.__SF_FRAME_STOP__ = false;

  const bump = (e, key) => {
    rec[key]++;
    const t = rec.byType[e.type] || (rec.byType[e.type] = { blinks: 0, missingFrames: 0, stuckMissing: 0, rootSwaps: 0, regressions: 0 });
    t[key]++;
    const id = String(e.id);
    const o = rec.offenders[id] || (rec.offenders[id] = {
      type: e.type, defId: (e.data && (e.data.defId || e.data.stationId || e.data.stationTypeId)) || null,
      radius: e.radius, blinks: 0, missingFrames: 0, stuckMissing: 0, rootSwaps: 0, regressions: 0,
    });
    o[key]++;
  };
  const effectivelyVisible = (mesh, scene) => {
    if (!mesh || mesh.visible === false) return false;
    let node = mesh;
    while (node.parent) {
      node = node.parent;
      if (node.visible === false) return false;
    }
    return scene ? node === scene : true;
  };
  const visualRadius = (e) => Math.max(
    Number(e.radius) || 0,
    e.type === 'station' ? Number(e.data && e.data.dockRadius) || 0 : 0,
    Number(e.data && e.data.visualRadius) || 0,
  );

  const tick = () => {
    if (window.__SF_FRAME_STOP__ === true) return;
    requestAnimationFrame(tick);
    const state = SF.state;
    const render = state && state.render;
    const camera = render && render.camera;
    if (!state || state.mode !== 'flight' || !render || !Number.isFinite(render.firstPlayableFrameAt)
        || !camera || !camera.projectionMatrix || !camera.matrixWorldInverse) {
      lastFrameAt = 0;
      return;
    }
    const scene = render.scene || null;
    const now = performance.now();
    if (lastFrameAt > 0) rec.frameMs.push(now - lastFrameAt);
    lastFrameAt = now;
    rec.frames++;
    sampleLanes(now, render, scene);
    camera.updateMatrixWorld();
    projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projView);
    const origin = (state.world && state.world.frameOrigin) || { x: 0, z: 0 };
    const ox = Number(origin.x) || 0;
    const oz = Number(origin.z) || 0;
    const player = state.entities && state.entities.get(state.playerId);
    let frame = null;
    let onScreenCount = 0;
    const list = state.entityList || [];
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || e.alive === false || !e.pos || !TYPES.has(e.type) || e.id === state.playerId) continue;
      sphere.center.set(e.pos.x - ox, 0, e.pos.z - oz);
      sphere.radius = Math.max(1, visualRadius(e));
      const onScreen = frustum.intersectsSphere(sphere);
      let t = track.get(e.id);
      if (!onScreen) {
        if (t && t.appearOpen) closeLate(e, t, now, false);
        if (t) t.onSince = -1;
        if (t) t.prevOnScreen = false;
      } else {
        onScreenCount++;
        const mesh = e.mesh || null;
        const visible = effectivelyVisible(mesh, scene);
        const uuid = mesh ? mesh.uuid : null;
        const assetState = mesh && mesh.userData ? mesh.userData.authoredAssetState || null : null;
        const entering = !t || t.onSince < 0;
        if (!t) {
          t = { prevOnScreen: false, prevVisible: false, uuid, assetState, onSince: now, lod: null, appearOpen: false };
          track.set(e.id, t);
        }
        if (entering) {
          rec.appear.episodes++;
          const bucket = appearType(e.type);
          bucket.episodes++;
          if (visible) { rec.appear.onTime++; bucket.onTime++; } else t.appearOpen = true;
        }
        const lodLevel = mesh && mesh.userData ? mesh.userData.wholeShipLodActiveLevel || null : null;
        if (lodLevel) {
          rec.lodFrames[lodLevel] = (rec.lodFrames[lodLevel] || 0) + 1;
          if (t.lod && t.lod !== lodLevel) {
            rec.lodSwapsOnScreen++;
            const key = `${t.lod}->${lodLevel}`;
            rec.lodSwapKinds[key] = (rec.lodSwapKinds[key] || 0) + 1;
          }
          t.lod = lodLevel;
        }
        if (e.type === 'station' && mesh && visible && !rec.stationBounds[e.id]) {
          const box = new THREE.Box3().setFromObject(mesh);
          if (!box.isEmpty()) {
            rec.stationBounds[e.id] = {
              stationId: e.data && e.data.stationId, collisionRadius: e.radius,
              dockRadius: e.data && e.data.dockRadius,
              drawnHalfX: Math.round((box.max.x - box.min.x) / 2),
              drawnHalfZ: Math.round((box.max.z - box.min.z) / 2),
              asset: mesh.userData && mesh.userData.authoredAssetState,
            };
          }
        }
        if (t.onSince < 0) t.onSince = now;
        if (t.appearOpen && visible) closeLate(e, t, now, true);
        if (t.prevOnScreen) {
          if (t.prevVisible && !visible) bump(e, 'blinks');
          if (t.uuid && uuid && t.uuid !== uuid) bump(e, 'rootSwaps');
          if (t.assetState === 'authored' && assetState !== 'authored') bump(e, 'regressions');
        }
        if (!visible) {
          bump(e, 'missingFrames');
          if (now - t.onSince >= 1000) {
            bump(e, 'stuckMissing');
            const o = rec.offenders[String(e.id)];
            const reasons = o.reasons || (o.reasons = {});
            const add = (k) => { reasons[k] = (reasons[k] || 0) + 1; };
            const ud = (mesh && mesh.userData) || {};
            const af = render.activityFrame;
            if (!mesh) add('noMesh');
            else if (mesh.visible === false) add('rootHidden');
            else if (!mesh.parent) add('detached');
            else add('ancestorHiddenOrOffScene');
            if (ud.pipelinesPending === true) add('pipelinesPending');
            if (ud.geometryPending === true) add('geometryPending');
            if (ud.authoredAdmissionSubstrate === true) add('admissionSubstrate');
            if (ud.authoredAssetState) add(`asset:${ud.authoredAssetState}`);
            add(`tier:${(e.activity && e.activity.presentationTier) || 'none'}`);
            add(`sim:${(e.activity && e.activity.simTier) || 'none'}`);
            if (af && af.renderGlassIds && af.renderGlassIds.has && af.renderGlassIds.has(e.id)) add('inGlassSet');
            if (af && af.renderRunwayIds && af.renderRunwayIds.has && af.renderRunwayIds.has(e.id)) add('inRunwaySet');
          }
        }
        t.prevOnScreen = true;
        t.prevVisible = visible;
        t.uuid = uuid;
        t.assetState = assetState;
      }
      if (e.type === 'station' && player && player.pos && !(e.data && (e.data.isGate || e.data.isWormhole))) {
        const envelope = (Number(e.data && e.data.dockRadius) || Number(e.radius) || 0) + 150;
        const dx = e.pos.x - player.pos.x;
        const dz = e.pos.z - player.pos.z;
        if (dx * dx + dz * dz <= envelope * envelope) {
          rec.stationNearFrames++;
          frame = frame || activity.getActivityFrame(state);
          const statics = frame && frame.exactStaticCells;
          if (!statics || statics.indexOf(e) < 0) rec.stationNoCollider++;
        }
      }
    }
    if (onScreenCount > rec.maxOnScreen) rec.maxOnScreen = onScreenCount;
  };
  requestAnimationFrame(tick);
  return true;
}

/**
 * In-page (pass to page.evaluate after stopping the sampler): name every in-flight link by its
 * Three program, and diff its cacheKey against the closest program that already existed so the
 * report says WHICH shader parameter made it new (a map slot, vertex colors, a define...).
 */
export function resolveFrameSolidLinks() {
  const rec = window.__SF_FRAME__;
  const handles = window.__SF_FRAME_LINK_HANDLES__ || [];
  const renderer = window.SF && window.SF.state && window.SF.state.render && window.SF.state.render.renderer;
  const programs = (renderer && renderer.info && Array.isArray(renderer.info.programs)) ? renderer.info.programs : [];
  if (!rec || !Array.isArray(rec.links)) return [];
  const linked = new Set(handles.filter(Boolean));
  const fields = (key) => String(key || '').split(',');
  const older = programs.filter((p) => !linked.has(p.program));
  return rec.links.map((link, i) => {
    const handle = handles[i];
    const program = handle ? programs.find((p) => p.program === handle) : null;
    if (!program) return { ...link, program: null };
    const mine = fields(program.cacheKey);
    let best = null;
    let bestDiff = Infinity;
    for (const other of older) {
      const theirs = fields(other.cacheKey);
      if (theirs.length !== mine.length || theirs[0] !== mine[0]) continue;
      let diff = 0;
      for (let k = 0; k < mine.length && diff < bestDiff; k++) if (mine[k] !== theirs[k]) diff++;
      if (diff < bestDiff) { bestDiff = diff; best = other; }
    }
    const differs = [];
    if (best) {
      const theirs = fields(best.cacheKey);
      for (let k = 0; k < mine.length; k++) {
        if (mine[k] !== theirs[k]) differs.push({ index: k, new: mine[k].slice(0, 80), nearest: theirs[k].slice(0, 80) });
      }
    }
    // A material that already drew with another program: diff against that, the exact change.
    const prevKey = link.previous && link.previous.cacheKey;
    const changedFromPrevious = [];
    if (prevKey) {
      const before = fields(prevKey);
      const n = Math.max(before.length, mine.length);
      for (let k = 0; k < n; k++) {
        if (before[k] !== mine[k]) {
          changedFromPrevious.push({ index: k, new: String(mine[k] ?? '').slice(0, 80), was: String(before[k] ?? '').slice(0, 80) });
        }
      }
    }
    const { previous: previousRecord, ...rest } = link;
    return {
      ...rest,
      previous: previousRecord ? { ...previousRecord, cacheKey: undefined } : null,
      changedFromPrevious: prevKey ? changedFromPrevious.slice(0, 16) : null,
      program: program.name || null,
      shaderType: mine[0] ? mine[0].slice(0, 40) : null,
      nearestProgram: best ? best.name || null : null,
      differsFromNearest: best ? differs.slice(0, 12) : 'no program of the same type existed',
    };
  });
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[idx] * 10) / 10;
}

/** Frame pacing and time-to-appear from the raw sample arrays. */
export function frameSolidTiming(rec) {
  const frames = [...((rec && rec.frameMs) || [])].sort((a, b) => a - b);
  const appear = (rec && rec.appear) || {};
  const late = [...(appear.lateMs || [])].sort((a, b) => a - b);
  return {
    frame: {
      count: frames.length,
      p50Ms: percentile(frames, 50),
      p95Ms: percentile(frames, 95),
      p99Ms: percentile(frames, 99),
      longestMs: frames.length ? Math.round(frames[frames.length - 1] * 10) / 10 : null,
      over50Ms: frames.filter((ms) => ms > 50).length,
      over100Ms: frames.filter((ms) => ms > 100).length,
    },
    appear: {
      episodes: appear.episodes | 0,
      onTime: appear.onTime | 0,
      late: appear.late | 0,
      leftUndrawn: appear.leftUndrawn | 0,
      onTimeRate: appear.episodes ? Math.round((appear.onTime / appear.episodes) * 1000) / 1000 : null,
      lateP50Ms: percentile(late, 50),
      lateP95Ms: percentile(late, 95),
      lateMaxMs: late.length ? late[late.length - 1] : null,
      byType: appear.byType || {},
    },
  };
}

/** Keep the worst offenders only, so the record prints on one screen. */
export function summarizeFrameSolid(rec, limit = 8) {
  if (!rec) return null;
  const offenders = Object.entries(rec.offenders || {})
    .map(([id, o]) => ({ id, ...o, score: o.blinks * 10 + o.rootSwaps * 10 + o.regressions * 10 + o.stuckMissing }))
    .filter((o) => o.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  const { frameMs, appear, links, lanes, ...rest } = rec;
  return { ...rest, offenders, timing: frameSolidTiming(rec), linkCount: (links || []).length, lanes: laneSummary(lanes) };
}

function laneSummary(lanes) {
  const list = Array.isArray(lanes) ? lanes : [];
  const out = { samples: list.length };
  for (const key of ['upgradePending', 'upgradeInFlight', 'upgradeCompiling', 'pipelineHeldRoots', 'residencyPending']) {
    const values = list.map((s) => s[key]).filter(Number.isFinite);
    out[key] = values.length
      ? {
        max: Math.max(...values),
        mean: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10,
        busyShare: Math.round((values.filter((v) => v > 0).length / values.length) * 100) / 100,
      }
      : null;
  }
  out.upgradeHeldShare = list.length
    ? Math.round((list.filter((s) => s.upgradeHeld === true).length / list.length) * 100) / 100 : null;
  return out;
}

// Counts that must never go up. Timing is host-dependent: reported always, gated only with
// --strict-timing (the owner's laptop is shared with other agents and the CPU is often saturated).
const COUNT_KEYS = ['blinks', 'rootSwaps', 'regressions', 'stuckMissing', 'stationNoCollider', 'flightShaderLinks', 'inFrameShaderLinks', 'leftUndrawn'];

/** A link whose stack runs through a presented draw (renderObjects / renderBufferDirect): a freeze. */
export function isInFrameLink(link) {
  return !!(link && Array.isArray(link.stack)
    && link.stack.some((line) => /renderObjects|renderBufferDirect/.test(line)));
}

export function frameSolidMetrics(summary, extra = {}) {
  const timing = (summary && summary.timing) || frameSolidTiming(null);
  return {
    blinks: summary ? summary.blinks : null,
    rootSwaps: summary ? summary.rootSwaps : null,
    regressions: summary ? summary.regressions : null,
    stuckMissing: summary ? summary.stuckMissing : null,
    missingFrames: summary ? summary.missingFrames : null,
    stationNoCollider: summary ? summary.stationNoCollider : null,
    flightShaderLinks: Number.isFinite(extra.flightShaderLinks) ? extra.flightShaderLinks : null,
    inFrameShaderLinks: Number.isFinite(extra.inFrameShaderLinks) ? extra.inFrameShaderLinks : null,
    leftUndrawn: timing.appear.leftUndrawn,
    appearOnTimeRate: timing.appear.onTimeRate,
    appearLateP95Ms: timing.appear.lateP95Ms,
    appearLateMaxMs: timing.appear.lateMaxMs,
    frameP99Ms: timing.frame.p99Ms,
    frameLongestMs: timing.frame.longestMs,
  };
}

/** Compare a run against a saved baseline. Returns { failures, warnings, rows }. */
export function compareFrameSolidMetrics(baseline, current, options = {}) {
  const failures = [];
  const warnings = [];
  const rows = [];
  for (const key of COUNT_KEYS) {
    const before = baseline[key];
    const after = current[key];
    rows.push({ key, before, after });
    if (!Number.isFinite(before) || !Number.isFinite(after)) continue;
    if (after > before) failures.push(`${key} rose ${before} -> ${after}`);
  }
  const timingKeys = [
    ['appearLateP95Ms', 1.5], ['appearLateMaxMs', 1.5], ['frameP99Ms', 1.5], ['frameLongestMs', 1.5],
  ];
  for (const [key, ratio] of timingKeys) {
    const before = baseline[key];
    const after = current[key];
    rows.push({ key, before, after });
    if (!Number.isFinite(before) || !Number.isFinite(after) || before <= 0) continue;
    if (after > before * ratio) {
      (options.strictTiming ? failures : warnings).push(`${key} rose ${before} -> ${after} (> ${ratio}x)`);
    }
  }
  const beforeRate = baseline.appearOnTimeRate;
  const afterRate = current.appearOnTimeRate;
  rows.push({ key: 'appearOnTimeRate', before: beforeRate, after: afterRate });
  if (Number.isFinite(beforeRate) && Number.isFinite(afterRate) && afterRate < beforeRate - 0.05) {
    (options.strictTiming ? failures : warnings).push(`appearOnTimeRate fell ${beforeRate} -> ${afterRate}`);
  }
  return { failures, warnings, rows };
}
