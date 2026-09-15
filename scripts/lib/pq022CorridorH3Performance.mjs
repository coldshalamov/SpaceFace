// PQ-022 H3 — matched corridor-asset performance, residency, LOD, and cleanup.
//
// One headed Browser context on fixed seed 47 runs three route cycles over the eleven accepted exact
// corridor identities (Helios -> Ceres -> Tethys -> Helios). Every sector visit samples an ordinary
// floor window on entry and on exit with no accepted identity drawn in frame, plus one target window
// per identity with that identity admitted and default-framed under the shipping chase camera.
//
// This module owns the receipt schema, the exact identity table, the budgets declared before any
// capture, the validator, and the failure classifier. Budgets follow the accepted PQ-020/PQ-024 H3
// precedent (0.8 ms matched p95/p99 tolerance, zero product-attributed >50 ms frames, no backlog
// increase, bounded external scheduling) and add the Phase 4 cleanup band for repeated route cycles.
// Default quality is never lowered to pass; the absolute 17.5 ms envelope is reported separately.

import { summarizeFrameSamples } from './performanceClosureContracts.mjs';

export const PQ022_H3_RECEIPT_SCHEMA = 'spaceface.pq022CorridorH3Performance.v1';
export const PQ022_H3_FIXED_SEED = 47;
export const PQ022_H3_CYCLES = 3;
export const PQ022_H3_PIPELINE_SETTLE_TIMEOUT_MS = 30_000;
export const PQ022_H3_MIN_RAW_INTERVALS = 120;
export const PQ022_H3_MIN_GPU_ATTRIBUTION_FRAMES = 150;
export const PQ022_H3_VIEWPORT = Object.freeze({ width: 1830, height: 973, deviceScaleFactor: 1 });
export const PQ022_H3_SECTOR_ORDER = Object.freeze([
  'sector_helios_prime',
  'sector_ceres_belt',
  'sector_tethys_junction',
]);
export const PQ022_H3_FLOOR_KINDS = Object.freeze(['floor-in', 'floor-out']);
export const PQ022_H3_TARGET_KIND = 'target';
export const PQ022_H3_LOD_FRAMINGS = Object.freeze(['close', 'default', 'far']);
export const PQ022_H3_LOD_LEVELS = Object.freeze(['lod0', 'lod1', 'lod2']);

const RECEIPTS = 'design/program/roadmap/receipts';
const EVIDENCE = 'design/program/roadmap/evidence/h1/row7-pq022-asset-leaves';

function identity(row) {
  return Object.freeze({
    ...row,
    subject: Object.freeze({ ...row.subject }),
    acceptance: Object.freeze({ ...row.acceptance }),
  });
}

// Exact accepted identities. `acceptedReleaseSha256` is the release byte identity bound by the named
// route evidence; the capture re-reads the live manifest, disk bytes, and render package and records
// any drift as a finding instead of silently measuring a different asset.
export const PQ022_H3_IDENTITIES = Object.freeze([
  identity({
    key: 'station-trade-hub', assetId: 'place_station_trade_hub', manifestId: 'place_station_trade_hub',
    slot: 'place', releaseFile: 'places/place_station_trade_hub.glb', renderPackage: 'helios-trade-hub',
    sectorId: 'sector_helios_prime',
    acceptedReleaseSha256: '9540c8fa263359ff3b78302a9d48080af17cb903f47d43361814ba3666f0754a',
    acceptance: { decision: 'KEEP', receipt: `${RECEIPTS}/PQ-022-corridor-assets-h2-disposition-REPORT.md`, evidence: `${EVIDENCE}/report.json` },
    subject: { kind: 'live', type: 'station', stationId: 'station_helios', archetypeGlb: 'place_station_trade_hub' },
  }),
  identity({
    key: 'station-military', assetId: 'place_station_military', manifestId: 'place_station_military',
    slot: 'place', releaseFile: 'places/place_station_military.glb', renderPackage: 'military',
    sectorId: 'sector_helios_prime',
    acceptedReleaseSha256: 'a92f5c2b53262defcbfea27b22ec07ce8d7798f856dbd8e3fc9b12475ea67806',
    acceptance: { decision: 'KEEP', receipt: `${RECEIPTS}/PQ-022-corridor-assets-h2-disposition-REPORT.md`, evidence: `${EVIDENCE}/report.json` },
    subject: { kind: 'live', type: 'station', stationId: 'station_coalition', archetypeGlb: 'place_station_military' },
  }),
  identity({
    key: 'gate-jump-ring', assetId: 'place_gate_jump_ring', manifestId: 'place_gate_jump_ring',
    slot: 'place', releaseFile: 'places/place_gate_jump_ring.glb', renderPackage: 'jump-ring',
    sectorId: 'sector_helios_prime',
    acceptedReleaseSha256: '01ccf2695678cb42c5b086308b7bea6dc366b029b4efc9e12393a10e8b209ead',
    acceptance: { decision: 'KEEP', receipt: `${RECEIPTS}/PQ-022-corridor-assets-h2-disposition-REPORT.md`, evidence: `${EVIDENCE}/report.json` },
    subject: { kind: 'live', type: 'station', isGate: true, archetypeGlb: 'place_gate_jump_ring' },
  }),
  identity({
    key: 'station-billboard', assetId: 'place_station_billboard', manifestId: 'place_station_billboard',
    slot: 'place', releaseFile: 'places/place_station_billboard.glb', renderPackage: 'station-billboard',
    sectorId: 'sector_helios_prime',
    acceptedReleaseSha256: 'f94ce276f99defb0aa770dd9cc0accd24e828d9b56ecb27d5ea0b3383699a293',
    acceptance: { decision: 'KEEP', receipt: `${RECEIPTS}/PQ-022-billboard-buoy-reauthor-REPORT.md`, evidence: `${EVIDENCE}/billboard-buoy-reauthor/browser/report.json` },
    subject: { kind: 'live', type: 'fx', placeId: 'place_station_billboard' },
  }),
  identity({
    key: 'relay-collar', assetId: 'place_claim_outpost_relay', manifestId: 'place_claim_outpost_relay',
    slot: 'place', releaseFile: 'places/place_claim_outpost_relay.glb', renderPackage: 'claim-outpost-relay',
    sectorId: 'sector_helios_prime',
    acceptedReleaseSha256: '85b8d74e7719203766937289b2ed5756294c4a9d48612c0432c6f036644167a8',
    acceptance: { decision: 'KEEP', receipt: `${RECEIPTS}/PQ-022-relay-reauthor-review-REPORT.md`, evidence: `${EVIDENCE}/relay-reauthor/browser/report.json` },
    subject: { kind: 'relay-fixture', type: 'fx', placeId: 'place_claim_outpost_relay' },
  }),
  identity({
    key: 'traffic-lark', assetId: 'helios_lark', manifestId: 'wholeship_helios_lark',
    slot: 'hull', releaseFile: 'wholeships/helios_lark.glb', renderPackage: 'helios-lark',
    sectorId: 'sector_helios_prime',
    acceptedReleaseSha256: '5dfb6c2a2baaa4c8e92758f4e969d262ee668cbf22e5de73020df659e782a473',
    acceptance: { decision: 'KEEP', receipt: `${RECEIPTS}/PQ-022-corridor-assets-h2-disposition-REPORT.md`, evidence: `${EVIDENCE}/report.json` },
    subject: { kind: 'traffic-fixture', type: 'ship', role: 'courier' },
  }),
  identity({
    key: 'traffic-span', assetId: 'helios_span', manifestId: 'wholeship_helios_span',
    slot: 'hull', releaseFile: 'wholeships/helios_span.glb', renderPackage: 'helios-span',
    sectorId: 'sector_helios_prime',
    acceptedReleaseSha256: '5fb2a62c79d3bc07777c5bf5ff9d2e26554e2bf3bfca051ba470d28adb6ed1b5',
    acceptance: { decision: 'KEEP', receipt: `${RECEIPTS}/PQ-022-corridor-assets-h2-disposition-REPORT.md`, evidence: `${EVIDENCE}/report.json` },
    subject: { kind: 'traffic-fixture', type: 'ship', role: 'hauler' },
  }),
  identity({
    key: 'traffic-cradle', assetId: 'helios_cradle', manifestId: 'wholeship_helios_cradle',
    slot: 'hull', releaseFile: 'wholeships/helios_cradle.glb', renderPackage: 'helios-cradle',
    sectorId: 'sector_helios_prime',
    acceptedReleaseSha256: '6f400dfd7caf7e18df1b0cb951e77ec2c8773a4cd8321243e4c259c840c778de',
    acceptance: { decision: 'KEEP', receipt: `${RECEIPTS}/PQ-022-corridor-assets-h2-disposition-REPORT.md`, evidence: `${EVIDENCE}/report.json` },
    subject: { kind: 'traffic-fixture', type: 'ship', role: 'miner' },
  }),
  identity({
    key: 'station-refinery', assetId: 'place_station_refinery', manifestId: 'place_station_refinery',
    slot: 'place', releaseFile: 'places/place_station_refinery.glb', renderPackage: 'ceres-refinery',
    sectorId: 'sector_ceres_belt',
    acceptedReleaseSha256: '3b673f761f8e47c32ffa0563b933ad099380d2df75629dca927481cec4c8b7c0',
    acceptance: { decision: 'KEEP', receipt: `${RECEIPTS}/PQ-022-refinery-reauthor-REPORT.md`, evidence: `${EVIDENCE}/refinery-reauthor/browser/report.json` },
    subject: { kind: 'live', type: 'station', stationId: 'station_ceres', archetypeGlb: 'place_station_refinery' },
  }),
  identity({
    key: 'station-mining', assetId: 'place_station_mining', manifestId: 'place_station_mining',
    slot: 'place', releaseFile: 'places/place_station_mining.glb', renderPackage: 'mining',
    sectorId: 'sector_ceres_belt',
    acceptedReleaseSha256: 'b14c82ec6add74c525def05ca57e081805f3f4a09f8773ab662847ad41314b3a',
    acceptance: { decision: 'KEEP', receipt: `${RECEIPTS}/PQ-022-corridor-assets-h2-disposition-REPORT.md`, evidence: `${EVIDENCE}/report.json` },
    subject: { kind: 'live', type: 'station', stationId: 'station_beltout', archetypeGlb: 'place_station_mining' },
  }),
  identity({
    key: 'nav-buoy', assetId: 'place_nav_buoy', manifestId: 'place_nav_buoy',
    slot: 'place', releaseFile: 'places/place_nav_buoy.glb', renderPackage: 'nav-buoy',
    sectorId: 'sector_tethys_junction',
    acceptedReleaseSha256: 'e7d41985b76e4c02394dd39e84997e478cc3b9f8016eb93cbd1d74206cc226f2',
    acceptance: { decision: 'KEEP', receipt: `${RECEIPTS}/PQ-022-billboard-buoy-reauthor-REPORT.md`, evidence: `${EVIDENCE}/nav-buoy-repair/browser/report.json` },
    subject: { kind: 'live', type: 'fx', poiId: 'poi_tethys_customs_log', placeId: 'place_nav_buoy' },
  }),
]);

export const PQ022_H3_IDENTITY_KEYS = Object.freeze(PQ022_H3_IDENTITIES.map((row) => row.key));
const IDENTITY_BY_KEY = new Map(PQ022_H3_IDENTITIES.map((row) => [row.key, row]));

export function pq022H3IdentityByKey(key) {
  return IDENTITY_BY_KEY.get(key) || null;
}

export function pq022H3IdentitiesForSector(sectorId) {
  return PQ022_H3_IDENTITIES.filter((row) => row.sectorId === sectorId);
}

// Route admission ceiling (mirrors pq022CorridorH3Route PQ022_H3_ADMISSION_CEILING_MS). A subject still
// present and pending after this long is recorded as an admission timeout for that identity and cycle.
export const PQ022_H3_ADMISSION_TIMEOUT_FLOOR_MS = 180_000;

// Declared before any capture. Changing a number after seeing results requires a new receipt claim.
export const PQ022_H3_BUDGETS = Object.freeze({
  // Matched feature gates: each identity against the mean of its same-sector, same-cycle floor-in and
  // floor-out windows; the gate is the median of the three per-cycle deltas.
  matchedP95ToleranceMs: 0.8,
  matchedP99ToleranceMs: 0.8,
  maxProductAttributedFramesAbove50Ms: 0,
  maxExternalSchedulingHitchDelta: 2,
  maxExternalSchedulingHitchDeltaPerCycle: 1,
  // External-scheduling classifier bounds (PQ-020 rule): a >32 ms interval is external only when its
  // own callback, simulation, and presentation work each fit this envelope, no backlog was shed, an
  // external callback gap or dispatch lag was observed, and the separated GPU pass envelope fits.
  externalWorkEnvelopeMs: 17.5,
  maxSeparatedGpuEnvelopeMs: 17.5,
  // Absolute envelope: reported separately, never a matched gate and never waived.
  nominalTargetP95Ms: 16.7,
  targetSamplingEnvelopeP95Ms: 17.5,
  maxFrameMs: 50,
  // Admission: pending must resolve to the authored release, never a visible fallback.
  maxApproachAdmissionMs: 30_000,
  // Cleanup band across repeated route cycles in one context.
  cleanupCountGrowthFraction: 0.05,
  cleanupBytesGrowthFraction: 0.10,
  maxPendingResidencyRequestsAtCycleEnd: 0,
  // Host-load attribution only (the PQ release-soak contention thresholds for Browser-class
  // processes, plus a whole-machine foreign CPU ceiling). A budget that fails only inside contended
  // windows is reported as host-contended and inconclusive, never green and never a product verdict.
  hostForeignBrowserProcessCores: 0.075,
  hostForeignBrowserAggregateCores: 0.125,
  hostForeignAnyAggregateCores: 2.0,
});

export const PQ022_H3_CLEANUP_COUNT_KEYS = Object.freeze([
  'geometries',
  'textures',
  'programs',
  'residentAssets',
  'residentResources',
]);
export const PQ022_H3_CLEANUP_BYTE_KEYS = Object.freeze(['gpuResidentBytes', 'cpuPackageBytes']);

export const PQ022_H3_RESULT_CLASSES = Object.freeze({
  PASS: 'PASS',
  DIAGNOSTIC_PASS: 'DIAGNOSTIC_PASS',
  BUDGET_FAIL: 'BUDGET_FAIL',
  PRODUCT_DEFECT: 'PRODUCT_DEFECT',
  HOST_CONTENDED: 'HOST_CONTENDED_INCONCLUSIVE',
  EVIDENCE_INVALID: 'EVIDENCE_INVALID',
});

export const PQ022_H3_PROBE_FAILURE_CLASSES = Object.freeze({
  BROWSER_CONTEXT_CLOSED: 'BROWSER_CONTEXT_CLOSED_BEFORE_CELL_COMPLETION',
  PROBE_FAILURE: 'PROBE_FAILURE_BEFORE_CELL_COMPLETION',
});

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|software rasterizer|microsoft basic render/i;
const BROWSER_CONTEXT_CLOSED = /target page, context or browser has been closed/i;
const SHA256 = /^[0-9a-f]{64}$/;

export function pq022H3WindowId({ cycle, sectorId, kind, identityKey = null }) {
  return `c${cycle}:${sectorId}:${kind}${identityKey ? `:${identityKey}` : ''}`;
}

export function pq022H3ExpectedWindows() {
  const rows = [];
  for (let cycle = 1; cycle <= PQ022_H3_CYCLES; cycle += 1) {
    for (const sectorId of PQ022_H3_SECTOR_ORDER) {
      rows.push({ cycle, sectorId, kind: 'floor-in', identityKey: null });
      for (const row of pq022H3IdentitiesForSector(sectorId)) {
        rows.push({ cycle, sectorId, kind: PQ022_H3_TARGET_KIND, identityKey: row.key });
      }
      rows.push({ cycle, sectorId, kind: 'floor-out', identityKey: null });
    }
  }
  return rows.map((row) => ({ ...row, windowId: pq022H3WindowId(row) }));
}

export function classifyPq022H3ProbeFailure(error, {
  phase = 'unknown',
  completedWindowCount = 0,
} = {}) {
  const problem = String(error?.message || error || 'unknown PQ-022 H3 probe failure');
  const infrastructureInterrupted = BROWSER_CONTEXT_CLOSED.test(problem);
  return {
    failureClass: infrastructureInterrupted
      ? PQ022_H3_PROBE_FAILURE_CLASSES.BROWSER_CONTEXT_CLOSED
      : PQ022_H3_PROBE_FAILURE_CLASSES.PROBE_FAILURE,
    infrastructureInterrupted,
    productEvidenceValid: false,
    retryableAfterRegression: infrastructureInterrupted,
    phase: String(error?.routePhase || phase || 'unknown'),
    completedWindowCount: Number.isInteger(completedWindowCount) && completedWindowCount >= 0
      ? completedWindowCount
      : 0,
    problem,
  };
}

export function validatePq022H3IncompleteReceipt(receipt = {}) {
  const failures = [];
  if (receipt?.schema !== PQ022_H3_RECEIPT_SCHEMA) failures.push(`schema must be ${PQ022_H3_RECEIPT_SCHEMA}`);
  if (receipt?.disposition !== 'FAIL') failures.push('incomplete receipt disposition must be FAIL');
  if (receipt?.productEvidenceValid !== false) failures.push('incomplete receipt must explicitly reject product evidence');
  if (!Object.values(PQ022_H3_PROBE_FAILURE_CLASSES).includes(receipt?.failureClass)) {
    failures.push('incomplete receipt must use a known probe failure class');
  }
  if (receipt?.infrastructureInterrupted === true
      && receipt?.failureClass !== PQ022_H3_PROBE_FAILURE_CLASSES.BROWSER_CONTEXT_CLOSED) {
    failures.push('Browser interruption must use the Browser-context-closed failure class');
  }
  if (typeof receipt?.phase !== 'string' || receipt.phase.length === 0) {
    failures.push('incomplete receipt must name the interrupted phase');
  }
  if (!Number.isInteger(receipt?.completedWindowCount) || receipt.completedWindowCount < 0) {
    failures.push('incomplete receipt must count completed measurement windows');
  }
  if (receipt?.cleanup?.browserClosed !== true || receipt?.cleanup?.serverClosed !== true) {
    failures.push('incomplete receipt must prove owned Browser and server cleanup');
  }
  const conclusion = `probe stopped during ${receipt?.phase || 'unknown'} after ${receipt?.completedWindowCount ?? 0} complete window(s); cell is incomplete and makes no product performance conclusion`;
  return {
    pass: false,
    evidencePass: false,
    classificationPass: failures.length === 0,
    resultClass: PQ022_H3_RESULT_CLASSES.EVIDENCE_INVALID,
    evidenceStatus: 'INCOMPLETE_NO_PRODUCT_CONCLUSION',
    failures: failures.length > 0 ? failures : [conclusion],
    budgets: PQ022_H3_BUDGETS,
  };
}

export function validatePq022H3PerformanceReceipt(receipt = {}) {
  const evidence = [];
  const budget = [];
  const acceptance = [];
  const productFindings = [];

  if (receipt?.schema !== PQ022_H3_RECEIPT_SCHEMA) evidence.push(`schema must be ${PQ022_H3_RECEIPT_SCHEMA}`);
  if (receipt?.fixedSeed !== PQ022_H3_FIXED_SEED) evidence.push(`fixedSeed must be ${PQ022_H3_FIXED_SEED}`);
  validateViewport(receipt?.viewport, evidence);
  validateRuntime(receipt, evidence);
  validateQuality(receipt?.qualityPreserving, evidence);
  validateCleanup(receipt?.cleanup, evidence);
  validateRouteMetadata(receipt?.route, evidence);
  // Relay collar draws per cycle. On a build that keeps held ids out of the free pool the first draw must be
  // clean; every dropped draw is a product finding (the owner handed the beacon an id another table still held),
  // reported with its census, while the relay itself is still measured on its clean id.
  const relayDrawsByCycle = [];
  const relaySectorId = IDENTITY_BY_KEY.get('relay-collar')?.sectorId;
  for (const row of (Array.isArray(receipt?.route?.fixtures) ? receipt.route.fixtures : []).filter((fixture) => fixture?.kind === 'relay-collar')) {
    const dropped = Array.isArray(row.collided) ? row.collided : [];
    relayDrawsByCycle.push({
      cycle: row.cycle ?? null,
      relayKey: row.relayKey ?? null,
      reused: row.reused === true,
      reissueFor: row.reissueFor ?? null,
      draws: Number.isInteger(row.issueAttempts) ? row.issueAttempts : null,
      dropped: dropped.length,
      clean: row.ownership?.clean === true,
    });
    if (dropped.length > 0) {
      productFindings.push({
        windowId: pq022H3WindowId({ cycle: row.cycle, sectorId: relaySectorId, kind: PQ022_H3_TARGET_KIND, identityKey: 'relay-collar' }),
        identityKey: 'relay-collar',
        phase: 'issue',
        finding: 'presentation-id-collision-at-issue',
        clauses: dropped.map((hit) => `id ${hit?.id ?? '?'} held by ${(hit?.ownership?.otherHolders || []).join('+') || 'an unrecorded owner'}`),
      });
    }
  }
  if (!Array.isArray(receipt?.pageIssues)) evidence.push('pageIssues must be an array');
  else if (receipt.pageIssues.length > 0) evidence.push(`pageIssues must be empty (${receipt.pageIssues.length} recorded)`);
  validateBroker(receipt?.broker, acceptance);

  const identities = validateIdentities(receipt?.identities, evidence);
  const windowsById = indexWindows(receipt?.windows, evidence);
  const expected = pq022H3ExpectedWindows();
  const admissionTimeoutWindowIds = new Set((Array.isArray(receipt?.route?.admissionTimeouts) ? receipt.route.admissionTimeouts : [])
    .map((row) => row?.windowId)
    .filter((id) => typeof id === 'string'));
  const referenceSettings = { value: undefined };
  const referenceZoom = { value: undefined };
  for (const row of expected) {
    const windowRow = windowsById.get(row.windowId);
    if (!windowRow) {
      // A target whose subject never admitted has no window by construction; its identity facts carry the
      // timeout and it is gated there. Any other missing window invalidates the cell.
      if (!(row.kind === PQ022_H3_TARGET_KIND && admissionTimeoutWindowIds.has(row.windowId))) {
        evidence.push(`missing window ${row.windowId}`);
      }
      continue;
    }
    if (admissionTimeoutWindowIds.has(row.windowId)) {
      evidence.push(`${row.windowId} records an admission timeout but also a measured window`);
    }
    validateWindow(row, windowRow, receipt?.fixedSeed, referenceSettings, referenceZoom, evidence, productFindings);
  }

  const measuredOrOwed = expected.filter((row) => windowsById.has(row.windowId) || !admissionTimeoutWindowIds.has(row.windowId));
  const hostLoad = evaluateHostLoad(receipt?.hostLoad, measuredOrOwed, evidence);
  const identityFacts = validateIdentityFacts(receipt?.identityFacts, evidence, budget, admissionTimeoutWindowIds, hostLoad, productFindings);
  const matched = PQ022_H3_IDENTITIES.map((row) => evaluateIdentityMatched(row, windowsById, budget));
  const cleanup = evaluatePq022H3CleanupBand(receipt?.resources, evidence, budget);
  const absoluteBudget = evaluateAbsoluteBudget(windowsById);

  let resultClass;
  if (evidence.length > 0) resultClass = PQ022_H3_RESULT_CLASSES.EVIDENCE_INVALID;
  else if (budget.length > 0) {
    const allContended = budget.every((failure) => Array.isArray(failure.windows)
      && failure.windows.length > 0
      && failure.windows.every((windowId) => hostLoad.contendedWindowIds.includes(windowId)));
    resultClass = allContended ? PQ022_H3_RESULT_CLASSES.HOST_CONTENDED : PQ022_H3_RESULT_CLASSES.BUDGET_FAIL;
  } else if (acceptance.length > 0) resultClass = PQ022_H3_RESULT_CLASSES.DIAGNOSTIC_PASS;
  else resultClass = PQ022_H3_RESULT_CLASSES.PASS;
  // A conclusive visibility defect outranks a passing, diagnostic, or host-contended timing result; a
  // budget failure keeps its class and still lists the findings.
  const productDefectIdentities = [...new Set(productFindings.map((row) => row.identityKey))].sort();
  if (evidence.length === 0 && productFindings.length > 0 && resultClass !== PQ022_H3_RESULT_CLASSES.BUDGET_FAIL) {
    resultClass = PQ022_H3_RESULT_CLASSES.PRODUCT_DEFECT;
  }

  const budgetMessages = budget.map((failure) => failure.message);
  return {
    pass: resultClass === PQ022_H3_RESULT_CLASSES.PASS,
    resultClass,
    productFindings,
    productDefectIdentities,
    admissionTimeouts: [...admissionTimeoutWindowIds].sort(),
    fixtureLosses: (Array.isArray(receipt?.route?.fixtureLosses) ? receipt.route.fixtureLosses : [])
      .map((row) => row?.windowId ?? null),
    relayDrawsByCycle,
    // Presentation id collisions the relay issuance dropped (each is also a product finding).
    relayIdCollisions: (Array.isArray(receipt?.route?.fixtures) ? receipt.route.fixtures : [])
      .filter((row) => row?.kind === 'relay-collar')
      .flatMap((row) => (Array.isArray(row.collided) ? row.collided : []).map((hit) => ({
        cycle: row.cycle,
        id: hit?.id ?? null,
        phase: hit?.phase ?? null,
        otherHolders: hit?.ownership?.otherHolders ?? [],
        meshBody: hit?.ownership?.mesh?.body ?? null,
      }))),
    evidencePass: evidence.length === 0,
    budgetPass: budget.length === 0,
    acceptancePass: acceptance.length === 0,
    failures: [...new Set([...evidence, ...budgetMessages, ...acceptance])],
    evidenceFailures: [...new Set(evidence)],
    budgetFailures: budget,
    acceptanceFailures: [...new Set(acceptance)],
    identities,
    identityFacts,
    matched,
    cleanup,
    hostLoad,
    absoluteBudget,
    budgets: PQ022_H3_BUDGETS,
  };
}

function validateViewport(viewport, failures) {
  if (viewport?.width !== PQ022_H3_VIEWPORT.width || viewport?.height !== PQ022_H3_VIEWPORT.height
      || viewport?.deviceScaleFactor !== PQ022_H3_VIEWPORT.deviceScaleFactor) {
    failures.push('viewport must be the fixed 1830x973 target profile at deviceScaleFactor 1');
  }
}

function validateRuntime(receipt, failures) {
  if (receipt?.runtime !== 'browser-chromium-headed') failures.push('runtime must be browser-chromium-headed');
  const renderer = String(receipt?.gpu?.renderer || '');
  if (receipt?.gpu?.available !== true || !renderer || SOFTWARE_RENDERER.test(renderer)) {
    failures.push('acceptance requires a hardware GPU renderer');
  }
  if (!/intel/i.test(renderer) || !/D3D11/i.test(renderer)) {
    failures.push('target profile requires the bound Intel D3D11 renderer');
  }
}

function validateBroker(broker, failures) {
  if (broker?.primaryAcceptance !== true || broker?.diagnostic === true || !broker?.claimId) {
    failures.push('primary broker acceptance with a claim id is required');
  }
}

function validateQuality(quality, failures) {
  if (quality?.settingsOverridesApplied !== false || quality?.defaultQualityRetained !== true) {
    failures.push('default quality must remain active with no settings overrides');
  }
  if (quality?.performanceImprovementClaimed !== false) {
    failures.push('PQ-022 H3 must not claim an optimization improvement');
  }
  if (quality?.absoluteTargetClaimed !== false || quality?.absoluteBudgetWaiverGranted !== false) {
    failures.push('PQ-022 H3 must report the absolute target separately without claiming or waiving it');
  }
  if (quality?.cullingOrLodOverridesApplied !== false) {
    failures.push('PQ-022 H3 must not force culling, render flags, or LOD levels on measured subjects');
  }
}

function validateCleanup(cleanup, failures) {
  if (cleanup?.browserClosed !== true || cleanup?.serverClosed !== true) {
    failures.push('owned Browser and server cleanup must both complete');
  }
  if (cleanup?.hostSamplerStopped !== true) failures.push('the owned host-load sampler must be stopped');
}

function validateRouteMetadata(route, failures) {
  if (route?.cycleCount !== PQ022_H3_CYCLES) failures.push(`route must declare exactly ${PQ022_H3_CYCLES} cycles`);
  if (route?.singleContext !== true) failures.push('route cycles must share one Browser context so cleanup is comparable');
  if (typeof route?.declaredRoute !== 'string' || route.declaredRoute.trim().length < 20) {
    failures.push('route must describe the measured owner path');
  }
  if (!Array.isArray(route?.compressions) || route.compressions.length < 3) {
    failures.push('route must declare its sector-travel, relay-owner, and traffic-owner compressions');
  }
  if (!Array.isArray(route?.retainedEvidenceReferences) || route.retainedEvidenceReferences.length < 4) {
    failures.push('route must retain the accepted relay, refinery, billboard/buoy, and H2 disposition references');
  }
  // A target window may be discarded and re-run only when the player was struck during it (contact
  // work is not the identity's cost). Timing can never be the reason, and retries are bounded.
  if (!Array.isArray(route?.discardedWindows)) {
    failures.push('route must record discarded windows, even when none were discarded');
  } else {
    const perWindow = new Map();
    for (const row of route.discardedWindows) {
      const id = String(row?.windowId || '');
      perWindow.set(id, (perWindow.get(id) || 0) + 1);
      if (row?.reason !== 'player-impacts-during-window' || !(Number(row?.impactsDuring) > 0)) {
        failures.push(`discarded window ${id || '(unnamed)'} was not discarded for player contact`);
      }
    }
    for (const [id, count] of perWindow) {
      if (count > 2) failures.push(`window ${id} was discarded ${count} times; at most 2 contact retries are allowed`);
    }
  }
  // Admission timeouts: only a target window, only after the full ceiling, and only while the subject still
  // existed where it was approached.
  if (!Array.isArray(route?.admissionTimeouts)) {
    failures.push('route must record admission timeouts, even when none occurred');
  } else {
    const targetIds = new Set(pq022H3ExpectedWindows()
      .filter((row) => row.kind === PQ022_H3_TARGET_KIND)
      .map((row) => row.windowId));
    for (const row of route.admissionTimeouts) {
      const id = String(row?.windowId || '(unnamed)');
      if (!targetIds.has(row?.windowId)) failures.push(`admission timeout ${id} is not an expected target window`);
      if (!(Number(row?.timedOutAfterMs) >= PQ022_H3_ADMISSION_TIMEOUT_FLOOR_MS)) {
        failures.push(`admission timeout ${id} was recorded before the ${PQ022_H3_ADMISSION_TIMEOUT_FLOOR_MS} ms ceiling`);
      }
      if (row?.lastState?.exists !== true) {
        failures.push(`admission timeout ${id} lost its subject; that is a probe failure, not a timeout`);
      }
    }
  }
  // Fixture losses (traffic hulls and the relay collar beacon): only a fixture target window, with the reason the
  // fixture was no longer intact, and at most two re-issues per window.
  if (!Array.isArray(route?.fixtureLosses)) {
    failures.push('route must record fixture losses, even when none occurred');
  } else {
    const fixtureTargetIds = new Set(pq022H3ExpectedWindows()
      .filter((row) => row.kind === PQ022_H3_TARGET_KIND
        && ['traffic-fixture', 'relay-fixture'].includes(IDENTITY_BY_KEY.get(row.identityKey)?.subject?.kind))
      .map((row) => row.windowId));
    const lossesPerWindow = new Map();
    for (const row of route.fixtureLosses) {
      const id = String(row?.windowId || '(unnamed)');
      lossesPerWindow.set(id, (lossesPerWindow.get(id) || 0) + 1);
      if (!fixtureTargetIds.has(row?.windowId)) failures.push(`fixture loss ${id} is not a fixture target window`);
      if (typeof row?.intactReason !== 'string' || row.intactReason.length === 0) {
        failures.push(`fixture loss ${id} must record why the fixture was no longer intact`);
      }
    }
    for (const [id, count] of lossesPerWindow) {
      if (count > 2) failures.push(`fixture for ${id} was lost ${count} times; at most 2 re-issues are allowed`);
    }
  }
  // Relay collar presentation id: the clean policy is the only acceptance policy, every cycle's relay must have been
  // measured on a collision-free id, and an admission timeout cannot stand in for a binding lost to another table.
  if (route?.relayIdPolicy !== 'clean') {
    failures.push(`relay id policy ${route?.relayIdPolicy ?? 'missing'} is not the clean acceptance policy`);
  }
  const relayFixtures = (Array.isArray(route?.fixtures) ? route.fixtures : []).filter((row) => row?.kind === 'relay-collar');
  for (let cycle = 1; cycle <= PQ022_H3_CYCLES; cycle += 1) {
    const rows = relayFixtures.filter((row) => row.cycle === cycle);
    const last = rows[rows.length - 1];
    if (!last) {
      failures.push(`cycle ${cycle} relay collar fixture issuance is not recorded`);
    } else if (last.ownership?.clean !== true) {
      failures.push(`cycle ${cycle} relay collar was measured on presentation id ${last.relayId ?? '?'} held by ${(last.ownership?.otherHolders || []).join('+') || 'an unrecorded owner'}`);
    }
  }
  for (const row of Array.isArray(route?.admissionTimeouts) ? route.admissionTimeouts : []) {
    const ownership = row?.lastState?.idOwnership;
    if (ownership && ownership.clean !== true) {
      failures.push(`admission timeout ${row.windowId} happened on presentation id ${ownership.id ?? '?'} bound to another body; that is a binding loss, not an admission timeout`);
    }
  }
  // Boot: the only retried boot failure is a transient module parse/link error while the shared tree is being
  // edited, and the last attempt must be the successful boot the cell ran on.
  if (!Array.isArray(route?.bootAttempts) || route.bootAttempts.length === 0) {
    failures.push('route must record its boot attempts');
  } else {
    if (route.bootAttempts[route.bootAttempts.length - 1]?.ok !== true) {
      failures.push('route boot attempts must end with the successful boot the cell ran on');
    }
    for (const row of route.bootAttempts.slice(0, -1)) {
      if (row?.ok !== false || row?.transientModuleError !== true) {
        failures.push(`boot attempt ${row?.attempt ?? '?'} was retried without a transient module parse error`);
      }
    }
  }
}

function validateIdentities(rows, failures) {
  const list = Array.isArray(rows) ? rows : [];
  const byKey = new Map(list.map((row) => [row?.key, row]));
  const summaries = [];
  for (const expected of PQ022_H3_IDENTITIES) {
    const row = byKey.get(expected.key);
    if (!row) {
      failures.push(`identity ${expected.key} is missing`);
      continue;
    }
    const live = row.live || {};
    const pkg = row.renderPackage || {};
    const liveMatchesAccepted = live.releaseSha256 === expected.acceptedReleaseSha256;
    const diskMatchesManifest = live.onDiskReleaseSha256 === live.releaseSha256;
    const packageMatchesLive = pkg.sourceGlbSha256 === live.releaseSha256;
    if (row.assetId !== expected.assetId || row.manifestId !== expected.manifestId) {
      failures.push(`identity ${expected.key} asset/manifest id differs from the accepted table`);
    }
    if (!liveMatchesAccepted) {
      failures.push(`identity ${expected.key} live release ${live.releaseSha256 || 'missing'} differs from accepted ${expected.acceptedReleaseSha256}`);
    }
    if (!diskMatchesManifest) failures.push(`identity ${expected.key} on-disk release bytes do not match the release manifest`);
    if (!packageMatchesLive) failures.push(`identity ${expected.key} render package does not snapshot the live release`);
    if (!SHA256.test(String(pkg.contentHash || ''))) failures.push(`identity ${expected.key} render package content hash is missing`);
    for (const [label, value] of [
      ['live.sourceBytes', live.sourceBytes],
      ['live.releaseBytes', live.releaseBytes],
      ['renderPackage.renderBytes', pkg.renderBytes],
    ]) {
      if (!finitePositive(value)) failures.push(`identity ${expected.key} ${label} must be measured`);
    }
    summaries.push({
      key: expected.key,
      liveMatchesAccepted,
      diskMatchesManifest,
      packageMatchesLive,
      releaseSha256: live.releaseSha256 || null,
    });
  }
  for (const key of byKey.keys()) {
    if (!IDENTITY_BY_KEY.has(key)) failures.push(`unknown identity ${key}`);
  }
  return summaries;
}

function indexWindows(rows, failures) {
  const list = Array.isArray(rows) ? rows : [];
  const byId = new Map();
  const expectedIds = new Set(pq022H3ExpectedWindows().map((row) => row.windowId));
  for (const row of list) {
    const id = row?.windowId;
    if (typeof id !== 'string') {
      failures.push('every window must carry a windowId');
      continue;
    }
    if (byId.has(id)) failures.push(`duplicate window ${id}`);
    if (!expectedIds.has(id)) failures.push(`unknown window ${id}`);
    byId.set(id, row);
  }
  return byId;
}

function validateWindow(expected, windowRow, fixedSeed, referenceSettings, referenceZoom, failures, productFindings = []) {
  const label = expected.windowId;
  const rawSamples = Array.isArray(windowRow?.rawSamples) ? windowRow.rawSamples : [];
  if (rawSamples.length < PQ022_H3_MIN_RAW_INTERVALS) {
    failures.push(`${label} requires at least ${PQ022_H3_MIN_RAW_INTERVALS} raw frame intervals`);
  }
  const summary = summarizeFrameSamples(rawSamples);
  const observed = windowRow?.attribution?.frameMs;
  if (!observed || typeof observed !== 'object') failures.push(`${label} attribution frame summary is missing`);
  else {
    for (const key of ['sampleCount', 'p50', 'p95', 'p99', 'max']) {
      if (!sameNumber(summary[key], observed[key])) failures.push(`${label} attribution ${key} does not match recomputed raw intervals`);
    }
    if (summary.framesAbove32Ms !== Number(observed.hitchesOver32Ms)) {
      failures.push(`${label} attribution hitch count does not match recomputed raw intervals`);
    }
  }
  if (rawSamples.some((sample) => sample?.mode !== 'flight' || sample?.docked !== false
      || sample?.playerControlExposed !== true || sample?.visibility !== 'visible')) {
    failures.push(`${label} raw intervals left visible controllable flight`);
  }
  if (rawSamples.some((sample) => !finiteUnitScale(sample?.timeScale))) {
    failures.push(`${label} raw intervals require bounded time-scale evidence`);
  }

  const attribution = windowRow?.attribution || {};
  if (attribution?.pipeline?.warmup?.pass !== true || attribution?.pipeline?.warmup?.timedOut === true) {
    failures.push(`${label} pipeline warmup/stability did not pass`);
  }
  if (attribution?.memory?.comparableState?.pass !== true) failures.push(`${label} route state changed during measurement`);
  const gpuTimers = attribution?.gpuTimers;
  const isolation = attribution?.measurementIsolation;
  if (gpuTimers?.available !== true || gpuTimers?.captureValid !== true || gpuTimers?.lastDisjoint === true) {
    failures.push(`${label} GPU timer capture is unavailable, invalid, or disjoint`);
  }
  if (isolation?.frameTimingGpuTimersEnabled !== false
      || isolation?.gpuAttributionSeparated !== true
      || !Number.isInteger(isolation?.gpuAttributionFrameCount)
      || isolation.gpuAttributionFrameCount < PQ022_H3_MIN_GPU_ATTRIBUTION_FRAMES
      || !finitePositive(isolation?.gpuAttributionDurationMs)
      || isolation?.settingsStable !== true
      || isolation?.routeStable !== true
      || gpuTimers?.enabled !== true
      || gpuTimers?.drain?.drained !== true
      || Number(gpuTimers?.queryCounts?.completed) < PQ022_H3_MIN_GPU_ATTRIBUTION_FRAMES) {
    failures.push(`${label} must isolate frame timing from a complete stable post-window GPU attribution sample`);
  }
  const startSettings = attribution?.settings?.start;
  const endSettings = attribution?.settings?.end;
  const startSlice = stableStringify(qualitySettingsSlice(startSettings));
  if (!startSettings || !endSettings || startSlice !== stableStringify(qualitySettingsSlice(endSettings))) {
    failures.push(`${label} settings changed during measurement`);
  }
  if (startSettings?.dynResScale !== 1 || startSettings?.timeScale !== 1) {
    failures.push(`${label} requires default dynamic resolution and time scale at measurement start`);
  }
  if (startSettings) {
    if (referenceSettings.value === undefined) referenceSettings.value = startSlice;
    else if (referenceSettings.value !== startSlice) failures.push(`${label} uses different quality settings from the first window`);
  }
  for (const key of ['calls', 'triangles', 'geometries', 'textures', 'programs']) {
    if (!finiteNonnegative(attribution?.draw?.[key])) failures.push(`${label} draw.${key} is missing`);
  }
  for (const key of ['sim', 'render', 'vfx', 'ui']) {
    if (!finiteNonnegative(attribution?.cpu?.phases?.[key]?.p95)) failures.push(`${label} cpu phase ${key}.p95 is missing`);
  }

  const facts = windowRow?.routeFacts || {};
  if (facts.windowId !== label || facts.cycle !== expected.cycle || facts.sectorId !== expected.sectorId
      || facts.kind !== expected.kind || (facts.identityKey ?? null) !== expected.identityKey) {
    failures.push(`${label} route identity differs from the expected window`);
  }
  if (facts.recordedSeed !== fixedSeed) failures.push(`${label} recorded seed differs from the receipt`);
  if (facts.mode !== 'flight' || facts.docked !== false) failures.push(`${label} must retain controllable flight`);
  if (!finitePositive(facts.cameraZoom)) failures.push(`${label} camera zoom must be recorded`);
  else if (referenceZoom.value === undefined) referenceZoom.value = facts.cameraZoom;
  else if (facts.cameraZoom !== referenceZoom.value) failures.push(`${label} camera zoom differs from the first window`);
  const startPlayer = facts.frame?.start?.player;
  const endPlayer = facts.frame?.end?.player;
  if (startPlayer && endPlayer && Number.isFinite(startPlayer.x) && Number.isFinite(endPlayer.x)) {
    const moved = Math.hypot(Number(endPlayer.x) - Number(startPlayer.x), Number(endPlayer.z) - Number(startPlayer.z));
    if (moved > 25) failures.push(`${label} player moved ${Math.round(moved)} WU during measurement`);
  }
  const startImpacts = facts.frame?.start?.playerImpacts;
  const endImpacts = facts.frame?.end?.playerImpacts;
  if (!finiteNonnegative(startImpacts) || !finiteNonnegative(endImpacts)) {
    failures.push(`${label} player impact census is missing`);
  } else if (Number(endImpacts) > Number(startImpacts)) {
    failures.push(`${label} player collided ${Number(endImpacts) - Number(startImpacts)} time(s) during measurement`);
  }
  for (const phase of ['start', 'end']) {
    const frame = facts.frame?.[phase];
    if (!frame || !Array.isArray(frame.identitiesInFrame)) {
      failures.push(`${label} ${phase} in-frame identity census is missing`);
      continue;
    }
    if (expected.kind !== PQ022_H3_TARGET_KIND) {
      if (frame.identitiesInFrame.length > 0) {
        failures.push(`${label} floor ${phase} has accepted identities in frame: ${frame.identitiesInFrame.join(', ')}`);
      }
    } else {
      const subject = frame.subject || {};
      if (subject.inFrame !== true) failures.push(`${label} ${phase} subject is not in frame`);
      if (subject.admission !== 'ready' || subject.assetState !== 'authored'
          || subject.releaseBound !== true || subject.fallbackRetained !== false) {
        failures.push(`${label} ${phase} subject is not the admitted authored release`);
      }
      if (!PQ022_H3_LOD_LEVELS.includes(subject.lodLevel)) failures.push(`${label} ${phase} subject LOD level is missing`);
      // Framed and admitted but not drawn is a product finding only when the renderer's own submit
      // decision, replayed with its live inputs, refuses the root and the root is hidden. Any other
      // undrawn subject is unexplained and invalidates the window.
      if (subject.drawn !== true) {
        const submit = subject.submit || {};
        if (subject.inFrame === true && submit.ownerDecision === false && submit.rootVisible === false
            && Array.isArray(submit.clauses) && submit.clauses.length > 0) {
          productFindings.push({
            windowId: label,
            identityKey: expected.identityKey,
            phase,
            finding: 'admitted-framed-not-submitted',
            clauses: submit.clauses,
          });
        } else {
          failures.push(`${label} ${phase} subject is not drawn and the renderer submit decision does not explain it`);
        }
      }
    }
  }
}

function evaluateHostLoad(hostLoad, expected, failures) {
  const contendedWindowIds = [];
  const windows = [];
  if (hostLoad?.available !== true) {
    failures.push('host load must be sampled for every measurement window');
    return { available: false, contendedWindowIds, windows, admissions: [] };
  }
  const byWindow = hostLoad.windows && typeof hostLoad.windows === 'object' ? hostLoad.windows : {};
  for (const row of expected) {
    const entry = byWindow[row.windowId];
    if (!entry || !Number.isInteger(entry.sampleCount) || entry.sampleCount < 1
        || !finiteNonnegative(entry.foreignCores)
        || !finiteNonnegative(entry.foreignBrowserCores)
        || !finiteNonnegative(entry.maxForeignBrowserProcessCores)) {
      failures.push(`${row.windowId} host load sample is missing`);
      continue;
    }
    const contended = entry.maxForeignBrowserProcessCores > PQ022_H3_BUDGETS.hostForeignBrowserProcessCores
      || entry.foreignBrowserCores > PQ022_H3_BUDGETS.hostForeignBrowserAggregateCores
      || entry.foreignCores > PQ022_H3_BUDGETS.hostForeignAnyAggregateCores;
    if (contended) contendedWindowIds.push(row.windowId);
    windows.push({
      windowId: row.windowId,
      contended,
      foreignCores: entry.foreignCores,
      foreignBrowserCores: entry.foreignBrowserCores,
      maxForeignBrowserProcessCores: entry.maxForeignBrowserProcessCores,
    });
  }
  // Admission waits run outside timed windows and carry their own host spans, keyed "admission:<target window id>".
  // Before this, admission budget failures had no host attribution and could never be judged host-contended.
  const admissions = [];
  const byAdmission = hostLoad.admissions && typeof hostLoad.admissions === 'object' ? hostLoad.admissions : {};
  for (const [admissionId, entry] of Object.entries(byAdmission)) {
    if (!entry || !finiteNonnegative(entry.foreignCores) || !finiteNonnegative(entry.foreignBrowserCores)
        || !finiteNonnegative(entry.maxForeignBrowserProcessCores)) continue;
    const contended = entry.maxForeignBrowserProcessCores > PQ022_H3_BUDGETS.hostForeignBrowserProcessCores
      || entry.foreignBrowserCores > PQ022_H3_BUDGETS.hostForeignBrowserAggregateCores
      || entry.foreignCores > PQ022_H3_BUDGETS.hostForeignAnyAggregateCores;
    if (contended) contendedWindowIds.push(admissionId);
    admissions.push({
      admissionId,
      contended,
      foreignCores: entry.foreignCores,
      foreignBrowserCores: entry.foreignBrowserCores,
      maxForeignBrowserProcessCores: entry.maxForeignBrowserProcessCores,
    });
  }
  return { available: true, contendedWindowIds, windows, admissions };
}

function validateIdentityFacts(rows, evidence, budget, admissionTimeoutWindowIds = new Set(), hostLoad = null, productFindings = []) {
  const list = Array.isArray(rows) ? rows : [];
  const byId = new Map();
  for (const row of list) {
    const id = `${row?.key}@c${row?.cycle}`;
    if (byId.has(id)) evidence.push(`duplicate identity facts ${id}`);
    byId.set(id, row);
  }
  const summaries = [];
  for (const expected of PQ022_H3_IDENTITIES) {
    for (let cycle = 1; cycle <= PQ022_H3_CYCLES; cycle += 1) {
      const id = `${expected.key}@c${cycle}`;
      const row = byId.get(id);
      const targetWindowId = pq022H3WindowId({
        cycle, sectorId: expected.sectorId, kind: PQ022_H3_TARGET_KIND, identityKey: expected.key,
      });
      if (!row) {
        evidence.push(`identity facts ${id} are missing`);
        continue;
      }
      const admission = row.admission || {};
      if (admission.path === 'timeout') {
        // Measured product outcome: the subject stayed present and pending through the ceiling. No target
        // window, resources, or LOD were measured for this identity and cycle.
        if (!admissionTimeoutWindowIds.has(targetWindowId)) evidence.push(`${id} admission timeout is not recorded on the route`);
        if (!(Number(admission.timedOutAfterMs) >= PQ022_H3_ADMISSION_TIMEOUT_FLOOR_MS)) {
          evidence.push(`${id} admission timeout was recorded before the ${PQ022_H3_ADMISSION_TIMEOUT_FLOOR_MS} ms ceiling`);
        }
        const admissionId = `admission:${targetWindowId}`;
        const admissionSpan = (hostLoad?.admissions || []).find((span) => span.admissionId === admissionId) || null;
        budget.push({
          message: `${id} did not admit its authored release within ${Math.round(Number(admission.timedOutAfterMs) || 0)} ms (admission timeout; no target window measured)`,
          windows: [admissionId],
        });
        // On a quiet host, a timeout on the subject's own presentation id is a named product finding (its
        // ownership, job, and state timeline is on the route). On a contended host, or without a host span, it
        // stays inconclusive and is never read as a product result.
        if (admissionSpan && admissionSpan.contended === false && admission.lastState?.idOwnership?.clean !== false) {
          productFindings.push({
            windowId: targetWindowId,
            identityKey: expected.key,
            phase: 'admission',
            finding: 'admission-timeout-on-quiet-host',
            clauses: [
              `pending after ${Math.round(Number(admission.timedOutAfterMs) || 0)} ms`,
              `last asset state ${admission.lastState?.rawAssetState ?? admission.lastState?.admission ?? 'unknown'}`,
            ],
          });
        }
        summaries.push({
          key: expected.key,
          cycle,
          admissionPath: 'timeout',
          approachToReadyMs: null,
          timedOutAfterMs: admission.timedOutAfterMs ?? null,
          lod: null,
          gpuResidentBytes: null,
          presentation: null,
          drawn: false,
          triangles: null,
          drawGroups: null,
          authoredTriangles: null,
        });
        continue;
      }
      if (admissionTimeoutWindowIds.has(targetWindowId)) {
        evidence.push(`${id} is listed as an admission timeout but its facts record an admission`);
      }
      if (admission.ready !== true || admission.assetState !== 'authored'
          || admission.fallbackRetained !== false || admission.releaseBound !== true) {
        budget.push({ message: `${id} did not admit the authored release without fallback`, windows: [] });
      }
      if (!finiteNonnegative(admission.approachToReadyMs)) {
        evidence.push(`${id} approach-to-ready admission latency is missing`);
      } else if (admission.approachToReadyMs > PQ022_H3_BUDGETS.maxApproachAdmissionMs) {
        budget.push({
          message: `${id} admission took ${Math.round(admission.approachToReadyMs)} ms (> ${PQ022_H3_BUDGETS.maxApproachAdmissionMs} ms)`,
          windows: [`admission:${targetWindowId}`],
        });
      }
      if (!['natural', 'explicit-request', 'already-admitted'].includes(admission.path)) {
        evidence.push(`${id} admission path must be recorded`);
      }
      const resources = row.resources || {};
      const notSubmitted = resources.presentation === 'not-submitted';
      if (notSubmitted) {
        // Resident but not drawn: submitted draw numbers are zero, authored numbers must be measured,
        // and the renderer's own submit decision must refuse the hidden root.
        for (const key of ['visibleMeshes', 'drawGroups', 'triangles']) {
          if (Number(resources[key]) !== 0) evidence.push(`${id} not-submitted resources.${key} must be zero`);
        }
        const authoredStats = resources.authored || {};
        for (const key of ['meshes', 'groups', 'triangles', 'materials']) {
          if (!finitePositive(authoredStats[key])) evidence.push(`${id} resources.authored.${key} must be measured and positive`);
        }
        if (resources.submit?.ownerDecision !== false || resources.submit?.rootVisible !== false) {
          evidence.push(`${id} is not submitted but the renderer submit decision does not refuse it`);
        }
      } else {
        for (const key of ['visibleMeshes', 'drawGroups', 'triangles', 'materials']) {
          if (!finitePositive(resources[key])) evidence.push(`${id} resources.${key} must be measured and positive`);
        }
      }
      for (const key of ['vertices', 'geometries', 'textures', 'programs']) {
        if (!finiteNonnegative(resources[key])) evidence.push(`${id} resources.${key} must be measured`);
      }
      const residency = resources.residency || {};
      if (residency.resident !== true || !finiteNonnegative(residency.gpuResidentBytes)
          || !finiteNonnegative(residency.cpuPackageBytes)) {
        evidence.push(`${id} render-package residency row must be resident with GPU/CPU bytes`);
      }
      const lod = row.lod || {};
      const levels = PQ022_H3_LOD_FRAMINGS.map((framing) => lod.framings?.[framing]?.level);
      if (levels.some((level) => !PQ022_H3_LOD_LEVELS.includes(level))) {
        evidence.push(`${id} close/default/far LOD levels must all be recorded`);
      } else {
        const index = levels.map((level) => PQ022_H3_LOD_LEVELS.indexOf(level));
        if (!(index[0] <= index[1] && index[1] <= index[2])) {
          budget.push({ message: `${id} LOD detail is not non-increasing close->default->far (${levels.join('/')})`, windows: [targetWindowId] });
        }
      }
      if (!Array.isArray(lod.order) || lod.order.length < 3) evidence.push(`${id} LOD approach order must be recorded`);
      summaries.push({
        key: expected.key,
        cycle,
        admissionPath: admission.path || null,
        approachToReadyMs: admission.approachToReadyMs ?? null,
        lod: levels,
        gpuResidentBytes: residency.gpuResidentBytes ?? null,
        presentation: resources.presentation ?? null,
        drawn: !notSubmitted,
        triangles: resources.triangles ?? null,
        drawGroups: resources.drawGroups ?? null,
        authoredTriangles: resources.authored?.triangles ?? null,
      });
    }
  }
  return summaries;
}

export function pq022H3HitchAttribution(windowRow) {
  const rawSamples = Array.isArray(windowRow?.rawSamples) ? windowRow.rawSamples : [];
  const gpuEnvelopeMs = separatedGpuEnvelopeMs(windowRow?.attribution?.gpuTimers?.passes);
  const envelope = PQ022_H3_BUDGETS.externalWorkEnvelopeMs;
  const isExternal = (sample) => sample?.backlogCause === 'external-scheduling'
    && finiteNonnegative(sample?.callbackMs) && sample.callbackMs <= envelope
    && finiteNonnegative(sample?.simFrameMs) && sample.simFrameMs <= envelope
    && finiteNonnegative(sample?.presentationMs) && sample.presentationMs <= envelope
    && sample?.shedBacklog !== true
    && (Number(sample?.externalCallbackGapMs) > 0 || Number(sample?.callbackDispatchLagMs) > 0)
    && finiteNonnegative(gpuEnvelopeMs)
    && gpuEnvelopeMs <= PQ022_H3_BUDGETS.maxSeparatedGpuEnvelopeMs;
  const hitches = rawSamples.filter((sample) => Number(sample?.frameMs) > 32);
  const above50 = rawSamples.filter((sample) => Number(sample?.frameMs) > 50);
  const externalScheduling = hitches.filter(isExternal).length;
  const external50 = above50.filter(isExternal).length;
  return {
    raw: hitches.length,
    externalScheduling,
    productAttributed: hitches.length - externalScheduling,
    framesAbove50Ms: above50.length,
    productAttributedAbove50Ms: above50.length - external50,
    backlogSheddingFrames: summarizeFrameSamples(rawSamples).backlogSheddingFrames,
    separatedGpuEnvelopeMs: gpuEnvelopeMs,
  };
}

function evaluateIdentityMatched(expected, windowsById, budget) {
  const perCycle = [];
  for (let cycle = 1; cycle <= PQ022_H3_CYCLES; cycle += 1) {
    const targetId = pq022H3WindowId({ cycle, sectorId: expected.sectorId, kind: PQ022_H3_TARGET_KIND, identityKey: expected.key });
    const floorIds = PQ022_H3_FLOOR_KINDS.map((kind) => pq022H3WindowId({ cycle, sectorId: expected.sectorId, kind }));
    const target = windowsById.get(targetId);
    const floors = floorIds.map((id) => windowsById.get(id));
    if (!target || floors.some((row) => !row)) continue;
    const targetSummary = summarizeFrameSamples(target.rawSamples || []);
    const floorSummaries = floors.map((row) => summarizeFrameSamples(row.rawSamples || []));
    const floorRef = {
      p95: mean(floorSummaries.map((row) => row.p95)),
      p99: mean(floorSummaries.map((row) => row.p99)),
    };
    const targetHitches = pq022H3HitchAttribution(target);
    const floorHitches = floors.map((row) => pq022H3HitchAttribution(row));
    perCycle.push({
      cycle,
      targetWindowId: targetId,
      floorWindowIds: floorIds,
      targetDrawn: ['start', 'end'].every((phase) => target.routeFacts?.frame?.[phase]?.subject?.drawn === true),
      // Other accepted identities drawn in the target frame make the matched delta an upper bound for
      // this identity rather than its isolated cost; they are reported, never hidden.
      coFramedIdentities: [...new Set(['start', 'end'].flatMap((phase) => (
        target.routeFacts?.frame?.[phase]?.identitiesInFrame || []
      ).filter((key) => key !== expected.key)))].sort(),
      target: pickSummary(targetSummary),
      floors: floorSummaries.map(pickSummary),
      floorRef,
      deltaP95: targetSummary.p95 - floorRef.p95,
      deltaP99: targetSummary.p99 - floorRef.p99,
      targetHitches,
      floorHitchRef: {
        productAttributed: Math.max(...floorHitches.map((row) => row.productAttributed)),
        externalScheduling: Math.max(...floorHitches.map((row) => row.externalScheduling)),
        backlogSheddingFrames: Math.max(...floorHitches.map((row) => row.backlogSheddingFrames)),
      },
      drawDelta: {
        calls: numberDelta(target.attribution?.draw?.calls, floors.map((row) => row.attribution?.draw?.calls)),
        triangles: numberDelta(target.attribution?.draw?.triangles, floors.map((row) => row.attribution?.draw?.triangles)),
      },
    });
  }
  const result = {
    key: expected.key,
    cycles: perCycle,
    medianDeltaP95Ms: median(perCycle.map((row) => row.deltaP95)),
    medianDeltaP99Ms: median(perCycle.map((row) => row.deltaP99)),
    targetMedianP95Ms: median(perCycle.map((row) => row.target.p95)),
    floorMedianP95Ms: median(perCycle.map((row) => row.floorRef.p95)),
    targetProductAttributedHitches: sum(perCycle.map((row) => row.targetHitches.productAttributed)),
    floorProductAttributedHitchRef: sum(perCycle.map((row) => row.floorHitchRef.productAttributed)),
    targetExternalSchedulingHitches: sum(perCycle.map((row) => row.targetHitches.externalScheduling)),
    targetProductAttributedAbove50Ms: sum(perCycle.map((row) => row.targetHitches.productAttributedAbove50Ms)),
    targetFramesAbove50Ms: sum(perCycle.map((row) => row.targetHitches.framesAbove50Ms)),
    targetBacklogSheddingFrames: sum(perCycle.map((row) => row.targetHitches.backlogSheddingFrames)),
    drawnInAllTargets: perCycle.length > 0 && perCycle.every((row) => row.targetDrawn),
    coFramedIdentities: [...new Set(perCycle.flatMap((row) => row.coFramedIdentities))].sort(),
    pass: true,
  };
  if (perCycle.length !== PQ022_H3_CYCLES) {
    result.pass = false;
    return result; // missing windows are already evidence failures
  }
  const fail = (message, windows) => {
    result.pass = false;
    budget.push({ message, windows });
  };
  const offendingP95 = perCycle.filter((row) => row.deltaP95 > PQ022_H3_BUDGETS.matchedP95ToleranceMs).map((row) => row.targetWindowId);
  if (result.medianDeltaP95Ms > PQ022_H3_BUDGETS.matchedP95ToleranceMs) {
    fail(`${expected.key} target median p95 exceeds its matched floor by ${round3(result.medianDeltaP95Ms)} ms (> ${PQ022_H3_BUDGETS.matchedP95ToleranceMs} ms)`, offendingP95);
  }
  const offendingP99 = perCycle.filter((row) => row.deltaP99 > PQ022_H3_BUDGETS.matchedP99ToleranceMs).map((row) => row.targetWindowId);
  if (result.medianDeltaP99Ms > PQ022_H3_BUDGETS.matchedP99ToleranceMs) {
    fail(`${expected.key} target median p99 exceeds its matched floor by ${round3(result.medianDeltaP99Ms)} ms (> ${PQ022_H3_BUDGETS.matchedP99ToleranceMs} ms)`, offendingP99);
  }
  const offending50 = perCycle.filter((row) => row.targetHitches.productAttributedAbove50Ms > 0).map((row) => row.targetWindowId);
  if (result.targetProductAttributedAbove50Ms > PQ022_H3_BUDGETS.maxProductAttributedFramesAbove50Ms) {
    fail(`${expected.key} target windows contain ${result.targetProductAttributedAbove50Ms} product-attributed frame(s) above 50 ms`, offending50);
  }
  const offendingHitch = perCycle.filter((row) => row.targetHitches.productAttributed > row.floorHitchRef.productAttributed).map((row) => row.targetWindowId);
  if (result.targetProductAttributedHitches > result.floorProductAttributedHitchRef) {
    fail(`${expected.key} product-attributed >32 ms hitches increase from the matched floors (${result.targetProductAttributedHitches} > ${result.floorProductAttributedHitchRef})`, offendingHitch);
  }
  const floorExternal = sum(perCycle.map((row) => row.floorHitchRef.externalScheduling));
  if (result.targetExternalSchedulingHitches > floorExternal + PQ022_H3_BUDGETS.maxExternalSchedulingHitchDelta) {
    fail(`${expected.key} externally scheduled hitches exceed the matched noise envelope`,
      perCycle.filter((row) => row.targetHitches.externalScheduling > row.floorHitchRef.externalScheduling).map((row) => row.targetWindowId));
  }
  for (const row of perCycle) {
    if (row.targetHitches.externalScheduling
        > row.floorHitchRef.externalScheduling + PQ022_H3_BUDGETS.maxExternalSchedulingHitchDeltaPerCycle) {
      fail(`${expected.key} externally scheduled hitches exceed the per-cycle envelope in cycle ${row.cycle}`, [row.targetWindowId]);
    }
  }
  const floorBacklog = sum(perCycle.map((row) => row.floorHitchRef.backlogSheddingFrames));
  if (result.targetBacklogSheddingFrames > floorBacklog) {
    fail(`${expected.key} backlog shedding increases from the matched floors (${result.targetBacklogSheddingFrames} > ${floorBacklog})`,
      perCycle.filter((row) => row.targetHitches.backlogSheddingFrames > row.floorHitchRef.backlogSheddingFrames).map((row) => row.targetWindowId));
  }
  return result;
}

export function evaluatePq022H3CleanupBand(resources, evidence = [], budget = []) {
  const snapshots = Array.isArray(resources?.snapshots) ? resources.snapshots : [];
  const cycleEnds = Array.isArray(resources?.cycleEnds) ? resources.cycleEnds : [];
  const result = {
    pass: true,
    cycleEnds: [],
    highWaterByCycle: {},
    overallHighWater: null,
    end: null,
    growth: [],
  };
  const localBudget = (message) => {
    result.pass = false;
    budget.push({ message, windows: [] });
  };
  const byCycle = new Map(cycleEnds.map((row) => [row?.cycle, row?.snapshot]));
  for (let cycle = 1; cycle <= PQ022_H3_CYCLES; cycle += 1) {
    const snapshot = byCycle.get(cycle);
    if (!snapshot || !validSnapshot(snapshot)) {
      evidence.push(`cycle ${cycle} end-of-route resource snapshot is missing or incomplete`);
      result.pass = false;
      continue;
    }
    result.cycleEnds.push({ cycle, ...pickResources(snapshot) });
    if (Number(snapshot.pendingRequests) > PQ022_H3_BUDGETS.maxPendingResidencyRequestsAtCycleEnd) {
      localBudget(`cycle ${cycle} end leaves ${snapshot.pendingRequests} pending residency request(s)`);
    }
  }
  const base = byCycle.get(1);
  if (base && validSnapshot(base)) {
    for (const cycle of [2, 3]) {
      const snapshot = byCycle.get(cycle);
      if (!snapshot || !validSnapshot(snapshot)) continue;
      compareBand(`cycle ${cycle} end vs cycle 1 end`, base, snapshot, result, localBudget);
    }
  }
  for (const snapshot of snapshots) {
    if (!validSnapshot(snapshot) || !Number.isInteger(snapshot.cycle)) continue;
    const key = String(snapshot.cycle);
    const current = result.highWaterByCycle[key] || {};
    for (const field of [...PQ022_H3_CLEANUP_COUNT_KEYS, ...PQ022_H3_CLEANUP_BYTE_KEYS, 'heapUsedBytes', 'entityCount']) {
      const value = Number(snapshot[field]);
      if (Number.isFinite(value)) current[field] = Math.max(Number.isFinite(current[field]) ? current[field] : -Infinity, value);
    }
    result.highWaterByCycle[key] = current;
  }
  const hw2 = result.highWaterByCycle['2'];
  const hw3 = result.highWaterByCycle['3'];
  if (hw2 && hw3) compareBand('cycle 3 high-water vs cycle 2 high-water', hw2, hw3, result, localBudget);
  else {
    evidence.push('per-cycle resource high-water snapshots are missing for cycles 2 and 3');
    result.pass = false;
  }
  const overall = {};
  for (const row of Object.values(result.highWaterByCycle)) {
    for (const [field, value] of Object.entries(row)) {
      overall[field] = Math.max(Number.isFinite(overall[field]) ? overall[field] : -Infinity, value);
    }
  }
  result.overallHighWater = Object.keys(overall).length ? overall : null;
  const end = byCycle.get(PQ022_H3_CYCLES);
  result.end = end && validSnapshot(end) ? pickResources(end) : null;
  return result;
}

function compareBand(label, base, next, result, localBudget) {
  for (const field of PQ022_H3_CLEANUP_COUNT_KEYS) {
    const limit = Math.ceil(Number(base[field]) * (1 + PQ022_H3_BUDGETS.cleanupCountGrowthFraction));
    const value = Number(next[field]);
    result.growth.push({ label, field, base: Number(base[field]), value, limit });
    if (Number.isFinite(value) && Number.isFinite(limit) && value > limit) {
      localBudget(`${label}: ${field} ${value} exceeds the ${Math.round(PQ022_H3_BUDGETS.cleanupCountGrowthFraction * 100)}% band (${limit})`);
    }
  }
  for (const field of PQ022_H3_CLEANUP_BYTE_KEYS) {
    const limit = Number(base[field]) * (1 + PQ022_H3_BUDGETS.cleanupBytesGrowthFraction);
    const value = Number(next[field]);
    result.growth.push({ label, field, base: Number(base[field]), value, limit });
    if (Number.isFinite(value) && Number.isFinite(limit) && value > limit) {
      localBudget(`${label}: ${field} ${value} exceeds the ${Math.round(PQ022_H3_BUDGETS.cleanupBytesGrowthFraction * 100)}% band (${Math.round(limit)})`);
    }
  }
}

function validSnapshot(snapshot) {
  return [...PQ022_H3_CLEANUP_COUNT_KEYS, ...PQ022_H3_CLEANUP_BYTE_KEYS, 'pendingRequests']
    .every((field) => finiteNonnegative(snapshot?.[field]));
}

function pickResources(snapshot) {
  const out = {};
  for (const field of [...PQ022_H3_CLEANUP_COUNT_KEYS, ...PQ022_H3_CLEANUP_BYTE_KEYS,
    'pendingRequests', 'heapUsedBytes', 'entityCount', 'label']) {
    if (snapshot?.[field] !== undefined) out[field] = snapshot[field];
  }
  return out;
}

function evaluateAbsoluteBudget(windowsById) {
  const groups = new Map();
  for (const row of windowsById.values()) {
    const facts = row?.routeFacts || {};
    const group = facts.kind === PQ022_H3_TARGET_KIND ? `target:${facts.identityKey}` : `floor:${facts.sectorId}`;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(summarizeFrameSamples(row?.rawSamples || []));
  }
  const profiles = [];
  const failures = [];
  for (const [group, summaries] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const medianP95 = median(summaries.map((row) => row.p95));
    const framesAbove50Ms = sum(summaries.map((row) => row.framesAbove50Ms));
    const backlogSheddingFrames = sum(summaries.map((row) => row.backlogSheddingFrames));
    const targetP95Pass = Number.isFinite(medianP95) && medianP95 <= PQ022_H3_BUDGETS.targetSamplingEnvelopeP95Ms;
    profiles.push({ group, windows: summaries.length, medianP95, framesAbove50Ms, backlogSheddingFrames, targetP95Pass });
    if (!targetP95Pass) failures.push(`${group} median p95 misses the ${PQ022_H3_BUDGETS.targetSamplingEnvelopeP95Ms} ms envelope`);
    if (framesAbove50Ms > 0) failures.push(`${group} contains ${framesAbove50Ms} frame(s) above 50 ms`);
    if (backlogSheddingFrames > 0) failures.push(`${group} contains ${backlogSheddingFrames} backlog-shedding frame(s)`);
  }
  return { pass: failures.length === 0, failures, profiles };
}

function separatedGpuEnvelopeMs(passes) {
  const required = ['bloomScene', 'bloomDownsample', 'bloomComposite'].map((key) => Number(passes?.[key]?.max));
  if (!required.every(Number.isFinite)) return null;
  const upsample = Number(passes?.bloomUpsample?.max);
  return required.reduce((total, value) => total + value, 0) + (Number.isFinite(upsample) ? upsample : 0);
}

function qualitySettingsSlice(settings) {
  if (!settings || typeof settings !== 'object') return null;
  return { video: settings.video || null, dynResScale: settings.dynResScale };
}

function pickSummary(summary) {
  return {
    sampleCount: summary.sampleCount,
    p50: summary.p50,
    p95: summary.p95,
    p99: summary.p99,
    max: summary.max,
    framesAbove32Ms: summary.framesAbove32Ms,
    framesAbove50Ms: summary.framesAbove50Ms,
    backlogSheddingFrames: summary.backlogSheddingFrames,
  };
}

function numberDelta(value, floors) {
  const floorValues = floors.map(Number).filter(Number.isFinite);
  if (!Number.isFinite(Number(value)) || floorValues.length === 0) return null;
  return Number(value) - mean(floorValues);
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mean(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((total, value) => total + value, 0) / finite.length : null;
}

function sum(values) {
  return values.reduce((total, value) => total + (Number.isFinite(Number(value)) ? Number(value) : 0), 0);
}

function round3(value) {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : value;
}

function sameNumber(left, right) {
  return Number.isFinite(left) && Number.isFinite(Number(right)) && Math.abs(left - Number(right)) <= 1e-6;
}

function finitePositive(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function finiteNonnegative(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;
}

function finiteUnitScale(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function stableStringify(value) {
  return JSON.stringify(value, (key, entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
    const sorted = {};
    for (const name of Object.keys(entry).sort()) sorted[name] = entry[name];
    return sorted;
  });
}
