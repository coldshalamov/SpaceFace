// WF-18 recovery: the chronicler's legends reach a player surface.
//
// The chronicler formed legends — "Your record: 3 documented rescues." → "A Hand in the Dark" —
// from real evidence receipts, persisted them, and woke its publisher to announce them… through
// `chronicler:legend`, an event with no consumer anywhere in the tree. The sector's memory of
// your deeds never reached a single player surface. The recovery publishes a public legend
// through the same news seam a story uses (`news:publish` → marketNews voice/ticker/log), once
// per legend for its whole life. Headless; seed 4242.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { chronicler } from '../src/systems/chronicler.js';

const SEED = 4242;

function boot() {
  const sim = createSimulation({ seed: SEED, systems: [chronicler] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 100, hull: 100, hullMax: 100, data: {},
  });
  state.playerId = player.id;
  const news = [];
  const deadLegendEvents = [];
  bus.on('news:publish', (p) => news.push(p));
  bus.on('chronicler:legend', (p) => deadLegendEvents.push(p));
  const sys = sim.registry.get('chronicler');
  return { sim, state, bus, player, news, deadLegendEvents, sys };
}

/** One documented rescue by the player; distinct distress ids keep the dedupe keys apart. */
function rescue(t, n, simTime) {
  t.state.simTime = simTime;
  t.sys.capture('distress:rescued', { rescuerId: t.player.id, distressId: `distress_${n}`, targetId: `drifter_${n}` });
}

function legendHeadlines(news) {
  return news.filter((p) => p && p.kind === 'chronicler-legend');
}

test('three rescues announce the player legend once, on the news seam, never on the dead event', () => {
  const t = boot();

  rescue(t, 1, 10); rescue(t, 2, 20); rescue(t, 3, 30);
  t.state.simTime = 31;
  assert.equal(t.sys.update(SIM_DT, t.state), 3, 'one update ingests the three rescue facts');

  const legends = legendHeadlines(t.news);
  assert.equal(legends.length, 1, 'exactly one legend publication');
  const line = legends[0];
  assert.equal(line.source, 'chronicler');
  assert.equal(line.headline, 'A Hand in the Dark');
  assert.equal(line.text, 'A Hand in the Dark — Your record: 3 documented rescues.');
  assert.ok(String(line.sourceRef).startsWith('ch:legend:'), 'citation key survives the news gate');
  assert.ok(Array.isArray(line.evidence) && line.evidence.length === 3, 'the cited rescue receipts ride the line');
  assert.equal(t.deadLegendEvents.length, 0, 'chronicler:legend is gone, not duplicated');

  // The latch: later publishes (and later rescues below the next threshold) never re-announce.
  rescue(t, 4, 40); rescue(t, 5, 50);
  t.state.simTime = 51;
  t.sys.update(SIM_DT, t.state);
  t.state.simTime = 61;
  t.sys.update(SIM_DT, t.state);
  assert.equal(legendHeadlines(t.news).length, 1, 'a legend announces once for its whole life');
});

test('the announced latch and the legend ride the save envelope', () => {
  const t = boot();
  rescue(t, 1, 10); rescue(t, 2, 20); rescue(t, 3, 30);
  t.state.simTime = 31;
  t.sys.update(SIM_DT, t.state);
  assert.equal(legendHeadlines(t.news).length, 1);

  const saved = t.sys.serialize();
  const legendRow = saved.legends.find((l) => l.actorKey === 'player' && l.kind === 'rescues');
  assert.ok(legendRow, 'the legend persists');
  assert.equal(legendRow.announced, true, 'the announced latch persists with it');

  // A restored save whose legend was formed but not yet announced announces exactly once.
  const restored = JSON.parse(JSON.stringify(saved));
  restored.legends.find((l) => l.id === legendRow.id).announced = false;
  const t2 = boot();
  t2.state.simTime = 32;
  t2.state.chronicler = restored;
  t2.sys.deserialize(restored);
  t2.state.simTime = 33;
  t2.sys.update(SIM_DT, t2.state);
  const legends2 = legendHeadlines(t2.news);
  assert.equal(legends2.length, 1, 'an unannounced persisted legend announces after load');
  assert.equal(legends2[0].text, 'A Hand in the Dark — Your record: 3 documented rescues.');
  t2.state.simTime = 34;
  t2.sys.update(SIM_DT, t2.state);
  assert.equal(legendHeadlines(t2.news).length, 1, 'and never twice');
});
