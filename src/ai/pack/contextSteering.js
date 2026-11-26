// Context steering (A. Fray, "Context Steering", Game AI Pro 2): every unit owns two small maps
// over N fixed compass directions. Goals WRITE INTEREST (slot, pursuit, flight flow, cohesion);
// obstacles WRITE DANGER (rocks, hulls on a collision course, thrown bodies, the player's hull).
// The choice masks every direction more dangerous than the safest one (plus a slack band) and
// takes the most interesting survivor, with sub-slot interpolation. Unlike a weighted force sum,
// two opposing terms can never cancel into a stall, and a rock can never wedge a hull: danger
// removes directions instead of bending a vector into the obstacle.
//
// Pure math on caller-owned Float32Arrays — no allocation, no state, no randomness.

export const CONTEXT_SLOTS = 16;
const TAU = Math.PI * 2;
const SLOT_ANGLE = TAU / CONTEXT_SLOTS;

/** Unit vectors of the slots (slot 0 = +X, counter-clockwise in the x/z plane). */
export const SLOT_X = new Float32Array(CONTEXT_SLOTS);
export const SLOT_Z = new Float32Array(CONTEXT_SLOTS);
for (let i = 0; i < CONTEXT_SLOTS; i++) {
  SLOT_X[i] = Math.cos(i * SLOT_ANGLE);
  SLOT_Z[i] = Math.sin(i * SLOT_ANGLE);
}

export function clearMap(map) {
  for (let i = 0; i < CONTEXT_SLOTS; i++) map[i] = 0;
}

/**
 * Interest toward a unit direction (dx, dz). `width` shapes the lobe: 0 = only directions within
 * 90° score (Fray's dot clamp); a positive width leaks a little interest to the sides so a masked
 * straight line still leaves a sensible detour. Max-combined, so terms never sum into overshoot.
 */
export function writeInterest(map, dx, dz, weight, width = 0.15) {
  if (!(weight > 0)) return;
  for (let i = 0; i < CONTEXT_SLOTS; i++) {
    const dot = SLOT_X[i] * dx + SLOT_Z[i] * dz;
    const v = (dot > 0 ? dot : 0) * (1 - width) + ((dot + 1) * 0.5) * width;
    const w = v * weight;
    if (w > map[i]) map[i] = w;
  }
}

/** Additive interest (flow/cohesion terms that should reinforce, not replace, the goal). */
export function addInterest(map, dx, dz, weight) {
  if (!(weight > 0)) return;
  for (let i = 0; i < CONTEXT_SLOTS; i++) {
    const dot = SLOT_X[i] * dx + SLOT_Z[i] * dz;
    if (dot > 0) map[i] += dot * weight;
  }
}

/**
 * Danger in a cone around (dx, dz): full strength on the exact bearing, falling to zero at
 * `halfAngle`. Max-combined — the worst threat in a direction is what that direction costs.
 */
export function writeDanger(map, dx, dz, strength, halfAngle = 0.9) {
  if (!(strength > 0)) return;
  const cosLimit = Math.cos(halfAngle);
  for (let i = 0; i < CONTEXT_SLOTS; i++) {
    const dot = SLOT_X[i] * dx + SLOT_Z[i] * dz;
    if (dot <= cosLimit) continue;
    const v = strength * ((dot - cosLimit) / (1 - cosLimit));
    if (v > map[i]) map[i] = v;
  }
}

/**
 * Swept-circle danger for a static (or slow) body: for each slot, would travelling that way at
 * `speed` for `horizonS` seconds enter the inflated circle? Danger grows as the hit gets nearer,
 * so a rock far ahead only shades the line while a rock at the nose closes it.
 */
export function writeSweptCircleDanger(map, px, pz, cx, cz, radius, speed, horizonS, strength = 1) {
  const reach = Math.max(1, speed * horizonS);
  const ox = cx - px;
  const oz = cz - pz;
  const c = ox * ox + oz * oz - radius * radius;
  if (c <= 0) {
    // Already inside the clearance ring: every direction toward the centre is closed.
    const d = Math.sqrt(ox * ox + oz * oz) || 1;
    writeDanger(map, ox / d, oz / d, strength, 1.45);
    return;
  }
  for (let i = 0; i < CONTEXT_SLOTS; i++) {
    const b = ox * SLOT_X[i] + oz * SLOT_Z[i];
    if (b <= 0) continue;
    const disc = b * b - c;
    if (disc < 0) continue;
    const t = b - Math.sqrt(disc);
    if (t > reach) continue;
    const v = strength * (1 - t / reach);
    if (v > map[i]) map[i] = v;
  }
}

/**
 * Choose a direction. Masks every slot whose danger exceeds the minimum by more than `slack`,
 * then picks the highest remaining interest and refines it toward the better neighbour
 * (parabolic sub-slot). Writes the unit result into out = { x, z, danger, interest }.
 * When nothing is interesting (all masked or zero) it falls back to the least dangerous slot.
 */
export function chooseDirection(interest, danger, out, slack = 0.08) {
  let minDanger = Infinity;
  for (let i = 0; i < CONTEXT_SLOTS; i++) if (danger[i] < minDanger) minDanger = danger[i];
  const cut = minDanger + slack;
  let best = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < CONTEXT_SLOTS; i++) {
    if (danger[i] > cut) continue;
    // Within the admitted band, residual danger still shades the pick.
    const score = interest[i] - (danger[i] - minDanger) * 0.5;
    if (score > bestScore) { bestScore = score; best = i; }
  }
  if (best < 0 || !(interest[best] > 1e-4)) {
    let safest = 0;
    for (let i = 1; i < CONTEXT_SLOTS; i++) if (danger[i] < danger[safest]) safest = i;
    if (best < 0 || danger[safest] + slack < danger[best]) best = safest;
  }
  const l = (best + CONTEXT_SLOTS - 1) % CONTEXT_SLOTS;
  const r = (best + 1) % CONTEXT_SLOTS;
  const il = danger[l] > cut ? 0 : interest[l];
  const ir = danger[r] > cut ? 0 : interest[r];
  const ic = interest[best];
  const denom = il - 2 * ic + ir;
  let offset = denom < -1e-6 ? 0.5 * (il - ir) / denom : 0;
  if (offset > 0.5) offset = 0.5; else if (offset < -0.5) offset = -0.5;
  const angle = (best + offset) * SLOT_ANGLE;
  out.x = Math.cos(angle);
  out.z = Math.sin(angle);
  out.danger = danger[best];
  out.interest = ic;
  return out;
}
