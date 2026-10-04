/**
 * Exhaust rotational memory — why the live jet is allowed to lag a turn.
 *
 * THE OWNER RULING THIS EXISTS FOR (2026-09-30)
 * ---------------------------------------------
 * The plume used to be a straight extrusion of the bell's CURRENT axis, so a yaw swung the whole
 * jet around like a solid tail bolted to the hull: "it's always sticking out at that exact same
 * angle to the ship and never actually flows back". The owner is explicit that this reads wrong.
 * What a streaming exhaust should do is remember the directions it was leaving in: the structure
 * far down the jet was emitted earlier, when the bell pointed elsewhere, so during a turn the jet
 * bends — root on the current axis, tail on the old one — and flows back onto the bell as the gas
 * already in flight is spent. That bend is this module's entire job.
 *
 * WHAT IS AND IS NOT SIMULATED
 * ----------------------------
 * Only ROTATION is remembered. Translation is deliberately not: exhaust parcels also inherit the
 * ship's velocity, but modelling that would re-grow the rejected "tail welded to the hull" —
 * hundreds of world units of jet at cruise (see plasmaRibbons.js, rejected construction 3). The
 * jet stays anchored at the bell; only its downstream shape carries heading history. Recorded
 * flight history remains the contrail's job (contrailTrail.js), which is untouched by this.
 *
 * The centerline is the Lagrangian answer, discretized over the stations the ribbon shader already
 * has: a parcel visible at distance d behind the bell was emitted about d / vFlow seconds ago,
 * where vFlow is the convection speed of the visible structure (the travelling wave's speed, not
 * a literal exhaust velocity). Its direction is the bell's heading at that age. Integrating those
 * directions gives the jet's spine; the shader hangs its sheets on the spine exactly as it hung
 * them on the straight axis.
 *
 * Heading is kept UNWRAPPED (continuous, not mod 2π) so a fast multi-revolution spin integrates
 * without aliasing, and the total root-to-tip bend is soft-capped: a hard pivot corkscrews the
 * jet, it does not knot it into a spiral around the bell.
 */

/** Heading samples retained. ~1.6 s at 60 Hz presentation — above the longest memory we sample. */
export const EXHAUST_LAG_CAPACITY = 96;

function softClampBend(raw, maxBend) {
  if (!(maxBend > 1e-4)) return 0;
  // tanh saturates smoothly: bends under ~half the cap pass through nearly linearly, a wild spin
  // flattens asymptotically at the cap instead of wrapping the jet around the bell.
  return Math.tanh(raw / maxBend) * maxBend;
}

/**
 * Heading history for one emitting nozzle, and the centerline builder that consumes it.
 * All methods are allocation-free; `record` + `buildCenterline` per frame is the entire cost.
 */
export function createExhaustLag(opts = {}) {
  const capacity = Math.max(8, opts.capacity || EXHAUST_LAG_CAPACITY);
  const times = new Float32Array(capacity);
  const headings = new Float32Array(capacity);
  let head = -1; // ring index of the newest sample
  let count = 0;
  let lastHeading = 0;
  let hasSample = false;

  return {
    /** Forget all history. Called on reset, owner change and teleport-scale jumps. */
    reset() {
      head = -1;
      count = 0;
      hasSample = false;
      lastHeading = 0;
    },

    /** @param {number} timeS the system's own flow clock, seconds @param {number} headingRad */
    record(timeS, headingRad) {
      let h = headingRad;
      if (hasSample) {
        // Unwrap against the previous sample: a 350°→10° turn continues +20°, never −330°.
        while (h - lastHeading > Math.PI) h -= Math.PI * 2;
        while (h - lastHeading < -Math.PI) h += Math.PI * 2;
      }
      lastHeading = h;
      hasSample = true;
      head = (head + 1) % capacity;
      if (count < capacity) count++;
      times[head] = timeS;
      headings[head] = h;
    },

    /** Heading the bell held `ageS` before `nowS`, linearly interpolated. Clamps at both ends. */
    headingAt(nowS, ageS) {
      if (!count) return lastHeading;
      const target = nowS - Math.max(0, ageS);
      // Samples are strictly ordered newest→oldest walking back from `head`. Ages queried by the
      // builder grow monotonically per build, so this scan is short in practice.
      let i = 0;
      let older = head;
      while (i < count - 1 && times[older] > target) {
        i++;
        older = (head - i + capacity) % capacity;
      }
      if (i === 0) return headings[older]; // target is newer than every sample
      const newer = (older + 1) % capacity;
      const tA = times[older];
      const tB = times[newer];
      if (!(tB > tA)) return headings[older]; // degenerate/duplicate timestamps
      const f = Math.max(0, Math.min(1, (target - tA) / (tB - tA)));
      return headings[older] + (headings[newer] - headings[older]) * f;
    },

    /**
     * Integrate the historical directions into a world-space centerline.
     *
     * @param {object} p
     * @param {Float32Array} p.out length >= count*4, filled as [x,y,z,bend] per station
     * @param {number} p.count stations to fill (the ribbon shader's station count)
     * @param {number} p.x|p.y|p.z current nozzle world position (station 0)
     * @param {number} p.heading current exhaust heading, radians (atan2(aftZ, aftX))
     * @param {number} p.nowS current flow-clock time
     * @param {number} p.tipAgeS age of the gas at the tip: how far back memory reaches
     * @param {number} p.jetLength current jet length in world units
     * @param {number} [p.rootOffset] WU the spine's first station stands aft of the nozzle (a
     *   detached slug has left the throat; 0 keeps the root exactly on the bell, as always)
     * @param {number} p.maxBendRad soft cap on the root-to-tip bend
     * @returns {number} absolute bend at the tip, radians (0 when straight)
     */
    buildCenterline(p) {
      const out = p.out;
      // `count` is the ring's live sample total in this closure; the station total is `stations`.
      const stations = Math.max(2, p.count | 0);
      const step = (Number(p.jetLength) || 0) / (stations - 1);
      const headHeading = Number(p.heading) || 0;
      const maxBend = Number(p.maxBendRad) || 0;
      let x = Number(p.x) || 0;
      let y = Number(p.y) || 0;
      let z = Number(p.z) || 0;
      let dirX = Math.cos(headHeading);
      let dirZ = Math.sin(headHeading);
      const root = Math.max(0, Number(p.rootOffset) || 0);
      if (root > 0) { x += dirX * root; z += dirZ * root; }
      out[0] = x; out[1] = y; out[2] = z; out[3] = 0;
      let tipBend = 0;
      // Fewer than two samples is no history at all: return the straight spine rather than
      // reading heading 0 as if the bell had been pointing there forever.
      const hasHistory = count >= 2;
      const inv = 1 / (stations - 1);
      for (let k = 1; k < stations; k++) {
        const s = k * inv;
        const age = (Number(p.tipAgeS) || 0) * s;
        const raw = hasHistory
          ? headHeading - this.headingAt(Number(p.nowS) || 0, age)
          : 0;
        const bend = softClampBend(raw, maxBend);
        tipBend = Math.abs(bend);
        const a = headHeading - bend;
        dirX = Math.cos(a);
        dirZ = Math.sin(a);
        x += dirX * step;
        z += dirZ * step;
        const o = k * 4;
        out[o] = x; out[o + 1] = y; out[o + 2] = z;
        out[o + 3] = Math.abs(bend) / (maxBend > 1e-4 ? maxBend : 1);
      }
      return tipBend;
    },

    /** Diagnostics: newest heading, retained span, and sample count. */
    inspect() {
      return {
        samples: count,
        capacity,
        spanS: count > 1 ? times[head] - times[(head - count + 1 + capacity) % capacity] : 0,
        heading: lastHeading,
      };
    },
  };
}

/** Convenience for probes: the analytic straight-line centerline a cold lag produces. */
export function straightCenterlineTip(params) {
  const c = params.count | 0;
  return {
    x: (Number(params.x) || 0) + Math.cos(Number(params.heading) || 0) * (Number(params.jetLength) || 0),
    z: (Number(params.z) || 0) + Math.sin(Number(params.heading) || 0) * (Number(params.jetLength) || 0),
    stations: c,
  };
}

export const __testables = { softClampBend };
