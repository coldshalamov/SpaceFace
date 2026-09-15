import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { summarizeFrameSamples } from '../scripts/lib/performanceClosureContracts.mjs';
import {
  PQ022_H3_ADMISSION_TIMEOUT_FLOOR_MS,
  PQ022_H3_BUDGETS,
  PQ022_H3_CYCLES,
  PQ022_H3_IDENTITIES,
  PQ022_H3_IDENTITY_KEYS,
  PQ022_H3_PIPELINE_SETTLE_TIMEOUT_MS,
  PQ022_H3_PROBE_FAILURE_CLASSES,
  PQ022_H3_RECEIPT_SCHEMA,
  PQ022_H3_RESULT_CLASSES,
  PQ022_H3_VIEWPORT,
  classifyPq022H3ProbeFailure,
  evaluatePq022H3CleanupBand,
  pq022H3ExpectedWindows,
  pq022H3HitchAttribution,
  pq022H3WindowId,
  validatePq022H3IncompleteReceipt,
  validatePq022H3PerformanceReceipt,
} from '../scripts/lib/pq022CorridorH3Performance.mjs';
import { PQ022_H3_ADMISSION_CEILING_MS, PQ022_H3_ROUTE_DECLARATION } from '../scripts/lib/pq022CorridorH3Route.mjs';
import { loadValidationManifestById } from '../scripts/lib/validationManifestRegistry.mjs';
import manifest from '../scripts/validation-manifests/pq022-h3-performance.mjs';

const ROOT = new URL('../', import.meta.url);
const CAPTURE_SOURCE = readFileSync(new URL('../scripts/capture-pq022-h3-performance.mjs', import.meta.url), 'utf8');
const ROUTE_SOURCE = readFileSync(new URL('../scripts/lib/pq022CorridorH3Route.mjs', import.meta.url), 'utf8');

const VIDEO = Object.freeze({
  bloom: true,
  bloomStrength: 0.35,
  shadows: false,
  particleQuality: 'medium',
  renderScale: 0.85,
  dynamicResolution: false,
});

function samples(frameMs, count = 300) {
  return Array.from({ length: count }, (_, index) => ({
    atMs: index * frameMs,
    frameMs,
    phaseTag: 'flight_steady',
    tick: 1200 + index,
    mode: 'flight',
    timeScale: 1,
    docked: false,
    jumpState: 'IDLE',
    playerControlExposed: true,
    visibility: 'visible',
    stepsThisFrame: 1,
    shedBacklog: false,
    shedSteps: 0,
  }));
}

function rebind(row) {
  const summary = summarizeFrameSamples(row.rawSamples);
  row.attribution.frameMs = {
    sampleCount: summary.sampleCount,
    p50: summary.p50,
    p95: summary.p95,
    p99: summary.p99,
    max: summary.max,
    hitchesOver32Ms: summary.framesAbove32Ms,
  };
  return row;
}

function frame(kind, identityKey) {
  return {
    playerImpacts: 12,
    identitiesInFrame: kind === 'target' ? [identityKey] : [],
    identitiesFramedNotDrawn: [],
    subject: kind === 'target' ? {
      inFrame: true,
      drawn: true,
      submit: { ownerDecision: true, rootVisible: true, clauses: ['on-activity-glass'] },
      admission: 'ready',
      assetState: 'authored',
      releaseBound: true,
      fallbackRetained: false,
      lodLevel: 'lod0',
    } : null,
  };
}

function windowRow({ windowId, cycle, sectorId, kind, identityKey }) {
  const frameMs = kind === 'target' ? 16.8 : 16.7;
  return rebind({
    windowId,
    rawSamples: samples(frameMs),
    attribution: {
      cpu: {
        phases: { sim: { p95: 3.1 }, render: { p95: 4.8 }, vfx: { p95: 0.7 }, ui: { p95: 0.4 } },
        systems: { traffic: { p95: 0.3 } },
      },
      draw: { calls: 60, triangles: 210_000, geometries: 300, textures: 200, programs: 110 },
      pipeline: { warmup: { pass: true, timedOut: false } },
      settings: {
        start: { video: { ...VIDEO }, dynResScale: 1, timeScale: 1 },
        end: { video: { ...VIDEO }, dynResScale: 1, timeScale: 1 },
      },
      gpuTimers: {
        available: true,
        enabled: true,
        captureValid: true,
        lastDisjoint: false,
        drain: { drained: true, timedOut: false, pending: 0 },
        queryCounts: { completed: 450 },
        passes: {
          bloomScene: { max: 8 },
          bloomDownsample: { max: 0.8 },
          bloomUpsample: { max: 0 },
          bloomComposite: { max: 1.2 },
        },
      },
      measurementIsolation: {
        frameTimingGpuTimersEnabled: false,
        gpuAttributionSeparated: true,
        gpuAttributionFrameCount: 150,
        gpuAttributionDurationMs: 2_500,
        settingsStable: true,
        routeStable: true,
      },
      memory: { comparableState: { pass: true } },
    },
    routeFacts: {
      windowId,
      cycle,
      sectorId,
      kind,
      identityKey,
      recordedSeed: 47,
      mode: 'flight',
      docked: false,
      cameraZoom: 144,
      frame: { start: frame(kind, identityKey), end: frame(kind, identityKey) },
    },
  });
}

function snapshot(cycle, label, overrides = {}) {
  return {
    label,
    cycle,
    geometries: 320,
    textures: 210,
    programs: 118,
    residentAssets: 45,
    residentResources: 2_100,
    gpuResidentBytes: 900_000_000,
    cpuPackageBytes: 330_000_000,
    pendingRequests: 0,
    heapUsedBytes: 1_200_000_000,
    entityCount: 90,
    ...overrides,
  };
}

function receipt() {
  const expected = pq022H3ExpectedWindows();
  const identityFacts = [];
  for (const identity of PQ022_H3_IDENTITIES) {
    for (let cycle = 1; cycle <= PQ022_H3_CYCLES; cycle += 1) {
      identityFacts.push({
        key: identity.key,
        cycle,
        sectorId: identity.sectorId,
        admission: {
          ready: true,
          assetState: 'authored',
          fallbackRetained: false,
          releaseBound: true,
          path: cycle === 1 ? 'natural' : 'already-admitted',
          approachToReadyMs: cycle === 1 ? 1_800 : 0,
        },
        resources: {
          presentation: 'root-meshes',
          drawn: true,
          authored: { meshes: 12, groups: 16, triangles: 48_000, vertices: 30_000, geometries: 12, materials: 5, textures: 0, programs: 5 },
          visibleMeshes: 12,
          drawGroups: 16,
          triangles: 48_000,
          vertices: 30_000,
          geometries: 12,
          materials: 5,
          textures: 0,
          programs: 5,
          residency: { resident: true, gpuResidentBytes: 30_000_000, cpuPackageBytes: 6_000_000 },
        },
        lod: {
          order: ['default', 'close', 'far', 'distant'],
          framings: { close: { level: 'lod0' }, default: { level: 'lod0' }, far: { level: 'lod1' } },
        },
      });
    }
  }
  const snapshots = [];
  const cycleEnds = [];
  for (let cycle = 1; cycle <= PQ022_H3_CYCLES; cycle += 1) {
    snapshots.push(snapshot(cycle, `c${cycle}:mid`, { textures: 240, gpuResidentBytes: 1_000_000_000 }));
    const end = snapshot(cycle, `c${cycle}:cycle-end`);
    snapshots.push(end);
    cycleEnds.push({ cycle, snapshot: end });
  }
  return {
    schema: PQ022_H3_RECEIPT_SCHEMA,
    disposition: 'MEASURED',
    fixedSeed: 47,
    viewport: { ...PQ022_H3_VIEWPORT },
    runtime: 'browser-chromium-headed',
    gpu: { available: true, renderer: 'ANGLE (Intel, Intel(R) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    qualityPreserving: {
      settingsOverridesApplied: false,
      defaultQualityRetained: true,
      performanceImprovementClaimed: false,
      absoluteTargetClaimed: false,
      absoluteBudgetWaiverGranted: false,
      cullingOrLodOverridesApplied: false,
    },
    broker: { primaryAcceptance: true, diagnostic: false, claimId: '1234-abcdef' },
    route: {
      cycleCount: 3,
      singleContext: true,
      declaredRoute: PQ022_H3_ROUTE_DECLARATION.declaredRoute,
      compressions: PQ022_H3_ROUTE_DECLARATION.compressions,
      retainedEvidenceReferences: PQ022_H3_ROUTE_DECLARATION.retainedEvidenceReferences,
      discardedWindows: [],
      admissionTimeouts: [],
      fixtureLosses: [],
      bootAttempts: [{ attempt: 1, ok: true }],
      relayIdPolicy: 'clean',
      fixtures: [1, 2, 3].map((cycle) => ({
        cycle,
        kind: 'relay-collar',
        relayId: 900 + cycle,
        relayKey: `d:${900 + cycle}`,
        policy: 'clean',
        reused: false,
        collided: [],
        ownership: { id: 900 + cycle, clean: true, otherHolders: [] },
      })),
    },
    identities: PQ022_H3_IDENTITIES.map((identity) => ({
      key: identity.key,
      assetId: identity.assetId,
      manifestId: identity.manifestId,
      live: {
        releaseSha256: identity.acceptedReleaseSha256,
        onDiskReleaseSha256: identity.acceptedReleaseSha256,
        sourceBytes: 1_000,
        releaseBytes: 800,
      },
      renderPackage: { contentHash: 'a'.repeat(64), renderBytes: 900, sourceGlbSha256: identity.acceptedReleaseSha256 },
    })),
    windows: expected.map((row) => windowRow(row)),
    identityFacts,
    resources: { snapshots, cycleEnds },
    hostLoad: {
      available: true,
      windows: Object.fromEntries(expected.map((row) => [row.windowId, {
        sampleCount: 3,
        foreignCores: 0.6,
        foreignBrowserCores: 0,
        maxForeignBrowserProcessCores: 0,
      }])),
      admissions: Object.fromEntries(identityFacts.map((row) => [
        `admission:${pq022H3WindowId({ cycle: row.cycle, sectorId: row.sectorId, kind: 'target', identityKey: row.key })}`,
        { sampleCount: 3, foreignCores: 0.6, foreignBrowserCores: 0, maxForeignBrowserProcessCores: 0 },
      ])),
    },
    pageIssues: [],
    cleanup: { browserClosed: true, serverClosed: true, hostSamplerStopped: true },
  };
}

function findWindow(value, query) {
  return value.windows.find((row) => row.windowId === pq022H3WindowId(query));
}

const TRADE_HUB = { sectorId: 'sector_helios_prime', kind: 'target', identityKey: 'station-trade-hub' };

test('PQ-022 H3 declares 51 windows over the eleven accepted identities in three cycles', () => {
  const expected = pq022H3ExpectedWindows();
  assert.equal(expected.length, 51);
  assert.equal(PQ022_H3_IDENTITY_KEYS.length, 11);
  assert.equal(expected[0].windowId, 'c1:sector_helios_prime:floor-in');
  assert.equal(expected[9].windowId, 'c1:sector_helios_prime:floor-out');
  assert.equal(expected.at(-1).windowId, 'c3:sector_tethys_junction:floor-out');
  assert.equal(PQ022_H3_BUDGETS.matchedP95ToleranceMs, 0.8);
  assert.equal(PQ022_H3_BUDGETS.maxProductAttributedFramesAbove50Ms, 0);
  assert.equal(PQ022_H3_PIPELINE_SETTLE_TIMEOUT_MS, 30_000);
});

test('PQ-022 H3 accepts a complete brokered matched receipt', () => {
  const result = validatePq022H3PerformanceReceipt(receipt());
  assert.equal(result.resultClass, PQ022_H3_RESULT_CLASSES.PASS, result.failures.join('\n'));
  assert.equal(result.pass, true);
  assert.equal(result.matched.length, 11);
  for (const row of result.matched) assert.ok(Math.abs(row.medianDeltaP95Ms - 0.1) < 1e-6, row.key);
  assert.equal(result.cleanup.pass, true);
});

test('PQ-022 H3 keeps valid diagnostic evidence non-promoting', () => {
  const value = receipt();
  value.broker = { primaryAcceptance: false, diagnostic: true, claimId: null };
  const result = validatePq022H3PerformanceReceipt(value);
  assert.equal(result.resultClass, PQ022_H3_RESULT_CLASSES.DIAGNOSTIC_PASS);
  assert.equal(result.evidencePass, true);
  assert.equal(result.budgetPass, true);
  assert.equal(result.pass, false);
  assert.match(result.acceptanceFailures.join('\n'), /primary broker acceptance/);
});

test('PQ-022 H3 fails closed on missing windows, thin intervals, or covered flight', () => {
  const missing = receipt();
  missing.windows = missing.windows.filter((row) => row.windowId !== 'c2:sector_ceres_belt:target:station-mining');
  let result = validatePq022H3PerformanceReceipt(missing);
  assert.equal(result.resultClass, PQ022_H3_RESULT_CLASSES.EVIDENCE_INVALID);
  assert.match(result.failures.join('\n'), /missing window c2:sector_ceres_belt:target:station-mining/);

  const thin = receipt();
  const row = findWindow(thin, { cycle: 1, ...TRADE_HUB });
  row.rawSamples = samples(16.8, 40);
  rebind(row);
  assert.match(validatePq022H3PerformanceReceipt(thin).failures.join('\n'), /at least 120 raw frame intervals/);

  const covered = receipt();
  findWindow(covered, { cycle: 2, sectorId: 'sector_tethys_junction', kind: 'floor-in' }).rawSamples[7].visibility = 'hidden';
  assert.match(validatePq022H3PerformanceReceipt(covered).failures.join('\n'), /left visible controllable flight/);
});

test('PQ-022 H3 floors must hold no accepted identity in frame and targets must frame their admitted subject', () => {
  const value = receipt();
  findWindow(value, { cycle: 1, sectorId: 'sector_helios_prime', kind: 'floor-out' })
    .routeFacts.frame.end.identitiesInFrame = ['traffic-lark'];
  const target = findWindow(value, { cycle: 3, sectorId: 'sector_tethys_junction', kind: 'target', identityKey: 'nav-buoy' });
  target.routeFacts.frame.start.subject = { ...target.routeFacts.frame.start.subject, inFrame: false };
  target.routeFacts.frame.end.subject = { ...target.routeFacts.frame.end.subject, fallbackRetained: true };
  const failures = validatePq022H3PerformanceReceipt(value).failures.join('\n');
  assert.match(failures, /floor end has accepted identities in frame: traffic-lark/);
  assert.match(failures, /start subject is not in frame/);
  assert.match(failures, /end subject is not the admitted authored release/);
});

test('PQ-022 H3 reports an admitted, framed, unsubmitted identity as a product defect, never as drawn', () => {
  const refused = { ownerDecision: false, rootVisible: false, clauses: ['activity-frame-complete-id-not-named'] };
  const value = receipt();
  for (let cycle = 1; cycle <= PQ022_H3_CYCLES; cycle += 1) {
    const target = findWindow(value, { cycle, sectorId: 'sector_helios_prime', kind: 'target', identityKey: 'station-billboard' });
    for (const phase of ['start', 'end']) {
      target.routeFacts.frame[phase].identitiesInFrame = [];
      target.routeFacts.frame[phase].identitiesFramedNotDrawn = ['station-billboard'];
      target.routeFacts.frame[phase].subject = { ...target.routeFacts.frame[phase].subject, drawn: false, submit: refused };
    }
    const facts = value.identityFacts.find((row) => row.key === 'station-billboard' && row.cycle === cycle);
    facts.resources = {
      ...facts.resources, presentation: 'not-submitted', drawn: false, submit: refused, visibleMeshes: 0, drawGroups: 0, triangles: 0,
    };
  }
  const result = validatePq022H3PerformanceReceipt(value);
  assert.equal(result.evidencePass, true, result.failures.join('\n'));
  assert.equal(result.resultClass, PQ022_H3_RESULT_CLASSES.PRODUCT_DEFECT);
  assert.equal(result.pass, false);
  assert.deepEqual(result.productDefectIdentities, ['station-billboard']);
  assert.equal(result.productFindings.length, PQ022_H3_CYCLES * 2);
  assert.equal(result.matched.find((row) => row.key === 'station-billboard').drawnInAllTargets, false);
  assert.equal(result.matched.find((row) => row.key === 'station-trade-hub').drawnInAllTargets, true);

  const unexplained = receipt();
  const buoy = findWindow(unexplained, { cycle: 2, sectorId: 'sector_tethys_junction', kind: 'target', identityKey: 'nav-buoy' });
  buoy.routeFacts.frame.end.subject = { ...buoy.routeFacts.frame.end.subject, drawn: false };
  const buoyFacts = unexplained.identityFacts.find((row) => row.key === 'nav-buoy' && row.cycle === 2);
  buoyFacts.resources = { ...buoyFacts.resources, presentation: 'not-submitted', visibleMeshes: 0, drawGroups: 0, triangles: 0 };
  const invalid = validatePq022H3PerformanceReceipt(unexplained);
  assert.equal(invalid.resultClass, PQ022_H3_RESULT_CLASSES.EVIDENCE_INVALID);
  const failures = invalid.failures.join('\n');
  assert.match(failures, /c2:sector_tethys_junction:target:nav-buoy end subject is not drawn and the renderer submit decision does not explain it/);
  assert.match(failures, /nav-buoy@c2 is not submitted but the renderer submit decision does not refuse it/);
});

test('PQ-022 H3 records an admission timeout per identity and cycle without voiding the cell', () => {
  assert.equal(PQ022_H3_ADMISSION_TIMEOUT_FLOOR_MS, PQ022_H3_ADMISSION_CEILING_MS);
  const windowId = 'c2:sector_helios_prime:target:relay-collar';
  const lastState = { exists: true, ready: false, admission: 'pending', rawAssetState: null };
  const withTimeout = (value, timedOutAfterMs) => {
    value.windows = value.windows.filter((row) => row.windowId !== windowId);
    const facts = value.identityFacts.find((row) => row.key === 'relay-collar' && row.cycle === 2);
    facts.admission = {
      ready: false,
      assetState: null,
      path: 'timeout',
      approachToReadyMs: null,
      timedOutAfterMs,
      ceilingMs: 180_000,
      explicitRequestAccepted: true,
      lastState,
    };
    facts.resources = {};
    facts.lod = null;
    value.route.admissionTimeouts = [{ windowId, identityKey: 'relay-collar', cycle: 2, timedOutAfterMs, ceilingMs: 180_000, lastState }];
    return value;
  };

  const result = validatePq022H3PerformanceReceipt(withTimeout(receipt(), 181_234));
  assert.equal(result.evidencePass, true, result.failures.join('\n'));
  assert.equal(result.resultClass, PQ022_H3_RESULT_CLASSES.BUDGET_FAIL);
  assert.match(result.failures.join('\n'),
    /relay-collar@c2 did not admit its authored release within 181234 ms \(admission timeout; no target window measured\)/);
  assert.deepEqual(result.admissionTimeouts, [windowId]);
  assert.equal(result.matched.find((row) => row.key === 'relay-collar').pass, false);
  assert.deepEqual(result.productFindings.map((row) => [row.windowId, row.finding]), [[windowId, 'admission-timeout-on-quiet-host']]);

  const contended = withTimeout(receipt(), 181_234);
  contended.hostLoad.admissions[`admission:${windowId}`] = {
    sampleCount: 90, foreignCores: 9.5, foreignBrowserCores: 8.0, maxForeignBrowserProcessCores: 8.0,
  };
  const inconclusive = validatePq022H3PerformanceReceipt(contended);
  assert.equal(inconclusive.evidencePass, true, inconclusive.failures.join('\n'));
  assert.equal(inconclusive.resultClass, PQ022_H3_RESULT_CLASSES.HOST_CONTENDED);
  assert.deepEqual(inconclusive.productFindings, []);
  assert.ok(inconclusive.hostLoad.contendedWindowIds.includes(`admission:${windowId}`));

  const slow = receipt();
  const slowFacts = slow.identityFacts.find((row) => row.key === 'station-trade-hub' && row.cycle === 1);
  slowFacts.admission.approachToReadyMs = PQ022_H3_BUDGETS.maxApproachAdmissionMs + 1;
  slow.hostLoad.admissions['admission:c1:sector_helios_prime:target:station-trade-hub'] = {
    sampleCount: 20, foreignCores: 2.6, foreignBrowserCores: 0, maxForeignBrowserProcessCores: 0,
  };
  assert.equal(validatePq022H3PerformanceReceipt(slow).resultClass, PQ022_H3_RESULT_CLASSES.HOST_CONTENDED);

  const unrecorded = receipt();
  unrecorded.windows = unrecorded.windows.filter((row) => row.windowId !== windowId);
  assert.match(validatePq022H3PerformanceReceipt(unrecorded).failures.join('\n'),
    /missing window c2:sector_helios_prime:target:relay-collar/);

  const early = validatePq022H3PerformanceReceipt(withTimeout(receipt(), 20_000)).failures.join('\n');
  assert.match(early, /admission timeout c2:sector_helios_prime:target:relay-collar was recorded before the 180000 ms ceiling/);
  assert.match(early, /relay-collar@c2 admission timeout was recorded before the 180000 ms ceiling/);

  const lost = withTimeout(receipt(), 181_234);
  lost.route.admissionTimeouts[0].lastState = { exists: false };
  assert.match(validatePq022H3PerformanceReceipt(lost).failures.join('\n'),
    /lost its subject; that is a probe failure, not a timeout/);
});

test('PQ-022 H3 bounds traffic fixture re-issues and retries only transient module boot failures', () => {
  const lost = receipt();
  lost.route.fixtureLosses = [{
    windowId: 'c3:sector_helios_prime:target:traffic-lark',
    identityKey: 'traffic-lark',
    role: 'courier',
    cycle: 3,
    attempt: 1,
    entityId: 8115,
    intactReason: 'missing',
    destroyEvents: [{ id: 8115, reason: null }],
  }];
  lost.route.bootAttempts = [
    { attempt: 1, ok: false, transientModuleError: true, issues: [{ type: 'pageerror', text: "Unexpected identifier '_tickGooReapply'" }] },
    { attempt: 2, ok: true },
  ];
  const accepted = validatePq022H3PerformanceReceipt(lost);
  assert.equal(accepted.resultClass, PQ022_H3_RESULT_CLASSES.PASS, accepted.failures.join('\n'));
  assert.deepEqual(accepted.fixtureLosses, ['c3:sector_helios_prime:target:traffic-lark']);

  const invalid = receipt();
  invalid.route.fixtureLosses = [
    { windowId: 'c1:sector_ceres_belt:target:station-refinery', intactReason: 'missing' },
    { windowId: 'c2:sector_helios_prime:target:traffic-span', intactReason: '' },
    ...[1, 2, 3].map((attempt) => ({ windowId: 'c1:sector_helios_prime:target:traffic-cradle', attempt, intactReason: 'missing' })),
  ];
  invalid.route.bootAttempts = [{ attempt: 1, ok: false, transientModuleError: false }, { attempt: 2, ok: true }];
  const failures = validatePq022H3PerformanceReceipt(invalid).failures.join('\n');
  assert.match(failures, /fixture loss c1:sector_ceres_belt:target:station-refinery is not a fixture target window/);
  assert.match(failures, /fixture loss c2:sector_helios_prime:target:traffic-span must record why the fixture was no longer intact/);
  assert.match(failures, /fixture for c1:sector_helios_prime:target:traffic-cradle was lost 3 times/);
  assert.match(failures, /boot attempt 1 was retried without a transient module parse error/);

  const unbooted = receipt();
  unbooted.route.bootAttempts = [{ attempt: 1, ok: false, transientModuleError: true }];
  assert.match(validatePq022H3PerformanceReceipt(unbooted).failures.join('\n'), /must end with the successful boot the cell ran on/);
  delete unbooted.route.fixtureLosses;
  assert.match(validatePq022H3PerformanceReceipt(unbooted).failures.join('\n'), /route must record fixture losses/);
});

test('PQ-022 H3 measures the relay collar only on a collision-free presentation id', () => {
  const value = receipt();
  value.route.fixtures[1].collided = [{
    id: 308,
    phase: 'issue',
    attempt: 1,
    ownership: { id: 308, clean: false, otherHolders: ['far'], mesh: null },
  }];
  value.route.fixtureLosses = [{
    windowId: 'c2:sector_helios_prime:target:relay-collar',
    identityKey: 'relay-collar',
    role: 'relay',
    cycle: 2,
    attempt: 1,
    intactReason: 'id 902 also held by far; mesh under id 902 is wholeships/mule_production_v1.glb',
  }];
  const accepted = validatePq022H3PerformanceReceipt(value);
  assert.equal(accepted.evidencePass, true, accepted.failures.join('\n'));
  assert.equal(accepted.resultClass, PQ022_H3_RESULT_CLASSES.PRODUCT_DEFECT);
  assert.deepEqual(accepted.relayIdCollisions, [{ cycle: 2, id: 308, phase: 'issue', otherHolders: ['far'], meshBody: null }]);
  assert.deepEqual(accepted.relayDrawsByCycle.map((row) => [row.cycle, row.dropped, row.clean]), [[1, 0, true], [2, 1, true], [3, 0, true]]);
  assert.deepEqual(accepted.productFindings.map((row) => [row.windowId, row.finding, row.clauses]), [
    ['c2:sector_helios_prime:target:relay-collar', 'presentation-id-collision-at-issue', ['id 308 held by far']],
  ]);

  const collided = receipt();
  collided.route.relayIdPolicy = 'observe';
  collided.route.fixtures[0].relayId = 308;
  collided.route.fixtures[0].ownership = { id: 308, clean: false, otherHolders: ['far', 'live'], mesh: { body: 'foreign' } };
  collided.route.fixtures = collided.route.fixtures.filter((row) => row.cycle !== 3);
  const failures = validatePq022H3PerformanceReceipt(collided).failures.join('\n');
  assert.match(failures, /relay id policy observe is not the clean acceptance policy/);
  assert.match(failures, /cycle 1 relay collar was measured on presentation id 308 held by far\+live/);
  assert.match(failures, /cycle 3 relay collar fixture issuance is not recorded/);

  const timeout = receipt();
  const windowId = 'c1:sector_helios_prime:target:relay-collar';
  timeout.windows = timeout.windows.filter((row) => row.windowId !== windowId);
  const facts = timeout.identityFacts.find((row) => row.key === 'relay-collar' && row.cycle === 1);
  const lastState = { exists: true, ready: false, admission: 'pending', idOwnership: { id: 308, clean: false, otherHolders: ['far'] } };
  facts.admission = { ready: false, path: 'timeout', approachToReadyMs: null, timedOutAfterMs: 180_500, ceilingMs: 180_000, lastState };
  facts.resources = {};
  facts.lod = null;
  timeout.route.admissionTimeouts = [{ windowId, identityKey: 'relay-collar', cycle: 1, timedOutAfterMs: 180_500, ceilingMs: 180_000, lastState }];
  assert.match(validatePq022H3PerformanceReceipt(timeout).failures.join('\n'),
    /admission timeout c1:sector_helios_prime:target:relay-collar happened on presentation id 308 bound to another body/);
});

test('PQ-022 H3 rejects a window in which the player touched a collider', () => {
  const value = receipt();
  const target = findWindow(value, { cycle: 2, sectorId: 'sector_helios_prime', kind: 'target', identityKey: 'station-trade-hub' });
  target.routeFacts.frame.end = { ...target.routeFacts.frame.end, playerImpacts: 312 };
  const floor = findWindow(value, { cycle: 1, sectorId: 'sector_ceres_belt', kind: 'floor-in' });
  delete floor.routeFacts.frame.start.playerImpacts;
  const result = validatePq022H3PerformanceReceipt(value);
  assert.equal(result.resultClass, PQ022_H3_RESULT_CLASSES.EVIDENCE_INVALID);
  const failures = result.failures.join('\n');
  assert.match(failures, /c2:sector_helios_prime:target:station-trade-hub player collided 300 time\(s\) during measurement/);
  assert.match(failures, /c1:sector_ceres_belt:floor-in player impact census is missing/);

  const relocated = receipt();
  const buoy = findWindow(relocated, { cycle: 3, sectorId: 'sector_tethys_junction', kind: 'target', identityKey: 'nav-buoy' });
  buoy.routeFacts.frame.start = { ...buoy.routeFacts.frame.start, player: { x: 11_368, z: 7_500 } };
  buoy.routeFacts.frame.end = { ...buoy.routeFacts.frame.end, player: { x: -2_499_681, z: 7_500 } };
  assert.match(validatePq022H3PerformanceReceipt(relocated).failures.join('\n'),
    /c3:sector_tethys_junction:target:nav-buoy player moved \d+ WU during measurement/);

  const retried = receipt();
  retried.route.discardedWindows = [
    { windowId: 'c1:sector_ceres_belt:target:station-refinery', attempt: 1, reason: 'player-impacts-during-window', impactsDuring: 12 },
  ];
  assert.equal(validatePq022H3PerformanceReceipt(retried).resultClass, PQ022_H3_RESULT_CLASSES.PASS);
  retried.route.discardedWindows.push(
    { windowId: 'c1:sector_ceres_belt:target:station-refinery', attempt: 2, reason: 'slow-window', impactsDuring: 0 },
    { windowId: 'c1:sector_ceres_belt:target:station-refinery', attempt: 3, reason: 'player-impacts-during-window', impactsDuring: 4 },
  );
  const retryFailures = validatePq022H3PerformanceReceipt(retried).failures.join('\n');
  assert.match(retryFailures, /discarded window c1:sector_ceres_belt:target:station-refinery was not discarded for player contact/);
  assert.match(retryFailures, /window c1:sector_ceres_belt:target:station-refinery was discarded 3 times/);
  delete retried.route.discardedWindows;
  assert.match(validatePq022H3PerformanceReceipt(retried).failures.join('\n'), /route must record discarded windows/);
});

test('PQ-022 H3 gates the median matched p95 delta, not one noisy cycle', () => {
  const outlier = receipt();
  const cycleTwo = findWindow(outlier, { cycle: 2, ...TRADE_HUB });
  cycleTwo.rawSamples = samples(18.4);
  rebind(cycleTwo);
  assert.equal(validatePq022H3PerformanceReceipt(outlier).resultClass, PQ022_H3_RESULT_CLASSES.PASS);

  const regressed = receipt();
  for (let cycle = 1; cycle <= 3; cycle += 1) {
    const row = findWindow(regressed, { cycle, ...TRADE_HUB });
    row.rawSamples = samples(18.4);
    rebind(row);
  }
  const result = validatePq022H3PerformanceReceipt(regressed);
  assert.equal(result.resultClass, PQ022_H3_RESULT_CLASSES.BUDGET_FAIL);
  assert.match(result.failures.join('\n'), /station-trade-hub target median p95 exceeds its matched floor/);
});

test('PQ-022 H3 rejects product-attributed long frames and backlog shedding in target windows', () => {
  const longFrame = receipt();
  const row = findWindow(longFrame, { cycle: 1, sectorId: 'sector_ceres_belt', kind: 'target', identityKey: 'station-refinery' });
  row.rawSamples[40].frameMs = 55;
  rebind(row);
  let failures = validatePq022H3PerformanceReceipt(longFrame).failures.join('\n');
  assert.match(failures, /station-refinery target windows contain 1 product-attributed frame\(s\) above 50 ms/);
  assert.match(failures, /product-attributed >32 ms hitches increase/);

  const backlog = receipt();
  const shed = findWindow(backlog, { cycle: 2, sectorId: 'sector_helios_prime', kind: 'target', identityKey: 'relay-collar' });
  shed.rawSamples[60].shedBacklog = true;
  rebind(shed);
  failures = validatePq022H3PerformanceReceipt(backlog).failures.join('\n');
  assert.match(failures, /relay-collar backlog shedding increases/);
});

test('PQ-022 H3 bounds externally scheduled hitches without laundering product work', () => {
  const external = (row) => {
    Object.assign(row.rawSamples[20], {
      frameMs: 33.4,
      callbackMs: 7,
      simFrameMs: 4,
      presentationMs: 2,
      externalCallbackGapMs: 25,
      callbackDispatchLagMs: 0.5,
      backlogCause: 'external-scheduling',
    });
    return rebind(row);
  };
  const bounded = receipt();
  for (const cycle of [1, 2]) external(findWindow(bounded, { cycle, ...TRADE_HUB }));
  let result = validatePq022H3PerformanceReceipt(bounded);
  assert.equal(result.resultClass, PQ022_H3_RESULT_CLASSES.PASS, result.failures.join('\n'));
  const attribution = pq022H3HitchAttribution(findWindow(bounded, { cycle: 1, ...TRADE_HUB }));
  assert.deepEqual(
    { raw: attribution.raw, external: attribution.externalScheduling, product: attribution.productAttributed },
    { raw: 1, external: 1, product: 0 },
  );

  const productWork = receipt();
  const heavy = external(findWindow(productWork, { cycle: 1, ...TRADE_HUB }));
  heavy.rawSamples[20].callbackMs = 21;
  result = validatePq022H3PerformanceReceipt(productWork);
  assert.match(result.failures.join('\n'), /station-trade-hub product-attributed >32 ms hitches increase/);

  const noisy = receipt();
  for (const cycle of [1, 2, 3]) external(findWindow(noisy, { cycle, ...TRADE_HUB }));
  result = validatePq022H3PerformanceReceipt(noisy);
  assert.match(result.failures.join('\n'), /externally scheduled hitches exceed the matched noise envelope/);
});

test('PQ-022 H3 attributes a budget miss inside foreign-contended windows instead of blaming the product', () => {
  const value = receipt();
  for (let cycle = 1; cycle <= 3; cycle += 1) {
    const row = findWindow(value, { cycle, ...TRADE_HUB });
    row.rawSamples = samples(18.4);
    rebind(row);
    value.hostLoad.windows[row.windowId] = {
      sampleCount: 3,
      foreignCores: 2.4,
      foreignBrowserCores: 1.3,
      maxForeignBrowserProcessCores: 0.9,
    };
  }
  const result = validatePq022H3PerformanceReceipt(value);
  assert.equal(result.resultClass, PQ022_H3_RESULT_CLASSES.HOST_CONTENDED);
  assert.equal(result.pass, false);
  assert.equal(result.hostLoad.contendedWindowIds.length, 3);
});

test('PQ-022 H3 gates admission, fallback, and close-to-far LOD detail order', () => {
  const value = receipt();
  const slow = value.identityFacts.find((row) => row.key === 'station-trade-hub' && row.cycle === 1);
  slow.admission.approachToReadyMs = PQ022_H3_BUDGETS.maxApproachAdmissionMs + 1;
  const fallback = value.identityFacts.find((row) => row.key === 'traffic-span' && row.cycle === 2);
  fallback.admission.fallbackRetained = true;
  const inverted = value.identityFacts.find((row) => row.key === 'station-billboard' && row.cycle === 3);
  inverted.lod.framings = { close: { level: 'lod2' }, default: { level: 'lod1' }, far: { level: 'lod0' } };
  const result = validatePq022H3PerformanceReceipt(value);
  assert.equal(result.resultClass, PQ022_H3_RESULT_CLASSES.BUDGET_FAIL);
  const failures = result.failures.join('\n');
  assert.match(failures, /station-trade-hub@c1 admission took/);
  assert.match(failures, /traffic-span@c2 did not admit the authored release without fallback/);
  assert.match(failures, /station-billboard@c3 LOD detail is not non-increasing close->default->far \(lod2\/lod1\/lod0\)/);
});

test('PQ-022 H3 cleanup band catches growth across repeated cycles and accepts release', () => {
  const grown = receipt();
  const cycleThree = grown.resources.cycleEnds.find((row) => row.cycle === 3).snapshot;
  cycleThree.textures = 240;
  cycleThree.gpuResidentBytes = 1_100_000_000;
  const cycleTwo = grown.resources.cycleEnds.find((row) => row.cycle === 2).snapshot;
  cycleTwo.pendingRequests = 1;
  let result = validatePq022H3PerformanceReceipt(grown);
  assert.equal(result.resultClass, PQ022_H3_RESULT_CLASSES.BUDGET_FAIL);
  let failures = result.failures.join('\n');
  assert.match(failures, /cycle 3 end vs cycle 1 end: textures 240 exceeds the 5% band/);
  assert.match(failures, /cycle 3 end vs cycle 1 end: gpuResidentBytes 1100000000 exceeds the 10% band/);
  assert.match(failures, /cycle 2 end leaves 1 pending residency request/);

  const released = receipt();
  released.resources.cycleEnds.find((row) => row.cycle === 3).snapshot.textures = 150;
  assert.equal(validatePq022H3PerformanceReceipt(released).resultClass, PQ022_H3_RESULT_CLASSES.PASS);

  const highWater = evaluatePq022H3CleanupBand({
    snapshots: [
      snapshot(2, 'c2:peak', { residentAssets: 50 }),
      snapshot(3, 'c3:peak', { residentAssets: 60 }),
    ],
    cycleEnds: [1, 2, 3].map((cycle) => ({ cycle, snapshot: snapshot(cycle, `c${cycle}:end`) })),
  });
  assert.equal(highWater.pass, false);
  assert.equal(highWater.overallHighWater.residentAssets, 60);
});

test('PQ-022 H3 refuses to measure a hash that is not the accepted identity', () => {
  const drifted = receipt();
  drifted.identities[0].live.releaseSha256 = 'b'.repeat(64);
  drifted.identities[0].live.onDiskReleaseSha256 = 'b'.repeat(64);
  const stalePackage = drifted.identities.find((row) => row.key === 'nav-buoy');
  stalePackage.renderPackage.sourceGlbSha256 = 'c'.repeat(64);
  const result = validatePq022H3PerformanceReceipt(drifted);
  assert.equal(result.resultClass, PQ022_H3_RESULT_CLASSES.EVIDENCE_INVALID);
  const failures = result.failures.join('\n');
  assert.match(failures, /station-trade-hub live release b{64} differs from accepted 9540c8fa/);
  assert.match(failures, /nav-buoy render package does not snapshot the live release/);
});

test('PQ-022 H3 rejects software GPU, quality or camera mutation, and render overrides', () => {
  const value = receipt();
  value.gpu.renderer = 'Google SwiftShader';
  value.qualityPreserving.cullingOrLodOverridesApplied = true;
  findWindow(value, { cycle: 1, ...TRADE_HUB }).attribution.settings.end.video.bloom = false;
  findWindow(value, { cycle: 2, sectorId: 'sector_ceres_belt', kind: 'floor-in' }).routeFacts.cameraZoom = 72;
  const failures = validatePq022H3PerformanceReceipt(value).failures.join('\n');
  assert.match(failures, /hardware GPU renderer/);
  assert.match(failures, /must not force culling, render flags, or LOD levels/);
  assert.match(failures, /settings changed during measurement/);
  assert.match(failures, /camera zoom differs from the first window/);
});

test('PQ-022 H3 classifies an interrupted Browser context without a product conclusion', () => {
  const classified = classifyPq022H3ProbeFailure(
    new Error('page.evaluate: Target page, context or browser has been closed'),
    { phase: 'c2:sector_ceres_belt:floor-in', completedWindowCount: 19 },
  );
  assert.equal(classified.failureClass, PQ022_H3_PROBE_FAILURE_CLASSES.BROWSER_CONTEXT_CLOSED);
  assert.equal(classified.productEvidenceValid, false);
  const validation = validatePq022H3IncompleteReceipt({
    schema: PQ022_H3_RECEIPT_SCHEMA,
    disposition: 'FAIL',
    ...classified,
    cleanup: { browserClosed: true, serverClosed: true },
  });
  assert.equal(validation.pass, false);
  assert.equal(validation.classificationPass, true);
  assert.equal(validation.evidenceStatus, 'INCOMPLETE_NO_PRODUCT_CONCLUSION');
  assert.match(validation.failures[0], /after 19 complete window\(s\)/);

  const ordinary = classifyPq022H3ProbeFailure(new Error('subject 42 did not admit'), { phase: 'c1:relay-collar:approach' });
  assert.equal(ordinary.failureClass, PQ022_H3_PROBE_FAILURE_CLASSES.PROBE_FAILURE);
  assert.equal(ordinary.retryableAfterRegression, false);
});

test('PQ-022 H3 is a one-use brokered cell over the accepted PQ-022 owner seams without H1 still overrides', () => {
  assert.equal(manifest.id, 'pq022-h3-performance');
  assert.equal(manifest.runtimeKind, 'browser');
  assert.equal(manifest.mode, 'acceptance');
  assert.deepEqual(manifest.commandArgs, ['scripts/capture-pq022-h3-performance.mjs']);
  assert.equal(manifest.runtimeProfile, 'target-desktop-default-quality');
  assert.equal(manifest.maxLaunchesPerCandidate, 1);
  assert.equal(manifest.requireFastReceipt, true);
  assert.equal(manifest.requireBrokerClaim, true);
  assert.equal(manifest.cleanupPolicy, 'kill-tree');
  assert.equal(manifest.fixedSeed, 47);
  assert.ok(manifest.timeoutMs >= 2_400_000, 'three cycles of 51 windows need a long broker timeout');
  assert.ok(manifest.fastGateCommands.includes('node --test test/pq022-h3-performance.test.mjs'));
  assert.ok(manifest.fastGateCommands.includes('npm run check:pq022:corridor-assets'));
  for (const identity of PQ022_H3_IDENTITIES) {
    assert.ok(manifest.productionSourcePaths.includes(
      `assets/ships/release/render-packages/${identity.renderPackage}/render-package.json`,
    ), `${identity.key} render package metadata must change the candidate digest`);
  }
  for (const pathName of ['scripts/lib/pq022CorridorH3Route.mjs', 'scripts/lib/pq022CorridorH3Performance.mjs', 'scripts/lib/releaseSoakProbe.mjs']) {
    assert.ok(manifest.harnessSourcePaths.includes(pathName), pathName);
  }

  const source = `${CAPTURE_SOURCE}\n${ROUTE_SOURCE}`;
  assert.match(ROUTE_SOURCE, /world\.enterSector\(/, 'travel must use the registered world owner');
  assert.match(ROUTE_SOURCE, /asteroidSites\._ensureBeacon\(site\)/, 'the relay must use the accepted asteroidSites owner seam');
  assert.match(ROUTE_SOURCE, /owner\._stampTrafficDurableIdentity\(/, 'traffic bodies must use the traffic owner seams');
  assert.match(CAPTURE_SOURCE, /enableGpuTimers: false/, 'frame timing must run with GPU timer queries off');
  assert.match(CAPTURE_SOURCE, /attachSeparatedGpuAttribution\(page, timing\)/);
  assert.match(CAPTURE_SOURCE, /phaseTag: kind === 'target' \? 'station_visible_steady' : 'flight_steady'/);
  assert.match(CAPTURE_SOURCE, /validatePq022H3IncompleteReceipt/);
  assert.match(CAPTURE_SOURCE, /diagnostic-only iteration flag/);
  assert.doesNotMatch(source, /\.frustumCulled\s*=\s*false/, 'H3 must not disable frustum culling');
  assert.doesNotMatch(source, /forceRender:\s*true|neverCull:\s*true/, 'H3 must not force render flags');
  assert.doesNotMatch(source, /userData\.updateLod\(/, 'H3 must not force LOD levels');
  assert.doesNotMatch(source, /camera\.lookAt\(|player\.targetId\s*=/, 'H3 must not rig the camera or lock a target');
});

test('the tracked registry resolves pq022-h3-performance', async () => {
  const registered = await loadValidationManifestById({ root: fileURLToPath(ROOT), id: 'pq022-h3-performance' });
  assert.equal(registered.id, manifest.id);
  assert.match(registered.__trackedManifest.relativePath, /pq022-h3-performance\.mjs$/);
});
