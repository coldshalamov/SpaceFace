// Pure XZ scene model for Creator's Dock.
// No Node builtins, no physics step. The lab is the only simulator.

import { sameJson, sortValue } from './stableJson.mjs';

export const PROJECT_SCHEMA = 'spaceface.creatorsDock.v1';
export const REQUEST_SCHEMA = 'spaceface.creatorsDockRequest.v1';
export const RESPONSE_SCHEMA = 'spaceface.creatorsDockResponse.v1';
export const EXPORT_SCHEMA = 'spaceface.creatorsDockExport.v1';

export const ID_RE = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;

const ACTOR_KEYS = [
  'id', 'kind', 'role', 'profile', 'x', 'y', 'z', 'heading', 'velX', 'velY', 'velZ',
  'angularVelocity', 'team', 'factionId', 'isPlayer', 'persistent',
  'overrides', 'loadout', 'groupId', 'label',
];
const TRIGGER_KEYS = ['id', 'kind', 'shape', 'x', 'z', 'radius', 'assertion', 'label', 'groupId', 'labOnly'];
const OBJECTIVE_KEYS = [
  'id', 'kind', 'x', 'z', 'metric', 'signal', 'op', 'value', 'label', 'groupId', 'labOnly',
];
const FIELD_KEYS = [
  'id', 'kind', 'fieldKind', 'gameplay', 'x', 'z', 'radius', 'label', 'groupId',
  'place', 'force', 'note',
];
const ROUTE_KEYS = ['id', 'kind', 'from', 'to', 'label', 'gameplay', 'groupId'];
const ATTACHMENT_KEYS = ['id', 'kind', 'defId', 'ownerAlias', 'targetAlias', 'restLength', 'label', 'groupId'];

export const OBJECT_KEY_SETS = Object.freeze({
  actor: ACTOR_KEYS,
  trigger: TRIGGER_KEYS,
  objective: OBJECTIVE_KEYS,
  field: FIELD_KEYS,
  route: ROUTE_KEYS,
  attachment: ATTACHMENT_KEYS,
});

const CLONE_REJECT = Symbol('clone-reject');

function isDataDescriptor(descriptor) {
  return !!descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value');
}

function ownDataEntries(object) {
  const entries = [];
  for (const key of Object.keys(object)) {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    if (!isDataDescriptor(descriptor)) continue;
    entries.push([key, descriptor.value]);
  }
  return entries;
}

function arrayDataAt(array, index) {
  const descriptor = Object.getOwnPropertyDescriptor(array, String(index));
  if (!descriptor) return { kind: 'hole' };
  if (!isDataDescriptor(descriptor)) return { kind: 'getter' };
  return { kind: 'data', value: descriptor.value };
}

function readToJSON(value) {
  let current = value;
  const chain = new Set();
  while (current && typeof current === 'object' && !chain.has(current)) {
    chain.add(current);
    const descriptor = Object.getOwnPropertyDescriptor(current, 'toJSON');
    if (descriptor) {
      if (isDataDescriptor(descriptor)) return descriptor.value;
      if (typeof descriptor.get === 'function') return descriptor.get.call(value);
    }
    current = Object.getPrototypeOf(current);
  }
  return undefined;
}

function snapshot(value, seen = new Map()) {
  if (value === null || value === undefined || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  if (Array.isArray(value)) {
    const out = [];
    seen.set(value, out);
    for (let i = 0; i < value.length; i += 1) {
      const slot = arrayDataAt(value, i);
      if (slot.kind === 'data') out[i] = snapshot(slot.value, seen);
      else out.length = i + 1;
    }
    return out;
  }
  const out = {};
  seen.set(value, out);
  for (const [key, child] of ownDataEntries(value)) out[key] = snapshot(child, seen);
  return out;
}

function containsForbiddenNull(value, seen = new Set()) {
  if (value === null) return true;
  if (!value || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const slot = arrayDataAt(value, i);
      if (slot.kind !== 'data' || containsForbiddenNull(slot.value, seen)) return true;
    }
    return false;
  }
  for (const [key, child] of ownDataEntries(value)) {
    if (key === 'isPlayer') continue;
    if (containsForbiddenNull(child, seen)) return true;
  }
  return false;
}

function nullWasIntroduced(original, key, next) {
  if (next !== null || key === 'isPlayer') return false;
  if (!original || typeof original !== 'object') return true;
  if (!Object.prototype.hasOwnProperty.call(original, key)) return true;
  return original[key] != null;
}

function accessorHidData(original, produced) {
  if (!original || typeof original !== 'object' || !produced || typeof produced !== 'object') return false;
  if (Array.isArray(original) || Array.isArray(produced)) return false;
  for (const [key, prev] of ownDataEntries(original)) {
    if (key === 'isPlayer' || prev == null) continue;
    const descriptor = Object.getOwnPropertyDescriptor(produced, key);
    if (descriptor && !isDataDescriptor(descriptor)) return true;
  }
  return false;
}

function introducedNull(original, produced) {
  if (produced === null) return original != null;
  if (!produced || typeof produced !== 'object' || !original || typeof original !== 'object') return false;
  if (produced === original) return false;
  if (Array.isArray(produced)) {
    if (!Array.isArray(original)) return containsForbiddenNull(produced);
    for (let i = 0; i < produced.length; i += 1) {
      const slot = arrayDataAt(produced, i);
      if (slot.kind !== 'data') return true;
      const next = slot.value;
      if (nullWasIntroduced(original, i, next)) return true;
      if (next && typeof next === 'object') {
        const prev = original[i];
        if (prev && typeof prev === 'object') {
          if (introducedNull(prev, next)) return true;
        } else if (containsForbiddenNull(next)) return true;
      }
    }
    return false;
  }
  for (const [key, next] of ownDataEntries(produced)) {
    if (nullWasIntroduced(original, key, next)) return true;
    const prev = original[key];
    if (Array.isArray(next) && !Array.isArray(prev) && containsForbiddenNull(next)) return true;
    if (next && typeof next === 'object') {
      if (prev && typeof prev === 'object') {
        if (introducedNull(prev, next)) return true;
      } else if (containsForbiddenNull(next)) return true;
    }
  }
  return false;
}

function captureFields(object) {
  const toJSON = Object.prototype.hasOwnProperty.call(object, 'toJSON')
    ? Object.getOwnPropertyDescriptor(object, 'toJSON')
    : null;
  if (Array.isArray(object)) {
    const descriptors = [];
    for (let i = 0; i < object.length; i += 1) {
      descriptors[i] = Object.getOwnPropertyDescriptor(object, String(i)) || null;
    }
    return { kind: 'array', object, length: object.length, descriptors, toJSON };
  }
  const entries = ownDataEntries(object);
  const keys = entries.map(([key]) => key);
  const values = new Map(entries);
  return { kind: 'object', object, keys, values, toJSON };
}

function captureTree(value, seen, records) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  records.push(captureFields(value));
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const slot = arrayDataAt(value, i);
      if (slot.kind === 'data') captureTree(slot.value, seen, records);
    }
    return;
  }
  for (const [, child] of ownDataEntries(value)) captureTree(child, seen, records);
}

function redefine(object, key, descriptor) {
  try {
    Object.defineProperty(object, key, descriptor);
  } catch (error) {
    // A non-configurable property cannot be put back. Leave it and keep the previous history.
  }
}

function restoreRecord(record) {
  const object = record.object;
  if (record.kind === 'array') {
    try {
      object.length = 0;
    } catch (error) {
      // length can be non-writable after a hostile toJSON
    }
    for (let i = 0; i < record.length; i += 1) {
      const descriptor = record.descriptors[i];
      if (descriptor) redefine(object, String(i), descriptor);
    }
    try {
      object.length = record.length;
    } catch (error) {
      // length can be non-writable after a hostile toJSON
    }
  } else {
    for (const key of Object.keys(object)) {
      if (record.values.has(key)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        try {
          delete object[key];
        } catch (error) {
          // non-configurable extra key
        }
      }
    }
    for (const key of record.keys) {
      redefine(object, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: record.values.get(key),
      });
    }
  }
  try {
    if (record.toJSON) Object.defineProperty(object, 'toJSON', record.toJSON);
    else if (Object.prototype.hasOwnProperty.call(object, 'toJSON')) delete object.toJSON;
  } catch (error) {
    // non-configurable toJSON stays; the clone is still rejected
  }
}

function restoreTree(records) {
  for (let i = records.length - 1; i >= 0; i -= 1) {
    try {
      restoreRecord(records[i]);
    } catch (error) {
      // One record must not prevent the rest from being put back, and must not escape clone.
    }
  }
}

function materialize(value, key, seen) {
  if (value === null) return null;
  if (value === undefined) return undefined;
  const type = typeof value;
  if (type === 'string' || type === 'boolean') return value;
  if (type === 'number') return Number.isFinite(value) ? value : null;
  if (type === 'bigint') throw new TypeError('Do not know how to serialize a BigInt');
  if (type !== 'object') return undefined;
  if (seen.has(value)) throw new TypeError('Converting circular structure to JSON');
  const before = snapshot(value);
  const toJSON = readToJSON(value);
  if (typeof toJSON === 'function') {
    seen.add(value);
    const produced = toJSON.call(value, key);
    if (produced === null) return CLONE_REJECT;
    if (produced === undefined) return undefined;
    if (produced && typeof produced === 'object') {
      if (accessorHidData(before, produced) || introducedNull(before, produced)) return CLONE_REJECT;
      if (produced !== value) return materialize(produced, key, seen);
    } else if (produced !== value) {
      return materialize(produced, key, seen);
    }
  } else if (value instanceof String || value instanceof Number || value instanceof Boolean) {
    return materialize(value.valueOf(), key, seen);
  } else {
    seen.add(value);
  }
  if (Array.isArray(value)) {
    const out = [];
    for (let i = 0; i < value.length; i += 1) {
      const slot = arrayDataAt(value, i);
      if (slot.kind !== 'data') return CLONE_REJECT;
      const item = materialize(slot.value, String(i), seen);
      if (item === CLONE_REJECT || item === undefined) return CLONE_REJECT;
      out.push(item);
    }
    return out;
  }
  const out = {};
  for (const [childKey, childValue] of ownDataEntries(value)) {
    const child = materialize(childValue, childKey, seen);
    if (child === CLONE_REJECT) return CLONE_REJECT;
    if (child !== undefined) out[childKey] = child;
  }
  return out;
}

export function clone(value) {
  if (value == null) return value;
  const records = [];
  try {
    // A toJSON that returns null, deletes itself then returns null, or places
    // null over another field must not be stored. isPlayer null still clones
    // so the player canon can name that flag. A rejected toJSON must not leave
    // the caller's object mutated.
    captureTree(value, new Set(), records);
    const plain = materialize(value, '', new Set());
    if (plain === CLONE_REJECT || plain === undefined) {
      restoreTree(records);
      return null;
    }
    const text = JSON.stringify(plain);
    if (typeof text !== 'string') {
      restoreTree(records);
      return null;
    }
    return JSON.parse(text);
  } catch (error) {
    restoreTree(records);
    return null;
  }
}

function cloneScene(project) {
  let next;
  try {
    next = clone(project);
  } catch (error) {
    return null;
  }
  if (!next || typeof next !== 'object' || Array.isArray(next) || !Array.isArray(next.objects)) return null;
  for (const object of next.objects) {
    if (!object || typeof object !== 'object' || Array.isArray(object)) return null;
  }
  return next;
}

function refuseUnstored(project) {
  return { ok: false, project, issues: ['scene could not be cloned'] };
}

function asObjectList(objects) {
  return Array.isArray(objects) ? objects : [];
}

function refuseLiveObjects(project) {
  if (!project || project.objects == null || Array.isArray(project.objects)) return null;
  return { ok: false, project, issues: ['objects must be an array'] };
}

export function sameProject(a, b) {
  return sameJson(a, b);
}

export function emptyProject(meta = {}) {
  return {
    schema: PROJECT_SCHEMA,
    id: meta.id || 'dock.untitled',
    title: meta.title || 'Untitled dock',
    description: meta.description || '',
    composition: meta.composition || 'custom',
    seed: meta.seed ?? 1,
    ticks: meta.ticks ?? 180,
    version: 1,
    evidenceClass: 'focused-fixture',
    runtimeProfile: 'focused-lab',
    standardInvariants: true,
    world: {
      fixtureProfile: 'empty-flight',
      sectorId: 'sector_helios_prime',
      mode: 'flight',
      physicsBackend: 'rapier-dynamic',
      flightBackend: 'v3',
      aiBackend: 'legacy',
      credits: 5000,
      ...(meta.world || {}),
    },
    grid: { size: 10, snap: true, ...(meta.grid || {}) },
    camera: { x: 0, z: 0, zoom: 3.2, ...(meta.camera || {}) },
    objects: [],
    frames: [{
      tick: 0,
      input: { moveX: 0, moveZ: 0, turnIntent: 0, boost: false, fire: false },
    }],
    inputEvents: [],
    notes: {
      creatorsDock: '1',
      ...(meta.notes || {}),
    },
    fixtureExceptions: [
      'focused-fixture authored in Creator\'s Dock; not production-manifest evidence',
    ],
    observer: { enabled: false },
    traceSignals: [],
  };
}

export function objectById(project, id) {
  return asObjectList(project && project.objects).find((object) => object.id === id) || null;
}

export function actorsOf(project) {
  return asObjectList(project && project.objects).filter((object) => object.kind === 'actor');
}

export function issuesForObject(object) {
  const issues = [];
  if (!object || typeof object !== 'object' || Array.isArray(object)) {
    return ['object must be a plain object'];
  }
  if (typeof object.kind !== 'string' || !OBJECT_KEY_SETS[object.kind]) {
    issues.push(`unknown object kind "${object.kind}"`);
    return issues;
  }
  const allowed = new Set(OBJECT_KEY_SETS[object.kind]);
  for (const key of Object.getOwnPropertyNames(object)) {
    if (!allowed.has(key)) issues.push(`unknown field "${key}" on ${object.kind}`);
  }
  if (typeof object.id !== 'string' || !ID_RE.test(object.id)) {
    issues.push('id must match [A-Za-z_][A-Za-z0-9_-]{0,63}');
  }
  return issues;
}

function kindName(object) {
  if (!object || object.kind == null) return '';
  if (typeof object.kind === 'string') return object.kind;
  if (typeof object.kind === 'object') {
    const value = object.kind.valueOf();
    if (typeof value === 'string') return value;
  }
  return '';
}

function isActorKind(object) {
  return kindName(object) === 'actor';
}

function isPlayerActor(object) {
  return isActorKind(object) && object.isPlayer === true;
}

function nonBooleanPlayerIssue(object) {
  if (!isActorKind(object)) return null;
  if (!Object.prototype.hasOwnProperty.call(object, 'isPlayer')) return null;
  if (typeof object.isPlayer === 'boolean') return null;
  return `${object.id ? `${object.id}: ` : ''}isPlayer must be a boolean`;
}

function pushPlayerFlagIssues(issues, objects) {
  for (const object of asObjectList(objects)) {
    const issue = nonBooleanPlayerIssue(object);
    if (issue) issues.push(issue);
  }
}

function countPlayers(objects) {
  let count = 0;
  for (const object of asObjectList(objects)) {
    if (isPlayerActor(object)) count += 1;
  }
  return count;
}

function exactlyOnePlayerIssue(found) {
  return `scene needs exactly one player actor (found ${found})`;
}

function collectNestedPlayerFlags(value, path, issues, seen) {
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);
  const playerFlag = Object.getOwnPropertyDescriptor(value, 'isPlayer');
  if (isDataDescriptor(playerFlag) && typeof playerFlag.value !== 'boolean') {
    issues.push(`${path || 'project'}: isPlayer must be a boolean`);
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const slot = arrayDataAt(value, index);
      if (slot.kind === 'data') collectNestedPlayerFlags(slot.value, `${path}[${index}]`, issues, seen);
    }
    return;
  }
  for (const [key, child] of ownDataEntries(value)) {
    if (key === 'isPlayer') continue;
    collectNestedPlayerFlags(child, path ? `${path}.${key}` : key, issues, seen);
  }
}

function propertySlot(object, key) {
  if (!object || typeof object !== 'object') return { kind: 'missing' };
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor) return { kind: 'missing' };
  if (!isDataDescriptor(descriptor)) return { kind: 'accessor' };
  return { kind: 'data', value: descriptor.value };
}

function sceneObjects(project) {
  const slot = propertySlot(project, 'objects');
  return slot.kind === 'data' && Array.isArray(slot.value) ? slot.value : null;
}

export function playerCanonIssues(project) {
  const issues = [];
  const slot = propertySlot(project, 'objects');
  const objects = sceneObjects(project);
  if (slot.kind === 'data' && slot.value != null && !objects) issues.push('objects must be an array');
  let players = 0;
  for (const object of objects || []) {
    const label = object && object.id ? `${object.id}: ` : '';
    for (const issue of issuesForObject(object)) issues.push(`${label}${issue}`);
    if (isPlayerActor(object)) players += 1;
  }
  // A getter named objects must not run, and it is not evidence of zero players.
  if (slot.kind !== 'accessor' && players !== 1) issues.push(exactlyOnePlayerIssue(players));
  collectNestedPlayerFlags(project, 'project', issues, new Set());
  return issues;
}

export function requireOnePlayer(previous, result) {
  if (!result || result.ok === false) return result;
  const issues = playerCanonIssues(result.project);
  if (issues.length) return { ok: false, project: previous, issues };
  return result;
}

function playersAfterReplace(project, id, object) {
  let count = 0;
  for (const entry of asObjectList(project && project.objects)) {
    const row = entry && entry.id === id ? object : entry;
    if (isPlayerActor(row)) count += 1;
  }
  return count;
}

export function placePlayer(project) {
  const refused = refuseLiveObjects(project);
  if (refused) return refused;
  const flags = [];
  pushPlayerFlagIssues(flags, project && project.objects);
  if (flags.length) return { ok: false, project, issues: flags };
  const found = countPlayers(project.objects);
  if (found > 1) return { ok: false, project, issues: [exactlyOnePlayerIssue(found)] };
  const existing = asObjectList(project && project.objects).find((object) => isPlayerActor(object));
  if (existing) {
    const stored = cloneScene(project);
    if (!stored) return refuseUnstored(project);
    const gated = requireOnePlayer(project, { ok: true, project: stored, id: existing.id, issues: [] });
    return gated.ok ? gated : { ok: false, project, issues: gated.issues };
  }
  let id = 'player';
  let n = 1;
  while (objectById(project, id)) {
    n += 1;
    id = `player_${n}`;
  }
  const added = addObject(project, {
    id,
    kind: 'actor',
    role: 'player',
    profile: 'ship.starter',
    x: 0,
    y: 0,
    z: 0,
    heading: 0,
    velX: 0,
    velY: 0,
    velZ: 0,
    angularVelocity: 0,
    team: 0,
    isPlayer: true,
    persistent: true,
    label: 'player',
  });
  return added.ok ? { ...added, id } : added;
}

export function setPlayer(project, id) {
  const refused = refuseLiveObjects(project);
  if (refused) return refused;
  const target = objectById(project, id);
  if (!target || target.kind !== 'actor') return { ok: false, project, issues: ['the player has to be an actor'] };
  const next = cloneScene(project);
  if (!next) return refuseUnstored(project);
  for (const object of next.objects) {
    if (object.kind === 'actor') object.isPlayer = object.id === id;
  }
  const stored = cloneScene(next);
  if (!stored) return refuseUnstored(project);
  const gated = requireOnePlayer(project, { ok: true, project: stored, id, issues: [] });
  return gated.ok ? gated : { ok: false, project, issues: gated.issues };
}

export function clearPlayerFlag(project, id) {
  const refused = refuseLiveObjects(project);
  if (refused) return refused;
  const target = objectById(project, id);
  if (!target || target.kind !== 'actor') return { ok: false, project, issues: ['the player has to be an actor'] };
  const next = cloneScene(project);
  if (!next) return refuseUnstored(project);
  const object = next.objects.find((row) => row && row.id === id);
  if (!object || object.kind !== 'actor') return refuseUnstored(project);
  object.isPlayer = false;
  return requireOnePlayer(project, { ok: true, project: next, issues: [] });
}

export function addObject(project, object) {
  const refused = refuseLiveObjects(project);
  if (refused) return refused;
  const issues = issuesForObject(object);
  if (objectById(project, object && object.id)) issues.push(`duplicate id "${object && object.id}"`);
  pushPlayerFlagIssues(issues, [object]);
  pushPlayerFlagIssues(issues, project.objects);
  const found = countPlayers(project.objects) + (isPlayerActor(object) ? 1 : 0);
  if (found !== 1) issues.push(exactlyOnePlayerIssue(found));
  if (issues.length) return { ok: false, project, issues };
  const next = cloneScene(project);
  if (!next) return refuseUnstored(project);
  const placed = applySnap(object, next.grid);
  if (!placed) return refuseUnstored(project);
  next.objects = [...next.objects, placed];
  return requireOnePlayer(project, { ok: true, project: next, issues: [] });
}

export function replaceObject(project, id, object) {
  const refused = refuseLiveObjects(project);
  if (refused) return refused;
  const issues = issuesForObject(object);
  if (object.id !== id) issues.push('replacement id must match the edited id');
  if (!objectById(project, id)) issues.push(`missing id "${id}"`);
  else {
    pushPlayerFlagIssues(issues, [object]);
    pushPlayerFlagIssues(issues, asObjectList(project.objects).filter((entry) => entry.id !== id));
    const found = playersAfterReplace(project, id, object);
    if (found !== 1) issues.push(exactlyOnePlayerIssue(found));
  }
  if (issues.length) return { ok: false, project, issues };
  const next = cloneScene(project);
  if (!next) return refuseUnstored(project);
  const snapped = applySnap(object, next.grid);
  if (!snapped) return refuseUnstored(project);
  next.objects = next.objects.map((entry) => (entry.id === id ? snapped : entry));
  return requireOnePlayer(project, { ok: true, project: next, issues: [] });
}

export function deleteObjects(project, ids) {
  const drop = new Set(ids || []);
  const next = cloneScene(project);
  if (!next) return refuseUnstored(project);
  const before = next.objects.length;
  next.objects = next.objects.filter((object) => !drop.has(object.id));
  if (next.objects.length === before) return { ok: false, project, issues: ['nothing deleted'] };
  return requireOnePlayer(project, { ok: true, project: next, issues: [] });
}

export function cloneObject(project, id, newId) {
  const refused = refuseLiveObjects(project);
  if (refused) return refused;
  const source = objectById(project, id);
  if (!source) return { ok: false, project, issues: [`missing id "${id}"`] };
  if (typeof newId !== 'string' || !ID_RE.test(newId)) {
    return { ok: false, project, issues: ['newId is not a safe id'] };
  }
  const flags = [];
  pushPlayerFlagIssues(flags, [source]);
  pushPlayerFlagIssues(flags, project.objects);
  if (flags.length) return { ok: false, project, issues: flags };
  const copy = clone(source);
  if (!copy || typeof copy !== 'object' || Array.isArray(copy)) return refuseUnstored(project);
  copy.id = newId;
  copy.groupId = undefined;
  delete copy.groupId;
  if (copy.kind === 'actor') {
    copy.isPlayer = false;
    const step = (project.grid && project.grid.size) || 10;
    copy.x = (Number(copy.x) || 0) + step;
    copy.z = (Number(copy.z) || 0) + step;
    if (copy.label) copy.label = `${copy.label} copy`;
  } else if ('x' in copy) {
    const step = (project.grid && project.grid.size) || 10;
    copy.x = (Number(copy.x) || 0) + step;
    copy.z = (Number(copy.z) || 0) + step;
  }
  return addObject(project, copy);
}

export function expandIds(project, ids) {
  const wanted = new Set(ids || []);
  const objects = asObjectList(project && project.objects);
  const groups = new Set();
  for (const object of objects) {
    if (wanted.has(object.id) && object.groupId) groups.add(object.groupId);
  }
  const out = new Set(wanted);
  for (const object of objects) {
    if (object.groupId && groups.has(object.groupId)) out.add(object.id);
  }
  return [...out];
}

export function nudgeObjects(project, ids, dx, dz) {
  const refused = refuseLiveObjects(project);
  if (refused) return refused;
  const move = new Set(expandIds(project, ids));
  if (!move.size) return { ok: false, project, issues: ['nothing to nudge'] };
  const next = cloneScene(project);
  if (!next) return refuseUnstored(project);
  for (const object of next.objects) {
    if (!move.has(object.id)) continue;
    if (!Number.isFinite(object.x) || !Number.isFinite(object.z)) continue;
    object.x = snapCoord(object.x + dx, next.grid);
    object.z = snapCoord(object.z + dz, next.grid);
  }
  return requireOnePlayer(project, { ok: true, project: next, issues: [] });
}

export function setVelocity(project, id, velX, velZ) {
  const next = cloneScene(project);
  if (!next) return refuseUnstored(project);
  const object = objectById(next, id);
  if (!object || object.kind !== 'actor') {
    return { ok: false, project, issues: [`"${id}" is not an actor`] };
  }
  if (!Number.isFinite(velX) || !Number.isFinite(velZ)) {
    return { ok: false, project, issues: ['velocity must be finite'] };
  }
  object.velX = velX;
  object.velZ = velZ;
  return requireOnePlayer(project, { ok: true, project: next, issues: [] });
}

export function groupObjects(project, ids, groupId) {
  if (typeof groupId !== 'string' || !ID_RE.test(groupId)) {
    return { ok: false, project, issues: ['groupId is not a safe id'] };
  }
  const wanted = new Set(ids || []);
  if (wanted.size < 2) return { ok: false, project, issues: ['group needs at least two ids'] };
  const next = cloneScene(project);
  if (!next) return refuseUnstored(project);
  let n = 0;
  for (const object of next.objects) {
    if (wanted.has(object.id)) {
      object.groupId = groupId;
      n += 1;
    }
  }
  if (n !== wanted.size) return { ok: false, project, issues: ['group id missing from the scene'] };
  return requireOnePlayer(project, { ok: true, project: next, issues: [] });
}

export function ungroupObjects(project, ids) {
  const refused = refuseLiveObjects(project);
  if (refused) return refused;
  const wanted = new Set(expandIds(project, ids));
  const next = cloneScene(project);
  if (!next) return refuseUnstored(project);
  for (const object of next.objects) {
    if (wanted.has(object.id)) delete object.groupId;
  }
  return requireOnePlayer(project, { ok: true, project: next, issues: [] });
}

export function snapCoord(n, grid) {
  if (!grid || !grid.snap || !(grid.size > 0)) return round6(n);
  return round6(Math.round(n / grid.size) * grid.size);
}

export function round6(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return x;
  return Math.round(x * 1e6) / 1e6;
}

function applySnap(object, grid) {
  let next;
  try {
    next = clone(object);
  } catch (error) {
    return null;
  }
  if (!next || typeof next !== 'object' || Array.isArray(next)) return null;
  if (Number.isFinite(next.x)) next.x = snapCoord(next.x, grid);
  if (Number.isFinite(next.z)) next.z = snapCoord(next.z, grid);
  return next;
}

export function worldToScreen(x, z, camera, view) {
  const zoom = camera.zoom || 1;
  return {
    sx: view.width / 2 + (x - camera.x) * zoom,
    sy: view.height / 2 - (z - camera.z) * zoom,
  };
}

export function screenToWorld(sx, sy, camera, view) {
  const zoom = camera.zoom || 1;
  return {
    x: camera.x + (sx - view.width / 2) / zoom,
    z: camera.z - (sy - view.height / 2) / zoom,
  };
}

export function hitTest(project, sx, sy, camera, view) {
  const objects = [...asObjectList(project && project.objects)].reverse();
  for (const object of objects) {
    if (!Number.isFinite(object.x) || !Number.isFinite(object.z)) continue;
    const { sx: ox, sy: oy } = worldToScreen(object.x, object.z, camera, view);
    const radius = Math.max(10, (Number(object.radius) || 8) * (camera.zoom || 1) * 0.35);
    const dx = sx - ox;
    const dy = sy - oy;
    if (dx * dx + dy * dy <= (radius + 8) * (radius + 8)) return object.id;
  }
  return null;
}

export function setCamera(project, camera) {
  const next = cloneScene(project);
  if (!next) return project;
  next.camera = { ...(next.camera || {}), ...camera };
  if (playerCanonIssues(next).length) return project;
  return next;
}

export function projectIssues(project) {
  const issues = [];
  if (!project || project.schema !== PROJECT_SCHEMA) {
    issues.push(`schema must be ${PROJECT_SCHEMA}`);
    return issues;
  }
  if (typeof project.id !== 'string' || !/^[a-z][a-z0-9_.:-]*$/i.test(project.id)) {
    issues.push('project id must match the lab id pattern');
  }
  if (!Number.isFinite(project.seed)) issues.push('seed must be a finite number');
  if (!Number.isInteger(project.ticks) || project.ticks < 1) issues.push('ticks must be a positive integer');
  const ids = new Set();
  for (const object of asObjectList(project && project.objects)) {
    if (object && ids.has(object.id)) issues.push(`duplicate id "${object.id}"`);
    if (object && object.id) ids.add(object.id);
  }
  issues.push(...playerCanonIssues(project));
  return issues;
}

export function sortedClone(value) {
  let stored;
  try {
    stored = clone(value);
  } catch (error) {
    return value;
  }
  if (stored == null || typeof stored !== 'object' || Array.isArray(stored)) return value;
  if (playerCanonIssues(stored).length) return value;
  return sortValue(stored);
}

export function savedProjectText(project) {
  const stored = cloneScene(project);
  if (!stored) return { ok: false, issues: ['scene could not be cloned'], text: null };
  const issues = playerCanonIssues(stored);
  if (issues.length) return { ok: false, issues, text: null };
  return { ok: true, issues: [], text: JSON.stringify(stored, null, 2) };
}

export function saveRequestBody(project) {
  const download = savedProjectText(project);
  if (!download.ok) return { ok: false, issues: download.issues, body: null };
  try {
    return { ok: true, issues: [], body: JSON.stringify({ project: JSON.parse(download.text) }) };
  } catch (error) {
    return { ok: false, issues: ['scene could not be saved'], body: null };
  }
}

export function postRequestBody(body) {
  const download = saveRequestBody(body && body.project);
  if (!download.ok) return { ok: false, issues: download.issues, body: null };
  try {
    const parsed = JSON.parse(download.body);
    const envelope = {};
    if (body && typeof body === 'object') {
      for (const key of Object.keys(body)) {
        if (key === 'project') continue;
        envelope[key] = body[key];
      }
    }
    envelope.project = parsed.project;
    return { ok: true, issues: [], body: JSON.stringify(envelope) };
  } catch (error) {
    return { ok: false, issues: ['scene could not be cloned'], body: null };
  }
}

export function formatReport(value) {
  const issues = [];
  if (value && Array.isArray(value.issues)) {
    for (const issue of value.issues) {
      try {
        issues.push(String(issue));
      } catch (error) {
        issues.push('issue');
      }
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    let detail = 'scene could not be cloned';
    if (!issues.length) {
      try {
        detail = String(error && error.message);
      } catch (inner) {
        detail = 'scene could not be cloned';
      }
    }
    return JSON.stringify({ ok: false, issues: issues.length ? issues : [detail] }, null, 2);
  }
}

export function copyScene(project) {
  try {
    return structuredClone(project);
  } catch (error) {
    return null;
  }
}
