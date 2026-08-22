// spaceface.combatLabSetup.v1 — Combat Lab launch contract.
// Pure module: validation, normalization, and stable digest INPUT. No bus, registry, DOM, or I/O.

import { SHIPS } from '../data/ships.js';
import { WEAPONS } from '../data/weapons.js';
import { MODULES } from '../data/modules.js';
import { ENEMY_TYPES } from '../data/enemies.js';
import {
  COMBAT_LAB_STARTER_PACKAGES,
  COMBAT_LAB_ENEMY_PACKAGES,
  COMBAT_LAB_ARENAS,
} from '../data/combatLabSetups.js';
import { buildSlotList, fits } from '../systems/ships.js';

export const COMBAT_LAB_SETUP_SCHEMA = 'spaceface.combatLabSetup.v1';

const SHIP_BY_ID = new Map(SHIPS.map((ship) => [ship.id, ship]));
const DEF_BY_ID = new Map([...WEAPONS, ...MODULES].map((def) => [def.id, def]));
const ENEMY_IDS = new Set(ENEMY_TYPES.map((enemy) => enemy.id));
const ENEMY_PACKAGE_BY_ID = new Map(COMBAT_LAB_ENEMY_PACKAGES.map((pkg) => [pkg.id, pkg]));
const ARENA_BY_ID = new Map(COMBAT_LAB_ARENAS.map((arena) => [arena.id, arena]));
const FALLBACK_STARTER = COMBAT_LAB_STARTER_PACKAGES[0];
const FALLBACK_ENEMY = COMBAT_LAB_ENEMY_PACKAGES[0];
const FALLBACK_ARENA = COMBAT_LAB_ARENAS[0];
const FALLBACK_SEED = 1;
const FALLBACK_WAVE = 1;

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

// Seed 0 is invalid. gameNewOptionsForSandboxConfig (sandboxSetup.js:292) forwards a
// seed only when Number.isSafeInteger(seed) && seed >= 1 && seed <= 0xffffffff. A
// schema-valid 0 would be dropped from game:new and resetRunState would fall through
// to Date.now() ^ Math.random(). Do not widen this back to 0, and do not coerce 0 to 1.
function isCombatLabSeed(value) {
  return Number.isInteger(value) && value >= 1 && value <= 0xffffffff;
}

function issue(path, message) {
  return { path, message };
}

function canonicalLoadout(entries) {
  const out = [];
  if (!Array.isArray(entries)) return out;
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    out.push({ slotIndex: entry.slotIndex, defId: entry.defId });
  }
  out.sort((a, b) => a.slotIndex - b.slotIndex);
  return out;
}

function makeValue({ hullId, loadout, enemyPackageId, arenaId, seed, wave }) {
  return {
    schema: COMBAT_LAB_SETUP_SCHEMA,
    hullId,
    loadout,
    enemyPackageId,
    arenaId,
    seed,
    wave,
  };
}

function salvageLoadout(rawLoadout, shipDef) {
  const slots = shipDef ? buildSlotList(shipDef) : [];
  if (!Array.isArray(rawLoadout)) return [];
  const candidates = [];
  for (const entry of rawLoadout) {
    if (!entry || typeof entry !== 'object') continue;
    const slotIndex = entry.slotIndex;
    const defId = entry.defId;
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= slots.length) continue;
    if (typeof defId !== 'string') continue;
    const def = DEF_BY_ID.get(defId);
    if (!def) continue;
    if (!fits(slots[slotIndex], def)) continue;
    candidates.push({ slotIndex, defId });
  }
  // Duplicate slots: sort by (slotIndex, defId) then keep the first. The survivor is a
  // function of the entry SET, not input order. Equal slotIndex ties break on defId
  // (lexicographic UTF-16 code-unit order).
  candidates.sort((a, b) => {
    if (a.slotIndex !== b.slotIndex) return a.slotIndex - b.slotIndex;
    if (a.defId < b.defId) return -1;
    if (a.defId > b.defId) return 1;
    return 0;
  });
  const seen = new Set();
  const out = [];
  for (const entry of candidates) {
    if (seen.has(entry.slotIndex)) continue;
    seen.add(entry.slotIndex);
    out.push({ slotIndex: entry.slotIndex, defId: entry.defId });
  }
  return out;
}

function salvageSetup(input) {
  const src = isPlainObject(input) ? input : {};
  const hullId = typeof src.hullId === 'string' && SHIP_BY_ID.has(src.hullId)
    ? src.hullId
    : (FALLBACK_STARTER && FALLBACK_STARTER.hullId) || 'ship_kestrel';
  const shipDef = SHIP_BY_ID.get(hullId);
  let loadout = salvageLoadout(src.loadout, shipDef);
  if (loadout.length === 0 && FALLBACK_STARTER && hullId === FALLBACK_STARTER.hullId
      && Array.isArray(FALLBACK_STARTER.loadout)) {
    loadout = salvageLoadout(FALLBACK_STARTER.loadout, shipDef);
  }
  const enemyPackageId = typeof src.enemyPackageId === 'string' && ENEMY_PACKAGE_BY_ID.has(src.enemyPackageId)
    ? src.enemyPackageId
    : (FALLBACK_ENEMY && FALLBACK_ENEMY.id) || 'physics_swarm';
  const arenaId = typeof src.arenaId === 'string' && ARENA_BY_ID.has(src.arenaId)
    ? src.arenaId
    : (FALLBACK_ARENA && FALLBACK_ARENA.id) || 'helios_core';
  const seed = isCombatLabSeed(src.seed) ? src.seed : FALLBACK_SEED;
  const wave = Number.isInteger(src.wave) && src.wave >= 1 ? src.wave : FALLBACK_WAVE;
  return makeValue({ hullId, loadout, enemyPackageId, arenaId, seed, wave });
}

function validateInner(input) {
  const issues = [];
  if (!isPlainObject(input)) {
    return { ok: false, value: null, issues: [issue('', 'setup must be an object')] };
  }

  if (input.schema !== COMBAT_LAB_SETUP_SCHEMA) {
    issues.push(issue('schema', 'unknown schema'));
  }

  const hullId = input.hullId;
  const shipDef = typeof hullId === 'string' ? SHIP_BY_ID.get(hullId) : null;
  if (typeof hullId !== 'string' || !shipDef) {
    issues.push(issue('hullId', 'unknown hullId'));
  }

  if (typeof input.enemyPackageId !== 'string' || !ENEMY_PACKAGE_BY_ID.has(input.enemyPackageId)) {
    issues.push(issue('enemyPackageId', 'unknown enemyPackageId'));
  } else {
    const pkg = ENEMY_PACKAGE_BY_ID.get(input.enemyPackageId);
    for (let i = 0; i < (pkg.entries || []).length; i++) {
      const enemyId = pkg.entries[i] && pkg.entries[i].enemyId;
      if (typeof enemyId !== 'string' || !ENEMY_IDS.has(enemyId)) {
        issues.push(issue('enemyPackageId', `unknown enemyId ${enemyId}`));
      }
    }
  }

  if (typeof input.arenaId !== 'string' || !ARENA_BY_ID.has(input.arenaId)) {
    issues.push(issue('arenaId', 'unknown arenaId'));
  }

  if (!isCombatLabSeed(input.seed)) {
    issues.push(issue('seed', 'seed must be an integer in 1..0xffffffff'));
  }

  if (!Number.isInteger(input.wave) || input.wave < 1) {
    issues.push(issue('wave', 'wave must be an integer >= 1'));
  }

  if (!Array.isArray(input.loadout)) {
    issues.push(issue('loadout', 'loadout must be an array'));
  } else {
    const slots = shipDef ? buildSlotList(shipDef) : null;
    if (slots && input.loadout.length > slots.length) {
      issues.push(issue('loadout', 'loadout has more entries than the hull has slots'));
    }
    const seen = new Set();
    for (let i = 0; i < input.loadout.length; i++) {
      const entry = input.loadout[i];
      const path = `loadout[${i}]`;
      if (!entry || typeof entry !== 'object') {
        issues.push(issue(path, 'loadout entry must be an object'));
        continue;
      }
      if (!Number.isInteger(entry.slotIndex) || entry.slotIndex < 0) {
        issues.push(issue(`${path}.slotIndex`, 'slotIndex must be a non-negative integer'));
      } else if (seen.has(entry.slotIndex)) {
        issues.push(issue(`${path}.slotIndex`, 'duplicate slotIndex'));
      } else {
        seen.add(entry.slotIndex);
      }
      if (typeof entry.defId !== 'string' || !DEF_BY_ID.has(entry.defId)) {
        issues.push(issue(`${path}.defId`, 'unknown defId'));
      } else if (slots) {
        const slot = slots[entry.slotIndex];
        const def = DEF_BY_ID.get(entry.defId);
        if (!slot || !fits(slot, def)) {
          issues.push(issue(`${path}.defId`, 'defId cannot legally occupy this slot on this hull'));
        }
      }
    }
  }

  if (issues.length) return { ok: false, value: null, issues };
  const value = makeValue({
    hullId,
    loadout: canonicalLoadout(input.loadout),
    enemyPackageId: input.enemyPackageId,
    arenaId: input.arenaId,
    seed: input.seed,
    wave: input.wave,
  });
  return { ok: true, value, issues: [] };
}

export function validateCombatLabSetup(input) {
  try {
    return validateInner(input);
  } catch (err) {
    return {
      ok: false,
      value: null,
      issues: [issue('', String(err && err.message ? err.message : err))],
    };
  }
}

export function normalizeCombatLabSetup(input) {
  try {
    const result = validateInner(input);
    if (result.ok) return result.value;
    return salvageSetup(input);
  } catch {
    return salvageSetup(input);
  }
}

export function combatLabSetupDigestInput(setup) {
  const value = normalizeCombatLabSetup(setup);
  const parts = [
    value.schema,
    value.hullId,
  ];
  for (const entry of value.loadout) {
    parts.push(String(entry.slotIndex), entry.defId);
  }
  parts.push(
    value.enemyPackageId,
    value.arenaId,
    String(value.seed),
    String(value.wave),
  );
  return parts;
}
