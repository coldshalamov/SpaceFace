import test from 'node:test';
import assert from 'node:assert/strict';

import { bountyHunt as bountyBase } from '../src/systems/bountyHunt.js';

function busHarness() {
  const log = [];
  return {
    log,
    on() { return () => {}; },
    emit(name, payload) { log.push({ name, payload }); },
  };
}

function boot(trickId, hull) {
  const hunter = {
    id: 'hunter-1',
    alive: true,
    type: 'ship',
    hull,
    shield: 40,
    shieldMax: 40,
    pos: { x: 0, z: 0 },
    team: 1,
    factionId: 'faction_reach',
    data: {
      contractTargetId: 'player',
      bountyHunt: {
        role: 'hunter',
        contractId: 'bounty:4242',
        pursuing: true,
        trickId,
        trickState: {
          trickId,
          phase: 'telegraphing',
          counterWindowS: 1.75,
          telegraphedAt: 8,
          activatesAt: 9,
          activatedAt: null,
          readyAt: 0,
          activationCount: 0,
          lastVerb: null,
          telegraphHull: 100,
          telegraphShield: 40,
        },
      },
    },
  };
  const state = {
    simTime: 10,
    tick: 600,
    mode: 'flight',
    meta: { seed: 4242 },
    playerId: 'player',
    entities: new Map([
      ['player', { id: 'player', alive: true, type: 'ship', pos: { x: 40, z: 0 } }],
      [hunter.id, hunter],
    ]),
    entityList: [hunter],
    bountyHunt: { outcomes: {}, squads: {} },
  };
  const bus = busHarness();
  const sys = Object.create(bountyBase);
  sys.init({ state, bus, helpers: {}, registry: { get: () => null } });
  return { state, bus, sys, hunter };
}

test('damage during the jump-spool window tells the pilot the interrupt landed, seed 4242', () => {
  const h = boot('emergency-jump-spool', 40);
  h.sys.update(1 / 60, h.state);
  const toast = h.bus.log.find((event) => event.name === 'toast');
  assert.ok(toast, 'the fizzle speaks');
  assert.equal(toast.payload.text, 'Emergency Jump Spool interrupted.');
  assert.equal(h.hunter.data.bountyHunt.trickState.phase, 'cooldown');
  const fizzle = h.bus.log.find((event) => event.name === 'bountyHunt:trickFizzled');
  assert.equal(fizzle.payload.reason, 'damage_interrupt');
  assert.equal(fizzle.payload.trickId, 'emergency-jump-spool');
});

test('a trick that does not promise an interrupt still fires when the hull is hit, seed 4242', () => {
  const h = boot('shield-turtle', 40);
  h.sys.update(1 / 60, h.state);
  const text = h.bus.log.filter((event) => event.name === 'toast').map((event) => event.payload.text).join(' ');
  assert.equal(text.includes('interrupted'), false);
  assert.equal(h.hunter.data.bountyHunt.trickState.phase, 'cooldown');
  assert.ok(h.hunter.data.bountyHunt.trickState.activatedAt != null);
});
