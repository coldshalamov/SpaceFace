import { SHIPS } from './ships.js';

const SHIP_BY_ID = new Map(SHIPS.map((ship) => [ship.id, ship]));

export const SHIP_REGISTRY_NAME_MAX = 24;

/** A filed vessel name is optional. Null means the yard/catalog hull name remains authoritative. */
export function normalizeShipRegistryName(value) {
  const clean = String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const clipped = Array.from(clean).slice(0, SHIP_REGISTRY_NAME_MAX).join('').trim();
  return clipped || null;
}

export function shipRegistryIdentity(ownedShip) {
  const defId = ownedShip && typeof ownedShip.defId === 'string' ? ownedShip.defId : null;
  const hullName = SHIP_BY_ID.get(defId)?.name || String(defId || 'Unnamed Vessel');
  const registryName = normalizeShipRegistryName(ownedShip && ownedShip.registryName);
  return Object.freeze({
    defId,
    hullName,
    registryName,
    displayName: registryName || hullName,
    isNamed: !!registryName,
  });
}

/** Read the flown hull's public registry identity without creating saved state on an ordinary run. */
export function activePlayerShipRegistryIdentity(state) {
  const player = state && state.player;
  const owned = player && Array.isArray(player.ownedShips)
    ? player.ownedShips[Number.isInteger(player.activeShipIndex) ? player.activeShipIndex : 0]
    : null;
  if (owned) return shipRegistryIdentity(owned);
  const entity = state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId) : null;
  return shipRegistryIdentity({
    defId: entity && entity.data && entity.data.defId,
    registryName: entity && entity.data && entity.data.registryName,
  });
}

export function activePlayerShipRegistryName(state) {
  return activePlayerShipRegistryIdentity(state).displayName;
}
