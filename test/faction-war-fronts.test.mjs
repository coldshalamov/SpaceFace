import test from 'node:test';
import assert from 'node:assert/strict';

import { FACTION_META } from '../src/data/factions.js';
import { SECTORS } from '../src/data/sectors.js';
import { factions as factionsBase } from '../src/systems/factions.js';

const PAIR_KEY = 'faction_reach:faction_scn';
const FRONT_SECTOR = 'sector_helios_prime'; // contested sector for reach:scn
const PLAYER_ID = 'player_ship';

// PQ-170.00 — "fronts you can tilt": a physical player action inside a contested sector must
// feed the war ledger through factions (the sole conflict/owner writer), bank momentum, and be
// able to flip the sector's runtime owner — with a player-facing receipt.

test('a player kill on the contested front banks momentum and lean; a remote kill does not', () => {
  const onFront = harness({ sectorId: FRONT_SECTOR });
  kill(onFront, { factionId: 'faction_scn', victimClass: 'fighter' });

  const c = onFront.state.conflicts[PAIR_KEY];
  assert.ok(c, 'front kill opens the conflict ledger through factions');
  assert.ok(c.playerLean < 0, 'killing side B hulls leans the player toward side A');
  assert.ok(c.momentum < 0, 'front kill banks momentum toward the favored side');
  assert.equal(c.front.frontKills, 1);
  assert.equal(c.front.blockade, 0);
  assert.equal(c.front.siege, 0);
  assert.ok(onFront.events.some((e) => e.event === 'conflict:frontAction'
    && e.payload.pairKey === PAIR_KEY && e.payload.sectorId === FRONT_SECTOR),
    'front actions emit a receipt for downstream presentation');

  const remote = harness({ sectorId: 'sector_vesper_drift' }); // not contested by this pair
  kill(remote, { factionId: 'faction_scn', victimClass: 'fighter' });
  const rc = remote.state.conflicts[PAIR_KEY];
  assert.ok(!rc || !rc.front || rc.front.frontKills === 0,
    'a kill off the front never banks front momentum');
});

test('blockade and siege verbs bank extra momentum inside the front ledger', () => {
  const h = harness({ sectorId: FRONT_SECTOR });
  kill(h, { factionId: 'faction_scn', victimClass: 'hauler' }); // lane blockade
  kill(h, { factionId: 'faction_scn', victimClass: 'capital' }); // siege target

  const front = h.state.conflicts[PAIR_KEY].front;
  assert.equal(front.blockade, 1, 'a logistics kill on the front reads as blockade work');
  assert.equal(front.siege, 1, 'a capital kill on the front reads as siege work');
  assert.equal(front.frontKills, 2);
});

test('a wrecking-ball kill with no killerId still counts when the receipt says playerCaused', () => {
  const h = harness({ sectorId: FRONT_SECTOR });
  // Massline provenance: presentation carries playerCaused even when killerId is absent.
  h.bus.emit('entity:killed', {
    id: 'npc_1',
    type: 'ship',
    factionId: 'faction_scn',
    victimClass: 'capital',
    killerId: null,
    pos: { x: 0, z: 0 },
    presentation: { cause: 'terrain_collision', playerCaused: true, surface: 'terrain' },
  });

  const c = h.state.conflicts[PAIR_KEY];
  assert.ok(c, 'a slung-rock kill on the front still reaches the conflict ledger');
  assert.equal(c.front.thrown, 1, 'thrown-mass kills record the wrecking-ball verb');
  assert.equal(c.front.siege, 1);
  assert.ok(c.momentum < -(10 + 6 + 5 - 1), 'wrecking-ball siege banks the largest kick');
});

test('front momentum flips the sector owner mid-war and announces the change', () => {
  const h = harness({ sectorId: FRONT_SECTOR });
  h.state.world.sectors[FRONT_SECTOR].owner = 'faction_scn';
  h.state.conflicts[PAIR_KEY] = {
    tension: 90, state: 'war', playerLean: 0.4, momentum: -95,
    front: { frontKills: 0, blockade: 0, siege: 0, thrown: 0 },
  };

  kill(h, { factionId: 'faction_scn', victimClass: 'capital' }); // lean = -1, kick = 6+10
  assert.equal(h.state.world.sectors[FRONT_SECTOR].owner, 'faction_reach',
    'one player action on a hot front flips the runtime sector owner');
  assert.ok(h.events.some((e) => e.event === 'conflict:flip'
    && e.payload.sectorId === FRONT_SECTOR && e.payload.newOwner === 'faction_reach'),
    'the flip still emits the authoritative conflict:flip receipt');
  assert.ok(h.events.some((e) => e.event === 'toast'
    && /HELIOS PRIME/i.test(e.payload.text) && /REACH/i.test(e.payload.text)),
    'the flip announces itself to the player in plain language');
});

test('the front ledger survives save/load inside the serialized conflict record', () => {
  const h = harness({ sectorId: FRONT_SECTOR });
  kill(h, { factionId: 'faction_scn', victimClass: 'hauler' });
  const saved = structuredClone(h.sys.serialize());

  const resumed = harness({ sectorId: FRONT_SECTOR });
  resumed.sys.deserialize(saved);
  const c = resumed.state.conflicts[PAIR_KEY];
  assert.ok(c.front, 'deserialize preserves the front ledger');
  assert.equal(c.front.blockade, 1);
  assert.equal(c.front.frontKills, 1);
});

// ── harness ────────────────────────────────────────────────────────────────────────────────

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
    meta: { seed: 'war-fronts' },
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
