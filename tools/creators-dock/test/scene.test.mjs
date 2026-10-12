import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { applyRequest } from '../lib/agent.mjs';
import { compositionIds, getComposition } from '../lib/compositions.mjs';
import { commit, createHistory, undo } from '../lib/history.mjs';
import { resolveDockRead, resolveWorkspace } from '../lib/paths.mjs';
import { inspectValue } from '../lib/security.mjs';
import {
  cloneObject,
  deleteObjects,
  expandIds,
  groupObjects,
  nudgeObjects,
  objectById,
  projectIssues,
} from '../lib/scene.mjs';
import { stableStringify } from '../lib/stableJson.mjs';

test('undo restores a nudged actor and clone is not the player', () => {
  const project = getComposition('dock.intercept-cargo');
  const startX = objectById(project, 'cargo').x;
  let history = createHistory(project);
  const moved = nudgeObjects(history.present, ['cargo'], 10, 0);
  assert.equal(moved.ok, true);
  history = commit(history, moved.project);
  assert.notEqual(objectById(history.present, 'cargo').x, startX);
  history = undo(history);
  assert.equal(objectById(history.present, 'cargo').x, startX);

  const copied = cloneObject(project, 'cargo', 'cargo_copy');
  assert.equal(copied.ok, true);
  assert.equal(objectById(copied.project, 'cargo_copy').isPlayer, false);
  assert.notEqual(objectById(copied.project, 'cargo_copy').x, objectById(project, 'cargo').x);
});

test('grouping moves every member and deleting the player fails the scene check', () => {
  const project = getComposition('dock.collision-chain');
  const ids = expandIds(project, ['rock_a']);
  assert.deepEqual(ids.sort(), ['rock_a', 'rock_b', 'rock_c']);
  const moved = nudgeObjects(project, ['rock_b'], 10, 0);
  assert.equal(objectById(moved.project, 'rock_a').x, 50);
  assert.equal(objectById(moved.project, 'rock_c').x, 90);
  const removed = deleteObjects(project, ['player']);
  assert.equal(projectIssues(removed.project).some((issue) => issue.includes('exactly one player')), true);
});

test('group and ungroup are explicit', () => {
  const project = getComposition('dock.legal-release');
  const grouped = groupObjects(project, ['player', 'pod'], 'pair');
  assert.equal(grouped.ok, true);
  assert.equal(objectById(grouped.project, 'pod').groupId, 'pair');
});

test('unsafe script text and prototype keys are rejected', () => {
  const scripted = { description: 'eval(alert(1))' };
  assert.equal(inspectValue(scripted).some((issue) => issue.includes('unsafe script')), true);
  const polluted = JSON.parse('{"constructor":{"polluted":true}}');
  assert.equal(inspectValue(polluted).some((issue) => issue.includes('banned key')), true);
});

test('workspace paths reject traversal and absolute paths', () => {
  assert.equal(resolveWorkspace('../outside').ok, false);
  assert.equal(resolveWorkspace('/tmp/creators-dock-escape').ok, false);
  assert.equal(resolveDockRead('public/index.html').ok, true);
  assert.equal(resolveDockRead('../../etc/passwd').ok, false);
});

test('materialized example files match the module', () => {
  for (const id of compositionIds()) {
    const onDisk = JSON.parse(fs.readFileSync(new URL(`../examples/${id}.dock.json`, import.meta.url), 'utf8'));
    assert.equal(stableStringify(onDisk), stableStringify(getComposition(id)));
  }
});

test('three agent requests are deterministic and the undo puts the rock back', () => {
  for (const file of ['01-create.json', '02-edit.json', '03-undo.json']) {
    const request = JSON.parse(fs.readFileSync(new URL(`../examples/agent-requests/${file}`, import.meta.url), 'utf8'));
    const a = applyRequest(request);
    const b = applyRequest(request);
    assert.equal(a.ok, true, a.issues.join('\n'));
    assert.equal(stableStringify(a), stableStringify(b));
  }
  const undone = applyRequest(JSON.parse(fs.readFileSync(
    new URL('../examples/agent-requests/03-undo.json', import.meta.url), 'utf8',
  )));
  assert.equal(objectById(undone.project, 'rock').x, 40);
  assert.equal(objectById(undone.project, 'rock').z, 0);
  const edited = applyRequest(JSON.parse(fs.readFileSync(
    new URL('../examples/agent-requests/02-edit.json', import.meta.url), 'utf8',
  )));
  assert.equal(edited.project.id, 'dock.agent-edited-intercept');
  assert.equal(objectById(edited.project, 'cargo_b').isPlayer, false);
  assert.equal(objectById(edited.project, 'cargo_b').velX, -8);
  assert.equal(edited.project.encounter.id, 'dock_agent_edited');
});
