// Row 445 GOLD-HOME — the Long Berth: the abandoned yard tug tows to a claim, restores in three
// paid stages, keeps physically-towed trophies in its yard, and docks through the stock gate.
//
// These tests pin the contracts: claim eligibility (real tow history only), stage costs through
// the cargo/credits single writers, the non-colliding dockable marker, trophy persistence, and
// the berth card the dock screen reads.

import test from 'node:test';
import assert from 'node:assert/strict';

import { longBerth } from '../src/systems/longBerth.js';
import {
  LONG_BERTH_ONEOFF_ID, LONG_BERTH_STATION_ID, BERTH_STAGES,
  BERTH_CLAIM_RANGE_WU, BERTH_YARD_RADIUS_WU, BERTH_DOCK_RADIUS_WU,
} from '../src/data/longBerth.js';
import { STATION_INFO } from '../src/systems/missions.js';
import { resolveDockRange } from '../src/core/dockRange.js';
import { buildDockArrival } from '../src/ui/dockArrival.js';

function makeBus() {
  const emitted = [];
  const handlers = new Map();
  return {
    emitted,
    emit(evt, p) { emitted.push({ evt, p }); (handlers.get(evt) || []).forEach((fn) => fn(p)); },
    on(evt, fn) { const l = handlers.get(evt) || []; l.push(fn); handlers.set(evt, l); return () => {}; },
  };
}

function makeTug() {
  return {
    id: 7, type: 'wreck', alive: true,
    pos: { x: 1000, z: 800 }, vel: { x: 0, z: 0 }, radius: 22, mass: 180,
    collides: true,
    data: {
      oneOffId: LONG_BERTH_ONEOFF_ID,
      worldRecordId: 'wr:tug:1',
      name: 'The Long Berth — an abandoned yard tug',
      masslineTetherable: true,
    },
  };
}

function makePlayer(pos = { x: 1010, z: 810 }) {
  return {
    id: 'player', type: 'ship', alive: true,
    pos: { ...pos }, vel: { x: 0, z: 0 }, radius: 8,
  };
}

function makeState({ credits = 20000, cargo = {} } = {}) {
  const entities = new Map();
  const entityList = [];
  const tug = makeTug();
  const player = makePlayer();
  entities.set(tug.id, tug); entityList.push(tug);
  entities.set(player.id, player); entityList.push(player);
  return {
    simTime: 100, tick: 6000,
    playerId: 'player',
    entities, entityList,
    entityIndex: { stations: entityList.filter((e) => e.type === 'station'), collidables: entityList },
    world: { currentSectorId: 'sector_ceres_belt' },
    player: {
      credits,
      cargo: { items: { ...cargo }, usedVolume: 0, usedMass: 0 },
    },
    ui: {},
  };
}

function wire(state) {
  const bus = makeBus();
  const sys = Object.create(longBerth);
  sys.init({
    state, bus,
    helpers: {
      spawnEntity(spec) {
        const e = {
          ...spec, id: 900 + state.entityList.length, alive: true,
          pos: { ...spec.pos }, vel: { ...(spec.vel || { x: 0, z: 0 }) },
          data: { ...(spec.data || {}) },
        };
        state.entities.set(e.id, e);
        state.entityList.push(e);
        state.entityIndex.stations.push(e);
        return e;
      },
    },
  });
  return { bus, sys };
}

function scan(sys, state, times = 1) {
  for (let i = 0; i < times; i++) sys.update(1.0, state);
}

function offers(bus, name) {
  return bus.emitted.filter((e) => e.evt === name).map((e) => e.p);
}

test('claim offer is gated on real tow history, proximity, and a parked tug', () => {
  const state = makeState();
  const { bus, sys } = wire(state);
  scan(sys, state);
  assert.equal(offers(bus, 'longBerth:claimOffer').at(-1).visible, false,
    'no offer for a tug the rope never touched');

  bus.emit('tether:latched', { targetId: 7 });
  scan(sys, state);
  assert.equal(offers(bus, 'longBerth:claimOffer').at(-1).visible, true,
    'a latched-and-released tug parked beside the player earns the claim offer');

  // Moving the player out of the claim radius drops the offer the same scan.
  state.entities.get('player').pos = { x: 4000, z: 4000 };
  scan(sys, state);
  assert.equal(offers(bus, 'longBerth:claimOffer').at(-1).visible, false);
});

test('claim mints the durable slice and registers the home berth station record', () => {
  const state = makeState();
  const { bus, sys } = wire(state);
  bus.emit('tether:latched', { targetId: 7 });
  scan(sys, state);
  bus.emit('longBerth:claim', {});
  assert.equal(state.longBerth.claimed, true);
  assert.equal(state.longBerth.stage, 0);
  const info = STATION_INFO.get(LONG_BERTH_STATION_ID);
  assert.ok(info, 'the berth resolves through the shared station registry');
  assert.equal(info.name, 'The Long Berth');
  assert.equal(info.services.length, 0, 'an unrestored berth sells nothing');
  // A double claim is a no-op — the slice only mints once.
  bus.emit('longBerth:claim', {});
  assert.equal(state.longBerth.stage, 0);
});

test('three paid restore stages charge the single writers and grant real capabilities', () => {
  const state = makeState({
    credits: 20000,
    cargo: { cmdty_alloys: 6, cmdty_fuel_cells: 2 },
  });
  const { bus, sys } = wire(state);
  bus.emit('tether:latched', { targetId: 7 });
  scan(sys, state);
  bus.emit('longBerth:claim', {});

  for (const want of [1, 2, 3]) {
    const stageDef = BERTH_STAGES.find((row) => row.stage === want);
    const cargoBefore = { ...state.player.cargo.items };
    bus.emit('longBerth:restore', {});
    assert.equal(state.longBerth.stage, want, `stage ${want} lands`);
    const charged = bus.emitted.filter((e) => e.evt === 'economy:chargeCredits').at(-1);
    assert.equal(charged.p.amount, stageDef.cost.credits);
    for (const [cid, n] of Object.entries(stageDef.cost.cargo || {})) {
      assert.equal((state.player.cargo.items[cid] || 0), cargoBefore[cid] - n,
        `${n}u ${cid} left the hold through the cargo writer`);
    }
  }
  const info = STATION_INFO.get(LONG_BERTH_STATION_ID);
  assert.deepEqual(info.services, ['refuel', 'repair'],
    'the fitted berth lists real services the stock station shell reads');
  // Stage 4 does not exist — a late verb is a no-op, not an error.
  bus.emit('longBerth:restore', {});
  assert.equal(state.longBerth.stage, 3);
});

test('a restore the player cannot pay for changes nothing', () => {
  const state = makeState({ credits: 100, cargo: {} });
  const { bus, sys } = wire(state);
  bus.emit('tether:latched', { targetId: 7 });
  scan(sys, state);
  bus.emit('longBerth:claim', {});
  bus.emit('longBerth:restore', {});
  assert.equal(state.longBerth.stage, 0, 'no stage bought short of credits');
  assert.equal(bus.emitted.filter((e) => e.evt === 'economy:chargeCredits').length, 0);
});

test('the stage-1 marker is a non-colliding station the real dock gate resolves', () => {
  const state = makeState();
  const { bus, sys } = wire(state);
  bus.emit('tether:latched', { targetId: 7 });
  scan(sys, state);
  bus.emit('longBerth:claim', {});
  bus.emit('longBerth:restore', {}); // stage 1 — she takes a hull
  scan(sys, state);
  const marker = [...state.entities.values()].find((e) => e.data && e.data.longBerthMarker);
  assert.ok(marker, 'the dockable marker materializes once restored');
  assert.equal(marker.type, 'station');
  assert.equal(marker.collides, false, 'the marker is a berth anchor, never flight geometry');
  assert.equal(marker.data.stationId, LONG_BERTH_STATION_ID);
  assert.equal(marker.data.dockRadius, BERTH_DOCK_RADIUS_WU);
  // The shared dock-range gate resolves it like any station: park the player inside the radius.
  const p = state.entities.get('player');
  p.pos = { x: marker.pos.x + 30, z: marker.pos.z };
  p.vel = { x: 0, z: 0 };
  const out = resolveDockRange(state, {});
  assert.equal(out.stationId, LONG_BERTH_STATION_ID, 'dock:range names the home berth');
});

test('a towed body released inside the lit yard joins the trophy roster once', () => {
  const state = makeState({ cargo: { cmdty_alloys: 2 } });
  const { bus, sys } = wire(state);
  bus.emit('tether:latched', { targetId: 7 });
  scan(sys, state);
  bus.emit('longBerth:claim', {});
  bus.emit('longBerth:restore', {});
  bus.emit('longBerth:restore', {}); // stage 2 — the yard is lit
  // A famous hulk the rope touched, parked inside the yard radius.
  const hulk = {
    id: 42, type: 'wreck', alive: true,
    pos: { x: 1000 + BERTH_YARD_RADIUS_WU - 20, z: 800 }, vel: { x: 0, z: 0 }, radius: 14,
    data: { name: 'Hulk of the Held Dock', worldRecordId: 'wr:hulk:9' },
  };
  state.entities.set(hulk.id, hulk); state.entityList.push(hulk);
  bus.emit('tether:latched', { targetId: 42 });
  scan(sys, state);
  assert.equal(state.longBerth.trophies.length, 1);
  assert.equal(state.longBerth.trophies[0].label, 'Hulk of the Held Dock');
  scan(sys, state);
  assert.equal(state.longBerth.trophies.length, 1, 'the same record never double-parks');
  // A body the rope never touched cannot be a trophy, even parked inside the yard.
  const stranger = {
    id: 43, type: 'wreck', alive: true,
    pos: { x: 1000, z: 850 }, vel: { x: 0, z: 0 }, radius: 10,
    data: { name: 'Nobody’s rock', worldRecordId: 'wr:stray:1' },
  };
  state.entities.set(stranger.id, stranger); state.entityList.push(stranger);
  scan(sys, state);
  assert.equal(state.longBerth.trophies.length, 1);
});

test('save reload re-registers the station and keeps claim, stages, and trophies', () => {
  const state = makeState({ cargo: { cmdty_alloys: 6 } });
  const { bus, sys } = wire(state);
  bus.emit('tether:latched', { targetId: 7 });
  scan(sys, state);
  bus.emit('longBerth:claim', {});
  bus.emit('longBerth:restore', {});
  bus.emit('longBerth:restore', {});
  state.longBerth.trophies.push({ worldRecordId: 'wr:hulk:9', label: 'Hulk of the Held Dock', type: 'wreck', at: 100 });
  // Simulate a reload: registry loses the runtime row, the slice survives.
  STATION_INFO.delete(LONG_BERTH_STATION_ID);
  bus.emit('save:loaded', {});
  assert.ok(STATION_INFO.get(LONG_BERTH_STATION_ID), 'the berth record is restored on load');
  assert.equal(state.longBerth.claimed, true);
  assert.equal(state.longBerth.stage, 2);
  assert.equal(state.longBerth.trophies.length, 1);
});

test('the yard survives the real save envelope — claim, stage, trophies, tow ledger', () => {
  const state = makeState({ cargo: { cmdty_alloys: 6 } });
  const { bus, sys } = wire(state);
  bus.emit('tether:latched', { targetId: 7 });
  scan(sys, state);
  bus.emit('longBerth:claim', {});
  bus.emit('longBerth:restore', {});
  bus.emit('longBerth:restore', {});
  state.longBerth.trophies.push({ worldRecordId: 'wr:hulk:9', label: 'Hulk of the Held Dock', type: 'wreck', at: 100 });
  state.longBerth.towedIds.push('wr:tug:7');
  const snapshot = JSON.parse(JSON.stringify(sys.serialize()));
  // Cold boot: no slice, no registered station row.
  const cold = makeState();
  STATION_INFO.delete(LONG_BERTH_STATION_ID);
  const { bus: bus2, sys: sys2 } = wire(cold);
  sys2.deserialize(snapshot);
  assert.equal(cold.longBerth.claimed, true);
  assert.equal(cold.longBerth.stage, 2);
  assert.equal(cold.longBerth.trophies.length, 1);
  assert.deepEqual(cold.longBerth.towedIds, state.longBerth.towedIds);
  assert.equal(cold.longBerth.markerEntityId, null, 'the marker handle is reminted, not saved');
  bus2.emit('save:loaded', {});
  assert.ok(STATION_INFO.get(LONG_BERTH_STATION_ID), 'the station row is re-registered on load');
});

test('a missing longBerth key in an old save restores the fresh bag', () => {
  const cold = makeState();
  const { sys } = wire(cold);
  sys.deserialize(undefined);
  sys.deserialize(null);
  assert.equal(cold.longBerth.claimed, false);
  assert.equal(cold.longBerth.stage, 0);
  assert.deepEqual(cold.longBerth.trophies, []);
});

test('corrupt trophy/id entries are dropped, not adopted — the yard scan stays safe', () => {
  const cold = makeState();
  const { sys } = wire(cold);
  sys.deserialize({
    claimed: true, stage: 2,
    trophies: [null, 'junk', { label: 'no id' }, { worldRecordId: 'wr:hulk:9', label: 'Hulk', type: 'wreck', at: 5 }],
    crew: ['crew_bram', 9], towedIds: [null, 'wr:tug:1'], tugWorldRecordId: 42,
  });
  assert.deepEqual(cold.longBerth.trophies.map((t) => t.worldRecordId), ['wr:hulk:9']);
  assert.deepEqual(cold.longBerth.crew, ['crew_bram']);
  assert.deepEqual(cold.longBerth.towedIds, ['wr:tug:1']);
  assert.equal(cold.longBerth.tugWorldRecordId, null);
  scan(sys, cold); // the yard scan iterates the adopted trophies without throwing
});

test('docking at the berth paints the home card: hull, crew, and the trophy yard', () => {
  const state = makeState();
  const { bus, sys } = wire(state);
  bus.emit('tether:latched', { targetId: 7 });
  scan(sys, state);
  bus.emit('longBerth:claim', {});
  state.longBerth.trophies.push(
    { worldRecordId: 'wr:hulk:9', label: 'Hulk of the Held Dock', type: 'wreck', at: 100 });
  const view = buildDockArrival(state, { id: LONG_BERTH_STATION_ID, name: 'The Long Berth', services: [] });
  assert.ok(view.eventCard, 'the berth card paints');
  assert.equal(view.eventCard.badge, 'HOME');
  assert.match(view.eventCard.body, /on the rail/);
  assert.match(view.eventCard.body, /Hulk of the Held Dock/);
});
