// Massline chain readout — the bounded, world-anchored "one thrown mass did this" trace.
//
// When the player releases a tethered body with intent (tether:releaseRated), this module
// keeps a small fixed list of the chain's accepted events — the release point, each real
// contact the thrown mass makes, and the kill that resolves the chain — and draws a thin
// connected trace through those captured world points plus a tick at each node.
//
// Deliberately NOT: a replay system, a breadcrumb trail, a cinematic frame, or a per-frame
// sample log. Nodes are written only by accepted sim events (release / whip impact /
// physics impact / kill); nothing here polls or re-derives trajectory. The whole record is
// one flat allocation at init and one flat typed-array write per visible frame.
//
// The aftermath node pins to the RESOLVED wreck entity (via its bound markerId) once the
// aftermath system materializes it — the marker left at a prior position is the fallback,
// never the answer. Selecting that wreck ends the emphasis; so does the age window.
//
// Pure module: owns no Three.js objects, reads no GameState. The VFX adapter supplies
// accepted event payloads and presented positions; sim/physics/wreck/save ownership stay
// with their existing modules.

const MAX_INDEXED_QUADS = 16383; // 4 vertices each, the Uint16 index ceiling.

export const CHAIN_READOUT_NODE_CAP = 8;
export const CHAIN_READOUT_WINDOW_S = 5.5;   // readout dissolves once the chain goes quiet
export const CHAIN_READOUT_RESOLVE_FADE_S = 0.85;
export const CHAIN_READOUT_RAMP_S = 0.12;

export const CHAIN_NODE_RELEASE = 1;
export const CHAIN_NODE_CONTACT = 2;
export const CHAIN_NODE_AFTERMATH = 3;

const CHAIN_NODE_COLOR = Object.freeze({
  [CHAIN_NODE_RELEASE]: Object.freeze({ r: 0.49, g: 0.89, b: 1 }),
  [CHAIN_NODE_CONTACT]: Object.freeze({ r: 1, g: 0.62, b: 0.30 }),
  [CHAIN_NODE_AFTERMATH]: Object.freeze({ r: 0.55, g: 0.95, b: 0.65 }),
});

/** Allocate once at VFX init. Never call from the frame update. */
export function createMasslineChainReadout(capacity = CHAIN_READOUT_NODE_CAP) {
  const cap = clampInteger(capacity, 3, 24);
  const record = {
    capacity: cap,
    active: false,
    phase: 'idle',           // idle | flying | resolved
    thrownId: null,
    bornS: 0,
    lastEventS: -Infinity,
    resolvedS: NaN,
    nodeCount: 0,
    kind: new Uint8Array(cap),
    xs: new Float32Array(cap),
    zs: new Float32Array(cap),
    dirX: new Float32Array(cap),
    dirZ: new Float32Array(cap),
    // Entity/marker identity per node (victimId on contact, victimId on aftermath).
    ids: new Array(cap).fill(null),
    aftermathVictimId: null,
    aftermathMarkerId: null,
    wreckEntityId: null,
  };
  return record;
}

export function resetMasslineChainReadout(record) {
  if (!record) return record;
  record.active = false;
  record.phase = 'idle';
  record.thrownId = null;
  record.bornS = 0;
  record.lastEventS = -Infinity;
  record.resolvedS = NaN;
  record.nodeCount = 0;
  record.ids.fill(null);
  record.aftermathVictimId = null;
  record.aftermathMarkerId = null;
  record.wreckEntityId = null;
  return record;
}

/**
 * The accepted release starts a new chain — any prior readout is replaced wholesale
 * (one bounded ancestry at a time, never an accumulating breadcrumb trail).
 */
export function masslineChainNoteRelease(record, input) {
  if (!record || !input) return false;
  const x = Number(input.x);
  const z = Number(input.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  resetMasslineChainReadout(record);
  record.active = true;
  record.phase = 'flying';
  record.thrownId = input.thrownId != null ? input.thrownId : null;
  record.bornS = finite(input.nowS, 0);
  record.lastEventS = record.bornS;
  return writeNode(record, CHAIN_NODE_RELEASE, x, z, input.dirX, input.dirZ, null, input.nowS);
}

/**
 * A real contact the thrown mass made. Caller supplies the accepted contact point
 * (whip record `pos`, physics:impact `pos`) — never a re-derived or rendered position.
 * Returns the node slot written, or -1 when the record declined it.
 */
export function masslineChainNoteContact(record, input) {
  if (!record || !record.active || record.phase === 'resolved') return -1;
  if (record.thrownId == null) return -1;
  // The chain follows the thrown body, not unrelated impacts sharing the table.
  if (input && input.thrownId != null && input.thrownId !== record.thrownId) return -1;
  const x = Number(input && input.x);
  const z = Number(input && input.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return -1;
  const victimId = input && input.victimId != null ? input.victimId : null;
  // Skip a contact that repeats the immediately previous node for the same victim —
  // sustained contact would otherwise spend the whole node cap on one overlap.
  if (record.nodeCount > 0) {
    const last = record.nodeCount - 1;
    if (record.kind[last] === CHAIN_NODE_CONTACT && record.ids[last] === victimId
      && victimId != null) {
      const dx = x - record.xs[last];
      const dz = z - record.zs[last];
      if (dx * dx + dz * dz < 64) return -1;
    }
  }
  return writeNode(record, CHAIN_NODE_CONTACT, x, z, input && input.dirX,
    input && input.dirZ, victimId, input && input.nowS);
}

/** The chain's resolving kill — the struck victim's accepted death point. */
export function masslineChainNoteAftermath(record, input) {
  if (!record || !record.active || record.phase === 'resolved') return false;
  const x = Number(input && input.x);
  const z = Number(input && input.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  const victimId = input && input.victimId != null ? input.victimId : null;
  if (!isChainVictim(record, victimId)) return false;
  // One aftermath per chain — the first resolved kill owns the slot.
  for (let i = 0; i < record.nodeCount; i += 1) {
    if (record.kind[i] === CHAIN_NODE_AFTERMATH) return false;
  }
  const wrote = writeNode(record, CHAIN_NODE_AFTERMATH, x, z, null, null, victimId,
    input && input.nowS);
  if (wrote >= 0) record.aftermathVictimId = victimId;
  return wrote >= 0;
}

function isChainVictim(record, victimId) {
  if (victimId == null) return false;
  for (let i = 0; i < record.nodeCount; i += 1) {
    if (record.kind[i] === CHAIN_NODE_CONTACT && record.ids[i] === victimId) return true;
  }
  return false;
}

/** Bind the recorded aftermath marker when it names this chain's struck victim. */
export function masslineChainBindMarker(record, markerId, victimId) {
  if (!record || !record.active) return false;
  if (victimId == null || victimId !== record.aftermathVictimId) return false;
  record.aftermathMarkerId = markerId != null ? markerId : null;
  return record.aftermathMarkerId != null;
}

/** Bind the materialized wreck entity that carries the chain's marker. */
export function masslineChainBindWreckEntity(record, entity) {
  if (!record || !record.active || record.aftermathMarkerId == null || !entity) return false;
  const data = entity.data || null;
  const markerId = data && (data.markerId
    || (data.provenance && data.provenance.markerId));
  if (markerId == null || markerId !== record.aftermathMarkerId) return false;
  record.wreckEntityId = entity.id != null ? entity.id : null;
  return record.wreckEntityId != null;
}

/**
 * Resolve this frame's draw plan into caller-owned `out`. Pure read of the record plus
 * the caller's presented answers (wreck position, selection, zoom-compensated marker size).
 * Ending the readout is the caller's selection or the quiet window — never a guess here.
 *
 * input = {
 *   nowS,                       presentation clock (same timebase the events stamped)
 *   selectedId,                 state.player.targetId — selection ends the emphasis
 *   wreckPos: {x,z} | null,     presented position of the bound wreck entity
 *   markerWu,                   world-unit marker size (adapter compensates zoom)
 *   segWidthWu,                 world-unit connective width
 *   y,                          draw height
 *   fadeScale,                  accessibility scale (flashOpacityScale etc.)
 * }
 */
export function resolveMasslineChainReadoutPlan(record, input, out) {
  const plan = out;
  plan.visible = false;
  plan.phase = 'idle';
  plan.fade = 0;
  plan.markerWu = 0;
  plan.nodeCount = 0;
  plan.resolved = false;
  plan.hasAftermath = false;
  if (!record || !record.active || !input) return plan;

  const nowS = finite(input.nowS, 0);
  const lastS = Number.isFinite(record.lastEventS) ? record.lastEventS : record.bornS;

  // The thrown body died / target despawned without a resolving kill — quiet expiry
  // still ends the readout; only the bounded window decides.
  if (record.phase !== 'resolved') {
    const selected = input.selectedId != null && record.wreckEntityId != null
      && input.selectedId === record.wreckEntityId;
    const quietExpired = nowS - lastS > CHAIN_READOUT_WINDOW_S;
    if (selected || quietExpired) {
      record.phase = 'resolved';
      record.resolvedS = nowS;
    }
  }

  const resolved = record.phase === 'resolved';
  const fadeScale = clamp01(input.fadeScale != null ? input.fadeScale : 1);
  let fade;
  if (resolved) {
    fade = clamp01(1 - (nowS - record.resolvedS) / CHAIN_READOUT_RESOLVE_FADE_S);
    if (!(fade > 0)) {
      resetMasslineChainReadout(record);
      return plan;
    }
  } else {
    fade = clamp01((nowS - record.bornS) / CHAIN_READOUT_RAMP_S);
  }

  plan.visible = true;
  plan.phase = record.phase;
  plan.fade = fade * fadeScale;
  plan.markerWu = Math.max(0.4, finite(input.markerWu, 2));
  plan.segWidthWu = Math.max(0.1, finite(input.segWidthWu, plan.markerWu * 0.3));
  plan.y = finite(input.y, 1.3);
  plan.nodeCount = record.nodeCount;
  plan.resolved = resolved;
  plan.wreckEntityId = record.wreckEntityId;
  plan.aftermathX = record.nodeCount > 0 && record.kind[record.nodeCount - 1] === CHAIN_NODE_AFTERMATH
    && record.wreckEntityId != null
    && input.wreckPos && Number.isFinite(input.wreckPos.x) && Number.isFinite(input.wreckPos.z)
    ? input.wreckPos.x : NaN;
  plan.aftermathZ = Number.isFinite(plan.aftermathX)
    ? input.wreckPos.z : NaN;
  plan.hasAftermath = record.aftermathVictimId != null;
  return plan;
}

function writeNode(record, kind, x, z, dirX, dirZ, id, nowS) {
  if (record.nodeCount >= record.capacity) return -1;
  const i = record.nodeCount;
  record.nodeCount = i + 1;
  record.kind[i] = kind;
  record.xs[i] = x;
  record.zs[i] = z;
  record.dirX[i] = Number.isFinite(dirX) ? dirX : 0;
  record.dirZ[i] = Number.isFinite(dirZ) ? dirZ : 0;
  record.ids[i] = id != null ? id : null;
  record.lastEventS = Math.max(record.lastEventS, finite(nowS, record.lastEventS));
  return i;
}

/** Allocate the indexed quad pool. Indices are fixed; only positions/colors/draw count move. */
export function createMasslineChainReadoutGeometry(nodeCapacity = CHAIN_READOUT_NODE_CAP) {
  // One diamond quad per node + one connective quad per gap.
  const cap = clampInteger(nodeCapacity, 3, 24);
  const quadCapacity = Math.min(MAX_INDEXED_QUADS, cap + (cap - 1));
  const positions = new Float32Array(quadCapacity * 4 * 3);
  const colors = new Float32Array(quadCapacity * 4 * 3);
  const indices = new Uint16Array(quadCapacity * 6);
  for (let quad = 0; quad < quadCapacity; quad += 1) {
    const vertex = quad * 4;
    const offset = quad * 6;
    indices[offset] = vertex;
    indices[offset + 1] = vertex + 1;
    indices[offset + 2] = vertex + 2;
    indices[offset + 3] = vertex + 1;
    indices[offset + 4] = vertex + 3;
    indices[offset + 5] = vertex + 2;
  }
  return { quadCapacity, positions, colors, indices, indexCount: 0 };
}

/**
 * Write the trace: one thin world-anchored quad between consecutive nodes, then one
 * diamond per node. Diamond centres sit exactly on the captured world point — scale
 * compensation (markerWu) sizes the glyph only and can never move the recorded origin.
 */
export function writeMasslineChainReadoutGeometry(out, record, plan) {
  if (!out) return out;
  out.indexCount = 0;
  if (!record || !plan || plan.visible !== true || !(plan.fade > 0)) return out;
  const n = Math.min(record.nodeCount, record.capacity);
  const quadCapacity = out.quadCapacity;
  if (!(n > 0) || !(quadCapacity > 0)) return out;

  const positions = out.positions;
  const colors = out.colors;
  const y = finite(plan.y, 1.3);
  const marker = Math.max(0.4, finite(plan.markerWu, 2));
  const segHalf = Math.max(0.05, finite(plan.segWidthWu, marker * 0.3)) * 0.5;
  const fade = clamp01(plan.fade);
  let emitted = 0;

  // Node anchor resolution happens here, once: the aftermath node rides the bound wreck
  // entity's presented position when it exists, else stays on its recorded kill point.
  // Every other node is its captured world point verbatim.
  const useWreckPos = Number.isFinite(plan.aftermathX) && Number.isFinite(plan.aftermathZ);

  // Connective segments first so node diamonds overwrite them where they meet.
  for (let i = 1; i < n && emitted < quadCapacity; i += 1) {
    const x0 = record.xs[i - 1];
    const z0 = record.zs[i - 1];
    let x1 = record.xs[i];
    let z1 = record.zs[i];
    if (useWreckPos && record.kind[i] === CHAIN_NODE_AFTERMATH) {
      x1 = plan.aftermathX;
      z1 = plan.aftermathZ;
    }
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (!(len > 1e-4)) continue;
    const px = (-dz / len) * segHalf;
    const pz = (dx / len) * segHalf;
    const c = CHAIN_NODE_COLOR[record.kind[i]] || CHAIN_NODE_COLOR[CHAIN_NODE_CONTACT];
    const g = fade * 0.34;
    const offset = emitted * 12;
    positions[offset] = x0 - px; positions[offset + 1] = y; positions[offset + 2] = z0 - pz;
    positions[offset + 3] = x0 + px; positions[offset + 4] = y; positions[offset + 5] = z0 + pz;
    positions[offset + 6] = x1 - px; positions[offset + 7] = y; positions[offset + 8] = z1 - pz;
    positions[offset + 9] = x1 + px; positions[offset + 10] = y; positions[offset + 11] = z1 + pz;
    colors[offset] = c.r * g; colors[offset + 1] = c.g * g; colors[offset + 2] = c.b * g;
    colors[offset + 3] = c.r * g; colors[offset + 4] = c.g * g; colors[offset + 5] = c.b * g;
    colors[offset + 6] = c.r * g; colors[offset + 7] = c.g * g; colors[offset + 8] = c.b * g;
    colors[offset + 9] = c.r * g; colors[offset + 10] = c.g * g; colors[offset + 11] = c.b * g;
    emitted += 1;
  }

  for (let i = 0; i < n && emitted < quadCapacity; i += 1) {
    let cx = record.xs[i];
    let cz = record.zs[i];
    if (useWreckPos && record.kind[i] === CHAIN_NODE_AFTERMATH) {
      cx = plan.aftermathX;
      cz = plan.aftermathZ;
    }
    // Diamond axis: the node's recorded direction; an unrecorded direction falls back to +X.
    let ax = record.dirX[i];
    let az = record.dirZ[i];
    const alen = Math.hypot(ax, az);
    if (!(alen > 1e-4)) { ax = 1; az = 0; }
    else { ax /= alen; az /= alen; }
    const px = -az;
    const pz = ax;
    const long = marker * (record.kind[i] === CHAIN_NODE_CONTACT ? 1.25 : 1);
    const wide = marker * 0.55;
    const c = CHAIN_NODE_COLOR[record.kind[i]] || CHAIN_NODE_COLOR[CHAIN_NODE_RELEASE];
    const g = fade;
    const offset = emitted * 12;
    positions[offset] = cx - ax * long; positions[offset + 1] = y; positions[offset + 2] = cz - az * long;
    positions[offset + 3] = cx + px * wide; positions[offset + 4] = y; positions[offset + 5] = cz + pz * wide;
    positions[offset + 6] = cx + ax * long; positions[offset + 7] = y; positions[offset + 8] = cz + az * long;
    positions[offset + 9] = cx - px * wide; positions[offset + 10] = y; positions[offset + 11] = cz - pz * wide;
    colors[offset] = c.r * g * 0.55; colors[offset + 1] = c.g * g * 0.55; colors[offset + 2] = c.b * g * 0.55;
    colors[offset + 3] = c.r * g; colors[offset + 4] = c.g * g; colors[offset + 5] = c.b * g;
    colors[offset + 6] = c.r * g * 0.55; colors[offset + 7] = c.g * g * 0.55; colors[offset + 8] = c.b * g * 0.55;
    colors[offset + 9] = c.r * g; colors[offset + 10] = c.g * g; colors[offset + 11] = c.b * g;
    emitted += 1;
  }

  out.indexCount = emitted * 6;
  return out;
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}
function clamp01(value) {
  return clamp(value, 0, 1);
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, finite(value, min)));
}
function clampInteger(value, min, max) {
  return Math.max(min, Math.min(max, Math.trunc(finite(value, min))));
}
