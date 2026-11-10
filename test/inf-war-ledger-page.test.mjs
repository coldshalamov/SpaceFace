/**
 * inf-war-ledger-page — a war the player leaned on gets a page in the Ship's Ledger.
 *
 * The ship's book filed trades, losses, scars and renown, but the war you pressed siege by siege
 * left no page: the front turned, the map recolored, and the chronicle of your hull kept nothing.
 * Now factions stamps the flip-time lean magnitude onto its own durable conflict record (the same
 * fact its rep swing credits), and the ledger projects that stamp as a dated war page — sector,
 * winner, loser — only when the player actually leaned. A pure NPC-power flip, and any record
 * without the stamp (a save written before it, healed by the deserialize migration), files
 * nothing: the book never claims a war nobody witnessed from this hull.
 *
 * Seed 4242. Focused: owners = src/systems/factions.js, src/systems/shipLedger.js,
 * src/data/shipLedgerTemplates.js, src/ui/station/screens/ledger.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { FACTION_META } from '../src/data/factions.js';
import { SECTORS } from '../src/data/sectors.js';
import { factions as factionsBase } from '../src/systems/factions.js';
import { buildShipLedger } from '../src/systems/shipLedger.js';
import { validateShipLedgerTemplates } from '../src/data/shipLedgerTemplates.js';
import { readingOf } from '../src/ui/station/screens/ledger.js';

const PAIR_KEY = 'faction_reach:faction_scn';
const FRONT_SECTOR = 'sector_helios_prime'; // contested sector for reach:scn
const PLAYER_ID = 'player_ship';

function warEntries(state) {
  return buildShipLedger(state).entries.filter((e) => e.type === 'war');
}

test('a front the player pressed files a dated war page in the hull book', () => {
  const h = harness({ sectorId: FRONT_SECTOR });
  h.state.world.sectors[FRONT_SECTOR].owner = 'faction_scn';
  h.state.conflicts[PAIR_KEY] = {
    tension: 90, state: 'war', playerLean: 0.4, momentum: -95,
    front: { frontKills: 0, blockade: 0, siege: 0, thrown: 0 },
  };

  kill(h, { factionId: 'faction_scn', victimClass: 'capital' }); // lean -1, kick 6+10 → flip
  assert.equal(h.state.world.sectors[FRONT_SECTOR].owner, 'faction_reach', 'the front turned');
  const flip = h.state.conflicts[PAIR_KEY].lastFlip;
  assert.ok(flip && flip.flipId, 'the flip receipt carries its durable id');
  assert.ok(flip.playerLeanMag > 0, 'the flip stamps a positive lean magnitude at flip time');

  const pages = warEntries(h.state);
  assert.equal(pages.length, 1, 'exactly one war page for the turned front');
  const page = pages[0];
  assert.equal(page.sourceId, flip.flipId, 'the page is keyed to the flip, not the war');
  assert.equal(page.at, flip.t, 'the page is dated at the flip');
  assert.match(page.tokens.sector, /helios/i);
  assert.ok(page.tokens.winner && page.tokens.loser, 'the page names both houses');
  assert.match(page.text, new RegExp(page.tokens.sector.split(' ')[0], 'i'),
    'the prose names the ground');
});

test('a pure NPC-power flip files nothing — the book never claims an unwitnessed war', () => {
  const h = harness({ sectorId: FRONT_SECTOR });
  h.state.world.sectors[FRONT_SECTOR].owner = 'faction_scn';
  // Zero lean, runaway NPC power: the same resolution loop can still turn the front.
  h.state.conflicts[PAIR_KEY] = {
    tension: 90, state: 'war', playerLean: 0, momentum: -120,
    front: { frontKills: 0, blockade: 0, siege: 0, thrown: 0 },
  };
  assert.equal(h.sys._resolveFlip(PAIR_KEY, h.state.conflicts[PAIR_KEY]), true, 'the front still turns');
  assert.equal(h.state.world.sectors[FRONT_SECTOR].owner, 'faction_reach');
  const flip = h.state.conflicts[PAIR_KEY].lastFlip;
  assert.equal(flip.playerLeanMag, 0, 'the stamp reads zero, not absent');
  assert.equal(warEntries(h.state).length, 0, 'no war page without the player lean');

  // A war still burning but never flipped has no page either.
  h.state.conflicts[PAIR_KEY] = { tension: 80, state: 'war', playerLean: 0.9, momentum: 40 };
  assert.equal(warEntries(h.state).length, 0, 'no page for a front that has not turned');
});

test('the war page survives save/load, and a pre-stamp save heals to no page', () => {
  const h = harness({ sectorId: FRONT_SECTOR });
  h.state.world.sectors[FRONT_SECTOR].owner = 'faction_scn';
  h.state.conflicts[PAIR_KEY] = {
    tension: 90, state: 'war', playerLean: 0.4, momentum: -95,
    front: { frontKills: 0, blockade: 0, siege: 0, thrown: 0 },
  };
  kill(h, { factionId: 'faction_scn', victimClass: 'capital' });
  const before = warEntries(h.state);
  assert.equal(before.length, 1);

  const saved = structuredClone(h.sys.serialize());
  const resumed = harness({ sectorId: FRONT_SECTOR });
  resumed.sys.deserialize(saved);
  const after = warEntries(resumed.state);
  assert.equal(after.length, 1, 'the page re-projects from the restored record');
  assert.equal(after[0].sourceId, before[0].sourceId, 'same flip identity after reload');
  assert.equal(after[0].text, before[0].text, 'same prose after reload');

  // Migration: a save written before the stamp carries no lean — it heals to absent and the
  // book files nothing rather than inventing a debt.
  delete saved.conflicts[PAIR_KEY].lastFlip.playerLeanMag;
  const legacy = harness({ sectorId: FRONT_SECTOR });
  legacy.sys.deserialize(saved);
  assert.equal(legacy.state.conflicts[PAIR_KEY].lastFlip.playerLeanMag, undefined,
    'a corrupted lean value heals to absent');
  assert.equal(warEntries(legacy.state).length, 0, 'an unwitnessed legacy flip stays unfiled');
});

test('the war prose bank validates and the reading column names the ground and the houses', () => {
  const check = validateShipLedgerTemplates();
  assert.equal(check.ok, true, check.errors.join('; '));

  const reading = readingOf({
    type: 'war', cycleLabel: 'Cycle 3',
    tokens: { sector: 'Helios Prime', winner: 'The Reach', loser: 'Concord' },
  });
  assert.equal(reading.title, 'Helios Prime');
  assert.match(reading.kicker, /WAR/i);
  assert.match(reading.kicker, /THE REACH TOOK IT FROM CONCORD/i);
  // No color on a war page: gains and stories carry no colour of their own (ORRERY §3.3).
  assert.equal(reading.hero, '');
});

// ── harness (same shape as faction-war-fronts) ─────────────────────────────────────────────

function kill(h, { factionId, victimClass }) {
  h.bus.emit('entity:killed', {
    id: `npc_${factionId}_${victimClass}`,
    type: 'ship',
    factionId,
    victimClass,
    killerId: PLAYER_ID,
    witnessed: false,
    pos: { x: 0, z: 0 },
  });
}

function harness({ sectorId }) {
  const factions = {};
  for (const f of FACTION_META) {
    factions[f.id] = {
      rep: f.startingRep || 0,
      tier: 'Neutral',
      aggro: false,
      bribesPaid: 0,
      lastDelta: { value: 0, reason: 'init', t: 0 },
      knownContrabandStrikes: 0,
      discoveredHostileBy: 0,
      power: 10,
      powerNonce: 0,
    };
  }
  const state = {
    playerId: PLAYER_ID,
    simTime: 123,
    meta: { seed: 'war-ledger-page' },
    world: {
      currentSectorId: sectorId,
      sectors: Object.fromEntries(SECTORS.map((s) => [s.id, { owner: s.factionId || null }])),
    },
    factions,
    conflicts: {},
    entityList: [],
    entities: new Map(),
  };
  const events = [];
  const handlers = new Map();
  const bus = {
    on(event, fn) {
      const list = handlers.get(event) || [];
      list.push(fn);
      handlers.set(event, list);
    },
    emit(event, payload) {
      events.push({ event, payload });
      for (const fn of handlers.get(event) || []) fn(payload);
    },
  };
  const sys = { ...factionsBase };
  sys.init({ state, bus, helpers: { queryRadius: () => [] } });
  sys.newGame();
  return { state, events, bus, sys };
}
