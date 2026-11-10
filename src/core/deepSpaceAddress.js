// Deep-space addressing — ADR D4: "deep space is data sparsity with retained addressing, never absence."
//
// The player must never be spatially undefined. Between charted places the chart goes blank today and
// there is no readout at all. The fix is cheap because every input already exists:
//
//   * `sectorMembershipAtGlobal()` (src/data/sectorCoordinates.js) already resolves the Voronoi cell.
//     There is ALWAYS exactly one, everywhere on the lattice, so a sector id is never absent.
//   * The sector discs (`worldRadius`) and origins are already authored and frozen.
//   * `buildAtlasIndex()` (src/core/atlasIndex.js) already carries every routable place in ONE frame.
//
// So this module derives, it does not construct. Three layers, cheapest first, exactly as D4 orders
// them:
//
//   1. ADDRESSING  — `resolveDeepSpaceAddress`. The load-bearing part. D4 states this ONE readout
//      satisfies the "never spatially undefined" requirement by itself.
//   2. GRATICULE   — `graticuleTicks`. Pure tick geometry for the chart; this module never draws.
//   3. RECOVERY    — `resolveRecoveryVerbs`. Resolves TARGETS ONLY. D6 is binding: "if any packet
//      proposes new steering math, reject it." The caller hands `courseTarget` to the existing
//      `resolveCourseTarget` → `ui:setCourse` → local autopilot. No controller lives here.
//
// FRAME CONTRACT (ADR D2.1). Every position this module accepts and every position it returns is
// GLOBAL (`global_v1`). There is no sector-local value anywhere in this file and no `drawPos`.
// Projection to a draw frame is the caller's job, at the caller's boundary, with the caller's camera.
// Helios Prime sits at (0,0) and is the starting sector, which is why frame bugs survive there; the
// tests drive Tethys (12288, 8192) and Ceres (-12288, 8192) so a sign or an offset error cannot hide.
//
// Purity: no DOM, no rendering, no Math.random, no Date.now, no UPDATE_ORDER registration, nothing
// ticks. Distances use Math.sqrt rather than Math.hypot because ECMAScript only specifies hypot as
// implementation-approximated, and a chart distance that differs between engines is a route-planner
// bug waiting to happen (same reasoning as atlasIndex.js).

import { buildAtlasIndex } from './atlasIndex.js';
import {
  CORRIDOR_SECTOR_IDS,
  SECTOR_ORIGIN_LATTICE_WU,
  sectorGlobalOrigin,
  sectorMembershipAtGlobal,
} from '../data/sectorCoordinates.js';

export const DEEP_SPACE_ADDRESS_SCHEMA = 'deep_space_address_v1';

/**
 * Surveyor's ticks: a quarter of the 4096 WU sector-origin lattice. Quarter-lattice rather than a
 * round 1000 so ticks land ON sector origins — the graticule and the sector graph share one grid,
 * which is what makes the chart read as a survey instead of as graph paper behind a picture.
 */
export const GRATICULE_TICK_WU = SECTOR_ORIGIN_LATTICE_WU / 4;

/** Every fourth tick is a major: exactly one lattice unit, i.e. adjacent-sector-origin spacing. */
export const GRATICULE_MAJOR_WU = SECTOR_ORIGIN_LATTICE_WU;

export const ADDRESS_KIND = Object.freeze({
  /** Inside a sector's authored disc. The address is the place. */
  SECTOR: 'sector',
  /** Outside every disc. The address is a position along the chord between the two nearest origins. */
  TRANSIT: 'transit',
});

/**
 * Fallback disc radius for a sector with no authored `worldRadius`. Matches the default in
 * `corridorPlayableBounds`. A NaN radius would make every comparison false and report TRANSIT while
 * the player sits on a station, so this defaults rather than propagating the hole.
 */
export const DEFAULT_SECTOR_RADIUS_WU = 4000;

/**
 * Node kinds that count as a routable anchor for the recovery verbs. Zones are deliberately absent:
 * a zone is a disc you are inside or outside, not a point you fly to, and "divert to the middle of
 * the Ambush Lane" is not a recovery.
 */
export const RECOVERY_ANCHOR_KINDS = Object.freeze(['sector', 'station', 'gate', 'poi']);

/** Stable verb order. Recovery is a verb, not a menu (D4) — three one-press actions, always these. */
export const RECOVERY_VERBS = Object.freeze(['continue', 'divert', 'return']);

// ---------------------------------------------------------------------------------------------
// small numeric helpers
// ---------------------------------------------------------------------------------------------

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function hasXZ(p) {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.z);
}

function round2(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

function dist(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function frozenXZ(x, z) {
  return Object.freeze({ x: finite(x), z: finite(z) });
}

// ---------------------------------------------------------------------------------------------
// atlas access
// ---------------------------------------------------------------------------------------------

// Memoized because buildAtlasIndex walks every authored sector and the address is read every frame.
// The atlas is frozen and derived from frozen authored data, so one instance is safe to share; tests
// and checks inject their own through `options.atlas` rather than mutating this.
let cachedAtlas = null;

function defaultAtlas() {
  if (!cachedAtlas) cachedAtlas = buildAtlasIndex();
  return cachedAtlas;
}

function atlasOf(options) {
  const injected = options && options.atlas;
  return injected && typeof injected.getNode === 'function' ? injected : defaultAtlas();
}

/**
 * The short, all-caps call sign used in a transit readout: "HELIOS", "TETHYS", "CERES".
 * First token of the authored name, because "HELIOS PRIME <-> TETHYS JUNCTION TRANSIT" is a
 * paragraph, not an instrument reading. Verified unique across all 24 authored sectors.
 */
export function sectorCallSign(sectorId, name) {
  if (typeof name === 'string' && name.trim()) {
    return name.trim().split(/\s+/)[0].toUpperCase();
  }
  if (typeof sectorId === 'string' && sectorId) {
    return sectorId.replace(/^sector_/, '').split('_')[0].toUpperCase();
  }
  return 'UNCHARTED';
}

/**
 * Everything the readout needs about one sector, sourced from the atlas where possible so the address
 * and the chart agree on names and extents by construction rather than by coincidence.
 */
function sectorFacts(atlas, sectorId) {
  const node = atlas.getNode(sectorId);
  const origin = node && node.hasPosition ? node.globalPos : sectorGlobalOrigin(sectorId);
  const name = node && node.name ? node.name : sectorId;
  const radius = node && Number.isFinite(node.radiusWU) ? node.radiusWU : DEFAULT_SECTOR_RADIUS_WU;
  return {
    sectorId,
    name,
    callSign: sectorCallSign(sectorId, node && node.name),
    globalPos: frozenXZ(origin.x, origin.z),
    radiusWU: radius,
  };
}

/**
 * Candidate sectors ranked by distance, tie-broken lexicographically by id.
 *
 * The tiebreak MUST match `sectorMembershipAtGlobal`'s. If the two disagreed, a player sitting on a
 * bisector could be reported as inside sector A while the transit chord was drawn from sector B —
 * the readout would contradict itself at exactly the position where it matters most.
 */
function rankSectors(px, pz, candidates) {
  const list = Array.isArray(candidates) && candidates.length ? candidates : CORRIDOR_SECTOR_IDS;
  const ranked = [];
  for (const id of list) {
    if (typeof id !== 'string' || !id) continue;
    const o = sectorGlobalOrigin(id);
    ranked.push({ id, d: dist(px, pz, o.x, o.z) });
  }
  ranked.sort((a, b) => (a.d - b.d) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return ranked;
}

// ---------------------------------------------------------------------------------------------
// 1. ADDRESSING
// ---------------------------------------------------------------------------------------------

/**
 * Resolve the player's address anywhere on the lattice. NEVER returns null and never returns an
 * empty label — that is the entire contract. Outside every sector disc the address becomes a
 * position along the chord between the two nearest sector origins:
 *
 *     HELIOS <-> TETHYS TRANSIT - 62%, 340 WU off-axis
 *
 * `progress` runs from `transit.from` to `transit.to`. Those endpoints are ordered by sector id, NOT
 * by proximity. Proximity ordering looks natural for about one second and then betrays you twice:
 * the nearest origin is by definition the one you are under 50% away from, so progress could never
 * exceed 50%, and the label would swap ends mid-crossing as you passed the midpoint. A canonical
 * order makes 62% mean the same thing on the way out and on the way back. Pass
 * `options.orientFromSectorId` (the anchor you departed) when the caller knows the direction of
 * travel and wants the readout to count up toward the destination.
 *
 * @param {{x:number,z:number}|null|undefined} globalPos GLOBAL position (`global_v1`).
 * @param {{atlas?:object, candidates?:ReadonlyArray<string>, orientFromSectorId?:string}} [options]
 * @returns {Readonly<object>} address record; `kind` is 'sector' | 'transit'.
 */
export function resolveDeepSpaceAddress(globalPos, options = {}) {
  const atlas = atlasOf(options);
  const px = hasXZ(globalPos) ? globalPos.x : 0;
  const pz = hasXZ(globalPos) ? globalPos.z : 0;
  const candidates = options && options.candidates;

  const ranked = rankSectors(px, pz, candidates);

  // Take membership from the shipped Voronoi resolver so this module cannot drift from the one the
  // world/residency systems already obey. The ranked list only supplies the SECOND endpoint.
  const membershipId = sectorMembershipAtGlobal({ x: px, z: pz }, candidates)
    || (ranked[0] ? ranked[0].id : null);

  if (!membershipId) {
    // No candidate sectors at all — only reachable with a deliberately empty synthetic set. Still
    // answer with a real, non-empty readout rather than a null the caller would have to special-case.
    return Object.freeze({
      schema: DEEP_SPACE_ADDRESS_SCHEMA,
      kind: ADDRESS_KIND.TRANSIT,
      globalPos: frozenXZ(px, pz),
      sectorId: null,
      sectorName: null,
      callSign: 'UNCHARTED',
      inSector: false,
      distanceFromOriginWU: 0,
      sectorRadiusWU: 0,
      transit: null,
      label: 'UNCHARTED SPACE',
    });
  }

  const home = sectorFacts(atlas, membershipId);
  const distanceFromOrigin = dist(px, pz, home.globalPos.x, home.globalPos.z);
  const inSector = distanceFromOrigin <= home.radiusWU;

  const base = {
    schema: DEEP_SPACE_ADDRESS_SCHEMA,
    globalPos: frozenXZ(px, pz),
    sectorId: home.sectorId,
    sectorName: home.name,
    callSign: home.callSign,
    distanceFromOriginWU: round2(distanceFromOrigin),
    sectorRadiusWU: round2(home.radiusWU),
  };

  if (inSector) {
    return Object.freeze({
      ...base,
      kind: ADDRESS_KIND.SECTOR,
      inSector: true,
      transit: null,
      label: home.name.toUpperCase(),
    });
  }

  // Outside the disc: find the other end of the chord — the nearest candidate that is not home.
  const otherRank = ranked.find((entry) => entry.id !== membershipId) || null;
  if (!otherRank) {
    // A single-sector universe. Honest sparse readout instead of a fabricated chord.
    return Object.freeze({
      ...base,
      kind: ADDRESS_KIND.SECTOR,
      inSector: false,
      transit: null,
      label: `${home.callSign} APPROACH - ${Math.round(distanceFromOrigin)} WU FROM ORIGIN`,
    });
  }

  const other = sectorFacts(atlas, otherRank.id);

  // Canonical endpoint order (see the doc comment), overridable by the caller's known origin.
  const orientFrom = options && options.orientFromSectorId;
  let from = home;
  let to = other;
  if (orientFrom === other.sectorId) {
    from = other;
    to = home;
  } else if (orientFrom !== home.sectorId) {
    const homeFirst = home.sectorId < other.sectorId;
    from = homeFirst ? home : other;
    to = homeFirst ? other : home;
  }

  const dx = to.globalPos.x - from.globalPos.x;
  const dz = to.globalPos.z - from.globalPos.z;
  const chordLength = Math.sqrt(dx * dx + dz * dz);

  if (!(chordLength > 0)) {
    // Two distinct sector ids authored at the identical origin. Degenerate, but do not divide by it.
    return Object.freeze({
      ...base,
      kind: ADDRESS_KIND.SECTOR,
      inSector: false,
      transit: null,
      label: `${home.callSign} APPROACH - ${Math.round(distanceFromOrigin)} WU FROM ORIGIN`,
    });
  }

  const rx = px - from.globalPos.x;
  const rz = pz - from.globalPos.z;
  // Along-chord projection (the dot product D4 promised) and the perpendicular residual, which is
  // the 2D cross product. Both normalized by the chord length once.
  const rawProgress = (rx * dx + rz * dz) / (chordLength * chordLength);
  const cross = (dx * rz) - (dz * rx);
  const offAxis = Math.abs(cross) / chordLength;
  const progress = clamp01(rawProgress);

  const transit = Object.freeze({
    from: Object.freeze({
      sectorId: from.sectorId,
      name: from.name,
      callSign: from.callSign,
      globalPos: from.globalPos,
    }),
    to: Object.freeze({
      sectorId: to.sectorId,
      name: to.name,
      callSign: to.callSign,
      globalPos: to.globalPos,
    }),
    chordLengthWU: round2(chordLength),
    progress,
    /** Unclamped projection: < 0 or > 1 means the player is beyond an endpoint, not between them. */
    rawProgress,
    alongWU: round2(progress * chordLength),
    remainingWU: round2((1 - progress) * chordLength),
    offAxisWU: round2(offAxis),
    /** +1 left of the from→to axis, -1 right of it, 0 exactly on it. Shape, never colour alone. */
    offAxisSign: cross > 0 ? 1 : cross < 0 ? -1 : 0,
  });

  const address = {
    ...base,
    kind: ADDRESS_KIND.TRANSIT,
    inSector: false,
    transit,
  };
  address.label = formatAddressLabel(address);
  return Object.freeze(address);
}

/**
 * Preformatted single-line readout. Both the HUD and the chart consume the SAME string so the two
 * instruments can never disagree about where the player is — which is the failure mode the whole
 * addressing layer exists to remove.
 *
 * ASCII by default because that is the form the packet specifies and it survives any font; pass
 * `{ glyphs: 'unicode' }` for the typographic form the ADR writes (HELIOS ↔ TETHYS TRANSIT — 62%).
 *
 * @param {object} address a record from `resolveDeepSpaceAddress`
 * @param {{glyphs?:'ascii'|'unicode'}} [options]
 * @returns {string} never empty
 */
export function formatAddressLabel(address, options = {}) {
  if (!address) return 'UNCHARTED SPACE';
  const unicode = options && options.glyphs === 'unicode';
  const arrow = unicode ? '↔' : '<->';
  const dash = unicode ? '—' : '-';

  if (address.kind !== ADDRESS_KIND.TRANSIT || !address.transit) {
    if (address.label) return address.label;
    return address.sectorName ? String(address.sectorName).toUpperCase() : 'UNCHARTED SPACE';
  }

  const t = address.transit;
  const pct = Math.round(clamp01(t.progress) * 100);
  const off = Math.round(Number.isFinite(t.offAxisWU) ? t.offAxisWU : 0);
  return `${t.from.callSign} ${arrow} ${t.to.callSign} TRANSIT ${dash} ${pct}%, ${off} WU off-axis`;
}

// ---------------------------------------------------------------------------------------------
// 2. GRATICULE
// ---------------------------------------------------------------------------------------------

/**
 * Tick geometry for the chart graticule. PURE GEOMETRY — this returns global-frame axis values and
 * nothing else. It does not project, does not know the camera, does not know pixels, and must never
 * learn: projection is one job in one place (D3's single global→screen mapping), and a grid that
 * projects itself is a second, silently divergent camera.
 *
 * Spacing steps up in ×4 jumps (1024 → 4096 → 16384 …) rather than by arbitrary factors so every
 * coarser graticule is a strict subset of the finer one. Ticks then stay put as the chart zooms out
 * — they thin, they do not slide, which is the difference between a survey grid and a shimmering
 * mess. X and Z always share one spacing; per-axis spacing is not a graticule.
 *
 * @param {{minX:number,maxX:number,minZ:number,maxZ:number}} bounds GLOBAL-frame chart extent.
 * @param {{spacingWU?:number, majorEveryWU?:number, maxTicksPerAxis?:number}} [options]
 * @returns {Readonly<{spacingWU:number, majorEveryWU:number, x:ReadonlyArray, z:ReadonlyArray, decimated:boolean}>}
 */
export function graticuleTicks(bounds, options = {}) {
  const baseSpacing = Number.isFinite(options.spacingWU) && options.spacingWU > 0
    ? options.spacingWU
    : GRATICULE_TICK_WU;
  const majorEvery = Number.isFinite(options.majorEveryWU) && options.majorEveryWU > 0
    ? options.majorEveryWU
    : GRATICULE_MAJOR_WU;
  const maxTicks = Number.isFinite(options.maxTicksPerAxis) && options.maxTicksPerAxis >= 2
    ? Math.floor(options.maxTicksPerAxis)
    : 64;

  const empty = Object.freeze({
    spacingWU: baseSpacing,
    majorEveryWU: majorEvery,
    x: Object.freeze([]),
    z: Object.freeze([]),
    decimated: false,
  });
  if (!bounds) return empty;
  const { minX, maxX, minZ, maxZ } = bounds;
  if (![minX, maxX, minZ, maxZ].every((v) => Number.isFinite(v))) return empty;

  const x0 = Math.min(minX, maxX);
  const x1 = Math.max(minX, maxX);
  const z0 = Math.min(minZ, maxZ);
  const z1 = Math.max(minZ, maxZ);

  // Widen the spacing until BOTH axes fit the budget. Guarded by an iteration cap so a pathological
  // bounds rect thins the grid instead of hanging the frame.
  let spacing = baseSpacing;
  let decimated = false;
  for (let guard = 0; guard < 64; guard++) {
    const countX = Math.floor(x1 / spacing) - Math.ceil(x0 / spacing) + 1;
    const countZ = Math.floor(z1 / spacing) - Math.ceil(z0 / spacing) + 1;
    if (Math.max(countX, countZ) <= maxTicks) break;
    spacing *= 4;
    decimated = true;
  }

  const axis = (lo, hi) => {
    const out = [];
    const first = Math.ceil(lo / spacing);
    const last = Math.floor(hi / spacing);
    for (let i = first; i <= last; i++) {
      const value = i * spacing;
      // Tolerant modulo: exact for the authored power-of-two lattice, safe for custom spacings.
      const rem = Math.abs(value % majorEvery);
      const major = rem < 1e-6 || Math.abs(rem - majorEvery) < 1e-6;
      out.push(Object.freeze({ value, major }));
    }
    return Object.freeze(out);
  };

  return Object.freeze({
    spacingWU: spacing,
    majorEveryWU: majorEvery,
    x: axis(x0, x1),
    z: axis(z0, z1),
    decimated,
  });
}

// ---------------------------------------------------------------------------------------------
// 3. RECOVERY VERBS
// ---------------------------------------------------------------------------------------------

/**
 * Shape one atlas node as a target the existing `resolveCourseTarget` (src/ui/galaxyMap.js) accepts.
 *
 * That resolver reads FLAT `target.x` / `target.z` — global, per D2.1 — not a nested `globalPos`, so
 * the flattening happens here rather than at three call sites that would each get it slightly wrong.
 * A `kind: 'sector'` target is resolved by that function as an inter-sector ROUTE and its x/z are
 * ignored; they are still carried so distance readouts and the chart have one source.
 */
function courseTargetFor(node) {
  const target = {
    id: node.id,
    kind: node.kind,
    name: node.name,
    sectorId: node.sectorId,
    x: node.globalPos.x,
    z: node.globalPos.z,
  };
  // A gate's destination is what makes it a gate. `linkSectorId` is the atlas field; the resolver
  // reads `targetSectorId`, and without the mapping a gate course silently degrades to a plain fix.
  if (node.kind === 'gate' && node.linkSectorId) target.targetSectorId = node.linkSectorId;
  if (node.kind === 'station') target.stationId = node.id;
  if (Number.isFinite(node.radiusWU)) target.radius = node.radiusWU;
  return Object.freeze(target);
}

function makeVerb(verb, node, px, pz, extra = {}) {
  if (!node) {
    return Object.freeze({
      verb,
      available: false,
      reason: extra.reason || 'no candidate',
      nodeId: null,
      name: null,
      kind: null,
      sectorId: null,
      globalPos: null,
      distanceWU: null,
      courseTarget: null,
    });
  }
  return Object.freeze({
    verb,
    available: true,
    reason: extra.reason || null,
    nodeId: node.id,
    name: node.name,
    kind: node.kind,
    sectorId: node.sectorId,
    globalPos: node.globalPos,
    distanceWU: round2(dist(px, pz, node.globalPos.x, node.globalPos.z)),
    courseTarget: courseTargetFor(node),
  });
}

function anchorNodes(atlas, kinds) {
  const allow = new Set(Array.isArray(kinds) && kinds.length ? kinds : RECOVERY_ANCHOR_KINDS);
  return atlas.nodes.filter((node) => node.hasPosition && allow.has(node.kind));
}

/** Nearest node satisfying `accept`, ties broken by id (atlas.nodes is already sorted by id). */
function nearestWhere(nodes, px, pz, accept) {
  let best = null;
  let bestD = Infinity;
  for (const node of nodes) {
    if (accept && !accept(node)) continue;
    const d = dist(px, pz, node.globalPos.x, node.globalPos.z);
    if (d < bestD) {
      bestD = d;
      best = node;
    }
  }
  return best;
}

function normalizeDir(vec) {
  if (!hasXZ(vec)) return null;
  const len = Math.sqrt(vec.x * vec.x + vec.z * vec.z);
  if (!(len > 1e-9)) return null;
  return { x: vec.x / len, z: vec.z / len };
}

/**
 * Resolve the three recovery verbs to concrete atlas targets.
 *
 * TARGET RESOLUTION ONLY. ADR D6 is binding: the route follower and the local autopilot own steering,
 * and "if any packet proposes new steering math, reject it." Every verb answers *where*, and the
 * caller hands `courseTarget` to `resolveCourseTarget` → `ui:setCourse` exactly as the map already
 * does for a clicked node.
 *
 * Forward direction, in falling order of trustworthiness: explicit `heading`, then `velocity`, then
 * away-from-`lastAnchorId` (if you departed it, you are going the other way), then the transit chord.
 * When none of those exist the direction is unknown and `continue` reports itself unavailable rather
 * than guessing — an unavailable verb is honest, a wrong one strands the player further out.
 *
 * @param {{x:number,z:number}} globalPos GLOBAL position.
 * @param {{atlas?:object, heading?:{x:number,z:number}, velocity?:{x:number,z:number},
 *          lastAnchorId?:string, address?:object, anchorKinds?:ReadonlyArray<string>,
 *          minDistanceWU?:number}} [options]
 * @returns {Readonly<{schema:string, order:ReadonlyArray<string>, continue:object, divert:object, return:object}>}
 */
export function resolveRecoveryVerbs(globalPos, options = {}) {
  const atlas = atlasOf(options);
  const px = hasXZ(globalPos) ? globalPos.x : 0;
  const pz = hasXZ(globalPos) ? globalPos.z : 0;
  const minDistance = Number.isFinite(options.minDistanceWU) ? options.minDistanceWU : 1;
  const anchors = anchorNodes(atlas, options.anchorKinds);

  const address = options.address && options.address.schema === DEEP_SPACE_ADDRESS_SCHEMA
    ? options.address
    : resolveDeepSpaceAddress({ x: px, z: pz }, options);

  const lastAnchor = typeof options.lastAnchorId === 'string' && options.lastAnchorId
    ? atlas.getNode(options.lastAnchorId)
    : null;
  const lastAnchorPlaced = lastAnchor && lastAnchor.hasPosition ? lastAnchor : null;

  // --- forward direction -----------------------------------------------------------------------
  let dir = normalizeDir(options.heading) || normalizeDir(options.velocity);
  let dirSource = dir ? (normalizeDir(options.heading) ? 'heading' : 'velocity') : null;
  if (!dir && lastAnchorPlaced) {
    dir = normalizeDir({
      x: px - lastAnchorPlaced.globalPos.x,
      z: pz - lastAnchorPlaced.globalPos.z,
    });
    if (dir) dirSource = 'departed-anchor';
  }
  if (!dir && address.kind === ADDRESS_KIND.TRANSIT && address.transit) {
    dir = normalizeDir({
      x: address.transit.to.globalPos.x - address.transit.from.globalPos.x,
      z: address.transit.to.globalPos.z - address.transit.from.globalPos.z,
    });
    if (dir) dirSource = 'transit-chord';
  }

  const notLastAnchor = (node) => !lastAnchorPlaced || node.id !== lastAnchorPlaced.id;
  const farEnough = (node) => dist(px, pz, node.globalPos.x, node.globalPos.z) >= minDistance;

  // --- continue: nearest anchor ahead of you ----------------------------------------------------
  let continueNode = null;
  if (dir) {
    continueNode = nearestWhere(anchors, px, pz, (node) => {
      if (!farEnough(node) || !notLastAnchor(node)) return false;
      const ahead = (node.globalPos.x - px) * dir.x + (node.globalPos.z - pz) * dir.z;
      return ahead > 0;
    });
  }
  const continueVerb = makeVerb('continue', continueNode, px, pz, {
    reason: continueNode
      ? `forward anchor (${dirSource})`
      : (dir ? 'no anchor ahead' : 'heading unknown'),
  });

  // --- divert: nearest station, ahead or behind -------------------------------------------------
  const stationNode = nearestWhere(
    anchors,
    px,
    pz,
    (node) => node.kind === 'station' && farEnough(node),
  );
  const divertVerb = makeVerb('divert', stationNode, px, pz, {
    reason: stationNode ? 'nearest station' : 'no charted station',
  });

  // --- return: the anchor you left, else the sector you are addressed to ------------------------
  let returnNode = lastAnchorPlaced;
  let returnReason = 'last anchor';
  if (!returnNode) {
    // No remembered anchor. The Voronoi cell always exists, so its sector node is the honest
    // fallback: "go back to the middle of the region you are in" is a real, always-valid recovery.
    returnNode = address.sectorId ? atlas.getNode(address.sectorId) : null;
    if (returnNode && !returnNode.hasPosition) returnNode = null;
    returnReason = returnNode ? 'fallback: addressed sector' : 'no known anchor';
  }
  const returnVerb = makeVerb('return', returnNode, px, pz, { reason: returnReason });

  return Object.freeze({
    schema: DEEP_SPACE_ADDRESS_SCHEMA,
    order: RECOVERY_VERBS,
    headingSource: dirSource,
    continue: continueVerb,
    divert: divertVerb,
    return: returnVerb,
  });
}

/**
 * One call for a caller that needs all three layers — the HUD readout, the chart graticule and the
 * recovery targets — from one position, guaranteeing they describe the same instant.
 *
 * @param {{x:number,z:number}} globalPos
 * @param {object} [options] merged options; `bounds` selects the graticule extent (optional).
 */
export function resolveDeepSpaceReadout(globalPos, options = {}) {
  const address = resolveDeepSpaceAddress(globalPos, options);
  return Object.freeze({
    schema: DEEP_SPACE_ADDRESS_SCHEMA,
    address,
    recovery: resolveRecoveryVerbs(globalPos, { ...options, address }),
    graticule: options && options.bounds ? graticuleTicks(options.bounds, options) : null,
  });
}
