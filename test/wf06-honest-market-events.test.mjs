// WF-06 — honest market events: a scheduled economy alert must name a good the
// station actually trades, and its type must follow the world the player can see.
//
// The closed-form calendar draws one event per sector epoch from the world seed.
// The same law the old per-station roll carried now lives in that draw: the named
// good comes off the picked berth's own book (surplus alerts name what it makes,
// supply alerts name what it needs), and the piracy kinds are weighted by the
// sector's authored security — the same number the lane chart shows. A station
// with no matching line still trades the event: the fallback names its ordinary
// book, never an untraded good and never silence.
//
// Proves, all on fixed seeds:
//   1. industry match — boom/new_mine land on produce-role lines, the supply
//      kinds on consume-role lines, whenever the berth hosts them;
//   2. fallback — a berth with no matching bucket still fires on listed goods;
//   3. blockade stays reachable through the seeded draw on seed 17700
//      (the pq-177.00 "blockade is not test-only" law);
//   4. security weighting — a lawless sector draws more piracy than a core one;
//   5. the world lane — a factions-owned war enters as an injected blockade
//      event that every live-events surface reads (the seeded draw itself never
//      reads live state — that is what keeps the closed form closed).
//
// Run: node --test test/wf06-honest-market-events.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { economy } from '../src/systems/economy.js';
import { SECTORS } from '../src/data/sectors.js';
import { COMMODITIES } from '../src/data/commodities.js';
import {
  scheduledEventForEpoch, sectorEventContext, economyLiveEvents,
} from '../src/economy/marketModel.js';

const SEED = 4242;
const GOODS = COMMODITIES.map((c) => c.id);

const SUPPLY_TYPES = new Set(['shortage', 'blockade', 'convoy_lost', 'strike', 'war_front']);
const SURPLUS_TYPES = new Set(['boom', 'new_mine']);

function withEconomy(seed, check) {
  const sim = createSimulation({ seed, systems: [economy], updateOrder: [] });
  try {
    const econ = sim.registry.get('economy');
    sim.state.world.sectors = Object.fromEntries(SECTORS.map((s) => [s.id, s]));
    return check(econ, sim.state, sim);
  } finally {
    sim.dispose();
    economy._instance = null;
  }
}

/** Every event a sector draws across `cells` epochs, extras matching the price path. */
function drawCalendar(state, sectorId, cells, fromEpoch = 0) {
  const extras = sectorEventContext(state, sectorId);
  const stations = extras.stationIds;
  const fired = [];
  for (let j = fromEpoch; j < fromEpoch + cells; j++) {
    const ev = scheduledEventForEpoch(SEED, sectorId, j, stations, GOODS, extras);
    if (ev) fired.push(ev);
  }
  return { fired, extras };
}

test('scheduled alerts name goods off the picked berth\'s own book, role-matched', () => {
  withEconomy(SEED, (econ, state) => {
    for (const sec of SECTORS) {
      const { fired, extras } = drawCalendar(state, sec.id, 400);
      assert.ok(fired.length > 10, `${sec.id} draws a calendar (got ${fired.length}/400)`);
      for (const ev of fired) {
        const buckets = extras.stationGoods[ev.stationId];
        assert.ok(buckets, `event names a station in ${sec.id}`);
        assert.ok(buckets.listed.length, `${ev.stationId} lists goods`);
        const want = SUPPLY_TYPES.has(ev.type) ? 'consume'
          : SURPLUS_TYPES.has(ev.type) ? 'produce' : null;
        const pool = want && buckets[want].length ? buckets[want] : buckets.listed;
        for (const cid of ev.goods) {
          assert.ok(
            pool.includes(cid),
            `${ev.type} at ${ev.stationId} named ${cid} — not on its ${want || 'listed'} book`,
          );
        }
      }
    }
  });
});

test('a station with no matching line still trades the event (fallback, never silence)', () => {
  withEconomy(SEED, (econ, state) => {
    // Synthetic berth: only 'none'-role listings, no produce or consume bucket.
    const extras = {
      stationGoods: {
        station_bare: { listed: ['cmdty_ore_copper', 'cmdty_electronics'], produce: [], consume: [] },
      },
      security: 0.5,
    };
    let named = 0, fallbackUsed = 0;
    for (let j = 0; j < 2000; j++) {
      const ev = scheduledEventForEpoch(SEED, 'sector_bare', j, ['station_bare'], GOODS, extras);
      if (!ev) continue;
      fallbackUsed += 1;
      for (const cid of ev.goods) {
        assert.ok(
          ['cmdty_ore_copper', 'cmdty_electronics'].includes(cid),
          `${ev.type} named ${cid} off the bare book`,
        );
        named += 1;
      }
    }
    assert.ok(fallbackUsed > 10 && named > 10,
      `fallback keeps events firing on listed goods (${fallbackUsed} events, ${named} goods)`);
  });
});

test('the blockade kind stays reachable through the seeded draw (pq-177.00 law)', () => {
  withEconomy(17700, (econ, state) => {
    const extras = sectorEventContext(state, 'sector_helios_prime');
    const fired = [];
    // ~10 days of epochs: the law is reachability through the production draw,
    // not a forced test hook.
    for (let j = 0; j < 500; j++) {
      const ev = scheduledEventForEpoch(17700, 'sector_helios_prime', j,
        extras.stationIds, GOODS, extras);
      if (ev) fired.push(ev.type);
    }
    assert.ok(
      fired.includes('blockade'),
      `no scheduled blockade in 500 epochs on seed 17700 (got types: ${[...new Set(fired)].join(',') || 'none'})`,
    );
  });
});

test('piracy follows the sector security the chart already shows', () => {
  const sorted = SECTORS.filter((s) => Number.isFinite(s.security))
    .sort((a, b) => a.security - b.security);
  const lawless = sorted[0];
  const core = sorted[sorted.length - 1];
  assert.ok(lawless && core && lawless.security <= 0.35 && core.security >= 0.9,
    `the galaxy authors a lawless sector (${lawless && lawless.id} ${lawless && lawless.security}) and a core one (${core && core.id} ${core && core.security})`);
  withEconomy(SEED, (econ, state) => {
    const count = (sectorId) => {
      const { fired } = drawCalendar(state, sectorId, 800);
      return fired.filter((ev) => ev.type === 'piracy' || ev.type === 'piracy_spike').length;
    };
    const rough = count(lawless.id);
    const quiet = count(core.id);
    assert.ok(
      rough > quiet,
      `a lawless sector must draw more piracy than a ${core.security}-security core `
      + `(rough ${rough} vs core ${quiet} of 800 epochs)`,
    );
  });
});

test('a world-caused blockade enters through the injected-events lane, not the seed', () => {
  withEconomy(SEED, (econ, state) => {
    // War is live state — it cannot bend the seeded calendar without breaking
    // the closed form. The honest lane is the world event: the factions record
    // injects a blockade and every news/intel surface reads it identically.
    state.simTime = 120;
    const ev = econ.injectEvent({
      type: 'blockade', stationId: 'station_helios', sectorId: 'sector_helios_prime',
      commodityId: 'cmdty_ore_iron', duration: 3600, cause: 'war',
    });
    assert.ok(ev && ev.id, 'the war fact becomes a real event row');
    const live = economyLiveEvents(state, 200);
    const seen = live.find((e) => e.id === ev.id);
    assert.ok(seen, 'the injected blockade reads on the same live surface as scheduled events');
    assert.equal(seen.stationId, 'station_helios');
    assert.ok(seen.tEnd - seen.tStart === 3600 || seen.duration === 3600);
  });
});
