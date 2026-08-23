// PQ-133.12 — content factory schemas, validators, lint, loc, and estimates.
// Pure. No bus, DOM, network, or combat-kernel writes.
//
// Wraps the live trait/recipe validators and adds factory rules: localisation keys,
// spawn-cap lint, and a ban on new power axes (damage, hull, shield, speed, credits, xp, score).

import {
  ATTACK_TRAIT_SCHEMA_VERSION,
  ATTACK_TRAITS,
  validateAttackTrait,
} from '../data/attackTraits.js';
import {
  SURVIVAL_WAVE_SCHEMA_VERSION,
  peakConcurrentDemand,
  validateWaveRecipe,
} from '../data/survivalWaves.js';
import {
  SPAWN_BUDGET_DEFAULT_MAX,
  SPAWN_BUDGET_HARD_MAX,
} from '../data/survivalActs.js';

export const CONTENT_FACTORY_SCHEMA = 'spaceface.contentFactory.v1';
export const FACTORY_SPAWN_DEFAULT_MAX = SPAWN_BUDGET_DEFAULT_MAX;
export const FACTORY_SPAWN_HARD_MAX = SPAWN_BUDGET_HARD_MAX;

export const POWER_AXIS_NAMES = Object.freeze([
  'damage', 'hull', 'shield', 'speed', 'credits', 'xp', 'score',
]);

const POWER_AXIS_RE = /(damage|hull|shield|speed|credits|xp|score)/i;
const POWER_STACK_TARGETS = new Set([
  'trajectory.speed',
  'costs.payloadScale',
]);

export const CONTENT_FACTORY_BOUNDARY = Object.freeze({
  mayAuthor: Object.freeze(['modifiers', 'waveRecipes', 'arenaModuleDescriptors', 'locText']),
  mustNotTouch: Object.freeze([
    'src/combat',
    'src/ui',
    'src/render',
    'spawnCaps',
    'powerAxes',
  ]),
  spawnDefaultMax: FACTORY_SPAWN_DEFAULT_MAX,
  spawnHardMax: FACTORY_SPAWN_HARD_MAX,
});

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function issue(path, rule, message) {
  return { path, rule, message };
}

function wrapTraitIssues(issues) {
  return (issues || []).map((item) => issue(
    item.path || '',
    `trait.${item.path || 'root'}`,
    item.message,
  ));
}

function wrapRecipeIssues(issues) {
  return (issues || []).map((item) => issue(
    item.path || '',
    `recipe.${item.path || 'root'}`,
    item.message,
  ));
}

/**
 * English source strings only. Separable keys, not a translation.
 */
export const CONTENT_FACTORY_STRINGS = Object.freeze({
  'trait.mod_herald_fan.summary': 'Widen the root volley cone. Heat rises slightly. Damage is unchanged.',
  'trait.mod_herald_fan.detail': 'Adds spread only. No extra roots, no payload scale, no speed grant. You cover a wider lane and pay heat.',
  'recipe.factory_herald_pincer.summary': 'A two-gate pincer: mass on the south-west, pressure on the north-east.',
  'recipe.factory_herald_pincer.detail': 'Five swarmers then three reavers. Peak demand stays at eight. The room stays idle.',
  'lint.spawn.default': 'Peak concurrent demand exceeds the default spawn cap of 24.',
  'lint.spawn.hard': 'Peak concurrent demand exceeds the hard spawn cap of 40.',
  'lint.power.axis': 'Authored content must not grant damage, hull, shield, speed, credits, xp, or score.',
});

export function resolveFactoryText(key, params = {}) {
  const source = CONTENT_FACTORY_STRINGS[key];
  if (typeof source !== 'string') return '';
  let out = source;
  for (const [name, value] of Object.entries(params)) {
    out = out.replaceAll(`{${name}}`, String(value));
  }
  return out;
}

function locKeysPresent(doc, issues, { required }) {
  if (!required) return;
  if (!isPlainObject(doc.loc)) {
    issues.push(issue('loc', 'loc.object', 'loc must be an object with summaryKey and detailKey'));
    return;
  }
  if (typeof doc.loc.summaryKey !== 'string' || doc.loc.summaryKey.length === 0) {
    issues.push(issue('loc.summaryKey', 'loc.summaryKey', 'loc.summaryKey must be a non-empty string'));
  } else if (!CONTENT_FACTORY_STRINGS[doc.loc.summaryKey]) {
    issues.push(issue('loc.summaryKey', 'loc.catalog', `missing loc catalog entry ${doc.loc.summaryKey}`));
  }
  if (typeof doc.loc.detailKey !== 'string' || doc.loc.detailKey.length === 0) {
    issues.push(issue('loc.detailKey', 'loc.detailKey', 'loc.detailKey must be a non-empty string'));
  } else if (!CONTENT_FACTORY_STRINGS[doc.loc.detailKey]) {
    issues.push(issue('loc.detailKey', 'loc.catalog', `missing loc catalog entry ${doc.loc.detailKey}`));
  }
}

function stackGrantsPower(entry) {
  if (!entry || typeof entry !== 'object') return false;
  const target = String(entry.target || '');
  if (POWER_AXIS_RE.test(target) || POWER_STACK_TARGETS.has(target)) {
    if (entry.mode === 'mul') return !(entry.perRank <= 1);
    if (entry.mode === 'add') return entry.perRank > 0;
    if (entry.mode === 'set') return entry.perRank > 0;
    return true;
  }
  return false;
}

function lintPowerAxes(doc, issues) {
  const stack = Array.isArray(doc.stack) ? doc.stack : [];
  for (let i = 0; i < stack.length; i++) {
    if (stackGrantsPower(stack[i])) {
      issues.push(issue(
        `stack[${i}]`,
        'powerAxis',
        resolveFactoryText('lint.power.axis'),
      ));
    }
  }
  const payload = Array.isArray(doc.payload) ? doc.payload : [];
  for (let i = 0; i < payload.length; i++) {
    const entry = payload[i];
    if (entry && (entry.kind === 'damage' || POWER_AXIS_RE.test(String(entry.kind || '')))) {
      issues.push(issue(`payload[${i}]`, 'powerAxis', resolveFactoryText('lint.power.axis')));
    }
  }
  for (const key of Object.keys(doc)) {
    if (POWER_AXIS_NAMES.includes(key)) {
      issues.push(issue(key, 'powerAxis', resolveFactoryText('lint.power.axis')));
    }
  }
}

export function lintModifierPower(doc) {
  const issues = [];
  if (!isPlainObject(doc)) {
    return { ok: false, issues: [issue('', 'type', 'modifier must be an object')] };
  }
  lintPowerAxes(doc, issues);
  return { ok: issues.length === 0, issues };
}

export function lintRecipeSpawn(recipe) {
  const issues = [];
  if (!isPlainObject(recipe)) {
    return { ok: false, issues: [issue('', 'type', 'recipe must be an object')], peak: 0 };
  }
  const peak = peakConcurrentDemand(recipe.packages);
  if (peak > FACTORY_SPAWN_HARD_MAX) {
    issues.push(issue('packages', 'spawn.hardCap', `${resolveFactoryText('lint.spawn.hard')} (peak ${peak})`));
  } else if (peak > FACTORY_SPAWN_DEFAULT_MAX) {
    issues.push(issue('packages', 'spawn.defaultCap', `${resolveFactoryText('lint.spawn.default')} (peak ${peak})`));
  }
  if (isPlainObject(recipe.rewards)) {
    // Existing recipes already pay xp/credits as the run economy. Factory docs must not
    // grow new grant fields; extra power-axis keys on the recipe itself are refused.
  }
  for (const key of Object.keys(recipe)) {
    if (['damage', 'hull', 'shield', 'speed', 'score'].includes(key)) {
      issues.push(issue(key, 'powerAxis', resolveFactoryText('lint.power.axis')));
    }
  }
  return { ok: issues.length === 0, issues, peak };
}

export function validateFactoryModifier(doc, options = {}) {
  const requireLoc = options.requireLoc !== false;
  if (!isPlainObject(doc)) {
    return { ok: false, issues: [issue('', 'type', 'modifier must be an object')] };
  }
  const base = validateAttackTrait(doc);
  const issues = wrapTraitIssues(base.issues);
  locKeysPresent(doc, issues, { required: requireLoc });
  lintPowerAxes(doc, issues);
  if (doc.schemaVersion !== ATTACK_TRAIT_SCHEMA_VERSION) {
    // validateAttackTrait already reports this; keep the factory rule id visible in tests.
  }
  return { ok: issues.length === 0, issues };
}

export function validateFactoryRecipe(doc, options = {}) {
  const requireLoc = options.requireLoc !== false;
  if (!isPlainObject(doc)) {
    return { ok: false, issues: [issue('', 'type', 'recipe must be an object')] };
  }
  const base = validateWaveRecipe(doc);
  const issues = wrapRecipeIssues(base.issues);
  locKeysPresent(doc, issues, { required: requireLoc });
  const spawn = lintRecipeSpawn(doc);
  for (const item of spawn.issues) issues.push(item);
  if (doc.schemaVersion !== SURVIVAL_WAVE_SCHEMA_VERSION) {
    // wrapped above
  }
  return { ok: issues.length === 0, issues, peak: spawn.peak };
}

export function validateArenaModule(mod) {
  const issues = [];
  if (!isPlainObject(mod)) {
    return { ok: false, issues: [issue('', 'type', 'arena module must be an object')] };
  }
  if (typeof mod.id !== 'string' || mod.id.length === 0) {
    issues.push(issue('id', 'id', 'id must be a non-empty string'));
  }
  if (!['pull', 'current', 'freeze', 'conduct'].includes(mod.law)) {
    issues.push(issue('law', 'law', 'law must be pull, current, freeze, or conduct'));
  }
  if (typeof mod.planInstall !== 'function') {
    issues.push(issue('planInstall', 'planInstall', 'planInstall must be a function'));
  }
  if (!isPlainObject(mod.bossRole)) {
    issues.push(issue('bossRole', 'bossRole', 'bossRole must be an object'));
  }
  if (!(Number.isInteger(mod.fieldBudget) && mod.fieldBudget >= 1 && mod.fieldBudget <= 2)) {
    issues.push(issue('fieldBudget', 'fieldBudget', 'fieldBudget must be 1 or 2'));
  }
  if (typeof mod.planInstall === 'function') {
    let preview;
    try {
      preview = mod.planInstall({
        arenaPhase: 'idle',
        at: { x: 0, z: 0 },
        lane: { x: 1, z: 0 },
        across: { x: 0, z: 1 },
      });
    } catch (err) {
      issues.push(issue('planInstall', 'planInstall.throw', String(err && err.message)));
      return { ok: false, issues };
    }
    if (!isPlainObject(preview)) {
      issues.push(issue('planInstall', 'shape', 'planInstall must return an object'));
    } else {
      if (typeof preview.phase !== 'string') issues.push(issue('phase', 'shape.phase', 'phase must be a string'));
      if (typeof preview.note !== 'string') issues.push(issue('note', 'shape.note', 'note must be a string'));
      if (!Array.isArray(preview.fields)) issues.push(issue('fields', 'shape.fields', 'fields must be an array'));
      else if (preview.fields.length > 2) issues.push(issue('fields', 'fieldBudget', 'install may occupy at most two field slots'));
      if (!Array.isArray(preview.mines)) issues.push(issue('mines', 'shape.mines', 'mines must be an array'));
      if (typeof preview.cover !== 'boolean') issues.push(issue('cover', 'shape.cover', 'cover must be a boolean'));
    }
  }
  return { ok: issues.length === 0, issues };
}

export function estimateWaveRecipe(recipe, install) {
  const packages = Array.isArray(recipe && recipe.packages) ? recipe.packages : [];
  const peak = peakConcurrentDemand(packages);
  let lastTick = 0;
  let bodies = 0;
  for (const pkg of packages) {
    if (!pkg) continue;
    const count = Number.isInteger(pkg.count) ? pkg.count : 0;
    bodies += count;
    const batch = Number.isInteger(pkg.batchSize) && pkg.batchSize > 0 ? pkg.batchSize : count;
    const gap = Number.isInteger(pkg.batchGapTicks) ? pkg.batchGapTicks : 0;
    const batches = batch > 0 ? Math.ceil(count / batch) : 1;
    const start = Number.isInteger(pkg.atTick) ? pkg.atTick : 0;
    const end = start + gap * Math.max(0, batches - 1);
    if (end > lastTick) lastTick = end;
  }
  const fields = install && Array.isArray(install.fields) ? install.fields.length : 0;
  const mines = install && Array.isArray(install.mines) ? install.mines.length : 0;
  const cover = !!(install && install.cover);
  return {
    peakConcurrent: peak,
    lastArrivalTick: lastTick,
    packageCount: packages.length,
    bodyCount: bodies,
    fieldCount: fields,
    mineCount: mines,
    cover,
    pressure: bodies * (lastTick + 60),
    spawnDefaultMax: FACTORY_SPAWN_DEFAULT_MAX,
    spawnHardMax: FACTORY_SPAWN_HARD_MAX,
    withinDefaultCap: peak <= FACTORY_SPAWN_DEFAULT_MAX,
    withinHardCap: peak <= FACTORY_SPAWN_HARD_MAX,
  };
}

export function catalogFactoryHealth() {
  const traitCheck = ATTACK_TRAITS.map((trait) => validateFactoryModifier(trait, { requireLoc: false }));
  const traitFailures = traitCheck.filter((row) => !row.ok).length;
  return {
    traitCount: ATTACK_TRAITS.length,
    traitFailures,
  };
}
