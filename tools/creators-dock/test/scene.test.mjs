import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { applyDockOp, applyRequest } from '../lib/agent.mjs';
import { compositionIds, getComposition } from '../lib/compositions.mjs';
import { loadDialect } from '../lib/dialect.mjs';
import { drawActor } from '../lib/paint.mjs';
import { exportProject } from '../lib/export.mjs';
import { commit, createHistory, loadExampleHistory, newDockHistory, openDockHistory, restoreHistory } from '../lib/history.mjs';
import { TRIGGER_ASSERTION_FIELDS, actorStroke, deletePath, discRadius, fieldStroke, fieldsFor, markerStroke, numberFieldValue, writeFrameInput, writePath } from '../lib/inspector.mjs';
import { evaluateOracleKernel } from '../../../src/testing/lab/oracleKernel.js';
import { resolveDockRead, resolveWorkspace } from '../lib/paths.mjs';
import { byteLength, inspectValue } from '../lib/security.mjs';
import {
  addObject,
  clearPlayerFlag,
  cloneObject,
  deleteObjects,
  expandIds,
  groupObjects,
  nudgeObjects,
  clone,
  emptyProject,
  objectById,
  placePlayer,
  projectIssues,
  replaceObject,
  REQUEST_SCHEMA,
  formatReport,
  postRequestBody,
  saveRequestBody,
  savedProjectText,
  setCamera,
  hitTest,
  worldToScreen,
  setPlayer,
  setVelocity,
  sortedClone,
  ungroupObjects,
} from '../lib/scene.mjs';
import { sameJson, stableStringify } from '../lib/stableJson.mjs';

test('undo restores a nudged actor and clone is not the player', () => {
  const project = getComposition('dock.intercept-cargo');
  const startX = objectById(project, 'cargo').x;
  let history = createHistory(project);
  const moved = nudgeObjects(history.present, ['cargo'], 10, 0);
  assert.equal(moved.ok, true);
  history = commit(history, moved.project);
  assert.notEqual(objectById(history.present, 'cargo').x, startX);
  const restored = restoreHistory(history, 'undo');
  assert.equal(restored.ok, true, (restored.issues || []).join('\n'));
  history = restored.history;
  assert.equal(objectById(history.present, 'cargo').x, startX);
  assert.equal(playerIds(history.present).length, 1);

  const copied = cloneObject(project, 'cargo', 'cargo_copy');
  assert.equal(copied.ok, true);
  assert.equal(objectById(copied.project, 'cargo_copy').isPlayer, false);
  assert.notEqual(objectById(copied.project, 'cargo_copy').x, objectById(project, 'cargo').x);
});

test('grouping moves every member and deleting the only player is refused', () => {
  const project = getComposition('dock.collision-chain');
  const ids = expandIds(project, ['rock_a']);
  assert.deepEqual(ids.sort(), ['rock_a', 'rock_b', 'rock_c']);
  const moved = nudgeObjects(project, ['rock_b'], 10, 0);
  assert.equal(objectById(moved.project, 'rock_a').x, 50);
  assert.equal(objectById(moved.project, 'rock_c').x, 90);
  const broken = getComposition('dock.collision-chain');
  objectById(broken, 'player').isPlayer = false;
  assert.equal(projectIssues(broken).some((issue) => issue.includes('exactly one player')), true);
  const removed = deleteObjects(project, ['player']);
  assert.equal(removed.ok, false);
  assert.equal(removed.issues.some((issue) => issue.includes('exactly one player')), true);
  assert.equal(objectById(removed.project, 'player').isPlayer, true);
  assert.equal(removed.project, project);
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

test('an empty dock can place exactly one player', () => {
  const empty = emptyProject({ id: 'dock.player', title: 'Player', seed: 1 });
  assert.equal(projectIssues(empty).some((issue) => issue.includes('player')), true);
  const placed = placePlayer(empty);
  assert.equal(placed.ok, true, (placed.issues || []).join('\n'));
  assert.equal(projectIssues(placed.project).some((issue) => issue.includes('player')), false);
  const player = objectById(placed.project, placed.id);
  assert.equal(player.isPlayer, true);
  assert.equal(player.profile, 'ship.starter');
  const again = placePlayer(placed.project);
  assert.equal(again.id, placed.id);
  assert.equal(again.project.objects.filter((object) => object.isPlayer).length, 1);
  const named = setPlayer(placed.project, placed.id);
  assert.equal(named.ok, true);
  assert.equal(named.project.objects.filter((object) => object.isPlayer).length, 1);
});

function emptyHistory() {
  return {
    past: [],
    present: emptyProject({ id: 'dock.untitled', title: 'Untitled dock', seed: 1 }),
    future: [],
  };
}

function playerIds(project) {
  return (project.objects || []).filter((object) => object.isPlayer).map((object) => object.id);
}

function secondPlayer(id) {
  return {
    id,
    kind: 'actor',
    role: 'player',
    profile: 'ship.starter',
    x: 20,
    y: 8,
    z: 0,
    heading: 0,
    velX: 0,
    velY: 2.5,
    velZ: 0,
    angularVelocity: 0,
    team: 1,
    isPlayer: true,
    persistent: true,
    label: id,
  };
}

test('addObject and replaceObject refuse a second player', () => {
  const empty = emptyProject({ id: 'dock.player', title: 'Player', seed: 1 });
  const placed = placePlayer(empty);
  assert.equal(placed.ok, true, (placed.issues || []).join('\n'));
  const wingman = addObject(placed.project, secondPlayer('wingman'));
  assert.equal(wingman.ok, false);
  assert.equal(wingman.issues.some((issue) => issue.includes('exactly one player')), true);
  assert.deepEqual(playerIds(wingman.project), [placed.id]);
  assert.equal(objectById(wingman.project, 'wingman'), null);

  const loaded = applyRequest({
    schema: REQUEST_SCHEMA,
    ops: [
      { op: 'loadExample', id: 'dock.intercept-cargo' },
      { op: 'addObject', object: secondPlayer('second_player') },
    ],
  });
  assert.equal(loaded.ok, false);
  assert.equal(loaded.issues.some((issue) => issue.includes('exactly one player')), true);
  assert.deepEqual(playerIds(loaded.project), ['player']);
  assert.equal(objectById(loaded.project, 'second_player'), null);

  const project = getComposition('dock.intercept-cargo');
  const cargo = objectById(project, 'cargo');
  const replaced = replaceObject(project, 'cargo', { ...cargo, isPlayer: true });
  assert.equal(replaced.ok, false);
  assert.equal(replaced.issues.some((issue) => issue.includes('exactly one player')), true);
  assert.deepEqual(playerIds(replaced.project), ['player']);
  assert.equal(objectById(replaced.project, 'cargo').isPlayer, undefined);

  const player = objectById(project, 'player');
  const edited = replaceObject(project, 'player', { ...player, y: 4.5, velY: -1.25 });
  assert.equal(edited.ok, true, edited.issues.join('\n'));
  assert.equal(objectById(edited.project, 'player').y, 4.5);
  assert.equal(objectById(edited.project, 'player').velY, -1.25);
  assert.deepEqual(playerIds(edited.project), ['player']);
});

test('clearing the only player is refused and checking another actor moves the flag', () => {
  const project = getComposition('dock.intercept-cargo');
  const cleared = clearPlayerFlag(project, 'player');
  assert.equal(cleared.ok, false);
  assert.equal(cleared.issues.some((issue) => issue.includes('exactly one player')), true);
  assert.deepEqual(playerIds(cleared.project), ['player']);

  const dropped = replaceObject(project, 'player', { ...objectById(project, 'player'), isPlayer: false });
  assert.equal(dropped.ok, false);
  assert.equal(dropped.issues.some((issue) => issue.includes('exactly one player')), true);
  assert.deepEqual(playerIds(dropped.project), ['player']);

  const moved = setPlayer(project, 'cargo');
  assert.equal(moved.ok, true);
  assert.deepEqual(playerIds(moved.project), ['cargo']);
  const uncleared = clearPlayerFlag(moved.project, 'cargo');
  assert.equal(uncleared.ok, false);
  assert.deepEqual(playerIds(uncleared.project), ['cargo']);
});

function plainActor(id, fields = {}) {
  return {
    id,
    kind: 'actor',
    role: 'prop',
    profile: 'asteroid.light',
    x: 10,
    z: 10,
    heading: 0,
    velX: 0,
    velZ: 0,
    angularVelocity: 0,
    team: 2,
    isPlayer: false,
    persistent: true,
    label: id,
    ...fields,
  };
}

test('addObject refuses a non-player when the scene would not have exactly one player', () => {
  const empty = emptyProject({ id: 'dock.zero', title: 'Zero', seed: 1 });
  const added = addObject(empty, plainActor('cargo'));
  assert.equal(added.ok, false);
  assert.equal(added.issues.some((issue) => issue.includes('exactly one player') && issue.includes('found 0')), true);
  assert.equal(added.project, empty);
  assert.equal(added.project.objects.length, 0);

  const doubled = getComposition('dock.intercept-cargo');
  const player = objectById(doubled, 'player');
  doubled.objects.push({ ...player, id: 'wingman', label: 'wingman' });
  assert.equal(playerIds(doubled).length, 2);
  const extra = addObject(doubled, plainActor('rock'));
  assert.equal(extra.ok, false);
  assert.equal(extra.issues.some((issue) => issue.includes('exactly one player') && issue.includes('found 2')), true);
  assert.equal(extra.project, doubled);
  assert.equal(objectById(extra.project, 'rock'), null);
  assert.equal(playerIds(extra.project).length, 2);
});

test('replaceObject refuses a replace that leaves zero players', () => {
  const bare = emptyProject({ id: 'dock.zero', title: 'Zero', seed: 1 });
  const cargo = plainActor('cargo');
  bare.objects = [cargo];
  const replaced = replaceObject(bare, 'cargo', { ...cargo, label: 'moved', x: 30 });
  assert.equal(replaced.ok, false);
  assert.equal(replaced.issues.some((issue) => issue.includes('exactly one player') && issue.includes('found 0')), true);
  assert.equal(replaced.project, bare);
  assert.equal(objectById(replaced.project, 'cargo').label, 'cargo');
  assert.equal(objectById(replaced.project, 'cargo').x, 10);
  assert.equal(playerIds(replaced.project).length, 0);

  const promoted = replaceObject(bare, 'cargo', { ...cargo, isPlayer: true, role: 'player' });
  assert.equal(promoted.ok, true, promoted.issues.join('\n'));
  assert.deepEqual(playerIds(promoted.project), ['cargo']);
});

function countedProject(count) {
  const project = getComposition('dock.intercept-cargo');
  const player = objectById(project, 'player');
  if (count === 0) player.isPlayer = false;
  if (count >= 2) {
    for (let n = 2; n <= count; n += 1) {
      project.objects.push({ ...player, id: `wingman_${n}`, label: `wingman ${n}` });
    }
  }
  return project;
}

function refused(result, found) {
  assert.equal(result.ok, false);
  assert.equal(result.issues.some((issue) => issue.includes('exactly one player') && issue.includes(`found ${found}`)), true);
  return result;
}

test('placePlayer, clearPlayerFlag, setPlayer, cloneObject, and delete keep exactly one player', () => {
  const doubled = countedProject(2);
  const placed = placePlayer(doubled);
  refused(placed, 2);
  assert.equal(placed.project, doubled);
  assert.equal(playerIds(placed.project).length, 2);

  const bare = emptyProject({ id: 'dock.zero', title: 'Zero', seed: 1 });
  bare.objects = [plainActor('cargo')];
  const clearedIdle = clearPlayerFlag(bare, 'cargo');
  refused(clearedIdle, 0);
  assert.equal(clearedIdle.project, bare);
  assert.equal(playerIds(clearedIdle.project).length, 0);

  const three = countedProject(3);
  const clearedOne = clearPlayerFlag(three, 'wingman_3');
  refused(clearedOne, 2);
  assert.equal(clearedOne.project, three);
  assert.equal(playerIds(clearedOne.project).length, 3);

  const two = countedProject(2);
  const clearedCargo = clearPlayerFlag(two, 'cargo');
  refused(clearedCargo, 2);
  assert.equal(clearedCargo.project, two);
  const repaired = clearPlayerFlag(two, 'wingman_2');
  assert.equal(repaired.ok, true, repaired.issues.join('\n'));
  assert.deepEqual(playerIds(repaired.project), ['player']);

  const twins = countedProject(1);
  const player = objectById(twins, 'player');
  twins.objects.push({ ...player });
  const shared = setPlayer(twins, 'player');
  refused(shared, 2);
  assert.equal(shared.project, twins);
  assert.equal(playerIds(shared.project).length, 2);
  const moved = setPlayer(getComposition('dock.intercept-cargo'), 'cargo');
  assert.equal(moved.ok, true, moved.issues.join('\n'));
  assert.deepEqual(playerIds(moved.project), ['cargo']);

  const cloned = cloneObject(doubled, 'cargo', 'cargo_copy');
  refused(cloned, 2);
  assert.equal(objectById(cloned.project, 'cargo_copy'), null);
  const clonedEmpty = cloneObject(bare, 'cargo', 'cargo_copy');
  refused(clonedEmpty, 0);
  assert.equal(bare.objects.length, 1);

  const removed = deleteObjects(getComposition('dock.intercept-cargo'), ['player']);
  refused(removed, 0);
  assert.equal(objectById(removed.project, 'player').isPlayer, true);
  const cargoGone = deleteObjects(getComposition('dock.intercept-cargo'), ['cargo']);
  assert.equal(cargoGone.ok, true, cargoGone.issues.join('\n'));
  assert.deepEqual(playerIds(cargoGone.project), ['player']);
});

test('edits that do not change the player count still refuse a zero or two player scene', () => {
  for (const count of [0, 2]) {
    const project = countedProject(count);
    const beforeX = objectById(project, 'cargo').x;
    const beforeVel = objectById(project, 'cargo').velX;
    const nudged = nudgeObjects(project, ['cargo'], 10, 0);
    refused(nudged, count);
    assert.equal(nudged.project, project);
    assert.equal(objectById(project, 'cargo').x, beforeX);
    const velocity = setVelocity(project, 'cargo', 3, 4);
    refused(velocity, count);
    assert.equal(objectById(project, 'cargo').velX, beforeVel);
    const grouped = groupObjects(project, ['player', 'cargo'], 'pair');
    refused(grouped, count);
    assert.equal(objectById(project, 'cargo').groupId, undefined);
    const ungrouped = ungroupObjects(project, ['player']);
    refused(ungrouped, count);
    assert.equal(playerIds(ungrouped.project).length, count);
  }
});

test('agent requests do not succeed unless the committed project has exactly one player', () => {
  const draft = { op: 'create', project: { id: 'dock.draft', title: 'Draft', seed: 1 } };
  const created = applyRequest({ schema: REQUEST_SCHEMA, ops: [draft] });
  assert.equal(created.ok, true, (created.issues || []).join('\n'));
  assert.equal(playerIds(created.project).length, 1);
  assert.equal(created.project.objects.find((object) => object.id === 'player').isPlayer, true);

  const undone = applyRequest({ schema: REQUEST_SCHEMA, ops: [draft, { op: 'undo' }] });
  assert.equal(undone.ok, true, (undone.issues || []).join('\n'));
  assert.equal(playerIds(undone.project).length, 1);
  assert.equal(undone.project.objects.find((object) => object.isPlayer === true).isPlayer, true);

  const removed = applyRequest({ schema: REQUEST_SCHEMA, ops: [draft, { op: 'delete', ids: ['player'] }] });
  assert.equal(removed.ok, false);
  assert.equal(removed.issues.some((issue) => issue.includes('exactly one player')), true);
  assert.equal(playerIds(removed.project).length, 1);
  assert.equal(removed.project.objects.find((object) => object.id === 'player').isPlayer, true);

  const emptied = applyRequest({
    schema: REQUEST_SCHEMA,
    ops: [
      { op: 'loadExample', id: 'dock.intercept-cargo' },
      { op: 'setMeta', meta: { objects: [] } },
    ],
  });
  assert.equal(emptied.ok, false);
  assert.equal(emptied.issues.some((issue) => issue.includes('exactly one player') && issue.includes('found 0')), true);
  assert.deepEqual(playerIds(emptied.project), ['player']);

  const body = objectById(getComposition('dock.intercept-cargo'), 'player');
  const doubled = applyRequest({
    schema: REQUEST_SCHEMA,
    ops: [
      { op: 'loadExample', id: 'dock.intercept-cargo' },
      { op: 'setMeta', meta: { objects: [body, { ...body, id: 'wingman', label: 'wingman' }] } },
    ],
  });
  assert.equal(doubled.ok, false);
  assert.equal(doubled.issues.some((issue) => issue.includes('exactly one player') && issue.includes('found 2')), true);
  assert.deepEqual(playerIds(doubled.project), ['player']);

  const sideOps = [
    { op: 'setFrames', frames: [] },
    { op: 'setWorld', world: { credits: 1 } },
    { op: 'setNotes', notes: { creatorsDock: '1' } },
    { op: 'setEncounter', encounter: null },
    { op: 'setWeapon', weapon: null },
    { op: 'setPlace', place: null },
    { op: 'setModule', module: null },
  ];
  for (const op of sideOps) {
    const result = applyRequest({ schema: REQUEST_SCHEMA, ops: [draft, op] });
    assert.equal(result.ok, true, `${op.op}\n${(result.issues || []).join('\n')}`);
    assert.equal(playerIds(result.project).length, 1);
    assert.equal(result.project.objects.find((object) => object.isPlayer === true).isPlayer, true);
  }

  const noted = applyRequest({
    schema: REQUEST_SCHEMA,
    ops: [
      { op: 'loadExample', id: 'dock.intercept-cargo' },
      { op: 'setNotes', notes: { expectedObservation: 'still one player' } },
    ],
  });
  assert.equal(noted.ok, true, noted.issues.join('\n'));
  assert.deepEqual(playerIds(noted.project), ['player']);
});

test('editor and agent cannot install a present by calling undo or redo directly', async () => {
  const historyApi = await import('../lib/history.mjs');
  assert.equal(Object.hasOwn(historyApi, 'undo'), false);
  assert.equal(Object.hasOwn(historyApi, 'redo'), false);
  assert.equal(typeof historyApi.restoreHistory, 'function');

  const root = fileURLToPath(new URL('..', import.meta.url));
  const call = (name) => new RegExp(`\\b${name}\\s*\\(`);
  for (const rel of ['public/editor.js', 'lib/agent.mjs', 'lib/scene.mjs', 'lib/export.mjs', 'test/scene.test.mjs', 'test/export.test.mjs']) {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.equal(call('undo').test(text), false, rel);
    assert.equal(call('redo').test(text), false, rel);
  }

  const empty = emptyHistory();
  const placed = placePlayer(empty.present);
  const committed = commit(empty, placed.project);
  const undone = restoreHistory(committed, 'undo');
  assert.equal(undone.ok, false);
  assert.equal(undone.history, committed);
  assert.equal(playerIds(undone.history.present).length, 1);
  assert.equal(objectById(undone.history.present, 'player').isPlayer, true);
});

test('a no-op undo does not report ok for an empty history', () => {
  const empty = emptyHistory();
  for (const direction of ['undo', 'redo']) {
    const result = restoreHistory(empty, direction);
    assert.equal(result.ok, false, direction);
    assert.equal(result.history, empty);
    assert.equal(playerIds(result.history.present).length, 0);
    assert.equal(result.issues.some((issue) => issue.includes('exactly one player') && issue.includes('found 0')), true);
  }
});

test('editor and agent undo do not present zero players', () => {
  const empty = emptyHistory();
  const placed = placePlayer(empty.present);
  assert.equal(placed.ok, true, (placed.issues || []).join('\n'));
  const committed = commit(empty, placed.project);
  const undone = restoreHistory(committed, 'undo');
  assert.equal(undone.ok, false);
  assert.equal(undone.history, committed);
  assert.equal(playerIds(undone.history.present).length, 1);
  assert.equal(objectById(undone.history.present, placed.id).isPlayer, true);

  const draft = { op: 'create', project: { id: 'dock.draft', title: 'Draft', seed: 1 } };
  const created = applyRequest({ schema: REQUEST_SCHEMA, ops: [draft, { op: 'undo' }] });
  assert.equal(created.ok, true, (created.issues || []).join('\n'));
  assert.equal(playerIds(created.project).length, 1);
  const starter = created.project.objects.find((object) => object.isPlayer === true);
  assert.equal(starter.id, 'player');
  assert.equal(starter.profile, 'ship.starter');
  assert.equal(typeof starter.isPlayer, 'boolean');
  const redone = applyRequest({ schema: REQUEST_SCHEMA, ops: [draft, { op: 'redo' }] });
  assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
  assert.equal(playerIds(redone.project).length, 1);
  assert.equal(redone.project.objects.find((object) => object.isPlayer === true).isPlayer, true);
});

test('New does not leave a zero-player scene and undo will not restore one', () => {
  const created = newDockHistory({ id: 'dock.untitled', title: 'Untitled dock', seed: 1 });
  assert.equal(created.past.length, 0);
  assert.equal(playerIds(created.present).length, 1);
  assert.equal(projectIssues(created.present).some((issue) => issue.includes('exactly one player')), false);
  const freshUndo = restoreHistory(created, 'undo');
  assert.equal(freshUndo.ok, true);
  assert.equal(freshUndo.history, created);
  assert.equal(playerIds(freshUndo.history.present).length, 1);

  const empty = emptyHistory();
  const placed = placePlayer(empty.present);
  assert.equal(placed.ok, true, (placed.issues || []).join('\n'));
  const committed = commit(empty, placed.project);
  const undone = restoreHistory(committed, 'undo');
  assert.equal(undone.ok, false);
  assert.equal(undone.history, committed);
  assert.equal(undone.issues.some((issue) => issue.includes('exactly one player') && issue.includes('found 0')), true);
  assert.equal(playerIds(undone.history.present).length, 1);

  const redone = restoreHistory({
    past: [],
    present: committed.present,
    future: [empty.present],
  }, 'redo');
  assert.equal(redone.ok, false);
  assert.equal(redone.history.present, committed.present);
  assert.equal(playerIds(redone.history.present).length, 1);

  const project = getComposition('dock.intercept-cargo');
  const startX = objectById(project, 'cargo').x;
  let history = createHistory(project);
  const moved = nudgeObjects(history.present, ['cargo'], 10, 0);
  history = commit(history, moved.project);
  const back = restoreHistory(history, 'undo');
  assert.equal(back.ok, true, back.issues.join('\n'));
  assert.equal(objectById(back.history.present, 'cargo').x, startX);
  assert.equal(playerIds(back.history.present).length, 1);
  const forward = restoreHistory(back.history, 'redo');
  assert.equal(forward.ok, true, forward.issues.join('\n'));
  assert.equal(objectById(forward.history.present, 'cargo').x, objectById(history.present, 'cargo').x);
  assert.equal(playerIds(forward.history.present).length, 1);
});

test('Infinity player flags are rejected before clone on add, replace, and clone', () => {
  for (const flag of [Infinity, -Infinity]) {
    const empty = emptyProject({ id: 'dock.infinite', title: 'Infinite', seed: 1 });
    const added = addObject(empty, plainActor('player', { role: 'player', isPlayer: flag, team: 0 }));
    assert.equal(added.ok, false);
    assert.equal(added.project, empty);
    assert.equal(added.project.objects.length, 0);
    assert.equal(added.issues.some((issue) => issue.includes('isPlayer must be a boolean')), true);
    assert.equal(added.project.objects.some((object) => object.isPlayer == null), false);

    const scene = getComposition('dock.intercept-cargo');
    objectById(scene, 'player').isPlayer = flag;
    const cargo = objectById(scene, 'cargo');
    const replaced = replaceObject(scene, 'cargo', { ...cargo, label: 'still cargo' });
    assert.equal(replaced.ok, false);
    assert.equal(replaced.project, scene);
    assert.equal(objectById(replaced.project, 'player').isPlayer, flag);
    assert.equal(replaced.issues.some((issue) => issue.includes('isPlayer must be a boolean')), true);

    const cloned = cloneObject(scene, 'cargo', 'cargo_copy');
    assert.equal(cloned.ok, false);
    assert.equal(cloned.project, scene);
    assert.equal(objectById(cloned.project, 'cargo_copy'), null);
    assert.equal(objectById(cloned.project, 'player').isPlayer, flag);
    assert.equal(cloned.issues.some((issue) => issue.includes('isPlayer must be a boolean')), true);
  }

  const scene = getComposition('dock.intercept-cargo');
  const copied = cloneObject(scene, 'cargo', 'cargo_bool');
  assert.equal(copied.ok, true, copied.issues.join('\n'));
  assert.equal(objectById(copied.project, 'player').isPlayer, true);
  assert.equal(typeof objectById(copied.project, 'player').isPlayer, 'boolean');
  assert.equal(playerIds(copied.project).length, 1);
});

test('non-boolean player flags cannot ride along with one real player', () => {
  const scene = getComposition('dock.intercept-cargo');
  objectById(scene, 'cargo').isPlayer = null;
  const added = addObject(scene, plainActor('rock'));
  assert.equal(added.ok, false);
  assert.equal(added.project, scene);
  assert.equal(objectById(added.project, 'rock'), null);
  assert.equal(objectById(added.project, 'cargo').isPlayer, null);
  assert.equal(added.issues.some((issue) => issue.includes('isPlayer must be a boolean')), true);

  const replaced = replaceObject(scene, 'cargo', { ...objectById(scene, 'cargo'), label: 'still cargo' });
  assert.equal(replaced.ok, false);
  assert.equal(replaced.project, scene);
  assert.equal(objectById(replaced.project, 'cargo').isPlayer, null);

  for (const flag of [Infinity, -Infinity, 1, 'yes', 'false']) {
    const flagged = getComposition('dock.intercept-cargo');
    objectById(flagged, 'player').isPlayer = flag;
    const placed = placePlayer(flagged);
    assert.equal(placed.ok, false, String(flag));
    assert.equal(placed.project, flagged);
    assert.equal(objectById(placed.project, 'player').isPlayer, flag);
    assert.equal(placed.issues.some((issue) => issue.includes('isPlayer must be a boolean')), true);
  }

  const nulled = getComposition('dock.intercept-cargo');
  objectById(nulled, 'cargo').isPlayer = null;
  const beside = placePlayer(nulled);
  assert.equal(beside.ok, false);
  assert.equal(beside.project, nulled);
  assert.equal(objectById(beside.project, 'cargo').isPlayer, null);
  assert.equal(objectById(beside.project, 'player').isPlayer, true);

  const host = getComposition('dock.intercept-cargo');
  const boxed = plainActor('ghost');
  boxed.kind = new String('actor');
  boxed.isPlayer = null;
  const boxedAdd = addObject(host, boxed);
  assert.equal(boxedAdd.ok, false);
  assert.equal(boxedAdd.project, host);
  assert.equal(objectById(host, 'ghost'), null);
  const boxedReplace = replaceObject(host, 'cargo', { ...objectById(host, 'cargo'), kind: new String('actor'), isPlayer: null });
  assert.equal(boxedReplace.ok, false);
  assert.equal(boxedReplace.project, host);
  assert.equal(objectById(host, 'cargo').isPlayer, undefined);
  const boxedSource = getComposition('dock.intercept-cargo');
  objectById(boxedSource, 'cargo').kind = new String('actor');
  objectById(boxedSource, 'cargo').isPlayer = null;
  const boxedClone = cloneObject(boxedSource, 'cargo', 'cargo_copy');
  assert.equal(boxedClone.ok, false);
  assert.equal(boxedClone.project, boxedSource);
  assert.equal(objectById(boxedSource, 'cargo_copy'), null);

  const sneaky = plainActor('sneaky', { isPlayer: false });
  Object.defineProperty(sneaky, 'toJSON', {
    enumerable: false,
    value() {
      const body = { ...this };
      body.isPlayer = null;
      return body;
    },
  });
  const sneaked = addObject(getComposition('dock.intercept-cargo'), sneaky);
  assert.equal(sneaked.ok, false);
  assert.equal(objectById(sneaked.project, 'sneaky'), null);
  assert.equal(playerIds(sneaked.project).length, 1);

  const good = getComposition('dock.intercept-cargo');
  const bad = structuredClone(good);
  objectById(bad, 'cargo').isPlayer = null;
  const history = createHistory(good);
  assert.equal(commit(history, bad), history);
  assert.equal(objectById(history.present, 'cargo').isPlayer, undefined);
  const opened = openDockHistory(bad);
  assert.equal(opened.ok, false);
  assert.equal(opened.history, null);
  assert.equal(opened.issues.some((issue) => issue.includes('isPlayer must be a boolean')), true);
  const stored = {
    past: [bad],
    present: good,
    future: [bad],
  };
  const undone = restoreHistory(stored, 'undo');
  assert.equal(undone.ok, false);
  assert.equal(undone.history, stored);
  assert.equal(objectById(undone.history.present, 'cargo').isPlayer, undefined);
  const redone = restoreHistory(stored, 'redo');
  assert.equal(redone.ok, false);
  assert.equal(redone.history, stored);
  assert.equal(objectById(redone.history.present, 'player').isPlayer, true);
  const stuck = restoreHistory({ past: [], present: bad, future: [] }, 'undo');
  assert.equal(stuck.ok, false);
  assert.equal(stuck.history.present, bad);

  const fresh = newDockHistory({ id: 'dock.untitled', title: 'Untitled dock', seed: 1 });
  assert.equal(objectById(fresh.present, 'player').isPlayer, true);
  assert.equal(typeof objectById(fresh.present, 'player').isPlayer, 'boolean');
  assert.equal(playerIds(fresh.present).length, 1);
});

test('a player toJSON that clears isPlayer is not committed or opened', () => {
  const project = getComposition('dock.intercept-cargo');
  const player = objectById(project, 'player');
  Object.defineProperty(player, 'toJSON', {
    enumerable: false,
    value() {
      const body = { ...this };
      body.isPlayer = null;
      return body;
    },
  });
  const baseline = createHistory(getComposition('dock.intercept-cargo'));
  const committed = commit(baseline, project);
  assert.equal(committed, baseline);
  assert.equal(committed.present.objects.some((object) => object.isPlayer === null), false);
  assert.equal(objectById(committed.present, 'player').isPlayer, true);

  const opened = openDockHistory(project);
  assert.equal(opened.ok, false);
  assert.equal(opened.history, null);
  assert.equal(opened.issues.some((issue) => issue.includes('isPlayer must be a boolean') || issue.includes('exactly one player')), true);

  const created = createHistory(project);
  assert.equal(created.present, null);
});

function nullFlagToJSON(kind) {
  return {
    enumerable: false,
    value() {
      const body = { ...this };
      if (kind) body.kind = kind;
      body.isPlayer = null;
      return body;
    },
  };
}

test('pan and setCamera do not install a clone that fails the player canon', () => {
  const scene = getComposition('dock.intercept-cargo');
  Object.defineProperty(objectById(scene, 'cargo'), 'toJSON', nullFlagToJSON('trigger'));
  const panned = setCamera(scene, { x: 30, z: 12 });
  assert.equal(panned, scene);
  assert.equal(panned.camera.x, 0);
  assert.equal(objectById(panned, 'cargo').kind, 'actor');
  assert.equal(playerIds(panned).length, 1);
  assert.equal(sortedClone(scene), scene);

  for (const flag of [null, 1, 'yes']) {
    const flagged = getComposition('dock.intercept-cargo');
    Object.defineProperty(objectById(flagged, 'cargo'), 'toJSON', {
      enumerable: false,
      value() {
        const body = { ...this };
        body.isPlayer = flag;
        return body;
      },
    });
    const moved = setCamera(flagged, { zoom: 4 });
    assert.equal(moved, flagged);
    assert.equal(moved.camera.zoom, 3.2);
    assert.equal(objectById(moved, 'player').isPlayer, true);
  }

  const clean = getComposition('dock.intercept-cargo');
  const zoomed = setCamera(clean, { x: 8, z: -6, zoom: 4 });
  assert.equal(zoomed.camera.x, 8);
  assert.equal(zoomed.camera.z, -6);
  assert.equal(playerIds(zoomed).length, 1);
  assert.equal(objectById(zoomed, 'player').isPlayer, true);
});

test('save refuses a toJSON that writes isPlayer null', () => {
  const scene = getComposition('dock.intercept-cargo');
  Object.defineProperty(objectById(scene, 'cargo'), 'toJSON', nullFlagToJSON('trigger'));
  const saved = savedProjectText(scene);
  assert.equal(saved.ok, false);
  assert.equal(saved.text, null);
  assert.equal(saved.issues.some((issue) => issue.includes('isPlayer must be a boolean')), true);
});

function hideIsPlayer(project, place) {
  Object.defineProperty(project, 'toJSON', {
    enumerable: false,
    value() {
      const body = { ...this };
      if (place === 'project') body.isPlayer = null;
      if (place === 'camera') body.camera = { ...this.camera, isPlayer: null };
      if (place === 'overrides') {
        body.objects = this.objects.map((object) => (
          object.isPlayer === true ? { ...object, overrides: { ...(object.overrides || {}), isPlayer: null } } : object
        ));
      }
      return body;
    },
  });
}

test('loadExample refuses a clone that fails the player canon', () => {
  const project = getComposition('dock.intercept-cargo');
  hideIsPlayer(project, 'camera');
  const loaded = loadExampleHistory(project);
  assert.equal(loaded.ok, false);
  assert.equal(loaded.history, null);
  assert.equal(loaded.issues.some((issue) => issue.includes('isPlayer must be a boolean')), true);
  const editor = fs.readFileSync(new URL('../public/editor.js', import.meta.url), 'utf8');
  assert.equal(editor.includes('loadExampleHistory'), true);
  assert.equal(/history = createHistory\(/.test(editor), false);
});

test('camera, project, and override isPlayer null are not installed or saved', () => {
  for (const place of ['camera', 'project', 'overrides']) {
    const scene = getComposition('dock.intercept-cargo');
    hideIsPlayer(scene, place);
    const panned = setCamera(scene, { x: 40, z: 5 });
    assert.equal(panned, scene, place);
    assert.equal(panned.camera.isPlayer, undefined, place);
    assert.equal(objectById(panned, 'player').isPlayer, true, place);
    const history = createHistory(getComposition('dock.intercept-cargo'));
    const committed = commit(history, scene);
    assert.equal(committed, history, place);
    assert.equal(committed.present.camera.isPlayer, undefined, place);
    const saved = savedProjectText(scene);
    assert.equal(saved.ok, false, place);
    assert.equal(saved.text, null, place);
    assert.equal(saved.issues.some((issue) => issue.includes('isPlayer must be a boolean')), true, place);
  }
});

test('sortedClone recounts a schema-dropping toJSON and does not return null', () => {
  const scene = getComposition('dock.intercept-cargo');
  Object.defineProperty(scene, 'toJSON', {
    enumerable: false,
    value() {
      const body = { ...this };
      delete body.schema;
      body.objects = this.objects.map((object) => (
        object.isPlayer === true ? { ...object, isPlayer: null } : object
      ));
      return body;
    },
  });
  const sorted = sortedClone(scene);
  assert.notEqual(sorted, null);
  assert.equal(sorted, scene);
  assert.equal(sorted.schema, 'spaceface.creatorsDock.v1');
  assert.equal(objectById(sorted, 'player').isPlayer, true);

  const wiped = getComposition('dock.intercept-cargo');
  Object.defineProperty(wiped, 'toJSON', {
    enumerable: false,
    value() { return null; },
  });
  assert.equal(sortedClone(wiped), wiped);
  assert.notEqual(sortedClone(wiped), null);
});

test('sortedClone returns the previous value when objects is not iterable', () => {
  const scene = getComposition('dock.intercept-cargo');
  Object.defineProperty(scene, 'toJSON', {
    enumerable: false,
    value() {
      const body = { ...this };
      body.objects = { notAnArray: true };
      return body;
    },
  });
  const sorted = sortedClone(scene);
  assert.equal(sorted, scene);
  assert.equal(Array.isArray(sorted.objects), true);
  assert.equal(objectById(sorted, 'player').isPlayer, true);
});

test('replaceObject returns the previous project when the replacement toJSON is null', () => {
  const scene = getComposition('dock.intercept-cargo');
  const cargo = objectById(scene, 'cargo');
  const replacement = Object.assign(Object.create({
    toJSON() { return null; },
  }), { ...cargo, label: 'broken cargo' });
  const replaced = replaceObject(scene, 'cargo', replacement);
  assert.equal(replaced.ok, false);
  assert.equal(replaced.project, scene);
  assert.equal(objectById(replaced.project, 'cargo').label, cargo.label);
  assert.equal(objectById(replaced.project, 'player').isPlayer, true);
});

test('addObject, setPlayer, and clearPlayerFlag return the previous project when the clone is unusable', () => {
  const shapes = [
    () => null,
    () => ({ objects: { notAnArray: true } }),
    () => ({ objects: null }),
  ];
  for (const produce of shapes) {
    const addedScene = getComposition('dock.intercept-cargo');
    Object.defineProperty(addedScene, 'toJSON', { enumerable: false, value: produce });
    const added = addObject(addedScene, plainActor('rock'));
    assert.equal(added.ok, false);
    assert.equal(added.project, addedScene);
    assert.equal(objectById(added.project, 'rock'), null);

    const setScene = getComposition('dock.intercept-cargo');
    Object.defineProperty(setScene, 'toJSON', { enumerable: false, value: produce });
    const set = setPlayer(setScene, 'cargo');
    assert.equal(set.ok, false);
    assert.equal(set.project, setScene);
    assert.equal(objectById(set.project, 'player').isPlayer, true);

    const clearScene = getComposition('dock.intercept-cargo');
    Object.defineProperty(clearScene, 'toJSON', { enumerable: false, value: produce });
    const cleared = clearPlayerFlag(clearScene, 'player');
    assert.equal(cleared.ok, false);
    assert.equal(cleared.project, clearScene);
    assert.equal(objectById(cleared.project, 'player').isPlayer, true);
  }

  const empty = emptyProject({ id: 'dock.untitled', title: 'Untitled dock', seed: 1 });
  Object.defineProperty(empty, 'toJSON', { enumerable: false, value() { return null; } });
  const placed = placePlayer(empty);
  assert.equal(placed.ok, false);
  assert.equal(placed.project, empty);

  const copiedScene = getComposition('dock.intercept-cargo');
  Object.defineProperty(copiedScene, 'toJSON', { enumerable: false, value() { return null; } });
  const copied = cloneObject(copiedScene, 'cargo', 'cargo_copy');
  assert.equal(copied.ok, false);
  assert.equal(copied.project, copiedScene);
  assert.equal(objectById(copied.project, 'cargo_copy'), null);

  const member = getComposition('dock.intercept-cargo');
  Object.defineProperty(objectById(member, 'cargo'), 'toJSON', {
    enumerable: false,
    value() { return null; },
  });
  const setMember = setPlayer(member, 'player');
  assert.equal(setMember.ok, false);
  assert.equal(setMember.project, member);
  const clearedMember = clearPlayerFlag(member, 'player');
  assert.equal(clearedMember.ok, false);
  assert.equal(clearedMember.project, member);
  assert.equal(objectById(clearedMember.project, 'player').isPlayer, true);
});

test('a throwing toJSON does not escape add, clone, place, set, or clear', () => {
  const boom = {
    enumerable: false,
    value() { throw new Error('boom'); },
  };
  const scene = getComposition('dock.intercept-cargo');
  const rock = Object.assign(Object.create({
    toJSON() { throw new Error('boom'); },
  }), {
    id: 'rock',
    kind: 'actor',
    role: 'prop',
    profile: 'asteroid.light',
    x: 10,
    z: 10,
    heading: 0,
    velX: 0,
    velZ: 0,
    angularVelocity: 0,
    team: 2,
    isPlayer: false,
    persistent: true,
    label: 'rock',
  });
  const added = addObject(scene, rock);
  assert.equal(added.ok, false);
  assert.equal(added.project, scene);
  assert.equal(objectById(added.project, 'rock'), null);

  const copiedScene = getComposition('dock.intercept-cargo');
  Object.defineProperty(objectById(copiedScene, 'cargo'), 'toJSON', boom);
  const copied = cloneObject(copiedScene, 'cargo', 'cargo_copy');
  assert.equal(copied.ok, false);
  assert.equal(copied.project, copiedScene);
  assert.equal(objectById(copied.project, 'cargo_copy'), null);

  const empty = emptyProject({ id: 'dock.untitled', title: 'Untitled dock', seed: 1 });
  Object.defineProperty(empty, 'toJSON', boom);
  const placed = placePlayer(empty);
  assert.equal(placed.ok, false);
  assert.equal(placed.project, empty);

  const existing = getComposition('dock.intercept-cargo');
  Object.defineProperty(objectById(existing, 'cargo'), 'toJSON', boom);
  const again = placePlayer(existing);
  assert.equal(again.ok, false);
  assert.equal(again.project, existing);
  assert.equal(objectById(again.project, 'player').isPlayer, true);

  const setScene = getComposition('dock.intercept-cargo');
  Object.defineProperty(setScene, 'toJSON', boom);
  const set = setPlayer(setScene, 'cargo');
  assert.equal(set.ok, false);
  assert.equal(set.project, setScene);

  const clearScene = getComposition('dock.intercept-cargo');
  Object.defineProperty(clearScene, 'toJSON', boom);
  const cleared = clearPlayerFlag(clearScene, 'player');
  assert.equal(cleared.ok, false);
  assert.equal(cleared.project, clearScene);
  assert.equal(objectById(cleared.project, 'player').isPlayer, true);
});

test('commit, open, and setMeta do not throw when toJSON throws', () => {
  const boom = {
    enumerable: false,
    value() { throw new Error('boom'); },
  };
  const bad = getComposition('dock.intercept-cargo');
  Object.defineProperty(bad, 'toJSON', boom);
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const committed = commit(history, bad);
  assert.equal(committed, history);
  assert.equal(objectById(committed.present, 'player').isPlayer, true);

  const opened = openDockHistory(bad);
  assert.equal(opened.ok, false);
  assert.equal(opened.history, null);

  const created = createHistory(bad);
  assert.equal(created.present, null);

  const meta = applyDockOp(bad, { op: 'setMeta', meta: { title: 'Nope' } });
  assert.equal(meta.ok, false);
  assert.equal(meta.project, bad);
  assert.equal(meta.project.title !== 'Nope', true);
  assert.equal(objectById(meta.project, 'player').isPlayer, true);

  const nulled = getComposition('dock.intercept-cargo');
  Object.defineProperty(nulled, 'toJSON', { enumerable: false, value() { return null; } });
  const nullMeta = applyDockOp(nulled, { op: 'setMeta', meta: { title: 'Nope' } });
  assert.equal(nullMeta.ok, false);
  assert.equal(nullMeta.project, nulled);
});

test('create keeps the previous history when a nested toJSON throws', () => {
  const world = { fixtureProfile: 'empty-flight', toJSON() { throw new Error('boom'); } };
  const result = applyRequest({
    schema: REQUEST_SCHEMA,
    ops: [
      { op: 'loadExample', id: 'dock.intercept-cargo' },
      { op: 'create', project: { id: 'dock.bad', title: 'Bad', seed: 1, world } },
    ],
  });
  assert.equal(result.ok, false);
  assert.notEqual(result.project, null);
  assert.equal(result.project.id, 'dock.intercept-cargo');
  assert.equal(result.project.objects.find((object) => object.isPlayer === true).isPlayer, true);
  assert.equal(result.issues.some((issue) => issue.includes('found 0')), false);
  assert.equal(result.issues.some((issue) => issue.includes('scene could not be cloned')), true);

  const quiet = { fixtureProfile: 'empty-flight', toJSON() { return null; } };
  const nulled = applyRequest({
    schema: REQUEST_SCHEMA,
    ops: [
      { op: 'loadExample', id: 'dock.intercept-cargo' },
      { op: 'create', project: { id: 'dock.bad', title: 'Bad', seed: 1, world: quiet } },
    ],
  });
  assert.equal(nulled.ok, false);
  assert.equal(nulled.project.id, 'dock.intercept-cargo');
  assert.equal(nulled.project.objects.find((object) => object.isPlayer === true).isPlayer, true);
  assert.equal(nulled.issues.some((issue) => issue.includes('found 0')), false);
  assert.equal(nulled.issues.some((issue) => issue.includes('scene could not be cloned')), true);
});

test('the validate post path does not throw when toJSON throws for the project key', () => {
  const scene = getComposition('dock.intercept-cargo');
  Object.defineProperty(scene, 'toJSON', {
    enumerable: false,
    value(key) {
      if (key === 'project') throw new Error('boom');
      const body = { ...this };
      delete body.toJSON;
      return body;
    },
  });
  assert.throws(() => JSON.stringify({ project: scene }));
  let guarded;
  assert.doesNotThrow(() => {
    guarded = postRequestBody({ project: scene });
  });
  assert.equal(guarded.ok, true, (guarded.issues || []).join('\n'));
  assert.equal(typeof guarded.body, 'string');
  const posted = JSON.parse(guarded.body);
  assert.equal(posted.project.objects.find((object) => object.isPlayer === true).isPlayer, true);

  const editor = fs.readFileSync(new URL('../public/editor.js', import.meta.url), 'utf8');
  assert.equal(editor.includes("post('/api/validate'"), true);
  assert.equal(editor.includes('postRequestBody'), true);
  assert.equal(/body:\s*JSON\.stringify\(body\)/.test(editor), false);
});

test('formatReport does not throw when the project toJSON throws', () => {
  const scene = getComposition('dock.intercept-cargo');
  Object.defineProperty(scene, 'toJSON', {
    enumerable: false,
    value() { throw new Error('boom'); },
  });
  const text = formatReport({ ok: false, project: scene, issues: ['scene could not be cloned'] });
  assert.equal(typeof text, 'string');
  assert.equal(text.includes('scene could not be cloned'), true);
  assert.equal(text.includes('boom'), false);
});

test('saveRequestBody does not throw when toJSON throws for the project key', () => {
  const scene = getComposition('dock.intercept-cargo');
  Object.defineProperty(scene, 'toJSON', {
    enumerable: false,
    value(key) {
      if (key === 'project') throw new Error('boom');
      const body = { ...this };
      delete body.toJSON;
      return body;
    },
  });
  const saved = saveRequestBody(scene);
  assert.equal(saved.ok, true, (saved.issues || []).join('\n'));
  assert.equal(typeof saved.body, 'string');
  assert.equal(saved.body.includes('"isPlayer":true'), true);
  const posted = JSON.parse(saved.body);
  assert.equal(posted.project.objects.find((object) => object.isPlayer === true).isPlayer, true);
});

test('deleteObjects returns the previous project when toJSON returns null', () => {
  const scene = getComposition('dock.intercept-cargo');
  Object.defineProperty(objectById(scene, 'cargo'), 'toJSON', {
    enumerable: false,
    value() { return null; },
  });
  const removed = deleteObjects(scene, ['player']);
  assert.equal(removed.ok, false);
  assert.equal(removed.project, scene);
  assert.equal(objectById(removed.project, 'player').isPlayer, true);
  assert.equal(objectById(removed.project, 'cargo').kind, 'actor');
});

test('placePlayer rejects a sibling toJSON that clears isPlayer', () => {
  const scene = getComposition('dock.intercept-cargo');
  const cargo = objectById(scene, 'cargo');
  Object.defineProperty(cargo, 'toJSON', {
    enumerable: false,
    value() {
      const body = { ...this };
      body.isPlayer = null;
      return body;
    },
  });
  const placed = placePlayer(scene);
  assert.equal(placed.ok, false);
  assert.equal(placed.project, scene);
  assert.equal(objectById(placed.project, 'player').isPlayer, true);
  assert.equal(placed.issues.some((issue) => issue.includes('isPlayer must be a boolean')), true);
});

test('a toJSON that turns an actor into a trigger cannot keep isPlayer null', () => {
  const scene = getComposition('dock.intercept-cargo');
  const cargo = objectById(scene, 'cargo');
  Object.defineProperty(cargo, 'toJSON', {
    enumerable: false,
    value() {
      return {
        id: this.id,
        kind: 'trigger',
        shape: 'circle',
        x: this.x,
        z: this.z,
        radius: 10,
        labOnly: true,
        isPlayer: null,
      };
    },
  });
  const added = addObject(scene, plainActor('rock'));
  assert.equal(added.ok, false);
  assert.equal(added.project, scene);
  assert.equal(objectById(added.project, 'rock'), null);
  assert.equal(added.issues.some((issue) => issue.includes('isPlayer must be a boolean')), true);
  assert.equal(playerIds(added.project).length, 1);

  const player = objectById(scene, 'player');
  const replaced = replaceObject(scene, 'player', { ...player });
  assert.equal(replaced.ok, false);
  assert.equal(replaced.project, scene);
  assert.equal(objectById(replaced.project, 'player').isPlayer, true);

  const cloned = cloneObject(scene, 'player', 'player_copy');
  assert.equal(cloned.ok, false);
  assert.equal(cloned.project, scene);
  assert.equal(objectById(cloned.project, 'player_copy'), null);
  assert.equal(objectById(cloned.project, 'cargo').kind, 'actor');
});

test('a nested toJSON that returns null is not adopted', () => {
  const scene = getComposition('dock.intercept-cargo');
  const grid = { size: scene.grid.size, snap: scene.grid.snap, toJSON() { return null; } };
  scene.grid = grid;
  const added = addObject(scene, plainActor('rock'));
  assert.equal(added.ok, false);
  assert.equal(added.project, scene);
  assert.equal(added.project.grid, grid);
  assert.notEqual(added.project.grid, null);
  assert.equal(objectById(added.project, 'rock'), null);
  assert.equal(objectById(added.project, 'player').isPlayer, true);

  const velocity = getComposition('dock.intercept-cargo');
  const cargo = objectById(velocity, 'cargo');
  const startVelX = cargo.velX;
  cargo.overrides = { mass: 2, toJSON() { return null; } };
  const sped = setVelocity(velocity, 'cargo', 3, -2);
  assert.equal(sped.ok, false);
  assert.equal(sped.project, velocity);
  assert.equal(objectById(sped.project, 'cargo').overrides.mass, 2);
  assert.notEqual(objectById(sped.project, 'cargo').overrides, null);
  assert.equal(objectById(sped.project, 'cargo').velX, startVelX);

  const nudgedScene = getComposition('dock.intercept-cargo');
  const nudgedGrid = { size: 10, snap: true, toJSON() { return null; } };
  nudgedScene.grid = nudgedGrid;
  const startX = objectById(nudgedScene, 'cargo').x;
  const nudged = nudgeObjects(nudgedScene, ['cargo'], 10, 0);
  assert.equal(nudged.ok, false);
  assert.equal(nudged.project, nudgedScene);
  assert.equal(nudged.project.grid, nudgedGrid);
  assert.equal(objectById(nudged.project, 'cargo').x, startX);

  const cameraScene = getComposition('dock.intercept-cargo');
  const cameraGrid = { size: 10, snap: true, toJSON() { return null; } };
  cameraScene.grid = cameraGrid;
  const cameraX = cameraScene.camera.x;
  const panned = setCamera(cameraScene, { x: 12, z: 4 });
  assert.equal(panned, cameraScene);
  assert.equal(panned.grid, cameraGrid);
  assert.equal(panned.camera.x, cameraX);
});

test('addObject returns the previous project when objects is a plain object', () => {
  const scene = getComposition('dock.intercept-cargo');
  const objects = { notAnArray: true };
  scene.objects = objects;
  const added = addObject(scene, plainActor('rock'));
  assert.equal(added.ok, false);
  assert.equal(added.project, scene);
  assert.equal(added.project.objects, objects);
  assert.equal(added.issues.some((issue) => issue.includes('objects must be an array')), true);

  const text = getComposition('dock.intercept-cargo');
  text.objects = 'actors';
  assert.doesNotThrow(() => addObject(text, plainActor('rock')));
  assert.equal(addObject(text, plainActor('rock')).project, text);
  assert.equal(setPlayer(text, 'player').project, text);
  assert.equal(clearPlayerFlag(text, 'player').project, text);
  assert.equal(replaceObject(text, 'player', plainActor('player', { isPlayer: true })).project, text);
  assert.equal(cloneObject(text, 'player', 'player_copy').project, text);
  assert.equal(placePlayer(text).project, text);

  const bag = getComposition('dock.intercept-cargo');
  bag.objects = { player: true };
  assert.doesNotThrow(() => placePlayer(bag));
  assert.equal(placePlayer(bag).project, bag);

  const counted = getComposition('dock.intercept-cargo');
  counted.objects = 4;
  assert.doesNotThrow(() => placePlayer(counted));
  assert.equal(placePlayer(counted).project, counted);

  const nudged = getComposition('dock.intercept-cargo');
  nudged.objects = { notAnArray: true };
  assert.doesNotThrow(() => nudgeObjects(nudged, ['cargo'], 10, 0));
  assert.equal(nudgeObjects(nudged, ['cargo'], 10, 0).project, nudged);

  const ungrouped = getComposition('dock.intercept-cargo');
  ungrouped.objects = 'actors';
  assert.doesNotThrow(() => ungroupObjects(ungrouped, ['cargo']));
  assert.equal(ungroupObjects(ungrouped, ['cargo']).project, ungrouped);

  const cleared = getComposition('dock.intercept-cargo');
  cleared.objects = null;
  const nulled = addObject(cleared, plainActor('rock', { isPlayer: true }));
  assert.equal(nulled.ok, false);
  assert.equal(nulled.project, cleared);
});

test('commit and open refuse a nested toJSON that nulls grid', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const scene = getComposition('dock.intercept-cargo');
  const grid = { size: scene.grid.size, snap: scene.grid.snap, toJSON() { return null; } };
  scene.grid = grid;
  const committed = commit(history, scene);
  assert.equal(committed, history);
  assert.notEqual(committed.present.grid, null);
  assert.equal(committed.present.grid.size, history.present.grid.size);
  assert.equal(objectById(committed.present, 'player').isPlayer, true);
  const opened = openDockHistory(scene);
  assert.equal(opened.ok, false);
  assert.equal(opened.history, null);
});

test('setFrames refuses an element whose toJSON returns null', () => {
  const scene = getComposition('dock.intercept-cargo');
  const tick = scene.frames[0].tick;
  const credits = scene.world.credits;
  const frame = {
    tick: 9,
    input: { moveX: 1, moveZ: 0, turnIntent: 0, boost: false, fire: false },
    toJSON() { return null; },
  };
  const frames = applyDockOp(scene, { op: 'setFrames', frames: [frame] });
  assert.equal(frames.ok, false);
  assert.equal(frames.project, scene);
  assert.equal(frames.issues.length > 0, true);
  assert.equal(frames.project.frames[0].tick, tick);
  assert.notEqual(frames.project.frames[0], null);

  const ops = [
    { op: 'setMeta', meta: { title: 'Nope', box: { toJSON() { return null; } } } },
    { op: 'setWorld', world: { credits: 3, box: { toJSON() { return null; } } } },
    { op: 'setNotes', notes: { note: { toJSON() { return null; } } } },
    { op: 'setEncounter', encounter: { id: 'dock_x', toJSON() { return null; } } },
    { op: 'setWeapon', weapon: { id: 'wpn_x', toJSON() { return null; } } },
    { op: 'setPlace', place: { id: 'place_x', toJSON() { return null; } } },
    { op: 'setModule', module: { id: 'mod_x', toJSON() { return null; } } },
  ];
  for (const op of ops) {
    const result = applyDockOp(scene, op);
    assert.equal(result.ok, false, op.op);
    assert.equal(result.project, scene, op.op);
    assert.equal(result.issues.length > 0, true, op.op);
  }
  assert.equal(scene.title.includes('Nope'), false);
  assert.equal(scene.world.credits, credits);

  const requested = applyRequest({
    schema: REQUEST_SCHEMA,
    ops: [
      { op: 'loadExample', id: 'dock.intercept-cargo' },
      { op: 'setFrames', frames: [frame] },
    ],
  });
  assert.equal(requested.ok, false);
  assert.equal(requested.applied.includes('setFrames'), false);
  assert.notEqual(requested.project.frames[0], null);
  assert.equal(requested.project.frames[0].tick, tick);
  assert.equal(requested.project.objects.find((object) => object.isPlayer === true).isPlayer, true);
});

test('setMeta does not return ok when JSON.stringify of the result would throw', () => {
  const scene = getComposition('dock.intercept-cargo');
  const seed = scene.seed;
  const meta = applyDockOp(scene, { op: 'setMeta', meta: { seed: 1n } });
  assert.equal(meta.ok, false);
  assert.equal(meta.project, scene);
  assert.equal(meta.project.seed, seed);
  assert.equal(meta.issues.length > 0, true);
  assert.doesNotThrow(() => JSON.stringify(meta.project));

  const described = Object.getOwnPropertyDescriptor(BigInt.prototype, 'toJSON');
  Object.defineProperty(BigInt.prototype, 'toJSON', {
    configurable: true,
    writable: true,
    value(key) {
      if (key === 'seed') throw new Error('boom');
      return Number(this);
    },
  });
  try {
    const keyed = applyDockOp(scene, { op: 'setMeta', meta: { seed: 2n } });
    assert.equal(keyed.ok, false);
    assert.equal(keyed.project, scene);
    assert.equal(keyed.project.seed, seed);
    assert.doesNotThrow(() => JSON.stringify(keyed.project));
  } finally {
    if (described) Object.defineProperty(BigInt.prototype, 'toJSON', described);
    else delete BigInt.prototype.toJSON;
  }
});

test('a self-deleting toJSON that returns null is not stored on grid', () => {
  function withGrid() {
    const scene = getComposition('dock.intercept-cargo');
    scene.grid.toJSON = function () {
      delete this.toJSON;
      return null;
    };
    return scene;
  }
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const committedScene = withGrid();
  const committed = commit(history, committedScene);
  assert.equal(committed, history);
  assert.notEqual(committed.present.grid, null);
  assert.equal(committed.present.grid.size, history.present.grid.size);
  const opened = openDockHistory(withGrid());
  assert.equal(opened.ok, false);
  assert.equal(opened.history, null);

  const addedScene = withGrid();
  const added = addObject(addedScene, plainActor('rock'));
  assert.equal(added.ok, false);
  assert.equal(added.project, addedScene);
  assert.notEqual(added.project.grid, null);
  assert.equal(objectById(added.project, 'rock'), null);

  const spedScene = withGrid();
  const sped = setVelocity(spedScene, 'cargo', 1, 0);
  assert.equal(sped.ok, false);
  assert.equal(sped.project, spedScene);
  assert.notEqual(sped.project.grid, null);

  const metaScene = withGrid();
  const meta = applyDockOp(metaScene, { op: 'setMeta', meta: { title: 'Nope' } });
  assert.equal(meta.ok, false);
  assert.equal(meta.project, metaScene);
  assert.notEqual(meta.project.grid, null);
  assert.equal(meta.project.title.includes('Nope'), false);

  const placed = getComposition('dock.intercept-cargo');
  Object.defineProperty(placed, 'toJSON', {
    enumerable: false,
    value() {
      const body = { ...this };
      delete body.toJSON;
      body.grid = null;
      return body;
    },
  });
  assert.equal(commit(history, placed), history);
  assert.notEqual(history.present.grid, null);

  const boxed = getComposition('dock.intercept-cargo');
  const boxedMeta = applyDockOp(boxed, {
    op: 'setMeta',
    meta: {
      box: {
        inner: {
          label: 'inner',
          toJSON() {
            delete this.toJSON;
            return null;
          },
        },
      },
    },
  });
  assert.equal(boxedMeta.ok, false);
  assert.equal(boxedMeta.project, boxed);
  assert.equal(boxedMeta.project.box, undefined);

  const framesScene = getComposition('dock.intercept-cargo');
  const frames = applyDockOp(framesScene, {
    op: 'setFrames',
    frames: [{
      tick: 4,
      input: { moveX: 0, moveZ: 0, turnIntent: 0, boost: false, fire: false },
      mark: {
        toJSON() {
          delete this.toJSON;
          return null;
        },
      },
    }],
  });
  assert.equal(frames.ok, false);
  assert.equal(frames.project, framesScene);
  assert.notEqual(frames.project.frames[0], null);
  assert.equal(frames.project.frames[0].mark, undefined);
});

test('formatReport does not throw when the error message getter throws', () => {
  const failure = new Error('hidden');
  Object.defineProperty(failure, 'message', {
    get() { throw new Error('message'); },
  });
  const value = {
    toJSON() { throw failure; },
  };
  let text;
  assert.doesNotThrow(() => {
    text = formatReport(value);
  });
  assert.equal(typeof text, 'string');
  assert.equal(text.includes('scene could not be cloned'), true);
  const editor = fs.readFileSync(new URL('../public/editor.js', import.meta.url), 'utf8');
  assert.equal(/function showReport\(value\) \{\s*try \{/.test(editor), true);
});

test('toJSON cannot store grid null, a null array, or a frames hole', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));

  const returned = getComposition('dock.intercept-cargo');
  returned.toJSON = function () {
    this.grid = null;
    return this;
  };
  const returnedCommit = commit(history, returned);
  assert.equal(returnedCommit, history);
  assert.notEqual(returnedCommit.present.grid, null);
  assert.equal(returnedCommit.present.grid.size, history.present.grid.size);

  const copied = getComposition('dock.intercept-cargo');
  copied.toJSON = function () {
    this.grid = null;
    return { ...this };
  };
  const copiedCommit = commit(history, copied);
  assert.equal(copiedCommit, history);
  assert.notEqual(copiedCommit.present.grid, null);

  const listed = getComposition('dock.intercept-cargo');
  listed.grid.toJSON = function () { return [null]; };
  const listedCommit = commit(history, listed);
  assert.equal(listedCommit, history);
  assert.equal(Array.isArray(listedCommit.present.grid), false);
  assert.notEqual(listedCommit.present.grid, null);

  const nested = getComposition('dock.intercept-cargo');
  nested.toJSON = function () {
    const source = this;
    return {
      toJSON() {
        return { ...source, grid: null };
      },
    };
  };
  const nestedCommit = commit(history, nested);
  assert.equal(nestedCommit, history);
  assert.notEqual(nestedCommit.present.grid, null);

  const holed = getComposition('dock.intercept-cargo');
  delete holed.frames[0];
  const holedCommit = commit(history, holed);
  assert.equal(holedCommit, history);
  assert.notEqual(holedCommit.present.frames[0], null);
  assert.equal(holedCommit.present.frames[0].tick, history.present.frames[0].tick);
  const opened = openDockHistory(holed);
  assert.equal(opened.ok, false);
  assert.equal(opened.history, null);
});

test('a new null slot, a null inside an array object, and a chained toJSON are refused', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));

  const self = getComposition('dock.intercept-cargo');
  self.toJSON = function () {
    this.frames = this.frames.concat([null]);
    return this;
  };
  assert.equal(commit(history, self), history);
  assert.equal(history.present.frames.some((frame) => frame == null), false);
  const selfPost = getComposition('dock.intercept-cargo');
  selfPost.toJSON = function () {
    this.frames = this.frames.concat([null]);
    return this;
  };
  const selfBody = postRequestBody({ project: selfPost });
  assert.equal(selfBody.ok, false);
  assert.equal(selfBody.body, null);

  const copy = getComposition('dock.intercept-cargo');
  copy.toJSON = function () {
    return { ...this, frames: this.frames.concat([null]) };
  };
  assert.equal(commit(history, copy), history);
  const copyBody = postRequestBody({ project: copy });
  assert.equal(copyBody.ok, false);
  assert.equal(copyBody.body, null);

  const wrapped = getComposition('dock.intercept-cargo');
  wrapped.toJSON = function () {
    const source = this;
    return {
      toJSON() {
        return { ...source, frames: source.frames.concat([null]) };
      },
    };
  };
  assert.equal(commit(history, wrapped), history);
  assert.equal(history.present.frames.at(-1) == null, false);

  const events = getComposition('dock.intercept-cargo');
  events.inputEvents = [];
  events.inputEvents.toJSON = function () { return [null]; };
  const eventsCommit = commit(history, events);
  assert.equal(eventsCommit, history);
  assert.equal(eventsCommit.present.inputEvents.some((item) => item == null), false);

  const sized = getComposition('dock.intercept-cargo');
  sized.grid.toJSON = function () { return [{ size: null }]; };
  const sizedCommit = commit(history, sized);
  assert.equal(sizedCommit, history);
  assert.equal(Array.isArray(sizedCommit.present.grid), false);
  assert.notEqual(sizedCommit.present.grid.size, null);
  const sizedAdd = addObject(sized, plainActor('rock'));
  assert.equal(sizedAdd.ok, false);
  assert.equal(sizedAdd.project, sized);
  assert.equal(Array.isArray(sizedAdd.project.grid), false);

  const chained = getComposition('dock.intercept-cargo');
  chained.grid.toJSON = function () {
    return {
      fresh: 1,
      size: this.size,
      snap: this.snap,
      toJSON() {
        return { size: this.size, snap: this.snap, fresh: null };
      },
    };
  };
  const chainedCommit = commit(history, chained);
  assert.equal(chainedCommit, history);
  assert.notEqual(chainedCommit.present.grid.fresh, null);
});

test('a rejected return-this toJSON does not leave grid null on the returned project', () => {
  const scene = getComposition('dock.intercept-cargo');
  const history = createHistory(scene);
  const grid = history.present.grid;
  history.present.toJSON = function () {
    this.grid = null;
    return this;
  };
  const committed = commit(history, history.present);
  assert.equal(committed, history);
  assert.equal(committed.present.grid, grid);
  assert.notEqual(committed.present.grid, null);
  assert.equal(committed.present.grid.size, grid.size);

  const arrayScene = getComposition('dock.intercept-cargo');
  const arrayHistory = createHistory(arrayScene);
  const arrayGrid = arrayHistory.present.grid;
  arrayHistory.present.toJSON = function () {
    this.grid = [null];
    return this;
  };
  const arrayCommit = commit(arrayHistory, arrayHistory.present);
  assert.equal(arrayCommit, arrayHistory);
  assert.equal(arrayCommit.present.grid, arrayGrid);
  assert.equal(Array.isArray(arrayCommit.present.grid), false);

  const again = getComposition('dock.intercept-cargo');
  again.toJSON = function () {
    this.grid = null;
    return this;
  };
  const second = commit(history, again);
  assert.equal(second, history);
  assert.equal(second.present.grid, grid);

  const panned = setCamera(history.present, { x: 4, z: 1 });
  assert.equal(panned, history.present);
  assert.equal(panned.grid, grid);
  assert.equal(commit(history, panned), history);
  assert.equal(history.present.grid, grid);

  const addedScene = getComposition('dock.intercept-cargo');
  const addedGrid = addedScene.grid;
  addedScene.toJSON = function () {
    this.grid = null;
    return this;
  };
  const added = addObject(addedScene, plainActor('rock'));
  assert.equal(added.ok, false);
  assert.equal(added.project, addedScene);
  assert.equal(added.project.grid, addedGrid);

  const spedScene = getComposition('dock.intercept-cargo');
  const spedGrid = spedScene.grid;
  spedScene.toJSON = function () {
    this.grid = [null];
    return this;
  };
  const sped = setVelocity(spedScene, 'cargo', 1, 0);
  assert.equal(sped.ok, false);
  assert.equal(sped.project.grid, spedGrid);

  const frameScene = getComposition('dock.intercept-cargo');
  const frameGrid = frameScene.grid;
  frameScene.toJSON = function () {
    this.grid = null;
    return { ...this };
  };
  const framed = applyDockOp(frameScene, {
    op: 'setFrames',
    frames: [{ tick: 1, input: { moveX: 0, moveZ: 0, turnIntent: 0, boost: false, fire: false } }],
  });
  assert.equal(framed.project.grid, frameGrid);

  const quiet = getComposition('dock.intercept-cargo');
  const quietHistory = createHistory(quiet);
  const quietGrid = quietHistory.present.grid;
  Object.defineProperty(quietHistory.present, 'toJSON', {
    enumerable: false,
    value() {
      this.grid = null;
      return { ...this };
    },
  });
  assert.equal(commit(quietHistory, quietHistory.present), quietHistory);
  assert.equal(commit(quietHistory, quietHistory.present), quietHistory);
  assert.equal(quietHistory.present.grid, quietGrid);

  const nested = getComposition('dock.intercept-cargo');
  const nestedHistory = createHistory(nested);
  const nestedGrid = nestedHistory.present.grid;
  nestedHistory.present.grid.toJSON = function () {
    nestedHistory.present.grid = null;
    return null;
  };
  assert.equal(commit(nestedHistory, nestedHistory.present), nestedHistory);
  assert.equal(nestedHistory.present.grid, nestedGrid);
});

test('a nested box toJSON, a null inside an array object, and a snapshot getter are refused', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const grid = history.present.grid;

  function armBox(scene, produce) {
    Object.defineProperty(scene, 'toJSON', {
      enumerable: false,
      value() {
        return {
          box: { size: 1 },
          toJSON() { return produce(this, scene); },
        };
      },
    });
    return scene;
  }
  for (const produce of [
    (receiver) => {
      receiver.box = null;
      return receiver;
    },
    (receiver) => {
      receiver.box = null;
      return { ...receiver };
    },
    (_receiver, scene) => ({ ...scene, box: null }),
  ]) {
    const scene = armBox(getComposition('dock.intercept-cargo'), produce);
    const committed = commit(history, scene);
    assert.equal(committed, history);
    assert.equal(committed.present.box, undefined);
    assert.equal(committed.present.grid, grid);
    assert.notEqual(committed.present.grid, null);
  }

  const padded = getComposition('dock.intercept-cargo');
  padded.grid.toJSON = function () { return [{ pad: [null] }]; };
  const paddedCommit = commit(history, padded);
  assert.equal(paddedCommit, history);
  assert.equal(Array.isArray(paddedCommit.present.grid), false);
  assert.notEqual(paddedCommit.present.grid, null);

  const parent = getComposition('dock.intercept-cargo');
  parent.toJSON = function () {
    return { ...this, grid: [{ pad: [null] }] };
  };
  const parentCommit = commit(history, parent);
  assert.equal(parentCommit, history);
  assert.equal(Array.isArray(parentCommit.present.grid), false);

  const sized = getComposition('dock.intercept-cargo');
  sized.grid.toJSON = function () { return [{ size: null }]; };
  assert.equal(commit(history, sized), history);
  assert.notEqual(history.present.grid.size, null);

  const fresh = getComposition('dock.intercept-cargo');
  const rebuilt = {};
  Object.defineProperty(rebuilt, 'early', {
    enumerable: true,
    configurable: true,
    get() {
      this.grid = null;
      return 1;
    },
  });
  for (const key of Object.keys(fresh)) {
    Object.defineProperty(rebuilt, key, Object.getOwnPropertyDescriptor(fresh, key));
  }
  rebuilt.toJSON = function () { return this; };
  const trapped = commit(history, rebuilt);
  assert.notEqual(trapped.present.grid, null);
  assert.equal(Array.isArray(trapped.present.grid), false);
  assert.equal(trapped.present.grid.size, grid.size);
  assert.equal(rebuilt.grid, fresh.grid);
  assert.notEqual(rebuilt.grid, null);
});

test('a toJSON getter, an index getter, and a new nested null are not stored', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const grid = history.present.grid;
  Object.defineProperty(history.present, 'toJSON', {
    enumerable: true,
    configurable: true,
    get() {
      this.grid = [{ pad: [null] }];
      return function () { return this; };
    },
  });
  const planted = commit(history, history.present);
  assert.equal(planted, history);
  assert.equal(planted.present.grid, grid);
  assert.equal(Array.isArray(planted.present.grid), false);

  const indexed = getComposition('dock.intercept-cargo');
  const indexedHistory = createHistory(indexed);
  const indexedGrid = indexedHistory.present.grid;
  const events = indexedHistory.present.inputEvents;
  Object.defineProperty(events, '0', {
    enumerable: true,
    configurable: true,
    get() {
      indexedHistory.present.grid = [{ pad: [null] }];
      return { tick: 0 };
    },
  });
  events.length = Math.max(events.length, 1);
  const indexedCommit = commit(indexedHistory, indexedHistory.present);
  assert.equal(indexedCommit, indexedHistory);
  assert.equal(indexedCommit.present.grid, indexedGrid);
  assert.equal(Array.isArray(indexedCommit.present.grid), false);

  const nest = getComposition('dock.intercept-cargo');
  nest.grid.toJSON = function () { return { nest: { box: null } }; };
  const nestCommit = commit(history, nest);
  assert.equal(nestCommit, history);
  assert.equal(nestCommit.present.grid.nest, undefined);
  assert.notEqual(nestCommit.present.grid, null);

  const extra = getComposition('dock.intercept-cargo');
  extra.grid.toJSON = function () {
    this.extra = { box: null };
    return this;
  };
  assert.equal(commit(history, extra), history);
  assert.equal(history.present.grid.extra, undefined);

  const parent = getComposition('dock.intercept-cargo');
  parent.toJSON = function () {
    return { ...this, extra: { box: null } };
  };
  assert.equal(commit(history, parent), history);
  assert.equal(history.present.extra, undefined);

  const wrapped = getComposition('dock.intercept-cargo');
  wrapped.grid.toJSON = function () {
    return { wrap: { inner: [{ pad: [null] }] } };
  };
  assert.equal(commit(history, wrapped), history);
  assert.equal(history.present.grid.wrap, undefined);

  const padWrap = getComposition('dock.intercept-cargo');
  padWrap.grid.toJSON = function () {
    return { wrap: { pad: [null] } };
  };
  assert.equal(commit(history, padWrap), history);
  assert.equal(history.present.grid.wrap, undefined);
});

test('new pad arrays, an index getter, and a restore setter are not stored', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const grid = history.present.grid;

  const widget = getComposition('dock.intercept-cargo');
  widget.toJSON = function () {
    return { ...this, widget: { pad: [null] } };
  };
  assert.equal(commit(history, widget), history);
  assert.equal(history.present.widget, undefined);
  assert.equal(history.present.grid, grid);

  const nested = getComposition('dock.intercept-cargo');
  nested.toJSON = function () {
    return { ...this, grid: { nest: { pad: [null] } } };
  };
  assert.equal(commit(history, nested), history);
  assert.equal(history.present.grid, grid);
  assert.equal(history.present.grid.nest, undefined);

  const framed = getComposition('dock.intercept-cargo');
  framed.frames.toJSON = function () {
    return [{ nest: { pad: [null] } }];
  };
  const framedCommit = commit(history, framed);
  assert.equal(framedCommit, history);
  assert.notEqual(framedCommit.present.frames[0], null);
  assert.equal(framedCommit.present.frames[0].nest, undefined);

  const present = history.present;
  const frame0 = present.frames[0];
  present.frames.push({ tick: 9, input: { moveX: 0, moveZ: 0, turnIntent: 0, boost: false, fire: false } });
  const frame1 = present.frames[1];
  let indexReads = 0;
  Object.defineProperty(present.frames, '0', {
    enumerable: true,
    configurable: true,
    get() {
      indexReads += 1;
      this[1] = null;
      return frame0;
    },
  });
  present.toJSON = function () { return this; };
  const indexed = commit(history, present);
  assert.equal(indexed, history);
  assert.equal(indexReads, 0);
  assert.equal(present.frames[1], frame1);
  assert.notEqual(present.frames[1], null);
  assert.notEqual(indexed.present.frames[1], null);

  const rebuilt = {};
  rebuilt.grid = grid;
  rebuilt.title = 'Moving cargo interception';
  for (const key of Object.keys(present)) {
    if (key === 'grid' || key === 'title' || key === 'toJSON') continue;
    rebuilt[key] = present[key];
  }
  const rebuiltGrid = rebuilt.grid;
  rebuilt.toJSON = function () {
    this.grid = null;
    Object.defineProperty(this, 'title', {
      configurable: true,
      enumerable: true,
      set() {
        this.grid = null;
        throw new Error('setter-boom');
      },
      get() { return 'x'; },
    });
    return this;
  };
  let restored;
  assert.doesNotThrow(() => {
    restored = commit(history, rebuilt);
  });
  assert.equal(restored, history);
  assert.equal(rebuilt.grid, rebuiltGrid);
  assert.notEqual(rebuilt.grid, null);
  assert.equal(history.present.grid, grid);
});

test('sameProject does not null grid through an enumerable getter', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const grid = history.present.grid;
  Object.defineProperty(history.present, 'early', {
    enumerable: true,
    configurable: true,
    get() {
      this.grid = null;
      return 1;
    },
  });
  const next = getComposition('dock.intercept-cargo');
  next.title = 'Renamed dock';
  const committed = commit(history, next);
  assert.equal(committed.present.title, 'Renamed dock');
  assert.equal(history.present.grid, grid);
  assert.notEqual(committed.past[0], history.present);
  assert.notEqual(committed.past[0].grid, null);
  assert.equal(committed.past[0].grid.size, grid.size);
  const undone = restoreHistory(committed, 'undo');
  assert.equal(undone.ok, true, (undone.issues || []).join('\n'));
  assert.equal(history.present.grid, grid);
  assert.notEqual(undone.history.present.grid, null);
  assert.equal(undone.history.present.grid.size, grid.size);
});

test('a getter installed in place of grid is not stored', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const grid = history.present.grid;
  history.present.toJSON = function () {
    Object.defineProperty(this, 'grid', {
      enumerable: true,
      configurable: true,
      get() { return null; },
    });
    return this;
  };
  const committed = commit(history, history.present);
  assert.equal(committed, history);
  assert.equal(committed.present.grid, grid);
  assert.equal(Array.isArray(committed.present.grid), false);
  assert.equal('value' in Object.getOwnPropertyDescriptor(history.present, 'grid'), true);

  const nulled = getComposition('dock.intercept-cargo');
  const nulledHistory = createHistory(nulled);
  const nulledGrid = nulledHistory.present.grid;
  nulledHistory.present.toJSON = function () {
    Object.defineProperty(this, 'grid', {
      enumerable: true,
      get() { throw new TypeError('grid-get'); },
      set() { throw new TypeError('grid-set'); },
    });
    return null;
  };
  let restored;
  assert.doesNotThrow(() => {
    restored = commit(nulledHistory, nulledHistory.present);
  });
  assert.equal(restored, nulledHistory);
  assert.equal(nulledHistory.present.grid, nulledGrid);
  assert.equal('value' in Object.getOwnPropertyDescriptor(nulledHistory.present, 'grid'), true);
});

test('undo does not null grid through an objects getter', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const grid = history.present.grid;
  const objects = history.present.objects;
  let reads = 0;
  Object.defineProperty(history.present, 'objects', {
    enumerable: true,
    configurable: true,
    get() {
      reads += 1;
      this.grid = null;
      return objects;
    },
  });
  const next = getComposition('dock.intercept-cargo');
  next.title = 'Renamed dock';
  const committed = commit(history, next);
  assert.equal(reads, 0);
  assert.equal(committed.present.title, 'Renamed dock');
  assert.notEqual(committed.past[0], history.present);
  assert.equal(history.present.grid, grid);
  assert.notEqual(history.present.grid, null);
  const undone = restoreHistory(committed, 'undo');
  assert.equal(reads, 0);
  assert.equal(history.present.grid, grid);
  assert.notEqual(history.present.grid, null);
  if (undone.ok) assert.notEqual(undone.history.present.grid, null);
});

test('a non-configurable grid getter does not escape commit', () => {
  for (const produce of [
    function () {
      Object.defineProperty(this, 'grid', {
        enumerable: true,
        configurable: false,
        get() { return null; },
      });
      return this;
    },
    function () {
      Object.defineProperty(this, 'grid', {
        enumerable: true,
        configurable: false,
        get() { return null; },
      });
      return null;
    },
  ]) {
    const history = createHistory(getComposition('dock.intercept-cargo'));
    const grid = history.present.grid;
    history.present.toJSON = produce;
    let committed;
    assert.doesNotThrow(() => {
      committed = commit(history, history.present);
    });
    assert.equal(committed, history);
    assert.equal(committed.past.length, 0);
    assert.equal(committed.present, history.present);
    const descriptor = Object.getOwnPropertyDescriptor(history.present, 'grid');
    if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      assert.equal(descriptor.value, grid);
      assert.notEqual(descriptor.value, null);
    }
  }
});

test('a grid getter already on the present is not kept by commit', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  function hideGrid() { return null; }
  Object.defineProperty(history.present, 'grid', {
    enumerable: true,
    configurable: true,
    get: hideGrid,
  });
  const committed = commit(history, history.present);
  const descriptor = Object.getOwnPropertyDescriptor(committed.present, 'grid');
  assert.equal(descriptor && descriptor.get, undefined);
  assert.notEqual(committed.present.grid, null);

  const next = getComposition('dock.intercept-cargo');
  next.title = 'Renamed dock';
  const renamed = commit(history, next);
  assert.equal(renamed.present.title, 'Renamed dock');
  const undone = restoreHistory(renamed, 'undo');
  assert.equal(undone.ok, true, (undone.issues || []).join('\n'));
  const undoneGrid = Object.getOwnPropertyDescriptor(undone.history.present, 'grid');
  assert.equal(undoneGrid && undoneGrid.get, undefined);
  assert.notEqual(undone.history.present.grid, null);
  assert.notEqual(undone.history.present, history.present);
});

function gridGetter(object) {
  let current = object;
  const seen = new Set();
  while (current && (typeof current === 'object' || typeof current === 'function') && !seen.has(current)) {
    seen.add(current);
    const descriptor = Object.getOwnPropertyDescriptor(current, 'grid');
    if (descriptor && typeof descriptor.get === 'function') return descriptor.get;
    if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')) return undefined;
    current = Object.getPrototypeOf(current);
  }
  return undefined;
}

test('undo strips a grid getter from the scene pushed onto future', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const next = getComposition('dock.intercept-cargo');
  next.title = 'Renamed dock';
  const committed = commit(history, next);
  let reads = 0;
  Object.defineProperty(committed.present, 'grid', {
    enumerable: true,
    configurable: true,
    get() {
      reads += 1;
      return null;
    },
  });
  const undone = restoreHistory(committed, 'undo');
  assert.equal(reads, 1);
  assert.equal(undone.ok, true, (undone.issues || []).join('\n'));
  const parked = undone.history.future[0];
  assert.notEqual(parked, committed.present);
  assert.equal(gridGetter(parked), undefined);
  assert.notEqual(parked.grid, null);
  assert.notEqual(undone.history.present.grid, null);
});

test('redo strips a grid getter from the scene pushed onto past', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const next = getComposition('dock.intercept-cargo');
  next.title = 'Renamed dock';
  const committed = commit(history, next);
  const undone = restoreHistory(committed, 'undo');
  assert.equal(undone.ok, true, (undone.issues || []).join('\n'));
  let reads = 0;
  Object.defineProperty(undone.history.present, 'grid', {
    enumerable: true,
    configurable: true,
    get() {
      reads += 1;
      return null;
    },
  });
  const redone = restoreHistory(undone.history, 'redo');
  assert.equal(reads, 1);
  assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
  const parked = redone.history.past[redone.history.past.length - 1];
  assert.notEqual(parked, undone.history.present);
  assert.equal(gridGetter(parked), undefined);
  assert.notEqual(parked.grid, null);
});

test('commit does not keep an inherited grid getter', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const proto = {};
  let reads = 0;
  Object.defineProperty(proto, 'grid', {
    enumerable: true,
    configurable: true,
    get() {
      reads += 1;
      return null;
    },
  });
  const previous = Object.getPrototypeOf(history.present);
  delete history.present.grid;
  Object.setPrototypeOf(history.present, proto);
  try {
    const committed = commit(history, history.present);
    assert.equal(reads, 1);
    assert.notEqual(committed, history);
    assert.equal(gridGetter(committed.present), undefined);
    assert.notEqual(committed.present.grid, null);
  } finally {
    Object.setPrototypeOf(history.present, previous);
  }
});

test('a function prototype grid getter is not returned or parked', () => {
  const proto = function gridHost() {};
  let reads = 0;
  Object.defineProperty(proto, 'grid', {
    configurable: true,
    get() {
      reads += 1;
      return null;
    },
  });
  const restored = [];
  function useProto(object) {
    restored.push([object, Object.getPrototypeOf(object)]);
    delete object.grid;
    Object.setPrototypeOf(object, proto);
  }
  try {
    const history = createHistory(getComposition('dock.intercept-cargo'));
    useProto(history.present);
    const committed = commit(history, history.present);
    assert.notEqual(committed, history);
    assert.equal(reads, 0);
    assert.notEqual(committed.present.grid, null);
    assert.equal(gridGetter(committed.present), undefined);

    const fresh = createHistory(getComposition('dock.intercept-cargo'));
    useProto(fresh.present);
    const next = getComposition('dock.intercept-cargo');
    next.title = 'Renamed dock';
    const renamed = commit(fresh, next);
    assert.equal(reads, 0);
    assert.notEqual(renamed.past[0], fresh.present);
    assert.notEqual(renamed.past[0].grid, null);
    assert.equal(gridGetter(renamed.past[0]), undefined);

    const base = createHistory(getComposition('dock.intercept-cargo'));
    const stepped = commit(base, next);
    useProto(stepped.present);
    const undone = restoreHistory(stepped, 'undo');
    assert.equal(undone.ok, true, (undone.issues || []).join('\n'));
    assert.equal(reads, 0);
    assert.notEqual(undone.history.future[0], stepped.present);
    assert.notEqual(undone.history.future[0].grid, null);
    assert.equal(gridGetter(undone.history.future[0]), undefined);

    const again = createHistory(getComposition('dock.intercept-cargo'));
    const renamedAgain = commit(again, next);
    const back = restoreHistory(renamedAgain, 'undo');
    assert.equal(back.ok, true, (back.issues || []).join('\n'));
    useProto(back.history.present);
    const redone = restoreHistory(back.history, 'redo');
    assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
    const parked = redone.history.past[redone.history.past.length - 1];
    assert.equal(reads, 0);
    assert.notEqual(parked, back.history.present);
    assert.notEqual(parked.grid, null);
    assert.equal(gridGetter(parked), undefined);
  } finally {
    for (const [object, previous] of restored) Object.setPrototypeOf(object, previous);
  }
});

test('a second undo strips a grid getter that was parked on future', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const first = getComposition('dock.intercept-cargo');
  first.title = 'First rename';
  const second = getComposition('dock.intercept-cargo');
  second.title = 'Second rename';
  const once = commit(history, first);
  const twice = commit(once, second);
  const undone = restoreHistory(twice, 'undo');
  assert.equal(undone.ok, true, (undone.issues || []).join('\n'));
  let reads = 0;
  Object.defineProperty(undone.history.future[0], 'grid', {
    enumerable: true,
    configurable: true,
    get() {
      reads += 1;
      return null;
    },
  });
  const again = restoreHistory(undone.history, 'undo');
  assert.equal(again.ok, true, (again.issues || []).join('\n'));
  assert.equal(reads, 1);
  const parked = again.history.future[1];
  assert.equal(gridGetter(parked), undefined);
  assert.notEqual(parked.grid, null);
  assert.notEqual(parked, undone.history.future[0]);
});

test('a stack toJSON cannot null the live present grid', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const first = getComposition('dock.intercept-cargo');
  first.title = 'First rename';
  const second = getComposition('dock.intercept-cargo');
  second.title = 'Second rename';
  const once = commit(history, first);
  const twice = commit(once, second);
  const live = twice.present;
  const grid = live.grid;
  const parked = twice.past[0];
  const parkedGrid = parked.grid;
  parked.toJSON = function () {
    live.grid = null;
    return this;
  };
  Object.defineProperty(parked, 'grid', {
    configurable: true,
    enumerable: true,
    get() { return parkedGrid; },
  });
  const next = getComposition('dock.intercept-cargo');
  next.title = 'Third rename';
  const committed = commit(twice, next);
  assert.equal(live.grid, grid);
  assert.notEqual(live.grid, null);
  for (const scene of committed.past) assert.notEqual(scene.grid, null);
  for (const scene of twice.past) assert.notEqual(scene.grid, null);

  const futureHistory = createHistory(getComposition('dock.intercept-cargo'));
  const futureOnce = commit(futureHistory, first);
  const futureTwice = commit(futureOnce, second);
  const undone = restoreHistory(futureTwice, 'undo');
  assert.equal(undone.ok, true, (undone.issues || []).join('\n'));
  const futureLive = undone.history.present;
  const futureGrid = futureLive.grid;
  const futureScene = undone.history.future[0];
  const futureSceneGrid = futureScene.grid;
  futureScene.toJSON = function () {
    futureLive.grid = null;
    return this;
  };
  Object.defineProperty(futureScene, 'grid', {
    configurable: true,
    enumerable: true,
    get() { return futureSceneGrid; },
  });
  const again = restoreHistory(undone.history, 'undo');
  assert.equal(futureLive.grid, futureGrid);
  assert.notEqual(futureLive.grid, null);
  const future = again.history.future;
  for (const scene of future) assert.notEqual(scene.grid, null);
});

function withObjectPrototypeGrid(body) {
  const prior = Object.getOwnPropertyDescriptor(Object.prototype, 'grid');
  const counter = { reads: 0 };
  Object.defineProperty(Object.prototype, 'grid', {
    configurable: true,
    get() {
      counter.reads += 1;
      return null;
    },
  });
  try {
    body(counter);
  } finally {
    if (prior) Object.defineProperty(Object.prototype, 'grid', prior);
    else delete Object.prototype.grid;
  }
}

test('commit does not inherit a getter-only Object.prototype.grid', () => {
  withObjectPrototypeGrid((counter) => {
    const history = createHistory(getComposition('dock.intercept-cargo'));
    delete history.present.grid;
    const before = counter.reads;
    const committed = commit(history, history.present);
    assert.equal(counter.reads, before);
    const unchangedOwn = Object.getOwnPropertyDescriptor(committed.present, 'grid');
    const stampedUndefined = !!(unchangedOwn
      && Object.prototype.hasOwnProperty.call(unchangedOwn, 'value')
      && unchangedOwn.value === undefined);
    assert.equal(stampedUndefined, false);

    const next = getComposition('dock.intercept-cargo');
    delete next.grid;
    next.title = 'Renamed dock';
    const renamed = commit(history, next);
    assert.equal(counter.reads, before);
    assert.equal(renamed.present.title, 'Renamed dock');
    const renamedOwn = Object.getOwnPropertyDescriptor(renamed.present, 'grid');
    const renamedStamped = !!(renamedOwn
      && Object.prototype.hasOwnProperty.call(renamedOwn, 'value')
      && renamedOwn.value === undefined);
    assert.equal(renamedStamped, false);
  });
});

test('commit assigns an own grid when Object.prototype.grid has no setter', () => {
  withObjectPrototypeGrid((counter) => {
    const history = createHistory(getComposition('dock.intercept-cargo'));
    delete history.present.grid;
    const next = getComposition('dock.intercept-cargo');
    assert.equal(Object.prototype.hasOwnProperty.call(next, 'grid'), true);
    const before = counter.reads;
    let committed;
    assert.doesNotThrow(() => {
      committed = commit(history, next);
    });
    const grid = committed.present.grid;
    assert.equal(counter.reads, before);
    assert.notEqual(committed, history);
    assert.notEqual(grid, null);
    assert.equal(grid.size, next.grid.size);
    const own = Object.getOwnPropertyDescriptor(committed.present, 'grid');
    assert.equal(Object.prototype.hasOwnProperty.call(own, 'value'), true);
    assert.equal(typeof own.get, 'undefined');
  });
});

test('stableStringify does not throw when a boxed id toJSON throws', () => {
  const boxed = new String('dock.intercept-cargo');
  Object.defineProperty(boxed, 'toJSON', {
    enumerable: true,
    value() { throw new Error('boom'); },
  });
  let text;
  assert.doesNotThrow(() => {
    text = stableStringify({ projectId: boxed });
  });
  assert.equal(typeof text, 'string');
  assert.equal(text.includes('"0"'), false);
  assert.equal(text.includes('dock.intercept-cargo'), true);
  const number = new Number(3);
  Object.defineProperty(number, 'toJSON', {
    enumerable: true,
    value() { throw new Error('boom'); },
  });
  const numbered = stableStringify({ seed: number });
  assert.equal(numbered.includes('"seed": {}'), false);
  assert.equal(numbered.includes('"seed": 3'), true);
});

test('stableStringify does not throw out of commit', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  history.present.grid.toJSON = function () { throw new Error('boom'); };
  const next = getComposition('dock.intercept-cargo');
  next.title = 'Renamed dock';
  let committed;
  assert.doesNotThrow(() => {
    committed = commit(history, next);
  });
  assert.equal(committed, history);
  assert.equal(committed.present.title.includes('Renamed'), false);
  assert.equal(objectById(committed.present, 'player').isPlayer, true);

  const titled = createHistory(getComposition('dock.intercept-cargo'));
  titled.present.toJSON = function () { throw new Error('boom'); };
  assert.doesNotThrow(() => {
    committed = commit(titled, next);
  });
  assert.equal(committed, titled);
  assert.equal(committed.present.title.includes('Renamed'), false);
});

test('a return-this toJSON cannot store a non-enumerable null grid', () => {
  const installs = [
    function () {
      Object.defineProperty(this, 'grid', {
        enumerable: false,
        configurable: true,
        writable: true,
        value: null,
      });
      return this;
    },
    function () {
      Object.defineProperty(this, 'grid', {
        enumerable: false,
        configurable: true,
        writable: true,
        value: [{ pad: [null] }],
      });
      return this;
    },
  ];
  for (const install of installs) {
    const history = createHistory(getComposition('dock.intercept-cargo'));
    const grid = history.present.grid;
    history.present.toJSON = install;
    const committed = commit(history, history.present);
    assert.equal(committed.present.grid, grid);
    assert.notEqual(committed.present.grid, null);
    assert.equal(Array.isArray(committed.present.grid), false);
    assert.equal(committed.past.length, 0);
    const descriptor = Object.getOwnPropertyDescriptor(committed.present, 'grid');
    assert.equal(descriptor && descriptor.value, grid);
  }
});

test('a return-this toJSON cannot keep a non-configurable null grid', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const grid = history.present.grid;
  history.present.toJSON = function () {
    Object.defineProperty(this, 'grid', {
      enumerable: true,
      configurable: false,
      writable: false,
      value: null,
    });
    return this;
  };
  let committed;
  assert.doesNotThrow(() => {
    committed = commit(history, history.present);
  });
  assert.notEqual(committed.present.grid, null);
  assert.equal(committed.present.grid, grid);
  assert.equal(committed.past.length, 0);
  const descriptor = Object.getOwnPropertyDescriptor(committed.present, 'grid');
  assert.equal(Object.prototype.hasOwnProperty.call(descriptor, 'value'), true);
  assert.equal(descriptor.value, grid);
});

test('a return-this toJSON cannot null grid through its setter', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const grid = history.present.grid;
  let slot = grid;
  Object.defineProperty(history.present, 'grid', {
    enumerable: true,
    configurable: true,
    get() { return slot; },
    set(value) { slot = value; },
  });
  history.present.toJSON = function () {
    this.grid = null;
    return this;
  };
  const committed = commit(history, history.present);
  assert.equal(slot, grid);
  assert.equal(history.present.grid, grid);
  assert.notEqual(history.present.grid, null);
  assert.notEqual(committed.present.grid, null);
  assert.equal(committed.present.grid.size, grid.size);
});

test('a parked toJSON cannot commit an in-place or non-configurable null grid', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const first = getComposition('dock.intercept-cargo');
  first.title = 'First rename';
  const once = commit(history, first);
  const live = once.present;
  const grid = live.grid;
  live.grid.pad = ['keep'];
  const parked = once.past[0];
  const parkedGrid = parked.grid;
  parked.toJSON = function () {
    live.grid.pad = [null];
    live.grid.size = null;
    return this;
  };
  Object.defineProperty(parked, 'grid', {
    configurable: true,
    enumerable: true,
    get() { return parkedGrid; },
  });
  const next = getComposition('dock.intercept-cargo');
  next.title = 'Second rename';
  const committed = commit(once, next);
  assert.equal(live.grid, grid);
  assert.equal(live.grid.size, grid.size);
  assert.equal(live.grid.pad[0], 'keep');
  for (const scene of [committed.present, ...committed.past, ...committed.future]) {
    assert.notEqual(scene.grid, null);
    assert.notEqual(scene.grid.size, null);
    if (Array.isArray(scene.grid.pad)) assert.notEqual(scene.grid.pad[0], null);
  }

  const poisons = [
    function (victim) {
      Object.defineProperty(victim, 'grid', {
        configurable: false,
        enumerable: true,
        writable: false,
        value: null,
      });
    },
    function (victim) {
      Object.defineProperty(victim, 'grid', {
        configurable: false,
        enumerable: true,
        writable: false,
        value: [{ pad: [null] }],
      });
    },
  ];
  for (const poison of poisons) {
    const base = createHistory(getComposition('dock.intercept-cargo'));
    const renamed = commit(base, first);
    const victim = renamed.present;
    const victimGrid = victim.grid;
    const parkedScene = renamed.past[0];
    const parkedSceneGrid = parkedScene.grid;
    parkedScene.toJSON = function () {
      poison(victim);
      return this;
    };
    Object.defineProperty(parkedScene, 'grid', {
      configurable: true,
      enumerable: true,
      get() { return parkedSceneGrid; },
    });
    const third = getComposition('dock.intercept-cargo');
    third.title = 'Third rename';
    let returned;
    assert.doesNotThrow(() => {
      returned = commit(renamed, third);
    });
    assert.equal(victim.grid, victimGrid);
    assert.notEqual(returned.present.grid, null);
    assert.equal(Array.isArray(returned.present.grid), false);
    assert.notEqual(returned.present.grid.size, null);
    for (const scene of [returned.present, ...returned.past, ...returned.future]) {
      assert.notEqual(scene.grid, null);
      assert.equal(Array.isArray(scene.grid), false);
      if (Array.isArray(scene.grid.pad)) assert.notEqual(scene.grid.pad[0], null);
      assert.notEqual(scene.grid.size, null);
    }
  }
});

test('a writable non-configurable null grid is assigned back', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const grid = history.present.grid;
  history.present.toJSON = function () {
    Object.defineProperty(this, 'grid', {
      configurable: false,
      writable: true,
      value: null,
    });
    return this;
  };
  let committed;
  assert.doesNotThrow(() => {
    committed = commit(history, history.present);
  });
  assert.equal(history.present.grid, grid);
  assert.equal(committed.present.grid, grid);
  assert.notEqual(committed.present.grid, null);
  assert.equal(committed.past.length, 0);
});

test('a getter-backed grid cannot keep an in-place pad or size null', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const first = getComposition('dock.intercept-cargo');
  first.title = 'First rename';
  const once = commit(history, first);
  const live = once.present;
  const parked = once.past[0];
  const backing = parked.grid;
  const size = backing.size;
  assert.notEqual(backing, live.grid);
  backing.pad = ['keep'];
  Object.defineProperty(parked, 'grid', {
    enumerable: true,
    configurable: true,
    get() { return backing; },
  });
  parked.toJSON = function () {
    this.grid.pad = [null];
    this.grid.size = null;
    return this;
  };
  const next = getComposition('dock.intercept-cargo');
  next.title = 'Second rename';
  const committed = commit(once, next);
  assert.equal(backing, parked.grid);
  assert.equal(backing.size, size);
  assert.notEqual(backing.size, null);
  assert.equal(backing.pad[0], 'keep');
  for (const scene of [committed.present, ...committed.past, ...committed.future]) {
    assert.notEqual(scene.grid, null);
    assert.notEqual(scene.grid.size, null);
    if (Array.isArray(scene.grid.pad)) assert.notEqual(scene.grid.pad[0], null);
  }
});

test('a parked toJSON cannot null a live grid through its setter', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const first = getComposition('dock.intercept-cargo');
  first.title = 'First rename';
  const second = getComposition('dock.intercept-cargo');
  second.title = 'Second rename';
  const twice = commit(commit(history, first), second);
  const undone = restoreHistory(twice, 'undo');
  assert.equal(undone.ok, true, (undone.issues || []).join('\n'));
  const live = undone.history.present;
  const grid = live.grid;
  let slot = grid;
  Object.defineProperty(live, 'grid', {
    enumerable: true,
    configurable: true,
    get() { return slot; },
    set(value) { slot = value; },
  });
  const parked = undone.history.future[0];
  const parkedGrid = parked.grid;
  parked.toJSON = function () {
    live.grid = null;
    return this;
  };
  Object.defineProperty(parked, 'grid', {
    enumerable: true,
    configurable: true,
    get() { return parkedGrid; },
  });
  const again = restoreHistory(undone.history, 'undo');
  assert.equal(slot, grid);
  assert.equal(live.grid, grid);
  assert.equal(live.grid == null, false);
  assert.equal(again.ok && slot == null, false);
  assert.equal(again.ok, true, (again.issues || []).join('\n'));
  const returnedLive = again.history.future[0];
  assert.equal(returnedLive.grid == null, false);
  assert.deepEqual(
    { size: returnedLive.grid.size, snap: returnedLive.grid.snap },
    { size: grid.size, snap: grid.snap },
  );
  for (const scene of [again.history.present, ...again.history.past, ...again.history.future]) {
    assert.equal(scene.grid == null, false);
  }
});

test('a parked toJSON cannot null a live grid through an inherited setter', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const first = getComposition('dock.intercept-cargo');
  first.title = 'First rename';
  const second = getComposition('dock.intercept-cargo');
  second.title = 'Second rename';
  const twice = commit(commit(history, first), second);
  const undone = restoreHistory(twice, 'undo');
  assert.equal(undone.ok, true, (undone.issues || []).join('\n'));
  const live = undone.history.present;
  const grid = live.grid;
  const proto = {};
  let slot = grid;
  Object.defineProperty(proto, 'grid', {
    enumerable: true,
    configurable: true,
    get() { return slot; },
    set(value) { slot = value; },
  });
  const previous = Object.getPrototypeOf(live);
  delete live.grid;
  Object.setPrototypeOf(live, proto);
  const parked = undone.history.future[0];
  const parkedGrid = parked.grid;
  parked.toJSON = function () {
    live.grid = null;
    return this;
  };
  Object.defineProperty(parked, 'grid', {
    enumerable: true,
    configurable: true,
    get() { return parkedGrid; },
  });
  try {
    const again = restoreHistory(undone.history, 'undo');
    assert.equal(slot, grid);
    assert.equal(live.grid, grid);
    assert.equal(live.grid == null, false);
    assert.equal(parked.grid == null, false);
    assert.equal(again.ok && live.grid == null, false);
    assert.equal(again.ok && parked.grid == null, false);
    if (again.ok) {
      for (const scene of [again.history.present, ...again.history.past, ...again.history.future]) {
        assert.equal(scene.grid == null, false);
      }
    }
  } finally {
    Object.setPrototypeOf(live, previous);
  }
});

test('a getter pad push(null) does not keep the extra length', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const first = getComposition('dock.intercept-cargo');
  first.title = 'First rename';
  const once = commit(history, first);
  const parked = once.past[0];
  const backing = parked.grid;
  backing.pad = ['keep'];
  const length = backing.pad.length;
  Object.defineProperty(parked, 'grid', {
    enumerable: true,
    configurable: true,
    get() { return backing; },
  });
  parked.toJSON = function () {
    this.grid.pad.push(null);
    return this;
  };
  const next = getComposition('dock.intercept-cargo');
  next.title = 'Second rename';
  const committed = commit(once, next);
  assert.equal(backing.pad.length, length);
  assert.equal(backing.pad[0], 'keep');
  assert.equal(backing.pad.includes(null), false);
  assert.deepEqual([...backing.pad], ['keep']);
  for (const scene of [committed.present, ...committed.past, ...committed.future]) {
    const pad = scene.grid && scene.grid.pad;
    if (!Array.isArray(pad)) continue;
    assert.equal(pad.includes(null), false);
    assert.deepEqual([...pad], ['keep']);
  }

  const dataHistory = createHistory(getComposition('dock.intercept-cargo'));
  const dataOnce = commit(dataHistory, first);
  const live = dataOnce.present;
  live.grid.pad = ['keep'];
  const liveLength = live.grid.pad.length;
  const dataParked = dataOnce.past[0];
  const dataParkedGrid = dataParked.grid;
  dataParked.toJSON = function () {
    live.grid.pad.push(null);
    return this;
  };
  Object.defineProperty(dataParked, 'grid', {
    enumerable: true,
    configurable: true,
    get() { return dataParkedGrid; },
  });
  const renamed = getComposition('dock.intercept-cargo');
  renamed.title = 'Third rename';
  commit(dataOnce, renamed);
  assert.equal(live.grid.pad.length, liveLength);
  assert.equal(live.grid.pad[0], 'keep');
  assert.equal(live.grid.pad.includes(null), false);
});

test('an inherited writable non-configurable null grid is not left on the caller', () => {
  function install(scene, grid) {
    const proto = {};
    Object.defineProperty(proto, 'grid', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: grid,
    });
    const previous = Object.getPrototypeOf(scene);
    delete scene.grid;
    Object.setPrototypeOf(scene, proto);
    scene.toJSON = function () {
      Object.defineProperty(this, 'grid', {
        configurable: false,
        writable: true,
        value: null,
      });
      Object.defineProperty(this, 'leak', {
        configurable: false,
        writable: true,
        enumerable: true,
        value: null,
      });
      return this;
    };
    return previous;
  }
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const grid = history.present.grid;
  const caller = history.present;
  const previous = install(caller, grid);
  try {
    let committed;
    assert.doesNotThrow(() => {
      committed = commit(history, history.present);
    });
    assert.equal(committed.past.length, 0);
    assert.equal(caller.grid, grid);
    assert.equal(caller.grid == null, false);
    assert.equal(committed.present.grid, grid);
    assert.equal(committed.present.grid == null, false);
    assert.equal(Object.hasOwn(committed.present, 'leak'), false);
    assert.equal(Object.hasOwn(history.present, 'leak'), false);
  } finally {
    Object.setPrototypeOf(caller, previous);
  }

  const historyNext = createHistory(getComposition('dock.intercept-cargo'));
  const nextGrid = historyNext.present.grid;
  const nextCaller = historyNext.present;
  const nextPrevious = install(nextCaller, nextGrid);
  try {
    const next = getComposition('dock.intercept-cargo');
    next.title = 'Renamed dock';
    let committed;
    assert.doesNotThrow(() => {
      committed = commit(historyNext, next);
    });
    assert.equal(nextCaller.grid, nextGrid);
    assert.equal(nextCaller.grid == null, false);
    assert.equal(committed.present.grid == null, false);
    for (const scene of [committed.present, ...committed.past, ...committed.future]) {
      assert.equal(scene.grid == null, false);
      assert.equal(Object.hasOwn(scene, 'leak'), false);
    }
  } finally {
    Object.setPrototypeOf(nextCaller, nextPrevious);
  }
});

test('a nested parked toJSON cannot null a live setter', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const first = getComposition('dock.intercept-cargo');
  first.title = 'First rename';
  const second = getComposition('dock.intercept-cargo');
  second.title = 'Second rename';
  const twice = commit(commit(history, first), second);
  const undone = restoreHistory(twice, 'undo');
  assert.equal(undone.ok, true, (undone.issues || []).join('\n'));
  const live = undone.history.present;
  const grid = live.grid;
  let slot = grid;
  Object.defineProperty(live, 'grid', {
    enumerable: true,
    configurable: true,
    get() { return slot; },
    set(value) { slot = value; },
  });
  const parked = undone.history.future[0];
  const parkedGrid = parked.grid;
  Object.defineProperty(parked, 'grid', {
    enumerable: true,
    configurable: true,
    get() { return parkedGrid; },
  });
  parked.world = {
    toJSON() {
      live.grid = null;
      return {};
    },
  };
  const again = restoreHistory(undone.history, 'undo');
  assert.equal(slot, grid);
  assert.equal(live.grid, grid);
  assert.equal(live.grid == null, false);
  assert.equal(again.ok && slot == null, false);
  assert.equal(again.ok && live.grid == null, false);
});

test('sameProject cannot null a getter-backed pad and size', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const backing = history.present.grid;
  const size = backing.size;
  backing.pad = ['keep'];
  Object.defineProperty(history.present, 'grid', {
    enumerable: true,
    configurable: true,
    get() { return backing; },
  });
  history.present.toJSON = function () {
    this.grid.size = null;
    this.grid.pad = [null];
    return this;
  };
  const next = getComposition('dock.intercept-cargo');
  next.title = 'Renamed dock';
  const committed = commit(history, next);
  assert.equal(committed.past.length, 1);
  assert.equal(committed.present.title, 'Renamed dock');
  assert.deepEqual(
    { size: backing.size, snap: backing.snap, pad: backing.pad.slice() },
    { size, snap: true, pad: ['keep'] },
  );
  const undone = restoreHistory(committed, 'undo');
  assert.equal(undone.ok, true, (undone.issues || []).join('\n'));
  assert.equal(undone.history.past.length, 0);
  assert.deepEqual(
    { size: undone.history.present.grid.size, pad: [...undone.history.present.grid.pad] },
    { size, pad: ['keep'] },
  );
  assert.deepEqual(
    { size: backing.size, snap: backing.snap, pad: [...backing.pad] },
    { size, snap: true, pad: ['keep'] },
  );
});

test('a getter-backed toJSON cannot commit a non-writable snap null', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const backing = history.present.grid;
  const snap = backing.snap;
  const before = { size: backing.size, snap, pad: backing.pad };
  Object.defineProperty(history.present, 'grid', {
    enumerable: true,
    configurable: false,
    get() { return backing; },
  });
  history.present.toJSON = function () {
    Object.defineProperty(this.grid, 'snap', {
      configurable: false,
      writable: false,
      enumerable: true,
      value: null,
    });
    return this;
  };
  let committed;
  assert.doesNotThrow(() => {
    committed = commit(history, history.present);
  });
  assert.equal(committed.past.length, 0);
  assert.deepEqual({ size: backing.size, snap: backing.snap }, { size: before.size, snap });
  assert.deepEqual(
    { size: committed.present.grid.size, snap: committed.present.grid.snap },
    { size: before.size, snap },
  );
  const next = getComposition('dock.intercept-cargo');
  next.title = 'Renamed dock';
  const renamed = commit(history, next);
  assert.equal(renamed.past.length, 1);
  assert.equal(renamed.present.title, 'Renamed dock');
  assert.deepEqual({ size: backing.size, snap: backing.snap }, { size: before.size, snap });
  assert.deepEqual(
    { size: renamed.present.grid.size, snap: renamed.present.grid.snap },
    { size: next.grid.size, snap: next.grid.snap },
  );
});

test('stableStringify does not keep a toJSON snap null', () => {
  const scene = getComposition('dock.intercept-cargo');
  scene.grid = { size: 10, snap: true };
  scene.toJSON = function () {
    this.grid.snap = null;
    return { title: this.title, grid: this.grid };
  };
  scene.grid.snap = true;
  const text = stableStringify(scene);
  assert.equal(text.includes('"snap": null'), false);
  assert.equal(sameJson(scene.grid, { size: 10, snap: true }), true);
  assert.equal(scene.grid.snap, true);
});

test('the caller does not keep a non-configurable leak or an undefined grid', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const caller = history.present;
  const grid = caller.grid;
  caller.toJSON = function () {
    Object.defineProperty(this, 'leak', {
      configurable: false,
      enumerable: true,
      writable: true,
      value: null,
    });
    Object.defineProperty(this, 'grid', {
      configurable: false,
      writable: false,
      value: undefined,
    });
    return this;
  };
  const committed = commit(history, caller);
  assert.equal(committed.past.length, 0);
  assert.equal(Object.hasOwn(caller, 'leak'), false);
  assert.deepEqual(
    { size: caller.grid.size, snap: caller.grid.snap },
    { size: grid.size, snap: grid.snap },
  );
  assert.equal(caller.grid === undefined, false);
  assert.deepEqual(
    { size: committed.present.grid.size, snap: committed.present.grid.snap },
    { size: grid.size, snap: grid.snap },
  );
});

test('undo keeps a getter grid that has no setter', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const next = getComposition('dock.intercept-cargo');
  next.title = 'Renamed dock';
  const committed = commit(history, next);
  const grid = { size: 12, snap: true, origin: { x: 8, z: 1 } };
  Object.defineProperty(committed.present, 'grid', {
    enumerable: true,
    configurable: true,
    get() { return grid; },
  });
  const undone = restoreHistory(committed, 'undo');
  assert.equal(undone.ok, true, (undone.issues || []).join('\n'));
  assert.deepEqual(undone.history.future[0].grid, grid);
  const proto = {};
  Object.defineProperty(proto, 'toJSON', {
    enumerable: false,
    value() {
      return { title: this.title, objects: this.objects, schema: this.schema };
    },
  });
  const again = createHistory(getComposition('dock.intercept-cargo'));
  const renamed = commit(again, next);
  const previous = Object.getPrototypeOf(renamed.present);
  Object.setPrototypeOf(renamed.present, proto);
  try {
    const back = restoreHistory(renamed, 'undo');
    assert.equal(back.ok, true, (back.issues || []).join('\n'));
    assert.deepEqual(
      { size: back.history.future[0].grid.size, snap: back.history.future[0].grid.snap },
      { size: renamed.present.grid.size, snap: renamed.present.grid.snap },
    );
  } finally {
    Object.setPrototypeOf(renamed.present, previous);
  }
});

test('nested non-writable nulls are not committed', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  history.present.grid.child = { size: 4, snap: true };
  history.present.toJSON = function () {
    Object.defineProperty(this.grid.child, 'size', {
      configurable: false,
      writable: false,
      enumerable: true,
      value: null,
    });
    return this;
  };
  const next = getComposition('dock.intercept-cargo');
  next.title = 'Renamed dock';
  const committed = commit(history, next);
  assert.equal(committed.past.length, 1);
  assert.equal(committed.present.title, 'Renamed dock');
  assert.deepEqual(history.present.grid.child, { size: 4, snap: true });
  const backing = { size: 10, snap: true, origin: { x: 3, z: 4 } };
  const hosted = createHistory(getComposition('dock.intercept-cargo'));
  Object.defineProperty(hosted.present, 'grid', {
    enumerable: true,
    configurable: true,
    get() { return backing; },
  });
  hosted.present.toJSON = function () {
    Object.defineProperty(this.grid, 'origin', {
      configurable: false,
      writable: false,
      enumerable: true,
      value: { x: null },
    });
    return this;
  };
  const renamed = getComposition('dock.intercept-cargo');
  renamed.title = 'Renamed dock';
  const landed = commit(hosted, renamed);
  assert.equal(landed.past.length, 1);
  assert.equal(landed.present.title, 'Renamed dock');
  assert.deepEqual(backing.origin, { x: 3, z: 4 });
});

test('a frozen pad length does not replace the pre-call pad', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const grid = history.present.grid;
  grid.pad = ['keep', 'also'];
  history.present.toJSON = function () {
    this.grid.pad.pop();
    Object.defineProperty(this.grid.pad, 'length', { configurable: false, writable: false, value: this.grid.pad.length });
    return this;
  };
  const popped = getComposition('dock.intercept-cargo');
  popped.title = 'Renamed dock';
  const committed = commit(history, popped);
  assert.equal(committed.past.length, 1);
  assert.equal(committed.present.title, 'Renamed dock');
  assert.deepEqual([...grid.pad], ['keep', 'also']);
  const mid = createHistory(getComposition('dock.intercept-cargo'));
  mid.present.grid.pad = ['keep', 'mid', 'tail'];
  mid.present.toJSON = function () {
    this.grid.pad.splice(1, 1);
    Object.defineProperty(this.grid.pad, 'length', { configurable: false, writable: false, value: this.grid.pad.length });
    return this;
  };
  const spliced = commit(mid, popped);
  assert.equal(spliced.past.length, 1);
  assert.deepEqual([...mid.present.grid.pad], ['keep', 'mid', 'tail']);
  const grown = createHistory(getComposition('dock.intercept-cargo'));
  grown.present.grid.pad = ['keep'];
  grown.present.toJSON = function () {
    this.grid.pad.length = 4;
    Object.defineProperty(this.grid.pad, 'length', { configurable: false, writable: false, value: this.grid.pad.length });
    return this;
  };
  const lengthened = commit(grown, popped);
  assert.equal(lengthened.past.length, 1);
  assert.deepEqual([...grown.present.grid.pad], ['keep']);
  assert.equal(grown.present.grid.pad.length, 1);
});

test('an inherited pad push is not stored on the past scene', () => {
  function retitle(install) {
    const history = createHistory(getComposition('dock.intercept-cargo'));
    const proto = {};
    const livePad = install(proto);
    Object.setPrototypeOf(history.present.grid, proto);
    history.present.toJSON = function () {
      livePad.push(null);
      return this;
    };
    history.present.title = 'Renamed dock';
    const committed = commit(history, history.present);
    assert.equal(committed.past.length, 1);
    assert.equal(committed.present.title, 'Renamed dock');
    assert.deepEqual(livePad, ['keep']);
    assert.deepEqual(committed.present.grid.pad, ['keep']);
    assert.deepEqual(committed.past[0].grid.pad, ['keep']);
  }
  retitle((proto) => {
    const pad = ['keep'];
    proto.pad = pad;
    return pad;
  });
  retitle((proto) => {
    const pad = ['keep'];
    Object.defineProperty(proto, 'pad', {
      enumerable: true,
      configurable: true,
      get() { return pad; },
    });
    return pad;
  });
});

test('undo and redo restore a snap setter and world credits', () => {
  function travel(install, read) {
    const history = createHistory(getComposition('dock.intercept-cargo'));
    const sceneA = getComposition('dock.intercept-cargo');
    sceneA.title = 'A';
    const sceneB = getComposition('dock.intercept-cargo');
    sceneB.title = 'B';
    const twice = commit(commit(history, sceneA), sceneB);
    const undone = restoreHistory(twice, 'undo');
    assert.equal(undone.ok, true, (undone.issues || []).join('\n'));
    assert.equal(undone.history.present.title, 'A');
    assert.equal(undone.history.past.length, 1);
    assert.equal(undone.history.future.length, 1);
    const present = undone.history.present;
    const futureScene = undone.history.future[0];
    const before = install(present);
    const worldCredits = futureScene.world.credits;
    const worldProfile = futureScene.world.fixtureProfile;
    const worldSector = futureScene.world.sectorId;
    const futureGrid = futureScene.grid;
    Object.defineProperty(futureScene, 'grid', {
      enumerable: true,
      configurable: true,
      get() { return futureGrid; },
    });
    futureScene.world.toJSON = function () {
      install(present, true);
      return {};
    };
    const back = restoreHistory(undone.history, 'undo');
    assert.equal(back.ok, true, (back.issues || []).join('\n'));
    assert.equal(back.history.past.length, 0);
    assert.equal(back.history.future[0].title, 'A');
    assert.equal(read(back.history.future[0]), before);
    const redone = restoreHistory(back.history, 'redo');
    assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
    assert.equal(redone.history.present.title, 'A');
    assert.equal(redone.history.past.length, 1);
    assert.equal(read(redone.history.present), before);
    const again = restoreHistory(redone.history, 'redo');
    assert.equal(again.ok, true, (again.issues || []).join('\n'));
    assert.equal(again.history.present.title, 'B');
    assert.equal(again.history.past.length, 2);
    assert.equal(worldCredits, 5000);
    assert.equal(again.history.present.world.credits, 5000);
    assert.equal(again.history.present.world.fixtureProfile, worldProfile);
    assert.equal(again.history.present.world.sectorId, worldSector);
  }
  travel((present, poison) => {
    const descriptor = Object.getOwnPropertyDescriptor(present.grid, 'snap');
    if (!poison && (!descriptor || !descriptor.set)) {
      let snap = present.grid.snap;
      const before = snap;
      Object.defineProperty(present.grid, 'snap', {
        enumerable: true,
        configurable: true,
        get() { return snap; },
        set(value) { snap = value; },
      });
      return before;
    }
    if (poison) present.grid.snap = null;
    return present.grid.snap;
  }, (scene) => scene.grid.snap);
  travel((present, poison) => {
    const descriptor = Object.getOwnPropertyDescriptor(present.world, 'credits');
    if (!poison && (!descriptor || !descriptor.set)) {
      let credits = present.world.credits;
      const before = credits;
      Object.defineProperty(present.world, 'credits', {
        enumerable: true,
        configurable: true,
        get() { return credits; },
        set(value) { credits = value; },
      });
      return before;
    }
    if (poison) present.world.credits = null;
    return present.world.credits;
  }, (scene) => scene.world.credits);
});

test('a nested world tag push is not kept after commit or undo', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const first = getComposition('dock.intercept-cargo');
  first.title = 'First rename';
  const once = commit(history, first);
  const tags = ['keep'];
  once.present.world.pocket = { tags };
  const parked = once.past[0];
  const parkedGrid = parked.grid;
  Object.defineProperty(parked, 'grid', {
    enumerable: true,
    configurable: true,
    get() { return parkedGrid; },
  });
  parked.toJSON = function () {
    tags.push(null);
    return this;
  };
  const next = getComposition('dock.intercept-cargo');
  next.title = 'Renamed dock';
  const committed = commit(once, next);
  assert.equal(committed.present.title, 'Renamed dock');
  assert.equal(committed.past.length, 2);
  assert.deepEqual(tags, ['keep']);
  assert.deepEqual(once.present.world.pocket.tags, ['keep']);
  const undone = restoreHistory(committed, 'undo');
  assert.equal(undone.ok, true, (undone.issues || []).join('\n'));
  assert.equal(undone.history.present.title, 'First rename');
  assert.equal(undone.history.past.length, 1);
  assert.deepEqual(undone.history.present.world.pocket.tags, ['keep']);
  assert.deepEqual(tags, ['keep']);
});

test('a non-writable bias null is not hidden by a clean grid', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const grid = history.present.grid;
  grid.bias = 4;
  Object.defineProperty(history.present, 'grid', {
    enumerable: true,
    configurable: true,
    get() { return grid; },
  });
  history.present.toJSON = function () {
    Object.defineProperty(this.grid, 'bias', {
      value: null,
      writable: false,
      configurable: false,
    });
    return this;
  };
  const committed = commit(history, history.present);
  assert.equal(committed.past.length, 0);
  assert.equal(committed.present.title, history.present.title);
  assert.equal(grid.bias, 4);
  assert.equal(committed.present.grid, grid);
  assert.equal(committed.present.grid.bias, 4);

  const closed = createHistory(getComposition('dock.intercept-cargo'));
  const backing = closed.present.grid;
  backing.bias = 4;
  Object.defineProperty(closed.present, 'grid', {
    enumerable: true,
    configurable: true,
    get() { return backing; },
  });
  closed.present.toJSON = function () {
    Object.defineProperty(backing, 'bias', {
      value: null,
      writable: false,
      configurable: false,
    });
    return this;
  };
  const hidden = commit(closed, closed.present);
  assert.equal(backing.bias, 4);
  assert.equal(hidden.present.grid.bias, 4);
  assert.equal(hidden.present.title, closed.present.title);
  assert.equal(hidden.past.length, 1);
});

test('a non-writable camera tag null is not committed', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  history.present.camera.tag = 'keep';
  history.present.toJSON = function () {
    Object.defineProperty(this.camera, 'tag', {
      configurable: false,
      writable: false,
      enumerable: true,
      value: null,
    });
    return this;
  };
  const next = getComposition('dock.intercept-cargo');
  next.title = 'Renamed dock';
  const committed = commit(history, next);
  assert.equal(committed.past.length, 1);
  assert.equal(committed.present.title, 'Renamed dock');
  assert.equal(history.present.camera.tag, 'keep');
});

test('formatReport stringifies a detached clone', () => {
  const scene = getComposition('dock.intercept-cargo');
  const grid = scene.grid;
  const pad = ['keep'];
  grid.pad = pad;
  const credits = scene.world.credits;
  const actor = objectById(scene, 'player');
  const team = actor.team;
  const zoom = scene.camera.zoom;
  const size = grid.size;
  pad.toJSON = function () {
    this.push('pad');
    return this;
  };
  grid.toJSON = function () {
    this.pad.push('grid');
    return this;
  };
  scene.world.toJSON = function () {
    this.credits = 0;
    return this;
  };
  actor.toJSON = function () {
    this.team = 'poison';
    return this;
  };
  scene.camera.toJSON = function () {
    this.zoom = 0;
    grid.size = null;
    return this;
  };
  const text = formatReport({ ok: false, project: scene, issues: ['x'] });
  assert.equal(typeof text, 'string');
  assert.equal(pad.length, 1);
  assert.equal(pad[0], 'keep');
  assert.equal(pad.includes('grid'), false);
  assert.equal(pad.includes('pad'), false);
  assert.equal(scene.world.credits, credits);
  assert.equal(credits, 5000);
  assert.equal(actor.team, team);
  assert.equal(scene.camera.zoom, zoom);
  assert.equal(zoom, 3.2);
  assert.equal(grid.size, size);
  assert.equal(size, 10);
});

test('a retitle does not park shared nested objects or a frozen pad', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const live = history.present;
  const grid = live.grid;
  const origin = { x: 3, z: 4 };
  const child = { size: 8 };
  grid.origin = origin;
  grid.child = child;
  grid.bias = 4;
  grid.pad = ['keep', 'also'];
  live.toJSON = function () {
    Object.defineProperty(origin, 'x', { value: null, writable: false, configurable: false });
    Object.defineProperty(child, 'size', { value: null, writable: false, configurable: false });
    Object.defineProperty(grid, 'bias', { value: null, writable: false, configurable: false });
    grid.pad.pop();
    Object.defineProperty(grid.pad, 'length', { value: grid.pad.length, writable: false, configurable: false });
    return this;
  };
  const next = getComposition('dock.intercept-cargo');
  next.title = 'Renamed dock';
  const committed = commit(history, next);
  const parked = committed.past[0];
  assert.notEqual(parked, live);
  assert.equal(committed.past.length, 1);
  assert.equal(committed.present.title, 'Renamed dock');
  assert.equal(origin.x, 3);
  assert.equal(child.size, 8);
  assert.equal(grid.bias, 4);
  assert.deepEqual(grid.pad, ['keep', 'also']);
  assert.equal(Object.getOwnPropertyDescriptor(grid.pad, 'length').writable, true);
  assert.equal(parked.grid.origin.x, 3);
  assert.equal(parked.grid.child.size, 8);
  assert.equal(parked.grid.bias, 4);
  assert.deepEqual(parked.grid.pad, ['keep', 'also']);
  assert.notEqual(parked.world, live.world);
  assert.notEqual(parked.camera, live.camera);
  assert.notEqual(parked.objects, live.objects);
  assert.notEqual(parked.objects[0], live.objects[0]);
  assert.notEqual(parked.grid.origin, origin);
  assert.notEqual(parked.grid.child, child);
});

test('stableStringify restores a closed-over bias', () => {
  const scene = getComposition('dock.intercept-cargo');
  const grid = scene.grid;
  grid.bias = 4;
  scene.toJSON = function () {
    Object.defineProperty(grid, 'bias', { value: null, writable: false, configurable: false });
    return this;
  };
  const text = stableStringify(scene);
  assert.equal(grid.bias, 4);
  assert.equal(text.includes('"bias": null'), false);
  assert.equal(text.includes('"bias": 4'), true);
});

test('a getter grid bias stays 4 when toJSON seals the getter object', () => {
  const placed = placePlayer(emptyProject({ id: 'dock.untitled', title: 'Untitled dock', seed: 1 }));
  const history = createHistory(placed.project);
  const grid = history.present.grid;
  grid.bias = 4;
  Object.defineProperty(history.present, 'grid', {
    enumerable: true,
    configurable: true,
    get() { return grid; },
  });
  history.present.toJSON = function () {
    Object.defineProperty(grid, 'bias', { value: null, writable: false, configurable: false });
    return this;
  };
  const committed = commit(history, history.present);
  assert.equal(grid.bias, 4);
  assert.equal(committed.present.grid.bias, 4);
  assert.equal(committed.present.title, 'Untitled dock');
  assert.equal(committed.past.length, 1);
});

test('a data-grid bias seal does not replace the present', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const before = history.present;
  const grid = before.grid;
  grid.bias = 4;
  before.toJSON = function () {
    Object.defineProperty(grid, 'bias', { value: null, writable: false, configurable: false });
    return this;
  };
  const committed = commit(history, before);
  assert.equal(grid.bias, 4);
  assert.equal(committed.past.length, 0);
  assert.equal(committed.present, before);
  assert.equal(committed.present.title, before.title);
  assert.equal(committed.present.grid, grid);
  assert.equal(committed.present.grid.bias, 4);
});

test('a failed restore does not swap the present or null bias', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const sceneA = getComposition('dock.intercept-cargo');
  sceneA.title = 'A';
  const sceneB = getComposition('dock.intercept-cargo');
  sceneB.title = 'B';
  const twice = commit(commit(history, sceneA), sceneB);
  const undone = restoreHistory(twice, 'undo');
  assert.equal(undone.ok, true, (undone.issues || []).join('\n'));
  const present = undone.history.present;
  const grid = present.grid;
  grid.bias = 4;
  const future = undone.history.future[0];
  const futureGrid = future.grid;
  Object.defineProperty(future, 'grid', {
    enumerable: true,
    configurable: true,
    get() { return futureGrid; },
  });
  future.toJSON = function () {
    Object.defineProperty(grid, 'bias', { value: null, writable: false, configurable: false });
    return this;
  };
  const result = restoreHistory(undone.history, 'undo');
  assert.equal(grid.bias, 4);
  assert.equal(undone.history.present, present);
  assert.equal(undone.history.present.grid.bias, 4);
  if (!result.ok) {
    assert.equal(result.history.present, present);
    assert.deepEqual(result.issues, ['scene could not be cloned']);
  } else {
    assert.equal(result.history.past.length, 0);
    assert.equal(result.history.future[0].title, 'A');
  }
});

test('an inherited getter-grid pad push is not stored', () => {
  function retitle(install) {
    const history = createHistory(getComposition('dock.intercept-cargo'));
    const first = getComposition('dock.intercept-cargo');
    first.title = 'First rename';
    const once = commit(history, first);
    const parked = once.past[0];
    const grid = parked.grid;
    const proto = {};
    const pad = install(proto);
    Object.setPrototypeOf(grid, proto);
    Object.defineProperty(parked, 'grid', {
      enumerable: true,
      configurable: true,
      get() { return grid; },
    });
    parked.toJSON = function () {
      pad.push(null);
      return this;
    };
    const next = getComposition('dock.intercept-cargo');
    next.title = 'Renamed dock';
    const committed = commit(once, next);
    assert.equal(committed.past.length, 2);
    assert.equal(committed.present.title, 'Renamed dock');
    assert.deepEqual(pad, ['keep']);
    assert.deepEqual(committed.past[0].grid.pad, ['keep']);
  }
  retitle((proto) => {
    const pad = ['keep'];
    proto.pad = pad;
    return pad;
  });
  retitle((proto) => {
    const pad = ['keep'];
    Object.defineProperty(proto, 'pad', {
      enumerable: true,
      configurable: true,
      get() { return pad; },
    });
    return pad;
  });
});

test('a parked tag mutation is not copied into the past scene', () => {
  for (const mode of ['push', 'splice', 'length']) {
    const history = createHistory(getComposition('dock.intercept-cargo'));
    const first = getComposition('dock.intercept-cargo');
    first.title = 'First rename';
    const once = commit(history, first);
    const tags = ['keep'];
    once.past[0].world.pocket = { tags };
    const parked = once.past[0];
    const parkedGrid = parked.grid;
    Object.defineProperty(parked, 'grid', {
      enumerable: true,
      configurable: true,
      get() { return parkedGrid; },
    });
    parked.toJSON = function () {
      if (mode === 'push') tags.push(null);
      else if (mode === 'splice') tags.splice(0, 1, null);
      else tags.length = 0;
      return this;
    };
    const next = getComposition('dock.intercept-cargo');
    next.title = 'Renamed dock';
    const committed = commit(once, next);
    assert.equal(committed.past.length, 2);
    assert.equal(committed.present.title, 'Renamed dock');
    assert.deepEqual(tags, ['keep']);
    const stored = committed.past[0];
    assert.deepEqual(stored.world.pocket.tags, ['keep']);
    const back = restoreHistory(committed, 'undo');
    assert.equal(back.ok, true, (back.issues || []).join('\n'));
    const again = restoreHistory(back.history, 'undo');
    assert.equal(again.ok, true, (again.issues || []).join('\n'));
    assert.equal(again.history.past.length, 0);
    assert.equal(again.history.present.title, parked.title);
    assert.deepEqual(again.history.present.world.pocket.tags, ['keep']);
    assert.deepEqual(tags, ['keep']);
  }
});

test('setters behind a get-only accessor survive undo and redo', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const sceneA = getComposition('dock.intercept-cargo');
  sceneA.title = 'A';
  const sceneB = getComposition('dock.intercept-cargo');
  sceneB.title = 'B';
  const twice = commit(commit(history, sceneA), sceneB);
  const undone = restoreHistory(twice, 'undo');
  assert.equal(undone.ok, true, (undone.issues || []).join('\n'));
  assert.equal(undone.history.present.title, 'A');
  assert.equal(undone.history.past.length, 1);
  const present = undone.history.present;
  const grid = present.grid;
  let snap = true;
  Object.defineProperty(grid, 'snap', {
    enumerable: true,
    configurable: true,
    get() { return snap; },
    set(value) { snap = value; },
  });
  Object.defineProperty(present, 'grid', {
    enumerable: true,
    configurable: true,
    get() { return grid; },
  });
  const future = undone.history.future[0];
  const futureGrid = future.grid;
  Object.defineProperty(future, 'grid', {
    enumerable: true,
    configurable: true,
    get() { return futureGrid; },
  });
  future.world.toJSON = function () {
    present.grid.snap = null;
    return {};
  };
  const back = restoreHistory(undone.history, 'undo');
  assert.equal(back.ok, true, (back.issues || []).join('\n'));
  assert.equal(back.history.past.length, 0);
  assert.equal(back.history.future[0].title, 'A');
  assert.equal(back.history.future[0].grid.snap, true);
  assert.equal(snap, true);
  const redone = restoreHistory(back.history, 'redo');
  assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
  assert.equal(redone.history.present.title, 'A');
  assert.equal(redone.history.past.length, 1);
  assert.equal(redone.history.present.grid.snap, true);
  assert.equal(snap, true);

  const again = createHistory(getComposition('dock.intercept-cargo'));
  const redoA = getComposition('dock.intercept-cargo');
  redoA.title = 'A';
  const redoB = getComposition('dock.intercept-cargo');
  redoB.title = 'B';
  const creditsHistory = restoreHistory(commit(commit(again, redoA), redoB), 'undo');
  assert.equal(creditsHistory.ok, true, (creditsHistory.issues || []).join('\n'));
  const creditPresent = creditsHistory.history.present;
  const pocket = {};
  let credits = 40;
  Object.defineProperty(pocket, 'credits', {
    enumerable: true,
    configurable: true,
    get() { return credits; },
    set(value) { credits = value; },
  });
  Object.defineProperty(creditPresent.world, 'pocket', {
    enumerable: true,
    configurable: true,
    get() { return pocket; },
  });
  const creditFuture = creditsHistory.history.future[0];
  const creditGrid = creditFuture.grid;
  Object.defineProperty(creditFuture, 'grid', {
    enumerable: true,
    configurable: true,
    get() { return creditGrid; },
  });
  creditFuture.world.toJSON = function () {
    creditPresent.world.pocket.credits = null;
    return {};
  };
  const creditBack = restoreHistory(creditsHistory.history, 'undo');
  assert.equal(creditBack.ok, true, (creditBack.issues || []).join('\n'));
  assert.equal(creditBack.history.future[0].title, 'A');
  assert.equal(creditBack.history.future[0].world.pocket.credits, 40);
  assert.equal(credits, 40);
  const creditRedo = restoreHistory(creditBack.history, 'redo');
  assert.equal(creditRedo.ok, true, (creditRedo.issues || []).join('\n'));
  assert.equal(creditRedo.history.present.title, 'A');
  assert.equal(creditRedo.history.past.length, 1);
  assert.equal(creditRedo.history.present.world.pocket.credits, 40);
  assert.equal(credits, 40);
});

test('nested toJSON cannot seal bias or poison the player', () => {
  const scene = getComposition('dock.intercept-cargo');
  const grid = scene.grid;
  const actor = scene.objects[0];
  const team = actor.team;
  grid.bias = 4;
  grid.origin = { x: 3, z: 4 };
  grid.origin.toJSON = function () {
    Object.defineProperty(grid, 'bias', { value: null, writable: false, configurable: false });
    return this;
  };
  const originText = stableStringify(scene);
  assert.equal(grid.bias, 4);
  assert.equal(originText.includes('"bias": null'), false);
  delete grid.origin.toJSON;
  actor.cargo = {
    toJSON() {
      Object.defineProperty(grid, 'bias', { value: null, writable: false, configurable: false });
      actor.team = 'poison';
      return this;
    },
  };
  const cargoText = stableStringify(scene);
  assert.equal(grid.bias, 4);
  assert.equal(actor.team, team);
  assert.equal(cargoText.includes('"bias": null'), false);
  assert.equal(cargoText.includes('poison'), false);
  const size = byteLength(scene);
  assert.equal(typeof size, 'number');
  assert.equal(grid.bias, 4);
  assert.equal(actor.team, team);
});

test('a seal to zero does not stick on the live bias', () => {
  const scene = getComposition('dock.intercept-cargo');
  const grid = scene.grid;
  grid.bias = 4;
  scene.toJSON = function () {
    Object.defineProperty(grid, 'bias', { value: 0, writable: false, configurable: false });
    return this;
  };
  const text = stableStringify(scene);
  assert.equal(grid.bias, 4);
  assert.equal(Object.getOwnPropertyDescriptor(grid, 'bias').writable, true);
  assert.equal(text.includes('"bias": 0'), false);
  assert.equal(text.includes('"bias": 4'), true);
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const live = history.present.grid;
  live.bias = 4;
  history.present.toJSON = function () {
    Object.defineProperty(live, 'bias', { value: 0, writable: false, configurable: false });
    return this;
  };
  const next = getComposition('dock.intercept-cargo');
  next.title = 'Renamed dock';
  const committed = commit(history, next);
  assert.equal(committed.past.length, 1);
  assert.equal(committed.present.title, 'Renamed dock');
  assert.equal(live.bias, 4);
  assert.equal(Object.getOwnPropertyDescriptor(live, 'bias').configurable, true);
});

test('a prototype toJSON getter is not read on the live project', () => {
  const prior = Object.getOwnPropertyDescriptor(Object.prototype, 'toJSON');
  const scene = getComposition('dock.intercept-cargo');
  const grid = scene.grid;
  const pad = ['keep'];
  grid.pad = pad;
  const credits = scene.world.credits;
  const zoom = scene.camera.zoom;
  const size = grid.size;
  const player = objectById(scene, 'player');
  const team = player.team;
  try {
    Object.defineProperty(Object.prototype, 'toJSON', {
      configurable: true,
      get() {
        if (this && this.project && this.project.grid && Array.isArray(this.project.grid.pad)
          && this.project.grid.pad.includes('keep')) {
          this.project.grid.pad.push('proto');
          this.project.world.credits = 0;
          this.project.camera.zoom = 0;
          this.project.grid.size = null;
          const actor = this.project.objects.find((object) => object && object.isPlayer);
          if (actor) actor.team = 'poison';
        }
        if (this && this.bias === 4) {
          Object.defineProperty(this, 'bias', { value: null, writable: false, configurable: false });
        }
        return function () { return {}; };
      },
    });
    Object.defineProperty(grid, 'toJSON', {
      configurable: true,
      value() {
        this.pad.push('grid');
        this.size = null;
        return this;
      },
    });
    Object.defineProperty(scene.world, 'toJSON', {
      configurable: true,
      value() {
        this.credits = 0;
        return this;
      },
    });
    Object.defineProperty(pad, 'toJSON', {
      configurable: true,
      value() {
        this.push('pad');
        return this;
      },
    });
    Object.defineProperty(player, 'toJSON', {
      configurable: true,
      value() {
        this.team = 'poison';
        return this;
      },
    });
    Object.defineProperty(scene.camera, 'toJSON', {
      configurable: true,
      value() {
        this.zoom = 0;
        return this;
      },
    });
    formatReport({ ok: false, project: scene, issues: ['x'] });
    assert.equal(pad.length, 1);
    assert.equal(pad[0], 'keep');
    assert.equal(scene.world.credits, credits);
    assert.equal(credits, 5000);
    assert.equal(player.team, team);
    assert.equal(scene.camera.zoom, zoom);
    assert.equal(zoom, 3.2);
    assert.equal(grid.size, size);
    assert.equal(size, 10);
    grid.bias = 4;
    const text = stableStringify(scene);
    assert.equal(grid.bias, 4);
    assert.equal(text.includes('"bias": null'), false);
  } finally {
    if (prior) Object.defineProperty(Object.prototype, 'toJSON', prior);
    else delete Object.prototype.toJSON;
  }
});

test('formatReport detaches the object returned by toJSON', () => {
  const scene = getComposition('dock.intercept-cargo');
  const grid = scene.grid;
  const pad = ['keep'];
  const size = grid.size;
  grid.pad = pad;
  pad.toJSON = function () {
    this.push('pad');
    return this;
  };
  grid.toJSON = function () {
    this.pad.push('grid');
    this.size = null;
    return this;
  };
  scene.toJSON = function () {
    return grid;
  };
  formatReport(scene);
  assert.equal(pad.length, 1);
  assert.equal(pad[0], 'keep');
  assert.equal(grid.size, size);
  assert.equal(size, 10);
});

test('an inherited Object.prototype grid getter is not called', () => {
  const prior = Object.getOwnPropertyDescriptor(Object.prototype, 'grid');
  const scene = getComposition('dock.intercept-cargo');
  const grid = scene.grid;
  const pad = ['keep'];
  const actor = objectById(scene, 'player');
  const team = actor.team;
  grid.bias = 4;
  grid.pad = pad;
  try {
    Object.defineProperty(Object.prototype, 'grid', {
      configurable: true,
      get() {
        if (this && this.bias === 4) {
          Object.defineProperty(this, 'bias', { value: null, writable: false, configurable: false });
        }
        if (this && Array.isArray(this.pad)) this.pad.push('from-proto-grid');
        if (this && Object.prototype.hasOwnProperty.call(this, 'team')) this.team = 'poison';
        return { size: 10, snap: true };
      },
    });
    formatReport({ ok: false, project: scene, issues: ['x'] });
    assert.equal(grid.bias, 4);
    assert.equal(actor.team, team);
    assert.equal(pad.length, 1);
    assert.equal(pad[0], 'keep');
    const size = byteLength(scene);
    assert.equal(typeof size, 'number');
    assert.equal(grid.bias, 4);
    assert.equal(actor.team, team);
    assert.equal(pad.includes('from-proto-grid'), false);
  } finally {
    if (prior) Object.defineProperty(Object.prototype, 'grid', prior);
    else delete Object.prototype.grid;
  }
});

test('a parked past scene is not the caller', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const live = history.present;
  const grid = live.grid;
  const origin = { x: 3, z: 4 };
  const child = { size: 8 };
  grid.origin = origin;
  grid.child = child;
  grid.bias = 4;
  grid.pad = ['keep', 'also'];
  live.toJSON = function () {
    Object.defineProperty(origin, 'x', { value: null, writable: false, configurable: false });
    Object.defineProperty(child, 'size', { value: null, writable: false, configurable: false });
    Object.defineProperty(grid, 'bias', { value: null, writable: false, configurable: false });
    grid.pad.pop();
    Object.defineProperty(grid.pad, 'length', { value: grid.pad.length, writable: false, configurable: false });
    return this;
  };
  const next = getComposition('dock.intercept-cargo');
  next.title = 'Renamed dock';
  const committed = commit(history, next);
  assert.equal(committed.past.length, 1);
  assert.equal(committed.present.title, 'Renamed dock');
  assert.notEqual(committed.past[0], live);
  assert.notEqual(committed.past[0].world, live.world);
  assert.notEqual(committed.past[0].camera, live.camera);
  assert.notEqual(committed.past[0].objects, live.objects);
  assert.notEqual(committed.past[0].objects[0], live.objects[0]);
  assert.notEqual(committed.past[0].grid.origin, origin);
  assert.notEqual(committed.past[0].grid.child, child);
  assert.equal(origin.x, 3);
  assert.equal(child.size, 8);
  assert.equal(grid.bias, 4);
  assert.deepEqual(grid.pad, ['keep', 'also']);
  origin.x = 9;
  child.size = 1;
  const undone = restoreHistory(committed, 'undo');
  assert.equal(undone.ok, true, (undone.issues || []).join('\n'));
  assert.equal(undone.history.past.length, 0);
  assert.equal(undone.history.present.grid.origin.x, 3);
  assert.equal(undone.history.present.grid.child.size, 8);
  assert.equal(grid.bias, 4);
  assert.deepEqual(grid.pad, ['keep', 'also']);
});

test('an unchanged grid shape is still copied when the scene is parked', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const live = history.present;
  const origin = { x: 3, z: 4 };
  const child = { size: 8 };
  live.grid.origin = origin;
  live.grid.child = child;
  live.toJSON = function () {
    Object.defineProperty(live, 'injected', {
      value: 1,
      writable: false,
      configurable: false,
    });
    return this;
  };
  const next = getComposition('dock.intercept-cargo');
  next.title = 'Renamed dock';
  const committed = commit(history, next);
  assert.equal(committed.past.length, 1);
  assert.equal(committed.present.title, 'Renamed dock');
  assert.notEqual(committed.past[0].grid, live.grid);
  assert.notEqual(committed.past[0].grid.origin, origin);
  assert.notEqual(committed.past[0].grid.child, child);
  origin.x = 9;
  assert.equal(committed.past[0].grid.origin.x, 3);
  assert.equal(live.grid.origin.x, 9);
});

test('commit of the same present does not swap a sealed bias', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const before = history.present;
  const schema = before.schema;
  const title = before.title;
  const grid = before.grid;
  grid.bias = 4;
  before.toJSON = function () {
    Object.defineProperty(before, 'title', { value: 'POISON', writable: false, configurable: false });
    Object.defineProperty(grid, 'bias', { value: 0, writable: false, configurable: false });
    Object.defineProperties(before, {
      schema: { value: 'POISON', writable: false, configurable: false },
    });
    return this;
  };
  const committed = commit(history, history.present);
  assert.equal(committed.past.length, 0);
  assert.equal(committed, history);
  assert.equal(committed.present, before);
  assert.equal(before.grid, grid);
  assert.equal(committed.present.grid, grid);
  assert.equal(grid.bias, 4);
  assert.equal(committed.present.grid.bias, 4);
  assert.equal(before.title, title);
  assert.equal(committed.present.title, title);
  const titleDesc = Object.getOwnPropertyDescriptor(before, 'title');
  assert.equal(titleDesc.value, title);
  assert.equal(titleDesc.writable, true);
  assert.equal(titleDesc.configurable, true);
  const bias = Object.getOwnPropertyDescriptor(grid, 'bias');
  assert.equal(bias.value, 4);
  assert.equal(bias.writable, true);
  assert.equal(bias.configurable, true);
  assert.equal(before.schema, schema);
  assert.equal(committed.present.schema, schema);
  const schemaDesc = Object.getOwnPropertyDescriptor(before, 'schema');
  assert.equal(schemaDesc.value, schema);
  assert.equal(schemaDesc.writable, true);
});

test('a second get-only accessor keeps snap and nested credits', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const sceneA = getComposition('dock.intercept-cargo');
  sceneA.title = 'A';
  const sceneB = getComposition('dock.intercept-cargo');
  sceneB.title = 'B';
  const twice = commit(commit(history, sceneA), sceneB);
  const undone = restoreHistory(twice, 'undo');
  assert.equal(undone.ok, true, (undone.issues || []).join('\n'));
  const present = undone.history.present;
  const grid = present.grid;
  const lens = {};
  let snap = true;
  Object.defineProperty(lens, 'snap', {
    enumerable: true,
    configurable: true,
    get() { return snap; },
    set(value) { snap = value; },
  });
  Object.defineProperty(grid, 'lens', {
    enumerable: true,
    configurable: true,
    get() { return lens; },
  });
  Object.defineProperty(present, 'grid', {
    enumerable: true,
    configurable: true,
    get() { return grid; },
  });
  const future = undone.history.future[0];
  const futureGrid = future.grid;
  Object.defineProperty(future, 'grid', {
    enumerable: true,
    configurable: true,
    get() { return futureGrid; },
  });
  future.world.toJSON = function () {
    present.grid.lens.snap = null;
    return {};
  };
  const back = restoreHistory(undone.history, 'undo');
  assert.equal(back.ok, true, (back.issues || []).join('\n'));
  const redone = restoreHistory(back.history, 'redo');
  assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
  assert.equal(snap, true);
  assert.notEqual(redone.history.present.grid.lens, null);
  assert.equal(typeof redone.history.present.grid.lens, 'object');
  assert.equal(redone.history.present.grid.lens.snap, true);

  const again = createHistory(getComposition('dock.intercept-cargo'));
  const redoA = getComposition('dock.intercept-cargo');
  redoA.title = 'A';
  const redoB = getComposition('dock.intercept-cargo');
  redoB.title = 'B';
  const creditsHistory = restoreHistory(commit(commit(again, redoA), redoB), 'undo');
  assert.equal(creditsHistory.ok, true, (creditsHistory.issues || []).join('\n'));
  const creditPresent = creditsHistory.history.present;
  const pocket = {};
  const inner = {};
  let credits = 40;
  Object.defineProperty(inner, 'credits', {
    enumerable: true,
    configurable: true,
    get() { return credits; },
    set(value) { credits = value; },
  });
  Object.defineProperty(pocket, 'inner', {
    enumerable: true,
    configurable: true,
    get() { return inner; },
  });
  Object.defineProperty(creditPresent.world, 'pocket', {
    enumerable: true,
    configurable: true,
    get() { return pocket; },
  });
  const creditFuture = creditsHistory.history.future[0];
  const creditGrid = creditFuture.grid;
  Object.defineProperty(creditFuture, 'grid', {
    enumerable: true,
    configurable: true,
    get() { return creditGrid; },
  });
  creditFuture.world.toJSON = function () {
    creditPresent.world.pocket.inner.credits = null;
    return {};
  };
  const creditBack = restoreHistory(creditsHistory.history, 'undo');
  assert.equal(creditBack.ok, true, (creditBack.issues || []).join('\n'));
  const creditRedo = restoreHistory(creditBack.history, 'redo');
  assert.equal(creditRedo.ok, true, (creditRedo.issues || []).join('\n'));
  assert.equal(credits, 40);
  assert.equal(creditRedo.history.present.world.pocket.inner.credits, 40);
});

test('a prototype array freeze does not stick', () => {
  for (const mode of ['push', 'splice', 'length']) {
    const history = createHistory(getComposition('dock.intercept-cargo'));
    const first = getComposition('dock.intercept-cargo');
    first.title = 'First rename';
    const once = commit(history, first);
    const parked = once.past[0];
    const grid = parked.grid;
    const pad = ['keep'];
    Object.setPrototypeOf(grid, { pad });
    Object.defineProperty(parked, 'grid', {
      enumerable: true,
      configurable: true,
      get() { return grid; },
    });
    parked.toJSON = function () {
      if (mode === 'push') pad.push(null);
      else if (mode === 'splice') pad.splice(0, 1, null);
      else pad.length = 0;
      Object.freeze(pad);
      return this;
    };
    const next = getComposition('dock.intercept-cargo');
    next.title = 'Renamed dock';
    const committed = commit(once, next);
    assert.equal(committed.past.length, 2);
    assert.deepEqual(pad, ['keep']);
    assert.equal(Object.isFrozen(pad), false);
    assert.deepEqual(committed.past[0].grid.pad, ['keep']);
    const back = restoreHistory(committed, 'undo');
    assert.equal(back.ok, true, (back.issues || []).join('\n'));
    const again = restoreHistory(back.history, 'undo');
    assert.equal(again.ok, true, (again.issues || []).join('\n'));
    assert.deepEqual(again.history.present.grid.pad, ['keep']);
    assert.deepEqual(pad, ['keep']);
    assert.equal(Object.isFrozen(pad), false);
  }
});

test('tags behind a get-only pocket stay keep', () => {
  for (const mode of ['push', 'splice', 'length', 'replace']) {
    const history = createHistory(getComposition('dock.intercept-cargo'));
    const first = getComposition('dock.intercept-cargo');
    first.title = 'First rename';
    const once = commit(history, first);
    const holder = { tags: ['keep'] };
    const parked = once.past[0];
    Object.defineProperty(parked.world, 'pocket', {
      enumerable: true,
      configurable: true,
      get() { return holder; },
    });
    const parkedGrid = parked.grid;
    Object.defineProperty(parked, 'grid', {
      enumerable: true,
      configurable: true,
      get() { return parkedGrid; },
    });
    parked.toJSON = function () {
      if (mode === 'push') holder.tags.push(null);
      else if (mode === 'splice') holder.tags.splice(0, 1, null);
      else if (mode === 'length') holder.tags.length = 0;
      else holder.tags = ['poison'];
      return this;
    };
    const next = getComposition('dock.intercept-cargo');
    next.title = 'Renamed dock';
    const committed = commit(once, next);
    assert.equal(committed.past.length, 2);
    assert.deepEqual(holder.tags, ['keep']);
    assert.equal(holder.tags[0], 'keep');
    assert.deepEqual(committed.past[0].world.pocket.tags, ['keep']);
    assert.notEqual(committed.past[0].world.pocket, holder);
    const back = restoreHistory(committed, 'undo');
    assert.equal(back.ok, true, (back.issues || []).join('\n'));
    const again = restoreHistory(back.history, 'undo');
    assert.equal(again.ok, true, (again.issues || []).join('\n'));
    assert.deepEqual(again.history.present.world.pocket.tags, ['keep']);
    assert.deepEqual(holder.tags, ['keep']);
  }
});

test('a refused redo does not leave bias at 0', () => {
  function sealMatching(direction) {
    const history = createHistory(getComposition('dock.intercept-cargo'));
    const sceneA = getComposition('dock.intercept-cargo');
    sceneA.title = 'A';
    const sceneB = getComposition('dock.intercept-cargo');
    sceneB.title = 'B';
    const twice = commit(commit(history, sceneA), sceneB);
    const undone = restoreHistory(twice, 'undo');
    assert.equal(undone.ok, true, (undone.issues || []).join('\n'));
    const present = undone.history.present;
    const grid = present.grid;
    grid.bias = 4;
    const host = direction === 'undo' ? undone.history.past[0] : undone.history.future[0];
    const hostGrid = host.grid;
    Object.defineProperty(host, 'grid', {
      enumerable: true,
      configurable: true,
      get() { return hostGrid; },
    });
    host.toJSON = function () {
      present.grid.bias = 1;
      Object.defineProperty(present.grid, 'bias', { value: 1, writable: false, configurable: false });
      return this;
    };
    const result = restoreHistory(undone.history, direction);
    assert.equal(present.grid, grid);
    assert.equal(present.title, 'A');
    assert.equal(grid.bias, 4);
    const bias = Object.getOwnPropertyDescriptor(grid, 'bias');
    assert.equal(bias.value, 4);
    assert.equal(bias.writable, true);
    assert.equal(bias.configurable, true);
    assert.equal(result.history.present === present || result.history.present.title !== 'A', true);
    const errorClone = clone(present);
    assert.notEqual(errorClone, present);
    assert.notEqual(errorClone.grid, grid);
    assert.equal(errorClone.grid.bias, 4);
    assert.equal(errorClone.title, 'A');
    if (!result.ok) {
      assert.equal(result.history, undone.history);
      assert.equal(result.history.present, present);
      const refusedClone = clone(result.history.present);
      assert.notEqual(refusedClone, present);
      assert.equal(refusedClone.grid.bias, 4);
      assert.equal(refusedClone.title, present.title);
    }
  }
  sealMatching('undo');
  sealMatching('redo');
});

test('get-only hold credits survive undo and redo', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const sceneA = getComposition('dock.intercept-cargo');
  sceneA.title = 'A';
  const sceneB = getComposition('dock.intercept-cargo');
  sceneB.title = 'B';
  const twice = commit(commit(history, sceneA), sceneB);
  const undone = restoreHistory(twice, 'undo');
  assert.equal(undone.ok, true, (undone.issues || []).join('\n'));
  const present = undone.history.present;
  const hold = {};
  let credits = 40;
  Object.defineProperty(hold, 'credits', {
    enumerable: true,
    configurable: true,
    get() { return credits; },
    set(value) { credits = value; },
  });
  Object.defineProperty(present.world, 'hold', {
    enumerable: true,
    configurable: true,
    get() { return hold; },
  });
  const future = undone.history.future[0];
  const futureGrid = future.grid;
  Object.defineProperty(future, 'grid', {
    enumerable: true,
    configurable: true,
    get() { return futureGrid; },
  });
  future.world.toJSON = function () {
    present.world.hold.credits = null;
    return {};
  };
  const back = restoreHistory(undone.history, 'undo');
  assert.equal(back.ok, true, (back.issues || []).join('\n'));
  const redone = restoreHistory(back.history, 'redo');
  assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
  assert.equal(credits, 40);
  assert.notEqual(redone.history.present.world.hold, null);
  assert.equal(redone.history.present.world.hold.credits, 40);
});

test('a successful commit does not keep a poisoned title', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const next = getComposition('dock.intercept-cargo');
  const schema = next.schema;
  const grid = next.grid;
  grid.bias = 4;
  next.title = 'Renamed dock';
  const title = next.title;
  next.toJSON = function () {
    Object.defineProperty(next, 'title', { value: 'POISON', writable: false, configurable: false });
    Object.defineProperties(next, {
      schema: { value: 'POISON', writable: false, configurable: false },
    });
    Object.defineProperty(grid, 'bias', { value: 0, writable: false, configurable: false });
    return this;
  };
  const committed = commit(history, next);
  assert.equal(committed.past.length, 1);
  assert.notEqual(committed.present, next);
  assert.equal(next.title, title);
  assert.equal(committed.present.title, title);
  assert.equal(next.schema, schema);
  assert.equal(committed.present.schema, schema);
  assert.equal(next.grid, grid);
  assert.equal(grid.bias, 4);
  const titleDesc = Object.getOwnPropertyDescriptor(next, 'title');
  assert.equal(titleDesc.value, title);
  assert.equal(titleDesc.writable, true);
  assert.equal(titleDesc.configurable, true);
  const storedTitle = Object.getOwnPropertyDescriptor(committed.present, 'title');
  assert.equal(storedTitle.value, title);
  assert.equal(Object.getOwnPropertyDescriptor(next, 'schema').value, schema);
  assert.equal(Object.getOwnPropertyDescriptor(next, 'schema').writable, true);
  assert.equal(Object.getOwnPropertyDescriptor(committed.present, 'schema').value, schema);
  assert.equal(Object.getOwnPropertyDescriptor(grid, 'bias').writable, true);
});

test('defineProperties and Reflect.defineProperty cannot poison a commit', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const next = getComposition('dock.intercept-cargo');
  const schema = next.schema;
  next.title = 'Renamed dock';
  next.toJSON = function () {
    Object.defineProperties(next, {
      schema: { value: 'POISON', writable: false, configurable: false },
    });
    return this;
  };
  const committed = commit(history, next);
  assert.equal(committed.past.length, 1);
  assert.equal(committed.present.title, 'Renamed dock');
  assert.equal(next.title, 'Renamed dock');
  assert.equal(next.schema, schema);
  assert.equal(committed.present.schema, schema);
  const schemaDesc = Object.getOwnPropertyDescriptor(next, 'schema');
  assert.equal(schemaDesc.value, schema);
  assert.equal(schemaDesc.writable, true);
  assert.equal(schemaDesc.configurable, true);

  const again = createHistory(getComposition('dock.intercept-cargo'));
  const credited = getComposition('dock.intercept-cargo');
  const credits = credited.world.credits;
  credited.title = 'Renamed dock';
  credited.toJSON = function () {
    Reflect.defineProperty(credited.world, 'credits', {
      value: 1,
      writable: false,
      configurable: false,
    });
    return this;
  };
  const renamed = commit(again, credited);
  assert.equal(renamed.past.length, 1);
  assert.equal(renamed.present.title, 'Renamed dock');
  assert.equal(credited.title, 'Renamed dock');
  assert.equal(credited.world.credits, credits);
  assert.equal(renamed.present.world.credits, credits);
  const creditDesc = Object.getOwnPropertyDescriptor(credited.world, 'credits');
  assert.equal(creditDesc.value, credits);
  assert.equal(creditDesc.writable, true);
  assert.equal(creditDesc.configurable, true);
});

test('a sealed lens is not hidden by a clean present', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const sceneA = getComposition('dock.intercept-cargo');
  sceneA.title = 'A';
  const sceneB = getComposition('dock.intercept-cargo');
  sceneB.title = 'B';
  const undone = restoreHistory(commit(commit(history, sceneA), sceneB), 'undo');
  assert.equal(undone.ok, true, (undone.issues || []).join('\n'));
  const present = undone.history.present;
  const grid = present.grid;
  const lens = { bias: 4, title: 'live' };
  Object.defineProperty(grid, 'lens', {
    enumerable: true,
    configurable: true,
    get() { return lens; },
  });
  Object.defineProperty(present, 'grid', {
    enumerable: true,
    configurable: true,
    get() { return grid; },
  });
  const future = undone.history.future[0];
  const futureGrid = future.grid;
  Object.defineProperty(future, 'grid', {
    enumerable: true,
    configurable: true,
    get() { return futureGrid; },
  });
  future.world.toJSON = function () {
    Object.defineProperty(lens, 'bias', { value: 1, writable: false, configurable: false });
    Object.defineProperty(lens, 'title', { value: 'sealed', writable: false, configurable: false });
    return {};
  };
  const back = restoreHistory(undone.history, 'undo');
  assert.equal(back.ok, true, (back.issues || []).join('\n'));
  const redone = restoreHistory(back.history, 'redo');
  assert.equal(lens.bias, 4);
  assert.equal(lens.title, 'live');
  assert.equal(present.grid, grid);
  assert.equal(present.grid.lens, lens);
  assert.equal(Object.getOwnPropertyDescriptor(lens, 'bias').writable, true);
  assert.equal(Object.getOwnPropertyDescriptor(lens, 'title').value, 'live');
  assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
});

test('a nested grid or objects accessor keeps snap', () => {
  for (const key of ['grid', 'objects']) {
    const history = createHistory(getComposition('dock.intercept-cargo'));
    const sceneA = getComposition('dock.intercept-cargo');
    sceneA.title = 'A';
    const sceneB = getComposition('dock.intercept-cargo');
    sceneB.title = 'B';
    const undone = restoreHistory(commit(commit(history, sceneA), sceneB), 'undo');
    assert.equal(undone.ok, true, (undone.issues || []).join('\n'));
    const present = undone.history.present;
    const grid = present.grid;
    const lens = {};
    const inner = {};
    let snap = true;
    Object.defineProperty(inner, 'snap', {
      enumerable: true,
      configurable: true,
      get() { return snap; },
      set(value) { snap = value; },
    });
    Object.defineProperty(lens, key, {
      enumerable: true,
      configurable: true,
      get() { return inner; },
    });
    Object.defineProperty(grid, 'lens', {
      enumerable: true,
      configurable: true,
      get() { return lens; },
    });
    Object.defineProperty(present, 'grid', {
      enumerable: true,
      configurable: true,
      get() { return grid; },
    });
    const future = undone.history.future[0];
    const futureGrid = future.grid;
    Object.defineProperty(future, 'grid', {
      enumerable: true,
      configurable: true,
      get() { return futureGrid; },
    });
    future.world.toJSON = function () {
      present.grid.lens[key].snap = false;
      return {};
    };
    const back = restoreHistory(undone.history, 'undo');
    assert.equal(back.ok, true, (back.issues || []).join('\n'));
    const redone = restoreHistory(back.history, 'redo');
    assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
    assert.equal(snap, true);
    assert.equal(present.grid.lens, lens);
    assert.equal(present.grid.lens[key], inner);
    assert.equal(redone.history.present.grid.lens[key].snap, true);
  }
});

test('a prototype array named grid is not frozen', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const first = getComposition('dock.intercept-cargo');
  first.title = 'First rename';
  const once = commit(history, first);
  const parked = once.past[0];
  const grid = parked.grid;
  const cells = ['keep'];
  Object.setPrototypeOf(grid, { grid: cells });
  Object.defineProperty(parked, 'grid', {
    enumerable: true,
    configurable: true,
    get() { return grid; },
  });
  parked.toJSON = function () {
    cells.push(null);
    Object.freeze(cells);
    return this;
  };
  const next = getComposition('dock.intercept-cargo');
  next.title = 'Renamed dock';
  const committed = commit(once, next);
  assert.deepEqual(cells, ['keep']);
  assert.equal(Object.isFrozen(cells), false);
  assert.deepEqual(committed.past[0].grid.grid, ['keep']);
  assert.notEqual(committed.past[0].grid.grid, cells);
  const back = restoreHistory(committed, 'undo');
  assert.equal(back.ok, true, (back.issues || []).join('\n'));
  const again = restoreHistory(back.history, 'undo');
  assert.equal(again.ok, true, (again.issues || []).join('\n'));
  assert.deepEqual(again.history.present.grid.grid, ['keep']);
  assert.equal(Object.isFrozen(again.history.present.grid.grid), false);
});

test('the inspector edits a trigger oracle and the input tape', async () => {
  const trigger = {
    kind: 'trigger',
    x: 0,
    z: 20,
    radius: 16,
    assertion: { kind: 'eventByTick', signal: 'playerX', op: '>', value: 0.5, byTick: 9 },
  };
  assert.equal(TRIGGER_ASSERTION_FIELDS.some((field) => field.key === 'assertion.signal'), true);
  assert.equal(TRIGGER_ASSERTION_FIELDS.some((field) => field.key === 'assertion.byTick'), true);
  writePath(trigger, 'assertion.signal', 'playerZ');
  writePath(trigger, 'assertion.op', '<');
  writePath(trigger, 'assertion.value', -0.25);
  writePath(trigger, 'assertion.byTick', 40);
  assert.equal(trigger.assertion.signal, 'playerZ');
  assert.equal(trigger.assertion.op, '<');
  assert.equal(trigger.assertion.value, -0.25);
  assert.equal(trigger.assertion.byTick, 40);
  const project = emptyProject({ id: 'dock.untitled', title: 'Untitled dock', seed: 1 });
  const frame = project.frames[0];
  assert.equal(frame.input.moveZ, 0);
  writeFrameInput(project, 0, 'moveZ', 1);
  assert.equal(project.frames[0], frame);
  assert.equal(frame.input.moveZ, 1);
  const editor = fs.readFileSync(new URL('../public/editor.js', import.meta.url), 'utf8');
  assert.equal(editor.includes('fieldsFor(object'), true);
  const triggerFields = fieldsFor(trigger);
  assert.equal(triggerFields.some((field) => field.key === 'assertion.signal'), true);
  assert.equal(triggerFields.some((field) => field.key === 'assertion.byTick'), true);
  assert.equal(triggerFields.some((field) => field.key === 'radius' && field.kind === 'number'), true);
  assert.equal(editor.includes('paintFrames'), true);
  assert.equal(editor.includes('writeFrameInput'), true);

  const placed = placePlayer(emptyProject({ id: 'dock.untitled', title: 'Untitled dock', seed: 1, ticks: 30 }));
  assert.equal(placed.ok, true, (placed.issues || []).join('\n'));
  const added = addObject(placed.project, {
    id: 'cross_z',
    kind: 'trigger',
    shape: 'circle',
    x: 0,
    z: 20,
    radius: 16,
    labOnly: true,
    label: 'trigger',
    assertion: { kind: 'eventByTick', signal: 'playerX', op: '>', value: 0.5, byTick: 29 },
  });
  assert.equal(added.ok, true, (added.issues || []).join('\n'));
  const authored = added.project.objects.find((object) => object.id === 'cross_z');
  writePath(authored, 'assertion.signal', 'playerZ');
  writePath(authored, 'assertion.op', '<');
  writePath(authored, 'assertion.value', -0.25);
  writePath(authored, 'assertion.byTick', 4);
  const exported = await exportProject(added.project);
  assert.equal(exported.ok, true, (exported.issues || []).join('\n'));
  const event = exported.scenario.assertions.find((row) => row.kind === 'eventByTick' && row.signal === 'playerZ');
  assert.deepEqual(event, {
    kind: 'eventByTick',
    signal: 'playerZ',
    op: '<',
    value: -0.25,
    byTick: 4,
    expected: { x: 0, z: 20, radius: 16, shape: 'circle' },
  });
  const outside = [];
  const inside = [];
  for (let tick = 0; tick <= 5; tick += 1) {
    outside.push({ tick, playerX: 10, playerZ: 4 });
    inside.push({ tick, playerX: 0, playerZ: 4 });
  }
  const judged = (trace, op, value) => evaluateOracleKernel({
    trace,
    assertions: [{ ...event, op, value }],
  });
  const playerZ = (result) => result.results.find((row) => row.id === 'eventByTick:playerZ');
  const below = judged(outside, '<', -0.25);
  const belowRow = playerZ(below);
  assert.equal(belowRow.ok, false);
  assert.equal(belowRow.actual.foundTick, null);
  assert.equal(below.ok, false);
  assert.equal(below.failed.some((row) => row.id === 'eventByTick:playerZ'), true);
  assert.equal(Number.isFinite(belowRow.actual.closest), true);
  assert.equal(belowRow.actual.closest > 16, true);
  const atLeastHundred = judged(outside, '>=', 100);
  assert.equal(playerZ(atLeastHundred).ok, false);
  assert.equal(playerZ(atLeastHundred).actual.foundTick, null);
  assert.equal(atLeastHundred.failed.some((row) => row.id === 'eventByTick:playerZ'), true);
  const aboveHundred = judged(outside, '>', 100);
  assert.equal(playerZ(aboveHundred).ok, false);
  assert.equal(playerZ(aboveHundred).actual.foundTick, null);
  assert.equal(aboveHundred.failed.some((row) => row.id === 'eventByTick:playerZ'), true);
  const outsideCross = judged(outside, '>', 0.5);
  assert.equal(playerZ(outsideCross).actual.foundTick, null);
  assert.equal(playerZ(outsideCross).ok, false);
  assert.equal(outsideCross.ok, false);
  const split = evaluateOracleKernel({
    trace: [
      { tick: 0, playerX: 0, playerZ: 20 },
      { tick: 1, playerX: 100, playerZ: -1 },
    ],
    assertions: [{ ...event, op: '<', value: -0.25 }],
  });
  const splitRow = playerZ(split);
  assert.equal(split.ok, false);
  assert.equal(splitRow.ok, false);
  assert.notEqual(splitRow.actual.foundTick, 1);
  const nullRadius = evaluateOracleKernel({
    trace: [{ tick: 0, playerX: 0, playerZ: 4 }],
    assertions: [{
      ...event,
      op: '>',
      value: 0.5,
      expected: { x: 0, z: 20, radius: null },
    }],
  });
  const nullRow = playerZ(nullRadius);
  assert.equal(nullRow.ok, false);
  assert.notEqual(nullRow.expected.radius, 20);
  const aliveInside = evaluateOracleKernel({
    trace: [{ tick: 0, playerX: 0, playerZ: 0, playerAlive: true }],
    assertions: [{
      kind: 'eventByTick',
      signal: 'playerAlive',
      op: '==',
      value: false,
      byTick: 4,
      expected: { x: 0, z: 0, radius: 5 },
    }],
  });
  const aliveRow = aliveInside.results.find((row) => row.id === 'eventByTick:playerAlive');
  assert.equal(aliveRow.ok, false);
  assert.notEqual(aliveRow.actual.foundTick, 0);
  const tetherInside = evaluateOracleKernel({
    trace: [{ tick: 0, playerX: 0, playerZ: 0, tetherActive: true }],
    assertions: [{
      kind: 'eventByTick',
      signal: 'tetherActive',
      op: '==',
      value: false,
      byTick: 4,
      expected: { x: 0, z: 0, radius: 5 },
    }],
  });
  const tetherRow = tetherInside.results.find((row) => row.id === 'eventByTick:tetherActive');
  assert.equal(tetherRow.ok, false);
  const strictEqual = judged([{ tick: 0, playerX: 0, playerZ: 4 }], '===', 99);
  assert.equal(playerZ(strictEqual).ok, false);
  assert.notEqual(playerZ(strictEqual).actual.foundTick, 0);
  const unknownOp = judged([{ tick: 0, playerX: 0, playerZ: 4 }], 'approx', 4);
  assert.equal(playerZ(unknownOp).ok, false);
  assert.notEqual(playerZ(unknownOp).actual.foundTick, 0);
  const holdTrace = [];
  for (let tick = 0; tick < 60; tick += 1) {
    holdTrace.push({ tick, playerX: 100, playerZ: 100, playerAlive: true });
  }
  holdTrace.push({ tick: 60, playerX: 0, playerZ: 0, playerAlive: false });
  const holdResult = evaluateOracleKernel({
    trace: holdTrace,
    assertions: [{
      kind: 'holds',
      signal: 'playerAlive',
      holdsTicks: 60,
      expected: { x: 0, z: 0, radius: 1 },
    }],
  });
  const holdRow = holdResult.results.find((row) => row.id === 'holds:playerAlive');
  assert.equal(holdResult.ok, false);
  assert.equal(holdRow.ok, false);
  assert.equal(holdRow.actual.maxRun < 60, true);
  for (const x of [10, 16]) {
    const openTrace = [];
    for (let tick = 0; tick < 60; tick += 1) {
      openTrace.push({ tick, playerX: x, playerZ: 0, playerAlive: true });
    }
    const openResult = evaluateOracleKernel({
      trace: openTrace,
      assertions: [{
        kind: 'holds',
        signal: 'playerAlive',
        holdsTicks: 60,
        expected: { x: 0, z: 0 },
      }],
    });
    const openRow = openResult.results.find((row) => row.id === 'holds:playerAlive');
    assert.equal(openResult.ok, false, String(x));
    assert.equal(openRow.ok, false, String(x));
    assert.equal(openRow.actual.maxRun < 60, true, String(x));
    assert.equal(Number.isFinite(openRow.expected && openRow.expected.radius), false, String(x));
    assert.notEqual(openRow.expected.radius, 10, String(x));
    assert.notEqual(openRow.expected.radius, 20, String(x));
  }
  const farNever = [];
  for (let tick = 0; tick < 60; tick += 1) {
    farNever.push({ tick, playerX: 16, playerZ: 0, hull: 140, playerVelX: 0 });
  }
  const farNeverResult = evaluateOracleKernel({
    trace: farNever,
    assertions: [{
      kind: 'never',
      signal: 'hull',
      op: '<',
      value: 0,
      expected: { x: -90, z: 10 },
    }],
  });
  const farNeverRow = farNeverResult.results.find((row) => row.id === 'never:hull');
  assert.equal(farNeverResult.ok, false);
  assert.equal(farNeverRow.ok, false);
  assert.equal(Number.isFinite(farNeverRow.expected.radius), false);
  assert.notEqual(farNeverRow.expected.radius, 10);
  const nullNever = evaluateOracleKernel({
    trace: [{ tick: 0, playerX: 0.02682, playerZ: 0, hull: 140 }],
    assertions: [{
      kind: 'never',
      signal: 'hull',
      op: '<',
      value: 0,
      expected: { x: -90, z: 10, radius: null },
    }],
  });
  assert.equal(nullNever.results.find((row) => row.id === 'never:hull').ok, false);
  const nearSettle = [];
  for (let tick = 0; tick < 8; tick += 1) {
    nearSettle.push({ tick, playerX: 0.02682, playerZ: 0, playerVelX: 0 });
  }
  const nearSettleResult = evaluateOracleKernel({
    trace: nearSettle,
    assertions: [{
      kind: 'settles',
      signal: 'playerVelX',
      value: 1e9,
      expected: { x: 0, z: 0 },
    }],
  });
  const nearSettleRow = nearSettleResult.results.find((row) => row.id === 'settles');
  assert.equal(nearSettleResult.ok, false);
  assert.equal(nearSettleRow.ok, false);
  assert.equal(Number.isFinite(nearSettleRow.expected.radius), false);
  assert.equal(nearSettleRow.closest < 10, true);
  const close = [{ tick: 0, playerX: 0.02682, playerZ: 0, hull: 140, playerVelX: 0 }];
  const missingClose = evaluateOracleKernel({
    trace: close,
    assertions: [{
      kind: 'never',
      signal: 'hull',
      op: '<',
      value: 0,
      expected: { x: 0, z: 0 },
    }],
  });
  assert.equal(missingClose.results.find((row) => row.id === 'never:hull').ok, false);
  const wideClose = evaluateOracleKernel({
    trace: close,
    assertions: [{
      kind: 'never',
      signal: 'hull',
      op: '<',
      value: 0,
      expected: { x: 0, z: 0, radius: 10 },
    }],
  });
  assert.equal(wideClose.results.find((row) => row.id === 'never:hull').ok, true);
  const settleClose = [];
  for (let tick = 0; tick < 4; tick += 1) {
    settleClose.push({ tick, playerX: 0.02682, playerZ: 0, playerVelX: 0 });
  }
  const missingSettleClose = evaluateOracleKernel({
    trace: settleClose,
    assertions: [{ kind: 'settles', signal: 'playerVelX', value: 1e9, expected: { x: 0, z: 0 } }],
  });
  assert.equal(missingSettleClose.results.find((row) => row.id === 'settles').ok, false);
  const wideSettleClose = evaluateOracleKernel({
    trace: settleClose,
    assertions: [{ kind: 'settles', signal: 'playerVelX', value: 1e9, expected: { x: 0, z: 0, radius: 10 } }],
  });
  assert.equal(wideSettleClose.results.find((row) => row.id === 'settles').ok, true);
  const leftDisc = [
    { tick: 0, playerX: 0, playerZ: 0, playerVelX: 0, hull: 140, playerAlive: true },
    { tick: 1, playerX: 100, playerZ: 0, playerVelX: 0, hull: 140, playerAlive: true },
  ];
  const leftSettle = evaluateOracleKernel({
    trace: leftDisc,
    assertions: [{
      kind: 'settles',
      signal: 'playerVelX',
      value: 1e9,
      expected: { x: 0, z: 0, radius: 5 },
    }],
  });
  const leftSettleRow = leftSettle.results.find((row) => row.id === 'settles');
  assert.equal(leftSettleRow.ok, true);
  assert.equal(leftSettleRow.actual.settled, true);
  assert.equal(leftSettleRow.firstBadTick, null);
  assert.equal(leftSettleRow.closest, 0);
  const leftNever = evaluateOracleKernel({
    trace: leftDisc,
    assertions: [{
      kind: 'never',
      signal: 'hull',
      op: '<',
      value: 0,
      expected: { x: 0, z: 0, radius: 5 },
    }],
  });
  assert.equal(leftNever.results.find((row) => row.id === 'never:hull').ok, true);
  const leftHold = evaluateOracleKernel({
    trace: leftDisc,
    assertions: [{
      kind: 'holds',
      signal: 'playerAlive',
      holdsTicks: 1,
      expected: { x: 0, z: 0, radius: 5 },
    }],
  });
  assert.equal(leftHold.results.find((row) => row.id === 'holds:playerAlive').ok, true);
  const unsettledInside = evaluateOracleKernel({
    trace: [
      { tick: 0, playerX: 0, playerZ: 0, playerVelX: 50 },
      { tick: 1, playerX: 100, playerZ: 0, playerVelX: 0 },
    ],
    assertions: [{
      kind: 'settles',
      signal: 'playerVelX',
      value: 1,
      expected: { x: 0, z: 0, radius: 5 },
    }],
  });
  assert.equal(unsettledInside.results.find((row) => row.id === 'settles').ok, false);
  const lateSettleTrace = [];
  for (let tick = 0; tick <= 30; tick += 1) {
    lateSettleTrace.push({ tick, playerX: 0, playerZ: 0, playerVelX: tick === 0 ? 10 : 0 });
  }
  const lateSettle = evaluateOracleKernel({
    trace: lateSettleTrace,
    assertions: [{
      kind: 'settles',
      signal: 'playerVelX',
      value: 1,
      byTick: 0,
      expected: { x: 0, z: 0, radius: 5 },
    }],
  }).results.find((row) => row.id === 'settles');
  assert.equal(lateSettle.ok, false);
  assert.equal(lateSettle.actual.settled, true);
  assert.equal(lateSettle.actual.settleTick, 1);
  assert.equal(lateSettle.firstBadTick === 0 || lateSettle.firstBadTick === lateSettle.actual.settleTick, true);
  assert.notEqual(lateSettle.firstBadTick, 30);
  const lateWindow = lateSettleTrace.filter((sample) => Math.abs(sample.tick - lateSettle.firstBadTick) <= 5);
  assert.equal(lateWindow.some((sample) => sample.tick === lateSettle.firstBadTick), true);
  assert.equal(lateWindow.some((sample) => sample.tick === 1), true);
  assert.equal(lateWindow.some((sample) => sample.tick === 30), false);
  const shortLate = evaluateOracleKernel({
    trace: [
      { tick: 0, playerX: 0, playerZ: 0, playerVelX: 50 },
      { tick: 1, playerX: 0, playerZ: 0, playerVelX: 0 },
      { tick: 2, playerX: 0, playerZ: 0, playerVelX: 0 },
    ],
    assertions: [{
      kind: 'settles',
      signal: 'playerVelX',
      value: 1,
      byTick: 0,
      expected: { x: 0, z: 0, radius: 5 },
    }],
  }).results.find((row) => row.id === 'settles');
  assert.equal(shortLate.ok, false);
  assert.equal(shortLate.actual.settled, true);
  assert.equal(shortLate.actual.settleTick, 1);
  assert.equal(shortLate.firstBadTick === 0 || shortLate.firstBadTick === 1, true);
  assert.notEqual(shortLate.firstBadTick, 2);
  const shortWindow = [0, 1, 2].filter((tick) => Math.abs(tick - shortLate.firstBadTick) <= 5);
  assert.equal(shortWindow.includes(shortLate.firstBadTick), true);
  assert.equal(shortWindow.includes(1), true);
  const metDeadline = evaluateOracleKernel({
    trace: [
      { tick: 0, playerX: 0, playerZ: 0, playerVelX: 50 },
      { tick: 1, playerX: 0, playerZ: 0, playerVelX: 0 },
      { tick: 2, playerX: 0, playerZ: 0, playerVelX: 0 },
    ],
    assertions: [{
      kind: 'settles',
      signal: 'playerVelX',
      value: 1,
      byTick: 1,
      expected: { x: 0, z: 0, radius: 5 },
    }],
  }).results.find((row) => row.id === 'settles');
  assert.equal(metDeadline.ok, true);
  assert.equal(metDeadline.actual.settled, true);
  assert.equal(metDeadline.actual.settleTick, 1);
  assert.equal(metDeadline.firstBadTick, null);
  const insideDisc = [];
  for (let tick = 0; tick < 8; tick += 1) {
    insideDisc.push({ tick, playerX: 0, playerZ: 0, hull: 140, playerVelX: 0 });
  }
  const insideNever = evaluateOracleKernel({
    trace: insideDisc,
    assertions: [{
      kind: 'never',
      signal: 'hull',
      op: '<',
      value: 0,
      expected: { x: 0, z: 0, radius: 5 },
    }],
  });
  assert.equal(insideNever.results.find((row) => row.id === 'never:hull').ok, true);
  const insideSettle = evaluateOracleKernel({
    trace: insideDisc,
    assertions: [{
      kind: 'settles',
      signal: 'playerVelX',
      value: 1e9,
      expected: { x: 0, z: 0, radius: 5 },
    }],
  });
  assert.equal(insideSettle.results.find((row) => row.id === 'settles').ok, true);
  const atPoint = [];
  const offPoint = [];
  for (let tick = 0; tick < 60; tick += 1) {
    atPoint.push({ tick, playerX: 24.138, playerZ: 11.272, playerAlive: true });
    offPoint.push({ tick, playerX: 24.148, playerZ: 11.272, playerAlive: true });
  }
  const missingRadius = evaluateOracleKernel({
    trace: atPoint,
    assertions: [{ kind: 'holds', signal: 'playerAlive', holdsTicks: 60, expected: { x: 24.138, z: 11.272 } }],
  });
  assert.equal(missingRadius.results.find((row) => row.id === 'holds:playerAlive').ok, false);
  const zeroRadius = evaluateOracleKernel({
    trace: atPoint,
    assertions: [{ kind: 'holds', signal: 'playerAlive', holdsTicks: 60, expected: { x: 24.138, z: 11.272, radius: 0 } }],
  });
  assert.equal(zeroRadius.results.find((row) => row.id === 'holds:playerAlive').ok, true);
  const offZero = evaluateOracleKernel({
    trace: offPoint,
    assertions: [{ kind: 'holds', signal: 'playerAlive', holdsTicks: 60, expected: { x: 24.138, z: 11.272, radius: 0 } }],
  });
  assert.equal(offZero.results.find((row) => row.id === 'holds:playerAlive').ok, false);
  assert.equal(numberFieldValue(''), null);
  assert.equal(numberFieldValue('0'), 0);
  assert.equal(discRadius({ radius: 0 }), 0);
  assert.notEqual(discRadius({ radius: 0 }), 10);
  assert.equal(discRadius({ kind: 'trigger' }), null);
  assert.notEqual(discRadius({ kind: 'trigger' }), 0);
  const clearedRadius = { kind: 'trigger', radius: 12 };
  deletePath(clearedRadius, 'radius');
  assert.equal(Object.prototype.hasOwnProperty.call(clearedRadius, 'radius'), false);
  assert.equal(discRadius(clearedRadius), null);
  assert.notEqual(discRadius(clearedRadius), 0);
  const tape = emptyProject({ id: 'dock.untitled', title: 'Untitled dock', seed: 1 });
  assert.equal(tape.frames[0].input.moveX, 0);
  writeFrameInput(tape, 0, 'moveX', 0);
  assert.equal(tape.frames[0].input.moveX, 0);
  writeFrameInput(tape, 0, 'moveX', numberFieldValue(''));
  assert.equal(Object.prototype.hasOwnProperty.call(tape.frames[0].input, 'moveX'), false);
  assert.notEqual(tape.frames[0].input.moveX, 0);
  const camera = { x: 0, z: 0, zoom: 10 };
  const view = { width: 200, height: 200 };
  assert.equal(hitTest({ objects: [{ id: 'pin', x: 0, z: 0, radius: 0 }] }, 120, 100, camera, view), null);
  assert.equal(hitTest({ objects: [{ id: 'pin', x: 0, z: 0, radius: 40 }] }, 120, 100, camera, view), 'pin');
  const dockZoom = { x: 0, z: 0, zoom: 3.2 };
  assert.equal(hitTest({ objects: [{ id: 'pin', x: 0, z: 0, radius: 0 }] }, 115, 100, dockZoom, view), null);
  const deletedHitRadius = { id: 'pin', x: 0, z: 0, radius: 12 };
  delete deletedHitRadius.radius;
  assert.equal(hitTest({ objects: [deletedHitRadius] }, 115, 100, dockZoom, view), null);
  assert.equal(hitTest({ objects: [{ id: 'wide', x: 0, z: 0, radius: 10 }] }, 115, 100, dockZoom, view), 'wide');
  const unitZoom = { x: 0, z: 0, zoom: 1 };
  const zeroTrigger = { id: 't', kind: 'trigger', x: 0, z: 0, radius: 0 };
  assert.equal(markerStroke(zeroTrigger, 1), 0);
  assert.equal(hitTest({ objects: [zeroTrigger] }, 115, 100, unitZoom, view), null);
  const wideTrigger = { id: 't', kind: 'trigger', x: 0, z: 0, radius: 100 };
  assert.equal(markerStroke(wideTrigger, 1), 100);
  assert.equal(hitTest({ objects: [wideTrigger] }, 150, 100, unitZoom, view), null);
  assert.equal(hitTest({ objects: [wideTrigger] }, 200, 100, unitZoom, view), 't');
  assert.equal(hitTest({ objects: [wideTrigger] }, 201, 100, unitZoom, view), null);
  const stage = { width: 800, height: 600 };
  const stageCam = { x: 0, z: 0, zoom: 3.2 };
  const profileDraw = {
    'ship.starter': { radius: 14 },
    'ship.kestrel': { radius: 14 },
  };
  const bank = getComposition('dock.bank-shot');
  const player = objectById(bank, 'player');
  const stone = objectById(bank, 'stone');
  assert.equal(player.profile, 'ship.starter');
  assert.equal(actorStroke(player, 3.2, profileDraw), 14 * 3.2);
  assert.equal(actorStroke({ kind: 'actor', profile: 'ship.kestrel' }, 3.2, profileDraw), 14 * 3.2);
  assert.equal(actorStroke(stone, 3.2, profileDraw), 8 * 3.2);
  assert.equal(hitTest(bank, 415, 300, stageCam, stage, profileDraw), 'player');
  assert.equal(hitTest(bank, 543, 204, stageCam, stage, profileDraw), 'stone');
  const alive = objectById(bank, 'alive_bank');
  assert.equal(markerStroke(alive, 3.2), 156.8);
  assert.equal(hitTest(bank, 617.6, 204, stageCam, stage, profileDraw), 'along_x');
  const alivePoint = worldToScreen(alive.x + alive.radius, alive.z, stageCam, stage);
  assert.equal(hitTest(bank, alivePoint.sx, alivePoint.sy, stageCam, stage, profileDraw), 'alive_bank');
  assert.equal(hitTest(bank, 637.6, 204, stageCam, stage, profileDraw), null);
  assert.equal(hitTest(bank, 450, 300, stageCam, stage, profileDraw), 'player');
  const zeroActor = { id: 'zero-actor', kind: 'actor', x: 0, z: 0, overrides: { radius: 0 } };
  assert.equal(actorStroke(zeroActor, 1, profileDraw), 0);
  assert.equal(hitTest({ objects: [zeroActor] }, 100, 115, unitZoom, view), null);
  const objective = { id: 'mark', kind: 'objective', x: 0, z: 0 };
  assert.equal(hitTest({ objects: [objective] }, 400, 300, stageCam, stage), null);
  assert.equal(hitTest({ objects: [objective] }, 400, 294, stageCam, stage), null);
  assert.equal(hitTest({ objects: [objective] }, 400.5, 292.5, stageCam, stage), 'mark');
  assert.equal(hitTest({ objects: [objective] }, 400, 280, stageCam, stage), null);
  const zone = objectById(bank, 'bank_zone');
  assert.equal(zone.radius, 80);
  assert.equal(fieldStroke(zone, 3.2), 89.6);
  const zoneOnly = { objects: [zone] };
  assert.equal(hitTest(zoneOnly, 617.6, 204, stageCam, stage), 'bank_zone');
  assert.equal(hitTest(zoneOnly, 637.6, 204, stageCam, stage), null);
  const zeroField = { id: 'flat', kind: 'field', x: 0, z: 0, radius: 0 };
  assert.equal(fieldStroke(zeroField, 1), 0);
  assert.equal(hitTest({ objects: [zeroField] }, 115, 100, unitZoom, view), null);
  const stroked = [];
  const paintCtx = {
    save() {},
    restore() {},
    beginPath() {},
    arc(_x, _y, radius) { stroked.push(radius); },
    stroke() {},
    fill() {},
    fillText() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
  };
  drawActor(paintCtx, { kind: 'actor', x: 0, z: 0, overrides: { radius: 0 } }, { x: 0, z: 0, zoom: 1 }, view, {});
  assert.equal(stroked[0], 0);
  assert.notEqual(stroked[0], 8);
  const colliderStone = { id: 'stone', x: 0, z: 0, overrides: { radius: 8 } };
  assert.equal(hitTest({ objects: [colliderStone] }, 104, 100, unitZoom, view), 'stone');
  assert.equal(hitTest({ objects: [colliderStone] }, 108, 100, unitZoom, view), 'stone');
  const placeDisc = { id: 'bank_zone', kind: 'field', fieldKind: 'place', x: 0, z: 0, radius: 80 };
  assert.equal(fieldStroke(placeDisc, 1), 28);
  assert.equal(hitTest({ objects: [placeDisc] }, 128, 100, unitZoom, view), 'bank_zone');
  assert.equal(hitTest({ objects: [placeDisc] }, 129, 100, unitZoom, view), null);
  assert.equal(hitTest({ objects: [placeDisc] }, 150, 100, unitZoom, view), null);
  const wideStone = { id: 'stone', kind: 'actor', x: 0, z: 0, overrides: { radius: 100 } };
  assert.equal(Object.prototype.hasOwnProperty.call(wideStone, 'radius'), false);
  assert.equal(actorStroke(wideStone, 1), 100);
  assert.equal(hitTest({ objects: [wideStone] }, 150, 100, unitZoom, view), 'stone');
  assert.equal(hitTest({ objects: [wideStone] }, 200, 100, unitZoom, view), 'stone');
  assert.equal(hitTest({ objects: [wideStone] }, 100, 201, unitZoom, view), null);
  const nineStone = { id: 'stone', x: 0, z: 0, overrides: { radius: 9 } };
  assert.equal(hitTest({ objects: [nineStone] }, 109, 100, unitZoom, view), 'stone');
  const finalOutside = evaluateOracleKernel({
    trace: [
      { tick: 0, playerX: 0, playerZ: 0, playerRot: 0 },
      { tick: 1, playerX: 100, playerZ: 100, playerRot: -1 },
    ],
    metrics: [{ name: 'trace.final', version: 1, params: { signal: 'playerRot' }, threshold: { op: '<', value: -0.25 } }],
    assertions: [{
      kind: 'metric',
      metric: 'trace.final',
      op: '<',
      value: -0.25,
      expected: { x: 0, z: 0, radius: 5 },
    }],
  });
  const finalRow = finalOutside.results.find((row) => row.id === 'trace.final@1');
  assert.equal(finalRow.ok, false);
  const missingX = evaluateOracleKernel({
    trace: [
      { tick: 0, playerX: 100, playerZ: 20 },
      { tick: 1, playerZ: -1 },
    ],
    assertions: [{
      kind: 'eventByTick',
      signal: 'playerZ',
      op: '<',
      value: -0.25,
      byTick: 4,
      expected: { x: 0, z: 0, radius: 2 },
    }],
  });
  const missingRow = missingX.results.find((row) => row.id === 'eventByTick:playerZ');
  assert.equal(missingRow.ok, false);
  assert.notEqual(missingRow.actual.foundTick, 1);
  const crossed = judged(inside, '>', 0.5);
  assert.equal(crossed.ok, true);
  assert.equal(playerZ(crossed).ok, true);
  assert.equal(playerZ(crossed).actual.foundTick, 0);
  assert.equal(playerZ(crossed).actual.closest <= 16, true);
  assert.equal(crossed.failed.some((row) => row.id === 'eventByTick:playerZ'), false);
  assert.equal(playerZ(judged(inside, '>=', 4)).ok, true);
  assert.equal(playerZ(judged(inside, '<=', 4)).ok, true);
  assert.equal(playerZ(judged(inside, '<=', 3)).ok, false);
  assert.equal(playerZ(judged(inside, '==', 4)).ok, true);
  assert.equal(playerZ(judged(inside, '!=', 4)).ok, false);
  assert.equal(playerZ(judged(inside, '!=', 5)).ok, true);
  assert.equal(playerZ(judged(inside, '<', -0.25)).actual.foundTick, null);
  assert.equal(playerZ(judged(inside, '>=', 100)).ok, false);
  assert.equal(playerZ(judged(inside, '>', 100)).ok, false);
});

function dockReadyToUndo() {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const sceneA = getComposition('dock.intercept-cargo');
  sceneA.title = 'A';
  const sceneB = getComposition('dock.intercept-cargo');
  sceneB.title = 'B';
  return restoreHistory(commit(commit(history, sceneA), sceneB), 'undo');
}

function sealGridGetter(scene) {
  const grid = scene.grid;
  Object.defineProperty(scene, 'grid', {
    enumerable: true,
    configurable: true,
    get() { return grid; },
  });
  return grid;
}

test('undo writes a sealed lens assignment back to the capture', () => {
  const undone = dockReadyToUndo();
  assert.equal(undone.ok, true, (undone.issues || []).join('\n'));
  const present = undone.history.present;
  const grid = sealGridGetter(present);
  const lens = { bias: 4, title: 'live' };
  Object.defineProperty(grid, 'lens', {
    enumerable: true,
    configurable: true,
    get() { return lens; },
  });
  sealGridGetter(undone.history.future[0]);
  undone.history.future[0].toJSON = function () {
    lens.bias = 2;
    Object.defineProperty(lens, 'bias', { value: 2, writable: false, configurable: false });
    lens.title = 'sealed';
    Object.defineProperty(lens, 'title', { value: 'sealed', writable: false, configurable: false });
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  assert.equal(back.ok, true, (back.issues || []).join('\n'));
  const redone = restoreHistory(back.history, 'redo');
  assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
  assert.equal(lens.bias, 4);
  assert.equal(lens.title, 'live');
  assert.equal(present.grid.lens, lens);
  assert.equal(Object.getOwnPropertyDescriptor(lens, 'bias').writable, true);
  assert.equal(Object.getOwnPropertyDescriptor(lens, 'title').writable, true);
  assert.deepEqual(clone(present).grid.lens, { bias: 4, title: 'live' });
});

test('undo writes a reflected bias seal back to 4', () => {
  const undone = dockReadyToUndo();
  assert.equal(undone.ok, true, (undone.issues || []).join('\n'));
  const present = undone.history.present;
  const grid = sealGridGetter(present);
  const lens = { bias: 4 };
  Object.defineProperty(grid, 'lens', {
    enumerable: true,
    configurable: true,
    get() { return lens; },
  });
  sealGridGetter(undone.history.future[0]);
  undone.history.future[0].toJSON = function () {
    lens.bias = 1;
    Reflect.defineProperty(lens, 'bias', { value: 1, writable: false, configurable: false });
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  assert.equal(back.ok, true, (back.issues || []).join('\n'));
  const redone = restoreHistory(back.history, 'redo');
  assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
  assert.equal(lens.bias, 4);
  assert.equal(Object.getOwnPropertyDescriptor(lens, 'bias').writable, true);
  assert.equal(present.grid.lens, lens);
  assert.equal(clone(present).grid.lens.bias, 4);
});

test('undo writes a nested lens bias back onto the same inner object', () => {
  const undone = dockReadyToUndo();
  assert.equal(undone.ok, true, (undone.issues || []).join('\n'));
  const present = undone.history.present;
  const grid = sealGridGetter(present);
  const inner = { bias: 4 };
  const mid = {};
  Object.defineProperty(mid, 'grid', {
    enumerable: true,
    configurable: true,
    get() { return inner; },
  });
  const lens = {};
  Object.defineProperty(lens, 'mid', {
    enumerable: true,
    configurable: true,
    get() { return mid; },
  });
  Object.defineProperty(grid, 'lens', {
    enumerable: true,
    configurable: true,
    get() { return lens; },
  });
  sealGridGetter(undone.history.future[0]);
  undone.history.future[0].toJSON = function () {
    inner.bias = 2;
    Object.defineProperty(inner, 'bias', { value: 2, writable: false, configurable: false });
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  assert.equal(back.ok, true, (back.issues || []).join('\n'));
  const redone = restoreHistory(back.history, 'redo');
  assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
  assert.equal(inner.bias, 4);
  assert.equal(Object.getOwnPropertyDescriptor(inner, 'bias').writable, true);
  assert.equal(present.grid.lens.mid.grid, inner);
  assert.equal(clone(present).grid.lens.mid.grid.bias, 4);
});

test('a refused undo does not replace bias with a getter', () => {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const sceneA = getComposition('dock.intercept-cargo');
  sceneA.title = 'A';
  const sceneB = getComposition('dock.intercept-cargo');
  sceneB.title = 'B';
  const twice = commit(commit(history, sceneA), sceneB);
  const present = twice.present;
  const grid = present.grid;
  grid.bias = 4;
  const past = twice.past[0];
  const pastGrid = past.grid;
  Object.defineProperty(past, 'grid', {
    enumerable: true,
    configurable: true,
    get() { return pastGrid; },
  });
  past.toJSON = function () {
    Object.defineProperty(grid, 'bias', {
      configurable: false,
      enumerable: true,
      get() { return 4; },
    });
    return this;
  };
  const back = restoreHistory(twice, 'undo');
  const bias = Object.getOwnPropertyDescriptor(grid, 'bias');
  assert.equal(bias.value, 4);
  assert.equal(bias.writable, true);
  assert.equal(typeof bias.get, 'undefined');
  grid.bias = 9;
  assert.equal(grid.bias, 9);
  assert.equal(back.ok === false || back.history.present !== present, true);
});

function sceneWithFuture() {
  const history = createHistory(getComposition('dock.intercept-cargo'));
  const sceneA = getComposition('dock.intercept-cargo');
  sceneA.title = 'A';
  const sceneB = getComposition('dock.intercept-cargo');
  sceneB.title = 'B';
  const undone = restoreHistory(commit(commit(history, sceneA), sceneB), 'undo');
  const present = undone.history.present;
  const future = undone.history.future[0];
  for (const scene of [present, future]) {
    const grid = scene.grid;
    Object.defineProperty(scene, 'grid', {
      enumerable: true,
      configurable: true,
      get() { return grid; },
    });
  }
  return { undone, present, future };
}

test('undo restores world credits on the caller world', () => {
  const { undone, present } = sceneWithFuture();
  const world = present.world;
  const credits = world.credits;
  undone.history.future[0].toJSON = function () {
    world.credits = 1;
    Object.defineProperty(world, 'credits', { value: 1, writable: false, configurable: false });
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  assert.equal(back.ok, true, (back.issues || []).join('\n'));
  const redone = restoreHistory(back.history, 'redo');
  assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
  const desc = Object.getOwnPropertyDescriptor(world, 'credits');
  assert.equal(world.credits, credits);
  assert.equal(desc.value, credits);
  assert.equal(desc.writable, true);
  assert.equal(clone(present).world.credits, credits);
  assert.equal(redone.history.present.world, world);
  assert.equal(redone.history.present.world.credits, credits);
});

test('undo restores credits and zoom sealed by defineProperties', () => {
  const { undone, present } = sceneWithFuture();
  const world = present.world;
  const camera = present.camera;
  const credits = world.credits;
  const zoom = camera.zoom;
  undone.history.future[0].toJSON = function () {
    world.credits = 1;
    Object.defineProperties(world, {
      credits: { value: 1, writable: false, configurable: false },
    });
    camera.zoom = 0;
    Object.defineProperties(camera, {
      zoom: { value: 0, writable: false, configurable: false },
    });
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  assert.equal(back.ok, true, (back.issues || []).join('\n'));
  const redone = restoreHistory(back.history, 'redo');
  assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
  assert.equal(world.credits, credits);
  assert.equal(camera.zoom, zoom);
  assert.equal(Object.getOwnPropertyDescriptor(world, 'credits').writable, true);
  assert.equal(Object.getOwnPropertyDescriptor(camera, 'zoom').writable, true);
  assert.equal(Object.getOwnPropertyDescriptor(world, 'credits').value, credits);
  assert.equal(Object.getOwnPropertyDescriptor(camera, 'zoom').value, zoom);
  assert.equal(clone(present).world.credits, credits);
  assert.equal(clone(present).camera.zoom, zoom);
  assert.equal(redone.history.present.world, world);
  assert.equal(redone.history.present.camera, camera);
});

test('a reflected credits getter is not left on the caller', () => {
  const deleted = sceneWithFuture();
  const world = deleted.present.world;
  const credits = world.credits;
  deleted.future.toJSON = function () {
    delete world.credits;
    Reflect.defineProperty(world, 'credits', {
      configurable: false,
      enumerable: true,
      get() { return 4; },
    });
    return this;
  };
  const back = restoreHistory(deleted.undone.history, 'undo');
  assert.equal(back.ok, true, (back.issues || []).join('\n'));
  const redone = restoreHistory(back.history, 'redo');
  assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
  const desc = Object.getOwnPropertyDescriptor(world, 'credits');
  assert.equal(desc.value, credits);
  assert.equal(desc.writable, true);
  assert.equal(typeof desc.get, 'undefined');
  assert.equal(clone(deleted.present).world.credits, credits);
  world.credits = 9;
  assert.equal(world.credits, 9);
  assert.equal(redone.history.present, deleted.present);
  assert.equal(redone.history.present.world, world);

  const accessor = sceneWithFuture();
  const host = accessor.present.world;
  const original = host.credits;
  accessor.future.toJSON = function () {
    let next = original;
    Object.defineProperty(host, 'credits', {
      configurable: true,
      enumerable: true,
      get() { return next; },
      set(value) { next = value; },
    });
    Reflect.defineProperty(host, 'credits', {
      configurable: false,
      enumerable: true,
      get() { return 4; },
    });
    return this;
  };
  const undone = restoreHistory(accessor.undone.history, 'undo');
  assert.equal(undone.ok, true, (undone.issues || []).join('\n'));
  const restored = restoreHistory(undone.history, 'redo');
  assert.equal(restored.ok, true, (restored.issues || []).join('\n'));
  const after = Object.getOwnPropertyDescriptor(host, 'credits');
  assert.equal(after.value, original);
  assert.equal(after.writable, true);
  assert.equal(typeof after.get, 'undefined');
  assert.equal(clone(accessor.present).world.credits, original);
  host.credits = 9;
  assert.equal(host.credits, 9);
  assert.equal(restored.history.present, accessor.present);

  const existing = sceneWithFuture();
  const live = existing.present.world;
  const starting = live.credits;
  let slot = starting;
  Object.defineProperty(live, 'credits', {
    configurable: true,
    enumerable: true,
    get() { return slot; },
    set(value) { slot = value; },
  });
  existing.future.toJSON = function () {
    Reflect.defineProperty(live, 'credits', {
      configurable: false,
      enumerable: true,
      get() { return 4; },
    });
    return this;
  };
  const refused = restoreHistory(existing.undone.history, 'undo');
  assert.equal(refused.ok, true, (refused.issues || []).join('\n'));
  const returned = restoreHistory(refused.history, 'redo');
  assert.equal(returned.ok, true, (returned.issues || []).join('\n'));
  const kept = Object.getOwnPropertyDescriptor(live, 'credits');
  assert.equal(kept.value, starting);
  assert.equal(kept.writable, true);
  assert.equal(typeof kept.get, 'undefined');
  assert.equal(clone(existing.present).world.credits, starting);
  live.credits = 9;
  assert.equal(live.credits, 9);
  assert.equal(returned.history.present, existing.present);
  assert.equal(returned.history.present.world, live);
});

test('a deleted credits field cannot be sealed back as data', async () => {
  const { undone, present } = sceneWithFuture();
  const world = present.world;
  const camera = present.camera;
  const credits = world.credits;
  const zoom = camera.zoom;
  undone.history.future[0].toJSON = function () {
    delete world.credits;
    Reflect.defineProperty(world, 'credits', {
      value: 1,
      writable: false,
      configurable: false,
      enumerable: true,
    });
    delete camera.zoom;
    Reflect.defineProperty(camera, 'zoom', {
      value: 0,
      writable: false,
      configurable: false,
      enumerable: true,
    });
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  assert.equal(back.ok, true, (back.issues || []).join('\n'));
  const redone = restoreHistory(back.history, 'redo');
  assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
  const creditDesc = Object.getOwnPropertyDescriptor(world, 'credits');
  const zoomDesc = Object.getOwnPropertyDescriptor(camera, 'zoom');
  assert.equal(creditDesc.value, credits);
  assert.equal(creditDesc.writable, true);
  assert.equal(creditDesc.configurable, true);
  assert.equal(zoomDesc.value, zoom);
  assert.equal(zoomDesc.writable, true);
  assert.equal(zoomDesc.configurable, true);
  world.credits = 9;
  camera.zoom = 3.2;
  assert.equal(world.credits, 9);
  assert.equal(camera.zoom, 3.2);
  world.credits = credits;
  camera.zoom = zoom;
  assert.equal(clone(present).world.credits, credits);
  assert.equal(clone(present).camera.zoom, zoom);
  assert.equal(redone.history.present, present);
});

test('an omitted define flag does not seal deleted credits or zoom', () => {
  const { undone, present } = sceneWithFuture();
  const world = present.world;
  const camera = present.camera;
  assert.equal(world.credits, 5000);
  assert.equal(camera.zoom, 3.2);
  undone.history.future[0].toJSON = function () {
    delete world.credits;
    Reflect.defineProperty(world, 'credits', { value: 5000 });
    delete camera.zoom;
    Reflect.defineProperty(camera, 'zoom', { value: 3.2 });
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  assert.equal(back.ok, true, (back.issues || []).join('\n'));
  const redone = restoreHistory(back.history, 'redo');
  assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
  const creditDesc = Object.getOwnPropertyDescriptor(world, 'credits');
  const zoomDesc = Object.getOwnPropertyDescriptor(camera, 'zoom');
  assert.equal(creditDesc.value, 5000);
  assert.equal(creditDesc.writable, true);
  assert.equal(creditDesc.configurable, true);
  assert.equal(typeof creditDesc.get, 'undefined');
  assert.equal(zoomDesc.value, 3.2);
  assert.equal(zoomDesc.writable, true);
  assert.equal(zoomDesc.configurable, true);
  world.credits = 9;
  camera.zoom = 3.2;
  assert.equal(world.credits, 9);
  assert.equal(camera.zoom, 3.2);
  assert.equal(redone.history.present, present);
  assert.equal(redone.history.present.world, world);
  assert.equal(redone.history.present.camera, camera);
});

test('a zero define flag does not seal deleted credits or zoom', () => {
  const { undone, present } = sceneWithFuture();
  const world = present.world;
  const camera = present.camera;
  assert.equal(world.credits, 5000);
  assert.equal(camera.zoom, 3.2);
  undone.history.future[0].toJSON = function () {
    delete world.credits;
    Reflect.defineProperty(world, 'credits', {
      value: 5000,
      writable: 0,
      configurable: 0,
      enumerable: true,
    });
    delete camera.zoom;
    Reflect.defineProperty(camera, 'zoom', {
      value: 3.2,
      writable: 0,
      configurable: 0,
      enumerable: true,
    });
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  assert.equal(back.ok, true, (back.issues || []).join('\n'));
  const redone = restoreHistory(back.history, 'redo');
  assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
  const creditDesc = Object.getOwnPropertyDescriptor(world, 'credits');
  const zoomDesc = Object.getOwnPropertyDescriptor(camera, 'zoom');
  assert.equal(creditDesc.value, 5000);
  assert.equal(creditDesc.writable, true);
  assert.equal(creditDesc.configurable, true);
  assert.equal(zoomDesc.value, 3.2);
  assert.equal(zoomDesc.writable, true);
  assert.equal(zoomDesc.configurable, true);
  world.credits = 9;
  camera.zoom = 3.2;
  assert.equal(world.credits, 9);
  assert.equal(camera.zoom, 3.2);
  assert.equal(redone.history.present, present);
  assert.equal(redone.history.present.world, world);
});

test('a new nested field does not survive undo', async () => {
  const { undone, present } = sceneWithFuture();
  const world = present.world;
  const cargo = objectById(present, 'cargo');
  const team = cargo.team;
  assert.equal(Object.prototype.hasOwnProperty.call(world, 'name'), false);
  const yBefore = Object.prototype.hasOwnProperty.call(cargo, 'y') ? cargo.y : undefined;
  undone.history.future[0].toJSON = function () {
    world.name = 'poison';
    Object.defineProperty(world, 'name', { value: 'poison', writable: false, configurable: false });
    cargo.y = 9;
    Object.defineProperty(cargo, 'y', { value: 9, writable: false, configurable: false });
    cargo.team = 7;
    Object.defineProperty(cargo, 'team', { value: 7, writable: false, configurable: false });
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  assert.equal(back.ok, true, (back.issues || []).join('\n'));
  const redone = restoreHistory(back.history, 'redo');
  assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
  assert.equal(Object.prototype.hasOwnProperty.call(world, 'name'), false);
  assert.equal(cargo.team, team);
  assert.equal(Object.getOwnPropertyDescriptor(cargo, 'team').writable, true);
  if (yBefore === undefined) assert.equal(Object.prototype.hasOwnProperty.call(cargo, 'y'), false);
  else assert.equal(cargo.y, yBefore);
  const saved = savedProjectText(present);
  assert.equal(saved.ok, true, (saved.issues || []).join('\n'));
  assert.equal(saved.text.includes('"name": "poison"'), false);
  const exported = await exportProject(present);
  assert.equal(exported.ok, true, (exported.issues || []).join('\n'));
  const entity = exported.scenario.entities.find((row) => row.alias === 'cargo');
  assert.equal(entity.pos.y, 0);
  assert.notEqual(entity.pos.y, 9);
  assert.equal(redone.history.present, present);
});

test('a reflected new key is not installed when its flags are omitted', async () => {
  const { undone, present } = sceneWithFuture();
  const world = present.world;
  const cargo = objectById(present, 'cargo');
  assert.equal(Object.prototype.hasOwnProperty.call(world, 'name'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(cargo, 'y'), false);
  undone.history.future[0].toJSON = function () {
    Reflect.defineProperty(world, 'name', { value: 'poison', enumerable: true });
    Reflect.defineProperty(cargo, 'y', { value: 9, enumerable: true });
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  assert.equal(Object.prototype.hasOwnProperty.call(world, 'name'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(cargo, 'y'), false);
  assert.equal(back.ok, true, (back.issues || []).join('\n'));
  const redone = restoreHistory(back.history, 'redo');
  assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
  assert.equal(Object.prototype.hasOwnProperty.call(world, 'name'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(cargo, 'y'), false);
  assert.equal(redone.history.present, present);
  const saved = savedProjectText(present);
  assert.equal(saved.ok, true, (saved.issues || []).join('\n'));
  assert.equal(saved.text.includes('"name": "poison"'), false);
  const exported = await exportProject(present);
  assert.equal(exported.ok, true, (exported.issues || []).join('\n'));
  const entity = exported.scenario.entities.find((row) => row.alias === 'cargo');
  assert.equal(entity.pos.y, 0);
  assert.notEqual(entity.pos.y, 9);
});

test('defineProperties cannot seal a deleted credits or zoom field', () => {
  const { undone, present } = sceneWithFuture();
  const world = present.world;
  const camera = present.camera;
  assert.equal(world.credits, 5000);
  assert.equal(camera.zoom, 3.2);
  undone.history.future[0].toJSON = function () {
    delete world.credits;
    Object.defineProperties(world, { credits: { value: 1, enumerable: true } });
    delete camera.zoom;
    Object.defineProperties(camera, { zoom: { value: 0, enumerable: true } });
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  const creditDesc = Object.getOwnPropertyDescriptor(world, 'credits');
  const zoomDesc = Object.getOwnPropertyDescriptor(camera, 'zoom');
  assert.notEqual(creditDesc && creditDesc.value, 1);
  assert.notEqual(zoomDesc && zoomDesc.value, 0);
  if (!back.ok) {
    assert.equal(back.history.present, present);
    assert.equal(creditDesc.writable, true);
    assert.equal(zoomDesc.writable, true);
    return;
  }
  const redone = restoreHistory(back.history, 'redo');
  assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
  assert.equal(redone.history.present, present);
  assert.equal(world.credits, 5000);
  assert.equal(camera.zoom, 3.2);
  assert.equal(Object.getOwnPropertyDescriptor(world, 'credits').writable, true);
  assert.equal(Object.getOwnPropertyDescriptor(camera, 'zoom').writable, true);
  world.credits = 9;
  camera.zoom = 3.2;
  assert.equal(world.credits, 9);
  assert.equal(camera.zoom, 3.2);
});

test('a nested grid label does not survive undo', () => {
  const { undone, present } = sceneWithFuture();
  present.grid.origin = { kind: 'marker' };
  undone.history.future[0].toJSON = function () {
    present.grid.origin.label = 'poison';
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  const redone = back.ok ? restoreHistory(back.history, 'redo') : back;
  if (back.ok) assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
  else assert.equal(back.history.present, present);
  assert.equal(Object.prototype.hasOwnProperty.call(present.grid.origin, 'label'), false);
  assert.equal(redone.history.present, present);
  const saved = savedProjectText(present);
  assert.equal(saved.ok, true, (saved.issues || []).join('\n'));
  assert.equal(saved.text.includes('"label": "poison"'), false);
});

test('an array note does not survive undo', () => {
  const { undone, present } = sceneWithFuture();
  undone.history.future[0].toJSON = function () {
    present.objects.note = 'poison';
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  const redone = back.ok ? restoreHistory(back.history, 'redo') : back;
  if (back.ok) assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
  else assert.equal(back.history.present, present);
  assert.equal(Object.prototype.hasOwnProperty.call(present.objects, 'note'), false);
  assert.equal(Object.getOwnPropertyNames(present.objects).includes('note'), false);
  assert.equal(redone.history.present, present);
});

test('a nested marks push does not survive undo', () => {
  const { undone, present } = sceneWithFuture();
  present.grid.origin = { marks: ['keep'] };
  undone.history.future[0].toJSON = function () {
    present.grid.origin.marks.push('poison');
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  const redone = back.ok ? restoreHistory(back.history, 'redo') : back;
  if (back.ok) assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
  else assert.equal(back.history.present, present);
  assert.deepEqual(present.grid.origin.marks, ['keep']);
  assert.equal(redone.history.present, present);
  const saved = savedProjectText(present);
  assert.equal(saved.ok, true, (saved.issues || []).join('\n'));
  assert.equal(saved.text.includes('poison'), false);
});

test('Object.seal cannot keep a new name or cargo height', async () => {
  const { undone, present } = sceneWithFuture();
  const world = present.world;
  const cargo = objectById(present, 'cargo');
  const team = cargo.team;
  const yBefore = Object.prototype.hasOwnProperty.call(cargo, 'y') ? cargo.y : undefined;
  assert.equal(team, 2);
  undone.history.future[0].toJSON = function () {
    world.name = 'poison';
    Object.seal(world);
    cargo.y = 9;
    Object.seal(cargo);
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  assert.equal(Object.prototype.hasOwnProperty.call(world, 'name'), false);
  if (yBefore === undefined) assert.equal(Object.prototype.hasOwnProperty.call(cargo, 'y'), false);
  else assert.equal(cargo.y, yBefore);
  assert.equal(cargo.team, team);
  if (!back.ok) assert.equal(back.history.present, present);
  else {
    const redone = restoreHistory(back.history, 'redo');
    assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
    assert.equal(redone.history.present, present);
  }
  const saved = savedProjectText(present);
  assert.equal(saved.ok, true, (saved.issues || []).join('\n'));
  assert.equal(saved.text.includes('"name": "poison"'), false);
  const exported = await exportProject(present);
  assert.equal(exported.ok, true, (exported.issues || []).join('\n'));
  const entity = exported.scenario.entities.find((row) => row.alias === 'cargo');
  assert.equal(entity.pos.y, 0);
  assert.notEqual(entity.pos.y, 9);
});

test('a getter pocket on an actor does not keep a tag', async () => {
  const { undone, present } = sceneWithFuture();
  const cargo = objectById(present, 'cargo');
  const overrides = { mass: 1 };
  const label = { text: 'crossing cargo' };
  Object.defineProperty(cargo, 'overrides', {
    configurable: true,
    enumerable: true,
    get() { return overrides; },
  });
  Object.defineProperty(cargo, 'label', {
    configurable: true,
    enumerable: true,
    get() { return label; },
  });
  undone.history.future[0].toJSON = function () {
    Object.defineProperties(cargo.overrides, { tag: { value: 'poison', enumerable: true } });
    label.tag = 'poison';
    Object.defineProperties(cargo.label, { tag: { value: 'poison', enumerable: true } });
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  const redone = back.ok ? restoreHistory(back.history, 'redo') : back;
  if (!back.ok) assert.equal(back.history.present, present);
  else {
    assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
    assert.equal(redone.history.present, present);
  }
  assert.equal(Object.prototype.hasOwnProperty.call(overrides, 'tag'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(label, 'tag'), false);
  const exported = await exportProject(present);
  assert.equal((exported.issues || []).some((issue) => issue.includes('tag')), false, (exported.issues || []).join('\n'));
  assert.equal(exported.ok, true, (exported.issues || []).join('\n'));
});

test('an inherited descriptor value cannot seal credits, zoom, team, or height', async () => {
  const { undone, present } = sceneWithFuture();
  const world = present.world;
  const camera = present.camera;
  const cargo = objectById(present, 'cargo');
  const team = cargo.team;
  const yBefore = Object.prototype.hasOwnProperty.call(cargo, 'y') ? cargo.y : undefined;
  assert.equal(world.credits, 5000);
  assert.equal(camera.zoom, 3.2);
  assert.equal(team, 2);
  undone.history.future[0].toJSON = function () {
    delete world.credits;
    Object.defineProperties(world, { credits: Object.create({ value: 1, enumerable: true }) });
    delete camera.zoom;
    Object.defineProperties(camera, { zoom: Object.create({ value: 0, enumerable: true }) });
    Object.defineProperties(cargo, { team: Object.create({ value: 1, enumerable: true }) });
    Object.defineProperties(cargo, { y: Object.create({ value: 9, enumerable: true }) });
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  if (!back.ok) assert.equal(back.history.present, present);
  else {
    const redone = restoreHistory(back.history, 'redo');
    assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
    assert.equal(redone.history.present, present);
  }
  const creditDesc = Object.getOwnPropertyDescriptor(world, 'credits');
  const zoomDesc = Object.getOwnPropertyDescriptor(camera, 'zoom');
  assert.equal(creditDesc.value, 5000);
  assert.equal(creditDesc.writable, true);
  assert.equal(zoomDesc.value, 3.2);
  assert.equal(zoomDesc.writable, true);
  world.credits = 9;
  camera.zoom = 3.2;
  assert.equal(world.credits, 9);
  assert.equal(camera.zoom, 3.2);
  world.credits = 5000;
  assert.equal(cargo.team, team);
  if (yBefore === undefined) assert.equal(Object.prototype.hasOwnProperty.call(cargo, 'y'), false);
  else assert.equal(cargo.y, yBefore);
  const saved = savedProjectText(present);
  assert.equal(saved.ok, true, (saved.issues || []).join('\n'));
  assert.equal(saved.text.includes('"y": 9'), false);
  const exported = await exportProject(present);
  assert.equal(exported.ok, true, (exported.issues || []).join('\n'));
  const entity = exported.scenario.entities.find((row) => row.alias === 'cargo');
  assert.notEqual(entity.pos.y, 9);
  assert.equal(entity.pos.y, 0);
});

test('a configurable-only define cannot freeze a new field', async () => {
  const { undone, present } = sceneWithFuture();
  const world = present.world;
  const cargo = objectById(present, 'cargo');
  const yBefore = Object.prototype.hasOwnProperty.call(cargo, 'y') ? cargo.y : undefined;
  present.grid.origin = { marks: ['keep'] };
  undone.history.future[0].toJSON = function () {
    world.name = 'poison';
    Object.defineProperties(world, { name: { configurable: false } });
    cargo.y = 9;
    Object.defineProperties(cargo, { y: { configurable: false } });
    present.grid.origin.tag = 'poison';
    Object.defineProperties(present.grid.origin, { tag: { configurable: false } });
    present.objects.note = 'poison';
    Object.defineProperties(present.objects, { note: { configurable: false } });
    present.grid.origin.marks.splice(0, 1);
    Object.defineProperties(present.grid.origin.marks, {
      0: Object.create({ value: 'poison', enumerable: true }),
    });
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  if (!back.ok) assert.equal(back.history.present, present);
  else {
    const redone = restoreHistory(back.history, 'redo');
    assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
    assert.equal(redone.history.present, present);
  }
  assert.equal(Object.prototype.hasOwnProperty.call(world, 'name'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(present.grid.origin, 'tag'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(present.objects, 'note'), false);
  if (yBefore === undefined) assert.equal(Object.prototype.hasOwnProperty.call(cargo, 'y'), false);
  else assert.equal(cargo.y, yBefore);
  assert.deepEqual(present.grid.origin.marks, ['keep']);
  const saved = savedProjectText(present);
  assert.equal(saved.ok, true, (saved.issues || []).join('\n'));
  assert.equal(saved.text.includes('poison'), false);
  assert.equal(saved.text.includes('"y": 9'), false);
  const exported = await exportProject(present);
  assert.equal(exported.ok, true, (exported.issues || []).join('\n'));
  const entity = exported.scenario.entities.find((row) => row.alias === 'cargo');
  assert.notEqual(entity.pos.y, 9);
  assert.equal(entity.pos.y, 0);
});

test('defineProperty configurable false does not keep a new name or height', async () => {
  const { undone, present } = sceneWithFuture();
  const world = present.world;
  const cargo = objectById(present, 'cargo');
  const yBefore = Object.prototype.hasOwnProperty.call(cargo, 'y') ? cargo.y : undefined;
  undone.history.future[0].toJSON = function () {
    Object.defineProperty(world, 'name', { configurable: false });
    Object.defineProperty(cargo, 'y', { configurable: false });
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  assert.equal(Object.prototype.hasOwnProperty.call(world, 'name'), false);
  if (yBefore === undefined) assert.equal(Object.prototype.hasOwnProperty.call(cargo, 'y'), false);
  else assert.equal(cargo.y, yBefore);
  assert.equal(delete world.name, true);
  assert.equal(delete cargo.y, true);
  if (!back.ok) assert.equal(back.history.present, present);
  else {
    const redone = restoreHistory(back.history, 'redo');
    assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
    assert.equal(redone.history.present, present);
    assert.equal(redone.history.present.world, world);
    assert.equal(objectById(redone.history.present, 'cargo'), cargo);
  }
  const saved = savedProjectText(present);
  assert.equal(saved.ok, true, (saved.issues || []).join('\n'));
  assert.equal(saved.text.includes('poison'), false);
  const exported = await exportProject(present);
  assert.equal(exported.ok, true, (exported.issues || []).join('\n'));
  const entity = exported.scenario.entities.find((row) => row.alias === 'cargo');
  assert.notEqual(entity.pos.y, 9);
});

test('defineProperty cannot freeze a pushed mark', () => {
  const { undone, present } = sceneWithFuture();
  present.grid.origin = { marks: ['keep'] };
  undone.history.future[0].toJSON = function () {
    Object.defineProperty(present.grid.origin.marks, '1', { configurable: false });
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  if (!back.ok) assert.equal(back.history.present, present);
  else {
    const redone = restoreHistory(back.history, 'redo');
    assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
    assert.equal(redone.history.present, present);
  }
  assert.deepEqual(present.grid.origin.marks, ['keep']);
  assert.equal(present.grid.origin.marks.length, 1);
});

test('preventExtensions cannot drop credits', () => {
  const { undone, present } = sceneWithFuture();
  const world = present.world;
  assert.equal(world.credits, 5000);
  undone.history.future[0].toJSON = function () {
    delete world.credits;
    Object.preventExtensions(world);
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  assert.equal(back.ok, true, (back.issues || []).join('\n'));
  const redone = restoreHistory(back.history, 'redo');
  assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
  assert.equal(redone.history.present, present);
  const creditDesc = Object.getOwnPropertyDescriptor(world, 'credits');
  assert.equal(creditDesc.value, 5000);
  assert.equal(creditDesc.writable, true);
  assert.equal(creditDesc.configurable, true);
  assert.equal(Object.isExtensible(world), true);
  world.credits = 5000;
  assert.equal(world.credits, 5000);
});

test('a configurable-only define leaves credits deletable', () => {
  const { undone, present } = sceneWithFuture();
  const world = present.world;
  undone.history.future[0].toJSON = function () {
    delete world.credits;
    Object.defineProperty(world, 'credits', { configurable: false });
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  assert.equal(back.ok, true, (back.issues || []).join('\n'));
  const redone = restoreHistory(back.history, 'redo');
  assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
  assert.equal(redone.history.present, present);
  const creditDesc = Object.getOwnPropertyDescriptor(world, 'credits');
  assert.equal(creditDesc.value, 5000);
  assert.equal(creditDesc.writable, true);
  assert.equal(creditDesc.configurable, true);
  assert.equal(delete world.credits, true);
  assert.equal(Object.prototype.hasOwnProperty.call(world, 'credits'), false);
});

test('writable true on a missing name does not install a sealed field', () => {
  const { undone, present } = sceneWithFuture();
  const world = present.world;
  present.grid.origin = { marks: ['keep'] };
  undone.history.future[0].toJSON = function () {
    Object.defineProperty(world, 'name', { writable: true });
    Object.defineProperty(present.grid.origin.marks, '1', { configurable: false });
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  assert.equal(back.ok, true, (back.issues || []).join('\n'));
  const redone = restoreHistory(back.history, 'redo');
  assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
  assert.equal(redone.history.present, present);
  assert.equal(Object.prototype.hasOwnProperty.call(world, 'name'), false);
  assert.equal(delete world.name, true);
  assert.deepEqual(present.grid.origin.marks, ['keep']);
  assert.equal(present.grid.origin.marks.length, 1);
});

test('a non-enumerable override getter does not keep a tag or a frozen box', async () => {
  const { undone, present } = sceneWithFuture();
  const cargo = objectById(present, 'cargo');
  const pocket = { mass: 1 };
  const label = { text: 'lane' };
  let box = null;
  Object.defineProperty(cargo, 'overrides', {
    configurable: true,
    get() { return pocket; },
  });
  Object.defineProperty(cargo, 'label', {
    configurable: true,
    get() { return label; },
  });
  undone.history.future[0].toJSON = function () {
    Object.defineProperties(pocket, { tag: { value: 'poison', enumerable: true } });
    box = { id: 'poison' };
    pocket.box = box;
    Object.freeze(pocket.box);
    Object.defineProperty(label, 'tag', Object.create({ value: 'poison', enumerable: true }));
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  if (!back.ok) assert.equal(back.history.present, present);
  else {
    const redone = restoreHistory(back.history, 'redo');
    assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
    assert.equal(redone.history.present, present);
  }
  assert.equal(Object.prototype.hasOwnProperty.call(pocket, 'tag'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pocket, 'box'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(label, 'tag'), false);
  if (box) assert.equal(Object.isFrozen(box), false);
  const exported = await exportProject(present);
  assert.equal((exported.issues || []).some((issue) => issue.includes('tag') || issue.includes('box')), false, (exported.issues || []).join('\n'));
  assert.equal(exported.ok, true, (exported.issues || []).join('\n'));
  const entity = exported.scenario.entities.find((row) => row.alias === 'cargo');
  assert.equal(entity.overrides.mass, 1);
  assert.equal(entity.overrides.tag, undefined);
  assert.equal(entity.overrides.box, undefined);
});

test('a getter behind an array is snapshotted', async () => {
  const { undone, present } = sceneWithFuture();
  const cargo = objectById(present, 'cargo');
  const pocket = { mass: 1 };
  const mid = [];
  let box = null;
  Object.defineProperty(mid, 'overrides', {
    enumerable: true,
    configurable: true,
    get() { return pocket; },
  });
  Object.defineProperty(cargo, 'label', {
    enumerable: true,
    configurable: true,
    get() { return mid; },
  });
  undone.history.future[0].toJSON = function () {
    Object.defineProperty(pocket, 'tag', Object.create({ value: 'poison', enumerable: true }));
    box = { keep: true };
    pocket.box = box;
    Object.freeze(pocket.box);
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  const redone = back.ok ? restoreHistory(back.history, 'redo') : back;
  if (back.ok) {
    assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
    assert.equal(redone.history.present, present);
  } else {
    assert.equal(back.history.present, present);
  }
  assert.equal(Object.prototype.hasOwnProperty.call(pocket, 'tag'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pocket, 'box'), false);
  if (box) assert.equal(Object.isFrozen(box), false);
  assert.equal(Object.isFrozen(pocket), false);

  const nested = sceneWithFuture();
  const host = objectById(nested.present, 'cargo');
  const inner = { mass: 1 };
  const row = [];
  Object.defineProperty(row, '0', { get() { return inner; } });
  Object.defineProperty(host, 'overrides', {
    enumerable: true,
    configurable: true,
    get() { return row; },
  });
  nested.undone.history.future[0].toJSON = function () {
    inner.tag = 'poison';
    Object.freeze(inner);
    return this;
  };
  const undoneNested = restoreHistory(nested.undone.history, 'undo');
  if (undoneNested.ok) restoreHistory(undoneNested.history, 'redo');
  else assert.equal(undoneNested.history.present, nested.present);
  assert.equal(Object.prototype.hasOwnProperty.call(inner, 'tag'), false);
  assert.equal(Object.isFrozen(inner), false);
});

test('an inherited override tag is not exported and does not stay frozen', async () => {
  const { undone, present } = sceneWithFuture();
  const cargo = objectById(present, 'cargo');
  const proto = {};
  const pocket = Object.create(proto);
  pocket.mass = 1;
  Object.defineProperty(cargo, 'overrides', {
    enumerable: true,
    configurable: true,
    get() { return pocket; },
  });
  undone.history.future[0].toJSON = function () {
    proto.tag = 'poison';
    Object.freeze(proto);
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  if (back.ok) {
    const redone = restoreHistory(back.history, 'redo');
    assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
    assert.equal(redone.history.present, present);
  } else {
    assert.equal(back.history.present, present);
  }
  assert.equal(Object.prototype.hasOwnProperty.call(proto, 'tag'), false);
  assert.equal(proto.tag, undefined);
  assert.equal(Object.isFrozen(proto), false);
  const exported = await exportProject(present);
  const entity = exported.scenario && exported.scenario.entities.find((row) => row.alias === 'cargo');
  assert.equal(entity && entity.overrides && entity.overrides.tag, undefined);
  assert.equal(JSON.stringify(entity && entity.overrides || {}).includes('poison'), false);

  const direct = getComposition('dock.intercept-cargo');
  const directCargo = objectById(direct, 'cargo');
  const directProto = { tag: 'poison' };
  const directPocket = Object.create(directProto);
  directPocket.mass = 1;
  directCargo.overrides = directPocket;
  const directExport = await exportProject(direct);
  assert.equal(directExport.ok, false);
  assert.equal(directExport.issues.some((issue) => issue.includes('overrides.tag')), true);
  const directEntity = directExport.scenario.entities.find((row) => row.alias === 'cargo');
  assert.equal(directEntity.overrides.tag, undefined);
  assert.equal(directEntity.overrides.mass, 1);
  assert.equal(JSON.stringify(directEntity.overrides).includes('poison'), false);
});

test('a function descriptor cannot seal credits', async () => {
  const { undone, present } = sceneWithFuture();
  const world = present.world;
  const desc = function creditsDescriptor() {};
  desc.value = 1;
  desc.writable = false;
  desc.configurable = false;
  desc.enumerable = true;
  undone.history.future[0].toJSON = function () {
    Object.defineProperty(world, 'credits', desc);
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  if (!back.ok) {
    assert.equal(back.history.present, present);
    assert.notEqual(world.credits, 1);
  } else {
    const redone = restoreHistory(back.history, 'redo');
    assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
    assert.equal(redone.history.present, present);
  }
  const creditDesc = Object.getOwnPropertyDescriptor(world, 'credits');
  assert.equal(creditDesc.value, 5000);
  assert.equal(creditDesc.writable, true);
  assert.equal(creditDesc.configurable, true);
  world.credits = 5000;
  assert.equal(world.credits, 5000);
  const exported = await exportProject(present);
  assert.equal(exported.scenario.world.credits, 5000);
  assert.notEqual(exported.scenario.world.credits, 1);
});

test('a missing key cannot be defined without a value', () => {
  const { undone, present } = sceneWithFuture();
  const world = present.world;
  assert.equal(Object.prototype.hasOwnProperty.call(world, 'name'), false);
  undone.history.future[0].toJSON = function () {
    Object.defineProperty(world, 'name', { configurable: false });
    Object.defineProperties(world, { alias: { configurable: false } });
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  if (!back.ok) assert.equal(back.history.present, present);
  else {
    const redone = restoreHistory(back.history, 'redo');
    assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
    assert.equal(redone.history.present, present);
  }
  assert.equal(Object.prototype.hasOwnProperty.call(world, 'name'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(world, 'alias'), false);
  assert.equal(delete world.name, true);
  assert.equal(delete world.alias, true);
});

test('an enumerable-only define cannot replace deleted credits', () => {
  const { undone, present } = sceneWithFuture();
  const world = present.world;
  const defineProperty = Object.defineProperty;
  const defineProperties = Object.defineProperties;
  assert.equal(world.credits, 5000);
  undone.history.future[0].toJSON = function () {
    delete world.credits;
    defineProperty(world, 'credits', { enumerable: true });
    defineProperties(world, { name: { configurable: false } });
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  assert.equal(back.ok, true, (back.issues || []).join('\n'));
  const redone = restoreHistory(back.history, 'redo');
  assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
  assert.equal(redone.history.present, present);
  const creditDesc = Object.getOwnPropertyDescriptor(world, 'credits');
  assert.equal(creditDesc.value, 5000);
  assert.equal(creditDesc.writable, true);
  assert.equal(creditDesc.configurable, true);
  assert.equal(Object.prototype.hasOwnProperty.call(world, 'name'), false);
  world.credits = 5000;
  assert.equal(world.credits, 5000);
  assert.equal(delete world.name, true);
});

test('defineProperties shorthand cannot seal credits with a function', () => {
  const { undone, present } = sceneWithFuture();
  const world = present.world;
  const defineProperties = Object.defineProperties;
  const credits = function () {};
  assert.equal(Object.prototype.hasOwnProperty.call(credits, 'value'), false);
  undone.history.future[0].toJSON = function () {
    delete world.credits;
    defineProperties(world, { credits });
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  assert.equal(back.ok, true, (back.issues || []).join('\n'));
  const redone = restoreHistory(back.history, 'redo');
  assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
  assert.equal(redone.history.present.world, world);
  const creditDesc = Object.getOwnPropertyDescriptor(world, 'credits');
  assert.equal(creditDesc.value, 5000);
  assert.equal(creditDesc.writable, true);
  assert.equal(creditDesc.configurable, true);
  world.credits = 9;
  assert.equal(world.credits, 9);
  assert.equal(delete world.credits, true);
});

test('freezing a non-enumerable override pocket does not keep the tag', () => {
  const { undone, present } = sceneWithFuture();
  const cargo = objectById(present, 'cargo');
  const pocket = { mass: 1 };
  const freeze = Object.freeze;
  Object.defineProperty(cargo, 'overrides', {
    enumerable: false,
    configurable: true,
    get() { return pocket; },
  });
  undone.history.future[0].toJSON = function () {
    cargo.overrides.tag = 'poison';
    freeze(cargo.overrides);
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  assert.equal(back.ok, true, (back.issues || []).join('\n'));
  const redone = restoreHistory(back.history, 'redo');
  assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
  assert.equal(Object.prototype.hasOwnProperty.call(pocket, 'tag'), false);
  assert.equal(pocket.tag, undefined);
  assert.equal(Object.isFrozen(pocket), false);

  const nested = sceneWithFuture();
  const host = objectById(nested.present, 'cargo');
  const inner = { mass: 1 };
  const row = [];
  const freezeInner = Object.freeze;
  Object.defineProperty(row, '0', { get() { return inner; } });
  Object.defineProperty(host, 'overrides', {
    enumerable: true,
    configurable: true,
    get() { return row; },
  });
  nested.undone.history.future[0].toJSON = function () {
    const element = host.overrides[0];
    element.tag = 'poison';
    freezeInner(element);
    return this;
  };
  const undoneNested = restoreHistory(nested.undone.history, 'undo');
  assert.equal(undoneNested.ok, true, (undoneNested.issues || []).join('\n'));
  restoreHistory(undoneNested.history, 'redo');
  assert.equal(Object.prototype.hasOwnProperty.call(inner, 'tag'), false);
  assert.equal(Object.isFrozen(inner), false);
});

test('a new key defined with only writable false does not stay', () => {
  const { undone, present } = sceneWithFuture();
  const world = present.world;
  const cargo = objectById(present, 'cargo');
  const yBefore = Object.prototype.hasOwnProperty.call(cargo, 'y') ? cargo.y : undefined;
  const defineProperty = Object.defineProperty;
  undone.history.future[0].toJSON = function () {
    defineProperty(world, 'name', { writable: false });
    defineProperty(cargo, 'y', { writable: false });
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  if (!back.ok) assert.equal(back.history.present, present);
  else {
    const redone = restoreHistory(back.history, 'redo');
    assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
    assert.equal(redone.history.present, present);
  }
  assert.equal(Object.prototype.hasOwnProperty.call(world, 'name'), false);
  if (yBefore === undefined) assert.equal(Object.prototype.hasOwnProperty.call(cargo, 'y'), false);
  else assert.equal(cargo.y, yBefore);
  assert.equal(delete world.name, true);
  assert.equal(delete cargo.y, true);
});

test('a deleted credits field cannot be sealed by writable or configurable alone', () => {
  const { undone, present } = sceneWithFuture();
  const world = present.world;
  const defineProperty = Object.defineProperty;
  undone.history.future[0].toJSON = function () {
    delete world.credits;
    defineProperty(world, 'credits', { writable: false });
    delete world.credits;
    defineProperty(world, 'credits', { configurable: false });
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  assert.equal(back.ok, true, (back.issues || []).join('\n'));
  const redone = restoreHistory(back.history, 'redo');
  assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
  const creditDesc = Object.getOwnPropertyDescriptor(world, 'credits');
  assert.equal(creditDesc.value, 5000);
  assert.equal(creditDesc.writable, true);
  assert.equal(creditDesc.configurable, true);
  world.credits = 5000;
  assert.equal(world.credits, 5000);
  assert.equal(delete world.credits, true);
});

test('writable true and configurable false cannot stick on credits', () => {
  const { undone, present } = sceneWithFuture();
  const world = present.world;
  const defineProperty = Object.defineProperty;
  undone.history.future[0].toJSON = function () {
    delete world.credits;
    defineProperty(world, 'credits', { writable: true, configurable: false });
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  assert.equal(back.ok, true, (back.issues || []).join('\n'));
  const redone = restoreHistory(back.history, 'redo');
  assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
  assert.equal(redone.history.present, present);
  const creditDesc = Object.getOwnPropertyDescriptor(world, 'credits');
  assert.equal(creditDesc.value, 5000);
  assert.equal(creditDesc.writable, true);
  assert.equal(creditDesc.configurable, true);
  assert.equal(delete world.credits, true);
  assert.equal(Object.prototype.hasOwnProperty.call(world, 'credits'), false);
});

test('a new non-writable index cannot lengthen marks', () => {
  const { undone, present } = sceneWithFuture();
  present.grid.origin = { marks: ['keep'] };
  const defineProperty = Object.defineProperty;
  undone.history.future[0].toJSON = function () {
    defineProperty(present.grid.origin.marks, '1', { writable: false });
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  assert.equal(back.ok, true, (back.issues || []).join('\n'));
  const redone = restoreHistory(back.history, 'redo');
  assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
  assert.deepEqual(present.grid.origin.marks, ['keep']);
  assert.equal(present.grid.origin.marks.length, 1);
});

test('preventExtensions does not let a valueless x replace the authored position', async () => {
  const { undone, present } = sceneWithFuture();
  const cargo = objectById(present, 'cargo');
  const preventExtensions = Object.preventExtensions;
  const defineProperty = Object.defineProperty;
  assert.equal(cargo.x, 30);
  undone.history.future[0].toJSON = function () {
    delete cargo.x;
    preventExtensions(cargo);
    defineProperty(cargo, 'x', { writable: false });
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  assert.equal(back.ok, true, (back.issues || []).join('\n'));
  const redone = restoreHistory(back.history, 'redo');
  assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
  assert.equal(cargo.x, 30);
  assert.equal(Object.getOwnPropertyDescriptor(cargo, 'x').configurable, true);
  assert.equal(Object.isExtensible(cargo), true);
  const exported = await exportProject(present);
  assert.equal(exported.ok, true, (exported.issues || []).join('\n'));
  const entity = exported.scenario.entities.find((row) => row.alias === 'cargo');
  assert.equal(entity.pos.x, 30);
  assert.notEqual(entity.pos.x, 0);
});

test('Reflect.preventExtensions cannot drop credits', () => {
  const { undone, present } = sceneWithFuture();
  const world = present.world;
  undone.history.future[0].toJSON = function () {
    delete world.credits;
    Reflect.preventExtensions(world);
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  assert.equal(back.ok, true, (back.issues || []).join('\n'));
  const redone = restoreHistory(back.history, 'redo');
  assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
  assert.equal(redone.history.present, present);
  assert.equal(Object.isExtensible(world), true);
  const creditDesc = Object.getOwnPropertyDescriptor(world, 'credits');
  assert.equal(creditDesc.value, 5000);
  assert.equal(creditDesc.writable, true);
  world.credits = 5000;
  assert.equal(world.credits, 5000);
});

test('a closed-over preventExtensions cannot lock the world', () => {
  const { undone, present } = sceneWithFuture();
  const world = present.world;
  const prevent = Reflect.preventExtensions;
  undone.history.future[0].toJSON = function () {
    delete world.credits;
    prevent(world);
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  assert.equal(back.ok, true, (back.issues || []).join('\n'));
  assert.equal(Object.isExtensible(world), true);
  const creditDesc = Object.getOwnPropertyDescriptor(world, 'credits');
  assert.equal(creditDesc.value, 5000);
  assert.equal(creditDesc.writable, true);
  assert.equal(creditDesc.configurable, true);
  world.credits = 5000;
  assert.equal(world.credits, 5000);
});

test('prototype tags behind a get-only pocket stay keep', () => {
  for (const mode of ['push', 'splice', 'length', 'replace']) {
    const history = createHistory(getComposition('dock.intercept-cargo'));
    const first = getComposition('dock.intercept-cargo');
    first.title = 'First rename';
    const once = commit(history, first);
    const tags = ['keep'];
    const holder = Object.create({ tags });
    const parked = once.past[0];
    Object.defineProperty(parked.world, 'pocket', {
      enumerable: true,
      configurable: true,
      get() { return holder; },
    });
    const parkedGrid = parked.grid;
    Object.defineProperty(parked, 'grid', {
      enumerable: true,
      configurable: true,
      get() { return parkedGrid; },
    });
    parked.toJSON = function () {
      if (mode === 'push') tags.push(null);
      else if (mode === 'splice') tags.splice(0, 1, null);
      else if (mode === 'length') tags.length = 0;
      else holder.tags = ['poison'];
      if (mode !== 'replace') Object.freeze(tags);
      return this;
    };
    const next = getComposition('dock.intercept-cargo');
    next.title = 'Renamed dock';
    const committed = commit(once, next);
    assert.deepEqual(holder.tags, ['keep']);
    assert.equal(holder.tags, tags);
    assert.equal(Object.isFrozen(tags), false);
    assert.deepEqual(committed.past[0].world.pocket.tags, ['keep']);
    const back = restoreHistory(committed, 'undo');
    assert.equal(back.ok, true, (back.issues || []).join('\n'));
    const again = restoreHistory(back.history, 'undo');
    assert.equal(again.ok, true, (again.issues || []).join('\n'));
    assert.deepEqual(again.history.present.world.pocket.tags, ['keep']);
    assert.deepEqual(holder.tags, ['keep']);
  }
});

test('named properties of an array are shielded', () => {
  const { undone, present } = sceneWithFuture();
  const marks = ['keep'];
  const inner = ['keep'];
  const box = { 0: 'keep', length: 1 };
  marks.inner = inner;
  marks.box = box;
  present.grid.origin = { marks };
  const defineProperty = Reflect.defineProperty;
  undone.history.future[0].toJSON = function () {
    defineProperty(inner, '1', { writable: false });
    defineProperty(box, '1', { writable: false });
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  assert.equal(back.ok, true, (back.issues || []).join('\n'));
  const redone = restoreHistory(back.history, 'redo');
  assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
  assert.equal(marks.length, 1);
  assert.equal(marks[0], 'keep');
  assert.deepEqual([...inner], ['keep']);
  assert.equal(inner.length, 1);
  assert.equal(delete inner[1], true);
  inner.length = 1;
  assert.equal(inner.length, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(box, '1'), false);
  assert.equal(delete box[1], true);
});

test('pockets stored on array properties stay extensible', () => {
  const { undone, present } = sceneWithFuture();
  const ledger = { credits: 5000 };
  present.objects.ledger = ledger;
  const marks = ['keep'];
  const pocket = { x: 30 };
  marks.pocket = pocket;
  present.grid.origin = { marks };
  const marker = { x: 30 };
  Object.defineProperty(present.frames[0], 'marker', {
    configurable: true,
    enumerable: true,
    get() { return marker; },
  });
  const prevent = Reflect.preventExtensions;
  const defineProperty = Reflect.defineProperty;
  undone.history.future[0].toJSON = function () {
    delete ledger.credits;
    prevent(ledger);
    delete pocket.x;
    prevent(pocket);
    defineProperty(pocket, 'x', { writable: false });
    delete marker.x;
    prevent(marker);
    defineProperty(marker, 'x', { writable: false });
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  assert.equal(back.ok, true, (back.issues || []).join('\n'));
  const redone = restoreHistory(back.history, 'redo');
  assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
  assert.equal(ledger.credits, 5000);
  assert.equal(Object.isExtensible(ledger), true);
  assert.equal(pocket.x, 30);
  assert.equal(Object.isExtensible(pocket), true);
  assert.equal(marker.x, 30);
  assert.equal(Object.isExtensible(marker), true);
});

test('an objects index getter does not leave cargo sealed', async () => {
  const { undone, present } = sceneWithFuture();
  const cargo = present.objects[1];
  assert.equal(cargo.id, 'cargo');
  const xBefore = cargo.x;
  Object.defineProperty(present.objects, '1', {
    configurable: true,
    enumerable: true,
    get() { return cargo; },
  });
  const prevent = Reflect.preventExtensions;
  const defineProperty = Reflect.defineProperty;
  undone.history.future[0].toJSON = function () {
    delete cargo.x;
    prevent(cargo);
    defineProperty(cargo, 'x', { writable: false });
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  assert.equal(back.ok, true, (back.issues || []).join('\n'));
  assert.equal(cargo.x, xBefore);
  assert.equal(Object.isExtensible(cargo), true);
  const exported = await exportProject(present);
  assert.equal((exported.issues || []).some((issue) => String(issue).includes('plain object')), false);
  assert.equal(exported.ok, true, (exported.issues || []).join('\n'));
});

test('a symbol field on cargo survives undo', () => {
  const { undone, present } = sceneWithFuture();
  const cargo = objectById(present, 'cargo');
  const sym = Symbol('x');
  cargo[sym] = 30;
  assert.equal(cargo.x, 30);
  undone.history.future[0].toJSON = function () {
    delete cargo[sym];
    return this;
  };
  const back = restoreHistory(undone.history, 'undo');
  assert.equal(back.ok, true, (back.issues || []).join('\n'));
  const redone = restoreHistory(back.history, 'redo');
  assert.equal(redone.ok, true, (redone.issues || []).join('\n'));
  assert.equal(cargo[sym], 30);
  assert.equal(cargo.x, 30);
});

test('Hawser and Quiet Ghost use their collision radii', async () => {
  const dialect = await loadDialect();
  const view = { width: 200, height: 200 };
  const camera = { x: 0, z: 0, zoom: 1 };
  const hawser = { id: 'hawser', kind: 'actor', profile: 'ship_hawser', x: 0, z: 0 };
  const ghost = { id: 'ghost', kind: 'actor', profile: 'quiet_ghost', x: 0, z: 0 };
  assert.equal(dialect.draw.ship_hawser.radius, 22);
  assert.equal(dialect.draw.quiet_ghost.radius, 13);
  assert.equal(actorStroke(hawser, 1, dialect.draw), 22);
  assert.equal(actorStroke(ghost, 1, dialect.draw), 13);
  assert.notEqual(actorStroke(hawser, 1, dialect.draw), 8);
  assert.notEqual(actorStroke(ghost, 1, dialect.draw), 8);
  const arcs = [];
  const ctx = {
    save() {},
    restore() {},
    beginPath() {},
    arc(_x, _y, radius) { arcs.push(radius); },
    stroke() {},
    fill() {},
    fillText() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
  };
  drawActor(ctx, hawser, camera, view, dialect.draw);
  drawActor(ctx, ghost, camera, view, dialect.draw);
  assert.equal(arcs[0], 22);
  assert.equal(arcs[1], 13);
  assert.equal(hitTest({ objects: [hawser] }, 108, 100, camera, view, dialect.draw), 'hawser');
  assert.equal(hitTest({ objects: [hawser] }, 122, 100, camera, view, dialect.draw), 'hawser');
  assert.equal(hitTest({ objects: [ghost] }, 108, 100, camera, view, dialect.draw), 'ghost');
  assert.equal(hitTest({ objects: [ghost] }, 113, 100, camera, view, dialect.draw), 'ghost');
  assert.equal(dialect.profiles.includes('enemy.quiet_ghost'), true);
  const prefixed = { id: 'ghost', kind: 'actor', profile: 'enemy.quiet_ghost', x: 0, z: 0 };
  assert.equal(dialect.draw['enemy.quiet_ghost'].radius, 13);
  assert.equal(dialect.draw['enemy.quiet_ghost'].radius, dialect.draw.quiet_ghost.radius);
  assert.equal(actorStroke(prefixed, 1, dialect.draw), 13);
  assert.notEqual(actorStroke(prefixed, 1, dialect.draw), 8);
  for (const profileId of dialect.profiles) {
    if (!profileId.startsWith('enemy.')) continue;
    const bare = profileId.slice('enemy.'.length);
    const bareDraw = dialect.draw[bare];
    if (!bareDraw || !Number.isFinite(bareDraw.radius)) continue;
    assert.equal(dialect.draw[profileId].radius, bareDraw.radius, profileId);
  }
  arcs.length = 0;
  drawActor(ctx, prefixed, camera, view, dialect.draw);
  assert.equal(arcs[0], 13);
  assert.equal(hitTest({ objects: [prefixed] }, 113, 100, camera, view, dialect.draw), 'ghost');
  assert.equal(hitTest({ objects: [prefixed] }, 100, 114, camera, view, dialect.draw), null);
  const trader = { id: 'trader', kind: 'actor', profile: 'enemy.mule_trader', x: 0, z: 0 };
  assert.equal(dialect.draw['enemy.mule_trader'].radius, 18);
  assert.equal(actorStroke(trader, 1, dialect.draw), 18);
  assert.notEqual(actorStroke(trader, 1, dialect.draw), 8);
  arcs.length = 0;
  drawActor(ctx, trader, camera, view, dialect.draw);
  assert.equal(arcs[0], 18);
  assert.equal(hitTest({ objects: [trader] }, 118, 100, camera, view, dialect.draw), 'trader');
  assert.equal(hitTest({ objects: [trader] }, 100, 119, camera, view, dialect.draw), null);
  const moth = { id: 'moth', kind: 'actor', profile: 'mothlight', x: 0, z: 0 };
  assert.equal(dialect.draw.mothlight.radius, 21);
  assert.notEqual(dialect.draw.mothlight.radius, 16);
  assert.equal(dialect.draw['enemy.mothlight'].radius, 21);
  assert.equal(actorStroke(moth, 1, dialect.draw), 21);
  arcs.length = 0;
  drawActor(ctx, moth, camera, view, dialect.draw);
  assert.equal(arcs[0], 21);
  assert.equal(hitTest({ objects: [moth] }, 121, 100, camera, view, dialect.draw), 'moth');
  assert.equal(hitTest({ objects: [moth] }, 100, 122, camera, view, dialect.draw), null);
  const prefixedMoth = { id: 'moth', kind: 'actor', profile: 'enemy.mothlight', x: 0, z: 0 };
  assert.equal(actorStroke(prefixedMoth, 1, dialect.draw), 21);
  assert.notEqual(actorStroke(prefixedMoth, 1, dialect.draw), 16);
  arcs.length = 0;
  drawActor(ctx, prefixedMoth, camera, view, dialect.draw);
  assert.equal(arcs[0], 21);
  assert.equal(hitTest({ objects: [prefixedMoth] }, 121, 100, camera, view, dialect.draw), 'moth');
  assert.equal(hitTest({ objects: [prefixedMoth] }, 100, 122, camera, view, dialect.draw), null);
});

test('asteroid.spec profiles use the spawned radius', () => {
  const view = { width: 200, height: 200 };
  const camera = { x: 0, z: 0, zoom: 1 };
  const arcs = [];
  const ctx = {
    save() {},
    restore() {},
    beginPath() {},
    arc(_x, _y, radius) { arcs.push(radius); },
    stroke() {},
    fill() {},
    fillText() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
  };
  const nine = { id: 'rock', kind: 'actor', profile: 'asteroid.spec:9:100', x: 0, z: 0 };
  assert.equal(actorStroke(nine, 1), 9);
  assert.notEqual(actorStroke(nine, 1), 8);
  drawActor(ctx, nine, camera, view, {});
  assert.equal(arcs[0], 9);
  assert.equal(hitTest({ objects: [nine] }, 109, 100, camera, view), 'rock');
  assert.equal(hitTest({ objects: [nine] }, 100, 110, camera, view), null);
  const wide = { id: 'rock', kind: 'actor', profile: 'asteroid.spec:100:1', x: 0, z: 0 };
  assert.equal(actorStroke(wide, 1), 100);
  assert.notEqual(actorStroke(wide, 1), 8);
  arcs.length = 0;
  drawActor(ctx, wide, camera, view, {});
  assert.equal(arcs[0], 100);
  assert.equal(hitTest({ objects: [wide] }, 200, 100, camera, view), 'rock');
  assert.equal(hitTest({ objects: [wide] }, 100, 201, camera, view), null);
  const none = { id: 'rock', kind: 'actor', profile: 'asteroid.spec:0:10', x: 0, z: 0 };
  assert.equal(actorStroke(none, 1), 0);
  assert.notEqual(actorStroke(none, 1), 8);
  arcs.length = 0;
  drawActor(ctx, none, camera, view, {});
  assert.equal(arcs[0], 0);
  assert.equal(hitTest({ objects: [none] }, 100, 108, camera, view), null);
  const other = { id: 'rock', kind: 'actor', profile: 'asteroid.spec:12:40', x: 0, z: 0 };
  assert.equal(actorStroke(other, 1), 12);
  assert.equal(hitTest({ objects: [other] }, 112, 100, camera, view), 'rock');
  assert.equal(hitTest({ objects: [other] }, 100, 113, camera, view), null);
});

test('painted dashes hit the stroke band and skip the undrawn disc', () => {
  const stage = { width: 800, height: 600 };
  const stageCam = { x: 0, z: 0, zoom: 3.2 };
  const profileDraw = { 'ship.starter': { radius: 14 } };
  const bank = getComposition('dock.bank-shot');
  const alive = objectById(bank, 'alive_bank');
  const alivePoint = worldToScreen(alive.x + alive.radius, alive.z, stageCam, stage);
  const zoneOnly = { objects: [objectById(bank, 'bank_zone')] };
  const alongOnly = { objects: [objectById(bank, 'along_x')] };
  const aliveOnly = { objects: [objectById(bank, 'alive_bank')] };

  assert.equal(hitTest(zoneOnly, 618, 204, stageCam, stage, profileDraw), 'bank_zone');
  assert.equal(hitTest(alongOnly, 618, 204, stageCam, stage, profileDraw), 'along_x');
  assert.equal(hitTest(aliveOnly, 618, 204, stageCam, stage, profileDraw), null);
  assert.equal(hitTest(bank, 618, 204, stageCam, stage, profileDraw), 'along_x');
  assert.notEqual(hitTest(bank, 618, 204, stageCam, stage, profileDraw), 'alive_bank');

  assert.equal(hitTest(aliveOnly, 634.4416, 263.9296, stageCam, stage, profileDraw), 'alive_bank');
  assert.equal(hitTest(alongOnly, 634.4416, 263.9296, stageCam, stage, profileDraw), null);
  assert.equal(hitTest(bank, 634.4416, 263.9296, stageCam, stage, profileDraw), 'alive_bank');

  assert.equal(hitTest(zoneOnly, 582.677, 139.443, stageCam, stage, profileDraw), null);
  assert.equal(hitTest(bank, 582.677, 139.443, stageCam, stage, profileDraw), null);
  assert.notEqual(hitTest(bank, 582.677, 139.443, stageCam, stage, profileDraw), 'bank_zone');

  assert.equal(hitTest(zoneOnly, 617.6, 204, stageCam, stage, profileDraw), 'bank_zone');
  assert.equal(hitTest(alongOnly, 617.6, 204, stageCam, stage, profileDraw), 'along_x');
  assert.equal(hitTest(aliveOnly, 617.6, 204, stageCam, stage, profileDraw), null);
  assert.equal(hitTest(bank, 617.6, 204, stageCam, stage, profileDraw), 'along_x');
  assert.equal(hitTest(bank, 617.5999, 204.1281, stageCam, stage, profileDraw), 'along_x');
  assert.equal(hitTest(bank, 637.6, 204, stageCam, stage, profileDraw), null);
  assert.equal(hitTest(bank, alivePoint.sx, alivePoint.sy, stageCam, stage, profileDraw), 'alive_bank');
  assert.equal(hitTest(bank, 586.167, 135.323, stageCam, stage, profileDraw), null);
  assert.notEqual(hitTest(bank, 586.167, 135.323, stageCam, stage, profileDraw), 'bank_zone');
  assert.equal(hitTest(bank, 438.5, 213.5, stageCam, stage, profileDraw), null);
  assert.notEqual(hitTest(bank, 438.5, 213.5, stageCam, stage, profileDraw), 'bank_zone');
  assert.equal(hitTest(bank, 554.2, 289.68, stageCam, stage, profileDraw), 'bank_zone');

  const view = { width: 200, height: 200 };
  const unitZoom = { x: 0, z: 0, zoom: 1 };
  const place = { id: 'bank_zone', kind: 'field', fieldKind: 'place', x: 0, z: 0, radius: 80 };
  assert.equal(hitTest({ objects: [place] }, 110, 100, unitZoom, view), null);
  assert.equal(hitTest({ objects: [place] }, 127.6, 100, unitZoom, view), 'bank_zone');
  assert.equal(hitTest({ objects: [place] }, 128.4, 100, unitZoom, view), 'bank_zone');
  assert.equal(hitTest({ objects: [place] }, 129, 100, unitZoom, view), null);
  const trigger = { id: 't', kind: 'trigger', x: 0, z: 0, radius: 100 };
  assert.equal(hitTest({ objects: [trigger] }, 200.4, 100, unitZoom, view), 't');
  assert.equal(hitTest({ objects: [trigger] }, 200.5, 100, unitZoom, view), 't');
  assert.equal(hitTest({ objects: [trigger] }, 200.6, 100, unitZoom, view), null);
  assert.equal(hitTest({ objects: [trigger] }, 199.8200539935204, 105.99640064794446, unitZoom, view), null);
  const early = { id: 'early', kind: 'trigger', x: 0, z: 0, radius: 100 };
  const late = { id: 'late', kind: 'trigger', x: 0.17994600647958237, z: 5.996400647944455, radius: 100 };
  assert.equal(hitTest({ objects: [early, late] }, 200, 100, unitZoom, view), 'early');
  const objective = { id: 'mark', kind: 'objective', x: 0, z: 0 };
  const ring = { id: 'ring', kind: 'trigger', x: 0, z: 0, radius: 4 };
  assert.equal(hitTest({ objects: [objective, ring] }, 104, 100, unitZoom, view), 'ring');
  assert.equal(hitTest({ objects: [objective] }, 104, 100, unitZoom, view), null);
  const wideRing = { id: 'ring', kind: 'trigger', x: 0, z: 0, radius: 8 };
  assert.equal(hitTest({ objects: [wideRing, objective] }, 108, 100, unitZoom, view), 'mark');
  assert.equal(hitTest({ objects: [wideRing, objective] }, 108.4, 100, unitZoom, view), 'mark');

  assert.equal(hitTest(bank, 456.32, 257.76, stageCam, stage, profileDraw), 'to_stone');
  assert.notEqual(hitTest(bank, 456.32, 257.76, stageCam, stage, profileDraw), 'bank_zone');
  assert.equal(hitTest(bank, 465.5, 244.5, stageCam, stage, profileDraw), 'player');
  assert.equal(hitTest(bank, 466.5, 244.5, stageCam, stage, profileDraw), 'player');
  assert.equal(hitTest(bank, 470.5, 244.5, stageCam, stage, profileDraw), 'player');
  assert.equal(hitTest(bank, 463.5, 244.5, stageCam, stage, profileDraw), 'player');
  assert.equal(hitTest(bank, 537.5, 162.5, stageCam, stage, profileDraw), 'stone');
  assert.equal(hitTest(bank, 403.5, 357.5, stageCam, stage, profileDraw), 'along_x');
  assert.equal(hitTest(bank, 228.5, 258.5, stageCam, stage, profileDraw), 'alive_bank');
  assert.equal(hitTest(bank, 226.5, 266.5, stageCam, stage, profileDraw), 'alive_bank');
  assert.equal(hitTest(bank, 276.5, 266.5, stageCam, stage, profileDraw), 'alive_bank');
  assert.equal(hitTest(bank, 228.5, 257.5, stageCam, stage, profileDraw), null);
  assert.equal(hitTest(bank, 232.5, 255.5, stageCam, stage, profileDraw), null);
  assert.equal(hitTest(bank, 266.5, 255.5, stageCam, stage, profileDraw), null);
  assert.equal(hitTest(zoneOnly, 522.5, 114.5, stageCam, stage, profileDraw), 'bank_zone');
  assert.equal(hitTest(bank, 522.5, 114.5, stageCam, stage, profileDraw), 'bank_zone');
  const placeWord = { id: 'bank_zone', kind: 'field', fieldKind: 'place', x: 0, z: 0, radius: 80 };
  assert.equal(hitTest({ objects: [placeWord] }, 83.5, 92.5, unitZoom, view), 'bank_zone');
  assert.equal(hitTest({ objects: [placeWord] }, 90.5, 85.5, unitZoom, view), null);
  const loneMark = { id: 'mark', kind: 'objective', x: 0, z: 0 };
  assert.equal(hitTest({ objects: [loneMark] }, 393.5, 298.5, stageCam, stage), 'mark');
  assert.equal(hitTest({ objects: [loneMark] }, 407.5, 300.5, stageCam, stage), 'mark');
  assert.equal(hitTest({ objects: [loneMark] }, 405.5, 297.5, stageCam, stage), 'mark');
  assert.equal(hitTest({ objects: [loneMark] }, 400.5, 292.5, stageCam, stage), 'mark');
  assert.equal(hitTest({ objects: [loneMark] }, 400, 294, stageCam, stage), null);
  assert.equal(hitTest({ objects: [loneMark] }, 400, 300, stageCam, stage), null);
  assert.equal(hitTest(bank, 468.5, 245.5, stageCam, stage, profileDraw), null);
  assert.equal(hitTest(bank, 465.5, 237.5, stageCam, stage, profileDraw), null);
  const labelEnds = [
    { id: 'player', kind: 'trigger', x: 0, z: 0, radius: 0 },
    { id: 'stone', kind: 'trigger', x: 40, z: 30, radius: 0 },
    { id: 'to_stone', kind: 'route', from: 'player', to: 'stone', label: 'bank line' },
  ];
  assert.equal(hitTest({ objects: labelEnds }, 465.5, 244.5, stageCam, stage), 'to_stone');
  assert.equal(hitTest({ objects: labelEnds }, 466.5, 244.5, stageCam, stage), null);
  assert.equal(hitTest(bank, 431.5, 239.5, stageCam, stage, profileDraw), 'player');
  const cargo = getComposition('dock.intercept-cargo');
  assert.equal(hitTest(cargo, 488.5, 215.5, stageCam, stage, profileDraw), 'to_cargo');
  assert.equal(hitTest(cargo, 460.5, 212.5, stageCam, stage, profileDraw), null);
  const unitView = { width: 200, height: 200 };
  assert.equal(hitTest(cargo, 155.5, 70.5, unitZoom, unitView, profileDraw), 'to_cargo');
  assert.equal(hitTest(cargo, 151.5, 75.5, unitZoom, unitView, profileDraw), 'to_cargo');
  assert.equal(hitTest(cargo, 152.5, 75.5, unitZoom, unitView, profileDraw), 'to_cargo');
  assert.equal(hitTest(cargo, 140.5, 75.5, unitZoom, unitView, profileDraw), null);
  assert.equal(hitTest(cargo, 136.5, 80.5, unitZoom, unitView, profileDraw), null);
  assert.equal(hitTest(cargo, 125.5, 67.5, unitZoom, unitView, profileDraw), null);
  assert.equal(hitTest(cargo, 110.5, 72.5, unitZoom, unitView, profileDraw), 'player');
  assert.equal(hitTest(bank, 438.4, 271.2, stageCam, stage, profileDraw), null);
  assert.equal(hitTest(bank, 554, 204, stageCam, stage, profileDraw), 'stone');
  assert.equal(hitTest(bank, 543, 204, stageCam, stage, profileDraw), 'stone');
  assert.equal(hitTest(bank, 555, 204, stageCam, stage, profileDraw), 'stone');
  assert.equal(hitTest(bank, 450, 300, stageCam, stage, profileDraw), 'player');
  const strokedActor = { id: 'stone', kind: 'actor', x: 0, z: 0, overrides: { radius: 8 } };
  assert.equal(hitTest({ objects: [strokedActor] }, 104, 100, unitZoom, view), 'stone');
  assert.equal(hitTest({ objects: [strokedActor] }, 108.4, 100, unitZoom, view), 'stone');
  assert.equal(hitTest({ objects: [strokedActor] }, 100, 108.6, unitZoom, view), null);
  const noseStone = { id: 'stone', kind: 'actor', x: 0, z: 0, overrides: { radius: 8 }, heading: 0 };
  const noseFar = { id: 'far', kind: 'actor', x: 40, z: 0, overrides: { radius: 8 }, heading: 0 };
  const noseRoute = { id: 'to_stone', kind: 'route', from: 'stone', to: 'far' };
  assert.equal(hitTest({ objects: [noseStone, noseFar, noseRoute] }, 112, 100, unitZoom, view), 'stone');
  assert.notEqual(hitTest({ objects: [noseStone, noseFar, noseRoute] }, 112, 100, unitZoom, view), 'to_stone');
  const headingP = { id: 'p', kind: 'actor', x: 0, z: 0, heading: 0, overrides: { radius: 8 } };
  const headingQ = { id: 'q', kind: 'actor', x: 80, z: 0, overrides: { radius: 8 } };
  const headingRoute = { id: 'r', kind: 'route', from: 'p', to: 'q' };
  assert.equal(hitTest({ objects: [headingP, headingQ, headingRoute] }, 120, 100, unitZoom, view), 'p');
  assert.notEqual(hitTest({ objects: [headingP, headingQ, headingRoute] }, 120, 100, unitZoom, view), 'r');
  const steered = { id: 'ship', kind: 'actor', x: 0, z: 0, overrides: { radius: 8 }, heading: Math.PI / 2, velX: 10 };
  assert.equal(hitTest({ objects: [steered] }, 115, 100, unitZoom, view), 'ship');
  assert.equal(hitTest({ objects: [steered] }, 150, 150, unitZoom, view), null);
  const bareA = { id: 'a', kind: 'trigger', x: 0, z: 0, radius: 0 };
  const bareB = { id: 'b', kind: 'trigger', x: 10, z: 0, radius: 0 };
  const bareRoute = { id: 'r', kind: 'route', from: 'a', to: 'b' };
  assert.equal(hitTest({ objects: [bareA, bareB, bareRoute] }, 110, 100.4, unitZoom, view), null);
  const stackedA = { id: 'a', kind: 'trigger', x: 0, z: 0, radius: 0 };
  const stackedB = { id: 'b', kind: 'trigger', x: 0, z: 0, radius: 0 };
  assert.equal(hitTest({ objects: [stackedA, stackedB, { id: 'r', kind: 'route', from: 'a', to: 'b' }] }, 100.4, 100, unitZoom, view), null);
  const specA = { id: 'a', kind: 'actor', profile: 'asteroid.spec:0:10', x: 0, z: 0 };
  const specB = { id: 'b', kind: 'actor', profile: 'asteroid.spec:0:10', x: 10, z: 0 };
  assert.notEqual(hitTest({ objects: [specA, specB, { id: 'r', kind: 'route', from: 'a', to: 'b' }] }, 110, 100.4, unitZoom, view), 'r');
  assert.equal(hitTest({ objects: [specA, specB, { id: 'r', kind: 'route', from: 'a', to: 'b' }] }, 110, 100.4, unitZoom, view), 'b');
  assert.equal(hitTest({ objects: [specA, { ...specB, x: 0 }, { id: 'r', kind: 'route', from: 'a', to: 'b' }] }, 100.4, 100, unitZoom, view), 'b');

  const placeInk = { id: 'place', kind: 'field', fieldKind: 'place', x: 0, z: 0, radius: 80 };
  const blankRing = { id: 'ring', kind: 'trigger', x: 26.49591388448094, z: -39.97171155901512, radius: 40 };
  assert.equal(hitTest({ objects: [blankRing] }, 128, 100, unitZoom, view), null);
  assert.equal(hitTest({ objects: [placeInk, blankRing] }, 128, 100, unitZoom, view), 'place');
});

test('empty dash pixels stay empty and painted dash pixels select', async () => {
  const stage = { width: 800, height: 600 };
  const stageCam = { x: 0, z: 0, zoom: 3.2 };
  const profileDraw = { 'ship.starter': { radius: 14 } };
  const bank = getComposition('dock.bank-shot');
  const misses = [[529.5, 235.5], [500.5, 466.5], [699.5, 504.5]];
  for (const [sx, sy] of misses) {
    assert.equal(hitTest(bank, sx, sy, stageCam, stage, profileDraw), null);
  }
  assert.equal(hitTest(bank, 528.5, 235.5, stageCam, stage, profileDraw), 'along_x');
  assert.equal(hitTest(bank, 624.5, 203.5, stageCam, stage, profileDraw), 'along_x');
  assert.equal(hitTest(bank, 527.5, 235.5, stageCam, stage, profileDraw), 'along_x');
  assert.equal(hitTest(bank, 633.5, 266.5, stageCam, stage, profileDraw), 'alive_bank');
  assert.equal(hitTest(bank, 588.5, 137.5, stageCam, stage, profileDraw), 'bank_zone');
  assert.equal(hitTest(bank, 499.5, 118.5, stageCam, stage, profileDraw), 'bank_zone');
  assert.equal(hitTest(bank, 615.5, 187.5, stageCam, stage, profileDraw), 'bank_zone');
  assert.equal(hitTest(bank, 615.5, 220.5, stageCam, stage, profileDraw), 'bank_zone');
  assert.equal(hitTest(bank, 499.5, 289.5, stageCam, stage, profileDraw), 'bank_zone');
  assert.equal(hitTest(bank, 344.5, 180.5, stageCam, stage, profileDraw), 'alive_bank');
  assert.equal(hitTest(bank, 344.5, 181.5, stageCam, stage, profileDraw), 'alive_bank');
  assert.equal(hitTest(bank, 440.5, 220.5, stageCam, stage, profileDraw), 'bank_zone');
  assert.equal(hitTest(bank, 616.5, 194.5, stageCam, stage, profileDraw), 'bank_zone');
  assert.equal(hitTest(bank, 633.5, 264.5, stageCam, stage, profileDraw), 'alive_bank');
  assert.equal(hitTest(bank, 782.5, 346.5, stageCam, stage, profileDraw), 'along_x');
  assert.equal(hitTest(bank, 266.5, 257.5, stageCam, stage, profileDraw), 'alive_bank');

  const view = { width: 200, height: 200 };
  const camera = { x: 0, z: 0, zoom: 1 };
  const placeFringe = { id: 'bank_zone', kind: 'field', fieldKind: 'place', x: 0, z: 0, radius: 80 };
  assert.equal(hitTest({ objects: [placeFringe] }, 128.5, 101.5, camera, view), 'bank_zone');
  assert.equal(hitTest({ objects: [placeFringe] }, 76.5, 115.5, camera, view), null);
  assert.equal(hitTest({ objects: [placeFringe] }, 76.5, 114.5, camera, view), 'bank_zone');
  assert.equal(hitTest({ objects: [placeFringe] }, 118.5, 78.5, camera, view), 'bank_zone');
  assert.equal(hitTest({ objects: [placeFringe] }, 118.5, 120.5, camera, view), 'bank_zone');
  assert.equal(hitTest({ objects: [placeFringe] }, 117.5, 121.5, camera, view), 'bank_zone');
  assert.equal(hitTest(bank, 477.5, 277.5, stageCam, stage, profileDraw), 'bank_zone');
  assert.equal(hitTest(bank, 478.5, 278.5, stageCam, stage, profileDraw), 'bank_zone');
  assert.equal(hitTest(bank, 588.5, 270.5, stageCam, stage, profileDraw), 'bank_zone');
  assert.equal(hitTest(bank, 589.5, 269.5, stageCam, stage, profileDraw), 'bank_zone');
  assert.equal(hitTest(bank, 605.5, 249.5, stageCam, stage, profileDraw), 'bank_zone');
  assert.equal(hitTest(bank, 604.5, 250.5, stageCam, stage, profileDraw), 'bank_zone');
  assert.equal(hitTest(bank, 506.5, 117.5, stageCam, stage, profileDraw), 'bank_zone');
  assert.equal(hitTest(bank, 507.5, 116.5, stageCam, stage, profileDraw), 'bank_zone');
  assert.equal(hitTest(bank, 506.5, 290.5, stageCam, stage, profileDraw), 'bank_zone');
  assert.equal(hitTest(bank, 507.5, 291.5, stageCam, stage, profileDraw), 'bank_zone');
  assert.equal(hitTest(bank, 438.5, 210.5, stageCam, stage, profileDraw), 'bank_zone');
  assert.equal(hitTest(bank, 438.5, 211.5, stageCam, stage, profileDraw), 'bank_zone');
  assert.equal(hitTest(bank, 456.5, 150.5, stageCam, stage, profileDraw), 'bank_zone');
  assert.equal(hitTest(bank, 455.5, 151.5, stageCam, stage, profileDraw), 'bank_zone');
  assert.equal(hitTest(bank, 364.5, 155.5, stageCam, stage, profileDraw), 'alive_bank');
  assert.equal(hitTest(bank, 363.5, 156.5, stageCam, stage, profileDraw), 'alive_bank');
  assert.equal(hitTest(bank, 581.5, 381.5, stageCam, stage, profileDraw), 'alive_bank');
  assert.equal(hitTest(bank, 594.5, 160.5, stageCam, stage, profileDraw), 'alive_bank');
  assert.equal(hitTest(bank, 360.5, 158.5, stageCam, stage, profileDraw), 'alive_bank');
  assert.equal(hitTest(bank, 546.5, 503.5, stageCam, stage, profileDraw), 'along_x');
  assert.equal(hitTest(bank, 547.5, 504.5, stageCam, stage, profileDraw), 'along_x');
  assert.equal(hitTest(bank, 726.5, 487.5, stageCam, stage, profileDraw), 'along_x');
  assert.equal(hitTest(bank, 479.5, 296.5, stageCam, stage, profileDraw), 'along_x');
  assert.equal(hitTest(bank, 541.5, 407.5, stageCam, stage, profileDraw), 'alive_bank');
  assert.equal(hitTest(bank, 542.5, 406.5, stageCam, stage, profileDraw), 'alive_bank');
  assert.equal(hitTest(bank, 626.5, 203.5, stageCam, stage, profileDraw), 'along_x');
  assert.equal(hitTest(bank, 626.5, 204.5, stageCam, stage, profileDraw), 'along_x');
  assert.equal(hitTest(bank, 350.5, 170.5, stageCam, stage, profileDraw), 'alive_bank');
  assert.equal(hitTest(bank, 351.5, 170.5, stageCam, stage, profileDraw), 'alive_bank');
  assert.equal(hitTest(bank, 431.5, 113.5, stageCam, stage, profileDraw), 'alive_bank');
  assert.equal(hitTest(bank, 529.5, 115.5, stageCam, stage, profileDraw), 'alive_bank');
  assert.equal(hitTest(bank, 592.5, 369.5, stageCam, stage, profileDraw), 'alive_bank');
  assert.equal(hitTest(bank, 569.5, 391.5, stageCam, stage, profileDraw), 'alive_bank');
  assert.equal(hitTest(bank, 532.5, 233.5, stageCam, stage, profileDraw), 'along_x');
  assert.equal(hitTest(bank, 507.5, 253.5, stageCam, stage, profileDraw), 'along_x');
  assert.equal(hitTest(bank, 760.5, 279.5, stageCam, stage, profileDraw), 'along_x');
  assert.equal(hitTest(bank, 587.5, 520.5, stageCam, stage, profileDraw), 'along_x');
  assert.equal(hitTest(bank, 709.5, 229.5, stageCam, stage, profileDraw), 'along_x');
  assert.equal(hitTest(bank, 536.5, 498.5, stageCam, stage, profileDraw), 'along_x');
  assert.equal(hitTest(bank, 609.5, 242.5, stageCam, stage, profileDraw), 'bank_zone');
  assert.equal(hitTest(bank, 348.5, 354.5, stageCam, stage, profileDraw), 'alive_bank');
  assert.equal(hitTest(bank, 604.5, 173.5, stageCam, stage, profileDraw), 'alive_bank');
  assert.equal(hitTest(bank, 455.5, 418.5, stageCam, stage, profileDraw), 'alive_bank');
  assert.equal(hitTest(bank, 482.5, 106.5, stageCam, stage, profileDraw), 'alive_bank');
  assert.equal(hitTest(bank, 631.5, 295.5, stageCam, stage, profileDraw), 'alive_bank');
  assert.equal(hitTest(bank, 779.5, 323.5, stageCam, stage, profileDraw), 'along_x');
  assert.equal(hitTest(bank, 741.5, 473.5, stageCam, stage, profileDraw), 'along_x');
  assert.equal(hitTest(bank, 467.5, 394.5, stageCam, stage, profileDraw), 'along_x');
  assert.equal(hitTest(bank, 467.5, 334.5, stageCam, stage, profileDraw), 'along_x');
  assert.equal(hitTest(bank, 438.5, 205.5, stageCam, stage, profileDraw), null);
  assert.equal(hitTest(bank, 480.5, 293.5, stageCam, stage, profileDraw), null);
  assert.equal(hitTest(bank, 553.5, 118.5, stageCam, stage, profileDraw), null);
  assert.equal(hitTest(bank, 553.75, 118.25, stageCam, stage, profileDraw), null);
  assert.equal(hitTest(bank, 553.9375, 118.5, stageCam, stage, profileDraw), null);
  assert.equal(hitTest(bank, 553.875, 118.75, stageCam, stage, profileDraw), null);
  assert.equal(hitTest(bank, 553.001, 118.001, stageCam, stage, profileDraw), null);
  assert.equal(hitTest(bank, 553.999, 118.001, stageCam, stage, profileDraw), null);
  assert.equal(hitTest(bank, 553.001, 118.999, stageCam, stage, profileDraw), null);
  assert.equal(hitTest(bank, 553.999, 118.999, stageCam, stage, profileDraw), null);
  assert.equal(hitTest(bank, 554.5, 118.5, stageCam, stage, profileDraw), 'bank_zone');
  assert.equal(hitTest(bank, 565.5, 133.5, stageCam, stage, profileDraw), 'alive_bank');
  const emptyRing = { objects: [{ id: 'ring', kind: 'trigger', x: 0, z: 0, radius: 20 }] };
  assert.equal(hitTest(emptyRing, 352.5, 257.5, stageCam, stage), null);
  assert.equal(hitTest(emptyRing, 343.5, 270.5, stageCam, stage), null);
  assert.equal(hitTest(emptyRing, 455.5, 267.5, stageCam, stage), null);
  assert.equal(hitTest(emptyRing, 452.5, 337.5, stageCam, stage), 'ring');
  assert.equal(hitTest(emptyRing, 451.5, 337.5, stageCam, stage), 'ring');
  assert.equal(hitTest(emptyRing, 350.5, 341.5, stageCam, stage), 'ring');
  assert.equal(hitTest(emptyRing, 447.5, 343.5, stageCam, stage), 'ring');
  assert.equal(hitTest(emptyRing, 446.5, 343.5, stageCam, stage), 'ring');
  assert.equal(hitTest(emptyRing, 446.5, 344.5, stageCam, stage), 'ring');
  assert.equal(hitTest(emptyRing, 448.5, 343.5, stageCam, stage), null);
  assert.equal(hitTest(bank, 684.5, 215.5, stageCam, stage, profileDraw), 'along_x');
  assert.equal(hitTest(bank, 685.5, 215.5, stageCam, stage, profileDraw), 'along_x');
  assert.equal(hitTest(bank, 684.5, 216.5, stageCam, stage, profileDraw), 'along_x');
  const dialect = await loadDialect();
  const moth = { id: 'moth', kind: 'actor', profile: 'enemy.mothlight', x: 0, z: 0 };
  assert.equal(hitTest({ objects: [moth] }, 99.5, 78.5, camera, view, dialect.draw), 'moth');
  assert.equal(hitTest({ objects: [moth] }, 100.5, 121.5, camera, view, dialect.draw), 'moth');
  assert.equal(hitTest({ objects: [moth] }, 121, 100, camera, view, dialect.draw), 'moth');
  assert.equal(hitTest({ objects: [moth] }, 100, 122, camera, view, dialect.draw), null);

  const mark = { id: 'mark', kind: 'objective', x: 0, z: 0 };
  assert.equal(hitTest({ objects: [mark] }, 401.5, 306.5, stageCam, stage), 'mark');
  assert.equal(hitTest({ objects: [mark] }, 399.5, 292.5, stageCam, stage), 'mark');
});
