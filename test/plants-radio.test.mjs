// plants-radio — Lane Nine: the Static reports the deed plants (PL-111..PL-256).
//
// Every row: (a) the authored key is in the runtime key set derived from the pack; (b)
// deriveBandEventKeys maps its trigger event to the key and nothing else to it; (c) the real
// trigger (plant receipt, bus seam, or plantsRadioObserver composition) opens the key; (d)
// once the Static is tuned, the row's exact line airs exactly once; (e) repeating the deed
// never stacks a second airing; (f) the near-miss variants never open anything.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { bandRadio, deriveBandEventKeys } from '../src/systems/bandRadio.js';
import { BAND_EVENT_KEYS, BAND_CHANNEL_BY_ID, eligibleBandLines } from '../src/data/bandRadio.js';
import {
  radioObserverPlant,
  RADIO_TOWN_STATION_IDS,
  RADIO_DAY_LENGTH_S,
  RADIO_BEAT_TUG_EVENT,
  RADIO_BELL_CRACKED_EVENT,
  RADIO_THREE_RACE_WINS_EVENT,
  RADIO_FIVE_TOWNS_EVENT,
  RADIO_MARK_TOWNS_EVENT,
} from '../src/systems/plants/radioObserver.js';

function makeHarness(seed = 47, sectorId = 'sector_helios_prime') {
  const bus = createBus();
  const voices = [];
  const queue = { active: null, pending: [] };
  const state = {
    meta: { seed }, simTime: 0, mode: 'flight', ui: { docked: false }, playerId: 'player',
    world: {
      currentSectorId: sectorId,
      sectors: {
        [sectorId]: {
          id: sectorId, factionId: 'faction_scn', tier: 0, security: 0.98,
          stations: [{ factionId: 'faction_scn' }],
        },
      },
    },
    factions: { faction_reach: { rep: 0 } },
    entities: new Map(),
  };
  const registry = { get: (name) => (name === 'voiceArbiter' ? { queue } : null) };
  const helpers = { voice: { say(message) { voices.push(structuredClone(message)); return true; } } };
  const system = Object.create(bandRadio);
  system.init({ state, bus, helpers, registry });
  system.newGame();
  const observer = Object.create(radioObserverPlant);
  observer.init({ state, bus, helpers, registry });
  return { bus, voices, queue, state, system, observer };
}

function tuneStatic(h) {
  h.bus.emit('band:tune', { channelId: 'the_static', source: 'test' });
  h.system.update(0, h.state); // ident
  h.state.simTime += 60;
  h.system.update(0, h.state); // one ordinary rotation line
}

// The row table: key + final copy + the bus event whose receipt opens the key.
const ROWS = [
  { pl: 'PL-111', key: 'player.beat_tug_to_wreck', event: RADIO_BEAT_TUG_EVENT, text: 'Today, the tug came second.' },
  { pl: 'PL-112', key: 'player.rode_the_plume', event: 'plants:pl246:taken', text: 'Heard the Plume had a passenger.' },
  { pl: 'PL-113', key: 'player.settled_whole_list', event: 'law:obligationPaid', text: 'Kind Regards reports all square. Suspicious.' },
  { pl: 'PL-134', key: 'player.yard_lamp_first_night', event: 'plants:pl146:call', text: "New light in the belt. Somebody's home." },
  { pl: 'PL-135', key: 'player.cracked_ceres_bell', event: RADIO_BELL_CRACKED_EVENT, text: "Bell sounds different. Nobody's saying who." },
  { pl: 'PL-136', key: 'player.three_races_one_day', event: RADIO_THREE_RACE_WINS_EVENT, text: 'Somebody get that rope a licence.' },
  { pl: 'PL-160', key: 'player.returned_stolen_cargo', event: 'plants:chasedThief', text: 'Stolen goods came home today. No questions.' },
  { pl: 'PL-161', key: 'player.yard_held_first_raid', event: 'claim:raidRepelled', text: 'The rock with the light kept its light.' },
  { pl: 'PL-162', key: 'player.five_towns_one_day', event: RADIO_FIVE_TOWNS_EVENT, text: 'Five towns, one rope, one day.' },
  { pl: 'PL-185', key: 'player.cut_another_tow_line', event: 'massline:npcLineCut', text: 'A line was cut out there. Neat work.' },
  { pl: 'PL-186', key: 'player.quenched_hot_cargo', event: 'plants:pl181:quenched', text: "Steam over Vesta. Somebody's freight ran hot." },
  { pl: 'PL-187', key: 'player.threaded_arch_inhale', event: 'plants:theArch', text: 'Somebody threaded the arch on the inhale.' },
  { pl: 'PL-209', key: 'player.relit_dead_lane', event: 'plants:deadLaneRelit', text: 'Dead lane relit. Traffic appreciates it.' },
  { pl: 'PL-210', key: 'player.slate_mended_overnight', event: 'plants:weldersSparks', text: "Somebody left a welder work. It's done." },
  { pl: 'PL-211', key: 'player.kid_took_a_race', event: 'mission:completed', text: 'One of the crescent kids took a race.' },
  { pl: 'PL-240', key: 'player.mark_all_five_towns', event: RADIO_MARK_TOWNS_EVENT, text: "That mark's been around. So has its rope." },
  { pl: 'PL-241', key: 'player.towed_playing_dead', event: 'plants:mistakenTow', text: 'One derelict recovered. It waved.' },
  { pl: 'PL-242', key: 'player.froze_wasp_figurehead', event: 'plants:figurehead', text: 'The ice barge has a new figurehead.' },
  { pl: 'PL-254', key: 'player.weighed_wreck_on_scale', event: 'plants:pl247:scandal', text: 'Somebody weighed a wreck. The Scale held.' },
  { pl: 'PL-255', key: 'player.pushed_stranger_dock', event: 'plants:strangerDelivered', text: 'Good turn out there. Logged.' },
  { pl: 'PL-256', key: 'player.fines_settled_full', event: 'law:fineAssessed', text: 'Fines settled in full. Unusual.' },
];

const rowBy = (pl) => ROWS.find((row) => row.pl === pl);

test('every Lane Nine row is authored on the Static with its exact final copy', () => {
  const channel = BAND_CHANNEL_BY_ID.the_static;
  for (const row of ROWS) {
    assert.ok(BAND_EVENT_KEYS.includes(row.key), `${row.pl} key ${row.key} must derive from the pack`);
    const lines = eligibleBandLines(channel, { eventKeys: { [row.key]: true }, reachRep: 0 })
      .filter((line) => line.eventKey === row.key);
    assert.equal(lines.length, 1, `${row.pl}: exactly one authored line`);
    assert.equal(lines[0].text, row.text, `${row.pl}: byte-exact final copy`);
    assert.equal(lines[0].id.startsWith('static_'), true, `${row.pl}: airs on the_static`);
  }
});

test('deriveBandEventKeys contract: the trigger event maps, everything else does not', () => {
  const lawState = {
    playerId: 'player', ui: { docked: true },
    lawSecurity: { composed: {
      'restitution:c1': { kind: 'restitution', causeId: 'c1', status: 'paid' },
      'restitution:c2': { kind: 'restitution', causeId: 'c2', status: 'paid' },
    } },
  };
  const checks = [
    ['plants:radio:beatTugToWreck', {}, {}, 'player.beat_tug_to_wreck'],
    ['plants:pl246:taken', {}, {}, 'player.rode_the_plume'],
    ['law:obligationPaid', { kind: 'restitution', status: 'paid' }, lawState, 'player.settled_whole_list'],
    ['plants:pl146:call', { visit: 1 }, {}, 'player.yard_lamp_first_night'],
    ['plants:radio:bellCracked', {}, {}, 'player.cracked_ceres_bell'],
    ['plants:radio:threeRaceWins', {}, {}, 'player.three_races_one_day'],
    ['plants:chasedThief', { kind: 'lined' }, {}, 'player.returned_stolen_cargo'],
    ['claim:raidRepelled', {}, {}, 'player.yard_held_first_raid'],
    ['claim:defenseResolved', { outcome: 'defended' }, {}, 'player.yard_held_first_raid'],
    ['plants:radio:fiveTownsOneDay', {}, {}, 'player.five_towns_one_day'],
    ['massline:npcLineCut', {}, {}, 'player.cut_another_tow_line'],
    ['plants:pl181:quenched', {}, {}, 'player.quenched_hot_cargo'],
    ['plants:theArch', { kind: 'threadedNarrow' }, {}, 'player.threaded_arch_inhale'],
    ['plants:deadLaneRelit', {}, {}, 'player.relit_dead_lane'],
    ['plants:weldersSparks', { kind: 'mended' }, {}, 'player.slate_mended_overnight'],
    ['mission:completed', { racingContractId: 'rc', racePosition: 2, raceEntrants: 4 },
      { world: { currentSectorId: 'sector_helios_prime' } }, 'player.kid_took_a_race'],
    ['plants:radio:markAllTowns', {}, {}, 'player.mark_all_five_towns'],
    ['plants:mistakenTow', {}, {}, 'player.towed_playing_dead'],
    ['plants:figurehead', { kind: 'stuck' }, {}, 'player.froze_wasp_figurehead'],
    ['plants:pl247:scandal', {}, {}, 'player.weighed_wreck_on_scale'],
    ['plants:strangerDelivered', {}, {}, 'player.pushed_stranger_dock'],
    ['law:fineAssessed', { paid: true, choice: 'pay' }, {}, 'player.fines_settled_full'],
  ];
  for (const [event, payload, state, key] of checks) {
    assert.deepEqual(deriveBandEventKeys(event, payload, state), [key],
      `${event} must map to ${key}`);
    assert.deepEqual(deriveBandEventKeys('some:unrelatedEvent', payload, state), [],
      `${event} must not leak onto other events`);
  }
});

// ---- trigger compositions ----

function setupTugAndWreck(h, assistedId = 'wreck_9') {
  h.state.simTime = 5;
  h.state.entities.set('tug_1', {
    id: 'tug_1', type: 'ship', alive: true, pos: { x: 0, z: 0 },
    data: { trafficRole: 'tug', assistingShipId: assistedId },
  });
  h.state.entities.set(assistedId, { id: assistedId, type: 'ship', alive: true, pos: { x: 6, z: 6 }, data: {} });
  h.observer.update(0.5, h.state); // the sweep notices the tug still inbound
}

function dockSequence(h, stations, startAt = 10) {
  stations.forEach((stationId, i) => {
    h.state.simTime = startAt + i;
    h.bus.emit('dock:docked', { stationId, shipId: 'player' });
  });
}

const TRIGGERS = {
  'PL-111': {
    pre: (h) => setupTugAndWreck(h),
    fire: (h) => h.bus.emit('entity:killed', { killerId: 'player', id: 'wreck_9', type: 'ship' }),
    repeat: (h) => setupTugAndWreck(h, 'wreck_10')
      && h.bus.emit('entity:killed', { killerId: 'player', id: 'wreck_10', type: 'ship' }),
  },
  'PL-112': {
    fire: (h) => h.bus.emit('plants:pl246:taken', { cycle: 3, distanceWu: 40, t: h.state.simTime }),
    repeat: (h) => h.bus.emit('plants:pl246:taken', { cycle: 4, distanceWu: 12, t: h.state.simTime }),
  },
  'PL-113': {
    pre: (h) => {
      h.state.ui.docked = true;
      h.state.lawSecurity = { composed: {
        'restitution:c1': { kind: 'restitution', causeId: 'c1', status: 'paid' },
        'restitution:c2': { kind: 'restitution', causeId: 'c2', status: 'paid' },
      } };
    },
    fire: (h) => h.bus.emit('law:obligationPaid', { kind: 'restitution', causeId: 'c2', status: 'paid', key: 'restitution:c2' }),
    after: (h) => { h.state.ui.docked = false; },
    repeat: (h) => {
      h.state.ui.docked = true;
      h.bus.emit('law:obligationPaid', { kind: 'restitution', causeId: 'c1', status: 'paid', key: 'restitution:c1' });
      h.state.ui.docked = false;
    },
  },
  'PL-134': {
    fire: (h) => h.bus.emit('plants:pl146:call', { visit: 1, t: h.state.simTime }),
    repeat: (h) => h.bus.emit('plants:pl146:call', { visit: 2, t: h.state.simTime }),
  },
  'PL-135': {
    harness: (seed) => makeHarness(seed, 'sector_ceres_belt'),
    pre: (h) => {
      h.state.entities.set('bell_1', { id: 'bell_1', type: 'beacon', alive: true, data: { plantsPl245Bell: true } });
      h.state.entities.set('player', { id: 'player', type: 'ship', alive: true, data: {} });
      h.observer.update(0.5, h.state);
    },
    fire: (h) => h.bus.emit('physics:impact', { aId: 'bell_1', bId: 'player' }),
    repeat: (h) => {
      h.state.simTime += 10; // past the crack cooldown
      h.bus.emit('physics:impact', { aId: 'player', bId: 'bell_1' });
    },
  },
  'PL-136': {
    fire: (h) => {
      [10, 20, 30].forEach((t) => {
        h.state.simTime = t;
        h.bus.emit('mission:completed', { type: 'race', racingContractId: `rc_${t}`, racePosition: 1, raceEntrants: 4 });
      });
    },
    repeat: (h) => {
      h.state.simTime = 40;
      h.bus.emit('mission:completed', { type: 'race', racingContractId: 'rc_40', racePosition: 1, raceEntrants: 4 });
    },
  },
  'PL-160': {
    fire: (h) => h.bus.emit('plants:chasedThief', { kind: 'lined', thiefId: 'thief_1', podId: 'pod_1', t: h.state.simTime }),
    repeat: (h) => h.bus.emit('plants:chasedThief', { kind: 'lined', thiefId: 'thief_2', podId: 'pod_2', t: h.state.simTime }),
  },
  'PL-161': {
    fire: (h) => h.bus.emit('claim:raidRepelled', { bodyId: 'body_1', defense: 3 }),
    repeat: (h) => h.bus.emit('claim:defenseResolved', { bodyId: 'body_1', outcome: 'defended' }),
  },
  'PL-162': {
    fire: (h) => dockSequence(h, RADIO_TOWN_STATION_IDS.slice(0, 5)),
    repeat: (h) => dockSequence(h, ['station_helios', RADIO_TOWN_STATION_IDS[5]], 60),
  },
  'PL-185': {
    fire: (h) => h.bus.emit('massline:npcLineCut', { schemaVersion: 1, ownerId: 'npc_1', targetId: 'rock_2', integrity: 1 }),
    repeat: (h) => h.bus.emit('massline:npcLineCut', { schemaVersion: 1, ownerId: 'npc_3', targetId: 'rock_4', integrity: 1 }),
  },
  'PL-186': {
    fire: (h) => h.bus.emit('plants:pl181:quenched', { entityId: 'pod_1', t: h.state.simTime }),
    repeat: (h) => h.bus.emit('plants:pl181:quenched', { entityId: 'pod_2', t: h.state.simTime }),
  },
  'PL-187': {
    fire: (h) => h.bus.emit('plants:theArch', { kind: 'threadedNarrow', gap: 44, t: h.state.simTime }),
    repeat: (h) => h.bus.emit('plants:theArch', { kind: 'threadedNarrow', gap: 44, t: h.state.simTime + 40 }),
  },
  'PL-209': {
    fire: (h) => h.bus.emit('plants:deadLaneRelit', { beaconId: 'bcn_1', t: h.state.simTime }),
    repeat: (h) => h.bus.emit('plants:deadLaneRelit', { beaconId: 'bcn_2', t: h.state.simTime }),
  },
  'PL-210': {
    fire: (h) => h.bus.emit('plants:weldersSparks', { kind: 'mended', podId: 'pod_1', t: h.state.simTime }),
    repeat: (h) => h.bus.emit('plants:weldersSparks', { kind: 'mended', podId: 'pod_2', t: h.state.simTime }),
  },
  'PL-211': {
    fire: (h) => h.bus.emit('mission:completed', { type: 'race', racingContractId: 'rc_x', racePosition: 2, raceEntrants: 4 }),
    repeat: (h) => h.bus.emit('mission:completed', { type: 'race', racingContractId: 'rc_y', racePosition: 3, raceEntrants: 4 }),
  },
  'PL-240': {
    // PL-104 stamps this stock number on the real hull data.
    pre: (h) => {
      h.state.entities.set('player', { id: 'player', type: 'ship', alive: true, data: { plantsPl104StockNumber: 'K-77' } });
    },
    fire: (h) => dockSequence(h, RADIO_TOWN_STATION_IDS.slice(0, 5), 20),
    repeat: (h) => dockSequence(h, ['station_helios', RADIO_TOWN_STATION_IDS[6]], 80),
  },
  'PL-241': {
    fire: (h) => h.bus.emit('plants:mistakenTow', { patrolId: 'patrol_1', playerId: 'player', tugId: 'tug_1', t: h.state.simTime }),
    repeat: (h) => h.bus.emit('plants:mistakenTow', { patrolId: 'patrol_2', playerId: 'player', tugId: 'tug_2', t: h.state.simTime }),
  },
  'PL-242': {
    fire: (h) => h.bus.emit('plants:figurehead', { kind: 'stuck', figureheadId: 'fh_1', bargeId: 'barge_1', waspId: 'wasp_1', rideS: 40, t: h.state.simTime }),
    repeat: (h) => h.bus.emit('plants:figurehead', { kind: 'stuck', figureheadId: 'fh_2', bargeId: 'barge_2', waspId: 'wasp_2', rideS: 40, t: h.state.simTime }),
  },
  'PL-254': {
    fire: (h) => h.bus.emit('plants:pl247:scandal', { wreckId: 'wreck_1', mass: 220, number: 12.4, t: h.state.simTime }),
    repeat: (h) => h.bus.emit('plants:pl247:scandal', { wreckId: 'wreck_2', mass: 180, number: 88, t: h.state.simTime }),
  },
  'PL-255': {
    fire: (h) => h.bus.emit('plants:strangerDelivered', { strangerId: 'stranger_1', stationId: 'station_helios', t: h.state.simTime }),
    repeat: (h) => h.bus.emit('plants:strangerDelivered', { strangerId: 'stranger_2', stationId: 'station_ceres', t: h.state.simTime }),
  },
  'PL-256': {
    fire: (h) => h.bus.emit('law:fineAssessed', { stationId: 'station_helios', amount: 500, paid: true, choice: 'pay', heatLevel: 1, wantedTier: 'scan' }),
    repeat: (h) => h.bus.emit('law:fineAssessed', { stationId: 'station_ceres', amount: 300, paid: true, choice: 'pay', heatLevel: 1, wantedTier: 'scan' }),
  },
};

for (const row of ROWS) {
  test(`${row.pl}: ${row.key} opens on the deed and the Static airs the exact line once`, () => {
    const spec = TRIGGERS[row.pl];
    const h = spec.harness ? spec.harness(47) : makeHarness();
    tuneStatic(h);
    if (spec.pre) spec.pre(h);
    assert.equal(h.state.bandRadio.eventKeys[row.key], undefined, 'the key is shut before the deed');

    spec.fire(h);
    assert.equal(h.state.bandRadio.eventKeys[row.key], true, 'the deed opens the key');

    if (spec.after) spec.after(h);
    // Some compositions rewind simTime (day windows, dock sequences); clear the cadence line
    // by a wide margin so the report rotation actually reaches the pending receipt.
    h.state.simTime += 120;
    h.system.update(0, h.state);
    const aired = h.voices.filter((v) => v.text === row.text);
    assert.equal(aired.length, 1, `exactly one report aired, got: ${JSON.stringify(h.voices.map((v) => v.text))}`);
    assert.equal(aired[0].channel, 'band');
    assert.equal(aired[0].kind, 'band');

    // The receipt is heard once: repeating the deed never stacks a second airing.
    spec.repeat(h);
    h.state.simTime += 60;
    h.system.update(0, h.state);
    h.state.simTime += 60;
    h.system.update(0, h.state);
    assert.equal(h.voices.filter((v) => v.text === row.text).length, 1, 'the band moves on after one airing');
  });
}

// ---- negatives: the near-miss variants never open anything ----

test('PL-111 negative: a hull nobody is assisting, or a stranger kill, opens nothing', () => {
  const h = makeHarness();
  tuneStatic(h);
  setupTugAndWreck(h);
  h.bus.emit('entity:killed', { killerId: 'player', id: 'unrelated_hull', type: 'ship' });
  h.bus.emit('entity:killed', { killerId: 'npc_7', id: 'wreck_9', type: 'ship' });
  assert.equal(h.state.bandRadio.eventKeys['player.beat_tug_to_wreck'], undefined);
});

test('PL-112 negative: parking with the lane is not riding the Plume', () => {
  const h = makeHarness();
  tuneStatic(h);
  h.bus.emit('plants:pl246:parked', { cycle: 3, t: 10 });
  h.bus.emit('plants:pl246:warn', { cycle: 3, t: 10 });
  assert.equal(h.state.bandRadio.eventKeys['player.rode_the_plume'], undefined);
});

test('PL-113 negative: an open list, a toll bill, or paying away from a dock opens nothing', () => {
  const h = makeHarness();
  tuneStatic(h);
  h.state.lawSecurity = { composed: {
    'restitution:c1': { kind: 'restitution', causeId: 'c1', status: 'paid' },
    'restitution:c2': { kind: 'restitution', causeId: 'c2', status: 'open' },
  } };
  h.state.ui.docked = true;
  h.bus.emit('law:obligationPaid', { kind: 'restitution', causeId: 'c1', status: 'paid' });
  assert.equal(h.state.bandRadio.eventKeys['player.settled_whole_list'], undefined);

  h.state.lawSecurity = { composed: {
    'restitution:c1': { kind: 'restitution', causeId: 'c1', status: 'paid' },
    'toll:t1': { kind: 'toll', causeId: 't1', status: 'paid' },
  } };
  h.bus.emit('law:obligationPaid', { kind: 'toll', causeId: 't1', status: 'paid' });
  assert.equal(h.state.bandRadio.eventKeys['player.settled_whole_list'], undefined);

  h.state.lawSecurity = { composed: { 'restitution:c1': { kind: 'restitution', causeId: 'c1', status: 'paid' } } };
  h.state.ui.docked = false;
  h.bus.emit('law:obligationPaid', { kind: 'restitution', causeId: 'c1', status: 'paid' });
  assert.equal(h.state.bandRadio.eventKeys['player.settled_whole_list'], undefined);
});

test('PL-134 negative: the weekly caller is not the first night', () => {
  const h = makeHarness();
  tuneStatic(h);
  h.bus.emit('plants:pl146:call', { visit: 2, t: 10 });
  assert.equal(h.state.bandRadio.eventKeys['player.yard_lamp_first_night'], undefined);
});

test('PL-135 negative: a stranger hitting the Bell, or the player missing it, opens nothing', () => {
  const h = makeHarness(47, 'sector_ceres_belt');
  tuneStatic(h);
  h.state.entities.set('bell_1', { id: 'bell_1', type: 'beacon', alive: true, data: { plantsPl245Bell: true } });
  h.state.entities.set('player', { id: 'player', type: 'ship', alive: true, data: {} });
  h.observer.update(0.5, h.state);
  h.bus.emit('physics:impact', { aId: 'bell_1', bId: 'npc_1' });
  h.bus.emit('physics:impact', { aId: 'rock_1', bId: 'player' });
  assert.equal(h.state.bandRadio.eventKeys['player.cracked_ceres_bell'], undefined);
  h.bus.emit('entity:killed', { id: 'bell_1', killerId: 'npc_2' });
  assert.equal(h.state.bandRadio.eventKeys['player.cracked_ceres_bell'], undefined);
});

test('PL-136 negative: two wins, a P2 finish, or wins across a day change open nothing', () => {
  const h = makeHarness();
  tuneStatic(h);
  const win = (t, rc) => {
    h.state.simTime = t;
    h.bus.emit('mission:completed', { type: 'race', racingContractId: rc, racePosition: 1, raceEntrants: 4 });
  };
  win(10, 'rc_a');
  win(20, 'rc_b');
  assert.equal(h.state.bandRadio.eventKeys['player.three_races_one_day'], undefined);
  h.bus.emit('mission:completed', { type: 'race', racingContractId: 'rc_c', racePosition: 2, raceEntrants: 4 });
  assert.equal(h.state.bandRadio.eventKeys['player.three_races_one_day'], undefined);
  win(700, 'rc_d'); // core day 1: the earlier two no longer count
  assert.equal(h.state.bandRadio.eventKeys['player.three_races_one_day'], undefined);
  h.bus.emit('mission:completed', { type: 'race', racingContractId: 'rc_e', racePosition: 1, raceEntrants: 1 });
  assert.equal(h.state.bandRadio.eventKeys['player.three_races_one_day'], undefined,
    'a time trial with no field is not a win');
});

test('PL-160 negative: blocking the haulers or the reset receipt is not the return', () => {
  const h = makeHarness();
  tuneStatic(h);
  h.bus.emit('plants:chasedThief', { kind: 'blocked', thiefId: 'thief_1', t: 10 });
  h.bus.emit('plants:chasedThief', { kind: 'block_broken', t: 11 });
  h.bus.emit('plants:chasedThief', { kind: 'reset', reason: 'sector_exit', t: 12 });
  assert.equal(h.state.bandRadio.eventKeys['player.returned_stolen_cargo'], undefined);
});

test('PL-161 negative: a lost raid is the raiders story', () => {
  const h = makeHarness();
  tuneStatic(h);
  h.bus.emit('claim:defenseResolved', { bodyId: 'body_1', outcome: 'lost' });
  h.bus.emit('claim:raided', { bodyId: 'body_1', outcome: 'lost', lostU: 4 });
  assert.equal(h.state.bandRadio.eventKeys['player.yard_held_first_raid'], undefined);
});

test('PL-162 negative: four towns, one repeat dock, or a day change opens nothing', () => {
  const h = makeHarness();
  tuneStatic(h);
  dockSequence(h, RADIO_TOWN_STATION_IDS.slice(0, 4));
  assert.equal(h.state.bandRadio.eventKeys['player.five_towns_one_day'], undefined);
  dockSequence(h, ['station_helios'], 30); // a dock already counted
  assert.equal(h.state.bandRadio.eventKeys['player.five_towns_one_day'], undefined);
  dockSequence(h, ['station_ceres'], 700); // core day 1: the day's set resets
  assert.equal(h.state.bandRadio.eventKeys['player.five_towns_one_day'], undefined);
});

test('PL-185 negative: the player losing their own line is not the cut', () => {
  const h = makeHarness();
  tuneStatic(h);
  h.bus.emit('massline:playerLineCut', { schemaVersion: 1, ownerId: 'player' });
  h.bus.emit('massline:snareCut', { schemaVersion: 1 });
  assert.equal(h.state.bandRadio.eventKeys['player.cut_another_tow_line'], undefined);
});

test('PL-186 negative: heated or roasted pods are not the quench', () => {
  const h = makeHarness();
  tuneStatic(h);
  h.bus.emit('plants:pl181:heated', { entityId: 'pod_1', t: 10 });
  h.bus.emit('plants:pl181:roasted', { stationId: 'station_forge', count: 1, t: 12 });
  assert.equal(h.state.bandRadio.eventKeys['player.quenched_hot_cargo'], undefined);
});

test('PL-187 negative: the wide exhale crossing is the clean one, not the story', () => {
  const h = makeHarness();
  tuneStatic(h);
  h.bus.emit('plants:theArch', { kind: 'threadedWide', gap: 96, t: 10 });
  assert.equal(h.state.bandRadio.eventKeys['player.threaded_arch_inhale'], undefined);
});

test('PL-209 negative: horns in the dark or the lane going dark open nothing', () => {
  const h = makeHarness();
  tuneStatic(h);
  h.bus.emit('plants:deadLaneDark', { beaconId: 'bcn_1', t: 10 });
  h.bus.emit('plants:deadLaneHorn', { hullId: 'hauler_1', t: 12 });
  h.bus.emit('plants:deadLaneThanks', { until: 200, t: 13 });
  assert.equal(h.state.bandRadio.eventKeys['player.relit_dead_lane'], undefined);
});

test('PL-210 negative: stashing or the engraved-stolen return is not the mended deed', () => {
  const h = makeHarness();
  tuneStatic(h);
  h.bus.emit('plants:weldersSparks', { kind: 'stashed', podId: 'pod_1', stolen: false, t: 10 });
  h.bus.emit('plants:weldersSparks', { kind: 'mended_engraved', podId: 'pod_2', ownerTag: 'MERIDIAN', t: 20 });
  h.bus.emit('plants:weldersSparks', { kind: 'reset', reason: 'sector_exit', t: 30 });
  assert.equal(h.state.bandRadio.eventKeys['player.slate_mended_overnight'], undefined);
});

test('PL-211 negative: winning, a solo clock, or losing outside the crescent opens nothing', () => {
  const h = makeHarness();
  tuneStatic(h);
  h.bus.emit('mission:completed', { type: 'race', racingContractId: 'rc_1', racePosition: 1, raceEntrants: 4 });
  assert.equal(h.state.bandRadio.eventKeys['player.kid_took_a_race'], undefined);
  h.bus.emit('mission:completed', { type: 'race', racingContractId: 'rc_2', racePosition: 2, raceEntrants: 1 });
  assert.equal(h.state.bandRadio.eventKeys['player.kid_took_a_race'], undefined);
  const sectorId = h.state.world.currentSectorId;
  h.state.world.currentSectorId = 'sector_tethys_junction';
  h.bus.emit('mission:completed', { type: 'race', racingContractId: 'rc_3', racePosition: 2, raceEntrants: 4 });
  h.state.world.currentSectorId = sectorId;
  assert.equal(h.state.bandRadio.eventKeys['player.kid_took_a_race'], undefined);
});

test('PL-240 negative: no mark, four towns, or a repeated dock opens nothing', () => {
  const h = makeHarness();
  tuneStatic(h);
  dockSequence(h, RADIO_TOWN_STATION_IDS.slice(0, 5), 10);
  assert.equal(h.state.bandRadio.eventKeys['player.mark_all_five_towns'], undefined,
    'an unmarked hull wears nothing anywhere');
  h.state.entities.set('player', { id: 'player', type: 'ship', alive: true, data: { factionMark: 'faction_reach' } });
  dockSequence(h, RADIO_TOWN_STATION_IDS.slice(0, 4), 30);
  assert.equal(h.state.bandRadio.eventKeys['player.mark_all_five_towns'], undefined);
  dockSequence(h, ['station_helios'], 40);
  assert.equal(h.state.bandRadio.eventKeys['player.mark_all_five_towns'], undefined);
});

test('PL-241 negative: the sweep and the wave-off are not the tow', () => {
  const h = makeHarness();
  tuneStatic(h);
  h.bus.emit('plants:mistakenSweep', { patrolId: 'p_1', playerId: 'player', taps: 2, t: 10 });
  h.bus.emit('plants:mistakenWaveOff', { patrolId: 'p_1', playerId: 'player', t: 12 });
  assert.equal(h.state.bandRadio.eventKeys['player.towed_playing_dead'], undefined);
});

test('PL-242 negative: thawing off or the barge leaving is not the figurehead', () => {
  const h = makeHarness();
  tuneStatic(h);
  h.bus.emit('plants:figurehead', { kind: 'thawed_off', figureheadId: 'fh_1', t: 45 });
  h.bus.emit('plants:figurehead', { kind: 'barge_out', bargeId: 'barge_1', t: 50 });
  assert.equal(h.state.bandRadio.eventKeys['player.froze_wasp_figurehead'], undefined);
});

test('PL-254 negative: a quiet ordinary weigh is not the wreck scandal', () => {
  const h = makeHarness();
  tuneStatic(h);
  h.bus.emit('plants:pl247:weighed', { entityId: 'crate_1', type: 'payload', mass: 4, t: 10 });
  assert.equal(h.state.bandRadio.eventKeys['player.weighed_wreck_on_scale'], undefined);
});

test('PL-255 negative: hailed or passed, the stranger is not delivered', () => {
  const h = makeHarness();
  tuneStatic(h);
  h.bus.emit('plants:strangerHail', { strangerId: 's_1', t: 10 });
  h.bus.emit('plants:strangerPassed', { strangerId: 's_1', karma: -1, t: 40 });
  h.bus.emit('plants:noHelpCame', { karma: -1, t: 90 });
  assert.equal(h.state.bandRadio.eventKeys['player.pushed_stranger_dock'], undefined);
});

test('PL-256 negative: an offer, leaving, working, or a shortfall is not settled in full', () => {
  const h = makeHarness();
  tuneStatic(h);
  h.bus.emit('law:fineAssessed', { stationId: 'station_helios', amount: 500, paid: false, offer: true, heatLevel: 1, wantedTier: 'scan' });
  h.bus.emit('law:fineAssessed', { stationId: 'station_helios', amount: 500, paid: false, choice: 'leave', heatLevel: 1, wantedTier: 'scan' });
  h.bus.emit('law:fineAssessed', { stationId: 'station_helios', amount: 500, paid: false, choice: 'work', heatLevel: 1, wantedTier: 'scan' });
  h.bus.emit('law:fineAssessed', { stationId: 'station_helios', amount: 500, paid: false, choice: 'pay', shortfall: 200, heatLevel: 1, wantedTier: 'scan' });
  h.bus.emit('law:fineAssessed', { stationId: 'station_helios', amount: 500, paid: true, choice: 'pay', alreadySettled: true, heatLevel: 1, wantedTier: 'scan' });
  assert.equal(h.state.bandRadio.eventKeys['player.fines_settled_full'], undefined);
});

test('determinism smoke: the same seed flies the PL-112 route to the same heard sequence', () => {
  const run = () => {
    const h = makeHarness(2026);
    tuneStatic(h);
    h.bus.emit('plants:pl246:taken', { cycle: 1, distanceWu: 30, t: 120 });
    h.state.simTime += 60;
    h.system.update(0, h.state);
    h.state.simTime += 60;
    h.system.update(0, h.state);
    return h.voices.map((v) => v.text);
  };
  const first = run();
  const second = run();
  assert.deepEqual(second, first);
  assert.ok(first.includes('Heard the Plume had a passenger.'));
});

test('the observer stays bounded and clears on newGame and destroy', () => {
  const h = makeHarness();
  setupTugAndWreck(h);
  const observer = h.observer;
  assert.equal(observer._tugTargets.has('wreck_9'), true);
  assert.equal(RADIO_TOWN_STATION_IDS.length >= 5, true);
  assert.equal(RADIO_DAY_LENGTH_S, 600);
  observer.destroy();
  assert.equal(observer._tugTargets.size, 0);
  assert.equal(observer._unsubs.length, 0);
});


test('PL-240 fires for the real inventory and under-paint stamp fields', () => {
  for (const field of ['plantsPl104StockNumber', 'plantsPl125UnderPaint']) {
    const h = makeHarness();
    const events = [];
    h.bus.on(RADIO_MARK_TOWNS_EVENT, (p) => events.push(p));
    h.state.entities.set('player', { id: 'player', type: 'ship', alive: true, data: { [field]: 'K-77' } });
    try {
      dockSequence(h, RADIO_TOWN_STATION_IDS.slice(0, 5), 20);
      assert.equal(events.length, 1, `${field} is recognized across five towns`);
      assert.equal(h.state.bandRadio.eventKeys['player.mark_all_five_towns'], true, 'radio deed opens');
    } finally {
      h.observer.destroy();
      h.system.destroy();
    }
  }
});
