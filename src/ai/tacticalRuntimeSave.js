// SG-06 planning memory only. Ports, native objects, entity objects, traces and scratch caches
// never cross this boundary. The owning system rebuilds those against the restored GameState.
import { occupantGenerationOf } from '../core/entity.js';
import { stableId } from './contracts.js';

const VERSION = 1;
const MAX_ACTORS = 256;
const MAX_CONTACTS = 256;
const MAX_ITEMS = 4096;
const MAX_NODES = 100000;
const MAX_BYTES = 1024 * 1024;
const COMPONENTS = Object.freeze({
  commander: ['squads', 'acceptedLeaderGeneration'],
  executor: ['byEntity'],
  maneuver: ['byEntity'],
  combatDoctrine: ['byEntity'],
});
const STACK_FIELDS = ['memberCursor', 'lastTick', 'lastResult', 'lastDecisionByEntity', 'squadSignatures', 'entitySquad'];
const FRAME_FIELDS = ['frames', 'byEntity', 'lastTick'];
const COHORT_FIELDS = ['cohorts', 'byEntity', 'lastTick'];
const CADENCE_FIELDS = ['lastDecisionTick', 'lastOwnershipRefreshTick', 'lastManeuverRequests', 'bodyLaunches'];
// These are actual sensor, directive, formation and maneuver identity fields. Labels, reason
// strings, action IDs, squad IDs, role names and other arbitrary strings are never rewritten.
const ID_FIELDS = new Set(['id', 'entityId', 'actorId', 'memberId', 'playerId', 'targetId',
  'focusTargetId', 'ownerId', 'leaderId', 'anchorLeaderId', 'coverId', 'sourceId', 'obstacleId']);

function referencesInvalidTarget(decision, invalid) {
  const directive = decision.directive || decision;
  return [decision.action?.targetId, decision.combatDoctrine?.targetId,
    directive.focusTargetId, directive.objective?.targetId,
    directive.formation?.coverId, directive.formation?.anchorLeaderId].some((id) => invalid.has(id));
}

// Prune in the SAVED identity space. A rejected saved id may already be a valid different
// actor's new id, so it must never be compared to rebased identities or forgotten afterward.
function pruneSourceIdentities(runtime, invalid) {
  const stale = new Set();
  for (const [id, row] of runtime.memory) {
    if (invalid.has(id) || [...row.contacts.values()].some((contact) =>
      [contact.id, contact.targetId, contact.ownerId].some((target) => invalid.has(target)))) stale.add(id);
  }
  for (const decision of [...runtime.stack.lastDecisionByEntity.values(), ...runtime.stack.lastResult.decisions]) {
    if (invalid.has(decision.entityId) || referencesInvalidTarget(decision, invalid)) stale.add(decision.entityId);
  }
  runtime.memory = runtime.memory.filter(([id]) => !stale.has(id));
  runtime.perceptionTicks = runtime.perceptionTicks.filter(([id]) => !stale.has(id));
  runtime.stack.lastResult.decisions = runtime.stack.lastResult.decisions.filter((row) => !stale.has(row.entityId));
  for (const key of ['lastDecisionByEntity', 'entitySquad']) for (const id of stale) runtime.stack[key].delete(id);
  for (const key of ['executor', 'maneuver', 'combatDoctrine']) for (const id of stale) runtime.components[key].byEntity.delete(id);
  for (const [id, row] of runtime.components.commander.squads) {
    const previousLeader = row.members[0]?.id;
    if (row.members.some((member) => stale.has(member.id))) runtime.stack.squadSignatures.delete(id);
    row.members = row.members.filter((member) => !invalid.has(member.id));
    if (!row.members.length) { runtime.components.commander.squads.delete(id); continue; }
    if (invalid.has(previousLeader)) row.leaderOccupantGeneration = null;
    if (invalid.has(row.focusTargetId)) { row.focusTargetId = null; row.focusSinceTick = -Infinity; }
    for (const field of ['roles', 'lastAssignedTargets', 'breakUntil', 'breakReason', 'lastDirectives']) {
      for (const [actor, value] of row[field] || []) {
        if (invalid.has(actor) || field === 'lastAssignedTargets' && invalid.has(value)
          || field === 'lastDirectives' && referencesInvalidTarget(value, invalid)) row[field].delete(actor);
      }
    }
  }
  for (const leaders of runtime.components.commander.acceptedLeaderGeneration.values()) for (const id of invalid) leaders.delete(id);
  for (const key of ['frames', 'cohorts']) {
    const component = runtime[key];
    if (!component) continue;
    for (const id of stale) component.byEntity.delete(id);
    const frames = component.frames || component.cohorts;
    for (const [id, frame] of frames) {
      if (invalid.has(frame.lastTarget?.id)) { frames.delete(id); continue; }
      if (frame.members instanceof Map) for (const actor of invalid) frame.members.delete(actor);
    }
  }
  runtime.cadence.lastManeuverRequests = runtime.cadence.lastManeuverRequests.filter((row) => !stale.has(row.entityId));
  for (const id of invalid) runtime.cadence.bodyLaunches.delete(id);
  if (stale.size) runtime.cadence.lastDecisionTick = -Infinity;
}

function rebindData(value, bindings) {
  if (value instanceof Map) return new Map([...value].map(([key, item]) =>
    [bindings.get(key)?.id ?? key, rebindData(item, bindings)]));
  if (value instanceof Set) return new Set([...value].map((item) => bindings.get(item)?.id ?? item));
  if (Array.isArray(value)) return value.map((item) => rebindData(item, bindings));
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = key === 'lastAssignedTargets' && item instanceof Map
      ? new Map([...item].map(([id, target]) => [bindings.get(id)?.id ?? id, bindings.get(target)?.id ?? target]))
      : ID_FIELDS.has(key) ? bindings.get(item)?.id ?? item : rebindData(item, bindings);
  }
  for (const [field, id] of [
    ['occupantGeneration', value.id ?? value.entityId], ['targetGeneration', value.targetId],
    ['ownerGeneration', value.ownerId], ['sourceGeneration', value.sourceId],
    ['leaderOccupantGeneration', value.members?.[0]?.id],
  ]) {
    if (Object.hasOwn(value, field) && bindings.has(id)) output[field] = bindings.get(id).generation;
  }
  return output;
}

// A bounded tree of data records, with explicit representations for Maps/Sets and sentinel
// clocks. Repeated values are copied; there are no graph references or executable constructors.
function encode(value, budget = { nodes: 0 }, depth = 0) {
  if (++budget.nodes > MAX_NODES || depth > 32) throw new RangeError('Tactical runtime exceeds data bound');
  if (value === undefined) return { $clock: 'undefined' };
  if (typeof value === 'number' && !Number.isFinite(value)) return { $clock: String(value) };
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') {
    if (value.length > 2048) throw new RangeError('Tactical runtime string exceeds bound');
    return value;
  }
  const next = (item) => encode(item, budget, depth + 1);
  if (value instanceof Map) {
    if (value.size > MAX_ITEMS) throw new RangeError('Tactical map exceeds bound');
    return { $map: [...value].map(([key, item]) => [next(key), next(item)]) };
  }
  if (value instanceof Set) {
    if (value.size > MAX_ITEMS) throw new RangeError('Tactical set exceeds bound');
    return { $set: [...value].map(next) };
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ITEMS) throw new RangeError('Tactical list exceeds bound');
    return value.map(next);
  }
  if (typeof value !== 'object') throw new TypeError('Tactical runtime must contain data only');
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') throw new TypeError('Unsafe tactical key');
    // Commander work buffers are rebuilt per decision; they are not retained planning memory.
    if (key.endsWith('Scratch') || key === 'scratchMembers') continue;
    output[key] = next(item);
  }
  return output;
}

function decode(value, budget = { nodes: 0 }, depth = 0) {
  if (++budget.nodes > MAX_NODES || depth > 32) throw new RangeError('Tactical runtime exceeds data bound');
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') {
    if (value.length > 2048) throw new RangeError('Tactical runtime string exceeds bound');
    return value;
  }
  const next = (item) => decode(item, budget, depth + 1);
  if (Array.isArray(value)) {
    if (value.length > MAX_ITEMS) throw new RangeError('Tactical list exceeds bound');
    return value.map(next);
  }
  if (typeof value !== 'object') throw new TypeError('Invalid tactical record');
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === '$clock') {
    if (value.$clock === '-Infinity') return -Infinity;
    if (value.$clock === 'Infinity') return Infinity;
    if (value.$clock === 'NaN') return NaN;
    if (value.$clock === 'undefined') return undefined;
    throw new TypeError('Invalid tactical clock');
  }
  if (keys.length === 1 && keys[0] === '$map') {
    const entries = next(value.$map);
    if (!Array.isArray(entries) || entries.some((row) => !Array.isArray(row) || row.length !== 2)) throw new TypeError('Invalid tactical map');
    return new Map(entries);
  }
  if (keys.length === 1 && keys[0] === '$set') return new Set(next(value.$set));
  const output = {};
  for (const key of keys) {
    if (key.startsWith('$') || key === '__proto__' || key === 'constructor' || key === 'prototype') throw new TypeError('Unsafe tactical key');
    output[key] = next(value[key]);
  }
  return output;
}

function pick(source, fields) {
  return Object.fromEntries(fields.map((key) => [key, source[key]]));
}

function apply(target, source, fields) {
  for (const key of fields) {
    if (!Object.hasOwn(source, key)) throw new TypeError(`Missing tactical field ${key}`);
    if (target[key] instanceof Map && !(source[key] instanceof Map)) throw new TypeError(`Invalid tactical map ${key}`);
    target[key] = source[key];
  }
}

function validClock(value, tick) {
  return value === -Infinity || Number.isInteger(value) && value >= 0 && value <= tick;
}

export function captureTacticalRuntime(stack, state, cadence) {
  if (!stack) return null;
  const actors = [...stack.memory.byEntity];
  if (actors.length > MAX_ACTORS) return null;
  let maxContacts = 0;
  try {
    const memory = actors.map(([id, row]) => {
      maxContacts = Math.max(maxContacts, row.contacts.size);
      if (row.contacts.size > MAX_CONTACTS || row.events.length > MAX_CONTACTS) throw new RangeError('Tactical sensor memory exceeds bound');
      return [id, pick(row, ['self', 'contacts', 'events', 'tick', 'revision'])];
    });
    const runtime = {
      cadence: pick(cadence, CADENCE_FIELDS),
      stack: pick(stack, STACK_FIELDS),
      director: stack.director.state,
      memory,
      perceptionTicks: [...stack.perceptionCache].map(([id, row]) => [id, row.tick]),
      components: Object.fromEntries(Object.entries(COMPONENTS).map(([key, fields]) => [key, pick(stack[key], fields)])),
      frames: stack.maneuver.squadFrames ? pick(stack.maneuver.squadFrames, FRAME_FIELDS) : null,
      cohorts: stack.fodderCohorts ? pick(stack.fodderCohorts, COHORT_FIELDS) : null,
    };
    const payload = {
      version: VERSION, tick: state.tick, seed: stack.seed,
      bindings: [...state.entities.values()].filter((entity) => entity.alive !== false)
        .map((entity) => ({ id: entity.id, generation: occupantGenerationOf(entity), type: entity.type })),
      actors: actors.length, maxContacts, data: encode(runtime),
    };
    return payload.bindings.length <= MAX_ITEMS && JSON.stringify(payload).length <= MAX_BYTES ? payload : null;
  } catch { return null; }
}

export function restoreTacticalRuntime(stack, state, payload, restoreBindings = []) {
  if (!payload || payload.version !== VERSION || payload.tick !== state.tick || payload.seed !== stack.seed
    || !Array.isArray(payload.bindings) || payload.bindings.length > MAX_ITEMS
    || !Number.isInteger(payload.actors) || payload.actors < 0 || payload.actors > MAX_ACTORS
    || !Number.isInteger(payload.maxContacts) || payload.maxContacts < 0 || payload.maxContacts > MAX_CONTACTS) return null;
  try {
    if (JSON.stringify(payload).length > MAX_BYTES) return null;
    let runtime = decode(payload.data);
    if (!Array.isArray(runtime.memory) || runtime.memory.length !== payload.actors
      || !Array.isArray(runtime.perceptionTicks)) return null;
    const invalid = new Set();
    const bindings = new Map();
    if (!Array.isArray(restoreBindings) || restoreBindings.length > MAX_ITEMS) return null;
    const receipts = new Map();
    for (const receipt of restoreBindings) {
      if (!receipt || !['number', 'string'].includes(typeof receipt.saveId) || receipts.has(receipt.saveId)) return null;
      receipts.set(receipt.saveId, receipt);
    }
    const seenBindings = new Set();
    for (const binding of payload.bindings) {
      if (!binding || !['number', 'string'].includes(typeof binding.id) || seenBindings.has(binding.id)) return null;
      seenBindings.add(binding.id);
      // Only the canonical restore owner may bridge a saved life to its freshly spawned body.
      // An ordinary same-ID replacement has no matching restore receipt and is rejected below.
      const candidate = receipts.get(binding.id);
      const receipt = candidate?.savedGeneration === binding.generation ? candidate : null;
      if (!receipt) { invalid.add(binding.id); continue; }
      const id = receipt.entityId;
      const generation = receipt.generation;
      const entity = state.entities.get(id);
      if (!entity || entity.alive === false || entity.type !== binding.type
        || occupantGenerationOf(entity) !== generation) invalid.add(binding.id);
      else bindings.set(binding.id, { id, generation });
    }
    for (const [id] of runtime.memory) if (!bindings.has(id)) invalid.add(id);
    for (const decision of runtime.stack.lastResult?.decisions || []) {
      if (!bindings.has(decision.entityId)) invalid.add(decision.entityId);
    }
    pruneSourceIdentities(runtime, invalid);
    const accepted = runtime.components.commander.acceptedLeaderGeneration;
    runtime = rebindData(runtime, bindings);
    runtime.memory = runtime.memory.map(([id, row]) => [bindings.get(id)?.id ?? id, row]);
    runtime.perceptionTicks = runtime.perceptionTicks.map(([id, tick]) => [bindings.get(id)?.id ?? id, tick]);
    runtime.components.commander.acceptedLeaderGeneration = new Map([...accepted].map(([squad, leaders]) =>
      [squad, new Map([...leaders].map(([id, generation]) =>
        [bindings.get(id)?.id ?? id, bindings.get(id)?.generation ?? generation]))]));
    apply(stack, runtime.stack, STACK_FIELDS);
    if (!Number.isInteger(stack.lastTick) || stack.lastTick < 0 || stack.lastTick > state.tick
      || !Number.isInteger(stack.memberCursor) || stack.memberCursor < 0
      || !Array.isArray(stack.lastResult?.decisions) || stack.lastResult.decisions.length > MAX_ACTORS) return null;
    if (!runtime.director || typeof runtime.director !== 'object') return null;
    for (const [key, initial] of Object.entries(stack.director.state)) {
      const value = runtime.director[key];
      if (typeof initial === 'number' ? !Number.isFinite(value)
        : initial == null ? value != null && !Number.isFinite(value) : typeof value !== typeof initial) return null;
    }
    stack.director.state = runtime.director;
    for (const [key, fields] of Object.entries(COMPONENTS)) apply(stack[key], runtime.components[key], fields);
    const squads = stack.commander.squads;
    stack.commander.squads = new Map();
    for (const [id, row] of squads) {
      stack.commander.registerSquad(row);
      Object.assign(stack.commander.squads.get(id), row);
    }
    stack.memory.byEntity.clear();
    for (const [id, row] of runtime.memory) {
      if (!(row.contacts instanceof Map) || row.contacts.size > MAX_CONTACTS || !Array.isArray(row.events)
        || row.events.length > MAX_CONTACTS || !Number.isInteger(row.tick) || row.tick < 0 || row.tick > state.tick
        || row.self?.id !== id || !Number.isInteger(row.revision) || row.revision < 0) return null;
      stack.memory.byEntity.set(id, { ...row, snapshotContacts: [],
        snapshot: { tick: row.tick, self: row.self, contacts: [], events: [], revision: row.revision } });
      const memory = stack.memory.byEntity.get(id);
      memory.contacts = new Map([...row.contacts.values()].map((contact) => [`${contact.kind}|${stableId(contact.id)}`, contact]));
    }
    stack.perceptionCache.clear();
    for (const [id, tick] of runtime.perceptionTicks) {
      if (!stack.memory.byEntity.has(id) || !Number.isInteger(tick) || tick > state.tick) return null;
      stack.perceptionCache.set(id, stack.memory.snapshot(id, tick));
    }
    if (runtime.frames && stack.maneuver.squadFrames) apply(stack.maneuver.squadFrames, runtime.frames, FRAME_FIELDS);
    if (runtime.cohorts && stack.fodderCohorts) apply(stack.fodderCohorts, runtime.cohorts, COHORT_FIELDS);
    if (!runtime.cadence || !Array.isArray(runtime.cadence.lastManeuverRequests)
      || !(runtime.cadence.bodyLaunches instanceof Map)
      || !validClock(runtime.cadence.lastDecisionTick, state.tick)
      || !validClock(runtime.cadence.lastOwnershipRefreshTick, state.tick)) return null;
    return runtime.cadence;
  } catch { return null; }
}
