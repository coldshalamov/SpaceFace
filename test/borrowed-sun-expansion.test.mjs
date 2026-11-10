// borrowed-sun-expansion — the light economy added to src/systems/borrowedSun.js.
//
// Proves the lender's book end to end on the real system and the real events:
//   · mirror array: sails unfold at 'open', ride the ring deterministically,
//     ride bodies bound by id + occupantGeneration + ownership tags
//   · collector hazards: the sail-ring wash pushes ships through
//     queuePhysicsImpulse, throttled per ship; a broken sail throws glass
//   · the lender's ledger: breaking a sail opens a note; the hold suspends
//     counter work; the vig runs once per missed period
//   · debtor consequences: collectors field on an overdue note and levy on
//     contact until the book balances; killing one lands a fee on the note
//   · light leases: bought with an exact charge, beats collect only in the
//     light, lapses are honest, the fold curtails at a once-only rebate
//   · shadow market: demand lots post on a deterministic clock and only a
//     real docked sell receipt fills one — once
//   · once-only contracts: one charter per visit, latched; tithe/oath/freight
//     pay once and void at the fold
//   · regard: settled work raises the tier and scales payouts
//   · save-safe: JSON round-trips keep stamps; money never moves twice
//
// Run: node --test test/borrowed-sun-expansion.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import {
  borrowedSun,
  borrowedSunBoard,
  borrowedSunServiceStatus,
  ensureSunBook,
  freshSunBook,
  sunStanding,
  sunTierFor,
  SUN_BOOK_KEY,
  SUN_MIRRORS,
  SUN_LEASES,
  SUN_SHADOW,
  SUN_DEBT,
  SUN_COLLECTORS,
  SUN_CHARTERS,
  SUN_TIERS,
} from '../src/systems/borrowedSun.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { BORROWED_SUN as C, BORROWED_SUN_BERTHS as BERTHS } from '../src/data/borrowedSun.js';
import { RACING_CIRCUITS } from '../src/data/raceLevels.js';
import { configureRacingCorridorSession, isRacingCorridorSession } from '../src/world/racingCorridor.js';

const SEED = 7331;
const tick = (s) => Math.ceil(s * 60);

function boot({ credits = 50000, sectorId = BERTHS[0].sectorId } = {}) {
  const bus = createBus();
  const sim = createSimulation({ seed: SEED, bus, systems: [spawnBudget, borrowedSun] });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = sectorId;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: -99999, z: -99999 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  state.player.credits = credits;
  const events = { charges: [], grants: [], reps: [], logs: [], toasts: [] };
  bus.on('economy:chargeCredits', (p) => {
    if (!p) return;
    if (p.requireFull === true) {
      // The sole-writer contract: commit() runs only when the live balance
      // matches the stamped expectation and covers the amount — then result.
      if (p.result === true) return;
      p.result = false;
      const live = Math.round(state.player.credits);
      if (live === Math.round(p.expectedCredits) && live >= p.amount
        && typeof p.commit === 'function' && p.commit() === true) {
        state.player.credits = live - Math.round(p.amount);
        p.result = true;
      }
    } else {
      const a = Math.min(Math.max(0, Math.round(state.player.credits)), Math.round(p.amount || 0));
      state.player.credits -= a;
    }
    events.charges.push(p);
  });
  bus.on('economy:grantCredits', (p) => {
    if (!p) return;
    state.player.credits = Math.round(state.player.credits + Math.round(p.amount || 0));
    events.grants.push(p);
  });
  bus.on('faction:repDelta', (p) => events.reps.push(p));
  bus.on('comms:log', (p) => events.logs.push(p));
  bus.on('toast', (p) => events.toasts.push(p));

  const sys = sim.registry.get('borrowedSun');
  const carrier = () => sys._find();
  const book = () => ensureSunBook(state);
  const materialize = () => { sim.runTicks(2); return carrier(); };
  const open = () => { sys._phase('open', C.openTicks); };
  const hail = () => {
    const c = carrier();
    player.pos.x = c.pos.x;
    player.pos.z = c.pos.z + C.hailRange - 50;
  };
  const inLight = () => {
    const c = carrier();
    player.pos.x = c.pos.x + SUN_LEASES.collectRadius - 200;
    player.pos.z = c.pos.z;
  };
  const outOfLight = () => {
    player.pos.x = -99999; player.pos.z = -99999;
  };
  const dock = () => { state.ui.docked = true; state.ui.dockedStationId = C.stationId; };
  const undock = () => { state.ui.docked = false; state.ui.dockedStationId = null; };
  const quietShadow = () => { book().nextShadowAt = 1e12; };
  const sell = (commodityId, qty, receiptId = `rcpt-${Math.abs(qty)}-${commodityId}`) => {
    dock();
    bus.emit('economy:tradeCompleted', {
      stationId: C.stationId, receiptId, commodityId, qty, side: 'sell',
    });
  };
  const killEntity = (e, killerId = player.id) => {
    e.alive = false;
    bus.emit('entity:killed', { id: e.id, killerId, type: e.type, pos: { ...e.pos } });
  };
  const liveMirrors = () => book().mirrors
    .filter((m) => m.state === 'live' && sys._mirrorEnt(m));
  const liveShards = () => state.entityList.filter((e) => e.data?.sunGlass && e.alive !== false);
  const collectors = () => book().collectors
    .map((r) => state.entities.get(r.entityId))
    .filter((e) => e && e.alive !== false);
  return { sim, state, bus, player, events, sys, carrier, book, materialize,
    open, hail, inLight, outOfLight, dock, undock, quietShadow, sell, killEntity,
    liveMirrors, liveShards, collectors };
}

// ── The visit machine still stands ────────────────────────────────────────────

test('the carrier materializes on its berth and the visit row stays intact', () => {
  const { sim, sys, carrier, materialize } = boot();
  const c = materialize();
  assert.ok(c, 'carrier body');
  assert.equal(c.data.borrowedSunCarrierId, C.carrierId);
  assert.equal(c.data.stationId, C.stationId);
  assert.equal(c.data.persistenceOwner, C.owner);
  assert.equal(sys._row.visitId, 1);
  // 'arrive' is now the transit instant only — the visit clock advances on the sector calendar,
  // not on native physics residency, so the same tick the berth body exists the row is 'deploy'.
  assert.equal(sys._row.phase, 'deploy');
});

test('borrowedSunServiceStatus reads the owner; foreign stations pass through', () => {
  const { state, materialize } = boot();
  materialize();
  assert.equal(borrowedSunServiceStatus(state, 'station_someplace_else').ok, true);
  const st = borrowedSunServiceStatus(state, C.stationId);
  // No native physics authority in the focused fixture — the honest answer is unavailable.
  assert.equal(st.ok, false);
  assert.equal(st.reason, 'carrier_unavailable');
});

test('Borrowed Sun stays dormant and rejects stale business outside ordinary Adventure', () => {
  const contexts = [
    ['Survival', (state) => { state.run = { kind: 'survival', phase: 'active' }; }],
    ['physics venue session', (state) => { state.physicsVenueSession = { venueId: 'test-course' }; }],
    ['active physics venue', (state) => { state.physicsVenue = { active: true }; }],
    ['temporary racing corridor', (state) => {
      const sectorId = RACING_CIRCUITS[0].sectorId;
      state.world.sectors = { [sectorId]: { id: sectorId } };
      configureRacingCorridorSession(state, true);
      assert.equal(isRacingCorridorSession(state), true);
    }],
  ];

  for (const [label, enterContext, leaveContext = null] of contexts) {
    const { sim, state, bus, player, sys } = boot();
    try {
      enterContext(state);
      sim.runTicks(3, 1 / 60);
      assert.equal(sys._find(), null, `${label}: no carrier materializes`);
      assert.equal(sys._row.phase, 'arrive', `${label}: visit clock stays at its initial phase`);
      assert.equal(sys._book().nextShadowAt, 0, `${label}: the ledger clock does not advance`);
      assert.equal(borrowedSunServiceStatus(state, C.stationId).reason, 'wrong_context');

      if (leaveContext) leaveContext(state);
      else if (label === 'Survival') state.run.phase = 'inactive';
      else if (label === 'physics venue session') state.physicsVenueSession = null;
      else if (label === 'active physics venue') state.physicsVenue.active = false;
      else configureRacingCorridorSession(state, false);

      sim.runTicks(3, 1 / 60);
      const carrier = sys._find();
      assert.ok(carrier, `${label}: the ordinary Adventure carrier can still materialize`);
      sys._phase('open');
      state.player.targetId = carrier.id;
      player.pos.x = carrier.pos.x;
      player.pos.z = carrier.pos.z + C.hailRange - 5;
      assert.equal(sys.offer(), true, `${label}: ordinary Adventure can hail the carrier`);

      enterContext(state);
      const credits = state.player.credits;
      const shadowClock = sys._book().nextShadowAt;
      const leaseCount = sys._book().leases.length;
      sim.runTicks(3, 1 / 60);
      bus.emit('borrowedSun:leaseBuy', { visitId: sys._row.visitId });
      assert.equal(state.player.credits, credits, `${label}: a stale prompt cannot charge credits`);
      assert.equal(sys._book().leases.length, leaseCount, `${label}: a stale prompt cannot create a lease`);
      assert.equal(sys._book().nextShadowAt, shadowClock, `${label}: its ledger does not advance while excluded`);
      assert.equal(sys.offer(), false, `${label}: a stale hail is not re-presented`);
    } finally {
      configureRacingCorridorSession(state, false);
      sim.dispose();
    }
  }
});

// ── Mirror array ──────────────────────────────────────────────────────────────

test('the mirror array unfolds at open — tagged bodies bound in the book', () => {
  const { sim, sys, carrier, book, materialize, open, liveMirrors } = boot();
  const c = materialize();
  const sails = [];
  sim.bus.on('borrowedSun:sailDeployed', (p) => sails.push(p));
  open();
  sim.runTicks(2);
  const live = liveMirrors();
  assert.equal(live.length, SUN_MIRRORS.count);
  assert.equal(sails.length, SUN_MIRRORS.count);
  const ringR = C.radius + SUN_MIRRORS.ringGap;
  for (const row of book().mirrors) {
    const e = sys._mirrorEnt(row);
    assert.ok(e, `sail ${row.slot} bound`);
    assert.equal(e.data.sunMirror, true);
    assert.equal(e.data.sunMirrorSlot, row.slot);
    assert.equal(e.data.sunMirrorVisit, sys._row.visitId);
    assert.equal(e.occupantGeneration, row.gen);
    assert.ok(Math.abs(Math.hypot(e.pos.x - c.pos.x, e.pos.z - c.pos.z) - ringR) < 0.01);
  }
});

test('sails ride the ring on a deterministic precession', () => {
  const { sim, sys, carrier, liveMirrors, materialize, open } = boot();
  const c = materialize();
  open();
  sim.runTicks(2);
  const ringR = C.radius + SUN_MIRRORS.ringGap;
  const rows = liveMirrors().map((m) => ({ slot: m.slot, pos: { ...sys._mirrorEnt(m).pos } }));
  assert.equal(rows.length, SUN_MIRRORS.count);
  // Distinct angular positions on the same ring.
  const angles = rows.map((r) => Math.atan2(r.pos.z - c.pos.z, r.pos.x - c.pos.x));
  const spread = new Set(angles.map((a) => a.toFixed(3)));
  assert.equal(spread.size, SUN_MIRRORS.count);
  sim.runTicks(tick(10));
  for (const m of liveMirrors()) {
    const e = sys._mirrorEnt(m);
    assert.ok(Math.abs(Math.hypot(e.pos.x - c.pos.x, e.pos.z - c.pos.z) - ringR) < 0.01,
      'sail holds its ring radius as it precesses');
  }
});

test('the sail-ring wash pushes a ship on the band, throttled per beat', () => {
  const { sim, sys, carrier, player, materialize, open } = boot();
  const c = materialize();
  open();
  sim.runTicks(2);
  const washes = [];
  sim.bus.on('borrowedSun:wash', (p) => washes.push(p));
  const ringR = C.radius + SUN_MIRRORS.ringGap;
  player.pos.x = c.pos.x + ringR;
  player.pos.z = c.pos.z;
  sim.runTicks(3);
  assert.ok(washes.length >= 1, 'a ship on the ring takes the wash');
  assert.equal(washes[0].entityId, player.id);
  const firstBeatCount = washes.length;
  sim.runTicks(2);
  assert.equal(washes.length, firstBeatCount, 'one push per beat — not per tick');
  sim.runTicks(tick(SUN_MIRRORS.washBeatS) + 2);
  assert.ok(washes.length > firstBeatCount, 'the wash re-arms on the next beat');
  // A ship outside the band is untouched.
  player.pos.x = c.pos.x + ringR + SUN_MIRRORS.washPad + player.radius + 300;
  const before = washes.length;
  sim.runTicks(tick(SUN_MIRRORS.washBeatS) + 4);
  assert.equal(washes.length, before, 'no wash outside the sail band');
});

// ── Collector hazards: broken glass and the debt note ─────────────────────────

test('breaking a sail opens a note, files the record, and throws glass', () => {
  const { sim, state, sys, player, book, materialize, open, liveMirrors, liveShards, killEntity, events } = boot();
  materialize();
  open();
  sim.runTicks(2);
  const row = liveMirrors()[0];
  const sail = sys._mirrorEnt(row);
  killEntity(sail, player.id);
  assert.equal(row.state, 'lost');
  assert.ok(row.respawnAt > state.simTime, 're-print scheduled on a delay');
  const d = book().debt;
  assert.ok(d && d.state === 'open', 'the ledger opens a note');
  assert.equal(d.balance, SUN_MIRRORS.costCr);
  assert.equal(d.cause, 'mirror_broken');
  assert.ok(liveShards().length >= 1, 'glass is in the lane');
  assert.equal(book().stats.mirrorsLost, 1);
  assert.ok(events.reps.some((r) => r.delta === SUN_MIRRORS.repBroke));
  assert.ok(book().records.some((r) => r.kind === 'mirror_lost'));
  // The array re-prints after the delay.
  sim.runTicks(tick(SUN_MIRRORS.respawnS) + 4);
  assert.equal(liveMirrors().length, SUN_MIRRORS.count);
});

test('a sail broken by anybody else files no note against the player', () => {
  const { sim, sys, book, materialize, open, liveMirrors, killEntity, events } = boot();
  materialize();
  open();
  sim.runTicks(2);
  const sail = sys._mirrorEnt(liveMirrors()[0]);
  killEntity(sail, 424242); // an NPC raider did it
  assert.equal(book().debt, null);
  assert.equal(book().stats.mirrorsLost, 1);
  assert.ok(!events.reps.some((r) => r.delta === SUN_MIRRORS.repBroke));
});

test('a wrong-generation impostor never binds — the slot prints a fresh sail', () => {
  const { sim, state, sys, carrier, book, materialize, open } = boot();
  const c = materialize();
  open();
  sim.runTicks(2);
  const row = book().mirrors.find((m) => m.slot === 0);
  const impostor = sim.spawn({
    type: 'drone', team: 0, pos: { x: c.pos.x, z: c.pos.z }, radius: 8, mass: 10,
    hull: 60, hullMax: 60, collides: true,
    data: { sunMirror: true, sunMirrorSlot: 0, sunMirrorVisit: sys._row.visitId,
      borrowedSunCarrierId: C.carrierId },
  });
  row.entityId = impostor.id;
  row.gen = (impostor.occupantGeneration || 1) + 9999; // a generation the body cannot have
  sim.runTicks(3);
  assert.notEqual(row.entityId, impostor.id, 'the impostor is never bound');
  assert.equal(row.state, 'live');
  assert.ok(sys._mirrorEnt(row), 'a fresh sail was printed and bound');
  assert.equal(impostor.alive, true, 'the impostor body is left alone');
});

// ── The lender's ledger: hold, vig, settle, collectors ────────────────────────

test('an open note holds the ledger — no new paper, the readout says so', () => {
  const { sim, sys, state, book, materialize, open, hail } = boot();
  materialize();
  open();
  hail();
  sys._postDebt(state, SUN_MIRRORS.costCr, 'mirror_broken');
  assert.equal(sys._bookHold(), true);
  assert.equal(sys.buyLease(), null, 'the ledger writes no new paper while a note is open');
  const board = borrowedSunBoard(state);
  assert.equal(board.debt.state, 'open');
  assert.equal(sys.readout().status, 'LEDGER HOLD');
});

test('settling the note pays exactly what the book says — once', () => {
  const { sim, sys, state, player, book, materialize, open, hail, events } = boot();
  materialize();
  open();
  hail();
  const credits0 = state.player.credits;
  const d = sys._postDebt(state, 500, 'mirror_broken');
  const paid = sys.settleSunDebt();
  assert.equal(paid, 500);
  assert.equal(state.player.credits, credits0 - 500);
  assert.equal(d.state, 'settled');
  assert.equal(sys._bookHold(), false);
  assert.equal(sys.settleSunDebt(), 0, 'the note does not collect twice');
  assert.equal(state.player.credits, credits0 - 500);
  assert.ok(events.reps.some((r) => r.delta === SUN_DEBT.repSettled));
  assert.equal(book().stats.debtsSettled, 1);
});

test('the vig runs once per crossed period — never twice', () => {
  const { sim, sys, state, book, materialize, open, events } = boot();
  materialize();
  open();
  const d = sys._postDebt(state, 500, 'mirror_broken');
  d.postedAt = state.simTime - SUN_DEBT.vigPeriodS - 1; // one period already crossed
  sim.runTicks(3);
  const vig = Math.ceil(500 * SUN_DEBT.vigFrac);
  assert.equal(d.vigApplied, 1);
  assert.equal(d.balance, 500 + vig);
  sim.runTicks(tick(SUN_DEBT.vigPeriodS) + 2);
  assert.equal(d.vigApplied, 2);
  assert.equal(d.balance, 500 + vig * 2);
  const escalations = events.grants.length;
  assert.equal(escalations, 0, 'the vig is ledger arithmetic, not a grant');
});

test('collectors field on an overdue note and levy on contact until it balances', () => {
  const { sim, sys, state, player, book, materialize, open, collectors, events } = boot();
  materialize();
  open();
  const d = sys._postDebt(state, 1000, 'mirror_broken');
  sim.runTicks(2);
  assert.equal(collectors().length, SUN_COLLECTORS.max);
  for (const e of collectors())
    assert.equal(e.data.sunCollector, d.id, 'the hull is bound to the note');
  // One hull reaches the player — one levy per hull per beat.
  const first = collectors()[0];
  first.pos.x = player.pos.x + 10;
  first.pos.z = player.pos.z;
  const credits0 = state.player.credits;
  sim.runTicks(2);
  assert.ok(state.player.credits < credits0, 'the collector levied');
  const levy = Math.min(1000, Math.max(SUN_COLLECTORS.levyMinCr, Math.ceil(1000 * SUN_COLLECTORS.levyFrac)),
    SUN_COLLECTORS.levyMaxCr);
  assert.equal(state.player.credits, credits0 - levy);
  assert.equal(d.balance, 1000 - levy);
  // Run the note down — the last levy settles the book and the hulls stand down.
  d.balance = 50;
  for (const e of collectors()) { e.pos.x = player.pos.x + 10; e.pos.z = player.pos.z; }
  sim.runTicks(tick(SUN_COLLECTORS.collectBeatS) + 4);
  for (const e of collectors()) { e.pos.x = player.pos.x + 10; e.pos.z = player.pos.z; }
  sim.runTicks(tick(SUN_COLLECTORS.collectBeatS) + 4);
  assert.equal(d.state, 'settled');
  assert.equal(d.settledHow, 'collected');
  assert.equal(collectors().length, 0, 'hulls stand down when the book balances');
});

test('a dead collector lands its fee on the note', () => {
  const { sim, sys, state, player, book, materialize, open, collectors, killEntity, events } = boot();
  materialize();
  open();
  const d = sys._postDebt(state, 1000, 'mirror_broken');
  sim.runTicks(2);
  const col = collectors()[0];
  assert.ok(col);
  const before = d.balance;
  killEntity(col, player.id);
  assert.equal(d.balance, before + SUN_DEBT.collectorKillFeeCr);
  assert.ok(events.reps.some((r) => r.delta === SUN_DEBT.repCollectorKilled));
  assert.ok(book().records.some((r) => r.kind === 'collector_killed'));
});

test('a broke debtor pays no levy — the note stays open', () => {
  const { sim, sys, state, player, book, materialize, open, collectors } = boot({ credits: 0 });
  materialize();
  open();
  const d = sys._postDebt(state, 1000, 'mirror_broken');
  sim.runTicks(2);
  const col = collectors()[0];
  assert.ok(col);
  col.pos.x = player.pos.x + 10;
  col.pos.z = player.pos.z;
  sim.runTicks(tick(SUN_COLLECTORS.collectBeatS) + 4);
  assert.equal(d.balance, 1000, 'an empty hold pays no levy');
  assert.equal(d.state, 'open');
});

// ── Light leases ──────────────────────────────────────────────────────────────

test('a light lease sells for an exact charge and collects beats in the light', () => {
  const { sim, sys, state, book, materialize, open, hail, inLight, quietShadow, events } = boot();
  materialize();
  open();
  quietShadow();
  hail();
  const credits0 = state.player.credits;
  const lease = sys.buyLease();
  assert.ok(lease);
  assert.equal(state.player.credits, credits0 - SUN_LEASES.costCr);
  assert.equal(lease.beatsTotal, SUN_LEASES.beats);
  assert.ok(events.charges.some((p) => p.requireFull === true && p.amount === SUN_LEASES.costCr));
  inLight();
  sim.runTicks(tick(SUN_LEASES.beatEveryS) + 3);
  assert.equal(lease.beatsPaid, 1);
  assert.equal(state.player.credits, credits0 - SUN_LEASES.costCr + SUN_LEASES.beatCr);
});

test('a lease that stays in the light fills, repays, and files a deed', () => {
  const { sim, sys, state, book, materialize, open, hail, inLight, quietShadow, events } = boot();
  materialize();
  open();
  quietShadow();
  hail();
  const lease = sys.buyLease();
  assert.ok(lease);
  inLight();
  const deeds0 = book().deeds;
  for (let i = 0; i < SUN_LEASES.beats; i++) sim.runTicks(tick(SUN_LEASES.beatEveryS) + 2);
  assert.equal(lease.state, 'filled');
  assert.equal(lease.beatsPaid, SUN_LEASES.beats);
  const grants = events.grants.filter((p) => String(p.reason || '').startsWith(`sun_lease:${lease.id}:`));
  assert.equal(grants.length, SUN_LEASES.beats, 'one grant per beat — no more');
  assert.equal(state.player.credits, 50000 - SUN_LEASES.costCr + SUN_LEASES.beatCr * SUN_LEASES.beats);
  assert.equal(book().deeds, deeds0 + 1);
  assert.ok(events.reps.some((r) => r.delta === SUN_LEASES.repFilled));
});

test('beats lapse out of the light — the paper does not pay for time you spent dark', () => {
  const { sim, sys, state, book, materialize, open, hail, outOfLight, quietShadow } = boot();
  materialize();
  open();
  quietShadow();
  hail();
  const lease = sys.buyLease();
  outOfLight();
  sim.runTicks(tick(SUN_LEASES.beatEveryS + SUN_LEASES.missGraceS) + 4);
  assert.equal(lease.beatsPaid, 0);
  assert.ok(lease.beatsMissed >= 1, 'the first beat lapsed');
});

test('the ledger holds lease beats while a note is open — they wait, they do not burn', () => {
  const { sim, sys, state, book, materialize, open, hail, inLight, quietShadow } = boot();
  materialize();
  open();
  quietShadow();
  hail();
  const lease = sys.buyLease();
  inLight();
  sim.runTicks(tick(SUN_LEASES.beatEveryS) + 2);
  assert.equal(lease.beatsPaid, 1);
  const d = sys._postDebt(state, 400, 'mirror_broken');
  sim.runTicks(tick(SUN_LEASES.beatEveryS) + 4);
  assert.equal(lease.beatsPaid, 1, 'held paper collects nothing');
  assert.equal(lease.beatsMissed, 0, 'held paper burns nothing');
  hail(); // settle over the hail channel, then step back into the light
  assert.ok(sys.settleSunDebt() > 0);
  inLight();
  sim.runTicks(tick(SUN_LEASES.beatEveryS) + 4);
  assert.ok(lease.beatsPaid > 1, 'the beats resume after the book balances');
});

test('the fold curtails open paper at the rebate fraction — once', () => {
  const { sim, sys, state, book, materialize, open, hail, inLight, quietShadow, events } = boot();
  materialize();
  open();
  quietShadow();
  hail();
  const lease = sys.buyLease();
  inLight();
  sim.runTicks(tick(SUN_LEASES.beatEveryS) + 2); // one beat collected
  const paid = lease.beatsPaid;
  const remaining = lease.beatsTotal - paid - lease.beatsMissed;
  sys._phase('fold', C.foldTicks);
  assert.equal(lease.state, 'curtailed');
  const rebate = Math.round(remaining * SUN_LEASES.beatCr * SUN_LEASES.curtailFrac);
  const rebates = events.grants.filter((p) => p.reason === `sun_lease_curtail:${lease.id}`);
  assert.equal(rebates.length, 1);
  assert.equal(rebates[0].amount, rebate);
});

// ── Shadow market ─────────────────────────────────────────────────────────────

test('a shadow lot posts on the clock and a real sell fills it once', () => {
  const { sim, sys, state, book, materialize, open, dock, sell, events } = boot();
  materialize();
  open();
  book().nextShadowAt = state.simTime;
  sim.runTicks(2);
  const lot = book().shadowLots.find((l) => l.state === 'open');
  assert.ok(lot, 'a demand lot posted');
  assert.ok(lot.wantQty >= SUN_SHADOW.qtyMin && lot.wantQty <= SUN_SHADOW.qtyMax);
  assert.ok(lot.premiumCr >= SUN_SHADOW.premiumMinCr && lot.premiumCr <= SUN_SHADOW.premiumMaxCr);
  const credits0 = state.player.credits;
  const deeds0 = book().deeds;
  sell(lot.commodityId, lot.wantQty, 'rcpt-shadow-1');
  assert.equal(lot.state, 'filled');
  const pay = Math.round(lot.wantQty * lot.premiumCr);
  assert.equal(state.player.credits, credits0 + pay);
  assert.equal(book().deeds, deeds0 + 1);
  assert.equal(book().stats.shadowFilled, 1);
  // The same receipt cannot fill twice — replay is a no-op.
  sell(lot.commodityId, lot.wantQty, 'rcpt-shadow-1');
  assert.equal(state.player.credits, credits0 + pay);
  assert.equal(book().stats.shadowFilled, 1);
});

test('shadow lots lapse when the shade moves on', () => {
  const { sim, sys, state, book, materialize, open } = boot();
  materialize();
  open();
  book().nextShadowAt = state.simTime;
  sim.runTicks(2);
  const lot = book().shadowLots[0];
  assert.equal(lot.state, 'open');
  sim.runTicks(tick(SUN_SHADOW.ttlS) + 4);
  assert.equal(lot.state, 'lapsed');
});

test('the shadow market honors the ledger hold', () => {
  const { sim, sys, state, book, materialize, open, dock, sell } = boot();
  materialize();
  open();
  book().nextShadowAt = state.simTime;
  sim.runTicks(2);
  const lot = book().shadowLots[0];
  sys._postDebt(state, 500, 'mirror_broken');
  dock();
  sell(lot.commodityId, lot.wantQty, 'rcpt-held');
  assert.equal(lot.state, 'open', 'the shade does not deal with a debtor');
  assert.equal(lot.gotQty, 0);
});

// ── Once-only contracts ───────────────────────────────────────────────────────

test('the visit posts exactly one charter — the latch survives a second post', () => {
  const { sim, sys, state, book, materialize, open } = boot();
  materialize();
  open();
  const ch = book().charter;
  assert.ok(ch, 'the open edge posted a charter');
  assert.equal(ch.visitId, sys._row.visitId);
  assert.equal(ch.state, 'posted');
  const again = sys._postCharter(state);
  assert.equal(again, ch, 'once per visit — the second post is the same row');
});

function craftCharter(sys, state, kind) {
  const book = ensureSunBook(state);
  book.charter = {
    id: `ch:${sys._row.visitId}:crafted`, visitId: sys._row.visitId, kind,
    commodityId: kind === 'light_tithe' ? 'cmdty_food' : null,
    wantQty: kind === 'light_tithe' ? 5 : 0, gotQty: 0, podId: null, podGen: null,
    payCr: kind === 'glass_oath' ? SUN_CHARTERS.oathPayCr
      : kind === 'last_light' ? SUN_CHARTERS.freightPayCr : SUN_CHARTERS.tithePayCr,
    rep: SUN_CHARTERS.titheRep, postedAt: state.simTime, acceptedAt: null, state: 'posted',
  };
  return book.charter;
}

test('a light tithe fills off real sells and pays once', () => {
  const { sim, sys, state, book, materialize, open, hail, dock, sell, quietShadow, events } = boot();
  materialize();
  open();
  quietShadow();
  const ch = craftCharter(sys, state, 'light_tithe');
  hail();
  assert.equal(sys.acceptCharter(), true);
  assert.equal(ch.state, 'active');
  assert.equal(sys.acceptCharter(), false, 'accepted charters do not re-accept');
  const credits0 = state.player.credits;
  const deeds0 = book().deeds;
  sell('cmdty_food', 5, 'rcpt-tithe');
  assert.equal(ch.state, 'done');
  assert.equal(state.player.credits, credits0 + SUN_CHARTERS.tithePayCr);
  assert.equal(book().deeds, deeds0 + 1);
  // A replayed receipt moves nothing.
  sell('cmdty_food', 5, 'rcpt-tithe');
  assert.equal(state.player.credits, credits0 + SUN_CHARTERS.tithePayCr);
});

test('a glass oath pays for whole glass — a broken sail voids it', () => {
  const t1 = boot();
  const { sim: s1, sys: y1, state: st1, book: b1 } = t1;
  t1.materialize();
  t1.open();
  t1.quietShadow();
  const ch = craftCharter(y1, st1, 'glass_oath');
  t1.hail();
  assert.equal(y1.acceptCharter(), true);
  const credits0 = st1.player.credits;
  y1._phase('fold', C.foldTicks);
  assert.equal(ch.state, 'done', 'glass kept to the fold pays');
  assert.equal(st1.player.credits, credits0 + SUN_CHARTERS.oathPayCr);

  const t2 = boot();
  const { sim: s2, sys: y2, state: st2, book: b2 } = t2;
  t2.materialize();
  t2.open();
  t2.quietShadow();
  s2.runTicks(2); // let the array unfold before breaking a sail
  const ch2 = craftCharter(y2, st2, 'glass_oath');
  t2.hail();
  y2.acceptCharter();
  const sail = y2._mirrorEnt(t2.liveMirrors()[0]);
  t2.killEntity(sail, 999); // even an NPC breaking the glass breaks the oath
  y2._phase('fold', C.foldTicks);
  assert.equal(ch2.state, 'void');
  assert.equal(st2.player.credits, 50000, 'a voided charter pays nothing');
});

test('a last_light pod ferried aboard completes the charter', () => {
  const { sim, sys, state, book, player, materialize, open, hail, quietShadow, events } = boot();
  materialize();
  open();
  quietShadow();
  const ch = craftCharter(sys, state, 'last_light');
  hail();
  assert.equal(sys.acceptCharter(), true);
  const pod = state.entities.get(ch.podId);
  assert.ok(pod, 'a folded-sail crate was spawned');
  assert.equal(pod.data.sunFreight, ch.id);
  // Untouched freight pays nothing — the player must actually move it.
  pod.pos.x = player.pos.x; pod.pos.z = player.pos.z;
  sim.runTicks(3);
  assert.equal(ch.state, 'active', 'unhandled freight does not deliver');
  // Player-tethered freight delivered to the carrier pays.
  player.tether = { active: true, targetId: pod.id };
  const c = sys._find();
  pod.pos.x = c.pos.x + 40;
  pod.pos.z = c.pos.z;
  const credits0 = state.player.credits;
  sim.runTicks(3);
  assert.equal(ch.state, 'done');
  assert.equal(state.player.credits, credits0 + SUN_CHARTERS.freightPayCr);
});

// ── Regard ────────────────────────────────────────────────────────────────────

test('regard: settled deeds raise the tier and scale the light', () => {
  const { sim, sys, state, book, materialize, open, hail, inLight, quietShadow } = boot();
  materialize();
  open();
  quietShadow();
  assert.equal(sunTierFor(0).tier, 0);
  assert.equal(sunTierFor(SUN_TIERS[1].deeds).id, 'accounted');
  const b = book();
  b.deeds = SUN_TIERS[1].deeds; // the book already speaks for this pilot
  assert.equal(sunStanding(state).tier, 1);
  hail();
  const lease = sys.buyLease();
  inLight();
  const credits0 = state.player.credits;
  sim.runTicks(tick(SUN_LEASES.beatEveryS) + 3);
  const expected = Math.round(SUN_LEASES.beatCr * SUN_TIERS[1].payMult);
  assert.equal(state.player.credits, credits0 + expected,
    'the ledger pays its friends better light');
});

// ── Save-safe, bounded, normalized ────────────────────────────────────────────

test('malformed book rows normalize and collections stay bounded', () => {
  const { state } = boot();
  state[SUN_BOOK_KEY] = {
    schema: 'x', seq: -4, deeds: -9, tier: -1,
    mirrors: [{ slot: 99, state: 'live' }, null, 'junk',
      { slot: 0, state: 'banana' }, { slot: 0, state: 'live', entityId: 7, visitId: 1 }],
    leases: 'nope',
    shadowLots: [{ id: 'lot:x', commodityId: 'cmdty_food', wantQty: 3, state: 'open' }],
    debt: { bogus: true },
    collectors: [{ entityId: 'x', debtId: 'd' }],
    charter: { id: 'ch:1', kind: 'not_a_kind', state: 'posted', visitId: 1 },
    paid: { a: 'bad' },
    records: 'x',
    stats: null,
  };
  const b = ensureSunBook(state);
  assert.equal(b.seq, 0);
  assert.equal(b.deeds, 0);
  assert.equal(b.leases.length, 0);
  assert.equal(b.mirrors.length, 1, 'only the valid mirror row survives');
  assert.equal(b.debt, null, 'a shapeless note is not a note');
  assert.equal(b.collectors.length, 0, 'a collector row needs a real entity id');
  assert.equal(b.charter, null, 'a charter needs a real kind');
  assert.equal(Object.keys(b.paid).length, 0, 'non-finite stamps are dropped');
  assert.deepEqual(JSON.parse(JSON.stringify(b)), b, 'the book is plain JSON');
  // Bounded: a flood of junk rows is still capped.
  b.records = Array.from({ length: 500 }, (_, i) => ({ id: `R${i}`, kind: 'junk', at: i }));
  ensureSunBook(state);
  assert.ok(b.records.length <= 24);
});

test('serialize/deserialize keeps the book — stamps and vig do not replay', () => {
  const { sim, sys, state, book, materialize, open, hail, inLight, quietShadow, events } = boot();
  materialize();
  open();
  quietShadow();
  hail();
  const lease = sys.buyLease();
  inLight();
  sim.runTicks(tick(SUN_LEASES.beatEveryS) + 2);
  const d = sys._postDebt(state, 500, 'mirror_broken');
  d.postedAt = state.simTime - SUN_DEBT.vigPeriodS - 1;
  sim.runTicks(3);
  const balanceAtSave = d.balance;
  const snapshot = JSON.parse(JSON.stringify(sys.serialize()));
  const grantsAtSave = events.grants.length;
  sys.deserialize(snapshot);
  assert.equal(book().debt.vigApplied, d.vigApplied, 'applied vig survives the envelope');
  sim.runTicks(5);
  assert.equal(book().debt.balance, balanceAtSave, 'vig does not re-apply across a load');
  const restored = book().leases.find((l) => l.id === lease.id);
  assert.equal(restored.beatsPaid, 1);
  assert.equal(restored.state, 'open');
});

test('losing the carrier voids the work but the note survives', () => {
  const { sim, sys, state, book, carrier, materialize, open, hail, inLight, quietShadow, events } = boot();
  materialize();
  open();
  quietShadow();
  hail();
  const lease = sys.buyLease();
  const d = sys._postDebt(state, 400, 'mirror_broken');
  const c = carrier();
  const grantsAtLost = events.grants.length;
  c.alive = false;
  c.hull = 0;
  busKill(sys, state, c);
  assert.equal(sys._row.lost, true);
  assert.equal(sys._row.phase, 'lost');
  assert.equal(lease.state, 'void', 'the paper dies with the light — no payout');
  assert.equal(d.state, 'open', 'the ledger is held by the combine, not the hull');
  assert.equal(events.grants.length, grantsAtLost, 'no money moves on a void');
  assert.equal(book().mirrors.length, 0, 'the array is gone with the carrier');
});

function busKill(sys, state, entity) {
  // entity:killed while the body is still in the map — the combat convention.
  sys.bus.emit('entity:killed', { id: entity.id, killerId: 999, type: entity.type });
}

test('a hand-cut book cannot hang the catch-up loops or orphan the array', () => {
  const { sim, sys, state, book, materialize, open } = boot();
  materialize();
  open();
  // A beatsTotal past the authored term would run the missed-beat loop for
  // billions of iterations; a postedAt epochs back does the same to the vig.
  book().leases.push({ id: 'ls:hostile', visitId: sys._row.visitId, costCr: 1,
    beatsTotal: 2e9, beatsPaid: 0, beatsMissed: 0, nextBeatAt: -1e12,
    state: 'open', openedAt: 0 });
  book().debt = { id: 'debt:hostile', postedVisitId: 1, cause: 'ledger',
    principal: 100, balance: 100, postedAt: -1e12, vigApplied: 0, state: 'open' };
  // Mirror rows from a dead visit crowd the bounded array ahead of this
  // visit's rows — without the purge, each tick prints and orphans fresh sails.
  for (let slot = 0; slot < SUN_MIRRORS.count; slot++)
    book().mirrors.push({ slot, entityId: null, gen: null, visitId: 999,
      state: 'live', lostAt: 0, respawnAt: 0 });
  sim.runTicks(6); // the loops are bounded — six ticks return promptly
  const lease = book().leases.find((l) => l.id === 'ls:hostile');
  assert.ok(lease.beatsTotal <= SUN_LEASES.beats, 'the term is capped at the authored beats');
  const d = book().debt;
  assert.ok(d.vigApplied > 0 && d.vigApplied <= 240, 'the vig catch-up is bounded');
  assert.equal(book().mirrors.every((m) => m.visitId === sys._row.visitId), true,
    'stale-visit sail rows are dropped, not crowded');
  // And the hostile spent-note case: beats all burned before the read.
  book().leases.push({ id: 'ls:spent', visitId: sys._row.visitId, costCr: 1,
    beatsTotal: 8, beatsPaid: 8, beatsMissed: 0, nextBeatAt: 1e12,
    state: 'open', openedAt: 0 });
  const spent = ensureSunBook(state).leases.find((l) => l.id === 'ls:spent');
  assert.notEqual(spent.state, 'open', 'a fully spent note cannot squat an open slot');
});

test('the ledger hold reaches charters too — no new business, no payout', () => {
  const { sim, sys, state, book, materialize, open, hail, quietShadow } = boot();
  materialize();
  open();
  quietShadow();
  const ch = craftCharter(sys, state, 'last_light');
  sys._postDebt(state, 500, 'mirror_broken');
  hail();
  assert.equal(sys.acceptCharter(), false, 'the counter refuses new work while the book is held');
});

test('a note posted over a settled one stands down the stale collector hulls', () => {
  const { sim, sys, state, book, materialize, open, hail, collectors } = boot();
  materialize();
  open();
  hail();
  const d1 = sys._postDebt(state, 1000, 'mirror_broken');
  sim.runTicks(2);
  const stale = collectors()[0];
  assert.ok(stale, 'collector fielded on the first note');
  assert.equal(stale.data.sunCollector, d1.id);
  // Settle over the hail channel, then a new note lands before the next tick —
  // the old hulls wear the dead note's id and their rows must not strand them.
  assert.ok(sys.settleSunDebt() > 0);
  const d2 = sys._postDebt(state, 400, 'mirror_broken');
  assert.notEqual(d2.id, d1.id);
  sim.runTicks(3);
  assert.equal(stale.alive, false, 'the superseded hull stands down, not orphans');
  for (const e of state.entityList.filter(x => x.data?.sunCollector != null && x.alive !== false))
    assert.equal(e.data.sunCollector, d2.id, 'every live hull is bound to the open note');
});

test('duplicate mirror rows cannot crowd a real slot — the array still unfolds', () => {
  const { sim, sys, book, materialize, open, liveMirrors } = boot();
  materialize();
  open();
  // A hand-cut book full of same-slot rows for this visit — without the dedupe
  // they squat the bounded slice and every tick prints and orphans fresh sails.
  for (let i = 0; i < SUN_MIRRORS.count; i++)
    book().mirrors.push({ slot: 0, entityId: null, gen: null, visitId: sys._row.visitId,
      state: 'live', lostAt: 0, respawnAt: 0 });
  sim.runTicks(6);
  const distinct = new Set(liveMirrors().map((m) => m.slot));
  assert.equal(distinct.size, SUN_MIRRORS.count, 'every ring slot still fields a sail');
  assert.ok(book().mirrors.length <= SUN_MIRRORS.count);
});

test('far-future book clocks re-arm instead of squatting their slots', () => {
  const { sim, sys, state, book, materialize, open, hail, inLight, liveMirrors } = boot();
  materialize();
  open();
  hail();
  // An open lease whose beat clock is epochs out would squat a maxOpen slot
  // without ever paying or lapsing.
  book().leases.push({ id: 'ls:far', visitId: sys._row.visitId, costCr: SUN_LEASES.costCr,
    beatsTotal: SUN_LEASES.beats, beatsPaid: 0, beatsMissed: 0, nextBeatAt: 1e12,
    state: 'open', openedAt: 0 });
  // A lost sail whose re-print clock is epochs out would dead-slot the array.
  sim.runTicks(2);
  const sailRow = book().mirrors.find((m) => m.slot === 0);
  const sail = sys._mirrorEnt(sailRow);
  sail.alive = false;
  sailRow.state = 'lost'; sailRow.entityId = null; sailRow.gen = null; sailRow.respawnAt = 1e12;
  inLight();
  sim.runTicks(tick(SUN_MIRRORS.respawnS + SUN_LEASES.beatEveryS + SUN_LEASES.missGraceS) + 8);
  const lease = book().leases.find((l) => l.id === 'ls:far');
  assert.ok(lease.beatsPaid + lease.beatsMissed > 0, 'the beat clock re-arms and beats resolve');
  assert.ok(sys._mirrorEnt(book().mirrors.find((m) => m.slot === 0 && m.state === 'live')),
    'the re-print lands on the authored delay, not the hostile one');
});

test('the board snapshot is copies — never live rows', () => {
  const { state, sys, materialize, open, hail, quietShadow } = boot();
  materialize();
  open();
  quietShadow();
  hail();
  sys.buyLease();
  const board = borrowedSunBoard(state);
  board.leases[0].beatsPaid = 999;
  board.debt = { state: 'open' };
  const b = ensureSunBook(state);
  assert.equal(b.leases[0].beatsPaid, 0, 'mutating the snapshot does not touch the book');
  assert.equal(b.debt, null);
});

// ── Kill-receipt envelopes and dead evidence ──────────────────────────────────

test('non-canonical kill receipts file the same book consequences', () => {
  const { sim, sys, state, bus, book, player, materialize, open, liveMirrors, liveShards, collectors } = boot();
  materialize();
  open();
  sim.runTicks(2);
  // entity:killed also travels as targetId/entityId — _lost accepts the whole
  // envelope, so the book must too: a missed shape breaks sails for free.
  const row = liveMirrors()[0];
  const sail = sys._mirrorEnt(row);
  sail.alive = false;
  bus.emit('entity:killed', { targetId: sail.id, killerId: player.id, type: 'drone' });
  assert.equal(row.state, 'lost');
  assert.ok(row.respawnAt > state.simTime, 'the re-print delay applies — no free instant sail');
  const d = book().debt;
  assert.ok(d && d.state === 'open', 'the note files the same as an id-shaped receipt');
  assert.equal(d.balance, SUN_MIRRORS.costCr);
  assert.ok(liveShards().length >= 1, 'glass is thrown');
  // And a collector hull down on an entityId receipt still pays its fee.
  sim.runTicks(2);
  const col = collectors()[0];
  assert.ok(col, 'the note fields a collector');
  const before = d.balance;
  col.alive = false;
  bus.emit('entity:killed', { entityId: col.id, killerId: player.id, type: 'ship' });
  assert.equal(d.balance, before + SUN_DEBT.collectorKillFeeCr, 'the kill fee lands on the note');
  assert.equal(book().collectors.some((r) => r.entityId === col.id), false, 'the dead hull\'s row closes');
});

test('an entityId-shaped destroy receipt still drops the row', () => {
  const { sim, sys, bus, book, materialize, open, liveMirrors } = boot();
  materialize();
  open();
  sim.runTicks(2);
  const row = liveMirrors()[0];
  const sail = sys._mirrorEnt(row);
  sail.alive = false;
  bus.emit('entity:destroyed', { entityId: sail.id, entity: sail });
  assert.equal(row.entityId, null, 'the despawn receipt clears the binding');
  sim.runTicks(2);
  assert.ok(sys._mirrorEnt(row), 'a fresh sail is printed and bound');
});

test('a far-future shadow clock re-arms mid-visit instead of starving the shade', () => {
  const { sim, state, book, materialize, open } = boot();
  materialize();
  open();
  // A stale or hand-cut clock epochs out would squat the open-lot slot for the
  // whole visit — the normalize heal bounds it to the authored window.
  book().nextShadowAt = state.simTime + 1e6;
  const bound = SUN_SHADOW.periodS + SUN_SHADOW.jitterS + SUN_SHADOW.ttlS;
  ensureSunBook(state);
  assert.ok(book().nextShadowAt <= state.simTime + bound, 'the clock re-arms on read');
  state.simTime += bound + 1; // the fixture owns the clock — jump the healed window
  sim.runTicks(2);
  assert.ok(book().shadowLots.some((l) => l.state === 'open'), 'the shade posts once the healed window passes');
});

test('a corpse that left the map before its kill receipt still files the book', () => {
  const { sim, sys, state, bus, book, player, materialize, open, liveMirrors, liveShards } = boot();
  materialize();
  open();
  sim.runTicks(2);
  const row = liveMirrors()[0];
  const sail = sys._mirrorEnt(row);
  // The canonical destroy path removes the body before the receipt flushes —
  // the corpse then rides the envelope as p.entity (coreSystem's queue→flush).
  // A kill receipt that lands in that shape must file the same consequences.
  sail.alive = false;
  state.entities.delete(sail.id);
  bus.emit('entity:killed', { id: sail.id, entity: sail, killerId: player.id, type: 'drone' });
  assert.equal(row.state, 'lost', 'the book saw the sail break');
  assert.ok(row.respawnAt > state.simTime, 'the re-print delay applies');
  const d = book().debt;
  assert.ok(d && d.state === 'open', 'the note files off the corpse receipt');
  assert.equal(d.balance, SUN_MIRRORS.costCr);
  assert.ok(liveShards().length >= 1, 'glass is thrown');
});

test('the carrier reads entityId-shaped destroy receipts too', () => {
  const { sim, sys, bus, carrier, materialize, open } = boot();
  const c = materialize();
  open();
  c.alive = false;
  c.hull = 0;
  bus.emit('entity:destroyed', { entityId: c.id, entity: c });
  assert.equal(sys._row.lost, true, 'the carrier loss files on the non-canonical envelope');
  assert.equal(sys._row.phase, 'lost');
});

test('a lost sail row with an un-armed clock still re-prints — no dead ring slot', () => {
  const { sim, sys, book, materialize, open, liveMirrors } = boot();
  materialize();
  open();
  sim.runTicks(2);
  const row = book().mirrors.find((m) => m.slot === 0);
  // A hand-cut lost row whose re-print clock was never set would otherwise sit
  // lost for the whole visit — the slot dead, the array short a sail forever.
  const oldSail = sys._mirrorEnt(row);
  row.state = 'lost'; row.entityId = null; row.gen = null; row.respawnAt = 0;
  sim.runTicks(3);
  assert.equal(row.state, 'live');
  assert.ok(sys._mirrorEnt(row), 'the slot prints its sail again');
  assert.notEqual(sys._mirrorEnt(row), oldSail, 'a fresh body is bound');
  assert.equal(liveMirrors().length, SUN_MIRRORS.count);
});

test('the fold nets a curtailed rebate against the open note — nothing leaks the hold', () => {
  const { sim, sys, state, book, materialize, open, hail, inLight, quietShadow, events } = boot();
  materialize();
  open();
  quietShadow();
  hail();
  const lease = sys.buyLease();
  inLight();
  sim.runTicks(tick(SUN_LEASES.beatEveryS) + 2); // one beat collected
  const remaining = lease.beatsTotal - lease.beatsPaid - lease.beatsMissed;
  const rebate = Math.round(remaining * SUN_LEASES.beatCr * SUN_LEASES.curtailFrac);
  const d = sys._postDebt(state, 5000, 'mirror_broken');
  const balance0 = d.balance;
  const credits0 = state.player.credits;
  sys._phase('fold', C.foldTicks);
  assert.equal(lease.state, 'curtailed');
  assert.equal(d.balance, balance0 - rebate, 'the rebate pays the note down, not the debtor');
  assert.equal(state.player.credits, credits0, 'no credits moved while the ledger held');
  assert.equal(events.grants.filter((p) => p.reason === `sun_lease_curtail:${lease.id}`).length, 0,
    'no curtail grant escapes the hold');
  assert.ok(book().records.some((r) => r.kind === 'debt_netted'));
});

test('a rebate larger than the note settles the book and pays only the excess', () => {
  const { sim, sys, state, book, materialize, open, hail, quietShadow, events } = boot();
  materialize();
  open();
  quietShadow();
  hail();
  const lease = sys.buyLease();
  const rebate = Math.round(lease.beatsTotal * SUN_LEASES.beatCr * SUN_LEASES.curtailFrac);
  const d = sys._postDebt(state, 40, 'mirror_broken'); // the rebate dwarfs the note
  const credits0 = state.player.credits;
  sys._phase('fold', C.foldTicks);
  assert.equal(lease.state, 'curtailed');
  assert.equal(d.state, 'settled');
  assert.equal(d.settledHow, 'net');
  assert.equal(state.player.credits, credits0 + (rebate - 40),
    'only the excess over the note pays out');
  assert.equal(book().stats.debtsSettled, 1);
});

test('a levy latches the note before the charge emit — a re-entrant settle cannot over-collect', () => {
  const { sim, sys, state, bus, player, book, materialize, open, hail, collectors, events } = boot();
  materialize();
  open();
  hail();
  const d = sys._postDebt(state, 1000, 'mirror_broken');
  sim.runTicks(2);
  assert.ok(collectors().length >= 1);
  for (const e of collectors()) { e.pos.x = player.pos.x + 10; e.pos.z = player.pos.z; }
  const balance0 = d.balance;
  // A synchronous listener settling inside the levy's charge emit is the
  // re-entrancy the latch-before-emit rule exists for.
  const settleOnLevy = (p) => {
    if (String(p?.reason || '').startsWith('sun_levy:')) sys.settleSunDebt();
  };
  bus.on('economy:chargeCredits', settleOnLevy);
  const credits0 = state.player.credits;
  sim.runTicks(2);
  bus.off('economy:chargeCredits', settleOnLevy);
  assert.equal(d.state, 'settled');
  const levies = events.charges.filter((p) => String(p.reason || '').startsWith('sun_levy:'));
  assert.equal(levies.length, 1, 'exactly one levy lands — the settled note stops the rest');
  assert.equal(state.player.credits, credits0 - balance0,
    'the levy plus the settle charge exactly the note — never more');
});

test('a collector announced to a killer still carries its ledger row', () => {
  const { sim, sys, state, bus, book, player, materialize, open, hail, collectors } = boot();
  materialize();
  open();
  hail();
  const d = sys._postDebt(state, 1000, 'mirror_broken');
  // Kill the hull inside its own announce — the row must already exist, or the
  // fee never files and a corpse row leaks into the next reap.
  bus.on('borrowedSun:collectorsOut', (p) => {
    const e = state.entities.get(p.collectorId);
    if (e) { e.alive = false; bus.emit('entity:killed', { id: e.id, killerId: player.id, type: 'ship' }); }
  });
  const balance0 = d.balance;
  sim.runTicks(1); // one tick fields the full complement — each announce had its row
  assert.equal(d.balance, balance0 + SUN_COLLECTORS.max * SUN_DEBT.collectorKillFeeCr,
    'every hull killed inside its own announce still files the fee on the note');
  assert.equal(book().collectors.length, 0, 'the killed hulls left no corpse rows');
});

test('the book refuses mid-restore — no settle, no trade fill', () => {
  const { sim, sys, state, bus, book, materialize, open, hail, sell } = boot();
  materialize();
  open();
  hail();
  sys._postDebt(state, 500, 'mirror_broken');
  bus.emit('save:restoring');
  assert.equal(sys._restoring, true);
  assert.equal(sys.settleSunDebt(), 0, 'no settle while the book restores');
  sell('cmdty_food', 5, 'rcpt-restore');
  assert.equal(book().shadowLots.some((l) => l.gotQty > 0), false, 'no fill while the book restores');
  bus.emit('save:loaded');
  assert.equal(sys._restoring, false);
  assert.ok(sys.settleSunDebt() > 0, 'the settle lands once the restore finishes');
});

test('a tagged sail no live row binds is reclaimed — foreign impostors are not', () => {
  const { sim, sys, state, carrier, book, materialize, open, liveMirrors } = boot();
  const c = materialize();
  open();
  sim.runTicks(2);
  assert.equal(liveMirrors().length, SUN_MIRRORS.count);
  // A dropped row's body: every real tag, a real generation — but no row
  // references it. Left in place it holds its slot and silhouette forever.
  const orphan = sim.spawn({
    type: 'drone', team: 0, pos: { x: c.pos.x + 200, z: c.pos.z }, radius: 8, mass: 10,
    hull: 60, hullMax: 60, collides: true,
    data: { sunMirror: true, sunMirrorSlot: 0, sunMirrorVisit: sys._row.visitId,
      borrowedSunCarrierId: C.carrierId, persistenceOwner: C.owner },
  });
  // A foreign body wearing look-alike tags is not ours to touch.
  const impostor = sim.spawn({
    type: 'drone', team: 0, pos: { x: c.pos.x + 240, z: c.pos.z }, radius: 8, mass: 10,
    hull: 60, hullMax: 60, collides: true,
    data: { sunMirror: true, sunMirrorSlot: 0, sunMirrorVisit: sys._row.visitId,
      borrowedSunCarrierId: C.carrierId },
  });
  sim.runTicks(3);
  assert.equal(orphan.alive, false, 'the unbound tagged sail is reclaimed');
  assert.equal(impostor.alive, true, 'a body without our ownership tag is left alone');
  assert.equal(liveMirrors().length, SUN_MIRRORS.count, 'the bound array is untouched');
});
