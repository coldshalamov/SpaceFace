// SFQ-I043 — a refused gate says the remedy the world already computed.
//
// Seed 4242. A tech-gated wormhole names the permit. A story-flag gate stays
// sealed and does not name its destination or its lock. An ordinary neighbor
// jump still charges.
//
// Run: node --test test/infer-p11-gate-remedy.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { world as worldPrototype } from '../src/systems/world.js';
import { jumpAbortText } from '../src/ui/jumpNotice.js';
import { bindJumpDenialToasts } from '../src/ui/toasts.js';

const SEED = 4242;

function harness() {
  const state = createGameState(SEED);
  state.mode = 'flight';
  if (state.ui) state.ui.docked = false;
  state.jump.state = 'IDLE';
  state.jump.cooldownT = 0;
  state.fuel.current = state.fuel.max;
  state.player.credits = 800;
  state.player.researchedNodes = [];
  if (!state.story) state.story = {};
  state.story.flags = {};
  state.world.currentSectorId = 'sector_test_a';
  state.world.sectors = {
    sector_test_a: {
      id: 'sector_test_a',
      name: 'Test Anchor',
      neighbors: ['sector_test_b'],
      security: 0.4,
      position: { x: 0, y: 0 },
    },
    sector_test_b: {
      id: 'sector_test_b',
      name: 'Open Neighbor',
      neighbors: ['sector_test_a'],
      security: 0.4,
      position: { x: 1, y: 0 },
    },
    sector_ashfall_reach: {
      id: 'sector_ashfall_reach',
      name: 'Ashfall Reach',
      neighbors: [],
      security: 0.2,
      position: { x: 4, y: 4 },
    },
    sector_quiet_office: {
      id: 'sector_quiet_office',
      name: 'Quiet Office',
      neighbors: [],
      security: 0.2,
      position: { x: 5, y: 1 },
    },
  };
  const bus = createBus();
  const world = Object.assign({}, worldPrototype);
  world.init({ state, bus, registry: { get: () => null }, helpers: { voice: { say: () => true } } });
  const aborts = [];
  const starts = [];
  const toasts = [];
  bus.on('jump:chargeAbort', (payload) => aborts.push(payload));
  bus.on('jump:chargeStart', (payload) => starts.push(payload));
  bindJumpDenialToasts(bus, () => state);
  bus.on('toast', (toast) => toasts.push(toast));
  return { state, bus, aborts, starts, toasts };
}

function denialText(h) {
  assert.equal(h.aborts.length, 1);
  assert.equal(h.starts.length, 0);
  assert.equal(h.state.jump.state, 'IDLE');
  const said = h.toasts.map((toast) => toast.text).join(' ');
  assert.equal(said, jumpAbortText(h.aborts[0]));
  return said;
}

test('a locked survey gate names the permit and not the destination', () => {
  const h = harness();
  h.state.world.sectors.sector_test_a.wormholeTo = {
    sectorId: 'sector_ashfall_reach',
    gatedBy: 'tech:tech_long_range_survey',
  };
  h.bus.emit('world:requestJump', { targetSectorId: 'sector_ashfall_reach', via: 'gate' });
  const said = denialText(h);
  assert.match(said, /needs Long-Range Survey/);
  assert.match(said, /sealed/);
  assert.equal(/ashfall/i.test(said), false);
  assert.equal(said.includes('tech_'), false);
  assert.equal(said.includes('sector_'), false);
});

test('a story-locked gate does not name its destination or its lock', () => {
  const h = harness();
  h.state.world.sectors.sector_test_a.wormholeTo = {
    sectorId: 'sector_quiet_office',
    gatedBy: 'flag:vale_private_lock',
  };
  h.bus.emit('world:requestJump', { targetSectorId: 'sector_quiet_office', via: 'gate' });
  const said = denialText(h);
  assert.equal(said, 'The wormhole is sealed');
  assert.equal(/quiet office/i.test(said), false);
  assert.equal(said.includes('vale_private_lock'), false);
  assert.equal(said.includes('sector_quiet_office'), false);
  assert.equal(/revok/i.test(said), false);
});

test('an allowed neighbor jump still starts', () => {
  const h = harness();
  const credits = h.state.player.credits;
  h.bus.emit('world:requestJump', { targetSectorId: 'sector_test_b', via: 'gate' });
  assert.equal(h.aborts.length, 0);
  assert.equal(h.toasts.length, 0);
  assert.equal(h.starts.length, 1);
  assert.equal(h.starts[0].targetSectorId, 'sector_test_b');
  assert.equal(h.state.jump.state, 'CHARGING');
  assert.equal(h.state.jump.targetSectorId, 'sector_test_b');
  assert.equal(h.state.jump.via, 'gate');
  assert.equal(h.state.player.credits, credits);
});
