import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { scanner } from '../src/systems/scanner.js';

function fixture() {
  const player = { id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, data: {} };
  const target = { id: 2, type: 'ship', alive: true, team: 2,
    occupantGeneration: 10, pos: { x: 120, z: 0 }, vel: { x: 0, z: 0 },
    data: { trafficRole: 'patrol', callsign: 'CONCORD SEVEN', ai: { passive: true, lawful: true,
      spawnContext: 'patrol' } } };
  const state = { mode: 'flight', tick: 600, simTime: 10, playerId: player.id,
    player: { targetId: target.id, heat: 0, credits: 500 }, input: { actions: {} },
    entities: new Map([[player.id, player], [target.id, target]]), entityList: [player, target],
    world: { currentSectorId: 'sector_inference26_hail' }, factions: {}, pirateParley: { squads: {} } };
  const bus = createBus(), offers = [], responses = [], cleared = [];
  bus.on('contactHail:offer', event => offers.push(event));
  bus.on('contactHail:response', event => responses.push(event));
  bus.on('contactHail:clear', event => cleared.push(event));
  const system = Object.create(scanner); system.init({ state, bus });
  bus.emit('contactHail:request', { targetId: target.id });
  return { state, bus, system, target, offers, responses, cleared };
}

test('a stale hail choice cannot act on a same-kind ship holding the recycled target id', () => {
  const h = fixture();
  try {
    const offer = h.offers.at(-1); assert.ok(offer);
    h.target.alive = false;
    const replacement = { ...h.target, alive: true, occupantGeneration: 11,
      data: { ...h.target.data, callsign: 'CONCORD EIGHT' } };
    h.state.entities.set(replacement.id, replacement);
    h.state.entityList[1] = replacement;
    h.bus.emit('contactHail:choice', { requestId: offer.requestId, targetId: offer.targetId, choice: 'status' });
    assert.equal(h.responses.length, 0);
    assert.equal(h.cleared.at(-1).reason, 'choice_invalid');
    h.bus.emit('contactHail:request', { targetId: replacement.id });
    const fresh = h.offers.at(-1);
    assert.notEqual(fresh.requestId, offer.requestId, 'a retry in the same tick owns a new conversation');
    h.bus.emit('contactHail:choice', { requestId: offer.requestId, targetId: offer.targetId, choice: 'status' });
    assert.equal(h.responses.length, 0, 'an old choice cannot satisfy the freshly reopened conversation');
    h.bus.emit('contactHail:choice', { requestId: fresh.requestId, targetId: fresh.targetId, choice: 'status' });
    assert.equal(h.responses.length, 1, 'a fresh hail to the replacement remains usable');
  } finally { h.system.destroy(); }
});

test('availability polling retires a conversation when its body is replaced', () => {
  const h = fixture();
  try {
    h.state.entities.set(h.target.id, { ...h.target, occupantGeneration: 11 });
    h.system._updateContactHail(h.state);
    assert.equal(h.system._contactHail, null);
    assert.equal(h.cleared.at(-1).reason, 'availability_lost');
  } finally { h.system.destroy(); }
});
