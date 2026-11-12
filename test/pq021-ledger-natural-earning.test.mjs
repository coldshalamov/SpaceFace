// PQ-021 Phase 4 — natural earning, fail-closed fabrication, and cold Continue.
//
// Claim 1: the five Cathedral evidence pages reach the Ledger only by being EARNED through the
//          ordinary World Site operation path, never by writing a receipt.
// Claim 2: a fabricated save cannot mint a page — neither a forged receipt map nor a forged
//          operation completion whose dependencies were never satisfied.
// Claim 3: a cold reload through the ordinary sites serializer preserves all five rows with
//          identical identity, revision, copy, provenance, map refs, and asset ids.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { asteroidSites } from '../src/systems/asteroidSites.js';
import { buildShipLedger } from '../src/systems/shipLedger.js';
import { normalizeWorldSiteRecord } from '../src/systems/worldSiteKernel.js';
import { worldSiteManifestById } from '../src/data/worldSiteManifests.js';
import {
  WRECK_CATHEDRAL_EVIDENCE_CATALOG,
  WRECK_CATHEDRAL_EVIDENCE_CATALOG_REVISION,
  WRECK_CATHEDRAL_EVIDENCE_PAGE_IDS,
} from '../src/data/wreckCathedralEvidenceCatalog.js';
import {
  CATHEDRAL_ROUTE,
  EVIDENCE_PAGE_IDS_IN_EARN_ORDER,
  byWorldRecord,
  earnCathedralEvidence,
  makeCathedralHarness,
  rawBeamPass,
  SECTOR_ID,
  SITE_ID,
  siteRecord,
} from './pq021-cathedral-route-harness.mjs';

function evidenceRows(state) {
  return buildShipLedger(state).entries.filter((entry) => entry.evidencePage);
}

// ---------------------------------------------------------------------------
// Claim 1 — natural earning
// ---------------------------------------------------------------------------

test('all five evidence pages are EARNED through the ordinary beam operation path', () => {
  const h = makeCathedralHarness();
  const before = evidenceRows(h.state);
  assert.equal(before.length, 0, 'a fresh run shows no evidence in the Ledger');

  const run = earnCathedralEvidence(h);

  // Seven operations completed, five of which minted a page.
  assert.equal(run.log.length, 7, 'the authored route is seven operations, not six');
  const record = siteRecord(h.state);
  for (const step of CATHEDRAL_ROUTE) {
    assert.ok(record.completedOperations[step.operationId], `${step.operationId} completed durably`);
  }
  assert.deepEqual(
    Object.keys(record.evidenceReceiptsByPageId).sort(),
    [...WRECK_CATHEDRAL_EVIDENCE_PAGE_IDS].sort(),
    'exactly the five authored pages were minted by the site owner',
  );
  assert.equal(record.evidenceRevision, 5);
  assert.equal(record.stageId, 'archived', 'the site reached its terminal authored stage');

  // The partial-drive step really accumulated and then collapsed its progress bucket.
  const partialStep = run.log.find((entry) => entry.operationId === 'repair_emergency_relay_clock');
  assert.equal(partialStep.passes.length, 3, 'the relay clock was driven in three partial passes');
  assert.deepEqual(
    partialStep.passes.map((pass) => pass.complete),
    [false, false, true],
    'only the final partial pass completes the operation',
  );
  assert.equal(
    record.components.emergency_relay_clock.progress.repair_emergency_relay_clock,
    undefined,
    'a completed operation leaves no partial-progress residue',
  );

  // The Ledger now projects five rows, and it never wrote to the owner to get them.
  const snapshot = JSON.stringify(h.state.sites.worldById[SITE_ID]);
  const rows = evidenceRows(h.state);
  assert.equal(
    JSON.stringify(h.state.sites.worldById[SITE_ID]),
    snapshot,
    'projecting the Ledger must not mutate the World Site owner',
  );
  assert.equal(rows.length, 5, 'all five earned pages appear in the Ledger projection');
  assert.deepEqual(
    rows.map((row) => row.evidencePage.pageId).sort(),
    [...WRECK_CATHEDRAL_EVIDENCE_PAGE_IDS].sort(),
  );

  // Newest-first: the projection order is the reverse of the earn order, driven by earnedAtS.
  assert.deepEqual(
    rows.map((row) => row.evidencePage.pageId),
    [...EVIDENCE_PAGE_IDS_IN_EARN_ORDER].reverse(),
    'rows order by when they were earned, not by catalog or arrival order',
  );
});

test('each earned row carries stable identity, catalog copy, provenance, map ref, and asset id', () => {
  const h = makeCathedralHarness();
  earnCathedralEvidence(h);
  const rows = evidenceRows(h.state);

  for (const row of rows) {
    const pageId = row.evidencePage.pageId;
    const catalog = WRECK_CATHEDRAL_EVIDENCE_CATALOG[pageId];
    assert.equal(row.id, `ledger_evidence_${pageId}`, 'row identity depends only on pageId');
    assert.equal(row.type, 'witness', 'evidence reuses the existing taxonomy');
    assert.equal(row.sourceKind, 'worldSite.evidence');
    assert.equal(row.evidencePage.revision, WRECK_CATHEDRAL_EVIDENCE_CATALOG_REVISION);
    assert.equal(row.evidencePage.title, catalog.title);
    assert.equal(row.evidencePage.fragment, catalog.fragment);
    assert.equal(row.evidencePage.body, catalog.body);
    assert.equal(row.evidencePage.provenanceRef, catalog.provenanceRef);
    assert.deepEqual(row.evidencePage.mapRef, catalog.mapRef);
    assert.equal(row.evidencePage.media.assetId, `evidence.${pageId}`);
    assert.equal(row.evidencePage.media.path, catalog.media.path);
    assert.ok(row.evidencePage.media.alt, 'every page ships alt text');
    assert.equal(Object.isFrozen(row.evidencePage), true);

    // The receipt the owner minted must agree with the operation that earned it.
    const receipt = siteRecord(h.state).evidenceReceiptsByPageId[pageId];
    const step = CATHEDRAL_ROUTE.find((candidate) => candidate.pageId === pageId);
    assert.equal(receipt.operationId, step.operationId);
    assert.equal(receipt.componentId, step.componentId);
    assert.equal(receipt.provenanceRef, catalog.provenanceRef,
      'the earned receipt and the immutable catalog agree on provenance');
    assert.equal(row.evidencePage.earnedTick, receipt.earnedTick);
  }

  // Five distinct earn times, so no two rows are order-ambiguous.
  const times = rows.map((row) => row.evidencePage.earnedAtS);
  assert.equal(new Set(times).size, 5, 'each page records a distinct earn time');
});

test('an unearned run and a partially earned run show exactly what was earned', () => {
  const h = makeCathedralHarness();
  h.bus.emit('sector:enter', { sectorId: SECTOR_ID });
  assert.equal(evidenceRows(h.state).length, 0, 'arriving at the site earns nothing');

  // Drive only the hull stabilization + one extraction: exactly one page may appear.
  const record = siteRecord(h.state);
  h.state.tick = 60;
  h.state.simTime = 1;
  h.system.applyWorldSiteBeamOperation({
    siteId: SITE_ID, componentId: 'cathedral_hull', verb: 'repair', amount: 48,
    requestStreamId: 'player-industrial-beam', requestSequence: 60, tick: 60,
  });
  assert.equal(evidenceRows(h.state).length, 0, 'a page-less operation mints nothing');
  h.state.tick = 120;
  h.state.simTime = 2;
  h.system.applyWorldSiteBeamOperation({
    siteId: SITE_ID, componentId: 'bridge_navigation_record', verb: 'extract', amount: 24,
    requestStreamId: 'player-industrial-beam', requestSequence: 120, tick: 120,
  });
  const rows = evidenceRows(h.state);
  assert.equal(rows.length, 1, 'exactly the earned page appears');
  assert.equal(rows[0].evidencePage.pageId, 'wreck_cathedral.missing_convoy');
  assert.ok(record !== siteRecord(h.state), 'the owner replaced the record rather than mutating it');
});

test('the terminal page cannot be earned without the spine repair or without physical delivery', () => {
  // NON-VACUITY GUARD. The route above passes on its first run; this proves each of its two
  // easiest-to-omit requirements is genuinely load-bearing rather than incidentally satisfied.
  const h = makeCathedralHarness();
  h.bus.emit('sector:enter', { sectorId: SECTOR_ID });

  let tick = 120;
  for (const step of CATHEDRAL_ROUTE) {
    if (step.operationId === 'repair_marker_service_spine') break;
    for (const amount of step.partials || [step.threshold]) {
      rawBeamPass(h, { componentId: step.componentId, verb: step.verb, amount, tick });
      tick += 120;
    }
  }
  assert.equal(evidenceRows(h.state).length, 4, 'four pages are earned by the clamp cut');

  // (a) No spine repair: the settlement's `from: ['ready']` can never match an offline spine.
  const noSpine = rawBeamPass(h, { componentId: 'marker_service_spine', verb: 'transfer', amount: 1, tick });
  tick += 120;
  assert.equal(noSpine.ok, false, 'the settlement is refused while the spine is offline');
  assert.equal(noSpine.reason, 'operation-unavailable');
  assert.equal(evidenceRows(h.state).length, 4, 'a refused settlement mints nothing');

  rawBeamPass(h, { componentId: 'marker_service_spine', verb: 'repair', amount: 30, tick });
  tick += 120;
  assert.equal(siteRecord(h.state).components.marker_service_spine.status, 'ready');

  // (b) Spine ready, but the payload was never towed: delivery is re-derived from live positions.
  const payload = byWorldRecord(h.state, `${SITE_ID}/payload/cathedral_black_box`)[0];
  const receiver = byWorldRecord(h.state, `${SITE_ID}/component/marker_service_spine`)[0];
  assert.ok(payload && receiver, 'the released payload and the receiver both exist physically');
  payload.pos = { x: receiver.pos.x + 1000, z: receiver.pos.z + 1000 };
  const notDelivered = rawBeamPass(h, { componentId: 'marker_service_spine', verb: 'transfer', amount: 1, tick });
  tick += 120;
  assert.equal(notDelivered.ok, false, 'an undelivered payload cannot settle');
  assert.equal(notDelivered.reason, 'payload-not-delivered');
  assert.equal(evidenceRows(h.state).length, 4, 'the fifth page is still unearned');

  // (c) Tow it in, and only then does the fifth page exist.
  payload.pos = { ...receiver.pos };
  payload.vel = { x: 0, z: 0 };
  const settled = rawBeamPass(h, { componentId: 'marker_service_spine', verb: 'transfer', amount: 1, tick });
  assert.equal(settled.ok, true);
  assert.equal(settled.duplicate, false);
  const rows = evidenceRows(h.state);
  assert.equal(rows.length, 5, 'physical delivery is what earns the terminal page');
  assert.ok(rows.some((row) => row.evidencePage.pageId === 'wreck_cathedral.what_was_carried'));
});

// ---------------------------------------------------------------------------
// Claim 2 — fabrication fails closed at the Ledger, not just at the kernel
// ---------------------------------------------------------------------------

test('a forged receipt map in a save cannot mint a Ledger page', () => {
  const manifest = worldSiteManifestById(SITE_ID);
  const h = makeCathedralHarness();
  h.bus.emit('sector:enter', { sectorId: SECTOR_ID });

  const forged = structuredClone(siteRecord(h.state));
  forged.evidenceRevision = 99;
  for (const pageId of WRECK_CATHEDRAL_EVIDENCE_PAGE_IDS) {
    forged.evidenceReceiptsByPageId[pageId] = {
      receiptId: pageId,
      pageId,
      revision: 1,
      earnedTick: 10,
      earnedAtS: 1,
      siteRecordId: SITE_ID,
      componentId: 'bridge_navigation_record',
      operationId: 'extract_bridge_navigation_record',
      operationReceiptId: 'forged',
      stateFrom: 'sealed',
      stateTo: 'recovered',
      provenanceRef: 'wreck_cathedral/c1_01',
      catalogRevision: WRECK_CATHEDRAL_EVIDENCE_CATALOG_REVISION,
    };
  }
  // The forged rows are individually well-formed: they pass the projector's own validator, so the
  // fail-closed behaviour has to come from the owner's normalize, not from the Ledger's filtering.
  h.state.sites.worldById[SITE_ID] = forged;
  assert.equal(evidenceRows(h.state).length, 5,
    'the forged rows are well-formed enough to project — the guard cannot be the projector alone');

  h.state.sites.worldById[SITE_ID] = normalizeWorldSiteRecord(manifest, forged);
  assert.deepEqual(siteRecord(h.state).evidenceReceiptsByPageId, {});
  assert.equal(siteRecord(h.state).evidenceRevision, 0);
  assert.equal(evidenceRows(h.state).length, 0,
    'a save carrying forged receipts yields zero Ledger pages after load');
});

test('a forged operation completion with unmet dependencies cannot mint a Ledger page', () => {
  const manifest = worldSiteManifestById(SITE_ID);
  const h = makeCathedralHarness();
  h.bus.emit('sector:enter', { sectorId: SECTOR_ID });

  // The stronger forgery: claim the terminal settlement completed without ever stabilizing the
  // hull, cutting the clamp, or repairing the spine. normalize rebuilds the evidence map from
  // completedOperations, so this is the input that would mint a page if dependency order were
  // trusted rather than re-derived.
  const forged = structuredClone(siteRecord(h.state));
  forged.completedOperations.settle_cathedral_black_box = {
    receiptId: 'forged/settle', tick: 10, cycle: 0,
    requestStreamId: 'player-industrial-beam', requestSequence: 10,
    earnedAtS: 1, stateFrom: 'ready', stateTo: 'settled',
  };
  const sanitized = normalizeWorldSiteRecord(manifest, forged);
  assert.equal(sanitized.completedOperations.settle_cathedral_black_box, undefined,
    'a completion whose dependencies were never satisfied is dropped');
  assert.deepEqual(sanitized.evidenceReceiptsByPageId, {});
  h.state.sites.worldById[SITE_ID] = sanitized;
  assert.equal(evidenceRows(h.state).length, 0,
    'no Ledger page can be minted from a dependency-violating completion');
});

// ---------------------------------------------------------------------------
// Claim 3 — cold Continue
// ---------------------------------------------------------------------------

test('the save system routes the sites slice through the asteroidSites serializer', () => {
  // Proves the cold-reload test below drives the real save path rather than a lookalike.
  // Substring matches only: a CRLF worktree makes any `\n`-anchored pattern lie.
  const source = readFileSync(new URL('../src/save/saveSystem.js', import.meta.url), 'utf8');
  assert.ok(source.includes("data.sites = this._callSerialize('asteroidSites')"),
    'save writes the sites slice via asteroidSites.serialize()');
  assert.ok(source.includes("this._callDeserialize('asteroidSites', data.sites)"),
    'load restores the sites slice via asteroidSites.deserialize()');
  assert.equal(typeof asteroidSites.serialize, 'function');
  assert.equal(typeof asteroidSites.deserialize, 'function');
});

test('cold Continue preserves all five pages with identical identity, copy, and provenance', () => {
  const earned = makeCathedralHarness();
  earnCathedralEvidence(earned);
  const beforeRows = evidenceRows(earned.state);
  assert.equal(beforeRows.length, 5);

  // Ordinary save: the same serializer saveSystem.js:225 invokes, through a real JSON envelope.
  const blob = JSON.parse(JSON.stringify(earned.system.serialize()));

  // Cold reload: a brand-new system over brand-new state — nothing survives except the blob.
  const cold = makeCathedralHarness();
  assert.equal(evidenceRows(cold.state).length, 0, 'the cold run starts with no evidence');
  cold.system.deserialize(blob);

  const afterRows = evidenceRows(cold.state);
  assert.equal(afterRows.length, 5, 'all five pages survive a cold reload');

  // Row identity, revision, copy, provenance, map refs, asset ids, and derived time labels must be
  // byte-identical. `at`/`cycle`/`cycleLabel` derive from earnedAtS inside completedOperations, so
  // any drift here is a real persistence finding rather than a cosmetic difference.
  const project = (rows) => rows.map((row) => ({
    id: row.id,
    type: row.type,
    sourceId: row.sourceId,
    sourceKind: row.sourceKind,
    at: row.at,
    cycle: row.cycle,
    cycleLabel: row.cycleLabel,
    templateId: row.templateId,
    text: row.text,
    evidencePage: JSON.parse(JSON.stringify(row.evidencePage)),
  }));
  assert.deepEqual(project(afterRows), project(beforeRows),
    'cold Continue reproduces every projected row exactly');

  // And the mechanism, stated as an assertion: receipts are rebuilt from completedOperations.
  const coldRecord = siteRecord(cold.state);
  for (const step of CATHEDRAL_ROUTE) {
    assert.ok(coldRecord.completedOperations[step.operationId],
      `${step.operationId} survives as the durable source of its receipt`);
  }
  assert.equal(coldRecord.evidenceRevision, 5);
  assert.equal(coldRecord.stageId, 'archived');

  // A second save/load cycle is a fixed point — no accumulation, no drift.
  const twice = makeCathedralHarness();
  twice.system.deserialize(JSON.parse(JSON.stringify(cold.system.serialize())));
  assert.deepEqual(project(evidenceRows(twice.state)), project(beforeRows),
    'a second Continue is a fixed point');
});
