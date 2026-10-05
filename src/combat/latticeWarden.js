// Lattice Warden — pure lattice state machine (stable id `lattice_warden`).
//
// The Warden deploys THREE breakable tether-lattice nodes in a triangle around the TARGET
// (the player), holds fire while the target sits inside the intact cell, then collapses the
// lattice with a Phase Lance. Breaking any one node voids the survey: a pending lance is
// cancelled outright and the Warden staggers.
//
// PURITY CONTRACT (same as capitalBossScore.js): serializable JSON state only, no Math.random,
// no wall clock, no THREE, no allocations of world objects. Callers own the record inside the
// capital fight record so save/restore rides the existing fight serialization.

const TAU = Math.PI * 2;
const EPS = 1e-7;

/** Fresh lattice record. `deploys` counts issued deployments (the stakes are finite). */
export function createLatticeState() {
  return {
    version: 1,
    deploys: 0,          // deployments ISSUED so far (bounded by score.lattice.maxDeploys)
    deployed: false,     // a deployment is live on the field
    intact: false,       // all live nodes hold — the cell is closed
    nodeIds: [null, null, null],
    nodeKeys: [null, null, null], // durable mission-slot keys for save/rebind
    nodePos: [null, null, null],
    pendingPlan: null,   // positions the last deploy command asked for, until bound
    brokenAt: null,      // clock when the cell last broke (stagger bookkeeping)
    collapsed: 0,        // lance collapses resolved inside an intact cell
  };
}

/** Deterministic hash -> [0,1). Salt is an integer the caller chooses (cast ordinal). */
function saltUnit(salt) {
  let h = (salt | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/**
 * Three node positions in a triangle around `center` at `radius`, one vertex aimed at the
 * origin-ward bearing of the boss (salt rotates the cell deterministically so two deploys in
 * one fight are never the same picture). Returns [{x,z} x3].
 */
export function latticeDeployPlan(center, radius, salt = 0) {
  const r = Math.max(40, Number.isFinite(radius) ? radius : 150);
  const base = saltUnit(salt) * TAU;
  const out = [];
  for (let i = 0; i < 3; i++) {
    const a = base + (i / 3) * TAU;
    out.push({ x: center.x + Math.cos(a) * r, z: center.z + Math.sin(a) * r });
  }
  return out;
}

const cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);

/** Point-in-triangle over the live node positions (barycentric signs, edge-inclusive). */
export function pointInTriangle(p, a, b, c) {
  if (!p || !a || !b || !c) return false;
  const d1 = cross(a, b, p), d2 = cross(b, c, p), d3 = cross(c, a, p);
  const neg = (d1 < -EPS) || (d2 < -EPS) || (d3 < -EPS);
  const pos = (d1 > EPS) || (d2 > EPS) || (d3 > EPS);
  return !(neg && pos);
}

/** Is the target inside the intact deployed cell right now? */
export function targetInsideLattice(state, targetPos) {
  return !!(state && state.deployed && state.intact
    && pointInTriangle(targetPos, state.nodePos[0], state.nodePos[1], state.nodePos[2]));
}

export function latticeIntact(state) {
  return !!(state && state.deployed && state.intact
    && state.nodeIds.every((id) => id != null));
}

/** Bind the mission-owner spawn receipt to the pending plan. Denied slots keep a null id. */
export function bindLatticeNodes(state, entityIds, keys = []) {
  if (!state || !Array.isArray(entityIds)) throw new TypeError('Lattice bind requires an id receipt');
  const plan = state.pendingPlan || [];
  for (let i = 0; i < 3; i++) {
    state.nodeIds[i] = entityIds[i] ?? null;
    state.nodeKeys[i] = keys[i] ?? state.nodeKeys[i] ?? null;
    state.nodePos[i] = plan[i] || null;
  }
  state.pendingPlan = null;
  state.deployed = state.nodeIds.some((id) => id != null);
  state.intact = state.deployed && state.nodeIds.every((id) => id != null);
  return state;
}

/** A node body was killed. Marks the slot dead and breaks the cell. Returns the slot or -1. */
export function markLatticeNodeKilled(state, entityId, clock = null) {
  if (!state || entityId == null) return -1;
  const i = state.nodeIds.findIndex((id) => id === entityId);
  if (i < 0) return -1;
  state.nodeIds[i] = null;
  state.intact = false;
  if (clock != null) state.brokenAt = clock;
  return i;
}

/** Clears a dead cell (all three slots null). Live remnants are intentionally left staked. */
export function latticeSpent(state) {
  return !!(state && state.deployed && state.nodeIds.every((id) => id == null));
}
