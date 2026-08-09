// VFX NEXT — families 1 and 2: normal weapon impact, heavy kinetic/concussion impact.
//
// These two exist as a PAIR on purpose. They share every substrate and differ only in shape, timing
// and what carries the read — which is the library's central claim: form identifies the verb,
// radiance identifies energy (design/PHYSICS_AS_SPECTACLE_ART_BIBLE.md §6). If a reviewer can tell
// them apart at gameplay zoom with the colours swapped, the pair works.
//
//   normal   — the read is a SPARK CONE. Fast, small, spall biased back toward the shooter.
//   heavy    — the read is a COMPRESSION FRONT. A flat oriented disc normal to the force path,
//              plus a debris kick whose magnitude comes from `impulse`, not from taste.
//
// Causality note: a weapon impact HAS a signed direction. A hull-on-hull collision does not — the
// live `combat:collisionConsequence` receipt supplies an unoriented axis only. Both families branch
// on `force.hasDir` and emit symmetrically about the axis when the sign is absent. That branch is
// the difference between illustrating physics and inventing it.

import { KIND_FLASH, KIND_SPARK, KIND_EMBER, KIND_PUFF } from '../core/gpuAged.js';
import { MODE_PLANE } from '../core/solids.js';
import { coneSample, hash01, emissionSign } from '../core/force.js';

const _dir = new Float32Array(3);

/** Resolve the axis a burst should open along for sample `i`.
 *  Signed  -> reflect back toward the incoming side (spall reads as "hit from over there").
 *  Unsigned-> alternate faces of the contact axis, giving the opposed/symmetric response. */
function burstAxis(f, i, out) {
  if (f.hasDir) {
    // Spall opposes the projectile. A little forward continuation is kept below, separately.
    out[0] = -f.dx; out[1] = -f.dy; out[2] = -f.dz;
  } else {
    const s = emissionSign(f, i);
    out[0] = f.ax * s; out[1] = f.ay * s; out[2] = f.az * s;
  }
  return out;
}

export const impactNormal = {
  id: 'impact_normal',
  title: 'Normal weapon impact',
  // Per-event budget, in the same currency as the live caps. 34 sparks against PARTICLE_CAP 3000
  // means ~88 concurrent impacts before the pool is the limit — comfortably past any real fight.
  budget: { sparks: 34, smoke: 1, debris: 4, fronts: 1, ribbons: 0, lights: 1 },

  emit(stage, f, now) {
    const scale = f.radius;
    const sev = Math.max(0.15, Math.min(1, f.severity));

    // 1 — the flash. Very short. An impact that lingers reads as an explosion, and the brief's
    // "weak impacts" complaint is usually a timing problem, not a brightness one: the eye reads
    // a 70 ms punch as harder than a 300 ms glow of the same peak.
    stage.sparks.spawn(now, {
      x: f.px, y: f.py, z: f.pz,
      vx: f.vx * 0.4, vy: f.vy * 0.4, vz: f.vz * 0.4,
      life: 0.075 + sev * 0.05,
      size0: scale * 0.55, size1: scale * 2.5,
      colorA: 0xffffff, colorB: f.coreColor,
      kind: KIND_FLASH, seed: hash01(f.seed, 1), priority: 3 + sev,
    });

    // 2 — the contact ring, laid ON the surface. Small, sharp, gone in a fifth of a second. It is
    // what tells you WHERE on the hull the hit landed rather than merely that one occurred.
    const nx = f.hasSurface ? f.nx : (f.hasDir ? -f.dx : f.ax);
    const ny = f.hasSurface ? f.ny : (f.hasDir ? -f.dy : f.ay);
    const nz = f.hasSurface ? f.nz : (f.hasDir ? -f.dz : f.az);
    stage.fronts.spawnFront(now, {
      x: f.px, y: f.py, z: f.pz,
      vx: f.vx, vy: f.vy, vz: f.vz,
      life: 0.20,
      size0: scale * 0.25, size1: scale * 2.4,
      colorA: 0xfff0d0, colorB: f.sheathColor,
      axisX: nx, axisY: ny, axisZ: nz,
      seed: hash01(f.seed, 2), priority: 2,
      coneCos: -1, thickness: 0.85, mode: MODE_PLANE,
    });

    // 3 — the spall cone. THE read of this family. Tight enough to have a direction, wide enough
    // to look like material rather than a laser.
    const n = stage.count(this.budget.sparks - 8, f, 6);
    const spread = f.hasDir ? 0.75 : 1.15;
    for (let i = 0; i < n; i++) {
      burstAxis(f, i, _dir);
      coneSample(_dir, _dir[0], _dir[1], _dir[2], spread, f.seed, i);
      const speed = (24 + hash01(f.seed, i + 900) * 62) * (0.5 + sev);
      stage.sparks.spawn(now, {
        x: f.px, y: f.py, z: f.pz,
        // Inherit the struck body's motion. Without this the sparks hang in space while the ship
        // flies out from under them — the single most common "not physical" tell.
        vx: f.vx + _dir[0] * speed, vy: f.vy + _dir[1] * speed, vz: f.vz + _dir[2] * speed,
        life: 0.16 + hash01(f.seed, i + 40) * 0.30,
        size0: scale * 0.12, size1: scale * 0.03,
        colorA: 0xfff6e2, colorB: f.sheathColor,
        kind: KIND_SPARK, seed: hash01(f.seed, i + 7),
        drag: 2.6 + hash01(f.seed, i + 300) * 2.2,
        priority: 1,
      });
    }

    // 4 — small persistent sparks. The brief asks for these explicitly, and they matter out of
    // proportion to their cost: they are the only part of a normal impact still on screen a second
    // later, so they are what makes a firefight leave a trace.
    const embers = stage.count(6, f, 2);
    for (let i = 0; i < embers; i++) {
      burstAxis(f, i, _dir);
      coneSample(_dir, _dir[0], _dir[1], _dir[2], 1.3, f.seed, i + 500);
      const speed = 8 + hash01(f.seed, i + 620) * 22;
      stage.sparks.spawn(now, {
        x: f.px, y: f.py, z: f.pz,
        vx: f.vx + _dir[0] * speed, vy: f.vy + _dir[1] * speed, vz: f.vz + _dir[2] * speed,
        life: 0.7 + hash01(f.seed, i + 77) * 0.9,
        size0: scale * 0.07, size1: scale * 0.02,
        colorA: f.coreColor, colorB: 0x8c2a06,
        kind: KIND_EMBER, seed: hash01(f.seed, i + 91),
        drag: 1.1, priority: 0.5,
      });
    }

    // 5 — a few real fragments. Four is enough: they are lit solids, so each one reads as material
    // rather than light, and four tumbling chips do more for "physical" than forty more sparks.
    const chips = stage.count(this.budget.debris, f, 1);
    for (let i = 0; i < chips; i++) {
      burstAxis(f, i, _dir);
      coneSample(_dir, _dir[0], _dir[1], _dir[2], 0.95, f.seed, i + 200);
      const speed = 14 + hash01(f.seed, i + 210) * 26;
      stage.debris.spawn(now, {
        x: f.px, y: f.py, z: f.pz,
        vx: f.vx + _dir[0] * speed, vy: f.vy + _dir[1] * speed, vz: f.vz + _dir[2] * speed,
        life: 1.1 + hash01(f.seed, i + 220) * 1.0,
        size0: scale * 0.16, size1: scale * 0.16,
        colorA: f.debrisColor, colorB: f.debrisColor,
        seed: hash01(f.seed, i + 230),
        spin: (hash01(f.seed, i + 240) - 0.5) * 22,
        axisX: hash01(f.seed, i + 250) - 0.5,
        axisY: hash01(f.seed, i + 260) - 0.5,
        axisZ: hash01(f.seed, i + 270) - 0.5,
        drag: 0.35, priority: 1,
      });
    }

    if (sev > 0.45) {
      stage.lights.spawn({
        x: f.px, y: f.py, z: f.pz, color: f.coreColor,
        peak: 18 * sev, life: 0.13, distance: scale * 34, priority: 1, falloff: 'flash',
      });
    }
  },
};

export const impactConcussion = {
  id: 'impact_concussion',
  title: 'Heavy kinetic / concussion impact',
  budget: { sparks: 62, smoke: 6, debris: 14, fronts: 2, ribbons: 4, lights: 1 },

  emit(stage, f, now) {
    const scale = f.radius;
    const sev = Math.max(0.25, Math.min(1, f.severity));
    const kick = 30 + f.impulse * 0.9;

    // 1 — compressed impact flash. Shorter and BRIGHTER than the normal impact, and it collapses
    // instead of expanding: the front that follows is what expands. Two things growing at once
    // reads as one soft blob.
    stage.sparks.spawn(now, {
      x: f.px, y: f.py, z: f.pz,
      vx: f.vx, vy: f.vy, vz: f.vz,
      life: 0.09,
      size0: scale * 3.4, size1: scale * 1.1,
      colorA: 0xffffff, colorB: f.coreColor,
      kind: KIND_FLASH, seed: hash01(f.seed, 1), priority: 6,
    });

    // 2 — THE SHOCK DISC. Oriented normal to the force path, wedged toward the direction of travel
    // when one is known and left as a full disc when only an unoriented axis exists. This is the
    // family's identity; delete it and this becomes a large normal impact.
    const axX = f.hasDir ? f.dx : f.ax;
    const axY = f.hasDir ? f.dy : f.ay;
    const axZ = f.hasDir ? f.dz : f.az;
    stage.fronts.spawnFront(now, {
      x: f.px, y: f.py, z: f.pz,
      vx: f.vx * 0.8, vy: f.vy * 0.8, vz: f.vz * 0.8,
      life: 0.34 + sev * 0.16,
      size0: scale * 0.6, size1: scale * (2.8 + sev * 1.8),
      colorA: 0xffffff, colorB: f.sheathColor,
      axisX: axX, axisY: axY, axisZ: axZ,
      seed: hash01(f.seed, 3), priority: 6,
      // Full disc when the sign is unknown; a signed hit narrows into a wedge along the force path.
      coneCos: f.hasDir ? 0.12 : -1,
      thickness: 0.75, mode: MODE_PLANE,
    });

    // 3 — a second, slower front slightly behind: the pressure wash trailing the leading edge.
    // Two fronts at different speeds is what turns "a ring" into "a shock".
    stage.schedule(0.055, f, (st, ff, t) => {
      st.fronts.spawnFront(t, {
        x: ff.px, y: ff.py, z: ff.pz,
        vx: ff.vx * 0.7, vy: ff.vy * 0.7, vz: ff.vz * 0.7,
        life: 0.5,
        size0: ff.radius * 1.0, size1: ff.radius * (2.2 + sev * 1.4),
        colorA: ff.sheathColor, colorB: 0x120404,
        axisX: axX, axisY: axY, axisZ: axZ,
        seed: hash01(ff.seed, 4), priority: 3,
        coneCos: -1, thickness: 0.2, mode: MODE_PLANE,
      });
    });

    // 4 — debris kick scaled by IMPULSE, not by severity. The brief asks for a kick "matching
    // applied impulse"; keeping those two inputs distinct is what makes a glancing heavy hit look
    // different from a dead-centre one.
    const chips = stage.count(this.budget.debris, f, 4);
    for (let i = 0; i < chips; i++) {
      burstAxis(f, i, _dir);
      coneSample(_dir, _dir[0], _dir[1], _dir[2], f.hasDir ? 0.85 : 1.25, f.seed, i + 100);
      const speed = kick * (0.45 + hash01(f.seed, i + 110) * 0.85);
      const idx = stage.debris.spawn(now, {
        x: f.px, y: f.py, z: f.pz,
        vx: f.vx + _dir[0] * speed, vy: f.vy + _dir[1] * speed, vz: f.vz + _dir[2] * speed,
        life: 1.6 + hash01(f.seed, i + 120) * 1.4,
        size0: scale * (0.16 + hash01(f.seed, i + 130) * 0.24),
        size1: scale * (0.16 + hash01(f.seed, i + 130) * 0.24),
        colorA: f.debrisColor, colorB: f.debrisColor,
        seed: hash01(f.seed, i + 140),
        spin: (hash01(f.seed, i + 150) - 0.5) * 26,
        axisX: hash01(f.seed, i + 160) - 0.5,
        axisY: hash01(f.seed, i + 170) - 0.5,
        axisZ: hash01(f.seed, i + 180) - 0.5,
        drag: 0.22, priority: 2,
      });
      // The largest few fragments get a trail. Not all of them: a trail on every chip is noise,
      // a trail on the big ones is a readable trajectory.
      if (idx >= 0 && i < 4) {
        stage.ribbons.spawn({
          x: f.px, y: f.py, z: f.pz,
          vx: f.vx + _dir[0] * speed, vy: f.vy + _dir[1] * speed, vz: f.vz + _dir[2] * speed,
          life: 0.55, width: scale * 0.20, drag: 0.22,
          colorHead: f.sheathColor, colorTail: 0x2a0a02, priority: 2,
        });
      }
    }

    // 5 — spark cone, wider and hotter than the normal impact's.
    const n = stage.count(this.budget.sparks - 12, f, 10);
    for (let i = 0; i < n; i++) {
      burstAxis(f, i, _dir);
      coneSample(_dir, _dir[0], _dir[1], _dir[2], 1.0, f.seed, i + 400);
      const speed = kick * (0.6 + hash01(f.seed, i + 410) * 1.3);
      stage.sparks.spawn(now, {
        x: f.px, y: f.py, z: f.pz,
        vx: f.vx + _dir[0] * speed, vy: f.vy + _dir[1] * speed, vz: f.vz + _dir[2] * speed,
        life: 0.22 + hash01(f.seed, i + 420) * 0.45,
        size0: scale * 0.18, size1: scale * 0.04,
        colorA: 0xfffaf0, colorB: f.sheathColor,
        kind: KIND_SPARK, seed: hash01(f.seed, i + 430),
        drag: 1.8 + hash01(f.seed, i + 440) * 2.0, priority: 1.5,
      });
    }

    // 6 — dust. Surface-local, slow, and the reason the frame still says "something hit here" half
    // a second after the light has gone.
    const puffs = stage.count(this.budget.smoke, f, 2);
    for (let i = 0; i < puffs; i++) {
      burstAxis(f, i, _dir);
      coneSample(_dir, _dir[0], _dir[1], _dir[2], 1.4, f.seed, i + 700);
      const speed = 6 + hash01(f.seed, i + 710) * 16;
      stage.smoke.spawn(now, {
        x: f.px + _dir[0] * scale * 0.4, y: f.py + _dir[1] * scale * 0.4, z: f.pz + _dir[2] * scale * 0.4,
        vx: f.vx * 0.8 + _dir[0] * speed, vy: f.vy * 0.8 + _dir[1] * speed, vz: f.vz * 0.8 + _dir[2] * speed,
        life: 1.3 + hash01(f.seed, i + 720) * 1.1,
        size0: scale * 0.5, size1: scale * 2.0,
        colorA: 0xb08868, colorB: 0x40342c,
        kind: KIND_PUFF, seed: hash01(f.seed, i + 730),
        spin: (hash01(f.seed, i + 740) - 0.5) * 1.2,
        drag: 1.6, priority: 1,
      });
    }

    stage.lights.spawn({
      x: f.px, y: f.py, z: f.pz, color: f.coreColor,
      peak: 55 * sev, life: 0.22, distance: scale * 70, priority: 3, falloff: 'flash',
    });
  },
};

export const IMPACT_FAMILIES = [impactNormal, impactConcussion];
