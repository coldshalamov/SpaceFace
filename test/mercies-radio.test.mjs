// mercies-radio — Lane Nine SMALL MERCIES: the Static reports quiet generosity (PL-305..PL-320).
//
// Every row: (a) the authored key is in the runtime key set derived from the pack; (b)
// deriveBandEventKeys maps its trigger event to the key, and the negative payloads to nothing;
// (c) the real trigger (bus seam or plantsRadioObserverMercy composition — the observer is
// constructed by bandRadio itself, so the harness exercises the ordinary route) opens the key;
// (d) once the Static is tuned, the row's exact line airs exactly once; (e) repeating the deed
// never stacks a second airing; (f) the negative variants never latch. Each case builds its
// own harness (fresh bus, fresh state), so no receipt leaks between cases.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { bandRadio, deriveBandEventKeys } from '../src/systems/bandRadio.js';
import { BAND_EVENT_KEYS, BAND_CHANNEL_BY_ID, eligibleBandLines } from '../src/data/bandRadio.js';
import {
  RADIO_MERCY_BERTH_GIFTED_EVENT,
  RADIO_MERCY_SPARE_LEFT_EVENT,
  RADIO_MERCY_LEAK_TOWED_EVENT,
  RADIO_MERCY_DARK_DOCK_EVENT,
  RADIO_MERCY_CHALK_SEAT_EVENT,
  RADIO_MERCY_SKIFF_TOWED_EVENT,
  RADIO_MERCY_REPAIR_WASHED_EVENT,
  RADIO_MERCY_THREE_YIELDS_EVENT,
  RADIO_MERCY_CONVOY_PACED_EVENT,
  RADIO_MERCY_DAWN_WATCH_EVENT,
  RADIO_MERCY_KINDNESS_CHALKS_EVENT,
  RADIO_MERCY_MEDAL_NOTE_EVENT,
  RADIO_MERCY_CLEAN_TAKEOFF_EVENT,
} from '../src/systems/plants/radioObserverMercy.js';

function makeHarness(seed = 47, sectorId = 'sector_helios_prime', sectorSecurity = 0.98) {
  const bus = createBus();
  const voices = [];
  const queue = { active: null, pending: [] };
  const state = {
    meta: { seed }, simTime: 0, mode: 'flight', ui: { docked: false }, playerId: 'player',
    world: {
      currentSectorId: sectorId,
      sectors: {
        [sectorId]: {
          id: sectorId, factionId: 'faction_scn', tier: 0, security: sectorSecurity,
          stations: [{ factionId: 'faction_scn' }],
        },
      },
    },
    factions: { faction_reach: { rep: 0 } },
    entities: new Map([
      ['player', { id: 'player', type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: {} }],
    ]),
  };
  const registry = { get: (name) => (name === 'voiceArbiter' ? { queue } : null) };
  const helpers = { voice: { say(message) { voices.push(structuredClone(message)); return true; } } };
  const system = Object.create(bandRadio);
  system.init({ state, bus, helpers, registry });
  system.newGame();
  return { bus, voices, queue, state, system };
}

function tuneStatic(h) {
  h.bus.emit('band:tune', { channelId: 'the_static', source: 'test' });
  h.system.update(0, h.state); // ident
  h.state.simTime += 60;
  h.system.update(0, h.state); // one ordinary rotation line
}

// Advance + update until the row's exact line has aired; returns the airing count.
function airExact(h, text, tries = 40) {
  let seen = 0;
  for (let i = 0; i < tries; i += 1) {
    h.state.simTime += 60;
    h.system.update(0, h.state);
    seen = h.voices.filter((v) => v.text === text).length;
    if (seen >= 1) break;
  }
  return seen;
}

// One give-way: dwell in dock range past the approach floor, then leave without docking.
function giveWay(h, stationId, t0, dwell = 25) {
  h.state.simTime = t0;
  h.bus.emit('dock:range', { stationId, shipId: 'player', inRange: true });
  h.state.simTime = t0 + dwell;
  h.bus.emit('dock:range', { stationId, shipId: 'player', inRange: false });
}

const TOWN = 'station_helios';
const OUTPOST = 'station_backwater_9'; // not one of the street-life town docks

// The row table: key + final copy (byte-exact from design/program/INFERENCE_PLANTS.md §E).
const ROWS = [
  { pl: 'PL-305', key: 'player.gave_berth_to_hauler', text: 'Somewhere a dockmaster owes you one.' },
  { pl: 'PL-306', key: 'player.left_working_spare', text: 'Left-handed help. The best kind.' },
  { pl: 'PL-307', key: 'player.fiftieth_arrival_paid', text: 'Fifty visits. Some places count.' },
  { pl: 'PL-308', key: 'player.steadied_rookie_tow', text: "Rookie's station chalked you HELPER. Good look." },
  { pl: 'PL-309', key: 'player.towed_stranger_home', text: 'No bounty on that one. Did it anyway.' },
  { pl: 'PL-310', key: 'player.fuel_tab_left_open', text: 'Somebody left the tab open. Says nobody.' },
  { pl: 'PL-311', key: 'player.returned_lantern_lit', text: 'Lanterns come back lit out there. Rare.' },
  { pl: 'PL-312', key: 'player.market_line_three_days', text: 'The chalk seat stays empty. Line knows.' },
  { pl: 'PL-313', key: 'player.skiff_towed_home', text: 'Whole lane came out for one skiff.' },
  { pl: 'PL-314', key: 'player.repairs_wash_included', text: 'Repairs come washed now. Somebody tips.' },
  { pl: 'PL-315', key: 'player.three_yields_one_shift', text: 'Three yields, one shift. Well raised.' },
  { pl: 'PL-316', key: 'player.convoy_paced_stranger', text: 'Paced them all the way in. Silent.' },
  { pl: 'PL-317', key: 'player.plated_window_flare', text: 'Somebody slept late. Somebody got up.' },
  { pl: 'PL-318', key: 'player.callsign_kindness_chalks', text: 'The chalks read like a fan letter.' },
  { pl: 'PL-319', key: 'player.took_medal_left_note', text: "Medal's gone, note stays. The deal." },
  { pl: 'PL-320', key: 'player.coached_clean_takeoff', text: "Someone's coaching takeoffs again. For free." },
];

const rowBy = (pl) => ROWS.find((row) => row.pl === pl);

test('every mercy row is authored on the Static with its exact final copy', () => {
  const channel = BAND_CHANNEL_BY_ID.the_static;
  for (const row of ROWS) {
    assert.ok(BAND_EVENT_KEYS.includes(row.key), `${row.pl} key ${row.key} must derive from the pack`);
    const lines = eligibleBandLines(channel, { eventKeys: { [row.key]: true }, reachRep: 0 })
      .filter((line) => line.eventKey === row.key);
    assert.equal(lines.length, 1, `${row.pl}: exactly one authored line`);
    assert.equal(lines[0].text, row.text, `${row.pl}: byte-exact final copy`);
    assert.ok(lines[0].id.startsWith('static_'), `${row.pl}: airs on the_static`);
  }
});

test('deriveBandEventKeys contract: each mercy trigger maps, negatives do not', () => {
  const crescent = { world: { currentSectorId: 'sector_helios_prime' } };
  const elsewhere = { world: { currentSectorId: 'sector_ceres_belt' } };
  const checks = [
    ['tether:snapCatch', { targetId: 'r1', rating: 'clean' }, crescent, 'player.steadied_rookie_tow'],
    ['plants:deadLaneThanks', { until: 999, t: 10 }, {}, 'player.returned_lantern_lit'],
    ['plants:radioMercy:berthGifted', {}, {}, 'player.gave_berth_to_hauler'],
    ['plants:radioMercy:spareLeft', {}, {}, 'player.left_working_spare'],
    ['plants:pl260:fifty', { stationId: 'station_helios' }, {}, 'player.fiftieth_arrival_paid'],
    ['plants:radioMercy:leakTowedHome', {}, {}, 'player.towed_stranger_home'],
    ['plants:radioMercy:darkDockClean', {}, {}, 'player.fuel_tab_left_open'],
    ['plants:radioMercy:chalkSeatThreeDays', {}, {}, 'player.market_line_three_days'],
    ['plants:radioMercy:skiffTowedHome', {}, {}, 'player.skiff_towed_home'],
    ['plants:radioMercy:repairWashed', {}, {}, 'player.repairs_wash_included'],
    ['plants:radioMercy:threeYieldsOneShift', {}, {}, 'player.three_yields_one_shift'],
    ['plants:radioMercy:convoyPacedHome', {}, {}, 'player.convoy_paced_stranger'],
    ['plants:radioMercy:dawnWatchHeld', {}, {}, 'player.plated_window_flare'],
    ['plants:radioMercy:kindnessChalks', {}, {}, 'player.callsign_kindness_chalks'],
    ['plants:radioMercy:medalLeftNote', {}, {}, 'player.took_medal_left_note'],
    ['plants:radioMercy:cleanTakeoffCoached', {}, {}, 'player.coached_clean_takeoff'],
  ];
  for (const [event, payload, state, key] of checks) {
    assert.deepEqual(deriveBandEventKeys(event, payload, state), [key], `${event} must map to ${key}`);
    assert.deepEqual(deriveBandEventKeys('some:unrelatedEvent', payload, state), [],
      `${event} must not leak onto other events`);
  }
  // PL-308 gates: the steadiest rating only, in the rookies' home water only.
  assert.deepEqual(deriveBandEventKeys('tether:snapCatch', { targetId: 'r1', rating: 'good' }, crescent), []);
  assert.deepEqual(deriveBandEventKeys('tether:snapCatch', { targetId: 'r1', rating: 'clean' }, elsewhere), []);
  assert.deepEqual(deriveBandEventKeys('tether:snapCatch', {}, crescent), []);
});

// ---- PL-305 — berth-gift: a real approach at a town dock, given up without docking ----

test('PL-305: yielding a town berth opens the key and airs once', () => {
  const h = makeHarness();
  tuneStatic(h);
  giveWay(h, TOWN, 100);
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-305').key], true, 'deed key opens');
  assert.equal(airExact(h, rowBy('PL-305').text), 1, 'exactly one airing');
  giveWay(h, TOWN, 400);
  assert.equal(airExact(h, rowBy('PL-305').text), 1, 'the deed is heard once');
});

test('PL-305 negatives: a fly-through and a non-town yield never latch', () => {
  const h = makeHarness();
  tuneStatic(h);
  giveWay(h, TOWN, 100, 10); // under the approach floor
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-305').key], undefined);
  giveWay(h, OUTPOST, 200); // long dwell, but not a town dock
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-305').key], undefined);
  h.state.simTime += 60;
  h.system.update(0, h.state);
  assert.equal(h.voices.some((v) => v.text === rowBy('PL-305').text), false);
});

// ---- PL-306 — spare-share: a stranger's spill left lying on the lane ----

test('PL-306: leaving a stranger-spilled load unlooted opens the key and airs once', () => {
  const h = makeHarness();
  tuneStatic(h);
  h.bus.emit('freight:cargoSpilled', { attackerId: 'raider_1', entityId: 'hauler_2' });
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-306').key], undefined, 'not until the window settles');
  h.state.simTime += 95;
  h.system.update(0, h.state);
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-306').key], true, 'deed key opens');
  assert.equal(airExact(h, rowBy('PL-306').text), 1, 'exactly one airing');
});

test('PL-306 negatives: the player taking the load, or their own spill, never latch', () => {
  const h = makeHarness();
  tuneStatic(h);
  h.bus.emit('freight:cargoSpilled', { attackerId: 'raider_1', entityId: 'hauler_2' });
  h.bus.emit('pickup:collected', { entityId: 'player' }); // the player took it — not left it
  h.state.simTime += 95;
  h.system.update(0, h.state);
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-306').key], undefined);
  h.bus.emit('freight:cargoSpilled', { attackerId: 'player', entityId: 'hauler_3' }); // their own guns
  h.state.simTime += 95;
  h.system.update(0, h.state);
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-306').key], undefined);
  assert.equal(h.voices.some((v) => v.text === rowBy('PL-306').text), false);
});

// ---- PL-307 — fiftieth arrival at one station ----

test('PL-307: the house toll receipt opens the key and airs once (same seam as the chalk)', () => {
  const h = makeHarness();
  tuneStatic(h);
  // Arrivals alone are nothing: the key opens on pl260's own receipt — the same seam that
  // chalks the toll-paid board — so the voice and the chalk can never diverge.
  for (let i = 0; i < 50; i += 1) {
    h.bus.emit('dock:docked', { stationId: TOWN, shipId: 'player' });
  }
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-307').key], undefined, 'arrivals without the receipt assert nothing');
  h.bus.emit('plants:pl260:fifty', { stationId: TOWN, t: h.state.simTime });
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-307').key], true, 'deed key opens on the house receipt');
  assert.equal(airExact(h, rowBy('PL-307').text), 1, 'exactly one airing');
  h.bus.emit('plants:pl260:fifty', { stationId: TOWN, t: h.state.simTime + 10 });
  assert.equal(airExact(h, rowBy('PL-307').text), 1, 'the deed is heard once');
});

test('PL-307 negatives: other mercy receipts never open the fiftieth key', () => {
  const h = makeHarness();
  tuneStatic(h);
  h.bus.emit('plants:radioMercy:berthGifted', { t: h.state.simTime });
  h.bus.emit('plants:pl260:fifty', { stationId: 'station_elsewhere', t: h.state.simTime, partial: true, kind: 'preview' });
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-307').key], true);
});

// ---- PL-308 — steadied rookie tow: a clean-rated catch in the crescent (direct seam) ----

test('PL-308: a clean tether catch in the crescent opens the key and airs once', () => {
  const h = makeHarness();
  tuneStatic(h);
  h.bus.emit('tether:snapCatch', { targetId: 'rookie_1', rating: 'clean' });
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-308').key], true, 'deed key opens');
  assert.equal(airExact(h, rowBy('PL-308').text), 1, 'exactly one airing');
  h.bus.emit('tether:snapCatch', { targetId: 'rookie_2', rating: 'clean' });
  assert.equal(airExact(h, rowBy('PL-308').text), 1, 'the deed is heard once');
});

test('PL-308 negatives: rough catches and other home water never latch', () => {
  const h = makeHarness();
  tuneStatic(h);
  h.bus.emit('tether:snapCatch', { targetId: 'npc_1', rating: 'good' });
  h.bus.emit('tether:snapCatch', { targetId: 'npc_2', rating: 'rough' });
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-308').key], undefined);
  h.state.world.currentSectorId = 'sector_ceres_belt';
  h.bus.emit('tether:snapCatch', { targetId: 'npc_3', rating: 'clean' });
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-308').key], undefined);
});

// ---- PL-309 — leak-tow: the tow latch still fresh when the player docks ----

test('PL-309: towing a stranger all the way to the dock opens the key and airs once', () => {
  const h = makeHarness();
  tuneStatic(h);
  h.state.simTime = 100;
  h.bus.emit('tether:snapCatch', { targetId: 'stranger_1', rating: 'clean' });
  h.state.simTime = 200;
  h.bus.emit('dock:docked', { stationId: OUTPOST, shipId: 'player' });
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-309').key], true, 'deed key opens');
  assert.equal(airExact(h, rowBy('PL-309').text), 1, 'exactly one airing');
  h.state.simTime = 400;
  h.bus.emit('tether:snapCatch', { targetId: 'stranger_2', rating: 'clean' });
  h.state.simTime = 500;
  h.bus.emit('dock:docked', { stationId: OUTPOST, shipId: 'player' });
  assert.equal(airExact(h, rowBy('PL-309').text), 1, 'the deed is heard once');
});

test('PL-309 negatives: a stale latch or a dock without a tow never latch', () => {
  const h = makeHarness();
  tuneStatic(h);
  h.bus.emit('dock:docked', { stationId: OUTPOST, shipId: 'player' }); // no tow at all
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-309').key], undefined);
  h.state.simTime = 100;
  h.bus.emit('tether:snapCatch', { targetId: 'stranger_3', rating: 'clean' });
  h.state.simTime = 100 + 241; // past the towWatch stale window
  h.bus.emit('dock:docked', { stationId: OUTPOST, shipId: 'player' });
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-309').key], undefined);
  assert.equal(h.voices.some((v) => v.text === rowBy('PL-309').text), false);
});

// ---- PL-310 — dark waystation, clean dock (the tab left open) ----

function makeDarkSectorHarness() {
  const h = makeHarness(47, 'sector_helios_prime');
  h.state.world.currentSectorId = 'sector_ashfall_dark';
  h.state.world.sectors.sector_ashfall_dark = {
    id: 'sector_ashfall_dark', factionId: 'faction_free', tier: 2, security: 0.1,
    stations: [],
  };
  return h;
}

test('PL-310: a clean dock in a dark sector opens the key and airs once', () => {
  const h = makeDarkSectorHarness();
  tuneStatic(h);
  h.bus.emit('sector:enter', { sectorId: 'sector_ashfall_dark' });
  h.bus.emit('dock:docked', { stationId: 'station_ashfall_1', shipId: 'player' });
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-310').key], true, 'deed key opens');
  assert.equal(airExact(h, rowBy('PL-310').text), 1, 'exactly one airing');
});

test('PL-310 negatives: an incident on the stay, or a lit sector, never latch', () => {
  const h = makeDarkSectorHarness();
  tuneStatic(h);
  h.bus.emit('law:incidentOpened', { attackerId: 'player', victimAnchor: { kind: 'wreck' } });
  h.bus.emit('dock:docked', { stationId: 'station_ashfall_1', shipId: 'player' });
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-310').key], undefined, 'an opened incident closes the tab');
  h.bus.emit('sector:enter', { sectorId: 'sector_ashfall_dark' }); // a fresh stay resets the ledger
  h.bus.emit('dock:docked', { stationId: 'station_ashfall_1', shipId: 'player' });
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-310').key], true);
  const lit = makeHarness(47, 'sector_helios_prime'); // security 0.98
  tuneStatic(lit);
  lit.bus.emit('dock:docked', { stationId: TOWN, shipId: 'player' });
  assert.equal(lit.state.bandRadio.eventKeys[rowBy('PL-310').key], undefined);
  assert.equal(lit.voices.some((v) => v.text === rowBy('PL-310').text), false);
});

// ---- PL-311 — lantern: the lane's thanks for light carried back (direct seam) ----

test('PL-311: the dead-lane thanks receipt opens the key and airs once', () => {
  const h = makeHarness();
  tuneStatic(h);
  h.bus.emit('plants:deadLaneThanks', { until: 999, t: h.state.simTime });
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-311').key], true, 'deed key opens');
  assert.equal(airExact(h, rowBy('PL-311').text), 1, 'exactly one airing');
  h.bus.emit('plants:deadLaneThanks', { until: 1999, t: h.state.simTime });
  assert.equal(airExact(h, rowBy('PL-311').text), 1, 'the deed is heard once');
});

test('PL-311 negatives: other dead-lane receipts are not the lantern return', () => {
  const h = makeHarness();
  tuneStatic(h);
  h.bus.emit('plants:deadLaneRelit', { beaconId: 'b1', t: h.state.simTime });
  h.bus.emit('plants:deadLaneDark', { beaconId: 'b1', t: h.state.simTime });
  h.bus.emit('plants:deadLaneHorn', { t: h.state.simTime });
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-311').key], undefined);
  assert.equal(h.voices.some((v) => v.text === rowBy('PL-311').text), false);
});

// ---- PL-312 — chalk seat: the same town dock three core days running ----

test('PL-312: three consecutive days at one town opens the key and airs once', () => {
  const h = makeHarness();
  tuneStatic(h);
  for (const t of [100, 700, 1300]) { // core days 0, 1, 2
    h.state.simTime = t;
    h.bus.emit('dock:docked', { stationId: TOWN, shipId: 'player' });
  }
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-312').key], true, 'deed key opens');
  assert.equal(airExact(h, rowBy('PL-312').text), 1, 'exactly one airing');
});

test('PL-312 negatives: two days, or a broken streak, never latch', () => {
  const h = makeHarness();
  tuneStatic(h);
  for (const t of [100, 700]) { // only two days
    h.state.simTime = t;
    h.bus.emit('dock:docked', { stationId: TOWN, shipId: 'player' });
  }
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-312').key], undefined);
  for (const t of [3100, 3700]) { // days 5 and 6 after a three-day gap: the streak restarts
    h.state.simTime = t;
    h.bus.emit('dock:docked', { stationId: TOWN, shipId: 'player' });
  }
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-312').key], undefined);
  assert.equal(h.voices.some((v) => v.text === rowBy('PL-312').text), false);
});

// ---- PL-313 — skiff recovery: the tow owner's own dock receipt ----

test('PL-313: a via-tow dock opens the key and airs once', () => {
  const h = makeHarness();
  tuneStatic(h);
  h.bus.emit('dock:docked', { stationId: TOWN, shipId: 'player' }); // ordinary dock
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-313').key], undefined);
  h.state.simTime += 60;
  h.bus.emit('dock:docked', { stationId: TOWN, shipId: 'player', via: 'tow' });
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-313').key], true, 'deed key opens');
  assert.equal(airExact(h, rowBy('PL-313').text), 1, 'exactly one airing');
});

test('PL-313 negative: ordinary docks never latch', () => {
  const h = makeHarness();
  tuneStatic(h);
  for (let i = 0; i < 5; i += 1) {
    h.bus.emit('dock:docked', { stationId: TOWN, shipId: 'player' });
    h.state.simTime += 60;
  }
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-313').key], undefined);
  assert.equal(h.voices.some((v) => v.text === rowBy('PL-313').text), false);
});

// ---- PL-314 — wash-included: repair then hull wash at the same dock ----

test('PL-314: repair followed by a hull wash at the same dock opens the key and airs once', () => {
  const h = makeHarness();
  tuneStatic(h);
  h.state.simTime = 100;
  h.bus.emit('service:completed', { type: 'repair', stationId: TOWN, atT: 100 });
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-314').key], undefined, 'not until the wash lands');
  h.state.simTime = 200;
  h.bus.emit('service:completed', { type: 'hull_wash', stationId: TOWN, atT: 200 });
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-314').key], true, 'deed key opens');
  assert.equal(airExact(h, rowBy('PL-314').text), 1, 'exactly one airing');
});

test('PL-314 negatives: a wash alone, a stale repair, or another dock never latch', () => {
  const h = makeHarness();
  tuneStatic(h);
  h.state.simTime = 100;
  h.bus.emit('service:completed', { type: 'hull_wash', stationId: TOWN, atT: 100 });
  h.state.simTime = 120;
  h.bus.emit('service:completed', { type: 'repair', stationId: TOWN, atT: 120 });
  h.state.simTime = 120 + 601; // past the visit window
  h.bus.emit('service:completed', { type: 'hull_wash', stationId: TOWN, atT: 721 });
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-314').key], undefined);
  h.state.simTime = 800;
  h.bus.emit('service:completed', { type: 'repair', stationId: OUTPOST, atT: 800 });
  h.state.simTime = 850;
  h.bus.emit('service:completed', { type: 'hull_wash', stationId: TOWN, atT: 850 }); // other dock
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-314').key], undefined);
  assert.equal(h.voices.some((v) => v.text === rowBy('PL-314').text), false);
});

// ---- PL-315 — three yields in one shift ----

test('PL-315: three give-ways in one core day open the key and air once', () => {
  const h = makeHarness();
  tuneStatic(h);
  giveWay(h, OUTPOST, 10);
  giveWay(h, OUTPOST, 40);
  giveWay(h, OUTPOST, 70);
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-315').key], true, 'deed key opens');
  assert.equal(airExact(h, rowBy('PL-315').text), 1, 'exactly one airing');
});

test('PL-315 negatives: two yields, or yields spread across a shift break, never latch', () => {
  const h = makeHarness();
  tuneStatic(h);
  giveWay(h, OUTPOST, 10);
  giveWay(h, OUTPOST, 40);
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-315').key], undefined);
  giveWay(h, OUTPOST, 700); // next core day: the shift ledger resets
  giveWay(h, OUTPOST, 730);
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-315').key], undefined);
  assert.equal(h.voices.some((v) => v.text === rowBy('PL-315').text), false);
});

// ---- PL-316 — convoy pace: released the surrendered stranger's line inside dock range ----

test('PL-316: pacing a surrendered stranger into dock range opens the key and airs once', () => {
  const h = makeHarness();
  tuneStatic(h);
  h.state.simTime = 100;
  h.bus.emit('dock:range', { stationId: TOWN, shipId: 'player', inRange: true });
  h.bus.emit('surrender:tethered', { entityId: 'stranger_9', recoveryKind: 'surrendered', phase: 'tethered' });
  h.state.simTime = 150;
  h.bus.emit('massline:releaseValidated', { entityId: 'stranger_9', releaseId: 'r1' });
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-316').key], true, 'deed key opens');
  assert.equal(airExact(h, rowBy('PL-316').text), 1, 'exactly one airing');
});

test('PL-316 negatives: a release out of range, or of another hull, never latch', () => {
  const h = makeHarness();
  tuneStatic(h);
  h.bus.emit('surrender:tethered', { entityId: 'stranger_10', recoveryKind: 'surrendered', phase: 'tethered' });
  h.state.simTime = 100;
  h.bus.emit('massline:releaseValidated', { entityId: 'stranger_10', releaseId: 'r2' }); // not in range
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-316').key], undefined);
  h.state.simTime = 150;
  h.bus.emit('dock:range', { stationId: TOWN, shipId: 'player', inRange: true });
  h.bus.emit('surrender:tethered', { entityId: 'stranger_11', recoveryKind: 'surrendered', phase: 'tethered' });
  h.bus.emit('massline:releaseValidated', { entityId: 'stranger_10', releaseId: 'r3' }); // different hull
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-316').key], undefined);
  assert.equal(h.voices.some((v) => v.text === rowBy('PL-316').text), false);
});

// ---- PL-317 — dawn watch: holding slow station in dock range across day break ----

test('PL-317: holding slow station across a dawn opens the key and airs once', () => {
  const h = makeHarness();
  tuneStatic(h);
  h.state.simTime = 590; // late in core day 0
  h.bus.emit('dock:range', { stationId: TOWN, shipId: 'player', inRange: true });
  h.state.simTime = 605; // dawn, core day 1
  h.system.update(0, h.state);
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-317').key], true, 'deed key opens');
  assert.equal(airExact(h, rowBy('PL-317').text), 1, 'exactly one airing');
});

test('PL-317 negatives: a hull that never slows, or leaves before dawn, never latch', () => {
  const h = makeHarness();
  tuneStatic(h);
  const player = h.state.entities.get('player');
  player.vel = { x: 40, z: 0 };
  h.state.simTime = 590;
  h.bus.emit('dock:range', { stationId: TOWN, shipId: 'player', inRange: true });
  h.state.simTime = 605;
  h.system.update(0, h.state);
  h.state.simTime = 700;
  h.system.update(0, h.state);
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-317').key], undefined, 'still moving at dawn');
  h.bus.emit('dock:range', { stationId: TOWN, shipId: 'player', inRange: false }); // left before slowing
  player.vel = { x: 0, z: 0 };
  h.state.simTime = 710;
  h.system.update(0, h.state);
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-317').key], undefined, 'left before the watch counted');
  h.state.simTime = 1195; // a fresh night watch, slow this time
  h.bus.emit('dock:range', { stationId: TOWN, shipId: 'player', inRange: true });
  h.state.simTime = 1210;
  h.system.update(0, h.state);
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-317').key], true);
  assert.equal(airExact(h, rowBy('PL-317').text), 1);
});

// ---- PL-318 — kindness chalks: three distinct mercy deeds in one session ----

test('PL-318: the third distinct mercy deed puts the callsign on the chalks', () => {
  const h = makeHarness();
  tuneStatic(h);
  h.bus.emit('achievement:unlocked', { id: 'medal_a', retroactive: false }); // deed 1 (PL-319)
  h.state.simTime = 100;
  h.bus.emit('dock:docked', { stationId: OUTPOST, shipId: 'player', via: 'tow' }); // deed 2 (PL-313)
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-318').key], undefined, 'two deeds is not a fan letter');
  giveWay(h, TOWN, 200); // deed 3 (PL-305)
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-318').key], true, 'deed key opens');
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-305').key], true);
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-313').key], true);
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-319').key], true);
  assert.equal(airExact(h, rowBy('PL-318').text), 1, 'exactly one airing');
});

test('PL-318 negative: repeated deeds of the same kind do not settle new chalks', () => {
  const h = makeHarness();
  tuneStatic(h);
  h.bus.emit('achievement:unlocked', { id: 'medal_b', retroactive: false });
  h.bus.emit('achievement:unlocked', { id: 'medal_c', retroactive: false }); // same deed kind
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-318').key], undefined);
  assert.equal(h.voices.some((v) => v.text === rowBy('PL-318').text), false);
});

// ---- PL-319 — medal-note: a fresh achievement unlock ----

test('PL-319: a fresh medal unlock opens the key and airs once', () => {
  const h = makeHarness();
  tuneStatic(h);
  h.bus.emit('achievement:unlocked', { id: 'medal_d', retroactive: false });
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-319').key], true, 'deed key opens');
  assert.equal(airExact(h, rowBy('PL-319').text), 1, 'exactly one airing');
});

test('PL-319 negative: retroactive backfills are the archive, not a deed', () => {
  const h = makeHarness();
  tuneStatic(h);
  h.bus.emit('achievement:unlocked', { id: 'medal_e', retroactive: true });
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-319').key], undefined);
  assert.equal(h.voices.some((v) => v.text === rowBy('PL-319').text), false);
});

// ---- PL-320 — clean takeoff: out of dock range, a full window, no impact ----

test('PL-320: a clean departure opens the key and airs once', () => {
  const h = makeHarness();
  tuneStatic(h);
  giveWay(h, OUTPOST, 100); // departure arms the window
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-320').key], undefined, 'not until the window closes clean');
  h.state.simTime += 35;
  h.system.update(0, h.state);
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-320').key], true, 'deed key opens');
  assert.equal(airExact(h, rowBy('PL-320').text), 1, 'exactly one airing');
});

test('PL-320 negatives: an impact in the window, or somebody else scraping, never latch', () => {
  const h = makeHarness();
  tuneStatic(h);
  giveWay(h, OUTPOST, 100);
  h.bus.emit('physics:impact', { aId: 'player', bId: 'rock_1', impulse: 4 }); // the departure was not clean
  h.state.simTime += 35;
  h.system.update(0, h.state);
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-320').key], undefined);
  giveWay(h, OUTPOST, 300);
  h.bus.emit('physics:impact', { aId: 'npc_5', bId: 'rock_2', impulse: 4 }); // not the player's hull
  h.state.simTime += 35;
  h.system.update(0, h.state);
  assert.equal(h.state.bandRadio.eventKeys[rowBy('PL-320').key], true);
  assert.equal(h.voices.filter((v) => v.text === rowBy('PL-320').text).length, 1);
});

// ---- determinism: the same scenario and seed produce the same voice sequence ----

test('determinism: identical runs produce identical voice sequences', () => {
  const run = () => {
    const h = makeHarness(47);
    tuneStatic(h);
    giveWay(h, OUTPOST, 10);
    giveWay(h, OUTPOST, 40);
    giveWay(h, OUTPOST, 70);
    airExact(h, rowBy('PL-315').text);
    h.state.simTime += 60;
    h.system.update(0, h.state);
    return h.voices;
  };
  assert.deepEqual(run(), run(), 'same seed, same deeds, same voices');
});
