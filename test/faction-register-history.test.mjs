// WF-09 — the faction register remembers what you did.
// The factions system (sole rep writer) keeps a bounded deed ring per faction; the register
// surfaces read it back as labeled lines. Proves: deeds file, the clock does not, the ring
// caps, old saves backfill, and the presenter labels every receipt with real state behind it.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { factions as factionsBase } from '../src/systems/factions.js';
import { factionHistoryLines } from '../src/ui/factionStanding.js';

const FAC = 'faction_scn';

function boot({ rep = 0, simTime = 0 } = {}) {
  const bus = createBus();
  const state = {
    meta: { seed: 4242 },
    simTime,
    playerId: 1,
    player: { credits: 0 },
    factions: {},
    conflicts: {},
    world: { currentSectorId: 'sector_helios_prime', sectors: {} },
    entityList: [],
  };
  const sys = { ...factionsBase };
  sys.init({ state, bus, helpers: {}, registry: null });
  if (rep !== 0) {
    state.factions[FAC] = { rep, tier: 'Neutral', aggro: false, bribesPaid: 0 };
  }
  return { state, bus, sys };
}

const deed = (state, bus, delta, reason, t) => {
  if (t != null) state.simTime = t;
  bus.emit('faction:repDelta', { factionId: FAC, delta, reason });
};

test('deeds land on the register ring, newest last, with the landing sim time', () => {
  const { state, bus } = boot({ simTime: 100 });
  deed(state, bus, 20, 'rescue_faction_distress', 100);
  deed(state, bus, -10, 'caught_contraband', 160);
  deed(state, bus, 5, 'trade_at_faction_station', 200);
  const history = state.factions[FAC].history;
  assert.deepEqual(history.map((e) => [e.value, e.reason]), [
    [20, 'rescue_faction_distress'],
    [-10, 'caught_contraband'],
    [5, 'trade_at_faction_station'],
  ]);
  assert.equal(history[2].t, 200);
});

test('the clock never files a deed: decay moves the number, not the ring', () => {
  const { state, bus } = boot({ rep: -60, simTime: 500 });
  deed(state, bus, -25, 'kill_faction_ship', 500);
  const rec = state.factions[FAC];
  const before = JSON.stringify(rec.history);
  assert.equal(rec.lastDelta.reason, 'kill_faction_ship');
  bus.emit('day:tick', { elapsed: 3 }); // negative rep drifts +2/day toward -30
  assert.equal(rec.rep, -60 - 25 + 6, 'decay must move rep toward neutral');
  assert.equal(JSON.stringify(rec.history), before, 'decay must not enter the deed ring');
  assert.equal(rec.lastDelta.reason, 'kill_faction_ship', 'the last deed stays the last deed');
});

test('baseline seeding and spillover echoes are not deeds', () => {
  const { state, bus } = boot();
  deed(state, bus, 10, 'init', 10);
  deed(state, bus, 4, 'spillover:kill_faction_ship', 20);
  assert.deepEqual(state.factions[FAC].history, []);
});

test('the ring caps at the newest six receipts', () => {
  const { state, bus } = boot({ simTime: 1 });
  for (let i = 0; i < 8; i++) {
    deed(state, bus, 2, `mission_failed:type_${i}`, 10 + i);
  }
  const history = state.factions[FAC].history;
  assert.equal(history.length, 6);
  assert.equal(history[0].reason, 'mission_failed:type_2', 'oldest deeds fall off first');
  assert.equal(history[5].reason, 'mission_failed:type_7');
});

test('factionHistoryLines reads the deeds back, newest first, labeled with real state', () => {
  const { state, bus } = boot();
  deed(state, bus, 20, 'rescue_faction_distress', 60);
  deed(state, bus, -10, 'kill_faction_ship_collision', 3600);
  const lines = factionHistoryLines(state.factions[FAC], 3720, 4); // "now" is 2 min after the last deed
  assert.equal(lines.length, 2);
  assert.equal(lines[0].label, 'collision kill of their ship');
  assert.equal(lines[0].value, -10);
  assert.equal(lines[0].ago, '2 min ago');
  assert.equal(lines[1].label, 'distress rescue');
  assert.equal(lines[1].ago, '1 h ago');
  assert.match(lines[1].text, /distress rescue · \+20 · 1 h ago/);
});

test('unknown and compound reasons still read as words, never raw ids', () => {
  const record = {
    history: [
      { value: -8, reason: 'mission_failed:smuggling_run', t: 10 },
      { value: 3, reason: 'claim_defense:won', t: 20 },
      { value: 6, reason: 'some_future_deed', t: 30 },
    ],
  };
  const lines = factionHistoryLines(record, 100, 4);
  assert.equal(lines.length, 3);
  assert.match(lines[0].text, /some future deed · \+6/);
  assert.match(lines[1].text, /claim defense \(won\) · \+3/);
  assert.match(lines[2].text, /mission failed \(smuggling run\) · \u22128|mission failed \(smuggling run\) · -8/);
});

test('a v1-era save without a ring backfills and keeps filing deeds', () => {
  const { state, bus, sys } = boot();
  sys.deserialize({ factions: { [FAC]: { rep: -50 } } });
  assert.deepEqual(state.factions[FAC].history, []);
  deed(state, bus, 20, 'rescue_faction_distress', 30);
  const lines = factionHistoryLines(state.factions[FAC], 30, 4);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].label, 'distress rescue');
});

test('a malformed ring entry cannot reach the register', () => {
  const { state, bus, sys } = boot();
  sys.deserialize({
    factions: {
      [FAC]: {
        rep: 0,
        history: [
          null,
          { value: 'big', reason: 'trade_at_faction_station', t: 1 },
          { value: 0, reason: 'trade_at_faction_station', t: 2 },
          { value: 4, reason: '', t: 3 },
          { value: 4, reason: 'depot_provisioning', t: 3 },
          { value: 6, reason: 'depot_provisioning', t: 4 },
        ],
      },
    },
  });
  const history = state.factions[FAC].history;
  assert.equal(history.length, 2);
  assert.deepEqual(history.map((e) => e.value), [4, 6]);
  const lines = factionHistoryLines(state.factions[FAC], 40, 4);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].label, 'depot provisioning run');
});
