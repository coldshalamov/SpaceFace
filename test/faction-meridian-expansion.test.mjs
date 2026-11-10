// faction-meridian-expansion — the exchange ledger added to src/systems/faction_meridian.js.
//
// Proves the book end to end on the real system and the real events:
//   · exchange desks: live MTS stations anchor contracts, claim returns, and convoys
//   · manifest contracts: posted on a beat, taken through the verb, sealed pods bound by
//     id + occupantGeneration + ownership tag, delivered for pay, bonded for double,
//     defaulted into breach fees and recovery filings
//   · recovery claims: loose priced freight files; return it or re-couple it for a fee;
//     lift it and the manifest value bills the pilot — or a warrant hunts the thief
//   · convoys: spine-tug trains muster and roll under the real coupler law; escorts sign
//     in the hail ring and collect a per-box purse; lane pirates pluck boxes with real
//     physics; a dead tug spills the whole train into filings
//   · loss warrants: NPC killers are marked by id + generation; closing the name pays
//     once and only once
//   · the account: delinquency warns, assessment charges, blacklist closes the desks,
//     and a repo writ fields cutters that levy on contact until the balance clears
//   · save-safe + once-only: JSON round-trips keep stamps; money never moves twice
//
// Run: node --test test/faction-meridian-expansion.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import {
  factionMeridian,
  ensureMeridianState,
  meridianBoard,
  meridianStanding,
  meridianTierFor,
  MERIDIAN_CONTRACTS,
  MERIDIAN_RECOVERY,
  MERIDIAN_CONVOY,
  MERIDIAN_WARRANTS,
  MERIDIAN_ACCOUNT,
  MERIDIAN_TIERS,
} from '../src/systems/faction_meridian.js';

const SEED = 90210;
const tick = (s) => Math.ceil(s * 60);
const FACTION = 'faction_mts';

function boot({ credits = 60000 } = {}) {
  const bus = createBus();
  const sim = createSimulation({ seed: SEED, bus, systems: [factionMeridian] });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_tethys_junction';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 90000, z: 90000 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  state.player.credits = credits;
  const events = { charges: [], grants: [], reps: [], logs: [] };
  bus.on('economy:chargeCredits', (p) => {
    if (!p) return;
    const a = Math.round(p.amount || 0);
    state.player.credits = Math.max(0, Math.round(state.player.credits - a));
    events.charges.push(p);
  });
  bus.on('economy:grantCredits', (p) => {
    if (!p) return;
    state.player.credits = Math.round(state.player.credits + Math.round(p.amount || 0));
    events.grants.push(p);
  });
  bus.on('faction:repDelta', (p) => events.reps.push(p));
  bus.on('comms:log', (p) => events.logs.push(p));
  // The desks post on jittered clocks; tests pin those clocks far out and drive the
  // postings explicitly where they want them.
  const quietWire = () => {
    const m = ensureMeridianState(state);
    m.nextContractAt = 1e12;
    m.nextConvoyAt = 1e12;
  };
  const tap = (names) => {
    const taps = {};
    for (const n of names) { taps[n] = []; bus.on(n, (p) => taps[n].push(p)); }
    return taps;
  };
  const exchange = (x, z, name = 'Tethys Exchange') => sim.spawn({
    type: 'station', team: 0, factionId: FACTION, pos: { x, z }, radius: 80,
    mass: 1e6, hull: 4000, hullMax: 4000, collides: true,
    data: { name, factionId: FACTION },
  });
  const npcShip = (x, z, data = {}) => sim.spawn({
    type: 'ship', team: 1, pos: { x, z }, vel: { x: 0, z: 0 },
    radius: 14, mass: 36, hull: 120, hullMax: 120, collides: true,
    data: { name: 'DRIFTER', ai: { pirate: true }, ...data },
  });
  return { sim, state, bus, player, events, quietWire, tap, exchange, npcShip };
}

// A real train under the coupler law: the tug carries spineIndex 0.
const spineAt = (sim, x, z, values = [3000, 2800]) => {
  const spineId = `spine:test:${x}:${z}`;
  const tug = sim.spawn({
    type: 'ship', team: 0, factionId: FACTION, pos: { x, z }, vel: { x: 0, z: 0 },
    radius: 20, mass: 240, hull: 260, hullMax: 260, collides: true,
    data: { spineId, spineIndex: 0, name: 'MTS SPINE TUG', factionId: FACTION },
  });
  const boxes = values.map((cargoValueCr, i) => sim.spawn({
    type: 'container', team: 0, factionId: FACTION,
    pos: { x: x - 40 * (i + 1), z }, vel: { x: 0, z: 0 },
    radius: 10, mass: 40, hull: 60, hullMax: 60, collides: true,
    data: { spineId, spineIndex: i + 1, cargoValueCr, name: 'MTS CONTAINER' },
  }));
  return { spineId, tug, boxes };
};

const killBy = (bus, victim, killerId, extra = {}) => {
  victim.alive = false; // the killer marks it dead, then the wire reports it
  bus.emit('entity:killed', {
    id: victim.id, killerId, type: victim.type,
    pos: { x: victim.pos.x, z: victim.pos.z },
    factionId: victim.factionId ?? null,
    targetHostileToPlayer: true,
    ...extra,
  });
};

const granted = (events, prefix) =>
  events.grants.filter((g) => String(g.reason || '').startsWith(prefix));
const charged = (events, prefix) =>
  events.charges.filter((c) => String(c.reason || '').startsWith(prefix));
const repTotal = (events, prefix) =>
  events.reps.filter((r) => String(r.reason || '').startsWith(prefix))
    .reduce((a, r) => a + r.delta, 0);
const mer = (state) => ensureMeridianState(state);
const sysOf = (sim) => sim.registry.get('faction_meridian');

// ── Exports, board, and the old law intact ────────────────────────────────────

test('exports: the old contract is intact and the ledger layer is additive', () => {
  assert.equal(factionMeridian.name, 'faction_meridian');
  assert.equal(typeof factionMeridian.init, 'function');
  assert.equal(typeof factionMeridian.update, 'function');
  assert.equal(typeof factionMeridian.takeContract, 'function');
  assert.equal(typeof factionMeridian.payAssessment, 'function');
  for (const f of [ensureMeridianState, meridianBoard, meridianStanding, meridianTierFor]) {
    assert.equal(typeof f, 'function');
  }
  assert.equal(meridianTierFor(0).id, 'spot');
  assert.equal(meridianTierFor(MERIDIAN_TIERS[4].deeds).id, 'ledger');
  for (const k of ['postPeriodS', 'windowS', 'basePayCr', 'bondFrac', 'deliverR']) {
    assert.ok(MERIDIAN_CONTRACTS[k] > 0, `MERIDIAN_CONTRACTS.${k}`);
  }
  assert.ok(MERIDIAN_RECOVERY.recoveryFrac > 0 && MERIDIAN_RECOVERY.recoveryFrac < 1);
  assert.ok(MERIDIAN_CONVOY.boxMin >= 1 && MERIDIAN_CONVOY.escortMinS > 0);
  assert.ok(MERIDIAN_WARRANTS.baseBountyCr > 0);
  assert.ok(MERIDIAN_ACCOUNT.blacklistAt > MERIDIAN_ACCOUNT.assessAt);
  assert.ok(MERIDIAN_ACCOUNT.assessAt > MERIDIAN_ACCOUNT.warnAt);
});

test('meridianBoard gives a HUD-safe copy of the whole ledger', () => {
  const { sim, state } = boot();
  try {
    const board = meridianBoard(state);
    assert.equal(board.standing.id, 'spot');
    assert.equal(board.deeds, 0);
    assert.equal(board.blacklisted, false);
    for (const k of ['contracts', 'claims', 'convoys', 'warrants', 'writs', 'ledger', 'accountLog']) {
      assert.ok(Array.isArray(board[k]), `board.${k}`);
    }
    board.contracts.push({ bogus: true });
    assert.equal(meridianBoard(state).contracts.length, 0, 'the snapshot is a copy, not the ledger');
  } finally {
    sim.dispose();
  }
});

test('regression: the coupler law still snaps trains, bleeds tickers, and re-couples', () => {
  const { sim, state, tap } = boot();
  try {
    const taps = tap(['meridian:couplerSnapped', 'meridian:tickerFloor', 'meridian:containerRecoupled']);
    const { spineId, boxes } = spineAt(sim, 4000, 4000);
    // Tear the tail box past the stretch limit — the real geometry snaps it.
    boxes[1].pos.x += 500;
    sim.runTicks(4);
    assert.equal(boxes[1].data.spineLoose, true, 'the tail went loose');
    assert.equal(taps['meridian:couplerSnapped'].length, 1);
    const m = mer(state);
    assert.ok(Array.isArray(m.snaps[spineId]) && m.snaps[spineId].length === 1);
    const before = boxes[1].data.cargoValueCr;
    sim.runTicks(tick(2));
    assert.ok(boxes[1].data.cargoValueCr < before, 'the ticker bleeds');
    // Drift it back to the tail — the joint closes behind it.
    boxes[1].pos.x = boxes[0].pos.x - 30;
    boxes[1].pos.z = boxes[0].pos.z;
    sim.runTicks(2);
    assert.equal(boxes[1].data.spineLoose, false, 'the box re-linked');
    assert.equal(boxes[1].data.spineId, spineId);
    assert.equal(taps['meridian:containerRecoupled'].length, 1);
  } finally {
    sim.dispose();
  }
});

// ── Manifest contracts ────────────────────────────────────────────────────────

test('a desk posts a manifest on the wire and taking it issues a bound consignment', () => {
  const { sim, state, events, tap, exchange } = boot();
  try {
    exchange(2000, 2000);
    const taps = tap(['meridian:contractPosted', 'meridian:contractTaken', 'meridian:refused']);
    sim.runTicks(tick(MERIDIAN_CONTRACTS.firstPostS + 1) + 20);
    const m = mer(state);
    const open = m.contracts.filter((c) => c.state === 'open');
    assert.ok(open.length >= 1, 'a manifest posted on the beat');
    const c = open[0];
    assert.ok(taps['meridian:contractPosted'].length >= 1);
    assert.ok(c.payCr > 0 && c.payCr <= MERIDIAN_CONTRACTS.payCapCr, 'pay inside the cap');
    assert.ok(c.dueAt > c.postedAt, 'a real window');
    assert.ok(typeof c.originName === 'string' && c.originName.length > 0);
    assert.ok(typeof c.destName === 'string' && c.destName.length > 0);

    const sys = sysOf(sim);
    assert.equal(sys.takeContract(state, 'con:nope'), null, 'unknown manifests refuse');
    const taken = sys.takeContract(state, c.id, { bond: true });
    assert.ok(taken === c && c.state === 'taken', 'the manifest is taken');
    assert.equal(c.bonded, true);
    assert.equal(charged(events, 'meridian_bond:').length, 1, 'the bond charges once');
    assert.equal(charged(events, 'meridian_bond:')[0].amount, c.bondCr);
    assert.equal(taps['meridian:contractTaken'].length, 1);
    const pod = state.entities.get(c.consignmentId);
    assert.ok(pod && pod.alive !== false, 'the consignment is a live body');
    assert.equal(pod.data.meridianConsignment, c.id, 'ownership tag');
    assert.equal(pod.data.sealedFreight, true);
    assert.equal(c.consignmentGen, pod.occupantGeneration, 'generation bound');
    assert.equal(sys.takeContract(state, c.id), null, 'taken manifests do not re-take');
    assert.ok(taps['meridian:refused'].length >= 1);
  } finally {
    sim.dispose();
  }
});

test('the wire declines blacklisted pilots and broke bondsmen', () => {
  const { sim, state, events, exchange } = boot();
  try {
    const desk = exchange(2000, 2000);
    const sys = sysOf(sim);
    const m = mer(state);
    const c = sys._postContract(state, m, [desk], state.simTime);
    assert.ok(c, 'the manifest posted');
    state.player.credits = 10;
    assert.equal(sys.takeContract(state, c.id, { bond: true }), null, 'no bond without the credits');
    assert.equal(c.state, 'open', 'still open after the refusal');
    m.blacklistedUntil = state.simTime + 999;
    assert.equal(sys.takeContract(state, c.id), null, 'blacklisted pilots are refused');
    m.blacklistedUntil = 0;
    state.player.credits = 60000;
    const taken = sys.takeContract(state, c.id);
    assert.ok(taken && taken.state === 'taken', 'a clean take after the blacklist clears');
    assert.equal(taken.bonded, false, 'no bond posted');
    assert.equal(charged(events, 'meridian_bond:').length, 0, 'no bond means no charge');
  } finally {
    sim.dispose();
  }
});

test('a delivered manifest pays once — bonded pays double and refunds the bond', () => {
  const { sim, state, events, player, tap, exchange } = boot();
  try {
    const desk = exchange(2000, 2000);
    const sys = sysOf(sim);
    const taps = tap(['meridian:contractDelivered', 'meridian:verdictFiled']);
    const m = mer(state);
    const c = sys._postContract(state, m, [desk], state.simTime);
    sys.takeContract(state, c.id, { bond: true });
    const pod = state.entities.get(c.consignmentId);
    pod.data.thrownBy = 'player'; // the pilot physically hauled it
    pod.pos.x = c.destPos.x; pod.pos.z = c.destPos.z;
    player.pos.x = c.destPos.x; player.pos.z = c.destPos.z;
    const expect = Math.round(c.payCr * meridianTierFor(0).payMult * MERIDIAN_CONTRACTS.bondMult);
    sim.runTicks(2);
    assert.equal(c.state, 'delivered');
    const grants = granted(events, 'meridian_contract:');
    assert.equal(grants.length, 1, 'the manifest pays exactly once');
    assert.equal(grants[0].amount, expect, 'bonded manifests pay double');
    assert.equal(granted(events, 'meridian_bond_refund:')[0].amount, c.bondCr, 'the bond returns');
    assert.equal(repTotal(events, 'meridian_contract_delivered'), MERIDIAN_CONTRACTS.repDelivered);
    assert.equal(taps['meridian:contractDelivered'].length, 1);
    assert.ok(taps['meridian:verdictFiled'].some((v) => v.kind === 'contract_delivered'));
    const podAfter = state.entities.get(pod.id);
    assert.ok(!podAfter || podAfter.alive === false, 'the desk takes receipt of the freight');
    assert.equal(m.deeds, 1, 'the deed files');
    sim.runTicks(4);
    assert.equal(granted(events, 'meridian_contract:').length, 1, 'no replay pays twice');
  } finally {
    sim.dispose();
  }
});

test('a missed window defaults: breach fee, delinquency, and the freight reverts to the syndicate', () => {
  const { sim, state, events, player, tap, exchange } = boot();
  try {
    const desk = exchange(2000, 2000);
    const sys = sysOf(sim);
    const taps = tap(['meridian:contractDefaulted', 'meridian:claimPosted']);
    const m = mer(state);
    const c = sys._postContract(state, m, [desk], state.simTime);
    sys.takeContract(state, c.id);
    const pod = state.entities.get(c.consignmentId);
    // Park the freight nowhere near the dock and let the window close.
    pod.pos.x = player.pos.x = 80000; pod.pos.z = player.pos.z = 80000;
    state.simTime = c.dueAt + 1;
    sim.runTicks(2);
    assert.equal(c.state, 'defaulted');
    assert.equal(c.cause, 'overdue');
    assert.equal(taps['meridian:contractDefaulted'].length, 1);
    assert.equal(repTotal(events, 'meridian_contract_defaulted'), MERIDIAN_CONTRACTS.repDefaulted);
    assert.ok(m.accountOwed >= MERIDIAN_CONTRACTS.defaultFeeCr, 'the breach fee files');
    assert.ok(m.accountLog.some((r) => r.kind === 'contract_default'), 'the chargeback files');
    assert.ok(m.delinquency > 0, 'the score moved');
    // The freight reverts: the seal stamp clears and a recovery filing posts on it.
    assert.equal(pod.data.meridianConsignment, null);
    assert.ok(pod.data.meridianClaimId != null, 'the lost freight carries a filing');
    assert.equal(taps['meridian:claimPosted'].length, 1);
    assert.equal(m.claims[0].state, 'open');
  } finally {
    sim.dispose();
  }
});

test('breaking the seal is the worst default — the manifest value files to the account', () => {
  const { sim, state, bus, events, player, tap, exchange } = boot();
  try {
    const desk = exchange(2000, 2000);
    const sys = sysOf(sim);
    const taps = tap(['meridian:contractDefaulted']);
    const m = mer(state);
    const c = sys._postContract(state, m, [desk], state.simTime);
    sys.takeContract(state, c.id);
    const pod = state.entities.get(c.consignmentId);
    pod.alive = false; // collected into the hold — the pod is consumed
    bus.emit('pickup:collected', { pickupId: pod.id, collectorId: player.id });
    assert.equal(c.state, 'defaulted');
    assert.equal(c.cause, 'seal_breach');
    assert.ok(m.accountOwed >= MERIDIAN_CONTRACTS.sealBreachCr, 'the manifest value bills');
    assert.ok(m.delinquency >= MERIDIAN_ACCOUNT.sealBreach, 'the chargeback lands');
    assert.equal(repTotal(events, 'meridian_seal_breach'), MERIDIAN_CONTRACTS.sealBreachRep);
    assert.equal(taps['meridian:contractDefaulted'][0].cause, 'seal_breach');
    assert.equal(m.claims.length, 0, 'freight in the hold does not file a recovery claim');
    assert.ok(m.ledger.some((l) => l.kind === 'seal_breach'), 'the verdict is on the ledger');
  } finally {
    sim.dispose();
  }
});

// ── Recovery claims ───────────────────────────────────────────────────────────

test('loose priced freight files a recovery claim when a coupler snaps', () => {
  const { sim, state, tap } = boot();
  try {
    const taps = tap(['meridian:claimPosted']);
    const { boxes } = spineAt(sim, 4000, 4000);
    boxes[1].pos.x += 500;
    sim.runTicks(6);
    const m = mer(state);
    assert.equal(boxes[1].data.spineLoose, true);
    assert.ok(boxes[1].data.meridianClaimId != null, 'the filing stamps the box');
    assert.equal(taps['meridian:claimPosted'].length, 1);
    const claim = m.claims.find((c) => c.state === 'open');
    assert.equal(claim.boxId, boxes[1].id);
    assert.equal(claim.gen, boxes[1].occupantGeneration, 'generation bound');
    assert.ok(claim.assessedCr > 0, 'the manifest value is filed');
    // Encounter-owned freight is the encounter's business, not a claim.
    boxes[0].data.encounterId = 'spine_break';
    boxes[0].pos.x += 500;
    sim.runTicks(4);
    assert.ok(boxes[0].data.meridianClaimId == null, 'authored spill freight is left alone');
  } finally {
    sim.dispose();
  }
});

test('freight hauled to a desk settles its claim and the fee pays once', () => {
  const { sim, state, events, player, tap, exchange } = boot();
  try {
    const desk = exchange(5000, 5000);
    const taps = tap(['meridian:claimSettled']);
    const { boxes } = spineAt(sim, 3000, 3000);
    boxes[0].pos.x += 500;
    sim.runTicks(6);
    const m = mer(state);
    const claim = m.claims.find((c) => c.boxId === boxes[0].id);
    assert.ok(claim && claim.state === 'open');
    // The pilot physically hauls the box into the desk's return ring.
    boxes[0].data.thrownBy = player.id;
    boxes[0].pos.x = desk.pos.x; boxes[0].pos.z = desk.pos.z;
    sim.runTicks(2);
    assert.equal(claim.state, 'returned');
    assert.equal(claim.how, 'delivered');
    const g = granted(events, 'meridian_claim:');
    assert.equal(g.length, 1, 'the fee pays once');
    assert.equal(g[0].amount, taps['meridian:claimSettled'][0].feeCr, 'grant matches the filing');
    assert.equal(claim.feeCr, taps['meridian:claimSettled'][0].feeCr);
    assert.ok(claim.feeCr >= MERIDIAN_RECOVERY.minFeeCr, 'never under the floor');
    assert.ok(claim.feeCr <= Math.round(claim.assessedCr * MERIDIAN_RECOVERY.recoveryFrac
      * meridianTierFor(0).payMult) || claim.feeCr === MERIDIAN_RECOVERY.minFeeCr,
      'the fee is the ticker fraction (the box keeps bleeding until receipt)');
    assert.equal(repTotal(events, 'meridian_claim_returned'), MERIDIAN_RECOVERY.repReturned);
    const box = state.entities.get(boxes[0].id);
    assert.ok(!box || box.alive === false, 'the desk takes receipt of the freight');
    assert.equal(m.deeds, 1);
    sim.runTicks(4);
    assert.equal(granted(events, 'meridian_claim:').length, 1, 'no replay pays twice');
  } finally {
    sim.dispose();
  }
});

test('freight re-coupled to a surviving train settles as recovered', () => {
  const { sim, state, events, tap } = boot();
  try {
    const taps = tap(['meridian:claimSettled']);
    const { tug, boxes } = spineAt(sim, 3000, 3000);
    boxes[1].pos.x += 500;
    sim.runTicks(6);
    const m = mer(state);
    const claim = m.claims.find((c) => c.boxId === boxes[1].id);
    assert.ok(claim && claim.state === 'open');
    // Drift it back onto the tail — the joint closes, the filing counts it recovered.
    boxes[1].pos.x = boxes[0].pos.x - 30;
    boxes[1].pos.z = boxes[0].pos.z;
    sim.runTicks(3);
    assert.equal(boxes[1].data.spineLoose, false, 'the box re-linked');
    assert.equal(claim.state, 'returned');
    assert.equal(claim.how, 'recoupled');
    const g = granted(events, 'meridian_claim:');
    assert.equal(g.length, 1, 're-coupled freight pays the recovery fee once');
    assert.equal(taps['meridian:claimSettled'][0].how, 'recoupled');
    assert.ok(boxes[1].alive !== false, 'the freight rides the train again');
    void tug;
  } finally {
    sim.dispose();
  }
});

test('lifting filed freight bills the pilot; a scavenger lifting it draws a warrant', () => {
  const { sim, state, bus, events, player, tap, npcShip } = boot();
  try {
    const taps = tap(['meridian:claimStolen', 'meridian:warrantPosted']);
    const { boxes } = spineAt(sim, 3000, 3000);
    boxes[0].pos.x += 500;
    boxes[1].pos.x += 500;
    sim.runTicks(6);
    const m = mer(state);
    const claimA = m.claims.find((c) => c.boxId === boxes[0].id);
    const claimB = m.claims.find((c) => c.boxId === boxes[1].id);
    assert.ok(claimA && claimB, 'both spilled boxes filed');

    // The pilot pockets one.
    boxes[0].alive = false;
    bus.emit('pickup:collected', { pickupId: boxes[0].id, collectorId: player.id });
    assert.equal(claimA.state, 'stolen');
    assert.ok(m.accountOwed >= claimA.assessedCr, 'the manifest value bills the account');
    assert.ok(m.delinquency >= MERIDIAN_ACCOUNT.freightTheft, 'the chargeback lands');
    assert.equal(repTotal(events, 'meridian_claim_stolen'), MERIDIAN_RECOVERY.repStolen);
    assert.equal(taps['meridian:claimStolen'][0].byPlayer, true);

    // A scavenger lifts the other — the syndicate prices the lifter's hull.
    const thief = npcShip(6000, 6000);
    boxes[1].alive = false;
    bus.emit('pickup:collected', { pickupId: boxes[1].id, collectorId: thief.id });
    assert.equal(claimB.state, 'stolen');
    assert.equal(taps['meridian:warrantPosted'].length, 1, 'the warrant posts');
    assert.ok(thief.data.meridianWarrant != null, 'the hull is marked');
    const w = m.warrants.find((x) => x.state === 'open');
    assert.equal(w.targetId, thief.id);
    assert.equal(w.cause, 'freight_theft');
    assert.ok(w.bountyCr > 0);
  } finally {
    sim.dispose();
  }
});

test('a claim lapses on the filing clock and the freight is written off, not re-filed', () => {
  const { sim, state, tap } = boot();
  try {
    const taps = tap(['meridian:claimLapsed', 'meridian:claimPosted']);
    const { tug, boxes } = spineAt(sim, 3000, 3000);
    boxes[1].pos.x += 500; // tear the tail box loose — only it spills
    sim.runTicks(6);
    const m = mer(state);
    const claim = m.claims.find((c) => c.boxId === boxes[1].id);
    assert.ok(claim && claim.state === 'open');
    state.simTime = claim.expiresAt + 1;
    sim.runTicks(4);
    assert.equal(claim.state, 'lapsed');
    assert.equal(boxes[1].data.meridianClaimId, null, 'the tag clears with the filing');
    assert.equal(taps['meridian:claimLapsed'].length, 1);
    assert.equal(boxes[1].data.meridianClaimedOut, true, 'the syndicate writes it off');
    assert.equal(taps['meridian:claimPosted'].length, 1, 'a lapse does not instantly re-file');
    // Re-coupling to a train clears the write-off — a future spill files fresh.
    boxes[1].pos.x = boxes[0].pos.x - 30; boxes[1].pos.z = boxes[0].pos.z;
    sim.runTicks(3);
    assert.equal(boxes[1].data.spineLoose, false, 'back on the train');
    assert.ok(boxes[1].data.meridianClaimedOut == null, 'the write-off cleared on the dock');
    boxes[1].pos.x += 500; // tear it loose again
    sim.runTicks(4);
    assert.equal(taps['meridian:claimPosted'].length, 2, 'a fresh spill files a fresh claim');
    void tug;
  } finally {
    sim.dispose();
  }
});

// ── Convoys ───────────────────────────────────────────────────────────────────

test('a convoy musters at a desk as a real spine train under the coupler law', () => {
  const { sim, state, tap, exchange } = boot();
  try {
    exchange(2000, 2000, 'Tethys Trade Hub');
    const taps = tap(['meridian:convoyDeparted', 'meridian:escortAsked']);
    sim.runTicks(tick(MERIDIAN_CONVOY.firstMusterS + 1) + 20);
    const m = mer(state);
    const cv = m.convoys.find((c) => c.state === 'rolling');
    assert.ok(cv, 'the convoy mustered');
    assert.equal(taps['meridian:convoyDeparted'].length, 1);
    assert.equal(taps['meridian:escortAsked'].length, 1);
    const tug = state.entities.get(cv.tugId);
    assert.ok(tug && tug.alive !== false, 'a real tug drives the train');
    assert.equal(tug.data.meridianConvoy, cv.id, 'ownership tag');
    assert.equal(tug.data.meridianTug, true);
    assert.equal(tug.data.spineIndex, 0);
    assert.ok(cv.members.length >= MERIDIAN_CONVOY.boxMin, 'the train has boxes');
    for (const row of cv.members) {
      const box = state.entities.get(row.id);
      assert.ok(box && box.alive !== false);
      assert.equal(box.data.meridianConvoy, cv.id);
      assert.equal(box.data.spineId, `train:${cv.id}`, 'one train under the coupler law');
      assert.ok(box.data.cargoValueCr >= MERIDIAN_CONVOY.valueMinCr, 'priced freight');
      assert.equal(row.gen, box.occupantGeneration, 'generation bound');
    }
  } finally {
    sim.dispose();
  }
});

test('a signed escort collects the per-box purse when the train docks', () => {
  const { sim, state, events, player, tap, exchange } = boot({ credits: 500 });
  try {
    const desk = exchange(2000, 2000, 'Tethys Trade Hub');
    const dest = exchange(9000, 2000, 'Pallas Exchange');
    const sys = sysOf(sim);
    const taps = tap(['meridian:escortSigned', 'meridian:convoyArrived']);
    const m = mer(state);
    const cv = sys._spawnConvoy(state, m, [desk, dest], state.simTime);
    assert.ok(cv, 'the convoy mustered');
    const tug = state.entities.get(cv.tugId);
    // Fly the hail ring long enough to sign.
    player.pos.x = tug.pos.x + 100; player.pos.z = tug.pos.z;
    sim.runTicks(tick(MERIDIAN_CONVOY.escortMinS) + 8);
    assert.equal(cv.signed, true, 'the escort signed');
    assert.equal(taps['meridian:escortSigned'].length, 1);
    assert.ok(cv.escortS >= MERIDIAN_CONVOY.escortMinS);
    // Dock the whole train — tug and every linked box arrive together.
    tug.pos.x = cv.destPos.x; tug.pos.z = cv.destPos.z;
    for (const row of cv.members) {
      const box = state.entities.get(row.id);
      box.pos.x = cv.destPos.x - 40; box.pos.z = cv.destPos.z;
    }
    player.pos.x = cv.destPos.x; player.pos.z = cv.destPos.z;
    const boxes = cv.members.length;
    const expect = Math.round((MERIDIAN_CONVOY.escortBaseCr + boxes * MERIDIAN_CONVOY.escortPerBoxCr)
      * meridianTierFor(0).payMult);
    sim.runTicks(2);
    assert.equal(cv.state, 'arrived');
    const g = granted(events, 'meridian_escort:');
    assert.equal(g.length, 1, 'the purse pays once');
    assert.equal(g[0].amount, expect, 'per surviving box at the posted rate');
    assert.equal(repTotal(events, 'meridian_escort_paid'), MERIDIAN_CONVOY.repArrived);
    assert.equal(taps['meridian:convoyArrived'][0].boxes, boxes);
    assert.equal(taps['meridian:convoyArrived'][0].purseCr, expect);
    assert.equal(m.deeds, 1, 'the escort deed files');
    const tugAfter = state.entities.get(cv.tugId);
    assert.ok(!tugAfter || tugAfter.alive === false, 'the docked train leaves the field');
    sim.runTicks(4);
    assert.equal(granted(events, 'meridian_escort:').length, 1, 'no replay pays twice');
  } finally {
    sim.dispose();
  }
});

test('unescorted arrivals close the manifest without a purse', () => {
  const { sim, state, events, player, tap, exchange } = boot();
  try {
    const desk = exchange(2000, 2000);
    const dest = exchange(9000, 2000, 'Pallas Exchange');
    const sys = sysOf(sim);
    const taps = tap(['meridian:convoyArrived']);
    const m = mer(state);
    const cv = sys._spawnConvoy(state, m, [desk, dest], state.simTime);
    const tug = state.entities.get(cv.tugId);
    // Nobody rides — dock it anyway.
    tug.pos.x = cv.destPos.x; tug.pos.z = cv.destPos.z;
    player.pos.x = 50000; player.pos.z = 50000;
    sim.runTicks(2);
    assert.equal(cv.state, 'arrived');
    assert.equal(taps['meridian:convoyArrived'][0].purseCr, 0, 'no escort, no purse');
    assert.equal(granted(events, 'meridian_escort:').length, 0);
    assert.equal(m.deeds, 0);
  } finally {
    sim.dispose();
  }
});

test('lane pirates spawn bound to the convoy and pluck boxes with real physics', () => {
  const { sim, state, bus, events, player, tap, exchange } = boot();
  try {
    const desk = exchange(2000, 2000);
    const dest = exchange(9000, 2000);
    const sys = sysOf(sim);
    const taps = tap(['meridian:convoyRaided', 'meridian:raiderPlucked', 'meridian:raiderRepelled']);
    const m = mer(state);
    const cv = sys._spawnConvoy(state, m, [desk, dest], state.simTime);
    cv.raidAt = state.simTime + 0.01; // call the raid at the next tick (0 is the "no raid" sentinel)
    sim.runTicks(2);
    assert.ok(cv.raiders.length >= 1, 'the lane drew pirates');
    assert.equal(taps['meridian:convoyRaided'].length, 1);
    const raider = state.entities.get(cv.raiders[0].id);
    assert.equal(raider.data.meridianRaider, cv.id, 'bound to the convoy');
    assert.equal(cv.raiders[0].gen, raider.occupantGeneration, 'generation bound');
    // The pirate closes on a box and shoves it off the coupler.
    const box = state.entities.get(cv.members[0].id);
    raider.pos.x = box.pos.x + 20; raider.pos.z = box.pos.z;
    sim.runTicks(2);
    assert.equal(taps['meridian:raiderPlucked'].length, 1, 'the pluck fires');
    assert.equal(raider.data.done, true, 'one pluck and it slips off');
    // Repel it — the bounty pays once and only once.
    killBy(bus, raider, player.id);
    const g = granted(events, 'meridian_repel:');
    assert.equal(g.length, 1, 'the repel bounty lands once');
    assert.equal(repTotal(events, 'meridian_raider_repelled'), MERIDIAN_CONVOY.repelRep);
    assert.equal(taps['meridian:raiderRepelled'].length, 1);
    killBy(bus, raider, player.id); // a corpse cannot die twice — no replay
    assert.equal(granted(events, 'meridian_repel:').length, 1);
  } finally {
    sim.dispose();
  }
});

test('a dead tug spills the whole train and every box files a recovery claim', () => {
  const { sim, state, bus, tap, exchange, npcShip } = boot();
  try {
    const desk = exchange(2000, 2000);
    const dest = exchange(9000, 2000);
    const sys = sysOf(sim);
    const taps = tap(['meridian:convoyLost', 'meridian:claimPosted']);
    const m = mer(state);
    const cv = sys._spawnConvoy(state, m, [desk, dest], state.simTime);
    const tug = state.entities.get(cv.tugId);
    const pirate = npcShip(5000, 5000);
    killBy(bus, tug, pirate.id); // an NPC guns the tug down
    assert.equal(cv.state, 'lost', 'the convoy files the loss');
    assert.equal(taps['meridian:convoyLost'].length, 1);
    // Next ticks: no lead means no spine — the coupler law spills every box, and the
    // ledger files a recovery claim on each priced container.
    sim.runTicks(6);
    for (const row of cv.members) {
      const box = state.entities.get(row.id);
      assert.equal(box.data.spineLoose, true, 'the box is off the train');
      assert.ok(box.data.meridianClaimId != null, 'the box carries a filing');
    }
    assert.ok(taps['meridian:claimPosted'].length >= cv.members.length, 'every box files');
  } finally {
    sim.dispose();
  }
});

// ── Loss warrants ─────────────────────────────────────────────────────────────

test('an NPC that downs a syndicate hull is marked, and closing the name pays once', () => {
  const { sim, state, bus, events, player, tap, npcShip } = boot();
  try {
    const taps = tap(['meridian:warrantPosted', 'meridian:warrantPaid']);
    const hull = sim.spawn({
      type: 'ship', team: 0, factionId: FACTION, pos: { x: 4000, z: 4000 },
      radius: 14, mass: 36, hull: 120, hullMax: 120, collides: true,
      data: { name: 'MTS HAULER' },
    });
    const killer = npcShip(4100, 4100);
    killBy(bus, hull, killer.id, { targetHostileToPlayer: false });
    const m = mer(state);
    const w = m.warrants.find((x) => x.state === 'open');
    assert.ok(w, 'the warrant posted');
    assert.equal(w.targetId, killer.id);
    assert.equal(w.gen, killer.occupantGeneration, 'generation bound');
    assert.equal(killer.data.meridianWarrant, w.id, 'the hull carries the mark');
    assert.equal(taps['meridian:warrantPosted'][0].cause, 'hull_lost');
    // The pilot closes the name.
    killBy(bus, killer, player.id);
    assert.equal(w.state, 'paid');
    const g = granted(events, 'meridian_warrant:');
    assert.equal(g.length, 1, 'the bounty pays once');
    assert.equal(g[0].amount, Math.round(w.bountyCr * meridianTierFor(0).payMult));
    assert.equal(repTotal(events, 'meridian_warrant_paid'), MERIDIAN_WARRANTS.repPaid);
    assert.equal(taps['meridian:warrantPaid'][0].byPlayer, true);
    assert.equal(m.deeds, 1);
    // Replay the kill wire — the latch already fired.
    killBy(bus, killer, player.id);
    assert.equal(granted(events, 'meridian_warrant:').length, 1, 'no double payout');
    assert.equal(killer.data.meridianWarrant, null, 'the mark is spent');
  } finally {
    sim.dispose();
  }
});

test('a recycled entity id never satisfies an old warrant', () => {
  const { sim, state, bus, player, tap, npcShip } = boot();
  try {
    const taps = tap(['meridian:warrantLapsed']);
    const killer = npcShip(4100, 4100);
    const m = mer(state);
    const sys = sysOf(sim);
    const w = sys._postWarrant(state, killer, 'hull_lost', 'test', state.simTime);
    assert.ok(w, 'the warrant posted');
    // The hull id comes back as a different occupant — the generation guard sees it.
    killer.occupantGeneration = (killer.occupantGeneration || 0) + 500;
    sim.runTicks(2);
    assert.equal(w.state, 'lapsed', 'the filing lapses on the recycled id');
    assert.equal(taps['meridian:warrantLapsed'].length, 1);
    // And killing the lookalike never collects.
    killBy(bus, killer, player.id);
    assert.equal(w.state, 'lapsed');
  } finally {
    sim.dispose();
  }
});

test('a destroyed system hears nothing; re-init re-subscribes the wire', () => {
  const { sim, state, bus, npcShip } = boot();
  try {
    const sys = sysOf(sim);
    const m = mer(state);
    const mtsHull = (x, z) => sim.spawn({
      type: 'ship', team: 0, factionId: FACTION, pos: { x, z },
      radius: 14, mass: 36, hull: 120, hullMax: 120, collides: true,
      data: { name: 'MTS HAULER' },
    });
    const killer = npcShip(4100, 4100);
    sys.destroy();
    killBy(bus, mtsHull(4000, 4000), killer.id);
    assert.equal(m.warrants.length, 0, 'a destroyed system files nothing');
    sys.init({ state, bus, helpers: sys.helpers });
    killBy(bus, mtsHull(4200, 4200), killer.id);
    assert.equal(m.warrants.length, 1, 're-init re-subscribed the wire');
    assert.equal(m.warrants[0].targetId, killer.id);
  } finally {
    sim.dispose();
  }
});

test('the pilot who downs a syndicate hull files a chargeback, not a firefight', () => {
  const { sim, state, bus, events, player } = boot();
  try {
    const m = mer(state);
    const hauler = sim.spawn({
      type: 'ship', team: 0, factionId: FACTION, pos: { x: 4000, z: 4000 },
      radius: 14, mass: 36, hull: 120, hullMax: 120, collides: true,
      data: { name: 'MTS HAULER' },
    });
    killBy(bus, hauler, player.id, { targetHostileToPlayer: false });
    assert.ok(m.delinquency >= MERIDIAN_ACCOUNT.hullKilled, 'the chargeback lands');
    assert.equal(repTotal(events, 'meridian_hull_killed'), MERIDIAN_ACCOUNT.hullKilledRep);
    assert.ok(m.ledger.some((l) => l.kind === 'hull_killed'), 'the verdict is on the ledger');
    // A hostile hull gets no corporate mercy — self-defense files nothing.
    const before = m.delinquency;
    const muscle = sim.spawn({
      type: 'ship', team: 1, factionId: FACTION, pos: { x: 4000, z: 4000 },
      radius: 14, mass: 36, hull: 120, hullMax: 120, collides: true,
      data: { name: 'MTS MUSCLE', ai: { hostile: true } },
    });
    killBy(bus, muscle, player.id, { targetHostileToPlayer: true });
    assert.equal(m.delinquency, before, 'self-defense files no chargeback');
  } finally {
    sim.dispose();
  }
});

test('burning unclaimed syndicate freight files freight_destroyed — and never double-files', () => {
  const { sim, state, bus, events, player, tap, npcShip, exchange } = boot();
  try {
    const desk = exchange(2000, 2000);
    const dest = exchange(9000, 2000);
    const sys = sysOf(sim);
    const taps = tap(['meridian:warrantPosted']);
    const m = mer(state);
    const cv = sys._spawnConvoy(state, m, [desk, dest], state.simTime);
    const box = state.entities.get(cv.members[0].id);
    const before = m.delinquency;
    killBy(bus, box, player.id, { targetHostileToPlayer: false });
    assert.equal(m.delinquency, before + MERIDIAN_ACCOUNT.freightDestroyed, 'the chargeback lands');
    assert.equal(repTotal(events, 'meridian_freight_destroyed'), MERIDIAN_ACCOUNT.freightDestroyedRep);
    assert.ok(m.ledger.some((l) => l.kind === 'freight_destroyed'), 'the verdict files');
    // An NPC burning the next box draws a warrant instead of a player chargeback.
    const box2 = state.entities.get(cv.members[1].id);
    const npc = npcShip(box2.pos.x + 60, box2.pos.z);
    killBy(bus, box2, npc.id);
    const w = m.warrants.find((x) => x.targetId === npc.id);
    assert.ok(w && w.cause === 'freight_destroyed', 'the NPC name files');
    assert.equal(m.delinquency, before + MERIDIAN_ACCOUNT.freightDestroyed, 'the pilot owes nothing extra');
    assert.ok(taps['meridian:warrantPosted'].some((x) => x.cause === 'freight_destroyed'));
  } finally {
    sim.dispose();
  }
});

// ── The account ───────────────────────────────────────────────────────────────

test('delinquency warns, then levies a credit assessment, then blacklists the desks', () => {
  const { sim, state, events, tap, exchange } = boot({ credits: 60000 });
  try {
    const desk = exchange(2000, 2000);
    const sys = sysOf(sim);
    const taps = tap(['meridian:accountWarned', 'meridian:assessmentCharged', 'meridian:blacklisted']);
    const m = mer(state);
    const A = MERIDIAN_ACCOUNT;
    // (a) the warning — the score sits a breath above the line so decay cannot dip under
    m.delinquency = A.warnAt + 5;
    sim.runTicks(2);
    assert.equal(taps['meridian:accountWarned'].length, 1, 'warned once');
    assert.equal(m.delinqStage, 1);
    sim.runTicks(4);
    assert.equal(taps['meridian:accountWarned'].length, 1, 'no repeated warnings');
    // (b) the assessment
    m.delinquency = A.assessAt + 5;
    sim.runTicks(2);
    assert.equal(m.delinqStage, 2);
    const charges = charged(events, 'meridian_assessment');
    assert.equal(charges.length, 1, 'the assessment charges once');
    assert.equal(charges[0].amount, A.assessmentCr);
    assert.equal(repTotal(events, 'meridian_assessed'), A.assessmentRep);
    sim.runTicks(4);
    assert.equal(charged(events, 'meridian_assessment').length, 1, 'not re-levied');
    // (c) the blacklist closes the desks
    m.delinquency = A.blacklistAt + 5;
    sim.runTicks(2);
    assert.equal(m.delinqStage, 3);
    assert.ok(m.blacklistedUntil > state.simTime, 'the blacklist holds');
    assert.equal(repTotal(events, 'meridian_blacklisted'), A.blacklistRep);
    const c = sys._postContract(state, m, [desk], state.simTime);
    assert.equal(sys.takeContract(state, c.id), null, 'blacklisted pilots get no manifests');
    // (d) a ledger still over the line keeps the ban — the timer is a cooling window,
    //     not a pardon. (simTime teleports do not run the per-tick decay.)
    state.simTime = m.blacklistedUntil + 1;
    sim.runTicks(2);
    assert.ok(m.blacklistedUntil > state.simTime, 'a hot ledger renews the blacklist');
    assert.equal(taps['meridian:blacklisted'].length, 2, 'the renewal files again');
    // (e) the page turns once the score cooled under the line
    m.delinquency = A.blacklistAt - 30;
    state.simTime = m.blacklistedUntil + 1;
    sim.runTicks(2);
    assert.equal(m.blacklistedUntil, 0, 'the blacklist lifts once the ledger cools');
    // (f) the account re-arms after cooling — a fresh climb re-files every stage
    m.delinquency = 10;
    sim.runTicks(2);
    assert.equal(m.delinqStage, 0, 'the stage resets when the account cools');
    m.delinquency = A.warnAt + 1;
    sim.runTicks(2);
    assert.equal(taps['meridian:accountWarned'].length, 2, 'the wire warns again');
    m.delinquency = A.blacklistAt + 2;
    sim.runTicks(2);
    assert.ok(m.blacklistedUntil > state.simTime, 'a second ascent re-files the ban');
  } finally {
    sim.dispose();
  }
});

test('a repo writ fields cutters that levy on contact until the balance clears', () => {
  const { sim, state, events, player, tap } = boot({ credits: 5000 });
  try {
    const taps = tap([
      'meridian:writPosted', 'meridian:repoFielded', 'meridian:levyCollected', 'meridian:writSettled',
    ]);
    const m = mer(state);
    const A = MERIDIAN_ACCOUNT;
    m.accountOwed = 400;
    m.delinquency = A.warnAt + 5;
    sim.runTicks(2);
    const writ = m.writs.find((w) => w.state === 'open');
    assert.ok(writ, 'the writ posts');
    assert.equal(taps['meridian:writPosted'].length, 1);
    assert.ok(writ.crew.length >= 1, 'a cutter fields');
    const cutter = state.entities.get(writ.crew[0].entityId);
    assert.ok(cutter && cutter.alive !== false);
    assert.equal(cutter.data.meridianRepo, writ.id, 'bound to the writ');
    assert.equal(writ.crew[0].gen, cutter.occupantGeneration, 'generation bound');
    // It closes and collects — each beat drains the account.
    cutter.pos.x = player.pos.x + 10; cutter.pos.z = player.pos.z;
    const before = state.player.credits;
    sim.runTicks(tick(A.levyBeatS) + 30);
    assert.ok(taps['meridian:levyCollected'].length >= 1, 'the levy lands');
    assert.ok(charged(events, 'meridian_levy:').length >= 1);
    assert.ok(state.player.credits < before, 'credits actually left the hold');
    assert.ok(m.accountOwed <= 0, 'the balance clears');
    assert.equal(writ.state, 'settled', 'the writ closes');
    assert.equal(taps['meridian:writSettled'].length, 1);
    assert.equal(repTotal(events, 'meridian_account_settled'), A.settleRep);
    const cutterAfter = state.entities.get(cutter.id);
    assert.ok(!cutterAfter || cutterAfter.alive === false, 'the crew stands down');
    const chargeCount = charged(events, 'meridian_levy:').length;
    sim.runTicks(tick(A.levyBeatS) + 10);
    assert.equal(charged(events, 'meridian_levy:').length, chargeCount, 'settled writs do not levy');
  } finally {
    sim.dispose();
  }
});

test('the crew stands down off-sector and re-fields when the pilot returns', () => {
  const { sim, state, tap } = boot({ credits: 5000 });
  try {
    const taps = tap(['meridian:repoFielded']);
    const m = mer(state);
    m.accountOwed = 800;
    m.delinquency = MERIDIAN_ACCOUNT.warnAt + 5;
    sim.runTicks(2);
    const writ = m.writs.find((w) => w.state === 'open');
    assert.ok(writ && writ.crew.length >= 1, 'the crew fields in-sector');
    // Jump sectors — the crew cannot follow; the balance waits.
    state.world.currentSectorId = 'sector_pallas_drift';
    sim.runTicks(3);
    assert.equal(writ.crew.length, 0, 'the crew stood down');
    assert.ok(m.accountOwed > 0, 'the balance survives');
    // Back in the writ's sector, the crew re-fields on the beat.
    state.world.currentSectorId = 'sector_tethys_junction';
    sim.runTicks(tick(MERIDIAN_ACCOUNT.crewBeatS) + 10);
    assert.ok(writ.crew.length >= 1, 'the crew re-fields');
    assert.ok(taps['meridian:repoFielded'].length >= 2, 'the wire logs each fielding');
  } finally {
    sim.dispose();
  }
});

test('paying the account down settles the writ; killing a cutter only files more paper', () => {
  const { sim, state, bus, events, player, tap } = boot({ credits: 5000 });
  try {
    const taps = tap(['meridian:accountPaid', 'meridian:writSettled']);
    const sys = sysOf(sim);
    const m = mer(state);
    m.accountOwed = 500;
    m.delinquency = MERIDIAN_ACCOUNT.warnAt + 5;
    sim.runTicks(2);
    const writ = m.writs.find((w) => w.state === 'open');
    assert.ok(writ, 'the writ posts');
    // A partial payment counts — the ledger keeps the rest.
    state.player.credits = 200;
    const paid = sys.payAssessment(state);
    assert.equal(paid, 200, 'partial payments count');
    assert.equal(m.accountOwed, 300, 'the ledger keeps the rest');
    assert.equal(charged(events, 'meridian_account_settle').length, 1);
    // Kill the collector — the account only files the name.
    if (writ.crew.length) {
      const cutter = state.entities.get(writ.crew[0].entityId);
      const before = m.delinquency;
      killBy(bus, cutter, player.id);
      assert.ok(m.delinquency > before, 'killing the collector files more paper');
      assert.ok(m.ledger.some((l) => l.kind === 'repo_killed'));
    }
    // Settle the balance — the crew stands down.
    state.player.credits = 5000;
    const paid2 = sys.payAssessment(state);
    assert.equal(paid2, 300);
    assert.equal(m.accountOwed, 0);
    assert.equal(writ.state, 'settled');
    assert.equal(taps['meridian:writSettled'].length, 1);
    assert.equal(repTotal(events, 'meridian_account_settled'), MERIDIAN_ACCOUNT.settleRep);
  } finally {
    sim.dispose();
  }
});

// ── Standing, determinism, and the envelope ───────────────────────────────────

test('deeds climb the tier ladder and scale what the desks pay', () => {
  const { sim, state, events, player, exchange } = boot();
  try {
    const desk = exchange(2000, 2000);
    const sys = sysOf(sim);
    const m = mer(state);
    m.deeds = MERIDIAN_TIERS[1].deeds;
    m.tier = 1;
    assert.equal(meridianStanding(state).id, 'bonded');
    const c = sys._postContract(state, m, [desk], state.simTime);
    sys.takeContract(state, c.id);
    const pod = state.entities.get(c.consignmentId);
    pod.pos.x = c.destPos.x; pod.pos.z = c.destPos.z;
    player.pos.x = c.destPos.x; player.pos.z = c.destPos.z;
    sim.runTicks(2);
    const g = granted(events, 'meridian_contract:');
    assert.equal(g[0].amount, Math.round(c.payCr * MERIDIAN_TIERS[1].payMult),
      'the bonded rate prices the manifest');
  } finally {
    sim.dispose();
  }
});

test('save-safe: a JSON round-trip keeps the ledger; once-only latches hold', () => {
  const { sim, state, bus, events, player, exchange, npcShip } = boot();
  try {
    const desk = exchange(2000, 2000);
    const sys = sysOf(sim);
    const m = mer(state);
    // Mid-contract and a live warrant — serialize the ledger.
    const c = sys._postContract(state, m, [desk], state.simTime);
    sys.takeContract(state, c.id, { bond: true });
    const killer = npcShip(6000, 6000);
    const w = sys._postWarrant(state, killer, 'hull_lost', 'test', state.simTime);
    state.meridian = JSON.parse(JSON.stringify(state.meridian));
    const m2 = ensureMeridianState(state);
    const c2 = m2.contracts.find((x) => x.id === c.id);
    const w2 = m2.warrants.find((x) => x.id === w.id);
    assert.ok(c2 && c2.state === 'taken', 'the contract survives the envelope');
    assert.ok(w2 && w2.state === 'open', 'the warrant survives the envelope');
    // Deliver after the load — pays once, against the same latch.
    const pod = state.entities.get(c2.consignmentId);
    pod.pos.x = c2.destPos.x; pod.pos.z = c2.destPos.z;
    player.pos.x = c2.destPos.x; player.pos.z = c2.destPos.z;
    sim.runTicks(2);
    assert.equal(c2.state, 'delivered');
    assert.equal(granted(events, 'meridian_contract:').length, 1);
    killBy(bus, killer, player.id);
    assert.equal(w2.state, 'paid');
    // Serialize again and replay the kill wire — the latch held in the envelope.
    state.meridian = JSON.parse(JSON.stringify(state.meridian));
    killBy(bus, killer, player.id);
    assert.equal(granted(events, 'meridian_warrant:').length, 1, 'no double payout across the load');
    assert.ok(JSON.stringify(state.meridian), 'the ledger stays plain JSON');
  } finally {
    sim.dispose();
  }
});

test('malformed state normalizes: junk drops, caps hold, nothing crashes', () => {
  const { sim, state } = boot();
  try {
    state.meridian = 'junk';
    let m = ensureMeridianState(state);
    assert.equal(m.delinquency, 0);
    assert.deepEqual(m.contracts, []);
    m.contracts = [{ no: 'id' },
      { id: 'con:1', originPos: { x: 0, z: 0 }, destPos: { x: 1, z: 1 }, state: 'open' }, 'x'];
    m.claims = 'junk';
    m.delinquency = 9999;
    m.accountOwed = -50;
    m.paid = { a: true };
    m = ensureMeridianState(state);
    assert.equal(m.contracts.length, 1, 'malformed rows drop');
    assert.deepEqual(m.claims, []);
    assert.equal(m.delinquency, MERIDIAN_ACCOUNT.max, 'clamped');
    assert.equal(m.accountOwed, 0);
    assert.equal(m.paid.a, true, 'latches survive');
    assert.doesNotThrow(() => JSON.stringify(state.meridian), 'plain JSON');
    sim.runTicks(3); // the whole tick tolerates the normalized state
  } finally {
    sim.dispose();
  }
});

test('the wire is deterministic: same seed, same filings', () => {
  const run = () => {
    const bus = createBus();
    const sim = createSimulation({ seed: SEED, bus, systems: [factionMeridian] });
    const { state } = sim;
    state.mode = 'flight';
    state.world.currentSectorId = 'sector_tethys_junction';
    const player = sim.spawn({
      type: 'ship', team: 0, pos: { x: 90000, z: 90000 }, radius: 12, mass: 24,
      hull: 100, hullMax: 100, collides: true,
    });
    state.playerId = player.id;
    sim.spawn({
      type: 'station', team: 0, factionId: FACTION, pos: { x: 2000, z: 2000 }, radius: 80,
      mass: 1e6, hull: 4000, hullMax: 4000, collides: true,
      data: { name: 'Tethys Trade Hub', factionId: FACTION },
    });
    sim.runTicks(tick(MERIDIAN_CONVOY.firstMusterS + MERIDIAN_CONTRACTS.firstPostS + 30));
    const m = ensureMeridianState(state);
    return {
      contracts: m.contracts.map((c) => [c.id, c.kind, c.destName, c.payCr]),
      convoys: m.convoys.map((c) => [c.id, c.members.length, c.destName]),
      ledger: m.ledger.map((l) => [l.id, l.kind]),
    };
  };
  const a = run();
  const b = run();
  assert.deepEqual(a, b, 'identical seeds file identical ledgers');
  assert.ok(a.contracts.length >= 1, 'the wire actually posted');
  assert.ok(a.convoys.length >= 1, 'the lane actually mustered');
});

// ── Second-look regressions ─────────────────────────────────────────────────
// Adversarial seams the first pass missed: gates are not desks, a recycled id
// carries no authority, the kill wire is not idempotent by accident, and a
// hostile save cannot park the wire's clocks past the end of time.

test('a gate is not an exchange desk — manifests and convoys keep to real stations', () => {
  const { sim, state, exchange } = boot();
  try {
    const desk = exchange(2000, 2000);
    const sys = sysOf(sim);
    // The world spawns gates as factioned type 'station' bodies (world.js) — in an
    // MTS-faction sector every gate inherited the desk predicate.
    sim.spawn({
      type: 'station', team: 0, factionId: FACTION, pos: { x: 5000, z: 2000 }, radius: 34,
      mass: 1e6, hull: 1e6, hullMax: 1e6, collides: true,
      data: {
        stationId: null, isGate: true, gateTo: 'sector_helios_prime',
        name: 'Gate → Helios Prime',
      },
    });
    const desks = sys._desks(state, state.entityList);
    assert.equal(desks.length, 1, 'a gate throat is never a desk');
    assert.equal(desks[0].id, desk.id);
    // An authored exchange flag still opts a body in — the stamp beats the shape.
    const flagged = sim.spawn({
      type: 'station', team: 0, factionId: FACTION, pos: { x: 8000, z: 2000 }, radius: 34,
      mass: 1e6, hull: 1e6, hullMax: 1e6, collides: true,
      data: { meridianExchange: true, isGate: true, name: 'Flagged' },
    });
    assert.ok(sys._desks(state, state.entityList).some((e) => e.id === flagged.id));
  } finally {
    sim.dispose();
  }
});

test('a recycled entity id cannot breach a manifest or lift a filing', () => {
  const { sim, state, bus, player, tap, exchange } = boot();
  try {
    const desk = exchange(2000, 2000);
    const sys = sysOf(sim);
    const m = mer(state);

    // Manifest side: the pod is consumed and its id recycles into an unrelated
    // pickup BEFORE the contract's own tick can close it on the real loss.
    const c = sys._postContract(state, m, [desk], state.simTime);
    sys.takeContract(state, c.id);
    const pod = state.entities.get(c.consignmentId);
    const podId = pod.id, podGen = pod.occupantGeneration;
    sim.helpers.removeEntity(podId, { immediate: true });
    const impostor = sim.spawn({
      type: 'pickup', team: 0, pos: { x: 1, z: 1 }, radius: 4, mass: 1, collides: true,
      data: { kind: 'ore', commodityId: 'cmdty_ore', amount: 2 },
    });
    assert.equal(impostor.id, podId, 'the fixture recycles the slot');
    assert.notEqual(impostor.occupantGeneration, podGen, 'new occupant, new generation');
    const owed0 = m.accountOwed;
    bus.emit('pickup:collected', {
      pickupId: podId, collectorId: player.id, kind: 'ore', amount: 2,
    });
    assert.equal(c.state, 'taken', 'a recycled id never breaches the seal');
    assert.equal(m.accountOwed, owed0, 'nothing files on the impostor');
    sim.runTicks(2);
    assert.equal(c.state, 'defaulted');
    assert.equal(c.cause, 'lost', 'the manifest defaults on the real loss, not the impostor');

    // Claim side: a filed box's id recycles the same way. (The account now carries
    // the manifest's real default fee — the assertion is that it gains nothing more.)
    const owedAfterDefault = m.accountOwed;
    const box = sim.spawn({
      type: 'container', team: 0, factionId: FACTION, pos: { x: 3000, z: 3000 },
      radius: 10, mass: 40, hull: 60, hullMax: 60, collides: true,
      data: { cargoValueCr: 2000 },
    });
    const cl = sys._postClaim(state, m, box, state.simTime);
    assert.ok(cl && cl.state === 'open');
    const boxId = box.id;
    sim.helpers.removeEntity(boxId, { immediate: true });
    const impostor2 = sim.spawn({
      type: 'pickup', team: 0, pos: { x: 5, z: 5 }, radius: 4, mass: 1, collides: true,
      data: { kind: 'ore', commodityId: 'cmdty_ore', amount: 1 },
    });
    assert.equal(impostor2.id, boxId);
    const taps = tap(['meridian:claimStolen']);
    bus.emit('pickup:collected', {
      pickupId: boxId, collectorId: player.id, kind: 'ore', amount: 1,
    });
    assert.equal(cl.state, 'open', 'a recycled id never lifts the filing');
    assert.equal(m.accountOwed, owedAfterDefault, 'no bill on the impostor');
    assert.equal(taps['meridian:claimStolen'].length, 0);
    sim.runTicks(2);
    assert.equal(cl.state, 'lost', 'the real loss still closes the filing');
  } finally {
    sim.dispose();
  }
});

test('a refused scoop files nothing — the receipt, not the touch, is the take', () => {
  const { sim, state, bus, player, tap } = boot();
  try {
    const sys = sysOf(sim);
    const m = mer(state);
    const { boxes } = spineAt(sim, 3000, 3000);
    boxes[0].pos.x += 500;
    sim.runTicks(6);
    const cl = m.claims.find((c) => c.boxId === boxes[0].id);
    assert.ok(cl && cl.state === 'open');
    const owed0 = m.accountOwed;
    const taps = tap(['meridian:claimStolen']);
    // The hold was full — the wire reports the touch and the receipt takes nothing.
    bus.emit('pickup:collected', {
      pickupId: boxes[0].id, collectorId: player.id,
      amount: 4, acceptedAmount: 0, rejectedAmount: 4,
    });
    assert.equal(cl.state, 'open', 'a refused scoop never files');
    assert.equal(m.accountOwed, owed0);
    assert.equal(taps['meridian:claimStolen'].length, 0);
    // An accepted take still files — the receipt is the authority.
    boxes[0].alive = false;
    bus.emit('pickup:collected', {
      pickupId: boxes[0].id, collectorId: player.id,
      amount: 4, acceptedAmount: 4, rejectedAmount: 0,
    });
    assert.equal(cl.state, 'stolen', 'an accepted scoop files');
    assert.ok(m.accountOwed >= cl.assessedCr);
  } finally {
    sim.dispose();
  }
});

test('the kill wire cannot file the same corpse twice', () => {
  const { sim, state, bus, events, player } = boot();
  try {
    const m = mer(state);
    // Priced freight with no filing yet — a plain corpse the ledger bills once.
    const box = sim.spawn({
      type: 'container', team: 0, factionId: FACTION, pos: { x: 3000, z: 3000 },
      radius: 10, mass: 40, hull: 60, hullMax: 60, collides: true,
      data: { cargoValueCr: 2000 },
    });
    killBy(bus, box, player.id, { targetHostileToPlayer: false });
    killBy(bus, box, player.id, { targetHostileToPlayer: false }); // the wire repeats
    assert.equal(m.accountLog.filter((r) => r.kind === 'freight_destroyed').length, 1,
      'one corpse files one chargeback');
    assert.equal(repTotal(events, 'meridian_freight_destroyed'),
      MERIDIAN_ACCOUNT.freightDestroyedRep);

    const hull = sim.spawn({
      type: 'ship', team: 0, factionId: FACTION, pos: { x: 4000, z: 4000 },
      radius: 14, mass: 36, hull: 120, hullMax: 120, collides: true,
      data: { name: 'MTS HAULER' },
    });
    killBy(bus, hull, player.id, { targetHostileToPlayer: false });
    killBy(bus, hull, player.id, { targetHostileToPlayer: false });
    assert.equal(m.accountLog.filter((r) => r.kind === 'hull_killed').length, 1,
      'a syndicate hull files once');
    assert.equal(repTotal(events, 'meridian_hull_killed'), MERIDIAN_ACCOUNT.hullKilledRep);
  } finally {
    sim.dispose();
  }
});

test('a stale kill report never files on a live recycled occupant', () => {
  const { sim, state, bus, events, player, npcShip } = boot();
  try {
    const sys = sysOf(sim);
    const m = mer(state);
    // A marked corpse frees its id; the slot comes back as a different hull.
    const first = npcShip(4000, 4000);
    const firstId = first.id, firstGen = first.occupantGeneration;
    sim.helpers.removeEntity(firstId, { immediate: true });
    const second = npcShip(4100, 4100);
    assert.equal(second.id, firstId, 'the fixture recycles the slot');
    assert.notEqual(second.occupantGeneration, firstGen);
    const w = sys._postWarrant(state, second, 'hull_lost', 'the live name', state.simTime);
    assert.ok(w && w.state === 'open');
    // A replayed kill wire for the dead occupant names the same slot — the live
    // occupant there is not the corpse the report described.
    bus.emit('entity:killed', { id: firstId, killerId: player.id, type: 'ship' });
    assert.equal(w.state, 'open', 'a live occupant never answers a stale report');
    assert.equal(granted(events, 'meridian_warrant:').length, 0, 'no bounty on a report');
    // The real kill still files.
    killBy(bus, second, player.id);
    assert.equal(w.state, 'paid');
    assert.equal(granted(events, 'meridian_warrant:').length, 1);
  } finally {
    sim.dispose();
  }
});

test('hostile save timestamps clamp to one window — the wire cannot be parked dead', () => {
  const { sim, state } = boot();
  try {
    const nowS = state.simTime;
    state.meridian = {
      nextContractAt: 1e12,
      nextConvoyAt: 1e12,
      blacklistedUntil: 1e12,
      contracts: [{ id: 'con:x', state: 'open', dueAt: 1e12,
        originPos: { x: 0, z: 0 }, destPos: { x: 1, z: 1 } }],
      claims: [{ id: 'rc:x', state: 'open', boxId: 999, expiresAt: 1e12, assessedCr: NaN }],
      convoys: [{ id: 'cnv:x', state: 'rolling', destPos: { x: 5, z: 5 },
        arriveByAt: 1e12, raidAt: 1e12, members: [], raiders: [], departedAt: 0 }],
      warrants: [{ id: 'wr:x', state: 'open', targetId: 42, expiresAt: 1e12, bountyCr: NaN }],
      writs: [{ id: 'writ:x', state: 'open', crew: [], spawned: 99, balance: -5 }],
    };
    const m = ensureMeridianState(state);
    assert.ok(m.nextContractAt <= nowS
      + MERIDIAN_CONTRACTS.postPeriodS + MERIDIAN_CONTRACTS.postJitterS,
      'the posting clock is bound to one window');
    assert.ok(m.nextConvoyAt <= nowS
      + MERIDIAN_CONVOY.musterPeriodS + MERIDIAN_CONVOY.musterJitterS);
    assert.ok(m.blacklistedUntil <= nowS + MERIDIAN_ACCOUNT.blacklistS,
      'a parked ban cannot hold the desk shut forever');
    assert.ok(m.contracts[0].dueAt <= nowS + MERIDIAN_CONTRACTS.windowS);
    assert.ok(m.claims[0].expiresAt <= nowS + MERIDIAN_RECOVERY.windowS);
    assert.equal(m.claims[0].assessedCr, 0, 'a corrupt assessment heals to zero, not NaN');
    assert.ok(m.convoys[0].arriveByAt <= nowS + 1e4,
      'the overdue clock is bound to the leg still ahead');
    assert.ok(m.convoys[0].raidAt <= nowS + MERIDIAN_CONVOY.raidDelayS);
    assert.ok(m.warrants[0].expiresAt <= nowS + MERIDIAN_WARRANTS.windowS);
    assert.ok(m.warrants[0].bountyCr >= 1, 'a corrupt bounty heals to a real figure');
    assert.ok(m.writs[0].spawned <= MERIDIAN_ACCOUNT.cutterSpawnCap);
    assert.ok(m.writs[0].balance >= 0);
    assert.doesNotThrow(() => sim.runTicks(3), 'the wire still breathes');
  } finally {
    sim.dispose();
  }
});
