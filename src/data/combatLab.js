// Combat Lab surface presentation — section order, control labels, and the schema
// fields this Sandbox editor exposes. Catalogs (packages, arenas) live in combatLabSetups.js;
// this file does not invent a second legality source. Hull offers for a starter are decided by
// validateCombatLabSetup, not a parallel fits/buildSlotList copy. No systems imports.

import { SHIPS } from './ships.js';
import {
  COMBAT_LAB_STARTER_PACKAGES,
  COMBAT_LAB_ENEMY_PACKAGES,
  COMBAT_LAB_ARENAS,
} from './combatLabSetups.js';
import {
  COMBAT_LAB_SETUP_SCHEMA,
  validateCombatLabSetup,
} from '../contracts/combatLabSetupSchema.js';

function freezeArr(list) {
  return Object.freeze(list.map((item) => Object.freeze(item)));
}

export const COMBAT_LAB_SURFACE = Object.freeze({
  title: 'Combat Lab',
  fieldOrder: Object.freeze([
    'hullId',
    'starterPackageId',
    'enemyPackageId',
    'arenaId',
    'seed',
    'wave',
  ]),
  fields: freezeArr([
    { key: 'hullId', label: 'Hull', schemaField: 'hullId' },
    { key: 'starterPackageId', label: 'Starter loadout', schemaField: 'loadout' },
    { key: 'enemyPackageId', label: 'Enemy package', schemaField: 'enemyPackageId' },
    { key: 'arenaId', label: 'Arena', schemaField: 'arenaId' },
    { key: 'seed', label: 'Seed', schemaField: 'seed' },
    { key: 'wave', label: 'Starting wave', schemaField: 'wave' },
  ]),
  rollLabel: 'Roll',
  launchLabel: 'Launch',
  relaunchLabel: 'Relaunch same seed',
});

export const COMBAT_LAB_SURFACE_HULLS = freezeArr(
  SHIPS.map((ship) => ({ id: ship.id, label: ship.name })),
);

export const COMBAT_LAB_SURFACE_STARTERS = freezeArr(
  COMBAT_LAB_STARTER_PACKAGES.map((pkg) => ({ id: pkg.id, label: pkg.label })),
);

export const COMBAT_LAB_SURFACE_ENEMIES = freezeArr(
  COMBAT_LAB_ENEMY_PACKAGES.map((pkg) => ({ id: pkg.id, label: pkg.label })),
);

export const COMBAT_LAB_SURFACE_ARENAS = freezeArr(
  COMBAT_LAB_ARENAS.map((arena) => ({ id: arena.id, label: arena.label })),
);

const SURFACE_PROBE_ENEMY_ID = COMBAT_LAB_ENEMY_PACKAGES[0] && COMBAT_LAB_ENEMY_PACKAGES[0].id;
const SURFACE_PROBE_ARENA_ID = COMBAT_LAB_ARENAS[0] && COMBAT_LAB_ARENAS[0].id;

/** Hulls on which `starterPackageId`'s loadout is schema-legal. Chosen by validateCombatLabSetup. */
export function combatLabHullsForStarter(starterPackageId) {
  const pkg = COMBAT_LAB_STARTER_PACKAGES.find((entry) => entry.id === starterPackageId);
  if (!pkg) return freezeArr([]);
  const loadout = Array.isArray(pkg.loadout)
    ? pkg.loadout.map((entry) => ({ slotIndex: entry.slotIndex, defId: entry.defId }))
    : [];
  const offered = [];
  for (const hull of COMBAT_LAB_SURFACE_HULLS) {
    const result = validateCombatLabSetup({
      schema: COMBAT_LAB_SETUP_SCHEMA,
      hullId: hull.id,
      loadout,
      enemyPackageId: SURFACE_PROBE_ENEMY_ID,
      arenaId: SURFACE_PROBE_ARENA_ID,
      seed: 1,
      wave: 1,
    });
    if (result.ok) offered.push({ id: hull.id, label: hull.label });
  }
  return freezeArr(offered);
}

/** Keep the current hull when it still fits the starter; otherwise the package's own hullId. */
export function combatLabResolveHullId(starterPackageId, currentHullId) {
  const hulls = combatLabHullsForStarter(starterPackageId);
  const current = currentHullId == null ? '' : String(currentHullId);
  if (current && hulls.some((hull) => hull.id === current)) return current;
  const pkg = COMBAT_LAB_STARTER_PACKAGES.find((entry) => entry.id === starterPackageId);
  if (pkg && hulls.some((hull) => hull.id === pkg.hullId)) return pkg.hullId;
  return hulls[0] ? hulls[0].id : '';
}
