import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { materializeWaveBatch } from '../src/systems/waveMaterialization.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { SquadCommander } from '../src/ai/squad.js';
import { CombatDoctrineRuntime } from '../src/ai/combatDoctrine.js';

test('a real wounded arena tail receives the late-wave commit rather than squad cover withdrawal', () => {
  const state = createGameState(4242), bus = createBus();
  state.mode = 'flight';
  const player = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 8, mass: 16, data: {} };
  state.playerId = 1; state.nextEntityId = 2;
  state.entities.set(player.id, player); state.entityList.push(player);
  const helpers = { spawnBudget: makeBudgetApi(state), spawnEntity(spec) {
    const e = { ...spec, alive: true, id: state.nextEntityId++ };
    state.entities.set(e.id, e); state.entityList.push(e); return e;
  } };
  const ctx = { state, bus, helpers };
  const spawned = materializeWaveBatch(ctx, { count: 1, enemyId: 'wasp_swarmer', seed: 4242,
    wave: 1, swarm: true, gateGroup: 'front' });
  assert.equal(spawned.admitted, 1);
  const wasp = state.entities.get(spawned.spawnedIds[0]);
  wasp.hull = wasp.hullMax * 0.05;
  const ports = Object.create(aiPorts); ports.init(ctx);
  const frame = helpers.aiSensors.frameFor(wasp.id, 1);
  assert.equal(frame.self.arenaPursuit, true, 'real materializer stamp is carried through the production sensor');
  assert.equal(frame.self.moraleImmune, true);
  // Configure a damaged drive in the sensor snapshot; the pursuit/identity flags above
  // are produced by the actual materializer and sensor, not hand-stamped by this fixture.
  const woundedFrame = structuredClone(frame);
  woundedFrame.self.subsystemFractions = { subsystem_drive: 0.4 };
  const doctrine = new CombatDoctrineRuntime({ seed: 4242 });
  const fallback = doctrine.update({ tick: 1, entityId: wasp.id, doctrineId: 'pack_pursuit', perception: woundedFrame });
  assert.equal(fallback?.phase, 'retreat', 'subsystem wound retains its normal cover fallback');
  const back = doctrine.update({ tick: 842, entityId: wasp.id, doctrineId: 'pack_pursuit', perception: woundedFrame });
  assert.equal(back?.phase, 'press', 'the existing 14-second fallback ends without a new timer');
  const wave = Object.assign(Object.create(survivalWave), {
    state, _swarm: { killTarget: 1 }, _cohort: new Map([[wasp.id, { entity: wasp }]]), _bossIds: new Set(),
    _elapsedSeconds: () => 61, _durationSeconds: () => 60,
  });
  wave._commitLastStand();
  assert.equal(wasp.data.ai.combatDoctrineId, 'brawler_commit');
  const commander = new SquadCommander({ seed: 4242, config: { freezeResults: false } });
  commander.registerSquad({ id: 'tail', members: [{ id: wasp.id, capabilities: ['weapon'],
    combatDoctrineId: wasp.data.ai.combatDoctrineId }] });
  const result = commander.update('tail', 843, new Map([[wasp.id, woundedFrame]]));
  const directive = result.directives.get(wasp.id);
  assert.notEqual(directive.objective.reason, 'wounded_corridor');
  assert.ok(['focus', 'engage'].includes(directive.objective.kind), JSON.stringify(directive.objective));
  const decision = doctrine.update({ tick: 843, entityId: wasp.id,
    doctrineId: directive.combatDoctrineId, perception: woundedFrame, directive });
  assert.equal(decision?.doctrineId, 'brawler_commit');
  assert.equal(decision?.targetId, player.id);
  assert.equal(wasp.alive, true, 'commit does not remove or resolve the fighter');
});
