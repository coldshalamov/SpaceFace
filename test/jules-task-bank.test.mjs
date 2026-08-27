import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  DEFAULT_BANK_PATH,
  claimTasks,
  formatTaskPrompt,
  loadBank,
  normalizeModels,
  selectTasks,
  validateBank,
} from '../scripts/jules-dispatch.mjs';

const bank = loadBank(DEFAULT_BANK_PATH);

test('task bank validates as exactly 1,000 contiguous directed tasks', () => {
  const result = validateBank(bank);
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
  assert.equal(result.stats.total, 1000);
  assert.equal(result.stats.collisionKeys, 200);
  assert.equal(bank.tasks[0].id, 'JULES-0001');
  assert.equal(bank.tasks.at(-1).id, 'JULES-1000');
});

test('lane and model allocation remains intentional', () => {
  assert.deepEqual(bank.counts.byModel, {
    'gemini-3.6-flash': 700,
    'gemini-3.1-pro': 300,
  });
  assert.deepEqual(bank.counts.byLane, {
    'test-hardening': 170,
    'bug-hunt': 150,
    'determinism-save': 90,
    'performance-lifecycle': 90,
    'ui-ux-accessibility': 100,
    'ai-combat-flight': 100,
    'world-economy-missions-mining': 100,
    'render-assets-vfx-audio': 80,
    'tooling-data-docs': 70,
    'creative-expansion': 50,
  });
});

test('every task is independently identifiable and executable', () => {
  const fields = ['id', 'title', 'slug', 'objective', 'branchHint'];
  for (const field of fields) {
    assert.equal(new Set(bank.tasks.map((task) => task[field])).size, 1000, `${field} must be unique`);
  }
  for (const task of bank.tasks) {
    assert.equal(task.work.length, 4, `${task.id} work steps`);
    assert.equal(task.acceptance.length, 4, `${task.id} acceptance criteria`);
    assert.ok(task.inspectPaths.length >= 1, `${task.id} inspect paths`);
    assert.ok(task.readFirst.includes('CANONICAL_BUILD_MAP.md'), `${task.id} canonical routing`);
    assert.ok(task.readFirst.includes('AGENTS.md'), `${task.id} agent law`);
    assert.ok(task.suggestedChecks.length >= 1, `${task.id} checks`);
    assert.deepEqual(task.allowedResults, ['PR_READY', 'NO_CHANGE', 'BLOCKED']);
    assert.match(task.branchHint, new RegExp(`^jules/${task.id.toLowerCase()}-`));
  }
});

test('task scope never points at the bank, live program board, queue, or golden envelopes', () => {
  const forbidden = [
    /^design\/program\/jules(?:\/|$)/,
    /^design\/program\/NOW\.md$/,
    /^design\/program\/roadmap\/program-queue\.json$/,
    /^test\/.*\.expected\.json$/,
  ];
  for (const task of bank.tasks) {
    for (const path of task.inspectPaths) {
      assert.equal(
        forbidden.some((pattern) => pattern.test(path)),
        false,
        `${task.id} contains protected path ${path}`,
      );
    }
  }
});


test('generated catalogs contain one heading for every canonical task', () => {
  const headings = [];
  for (const lane of bank.lanes) {
    const path = resolve(DEFAULT_BANK_PATH, '..', lane.catalog);
    const markdown = readFileSync(path, 'utf8');
    const laneHeadings = [...markdown.matchAll(/^## (JULES-\d{4}) — /gm)].map((match) => match[1]);
    assert.equal(laneHeadings.length, lane.count, `${lane.id} catalog count`);
    headings.push(...laneHeadings);
  }
  assert.deepEqual(headings, bank.tasks.map((task) => task.id));
});

test('selector is deterministic and respects collision caps', () => {
  const options = {
    count: 300,
    models: normalizeModels('flash,pro'),
    seed: '2026-08-27',
    maxPerCollision: 2,
  };
  const first = selectTasks(bank, options, { tasks: {} });
  const second = selectTasks(bank, options, { tasks: {} });
  assert.deepEqual(first.map((task) => task.id), second.map((task) => task.id));
  assert.equal(first.length, 300);

  const counts = new Map();
  for (const task of first) counts.set(task.collisionKey, (counts.get(task.collisionKey) ?? 0) + 1);
  assert.ok([...counts.values()].every((count) => count <= 2));
});

test('selector avoids active collision keys and completed tasks', () => {
  const occupied = bank.tasks[0];
  const completed = bank.tasks[5];
  const state = {
    tasks: {
      [occupied.id]: { status: 'claimed', collisionKey: occupied.collisionKey },
      [completed.id]: { status: 'completed', result: 'PR_READY' },
    },
  };
  const selected = selectTasks(bank, {
    count: 100,
    seed: 'occupied-test',
    maxPerCollision: 1,
  }, state);
  assert.equal(selected.some((task) => task.collisionKey === occupied.collisionKey), false);
  assert.equal(selected.some((task) => task.id === completed.id), false);
});


test('claiming respects configurable collision caps', () => {
  const pair = bank.tasks.filter((task) => task.collisionKey === bank.tasks[0].collisionKey).slice(0, 2);
  const state = { schemaVersion: 1, updatedAt: null, tasks: {} };
  claimTasks(bank, state, pair, 'test-worker', false, 2);
  assert.equal(Object.keys(state.tasks).length, 2);
  const third = bank.tasks.find(
    (task) => task.collisionKey === bank.tasks[0].collisionKey && !pair.some((item) => item.id === task.id),
  );
  assert.throws(() => claimTasks(bank, state, [third], 'test-worker', false, 2), /exceeds collision cap 2/);
});

test('model aliases map to exact Jules model identifiers', () => {
  assert.deepEqual(normalizeModels('flash,pro'), ['gemini-3.6-flash', 'gemini-3.1-pro']);
  assert.throws(() => normalizeModels('mystery-model'), /Unknown model alias/);
});

test('rendered prompt contains the exact task, no-change law, and local merge gate', () => {
  const task = bank.tasks[0];
  const prompt = formatTaskPrompt(bank, task);
  assert.match(prompt, new RegExp(task.id));
  assert.match(prompt, new RegExp(task.branchHint.replaceAll('/', '\\/')));
  assert.match(prompt, /NO_CHANGE means no empty commit and no empty PR/);
  assert.match(prompt, /Do not lower default resolution/);
  assert.match(prompt, /local integrator must inspect the complete diff/i);
  assert.match(prompt, /RESULT \(PR_READY \| NO_CHANGE \| BLOCKED\):/);
});
