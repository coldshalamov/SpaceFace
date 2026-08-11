import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  CERES_ORE_CYCLE_POST_CONTINUE_CHUNK,
  CERES_ORE_CYCLE_PRE_SAVE_CHUNK,
  evaluateCeresOreCycleSaveGateReceipt,
  evaluateCeresPersistedOreCycleSaveReceipt,
  evaluateCeresConsumedClaimLedger,
  evaluateCeresFiveMinuteRuntime,
} from './ceresFiveMinuteAcceptance.mjs';
import { readConsumedClaimLedgerEntry } from './validationBroker.mjs';
import { stableJson } from './validationFingerprint.mjs';

export const PQ048_ORE_CYCLE_SCHEMA = 'spaceface.pq048OreCycleEvidence.v1';
export const PQ048_ORE_CYCLE_MANIFEST_ID = 'pq048-ore-cycle-browser';
export const PQ048_ORE_CARRIER_SLOT_ID = 'ceres_seam_miner';
export const PQ048_REFINERY_STATION_ID = 'station_ceres';
export const PQ048_ORE_CYCLE_MIN_POST_CONTINUE_TICKS = 2_400;

const ORE_CYCLE_EVENTS = new Set([
  'mining:npcExtraction',
  'aiTrader:requestTrade',
  'freight:arrival',
  'freight:loss',
  'traffic:jobActionReceipt',
]);

/**
 * Re-derive one complete physical ore lot from raw Ceres route observations.
 * Summary flags are ignored: every causal link must share the same durable hull and lot identity.
 */
export function derivePq048OreCycleProjection({
  frames,
  events,
  artifacts,
  continueProof,
  routeEndTick,
  minPostContinueTicks,
} = {}) {
  const failures = [];
  const orderedFrames = normalizeFrames(frames, failures);
  const orderedEvents = normalizeEvents(events, failures);
  const artifactProjection = validateRouteArtifacts(artifacts, failures);

  const seamRows = [];
  for (const frame of orderedFrames) {
    const matches = Array.isArray(frame.actorStates)
      ? frame.actorStates.filter((actor) => actor?.slotId === PQ048_ORE_CARRIER_SLOT_ID)
      : [];
    if (matches.length !== 1 || matches[0].missing === true) {
      failures.push(`tick ${frame.tick} does not contain exactly one live authored Ore Barge`);
      continue;
    }
    seamRows.push({
      tick: frame.tick,
      observerChunk: frame.observerChunk,
      observerChunkIndex: frame.observerChunkIndex,
      routePhase: frame.routePhase,
      playerEconomy: frame.playerEconomy,
      actor: matches[0],
    });
  }

  const identity = deriveStableOreCarrierIdentity(seamRows, failures);
  const continueBoundary = validateContinueBoundary(
    continueProof,
    identity,
    { routeEndTick, minPostContinueTicks },
    failures,
  );
  validatePlayerProjection(orderedFrames, orderedEvents, failures);

  const extractionEvents = orderedEvents.filter((event) => (
    event.event === 'mining:npcExtraction'
      && event.actorSlotId === PQ048_ORE_CARRIER_SLOT_ID
      && preSaveProvenance(event)
  ));
  if (extractionEvents.length < 1) failures.push('no authored Ore Barge extraction was observed');

  const completeCandidates = [];
  for (const extraction of extractionEvents) {
    const manifest = normalizeLoadedManifest(extraction.cargoManifestAfter);
    if (!manifest) continue;
    const arrivalMatches = orderedEvents.filter((event) => (
      event.event === 'freight:arrival' && event.lotId === manifest.lotId
        && postContinueProvenance(event)
    ));
    const tradeMatches = orderedEvents.filter((event) => (
      event.event === 'aiTrader:requestTrade' && event.lotId === manifest.lotId
        && postContinueProvenance(event)
    ));
    const lossMatches = orderedEvents.filter((event) => (
      event.event === 'freight:loss' && event.lotId === manifest.lotId
    ));
    if (continueBoundary
        && extraction.tick < continueBoundary.savedAtTick
        && arrivalMatches.length === 1
        && arrivalMatches[0].tick >= continueBoundary.loadedAtTick
        && tradeMatches.length === manifest.lines.length
        && tradeMatches.every((trade) => trade.tick >= continueBoundary.loadedAtTick)
        && lossMatches.length === 0) {
      completeCandidates.push({ extraction, manifest, arrival: arrivalMatches[0], trades: tradeMatches });
    }
  }
  if (completeCandidates.length < 1) {
    failures.push('no extraction lot spans Save/Continue with one post-Continue arrival, matching owner trades, and zero losses');
  }

  const candidate = completeCandidates[0] || null;
  let loadedBeforeSave = null;
  let loadedAfterContinue = null;
  let emptyHull = null;
  let minerReceipt = null;
  let arrivalReceipt = null;
  let market = null;
  if (candidate) {
    const { extraction, manifest, arrival, trades } = candidate;
    const extractionEntityId = extraction.minerId;
    const arrivalEntityId = arrival.freighterId;
    validateIdentityMatch(identity, extraction, 'extraction', extractionEntityId, failures);
    validateIdentityMatch(identity, arrival, 'arrival', arrivalEntityId, failures);
    validateExtraction(extraction, manifest, identity, failures);
    validateArrival(arrival, manifest, identity, failures);
    validateTrades(trades, arrival, manifest, identity, continueBoundary, failures);
    if (stableJson(normalizeLoadedManifest(continueProof?.oreCycleSaveGate?.manifest))
        !== stableJson(manifest)) {
      failures.push('selected lot does not equal the loaded Ore Barge lot that gated public save');
    }
    if (stableJson(normalizeLoadedManifest(continueProof?.persistedOreCycleSave?.manifest))
        !== stableJson(manifest)) {
      failures.push('selected lot does not equal the exact Ore Barge lot persisted by public save');
    }

    if (continueBoundary && extraction.tick >= continueBoundary.savedAtTick) {
      failures.push('selected extraction did not occur before the public save boundary');
    }
    if (continueBoundary && arrival.tick < continueBoundary.loadedAtTick) {
      failures.push('selected refinery arrival did not occur after public Continue restored the route');
    }

    loadedBeforeSave = seamRows.find((row) => (
      row.tick > extraction.tick && row.tick <= continueBoundary?.savedAtTick
        && preSaveProvenance(row)
        && sameLoadedManifest(row.actor.cargoManifest, manifest)
        && row.actor.entityId === extractionEntityId
    )) || null;
    if (!loadedBeforeSave) {
      failures.push('no sampled loaded-custody frame binds the extracted lot to the Ore Barge before save');
    }

    loadedAfterContinue = seamRows.find((row) => (
      row.tick >= continueBoundary?.loadedAtTick && row.tick < arrival.tick
        && postContinueProvenance(row)
        && sameLoadedManifest(row.actor.cargoManifest, manifest)
        && row.actor.entityId === arrivalEntityId
    )) || null;
    if (!loadedAfterContinue) {
      failures.push('no sampled loaded-custody frame preserves the Ore Barge lot after Continue');
    }

    emptyHull = seamRows.find((row) => (
      row.tick >= arrival.tick && row.tick >= continueBoundary?.loadedAtTick
        && postContinueProvenance(row)
        && row.actor.entityId === arrivalEntityId
        && emptyManifest(row.actor.cargoManifest)
    )) || null;
    if (!emptyHull) failures.push('the same Ore Barge was not sampled empty after refinery arrival');

    minerReceipt = orderedEvents.find((event) => (
      event.event === 'traffic:jobActionReceipt'
        && event.actorSlotId === PQ048_ORE_CARRIER_SLOT_ID
        && event.effectType === 'mining:npcExtraction'
        && event.effectApplied === true
        && event.jobId === identity?.jobId
        && event.actorWorldRecordId === identity?.worldRecordId
        && event.actorId === extractionEntityId
        && preSaveProvenance(event)
        && event.tick <= continueBoundary?.savedAtTick
        && event.seq > extraction.seq
    )) || null;
    if (!minerReceipt) failures.push('the extraction has no later Ore Barge job-action receipt');

    arrivalReceipt = orderedEvents.find((event) => (
      event.event === 'traffic:jobActionReceipt'
        && event.actorSlotId === PQ048_ORE_CARRIER_SLOT_ID
        && event.effectType === 'freight:arrival'
        && event.effectApplied === true
        && event.jobId === identity?.jobId
        && event.actorWorldRecordId === identity?.worldRecordId
        && event.actorId === arrivalEntityId
        && postContinueProvenance(event)
        && event.tick >= continueBoundary?.loadedAtTick
        && event.seq > arrival.seq
    )) || null;
    if (!arrivalReceipt) failures.push('the refinery arrival has no later Ore Barge job-action receipt');

    const trade = trades[0] || null;
    if (trade && Number.isFinite(trade.marketStockBefore)
        && Number.isFinite(trade.marketStockAfter) && Number.isFinite(trade.qty)) {
      market = {
        stationId: trade.stationId,
        commodityId: trade.commodityId,
        requestIntentId: trade.intentId,
        stockBeforeSynchronousOwner: trade.marketStockBefore,
        stockAfterSynchronousOwner: trade.marketStockAfter,
        stockDelta: trade.marketStockAfter - trade.marketStockBefore,
      };
    } else {
      failures.push('matching economy request has no finite post-owner market stock');
    }
    if (identity) {
      identity.cycleEntityIds = [...new Set([
        extractionEntityId,
        loadedBeforeSave?.actor?.entityId,
        loadedAfterContinue?.actor?.entityId,
        arrivalEntityId,
        emptyHull?.actor?.entityId,
      ].filter((entityId) => entityId != null))];
    }
  }

  return {
    pass: failures.length === 0,
    failures,
    projection: candidate ? {
      schema: 'spaceface.pq048OreCycleProjection.v1',
      oreCarrier: identity,
      continueBoundary,
      lot: candidate.manifest,
      extraction: projectEvent(candidate.extraction),
      loadedTransit: {
        beforeSave: loadedBeforeSave ? projectFrameReceipt(loadedBeforeSave) : null,
        afterContinue: loadedAfterContinue ? projectFrameReceipt(loadedAfterContinue) : null,
      },
      ownerTrades: candidate.trades.map(projectEvent),
      arrival: projectEvent(candidate.arrival),
      minerReceipt: minerReceipt ? projectEvent(minerReceipt) : null,
      arrivalReceipt: arrivalReceipt ? projectEvent(arrivalReceipt) : null,
      emptyHull: emptyHull ? projectFrameReceipt(emptyHull) : null,
      market,
      playerWalletAndCargoUnchanged: failures.every((failure) => (
        !failure.includes('player wallet/cargo')
      )),
      artifacts: artifactProjection,
    } : null,
  };
}

export function evaluatePq048OreCycleEvidence(evidence) {
  const failures = [];
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    return { pass: false, failures: ['candidate-bound Ceres runtime evidence is required'], projection: null };
  }
  const shared = evaluateCeresFiveMinuteRuntime(evidence, { runtimeKind: 'browser' });
  failures.push(...shared.failures.map((failure) => `shared Ceres runtime: ${failure}`));
  if (evidence.runtimeKind !== 'browser') failures.push('PQ-048.01 requires source Browser evidence');
  if (evidence.route?.id !== 'ceres_reference_pocket'
      || stableJson(evidence.route?.publicPath) !== stableJson([
        'main_menu', 'sandbox', 'ceres_reference_pocket',
      ])) {
    failures.push('evidence is not the shared Main Menu to Sandbox to Ceres route');
  }
  if (evidence.authority?.validationManifestId !== PQ048_ORE_CYCLE_MANIFEST_ID) {
    failures.push('evidence is not bound to the PQ-048.01 broker manifest');
  }
  if (evidence.authority?.consumedLedgerSchema
      !== 'spaceface.validation-broker-claim-consumed.v1') {
    failures.push('evidence does not identify a consumed broker claim ledger');
  }
  if (!String(evidence.authority?.candidateDigest || '')
      || !String(evidence.authority?.sourceCandidateDigest || '')) {
    failures.push('candidate authority digests are missing');
  }
  if (evidence.pass !== true || evidence.machinePass !== true) {
    failures.push('the reused Ceres five-minute machine contract did not pass');
  }
  const derived = derivePq048OreCycleProjection({
    frames: evidence.observations?.oreCycleFrames,
    events: evidence.observations?.oreCycleEvents,
    artifacts: evidence.artifacts,
    continueProof: evidence.observations?.continueProof,
    routeEndTick: evidence.route?.endTick,
    minPostContinueTicks: PQ048_ORE_CYCLE_MIN_POST_CONTINUE_TICKS,
  });
  failures.push(...derived.failures);
  return { pass: failures.length === 0, failures, projection: derived.projection };
}

export async function publishPq048OreCycleEvidence({ sharedResult, root } = {}) {
  if (!sharedResult?.evidencePath || !sharedResult?.runDir) {
    return { pass: false, failures: ['shared Ceres acceptance did not publish evidence'] };
  }
  const repoRoot = path.resolve(String(root || ''));
  let sharedSnapshotBytes;
  let runtimeEvidence;
  try {
    sharedSnapshotBytes = await readFile(sharedResult.evidencePath);
    runtimeEvidence = JSON.parse(sharedSnapshotBytes.toString('utf8'));
  } catch (error) {
    return { pass: false, failures: [`shared Ceres evidence could not be read: ${error?.message || error}`] };
  }
  const evaluated = evaluatePq048OreCycleEvidence(runtimeEvidence);
  if (!evaluated.pass) return evaluated;

  const runBinding = validatePublicationRunBinding({
    repoRoot,
    runDir: sharedResult.runDir,
    runtimeEvidence,
  });
  if (!runBinding.pass) return runBinding;
  for (const [label, actual, expected] of [
    ['runtime kind', sharedResult.runtimeKind, runtimeEvidence.runtimeKind],
    ['candidate digest', sharedResult.candidateDigest, runtimeEvidence.authority?.candidateDigest],
    ['source candidate digest', sharedResult.sourceCandidateDigest,
      runtimeEvidence.authority?.sourceCandidateDigest],
  ]) {
    if (actual !== expected) runBinding.failures.push(`shared result ${label} does not bind the runtime evidence`);
  }
  if (sharedResult.primaryAcceptance !== true) {
    runBinding.failures.push('PQ publication requires a primary broker-managed acceptance result');
  }
  if (runBinding.failures.length > 0) return { pass: false, failures: runBinding.failures };

  const claimId = String(runtimeEvidence.authority?.claimId || '');
  const safeClaimId = claimId.replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safeClaimId || safeClaimId !== claimId) {
    return { pass: false, failures: ['runtime claim id cannot resolve one canonical consumed-ledger path'] };
  }
  const outputRoot = path.resolve(repoRoot, '.devshots/pq048-ore-cycle/browser');
  if (path.resolve(sharedResult.evidencePath)
      !== path.join(outputRoot, 'browser', 'evidence.json')) {
    return { pass: false, failures: ['shared result evidence path is not the canonical PQ Browser publication'] };
  }
  const consumedClaimPath = path.join(
    outputRoot,
    'broker-claims',
    '.consumed',
    `${safeClaimId}.json`,
  );
  let consumedClaim;
  let consumedClaimBytes;
  try {
    [consumedClaim, consumedClaimBytes] = await Promise.all([
      readConsumedClaimLedgerEntry(outputRoot, claimId),
      readFile(consumedClaimPath),
    ]);
  } catch (error) {
    return { pass: false, failures: [`consumed broker claim could not be read: ${error?.message || error}`] };
  }
  const parsedConsumedClaim = parseJsonBytes(
    consumedClaimBytes,
    'consumed broker claim',
    runBinding.failures,
  );
  if (!consumedClaim || stableJson(consumedClaim) !== stableJson(parsedConsumedClaim)) {
    runBinding.failures.push('canonical consumed broker reader does not match the exact ledger bytes');
  }
  const consumedValidation = evaluateCeresConsumedClaimLedger({
    runtimeEvidence,
    ledger: consumedClaim,
  });
  runBinding.failures.push(...consumedValidation.failures.map((failure) => `consumed claim: ${failure}`));
  if (runBinding.failures.length > 0) return { pass: false, failures: runBinding.failures };

  const sharedSnapshotPath = path.join(runBinding.runDirAbsolute, 'shared-ceres-evidence.snapshot.json');
  await writeFile(sharedSnapshotPath, sharedSnapshotBytes);
  const sharedSnapshot = artifactDescriptor(
    repoRoot,
    sharedSnapshotPath,
    'pq048-shared-ceres-evidence-snapshot',
    sharedSnapshotBytes,
  );
  const consumedClaimSnapshotPath = path.join(
    runBinding.runDirAbsolute,
    'consumed-broker-claim.snapshot.json',
  );
  await writeFile(consumedClaimSnapshotPath, consumedClaimBytes);
  const consumedClaimSnapshot = artifactDescriptor(
    repoRoot,
    consumedClaimSnapshotPath,
    'pq048-consumed-broker-claim-snapshot',
    consumedClaimBytes,
  );
  const document = {
    schema: PQ048_ORE_CYCLE_SCHEMA,
    pass: true,
    generatedAt: new Date().toISOString(),
    runtimeKind: 'browser',
    routeId: runtimeEvidence.route.id,
    runId: runBinding.runId,
    runDir: runBinding.runDirRelative,
    authority: {
      manifestId: PQ048_ORE_CYCLE_MANIFEST_ID,
      claimId: runtimeEvidence.authority.claimId,
      candidateHash: runtimeEvidence.authority.candidateHash,
      candidateDigest: runtimeEvidence.authority.candidateDigest,
      sourceCandidateDigest: runtimeEvidence.authority.sourceCandidateDigest,
      worktreeDigest: runtimeEvidence.authority.worktree?.digest,
      runtimeManifestDigest: runtimeEvidence.authority.digests?.runtimeManifestDigest,
    },
    sharedSnapshot,
    consumedClaimSnapshot,
    sharedArtifactIdentity: runtimeEvidence.artifactIdentity,
    projection: JSON.parse(JSON.stringify(evaluated.projection)),
  };
  const outputPath = path.join(runBinding.runDirAbsolute, 'pq048-ore-cycle-evidence.json');
  const pqEvidenceBytes = Buffer.from(`${JSON.stringify(document, null, 2)}\n`, 'utf8');
  await writeFile(outputPath, pqEvidenceBytes);
  const pqEvidence = artifactDescriptor(
    repoRoot,
    outputPath,
    'pq048-ore-cycle-evidence',
    pqEvidenceBytes,
  );
  const ledger = {
    schema: 'spaceface.pq048OreCyclePublicationLedger.v1',
    manifestId: PQ048_ORE_CYCLE_MANIFEST_ID,
    claimId: document.authority.claimId,
    candidateHash: document.authority.candidateHash,
    candidateDigest: document.authority.candidateDigest,
    sourceCandidateDigest: document.authority.sourceCandidateDigest,
    worktreeDigest: document.authority.worktreeDigest,
    runtimeManifestDigest: document.authority.runtimeManifestDigest,
    runId: document.runId,
    runDir: document.runDir,
    sharedArtifactIdentity: document.sharedArtifactIdentity,
    sharedSnapshot,
    consumedClaimSnapshot,
    pqEvidence,
  };
  const ledgerPath = path.join(runBinding.runDirAbsolute, 'pq048-ore-cycle-ledger.json');
  const ledgerBytes = Buffer.from(`${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
  await writeFile(ledgerPath, ledgerBytes);
  const ledgerArtifact = artifactDescriptor(
    repoRoot,
    ledgerPath,
    'pq048-ore-cycle-publication-ledger',
    ledgerBytes,
  );
  const artifactSet = {
    schema: 'spaceface.pq048OreCycleArtifactSet.v1',
    manifestId: PQ048_ORE_CYCLE_MANIFEST_ID,
    claimId: document.authority.claimId,
    candidateHash: document.authority.candidateHash,
    candidateDigest: document.authority.candidateDigest,
    sourceCandidateDigest: document.authority.sourceCandidateDigest,
    worktreeDigest: document.authority.worktreeDigest,
    runtimeManifestDigest: document.authority.runtimeManifestDigest,
    runId: document.runId,
    runDir: document.runDir,
    sharedArtifactIdentity: document.sharedArtifactIdentity,
    routeArtifacts: [
      evaluated.projection.artifacts.refinery,
      evaluated.projection.artifacts.seam,
    ],
    artifacts: [sharedSnapshot, consumedClaimSnapshot, pqEvidence, ledgerArtifact],
  };
  const publication = evaluatePq048PublishedArtifactSet({
    sharedSnapshotBytes,
    consumedClaimBytes,
    pqEvidenceBytes,
    ledgerBytes,
    artifactSet,
  });
  if (!publication.pass) return publication;
  const artifactSetPath = path.join(runBinding.runDirAbsolute, 'pq048-ore-cycle-artifact-set.json');
  await writeFile(artifactSetPath, `${JSON.stringify(artifactSet, null, 2)}\n`, 'utf8');
  return {
    ...evaluated,
    document,
    outputPath,
    sharedSnapshotPath,
    consumedClaimSnapshotPath,
    ledgerPath,
    artifactSetPath,
    artifactSet,
  };
}

export function evaluatePq048PublishedArtifactSet({
  sharedSnapshotBytes,
  consumedClaimBytes,
  pqEvidenceBytes,
  ledgerBytes,
  artifactSet,
} = {}) {
  const failures = [];
  const shared = parseJsonBytes(sharedSnapshotBytes, 'shared evidence snapshot', failures);
  const consumedClaim = parseJsonBytes(consumedClaimBytes, 'consumed broker claim', failures);
  const pqEvidence = parseJsonBytes(pqEvidenceBytes, 'PQ evidence', failures);
  const ledger = parseJsonBytes(ledgerBytes, 'publication ledger', failures);
  if (!artifactSet || artifactSet.schema !== 'spaceface.pq048OreCycleArtifactSet.v1') {
    failures.push('final PQ artifact set is missing or has the wrong schema');
  }
  if (pqEvidence?.schema !== PQ048_ORE_CYCLE_SCHEMA || pqEvidence?.pass !== true) {
    failures.push('published PQ evidence is missing or has the wrong schema/status');
  }
  if (ledger?.schema !== 'spaceface.pq048OreCyclePublicationLedger.v1') {
    failures.push('publication ledger is missing or has the wrong schema');
  }
  const artifacts = Array.isArray(artifactSet?.artifacts) ? artifactSet.artifacts : [];
  const sharedDescriptor = artifacts.find((entry) => (
    entry?.kind === 'pq048-shared-ceres-evidence-snapshot'
  ));
  const consumedClaimDescriptor = artifacts.find((entry) => (
    entry?.kind === 'pq048-consumed-broker-claim-snapshot'
  ));
  const evidenceDescriptor = artifacts.find((entry) => entry?.kind === 'pq048-ore-cycle-evidence');
  const ledgerDescriptor = artifacts.find((entry) => (
    entry?.kind === 'pq048-ore-cycle-publication-ledger'
  ));
  if (artifacts.length !== 4 || new Set(artifacts.map((entry) => entry?.kind)).size !== 4) {
    failures.push('final PQ artifact set must contain exactly four unique bound artifacts');
  }
  const runDir = String(artifactSet?.runDir || '').replaceAll('\\', '/').replace(/^\.\//, '');
  const runId = String(artifactSet?.runId || '');
  if (!/^\.devshots\/pq048-ore-cycle\/browser\/runs\/[^/]+$/.test(runDir)
      || path.posix.basename(runDir) !== runId) {
    failures.push('final PQ run identity is invalid');
  }
  validateBytesDescriptor(sharedSnapshotBytes, sharedDescriptor, 'shared snapshot', failures, runDir);
  validateBytesDescriptor(
    consumedClaimBytes,
    consumedClaimDescriptor,
    'consumed broker claim',
    failures,
    runDir,
  );
  validateBytesDescriptor(pqEvidenceBytes, evidenceDescriptor, 'PQ evidence', failures, runDir);
  validateBytesDescriptor(ledgerBytes, ledgerDescriptor, 'publication ledger', failures, runDir);

  const authority = pqEvidence?.authority || {};
  for (const [label, value] of [
    ['manifest id', authority.manifestId],
    ['claim id', authority.claimId],
    ['candidate hash', authority.candidateHash],
    ['candidate digest', authority.candidateDigest],
    ['source candidate digest', authority.sourceCandidateDigest],
    ['worktree digest', authority.worktreeDigest],
    ['runtime manifest digest', authority.runtimeManifestDigest],
  ]) {
    if (!String(value || '')) failures.push(`PQ publication ${label} is missing`);
  }
  if (authority.manifestId !== PQ048_ORE_CYCLE_MANIFEST_ID) {
    failures.push('PQ publication manifest identity is wrong');
  }
  if (stableJson(pqEvidence?.sharedSnapshot) !== stableJson(sharedDescriptor)) {
    failures.push('PQ evidence does not bind the exact shared snapshot descriptor');
  }
  if (stableJson(pqEvidence?.consumedClaimSnapshot) !== stableJson(consumedClaimDescriptor)) {
    failures.push('PQ evidence does not bind the exact consumed claim descriptor');
  }
  if (stableJson(ledger?.sharedSnapshot) !== stableJson(sharedDescriptor)
      || stableJson(ledger?.consumedClaimSnapshot) !== stableJson(consumedClaimDescriptor)
      || stableJson(ledger?.pqEvidence) !== stableJson(evidenceDescriptor)) {
    failures.push('publication ledger does not bind the exact evidence descriptors');
  }
  for (const key of [
    'manifestId', 'claimId', 'candidateHash', 'candidateDigest',
    'sourceCandidateDigest', 'worktreeDigest', 'runtimeManifestDigest',
  ]) {
    if (ledger?.[key] !== authority[key] || artifactSet?.[key] !== authority[key]) {
      failures.push(`published ${key} identity is inconsistent`);
    }
  }
  for (const key of ['runId', 'runDir']) {
    if (ledger?.[key] !== pqEvidence?.[key] || artifactSet?.[key] !== pqEvidence?.[key]) {
      failures.push(`published ${key} identity is inconsistent`);
    }
  }
  if (shared) {
    const evaluated = evaluatePq048OreCycleEvidence(shared);
    failures.push(...evaluated.failures.map((failure) => `shared snapshot: ${failure}`));
    const serializedProjection = evaluated.pass
      ? JSON.parse(JSON.stringify(evaluated.projection))
      : null;
    if (evaluated.pass && stableJson(serializedProjection) !== stableJson(pqEvidence?.projection)) {
      failures.push('published PQ projection does not equal the shared snapshot re-derivation');
    }
    if (authority.claimId !== shared.authority?.claimId
        || authority.candidateHash !== shared.authority?.candidateHash
        || authority.candidateDigest !== shared.authority?.candidateDigest
        || authority.sourceCandidateDigest !== shared.authority?.sourceCandidateDigest
        || authority.worktreeDigest !== shared.authority?.worktree?.digest
        || authority.runtimeManifestDigest !== shared.authority?.digests?.runtimeManifestDigest) {
      failures.push('published authority does not equal the shared snapshot authority');
    }
    if (stableJson(pqEvidence?.sharedArtifactIdentity) !== stableJson(shared.artifactIdentity)
        || stableJson(ledger?.sharedArtifactIdentity) !== stableJson(shared.artifactIdentity)
        || stableJson(artifactSet?.sharedArtifactIdentity) !== stableJson(shared.artifactIdentity)) {
      failures.push('shared artifact identity is not preserved through final publication');
    }
    const consumedValidation = evaluateCeresConsumedClaimLedger({
      runtimeEvidence: shared,
      ledger: consumedClaim,
    });
    failures.push(...consumedValidation.failures.map((failure) => `consumed claim: ${failure}`));
    const sharedRunDir = path.posix.dirname(String(shared.artifactIdentity?.path || '')
      .replaceAll('\\', '/'));
    if (sharedRunDir !== runDir
        || shared.artifacts?.some((entry) => path.posix.dirname(
          String(entry?.path || '').replaceAll('\\', '/'),
        ) !== runDir)) {
      failures.push('shared runtime artifacts do not belong to the published run identity');
    }
  }
  const projectedArtifacts = [
    pqEvidence?.projection?.artifacts?.refinery,
    pqEvidence?.projection?.artifacts?.seam,
  ];
  if (stableJson(artifactSet?.routeArtifacts) !== stableJson(projectedArtifacts)) {
    failures.push('final artifact set does not bind the refinery and seam route artifacts');
  }
  if (projectedArtifacts.some((entry) => path.posix.dirname(
    String(entry?.path || '').replaceAll('\\', '/'),
  ) !== runDir)) {
    failures.push('published route artifacts do not belong to the bound PQ run');
  }
  return { pass: failures.length === 0, failures };
}

function validatePublicationRunBinding({ repoRoot, runDir, runtimeEvidence }) {
  const failures = [];
  const runDirAbsolute = path.resolve(String(runDir || ''));
  const runDirRelative = path.relative(repoRoot, runDirAbsolute).replaceAll('\\', '/');
  const outputRoot = path.resolve(repoRoot, '.devshots/pq048-ore-cycle/browser');
  const outputRelative = path.relative(outputRoot, runDirAbsolute).replaceAll('\\', '/');
  const sharedArtifactPath = path.resolve(
    repoRoot,
    String(runtimeEvidence?.artifactIdentity?.path || ''),
  );
  if (!runDir || !path.isAbsolute(String(runDir))
      || !/^\.devshots\/pq048-ore-cycle\/browser\/runs\/[^/]+$/.test(runDirRelative)
      || !/^runs\/[^/]+$/.test(outputRelative)
      || path.dirname(sharedArtifactPath) !== runDirAbsolute) {
    failures.push('shared result run directory does not match the runtime artifact-set run');
  }
  const runtimeArtifacts = Array.isArray(runtimeEvidence?.artifacts)
    ? runtimeEvidence.artifacts
    : [];
  if (runtimeArtifacts.length < 1 || runtimeArtifacts.some((entry) => (
    path.dirname(path.resolve(repoRoot, String(entry?.path || ''))) !== runDirAbsolute
  ))) {
    failures.push('shared runtime artifacts are not all bound to the selected run directory');
  }
  return {
    pass: failures.length === 0,
    failures,
    runId: path.basename(runDirAbsolute),
    runDirRelative,
    runDirAbsolute,
  };
}

function normalizeFrames(frames, failures) {
  if (!Array.isArray(frames) || frames.length < 2) {
    failures.push('at least two raw route frames are required');
    return [];
  }
  const ordered = [...frames].sort((left, right) => provenanceOrder(left) - provenanceOrder(right)
    || Number(left?.tick) - Number(right?.tick));
  const previousByChunk = new Map();
  for (const frame of ordered) {
    const chunk = frame?.observerChunk;
    const previous = previousByChunk.get(chunk);
    if (!Number.isSafeInteger(frame?.tick)
        || (!preSaveProvenance(frame) && !postContinueProvenance(frame))
        || (previous != null && frame.tick <= previous)) {
      failures.push('route frames require explicit phase provenance and strict ticks within each observer chunk');
      break;
    }
    previousByChunk.set(chunk, frame.tick);
  }
  return ordered;
}

function normalizeEvents(events, failures) {
  if (!Array.isArray(events)) {
    failures.push('raw ore-cycle events are required');
    return [];
  }
  const ordered = [...events].sort((left, right) => Number(left?.seq) - Number(right?.seq));
  if (ordered.some((event, index) => !ORE_CYCLE_EVENTS.has(event?.event)
      || !Number.isSafeInteger(event?.tick) || !Number.isSafeInteger(event?.seq)
      || (!preSaveProvenance(event) && !postContinueProvenance(event))
      || event.seq < 1 || (index > 0 && event.seq <= ordered[index - 1].seq)
      || (index > 0 && provenanceOrder(event) < provenanceOrder(ordered[index - 1])))) {
    failures.push('ore-cycle events must have known names, explicit phase provenance, and strict sequence authority');
  }
  return ordered;
}

function provenanceOrder(row) {
  if (row?.observerChunk === CERES_ORE_CYCLE_PRE_SAVE_CHUNK) return 0;
  if (row?.observerChunk === CERES_ORE_CYCLE_POST_CONTINUE_CHUNK) return 1;
  return 2;
}

function preSaveProvenance(row) {
  return row?.observerChunk === CERES_ORE_CYCLE_PRE_SAVE_CHUNK
    && row?.observerChunkIndex === 0
    && !!String(row?.routePhase || '');
}

function postContinueProvenance(row) {
  return row?.observerChunk === CERES_ORE_CYCLE_POST_CONTINUE_CHUNK
    && row?.observerChunkIndex === 1
    && !!String(row?.routePhase || '')
    && row.routePhase !== 'ore-cycle-pre-save-gate';
}

function deriveStableOreCarrierIdentity(rows, failures) {
  if (rows.length < 2) {
    failures.push('Ore Barge identity is not present across route frames');
    return null;
  }
  const first = rows[0].actor;
  const identity = {
    slotId: first.slotId,
    role: first.role,
    defId: first.defId,
    worldRecordId: first.worldRecordId,
    jobId: first.jobId,
    entityIds: [...new Set(rows.map(({ actor }) => actor.entityId))],
  };
  if (identity.slotId !== PQ048_ORE_CARRIER_SLOT_ID || identity.role !== 'ore_carrier'
      || identity.defId !== 'ship_ironback'
      || identity.entityIds.some((entityId) => entityId == null)
      || !String(identity.worldRecordId || '')
      || !String(identity.jobId || '')) {
    failures.push('authored seam actor lacks the ship_ironback Ore Barge definition and durable entity/world-record/job identity');
  }
  for (const { actor } of rows) {
    if (actor.role !== 'ore_carrier' || actor.defId !== 'ship_ironback'
        || actor.worldRecordId !== identity.worldRecordId || actor.jobId !== identity.jobId) {
      failures.push('Ore Barge slot/world-record/job/hull-definition identity changed across route frames');
      break;
    }
    if (!Number.isFinite(actor.hull) || actor.hull <= 0) {
      failures.push('Ore Barge hull is not live and finite across route frames');
      break;
    }
  }
  return identity;
}

function validateContinueBoundary(
  receipt,
  identity,
  { routeEndTick, minPostContinueTicks },
  failures,
) {
  if (!receipt || receipt.pass !== true || receipt.source !== 'public-save-continue'
      || stableJson(receipt.publicPath) !== stableJson(['F5', 'reload', 'main_menu', 'continue'])
      || !Number.isSafeInteger(receipt.savedAtTick)
      || !Number.isSafeInteger(receipt.loadedAtTick)
      || receipt.loadedAtTick < receipt.savedAtTick) {
    failures.push('valid shared public Save/Continue boundary proof is required');
    return null;
  }
  const beforeRows = Array.isArray(receipt.actorRecordsBefore)
    ? receipt.actorRecordsBefore.filter((row) => row?.slotId === PQ048_ORE_CARRIER_SLOT_ID)
    : [];
  const afterRows = Array.isArray(receipt.actorRecordsAfter)
    ? receipt.actorRecordsAfter.filter((row) => row?.slotId === PQ048_ORE_CARRIER_SLOT_ID)
    : [];
  const before = beforeRows[0] || null;
  const after = afterRows[0] || null;
  if (beforeRows.length !== 1 || afterRows.length !== 1
      || !identity
      || before?.worldRecordId !== identity.worldRecordId
      || after?.worldRecordId !== identity.worldRecordId
      || before?.jobId !== identity.jobId
      || after?.jobId !== identity.jobId
      || stableJson(before) !== stableJson(after)) {
    failures.push('public Continue did not preserve the Ore Barge slot/world-record/job identity');
  }
  const saveGate = evaluateCeresOreCycleSaveGateReceipt(receipt.oreCycleSaveGate, {
    endTick: routeEndTick,
    minPostContinueTicks,
  });
  failures.push(...saveGate.failures.map((failure) => `pre-save ore-cycle gate: ${failure}`));
  const persistedSave = evaluateCeresPersistedOreCycleSaveReceipt(
    receipt.persistedOreCycleSave,
    { gateReceipt: receipt.oreCycleSaveGate },
  );
  failures.push(...persistedSave.failures.map((failure) => `persisted ore-cycle save: ${failure}`));
  if (receipt.oreCycleSaveGate?.tick > receipt.savedAtTick
      || receipt.savedAtTick > receipt.oreCycleSaveGate?.deadlineTick
      || receipt.persistedOreCycleSave?.savedAtTick !== receipt.savedAtTick
      || receipt.oreCycleSaveGate?.actor?.worldRecordId !== identity?.worldRecordId
      || receipt.oreCycleSaveGate?.actor?.jobId !== identity?.jobId) {
    failures.push('pre-save ore-cycle gate is not bound to the continued Ore Barge identity');
  }
  return {
    source: receipt.source,
    publicPath: [...receipt.publicPath],
    savedAtTick: receipt.savedAtTick,
    loadedAtTick: receipt.loadedAtTick,
    oreCarrierBefore: before ? {
      slotId: before.slotId,
      worldRecordId: before.worldRecordId,
      jobId: before.jobId,
    } : null,
    oreCarrierAfter: after ? {
      slotId: after.slotId,
      worldRecordId: after.worldRecordId,
      jobId: after.jobId,
    } : null,
    oreCycleSaveGate: receipt.oreCycleSaveGate ? {
      tick: receipt.oreCycleSaveGate.tick,
      deadlineTick: receipt.oreCycleSaveGate.deadlineTick,
      remainingTicks: receipt.oreCycleSaveGate.remainingTicks,
      routePhase: receipt.oreCycleSaveGate.routePhase,
      actor: receipt.oreCycleSaveGate.actor,
      manifest: receipt.oreCycleSaveGate.manifest,
    } : null,
    persistedOreCycleSave: receipt.persistedOreCycleSave || null,
  };
}

function validatePlayerProjection(frames, events, failures) {
  const projections = [
    ...frames.map((frame) => frame?.playerEconomy),
    ...events.map((event) => event?.playerEconomyAfter),
  ];
  if (projections.length < 2 || projections.some((projection) => (
    !projection || !Number.isFinite(projection.credits)
      || !projection.cargo || typeof projection.cargo.items !== 'object'
  ))) {
    failures.push('player wallet/cargo projections are incomplete');
    return;
  }
  const baseline = stableJson(projections[0]);
  if (projections.some((projection) => stableJson(projection) !== baseline)) {
    failures.push('player wallet/cargo changed during the NPC ore cycle');
  }
}

function normalizeLoadedManifest(manifest) {
  if (!manifest || manifest.role !== 'ore_carrier'
      || !String(manifest.manifestId || '') || !String(manifest.lotId || '')
      || manifest.lotId !== manifest.manifestId || !manifest.lotSource
      || !Array.isArray(manifest.lines) || manifest.lines.length !== 1
      || !Number.isSafeInteger(manifest.totalQty) || manifest.totalQty <= 0) return null;
  const line = manifest.lines[0];
  if (!String(line?.commodityId || '') || !Number.isSafeInteger(line?.qty)
      || line.qty !== manifest.totalQty) return null;
  return {
    manifestId: manifest.manifestId,
    lotId: manifest.lotId,
    lotSource: manifest.lotSource,
    role: manifest.role,
    lines: [{ commodityId: line.commodityId, qty: line.qty }],
    totalQty: manifest.totalQty,
    custody: manifest.custody || null,
  };
}

function validateIdentityMatch(identity, event, label, cycleEntityId, failures) {
  if (!identity || event.actorSlotId !== identity.slotId
      || event.actorWorldRecordId !== identity.worldRecordId
      || event.actorJobId !== identity.jobId || event.actorRole !== identity.role
      || event.actorDefId !== identity.defId
      || (event.minerId ?? event.freighterId ?? event.actorId) !== cycleEntityId) {
    failures.push(`${label} does not bind the stable Ore Barge identity`);
  }
}

function validateExtraction(extraction, manifest, identity, failures) {
  if (!Number.isSafeInteger(extraction.extractedU) || extraction.extractedU <= 0
      || extraction.extractedU !== manifest.totalQty
      || extraction.commodityId !== manifest.lines[0].commodityId
      || !String(extraction.workId || '')
      || extraction.workId !== manifest.lotSource?.workId
      || extraction.asteroidId !== manifest.lotSource?.asteroidId
      || extraction.fieldId !== manifest.lotSource?.fieldId
      || extraction.sectorId !== manifest.lotSource?.sectorId
      || manifest.lotSource?.sectorId !== 'sector_ceres_belt') {
    failures.push('extraction payload does not bind the loaded lot source, commodity, and quantity');
  }
  if (manifest.custody?.holderKind !== 'traffic'
      || manifest.custody?.holderId !== identity?.worldRecordId
      || manifest.custody?.acquiredBy !== 'mining:npcExtraction') {
    failures.push('loaded lot does not bind traffic custody to the durable Ore Barge extraction owner');
  }
}

function validateArrival(arrival, manifest, identity, failures) {
  if (arrival.stationId !== PQ048_REFINERY_STATION_ID
      || arrival.actorWorldRecordId !== identity?.worldRecordId
      || arrival.actorJobId !== identity?.jobId
      || arrival.manifestId !== manifest.manifestId || arrival.lotId !== manifest.lotId
      || stableJson(arrival.lotSource) !== stableJson(manifest.lotSource)
      || arrival.totalQty !== manifest.totalQty || !String(arrival.intentId || '')) {
    failures.push('freight arrival does not settle the same lot once at station_ceres');
  }
}

function validateTrades(trades, arrival, manifest, identity, continueBoundary, failures) {
  if (trades.length !== manifest.lines.length) {
    failures.push('lot has the wrong number of matching economy requests');
    return;
  }
  for (let index = 0; index < trades.length; index += 1) {
    const trade = trades[index];
    const line = manifest.lines[index];
    if (trade.seq >= arrival.seq || trade.tick > arrival.tick
        || trade.tick < continueBoundary?.loadedAtTick
        || trade.freighterId !== arrival.freighterId
        || trade.actorSlotId !== identity?.slotId
        || trade.actorWorldRecordId !== identity?.worldRecordId
        || trade.actorJobId !== identity?.jobId
        || trade.actorRole !== identity?.role
        || trade.actorDefId !== identity?.defId
        || trade.intentId !== arrival.intentId || trade.stationId !== PQ048_REFINERY_STATION_ID
        || trade.side !== 'sell' || trade.commodityId !== line.commodityId
        || trade.qty !== line.qty || !Number.isFinite(trade.marketStockBefore)
        || !Number.isFinite(trade.marketStockAfter)
        || Math.abs((trade.marketStockAfter - trade.marketStockBefore) - trade.qty) > 1e-9) {
      failures.push('economy request does not match arrival identity, line quantity, and post-owner stock');
    }
  }
}

function sameLoadedManifest(candidate, expected) {
  const normalized = normalizeLoadedManifest(candidate);
  return !!normalized && stableJson(normalized) === stableJson(expected);
}

function emptyManifest(manifest) {
  return !!manifest && manifest.role === 'ore_carrier' && manifest.totalQty === 0
    && Array.isArray(manifest.lines) && manifest.lines.length === 0;
}

function validateRouteArtifacts(artifacts, failures) {
  const rows = Array.isArray(artifacts) ? artifacts : [];
  const refinery = rows.find((artifact) => artifact?.kind === 'pocket-screenshot'
    && /(?:^|\/)01-refinery-default\.png$/i.test(String(artifact.path || '').replaceAll('\\', '/')));
  const seam = rows.find((artifact) => artifact?.kind === 'pocket-screenshot'
    && /(?:^|\/)[0-9]+-working-seam-flight\.png$/i.test(String(artifact.path || '').replaceAll('\\', '/')));
  if (!refinery) failures.push('PQ-048.01 refinery screenshot artifact is missing');
  if (!seam) failures.push('PQ-048.01 working-seam screenshot artifact is missing');
  return { refinery: refinery || null, seam: seam || null };
}

function projectEvent(event) {
  return {
    seq: event.seq,
    tick: event.tick,
    observerChunk: event.observerChunk,
    observerChunkIndex: event.observerChunkIndex,
    routePhase: event.routePhase,
    event: event.event,
    actorSlotId: event.actorSlotId,
    actorWorldRecordId: event.actorWorldRecordId,
    actorJobId: event.actorJobId,
    intentId: event.intentId,
    lotId: event.lotId,
    stationId: event.stationId,
    commodityId: event.commodityId,
    qty: event.qty ?? event.extractedU ?? event.totalQty,
    marketStockAfter: event.marketStockAfter,
    marketStockBefore: event.marketStockBefore,
    receiptId: event.receiptId,
    effectType: event.effectType,
  };
}

function projectFrameReceipt(row) {
  return {
    tick: row.tick,
    observerChunk: row.observerChunk,
    observerChunkIndex: row.observerChunkIndex,
    routePhase: row.routePhase,
    entityId: row.actor.entityId,
    worldRecordId: row.actor.worldRecordId,
    jobId: row.actor.jobId,
    manifest: row.actor.cargoManifest,
  };
}

function artifactDescriptor(root, absolutePath, kind, bytes) {
  const relative = path.relative(root, absolutePath).replaceAll('\\', '/');
  if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) {
    throw new Error(`PQ artifact escapes repository root: ${absolutePath}`);
  }
  return {
    kind,
    path: relative,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

function parseJsonBytes(bytes, label, failures) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 1) {
    failures.push(`${label} bytes are missing`);
    return null;
  }
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    failures.push(`${label} is not valid JSON`);
    return null;
  }
}

function validateBytesDescriptor(bytes, descriptor, label, failures, expectedRunDir) {
  const normalizedPath = String(descriptor?.path || '').replaceAll('\\', '/');
  if (!(bytes instanceof Uint8Array) || !descriptor
      || descriptor.bytes !== bytes.length
      || descriptor.sha256 !== createHash('sha256').update(bytes).digest('hex')
      || path.posix.dirname(normalizedPath) !== expectedRunDir
      || normalizedPath.split('/').includes('..')) {
    failures.push(`${label} descriptor does not bind its exact bytes`);
  }
}
