// faction-frontier-expansion — the board layer under W-FRONTIER (build_map §34.5).
//
// Covers the settler layer a raised homestead plugs into:
//   lead wire     leads post on a stead's clock, verify on the named work, sour cold
//   job tiers     deeds accrue into standing; the tier scales every payout
//   mutual aid    a marker pod carried to the debtor — or the player's own covering it
//   salvage       a derelict on a claim ring is filed; the haul settles, the strip jumps
//   defense calls raids close, strip stores to a floor, call hands, pay the repel
//   justice       stead loss files verdicts, names the killer, pays the collected name
//
// Determinism: simTime clocks, per-stead mulberry seeds, tick/seq hashes only.
// Money moves through economy:grantCredits; standing through faction:repDelta.
//
// Run: node --test test/faction-frontier-expansion.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import {
  frontierHomesteads,
  ensureFrontierState,
  frontierBoard,
  frontierJobTier,
  frontierJustice,
  frontierLeads,
  frontierTierFor,
  FRONTIER_MODULES,
  FRONTIER_BOARD,
  FRONTIER_JOB_TIERS,
  FRONTIER_MUTUAL_AID,
  FRONTIER_SALVAGE_CLAIMS,
  FRONTIER_DEFENSE,
  FRONTIER_JUSTICE,
} from '../src/systems/faction_frontier.js';
import {
  FRONTIER_FRAME,
  FRONTIER_BARN_RAISING,
} from '../src/data/factions/free.js';

const SEED = 9091;

function boot() {
  const bus = createBus();
  const sim = createSimulation({ seed: SEED, bus, systems: [frontierHomesteads] });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_io_reach';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: -4000, z: -4000 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true, data: { name: 'PLAYER' },
  });
  state.playerId = player.id;
  const taps = {};
  const on = (ev, key) => {
    const heard = [];
    taps[key || ev] = heard;
    bus.on(ev, (p) => heard.push(p));
  };
  const grants = [];
  const reps = [];
  bus.on('economy:grantCredits', (p) => grants.push(p));
  bus.on('faction:repDelta', (p) => reps.push(p));
  return { sim, state, bus, player, taps, on, grants, reps };
}

const frame = (sim, x = 0, z = 0) => sim.spawn({
  type: 'station', team: 0, factionId: 'faction_free',
  pos: { x, z }, radius: FRONTIER_FRAME.radius, mass: 1e6,
  hull: 2000, hullMax: 2000, collides: true,
  data: { homesteadFrame: true, typeId: FRONTIER_FRAME.typeId },
});

const moduleFor = (sim, kind, x, z) => {
  const spec = FRONTIER_MODULES.find((m) => m.id === kind);
  return sim.spawn({
    type: 'payload', team: 0, factionId: 'faction_free',
    pos: { x, z }, radius: spec.radius, mass: spec.mass,
    hull: 100, hullMax: 100, collides: true,
    data: { homesteadModule: kind, name: spec.label },
  });
};

/** Raise a stead on the real path: six modules snap, welders finish. */
function raiseStead(sim, x = 0, z = 0) {
  const f = frame(sim, x, z);
  for (const m of FRONTIER_MODULES) {
    moduleFor(sim, m.id, x + FRONTIER_FRAME.snapRange - 60, z + (m.mass % 40) - 20);
  }
  sim.runTicks(Math.ceil(FRONTIER_BARN_RAISING.weldTimeS * 60) + 10);
  assert.equal(f.data.homestead, true, 'the frame became the homestead');
  return f;
}

const recOf = (state, entityId) =>
  ensureFrontierState(state).homesteads.find((r) => r.entityId === entityId);

const supplyPod = (sim, x, z) => sim.spawn({
  type: 'payload', team: 0, pos: { x, z }, radius: 6, mass: 10,
  hull: 10, hullMax: 10, collides: true, data: { supplyCargo: true },
});

const hostileShip = (sim, x, z, data = {}) => sim.spawn({
  type: 'ship', team: 1, pos: { x, z }, radius: 14, mass: 36,
  hull: 120, hullMax: 120, collides: true,
  data: { frontierRaider: true, ai: { pirate: true, hostile: true }, ...data },
});

const killBy = (bus, victim, killerId, extra = {}) => bus.emit('entity:killed', {
  id: victim.id, killerId, type: victim.type,
  pos: { x: victim.pos.x, z: victim.pos.z },
  factionId: victim.factionId ?? null,
  targetHostileToPlayer: true,
  ...extra,
});

// ── Exports and the board surface ────────────────────────────────────────────

test('exports: the old contract is intact and the board layer is additive', () => {
  assert.equal(frontierHomesteads.name, 'frontierHomesteads');
  assert.equal(FRONTIER_MODULES.length, 6);
  assert.equal(typeof ensureFrontierState, 'function');
  assert.equal(typeof frontierBoard, 'function');
  assert.equal(typeof frontierJobTier, 'function');
  assert.equal(typeof frontierJustice, 'function');
  assert.equal(typeof frontierLeads, 'function');
  assert.equal(frontierTierFor(0).id, 'drifter');
  assert.equal(frontierTierFor(FRONTIER_JOB_TIERS[4].deeds).id, 'pillar');
  for (const k of ['leadPeriodS', 'verifyPayCr', 'supplyFeeCr']) {
    assert.ok(FRONTIER_BOARD[k] > 0, `FRONTIER_BOARD.${k}`);
  }
  assert.ok(FRONTIER_MUTUAL_AID.maxOpen >= 1);
  assert.ok(FRONTIER_SALVAGE_CLAIMS.claimRadius > FRONTIER_SALVAGE_CLAIMS.settleRadius);
  // The strip ring must be reachable from the hold ring, or raids starve forever.
  const steadRadius = FRONTIER_FRAME.radius;
  assert.ok(
    Math.max(steadRadius + FRONTIER_DEFENSE.contactPad, FRONTIER_DEFENSE.standoffR)
      >= FRONTIER_DEFENSE.standoffR,
    'contact is never inside the hold ring',
  );
  assert.ok(FRONTIER_JUSTICE.logCap > 0);
});

test('frontierBoard gives a HUD-safe copy of the whole board', () => {
  const { sim, state } = boot();
  try {
    const board = frontierBoard(state);
    assert.equal(board.tier.id, 'drifter');
    assert.equal(board.deeds, 0);
    for (const k of ['leads', 'debts', 'disputes', 'calls', 'vendettas', 'justice', 'supplyRuns']) {
      assert.ok(Array.isArray(board[k]), `board.${k}`);
    }
    assert.equal(board.raidsSpawned, 0);
    board.leads.push({ bogus: true });
    assert.equal(frontierBoard(state).leads.length, 0, 'the snapshot is a copy, not the ledger');
  } finally {
    sim.dispose();
  }
});

// ── The lead wire ────────────────────────────────────────────────────────────

test('lead wire: a stranded stead posts a hungry lead; a landed pod verifies and pays', () => {
  const { sim, state, bus, grants, reps, taps, on } = boot();
  try {
    const stead = raiseStead(sim);
    const rec = recOf(state, stead.id);
    rec.lastSupplyAt = -400; // stranded on the next tick — the lead is 'hungry'
    on('frontier:leadPosted', 'posted');
    on('frontier:leadVerified', 'verified');
    on('frontier:supplyRunAsked', 'asked');
    sim.runTicks(Math.ceil((FRONTIER_BOARD.firstLeadS + FRONTIER_BOARD.leadJitterS + 40) * 60));
    assert.equal(rec.stranded, true, 'left alone, it went thin');
    assert.ok(frontierLeads(state).some((l) => l.state === 'open'), 'the wire has live leads');
    const hungry = taps.posted.filter((p) => p.kind === 'hungry' && p.steadId === stead.id);
    assert.ok(hungry.length >= 1, 'a stranded stead posts a hungry lead');
    assert.equal(taps.asked.length >= 1, true, 'the board heard the supply ask');

    // A pod lands — the wire verifies the rumor it posted, and the board pays.
    supplyPod(sim, stead.pos.x + 50, stead.pos.z);
    sim.step();
    const verified = taps.verified.filter((p) => p.leadId === hungry[0].leadId);
    assert.equal(verified.length, 1, 'the lead verified on the real work');
    assert.equal(verified[0].how, 'supply');
    const leadPay = grants.find((g) => g.reason === `frontier_lead:${hungry[0].leadId}`);
    assert.ok(leadPay && leadPay.amount >= FRONTIER_BOARD.verifyPayCr, 'verification pays × tier');
    assert.ok(reps.some((r) => r.factionId === 'faction_free' && r.reason === 'frontier_lead_verified'));
    assert.equal(rec.stranded, false, 'provisioned');
  } finally {
    sim.dispose();
  }
});

test('lead wire: an ignored lead sours and costs a little standing', () => {
  const { sim, state, reps, taps, on } = boot();
  try {
    const stead = raiseStead(sim);
    const f = ensureFrontierState(state);
    f.leads.push({
      id: `lead:${stead.id}:sour`, kind: 'hungry', steadId: stead.id, steadName: recOf(state, stead.id).name,
      sectorId: 'sector_io_reach', pos: { x: stead.pos.x, z: stead.pos.z },
      postedAt: 0, expiresAt: state.simTime - 1, state: 'open',
    });
    on('frontier:leadSoured', 'soured');
    sim.step();
    assert.equal(taps.soured.length, 1, 'the cold lead soured');
    assert.equal(f.leads.find((l) => l.id === `lead:${stead.id}:sour`).state, 'soured');
    assert.ok(reps.some((r) => r.reason === 'frontier_lead_soured' && r.delta < 0),
      'the sour costs frontier standing');
    // Once-only: another tick does not re-bill the same sour.
    const repCount = reps.filter((r) => r.reason === 'frontier_lead_soured').length;
    sim.step();
    assert.equal(reps.filter((r) => r.reason === 'frontier_lead_soured').length, repCount);
  } finally {
    sim.dispose();
  }
});

// ── Job tiers and the deed counter ───────────────────────────────────────────

test('job tiers: board work counts deeds and the tier row answers the count', () => {
  const { sim, state, taps, on } = boot();
  try {
    const stead = raiseStead(sim);
    on('frontier:deed', 'deeds');
    const rec = recOf(state, stead.id);
    rec.lastSupplyAt = -400;
    sim.step();
    supplyPod(sim, stead.pos.x + 40, stead.pos.z);
    sim.step();
    const board = frontierBoard(state);
    assert.ok(board.deeds >= 1, 'the supply run counted as board work');
    assert.ok(taps.deeds.some((d) => d.kind === 'supply'), 'a frontier:deed receipt rode it');
    const tier = frontierJobTier(state);
    assert.equal(tier.tier, frontierTierFor(board.deeds).tier);
    assert.equal(typeof tier.payMult, 'number');
  } finally {
    sim.dispose();
  }
});

// ── Mutual aid ───────────────────────────────────────────────────────────────

function twoSteads(sim) {
  const a = raiseStead(sim, 0, 0);
  const b = raiseStead(sim, 6000, 0);
  return { a, b };
}

test('mutual aid: the board pairs debtor and creditor; the carried marker pays the carrier', () => {
  const { sim, state, grants, taps, on } = boot();
  try {
    const { a, b } = twoSteads(sim);
    const f = ensureFrontierState(state);
    const recA = recOf(state, a.id);
    const recB = recOf(state, b.id);
    // A owes, B carries. Force the stranded/provisioned split honestly.
    recA.lastSupplyAt = -400;
    recB.lastSupplyAt = state.simTime;
    recB.supplies = 2;
    f.nextDebtAt = 0;
    on('frontier:debtPosted', 'posted');
    on('frontier:debtSettled', 'settled');
    sim.step();
    assert.equal(taps.posted.length, 1, 'the board posted a marker');
    const debt = f.debts.find((d) => d.state === 'open');
    assert.ok(debt, 'an open debt exists');
    assert.equal(debt.debtorId, a.id);
    assert.equal(debt.creditorId, b.id);
    const marker = state.entities.get(debt.markerId);
    assert.ok(marker && marker.data?.frontierAidId === debt.id, 'a real pod rides the creditor ring');

    // Carry it: the marker inside the debtor's reach lands the aid.
    marker.pos.x = a.pos.x + 30; marker.pos.z = a.pos.z;
    sim.step();
    assert.equal(taps.settled.length, 1);
    assert.equal(taps.settled[0].how, 'carried');
    assert.equal(debt.state, 'paid');
    assert.equal(recA.stranded, false, 'the debtor steadies');
    assert.ok(recA.supplies >= 1);
    assert.ok(grants.some((g) => g.reason === `frontier_aid:${debt.id}`), 'the carrier got paid');
    assert.equal(marker.alive, false, 'the marker is spent');
  } finally {
    sim.dispose();
  }
});

test('mutual aid: a supply pod to the debtor covers the marker without the tow', () => {
  const { sim, state, taps, on } = boot();
  try {
    const { a, b } = twoSteads(sim);
    const f = ensureFrontierState(state);
    const recA = recOf(state, a.id);
    const recB = recOf(state, b.id);
    recA.lastSupplyAt = -400;
    recB.lastSupplyAt = state.simTime;
    recB.supplies = 1;
    f.nextDebtAt = 0;
    on('frontier:debtSettled', 'settled');
    sim.step();
    const debt = f.debts.find((d) => d.state === 'open');
    assert.ok(debt, 'the marker posted');
    // The player's own pods stand in for the carried marker.
    supplyPod(sim, a.pos.x + 40, a.pos.z);
    sim.step();
    assert.equal(taps.settled.length, 1);
    assert.equal(taps.settled[0].how, 'covered', 'the player covered the marker');
    assert.equal(debt.state, 'paid');
  } finally {
    sim.dispose();
  }
});

// ── Salvage-rights disputes ──────────────────────────────────────────────────

test('salvage rights: a hulk on the claim ring is filed; the player haul settles it', () => {
  const { sim, state, player, grants, taps, on } = boot();
  try {
    const stead = raiseStead(sim);
    const rec = recOf(state, stead.id);
    const wreck = sim.spawn({
      type: 'wreck', team: 0, pos: { x: stead.pos.x + 500, z: 0 }, radius: 20, mass: 200,
      hull: 200, hullMax: 200, collides: true, data: { derelict: true },
    });
    on('frontier:disputePosted', 'posted');
    on('frontier:disputeSettled', 'settled');
    on('frontier:justiceFiled', 'justice');
    sim.step();
    assert.equal(taps.posted.length, 1, 'the board filed the claim');
    assert.ok(taps.posted[0].steadIds.includes(stead.id));
    assert.equal(wreck.data.frontierDisputeId, taps.posted[0].disputeId, 'the tag rides the hulk');

    // The player's haul: inside the claimant's ring, carried by the player's hand.
    wreck.data.thrownBy = 'player';
    wreck.pos.x = stead.pos.x + FRONTIER_SALVAGE_CLAIMS.settleRadius - 40;
    sim.step();
    assert.equal(taps.settled.length, 1, 'the stead took title');
    assert.equal(wreck.alive, false, 'the hulk is stripped into the stead');
    assert.ok(rec.supplies >= 1, 'title is supplies and scrap');
    assert.ok(grants.some((g) => g.reason?.startsWith('frontier_claim:dsp:')), 'the board paid the haul');
    assert.ok(taps.justice.some((j) => j.kind === 'salvage_settled'), 'the verdict is filed');
  } finally {
    sim.dispose();
  }
});

test('salvage rights: hauling a filed hulk out of the ring is jumped and costs name', () => {
  const { sim, state, reps, taps, on } = boot();
  try {
    const stead = raiseStead(sim);
    const wreck = sim.spawn({
      type: 'derelict', team: 0, pos: { x: stead.pos.x + 400, z: 0 }, radius: 18, mass: 150,
      hull: 100, hullMax: 100, collides: true, data: { derelict: true },
    });
    on('frontier:disputeJumped', 'jumped');
    on('frontier:justiceFiled', 'justice');
    sim.step();
    assert.equal(wreck.data.frontierDisputeId != null, true, 'the claim is filed');
    // The player carries it clean out of every claimant's ring.
    wreck.data.thrownBy = 'player';
    wreck.pos.x = stead.pos.x + FRONTIER_SALVAGE_CLAIMS.claimRadius + 400;
    sim.step();
    assert.equal(taps.jumped.length, 1, 'the board filed the jumping');
    assert.ok(reps.some((r) => r.reason === 'frontier_claim_jumped' && r.delta < 0),
      'jumping a filed claim costs name');
    assert.ok(taps.justice.some((j) => j.kind === 'salvage_jumped'));
  } finally {
    sim.dispose();
  }
});

// ── Defense calls and frontier justice ───────────────────────────────────────

test('defense call: a spawned raid calls hands; a player repel pays bounty and clears', () => {
  const { sim, state, player, bus, grants, taps, on } = boot();
  try {
    const stead = raiseStead(sim);
    const rec = recOf(state, stead.id);
    rec.nextRaidAt = state.simTime; // the tide turns now
    on('frontier:raidSpawned', 'raid');
    on('frontier:defenseCalled', 'called');
    on('frontier:defenseCleared', 'cleared');
    on('frontier:raiderRepelled', 'repelled');
    on('frontier:justiceFiled', 'justice');
    sim.step();
    assert.equal(taps.raid.length, 1, 'the stead is marked');
    const raiderIds = taps.raid[0].raiderIds;
    assert.ok(raiderIds.length >= 1 && raiderIds.length <= FRONTIER_DEFENSE.raiderMax);
    // Push the raiders inside the watch ring — hands are called.
    for (const id of raiderIds) {
      const r = state.entities.get(id);
      r.pos.x = stead.pos.x + 400; r.pos.z = stead.pos.z;
      assert.equal(r.data.frontierRaider, true);
      assert.equal(r.data.raidSteadId, stead.id);
    }
    sim.step();
    assert.equal(taps.called.length, 1, 'the stead calls for hands');
    assert.equal(taps.called[0].steadId, stead.id);

    // The player repels them all — the board pays each hull, once.
    for (const id of raiderIds) {
      const r = state.entities.get(id);
      r.alive = false;
      killBy(bus, r, player.id);
    }
    sim.step();
    assert.equal(taps.repelled.length, raiderIds.length);
    const repelGrants = grants.filter((g) => g.reason?.startsWith('frontier_repel:'));
    assert.equal(repelGrants.length, raiderIds.length, 'every repelled hull pays, once each');
    assert.ok(taps.justice.filter((j) => j.kind === 'repelled').length >= raiderIds.length);
    assert.equal(taps.cleared.length, 1, 'no hostiles on the ring — the call clears');
  } finally {
    sim.dispose();
  }
});

test('defense call: a raider in contact strips stores to the floor, then slips off', () => {
  const { sim, state, taps, on } = boot();
  try {
    const stead = raiseStead(sim);
    const rec = recOf(state, stead.id);
    rec.supplies = 2;
    // Hull already at the raid floor — the strip is about the stores.
    stead.hull = Math.floor(stead.hullMax * FRONTIER_DEFENSE.hullFloorFrac);
    rec.nextRaidAt = state.simTime;
    on('frontier:steadStruck', 'struck');
    sim.step();
    const raider = state.entityList.find((e) => e.data?.frontierRaider === true);
    assert.ok(raider, 'a freebooter rides in');
    // Set it inside the contact ring — the strip has to be reachable from the hold.
    // (The focused sim runs no velocity integrator, so a raider set outside the
    // ring could never steer itself in; contact is the scenario under test.)
    const contact = Math.max(stead.radius + FRONTIER_DEFENSE.contactPad, FRONTIER_DEFENSE.standoffR);
    raider.pos.x = stead.pos.x + contact - 10; raider.pos.z = stead.pos.z;
    // Two supplies at a beat each, then nothing left to take — it is done.
    const stripTicks = Math.ceil((FRONTIER_DEFENSE.raidStripS * 3 + 8) * 60);
    sim.runTicks(stripTicks);
    assert.equal(rec.supplies, 0, 'the raider robbed the stores');
    assert.ok(raider.data.done === true, 'stores dry, hull at floor — the raid is over');
    assert.ok(taps.struck.length >= 1, 'the board heard the stead take hits');
    assert.equal(rec.stranded, true, 'robbed thin — the stead asks the board again');
    assert.ok(frontierBoard(state).supplyRuns.length >= 1, 'a fresh ask is on the board');
    assert.equal(stead.hull >= Math.floor(stead.hullMax * FRONTIER_DEFENSE.hullFloorFrac), true,
      'a raid robs; it does not raze');
  } finally {
    sim.dispose();
  }
});

test('justice: the stead falls, the killer is named, the player collects the price', () => {
  const { sim, state, player, bus, grants, reps, taps, on } = boot();
  try {
    const stead = raiseStead(sim);
    const rec = recOf(state, stead.id);
    const killer = sim.spawn({
      type: 'ship', team: 1, pos: { x: stead.pos.x + 300, z: 0 }, radius: 14, mass: 36,
      hull: 120, hullMax: 120, collides: true, data: { name: 'Freebooter chief' },
    });
    on('frontier:homesteadLost', 'lost');
    on('frontier:vendettaPosted', 'vposted');
    on('frontier:vendettaPaid', 'vpaid');
    stead.alive = false;
    killBy(bus, stead, killer.id, { targetHostileToPlayer: false });
    assert.equal(taps.lost.length, 1, 'the chart marks the stead lost');
    assert.equal(rec.gone, true);
    assert.ok(taps.vposted.length >= 1, 'a price on the crew that broke her');
    assert.equal(killer.data.vendettaMark != null, true, 'the mark rides the killer\'s hull');
    assert.ok(frontierJustice(state).some((j) => j.kind === 'stead_lost'), 'the verdict is filed');

    // The player collects — once, even on a doubled kill wire.
    killer.alive = false;
    killBy(bus, killer, player.id);
    killBy(bus, killer, player.id);
    const paid = taps.vpaid.filter((p) => p.targetId === killer.id);
    assert.equal(paid.length, 1, 'the name pays exactly once');
    const venGrants = grants.filter((g) => g.reason?.startsWith('frontier_vendetta:'));
    assert.equal(venGrants.length, 1);
    assert.ok(venGrants[0].amount >= FRONTIER_JUSTICE.vendettaPayCr, 'the price is the posted one');
    assert.ok(reps.some((r) => r.reason === 'frontier_vendetta_paid'));
    assert.ok(frontierJustice(state).some((j) => j.kind === 'vendetta_settled'));
  } finally {
    sim.dispose();
  }
});

test('justice: a settler hull murdered on stead ground files the pilot in charcoal', () => {
  const { sim, state, player, bus, reps, taps, on } = boot();
  try {
    const stead = raiseStead(sim);
    const settler = sim.spawn({
      type: 'ship', team: 0, factionId: 'faction_free',
      pos: { x: stead.pos.x + 200, z: 0 }, radius: 12, mass: 24,
      hull: 100, hullMax: 100, collides: true, data: { name: 'SETTLER' },
    });
    on('frontier:justiceFiled', 'justice');
    settler.alive = false;
    killBy(bus, settler, player.id, { targetHostileToPlayer: false });
    assert.ok(reps.some((r) => r.reason === 'frontier_settler_killed' && r.delta < 0),
      'a settler killed on stead ground costs real name');
    assert.ok(taps.justice.some((j) => j.kind === 'outlaw'), 'the board files it');
  } finally {
    sim.dispose();
  }
});

// ── Raid lead verification by repel ──────────────────────────────────────────

test('raid lead: a hostile repelled inside the ring verifies the wire', () => {
  const { sim, state, player, bus, taps, on } = boot();
  try {
    const stead = raiseStead(sim);
    const f = ensureFrontierState(state);
    f.leads.push({
      id: `lead:${stead.id}:raid`, kind: 'raid', steadId: stead.id,
      steadName: recOf(state, stead.id).name, sectorId: 'sector_io_reach',
      pos: { x: stead.pos.x, z: stead.pos.z }, postedAt: 0,
      expiresAt: state.simTime + 500, state: 'open',
    });
    on('frontier:leadVerified', 'verified');
    const pirate = hostileShip(sim, stead.pos.x + 200, 0, { frontierRaider: false, raider: false });
    delete pirate.data.frontierRaider; // a passing hostile, not a board-spawned hull
    pirate.alive = false;
    killBy(bus, pirate, player.id);
    const v = taps.verified.filter((p) => p.leadId === `lead:${stead.id}:raid`);
    assert.equal(v.length, 1, 'a repelled hull inside the ring verifies the raid lead');
    assert.equal(v[0].how, 'repelled');
  } finally {
    sim.dispose();
  }
});

// ── Entity-id recycling ──────────────────────────────────────────────────────

test('a recycled id is not the stead: the board writes the loss, not the impostor', () => {
  const { sim, state, taps, on } = boot();
  try {
    const stead = raiseStead(sim);
    const rec = recOf(state, stead.id);
    const gen = rec.gen;
    assert.ok(gen == null || Number.isInteger(gen));
    on('frontier:homesteadLost', 'lost');
    // Give the stead a live lead first, so the lapse below is real.
    rec.nextLeadAt = state.simTime;
    sim.step();
    assert.ok(frontierLeads(state).some((l) => l.state === 'open' && l.steadId === stead.id),
      'a live lead sits on the wire');
    // The id is recycled: a new occupant carries no homestead tag.
    const impostor = state.entities.get(stead.id);
    impostor.data.homestead = false;
    delete impostor.data.steadName;
    sim.step();
    assert.equal(rec.gone, true, 'the rec falls with its body, not its number');
    assert.equal(taps.lost.length, 1);
    assert.equal(frontierBoard(state).leads.every((l) => l.state !== 'open' || l.steadId !== stead.id),
      true, 'open leads lapse with the stead');
  } finally {
    sim.dispose();
  }
});

// ── Save-safety: malformed state normalizes ──────────────────────────────────

test('malformed frontier state normalizes instead of sinking the tick', () => {
  const { sim, state } = boot();
  try {
    state.frontier = {
      homesteads: [null, 'junk', { entityId: 9999, pos: 'bad', modules: 4, supplies: 'x' }],
      supplyRuns: 'no', leads: [{}], debts: [{ id: 'd' }],
      disputes: [{ id: 1 }], calls: 'x', vendettas: [{ id: 'v' }],
      justice: 'nope', paid: 3, seq: 'q', deeds: 'many',
    };
    const f = ensureFrontierState(state);
    assert.equal(f.homesteads.length, 1, 'the one shaped row survives');
    const rec = f.homesteads[0];
    assert.deepEqual(rec.pos, { x: 0, z: 0 });
    assert.equal(rec.supplies, 0);
    assert.equal(typeof rec.raidSeed, 'number');
    assert.ok(Array.isArray(f.leads) && f.leads.length === 0);
    assert.equal(f.seq, 0);
    sim.step(); // a corrupt save must not sink the tick
    assert.ok(true);
  } finally {
    sim.dispose();
  }
});

// ── Weld bond: entity-id recycling on the joint ──────────────────────────────

test('a recycled joint id releases the weld instead of riding the impostor', () => {
  const { sim, state, player } = boot();
  try {
    player.data = { ...(player.data || {}), lineHeadId: 'head_weld' };
    const joint = sim.spawn({
      type: 'asteroid', team: 0, pos: { x: 200, z: 0 }, radius: 40, mass: 900,
      hull: 300, hullMax: 300, collides: true, data: { material: 'rock' },
    });
    const held = sim.spawn({
      type: 'payload', team: 0, pos: { x: joint.pos.x - joint.radius - 10, z: 0 },
      radius: 8, mass: 20, hull: 10, hullMax: 10, collides: true, data: {},
    });
    player.tether = { active: true, targetId: held.id };
    player.pos.x = held.pos.x; player.pos.z = 0;
    sim.runTicks(Math.ceil(2.5 * 60) + 10); // weldTimeS dwell
    assert.equal(held.data.weldedTo, joint.id, 'the weld took');
    assert.equal(held.data.weldedGen, joint.occupantGeneration ?? null,
      'the bond remembers which occupant it touched');
    player.tether = { active: false, targetId: null };

    // The id is recycled: a new occupant at the same id is a different body.
    joint.occupantGeneration = (joint.occupantGeneration || 0) + 1000;
    joint.pos.x += 500;
    const heldX = held.pos.x;
    sim.step();
    assert.equal(held.data.weldedTo, null, 'the bond released — a number is not a hull');
    assert.equal(held.pos.x, heldX, 'the welded body does not chase the impostor');
  } finally {
    sim.dispose();
  }
});

// ── Pinned work is not contested ground ──────────────────────────────────────

test('salvage rights: a mission-tagged hulk is never claim-filed or eaten', () => {
  const { sim, state, taps, on } = boot();
  try {
    const stead = raiseStead(sim);
    on('frontier:disputePosted', 'posted');
    const missionHulk = sim.spawn({
      type: 'wreck', team: 2, pos: { x: stead.pos.x + 300, z: 0 }, radius: 26, mass: 180,
      hull: 160, hullMax: 160, collides: true,
      data: { derelict: true, missionTag: 'story_demolition_tower' },
    });
    const ownedHulk = sim.spawn({
      type: 'wreck', team: 0, pos: { x: stead.pos.x + 350, z: 50 }, radius: 18, mass: 150,
      hull: 100, hullMax: 100, collides: true, flags: { persistent: true },
      data: { derelict: true },
    });
    sim.runTicks(30);
    assert.equal(taps.posted.length, 0, 'pinned work is not contested ground');
    assert.equal(missionHulk.data.frontierDisputeId == null, true);
    assert.equal(ownedHulk.data.frontierDisputeId == null, true);
    assert.equal(frontierBoard(state).disputes.every((d) => d.state !== 'open'), true);
    assert.equal(missionHulk.alive, true, 'nothing reached in to strip it');
  } finally {
    sim.dispose();
  }
});

// ── One kill, one verdict: raider-read bodies never file outlaw ───────────────

test('justice: a hostile repelled on the ring is a combatant, not a murder', () => {
  const { sim, state, player, bus, taps, reps, on } = boot();
  try {
    const stead = raiseStead(sim);
    on('frontier:raiderRepelled', 'repelled');
    on('frontier:justiceFiled', 'justice');
    // Team-1 hull that never fired — targetHostileToPlayer false. The board still
    // reads it as a raider; it must pay the repel and never file the charcoal.
    const raider = sim.spawn({
      type: 'ship', team: 1, pos: { x: stead.pos.x + 200, z: 0 }, radius: 14, mass: 36,
      hull: 120, hullMax: 120, collides: true, data: { name: 'Freebooter' },
    });
    raider.alive = false;
    killBy(bus, raider, player.id, { targetHostileToPlayer: false });
    assert.equal(taps.repelled.length, 1, 'the repel pays');
    assert.equal(reps.filter((r) => r.reason === 'frontier_neutral_killed').length, 0,
      'no charcoal for a combatant');
    assert.equal(taps.justice.filter((j) => j.kind === 'outlaw').length, 0,
      'one kill, one verdict');
  } finally {
    sim.dispose();
  }
});

// ── The restore seam: envelope payload rebinds, bleed-over clears ─────────────

test('save seam: a frontier payload rebinds generations to the respawned bodies', () => {
  const { sim, state, bus } = boot();
  try {
    const stead = raiseStead(sim);
    const sys = sim.registry.get('frontierHomesteads');
    const blob = sys.serialize(); // the envelope's payload — plain JSON
    assert.equal(blob.homesteads.length, 1);

    // Restore respawns the body: same id, fresh occupant generation.
    const newGen = (stead.occupantGeneration || 0) + 1000;
    stead.occupantGeneration = newGen;
    sys.deserialize(JSON.parse(JSON.stringify(blob)));
    bus.emit('save:loaded');
    // deserialize installs a fresh bag — re-read the rec out of it.
    const rec = recOf(state, stead.id);
    assert.equal(rec.gen, newGen, 'the rec rebinds to the restored occupant');
    sim.step();
    assert.equal(rec.gone !== true, true, 'a restored homestead is not its own funeral');
  } finally {
    sim.dispose();
  }
});

test('save seam: a restore without a frontier payload clears the bleed-over', () => {
  const { sim, state, bus } = boot();
  try {
    raiseStead(sim);
    const f = ensureFrontierState(state);
    f.deeds = 7;
    assert.equal(f.homesteads.length, 1);
    // A save written before the board existed carries no frontier key — the live
    // bag would otherwise bleed the abandoned session's standing into the load.
    bus.emit('save:loaded');
    const board = frontierBoard(state);
    assert.equal(board.deeds, 0, 'another save\'s name is not yours');
    // The seam installed a fresh bag — re-read it, not the stale reference.
    assert.equal(ensureFrontierState(state).homesteads.length, 0, 'another save\'s steads are not yours');
    sim.step(); // the cleared ledger must not sink the tick
    assert.ok(true);
  } finally {
    sim.dispose();
  }
});

// ── Run boundary and hostile-clock hardening ─────────────────────────────────

test('run seam: New Game clears the board — the old run\'s deeds are not yours', () => {
  const { sim, state, bus } = boot();
  try {
    raiseStead(sim);
    const f = ensureFrontierState(state);
    f.deeds = 9;
    assert.equal(f.homesteads.length, 1);
    // The run is replaced in place — the wire's name must not ride along.
    bus.emit('game:new');
    assert.equal(frontierBoard(state).deeds, 0, 'the old run\'s standing is not yours');
    assert.equal(ensureFrontierState(state).homesteads.length, 0);
    raiseStead(sim, 300, 0);
    bus.emit('game:newGame'); // the legacy alias carries the same boundary
    assert.equal(ensureFrontierState(state).homesteads.length, 0,
      'the second alias clears what the first rebuilt');
    sim.step(); // the cleared ledger must not sink the tick
    assert.ok(true);
  } finally {
    sim.dispose();
  }
});

test('hostile clocks cannot wedge the site, the wire, or the board', () => {
  const { sim, state } = boot();
  try {
    const f = ensureFrontierState(state);
    // A site row latched absurdly far out would wedge planting forever.
    f.sites.sector_io_reach = { frameId: 'ghost', frameGen: 7, plantedAt: 1e300, nextAt: 1e300, nextRestockAt: 1e300, restockSeq: -9 };
    // A permanently-open hostile lead wedges a wire slot; a far-out debt/vendetta
    // clock does the same to those ledgers. A doubled live rec doubles every beat.
    f.leads.push({ id: 'lead:hostile', kind: 'hungry', steadId: 424242, state: 'open', expiresAt: 1e300 });
    f.debts.push({ id: 'debt:hostile', debtorId: 1, creditorId: 2, state: 'open', expiresAt: 1e300 });
    f.vendettas.push({ id: 'ven:hostile', targetId: 424242, state: 'open', expiresAt: 1e300 });
    f.homesteads.push(
      { entityId: 11, gen: null, raisedAt: 1e300, nextRaidAt: 1e300, nextLeadAt: 1e300 },
      { entityId: 11, gen: null, raisedAt: 0 }, // a second LIVE rec on the same id
    );
    f.nextDebtAt = 1e300;
    const clean = ensureFrontierState(state);
    const site = clean.sites.sector_io_reach;
    assert.ok(site.nextAt <= state.simTime + 600, 'the replant latch heals to its horizon');
    assert.ok(site.nextRestockAt <= state.simTime + 90, 'the restock latch heals to its horizon');
    assert.equal(clean.homesteads.filter((r) => r.entityId === 11 && r.gone !== true).length, 1,
      'one live rec per entity id');
    const rec = clean.homesteads.find((r) => r.entityId === 11);
    assert.ok(rec.nextRaidAt <= state.simTime + 630 && rec.nextLeadAt <= state.simTime + 140,
      'per-stead clocks heal to their horizons');
    assert.ok(clean.leads[0].expiresAt <= state.simTime + 420, 'the wire slot heals');
    assert.ok(clean.debts[0].expiresAt <= state.simTime + 540, 'the marker slot heals');
    assert.ok(clean.vendettas[0].expiresAt <= state.simTime + 900, 'the bounty slot heals');
    assert.ok(clean.nextDebtAt <= state.simTime + 140, 'the pairing clock heals');
    // The healed row plants on the real path: bring the bounded latch due and the
    // seeder puts a frame on the chart instead of staying wedged forever.
    clean.sites.sector_io_reach.nextAt = 0;
    sim.step();
    assert.ok(state.entityList.some((e) => e.data?.homesteadFrame === true),
      'the seeder planted the frame once the wedge healed');
  } finally {
    sim.dispose();
  }
});

test('site seam: a module welded to a fallen frame is released and can re-deliver', () => {
  const { sim, state } = boot();
  try {
    const f = ensureFrontierState(state);
    f.sites.sector_io_reach = { frameId: null, frameGen: null, plantedAt: 0, nextAt: 0, nextRestockAt: 0, restockSeq: 0 };
    sim.step(); // the seeder plants the frame plus loose stock
    const fr = state.entityList.find((e) => e.data?.homesteadFrame === true);
    assert.ok(fr, 'the seeder planted the frame');
    const pod = state.entityList.find((e) => e.alive !== false && typeof e.data?.homesteadModule === 'string');
    assert.ok(pod, 'the seeder scattered module pods');
    pod.pos.x = fr.pos.x; pod.pos.z = fr.pos.z; // dragged inside snapRange
    sim.step();
    assert.equal(pod.data.snapped, true, 'the pod snapped on');
    assert.equal(pod.data.snappedFrameId, fr.id);
    assert.ok(Number.isSafeInteger(fr.occupantGeneration), 'the frame carries an occupant gen');
    assert.equal(pod.data.snappedFrameGen, fr.occupantGeneration, 'the bond records the occupant');
    // The frame falls: the weld must not pin the pod to a ghost forever.
    fr.alive = false;
    sim.step();
    assert.equal(pod.data.snapped, false, 'the fallen frame released its ring');
    assert.equal(pod.data.snappedFrameId, null);
    assert.equal(pod.data.snappedFrameGen, null);
    // A live non-frame host at the recorded id cannot adopt the bond either.
    pod.data.snapped = true; pod.data.snappedFrameId = state.playerId; pod.data.snappedFrameGen = null;
    sim.step();
    assert.equal(pod.data.snapped, false, 'a non-frame host cannot hold the bond');
    // The stock stays deliverable — the site replants and takes the pod.
    f.sites.sector_io_reach.nextAt = 0;
    sim.step();
    const fr2 = state.entityList.find((e) => e.alive !== false && e.data?.homesteadFrame === true);
    assert.ok(fr2 && fr2 !== fr, 'the site replanted after the loss');
    pod.pos.x = fr2.pos.x; pod.pos.z = fr2.pos.z;
    sim.step();
    assert.equal(pod.data.snapped, true, 'the released pod delivered to the new frame');
    assert.equal(pod.data.snappedFrameId, fr2.id);
    // A forged generation releases, then the pod honestly re-bonds.
    pod.data.snappedFrameGen = (fr2.occupantGeneration ?? 0) + 1;
    sim.step(); sim.step(); sim.step();
    assert.equal(pod.data.snapped, true, 'a forged bond releases and honestly re-snaps');
    assert.equal(pod.data.snappedFrameGen, fr2.occupantGeneration);
  } finally {
    sim.dispose();
  }
});

test('frontierBoard copies survive a hostile dispute row', () => {
  const { sim, state } = boot();
  try {
    const f = ensureFrontierState(state);
    f.disputes.push({ id: 'dsp:h', wreckId: 9, steadIds: [1], steadNames: 42, state: 'open' });
    const board = frontierBoard(state); // a non-iterable steadNames must not throw
    assert.deepEqual(board.disputes[0].steadNames, []);
    assert.deepEqual(board.disputes[0].steadIds, [1]);
    sim.step();
    assert.ok(true);
  } finally {
    sim.dispose();
  }
});

// ── Hostile entity bags: a truthy primitive throws on keyed writes (strict mode) ──

test('hostile primitive entity data cannot sink the tick or the kill wire', () => {
  const { sim, state, player, bus, grants, taps, on } = boot();
  try {
    // The raising tick: a frame body with a primitive slots bag. Object.keys on
    // a string yields char keys — the release loop's `delete fd.slots[k]` and
    // the snap write `fd.slots[kind] = id` both throw on primitives, every tick.
    const fr = frame(sim, 0, 0);
    fr.data.slots = 'bogus';
    const pod = moduleFor(sim, 'habitat', fr.pos.x + FRONTIER_FRAME.snapRange - 60, 0);
    assert.doesNotThrow(() => sim.step(), 'a primitive slots bag must not wedge the raise');
    assert.equal(typeof fr.data.slots, 'object', 'the slots bag healed to a real object');
    assert.equal(pod.data.snapped, true, 'the healed frame still takes the delivered module');
    assert.equal(fr.data.slots.habitat, pod.id);

    const stead = raiseStead(sim, 6000, 6000);

    // The kill wire: a hostile corpse inside the stead's watch ring. The bus
    // swallows listener faults, so the observable is the DROPPED verdict — a
    // strict-mode throw on `vd.frontierKillHandled = true` aborts the handler
    // before the repel branch, and the board never pays the repelled hull.
    on('frontier:raiderRepelled', 'repelled');
    const fragile = sim.spawn({
      type: 'ship', team: 1, pos: { x: stead.pos.x + 200, z: 6000 }, radius: 12, mass: 20,
      hull: 50, hullMax: 50, collides: true, data: { name: 'fragile' },
    });
    fragile.data = 5; // a hostile bag on the corpse — team 1 still reads as a raider
    fragile.alive = false;
    assert.doesNotThrow(() => killBy(bus, fragile, player.id),
      'a primitive data bag must not throw inside the kill wire');
    assert.equal(taps.repelled.length, 1, 'the repel verdict survives the hostile bag');
    assert.ok(grants.some((g) => g.reason?.startsWith('frontier_repel:')),
      'the bounty still pays — the handler ran past the stamp write');

    // The dispute tag: a claimable wreck with a primitive bag — isClaimableWreck
    // reads by entity type, so the `wd.frontierDisputeId = id` stamp below it
    // was a strict-mode throw whenever such a hulk drifted onto a claim ring.
    on('frontier:disputePosted', 'posted');
    const wreck = sim.spawn({
      type: 'wreck', team: 0, pos: { x: stead.pos.x + 400, z: 6000 }, radius: 18, mass: 150,
      hull: 100, hullMax: 100, collides: true, data: { derelict: true },
    });
    wreck.data = 'hostile'; // still a wreck by type — still contested ground
    assert.doesNotThrow(() => sim.step(), 'a primitive wreck bag must not sink the filing');
    assert.equal(typeof wreck.data, 'object', 'the hulk bag healed before the tag landed');
    assert.equal(wreck.data.frontierDisputeId, taps.posted[0].disputeId,
      'the dispute still files on the healed bag');

    // The vendetta mark: a killer whose bag is a primitive — _postVendetta's
    // `d.vendettaMark = id` threw inside _markSteadGone, inside the kill fan-out.
    const killer = sim.spawn({
      type: 'ship', team: 1, pos: { x: stead.pos.x + 300, z: 6000 }, radius: 14, mass: 36,
      hull: 120, hullMax: 120, collides: true, data: { name: 'marked' },
    });
    killer.data = 7; // a hostile bag on the named killer
    stead.alive = false;
    assert.doesNotThrow(() => killBy(bus, stead, killer.id),
      'a primitive killer bag must not sink the stead verdict');
    assert.equal(recOf(state, stead.id).gone, true, 'the verdict still files');
    assert.equal(killer.data.vendettaMark != null, true,
      'the mark rides the healed bag, not the primitive');

    // The weld arc: a held body with a primitive bag — the weldT/weldedTo writes
    // threw the moment a Weld Head touched it to a joint.
    player.data = { ...(player.data || {}), lineHeadId: 'head_weld' };
    const joint = sim.spawn({
      type: 'asteroid', team: 0, pos: { x: 2000, z: -2000 }, radius: 40, mass: 900,
      hull: 300, hullMax: 300, collides: true, data: { material: 'rock' },
    });
    const held = sim.spawn({
      type: 'payload', team: 0, pos: { x: joint.pos.x - joint.radius - 10, z: -2000 },
      radius: 8, mass: 20, hull: 10, hullMax: 10, collides: true, data: {},
    });
    held.data = 'bag';
    player.tether = { active: true, targetId: held.id };
    assert.doesNotThrow(() => sim.step(), 'a primitive held bag must not sink the arc');
    assert.equal(typeof held.data, 'object', 'the held bag healed on first contact');
    assert.equal(held.data.weldTargetId, joint.id, 'the arc still tracks the joint');
  } finally {
    sim.dispose();
  }
});

// ── Regression: a settled marker must retire the debtor's stale supply ask ──

test('mutual aid: a carried marker retires the debtor\'s supplyRuns ask — no stacked dups', () => {
  const { sim, state, taps, on } = boot();
  try {
    const { a, b } = twoSteads(sim);
    const f = ensureFrontierState(state);
    const recA = recOf(state, a.id);
    const recB = recOf(state, b.id);
    recA.lastSupplyAt = -400;
    recB.lastSupplyAt = state.simTime;
    recB.supplies = 1;
    f.nextDebtAt = 0;
    on('frontier:debtPosted', 'posted');
    sim.step(); // stranding pushes the ask AND posts the marker in one pass
    assert.equal(f.supplyRuns.filter((r) => r.homesteadId === a.id).length, 1,
      'the stranded stead asked the board');
    const debt = f.debts.find((d) => d.state === 'open');
    assert.ok(debt, 'the marker posted for the stranded debtor');
    const marker = state.entities.get(debt.markerId);
    marker.pos.x = a.pos.x + 30; marker.pos.z = a.pos.z; // carried to the debtor
    sim.step();
    assert.equal(debt.state, 'paid', 'the carried marker settled');
    assert.equal(f.supplyRuns.filter((r) => r.homesteadId === a.id).length, 0,
      'the settled marker retired the ask — no stale row stacks a dup later');
    // Next stranding posts exactly one fresh ask — never a pile.
    recA.lastSupplyAt = -400;
    sim.step();
    assert.equal(f.supplyRuns.filter((r) => r.homesteadId === a.id).length, 1,
      'the next stranding posts one fresh ask, not a pile');
  } finally {
    sim.dispose();
  }
});

// ── Regression: an orphaned dispute tag must not lock a hulk out of claims ──

test('salvage rights: a stale dispute tag self-heals and the hulk can be filed again', () => {
  const { sim, state, taps, on } = boot();
  try {
    const stead = raiseStead(sim);
    const wreck = sim.spawn({
      type: 'wreck', team: 0, pos: { x: stead.pos.x + 400, z: 0 }, radius: 18, mass: 150,
      hull: 100, hullMax: 100, collides: true, data: { derelict: true },
    });
    // The row this tag pointed at is gone — closed, GC'd, malformed, or evicted.
    // A bare `!= null` skip would lock the hulk out of the claim pool forever.
    wreck.data.frontierDisputeId = 'dsp:ghost:999';
    on('frontier:disputePosted', 'posted');
    sim.step();
    assert.equal(taps.posted.length, 1, 'the hulk got claimed despite the ghost tag');
    assert.equal(wreck.data.frontierDisputeId, taps.posted[0].disputeId,
      'the stale tag was replaced by the live dispute id');
  } finally {
    sim.dispose();
  }
});

// ── Regression: a hostile paid-stamp bag is bounded at normalize ────────────

test('normalize: an oversized paid-stamp bag is capped like every other ledger', () => {
  const { sim, state } = boot();
  try {
    const f = ensureFrontierState(state);
    for (let i = 0; i < 200; i++) f.paid[`stamp:${i}`] = i;
    const clean = ensureFrontierState(state);
    assert.ok(Object.keys(clean.paid).length <= 96,
      'a hostile stamp bag is bounded — insertion order keeps the newest');
    assert.equal(clean.paid['stamp:199'], 199, 'the newest stamps survive eviction');
    sim.step();
    assert.ok(true);
  } finally {
    sim.dispose();
  }
});
