export const TUMBLE_STATUS_ID = 'status_tumbling';
export const MASSLINE_TUMBLE_KIND = 'massline_tumble';
export const COLLISION_TUMBLE_KIND = 'collision_tumble';
export const WEAPON_TUMBLE_KIND = 'weapon_tumble';
export const WELL_TUMBLE_KIND = 'well_tumble';
export const RCS_DISRUPT_KIND = 'rcs_disrupt';

export function readTumbleStatus(state, entityOrId) {
  const id = entityOrId && typeof entityOrId === 'object' ? entityOrId.id : entityOrId;
  if (id == null) return null;
  const runtime = state && state.combat && state.combat.entities
    ? state.combat.entities[String(id)]
    : null;
  if (!runtime) return null;

  const active = runtime.statuses && runtime.statuses[TUMBLE_STATUS_ID];
  if (isTumbleStatus(active)) return active;

  for (const pending of Array.isArray(runtime.pendingStatuses) ? runtime.pendingStatuses : []) {
    if (pending && pending.id === TUMBLE_STATUS_ID && isTumbleStatus(pending)) return pending;
  }
  return null;
}

export function isTumbling(state, entityOrId) {
  return readTumbleStatus(state, entityOrId) !== null;
}

// INF-027: post-tumble stabilization window. tumbleStates stamps entity.data.recoveringUntil
// (sim seconds) when a forced tumble runs its natural course; the helm reads disrupted until
// then. Pure read off entity data + sim clock — the same tick always reads the same answer.
export function isRecovering(state, entityOrId) {
  const entity = entityOrId && typeof entityOrId === 'object'
    ? entityOrId
    : (state && state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(entityOrId)
      : null);
  if (!entity || entity.alive === false) return false;
  const until = entity.data && Number(entity.data.recoveringUntil);
  if (!Number.isFinite(until)) return false;
  const now = Number.isFinite(state && state.simTime)
    ? state.simTime
    : (Number.isFinite(state && state.tick) ? state.tick / 60 : 0);
  return now < until;
}

export function readMasslineTumbleStatus(state, entityOrId) {
  const status = readTumbleStatus(state, entityOrId);
  return isMasslineTumble(status) ? status : null;
}

export function isMasslineTumbling(state, entityOrId) {
  return readMasslineTumbleStatus(state, entityOrId) !== null;
}

function isTumbleStatus(status) {
  return !!(status && status.id === TUMBLE_STATUS_ID);
}

function isMasslineTumble(status) {
  return status && status.data && status.data.kind === MASSLINE_TUMBLE_KIND;
}
