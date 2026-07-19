// Travel lanes — physical, segmented lane infrastructure on an atlas edge (ADR D8, Wave 3 W3-C).
//
// WHAT THIS IS: a MODIFIER, and a small one. Inside a lane segment volume, with the pilot's own
// travel drive Engaged, this system multiplies that drive's ceiling and ramp rate. That is the
// entire mechanic. THE LANE BOOSTS YOUR OWN DRIVE; IT NEVER TELEPORTS.
//
// WHAT THIS IS NOT — and D9.8 is binding here: not a warp, not a tunnel, not a disguised loading
// screen, not an instanced system. SpaceFace is ONE CONTINUOUS PLANE. A lane segment is a real route
// edge in the same world the player is already flying. Search this file for a position assignment on
// the player and you will find none: it never writes `player.pos`, `player.vel`, or any impulse.
//
// ─── ZERO NEW PHYSICS. This is the point of the packet ────────────────────────────────────────────
//
// Every physical effect below is produced by machinery that already shipped. This system supplies
// INPUTS to it and nothing else:
//
//   • The boost. `propulsionKernel.normalizeTravelDrive` already reads optional `ceiling` /
//     `rampRate` / `rampMult` overrides off the drive block, and its comment says why they exist:
//     "so a lane volume (D8) can multiply the drive's own numbers without the kernel knowing
//     anything about lanes". We write those three numbers. The kernel's D5 governor ramp does the
//     rest — the governor is SHAPED, never bypassed.
//
//   • The slowdown. We do NOT decelerate anybody. Entering a disrupted segment sets ONE boolean,
//     `state.player.travelDrive.disrupted`, which `input.js:116-122` already reads. That forces the
//     latch to Cooldown and — because the cooldown branch resets `cooldownT` every tick while the
//     flag is held — pins it there. A non-engaged drive makes `advanceTravelDrive` take its DECAY
//     branch, which reports `physicsEarnedMomentum` and lets the existing exponential SPEND the
//     excess velocity. That is the confiscation-free slowdown D8 asks for, and it is zero lines of
//     new deceleration logic. The kernel's own philosophy — "momentum earned through play is spent,
//     not confiscated" — carries the whole feature.
//
//   • The ambush. `encounterDirector.requestAuthoredEncounter` places the pirates. We choose a shape
//     (`ambush_snare`, whose authored `zoneTypes` literally include `ambush_lane`) and an anchor.
//
// ─── Why this system needs NO save-game persistence, and that is a design decision ────────────────
//
// The lane is DERIVED, not stored. Beacon geometry is a pure function of the two endpoint sectors'
// frozen global origins; segment health is authored; and the live readout is a pure function of
// (authored lane, player global position, drive state). Restore a save and every one of those inputs
// is already restored by machinery that owns them — so the lane recomputes bit-identically with no
// key of its own in the save blob. `state.travelLanes` is a PUBLISHED READOUT plus ephemeral spawn
// bookkeeping; nothing in it is authoritative, and losing it costs one tick.
//
// This matters beyond convenience: `src/save/saveSystem.js` is an explicit per-system whitelist, and
// a lane that demanded persistence would have to edit it. Deriving instead of storing is both the
// cheaper design and the one that respects file ownership — the same "derived read model, not a
// registry" posture ADR D2 chose for the Atlas.
//
// ─── Golden safety ────────────────────────────────────────────────────────────────────────────────
//
// Two independent guarantees, either of which alone is sufficient:
//   1. STRUCTURAL. `scripts/sf-sim.mjs` runs the 47a golden from a hardcoded curated systems array
//      and never imports `registry.js`, so registering here cannot move that hash.
//   2. FLAG. Every write is behind `travelFlag('laneBoost')`, read at CALL TIME, defaulting to
//      IS_BROWSER — false under node. With the flag off `update()` returns before touching anything.
// Determinism: no `Math.random`, no `Date.now`. Traffic position is a closed-form function of
// `state.simTime`, so it is reproducible from the clock alone and holds no integrated state.

import { travelFlag } from '../data/featureFlags.js';
import { resolveTravelCeiling } from '../core/flight/propulsionKernel.js';
import { resolvePropulsionProfile } from '../core/flight/propulsionCatalog.js';
import { sectorMembershipAtGlobal } from '../data/sectorCoordinates.js';
import { LANE_HELIOS_TETHYS, buildLaneGeometry } from '../data/travelLaneRoutes.js';

export const TRAVEL_LANE_SCHEMA = 'travel_lane_v1';

/** Beacons materialize only within this range of the player (the "47a recipe": lazily spawning a
 *  chain protects the golden and costs nothing when nobody is near it). */
const BEACON_SPAWN_RANGE_WU = 3200;

/**
 * Hard cap on lane entities. The Helios–Tethys chain is 14 beacons, so this is not a tight budget —
 * it is a guarantee that a future longer lane can never spawn an unbounded chain.
 */
const BEACON_MAX_ACTIVE = 20;

/** Lane traffic roster size. Fixed, small, and spawned once — see `_updateTraffic`. */
const TRAFFIC_COUNT = 6;

/** Traffic cruise speed along the chord, WU/s. Lane haulers move at a boosted-drive pace because
 *  they are using the same infrastructure the player is. */
const TRAFFIC_SPEED_WU_S = 420;

/** Traffic materializes a little further out than beacons so convoys are seen approaching. */
const TRAFFIC_SPAWN_RANGE_WU = 4200;

function finite(v, fallback = 0) {
  return Number.isFinite(v) ? v : fallback;
}

function playerEntity(state) {
  return state && state.entities && state.playerId != null
    ? state.entities.get(state.playerId) || null
    : null;
}

/**
 * Project a global position onto the lane chord.
 * Pure. `along` is distance from the origin end; `off` is perpendicular distance from the axis.
 */
export function projectOntoLane(geometry, pos) {
  const px = finite(pos && pos.x) - geometry.from.x;
  const pz = finite(pos && pos.z) - geometry.from.z;
  const along = px * geometry.axis.x + pz * geometry.axis.z;
  // Perpendicular component: subtract the axial projection from the full offset.
  const ox = px - geometry.axis.x * along;
  const oz = pz - geometry.axis.z * along;
  return { alongWU: along, offAxisWU: Math.sqrt(ox * ox + oz * oz) };
}

/**
 * Resolve which segment (if any) contains a projected position, and whether it is inside the tube.
 * Pure — this is the whole "am I in the lane" predicate, and it is deliberately a function of
 * position only so a test can drive it without a simulation.
 */
export function resolveLaneSegment(geometry, pos) {
  const { alongWU, offAxisWU } = projectOntoLane(geometry, pos);
  const segments = geometry.segments;
  const inTube = offAxisWU <= geometry.radiusWU;
  let index = -1;
  if (segments.length) {
    for (let i = 0; i < segments.length; i++) {
      if (alongWU >= segments[i].a.alongWU && alongWU < segments[i].b.alongWU) { index = i; break; }
    }
  }
  const segment = index >= 0 ? segments[index] : null;
  return {
    alongWU,
    offAxisWU,
    inLane: inTube && !!segment,
    segmentIndex: index,
    segment,
    progress: geometry.lengthWU > 0 ? Math.max(0, Math.min(1, alongWU / geometry.lengthWU)) : 0,
  };
}

/**
 * The next INTACT beacon ahead of a position — the physical recovery target after a dropout
 * (D8: "recovery means physically reaching the next intact segment"). Pure.
 */
export function nextIntactBeacon(geometry, alongWU) {
  for (const segment of geometry.segments) {
    if (segment.disrupted) continue;
    if (segment.a.alongWU >= alongWU) return segment.a;
  }
  // Past the last intact segment: the far end of the chain is the remaining anchor.
  const last = geometry.beacons[geometry.beacons.length - 1];
  return last || null;
}

export const travelLanes = {
  name: 'travelLanes',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || null;
    this.registry = ctx.registry || null;
    // Derived once from frozen authored data. Not runtime state, so it never needs rebuilding.
    this.lane = LANE_HELIOS_TETHYS;
    this.geometry = buildLaneGeometry(LANE_HELIOS_TETHYS);
    // Ephemeral spawn bookkeeping. Deliberately NOT on `state` — it is entity ids, which are
    // meaningless across a reload, and the save system's own rule for encounter spawns is the same
    // ("never live encounters/squads/entity ids").
    this._beaconIds = new Map();   // beacon index -> entity id
    this._trafficIds = [];         // entity ids, index-aligned with the deterministic roster
    this._lastSignature = null;    // change detection for nav:laneStatus
    this._ambushRequested = new Set();

    const bus = this.bus;
    if (bus && typeof bus.on === 'function') {
      // A restored save re-publishes the readout so UI that missed the transition is not blank, and
      // drops entity bookkeeping whose ids no longer refer to anything.
      bus.on('save:loaded', () => {
        this._beaconIds.clear();
        this._trafficIds.length = 0;
        this._ambushRequested.clear();
        this._lastSignature = null;
      });
    }
  },

  /**
   * The tick.
   *
   * STRICT NO-OP CONTRACT, in this order: flag off, no geometry, or no player ⇒ return before
   * touching anything at all. No lazy subtree creation, no field writes, no events, no spawns.
   */
  update(dt, state) {
    if (!travelFlag('laneBoost')) return;
    const geometry = this.geometry;
    if (!geometry || !geometry.segments.length) return;
    const player = playerEntity(state);
    if (!player || !player.pos) return;
    // ── everything past this line runs only in live play, on a real player ──

    const fix = resolveLaneSegment(geometry, player.pos);
    const disrupted = !!(fix.inLane && fix.segment && fix.segment.disrupted);
    const boosting = fix.inLane && !disrupted;

    this._applyDriveModifier(state, player, boosting);
    this._applyDisruption(state, disrupted);
    if (disrupted) this._requestAmbush(state, fix.segment);
    this._updateBeacons(state, player);
    this._updateTraffic(state, player);
    this._publish(state, fix, disrupted, boosting);
  },

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // the boost — three numbers on a block the kernel already reads
  // ─────────────────────────────────────────────────────────────────────────────────────────────

  /**
   * Write the lane multiplier onto the travel-drive block the input latch publishes.
   *
   * ORDERING IS LOAD-BEARING. `input` is UPDATE_ORDER index 0 (pinned by
   * `scripts/check-input-modalities.mjs:46`) and `flightSlot` is ~20th; this system sits between
   * them, so the value we write here is the value `stepPropulsion` consumes THIS tick.
   *
   * IDEMPOTENCE IS ALSO LOAD-BEARING, and it is the one subtle trap in this file. `input.js:163`
   * feeds the kernel's *published* ceiling back onto the same block every tick. If we multiplied
   * the value we found there, the ceiling would compound tick over tick and run away to the
   * absolute bound. So the multiplier is ALWAYS applied to a freshly resolved base
   * (`resolveTravelCeiling(profile)`), never to the current field.
   *
   * For the same reason we must write on EVERY tick the block exists, including with mult = 1
   * outside a lane: writing nothing would leave the last boosted ceiling sticky forever through
   * that same feedback path. Writing base×1 outside a lane is indistinguishable from the drive's
   * natural behaviour, so this is safe as well as necessary.
   *
   * We never touch `cap` — that is the carried ramp state, owned by the input↔kernel round trip.
   */
  _applyDriveModifier(state, player, boosting) {
    const drive = state.input && state.input.travelDrive;
    // No block means the travel-drive axis is off (flag or latch); there is nothing to modify, and
    // fabricating one here would make this system a second owner of an axis it does not own.
    if (!drive || typeof drive !== 'object') return;

    let base = 0;
    try {
      base = resolveTravelCeiling(resolvePropulsionProfile(player, state));
    } catch {
      base = 0;
    }
    if (!(base > 0)) return;

    const ceilingMult = boosting ? Math.max(1, finite(this.lane.ceilingMult, 1)) : 1;
    const rampMult = boosting ? Math.max(1, finite(this.lane.rampMult, 1)) : 1;
    drive.ceiling = base * ceilingMult;
    drive.rampMult = rampMult;
  },

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // the dropout — one boolean, and the shipped machinery does the rest
  // ─────────────────────────────────────────────────────────────────────────────────────────────

  /**
   * Hold or release the LEVEL disruption flag `input.js` already reads.
   *
   * The level flag is the correct one of the two seams input.js exposes. `disruptRequest` is a
   * one-shot that input.js clears each tick — it would knock the drive out once and then let the
   * cooldown timer expire underneath the player while they are still sitting inside the dead
   * segment. `disrupted` is held, and input.js's cooldown branch resets `cooldownT = 0` for as long
   * as it is held, so the drive genuinely cannot re-engage until the ship physically leaves. That is
   * precisely D8's "recovery means physically reaching the next intact segment" — enforced by a
   * boolean rather than by new logic.
   *
   * Hung off `state.player`, lazily. That is where input.js looks, and it follows the shipped
   * `state.player.masslineTelemetry` idiom rather than widening the gameState initial literal.
   */
  _applyDisruption(state, disrupted) {
    const p = state.player;
    if (!p) return;
    if (!disrupted) {
      // Only clear what we set. Never invent the subtree just to write false into it.
      if (p.travelDrive && p.travelDrive.disrupted === true) p.travelDrive.disrupted = false;
      return;
    }
    const drive = p.travelDrive || (p.travelDrive = {});
    drive.disrupted = true;
  },

  /**
   * Place the pirates at the dead beacon through the existing director.
   *
   * THE SECTOR IS THE TRAP HERE. `requestAuthoredEncounter` hard-returns `wrong_sector` unless the
   * sector it is handed is the one the player currently occupies. Mid-chord the player is not "in
   * Helios" in any authored sense — they are in a Voronoi cell — so the sector is computed from the
   * dead beacon's own global position via `sectorMembershipAtGlobal`, the same function the
   * residency planner uses. Passing the lane's origin sector blindly would silently produce no
   * pirates at all on any segment past the bisector.
   *
   * The encounter id is stable and derived from the lane and segment, so a re-request after a
   * reload is idempotent — the director returns `{ ok: true, reused: true }` rather than
   * double-spawning. Live encounters are deliberately not saved, so an ambush the player fled and
   * returned to is correctly re-placed: the dead beacon is still dead.
   */
  _requestAmbush(state, segment) {
    const key = `${this.lane.id}:${segment.index}`;
    if (this._ambushRequested.has(key)) return;
    const director = this.registry && typeof this.registry.get === 'function'
      ? this.registry.get('encounterDirector')
      : null;
    if (!director || typeof director.requestAuthoredEncounter !== 'function') return;

    const anchor = segment.midpoint;
    const sectorId = sectorMembershipAtGlobal(anchor);
    if (!sectorId) return;

    const result = director.requestAuthoredEncounter({
      shapeId: this.lane.ambushShapeId,
      encounterId: `lane_ambush_${this.lane.id}_${segment.index}`,
      sectorId,
      anchor: { x: anchor.x, z: anchor.z },
      zoneId: `${this.lane.id}_seg${segment.index}`,
      zoneName: `${this.lane.name} — dead segment ${segment.index}`,
      zoneType: 'ambush_lane',
      zoneRadius: this.geometry.radiusWU,
      force: true,
      data: { laneId: this.lane.id, laneSegmentIndex: segment.index },
    });
    // Only latch on success. A `wrong_sector` rejection while the player is still crossing into the
    // cell must be retried on a later tick, not silently swallowed forever.
    if (result && result.ok) {
      this._ambushRequested.add(key);
      this._emit('lane:disrupted', {
        laneId: this.lane.id,
        segmentIndex: segment.index,
        encounterId: result.encounterId || null,
        anchor: { x: anchor.x, z: anchor.z },
        sectorId,
      });
    }
  },

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // physical infrastructure — lazily spawned, hard-capped, never churning
  // ─────────────────────────────────────────────────────────────────────────────────────────────

  /**
   * Materialize beacons near the player, one chain link at a time.
   *
   * Lazy by range (the 47a recipe) so a long chain never spawns eagerly. Once materialized a beacon
   * is LEFT IN PLACE rather than despawned: the chain is 14 entities, and despawning would mean
   * reproducing world.js's `entityList` / `freeIds` / `entity:destroyed` bookkeeping in a system
   * that does not own it. A bounded roster that never churns is both cheaper at runtime and a
   * smaller ownership footprint than a spawn/despawn cycle — no allocation after warm-up, and no
   * second writer on world's entity table.
   *
   * Entity ids are re-checked against `state.entities` every pass, so if world's residency manager
   * removes one during a sector transition it is simply re-materialized when the player returns.
   */
  _updateBeacons(state, player) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return;
    const entities = state.entities;
    if (!entities) return;

    // Drop bookkeeping for anything that no longer exists (residency sweep, sector change).
    for (const [index, id] of this._beaconIds) {
      if (!entities.get || !entities.get(id)) this._beaconIds.delete(index);
    }
    if (this._beaconIds.size >= BEACON_MAX_ACTIVE) return;

    const px = finite(player.pos.x);
    const pz = finite(player.pos.z);
    for (const beacon of this.geometry.beacons) {
      if (this._beaconIds.has(beacon.index)) continue;
      const dx = beacon.pos.x - px;
      const dz = beacon.pos.z - pz;
      if (dx * dx + dz * dz > BEACON_SPAWN_RANGE_WU * BEACON_SPAWN_RANGE_WU) continue;

      // A beacon is dead if EITHER adjoining segment is disrupted — the physical tell that the
      // pilot reads before the drive drops, so the dropout is foreshadowed rather than arbitrary.
      const dead = this.geometry.segments.some(
        (s) => s.disrupted && (s.a.index === beacon.index || s.b.index === beacon.index),
      );
      const ent = spawnEntity({
        type: 'beacon',
        pos: { x: beacon.pos.x, z: beacon.pos.z },
        vel: { x: 0, z: 0 },
        radius: 14,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        data: {
          parentType: 'story_prop',
          scanLabel: dead
            ? `${this.lane.name} beacon ${beacon.index} — OFFLINE`
            : `${this.lane.name} beacon ${beacon.index}`,
          laneId: this.lane.id,
          laneBeaconIndex: beacon.index,
          laneBeaconDead: dead,
          tetherable: false,
        },
      });
      if (ent && ent.id != null) this._beaconIds.set(beacon.index, ent.id);
      if (this._beaconIds.size >= BEACON_MAX_ACTIVE) break;
      // One spawn per tick keeps the materialization cost flat instead of bursting a whole chain
      // into one frame as the player arrives.
      break;
    }
  },

  /**
   * Lane traffic — other ships using the same route (D8 acceptance item 3).
   *
   * CLOSED-FORM, NOT INTEGRATED. Each hauler's distance along the chord is a pure function of
   * `state.simTime` and its own index, wrapped modulo the chord length. That buys three things at
   * once: it is exactly reproducible after a save/load with no persisted traffic state, it holds no
   * per-entity accumulator that could drift, and it costs one multiply and one modulo per hauler
   * per tick regardless of density (acceptance item 9). No steering math, no AI, no spawn-budget
   * contention — these are the lane's own infrastructure traffic, and this system writes only its
   * own entities' positions.
   */
  _updateTraffic(state, player) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return;
    const entities = state.entities;
    if (!entities || !entities.get) return;
    const geometry = this.geometry;
    const length = geometry.lengthWU;
    if (!(length > 0)) return;

    const simTime = finite(state.simTime, 0);
    const px = finite(player.pos.x);
    const pz = finite(player.pos.z);

    for (let i = 0; i < TRAFFIC_COUNT; i++) {
      // Deterministic stagger: evenly spaced phases, alternating direction so the lane reads as
      // two-way infrastructure rather than a conveyor.
      const outbound = i % 2 === 0;
      const phase = (i / TRAFFIC_COUNT) * length;
      const travelled = (phase + simTime * TRAFFIC_SPEED_WU_S) % length;
      const along = outbound ? travelled : length - travelled;
      const pos = {
        x: geometry.from.x + geometry.axis.x * along,
        z: geometry.from.z + geometry.axis.z * along,
      };

      const dx = pos.x - px;
      const dz = pos.z - pz;
      const near = dx * dx + dz * dz <= TRAFFIC_SPAWN_RANGE_WU * TRAFFIC_SPAWN_RANGE_WU;

      const existingId = this._trafficIds[i];
      const existing = existingId != null ? entities.get(existingId) : null;
      if (existing) {
        // Reposition in place. Entities are never destroyed, so density is constant by construction.
        existing.pos.x = pos.x;
        existing.pos.z = pos.z;
        if (existing.rot != null) {
          existing.rot = Math.atan2(
            outbound ? geometry.axis.z : -geometry.axis.z,
            outbound ? geometry.axis.x : -geometry.axis.x,
          );
        }
        continue;
      }
      if (!near) continue;
      const ent = spawnEntity({
        type: 'freighter',
        pos,
        vel: { x: 0, z: 0 },
        radius: 12,
        mass: 1e5,
        hull: 60,
        hullMax: 60,
        data: {
          parentType: 'lane_traffic',
          scanLabel: `${this.lane.name} hauler`,
          laneId: this.lane.id,
          laneTrafficIndex: i,
        },
      });
      if (ent && ent.id != null) this._trafficIds[i] = ent.id;
    }
  },

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // the published contract (D8 acceptance item 7)
  // ─────────────────────────────────────────────────────────────────────────────────────────────

  /**
   * Publish the lane readout for the Atlas and Navigation contracts.
   *
   * This is a PRODUCER. It emits `nav:laneStatus` and maintains a queryable `state.travelLanes`
   * subtree in one stable shape, so a map or HUD consumer reads one address instead of reaching
   * into lane internals. Drawing the segment chain on the chart belongs to a map-owning packet —
   * `src/ui/galaxyMap.js` is neither owned by this packet nor safe to widen (D9.2), so this lands
   * the producer and says so plainly rather than claiming the consumer.
   *
   * Emitted on CHANGE, not per tick: a per-tick nav event would be noise on the bus and would make
   * the event trace unreadable at exactly the moment travel is interesting.
   */
  _publish(state, fix, disrupted, boosting) {
    const geometry = this.geometry;
    const recovery = disrupted ? nextIntactBeacon(geometry, fix.alongWU) : null;
    const driveBlock = state.input && state.input.travelDrive;
    const status = {
      schema: TRAVEL_LANE_SCHEMA,
      laneId: this.lane.id,
      name: this.lane.name,
      fromSectorId: this.lane.fromSectorId,
      toSectorId: this.lane.toSectorId,
      inLane: fix.inLane,
      alongWU: fix.alongWU,
      offAxisWU: fix.offAxisWU,
      progress: fix.progress,
      segmentIndex: fix.segmentIndex,
      segmentCount: geometry.segments.length,
      beaconCount: geometry.beacons.length,
      segmentState: fix.segment ? (fix.segment.disrupted ? 'disrupted' : 'intact') : null,
      disrupted,
      boosted: boosting,
      ceilingMult: boosting ? this.lane.ceilingMult : 1,
      rampMult: boosting ? this.lane.rampMult : 1,
      driveState: driveBlock && typeof driveBlock.state === 'string' ? driveBlock.state : 'off',
      recoveryBeaconIndex: recovery ? recovery.index : null,
      recoveryBeaconPos: recovery ? { x: recovery.pos.x, z: recovery.pos.z } : null,
      beaconsActive: this._beaconIds.size,
      trafficActive: this._trafficIds.filter((id) => id != null).length,
    };
    state.travelLanes = status;

    const signature = `${status.inLane}|${status.segmentIndex}|${status.segmentState}|${status.boosted}|${status.disrupted}|${status.driveState}`;
    if (signature === this._lastSignature) return;
    this._lastSignature = signature;
    this._emit('nav:laneStatus', status);
  },

  _emit(event, payload) {
    const bus = this.bus;
    if (bus && typeof bus.emit === 'function') bus.emit(event, payload);
  },
};

export default travelLanes;
