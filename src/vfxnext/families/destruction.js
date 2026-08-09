// VFX NEXT — families 3 and 4: light-ship destruction, heavy explosion.
//
// The brief's sharpest note is that a heavy explosion must be "a multiple-stage event rather than
// one expanding sprite". That is a TIMING requirement, not an art requirement, so it is expressed
// here as an authored beat sheet run through the stage scheduler. Each beat carries the same causal
// force record, which is why a ship that dies at 180 wu/s throws every stage — flash, front,
// fragments, secondaries, embers — downrange with it instead of leaving a stationary fireball
// behind while the wreck slides away. That inheritance is the whole difference between a explosion
// that happened TO something and an explosion that was played AT a position.
//
// Light destruction is deliberately NOT a small heavy explosion. It has no pressure front and no
// secondaries: it is breakup plus engine flare-out, over in well under a second. Giving a fighter
// the capital-ship beat sheet is how a game ends up with one explosion.

import { KIND_FLASH, KIND_FIRE, KIND_SPARK, KIND_EMBER, KIND_PUFF } from '../core/gpuAged.js';
import { MODE_PLANE } from '../core/solids.js';
import { coneSample, hash01 } from '../core/force.js';

const _dir = new Float32Array(3);

/** Direction a breakup should favour. Lethal receipts carry a signed killing direction; when they
 *  do not, breakup opens symmetrically about the contact axis and the inherited velocity alone
 *  carries the trajectory read. */
function breakupAxis(f, i, out) {
  if (f.hasDir) { out[0] = f.dx; out[1] = f.dy; out[2] = f.dz; return out; }
  const s = (i & 1) ? -1 : 1;
  out[0] = f.ax * s; out[1] = f.ay * s; out[2] = f.az * s;
  return out;
}

export const destructionLight = {
  id: 'destruction_light',
  title: 'Light-ship destruction',
  budget: { sparks: 70, smoke: 5, debris: 22, fronts: 1, ribbons: 8, lights: 1 },

  emit(stage, f, now) {
    const scale = f.radius;
    const sev = Math.max(0.3, Math.min(1, f.severity));
    const spd = Math.hypot(f.vx, f.vy, f.vz);

    // 1 — the kill flash. One frame of white, then out of the way. A light ship should be GONE
    // fast; a long flash reads as a much larger vessel dying.
    stage.sparks.spawn(now, {
      x: f.px, y: f.py, z: f.pz, vx: f.vx, vy: f.vy, vz: f.vz,
      life: 0.13,
      size0: scale * 1.2, size1: scale * 5.5,
      colorA: 0xffffff, colorB: f.coreColor,
      kind: KIND_FLASH, seed: hash01(f.seed, 1), priority: 7,
    });

    stage.fronts.spawnFront(now, {
      x: f.px, y: f.py, z: f.pz, vx: f.vx, vy: f.vy, vz: f.vz,
      life: 0.28,
      size0: scale * 0.8, size1: scale * 3.0,
      colorA: 0xfff4e0, colorB: f.sheathColor,
      axisX: f.hasAxis ? f.ax : 0, axisY: f.hasAxis ? f.ay : 1, axisZ: f.hasAxis ? f.az : 0,
      seed: hash01(f.seed, 2), priority: 5,
      thickness: 0.65, mode: MODE_PLANE,
    });

    // 2 — BALLISTIC PIECES. The brief asks for "several ballistic pieces"; several is the right
    // number. Eight recognisable tumbling chunks read as a ship coming apart. Sixty read as gravel,
    // and gravel is what makes destruction feel cheap.
    const pieces = stage.count(this.budget.debris, f, 5);
    for (let i = 0; i < pieces; i++) {
      breakupAxis(f, i, _dir);
      coneSample(_dir, _dir[0], _dir[1], _dir[2], f.hasDir ? 1.05 : 1.5, f.seed, i + 10);
      const throwSpeed = (16 + hash01(f.seed, i + 20) * 46) * (0.6 + sev * 0.7);
      const vx = f.vx + _dir[0] * throwSpeed;
      const vy = f.vy + _dir[1] * throwSpeed;
      const vz = f.vz + _dir[2] * throwSpeed;
      // Big pieces near the front of the list, chips behind: a size ladder reads as structure.
      const sizeMul = 0.42 * Math.pow(0.82, i) + 0.09 + hash01(f.seed, i + 25) * 0.10;
      stage.debris.spawn(now, {
        x: f.px + _dir[0] * scale * 0.3, y: f.py + _dir[1] * scale * 0.3, z: f.pz + _dir[2] * scale * 0.3,
        vx, vy, vz,
        life: 2.4 + hash01(f.seed, i + 30) * 2.2,
        size0: scale * sizeMul, size1: scale * sizeMul,
        colorA: f.debrisColor, colorB: f.debrisColor,
        seed: hash01(f.seed, i + 40),
        spin: (hash01(f.seed, i + 50) - 0.5) * 16,
        axisX: hash01(f.seed, i + 60) - 0.5,
        axisY: hash01(f.seed, i + 70) - 0.5,
        axisZ: hash01(f.seed, i + 80) - 0.5,
        drag: 0.06, priority: 3,
      });

      // 3 — short debris trails on the largest pieces only. "Short" is load-bearing: a long trail
      // turns breakup into fireworks. These die in half a second and leave the pieces flying.
      if (i < 5) {
        stage.ribbons.spawn({
          x: f.px, y: f.py, z: f.pz, vx, vy, vz,
          life: 0.42 + hash01(f.seed, i + 90) * 0.25,
          width: scale * 0.45 * (1 - i * 0.13),
          drag: 0.06,
          colorHead: f.coreColor, colorTail: 0x3a0c02,
          priority: 3,
        });
      }
    }

    // 4 — ENGINE FLARE-OUT. The detail that makes this family specifically a SHIP dying: the drive
    // over-runs for a moment and dumps a directional jet along the hull's own heading before it
    // cuts. It is aimed by the inherited velocity, so it always points where the ship was going.
    if (spd > 1) {
      const bx = -f.vx / spd, by = -f.vy / spd, bz = -f.vz / spd;
      stage.schedule(0.04, f, (st, ff, t) => {
        const jets = st.count(16, ff, 6);
        for (let i = 0; i < jets; i++) {
          coneSample(_dir, bx, by, bz, 0.30, ff.seed, i + 300);
          const s2 = 60 + hash01(ff.seed, i + 310) * 90;
          st.sparks.spawn(t, {
            x: ff.px, y: ff.py, z: ff.pz,
            vx: ff.vx + _dir[0] * s2, vy: ff.vy + _dir[1] * s2, vz: ff.vz + _dir[2] * s2,
            life: 0.20 + hash01(ff.seed, i + 320) * 0.20,
            size0: scale * 0.22, size1: scale * 0.05,
            colorA: 0xdff2ff, colorB: 0x2f6cff,
            kind: KIND_SPARK, seed: hash01(ff.seed, i + 330),
            drag: 2.2, priority: 2,
          });
        }
        st.sparks.spawn(t, {
          x: ff.px, y: ff.py, z: ff.pz, vx: ff.vx, vy: ff.vy, vz: ff.vz,
          life: 0.22, size0: scale * 0.9, size1: scale * 0.1,
          colorA: 0xeaf6ff, colorB: 0x2255ff,
          kind: KIND_FLASH, seed: hash01(ff.seed, 5), priority: 4,
        });
      });
    }

    // 5 — sparks and cinders.
    const n = stage.count(this.budget.sparks, f, 12);
    for (let i = 0; i < n; i++) {
      breakupAxis(f, i, _dir);
      coneSample(_dir, _dir[0], _dir[1], _dir[2], 1.6, f.seed, i + 400);
      const s2 = 30 + hash01(f.seed, i + 410) * 110;
      const ember = i % 3 === 0;
      stage.sparks.spawn(now, {
        x: f.px, y: f.py, z: f.pz,
        vx: f.vx + _dir[0] * s2, vy: f.vy + _dir[1] * s2, vz: f.vz + _dir[2] * s2,
        life: ember ? 1.1 + hash01(f.seed, i + 420) * 1.6 : 0.26 + hash01(f.seed, i + 430) * 0.4,
        size0: scale * (ember ? 0.07 : 0.16), size1: scale * 0.03,
        colorA: ember ? f.coreColor : 0xfff4de, colorB: ember ? 0x7a1f04 : f.sheathColor,
        kind: ember ? KIND_EMBER : KIND_SPARK,
        seed: hash01(f.seed, i + 440),
        drag: ember ? 0.6 : 1.9, priority: 1,
      });
    }

    const puffs = stage.count(this.budget.smoke, f, 2);
    for (let i = 0; i < puffs; i++) {
      breakupAxis(f, i, _dir);
      coneSample(_dir, _dir[0], _dir[1], _dir[2], 1.9, f.seed, i + 600);
      stage.smoke.spawn(now, {
        x: f.px, y: f.py, z: f.pz,
        vx: f.vx * 0.9 + _dir[0] * 12, vy: f.vy * 0.9 + _dir[1] * 12, vz: f.vz * 0.9 + _dir[2] * 12,
        life: 1.6 + hash01(f.seed, i + 610) * 1.2,
        size0: scale * 0.6, size1: scale * 2.4,
        colorA: 0x6b5040, colorB: 0x2a2320,
        kind: KIND_PUFF, seed: hash01(f.seed, i + 620),
        spin: (hash01(f.seed, i + 630) - 0.5) * 1.0,
        drag: 1.2, priority: 1,
      });
    }

    stage.lights.spawn({
      x: f.px, y: f.py, z: f.pz, color: f.coreColor,
      peak: 70 * sev, life: 0.3, distance: scale * 90, priority: 4, falloff: 'flash',
    });
  },
};

// ---------------------------------------------------------------------------------------------
// Heavy explosion — the beat sheet
// ---------------------------------------------------------------------------------------------
//
// t=0.00  FLASH          white punch-out + peak light. No expansion yet.
// t=0.05  PRESSURE FRONT oriented compression disc + a slower wash behind it.
// t=0.10  COMBUSTION     slow warm cores that keep the fireball burning through the dark gap.
// t=0.14  BREAKUP        large structural pieces with trails; the ship stops existing here.
// t=0.30  PLUME          smoke body starts, so the later fires have something to burn against.
// t=0.55  SECONDARY 1    offset internal detonation, its own small front and light.
// t=1.05  SECONDARY 2    second offset detonation, weaker, different offset.
// t=1.70  SECONDARY 3    last cook-off, sparks only.
// t=0..6  EMBERS         long-lived cinders drifting on the inherited velocity.
//
// Seven scheduler slots per event out of SCHEDULE_CAP 96, so ~13 concurrent heavy explosions before
// scheduling saturates. The stage counts drops rather than growing the array, which is the honest
// behaviour: a dropped fourth secondary is invisible, a resized buffer mid-frame is a hitch.

export const explosionHeavy = {
  id: 'explosion_heavy',
  title: 'Heavy explosion (multi-stage)',
  budget: { sparks: 220, smoke: 26, debris: 46, fronts: 5, ribbons: 10, lights: 3 },

  emit(stage, f, now) {
    const scale = f.radius;
    const sev = Math.max(0.4, Math.min(1, f.severity));

    // --- t=0: flash ---
    stage.sparks.spawn(now, {
      x: f.px, y: f.py, z: f.pz, vx: f.vx, vy: f.vy, vz: f.vz,
      life: 0.16, size0: scale * 1.6, size1: scale * 7.0,
      colorA: 0xffffff, colorB: 0xffe0a0,
      kind: KIND_FLASH, seed: hash01(f.seed, 1), priority: 10,
    });
    stage.lights.spawn({
      x: f.px, y: f.py, z: f.pz, color: 0xffd28a,
      peak: 160 * sev, life: 0.42, distance: scale * 200, priority: 9, falloff: 'flash',
    });

    // --- t=0.05: pressure front ---
    stage.schedule(0.05, f, (st, ff, t) => {
      const ax = ff.hasAxis ? ff.ax : 0, ay = ff.hasAxis ? ff.ay : 1, az = ff.hasAxis ? ff.az : 0;
      // FRONT REACH CONVENTION (library-wide): a shock front settles between 2.5x and 5x the event
      // radius. Larger values look impressive in a close diagnostic view and then expand straight
      // past the frame edge at the 110 WU acceptance distance, where they read as nothing at all.
      // An earlier draft of this family used 28x and was invisible for exactly that reason.
      st.fronts.spawnFront(t, {
        x: ff.px, y: ff.py, z: ff.pz, vx: ff.vx, vy: ff.vy, vz: ff.vz,
        life: 0.55,
        size0: scale * 0.8, size1: scale * (2.4 + sev * 1.4),
        colorA: 0xffffff, colorB: 0xff8a30,
        axisX: ax, axisY: ay, axisZ: az,
        seed: hash01(ff.seed, 2), priority: 9,
        thickness: 0.9, mode: MODE_PLANE,
      });
      // The trailing wave. It must be a genuinely SLOWER, SMALLER second front — not a soft copy of
      // the first at the same radius. Two fronts sharing a radius with a low thickness exponent
      // overlap into a hard-edged translucent sphere, which is the single most convincing way to
      // make an explosion look like browser-demo geometry. Half the reach, tight wall, dimmer.
      st.fronts.spawnFront(t, {
        x: ff.px, y: ff.py, z: ff.pz, vx: ff.vx, vy: ff.vy, vz: ff.vz,
        life: 0.9,
        size0: scale * 0.5, size1: scale * (1.2 + sev * 0.7),
        colorA: 0xff8a2c, colorB: 0x2a0800,
        axisX: ax, axisY: ay, axisZ: az,
        seed: hash01(ff.seed, 3), priority: 7,
        thickness: 0.8, mode: MODE_PLANE,
      });
    });

    // --- t=0.14: structural breakup ---
    stage.schedule(0.14, f, (st, ff, t) => {
      const pieces = st.count(46, ff, 8);
      for (let i = 0; i < pieces; i++) {
        breakupAxis(ff, i, _dir);
        coneSample(_dir, _dir[0], _dir[1], _dir[2], 1.7, ff.seed, i + 10);
        const throwSpeed = (20 + hash01(ff.seed, i + 20) * 70) * (0.55 + sev * 0.8);
        const vx = ff.vx + _dir[0] * throwSpeed;
        const vy = ff.vy + _dir[1] * throwSpeed;
        const vz = ff.vz + _dir[2] * throwSpeed;
        const sizeMul = 0.5 * Math.pow(0.88, i) + 0.06 + hash01(ff.seed, i + 25) * 0.12;
        st.debris.spawn(t, {
          x: ff.px, y: ff.py, z: ff.pz, vx, vy, vz,
          life: 3.5 + hash01(ff.seed, i + 30) * 3.0,
          size0: scale * sizeMul, size1: scale * sizeMul,
          colorA: ff.debrisColor, colorB: ff.debrisColor,
          seed: hash01(ff.seed, i + 40),
          spin: (hash01(ff.seed, i + 50) - 0.5) * 13,
          axisX: hash01(ff.seed, i + 60) - 0.5,
          axisY: hash01(ff.seed, i + 70) - 0.5,
          axisZ: hash01(ff.seed, i + 80) - 0.5,
          drag: 0.04, priority: 4,
        });
        if (i < 6) {
          st.ribbons.spawn({
            x: ff.px, y: ff.py, z: ff.pz, vx, vy, vz,
            life: 0.5 + hash01(ff.seed, i + 90) * 0.3,
            width: scale * 0.55 * (1 - i * 0.1), drag: 0.04,
            colorHead: 0xffd6a0, colorTail: 0x2a0800, priority: 4,
          });
        }
      }
      const n = st.count(150, ff, 24);
      for (let i = 0; i < n; i++) {
        breakupAxis(ff, i, _dir);
        coneSample(_dir, _dir[0], _dir[1], _dir[2], 1.9, ff.seed, i + 400);
        const s2 = 40 + hash01(ff.seed, i + 410) * 170;
        const ember = i % 4 === 0;
        st.sparks.spawn(t, {
          x: ff.px, y: ff.py, z: ff.pz,
          vx: ff.vx + _dir[0] * s2, vy: ff.vy + _dir[1] * s2, vz: ff.vz + _dir[2] * s2,
          life: ember ? 2.0 + hash01(ff.seed, i + 420) * 4.0 : 0.3 + hash01(ff.seed, i + 430) * 0.55,
          size0: scale * (ember ? 0.06 : 0.18), size1: scale * 0.03,
          colorA: ember ? 0xffb469 : 0xfff6e4, colorB: ember ? 0x5e1503 : 0xff7a2a,
          kind: ember ? KIND_EMBER : KIND_SPARK,
          seed: hash01(ff.seed, i + 440),
          drag: ember ? 0.35 : 1.5, priority: ember ? 0.8 : 1.2,
        });
      }
    });

    // --- t=0.10: COMBUSTION. The beat that keeps the event alive between the flash and the first
    // cook-off. Without it the flash dies at 0.16 s, the first secondary does not fire until 0.55 s,
    // and the explosion goes DARK for 400 ms in the middle of itself — a hole that reads as the
    // effect having ended and then restarting. These are slow, warm, drifting cores that inherit the
    // wreck's velocity, so the fireball travels with the hull instead of hanging behind it.
    stage.schedule(0.10, f, (st, ff, t) => {
      const fires = st.count(12, ff, 4);
      for (let i = 0; i < fires; i++) {
        breakupAxis(ff, i, _dir);
        coneSample(_dir, _dir[0], _dir[1], _dir[2], 1.9, ff.seed, i + 800);
        const drift = 4 + hash01(ff.seed, i + 810) * 22;
        st.sparks.spawn(t, {
          x: ff.px + _dir[0] * scale * 0.5, y: ff.py + _dir[1] * scale * 0.5, z: ff.pz + _dir[2] * scale * 0.5,
          vx: ff.vx + _dir[0] * drift, vy: ff.vy + _dir[1] * drift, vz: ff.vz + _dir[2] * drift,
          // Staggered lifetimes so the body of fire decays raggedly rather than switching off.
          life: 0.45 + hash01(ff.seed, i + 820) * 0.85,
          size0: scale * (1.1 + hash01(ff.seed, i + 830) * 0.9),
          size1: scale * (2.0 + hash01(ff.seed, i + 840) * 1.4),
          colorA: 0xffc061, colorB: 0x6e1a04,
          kind: KIND_FIRE, seed: hash01(ff.seed, i + 850),
          drag: 1.4, priority: 4,
        });
      }
    });

    // --- t=0.30: the plume body ---
    stage.schedule(0.30, f, (st, ff, t) => {
      // SMOKE IN SPACE IS A SUPPORTING ELEMENT, NOT A BODY. The terrestrial model — smoke is the
      // dark plate the fire reads against — INVERTS here: against a near-black void, any puff bright
      // enough to be seen is brighter than the background, so a large smoke mass can only lighten
      // the frame. Successive drafts at 26, 20 and 10 large puffs all produced the same pale
      // translucent dome, which is the "translucent geometry plus bloom" look this library exists to
      // replace. The fireball body is carried by KIND_FIRE combustion cores instead; smoke is a few
      // small wisps riding with the fragments.
      const puffs = st.count(6, ff, 2);
      for (let i = 0; i < puffs; i++) {
        breakupAxis(ff, i, _dir);
        coneSample(_dir, _dir[0], _dir[1], _dir[2], 2.0, ff.seed, i + 600);
        const s2 = 22 + hash01(ff.seed, i + 610) * 44;
        st.smoke.spawn(t, {
          x: ff.px + _dir[0] * scale, y: ff.py + _dir[1] * scale, z: ff.pz + _dir[2] * scale,
          vx: ff.vx + _dir[0] * s2, vy: ff.vy + _dir[1] * s2, vz: ff.vz + _dir[2] * s2,
          life: 2.6 + hash01(ff.seed, i + 620) * 2.4,
          size0: scale * 0.30, size1: scale * (0.75 + hash01(ff.seed, i + 625) * 0.55),
          colorA: 0x5a3220, colorB: 0x140f0d,
          kind: KIND_PUFF, seed: hash01(ff.seed, i + 630),
          spin: (hash01(ff.seed, i + 640) - 0.5) * 0.8,
          drag: 0.9, priority: 1.5,
        });
      }
    });

    // --- secondaries: offset, weakening, each with its own small front ---
    const SECONDARIES = [
      { at: 0.55, power: 0.62, off: 0.9 },
      { at: 1.05, power: 0.40, off: 1.4 },
      { at: 1.70, power: 0.22, off: 0.6 },
    ];
    for (let k = 0; k < SECONDARIES.length; k++) {
      const beat = SECONDARIES[k];
      stage.schedule(beat.at, f, (st, ff, t) => {
        // Offset INSIDE the wreck volume, carried along by the wreck's own drift. A secondary that
        // fires at the original world position after a fast kill is the tell that the explosion is
        // a canned sequence rather than a thing happening to a moving object.
        const ox = (hash01(ff.seed, k * 7 + 1) - 0.5) * scale * 2 * beat.off;
        const oy = (hash01(ff.seed, k * 7 + 2) - 0.5) * scale * 2 * beat.off;
        const oz = (hash01(ff.seed, k * 7 + 3) - 0.5) * scale * 2 * beat.off;
        const dx = ff.px + ox + ff.vx * beat.at;
        const dy = ff.py + oy + ff.vy * beat.at;
        const dz = ff.pz + oz + ff.vz * beat.at;

        st.sparks.spawn(t, {
          x: dx, y: dy, z: dz, vx: ff.vx, vy: ff.vy, vz: ff.vz,
          life: 0.14, size0: scale * 0.5, size1: scale * 3.0 * beat.power,
          colorA: 0xfff2d0, colorB: 0xff7020,
          kind: KIND_FLASH, seed: hash01(ff.seed, k + 50), priority: 5,
        });
        if (beat.power > 0.3) {
          st.fronts.spawnFront(t, {
            x: dx, y: dy, z: dz, vx: ff.vx, vy: ff.vy, vz: ff.vz,
            life: 0.4,
            size0: scale * 0.4, size1: scale * 3.0 * beat.power,
            colorA: 0xffe0b0, colorB: 0xff6018,
            axisX: hash01(ff.seed, k + 60) - 0.5,
            axisY: hash01(ff.seed, k + 61) - 0.5,
            axisZ: hash01(ff.seed, k + 62) - 0.5,
            seed: hash01(ff.seed, k + 63), priority: 5,
            thickness: 0.7, mode: MODE_PLANE,
          });
          st.lights.spawn({
            x: dx, y: dy, z: dz, color: 0xff9a40,
            peak: 70 * beat.power, life: 0.3, distance: scale * 90, priority: 5, falloff: 'flash',
          });
        }
        const n = st.count(Math.round(46 * beat.power), ff, 6);
        for (let i = 0; i < n; i++) {
          coneSample(_dir, hash01(ff.seed, i + k * 31 + 1) - 0.5, hash01(ff.seed, i + k * 31 + 2) - 0.5,
            hash01(ff.seed, i + k * 31 + 3) - 0.5, 1.8, ff.seed, i + k * 90);
          const s2 = (25 + hash01(ff.seed, i + 700) * 80) * beat.power;
          st.sparks.spawn(t, {
            x: dx, y: dy, z: dz,
            vx: ff.vx + _dir[0] * s2, vy: ff.vy + _dir[1] * s2, vz: ff.vz + _dir[2] * s2,
            life: 0.3 + hash01(ff.seed, i + 710) * 0.8,
            size0: scale * 0.12, size1: scale * 0.03,
            colorA: 0xffe6c0, colorB: 0xd03a08,
            kind: KIND_SPARK, seed: hash01(ff.seed, i + 720),
            drag: 1.3, priority: 1,
          });
        }
      });
    }
  },
};

export const DESTRUCTION_FAMILIES = [destructionLight, explosionHeavy];
