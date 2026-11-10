// E6 measurement layer: the probe gate must name every failing clause, the 250 ms lane
// sampler must keep mid-route residency backlog/fail-open visible, and the sampler must never
// report a per-frame refusal count as the blink verdict.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { summarizeFrameSolid } from '../scripts/lib/frameSolidSampler.mjs';

const read = (relative) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

test('the 250 ms lane summary carries residency backlog and fail-open depth', () => {
  const rec = {
    frames: 10,
    lanes: [
      { t: 0, residencyQueuePending: 0, residencyRefusedDraws: 0, residencyAdmittedFailOpen: 0,
        residencyFailOpen: 0, residencyPresentedRefusedEntities: 0 },
      { t: 250, residencyQueuePending: 12, residencyRefusedDraws: 40, residencyAdmittedFailOpen: 2,
        residencyFailOpen: 3, residencyPresentedRefusedEntities: 1 },
      { t: 500, residencyQueuePending: 0, residencyRefusedDraws: 41, residencyAdmittedFailOpen: 2,
        residencyFailOpen: 3, residencyPresentedRefusedEntities: 1 },
    ],
  };
  const summary = summarizeFrameSolid(rec);
  const lanes = summary.lanes;
  assert.equal(lanes.samples, 3);
  assert.equal(lanes.residencyQueuePending.max, 12, 'a mid-route backlog is retained');
  assert.equal(lanes.residencyQueuePending.busyShare, 0.33);
  assert.equal(lanes.residencyAdmittedFailOpen.max, 2);
  assert.equal(lanes.residencyRefusedDraws.max, 41);
  assert.equal(lanes.residencyPresentedRefusedEntities.max, 1);
});

test('the frame-solid gate keeps visibleUnreadyDraws and gates fail-open draw admission', () => {
  const probe = read('../scripts/probe-frame-solid.mjs');
  for (const clause of [
    'visibleUnready:',
    'visibleUnreadyDraws:',
    'presentedRefusedEntities:',
    'admittedFailOpen:',
    'residencyFailOpen:',
    'inFlight:',
    'ghostedInFlight:',
    'pending:',
  ]) {
    assert.ok(probe.includes(clause), `the E6 gate must include ${clause}`);
  }
  assert.match(probe, /E6 failing clauses/,
    'the probe names every failing clause instead of one aggregate FAIL');
  assert.match(probe, /residencyManager\.admittedFailOpen === 0/,
    'admitted fail-open draws are a pass clause, not a diagnostic');
  assert.match(probe, /residencyManager\.residencyFailOpen === 0/,
    'released holds are a pass clause, not a diagnostic');
});

test('the lane sampler records the manager queue and fail-open counters', () => {
  const sampler = read('../scripts/lib/frameSolidSampler.mjs');
  for (const field of [
    'residencyQueuePending',
    'residencyRefusedDraws',
    'residencyAdmittedFailOpen',
    'residencyFailOpen',
    'residencyPresentedRefusedEntities',
  ]) {
    assert.ok(sampler.includes(field), `the 250 ms lane sampler should record ${field}`);
  }
  assert.match(sampler, /__sfResidencyManager/,
    'the lane sampler reads the live manager, not a stale published snapshot');
});

test('the residency manager exposes the honest counter names the gate reads', () => {
  const source = read('../src/render/residencyManager.js');
  assert.match(source, /presentedRefusedEntities: counters\.visibleUnreadyDraws/,
    'the deduped entity count is published under its explicit name');
  assert.match(source, /refusedByReason:/, 'refusals are broken down by actual path');
  assert.match(source, /ghostedInFlight:/, 'ghosted in-flight uploads are surfaced');
});
