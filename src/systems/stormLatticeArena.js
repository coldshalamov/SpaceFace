// Storm Lattice — arena law. The room CONDUCTS.
//
// Six pylons and two movable relay nodes form a conductivity graph. Electricity follows
// physical edges (range, line-of-sight past the insulated island, Massline cables). Traversal
// is score then distance then id, never insertion order, never a roll. Each hop pays
// PROC_COSTS.chain on the shared lineage budget and refuses a revisited node.
//
// Relay placement reuses the orbit-node kernel (phase + index, not a roll). Relays occupy the
// two arena field slots at strength 0 so they are not a standing Cryo aura and not a furnace.
// This is not Helios bounce, not Lagrange pull, not Cinder current, and not Cryo freeze.
// Boss role is data; no hull.

import { selectChainTarget } from '../combat/attackChain.js';
import {
  DEFAULT_CONSTRAINTS,
  PROC_COSTS,
  createLineage,
  recordTargetHit,
  tryConsumeProc,
} from '../combat/attackLineage.js';
import {
  ORBIT_DEFAULT_EFFECT_RADIUS,
  ORBIT_DEFAULT_PERIOD_TICKS,
  orbitNodePose,
} from '../combat/orbitNodes.js';

export const STORM_ARENA_ID = 'storm_lattice';

/** Wave-10 boss is a role over the existing dreadnought hull, not a new model. */
export const STORM_BOSS_ROLE = Object.freeze({
  id: 'grid_tyrant',
  hullId: 'dreadnought_boss',
  role: 'elite',
  law: STORM_ARENA_ID,
  drones: 4,
});

export const STORM_PYLON_COUNT = 6;
export const STORM_PYLON_RADIUS = 96;
export const STORM_CONDUCT_RANGE = 110;
export const STORM_NEIGHBOR_MAX = 3;
export const STORM_RELAY_COUNT = 2;
export const STORM_RELAY_ORBIT = 70;
export const STORM_ISLAND_RADIUS = 32;
export const STORM_RELAY_PERIOD = ORBIT_DEFAULT_PERIOD_TICKS;

const TAU = Math.PI * 2;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function distSq(a, b) {
  const dx = finite(a && a.x) - finite(b && b.x);
  const dz = finite(a && a.z) - finite(b && b.z);
  return dx * dx + dz * dz;
}

function stableId(value) {
  return value == null ? '' : String(value);
}

/**
 * PURE pylon ring. Index 0 is on +x; placement is index, never a roll.
 */
export function stormPylons(at, count = STORM_PYLON_COUNT, radius = STORM_PYLON_RADIUS) {
  const n = Number.isInteger(count) && count > 0 ? count : STORM_PYLON_COUNT;
  const r = finite(radius, STORM_PYLON_RADIUS);
  const nodes = [];
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * TAU;
    nodes.push({
      id: `pylon_${i}`,
      kind: 'pylon',
      conductive: true,
      score: 1,
      pos: { x: at.x + Math.cos(angle) * r, z: at.z + Math.sin(angle) * r },
    });
  }
  return nodes;
}

/**
 * PURE relay poses. Same orbitNodePose the Cryo Gyro rack uses: phase + index + simTime.
 */
export function placeStormRelays(at, simTime = 0, periodTicks = STORM_RELAY_PERIOD) {
  const host = { x: finite(at && at.x), z: finite(at && at.z) };
  const poses = [];
  for (let i = 0; i < STORM_RELAY_COUNT; i++) {
    const pose = orbitNodePose(host, i, STORM_RELAY_COUNT, STORM_RELAY_ORBIT, simTime, periodTicks);
    poses.push({
      id: `relay_${i}`,
      kind: 'relay',
      conductive: true,
      score: 2,
      pos: { x: pose.x, z: pose.z },
      phase: pose.phase,
    });
  }
  return poses;
}

function occupancyField(center) {
  return {
    kind: 'repulsor',
    center: { x: center.x, z: center.z },
    radius: ORBIT_DEFAULT_EFFECT_RADIUS,
    strength: 0,
    falloff: 1.2,
  };
}

/**
 * Interior of the segment AB clips the insulated island. Endpoints themselves do not count,
 * so a node sitting on the rim is still a legal vertex.
 */
export function stormSegmentBlocked(a, b, at, islandRadius = STORM_ISLAND_RADIUS) {
  const r = finite(islandRadius, STORM_ISLAND_RADIUS);
  if (!(r > 0)) return false;
  const ax = finite(a && a.x);
  const az = finite(a && a.z);
  const bx = finite(b && b.x);
  const bz = finite(b && b.z);
  const cx = finite(at && at.x);
  const cz = finite(at && at.z);
  const abx = bx - ax;
  const abz = bz - az;
  const abLen2 = abx * abx + abz * abz;
  if (abLen2 < 1e-12) return false;
  const acx = cx - ax;
  const acz = cz - az;
  let t = (acx * abx + acz * abz) / abLen2;
  if (t <= 1e-6 || t >= 1 - 1e-6) return false;
  const px = ax + abx * t;
  const pz = az + abz * t;
  const dx = px - cx;
  const dz = pz - cz;
  return dx * dx + dz * dz < r * r;
}

function sortNodes(nodes) {
  nodes.sort((a, b) => {
    const as = stableId(a.id);
    const bs = stableId(b.id);
    if (as < bs) return -1;
    if (as > bs) return 1;
    return 0;
  });
  return nodes;
}

function edgeKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * PURE local graph. Edges require range (or a Massline cable), line-of-sight past the island,
 * both ends conductive, and STORM_NEIGHBOR_MAX. Pair order is sorted id, never insertion.
 */
export function buildConductivityGraph(nodes, options = {}) {
  const at = options.at || { x: 0, z: 0 };
  const islandRadius = finite(options.islandRadius, STORM_ISLAND_RADIUS);
  const range = finite(options.range, STORM_CONDUCT_RANGE);
  const neighborMax = Number.isInteger(options.neighborMax) && options.neighborMax > 0
    ? options.neighborMax
    : STORM_NEIGHBOR_MAX;
  const rangeSq = range * range;
  const list = sortNodes((Array.isArray(nodes) ? nodes : []).filter((node) => node && node.id != null));
  const nodesById = new Map();
  for (let i = 0; i < list.length; i++) nodesById.set(list[i].id, list[i]);

  const cable = new Set();
  const tethers = Array.isArray(options.tethers) ? options.tethers : [];
  for (let i = 0; i < tethers.length; i++) {
    const row = tethers[i];
    const a = row && (row.a != null ? row.a : row.ownerId);
    const b = row && (row.b != null ? row.b : row.targetId);
    if (a == null || b == null || a === b) continue;
    if (!nodesById.has(a) || !nodesById.has(b)) continue;
    cable.add(edgeKey(a, b));
  }

  const candidates = [];
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.conductive === false) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (b.conductive === false) continue;
      const massline = cable.has(edgeKey(a.id, b.id));
      if (!massline) {
        const d2 = distSq(a.pos, b.pos);
        if (!(d2 > 0) || d2 > rangeSq) continue;
        if (stormSegmentBlocked(a.pos, b.pos, at, islandRadius)) continue;
      }
      candidates.push({ a: a.id, b: b.id, key: edgeKey(a.id, b.id), massline });
    }
  }
  candidates.sort((left, right) => {
    if (left.key < right.key) return -1;
    if (left.key > right.key) return 1;
    return 0;
  });

  const neighbors = new Map();
  for (let i = 0; i < list.length; i++) neighbors.set(list[i].id, []);
  const degree = new Map();
  for (let i = 0; i < list.length; i++) degree.set(list[i].id, 0);

  const edges = [];
  for (let i = 0; i < candidates.length; i++) {
    const edge = candidates[i];
    const da = degree.get(edge.a) || 0;
    const db = degree.get(edge.b) || 0;
    if (da >= neighborMax || db >= neighborMax) continue;
    neighbors.get(edge.a).push(edge.b);
    neighbors.get(edge.b).push(edge.a);
    degree.set(edge.a, da + 1);
    degree.set(edge.b, db + 1);
    edges.push(edge);
  }

  for (const ids of neighbors.values()) {
    ids.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }

  return { nodes: list, nodesById, neighbors, edges, at, range, neighborMax };
}

export function createStormLineage(options = {}) {
  const budget = Number.isInteger(options.lineageProcBudget) && options.lineageProcBudget >= 0
    ? options.lineageProcBudget
    : DEFAULT_CONSTRAINTS.lineageProcBudget;
  const spec = {
    digest: 'storm_lattice_discharge',
    constraints: {
      lineageProcBudget: budget,
      generationMax: 8,
      childMax: DEFAULT_CONSTRAINTS.childMax,
      sameTargetCooldownTicks: 0,
      activeFamilyCap: DEFAULT_CONSTRAINTS.activeFamilyCap,
      descendantsPerTickMax: DEFAULT_CONSTRAINTS.descendantsPerTickMax,
    },
    trajectory: {},
    propagation: { chain: { count: 8, range: STORM_CONDUCT_RANGE } },
  };
  return createLineage({
    spec,
    createdTick: Number.isInteger(options.tick) ? options.tick : 0,
    sourceEntityId: STORM_ARENA_ID,
  });
}

/**
 * Walk the graph from origin. Each hop pays PROC_COSTS.chain, records the destination on the
 * shared visited set, and stops on no-neighbor, revisit, or budget. hopMax is a hard cap so a
 * missing visited set cannot loop forever.
 */
export function conductAlongGraph(graph, originId, lineage, options = {}) {
  const hops = [];
  const suppressed = [];
  if (!graph || !graph.nodesById) {
    return { hops, suppressed, reason: 'no_graph' };
  }
  const origin = graph.nodesById.get(originId);
  if (!origin) return { hops, suppressed, reason: 'no_origin' };

  const hopMax = Number.isInteger(options.hopMax) && options.hopMax > 0
    ? options.hopMax
    : (lineage && lineage.budget && lineage.budget.constraints
      ? lineage.budget.constraints.childMax
      : STORM_NEIGHBOR_MAX * 2);
  const tick = Number.isInteger(options.tick) ? options.tick : 0;
  const visited = lineage && lineage.visitedTargets
    ? lineage.visitedTargets
    : (options.visited || new Map());
  if (lineage) recordTargetHit(lineage, origin.id, tick);
  else if (typeof visited.set === 'function') visited.set(origin.id, tick);

  let current = origin;
  for (let n = 0; n < hopMax; n++) {
    const neighborIds = graph.neighbors.get(current.id) || [];
    const candidates = [];
    for (let i = 0; i < neighborIds.length; i++) {
      const node = graph.nodesById.get(neighborIds[i]);
      if (!node || node.conductive === false) continue;
      candidates.push({
        id: node.id,
        pos: node.pos,
        score: Number.isFinite(node.score) ? node.score : 0,
        valid: true,
      });
    }
    const next = selectChainTarget(candidates, {
      sourcePos: current.pos,
      range: options.walkRange || 1e9,
      visited,
      excludeId: current.id,
    });
    if (!next) break;
    if (lineage) {
      const paid = tryConsumeProc(lineage, PROC_COSTS.chain, 'chain');
      if (!paid.ok) {
        suppressed.push({ id: next.id, reason: paid.reason || 'proc_budget', suppressed: true });
        break;
      }
      recordTargetHit(lineage, next.id, tick);
    } else if (typeof visited.set === 'function') {
      visited.set(next.id, tick);
    }
    hops.push({ fromId: current.id, toId: next.id, cost: PROC_COSTS.chain });
    current = graph.nodesById.get(next.id);
    if (!current) break;
  }
  return { hops, suppressed };
}

export function stormGraphNodes(at, simTime = 0, extras = []) {
  const pylons = stormPylons(at);
  const relays = placeStormRelays(at, simTime);
  const extra = Array.isArray(extras) ? extras : [];
  return pylons.concat(relays, extra);
}

/**
 * PURE room for one Storm wave. Always the lattice; phase retunes extras, not the law.
 * The two field slots are the movable relays.
 */
export function planStormInstall({
  arenaPhase,
  at = { x: 0, z: 0 },
  lane = { x: 1, z: 0 },
  across = { x: 0, z: 1 },
  spin = 0,
  simTime = 0,
} = {}) {
  const phase = typeof arenaPhase === 'string' ? arenaPhase : 'idle';
  const relays = placeStormRelays(at, simTime);
  const pylons = stormPylons(at);
  const out = {
    phase,
    note: '',
    fields: [],
    mines: [],
    cover: false,
    at: { x: at.x, z: at.z },
    pylons,
    relays,
    islandRadius: STORM_ISLAND_RADIUS,
  };

  switch (phase) {
    case 'idle':
    case 'shutter_slow':
      out.note = 'six pylons, two relays; current follows the wires';
      break;
    case 'furnace_active':
      out.note = 'the lattice is live; a discharge will walk the current graph';
      break;
    case 'loose_plate':
      out.note = 'insulating cover on the island; the pylons still conduct around it';
      out.cover = true;
      break;
    case 'shutter_alternating':
      out.note = 'relays keep moving; the path is the one they currently close';
      break;
    case 'shutter_lane_close': {
      out.note = 'the arrival is mined; the lattice still has to be wired';
      const mouth = { x: at.x + lane.x * 260, z: at.z + lane.z * 260 };
      for (let i = 0; i < 4; i++) {
        const offset = (i - 1.5) * 62;
        out.mines.push({
          x: mouth.x + across.x * offset,
          z: mouth.z + across.z * offset,
        });
      }
      break;
    }
    case 'absorbent_screen':
      out.note = 'insulated phase: the island is a break, not a shortcut';
      break;
    case 'boss': {
      out.note = 'grid tyrant: mobile relays, mined ring, cover on the island';
      out.cover = true;
      for (let i = 0; i < 4; i++) {
        const angle = spin + (i / 4) * TAU;
        out.mines.push({
          x: at.x + Math.cos(angle) * 205,
          z: at.z + Math.sin(angle) * 205,
        });
      }
      break;
    }
    default:
      out.note = 'inert room';
      return out;
  }

  out.fields.push(occupancyField(relays[0].pos), occupancyField(relays[1].pos));
  return out;
}
