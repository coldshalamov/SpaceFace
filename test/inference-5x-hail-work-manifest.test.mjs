/**
 * U3 work hail + U4 manifest cargo value — drive contactHail shipped functions.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  contactHailAvailability,
  createContactHailOffer,
  createContactHailResponse,
  estimateManifestBaseValue,
  livingWorkStatusText,
} from '../src/data/contactHail.js';
import { COMMODITIES } from '../src/data/commodities.js';

function entity(id, overrides = {}) {
  const base = {
    id,
    type: 'ship',
    alive: true,
    team: 2,
    pos: { x: 120, z: 0 },
    vel: { x: 0, z: 0 },
    data: {},
  };
  return {
    ...base,
    ...overrides,
    pos: { ...base.pos, ...(overrides.pos || {}) },
    data: { ...base.data, ...(overrides.data || {}) },
  };
}

function baseState(target) {
  const player = entity('player', { team: 1, pos: { x: 0, z: 0 }, data: {} });
  const entities = new Map([[player.id, player]]);
  if (target) entities.set(target.id, target);
  return {
    mode: 'flight',
    simTime: 10,
    tick: 600,
    playerId: player.id,
    player: {
      team: 1,
      targetId: target && target.id,
      credits: 1000,
      heat: 0,
      activeShipIndex: 0,
      ownedShips: [{
        defId: 'ship_kestrel',
        fittings: [null, null, null, null, null, 'mod_cargo_scanner_s'],
      }],
      cargo: { items: {} },
    },
    entities,
    entityList: [...entities.values()],
  };
}

test('U3: livingWorkStatusText maps causal phase/cue to player language', () => {
  const text = livingWorkStatusText(entity('m', {
    data: {
      ceresCausalEventId: 'ev_rich_seam_strike',
      ceresCausalPhase: 'strike',
      ceresCausalCue: 'blind_cone',
    },
  }));
  assert.equal(text, 'WORK · RICH STRIKE · BLIND CONE');
  assert.equal(livingWorkStatusText(entity('x', { data: {} })), null);
});

test('U3: causal miner is hailable as worker with STATUS work line', () => {
  const miner = entity('miner-1', {
    data: {
      trafficRole: 'miner',
      callsign: 'SEAM ONE',
      ceresCausalEventId: 'ev_rich_seam_strike',
      ceresCausalPhase: 'greed',
      ceresCausalCue: 'blind_cone',
      ai: { passive: true },
      jobId: 'job_seam',
    },
  });
  const state = baseState(miner);
  const avail = contactHailAvailability(state);
  assert.equal(avail.enabled, true);
  assert.equal(avail.kind, 'worker');
  const offer = createContactHailOffer(state, avail, 'req1', 20);
  assert.equal(offer.kind, 'worker');
  assert.ok(offer.actions.some((a) => a.id === 'status'));
  const response = createContactHailResponse(state, offer, 'status');
  assert.ok(response);
  // Hail STATUS goes deeper than panel: phase + tactical means (not just cue codename).
  assert.match(response.lines[0], /STATUS · LOADING HOLD/);
  assert.match(response.lines[0], /SENSORS HALF-BLIND|DO NOT ENTER CUT ARC/);
});

test('U3: salvor identify names chain without cloning STATUS means', () => {
  const salvor = entity('salvor-1', {
    data: {
      trafficRole: 'salvor',
      callsign: 'BONE RAKE',
      ceresCausalEventId: 'ev_cutter_strips_wreck',
      ceresCausalPhase: 'sever',
      ceresCausalCue: 'picking_the_bones',
      ai: { passive: true },
    },
  });
  const state = baseState(salvor);
  const avail = contactHailAvailability(state);
  assert.equal(avail.kind, 'worker');
  const offer = createContactHailOffer(state, avail, 'req2', 20);
  const response = createContactHailResponse(state, offer, 'identify');
  assert.match(response.lines[0], /BONE RAKE/);
  assert.match(response.lines[0], /SALVOR/);
  assert.match(response.lines[0], /CHAIN CUTTER STRIPS WRECK|CUTTER STRIPS WRECK/);
});

test('U3: unstamped miner stays freighter path (U4 MANIFEST still reachable)', () => {
  const miner = entity('miner-plain', {
    data: {
      trafficRole: 'miner',
      callsign: 'ORE BOAT',
      cargoManifest: { lines: [{ commodityId: 'cmdty_ore_iron', qty: 8 }] },
      ai: { passive: true, archetype: 'fleeing_trader' },
    },
  });
  const state = baseState(miner);
  const avail = contactHailAvailability(state);
  assert.equal(avail.kind, 'trader', 'no living stamp → trader channel keeps MANIFEST');
  const offer = createContactHailOffer(state, avail, 'req5', 20);
  assert.ok(offer.actions.some((a) => a.id === 'manifest'));
});

test('U4: estimateManifestBaseValue uses commodity basePrice', () => {
  const iron = COMMODITIES.find((c) => c.id === 'cmdty_ore_iron');
  const food = COMMODITIES.find((c) => c.id === 'cmdty_food' || c.id === 'cmdty_consumer_goods');
  assert.ok(iron);
  const lines = [
    { commodityId: 'cmdty_ore_iron', qty: 10 },
    { commodityId: food ? food.id : 'cmdty_refined_metals', qty: 4 },
  ];
  const estimate = estimateManifestBaseValue({ lines });
  assert.ok(estimate);
  const expected = Math.round(iron.basePrice * 10
    + (food || COMMODITIES.find((c) => c.id === 'cmdty_refined_metals')).basePrice * 4);
  assert.equal(estimate.totalCredits, expected);
  assert.equal(estimate.totalQty, 14);
  assert.equal(estimate.lineCount, 2);
});

test('U4: trader MANIFEST hail includes ~CR value', () => {
  const iron = COMMODITIES.find((c) => c.id === 'cmdty_ore_iron');
  const hauler = entity('hauler-1', {
    data: {
      trafficRole: 'hauler',
      callsign: 'SUNWARD',
      cargoManifest: {
        totalQty: 12,
        lines: [{ commodityId: 'cmdty_ore_iron', qty: 12 }],
      },
      ai: { passive: true, archetype: 'fleeing_trader', spawnContext: 'convoy_civilian' },
    },
  });
  const state = baseState(hauler);
  const avail = contactHailAvailability(state);
  assert.equal(avail.kind, 'trader');
  const offer = createContactHailOffer(state, avail, 'req3', 20);
  const response = createContactHailResponse(state, offer, 'manifest');
  assert.ok(response);
  const expected = iron.basePrice * 12;
  assert.match(response.lines[0], /MANIFEST ·/);
  assert.match(response.lines[0], new RegExp(`${expected.toLocaleString('en-US')} CR|${expected} CR`));
  assert.match(response.lines[0], /IRON ORE/);
});

test('U4: empty manifest stays undisclosed', () => {
  assert.equal(estimateManifestBaseValue({ lines: [] }), null);
  const hauler = entity('hauler-2', {
    data: {
      trafficRole: 'hauler',
      callsign: 'EMPTY',
      cargoManifest: { lines: [] },
      ai: { passive: true, archetype: 'fleeing_trader' },
    },
  });
  const state = baseState(hauler);
  const avail = contactHailAvailability(state);
  const offer = createContactHailOffer(state, avail, 'req4', 20);
  assert.ok(!offer.actions.some((action) => action.id === 'manifest'));
  const response = createContactHailResponse(state, offer, 'manifest');
  assert.equal(response, null);
});
