import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { applyRequest } from '../lib/agent.mjs';
import { compositionIds, getComposition } from '../lib/compositions.mjs';
import { commit, createHistory, newDockHistory, restoreHistory, undo } from '../lib/history.mjs';
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
  setPlayer,
  setVelocity,
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
  history = undo(history);
  assert.equal(objectById(history.present, 'cargo').x, startX);

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
  const player = { op: 'addObject', object: secondPlayer('player') };
  const created = applyRequest({ schema: REQUEST_SCHEMA, ops: [draft] });
  assert.equal(created.ok, false);
  assert.equal(created.issues.some((issue) => issue.includes('exactly one player') && issue.includes('found 0')), true);

  const undone = applyRequest({ schema: REQUEST_SCHEMA, ops: [draft, player, { op: 'undo' }] });
  assert.equal(undone.ok, false);
  assert.equal(undone.issues.some((issue) => issue.includes('exactly one player') && issue.includes('found 0')), true);
  assert.equal(playerIds(undone.project).length, 1);

  const removed = applyRequest({ schema: REQUEST_SCHEMA, ops: [draft, player, { op: 'delete', ids: ['player'] }] });
  assert.equal(removed.ok, false);
  assert.equal(removed.issues.some((issue) => issue.includes('exactly one player')), true);
  assert.equal(playerIds(removed.project).length, 1);

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
    assert.equal(result.ok, false, op.op);
    assert.equal(result.issues.some((issue) => issue.includes('exactly one player') && issue.includes('found 0')), true, op.op);
    assert.equal(result.applied.includes(op.op), false, op.op);
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

test('New does not leave a zero-player scene and undo will not restore one', () => {
  const created = newDockHistory({ id: 'dock.untitled', title: 'Untitled dock', seed: 1 });
  assert.equal(created.past.length, 0);
  assert.equal(playerIds(created.present).length, 1);
  assert.equal(projectIssues(created.present).some((issue) => issue.includes('exactly one player')), false);
  const freshUndo = restoreHistory(created, 'undo');
  assert.equal(freshUndo.ok, true);
  assert.equal(freshUndo.history, created);
  assert.equal(playerIds(freshUndo.history.present).length, 1);

  const empty = createHistory(emptyProject({ id: 'dock.untitled', title: 'Untitled dock', seed: 1 }));
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
