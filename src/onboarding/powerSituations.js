// Row 546 (W-TEACH): teach by situation, not by lock.
//
// The first ten minutes PLACE one situation per power — a small physical setup on the player's
// path that suggests the verb (a tight pack suggests Pull, a drifter on the bow suggests Shove,
// an anchor helps the Line, a knot of scrap suggests Bomb, a debris fan suggests Rig). The
// aimed-power preview (src/data/powerPreview.js) can teach Pull, Pin and Bomb. Shove acts on tap;
// Rig stays on after a tap. Each line describes its actual gesture. "I've flown before" skips it — the
// system reads ob.pace.flownBefore before it places anything.
//
// Pure spec module (src/onboarding contract): no DOM, no bus, no Math.random. Placement jitter
// comes from the caller's seeded rng; every offset is authored here so a test can drive the same
// layout deterministically.

/** The rail's window: situations are first-ten-minutes teaching, not a permanent drip feed. */
export const POWER_SITUATION_WINDOW_S = 600;
/** The stick drills own the first minute — the ladder's first setup lands after them. */
export const POWER_SITUATION_FIRST_S = 75;
/** An ignored setup stands down on its own — the rail guides, it never walls. */
export const POWER_SITUATION_TTL_S = 40;
/** Voice pacing between one setup's resolution and the next placement. */
export const POWER_SITUATION_GAP_S = 12;

function prop(dAngDeg, distWu, radius, mass, vel = 'still') {
  return Object.freeze({ dAngDeg, distWu, radius, mass, vel: Object.freeze(vel) });
}
const still = Object.freeze({ kind: 'still' });
const towardPlayer = (speedWuS) => Object.freeze({ kind: 'towardPlayer', speedWuS });
const perpendicular = (speedWuS) => Object.freeze({ kind: 'perpendicular', speedWuS });

/**
 * One line per situation (the single tutorial voice): imperative, names the ONE power by its
 * rail name and the gesture that uses it — ≤12 words, same voice law as BEATS.
 */
export const POWER_SITUATIONS = Object.freeze([
  Object.freeze({
    power: 'pull',
    line: 'A loose pack drifts ahead. Tap Pull to draw it together.',
    props: Object.freeze([
      prop(-7, 150, 10, 80, still),
      prop(4, 178, 11, 85, still),
      prop(0, 196, 9, 75, still),
    ]),
  }),
  Object.freeze({
    power: 'shove',
    line: 'A drifter crowds the bow. Tap Shove to push it away.',
    props: Object.freeze([
      prop(3, 110, 14, 120, towardPlayer(16)),
    ]),
  }),
  Object.freeze({
    power: 'pin',
    line: 'Pin places an anchor ahead. Tap Pin, then latch your Line.',
    props: Object.freeze([
      prop(-9, 120, 7, 40, perpendicular(10)),
    ]),
  }),
  Object.freeze({
    power: 'bomb',
    line: 'Scrap ahead. Tap Bomb to deploy; Shove sets off armed explosives.',
    props: Object.freeze([
      prop(0, 150, 12, 150, still),
      prop(2, 168, 13, 160, still),
      prop(-2, 184, 11, 140, still),
      prop(5, 162, 10, 145, still),
    ]),
  }),
  Object.freeze({
    power: 'rig',
    line: 'Debris ahead. Tap Rig once to clear it while you steer.',
    props: Object.freeze([
      prop(-16, 100, 5, 25, still),
      prop(-8, 120, 5, 25, still),
      prop(0, 108, 6, 28, still),
      prop(8, 132, 5, 24, still),
      prop(16, 118, 5, 26, still),
      prop(3, 150, 5, 22, still),
    ]),
  }),
]);

/** Situation spec for one power, or null. */
export function situationFor(power) {
  return POWER_SITUATIONS.find((s) => s.power === power) || null;
}

/**
 * World position of one prop: `distWu` out from the player along `heading + dAngDeg`.
 * `out` is reused — the caller copies into the spawn spec.
 */
export function propWorldPos(spec, playerPos, headingRad, out) {
  const ang = (Number(headingRad) || 0) + (spec.dAngDeg * Math.PI / 180);
  out.x = (Number(playerPos && playerPos.x) || 0) + Math.cos(ang) * spec.distWu;
  out.z = (Number(playerPos && playerPos.z) || 0) + Math.sin(ang) * spec.distWu;
  return out;
}

/**
 * World velocity for one prop. 'towardPlayer' aims at the player's CURRENT position (a leech
 * drifting onto the bow); 'perpendicular' slides across the approach line; 'still' rests.
 */
export function propWorldVel(spec, worldPos, playerPos, out) {
  const vel = spec.vel || still;
  if (vel.kind === 'towardPlayer') {
    const dx = (Number(playerPos && playerPos.x) || 0) - worldPos.x;
    const dz = (Number(playerPos && playerPos.z) || 0) - worldPos.z;
    const n = Math.hypot(dx, dz) || 1;
    out.x = dx / n * vel.speedWuS; out.z = dz / n * vel.speedWuS;
    return out;
  }
  if (vel.kind === 'perpendicular') {
    const dx = worldPos.x - (Number(playerPos && playerPos.x) || 0);
    const dz = worldPos.z - (Number(playerPos && playerPos.z) || 0);
    const n = Math.hypot(dx, dz) || 1;
    out.x = -dz / n * vel.speedWuS; out.z = dx / n * vel.speedWuS;
    return out;
  }
  out.x = 0; out.z = 0;
  return out;
}

/**
 * Normalized live record (plain JSON — survives the rail's serialize pass). `next` is the index
 * into POWER_SITUATIONS still to be placed; `doneAt` records placement per power (used or
 * expired — the row's done-when is that each situation was PLACED, not that it was used).
 */
export function normalizePowerSit(raw) {
  const out = { next: 0, doneAt: {}, active: null, nextAtS: 0 };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  if (Number.isFinite(raw.next)) out.next = Math.max(0, Math.min(POWER_SITUATIONS.length, Math.floor(raw.next)));
  if (raw.doneAt && typeof raw.doneAt === 'object' && !Array.isArray(raw.doneAt)) {
    for (const s of POWER_SITUATIONS) {
      const v = Number(raw.doneAt[s.power]);
      if (Number.isFinite(v)) out.doneAt[s.power] = v;
    }
  }
  if (raw.active && typeof raw.active === 'object') {
    const s = situationFor(raw.active.power);
    const atS = Number(raw.active.placedAtS);
    if (s && Number.isFinite(atS)) out.active = { power: s.power, placedAtS: atS };
  }
  if (Number.isFinite(raw.nextAtS)) out.nextAtS = Math.max(0, raw.nextAtS);
  return out;
}
