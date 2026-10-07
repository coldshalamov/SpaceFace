import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { wingMorale } from '../src/systems/wingMorale.js';

// Wing morale owns two silent tactical beats beside the authored SQUAD BROKEN call: the ward
// that goes berserk when its escort dies, and the squad whose reinforcement call dies with
// its comms subsystem. Both now voice on the same info/combat channel.

function boot(seed = 4242, withVoice = true) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.tick = 0;
  state.simTime = 0;
  const bus = createBus();
  const said = [];
  const events = [];
  bus.on('wingMorale:enraged', (p) => events.push({ kind: 'enraged', p }));
  bus.on('wingMorale:reinforcementBlocked', (p) => events.push({ kind: 'blocked', p }));
  const helpers = {
    voice: withVoice ? {
      say(payload) {
        said.push(payload);
        return true;
      },
    } : {},
  };
  core.init({ state, bus, helpers, registry: null });
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true, team: 0, data: {},
  });
  state.playerId = player.id;
  const system = Object.create(wingMorale);
  system.init({ state, bus, helpers, registry: null });
  return { state, helpers, bus, player, system, said, events };
}

function spawnShip(h, data) {
  return h.helpers.spawnEntity({
    type: 'ship',
    pos: { x: 500, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 10, mass: 30, hull: 60, hullMax: 60, collides: true, team: 1,
    factionId: 'faction_reach',
    data,
  });
}

test('wing morale: killing an escort voices the ward going enraged', () => {
  const h = boot();
  const ward = spawnShip(h, { ai: { squadId: 'sq_enr', preferredRole: 'leader' } });
  const escort = spawnShip(h, {
    ai: { preferredRole: 'escort', wardId: ward.id },
  });
  h.bus.emit('entity:killed', { id: escort.id, entityId: escort.id, killerId: h.player.id });
  const enraged = h.said.filter((line) => line.id === `wingMorale:${ward.id}:enraged`);
  assert.equal(enraged.length, 1, 'the enrage names itself once');
  assert.equal(enraged[0].text, 'ENEMY ENRAGED');
  assert.equal(enraged[0].channel, 'info');
  assert.equal(enraged[0].kind, 'combat');
  assert.equal(h.events.filter((e) => e.kind === 'enraged').length, 1);
});

test('wing morale: a dead comms subsystem voices the blocked reinforcement call', () => {
  const h = boot();
  const hull = spawnShip(h, { ai: { squadId: 'sq_com' } });
  h.bus.emit('combat:subsystemDisabled', {
    targetId: hull.id, entityId: hull.id, subsystemId: 'comms', killerId: h.player.id,
  });
  const blocked = h.said.filter((line) => line.id === 'wingMorale:sq_com:reinforcementBlocked');
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0].text, 'REINFORCEMENTS BLOCKED');
  assert.equal(h.events.filter((e) => e.kind === 'blocked').length, 1);
});

test('wing morale: a non-comms subsystem loss stays silent', () => {
  const h = boot();
  const hull = spawnShip(h, { ai: { squadId: 'sq_eng' } });
  h.bus.emit('combat:subsystemDisabled', {
    targetId: hull.id, entityId: hull.id, subsystemId: 'engine', killerId: h.player.id,
  });
  assert.equal(h.said.length, 0);
  assert.equal(h.events.length, 0);
});

test('wing morale: events still fire when the voice surface is absent', () => {
  const h = boot(4242, false);
  const hull = spawnShip(h, { ai: { squadId: 'sq_com2' } });
  h.bus.emit('combat:subsystemDisabled', {
    targetId: hull.id, entityId: hull.id, subsystemId: 'comms_array', killerId: h.player.id,
  });
  assert.equal(h.events.filter((e) => e.kind === 'blocked').length, 1);
});
