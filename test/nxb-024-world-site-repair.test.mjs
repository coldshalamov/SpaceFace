import test from 'node:test';
import assert from 'node:assert/strict';

import { worldSiteManifestById } from '../src/data/worldSiteManifests.js';
import {
  createWorldSiteRecord, normalizeWorldSiteRecord, applyWorldSiteOperation,
  applyWorldSiteFailure, projectWorldSite,
} from '../src/systems/worldSiteKernel.js';
import { worldSiteHistoryPresentation } from '../src/ui/worldSiteMapLayer.js';
import { listComponents } from '../src/systems/interactionDescriptors.js';

const SITE_ID = 'world_site_helios_relay';
const manifest = () => worldSiteManifestById(SITE_ID);

function apply(record, operationId, amount, sequence) {
  const result = applyWorldSiteOperation(manifest(), record, {
    operationId,
    amount,
    requestStreamId: 'player-industrial-beam',
    requestSequence: sequence,
    tick: sequence,
  });
  assert.equal(result.ok, true, `${operationId} seq ${sequence} must apply: ${result.reason}`);
  return result;
}

test('a partial repair receipt names the retained total and the authored threshold', () => {
  const record = createWorldSiteRecord(manifest(), { tick: 1 });
  const { receipt } = apply(record, 'repair_relay_core', 12, 5);
  assert.equal(receipt.complete, false);
  assert.equal(receipt.amountApplied, 12);
  assert.equal(receipt.appliedTotal, 12);
  assert.equal(receipt.workThreshold, 40);
});

test('a replayed request is an exact no-op — accepted work is consumed once', () => {
  let record = createWorldSiteRecord(manifest(), { tick: 1 });
  record = apply(record, 'repair_relay_core', 12, 5).record;
  const replay = applyWorldSiteOperation(manifest(), record, {
    operationId: 'repair_relay_core',
    amount: 12,
    requestStreamId: 'player-industrial-beam',
    requestSequence: 5,
    tick: 5,
  });
  assert.equal(replay.duplicate, true);
  assert.equal(replay.reason, 'request-replayed');
  assert.equal(replay.record.components.relay_core.progress.repair_relay_core, 12);
});

test('interrupted work persists through save/load and names what is still missing', () => {
  let record = createWorldSiteRecord(manifest(), { tick: 1 });
  record = apply(record, 'repair_relay_core', 12, 5).record;
  record = apply(record, 'repair_relay_core', 8, 6).record;

  // Leaving the sector and returning is a normalization round-trip of the durable record.
  const restored = normalizeWorldSiteRecord(manifest(), structuredClone(record));
  assert.equal(restored.components.relay_core.progress.repair_relay_core, 20);

  const projection = projectWorldSite(manifest(), restored);
  const pending = projection.pendingWork.find((work) => work.operationId === 'repair_relay_core');
  assert.deepEqual(pending, {
    componentId: 'relay_core',
    operationId: 'repair_relay_core',
    applied: 20,
    threshold: 40,
    remaining: 20,
  });

  const history = worldSiteHistoryPresentation(projection);
  const retained = history.workRemaining.find((row) => row.operationId === 'repair_relay_core');
  assert.equal(retained.label, 'Repair Relay Core');
  assert.equal(retained.detail, '20 of 40 — 20 to go');
  const progressRow = history.rows.filter((row) => row.label === 'Progress — Repair Relay Core').at(-1);
  assert.equal(progressRow.detail, '8 work applied — 20 of 40');
});

test('the beam descriptor carries live applied and remaining work for the offered operation', () => {
  let record = createWorldSiteRecord(manifest(), { tick: 1 });
  record = apply(record, 'repair_relay_core', 15, 5).record;
  const state = {
    sites: { worldOrder: [SITE_ID], worldById: { [SITE_ID]: record } },
    entities: { get: () => null },
  };
  const entity = {
    id: 200, type: 'wreck', alive: true, pos: { x: 0, z: 0 }, radius: 10,
    data: { worldSiteId: SITE_ID, worldSiteComponentId: 'relay_core' },
  };
  const [component] = listComponents(state, entity);
  assert.equal(component.operationId, 'repair_relay_core');
  assert.equal(component.workApplied, 15);
  assert.equal(component.workThreshold, 40);
  assert.equal(component.workRemaining, 25);
});

test('a component failure releases only its own progress — other retained work survives', () => {
  let record = createWorldSiteRecord(manifest(), { tick: 1 });
  record = apply(record, 'repair_relay_core', 12, 5).record;
  record = apply(record, 'recover_safety_coupler', 9, 6).record;

  const failed = applyWorldSiteFailure(manifest(), record, {
    componentId: 'safety_coupler',
    tick: 7,
  });
  assert.equal(failed.ok, true);
  const next = failed.record;
  // The coupler's own partial work is cleared by its failure; the untouched relay keeps its
  // retained progress and its request cursor (resume stays honest).
  assert.equal(next.components.safety_coupler.progress.repair_safety_coupler, undefined);
  assert.equal(next.components.relay_core.progress.repair_relay_core, 12);
  assert.equal(next.operationCursors.repair_relay_core.throughSequence, 5);

  // And the relay's interrupted work still resumes where the record left it.
  const resumed = apply(next, 'repair_relay_core', 10, 8);
  assert.equal(resumed.record.components.relay_core.progress.repair_relay_core, 22);
});

test('completing an operation clears its pending work and its receipt names the full total', () => {
  let record = createWorldSiteRecord(manifest(), { tick: 1 });
  record = apply(record, 'repair_relay_core', 30, 5).record;
  const done = apply(record, 'repair_relay_core', 12, 6);
  assert.equal(done.receipt.complete, true);
  assert.equal(done.receipt.amountApplied, 10, 'bounded work applies only the missing remainder');
  assert.equal(done.receipt.appliedTotal, 40);
  const projection = projectWorldSite(manifest(), done.record);
  assert.equal(projection.pendingWork.length, 0);
});

test('a completed repair leaves a sibling component damage state and retained work untouched', () => {
  let record = createWorldSiteRecord(manifest(), { tick: 1 });
  record = apply(record, 'repair_relay_core', 30, 5).record;
  record = apply(record, 'recover_safety_coupler', 9, 6).record;
  const done = apply(record, 'repair_relay_core', 20, 7);
  const next = done.record;
  assert.equal(next.components.relay_core.status, 'operational');
  assert.equal(next.components.safety_coupler.status, 'failed', 'sibling damage state survives');
  assert.equal(next.components.safety_coupler.progress.recover_safety_coupler, 9,
    'sibling retained work survives');
});
