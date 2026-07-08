#!/usr/bin/env node
import assert from 'node:assert/strict';

import { makeEvidenceSpindleSpec } from '../src/data/scenarios/47aLiveScene.js';
import {
  actorById,
  assertBeatEntered,
  assertIncludesAll,
  beatById,
  entityByActorId,
  physicsBodyByEntityId,
  proofMetricById,
  readScenarioContract,
  runInspect,
} from './lib/check-47a-common.mjs';

const contract = readScenarioContract();
const actor = actorById(contract, 'evidence_spindle_47a');
assert.equal(actor.role, 'tether_payload', 'evidence spindle actor should be the tether payload');
assertIncludesAll(actor.capabilities, ['body.false_mass', 'massline.attachment_target', 'world_fact.evidence_status'],
  'evidence spindle capabilities');

const beat = beatById(contract, 'stabilize_spindle');
assertIncludesAll(beat.requiredActors, ['player_kestrel', 'evidence_spindle_47a'], 'stabilize_spindle actors');
assertIncludesAll(beat.requiredMechanics, ['massline.attach', 'massline.reel', 'tension.telemetry'],
  'stabilize_spindle mechanics');
assertIncludesAll(beat.proofMetricIds, ['first_tether_attach'], 'stabilize_spindle proof metrics');
assert.equal(proofMetricById(contract, 'first_tether_attach').target, '<= 60s',
  'first tether attach proof should retain the <=60s target');

const spec = makeEvidenceSpindleSpec();
assert.equal(spec.mass, 960, 'spindle physical mass should be authored at 960');
assert.equal(spec.data.falseMassKg, 960, 'spindle false mass should match physical mass');
assert.equal(spec.data.manifestMassKg, 480, 'spindle manifest mass should preserve the discrepancy');
assert(spec.data.falseMassKg > spec.data.manifestMassKg, 'spindle should read heavier than the manifest');
assert.equal(spec.physicsBody.dynamic, true, 'spindle should use a dynamic physics body');
assert.equal(spec.physicsBody.ccd, true, 'spindle should enable CCD for Massline towing');
assert.equal(spec.physicsBody.attachmentPoints.massline.x, 0, 'spindle should expose a Massline attachment point');

const result = runInspect({ tick: 5200 });
assertBeatEntered(result, 'stabilize_spindle');
assert(result.scenarioContract.enteredBeatIds.indexOf('stabilize_spindle') >
  result.scenarioContract.enteredBeatIds.indexOf('drop_wreck_field'),
'stabilize_spindle should follow the drop beat');
assert.equal(result.metrics.tetherAttached, 1, 'runtime should create exactly one Massline attachment');
assert(result.metrics.firstTetherAttachTick != null && result.metrics.firstTetherAttachTick <= 60 * 60,
  'runtime should attach the Massline within the authored 60s target');

const spindle = entityByActorId(result, 'evidence_spindle_47a');
assert.equal(spindle.type, 'payload', 'spindle runtime entity should be a payload');
assert.equal(spindle.data.tetherPayload, true, 'spindle runtime entity should be tetherable payload');
assert.equal(spindle.data.falseMassKg, 960, 'runtime spindle false mass should persist');
assert.equal(spindle.data.manifestMassKg, 480, 'runtime spindle manifest mass should persist');
assert(Math.hypot(spindle.pos.x - 92, spindle.pos.z - 0) > 50,
  'runtime spindle should physically move from its spawn point by tick 5200');
const body = physicsBodyByEntityId(result, spindle.id);
assert(Math.hypot(body.x - spindle.pos.x, body.z - spindle.pos.z) < 0.1,
  'physics body and snapshot position should agree');

console.log(`47-A spindle check OK (attach tick ${result.metrics.firstTetherAttachTick}, spindle moved to ${spindle.pos.x.toFixed(1)},${spindle.pos.z.toFixed(1)})`);
