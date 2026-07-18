// Non-headed contracts for GOLD-CORRIDOR-PUBLIC-PILOT.
// Run: node --test test/gold-corridor-public-pilot-contract.test.mjs
//
// These are pure/fast contract tests: no browser, no server, no game boot. They prove the milestone
// schema + ordering rules, timeout classification, route identity fields, cleanup receipt shape,
// and the refusal-to-inject invariants that keep the pilot on the public input path.

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  GOLD_CORRIDOR_ADVISORY_MILESTONES,
  GOLD_CORRIDOR_ARTIFACT_ROOT,
  GOLD_CORRIDOR_CAREERS,
  GOLD_CORRIDOR_DEFAULT_STOP,
  GOLD_CORRIDOR_MILESTONES,
  GOLD_CORRIDOR_SCHEMA,
  GOLD_CORRIDOR_STOPS,
  GOLD_CORRIDOR_TASK_ID,
  buildCleanupReceipt,
  buildMilestoneRecord,
  buildPilotReceipt,
  buildRouteIdentity,
  classifyStall,
  finiteOrNull,
  formatBlocker,
  isAdvisoryMilestone,
  isKnownMilestone,
  lastReachedMilestone,
  milestoneIndex,
  milestoneStage,
  nextExpectedMilestone,
  parseBlocker,
  parsePilotArgv,
  requiredMilestonesFor,
  resolveStopMilestone,
  validateMilestoneOrder,
  validatePilotSources,
} from '../scripts/lib/goldCorridorPublicPilot.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PILOT = path.join(ROOT, 'scripts', 'lib', 'goldCorridorPublicPilot.mjs');
const DRIVER = path.join(ROOT, 'scripts', 'check-gold-corridor-public-pilot.mjs');

/** Build a well-formed milestone run through `throughId`, skipping advisory milestones. */
function runThrough(throughId, { includeAdvisory = false, startMs = 100, stepMs = 250 } = {}) {
  const end = milestoneIndex(throughId);
  const records = [];
  let at = startMs;
  for (const id of GOLD_CORRIDOR_MILESTONES.slice(0, end + 1)) {
    if (!includeAdvisory && isAdvisoryMilestone(id)) continue;
    records.push(buildMilestoneRecord({ id, atMs: at }));
    at += stepMs;
  }
  return records;
}

// ---------------------------------------------------------------------------
// Files + shape
// ---------------------------------------------------------------------------

test('pilot core and driver both exist', () => {
  assert.equal(existsSync(PILOT), true);
  assert.equal(existsSync(DRIVER), true);
});

test('milestone vocabulary is a frozen unique ordered list covering the corridor', () => {
  assert.equal(Object.isFrozen(GOLD_CORRIDOR_MILESTONES), true);
  assert.equal(new Set(GOLD_CORRIDOR_MILESTONES).size, GOLD_CORRIDOR_MILESTONES.length);
  for (const required of [
    'title-visible', 'new-game-opened', 'run-started', 'undocked', 'objective-acquired',
    'career-selected', 'map-used', 'travel-underway', 'first-dock', 'service-used',
    'save-written', 'continue-restored', 'clean-teardown',
  ]) {
    assert.ok(GOLD_CORRIDOR_MILESTONES.includes(required), `missing milestone ${required}`);
  }
  assert.equal(GOLD_CORRIDOR_MILESTONES[0], 'title-visible');
  assert.equal(GOLD_CORRIDOR_MILESTONES.at(-1), 'clean-teardown');
  // Career choice is advisory: the game offers career origins through the live Mission Log, so it
  // must never gate the corridor ahead of the milestone actually under diagnosis.
  assert.deepEqual([...GOLD_CORRIDOR_ADVISORY_MILESTONES], ['career-selected']);
  assert.equal(isAdvisoryMilestone('career-selected'), true);
  assert.equal(isAdvisoryMilestone('first-dock'), false);
});

test('milestone record schema is complete and stage-tagged', () => {
  const record = buildMilestoneRecord({ id: 'first-dock', atMs: 1234.5, note: 'docked', detail: { stationId: 'st' } });
  assert.equal(record.schema, GOLD_CORRIDOR_SCHEMA);
  assert.equal(record.id, 'first-dock');
  assert.equal(record.index, milestoneIndex('first-dock'));
  assert.equal(record.stage, 'first-dock');
  assert.equal(record.atMs, 1234.5);
  assert.equal(record.advisory, false);
  assert.deepEqual(record.detail, { stationId: 'st' });
  assert.equal(record.valid, true);
  for (const key of ['schema', 'id', 'index', 'stage', 'advisory', 'atMs', 'note', 'detail', 'valid']) {
    assert.ok(Object.prototype.hasOwnProperty.call(record, key), `record missing ${key}`);
  }
});

test('every milestone has a distinct-enough stage label and no unknowns', () => {
  for (const id of GOLD_CORRIDOR_MILESTONES) {
    assert.notEqual(milestoneStage(id), 'unknown', `milestone ${id} has no stage`);
    assert.equal(isKnownMilestone(id), true);
  }
  assert.equal(isKnownMilestone('not-a-milestone'), false);
  assert.equal(milestoneIndex('not-a-milestone'), -1);
  assert.equal(milestoneStage('not-a-milestone'), 'unknown');
});

// ---------------------------------------------------------------------------
// Fail-closed on non-finite input
// ---------------------------------------------------------------------------

test('non-finite milestone times fail closed into a defined invalid record', () => {
  for (const bad of [NaN, Infinity, -Infinity, undefined, null, 'later', {}]) {
    const record = buildMilestoneRecord({ id: 'run-started', atMs: bad });
    assert.equal(record.schema, GOLD_CORRIDOR_SCHEMA);
    assert.equal(record.atMs, null);
    assert.equal(record.valid, false, `atMs=${String(bad)} must not be valid`);
  }
  const unknown = buildMilestoneRecord({ id: 'nope', atMs: 5 });
  assert.equal(unknown.index, -1);
  assert.equal(unknown.valid, false);
  assert.equal(unknown.stage, 'unknown');
});

test('finiteOrNull collapses NaN/Infinity and honours the fallback', () => {
  assert.equal(finiteOrNull(12), 12);
  assert.equal(finiteOrNull('12.5'), 12.5);
  assert.equal(finiteOrNull(NaN), null);
  assert.equal(finiteOrNull(Infinity), null);
  assert.equal(finiteOrNull(-Infinity), null);
  assert.equal(finiteOrNull(undefined, 0), 0);
  assert.equal(finiteOrNull('abc', -1), -1);
});

test('classifyStall never throws on garbage input and still yields a blocker line', () => {
  const result = classifyStall({
    milestones: null,
    stop: 'nonsense-stop',
    blockedMilestone: 12345,
    elapsedMs: NaN,
    timeoutMs: Infinity,
  });
  assert.equal(result.schema, GOLD_CORRIDOR_SCHEMA);
  assert.equal(result.elapsedMs, null);
  assert.equal(result.timeoutMs, null);
  assert.ok(result.blocker.startsWith('GOLD-CORRIDOR-BLOCKER'));
  assert.match(result.blocker, /elapsed-ms=unknown/);
  assert.match(result.blocker, /timeout-ms=unknown/);
});

// ---------------------------------------------------------------------------
// Ordering rules
// ---------------------------------------------------------------------------

test('a full in-order run through the stop target validates', () => {
  const records = runThrough('clean-teardown');
  const result = validateMilestoneOrder(records, { stop: 'full' });
  assert.deepEqual(result.failures, [], result.failures.join('; '));
  assert.equal(result.pass, true);
  assert.equal(result.lastReached, 'clean-teardown');
  assert.equal(result.stopMilestone, 'clean-teardown');
});

test('advisory milestones may be present or absent without changing the verdict', () => {
  const without = validateMilestoneOrder(runThrough('clean-teardown'), { stop: 'full' });
  const with_ = validateMilestoneOrder(
    runThrough('clean-teardown', { includeAdvisory: true }), { stop: 'full' },
  );
  assert.equal(without.pass, true);
  assert.equal(with_.pass, true, with_.failures.join('; '));
});

test('ordering rule rejects regressions, duplicates and unknown ids', () => {
  const regressed = [
    buildMilestoneRecord({ id: 'title-visible', atMs: 10 }),
    buildMilestoneRecord({ id: 'first-dock', atMs: 20 }),
    buildMilestoneRecord({ id: 'run-started', atMs: 30 }),
  ];
  const a = validateMilestoneOrder(regressed, { stop: 'first-station' });
  assert.equal(a.pass, false);
  assert.ok(a.failures.some((f) => /out of order: run-started/.test(f)), a.failures.join('; '));

  const duplicated = [
    buildMilestoneRecord({ id: 'title-visible', atMs: 10 }),
    buildMilestoneRecord({ id: 'title-visible', atMs: 20 }),
  ];
  const b = validateMilestoneOrder(duplicated, { stop: 'title' });
  assert.equal(b.pass, false);
  assert.ok(b.failures.some((f) => /duplicate milestone: title-visible/.test(f)));

  const unknown = [buildMilestoneRecord({ id: 'warp-core-breach', atMs: 10 })];
  const c = validateMilestoneOrder(unknown, { stop: 'title' });
  assert.equal(c.pass, false);
  assert.ok(c.failures.some((f) => /unknown milestone: warp-core-breach/.test(f)));

  const d = validateMilestoneOrder('not-an-array', { stop: 'title' });
  assert.equal(d.pass, false);
  assert.ok(d.failures.some((f) => /must be an array/.test(f)));
});

test('ordering rule rejects milestone times that go backwards', () => {
  const records = [
    buildMilestoneRecord({ id: 'title-visible', atMs: 500 }),
    buildMilestoneRecord({ id: 'new-game-opened', atMs: 100 }),
  ];
  const result = validateMilestoneOrder(records, { stop: 'new-game' });
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((f) => /time went backwards: new-game-opened/.test(f)));
});

test('ordering rule requires every non-advisory milestone up to the stop target', () => {
  const short = runThrough('map-used');
  const result = validateMilestoneOrder(short, { stop: 'first-station' });
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((f) => /missing required milestone: travel-underway/.test(f)));
  assert.ok(result.failures.some((f) => /missing required milestone: first-dock/.test(f)));
  assert.ok(result.failures.some((f) => /missing required milestone: clean-teardown/.test(f)));
  // Advisory career milestone must NOT be demanded.
  assert.ok(!result.failures.some((f) => /career-selected/.test(f)), result.failures.join('; '));
});

test('stop targets resolve and requiredMilestonesFor is a teardown-terminated prefix', () => {
  assert.equal(resolveStopMilestone('first-station'), 'first-dock');
  assert.equal(resolveStopMilestone('full'), 'clean-teardown');
  assert.equal(resolveStopMilestone('does-not-exist'), null);
  assert.equal(resolveStopMilestone(undefined), GOLD_CORRIDOR_STOPS[GOLD_CORRIDOR_DEFAULT_STOP]);

  const required = requiredMilestonesFor('first-station');
  assert.deepEqual(required, [
    'title-visible', 'new-game-opened', 'run-started', 'undocked',
    'objective-acquired', 'map-used', 'travel-underway', 'first-dock', 'clean-teardown',
  ]);
  assert.deepEqual(requiredMilestonesFor('bogus'), []);
  for (const stop of Object.keys(GOLD_CORRIDOR_STOPS)) {
    const list = requiredMilestonesFor(stop);
    assert.ok(list.includes('clean-teardown'), `${stop} must still require teardown`);
    assert.ok(!list.includes('career-selected'), `${stop} must not require the advisory milestone`);
  }
});

test('lastReachedMilestone / nextExpectedMilestone track corridor progress', () => {
  const records = runThrough('map-used');
  assert.equal(lastReachedMilestone(records), 'map-used');
  assert.equal(nextExpectedMilestone(records, { stop: 'first-station' }), 'travel-underway');
  assert.equal(lastReachedMilestone([]), null);
  assert.equal(nextExpectedMilestone(runThrough('clean-teardown'), { stop: 'full' }), null);
});

// ---------------------------------------------------------------------------
// Timeout classification
// ---------------------------------------------------------------------------

test('a timeout is classified against the milestone that was not reached', () => {
  const reached = runThrough('travel-underway');
  const result = classifyStall({
    milestones: reached,
    stop: 'first-station',
    blockedMilestone: 'first-dock',
    cause: 'timeout',
    elapsedMs: 360_000,
    timeoutMs: 360_000,
    message: 'never docked: closest approach 294.777 WU, final 324.520 WU',
  });
  assert.equal(result.classified, true);
  assert.equal(result.kind, 'milestone-not-reached');
  assert.equal(result.blockedMilestone, 'first-dock');
  assert.equal(result.blockedStage, 'first-dock');
  assert.equal(result.lastReachedMilestone, 'travel-underway');
  assert.equal(result.stopMilestone, 'first-dock');
  assert.equal(result.cause, 'timeout');
  assert.match(result.blocker, /^GOLD-CORRIDOR-BLOCKER /);
  assert.match(result.blocker, /milestone=first-dock/);
  assert.match(result.blocker, /last-reached=travel-underway/);
  assert.match(result.blocker, /cause=timeout/);
  assert.match(result.blocker, /294\.777 WU/);
});

test('classification infers the blocked milestone when the caller does not name one', () => {
  const result = classifyStall({
    milestones: runThrough('undocked'),
    stop: 'first-station',
    cause: 'timeout',
    elapsedMs: 1_000,
  });
  assert.equal(result.blockedMilestone, 'objective-acquired');
  assert.equal(result.blockedStage, 'objective');
  assert.equal(result.lastReachedMilestone, 'undocked');
});

test('classification is never a bare failure — blocker round-trips through parseBlocker', () => {
  const result = classifyStall({
    milestones: runThrough('map-used'),
    stop: 'first-station',
    blockedMilestone: 'first-dock',
    cause: 'timeout',
    elapsedMs: 12_345.6,
    timeoutMs: 360_000,
    message: 'dock prompt never shown',
  });
  const parsed = parseBlocker(result.blocker);
  assert.ok(parsed, 'blocker line must be parseable by downstream consumers');
  assert.equal(parsed.milestone, 'first-dock');
  assert.equal(parsed.stage, 'first-dock');
  assert.equal(parsed.lastReached, 'map-used');
  assert.equal(parsed.target, 'first-dock');
  assert.equal(parsed.cause, 'timeout');
  assert.equal(parsed.elapsedMs, 12_346);
  assert.equal(parsed.timeoutMs, 360_000);
  assert.equal(parsed.message, 'dock prompt never shown');
  assert.equal(parseBlocker('some unrelated log line'), null);
  assert.equal(parseBlocker(null), null);
});

test('formatBlocker keeps a stable field order and collapses multi-line detail', () => {
  const line = formatBlocker({
    blockedMilestone: 'service-used',
    lastReachedMilestone: 'first-dock',
    stopMilestone: 'clean-teardown',
    cause: 'error',
    elapsedMs: 10,
    timeoutMs: 20,
    message: 'no public station\n  service command\twas visible',
  });
  assert.equal(
    line,
    'GOLD-CORRIDOR-BLOCKER milestone=service-used stage=station-service last-reached=first-dock '
    + 'target=clean-teardown cause=error elapsed-ms=10 timeout-ms=20 '
    + ':: no public station service command was visible',
  );
});

// ---------------------------------------------------------------------------
// Route identity
// ---------------------------------------------------------------------------

test('route identity carries build/worktree identity and declares no injection', () => {
  const identity = buildRouteIdentity({
    fingerprint: {
      id: 'master@bfb23570+dirty#abc123def456',
      branch: 'master',
      head: 'bfb23570',
      dirty: true,
      digest: 'abc123def456',
      untracked: { count: 3 },
    },
    rootUrl: 'http://127.0.0.1:54321',
    career: 'hauler',
    stop: 'first-station',
    nodeVersion: 'v22.0.0',
    platform: 'win32',
    browserExecutable: 'C:/chrome.exe',
  });
  assert.equal(identity.schema, GOLD_CORRIDOR_SCHEMA);
  assert.equal(identity.taskId, GOLD_CORRIDOR_TASK_ID);
  assert.equal(identity.career, 'hauler');
  assert.equal(identity.stop, 'first-station');
  assert.equal(identity.stopMilestone, 'first-dock');
  assert.equal(identity.rootUrl, 'http://127.0.0.1:54321');
  assert.equal(identity.injectedState, false);
  assert.equal(identity.inputSource, 'playwright-keyboard-pointer');
  assert.equal(identity.worktree.branch, 'master');
  assert.equal(identity.worktree.head, 'bfb23570');
  assert.equal(identity.worktree.dirty, true);
  assert.equal(identity.worktree.untrackedCount, 3);
  assert.equal(identity.nodeVersion, 'v22.0.0');
  assert.equal(identity.platform, 'win32');
});

test('route identity fails closed when the fingerprint is unavailable', () => {
  const identity = buildRouteIdentity({ fingerprint: null, career: 'hunter', stop: 'save' });
  assert.equal(identity.worktree.id, null);
  assert.equal(identity.worktree.dirty, false);
  assert.equal(identity.worktree.untrackedCount, 0);
  assert.equal(identity.injectedState, false);
  assert.equal(identity.stopMilestone, 'save-written');
});

test('argv parsing accepts the acceptance invocation and fails closed on junk', () => {
  const ok = parsePilotArgv(['--career=hauler', '--stop=first-station']);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.career, 'hauler');
  assert.equal(ok.stop, 'first-station');
  assert.equal(ok.stopMilestone, 'first-dock');
  assert.equal(ok.timeoutScale, 1);

  const defaults = parsePilotArgv([]);
  assert.equal(defaults.ok, true);
  assert.ok(GOLD_CORRIDOR_CAREERS.includes(defaults.career));
  assert.equal(defaults.stop, GOLD_CORRIDOR_DEFAULT_STOP);

  const bad = parsePilotArgv(['--career=astronaut', '--stop=mars', '--timeout-scale=NaN', '--wat']);
  assert.equal(bad.ok, false);
  assert.equal(bad.errors.length, 4);
  assert.ok(bad.errors.some((e) => /unknown career: astronaut/.test(e)));
  assert.ok(bad.errors.some((e) => /unknown stop target: mars/.test(e)));
  assert.ok(bad.errors.some((e) => /invalid timeout scale/.test(e)));

  for (const junk of ['--timeout-scale=Infinity', '--timeout-scale=0', '--timeout-scale=-2']) {
    assert.equal(parsePilotArgv([junk]).ok, false, `${junk} must fail closed`);
  }
});

// ---------------------------------------------------------------------------
// Cleanup receipt
// ---------------------------------------------------------------------------

test('a fully released run produces a passing cleanup receipt', () => {
  const receipt = buildCleanupReceipt({
    pageClosed: true,
    contextClosed: true,
    browserDisconnected: true,
    serverReleased: true,
    closed: [
      { name: 'page', present: true, closed: true },
      { name: 'context', present: true, closed: true },
      { name: 'browser', present: true, closed: true },
      { name: 'server', present: true, closed: true },
    ],
    failures: [],
  });
  assert.equal(receipt.pass, true);
  assert.deepEqual(receipt.leakedResources, []);
  assert.equal(receipt.attempted, true);
  assert.equal(receipt.closed.length, 4);
});

test('cleanup receipt names every leaked resource and never passes on a leak', () => {
  const receipt = buildCleanupReceipt({
    pageClosed: true,
    contextClosed: false,
    browserDisconnected: false,
    serverReleased: false,
    closed: [{ name: 'page', present: true, closed: true }],
    failures: [{ name: 'server-release', error: { message: 'owned URL remained reachable after close' } }],
  });
  assert.equal(receipt.pass, false);
  assert.deepEqual(receipt.leakedResources, ['context', 'browser', 'server']);
  assert.deepEqual(receipt.failures, ['server-release: owned URL remained reachable after close']);
});

test('a missing cleanup report fails closed rather than silently passing', () => {
  const receipt = buildCleanupReceipt(null);
  assert.equal(receipt.attempted, false);
  assert.equal(receipt.pass, false);
  assert.deepEqual(receipt.leakedResources, ['page', 'context', 'browser', 'server']);
});

// ---------------------------------------------------------------------------
// Full receipt
// ---------------------------------------------------------------------------

test('receipt carries identity, actions, milestones, blocker, save slot, errors and artifacts', () => {
  const identity = buildRouteIdentity({ career: 'hauler', stop: 'first-station', rootUrl: 'http://127.0.0.1:1' });
  const milestones = runThrough('travel-underway');
  const classification = classifyStall({
    milestones,
    stop: 'first-station',
    blockedMilestone: 'first-dock',
    cause: 'timeout',
    elapsedMs: 360_000,
    timeoutMs: 360_000,
    message: 'never docked',
  });
  const receipt = buildPilotReceipt({
    identity,
    milestones,
    actions: [{ kind: 'key', input: 'KeyW', target: 'gl-canvas', atMs: 12 }],
    classification,
    consoleErrors: [],
    pageErrors: [],
    cleanup: { pageClosed: true, contextClosed: true, browserDisconnected: true, serverReleased: true, closed: [], failures: [] },
    artifacts: [`${GOLD_CORRIDOR_ARTIFACT_ROOT}/hauler-first-station/receipt.json`],
    generatedAt: '2026-07-18T00:00:00.000Z',
    saveSlot: null,
  });
  assert.equal(receipt.schema, GOLD_CORRIDOR_SCHEMA);
  assert.equal(receipt.taskId, GOLD_CORRIDOR_TASK_ID);
  assert.equal(receipt.pass, false, 'a classified blocker must never report pass');
  assert.equal(receipt.failureStage, 'first-dock');
  assert.match(receipt.blocker, /milestone=first-dock/);
  assert.equal(receipt.identity.career, 'hauler');
  assert.equal(receipt.saveSlot, null);
  assert.equal(receipt.actions[0].input, 'KeyW');
  assert.equal(receipt.cleanup.pass, true);
  assert.ok(receipt.artifacts[0].startsWith('.devshots/'), 'artifacts must live in the ignored tree');
  for (const key of [
    'identity', 'milestones', 'milestoneOrder', 'actions', 'failureStage', 'blocker',
    'classification', 'consoleErrors', 'pageErrors', 'cleanup', 'artifacts', 'saveSlot',
  ]) {
    assert.ok(Object.prototype.hasOwnProperty.call(receipt, key), `receipt missing ${key}`);
  }
});

test('a complete corridor with clean cleanup and no errors reports pass', () => {
  const identity = buildRouteIdentity({ career: 'hauler', stop: 'full' });
  const receipt = buildPilotReceipt({
    identity,
    milestones: runThrough('clean-teardown'),
    actions: [],
    classification: null,
    consoleErrors: [],
    pageErrors: [],
    cleanup: { pageClosed: true, contextClosed: true, browserDisconnected: true, serverReleased: true, closed: [], failures: [] },
    artifacts: [],
    generatedAt: '2026-07-18T00:00:00.000Z',
    saveSlot: 'quick',
  });
  assert.equal(receipt.pass, true, JSON.stringify(receipt.milestoneOrder.failures));
  assert.equal(receipt.blocker, null);
  assert.equal(receipt.saveSlot, 'quick');
});

test('page/console errors alone are enough to deny a pass', () => {
  const receipt = buildPilotReceipt({
    identity: buildRouteIdentity({ career: 'hauler', stop: 'full' }),
    milestones: runThrough('clean-teardown'),
    classification: null,
    consoleErrors: [{ type: 'console', text: 'TypeError: boom' }],
    pageErrors: [],
    cleanup: { pageClosed: true, contextClosed: true, browserDisconnected: true, serverReleased: true, closed: [], failures: [] },
  });
  assert.equal(receipt.pass, false);
  assert.equal(receipt.consoleErrors.length, 1);
});

// ---------------------------------------------------------------------------
// Refusal to inject
// ---------------------------------------------------------------------------

test('validatePilotSources rejects synthetic input and state injection', () => {
  const clean = 'await page.keyboard.press("KeyF");';
  const cases = [
    ['const b = window.SF.bus; b.emit("dock:docked", {});', /emit gameplay events/],
    ['window.SF.state.mode = "station";', /assign game mode/],
    ['state.world.currentSectorId = "sector_x";', /assign the current sector/],
    ['player.pos.x = 100;', /teleport the player/],
    ['player.credits = 999999;', /assign player credits/],
    ['el.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyF" }));', /synthesize/],
    ['canvas.dispatchEvent(new MouseEvent("click"));', /synthesize/],
    ['target.dispatchEvent(new PointerEvent("pointerdown"));', /synthesize/],
    ['enterSector(state, "sector_x");', /internal sector transitions/],
    ['await page.goto(url + "?debug=flight");', /query debug flags/],
    ['function teleportPlayer() {}', /teleport\/fake helpers/],
    ['const mode = debugFlight ? 1 : 0;', /debug-flight/],
  ];
  for (const [snippet, expected] of cases) {
    const result = validatePilotSources({ pilotSrc: clean, driverSrc: snippet, testSrc: HARNESS_SEAMS });
    assert.equal(result.pass, false, `should reject: ${snippet}`);
    assert.ok(result.failures.some((f) => expected.test(f)),
      `${snippet} -> ${result.failures.join('; ')}`);
  }
});

test('validatePilotSources demands the public seams and fails closed on empty input', () => {
  const missing = validatePilotSources({ pilotSrc: 'export const x = 1;', driverSrc: '' });
  assert.equal(missing.pass, false);
  assert.ok(missing.failures.some((f) => /public keyboard surface/.test(f)));
  assert.ok(missing.failures.some((f) => /clean up owned/.test(f)));
  assert.ok(missing.failures.some((f) => /classify stalls/.test(f)));
  assert.ok(missing.failures.some((f) => /ignored artifact tree/.test(f)));

  const empty = validatePilotSources({});
  assert.equal(empty.pass, false);
  assert.ok(empty.failures.includes('no sources provided'));
});

const HARNESS_SEAMS = [
  'runGoldCorridorPublicPilot',
  'page.keyboard.press("Space")',
  'closeOwnedResources({ page })',
  'classifyStall({})',
  'const dir = ".devshots/gold-corridor";',
].join('\n');

test('the shipped pilot core and driver pass their own refusal-to-inject contract', async () => {
  const [pilotSrc, driverSrc] = await Promise.all([
    readFile(PILOT, 'utf8'),
    readFile(DRIVER, 'utf8'),
  ]);
  const result = validatePilotSources({ pilotSrc, driverSrc });
  assert.deepEqual(result.failures, [], result.failures.join('; '));
  assert.equal(result.pass, true);
});

test('driver writes evidence only under the ignored artifact tree and shares the pilot core', async () => {
  const driverSrc = await readFile(DRIVER, 'utf8');
  assert.equal(GOLD_CORRIDOR_ARTIFACT_ROOT.startsWith('.devshots/'), true);
  assert.match(driverSrc, /goldCorridorPublicPilot\.mjs/);
  assert.match(driverSrc, /runGoldCorridorPublicPilot/);
  assert.match(driverSrc, /GOLD_CORRIDOR_ARTIFACT_ROOT/);
  assert.match(driverSrc, /closeOwnedResources/);
  // Cleanup must be unconditional, not only on the happy path.
  assert.match(driverSrc, /finally\s*\{[\s\S]*closeOwnedResources/);
  // The driver must not invent its own server/MIME handling.
  assert.doesNotMatch(driverSrc, /createServer\(|'\.glb'\s*:/);
  assert.match(driverSrc, /acquireVisualProbeServer/);
});
