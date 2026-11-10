import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveBeamVerb } from '../src/combat/industrialBeam.js';

test('repair resolution carries the selected damaged subsystem to the combat repair writer', () => {
  const descriptor = {
    id: 'ship',
    type: 'ship',
    alive: true,
    hull: 100,
    hullMax: 100,
    armorHp: 50,
    armorMax: 50,
    components: [
      {
        componentId: 'subsystem_drive',
        kind: 'subsystem',
        destroyed: true,
      },
    ],
  };

  assert.deepEqual(resolveBeamVerb(descriptor, {
    mode: 'repair',
    selectedComponentId: 'subsystem_drive',
    credits: 100,
  }), {
    verb: 'repair',
    ok: true,
    reason: null,
    componentId: 'subsystem_drive',
    receiverHints: null,
  });
});
