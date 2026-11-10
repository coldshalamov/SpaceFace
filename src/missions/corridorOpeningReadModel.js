// Pure corridor-opening objective reads shared by the mission owner and flight HUD.
// This presentation projection stays independent of the missions runtime owner.

import { forEachLivingWorldActor } from '../world/livingWorldViews.js';

export const CORRIDOR_OPENING_STATION_ID = 'station_helios';
export const CORRIDOR_OPENING_SECTOR_ID = 'sector_helios_prime';
export const CORRIDOR_OPENING_STATION_LABEL = 'Helios Station';
/** Immediate-action verb for the pre-first-dock corridor idle objective. */
export const CORRIDOR_OPENING_ACTION = 'Dock at Helios Station';
/** Authored fallback world pos for Helios when the live station entity is not yet spawned. */
export const CORRIDOR_OPENING_FALLBACK_POS = Object.freeze({ x: 280, z: -140 });

/** True once the run has completed at least one dock (corridor first-minute gate). Pure over state. */
export function hasCorridorFirstDock(state) {
  if (!state || typeof state !== 'object') return false;
  if (state.ui && state.ui.corridorFirstDocked === true) return true;
  const at = state.ui && state.ui.corridorFirstDockAtS;
  if (at != null && Number.isFinite(Number(at))) return true;
  return false;
}

/** True when the tracker has an active tracked mission (not merely a stale id). Pure. */
export function hasActiveTrackedMission(state) {
  const trackedId = state && state.ui && state.ui.trackedMissionId;
  if (!trackedId) return false;
  const active = (state.missions && state.missions.active) || [];
  return active.some((mission) => mission && mission.id === trackedId && mission.status === 'active');
}

/** A Crucible match is on screen. Victory, ended, and inactive hand the campaign back. Pure. */
export function crucibleScreenIsLive(state) {
  const run = state && state.run;
  if (!run || run.kind !== 'survival') return false;
  const phase = run.phase;
  if (!phase || phase === 'inactive' || phase === 'ended' || phase === 'victory') return false;
  return true;
}

/** Resolve the pre-first-dock corridor idle objective when no mission is tracked. */
export function resolveCorridorOpeningObjective(state) {
  if (!state || typeof state !== 'object') return null;
  if (crucibleScreenIsLive(state)) return null;
  if (hasCorridorFirstDock(state)) return null;
  if (hasActiveTrackedMission(state)) return null;
  return {
    titleKey: 'currentObjective',
    action: CORRIDOR_OPENING_ACTION,
    reason: CORRIDOR_OPENING_ACTION,
    label: CORRIDOR_OPENING_STATION_LABEL,
    stationId: CORRIDOR_OPENING_STATION_ID,
    sectorId: CORRIDOR_OPENING_SECTOR_ID,
    sectorName: 'Helios Prime',
    kind: 'corridor',
    markerKind: 'station-dock',
  };
}

/** Find a live station entity by stationId (index first, entityList fallback). Pure read. */
export function findLiveStationEntity(state, stationId) {
  if (!state || !stationId) return null;
  const index = state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1) {
    const byStationId = index.byStationId;
    const indexed = byStationId && byStationId.get(stationId);
    if (indexed && indexed.alive !== false && indexed.type === 'station') return indexed;
  }
  return findLivingWorldActorStation(state, stationId);
}

export function findLivingWorldActorStation(state, stationId) {
  let found = null;
  forEachLivingWorldActor(state, (entity) => {
    if (found || !entity || entity.type !== 'station' || !entity.data || entity.data.stationId !== stationId) return;
    found = entity;
  });
  return found;
}

/** Build the synchronous nav-shaped waypoint for the corridor opening objective. */
export function buildCorridorOpeningWaypoint(state) {
  const objective = resolveCorridorOpeningObjective(state);
  if (!objective) return null;
  const live = findLiveStationEntity(state, objective.stationId);
  const pos = live && live.pos
    ? { x: Number(live.pos.x) || 0, z: Number(live.pos.z) || 0 }
    : { x: CORRIDOR_OPENING_FALLBACK_POS.x, z: CORRIDOR_OPENING_FALLBACK_POS.z };
  return {
    kind: 'corridor',
    stationId: objective.stationId,
    sectorId: objective.sectorId,
    sectorName: objective.sectorName,
    label: objective.label,
    mapLabel: objective.label,
    reason: objective.reason,
    markerKind: objective.markerKind,
    pos,
  };
}
