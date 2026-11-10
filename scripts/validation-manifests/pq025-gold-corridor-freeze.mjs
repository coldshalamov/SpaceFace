// PQ-025 Phase-0 FREEZE — held-out Gold Corridor qualification.
//
// This file IS the pre-qualification freeze the packet requires (design/program/roadmap/active/
// PQ-025.md, Phase 0 boxes 2-3 and entry condition 6): the career/horizon/scenario/runtime/
// accessibility/profile matrix, the human rubric and its failure thresholds, the disqualifiers,
// capture identity, artifact retention, and the held-out salt/seed process are FROZEN here before
// any qualification attempt may run.
//
// Commit-reveal, stated plainly: the salt commitment and the reveal are committed together, in the
// freeze commit. The packet's commit-reveal protects a MULTI-SESSION reveal process; in a
// single-candidate local qualification its verifiable function is that qualification seeds are
// DERIVED, never chosen: `deriveFrozenCellPlan(candidateCommit)` recomputes every seed from
// committed inputs only (salt + candidate commit + cell coordinates), `verifySeedReveal` proves the
// salt matches the published commitment, and the derivation itself refuses runtime, profile,
// hardware, capture, and wall-clock inputs (SEED_DERIVATION_FORBIDDEN_KEYS), so parity pairs share
// one seed across runtimes by construction. Nothing about a seed is hand-picked.
//
// The candidate commit is deliberately NOT frozen in this file: the freeze commit cannot know its
// own hash. The candidate is stamped at qualification-launch time (`git rev-parse HEAD`) and
// `auditFreezeReadiness` rejects any stamp whose production-source tree is not clean.
//
// This module is NOT a registered broker manifest and does not enable one. `registryEnabled`
// stays false on pq025-gold-corridor-smoke.mjs and pq025-gold-corridor-qualification.mjs.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  CAREERS,
  HORIZONS_MIN,
  createQualificationMatrix,
  createSeedCommitment,
  createFingerprintRegistry,
  deriveHeldOutSeed,
  parityPairId,
  PROFILE_THRESHOLDS,
  REQUIRED_PERFORMANCE_METRICS,
  ACCESSIBILITY_REQUIRED_CHECKS,
  validateMatrixCompleteness,
  verifySeedReveal,
} from '../lib/goldCorridorAcceptanceContracts.mjs';

export const PQ025_FREEZE_SCHEMA = 'pq025.freeze.v1';
export const PQ025_FREEZE_REVISION = 1;

/** Freeze instant. Everything below is frozen AS OF this stamp and may only be superseded by a new freeze revision. */
export const PQ025_FREEZE_FROZEN_AT_ISO = '2026-09-25T00:00:00Z';

// ---------------------------------------------------------------------------------------------
// Held-out salt — commit (published hash) + reveal (salt itself, published at freeze)
// ---------------------------------------------------------------------------------------------

const HELD_OUT_SALT = '0758ca144627f6ce6bc15ee14fd37f0bb13ea5fd47b912ff';
const HELD_OUT_NONCE = 'fb5b83cfadadeb2204b135d4';

export const PQ025_HELD_OUT_SALT_COMMITMENT = createSeedCommitment({
  heldOutSalt: HELD_OUT_SALT,
  nonce: HELD_OUT_NONCE,
  declaredAtIso: PQ025_FREEZE_FROZEN_AT_ISO,
});

export const PQ025_HELD_OUT_SALT_REVEAL = Object.freeze({
  heldOutSalt: HELD_OUT_SALT,
  nonce: HELD_OUT_NONCE,
  revealedAtIso: PQ025_FREEZE_FROZEN_AT_ISO,
  commitmentSchema: PQ025_HELD_OUT_SALT_COMMITMENT.schema,
});

export const PQ025_SEED_POLICY = Object.freeze({
  kind: 'held-out-commit-reveal',
  derivation: 'pq025.seed.v1',
  module: 'scripts/lib/goldCorridorAcceptanceContracts.mjs',
  runtimeIndependent: true,
  candidateStampRule: 'candidateCommit is stamped at qualification-launch time from `git rev-parse HEAD`; auditFreezeReadiness rejects a stamp with a dirty production-source tree.',
});

// ---------------------------------------------------------------------------------------------
// Frozen matrix — Phase 4 (30-min) + Phase 5 (90-min) required cells, plus declared support cells
// ---------------------------------------------------------------------------------------------
//
// Runtime distribution follows packet Phase 4: the three 30-minute career cells are spread across
// Browser and Electron so both runtimes are represented; the same holds at 90 minutes (Phase 5).
// Exactly one failure/recovery cell is declared (packet Phase 4 allows at most one): the hunter
// career exercises combat/adverse recovery natively, so the required cell sits there, in Browser,
// at 30 minutes.
//
// Support cells (required: false) are the packet's targeted cross-runtime parity partners: the SAME
// derived seed on the other runtime, run as a short checkpoint-parity segment — never a duplicated
// full horizon (packet Phase 4: "do not duplicate every 30-minute career×scenario combination").

const REQUIRED_CELLS = Object.freeze([
  // Phase 4 — native 30-minute cells, one per career, both runtimes represented.
  { career: 'hauler', horizonMin: 30, scenarioClass: 'success', runtimeKind: 'browser', profileClass: 'target' },
  { career: 'hunter', horizonMin: 30, scenarioClass: 'success', runtimeKind: 'electron', profileClass: 'target' },
  { career: 'prospector', horizonMin: 30, scenarioClass: 'success', runtimeKind: 'browser', profileClass: 'target' },
  // Phase 5 — native 90-minute success cells, one per career, both runtimes represented.
  { career: 'hauler', horizonMin: 90, scenarioClass: 'success', runtimeKind: 'browser', profileClass: 'target' },
  { career: 'hunter', horizonMin: 90, scenarioClass: 'success', runtimeKind: 'electron', profileClass: 'target' },
  { career: 'prospector', horizonMin: 90, scenarioClass: 'success', runtimeKind: 'browser', profileClass: 'target' },
  // The single risk-justified failure/recovery cell (packet Phase 4).
  { career: 'hunter', horizonMin: 30, scenarioClass: 'failure-recovery', runtimeKind: 'browser', profileClass: 'target' },
]);

const SUPPORT_CELLS = Object.freeze([
  { career: 'hauler', horizonMin: 30, scenarioClass: 'success', runtimeKind: 'electron', profileClass: 'target', supportKind: 'targeted-parity-of:0', required: false },
  { career: 'hunter', horizonMin: 30, scenarioClass: 'success', runtimeKind: 'browser', profileClass: 'target', supportKind: 'targeted-parity-of:1', required: false },
  { career: 'prospector', horizonMin: 30, scenarioClass: 'success', runtimeKind: 'electron', profileClass: 'target', supportKind: 'targeted-parity-of:2', required: false },
  { career: 'hauler', horizonMin: 90, scenarioClass: 'success', runtimeKind: 'electron', profileClass: 'target', supportKind: 'targeted-parity-of:3', required: false },
  { career: 'hunter', horizonMin: 90, scenarioClass: 'success', runtimeKind: 'browser', profileClass: 'target', supportKind: 'targeted-parity-of:4', required: false },
  { career: 'prospector', horizonMin: 90, scenarioClass: 'success', runtimeKind: 'electron', profileClass: 'target', supportKind: 'targeted-parity-of:5', required: false },
]);

export function createFrozenQualificationMatrix() {
  return createQualificationMatrix({
    cells: [...REQUIRED_CELLS, ...SUPPORT_CELLS],
    frozenAtIso: PQ025_FREEZE_FROZEN_AT_ISO,
    rubricHash: PQ025_RUBRIC_HASH,
    criticalQuestionIds: PQ025_FROZEN_RUBRIC.questions.map((q) => q.id),
  });
}

/**
 * createQualificationMatrix normalizes cells to the frozen matrix vocabulary and DROPS `supportKind`,
 * so the parity link is carried here, by array position (createFrozenQualificationMatrix concatenates
 * the same two lists in the same order, so indices align).
 */
const SUPPORT_KIND_BY_CELL_INDEX = Object.freeze(
  new Map([...REQUIRED_CELLS, ...SUPPORT_CELLS].map((cell, index) => [index, cell.supportKind ?? null])),
);

// ---------------------------------------------------------------------------------------------
// Frozen human rubric — critical questions close on printed numbers (owner ruling 2026-09-07)
// ---------------------------------------------------------------------------------------------
//
// No human watches long captures (packet owner ruling). Verdicts on these questions are recorded by
// the independent reviewer FROM PRINTED NUMBERS AND RETAINED EVIDENCE — milestone/blocker receipts,
// attempt ledgers, perf owner facts — never from headed viewing. A critical question left
// unanswered is unknown evidence, and unknown is never a pass (goldCorridorAcceptanceAggregate).

export const PQ025_FROZEN_RUBRIC = Object.freeze({
  version: 'pq025.rubric.v1',
  verdictSource: 'independent reviewer, from printed numbers and retained evidence only',
  questions: Object.freeze([
    { id: 'R1-discoverability', critical: true, question: 'Could each checkpoint be reached using only what a real player sees and controls (no hidden-state hint)?', failureThreshold: 'any checkpoint reached only via information a player cannot see fails the cell' },
    { id: 'R2-career-identity', critical: true, question: 'Does the route read as the assigned career rather than a generic fetch loop?', failureThreshold: 'missing career origin acceptance or zero career-ladder progression in a 90-minute cell fails it' },
    { id: 'R3-purchase-coherence', critical: true, question: 'Is the legal purchase charged once, owned once, fitted legally, with a measurable capability delta that survives cold Continue?', failureThreshold: 'any PURCHASE_CHAIN_STEPS step missing, or zero capability delta, fails the cell' },
    { id: 'R4-recovery-comprehensibility', critical: true, question: 'Are the adverse state and its recovery path understandable from cues alone (non-color, non-audio included)?', failureThreshold: 'recovery not evidenced by recovery:completed/recovery:receipt within the declared window fails the cell' },
    { id: 'R5-continuity', critical: true, question: 'Does cold Continue restore a coherent world in which a meaningful action is possible?', failureThreshold: 'post-Continue semantic digest not matching the pre-save digest fails the cell' },
    { id: 'R6-massline-semantics', critical: true, question: 'Is the Massline use an authoritative success (attach + validated release), not an opportunity or attempt?', failureThreshold: 'missing tether:attached or massline:releaseValidated fails the cell where the route assigns Massline' },
    { id: 'R7-parity-meaningfulness', critical: true, question: 'Is cross-runtime parity semantic (same seed, equivalent checkpoint digests), not superficial?', failureThreshold: 'a targeted-parity pair with divergent checkpoint digests fails parity' },
    { id: 'R8-route-coherence', critical: true, question: 'Is the route coherent rather than merely executable (would a player call it a game, not a test script)?', failureThreshold: 'reviewer closes this from printed evidence at review closure; a critical fail here is an acceptance fail and cannot be waived' },
  ]),
});

export const PQ025_RUBRIC_HASH = __rubricHash();

import { canonicalJson, sha256Hex } from '../lib/goldCorridorAcceptanceContracts.mjs';

function __rubricHash() {
  return sha256Hex(canonicalJson(PQ025_FROZEN_RUBRIC));
}

// ---------------------------------------------------------------------------------------------
// Frozen profile manifest — assignment before runs, never inferred from measured cadence
// ---------------------------------------------------------------------------------------------
//
// One hardware/execution identity exists in this sitting: this workstation, default quality,
// windowed 1440x900, timeScale locked to 1. Every required cell is therefore assigned `target`
// (p95 <= 16.7 ms, PROFILE_THRESHOLDS). The `floor` class is FROZEN as a threshold contract
// (p95 <= 33.3 ms, floor-aware raw>32ms reporting, never blindly zero-gated) but has NO assigned
// hardware in this sitting — floor-hardware cells require an amendment freeze naming that
// hardware. A diagnostic profile is never acceptance-eligible and is assigned nowhere.

export const PQ025_PROFILE_MANIFEST = Object.freeze({
  frozenAtIso: PQ025_FREEZE_FROZEN_AT_ISO,
  thresholds: PROFILE_THRESHOLDS,
  requiredMetricsPerAttempt: REQUIRED_PERFORMANCE_METRICS,
  requiredAccessibilityChecks: ACCESSIBILITY_REQUIRED_CHECKS,
  hardwareProfile: Object.freeze({
    id: 'sf-qual-hw-shared-workstation',
    descriptor: 'single Windows x64 workstation (win32 10.0.26200), the only hardware in this sitting',
  }),
  executionProfile: Object.freeze({
    id: 'default-quality-windowed-1440x900',
    viewport: Object.freeze({ width: 1440, height: 900 }),
    quality: 'default (never reduced to pass — assertQualityUnchanged)',
    timeScale: 1,
    reducedMotion: false,
    settingsFrozen: true,
  }),
  runtimeVersions: Object.freeze({
    browser: 'playwright-driven Chromium at the repo-pinned version (recorded per attempt by the adapter)',
    electron: 'repo-pinned Electron (recorded per attempt by the adapter)',
  }),
  ownerFactSources: Object.freeze({
    note: 'the five performance owner facts (p50/p99/missedVsync/residency/draw-triangle counts) are read from the owner seam landed by PQ-025.perf-owner-facts and composed by normalizePerformanceOwnerFacts; a harness-side guess is never a substitute',
    composer: 'scripts/lib/goldCorridorAcceptanceContracts.mjs :: normalizePerformanceOwnerFacts',
  }),
  floorAssignment: Object.freeze({
    assigned: false,
    reason: 'no floor hardware/execution profile exists in this sitting; floor thresholds are frozen, floor cells require an amendment freeze naming that hardware',
  }),
});

// ---------------------------------------------------------------------------------------------
// Frozen disqualifiers, capture identity, artifact retention
// ---------------------------------------------------------------------------------------------

export const PQ025_FROZEN_DISQUALIFIERS = Object.freeze([
  'wrong or dirty candidate revision at launch (packet stop condition; QUALIFICATION class)',
  'dependency receipt hash mismatch against PQ025_DEPENDENCY_RECEIPT_HASHES',
  'seed not re-derivable from PQ025_SEED_POLICY inputs, or runtimeKind present in derivation',
  'scenario/profile/career/horizon relabel after observation (assertNoRelabel)',
  'native wall duration short, pause/unfocus/loading counted, timeScale !== 1, sim reconciliation failure',
  'purchase without charge/ownership/legal fit/capability delta/cold Continue, or research/preview counted as purchase',
  'Massline attempt without authoritative tether:attached + validated release',
  'target evaluated at floor threshold; floor blindly zero-gating raw > 32 ms; diagnostic accepted',
  'required perf metric missing (p50/p95/p99/max/missed-vsync/multi-step/backlog/phase costs/counts/residency/save-blocking)',
  'capture reused across attempts or cells; stale media/receipt/save resubmitted',
  'default quality or settings changed',
  'required cell missing, failed, or unknown — one hard failure fails qualification, averages diagnose only',
  'critical rubric question unanswered or failed; human verdict waiving a hard technical failure',
]);

export const PQ025_CAPTURE_IDENTITY = Object.freeze({
  frozenAtIso: PQ025_FREEZE_FROZEN_AT_ISO,
  rule: 'captureId is content-addressed (sha256 of capture content) through the fingerprint registry; one raw capture satisfies exactly one attempt',
  registry: 'createFingerprintRegistry / registerCapture (goldCorridorAcceptanceContracts.mjs)',
  uniquenessAudit: 'auditCaptureUniqueness (goldCorridorAcceptanceAggregate.mjs) sweeps the whole ledger at decision time',
  mediaEphemeral: Object.freeze({
    rule: 'owner ruling 2026-09-07: acceptance cells run unattended; any media produced is analyzed in-session and then deleted — never stored',
    evidenceForm: 'the attempt retains the capture registration receipt (hash, dimensions, deleted flag), not the media',
  }),
});

export const PQ025_ARTIFACT_RETENTION = Object.freeze({
  frozenAtIso: PQ025_FREEZE_FROZEN_AT_ISO,
  attempts: 'append-only, retained forever, including invalid and failed attempts; environment/harness replacement creates a new ordinal and retains the old attempt',
  ledger: 'hash-chained attempt ledger under the qualification artifactRoot; never rewritten',
  numericEvidence: 'receipts, owner facts, and checkpoint digests retained with their attempt',
  media: 'ephemeral per owner ruling 2026-09-07 (analyzed in-session, deleted; registration receipt retained)',
  saves: 'retained with the attempt for parity verification',
  reruns: 'no best-of-N, no unchanged-candidate rerun; evaluateRerunRequest decides, auditRerunLegality re-checks at decision time',
});

// ---------------------------------------------------------------------------------------------
// Frozen dependency receipt hashes (entry condition: "required dependency receipt hashes are exact")
// ---------------------------------------------------------------------------------------------

export const PQ025_DEPENDENCY_RECEIPT_HASHES = Object.freeze({
  'PQ-019-h2-facility-route-REPORT.md': '6c5442283e7bc179e7d03039d237121e5a37c7033adbf1908d8d317e49027905',
  'PQ-019-h3-performance-REPORT.md': 'acf923d8e0a91c0cde8195d692bca5d693e94d2e09310a0b8175a4ddb188f7d2',
  'PQ-019-surface-heist-h1-capture-REPORT.md': 'c509ac0cec4b34567cc7dbd4ef265fb81bee20375b5cad7d1dfeefbd6224d844',
  'PQ-019-receiver-facility-reauthor-REPORT.md': '694f2a42d6ec31e904390625949b99d34f8bc8b04fd44617aaadf0d41ca5bd10',
  'PQ-020-h3-performance-REPORT.md': 'f8a9fe7327b4afb863578a845235c7759116fee17dd0b220d53da5681a5fe2d7',
  'PQ-020-ceres-h1-capture-REPORT.md': '2aff5eba3631057233349556e119b3c08d95c6b0e1973be60917ed1037ad4262',
  'PQ-020-h2-pocket-cathedral-REPORT.md': '0bdcf5005eb49ed66b36534b0210c7b6efe34ad5ca7f6417339d39280e40227e',
  'PQ-021-h2-legibility-controller-REPORT.md': 'f2349ed8b597a37bb593a0f0320a594b92d495328341c3dc51a22deb6bdd0209',
  'PQ-022-corridor-required-assets-REPORT.md': '1ceea4ea4ea58a0d35e9848ac5ab764c7a64e7d0b56dc5509d3f32b93352f628',
  'PQ-022-exterior-relay-collar-REPORT.md': '8d8778eb7c6e34e1ce99295bf732ef7493b41d123332e8c863a0e5dc11355acf',
  'PQ-023-gold-corridor-required-cues-REPORT.md': 'eb1feb331c9f406b866a1179640ba24b1f94d460491656b0fe425ddaf64f452f',
  'PQ-024-survey-claim-REPORT.md': 'b65c9652371066683dd5adcea408a1030507408766e6e57cf0534ed744441ae4',
  'PQ-024-survey-h1-capture-REPORT.md': '33f6df09de412318bca66b6cfa5dd7dc7974f0217beb46cd0ad73ba4d30f856b',
  'PQ-024-h2-survey-relay-review-REPORT.md': '66bf220e140183c1377d33b071d41ddd9e563141bef7ba1cd99ca71a4f29d4fb',
  'PQ-024-h3-performance-REPORT.md': '9ecebd5f6ed79bbe74002c5bac1c326bde317678e13207b3bf0a16ca35494d3c',
  'PQ-024-committed-transition-review-REPORT.md': '1f335d7aae48a57f4054306ac021e16ee15f8650ce46fecbd92e95cb24f30dda',
  'PQ-025-performance-owner-facts-REPORT.md': 'cb3c8b601ef30cbf7a3e4dda87e918149e9e19b01ae3eac1b71a921a5e8cfaac',
});

export const PQ025_RECEIPTS_DIR = 'design/program/roadmap/receipts/';

// ---------------------------------------------------------------------------------------------
// Seed derivation per frozen cell — the ONLY way qualification seeds come into existence
// ---------------------------------------------------------------------------------------------

const HEX40 = /^[0-9a-f]{40}$/;

/**
 * Derive the full cell plan (seed, parity id, cell key) for every frozen cell at a stamped
 * candidate commit. Pure: same inputs, same seeds, on either runtime. Throws on a bad stamp.
 *
 * A targeted-parity support cell derives from its TARGET cell's index (`targeted-parity-of:N`), so
 * the pair shares one seed and one parityPairId by construction — a parity pair is the SAME cell
 * run on the other runtime, not a second cell (goldCorridorAcceptanceContracts.mjs :: parityPairId).
 */
export function deriveFrozenCellPlan(candidateCommit) {
  if (!HEX40.test(String(candidateCommit))) throw new Error('freeze-bad-candidate-commit');
  const matrix = createFrozenQualificationMatrix();
  return matrix.cells.map((cell) => {
    const supportKind = SUPPORT_KIND_BY_CELL_INDEX.get(cell.cellIndex) ?? null;
    const parityOf = typeof supportKind === 'string' ? supportKind.match(/^targeted-parity-of:(\d+)$/) : null;
    const derivationCellIndex = parityOf ? Number(parityOf[1]) : cell.cellIndex;
    const derived = deriveHeldOutSeed({
      heldOutSalt: PQ025_HELD_OUT_SALT_REVEAL.heldOutSalt,
      candidateCommit,
      career: cell.career,
      horizonMin: cell.horizonMin,
      scenarioClass: cell.scenarioClass,
      cellIndex: derivationCellIndex,
    });
    return Object.freeze({
      cellIndex: cell.cellIndex,
      career: cell.career,
      horizonMin: cell.horizonMin,
      scenarioClass: cell.scenarioClass,
      runtimeKind: cell.runtimeKind,
      profileClass: cell.profileClass,
      accessibilityProfile: cell.accessibilityProfile,
      required: cell.required,
      cellKey: cell.cellKey,
      supportKind,
      derivationCellIndex,
      seed: derived.seed,
      seedDerivationVersion: derived.seedDerivationVersion,
      seedDigest: derived.digest,
      parityPairId: parityPairId({
        candidateCommit, career: cell.career, horizonMin: cell.horizonMin,
        scenarioClass: cell.scenarioClass, cellIndex: derivationCellIndex,
      }),
    });
  });
}

// ---------------------------------------------------------------------------------------------
// Fail-closed readiness audit — the Phase-2 instrument for THIS freeze
// ---------------------------------------------------------------------------------------------
// Pure data above; the audit below inspects the live tree and is meant to be run, and its output
// recorded, at calibration and again at qualification launch. It never passes on missing evidence.

const PROBE_ADAPTERS = Object.freeze([
  'scripts/probe-pq025-gold-corridor-smoke.mjs',
  'scripts/probe-pq025-gold-corridor-qualification.mjs',
]);

export function auditFreezeReadiness({ candidateCommit = null, treeDirtyLimit = 0 } = {}) {
  const blockers = [];
  const warnings = [];
  const facts = {};

  // 1. The freeze itself must be internally consistent.
  if (!verifySeedReveal(PQ025_HELD_OUT_SALT_COMMITMENT, PQ025_HELD_OUT_SALT_REVEAL).ok) {
    blockers.push('freeze:seed-reveal-does-not-match-commitment');
  }
  const matrix = createFrozenQualificationMatrix();
  const completeness = validateMatrixCompleteness(matrix);
  facts.matrix = { schema: matrix.schema, frozenAtIso: matrix.frozenAtIso, cells: matrix.cells.length, required: matrix.cells.filter((c) => c.required).length };
  facts.matrixCompleteness = completeness;
  if (!completeness.ok) blockers.push(...completeness.errors.map((e) => `freeze:${e}`));
  if (matrix.rubricHash !== PQ025_RUBRIC_HASH) blockers.push('freeze:rubric-hash-mismatch');
  facts.rubricHash = PQ025_RUBRIC_HASH;
  facts.criticalQuestionIds = matrix.criticalQuestionIds;

  // Parity pairs must share seed + parity id with their target cell (runtime excluded from
  // derivation is what makes this hold; a partner deriving its own seed would be a second cell).
  const probeStamp = '0'.repeat(40);
  const probePlan = deriveFrozenCellPlan(probeStamp);
  const byIndex = new Map(probePlan.map((entry) => [entry.cellIndex, entry]));
  for (const entry of probePlan) {
    if (typeof entry.supportKind !== 'string' || !entry.supportKind.startsWith('targeted-parity-of:')) continue;
    const target = byIndex.get(Number(entry.supportKind.slice('targeted-parity-of:'.length)));
    if (!target) blockers.push(`freeze:parity-target-missing:${entry.cellKey}`);
    else if (target.seed !== entry.seed || target.parityPairId !== entry.parityPairId) {
      blockers.push(`freeze:parity-seed-divergence:${entry.cellKey}`);
    } else if (target.runtimeKind === entry.runtimeKind) {
      blockers.push(`freeze:parity-same-runtime:${entry.cellKey}`);
    }
  }
  facts.parityPairs = probePlan.filter((entry) => entry.supportKind).length;

  // 2. Dependency receipts must exist unchanged since the freeze. Note: sha256Hex canonicalizes
  // non-string input, so the file is hashed as utf8 TEXT (matching how the frozen hashes above
  // were computed), not as a raw buffer.
  const receiptsRoot = path.resolve(fileURLToPath(new URL('../../', import.meta.url)), PQ025_RECEIPTS_DIR);
  const receiptDrift = [];
  for (const [name, frozenHash] of Object.entries(PQ025_DEPENDENCY_RECEIPT_HASHES)) {
    const p = path.join(receiptsRoot, name);
    if (!existsSync(p)) { receiptDrift.push(`${name}:missing`); continue; }
    const actual = sha256Hex(readFileSync(p, 'utf8'));
    if (actual !== frozenHash) receiptDrift.push(`${name}:changed`);
  }
  facts.dependencyReceipts = { frozen: Object.keys(PQ025_DEPENDENCY_RECEIPT_HASHES).length, drift: receiptDrift };
  if (receiptDrift.length > 0) blockers.push(`freeze:dependency-receipt-drift:${receiptDrift.join(',')}`);

  // 3. Candidate stamp: required for qualification, optional for a freeze-only audit.
  if (candidateCommit !== null) {
    if (!HEX40.test(String(candidateCommit))) blockers.push('candidate:stamp-not-40-hex');
    else {
      facts.candidateCommit = candidateCommit;
      let porcelain = '';
      try {
        porcelain = execSync('git status --porcelain', { encoding: 'utf8', cwd: path.resolve(fileURLToPath(new URL('../../', import.meta.url))) });
      } catch (error) {
        blockers.push(`candidate:git-status-failed:${error?.message || error}`);
      }
      const dirty = porcelain.split('\n').filter((line) => line.trim().length > 0);
      facts.worktreeDirtyEntries = dirty.length;
      if (dirty.length > treeDirtyLimit) {
        blockers.push(`candidate:source-fingerprint-dirty:${dirty.length}-entries-carry-concurrent-work`);
      }
      facts.derivedCellPlan = deriveFrozenCellPlan(candidateCommit);
    }
  } else {
    warnings.push('candidate:commit-not-stamped-yet (stamping happens at qualification-launch time)');
  }

  // 4. Probe adapters must exist before any cell can run (they are not written by this freeze).
  const missingAdapters = PROBE_ADAPTERS.filter((rel) => !existsSync(path.resolve(fileURLToPath(new URL('../../', import.meta.url)), rel)));
  facts.probeAdapters = { required: PROBE_ADAPTERS, missing: missingAdapters };
  if (missingAdapters.length > 0) blockers.push(`adapters:missing:${missingAdapters.join(',')}`);

  // 5. Floor profile has no hardware in this sitting — declared, so a warning, not a surprise.
  if (PQ025_PROFILE_MANIFEST.floorAssignment.assigned === false) {
    warnings.push(`profile:${PQ025_PROFILE_MANIFEST.floorAssignment.reason}`);
  }

  return { ok: blockers.length === 0, blockers: Object.freeze(blockers), warnings: Object.freeze(warnings), facts: Object.freeze(facts) };
}

// Convenience re-export so a qualification adapter can build a fresh fingerprint registry without
// importing the contracts module twice under different specifiers.
export { createFingerprintRegistry, CAREERS, HORIZONS_MIN };

export const pq025GoldCorridorFreeze = Object.freeze({
  schema: PQ025_FREEZE_SCHEMA,
  revision: PQ025_FREEZE_REVISION,
  frozenAtIso: PQ025_FREEZE_FROZEN_AT_ISO,
  seedPolicy: PQ025_SEED_POLICY,
  saltCommitment: PQ025_HELD_OUT_SALT_COMMITMENT,
  rubricHash: PQ025_RUBRIC_HASH,
  profileManifestId: PQ025_PROFILE_MANIFEST.executionProfile.id,
});

export default pq025GoldCorridorFreeze;
