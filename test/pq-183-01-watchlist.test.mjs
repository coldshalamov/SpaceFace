// PQ-183.01 — the watch list. Pins a price, a rival, a deadline, a faction standing onto the HUD
// receipts lane. Pins the grammar: one pin per ref, bounded list, live readings, normalized saves.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  WATCHLIST_MAX,
  pinKindForRef,
  isWatched,
  toggleWatchPin,
  normalizeWatchlist,
  resolveWatchPin,
  resolveWatchlist,
  watchlistPins,
} from '../src/ui/watchlist.js';

function makeState() {
  return {
    simTime: 1000,
    ui: {},
    factions: { faction_mts: { rep: 45, tier: 'Trusted' } },
    aceMemory: { ace_cade_haltred: { defeats: 2, kills: 1, status: 'wounded' } },
    missions: { active: [{ id: 'msn_ferry_1', deadline_s: 1300 }] },
    economy: { markets: { st_helios: { cmdty_ore_iron: { buy: 120, lastBuy: 138 } } } },
  };
}

test('pin kinds cover the leaf grammar: price, rival, deadline, standing', () => {
  assert.equal(pinKindForRef('commodity:cmdty_ore_iron'), 'price');
  assert.equal(pinKindForRef('captain:ace_cade_haltred'), 'rival');
  assert.equal(pinKindForRef('contract:msn_ferry_1'), 'deadline');
  assert.equal(pinKindForRef('faction:faction_mts'), 'standing');
  // Not everything is watchable — a hull or a station has no changing reading to pin.
  assert.equal(pinKindForRef('hull:hull_kestral'), null);
  assert.equal(pinKindForRef('station:st_helios'), null);
  assert.equal(pinKindForRef('not-a-ref'), null);
});

test('toggle pins and unpins; the list refuses a ninth pin', () => {
  const state = makeState();
  const add = toggleWatchPin(state, 'faction:faction_mts', { label: 'MTS Combine' });
  assert.equal(add.pinned, true);
  assert.equal(isWatched(state, 'faction:faction_mts'), true);
  const off = toggleWatchPin(state, 'faction:faction_mts');
  assert.equal(off.pinned, false);
  assert.equal(off.reason, 'removed');
  assert.equal(isWatched(state, 'faction:faction_mts'), false);
  assert.equal(toggleWatchPin(state, 'hull:hull_kestral').reason, 'unpinnable');

  for (let i = 0; i < WATCHLIST_MAX; i++) {
    const r = toggleWatchPin(state, `contract:m_${i}`, { label: `Job ${i}` });
    assert.equal(r.pinned, true, `pin ${i} should fit`);
  }
  const ninth = toggleWatchPin(state, 'contract:m_overflow', { label: 'Overflow' });
  assert.equal(ninth.pinned, false);
  assert.equal(ninth.reason, 'full');
  assert.equal(watchlistPins(state).length, WATCHLIST_MAX);
});

test('resolveWatchPin reads live values for each kind', () => {
  const state = makeState();
  const price = resolveWatchPin(state, {
    ref: 'commodity:cmdty_ore_iron', kind: 'price', label: 'Iron ore', stationId: 'st_helios', priceAt: 138,
  });
  assert.match(price.detail, /138 cr/);
  assert.equal(price.tone, 'calm'); // unchanged from pin time

  const rival = resolveWatchPin(state, {
    ref: 'captain:ace_cade_haltred', kind: 'rival', label: 'Cade Haltred',
  });
  assert.equal(rival.detail, 'wounded');
  assert.equal(rival.tone, 'foe');

  const deadline = resolveWatchPin(state, {
    ref: 'contract:msn_ferry_1', kind: 'deadline', label: 'Ferry run',
  });
  assert.match(deadline.detail, /5m 0s left/); // deadline_s 1300 - simTime 1000
  assert.equal(deadline.tone, 'calm');

  const standing = resolveWatchPin(state, {
    ref: 'faction:faction_mts', kind: 'standing', label: 'MTS Combine',
  });
  assert.equal(standing.detail, 'Trusted');
  assert.equal(standing.tone, 'you'); // rep 45 > 30
});

test('deadline pins turn foe near expiry and read expired past the line', () => {
  const state = makeState();
  state.simTime = 1250; // 50s left
  const soon = resolveWatchPin(state, { ref: 'contract:msn_ferry_1', kind: 'deadline', label: 'Ferry run' });
  assert.equal(soon.tone, 'foe');
  state.simTime = 1400; // past
  const gone = resolveWatchPin(state, { ref: 'contract:msn_ferry_1', kind: 'deadline', label: 'Ferry run' });
  assert.equal(gone.detail, 'expired');
  state.missions.active = [];
  const off = resolveWatchPin(state, { ref: 'contract:msn_ferry_1', kind: 'deadline', label: 'Ferry run' });
  assert.equal(off.detail, 'off the board');
});

test('price pins show the delta arrow when the market moves', () => {
  const state = makeState();
  const pin = { ref: 'commodity:cmdty_ore_iron', kind: 'price', label: 'Iron ore', stationId: 'st_helios', priceAt: 138 };
  state.economy.markets.st_helios.cmdty_ore_iron.lastBuy = 150;
  const up = resolveWatchPin(state, pin);
  assert.match(up.detail, /150 cr ▲/);
  assert.equal(up.tone, 'you');
  state.economy.markets.st_helios.cmdty_ore_iron.lastBuy = 100;
  const down = resolveWatchPin(state, pin);
  assert.match(down.detail, /100 cr ▼/);
  assert.equal(down.tone, 'foe');
});

test('normalizeWatchlist dedupes, drops bad rows, and is a stable round trip', () => {
  const raw = [
    { ref: 'faction:faction_mts', kind: 'standing', label: 'MTS Combine', createdAt: 10 },
    { ref: 'faction:faction_mts', kind: 'standing', label: 'DUPE', createdAt: 11 }, // dup ref
    { ref: 'commodity:cmdty_ore_iron', kind: 'rival', label: 'wrong kind' },        // kind mismatch
    { ref: 'commodity:', kind: 'price', label: 'empty id' },                        // bad ref
    { kind: 'price', label: 'no ref' },
    'garbage',
    { ref: 'captain:ace_cade_haltred', kind: 'rival', label: 'Cade Haltred' },
  ];
  const clean = normalizeWatchlist(raw);
  assert.equal(clean.length, 2);
  assert.equal(clean[0].label, 'MTS Combine'); // first writer wins
  assert.equal(clean[1].label, 'Cade Haltred');
  // Round trip: serialize to JSON and re-normalize — stable, no growth.
  const again = normalizeWatchlist(JSON.parse(JSON.stringify(clean)));
  assert.deepEqual(again, clean);
});

test('resolveWatchlist renders pins in order and respects the cap', () => {
  const state = makeState();
  toggleWatchPin(state, 'faction:faction_mts', { label: 'MTS Combine' });
  toggleWatchPin(state, 'captain:ace_cade_haltred', { label: 'Cade Haltred' });
  toggleWatchPin(state, 'contract:msn_ferry_1', { label: 'Ferry run' });
  const rows = resolveWatchlist(state);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.kind), ['standing', 'rival', 'deadline']);
  assert.ok(rows.every((r) => typeof r.detail === 'string' && r.detail.length > 0));
});
