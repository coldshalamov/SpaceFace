// Wave G9 — dismissing the objective and pressing the bound key restores that string.
// The key is not the mission log.

import test from 'node:test';
import assert from 'node:assert/strict';

import { BINDINGS } from '../src/ui/bindings.js';
import {
  createObjectiveRecall,
  rememberObjective,
  dismissObjective,
  recallObjective,
  objectiveVisible,
} from '../src/ui/objectiveRecall.js';

test('G9 the bound key restores the objective string that left the screen', () => {
  const memory = createObjectiveRecall();
  rememberObjective(memory, 'HAUL THE ORE');
  assert.equal(objectiveVisible(memory, true), true);
  assert.equal(dismissObjective(memory), 'HAUL THE ORE');
  assert.equal(objectiveVisible(memory, true), false);
  rememberObjective(memory, 'A LATER LINE');
  assert.equal(memory.snapshot, 'HAUL THE ORE');
  assert.equal(recallObjective(memory), 'HAUL THE ORE');
  assert.equal(objectiveVisible(memory, false), true);
  assert.equal(BINDINGS.recallObjective.code, 'Semicolon');
  assert.equal(BINDINGS.recallObjective.label, ';');
  assert.notEqual(BINDINGS.recallObjective.code, BINDINGS.missionLog.code);
});
