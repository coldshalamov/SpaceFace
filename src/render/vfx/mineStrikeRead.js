// inf-fence-strike-read — the fence answers the throw on the glass, as pure decisions.
//
// WHAT THIS OWNS
// --------------
// Since inf-mine-strike (wave 10, Lane 2) an armed mine goes off when the pilot hurls a
// body through its fence: `mines:struck` names the contact (mine, body, custody, speed),
// and `mines:turned` names a field-turned mine flipping to the pilot's side. Neither
// receipt had any render consumer — the picture showed only the generic snap/blast the
// ordinary trigger already plays, so the throw's own beat (the CONTACT, the reason the
// fence tripped) never read, and a turned mine changed allegiance in silence.
//
//   gate    only a receipt with a finite position plays; a strike also needs a positive
//           speed. Unknown custody never invents a hue — it falls to the fence amber the
//           snap already wears.
//   hue     custody voices the strike: 'throw' is the pilot's own ordnance cyan (the
//           weapons:mineArmed tint), 'line' is the tether's snap teal, 'wreck' is the
//           fresh-kill ember. The turned read is the claim cyan — the mine answering to
//           the pilot's field, the same family the armed beat wears.
//   plan    a strike is a scrape, not a pop: the contact flash stretches ALONG the throw
//           (the caller passes the body's bearing), sparks scatter downrange, and a star
//           beat outlives the scrape 3:1 — the fuze caught, before the snap/blast the
//           ordinary receipts play. Scale keys to strike speed across the authored throw
//           band (25 wu/s floor to a hard cap), so a gentle set-down that still trips the
//           strike law reads lighter than a rock hurled at 80 wu/s.
//
// The sprites spawn through vfx.js's normal admission and its flash accessibility pass.
// This file invents no pool, no clock and no randomness; every number is pure in the
// receipt.

/** The strike law's own throw floor (mines.MINE_STRIKE_MIN_SPEED). */
export const MINE_STRIKE_FLOOR_WU = 25;
/** Strike speed where the scrape read reaches full strength. */
export const MINE_STRIKE_FULL_WU = 80;

/** Sprite admission priority — same band as the other event reads (brood burst). */
export const MINE_STRIKE_PRIORITY = 0.6;

const CUSTODY_RGB = Object.freeze({
  throw: Object.freeze([0.5, 0.83, 1.0]),     // weapons:mineArmed cyan — the pilot's own ordnance
  line: Object.freeze([0.62, 1.0, 0.83]),     // tether:snapCatch teal — the mass on the line
  wreck: Object.freeze([1.0, 0.64, 0.33]),    // fresh-kill ember — the wreck the pilot made
});
const FENCE_FALLBACK_RGB = Object.freeze([1.0, 0.88, 0.54]); // the snap's own amber (0xffe08a)
const CLAIM_RGB = Object.freeze([0.5, 0.83, 1.0]);           // the claim/armed cyan

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function css(rgb) {
  const c = (v) => Math.round(clamp01(Number(v) || 0) * 255);
  return `rgb(${c(rgb[0])},${c(rgb[1])},${c(rgb[2])})`;
}

/** True when the payload is a real strike receipt: finite position, positive speed. */
export function isMineStrikeMoment(p) {
  return !!(p
    && p.pos
    && Number.isFinite(p.pos.x)
    && Number.isFinite(p.pos.z)
    && Number.isFinite(p.speed)
    && p.speed > 0);
}

/** True when the payload is a real field-turn receipt: finite position. */
export function isMineTurnMoment(p) {
  return !!(p
    && p.pos
    && Number.isFinite(p.pos.x)
    && Number.isFinite(p.pos.z));
}

/**
 * The strike's hue as [r,g,b] 0..1, keyed to the custody the strike law itself names.
 * Pure; unknown custody falls to the fence amber, never to black.
 */
export function mineStrikeHue(custody) {
  return CUSTODY_RGB[custody] || FENCE_FALLBACK_RGB;
}

/** [r,g,b] 0..1 → CSS rgb() string for the sprite/light colour path. */
export function mineStrikeColorCss(rgb) {
  return css(rgb);
}

/**
 * The strike's sprite + light plan, keyed to the receipt's ACTUAL strike speed. Pure; the
 * caller spawns exactly what this names. `along` is the contact bearing (radians, the body's
 * direction of travel across the mine) — the scrape stretches that way; pass null and the
 * plan keeps the round contact bead without a scrape streak.
 */
export function mineStrikePlan(speed, hue, along) {
  const v = Number.isFinite(speed) && speed > 0 ? speed : MINE_STRIKE_FLOOR_WU;
  const strength = clamp01((v - MINE_STRIKE_FLOOR_WU) / (MINE_STRIKE_FULL_WU - MINE_STRIKE_FLOOR_WU));
  const h = Array.isArray(hue) && hue.length === 3 ? hue : mineStrikeHue(null);
  const bearing = Number.isFinite(along) ? along : null;
  const vent = css(h);
  // The contact pushes the custody hue toward white-hot for the bead's centre.
  const hot = css([clamp01(h[0] * 0.45 + 0.55), clamp01(h[1] * 0.45 + 0.55), clamp01(h[2] * 0.45 + 0.55)]);
  return {
    contact: {
      color: hot,
      life: 0.3 + strength * 0.14,
      size0: 1.4 + strength * 1.2,
      size1: 5.5 + strength * 5,
      op0: 0.8,
      along: bearing,
    },
    scrape: bearing == null ? null : {
      color: vent,
      life: 0.38 + strength * 0.2,
      size0: 0.9,
      size1: 2.6 + strength * 2.6,
      op0: 0.6 + strength * 0.15,
      drift: 4 + strength * 10,
    },
    star: {
      color: vent,
      life: 0.9 + strength * 0.3,
      size0: 1.4,
      size1: 4.5 + strength * 2,
      op0: 0.75,
    },
    light: {
      // 'impact' row — contact identity. Peak keys to the throw; distance holds near the
      // mine disc so the fence, not the whole belt, lights up.
      peak: 2.2 + strength * 2.2,
      distance: 110 + strength * 60,
    },
  };
}

/**
 * The field-turn's sprite + light plan — a claim beat on the mine itself, quieter than a
 * strike (nothing exploded yet; the mine simply changed sides). Pure.
 */
export function mineTurnPlan(hue) {
  const h = Array.isArray(hue) && hue.length === 3 ? hue : CLAIM_RGB;
  const claim = css(h);
  return {
    claim: {
      color: claim,
      life: 0.85,
      size0: 1.2,
      size1: 4.2,
      op0: 0.7,
    },
    light: {
      peak: 1.8,
      distance: 96,
    },
  };
}

export { CLAIM_RGB };
