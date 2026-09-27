// THE HEAT DIAL (src/ui/orrery/footprintDial.js, src/ui/screens/footprint.js): the numbers the
// instrument draws, proven headless.
//   • the bezel reads the heat system's own escape clock (heatZone.outsideS / clearAfterS) and cools
//     as that clock runs, holds inside the zone / docked / at the pound, and never writes heat;
//   • the source ring's sectors (bounty first, open chains, settled slivers, the cold clean arc);
//   • a verb preview settles exactly what the provenance ledger's open rule would close, and no verb
//     on the screen promises heat (heat is the heat system's single writer).
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { heatReading, sectorLayout, heatAngle, HEAT_FROM, HEAT_SWEEP } from '../src/ui/orrery/footprintDial.js';
import { footprintScreen, footprintSources } from '../src/ui/screens/footprint.js';
import { factions as factionsSystem } from '../src/systems/factions.js';

function wantedState({ outsideS = 3.1, playerAt = { x: 0, z: 0 } } = {}) {
  const state = createGameState(47);
  state.mode = 'flight';
  state.playerId = 0;
  state.entities.set(0, { id: 0, type: 'ship', pos: { x: playerAt.x, y: 0, z: playerAt.z }, flags: {} });
  state.player.heat = 0.46;
  state.player.bounty = 4200;
  state.player.credits = 18400;
  state.player.heatZone = { active: true, center: { x: -2600, z: 900 }, radius: 2300, level: 3, outsideS, clearAfterS: 7 };
  return state;
}

function chain(id, { open = false, bountyPending = false, amendsActive = false, nodes = 3, factionId = 'faction_mts', tick = 100 } = {}) {
  const list = [];
  list.push({ k: 'act', tick, t: tick / 60, factionId, outcome: 'destroyed' });
  for (let i = 1; i < nodes; i += 1) list.push({ k: i === 1 ? 'incident' : 'standing', tick: tick + i, t: (tick + i) / 60, factionId, stationId: 'station_helios', delta: -10 });
  return { id, open, bountyPending, amendsActive, sectorId: 'sector_helios_prime', rootKind: 'act', outcome: 'destroyed', tick, t: tick / 60, nodes: list, edges: [] };
}

test('the bezel reads the escape clock: the head recedes toward the next stop as outsideS runs', () => {
  const early = heatReading(wantedState({ outsideS: 3.1 }));
  assert.equal(early.level, 3);
  assert.equal(early.held, null, 'outside the zone the clock runs');
  assert.ok(Math.abs(early.head - (0.46 - (3.1 / 7) * (0.46 - 0.4))) < 1e-9, 'head = heat less the run fraction of this step');
  assert.ok(Math.abs(early.clearsIn - (3.9 + 6 + 5)) < 1e-9, 'clears in = the rest of this level plus every level below');

  const later = heatReading(wantedState({ outsideS: 6.2 }));
  assert.ok(later.head < early.head, 'more of the clock run: the lit head has receded');
  assert.ok(later.clearsIn < early.clearsIn, 'and the countdown has rolled down');
  assert.equal(later.heat, early.heat, 'the true heat only steps when the heat system drops a level');
  assert.ok(heatAngle(later.head) < heatAngle(early.head));
  assert.equal(heatAngle(0), HEAT_FROM);
  assert.equal(heatAngle(1), HEAT_FROM + HEAT_SWEEP);
});

test('the clock holds inside the zone, docked, and at the pound', () => {
  const inside = heatReading(wantedState({ playerAt: { x: -2600, z: 900 } }));
  assert.equal(inside.held, 'inside');
  assert.equal(inside.clearsIn, null);
  assert.equal(inside.head, inside.heat, 'nothing cools while the search has you');

  const docked = wantedState();
  docked.player.flags = { docked: true };
  assert.equal(heatReading(docked).held, 'docked');

  const pound = wantedState();
  pound.player.heat = 1;
  assert.equal(heatReading(pound).held, 'impound');

  const clean = wantedState();
  clean.player.heat = 0;
  const cold = heatReading(clean);
  assert.equal(cold.level, 0);
  assert.equal(cold.held, null);
  assert.equal(cold.clearsIn, null);
});

test('reading the heat writes nothing', () => {
  const state = wantedState();
  const before = JSON.stringify({ heat: state.player.heat, zone: state.player.heatZone, bounty: state.player.bounty });
  heatReading(state);
  heatReading(state);
  assert.equal(JSON.stringify({ heat: state.player.heat, zone: state.player.heatZone, bounty: state.player.bounty }), before);
});

test('the source ring: the bounty first, open chains by their receipts, settled chains as slivers', () => {
  const state = wantedState();
  const chains = [
    chain('pv:a', { open: true, nodes: 4, factionId: 'faction_scn', tick: 300 }),
    chain('pv:b', { open: true, bountyPending: true, nodes: 5, tick: 200 }),
    chain('pv:c', { open: false, nodes: 3, factionId: 'faction_reach', tick: 100 }),
  ];
  const sources = footprintSources(state, chains);
  assert.deepEqual(sources.map((s) => s.id), ['bounty', 'pv:a', 'pv:b', 'pv:c']);
  assert.equal(sources[0].weight, 5, 'the bounty weighs the receipts of the chains that carry it');
  assert.equal(sources[0].chainId, 'pv:b', 'tracing the bounty unfolds the chain it stands on');
  assert.equal(sources[1].weight, 4);
  assert.ok(sources.every((s) => typeof s.token === 'string' && s.token.endsWith('.webp')), 'every source carries its produced token');

  const { sectors, clear } = sectorLayout(sources);
  assert.equal(clear, null, 'with sources open there is no clean arc');
  const settled = sectors.find((s) => s.id === 'pv:c');
  assert.equal(settled.span, 16, 'a settled chain keeps a fixed sliver');
  const total = sectors.reduce((sum, s) => sum + s.span, 0);
  assert.ok(Math.abs(total - 360) < 1e-9, 'the sectors close the ring');
  const bounty = sectors.find((s) => s.id === 'bounty');
  const a = sectors.find((s) => s.id === 'pv:a');
  assert.ok(Math.abs(bounty.span / a.span - 5 / 4) < 1e-9, 'open sectors share the ring by weight');

  const quiet = sectorLayout([{ id: 'pv:c', open: false, weight: 1 }]);
  assert.ok(quiet.clear && quiet.clear.span > 300, 'nothing open: the rest of the ring is the cold, complete clean arc');
});

test('a verb preview settles what the ledger would close, and promises no heat', () => {
  const state = wantedState();
  state.factions = {
    faction_scn: { rep: -180, aggro: true, bribesPaid: 0 },
    faction_mts: { rep: -85, aggro: false, bribesPaid: 0 },
  };
  factionsSystem.update(0, state);
  const aggro = chain('pv:aggro', { open: true, nodes: 3, factionId: 'faction_scn', tick: 300 });
  const piracy = chain('pv:piracy', { open: true, bountyPending: true, nodes: 3, factionId: 'faction_mts', tick: 200 });
  const amends = chain('pv:amends', { open: true, amendsActive: true, nodes: 3, factionId: 'faction_mts', tick: 100 });
  const chains = [aggro, piracy, amends];
  state.provenance = { chains, openIncidents: {} };

  const screen = Object.create(footprintScreen);
  screen._ctx = { state };
  screen._chains = chains;
  screen._sources = footprintSources(state, chains);
  const heatBefore = state.player.heat;

  screen._tracedSourceId = 'bounty';
  screen._selectedChainId = 'pv:piracy';
  const pay = screen._verbPreview('pay-bounty');
  assert.deepEqual(pay.settles.sort(), ['bounty', 'pv:piracy'], 'paying settles the bounty and the chain only it held open');
  assert.match(pay.line, /Pays 4,200 cr/);
  assert.equal(screen._primaryVerb(), 'pay-bounty', 'the Lamp Key answers the traced source');

  screen._tracedSourceId = 'pv:aggro';
  screen._selectedChainId = 'pv:aggro';
  const bribe = screen._verbPreview('bribe');
  assert.deepEqual(bribe.settles, ['pv:aggro'], 'a bribe settles the chain the power\'s aggro held open');
  assert.equal(screen._primaryVerb(), 'bribe');

  screen._tracedSourceId = 'pv:amends';
  screen._selectedChainId = 'pv:amends';
  assert.ok(!screen._verbPreview('bribe').settles.includes('pv:amends'), 'amends outstanding: no bribe closes it');

  for (const action of ['pay-bounty', 'bribe', 'find-accuser', 'show-chart', 'take-amends']) {
    const p = screen._verbPreview(action);
    assert.ok(p && !/heat (drops|falls|clears to)/i.test(p.line), `${action} never promises heat`);
  }
  assert.equal(state.player.heat, heatBefore, 'previews write nothing');
});
