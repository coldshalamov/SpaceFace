// SFQ-B032 — every named class has an explicit yes/no. Machines are a refusal,
// not a type the scan forgot. Seed 4242 on the live drop.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { BOMB_DEFS, BOMB_DRIFT } from '../src/data/bombs.js';
import { bombs, ordnanceClassVerdict, proximityTriggerEligible } from '../src/systems/bombs.js';

const SEED = 4242;
const DT = 1 / 60;

function ent(type, extra = {}) {
  return { type, alive: true, id: extra.id ?? 1, team: extra.team, ...extra };
}

test('the class matrix names machine, wreck, pickup, fauna, craft, and station', () => {
  const machine = ordnanceClassVerdict(ent('machine', { physicsBody: false, collides: false }));
  assert.equal(machine.reason, 'scripted_kinematic');
  assert.equal(machine.damage, false);
  assert.equal(machine.shove, false);
  assert.equal(machine.status, false);
  assert.equal(machine.trigger, false);

  const wreck = ordnanceClassVerdict(ent('wreck', { physicsBody: { dynamic: true, mass: 80 } }));
  assert.equal(wreck.damage, false);
  assert.equal(wreck.shove, true);
  assert.equal(wreck.status, false);
  assert.equal(wreck.trigger, false);

  const kinematicWreck = ordnanceClassVerdict(ent('wreck', { physicsBody: false }));
  assert.equal(kinematicWreck.shove, false, 'a scripted wreck is not shoved');

  const pickup = ordnanceClassVerdict(ent('pickup', { physicsBody: { dynamic: true, mass: 4 } }));
  assert.equal(pickup.damage, false);
  assert.equal(pickup.shove, true);
  assert.equal(pickup.status, false);

  const fauna = ordnanceClassVerdict(ent('fauna', { physicsBody: { dynamic: true, mass: 20 } }));
  assert.equal(fauna.damage, true);
  assert.equal(fauna.status, false);
  assert.equal(fauna.shove, true);
  assert.equal(fauna.trigger, false);
  const stillFauna = ordnanceClassVerdict(ent('fauna', { physicsBody: false }));
  assert.equal(stillFauna.damage, true);
  assert.equal(stillFauna.shove, false, 'ecology-owned fauna are not blasted into motion');

  const ship = ordnanceClassVerdict(ent('ship'));
  assert.equal(ship.damage, true);
  assert.equal(ship.status, true);
  assert.equal(ship.trigger, true);
  assert.equal(ship.shove, true);

  const station = ordnanceClassVerdict(ent('station'));
  assert.equal(station.damage, true);
  assert.equal(station.status, true);
  assert.equal(station.trigger, false);
  assert.equal(station.shove, false);

  assert.equal(ordnanceClassVerdict(null).reason, 'missing');
});

test('proximity cooks a hostile craft and never the owner, an ally, or a machine', () => {
  const bomb = { team: 0 };
  const hostile = ent('ship', { id: 2, team: 1 });
  const ally = ent('ship', { id: 3, team: 0 });
  const owner = ent('ship', { id: 1, team: 0 });
  const machine = ent('machine', { id: 9, team: 1 });
  const station = ent('station', { id: 4, team: 1 });
  assert.equal(proximityTriggerEligible(hostile, bomb, 1), true);
  assert.equal(proximityTriggerEligible(ally, bomb, 1), false);
  assert.equal(proximityTriggerEligible(owner, bomb, 1), false);
  assert.equal(proximityTriggerEligible(machine, bomb, 1), false);
  assert.equal(proximityTriggerEligible(station, bomb, 1), false);
  assert.equal(proximityTriggerEligible({ ...hostile, alive: false }, bomb, 1), false);
});

test('seed 4242: a machine beside the blast is not hit and does not cook the fuze', () => {
  const state = createGameState(SEED);
  state.mode = 'flight';
  state.simTime = 0;
  state.playerId = 1;
  const player = {
    id: 1, type: 'ship', alive: true, team: 0, mass: 32, radius: 6, rot: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
  };
  const machine = {
    id: 9, type: 'machine', alive: true, team: 1, physicsBody: false, collides: false,
    pos: { x: -8, z: 0 }, vel: { x: 0, z: 0 }, radius: 4, mass: 1,
  };
  state.entities.set(1, player);
  state.entities.set(9, machine);
  state.entityList = [player, machine];
  const bus = createBus();
  const routed = [];
  const detonated = [];
  bus.on('bombs:detonated', (p) => detonated.push(p));
  let nextId = 50;
  const system = Object.create(bombs);
  system.init({
    state,
    bus,
    helpers: {
      spawnEntity(spec) {
        const entity = { id: nextId++, alive: true, hull: 1, hullMax: 1, ...spec };
        state.entities.set(entity.id, entity);
        state.entityList.push(entity);
        return entity;
      },
      routeCombatDamage(req) { routed.push(req); return { ok: true }; },
      combatPhysics: { applyImpulse() { return true; } },
    },
  });
  const selectedId = 'bomb_frag';
  const def = BOMB_DEFS[selectedId];
  const rt = state.bombs;
  rt.rack.cells[0] = { id: selectedId, count: def.magazine };
  rt.selectedId = selectedId;
  state.input.actions = { dropBomb: true };
  // Past bomb_frag's 6s fuze. A machine beside the bay must not cook it early.
  for (let i = 0; i < 380; i++) {
    state.simTime += DT;
    state.tick += 1;
    system.update(DT, state);
  }
  assert.equal(detonated.length, 1);
  assert.equal(detonated[0].trigger, 'fuze', 'a machine must not proximity-cook the bay');
  assert.equal(detonated[0].hits.includes(9), false);
  assert.equal(routed.some((r) => r.targetId === 9), false);
  assert.equal(machine.alive, true);
  assert.ok(BOMB_DRIFT.armS > 0);
  bus.clear();
});
