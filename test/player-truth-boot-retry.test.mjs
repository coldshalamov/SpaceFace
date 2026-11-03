import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { classifyBrowserLoss } from '../scripts/player-truth/browser.mjs';
import { archiveFirstAttempt, gateExitCode, gradedRunFields, runWithEnvironmentRetry } from '../scripts/player-truth/run.mjs';

const FIRST_DIR = path.resolve('out/boot-retry');
const ARCHIVE_DIR = `${FIRST_DIR}-attempt1-unique`;
const archivedRun = path.join(ARCHIVE_DIR, 'run');

function attempt(overrides = {}) {
  return { label: 'adventure', verdict: 'FAIL', outDir: FIRST_DIR,
    stopReason: 'harness/route error: main menu did not appear', reachedPlay: false,
    noGl: false, environmentLoss: null, retried: false, ...overrides };
}

function classifiedGraphicsLoss() {
  // Eligibility comes from the established environment-loss classification, not NO GL.
  const environmentLoss = classifyBrowserLoss({ notes: ['page closed'], signal: 'SIGKILL' });
  assert.equal(environmentLoss.environment, true);
  return attempt({ verdict: 'ENVIRONMENT', noGl: true,
    stopReason: 'HARNESS ENVIRONMENT: page closed by the environment (chrome signal SIGKILL). Graphics could not start',
    environmentLoss });
}

function orchestration(first, second = attempt({ verdict: 'PASS', reachedPlay: true }), { renameFails = false } = {}) {
  const files = new Map([[FIRST_DIR, { verdict: first.verdict, stopReason: first.stopReason }]]);
  const calls = [], messages = [], moves = [], reserved = [];
  const dependencies = {
    report: line => messages.push(line),
    archive: outDir => archiveFirstAttempt(outDir, {
      makeTempDir(prefix) { reserved.push(prefix); return ARCHIVE_DIR; },
      move(from, to) {
        moves.push([from, to]);
        if (renameFails) throw Object.assign(new Error('sharing violation'), { code: 'EPERM' });
        assert.ok(files.has(from));
        assert.equal(files.has(to), false);
        files.set(to, files.get(from)); files.delete(from);
      },
    }),
    async run(args, arena, extra) {
      calls.push({ args, arena, extra });
      if (calls.length === 1) return first;
      // Same reset boundary as runOne: the retry would overwrite this output directory.
      files.delete(FIRST_DIR);
      files.set(FIRST_DIR, { verdict: second.verdict, stopReason: second.stopReason,
        ...gradedRunFields(args), bootAttempts: args.bootAttempts });
      return second;
    },
  };
  return { files, calls, messages, moves, reserved, dependencies, second };
}

test('menu, route, loading and game-owned graphics failures keep their original failure without retry', async () => {
  for (const stopReason of ['main menu did not appear', 'route returned to menu', 'loading never completed',
    'Graphics could not start', 'could not create a WebGL context']) {
    const first = attempt({ stopReason, noGl: /graphics|webgl/i.test(stopReason) });
    const h = orchestration(first);
    const outcome = await runWithEnvironmentRetry({}, null, {}, h.dependencies);
    assert.equal(outcome, first);
    assert.equal(h.calls.length, 1);
    assert.deepEqual(h.moves, []);
    assert.equal(gateExitCode([outcome.verdict]), 1, 'a hypothetical passing retry cannot mask this failure');
    assert.equal(h.files.get(FIRST_DIR).verdict, 'FAIL');
  }
});

test('already-played NO GL and successful results are not boot-retry evidence', async () => {
  for (const verdict of ['PASS', 'FAIL', 'INCOMPLETE']) {
    const first = attempt({ verdict, reachedPlay: true, noGl: true, stopReason: 'Graphics could not start' });
    const h = orchestration(first);
    assert.equal(await runWithEnvironmentRetry({}, null, {}, h.dependencies), first);
    assert.equal(h.calls.length, 1);
    assert.deepEqual(h.moves, []);
  }
  const unproven = classifiedGraphicsLoss();
  unproven.environmentLoss.environment = false;
  const h = orchestration(unproven);
  assert.equal(await runWithEnvironmentRetry({}, null, {}, h.dependencies), unproven);
  assert.equal(h.calls.length, 1);
  for (const verdict of ['FAIL', 'INCOMPLETE']) {
    const measured = { ...classifiedGraphicsLoss(), verdict };
    const kept = orchestration(measured);
    assert.equal(await runWithEnvironmentRetry({}, null, {}, kept.dependencies), measured);
    assert.equal(kept.calls.length, 1, 'environment signals cannot replace a measured game failure');
  }
});

test('explicit eligible environment graphics loss retries once, keeping first and final results', async () => {
  for (const verdict of ['PASS', 'FAIL', 'ENVIRONMENT']) {
    const first = classifiedGraphicsLoss();
    const second = attempt({ verdict, stopReason: `second attempt ${verdict}`, retried: true });
    const h = orchestration(first, second);
    const outcome = await runWithEnvironmentRetry({ mode: 'adventure' }, 'arena', { hull: 'starter' }, h.dependencies);
    assert.equal(h.calls.length, 2, 'a second environment loss cannot start a third attempt');
    assert.equal(outcome, second);
    assert.equal(gateExitCode([outcome.verdict]), { PASS: 0, FAIL: 1, ENVIRONMENT: 4 }[verdict]);
    assert.deepEqual(h.reserved, [`${FIRST_DIR}-attempt1-`]);
    assert.deepEqual(h.moves, [[FIRST_DIR, archivedRun]]);
    assert.deepEqual(h.files.get(archivedRun), { verdict: first.verdict, stopReason: first.stopReason });
    const final = h.files.get(FIRST_DIR);
    assert.equal(final.verdict, verdict);
    assert.equal(final.firstStopReason, first.stopReason);
    assert.equal(final.gradedRun, 'retry');
    assert.match(final.environmentRetry, /chrome signal SIGKILL/);
    assert.equal(final.bootAttempts[0].verdict, 'ENVIRONMENT');
    assert.equal(final.bootAttempts[0].outDir, path.relative(process.cwd(), archivedRun));
    assert.deepEqual(h.calls[1].extra, { hull: 'starter' });
    assert.equal(h.calls[1].arena, 'arena');
  }
});

test('rename failure preserves first evidence and classification without starting a destructive second run', async () => {
  const first = classifiedGraphicsLoss();
  const h = orchestration(first, undefined, { renameFails: true });
  const outcome = await runWithEnvironmentRetry({}, null, {}, h.dependencies);
  assert.equal(outcome, first);
  assert.equal(h.calls.length, 1);
  assert.equal(gateExitCode([outcome.verdict]), 4);
  assert.deepEqual([...h.files.entries()], [[FIRST_DIR, { verdict: first.verdict, stopReason: first.stopReason }]]);
  assert.match(h.messages[0], /retry skipped.*sharing violation.*retained at/);
  assert.equal(h.messages.some(line => line.includes('retried once')), false);
});

test('classified environment loss after play keeps its established retry while a marked retry cannot retry again', async () => {
  const first = attempt({ verdict: 'ENVIRONMENT', reachedPlay: true,
    environmentLoss: { environment: true, reason: 'harness received SIGHUP' } });
  const h = orchestration(first);
  assert.equal(await runWithEnvironmentRetry({}, null, {}, h.dependencies), h.second);
  assert.equal(h.calls.length, 2, 'the existing host-loss policy still applies after play');
  const retried = { ...first, retried: true };
  const finished = orchestration(retried);
  assert.equal(await runWithEnvironmentRetry({}, null, {}, finished.dependencies), retried);
  assert.equal(finished.calls.length, 1);
});
