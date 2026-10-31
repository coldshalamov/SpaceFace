// Shared deterministic attack readers used by presentation and simulation.
import { compileAttackSpec, attackModifiersFromRun, normalizeModifierStacks } from './attackSpec.js';
import { ATTACK_TRAIT_BY_ID } from '../data/attackTraits.js';
import { MODULES } from '../data/modules.js';
import { WEAPONS } from '../data/weapons.js';

const MODULE_BY_ID = new Map(MODULES.map((def) => [def.id, def]));
const WEAPON_BY_ID = new Map(WEAPONS.map((def) => [def.id, def]));

/** The shared compiler. Tests assert this is the same function combat uses. */
export const SHARED_ATTACK_COMPILER = compileAttackSpec;

export function isSurvivalRunLive(run) {
  return !!(run && typeof run === 'object' && run.kind === 'survival' && run.phase && run.phase !== 'inactive');
}

function pushTrait(bag, id, rank) {
  if (typeof id !== 'string' || !id.startsWith('mod_')) return;
  if (!ATTACK_TRAIT_BY_ID[id]) return;
  const n = Number.isInteger(rank) && rank > 0 ? rank : 1;
  bag.push([id, n]);
}

function traitsFromDef(def, bag) {
  if (!def || !Array.isArray(def.attackTraits)) return;
  for (const entry of def.attackTraits) {
    if (typeof entry === 'string') pushTrait(bag, entry, 1);
    else if (Array.isArray(entry)) pushTrait(bag, entry[0], entry[1]);
    else if (entry && typeof entry === 'object') {
      pushTrait(bag, entry.id || entry.traitId, entry.rank);
    }
  }
}

function defById(id) {
  return MODULE_BY_ID.get(id) || WEAPON_BY_ID.get(id) || null;
}

/**
 * Trait stacks from a long-lived fit. Never reads state.run.
 */
export function attackModifiersFromFit(entity, weapon) {
  const bag = [];
  const fittings = entity && entity.data && Array.isArray(entity.data.fittings)
    ? entity.data.fittings
    : (Array.isArray(entity && entity.fittings) ? entity.fittings : []);
  const seen = new Set();
  for (let i = 0; i < fittings.length; i++) {
    const id = fittings[i];
    if (typeof id !== 'string' || !id) continue;
    seen.add(id);
    const def = defById(id);
    if (ATTACK_TRAIT_BY_ID[id]) {
      const rank = def && Number.isInteger(def.attackTraitRank) ? def.attackTraitRank : 1;
      pushTrait(bag, id, rank);
      continue;
    }
    traitsFromDef(def, bag);
  }
  const weaponId = weapon && (weapon.id || weapon.defId);
  if (typeof weaponId === 'string' && !seen.has(weaponId)) {
    traitsFromDef(WEAPON_BY_ID.get(weaponId) || (weapon && weapon.attackTraits ? weapon : null), bag);
  } else if (!weaponId && weapon && Array.isArray(weapon.attackTraits) && !seen.size) {
    traitsFromDef(weapon, bag);
  }
  return normalizeModifierStacks(bag).stacks;
}

/**
 * Adventure: fitted equipment only.
 * Survival: fitted equipment plus the run draft note, so a ship you brought keeps its identity.
 */
export function collectAttackModifiers(state, entity, weapon) {
  const fitted = attackModifiersFromFit(entity, weapon);
  if (!isSurvivalRunLive(state && state.run)) return fitted;
  const fromRun = attackModifiersFromRun(state.run);
  const merged = [];
  for (let i = 0; i < fitted.length; i++) merged.push(fitted[i]);
  for (let i = 0; i < fromRun.length; i++) merged.push(fromRun[i]);
  return normalizeModifierStacks(merged).stacks;
}

export function compileFittedAttackSpec(state, entity, weaponId) {
  const weapon = typeof weaponId === 'string' ? WEAPON_BY_ID.get(weaponId) : weaponId;
  const modifiers = collectAttackModifiers(state, entity, weapon);
  return SHARED_ATTACK_COMPILER({ weapon: weapon || weaponId, modifiers });
}

export function causalKindsFromSpec(spec) {
  const kinds = [];
  if (!spec || typeof spec !== 'object') return kinds;
  const root = spec.emitter && spec.emitter.rootCount > 1;
  const bank = spec.trajectory && spec.trajectory.bounces > 0;
  const chain = spec.propagation && spec.propagation.chain && spec.propagation.chain.count > 0;
  const split = spec.propagation && spec.propagation.split && spec.propagation.split.count > 0;
  const pierce = spec.propagation && spec.propagation.pierce > 0;
  const orbit = spec.propagation && spec.propagation.orbit && spec.propagation.orbit.count > 0;
  const payload = Array.isArray(spec.payload) ? spec.payload : [];
  let status = false;
  for (let i = 0; i < payload.length; i++) {
    if (payload[i] && payload[i].kind === 'status') status = true;
  }
  if (root) kinds.push('VOLLEY');
  if (bank) kinds.push('BANK');
  if (chain) kinds.push('CHAIN');
  if (split) kinds.push('SPLIT');
  if (pierce) kinds.push('PIERCE');
  if (orbit) kinds.push('ORBIT');
  if (status) kinds.push('STATUS');
  if (kinds.length === 0) kinds.push('DIRECT');
  return kinds;
}

