// PQ-133.12 — named library over the four live arena-law installers.
// Does not fork them. Each module is the same { phase, note, fields, mines, cover } shape.

import {
  CINDER_ARENA_ID,
  CINDER_BOSS_ROLE,
  planCinderInstall,
} from '../systems/cinderSluiceArena.js';
import {
  CRYO_ARENA_ID,
  CRYO_BOSS_ROLE,
  planCryoInstall,
} from '../systems/cryoDriftArena.js';
import {
  LAGRANGE_ARENA_ID,
  LAGRANGE_BOSS_ROLE,
  planLagrangeInstall,
} from '../systems/lagrangeCrucible.js';
import {
  STORM_ARENA_ID,
  STORM_BOSS_ROLE,
  planStormInstall,
} from '../systems/stormLatticeArena.js';
import { validateArenaModule } from '../contracts/contentFactory.js';

export const ARENA_MODULE_LIBRARY = Object.freeze([
  Object.freeze({
    id: LAGRANGE_ARENA_ID,
    law: 'pull',
    bossRole: LAGRANGE_BOSS_ROLE,
    fieldBudget: 2,
    planInstall: planLagrangeInstall,
  }),
  Object.freeze({
    id: CINDER_ARENA_ID,
    law: 'current',
    bossRole: CINDER_BOSS_ROLE,
    fieldBudget: 2,
    planInstall: planCinderInstall,
  }),
  Object.freeze({
    id: CRYO_ARENA_ID,
    law: 'freeze',
    bossRole: CRYO_BOSS_ROLE,
    fieldBudget: 2,
    planInstall: planCryoInstall,
  }),
  Object.freeze({
    id: STORM_ARENA_ID,
    law: 'conduct',
    bossRole: STORM_BOSS_ROLE,
    fieldBudget: 2,
    planInstall: planStormInstall,
  }),
]);

export const ARENA_MODULE_BY_ID = Object.freeze(Object.fromEntries(
  ARENA_MODULE_LIBRARY.map((mod) => [mod.id, mod]),
));

export function validateArenaModuleLibrary(library = ARENA_MODULE_LIBRARY) {
  const issues = [];
  if (!Array.isArray(library) || library.length === 0) {
    return { ok: false, issues: [{ path: '', rule: 'library', message: 'library must be a non-empty array' }] };
  }
  for (let i = 0; i < library.length; i++) {
    const result = validateArenaModule(library[i]);
    if (!result.ok) {
      for (const item of result.issues) {
        issues.push({ ...item, path: `[${i}].${item.path}` });
      }
    }
  }
  return { ok: issues.length === 0, issues };
}

export function previewArenaModule(arenaId, arenaPhase = 'idle') {
  const mod = ARENA_MODULE_BY_ID[arenaId];
  if (!mod) {
    return { ok: false, issues: [{ path: 'id', rule: 'unknown', message: `unknown arena module ${arenaId}` }] };
  }
  const install = mod.planInstall({
    arenaPhase,
    at: { x: 0, z: 0 },
    lane: { x: 1, z: 0 },
    across: { x: 0, z: 1 },
    lean: { x: 1, z: 0 },
    spin: 0,
  });
  return {
    ok: true,
    id: mod.id,
    law: mod.law,
    phase: install.phase,
    note: install.note,
    fieldCount: Array.isArray(install.fields) ? install.fields.length : 0,
    mineCount: Array.isArray(install.mines) ? install.mines.length : 0,
    cover: !!install.cover,
    install,
  };
}
