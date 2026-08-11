import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

import {
  derivePq048OreCycleProjection,
  evaluatePq048OreCycleEvidence,
  evaluatePq048PublishedArtifactSet,
  publishPq048OreCycleEvidence,
} from '../scripts/lib/pq048OreCycleAcceptance.mjs';
import {
  CERES_ORE_CYCLE_POST_CONTINUE_CHUNK,
  CERES_ORE_CYCLE_PRE_SAVE_CHUNK,
  evaluateCeresOreCycleSaveGateReceipt,
  evaluateCeresPersistedOreCycleSaveReceipt,
  evaluateCeresFiveMinuteRuntime,
  normalizeCeresOreCycleEvents,
  normalizeCeresTrace,
  projectCeresActivityFrame,
  waitForCeresOreCycleSaveGate,
} from '../scripts/lib/ceresFiveMinuteAcceptance.mjs';

const ENTITY_ID = 481;
const REMATERIALIZED_ENTITY_ID = 10_481;
const WORLD_RECORD_ID = 'wr_npc_00000003';
const JOB_ID = 'ceres_job_ceres_seam_miner';
const LOT_ID = 'manifest_pq048_ore_lot';
const INTENT_ID = 'freight-arrival-pq048';
const PQ_ROOT = '.devshots/pq048-ore-cycle/browser';
const RUN_RELATIVE = `${PQ_ROOT}/runs/example`;

test('pure PQ-048 projection proves one lot across public Save/Continue', () => {
  const result = derivePq048OreCycleProjection(validFixture());
  assert.deepEqual(result.failures, []);
  assert.equal(result.pass, true);
  assert.equal(result.projection.oreCarrier.role, 'ore_carrier');
  assert.equal(result.projection.oreCarrier.defId, 'ship_ironback');
  assert.deepEqual(result.projection.oreCarrier.cycleEntityIds, [ENTITY_ID]);
  assert.equal(result.projection.continueBoundary.savedAtTick, 20);
  assert.equal(result.projection.continueBoundary.loadedAtTick, 21);
  assert.equal(result.projection.continueBoundary.persistedOreCycleSave.savedAtTick, 20);
  assert.equal(result.projection.lot.lotId, LOT_ID);
  assert.equal(result.projection.loadedTransit.beforeSave.tick, 18);
  assert.equal(result.projection.loadedTransit.beforeSave.observerChunkIndex, 0);
  assert.equal(result.projection.loadedTransit.afterContinue.tick, 22);
  assert.equal(result.projection.loadedTransit.afterContinue.observerChunkIndex, 1);
  assert.equal(result.projection.arrival.stationId, 'station_ceres');
  assert.equal(result.projection.arrival.observerChunkIndex, 1);
  assert.equal(result.projection.market.stockBeforeSynchronousOwner, 100);
  assert.equal(result.projection.market.stockAfterSynchronousOwner, 108);
  assert.equal(result.projection.market.stockDelta, 8);
  assert.equal(result.projection.emptyHull.tick, 40);
  assert.equal(result.projection.playerWalletAndCargoUnchanged, true);
  assert.match(result.projection.artifacts.refinery.path, /01-refinery-default\.png$/);
  assert.match(result.projection.artifacts.seam.path, /working-seam-flight\.png$/);
});

test('Continue chunks retain route provenance across overlapping ticks and global resequencing', () => {
  const trace = normalizeCeresTrace([
    {
      observerChunk: CERES_ORE_CYCLE_PRE_SAVE_CHUNK,
      samples: [
        { observedTick: 100, simTimeS: 0, routePhase: 'ore-cycle-pre-save-gate' },
        { observedTick: 102, simTimeS: 2 / 60, routePhase: 'ore-cycle-pre-save-gate' },
      ],
      events: [
        { event: 'mining:npcExtraction', tick: 100, seq: 7, routePhase: 'ore-cycle-pre-save-gate', marker: 'before-save' },
        { event: 'traffic:jobActionReceipt', tick: 102, seq: 8, routePhase: 'ore-cycle-pre-save-gate', marker: 'before-save-receipt' },
      ],
      failures: [],
    },
    {
      observerChunk: CERES_ORE_CYCLE_POST_CONTINUE_CHUNK,
      samples: [
        { observedTick: 102, simTimeS: 2 / 60, routePhase: 'continue-restored' },
        { observedTick: 202, simTimeS: 102 / 60, routePhase: 'arrive-refinery' },
      ],
      events: [
        { event: 'aiTrader:requestTrade', tick: 101, seq: 1, routePhase: 'continue-restored', marker: 'after-continue' },
        { event: 'freight:arrival', tick: 101, seq: 2, routePhase: 'continue-restored', marker: 'after-continue-arrival' },
      ],
      failures: [],
    },
  ], {
    startTick: 100,
    endTick: 202,
    fixedTicks: 102,
    tickRateHz: 60,
    simulationSeconds: 1.7,
  });
  const overlap = trace.oreCycleSamples.filter((sample) => sample.observedTick === 102)
    .map(projectCeresActivityFrame);
  assert.deepEqual(overlap.map(({ observerChunk, observerChunkIndex, routePhase }) => ({
    observerChunk,
    observerChunkIndex,
    routePhase,
  })), [
    { observerChunk: CERES_ORE_CYCLE_PRE_SAVE_CHUNK, observerChunkIndex: 0, routePhase: 'ore-cycle-pre-save-gate' },
    { observerChunk: CERES_ORE_CYCLE_POST_CONTINUE_CHUNK, observerChunkIndex: 1, routePhase: 'continue-restored' },
  ]);
  const normalized = normalizeCeresOreCycleEvents(trace.events);
  assert.deepEqual(normalized.map(({ marker, seq, sourceSeq }) => ({ marker, seq, sourceSeq })), [
    { marker: 'before-save', seq: 1, sourceSeq: 7 },
    { marker: 'before-save-receipt', seq: 2, sourceSeq: 8 },
    { marker: 'after-continue', seq: 3, sourceSeq: 1 },
    { marker: 'after-continue-arrival', seq: 4, sourceSeq: 2 },
  ]);
});

test('route observer brackets the synchronous economy owner with real ordered stock reads', () => {
  const source = readFileSync(path.resolve(
    import.meta.dirname,
    '../scripts/lib/ceresFiveMinuteAcceptance.mjs',
  ), 'utf8');
  const before = source.indexOf('captureMarketStockBeforeOwner');
  const reorder = source.indexOf("tradeListeners.add(captureMarketStockBeforeOwner)");
  const post = source.indexOf('const marketStockAfter = stationId && commodityId');
  assert.ok(before >= 0 && reorder > before && post > reorder,
    'observer must register the pre-owner read first and the post-owner read last');
  assert.match(source, /marketStockBefore: Number\.isFinite\(marketBeforeReceipt\?\.stock\)/);
});

test('PQ route gates F5 on a loaded lot and reserves the existing post-Continue horizon', () => {
  const valid = saveGateReceipt({ tick: 18, endTick: 60, minPostContinueTicks: 10 });
  assert.deepEqual(evaluateCeresOreCycleSaveGateReceipt(valid, {
    endTick: 60,
    minPostContinueTicks: 10,
  }).failures, []);

  const arbitraryFourthLeg = structuredClone(valid);
  arbitraryFourthLeg.manifest = emptyManifest();
  assert.equal(evaluateCeresOreCycleSaveGateReceipt(arbitraryFourthLeg, {
    endTick: 60,
    minPostContinueTicks: 10,
  }).pass, false);
  const tooLate = saveGateReceipt({ tick: 51, endTick: 60, minPostContinueTicks: 10 });
  assert.equal(evaluateCeresOreCycleSaveGateReceipt(tooLate, {
    endTick: 60,
    minPostContinueTicks: 10,
  }).pass, false);

  const exactSaved = persistedSaveReceipt({ savedAtTick: 20 });
  assert.equal(evaluateCeresPersistedOreCycleSaveReceipt(exactSaved, {
    gateReceipt: valid,
  }).pass, true, 'persisted envelope resolves a gate sample older than savedAtTick');
  const unloadedBeforeSave = persistedSaveReceipt({
    savedAtTick: 20,
    manifest: emptyManifest(),
  });
  assert.equal(evaluateCeresPersistedOreCycleSaveReceipt(unloadedBeforeSave, {
    gateReceipt: valid,
  }).pass, false, 'unload between gate and F5 must fail');
  const changedLot = persistedSaveReceipt({ savedAtTick: 20 });
  changedLot.manifest.manifestId = 'replacement-lot';
  changedLot.manifest.lotId = 'replacement-lot';
  assert.equal(evaluateCeresPersistedOreCycleSaveReceipt(changedLot, {
    gateReceipt: valid,
  }).pass, false, 'lot replacement between gate and F5 must fail');
  const wrongSaveTick = persistedSaveReceipt({ savedAtTick: 20 });
  wrongSaveTick.saveCompletedTick = 21;
  assert.equal(evaluateCeresPersistedOreCycleSaveReceipt(wrongSaveTick, {
    gateReceipt: valid,
  }).pass, false, 'persisted tick must equal synchronous save completion');

  const driver = readFileSync(path.resolve(
    import.meta.dirname,
    '../scripts/lib/ceresFiveMinuteAcceptance.mjs',
  ), 'utf8');
  const routeStart = driver.indexOf('export async function runCeresFiveMinutePublicRoute');
  const routeEnd = driver.indexOf('export async function preflightCeresFiveMinuteRuntime');
  const routeSource = driver.slice(routeStart, routeEnd);
  const fourthLeg = routeSource.indexOf('routeCycle >= legs.length');
  const loadedGate = routeSource.indexOf('waitForCeresOreCycleSaveGate', fourthLeg);
  const publicSave = routeSource.indexOf('publicSaveAndContinue', fourthLeg);
  assert.ok(fourthLeg >= 0 && loadedGate > fourthLeg && publicSave > loadedGate,
    'the fourth leg must wait for loaded-lot authority before public Save/Continue');
  assert.match(driver, /const deadlineTick = endTick - minPostContinueTicks/);

  const checker = readFileSync(path.resolve(
    import.meta.dirname,
    '../scripts/check-pq048-ore-cycle.mjs',
  ), 'utf8');
  assert.match(checker, /routeOptions: \{ oreCycleGate: PQ048_ORE_CYCLE_ROUTE_GATE \}/);
  assert.match(checker, /minPostContinueTicks: PQ048_ORE_CYCLE_MIN_POST_CONTINUE_TICKS/);
});

test('ore-cycle save gate reads its receipt by value after a raw-CDP boolean wait', async () => {
  const expected = saveGateReceipt({ tick: 18, endTick: 60, minPostContinueTicks: 10 });
  let evaluateCalls = 0;
  let waitCalls = 0;
  const rawCdpCompatiblePage = {
    async evaluate() {
      evaluateCalls += 1;
      return evaluateCalls === 2 ? structuredClone(expected) : true;
    },
    async waitForFunction(_predicate, argument, options) {
      waitCalls += 1;
      assert.equal(argument.deadline, 50);
      assert.equal(typeof argument.key, 'string');
      assert.deepEqual(options, { timeout: 900 });
      return true;
    },
  };

  const receipt = await waitForCeresOreCycleSaveGate(rawCdpCompatiblePage, {
    endTick: 60,
    minPostContinueTicks: 10,
    timeoutMs: 900,
  });

  assert.deepEqual(receipt, expected);
  assert.equal(waitCalls, 1);
  assert.equal(evaluateCalls, 3, 'clear, by-value read, and cleanup must use page.evaluate');
});

test('durable identity joins extraction before Continue to arrival after rematerialization', () => {
  const input = validFixture();
  for (const frame of input.frames.filter((entry) => entry.tick >= 21)) {
    frame.actorStates[0].entityId = REMATERIALIZED_ENTITY_ID;
  }
  trade(input).freighterId = REMATERIALIZED_ENTITY_ID;
  arrival(input).freighterId = REMATERIALIZED_ENTITY_ID;
  arrivalReceipt(input).actorId = REMATERIALIZED_ENTITY_ID;
  const accepted = derivePq048OreCycleProjection(input);
  assert.equal(accepted.pass, true, accepted.failures.join(' | '));
  assert.deepEqual(
    accepted.projection.oreCarrier.cycleEntityIds,
    [ENTITY_ID, REMATERIALIZED_ENTITY_ID],
  );

  input.frames[2].actorStates[0].worldRecordId = 'wr_drifted_after_continue';
  const rejected = derivePq048OreCycleProjection(input);
  assert.equal(rejected.pass, false);
  assert.ok(rejected.failures.some((failure) => failure.includes('identity changed')));
});

test('overlapping post-load ticks from the pre-reload chunk cannot prove restored custody', () => {
  const wrongFrame = validFixture();
  wrongFrame.frames[2].observerChunk = CERES_ORE_CYCLE_PRE_SAVE_CHUNK;
  wrongFrame.frames[2].observerChunkIndex = 0;
  wrongFrame.frames[2].routePhase = 'ore-cycle-pre-save-gate';
  const frameResult = derivePq048OreCycleProjection(wrongFrame);
  assert.equal(frameResult.pass, false);
  assert.ok(frameResult.failures.some((failure) => failure.includes('after Continue')));

  const wrongEvents = validFixture();
  for (const event of wrongEvents.events.filter((entry) => entry.tick >= 21)) {
    event.observerChunk = CERES_ORE_CYCLE_PRE_SAVE_CHUNK;
    event.observerChunkIndex = 0;
    event.routePhase = 'ore-cycle-pre-save-gate';
  }
  const eventResult = derivePq048OreCycleProjection(wrongEvents);
  assert.equal(eventResult.pass, false);
  assert.ok(eventResult.failures.some((failure) => failure.includes('spans Save/Continue')));
});

test('a wholly pre-Continue cycle fails even when a later frame rematerializes', () => {
  const input = validFixture();
  input.continueProof.savedAtTick = 35;
  input.continueProof.loadedAtTick = 36;
  input.frames.at(-1).actorStates[0].entityId = REMATERIALIZED_ENTITY_ID;
  const result = derivePq048OreCycleProjection(input);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((failure) => failure.includes('spans Save/Continue')));
});

test('candidate evaluator requires a full canonical shared Browser runtime', async () => {
  const evidence = await canonicalPqRuntimeFixture();
  assert.equal(evaluatePq048OreCycleEvidence(evidence).pass, true);

  const minimal = minimalEvidence();
  const minimalResult = evaluatePq048OreCycleEvidence(minimal);
  assert.equal(minimalResult.pass, false);
  assert.ok(minimalResult.failures.some((failure) => failure.includes('shared Ceres runtime')));

  for (const [label, mutate] of [
    ['wrong route', (doc) => { doc.route.id = 'private_fixture'; }],
    ['wrong manifest', (doc) => { doc.authority.validationManifestId = 'ceres-five-minute-browser'; }],
    ['missing consumed schema', (doc) => { doc.authority.consumedLedgerSchema = null; }],
    ['failed shared machine contract', (doc) => { doc.machinePass = false; }],
  ]) {
    const changed = structuredClone(evidence);
    mutate(changed);
    assert.equal(evaluatePq048OreCycleEvidence(changed).pass, false, label);
  }
});

test('ore-cycle derivation fails closed on boundary, identity, custody, economy, and artifacts', () => {
  const cases = [
    ['missing Continue proof', (input) => { input.continueProof = null; }],
    ['missing observer chunk index', (input) => { input.frames[2].observerChunkIndex = null; }],
    ['mismatched observer chunk index', (input) => { trade(input).observerChunkIndex = 0; }],
    ['forged Continue route', (input) => { input.continueProof.publicPath[0] = 'private-save'; }],
    ['Continue world-record drift', (input) => {
      input.continueProof.actorRecordsAfter[0].worldRecordId = 'wr_other';
    }],
    ['wrong authored role', (input) => { input.frames[1].actorStates[0].role = 'miner'; }],
    ['wrong authored hull definition', (input) => { input.frames[1].actorStates[0].defId = 'ship_mule'; }],
    ['world-record drift', (input) => { input.frames[1].actorStates[0].worldRecordId = 'wr_other'; }],
    ['job drift', (input) => { input.frames[1].actorStates[0].jobId = 'job:other'; }],
    ['dead hull', (input) => { input.frames[1].actorStates[0].hull = 0; }],
    ['missing pre-save load', (input) => { input.frames[1].actorStates[0].cargoManifest = emptyManifest(); }],
    ['missing post-Continue load', (input) => { input.frames[2].actorStates[0].cargoManifest = emptyManifest(); }],
    ['wrong lot custody', (input) => { extraction(input).cargoManifestAfter.custody.holderKind = 'player'; }],
    ['wrong custody holder', (input) => { extraction(input).cargoManifestAfter.custody.holderId = 'wr_other'; }],
    ['wrong custody acquisition', (input) => { extraction(input).cargoManifestAfter.custody.acquiredBy = 'debug'; }],
    ['wrong extraction source', (input) => { extraction(input).asteroidId = 999; }],
    ['wrong lot work source', (input) => { extraction(input).cargoManifestAfter.lotSource.workId = 'work:other'; }],
    ['wrong lot field source', (input) => { extraction(input).cargoManifestAfter.lotSource.fieldId = 'f_other'; }],
    ['wrong lot sector source', (input) => { extraction(input).cargoManifestAfter.lotSource.sectorId = 'sector_other'; }],
    ['saved hull unloaded before F5', (input) => {
      input.continueProof.persistedOreCycleSave.manifest = emptyManifest();
    }],
    ['saved lot changed before F5', (input) => {
      input.continueProof.persistedOreCycleSave.manifest.manifestId = 'other-lot';
      input.continueProof.persistedOreCycleSave.manifest.lotId = 'other-lot';
    }],
    ['saved envelope tick differs from Continue', (input) => {
      input.continueProof.persistedOreCycleSave.savedAtTick += 1;
      input.continueProof.persistedOreCycleSave.saveCompletedTick += 1;
    }],
    ['duplicate arrival', (input) => { input.events.splice(4, 0, { ...arrival(input), seq: 4 }); resequence(input); }],
    ['same-lot loss', (input) => { input.events.splice(4, 0, eventBase('freight:loss', 4, 30, { lotId: LOT_ID })); resequence(input); }],
    ['wrong refinery', (input) => { arrival(input).stationId = 'station_beltout'; }],
    ['wrong owner actor', (input) => { trade(input).actorWorldRecordId = 'wr_other'; }],
    ['wrong owner quantity', (input) => { trade(input).qty = 7; }],
    ['missing post-owner stock', (input) => { trade(input).marketStockAfter = null; }],
    ['missing pre-owner stock', (input) => { trade(input).marketStockBefore = null; }],
    ['doubled owner mutation', (input) => { trade(input).marketStockAfter = 116; }],
    ['trade after arrival', (input) => { trade(input).seq = 5; arrival(input).seq = 3; }],
    ['hull not emptied', (input) => { input.frames[3].actorStates[0].cargoManifest = loadedManifest(); }],
    ['player wallet changed', (input) => { input.frames[3].playerEconomy.credits += 8; }],
    ['missing extraction receipt', (input) => {
      input.events = input.events.filter((event) => event.effectType !== 'mining:npcExtraction');
      resequence(input);
    }],
    ['missing arrival receipt', (input) => {
      input.events = input.events.filter((event) => event.effectType !== 'freight:arrival');
      resequence(input);
    }],
    ['missing refinery artifact', (input) => { input.artifacts.shift(); }],
    ['missing seam artifact', (input) => { input.artifacts.splice(1, 1); }],
  ];

  for (const [label, mutate] of cases) {
    const input = validFixture();
    mutate(input);
    const result = derivePq048OreCycleProjection(input);
    assert.equal(result.pass, false, label);
    assert.ok(result.failures.length > 0, `${label} must explain its failure`);
  }
});

test('publisher requires and exactly binds the canonical consumed claim and shared run', async (t) => {
  const fixture = await publicationFixture(t, { writeLedger: false });

  const missing = await publishPq048OreCycleEvidence(fixture.publishArgs);
  assert.equal(missing.pass, false);
  assert.ok(missing.failures.some((failure) => failure.includes('consumed broker claim')));

  const wrongLedger = consumedLedgerFor(fixture.evidence);
  wrongLedger.digests.manifestDigest = 'f'.repeat(64);
  await mkdir(path.dirname(fixture.consumedPath), { recursive: true });
  await writeFile(fixture.consumedPath, jsonBytes(wrongLedger));
  const rejected = await publishPq048OreCycleEvidence(fixture.publishArgs);
  assert.equal(rejected.pass, false);
  assert.ok(rejected.failures.some((failure) => failure.includes('manifest digest')));

  const consumedBytes = jsonBytes(consumedLedgerFor(fixture.evidence));
  await writeFile(fixture.consumedPath, consumedBytes);
  const result = await publishPq048OreCycleEvidence(fixture.publishArgs);
  assert.equal(result.pass, true, result.failures?.join(' | '));

  const [sharedSnapshotBytes, consumedClaimBytes, pqEvidenceBytes, ledgerBytes, artifactSetBytes] = await Promise.all([
    readFile(result.sharedSnapshotPath),
    readFile(result.consumedClaimSnapshotPath),
    readFile(result.outputPath),
    readFile(result.ledgerPath),
    readFile(result.artifactSetPath),
  ]);
  assert.deepEqual(consumedClaimBytes, consumedBytes, 'publisher must copy exact consumed-ledger bytes');
  const publication = {
    sharedSnapshotBytes,
    consumedClaimBytes,
    pqEvidenceBytes,
    ledgerBytes,
    artifactSet: JSON.parse(artifactSetBytes.toString('utf8')),
  };
  assert.deepEqual(evaluatePq048PublishedArtifactSet(publication).failures, []);

  for (const [label, mutate] of [
    ['shared snapshot byte drift', (input) => {
      input.sharedSnapshotBytes = appendByte(input.sharedSnapshotBytes);
    }],
    ['consumed claim byte drift', (input) => {
      input.consumedClaimBytes = appendByte(input.consumedClaimBytes);
    }],
    ['PQ evidence byte drift', (input) => { input.pqEvidenceBytes = appendByte(input.pqEvidenceBytes); }],
    ['ledger byte drift', (input) => { input.ledgerBytes = appendByte(input.ledgerBytes); }],
    ['artifact-set claim drift', (input) => { input.artifactSet.claimId = 'claim_other'; }],
    ['artifact-set run drift', (input) => { input.artifactSet.runId = 'other'; }],
    ['route artifact drift', (input) => { input.artifactSet.routeArtifacts.pop(); }],
  ]) {
    const changed = structuredClone(publication);
    mutate(changed);
    const checked = evaluatePq048PublishedArtifactSet(changed);
    assert.equal(checked.pass, false, label);
    assert.ok(checked.failures.length > 0, `${label} must explain its failure`);
  }
});

test('publisher rejects a hand-built minimal shared document before claim lookup', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'spaceface-pq048-minimal-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runDir = path.join(root, ...RUN_RELATIVE.split('/'));
  const evidencePath = path.join(root, ...PQ_ROOT.split('/'), 'browser', 'evidence.json');
  await mkdir(runDir, { recursive: true });
  await mkdir(path.dirname(evidencePath), { recursive: true });
  const evidence = minimalEvidence();
  await writeFile(evidencePath, jsonBytes(evidence));
  const result = await publishPq048OreCycleEvidence({
    root,
    sharedResult: {
      pass: true,
      primaryAcceptance: true,
      runtimeKind: 'browser',
      candidateDigest: evidence.authority.candidateDigest,
      sourceCandidateDigest: evidence.authority.sourceCandidateDigest,
      evidencePath,
      runDir,
    },
  });
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((failure) => failure.includes('shared Ceres runtime')));
});

function validFixture() {
  const playerEconomy = {
    credits: 5_000,
    cargo: {
      items: { cmdty_food: 4 },
      usedVolume: 4,
      usedMass: 4,
      capVolume: 40,
      capMass: 60,
    },
  };
  const frames = [
    frame(10, emptyManifest(), playerEconomy, CERES_ORE_CYCLE_PRE_SAVE_CHUNK, 'select-refinery'),
    frame(18, loadedManifest(), playerEconomy, CERES_ORE_CYCLE_PRE_SAVE_CHUNK, 'ore-cycle-pre-save-gate'),
    frame(22, loadedManifest(), playerEconomy, CERES_ORE_CYCLE_POST_CONTINUE_CHUNK, 'continue-restored'),
    frame(40, emptyManifest(), playerEconomy, CERES_ORE_CYCLE_POST_CONTINUE_CHUNK, 'arrive-refinery'),
  ];
  const events = [
    eventBase('mining:npcExtraction', 1, 10, {
      minerId: ENTITY_ID,
      asteroidId: 9001,
      fieldId: 'f_ceres_1',
      sectorId: 'sector_ceres_belt',
      commodityId: 'cmdty_ore_iron',
      extractedU: 8,
      workId: 'npc-miner-work:ore-barge:4',
      cargoManifestAfter: loadedManifest(),
      observerChunk: CERES_ORE_CYCLE_PRE_SAVE_CHUNK,
      routePhase: 'ore-cycle-pre-save-gate',
    }),
    eventBase('traffic:jobActionReceipt', 2, 10, {
      actorId: ENTITY_ID,
      effectType: 'mining:npcExtraction',
      effectApplied: true,
      receiptId: 'job-action:mining',
      observerChunk: CERES_ORE_CYCLE_PRE_SAVE_CHUNK,
      routePhase: 'ore-cycle-pre-save-gate',
    }),
    eventBase('aiTrader:requestTrade', 3, 30, {
      freighterId: ENTITY_ID,
      stationId: 'station_ceres',
      commodityId: 'cmdty_ore_iron',
      side: 'sell',
      qty: 8,
      intentId: INTENT_ID,
      lotId: LOT_ID,
      marketStockBefore: 100,
      marketStockAfter: 108,
      observerChunk: CERES_ORE_CYCLE_POST_CONTINUE_CHUNK,
      routePhase: 'continue-restored',
    }),
    eventBase('freight:arrival', 4, 30, {
      freighterId: ENTITY_ID,
      stationId: 'station_ceres',
      manifestId: LOT_ID,
      lotId: LOT_ID,
      lotSource: lotSource(),
      totalQty: 8,
      intentId: INTENT_ID,
      trades: [{ stationId: 'station_ceres', commodityId: 'cmdty_ore_iron', side: 'sell', qty: 8 }],
      observerChunk: CERES_ORE_CYCLE_POST_CONTINUE_CHUNK,
      routePhase: 'continue-restored',
    }),
    eventBase('traffic:jobActionReceipt', 5, 30, {
      actorId: ENTITY_ID,
      effectType: 'freight:arrival',
      effectApplied: true,
      receiptId: 'job-action:arrival',
      cargoManifestAfter: emptyManifest(),
      observerChunk: CERES_ORE_CYCLE_POST_CONTINUE_CHUNK,
      routePhase: 'continue-restored',
    }),
  ];
  for (const event of events) event.playerEconomyAfter = structuredClone(playerEconomy);
  const actorRecord = { slotId: 'ceres_seam_miner', worldRecordId: WORLD_RECORD_ID, jobId: JOB_ID };
  return {
    frames,
    events,
    continueProof: {
      pass: true,
      source: 'public-save-continue',
      publicPath: ['F5', 'reload', 'main_menu', 'continue'],
      savedAtTick: 20,
      loadedAtTick: 21,
      actorRecordsBefore: [structuredClone(actorRecord)],
      actorRecordsAfter: [structuredClone(actorRecord)],
      oreCycleSaveGate: saveGateReceipt({ tick: 18, endTick: 60, minPostContinueTicks: 10 }),
      persistedOreCycleSave: persistedSaveReceipt({ savedAtTick: 20 }),
    },
    routeEndTick: 60,
    minPostContinueTicks: 10,
    artifacts: [artifact('01-refinery-default.png'), artifact('02-working-seam-flight.png')],
  };
}

function frame(tick, cargoManifest, playerEconomy, observerChunk, routePhase) {
  return {
    tick,
    observerChunk,
    observerChunkIndex: observerChunk === CERES_ORE_CYCLE_PRE_SAVE_CHUNK ? 0 : 1,
    routePhase,
    playerEconomy: structuredClone(playerEconomy),
    actorStates: [{
      slotId: 'ceres_seam_miner',
      role: 'ore_carrier',
      defId: 'ship_ironback',
      entityId: ENTITY_ID,
      worldRecordId: WORLD_RECORD_ID,
      jobId: JOB_ID,
      hull: 180,
      hullMax: 180,
      cargoManifest: structuredClone(cargoManifest),
    }],
  };
}

function loadedManifest() {
  return {
    manifestId: LOT_ID,
    lotId: LOT_ID,
    lotSource: lotSource(),
    role: 'ore_carrier',
    lines: [{ commodityId: 'cmdty_ore_iron', qty: 8 }],
    totalQty: 8,
    custody: {
      holderKind: 'traffic',
      holderId: WORLD_RECORD_ID,
      acquiredBy: 'mining:npcExtraction',
    },
  };
}

function emptyManifest() {
  return {
    manifestId: 'manifest_empty_next_leg',
    lotId: null,
    lotSource: null,
    role: 'ore_carrier',
    lines: [],
    totalQty: 0,
    custody: null,
  };
}

function lotSource() {
  return {
    workId: 'npc-miner-work:ore-barge:4',
    asteroidId: 9001,
    fieldId: 'f_ceres_1',
    sectorId: 'sector_ceres_belt',
  };
}

function saveGateReceipt({
  tick,
  endTick,
  minPostContinueTicks,
  entityId = ENTITY_ID,
} = {}) {
  return {
    status: 'loaded',
    tick,
    deadlineTick: endTick - minPostContinueTicks,
    remainingTicks: endTick - tick,
    routePhase: 'ore-cycle-pre-save-gate',
    actor: {
      slotId: 'ceres_seam_miner',
      role: 'ore_carrier',
      defId: 'ship_ironback',
      entityId,
      worldRecordId: WORLD_RECORD_ID,
      jobId: JOB_ID,
    },
    manifest: loadedManifest(),
  };
}

function persistedSaveReceipt({ savedAtTick, manifest = loadedManifest() } = {}) {
  return {
    schema: 'spaceface.ceresPersistedOreCycleSave.v1',
    source: 'sf.save.quick',
    envelope: {
      fmt: 'spaceface-save',
      version: 12,
      slot: 'quick',
      savedAt: '2026-08-11T12:00:00.000Z',
      checksum: 'abc123ef',
    },
    savedAtTick,
    saveCompletedTick: savedAtTick,
    actor: {
      worldRecordId: WORLD_RECORD_ID,
      role: 'ore_carrier',
      defId: 'ship_ironback',
      hull: 180,
    },
    job: {
      jobId: JOB_ID,
      worldRecordId: WORLD_RECORD_ID,
    },
    manifest: structuredClone(manifest),
  };
}

function eventBase(event, seq, tick, extra = {}) {
  const row = {
    event,
    seq,
    tick,
    actorSlotId: 'ceres_seam_miner',
    actorWorldRecordId: WORLD_RECORD_ID,
    actorJobId: JOB_ID,
    jobId: JOB_ID,
    actorRole: 'ore_carrier',
    actorDefId: 'ship_ironback',
    actorHull: 180,
    ...extra,
  };
  if (row.observerChunkIndex == null) {
    if (row.observerChunk === CERES_ORE_CYCLE_PRE_SAVE_CHUNK) row.observerChunkIndex = 0;
    if (row.observerChunk === CERES_ORE_CYCLE_POST_CONTINUE_CHUNK) row.observerChunkIndex = 1;
  }
  return row;
}

function artifact(name) {
  return {
    kind: 'pocket-screenshot',
    path: `${RUN_RELATIVE}/${name}`,
    bytes: 8_192,
    sha256: 'c'.repeat(64),
  };
}

function extraction(input) {
  return input.events.find((event) => event.event === 'mining:npcExtraction');
}

function trade(input) {
  return input.events.find((event) => event.event === 'aiTrader:requestTrade');
}

function arrival(input) {
  return input.events.find((event) => event.event === 'freight:arrival');
}

function arrivalReceipt(input) {
  return input.events.find((event) => event.effectType === 'freight:arrival');
}

function resequence(input) {
  input.events.forEach((event, index) => { event.seq = index + 1; });
}

function minimalEvidence() {
  const fixture = validFixture();
  return {
    pass: true,
    machinePass: true,
    primaryAcceptance: true,
    runtimeKind: 'browser',
    route: {
      id: 'ceres_reference_pocket',
      publicPath: ['main_menu', 'sandbox', 'ceres_reference_pocket'],
    },
    authority: {
      validationManifestId: 'pq048-ore-cycle-browser',
      consumedLedgerSchema: 'spaceface.validation-broker-claim-consumed.v1',
      claimId: 'claim-pq048',
      candidateHash: '1'.repeat(40),
      candidateDigest: 'a'.repeat(64),
      sourceCandidateDigest: 'b'.repeat(64),
      artifactRoot: PQ_ROOT,
      worktree: { digest: 'c'.repeat(64) },
      digests: { runtimeManifestDigest: 'd'.repeat(64) },
    },
    artifactIdentity: artifact('artifact-set.json'),
    observations: {
      frames: fixture.frames,
      oreCycleFrames: fixture.frames,
      oreCycleEvents: fixture.events,
      continueProof: fixture.continueProof,
    },
    artifacts: fixture.artifacts,
  };
}

let sharedFixtureModulePromise = null;

async function canonicalPqRuntimeFixture() {
  if (!sharedFixtureModulePromise) {
    const testPath = path.resolve(import.meta.dirname, 'ceres-five-minute-acceptance.test.mjs');
    const baseUrl = pathToFileURL(testPath);
    let source = await readFile(testPath, 'utf8');
    source = source.replace(/import test from 'node:test';\r?\n/, 'const test = () => {};\n');
    source = source.replace(/from '(\.\.\/[^']+)';/g, (_match, specifier) => (
      `from '${new URL(specifier, baseUrl).href}';`
    ));
    source += '\nexport { runtimeFixture };\n';
    sharedFixtureModulePromise = import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  }
  const { runtimeFixture } = await sharedFixtureModulePromise;
  const evidence = runtimeFixture('browser');
  const oldRoot = '.devshots/physics-as-spectacle/ceres-five-minute/browser';
  rewriteArtifactPaths(evidence, oldRoot, RUN_RELATIVE);
  evidence.machinePass = true;
  evidence.authority.artifactRoot = PQ_ROOT;
  evidence.authority.validationManifestId = 'pq048-ore-cycle-browser';
  evidence.authority.consumedLedgerSchema = 'spaceface.validation-broker-claim-consumed.v1';
  addOreCycleTelemetry(evidence);
  const shared = evaluateCeresFiveMinuteRuntime(evidence, { runtimeKind: 'browser' });
  assert.equal(shared.pass, true, shared.failures.join(' | '));
  return evidence;
}

function rewriteArtifactPaths(value, oldRoot, newRoot) {
  if (!value || typeof value !== 'object') return;
  if (typeof value.path === 'string' && value.path.startsWith(`${oldRoot}/`)) {
    value.path = `${newRoot}/${value.path.slice(oldRoot.length + 1)}`;
  }
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') rewriteArtifactPaths(child, oldRoot, newRoot);
  }
}

function addOreCycleTelemetry(evidence) {
  const { frames, continueProof } = evidence.observations;
  const playerEconomy = {
    credits: 5_000,
    cargo: {
      items: { cmdty_food: 4 },
      usedVolume: 4,
      usedMass: 4,
      capVolume: 40,
      capMass: 60,
    },
  };
  for (const frameRow of frames) {
    const postContinue = frameRow.tick >= continueProof.loadedAtTick;
    const actor = frameRow.actorStates.find((entry) => entry.slotId === 'ceres_seam_miner');
    Object.assign(actor, {
      role: 'ore_carrier',
      defId: 'ship_ironback',
      entityId: postContinue
        ? REMATERIALIZED_ENTITY_ID
        : ENTITY_ID,
      hull: 180,
      hullMax: 180,
      cargoManifest: frameRow.tick >= 11_400 && frameRow.tick < 15_000
        ? loadedManifest()
        : emptyManifest(),
    });
    frameRow.observerChunk = postContinue
      ? CERES_ORE_CYCLE_POST_CONTINUE_CHUNK
      : CERES_ORE_CYCLE_PRE_SAVE_CHUNK;
    frameRow.observerChunkIndex = postContinue ? 1 : 0;
    frameRow.routePhase = postContinue ? 'continue-restored' : 'ore-cycle-pre-save-gate';
    frameRow.playerEconomy = structuredClone(playerEconomy);
  }
  evidence.observations.oreCycleFrames = structuredClone(frames);
  continueProof.oreCycleSaveGate = saveGateReceipt({
    tick: 11_400,
    endTick: evidence.route.endTick,
    minPostContinueTicks: 2_400,
  });
  continueProof.persistedOreCycleSave = persistedSaveReceipt({
    savedAtTick: continueProof.savedAtTick,
  });
  const events = [
    eventBase('mining:npcExtraction', 1, 11_399, {
      minerId: ENTITY_ID,
      asteroidId: 9001,
      fieldId: 'f_ceres_1',
      sectorId: 'sector_ceres_belt',
      commodityId: 'cmdty_ore_iron',
      extractedU: 8,
      workId: 'npc-miner-work:ore-barge:4',
      cargoManifestAfter: loadedManifest(),
      observerChunk: CERES_ORE_CYCLE_PRE_SAVE_CHUNK,
      routePhase: 'ore-cycle-pre-save-gate',
    }),
    eventBase('traffic:jobActionReceipt', 2, 11_399, {
      actorId: ENTITY_ID,
      effectType: 'mining:npcExtraction',
      effectApplied: true,
      receiptId: 'job-action:mining',
      observerChunk: CERES_ORE_CYCLE_PRE_SAVE_CHUNK,
      routePhase: 'ore-cycle-pre-save-gate',
    }),
    eventBase('aiTrader:requestTrade', 3, 15_000, {
      freighterId: REMATERIALIZED_ENTITY_ID,
      stationId: 'station_ceres',
      commodityId: 'cmdty_ore_iron',
      side: 'sell',
      qty: 8,
      intentId: INTENT_ID,
      lotId: LOT_ID,
      marketStockBefore: 100,
      marketStockAfter: 108,
      observerChunk: CERES_ORE_CYCLE_POST_CONTINUE_CHUNK,
      routePhase: 'continue-restored',
    }),
    eventBase('freight:arrival', 4, 15_000, {
      freighterId: REMATERIALIZED_ENTITY_ID,
      stationId: 'station_ceres',
      manifestId: LOT_ID,
      lotId: LOT_ID,
      lotSource: lotSource(),
      totalQty: 8,
      intentId: INTENT_ID,
      trades: [{ stationId: 'station_ceres', commodityId: 'cmdty_ore_iron', side: 'sell', qty: 8 }],
      observerChunk: CERES_ORE_CYCLE_POST_CONTINUE_CHUNK,
      routePhase: 'continue-restored',
    }),
    eventBase('traffic:jobActionReceipt', 5, 15_000, {
      actorId: REMATERIALIZED_ENTITY_ID,
      effectType: 'freight:arrival',
      effectApplied: true,
      receiptId: 'job-action:arrival',
      cargoManifestAfter: emptyManifest(),
      observerChunk: CERES_ORE_CYCLE_POST_CONTINUE_CHUNK,
      routePhase: 'continue-restored',
    }),
  ];
  for (const event of events) event.playerEconomyAfter = structuredClone(playerEconomy);
  evidence.observations.oreCycleEvents = events;
}

async function publicationFixture(t, { writeLedger = true } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'spaceface-pq048-publication-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const evidence = await canonicalPqRuntimeFixture();
  const runDir = path.join(root, ...RUN_RELATIVE.split('/'));
  const evidencePath = path.join(root, ...PQ_ROOT.split('/'), 'browser', 'evidence.json');
  const consumedPath = path.join(
    root,
    ...PQ_ROOT.split('/'),
    'broker-claims',
    '.consumed',
    `${evidence.authority.claimId}.json`,
  );
  await mkdir(runDir, { recursive: true });
  await mkdir(path.dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, jsonBytes(evidence));
  if (writeLedger) {
    await mkdir(path.dirname(consumedPath), { recursive: true });
    await writeFile(consumedPath, jsonBytes(consumedLedgerFor(evidence)));
  }
  return {
    root,
    evidence,
    consumedPath,
    publishArgs: {
      root,
      sharedResult: {
        pass: true,
        primaryAcceptance: true,
        runtimeKind: 'browser',
        candidateDigest: evidence.authority.candidateDigest,
        sourceCandidateDigest: evidence.authority.sourceCandidateDigest,
        evidencePath,
        runDir,
      },
    },
  };
}

function consumedLedgerFor(evidence) {
  return {
    schema: 'spaceface.validation-broker-claim-consumed.v1',
    claimId: evidence.authority.claimId,
    claimPath: `${PQ_ROOT}/broker-claims/${evidence.authority.claimId}.json`,
    consumedAt: '2026-08-11T12:00:00.000Z',
    pid: 42,
    candidateDigest: evidence.authority.candidateDigest,
    runtimeKind: 'browser',
    digests: {
      candidateDigest: evidence.authority.candidateDigest,
      sourceCandidateDigest: evidence.authority.sourceCandidateDigest,
      worktreeDigest: evidence.authority.worktree.digest,
      manifestDigest: evidence.authority.digests.runtimeManifestDigest,
    },
    mode: 'acceptance',
  };
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function appendByte(bytes) {
  return Buffer.concat([Buffer.from(bytes), Buffer.from(' ')]);
}
