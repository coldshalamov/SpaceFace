// inf-crush-read — the crush verdict reads at the anvil, as pure decisions.
//
// WHAT THIS OWNS
// --------------
// The survival rooms' crusher bites on the terrain-crumple law's own reading (inf-crusher-bite,
// wave 10 Lane 2): a hull shoved into the anvil at crumple speed takes the collision kernel's
// damage on a half-second grind, and the pilot who aimed the shove keeps the kill. The law
// publishes `combat:crushed` — and no render or audio path ever subscribed. The victim's hit
// flash played (the ordinary combat:damage beat), but the CRUSH itself — the room's signature
// verdict, the reason a shoved hull died — never did. A furball at the anvil read like any
// other spray of hits.
//
//   gate    only a receipt with a target, a positive speed and a positive damage plays.
//   hue     the crumple law's own family: the pale steel the collision row already wears.
//           A crush IS a collision-law verdict, so the light stays honest with every other
//           kinetic read in the game instead of inventing a second language.
//   plan    a crumple, not a pierce: a flat pop stretched along the closing bearing (the
//           caller passes the victim's motion), a spark fan scattering off the contact, and
//           — only when the receipt's target is already dead — the kill star that outlives
//           the pop, because a crush that empties a hull is the room's signature death.
//           Scale keys to closing speed across the crumple band; reduced motion keeps a
//           floor beat (a danger tell is never silenced).
//
// Sprites spawn through vfx.js's normal admission and its flash accessibility pass; no new
// pool, no clock, no randomness — the fan is fixed off the contact bearing.

/** Sprite admission priority — combat band, below the break/detonation reads. */
export const CRUSH_PRIORITY = 0.65;

/** Closing-speed band for the crush read (the crumple law bites well above the scrape floor). */
export const CRUSH_SPEED_FLOOR_WU = 20;
export const CRUSH_SPEED_FULL_WU = 80;

const CRUSH_RGB = Object.freeze([0.74, 0.85, 1.0]);   // the collision row's pale steel

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function css(rgb) {
  const c = (v) => Math.round(clamp01(Number(v) || 0) * 255);
  return `rgb(${c(rgb[0])},${c(rgb[1])},${c(rgb[2])})`;
}

/** True when the payload is a real crush receipt: a target, a speed and a damage. */
export function isCrushMoment(p) {
  return !!(p
    && p.entityId != null
    && Number.isFinite(p.speed)
    && p.speed > 0
    && Number.isFinite(p.damage)
    && p.damage > 0);
}

/** The crush's hue as [r,g,b] 0..1 — the collision family's steel. Pure. */
export function crushHue() {
  return CRUSH_RGB;
}

/** [r,g,b] 0..1 → CSS rgb() string for the sprite/light colour path. */
export function crushColorCss(rgb) {
  return css(rgb);
}

/**
 * The crush's sprite + light plan. `killed` is the consumer's read of the receipt's target
 * (routeDamage precedes the emit, so a dead target IS the crush kill). `along` is the closing
 * bearing in radians, or null when the victim's motion is unreadable — the pop then stays
 * round instead of lying about a direction it does not know. `reduced` holds a floor beat.
 * Pure; the caller spawns exactly what this names.
 */
export function crushPlan(speed, damage, killed, along, reduced = false) {
  const v = Number.isFinite(speed) && speed > 0 ? speed : CRUSH_SPEED_FLOOR_WU;
  const strength = clamp01((v - CRUSH_SPEED_FLOOR_WU) / (CRUSH_SPEED_FULL_WU - CRUSH_SPEED_FLOOR_WU));
  const floor = reduced ? 0.45 : 0;
  const steel = css(CRUSH_RGB);
  const bearing = Number.isFinite(along) ? along : null;
  const plan = {
    pop: {
      color: css([clamp01(CRUSH_RGB[0] * 0.4 + 0.6), clamp01(CRUSH_RGB[1] * 0.4 + 0.6), clamp01(CRUSH_RGB[2] * 0.4 + 0.6)]),
      life: (0.26 + strength * 0.16) * (reduced ? 0.8 : 1),
      size0: 1.1 + strength * 1.3 + floor,
      size1: 4.5 + strength * 4.5 + floor * 2,
      op0: 0.75 + strength * 0.1,
      along: bearing,
    },
    sparks: bearing == null ? null : {
      color: steel,
      life: 0.34 + strength * 0.2,
      size0: 0.8,
      size1: 2.2 + strength * 2,
      op0: 0.55,
      drift: 5 + strength * 11,
    },
    kill: killed ? {
      color: steel,
      life: 0.95,
      size0: 1.4,
      size1: 5.5,
      op0: 0.75,
    } : null,
    light: {
      kind: 'collision',
      peak: (2.4 + strength * 2.4) * (reduced ? 0.7 : 1),
      distance: 110 + strength * 50,
    },
  };
  return plan;
}
