import {
  admissionAnchorPos,
  approachDistanceWu,
  authoredPrefetchRadius,
  authoredResidencyEvictRadius,
  classifyTableBand,
  glassCornerWu,
  glassHalfExtents,
  residencyEvictRadius,
  residencyPrefetchRadius,
  shouldKeepPersistentLandmarkResident,
  TABLE_BAND,
  TABLE_COLLECT_HORIZON_SECONDS,
  TABLE_FRAME_SKIRT_WU,
  TABLE_PROMOTE_HORIZON_SECONDS,
  TABLE_RESIDENCY_PREFETCH_SECONDS,
  TABLE_SUBMIT_APPROACH_SECONDS,
  tableLookAtDelta,
  tableLookAtOrigin,
  tablePrefetchZoomFromState,
  tableShadowCasterRadius,
  tableTravelSpeed,
  timeToEnterRadiusSeconds,
} from '../tabletopPolicy.js';
import { SHADOW_ORTHO_EXTENT } from '../shadowCasterPolicy.js';
import { authoredRunwayHorizonSeconds, declaredPlaceTargetRadius } from '../authoredAdmissionPolicy.js';
import { authoredPrewarmRequestsForEntities } from '../partsLibrary.js';
import { entityVisualCullRadius } from '../visualCullRadius.js';
import { isAuthoredPendingStatus } from '../entityMeshVisibility.js';
import { entityMatchesWaveHullRunway, isPresentationLedgerRow, ledgerAwarePos } from '../../world/presentationSources.js';
import { itineraryPositionInto, itineraryVelocityInto } from '../../world/worldCatchup.js';
import { PRESENTATION_TIER } from '../../world/activityClassification.js';

export const _residencyLookDelta = { x: 0, z: 0 };
// classifyTableBand reads its options object synchronously, so one pooled args
// struct serves every band call — the glass/runway predicates fire per entity
// per drain and per-poll and a fresh literal per call is pure churn.
const _bandArgs = { dx: 0, dz: 0, glassHalfX: 0, glassHalfZ: 0, runwayWu: 0, radius: 0 };
export function _bandArgsFor(dx, dz, glassHalfX, glassHalfZ, runwayWu, radius) {
  _bandArgs.dx = dx;
  _bandArgs.dz = dz;
  _bandArgs.glassHalfX = glassHalfX;
  _bandArgs.glassHalfZ = glassHalfZ;
  _bandArgs.runwayWu = runwayWu;
  _bandArgs.radius = radius;
  return _bandArgs;
}
export function entityHomeSectorMismatch(entity, state) {
  const data = entity && entity.data || {};
  const homeSectorId = entity && entity.homeSectorId || data.homeSectorId;
  if (!homeSectorId || homeSectorId === (state && state.world && state.world.currentSectorId)) {
    return false;
  }
  return !!(state && state.render && (
    state.render.liveSectorGpuAdmission === true
    || state.render.sectorShellAdmission === true));
}

export function sectorPrewarmPopulationNeedsSynchronousRefresh(record) {
  return record?.active === true
    && (record.populationSeeded !== true || record.populationCoverageDirty === true);
}

export function playerEntityForRenderState(state) {
  return state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : null;
}

export function entityIsExplicitRenderFocus(entity, state) {
  if (!entity || !state) return false;
  if (entity.id === state.playerId || entity.isPlayer === true) return true;
  if (entity.flags && (entity.flags.forceRender || entity.flags.neverCull)) return true;
  const playerEntity = playerEntityForRenderState(state);
  const targetId = state.player && state.player.targetId != null
    ? state.player.targetId
    : playerEntity && playerEntity.targetId;
  return targetId != null && entity.id === targetId;
}

// Shelf-time pos for dormant ledger rows freezes at shelf; the shared ledgerAwarePos in
// presentationSources catches them up (itinerary when the row carries an intent, ballistic
// otherwise) — every queue-side and render-side glass verdict reads the same projection.

export function entityWithinPlayerRadius(entity, state, radius) {
  if (!entity || !entity.pos || !Number.isFinite(entity.pos.x) || !Number.isFinite(entity.pos.z)) return false;
  const player = playerEntityForRenderState(state);
  if (!player || !player.pos || !Number.isFinite(player.pos.x) || !Number.isFinite(player.pos.z)) return false;
  const epos = ledgerAwarePos(entity, state);
  const delta = tableLookAtDelta(state, player.pos, epos, _residencyLookDelta);
  const visual = entityVisualCullRadius(entity, entity.mesh);
  const reach = Math.max(0, Number(radius) || 0) + visual;
  const reach2 = reach * reach;
  if (delta.x * delta.x + delta.z * delta.z <= reach2) return true;
  // The collect disc unions the player leg so the destination cohort cooks during a
  // post-relocate focus lag — keep must hold the same rows or they would build then
  // evict on every poll until the glass lands. Steady state (focus at/near the
  // player) the legs coincide and nothing extra stays resident.
  const relPx = (Number.isFinite(epos && epos.x) ? epos.x : 0) - player.pos.x;
  const relPz = (Number.isFinite(epos && epos.z) ? epos.z : 0) - player.pos.z;
  return relPx * relPx + relPz * relPz <= reach2;
}

// Every liveTableCamera caller reads the fields synchronously in the same expression that
// follows the call (residency/shadow radii, admission env, glass extents) and none retains
// the struct — one pooled env like _admissionEnv, with `out` left for a caller that ever
// needs its own copy.
const _liveTableCamera = { zoom: 0, prefetchZoom: 0, fov: 0, tilt: 0, aspect: 0 };

export function liveTableCamera(state, out = _liveTableCamera) {
  const camera = state && state.camera || {};
  const video = state && state.settings && state.settings.video || {};
  const requested = Number.isFinite(camera.zoom) ? camera.zoom : NaN;
  const live = Number.isFinite(camera.liveZoom) ? camera.liveZoom : NaN;
  const zoom = Number.isFinite(live) ? live : (Number.isFinite(requested) ? requested : 144);
  const prefetchZoom = tablePrefetchZoomFromState(state);
  const fov = Number.isFinite(camera.fov) ? camera.fov
    : (Number.isFinite(video.fov) ? video.fov : 50);
  const tilt = Number.isFinite(camera.tilt) ? camera.tilt : 60;
  const aspect = Number.isFinite(camera.aspect) && camera.aspect > 0 ? camera.aspect : 16 / 9;
  out.zoom = zoom;
  out.prefetchZoom = prefetchZoom;
  out.fov = fov;
  out.tilt = tilt;
  out.aspect = aspect;
  return out;
}

export function liveShadowCastRadius(state) {
  const cam = liveTableCamera(state);
  return tableShadowCasterRadius(cam.zoom, cam.fov, cam.aspect, cam.tilt, SHADOW_ORTHO_EXTENT);
}

export function renderResidencyRadius(state, kind = 'prefetch', entity = null) {
  const speed = tableTravelSpeed(state);
  const cam = liveTableCamera(state);
  // Both radii read the SAME zoom. Evict used the live zoom alone while prefetch used
  // max(live, requested): the moment the player wheeled out (requested 330, live still damped at
  // 144) prefetch was 766 WU and evict 595 WU — evict INSIDE prefetch — so every mesh in that
  // 170 WU annulus was built and destroyed on each 0.25 s poll, burning the build budget that
  // the rocks actually reaching the glass needed. Hysteresis only exists if evict >= prefetch.
  const radius = kind === 'evict'
    ? residencyEvictRadius(speed, cam.prefetchZoom, cam.fov, cam.aspect, cam.tilt)
    : residencyPrefetchRadius(speed, cam.prefetchZoom, cam.fov, cam.aspect, cam.tilt);
  // Ships/wrecks admit at the longer decode runway. Evicting at the ordinary mesh
  // runway removed and rebuilt the same hull on every poll in that outer annulus.
  return kind === 'evict' && (entity?.type === 'ship' || entity?.type === 'wreck')
    ? Math.max(radius, authoredResidencyEvictRadius(speed))
    : radius;
}

/** True once an entity's visual root carries a finished authored identity — i.e. the decode and
 * composition were already paid for. Distinct from "has a mesh": a procedural fallback boundary is
 * cheap to rebuild and must not pin residency. */
export function entityHasAuthoredResidentRoot(entity) {
  const root = entity && (entity.mesh || (entity.view && entity.view.root)) || null;
  const authoredState = root && root.userData ? root.userData.authoredAssetState : null;
  return typeof authoredState === 'string' && authoredState.startsWith('authored');
}

/** True while an entity's visual root is mid-admission — a decode already paid for.
 * Inside the landmark keep runway it counts as resident so an evict poll cannot
 * restart the paid decode by dropping the root it is streaming into. */
export function entityHasAuthoredPendingRoot(entity) {
  const root = entity && (entity.mesh || (entity.view && entity.view.root)) || null;
  const authoredState = root && root.userData ? root.userData.authoredAssetState : null;
  return isAuthoredPendingStatus(authoredState);
}

/** Keep-distance for the landmark residency bound, measured from the live look-at
 * like the rest of the keep/evict radii; Infinity without a player or position. */
export function landmarkKeepDistanceWu(entity, state) {
  const player = playerEntityForRenderState(state);
  if (!player || !player.pos || !entity || !entity.pos) return Infinity;
  const delta = tableLookAtDelta(state, player.pos, ledgerAwarePos(entity, state), _residencyLookDelta);
  return Math.hypot(delta.x, delta.z);
}

export function inboundDecodeRadius(state, radius = null) {
  const numeric = Number(radius);
  if (radius != null && Number.isFinite(numeric)) return numeric;
  return authoredPrefetchRadius(tableTravelSpeed(state));
}

const _admissionEnv = { anchorX: 0, anchorZ: 0, pvx: 0, pvz: 0, glassR: 0 };
const _admissionAnchor = { x: 0, z: 0 };

/**
 * Shared prediction frame for admission tests: the live look-at (while it is
 * near the player), the player velocity the look-at translates with, and the
 * live glass corner. Computed once per residency pass, not per entity.
 */
export function renderAdmissionEnv(state, out = _admissionEnv) {
  const player = playerEntityForRenderState(state);
  const cam = liveTableCamera(state);
  // Admit-side predictions read the composed zoom (max of live + requested): while a wheel-out
  // is still damping, entities already inside the requested frame would otherwise wait for the
  // catch-up before their decode starts. The deny side keeps live zoom (see renderResidencyRadius).
  out.glassR = glassCornerWu(cam.prefetchZoom, cam.fov, cam.aspect, cam.tilt);
  // The chase focus IS the frame's destination: at speed it leads the player ~400 WU, so a
  // capped anchor would let the admission centre trail the actual glass by that whole lead.
  // When focus is finite it is the anchor; only the no-focus fallback uses the player pos.
  const anchor = admissionAnchorPos(
    state,
    player && player.pos,
    Number.POSITIVE_INFINITY,
    _admissionAnchor,
  );
  out.anchorX = anchor.x;
  out.anchorZ = anchor.z;
  out.pvx = Number(player && player.vel && player.vel.x) || 0;
  out.pvz = Number(player && player.vel && player.vel.z) || 0;
  return out;
}

/**
 * Player-anchored twin of the focus-anchored env: after a relocate the focus can
 * trail the player by thousands of WU while it crawls over, and rows admitted on
 * the player leg would otherwise never satisfy a focus-anchored glass measure
 * until the glass lands. Same cook-from-the-player precedent as
 * isInboundDecodeHull. Null when the focus anchor already IS the player (the
 * common steady state — callers skip the second measure).
 */
export function playerAnchoredAdmissionEnv(state, env) {
  const player = playerEntityForRenderState(state);
  const px = Number(player && player.pos && player.pos.x) || 0;
  const pz = Number(player && player.pos && player.pos.z) || 0;
  if (!env || (env.anchorX === px && env.anchorZ === pz)) return null;
  return { glassR: env.glassR, anchorX: px, anchorZ: pz, pvx: env.pvx, pvz: env.pvz };
}

/**
 * Seconds until the entity sits inside the glass corner of the moving view
 * anchor — the approach-aware runway a fixed disc cannot express. Far ledger
 * rows are extrapolated ballistically first: their stored pos froze at shelf
 * time. Infinity when it never enters inside the horizon.
 */
const _ledgerPredVel = { x: 0, z: 0 };

// Prediction velocity for a ledger row: advanceWorldRecord zeroes vel on itinerary rows
// (the schedule carries the motion, not the drift), so entity.vel would mark inbound
// traffic as static and shrink every glass runway ~2x. Use the itinerary cruise speed
// when the row has a live schedule; stored vel otherwise. Widens prediction only —
// earlier admission is the safe direction.
const _predVelStored = { x: 0, z: 0 };

export function predictionVel(entity, state, out = _predVelStored) {
  const vel = entity && entity.vel;
  if (isPresentationLedgerRow(entity) && entity.intent
      && Number.isFinite(entity.lastExactT)) {
    const simTime = Number.isFinite(state && state.simTime)
      ? state.simTime
      : ((state && state.tick) | 0) / 60;
    const along = itineraryVelocityInto(entity.intent, simTime, _ledgerPredVel);
    if (along) {
      out.x = along.x;
      out.z = along.z;
      return out;
    }
  }
  out.x = Number(vel && vel.x) || 0;
  out.z = Number(vel && vel.z) || 0;
  return out;
}

// An itinerary row's schedule — not its current-leg velocity — is its trajectory. Sampling
// itineraryPositionInto over the horizon prices pre-departure waits and post-arrival stops
// exactly the way the catch-up sweep will play them; straight-line extrapolation at the
// current leg's cruise would over-predict both (and under-predict a leg ending inside the
// window). Non-itinerary rows keep the closed-form quadratic.
const _itineraryGlassScratch = { x: 0, z: 0 };

export function itineraryTimeToGlassSeconds(entity, env, simTime, radius, horizonS) {
  let prevT = 0;
  for (let i = 1; i <= 8; i += 1) {
    const t = (horizonS * i) / 8;
    const pos = itineraryPositionInto(entity.intent, simTime + t, _itineraryGlassScratch);
    if (!pos) continue;
    const dx = pos.x - (env.anchorX + env.pvx * t);
    const dz = pos.z - (env.anchorZ + env.pvz * t);
    if (dx * dx + dz * dz <= radius * radius) {
      let lo = prevT;
      let hi = t;
      for (let j = 0; j < 6; j += 1) {
        const mid = (lo + hi) / 2;
        const probe = itineraryPositionInto(entity.intent, simTime + mid, _itineraryGlassScratch);
        if (!probe) break;
        const mx = probe.x - (env.anchorX + env.pvx * mid);
        const mz = probe.z - (env.anchorZ + env.pvz * mid);
        if (mx * mx + mz * mz <= radius * radius) hi = mid;
        else lo = mid;
      }
      return hi;
    }
    prevT = t;
  }
  return Infinity;
}

/** Drawn-envelope radius for admission timing — the same measure the cull band grades on
 * (a pending boundary's stamped estimate already classifies at √2·placeTargetRadius), so
 * admission predicates must not grade late against the circle the renderer draws. */
export function admissionVisualRadiusWu(entity) {
  let visual = entityVisualCullRadius(entity, entity && entity.mesh);
  const declaredRadius = declaredPlaceTargetRadius(entity);
  if (Number.isFinite(declaredRadius) && declaredRadius > 0) {
    visual = Math.max(visual, declaredRadius * Math.SQRT2);
  }
  return visual;
}

export function entityTimeToGlassSeconds(entity, env, state, horizonS = TABLE_PROMOTE_HORIZON_SECONDS, padWu = 0) {
  const pos = entity && entity.pos;
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return Infinity;
  const ledgerPos = ledgerAwarePos(entity, state);
  const ex = ledgerPos.x;
  const ez = ledgerPos.z;
  // Presence radius, not the collision proxy: a big authored body's surface reaches
  // the glass long before its centre+radius math says it does.
  const visual = admissionVisualRadiusWu(entity);
  const radius = env.glassR + visual + (Number(padWu) || 0);
  if (isPresentationLedgerRow(entity) && entity.intent && Number.isFinite(entity.lastExactT)) {
    const simTime = Number.isFinite(state && state.simTime)
      ? state.simTime
      : ((state && state.tick) | 0) / 60;
    const dx = ex - env.anchorX;
    const dz = ez - env.anchorZ;
    if (dx * dx + dz * dz <= radius * radius) return 0;
    return itineraryTimeToGlassSeconds(entity, env, simTime, radius, horizonS);
  }
  const pvel = predictionVel(entity, state);
  const relVx = pvel.x - env.pvx;
  const relVz = pvel.z - env.pvz;
  return timeToEnterRadiusSeconds(
    ex - env.anchorX,
    ez - env.anchorZ,
    relVx,
    relVz,
    radius,
    horizonS,
  );
}

export function playerPlanarDistance(entity, state) {
  const player = playerEntityForRenderState(state);
  if (!player || !player.pos || !entity || !entity.pos) return Infinity;
  const dx = (Number(entity.pos.x) || 0) - (Number(player.pos.x) || 0);
  const dz = (Number(entity.pos.z) || 0) - (Number(player.pos.z) || 0);
  return Math.hypot(dx, dz);
}

/** True when a live inbound hull is already inside the authored decode circle. */
export function isInboundDecodeHull(entity, state, radius = null, admissionEnv = null) {
  if (!entity || entity.alive === false) return false;
  if (entity.isPlayer === true || (state && entity.id === state.playerId)) return false;
  const stationBoundary = entity.type === 'station';
  if (!stationBoundary
      && entity.type !== 'ship' && entity.type !== 'wreck' && entity.type !== 'drone'
      && entity.type !== 'payload' && entity.type !== 'beacon') return false;
  // Promote and catch-up are player-centered. tableLookAtDelta follows the
  // leftover chase focus, so a relocate leaves the hull "beyond the table"
  // until the camera crawls 10k+ WU. Cook from the player, not the look-at.
  const visual = admissionVisualRadiusWu(entity);
  if ((playerPlanarDistance(entity, state) - visual) <= inboundDecodeRadius(state, radius)) {
    return true;
  }
  // An explicit radius is a hysteresis caller's bound (evict/admit edge). Keep it
  // a pure disc test; prediction only extends the default admission radius.
  // Stations are exempt: a boundary evicted on the disc alone mid-compose would
  // restart a paid decode, so the station evict edge runs the approach clause.
  if (radius != null && !stationBoundary) return false;
  // Approach-aware admission: a hull closing on the glass inside the promote
  // horizon gets its decode+build chain started while it is still outside the
  // static circle. entityTimeToGlassSeconds extrapolates shelved far rows from
  // lastExactT first — their stored pos is stale for anything that kept moving.
  // Stations approach on the full authored decode runway — the same horizon
  // kickDecodeRunwayAssets decodes them on — while hulls keep the promote horizon.
  // Shared definition: every serial-lane predicate grades the same per-type ladder.
  const horizon = authoredRunwayHorizonSeconds(entity);
  const player = playerEntityForRenderState(state);
  if (!player || !player.pos) return false;
  const env = admissionEnv || renderAdmissionEnv(state);
  const pad = approachDistanceWu(TABLE_SUBMIT_APPROACH_SECONDS, tableTravelSpeed(state));
  return entityTimeToGlassSeconds(
    entity,
    env,
    state,
    horizon,
    pad,
  ) <= horizon;
}

/** Hold the cooked GPU working set so first-flight travel cannot evict+rebuild it. */
export function holdFirstFlightStreaming(state) {
  if (!state || state.mode !== 'flight') return false;
  if (state.render && (
    state.render.liveSectorGpuAdmission === true
    || state.render.sectorShellAdmission === true
  )) return false;
  const until = Number(state.render && state.render.firstFlightResidencyHoldUntil);
  if (Number.isFinite(until)) return (Number(state.simTime) || 0) < until;
  return (Number(state.simTime) || 0) < 20;
}

/** True while a survival run is live — the crucible cooks its whole arena behind the shell. */
export function survivalRunHoldsArena(state) {
  const run = state && state.run;
  return !!(run && run.kind === 'survival' && run.phase && run.phase !== 'inactive');
}

/**
 * Sector-arrival staging eligibility: does THIS body carry its own authored plan to prepare?
 * The request builder appends the sector-wide spawnable-archetype set by default, which made every
 * procedural rock, hidden site proxy and art-less fx "eligible". None of them can reach prepared
 * admission, so the certified arrival set failed on every entry, and every body in it (the Wreck
 * Cathedral included) stayed undrawn until the set was thrown away and rebuilt (~45 s measured).
 * A mesh-less proxy never gets a boundary at all — the same law as isEntityRenderRelevant.
 */
export function entityHasOwnSectorPrewarmPlan(entity, sectorId, playerId = null) {
  if (!entity || entity.alive === false || entity._noMesh) return false;
  return authoredPrewarmRequestsForEntities([entity], {
    sectorId,
    playerId,
    includeSpawnableArchetypes: false,
  }).length > 0;
}

// shouldKeepPersistentLandmarkResident reads its options synchronously — one pooled
// struct per residency evaluation instead of a six-field literal per entity per poll.
const _landmarkKeepOpts = {
  mode: null, currentSectorId: null, authoredResident: false,
  authoredPending: false, distanceWu: 0, travelSpeedWu: 0,
};
export function _landmarkKeepOptsFor(entity, state) {
  _landmarkKeepOpts.mode = state && state.mode;
  _landmarkKeepOpts.currentSectorId = state && state.world && state.world.currentSectorId;
  _landmarkKeepOpts.authoredResident = entityHasAuthoredResidentRoot(entity);
  _landmarkKeepOpts.authoredPending = entityHasAuthoredPendingRoot(entity);
  _landmarkKeepOpts.distanceWu = landmarkKeepDistanceWu(entity, state);
  _landmarkKeepOpts.travelSpeedWu = tableTravelSpeed(state);
  return _landmarkKeepOpts;
}

// Activity-frame glass/runway membership: Set.has when the frame publishes a real set,
// array includes for the serialized/lite frames — hoisted so the per-entity residency
// poll does not re-allocate the probe closure.
export function activityFrameListsId(collection, id) {
  return collection && typeof collection.has === 'function'
    ? collection.has(id)
    : Array.isArray(collection) && collection.includes(id);
}


export function isFirstFlightProtectedEntity(entity) {
  const data = entity && entity.alive !== false ? entity.data : null;
  return !!(data && (data.rescue === true || data.onboardingTraining === true));
}

/**
 * Entities the first-flight streaming hold must not starve: the rescue set piece,
 * explicit render focus (player, target lock, forced roots), and whatever the activity
 * frame currently has on the readable glass. The set is small by construction; the bulk
 * runway keeps the hold so the cooked working set survives first flight.
 */
export function isHoldExemptMeshBuildCore(entity, state, glassIds, onReadableGlass, admissionEnv) {
  if (!entity || entity.alive === false) return false;
  if (isFirstFlightProtectedEntity(entity)) return true;
  if (entityIsExplicitRenderFocus(entity, state)) return true;
  if (glassIds) {
    if (typeof glassIds.has === 'function' ? glassIds.has(entity.id) : glassIds.includes(entity.id)) {
      return true;
    }
  }
  // The activity frame can only name combat-list entities, so field rocks and dressing rows were
  // never exempt: anything not cooked during loading could not build for the first 20 s of
  // flight, however squarely it sat on screen. The hold protects the opening from work the
  // player cannot see; a row on the live glass is work the player is looking at the absence of.
  // Builds stay inside the ordinary per-poll budget and time slice.
  if (onReadableGlass(entity)) return true;
  // Lane C — residency prefetch window under the hold. Waiting until a row crosses the
  // glass band pays first mesh build on-glass (crucible soft-GPU: asteroid builds at
  // +11.5 s while hold still owns streaming). Approach time uses the same seconds×speed
  // constants as the ordinary runway; a parked far R1_RUNWAY row still stays deferred.
  //
  // Ledger rocks already enter the presentation list on TABLE_COLLECT_HORIZON_SECONDS
  // (player-vel projection for parked static rows). Keeping hold-exempt on the tighter
  // prefetch window left those approach rocks listed but unbuilt until hold release —
  // the +20 s asteroid dump on soft-GPU crucible seed 4242. Match the collect horizon
  // for ledger rows only; combat-list hulls stay on the prefetch window.
  //
  // Wave-planned hull keys (Choice B) are next-contact by schedule — owe their mesh under
  // the hold even when spawn distance sits on the glass lip (~165 WU vs ~163 halfX).
  if (entityMatchesWaveHullRunway(entity, state)) return true;
  const env = admissionEnv();
  const hull = entity.type === 'ship' || entity.type === 'wreck'
    || entity.type === 'drone' || entity.type === 'payload' || entity.type === 'beacon';
  // Station/hull rows ride the shared authored ladder (station→decode runway,
  // hull→promote horizon); ledger + other rows keep their own horizon names.
  const horizon = entity.type === 'station' || hull
    ? authoredRunwayHorizonSeconds(entity)
    : isPresentationLedgerRow(entity)
      ? TABLE_COLLECT_HORIZON_SECONDS
      : TABLE_RESIDENCY_PREFETCH_SECONDS;
  const tGlass = entityTimeToGlassSeconds(entity, env, state, horizon);
  return tGlass <= horizon;
}


const _holdExemptLookOrigin = { x: 0, z: 0 };
const _holdExemptEnv = { anchorX: 0, anchorZ: 0, pvx: 0, pvz: 0, glassR: 0 };

/**
 * One poll's worth of invariant terms for the hold-exempt scan. enqueueHoldExemptMeshBuilds
 * evaluates ~100+ presentation entities each collect, and entityIsOnReadableGlass used to
 * re-derive the player entity, the live table camera and the glass half extents (trig) for
 * every row; renderAdmissionEnv re-derived the same player and camera again in the approach
 * tail. All of it is fixed inside one call, so it is computed once here.
 */
export function makeHoldExemptScanContext(state) {
  const player = playerEntityForRenderState(state);
  const cam = liveTableCamera(state);
  const travelSpeedWu = tableTravelSpeed(state);
  return {
    player,
    glass: glassHalfExtents(cam.zoom, cam.fov, cam.aspect, cam.tilt),
    lookOrigin: tableLookAtOrigin(state, player && player.pos, _holdExemptLookOrigin),
    env: renderAdmissionEnv(state, _holdExemptEnv),
    // Per-walk invariants the per-row predicates used to re-derive (player
    // lookup + camera + travel speed + prefetch disc) — verdict-identical
    // since none of them read the entity.
    travelSpeedWu,
    prefetchRadius: residencyPrefetchRadius(travelSpeedWu, cam.prefetchZoom, cam.fov, cam.aspect, cam.tilt),
    // playerAnchoredAdmissionEnv allocs a fresh object per call — computed
    // lazily here the first time a walk actually asks (steady state = null).
    envPlayer: undefined,
    envPlayerReady: false,
  };
}

/** Lazily materialized playerAnchoredAdmissionEnv — one alloc per walk, never per row. */
export function scanEnvPlayer(state, scan) {
  if (scan.envPlayerReady !== true) {
    scan.envPlayerReady = true;
    scan.envPlayer = playerAnchoredAdmissionEnv(state, scan.env);
  }
  return scan.envPlayer;
}

/** landmarkKeepDistanceWu with the player + look-at already resolved — same math, same order. */
export function landmarkKeepDistanceWuScan(entity, state, scan) {
  const player = scan.player;
  if (!player || !player.pos || !entity || !entity.pos) return Infinity;
  const epos = ledgerAwarePos(entity, state);
  const dx = (Number.isFinite(epos && epos.x) ? epos.x : 0) - scan.lookOrigin.x;
  const dz = (Number.isFinite(epos && epos.z) ? epos.z : 0) - scan.lookOrigin.z;
  return Math.hypot(dx, dz);
}

export function _landmarkKeepOptsForScan(entity, state, scan) {
  _landmarkKeepOpts.mode = state && state.mode;
  _landmarkKeepOpts.currentSectorId = state && state.world && state.world.currentSectorId;
  _landmarkKeepOpts.authoredResident = entityHasAuthoredResidentRoot(entity);
  _landmarkKeepOpts.authoredPending = entityHasAuthoredPendingRoot(entity);
  _landmarkKeepOpts.distanceWu = landmarkKeepDistanceWuScan(entity, state, scan);
  _landmarkKeepOpts.travelSpeedWu = scan.travelSpeedWu;
  return _landmarkKeepOpts;
}

/** entityWithinPlayerRadius with the player + look-at already resolved — same math, same order. */
export function entityWithinPlayerRadiusScan(entity, state, radius, scan) {
  if (!entity || !entity.pos || !Number.isFinite(entity.pos.x) || !Number.isFinite(entity.pos.z)) return false;
  const player = scan.player;
  if (!player || !player.pos || !Number.isFinite(player.pos.x) || !Number.isFinite(player.pos.z)) return false;
  const epos = ledgerAwarePos(entity, state);
  const dx = (Number.isFinite(epos && epos.x) ? epos.x : 0) - scan.lookOrigin.x;
  const dz = (Number.isFinite(epos && epos.z) ? epos.z : 0) - scan.lookOrigin.z;
  const visual = entityVisualCullRadius(entity, entity.mesh);
  const reach = Math.max(0, Number(radius) || 0) + visual;
  const reach2 = reach * reach;
  if (dx * dx + dz * dz <= reach2) return true;
  const relPx = (Number.isFinite(epos && epos.x) ? epos.x : 0) - player.pos.x;
  const relPz = (Number.isFinite(epos && epos.z) ? epos.z : 0) - player.pos.z;
  return relPx * relPx + relPz * relPz <= reach2;
}

/** entityIsOnReadableGlass with the per-poll terms already resolved — same math, same order. */
export function entityIsOnReadableGlassScan(entity, state, scan) {
  if (!entity || !state) return false;
  if (entityIsExplicitRenderFocus(entity, state)) return true;
  const player = scan.player;
  if (!player || !player.pos || !entity.pos) return false;
  const glass = scan.glass;
  const scanPos = ledgerAwarePos(entity, state);
  _residencyLookDelta.x = (Number.isFinite(scanPos.x) ? scanPos.x : 0) - scan.lookOrigin.x;
  _residencyLookDelta.z = (Number.isFinite(scanPos.z) ? scanPos.z : 0) - scan.lookOrigin.z;
  const band = classifyTableBand(_bandArgsFor(
    _residencyLookDelta.x,
    _residencyLookDelta.z,
    glass.halfX,
    glass.halfZ,
    TABLE_FRAME_SKIRT_WU,
    entityVisualCullRadius(entity, entity.mesh),
  ));
  return band === TABLE_BAND.GLASS || band === TABLE_BAND.RUNWAY;
}

/** entityIsOnDeadlineGlass with the per-poll terms already resolved — same math, same order. */
export function entityIsOnDeadlineGlassScan(entity, state, scan) {
  if (!entity || entity.alive === false || !state) return false;
  if (entityIsExplicitRenderFocus(entity, state)) return true;
  if (entity.activity && entity.activity.presentationTier === PRESENTATION_TIER.R0_GLASS) return true;
  const frame = state.render && state.render.activityFrame;
  const glassIds = frame && frame.renderGlassIds;
  const listed = glassIds && typeof glassIds.has === 'function'
    ? glassIds.has(entity.id)
    : Array.isArray(glassIds) && glassIds.includes(entity.id);
  if (listed === true) return true;
  const player = scan.player;
  if (!player || !player.pos || !entity.pos) return false;
  const glass = scan.glass;
  const scanPos = ledgerAwarePos(entity, state);
  _residencyLookDelta.x = (Number.isFinite(scanPos.x) ? scanPos.x : 0) - scan.lookOrigin.x;
  _residencyLookDelta.z = (Number.isFinite(scanPos.z) ? scanPos.z : 0) - scan.lookOrigin.z;
  return classifyTableBand(_bandArgsFor(
    _residencyLookDelta.x,
    _residencyLookDelta.z,
    glass.halfX,
    glass.halfZ,
    0,
    entityVisualCullRadius(entity, entity.mesh),
  )) === TABLE_BAND.GLASS;
}

/**
 * The exempt predicate for one collect pass: identical answers to isHoldExemptMeshBuild
 * (pinned by test/hold-exempt-scan.test.mjs) with the camera/glass/player/env terms hoisted.
 */
export function makeHoldExemptMeshBuildEvaluator(state, glassIds) {
  const scan = makeHoldExemptScanContext(state);
  return (entity) => isHoldExemptMeshBuildCore(
    entity,
    state,
    glassIds,
    (e) => entityIsOnReadableGlassScan(e, state, scan),
    () => scan.env,
  );
}
