// U8 (WF-08) — ev_scavengers_at_fresh_wreck is a reachable authored encounter: registered in the
// generated catalog, ambush-scripted, spring-on-proximity in derelict fields, and the generated
// index stays in sync with the authored module list.
import assert from 'node:assert/strict';
import test from 'node:test';

import { ENCOUNTERS } from '../src/data/encounters/index.generated.js';

const TRIGGER_ID = 'scavengers_fresh_wreck';

// The generated catalog is an id-keyed registry object, not an array.
function findEncounter(id) {
  return ENCOUNTERS[id] || null;
}

test('scavengers_at_fresh_wreck registers as a reachable derelict-field ambush', () => {
  const encounter = findEncounter(TRIGGER_ID);
  assert.ok(encounter, 'the encounter is registered in the generated catalog');
  const trigger = encounter.trigger || encounter;
  assert.equal(trigger.script, 'ambush', 'the proven ambush script owns the spring behavior');
  assert.equal(trigger.proximity, true, 'scavengers spring on approach, not on a timer');
  assert.ok(Array.isArray(trigger.zoneTypes) && trigger.zoneTypes.includes('derelict_field'),
    'reachable from derelict field zones');
  assert.ok(trigger.weight > 0, 'the ambient deck can actually draw it');
  assert.ok(trigger.cooldownS >= 300, 'a scavenger party does not re-form instantly');
  assert.deepEqual(trigger.gates, { minSectorTier: 2 },
    'the reaver-anchored pack is gated off fresh players like its template 020');
});

test('the wreck party is an anchored scavenger squad on the ambush spring', () => {
  const encounter = findEncounter(TRIGGER_ID);
  const shape = encounter && (encounter.shape || encounter);
  const squad = shape && shape.squad;
  assert.ok(squad, 'the encounter authors a squad');
  assert.equal(squad.anchorArchetype, 'reaver_pirate', 'the scavenger boss anchors the party');
  assert.ok(squad.size && squad.size[0] >= 1 && squad.size[1] <= 3,
    'a small cutting crew, not a fleet');
  assert.equal(shape.bark, 'ambush_tele', 'the spring telegraphs with the house ambush bark');
});
