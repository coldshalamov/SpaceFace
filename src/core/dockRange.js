// Shared range query owned by core/physics.updateDockRange. This is geometry/range only;
// station access refusals and the flight UI command fence remain separate gates.
// Keep the nearest-station and gate selection identical for every consumer.
import { resolveCollisionProxyManifest, resolveDockAnchor } from '../data/collisionProxyManifests.js';

export function resolveDockRange(state, out = {}) {
  const player = state.entities.get(state.playerId);
  let nextStationId = null;
  let nextStation = null;
  let nextDist = Infinity;
  let nextGate = null;
  let nextGateDist = Infinity;

  if (player && player.alive) {
    const stations = (state.entityIndex && state.entityIndex.stations) || state.entityList;
    const playerSpeed = Math.hypot(
      player.vel && Number.isFinite(player.vel.x) ? player.vel.x : 0,
      player.vel && Number.isFinite(player.vel.z) ? player.vel.z : 0,
    );
    for (const st of stations) {
      if (!st.alive || st.type !== 'station') continue;
      const data = st.data || {};
      if (data.isGate) {
        const range = ((data.dockRadius || st.radius || 80) + (player.radius || 0)) * 1.5;
        const d = Math.hypot(st.pos.x - player.pos.x, st.pos.z - player.pos.z);
        if (d <= range + 28 && d < nextGateDist) {
          nextGateDist = d;
          nextGate = st;
        }
        continue;
      }
      if (!data.stationId) continue;
      // PQ-008 truthful exterior docking: stations declaring a collisionProxyManifest dock at
      // their berth, not at a forgiving center radius. The berth gate requires proximity AND a
      // slow approach; everything else about the dock:range seam is unchanged.
      // SF-130: the anchor is the berth for hulls whose planar envelope clears the pocket,
      // or the corridor-axis mooring standoff for hulls too deep for it — the same prompt
      // and gates, resolved from the station's real collision geometry each tick.
      const manifest = resolveCollisionProxyManifest(st);
      if (manifest && manifest.docking) {
        const anchor = resolveDockAnchor(st, manifest, player);
        if (!anchor) continue;
        const dAnchor = Math.hypot(anchor.x - player.pos.x, anchor.z - player.pos.z);
        if (dAnchor <= anchor.dockRadius && playerSpeed <= anchor.speedGate && dAnchor < nextDist) {
          nextDist = dAnchor;
          nextStationId = data.stationId;
          nextStation = st;
        }
        continue;
      }
      const range = ((data.dockRadius || st.radius || 80) + (player.radius || 0)) * 1.5;
      const d = Math.hypot(st.pos.x - player.pos.x, st.pos.z - player.pos.z);
      if (d <= range && d < nextDist) {
        nextDist = d;
        nextStationId = data.stationId;
        nextStation = st;
      }
    }
  }

  out.player = player;
  out.station = nextStation;
  out.stationId = nextStationId;
  out.gate = nextGate;
  return out;
}
