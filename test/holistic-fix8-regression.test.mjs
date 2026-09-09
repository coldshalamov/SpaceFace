// Holistic FIX8 regressions — L1–L7 (full src digest, ledger claim bind, required
// inputTape, typed temporal bounds, min causal oracles, frame value types, PQ claim id).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateCanonicalScenario,
  validateSimScenario,
  compileSimScenario,
} from '../src/contracts/simScenarioSchema.js';
import { assertAssertionsConsumed } from '../src/testing/lab/runScenario.js';
import {
  isResolvedByAcceptedEvidence,
  computeGateDigestsFromManifest,
  CANDIDATE_TRANSITIVE_SOURCE_PATHS,
  CANDIDATE_SOURCE_DIGEST_MODE,
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

// ── L1: full src/ candidate digest ───────────────────────────────────────────

test('L1: candidate source mode is full src tree (not hand-maintained list only)', () => {
  assert.equal(CANDIDATE_SOURCE_DIGEST_MODE, 'all-src-js');
});

test('L1: listSrcJsSourcePaths includes weapons.js and lab modules omitted from old list', async () => {
  const paths = await listSrcJsSourcePaths(REPO);
  assert.ok(paths.length > 100, `expected full src tree, got ${paths.length}`);
  const required = [
    'src/systems/weapons.js',
    'src/testing/lab/inputTape.js',
    'src/testing/lab/systemBundles.js',
    'src/testing/lab/entityProfiles.js',
    'src/runtime/nodeSystemFactoryTable.js',
    'src/core/registry.js',
  ];
  for (const p of required) {
    assert.ok(paths.includes(p), `missing from full src enumeration: ${p}`);
  }
  // Anchor subset still listed for docs/regression continuity.
  for (const p of CANDIDATE_TRANSITIVE_SOURCE_PATHS) {
    if (p.startsWith('src/')) {
      assert.ok(paths.includes(p), `anchor path not in full tree: ${p}`);
    }
  }
});

test('L1: changing weapons.js content invalidates candidate source digest', async () => {
  const paths = await listSrcJsSourcePaths(REPO);
  assert.ok(paths.includes('src/systems/weapons.js'));
  const sources = await readSourceSet(REPO, paths);
  const before = computeSourceSetDigest(sources);
  sources['src/systems/weapons.js'] = `${sources['src/systems/weapons.js']}\n// L1-digest-bump\n`;
  const after = computeSourceSetDigest(sources);
  assert.notEqual(before, after, 'weapons.js content change must move source digest');

  // Full gate digests also fold the tree.
  const digests = await computeGateDigestsFromManifest({
    root: REPO,
    manifest: {
      id: 'l1-weapons-digest-probe',
      runtimeKind: 'node',
      productionSourcePaths: [],
      harnessSourcePaths: [],
      regressionSourcePaths: [],
      scenarioPaths: [],
    },
  });
  assert.ok(digests.candidateDigest);
  assert.match(digests.candidateDigest, /^[a-f0-9]{64}$/i);
  assert.equal(digests.candidateSourceDigestMode, 'all-src-js');
  assert.ok(digests.candidateSourcePathCount > 100);
});

// ── L2: claim binding vs consumed-claim ledger ───────────────────────────────

test('L2: invented claimId without ledger entry is rejected', () => {
  const now = Date.now();
  const digests = { candidateDigest: 'cand-l2' };
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
      claimId: 'invented-never-checked',
      digests,
    },
    ...digests,
    // no consumedClaim
  });
  assert.equal(ok, false, 'invented claimId must not resolve');
});

test('L2: self-asserted evidence.consumedClaim without disk ledger is rejected', () => {
  // Codex-class forge: evidence bag carries claimId + a matching consumedClaim object
  // but the caller never loaded broker-claims/.consumed/ — must not resolve.
  const now = Date.now();
  const digests = { candidateDigest: 'cand-l2-forge' };
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
      claimId: 'forged-claim',
      digests,
      // Self-asserted bag — not the disk ledger authority.
      consumedClaim: {
        claimId: 'forged-claim',
        candidateDigest: digests.candidateDigest,
        runtimeKind: 'browser',
        consumedAt: new Date(now).toISOString(),
      },
    },
    ...digests,
    // Explicitly no caller-supplied ledger entry (disk miss).
    consumedClaim: null,
  });
  assert.equal(ok, false, 'evidence-embedded consumedClaim must not substitute for ledger');
});

test('L2: claimId present but ledger candidateDigest mismatch is rejected', () => {
  const now = Date.now();
  const digests = { candidateDigest: 'cand-l2-current' };
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
      claimId: 'claim-l2-stale',
      digests,
    },
    ...digests,
    consumedClaim: {
      claimId: 'claim-l2-stale',
      candidateDigest: 'other-candidate',
      runtimeKind: 'browser',
      consumedAt: new Date(now).toISOString(),
    },
  });
  assert.equal(ok, false, 'ledger candidate mismatch must reject');
});

test('L2: claimId present but ledger runtimeKind mismatch is rejected', () => {
  const now = Date.now();
  const digests = { candidateDigest: 'cand-l2-rk' };
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
      claimId: 'claim-l2-rk',
      digests,
    },
    ...digests,
    consumedClaim: {
      claimId: 'claim-l2-rk',
      candidateDigest: digests.candidateDigest,
      runtimeKind: 'electron',
      consumedAt: new Date(now).toISOString(),
    },
  });
  assert.equal(ok, false, 'ledger runtimeKind mismatch must reject');
});

test('L2: ledger-verified claimId with matching digests may resolve', () => {
  const now = Date.now();
  const digests = { candidateDigest: 'cand-l2-ok' };
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
      claimId: 'claim-l2-ok',
      digests,
    },
    ...digests,
    consumedClaim: {
      claimId: 'claim-l2-ok',
      candidateDigest: digests.candidateDigest,
      runtimeKind: 'browser',
      mode: 'acceptance',
      consumedAt: new Date(now).toISOString(),
    },
  });
  assert.equal(ok, true);
});

// ── L3: inputTape required ───────────────────────────────────────────────────

test('L3: canonical without inputTape is rejected', () => {
  const compiled = compileSimScenario(flightDoc);
  assert.equal(compiled.ok, true);
  const canonical = structuredClone(compiled.canonical);
  delete canonical.inputTape;
  // Keep raw surfaces so only the required-tape rule is under test.
  const v = validateCanonicalScenario(canonical);
  assert.equal(v.ok, false, 'canonical without inputTape must fail');
  assert.ok(
    v.issues.some((i) => i.path === '$.inputTape' && /required/i.test(`${i.rule} ${i.message}`)),
    JSON.stringify(v.issues),
  );
});

test('L3: empty inputTape object is accepted', () => {
  const compiled = compileSimScenario(flightDoc);
  const canonical = structuredClone(compiled.canonical);
  canonical.inputTape = { events: [], frames: [] };
  delete canonical.inputEvents;
  delete canonical.frames;
  const v = validateCanonicalScenario(canonical);
  assert.equal(v.ok, true, JSON.stringify(v.issues));
});

// ── L4: temporal bounds type-checked ─────────────────────────────────────────

test('L4: string temporal bounds are rejected at validation', () => {
  const doc = {
    ...flightDoc,
    id: 'l4.string-bounds',
    assertions: [
      {
        kind: 'holds',
        signal: 'attachmentActive',
        holdsTicks: 2,
        fromTick: '10',
        toTick: '12',
      },
    ],
  };
  const v = validateSimScenario(doc);
  assert.equal(v.ok, false, 'string bounds must fail schema validation');
  assert.ok(
    v.issues.some((i) =>
      /fromTick|toTick|holdsTicks|finite integer/i.test(`${i.path} ${i.message}`)),
    JSON.stringify(v.issues),
  );
});

test('L4: fromTick > toTick is rejected', () => {
  const doc = {
    ...flightDoc,
    id: 'l4.order-bounds',
    assertions: [
      {
        kind: 'never',
        signal: 'cmdRejected',
        fromTick: 12,
        toTick: 10,
      },
    ],
  };
  const v = validateSimScenario(doc);
  assert.equal(v.ok, false);
  assert.ok(
    v.issues.some((i) => /fromTick|toTick|range|<=/i.test(`${i.path} ${i.message}`)),
    JSON.stringify(v.issues),
  );
});

// ── L5: min causal oracles ───────────────────────────────────────────────────

test('L5: zero assertions and zero metrics fails validation', () => {
  const doc = {
    ...flightDoc,
    id: 'l5.no-oracle',
    assertions: [],
    metrics: [],
  };
  const v = validateSimScenario(doc);
  assert.equal(v.ok, false);
  assert.ok(
    v.issues.some((i) => /no assertion declared|no causal oracle/i.test(i.message)),
    JSON.stringify(v.issues),
  );
});

test('L5: assertAssertionsConsumed rejects empty list without metrics', () => {
  const result = assertAssertionsConsumed([], []);
  assert.equal(result.ok, false);
  assert.match(String(result.reason), /no assertion declared|no causal oracle/i);
});

// M3 supersedes L5 metrics-alone waiver: metrics measure, assertions certify.
test('L5/M3: assertAssertionsConsumed rejects empty assertions even when metrics present', () => {
  const result = assertAssertionsConsumed([], [], {
    metrics: [{ name: 'invariant.finiteState', version: 1, threshold: { op: '==', value: 1 } }],
  });
  assert.equal(result.ok, false);
  assert.match(String(result.reason), /no assertion declared|certify/i);
});

test('L5: public-input with empty tape fails validation', () => {
  const doc = {
    ...flightDoc,
    id: 'l5.public-empty-tape',
    evidenceClass: 'public-input',
    inputEvents: [],
    frames: [],
    assertions: [{ kind: 'equivalence', equivalence: 'run-eq-repeat' }],
    metrics: [{ name: 'invariant.finiteState', version: 1, threshold: { op: '==', value: 1 } }],
  };
  const v = validateSimScenario(doc);
  assert.equal(v.ok, false);
  assert.ok(
    v.issues.some((i) => /public-input|nonempty|tape/i.test(`${i.rule} ${i.message}`)),
    JSON.stringify(v.issues),
  );
});

// ── L6: nested frame input value types ───────────────────────────────────────

test('L6: string moveZ is rejected', () => {
  const doc = {
    ...flightDoc,
    id: 'l6.string-movez',
    frames: [
      { tick: 0, input: { moveX: 0, moveZ: 'forward', turnIntent: 0, boost: false } },
    ],
  };
  const v = validateSimScenario(doc);
  assert.equal(v.ok, false);
  assert.ok(
    v.issues.some((i) => /moveZ|finite number/i.test(`${i.path} ${i.message}`)),
    JSON.stringify(v.issues),
  );
});

test('L6: string boost is rejected (not truthy coerce)', () => {
  const doc = {
    ...flightDoc,
    id: 'l6.string-boost',
    frames: [
      { tick: 0, input: { moveX: 0, moveZ: 1, turnIntent: 0, boost: 'false' } },
    ],
  };
  const v = validateSimScenario(doc);
  assert.equal(v.ok, false);
  assert.ok(
    v.issues.some((i) => /boost|boolean/i.test(`${i.path} ${i.message}`)),
    JSON.stringify(v.issues),
  );
});

// ── L7: PQ probes write claim identity (source contract) ─────────────────────

test('L7: PQ browser/electron probes write claimId into evidence', () => {
  const browserSrc = readFileSync(
    join(REPO, 'scripts/probe-pq017-world-site.mjs'),
    'utf8',
  );
  const electronSrc = readFileSync(
    join(REPO, 'scripts/probe-pq017-world-site-electron.mjs'),
    'utf8',
  );
  for (const [label, src] of [['browser', browserSrc], ['electron', electronSrc]]) {
    assert.match(src, /claimId:\s*gateLaunch\.claimId/, `${label} must write claimId`);
    assert.match(src, /consumedClaim/, `${label} must write consumedClaim identity`);
    assert.match(src, /candidateDigest/, `${label} must retain candidateDigest`);
    assert.match(src, /runtimeKind/, `${label} must retain runtimeKind`);
  }
});
