// VFX NEXT — families 5 and 6: boost/thruster transition, extreme-speed flight.
//
// Both are SUSTAINED families: stage.hold(id, force) every frame with live state, stage.release(id)
// when the state ends. They are the two places where the library reads a continuous value rather
// than an event, so they are also where "effects follow game state" is easiest to verify — drag the
// lab's throttle slider and the plume must change STRUCTURE, not just brightness.
//
// The brief's requirement for the thruster is specific: length, structure AND turbulence all change
// under boost. Three separate channels, because a plume that only gets longer reads as a stretched
// sprite, and one that only gets brighter reads as a lamp. Here:
//   length     -> particle speed x lifetime
//   structure  -> cone half-angle narrows, and shock beads appear only above the boost threshold
//   turbulence -> lateral jitter amplitude and per-particle drag spread
//
// STATE CAVEAT: these family objects hold their own emission accumulators, so one held instance per
// family id is supported — which is what the lab and a single player ship need. Promotion to a
// fleet-wide system requires moving `_acc` into per-emitter state; the accumulator is the only
// thing in the way, and it is called out here so the future integrator finds it before shipping it.

import { KIND_FLASH, KIND_SPARK } from '../core/gpuAged.js';
import { coneSample, hash01 } from '../core/force.js';

const _dir = new Float32Array(3);

/** Fractional-rate emitter. Accumulates dt*rate and emits the whole part, so a 90 Hz emission rate
 *  stays 90 Hz at 30, 60 or 144 fps instead of silently becoming a per-frame count. */
function emitCount(family, rate, dt, cap = 24) {
  family._acc += rate * dt;
  const n = Math.floor(family._acc);
  family._acc -= n;
  return Math.min(n, cap);
}

export const thrusterBoost = {
  id: 'thruster_boost',
  title: 'Boost / thruster transition',
  // Sustained budget is stated as STEADY-STATE OCCUPANCY, not per-emit: at full boost this family
  // holds ~170 sparks alive at once out of 2048. Eight boosting ships fit inside the pool.
  budget: { sparks: 170, smoke: 0, debris: 0, fronts: 0, ribbons: 2, lights: 1 },
  _acc: 0,
  _ribbon: -1,
  _beadPhase: 0,
  _lightAt: 0,

  begin(stage) { this._acc = 0; this._ribbon = -1; this._beadPhase = 0; this._lightAt = 0; },

  end(stage) { this._ribbon = -1; },

  /** `severity` is throttle 0..1. Boost is the top of that range; the transition is continuous so a
   *  reviewer can see the exact point where the plume changes character. */
  tick(stage, f, dt, now) {
    const throttle = Math.max(0, Math.min(1, f.severity));
    if (throttle <= 0.01) return;
    const boost = Math.max(0, (throttle - 0.62) / 0.38); // 0 below the knee, 1 at full boost
    const scale = f.radius;

    // Exhaust travels along -dir (dir is the thrust vector, i.e. where the ship is being pushed).
    const ex = -f.dx, ey = -f.dy, ez = -f.dz;

    // --- structure: the cone narrows and the exhaust accelerates under boost ---
    const spread = 0.34 - boost * 0.20;
    const speed = (34 + throttle * 60) * (1 + boost * 1.5);
    const life = (0.16 + throttle * 0.13) * (1 + boost * 0.55);
    const turbulence = 0.16 + boost * 0.55;

    const rate = 60 + throttle * 90 + boost * 90;
    const n = emitCount(this, rate * stage.quality, dt);
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(now * 1000) + i;
      coneSample(_dir, ex, ey, ez, spread, f.seed, idx);
      // Turbulence as a lateral velocity perturbation rather than a noise texture: it survives
      // bloom-off and grayscale, which a scrolling noise texture does not.
      const jx = (hash01(f.seed, idx + 11) - 0.5) * turbulence * speed;
      const jy = (hash01(f.seed, idx + 12) - 0.5) * turbulence * speed;
      const jz = (hash01(f.seed, idx + 13) - 0.5) * turbulence * speed;
      const s2 = speed * (0.7 + hash01(f.seed, idx + 14) * 0.6);
      stage.sparks.spawn(now, {
        x: f.px, y: f.py, z: f.pz,
        vx: f.vx + _dir[0] * s2 + jx, vy: f.vy + _dir[1] * s2 + jy, vz: f.vz + _dir[2] * s2 + jz,
        life: life * (0.7 + hash01(f.seed, idx + 15) * 0.6),
        size0: scale * (0.34 + boost * 0.16), size1: scale * 0.05,
        // Core stays near-white and only the sheath shifts with boost. Recolouring the core is how
        // a thruster ends up looking like a different engine instead of the same engine working
        // harder.
        colorA: 0xf2f9ff,
        colorB: boost > 0.05 ? 0x8a5cff : f.sheathColor,
        kind: KIND_SPARK, seed: hash01(f.seed, idx + 16),
        drag: 3.4 - boost * 1.6 + hash01(f.seed, idx + 17) * 1.4,
        priority: 0.6 + throttle,
      });
    }

    // --- the spine: one ribbon refreshed each frame, nozzle to plume tip ---
    const len = scale * (2.2 + throttle * 3.0) * (1 + boost * 1.35);
    if (this._ribbon < 0 || !stage.ribbons.alive[this._ribbon]) {
      this._ribbon = stage.ribbons.spawn({
        x: f.px, y: f.py, z: f.pz, life: 3600, width: scale * 0.5,
        colorHead: 0xffffff, colorTail: 0x2a44ff, priority: 5, mode: 1,
      });
    }
    if (this._ribbon >= 0) {
      const c = this._ribbon * 6;
      stage.ribbons.cfg[c + 1] = 0;                                  // hold it alive
      stage.ribbons.cfg[c + 2] = scale * (0.45 + throttle * 0.35) * (1 + boost * 0.5);
      stage.ribbons.cfg[c + 5] = 2;                                  // externally driven
      const i3 = this._ribbon * 3;
      stage.ribbons.colTail[i3] = boost > 0.05 ? 0.42 : 0.15;
      stage.ribbons.colTail[i3 + 1] = 0.16;
      stage.ribbons.colTail[i3 + 2] = 1.0;
      // A little shiver along the spine at high boost: the plume is not a rigid cone.
      stage.ribbons.setSegment(
        this._ribbon,
        f.px, f.py, f.pz,
        f.px + ex * len, f.py + ey * len, f.pz + ez * len,
        1, 0,
        scale * 0.10 * boost, 3.5, now * 26,
      );
    }

    // --- shock beads: the structural tell that this is BOOST and not just more throttle ---
    if (boost > 0.08) {
      this._beadPhase += dt * (6 + boost * 10);
      const beads = 3;
      for (let b = 0; b < beads; b++) {
        const along = (0.28 + b * 0.24) * len;
        const pulse = 0.6 + 0.4 * Math.sin(this._beadPhase + b * 1.7);
        stage.sparks.spawn(now, {
          x: f.px + ex * along, y: f.py + ey * along, z: f.pz + ez * along,
          vx: f.vx + ex * speed * 0.25, vy: f.vy + ey * speed * 0.25, vz: f.vz + ez * speed * 0.25,
          life: 0.075,
          size0: scale * (0.62 - b * 0.11) * boost * pulse,
          size1: scale * (0.30 - b * 0.06) * boost * pulse,
          colorA: 0xffffff, colorB: 0x9a6cff,
          kind: KIND_FLASH, seed: hash01(f.seed, b + 800), priority: 2,
        });
      }
    }

    // --- one light, rate-limited. A per-frame light spawn would churn the pool and starve every
    // other family; 20 Hz is invisible in motion and leaves headroom. ---
    if (now - this._lightAt > 0.05) {
      this._lightAt = now;
      stage.lights.spawn({
        x: f.px + ex * scale, y: f.py + ey * scale, z: f.pz + ez * scale,
        color: boost > 0.05 ? 0x9a7cff : 0x66aaff,
        peak: 8 + throttle * 22 + boost * 30, life: 0.08,
        distance: scale * (24 + throttle * 40), priority: 0.5, falloff: 'linear',
      });
    }
  },
};

export const speedExtreme = {
  id: 'speed_extreme',
  title: 'Extreme-speed flight',
  budget: { sparks: 240, smoke: 0, debris: 0, fronts: 1, ribbons: 14, lights: 0 },
  _acc: 0,
  _ribAcc: 0,
  _frontAt: 0,

  begin() { this._acc = 0; this._ribAcc = 0; this._frontAt = 0; },

  /** `severity` is 0..1 of the speed band where streaks are wanted; `v` is the real velocity, and
   *  every streak is placed and aimed from it. */
  tick(stage, f, dt, now) {
    const sev = Math.max(0, Math.min(1, f.severity));
    if (sev <= 0.02) return;
    const spd = Math.hypot(f.vx, f.vy, f.vz);
    if (spd < 1) return;
    const hx = f.vx / spd, hy = f.vy / spd, hz = f.vz / spd;
    const scale = f.radius;

    // Basis perpendicular to the heading — streaks are placed in an ANNULUS around the flight axis.
    let ux = 0, uy = 1, uz = 0;
    if (Math.abs(hy) > 0.9) { ux = 1; uy = 0; uz = 0; }
    let rx = uy * hz - uz * hy, ry = uz * hx - ux * hz, rz = ux * hy - uy * hx;
    const rm = Math.hypot(rx, ry, rz) || 1;
    rx /= rm; ry /= rm; rz /= rm;
    const bx = hy * rz - hz * ry, by = hz * rx - hx * rz, bz = hx * ry - hy * rx;

    // THE PLAYFIELD RULE. Nothing spawns inside `clear`, so the volume the player is actually
    // flying and shooting through stays empty no matter how fast they go. Speed lines that cross
    // the centre of frame are the reason most speed effects get turned off by players.
    const clear = scale * 3.4;
    const outer = clear + scale * (7 + sev * 16);
    const ahead = scale * (10 + sev * 26);

    const n = emitCount(this, (40 + sev * 220) * stage.quality, dt, 40);
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(now * 1000) + i * 7;
      const ang = hash01(f.seed, idx + 1) * Math.PI * 2;
      // sqrt keeps the annulus area-uniform; without it everything crowds the inner edge.
      const t = Math.sqrt(hash01(f.seed, idx + 2));
      const rad = clear + (outer - clear) * t;
      const along = ahead * (0.4 + hash01(f.seed, idx + 3) * 1.2);
      const ca = Math.cos(ang) * rad, sa = Math.sin(ang) * rad;
      const px = f.px + hx * along + rx * ca + bx * sa;
      const py = f.py + hy * along + ry * ca + by * sa;
      const pz = f.pz + hz * along + rz * ca + bz * sa;

      // Streaks move BACKWARD relative to the ship. In world terms they are near-stationary motes
      // the ship is overtaking, which is both physically honest and why they read as speed.
      const rel = -(spd * (0.75 + hash01(f.seed, idx + 4) * 0.5));
      stage.sparks.spawn(now, {
        x: px, y: py, z: pz,
        vx: f.vx + hx * rel, vy: f.vy + hy * rel, vz: f.vz + hz * rel,
        life: 0.22 + hash01(f.seed, idx + 5) * 0.28,
        size0: scale * 0.10, size1: scale * 0.04,
        colorA: 0xdfeaff, colorB: 0x2a4cff,
        kind: KIND_SPARK, seed: hash01(f.seed, idx + 6),
        drag: 0, priority: 0.4,
      });
    }

    // A handful of long ribbons at the outer radius. Fewer, longer and dimmer than the sparks —
    // they supply the sense of a tunnel without becoming the tunnel.
    this._ribAcc += (2 + sev * 10) * dt;
    while (this._ribAcc >= 1) {
      this._ribAcc -= 1;
      const idx = Math.floor(now * 997);
      const ang = hash01(f.seed, idx + 21) * Math.PI * 2;
      const rad = outer * (0.75 + hash01(f.seed, idx + 22) * 0.35);
      const along = ahead * (0.8 + hash01(f.seed, idx + 23) * 0.8);
      const ca = Math.cos(ang) * rad, sa = Math.sin(ang) * rad;
      const rel = -(spd * 0.9);
      stage.ribbons.spawn({
        x: f.px + hx * along + rx * ca + bx * sa,
        y: f.py + hy * along + ry * ca + by * sa,
        z: f.pz + hz * along + rz * ca + bz * sa,
        vx: f.vx + hx * rel, vy: f.vy + hy * rel, vz: f.vz + hz * rel,
        life: 0.5, width: scale * 0.11, drag: 0,
        colorHead: 0xbcd4ff, colorTail: 0x101a4a, priority: 0.3,
      });
    }

    // At the very top of the band, a faint compression cap ahead of the hull. It is deliberately
    // subtle: this is a speed cue, not reentry, and the two must not read the same.
    if (sev > 0.72 && now - this._frontAt > 0.12) {
      this._frontAt = now;
      stage.fronts.spawnFront(now, {
        x: f.px + hx * scale * 2.4, y: f.py + hy * scale * 2.4, z: f.pz + hz * scale * 2.4,
        vx: f.vx, vy: f.vy, vz: f.vz,
        life: 0.24,
        size0: scale * 1.6, size1: scale * 3.4,
        colorA: 0x9fc4ff, colorB: 0x18306a,
        axisX: hx, axisY: hy, axisZ: hz,
        seed: hash01(f.seed, 99), priority: 1,
        thickness: 0.1, mode: 0,
      });
    }
  },
};

// Neither propulsion family sheds embers, and that is a deliberate reservation: cinders read as
// DAMAGE. Keeping them out of the healthy-engine vocabulary is what lets a damaged drive be built
// later by simply adding them.
export const PROPULSION_FAMILIES = [thrusterBoost, speedExtreme];
