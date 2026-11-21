// The one answer to "which station does E fly me to?" (2026-11-20, fly-to-berth from any distance).
// input.js acts on it and the flight helm (flightHelm.js) prints the same station on its prompt, so
// the words on screen can never name a different berth than the key flies to. Pure reads only.

/** A station the ship may be flown to: alive, placed, not hostile, not marked undockable. */
export function isDockableStation(e) {
  return !!(e && e.alive !== false && e.type === 'station' && e.pos
    && !(e.data && (e.data.hostile === true || e.data.dockable === false || e.data.isGate === true)));
}

function entityById(state, id) {
  if (id == null || !state || !state.entities || typeof state.entities.get !== 'function') return null;
  return state.entities.get(id) || null;
}

/** The station the pilot picked: the selected target first, else the tracked waypoint's station. */
export function chosenDockableStation(state) {
  const picked = entityById(state, state && state.player && state.player.targetId);
  if (isDockableStation(picked)) return picked;
  const tracked = entityById(state, state && state.nav && state.nav.waypoint && state.nav.waypoint.targetEntityId);
  return isDockableStation(tracked) ? tracked : null;
}

/** The nearest dockable station in the sector, at any distance. */
export function nearestDockableStation(state) {
  const me = entityById(state, state && state.playerId);
  if (!me || !me.pos) return null;
  const list = (state.entityIndex && state.entityIndex.stations) || state.entityList || [];
  let best = null;
  let bestD = Infinity;
  for (const e of list) {
    if (!isDockableStation(e)) continue;
    const d = Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

/**
 * The berth E flies to and why: `{ station, chosen }` (chosen = the pilot selected or tracks it),
 * or null when there is no dockable station in the sector.
 */
export function berthOfferStation(state) {
  const chosen = chosenDockableStation(state);
  if (chosen) return { station: chosen, chosen: true };
  const nearest = nearestDockableStation(state);
  return nearest ? { station: nearest, chosen: false } : null;
}

/** True while the nav autopilot is flying the berth run E started (a stale flag never counts). */
export function berthAutopilotStation(state) {
  const ap = state && state.nav && state.nav.autopilot;
  const id = state && state.ui && state.ui.berthAutopilotStationId;
  if (!ap || ap.active !== true || id == null || ap.targetEntityId !== id) return null;
  const station = entityById(state, id);
  return isDockableStation(station) ? station : null;
}

/** Display name of a station for prompts ("Helios Station"), never an id. */
export function stationDisplayName(station) {
  const raw = station && (station.name || (station.data && (station.data.displayName || station.data.name)));
  return typeof raw === 'string' && raw.trim() ? raw.trim() : 'Station';
}
