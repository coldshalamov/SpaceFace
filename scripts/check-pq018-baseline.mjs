#!/usr/bin/env node
// Pure, seconds-scale validation for the exact-base PQ-018 matched-performance baseline.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PQ018_ROUTE_SCHEMA } from './lib/pq018WreckCathedralPublicRoute.mjs';
import {
  PQ018_AUTHORIZED_BASE_SHA,
  PQ018_FIXED_SEED,
} from './validation-manifests/pq018-wreck-cathedral.mjs';

export const PQ018_CAMPAIGN_SCHEMA = 'spaceface.pq018WreckCathedralCampaign.v1';
export const PQ018_RUNTIME_KINDS = Object.freeze(['browser', 'electron']);
export const PQ018_RUNTIME_PROFILE = '1440x900-dark-reduced-motion-reduced-flash';
export const PQ018_VIEWPORT = Object.freeze({ width: 1440, height: 900 });

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DEFAULT_OUTPUT_ROOT = path.join(ROOT, '.devshots', 'pq018-wreck-cathedral');

export async function loadValidatedPq018Baseline({
  outputRoot = DEFAULT_OUTPUT_ROOT,
  expectedCommit = PQ018_AUTHORIZED_BASE_SHA,
} = {}) {
  const baselineRoot = path.join(outputRoot, 'baseline');
  const aggregatePath = path.join(baselineRoot, 'aggregate.json');
  const aggregateText = await readFile(aggregatePath, 'utf8');
  const aggregate = JSON.parse(aggregateText);
  assert.equal(aggregate.schema, PQ018_CAMPAIGN_SCHEMA);
  assert.equal(aggregate.pass, true);
  assert.equal(aggregate.primaryAcceptance, false);
  assert.equal(aggregate.baselineOnly, true);
  assert.equal(aggregate.targetCommit, expectedCommit);
  assert.equal(aggregate.candidateDigest, null);
  assert.equal(aggregate.seed, PQ018_FIXED_SEED);
  assert.deepEqual(aggregate.viewport, PQ018_VIEWPORT);
  assert.equal(aggregate.runtimeProfile, PQ018_RUNTIME_PROFILE);
  assert.deepEqual(aggregate.runtimeKinds, PQ018_RUNTIME_KINDS);
  assert.equal(aggregate.cells?.length, PQ018_RUNTIME_KINDS.length);

  const cells = new Map();
  const hashes = {
    aggregate: sha256(aggregateText),
    cells: {},
  };
  for (const runtimeKind of PQ018_RUNTIME_KINDS) {
    const evidencePath = path.join(baselineRoot, runtimeKind, 'evidence.json');
    const evidenceText = await readFile(evidencePath, 'utf8');
    const evidence = JSON.parse(evidenceText);
    const aggregateCell = aggregate.cells.find((cell) => cell.runtimeKind === runtimeKind);
    assert(aggregateCell, `baseline aggregate is missing ${runtimeKind}`);
    assert.equal(
      aggregateCell.evidence.replaceAll('\\', '/'),
      `.devshots/pq018-wreck-cathedral/baseline/${runtimeKind}/evidence.json`,
    );
    assert.equal(aggregateCell.matchedPerformance, null);
    assert.equal(evidence.schema, PQ018_ROUTE_SCHEMA);
    assert.equal(evidence.pass, true);
    assert.equal(evidence.primaryAcceptance, false);
    assert.equal(evidence.baselineOnly, true);
    assert.equal(evidence.runtimeKind, runtimeKind);
    assert.equal(evidence.targetCommit, expectedCommit);
    assert.equal(evidence.candidateDigest, null);
    assert.equal(evidence.seed, PQ018_FIXED_SEED);
    assert.deepEqual(evidence.viewport, PQ018_VIEWPORT);
    assert.equal(evidence.runtimeProfile, PQ018_RUNTIME_PROFILE);
    assert.equal(evidence.route?.schema, PQ018_ROUTE_SCHEMA);
    assert.equal(evidence.route?.pass, true);
    assert.equal(evidence.route?.baselineOnly, true);
    assert.equal(evidence.route?.runtimeKind, runtimeKind);
    assert.equal(evidence.route?.seed, PQ018_FIXED_SEED);
    assert.equal(evidence.route?.finalSnapshot?.site, null);
    assert.equal(evidence.route?.accessibility?.reducedMotionMedia, true);
    assert.equal(evidence.route?.accessibility?.reducedFlashSetting, true);
    assert.equal(evidence.route?.accessibility?.reducedFlashClass, true);
    assert.equal(evidence.cleanup?.pass, true);
    assert.deepEqual(evidence.cleanup?.failures, []);
    if (runtimeKind === 'electron') {
      assert.equal(evidence.processHealth?.pass, true);
      assert.deepEqual(evidence.processHealth?.failures, []);
    }
    assertFrameEvidence(evidence.route?.performance?.ceresApproach, runtimeKind);
    cells.set(runtimeKind, evidence);
    hashes.cells[runtimeKind] = sha256(evidenceText);
  }
  return { aggregate, cells, hashes };
}

function assertFrameEvidence(window, runtimeKind) {
  const frames = window?.frameTimes;
  assert(frames?.samples >= 30, `${runtimeKind} baseline needs at least 30 frame samples`);
  assert(Number.isFinite(frames?.distributionMs?.p95), `${runtimeKind} baseline needs a finite p95`);
  assert.equal(frames.floorP95BudgetMs, 34);
  assert(Number.isFinite(frames.hitchesOverThreshold));
  assert.equal(window?.threeWebgl?.status, 'supported');
  for (const key of ['geometries', 'textures', 'programs']) {
    assert(Number.isFinite(window.threeWebgl.memory?.[key]), `${runtimeKind} missing ${key}`);
  }
  for (const key of ['calls', 'triangles']) {
    assert(Number.isFinite(window.threeWebgl.render?.[key]), `${runtimeKind} missing ${key}`);
  }
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await loadValidatedPq018Baseline();
    console.log(`[pq018-baseline] PASS ${result.aggregate.targetCommit}`);
    for (const runtimeKind of PQ018_RUNTIME_KINDS) {
      const frames = result.cells.get(runtimeKind).route.performance.ceresApproach.frameTimes;
      console.log(
        `[pq018-baseline] ${runtimeKind}: p95=${frames.distributionMs.p95}ms `
        + `hitches=${frames.hitchesOverThreshold} sha256=${result.hashes.cells[runtimeKind]}`,
      );
    }
  } catch (error) {
    console.error(`[pq018-baseline] FAIL: ${error.message || error}`);
    process.exitCode = 1;
  }
}
