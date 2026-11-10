// Bounded orbiting field nodes (PQ-133.06 / CRU-039).
// Nodes spend the shared lineage proc budget. Placement is phase + index, never a roll.
// Efficacy requires active host positioning — a parked ring is not an aura.

import { createFieldKernel } from '../core/fields/fieldKernel.js';
import { FIELD_KINDS } from '../data/fields.js';
import { PROC_COSTS, trySpawnDescendant } from './attackLineage.js';
import { selectTargets } from './attackTargeting.js';
import { applyCryoLock, CRYO_LOCK_STATUS_ID } from './cryoLock.js';

export const ORBIT_NODE_TYPE = 'orbit_node';
export const ORBIT_NODE_CAP = 8;
export const ORBIT_MIN_HOST_SPEED = 8;
export const ORBIT_ALIGN_MIN = 0.5;
export const ORBIT_DEFAULT_RADIUS = 48;
export const ORBIT_DEFAULT_EFFECT_RADIUS = 14;
export const ORBIT_DEFAULT_PERIOD_TICKS = 90;
export const ORBIT_DEFAULT_STRENGTH = 40;

const TAU = Math.PI * 2;
const TICKS_PER_SECOND = 60;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function orbitOf(spec) {
  return spec && spec.propagation && spec.propagation.orbit
    ? spec.propagation.orbit
    : null;
}

export function createOrbitWorld(options = {}) {
  const cap = Number.isInteger(options.cap) && options.cap > 0 ? options.cap : ORBIT_NODE_CAP;
  return {
    kernel: options.kernel || createFieldKernel(),
    nodes: [],
    cap,
    contacts: [],
  };
}

export function countOrbitNodes(world) {
  if (!world || !Array.isArray(world.nodes)) return 0;
  let n = 0;
  for (let i = 0; i < world.nodes.length; i++) {
    if (world.nodes[i] && world.nodes[i].type === ORBIT_NODE_TYPE) n++;
  }
  return n;
}

export function countOrbitFields(kernel) {
  if (!kernel || typeof kernel.list !== 'function') return 0;
  const list = kernel.list();
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    if (list[i] && list[i].tag === ORBIT_NODE_TYPE) n++;
  }
  return n;
}

export function removeOrbitNodesForHost(world, hostId) {
  if (!world || !Array.isArray(world.nodes) || hostId == null) return 0;
  let removed = 0;
  const keep = [];
  for (let i = 0; i < world.nodes.length; i++) {
    const node = world.nodes[i];
    if (node && node.hostId === hostId) {
      if (world.kernel && typeof world.kernel.unregister === 'function') world.kernel.unregister(node.id);
      removed += 1;
    } else {
      keep.push(node);
    }
  }
  world.nodes = keep;
  return removed;
}

export function listOrbitNodeIdentities(world) {
  const nodes = world && Array.isArray(world.nodes) ? sortNodes(world.nodes.slice()) : [];
  const out = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node || node.type !== ORBIT_NODE_TYPE) continue;
    out.push({
      id: node.id,
      type: node.type,
      index: node.index,
      hostId: node.hostId != null ? node.hostId : null,
    });
  }
  return out;
}

export function orbitNodePose(host, index, count, radius, simTime, periodTicks) {
  const n = Math.max(1, Number.isInteger(count) && count > 0 ? count : 1);
  const r = finite(radius, ORBIT_DEFAULT_RADIUS);
  const period = finite(periodTicks, ORBIT_DEFAULT_PERIOD_TICKS);
  const spin = period > 0 ? (finite(simTime) * TICKS_PER_SECOND / period) * TAU : 0;
  const phase = (index / n) * TAU + spin;
  return {
    x: finite(host && host.x) + Math.cos(phase) * r,
    z: finite(host && host.z) + Math.sin(phase) * r,
    phase,
  };
}

/**
 * An orbit node is efficacious only when the host is flying and has presented that node
 * toward the target. Parked, opposite-side, and unaligned rings score 0.
 */
export function orbitEfficacy(host, node, target, options = {}) {
  const minSpeed = Number.isFinite(options.minHostSpeed) ? options.minHostSpeed : ORBIT_MIN_HOST_SPEED;
  const alignMin = Number.isFinite(options.alignMin) ? options.alignMin : ORBIT_ALIGN_MIN;
  const effectR = finite(node && node.effectRadius, ORBIT_DEFAULT_EFFECT_RADIUS);
  const tx = finite(target && target.pos && target.pos.x, finite(target && target.x));
  const tz = finite(target && target.pos && target.pos.z, finite(target && target.z));
  const nx = finite(node && node.x);
  const nz = finite(node && node.z);
  const dx = tx - nx;
  const dz = tz - nz;
  if (dx * dx + dz * dz > effectR * effectR) return 0;
  const speed = Math.hypot(finite(host && host.vx), finite(host && host.vz));
  if (speed < minSpeed) return 0;
  const hx = finite(host && host.x);
  const hz = finite(host && host.z);
  const toNodeX = nx - hx;
  const toNodeZ = nz - hz;
  const toTgtX = tx - hx;
  const toTgtZ = tz - hz;
  const nLen = Math.hypot(toNodeX, toNodeZ);
  const tLen = Math.hypot(toTgtX, toTgtZ);
  if (nLen < 1e-6 || tLen < 1e-6) return 0;
  const align = (toNodeX * toTgtX + toNodeZ * toTgtZ) / (nLen * tLen);
  if (align < alignMin) return 0;
  // Must not be fleeing the target — a trailing ring on someone you are leaving is an ignored aura.
  const closing = finite(host && host.vx) * toTgtX + finite(host && host.vz) * toTgtZ;
  if (closing < 0) return 0;
  return 1;
}

function fieldIdFor(lineageId, index) {
  const padded = index < 10 ? `0${index}` : String(index);
  return `orbit:${lineageId}:${padded}`;
}

function sortNodes(nodes) {
  nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return nodes;
}

function asCandidate(target) {
  return {
    id: target.id,
    pos: target.pos || { x: finite(target.x), z: finite(target.z) },
    score: Number.isFinite(target.score) ? target.score : 0,
    statuses: Array.isArray(target.statuses) ? target.statuses : [],
    valid: target.valid !== false,
    vx: finite(target.vx),
    vz: finite(target.vz),
  };
}

/**
 * Spawn orbit nodes as lineage descendants. Each node costs PROC_COSTS.orbitNode.
 * Extra requests die to the proc budget, the generation/child caps, or ORBIT_NODE_CAP.
 */
export function trySpawnOrbitNodes(world, parent, spec, host, options = {}) {
  const orbit = orbitOf(spec);
  const want = orbit && Number.isInteger(orbit.count) && orbit.count > 0 ? orbit.count : 0;
  const spawned = [];
  const suppressed = [];
  if (!world || !parent || want <= 0) {
    return { ok: want <= 0, spawned, suppressed, reason: want <= 0 ? 'no_orbit' : 'no_world' };
  }
  const radius = finite(orbit.radius, ORBIT_DEFAULT_RADIUS);
  const effectRadius = finite(orbit.effectRadius, ORBIT_DEFAULT_EFFECT_RADIUS);
  const periodTicks = finite(orbit.periodTicks, ORBIT_DEFAULT_PERIOD_TICKS);
  const strength = finite(orbit.impulse, ORBIT_DEFAULT_STRENGTH);
  const tick = Number.isInteger(options.tick) ? options.tick : parent.createdTick;
  const simTime = finite(options.simTime, tick / TICKS_PER_SECOND);
  const hostId = host && host.id != null ? host.id : parent.sourceEntityId;

  for (let i = 0; i < want; i++) {
    if (world.nodes.length >= world.cap) {
      suppressed.push({ index: i, reason: 'orbit_cap' });
      continue;
    }
    const child = trySpawnDescendant(parent, {
      spec,
      cost: PROC_COSTS.orbitNode,
      tick,
      allowedActions: ['apply_payload', 'apply_cryo_lock'],
      remaining: { bounces: 0, chains: 0, pierces: 0, splits: 0 },
    });
    if (!child.ok) {
      suppressed.push({ index: i, reason: child.reason || 'proc_budget', suppressed: true });
      continue;
    }
    const pose = orbitNodePose(host, i, want, radius, simTime, periodTicks);
    const id = fieldIdFor(parent.lineageId, i);
    world.kernel.register({
      id,
      kind: FIELD_KINDS.REPULSOR,
      tag: ORBIT_NODE_TYPE,
      center: { x: pose.x, z: pose.z },
      radius: effectRadius,
      strength: 0,
      durationS: Infinity,
      createdAt: simTime,
      sourceId: hostId,
      ownerId: hostId,
      filters: hostId != null ? { excludeId: hostId } : null,
    });
    world.nodes.push({
      id,
      type: ORBIT_NODE_TYPE,
      index: i,
      hostId,
      lineageId: parent.lineageId,
      runtime: child.runtime,
      x: pose.x,
      z: pose.z,
      phase: pose.phase,
      radius,
      effectRadius,
      periodTicks,
      baseStrength: strength,
      count: want,
    });
    spawned.push(world.nodes[world.nodes.length - 1]);
  }
  sortNodes(world.nodes);
  return { ok: spawned.length > 0, spawned, suppressed };
}

export function applyOrbitContacts(world, host, targets = [], options = {}) {
  const events = [];
  const ignored = [];
  const list = Array.isArray(targets) ? targets.map(asCandidate) : [];
  const hostId = host && host.id != null ? host.id : null;
  const nodes = sortNodes(world.nodes.filter((node) => {
    if (!node || node.type !== ORBIT_NODE_TYPE) return false;
    if (hostId == null || node.hostId == null) return true;
    return node.hostId === hostId;
  }));
  for (let n = 0; n < nodes.length; n++) {
    const node = nodes[n];
    const inRange = [];
    const effectSq = node.effectRadius * node.effectRadius;
    for (let i = 0; i < list.length; i++) {
      const target = list[i];
      const dx = target.pos.x - node.x;
      const dz = target.pos.z - node.z;
      if (dx * dx + dz * dz <= effectSq) inRange.push(target);
    }
    const ordered = selectTargets(inRange, {
      count: Math.max(1, inRange.length),
      sourcePos: { x: node.x, z: node.z },
    });
    for (let i = 0; i < ordered.length; i++) {
      const target = ordered[i];
      const efficacy = orbitEfficacy(host, node, target, options);
      if (!(efficacy > 0)) {
        ignored.push({ nodeId: node.id, targetId: target.id, reason: 'no_positioning' });
        continue;
      }
      const locked = applyCryoLock(target, 1);
      events.push({
        nodeId: node.id,
        targetId: target.id,
        statusId: CRYO_LOCK_STATUS_ID,
        vx: locked.vx,
        vz: locked.vz,
        controlScale: locked.controlScale,
        efficacy,
      });
    }
  }
  world.contacts = events;
  return { events, ignored };
}

/**
 * Advance node poses, write field centers, and resolve cryo contacts.
 * Field strength is 0 while the host is parked so the ring cannot act as a standing aura.
 */
export function stepOrbitWorld(world, host, simTime, targets = [], options = {}) {
  const speed = Math.hypot(finite(host && host.vx), finite(host && host.vz));
  const powered = speed >= ORBIT_MIN_HOST_SPEED;
  const hostId = host && host.id != null ? host.id : null;
  for (let i = 0; i < world.nodes.length; i++) {
    const node = world.nodes[i];
    if (hostId != null && node.hostId != null && node.hostId !== hostId) continue;
    const pose = orbitNodePose(host, node.index, node.count, node.radius, simTime, node.periodTicks);
    node.x = pose.x;
    node.z = pose.z;
    node.phase = pose.phase;
    world.kernel.update(node.id, {
      center: { x: node.x, z: node.z },
      strength: powered ? node.baseStrength : 0,
    });
  }
  sortNodes(world.nodes);
  return applyOrbitContacts(world, host, targets, options);
}
