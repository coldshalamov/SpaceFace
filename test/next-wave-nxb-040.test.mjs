// NXB-040 — a heist handover is committed by actual custody, with one honest chance
// to withdraw. The 357 THE HANDOFF join boundary: inspection speaks terms only,
// stepping out of the ring is the withdraw, holding station through the window is
// acceptance — a pod cut off the conveyor and restamped to the player's hull.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';

const SECTOR = 'sector_pallas_drift';
const ANCHOR = Object.freeze({ x: 9000, z: 9000 });

function makeHarness() {
  const sim = createSimulation({
    seed: 43,
    systems: [spawnBudget, encounterDirector],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  const player = sim.spawn({
    type: 'ship', team: 0,
    pos: { x: ANCHOR.x + 500, z: ANCHOR.z + 500 },
    vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 6,
  });
  state.playerId = player.id;
  state.player = state.player || { flags: {}, credits: 0, cargo: { items: {} } };
  const events = [];
  bus.on('encounter:resolved', (p) => events.push({ name: 'resolved', payload: p }));
  bus.on('comms:log', (p) => events.push({ name: 'comms', payload: p }));
  bus.on('faction:repDelta', (p) => events.push({ name: 'repDelta', payload: p }));
  bus.on('economy:grantCredits', (p) => events.push({ name: 'grant', payload: p }));
  return { sim, state, bus, player, events };
}

function fireHandoff(sim) {
  return sim.registry.get('encounterDirector').requestAuthoredEncounter({
    shapeId: 'off_book_handoff',
    encounterId: 'test_handoff_1',
    sectorId: SECTOR,
    anchor: { ...ANCHOR },
    zoneType: 'outlaw_zone',
    zoneRadius: 500,
    force: true,
  });
}

function liveOf(state) {
  return Object.values(state.encounterDirector.live).find((l) => l.shapeId === 'off_book_handoff');
}

function castOf(state, live, role) {
  return live.ids.map((id) => state.entities.get(id))
    .filter((e) => e && e.data?.ai?.encounterRole === role);
}

function podsOf(state, live) {
  const ids = new Set(live.data.pods || []);
  return (state.entityList || []).filter((e) => e && ids.has(e.id));
}

test('inspection: standing in the parley ring speaks terms but moves no freight and pays nothing', () => {
  const { sim, state, player, events } = makeHarness();
  fireHandoff(sim);
  const live = liveOf(state);
  const seller = castOf(state, live, 'hauler')[0];
  player.pos.x = seller.pos.x + 100;
  player.pos.z = seller.pos.z;
  sim.runTicks(60 * 3); // three seconds inside — the window is six
  assert.equal(live.data.termsSpoken, true, 'the seller states the exact terms on approach');
  assert.ok(live.data.parleySince != null, 'the inspection window is running');
  assert.equal(live.data.custodyCommit, null, 'no commitment from approach alone');
  assert.equal(live.outcome, null, 'the deal is still live');
  for (const pod of podsOf(state, live)) {
    assert.equal(pod.data.ownerId, seller.id, 'every pod is still the seller’s manifest');
  }
  assert.ok(!events.some((e) => e.name === 'grant'), 'inspection pays nothing');
  assert.ok(!events.some((e) => e.name === 'repDelta'), 'inspection buys no standing');
});

test('withdraw: stepping out of the ring before the window lapses the offer intact', () => {
  const { sim, state, player, events } = makeHarness();
  fireHandoff(sim);
  const live = liveOf(state);
  const seller = castOf(state, live, 'hauler')[0];
  player.pos.x = seller.pos.x + 100;
  player.pos.z = seller.pos.z;
  sim.runTicks(60 * 3);
  assert.equal(live.data.termsSpoken, true);
  // The physical escape: fly out of the ring before the window closes.
  player.pos.x = seller.pos.x + 2000;
  sim.runTicks(60 * 2);
  assert.equal(live.data.parleySince, null, 'the window resets on withdraw');
  assert.equal(live.data.withdrawNoted, true, 'the seller acknowledges the quiet exit');
  assert.equal(live.data.custodyCommit, null);
  for (const pod of podsOf(state, live)) {
    assert.equal(pod.data.ownerId, seller.id, 'the lot is untouched — a declined offer consumes nothing');
  }
  assert.ok(!events.some((e) => e.name === 'grant') && !events.some((e) => e.name === 'repDelta'),
    'no payout, no rep — we never met');
  assert.equal(live.outcome, null, 'the deal plays on without the player');
  // Witnessed conduct stays intact: the deal completes on its own track.
  const buyer = castOf(state, live, 'raider')[0];
  for (const pod of podsOf(state, live)) {
    pod.pos.x = buyer.pos.x + 8;
    pod.pos.z = buyer.pos.z;
  }
  sim.runTicks(90);
  assert.equal(live.outcome, 'deal_done', 'the scene finishes itself around a withdrawn player');
});

test('acceptance: holding station through the window commits by actual custody — once, finally', () => {
  const { sim, state, player, events } = makeHarness();
  fireHandoff(sim);
  const live = liveOf(state);
  const seller = castOf(state, live, 'hauler')[0];
  const buyer = castOf(state, live, 'raider')[0];
  player.pos.x = seller.pos.x + 100;
  player.pos.z = seller.pos.z;
  sim.runTicks(60 * 8);
  assert.equal(live.outcome, 'contact_made');

  const commit = live.data.custodyCommit;
  assert.ok(commit && commit.playerId === player.id, 'a recorded commitment names the player');
  assert.equal(commit.settled, true, 'the recorded commitment resolved exactly once');
  assert.ok(events.filter((e) => e.name === 'grant' && e.payload.reason === 'handoff:quiet_lay').length === 1,
    'exactly one payout');

  // The escrow pod: a real persistent body off the conveyor, stamped to the player,
  // physically shoved toward their hull at the conveyor’s own crawl.
  const escrow = state.entities.get(commit.podId);
  assert.ok(escrow && escrow.alive !== false, 'the bonded pod is a live body');
  assert.equal(escrow.data.ownerId, player.id, 'custody transferred — the manifest names the player');
  assert.equal(escrow.data.ownerName, 'BONDED — OFF-BOOK MANIFEST');
  assert.equal(escrow.data.bondedBy, live.id);
  assert.ok(!live.data.pods.includes(escrow.id), 'off the conveyor — not owed to the buyer');
  const tdx = player.pos.x - escrow.pos.x, tdz = player.pos.z - escrow.pos.z;
  const tl = Math.hypot(tdx, tdz) || 1;
  const toward = escrow.vel.x * (tdx / tl) + escrow.vel.z * (tdz / tl);
  assert.ok(toward > 0, 'the pod physically crawls toward the player’s hull');
  // The tail pod is the one cut — furthest from the buyer, least committed to its deal.
  const remaining = podsOf(state, live);
  assert.equal(remaining.length, 3);
  for (const pod of remaining) {
    const bd2 = (pod.pos.x - buyer.pos.x) ** 2 + (pod.pos.z - buyer.pos.z) ** 2;
    const ed2 = (escrow.pos.x - buyer.pos.x) ** 2 + (escrow.pos.z - buyer.pos.z) ** 2;
    assert.ok(ed2 >= bd2 - 1e-6, 'the escrow came off the seller’s tail of the line');
  }

  // Finality: later ticks cannot re-pay, and the stamp on the body does not roll back.
  sim.runTicks(60 * 5);
  assert.equal(events.filter((e) => e.name === 'grant').length, 1, 'no second settle');
  assert.equal(state.entities.get(commit.podId).data.ownerId, player.id,
    'the manifest stamp survives — a late cancel cannot reverse a physical sale');
});

test('withdraw then return: the honest verdict survives — backing out once does not forfeit the deal', () => {
  const { sim, state, player, events } = makeHarness();
  fireHandoff(sim);
  const live = liveOf(state);
  const seller = castOf(state, live, 'hauler')[0];
  player.pos.x = seller.pos.x + 100;
  player.pos.z = seller.pos.z;
  sim.runTicks(60 * 3);
  player.pos.x = seller.pos.x + 2000; // back away once
  sim.runTicks(60 * 2);
  assert.equal(live.data.parleySince, null, 'the window reset');
  player.pos.x = seller.pos.x + 100;  // return and hold
  sim.runTicks(60 * 8);
  assert.equal(live.outcome, 'contact_made', 'the deal can still be taken honestly');
  assert.equal(events.filter((e) => e.name === 'grant').length, 1);
  assert.equal(live.data.custodyCommit.playerId, player.id);
});

test('counterexample: robbery during inspection is still robbery — conduct witnessed', () => {
  const { sim, state, player, events } = makeHarness();
  fireHandoff(sim);
  const live = liveOf(state);
  const seller = castOf(state, live, 'hauler')[0];
  player.pos.x = seller.pos.x + 100;
  player.pos.z = seller.pos.z;
  sim.runTicks(60 * 3); // inspecting
  assert.equal(live.data.termsSpoken, true, 'terms were on the table');
  const pods = podsOf(state, live);
  pods[0].alive = false; // a pod vanishes mid-line — taken, not bought
  state.entityList.splice(state.entityList.indexOf(pods[0]), 1);
  sim.runTicks(90);
  assert.equal(live.outcome, 'take_taken', 'a taken pod during parley still burns the deal');
  assert.ok(events.some((e) => e.name === 'repDelta'
    && e.payload.factionId === 'faction_quiet' && e.payload.delta < 0), 'the Quiet ledger remembers');
  assert.equal(live.data.custodyCommit, null, 'robbery is not acceptance');
});
