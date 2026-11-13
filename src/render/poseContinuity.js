// Drawn-pose continuity (PERF-02a): the player's hull never steps backwards on screen.
//
// The snapshot fence presents the sim's recorded playback: between packs it extrapolates
// each pose (up to PRESENTATION_EXTRAPOLATION_S), and when a late pack lands BEHIND the
// guess the raw presented position steps back — the "snake's tongue" flicker the owner
// reported. Every other body absorbs that correction quietly, but the player's hull is
// the picture's anchor: the chase camera follows the drawn mesh position, so the whole
// view flicked with it. This module keeps, per entity, the last DRAWN position and a
// smoothed velocity. Each frame, given the fence's raw presented position r:
//
// The fence sets the flight path and playout rate. Only a backward correction can create
// a new offset. Other frames follow the fence with bounded decay of any existing offset.
//
// Heading gets the same treatment on the yaw channel, wrap-aware. Presentation only —
// nothing here writes back to sim fields; the fence's raw stream stays authoritative.

/** Corrections at or under this size pass through as drawn. */
export const POSE_CONTINUITY_JUMP_WU = 0.5;
/** A residual this large is a real teleport (respawn, dock, warp, sector change): snap. */
export const POSE_CONTINUITY_TELEPORT_WU = 40;
/**
 * Corrections scale with flight speed — a 40 WU bound misfires at cruise, where a late
 * pack legitimately lands farther behind the guess (a −45 WU correction was measured at
 * cruise under load, and the jump it makes versus the expected continuation is bigger
 * still). The real teleports this guard exists for (respawn, dock, sector hop) are
 * hundreds of WU, so "too big to be a correction" is also at least a second of current
 * travel — the 40 WU floor still covers a slow or parked hull.
 */
export const POSE_CONTINUITY_TELEPORT_S = 1.0;
/** Healing horizon for the absorbed offset. */
export const POSE_CONTINUITY_DECAY_S = 0.12;
/** EMA horizon for the smoothed velocity estimate. */
export const POSE_CONTINUITY_VEL_TAU_S = 0.15;
/** Same absorb threshold on the yaw channel. */
export const POSE_CONTINUITY_YAW_JUMP_RAD = (2 * Math.PI) / 180;
// Covers the fastest hull's 6.5 rad/s with both targeting and coast steering assist.
const POSE_CONTINUITY_YAW_RATE_RAD_S = 12;
/**
 * While the carried offset heals, the drawn pose may drift back toward the raw stream —
 * but only at a crawl, so a heal never reads as the flicker this module exists to hide.
 */
export const POSE_CONTINUITY_HEAL_REGRESS_WU = 0.25;
/**
 * A lagging residual can heal forward by a fraction of the current raw step plus a
 * small allowance. The raw step itself always passes through at its original length.
 */
const POSE_CONTINUITY_HEAL_FORWARD_SHARE = 0.2;
/** …plus this much, so a slow or parked hull can still drift back onto the stream. */
export const POSE_CONTINUITY_HEAL_FORWARD_WU = 0.3;
/**
 * The drawn pose may slide sideways at this rate at most — a stale residual shedding
 * during a turn must read as drift, never as the hull swinging off its heading. Under the
 * metric's own significance floor, a pure lateral slide can never count as a step back.
 */
export const POSE_CONTINUITY_HEAL_LATERAL_WU = 0.4;
/** A decaying residual under this size is retired whole — the pose has rejoined the stream. */
export const POSE_CONTINUITY_SETTLE_WU = 0.05;

const TWO_PI = Math.PI * 2;

function wrapPi(angle) {
  let a = (angle + Math.PI) % TWO_PI;
  if (a < 0) a += TWO_PI;
  return a - Math.PI;
}

/**
 * Per-entity drawn-pose smoother. One record per entity id: last drawn world pose,
 * smoothed velocity, and the residual offset the drawn pose currently carries.
 * No allocation on the per-frame path — records mint once per id.
 */
export function createPoseContinuity() {
  const records = new Map();

  function recordFor(id) {
    let rec = records.get(id);
    if (!rec) {
      rec = {
        x: 0, z: 0, vx: 0, vz: 0, ox: 0, oz: 0,
        yaw: 0, vyaw: 0, oyaw: 0,
        rawX: 0, rawZ: 0, rawYaw: 0,
        seeded: false, velSeeded: false, yawVelSeeded: false,
      };
      records.set(id, rec);
    }
    return rec;
  }

  function emit(rec, out) {
    out.x = rec.x;
    out.z = rec.z;
    out.yaw = rec.yaw;
    return out;
  }

  function snap(rec, x, z, yaw, out) {
    rec.ox = 0; rec.oz = 0; rec.oyaw = 0;
    rec.x = x; rec.z = z; rec.yaw = yaw;
    rec.rawX = x; rec.rawZ = z; rec.rawYaw = yaw;
    // The hop says nothing about the new stream's speed: re-seed from its first delta.
    rec.velSeeded = false;
    rec.yawVelSeeded = false;
    return emit(rec, out);
  }

  return {
    /**
     * One presented frame for one entity. `x`/`z`/`yaw` are the fence's raw presented
     * pose in WORLD units (callers with frame-local meshes add the frame origin in and
     * take it back out, so an origin rebase never reads as a ship step). `dt` is the
     * presentation-clock frame delta in seconds. `out` receives {x, z, yaw} — the pose
     * to draw — and is returned.
     */
    sample(id, x, z, yaw, dt, out) {
      const rec = recordFor(id);
      if (!(Number.isFinite(x) && Number.isFinite(z))) return emit(rec, out);
      const rYaw = Number.isFinite(yaw) ? yaw : rec.rawYaw;
      if (!rec.seeded) {
        rec.seeded = true;
        rec.x = x; rec.z = z; rec.yaw = rYaw;
        rec.rawX = x; rec.rawZ = z; rec.rawYaw = rYaw;
        return emit(rec, out);
      }
      if (!(dt > 0)) {
        // Frozen presentation clock: hold the residual, still follow the raw stream.
        rec.x = x + rec.ox; rec.z = z + rec.oz;
        rec.yaw = wrapPi(rYaw + rec.oyaw);
        rec.rawX = x; rec.rawZ = z; rec.rawYaw = rYaw;
        return emit(rec, out);
      }
      // Velocity estimate from the RAW stream — the drawn stream already contains o, so
      // sampling it would feed the offset back into the predictor. The first delta seeds
      // directly: an EMA from zero would read ordinary flight as one long jump.
      const ivx = (x - rec.rawX) / dt;
      const ivz = (z - rec.rawZ) / dt;
      const wasVelSeeded = rec.velSeeded;
      if (!wasVelSeeded) {
        rec.vx = ivx; rec.vz = ivz; rec.velSeeded = true;
      }
      const spd = Math.hypot(rec.vx, rec.vz);
      const teleport = Math.max(POSE_CONTINUITY_TELEPORT_WU, spd * POSE_CONTINUITY_TELEPORT_S);
      const teleport2 = teleport * teleport;
      // Teleport = the RAW STREAM's own surprise: the stream leaping past its own
      // continuation (respawn, dock, sector hop). Measuring jump against the drawn pose
      // would fold the carried residual into the judgment — a lagging offset plus an
      // ordinary catch-up then reads as a hop and lands the lag as one leap.
      const rdx = x - rec.rawX;
      const rdz = z - rec.rawZ;
      const sx = rdx - rec.vx * dt;
      const sz = rdz - rec.vz * dt;
      const shock2 = sx * sx + sz * sz;
      if (shock2 > teleport2) {
        return snap(rec, x, z, rYaw, out);
      }
      const decay = Math.exp(-dt / POSE_CONTINUITY_DECAY_S);
      const against = -(rdx * rec.vx + rdz * rec.vz);
      const lateralMotion = Math.abs(rdz * rec.vx - rdx * rec.vz);
      // Use the raw stream for the correction decision. A carried offset or the ship
      // accelerating into a turn must never create another offset by itself.
      if (against > lateralMotion && shock2 > POSE_CONTINUITY_JUMP_WU ** 2) {
        rec.ox = (rec.x + rec.vx * dt - x) * decay;
        rec.oz = (rec.z + rec.vz * dt - z) * decay;
        // A long frame decays more of the offset. Keep that decay from exposing
        // the correction as a reverse step in the direction we were moving.
        const advance = (x + rec.ox - rec.x) * rec.vx + (z + rec.oz - rec.z) * rec.vz;
        if (advance < 0) {
          const restore = -advance / (spd * spd);
          rec.ox += restore * rec.vx;
          rec.oz += restore * rec.vz;
        }
        const oMag = Math.hypot(rec.ox, rec.oz);
        if (oMag > teleport) {
          const s = teleport / oMag;
          rec.ox *= s;
          rec.oz *= s;
        }
      } else if (rec.ox !== 0 || rec.oz !== 0) {
        // Bound only the change in offset. Applying these limits to total movement
        // lets a low-speed opening permanently cap a later powered turn or straight.
        const rd = Math.hypot(rdx, rdz);
        const moving = rd > 1e-6;
        const fx = moving ? rdx / rd : Math.cos(rYaw);
        const fz = moving ? rdz / rd : -Math.sin(rYaw);
        const settle = Math.hypot(rec.ox, rec.oz) * decay < POSE_CONTINUITY_SETTLE_WU;
        const scale = settle ? -1 : decay - 1;
        const dx = rec.ox * scale;
        const dz = rec.oz * scale;
        const along = Math.max(moving ? -rd : -POSE_CONTINUITY_HEAL_REGRESS_WU,
          Math.min(rd * POSE_CONTINUITY_HEAL_FORWARD_SHARE + POSE_CONTINUITY_HEAL_FORWARD_WU, dx * fx + dz * fz));
        const across = Math.max(-POSE_CONTINUITY_HEAL_LATERAL_WU,
          Math.min(POSE_CONTINUITY_HEAL_LATERAL_WU, dz * fx - dx * fz));
        rec.ox += fx * along - fz * across;
        rec.oz += fz * along + fx * across;
        if (settle && Math.abs(rec.ox) + Math.abs(rec.oz) < 1e-9) rec.ox = rec.oz = 0;
      }
      // Apply the discontinuity test to the raw step. A difference from the predicted
      // heading alone also fires on ordinary turn input and can keep renewing a lag.
      const rawYawStep = wrapPi(rYaw - rec.rawYaw);
      const ivYaw = rawYawStep / dt;
      const wasYawVelSeeded = rec.yawVelSeeded;
      const yawJump = Math.abs(rawYawStep) > Math.max(
        POSE_CONTINUITY_YAW_JUMP_RAD, POSE_CONTINUITY_YAW_RATE_RAD_S * dt,
      );
      if (yawJump) {
        const predicted = rec.yaw + (wasYawVelSeeded ? rec.vyaw * dt : 0);
        rec.oyaw = wrapPi(predicted - rYaw);
      } else {
        rec.oyaw *= decay;
        if (!wasYawVelSeeded) {
          rec.vyaw = ivYaw;
          rec.yawVelSeeded = true;
        }
      }
      // The frame's raw deltas now join the smoothed estimates for the NEXT frame.
      const k = 1 - Math.exp(-dt / POSE_CONTINUITY_VEL_TAU_S);
      if (wasVelSeeded) {
        rec.vx += (ivx - rec.vx) * k;
        rec.vz += (ivz - rec.vz) * k;
      }
      if (wasYawVelSeeded && !yawJump) rec.vyaw += (ivYaw - rec.vyaw) * k;
      rec.x = x + rec.ox;
      rec.z = z + rec.oz;
      rec.yaw = wrapPi(rYaw + rec.oyaw);
      rec.rawX = x; rec.rawZ = z; rec.rawYaw = rYaw;
      return emit(rec, out);
    },
    /** Forget one entity (rebind, despawn); the next sample re-seeds from raw. */
    drop(id) { records.delete(id); },
    /** Forget everything (session reset). */
    clear() { records.clear(); },
    /** Current residual offset magnitude for an id — diagnostic for tests/probes. */
    offset(id) {
      const rec = records.get(id);
      return rec ? Math.hypot(rec.ox, rec.oz) : 0;
    },
  };
}
