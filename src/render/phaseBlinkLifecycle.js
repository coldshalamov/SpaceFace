// Veil Step presentation clock. Pure numbers — the shader copies these curves.
// A slit is already a wound or it races open from the middle. It never grows
// as one ball and then shrinks back. Material exhales or is swallowed, then
// leftovers keep travelling while a zipper closes the cut.

export const VEIL_MIN_RANGE = 36;
export const VEIL_MAX_RANGE = 240;
export const ARRIVE_DUR = 0.96;
export const DEPART_DUR = 0.88;
export const DRAIN_DUR = 0.4;

export function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

export function smoothstep(edge0, edge1, x) {
  const span = edge1 - edge0;
  if (!(span > 0)) return x >= edge1 ? 1 : 0;
  const t = clamp01((x - edge0) / span);
  return t * t * (3 - 2 * t);
}

/** Charge 0..1 → the shadow's lawful reach. Kept in lockstep with phaseBlinkRange. */
export function wantedRange(charge) {
  return VEIL_MIN_RANGE + (VEIL_MAX_RANGE - VEIL_MIN_RANGE) * clamp01(charge);
}

/**
 * One clock sample. `simTime` wins over wall dt so a pause (frozen sim) holds
 * the picture. A backwards clock is a rewind. A stall longer than a quarter
 * second means the moment already passed offscreen — drop residue rather than
 * play it late in slow motion. Ordinary hitches advance at most 50 ms so the
 * ignition is not skipped inside one long frame.
 */
export function integrateClock(prev, simTime, wallDt) {
  const sim = Number(simTime);
  if (Number.isFinite(sim)) {
    if (!Number.isFinite(prev)) return { step: 0, next: sim, rewind: false, drop: false };
    const delta = sim - prev;
    if (delta < -0.02) return { step: 0, next: sim, rewind: true, drop: false };
    if (delta > 0.25) return { step: 0, next: sim, rewind: false, drop: true };
    return { step: Math.min(delta, 0.05), next: sim, rewind: false, drop: false };
  }
  const wall = Number(wallDt);
  if (!Number.isFinite(wall) || wall <= 0) {
    return { step: 0, next: prev, rewind: false, drop: false };
  }
  if (wall > 0.25) return { step: 0, next: prev, rewind: false, drop: true };
  return { step: Math.min(wall, 0.05), next: prev, rewind: false, drop: false };
}

/** Free slot, else the residue closest to finished. A new step is never silent. */
export function pickSlot(slots) {
  let steal = 0;
  let stealRatio = -1;
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i];
    if (!slot || !slot.alive) return i;
    const dur = slot.dur > 0 ? slot.dur : 1;
    const ratio = slot.age / dur;
    if (ratio > stealRatio) {
      stealRatio = ratio;
      steal = i;
    }
  }
  return steal;
}

/**
 * 0 at the cut's ends, 1 where the wound is still open.
 * Arrival zips from the middle out. Departure zips from the nose back along the hull.
 * `spread` races the tear itself so the ends are born after the middle.
 */
export function slitMask(mode, along, spread, zip) {
  const u = clamp01(along);
  const reach = Math.abs(u - 0.5) * 2;
  const born = mode === 'depart'
    ? smoothstep(0, 0.14, spread * 1.16 - (1 - u))
    : smoothstep(0, 0.14, spread * 1.16 - reach);
  const dist = mode === 'depart' ? (1 - u) : reach;
  const shut = smoothstep(0, 0.16, zip * 1.16 - dist);
  return born * (1 - shut);
}

/** Stagger so six membranes do not arrive as one sheet. Ribbon 0 and 1 are the slit. */
export function membraneDelay(ribbon) {
  const i = Number(ribbon) - 2;
  if (!Number.isFinite(i) || i < 0) return 0;
  return (i * 0.17) * 0.22;
}

/**
 * Broken parcels along a filament. Returns 0 inside the gap so the bridge is
 * not a solid tape. `flow` is a signed scroll (aim forward, drain backward).
 */
export function filamentParcel(along, phase, flow) {
  const u = clamp01(along);
  const p = Number.isFinite(phase) ? phase : 0;
  const f = Number.isFinite(flow) ? flow : 0;
  let s = (u * 2.4 - f * 0.35 + p) % 1;
  if (s < 0) s += 1;
  if (s > 0.62 && s < 0.88) return 0;
  if (s < 0.08) return s / 0.08;
  if (s > 0.54) return Math.max(0, (0.62 - s) / 0.08);
  return 1;
}

function hotSpike(t, flashReduce, peak, decay) {
  if (flashReduce) return 0;
  if (t <= peak) return smoothstep(0, peak, t);
  return 1 - smoothstep(peak, decay, t);
}

/** Arrival continues the held wound. The cut is already open. Matter blows out,
 * the opaque body is swallowed back into the cut, scraps that tore free keep
 * going, then the cut zips. `extrude` is the supply that never retracts;
 * `suck` is only the cloud body returning. */
export function sampleArrival(t, reduced, flashReduce) {
  const u = clamp01(t);
  if (reduced) {
    return {
      spread: 1,
      open: 0.8,
      zip: smoothstep(0.56, 0.98, u),
      extrude: 1,
      suck: smoothstep(0.45, 0.9, u),
      detach: smoothstep(0.5, 1, u),
      hot: flashReduce ? 0 : (u < 0.2 ? 0.28 * (1 - u / 0.2) : 0),
      fade: 1 - smoothstep(0.8, 1, u),
    };
  }
  return {
    spread: 1,
    open: 0.8,
    zip: smoothstep(0.58, 0.98, u),
    extrude: 0.12 + 0.88 * smoothstep(0, 0.42, u),
    suck: smoothstep(0.4, 0.86, u),
    detach: smoothstep(0.54, 0.96, u),
    hot: hotSpike(u, flashReduce, 0.06, 0.28) * 0.9,
    fade: 1 - smoothstep(0.9, 1, u) * 0.4,
  };
}

/** Departure is the hull leaving a cut behind. The tear races from the nose,
 * the cloud blows out and is swallowed, scraps escape. */
export function sampleDeparture(t, reduced, flashReduce) {
  const u = clamp01(t);
  if (reduced) {
    return {
      spread: 1,
      open: 0.86,
      zip: smoothstep(0.5, 0.98, u),
      extrude: 1,
      suck: smoothstep(0.35, 0.9, u),
      detach: smoothstep(0.46, 1, u),
      hot: flashReduce ? 0 : (u < 0.16 ? 0.25 * (1 - u / 0.16) : 0),
      fade: 1 - smoothstep(0.78, 1, u),
    };
  }
  return {
    spread: smoothstep(0, 0.2, u),
    open: 0.34 + 0.56 * smoothstep(0, 0.12, u),
    zip: smoothstep(0.48, 0.98, u),
    extrude: smoothstep(0, 0.18, u),
    suck: smoothstep(0.2, 0.55, u),
    detach: smoothstep(0.4, 0.9, u),
    hot: hotSpike(u, flashReduce, 0.05, 0.24) * 0.8,
    fade: 1,
  };
}

/** Held shadow. The destination cut opens with charge and then holds — it does not throb. */
export function sampleAim(charge, blocked, reduced, flashReduce) {
  const c = clamp01(charge);
  if (reduced) {
    return {
      spread: blocked ? 0.5 : 1,
      open: blocked ? 0.36 : 0.74,
      zip: 0,
      extrude: blocked ? 0.12 : 0.34,
      suck: 0,
      detach: 0,
      hot: 0,
      fade: blocked ? 0.7 : 1,
      warn: blocked ? 1 : 0,
    };
  }
  return {
    spread: blocked ? 0.42 + 0.08 * c : Math.min(1, 0.15 + c * 0.95),
    open: blocked ? 0.26 + 0.1 * c : 0.16 + 0.64 * c,
    zip: 0,
    extrude: blocked ? 0.08 : 0.04 + 0.08 * c,
    suck: 0,
    detach: 0,
    hot: flashReduce ? 0 : (blocked ? 0.12 : 0.04 + 0.06 * c),
    fade: 1,
    warn: blocked ? 1 : 0,
  };
}

/** Supply stops. The cut zips. Parcels already in flight are pulled back. Nothing new is born. */
export function sampleDrain(t, reduced) {
  const u = clamp01(t);
  return {
    spread: 1,
    open: reduced ? 0.4 : 0.62,
    zip: smoothstep(0.08, 0.96, u),
    extrude: 0.3,
    suck: smoothstep(0, 0.82, u),
    detach: smoothstep(0.35, 1, u),
    hot: 0,
    fade: 1 - smoothstep(0.62, 1, u),
    warn: 0,
  };
}

/** Opaque cloud envelope. Supply (`extrude`) blows the body out; `suck` swallows
 * that body back into the cut. Detached ribbon scraps are not this number. */
export function cloudBody(sample) {
  const out = clamp01(sample && sample.extrude);
  const back = clamp01(sample && sample.suck);
  return out * (1 - back * 0.92);
}

export function accessFlags(state) {
  const settings = state && state.settings;
  const video = settings && settings.video;
  const access = settings && settings.accessibility;
  return {
    motionReduce: !!((video && video.motionReduce) || (access && access.motionReduce)),
    flashReduce: !!((video && video.flashReduce) || (access && access.flashReduce)),
  };
}
