// inf-ghost-resolve-read — a ghost contact ends one of two ways, and both read, as pure
// decisions.
//
// WHAT THIS OWNS
// --------------
// W05's sensor ghosts are a deception loop: an unknown contact shadowing you either HARDENS
// under your pulses (`scanner:ghostRevealed` — the last pulse resolves it into a real hull)
// or MELTS AWAY once it holds escape range long enough (`scanner:ghostEscaped` — the sim
// despawns it). Neither receipt had any consumer in render, audio or UI. The world never
// showed the moment your scan turned a maybe into a ship, and a contact you failed to hold
// simply winked out of existence — no answer on the glass either way.
//
//   gate    only a receipt naming a contact plays; the consumer owns the position (the
//           payloads carry ids, and an escaped ghost is already dead — its last recorded
//           position is the truth, or the read honestly skips).
//   hue     the sensor-deception family: the pale holo blue the optic events already wear,
//           pushed white-hot for the harden's core, held dim for the melt.
//   plan    RESOLVE — the contact snaps: a white-hot core beat (inside the S8 flash law), a
//           holo wisp settling onto the hull, a cue light. ESCAPE — the inverse read: a
//           holo wisp dissolving outward, dimmer, no star, no ring — nothing was ever there
//           to kill. Reduced motion keeps both beats at a floor (a contact tell is never
//           silenced).
//
// Sprites spawn through vfx.js's normal admission; no new pool, clock or randomness.

/** Sprite admission priority — the tell/information band. */
export const GHOST_RESOLVE_PRIORITY = 0.55;

const HOLO_RGB = Object.freeze([0.73, 0.86, 1.0]);    // the optic family's pale holo blue
const SNAP_RGB = Object.freeze([0.9, 0.95, 1.0]);     // white-hot harden core
const MELT_RGB = Object.freeze([0.55, 0.68, 0.86]);   // the dimmer dissolve

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function css(rgb) {
  const c = (v) => Math.round(clamp01(Number(v) || 0) * 255);
  return `rgb(${c(rgb[0])},${c(rgb[1])},${c(rgb[2])})`;
}

/** True when the payload is a real reveal receipt: a contact id. */
export function isGhostRevealMoment(p) {
  return !!(p && p.entityId != null);
}

/** True when the payload is a real escape receipt: a contact id and a reason. */
export function isGhostEscapeMoment(p) {
  return !!(p && p.entityId != null
    && (p.reason == null || typeof p.reason === 'string'));
}

/** The ghost family's hues as [r,g,b] 0..1: the holo voice, the snap core, the melt. Pure. */
export function ghostHues() {
  return { holo: HOLO_RGB, snap: SNAP_RGB, melt: MELT_RGB };
}

/** [r,g,b] 0..1 → CSS rgb() string for the sprite/light colour path. */
export function ghostColorCss(rgb) {
  return css(rgb);
}

/**
 * The harden's sprite + light plan — the contact snaps into a hull. `reduced` keeps a floor
 * beat. Pure; the caller spawns exactly what this names.
 */
export function ghostResolvePlan(reduced = false) {
  const floor = reduced ? 0.45 : 0;
  const calm = reduced ? 0.8 : 1;
  return {
    snap: {
      color: css(SNAP_RGB),
      // Inside the S8 global flash law (vfxAccessibility FLASH_LIFE_CAP_S = 0.2 s).
      life: 0.2,
      size0: 1.1 + floor,
      size1: 4.6 + floor * 2,
      op0: 0.8,
    },
    settle: {
      color: css(HOLO_RGB),
      life: 0.8,
      size0: 1.6,
      size1: 3.2,
      op0: 0.42 * calm,
      drift: 2,
    },
    light: {
      kind: 'cue',
      peak: 2.0,
      distance: 110,
    },
  };
}

/**
 * The melt's sprite + light plan — the contact you failed to hold dissolves. Quieter than
 * the snap in every channel (the escape is information, not an event you caused). `reduced`
 * keeps a floor. Pure.
 */
export function ghostEscapePlan(reduced = false) {
  const floor = reduced ? 0.4 : 0;
  return {
    dissolve: {
      color: css(MELT_RGB),
      life: 0.9,
      size0: 2.2 + floor,
      size1: 4.8 + floor * 2,
      op0: 0.34 + floor * 0.15,
      drift: 6,
    },
    light: {
      kind: 'cue',
      peak: 1.2,
      distance: 90,
    },
  };
}
