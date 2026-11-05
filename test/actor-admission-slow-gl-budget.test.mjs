import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createProgressDeadline } from '../src/render/pipelineReadiness.js';

const clock = (t = 0) => ({ now: () => t, set: (v) => { t = v; } });

test('actor admission deadline: normal-speed hosts keep the exact base deadline', () => {
  const c = clock(0);
  const d = createProgressDeadline(40000, { startedAt: 0, now: c.now, progress: () => 1 });
  c.set(39999); assert.equal(d.check(), true); assert.equal(d.extendedMs, 0);
  assert.equal(d.remainingMs(), 1);
});

test('actor admission deadline: a wedged admission fails at the base deadline', () => {
  const c = clock(0);
  const d = createProgressDeadline(40000, { startedAt: 0, now: c.now, progress: () => 7 });
  c.set(40000); assert.equal(d.check(), false);
});

test('actor admission deadline: slow GL that keeps linking slides one window at a time, capped at +1 base', () => {
  const c = clock(0); let links = 0;
  const d = createProgressDeadline(40000, { startedAt: 0, now: c.now, progress: () => links, windowMs: 5000 });
  c.set(40000); links += 1; assert.equal(d.check(), true); assert.equal(d.deadline, 45000);
  c.set(45000); assert.equal(d.check(), false, 'no progress during the window fails');
  const e = createProgressDeadline(40000, { startedAt: 0, now: c.now, progress: () => links, windowMs: 5000 });
  for (let t = 40000; t < 80000; t += 5000) { c.set(t); links += 1; assert.equal(e.check(), true); }
  c.set(80000); links += 1; assert.equal(e.check(), false, 'hard cap at base + base');
  assert.equal(e.extendedMs, 40000);
});

test('renderer first-flight actor admission uses the progress deadline for its checks, timer and first-picture remainder', () => {
  const src = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  const start = src.indexOf('const actorBudget = createProgressDeadline(');
  assert.ok(start > 0);
  const block = src.slice(start, src.indexOf('recordOpeningCookStep(state.render, mobileFirstPicture', start));
  assert.match(block, /if \(!actorBudget\.check\(\)\)/);
  assert.match(block, /if \(actorBudget\.check\(\)\) \{ arm\(\); return; \}/);
  assert.match(block, /timeoutMs: Math\.max\(1, actorBudget\.remainingMs\(\)\)/);
  assert.doesNotMatch(block, /performance\.now\(\) - exactStarted >= openingGateBudgetMs\(\)/);
});
