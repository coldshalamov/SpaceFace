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
