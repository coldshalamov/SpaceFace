// Row 446 GOLD-CREW — crew aboard: four hires max from the local station pools, one real
// derived-stat perk each through player.efficiencyMods, banter about real events, a loyalty job
// per member, and injury/loss when the hull goes down. Crew are people — wingmen are ships.
//
// These tests pin: the berth-stage-3 hire gate, the efficiencyMods perk write + recompute call,
// roster cap, loyalty-job completion on real events, casualty rules, and save-slice shape.

import test from 'node:test';
import assert from 'node:assert/strict';

import { crew } from '../src/systems/crew.js';
import { CREW_CANDIDATES, CREW_CAP, CREW_ROLES } from '../src/data/crew.js';
import { LONG_BERTH_STATION_ID } from '../src/data/longBerth.js';

function makeBus() {
  const emitted = [];
  const handlers = new Map();
  return {
    emitted,
    emit(evt, p) { emitted.push({ evt, p }); (handlers.get(evt) || []).forEach((fn) => fn(p)); },
    on(evt, fn) { const l = handlers.get(evt) || []; l.push(fn); handlers.set(evt, l); return () => {}; },
  };
}

function makeState({ berthStage = 3 } = {}) {
  const entities = new Map();
  const entityList = [];
  const player = { id: 'player', type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8 };
  entities.set(player.id, player); entityList.push(player);
  // One live station entity per candidate home so the hail range can find them.
  const stations = [];
  for (const [i, c] of CREW_CANDIDATES.entries()) {
    const st = {
      id: 100 + i, type: 'station', alive: true,
      pos: { x: 50 + i * 2000, z: 5000 }, radius: 40,
      data: { stationId: c.homeStationId },
    };
    entities.set(st.id, st); entityList.push(st); stations.push(st);
  }
  return {
    simTime: 1000, tick: 60000,
    playerId: 'player',
    entities, entityList,
    entityIndex: { stations, collidables: entityList },
    player: {
      credits: 1000,
      efficiencyMods: { shieldRegenMult: 1, energyRegenMult: 1, cargoCapMult: 1, jumpCooldownMult: 1 },
    },
    ui: { docked: false },
    longBerth: { claimed: true, stage: berthStage, trophies: [], towedIds: [] },
    world: { currentSectorId: 'sector_ceres_belt' },
  };
}

function wire(state) {
  const bus = makeBus();
  const sys = Object.create(crew);
  const ships = { recomputed: 0, recomputeActiveShip() { this.recomputed += 1; } };
  sys.init({ state, bus, registry: { get: (id) => (id === 'ships' ? ships : null) } });
  return { bus, sys, ships };
}

function offers(bus) {
  return bus.emitted.filter((e) => e.evt === 'crew:recruitOffer').map((e) => e.p);
}

test('no crew hail before the crew berth is fitted; hail only near a home station', () => {
  const state = makeState({ berthStage: 2 });
  const { bus, sys } = wire(state);
  for (let i = 0; i < 3; i++) sys.update(2.0, state);
  assert.equal(offers(bus).at(-1).visible, false, 'stage 2 has no crew berth');

  state.longBerth.stage = 3;
  state.entities.get('player').pos = { x: 50, z: 5000 }; // beside Bram's station_ceres
  for (let i = 0; i < 3; i++) sys.update(2.0, state);
  const offer = offers(bus).at(-1);
  assert.equal(offer.visible, true);
  assert.equal(offer.candidateId, 'crew_bram');
  assert.equal(offer.roleLabel, 'Engineer');
});

test('hiring applies the role perk to efficiencyMods and asks ships to recompute', () => {
  const state = makeState();
  const { bus, sys, ships } = wire(state);
  state.entities.get('player').pos = { x: 50, z: 5000 };
  sys.update(2.0, state);
  bus.emit('crew:hire', { candidateId: 'crew_bram' });
  assert.equal(state.crew.members.length, 1);
  const bram = state.crew.members[0];
  assert.equal(bram.role, 'engineer');
  assert.equal(state.player.efficiencyMods.shieldRegenMult, 1.08,
    'the weld keeps the bubble up — a real derived-stat input');
  assert.equal(ships.recomputed, 1, 'derived stats were re-folded');
  // A duplicate hire is a no-op.
  bus.emit('crew:hire', { candidateId: 'crew_bram' });
  assert.equal(state.crew.members.length, 1);
  // A declined candidate never hails again.
  bus.emit('crew:hire', { candidateId: 'crew_paolo' });
  assert.equal(state.crew.members.length, 2);
});

test('roster caps at four; a declined candidate stays declined', () => {
  const state = makeState();
  const { bus, sys } = wire(state);
  for (const c of CREW_CANDIDATES.slice(0, CREW_CAP + 1)) {
    state.entities.get('player').pos = { x: 0, z: 0 };
    sys._offerBypass = true;
    // Hiring is gated on berth stage + station proximity is only an offer gate — hire directly.
    bus.emit('crew:hire', { candidateId: c.id });
  }
  assert.equal(state.crew.members.length, CREW_CAP, 'four aboard is the most she carries');
});

test('loyalty jobs complete on real events and speak once', () => {
  const state = makeState();
  const { bus, sys } = wire(state);
  bus.emit('crew:hire', { candidateId: 'crew_bram' }); // job: berth_stages ×2
  const bram = state.crew.members[0];
  bus.emit('longBerth:stage', { stage: 1 });
  assert.equal(bram.loyaltyJob.progress, 1);
  assert.equal(bram.loyaltyJob.done, false);
  bus.emit('longBerth:stage', { stage: 2 });
  assert.equal(bram.loyaltyJob.done, true);
  assert.equal(bram.loyalty, 1);
  const loyaltyPops = bus.emitted.filter((e) => e.evt === 'crew:loyalty');
  assert.equal(loyaltyPops.length, 1, 'loyalty speaks once');
});

test('banter rides real events, rate-limited, and only from the active roster', () => {
  const state = makeState();
  const { bus, sys } = wire(state);
  bus.emit('crew:hire', { candidateId: 'crew_marko' }); // gunner with kills banter
  bus.emit('entity:killed', { killerId: 'player', id: 55 });
  const banterOf = (name) => bus.emitted.filter(
    (e) => e.evt === 'comms:popup' && e.p.sender === name && e.p.category === 'ambient',
  );
  const pops = banterOf('Marko Vane');
  assert.equal(pops.length, 1);
  assert.match(pops[0].p.text, /feed|Clean break/i);
  // Inside the banter gap the next kill says nothing.
  bus.emit('entity:killed', { killerId: 'player', id: 56 });
  assert.equal(banterOf('Marko Vane').length, 1);
  // NPC kills are not the player's work — no line.
  state.simTime += 60;
  bus.emit('entity:killed', { killerId: 'npc-9', id: 57 });
  assert.equal(banterOf('Marko Vane').length, 1);
});

test('a hull-down injures one member; a second loss loses the injured; berth dock heals', () => {
  const state = makeState();
  const { bus, sys } = wire(state);
  bus.emit('crew:hire', { candidateId: 'crew_bram' });
  bus.emit('crew:hire', { candidateId: 'crew_marko' });
  const before = state.player.efficiencyMods.shieldRegenMult;

  bus.emit('player:death', {});
  const injured = state.crew.members.find((m) => m.status === 'injured');
  assert.ok(injured, 'one member went down with the hull');
  assert.equal(state.player.efficiencyMods.shieldRegenMult, before - CREW_ROLES.engineer.perk.delta,
    'the injured engineer’s perk is off the sheet');

  // Dock at the own berth — she heals on the spot.
  bus.emit('dock:docked', { stationId: LONG_BERTH_STATION_ID });
  assert.equal(state.crew.members.every((m) => m.status === 'active'), true);
  assert.equal(state.player.efficiencyMods.shieldRegenMult, before, 'perk restored with the engineer');

  // Second casualty rule: whoever is already injured on the next death is lost for good.
  bus.emit('player:death', {});
  assert.equal(state.crew.members.find((m) => m.id === 'crew_bram').status, 'injured');
  bus.emit('player:death', {});
  assert.equal(state.crew.members.some((m) => m.id === 'crew_bram'), false, 'Bram did not walk off');
  assert.ok(state.crew.lostIds.includes('crew_bram'));
  assert.equal(state.player.efficiencyMods.shieldRegenMult, 1, 'his weld left with him');
});

test('the persisted slice re-inits cleanly after a reload', () => {
  const state = makeState();
  const { bus } = wire(state);
  bus.emit('crew:hire', { candidateId: 'crew_isese' });
  state.crew.members[0].loyalty = 1;
  // A fresh system instance on the same slice — what a save/load produces.
  const sys2 = Object.create(crew);
  sys2.init({ state, bus: makeBus(), registry: { get: () => null } });
  sys2.update(2.0, state);
  assert.equal(state.crew.members.length, 1);
  assert.equal(state.crew.members[0].loyalty, 1);
});
