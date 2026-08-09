// VFX NEXT — families 10 and 11: attractive gravity field, repulsor / anti-gravity field.
//
// These two are the library's clearest test of "form identifies the verb". They occupy the same
// volume, cost the same, and share every substrate; if a reviewer can tell PULL from PUSH in a
// grayscale still, the vocabulary works. design/PHYSICS_AS_SPECTACLE_ART_BIBLE.md §6 already fixes
// the two forms and this file implements them literally:
//
//   WELL     concave intake around a compact framed anchor, inward density toward the sink,
//            curved/spiral tracers converging, inward-facing static vanes.
//            Forbidden: glowing sphere, outward spokes.
//   REPULSOR convex pressure dome with a CLEAR CENTRE and outward-oriented ribs, straight radial
//            divergence, outward taper/spacing.
//            Forbidden: intake spiral, generic aura.
//
// The curve is real, not authored: tracers are spawned with a tangential velocity and a centripetal
// acceleration, and the GPU integrates origin + vel*tau + 0.5*accel*t^2. Over a tracer's lifetime
// that is a decaying arc into the sink. The repulsor gets zero tangential component and outward
// acceleration, which is straight radial divergence by construction — the two motions cannot be
// confused because they come from different physics, not different art.
//
// FORCE RECORD MAPPING: pos = field centre, radius = field radius, severity = field strength 0..1,
// v = the field emitter's own velocity (a field mounted on a moving ship must travel with it).

import { KIND_FLASH, KIND_SPARK } from '../core/gpuAged.js';
import { MODE_PLANE, MODE_DOME } from '../core/solids.js';
import { hash01 } from '../core/force.js';

/** Uniform point on a unit sphere from two hashes. Written into `out`. */
function spherePoint(out, seed, index) {
  const u = hash01(seed, index * 3 + 1) * 2 - 1;
  const phi = hash01(seed, index * 3 + 2) * Math.PI * 2;
  const s = Math.sqrt(Math.max(0, 1 - u * u));
  out[0] = s * Math.cos(phi); out[1] = u; out[2] = s * Math.sin(phi);
  return out;
}

const _p = new Float32Array(3);
const _t = new Float32Array(3);

export const fieldAttractor = {
  id: 'field_attractor',
  title: 'Attractive gravity field',
  budget: { sparks: 300, smoke: 0, debris: 0, fronts: 1, ribbons: 0, lights: 1 },
  _acc: 0,
  _vaneAt: 0,
  _ringAt: 0,
  _lightAt: 0,

  begin() { this._acc = 0; this._vaneAt = 0; this._ringAt = 0; this._lightAt = 0; },

  tick(stage, f, dt, now) {
    const strength = Math.max(0, Math.min(1, f.severity));
    if (strength <= 0.02) return;
    const R = f.radius;

    // --- converging tracers ---
    const rate = (60 + strength * 220) * stage.quality;
    this._acc += rate * dt;
    let n = Math.floor(this._acc);
    this._acc -= n;
    n = Math.min(n, 30);

    for (let i = 0; i < n; i++) {
      const idx = Math.floor(now * 1000) + i * 13;
      spherePoint(_p, f.seed, idx);
      // Spawn on a shell, not in the volume: matter arrives from OUTSIDE. Emitting throughout the
      // sphere produces a glowing ball, which is precisely the forbidden read.
      const r = R * (0.86 + hash01(f.seed, idx + 7) * 0.30);
      const px = f.px + _p[0] * r, py = f.py + _p[1] * r, pz = f.pz + _p[2] * r;

      // Tangential component -> the spiral. A tangent is any vector perpendicular to the radius.
      _t[0] = -_p[2]; _t[1] = _p[0] * 0.35; _t[2] = _p[0];
      const tm = Math.hypot(_t[0], _t[1], _t[2]) || 1;
      _t[0] /= tm; _t[1] /= tm; _t[2] /= tm;

      const inward = (R * 0.55) * (0.5 + strength);
      const tang = inward * (0.35 + hash01(f.seed, idx + 8) * 0.5) * strength;
      // Centripetal acceleration toward the sink. This is the term that BENDS the path; without it
      // the tracers are straight lines and the field reads as a collapsing cage, not a well.
      //
      // BUDGET IT AGAINST THE LIFETIME. A tracer must ARRIVE at the sink around end-of-life. An
      // earlier value (R*3.2*2) carried it ~82 wu inward from a 22 wu shell: every tracer punched
      // straight through the centre, exited the far side at high speed, and the whole field
      // rendered as nothing at all despite 264 live particles. Solve it instead of eyeballing it:
      // reaching R in ~0.75 s from v0 needs g ~ 2*(R - v0*T)/T^2, which lands near 2x R.
      const g = R * (1.2 + strength * 1.2);

      stage.sparks.spawn(now, {
        x: px, y: py, z: pz,
        vx: f.vx - _p[0] * inward + _t[0] * tang,
        vy: f.vy - _p[1] * inward + _t[1] * tang,
        vz: f.vz - _p[2] * inward + _t[2] * tang,
        ax: -_p[0] * g, ay: -_p[1] * g, az: -_p[2] * g,
        life: 0.55 + hash01(f.seed, idx + 9) * 0.45,
        // Tracers GROW as they fall inward: crowding toward the sink is the density gradient the
        // bible asks for, and it survives grayscale because it is spacing, not colour.
        size0: R * 0.038, size1: R * 0.080,
        colorA: 0x9fd8ff, colorB: 0xffffff,
        kind: KIND_SPARK, seed: hash01(f.seed, idx + 10),
        drag: 0, priority: 0.6,
      });
    }

    // --- inward-facing static vanes: the grayscale/reduced-motion carrier ---
    // Refreshed at 6 Hz with a 0.5 s life so they read as a STANDING structure around the anchor
    // rather than as motion. Reduced-motion review sees these; the tracers are the bonus.
    if (now - this._vaneAt > 1 / 6) {
      this._vaneAt = now;
      const vanes = Math.max(6, Math.round(14 * stage.quality));
      for (let i = 0; i < vanes; i++) {
        spherePoint(_p, f.seed, i + 500);
        const r = R * 0.72;
        // A dash pointing at the sink: near-zero velocity, aimed inward, stretched by the SPARK
        // kind's velocity alignment.
        stage.sparks.spawn(now, {
          x: f.px + _p[0] * r, y: f.py + _p[1] * r, z: f.pz + _p[2] * r,
          vx: f.vx - _p[0] * R * 0.9, vy: f.vy - _p[1] * R * 0.9, vz: f.vz - _p[2] * R * 0.9,
          life: 0.5,
          size0: R * 0.055, size1: R * 0.040,
          colorA: 0x5fa8ff, colorB: 0x123a7a,
          kind: KIND_SPARK, seed: hash01(f.seed, i + 510),
          drag: 6.0, priority: 0.9,
        });
      }
    }

    // --- the compact framed anchor ---
    // Small, hard-edged and PERSISTENT. The field is large; its cause is small. Making the anchor
    // big is how a well turns into the glowing sphere the bible forbids.
    stage.sparks.spawn(now, {
      x: f.px, y: f.py, z: f.pz, vx: f.vx, vy: f.vy, vz: f.vz,
      life: 0.10,
      size0: R * 0.16 * (0.85 + 0.15 * Math.sin(now * 9)), size1: R * 0.13,
      colorA: 0xffffff, colorB: 0x4aa0ff,
      kind: KIND_FLASH, seed: hash01(f.seed, 3), priority: 4,
    });

    // A contracting ring at the anchor, twice a second: the intake mouth.
    if (now - this._ringAt > 0.5) {
      this._ringAt = now;
      stage.fronts.spawnFront(now, {
        x: f.px, y: f.py, z: f.pz, vx: f.vx, vy: f.vy, vz: f.vz,
        life: 0.7,
        // size0 > size1: the ring CONTRACTS. Every other front in the library expands, so a
        // shrinking one is unambiguous even with the colour stripped out.
        size0: R * 0.9, size1: R * 0.18,
        colorA: 0x2f6cff, colorB: 0xffffff,
        axisX: 0, axisY: 1, axisZ: 0,
        seed: hash01(f.seed, 4), priority: 3,
        thickness: 0.85, mode: MODE_PLANE,
      });
    }

    // Rate-limited. A per-frame spawn at 0.09 s life keeps up to five lights alive against a pool
    // of four, so a sustained field would quietly evict every impact and explosion light in the
    // scene. 10 Hz with a matching lifetime is continuous to the eye and costs one slot.
    if (now - this._lightAt > 0.1) {
      this._lightAt = now;
      stage.lights.spawn({
        x: f.px, y: f.py, z: f.pz, color: 0x4a90ff,
        peak: 6 + strength * 14, life: 0.11, distance: R * 3, priority: 0.4, falloff: 'linear',
      });
    }
  },
};

export const fieldRepulsor = {
  id: 'field_repulsor',
  title: 'Repulsor / anti-gravity field',
  budget: { sparks: 300, smoke: 0, debris: 0, fronts: 3, ribbons: 0, lights: 1 },
  _acc: 0,
  _ribAt: 0,
  _shellAt: 0,
  _lightAt: 0,

  begin() { this._acc = 0; this._ribAt = 0; this._shellAt = 0; this._lightAt = 0; },

  tick(stage, f, dt, now) {
    const strength = Math.max(0, Math.min(1, f.severity));
    if (strength <= 0.02) return;
    const R = f.radius;

    // THE CLEAR CENTRE. Nothing spawns inside 34% of the radius, and nothing ever moves inward.
    // This is the single load-bearing difference from the attractor, and it must be structural: a
    // repulsor whose particles merely happen to be sparse in the middle will fill in the moment
    // the emission rate rises.
    const inner = R * 0.34;

    const rate = (60 + strength * 220) * stage.quality;
    this._acc += rate * dt;
    let n = Math.floor(this._acc);
    this._acc -= n;
    n = Math.min(n, 30);

    for (let i = 0; i < n; i++) {
      const idx = Math.floor(now * 1000) + i * 13;
      spherePoint(_p, f.seed, idx);
      const r = inner * (1 + hash01(f.seed, idx + 7) * 0.25);
      const outward = (R * 0.9) * (0.4 + strength);
      // Outward acceleration: divergence that INCREASES with distance, so the spacing between
      // tracers widens as they leave. Outward taper is the grayscale carrier here.
      const g = R * (0.8 + strength * 0.9);   // same lifetime budgeting as the well
      stage.sparks.spawn(now, {
        x: f.px + _p[0] * r, y: f.py + _p[1] * r, z: f.pz + _p[2] * r,
        vx: f.vx + _p[0] * outward, vy: f.vy + _p[1] * outward, vz: f.vz + _p[2] * outward,
        ax: _p[0] * g, ay: _p[1] * g, az: _p[2] * g,
        life: 0.5 + hash01(f.seed, idx + 9) * 0.4,
        // Tracers SHRINK on the way out — thinning, the exact inverse of the well's crowding.
        size0: R * 0.080, size1: R * 0.026,
        colorA: 0xffffff, colorB: 0xff9c3c,
        kind: KIND_SPARK, seed: hash01(f.seed, idx + 10),
        drag: 0.6, priority: 0.6,
      });
    }

    // --- outward-oriented ribs, refreshed at 6 Hz (the static carrier) ---
    if (now - this._ribAt > 1 / 6) {
      this._ribAt = now;
      const ribs = Math.max(6, Math.round(14 * stage.quality));
      for (let i = 0; i < ribs; i++) {
        spherePoint(_p, f.seed, i + 500);
        const r = R * 0.62;
        stage.sparks.spawn(now, {
          x: f.px + _p[0] * r, y: f.py + _p[1] * r, z: f.pz + _p[2] * r,
          vx: f.vx + _p[0] * R * 0.9, vy: f.vy + _p[1] * R * 0.9, vz: f.vz + _p[2] * R * 0.9,
          life: 0.5,
          size0: R * 0.042, size1: R * 0.060,
          colorA: 0xffb066, colorB: 0x6a2400,
          kind: KIND_SPARK, seed: hash01(f.seed, i + 510),
          drag: 6.0, priority: 0.9,
        });
      }
    }

    // --- the expanding warped shell ---
    // MODE_DOME lifts the rim along the axis, so this is a convex pressure shell rather than a flat
    // ring. Three staggered domes on different axes at ~3 Hz give the sense of a volume being held
    // open without ever drawing a sphere.
    if (now - this._shellAt > 0.34) {
      this._shellAt = now;
      for (let k = 0; k < 2; k++) {
        spherePoint(_p, f.seed, Math.floor(now * 3) * 2 + k);
        stage.fronts.spawnFront(now, {
          x: f.px, y: f.py, z: f.pz, vx: f.vx, vy: f.vy, vz: f.vz,
          life: 0.75,
          size0: inner, size1: R * (1.15 + strength * 0.5),
          colorA: 0xffffff, colorB: 0xff7a1e,
          axisX: _p[0], axisY: _p[1], axisZ: _p[2],
          seed: hash01(f.seed, k + 20), priority: 3,
          thickness: 0.45, mode: MODE_DOME,
        });
      }
    }

    if (now - this._lightAt > 0.1) {
      this._lightAt = now;
      stage.lights.spawn({
        x: f.px, y: f.py, z: f.pz, color: 0xff8a3a,
        peak: 6 + strength * 16, life: 0.11, distance: R * 3, priority: 0.4, falloff: 'linear',
      });
    }
  },
};

// Neither field uses cinders: a field is a machine holding a volume open, not a fire. Reserving
// KIND_EMBER for damage keeps the two vocabularies from bleeding into each other.
export const FIELD_FAMILIES = [fieldAttractor, fieldRepulsor];
