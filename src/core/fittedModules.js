import { MODULES } from '../data/modules.js';
import { WEAPONS } from '../data/weapons.js';

const MODULE_BY_ID = new Map(
  [...MODULES, ...WEAPONS].map((moduleDef) => [moduleDef.id, moduleDef]),
);

function getLivePlayerFittings(state) {
  const playerEntity = state?.entities?.get?.(state?.playerId);
  const fittings = playerEntity?.data?.fittings;
  return Array.isArray(fittings) ? fittings : [];
}

export function fittedModuleIds(state) {
  return getLivePlayerFittings(state).filter(
    (defId) => typeof defId === 'string' && MODULE_BY_ID.has(defId),
  );
}

export function fittedModuleDefs(state) {
  return fittedModuleIds(state).map((defId) => MODULE_BY_ID.get(defId));
}

export function hasFittedModule(state, defId) {
  if (typeof defId !== 'string' || !MODULE_BY_ID.has(defId)) return false;
  return getLivePlayerFittings(state).includes(defId);
}

export function maxFittedModuleMod(state, key, fallback = 0) {
  let found = false;
  let maximum = -Infinity;
  for (const moduleDef of fittedModuleDefs(state)) {
    const value = moduleDef?.mods?.[key];
    if (!Number.isFinite(value)) continue;
    found = true;
    maximum = Math.max(maximum, value);
  }
  return found ? maximum : fallback;
}

export function sumFittedModuleMod(state, key) {
  let total = 0;
  for (const moduleDef of fittedModuleDefs(state)) {
    const value = moduleDef?.mods?.[key];
    if (Number.isFinite(value)) total += value;
  }
  return total;
}
