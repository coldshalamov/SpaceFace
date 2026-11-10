import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { barkDirector } from '../src/systems/barkDirector.js';
import { FREIGHT_RAIDER_ESCAPE_REGISTER } from '../src/data/barks.js';

// SF-157 — freight:raiderEscaped is the bounded clue the custody owner emits when a raider
// clears its escape leash: what was taken, who took it, where they were last seen headed.
// The listener names the theft on the comms ribbon and lets a live raider name its own take.

function boot(seed = 4242) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.tick = 0;
  state.simTime = 0;
  const bus = createBus();
  const said = [];
  const comms = [];
  bus.on('comms:log', (p) => comms.push(p));
  const helpers = {
    voice: {
      say(payload) {
        said.push(payload);
        return true;
      },
    },
  };
  core.init({ state, bus, helpers, registry: null });
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true, team: 0, data: {},
  });
  state.playerId = player.id;
  const system = Object.assign({}, barkDirector);
  system.init({ state, bus, helpers, registry: null });
  return { state, helpers, bus, player, system, said, comms };
}

function spawnRaider(h, extra = {}) {
  return h.helpers.spawnEntity({
    type: 'ship',
    pos: { x: 600, z: 0 },
    vel: { x: 40, z: 0 },
    radius: 10, mass: 30, hull: 60, hullMax: 60, collides: true, team: 1,
    factionId: 'faction_reach',
    data: { ai: {}, combat: {}, ...extra },
  });
}

function escapePayload(raider, over = {}) {
  return {
    encounterId: 'enc:test',
    custodyId: 'custody:test',
    raiderId: raider ? raider.id : null,
    qty: 40,
    reason: 'leash',
    manifestId: 'manifest:test',
    freighterKey: 'encounter:enc:test',
    commodityId: 'cmdty_ore_iron',
    raiderIdentityKey: 'raider:test',
    raiderFactionId: 'faction_reach',
    sectorId: 'sec_helios',
    zoneId: null,
    lastObservedPos: { x: 500, z: 0 },
    lastObservedVel: { x: 30, z: 0 },
    escapeTarget: { x: 4000, z: 0 },
    t: 0,
    ...over,
  };
}

test('SF-157: freight:raiderEscaped names the theft on the comms ribbon', () => {
  const h = boot();
  const raider = spawnRaider(h);
  h.bus.emit('freight:raiderEscaped', escapePayload(raider));
  assert.equal(h.comms.length, 1, 'one ledger line for the escape');
  assert.match(h.comms[0].text, /40 units of Iron Ore/);
  assert.match(h.comms[0].text, /headed east/, 'the bounded clue keeps the last bearing');
  assert.equal(h.comms[0].kind, 'cargo');
});

test('SF-157: a live raider names its own take in the getaway register', () => {
  const h = boot();
  const raider = spawnRaider(h);
  h.bus.emit('freight:raiderEscaped', escapePayload(raider));
  const barks = h.said.filter((line) => line.channel === 'bark');
  assert.equal(barks.length, 1, 'exactly one getaway bark');
  assert.equal(barks[0].id, `barkDirector:${raider.id}:freight-escape`);
  assert.ok(FREIGHT_RAIDER_ESCAPE_REGISTER.includes(barks[0].text));
});

test('SF-157: the ledger line still lands when the raider is already gone', () => {
  const h = boot();
  h.bus.emit('freight:raiderEscaped', escapePayload(null));
  assert.equal(h.comms.length, 1, 'the naming does not need a live hull');
  assert.equal(h.said.filter((line) => line.channel === 'bark').length, 0);
});

test('SF-157: one naming per custody — a stale re-emit stays quiet', () => {
  const h = boot();
  const raider = spawnRaider(h);
  const payload = escapePayload(raider);
  h.bus.emit('freight:raiderEscaped', payload);
  h.bus.emit('freight:raiderEscaped', { ...payload, t: 600 });
  assert.equal(h.comms.length, 1);
});

test('SF-157: empty takes and missing custody ids emit nothing', () => {
  const h = boot();
  const raider = spawnRaider(h);
  h.bus.emit('freight:raiderEscaped', escapePayload(raider, { qty: 0 }));
  h.bus.emit('freight:raiderEscaped', escapePayload(raider, { custodyId: null }));
  assert.equal(h.comms.length, 0);
  assert.equal(h.said.filter((line) => line.channel === 'bark').length, 0);
});

test('SF-157: the theft is named by faction short when the hull is unnamed', () => {
  const h = boot();
  h.bus.emit('freight:raiderEscaped', escapePayload(null));
  assert.match(h.comms[0].text, /a Reach raider/);
});
