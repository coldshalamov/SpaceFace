import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { scanReveal } from '../src/systems/scanReveal.js';

function loss(id, overrides = {}) {
  return {
    lossId: id,
    sectorId: 'sector_a',
    assetId: `asset-${id}`,
    factionId: 'faction_dmc',
    kind: 'trader',
    simDay: 0,
    t: 0,
    cargoHint: 'manifest cargo',
    value: 500,
    ...overrides,
  };
}

function wreck(id, x, data = {}) {
  return {
    id, type: 'wreck', alive: true, team: 0,
    pos: { x, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
    radius: 8, mass: 100, hull: 1, hullMax: 1,
    data: {
      wreckClass: 'debris',
      wreckClassLabel: 'Scattered debris',
      scanLabel: 'Debris',
      ...data,
    },
  };
}

function boot() {
  const state = createGameState(31);
  state.mode = 'flight';
  state.playerId = 1;
  state.simTime = 1300; // day 2: losses from day 0 read "2 days ago"
  state.world = state.world || {};
  state.world.currentSectorId = 'sector_a';
  state.world.sectors = { sector_a: { id: 'sector_a', name: 'Sector A', security: 0.8 } };
  state.lossLedger = {
    bySector: { sector_a: [loss('loss_x1'), loss('loss_x2'), loss('loss_x3'), loss('loss_x4')] },
    entries: [],
    seed: 1,
  };
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
    radius: 8, mass: 12, hull: 100, hullMax: 100, data: {},
  };
  state.entities.set(1, player);
  state.entityList = [player];
  const bus = createBus();
  const system = Object.create(scanReveal);
  system.init({ state, bus });
  return { state, bus, system, player };
}

function addWreck(state, entity) {
  state.entities.set(entity.id, entity);
  state.entityList.push(entity);
  return entity;
}

function pulse(bus, x = 0, z = 0) {
  bus.emit('scan:pulse', { pos: { x, z } });
}

function teardown(system, bus) {
  system.destroy?.();
  bus.clear();
}

test('one pulse resolves contact, identified, and deep tiers by range', () => {
  const { state, bus, system } = boot();
  try {
    const revealed = [];
    bus.on('scan:wreckRevealed', (p) => revealed.push(p));
    addWreck(state, wreck(10, 1500, { provenance: { lossId: 'loss_x1' } }));
    addWreck(state, wreck(11, 800, { provenance: { lossId: 'loss_x2' } }));
    addWreck(state, wreck(12, 300, {
      provenance: { lossId: 'loss_x3' },
      salvagePool: { cmdty_medical: 4, cmdty_scrap_metal: 2 },
    }));
    pulse(bus);

    const contact = state.entities.get(10).data.scanRevealed;
    assert.equal(contact.quality, 'contact');
    assert.equal(contact.story, null);
    assert.equal(contact.wreckLabel, 'Scattered debris');

    const identified = state.entities.get(11).data.scanRevealed;
    assert.equal(identified.quality, 'identified');
    assert.equal(identified.lossId, 'loss_x2');
    assert.match(identified.story, /Drift hauler went dark near Sector A/);
    assert.equal(identified.daysAgo, 2);
    assert.equal(identified.salvageHint, null);

    const deep = state.entities.get(12).data.scanRevealed;
    assert.equal(deep.quality, 'deep');
    assert.match(deep.story, /Drift hauler went dark/);
    assert.equal(deep.salvageHint, 'cmdty_medical (6u aboard)');
    assert.equal(deep.cold, false);
    assert.equal(revealed.length, 3);
  } finally {
    teardown(system, bus);
  }
});

test('generic debris never borrows a story, but its manifest still reads', () => {
  const { state, bus, system } = boot();
  try {
    addWreck(state, wreck(20, 300, { salvagePool: { cmdty_ore_iron: 5 } }));
    pulse(bus);
    const reveal = state.entities.get(20).data.scanRevealed;
    assert.equal(reveal.quality, 'deep');
    assert.equal(reveal.lossId, null);
    assert.equal(reveal.story, null);
    assert.equal(reveal.salvageHint, 'cmdty_ore_iron (5u aboard)');
  } finally {
    teardown(system, bus);
  }
});

test('provenance pointing at no ledger entry reads class-only', () => {
  const { state, bus, system } = boot();
  try {
    addWreck(state, wreck(21, 800, { provenance: { lossId: 'loss_pruned' } }));
    pulse(bus);
    const reveal = state.entities.get(21).data.scanRevealed;
    assert.equal(reveal.quality, 'identified');
    assert.equal(reveal.lossId, 'loss_pruned');
    assert.equal(reveal.story, null);
  } finally {
    teardown(system, bus);
  }
});

test('a deep reveal investigates once and the memory sticks', () => {
  const { state, bus, system } = boot();
  try {
    const investigated = [];
    bus.on('scan:wreckInvestigated', (p) => investigated.push(p));
    addWreck(state, wreck(30, 300, {
      provenance: { lossId: 'loss_x1' },
      salvagePool: { cmdty_food: 2 },
    }));
    pulse(bus);
    assert.equal(investigated.length, 1);
    assert.equal(investigated[0].lossId, 'loss_x1');
    assert.match(investigated[0].story, /went dark/);
    assert.ok(state.scanReveal.investigated.loss_x1);
    const firstAt = state.entities.get(30).data.scanRevealed.revealedAt;
    pulse(bus);
    assert.equal(investigated.length, 1);
    assert.equal(state.entities.get(30).data.scanRevealed.revealedAt, firstAt);
  } finally {
    teardown(system, bus);
  }
});

test('an investigated wreck is recognized at contact range on later pulses', () => {
  const { state, bus, system } = boot();
  try {
    addWreck(state, wreck(31, 300, { provenance: { lossId: 'loss_x2' } }));
    pulse(bus);
    assert.equal(state.entities.get(31).data.scanRevealed.quality, 'deep');
    // Fly 1500 out and pulse again: contact tier, but the story rides along.
    pulse(bus, 1800, 0);
    const reveal = state.entities.get(31).data.scanRevealed;
    assert.equal(reveal.quality, 'contact');
    assert.equal(reveal.recognized, true);
    assert.match(reveal.story, /went dark/);
  } finally {
    teardown(system, bus);
  }
});

test('surveying three wrecks in a sector toasts the milestone exactly once', () => {
  const { state, bus, system } = boot();
  try {
    const toasts = [];
    bus.on('toast', (p) => toasts.push(p));
    addWreck(state, wreck(40, 200, { provenance: { lossId: 'loss_x1' } }));
    addWreck(state, wreck(41, 250, { provenance: { lossId: 'loss_x2' } }));
    addWreck(state, wreck(42, 300, { provenance: { lossId: 'loss_x3' } }));
    addWreck(state, wreck(43, 350, { provenance: { lossId: 'loss_x4' } }));
    pulse(bus);
    const survey = toasts.filter((t) => /Debris field surveyed/.test(t.text));
    assert.equal(survey.length, 1);
    assert.match(survey[0].text, /3 wrecks identified in Sector A/);
    pulse(bus);
    assert.equal(toasts.filter((t) => /Debris field surveyed/.test(t.text)).length, 1);
  } finally {
    teardown(system, bus);
  }
});

test('a picked-clean wreck reads cold at deep range', () => {
  const { state, bus, system } = boot();
  try {
    addWreck(state, wreck(50, 300, {
      provenance: { lossId: 'loss_x1' },
      salvagePool: {},
    }));
    pulse(bus);
    const reveal = state.entities.get(50).data.scanRevealed;
    assert.equal(reveal.quality, 'deep');
    assert.equal(reveal.cold, true);
    assert.equal(reveal.salvageHint, 'picked clean');
    assert.match(reveal.story, /went dark/);
  } finally {
    teardown(system, bus);
  }
});

test('intervention wrecks carry their cause into the deep reveal', () => {
  const { state, bus, system } = boot();
  try {
    addWreck(state, wreck(51, 300, {
      provenance: { lossId: 'loss_x1' },
      interventionCause: 'raided',
      salvagePool: { cmdty_scrap_metal: 1 },
    }));
    pulse(bus);
    const reveal = state.entities.get(51).data.scanRevealed;
    assert.equal(reveal.cause, 'raided');
  } finally {
    teardown(system, bus);
  }
});

test('ship reveals still work unchanged alongside the wreck pass', () => {
  const { state, bus, system } = boot();
  try {
    const ships = [];
    bus.on('scan:shipRevealed', (p) => ships.push(p));
    const ship = {
      id: 60, type: 'ship', alive: true, team: 1,
      pos: { x: 500, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
      radius: 10, mass: 12, hull: 80, hullMax: 80, factionId: 'faction_reach',
      data: { defId: 'ship_kestrel', weapons: [] },
    };
    state.entities.set(60, ship);
    state.entityList.push(ship);
    addWreck(state, wreck(61, 500, { provenance: { lossId: 'loss_x1' } }));
    pulse(bus);
    assert.equal(ships.length, 1);
    assert.equal(ships[0].quality, 'full');
    assert.ok(state.entities.get(61).data.scanRevealed);
  } finally {
    teardown(system, bus);
  }
});
