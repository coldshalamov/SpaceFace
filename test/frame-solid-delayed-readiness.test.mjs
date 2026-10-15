import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  DELAYED_READINESS_LIMITS,
  createDelayedReadinessReceipt,
  finalizeDelayedReadinessReceipt,
  recordDelayedReadinessSample,
  recordPipelineCalls,
} from '../scripts/lib/frameSolidDelayedReadiness.mjs';

test('delayed readiness receipt preserves causal cohort, queue, pipeline, and residency evidence', () => {
  const receipt = createDelayedReadinessReceipt(100);
  recordDelayedReadinessSample(receipt, {
    rows: [{
      rootKey: 'entity:late-drone',
      entityId: 'late-drone',
      type: 'drone',
      readable: true,
      firstPlayableFrameAt: 42,
      liveSectorGpuAdmission: true,
      openingCohort: { frozen: true, size: 3, identity: 'entity:late-drone', membership: 'member' },
      queue: { exists: true, inPending: true, hasAdmission: true, retries: 0, drainStage: 'urgent' },
      pipeline: { pending: true, debugBy: 'live-geometry-urgent', urgent: true, urgentSource: 'compileObjectPipelines' },
      residency: {
        fallbackPackageResidencyStamps: {
          package: { geometries: 2, resident: 0, unresident: 2, stamp: false },
          fallback: { geometries: 1, resident: 1, unresident: 0, stamp: true },
        },
      },
      longField: 'x'.repeat(DELAYED_READINESS_LIMITS.maxStringLength + 40),
    }],
    droppedRows: 2,
  }, 25);
  recordDelayedReadinessSample(receipt, {
    rows: [{ rootKey: 'entity:late-drone', entityId: 'late-drone', type: 'drone', pending: { geometry: true } }],
  }, 75);
  recordPipelineCalls(receipt, [{ entityId: 'late-drone', urgent: true, debugBy: 'live-geometry-urgent' }], 4, true);

  const report = finalizeDelayedReadinessReceipt(receipt);
  assert.equal(report.schema, 'spaceface.frameSolidDelayedReadiness.v1');
  assert.equal(report.polls, 2);
  assert.equal(report.delayedRowsSeen, 4);
  assert.equal(report.droppedRows, 2);
  assert.equal(report.rootsTracked, 1);
  assert.equal(report.roots[0].firstSeenMs, 25);
  assert.equal(report.roots[0].lastSeenMs, 75);
  assert.equal(report.roots[0].sampleCount, 2);
  assert.equal(report.roots[0].samples[0].firstPlayableFrameAt, 42);
  assert.equal(report.roots[0].samples[0].liveSectorGpuAdmission, true);
  assert.equal(report.roots[0].samples[0].openingCohort.membership, 'member');
  assert.equal(report.roots[0].samples[0].queue.drainStage, 'urgent');
  assert.equal(report.roots[0].samples[0].pipeline.urgent, true);
  assert.equal(report.roots[0].samples[0].residency.fallbackPackageResidencyStamps.package.unresident, 2);
  assert.ok(report.roots[0].samples[0].longField.length <= DELAYED_READINESS_LIMITS.maxStringLength + 1);
  assert.equal(report.observer.installed, true);
  assert.equal(report.observer.pipelineCalls.length, 1);
  assert.equal(report.observer.pipelineCallsDropped, 4);
});

test('delayed readiness receipt bounds roots, samples, calls, and nested payloads', () => {
  const receipt = createDelayedReadinessReceipt(0, {
    maxRoots: 2,
    maxSamples: 3,
    maxSamplesPerRoot: 2,
    maxPipelineCalls: 2,
  });
  for (let i = 0; i < 4; i++) {
    recordDelayedReadinessSample(receipt, {
      rows: [
        { rootKey: `entity:${i}`, nested: { text: 'y'.repeat(500) } },
        { rootKey: `entity:${i}` },
      ],
    }, i);
  }
  recordPipelineCalls(receipt, [{ n: 1 }, { n: 2 }, { n: 3 }], 0, true);
  const report = finalizeDelayedReadinessReceipt(receipt);
  assert.equal(report.rootsTracked, 2);
  assert.equal(report.samplesStored, 3);
  assert.ok(report.droppedRoots > 0);
  assert.ok(report.droppedSamples > 0);
  assert.equal(report.observer.pipelineCalls.length, 2);
  assert.equal(report.observer.pipelineCallsDropped, 1);
  assert.ok(report.roots.every((root) => root.samples.length <= 2));
  assert.ok(report.roots[0].samples[0].nested.text.length <= 161);
});

test('bounded receipt retains a late readable pending body over FIFO ambient rows', () => {
  const receipt = createDelayedReadinessReceipt(0, { maxRoots: 2, maxSamples: 8 });
  recordDelayedReadinessSample(receipt, {
    rows: [
      { rootKey: 'entity:ambient-a', type: 'wreck', readable: false, pending: { geometry: false } },
      { rootKey: 'entity:ambient-b', type: 'fx', readable: false, pending: { authored: false } },
    ],
  }, 1);
  recordDelayedReadinessSample(receipt, {
    rows: [{
      rootKey: 'entity:late-readable',
      type: 'drone',
      readable: true,
      rootHidden: true,
      pending: { geometry: true, pipelines: true, authored: true },
      pipeline: { urgent: true },
    }],
  }, 2);
  const report = finalizeDelayedReadinessReceipt(receipt);
  assert.ok(report.roots.some((root) => root.rootKey === 'entity:late-readable'));
  assert.equal(report.rootsTracked, 2);
  assert.ok(report.droppedRoots >= 1);
});

test('frame-solid probe wires the delayed readiness causal fields', () => {
  const probe = readFileSync(fileURLToPath(new URL('../scripts/probe-frame-solid.mjs', import.meta.url)), 'utf8');
  const collector = readFileSync(fileURLToPath(new URL('../scripts/lib/frameSolidDelayedReadiness.mjs', import.meta.url)), 'utf8');
  const source = `${probe}\n${collector}`;
  for (const field of [
    'firstPlayableFrameAt',
    'liveSectorGpuAdmission',
    'openingAdmissionCohort',
    'debugRoot',
    'pipelinesPendingBy',
    'urgent',
    'authoredReadableFallbackRetained',
    'packagedAuthoredBody',
    'fallbackPackageResidencyStamps',
  ]) {
    assert.ok(source.includes(field), `probe should retain ${field}`);
  }
});
