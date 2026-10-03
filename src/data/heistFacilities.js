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
  // SF-147: the sealed shipment inside is FOUR separable units. Hard knocks in flight shed
  // units as physical pods; the fence pays for what is actually inside the delivered shell.
  // Provenance lives on each unit pod, never in a manifest line.
  shipmentUnits: 4,
});

/** A shipment unit knocked loose from a capsule — a real body with lawful provenance. */
export const PQ019_SHIPMENT_UNIT = Object.freeze({
  stableId: 'shipment_unit',
  name: 'sealed shipment unit',
  radius: 5,
  mass: 40,
  hull: 60,
  authoredPayloadAssetId: 'pod_cargo_container',
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
  // One indivisible assembly — there is no partial-load version of a flywheel.
  shipmentUnits: 1,
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

// ── SF-140: the routine transfer — a lawful schedule that exists whether or not a job does ─────
//
// The Tethys launcher does not wait for a thief to want it. When no contract owns the schedule it
// keeps throwing ordinary logged freight to the Concord catcher on a fixed cadence — a real lawful
// transfer the player can watch, scan, follow, or rob. It is deliberately NOT a launch variant:
// `requestLaunchSchedule` still owns the one launcher slot, and a routine flight is what runs when
// that slot is empty. Routine capsules use the same physical body spec and the same custody heads;
// what they never carry is a mission's schedule identity, so no settlement table ever sees them —
// a stolen routine capsule raises WANTED through the ordinary law seam and pays nobody.
export const PQ019_ROUTINE = Object.freeze({
  /** Seconds between routine throws while the launcher is unbooked and the sector is live. */
  cadenceS: 240,
  /** Grace before the first throw after materialize/restore, so the player can learn it exists. */
  firstLaunchDelayS: 75,
  /** A stolen-and-fenced capsule makes the launcher ship its next transfers under escort. */
  escortAfterLosses: 2,
  escortShipId: 'ship_hawser',
  escortFactionId: 'faction_scn',
  escortStandoffWu: 70,
  escortSpeedWu: 62,
  /** The routine's own schedule-id prefix. Never equal to a mission's `pq019c:<id>` identity. */
  schedulePrefix: 'pq019a:routine',
});

// ── SF-140: interception by observation ────────────────────────────────────────────────────────
//
// "Learn the real schedule and receiver geometry before committing to the interception window" —
// three physical methods, all writing the same durable `state.heistFacilities.observed` facts:
//
//   * SCAN   — a scan pulse that physically covers the object resolves its fact.
//   * FOLLOW — staying inside `followRadiusWu` of a working hull (the berth tug, the carrier) for
//              `followTicks` accumulates what its route already says.
//   * WATCH  — being present for a routine catch or a launch teaches the receiver's place and the
//              schedule's cadence. No UI verb required: proximity and a live event are the truth.
//
// Each fact is journaled once (`heist:observed`); observations never grant resources — they make
// the machinery's own cues speak earlier and with precise truth.
export const PQ019_OBSERVE = Object.freeze({
  /** How close the player's scan pulse must land to an object to resolve its fact. */
  scanRadiusWu: 900,
  /** "Follow the worker": proximity that counts as tailing a crew hull. */
  followRadiusWu: 260,
  /** Consecutive ticks inside the radius before the route is learned. */
  followTicks: 240,
  /** Being inside this of a custody receiver when a routine catch lands teaches the receiver. */
  watchRadiusWu: 1400,
  /** Earlier countdown knowledge an observed schedule earns over the authored T-minus set. */
  earlyWarningS: 60,
  /** The stable fact ids. Values: { atTick, method, detail } once learned, absent before. */
  facts: Object.freeze({
    launcher_schedule: 'launcher_schedule',
    catcher_receiver: 'catcher_receiver',
    fence_receiver: 'fence_receiver',
    crew_route: 'crew_route',
  }),
});

// ── SF-143: the counterweight scene — hold one thing to move another ────────────────────────────
//
// A gate across a freight corridor, held open only while a qualifying MASS rests settled on its
// counterweight cradle. Beside it: a parked yard tug, two sealed transfer crates staged on the
// near side, and a receiver pad on the far side. Armed by a contract, the tug clamps a crate and
// walks it through; the moment the balance breaks the door slides back and the carry holds where
// it physically is — "lost output remains physical".
//
// Configured conditions only: any heavy non-ship body inside the cradle at settle speed counts as
// ballast (the authored block, a crate the player sacrifices, a towed rock) — and nothing counts
// by grazing a trigger. The door is a real static collider that MOVES; a closed gate is a wall.
export const COUNTERWEIGHT_SCENE = Object.freeze({
  id: 'counterweight_yard',
  name: 'Tethys Transfer Yard',
  /** The cradle the counterweight sits on. Sector-local XZ. */
  cradle: Object.freeze({
    pos: Object.freeze({ x: -950, z: -320 }),
    radiusWu: 80,
    minMass: 40,
    maxMass: 900,
    settleSpeedWu: 8,
    /** Ticks of continuously-held balance before the gate is committed open. */
    holdTicks: 90,
    /** Ticks after the balance breaks before the door is physically shut again. */
    releaseTicks: 45,
  }),
  /** The freight corridor the door guards: a straight lane from stage to receiver. */
  corridor: Object.freeze({
    stagePos: Object.freeze({ x: -880, z: -520 }),
    receiverPos: Object.freeze({ x: -380, z: -520 }),
    halfWidthWu: 40,
  }),
  /** The door: a static capsule collider that slides between its closed and open poses. */
  door: Object.freeze({
    closedPos: Object.freeze({ x: -620, z: -520 }),
    /** Open pose is slid laterally clear of the corridor — parked, not deleted. */
    openOffsetWu: 110,
    lengthWu: 96,
    halfWidthWu: 8,
    /** Ticks for a full closed->open travel. The door never teleports. */
    travelTicks: 90,
  }),
  /** The ballast block staged beside the cradle — the intended counterweight. */
  ballast: Object.freeze({
    stableId: 'counterweight_ballast',
    name: 'yard ballast block',
    radius: 14,
    mass: 300,
    hull: 900,
    authoredPayloadAssetId: 'pod_cargo_container',
    localPos: Object.freeze({ x: -1030, z: -290 }),
  }),
  /** The sealed transfer crates, staged on the near side of the gate. */
  crates: Object.freeze([
    Object.freeze({
      stableId: 'transfer_crate_alpha',
      name: 'sealed transfer crate',
      radius: 9,
      mass: 120,
      hull: 220,
      authoredPayloadAssetId: 'pod_cargo_container',
      localPos: Object.freeze({ x: -880, z: -520 }),
    }),
    Object.freeze({
      stableId: 'transfer_crate_beta',
      name: 'sealed transfer crate',
      radius: 9,
      mass: 120,
      hull: 220,
      authoredPayloadAssetId: 'pod_cargo_container',
      // Staged clear of the A↔pad working lane and the door's open pocket: at (-856,-556) the
      // tug's clamp dance on alpha clipped beta loose and chased a drifting crate forever.
      localPos: Object.freeze({ x: -920, z: -600 }),
    }),
  ]),
  /** The receiver pad: a crate at rest inside it is a delivery. */
  receiverPad: Object.freeze({
    pos: Object.freeze({ x: -380, z: -520 }),
    radiusWu: 70,
    settleSpeedWu: 6,
    settleTicks: 20,
    /** The pad's arrest machinery: a crate crossing its circle below this speed is physically
     *  damped to a stop — freight is CAUGHT, not just parked on. A faster transit sails through
     *  honest and untouched. */
    arrestSpeedWu: 26,
  }),
  /** The yard tug and its working pace. Same class as the breakaway carrier. */
  crew: Object.freeze({
    shipId: 'ship_hawser',
    factionId: 'faction_mts',
    cruiseSpeedWu: 34,
    /** The crate outweighs the tug ~2:1 on the clamp line — a carried leg walks at a pace the
     *  joint can actually damp instead of swinging the assembly past the pad. */
    towSpeedWu: 20,
    parkLocalPos: Object.freeze({ x: -720, z: -430 }),
    /** World-record join key — never a live entity id. */
    worldRecordSlotId: 'counterweight:yard:crew',
    label: 'Yard tug',
    clampStandoffWu: 8,
    /** Close enough to the pad that a released crate settles inside it. */
    deliverStandoffWu: 10,
  }),
  /** One bounded interruption, granted at the first committed gate opening. */
  pressure: Object.freeze({
    lightPool: Object.freeze(['wasp_swarmer', 'reaver_pirate']),
    lightCount: 2,
    lightLevel: 3,
    spawnDistanceWu: 640,
    motive: 'contested_mechanism',
  }),
});

// ── SF-147: monitored posts on the escape lane ────────────────────────────────────────────────
//
// Three lawful Concord sensor posts stand between the launcher corridor and the Quiet fence.
// They are permanent scene machinery — always live — and they pulse whatever heist payload body
// crosses their field. Whether a scan means anything (a re-raised theft, fresh pursuit) is the
// mission's reading of the payload's provenance; the post itself just reports what crossed.
export const HOT_RETURN_MONITORS = Object.freeze({
  posts: Object.freeze([
    Object.freeze({ id: 'monitor_ridge', name: 'Concord Monitor — Ridge', localPos: Object.freeze({ x: 500, z: -1100 }), factionId: 'faction_scn' }),
    Object.freeze({ id: 'monitor_hollow', name: 'Concord Monitor — Hollow', localPos: Object.freeze({ x: -420, z: -560 }), factionId: 'faction_scn' }),
    Object.freeze({ id: 'monitor_shoal', name: 'Concord Monitor — Shoal', localPos: Object.freeze({ x: -880, z: -60 }), factionId: 'faction_scn' }),
  ]),
  /** A payload inside this radius is scanned — bounded by authored spacing, not by luck. */
  radiusWu: 420,
});

export default PQ019_FACILITIES;
