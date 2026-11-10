// A berth already refuses a fast dock. The yard copy says a hard arrival still
// taxes the hull. This is that scrape: one kinetic bump while the hull is
// inside the berth pocket above the authored speed gate. A legal crawl, a
// docked ship, and open space pay nothing.

import { resolveCollisionProxyManifest, resolveDockAnchor } from '../data/collisionProxyManifests.js';

export const DOCK_BUMP_CAP = 9;
export const DOCK_BUMP_PER_WU = 0.18;
export const DOCK_BUMP_GAP_S = 1.4;

export function dockCollarDamage(speed, gate) {
  const s = Number(speed) || 0;
  const g = Number(gate);
  if (!(g > 0) || !(s > g)) return 0;
  return Math.min(DOCK_BUMP_CAP, (s - g) * DOCK_BUMP_PER_WU);
}

function playerSpeed(player) {
  const vel = player && player.vel;
  if (!vel) return 0;
  return Math.hypot(Number(vel.x) || 0, Number(vel.z) || 0);
}

function stationsOf(state) {
  const index = state.entityIndex;
  if (index && Array.isArray(index.stations) && index.stations.length) return index.stations;
  return state.entityList || [];
}

export function stepDockCollar(host, dt, state) {
  const empty = { hits: [] };
  if (!host || !(dt > 0) || !state) return empty;
  const player = state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : null;
  if (!player || player.alive === false || !player.pos) return empty;
  if ((state.ui && state.ui.docked) || (player.flags && player.flags.docked)) return empty;
  const speed = playerSpeed(player);
  if (!(speed > 0)) return empty;

  let best = null;
  let bestDist = Infinity;
  const stations = stationsOf(state);
  for (let i = 0; i < stations.length; i++) {
    const station = stations[i];
    if (!station || station.alive === false || station.type !== 'station') continue;
    if (station.data && station.data.isGate) continue;
    const manifest = resolveCollisionProxyManifest(station);
    if (!manifest || !manifest.docking) continue;
    const anchor = resolveDockAnchor(station, manifest, player);
    if (!anchor || !(anchor.dockRadius > 0)) continue;
    const dx = player.pos.x - anchor.x;
    const dz = player.pos.z - anchor.z;
    const dist = Math.hypot(dx, dz);
    if (dist > anchor.dockRadius || dist >= bestDist) continue;
    const damage = dockCollarDamage(speed, anchor.speedGate);
    if (!(damage > 0)) continue;
    bestDist = dist;
    best = { damage, gate: anchor.speedGate, pos: { x: player.pos.x, z: player.pos.z } };
  }
  if (!best) return empty;

  const now = Number(state.simTime) || 0;
  const book = host._dockCollarBook || (host._dockCollarBook = { nextAt: 0 });
  if (now < book.nextAt) return empty;
  book.nextAt = now + DOCK_BUMP_GAP_S;
  return { hits: [best] };
}
