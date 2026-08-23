// Attack lineage + shared proc budget (PQ-133 / CRU-021).
// Pure kernel: no bus, DOM, physics, or Three.js. Containment lives here as callable refusals.

import { canonicalize, stableStringify } from './trace.js';

export const PROC_COSTS = Object.freeze({
  rootSibling: 1,
  bounce: 1,
  chain: 2,
  splitChild: 2,
  explosion: 3,
  fieldSpawn: 4,
  orbitNode: 5,
  statusReactionChild: 2,
});

export const DEFAULT_CONSTRAINTS = Object.freeze({
  lineageProcBudget: 12,
  generationMax: 1,
  childMax: 8,
  sameTargetCooldownTicks: 18,
  activeFamilyCap: 24,
  descendantsPerTickMax: 24,
});

let nextLineageId = 1;

export function resetLineageIds(start = 1) {
  nextLineageId = Number.isInteger(start) && start > 0 ? start : 1;
}

export function allocateLineageId() {
  const id = nextLineageId;
  nextLineageId += 1;
  return id;
}

export function createProcWorld(options = {}) {
  const max = Number.isInteger(options.descendantsPerTickMax) && options.descendantsPerTickMax > 0
    ? options.descendantsPerTickMax
    : DEFAULT_CONSTRAINTS.descendantsPerTickMax;
  return {
    tick: Number.isInteger(options.tick) ? options.tick : 0,
    descendantsThisTick: 0,
    descendantsPerTickMax: max,
  };
}

export function syncProcWorldTick(world, tick) {
  if (!world) return world;
  const next = Number.isInteger(tick) ? tick : 0;
  if (world.tick !== next) {
    world.tick = next;
    world.descendantsThisTick = 0;
  }
  return world;
}

function freezeConstraints(spec) {
  const raw = spec && spec.constraints ? spec.constraints : {};
  return {
    lineageProcBudget: intOr(raw.lineageProcBudget, DEFAULT_CONSTRAINTS.lineageProcBudget),
    generationMax: intOr(raw.generationMax, DEFAULT_CONSTRAINTS.generationMax),
    childMax: intOr(raw.childMax, DEFAULT_CONSTRAINTS.childMax),
    sameTargetCooldownTicks: intOr(raw.sameTargetCooldownTicks, DEFAULT_CONSTRAINTS.sameTargetCooldownTicks),
    activeFamilyCap: intOr(raw.activeFamilyCap, DEFAULT_CONSTRAINTS.activeFamilyCap),
    descendantsPerTickMax: intOr(raw.descendantsPerTickMax, DEFAULT_CONSTRAINTS.descendantsPerTickMax),
  };
}

function intOr(value, fallback) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function remainingFromSpec(spec) {
  const trajectory = spec && spec.trajectory ? spec.trajectory : {};
  const propagation = spec && spec.propagation ? spec.propagation : {};
  const split = propagation.split;
  const chain = propagation.chain;
  return {
    bounces: intOr(trajectory.bounces, 0),
    chains: chain && Number.isInteger(chain.count) ? chain.count : 0,
    pierces: intOr(propagation.pierce, 0),
    splits: split && Number.isInteger(split.count) ? split.count : 0,
  };
}

function allowedActionsFromSpec(spec, inheritKind) {
  const triggers = spec && Array.isArray(spec.triggers) ? spec.triggers : [];
  const actions = [];
  for (const trigger of triggers) {
    if (!trigger || typeof trigger.action !== 'string') continue;
    if (inheritKind == null) {
      actions.push(trigger.action);
      continue;
    }
    const inherit = trigger.inherit;
    if (inherit && inherit[inheritKind] === true) actions.push(trigger.action);
  }
  return actions;
}

/**
 * Shared mutable budget for one lineage. Spec stays immutable; this object is the runtime cap.
 */
export function createSharedBudget(spec, world) {
  const constraints = freezeConstraints(spec);
  const initial = constraints.lineageProcBudget;
  return {
    remaining: initial,
    initial,
    consumed: 0,
    suppressed: 0,
    suppressReasons: [],
    childCount: 0,
    familySize: 0,
    constraints,
    world: world || createProcWorld({ descendantsPerTickMax: constraints.descendantsPerTickMax }),
  };
}

export function createLineage(options = {}) {
  const spec = options.spec;
  if (!spec || typeof spec !== 'object') {
    throw new TypeError('createLineage requires spec');
  }
  const budget = options.budget || createSharedBudget(spec, options.world);
  const lineageId = options.lineageId != null ? options.lineageId : allocateLineageId();
  const rootAttackId = options.rootAttackId != null ? options.rootAttackId : lineageId;
  const generation = Number.isInteger(options.generation) ? options.generation : 0;
  const inheritKind = options.inheritKind || null;
  const allowedActions = options.allowedActions || allowedActionsFromSpec(spec, inheritKind);
  const remaining = options.remaining ? { ...options.remaining } : remainingFromSpec(spec);
  const visited = options.visitedTargets || new Map();
  const tick = Number.isInteger(options.createdTick) ? options.createdTick : 0;
  if (budget.world) syncProcWorldTick(budget.world, tick);

  const runtime = {
    lineageId,
    rootAttackId,
    specDigest: spec.digest,
    sourceEntityId: options.sourceEntityId != null ? options.sourceEntityId : null,
    sourceWeaponSlot: Number.isInteger(options.sourceWeaponSlot) ? options.sourceWeaponSlot : 0,
    generation,
    remaining,
    allowedActions: allowedActions.slice(),
    hitCooldownTicks: budget.constraints.sameTargetCooldownTicks,
    createdTick: tick,
    budget,
    visitedTargets: visited,
  };
  budget.familySize += 1;
  return runtime;
}

export function lineageMetrics(runtime) {
  const budget = runtime && runtime.budget;
  if (!budget) {
    return {
      remaining: 0, initial: 0, consumed: 0, suppressed: 0,
      childCount: 0, familySize: 0, suppressReasons: [],
    };
  }
  return {
    remaining: budget.remaining,
    initial: budget.initial,
    consumed: budget.consumed,
    suppressed: budget.suppressed,
    childCount: budget.childCount,
    familySize: budget.familySize,
    suppressReasons: budget.suppressReasons.slice(),
  };
}

function suppress(budget, reason) {
  budget.suppressed += 1;
  budget.suppressReasons.push(reason);
  return { ok: false, reason, suppressed: true };
}

/**
 * Pay the shared proc budget. Refuses when the lineage cannot afford the cost.
 * Direct payload resolution is the caller's job; this only gates *additional* work.
 */
export function tryConsumeProc(runtime, cost, reason = 'proc') {
  const budget = runtime && runtime.budget;
  if (!budget) return { ok: false, reason: 'no_budget', suppressed: true };
  const amount = Number.isFinite(cost) && cost > 0 ? cost : 0;
  if (amount <= 0) return { ok: true, remaining: budget.remaining };
  if (budget.remaining < amount) return suppress(budget, 'proc_budget');
  budget.remaining -= amount;
  budget.consumed += amount;
  return { ok: true, remaining: budget.remaining, reason };
}

export function canAct(runtime, action) {
  if (!runtime || !Array.isArray(runtime.allowedActions)) return false;
  return runtime.allowedActions.includes(action);
}

export function recordTargetHit(runtime, targetId, tick) {
  if (!runtime || targetId == null) return { ok: false, reason: 'no_target' };
  const visited = runtime.visitedTargets;
  const now = Number.isInteger(tick) ? tick : 0;
  const last = visited.get(targetId);
  if (Number.isInteger(last) && now - last < runtime.hitCooldownTicks) {
    return { ok: false, reason: 'same_target_cooldown', lastTick: last };
  }
  visited.set(targetId, now);
  return { ok: true, firstVisit: last == null };
}

export function hasVisited(runtime, targetId) {
  if (!runtime || targetId == null) return false;
  return runtime.visitedTargets.has(targetId);
}

/**
 * Spawn a bounded descendant that shares this lineage's budget and visited set.
 * Returns a new runtime or a suppression receipt. Never mutates the compiled spec.
 */
export function trySpawnDescendant(parent, options = {}) {
  if (!parent || !parent.budget) return { ok: false, reason: 'no_lineage', suppressed: true };
  const budget = parent.budget;
  const constraints = budget.constraints;
  const kind = options.inheritKind || 'splitChildren';
  const cost = Number.isFinite(options.cost) ? options.cost : PROC_COSTS.splitChild;
  const tick = Number.isInteger(options.tick) ? options.tick : parent.createdTick;
  syncProcWorldTick(budget.world, tick);

  if (parent.generation >= constraints.generationMax) {
    return suppress(budget, 'generation_max');
  }
  if (budget.childCount >= constraints.childMax) {
    return suppress(budget, 'child_max');
  }
  if (budget.familySize >= constraints.activeFamilyCap) {
    return suppress(budget, 'active_family_cap');
  }
  if (budget.world && budget.world.descendantsThisTick >= budget.world.descendantsPerTickMax) {
    return suppress(budget, 'descendants_per_tick');
  }
  const paid = tryConsumeProc(parent, cost, kind);
  if (!paid.ok) return paid;

  const childRemaining = options.remaining
    ? { ...options.remaining }
    : {
      bounces: parent.remaining.bounces,
      chains: 0,
      pierces: 0,
      splits: 0,
    };
  const child = createLineage({
    spec: options.spec,
    budget,
    lineageId: parent.lineageId,
    rootAttackId: parent.rootAttackId,
    generation: parent.generation + 1,
    inheritKind: kind,
    allowedActions: options.allowedActions,
    remaining: childRemaining,
    visitedTargets: parent.visitedTargets,
    sourceEntityId: parent.sourceEntityId,
    sourceWeaponSlot: parent.sourceWeaponSlot,
    createdTick: tick,
  });
  budget.childCount += 1;
  if (budget.world) budget.world.descendantsThisTick += 1;
  return { ok: true, runtime: child, cost };
}

export function inheritAllowedActions(spec, inheritKind) {
  return allowedActionsFromSpec(spec, inheritKind);
}

export function compactLineageRecord(runtime) {
  if (!runtime) return null;
  return canonicalize({
    lineageId: runtime.lineageId,
    rootAttackId: runtime.rootAttackId,
    specDigest: runtime.specDigest,
    sourceEntityId: runtime.sourceEntityId,
    sourceWeaponSlot: runtime.sourceWeaponSlot,
    generation: runtime.generation,
    remaining: runtime.remaining,
    allowedActions: runtime.allowedActions.slice().sort(),
    hitCooldownTicks: runtime.hitCooldownTicks,
    createdTick: runtime.createdTick,
    procRemaining: runtime.budget ? runtime.budget.remaining : 0,
    visitedCount: runtime.visitedTargets ? runtime.visitedTargets.size : 0,
  });
}

export function lineageRecordKey(runtime) {
  return stableStringify(compactLineageRecord(runtime));
}
