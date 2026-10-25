// Aggregate mass, momentum and launch accounting — the pure seam Gyre Snare and the Pull collector
// share (design/combat-convergence/05, "Mass and momentum accounting").
//
// No state, no bus, no Three.js, no rng: every function is a pure map from numbers to numbers, so a
// test can pin the physics and both owners can call the same code. What it owns:
//
//   • refusal codes + a tiny text table (`explainRefusal`) — one vocabulary for "why not";
//   • rigid-body merge: M = Σm, x_cm = Σ m·x / M, v_cm = Σ m·v / M, and the spin that conserves
//     angular momentum about the common centre (member spin + orbital term, parallel-axis inertia);
//   • size from occupied volume and packing — never a linear fudge of mass;
//   • the launch plan: speed, impulse J = M·Δv, windup, impact scale, charge cost and recoil, as one
//     object both the burst (execution) and the preview read — "same impulse plan" by construction;
//   • the capture ledger: a reserved transaction that exists BEFORE any mass moves, with
//     generation-safe member references and a bounded history, so a reentrant event, a repeated
//     contact or a save callback can never count one body twice.
//
// An active field or a launch impulse is NOT a closed system. `mergeBodies` conserves momentum
// exactly; the applied launch is an external impulse and is accounted as one (`launchPlan.J`).

const finite = (v, d = 0) => (Number.isFinite(v) ? v : d);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ── refusal vocabulary ──────────────────────────────────────────────────────────────────────────

/** Stable codes. `too-heavy` and `protected` keep their historical spelling (HUD, tests). */
export const MATTER_REFUSAL = Object.freeze({
  PROTECTED: 'protected',       // live cargo, quest or custody content — towed, never eaten
  TOO_HEAVY: 'too-heavy',       // a body fatter than the aggregate can hold whole
  ANCHORED: 'anchored',         // station, gate, landmark: bolted to the world
  NOT_MATTER: 'not-matter',     // ships, shots, effects — not loose matter
  COLLECTIBLE: 'collectible',   // pickups and payloads: the tool tugs them, the pilot collects them
  CLAIMED: 'claimed',           // already a held core, a thrown ball, or another tool's knot
  UNAVAILABLE: 'unavailable',   // dead, no physical body, or a sensor ghost
  SATURATED: 'saturated',       // the aggregate is full
  DRY: 'dry-charge',            // not enough charge to commit
  OUT_OF_RANGE: 'out-of-range', // beyond the tool's reach
  NO_VECTOR: 'no-vector',       // nothing to aim along
});

const REFUSAL_TEXT = Object.freeze({
  [MATTER_REFUSAL.PROTECTED]: Object.freeze({ short: 'CARGO', text: 'Cargo or quest wreck — towed, never swallowed' }),
  [MATTER_REFUSAL.TOO_HEAVY]: Object.freeze({ short: 'TOO BIG', text: 'Too big to take whole' }),
  [MATTER_REFUSAL.ANCHORED]: Object.freeze({ short: 'ANCHORED', text: 'Anchored — it will not move' }),
  [MATTER_REFUSAL.NOT_MATTER]: Object.freeze({ short: 'NOT MATTER', text: 'Not loose matter' }),
  [MATTER_REFUSAL.COLLECTIBLE]: Object.freeze({ short: 'LOOT', text: 'Loot — collect it, the tool only tugs it' }),
  [MATTER_REFUSAL.CLAIMED]: Object.freeze({ short: 'HELD', text: 'Already held by another tool' }),
  [MATTER_REFUSAL.UNAVAILABLE]: Object.freeze({ short: 'GONE', text: 'Nothing there to take' }),
  [MATTER_REFUSAL.SATURATED]: Object.freeze({ short: 'FULL', text: 'Full — nothing more will stick' }),
  [MATTER_REFUSAL.DRY]: Object.freeze({ short: 'NO CHARGE', text: 'Not enough charge' }),
  [MATTER_REFUSAL.OUT_OF_RANGE]: Object.freeze({ short: 'TOO FAR', text: 'Out of reach' }),
  [MATTER_REFUSAL.NO_VECTOR]: Object.freeze({ short: 'NO AIM', text: 'No direction to throw along' }),
});

/**
 * The player-facing words for a refusal code: `{ code, short, text }`. Unknown codes degrade to the
 * code itself rather than throwing — a refusal must never be the thing that breaks a tick.
 */
export function explainRefusal(code) {
  const row = REFUSAL_TEXT[code];
  if (row) return { code, short: row.short, text: row.text };
  const label = typeof code === 'string' && code ? code : 'refused';
  return { code: label, short: label.toUpperCase(), text: label };
}

/** True for a code this module defines. */
export function isRefusalCode(code) {
  return typeof code === 'string' && Object.prototype.hasOwnProperty.call(REFUSAL_TEXT, code);
}

// ── rigid-body merge ────────────────────────────────────────────────────────────────────────────

/** Solid-sphere inertia about its own centre: the approximation `syncDerivedPhysicsMass` carries. */
export function solidInertia(mass, radius) {
  return 0.4 * Math.max(0, finite(mass)) * Math.max(0, finite(radius)) ** 2;
}

/**
 * A body snapshot: `{ m, x, z, vx, vz, w, I, r }`. `w` is spin about the vertical axis (rad/s),
 * `I` the inertia about the body's own centre; a missing `I` is the solid-sphere value.
 */
export function makeBody(m, x, z, vx = 0, vz = 0, w = 0, r = 0, I = null) {
  const mass = Math.max(0, finite(m));
  const radius = Math.max(0, finite(r));
  return { m: mass, x: finite(x), z: finite(z), vx: finite(vx), vz: finite(vz), w: finite(w), r: radius,
    I: Number.isFinite(I) ? Math.max(0, I) : solidInertia(mass, radius) };
}

/**
 * Perfectly inelastic merge of two bodies into one rigid body. Linear and angular momentum are
 * conserved exactly: v_cm = Σ m v / M, and the spin is L / I_cm with L taken about the common
 * centre (member spin + orbital term) and I_cm by the parallel-axis theorem. The merged radius is
 * not computed here — size is a volume question (`unionRadius`).
 */
export function mergeBodies(a, b, out = {}) {
  const M = a.m + b.m;
  if (!(M > 0)) {
    out.m = 0; out.x = a.x; out.z = a.z; out.vx = 0; out.vz = 0; out.w = 0; out.I = 0; out.r = 0;
    return out;
  }
  const x = (a.m * a.x + b.m * b.x) / M;
  const z = (a.m * a.z + b.m * b.z) / M;
  const vx = (a.m * a.vx + b.m * b.vx) / M;
  const vz = (a.m * a.vz + b.m * b.vz) / M;
  const adx = a.x - x, adz = a.z - z, bdx = b.x - x, bdz = b.z - z;
  // L about the common centre: each body's own spin plus m·(d × (v − v_cm)).
  const L = a.I * a.w + a.m * (adx * (a.vz - vz) - adz * (a.vx - vx))
          + b.I * b.w + b.m * (bdx * (b.vz - vz) - bdz * (b.vx - vx));
  const I = a.I + a.m * (adx * adx + adz * adz) + b.I + b.m * (bdx * bdx + bdz * bdz);
  out.m = M; out.x = x; out.z = z; out.vx = vx; out.vz = vz;
  out.I = I; out.w = I > 1e-12 ? L / I : 0;
  out.r = Math.max(a.r, b.r);
  return out;
}

/** M, centre of mass, centre-of-mass velocity and angular momentum of a list of bodies. */
export function aggregateOf(bodies) {
  let acc = null;
  for (const body of bodies || []) {
    if (!body || !(body.m > 0)) continue;
    acc = acc ? mergeBodies(acc, body, {}) : { ...body };
  }
  return acc || makeBody(0, 0, 0);
}

/** Total linear momentum of a body list — the quantity a merge must leave unchanged. */
export function linearMomentum(bodies) {
  let px = 0, pz = 0;
  for (const b of bodies || []) { if (b) { px += b.m * b.vx; pz += b.m * b.vz; } }
  return { x: px, z: pz };
}

/** Total angular momentum about an arbitrary point (spin + orbital), for conservation checks. */
export function angularMomentumAbout(bodies, cx, cz) {
  let L = 0;
  for (const b of bodies || []) {
    if (!b) continue;
    L += b.I * b.w + b.m * ((b.x - cx) * b.vz - (b.z - cz) * b.vx);
  }
  return L;
}

/**
 * The impulse the meal's momentum carries into the core when they merge: J = m_meal·(v_meal − v_core).
 * (Applied to a core that already weighs M after the merge it yields Δv = J / M — the exact
 * inelastic-merge velocity change.) Gyre's tuned "flinch" is a declared external-tool impulse and
 * is accounted as the difference, not hidden.
 */
export function mergeImpulse(core, meal) {
  return { x: meal.m * (meal.vx - core.vx), z: meal.m * (meal.vz - core.vz) };
}

// ── size: occupied volume and packing ───────────────────────────────────────────────────────────

/**
 * Envelope radius of a set of member radii: the occupied volume (Σ r³, the shared 4π/3 cancels)
 * divided by the packing fraction φ ∈ (0, 1]. φ = 1 is a solid union (Gyre's authored feel);
 * a loose pile is φ ≈ 0.64 (random close packing of equal spheres). Never a linear fudge of mass.
 */
export function unionRadius(radii, packing = 1) {
  const phi = clamp(finite(packing, 1), 0.2, 1);
  let v = 0;
  for (const r of radii || []) v += Math.max(0, finite(r)) ** 3;
  return Math.cbrt(v / phi);
}

/** Incremental `unionRadius`: the envelope after one more member (bit-identical to Gyre's cbrt sum). */
export function grownRadius(radius, memberRadius, packing = 1, cap = Infinity) {
  const phi = clamp(finite(packing, 1), 0.2, 1);
  return Math.min(cap, Math.cbrt(Math.max(0, finite(radius)) ** 3 + Math.max(0, finite(memberRadius)) ** 3 / phi));
}

/** Mean density of an aggregate: mass per unit occupied volume (relative units, π-free). */
export function meanDensity(mass, radius) {
  const r3 = Math.max(0, finite(radius)) ** 3;
  return r3 > 0 ? Math.max(0, finite(mass)) / r3 : 0;
}

// ── the launch plan ─────────────────────────────────────────────────────────────────────────────

/**
 * Everything a throw needs, derived once from the aggregate and a tuning table. The burst
 * (execution) and the preview both read THIS object, so they cannot disagree.
 *
 *   tuning = { launchSpeed, launchMassPenalty, maxClumpMass, launchTicks, launchWindupTicks,
 *              launchWindupTicksMass, launchImpactScaleBase, launchImpactScalePerMass,
 *              launchImpactScaleMax, chargeBase?, chargePerMass?, chargeMassRef? }
 *
 * `speed` is the commanded final flight speed (Δv along the aim); `J = M·speed` the impulse the
 * tool must deliver — an EXTERNAL impulse, not conserved momentum. `chargeCost` is the capacitor
 * the commit spends: a flat base plus a mass term, so a heavier knot is a heavier decision.
 */
export function launchPlan(mass, tuning) {
  const t = tuning;
  const M = Math.max(0, finite(mass));
  const frac = clamp(M / Math.max(1, finite(t.maxClumpMass, 1)), 0, 1);
  const speed = finite(t.launchSpeed) * (1 - finite(t.launchMassPenalty) * frac);
  const windupTicks = finite(t.launchWindupTicks) + Math.round(finite(t.launchWindupTicksMass) * frac);
  const impactScale = Math.min(
    finite(t.launchImpactScaleMax, 8),
    finite(t.launchImpactScaleBase, 1) + M / Math.max(1, finite(t.launchImpactScalePerMass, 1)),
  );
  const recoilDv = Math.min(18, 2 + M / 200);
  const chargeCost = finite(t.chargeBase) + finite(t.chargePerMass) * Math.min(M, finite(t.chargeMassRef, M));
  return {
    mass: M, massFrac: frac, speed, deltaV: speed, J: M * speed, ticks: Math.max(1, finite(t.launchTicks, 1)),
    windupTicks, impactScale, recoilDv, chargeCost,
  };
}

/**
 * The burst's impulse plan from the state at release: the commanded speed floors the flight speed
 * along `dir` (an aft-moving ball is repaid its coil carry; a ball already moving forward keeps
 * riding), and the carrier-frame sideways motion is stripped once on the first tick.
 *
 *   in:  mass, dir:{x,z}, coreVel:{x,z}, refVel:{x,z} (the carrier's velocity), speed, ticks
 *   out: { carry, fwd, perTick:{x,z}, lateral:{x,z}, exitVel:{x,z} }
 *
 * `exitVel` is the ball's velocity after the whole burst — the preview's initial state.
 */
export function burstPlan(p) {
  const M = Math.max(1e-9, finite(p.mass, 1));
  const dx = finite(p.dir && p.dir.x, 1), dz = finite(p.dir && p.dir.z, 0);
  const cvx = finite(p.coreVel && p.coreVel.x), cvz = finite(p.coreVel && p.coreVel.z);
  const rvx = finite(p.refVel && p.refVel.x), rvz = finite(p.refVel && p.refVel.z);
  const ticks = Math.max(1, finite(p.ticks, 1));
  const fwd = cvx * dx + cvz * dz;
  const carry = Math.max(0, -fwd);
  const relX = rvx - cvx, relZ = rvz - cvz;
  const lateralImpulse = M * (-dz * relX + dx * relZ);
  const j = ((finite(p.speed) + carry) * M) / ticks;
  const perTick = { x: dx * j, z: dz * j };
  const lateral = { x: -dz * lateralImpulse, z: dx * lateralImpulse };
  const totalX = perTick.x * ticks + lateral.x, totalZ = perTick.z * ticks + lateral.z;
  return {
    carry, fwd, perTick, lateral,
    exitVel: { x: cvx + totalX / M, z: cvz + totalZ / M },
  };
}

// ── the capture ledger: a reserved transaction ──────────────────────────────────────────────────

/** Generation-safe reference to a body: the id plus the occupant generation that proves identity. */
export function memberRef(entity, generationOf) {
  if (!entity) return null;
  const gen = typeof generationOf === 'function' ? generationOf(entity) : (entity.occupantGeneration ?? null);
  return { id: entity.id, gen: gen == null || gen === '' ? null : gen };
}

/** Does this live entity still name the occupant the reference was taken from? */
export function refMatches(entity, ref, generationOf) {
  if (!entity || !ref || entity.id !== ref.id) return false;
  if (ref.gen == null) return true; // an unstamped fixture body: the id is all there is
  const gen = typeof generationOf === 'function' ? generationOf(entity) : (entity.occupantGeneration ?? null);
  return gen === ref.gen;
}

const keyOf = (ref) => `${ref.id}#${ref.gen == null ? '' : ref.gen}`;

/**
 * A bounded capture ledger. `reserve` runs BEFORE any mass moves and refuses a body that is already
 * reserved or already captured (a reentrant event, a repeated contact, a save callback); `commit`
 * turns the ticket into a member; `cancel` returns it. `capacity` bounds committed members plus open
 * reservations, so the memory of who was captured can never outgrow it; `reset` clears both when the
 * aggregate itself ends (launch, drop, boundary).
 */
export function createCaptureLedger({ capacity = 28 } = {}) {
  const cap = Math.max(1, Math.trunc(finite(capacity, 28)));
  const reserved = new Map();
  const committedSet = new Set();
  let members = 0;
  let txSeq = 0;
  return {
    capacity: cap,
    get size() { return members; },
    get pending() { return reserved.size; },
    get full() { return members + reserved.size >= cap; },
    /** @returns {{ok:true, ticket:object}|{ok:false, reason:string}} */
    reserve(ref, mass = 0) {
      if (!ref || ref.id == null) return { ok: false, reason: MATTER_REFUSAL.UNAVAILABLE };
      const key = keyOf(ref);
      if (reserved.has(key) || committedSet.has(key)) return { ok: false, reason: MATTER_REFUSAL.CLAIMED };
      if (members + reserved.size >= cap) return { ok: false, reason: MATTER_REFUSAL.SATURATED };
      const ticket = { key, ref, mass: Math.max(0, finite(mass)), seq: ++txSeq, open: true };
      reserved.set(key, ticket);
      return { ok: true, ticket };
    },
    commit(ticket) {
      if (!ticket || !ticket.open || reserved.get(ticket.key) !== ticket) return false;
      ticket.open = false;
      reserved.delete(ticket.key);
      members += 1;
      committedSet.add(ticket.key);
      return true;
    },
    cancel(ticket) {
      if (!ticket || !ticket.open || reserved.get(ticket.key) !== ticket) return false;
      ticket.open = false;
      reserved.delete(ticket.key);
      return true;
    },
    has(ref) { return !!ref && (reserved.has(keyOf(ref)) || committedSet.has(keyOf(ref))); },
    reset() { reserved.clear(); committedSet.clear(); members = 0; },
  };
}
