import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createBus } from '../src/core/eventBus.js';
import { createStuntDetector } from '../src/combat/stuntTaxonomy.js';
import { stuntGrammar } from '../src/systems/stuntGrammar.js';
import { TetherWebFx } from '../src/render/combat/tetherWebFx.js';
import { WEB_DEF_ID } from '../src/combat/tetherWebs.js';
import { resolveDeathTelegraph } from '../src/systems/survivalResults.js';
import { createGameState } from '../src/core/gameState.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { materializeWaveBatch } from '../src/systems/waveMaterialization.js';
import { aiPorts } from '../src/systems/aiPorts.js';

test('unclaimed asteroid rebounds do not become player Bank Shots', () => {
  const d = createStuntDetector({ playerId: 1 });
  d.processEvent('combat:collisionConsequence', {
    tick: 10, targetId: 2, otherId: 9, surface: 'terrain', deltaV: 30, provenance: {},
  });
  const tricks = d.processEvent('combat:collisionConsequence', {
    tick: 12, targetId: 3, otherId: 2, surface: 'craft', deltaV: 30, provenance: {},
  });
  assert.equal(tricks.some(t => t.trickId === 'bank_shot'), false);
});

test('ambient gravity fields do not award player Well Golf', () => {
  const d = createStuntDetector({ playerId: 1 });
  d.processEvent('well:fling', { tick: 10, wellId: 20, targetId: 2 });
  const tricks = d.processEvent('combat:collisionConsequence', {
    tick: 12, targetId: 3, otherId: 2, surface: 'craft', deltaV: 30, provenance: {},
  });
  assert.equal(tricks.some(t => t.trickId === 'well_golf'), false);
});

test('enemy kills do not pay player combos; aliases count once and reused ids work', () => {
  const state = { playerId: 1 };
  const bus = createBus();
  const system = Object.create(stuntGrammar);
  system.init({ state, bus });
  bus.emit('entity:killed', { id: 2, killerId: 3, weaponId: 'wpn_autocannon_m' });
  assert.equal(state.stunts?.combo?.gunKills || 0, 0);
  bus.emit('entity:killed', { id: 4, killerId: 1, weaponId: 'wpn_autocannon_m' });
  bus.emit('combat:kill', { targetId: 4, killerId: 1, weaponId: 'wpn_autocannon_m' });
  assert.equal(state.stunts.combo.gunKills, 1);
  bus.emit('entity:spawned', { id: 4 });
  bus.emit('entity:killed', { id: 4, killerId: 1, weaponId: 'wpn_autocannon_m' });
  assert.equal(state.stunts.combo.gunKills, 2);
  system.destroy();
});

test('death warnings match the recent killer; a wave announcement is not an attack tell', () => {
  const result = resolveDeathTelegraph({ receipt: { killerId: 9 }, deathSimTime: 40,
    wave: 1, waveStartSimTime: 0,
    telegraphTrail: [{ attackerId: 9, kind: 'weapon_charge', simTime: 1 },
      { attackerId: 8, kind: 'weapon_charge', simTime: 39 }],
    damageTrail: [{ attackerId: 8, weaponId: 'wpn_railgun_m', simTime: 39 }],
  });
  assert.equal(result.source, 'unrecorded');
  assert.equal(result.leadTimeMs, null);
});

test('web cables draw only actual active enemy constraints and follow rebased endpoints', () => {
  const scene = new THREE.Scene();
  const fx = new TetherWebFx(scene, (x, z, out) => { out.x = x - 1000; out.z = z; return out; });
  const state = { entities: new Map([[2, { alive: true, pos: { x: 1000, z: 0 } }],
    [3, { alive: true, pos: { x: 1080, z: 20 } }]]), combat: { attachments: { byId: {
      web: { defId: WEB_DEF_ID, state: 'active', ownerId: 2, targetId: 3, restLength: 100 },
    } } } };
  fx.update(state);
  assert.equal(fx.mesh.count, 20);
  assert.ok([...fx.mesh.instanceMatrix.array.slice(0, fx.mesh.count * 16)].every(Number.isFinite));
  state.combat.attachments.byId.web.state = 'broken';
  fx.update(state);
  assert.equal(fx.mesh.count, 0);
  assert.equal(fx.mesh.visible, false);
  fx.dispose();
  assert.equal(scene.children.length, 0);
});

test('survival cohorts track the distant pilot without granting ambient pirates that knowledge', () => {
  const state = createGameState(4242); const bus = createBus();
  const pilot = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, radius: 8, mass: 16, data: {} };
  state.playerId = 1; state.nextEntityId = 2;
  state.entityList.push(pilot); state.entities.set(1, pilot);
  const helpers = { spawnBudget: makeBudgetApi(state), spawnEntity(spec) {
    const e = { ...spec, alive: true, id: state.nextEntityId++ };
    state.entities.set(e.id, e); state.entityList.push(e); return e;
  } };
  const ctx = { state, bus, helpers };
  const receipt = materializeWaveBatch(ctx, { count: 1, enemyId: 'wasp_swarmer', seed: 4242, wave: 1 });
  const enemy = state.entities.get(receipt.spawnedIds[0]);
  assert.equal(enemy.data.ai.moraleImmune, true);
  assert.equal(enemy.data.ai.surrenderImmune, true);
  assert.equal(enemy.data.ai.activity.anchor, null, 'the spawn position is not a pursuit leash');
  pilot.pos.x = 10000;
  const ports = Object.create(aiPorts); ports.init(ctx);
  const contact = helpers.aiSensors.frameFor(enemy.id, 1).contacts.find(c => c.id === 1);
  assert.ok(contact, 'the round cannot strand the pilot hunting a lost enemy');
  assert.equal(contact.hostile, true, 'the normal hostility authority still decides the contact');
  delete enemy.data.runCohort;
  assert.equal(helpers.aiSensors.frameFor(enemy.id, 2).contacts.some(c => c.id === 1), false);
});
