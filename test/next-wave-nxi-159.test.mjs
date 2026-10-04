// NXI-159 — show the exact moment the commitment becomes irreversible. The handoff
// deal is presented as cancelable ONLY inside the inspection window ("drift off and
// we never met"). The moment the tail pod is restamped to the player and the payout
// resolves, the deal speaks its finality once ("there's no handing it back") and the
// withdraw gesture is dead: the same transaction is never again presented as
// cancelable — no re-armed window, no late withdraw line, no rollback of the stamp.
// Owner surface: 357-the-handoff custodyCommit (NXB-040), reached through the
// encounter director — no dramatic cutscene, no world pause anywhere on the path.
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
  bus.on('comms:log', (p) => events.push({ name: 'comms', payload: p }));
  bus.on('faction:repDelta', (p) => events.push({ name: 'repDelta', payload: p }));
  bus.on('economy:grantCredits', (p) => events.push({ name: 'grant', payload: p }));
  return { sim, state, bus, player, events };
}

function fireHandoff(sim) {
  return sim.registry.get('encounterDirector').requestAuthoredEncounter({
    shapeId: 'off_book_handoff',
    encounterId: 'test_nxi159_handoff',
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

const commsTexts = (events) => events.filter((e) => e.name === 'comms').map((e) => e.payload.text || '');
const grants = (events) => events.filter((e) => e.name === 'grant');

test('settle: the finality line is spoken once, then the withdraw gesture is dead', () => {
  const { sim, state, player, events } = makeHarness();
  fireHandoff(sim);
  const live = liveOf(state);
  const seller = castOf(state, live, 'hauler')[0];
  player.pos.x = seller.pos.x + 100;
  player.pos.z = seller.pos.z;
  sim.runTicks(60 * 8); // hold station through the six-second inspection window
  assert.equal(live.outcome, 'contact_made');

  const commit = live.data.custodyCommit;
  assert.ok(commit && commit.settled === true, 'the recorded commitment resolved once');
  assert.equal(grants(events).length, 1, 'the payment settled exactly once');

  // The exact moment is spoken: the cancelable offer ("drift off and we never met")
  // precedes the settle, and the finality line lands at the custody stamp itself.
  const texts = commsTexts(events);
  const offerIdx = texts.findIndex((t) => t.includes('drift off and we never met'));
  const finalIdx = texts.findIndex((t) => t.includes('no handing it back'));
  assert.ok(offerIdx >= 0, 'the cancelable offer is honest — spoken while nothing has settled');
  assert.ok(finalIdx > offerIdx,
    'finality is spoken at the settle instant, after the offer — the irreversibility moment shown');
  assert.equal(texts.filter((t) => t.includes('no handing it back')).length, 1,
    'the finality line speaks exactly once');

  // After goods + payment have settled, the same withdraw gesture that was an honest
  // cancel a tick earlier is no longer a cancel: no window re-arms, no withdraw line
  // re-speaks, the stamp on the persistent body does not roll back.
  const windowMark = live.data.parleySince; // the stale open-tick stamp — acceptance leaves it
  const commsBefore = texts.length;
  player.pos.x = seller.pos.x + 4000; // the identical physical gesture that withdrew before
  sim.runTicks(60 * 3);
  const afterTexts = commsTexts(events).slice(commsBefore);
  assert.ok(!afterTexts.some((t) => t.includes('never met') || t.includes('Drifting already')),
    'the settled deal is never presented as cancelable again — no late withdraw line');
  assert.equal(live.data.withdrawNoted, false, 'the withdraw state never re-arms post-settle');
  assert.equal(live.data.parleyOffered, true, 'the accepted offer stays latched — no re-offer');
  assert.equal(live.data.parleySince, windowMark, 'the window stamp is frozen, never re-written');
  assert.equal(commit.settled, true, 'the commitment stays resolved');
  assert.equal(grants(events).length, 1, 'no second settle, no clawback');
  const escrow = state.entities.get(commit.podId);
  assert.ok(escrow && escrow.alive !== false, 'the bonded pod is still a live body');
  assert.equal(escrow.data.ownerId, player.id, 'custody stays with the player');
  assert.equal(escrow.data.ownerName, 'BONDED — OFF-BOOK MANIFEST', 'the stamp survives');
  assert.equal(escrow.data.committedTo, player.id, 'the commitment is recorded on the body');
});

test('before settle the same offer is honestly cancelable — withdraw speaks once, acceptance still works', () => {
  const { sim, state, player, events } = makeHarness();
  fireHandoff(sim);
  const live = liveOf(state);
  const seller = castOf(state, live, 'hauler')[0];
  player.pos.x = seller.pos.x + 100;
  player.pos.z = seller.pos.z;
  sim.runTicks(60 * 3); // inspecting — the window is open, the offer is cancelable
  assert.equal(live.data.termsSpoken, true);
  assert.equal(live.data.custodyCommit, null, 'nothing has settled yet');

  // The honest withdraw: stepping out before the window closes speaks the cancel once.
  player.pos.x = seller.pos.x + 2000;
  sim.runTicks(60 * 2);
  assert.equal(live.data.withdrawNoted, true, 'the pre-settle cancel is acknowledged');
  assert.equal(live.data.parleySince, null);
  assert.equal(
    commsTexts(events).filter((t) => t.includes('Drifting already')).length, 1,
    'the cancel line speaks exactly once — while the deal is still unsettled');
  assert.equal(grants(events).length, 0, 'a withdrawn offer pays nothing');
  assert.equal(live.outcome, null, 'the deal plays on — a declined offer consumed nothing');

  // Neighboring success: returning and holding still takes the deal honestly — and
  // from that settle on, the withdraw vocabulary is closed for good.
  player.pos.x = seller.pos.x + 100;
  sim.runTicks(60 * 8);
  assert.equal(live.outcome, 'contact_made', 'the deal can still be taken after one honest exit');
  assert.equal(grants(events).length, 1);
  const commsBefore = commsTexts(events).length;
  player.pos.x = seller.pos.x + 2000;
  sim.runTicks(60 * 3);
  assert.equal(commsTexts(events).slice(commsBefore)
    .filter((t) => t.includes('we never met') || t.includes('Drifting already')).length, 0,
  'the settled deal never re-speaks the cancel');
  assert.equal(
    commsTexts(events).filter((t) => t.includes('Drifting already')).length, 1,
    'the whole run heard the cancel once — only while it was still a cancel');
});
