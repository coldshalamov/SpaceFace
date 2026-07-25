// Holistic FIX9 regressions — M1–M5 (receipt-only evidence, raw tape masking,
// thresholdless metrics, browser validation, untracked src digest).
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

import {
  validateCanonicalScenario,
  validateSimScenario,
  compileSimScenario,
} from '../src/contracts/simScenarioSchema.js';
import { assertAssertionsConsumed } from '../src/testing/lab/assertionConsumption.js';
import { compareThreshold, evaluateMetrics } from '../src/testing/lab/metricRegistry.js';
import '../src/testing/metrics/masslineMetrics.js';
import { runBrowserLabScenario } from '../src/testing/lab/browserScenarioHost.js';
import {
  isResolvedByAcceptedEvidence,
  listSrcJsSourcePaths,
  computeSourceSetDigest,
  readSourceSet,
} from '../scripts/lib/validationBroker.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const REPO = join(ROOT, '..');

const flightDoc = JSON.parse(readFileSync(
  join(ROOT, '../src/testing/scenarios/flight-fixed-input.scenario.json'),
  'utf8',
));

// ── M1: receipt-only evidence must NOT resolve without claimId + disk ledger ─

test('M1: receipt-only evidence (receiptId, no claimId) does not resolve', () => {
  const now = Date.now();
  const digests = { candidateDigest: 'cand-m1-receipt' };
  const ok = isResolvedByAcceptedEvidence({
    latestFailure: {
      primaryAcceptance: true,
      runtimeKind: 'browser',
      generatedAt: new Date(now - 60_000).toISOString(),
    },
    acceptedRuntimeKind: 'browser',
    acceptedGeneratedAt: new Date(now).toISOString(),
    now,
    acceptedEvidence: {
      pass: true,
      primaryAcceptance: true,
      // Codex repro: embedded receipt only — no claimId / ledger.
      receiptId: 'receipt-only-forged',
      receipt: {
        receiptId: 'receipt-only-forged',
        candidateDigest: digests.candidateDigest,
      },
      digests,
    },
    ...digests,
    consumedClaim: null,
  });
  assert.equal(ok, false, 'receipt-only evidence must not resolve');
});

test('M1: receipt.candidateDigest alone does not resolve', () => {
  const now = Date.now();
  const digests = { candidateDigest: 'cand-m1-rcpt-dig' };
  const ok = isResolvedByAcceptedEvidence({
    latestFailure: {
      primaryAcceptance: true,
      runtimeKind: 'browser',
      generatedAt: new Date(now - 60_000).toISOString(),
    },
    acceptedRuntimeKind: 'browser',
    acceptedGeneratedAt: new Date(now).toISOString(),
    now,
    acceptedEvidence: {
      pass: true,
      primaryAcceptance: true,
      receipt: { candidateDigest: digests.candidateDigest },
      digests,
    },
    ...digests,
  });
  assert.equal(ok, false, 'receipt.candidateDigest without claimId+ledger must not resolve');
});

test('M1: claimId + matching disk ledger may still resolve', () => {
  const now = Date.now();
  const digests = { candidateDigest: 'cand-m1-ok' };
  const ok = isResolvedByAcceptedEvidence({
    latestFailure: {
      primaryAcceptance: true,
      runtimeKind: 'browser',
      generatedAt: new Date(now - 60_000).toISOString(),
    },
    acceptedRuntimeKind: 'browser',
    acceptedGeneratedAt: new Date(now).toISOString(),
    now,
    acceptedEvidence: {
      pass: true,
      primaryAcceptance: true,
      claimId: 'claim-m1-ok',
      digests,
    },
    ...digests,
    consumedClaim: {
      claimId: 'claim-m1-ok',
      candidateDigest: digests.candidateDigest,
      runtimeKind: 'browser',
      consumedAt: new Date(now).toISOString(),
    },
  });
  assert.equal(ok, true);
});

// ── M2: raw fields must NOT mask empty consumed inputTape ───────────────────

test('M2: public-input with raw frames + empty inputTape fails validation', () => {
  const compiled = compileSimScenario(flightDoc);
  assert.equal(compiled.ok, true);
  const canonical = structuredClone(compiled.canonical);
  canonical.evidenceClass = 'public-input';
  // Codex repro: nonempty raw frames, empty consumed tape.
  canonical.frames = [
    { tick: 0, input: { moveX: 0, moveZ: 1, turnIntent: 0, boost: false } },
  ];
  canonical.inputEvents = [];
  canonical.inputTape = { events: [], frames: [] };
  const v = validateCanonicalScenario(canonical);
  assert.equal(v.ok, false, 'raw frames must not mask empty consumed tape');
  assert.ok(
    v.issues.some((i) => /public-input|nonempty|tape|inputTape/i.test(`${i.path} ${i.rule} ${i.message}`)),
    JSON.stringify(v.issues),
  );
});

test('M2: public-input with nonempty consumed tape passes tape rule', () => {
  const compiled = compileSimScenario(flightDoc);
  const canonical = structuredClone(compiled.canonical);
  canonical.evidenceClass = 'public-input';
  // Keep compiled tape contents (flight frames are nonempty after compile).
  assert.ok(
    (canonical.inputTape.frames?.length || 0) + (canonical.inputTape.events?.length || 0) > 0,
  );
  const v = validateCanonicalScenario(canonical);
  // May still fail other public-input constraints; tape rule itself must not fire.
  assert.ok(
    !v.issues.some((i) => i.rule === 'public-input-tape'),
    JSON.stringify(v.issues),
  );
});

// ── M3: thresholdless metrics + assertion-required certification ────────────

test('M3: metric without threshold fails schema validation', () => {
  const doc = {
    ...flightDoc,
    id: 'm3.thresholdless',
    metrics: [{ name: 'invariant.finiteState', version: 1 }],
    assertions: [{ kind: 'equivalence', equivalence: 'run-eq-repeat' }],
  };
  const v = validateSimScenario(doc);
  assert.equal(v.ok, false);
  assert.ok(
    v.issues.some((i) => /threshold/i.test(`${i.path} ${i.rule} ${i.message}`)),
    JSON.stringify(v.issues),
  );
});

test('M3: malformed threshold form fails schema validation', () => {
  const doc = {
    ...flightDoc,
    id: 'm3.bad-threshold',
    metrics: [{ name: 'invariant.finiteState', version: 1, threshold: { op: 'wat', value: 1 } }],
    assertions: [{ kind: 'equivalence', equivalence: 'run-eq-repeat' }],
  };
  const v = validateSimScenario(doc);
  assert.equal(v.ok, false);
  assert.ok(
    v.issues.some((i) => /threshold/i.test(`${i.path} ${i.rule} ${i.message}`)),
    JSON.stringify(v.issues),
  );
});

test('M3: compareThreshold rejects null and unknown forms (no vacuous ok)', () => {
  assert.equal(compareThreshold(1, null).ok, false);
  assert.equal(compareThreshold(1, {}).ok, false);
  assert.equal(compareThreshold(1, { op: 'wat', value: 1 }).ok, false);
  assert.equal(compareThreshold(1, { op: '<=', value: 'x' }).ok, false);
  assert.equal(compareThreshold(0, { op: '<=', value: 1 }).ok, true);
});

test('M3: evaluateMetrics fails thresholdless metric (never ok:true by default)', () => {
  const results = evaluateMetrics(
    [{ name: 'invariant.finiteState', version: 1 }],
    [{ tick: 0, playerX: 0, playerZ: 0, playerVelX: 0, playerVelZ: 0, playerRot: 0 }],
  );
  assert.equal(results.length, 1);
  assert.equal(results[0].ok, false);
  assert.match(String(results[0].error), /threshold/i);
});

test('M3: scenario with metrics only (zero assertions) fails validation', () => {
  const doc = {
    ...flightDoc,
    id: 'm3.metrics-only',
    assertions: [],
    metrics: [
      { name: 'invariant.finiteState', version: 1, threshold: { op: '==', value: 1 } },
    ],
  };
  const v = validateSimScenario(doc);
  assert.equal(v.ok, false);
  assert.ok(
    v.issues.some((i) => /assertion/i.test(`${i.rule} ${i.message}`)),
    JSON.stringify(v.issues),
  );
});

test('M3: assertAssertionsConsumed rejects metrics-only certification', () => {
  const result = assertAssertionsConsumed([], [], {
    metrics: [{ name: 'invariant.finiteState', version: 1, threshold: { op: '==', value: 1 } }],
  });
  assert.equal(result.ok, false);
  assert.match(String(result.reason), /assertion|certify/i);
});

// ── M4: browser runner validates + assertion-consumption guard ──────────────

test('M4: runBrowserLabScenario rejects invalid canonical (no schema bypass)', async () => {
  const compiled = compileSimScenario(flightDoc);
  assert.equal(compiled.ok, true);
  const canonical = structuredClone(compiled.canonical);
  delete canonical.inputTape;
  delete canonical.seed;
  const result = await runBrowserLabScenario(canonical);
  assert.equal(result.ok, false);
  assert.equal(result.status, 'invalid-config');
  assert.ok(result.validation && result.validation.ok === false);
});

test('M4: runBrowserLabScenario applies assertion-consumption guard', async () => {
  // Valid shape after compile, but zero assertions after mutation → consumption fails.
  const compiled = compileSimScenario(flightDoc);
  const canonical = structuredClone(compiled.canonical);
  // Bypass validateCanonicalScenario's assertion-required check by reusing a valid
  // validated path: if validation now requires assertions, empty assertions fail at
  // schema — which is also correct for M4 (validation surface). Either path fails closed.
  canonical.assertions = [];
  const result = await runBrowserLabScenario(canonical);
  assert.equal(result.ok, false);
  assert.ok(
    result.status === 'invalid-config'
    || result.status === 'fail'
    || (result.oracle && result.oracle.ok === false),
    JSON.stringify({ status: result.status, oracle: result.oracle, validation: result.validation }),
  );
});

// ── M5: untracked src/*.js must enter candidate digest ──────────────────────

test('M5: listSrcJsSourcePaths unions git-tracked and on-disk untracked .js', async () => {
  // Isolated mini-repo — never write into live REPO src/ (races concurrent gate digests).
  const { mkdtemp, mkdir } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);
  const mini = await mkdtemp(join(tmpdir(), 'm5-src-digest-'));
  try {
    await mkdir(join(mini, 'src', 'systems'), { recursive: true });
    await writeFile(join(mini, 'src', 'systems', 'tracked.js'), 'export const t = 1;\n', 'utf8');
    // Init git and track only tracked.js so ls-files alone would miss untracked_probe.js.
    await execFileAsync('git', ['init'], { cwd: mini, windowsHide: true });
    await execFileAsync('git', ['config', 'user.email', 'm5@test.local'], { cwd: mini, windowsHide: true });
    await execFileAsync('git', ['config', 'user.name', 'm5'], { cwd: mini, windowsHide: true });
    await execFileAsync('git', ['add', 'src/systems/tracked.js'], { cwd: mini, windowsHide: true });
    await execFileAsync('git', ['commit', '-m', 'm5 seed'], { cwd: mini, windowsHide: true });

    await writeFile(
      join(mini, 'src', 'systems', 'untracked_probe.js'),
      '// m5 untracked digest probe\nexport const m5 = 1;\n',
      'utf8',
    );
    // git ls-files alone would omit untracked_probe.js; union with disk walk must include it.
    const { stdout: lsOut } = await execFileAsync(
      'git',
      ['ls-files', '-z', '--', 'src'],
      { cwd: mini, windowsHide: true },
    );
    const gitOnly = String(lsOut || '').split('\0').filter(Boolean).map((p) => p.replace(/\\/g, '/'));
    assert.ok(gitOnly.includes('src/systems/tracked.js'));
    assert.ok(!gitOnly.includes('src/systems/untracked_probe.js'), 'git alone must miss untracked');

    const paths = await listSrcJsSourcePaths(mini);
    assert.ok(paths.includes('src/systems/tracked.js'));
    assert.ok(
      paths.includes('src/systems/untracked_probe.js'),
      `union must include untracked: ${JSON.stringify(paths)}`,
    );

    const sources = await readSourceSet(mini, paths);
    const digestWith = computeSourceSetDigest(sources);
    assert.match(digestWith, /^[a-f0-9]{64}$/i);

    await rm(join(mini, 'src', 'systems', 'untracked_probe.js'), { force: true });
    const after = await listSrcJsSourcePaths(mini);
    assert.ok(!after.includes('src/systems/untracked_probe.js'));
    const digestAfter = computeSourceSetDigest(await readSourceSet(mini, after));
    assert.notEqual(digestWith, digestAfter, 'untracked file content must affect source digest');
  } finally {
    await rm(mini, { recursive: true, force: true });
  }
});
