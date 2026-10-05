// §1.8 trade-slice settlement invariants over the real quote/execute/cargo path.
// A maturity-pass sweep: displayed price equals charged price, the hold never
// overflows or goes negative, refused trades move nothing, and one settlement
// emits exactly one tradeCompleted. Focused complements (stale-quote binding,
// custody intent replay, partial-fill receipts) live in inf-084-stale-quote,
// pq-177-06-cargo-custody, nxi-102-106-quote-accepts-capacity and
// nxi-106-partial-fill-receipt.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { economy } from '../src/systems/economy.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { SECTORS } from '../src/data/sectors.js';

function boot(seed = 4242) {
  const sim = createSimulation({ seed, systems: [economy] });
  const { state, bus } = sim;
  state.player.credits = 1_000_000;
  state.mode = 'flight';
  const econ = sim.registry.get('economy');
  for (const sec of SECTORS) econ.populateSector({ sectorId: sec.id });
  const events = [];
  bus.on('economy:tradeCompleted', (p) => events.push(p));
  return { sim, state, bus, econ, events };
}

test('every listed market settles buys and sells at exactly the quoted total, once', () => {
  const { sim, state, econ, events } = boot();
  const cargo = state.player.cargo;
  let buys = 0;
  let sells = 0;
  outer: for (const sid of Object.keys(state.economy.markets)) {
    for (const cid of Object.keys(state.economy.markets[sid])) {
      const entry = state.economy.markets[sid][cid];
      for (const qty of [1, 2, 7]) {
        const q = econ.quote(sid, cid, 'buy', qty);
        if (!q.ok) continue;
        const credits0 = state.player.credits;
        const ev0 = events.length;
        const r = econ.execute(sid, cid, 'buy', qty, { expectedTotal: q.total });
        if (!r.ok) continue;
        buys++;
        assert.ok(Number.isInteger(r.total) && r.total >= 0, `buy total integer (${sid} ${cid} x${qty})`);
        assert.equal(credits0 - state.player.credits, r.total,
          `charged == settled total (${sid} ${cid} x${qty})`);
        assert.ok(credits0 - state.player.credits <= q.total,
          `charged <= quoted (${sid} ${cid} x${qty}: ${q.total})`);
        assert.ok(cargo.usedVolume <= cargo.capVolume + 1e-9, 'hold never over cap');
        assert.ok(entry.stock >= 1, `stock floor 1 after buy (${sid} ${cid})`);
        assert.equal(events.length, ev0 + 1, 'exactly one tradeCompleted per buy');
        const ev = events[events.length - 1];
        assert.equal(ev.qty, r.qty); assert.equal(ev.total, r.total);
        assert.ok(Number.isInteger(cargo.items[cid] || 0) && (cargo.items[cid] || 0) >= 0);

        const held = cargo.items[cid] || 0;
        if (held <= 0) continue;
        const qs = econ.quote(sid, cid, 'sell', held);
        const c0 = state.player.credits;
        const evs0 = events.length;
        const rs = econ.execute(sid, cid, 'sell', held, { expectedTotal: qs.ok ? qs.total : undefined });
        if (!rs.ok) continue;
        sells++;
        assert.equal(state.player.credits - c0, rs.total,
          `granted == settled total (${sid} ${cid} x${held})`);
        assert.ok(qs.ok && rs.total >= qs.total, 'sell settles at or above the quote');
        assert.ok((cargo.items[cid] || 0) >= 0, 'cargo never negative after sell');
        assert.ok(cargo.usedVolume >= -1e-9, 'usedVolume never negative');
        assert.equal(events.length, evs0 + 1, 'exactly one tradeCompleted per sell');
      }
      if (buys > 200) break outer;
    }
  }
  assert.ok(buys > 150 && sells > 150, `sweep covered real markets (${buys} buys / ${sells} sells)`);
  sim.dispose();
});

test('malformed quantities refuse and mutate neither credits, cargo, nor stock', () => {
  const { sim, state, econ } = boot();
  const sid = 'station_ceres'; const cid = 'cmdty_ore_iron';
  const snap = () => JSON.stringify([state.player.credits, state.player.cargo, state.economy.markets[sid][cid].stock]);
  const before = snap();
  for (const qty of [0, -3, NaN, Infinity, 0.5, '4', {}, null, undefined, 1e9]) {
    const r = econ.execute(sid, cid, 'buy', qty);
    assert.equal(r.ok, false, `buy qty=${String(qty)} refused`);
    assert.equal(snap(), before, `buy qty=${String(qty)} moved nothing`);
    const rs = econ.execute(sid, cid, 'sell', qty);
    assert.equal(rs.ok, false, `sell qty=${String(qty)} refused`);
    assert.equal(snap(), before, `sell qty=${String(qty)} moved nothing`);
  }
  sim.dispose();
});

test('a repeated commit under one intent id charges and loads exactly once', () => {
  const { sim, state, econ, events } = boot();
  const sid = 'station_ceres'; const cid = 'cmdty_ore_iron';
  const credits0 = state.player.credits;
  const r1 = econ.execute(sid, cid, 'buy', 3, { intentId: 'dup-click-1' });
  const r2 = econ.execute(sid, cid, 'buy', 3, { intentId: 'dup-click-1' });
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true); assert.equal(r2.duplicate, true);
  assert.equal(r2.total, r1.total, 'replay republishes the same receipt');
  assert.equal(state.player.cargo.items[cid], 3, 'cargo settled once');
  assert.equal(credits0 - state.player.credits, r1.total, 'credits charged once');
  assert.equal(events.length, 1, 'one tradeCompleted for the pair');
  sim.dispose();
});

test('a fractional-volume commodity fills to the cap boundary without overflow', () => {
  const { sim, state, econ } = boot();
  let found = null;
  outer: for (const sid of Object.keys(state.economy.markets)) {
    for (const cid of Object.keys(state.economy.markets[sid])) {
      const def = COMMODITIES.find((c) => c.id === cid);
      if (def && def.volPerU === 0.8) { found = { sid, cid }; break outer; }
    }
  }
  assert.ok(found, 'fixture has a 0.8-volume commodity on some market');
  state.player.cargo.capVolume = 4.0; // exactly 5 units at 0.8/u
  state.player.cargo.usedVolume = 0;
  const r = econ.execute(found.sid, found.cid, 'buy', 8);
  assert.equal(r.ok, true);
  assert.equal(r.qty, 5, 'partial fill takes the whole units that fit');
  assert.ok(state.player.cargo.usedVolume <= 4.0 + 1e-9, 'no overflow past the cap');
  sim.dispose();
});

test('repeated buy/sell cycles leave no usedVolume drift', () => {
  const { sim, state, econ } = boot();
  const sid = 'station_ceres'; const cid = 'cmdty_ice_water';
  for (let i = 0; i < 50; i++) {
    econ.execute(sid, cid, 'buy', 7);
    econ.execute(sid, cid, 'sell', state.player.cargo.items[cid] || 0);
  }
  assert.ok(Math.abs(state.player.cargo.usedVolume) < 1e-6,
    `usedVolume returns to ~0 (got ${state.player.cargo.usedVolume})`);
  assert.equal(state.player.cargo.items[cid] || 0, 0);
  sim.dispose();
});
