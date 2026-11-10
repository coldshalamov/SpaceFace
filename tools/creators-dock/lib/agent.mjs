// JSON request/response factory. Edits use the same scene ops as the editor.
// exportProject is the validator; this module does not write catalogs.

import { getComposition } from './compositions.mjs';
import { commit, createHistory, redo, undo } from './history.mjs';
import {
  addObject,
  clone,
  cloneObject,
  deleteObjects,
  emptyProject,
  groupObjects,
  nudgeObjects,
  REQUEST_SCHEMA,
  RESPONSE_SCHEMA,
  setVelocity,
  ungroupObjects,
} from './scene.mjs';

export function applyRequest(request) {
  if (!request || request.schema !== REQUEST_SCHEMA || !Array.isArray(request.ops)) {
    return response(false, null, ['request schema must be spaceface.creatorsDockRequest.v1 with ops[]']);
  }
  let history = null;
  const applied = [];
  for (let index = 0; index < request.ops.length; index += 1) {
    const op = request.ops[index];
    const label = `ops[${index}]`;
    if (!op || typeof op.op !== 'string') {
      return response(false, history && history.present, [`${label}: op is required`], applied);
    }
    if (op.op === 'create') {
      history = createHistory(emptyProject(op.project || {}));
      applied.push(op.op);
      continue;
    }
    if (op.op === 'loadExample') {
      const project = getComposition(op.id);
      if (!project) return response(false, null, [`${label}: unknown example "${op.id}"`], applied);
      history = createHistory(project);
      applied.push(op.op);
      continue;
    }
    if (!history) return response(false, null, [`${label}: no project yet`], applied);
    if (op.op === 'undo') {
      history = undo(history);
      applied.push(op.op);
      continue;
    }
    if (op.op === 'redo') {
      history = redo(history);
      applied.push(op.op);
      continue;
    }
    const step = applyOp(history.present, op);
    if (!step.ok) {
      return response(false, history.present, step.issues.map((issue) => `${label}: ${issue}`), applied);
    }
    history = commit(history, step.project);
    applied.push(op.op);
  }
  if (!history) return response(false, null, ['request has no create or loadExample'], applied);
  return response(true, history.present, [], applied);
}

function applyOp(project, op) {
  switch (op.op) {
    case 'addObject':
      return addObject(project, op.object);
    case 'clone':
      return cloneObject(project, op.id, op.newId);
    case 'delete':
      return deleteObjects(project, op.ids || [op.id]);
    case 'nudge':
      return nudgeObjects(project, op.ids || [op.id], Number(op.dx) || 0, Number(op.dz) || 0);
    case 'setVelocity':
      return setVelocity(project, op.id, op.velX, op.velZ);
    case 'group':
      return groupObjects(project, op.ids, op.groupId);
    case 'ungroup':
      return ungroupObjects(project, op.ids || [op.id]);
    case 'setFrames':
      if (!Array.isArray(op.frames)) return { ok: false, project, issues: ['frames must be an array'] };
      return { ok: true, project: merge(project, { frames: op.frames }), issues: [] };
    case 'setMeta':
      return { ok: true, project: merge(project, op.meta || {}), issues: [] };
    case 'setWorld':
      return { ok: true, project: merge(project, { world: { ...project.world, ...(op.world || {}) } }), issues: [] };
    case 'setNotes':
      return { ok: true, project: merge(project, { notes: { ...project.notes, ...(op.notes || {}) } }), issues: [] };
    case 'setEncounter':
      return { ok: true, project: merge(project, { encounter: op.encounter || null }), issues: [] };
    case 'setWeapon':
      return { ok: true, project: merge(project, { weapon: op.weapon || null }), issues: [] };
    case 'setPlace':
      return { ok: true, project: merge(project, { place: op.place || null }), issues: [] };
    case 'setModule':
      return { ok: true, project: merge(project, { module: op.module || null }), issues: [] };
    default:
      return { ok: false, project, issues: [`unknown op "${op.op}"`] };
  }
}

function merge(project, patch) {
  const next = clone(project);
  for (const [key, value] of Object.entries(patch || {})) {
    if (value !== undefined) next[key] = clone(value);
  }
  return next;
}

function response(ok, project, issues, applied = []) {
  return {
    schema: RESPONSE_SCHEMA,
    ok,
    project: project ? clone(project) : null,
    issues,
    applied,
  };
}

export { RESPONSE_SCHEMA };
