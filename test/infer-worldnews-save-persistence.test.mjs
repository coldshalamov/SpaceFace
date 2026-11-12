// INFERENCE unit — the chart's memory was amnesiac: wreck fields you witnessed, courier-loss
// pins, and the world-beat dedupe keys all live in `state.worldNews`, which no save section
// carried. Every Continue wiped the galaxy map's remembered marks and could replay headlines
// whose "already said this day" latch had just been forgotten. The save now carries the bag —
// bounded on write, absent-tolerant on restore — through both save paths (the worker capture
// plan and the synchronous data generator) and the real restore lane.
import test from 'node:test';
import assert from 'node:assert/strict';

import { save as saveDefinition } from '../src/save/saveSystem.js';
import { wreckEcologyMarkers } from '../src/ui/wreckEcologyMarkers.js';
import { createSimulation } from '../src/core/sim.js';

function makeSave(state) {
  const save = Object.create(saveDefinition);
  save.state = state;
  save.registry = { get: () => null };
  save.helpers = {};
  return save;
}

function bagWith(overrides = {}) {
  return {
    markers: [
      { id: 'wreck:cold_hulk', kind: 'wreck_ecology', name: 'Cold Hulk', sectorId: 'sector_dione_lane', x: 120, z: -40, sourceRef: 'wreckEcology:cold_hulk' },
      { id: 'courier:lime', kind: 'courier_lost', name: 'Courier lost', sectorId: 'sector_dione_lane', x: 10, z: 10, until: 5000, sourceRef: 'site:courierLost:lime' },
      ...overrides.markers || [],
    ],
    starved: { 'station_tethys_hub:cmdty_food': 'Food is starved at Meridian Exchange.' },
    sectorSnap: { sector_dione_lane: { owner: 'faction_scn', threat: 1 } },
    claimLegs: { 'dock:body:3': true },
    dockLines: ['A wreck field is on the chart.', 'Day 4. sector_dione_lane unheld → faction_scn.'],
    lastDigest: 42,
    legendDay: 7,
    pendingDay: { digest: 43 },
    ...overrides,
  };
}

test('the bag serializes to bounded plain JSON with its memory intact', () => {
  const state = { worldNews: bagWith() };
  const out = makeSave(state)._serializeWorldNews();
  assert.equal(out.schemaVersion, 1);
  assert.equal(out.markers.length, 2);
  assert.equal(out.starved['station_tethys_hub:cmdty_food'], 'Food is starved at Meridian Exchange.');
  assert.equal(out.legendDay, 7);
  assert.equal(out.lastDigest, 42);
  assert.equal(out.dockLines.length, 2);
  assert.equal(out.claimLegs['dock:body:3'], true);
  assert.equal(out.sectorSnap.sector_dione_lane.owner, 'faction_scn');
  assert.equal(out.pendingDay, undefined, 'transient pending beats do not ride the save');
  const round = JSON.parse(JSON.stringify(out));
  assert.deepEqual(round, out, 'plain JSON only');
});

test('the markers bound at 48 on write', () => {
  const markers = Array.from({ length: 80 }, (_, i) => ({
    id: `wreck:w${i}`, kind: 'wreck_ecology', name: `W${i}`, sectorId: 's', x: i, z: 0,
  }));
  const out = makeSave({ worldNews: bagWith({ markers }) })._serializeWorldNews();
  assert.equal(out.markers.length, 48);
  assert.equal(out.markers[0].id, 'wreck:w32', 'the newest marks survive the bound');
});

test('a world without the bag serializes nothing — old saves untouched', () => {
  assert.equal(makeSave({})._serializeWorldNews(), null);
  assert.equal(makeSave({ worldNews: 'garbage' })._serializeWorldNews(), null);
});

test('restore adopts the memory and the chart reads it back', () => {
  const state = {};
  const save = makeSave(state);
  save._restoreWorldNews(makeSave({ worldNews: bagWith() })._serializeWorldNews());
  const marks = wreckEcologyMarkers(state, 'sector_dione_lane');
  assert.equal(marks.length, 2, 'the galaxy map draws both remembered marks');
  assert.ok(marks.some((m) => m.id === 'wreck:cold_hulk'));
  assert.equal(state.worldNews.legendDay, 7, 'the chronicler-legend latch survives Continue');
  assert.equal(state.worldNews.starved['station_tethys_hub:cmdty_food'],
    'Food is starved at Meridian Exchange.');
});

test('an absent or invalid section restores nothing — pre-worldNews saves start fresh', () => {
  const state = { worldNews: { markers: [{ id: 'wreck:live', kind: 'wreck_ecology', name: 'Live', sectorId: 's', x: 1, z: 1 }] } };
  const save = makeSave(state);
  save._restoreWorldNews(undefined);
  save._restoreWorldNews(null);
  save._restoreWorldNews('garbage');
  assert.equal(state.worldNews.markers.length, 1, 'the live bag is untouched');
  save._restoreWorldNews({ markers: [{ id: 'wreck:ok', kind: 'wreck_ecology', name: 'Ok', sectorId: 's', x: 2, z: 2 }, null, { nope: true }] });
  assert.equal(state.worldNews.markers.length, 1);
  assert.equal(state.worldNews.markers[0].id, 'wreck:ok', 'malformed rows drop, well-formed rows land');
});

test('the worker capture plan carries the section', () => {
  const state = { worldNews: bagWith() };
  const save = makeSave(state);
  const plan = save._saveCapturePlan();
  const row = plan.find(([key]) => key === 'worldNews');
  assert.ok(row, 'the worker capture plan has a worldNews reader');
  assert.equal(row[1]().markers.length, 2, 'the reader is the bounded serializer');
});

test('a booted sim serializes the worldNews key through the real data generator', () => {
  const sim = createSimulation({ seed: 4242, systems: [], helpers: {} });
  sim.state.mode = 'flight';
  sim.state.worldNews = bagWith();
  const save = makeSave(sim.state);
  save.bus = sim.bus;
  const data = save.serializeData();
  assert.ok(data.worldNews, 'the synchronous data generator writes the section');
  assert.equal(data.worldNews.markers.length, 2);
});
