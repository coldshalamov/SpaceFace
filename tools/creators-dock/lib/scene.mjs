// Pure XZ scene model for Creator's Dock.
// No Node builtins, no physics step. The lab is the only simulator.

import { sameJson, sortValue } from './stableJson.mjs';

export const PROJECT_SCHEMA = 'spaceface.creatorsDock.v1';
export const REQUEST_SCHEMA = 'spaceface.creatorsDockRequest.v1';
export const RESPONSE_SCHEMA = 'spaceface.creatorsDockResponse.v1';
export const EXPORT_SCHEMA = 'spaceface.creatorsDockExport.v1';

export const ID_RE = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;

const ACTOR_KEYS = [
  'id', 'kind', 'role', 'profile', 'x', 'z', 'heading', 'velX', 'velZ',
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

export function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
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
  return (project.objects || []).find((object) => object.id === id) || null;
}

export function actorsOf(project) {
  return (project.objects || []).filter((object) => object.kind === 'actor');
}

export function issuesForObject(object) {
  const issues = [];
  if (!object || typeof object !== 'object' || Array.isArray(object)) {
    return ['object must be a plain object'];
  }
  if (!OBJECT_KEY_SETS[object.kind]) {
    issues.push(`unknown object kind "${object.kind}"`);
    return issues;
  }
  const allowed = new Set(OBJECT_KEY_SETS[object.kind]);
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) issues.push(`unknown field "${key}" on ${object.kind}`);
  }
  if (typeof object.id !== 'string' || !ID_RE.test(object.id)) {
    issues.push('id must match [A-Za-z_][A-Za-z0-9_-]{0,63}');
  }
  return issues;
}

export function addObject(project, object) {
  const issues = issuesForObject(object);
  if (objectById(project, object && object.id)) issues.push(`duplicate id "${object && object.id}"`);
  if (issues.length) return { ok: false, project, issues };
  const next = clone(project);
  const placed = applySnap(clone(object), next.grid);
  next.objects = [...(next.objects || []), placed];
  return { ok: true, project: next, issues: [] };
}

export function replaceObject(project, id, object) {
  const issues = issuesForObject(object);
  if (object.id !== id) issues.push('replacement id must match the edited id');
  if (!objectById(project, id)) issues.push(`missing id "${id}"`);
  if (issues.length) return { ok: false, project, issues };
  const next = clone(project);
  next.objects = next.objects.map((entry) => (entry.id === id ? applySnap(object, next.grid) : entry));
  return { ok: true, project: next, issues: [] };
}

export function deleteObjects(project, ids) {
  const drop = new Set(ids || []);
  const next = clone(project);
  const before = next.objects.length;
  next.objects = next.objects.filter((object) => !drop.has(object.id));
  if (next.objects.length === before) return { ok: false, project, issues: ['nothing deleted'] };
  return { ok: true, project: next, issues: [] };
}

export function cloneObject(project, id, newId) {
  const source = objectById(project, id);
  if (!source) return { ok: false, project, issues: [`missing id "${id}"`] };
  if (typeof newId !== 'string' || !ID_RE.test(newId)) {
    return { ok: false, project, issues: ['newId is not a safe id'] };
  }
  const copy = clone(source);
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
  const groups = new Set();
  for (const object of project.objects || []) {
    if (wanted.has(object.id) && object.groupId) groups.add(object.groupId);
  }
  const out = new Set(wanted);
  for (const object of project.objects || []) {
    if (object.groupId && groups.has(object.groupId)) out.add(object.id);
  }
  return [...out];
}

export function nudgeObjects(project, ids, dx, dz) {
  const move = new Set(expandIds(project, ids));
  if (!move.size) return { ok: false, project, issues: ['nothing to nudge'] };
  const next = clone(project);
  for (const object of next.objects) {
    if (!move.has(object.id)) continue;
    if (!Number.isFinite(object.x) || !Number.isFinite(object.z)) continue;
    object.x = snapCoord(object.x + dx, next.grid);
    object.z = snapCoord(object.z + dz, next.grid);
  }
  return { ok: true, project: next, issues: [] };
}

export function setVelocity(project, id, velX, velZ) {
  const next = clone(project);
  const object = objectById(next, id);
  if (!object || object.kind !== 'actor') {
    return { ok: false, project, issues: [`"${id}" is not an actor`] };
  }
  if (!Number.isFinite(velX) || !Number.isFinite(velZ)) {
    return { ok: false, project, issues: ['velocity must be finite'] };
  }
  object.velX = velX;
  object.velZ = velZ;
  return { ok: true, project: next, issues: [] };
}

export function groupObjects(project, ids, groupId) {
  if (typeof groupId !== 'string' || !ID_RE.test(groupId)) {
    return { ok: false, project, issues: ['groupId is not a safe id'] };
  }
  const wanted = new Set(ids || []);
  if (wanted.size < 2) return { ok: false, project, issues: ['group needs at least two ids'] };
  const next = clone(project);
  let n = 0;
  for (const object of next.objects) {
    if (wanted.has(object.id)) {
      object.groupId = groupId;
      n += 1;
    }
  }
  if (n !== wanted.size) return { ok: false, project, issues: ['group id missing from the scene'] };
  return { ok: true, project: next, issues: [] };
}

export function ungroupObjects(project, ids) {
  const wanted = new Set(expandIds(project, ids));
  const next = clone(project);
  for (const object of next.objects) {
    if (wanted.has(object.id)) delete object.groupId;
  }
  return { ok: true, project: next, issues: [] };
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
  const next = clone(object);
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
  const objects = [...(project.objects || [])].reverse();
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
  const next = clone(project);
  next.camera = { ...next.camera, ...camera };
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
  let players = 0;
  for (const object of project.objects || []) {
    for (const issue of issuesForObject(object)) issues.push(`${object && object.id}: ${issue}`);
    if (object && ids.has(object.id)) issues.push(`duplicate id "${object.id}"`);
    if (object && object.id) ids.add(object.id);
    if (object && object.kind === 'actor' && object.isPlayer) players += 1;
  }
  if (players !== 1) issues.push(`scene needs exactly one player actor (found ${players})`);
  return issues;
}

export function sortedClone(value) {
  return sortValue(clone(value));
}
