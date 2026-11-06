// Actual production weapons/worker reply -> main mirror -> existing pooled VFX consumer.
// Pose, clock and replacement cases are explicit CPU fixtures, not ordinary-flight look proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createSimHost, collectEntityVitals } from '../scripts/lib/simWorkerHost.mjs';
import { createReadModel, applySpawnInfos, applyEntityVitals, applyDestroyIds, applyFacadePose }
  from '../scripts/lib/simReadModel.mjs';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { WEAPONS } from '../src/data/weapons.js';
import { vfx } from '../src/render/vfx.js';
import { SEEKER_TELL_MAX_ACTIVE, SEEKER_TELL_COLOR_YOU, SEEKER_TELL_COLOR_OTHER,
  SEEKER_TELL_REDUCED_PERIOD_MUL, SEEKER_TELL_PERIOD_S, seekerTellLit } from '../src/render/seekerTell.js';

const DT = 1 / 60;
const DEF = WEAPONS.find((row) => row.tracking === 'homing');
function renderer(main, playerId) {
  const state = createGameState(4242), bus = createBus();
  Object.assign(state, { mode: 'flight', playerId, entities: main.entities, entityList: [...main.entities.values()],
    render: { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), viewport: { height: 720 }, interpolationAlpha: 1 } });
  state.settings.accessibility.flashReduce = true;
  const system = Object.create(vfx);
  system.init({ state, bus, helpers: { player: () => main.entities.get(playerId) } });
  return { system, state, bus };
}
function colorOf(sprite) { return [sprite.r, sprite.g, sprite.b]; }
function color(value) { const c = new THREE.Color(value); return [c.r, c.g, c.b]; }
function consume(h, main, reply) {
  applySpawnInfos(main, reply.spawnInfos);
  applyEntityVitals(main, reply.entityVitals);
  h.state.entityList = [...main.entities.values()];
}
function lamp(h, id) { return h.system._seekerTellNext.get(id)?.sprite; }

test('canonical guided round and countermeasure changes reach the actual main pooled warning', async () => {
  const lane = createSimHost();
  try {
    await lane.init({ profile: 'production', seed: 4242,
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url))) });
    const { state, registry, runtime } = lane.host;
    state.mode = 'flight';
    const ship = (team, x) => ({ type: 'ship', team, pos: { x, z: 0 }, vel: { x: 0, z: 0 },
      radius: 8, mass: 30, hull: 100, hullMax: 100, cap: 100, capMax: 100, physicsBody: false,
      data: { ai: { passive: true, allowPassiveManeuver: false }, fittings: [], intent: {} } });
    const player = runtime.spawn(ship(0, 100)); state.playerId = player.id;
    const shooter = runtime.spawn(ship(1, 0));
    const fire = () => registry.get('weapons')._spawnProjectile(shooter, { ...DEF, defId: DEF.id }, DEF, 0, player, true, state);
    fire();
    const missile = state.entityList.find((row) => row.type === 'projectile');
    const first = await lane.tick({ kind: 'tick', tick: 1, steps: 1, commands: [] });
    const main = createReadModel(); applySpawnInfos(main, first.spawnInfos); applyEntityVitals(main, first.entityVitals);
    const h = renderer(main, player.id), mirror = main.entities.get(missile.id);
    assert.equal(mirror.data.kind, 'missile');
    assert.equal(mirror.data.targetGeneration, player.occupantGeneration);
    assert.ok(mirror.vel.x > 0, 'canonical heading0 launches along +X');
    assert.equal(mirror.vel.z, 0);
    const before = JSON.stringify({ data: mirror.data, pos: mirror.pos, vel: mirror.vel });
    h.system.update(DT); // The actual frame dispatcher must reach the new consumer hookup.
    assert.ok(lamp(h, missile.id));
    assert.deepEqual(colorOf(lamp(h, missile.id)), color(SEEKER_TELL_COLOR_YOU));
    assert.equal(JSON.stringify({ data: mirror.data, pos: mirror.pos, vel: mirror.vel }), before, 'presentation writes no projectile truth');

    // Controlled mirror-pose fixture through the existing main pose owner, without extrapolation.
    applyFacadePose(main, missile.id, { x: mirror.pos.x + 50, y: 0, z: 0, rot: 0 });
    h.system._emitSeekerTells(DT);
    assert.equal(lamp(h, missile.id).x, mirror.pos.x);
    assert.equal(lamp(h, missile.id).z, mirror.pos.z);

    player.data.fittings = ['mod_decoy_buoy_s'];
    state.input.deployCountermeasure = true;
    registry.get('countermeasures').update(DT, state);
    state.input.deployCountermeasure = false;
    assert.notEqual(missile.data.targetId, player.id, 'the real fitted countermeasure diverts this seeded round');
    const diverted = await lane.tick({ kind: 'tick', tick: 2, steps: 1, commands: [] });
    consume(h, main, diverted);
    assert.equal(mirror.data.targetId, missile.data.targetId);
    assert.equal(mirror.data.diverted, true);
    assert.equal(mirror.data.guidanceBroken, true);
    h.system._emitSeekerTells(DT);
    assert.deepEqual(colorOf(lamp(h, missile.id)), color(SEEKER_TELL_COLOR_OTHER));

    // Exact diff-owner check: no kinematic change may be required to carry false/null/zero.
    const shadow = new Map(); collectEntityVitals(state, shadow);
    missile.data.targetId = null; missile.data.targetGeneration = null; missile.data.turnRate = 0;
    missile.data.diverted = false; missile.data.guidanceBroken = false;
    const cleared = collectEntityVitals(state, shadow);
    assert.ok(cleared.some(([id]) => id === missile.id), 'guidance-only changes dirty the existing scalar channel');
    applyEntityVitals(main, cleared);
    assert.equal(mirror.data.targetId, null);
    assert.equal(mirror.data.targetGeneration, null);
    assert.equal(mirror.data.turnRate, 0);
    assert.equal(mirror.data.diverted, false);
    assert.equal(mirror.data.guidanceBroken, false);
    h.system._emitSeekerTells(DT);
    assert.equal(lamp(h, missile.id), undefined, 'a zero-steering round loses its warning');

    const staleReceipt = diverted.entityVitals.filter(([id]) => id === missile.id);
    assert.equal(staleReceipt.length, 1);
    registry.get('weapons').helpers.removeEntity(missile.id, { immediate: true });
    player.data.cm.effect = null; player.data.cm.effectT = 0;
    fire();
    const replacement = state.entities.get(missile.id);
    assert.notEqual(replacement.occupantGeneration, missile.occupantGeneration);
    const fresh = await lane.tick({ kind: 'tick', tick: 3, steps: 1, commands: [] });
    consume(h, main, fresh);
    const current = main.entities.get(replacement.id);
    const currentData = JSON.stringify(current.data), currentVelocity = JSON.stringify(current.vel);
    applyEntityVitals(main, staleReceipt);
    assert.equal(JSON.stringify(current.data), currentData, 'replacement-before-receipt rejects the old life');
    assert.equal(JSON.stringify(current.vel), currentVelocity);

    const otherOrder = createReadModel(); applySpawnInfos(otherOrder, first.spawnInfos);
    applyEntityVitals(otherOrder, staleReceipt);
    applySpawnInfos(otherOrder, fresh.spawnInfos);
    assert.equal(otherOrder.entities.get(replacement.id).data.targetId, player.id,
      'receipt-before-replacement cannot bleed through a fresh spawn');
    assert.equal(otherOrder.entities.get(replacement.id).occupantGeneration, replacement.occupantGeneration);
    h.system._emitSeekerTells(DT);
    const oldLamp = lamp(h, replacement.id);
    applyDestroyIds(main, [replacement.id]);
    h.system._emitSeekerTells(DT);
    assert.equal(oldLamp.alive, false);
    assert.equal(h.system._seekerTellNext.size, 0);
  } finally { lane.shutdown(); }
});

test('steady accessible pooled marks are bounded, life-owned and cleared by canonical scene/save boundaries', () => {
  const main = createReadModel();
  const infos = [{ entityId: 1, occupantGeneration: 1, type: 'ship', alive: true, x: 0, z: 0, data: {} }];
  for (let i = 0; i < 140; i++) infos.push({ entityId: i + 2, occupantGeneration: i + 2,
    type: 'projectile', alive: true, x: 100 + i, z: 0, radius: 2,
    data: { kind: 'missile', turnRate: 1.5, targetId: 1, targetGeneration: 1 } });
  applySpawnInfos(main, infos);
  const h = renderer(main, 1);
  h.system._emitSeekerTells(DT);
  assert.equal(h.system._seekerTellNext.size, SEEKER_TELL_MAX_ACTIVE);
  assert.equal(h.system._liveSpriteCount, SEEKER_TELL_MAX_ACTIVE);
  const entry = h.system._seekerTellNext.get(2), sprite = entry.sprite;
  for (let i = 1; i <= 60; i++) {
    h.state.simTime = i / 60;
    h.system._emitSeekerTells(DT);
    h.system._integrateSprites(DT);
    assert.equal(h.system._seekerTellNext.get(2), entry);
    assert.equal(lamp(h, 2), sprite, 'reduced flash is steady, not a repeated birth/fade');
  }
  assert.equal(h.system._liveSpriteCount, SEEKER_TELL_MAX_ACTIVE);
  applySpawnInfos(main, [{ ...infos[0], occupantGeneration: 900 }]);
  h.system._emitSeekerTells(DT);
  assert.deepEqual(colorOf(lamp(h, 2)), color(SEEKER_TELL_COLOR_OTHER), 'recycled player life never inherits hot targeting');
  for (const event of ['save:restoring', 'save:loaded', 'sector:exit', 'sector:enter', 'game:new', 'game:exitToMenu']) {
    h.system._emitSeekerTells(DT);
    h.bus.emit(event, {});
    assert.equal(h.system._seekerTellNext.size, 0, event);
    assert.equal(h.system._liveSpriteCount, 0, event);
  }
  let normalEdges = 0, reducedEdges = 0;
  for (let i = 1; i < 180; i++) {
    normalEdges += seekerTellLit(7, i / 60) !== seekerTellLit(7, (i - 1) / 60);
    reducedEdges += seekerTellLit(7, i / 60, true) !== seekerTellLit(7, (i - 1) / 60, true);
    assert.equal(seekerTellLit(7, i / 60, false, true), true);
  }
  assert.ok(reducedEdges < normalEdges);
  assert.equal(SEEKER_TELL_PERIOD_S * SEEKER_TELL_REDUCED_PERIOD_MUL, 1.08);
});

test('retiring the final seeker publishes an empty instanced draw immediately', () => {
  const main = createReadModel();
  applySpawnInfos(main, [
    { entityId: 1, occupantGeneration: 1, type: 'ship', alive: true, x: 0, z: 0, data: {} },
    { entityId: 2, occupantGeneration: 2, type: 'projectile', alive: true, x: 100, z: 0, radius: 2,
      data: { kind: 'missile', turnRate: 1.5, targetId: 1, targetGeneration: 1 } },
  ]);
  const h = renderer(main, 1);
  h.system._emitSeekerTells(DT);
  h.system._integrateSprites(0);
  assert.equal(h.system._spriteBatches.glow.mesh.count, 1, 'the actual instanced publisher contains the warning');
  applyDestroyIds(main, [2]);
  h.system._emitSeekerTells(DT);
  assert.equal(h.system._liveSpriteCount, 0);
  assert.equal(h.system._spriteBatches.glow.mesh.count, 0, 'CPU retirement cannot leave a previous draw alive');
});
