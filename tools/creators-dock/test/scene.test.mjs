import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { applyRequest } from '../lib/agent.mjs';
import { compositionIds, getComposition } from '../lib/compositions.mjs';
import { commit, createHistory, undo } from '../lib/history.mjs';
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
