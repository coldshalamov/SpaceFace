// PQ-019A facility embodiment data. These are ordinary Atlas POIs whose physical
// representation is delegated to the heistFacilities system. The data module is
// intentionally side-effect free: it owns identities and authored transforms only.

import {
  worldSiteAssetBinding,
  worldSiteSocketTransform,
} from './worldSiteAssetBindings.js';

export const PQ019_HEIST_SECTOR_ID = 'sector_tethys_junction';
export const PQ019_FACILITY_RUNTIME_OWNER = 'heistFacilities';
export const PQ019_FACILITY_SOCKET = 'SOCKET_Dock_Approach';

function freezeFacility({
  id,
  role,
  name,
  type,
  factionId,
  localPos,
  rot,
  placeId,
  placeScale,
  headRadius,
}) {
  return Object.freeze({
    id,
    role,
    name,
    type,
    factionId,
    localPos: Object.freeze({ x: localPos.x, z: localPos.z }),
    rot,
    placeId,
    placeScale,
    headRadius,
    socketName: PQ019_FACILITY_SOCKET,
    sectorId: PQ019_HEIST_SECTOR_ID,
    runtimeOwner: PQ019_FACILITY_RUNTIME_OWNER,
  });
}

export const PQ019_FACILITIES = Object.freeze({
  heist_launcher: freezeFacility({
    id: 'heist_launcher',
    role: 'heist_launcher',
    name: 'Tethys Surface Launcher',
    type: 'beacon',
    factionId: 'faction_mts',
    localPos: { x: 1515, z: -2012 },
    rot: 2.7719083647944918,
    placeId: 'place_claim_outpost_relay',
    placeScale: 0.14,
    headRadius: 8,
  }),
  lawful_catcher: freezeFacility({
    id: 'lawful_catcher',
    role: 'lawful_catcher',
    name: 'Concord Lawful Catcher',
    type: 'beacon',
    factionId: 'faction_scn',
    localPos: { x: -400, z: -1270 },
    rot: 5.913501018384284,
    placeId: 'place_claim_outpost_catcher',
    placeScale: 0.16,
    headRadius: 12,
  }),
  fence_receiver: freezeFacility({
    id: 'fence_receiver',
    role: 'fence_receiver',
    name: 'Quiet Fence Receiver',
    type: 'cache',
    factionId: 'faction_quiet',
    localPos: { x: -1320, z: 420 },
    rot: -1.0722791362393007,
    placeId: 'place_claim_outpost_fence',
    placeScale: 0.20,
    headRadius: 12,
  }),
});

export const PQ019_CAPSULE = Object.freeze({
  stableId: 'cargo_capsule',
  radius: 6,
  mass: 180,
  hull: 160,
  authoredPayloadAssetId: 'pod_cargo_container',
  legalOwnerFactionId: 'faction_mts',
  ownerId: 'facility:heist_launcher',
  // PQ-019C Phase E tuning selection (test/fixtures/pq019c-tuning-matrix.json). 120 WU/s put
  // the capsule at the catcher in 17.0 s, under the matrix objective's 20 s floor for the
  // launcher leg to be a real interception problem rather than a reflex. 100 WU/s is the
  // fastest candidate that clears it, at 20.4 s. The matrix CONFIRMED `mass` at 180 unchanged.
  launchSpeed: 100,
});

// ── BREAKAWAY: the SP-07 flywheel assembly and its capture fork ─────────────────────────────────
//
// A configured VARIANT of the scheduled launch above — not a second launcher and not a second
// mission engine. The same Tethys launcher throws a heavier industrial load OFF the catcher line
// (the "breakaway"), and the lawful catcher's dock approach becomes a physical capture fork: the
// load must be brought through the fork's open end under its speed limit, braked by bounded force,
// and settled before custody can pass. Candidate values come from the BREAKAWAY packet (the mass is
// inherited from the capsule's confirmed tuning); scale and visual review against the shipping
// camera remain open.
export const BREAKAWAY_SP07 = Object.freeze({
  stableId: 'payload_sp07',
  name: 'SP-07 flywheel assembly',
  radius: 16,
  mass: 180,
  // A durable cage, three times the capsule: using the load as a tool must not destroy the job.
  hull: 480,
  // PQ-195.00: the authored SP-07 body. Never the 6 WU pod stretched to 16 WU — the
  // spindle's silhouette is authored to fill this 16 WU collision body.
  authoredPayloadAssetId: 'place_breakaway_sp07',
  legalOwnerFactionId: 'faction_mts',
  ownerId: 'facility:heist_launcher',
  launchSpeed: 60,
  // Radians off the launcher→catcher line. The load passes the catcher more than a kilometre wide,
  // so it can never deliver itself: every delivery is a recovery somebody flew.
  launchHeadingOffsetRad: 0.6,
  // Physical Y spin at release (rad/s): above the fork's settle limit, so a tumbling load cannot
  // count as settled until something takes the spin out of it.
  launchSpinRadS: 0.5,
});

export const BREAKAWAY_CAPTURE_FORK = Object.freeze({
  id: 'breakaway_fork_lawful_catcher',
  facilityId: 'lawful_catcher',
  // Inner rail half-width and usable bay depth. A 16 WU load has 22 WU of total lateral clearance.
  halfWidth: 27,
  depth: 72,
  maxEntrySpeed: 100,
  maxLateralSpeed: 50,
  settleSpeed: 8,
  settleOmega: 0.45,
  settleTicks: 21,
  maxForce: 36000,
  dampingRate: 5,
  maxTorque: 180000,
  angularDampingRate: 6,
  // Gap between the bay's rear face and the catcher's static custody head, which is the physical
  // rear stop. The mouth itself is never a wall.
  rearClearanceWu: 4,
});

// PQ-195.01: the fork's static collider set, derived from BREAKAWAY_CAPTURE_FORK and reconciled with
// the authored machine (`place_breakaway_fork.glb`, bounds x −3.5..89.5, z −37.5..37.5, origin at the
// mouth, inward +X):
//   * RAILS are the machine's graphite structures at |z| = 31 with half-extents [37.5, 3.5, 4], from
//     x = −1.5 to 73.5 (75 WU, centred on x = 36). Their INNER face is the authored clear half-width
//     (|z| = 27), so a 16 WU load keeps the authored 22 WU of total lateral clearance. The 10 WU
//     capsule thickness reaches the machine's outer greebles (|z| = 37, inside the 37.5 GLB bound).
//   * the ARRESTOR is the transverse rear structure at x = 77 (75 WU wide) and its energy sinks out to
//     x = 89.5. Its leading face is anchored to the bay's rear clearance plane that the catcher's
//     custody head already defines (`depth + rearClearanceWu`), so a refused load still reaches the
//     same rear-stop depth the existing physics contract measures.
// Capsules: length runs along the entity's local +X axis and the cap radius is the half-thickness.
// `data.proportions` is consumed by buildCraftCapsuleColliderDesc at a unit reference radius, so these
// numbers are absolute WU; the system picks the body yaw the physics build convention requires.
export const BREAKAWAY_FORK_COLLIDERS = Object.freeze({
  railLength: 75,
  railThickness: 10,
  railAxialCenter: 36,
  // inner face at `halfWidth` → centre at halfWidth + thickness/2.
  railLateralOffset: BREAKAWAY_CAPTURE_FORK.halfWidth + 5,
  // spans the full bay, meeting both rails.
  arrestorLength: 2 * (BREAKAWAY_CAPTURE_FORK.halfWidth + 10),
  arrestorThickness: 10,
  // leading face at depth + rearClearance (the catcher head's leading face) → centre + thickness/2.
  arrestorAxialCenter: BREAKAWAY_CAPTURE_FORK.depth + BREAKAWAY_CAPTURE_FORK.rearClearanceWu + 5,
});

// ── PQ-195.08: the moving carrier the breakaway releases FROM ──────────────────────────────────
//
// Slice C (01_FEATURE_SPEC §74): the SP-07 starts CLAMPED to an actual moving carrier — a yard tug
// hauling the caged assembly down the same off-line heading the free launch used. The clamp is a
// transport attachment owned by the carrier, released three ways: voluntarily at the authored
// route point, by disabling the carrier's `subsystem_transport_clamp`, or by losing the carrier.
// Every release path only removes the constraint — the released body keeps whatever velocity and
// spin it already had; nothing ever adds an impulse for the camera.
export const BREAKAWAY_CARRIER = Object.freeze({
  // The yard tug: sustained axial force is its whole job ("a drive with a frame").
  shipId: 'ship_hawser',
  // MTS logistics runs the shipment — the load's legal owner.
  factionId: 'faction_mts',
  // Sustained pace with a 180-mass cage on the bolt: close to the free launch's 60 WU/s so the
  // encounter's motion scale is unchanged after release.
  cruiseSpeedWu: 55,
  // Clear gap between the tug's aft clamp socket and the cage — enough that rail collision is a
  // physical fact, not an overlap.
  clampStandoffWu: 8,
  // The carrier lets go when it has carried the cage this far down the breakaway heading — a
  // progress crossing, not an arrival: the tug flies straight through, the freed body keeps the
  // lane's momentum, and the encounter's corridor stays the one the free launch crossed.
  routeReleaseWu: 1200,
  // After letting go the tug keeps its lane and is removed this far downrange — a bounded
  // transient, never permanent traffic.
  departureWu: 2400,
});

export const HEIST_CAPSULE_RUN_VARIANT_ID = 'capsule_run';
export const BREAKAWAY_THIRD_SHIFT_VARIANT_ID = 'breakaway_third_shift';

// ── BREAKAWAY: Berth Three and its stalled industrial worker (PQ-195.04) ───────────────────────
//
// The local consequence of the Third Shift. Beside the lawful catcher, Berth Three's industrial
// hauler cannot run its circuit without the replacement assembly; it waits, parked, until a lawful
// delivery reaches the catcher fork. The berth is deliberately NOT a member of PQ019_FACILITIES:
// those are the three destination facilities with authored POI anchors and static custody heads.
// Berth Three is a worker site BESIDE the catcher, so it stays out of that catalog and out of
// facility materialization counting.
//
// This module owns the AUTHORED site, the worker hull identity and the two service circuits. It
// owns no berth state: whether the berth is activated lives in the serialized state.npcJobs record
// (npcJobsRuntime), which is what makes the consequence survive save/load.
//
// The condition threshold is an authored candidate, kept as a named constant and consulted through
// berthServiceTier() so the activation seam and any consumer agree on exactly one number.
export const BREAKAWAY_BERTH_RESUME_MIN_CONDITION01 = 0.6;

export const BREAKAWAY_BERTH = Object.freeze({
  id: 'berth_three',
  name: 'Berth Three',
  // The lawful catcher the berth serves; also the only facility whose committed handoff activates it.
  facilityId: 'lawful_catcher',
  // Sector-local parked position of the worker hull, north of the catcher and clear of the fork's
  // delivery corridor (the fork faces the launcher, roughly west/south of the catcher).
  workerLocalPos: Object.freeze({ x: -400, z: -1080 }),
  worker: Object.freeze({
    shipId: 'ship_mule',
    team: 2,
    factionId: 'faction_mts',
    // Stable per-seed join key between the worker hull (spawned by heistFacilities) and its job
    // record (owned by npcJobsRuntime). Never a live entity id.
    worldRecordSlotId: 'breakaway:berth-three:worker',
    label: 'Berth Three hauler',
  }),
  // Two circuits over the SAME worker. `resumed` is the berth's real haul; `reduced` is the bounded
  // repair shuttle it can still run on a damaged assembly. Both are MINER-phased cargo cycles (WORK
  // at the far mark, UNLOAD back at the berth), so "working" is a real advancing cargo task in
  // state.npcJobs, and the two tiers are distinguishable by route, speed and phase durations.
  serviceTiers: Object.freeze({
    resumed: Object.freeze({
      tier: 'resumed',
      speed: 30,
      commissionS: 2,
      approachS: 4,
      workS: 30,
      unloadS: 6,
      waypoints: Object.freeze([
        Object.freeze({
          id: 'berth_three',
          label: 'Berth Three',
          localPos: Object.freeze({ x: -400, z: -1080 }),
        }),
        Object.freeze({
          id: 'berth_three_yard',
          label: 'Tethys service yard',
          localPos: Object.freeze({ x: -980, z: -820 }),
        }),
      ]),
    }),
    reduced: Object.freeze({
      tier: 'reduced',
      speed: 16,
      commissionS: 2,
      approachS: 6,
      workS: 54,
      unloadS: 10,
      waypoints: Object.freeze([
        Object.freeze({
          id: 'berth_three',
          label: 'Berth Three',
          localPos: Object.freeze({ x: -400, z: -1080 }),
        }),
        Object.freeze({
          id: 'berth_three_shuttle',
          label: 'Berth Three repair shuttle',
          localPos: Object.freeze({ x: -760, z: -1000 }),
        }),
      ]),
    }),
  }),
});

/**
 * The authored service tier for an assembly delivered in `condition01`.
 *
 * `null` means the caller did not carry a measured condition (the Quiet fence does not grade), so
 * there is no service tier to choose. At or above the named threshold the berth resumes its haul;
 * below it the berth runs the reduced repair shuttle.
 */
export function berthServiceTier(condition01) {
  const value = Number(condition01);
  if (!Number.isFinite(value)) return null;
  return value >= BREAKAWAY_BERTH_RESUME_MIN_CONDITION01 ? 'resumed' : 'reduced';
}

// PQ-195.00: presentation identity of the capture fork receiver extension. The fork is a static
// machine placed at the mouth projected by projectBreakawayForkMouth(), at unit scale in WU —
// the GLB's origin IS the mouth plane and its inward axis is +X, so no recentering offset.
export const BREAKAWAY_FORK_VISUAL = Object.freeze({
  placeId: 'place_breakaway_fork',
  placeScale: 1,
});

export const HEIST_LAUNCH_VARIANTS = Object.freeze({
  [HEIST_CAPSULE_RUN_VARIANT_ID]: Object.freeze({
    id: HEIST_CAPSULE_RUN_VARIANT_ID,
    payload: PQ019_CAPSULE,
    custody: 'contact',
    fork: null,
    // The capsule is a transient entity: a reload reconciles a launched run to `unresolved_absent`.
    durableLoad: false,
  }),
  [BREAKAWAY_THIRD_SHIFT_VARIANT_ID]: Object.freeze({
    id: BREAKAWAY_THIRD_SHIFT_VARIANT_ID,
    payload: BREAKAWAY_SP07,
    custody: 'capture_fork',
    fork: BREAKAWAY_CAPTURE_FORK,
    // The SP-07 is a physical obligation: its body is saved by the save owner (`flags.persistent`)
    // and its mission re-adopts that exact body after a reload.
    durableLoad: true,
  }),
});

/** The launch variant for a schedule. Absent or unknown ids are the historical Capsule Run. */
export function heistLaunchVariant(variantId) {
  return (typeof variantId === 'string' && HEIST_LAUNCH_VARIANTS[variantId])
    || HEIST_LAUNCH_VARIANTS[HEIST_CAPSULE_RUN_VARIANT_ID];
}

export function isKnownHeistLaunchVariantId(variantId) {
  return typeof variantId === 'string'
    && Object.prototype.hasOwnProperty.call(HEIST_LAUNCH_VARIANTS, variantId);
}

export function isHeistPayloadStableId(stableId) {
  return Object.values(HEIST_LAUNCH_VARIANTS).some((variant) => variant.payload.stableId === stableId);
}

/**
 * Sector-local mouth origin and INWARD normal of a capture fork.
 *
 * Derived from the same socket projection the facility's custody head uses, so the fork, the head
 * that acts as its rear stop, and the navigation marker cannot disagree. Every PQ-019 receiver's
 * authored yaw points its dock approach back out along the launch line (the catcher faces the
 * launcher), so the fork's inward normal is the reverse of that yaw.
 */
export function projectBreakawayForkMouth(fork = BREAKAWAY_CAPTURE_FORK) {
  const facility = PQ019_FACILITIES[fork.facilityId];
  if (!facility) throw new Error(`Unknown capture fork facility ${fork.facilityId}`);
  const socket = projectPq019FacilitySocket(facility);
  const nx = -Math.cos(facility.rot);
  const nz = -Math.sin(facility.rot);
  const back = fork.depth + facility.headRadius + fork.rearClearanceWu;
  return { x: socket.x - nx * back, z: socket.z - nz * back, nx, nz };
}

export const PQ019_FACILITY_POIS = Object.freeze(
  Object.values(PQ019_FACILITIES).map((facility) => Object.freeze({
    id: facility.id,
    type: facility.type,
    name: facility.name,
    factionId: facility.factionId,
    hidden: false,
    runtimeOwner: PQ019_FACILITY_RUNTIME_OWNER,
  })),
);

export const PQ019_FACILITY_ANCHORS = Object.freeze(
  Object.values(PQ019_FACILITIES).map((facility) => Object.freeze({
    id: facility.id,
    pos: facility.localPos,
    position: facility.localPos,
    rot: facility.rot,
    landmarkGlb: facility.placeId,
    landmark: true,
    placeScale: facility.placeScale,
    runtimeOwner: PQ019_FACILITY_RUNTIME_OWNER,
  })),
);

/**
 * Append the catalog identities before sectorAnchors overlays authored positions.
 * Existing identities always win so applying this helper twice stays idempotent.
 */
export function appendPq019FacilityPois(sector) {
  if (!sector || sector.id !== PQ019_HEIST_SECTOR_ID) return sector;
  const existing = new Set((sector.pois || []).map((poi) => poi.id));
  const additions = PQ019_FACILITY_POIS.filter((poi) => !existing.has(poi.id));
  if (additions.length === 0) return sector;
  return { ...sector, pois: [...(sector.pois || []), ...additions] };
}

/**
 * Project the immutable authored dock-approach socket into sector-local XZ.
 */
export function projectPq019FacilitySocket(facility) {
  if (!facility || !facility.localPos) {
    throw new TypeError('PQ-019 facility requires an authored local position');
  }
  const transform = worldSiteSocketTransform(facility.placeId, facility.socketName);
  const binding = worldSiteAssetBinding(facility.placeId);
  const center = binding?.visualCenterXZ;
  if (!transform || !center) {
    throw new Error(`Missing ${facility.socketName} for ${facility.placeId}`);
  }
  const [socketX, , socketZ] = transform.translation;
  const scale = Number(facility.placeScale);
  const rot = Number(facility.rot);
  if (![socketX, socketZ, scale, rot].every(Number.isFinite)) {
    throw new TypeError(`Invalid authored socket transform for ${facility.id}`);
  }
  // Authored place presentation recenters the GLB around visualCenterXZ. Physical
  // socket heads must subtract that same center before scale + yaw projection.
  const x = (socketX - center.x) * scale;
  const z = (socketZ - center.z) * scale;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  return {
    x: facility.localPos.x + x * cos - z * sin,
    z: facility.localPos.z + x * sin + z * cos,
  };
}

export default PQ019_FACILITIES;
