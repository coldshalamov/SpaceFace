// PQ-025 — held-out Gold Corridor qualification: PURE contracts (Phase 0 + Phase 1).
//
// This module is an OBSERVATIONAL ACCEPTANCE COMPOSITOR. It contains no gameplay, no browser or
// process code, no simulation, and no owner mutation. It encodes:
//   * the Phase-0 semantic map (required outcome -> current owner evidence surface + raw ref);
//   * run/attempt/aggregate schemas covering the packet's attempt-identity JSON exactly;
//   * runtime-independent held-out seed derivation + commit-reveal;
//   * an append-only attempt ledger with a structural hash chain;
//   * the failure taxonomy and rerun policy (no best-of-N, no unchanged-candidate rerun);
//   * the performance profile contract (target/floor/diagnostic) with frozen-before-run assignment;
//   * owner-evidence normalization where `unknown` can never become a pass;
//   * capture/source/hardware/execution fingerprint uniqueness.
//
// Everything here is deterministic and side-effect free. Nothing in this module may launch the game.

import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------------------------
// Canonical serialization + hashing
// ---------------------------------------------------------------------------------------------

/**
 * Deterministic JSON: object keys are emitted in sorted order at every depth so that two
 * structurally equal values always hash identically regardless of construction order.
 */
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

export function sha256Hex(input) {
  return createHash('sha256').update(typeof input === 'string' ? input : canonicalJson(input)).digest('hex');
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return value;
}

export { deepFreeze };

const HEX40 = /^[0-9a-f]{40}$/;
const HEX64 = /^[0-9a-f]{64}$/;

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

// ---------------------------------------------------------------------------------------------
// PHASE 0 — semantic map: required outcome -> CURRENT owner evidence surface
// ---------------------------------------------------------------------------------------------
//
// Every row was located by reading the live source at the candidate revision. `rawRef` is a
// file:line reference that a reviewer can open. `confidence` is `verified` only when a concrete
// owner symbol was read; `absent` rows are Phase-0 stop-condition findings that require a narrow
// owner-owned READ SEAM (never an acceptance-only gameplay event).
//
// OBSERVER SEAM NOTE (applies to every `projection` row): projections are reachable only through
// the debug-gated `window.SF` handle installed in src/main.js:189/198 under `SF_DEBUG`. Electron
// loads the same localhost source as Browser (electron/main.cjs:149), so the seam is shared across
// both runtimes, but any packaged/production build strips it. This is a single point of failure
// for all projection-kind evidence and is recorded once here rather than repeated per row.

export const OWNER_EVIDENCE_KINDS = Object.freeze(['event', 'projection', 'receipt', 'absent']);
export const OWNER_CONFIDENCE = Object.freeze(['verified', 'degraded', 'unknown', 'absent']);

export const SEMANTIC_MAP_VERSION = 'pq025.semantic-map.v1';

export const SEMANTIC_OUTCOME_MAP = deepFreeze([
  {
    outcome: 'economy.meaningfulness',
    owner: 'economy',
    module: 'src/systems/economy.js',
    symbol: 'economy:tradeCompleted',
    evidenceKind: 'event',
    rawRef: 'src/systems/economy.js:1047',
    confidence: 'verified',
    note: 'Completed trade receipt. Credit movement is separately witnessed by credits:changed.',
  },
  {
    outcome: 'economy.creditMovement',
    owner: 'economy',
    module: 'src/systems/economy.js',
    symbol: 'credits:changed',
    evidenceKind: 'event',
    rawRef: 'src/systems/economy.js:1188,1199',
    confidence: 'verified',
    note: 'reason=grant on credit, reason=charge on debit. Charge is the purchase-charge witness.',
  },
  {
    outcome: 'progression.careerLoop',
    owner: 'missions',
    module: 'src/systems/missions.js',
    symbol: 'mission:accepted / mission:conditionSatisfied',
    evidenceKind: 'event',
    rawRef: 'src/systems/missions.js:1498,697',
    confidence: 'verified',
    note: 'One completed career loop = accepted -> conditionSatisfied for that mission instance.',
  },
  {
    outcome: 'progression.careerLadder',
    owner: 'careerLadders',
    module: 'src/careers/ladders/careerLadders.js',
    symbol: 'getLadderProgress(state, careerId)',
    evidenceKind: 'projection',
    rawRef: 'src/careers/ladders/careerLadders.js:107',
    confidence: 'verified',
    note: 'Ladder advance has no dedicated receipt event; progress is read as a projection.',
  },
  {
    outcome: 'career.identity',
    owner: 'careerOrigins',
    module: 'src/careers/origins/',
    symbol: 'career:origin:offered | HUNTER_ORIGIN_EVENTS.* | PROSPECTOR_EVENTS.*',
    evidenceKind: 'event',
    rawRef: 'src/careers/origins/haulerOriginSystem.js:176; hunterOrigin.js:169,222; prospectorOrigin.js:111',
    confidence: 'verified',
    note: 'All three careers publish origin events; event NAMES differ per career (not one shared vocabulary).',
  },
  {
    outcome: 'purchase.legal',
    owner: 'ships',
    module: 'src/systems/ships.js',
    symbol: 'module:purchased / ship:purchased',
    evidenceKind: 'event',
    rawRef: 'src/systems/ships.js:739,803',
    confidence: 'verified',
    note: 'module:purchased carries {defId, price, fitSlotIndex}. Purchase != research/preview.',
  },
  {
    outcome: 'purchase.ownership',
    owner: 'ships',
    module: 'src/systems/ships.js',
    symbol: 'module:granted',
    evidenceKind: 'event',
    rawRef: 'src/systems/ships.js:752',
    confidence: 'verified',
    note: 'Ownership instance id. Distinguishes owned-once from charged-once.',
  },
  {
    outcome: 'fit.legal',
    owner: 'ships',
    module: 'src/systems/ships.js',
    symbol: 'module:equipped',
    evidenceKind: 'event',
    rawRef: 'src/systems/ships.js:929',
    confidence: 'verified',
    note: 'Legal fit into a slot. module:unequipped (948) is the inverse.',
  },
  {
    outcome: 'capability.delta',
    owner: 'ships',
    module: 'src/systems/ships.js',
    symbol: 'ship:statsChanged / ship:cargoCapChanged / ship:massChanged',
    evidenceKind: 'event',
    rawRef: 'src/systems/ships.js:645,646,768',
    confidence: 'verified',
    note: 'ship:statsChanged carries the derived stat block: the measurable capability delta.',
  },
  {
    outcome: 'capability.fittedProjection',
    owner: 'fittedModules',
    module: 'src/core/fittedModules.js',
    symbol: 'fittedModuleIds(state) / hasFittedModule(state, defId)',
    evidenceKind: 'projection',
    rawRef: 'src/core/fittedModules.js:14,24',
    confidence: 'verified',
    note: 'Persistence-through-Continue check reads this projection on both sides of the reload.',
  },
  {
    outcome: 'combat.encounter',
    owner: 'combatOutcome',
    module: 'src/systems/combatOutcome.js',
    symbol: 'combat:outcome',
    evidenceKind: 'event',
    rawRef: 'src/systems/combatOutcome.js:160',
    confidence: 'verified',
  },
  {
    outcome: 'failure.recovery',
    owner: 'recoveryEncounter',
    module: 'src/systems/recoveryEncounter.js',
    symbol: 'recovery:completed / recovery:receipt',
    evidenceKind: 'receipt',
    rawRef: 'src/systems/recoveryEncounter.js:445,446',
    confidence: 'verified',
    note: 'Non-lethal path also witnessed by combat:nonlethalResolution (surrenderRecovery.js:187).',
  },
  {
    outcome: 'save.write',
    owner: 'save',
    module: 'src/save/saveSystem.js',
    symbol: 'save:completed',
    evidenceKind: 'event',
    rawRef: 'src/save/saveSystem.js:707',
    confidence: 'verified',
  },
  {
    outcome: 'save.coldContinue',
    owner: 'save',
    module: 'src/save/saveSystem.js',
    symbol: 'save:loaded + mode:changed',
    evidenceKind: 'event',
    rawRef: 'src/save/saveSystem.js:2129,2126',
    confidence: 'verified',
    note: 'Cold Continue = fresh process/context -> save:loaded -> mode:changed into flight.',
  },
  {
    outcome: 'worldSite.outcome',
    owner: 'asteroidSites',
    module: 'src/systems/asteroidSites.js',
    symbol: 'worldSite:operationReceipt / worldSite:failureReceipt',
    evidenceKind: 'receipt',
    rawRef: 'src/systems/asteroidSites.js:452,498',
    confidence: 'verified',
    note: 'asteroidSites is the world-site RUNTIME HOST: it imports worldSiteKernel and calls applyWorldSiteOperation (asteroidSites.js:41-43,436).',
  },
  {
    outcome: 'cathedral.outcome',
    owner: 'worldSiteKernel',
    module: 'src/systems/worldSiteKernel.js',
    symbol: 'projectWorldSite(manifest, record)',
    evidenceKind: 'projection',
    rawRef: 'src/systems/worldSiteKernel.js:732',
    confidence: 'verified',
    note: 'Cathedral is a world-site instance (SHIP_LEDGER_EVIDENCE_SITE_ID=world_site_wreck_cathedral, shipLedger.js:32). Receipts arrive through the generic host event above; the per-site stage/receipt view is this projection.',
  },
  {
    outcome: 'ledger.pages',
    owner: 'shipLedger',
    module: 'src/systems/shipLedger.js',
    symbol: 'buildShipLedger(state, options)',
    evidenceKind: 'projection',
    rawRef: 'src/systems/shipLedger.js:528',
    confidence: 'verified',
    note: 'PROJECTION ONLY. No ledger:* event exists (grep for emit(\'ledger returns nothing). Page-turn evidence must be read, not subscribed.',
  },
  {
    outcome: 'ledger.cathedralEvidence',
    owner: 'shipLedger',
    module: 'src/systems/shipLedger.js',
    symbol: 'collectWreckCathedralEvidence(state)',
    evidenceKind: 'projection',
    rawRef: 'src/systems/shipLedger.js:230',
    confidence: 'verified',
  },
  {
    outcome: 'asteroidOps.outcome',
    owner: 'asteroidSites',
    module: 'src/systems/asteroidSites.js',
    symbol: 'site:created / site:machineInstalled / site:courierDelivered',
    evidenceKind: 'event',
    rawRef: 'src/systems/asteroidSites.js:745,769,1432',
    confidence: 'verified',
  },
  {
    outcome: 'massline.attachAuthoritative',
    owner: 'combat/attachments',
    module: 'src/combat/attachments.js',
    symbol: 'tether:attached',
    evidenceKind: 'event',
    rawRef: 'src/combat/attachments.js:212',
    confidence: 'verified',
    note: 'AUTHORITATIVE. Emitted only after createPhysicsAttachment succeeds and the record is stored with state=active (attachments.js:198-205). This is attach SUCCESS, not opportunity/attempt.',
  },
  {
    outcome: 'massline.attachDenied',
    owner: 'tetherGameplay',
    module: 'src/systems/tetherGameplay.js',
    symbol: 'tether:latchDenied',
    evidenceKind: 'event',
    rawRef: 'src/systems/tetherGameplay.js:100,265,270,280,299',
    confidence: 'verified',
    note: 'Denial witness. Presence of latchDenied without a subsequent tether:attached proves attempt-not-success.',
  },
  {
    outcome: 'massline.releaseAuthoritative',
    owner: 'masslineThrow / tetherGameplay',
    module: 'src/systems/masslineThrow.js',
    symbol: 'massline:releaseValidated / tether:released',
    evidenceKind: 'receipt',
    rawRef: 'src/systems/masslineThrow.js:478; src/systems/tetherGameplay.js:527',
    confidence: 'verified',
    note: 'releaseValidated carries prediction vs actual + withinTolerance: the release-success receipt.',
  },
  {
    outcome: 'massline.selectionReceipt',
    owner: 'tetherGameplay',
    module: 'src/systems/tetherGameplay.js',
    symbol: 'tether:latched.selectionReceiptId',
    evidenceKind: 'event',
    rawRef: 'src/systems/tetherGameplay.js:319-322',
    confidence: 'degraded',
    note: 'DEGRADED: selectionReceiptId reads state.masslineAcquisition, whose only publisher (_refreshAcquisitionPreview) has zero call sites, so the field is permanently null. Do NOT depend on it; use massline.attachAuthoritative.',
  },
  {
    outcome: 'run.identity',
    owner: 'gameState',
    module: 'src/core/gameState.js',
    symbol: 'state.meta.seed / state.meta.version',
    evidenceKind: 'projection',
    rawRef: 'src/core/gameState.js:87-90',
    confidence: 'verified',
    note: 'C0 new-game identity. game:new (src/ui/screens/newGame.js:358) is a COMMAND, not a receipt; the receipt is mode:changed (src/main.js:504).',
  },
  {
    outcome: 'runtime.timeScale',
    owner: 'gameState / timeEffects',
    module: 'src/core/gameState.js',
    symbol: 'state.timeScale',
    evidenceKind: 'projection',
    rawRef: 'src/core/gameState.js:93',
    confidence: 'verified',
    note: 'Only core/timeEffects.js mutates it after init. Sampled, must be exactly 1 for a native cell.',
  },
  {
    outcome: 'perf.p95',
    owner: 'perfRuntime',
    module: 'src/core/perfRuntime.js',
    symbol: 'reportStat().p95',
    evidenceKind: 'projection',
    rawRef: 'src/core/perfRuntime.js:55,63',
    confidence: 'verified',
  },
  {
    outcome: 'perf.max',
    owner: 'perfRuntime',
    module: 'src/core/perfRuntime.js',
    symbol: 'reportStat().max',
    evidenceKind: 'projection',
    rawRef: 'src/core/perfRuntime.js:63',
    confidence: 'verified',
  },
  {
    outcome: 'perf.multiStep',
    owner: 'perfRuntime',
    module: 'src/core/perfRuntime.js',
    symbol: 'loop.multiStepFrames / loop.maxStepsThisFrame',
    evidenceKind: 'projection',
    rawRef: 'src/core/perfRuntime.js:128-129,235-236',
    confidence: 'verified',
  },
  {
    outcome: 'perf.saveBlocking',
    owner: 'perfRuntime',
    module: 'src/core/perfRuntime.js',
    symbol: 'saveStats.maxBlockingSlice / maxSerializer',
    evidenceKind: 'projection',
    rawRef: 'src/core/perfRuntime.js:172-173,466-467',
    confidence: 'verified',
  },
  {
    outcome: 'perf.p50',
    owner: 'perfRuntime',
    module: 'src/core/perfRuntime.js',
    symbol: 'reportStat().p50',
    evidenceKind: 'projection',
    rawRef: 'src/core/perfRuntime.js:44-84',
    confidence: 'verified',
  },
  {
    outcome: 'perf.p99',
    owner: 'perfRuntime',
    module: 'src/core/perfRuntime.js',
    symbol: 'reportStat().p99 / reportStat().p999',
    evidenceKind: 'projection',
    rawRef: 'src/core/perfRuntime.js:44-84',
    confidence: 'verified',
  },
  {
    outcome: 'perf.missedVsync',
    owner: null,
    module: null,
    symbol: null,
    evidenceKind: 'absent',
    rawRef: 'grep missedVsync|missed-vsync over src/ and scripts/ returns nothing',
    confidence: 'absent',
    note: 'STOP-CONDITION FINDING. Missed-vsync is required per attempt and has no owner or harness surface. Needs a narrow owner read seam.',
  },
  {
    outcome: 'perf.residency',
    owner: 'harness-side only',
    module: 'scripts/lib/releaseSoakProbe.mjs',
    symbol: 'performance.memory.usedJSHeapSize',
    evidenceKind: 'absent',
    rawRef: 'scripts/lib/releaseSoakProbe.mjs:804-806; scripts/lib/pq017WorldSitePublicRoute.mjs:7176-7183',
    confidence: 'absent',
    note: 'STOP-CONDITION FINDING (owner surface). Residency baseline/peak/end is required per attempt. The product publishes no memory-residency metric; only harness probes read the Chrome-only performance.memory API, which is unavailable in other runtimes. Not an owner fact.',
  },
  {
    outcome: 'perf.drawTriangleCounts',
    owner: null,
    module: null,
    symbol: null,
    evidenceKind: 'absent',
    rawRef: 'src/core/perfRuntime.js (no drawCalls/triangles in the perf report)',
    confidence: 'absent',
    note: 'STOP-CONDITION FINDING. Draw/triangle/particle/light counts are required per attempt; perfRuntime reports entity counts only. Needs a narrow owner read seam.',
  },
]);

/** Rows whose owner fact does not exist at this revision — each is a Phase-0 finding to report. */
export function absentSemanticRows(map = SEMANTIC_OUTCOME_MAP) {
  return map.filter((row) => row.confidence === 'absent' || row.evidenceKind === 'absent');
}

/** Rows that exist but cannot be trusted as written. */
export function degradedSemanticRows(map = SEMANTIC_OUTCOME_MAP) {
  return map.filter((row) => row.confidence === 'degraded');
}

export function semanticRow(outcome, map = SEMANTIC_OUTCOME_MAP) {
  return map.find((row) => row.outcome === outcome) || null;
}

/** Structural validation of a semantic map: every row must be honest about its own confidence. */
export function validateSemanticMap(map = SEMANTIC_OUTCOME_MAP) {
  const errors = [];
  const seen = new Set();
  for (const row of map) {
    if (!nonEmptyString(row.outcome)) { errors.push('row missing outcome'); continue; }
    if (seen.has(row.outcome)) errors.push(`duplicate outcome: ${row.outcome}`);
    seen.add(row.outcome);
    if (!OWNER_EVIDENCE_KINDS.includes(row.evidenceKind)) errors.push(`${row.outcome}: bad evidenceKind`);
    if (!OWNER_CONFIDENCE.includes(row.confidence)) errors.push(`${row.outcome}: bad confidence`);
    if (!nonEmptyString(row.rawRef)) errors.push(`${row.outcome}: every row needs a raw source reference`);
    const claimsOwner = row.confidence === 'verified' || row.confidence === 'degraded';
    if (claimsOwner && !nonEmptyString(row.symbol)) errors.push(`${row.outcome}: verified/degraded row must name an owner symbol`);
    if (row.confidence === 'absent' && nonEmptyString(row.symbol) && row.evidenceKind !== 'absent') {
      errors.push(`${row.outcome}: absent row must not claim a usable symbol`);
    }
  }
  return { ok: errors.length === 0, errors: Object.freeze(errors) };
}

// ---------------------------------------------------------------------------------------------
// Matrix vocabulary
// ---------------------------------------------------------------------------------------------

export const CAREERS = Object.freeze(['hauler', 'hunter', 'prospector']);
export const HORIZONS_MIN = Object.freeze([30, 90]);
export const SCENARIO_CLASSES = Object.freeze(['success', 'failure-recovery']);
export const RUNTIME_KINDS = Object.freeze(['browser', 'electron']);
export const PROFILE_CLASSES = Object.freeze(['target', 'floor', 'diagnostic']);
export const ACCESSIBILITY_PROFILES = Object.freeze(['default', 'reduced-motion', 'text-scale-125', 'non-color-cues']);

// ---------------------------------------------------------------------------------------------
// Held-out seed derivation — RUNTIME MUST NOT ENTER THE DERIVATION
// ---------------------------------------------------------------------------------------------

export const SEED_DERIVATION_VERSION = 'pq025.seed.v1';

/** The complete, frozen input allowlist. Anything not on this list cannot influence a seed. */
export const SEED_DERIVATION_INPUT_KEYS = Object.freeze([
  'heldOutSalt',
  'candidateCommit',
  'career',
  'horizonMin',
  'scenarioClass',
  'cellIndex',
]);

/**
 * Keys that are explicitly forbidden in seed derivation. `runtimeKind` heads this list: a parity
 * pair is only meaningful when both runtimes derive the SAME seed from the same cell.
 */
export const SEED_DERIVATION_FORBIDDEN_KEYS = Object.freeze([
  'runtimeKind',
  'runtime',
  'captureId',
  'hardwareProfileId',
  'executionProfileId',
  'profileClass',
  'attemptOrdinal',
  'harnessHash',
  'observedAt',
  'wallClock',
  'measuredFps',
]);

export function deriveHeldOutSeed(input = {}) {
  const keys = Object.keys(input);
  for (const key of keys) {
    if (SEED_DERIVATION_FORBIDDEN_KEYS.includes(key)) {
      throw new Error(`seed-derivation-forbidden-input: ${key}`);
    }
    if (!SEED_DERIVATION_INPUT_KEYS.includes(key)) {
      throw new Error(`seed-derivation-unknown-input: ${key}`);
    }
  }
  for (const key of SEED_DERIVATION_INPUT_KEYS) {
    if (input[key] === undefined || input[key] === null) throw new Error(`seed-derivation-missing-input: ${key}`);
  }
  if (!HEX40.test(String(input.candidateCommit))) throw new Error('seed-derivation-bad-candidate-commit');
  if (!CAREERS.includes(input.career)) throw new Error('seed-derivation-bad-career');
  if (!HORIZONS_MIN.includes(input.horizonMin)) throw new Error('seed-derivation-bad-horizon');
  if (!SCENARIO_CLASSES.includes(input.scenarioClass)) throw new Error('seed-derivation-bad-scenario');

  const payload = {
    version: SEED_DERIVATION_VERSION,
    heldOutSalt: String(input.heldOutSalt),
    candidateCommit: String(input.candidateCommit),
    career: input.career,
    horizonMin: input.horizonMin,
    scenarioClass: input.scenarioClass,
    cellIndex: Number(input.cellIndex) | 0,
  };
  const digest = sha256Hex(canonicalJson(payload));
  // 31-bit positive seed keeps the value inside the engine's uint32 seed domain and away from 0.
  const seed = (parseInt(digest.slice(0, 8), 16) >>> 1) || 1;
  return { seed, seedDerivationVersion: SEED_DERIVATION_VERSION, digest };
}

/**
 * A parity pair is the runtime-independent identity of a cell: the same seed run on the other
 * runtime. It is derived from exactly the seed inputs minus the salt.
 */
export function parityPairId({ candidateCommit, career, horizonMin, scenarioClass, cellIndex } = {}) {
  if (!HEX40.test(String(candidateCommit))) throw new Error('parity-bad-candidate-commit');
  return sha256Hex(canonicalJson({
    version: SEED_DERIVATION_VERSION,
    candidateCommit, career, horizonMin, scenarioClass, cellIndex: Number(cellIndex) | 0,
  })).slice(0, 32);
}

// --- commit-reveal -----------------------------------------------------------------------------

export const COMMITMENT_VERSION = 'pq025.commit.v1';

export function createSeedCommitment({ heldOutSalt, nonce, declaredAtIso } = {}) {
  if (!nonEmptyString(heldOutSalt)) throw new Error('commitment-missing-salt');
  if (!nonEmptyString(nonce)) throw new Error('commitment-missing-nonce');
  return deepFreeze({
    schema: COMMITMENT_VERSION,
    commitmentHash: sha256Hex(canonicalJson({ v: COMMITMENT_VERSION, heldOutSalt, nonce })),
    declaredAtIso: declaredAtIso || null,
  });
}

export function verifySeedReveal(commitment, reveal = {}) {
  if (!commitment || commitment.schema !== COMMITMENT_VERSION) return { ok: false, reason: 'bad-commitment' };
  if (!nonEmptyString(reveal.heldOutSalt) || !nonEmptyString(reveal.nonce)) return { ok: false, reason: 'incomplete-reveal' };
  const recomputed = sha256Hex(canonicalJson({
    v: COMMITMENT_VERSION, heldOutSalt: reveal.heldOutSalt, nonce: reveal.nonce,
  }));
  if (recomputed !== commitment.commitmentHash) return { ok: false, reason: 'reveal-does-not-match-commitment' };
  return { ok: true, reason: null };
}

// ---------------------------------------------------------------------------------------------
// Attempt identity — exactly the packet's JSON
// ---------------------------------------------------------------------------------------------

export const ATTEMPT_IDENTITY_KEYS = Object.freeze([
  'candidateCommit', 'dependencyReceiptHashes', 'harnessHash', 'runId', 'career', 'horizonMin',
  'scenarioClass', 'runtimeKind', 'seed', 'seedDerivationVersion', 'parityPairId', 'profileClass',
  'hardwareProfileId', 'executionProfileId', 'captureId', 'attemptOrdinal',
]);

export function validateAttemptIdentity(identity = {}) {
  const errors = [];
  const push = (msg) => errors.push(msg);

  for (const key of ATTEMPT_IDENTITY_KEYS) {
    if (identity[key] === undefined) push(`missing:${key}`);
  }
  for (const key of Object.keys(identity)) {
    if (!ATTEMPT_IDENTITY_KEYS.includes(key)) push(`unexpected:${key}`);
  }
  if (identity.candidateCommit !== undefined && !HEX40.test(String(identity.candidateCommit))) push('bad:candidateCommit');
  if (identity.harnessHash !== undefined && !HEX64.test(String(identity.harnessHash))) push('bad:harnessHash');
  if (identity.dependencyReceiptHashes !== undefined) {
    const deps = identity.dependencyReceiptHashes;
    if (!deps || typeof deps !== 'object' || Array.isArray(deps)) push('bad:dependencyReceiptHashes');
    else for (const [dep, hash] of Object.entries(deps)) {
      if (!HEX64.test(String(hash))) push(`bad:dependencyReceiptHashes.${dep}`);
    }
  }
  if (identity.career !== undefined && !CAREERS.includes(identity.career)) push('bad:career');
  if (identity.horizonMin !== undefined && !HORIZONS_MIN.includes(identity.horizonMin)) push('bad:horizonMin');
  if (identity.scenarioClass !== undefined && !SCENARIO_CLASSES.includes(identity.scenarioClass)) push('bad:scenarioClass');
  if (identity.runtimeKind !== undefined && !RUNTIME_KINDS.includes(identity.runtimeKind)) push('bad:runtimeKind');
  if (identity.profileClass !== undefined && !PROFILE_CLASSES.includes(identity.profileClass)) push('bad:profileClass');
  if (identity.seedDerivationVersion !== undefined && identity.seedDerivationVersion !== SEED_DERIVATION_VERSION) push('bad:seedDerivationVersion');
  if (identity.seed !== undefined && !(Number.isInteger(identity.seed) && identity.seed > 0)) push('bad:seed');
  if (identity.attemptOrdinal !== undefined && !(Number.isInteger(identity.attemptOrdinal) && identity.attemptOrdinal >= 1)) push('bad:attemptOrdinal');
  for (const key of ['runId', 'parityPairId', 'hardwareProfileId', 'executionProfileId', 'captureId']) {
    if (identity[key] !== undefined && !nonEmptyString(identity[key])) push(`bad:${key}`);
  }
  return { ok: errors.length === 0, errors: Object.freeze(errors) };
}

/** Content-addressed run id. Deliberately excludes attemptOrdinal so replacements share a cell id. */
export function deriveRunId(identity = {}) {
  return sha256Hex(canonicalJson({
    candidateCommit: identity.candidateCommit,
    harnessHash: identity.harnessHash,
    career: identity.career,
    horizonMin: identity.horizonMin,
    scenarioClass: identity.scenarioClass,
    runtimeKind: identity.runtimeKind,
    seed: identity.seed,
    profileClass: identity.profileClass,
    attemptOrdinal: identity.attemptOrdinal,
  })).slice(0, 32);
}

/** Stable identity of the CELL an attempt belongs to (ordinal- and capture-independent). */
export function cellKey(identity = {}) {
  return [identity.career, identity.horizonMin, identity.scenarioClass, identity.runtimeKind, identity.profileClass].join('|');
}

// ---------------------------------------------------------------------------------------------
// Append-only attempt ledger (structural: hash chain + frozen entries)
// ---------------------------------------------------------------------------------------------

export const LEDGER_SCHEMA = 'pq025.attempt-ledger.v1';
const LEDGER_GENESIS = sha256Hex(`${LEDGER_SCHEMA}:genesis`);

export function createAttemptLedger() {
  return deepFreeze({ schema: LEDGER_SCHEMA, entries: [], headHash: LEDGER_GENESIS });
}

function entryHash(prevHash, entry) {
  // cellKey is derived from identity but is hashed anyway: without it, a forged cellKey could
  // silently reassign a retained attempt to a different matrix cell without breaking the chain.
  return sha256Hex(canonicalJson({
    prevHash,
    identity: entry.identity,
    verdict: entry.verdict,
    failureClass: entry.failureClass,
    evidencePaths: entry.evidencePaths,
    cellKey: entry.cellKey,
  }));
}

/**
 * Append an attempt. Returns a NEW frozen ledger; the input ledger is never mutated. The ordinal is
 * assigned by the ledger (never by the caller) so an attempt cannot claim someone else's slot.
 * Invalid and failed attempts are retained exactly like passing ones.
 */
export function appendAttempt(ledger, { identity, verdict, failureClass = null, evidencePaths = [] } = {}) {
  if (!ledger || ledger.schema !== LEDGER_SCHEMA) throw new Error('ledger-bad-schema');
  if (!VERDICTS.includes(verdict)) throw new Error(`ledger-bad-verdict: ${verdict}`);
  if (failureClass !== null && !FAILURE_CLASSES.includes(failureClass)) throw new Error(`ledger-bad-failure-class: ${failureClass}`);
  if (verdict !== 'pass' && failureClass === null) throw new Error('ledger-non-pass-requires-failure-class');

  const attemptOrdinal = ledger.entries.length + 1;
  const boundIdentity = { ...identity, attemptOrdinal };
  const check = validateAttemptIdentity(boundIdentity);
  if (!check.ok) throw new Error(`ledger-invalid-identity: ${check.errors.join(',')}`);

  const entry = {
    attemptOrdinal,
    identity: boundIdentity,
    verdict,
    failureClass,
    evidencePaths: [...evidencePaths],
    cellKey: cellKey(boundIdentity),
  };
  entry.entryHash = entryHash(ledger.headHash, entry);
  return deepFreeze({
    schema: LEDGER_SCHEMA,
    entries: [...ledger.entries, entry],
    headHash: entry.entryHash,
  });
}

/**
 * Structural append-only proof. `next` is a legal successor of `prev` only when prev's entries are
 * an exact prefix of next's AND the hash chain is intact. Deleting, replacing, or reordering any
 * retained attempt breaks this.
 */
export function verifyLedgerContinuity(prev, next) {
  if (!prev || !next || prev.schema !== LEDGER_SCHEMA || next.schema !== LEDGER_SCHEMA) {
    return { ok: false, reason: 'bad-schema' };
  }
  if (next.entries.length < prev.entries.length) return { ok: false, reason: 'attempt-deleted' };
  for (let i = 0; i < prev.entries.length; i += 1) {
    if (canonicalJson(prev.entries[i]) !== canonicalJson(next.entries[i])) {
      return { ok: false, reason: `attempt-replaced-at-ordinal-${i + 1}` };
    }
  }
  return verifyLedgerIntegrity(next);
}

/** Verify the chain and ordinal sequence of a single ledger. */
export function verifyLedgerIntegrity(ledger) {
  if (!ledger || ledger.schema !== LEDGER_SCHEMA) return { ok: false, reason: 'bad-schema' };
  let hash = LEDGER_GENESIS;
  for (let i = 0; i < ledger.entries.length; i += 1) {
    const entry = ledger.entries[i];
    if (entry.attemptOrdinal !== i + 1) return { ok: false, reason: `ordinal-out-of-sequence-at-${i + 1}` };
    if (entry.identity?.attemptOrdinal !== entry.attemptOrdinal) {
      return { ok: false, reason: `identity-ordinal-mismatch-at-${entry.attemptOrdinal}` };
    }
    // The cell an attempt belongs to must remain derivable from its own identity, so an attempt
    // cannot be relabelled into a different matrix cell after the fact.
    if (entry.cellKey !== cellKey(entry.identity)) {
      return { ok: false, reason: `cell-key-does-not-match-identity-at-ordinal-${entry.attemptOrdinal}` };
    }
    const expected = entryHash(hash, entry);
    if (entry.entryHash !== expected) return { ok: false, reason: `hash-chain-broken-at-ordinal-${entry.attemptOrdinal}` };
    hash = entry.entryHash;
  }
  if (ledger.headHash !== hash) return { ok: false, reason: 'head-hash-mismatch' };
  return { ok: true, reason: null };
}

export function attemptsForCell(ledger, key) {
  return ledger.entries.filter((entry) => entry.cellKey === key);
}

// ---------------------------------------------------------------------------------------------
// Failure taxonomy + rerun policy
// ---------------------------------------------------------------------------------------------

export const VERDICTS = Object.freeze(['pass', 'fail', 'invalid']);

export const PRODUCT_FAILURE_CLASSES = Object.freeze([
  'PRODUCT_ONBOARDING', 'PRODUCT_NAV', 'PRODUCT_ECONOMY', 'PRODUCT_PROGRESSION', 'PRODUCT_COMBAT',
  'PRODUCT_MASSLINE', 'PRODUCT_SAVE', 'PRODUCT_A11Y', 'PRODUCT_PERF', 'PRODUCT_PARITY',
]);

export const FAILURE_CLASSES = Object.freeze([
  'QUALIFICATION', 'ENVIRONMENT', 'HARNESS', ...PRODUCT_FAILURE_CLASSES, 'HUMAN_JUDGMENT', 'UNKNOWN',
]);

export const FAILURE_TREATMENT = deepFreeze({
  QUALIFICATION: { retainInvalid: true, rerun: 'requires-corrected-identity', hardFail: false },
  ENVIRONMENT: { retainInvalid: true, rerun: 'one-predeclared-replacement', hardFail: false, maxReplacements: 1 },
  HARNESS: { retainInvalid: true, rerun: 'requires-new-harness-hash-scoped-to-affected-evidence', hardFail: false },
  HUMAN_JUDGMENT: { retainInvalid: true, rerun: 'requires-new-candidate', hardFail: true },
  UNKNOWN: { retainInvalid: true, rerun: 'none', hardFail: true },
  ...Object.fromEntries(PRODUCT_FAILURE_CLASSES.map((cls) => [cls, {
    retainInvalid: true, rerun: 'requires-new-candidate', hardFail: true,
  }])),
});

/** Classes that fail qualification outright when present on a required cell. */
export function isHardFailureClass(failureClass) {
  const treatment = FAILURE_TREATMENT[failureClass];
  return !!treatment && treatment.hardFail === true;
}

/**
 * Decide whether a rerun of `cellKeyValue` is permitted. Encodes: no best-of-N, no unchanged
 * candidate rerun, ENVIRONMENT replacement cap, and harness-hash invalidation scoping.
 */
export function evaluateRerunRequest({
  ledger,
  cellKey: cellKeyValue,
  priorFailureClass,
  candidateCommit,
  harnessHash,
  affectedEvidencePaths = null,
} = {}) {
  const deny = (reason) => ({ allowed: false, reason });
  if (!ledger || ledger.schema !== LEDGER_SCHEMA) return deny('bad-ledger');
  if (!FAILURE_CLASSES.includes(priorFailureClass)) return deny('bad-failure-class');

  const prior = attemptsForCell(ledger, cellKeyValue);
  if (prior.length === 0) return deny('no-prior-attempt-for-cell');
  const last = prior[prior.length - 1];

  const candidateChanged = last.identity.candidateCommit !== candidateCommit;
  const harnessChanged = last.identity.harnessHash !== harnessHash;

  switch (priorFailureClass) {
    case 'UNKNOWN':
      return deny('unknown-evidence-is-a-hard-fail-no-rerun');
    case 'HUMAN_JUDGMENT':
      if (!candidateChanged) return deny('human-judgment-failure-requires-new-candidate');
      return { allowed: true, reason: 'new-candidate-after-human-judgment-failure' };
    case 'ENVIRONMENT': {
      const replacements = prior.filter((entry) => entry.failureClass === 'ENVIRONMENT').length;
      if (replacements > (FAILURE_TREATMENT.ENVIRONMENT.maxReplacements || 1)) {
        return deny('environment-replacement-budget-exhausted');
      }
      return { allowed: true, reason: 'one-predeclared-environment-replacement' };
    }
    case 'HARNESS': {
      if (!harnessChanged) return deny('harness-failure-requires-new-harness-hash');
      if (!Array.isArray(affectedEvidencePaths)) return deny('harness-rerun-requires-affected-evidence-scope');
      const touched = (last.evidencePaths || []).some((p) => affectedEvidencePaths.includes(p));
      if (!touched) return deny('harness-fix-did-not-affect-this-cell-evidence-path');
      return { allowed: true, reason: 'harness-repair-scoped-to-affected-evidence' };
    }
    case 'QUALIFICATION':
      if (!candidateChanged && !harnessChanged) return deny('qualification-rerun-requires-corrected-identity');
      return { allowed: true, reason: 'corrected-identity' };
    default:
      // PRODUCT_*: a product fix changes the candidate commit.
      if (!candidateChanged) return deny('product-failure-requires-new-candidate');
      return { allowed: true, reason: 'new-candidate-after-product-fix' };
  }
}

// ---------------------------------------------------------------------------------------------
// Performance profile contract
// ---------------------------------------------------------------------------------------------

export const PROFILE_THRESHOLDS = deepFreeze({
  target: { p95Ms: 16.7, acceptanceEligible: true },
  floor: { p95Ms: 33.3, acceptanceEligible: true },
  diagnostic: { p95Ms: null, acceptanceEligible: false },
});

/** Metrics the packet requires on EVERY attempt. A missing one is a rejection, not a warning. */
export const REQUIRED_PERFORMANCE_METRICS = Object.freeze([
  'p50Ms', 'p95Ms', 'p99Ms', 'maxMs', 'rawThresholdCounts', 'missedVsync', 'multiStepFrames',
  'backlog', 'phaseCosts', 'entityCounts', 'residencyBaseline', 'residencyPeak', 'residencyEnd',
  'saveBlockingMs',
]);

/**
 * Freeze a profile assignment BEFORE a run. Assignment may never be inferred from measured cadence,
 * so this function refuses any input carrying observed performance.
 */
export function freezeProfileAssignment({ profileClass, hardwareProfileId, executionProfileId, frozenAtIso, measuredFps } = {}) {
  if (measuredFps !== undefined) throw new Error('profile-assignment-must-not-consult-measured-fps');
  if (!PROFILE_CLASSES.includes(profileClass)) throw new Error('profile-assignment-bad-class');
  if (!nonEmptyString(hardwareProfileId)) throw new Error('profile-assignment-missing-hardware-profile');
  if (!nonEmptyString(executionProfileId)) throw new Error('profile-assignment-missing-execution-profile');
  return deepFreeze({
    profileClass,
    hardwareProfileId,
    executionProfileId,
    frozenAtIso: frozenAtIso || null,
    acceptanceEligible: PROFILE_THRESHOLDS[profileClass].acceptanceEligible,
  });
}

/**
 * Evaluate a performance sample against its FROZEN profile class.
 *  - target must clear 16.7ms; clearing only the floor bound is an explicit rejection;
 *  - floor clears at 33.3ms and REPORTS raw >32ms counts without blind zero-gating;
 *  - diagnostic is never acceptance-eligible.
 */
export function evaluatePerformanceSample(assignment, sample = {}) {
  if (!assignment || !PROFILE_CLASSES.includes(assignment.profileClass)) {
    return { ok: false, acceptanceEligible: false, reason: 'bad-profile-assignment' };
  }
  const missing = REQUIRED_PERFORMANCE_METRICS.filter((metric) => sample[metric] === undefined || sample[metric] === null);
  if (missing.length > 0) {
    return { ok: false, acceptanceEligible: false, reason: `missing-required-metric:${missing.join(',')}`, missing: Object.freeze(missing) };
  }
  if (assignment.profileClass === 'diagnostic') {
    return { ok: false, acceptanceEligible: false, reason: 'diagnostic-profile-is-never-acceptance-eligible' };
  }
  if (sample.qualityReduced === true) {
    return { ok: false, acceptanceEligible: false, reason: 'quality-reduced-to-pass' };
  }

  const p95 = Number(sample.p95Ms);
  const threshold = PROFILE_THRESHOLDS[assignment.profileClass].p95Ms;
  const rawOver32 = Number(sample.rawThresholdCounts?.over32Ms ?? 0);

  if (assignment.profileClass === 'target') {
    if (p95 > PROFILE_THRESHOLDS.target.p95Ms) {
      const reason = p95 <= PROFILE_THRESHOLDS.floor.p95Ms
        ? 'target-evaluated-at-floor-threshold'
        : 'target-p95-exceeded';
      return { ok: false, acceptanceEligible: true, reason, p95Ms: p95, thresholdMs: threshold };
    }
    return { ok: true, acceptanceEligible: true, reason: null, p95Ms: p95, thresholdMs: threshold, rawOver32Reported: rawOver32 };
  }

  // floor
  if (sample.floorZeroGateRawOver32 === true) {
    return { ok: false, acceptanceEligible: true, reason: 'floor-must-not-blindly-zero-gate-raw-over-32ms' };
  }
  if (p95 > threshold) {
    return { ok: false, acceptanceEligible: true, reason: 'floor-p95-exceeded', p95Ms: p95, thresholdMs: threshold };
  }
  return {
    ok: true, acceptanceEligible: true, reason: null, p95Ms: p95, thresholdMs: threshold,
    rawOver32Reported: rawOver32, floorAware: true,
  };
}

/** Long-session stability: any monotonic growth beyond declared bounded high-water fails. */
export function evaluateResourceStability({ series = {}, declaredHighWater = {} } = {}) {
  const violations = [];
  for (const [name, values] of Object.entries(series)) {
    if (!Array.isArray(values) || values.length < 2) continue;
    const bound = declaredHighWater[name];
    const peak = Math.max(...values);
    if (bound !== undefined && peak > bound) violations.push(`${name}:exceeds-declared-high-water`);
    const strictlyGrowing = values.every((v, i) => i === 0 || v > values[i - 1]);
    if (strictlyGrowing && bound === undefined) violations.push(`${name}:monotonic-growth-without-declared-bound`);
  }
  return { ok: violations.length === 0, violations: Object.freeze(violations) };
}

// ---------------------------------------------------------------------------------------------
// Accessibility contract
// ---------------------------------------------------------------------------------------------

/**
 * Automation checks these; the human reviewer decides discoverability/fairness/cue clarity. A
 * missing check is a rejection, not a warning — same rule as the performance metrics.
 */
export const ACCESSIBILITY_REQUIRED_CHECKS = Object.freeze([
  'rolesAndNames', 'focusVisible', 'contrastRatio', 'reducedMotion', 'flashSafety',
  'nonColorCues', 'nonAudioCues', 'textScale', 'inputReachability',
]);

export function evaluateAccessibilitySample(accessibilityProfile, sample = {}) {
  if (!ACCESSIBILITY_PROFILES.includes(accessibilityProfile)) {
    return { ok: false, reason: `unknown-accessibility-profile:${accessibilityProfile}` };
  }
  const missing = ACCESSIBILITY_REQUIRED_CHECKS.filter((check) => sample[check] === undefined || sample[check] === null);
  if (missing.length > 0) {
    return { ok: false, reason: `missing-accessibility-check:${missing.join(',')}`, missing: Object.freeze(missing) };
  }
  const failed = ACCESSIBILITY_REQUIRED_CHECKS.filter((check) => sample[check] !== true);
  if (failed.length > 0) {
    return { ok: false, reason: `accessibility-check-failed:${failed.join(',')}`, failed: Object.freeze(failed) };
  }
  return { ok: true, reason: null, accessibilityProfile };
}

export function assertQualityUnchanged(frozenQuality, observedQuality) {
  const same = canonicalJson(frozenQuality) === canonicalJson(observedQuality);
  return { ok: same, reason: same ? null : 'default-quality-or-settings-changed' };
}

// ---------------------------------------------------------------------------------------------
// Native duration + sim reconciliation
// ---------------------------------------------------------------------------------------------

export const DURATION_TOLERANCE = deepFreeze({
  accountingMs: 1000,
  simReconciliationRatio: 0.02,
  maxIdleSpanMs: 120_000,
});

/**
 * Native, focused, playable wall duration. Paused / unfocused / loading time is never counted, the
 * time scale must be exactly one, sim time must reconcile with wall time, and focused idling
 * (a long span with no player input) does not count as play.
 */
export function reconcileNativeDuration({
  horizonMin,
  nativeMonotonicMs,
  pausedMs = 0,
  unfocusedMs = 0,
  loadingMs = 0,
  simTimeS,
  timeScaleSamples = [],
  idleSpansMs = [],
  monotonicClock = 'performance.now',
} = {}) {
  const fail = (reason, extra = {}) => ({ ok: false, reason, ...extra });
  if (!HORIZONS_MIN.includes(horizonMin)) return fail('bad-horizon');
  if (!Number.isFinite(nativeMonotonicMs) || nativeMonotonicMs <= 0) return fail('bad-native-duration');
  if (monotonicClock !== 'performance.now' && monotonicClock !== 'process.hrtime') {
    return fail('duration-must-come-from-a-monotonic-clock');
  }
  if (!Array.isArray(timeScaleSamples) || timeScaleSamples.length === 0) return fail('missing-time-scale-samples');
  if (timeScaleSamples.some((v) => v !== 1)) return fail('time-scale-not-exactly-one');

  const excluded = Number(pausedMs) + Number(unfocusedMs) + Number(loadingMs);
  const focusedPlayableMs = nativeMonotonicMs - excluded;
  const requiredMs = horizonMin * 60_000;
  if (focusedPlayableMs < requiredMs) {
    return fail('native-duration-short', { focusedPlayableMs, requiredMs });
  }

  if (!Number.isFinite(simTimeS) || simTimeS <= 0) return fail('missing-sim-time');
  const simMs = simTimeS * 1000;
  const drift = Math.abs(simMs - focusedPlayableMs) / focusedPlayableMs;
  if (drift > DURATION_TOLERANCE.simReconciliationRatio) {
    return fail('sim-reconciliation-failure', { driftRatio: drift, focusedPlayableMs, simMs });
  }

  const longestIdle = idleSpansMs.length ? Math.max(...idleSpansMs) : 0;
  if (longestIdle > DURATION_TOLERANCE.maxIdleSpanMs) {
    return fail('focused-idling-detected', { longestIdleMs: longestIdle });
  }

  return {
    ok: true, reason: null, focusedPlayableMs, requiredMs, simMs, driftRatio: drift, longestIdleMs: longestIdle,
  };
}

// ---------------------------------------------------------------------------------------------
// Owner evidence normalization — `unknown` is never a pass
// ---------------------------------------------------------------------------------------------

export function normalizeOwnerEvidence({ outcome, observation = null, rawRef = null, confidence = 'unknown', map = SEMANTIC_OUTCOME_MAP } = {}) {
  const row = semanticRow(outcome, map);
  if (!row) {
    return deepFreeze({ outcome, satisfied: false, confidence: 'unknown', reason: 'outcome-not-in-semantic-map', rawRef: rawRef || null });
  }
  if (row.confidence === 'absent' || row.evidenceKind === 'absent') {
    return deepFreeze({
      outcome, satisfied: false, confidence: 'unknown',
      reason: 'owner-fact-absent-at-this-revision', ownerRef: row.rawRef, rawRef: rawRef || null,
    });
  }
  if (confidence !== 'verified') {
    return deepFreeze({
      outcome, satisfied: false, confidence: 'unknown',
      reason: 'unknown-owner-evidence-is-never-a-pass', ownerRef: row.rawRef, rawRef: rawRef || null,
    });
  }
  if (observation === null || observation === undefined) {
    return deepFreeze({ outcome, satisfied: false, confidence: 'unknown', reason: 'verified-claim-without-observation', ownerRef: row.rawRef, rawRef: rawRef || null });
  }
  if (!nonEmptyString(rawRef)) {
    return deepFreeze({ outcome, satisfied: false, confidence: 'unknown', reason: 'missing-raw-reference', ownerRef: row.rawRef, rawRef: null });
  }
  return deepFreeze({
    outcome, satisfied: true, confidence: 'verified', reason: null,
    owner: row.owner, symbol: row.symbol, evidenceKind: row.evidenceKind, ownerRef: row.rawRef, rawRef, observation,
  });
}

/** A Massline claim passes only on authoritative ATTACH SUCCESS, never on opportunity/attempt. */
export function evaluateMasslineClaim({ events = [] } = {}) {
  const attached = events.filter((e) => e && e.type === 'tether:attached');
  const denied = events.filter((e) => e && e.type === 'tether:latchDenied');
  if (attached.length === 0) {
    return {
      ok: false,
      reason: denied.length > 0 ? 'massline-attempt-without-authoritative-attach' : 'no-authoritative-attach-evidence',
      deniedCount: denied.length,
    };
  }
  const withIds = attached.filter((e) => nonEmptyString(e.attachmentId) && nonEmptyString(e.targetId));
  if (withIds.length === 0) return { ok: false, reason: 'attach-event-missing-attachment-identity' };
  return { ok: true, reason: null, attachCount: withIds.length, ownerRef: 'src/combat/attachments.js:212' };
}

/**
 * A purchase claim requires the full legal chain: charged once, owned once, fitted/activated
 * legally, a measurable capability delta, and persistence through cold Continue.
 * Research/preview/affordability is explicitly NOT a purchase.
 */
export const PURCHASE_CHAIN_STEPS = Object.freeze([
  'charged', 'owned', 'fitted', 'capabilityDelta', 'persistedThroughContinue',
]);

export function evaluatePurchaseClaim(claim = {}) {
  if (claim.kind && claim.kind !== 'purchase') {
    return { ok: false, reason: `non-purchase-event-cannot-satisfy-purchase:${claim.kind}` };
  }
  for (const step of ['researched', 'previewed', 'affordable']) {
    if (claim[step] === true && claim.charged !== true) {
      return { ok: false, reason: `research-or-preview-is-not-a-purchase:${step}` };
    }
  }
  const missing = PURCHASE_CHAIN_STEPS.filter((step) => claim[step] !== true);
  if (missing.length > 0) return { ok: false, reason: `purchase-chain-incomplete:${missing.join(',')}`, missing: Object.freeze(missing) };
  if (Number(claim.chargeCount) !== 1) return { ok: false, reason: 'purchase-must-be-charged-exactly-once' };
  if (Number(claim.ownershipCount) !== 1) return { ok: false, reason: 'purchase-must-be-owned-exactly-once' };
  if (!Number.isFinite(Number(claim.capabilityDeltaMagnitude)) || Number(claim.capabilityDeltaMagnitude) === 0) {
    return { ok: false, reason: 'capability-delta-must-be-measurable' };
  }
  return { ok: true, reason: null };
}

// ---------------------------------------------------------------------------------------------
// Fingerprint registry — one capture cannot satisfy two cells
// ---------------------------------------------------------------------------------------------

export function createFingerprintRegistry() {
  return { captures: new Map(), contents: new Map() };
}

/**
 * Register a capture. Rejects a captureId reused across cells/attempts AND a byte-identical capture
 * re-submitted under a new id (stale media/receipt/save reuse).
 */
export function registerCapture(registry, {
  captureId, cellKey: cellKeyValue, attemptOrdinal, contentHash, sourceFingerprint, hardwareProfileId, executionProfileId,
} = {}) {
  if (!registry) throw new Error('fingerprint-registry-required');
  if (!nonEmptyString(captureId)) return { ok: false, reason: 'missing-capture-id' };
  if (!nonEmptyString(cellKeyValue)) return { ok: false, reason: 'missing-cell-key' };
  if (!nonEmptyString(contentHash)) return { ok: false, reason: 'missing-content-hash' };
  if (!nonEmptyString(sourceFingerprint)) return { ok: false, reason: 'missing-source-fingerprint' };
  if (!nonEmptyString(hardwareProfileId)) return { ok: false, reason: 'missing-hardware-profile-id' };
  if (!nonEmptyString(executionProfileId)) return { ok: false, reason: 'missing-execution-profile-id' };

  const existing = registry.captures.get(captureId);
  if (existing) {
    return {
      ok: false,
      reason: existing.cellKey === cellKeyValue && existing.attemptOrdinal === attemptOrdinal
        ? 'capture-id-registered-twice-for-same-cell'
        : 'capture-reused-across-cells',
      firstCellKey: existing.cellKey,
    };
  }
  const priorContent = registry.contents.get(contentHash);
  if (priorContent && (priorContent.cellKey !== cellKeyValue || priorContent.attemptOrdinal !== attemptOrdinal)) {
    return { ok: false, reason: 'stale-capture-content-reused', firstCaptureId: priorContent.captureId };
  }
  const record = deepFreeze({ captureId, cellKey: cellKeyValue, attemptOrdinal, contentHash, sourceFingerprint, hardwareProfileId, executionProfileId });
  registry.captures.set(captureId, record);
  registry.contents.set(contentHash, record);
  return { ok: true, reason: null, record };
}

// ---------------------------------------------------------------------------------------------
// Matrix
// ---------------------------------------------------------------------------------------------

export const MATRIX_SCHEMA = 'pq025.matrix.v1';

export function createQualificationMatrix({ cells = [], frozenAtIso = null, rubricHash = null, criticalQuestionIds = [] } = {}) {
  const normalized = cells.map((cell, index) => {
    const accessibilityProfile = cell.accessibilityProfile || 'default';
    if (!ACCESSIBILITY_PROFILES.includes(accessibilityProfile)) {
      throw new Error(`matrix-unknown-accessibility-profile:${accessibilityProfile}`);
    }
    return deepFreeze({
      cellIndex: index,
      career: cell.career,
      horizonMin: cell.horizonMin,
      scenarioClass: cell.scenarioClass,
      runtimeKind: cell.runtimeKind,
      profileClass: cell.profileClass,
      accessibilityProfile,
      required: cell.required !== false,
      cellKey: cellKey(cell),
    });
  });
  return deepFreeze({
    schema: MATRIX_SCHEMA,
    frozenAtIso,
    rubricHash,
    // The frozen set of critical human-rubric questions. Aggregation requires every one to be
    // answered; an unanswered critical question is unknown evidence, and unknown is never a pass.
    criticalQuestionIds: Object.freeze([...criticalQuestionIds]),
    cells: normalized,
  });
}

/**
 * Matrix completeness per the packet: one 30-min cell per career and one 90-min success cell per
 * career, both runtimes represented in each horizon set, and a failure/recovery cell present.
 */
export function validateMatrixCompleteness(matrix) {
  const errors = [];
  if (!matrix || matrix.schema !== MATRIX_SCHEMA) return { ok: false, errors: Object.freeze(['bad-matrix-schema']) };
  const required = matrix.cells.filter((cell) => cell.required);

  for (const horizon of HORIZONS_MIN) {
    const slice = required.filter((cell) => cell.horizonMin === horizon);
    for (const career of CAREERS) {
      const forCareer = slice.filter((cell) => cell.career === career);
      if (forCareer.length === 0) errors.push(`missing-required-cell:${career}@${horizon}`);
      if (horizon === 90 && !forCareer.some((cell) => cell.scenarioClass === 'success')) {
        errors.push(`missing-90min-success-cell:${career}`);
      }
    }
    const runtimes = new Set(slice.map((cell) => cell.runtimeKind));
    for (const runtime of RUNTIME_KINDS) {
      if (!runtimes.has(runtime)) errors.push(`runtime-not-represented-at-${horizon}min:${runtime}`);
    }
  }

  if (!required.some((cell) => cell.scenarioClass === 'failure-recovery')) {
    errors.push('required-failure-recovery-cell-omitted');
  }
  if (required.some((cell) => cell.profileClass === 'diagnostic')) {
    errors.push('diagnostic-profile-cell-cannot-be-required-for-acceptance');
  }
  return { ok: errors.length === 0, errors: Object.freeze(errors) };
}

/**
 * A scenario class or profile class may never be changed after observation began. Any relabel is a
 * QUALIFICATION rejection.
 */
export function assertNoRelabel(frozenCell, observedIdentity) {
  const errors = [];
  if (frozenCell.scenarioClass !== observedIdentity.scenarioClass) errors.push('scenario-relabeled-after-observation');
  if (frozenCell.profileClass !== observedIdentity.profileClass) errors.push('profile-relabeled-after-observation');
  if (frozenCell.career !== observedIdentity.career) errors.push('career-relabeled-after-observation');
  if (frozenCell.horizonMin !== observedIdentity.horizonMin) errors.push('horizon-relabeled-after-observation');
  return { ok: errors.length === 0, errors: Object.freeze(errors) };
}

export default {
  SEMANTIC_OUTCOME_MAP,
  deriveHeldOutSeed,
  createAttemptLedger,
  appendAttempt,
  verifyLedgerContinuity,
  evaluatePerformanceSample,
  reconcileNativeDuration,
  normalizeOwnerEvidence,
};
