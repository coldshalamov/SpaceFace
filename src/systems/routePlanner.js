// Pure route planning over the discovered sector graph.
//
// Extracted from world.js (S1 stage 9): the whole-sim worker lane's main-side
// facade must answer world.computeRoute synchronously against the mirrored
// world state, so the Dijkstra body and its helpers live here with no bus
// emits and no mutations. world.js keeps the side-effectful wrapper (the
// gate-handshake burn + toast) and delegates the math.
//
// Every function takes plain state — live state in the worker realm, the
// domain mirror on the main lane — and never writes back to it.

import { SECTORS } from '../data/sectors.js';
import { MACHINE_PROTOCOL_FAULTS } from '../data/precursorMachines.js';

export const ROUTE_BASE_FUEL = 4;            // fuel units per lightyear
export const ROUTE_BASE_INTERDICT = 0.35;

// Jump-drive tiers (design 05). Resolved from the equipped module; defaults to T1.
export const DRIVE_TIERS = {
  jump_t1: { baseCharge: 8.0, tierFuelMult: 1.0,  driveStealth: 0.0,  hotJump: false },
  jump_t2: { baseCharge: 5.5, tierFuelMult: 0.85, driveStealth: 0.15, hotJump: false },
  jump_t3: { baseCharge: 3.5, tierFuelMult: 0.70, driveStealth: 0.35, hotJump: true  },
};
export const DEFAULT_DRIVE = DRIVE_TIERS.jump_t1;

const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));

const clampRoute = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Edge distance in lightyears from the two sectors' static map positions (clamped 2..9). */
export function routeEdgeDist(a, b) {
  if (a && b && a.position && b.position) {
    const dx = b.position.x - a.position.x, dy = b.position.y - a.position.y;
    const raw = Math.hypot(dx, dy);
    return clampRoute(raw * 1.4 + 1.5, 2, 9);
  }
  return 4;
}

export function routeInterdictChance(sector, via, drive) {
  if (!sector) return 0;
  if (via === 'gate') return clampRoute(0.02 + 0.06 * sector.tier - 0.10, 0, 0.15);
  const sec = sector.security != null ? sector.security : 0.5;
  return clampRoute(ROUTE_BASE_INTERDICT * (1 - sec) * (1 - (drive.driveStealth || 0)), 0, 0.6);
}

/**
 * The active jump drive for a state snapshot. world.js resolves the same value
 * from its latched _driveTierId; the facade path resolves straight off the
 * mirrored player entity (entity `data` ships in read-model rows).
 */
export function activeDriveForState(state, driveTierId) {
  if (driveTierId && DRIVE_TIERS[driveTierId]) return DRIVE_TIERS[driveTierId];
  const player = state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId) : null;
  const derived = player && player.data && player.data.derived;
  const id = derived && derived.jumpDriveTier;
  return (id && DRIVE_TIERS[id]) || DEFAULT_DRIVE;
}

/**
 * Read-only machine-route standing (AE-108). Semantics of
 * precursorMachines.machineRouteOpen minus its ensure-side-effect: callers on
 * the mirror must never mint alienEcology state.
 */
export function machineRouteStanding(state, accessKey) {
  const ae = state && state.world && state.world.alienEcology;
  if (ae && ae.machineAccess && ae.machineAccess[accessKey]) return 'open';
  const proto = ae && ae.machineProtocol || 'unknown';
  return (proto === 'compliant' || proto === 'witnessed' || proto === 'exception') ? 'open' : 'closed';
}

/**
 * Pure evaluation of _wormholeUnlocked — the same decision world.js makes,
 * reported without the handshake burn.
 *
 * `machineRouteOpen(state, key)` is the caller's resolver for machine standing:
 * world passes the real (ensure-ing) machineRouteOpen; lane facades pass
 * machineRouteStanding.
 *
 * Returns one of:
 *   'open'     — transit allowed as-is
 *   'burnable' — closed today, but a held cmdty_gate_handshake token would burn
 *                to open it (burnKey carries which gate record gets credited)
 *   'closed'   — no path
 * For 'burnable' results the caller decides whether to burn (world: yes, with
 * the toast + machineAccess write) or to treat the edge as preview-open
 * (facade: the route is reachable — the burn happens when the jump executes).
 */
export function wormholeGateCheck(state, sector, machineRouteOpen) {
  if (!sector || !sector.wormholeTo) return { status: 'closed', burnKey: null };
  const gate = sector.wormholeTo.gatedBy; // e.g. "tech:tech_long_range_survey"
  let open = !gate;
  if (gate) {
    const [kind, key] = gate.split(':');
    if (kind === 'tech') open = ((state.player && state.player.researchedNodes) || []).includes(key);
    else if (kind === 'flag') open = !!((state.story && state.story.flags) || {})[key];
    else if (kind === 'machine') {
      if (machineRouteOpen(state, key)) return { status: 'open', burnKey: null };
      const cargo = state.player && state.player.cargo;
      if (cargo && cargo.items && (cargo.items.cmdty_gate_handshake || 0) > 0) {
        return { status: 'burnable', burnKey: key };
      }
      return { status: 'closed', burnKey: null };
    } else open = false;
  }
  // AE-108 machineGate overlay (see world._wormholeUnlocked): fault verdict
  // refuses outright; clean machine standing or a burned token opens it.
  const machineKey = sector.wormholeTo.machineGate;
  if (!machineKey) return { status: open ? 'open' : 'closed', burnKey: null };
  const ae = state.world && state.world.alienEcology;
  if (ae && MACHINE_PROTOCOL_FAULTS.includes(ae.machineProtocol)) return { status: 'closed', burnKey: null };
  if (open) return { status: 'open', burnKey: null };
  if (machineRouteOpen(state, machineKey)) return { status: 'open', burnKey: null };
  const cargo2 = state.player && state.player.cargo;
  if (cargo2 && cargo2.items && (cargo2.items.cmdty_gate_handshake || 0) > 0) {
    return { status: 'burnable', burnKey: machineKey };
  }
  return { status: 'closed', burnKey: null };
}

/**
 * Dijkstra over discovered edges — identical traversal to world.computeRoute.
 * Weight = per-leg fuelCost ('fuel') or 1 ('hops').
 *
 * `opts.wormholeGate(state, sector)` -> 'open' | 'burnable' | 'closed'.
 * 'burnable' counts as traversable (the route exists; burning happens at jump
 * time) — that is the route world returns after its in-call burn.
 */
export function computeDiscoveredRoute(state, targetSectorId, mode, opts = {}) {
  if (!state || !state.world) return null;
  const start = state.world.currentSectorId;
  if (!start || !targetSectorId || start === targetSectorId) return null;
  const drive = opts.drive || DEFAULT_DRIVE;
  const wormholeGate = opts.wormholeGate || (() => 'closed');

  const dist = new Map(), prev = new Map();
  const visited = new Set();
  dist.set(start, 0);
  const pq = [start];

  const sectorOf = (id) => state.world.sectors[id] || SECTOR_BY_ID.get(id);
  const isDiscovered = (id) => {
    const d = state.world.discovery[id];
    return id === start || (d && d.discovered);
  };

  while (pq.length) {
    // Pop the smallest-dist node (linear scan; the canonical graph is only 24 nodes).
    let bi = 0;
    for (let i = 1; i < pq.length; i++) {
      if ((dist.get(pq[i]) ?? Infinity) < (dist.get(pq[bi]) ?? Infinity)) bi = i;
    }
    const u = pq.splice(bi, 1)[0];
    if (visited.has(u)) continue;
    visited.add(u);
    if (u === targetSectorId) break;
    const su = sectorOf(u);
    if (!su) continue;
    const neighbors = [...(su.neighbors || [])];
    if (su.wormholeTo && wormholeGate(state, su) !== 'closed') {
      neighbors.push(su.wormholeTo.sectorId);
    }
    for (const v of neighbors) {
      if (!isDiscovered(v) && v !== targetSectorId) continue; // route only through known space
      const sv = sectorOf(v);
      if (!sv) continue;
      const edgeDist = routeEdgeDist(su, sv);
      const w = mode === 'hops' ? 1 : Math.ceil(ROUTE_BASE_FUEL * edgeDist * drive.tierFuelMult);
      const alt = (dist.get(u) ?? Infinity) + w;
      if (alt < (dist.get(v) ?? Infinity)) {
        dist.set(v, alt); prev.set(v, u);
        if (!visited.has(v)) pq.push(v);
      }
    }
  }

  if (!prev.has(targetSectorId)) return null;
  // reconstruct
  const nodes = [];
  let cur = targetSectorId;
  while (cur && cur !== start) { nodes.unshift(cur); cur = prev.get(cur); }
  nodes.unshift(start);

  const legs = [];
  let totalFuel = 0;
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = sectorOf(nodes[i]), b = sectorOf(nodes[i + 1]);
    const edgeDist = routeEdgeDist(a, b);
    const fuel = Math.ceil(ROUTE_BASE_FUEL * edgeDist * drive.tierFuelMult);
    const charge = drive.baseCharge * (edgeDist / 4);
    const interdict = routeInterdictChance(b, 'drive', drive);
    legs.push({ from: nodes[i], to: nodes[i + 1], fuel, charge, interdict });
    totalFuel += fuel;
  }
  return { legs, totalFuel, totalHops: legs.length };
}
