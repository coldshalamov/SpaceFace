// Presented-pose age: how long since the DRAWN pose of the player's ship and of other moving
// bodies last changed while the game is unpaused and those bodies are moving. It is sampled once
// per presented frame from the meshes the renderer actually draws (with the floating-origin
// rebases folded back out), not from simulation state, so a frozen picture over a live simulation
// shows up here even when every simulation counter looks healthy.
//
// Also kept beside it: the age of the newest simulation data behind the frame (the fence can coast
// for about a second on old data, so a drawn pose can keep creeping while the data is stale), and
// the presented-frame gap (a main-thread hitch freezes everything, including this sampler).
//
// Read by the probes and the no-freeze gate through window.__SF_POSE_AGE__.

import { POSE_ROW, POSE_ROW_STRIDE } from '../core/simPoseTable.js';
import { IS_DEV } from '../core/devMode.js';
import { getLatestSnapshotFence } from './snapshotFence.js';
const fenceScratch = { x: 0, y: 0, z: 0, rot: 0, valid: false };

const TRACK_REFRESH_FRAMES = 30;
const TRACK_OTHERS = 8;
const MOVING_SPEED = 3; // world units per second: a body slower than this may legitimately sit still
const MOVED_EPS = 0.005;
const EPISODE_MS = 100;
const EPISODE_LIMIT = 32;

const rec = {
  frames: 0,
  activeFrames: 0,
  worstPoseAgeMs: 0,
  worstPlayerPoseAgeMs: 0,
  worstDataAgeMs: 0,
  worstFrameGapMs: 0,
  poseAgeOver100Frames: 0,
  dataAgeOver100Frames: 0,
  frameGapOver100: 0,
  episodes: [],
  lastPoseAgeMs: 0,
  lastDataAgeMs: 0,
  lastFrameAtMs: 0,
  rebaseX: 0,
  rebaseZ: 0,
  tracked: new Map(),
  refreshIn: 0,
  dataSimTime: NaN,
  dataChangedAtMs: 0,
  openEpisode: null,
  silentHoldFrames: 0,
  worstNetPoseAgeMs: 0,
  frameGapsOver100: 0,
  frameGapList: [],
  worstUncoveredDataAgeMs: 0,
  worstGhostMs: 0,
  worstSilentHoldMs: 0,
  // Set by a wall-clock watcher when the game was paused/hidden between two frames (a pause screen
  // may stop presenting entirely); the next frame then starts fresh instead of counting the pause.
  sawNonLive: true,
  worstId: null,
};
const ON_SCREEN_WU = 450;
let watcher = null;
let watchedState = null;

export function notePoseAgeRebase(dx, dz) {
  rec.rebaseX += Number(dx) || 0;
  rec.rebaseZ += Number(dz) || 0;
}

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}

function presentingLive(state) {
  if (!state || state.mode !== 'flight') return false;
  if (!(Number(state.timeScale) > 0)) return false;
  if (state.ui && state.ui.docked === true) return false;
  // The flight reveal veil holds the simulation on purpose while the first picture settles.
  if (state.render && state.render.flightVeilHoldsSim === true) return false;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false;
  return true;
}

function speedFor(id, feedIndex, rows, state) {
  const o = feedIndex ? feedIndex.get(id) : undefined;
  if (o !== undefined) return Math.hypot(rows[o + POSE_ROW.VX], rows[o + POSE_ROW.VZ]);
  const e = state.entities && typeof state.entities.get === 'function' ? state.entities.get(id) : null;
  return e && e.vel ? Math.hypot(Number(e.vel.x) || 0, Number(e.vel.z) || 0) : 0;
}

const feedIndex = new Map();

/** Once per presented frame, before this frame's poses are seated (measures the last drawn frame). */
export function recordPresentedPoseAge(state, meshes, feed, world = null) {
  // Measurement only: dev builds (the unpackaged desktop build the gate drives) pay for it,
  // a packaged release never does.
  if (!IS_DEV) return;
  const now = nowMs();
  watchedState = state;
  if (!watcher && typeof setInterval === 'function') {
    watcher = setInterval(() => { if (!presentingLive(watchedState)) rec.sawNonLive = true; }, 20);
  }
  const resumed = rec.sawNonLive;
  rec.sawNonLive = false;
  const gap = rec.lastFrameAtMs > 0 && !resumed ? now - rec.lastFrameAtMs : 0;
  rec.lastFrameAtMs = now;
  rec.frames++;
  const live = presentingLive(state) && !resumed;
  noteSilentHold(state, now, gap);
  const snap = feed && feed.active === true ? feed.snapshot : null;
  feedIndex.clear();
  if (snap) {
    for (let i = 0, o = 0; i < snap.count; i++, o += POSE_ROW_STRIDE) feedIndex.set(snap.rows[o], o);
  }
  // Newest simulation data behind the picture.
  const dataTime = snap ? snap.simTime : Number(state && state.simTime);
  if (dataTime !== rec.dataSimTime) { rec.dataSimTime = dataTime; rec.dataChangedAtMs = now; }
  if (!live || !meshes || typeof meshes.get !== 'function') {
    rec.tracked.clear();
    rec.refreshIn = 0;
    rec.dataChangedAtMs = now;
    rec.lastPoseAgeMs = 0;
    rec.lastDataAgeMs = 0;
    if (rec.openEpisode) rec.openEpisode = null;
    return;
  }
  rec.activeFrames++;
  // Track the player plus a handful of moving bodies; refresh the set twice a second.
  if (--rec.refreshIn <= 0) {
    rec.refreshIn = TRACK_REFRESH_FRAMES;
    const keep = new Set();
    const playerId = Number.isSafeInteger(state.playerId) ? state.playerId : null;
    if (playerId != null) keep.add(playerId);
    if (snap) {
      for (let i = 0, o = 0; i < snap.count && keep.size < TRACK_OTHERS + 1; i++, o += POSE_ROW_STRIDE) {
        const id = snap.rows[o];
        if (id === playerId || !meshes.get(id)) continue;
        // Ships only: rocks, mines and pickups may be drawn by instanced/field presenters whose
        // per-entity mesh is not the drawn pose.
        const e = state.entities && state.entities.get ? state.entities.get(id) : null;
        if (!e || e.type !== 'ship') continue;
        if (Math.hypot(snap.rows[o + POSE_ROW.VX], snap.rows[o + POSE_ROW.VZ]) > MOVING_SPEED * 3) keep.add(id);
      }
    } else if (Array.isArray(state.entityList)) {
      for (const e of state.entityList) {
        if (keep.size >= TRACK_OTHERS + 1) break;
        if (!e || e.id === playerId || e.type !== 'ship' || !meshes.get(e.id) || !e.vel) continue;
        if (Math.hypot(Number(e.vel.x) || 0, Number(e.vel.z) || 0) > MOVING_SPEED * 3) keep.add(e.id);
      }
    }
    for (const id of rec.tracked.keys()) if (!keep.has(id)) rec.tracked.delete(id);
    for (const id of keep) if (!rec.tracked.has(id)) rec.tracked.set(id, { x: NaN, z: NaN, tx: NaN, tz: NaN, fx: NaN, fz: NaN, fenceChangedAtMs: now, inScene: true, tableMovedAtMs: 0, changedAtMs: now });
  }
  let worst = 0;
  let playerAge = 0;
  let worstId = null;
  let worstDetail = null;
  const rows = snap ? snap.rows : null;
  const playerMesh = Number.isSafeInteger(state.playerId) ? meshes.get(state.playerId) : null;
  for (const [id, t] of rec.tracked) {
    const mesh = meshes.get(id);
    // Only bodies on screen count: the renderer legitimately skips posing culled/off-screen meshes.
    const wslot = world && typeof world.getSlotForEntityId === 'function' ? world.getSlotForEntityId(id) : -1;
    // The renderer seats only rows its view pass found visible this frame (culled rows keep
    // their last pose by design), so only those count.
    const culled = world && world.visible ? !(wslot >= 0 && world.visible[wslot] === 1) : false;
    if (!mesh || !mesh.position || mesh.visible === false || culled
      || (playerMesh && playerMesh.position && id !== state.playerId
        && Math.hypot(mesh.position.x - playerMesh.position.x, mesh.position.z - playerMesh.position.z) > ON_SCREEN_WU)) {
      t.changedAtMs = now; t.x = NaN; continue;
    }
    const gx = mesh.position.x - rec.rebaseX;
    const gz = mesh.position.z - rec.rebaseZ;
    if (!(Math.abs(gx - t.x) <= MOVED_EPS && Math.abs(gz - t.z) <= MOVED_EPS)) {
      t.x = gx; t.z = gz; t.changedAtMs = now;
    }
    // Diagnostic beside the mesh: the fence's presented pose for the same body (what the mesh is
    // supposed to be seated from). Mesh stale + fence moving = a render-side seat skip, not the lane.
    const fence = getLatestSnapshotFence();
    const fp = fence && typeof fence.presentedPose === 'function' ? fence.presentedPose(id, fenceScratch) : null;
    if (fp && fp.valid) {
      if (!(Math.abs(fp.x - t.fx) <= MOVED_EPS && Math.abs(fp.z - t.fz) <= MOVED_EPS)) {
        t.fx = fp.x; t.fz = fp.z; t.fenceChangedAtMs = now;
      }
    } else {
      t.fenceChangedAtMs = -1;
    }
    t.inScene = !!mesh.parent;
    // Identity facts for the diagnosis of a stale row: does the table row match the world slot?
    if (snap && world && wslot >= 0) {
      const o2 = feedIndex.get(id);
      t.tableGen = o2 === undefined ? null : rows[o2 + POSE_ROW.GENERATION];
      t.tableOcc = o2 === undefined ? null : rows[o2 + POSE_ROW.OCCUPANT];
      t.worldGen = world.sourceGenerations ? world.sourceGenerations[wslot] : null;
      t.worldOcc = world.occupantGenerations ? world.occupantGenerations[wslot] : null;
      t.worldX = world.x ? world.x[wslot] : null;
      t.tableX = o2 === undefined ? null : rows[o2 + POSE_ROW.X];
    }
    // With the pose table, "should be moving" means the simulation actually moved the body
    // recently (a pinned or tethered hull can report velocity yet stand still). Without a table
    // (legacy A/B) the reported velocity is the only signal, since the facade itself may be frozen.
    let moving;
    const fo = snap ? feedIndex.get(id) : undefined;
    if (fo !== undefined) {
      const tx = rows[fo + POSE_ROW.X]; const tz = rows[fo + POSE_ROW.Z];
      if (!(Math.abs(tx - t.tx) <= MOVED_EPS && Math.abs(tz - t.tz) <= MOVED_EPS)) {
        t.tx = tx; t.tz = tz; t.tableMovedAtMs = now;
      }
      moving = now - (t.tableMovedAtMs || -1e9) < 250;
      t.ghostSinceMs = -1;
    } else if (snap) {
      // Not in the table: the simulation no longer presents this body (its retirement is in flight).
      moving = false;
      if (!(t.ghostSinceMs >= 0)) t.ghostSinceMs = now;
      const ghostMs = now - t.ghostSinceMs;
      if (ghostMs > rec.worstGhostMs) rec.worstGhostMs = ghostMs;
    } else {
      moving = speedFor(id, null, rows, state) > MOVING_SPEED;
    }
    const age = moving ? now - t.changedAtMs : 0;
    if (!moving) t.changedAtMs = now;
    if (age > worst) { worst = age; worstId = id; worstDetail = t; }
    if (id === state.playerId) playerAge = age;
  }
  const dataAge = now - rec.dataChangedAtMs;
  rec.lastPoseAgeMs = worst;
  rec.lastDataAgeMs = dataAge;
  if (worst > rec.worstPoseAgeMs) {
    rec.worstPoseAgeMs = worst;
    const e = state.entities && state.entities.get ? state.entities.get(worstId) : null;
    rec.worstId = worstId == null ? null : `${worstId}:${e ? e.type : '?'}${worstId === state.playerId ? ':player' : ''}`;
  }
  if (playerAge > rec.worstPlayerPoseAgeMs) rec.worstPlayerPoseAgeMs = playerAge;
  if (dataAge > rec.worstDataAgeMs) rec.worstDataAgeMs = dataAge;
  // Ruling 2026-11-21: a body cannot be redrawn in a frame that did not happen, so the freeze is
  // judged on pose age NET of this frame's gap; the gap itself is a rendering hitch, listed with
  // the renderer's own hitch attribution.
  const netAge = Math.max(0, worst - gap);
  if (netAge > rec.worstNetPoseAgeMs) rec.worstNetPoseAgeMs = netAge;
  if (gap > 100) {
    rec.frameGapsOver100++;
    if (rec.frameGapList.length < 64) {
      let owner = null;
      try {
        const v = state.perfRuntime && typeof state.perfRuntime.getHitchVerdicts === 'function'
          ? state.perfRuntime.getHitchVerdicts() : null;
        const last = v && v.length ? v[v.length - 1] : null;
        if (last) owner = { owner: last.owner, simSystem: last.simSystem || null, frameMs: Math.round(last.frameMs || 0) };
      } catch (_) { /* attribution is optional */ }
      rec.frameGapList.push({ atMs: Math.round(now), gapMs: Math.round(gap), attribution: owner });
    }
  }
  // A stopped clock in live flight must be covered (ruling): uncovered = no hold plate on screen.
  const covered = typeof document !== 'undefined' && !!document.getElementById('sf-world-hold');
  if (!covered && dataAge > rec.worstUncoveredDataAgeMs) rec.worstUncoveredDataAgeMs = dataAge;
  if (gap > rec.worstFrameGapMs) rec.worstFrameGapMs = gap;
  if (worst > EPISODE_MS) rec.poseAgeOver100Frames++;
  if (dataAge > EPISODE_MS) rec.dataAgeOver100Frames++;
  if (gap > EPISODE_MS) rec.frameGapOver100++;
  const bad = Math.max(worst, dataAge, gap);
  if (bad > EPISODE_MS) {
    if (!rec.openEpisode) {
      rec.openEpisode = { atMs: Math.round(now), poseAgeMs: 0, dataAgeMs: 0, frameGapMs: 0, frames: 0 };
      rec.episodes.push(rec.openEpisode);
      if (rec.episodes.length > EPISODE_LIMIT) rec.episodes.shift();
    }
    const ep = rec.openEpisode;
    ep.frames++;
    ep.poseAgeMs = Math.max(ep.poseAgeMs, Math.round(worst));
    ep.dataAgeMs = Math.max(ep.dataAgeMs, Math.round(dataAge));
    ep.frameGapMs = Math.max(ep.frameGapMs, Math.round(gap));
    if (worstDetail && Math.round(worst) >= ep.poseAgeMs) {
      const e = state.entities && state.entities.get ? state.entities.get(worstId) : null;
      ep.worst = { id: worstId, type: e ? e.type : null, player: worstId === state.playerId,
        inScene: worstDetail.inScene, tableGen: worstDetail.tableGen, tableOcc: worstDetail.tableOcc, worldGen: worstDetail.worldGen, worldOcc: worstDetail.worldOcc, worldX: worstDetail.worldX, tableX: worstDetail.tableX, meshX: worstDetail.x + rec.rebaseX, fenceAgeMs: worstDetail.fenceChangedAtMs < 0 ? null : Math.round(now - worstDetail.fenceChangedAtMs) };
    }
  } else if (rec.openEpisode) {
    rec.openEpisode = null;
  }
}

// Ruling (owner, 2026-11-21): the world is never held silently. In flight, a time scale of zero with
// no open screen and no pause plate is a frozen world that looks like a hang — count every frame of it.
let silentSinceMs = -1;
function noteSilentHold(state, now, gap) {
  const silent = !!state && state.mode === 'flight' && !(Number(state.timeScale) > 0)
    && !(state.ui && state.ui.docked === true)
    && !(state.render && state.render.flightVeilHoldsSim === true)
    && !(state.ui && Array.isArray(state.ui.screenStack) && state.ui.screenStack.length > 0)
    && !(typeof document !== 'undefined' && (document.visibilityState === 'hidden'
      || document.getElementById('sf-focus-pause')));
  if (!silent) { silentSinceMs = -1; return; }
  if (silentSinceMs < 0) silentSinceMs = now;
  rec.silentHoldFrames++;
  const held = now - silentSinceMs;
  if (held > rec.worstSilentHoldMs) rec.worstSilentHoldMs = held;
  void gap;
}

export function readPoseAge() {
  return {
    frames: rec.frames,
    activeFrames: rec.activeFrames,
    worstPoseAgeMs: Math.round(rec.worstPoseAgeMs),
    worstPlayerPoseAgeMs: Math.round(rec.worstPlayerPoseAgeMs),
    worstDataAgeMs: Math.round(rec.worstDataAgeMs),
    worstFrameGapMs: Math.round(rec.worstFrameGapMs),
    poseAgeOver100Frames: rec.poseAgeOver100Frames,
    dataAgeOver100Frames: rec.dataAgeOver100Frames,
    frameGapOver100: rec.frameGapOver100,
    lastPoseAgeMs: Math.round(rec.lastPoseAgeMs),
    lastDataAgeMs: Math.round(rec.lastDataAgeMs),
    tracked: rec.tracked.size,
    worstId: rec.worstId,
    silentHoldFrames: rec.silentHoldFrames,
    worstNetPoseAgeMs: Math.round(rec.worstNetPoseAgeMs),
    frameGapsOver100: rec.frameGapsOver100,
    frameGapList: rec.frameGapList.slice(),
    worstUncoveredDataAgeMs: Math.round(rec.worstUncoveredDataAgeMs),
    // A drawn body the simulation already retired (its destroy has not reached the picture yet).
    worstGhostMs: Math.round(rec.worstGhostMs),
    worstSilentHoldMs: Math.round(rec.worstSilentHoldMs),
    episodes: rec.episodes.map((e) => ({ ...e })),
  };
}

export function resetPoseAge() {
  rec.worstPoseAgeMs = 0;
  rec.worstId = null;
  rec.silentHoldFrames = 0;
  rec.worstNetPoseAgeMs = 0;
  rec.frameGapsOver100 = 0;
  rec.frameGapList.length = 0;
  rec.worstUncoveredDataAgeMs = 0;
  rec.worstGhostMs = 0;
  rec.worstSilentHoldMs = 0;
  rec.worstPlayerPoseAgeMs = 0;
  rec.worstDataAgeMs = 0;
  rec.worstFrameGapMs = 0;
  rec.poseAgeOver100Frames = 0;
  rec.dataAgeOver100Frames = 0;
  rec.frameGapOver100 = 0;
  rec.episodes.length = 0;
  rec.openEpisode = null;
  rec.activeFrames = 0;
}

if (typeof window !== 'undefined') {
  window.__SF_POSE_AGE__ = { read: readPoseAge, reset: resetPoseAge };
}
