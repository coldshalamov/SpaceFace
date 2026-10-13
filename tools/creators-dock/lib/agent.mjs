// JSON request/response factory. Edits use the same scene ops as the editor.
// exportProject is the validator; this module does not write catalogs.

import { getComposition } from './compositions.mjs';
import { commit, loadExampleHistory, newDockHistory, restoreHistory } from './history.mjs';
import {
  addObject,
  clone,
  cloneObject,
  deleteObjects,
  groupObjects,
  nudgeObjects,
  REQUEST_SCHEMA,
  requireOnePlayer,
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
      const createdHistory = newDockHistory(op.project || {});
      const created = requireOnePlayer(createdHistory && createdHistory.present, {
        ok: true,
        project: createdHistory && createdHistory.present,
        issues: [],
      });
      if (!created.ok || !createdHistory || createdHistory.present == null) {
        const issues = created.issues && created.issues.length ? created.issues : ['scene could not be cloned'];
        return response(false, history && history.present, issues.map((issue) => `${label}: ${issue}`), applied);
      }
      history = createdHistory;
      applied.push(op.op);
      continue;
    }
    if (op.op === 'loadExample') {
      const project = getComposition(op.id);
      if (!project) return response(false, null, [`${label}: unknown example "${op.id}"`], applied);
      const loaded = loadExampleHistory(project);
      if (!loaded.ok) {
        return response(false, history && history.present, loaded.issues.map((issue) => `${label}: ${issue}`), applied);
      }
      history = loaded.history;
      applied.push(op.op);
      continue;
    }
    if (!history) return response(false, null, [`${label}: no project yet`], applied);
    if (op.op === 'undo' || op.op === 'redo') {
      const restored = restoreHistory(history, op.op);
      if (!restored.ok) {
        return response(false, history.present, restored.issues.map((issue) => `${label}: ${issue}`), applied);
      }
      history = restored.history;
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
  const gate = requireOnePlayer(history.present, { ok: true, project: history.present, issues: [] });
  if (!gate.ok) return response(false, history.present, gate.issues, applied);
  return response(true, history.present, [], applied);
}

function applyOp(project, op) {
  const step = dispatchOp(project, op);
  if (!step || step.ok === false) return step;
  return requireOnePlayer(project, step);
}

function dispatchOp(project, op) {
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
      return merged(project, { frames: op.frames });
    case 'setMeta':
      return merged(project, op.meta || {});
    case 'setWorld':
      return merged(project, { world: { ...project.world, ...(op.world || {}) } });
    case 'setNotes':
      return merged(project, { notes: { ...project.notes, ...(op.notes || {}) } });
    case 'setEncounter':
      return merged(project, { encounter: op.encounter || null });
    case 'setWeapon':
      return merged(project, { weapon: op.weapon || null });
    case 'setPlace':
      return merged(project, { place: op.place || null });
    case 'setModule':
      return merged(project, { module: op.module || null });
    default:
      return { ok: false, project, issues: [`unknown op "${op.op}"`] };
  }
}

function merge(project, patch) {
  const next = clone(project);
  if (!next || typeof next !== 'object' || Array.isArray(next)) return project;
  for (const [key, value] of Object.entries(patch || {})) {
    if (value === undefined) continue;
    if (value != null && typeof value === 'object') {
      const copied = clone(value);
      if (copied == null || typeof copied !== 'object') return project;
      next[key] = copied;
      continue;
    }
    next[key] = value;
  }
  return next;
}

function merged(project, patch) {
  const next = merge(project, patch);
  if (next === project) {
    const probe = clone(project);
    if (probe == null || typeof probe !== 'object' || Array.isArray(probe)) {
      return { ok: false, project, issues: ['scene could not be cloned'] };
    }
  }
  return { ok: true, project: next, issues: [] };
}

export function applyDockOp(project, op) {
  return applyOp(project, op);
}

function response(ok, project, issues, applied = []) {
  if (!project) return { schema: RESPONSE_SCHEMA, ok, project: null, issues, applied };
  const stored = clone(project);
  return {
    schema: RESPONSE_SCHEMA,
    ok,
    project: stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : project,
    issues,
    applied,
  };
}

export { RESPONSE_SCHEMA };
