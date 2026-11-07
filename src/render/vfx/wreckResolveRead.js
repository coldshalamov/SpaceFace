// inf-wreck-resolve-read — the wreck you scan answers at the hull, as pure decisions.
//
// WHAT THIS OWNS
// --------------
// A first pulse on a derelict resolves it: the sim fills in the manifest, names the hull it
// was, and publishes `scan:wreckResolved` — and stamps `data.pingedUntil` so the contact
// stays "pinged" for the scanner's persist window (~45 s). The HUD strip filled in; the
// WORLD answered with nothing. In a cluttered field the wreck you just identified looks
// exactly like every hulk you did not, and there is no way back to it except memory.
//
//   gate   only a first resolve with a finite position plays (the sim fires once per wreck
//          life — re-entry, not re-scan, is what re-fires it).
//   hue    the scanner's own resolve family: the seam-lit blue-white the belt already wears
//          for "scanner-lit, aim here", with a white-hot core for the landing beat.
//   plan   the pulse LANDING on the hull (a ring running out from the contact, a white core
//          beat inside the S8 0.2 s flash law) plus the answer that outlives the beat: a quiet
//          marker lamp held for the ping window — slow, small, readable — so the resolved
//          wreck stays findable in a crowd until the window lapses. The lamp is a soft body
//          (puff family), never a flash: the global flash law caps flashes at 0.2 s. Reduced
//          motion halves the landing beat and keeps the steady lamp; the lamp is the utility
//          and is never silenced.
//
// Sprites spawn through vfx.js's normal admission; no new pool, clock or randomness here.

/** Sprite admission priority — a utility read, below combat bursts. */
export const WRECK_RESOLVE_PRIORITY = 0.5;

/** The scanner's own ping persist window (scanner.js PINGED_S), in sim seconds. */
export const WRECK_PING_WINDOW_S = 45;
/** Marker lamp clamps — a caller passing a live profile window can never run away. */
export const WRECK_MARKER_MIN_S = 8;
export const WRECK_MARKER_MAX_S = 60;

const MARKER_RGB = Object.freeze([0.84, 0.9, 1.0]);  // #d7e6ff — the belt's "scanner-lit" blue
const CORE_RGB = Object.freeze([0.92, 0.96, 1.0]);   // white-hot landing core

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function css(rgb) {
  const c = (x) => Math.round(clamp(Number(x) || 0, 0, 1) * 255);
  return `rgb(${c(rgb[0])},${c(rgb[1])},${c(rgb[2])})`;
}

/** True when the payload is a real resolve receipt: a wreck id and a finite position. */
export function isWreckResolveMoment(p) {
  return !!(p
    && p.wreckId != null
    && p.pos
    && Number.isFinite(p.pos.x)
    && Number.isFinite(p.pos.z));
}

/** The resolve family's colours as [r,g,b] 0..1. Pure. */
export function wreckResolveHue() {
  return MARKER_RGB;
}

/** [r,g,b] 0..1 → CSS rgb() string for the sprite/light colour path. */
export function wreckResolveColorCss(rgb) {
  return css(rgb);
}

/**
 * The resolve's sprite + light plan. `reduced` halves the landing beat's life and drift and
 * keeps the steady marker lamp at full window — the lamp is the utility, never silenced.
 * Pure; the caller spawns exactly what this names.
 */
export function wreckResolvePlan(persistS = WRECK_PING_WINDOW_S, reduced = false) {
  const windowS = clamp(
    Number.isFinite(persistS) && persistS > 0 ? persistS : WRECK_PING_WINDOW_S,
    WRECK_MARKER_MIN_S,
    WRECK_MARKER_MAX_S,
  );
  const beatScale = reduced ? 0.5 : 1;
  return {
    landing: {
      ring: {
        color: css(MARKER_RGB),
        life: 0.7 * beatScale,
        size0: 2,
        size1: 16,
        op0: 0.6,
      },
      core: {
        color: css(CORE_RGB),
        // Inside the S8 global flash law (vfxAccessibility FLASH_LIFE_CAP_S = 0.2 s).
        life: 0.2 * beatScale,
        size0: 1.2,
        size1: 5,
        op0: 0.85,
      },
    },
    marker: {
      color: css(MARKER_RGB),
      life: windowS,
      size0: 0.7,
      size1: 1.7,
      op0: 0.3,
    },
    light: {
      kind: 'cue',
      peak: 2.2,
      distance: 130,
    },
  };
}
