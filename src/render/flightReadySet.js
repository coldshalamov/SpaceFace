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
  return layer === PLACE_PACKAGE_LAYER.GAMEPLAY_SHELL
    || layer === PLACE_PACKAGE_LAYER.EXTERIOR_MID;
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
