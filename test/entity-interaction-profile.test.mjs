import assert from 'node:assert/strict';
import test from 'node:test';

import {
  interactionProfileForEntity,
  interactionDisplayName,
} from '../src/data/entityInteractionProfiles.js';

function entity(type, data = {}) {
  return { id: `${type}-fixture`, type, alive: true, data };
}

test('asteroids expose one geological mining and drill identity', () => {
  const rock = entity('asteroid', { typeId: 'ast_metallic' });
  const profile = interactionProfileForEntity(rock);

  assert.equal(profile.kind, 'asteroid');
  assert.equal(profile.mineable, true);
  assert.equal(profile.drillable, true);
  assert.equal(profile.salvageable, false);
  assert.equal(profile.tetherable, true);
  assert.equal(profile.destructible, true);
  assert.equal(profile.beamVerb, 'mine');
  assert.equal(interactionDisplayName(rock), 'Metallic Asteroid');
});

test('ordinary wrecks are salvage, never drillable asteroids', () => {
  const wreck = entity('wreck', { parentType: 'hull' });
  const profile = interactionProfileForEntity(wreck);

  assert.equal(profile.kind, 'wreck');
  assert.equal(profile.mineable, false);
  assert.equal(profile.drillable, false);
  assert.equal(profile.salvageable, true);
  assert.equal(profile.beamExtractable, true);
  assert.equal(profile.tetherable, true);
  assert.equal(profile.beamVerb, 'salvage');
  assert.equal(interactionDisplayName(wreck), 'Wreckage');
});

test('unstable reactor wrecks disclose the hazardous mechanical identity', () => {
  const reactor = entity('wreck', {
    parentType: 'reactor',
    unstableReactor: { dueAt: 120, vented: false },
  });
  const profile = interactionProfileForEntity(reactor);

  assert.equal(profile.kind, 'unstable_reactor_wreck');
  assert.equal(profile.drillable, false);
  assert.equal(profile.salvageable, true);
  assert.equal(profile.hazardous, true);
  assert.equal(profile.beamVerb, 'salvage');
  assert.equal(interactionDisplayName(reactor), 'Unstable Reactor Wreck');
});

test('authored labels may refine a profile without changing its interaction kind', () => {
  const wreck = entity('wreck', { scanLabel: 'SLAG HAULER HULK' });
  assert.equal(interactionProfileForEntity(wreck).kind, 'wreck');
  assert.equal(interactionDisplayName(wreck), 'SLAG HAULER HULK');
});
