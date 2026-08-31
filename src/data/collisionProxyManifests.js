// Collision proxy manifests — data-driven compound planar collision proxies (PQ-008 / SF-08 → F18).
//
// Today every station/wreck body is a single ColliderDesc.ball unrelated to the visible mesh, so
// ships fly through station arms and docking means entering a forgiving radius. A manifest maps a
// station/wreck visual identity to a bounded set of 2D primitives (circle / capsule / oriented box /
// chain-of-circles) that the physics authority registers ONCE as a compound static collider set at
// entity creation — never per-frame mesh rebuilds. Chain-of-circles approximates long thin slabs
// (station rings) while leaving REAL navigable gaps; that concession is explicitly sanctioned by the
// corrected build plan (STEP 7).
//
// Sim-only: planar XZ, no Three.js, no GLB parsing, no ambient randomness. All geometry is authored
// in normalized station-local units (1.0 = the entity's reference radius, `dockRadius` for stations)
// and scaled at registration. The authored `footprint` constants are the silhouette anchors the
// contract test measures against (a coarse Hausdorff-style bound), so proxy/visual alignment is
// provable without touching renderer-lease paths.
//
// Flag contract (binding): proxy primitives are collision-only. They are never renderable, never
// independently targetable, and never radar-visible. The station entity itself keeps its existing
// render/target/radar behavior.
//
// Docking: manifests may carry a `docking` block — an exterior corridor volume with speed/heading
// gates feeding a capture volume that applies a bounded PD capture assist toward the berth. The
// dockingCorridor system consumes it through the physics-command membrane (queuePhysicsImpulse);
// it never teleports, never writes velocity directly, and never seizes control (player input always
// blends). Stations WITHOUT a manifest keep the legacy center-radius dock behavior untouched.

export const COLLISION_PROXY_SCHEMA_VERSION = 1;

/** Binding flag contract for every proxy primitive (STEP 7). */
export const COLLISION_PROXY_FLAGS = Object.freeze({
  collides: true,
  renderable: false,
  targetable: false,
  radarVisible: false,
});

/** Bounded compound size: a manifest may never exceed this many expanded primitives. */
export const MAX_PROXY_PRIMITIVES = 32;

/** Primitive kinds the physics authority knows how to register. */
export const COLLISION_PROXY_KINDS = Object.freeze(['circle', 'capsule', 'obb', 'chain']);

const DEG = Math.PI / 180;

// -----------------------------------------------------------------------------------------------
// Helios trade hub — the authored proof station.
//
// Visual anchors (src/render/visualFactory.js buildStation, R = dockRadius = 90 wu for size L):
//   core cylinder       radius ~0.46R
//   4 docking spars     boxes at cardinal bearings, radial span ~0.20R–0.90R, half-width ~0.08R
//   flat ring (ring1)   torus at 0.80R, tube half-width ~0.06R
//   tilted ring (ring2) torus at 0.62R tilted 0.6 rad (planar projection ellipse ~0.62R × 0.51R),
//                       tube half-width ~0.05R
// The tilted ring crosses the gameplay plane along one diameter; it is proxied as a projected
// ellipse chain, same sanctioned slab concession as the flat ring.
//
// The docking corridor faces the sector-origin approach. Stations sit on the procedural ring around
// the sector origin, so world.js stamps `data.corridorBearingDeg` (station-local degrees, snapped
// to the nearest inter-spar lane) at spawn; the manifest default below is only a fallback for
// fixtures that declare the proxy without a stamped bearing.
// -----------------------------------------------------------------------------------------------

const HELIOS_SPAR_ANGLES = Object.freeze([0, 90, 180, 270]);
// Inter-spar lanes: the only bearings where a corridor can reach the core deck without crossing a
// spar. The effective corridor bearing is always snapped to one of these.
const HELIOS_CORRIDOR_SNAP_ANGLES = Object.freeze([45, 135, 225, 315]);

function sparCapsules() {
  return HELIOS_SPAR_ANGLES.map((deg) => {
    const a = deg * DEG;
    return {
      kind: 'capsule',
      id: `spar-${deg}`,
      ax: Math.cos(a) * 0.20,
      az: Math.sin(a) * 0.20,
      bx: Math.cos(a) * 0.88,
      bz: Math.sin(a) * 0.88,
      r: 0.075,
    };
  });
}

export const COLLISION_PROXY_MANIFESTS = Object.freeze({
  helios_trade_hub: Object.freeze({
    schemaVersion: COLLISION_PROXY_SCHEMA_VERSION,
    id: 'helios_trade_hub',
    // Station ids this manifest may be declared for (world wiring + fixtures).
    stationIds: Object.freeze(['station_helios']),
    flags: COLLISION_PROXY_FLAGS,
    // Normalized coordinates scale by entity.data.dockRadius (fall back to entity.radius).
    referenceRadius: 'dockRadius',
    // Authored silhouette anchors for the Hausdorff-style contract test (normalized units).
    footprint: Object.freeze({
      coreRadius: 0.46,
      spar: Object.freeze({ inner: 0.20, outer: 0.88, halfWidth: 0.08, angles: HELIOS_SPAR_ANGLES }),
      ring1: Object.freeze({ radius: 0.80, tubeHalfWidth: 0.06 }),
      ring2: Object.freeze({ radius: 0.62, minorRadius: 0.51, tubeHalfWidth: 0.05 }),
    }),
    // Declared coarse silhouette bound (normalized). The contract test MEASURES the real bound
    // (footprint↔proxy, declared gaps excluded) and asserts it never exceeds this value.
    silhouetteBound: 0.24,
    primitives: Object.freeze([
      Object.freeze({ kind: 'circle', id: 'core', x: 0, z: 0, r: 0.46 }),
      ...sparCapsules().map((p) => Object.freeze(p)),
      // Flat ring as chain-of-circles. The gap sector sits at the EFFECTIVE corridor bearing
      // (resolved at expansion), leaving one deliberate navigable opening into the core deck.
      Object.freeze({
        kind: 'chain', id: 'ring1', radius: 0.80, circleR: 0.055, count: 16,
        gap: Object.freeze({ at: 'corridor', halfWidthDeg: 25 }),
      }),
      // Tilted ring projected onto the plane (ellipse), same slab concession. Its corridor gap is
      // wider: the tilted torus rises out of the gameplay plane away from its crossing diameter,
      // so the visual mass near the corridor bearing is genuinely off-plane.
      Object.freeze({
        kind: 'chain', id: 'ring2', radius: 0.62, minorRadius: 0.51, circleR: 0.05, count: 8,
        gap: Object.freeze({ at: 'corridor', halfWidthDeg: 60 }),
      }),
    ]),
    docking: Object.freeze({
      // Fallback only — world.js stamps data.corridorBearingDeg for live spawns.
      corridorBearingDeg: 135,
      corridorSnapAnglesDeg: HELIOS_CORRIDOR_SNAP_ANGLES,
      corridor: Object.freeze({
        halfWidthDeg: 22,          // corridor sector half-angle at the mouth
        mouthRadius: 1.35,         // outer corridor gate (normalized)
        speedGate: 55,             // wu/s max entry speed
        headingGateDeg: 42,        // inbound heading tolerance vs corridor axis
      }),
      capture: Object.freeze({
        // Lane from the berth outward along the corridor axis; a ship inside the lane, slow
        // enough, and roughly inbound (or nearly stationary) gets the bounded assist.
        outerRadius: 1.20,         // normalized; covers the autopilot arrival disc (≤ 1.0)
        halfWidth: 0.42,           // normalized lateral half-width of the capture lane
        speedGate: 26,             // wu/s
      }),
      berth: Object.freeze({
        // Open deck between ring2 and ring1 on the corridor lane. A ship of radius ~0.16R (14 wu
        // at R=90) berthed here clears the core surface (0.46R) and every proxy primitive.
        radius: 0.72,              // normalized station-local berth distance (open deck)
        // Live PQ-024 pair 2 reached a solver-resting 18.878 WU from this point before the nearby
        // compound proxy expelled it. Keep two WU of contact tolerance so a physically settled
        // radius-14 player can receive the public dock prompt before contact response wins.
        dockRadius: 20,            // wu: dock:range requires berth proximity within this
        speedGate: 12,             // wu/s at the berth
      }),
      assist: Object.freeze({
        kp: 0.9,                   // PD proportional gain (1/s²)
        kd: 2.2,                   // PD derivative gain (1/s) — overdamped, no ricochet
        maxAccel: 26,              // wu/s² hard bound — a fraction of player thrust authority
        inputBlend: 0.75,          // assist fades by inputMag*inputBlend; player always blends
      }),
    }),
  }),
  // PQ-133.04 — the Foundry visuals use these exact normalized boxes. Keeping one primitive per
  // entity makes the live sweep normal, Rapier collider, and visible slab share a transform.
  ricochet_foundry_wall: Object.freeze({
    schemaVersion: COLLISION_PROXY_SCHEMA_VERSION,
    id: 'ricochet_foundry_wall',
    flags: COLLISION_PROXY_FLAGS,
    referenceRadius: 'radius',
    boundsFromFoundrySurface: true,
    primitives: Object.freeze([
      Object.freeze({ kind: 'obb', id: 'wall', x: 0, z: 0, hx: 1, hz: 1, angleDeg: 0 }),
    ]),
  }),
  ricochet_foundry_plate: Object.freeze({
    schemaVersion: COLLISION_PROXY_SCHEMA_VERSION,
    id: 'ricochet_foundry_plate',
    flags: COLLISION_PROXY_FLAGS,
    referenceRadius: 'radius',
    boundsFromFoundrySurface: true,
    primitives: Object.freeze([
      Object.freeze({ kind: 'obb', id: 'plate', x: 0, z: 0, hx: 1, hz: 1, angleDeg: 0 }),
    ]),
  }),
  ricochet_foundry_shutter: Object.freeze({
    schemaVersion: COLLISION_PROXY_SCHEMA_VERSION,
    id: 'ricochet_foundry_shutter',
    flags: COLLISION_PROXY_FLAGS,
    referenceRadius: 'radius',
    boundsFromFoundrySurface: true,
    primitives: Object.freeze([
      Object.freeze({ kind: 'obb', id: 'shutter', x: 0, z: 0, hx: 1, hz: 1, angleDeg: 0 }),
    ]),
  }),
  ricochet_foundry_furnace: Object.freeze({
    schemaVersion: COLLISION_PROXY_SCHEMA_VERSION,
    id: 'ricochet_foundry_furnace',
    flags: COLLISION_PROXY_FLAGS,
    referenceRadius: 'radius',
    boundsFromFoundrySurface: true,
    primitives: Object.freeze([
      Object.freeze({ kind: 'obb', id: 'furnace', x: 0, z: 0, hx: 1, hz: 1, angleDeg: 0 }),
    ]),
  }),
});

// -----------------------------------------------------------------------------------------------
// Resolution helpers
// -----------------------------------------------------------------------------------------------

/** Manifest declared on an entity via data.collisionProxy, else null. Manifests activate ONLY for
 * entities that explicitly declare them — the 47a golden scenario declares none. */
export function resolveCollisionProxyManifest(entity) {
  const data = entity && entity.data;
  const id = data && typeof data.collisionProxy === 'string' ? data.collisionProxy : null;
  return id && COLLISION_PROXY_MANIFESTS[id] || null;
}

/** Station id → manifest id, for world spawn wiring. */
export function collisionProxyIdForStation(stationId) {
  for (const manifest of Object.values(COLLISION_PROXY_MANIFESTS)) {
    if (manifest.stationIds && manifest.stationIds.includes(stationId)) return manifest.id;
  }
  return null;
}

/** Normalized → wu scale for an entity. */
export function proxyScaleFor(entity, manifest) {
  const data = entity && entity.data || {};
  const reference = manifest.referenceRadius === 'dockRadius' ? data.dockRadius : null;
  return positive(reference, positive(entity && entity.radius, 1));
}

/** Exact local half-extents for an OBB proxy. Most manifests use one normalized scalar; Foundry
 * pieces deliberately vary aspect ratio per entity, so their authored surface record is the one
 * source of truth for both visible geometry and every Rapier/observer collider. */
export function proxyObbHalfExtents(entity, manifest, primitive, scale = proxyScaleFor(entity, manifest)) {
  const surface = manifest && manifest.boundsFromFoundrySurface === true
    ? entity && entity.data && entity.data.foundrySurface
    : null;
  if (surface && Number.isFinite(surface.halfLength) && surface.halfLength > 0
      && Number.isFinite(surface.halfWidth) && surface.halfWidth > 0) {
    return {
      hx: surface.halfLength,
      hy: Number.isFinite(surface.height) && surface.height > 0 ? surface.height * 0.5 : surface.halfWidth,
      hz: surface.halfWidth,
    };
  }
  return {
    hx: positive(primitive && primitive.hx, 0.01) * scale,
    hy: positive(primitive && primitive.hx, 0.01) * scale,
    hz: positive(primitive && primitive.hz, 0.01) * scale,
  };
}

/** Effective corridor bearing in STATION-LOCAL degrees: entity stamp wins, snapped to the nearest
 * declared inter-spar lane so the corridor can never dead-end into a spar. */
export function effectiveCorridorBearingDeg(manifest, entity) {
  const docking = manifest && manifest.docking;
  if (!docking) return 0;
  const stamped = entity && entity.data && Number.isFinite(entity.data.corridorBearingDeg)
    ? entity.data.corridorBearingDeg
    : docking.corridorBearingDeg;
  const snaps = docking.corridorSnapAnglesDeg;
  if (!Array.isArray(snaps) || !snaps.length) return wrapDeg(stamped);
  let best = snaps[0];
  let bestDist = Infinity;
  for (const candidate of snaps) {
    const d = Math.abs(wrapDeg180(stamped - candidate));
    if (d < bestDist) { bestDist = d; best = candidate; }
  }
  return wrapDeg(best);
}

/** Expand a manifest to a flat, bounded primitive list in normalized station-local units. Chains
 * become circles; the ring gap sector is cut around the effective corridor bearing. */
export function expandProxyPrimitives(manifest, options = {}) {
  if (!manifest) return [];
  const corridorDeg = Number.isFinite(options.corridorBearingDeg)
    ? options.corridorBearingDeg
    : effectiveCorridorBearingDeg(manifest, options.entity || null);
  const out = [];
  for (const primitive of manifest.primitives || []) {
    if (out.length >= MAX_PROXY_PRIMITIVES) break;
    if (primitive.kind === 'chain') {
      expandChain(primitive, corridorDeg, out);
    } else if (primitive.kind === 'circle' || primitive.kind === 'capsule' || primitive.kind === 'obb') {
      out.push({ ...primitive });
    }
  }
  return out;
}

/** World-space primitives for an entity (registration + debug publication). Entity rotation is
 * applied to local offsets; primitive-local orientations become world orientations. */
export function proxyWorldPrimitives(entity, manifest) {
  const scale = proxyScaleFor(entity, manifest);
  const corridorDeg = effectiveCorridorBearingDeg(manifest, entity);
  const local = expandProxyPrimitives(manifest, { corridorBearingDeg: corridorDeg });
  const rot = finite(entity && entity.rot);
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const px = finite(entity && entity.pos && entity.pos.x);
  const pz = finite(entity && entity.pos && entity.pos.z);
  return local.map((primitive) => {
    if (primitive.kind === 'circle') {
      const x = primitive.x * scale;
      const z = primitive.z * scale;
      return {
        kind: 'circle',
        id: primitive.id || null,
        x: px + c * x - s * z,
        z: pz + s * x + c * z,
        r: primitive.r * scale,
      };
    }
    if (primitive.kind === 'capsule') {
      const ax = primitive.ax * scale;
      const az = primitive.az * scale;
      const bx = primitive.bx * scale;
      const bz = primitive.bz * scale;
      return {
        kind: 'capsule',
        id: primitive.id || null,
        ax: px + c * ax - s * az,
        az: pz + s * ax + c * az,
        bx: px + c * bx - s * bz,
        bz: pz + s * bx + c * bz,
        r: primitive.r * scale,
      };
    }
    // obb
    const x = primitive.x * scale;
    const z = primitive.z * scale;
    const halfExtents = proxyObbHalfExtents(entity, manifest, primitive, scale);
    return {
      kind: 'obb',
      id: primitive.id || null,
      x: px + c * x - s * z,
      z: pz + s * x + c * z,
      hx: halfExtents.hx,
      hz: halfExtents.hz,
      rot: rot + finite(primitive.angleDeg) * DEG,
    };
  });
}

/** World-space berth point for a manifest station. */
export function resolveBerthWorld(entity, manifest) {
  const docking = manifest && manifest.docking;
  if (!docking) return null;
  const scale = proxyScaleFor(entity, manifest);
  const bearingDeg = effectiveCorridorBearingDeg(manifest, entity);
  const rot = finite(entity && entity.rot);
  const a = rot + bearingDeg * DEG;
  const r = docking.berth.radius * scale;
  return {
    x: finite(entity && entity.pos && entity.pos.x) + Math.cos(a) * r,
    z: finite(entity && entity.pos && entity.pos.z) + Math.sin(a) * r,
  };
}

/** World-space corridor axis (outbound direction from the station). */
export function resolveCorridorAxisWorld(entity, manifest) {
  const bearingDeg = effectiveCorridorBearingDeg(manifest, entity);
  const a = finite(entity && entity.rot) + bearingDeg * DEG;
  return { x: Math.cos(a), z: Math.sin(a), bearingRad: a };
}

/**
 * Corridor/capture classification for a ship near a manifest station. Pure math; no state.
 * Returns { phase, distToBerth, speed, headingOk, inCorridor, inCapture }.
 * Phases: 'approach' → 'corridor' (inside mouth sector, gates pass) → 'capture' (inside the
 * capture lane, speed under gate) → 'berthed' (at the berth, slow enough to dock).
 */
export function corridorStateFor(manifest, entity, pos, vel) {
  const docking = manifest && manifest.docking;
  if (!docking || !pos) return null;
  const scale = proxyScaleFor(entity, manifest);
  const px = finite(entity && entity.pos && entity.pos.x);
  const pz = finite(entity && entity.pos && entity.pos.z);
  const dx = finite(pos.x) - px;
  const dz = finite(pos.z) - pz;
  const distCenter = Math.hypot(dx, dz);
  const axis = resolveCorridorAxisWorld(entity, manifest);
  const berth = resolveBerthWorld(entity, manifest);
  const distToBerth = Math.hypot(finite(pos.x) - berth.x, finite(pos.z) - berth.z);
  const vx = finite(vel && vel.x);
  const vz = finite(vel && vel.z);
  const speed = Math.hypot(vx, vz);

  // Ship position in the corridor frame: along = outbound distance on the corridor axis,
  // lateral = signed cross-track distance from the axis.
  const along = dx * axis.x + dz * axis.z;
  const lateral = Math.abs(dx * -axis.z + dz * axis.x);

  const mouthRadius = docking.corridor.mouthRadius * scale;
  const corridorHalfWidth = Math.max(
    docking.capture.halfWidth * scale,
    Math.tan(docking.corridor.halfWidthDeg * DEG) * Math.max(along, 1),
  );
  const captureOuter = docking.capture.outerRadius * scale;
  const captureHalfWidth = docking.capture.halfWidth * scale;
  const berthRadius = docking.berth.radius * scale;

  const inMouth = distCenter <= mouthRadius;
  const inCorridorLane = along > 0 && along <= mouthRadius && lateral <= corridorHalfWidth;
  const inCorridor = inMouth && inCorridorLane;

  // Capture lane: capsule along the corridor axis from the berth outward to the outer gate. Ships
  // hugging the berth (any bearing) also count — the deck inside the ring gap is part of the lane.
  const inLane = along >= berthRadius * 0.9 && along <= captureOuter && lateral <= captureHalfWidth;
  const nearBerth = distToBerth <= Math.max(docking.berth.dockRadius * 2.5, captureHalfWidth);
  const inCapture = inLane || nearBerth;

  // Heading gate: velocity must point roughly INBOUND (opposite the outbound axis). Nearly
  // stationary ships are always heading-ok — a stopped ship has no heading to be wrong.
  const inboundSpeed = -(vx * axis.x + vz * axis.z);
  let headingOk = true;
  if (speed >= 8) {
    const heading = Math.atan2(vz, vx);
    const inbound = Math.atan2(-axis.z, -axis.x);
    headingOk = Math.abs(wrapDeg180((heading - inbound) / DEG)) <= docking.corridor.headingGateDeg;
    // Ships moving tangentially at the lane edge are not penalized for slight outward drift:
    // headingOk requires the inbound component to dominate any outbound component.
    headingOk = headingOk || inboundSpeed > Math.max(0, speed * 0.2);
  }

  const berthed = distToBerth <= docking.berth.dockRadius && speed <= docking.berth.speedGate;
  const captureReady = inCapture && speed <= docking.capture.speedGate && headingOk;
  const corridorReady = inCorridor && speed <= docking.corridor.speedGate && headingOk;

  let phase = 'approach';
  if (berthed) phase = 'berthed';
  else if (captureReady) phase = 'capture';
  else if (corridorReady) phase = 'corridor';

  return {
    phase,
    distToBerth,
    distCenter,
    speed,
    headingOk,
    inboundSpeed,
    inCorridor,
    inCapture,
    berthed,
    berth,
    axis,
    scale,
  };
}

/**
 * Bounded PD capture assist. Returns a world-space acceleration (wu/s²) or null when no assist is
 * owed. Contract (STEP 7): never exceeds maxAccel; acceleration → 0 at the berth; no assist outside
 * the capture volume; player input always blends (assist fades by inputMag*inputBlend, and the
 * impulse is ADDITIVE on the physics membrane — player thrust is never overwritten).
 */
export function computeCaptureAssist(manifest, entity, pos, vel, inputMag = 0) {
  const docking = manifest && manifest.docking;
  if (!docking) return null;
  const state = corridorStateFor(manifest, entity, pos, vel);
  if (!state) return null;
  const capture = docking.capture;
  if (!state.inCapture || state.speed > capture.speedGate || !state.headingOk) return null;
  const tune = docking.assist;
  const ex = state.berth.x - finite(pos.x);
  const ez = state.berth.z - finite(pos.z);
  let ax = tune.kp * ex - tune.kd * finite(vel && vel.x);
  let az = tune.kp * ez - tune.kd * finite(vel && vel.z);
  const mag = Math.hypot(ax, az);
  if (mag > tune.maxAccel) {
    const k = tune.maxAccel / mag;
    ax *= k;
    az *= k;
  }
  const blend = 1 - clamp(finite(inputMag), 0, 1) * tune.inputBlend;
  ax *= blend;
  az *= blend;
  if (!Number.isFinite(ax) || !Number.isFinite(az)) return null;
  return { x: ax, z: az, phase: state.phase, distToBerth: state.distToBerth };
}

/**
 * Coarse Hausdorff-style silhouette bound: the maximum distance between the authored footprint and
 * the expanded proxy set, both directions, EXCLUDING declared navigable gap sectors (the ring
 * corridor gap) — those are bounded separately by the gap navigability assertion. Deterministic;
 * no GLB parsing; pure authored-constants comparison.
 */
export function measureSilhouetteBound(manifest, options = {}) {
  const corridorDeg = Number.isFinite(options.corridorBearingDeg)
    ? options.corridorBearingDeg
    : effectiveCorridorBearingDeg(manifest, options.entity || null);
  const proxies = expandProxyPrimitives(manifest, { corridorBearingDeg: corridorDeg });
  const footprint = manifest.footprint;
  if (!footprint) return { bound: 0, proxyToFootprint: 0, footprintToProxy: 0 };
  const footprintSamples = sampleFootprint(manifest, corridorDeg);
  let footprintToProxy = 0;
  for (const p of footprintSamples) {
    const d = distanceToProxySet(p, proxies);
    if (d > footprintToProxy) footprintToProxy = d;
  }
  let proxyToFootprint = 0;
  for (const p of sampleProxyBoundaries(proxies)) {
    const d = distanceToFootprint(p, footprint);
    if (d > proxyToFootprint) proxyToFootprint = d;
  }
  return {
    bound: Math.max(footprintToProxy, proxyToFootprint),
    proxyToFootprint,
    footprintToProxy,
  };
}

/** Navigable clear width (normalized) of the corridor gap for the effective bearing: the tightest
 * proxy-surface clearance along the whole corridor lane from the core edge out past ring1. */
export function measureCorridorGapWidth(manifest, options = {}) {
  const corridorDeg = Number.isFinite(options.corridorBearingDeg)
    ? options.corridorBearingDeg
    : effectiveCorridorBearingDeg(manifest, options.entity || null);
  const proxies = expandProxyPrimitives(manifest, { corridorBearingDeg: corridorDeg });
  const ring = (manifest.primitives || []).find((p) => p.kind === 'chain' && p.gap);
  if (!ring) return { width: Infinity, bearing: corridorDeg };
  const a = corridorDeg * DEG;
  const ux = Math.cos(a);
  const uz = Math.sin(a);
  // The flown path runs from outside down to the berth; clearance is only meaningful over that
  // span (a ship never flies the corridor lane between the berth and the core).
  const berthRadius = manifest.docking && manifest.docking.berth ? manifest.docking.berth.radius : 0.7;
  let minClear = Infinity;
  for (let along = berthRadius; along <= ring.radius + ring.circleR * 2 + 0.001; along += 0.005) {
    const cx = ux * along;
    const cz = uz * along;
    let clearance = Infinity;
    for (const primitive of proxies) {
      const d = distanceToProxy({ x: cx, z: cz }, primitive);
      if (d < clearance) clearance = d;
    }
    if (clearance < minClear) minClear = clearance;
  }
  return { width: minClear === Infinity ? Infinity : minClear * 2, bearing: corridorDeg };
}

// -----------------------------------------------------------------------------------------------
// Validation (contract test surface)
// -----------------------------------------------------------------------------------------------

export function validateCollisionProxyManifest(manifest) {
  const issues = [];
  if (!manifest || typeof manifest !== 'object') {
      issues.push('manifest must be an object');
      return { ok: false, issues };
  }
  if (manifest.schemaVersion !== COLLISION_PROXY_SCHEMA_VERSION) issues.push('schemaVersion mismatch');
  if (!manifest.id || typeof manifest.id !== 'string') issues.push('id required');
  const flags = manifest.flags || {};
  if (flags.collides !== true) issues.push('flags.collides must be true');
  if (flags.renderable !== false) issues.push('flags.renderable must be false');
  if (flags.targetable !== false) issues.push('flags.targetable must be false');
  if (flags.radarVisible !== false) issues.push('flags.radarVisible must be false');
  const primitives = manifest.primitives || [];
  if (!Array.isArray(primitives) || !primitives.length) issues.push('primitives required');
  const expanded = expandProxyPrimitives(manifest);
  if (expanded.length > MAX_PROXY_PRIMITIVES) {
    issues.push(`expanded primitive count ${expanded.length} exceeds bound ${MAX_PROXY_PRIMITIVES}`);
  }
  for (const primitive of primitives) {
    if (!COLLISION_PROXY_KINDS.includes(primitive.kind)) issues.push(`unknown kind ${primitive.kind}`);
    if (primitive.kind === 'circle' && !(primitive.r > 0)) issues.push('circle r > 0 required');
    if (primitive.kind === 'capsule' && !(primitive.r > 0)) issues.push('capsule r > 0 required');
    if (primitive.kind === 'obb' && !(primitive.hx > 0 && primitive.hz > 0)) issues.push('obb hx/hz > 0 required');
    if (primitive.kind === 'chain' && !(primitive.radius > 0 && primitive.circleR > 0 && primitive.count >= 3)) {
      issues.push('chain radius/circleR/count invalid');
    }
  }
  if (manifest.docking) {
    const d = manifest.docking;
    if (!(d.corridor && d.corridor.mouthRadius > 0)) issues.push('docking.corridor.mouthRadius required');
    if (!(d.capture && d.capture.outerRadius > 0 && d.capture.halfWidth > 0)) issues.push('docking.capture geometry required');
    if (!(d.berth && d.berth.radius > 0 && d.berth.dockRadius > 0)) issues.push('docking.berth geometry required');
    if (!(d.assist && d.assist.kp > 0 && d.assist.kd > 0 && d.assist.maxAccel > 0)) issues.push('docking.assist tuning required');
    if (d.berth && d.capture && d.berth.radius >= d.capture.outerRadius) {
      issues.push('berth must sit inside the capture lane');
    }
  }
  return { ok: issues.length === 0, issues };
}

// -----------------------------------------------------------------------------------------------
// internals
// -----------------------------------------------------------------------------------------------

function expandChain(primitive, corridorDeg, out) {
  const count = Math.max(3, Math.trunc(primitive.count));
  const minor = Number.isFinite(primitive.minorRadius) ? primitive.minorRadius : null;
  const gap = primitive.gap && primitive.gap.at === 'corridor'
    ? { bearing: corridorDeg, halfWidthDeg: finite(primitive.gap.halfWidthDeg, 0) }
    : (primitive.gap && Number.isFinite(primitive.gap.bearingDeg)
      ? { bearing: primitive.gap.bearingDeg, halfWidthDeg: finite(primitive.gap.halfWidthDeg, 0) }
      : null);
  for (let i = 0; i < count && out.length < MAX_PROXY_PRIMITIVES; i++) {
    const deg = (i / count) * 360;
    if (gap && Math.abs(wrapDeg180(deg - gap.bearing)) < gap.halfWidthDeg) continue;
    const a = deg * DEG;
    // Ellipse support (tilted rings projected onto the plane): semi-major on the chain radius,
    // semi-minor perpendicular. Circle positions follow the ellipse; radii stay circular (coarse).
    const rx = minor ? Math.cos(a) * primitive.radius : Math.cos(a) * primitive.radius;
    const rz = minor ? Math.sin(a) * minor : Math.sin(a) * primitive.radius;
    out.push({
      kind: 'circle',
      id: `${primitive.id || 'chain'}-${i}`,
      chain: primitive.id || null,
      x: rx,
      z: rz,
      r: primitive.circleR,
    });
  }
}

function sampleFootprint(manifest, corridorDeg) {
  const f = manifest.footprint;
  const samples = [];
  const STEP = 2; // degrees — dense enough that the measured bound is stable to ~1e-3
  // Core disc boundary.
  for (let deg = 0; deg < 360; deg += STEP) {
    const a = deg * DEG;
    samples.push({ x: Math.cos(a) * f.coreRadius, z: Math.sin(a) * f.coreRadius });
  }
  // Spar rectangles (both long edges + outer cap), all cardinal angles.
  for (const sparDeg of f.spar.angles) {
    const a = sparDeg * DEG;
    const ux = Math.cos(a);
    const uz = Math.sin(a);
    for (let t = f.spar.inner; t <= f.spar.outer + 1e-9; t += (f.spar.outer - f.spar.inner) / 34) {
      for (const side of [-1, 1]) {
        samples.push({ x: ux * t - uz * side * f.spar.halfWidth, z: uz * t + ux * side * f.spar.halfWidth });
      }
    }
    samples.push({ x: ux * f.spar.outer, z: uz * f.spar.outer });
  }
  // Ring annuli boundaries — EXCLUDING declared corridor gap sectors (each ring chain may cut its
  // own gap around the corridor bearing; the gap is bounded by the navigability assertion instead).
  for (const [ringId, ring] of [['ring1', f.ring1], ['ring2', f.ring2]]) {
    if (!ring) continue;
    const minor = ring.minorRadius || null;
    const chain = (manifest.primitives || []).find((p) => p.kind === 'chain' && p.id === ringId);
    const gapHalfWidth = chain && chain.gap && chain.gap.at === 'corridor' ? finite(chain.gap.halfWidthDeg, 0) : 0;
    for (let deg = 0; deg < 360; deg += STEP) {
      if (gapHalfWidth > 0 && Math.abs(wrapDeg180(deg - corridorDeg)) < gapHalfWidth) continue;
      const a = deg * DEG;
      const base = { x: Math.cos(a) * ring.radius, z: Math.sin(a) * (minor || ring.radius) };
      // Project the tube edge along the local ellipse normal (coarse: radial is fine at this bound).
      const len = Math.hypot(base.x, base.z) || 1;
      const nx = base.x / len;
      const nz = base.z / len;
      samples.push({ x: base.x + nx * ring.tubeHalfWidth, z: base.z + nz * ring.tubeHalfWidth });
      samples.push({ x: base.x - nx * ring.tubeHalfWidth, z: base.z - nz * ring.tubeHalfWidth });
    }
  }
  return samples;
}

function sampleProxyBoundaries(proxies) {
  const samples = [];
  for (const primitive of proxies) {
    if (primitive.kind === 'circle') {
      for (let deg = 0; deg < 360; deg += 15) {
        const a = deg * DEG;
        samples.push({ x: primitive.x + Math.cos(a) * primitive.r, z: primitive.z + Math.sin(a) * primitive.r });
      }
    } else if (primitive.kind === 'capsule') {
      const steps = 16;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = primitive.ax + (primitive.bx - primitive.ax) * t;
        const z = primitive.az + (primitive.bz - primitive.az) * t;
        const dx = primitive.bx - primitive.ax;
        const dz = primitive.bz - primitive.az;
        const len = Math.hypot(dx, dz) || 1;
        const nx = -dz / len;
        const nz = dx / len;
        samples.push({ x: x + nx * primitive.r, z: z + nz * primitive.r });
        samples.push({ x: x - nx * primitive.r, z: z - nz * primitive.r });
      }
    } else if (primitive.kind === 'obb') {
      const c = Math.cos(finite(primitive.angleDeg) * DEG);
      const s = Math.sin(finite(primitive.angleDeg) * DEG);
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const lx = sx * primitive.hx;
        const lz = sz * primitive.hz;
        samples.push({ x: primitive.x + c * lx - s * lz, z: primitive.z + s * lx + c * lz });
      }
    }
  }
  return samples;
}

function distanceToProxySet(point, proxies) {
  let best = Infinity;
  for (const primitive of proxies) {
    const d = distanceToProxy(point, primitive);
    if (d < best) best = d;
  }
  return best;
}

/** Signed distance from point to primitive SURFACE (negative inside). */
export function distanceToProxy(point, primitive) {
  if (primitive.kind === 'circle') {
    return Math.hypot(point.x - primitive.x, point.z - primitive.z) - primitive.r;
  }
  if (primitive.kind === 'capsule') {
    const d = distanceToSegment(point, { x: primitive.ax, z: primitive.az }, { x: primitive.bx, z: primitive.bz });
    return d - primitive.r;
  }
  if (primitive.kind === 'obb') {
    const c = Math.cos(-finite(primitive.angleDeg) * DEG);
    const s = Math.sin(-finite(primitive.angleDeg) * DEG);
    const lx = c * (point.x - primitive.x) - s * (point.z - primitive.z);
    const lz = s * (point.x - primitive.x) + c * (point.z - primitive.z);
    const qx = Math.abs(lx) - primitive.hx;
    const qz = Math.abs(lz) - primitive.hz;
    const outside = Math.hypot(Math.max(qx, 0), Math.max(qz, 0));
    const inside = Math.min(Math.max(qx, qz), 0);
    return outside + inside;
  }
  return Infinity;
}

function distanceToSegment(p, a, b) {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz;
  const t = len2 > 0 ? clamp(((p.x - a.x) * abx + (p.z - a.z) * abz) / len2, 0, 1) : 0;
  const cx = a.x + abx * t;
  const cz = a.z + abz * t;
  return Math.hypot(p.x - cx, p.z - cz);
}

function distanceToFootprint(point, footprint) {
  let best = Infinity;
  // Core disc.
  best = Math.min(best, Math.abs(Math.hypot(point.x, point.z) - footprint.coreRadius));
  // Spar rectangles.
  for (const sparDeg of footprint.spar.angles) {
    const a = sparDeg * DEG;
    const ux = Math.cos(a);
    const uz = Math.sin(a);
    const along = point.x * ux + point.z * uz;
    const lateral = Math.abs(point.x * -uz + point.z * ux);
    const qA = Math.max(footprint.spar.inner - along, Math.max(along - footprint.spar.outer, 0));
    const qL = Math.max(lateral - footprint.spar.halfWidth, 0);
    const inside = along >= footprint.spar.inner && along <= footprint.spar.outer && lateral <= footprint.spar.halfWidth;
    const d = inside ? 0 : Math.hypot(qA, qL);
    if (d < best) best = d;
  }
  // Ring annuli.
  for (const ring of [footprint.ring1, footprint.ring2]) {
    if (!ring) continue;
    const minor = ring.minorRadius || ring.radius;
    // Ellipse distance (coarse: scale z into circular space).
    const scaled = Math.hypot(point.x, point.z * (ring.radius / minor));
    const d = Math.abs(scaled - ring.radius) - ring.tubeHalfWidth;
    if (d < best) best = Math.max(0, d);
  }
  return best;
}

function wrapDeg(deg) {
  let out = finite(deg) % 360;
  if (out < 0) out += 360;
  return out;
}

function wrapDeg180(deg) {
  let out = finite(deg) % 360;
  if (out > 180) out -= 360;
  if (out <= -180) out += 360;
  return out;
}

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

function positive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}
