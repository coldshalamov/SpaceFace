// VFX NEXT — family 12: atmospheric reentry.
//
// The only family with an arc rather than a state: it is authored to be driven by a `severity` that
// RAMPS from 0 to 1 over tens of seconds, and every channel is keyed off that one value so the whole
// event tells a story with a beginning and an end.
//
//   0.00-0.20  entry interface — thin leading-edge glow, no wake to speak of
//   0.20-0.55  established plasma — bright bow cap, long wake, hull begins to heat
//   0.55-0.80  peak heating — wake at full length, first fragments shed
//   0.80-1.00  breakup — the shed rate climbs, fragments carry their own trails, the wake forks
//
// FORCE RECORD MAPPING: pos = hull centre, v = relative velocity through the medium (this is the
// vector everything aligns to — the brief requires the wake to follow ACTUAL relative velocity, not
// a heading), radius = hull size, severity = the ramp above, seed = which hull this is.
//
// The bow cap is the piece worth understanding. Plasma stands OFF the leading edge — it is
// compressed medium ahead of the hull, not fire on the hull. Placing it forward by ~1.3 radii and
// giving it near-zero relative motion is what reads as a standing shock; attaching it to the hull
// reads as the ship being on fire, which is the same visual as a damaged drive and therefore a
// vocabulary collision.

import { KIND_FLASH, KIND_SPARK, KIND_EMBER, KIND_PUFF } from '../core/gpuAged.js';
import { MODE_PLANE } from '../core/solids.js';
import { coneSample, hash01 } from '../core/force.js';

const _dir = new Float32Array(3);

/** Heat colour ramp: dull orange -> yellow-white -> blue-white. Returns a packed hex. Reentry is
 *  one of the few places where hue genuinely encodes a physical quantity, so the ramp is authored
 *  rather than tinted, and it still reads in grayscale as plain brightness. */
function heatColor(k) {
  const t = Math.max(0, Math.min(1, k));
  let r, g, b;
  if (t < 0.5) {
    const u = t / 0.5;
    r = 1.0; g = 0.30 + u * 0.55; b = 0.06 + u * 0.30;
  } else {
    const u = (t - 0.5) / 0.5;
    r = 1.0 - u * 0.12; g = 0.85 + u * 0.12; b = 0.36 + u * 0.58;
  }
  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
}

export const reentry = {
  id: 'reentry',
  title: 'Atmospheric reentry',
  budget: { sparks: 420, smoke: 18, debris: 26, fronts: 2, ribbons: 12, lights: 1 },
  _acc: 0,
  _wakeAcc: 0,
  _shedAcc: 0,
  _capAt: 0,
  _wake: -1,

  begin() { this._acc = 0; this._wakeAcc = 0; this._shedAcc = 0; this._capAt = 0; this._wake = -1; },
  end(stage) {
    if (this._wake >= 0) stage.ribbons.alive[this._wake] = 0;
    this._wake = -1;
  },

  tick(stage, f, dt, now) {
    const sev = Math.max(0, Math.min(1, f.severity));
    if (sev <= 0.01) return;
    const spd = Math.hypot(f.vx, f.vy, f.vz);
    if (spd < 0.5) return;

    // Everything aligns to the ACTUAL relative velocity.
    const hx = f.vx / spd, hy = f.vy / spd, hz = f.vz / spd;
    const R = f.radius;
    const hot = heatColor(sev);

    // --- 1. LEADING-EDGE PLASMA -------------------------------------------------------------
    // Stands off the nose. Near-zero relative motion so it holds station on the hull as a standing
    // shock rather than streaming away.
    const standoff = R * (1.30 + sev * 0.25);
    const capRate = (50 + sev * 260) * stage.quality;
    this._acc += capRate * dt;
    let n = Math.min(Math.floor(this._acc), 34);
    this._acc -= Math.floor(this._acc);

    for (let i = 0; i < n; i++) {
      const idx = Math.floor(now * 1000) + i * 5;
      // Sample a disc facing the flow, so the cap is a lens across the nose, not a ball around it.
      coneSample(_dir, hx, hy, hz, 1.15, f.seed, idx);
      const rr = R * (0.25 + hash01(f.seed, idx + 1) * 0.95) * (0.7 + sev * 0.6);
      stage.sparks.spawn(now, {
        x: f.px + hx * standoff + _dir[0] * rr,
        y: f.py + hy * standoff + _dir[1] * rr,
        z: f.pz + hz * standoff + _dir[2] * rr,
        // Plasma is swept BACKWARD past the hull, and slowly: it is being overtaken, not thrown.
        vx: f.vx - hx * spd * (0.30 + hash01(f.seed, idx + 2) * 0.35),
        vy: f.vy - hy * spd * (0.30 + hash01(f.seed, idx + 2) * 0.35),
        vz: f.vz - hz * spd * (0.30 + hash01(f.seed, idx + 2) * 0.35),
        life: 0.16 + hash01(f.seed, idx + 3) * 0.34 * (0.5 + sev),
        size0: R * (0.14 + sev * 0.16), size1: R * 0.05,
        colorA: 0xffffff, colorB: hot,
        kind: KIND_SPARK, seed: hash01(f.seed, idx + 4),
        drag: 0.4, priority: 1.2,
      });
    }

    // The compressed bow shock itself: a front normal to the flow, refreshed at ~12 Hz. Small,
    // bright and standing still relative to the hull — the readable "wall of air".
    if (now - this._capAt > 1 / 12) {
      this._capAt = now;
      stage.fronts.spawnFront(now, {
        x: f.px + hx * standoff * 0.85, y: f.py + hy * standoff * 0.85, z: f.pz + hz * standoff * 0.85,
        vx: f.vx, vy: f.vy, vz: f.vz,
        life: 0.12,
        size0: R * (0.8 + sev * 0.5), size1: R * (1.5 + sev * 1.1),
        colorA: 0xffffff, colorB: hot,
        axisX: hx, axisY: hy, axisZ: hz,
        seed: hash01(f.seed, 11), priority: 3,
        coneCos: -1, thickness: 0.55, mode: MODE_PLANE,
      });
    }

    // --- 2. THE WAKE ------------------------------------------------------------------------
    // One long externally-driven ribbon locked to the flow axis, plus loose streamers. Length grows
    // with severity, which is what makes the ramp legible from a distance: the wake gets LONGER
    // before anything gets brighter.
    const wakeLen = R * (4 + sev * 34);
    if (this._wake < 0 || !stage.ribbons.alive[this._wake]) {
      this._wake = stage.ribbons.spawn({
        x: f.px, y: f.py, z: f.pz, life: 3600, width: R * 0.7,
        colorHead: 0xffffff, colorTail: 0x2a0800, priority: 7, mode: 2,
      });
    }
    if (this._wake >= 0) {
      const c = this._wake * 6;
      stage.ribbons.cfg[c + 1] = 0;
      stage.ribbons.cfg[c + 2] = R * (0.5 + sev * 1.1);
      stage.ribbons.cfg[c + 5] = 2;
      stage.ribbons.setSegment(
        this._wake,
        f.px + hx * R * 0.6, f.py + hy * R * 0.6, f.pz + hz * R * 0.6,
        f.px - hx * wakeLen, f.py - hy * wakeLen, f.pz - hz * wakeLen,
        1, 0,
        // The wake forks and thrashes only in breakup: turbulence is a late symptom, not a constant.
        R * 0.45 * Math.max(0, (sev - 0.62) / 0.38), 2.5, now * 12,
      );
    }

    this._wakeAcc += (10 + sev * 34) * dt * stage.quality;
    while (this._wakeAcc >= 1) {
      this._wakeAcc -= 1;
      const idx = Math.floor(now * 991);
      coneSample(_dir, -hx, -hy, -hz, 0.22 + sev * 0.16, f.seed, idx + 40);
      const back = spd * (0.15 + hash01(f.seed, idx + 41) * 0.30);
      stage.ribbons.spawn({
        x: f.px + (hash01(f.seed, idx + 42) - 0.5) * R,
        y: f.py + (hash01(f.seed, idx + 43) - 0.5) * R,
        z: f.pz + (hash01(f.seed, idx + 44) - 0.5) * R,
        vx: f.vx + _dir[0] * back, vy: f.vy + _dir[1] * back, vz: f.vz + _dir[2] * back,
        life: 0.5 + sev * 0.8, width: R * (0.16 + sev * 0.22), drag: 0.25,
        colorHead: hot, colorTail: 0x1a0400, priority: 1.5,
      });
    }

    // --- 3. PROGRESSIVE HULL HEATING --------------------------------------------------------
    // A pulse whose size follows the hull and whose colour follows the ramp. Deliberately sized to
    // the hull rather than larger: this is the hull glowing, and anything bigger reads as fire.
    stage.sparks.spawn(now, {
      x: f.px, y: f.py, z: f.pz, vx: f.vx, vy: f.vy, vz: f.vz,
      life: 0.09,
      size0: R * (0.8 + sev * 0.9), size1: R * (0.7 + sev * 0.8),
      colorA: hot, colorB: hot,
      kind: KIND_FLASH, seed: hash01(f.seed, 9), priority: 2,
    });

    // --- 4. SHEDDING FRAGMENTS AND BREAKUP --------------------------------------------------
    // Nothing sheds below 0.55: the arc has to have a quiet first half or the late stages have
    // nowhere to escalate to.
    if (sev > 0.55) {
      const shedRate = Math.pow((sev - 0.55) / 0.45, 1.6) * 14 * stage.quality;
      this._shedAcc += shedRate * dt;
      while (this._shedAcc >= 1) {
        this._shedAcc -= 1;
        const idx = Math.floor(now * 887);
        coneSample(_dir, -hx, -hy, -hz, 0.55, f.seed, idx + 60);
        const kick = 6 + hash01(f.seed, idx + 61) * 26;
        // Shed pieces are SLOWER than the hull — they fall behind, which is the whole read of
        // "the ship is coming apart while continuing forward".
        const decel = spd * (0.06 + hash01(f.seed, idx + 62) * 0.12);
        const vx = f.vx - hx * decel + _dir[0] * kick;
        const vy = f.vy - hy * decel + _dir[1] * kick;
        const vz = f.vz - hz * decel + _dir[2] * kick;
        const size = R * (0.10 + hash01(f.seed, idx + 63) * 0.22);
        stage.debris.spawn(now, {
          x: f.px + (hash01(f.seed, idx + 64) - 0.5) * R * 1.2,
          y: f.py + (hash01(f.seed, idx + 65) - 0.5) * R * 1.2,
          z: f.pz + (hash01(f.seed, idx + 66) - 0.5) * R * 1.2,
          vx, vy, vz,
          life: 2.0 + hash01(f.seed, idx + 67) * 2.5,
          size0: size, size1: size,
          colorA: f.debrisColor, colorB: f.debrisColor,
          seed: hash01(f.seed, idx + 68),
          spin: (hash01(f.seed, idx + 69) - 0.5) * 20,
          axisX: hash01(f.seed, idx + 70) - 0.5,
          axisY: hash01(f.seed, idx + 71) - 0.5,
          axisZ: hash01(f.seed, idx + 72) - 0.5,
          drag: 0.5, priority: 2.5,
        });
        // Every shed fragment gets its own burning trail. This is the signature image of reentry
        // breakup and the reason the ribbon budget for this family is the library's largest.
        stage.ribbons.spawn({
          x: f.px, y: f.py, z: f.pz, vx, vy, vz,
          life: 1.1 + hash01(f.seed, idx + 73) * 0.8,
          width: R * 0.20, drag: 0.5,
          colorHead: 0xffe9c0, colorTail: 0x220600, priority: 2.5,
        });
        // Cinders trailing the fragment.
        for (let k = 0; k < 3; k++) {
          coneSample(_dir, -hx, -hy, -hz, 0.9, f.seed, idx + 80 + k);
          stage.sparks.spawn(now, {
            x: f.px, y: f.py, z: f.pz,
            vx: vx + _dir[0] * 14, vy: vy + _dir[1] * 14, vz: vz + _dir[2] * 14,
            life: 0.8 + hash01(f.seed, idx + 90 + k) * 1.0,
            size0: R * 0.05, size1: R * 0.02,
            colorA: hot, colorB: 0x5a1200,
            kind: KIND_EMBER, seed: hash01(f.seed, idx + 95 + k),
            drag: 0.8, priority: 0.8,
          });
        }
      }

      const puffRate = (sev - 0.55) / 0.45 * 6 * stage.quality;
      if (hash01(f.seed, Math.floor(now * 60)) < puffRate * dt * 10) {
        coneSample(_dir, -hx, -hy, -hz, 0.5, f.seed, Math.floor(now * 60) + 7);
        stage.smoke.spawn(now, {
          x: f.px - hx * R * 3, y: f.py - hy * R * 3, z: f.pz - hz * R * 3,
          vx: f.vx * 0.25 + _dir[0] * 10, vy: f.vy * 0.25 + _dir[1] * 10, vz: f.vz * 0.25 + _dir[2] * 10,
          life: 2.4 + sev * 1.5,
          size0: R * 0.8, size1: R * 3.0,
          colorA: 0x7a5240, colorB: 0x201a18,
          kind: KIND_PUFF, seed: hash01(f.seed, Math.floor(now * 60) + 8),
          spin: 0.4, drag: 0.9, priority: 1,
        });
      }
    }

    stage.lights.spawn({
      x: f.px + hx * standoff, y: f.py + hy * standoff, z: f.pz + hz * standoff,
      color: hot, peak: 10 + sev * 60, life: 0.09,
      distance: R * (10 + sev * 24), priority: 1.5, falloff: 'linear',
    });
  },
};

export const REENTRY_FAMILIES = [reentry];
