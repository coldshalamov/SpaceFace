// Flight-ready membership. Input may start once this set is ready; far place
// detail streams afterward. Collision/docking shells stay pinned while a
// station is interactable.

export const PLACE_PACKAGE_LAYER = Object.freeze({
  GAMEPLAY_SHELL: 'GameplayShell',
  EXTERIOR_MID: 'ExteriorMid',
  EXTERIOR_NEAR: 'ExteriorNear',
  CLOSE_DETAIL: 'CloseDetail',
  INTERIOR: 'Interior',
});

export const FLIGHT_READY_ROLE = Object.freeze({
  PLAYER_GAMEPLAY: 'playerGameplay',
  PLAYER_FLIGHT_PACKAGE: 'playerFlightPackage',
  GLASS_ACTORS: 'glassActors',
  COLLISION_SHELL: 'collisionShell',
  TABLE_STATION_SHELL: 'tableStationShell',
  FIRST_FRAME_BACKGROUND: 'firstFrameBackground',
  HUD_INPUT: 'hudInput',
});

export function isPlaceLayerBlockingFlightReady(layer) {
  // The gameplay/collision shell is the only place payload allowed to hold
  // the control handoff. Exterior polish, close detail, and interiors stream
  // after flight begins; this is the shell-first rule for large places.
  return layer === PLACE_PACKAGE_LAYER.GAMEPLAY_SHELL;
}

export function selectPlacePackageLayer(options = {}) {
  if (options.docked === true) return PLACE_PACKAGE_LAYER.INTERIOR;
  if (options.onGlass === true && Number(options.projectedPx) > 220) {
    return PLACE_PACKAGE_LAYER.EXTERIOR_NEAR;
  }
  if (options.onGlass === true) return PLACE_PACKAGE_LAYER.EXTERIOR_MID;
  if (options.onRunway === true || options.interactable === true) {
    return PLACE_PACKAGE_LAYER.GAMEPLAY_SHELL;
  }
  return null;
}

export function isFlightReadyRoleBlocking(role) {
  return role === FLIGHT_READY_ROLE.PLAYER_GAMEPLAY
    || role === FLIGHT_READY_ROLE.PLAYER_FLIGHT_PACKAGE
    || role === FLIGHT_READY_ROLE.GLASS_ACTORS
    || role === FLIGHT_READY_ROLE.COLLISION_SHELL
    || role === FLIGHT_READY_ROLE.TABLE_STATION_SHELL
    || role === FLIGHT_READY_ROLE.FIRST_FRAME_BACKGROUND
    || role === FLIGHT_READY_ROLE.HUD_INPUT;
}

const READY_STATUSES = new Set([
  'ready',
  'authored',
  'authored-with-cleanup-error',
  'authored-prepared',
  'same-semantic-fallback-prepared',
  'shell-ready',
]);

function readyStatus(status) {
  return status === true || READY_STATUSES.has(String(status || ''));
}

/**
 * Runtime startup membership. The old opening gate inferred a blocking set
 * from every entity that happened to be near the camera, which made large
 * places and traffic hold New Game behind full detail. This set is explicit:
 * callers require only player/control roots and gameplay shells, then mark
 * the shell ready while optional detail remains streamable.
 */
export function createFlightReadySet(_options = {}) {
  const required = new Map();
  const places = new Map();
  let sealed = false;
  let anonymousRequirement = 0;
  const requireRole = (role, status = false, metadata = null) => {
    if (!isFlightReadyRoleBlocking(role) || sealed) return false;
    const id = metadata && metadata.id != null ? String(metadata.id) : `#${anonymousRequirement++}`;
    required.set(`${role}:${id}`, { role, status, metadata });
    return true;
  };
  const requirePlace = (id, layer, status = false, metadata = null) => {
    if (!isPlaceLayerBlockingFlightReady(layer) || sealed || id == null) return false;
    places.set(String(id), { layer, status, metadata });
    return true;
  };
  const markRole = (role, status = true, id = null) => {
    let marked = false;
    for (const item of required.values()) {
      if (item.role !== role || (id != null && String(item.metadata?.id) !== String(id))) continue;
      item.status = status;
      marked = true;
    }
    return marked;
  };
  const markPlace = (id, status = true) => {
    const item = places.get(String(id));
    if (!item) return false;
    item.status = status;
    return true;
  };
  const blockers = () => Object.freeze([
    ...[...required.values()]
      .filter((item) => !readyStatus(item.status))
      .map((item) => Object.freeze({ kind: 'role', role: item.role, metadata: item.metadata || null })),
    ...[...places.entries()]
      .filter(([, item]) => !readyStatus(item.status))
      .map(([id, item]) => Object.freeze({ kind: 'place', id, layer: item.layer, metadata: item.metadata || null })),
  ]);
  return {
    requireRole,
    requirePlace,
    markRole,
    markPlace,
    seal() { sealed = true; return this.snapshot(); },
    get sealed() { return sealed; },
    isReady() { return blockers().length === 0; },
    blockers,
    snapshot() {
      return Object.freeze({
        sealed,
        ready: blockers().length === 0,
        roles: Object.freeze([...required.values()].map((item) => Object.freeze({
          role: item.role, status: item.status, metadata: item.metadata || null,
        }))),
        places: Object.freeze([...places].map(([id, item]) => Object.freeze({
          id, layer: item.layer, status: item.status, metadata: item.metadata || null,
        }))),
      });
    },
  };
}

export function isFlightReadyStatus(status) {
  return readyStatus(status);
}
