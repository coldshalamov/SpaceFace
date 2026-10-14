// Live dialect: read the shipped validators and registries. Nothing here is a second schema.

import { listEntityProfiles, resolveEntityProfile } from '../../../src/testing/lab/entityProfiles.js';
import { SHIPS } from '../../../src/data/ships.js';
import {
  ENCOUNTER_KEYS,
  FORBIDDEN_ENCOUNTER_SCRIPTS,
  KNOWN_LAB_SIGNALS,
  MODULE_KEYS,
  PLACE_KEYS,
} from './mirrors.mjs';

let cached = null;

export async function loadDialect() {
  if (cached) return cached;
  const [encounters, weapons, modules, zones, enemies] = await Promise.all([
    import('../../../src/data/encounters.js'),
    import('../../../src/data/weapons.js'),
    import('../../../src/data/modules.js'),
    import('../../../src/data/sectorZones.js'),
    import('../../../src/data/enemies.js'),
  ]);

  const scripts = new Set();
  for (const row of Object.values(encounters.ENCOUNTERS)) {
    if (row && typeof row.script === 'string') scripts.add(row.script);
  }
  const zoneIds = new Set();
  for (const list of Object.values(zones.SECTOR_ZONES)) {
    if (!Array.isArray(list)) continue;
    for (const zone of list) if (zone && zone.id) zoneIds.add(zone.id);
  }
  const shipById = new Map(SHIPS.map((ship) => [ship.id, ship]));
  const enemyById = new Map(enemies.ENEMY_TYPES.map((enemy) => [enemy.id, enemy]));
  const draw = {};
  const profileIds = [
    'ship.starter', 'ship.kestrel', 'asteroid.light', 'asteroid.mid', 'asteroid.heavy', 'payload.anchor',
    ...SHIPS.map((ship) => ship.id),
    ...enemies.ENEMY_TYPES.flatMap((enemy) => (
      enemy && enemy.id ? [enemy.id, `enemy.${enemy.id}`] : []
    )),
  ];
  for (const profileId of profileIds) {
    if (draw[profileId]) continue;
    try {
      const resolved = resolveEntityProfile(profileId);
      if (resolved.kind === 'asteroid') {
        draw[profileId] = { kind: 'asteroid', radius: resolved.radius, mass: resolved.mass };
      } else if (resolved.kind === 'ship') {
        const ship = shipById.get(resolved.shipId);
        draw[profileId] = {
          kind: 'ship',
          shipId: resolved.shipId,
          radius: ship && Number.isFinite(ship.collisionRadius) ? ship.collisionRadius : null,
          mass: ship ? ship.mass : null,
        };
      } else if (resolved.kind === 'enemy') {
        const enemy = enemyById.get(resolved.enemyTypeId);
        draw[profileId] = {
          kind: 'enemy',
          radius: enemy && Number.isFinite(enemy.collisionRadius) ? enemy.collisionRadius : null,
          mass: enemy ? enemy.mass : null,
        };
      }
    } catch {
      // A missing curated profile is reported by export, not by dialect boot.
    }
  }

  cached = {
    scripts,
    forbiddenScripts: new Set(FORBIDDEN_ENCOUNTER_SCRIPTS),
    encounterIds: new Set(Object.keys(encounters.ENCOUNTERS)),
    encounterKeys: new Set(ENCOUNTER_KEYS),
    zoneTypes: Object.keys(zones.ZONE_TYPES),
    zoneTypeSet: new Set(Object.keys(zones.ZONE_TYPES)),
    sectorIds: new Set(Object.keys(zones.SECTOR_ZONES)),
    zoneIds,
    enemyIds: new Set(enemies.ENEMY_TYPES.map((row) => row.id)),
    weaponKeys: weapons.USER_WEAPON_KEYS,
    weaponIds: new Set(weapons.WEAPONS.map((row) => row.id)),
    moduleIds: new Set(modules.MODULES.map((row) => row.id)),
    moduleKeys: new Set(MODULE_KEYS),
    placeKeys: new Set(PLACE_KEYS),
    profiles: listEntityProfiles(),
    signals: KNOWN_LAB_SIGNALS,
    draw,
  };
  return cached;
}

export function resetDialectCache() {
  cached = null;
}
