// AttackSpec compiler (PQ-133 / CRU-020). Appendix A.4 is the compiled shape.
// Pure: same weapon + modifiers → same immutable spec + digest. No bus, DOM, or physics.

import { WEAPONS } from '../data/weapons.js';
import {
  ATTACK_TRAIT_BY_ID,
  ATTACK_TRAIT_SCHEMA_VERSION,
  ATTACK_TRAITS,
} from '../data/attackTraits.js';
import { canonicalize, stableStringify } from './trace.js';
import { DEFAULT_CONSTRAINTS } from './attackLineage.js';
import { describeVolley } from './attackPropagation.js';

export const ATTACK_SPEC_SCHEMA_VERSION = 1;

const WEAPON_BY_ID = new Map(WEAPONS.map((def) => [def.id, def]));
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

const DAMAGE_CHANNEL = Object.freeze({
  energy: 'thermal',
  kinetic: 'kinetic',
  thermal: 'thermal',
  explosive: 'plasma',
  emp: 'ion',
  plasma: 'plasma',
});

function freezeDeep(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    for (const item of value) freezeDeep(item);
  } else {
    for (const key of Object.keys(value)) freezeDeep(value[key]);
  }
  return Object.freeze(value);
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function issue(path, message) {
  return { path, message };
}

function fnv1aHex(text) {
  let hash = FNV_OFFSET;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function digestAttackSpec(spec) {
  const payload = {};
  for (const key of Object.keys(spec || {})) {
    if (key === 'digest') continue;
    payload[key] = spec[key];
  }
  return `atk_${fnv1aHex(stableStringify(canonicalize(payload)))}`;
}

function getPath(obj, path) {
  const keys = String(path).split('.');
  let cur = obj;
  for (const key of keys) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[key];
  }
  return cur;
}

function setPath(obj, path, value) {
  const keys = String(path).split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!isPlainObject(cur[key]) && !Array.isArray(cur[key])) cur[key] = {};
    cur = cur[key];
  }
  cur[keys[keys.length - 1]] = value;
}

function applyStackEntry(draft, entry, rank) {
  const current = getPath(draft, entry.target);
  const base = current == null ? 0 : current;
  const perRank = entry.perRank;
  let next = base;
  if (entry.mode === 'add') next = base + perRank * rank;
  else if (entry.mode === 'mul') next = base * (perRank ** rank);
  else if (entry.mode === 'set') next = perRank;
  setPath(draft, entry.target, next);
}

function emitterKindOf(weapon) {
  if (!weapon) return 'bolt';
  if (weapon.continuous || weapon.tracking === 'hitscan') return 'beam';
  if (weapon.tracking === 'homing') return 'missile';
  return 'bolt';
}

function trajectoryKindOf(weapon) {
  if (emitterKindOf(weapon) === 'beam') return 'straight';
  return 'straight';
}

function forbidTagsOf(weapon) {
  const tags = [];
  if (weapon && weapon.continuous) tags.push('continuous');
  if (weapon && weapon.tracking === 'hitscan') tags.push('hitscan');
  return tags;
}

function channelOf(damageType) {
  return DAMAGE_CHANNEL[damageType] || 'kinetic';
}

function weaponView(input) {
  if (isPlainObject(input) && input.id) return input;
  const id = typeof input === 'string' ? input : (input && input.weaponId);
  return WEAPON_BY_ID.get(id) || null;
}

export function normalizeModifierStacks(modifiers) {
  const issues = [];
  const ranks = new Map();
  const list = Array.isArray(modifiers) ? modifiers : [];
  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    let id = null;
    let rank = 1;
    if (Array.isArray(entry) && typeof entry[0] === 'string') {
      id = entry[0];
      rank = Number.isInteger(entry[1]) ? entry[1] : 1;
    } else if (isPlainObject(entry)) {
      if (entry.kind === 'weapon') continue;
      id = typeof entry.id === 'string' ? entry.id : entry.traitId;
      rank = Number.isInteger(entry.rank) ? entry.rank : 1;
    } else if (typeof entry === 'string') {
      id = entry;
    }
    if (typeof id !== 'string' || !id.startsWith('mod_')) continue;
    const trait = ATTACK_TRAIT_BY_ID[id];
    if (!trait) {
      issues.push(issue(`modifiers[${i}]`, `unknown trait ${id}`));
      continue;
    }
    if (!Number.isInteger(rank) || rank < 1) {
      issues.push(issue(`modifiers[${i}].rank`, 'rank must be an integer >= 1'));
      continue;
    }
    const next = Math.min(trait.maxRank, (ranks.get(id) || 0) + rank);
    ranks.set(id, next);
  }
  const stacks = [...ranks.entries()]
    .map(([id, rank]) => [id, rank])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return { stacks, issues };
}

export function attackModifiersFromRun(run) {
  if (!run || !Array.isArray(run.modifiers)) return [];
  return normalizeModifierStacks(run.modifiers).stacks;
}

function traitCompatible(trait, weapon) {
  const kind = emitterKindOf(weapon);
  const trajectory = trajectoryKindOf(weapon);
  const tags = forbidTagsOf(weapon);
  const compat = trait.compatibility || {};
  if (Array.isArray(compat.emitters) && !compat.emitters.includes(kind)) {
    return issue('compatibility.emitters', `${trait.id} does not accept emitter ${kind}`);
  }
  if (Array.isArray(compat.trajectories) && !compat.trajectories.includes(trajectory)) {
    return issue('compatibility.trajectories', `${trait.id} does not accept trajectory ${trajectory}`);
  }
  if (Array.isArray(compat.forbids)) {
    for (const tag of tags) {
      if (compat.forbids.includes(tag)) {
        return issue('compatibility.forbids', `${trait.id} forbids ${tag}`);
      }
    }
  }
  return null;
}

function mergeTrigger(triggers, trigger, inheritFallback) {
  const event = trigger.event;
  const action = trigger.action;
  const inherit = trigger.inherit || inheritFallback;
  const existing = triggers.find((row) => row.event === event && row.action === action);
  if (existing) {
    existing.inherit = {
      rootSiblings: !!(existing.inherit.rootSiblings || inherit.rootSiblings),
      splitChildren: !!(existing.inherit.splitChildren || inherit.splitChildren),
      chainChildren: !!(existing.inherit.chainChildren || inherit.chainChildren),
    };
    return;
  }
  triggers.push({
    event,
    action,
    inherit: {
      rootSiblings: !!inherit.rootSiblings,
      splitChildren: !!inherit.splitChildren,
      chainChildren: !!inherit.chainChildren,
    },
  });
}

function presentationFamily(weaponId, traits) {
  const stem = String(weaponId || 'attack').replace(/^wpn_/, '').replace(/_s$|_m$|_l$/, '');
  const families = [];
  const seen = new Set();
  for (const trait of traits) {
    if (!seen.has(trait.family)) {
      seen.add(trait.family);
      families.push(trait.family);
    }
  }
  return families.length ? `${stem}_${families.join('_')}` : stem;
}

function scalePayload(payload, scale) {
  if (!(scale >= 0) || scale === 1) return payload;
  const out = [];
  for (const entry of payload) {
    if (entry.kind === 'damage' && entry.channels) {
      const channels = {};
      for (const key of Object.keys(entry.channels)) {
        channels[key] = entry.channels[key] * scale;
      }
      out.push({ kind: 'damage', channels });
    } else {
      out.push(entry);
    }
  }
  return out;
}

function baseDraft(weapon) {
  const kind = emitterKindOf(weapon);
  const damage = Number.isFinite(weapon.dmg) ? weapon.dmg : 0;
  const channel = channelOf(weapon.damageType || 'kinetic');
  const speed = Number.isFinite(weapon.projSpeed) && weapon.projSpeed !== Infinity
    ? weapon.projSpeed
    : 0;
  const spreadDeg = Number.isFinite(weapon.spreadDeg) ? weapon.spreadDeg : 0;
  return {
    schemaVersion: ATTACK_SPEC_SCHEMA_VERSION,
    sourceWeaponId: weapon.id,
    emitter: {
      kind,
      rootCount: 1,
      intervalTicks: 0,
      spreadDeg,
    },
    trajectory: {
      kind: trajectoryKindOf(weapon),
      speed,
      inheritedVelocity: 0,
      bounces: 0,
      afterBounceSteer: null,
    },
    propagation: {
      pierce: 0,
      split: null,
      chain: null,
    },
    payload: [
      { kind: 'damage', channels: { [channel]: damage } },
    ],
    triggers: [
      {
        event: 'entity_contact',
        action: 'apply_payload',
        inherit: { rootSiblings: true, splitChildren: true, chainChildren: true },
      },
    ],
    constraints: {
      lineageProcBudget: DEFAULT_CONSTRAINTS.lineageProcBudget,
      generationMax: DEFAULT_CONSTRAINTS.generationMax,
      childMax: DEFAULT_CONSTRAINTS.childMax,
      sameTargetCooldownTicks: DEFAULT_CONSTRAINTS.sameTargetCooldownTicks,
      activeFamilyCap: DEFAULT_CONSTRAINTS.activeFamilyCap,
      descendantsPerTickMax: DEFAULT_CONSTRAINTS.descendantsPerTickMax,
    },
    costs: {
      payloadScale: 1,
      heatScale: 1,
      heatPerShot: Number.isFinite(weapon.heatPerShot) ? weapon.heatPerShot : 0,
    },
    presentation: {
      family: presentationFamily(weapon.id, []),
      rootPriority: 1,
      descendantPriorityFalloff: 0.25,
    },
  };
}

function finalizeSplit(draft) {
  const split = draft.propagation.split;
  if (!split || !Number.isInteger(split.count) || split.count <= 0) {
    draft.propagation.split = null;
    return;
  }
  draft.propagation.split = {
    count: split.count,
    payloadScale: Number.isFinite(split.payloadScale) ? split.payloadScale : 0.55,
    on: 'entity_contact',
  };
}

function finalizeChain(draft) {
  const chain = draft.propagation.chain;
  if (!chain || !Number.isInteger(chain.count) || chain.count <= 0) {
    draft.propagation.chain = null;
  }
}

function clampInt(value, min, max) {
  const n = Number.isFinite(value) ? Math.round(value) : min;
  return Math.max(min, Math.min(max, n));
}

/**
 * Compile a base weapon plus run modifiers into an immutable AttackSpec.
 * Returns `{ ok, spec, issues, stacks }`. Same inputs always yield the same digest.
 */
export function compileAttackSpec(input = {}) {
  const issues = [];
  const weapon = weaponView(input.weapon || input.weaponId || input.sourceWeaponId);
  if (!weapon || typeof weapon.id !== 'string') {
    return { ok: false, spec: null, issues: [issue('weapon', 'unknown weapon')], stacks: [] };
  }

  const normalized = normalizeModifierStacks(input.modifiers);
  for (const item of normalized.issues) issues.push(item);

  const applied = [];
  for (const [id, rank] of normalized.stacks) {
    const trait = ATTACK_TRAIT_BY_ID[id];
    if (!trait) continue;
    const compat = traitCompatible(trait, weapon);
    if (compat) {
      issues.push(compat);
      continue;
    }
    applied.push({ trait, rank });
  }

  if (issues.length && input.strict) {
    return { ok: false, spec: null, issues, stacks: applied.map((row) => [row.trait.id, row.rank]) };
  }

  const draft = baseDraft(weapon);
  const triggerInherit = { rootSiblings: true, splitChildren: true, chainChildren: true };

  for (const { trait, rank } of applied) {
    const stacks = Array.isArray(trait.stack) ? trait.stack : [trait.stack];
    for (const entry of stacks) applyStackEntry(draft, entry, rank);
    if (Array.isArray(trait.triggers)) {
      for (const trigger of trait.triggers) {
        mergeTrigger(draft.triggers, trigger, trait.inheritance || triggerInherit);
      }
    }
  }

  draft.emitter.rootCount = clampInt(draft.emitter.rootCount, 1, 12);
  draft.emitter.intervalTicks = clampInt(draft.emitter.intervalTicks, 0, 60);
  draft.propagation.pierce = clampInt(draft.propagation.pierce, 0, 8);
  if (draft.propagation.split && Number.isFinite(draft.propagation.split.count)) {
    draft.propagation.split.count = clampInt(draft.propagation.split.count, 0, 8);
  }
  draft.trajectory.bounces = clampInt(draft.trajectory.bounces, 0, 6);
  draft.constraints.lineageProcBudget = clampInt(draft.constraints.lineageProcBudget, 0, 64);
  draft.constraints.generationMax = clampInt(draft.constraints.generationMax, 0, 4);
  draft.constraints.childMax = clampInt(draft.constraints.childMax, 0, 32);
  draft.costs.payloadScale = Number.isFinite(draft.costs.payloadScale) ? draft.costs.payloadScale : 1;
  draft.costs.heatScale = Number.isFinite(draft.costs.heatScale) ? draft.costs.heatScale : 1;
  draft.payload = scalePayload(draft.payload, draft.costs.payloadScale);
  finalizeSplit(draft);
  finalizeChain(draft);
  draft.presentation.family = presentationFamily(weapon.id, applied.map((row) => row.trait));
  draft.triggers.sort((a, b) => {
    if (a.event !== b.event) return a.event < b.event ? -1 : 1;
    return a.action < b.action ? -1 : a.action > b.action ? 1 : 0;
  });

  draft.digest = digestAttackSpec(draft);
  const spec = freezeDeep(draft);
  const ok = issues.length === 0;
  return {
    ok,
    spec,
    issues,
    stacks: applied.map((row) => [row.trait.id, row.rank]),
  };
}

export function attackSpecNeedsRuntime(spec) {
  if (!spec || typeof spec !== 'object') return false;
  if (spec.emitter && spec.emitter.rootCount > 1) return true;
  if (spec.propagation && spec.propagation.pierce > 0) return true;
  if (spec.propagation && spec.propagation.split && spec.propagation.split.count > 0) return true;
  if (spec.trajectory && spec.trajectory.bounces > 0) return true;
  if (spec.propagation && spec.propagation.chain && spec.propagation.chain.count > 0) return true;
  return false;
}

export function describeAttackMetrics(spec) {
  const volley = describeVolley(spec);
  const payload = spec && Array.isArray(spec.payload) ? spec.payload : [];
  const damage = payload.find((entry) => entry && entry.kind === 'damage');
  const channels = damage && damage.channels ? damage.channels : {};
  let payloadTotal = 0;
  for (const key of Object.keys(channels).sort()) payloadTotal += channels[key];
  return canonicalize({
    digest: spec && spec.digest,
    sourceWeaponId: spec && spec.sourceWeaponId,
    family: spec && spec.presentation && spec.presentation.family,
    rootCount: volley.rootCount,
    spreadDeg: volley.spreadDeg,
    pierce: volley.pierce,
    splitCount: volley.splitCount,
    bounces: spec && spec.trajectory ? spec.trajectory.bounces : 0,
    lineageProcBudget: spec && spec.constraints ? spec.constraints.lineageProcBudget : 0,
    generationMax: spec && spec.constraints ? spec.constraints.generationMax : 0,
    childMax: spec && spec.constraints ? spec.constraints.childMax : 0,
    heatScale: spec && spec.costs ? spec.costs.heatScale : 1,
    payloadScale: spec && spec.costs ? spec.costs.payloadScale : 1,
    payloadTotal,
    triggerCount: spec && Array.isArray(spec.triggers) ? spec.triggers.length : 0,
  });
}

export function mergeWeaponView(instance, def) {
  const base = def || weaponView(instance && instance.defId) || weaponView(instance);
  if (!base) return null;
  if (!instance) return { ...base };
  return {
    ...base,
    dmg: instance.dmg != null ? instance.dmg : base.dmg,
    damageType: instance.damageType || base.damageType,
    projSpeed: instance.projSpeed != null ? instance.projSpeed : base.projSpeed,
    range: instance.range != null ? instance.range : base.range,
    tracking: instance.tracking || base.tracking,
    heatPerShot: instance.heat != null ? instance.heat : base.heatPerShot,
    spreadDeg: def && def.spreadDeg != null ? def.spreadDeg : base.spreadDeg,
  };
}

export {
  ATTACK_TRAITS,
  ATTACK_TRAIT_BY_ID,
  ATTACK_TRAIT_SCHEMA_VERSION,
};
