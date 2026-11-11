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
//   expected = lastDrawn + velocity·dt
//   jump = r − expected
//   if |jump| > POSE_CONTINUITY_JUMP_WU: absorb it — draw the expected continuation
//   else: heal — the carried offset decays and the drawn pose glides back onto r
//   if |o| > POSE_CONTINUITY_TELEPORT_WU: a real teleport — reset o and draw r
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
/**
 * While the carried offset heals, the drawn pose may drift back toward the raw stream —
 * but only at a crawl, so a heal never reads as the flicker this module exists to hide.
 */
export const POSE_CONTINUITY_HEAL_REGRESS_WU = 0.25;
/**
 * The same bound on the way back: a lagging residual rejoins the raw stream as a mild
 * catch-up glide, never a forward leap. Cap = this share of the frame's own flight step…
 */
export const POSE_CONTINUITY_HEAL_FORWARD = 1.2;
/**
 * …or this share of the TYPICAL DRAWN step (the running mean of significant forward
 * progress), whichever is smaller. A starved frame that presents a quarter-second of
 * flight must spread that catch-up over a few frames as a surge — drawn whole, the leap
 * is the other half of the flicker this module exists to hide. The mean reads the run's
 * overall step scale — speed changes inside a run do not silently widen the bound.
 */
export const POSE_CONTINUITY_HEAL_FORWARD_TYPICAL = 1.4;
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
        yaw: 0, vyaw: 0, oyaw: 0, stepSum: 0, stepCount: 0,
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
    rec.stepSum = 0;
    rec.stepCount = 0;
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
      // expected = lastDrawn + velocity·dt — the continuation the PREVIOUS frame committed
      // to. This frame's own raw delta joins the estimate only after the judgment, so a
      // snap cannot dilute its own correction.
      const ex = rec.x + rec.vx * dt;
      const ez = rec.z + rec.vz * dt;
      const jx = x - ex;
      const jz = z - ez;
      const spd = Math.hypot(rec.vx, rec.vz);
      const teleport = Math.max(POSE_CONTINUITY_TELEPORT_WU, spd * POSE_CONTINUITY_TELEPORT_S);
      const teleport2 = teleport * teleport;
      // Teleport = the RAW STREAM's own surprise: the stream leaping past its own
      // continuation (respawn, dock, sector hop). Measuring jump against the drawn pose
      // would fold the carried residual into the judgment — a lagging offset plus an
      // ordinary catch-up then reads as a hop and lands the lag as one leap.
      const sx = x - rec.rawX - rec.vx * dt;
      const sz = z - rec.rawZ - rec.vz * dt;
      if (sx * sx + sz * sz > teleport2) {
        return snap(rec, x, z, rYaw, out);
      }
      // The stream's own motion axis for this frame: the raw delta when it has one —
      // during a reversal (a bounce) that direction is already the new heading — else the
      // presented heading (world.forward = (cos(rot), sin(rot)); the packed quaternion
      // negates it: rYaw = −rot, so forward = (cos(rYaw), −sin(rYaw))), else smoothed
      // velocity. The metric and the camera both read motion in the stream's direction.
      const rdx = x - rec.rawX;
      const rdz = z - rec.rawZ;
      const rd = Math.hypot(rdx, rdz);
      let fx = 0;
      let fz = 0;
      if (rd > 1e-6) {
        fx = rdx / rd;
        fz = rdz / rd;
      } else if (Number.isFinite(rYaw)) {
        fx = Math.cos(rYaw);
        fz = -Math.sin(rYaw);
      } else if (spd > 1e-3) {
        fx = rec.vx / spd;
        fz = rec.vz / spd;
      }
      const decay = Math.exp(-dt / POSE_CONTINUITY_DECAY_S);
      if (jx * jx + jz * jz > POSE_CONTINUITY_JUMP_WU * POSE_CONTINUITY_JUMP_WU) {
        // Correction or veer? A fence correction lands the stream back along its own line
        // of flight — the jump is mostly anti-parallel to motion. A real turn arcs the
        // stream sideways — the jump is mostly lateral, and absorbing it would hide the
        // turn itself (the drawn hull then slides against the new heading — the same
        // flicker, rotated).
        const jPar = jx * fx + jz * fz;
        const jLat = Math.abs(jz * fx - jx * fz);
        if (jLat > Math.abs(jPar)) {
          rec.ox *= decay;
          rec.oz *= decay;
        } else {
          rec.ox = ex - x;
          rec.oz = ez - z;
        }
      } else {
        rec.ox *= decay;
        rec.oz *= decay;
        // The heal is asymptotic — retire the residual once it is sub-perceptual so the
        // quiet drawn pose rejoins the raw stream exactly instead of creeping forever.
        if (rec.ox * rec.ox + rec.oz * rec.oz
            < POSE_CONTINUITY_SETTLE_WU * POSE_CONTINUITY_SETTLE_WU) {
          rec.ox = 0;
          rec.oz = 0;
        }
      }
      // A residual that grew past the bound is accumulated divergence, not a teleport —
      // snapping it would land the whole offset as one leap, the very flicker this module
      // hides. Clamp at the bound and keep healing; the drawn pose may ride at the bounded
      // offset until the stream closes it.
      {
        const oMag = Math.hypot(rec.ox, rec.oz);
        if (oMag > teleport) {
          const s = teleport / oMag;
          rec.ox *= s;
          rec.oz *= s;
        }
      }
      let drawnX = x + rec.ox;
      let drawnZ = z + rec.oz;
      // Monotone-progress clamp: while an absorbed residual heals, the drawn pose must not
      // slide back along its flight direction faster than a crawl — that slide is the same
      // flicker, stretched. Rare (needs |o| ≫ the raw step); stalls instead of stepping.
      // The forward side is capped the same way: a lagging offset heals as a catch-up
      // glide, never a leap. Lateral slide is bounded too — a stale offset shedding during
      // a turn must not swing the hull sideways faster than a drift.
      let stepFwd = 0;
      if (fx !== 0 || fz !== 0) {
        const dx = drawnX - rec.x;
        const dz = drawnZ - rec.z;
        const progress = dx * fx + dz * fz;
        const lateral = dx * -fz + dz * fx;
        let pull = 0;
        let latPull = 0;
        if (progress < -POSE_CONTINUITY_HEAL_REGRESS_WU) {
          pull = -POSE_CONTINUITY_HEAL_REGRESS_WU - progress;
        } else {
          const stepTyp = rec.stepCount > 0 ? rec.stepSum / rec.stepCount : spd * dt;
          const forwardCap = Math.min(
            spd * dt * POSE_CONTINUITY_HEAL_FORWARD,
            stepTyp * POSE_CONTINUITY_HEAL_FORWARD_TYPICAL,
          ) + POSE_CONTINUITY_HEAL_FORWARD_WU;
          if (progress > forwardCap) pull = forwardCap - progress;
        }
        if (Math.abs(lateral) > POSE_CONTINUITY_HEAL_LATERAL_WU) {
          latPull = Math.sign(lateral) * POSE_CONTINUITY_HEAL_LATERAL_WU - lateral;
        }
        if (pull !== 0 || latPull !== 0) {
          drawnX += fx * pull - fz * latPull;
          drawnZ += fz * pull + fx * latPull;
          rec.ox = drawnX - x;
          rec.oz = drawnZ - z;
        }
        stepFwd = Math.max(0, (drawnX - rec.x) * fx + (drawnZ - rec.z) * fz);
      }
      // Heading: same absorb-and-heal on the yaw channel, wrap-aware.
      const ivYaw = wrapPi(rYaw - rec.rawYaw) / dt;
      const wasYawVelSeeded = rec.yawVelSeeded;
      if (!wasYawVelSeeded) {
        rec.vyaw = ivYaw; rec.yawVelSeeded = true;
      }
      const eYaw = rec.yaw + rec.vyaw * dt;
      const jYaw = wrapPi(rYaw - eYaw);
      if (Math.abs(jYaw) > POSE_CONTINUITY_YAW_JUMP_RAD) {
        rec.oyaw = wrapPi(eYaw - rYaw);
      } else {
        rec.oyaw *= decay;
      }
      // The frame's raw deltas now join the smoothed estimates for the NEXT frame.
      const k = 1 - Math.exp(-dt / POSE_CONTINUITY_VEL_TAU_S);
      if (wasVelSeeded) {
        rec.vx += (ivx - rec.vx) * k;
        rec.vz += (ivz - rec.vz) * k;
      }
      if (wasYawVelSeeded) rec.vyaw += (ivYaw - rec.vyaw) * k;
      // Typical drawn forward-step estimate for the forward cap — folded in AFTER the
      // clamp so an outlier step cannot inflate the bound it is measured against, and only
      // over significant steps (the same population the metric medians): quiet frames must
      // not drag the cap down into a persistent lag. The folded value is bounded by the
      // teleport floor so a real hop cannot pollute the run's step scale.
      if (stepFwd > POSE_CONTINUITY_JUMP_WU) {
        rec.stepSum += Math.min(stepFwd, POSE_CONTINUITY_TELEPORT_WU);
        rec.stepCount += 1;
      }
      rec.x = drawnX;
      rec.z = drawnZ;
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
