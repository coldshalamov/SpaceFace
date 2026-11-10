// Read-only impulse-charge rules shared by the simulation owner and presentation.
// Keep planning and fitting projections here so preview consumers do not load the tick system.
import { IMPULSE_CHARGES } from './impulseCharges.js';
import { MODULES } from './modules.js';
import { massline2Flag } from './featureFlags.js';

const CHARGE_BY_ID = new Map(Object.entries(IMPULSE_CHARGES));
const MODULE_BY_ID = new Map(MODULES.map((module) => [module.id, module]));

export const BOMB_PROPULSION_DIALS = Object.freeze({
  standoffRadii: 2.25,
  minStandoff: 13,
  // Preserve the authored 2.25R placement on small ships, but cap the clear gap behind a hull.
  maxSurfaceGapRadiusFrac: 0.5,
  relativeDropSpeed: 0,
  selfImpulseMult: 4.5,
  referenceSelfImpulseMin: 2200,
});

function chargeDef(id) {
  return CHARGE_BY_ID.get(id) || CHARGE_BY_ID.get('charge_standard');
}

export function activePlayerFittings(state) {
  const player = state && state.player;
  const activeShipIndex = Number.isInteger(player && player.activeShipIndex) && player.activeShipIndex >= 0
    ? player.activeShipIndex : 0;
  const owned = player && Array.isArray(player.ownedShips) ? player.ownedShips[activeShipIndex] : null;
  if (owned && Array.isArray(owned.fittings)) return owned.fittings;
  const playerEntity = state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : null;
  return Array.isArray(playerEntity?.data?.fittings) ? playerEntity.data.fittings : [];
}

function aimDir(player, state) {
  const aw = state.input && state.input.aimWorld;
  if (aw) {
    const dx = aw.x - player.pos.x, dz = aw.z - player.pos.z;
    const len = Math.hypot(dx, dz);
    if (len > 1e-4) return Math.atan2(dz, dx);
  }
  const input = state.input;
  return (input && input.aimAngle != null) ? input.aimAngle : (player.rot || 0);
}

export function repulsionTrapFitted(state) {
  return activePlayerFittings(state).some((id) => MODULE_BY_ID.get(id)?.mods?.repulsionTrap);
}

/** Maximum simultaneously deployed charges for the active player fit. */
export function resolveImpulseChargeCapacity(state) {
  const base = Math.max(1, Math.floor(Number(chargeDef('charge_standard').maxActive) || 1));
  const fittings = activePlayerFittings(state);
  let capacity = base;
  for (const id of fittings) {
    const declared = Number(MODULE_BY_ID.get(id)?.mods?.impulseChargeCapacity);
    if (Number.isFinite(declared)) capacity = Math.max(capacity, Math.floor(declared));
  }
  return capacity;
}

/** True only for a researched, fitted vector rack; the original charge rack/system stays live. */
export function bombPropulsionAvailable(state) {
  if (!massline2Flag('bombPropulsion')) return false;
  const player = state && state.player;
  const fittings = activePlayerFittings(state);
  const researched = new Set(player && player.researchedNodes || []);
  return fittings.some((id) => {
    const def = MODULE_BY_ID.get(id);
    return !!(def && def.mods && def.mods.bombPropulsion
      && (!def.requiresTech || researched.has(def.requiresTech)));
  });
}

/** The exact deployment pose shared by the charge command and its held-key preview. */
export function chargeThrowPlan(state, player) {
  const actions = state.input && state.input.actions;
  const braking = !!((actions && actions.brake) || state.input.brake || Number(state.input.moveZ) < -0.5);
  const trap = braking && repulsionTrapFitted(state);
  const chargeId = trap ? 'charge_repulsion_trap' : 'charge_standard';
  const def = chargeDef(chargeId);
  const aftDrop = bombPropulsionAvailable(state) && braking;
  const heading = Math.hypot(player.vel.x, player.vel.z) > 12
    ? Math.atan2(player.vel.z, player.vel.x) : (player.rot || 0);
  const dir = trap ? heading + Math.PI : aftDrop ? (player.rot || 0) + Math.PI : aimDir(player, state);
  const cf = Math.cos(dir), sf = Math.sin(dir);
  const noseR = player.radius || 6;
  const spawnDistance = trap ? noseR + 22 : aftDrop
    ? Math.max(
      BOMB_PROPULSION_DIALS.minStandoff,
      noseR + Math.min(
        noseR * (BOMB_PROPULSION_DIALS.standoffRadii - 1),
        def.radius * BOMB_PROPULSION_DIALS.maxSurfaceGapRadiusFrac,
      ),
    )
    : noseR;
  const throwSpeed = aftDrop ? BOMB_PROPULSION_DIALS.relativeDropSpeed : def.throwSpeed;
  return {
    braking, trap, chargeId, def, aftDrop, dir, cf, sf, spawnDistance, throwSpeed,
    pos: { x: player.pos.x + cf * spawnDistance, z: player.pos.z + sf * spawnDistance },
    vel: { x: trap ? 0 : cf * throwSpeed + player.vel.x, z: trap ? 0 : sf * throwSpeed + player.vel.z },
  };
}
