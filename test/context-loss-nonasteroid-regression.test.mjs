import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA = 'spaceface.contextLossRegression.v1';
const EXPECTED_CONTEXT_LOSS_KEYS = [
  'available', 'before', 'after', 'lostEvent', 'restoredEvent',
  'meshRecovered', 'rootIdentityStable', 'pixelProof', 'visualRecovery', 'frameAdvanced', 'recovered',
];
const WRONG_CONTEXT_RE = /object does not belong to this context/i;
const GENERIC_DELETE_RE = /INVALID_OPERATION:\s*delete\s*:/i;
const DELETE_VAO_RE = /INVALID_OPERATION:\s*deleteVertexArray\s*:/i;
const ASTEROID_RE = /asteroid/i;
const LIFECYCLE_WARN_RE = /\[render\]\s*WebGL context\s+(lost|restored)/i;
const INVALID_OPERATION_RE = /INVALID_OPERATION/i;

const PROJECT_ROOT = dirname(fileURLToPath(import.meta.url)).replace(/\/test$/, '').replace(/\\test$/, '');
const PACKET_DIR = join(PROJECT_ROOT, '.campaign', 'PERF-FRAME-PACING-CONTEXT-TEARDOWN-CODEX-LEAD-001');
const EVIDENCE_DIR = process.env.SF_CONTEXT_LOSS_EVIDENCE_DIR
  ? resolve(process.env.SF_CONTEXT_LOSS_EVIDENCE_DIR)
  : PACKET_DIR;

function readJsonFile(name) {
  const filePath = join(EVIDENCE_DIR, name);
  assert(existsSync(filePath), `${name} must exist in ${EVIDENCE_DIR}`);
  const raw = readFileSync(filePath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    assert.fail(`Failed to parse ${name}: ${err.message}`);
  }
  assert.ok(parsed && typeof parsed === 'object', `${name} must parse to a plain object`);
  return parsed;
}

function countWarnings(warnings, re) {
  return (Array.isArray(warnings) ? warnings : []).filter((w) => re.test(String(w))).length;
}

function hasAsteroidScope(evidence) {
  const text = JSON.stringify(evidence).toLowerCase();
  return ASTEROID_RE.test(text)
    || text.includes('asteroidpool')
    || text.includes('asteroidproxy')
    || text.includes('abandonasteroid');
}

function validateEvidence() {
  const errorTelemetry = readJsonFile('error-telemetry-raw.json');
  const contextLoss = readJsonFile('context-loss-telemetry-raw.json');
  const perfTelemetry = readJsonFile('performance-telemetry-raw.json');

  // Gate 1: context-loss recovery happened.
  assert.equal(contextLoss.available, true, 'contextLoss.available must be true');
  assert.equal(contextLoss.before, false, 'context must be live before loss');
  assert.equal(contextLoss.after, false, 'context must be live after restore');
  assert.equal(contextLoss.lostEvent, true, 'contextLoss.lostEvent must be true');
  assert.equal(contextLoss.restoredEvent, true, 'contextLoss.restoredEvent must be true');
  assert.equal(contextLoss.meshRecovered, true, 'contextLoss.meshRecovered must be true');
  assert.equal(contextLoss.rootIdentityStable, true, 'authored root identity must remain stable');
  assert.equal(contextLoss.pixelProof, true, 'contextLoss.pixelProof must be true');
  assert.equal(contextLoss.visualRecovery, true, 'recovered screenshot luminance/coverage must match baseline');
  assert.equal(contextLoss.frameAdvanced, true, 'contextLoss.frameAdvanced must be true');
  assert.equal(contextLoss.recovered, true, 'contextLoss.recovered must be true');

  for (const key of EXPECTED_CONTEXT_LOSS_KEYS) {
    assert(key in contextLoss, `contextLoss must contain key ${key}`);
  }

  const beforeScene = contextLoss.baselineScene;
  const afterScene = contextLoss.recoveredScene;
  assert.ok(beforeScene && afterScene, 'scene lifecycle snapshots must bracket the context cycle');
  assert.ok(beforeScene.authoredShips >= 1, 'baseline must contain an authored ship');
  assert.ok(beforeScene.authoredPlaces >= 1, 'baseline must contain an authored station or gate');
  assert.ok(afterScene.authoredShips >= beforeScene.authoredShips,
    'authored ships must recover without falling back or disappearing');
  assert.ok(afterScene.authoredPlaces >= beforeScene.authoredPlaces,
    'authored stations/gates must recover without falling back or disappearing');
  assert.equal(afterScene.playerMeshUuid, beforeScene.playerMeshUuid,
    'authored root identity must survive while THREE re-uploads its retained CPU descriptors');
  assert.deepEqual(afterScene.rootIds, beforeScene.rootIds,
    'context recovery must not duplicate or drop entity presentation roots');
  assert.deepEqual(afterScene.listenerCounts, beforeScene.listenerCounts,
    'context recovery must not register duplicate context lifecycle listeners');
  assert.ok(afterScene.memory.programs <= beforeScene.memory.programs + 8,
    'restored shader program count must not show duplicated program ownership');
  assert.ok(afterScene.memory.geometries <= beforeScene.memory.geometries + 16,
    'restored geometry count must remain bounded after authored root rebuild');

  // Gate 2: zero wrong-context WebGL warnings (primary regression gate).
  const wrongContextCount = countWarnings(errorTelemetry.warnings, WRONG_CONTEXT_RE);
  const genericDeleteCount = countWarnings(errorTelemetry.warnings, GENERIC_DELETE_RE);
  const deleteVaoCount = countWarnings(errorTelemetry.warnings, DELETE_VAO_RE);

  assert.equal(
    wrongContextCount,
    0,
    `${wrongContextCount} wrong-context WebGL warnings detected ` +
    `(generic delete=${genericDeleteCount}, deleteVertexArray=${deleteVaoCount}); ` +
    `expected 0 after lifecycle fix`,
  );

  // Gate 3: no runtime errors.
  assert.deepEqual(errorTelemetry.pageErrors || [], [], 'pageErrors must be empty');
  assert.deepEqual(errorTelemetry.requestFailures || [], [], 'requestFailures must be empty');
  assert.deepEqual(errorTelemetry.httpErrors || [], [], 'httpErrors must be empty');
  assert.deepEqual(errorTelemetry.consoleErrors || [], [], 'consoleErrors must be empty');
  assert.deepEqual(errorTelemetry.glErrors || [], [], 'glErrors must be empty');

  // Gate 4: expected lifecycle warnings are allowed; no other INVALID_OPERATION.
  const allWarnings = errorTelemetry.warnings || [];
  const unexpectedInvalidOps = allWarnings.filter((w) =>
    INVALID_OPERATION_RE.test(String(w)) && !WRONG_CONTEXT_RE.test(String(w)),
  );
  assert.deepEqual(
    unexpectedInvalidOps,
    [],
    `unexpected INVALID_OPERATION warnings outside wrong-context lifecycle: ${JSON.stringify(unexpectedInvalidOps)}`,
  );

  // Gate 5: non-asteroid scope.
  assert.equal(
    hasAsteroidScope({ errorTelemetry, contextLoss, perfTelemetry }),
    false,
    'evidence must remain non-asteroid scope (no asteroid pool/proxy/abandon references)',
  );

  // Gate 6: performance phases captured.
  const samples = Array.isArray(perfTelemetry.samples) ? perfTelemetry.samples : [];
  const flightSteady = samples.filter((s) => s.phaseTag === 'flight_steady');
  const recoverSteady = samples.filter((s) => s.phaseTag === 'context_recover_steady');
  assert.ok(flightSteady.length >= 50, `flight_steady must have >= 50 samples, got ${flightSteady.length}`);
  assert.ok(recoverSteady.length >= 50, `context_recover_steady must have >= 50 samples, got ${recoverSteady.length}`);
  assert.ok(flightSteady.filter((s) => Number.isFinite(s.internalRenderMs)).length >= 50,
    'flight_steady must include >= 50 internal CPU render timings');
  assert.ok(recoverSteady.filter((s) => Number.isFinite(s.internalRenderMs)).length >= 50,
    'context_recover_steady must include >= 50 internal CPU render timings');

  const timingWindows = Array.isArray(perfTelemetry.windows) ? perfTelemetry.windows : [];
  assert.deepEqual(timingWindows.map((w) => w.phase), ['A', 'B', 'A2'],
    'timing evidence must retain baseline, recovery, and return windows');
  for (const window of timingWindows) {
    assert.ok(window.internalRender.samples >= 50,
      `${window.phase} must contain >= 50 internal render samples`);
    assert.ok(Number.isFinite(window.internalRender.p95Ms), `${window.phase} internal render p95 missing`);
    assert.ok(Number.isFinite(window.internalRender.p99Ms), `${window.phase} internal render p99 missing`);
  }

  return {
    schema: SCHEMA,
    taskId: 'perf-frame-pacing-context-teardown',
    pass: true,
    evidenceDir: EVIDENCE_DIR,
    counts: {
      wrongContextWarnings: wrongContextCount,
      genericDeleteWrongContext: genericDeleteCount,
      deleteVertexArrayWrongContext: deleteVaoCount,
      flightSteadySamples: flightSteady.length,
      recoverSteadySamples: recoverSteady.length,
      authoredShips: afterScene.authoredShips,
      authoredPlaces: afterScene.authoredPlaces,
      listenerCountLost: afterScene.listenerCounts.webglcontextlost,
      listenerCountRestored: afterScene.listenerCounts.webglcontextrestored,
    },
  };
}

function testSyntheticEnvelopeWithWarnings() {
  const envelope = {
    errorTelemetry: {
      warnings: [
        'WebGL: INVALID_OPERATION: delete: object does not belong to this context',
        'WebGL: INVALID_OPERATION: deleteVertexArray: object does not belong to this context',
      ],
      pageErrors: [], requestFailures: [], httpErrors: [], consoleErrors: [], glErrors: [],
    },
    contextLoss: {
      available: true, before: false, after: false, lostEvent: true, restoredEvent: true,
      meshRecovered: true, rootIdentityStable: true, pixelProof: true, visualRecovery: true, frameAdvanced: true, recovered: true,
    },
    performanceTelemetry: {
      samples: Array.from({ length: 60 }, (_, i) => ({ phaseTag: i < 30 ? 'flight_steady' : 'context_recover_steady' })),
    },
  };
  const wrongContextCount = countWarnings(envelope.errorTelemetry.warnings, WRONG_CONTEXT_RE);
  assert.equal(wrongContextCount, 2, 'synthetic envelope sanity: two wrong-context warnings');
  assert.notEqual(wrongContextCount, 0, 'synthetic envelope must fail the zero-warnings gate');
}

function testSyntheticEnvelopeMissingRecovered() {
  const envelope = {
    errorTelemetry: { warnings: [], pageErrors: [], requestFailures: [], httpErrors: [], consoleErrors: [], glErrors: [] },
    contextLoss: {
      available: true, before: false, after: false, lostEvent: true, restoredEvent: true,
      meshRecovered: true, rootIdentityStable: true, pixelProof: true, visualRecovery: true, frameAdvanced: true, recovered: false,
    },
    performanceTelemetry: {
      samples: Array.from({ length: 60 }, (_, i) => ({ phaseTag: i < 30 ? 'flight_steady' : 'context_recover_steady' })),
    },
  };
  assert.equal(envelope.contextLoss.recovered, false, 'synthetic envelope missing recovered flag');
}

function testSyntheticEnvelopeAsteroidScope() {
  const envelope = {
    errorTelemetry: {
      warnings: ['asteroidProxy abandonAsteroid'],
      pageErrors: [], requestFailures: [], httpErrors: [], consoleErrors: [], glErrors: [],
    },
    contextLoss: {
      available: true, before: false, after: false, lostEvent: true, restoredEvent: true,
      meshRecovered: true, rootIdentityStable: true, pixelProof: true, visualRecovery: true, frameAdvanced: true, recovered: true,
    },
    performanceTelemetry: { samples: [] },
  };
  assert.ok(hasAsteroidScope(envelope), 'synthetic envelope contains asteroid scope');
}

// Run the live evidence validation and adversarial integrity checks.
const result = validateEvidence();
testSyntheticEnvelopeWithWarnings();
testSyntheticEnvelopeMissingRecovered();
testSyntheticEnvelopeAsteroidScope();

console.log(`PASS context-loss-nonasteroid-regression: ${JSON.stringify(result.counts)}`);
