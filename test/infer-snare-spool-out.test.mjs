// A snare that waited one tick must not lay its line if the spool died in that wait.
import test from 'node:test';
import assert from 'node:assert/strict';

import { masslineSnares } from '../src/systems/masslineSnares.js';

function world(disabled) {
  const events = [];
  const created = [];
  const player = { id: 1, alive: true, flags: {}, pos: { x: 0, z: 0 } };
  const source = { id: 2, alive: true, pos: { x: 10, z: 0 } };
  const target = { id: 3, alive: true, pos: { x: -10, z: 0 } };
  const state = {
    mode: 'flight',
    tick: 4,
    simTime: 2,
    playerId: 1,
    player: {},
    entities: new Map([[1, player], [2, source], [3, target]]),
    combat: {
      entities: {
        1: { subsystems: { subsystem_tether_spool: { effectiveDisabled: disabled } } },
      },
    },
  };
  const sys = Object.assign(Object.create(masslineSnares), {
    state,
    bus: { emit(name, payload) { events.push({ name, payload }); } },
    _webs: null,
    _deployment: {
      id: 'snare-wait',
      sourceId: 2,
      targetId: 3,
      anchorAId: 2,
      anchorBId: 3,
      sentinelId: null,
      attachmentId: null,
      spawnTick: 2,
      expiresAt: 20,
      armedAt: null,
      caughtId: null,
    },
    _attachments() {
      return {
        create(spec) { created.push(spec); return { ok: true, attachment: { id: 'line' } }; },
        get() { return null; },
      };
    },
  });
  return { sys, state, events, created };
}

test('a waiting snare does not create its line after the spool dies', () => {
  const { sys, state, events, created } = world(true);
  sys.update(1 / 60, state);
  assert.equal(created.length, 0);
  assert.equal(sys._deployment, null);
  assert.equal(events.find((event) => event.name === 'tether:latchDenied').payload.reason, 'snare_spool_out');
});

test('a waiting snare still creates its line while the spool is live', () => {
  const { sys, state, created } = world(false);
  sys.update(1 / 60, state);
  assert.equal(created.length, 1);
  assert.equal(created[0].defId, 'attachment_transverse_snare');
});
