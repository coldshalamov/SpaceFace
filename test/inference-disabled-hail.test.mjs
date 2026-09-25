// A disabled recovery hull asks once for a rope. Hull climbs only while that rope stays taut.
import assert from 'node:assert/strict';
import test from 'node:test';

import { LATCH_REPAIR_HULL_PER_SECOND, stepLatchRepair } from '../src/combat/latchRepair.js';
import { createSimulation } from '../src/core/sim.js';
import { CONTACT_HAIL_RANGE } from '../src/data/contactHail.js';
import { recoveryEncounter, RECOVERY_ROPE_HAIL } from '../src/systems/recoveryEncounter.js';

const SEED = 4242;
const SECTOR_ID = 'sector_ceres_belt';

test('a disabled recovery hull asks for the rope once and heals only while the line is held', () => {
  const sim = createSimulation({ seed: SEED, systems: [recoveryEncounter] });
  const { state, bus } = sim;
  assert.equal(state.meta.seed, SEED);
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR_ID;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 10, hull: 100, hullMax: 100, data: {},
  });
  state.playerId = player.id;

  const wreckX = CONTACT_HAIL_RANGE - 50;
  bus.emit('signal:investigated', {
    sourceKind: 'distress',
    sectorId: SECTOR_ID,
    pos: { x: wreckX, z: 0 },
    signalId: 'sig-disabled-hail',
    sourceId: 'point-disabled-hail',
  });

  const own = state.recoveryEncounters;
  const record = own.records[own.activeId];
  assert.ok(record, 'the recovery path opened a call');
  const wreck = state.entities.get(record.entityId);
  assert.equal(wreck && wreck.type, 'wreck', 'the recovery path spawned the derelict');
  assert.equal(wreck.data.derelictHelp, true);
  const dist = Math.hypot(wreck.pos.x - player.pos.x, wreck.pos.z - player.pos.z);
  assert.ok(dist > 260 && dist <= CONTACT_HAIL_RANGE, 'inside the existing hail span, outside the scan bubble');

  const hails = [];
  bus.on('comms:popup', (payload) => hails.push(payload));
  const system = sim.registry.get('recoveryEncounter');
  system.update(1 / 60, state);
  assert.equal(hails.length, 1, 'one hail');
  assert.equal(hails[0].text, RECOVERY_ROPE_HAIL);
  assert.match(hails[0].text, /rope/i);

  system.update(1 / 60, state);
  assert.equal(hails.length, 1, 'a second tick does not hail again');

  const before = wreck.hull;
  assert.ok(before < wreck.hullMax - 0.05, 'the derelict starts short of a full hull');
  wreck.pos.x = 40;
  wreck.pos.z = 0;
  player.pos.x = 0;
  player.pos.z = 0;
  const restLength = 40;
  state.player.tether = {
    active: true,
    targetId: wreck.id,
    attachmentId: 'line',
    phase: 'loaded',
    restLength,
  };
  state.combat = {
    attachments: {
      byId: {
        line: {
          id: 'line',
          state: 'active',
          ownerId: player.id,
          targetId: wreck.id,
          restLength,
          phase: 'loaded',
        },
      },
    },
    entities: {},
  };
  const gained = stepLatchRepair(state, 1);
  assert.equal(gained, LATCH_REPAIR_HULL_PER_SECOND);
  assert.equal(wreck.hull, before + LATCH_REPAIR_HULL_PER_SECOND);

  const frozen = wreck.hull;
  state.combat.attachments.byId.line.state = 'released';
  state.player.tether.active = false;
  state.player.tether.phase = 'slack';
  assert.equal(stepLatchRepair(state, 1), 0);
  assert.equal(wreck.hull, frozen, 'letting go freezes the partial hull');
});
