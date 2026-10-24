import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createBarProbeLifecycle, rethrowBarBootFailure } from '../scripts/lib/barProbeLifecycle.mjs';

const fixture = await readFile(new URL('../scripts/check-bar-mission-readiness-live.mjs', import.meta.url), 'utf8');
const events = ['fixture-start', 'assertions-complete', 'browser-close-start', 'browser-close-end',
  'server-stop-request', 'server-exit', 'server-close'];

test('seven bounded milestones carry independent wall and elapsed clocks', () => {
  let mono = 100;
  let wall = 1000;
  const rows = [];
  const mark = createBarProbeLifecycle({ wallNow: () => wall, monotonicNow: () => mono,
    sink: line => rows.push(JSON.parse(line.slice('[bar-probe-lifecycle] '.length))) });
  for (const event of events) { mark(event); mono += 5; wall -= 2; }
  for (const event of events) mark(event);
  mark('frame'); mark('__proto__');
  assert.equal(rows.length, 7);
  assert.deepEqual(rows.map(row => row.event), events);
  assert.deepEqual(rows.map(row => row.elapsedMs), [0, 5, 10, 15, 20, 25, 30]);
  assert.deepEqual(rows.map(row => row.epochMs), [1000, 998, 996, 994, 992, 990, 988]);
});

test('only bounded process and completion details are serialized', () => {
  const rows = [];
  const mark = createBarProbeLifecycle({ wallNow: () => 123, monotonicNow: () => 1,
    sink: line => rows.push(JSON.parse(line.slice('[bar-probe-lifecycle] '.length))) });
  mark('server-exit', { pid: 42, code: null, signal: 'SIGTERM', event: 'wrong', payload: 'discard' });
  mark('browser-close-end', { completed: false });
  assert.deepEqual(rows[0], { event: 'server-exit', epochMs: 123, elapsedMs: 0,
    pid: 42, code: null, signal: 'SIGTERM' });
  assert.equal(rows[1].completed, false);
});

test('diagnostic clock and sink failures never throw or retry milestones', () => {
  let calls = 0;
  const mark = createBarProbeLifecycle({ wallNow: () => 1, monotonicNow: () => 1,
    sink: () => { calls++; throw new Error('closed output'); } });
  assert.doesNotThrow(() => { mark('fixture-start'); mark('fixture-start'); });
  assert.equal(calls, 1);
  const badClock = createBarProbeLifecycle({ monotonicNow: () => { throw new Error('clock'); } });
  assert.doesNotThrow(() => badClock('fixture-start'));
});

test('unavailable clock numbers become null rather than invented timing', () => {
  let line;
  const mark = createBarProbeLifecycle({ wallNow: () => NaN, monotonicNow: () => Infinity,
    sink: value => { line = value; } });
  mark('fixture-start');
  assert.deepEqual(JSON.parse(line.slice('[bar-probe-lifecycle] '.length)),
    { event: 'fixture-start', epochMs: null, elapsedMs: null });
});

test('fixture preserves assertions, success text and cleanup ordering without new waits', () => {
  const success = "console.log('Bar mission readiness live OK: Bar offer chips, blocker, Accept + Track, and Mission Log handoff render on the default route.');";
  assert(fixture.indexOf("lifecycle('assertions-complete')") > fixture.indexOf('assert.deepEqual(issues.errorIssues()'));
  assert(fixture.indexOf(success) > fixture.indexOf("lifecycle('assertions-complete')"));
  assert(fixture.indexOf("lifecycle('browser-close-start')") < fixture.indexOf('await browser.close()'));
  assert(fixture.indexOf("lifecycle('browser-close-end', { completed })") > fixture.indexOf('await browser.close()'));
  assert(fixture.indexOf("lifecycle('server-stop-request')") > fixture.indexOf('await browser.close()'));
  assert.match(fixture, /finally \{ lifecycle\('browser-close-end', \{ completed \}\); \}/);
  assert.match(fixture, /child\.once\('exit', \(code, signal\) => lifecycle\('server-exit', \{ pid: child\.pid, code, signal \}\)\)/);
  assert.match(fixture, /child\.once\('close', \(code, signal\) => lifecycle\('server-close', \{ pid: child\.pid, code, signal \}\)\)/);
  assert.match(fixture, /const START_TIMEOUT_MS = 90000;/);
  assert.equal((fixture.match(/setTimeout/g) || []).length, 1, 'no added timers');
  assert.equal((fixture.match(/await browser.close\(\)/g) || []).length, 1);
  assert.equal((fixture.match(/child.kill\(\)/g) || []).length, 2, 'existing server signals only');
});

test('boot failure reports existing issues once and rethrows the identical error', () => {
  const original = new Error('original timeout');
  let reads = 0;
  const output = [];
  const collector = { errorIssues() { reads++; return [
    { type: 'pageerror', text: 'ReferenceError: missingBootOwner is not defined' },
    { type: 'error', text: 'HTTP 404 https://user:password@example.test/src/a.js?token=secret#private' },
    { type: 'error', text: 'Request failed https://example.test/?token=secret: net::ERR_FAILED' },
    { type: 'pageerror', text: 'private email alice@example.test and secret arbitrary payload' },
  ]; } };
  assert.throws(() => rethrowBarBootFailure(original, collector, line => output.push(line)), err => err === original);
  assert.equal(reads, 1);
  assert.equal(output.length, 1);
  const report = JSON.parse(output[0].slice('[bar-probe-boot-issues] '.length));
  assert.equal(report.stage, 'initial-runtime-ready');
  assert.equal(report.count, 4);
  assert.deepEqual(report.issues.map(row => row.text), [
    'missingBootOwner is not defined', 'HTTP 404 [URL omitted]',
    'Request failed [URL omitted]: net::ERR_FAILED',
    '[message omitted: unrecognized technical shape]',
  ]);
  assert(!/password|secret|alice|example\.test/.test(output[0]));
});

test('boot report bounds issue count and text without modifying collector evidence', () => {
  const original = new Error('timeout');
  const issues = Array.from({ length: 100 }, () => ({ type: 'error', text: 'x'.repeat(10000) }));
  let output;
  assert.throws(() => rethrowBarBootFailure(original, { errorIssues: () => issues }, line => { output = line; }), err => err === original);
  const report = JSON.parse(output.slice('[bar-probe-boot-issues] '.length));
  assert.equal(report.issues.length, 8);
  assert.equal(report.omitted, 92);
  assert(report.issues.every(row => row.text.length <= 160));
  assert.equal(issues.length, 100);
  assert.equal(issues[0].text.length, 10000);
});

test('collector, field and sink failures cannot mask the original boot rejection', () => {
  const original = new Error('timeout');
  const throwing = () => { throw new Error('diagnostic failure'); };
  const cases = [
    [{ errorIssues: throwing }, () => {}],
    [{ errorIssues: () => [{ get text() { return throwing(); } }] }, () => {}],
    [{ errorIssues: () => [] }, throwing],
  ];
  for (const [collector, sink] of cases) {
    assert.throws(() => rethrowBarBootFailure(original, collector, sink), err => err === original);
  }
});

test('only the existing initial runtime wait gains a Node-side failure report', () => {
  assert.equal((fixture.match(/\.catch\(\(error\) => rethrowBarBootFailure\(error, issues\)\)/g) || []).length, 1);
  assert(fixture.includes('window.SF && window.SF.state && window.SF.bus && window.SF.ctx, null, { timeout: START_TIMEOUT_MS, polling: 250 })\n    .catch((error) => rethrowBarBootFailure(error, issues));'));
});
