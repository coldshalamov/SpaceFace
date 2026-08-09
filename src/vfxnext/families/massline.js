// VFX NEXT — families 7, 8 and 9: Massline latch, high tension, release.
//
// FORCE RECORD MAPPING for all three (the tether needs two endpoints, and the record has one
// position, so the second is derived rather than added — a wider record would be a worse trade):
//
//   pos      = the SHIP endpoint
//   dir      = unit direction ship -> anchor  (signed: a tether always knows which end is which)
//   radius   = LINE LENGTH in world units
//   impulse  = tension, 0..1
//   v        = the ship's velocity — release inherits this, and it is what the snap must obey
//
// The governing form is bible §6: "narrow white-hot core inside a saturated sheath; dark edge; two
// unmistakable contact endpoints", and the named failure is "constant near-break alarm" plus a
// release that "dominates the retained velocity". Both are timing/dominance problems rather than
// shading problems, so the tension family deliberately keeps its width nearly flat and spends its
// dynamic range on core brightness, shiver frequency and shed sparks instead. A line that visibly
// thickens under load becomes the giant neon rope the brief rules out within about two seconds of
// watching it.

import { KIND_FLASH, KIND_SPARK, KIND_EMBER } from '../core/gpuAged.js';
import { MODE_PLANE } from '../core/solids.js';
import { coneSample, hash01 } from '../core/force.js';

const _dir = new Float32Array(3);

function anchorOf(f, out) {
  out[0] = f.px + f.dx * f.radius;
  out[1] = f.py + f.dy * f.radius;
  out[2] = f.pz + f.dz * f.radius;
  return out;
}

const _anchor = new Float32Array(3);

export const masslineLatch = {
  id: 'massline_latch',
  title: 'Massline latch',
  budget: { sparks: 40, smoke: 0, debris: 0, fronts: 2, ribbons: 1, lights: 1 },

  emit(stage, f, now) {
    anchorOf(f, _anchor);
    const gauge = Math.max(0.6, f.radius * 0.03); // visual thickness scale, not line length
    const ax = _anchor[0], ay = _anchor[1], az = _anchor[2];

    // 1 — CONNECTION FLASH at both ends, simultaneously. Two ends firing together is the entire
    // read of "a connection was made"; one end alone reads as a weapon discharge.
    for (let e = 0; e < 2; e++) {
      const px = e === 0 ? f.px : ax, py = e === 0 ? f.py : ay, pz = e === 0 ? f.pz : az;
      stage.sparks.spawn(now, {
        x: px, y: py, z: pz, vx: f.vx, vy: f.vy, vz: f.vz,
        life: 0.10,
        size0: gauge * 0.8, size1: gauge * 5.5,
        colorA: 0xffffff, colorB: f.coreColor,
        kind: KIND_FLASH, seed: hash01(f.seed, e + 1), priority: 6,
      });
    }

    // 2 — ANCHOR CONTACT. A ring laid across the line axis at the anchor: the tell that the tether
    // has bitten into something rather than merely reaching it. Oriented, so at gameplay zoom you
    // can see WHICH WAY the line leaves the anchor.
    stage.fronts.spawnFront(now, {
      x: ax, y: ay, z: az, vx: f.vx, vy: f.vy, vz: f.vz,
      life: 0.30,
      size0: gauge * 0.5, size1: gauge * 6.5,
      colorA: 0xffffff, colorB: f.sheathColor,
      axisX: f.dx, axisY: f.dy, axisZ: f.dz,
      seed: hash01(f.seed, 3), priority: 5,
      thickness: 0.95, mode: MODE_PLANE,
    });

    // 3 — THE TRAVELLING PULSE. Runs ship -> anchor over ~0.2 s. The ribbon substrate walks it
    // natively (mode 1), so the pulse is genuinely a segment of the line rather than a particle
    // flying near it — which is what stops it drifting off the tether at high closing speeds.
    const pulse = stage.ribbons.spawn({
      x: f.px, y: f.py, z: f.pz,
      life: 0.20, width: gauge * 1.5,
      colorHead: 0xffffff, colorTail: 0x4a2cff, priority: 6,
    });
    if (pulse >= 0) stage.ribbons.setPulseSegment(pulse, f.px, f.py, f.pz, ax, ay, az, 0.30);

    // 4 — a tight spark ring thrown off the anchor, in the plane of contact.
    const n = stage.count(24, f, 6);
    for (let i = 0; i < n; i++) {
      // Sample AROUND the line axis: a disc of sparks, not a ball. The plane is the information.
      coneSample(_dir, f.dx, f.dy, f.dz, Math.PI * 0.5, f.seed, i + 100);
      const s2 = 14 + hash01(f.seed, i + 110) * 30;
      stage.sparks.spawn(now, {
        x: ax, y: ay, z: az,
        vx: f.vx + _dir[0] * s2, vy: f.vy + _dir[1] * s2, vz: f.vz + _dir[2] * s2,
        life: 0.18 + hash01(f.seed, i + 120) * 0.3,
        size0: gauge * 0.35, size1: gauge * 0.08,
        colorA: 0xf0f4ff, colorB: 0x5a3cff,
        kind: KIND_SPARK, seed: hash01(f.seed, i + 130),
        drag: 2.8, priority: 1,
      });
    }

    stage.lights.spawn({
      x: ax, y: ay, z: az, color: 0x8f7cff,
      peak: 40, life: 0.16, distance: gauge * 60, priority: 3, falloff: 'flash',
    });
  },
};

export const masslineTension = {
  id: 'massline_tension',
  title: 'Massline high tension',
  budget: { sparks: 90, smoke: 0, debris: 0, fronts: 0, ribbons: 2, lights: 0 },
  _line: -1,
  _acc: 0,
  _stressAt: 0,

  begin() { this._line = -1; this._acc = 0; this._stressAt = 0; },
  end(stage) {
    if (this._line >= 0) stage.ribbons.alive[this._line] = 0;
    this._line = -1;
  },

  tick(stage, f, dt, now) {
    const tension = Math.max(0, Math.min(1, f.impulse));
    anchorOf(f, _anchor);
    const ax = _anchor[0], ay = _anchor[1], az = _anchor[2];
    const gauge = Math.max(0.6, f.radius * 0.03);

    if (this._line < 0 || !stage.ribbons.alive[this._line]) {
      this._line = stage.ribbons.spawn({
        x: f.px, y: f.py, z: f.pz, life: 3600,
        width: gauge, colorHead: 0xffffff, colorTail: 0x3a24d8,
        priority: 8, mode: 2,
      });
    }
    if (this._line < 0) return;

    const c = this._line * 6;
    stage.ribbons.cfg[c + 1] = 0;
    // WIDTH BARELY MOVES: 1.0x at slack to 1.35x at breaking. The rope stays a line.
    stage.ribbons.cfg[c + 2] = gauge * (1.0 + tension * 0.35);
    stage.ribbons.cfg[c + 5] = 2;

    // Colour carries the load instead. Head stays white; the sheath saturates from a cool idle
    // violet toward a hot magenta as tension climbs, so bloom-off the line still reads by hue
    // separation and shiver alone.
    const i3 = this._line * 3;
    stage.ribbons.colTail[i3] = 0.22 + tension * 0.72;
    stage.ribbons.colTail[i3 + 1] = 0.14 - tension * 0.10;
    stage.ribbons.colTail[i3 + 2] = 0.85 - tension * 0.35;

    // Shiver: amplitude eases in only past half load, frequency climbs steeply. This is what makes
    // "loaded" and "about to break" distinguishable without a HUD readout, and why ordinary load
    // does not look like constant imminent snapping.
    const amp = gauge * 0.9 * Math.pow(Math.max(0, tension - 0.35) / 0.65, 1.8);
    const freq = 2.5 + tension * 9;
    const phase = now * (10 + tension * 46);
    stage.ribbons.setSegment(this._line, f.px, f.py, f.pz, ax, ay, az, 1, 0, amp, freq, phase);

    // Shed sparks from mid-span above the working threshold. Matter leaving the line is the most
    // legible "this is at its limit" signal there is, and it costs almost nothing.
    if (tension > 0.62) {
      const rate = (tension - 0.62) / 0.38 * 90;
      this._acc += rate * dt * stage.quality;
      const n = Math.min(Math.floor(this._acc), 8);
      this._acc -= n;
      for (let i = 0; i < n; i++) {
        const idx = Math.floor(now * 1000) + i;
        const k = 0.2 + hash01(f.seed, idx + 1) * 0.6;
        const px = f.px + (ax - f.px) * k, py = f.py + (ay - f.py) * k, pz = f.pz + (az - f.pz) * k;
        coneSample(_dir, f.dx, f.dy, f.dz, Math.PI * 0.5, f.seed, idx + 2);
        const s2 = 10 + hash01(f.seed, idx + 3) * 26 * tension;
        stage.sparks.spawn(now, {
          x: px, y: py, z: pz,
          vx: f.vx + _dir[0] * s2, vy: f.vy + _dir[1] * s2, vz: f.vz + _dir[2] * s2,
          life: 0.2 + hash01(f.seed, idx + 4) * 0.35,
          size0: gauge * 0.28, size1: gauge * 0.06,
          colorA: 0xffe8ff, colorB: 0x7a2cff,
          kind: KIND_SPARK, seed: hash01(f.seed, idx + 5),
          drag: 2.2, priority: 1,
        });
      }
    }

    // Endpoint stress flashes only in the top decile — reserved so they still mean something.
    if (tension > 0.88 && now - this._stressAt > 0.09) {
      this._stressAt = now;
      const end = hash01(f.seed, Math.floor(now * 60)) > 0.5;
      stage.sparks.spawn(now, {
        x: end ? f.px : ax, y: end ? f.py : ay, z: end ? f.pz : az,
        vx: f.vx, vy: f.vy, vz: f.vz,
        life: 0.07, size0: gauge * 0.5, size1: gauge * 2.2,
        colorA: 0xffffff, colorB: 0xff4ce0,
        kind: KIND_FLASH, seed: hash01(f.seed, 77), priority: 3,
      });
    }
  },
};

export const masslineRelease = {
  id: 'massline_release',
  title: 'Massline release / snap',
  budget: { sparks: 84, smoke: 0, debris: 0, fronts: 2, ribbons: 4, lights: 1 },

  emit(stage, f, now) {
    anchorOf(f, _anchor);
    const ax = _anchor[0], ay = _anchor[1], az = _anchor[2];
    const gauge = Math.max(0.6, f.radius * 0.03);
    const tension = Math.max(0.2, Math.min(1, f.impulse));
    const spd = Math.hypot(f.vx, f.vy, f.vz);

    // 1 — SNAP FLASH at both ends. Harder and shorter than the latch: a release is an event that
    // ends, and the eye reads "ended" from a fast decay far more reliably than from a colour change.
    for (let e = 0; e < 2; e++) {
      const px = e === 0 ? f.px : ax, py = e === 0 ? f.py : ay, pz = e === 0 ? f.pz : az;
      stage.sparks.spawn(now, {
        x: px, y: py, z: pz, vx: f.vx, vy: f.vy, vz: f.vz,
        life: 0.075,
        size0: gauge * 1.4, size1: gauge * 4.4 * tension,
        colorA: 0xffffff, colorB: 0xff58c8,
        kind: KIND_FLASH, seed: hash01(f.seed, e + 1), priority: 7,
      });
      stage.fronts.spawnFront(now, {
        x: px, y: py, z: pz, vx: f.vx, vy: f.vy, vz: f.vz,
        life: 0.22,
        size0: gauge * 0.4, size1: gauge * 5.0 * tension,
        colorA: 0xffffff, colorB: 0xc03cff,
        axisX: f.dx, axisY: f.dy, axisZ: f.dz,
        seed: hash01(f.seed, e + 10), priority: 4,
        thickness: 0.9, mode: MODE_PLANE,
      });
    }

    // 2 — RECOIL. Two short ribbons whipping back from the break toward each end. The line is
    // storing energy; when it lets go, that energy has to go somewhere visible, and it must go
    // ALONG the line, not outward in a generic burst.
    const mx = (f.px + ax) * 0.5, my = (f.py + ay) * 0.5, mz = (f.pz + az) * 0.5;
    for (let e = 0; e < 2; e++) {
      const tx = e === 0 ? f.px : ax, ty = e === 0 ? f.py : ay, tz = e === 0 ? f.pz : az;
      const r = stage.ribbons.spawn({
        x: mx, y: my, z: mz,
        life: 0.26 * (0.6 + tension * 0.7), width: gauge * 1.7,
        colorHead: 0xffffff, colorTail: 0x5c10a8, priority: 6,
      });
      if (r >= 0) stage.ribbons.setPulseSegment(r, mx, my, mz, tx, ty, tz, 0.55);
    }

    // 3 — PARTICLES CONTINUE IN THE RELEASE DIRECTION. The brief's requirement, and the one place
    // this family is allowed to be loud. The burst is aimed by the ship's ACTUAL retained velocity,
    // and its streak length scales with that speed, so the release visually hands the frame to the
    // body's momentum instead of competing with it.
    const hasMomentum = spd > 1;
    const rx = hasMomentum ? f.vx / spd : f.dx;
    const ry = hasMomentum ? f.vy / spd : f.dy;
    const rz = hasMomentum ? f.vz / spd : f.dz;
    const n = stage.count(60, f, 12);
    for (let i = 0; i < n; i++) {
      coneSample(_dir, rx, ry, rz, 0.55, f.seed, i + 200);
      // Momentum-scaled: at rest this is a modest puff, at speed it is a long directional spray.
      const s2 = (18 + spd * 0.55) * (0.6 + hash01(f.seed, i + 210) * 0.9) * tension;
      stage.sparks.spawn(now, {
        x: mx + (hash01(f.seed, i + 220) - 0.5) * gauge * 3,
        y: my + (hash01(f.seed, i + 230) - 0.5) * gauge * 3,
        z: mz + (hash01(f.seed, i + 240) - 0.5) * gauge * 3,
        vx: f.vx + _dir[0] * s2, vy: f.vy + _dir[1] * s2, vz: f.vz + _dir[2] * s2,
        life: 0.25 + hash01(f.seed, i + 250) * 0.5,
        size0: gauge * 0.4, size1: gauge * 0.07,
        colorA: 0xffffff, colorB: 0x9a2cff,
        kind: KIND_SPARK, seed: hash01(f.seed, i + 260),
        drag: 1.1, priority: 2,
      });
    }

    // 4 — a few cinders that outlive the snap, drifting on the retained velocity.
    const embers = stage.count(10, f, 3);
    for (let i = 0; i < embers; i++) {
      coneSample(_dir, rx, ry, rz, 1.2, f.seed, i + 400);
      const s2 = 6 + hash01(f.seed, i + 410) * 18;
      stage.sparks.spawn(now, {
        x: mx, y: my, z: mz,
        vx: f.vx + _dir[0] * s2, vy: f.vy + _dir[1] * s2, vz: f.vz + _dir[2] * s2,
        life: 0.9 + hash01(f.seed, i + 420) * 1.1,
        size0: gauge * 0.16, size1: gauge * 0.05,
        colorA: 0xe0b0ff, colorB: 0x3a0a6a,
        kind: KIND_EMBER, seed: hash01(f.seed, i + 430),
        drag: 0.9, priority: 0.7,
      });
    }

    stage.lights.spawn({
      x: mx, y: my, z: mz, color: 0xc060ff,
      peak: 50 * tension, life: 0.15, distance: gauge * 70, priority: 3, falloff: 'flash',
    });
  },
};

export const MASSLINE_FAMILIES = [masslineLatch, masslineTension, masslineRelease];
