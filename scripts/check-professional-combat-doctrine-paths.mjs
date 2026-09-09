import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { DOCTRINE_IDS } from '../src/presentation/combatChoreography.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';

const state = {
  playerId: 1,
  tick: 100,
  simTime: 100 / 60,
  entities: new Map([
    [1, { id: 1, alive: true, pos: { x: 0, y: 0, z: 0 } }],
    [2, { id: 2, alive: true, pos: { x: 80, y: 0, z: 0 } }],
  ]),
};
const bus = createBus();
const cues = [];
bus.on('presentation:cue', (payload) => cues.push(payload));
presentationOrchestrator.init({ state, bus });

exerciseGunDoctrine('interceptor_flyby', 'engine_flare', 'hit');
exerciseTetherDoctrine();
exerciseGunDoctrine('ranged_disengager', 'weapon_charge', 'near_miss');

for (const doctrineId of DOCTRINE_IDS) {
  for (const phase of ['setup', 'telegraph', 'action', 'aftermath']) {
    assert(cues.some((cue) => cue.id === `combat.doctrine.${phase}` && cue.tags.includes(doctrineId)),
      `${doctrineId} must exercise ${phase} through a live event path`);
  }
}

const tetherAction = cues.find((cue) => cue.id === 'combat.doctrine.action' && cue.tags.includes('tether_control_raider'));
const tetherAftermath = cues.find((cue) => cue.id === 'combat.doctrine.aftermath' && cue.tags.includes('tether_control_raider'));
assert.equal(tetherAction.sourceEvent, 'combat:actionStarted', 'tether action must use its real action authority');
assert.equal(tetherAftermath.sourceEvent, 'tether:attached', 'tether aftermath must use a truthful attach outcome');
assert(cues.every((cue) => cue.sourceId === 2 && cue.targetId === 1), 'every doctrine receipt must preserve exact attacker and target');

presentationOrchestrator.dispose();
console.log(JSON.stringify({
  schema: 'spaceface.professionalCombatDoctrinePaths.v1',
  ok: true,
  doctrines: DOCTRINE_IDS,
  phasesPerDoctrine: 4,
  cueCount: cues.length,
}, null, 2));

function telegraph(doctrineId, kind) {
  bus.emit('ai:telegraph', {
    entityId: 2,
    targetId: 1,
    doctrineId,
    kind,
    durationTicks: 30,
    tick: state.tick,
  });
  bus.flush();
}

function exerciseGunDoctrine(doctrineId, kind, outcome) {
  state.tick += 30;
  telegraph(doctrineId, kind);
  state.tick++;
  bus.emit('combat:fire', { ownerId: 2, weaponId: 'test_weapon', origin: { x: 80, z: 0 }, dir: { x: -1, z: 0 } });
  bus.flush();
  state.tick++;
  if (outcome === 'hit') {
    bus.emit('combat:damage', {
      attackerId: 2,
      targetId: 1,
      applied: 4,
      shieldDamage: 4,
      armorDamage: 0,
      hullDamage: 0,
      before: { hull: 20 },
      after: { hull: 20 },
      pos: { x: 0, z: 0 },
    });
  } else {
    bus.emit('projectile:nearMiss', {
      projectileId: state.tick,
      ownerId: 2,
      targetId: 1,
      distance: 14,
      damageType: 'kinetic',
      pos: { x: 0, z: 14 },
      direction: { x: 1, z: 0 },
    });
  }
  bus.flush();
}

function exerciseTetherDoctrine() {
  state.tick += 30;
  telegraph('tether_control_raider', 'attach_spool');
  state.tick++;
  bus.emit('combat:actionStarted', {
    actorId: 2,
    actionId: 'action_attach',
    actionInstanceId: 'action_tether',
    target: { entityId: 1 },
    startedTick: state.tick,
  });
  bus.flush();
  state.tick++;
  bus.emit('tether:attached', { actorId: 2, targetId: 1, attachmentId: 'tether_1', restLength: 40 });
  bus.flush();
}
