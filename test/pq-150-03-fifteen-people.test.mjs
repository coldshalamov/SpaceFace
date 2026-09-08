// PQ-150.03 — Fifteen people, placed.
// Characterization first: if the depth-program fifteen already live at reachable
// stations and each already has one line plus a talk consequence, prove it on
// seed 15003 and stop. Headless. No dialogue trees.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { CONTACT_VOICE_REGISTERS } from '../src/data/barks.js';
import { SECTORS } from '../src/data/sectors.js';
import {
  CONTACT_COUNTER_DEFS,
  stationContactCounterValue,
  stationContactMemoryFor,
} from '../src/data/stationContacts.js';
import {
  DEPTH_PROGRAM_CONTACTS,
  depthContactsForStation,
} from '../src/story/campaign47a/embodiedDialogue.js';
import { stationContacts } from '../src/systems/stationContacts.js';

const SEED = 15003;

const START_SECTOR = 'sector_helios_prime';

// Campaign-progressed route, not a debug compression. Beat 7 is the live
// campaign's last numbered beat; Quiet 25 and three wrecks are the authored
// gates already pinned by test/depth-program-npcs.test.mjs.
const ON_ROUTE = Object.freeze({
  story: { beatIndex: 7 },
  factions: { faction_quiet: { rep: 25 } },
  player: { flags: { uniqueWrecksVisited: ['wreck_a', 'wreck_b', 'wreck_c'] } },
});

const AT_START = Object.freeze({
  story: { beatIndex: 0 },
  factions: {},
  player: { flags: {} },
});

function stationIndex() {
  const byStation = new Map();
  const neighbors = new Map();
  for (const sector of SECTORS) {
    neighbors.set(sector.id, [...(sector.neighbors || [])]);
    for (const station of sector.stations || []) {
      byStation.set(station.id, { station, sector });
    }
  }
  return { byStation, neighbors };
}

function reachableSectors(neighbors, startId) {
  const seen = new Set();
  const queue = [startId];
  while (queue.length) {
    const id = queue.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    for (const next of neighbors.get(id) || []) queue.push(next);
  }
  return seen;
}

function firstReaction(contactId) {
  const voice = CONTACT_VOICE_REGISTERS[contactId];
  const choice = voice && voice.firstContact && voice.firstContact.choices && voice.firstContact.choices[0];
  if (!choice) return null;
  const line = voice.lines[choice.lineIndex];
  if (typeof line !== 'string' || !line.trim()) return null;
  return { choiceId: choice.id, line };
}

function boot(seed = SEED) {
  const sim = createSimulation({
    seed,
    systems: [stationContacts],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = START_SECTOR;
  return { sim, state, bus };
}

test('PQ-150.03 seed 15003: fifteen named people already live at reachable places with a reaction', () => {
  const { byStation, neighbors } = stationIndex();
  const graph = reachableSectors(neighbors, START_SECTOR);
  const { state, bus } = boot(SEED);

  assert.equal(state.meta.seed, SEED);
  assert.equal(DEPTH_PROGRAM_CONTACTS.length, 15);

  const rows = [];
  for (const card of DEPTH_PROGRAM_CONTACTS) {
    const homeId = card.stationHints[0];
    const place = byStation.get(homeId);
    const sectorId = place && place.sector && place.sector.id;
    const placed = !!(place && sectorId);
    const graphReachable = !!(placed && graph.has(sectorId));
    const sentence = typeof card.blurb === 'string' && card.blurb.trim().length > 0;
    const reaction = firstReaction(card.id);
    const trackerOk = !!(card.trackerId && CONTACT_COUNTER_DEFS[card.trackerId]);
    const atStart = depthContactsForStation(homeId, AT_START).some((entry) => entry.id === card.id);
    const onRoute = depthContactsForStation(homeId, ON_ROUTE).some((entry) => entry.id === card.id);

    let line = null;
    let talked = false;
    if (reaction) {
      bus.emit('ui:talkContact', {
        contactId: card.id,
        choiceId: reaction.choiceId,
        stationId: homeId,
        canonicalKey: card.id,
        trackerId: card.trackerId,
        name: card.name,
      });
      const memory = stationContactMemoryFor(state, card.id);
      line = reaction.line;
      talked = !!(memory && memory.met && memory.talkCount >= 1 && memory.lastChoice === reaction.choiceId);
    }

    rows.push({
      id: card.id,
      programId: card.programId,
      name: card.name,
      stationId: homeId,
      sectorId: sectorId || null,
      placed,
      graphReachable,
      sentence,
      reaction: !!(reaction && line && talked && trackerOk),
      atStart,
      onRoute,
      line,
    });
  }

  const placed = rows.filter((row) => row.placed).length;
  const graphReachable = rows.filter((row) => row.graphReachable).length;
  const sentence = rows.filter((row) => row.sentence).length;
  const reaction = rows.filter((row) => row.reaction).length;
  const atStart = rows.filter((row) => row.atStart).length;
  const onRoute = rows.filter((row) => row.onRoute).length;

  console.log(`PQ-150.03 SEED ${SEED}`);
  console.log(`PLACED ${placed}/15`);
  console.log(`GRAPH_REACHABLE ${graphReachable}/15`);
  console.log(`SENTENCE ${sentence}/15`);
  console.log(`REACTION ${reaction}/15`);
  console.log(`AVAILABLE_AT_START ${atStart}/15`);
  console.log(`AVAILABLE_ON_ROUTE ${onRoute}/15`);
  for (const row of rows) {
    console.log(
      `${row.programId} ${row.id} ${row.stationId} ${row.sectorId || 'NO_SECTOR'}`
      + ` placed=${row.placed} graph=${row.graphReachable} sentence=${row.sentence}`
      + ` reaction=${row.reaction} start=${row.atStart} route=${row.onRoute}`,
    );
  }

  assert.equal(placed, 15, `placed ${placed}/15`);
  assert.equal(graphReachable, 15, `graph-reachable ${graphReachable}/15`);
  assert.equal(sentence, 15, `sentence ${sentence}/15`);
  assert.equal(reaction, 15, `reaction ${reaction}/15`);
  assert.equal(onRoute, 15, `on-route ${onRoute}/15`);
  assert.equal(
    stationContactCounterValue(state, 'doss.sources'),
    0,
    'talk is a line plus memory; Doss archive stays the evidence writer',
  );
});
