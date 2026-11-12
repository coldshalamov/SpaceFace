import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ENCOUNTERS,
  ENCOUNTER_MODULES,
} from '../src/data/encounters/index.generated.js';

const PLAYABLE = Object.freeze([
  'depth_h1_distress_from_inside',
  'depth_h2_drifting_bloom',
  'depth_h3_wreck_that_knows_you',
  'depth_h4_love_letter_buoy',
  'depth_h5_corridor_massacre',
  'depth_h6_patrol_ambush',
  'depth_h7_spared_return',
  'depth_h8_echo_of_player',
]);

const FOLLOW_ONS = Object.freeze([
  'depth_h6_vael_enforcement_follow_on',
  'depth_h8_mass_migration_follow_on',
]);

test('E1 contributes eight playable self-registering encounters', () => {
  for (const id of PLAYABLE) {
    const shape = ENCOUNTERS[id];
    assert.ok(shape, `${id} must self-register through the generated index`);
    const module = ENCOUNTER_MODULES.find((entry) => entry.trigger?.id === id);
    assert.ok(module, `${id} must retain its trigger header module`);
    assert.equal(module.default.id, module.trigger.id);
    assert.equal(typeof module.runtime?.fire, 'function', `${id} must export its own phase runtime`);
    assert.equal(typeof shape.gates, 'object');
    assert.equal(Object.isFrozen(shape), true);
  }
});
test('E1 headers encode the persistence and trigger contract', () => {
  for (const id of [
    'depth_h1_distress_from_inside',
    'depth_h2_drifting_bloom',
    'depth_h3_wreck_that_knows_you',
    'depth_h5_corridor_massacre',
    'depth_h8_echo_of_player',
  ]) {
    assert.equal(ENCOUNTERS[id]?.gates?.uniqueOnce, true, `${id} must be once-ever`);
  }
  assert.equal(ENCOUNTERS.depth_h4_love_letter_buoy.gates.blockAfterOutcome, 'reseeded');
  assert.equal(ENCOUNTERS.depth_h6_patrol_ambush.gates.uniqueOnce, undefined);
  assert.equal(ENCOUNTERS.depth_h7_spared_return.gates.moralDebtOnly, true);
  assert.equal(ENCOUNTERS.depth_h8_echo_of_player.gates.storyBeatMin, 7);
  assert.equal(ENCOUNTERS.depth_h8_echo_of_player.mirrorCourse.simCoordinates, true);
});

test('the two banked variants are honest direct-only follow-on stubs', () => {
  for (const id of FOLLOW_ONS) {
    const shape = ENCOUNTERS[id];
    assert.ok(shape, `${id} must be discoverable for later implementation`);
    assert.equal(shape.followOnStub, true);
    assert.equal(shape.weight, 0);
    assert.equal(shape.gates.externalOnly, true);
    assert.equal(shape.runtimeReady, false);
    const module = ENCOUNTER_MODULES.find((entry) => entry.trigger?.id === id);
    assert.equal(module?.runtime, undefined, `${id} must not pretend to be playable`);
  }
});
