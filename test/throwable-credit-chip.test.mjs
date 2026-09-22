import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { effectiveTetherPolicy } from '../src/combat/attachments.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { CREDIT_CHIP_KIND } from '../src/data/killRewards.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { mining } from '../src/systems/mining.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalRewards } from '../src/systems/survivalRewards.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { isAttachable } from '../src/systems/tetherGameplay.js';

const SEED = 606;
const ARENA = 'helios_core';
const DT = 1 / 60;

test('a killed light hostile drops one credit chip that the Massline can throw before collection', async () => {
  const state = createGameState(SEED);
  state.player.credits = 1000;
  const bus = createBus();
  const player = {
    id: 1, type: 'ship', team: 0, alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    radius: 4, mass: 26, maxSpeed: 218, flags: {}, data: {},
    physicsBody: { schemaVersion: 1, radius: 4, mass: 26, inertiaY: 64, dynamic: true, ccd: true, revision: 0 },
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.nextEntityId = 2;

  const spawned = [];
  const spawnEntity = (spec) => {
    const entity = {
      ...spec,
      id: state.nextEntityId++,
      alive: true,
      pos: { ...(spec.pos || { x: 0, z: 0 }) },
      vel: { ...(spec.vel || { x: 0, z: 0 }) },
      data: spec.data ? { ...spec.data } : {},
      flags: spec.flags ? { ...spec.flags } : {},
    };
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
    spawned.push(entity);
    bus.emit('entity:spawned', { id: entity.id, type: entity.type, entity });
    return entity;
  };

  const ctx = { state, bus, helpers: { spawnEntity }, registry: null };
  runSession.init(ctx);
  survivalRewards.init(ctx);
  mining.init(ctx);

  const runtime = await createSg02DynamicBodyOwner({ fixedDt: DT, quantum: 1e-5, mode: 'rapier-dynamic' });
  try {
    bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'scored', seed: SEED, arenaId: ARENA });
    let from = 'loadout';
    for (const next of ['arena_intro', 'wave_intro', 'active']) {
      bus.emit('run:transitionRequested', { expectedPhase: from, nextPhase: next, reason: 't', tick: 0 });
      from = next;
    }
    bus.emit('run:wavePlanned', {
      wave: 1,
      plan: planWave({ seed: SEED, arenaId: ARENA, wave: 1, act: 0, difficulty: 1, mutators: [], buildSummary: null }),
    });

    const hostile = spawnEntity({
      type: 'ship', team: 1, pos: { x: 30, z: 10 }, vel: { x: 1, z: 2 },
      data: { level: 1, runWave: 1, runCohort: 'survival' },
    });
    hostile.alive = false;
    bus.emit('entity:killed', { id: hostile.id, killerId: player.id, type: 'ship', pos: { x: 30, z: 10 } });

    const chips = spawned.filter((e) => e.alive && e.type === 'pickup' && e.data && e.data.kind === CREDIT_CHIP_KIND);
    assert.equal(chips.length, 1, 'the kill must drop exactly one credit chip pickup');
    const chip = chips[0];
    const chipAmount = chip.data.amount;
    assert.ok(chipAmount > 0, `chip must carry a positive amount, got ${chipAmount}`);
    assert.equal(state.run.credits, 0, 'nothing is paid while the chip is on the board');
    assert.equal(state.player.credits, 1000);
    assert.equal(isAttachable(chip, player.id), true, 'a credit chip is a legal Massline target');
    assert.ok(chip.mass < player.mass, `chip mass ${chip.mass} must stay under the ship's ${player.mass}`);
    assert.ok(Number.isFinite(chip.data.despawnAt), 'the chip keeps its ordinary finite despawn timer');

    chip.pos.x = 100; chip.pos.z = 0;
    chip.vel.x = 0; chip.vel.z = 45;
    const speedBefore = Math.hypot(chip.vel.x, chip.vel.z);
    const policy = effectiveTetherPolicy(
      ATTACHMENT_DEFS.find((d) => d.id === 'tether_standard'),
      { data: { derived: { masslineHeadId: 'tractor' } } },
      PRODUCTION_FEATURES,
    );
    runtime.syncFromEntities([player, chip]);
    const handle = runtime.createAttachment({
      attachmentId: 'credit-chip-throw', defId: 'tether_standard',
      ownerId: player.id, targetId: chip.id,
      sourceWorld: player.pos, targetWorld: chip.pos,
      restLength: 80, spring: policy.spring, tick: 0,
    });
    assert.ok(handle, 'the Massline must latch the chip');

    for (let tick = 0; tick < 60; tick += 1) runtime.step(DT);
    for (let i = 0; i < 10; i += 1) {
      runtime.setAttachmentReel({ attachmentId: 'credit-chip-throw', restLength: 80 - 50 * ((i + 1) / 10) });
      for (let tick = 0; tick < 12; tick += 1) runtime.step(DT);
    }
    for (let tick = 0; tick < 90; tick += 1) runtime.step(DT);
    runtime.cutAttachment({ attachmentId: 'credit-chip-throw' });
    for (let tick = 0; tick < 30; tick += 1) runtime.step(DT);

    const speedAfter = Math.hypot(chip.vel.x, chip.vel.z);
    assert.ok(Math.abs(speedAfter - speedBefore) >= 20,
      `the swing must change the chip's speed by at least 20 WU/s (got ${speedBefore.toFixed(1)} -> ${speedAfter.toFixed(4)})`);
    assert.equal(chip.alive, true, 'the throw does not destroy the chip');
    assert.equal(chip.data.amount, chipAmount, 'the chip keeps its value through the throw');
    assert.equal(state.run.credits, 0, 'still unpaid before collection');
    assert.equal(state.player.credits, 1000);
    console.log(`CREDIT_CHIP_THROW speedBefore=${speedBefore.toFixed(1)} speedAfter=${speedAfter.toFixed(4)} amount=${chipAmount} paidBeforeCollection=0`);

    bus.emit('pickup:collected', {
      pickupId: chip.id, collectorId: player.id, kind: CREDIT_CHIP_KIND,
      amount: chipAmount, credits: chipAmount, wallet: chip.data.wallet,
      pos: { x: chip.pos.x, z: chip.pos.z },
    });
    assert.equal(state.run.credits, chipAmount, 'the scoop settles the chip into the run wallet');
    assert.equal(state.player.credits, 1000, 'campaign credits are never touched');
    assert.equal(chip.data.amount, chipAmount);

    bus.emit('pickup:collected', {
      pickupId: chip.id, collectorId: player.id, kind: CREDIT_CHIP_KIND,
      amount: chipAmount, credits: chipAmount, wallet: chip.data.wallet,
      pos: { x: chip.pos.x, z: chip.pos.z },
    });
    assert.equal(state.run.credits, chipAmount, 'a second collection receipt cannot pay twice');
  } finally {
    runtime.dispose();
    if (typeof mining.destroy === 'function') mining.destroy();
    else mining.bus = null;
    if (typeof survivalRewards.destroy === 'function') survivalRewards.destroy();
    if (typeof runSession.destroy === 'function') runSession.destroy();
  }
});
