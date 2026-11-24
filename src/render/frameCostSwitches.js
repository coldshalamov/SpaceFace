// Kill switches for the render lead's frame-cost changes (2026-11-20), read once from the launch
// URL. They exist so a change can be measured against its own absence in the same minute on the
// same seed (scripts/probe-frame-cost.mjs --variants="off:rfx=off;on:"), the way engines keep a
// console variable behind each renderer optimisation.
//
//   (absent)        every change on — the shipped game
//   ?rfx=off        every change off
//   ?rfx=-sort      one change off (comma list: ?rfx=-sort,-guard)
//
// Names: sort (state-sorted opaque list), gpuDrs (GPU timer queries steer dynamic resolution),
// hudRects (HUD obstacle rects cached and invalidations coalesced, src/ui/hudAvoidRects.js),
// setLod (Foundry set pieces mount their authored LOD1 bodies), frameTasks (activity publish and
// mesh residency service run as budgeted frame tasks, src/core/frameTaskScheduler.js),
// replyCoalesce (one worker reply replays only the newest stats/cargo/slots notification per ship),
// replySlice (a reply's events replay under a per-frame budget, src/core/simLaneMain.js),
// cosmeticCadence (idle/settled craft micro-motion and damage-cosmetic state stagger to every
// third frame by slot; transform sync and combat-live channels stay per-frame,
// src/render/shipMicroMotion.js + syncEntityViews), socketPoseCache (trail/RCS socket world poses
// memoized on the view until a pose application or composed-matrix change, src/render/vfx.js),
// shadowCadence (asteroid instance uploads arm the shadow depth refresh on a bounded cadence
// instead of every frame, src/render/renderer.js), mirrorStep (a reply's mirror phase applies
// in budgeted stages before its events, src/core/simLaneMain.js), rosterSplit (entityList
// refills on roster change only, the weapon-VFX list on its own version, src/core/simLaneMain.js),
// drainCap (the reply-drain wall-clock budget is a hard cap under backlog,
// src/core/simLaneMain.js), shedCosmetics (stale replies drop fire-and-forget VFX/audio/HUD
// cue events, src/core/simLaneMain.js), ribbonBatch (every NPC wake ribbon writes one vertex
// slice of a shared geometry+program — one draw call for the whole cohort — via
// createRibbonTrailBatch in src/render/engineTrailSurfaces.js, minted through
// _mintNpcRibbonTrail in src/render/vfx.js), replyOnFrame (while animation frames arrive, worker
// replies are applied at the frame boundary only; the message task just enqueues,
// src/core/simLaneMain.js), hudBreadth (the 10 Hz numeric block splits into budgeted
// frame-task jobs, contact marks solve at 15 Hz, hover picks and the massline preview move
// onto the hud scheduler, and HUD overlay geometry reads kept elements instead of per-frame
// selector searches, src/ui/hud.js + src/ui/worldObjectInteraction.js + src/ui/masslineHud.js),
// shipTier (the ship detail-tier selector reads the hull's size instead of its cull envelope, and a
// ship may be admitted on a cheaper body from a one-frame-old size sample, src/render/lod.js +
// src/render/renderer.js + src/render/partsLibrary.js), motionPool (hull leaves under a rigid
// authored MOTION_* group join the cross-ship instance pool: one instanced draw per leaf for every
// ship of a hull instead of one draw per ship, src/render/partsLibrary.js
// canPoolRenderPackageShipMesh), inFileTiers (in a Swarm run an ordinary hostile whose hull file carries
// its own LOD1/LOD2 leaves changes tier by showing those leaves instead of loading and composing a
// sibling body, src/render/partsLibrary.js + src/render/renderer.js), emptyBatches (a particle batch with nothing alive is not
// submitted, src/render/vfx/quarksSystem.js), foundryCheapMat (demotes static Foundry deck/steel/prop Standard/Phong materials to Lambert on integrated GPUs, src/render/arenaSets/foundrySet.js),
// worldKtx2 (world textures — deep-sky plates, painted planets, rock maps — load their
// sibling .ktx2 through the shared transcoder instead of decoding the PNG/JPG source,
// src/render/assetLoader.js acquireSharedKtx2Loader + the four world-texture loaders),
// coldHulks (a Swarm hulk whose ember is spent hands its leaves to the one cold dead material set
// every spent hulk of its hull shares, hulks from the ready-body cache included,
// src/render/visualFactory.js settleColdHulk + src/render/renderer.js), hulkPool (those cold leaves
// join the cross-owner instance pool the ship hulls use: one instanced draw per leaf for every cold
// hulk of a hull, src/render/partsLibrary.js poolColdHulkLeaves),
// drsSmooth (smooth hysteresis dynamic resolution governor >=0.6 floor + single-pass composite
// upscale on integrated GPUs; ?rfx=-drsSmooth holds native 1.0 scale,
// src/render/adaptiveQuality.js + src/render/bloom.js + src/render/renderer.js),
// drawBatchOpt (live opaque + additive-transparent state sort, stand-in merge with recomputed
// normals when detached + cross-ship stand-in instancing, Foundry post-demotion material merge +
// shared deck shader, hostile retro idle-throat/iris pooling, and repeated static PlaceProp +
// BroodRemain debris instancing; ?rfx=-drawBatchOpt = off,
// src/render/opaqueStateSort.js + visualOverrides.js + partsLibrary.js + arenaSets/foundrySet.js + renderer.js).
//
// A measurement harness may also flip a switch live in one page: globalThis.__sfRfx = { name: bool }
// overrides the URL for switches the renderer reads per frame (scripts/probe-frame-toggle.mjs).

let parsed = null;

function read() {
  if (parsed) return parsed;
  parsed = { all: true, off: new Set() };
  try {
    const raw = typeof location !== 'undefined' && location && location.search
      ? new URLSearchParams(location.search).get('rfx') : null;
    if (raw) {
      for (const part of String(raw).split(',')) {
        const name = part.trim();
        if (name === 'off') parsed.all = false;
        else if (name.startsWith('-')) parsed.off.add(name.slice(1));
      }
    }
  } catch (_) { /* no location: everything on */ }
  return parsed;
}

export function frameCostFixOn(name) {
  const live = globalThis.__sfRfx;
  if (live && typeof live[name] === 'boolean') return live[name];
  const p = read();
  return p.all && !p.off.has(name);
}

/** A change still being measured: off unless a harness turns it on (globalThis.__sfRfx[name] = true). */
export function frameCostFixPending(name) {
  const live = globalThis.__sfRfx;
  return !!(live && live[name] === true);
}

/** Tests only. */
export function resetFrameCostSwitchesForTest() {
  parsed = null;
}
