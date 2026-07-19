// src/ui/map/mapCamera.js — the continuous map camera (ADR D3), as a pure module.
//
// WHY THIS EXISTS
// ---------------
// The map today hard-switches between three projections (`buildGalaxyModel` / `buildSystemModel` /
// `buildLocalModel`). Those builders are working, checked, content-bearing code and are NOT
// rewritten (ADR D9.2). They stay as LOD strategies. What changes is the CAMERA STATE they are
// projected through, so that crossing a scale threshold reads as ZOOMING rather than SWITCHING
// MAPS. Continuity comes from one property: a span change preserves `focusGlobal`.
//
// THE FRAME CONTRACT (ADR D2.1) — every coordinate in this module's public API is GLOBAL
// (`global_v1`). Never pass a sector-local position in, and never treat a value that comes out as
// sector-local. `point.drawPos` (the sector-local draw frame) has no business here at all: this
// module IS the replacement for per-sector draw frames. Helios sits at origin (0,0), so a frame
// mistake is invisible there and 12,288 WU wrong in sector_tethys_junction — which is exactly the
// class of bug this program exists to fix, and exactly why the tests exercise Tethys.
//
// PROJECTION CONVENTION — read this before integrating.
//   * North-up. +x global → +x screen (right). +z global → +y screen (down).
//     `buildLocalModel`'s draw site uses a flipped-sign scope frame (`w/2 - (x - cx)*...`). That
//     flip is a PRESENTATION choice belonging to the local builder and is NOT baked in here.
//     Reconciling it is the integration packet's job, at the draw site.
//   * `spanWU` is the world extent covered across the viewport's MINOR axis, i.e.
//     `pxPerWU = min(viewport.width, viewport.height) / spanWU`. The major axis therefore shows
//     MORE than `spanWU`. This matches the shipped system/local builders' `min(w,h)/span` shape.
//   * The legacy builders multiply that by a `0.85` cosmetic inset. It is deliberately NOT baked
//     in here — a camera should mean what it says. Apply padding at the draw site if wanted.
//
// PURITY — no DOM, no canvas, no import of galaxyMap.js, no module-level mutable state. Every
// transform returns a NEW frozen camera; inputs are never mutated. Unit-testable under
// `node --test` with no browser.

import {
  SECTOR_ORIGIN_LATTICE_WU,
  CORRIDOR_SECTOR_IDS,
  CORRIDOR_PLAYABLE_MARGIN_WU,
  sectorGlobalOrigin,
  sectorMembershipAtGlobal,
} from '../../data/sectorCoordinates.js';

// ---------------------------------------------------------------------------------------------
// Level thresholds — reproduced EXACTLY from src/ui/galaxyMap.js.
// ---------------------------------------------------------------------------------------------
// These four numbers mirror `ZOOM_MIN` / `ZOOM_MAX` / `LEVEL_SYSTEM_AT` / `LEVEL_LOCAL_AT` in
// galaxyMap.js (galaxyMap.js:98-101). They are redeclared rather than imported because this module
// must not depend on galaxyMap.js (a 6,864-line DOM/canvas screen). `test/map-camera.test.mjs`
// imports the galaxyMap originals and asserts these equal them, so any future drift in galaxyMap
// fails `check:map-camera` loudly instead of silently desyncing the level boundaries.
export const ZOOM_MIN = 0.35;
export const ZOOM_MAX = 22;
export const LEVEL_SYSTEM_AT_ZOOM = 1.6; // zoom >= this -> SYSTEM (or LOCAL)
export const LEVEL_LOCAL_AT_ZOOM = 2.8;  // zoom >= this -> LOCAL

export const MAP_LEVELS = Object.freeze({
  LOCAL: 'local',
  SYSTEM: 'system',
  GALAXY: 'galaxy',
});

/**
 * The span shown at legacy zoom 1.0 — the anchor that converts the legacy unitless zoom scalar
 * into world units.
 *
 * This constant is NEW, and necessarily so: the legacy `zoom` is LEVEL-RELATIVE, because each
 * builder computes its own `baseScale` (galaxy fits the chart AABB; system and local use
 * `min(w,h)*0.85/span`). There is therefore no single span↔zoom mapping that reproduces legacy
 * PIXEL scale, and none is claimed. What IS reproduced exactly is the LEVEL THRESHOLDS: because
 * `spanForZoom` is a strictly decreasing bijection, `levelForSpan(spanForZoom(z))` equals
 * `levelForZoom(z)` for every z regardless of the reference value chosen. The test proves that
 * over a sweep, so this number cannot change level semantics — it only sets the WU scale at which
 * the boundaries land.
 *
 * Chosen as five lattice cells so every derived span is a lattice fraction and the ADR D3 preset
 * spans ("~3-4k", "~10k") each land inside their own level.
 */
export const MAP_SPAN_REFERENCE_WU = SECTOR_ORIGIN_LATTICE_WU * 5; // 20480

/** Span at or below which the level is LOCAL. Mirrors `zoom >= LEVEL_LOCAL_AT`. */
export const LEVEL_LOCAL_AT_SPAN_WU = MAP_SPAN_REFERENCE_WU / LEVEL_LOCAL_AT_ZOOM;
/** Span at or below which the level is SYSTEM (when not already LOCAL). */
export const LEVEL_SYSTEM_AT_SPAN_WU = MAP_SPAN_REFERENCE_WU / LEVEL_SYSTEM_AT_ZOOM;

// ---------------------------------------------------------------------------------------------
// Chart extent — the whole authored lattice, in global coordinates.
// ---------------------------------------------------------------------------------------------
// Plain const computed once at module load from frozen data. Deterministic, side-effect free, and
// not a memo cache (which would be module-level mutable state).

/** Sector world radius assumed when padding the chart AABB (matches `corridorPlayableBounds`). */
const CHART_DEFAULT_SECTOR_RADIUS_WU = 4000;

function computeChartExtent() {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const pad = CHART_DEFAULT_SECTOR_RADIUS_WU + CORRIDOR_PLAYABLE_MARGIN_WU;
  for (const id of CORRIDOR_SECTOR_IDS) {
    const o = sectorGlobalOrigin(id);
    minX = Math.min(minX, o.x - pad);
    maxX = Math.max(maxX, o.x + pad);
    minZ = Math.min(minZ, o.z - pad);
    maxZ = Math.max(maxZ, o.z + pad);
  }
  if (!Number.isFinite(minX)) {
    // No authored sectors at all: degenerate, but must never produce NaN.
    return Object.freeze({
      center: Object.freeze({ x: 0, z: 0 }),
      widthWU: MAP_SPAN_REFERENCE_WU,
      heightWU: MAP_SPAN_REFERENCE_WU,
      spanWU: MAP_SPAN_REFERENCE_WU,
    });
  }
  const widthWU = maxX - minX;
  const heightWU = maxZ - minZ;
  return Object.freeze({
    // AABB center — the "chart centroid" of ADR D3. Equals `corridorPlayableBounds().center`.
    center: Object.freeze({ x: (minX + maxX) * 0.5, z: (minZ + maxZ) * 0.5 }),
    widthWU,
    heightWU,
    // The minor-axis span must cover the LARGER side, or the chart clips on that axis.
    spanWU: Math.max(widthWU, heightWU),
  });
}

/** Frozen global-frame extent of the whole authored chart. */
export const MAP_CHART_EXTENT = computeChartExtent();

/** Smallest allowed span — parity with the legacy innermost zoom (`ZOOM_MAX`). */
export const MAP_SPAN_MIN_WU = MAP_SPAN_REFERENCE_WU / ZOOM_MAX;
/**
 * Largest allowed span. Legacy parity (`ZOOM_MIN`) is the floor, but the whole chart must always
 * be reachable, so the real bound is "you cannot zoom out past the entire chart".
 */
export const MAP_SPAN_MAX_WU = Math.max(MAP_SPAN_REFERENCE_WU / ZOOM_MIN, MAP_CHART_EXTENT.spanWU);

/**
 * Framing bookmarks (ADR D3). Local / System / Galaxy keep the same keybinds and the same muscle
 * memory; only the mental model underneath changes — they are camera presets, not separate maps.
 */
export const MAP_PRESET_SPAN_WU = Object.freeze({
  // ADR D3: "Local = player at ~3-4k span". 0.875 lattice.
  local: SECTOR_ORIGIN_LATTICE_WU * 0.875,       // 3584
  // ADR D3: "System = current sector origin at ~10k". 2.5 lattice.
  system: SECTOR_ORIGIN_LATTICE_WU * 2.5,        // 10240
  // ADR D3: "Galaxy = chart centroid at lattice extent".
  galaxy: MAP_CHART_EXTENT.spanWU,
});

// ---------------------------------------------------------------------------------------------
// Scalars
// ---------------------------------------------------------------------------------------------

function finite(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? (value === 0 ? 0 : value) : fallback;
}

function readXZ(point, fallbackX = 0, fallbackZ = 0) {
  return {
    x: finite(point && point.x, fallbackX),
    z: finite(point && point.z, fallbackZ),
  };
}

function clamp(value, lo, hi) {
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

/** Legacy zoom scalar -> span in world units. Strictly decreasing. */
export function spanForZoom(zoom) {
  // Mirrors galaxyMap's `Number(zoom) || 1` degenerate handling: unusable input reads as zoom 1.
  const z = finite(zoom, 0) || 1;
  if (z <= 0) return MAP_SPAN_REFERENCE_WU;
  return MAP_SPAN_REFERENCE_WU / z;
}

/** Span in world units -> the equivalent legacy zoom scalar. Inverse of `spanForZoom`. */
export function zoomForSpan(spanWU) {
  const s = finite(spanWU, 0);
  if (!(s > 0)) return 1;
  return MAP_SPAN_REFERENCE_WU / s;
}

/**
 * Map a span to a discrete level label.
 *
 * Written as a direct span inequality rather than `levelForZoom(zoomForSpan(span))` so the
 * boundary is EXACT: a round-trip through division would not land precisely on 2.8. The direction
 * mirrors galaxyMap's `zoom >= LEVEL_LOCAL_AT`, which is `span <= LEVEL_LOCAL_AT_SPAN_WU`, so the
 * boundary is inclusive toward the more-zoomed-in level, exactly as today.
 *
 * @param {number} spanWU
 * @returns {'local'|'system'|'galaxy'}
 */
export function levelForSpan(spanWU) {
  const s = finite(spanWU, 0);
  // Degenerate input reads as the reference span (zoom 1 -> galaxy), matching `Number(zoom) || 1`.
  if (!(s > 0)) return MAP_LEVELS.GALAXY;
  if (s <= LEVEL_LOCAL_AT_SPAN_WU) return MAP_LEVELS.LOCAL;
  if (s <= LEVEL_SYSTEM_AT_SPAN_WU) return MAP_LEVELS.SYSTEM;
  return MAP_LEVELS.GALAXY;
}

// ---------------------------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------------------------

/**
 * @typedef {{
 *   focusGlobal: {x:number, z:number},
 *   spanWU: number,
 *   minSpanWU: number,
 *   maxSpanWU: number,
 * }} MapCamera
 */

function makeCamera(focusX, focusZ, spanWU, minSpanWU, maxSpanWU) {
  const lo = finite(minSpanWU, MAP_SPAN_MIN_WU);
  const hiRaw = finite(maxSpanWU, MAP_SPAN_MAX_WU);
  // A caller that inverts the bounds gets a degenerate-but-sane camera rather than NaN.
  const min = lo > 0 ? lo : MAP_SPAN_MIN_WU;
  const max = hiRaw >= min ? hiRaw : min;
  return Object.freeze({
    focusGlobal: Object.freeze({ x: focusX, z: focusZ }),
    spanWU: clamp(finite(spanWU, MAP_SPAN_REFERENCE_WU) || MAP_SPAN_REFERENCE_WU, min, max),
    minSpanWU: min,
    maxSpanWU: max,
  });
}

/**
 * Create a camera. Always returns a fully populated, frozen camera — `minSpanWU`/`maxSpanWU` are
 * never `undefined`, so a frozen camera can never carry missing limits into `zoomAt`.
 *
 * @param {{focusGlobal?:{x?:number,z?:number}, spanWU?:number, minSpanWU?:number, maxSpanWU?:number}} [init]
 * @returns {MapCamera}
 */
export function createMapCamera(init) {
  const focus = readXZ(init && init.focusGlobal);
  return makeCamera(
    focus.x,
    focus.z,
    init && init.spanWU !== undefined ? init.spanWU : MAP_SPAN_REFERENCE_WU,
    init && init.minSpanWU !== undefined ? init.minSpanWU : MAP_SPAN_MIN_WU,
    init && init.maxSpanWU !== undefined ? init.maxSpanWU : MAP_SPAN_MAX_WU,
  );
}

/** The level this camera is currently showing. */
export function cameraLevel(camera) {
  return levelForSpan(camera && camera.spanWU);
}

/** Pixels per world unit for a camera in a viewport. Minor-axis convention (see header). */
export function pixelsPerWU(camera, viewport) {
  const span = finite(camera && camera.spanWU, MAP_SPAN_REFERENCE_WU) || MAP_SPAN_REFERENCE_WU;
  const w = finite(viewport && viewport.width, 0);
  const h = finite(viewport && viewport.height, 0);
  const minor = Math.min(w, h);
  if (!(minor > 0) || !(span > 0)) return 0;
  return minor / span;
}

/** Viewport center in canvas coordinates. `viewport.x`/`y` default to 0 (full-canvas). */
function viewportCenter(viewport) {
  return {
    x: finite(viewport && viewport.x, 0) + finite(viewport && viewport.width, 0) / 2,
    y: finite(viewport && viewport.y, 0) + finite(viewport && viewport.height, 0) / 2,
  };
}

/**
 * Project a GLOBAL position to canvas coordinates. North-up; see the header for the convention.
 *
 * @param {MapCamera} camera
 * @param {{x?:number,z?:number}} globalPos GLOBAL frame (global_v1)
 * @param {{width:number, height:number, x?:number, y?:number}} viewport
 * @returns {{x:number, y:number}} canvas pixels
 */
export function globalToScreen(camera, globalPos, viewport) {
  const p = pixelsPerWU(camera, viewport);
  const center = viewportCenter(viewport);
  const focus = readXZ(camera && camera.focusGlobal);
  const g = readXZ(globalPos);
  return { x: center.x + (g.x - focus.x) * p, y: center.y + (g.z - focus.z) * p };
}

/**
 * Unproject canvas coordinates back to a GLOBAL position. Exact inverse of `globalToScreen`.
 *
 * @param {MapCamera} camera
 * @param {{x?:number,y?:number}} screenPos canvas pixels
 * @param {{width:number, height:number, x?:number, y?:number}} viewport
 * @returns {{x:number, z:number}} GLOBAL frame (global_v1)
 */
export function screenToGlobal(camera, screenPos, viewport) {
  const p = pixelsPerWU(camera, viewport);
  const center = viewportCenter(viewport);
  const focus = readXZ(camera && camera.focusGlobal);
  const sx = finite(screenPos && screenPos.x, 0);
  const sy = finite(screenPos && screenPos.y, 0);
  if (!(p > 0)) return { x: focus.x, z: focus.z };
  return { x: focus.x + (sx - center.x) / p, z: focus.z + (sy - center.y) / p };
}

/**
 * CURSOR-ANCHORED ZOOM — the single most important property in this module.
 *
 * The world point under the cursor stays exactly under the cursor across the zoom, at every scale
 * and in every sector. Derivation, with `P` the minor-axis pixel count:
 *
 *   screen(cursor) before = center + (cursor - focusPrev) * P / spanPrev
 *   focusNext             = cursor + (focusPrev - cursor) * k,  where k = spanNext / spanPrev
 *   cursor - focusNext    = (cursor - focusPrev) * k
 *   screen(cursor) after  = center + (cursor - focusPrev) * k * P / spanNext
 *                         = center + (cursor - focusPrev) * P / spanPrev   QED
 *
 * Note `k` is the ACHIEVED span ratio, not the requested `factor`. That distinction is the whole
 * reason this holds when the span clamps at a limit: deriving the focus from the requested factor
 * instead would let the view drift every time a player scrolls against the zoom stop.
 *
 * @param {MapCamera} camera
 * @param {{x?:number,z?:number}} cursorGlobal GLOBAL frame — the world point to pin
 * @param {number} factor >1 zooms IN (span shrinks), <1 zooms OUT. Matches the legacy
 *                        `zoom * factor` sense in galaxyMap's wheel handler.
 * @returns {MapCamera} a new frozen camera; `camera` is never mutated
 */
export function zoomAt(camera, cursorGlobal, factor) {
  const cam = camera && typeof camera === 'object' ? camera : createMapCamera();
  const spanPrev = finite(cam.spanWU, MAP_SPAN_REFERENCE_WU) || MAP_SPAN_REFERENCE_WU;
  const min = finite(cam.minSpanWU, MAP_SPAN_MIN_WU);
  const max = finite(cam.maxSpanWU, MAP_SPAN_MAX_WU);
  const f = finite(factor, 1);
  const focus = readXZ(cam.focusGlobal);
  if (!(f > 0)) return makeCamera(focus.x, focus.z, spanPrev, min, max);

  const spanNext = clamp(spanPrev / f, min > 0 ? min : MAP_SPAN_MIN_WU, max);
  const k = spanNext / spanPrev;
  const cursor = readXZ(cursorGlobal, focus.x, focus.z);
  return makeCamera(
    cursor.x + (focus.x - cursor.x) * k,
    cursor.z + (focus.z - cursor.z) * k,
    spanNext,
    min,
    max,
  );
}

/** Set the span, keeping `focusGlobal` fixed. This is what makes a level change read as zooming. */
export function setSpan(camera, spanWU) {
  const cam = camera && typeof camera === 'object' ? camera : createMapCamera();
  const focus = readXZ(cam.focusGlobal);
  return makeCamera(focus.x, focus.z, spanWU, cam.minSpanWU, cam.maxSpanWU);
}

/** Set the focus (GLOBAL frame), keeping the span fixed. */
export function setFocus(camera, focusGlobal) {
  const cam = camera && typeof camera === 'object' ? camera : createMapCamera();
  const next = readXZ(focusGlobal);
  return makeCamera(next.x, next.z, cam.spanWU, cam.minSpanWU, cam.maxSpanWU);
}

/** Pan by a GLOBAL-frame delta. Convenience for drag handling in the integration packet. */
export function panBy(camera, deltaGlobal) {
  const cam = camera && typeof camera === 'object' ? camera : createMapCamera();
  const focus = readXZ(cam.focusGlobal);
  const d = readXZ(deltaGlobal);
  return makeCamera(focus.x + d.x, focus.z + d.z, cam.spanWU, cam.minSpanWU, cam.maxSpanWU);
}

// ---------------------------------------------------------------------------------------------
// Framing
// ---------------------------------------------------------------------------------------------

/**
 * A framing bookmark (ADR D3). Returns the IDEAL framing descriptor, not a camera — apply it with
 * `setSpan`/`setFocus` or feed it to `createMapCamera`.
 *
 * @param {'local'|'system'|'galaxy'} name
 * @param {{playerGlobal?:{x,z}, sectorId?:string, focusGlobal?:{x,z}}} [ctx]
 * @returns {{focusGlobal:{x:number,z:number}, spanWU:number}}
 */
export function framePreset(name, ctx) {
  const key = typeof name === 'string' ? name.toLowerCase() : '';
  const context = ctx && typeof ctx === 'object' ? ctx : {};

  if (key === MAP_LEVELS.GALAXY) {
    return {
      focusGlobal: { x: MAP_CHART_EXTENT.center.x, z: MAP_CHART_EXTENT.center.z },
      spanWU: MAP_PRESET_SPAN_WU.galaxy,
    };
  }

  if (key === MAP_LEVELS.LOCAL) {
    // The player is the subject at local scale. Fall back through explicit focus, then the sector
    // origin, so a preset never silently frames (0,0) — which in Helios looks correct and in
    // Tethys is 14.7k WU away from anything.
    let focus = context.playerGlobal || context.focusGlobal || null;
    if (!focus && context.sectorId) focus = sectorGlobalOrigin(context.sectorId);
    const f = readXZ(focus);
    return { focusGlobal: { x: f.x, z: f.z }, spanWU: MAP_PRESET_SPAN_WU.local };
  }

  // SYSTEM is the default, mirroring galaxyMap's `zoomForMapFocus` fallback for unknown focus.
  let sectorId = context.sectorId;
  if (!sectorId && context.playerGlobal) {
    // Voronoi membership — the sanctioned "which sector am I in" helper.
    sectorId = sectorMembershipAtGlobal(context.playerGlobal);
  }
  const origin = sectorGlobalOrigin(sectorId);
  return {
    focusGlobal: { x: finite(origin && origin.x, 0), z: finite(origin && origin.z, 0) },
    spanWU: MAP_PRESET_SPAN_WU.system,
  };
}

/**
 * Frame two GLOBAL points together — "Frame ship and destination".
 *
 * Span is taken from the LARGER axis separation because `spanWU` is the minor-axis extent: sizing
 * to the larger separation guarantees both points fit on both axes for any viewport aspect.
 *
 * @param {{x?:number,z?:number}} aGlobal
 * @param {{x?:number,z?:number}} bGlobal
 * @param {{marginFactor?:number, minSpanWU?:number, maxSpanWU?:number}} [opts]
 * @returns {{focusGlobal:{x:number,z:number}, spanWU:number}}
 */
export function frameBoth(aGlobal, bGlobal, opts) {
  const a = readXZ(aGlobal);
  const b = readXZ(bGlobal);
  const options = opts && typeof opts === 'object' ? opts : {};
  const marginRaw = finite(options.marginFactor, 1.35);
  const margin = marginRaw >= 1 ? marginRaw : 1;
  const lo = finite(options.minSpanWU, MAP_SPAN_MIN_WU);
  const min = lo > 0 ? lo : MAP_SPAN_MIN_WU;
  const hi = finite(options.maxSpanWU, MAP_SPAN_MAX_WU);
  const max = hi >= min ? hi : min;

  const separation = Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
  // Coincident points would give span 0; the clamp floor keeps the camera usable.
  const spanWU = clamp(separation * margin, min, max);
  return {
    focusGlobal: { x: (a.x + b.x) * 0.5, z: (a.z + b.z) * 0.5 },
    spanWU,
  };
}
