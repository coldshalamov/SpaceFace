// Tabletop render policy for a tilted top-down chase camera.
//
// SpaceFace is a table, not a horizon flight sim. Default glass is ~170x100 WU;
// maximum zoom-out is still only a few hundred units across. Submit, residency,
// and shadows follow glass + a short measured approach runway (fast-ship travel
// in a fraction of a second), never a multi-thousand-unit fake-visible box.
//
// Pure functions only. The renderer and probes share these numbers so tests can
// drive the same policy the live path uses.

import { viewHalfExtents } from './entityViewSyncBand.js';
import { PROJECTILE_DRAW_PAD_WU } from '../combat/projectileFlight.js';
import { damp } from '../core/math.js';
import { entityWeaponBlocked } from '../combat/runtime.js';
import { isHostileToPlayer } from '../systems/scannerReadModel.js';
import { resolveGovernedCombatSpeed } from '../core/flight/propulsionCatalog.js';
import {
  readOwnedExceptionalSpeed,
  readVelocityLanguage,
  resolveExceptionalSpeed,
  VL_EXCEPTIONAL_SPEED_RATIO_MAX,
} from './velocityLanguage.js';
import { BOOST_LAG_FRACTION } from '../presentation/flightOverheadMath.js';

// The shared chase-framing derivation below was lifted verbatim out of camera.js
// (see the section header further down). These two locals mirror camera.js's own
// 4-line helpers so the moved text is byte-identical, not subtly different math.
function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, finiteOr(value, 0)));
}

const _glassCache = {
  zoom: NaN,
  fov: NaN,
  aspect: NaN,
  tilt: NaN,
  result: { halfX: 0, halfZ: 0 },
};

/**
 * Same normalized-input memo as _glassCache, declared up here because the module-init
 * TABLE_HEARING_FAR_WU / TABLE_AI_AUTHORITY_WU constants call through it: the render cull
 * bounds and the sim classify pass both ask every frame, and the answer only moves with
 * the five terms keyed below. The result is replaced on a miss, never mutated — a
 * retained return keeps the snapshot semantics the old fresh literal had.
 */
const _submitCullCache = {
  zoom: NaN,
  fov: NaN,
  aspect: NaN,
  tilt: NaN,
  speed: NaN,
  result: { glass: { halfX: 0, halfZ: 0 }, runway: 0, halfX: 0, halfZ: 0 },
};

/** Typical live maxSpeed (engine.topSpeed * SPEED_SCALE) used when state has no ship. */
export const TABLE_REFERENCE_SPEED_WU = 160;

/** How far ahead a submitted root may sit so a fast crosser cannot pop. */
export const TABLE_SUBMIT_APPROACH_SECONDS = 0.75;

/**
 * Mesh decode/build runway. Long enough for the two-build/frame drain — and (owner
 * 2026-09-24: bodies were reaching the screen before they finished loading) long
 * enough that a closing hull is built before it can arrive on the glass.
 */
export const TABLE_RESIDENCY_PREFETCH_SECONDS = 3.5;

/**
 * Evict well past prefetch so a ship oscillating on the lip does not thrash — the wider
 * gap also means turning around does not unload the body that was just built.
 */
export const TABLE_RESIDENCY_EVICT_SECONDS = 5.0;

/**
 * Authored GLB decode may take seconds; start well before the mesh runway so the
 * authored body is resident before it can reach the glass (owner 2026-09-24).
 */
export const TABLE_AUTHORED_DECODE_SECONDS = 6.0;

/** Immediate authored radius: already next to the glass. */
export const TABLE_AUTHORED_IMMEDIATE_SECONDS = 1.25;

/**
 * Fastest sustained inbound approach the admission window must anticipate (WU/s).
 * Ship ceilings run engine.topSpeed (~150) x the boost clamp (~2.6) x travel
 * multipliers (~1.4) ~= 550 — but that model under-covers two real exceeders:
 * sling-flung hulls exit at 3x combat cruise (SLING_THROW_EXIT_MULT x 320 = ~960
 * for drive_torch_l traffic), and a shelved row freezes whatever governed its
 * flight — torch_l's travelCeiling (1120) is the catalog's absolute bound. The
 * honest closing bound is the composite: powered axial (~1200) carried into an
 * off-axis sling fling adds the perpendicular throw (~960) — hypot(1200, 960) ≈
 * 1537, ceil to 1550. Two retained states still exceed that: the tether
 * slingshot grants speed >= maxSpeed x SLINGSHOT_SPEED_MULT (1.4 x 1200 = 1680
 * at the torch ceiling), and the authority clamps only control-made speed, so
 * an impact/sling already above the cap — or a shelved row that froze it — keeps
 * it. The catalog's honest bound is the slingshot multiplier over the travel
 * ceiling. Anything faster is a projectile, which carries no authored mesh.
 * This sizes query discs only — per-candidate closing speed still decides
 * admission.
 */
export const TABLE_INBOUND_APPROACH_WU = 1680;

/**
 * Prediction horizon for promote -> decode -> build: the authored decode runway
 * plus residency-poll and build-drain slack between "ledger row" and "pixels".
 */
export const TABLE_PROMOTE_HORIZON_SECONDS = TABLE_AUTHORED_DECODE_SECONDS + 1.5;

/**
 * Longer runway reserved for the entity-level authored GLB prefetch. The plan decode is
 * the long pole on first contact (serial per part root) while the canonical library
 * dedupes by file, so it may start a full decode window ahead of the boundary-build
 * horizon: a hull closing inside this window decodes its authored plan while it is
 * still comfortably off the glass instead of reaching contact as a resolving marker.
 */
export const TABLE_DECODE_RUNWAY_SECONDS = TABLE_PROMOTE_HORIZON_SECONDS
  + TABLE_AUTHORED_DECODE_SECONDS;

/** Collect horizon for ledger rows that build procedurally once admitted. */
export const TABLE_COLLECT_HORIZON_SECONDS = TABLE_RESIDENCY_PREFETCH_SECONDS + 1.0;

/** This close to the glass a pending build must not sit behind ordinary filler. */
export const TABLE_BUILD_URGENT_SECONDS = 1.25;

/** Off-screen doctrine-tell cue sits this far from the player when the glass is wide enough. */
export const TABLE_DOCTRINE_TELL_CUE_WU = 58;

/**
 * Keep the off-screen tell marker on the glass. At close zoom the old
 * 58 WU pin sits outside the frustum, so the warning never appears.
 */
export function tableDoctrineTellCueWu(state) {
  const camera = state && state.camera || {};
  const video = state && state.settings && state.settings.video || {};
  const live = Number.isFinite(camera.liveZoom) ? camera.liveZoom : NaN;
  const requested = Number.isFinite(camera.zoom) ? camera.zoom : NaN;
  const zoom = Number.isFinite(live) ? live : (Number.isFinite(requested) ? requested : 144);
  const fov = Number.isFinite(camera.fov) ? camera.fov
    : (Number.isFinite(video.fov) ? video.fov : 50);
  const aspect = Number.isFinite(camera.aspect) && camera.aspect > 0 ? camera.aspect : 16 / 9;
  const tilt = Number.isFinite(camera.tilt) ? camera.tilt : 60;
  const glass = glassHalfExtents(zoom, fov, aspect, tilt);
  const inner = Math.min(glass.halfX, glass.halfZ) * 0.7;
  return Math.max(18, Math.min(TABLE_DOCTRINE_TELL_CUE_WU, inner));
}

/** Extra world units around the glass that can still throw a readable key-light shadow. */
export const TABLE_SHADOW_SKIRT_WU = 80;

export const TABLE_HEARING_PAN_WU = 200;

/** Hearing follows the max-zoom table box, not a 900 WU horizon. */
export function tableHearingFarWu(
  zoom = 330,
  fovDeg = 50,
  aspect = 16 / 9,
  tiltDeg = 60,
  speed = TABLE_REFERENCE_SPEED_WU,
) {
  const extents = submitCullHalfExtents(zoom, fovDeg, aspect, speed, tiltDeg);
  return Math.hypot(extents.halfX, extents.halfZ);
}

export const TABLE_HEARING_FAR_WU = tableHearingFarWu();

/**
 * Last-resort instance far cull, as a 3D camera distance. Submit already
 * drops off-table roots. This only stops a leaked chunk from paying a
 * leftover 9000 WU horizon. Defaults cover the supported 90° / 330 WU
 * 16:9 table; live callers must pass the actual camera envelope.
 */
const _instanceFarCullCache = { key: '', value: 0 };

export function tableInstanceFarCullWu(
  zoom = 330,
  fovDeg = 90,
  aspect = 16 / 9,
  tiltDeg = 60,
) {
  const distance = Number.isFinite(zoom) ? zoom : 330;
  const fov = Number.isFinite(fovDeg) ? fovDeg : 90;
  const aspectValue = Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9;
  const tilt = Number.isFinite(tiltDeg) ? tiltDeg : 60;
  const key = `${distance}|${fov}|${aspectValue}|${tilt}`;
  if (_instanceFarCullCache.key === key) return _instanceFarCullCache.value;
  const xz = tableHearingFarWu(distance, fov, aspectValue, tilt);
  const camY = distance * Math.sin(tilt * Math.PI / 180);
  const value = Math.hypot(xz, camY);
  _instanceFarCullCache.key = key;
  _instanceFarCullCache.value = value;
  return value;
}

/**
 * Passive AI/traffic may sleep beyond the largest table a player can open.
 * Hostiles and the player stay awake regardless of this number.
 */
export function tableAiAuthorityWu(
  zoom = 330,
  fovDeg = 50,
  aspect = 16 / 9,
  tiltDeg = 60,
  speed = TABLE_REFERENCE_SPEED_WU,
) {
  return tableHearingFarWu(zoom, fovDeg, aspect, tiltDeg, speed);
}

export const TABLE_AI_AUTHORITY_WU = tableAiAuthorityWu();

/**
 * Worst-case deterministic aspect for sim cadence. The live camera uses the
 * raw window ratio with no clamp, so 32:9 under-covers a triple-wide desktop.
 * 48:9 is three 16:9 panes. Still a table at default zoom. Not a live viewport.
 */
export const TABLE_SIM_ASPECT = 48 / 9;

/**
 * Extra world units kept around the readable glass. The mathematical frustum
 * and the chase focus can disagree by a hull radius at the edge of the
 * picture; this skirt is what stops a body from being evicted while a pixel
 * of it is still on screen.
 */
export const TABLE_FRAME_SKIRT_WU = 48;

/**
 * Zoom the mesh runway must cover. The picture uses the live zoom. The runway
 * also covers the zoom the camera is opening toward (`composedZoom`) and the
 * zoom the player asked for, so a zoom-out does not spend a quarter-second
 * with an empty rim.
 */
export function tablePrefetchZoomFromState(state) {
  const camera = state && state.camera || {};
  const live = Number.isFinite(camera.liveZoom) ? camera.liveZoom : 0;
  const requested = Number.isFinite(camera.zoom) ? camera.zoom : 0;
  const composed = Number.isFinite(camera.composedZoom) ? camera.composedZoom : 0;
  return Math.max(live, requested, composed) || 144;
}

/**
 * The walk radius a ledger-row collect must cover — the collect disc plus the full
 * decode-runway travel margin. Shared with the far table's freshness sweep so the rows
 * the presentation collect can draw are exactly the rows the sim keeps pose-fresh.
 */
export function farLedgerScanRadius(state) {
  const speed = tableTravelSpeed(state);
  const camera = (state && state.camera) || {};
  const video = (state && state.settings && state.settings.video) || {};
  const prefetchZoom = tablePrefetchZoomFromState(state);
  const fov = Number.isFinite(camera.fov) ? camera.fov
    : (Number.isFinite(video.fov) ? video.fov : 50);
  const tilt = Number.isFinite(camera.tilt) ? camera.tilt : 60;
  const aspect = Number.isFinite(camera.aspect) && camera.aspect > 0 ? camera.aspect : 16 / 9;
  return residencyPrefetchRadius(speed, prefetchZoom, fov, aspect, tilt)
    + (speed + TABLE_INBOUND_APPROACH_WU) * TABLE_DECODE_RUNWAY_SECONDS;
}

/** Live table envelope. Prefetch uses the wider of live and requested zoom. */
export function tableCameraEnvelope(state) {
  const camera = state && state.camera || {};
  const video = state && state.settings && state.settings.video || {};
  const live = Number.isFinite(camera.liveZoom) ? camera.liveZoom : NaN;
  const requested = Number.isFinite(camera.zoom) ? camera.zoom : NaN;
  const zoom = Math.max(
    Number.isFinite(live) ? live : 0,
    Number.isFinite(requested) ? requested : 0,
  ) || 144;
  const fov = Number.isFinite(camera.fov) ? camera.fov
    : (Number.isFinite(video.fov) ? video.fov : 50);
  const aspect = Number.isFinite(camera.aspect) && camera.aspect > 0 ? camera.aspect : 16 / 9;
  const tilt = Number.isFinite(camera.tilt) ? camera.tilt : 60;
  return { zoom, fov, aspect, tilt };
}

export function tableAiAuthorityWuFromState(state) {
  const cam = tableCameraEnvelope(state);
  return tableAiAuthorityWu(cam.zoom, cam.fov, cam.aspect, cam.tilt);
}

/**
 * Sim-side table envelope. Traffic and bark may not read liveZoom / renderer
 * fov / viewport aspect — those are presentation and would make seeded runs
 * depend on refresh rate and window size.
 */
export function tableSimAuthorityWuFromState(state) {
  const camera = state && state.camera || {};
  const video = state && state.settings && state.settings.video || {};
  const zoom = Number.isFinite(camera.zoom) ? camera.zoom : 144;
  const fov = Number.isFinite(video.fov) ? video.fov : 50;
  const tilt = Number.isFinite(camera.tilt) ? camera.tilt : 60;
  return tableAiAuthorityWu(zoom, fov, TABLE_SIM_ASPECT, tilt);
}

/**
 * Cosmetic VFX follow the same live table as hearing/AI. Off-table trails and
 * station-side lights stay map facts; on-glass VFX is unchanged.
 */
const _vfxDrawCache = { zoom: NaN, fov: NaN, aspect: NaN, tilt: NaN, value: 0 };

export function tableVfxDrawWuFromState(state) {
  const camera = state && state.camera || {};
  const video = state && state.settings && state.settings.video || {};
  const live = Number.isFinite(camera.liveZoom) ? camera.liveZoom : NaN;
  const requested = Number.isFinite(camera.zoom) ? camera.zoom : NaN;
  const zoom = Number.isFinite(live) ? live : (Number.isFinite(requested) ? requested : 144);
  const fov = Number.isFinite(camera.fov) ? camera.fov
    : (Number.isFinite(video.fov) ? video.fov : 50);
  const aspect = Number.isFinite(camera.aspect) && camera.aspect > 0 ? camera.aspect : 16 / 9;
  const tilt = Number.isFinite(camera.tilt) ? camera.tilt : 60;
  if (
    _vfxDrawCache.zoom === zoom
    && _vfxDrawCache.fov === fov
    && _vfxDrawCache.aspect === aspect
    && _vfxDrawCache.tilt === tilt
  ) {
    return _vfxDrawCache.value;
  }
  const value = tableHearingFarWu(zoom, fov, aspect, tilt);
  _vfxDrawCache.zoom = zoom;
  _vfxDrawCache.fov = fov;
  _vfxDrawCache.aspect = aspect;
  _vfxDrawCache.tilt = tilt;
  _vfxDrawCache.value = value;
  return value;
}

export function shouldDrawTableVfx(dx, dz, drawWu) {
  const limit = Number.isFinite(drawWu) && drawWu > 0 ? drawWu : TABLE_HEARING_FAR_WU;
  const x = Number(dx) || 0;
  const z = Number(dz) || 0;
  return (x * x + z * z) <= limit * limit;
}

/** Fitted-tractor inner band. Player-centered; never mixed into the glass radius. */
export const TABLE_LOOT_MAGNET_CAP_WU = 580;

/**
 * Loot-magnet trails need two origins. The tractor cap is the player; the
 * glass cull is the live look-at. Mixing them into one min() drops on-glass
 * trails when combat/tether shoves the camera.
 */
export function shouldDrawLootMagnetTrail(playerDx, playerDz, focusDx, focusDz, tableWu) {
  if (!shouldDrawTableVfx(playerDx, playerDz, TABLE_LOOT_MAGNET_CAP_WU)) return false;
  return shouldDrawTableVfx(focusDx, focusDz, tableWu);
}

/**
 * World-space origin the keep/evict radii measure from: the live look-at
 * (frame-local focus rebased into global) while it exists, else the fallback
 * (usually the player). The ledger collect disc must use this same origin —
 * when the look-at leads the hull, a player-centered disc collects rows the
 * keep radius then evicts, and misses rows the keep radius holds resident.
 */
export function tableLookAtOrigin(state, fallbackPos, out) {
  const target = out || { x: 0, z: 0 };
  const focus = state && state.camera && state.camera.focus;
  const hasFocus = Number.isFinite(focus && focus.x) && Number.isFinite(focus && focus.z);
  if (hasFocus) {
    const frame = state && state.world && state.world.frameOrigin;
    target.x = focus.x + (Number.isFinite(frame && frame.x) ? frame.x : 0);
    target.z = focus.z + (Number.isFinite(frame && frame.z) ? frame.z : 0);
  } else {
    target.x = Number.isFinite(fallbackPos && fallbackPos.x) ? fallbackPos.x : 0;
    target.z = Number.isFinite(fallbackPos && fallbackPos.z) ? fallbackPos.z : 0;
  }
  return target;
}

const _lookAtOriginScratch = { x: 0, z: 0 };

/**
 * Focus is frame-local. World positions stay galactic-global. Convert focus
 * to global with world.frameOrigin before subtracting, or a rebase culls
 * every on-glass light when the camera is shoved.
 */
export function tableLookAtDelta(state, fallbackPos, entityPos, out) {
  const target = out || { x: 0, z: 0 };
  const origin = tableLookAtOrigin(state, fallbackPos, _lookAtOriginScratch);
  target.x = (Number.isFinite(entityPos && entityPos.x) ? entityPos.x : 0) - origin.x;
  target.z = (Number.isFinite(entityPos && entityPos.z) ? entityPos.z : 0) - origin.z;
  return target;
}

/** Loot-magnet alias. Glass origin is the look-at; tractor cap stays on the player. */
export function lootMagnetFocusDelta(state, playerPos, entityPos, out) {
  return tableLookAtDelta(state, playerPos, entityPos, out);
}

/**
 * NPC engine trails used leftover 2200/3600 player-camera horizons.
 * Player and current target stay full. Everyone else follows the live
 * look-at table. Off-glass trails are map facts, not 3D ribbons.
 */
export const TABLE_TRAIL_TIER = Object.freeze({
  FULL: 'full',
  NORMAL: 'normal',
  SKIP: 'skip',
});

export function tableNpcTrailTier(state, entity, playerId, targetId, fallbackPos, out, tableWu) {
  if (!entity || entity.alive === false) return TABLE_TRAIL_TIER.SKIP;
  if (entity.id === playerId) return TABLE_TRAIL_TIER.FULL;
  if (targetId != null && entity.id === targetId) return TABLE_TRAIL_TIER.FULL;
  const drawWu = Number.isFinite(tableWu) && tableWu > 0 ? tableWu : tableVfxDrawWuFromState(state);
  const delta = tableLookAtDelta(state, fallbackPos, entity.pos, out);
  if (shouldDrawTableVfx(delta.x, delta.z, drawWu)) return TABLE_TRAIL_TIER.NORMAL;
  return TABLE_TRAIL_TIER.SKIP;
}

export const TABLE_BAND = Object.freeze({
  GLASS: 'glass',
  RUNWAY: 'runway',
  BEYOND: 'beyond',
});

export function approachDistanceWu(seconds, speed = TABLE_REFERENCE_SPEED_WU) {
  const time = Math.max(0, Number(seconds) || 0);
  const travel = Math.max(0, Number(speed) || 0);
  return time * (travel > 0 ? travel : TABLE_REFERENCE_SPEED_WU);
}

export function tableTravelSpeed(state) {
  const player = state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : null;
  const vel = player && player.vel;
  const vx = Number(vel && vel.x);
  const vz = Number(vel && vel.z);
  const live = vel
    ? Math.hypot(Number.isFinite(vx) ? vx : 0, Number.isFinite(vz) ? vz : 0)
    : 0;
  const liveSpeed = Number.isFinite(live) ? live : 0;
  const maxSpeed = Number(player && player.maxSpeed);
  const ceiling = Number.isFinite(maxSpeed) && maxSpeed > 0 ? maxSpeed : 0;
  return Math.max(TABLE_REFERENCE_SPEED_WU, liveSpeed, ceiling);
}

/**
 * Ground-plane half extents of the tilted chase camera. The old 0.72 sync-band
 * helper under-counted the far corners of a 60° look-down frustum.
 */
export function glassHalfExtents(zoom, fovDeg, aspect, tiltDeg = 60) {
  const distance = Number.isFinite(zoom) ? zoom : 88;
  const fov = Number.isFinite(fovDeg) ? fovDeg : 50;
  const aspectValue = Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9;
  const tiltDegValue = Number.isFinite(tiltDeg) ? tiltDeg : 60;
  if (
    _glassCache.zoom === distance
    && _glassCache.fov === fov
    && _glassCache.aspect === aspectValue
    && _glassCache.tilt === tiltDegValue
  ) {
    return _glassCache.result;
  }
  const tilt = tiltDegValue * Math.PI / 180;
  const camY = distance * Math.sin(tilt);
  const camZ = -distance * Math.cos(tilt);
  const flen = Math.hypot(camY, -camZ) || 1;
  const fwx = 0;
  const fwy = -camY / flen;
  const fwz = -camZ / flen;
  let rx = fwz;
  let ry = 0;
  let rz = -fwx;
  const rlen = Math.hypot(rx, ry, rz) || 1;
  rx /= rlen;
  ry /= rlen;
  rz /= rlen;
  const ux = ry * fwz - rz * fwy;
  const uy = rz * fwx - rx * fwz;
  const uz = rx * fwy - ry * fwx;
  const tanHalf = Math.tan((fov * Math.PI / 180) * 0.5);
  let maxX = 0;
  let maxZ = 0;
  const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  for (const [ndcX, ndcY] of corners) {
    const dx = fwx + rx * ndcX * tanHalf * aspectValue + ux * ndcY * tanHalf;
    const dy = fwy + ry * ndcX * tanHalf * aspectValue + uy * ndcY * tanHalf;
    const dz = fwz + rz * ndcX * tanHalf * aspectValue + uz * ndcY * tanHalf;
    if (!(dy < -1e-6)) continue;
    const hit = -camY / dy;
    if (!(hit > 0)) continue;
    maxX = Math.max(maxX, Math.abs(dx * hit));
    maxZ = Math.max(maxZ, Math.abs(camZ + dz * hit));
  }
  const fallback = (!(maxX > 0 && maxZ > 0))
    ? viewHalfExtents(distance, fov, aspectValue, 1)
    : null;
  _glassCache.zoom = distance;
  _glassCache.fov = fov;
  _glassCache.aspect = aspectValue;
  _glassCache.tilt = tiltDegValue;
  _glassCache.result = fallback
    ? { halfX: fallback.halfX, halfZ: fallback.halfZ }
    : { halfX: maxX, halfZ: maxZ };
  return _glassCache.result;
}

// ---- shared chase-framing derivation (owned here, consumed by camera.js) ----
// These constants and pure functions used to live in src/render/camera.js. They are
// the chase rig's own math — follow() still calls them verbatim — and the sim-lane
// projector (tableChaseFraming + tableWorldToScreen below) needs the identical
// answers without a Three camera, so the single source sits in this Three-free
// module. camera.js imports and re-exports them; nothing here may import Three,
// DOM, or wall time.

const THREAT_COMPOSE_RANGE = 600;
const THREAT_COMPOSE_MAX_BIAS = 70;
const THREAT_COMPOSE_FRACTION = 0.08;
const TETHER_COMPOSE_MAX_BIAS = 64;
const TETHER_COMPOSE_FRACTION = 0.12;
// The throw solver already names where the released body meets its target. Lean the chase
// focus part of the way there so the thing about to be hit stays in the same frame as the
// hull. Capped so a far solution cannot yank the picture off the ship; the safe-rect clamp
// still keeps the hull on screen. This is functional framing, like an active attacker.
const RELEASE_MEETING_FRACTION = 0.4;
const RELEASE_MEETING_MAX_BIAS = 140;

/**
 * Reduced motion softens decorative chase bias. An attacker, a gyre, and a live release
 * meeting stay at full scale: they are the thing the pilot is about to hit or be hit by.
 */
export function chaseCompositionMotionScale(composition, reduced) {
  const soften = reduced ? 0.35 : 1;
  if (!composition) return soften;
  if (composition.hasActiveAttacker || composition.hasGyreFocus || composition.hasReleaseFocus) return 1;
  return soften;
}
// Bounded tactical threat containment (2026-09): the context channel is a gentle, heavily damped
// viewport expansion only — never speed-based FOV breathing, never snap. Hard ceiling +20% total,
// passive hostiles nudge +5-12%, a live attacker earns +15-20% by distance. The functional
// containment machinery (minZoom / group fit below) is untouched by this retune.
export const CONTEXT_ZOOM_MAX = 0.20;
const THREAT_ZOOM_BASE = 0.05;
const THREAT_ZOOM_RANGE = 0.07;
const ACTIVE_THREAT_ZOOM_BASE = 0.15;
const ACTIVE_THREAT_ZOOM_RANGE = 0.05;
const TETHER_ZOOM_BASE = 0.03;
const TETHER_ZOOM_RANGE = 0.06;

/**
 * Pure threat-containment zoom bias. `distanceWu` is the composed threat's distance from the
 * player; `active` marks a contact actively attacking the player. Result is bounded to
 * [0, CONTEXT_ZOOM_MAX] and monotonic non-decreasing in distance — the further the threat, the
 * wider the frame needed to keep it, up to the containment ceiling.
 */
export function resolveThreatZoomBias(distanceWu, active) {
  const d = Number.isFinite(distanceWu) ? Math.max(0, distanceWu) : 0;
  const base = active ? ACTIVE_THREAT_ZOOM_BASE : THREAT_ZOOM_BASE;
  const range = active ? ACTIVE_THREAT_ZOOM_RANGE : THREAT_ZOOM_RANGE;
  return Math.min(CONTEXT_ZOOM_MAX, base + clamp01(d / THREAT_COMPOSE_RANGE) * range);
}
// U13: slightly tighter than the 0.80 pair contract so an active attacker stays readable inside the
// 10% margin even when safe-rect clamping and dodge lead compete for focus.
const ACTIVE_ATTACKER_SAFE_NDC = 0.55;
export const COMPOSITION_BIAS_LERP = 1.6;
export const COMPOSITION_BIAS_SLEW = 90;
// Threat-containment damping: 0.6 s half-life (ln2/λ = 0.6). Exponential damp never overshoots,
// so the widened frame glides out and settles — no throttle pulsing, no aggressive snapping.
export const CONTEXT_ZOOM_DAMP_HALF_LIFE_S = 0.6;
export const CONTEXT_ZOOM_LERP = Math.log(2) / CONTEXT_ZOOM_DAMP_HALF_LIFE_S;
const SAFE_VIEW_X = 0.52;
const SAFE_VIEW_Z = 0.46;
// F4: lead is measured in SECONDS of velocity, not a world-unit cap — a WU cap shrank the lead
// to ~0.1 s of velocity at speed. `camera.lookAhead` (when a finite WU number is authored) remains
// an absolute sanity bound; the 400 WU default only binds at extreme speed.
export const LOOKAHEAD_LEAD_S = 0.5;        // seconds of velocity carried as camera lead
export const LOOKAHEAD_LEAD_MAX_WU = 400;   // wu — absolute sanity bound when no authored cap exists
export const LOOKAHEAD_LEAD_SMOOTHING_S = 0.10; // smooth latest-tick velocity against the presented ship pose
// U13 (WF-15): when an active attacker owns combat framing, velocity look-ahead must not yank the
// pair out of the safe frame during a dodge. Combat keeps 0.6 of the lead — 0.30 s of velocity —
// so the pilot's dodge still reads without the camera abandoning the threat.
export const ACTIVE_ATTACKER_LOOKAHEAD_SCALE = 0.6;
// Sticky composed-threat hold: dense furballs thrash nearest/active identity every few frames and
// the composition bias slews between anchors. Hold the current anchor briefly unless a challenger
// is meaningfully closer or a new active attacker appears.
export const COMPOSITION_THREAT_STICK_S = 0.80;
export const COMPOSITION_THREAT_STICK_CLOSER = 0.85; // INF-006 hysteresis: challenger must be < 85% of sticky distance
// B3b group fit: with one or more hostiles attacking, single-threat composition leaves every
// attacker but the composed pair off-frame — and even a lone attacker holding past ~330 zoom's
// depth reach stays invisible. The group pass fits the player plus every active attacker inside
// GROUP_FIT_RANGE_WU into the frame — centroid focus, a fit-all minZoom, and a per-member sticky
// hold so a juggled targetId cannot pump the frame. Past COMPOSITION_ZOOM_MAX the farthest member
// is dropped rather than zooming the fight to miniatures.
export const CAMERA_ZOOM_MIN = 45;
export const CAMERA_ZOOM_MAX = 330; // Expansive manual zoom-out for sector and tactical visibility.
// The combat-composition ceiling used to live in cameraDirector.js. It is a framing
// policy number, and cameraDirector's own import chain (scanner -> ... -> activityRuntime)
// already terminates inside this module — defining it here makes the dependency
// acyclic: cameraDirector re-exports it from this single definition.
export const CAMERA_DIRECTOR_COMBAT_MAX_ZOOM = 528;
// Combat composition may open beyond the manual zoom ceiling: the report's engagement table holds
// fights out to ~420 wu diagonal, which needs ~420+ of camera distance in the foreshortened depth
// axis. Manual zoom stays at CAMERA_ZOOM_MAX; only an active-attacker fit spends the extra headroom.
export const COMPOSITION_ZOOM_MAX = Math.max(CAMERA_ZOOM_MAX, CAMERA_DIRECTOR_COMBAT_MAX_ZOOM);
const GROUP_FIT_ZOOM_CAP = COMPOSITION_ZOOM_MAX;
export const GROUP_FIT_RANGE_WU = CAMERA_DIRECTOR_COMBAT_MAX_ZOOM;
// Group members are fitted inside the visible frame (the metric's own measure), not the 0.55
// safe rect the single-attacker path guarantees — a furball spread only needs to stay on screen.
const GROUP_FIT_NDC = 0.95;
// The Gyre mouth is 200 WU ahead before it holds anything. Fit its actual work area rather
// than asking the pilot to zoom out by hand; keep the extra reach bounded after a throw.
export const GYRE_COMPOSITION_ZOOM_MAX = 640;
export const GYRE_COMPOSITION_RELEASE_S = 1.6;
export const GYRE_BOWL_COMPOSITION_ZOOM_MAX = 840;
const GROUP_MEMBER_STICK_S = COMPOSITION_THREAT_STICK_S;
const _groupFitScratchByOwner = new WeakMap();
const _groupFitDefaultOwner = {};
function groupFitScratch(owner) {
  let scratch = _groupFitScratchByOwner.get(owner);
  if (!scratch) {
    scratch = { attackers: [], members: [], byId: new Map(), focus: { x: 0, z: 0 }, candidate: [] };
    _groupFitScratchByOwner.set(owner, scratch);
  }
  scratch.attackers.length = 0;
  scratch.members.length = 0;
  scratch.byId.clear();
  return scratch;
}
const AIM_BIAS = 0.02;
const AIM_BIAS_MAX = 18;
// The speed-zoom target is evaluated every frame from a smoothed speed (time constant below),
// not from raw per-frame velocity. The old 8 Hz re-sample (kept as a compat constant) stepped
// the target 6–7 times across the starter's 0.8 s spin-up, which the faster ZOOM_LERP exposed
// as a pulsing zoom.
export const SPEED_ZOOM_SPEED_SMOOTHING_S = 0.1;
export const SPEED_ZOOM_SAMPLE_INTERVAL = 0.125; // legacy: sampling is now per-frame on the smoothed speed.
export const SPEED_ZOOM_MIN = 0.88;  // slowest / idle factor (spec2/02 §2)
export const SPEED_ZOOM_MAX = 1.35;               // was 1.18 — the at-cruise frame widens ~14 %
export const PHYSICS_EARNED_SPEED_ZOOM_MAX = 3.5; // was 1.55 — "max ~3x at ~550" (FEEL_CONTRACT §C)
export const PHYSICS_EARNED_SPEED_RATIO_MAX = VL_EXCEPTIONAL_SPEED_RATIO_MAX;
// Boost framing is asymmetric (F5): the world opens fast on keydown so the press reads as "the
// world opened", then relaxes back slowly enough that release never snaps.
export const BOOST_CAMERA_ZOOM_TARGET = 1.10;
export const BOOST_CAMERA_ZOOM_RISE = 9.5; // /s — ~90% of the target in ~0.24 s
export const BOOST_CAMERA_ZOOM_FALL = 1.2; // /s — a slow, readable return
export const BOOST_CAMERA_ZOOM_LERP = BOOST_CAMERA_ZOOM_RISE; // compat alias
// R1 gameplay-scale reset: 144 WU is the selected normal framing. At 1600×1000 the starter hull
// occupies ~10.6% of frame width while a nearby structure and three actors can share the view. The
// GameState schema owns the same fresh-run default; explicit runtime camera:zoom choices remain exact.
export const DEFAULT_ZOOM = 144;
export const CHASE_ZOOM_DEFAULT = DEFAULT_ZOOM;
export const CHASE_ZOOM_CLOSE = 58; // optional tighter profile (settings.video.chaseClose)
export function resolveAimLead(input, player, out = null) {
  const result = out || {};
  if (!input || !input.aimWorld || !player || !player.pos) {
    result.x = 0;
    result.z = 0;
    return result;
  }
  const px = finiteOr(player.pos.x, 0);
  const pz = finiteOr(player.pos.z, 0);
  const dx = finiteOr(input.aimWorld.x, px) - px;
  const dz = finiteOr(input.aimWorld.z, pz) - pz;
  const d = Math.hypot(dx, dz);
  if (d <= 0.0001) {
    result.x = 0;
    result.z = 0;
    return result;
  }
  const lead = Math.min(AIM_BIAS_MAX, d * AIM_BIAS);
  result.x = (dx / d) * lead;
  result.z = (dz / d) * lead;
  return result;
}

export function recenterBiasScale(remaining, duration) {
  const dur = Number.isFinite(duration) && duration > 0 ? duration : 0;
  if (dur <= 0) return 0;
  const t = clamp01(1 - Math.max(0, finiteOr(remaining, 0)) / dur);
  const smooth = t * t * (3 - 2 * t);
  return 1 - smooth;
}

export function clampFocusToPlayerSafeRect(focus, player, options = {}, out = null) {
  const result = out || {};
  const playerX = player && player.pos && Number.isFinite(player.pos.x) ? player.pos.x : 0;
  const playerZ = player && player.pos && Number.isFinite(player.pos.z) ? player.pos.z : 0;
  if (!player || !player.pos) {
    result.x = focus && Number.isFinite(focus.x) ? focus.x : 0;
    result.z = focus && Number.isFinite(focus.z) ? focus.z : 0;
    result.clamped = false;
    delete result.safeX;
    delete result.safeZ;
    return result;
  }
  const zoom = Number.isFinite(options.zoom) ? options.zoom : DEFAULT_ZOOM;
  const fov = Number.isFinite(options.fov) ? options.fov : 50;
  const aspect = Math.max(0.45, Number.isFinite(options.aspect) ? options.aspect : 16 / 9);
  const halfV = Math.tan((fov * Math.PI / 180) * 0.5) * zoom * 0.72;
  const halfH = halfV * aspect;
  const safeX = Math.max(14, halfH * SAFE_VIEW_X);
  const safeZ = Math.max(22, halfV * SAFE_VIEW_Z);
  let x = focus && Number.isFinite(focus.x) ? focus.x : playerX;
  let z = focus && Number.isFinite(focus.z) ? focus.z : playerZ;
  let clamped = false;
  const dx = x - playerX;
  const dz = z - playerZ;
  if (dx > safeX) { x = playerX + safeX; clamped = true; }
  else if (dx < -safeX) { x = playerX - safeX; clamped = true; }
  if (dz > safeZ) { z = playerZ + safeZ; clamped = true; }
  else if (dz < -safeZ) { z = playerZ - safeZ; clamped = true; }
  result.x = x;
  result.z = z;
  result.clamped = clamped;
  result.safeX = safeX;
  result.safeZ = safeZ;
  return result;
}

export function resolveSpeedZoomFactor(speed, maxSpeed, physicsEarned = false) {
  const shipMax = Math.max(1, finiteOr(maxSpeed, 120));
  const speedRatio = Math.max(0, finiteOr(speed, 0) / shipMax);
  const ordinaryRatio = Math.min(1, speedRatio);
  const ordinaryFactor = SPEED_ZOOM_MIN + (SPEED_ZOOM_MAX - SPEED_ZOOM_MIN) * ordinaryRatio;
  return resolveExceptionalSpeedZoomFactor(
    resolveExceptionalSpeed(speed, shipMax, physicsEarned),
    ordinaryFactor,
  );
}

/** Apply a normalized, owner-validated shared-record scalar to an ordinary camera factor. */
export function resolveExceptionalSpeedZoomFactor(exceptionalSpeed, ordinaryFactor = SPEED_ZOOM_MAX) {
  const base = Number.isFinite(ordinaryFactor) ? ordinaryFactor : SPEED_ZOOM_MAX;
  const intensity = clamp01(exceptionalSpeed);
  return base + (PHYSICS_EARNED_SPEED_ZOOM_MAX - base) * intensity;
}

/**
 * Smooth the small camera-distance cue owned by sustained player boost.
 *
 * Keeping this separate from `pushZoom` prevents boost taps from scheduling a fresh in/out pulse
 * on every release. The helper is pure so the tap-vs-hold continuity contract can be tested without
 * booting Three.js.
 */
export function stepBoostZoomFactor(current, boosting, dt, motionReduced = false) {
  const value = Number.isFinite(current) ? current : 1;
  const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  const target = boosting && !motionReduced ? BOOST_CAMERA_ZOOM_TARGET : 1;
  const rate = target > value ? BOOST_CAMERA_ZOOM_RISE : BOOST_CAMERA_ZOOM_FALL;
  return damp(value, target, rate, step);
}

export function resolveInitialChaseZoom(zoom) {
  const requested = finiteOr(zoom, DEFAULT_ZOOM);
  return Math.max(CAMERA_ZOOM_MIN, Math.min(CAMERA_ZOOM_MAX, requested));
}

// Entity types that can be battlefield threat context. Flyby Focus leases ships AND drones
// (src/systems/flybyFocus.js:81 `isHostileShip`), so a ship-only filter here made a leased drone
// invisible to threat composition — no bias, no zoom floor, not even counted as a nearby enemy.
// Hostility is still decided by isHostileToPlayer; this only widens which shapes are asked.
function isComposableThreatType(entity) {
  return entity.type === 'ship' || entity.type === 'drone';
}

// A live Flyby Focus lease names the contact the GAME has decided the player is dealing with right
// now: state.player.flybyFocus.targetId is its dedicated lease authority while Focus slows time to
// 50% and opens the latch window. The lease is granted on pass GEOMETRY (proximity + closing speed,
// flybyFocus.js:173-213), not on the
// leased ship having targeted the player, so a genuine high-speed pass by a hostile whose combat
// target is someone else read as ambient traffic here and could leave the frame for the whole
// three-second window.
//
// This does NOT give focus camera authority — that takeover (FOCUS_PAIR) was removed deliberately
// and stays removed. The lease only promotes an already-hostile contact from ambient to active
// attacker inside the composition the chase camera already runs: the same damped, slew-limited bias
// and the same safe-rect clamp every other attacker gets. Focus still never moves the camera; what
// it points at just stops falling off the edge of the screen.
function readFlybyLeaseTargetId(state) {
  const focus = state && state.player && state.player.flybyFocus;
  if (!focus || focus.active !== true || focus.targetId == null) return null;
  return focus.targetId;
}

/**
 * Cheap gate for combat look-ahead attenuation (U13). True when the chase camera is about to
 * treat an active attacker as functional framing — sticky hold still active, live Flyby lease, or
 * any hostile currently targeting the player. Pure; does not mutate sticky.
 */
// B3b: "actively attacking" means the hostile holds a target lock on the player AND can
// still fire — a tumbling or weapon-disabled hull is neutralized, not attacking (the
// physics loadout's payoff). The combat kernel's own status gates decide.
function combatCanShootPlayer(state, e, player) {
  const combat = e.data && e.data.combat;
  return !!(combat && (combat.targetId === player.id || combat.lockTarget === player.id))
    && !entityWeaponBlocked(state, e);
}

export function playerHasActiveAttackerFraming(state, player, sticky = null) {
  if (!state || !player) return false;
  if (sticky && sticky.wasActive && sticky.remainS > 0 && sticky.id != null) {
    const held = state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(sticky.id)
      : null;
    if (held && held.alive !== false && held.hull > 0) return true;
  }
  if (readFlybyLeaseTargetId(state) != null) return true;
  if (!state.entities || typeof state.entities.values !== 'function') return false;
  for (const e of cameraThreatCandidates(state)) {
    if (e === player) continue;
    if (!isComposableThreatType(e) || e.alive === false || e.hull <= 0 || !e.pos) continue;
    // Combat lock first: framing only cares about active attackers. Quiet Ceres traffic
    // pays combatCanShootPlayer (cheap) and skips isHostileToPlayer for the non-lock majority.
    if (!combatCanShootPlayer(state, e, player)) continue;
    if (!isHostileToPlayer(e, player.team, state)) continue;
    return true;
  }
  return false;
}

function extendCompositionMinZoom(minZoom, item, fx, fz, tanHalf, aspect, tilt, ndc = ACTIVE_ATTACKER_SAFE_NDC) {
  const radius = Math.max(0, finiteOr(item.radius, 4));
  const dx = Math.abs(item.pos.x - fx);
  const dz = Math.abs(item.pos.z - fz);
  return Math.max(
    minZoom,
    Math.cos(tilt) * dz + radius + (dx + radius) / (tanHalf * aspect * ndc),
    Math.cos(tilt) * dz + radius + (Math.sin(tilt) * dz + radius) / (tanHalf * ndc),
  );
}

function groupMemberZoomNeed(item, player, gx, gz, zoom, tanHalf, aspect, tilt) {
  const safeX = Math.max(14, SAFE_VIEW_X * tanHalf * 0.72 * aspect * zoom);
  const safeZ = Math.max(22, SAFE_VIEW_Z * tanHalf * 0.72 * zoom);
  const fx = player.pos.x + Math.max(-safeX, Math.min(safeX, gx - player.pos.x));
  const fz = player.pos.z + Math.max(-safeZ, Math.min(safeZ, gz - player.pos.z));
  const dx = item.pos.x - fx;
  const dz = item.pos.z - fz;
  const r = Math.max(0, finiteOr(item.radius, 4));
  return -Math.cos(tilt) * dz + r + Math.max(
    (Math.abs(dx) + r) / (tanHalf * aspect * GROUP_FIT_NDC),
    (Math.sin(tilt) * Math.abs(dz) + r) / (tanHalf * GROUP_FIT_NDC),
  );
}

function fitGroupFocus(members, player, gx, gz, zoom, tanHalf, aspect, tilt, out) {
  const sinTilt = Math.sin(tilt), cosTilt = Math.cos(tilt);
  const ky = tanHalf * GROUP_FIT_NDC, kx = ky * aspect, k = kx * cosTilt;
  const safeX = Math.max(14, SAFE_VIEW_X * tanHalf * 0.72 * aspect * zoom);
  const safeZ = Math.max(22, SAFE_VIEW_Z * tanHalf * 0.72 * zoom);
  const positiveZ = sinTilt - ky * cosTilt, negativeZ = -sinTilt - ky * cosTilt;
  let minZ = -safeZ, maxZ = safeZ, minX = -Infinity, maxX = Infinity;
  for (let i = -1; i < members.length; i++) {
    const item = i < 0 ? player : members[i];
    const x = item.pos.x - player.pos.x, z = item.pos.z - player.pos.z;
    const radius = Math.max(0, finiteOr(item.radius, 4));
    const reach = ky * zoom - radius * (1 + ky);
    if (positiveZ > 0) minZ = Math.max(minZ, z - reach / positiveZ);
    else if (positiveZ < 0) maxZ = Math.min(maxZ, z - reach / positiveZ);
    else if (reach < 0) return false;
    maxZ = Math.min(maxZ, z - reach / negativeZ);
    const halfX = kx * (zoom + cosTilt * z - radius) - radius;
    minX = Math.max(minX, x - halfX);
    maxX = Math.min(maxX, x + halfX);
  }
  maxZ = Math.min(maxZ, (maxX - minX) / (2 * k), (safeX - minX) / k, (maxX + safeX) / k);
  if (minZ > maxZ) return false;
  const z = Math.max(minZ, Math.min(maxZ, gz - player.pos.z));
  const lo = Math.max(-safeX, minX + k * z), hi = Math.min(safeX, maxX - k * z);
  out.x = player.pos.x + Math.max(lo, Math.min(hi, gx - player.pos.x));
  out.z = player.pos.z + z;
  return true;
}

export function resolveCombatCompositionZoomCap(player, view = {}) {
  const r = Number(player && player.radius);
  if (!Number.isFinite(r) || r <= 0) return Math.min(CAMERA_ZOOM_MAX, COMPOSITION_ZOOM_MAX);
  const fov = Math.max(10, Math.min(140, finiteOr(view.baseFov, finiteOr(view.fov, 50))));
  const tanHalf = Math.tan(fov * Math.PI / 360);
  const aspect = Math.max(0.45, finiteOr(view.aspect, 16 / 9));
  const tilt = Math.max(1, Math.min(89, finiteOr(view.tiltDeg, 60))) * Math.PI / 180;
  const maxDepth = (r * 0.99) / (tanHalf * aspect * 0.04);
  const safeZPer = SAFE_VIEW_Z * tanHalf * 0.72;
  return Math.max(
    CAMERA_ZOOM_MAX,
    Math.min(
      COMPOSITION_ZOOM_MAX,
      maxDepth - Math.cos(tilt) * 22,
      maxDepth / (1 + Math.cos(tilt) * safeZPer),
    ),
  );
}

function createGyreCompositionMemory() {
  return {
    playerId: null, remaining: 0, payload: false, coreId: null,
    mouth: { pos: { x: 0, z: 0 }, radius: 0 },
    core: { pos: { x: 0, z: 0 }, radius: 0 },
    mouthX: 0, mouthZ: 0, coreX: 0, coreZ: 0,
    members: [], focus: { x: 0, z: 0 },
  };
}

// Extends the ordinary combat-composition result, using the same projection fit and safe
// player rectangle. The remembered offsets are presentation-only and never enter the save.
function composeGyre(state, player, view, result, memory) {
  const g = state.gyreSnare;
  let bowlLeadX = 0, bowlLeadZ = 0;
  const live = g && (g.phase === 'beaming' || g.phase === 'holding')
    && Number.isFinite(g.maw?.x) && Number.isFinite(g.maw?.z);
  if (memory.playerId !== player.id) {
    memory.playerId = player.id;
    memory.remaining = 0;
  }
  if (live) {
    memory.remaining = g.coreId != null ? GYRE_COMPOSITION_RELEASE_S : 0.4;
    memory.mouthX = g.maw.x - player.pos.x;
    memory.mouthZ = g.maw.z - player.pos.z;
    memory.mouth.radius = Math.max(0, finiteOr(g.endRadius, 86)) + 10;
    memory.payload = g.coreId != null && Number.isFinite(g.corePos?.x) && Number.isFinite(g.corePos?.z);
    memory.coreId = g.coreId;
    if (memory.payload) {
      memory.coreX = g.corePos.x - player.pos.x;
      memory.coreZ = g.corePos.z - player.pos.z;
      memory.core.radius = Math.max(0, finiteOr(g.clumpRadius, 0)) + 10;
    }
  } else {
    memory.remaining = Math.max(0, memory.remaining - Math.max(0, finiteOr(view.dt, 0)));
    // Keep this hold's first bowling payoff, never switch to a different surviving ball.
    if (memory.remaining > 0 && memory.payload && g?.launchedId === memory.coreId
        && Number.isFinite(g.ballPos?.x) && Number.isFinite(g.ballPos?.z)) {
      const dx = g.ballPos.x - player.pos.x, dz = g.ballPos.z - player.pos.z;
      if (Math.hypot(dx, dz) <= 700) {
        // Open ahead of the moving ball so the existing zoom-rate limit reaches the impact
        // before the projectile does. The look-ahead is short and cannot chase a distant ball.
        const dt = Math.max(1 / 240, finiteOr(view.dt, 1 / 60));
        bowlLeadX = finiteOr(g.ballVx, (dx - memory.coreX) / dt) * .3;
        bowlLeadZ = finiteOr(g.ballVz, (dz - memory.coreZ) / dt) * .3;
        const lead = Math.hypot(bowlLeadX, bowlLeadZ);
        if (lead > 100) { bowlLeadX *= 100 / lead; bowlLeadZ *= 100 / lead; }
        memory.coreX = dx;
        memory.coreZ = dz;
      }
    }
  }
  result.hasGyreFocus = live || memory.remaining > 0;
  result.hasGyreBowlFocus = result.hasGyreFocus && !live && memory.payload;
  result.maxZoom = 0;
  if (!result.hasGyreFocus) return;
  const px = player.pos.x, pz = player.pos.z;
  memory.mouth.pos.x = px + memory.mouthX;
  memory.mouth.pos.z = pz + memory.mouthZ;
  memory.core.pos.x = px + memory.coreX + bowlLeadX;
  memory.core.pos.z = pz + memory.coreZ + bowlLeadZ;
  memory.members.length = 0;
  memory.members.push(memory.mouth);
  if (memory.payload) memory.members.push(memory.core);
  const fov = Math.max(10, Math.min(140, finiteOr(view.baseFov, finiteOr(view.fov, 50))));
  const tanHalf = Math.tan(fov * Math.PI / 360);
  const aspect = Math.max(0.45, finiteOr(view.aspect, 16 / 9));
  const tilt = Math.max(1, Math.min(89, finiteOr(view.tiltDeg, 60))) * Math.PI / 180;
  const bowling = !live && memory.payload;
  const gx = px + (bowling ? memory.coreX : memory.mouthX) * 0.5;
  const gz = pz + (bowling ? memory.coreZ : memory.mouthZ) * 0.5;
  const zoomCap = bowling ? GYRE_BOWL_COMPOSITION_ZOOM_MAX : GYRE_COMPOSITION_ZOOM_MAX;
  let lo = CAMERA_ZOOM_MIN, hi = zoomCap;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) * 0.5;
    if (fitGroupFocus(memory.members, player, gx, gz, mid, tanHalf, aspect, tilt, memory.focus)) hi = mid;
    else lo = mid;
  }
  let fitted = fitGroupFocus(memory.members, player, gx, gz, hi, tanHalf, aspect, tilt, memory.focus);
  if (!fitted && bowling) {
    // At the ceiling, spend the frame on the real ball rather than its predicted seat.
    memory.core.pos.x = px + memory.coreX;
    memory.core.pos.z = pz + memory.coreZ;
    fitted = fitGroupFocus(memory.members, player, gx, gz, hi, tanHalf, aspect, tilt, memory.focus);
  }
  if (fitted) {
    result.x = memory.focus.x;
    result.z = memory.focus.z;
  }
  result.minZoom = Math.max(result.minZoom, hi);
  result.maxZoom = zoomCap;
}

function cameraThreatCandidates(state) {
  const index = state && state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1 && index.ready === true && Array.isArray(index.shipLike)) {
    return index.shipLike;
  }
  return state && state.entities && typeof state.entities.values === 'function'
    ? state.entities.values()
    : [];
}

/**
 * Optional sticky bag for dense-scene threat thrash (U13). Mutated in place by resolveChaseComposition
 * when provided by the live chase camera. Pure callers (checks/tests) omit it and get frame-instant
 * selection exactly as before.
 *
 *   sticky = { id: null|entityId, remainS: number, wasActive: boolean }
 */
export function resolveChaseComposition(state, player, focus, view = {}, out = null, tetherOut = null, sticky = null) {
  const result = out || {};
  let fx = focus && Number.isFinite(focus.x) ? focus.x : (player && player.pos ? player.pos.x : 0);
  let fz = focus && Number.isFinite(focus.z) ? focus.z : (player && player.pos ? player.pos.z : 0);
  let nearbyEnemies = 0;
  let nearestThreat = null;
  let nearestThreatD2 = Infinity;
  let activeAttacker = null;
  let activeAttackerD2 = Infinity;
  let nearestThreatTied = false;
  let activeAttackerTied = false;
  let zoomBias = 0;

  if (!state || !player || !player.pos || !state.entities || typeof state.entities.values !== 'function') {
    result.x = fx;
    result.z = fz;
    result.nearbyEnemies = nearbyEnemies;
    result.hasThreatFocus = false;
    delete result.hasActiveAttacker;
    result.hasTetherFocus = false;
    result.hasReleaseFocus = false;
    result.hasGyreFocus = false;
    result.maxZoom = 0;
    result.zoomBias = zoomBias;
    result.minZoom = 0;
    result.composedThreatId = null;
    return result;
  }

  const leasedTargetId = readFlybyLeaseTargetId(state);
  const groupScratch = groupFitScratch(sticky || out || _groupFitDefaultOwner);
  const attackersInRange = groupScratch.attackers;
  let groupBaseX = fx;
  let groupBaseZ = fz;

  // Combat composes player + nearest threat instead of only following the player.
  // Distance + combat-lock before isHostileToPlayer: far non-attackers (the quiet majority)
  // never pay the scanner hostility walk. Active locks and in-range ambient threats still do.
  const composeRange2 = THREAT_COMPOSE_RANGE * THREAT_COMPOSE_RANGE;
  const groupFitRange2 = GROUP_FIT_RANGE_WU * GROUP_FIT_RANGE_WU;
  for (const e of cameraThreatCandidates(state)) {
    if (e === player) continue;
    if (!isComposableThreatType(e) || e.alive === false || e.hull <= 0 || !e.pos) continue;
    const dx = e.pos.x - player.pos.x;
    const dz = e.pos.z - player.pos.z;
    const d2 = dx * dx + dz * dz;
    const attacksPlayer = combatCanShootPlayer(state, e, player)
      || (leasedTargetId != null && e.id === leasedTargetId);
    if (!attacksPlayer && d2 >= composeRange2) continue;
    if (!isHostileToPlayer(e, player.team, state)) continue;
    if (attacksPlayer && d2 <= groupFitRange2) {
      attackersInRange.push(e);
    }
    if (attacksPlayer && d2 < activeAttackerD2) {
      activeAttacker = e;
      activeAttackerD2 = d2;
      activeAttackerTied = false;
    } else if (activeAttacker && attacksPlayer && d2 === activeAttackerD2) {
      activeAttackerTied = true;
    }
    if (d2 < composeRange2) {
      nearbyEnemies++;
      if (d2 < nearestThreatD2) {
        nearestThreat = e;
        nearestThreatD2 = d2;
        nearestThreatTied = false;
      } else if (nearestThreat && d2 === nearestThreatD2) {
        nearestThreatTied = true;
      }
    }
  }

  if (activeAttackerTied || nearestThreatTied) {
    // Reconciliation can rebuild shipLike from swap-removed entityList order, while the legacy scan
    // used Map insertion order. Resolve all exact ties in one conditional Map pass so the first-wins
    // contract stays exact without turning a symmetric formation into repeated full-map scans.
    let resolvedActive = activeAttackerTied ? null : activeAttacker;
    let resolvedNearest = nearestThreatTied ? null : nearestThreat;
    for (const e of state.entities.values()) {
      if (e === player) continue;
      if (!isComposableThreatType(e) || e.alive === false || e.hull <= 0 || !e.pos) continue;
      const dx = e.pos.x - player.pos.x;
      const dz = e.pos.z - player.pos.z;
      const d2 = dx * dx + dz * dz;
      const attacksPlayer = combatCanShootPlayer(state, e, player)
        || (leasedTargetId != null && e.id === leasedTargetId);
      // Same prefilter as the primary scan: far non-attackers cannot be the tied winner.
      if (!attacksPlayer && d2 !== nearestThreatD2 && d2 !== activeAttackerD2) continue;
      if (!isHostileToPlayer(e, player.team, state)) continue;
      if (activeAttackerTied && !resolvedActive && attacksPlayer && d2 === activeAttackerD2) {
        resolvedActive = e;
      }
      if (nearestThreatTied && !resolvedNearest && d2 === nearestThreatD2) {
        resolvedNearest = e;
      }
      if (resolvedActive && resolvedNearest) break;
    }
    if (resolvedActive) activeAttacker = resolvedActive;
    if (resolvedNearest) nearestThreat = resolvedNearest;
  }

  // U13 sticky composition: hold the prior composed threat briefly so a dense furball does not slew
  // the chase bias between near-equidistant attackers every frame. Active attackers still win over
  // passive nearest, and a meaningfully closer challenger breaks the hold immediately.
  let composedThreat = activeAttacker || nearestThreat;
  let composedThreatD2 = activeAttacker ? activeAttackerD2 : nearestThreatD2;
  let composedIsActive = !!activeAttacker;
  if (sticky && state.entities && typeof state.entities.get === 'function') {
    const dtStick = Math.max(0, finiteOr(view.dt, 0));
    if (sticky.remainS > 0) sticky.remainS = Math.max(0, sticky.remainS - dtStick);
    const held = sticky.id != null ? state.entities.get(sticky.id) : null;
    const heldAlive = !!(held && held.alive !== false && held.hull > 0 && held.pos
      && isComposableThreatType(held) && isHostileToPlayer(held, player.team, state) && (((held.pos.x - player.pos.x) ** 2 + (held.pos.z - player.pos.z) ** 2) <= THREAT_COMPOSE_RANGE * THREAT_COMPOSE_RANGE || combatCanShootPlayer(state, held, player)));
    if (heldAlive) {
      const heldD2 = (held.pos.x - player.pos.x) ** 2 + (held.pos.z - player.pos.z) ** 2;
      const challenger = activeAttacker || nearestThreat;
      const challengerD2 = activeAttacker ? activeAttackerD2 : nearestThreatD2;
      const closerBreak = challenger && challenger !== held
        && challengerD2 < heldD2 * COMPOSITION_THREAT_STICK_CLOSER * COMPOSITION_THREAT_STICK_CLOSER;
      const heldIsActive = combatCanShootPlayer(state, held, player)
        || (leasedTargetId != null && held.id === leasedTargetId);
      const activeUpgrade = activeAttacker && activeAttacker !== held && !heldIsActive;
      if (sticky.remainS > 0 && !closerBreak && !activeUpgrade) {
        composedThreat = held;
        composedThreatD2 = heldD2;
        composedIsActive = heldIsActive;
      } else if (composedThreat) {
        sticky.id = composedThreat.id;
        sticky.remainS = COMPOSITION_THREAT_STICK_S;
        sticky.wasActive = composedIsActive;
      } else {
        sticky.id = null;
        sticky.remainS = 0;
        sticky.wasActive = false;
      }
    } else if (composedThreat) {
      sticky.id = composedThreat.id;
      sticky.remainS = COMPOSITION_THREAT_STICK_S;
      sticky.wasActive = composedIsActive;
    } else {
      sticky.id = null;
      sticky.remainS = 0;
      sticky.wasActive = false;
    }
  }

  if (composedThreat && composedThreatD2 > 1) {
    const d = Math.sqrt(composedThreatD2);
    // A contact actively attacking the player is functional context, not ambient composition.
    // Bias near the pair midpoint; passive hostiles keep the restrained ordinary chase nudge.
    const bias = composedIsActive
      ? d * 0.5
      : Math.min(THREAT_COMPOSE_MAX_BIAS, d * THREAT_COMPOSE_FRACTION);
    fx += ((composedThreat.pos.x - player.pos.x) / d) * bias;
    fz += ((composedThreat.pos.z - player.pos.z) / d) * bias;
    zoomBias = Math.max(zoomBias, resolveThreatZoomBias(d, composedIsActive));
  }

  const tetherAnchor = resolveTetherCompositionAnchor(state, player, tetherOut);
  if (tetherAnchor) {
    const dx = tetherAnchor.x - player.pos.x;
    const dz = tetherAnchor.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 1) {
      const bias = Math.min(TETHER_COMPOSE_MAX_BIAS, d * TETHER_COMPOSE_FRACTION);
      fx += (dx / d) * bias;
      fz += (dz / d) * bias;
      groupBaseX += (dx / d) * bias;
      groupBaseZ += (dz / d) * bias;
      zoomBias = Math.min(CONTEXT_ZOOM_MAX, zoomBias + TETHER_ZOOM_BASE + clamp01(d / THREAT_COMPOSE_RANGE) * TETHER_ZOOM_RANGE);
    }
  }

  let minZoom = 0;
  // minZoom / safe-rect geometry must use the player's authored base FOV, never the feel-layer FOV
  // punch. Punching the projection is spectacle; letting it reframe combat composition is thrash.
  const compositionFov = Math.max(10, Math.min(140, finiteOr(view.baseFov, finiteOr(view.fov, 50))));
  const tanHalf = Math.tan(compositionFov * Math.PI / 360);
  const aspect = Math.max(0.45, finiteOr(view.aspect, 16 / 9));
  const tilt = Math.max(1, Math.min(89, finiteOr(view.tiltDeg, 60))) * Math.PI / 180;
  const compositionZoomCap = Math.max(CAMERA_ZOOM_MIN, Math.min(GROUP_FIT_ZOOM_CAP, finiteOr(view.maxZoom, GROUP_FIT_ZOOM_CAP)));
  if (composedIsActive && composedThreat && player.pos) {
    // Fit against the biased composition focus AND against the player position. The chase follow
    // may safe-rect-clamp focus back toward the ship after this returns; a minZoom computed only
    // at the ideal midpoint would then under-zoom and crop the attacker (U13 dense-scene miss).
    const px = player.pos.x;
    const pz = player.pos.z;
    minZoom = extendCompositionMinZoom(minZoom, player, fx, fz, tanHalf, aspect, tilt);
    minZoom = extendCompositionMinZoom(minZoom, composedThreat, fx, fz, tanHalf, aspect, tilt);
    minZoom = extendCompositionMinZoom(minZoom, player, px, pz, tanHalf, aspect, tilt);
    minZoom = extendCompositionMinZoom(minZoom, composedThreat, px, pz, tanHalf, aspect, tilt);
    minZoom = Math.min(CAMERA_ZOOM_MAX, compositionZoomCap, minZoom);
  }

  // Row 485 (ROCK-ARENAS): the published Line rating opens the frame. rockCore writes a
  // 0..1 open bias (state.rockCore.cameraZoomFloor); it widens the composition floor toward
  // the group-fit cap as the katamari rating grows, never narrows the frame, and is inert
  // while the owner is absent or the rating is T0.
  const lineOpen = finiteOr(state?.rockCore?.cameraZoomFloor, 0);
  if (lineOpen > 0 && player.pos) {
    minZoom = Math.max(minZoom, Math.min(compositionZoomCap,
      CAMERA_ZOOM_MIN + lineOpen * (compositionZoomCap - CAMERA_ZOOM_MIN)));
  }

  // B3b group fit: two or more hostiles attacking at once share the frame. The composed focus
  // moves halfway toward the group centroid (player weighted double — mirrors the pair-midpoint
  // rule for a single attacker) and minZoom grows to fit every member. A per-member sticky hold
  // keeps a just-stopped attacker composed for GROUP_MEMBER_STICK_S so targetId juggling cannot
  // pump the frame. If the whole group will not fit under GROUP_FIT_ZOOM_CAP the farthest member
  // is dropped and the fit recomputed — the out-of-frame attacker stays the metric's problem,
  // not the camera's.
  if (attackersInRange.length || (sticky && sticky.holds instanceof Map && sticky.holds.size)) {
    const dtGroup = Math.max(0, finiteOr(view.dt, 0));
    const groupSet = groupScratch.byId;
    for (const e of attackersInRange) groupSet.set(e.id, e);
    if (sticky && typeof state.entities.get === 'function') {
      if (!(sticky.holds instanceof Map)) sticky.holds = new Map();
      for (const id of sticky.holds.keys()) {
        const remain = sticky.holds.get(id);
        const next = remain - dtGroup;
        if (next <= 0) sticky.holds.delete(id); else sticky.holds.set(id, next);
      }
      for (const id of sticky.holds.keys()) {
        if (groupSet.has(id)) continue;
        const held = state.entities.get(id);
        if (held && held !== player && held.alive !== false && held.hull > 0 && held.pos
          && isComposableThreatType(held) && isHostileToPlayer(held, player.team, state)
          && ((held.pos.x - player.pos.x) ** 2 + (held.pos.z - player.pos.z) ** 2)
            <= GROUP_FIT_RANGE_WU * GROUP_FIT_RANGE_WU) {
          groupSet.set(id, held);
        }
      }
      for (const e of attackersInRange) sticky.holds.set(e.id, GROUP_MEMBER_STICK_S);
      for (const id of sticky.holds.keys()) {
        const held = state.entities.get(id);
        if (!held || held.alive === false || held.hull <= 0 || !held.pos
          || !isHostileToPlayer(held, player.team, state)) {
          sticky.holds.delete(id);
        }
      }
    }
    if (groupSet.size >= 1) {
      const members = groupScratch.members;
      const candidate = groupScratch.candidate;
      for (const e of groupSet.values()) {
        candidate[0] = e;
        if (fitGroupFocus(candidate, player, groupBaseX, groupBaseZ, compositionZoomCap, tanHalf, aspect, tilt, groupScratch.focus)) members.push(e);
      }
      candidate.length = 0;
      for (; members.length;) {
        let cx = player.pos.x * 2;
        let cz = player.pos.z * 2;
        let w = 2;
        for (const e of members) { cx += e.pos.x; cz += e.pos.z; w += 1; }
        cx /= w;
        cz /= w;
        const gx = members.length === 1 ? fx : groupBaseX + (cx - player.pos.x) * 0.5;
        const gz = members.length === 1 ? fz : groupBaseZ + (cz - player.pos.z) * 0.5;
        // Fit target = the safe-rect clamp's own geometry: a member is on screen when it sits
        // inside the full frame around the composed focus, or — worst case, the focus clamped
        // all the way back to the player's safe edge — inside the full frame around that edge.
        // The edge only helps toward the member when the composed focus lies on its side.
        let neediest = null;
        let neediestNeed = groupMemberZoomNeed(player, player, gx, gz, compositionZoomCap, tanHalf, aspect, tilt);
        // The composed frame's real ground-plane reach: horizontal spans the full FOV×aspect;
        // depth spans the FOV foreshortened by the tilt. The safe-rect clamp can pull the focus
        // back to the player's safe edge, so the reachable envelope around the player is
        // frame-half + safe edge on the side the focus leans toward.
        for (const e of members) {
          const need = groupMemberZoomNeed(e, player, gx, gz, compositionZoomCap, tanHalf, aspect, tilt);
          if (need > neediestNeed) { neediestNeed = need; neediest = e; }
        }
        if (neediestNeed > compositionZoomCap && composedIsActive
          && fitGroupFocus(members, player, gx, gz, compositionZoomCap, tanHalf, aspect, tilt, groupScratch.focus)) {
          let lo = Math.min(minZoom, compositionZoomCap), hi = compositionZoomCap;
          for (let step = 0; step < 14; step++) {
            const mid = (lo + hi) * 0.5;
            if (fitGroupFocus(members, player, gx, gz, mid, tanHalf, aspect, tilt, groupScratch.focus)) hi = mid;
            else lo = mid;
          }
          fitGroupFocus(members, player, gx, gz, hi, tanHalf, aspect, tilt, groupScratch.focus);
          fx = groupScratch.focus.x;
          fz = groupScratch.focus.z;
          minZoom = Math.max(minZoom, hi);
          break;
        }
        if (neediestNeed <= compositionZoomCap || members.length <= 1) {
          // Only spend zoom that can actually frame the member — a lone attacker beyond the
          // composition ceiling is left out rather than pulling the fight to miniatures.
          if (neediestNeed <= compositionZoomCap) {
            let lo = 0, hi = compositionZoomCap;
            for (let step = 0; step < 14; step++) {
              const mid = (lo + hi) * 0.5;
              let required = groupMemberZoomNeed(player, player, gx, gz, mid, tanHalf, aspect, tilt);
              for (const e of members) required = Math.max(required, groupMemberZoomNeed(e, player, gx, gz, mid, tanHalf, aspect, tilt));
              if (required <= mid) hi = mid; else lo = mid;
            }
            fx = gx;
            fz = gz;
            minZoom = Math.max(minZoom, hi);
          }
          break;
        }
        if (!neediest) break;
        const index = members.indexOf(neediest);
        if (index < 0) break;
        for (let i = index; i < members.length - 1; i++) members[i] = members[i + 1];
        members.length--;
      }
    }
  }

  let hasReleaseFocus = false;
  const meeting = releaseMeetingPoint(state);
  if (meeting && player.pos) {
    const mx = meeting.x - player.pos.x;
    const mz = meeting.z - player.pos.z;
    const md = Math.hypot(mx, mz);
    if (md > 1) {
      const bias = Math.min(RELEASE_MEETING_MAX_BIAS, md * RELEASE_MEETING_FRACTION);
      fx += (mx / md) * bias;
      fz += (mz / md) * bias;
      hasReleaseFocus = true;
    }
  }

  result.x = fx;
  result.z = fz;
  result.nearbyEnemies = nearbyEnemies;
  result.hasThreatFocus = !!nearestThreat || !!composedThreat;
  result.hasActiveAttacker = composedIsActive;
  result.hasTetherFocus = !!tetherAnchor;
  result.hasReleaseFocus = hasReleaseFocus;
  result.zoomBias = Math.min(CONTEXT_ZOOM_MAX, zoomBias);
  result.minZoom = minZoom;
  result.composedThreatId = composedThreat ? composedThreat.id : null;
  const gyreOwner = sticky || result;
  if (state.gyreSnare || gyreOwner.gyreComposition) {
    const gyreMemory = gyreOwner.gyreComposition || (gyreOwner.gyreComposition = createGyreCompositionMemory());
    composeGyre(state, player, view, result, gyreMemory);
  } else {
    result.hasGyreFocus = false;
    result.maxZoom = 0;
  }
  attackersInRange.length = 0;
  groupScratch.members.length = 0;
  groupScratch.byId.clear();
  return result;
}

function releaseMeetingPoint(state) {
  const throwState = state && state.massline2 && state.massline2.throw;
  if (!throwState) return null;
  const solution = throwState.solution;
  if (solution && solution.valid === true && finitePlanarPoint(solution.predicted)) return solution.predicted;
  const self = throwState.selfSolution;
  if (self && self.valid === true && finitePlanarPoint(self.predicted)) return self.predicted;
  return null;
}

function finitePlanarPoint(point) {
  return !!(point && Number.isFinite(point.x) && Number.isFinite(point.z));
}

function resolveTetherCompositionAnchor(state, player, out = null) {
  if (!state || !player || !state.entities || typeof state.entities.get !== 'function') return null;

  let x = 0;
  let z = 0;
  let weightTotal = 0;
  const attachments = state.combat && state.combat.attachments && state.combat.attachments.byId;
  if (attachments) {
    for (const attachmentId in attachments) {
      if (!Object.prototype.hasOwnProperty.call(attachments, attachmentId)) continue;
      const attachment = attachments[attachmentId];
      if (!attachment || attachment.state !== 'active') continue;
      let otherId = null;
      if (attachment.ownerId === player.id) otherId = attachment.targetId;
      else if (attachment.targetId === player.id) otherId = attachment.ownerId;
      if (otherId == null) continue;

      const other = state.entities.get(otherId);
      if (!other || !other.alive || !other.pos) continue;
      const isPayload = other.type === 'payload' || !!(other.data && other.data.tetherPayload);
      const weight = isPayload ? 1.35 : 1.0;
      x += other.pos.x * weight;
      z += other.pos.z * weight;
      weightTotal += weight;
    }
  }

  // Ordinary mining/massline: state.player.tether is the HUD-facing authority and may be present
  // before combat.attachments is mirrored. Use it so modest tether composition + threat context
  // still work when the director intentionally stays on FOLLOW for non-hostile latches.
  if (weightTotal <= 0) {
    const tether = state.player && state.player.tether;
    if (tether && tether.active && tether.targetId != null) {
      const other = state.entities.get(tether.targetId);
      if (other && other.alive !== false && other.pos
        && Number.isFinite(other.pos.x) && Number.isFinite(other.pos.z)) {
        const result = out || {};
        result.x = other.pos.x;
        result.z = other.pos.z;
        return result;
      }
    }
    return null;
  }
  const result = out || {};
  result.x = x / weightTotal;
  result.z = z / weightTotal;
  return result;
}

// ---- lane world->screen projection -----------------------------------------
// The whole-sim worker (simLane=worker / in-process simLane=main) has no renderer
// and no Three camera, so renderer.worldToScreen cannot bind helpers.worldToScreen
// there. The sim lane still needs the same answer for visibility-gated events
// (bulletTime._visibleMoment). This is that answer, computed honestly: the chase
// rig's own analytic projection — camera at (look.x, D*sin(tilt), look.z -
// D*cos(tilt)) looking at the look-at, the exact convention camera.js:follow
// ((0, D*sin, -D*cos) offset) and glassHalfExtents's corner raycast share.
//
// With target = look-at, camera right = (-1,0,0), up = (0,cos,sin), back =
// (0,sin,-cos), a ground-plane point at (dx, dz) relative to the look-at reads
//   xCam = -dx,  yCam = sin(t)*dz,  depth = D + cos(t)*dz
//   ndcX = xCam / (depth * tanHalf * aspect),  ndcY = yCam / (depth * tanHalf)
// which is precisely the |ndc|<=1 test the real project() reports as onScreen.
//
// The camera that projection stands in for is tableChaseFraming: the shipped
// rig's settled FOLLOW-mode envelope, derived through the SAME functions
// camera.js:follow calls — the speed-zoom curve, the owner-validated
// exceptional-speed record, threat/tether/gyre composition, the safe-rect
// clamp and the boost settle — not the raw commanded `camera.zoom`, which is
// only the base distance the dynamics multiply. Review-2 finding 1 was exactly
// this gap: seed 4242, a stationary player at (0,0) and a 1280x720 viewport put
// (115,0) at real NDC x -1.0947 (off-glass under the settled ~126.7 WU frame),
// while a projector fed the commanded 144 called it on-screen and admitted a
// phantom bullet-time moment.
//
// What the lane envelope deliberately does NOT model (bounded, documented):
//  - the render-side presented-pose anchor and per-frame focus/zoom damping
//    (settled = the converged values derived here; sub-frame transient);
//  - the sticky holds keyed to call cadence (the composition runs with a fresh
//    sticky bag — frame-instant selection, per the function's own contract);
//  - the 0.4 s exceptional-speed warm-up gate (the lane applies the live
//    published record as settled when it must derive — in production the
//    transported speedZoomFactor already carries the hold-gated value);
//  - presentation transients between camera-frame posts: the 'camera' command
//    envelope transports the rig's displayed record (eased distance, damped
//    speed-zoom factor, frame-local settled focus, commanded zoom, tilt,
//    aspect) plus the full displayed pose (frame-local eye, post-roll/
//    post-shake orientation, view kind + blend, displayed fov/near/far) and
//    the frame origin those locals belong to — one 'camera' command per
//    directive, so the projector reads the picture. With a complete pose the
//    projector runs the real perspective transform (projectDisplayedPose):
//    the racing stern rig, cameraDirector takeovers, the predictive
//    roof-clearance glide, kick and camera-shake all answer the presented
//    frame. Before the first post lands (init ticks, a pre-camera state,
//    unit tests) the derived path below is the deterministic fallback and the
//    documented place those presentation transients remain unmodeled.
// `out` follows renderer.worldToScreen's contract: {x, y, onScreen, behind}
// written in place, returns `out` (or a fresh record when out is absent);
// ndcX/ndcY ride along for tests and diagnostics.

function chaseLaneMotionReduced(state) {
  const settings = state && state.settings;
  return !!(settings && (
    settings.video && settings.video.motionReduce
    || settings.accessibility && settings.accessibility.motionPreference === 'reduce'
  ));
}

const _laneAimScratch = { x: 0, z: 0 };
const _laneFocusSeed = { x: 0, z: 0 };
const _laneSafeInput = { x: 0, z: 0 };
const _laneSafeOpts = { zoom: 0, fov: 50, aspect: 16 / 9 };
const _laneSafeOut = { x: 0, z: 0, clamped: false };
const _lanePlayerProxy = { pos: { x: 0, z: 0 } };
const _laneView = { fov: 50, baseFov: 50, aspect: 16 / 9, tiltDeg: 60, dt: 1 / 60, maxZoom: 0 };

/**
 * The chase camera's settled FOLLOW-mode framing for a sim-lane state, derived
 * through the shipped rig's own functions (this module is their single source).
 * Returns { focusX, focusZ } in galactic-global space plus the effective camera
 * distance, fov, aspect, tilt and pixel viewport — everything the analytic
 * projection needs. Deterministic: same state + viewport in, same framing out.
 */
export function tableChaseFraming(state, viewport = null, out = null) {
  const result = out || {};
  const camera = (state && state.camera) || {};
  const video = (state && state.settings && state.settings.video) || {};
  const player = state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : null;
  const playerValid = !!(player && player.pos
    && Number.isFinite(player.pos.x) && Number.isFinite(player.pos.z));
  const px = playerValid ? player.pos.x : 0;
  const pz = playerValid ? player.pos.z : 0;
  const vel = player && player.vel;
  const vx = vel && Number.isFinite(vel.x) ? vel.x : 0;
  const vz = vel && Number.isFinite(vel.z) ? vel.z : 0;
  const playerSpeed = Math.hypot(vx, vz);
  const width = viewport && Number.isFinite(viewport.width) ? viewport.width : 0;
  const height = viewport && Number.isFinite(viewport.height) ? viewport.height : 0;
  const aspect = width > 0 && height > 0
    ? width / height
    : (Number.isFinite(camera.aspect) && camera.aspect > 0 ? camera.aspect : 16 / 9);
  const tiltDeg = Number.isFinite(camera.tilt) ? camera.tilt : 60;
  // follow(): the authored base FOV drives composition geometry; the feel-layer
  // cam.fov punch is transient spectacle and never reframes the envelope.
  const baseFov = Math.max(10, Math.min(140, finiteOr(video.fov, 50)));
  const baseZoom = video.chaseClose ? CHASE_ZOOM_CLOSE : finiteOr(camera.zoom, DEFAULT_ZOOM);
  const motionReduced = chaseLaneMotionReduced(state);

  // The sim's own floating origin belongs to the DERIVED path below — entity
  // positions are galactic-global and convert against the live record. The
  // transported envelope is different: focusX/focusZ and the pose's eye are
  // FRAME-LOCAL in the displayed frame they were stamped in, and that frame's
  // origin rides the same envelope (the sim's live origin can hop between the
  // stamp and this apply). Convert with the shipped origin, never the live one.
  const frame = (state && state.world && state.world.frameOrigin) || null;
  const ox = frame && Number.isFinite(frame.x) ? frame.x : 0;
  const oz = frame && Number.isFinite(frame.z) ? frame.z : 0;
  const shippedOriginX = Number.isFinite(camera.frameOriginX) ? camera.frameOriginX : null;
  const shippedOriginZ = Number.isFinite(camera.frameOriginZ) ? camera.frameOriginZ : null;

  // ---- transported displayed envelope (round-3 fix) --------------------------
  // The presenting lane ships the camera's live record on each directive (the
  // 'camera' command envelope → applyLaneCameraFrame): camera.js stamps
  // displayedZoom (the eased _dynamicZoom actually placed this frame),
  // speedZoomFactor (the EMA-damped, hold-gated factor) and focusX/focusZ (the
  // settled look-at — frame-local, converted to galactic-global here with the
  // shipped frame's own origin; a legacy/pre-camera envelope without an origin
  // reads as the origin-0 answer, the same numeric result the old
  // already-global interpretation produced). Those are the truth the player
  // sees — a scrolled camera:zoom never crosses the lane otherwise (it is a
  // KNOWN_UNFORWARDED presentation emit), and mid-acceleration the damped
  // values disagree with anything derived from instantaneous speed. Each
  // field consumes independently; absent = pre-transport/init-tick fallback
  // onto the settled derivation below. state.camera.focus.x/z is the same
  // record on a lane where the real rig runs in-process: also frame-local,
  // converted with the rig's stamped origin (or the live origin when the rig
  // has not stamped one yet — they cannot disagree on one thread).
  const displayedZoom = Number.isFinite(camera.displayedZoom) && camera.displayedZoom > 0
    ? camera.displayedZoom
    : null;
  const transportedFactor = Number.isFinite(camera.speedZoomFactor) && camera.speedZoomFactor > 0
    ? camera.speedZoomFactor
    : null;
  const transportedFocusX = Number.isFinite(camera.focusX)
    ? camera.focusX + (shippedOriginX || 0)
    : (camera.focus && Number.isFinite(camera.focus.x)
      ? camera.focus.x + (shippedOriginX != null ? shippedOriginX : ox)
      : null);
  const transportedFocusZ = Number.isFinite(camera.focusZ)
    ? camera.focusZ + (shippedOriginZ || 0)
    : (camera.focus && Number.isFinite(camera.focus.z)
      ? camera.focus.z + (shippedOriginZ != null ? shippedOriginZ : oz)
      : null);

  // Speed-zoom. Production feeds an EMA of speed (0.1 s constant) that settles
  // at the raw magnitude, keyed to the governed combat-speed ceiling. The
  // above-cap band rides the owner-validated velocityLanguage record. When the
  // transported damped factor is present it is the honest mid-accel answer;
  // the instantaneous curve is the deterministic fallback.
  const governedCap = player
    ? resolveGovernedCombatSpeed(player, state, player.maxSpeed || 120)
    : 120;
  const ordinarySpeedZoom = resolveSpeedZoomFactor(playerSpeed, governedCap, false);
  const exceptional = motionReduced ? 0 : readOwnedExceptionalSpeed(state);
  const speedZoomFactor = transportedFactor != null
    ? transportedFactor
    : resolveExceptionalSpeedZoomFactor(exceptional, ordinarySpeedZoom);

  // follow() anchor: frame-local player pos + settled velocity lead + aim bias.
  const localX = px - ox;
  const localZ = pz - oz;
  let fx = localX;
  let fz = localZ;
  const combatLookaheadScale = playerValid
    && playerHasActiveAttackerFraming(state, player, null)
    ? ACTIVE_ATTACKER_LOOKAHEAD_SCALE
    : 1;
  if (playerValid && playerSpeed > 1) {
    const laCap = Number.isFinite(camera.lookAhead)
      ? Math.max(0, camera.lookAhead)
      : LOOKAHEAD_LEAD_MAX_WU;
    const la = Math.min(laCap, playerSpeed * LOOKAHEAD_LEAD_S) * combatLookaheadScale;
    fx += (vx / playerSpeed) * la;
    fz += (vz / playerSpeed) * la;
    const vl = readVelocityLanguage(state);
    const leadWU = vl && vl.drive && Number.isFinite(vl.drive.cameraLeadWU)
      ? vl.drive.cameraLeadWU
      : 0;
    if (leadWU > 0) {
      const combatLead = leadWU * combatLookaheadScale;
      fx += (vx / playerSpeed) * combatLead;
      fz += (vz / playerSpeed) * combatLead;
    }
  }
  if (playerValid) {
    const aim = resolveAimLead(state && state.input, player, _laneAimScratch);
    fx += aim.x;
    fz += aim.z;
  }

  // Composition. The seed focus is galactic-global like the live call site;
  // the returned bias is an offset, so converting back is a same-space subtract.
  _laneView.fov = baseFov;
  _laneView.baseFov = baseFov;
  _laneView.aspect = aspect;
  _laneView.tiltDeg = tiltDeg;
  _laneView.dt = 1 / 60;
  _laneView.maxZoom = playerValid ? resolveCombatCompositionZoomCap(player, _laneView) : 0;
  _laneFocusSeed.x = fx + ox;
  _laneFocusSeed.z = fz + oz;
  const composition = playerValid
    ? resolveChaseComposition(state, player, _laneFocusSeed, _laneView)
    : null;
  const scale = chaseCompositionMotionScale(composition, motionReduced);
  const biasX = composition ? (composition.x - _laneFocusSeed.x) * scale : 0;
  const biasZ = composition ? (composition.z - _laneFocusSeed.z) * scale : 0;
  const contextZoomBias = composition ? (composition.zoomBias || 0) * scale : 0;
  const contextMinZoom = composition ? Math.max(0, finiteOr(composition.minZoom, 0)) : 0;
  const contextZoomCap = Math.max(
    finiteOr(_laneView.maxZoom, 0),
    composition ? finiteOr(composition.maxZoom, 0) : 0,
    contextMinZoom,
  );

  // follow() zoom assembly, settled: base * speed * (1 + context), floored by
  // combat containment, the boost settle factor, then the containment
  // floor + cap (same order as camera.js:2148-2227).
  let targetZoom = baseZoom * speedZoomFactor * (1 + contextZoomBias);
  targetZoom = Math.max(targetZoom, contextMinZoom);
  const tether = state && state.player && state.player.tether;
  if (tether && tether.active) {
    targetZoom = Math.max(targetZoom, baseZoom * (1 + contextZoomBias));
  }
  const boosting = !!(player && player.flags && player.flags.boosting);
  if (boosting && !motionReduced) targetZoom *= BOOST_CAMERA_ZOOM_TARGET;
  if (contextMinZoom > 0) {
    targetZoom = Math.max(targetZoom, Math.min(contextMinZoom, contextZoomCap));
    targetZoom = Math.min(targetZoom, contextZoomCap);
  }
  // The displayed distance is the strongest truth when transported: the eased
  // value already carries the same assembly plus its rate-clamped damp, so the
  // projector answers the picture even mid-transition. Derived = fallback.
  const distance = Math.max(1, displayedZoom != null ? displayedZoom : targetZoom);

  // Settled focus: base anchor + composition bias, safe-rect clamped at the
  // settled distance, then the boost drag-back along -velocity.
  let focusX = fx + biasX;
  let focusZ = fz + biasZ;
  _lanePlayerProxy.pos.x = localX;
  _lanePlayerProxy.pos.z = localZ;
  _laneSafeInput.x = focusX;
  _laneSafeInput.z = focusZ;
  _laneSafeOpts.zoom = distance;
  _laneSafeOpts.fov = baseFov;
  _laneSafeOpts.aspect = aspect;
  if (playerValid) {
    const safe = clampFocusToPlayerSafeRect(_laneSafeInput, _lanePlayerProxy, _laneSafeOpts, _laneSafeOut);
    focusX = safe.x;
    focusZ = safe.z;
  }
  if (boosting && !motionReduced && playerSpeed > 1) {
    const lag = BOOST_LAG_FRACTION * distance;
    if (lag > 0.01) {
      focusX -= (vx / playerSpeed) * lag;
      focusZ -= (vz / playerSpeed) * lag;
    }
  }

  // A transported look-at arrived frame-local and was converted above with
  // the shipped frame's own origin; the derived focus is frame-local and
  // converts back with the live +ox as before. Field-independent: a partial
  // envelope (factor only, distance only) still lands cleanly.
  result.focusX = transportedFocusX != null ? transportedFocusX : focusX + ox;
  result.focusZ = transportedFocusZ != null ? transportedFocusZ : focusZ + oz;
  result.distance = distance;
  result.fov = baseFov;
  result.aspect = aspect;
  result.tiltDeg = tiltDeg;
  result.width = width;
  result.height = height;

  // ---- transported displayed pose (round-4 fix) --------------------------
  // The chase rig ships the pose its follow() actually placed: the
  // frame-local eye after applyChaseLookAt + glide + kick, the post-roll/
  // post-shake orientation, the steering view kind + eased blend, the
  // displayed fov/near/far — and the frame origin every local coordinate
  // belongs to. A COMPLETE record upgrades the projector to a real
  // perspective transform (projectDisplayedPose), so the racing stern rig,
  // director takeovers, blended transitions and the ordinary overhead frame
  // all answer the presented picture. The pose is frame-local: without the
  // shipped origin the eye is uninterpretable, so a pose missing its origin
  // falls back to the analytic derivation rather than guessing at one.
  const quatNorm = Number.isFinite(camera.quatX) && Number.isFinite(camera.quatY)
    && Number.isFinite(camera.quatZ) && Number.isFinite(camera.quatW)
    ? camera.quatX * camera.quatX + camera.quatY * camera.quatY
      + camera.quatZ * camera.quatZ + camera.quatW * camera.quatW
    : 0;
  const poseReady = Number.isFinite(camera.eyeX) && Number.isFinite(camera.eyeY)
    && Number.isFinite(camera.eyeZ) && quatNorm > 1e-6
    && shippedOriginX != null && shippedOriginZ != null;
  result.poseReady = poseReady;
  result.viewKind = typeof camera.viewKind === 'string' ? camera.viewKind : null;
  result.viewMix = Number.isFinite(camera.viewMix) ? camera.viewMix : null;
  result.eyeX = poseReady ? camera.eyeX : null;
  result.eyeY = poseReady ? camera.eyeY : null;
  result.eyeZ = poseReady ? camera.eyeZ : null;
  result.quatX = poseReady ? camera.quatX : null;
  result.quatY = poseReady ? camera.quatY : null;
  result.quatZ = poseReady ? camera.quatZ : null;
  result.quatW = poseReady ? camera.quatW : null;
  result.poseOriginX = poseReady ? shippedOriginX : null;
  result.poseOriginZ = poseReady ? shippedOriginZ : null;
  result.poseFov = poseReady && Number.isFinite(camera.displayFov) && camera.displayFov > 0
    ? camera.displayFov : baseFov;
  result.poseNear = poseReady && Number.isFinite(camera.displayNear) && camera.displayNear > 0
    ? camera.displayNear : 1;
  result.poseFar = poseReady && Number.isFinite(camera.displayFar) && camera.displayFar > result.poseNear
    ? camera.displayFar : 14000;
  return result;
}

const _laneFraming = { focusX: 0, focusZ: 0, distance: 0, fov: 50, aspect: 16 / 9, tiltDeg: 60, width: 0, height: 0 };

function writeGlassProjection(out, x, y, onScreen, behind, ndcX = 0, ndcY = 0) {
  const target = (out && typeof out === 'object') ? out : {};
  target.x = x;
  target.y = y;
  target.onScreen = onScreen;
  target.behind = behind;
  target.ndcX = ndcX;
  target.ndcY = ndcY;
  return target;
}

// Real perspective projection through the transported displayed pose — the
// same transform Three's project() runs (view-space = q⁻¹ ⊗ (p_local − eye),
// then the perspective divide), so a racing stern frame, a director takeover,
// a mid-blend transition or the ordinary overhead camera all answer the
// presented picture exactly. The eye and quaternion are frame-local to
// `poseOrigin` — the origin the presenting lane stamped with that frame — so
// the galactic-global point converts with THAT origin, never this lane's live
// one. `behind` reports the camera-space depth test the real helper makes.
function projectDisplayedPose(framing, pos, out) {
  const px = (Number(pos.x) || 0) - framing.poseOriginX - framing.eyeX;
  const py = (Number.isFinite(Number(pos.y)) ? Number(pos.y) : 0) - framing.eyeY;
  const pz = (Number(pos.z) || 0) - framing.poseOriginZ - framing.eyeZ;
  // v_view = q⁻¹ ⊗ v ⊗ q for a unit quaternion q = (u, s):
  //   v' = 2(u·v)u + (s²−u·u)v − 2s(u×v)
  // (the conjugate of Vector3.applyQuaternion — Three's matrixWorldInverse).
  let qx = framing.quatX, qy = framing.quatY, qz = framing.quatZ, qw = framing.quatW;
  const norm = Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw) || 1;
  qx /= norm; qy /= norm; qz /= norm; qw /= norm;
  const udv = qx * px + qy * py + qz * pz;
  const ss = qw * qw - (qx * qx + qy * qy + qz * qz);
  const cx = qy * pz - qz * py;   // u × v
  const cy = qz * px - qx * pz;
  const cz = qx * py - qy * px;
  const vx = 2 * udv * qx + ss * px - 2 * qw * cx;
  const vy = 2 * udv * qy + ss * py - 2 * qw * cy;
  const vz = 2 * udv * qz + ss * pz - 2 * qw * cz;
  const depth = -vz;  // the camera looks down its local −Z
  const fov = framing.poseFov > 0 ? framing.poseFov : framing.fov;
  const tanHalf = Math.tan((fov * Math.PI / 180) * 0.5);
  if (!(depth > 0) || !(tanHalf > 0)) {
    return writeGlassProjection(out, 0, 0, false, depth < 0);
  }
  const ndcX = (vx / depth) / (tanHalf * framing.aspect);
  const ndcY = (vy / depth) / tanHalf;
  // Perspective z maps near→−1 / far→+1; the real helper counts ndc z < 1 as
  // inside, so a point past the far plane is honestly off-glass.
  const near = framing.poseNear > 0 ? framing.poseNear : 1;
  const far = framing.poseFar > near ? framing.poseFar : 14000;
  const ndcZ = ((far + near) * depth - 2 * far * near) / ((far - near) * depth);
  const onScreen = ndcZ < 1 && Math.abs(ndcX) <= 1 && Math.abs(ndcY) <= 1;
  return writeGlassProjection(
    out,
    (ndcX * 0.5 + 0.5) * framing.width,
    (-ndcY * 0.5 + 0.5) * framing.height,
    onScreen,
    false,
    ndcX,
    ndcY,
  );
}

export function tableWorldToScreen(state, viewport, pos, out) {
  if (!pos || !Number.isFinite(Number(pos.x)) || !Number.isFinite(Number(pos.z))) {
    return writeGlassProjection(out, 0, 0, false, false);
  }
  const framing = tableChaseFraming(state, viewport, _laneFraming);
  // A complete transported pose answers with the real perspective transform —
  // the only honest answer for the racing stern rig and blended/director
  // frames the top-down derivation cannot describe.
  if (framing.poseReady) return projectDisplayedPose(framing, pos, out);
  const dx = (Number(pos.x) || 0) - framing.focusX;
  const dz = (Number(pos.z) || 0) - framing.focusZ;
  const tilt = framing.tiltDeg * Math.PI / 180;
  const tanHalf = Math.tan((framing.fov * Math.PI / 180) * 0.5);
  const depth = framing.distance + Math.cos(tilt) * dz;
  // Behind the camera the perspective divide mirrors x/y — report `behind` like
  // the real helper so consumers reading raw signs land on the right edge.
  if (!(depth > 0) || !(tanHalf > 0)) {
    return writeGlassProjection(out, 0, 0, false, depth <= 0);
  }
  const ndcX = (-dx / depth) / (tanHalf * framing.aspect);
  const ndcY = (Math.sin(tilt) * dz / depth) / tanHalf;
  const onScreen = Math.abs(ndcX) <= 1 && Math.abs(ndcY) <= 1;
  return writeGlassProjection(
    out,
    (ndcX * 0.5 + 0.5) * framing.width,
    (-ndcY * 0.5 + 0.5) * framing.height,
    onScreen,
    false,
    ndcX,
    ndcY,
  );
}

export function submitRunwayWu(speed = TABLE_REFERENCE_SPEED_WU) {
  return approachDistanceWu(TABLE_SUBMIT_APPROACH_SECONDS, speed);
}

/**
 * Earliest t in [0, horizonS] at which a point at relative position
 * (relX, relZ) moving at relative velocity (relVx, relVz) sits within
 * radiusWu of the anchor. Returns 0 when already inside, Infinity when the
 * point never enters inside the horizon. Solves |p + v t| = r for the first
 * root, so a fast inbound contact earns its runway from closing speed while a
 * receding one earns none — the "leaned oval" falls out of the math instead of
 * being a shifted disc that still cannot see an oncoming hull.
 */
export function timeToEnterRadiusSeconds(relX, relZ, relVx, relVz, radiusWu, horizonS) {
  const r = Math.max(0, Number(radiusWu) || 0);
  const h = Math.max(0, Number(horizonS) || 0);
  const x = Number(relX) || 0;
  const z = Number(relZ) || 0;
  const vx = Number(relVx) || 0;
  const vz = Number(relVz) || 0;
  const c = x * x + z * z - r * r;
  if (c <= 0) return 0;
  if (!(h > 0)) return Infinity;
  const a = vx * vx + vz * vz;
  if (a <= 1e-8) return Infinity;
  const b = x * vx + z * vz;
  if (b >= 0) return Infinity;
  const disc = b * b - a * c;
  if (disc < 0) return Infinity;
  const t = (-b - Math.sqrt(disc)) / a;
  return t >= 0 && t <= h ? t : Infinity;
}

/**
 * Anchor for admission prediction. The live look-at sits ahead of the hull
 * under velocity lead, which is where the glass actually is — but after a
 * relocate the frame-local focus can trail thousands of WU behind the player
 * while it crawls over. Use the focus while it stays within leadCapWu of the
 * player; otherwise predict from the player position. Focus is frame-local;
 * world positions stay galactic-global, so rebase before subtracting.
 */
export function admissionAnchorPos(state, playerPos, leadCapWu, out) {
  const target = out || { x: 0, z: 0 };
  target.x = Number.isFinite(playerPos && playerPos.x) ? playerPos.x : 0;
  target.z = Number.isFinite(playerPos && playerPos.z) ? playerPos.z : 0;
  const focus = state && state.camera && state.camera.focus;
  if (!focus || !Number.isFinite(focus.x) || !Number.isFinite(focus.z)) return target;
  const frame = state && state.world && state.world.frameOrigin;
  const gx = focus.x + (Number.isFinite(frame && frame.x) ? frame.x : 0);
  const gz = focus.z + (Number.isFinite(frame && frame.z) ? frame.z : 0);
  const dx = gx - target.x;
  const dz = gz - target.z;
  const cap = Math.max(0, Number(leadCapWu) || 0);
  if (cap > 0 && dx * dx + dz * dz <= cap * cap) {
    target.x = gx;
    target.z = gz;
  }
  return target;
}

export function glassCornerWu(zoom, fovDeg, aspect, tiltDeg = 60) {
  const glass = glassHalfExtents(zoom, fovDeg, aspect, tiltDeg);
  return Math.hypot(glass.halfX, glass.halfZ);
}

export function residencyPrefetchRadius(
  speed = TABLE_REFERENCE_SPEED_WU,
  zoom = 144,
  fovDeg = 50,
  aspect = 16 / 9,
  tiltDeg = 60,
) {
  return glassCornerWu(zoom, fovDeg, aspect, tiltDeg)
    + approachDistanceWu(TABLE_RESIDENCY_PREFETCH_SECONDS, speed);
}

export function residencyEvictRadius(
  speed = TABLE_REFERENCE_SPEED_WU,
  zoom = 144,
  fovDeg = 50,
  aspect = 16 / 9,
  tiltDeg = 60,
) {
  return glassCornerWu(zoom, fovDeg, aspect, tiltDeg)
    + approachDistanceWu(TABLE_RESIDENCY_EVICT_SECONDS, speed);
}

export function authoredPrefetchRadius(speed = TABLE_REFERENCE_SPEED_WU) {
  return approachDistanceWu(TABLE_AUTHORED_DECODE_SECONDS, speed);
}

/** Cooked inbound hulls need the same hysteresis outside their longer decode runway. */
export function authoredResidencyEvictRadius(speed = TABLE_REFERENCE_SPEED_WU) {
  return authoredPrefetchRadius(speed)
    + approachDistanceWu(TABLE_RESIDENCY_EVICT_SECONDS - TABLE_RESIDENCY_PREFETCH_SECONDS, speed);
}

export function authoredImmediateRadius(speed = TABLE_REFERENCE_SPEED_WU) {
  return approachDistanceWu(TABLE_AUTHORED_IMMEDIATE_SECONDS, speed);
}

/**
 * Loading-time compose radius. Glass plus the immediate authored runway.
 * Replaces the leftover 2400 WU ship horizon. Critical starting hubs are
 * a separate exception in the caller, not a reason to grow this number.
 */
const _openingComposeScratch = { key: '', radius: 0 };

export function tableOpeningCompositionWu(state) {
  const camera = state && state.camera || {};
  const video = state && state.settings && state.settings.video || {};
  const live = Number.isFinite(camera.liveZoom) ? camera.liveZoom : NaN;
  const requested = Number.isFinite(camera.zoom) ? camera.zoom : NaN;
  const zoom = Math.max(
    Number.isFinite(live) ? live : 0,
    Number.isFinite(requested) ? requested : 0,
  ) || 144;
  const fov = Number.isFinite(camera.fov) ? camera.fov
    : (Number.isFinite(video.fov) ? video.fov : 50);
  const aspect = Number.isFinite(camera.aspect) && camera.aspect > 0 ? camera.aspect : 16 / 9;
  const tilt = Number.isFinite(camera.tilt) ? camera.tilt : 60;
  const travel = tableTravelSpeed(state);
  const key = `${zoom}|${fov}|${aspect}|${tilt}|${travel}`;
  if (key === _openingComposeScratch.key) return _openingComposeScratch.radius;
  const radius = glassCornerWu(zoom, fov, aspect, tilt) + authoredImmediateRadius(travel);
  _openingComposeScratch.key = key;
  _openingComposeScratch.radius = radius;
  return radius;
}

/**
 * 47-A cold-start holding ships sit 1.7–2.3 km out and must still compose
 * during the Helios loading screen. The safety flag is permanent, so later
 * Continues must not treat those ships as opening identities.
 */
export function isOpeningStoryActor(entity, state) {
  const data = entity && entity.data;
  const ai = data && data.ai;
  if (!ai || ai.liveColdStartSafe !== true) return false;
  if (data._liveColdStartActivated === true) return false;
  if (!state || state.mode !== 'loading') return false;
  const sector = state.world && state.world.currentSectorId;
  if (sector && sector !== 'sector_helios_prime') return false;
  return true;
}

export function authoredLookaheadSeconds() {
  return TABLE_AUTHORED_DECODE_SECONDS;
}

/**
 * Hidden/submit box: the readable glass plus a short approach runway.
 * Replaces the old max(900, zoom*8) fake-visible margin.
 *
 * Memoized on the normalized terms (an omitted/NaN term maps to the same default the math
 * would use, so it cannot false-miss); see _submitCullCache up top. The function reads
 * only its parameters (glassHalfExtents/submitRunwayWu are pure), so the key covers
 * every input — zoom, fov, aspect, tilt, travel speed.
 */
export function submitCullHalfExtents(
  zoom,
  fovDeg,
  aspect,
  speed = TABLE_REFERENCE_SPEED_WU,
  tiltDeg = 60,
) {
  const distance = Number.isFinite(zoom) ? zoom : 88;
  const fov = Number.isFinite(fovDeg) ? fovDeg : 50;
  const aspectValue = Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9;
  const tiltDegValue = Number.isFinite(tiltDeg) ? tiltDeg : 60;
  const travel = Math.max(0, Number(speed) || 0);
  const speedValue = travel > 0 ? travel : TABLE_REFERENCE_SPEED_WU;
  if (
    _submitCullCache.zoom === distance
    && _submitCullCache.fov === fov
    && _submitCullCache.aspect === aspectValue
    && _submitCullCache.tilt === tiltDegValue
    && _submitCullCache.speed === speedValue
  ) {
    return _submitCullCache.result;
  }
  const glass = glassHalfExtents(distance, fov, aspectValue, tiltDegValue);
  const runway = submitRunwayWu(speedValue);
  _submitCullCache.zoom = distance;
  _submitCullCache.fov = fov;
  _submitCullCache.aspect = aspectValue;
  _submitCullCache.tilt = tiltDegValue;
  _submitCullCache.speed = speedValue;
  _submitCullCache.result = {
    glass,
    runway,
    halfX: glass.halfX + runway,
    halfZ: glass.halfZ + runway,
  };
  return _submitCullCache.result;
}

export function tableShadowCastRadius(zoom, fovDeg, aspect, tiltDeg = 60) {
  const glass = glassHalfExtents(zoom, fovDeg, aspect, tiltDeg);
  return Math.max(glass.halfX, glass.halfZ) + TABLE_SHADOW_SKIRT_WU;
}

/**
 * Caster band must fit inside the key-light ortho. A larger number would flip
 * far hulls to castShadow even though they sit outside the ±300 light box.
 */
export function tableShadowCasterRadius(
  zoom,
  fovDeg,
  aspect,
  tiltDeg = 60,
  cap = 300,
) {
  const radius = tableShadowCastRadius(zoom, fovDeg, aspect, tiltDeg);
  const limit = Number.isFinite(Number(cap)) && Number(cap) > 0 ? Number(cap) : 300;
  return Math.min(limit, Math.max(80, radius));
}

export function classifyTableBand(options = {}) {
  const radius = Math.max(0, Number(options.radius) || 0);
  const absDx = Math.max(0, Math.abs(Number(options.dx) || 0) - radius);
  const absDz = Math.max(0, Math.abs(Number(options.dz) || 0) - radius);
  const glassX = Number.isFinite(Number(options.glassHalfX)) ? Number(options.glassHalfX) : 0;
  const glassZ = Number.isFinite(Number(options.glassHalfZ)) ? Number(options.glassHalfZ) : 0;
  const runway = Math.max(0, Number(options.runwayWu) || 0);
  if (absDx <= glassX && absDz <= glassZ) return TABLE_BAND.GLASS;
  if (absDx <= glassX + runway && absDz <= glassZ + runway) return TABLE_BAND.RUNWAY;
  return TABLE_BAND.BEYOND;
}

/**
 * Persistent landmarks (stations, planets, fx) are map facts until they can
 * enter the table. The Helios opening hub is still a loading-time exception
 * via authored admission, not a whole-sector mesh keep-alive.
 */
export function isCriticalStartingHub(entity) {
  if (!entity || entity.type !== 'station') return false;
  const data = entity.data || {};
  if (entity.id === 'station_helios' || data.stationId === 'station_helios') return true;
  const token = String(data.archetypeGlb || data.placeId || '')
    .replace(/^places\//, '')
    .replace(/\.glb$/, '');
  return token === 'place_station_trade_hub' && data.sectorId === 'sector_helios_prime';
}

/**
 * The critical-hub privilege is scoped to the hub's own sector. Measured 2026-09-25
 * (.devshots/landmark-diag): the ~82 MB trade hub held the serial composition queue at rung 1
 * for 57s+ after the player left Helios, starving the destination sector's authored bodies
 * behind a station nobody could see. Same keep-alive rule as
 * shouldKeepPersistentLandmarkResident: outside its sector the hub is an ordinary station.
 * Before a live sector exists (loading), the startup behaviour stands.
 */
export function isCriticalHubInCurrentSector(entity, currentSectorId) {
  if (!isCriticalStartingHub(entity)) return false;
  const current = currentSectorId ? String(currentSectorId) : '';
  if (!current) return true;
  const data = entity.data || {};
  // The critical hub IS the Helios trade hub; the fallback keeps an id-matched record with no
  // sector fields honest rather than homeless.
  const home = entity.homeSectorId || data.homeSectorId || data.sectorId || 'sector_helios_prime';
  return String(home) === current;
}

export function isPersistentLandmark(entity) {
  if (!entity || entity.alive === false) return false;
  if (entity.type !== 'station' && entity.type !== 'planet') return false;
  const data = entity.data || {};
  return data.landmark === true || isCriticalStartingHub(entity);
}

/**
 * A landmark the player has NOT arrived at is still only a map fact — building it across the sector
 * is the whole-sector eagerness this policy exists to refuse.
 *
 * One admitted landmark is a different question, and getting it wrong is what put a dock prompt
 * over empty space at Helios. The opening hub is decoded to `authored` during loading (the flight
 * gate in `authoredCriticalVisualReadiness` waits for it) while the player is 1347 WU away, and
 * `willEntityEnterAuthoredUpgradeRunway` holds it relevant for authored upgrade at any distance.
 * Then the first flight reconcile applied the distance rule alone and threw it away at tick 16 —
 * the boot paid the entire cost and kept nothing. Re-admitting it on approach costs the decode a
 * second time and leaves the station a bare marker until it lands.
 *
 * So: never build a far landmark, but never evict one already standing in the sector the player is
 * in. Leaving the sector still drops it, because the sector ids stop matching.
 *
 * The same keep now covers every station, not only landmark-flagged ones: stations are few per
 * sector and expensive to rebuild, and the owner reported big stations vanishing and popping back
 * — an authored station body already standing in the current sector is kept. Still never built
 * from far (`authoredResident` is required), and off-screen roots are still not submitted, so the
 * keep is memory only.
 *
 * The keep is bounded by the same runway the approach rebuild decodes on
 * (TABLE_DECODE_RUNWAY_SECONDS × tableTravelSpeed — 2160 WU at the 160 WU/s floor):
 * an in-sector landmark kept at ANY distance made off-table resident meshes climb
 * without bound. Past it an authored place demotes to a map fact and the approach
 * chain (`kickDecodeRunwayAssets` + `isInboundDecodeHull`) re-decodes it on the way
 * in. A root mid-admission (`authoredPending`) counts as resident inside the
 * runway so the evict edge cannot restart a paid decode.
 */
export function shouldKeepPersistentLandmarkResident(entity, options = {}) {
  if (!entity) return false;
  if (options.forceRender === true || options.neverCull === true) return true;
  if (options.withinResidency === true) return true;
  if (options.mode === 'loading' && isCriticalStartingHub(entity)) return true;
  if (options.authoredResident !== true && options.authoredPending !== true) return false;
  if (!isPersistentLandmark(entity) && entity.type !== 'station') return false;
  const currentSectorId = options.currentSectorId ? String(options.currentSectorId) : '';
  if (!currentSectorId) return false;
  const data = entity.data || {};
  const sectorId = entity.homeSectorId || data.homeSectorId || data.sectorId || null;
  if (!sectorId || String(sectorId) !== currentSectorId) return false;
  const travel = Math.max(TABLE_REFERENCE_SPEED_WU, Number(options.travelSpeedWu) || 0);
  const distance = Number(options.distanceWu);
  return Number.isFinite(distance) && distance <= TABLE_DECODE_RUNWAY_SECONDS * travel;
}

export function emptyTableCensus() {
  return {
    glass: 0,
    runway: 0,
    beyond: 0,
    resident: 0,
    submitted: 0,
    landmarks: 0,
  };
}

/**
 * Count live entities into glass / runway / beyond. `submitted` is glass+runway
 * plus forced roots. Used by PQ-061 probes and renderer diagnostics.
 */
export function censusTableBands(entities, options = {}) {
  const counts = emptyTableCensus();
  const list = Array.isArray(entities) ? entities : [];
  const glassHalfX = Number(options.glassHalfX) || 0;
  const glassHalfZ = Number(options.glassHalfZ) || 0;
  const runwayWu = Number(options.runwayWu) || 0;
  const originX = Number(options.originX) || 0;
  const originZ = Number(options.originZ) || 0;
  const playerId = options.playerId;
  for (const entity of list) {
    if (!entity || entity.alive === false) continue;
    const type = entity.type;
    if (type === 'station' || type === 'planet' || type === 'fx') counts.landmarks += 1;
    const forced = entity.id === playerId
      || entity.isPlayer === true
      || !!(entity.flags && (entity.flags.forceRender || entity.flags.neverCull));
    const pos = entity.pos;
    const dx = pos && Number.isFinite(pos.x) ? pos.x - originX : 0;
    const dz = pos && Number.isFinite(pos.z) ? pos.z - originZ : 0;
    const radius = Math.max(0, Number(entity.radius) || 0);
    const band = forced
      ? TABLE_BAND.GLASS
      : classifyTableBand({ dx, dz, glassHalfX, glassHalfZ, runwayWu, radius });
    counts[band] += 1;
    if (band === TABLE_BAND.GLASS || band === TABLE_BAND.RUNWAY) counts.submitted += 1;
    if (options.residentIds && options.residentIds.has(entity.id)) counts.resident += 1;
  }
  return counts;
}

// ---- projectile frame test ------------------------------------------------
// Moved here from src/combat/projectileFlight.js: combat grammar forbids sim
// code importing presentation, and this is a draw question, not a sim one.

const _frameLook = { x: 0, z: 0 };

/**
 * True when a world position should be drawn this frame. Missing player
 * position does not cull: a fixture with no pilot still has to show the shot.
 * The pad keeps a round visible until its body and dash have left the glass.
 */
export function projectileOnReadableFrame(state, pos, playerPos, drawWu, out) {
  if (!playerPos || !Number.isFinite(playerPos.x) || !Number.isFinite(playerPos.z)) return true;
  const base = Number.isFinite(drawWu) && drawWu > 0 ? drawWu : tableVfxDrawWuFromState(state);
  const look = tableLookAtDelta(state, playerPos, pos, out || _frameLook);
  return shouldDrawTableVfx(look.x, look.z, base + PROJECTILE_DRAW_PAD_WU);
}
