import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { applyDockOp, applyRequest } from '../lib/agent.mjs';
import { compositionIds, getComposition } from '../lib/compositions.mjs';
import { commit, createHistory, loadExampleHistory, newDockHistory, openDockHistory, restoreHistory } from '../lib/history.mjs';
import { resolveDockRead, resolveWorkspace } from '../lib/paths.mjs';
import { inspectValue } from '../lib/security.mjs';
import {
  addObject,
  clearPlayerFlag,
  cloneObject,
  deleteObjects,
  expandIds,
  groupObjects,
  nudgeObjects,
  emptyProject,
  objectById,
  placePlayer,
  projectIssues,
  replaceObject,
  REQUEST_SCHEMA,
  formatReport,
  saveRequestBody,
  savedProjectText,
  setCamera,
  setPlayer,
  setVelocity,
  sortedClone,
  ungroupObjects,
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
