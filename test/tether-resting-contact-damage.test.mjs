import assert from 'node:assert/strict';
import test from 'node:test';

import { makeEntity } from '../src/core/entity.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createSg02CombatPhysicsPort, createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { createCombatKernel } from '../src/combat/kernel.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { aftermathWrecks } from '../src/systems/aftermathWrecks.js';

const DT = 1 / 60;

async function pinBox(mass) {
  const state = createGameState(231);
  state.mode = 'flight';
  state.world.currentSectorId = 'tether-contact-test';
  const bus = createBus();
  const helpers = { spawnEntity(spec) {
    const entity = makeEntity(spec);
    entity.id = state.nextEntityId++;
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
    return entity;
  } };
  const body = (type, x, bodyMass, dynamic = true) => helpers.spawnEntity({
    type, team: 1, pos: { x, z: 0 }, vel: { x: 0, z: 0 },
    radius: 6, mass: bodyMass, hull: 10000, hullMax: 10000, collides: true,
    physicsBody: { schemaVersion: 1, shape: 'ball', radius: 6, mass: bodyMass,
      inertiaY: bodyMass * 18, dynamic, ccd: false }, data: {},
  });
  const winch = body('station', -80, 100000, false);
  const wall = body('wreck', -12, 100000, false);
  const box = body('wreck', 0, mass);
  const owner = await createSg02DynamicBodyOwner({ fixedDt: DT, publishTelemetry: false });
  helpers.combatPhysics = createSg02CombatPhysicsPort(owner);
  const kernel = createCombatKernel({ state, bus, helpers });
  const consequences = Object.create(collisionConsequences);
  consequences.init({ state, bus, helpers, registry: { get: id => id === 'combat' ? { kernel } : null } });
  const aftermath = Object.assign(Object.create(aftermathWrecks), { state, bus, helpers });
  bus.on('physics:impact', payload => aftermath._shedImpactChips(payload));
  const impacts = [], damage = [], chips = [];
  bus.on('physics:impact', payload => {
    if (payload.aId === box.id || payload.bId === box.id) impacts.push({ tick: state.tick,
      closing: payload.preSolveClosingSpeed, deltaV: payload.impulse / mass });
  });
  bus.on('combat:damage', payload => {
    if (payload.targetId === box.id) damage.push({ tick: state.tick, amount: payload.hullDamage });
  });
  bus.on('collision:tearOff', payload => {
    if (payload.victimId === box.id) chips.push({ tick: state.tick, count: payload.pieceCount });
  });
  let maxTension = 0;
  try {
    owner.syncFromEntities(state.entityList);
    const def = ATTACHMENT_DEFS.find(def => def.id === 'tether_standard');
    assert.ok(owner.createAttachment({ attachmentId: 'pinned-line', defId: def.id,
      ownerId: winch.id, targetId: box.id, sourceWorld: winch.pos, targetWorld: box.pos,
      restLength: 30, spring: def.spring, break: def.break, tick: 0 }));
    for (let tick = 1; tick <= 180; tick++) {
      state.tick = tick;
      state.simTime = tick * DT;
      owner.step(DT);
      maxTension = Math.max(maxTension, owner.getAttachmentTelemetry({ attachmentId: 'pinned-line' })?.tension || 0);
      for (const impact of owner.drainContactImpacts()) bus.emit('physics:impact', {
        ...impact, tick, consequenceKernelVersion: 1,
      });
      consequences.update(DT, state);
      bus.flush();
    }
    const softTicks = new Set(impacts.filter(impact => impact.closing <= 8).map(impact => impact.tick));
    return { mass, maxTension, contacts: impacts.length,
      maxClosing: Math.max(0, ...impacts.map(impact => impact.closing)),
      maxDeltaV: Math.max(0, ...impacts.map(impact => impact.deltaV)),
      softContacts: softTicks.size, damagePackets: damage.length,
      softDamage: damage.filter(packet => softTicks.has(packet.tick)),
      softChips: chips.filter(packet => softTicks.has(packet.tick)),
      hull: box.hull, chipCount: chips.reduce((sum, packet) => sum + packet.count, 0) };
  } finally {
    consequences.destroy();
    kernel.dispose();
    owner.dispose();
  }
}

test('tension against a resting wreck contact does not fracture from solver support impulse', async t => {
  const previous = { consequences: COMBAT_FLAGS.weaponImpulseConsequences, tumble: COMBAT_FLAGS.tumbleFling };
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  COMBAT_FLAGS.tumbleFling = true;
  try {
    for (const mass of [2, 24, 80]) {
      const result = await pinBox(mass);
      t.diagnostic(JSON.stringify(result));
      assert.ok(result.contacts > 0, 'the diagnostic must exercise actual native contacts');
      assert.ok(result.maxTension > 1000, 'the diagnostic must hold meaningful line tension');
      assert.equal(result.softDamage.length, 0, 'a low closing-speed contact must not take impact damage');
      assert.equal(result.softChips.length, 0, 'a low closing-speed contact must not shed physical chips');
    }
  } finally {
    COMBAT_FLAGS.weaponImpulseConsequences = previous.consequences;
    COMBAT_FLAGS.tumbleFling = previous.tumble;
  }
});
