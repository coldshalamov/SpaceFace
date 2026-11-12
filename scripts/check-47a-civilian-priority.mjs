#!/usr/bin/env node
import assert from 'node:assert/strict';

import {
  actorById,
  assertBeatEntered,
  assertIncludesAll,
  beatById,
  entityByActorId,
  readScenarioContract,
  runInspect,
} from './lib/check-47a-common.mjs';

const contract = readScenarioContract();
const beat = beatById(contract, 'civilian_pod_choice');
assertIncludesAll(beat.requiredActors, ['player_kestrel', 'evidence_spindle_47a', 'civilian_pod', 'contact_kessler'],
  'civilian_pod_choice actors');
assertIncludesAll(beat.requiredMechanics, ['rescue.priority', 'massline.cut_or_reanchor', 'objective.priority_split'],
  'civilian_pod_choice mechanics');
assertIncludesAll(beat.presentationEventIds, ['scenario.objective.priority_split', 'scenario.comms.kessler'],
  'civilian_pod_choice presentation events');

const podActor = actorById(contract, 'civilian_pod');
assert.equal(podActor.role, 'narrative_priority_conflict', 'civilian pod should be the priority-conflict actor');
assertIncludesAll(podActor.capabilities, ['rescue.priority', 'massline.attachment_target', 'world_fact.civilian_status'],
  'civilian pod capabilities');
const line = (contract.dialogue || []).find((entry) => entry.beatId === 'civilian_pod_choice');
assert(line, 'civilian_pod_choice should have authored dialogue');
assert.equal(line.speakerActorId, 'civilian_pod', 'civilian line should be spoken by the pod');
assert.match(line.text, /not cargo/i, 'civilian line should explicitly reject cargo framing');

const result = runInspect({ tick: 31000 });
assertBeatEntered(result, 'civilian_pod_choice');
assert.equal(result.scenarioContract.activeBeatId, 'civilian_pod_choice',
  'tick 31000 should be inside the civilian_pod_choice beat');
assert.equal(result.scenarioContract.factValues['fact.47a.civilian_status'], 'unresolved',
  'civilian status should stay unresolved until the branch/result changes it');
assert.equal(result.scenarioContract.factValues['fact.47a.evidence_status'], 'unresolved',
  'evidence status should stay unresolved at the priority split');
assert.equal(result.scenarioContract.unresolvedActorIds.length, 0, 'all 47-A actors should remain bound');

const pod = entityByActorId(result, 'civilian_pod');
assert.equal(pod.type, 'payload', 'civilian pod should be a payload entity');
assert.equal(pod.data.rescuePriority, true, 'civilian pod should carry rescue priority data');
assert.equal(pod.data.distressBeacon, true, 'civilian pod should carry a distress beacon');
assert.equal(pod.data.tetherPayload, true, 'civilian pod should be a Massline-capable priority target');
assert.equal(pod.data.assetRef, 'asset.slice.civilian_pod', 'civilian pod should keep its authored asset reference');

console.log(`47-A civilian priority OK (beat ${result.scenarioContract.activeBeatId}, pod actor bound)`);
