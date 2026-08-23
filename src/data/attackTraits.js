// Attack trait catalog (PQ-133 / CRU-019). Appendix A.3 is the schema.
// Pure data + validators. No bus, registry, DOM, or systems imports.
//
// Phase 3 ships the topology families the compiler and lineage kernel need: volley (multishot),
// pierce, split, plus the Bank Shot row that A.3 uses as the schema example. Bounce *physics* is
// Phase 4; this file only declares the trait.

export const ATTACK_TRAIT_SCHEMA_VERSION = 1;

export const ATTACK_TRAIT_TIERS = Object.freeze([
  'foundation', 'deepener', 'bridge', 'keystone', 'evolution', 'curse',
]);

export const ATTACK_TRAIT_FAMILIES = Object.freeze([
  'volley', 'ricochet', 'chain', 'propagation', 'trajectory', 'payload', 'physics', 'resource',
]);

export const ATTACK_STACK_MODES = Object.freeze(['add', 'mul', 'set']);

export const ATTACK_STACK_TARGETS = Object.freeze([
  'emitter.rootCount',
  'emitter.spreadDeg',
  'emitter.intervalTicks',
  'trajectory.bounces',
  'trajectory.speed',
  'trajectory.inheritedVelocity',
  'trajectory.afterBounceSteer.coneDeg',
  'trajectory.afterBounceSteer.maxTurnDeg',
  'propagation.pierce',
  'propagation.split.count',
  'propagation.split.payloadScale',
  'propagation.chain.count',
  'propagation.chain.range',
  'costs.payloadScale',
  'costs.heatScale',
  'constraints.lineageProcBudget',
  'constraints.generationMax',
  'constraints.childMax',
]);

export const ATTACK_EMITTER_KINDS = Object.freeze(['bolt', 'missile', 'debris', 'beam']);
export const ATTACK_TRAJECTORY_KINDS = Object.freeze([
  'straight', 'inherited_velocity', 'gravity_curved',
]);
export const ATTACK_FORBID_TAGS = Object.freeze(['hitscan', 'continuous']);

const TIER_SET = new Set(ATTACK_TRAIT_TIERS);
const FAMILY_SET = new Set(ATTACK_TRAIT_FAMILIES);
const MODE_SET = new Set(ATTACK_STACK_MODES);
const TARGET_SET = new Set(ATTACK_STACK_TARGETS);
const EMITTER_SET = new Set(ATTACK_EMITTER_KINDS);
const TRAJECTORY_SET = new Set(ATTACK_TRAJECTORY_KINDS);
const FORBID_SET = new Set(ATTACK_FORBID_TAGS);

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

function inheritBlock(rootSiblings, splitChildren, chainChildren) {
  return {
    rootSiblings: !!rootSiblings,
    splitChildren: !!splitChildren,
    chainChildren: !!chainChildren,
  };
}

/**
 * Phase 3 topology traits. Ids are stable. Ranks and numbers are tuning; the structural
 * declarations (compatibility, stack target, inheritance, caps) are the contract.
 */
export const ATTACK_TRAITS = freezeDeep([
  {
    id: 'mod_twin_mount',
    schemaVersion: 1,
    name: 'Twin Mount',
    tier: 'foundation',
    family: 'volley',
    maxRank: 1,
    compatibility: {
      emitters: ['bolt', 'missile', 'debris'],
      trajectories: ['straight', 'inherited_velocity', 'gravity_curved'],
      forbids: ['hitscan', 'continuous'],
    },
    stack: [
      { mode: 'add', target: 'emitter.rootCount', perRank: 1 },
      { mode: 'add', target: 'emitter.spreadDeg', perRank: 8 },
      { mode: 'mul', target: 'costs.payloadScale', perRank: 0.85 },
      { mode: 'mul', target: 'costs.heatScale', perRank: 1.35 },
    ],
    inheritance: inheritBlock(true, false, false),
    cost: { procBudgetPerRootSibling: 1 },
    triggers: [],
    text: {
      summary: 'Fire one additional weaker root sibling. Total heat rises.',
      detail: 'The extra bolt is generation 0 and shares the lineage proc budget. Children do not inherit this extra sibling.',
    },
  },
  {
    id: 'mod_triad_mount',
    schemaVersion: 1,
    name: 'Triad Mount',
    tier: 'deepener',
    family: 'volley',
    maxRank: 1,
    compatibility: {
      emitters: ['bolt', 'missile', 'debris'],
      trajectories: ['straight', 'inherited_velocity', 'gravity_curved'],
      forbids: ['hitscan', 'continuous'],
    },
    stack: [
      { mode: 'add', target: 'emitter.rootCount', perRank: 2 },
      { mode: 'add', target: 'emitter.spreadDeg', perRank: 14 },
      { mode: 'mul', target: 'costs.payloadScale', perRank: 0.72 },
      { mode: 'mul', target: 'costs.heatScale', perRank: 1.7 },
    ],
    inheritance: inheritBlock(true, false, false),
    cost: { procBudgetPerRootSibling: 1 },
    triggers: [],
    text: {
      summary: 'Add a third root sibling with wider spread and a stronger heat cost.',
      detail: 'Three generation-0 bolts. Each extra sibling consumes one lineage proc.',
    },
  },
  {
    id: 'mod_piercing_core',
    schemaVersion: 1,
    name: 'Piercing Core',
    tier: 'foundation',
    family: 'propagation',
    maxRank: 3,
    compatibility: {
      emitters: ['bolt', 'missile', 'debris'],
      trajectories: ['straight', 'inherited_velocity', 'gravity_curved'],
      forbids: ['hitscan', 'continuous'],
    },
    stack: [
      { mode: 'add', target: 'propagation.pierce', perRank: 1 },
    ],
    inheritance: inheritBlock(true, false, false),
    cost: {},
    triggers: [],
    text: {
      summary: 'Pass through {rank} additional body(ies). Same target cannot be re-hit until the lineage cooldown expires.',
      detail: 'Pierce continues the same projectile. It is not a descendant and does not consume proc budget. Split children do not inherit pierce.',
    },
  },
  {
    id: 'mod_forked_core',
    schemaVersion: 1,
    name: 'Forked Core',
    tier: 'foundation',
    family: 'propagation',
    maxRank: 1,
    compatibility: {
      emitters: ['bolt', 'missile', 'debris'],
      trajectories: ['straight', 'inherited_velocity', 'gravity_curved'],
      forbids: ['hitscan', 'continuous'],
    },
    stack: [
      { mode: 'add', target: 'propagation.split.count', perRank: 2 },
      { mode: 'set', target: 'propagation.split.payloadScale', perRank: 0.55 },
    ],
    inheritance: inheritBlock(true, false, false),
    cost: { procBudgetPerSplitChild: 2 },
    triggers: [
      {
        event: 'entity_contact',
        action: 'split',
        inherit: inheritBlock(true, false, false),
      },
    ],
    text: {
      summary: 'On the first valid hit, split into two weaker children. Children inherit payload, not split.',
      detail: 'Each child consumes two lineage procs, is generation 1, and cannot split again.',
    },
  },
  {
    // A.3 schema example. Compiler writes trajectory.bounces; physics bounce is Phase 4.
    id: 'mod_bank_shot',
    schemaVersion: 1,
    name: 'Bank Shot',
    tier: 'foundation',
    family: 'ricochet',
    maxRank: 3,
    compatibility: {
      emitters: ['bolt', 'missile', 'debris'],
      trajectories: ['straight', 'inherited_velocity', 'gravity_curved'],
      forbids: ['hitscan', 'continuous'],
    },
    stack: [
      { mode: 'add', target: 'trajectory.bounces', perRank: 1 },
    ],
    inheritance: inheritBlock(true, true, false),
    cost: { procBudgetPerBounce: 1 },
    triggers: [
      {
        event: 'surface_contact',
        action: 'ricochet',
        inherit: inheritBlock(true, true, false),
      },
    ],
    text: {
      summary: 'Eligible projectiles bounce {rank} time(s) from reflective surfaces.',
      detail: 'Each bounce consumes one lineage proc. Ordinary enemy shots are unchanged.',
    },
  },
]);

export const ATTACK_TRAIT_BY_ID = freezeDeep(
  Object.fromEntries(ATTACK_TRAITS.map((trait) => [trait.id, trait])),
);

function validateStackEntry(entry, path, issues) {
  if (!isPlainObject(entry)) {
    issues.push(issue(path, 'stack entry must be an object'));
    return;
  }
  if (!MODE_SET.has(entry.mode)) {
    issues.push(issue(`${path}.mode`, 'unknown stack mode'));
  }
  if (typeof entry.target !== 'string' || !TARGET_SET.has(entry.target)) {
    issues.push(issue(`${path}.target`, 'unknown stack target'));
  }
  if (!Number.isFinite(entry.perRank)) {
    issues.push(issue(`${path}.perRank`, 'perRank must be finite'));
  }
}

function validateCompatibility(compat, path, issues) {
  if (!isPlainObject(compat)) {
    issues.push(issue(path, 'compatibility must be an object'));
    return;
  }
  if (!Array.isArray(compat.emitters) || compat.emitters.length === 0) {
    issues.push(issue(`${path}.emitters`, 'emitters must be a non-empty array'));
  } else {
    for (let i = 0; i < compat.emitters.length; i++) {
      if (!EMITTER_SET.has(compat.emitters[i])) {
        issues.push(issue(`${path}.emitters[${i}]`, 'unknown emitter kind'));
      }
    }
  }
  if (!Array.isArray(compat.trajectories) || compat.trajectories.length === 0) {
    issues.push(issue(`${path}.trajectories`, 'trajectories must be a non-empty array'));
  } else {
    for (let i = 0; i < compat.trajectories.length; i++) {
      if (!TRAJECTORY_SET.has(compat.trajectories[i])) {
        issues.push(issue(`${path}.trajectories[${i}]`, 'unknown trajectory kind'));
      }
    }
  }
  if (compat.forbids != null) {
    if (!Array.isArray(compat.forbids)) {
      issues.push(issue(`${path}.forbids`, 'forbids must be an array'));
    } else {
      for (let i = 0; i < compat.forbids.length; i++) {
        if (!FORBID_SET.has(compat.forbids[i])) {
          issues.push(issue(`${path}.forbids[${i}]`, 'unknown forbid tag'));
        }
      }
    }
  }
}

function validateInheritance(value, path, issues) {
  if (!isPlainObject(value)) {
    issues.push(issue(path, 'inheritance must be an object'));
    return;
  }
  for (const key of ['rootSiblings', 'splitChildren', 'chainChildren']) {
    if (typeof value[key] !== 'boolean') {
      issues.push(issue(`${path}.${key}`, `${key} must be a boolean`));
    }
  }
}

export function validateAttackTrait(trait) {
  try {
    return validateAttackTraitInner(trait);
  } catch {
    return { ok: false, issues: [issue('', 'invalid trait')] };
  }
}

function validateAttackTraitInner(trait) {
  const issues = [];
  if (!isPlainObject(trait)) {
    return { ok: false, issues: [issue('', 'trait must be an object')] };
  }
  if (typeof trait.id !== 'string' || !trait.id.startsWith('mod_')) {
    issues.push(issue('id', 'id must be a non-empty string starting with mod_'));
  }
  if (trait.schemaVersion !== ATTACK_TRAIT_SCHEMA_VERSION) {
    issues.push(issue('schemaVersion', `schemaVersion must be ${ATTACK_TRAIT_SCHEMA_VERSION}`));
  }
  if (typeof trait.name !== 'string' || trait.name.length === 0) {
    issues.push(issue('name', 'name must be a non-empty string'));
  }
  if (!TIER_SET.has(trait.tier)) {
    issues.push(issue('tier', 'unknown tier'));
  }
  if (!FAMILY_SET.has(trait.family)) {
    issues.push(issue('family', 'unknown family'));
  }
  if (!Number.isInteger(trait.maxRank) || trait.maxRank < 1) {
    issues.push(issue('maxRank', 'maxRank must be an integer >= 1'));
  }
  validateCompatibility(trait.compatibility, 'compatibility', issues);
  const stacks = Array.isArray(trait.stack) ? trait.stack : (trait.stack ? [trait.stack] : []);
  if (stacks.length === 0) {
    issues.push(issue('stack', 'stack must be a non-empty array or object'));
  } else {
    for (let i = 0; i < stacks.length; i++) validateStackEntry(stacks[i], `stack[${i}]`, issues);
  }
  validateInheritance(trait.inheritance, 'inheritance', issues);
  if (trait.cost != null && !isPlainObject(trait.cost)) {
    issues.push(issue('cost', 'cost must be an object'));
  }
  if (trait.triggers != null) {
    if (!Array.isArray(trait.triggers)) {
      issues.push(issue('triggers', 'triggers must be an array'));
    } else {
      for (let i = 0; i < trait.triggers.length; i++) {
        const trigger = trait.triggers[i];
        const path = `triggers[${i}]`;
        if (!isPlainObject(trigger)) {
          issues.push(issue(path, 'trigger must be an object'));
          continue;
        }
        if (typeof trigger.event !== 'string' || trigger.event.length === 0) {
          issues.push(issue(`${path}.event`, 'event must be a non-empty string'));
        }
        if (typeof trigger.action !== 'string' || trigger.action.length === 0) {
          issues.push(issue(`${path}.action`, 'action must be a non-empty string'));
        }
        if (trigger.inherit != null) validateInheritance(trigger.inherit, `${path}.inherit`, issues);
      }
    }
  }
  if (!isPlainObject(trait.text) || typeof trait.text.summary !== 'string' || trait.text.summary.length === 0) {
    issues.push(issue('text.summary', 'text.summary must be a non-empty string'));
  }
  return { ok: issues.length === 0, issues };
}

export function validateAttackTraitCatalog(traits = ATTACK_TRAITS) {
  const issues = [];
  if (!Array.isArray(traits)) {
    return { ok: false, issues: [issue('', 'catalog must be an array')] };
  }
  const seen = new Set();
  for (let i = 0; i < traits.length; i++) {
    const trait = traits[i];
    const result = validateAttackTrait(trait);
    if (!result.ok) {
      for (const item of result.issues) {
        issues.push(issue(`[${i}].${item.path}`, item.message));
      }
    }
    if (trait && typeof trait.id === 'string') {
      if (seen.has(trait.id)) issues.push(issue(`[${i}].id`, `duplicate id ${trait.id}`));
      seen.add(trait.id);
    }
  }
  return { ok: issues.length === 0, issues };
}

export function formatTraitText(trait, rank = 1) {
  if (!trait || !trait.text) return '';
  const n = Number.isInteger(rank) && rank > 0 ? rank : 1;
  return String(trait.text.summary || '').replaceAll('{rank}', String(n));
}
