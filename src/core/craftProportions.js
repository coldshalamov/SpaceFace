// Shared pure hull proportions; no native backend or runtime ownership.
import { SHIPS } from '../data/ships.js';
import { ENEMY_TYPES } from '../data/enemies.js';

const BRUISER_PROPORTIONS = Object.freeze({ length: 1.72, halfWidth: 0.43, height: 0.31 });
const PIRATE_PROPORTIONS = Object.freeze({ length: 1.72, halfWidth: 0.29, height: 0.27 });
const PATROL_PROPORTIONS = Object.freeze({ length: 1.72, halfWidth: 0.77, height: 0.25 });

export const ENEMY_SILHOUETTE_PROPORTIONS = Object.freeze({
  drone_swarm: Object.freeze({ length: 1.72, halfWidth: 0.36, height: 0.26 }),
  sniper_lance: Object.freeze({ length: 1.72, halfWidth: 0.64, height: 0.21 }),
  detonator_dart: Object.freeze({ length: 1.72, halfWidth: 0.64, height: 0.21 }),
  bruiser_armor: BRUISER_PROPORTIONS,
  trader_haul: Object.freeze({ length: 1.72, halfWidth: 0.28, height: 0.30 }),
  pirate_swoop: PIRATE_PROPORTIONS,
  corsair_blade: Object.freeze({ length: 1.72, halfWidth: 0.29, height: 0.24 }),
  patrol_interdict: PATROL_PROPORTIONS,
  // Recovery-art names preserve the original capsule contracts; they are not new hull classes.
  warden_screen: BRUISER_PROPORTIONS,
  anchor_dish: BRUISER_PROPORTIONS,
  jackal_rack: PIRATE_PROPORTIONS,
  customs_prow: PATROL_PROPORTIONS,
  dreadnought_enemy: Object.freeze({ length: 1.72, halfWidth: 0.47, height: 0.49 }),
});

export const TRAFFIC_ROLE_PROPORTIONS = Object.freeze({
  arclight: Object.freeze({ length: 1.72, halfWidth: 0.32, height: 0.48 }),
  courier: Object.freeze({ length: 1.72, halfWidth: 0.39, height: 0.28 }),
  customs: Object.freeze({ length: 1.72, halfWidth: 0.21, height: 0.49 }),
  express: Object.freeze({ length: 1.72, halfWidth: 0.40, height: 0.56 }),
  hauler: Object.freeze({ length: 1.72, halfWidth: 0.28, height: 0.30 }),
  miner: Object.freeze({ length: 1.72, halfWidth: 0.34, height: 0.51 }),
  ore_carrier: Object.freeze({ length: 1.72, halfWidth: 0.19, height: 0.35 }),
  pirate: Object.freeze({ length: 1.72, halfWidth: 0.64, height: 0.21 }),
  prospector: Object.freeze({ length: 1.72, halfWidth: 0.24, height: 0.30 }),
  rescue: Object.freeze({ length: 1.72, halfWidth: 0.23, height: 0.31 }),
  salvor: Object.freeze({ length: 1.72, halfWidth: 0.29, height: 0.39 }),
  shuttle: Object.freeze({ length: 1.72, halfWidth: 0.25, height: 0.33 }),
  smuggler: Object.freeze({ length: 1.72, halfWidth: 0.33, height: 0.31 }),
  surveyor: Object.freeze({ length: 1.72, halfWidth: 0.33, height: 0.42 }),
  sweeper: Object.freeze({ length: 1.72, halfWidth: 0.28, height: 0.38 }),
  tanker: Object.freeze({ length: 1.72, halfWidth: 0.16, height: 0.33 }),
  tender: Object.freeze({ length: 1.72, halfWidth: 0.33, height: 0.33 }),
  tug: Object.freeze({ length: 1.72, halfWidth: 0.26, height: 0.38 }),
});

export const FACTION_HULL_PROPORTIONS = Object.freeze({
  'span:faction_dmc': Object.freeze({ length: 1.72, halfWidth: 0.28, height: 0.30 }),
  'span:faction_mts': Object.freeze({ length: 1.72, halfWidth: 0.28, height: 0.30 }),
  'span:faction_reach': Object.freeze({ length: 1.72, halfWidth: 0.28, height: 0.30 }),
  'wasp:faction_free': Object.freeze({ length: 1.72, halfWidth: 0.64, height: 0.21 }),
  'wasp:faction_mts': Object.freeze({ length: 1.72, halfWidth: 0.64, height: 0.21 }),
  'wasp:faction_scn': Object.freeze({ length: 1.72, halfWidth: 0.64, height: 0.21 }),
});

export const CRAFT_COLLISION_PROPORTIONS = Object.freeze({
  dart: Object.freeze({ length: 1.72, halfWidth: 0.42, height: 0.43 }),
  hornet: Object.freeze({ length: 1.72, halfWidth: 0.37, height: 0.54 }),
  wasp: Object.freeze({ length: 1.72, halfWidth: 0.64, height: 0.21 }),
  drifter: Object.freeze({ length: 1.72, halfWidth: 0.37, height: 0.35 }),
  kestrel: Object.freeze({ length: 1.72, halfWidth: 0.33, height: 0.31 }),
  pelican: Object.freeze({ length: 1.72, halfWidth: 0.77, height: 0.25 }),
  mule: Object.freeze({ length: 1.72, halfWidth: 0.29, height: 0.33 }),
  hawser: Object.freeze({ length: 1.72, halfWidth: 0.26, height: 0.38 }),
  bastion: Object.freeze({ length: 1.72, halfWidth: 0.35, height: 0.41 }),
  ironback: Object.freeze({ length: 1.72, halfWidth: 0.28, height: 0.33 }),
  ranger: Object.freeze({ length: 1.72, halfWidth: 0.37, height: 0.33 }),
  warden: Object.freeze({ length: 1.72, halfWidth: 0.26, height: 0.45 }),
  colossus: Object.freeze({ length: 1.72, halfWidth: 0.42, height: 0.39 }),
  leviathan: Object.freeze({ length: 1.72, halfWidth: 0.47, height: 0.49 }),
  ship_dart: Object.freeze({ length: 1.72, halfWidth: 0.42, height: 0.43 }),
  ship_hornet: Object.freeze({ length: 1.72, halfWidth: 0.37, height: 0.54 }),
  ship_wasp: Object.freeze({ length: 1.72, halfWidth: 0.64, height: 0.21 }),
  ship_drifter: Object.freeze({ length: 1.72, halfWidth: 0.37, height: 0.35 }),
  ship_kestrel: Object.freeze({ length: 1.72, halfWidth: 0.33, height: 0.31 }),
  ship_pelican: Object.freeze({ length: 1.72, halfWidth: 0.77, height: 0.25 }),
  ship_mule: Object.freeze({ length: 1.72, halfWidth: 0.29, height: 0.33 }),
  ship_hawser: Object.freeze({ length: 1.72, halfWidth: 0.26, height: 0.38 }),
  ship_bastion: Object.freeze({ length: 1.72, halfWidth: 0.35, height: 0.41 }),
  ship_ironback: Object.freeze({ length: 1.72, halfWidth: 0.28, height: 0.33 }),
  ship_ranger: Object.freeze({ length: 1.72, halfWidth: 0.37, height: 0.33 }),
  ship_warden: Object.freeze({ length: 1.72, halfWidth: 0.26, height: 0.45 }),
  ship_colossus: Object.freeze({ length: 1.72, halfWidth: 0.42, height: 0.39 }),
  ship_leviathan: Object.freeze({ length: 1.72, halfWidth: 0.47, height: 0.49 }),
  'wasp:faction_free': Object.freeze({ length: 1.72, halfWidth: 0.64, height: 0.21 }),
  'wasp:faction_mts': Object.freeze({ length: 1.72, halfWidth: 0.64, height: 0.21 }),
  'wasp:faction_scn': Object.freeze({ length: 1.72, halfWidth: 0.64, height: 0.21 }),
});

const CRAFT_PROPORTIONS_CACHE = new Map();
for (const [sil, prop] of Object.entries(ENEMY_SILHOUETTE_PROPORTIONS)) {
  CRAFT_PROPORTIONS_CACHE.set(sil, prop);
}
for (const [role, prop] of Object.entries(TRAFFIC_ROLE_PROPORTIONS)) {
  CRAFT_PROPORTIONS_CACHE.set(role, prop);
  CRAFT_PROPORTIONS_CACHE.set(`traffic:${role}`, prop);
}
for (const [key, prop] of Object.entries(FACTION_HULL_PROPORTIONS)) {
  CRAFT_PROPORTIONS_CACHE.set(key, prop);
}
for (const [key, prop] of Object.entries(CRAFT_COLLISION_PROPORTIONS)) {
  CRAFT_PROPORTIONS_CACHE.set(key, prop);
}
for (const ship of SHIPS || []) {
  if (ship && ship.id && ship.visuals && ship.visuals.proportions) {
    if (!CRAFT_PROPORTIONS_CACHE.has(ship.id)) {
      CRAFT_PROPORTIONS_CACHE.set(ship.id, ship.visuals.proportions);
    }
  }
}
for (const enemy of ENEMY_TYPES || []) {
  if (enemy && enemy.id) {
    const silProp = enemy.silhouette && ENEMY_SILHOUETTE_PROPORTIONS[enemy.silhouette];
    const shipProp = enemy.shipId && CRAFT_PROPORTIONS_CACHE.get(enemy.shipId);
    const prop = silProp || shipProp;
    if (prop) CRAFT_PROPORTIONS_CACHE.set(enemy.id, prop);
  }
}

export function resolveCraftProportions(entity, spec = null) {
  const data = (entity && entity.data) || {};
  if (data.proportions && Number.isFinite(data.proportions.length) && Number.isFinite(data.proportions.halfWidth)) {
    return data.proportions;
  }
  if (data.silhouette && ENEMY_SILHOUETTE_PROPORTIONS[data.silhouette]) {
    return ENEMY_SILHOUETTE_PROPORTIONS[data.silhouette];
  }
  for (const key of [
    data.defId,
    data.shipId,
    data.typeId,
    data.chassisId,
    data.trafficRole,
    data.trafficRole ? `traffic:${data.trafficRole}` : null,
    entity && entity.id,
  ]) {
    if (typeof key === 'string' && CRAFT_PROPORTIONS_CACHE.has(key)) {
      return CRAFT_PROPORTIONS_CACHE.get(key);
    }
  }
  if (entity && entity.type === 'drone') {
    return { length: 1.0, halfWidth: 0.45, height: 0.30 };
  }
  return { length: 1.35, halfWidth: 0.42, height: 0.30 };
}
