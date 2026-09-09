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
const beat = beatById(contract, 'recovery_tug');
assertIncludesAll(beat.requiredActors, ['player_kestrel', 'evidence_spindle_47a', 'official_recovery_tug', 'scavenger_thief'],
  'recovery_tug actors');
assertIncludesAll(beat.requiredMechanics, ['ai.contain_and_disable', 'subsystem.targeting', 'massline.contested_payload'],
  'recovery_tug mechanics');
assertIncludesAll(beat.presentationEventIds, ['subsystem.disabled', 'scenario.comms.denial', 'tether.attach'],
  'recovery_tug presentation events');

const officialActor = actorById(contract, 'official_recovery_tug');
assert.equal(officialActor.factionId, 'faction_scn', 'official recovery tug should be authored as SCN faction');
assertIncludesAll(officialActor.capabilities, ['ai.contain_and_disable', 'massline.attach', 'subsystem.targeting'],
  'official recovery tug capabilities');

const result = runInspect({ tick: 17000 });
assertBeatEntered(result, 'recovery_tug');
assert.equal(result.scenarioContract.activeBeatId, 'recovery_tug',
  'tick 17000 should be inside the recovery_tug beat');
assert(result.metrics.scenarioBeatEntered >= 5, 'runtime should enter the first five 47-A beats');
assert(result.metrics.presentationCue >= 6, 'recovery beat should add presentation cue evidence');
assert.equal(result.scenarioContract.factValues['fact.47a.faction_pressure'], 'none',
  'recovery contest should not mutate faction pressure before branch resolution');

const official = entityByActorId(result, 'official_recovery_tug');
assert.equal(official.team, 2, 'official tug should be lawful/neutral team 2');
assert.equal(official.factionId, 'faction_scn', 'official tug should retain SCN faction');
assert.equal(official.data.ai.passive, false, 'official tug should activate during the recovery beat');
assert.equal(official.data.ai.doctrine, 'official', 'official tug should keep official doctrine');
assert.equal(official.data.ai.preferredRole, 'tug', 'official tug should be a tug controller');
assertIncludesAll(official.data.ai.capabilities, ['tether', 'tug', 'disable', 'counter_tether_cut'],
  'runtime official tug capabilities');

console.log(`47-A recovery contested OK (beat ${result.scenarioContract.activeBeatId}, official tug active team ${official.team})`);
