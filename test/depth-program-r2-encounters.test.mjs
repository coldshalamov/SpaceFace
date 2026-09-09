import test from 'node:test';
import assert from 'node:assert/strict';

import { ENCOUNTERS } from '../src/data/encounters/index.generated.js';
import { ENCOUNTER_SCRIPTS } from '../src/systems/encounterScripts.js';

const AUTHORED = Object.freeze([
  ['unique_wreck_tideline_held_mass', 'wreck_gravhand_tideline'],
  ['unique_wreck_deepsurvey_ping_elite', 'wreck_deepsurvey'],
]);

test('D6 and D8 encounter hooks self-register as direct-only authored encounters', () => {
  for (const [id, wreckId] of AUTHORED) {
    const encounter = ENCOUNTERS[id];
    assert.ok(encounter, `${id} is present in the generated encounter catalogue`);
    assert.equal(encounter.weight, 0, `${id} cannot enter the ambient weighted deck`);
    assert.deepEqual(encounter.zoneTypes, [], `${id} has no ambient zone eligibility`);
    assert.equal(encounter.proximity, false);
    assert.equal(encounter.gates?.uniqueWreckOnly, true);
    assert.equal(encounter.gates?.uniqueWreckId, wreckId);
    assert.equal(typeof encounter.script, 'string');
    assert.equal(typeof ENCOUNTER_SCRIPTS[encounter.script]?.start, 'function', `${id} resolves a live encounter script`);
  }
});

test('the two authored hooks retain different player-facing triggers', () => {
  const held = ENCOUNTERS.unique_wreck_tideline_held_mass;
  const ping = ENCOUNTERS.unique_wreck_deepsurvey_ping_elite;
  assert.match(String(held?.triggerKind || held?.variant || ''), /held[_-]?mass/i);
  assert.match(String(ping?.triggerKind || ping?.variant || ''), /ping[_-]?elite|repeated[_-]?ping/i);
  assert.equal(Number(ping?.requiredPings) >= 2, true, 'D8 requires repeated pings, not its discovery scan alone');
});
