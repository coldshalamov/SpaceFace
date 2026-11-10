// The desk verbs that existed in sim with no player surface (Lane 3 audit items 12, 13):
//   · the impound lot attendant's berth verbs + the kin's ransom answer, reached through the
//     one `impoundLot:deskIntent` the Shipworks lot desk emits;
//   · the Helix docket's settle / contest / manifest / remit, reached through the service-ring
//     offer (`helix:serviceOffer`) the law-desk prompt adapter turns into a prompt-deck card
//     whose choices emit `helix:docketChoice`.
// Every answer goes through the canonical owner; credits move only on economy intents.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createSimulation } from '../src/core/sim.js';
import { hash32 } from '../src/core/rng.js';
import { mintImpoundShadow } from '../src/systems/impoundGrudge.js';
import * as lot from '../src/systems/impoundLot.js';
import { lossLedger as lossPrototype } from '../src/systems/lossLedger.js';
import { buildSlotList, ships as shipsPrototype } from '../src/systems/ships.js';
import { SHIPS } from '../src/data/ships.js';
import {
  factionHelix, ensureHelixState, HELIX_DESKS, HELIX_FINES, HELIX_NOTICES, HELIX_WARRANT,
} from '../src/systems/faction_helix.js';
import { impoundPayPrompt } from '../src/ui/impoundPayPrompt.js';
import { setPromptDeck } from '../src/ui/promptDeck.js';

const ECON = lot.IMPOUND_LOT_ECON;
const DAY = ECON.dayS;
const HITCH = SHIPS.find((ship) => ship.id === 'ship_kestrel');
const RAW_ID = /\b(?:ship|sector|station|faction|loss)_[a-z0-9_]+\b|\b(?:ntc|fine|war|audit):\d+/i;
const unit = (h) => (h >>> 0) / 0xffffffff;

// ── impound lot harness (same seams as impound-lot-expansion) ──────────────────────
function bootLot({ credits = 999999 } = {}) {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.simTime = 120;
  state.tick = 7200;
  state.world.currentSectorId = 'sector_helios_prime';
  state.player.credits = credits;
  state.playerId = 1;
  state.player.ownedShips = [{ defId: HITCH.id, fittings: new Array(buildSlotList(HITCH).length).fill(null), appearance: null }];
  state.player.activeShipIndex = 0;
  state.ui.docked = false;
  state.ui.dockedStationId = null;
  state.entities.set(1, { id: 1, alive: true, type: 'ship', hull: 140, data: { defId: HITCH.id, fittings: [] } });
  const bus = createBus();
  const all = [];
  const realEmit = bus.emit.bind(bus);
  bus.emit = (name, p) => { all.push({ name, p }); return realEmit(name, p); };
  const of = (name) => all.filter((r) => r.name === name).map((r) => r.p);
  bus.on('economy:chargeCredits', (p) => { state.player.credits -= p.amount; });
  bus.on('economy:grantCredits', (p) => { state.player.credits += p.amount; });
  const ledger = Object.create(lossPrototype);
  ledger.init({ state, bus, helpers: {} });
  const ships = Object.assign({}, shipsPrototype, { _instSeq: 0 });
  ships.init({ state, bus, helpers: {} });
  return { state, bus, of };
}

function dockAt(h, stationId = 'station_helios') {
  h.state.ui.docked = true;
  h.state.ui.dockedStationId = stationId;
  h.bus.emit('dock:docked', { stationId });
}

function postLot(h, lossId, id) {
  h.state.entities.set(id, {
    id, alive: true, type: 'ship', factionId: 'faction_reach',
    data: { defId: 'ship_wasp', callsign: 'Marrow', sectorId: 'sector_helios_prime' },
  });
  const listing = lot.postImpoundListing(h.state, h.bus, {
    entity: h.state.entities.get(id),
    entry: { lossId, sectorId: 'sector_helios_prime', factionId: 'faction_reach', victimCallsign: 'Marrow', killedByPlayer: true, killerId: 1 },
  });
  h.state.entities.delete(id);
  return listing;
}

function postWhere(h, pred, base) {
  for (let i = 0; i < 500; i += 1) {
    const listing = postLot(h, `${base}${i}`, 700 + i);
    if (listing && pred(listing)) return listing;
    delete h.state.lossLedger.impound;
  }
  return null;
}

function advanceDays(h, n = 1) {
  h.state.simTime += n * DAY;
  h.bus.emit('day:tick', {});
}

const desk = (h, verb, extra = {}) => h.bus.emit('impoundLot:deskIntent', { verb, ...extra });

test('lot desk intents reach every attendant verb and move credits only through economy intents', () => {
  const h = bootLot();
  const listing = postWhere(h, (l) => l.dispute && l.dispute.outcome === 'pending', 'loss_dv');
  assert.ok(listing, 'a book with a filed claim exists');
  // Off the berth the desk refuses aloud — nothing is charged.
  const c0 = h.state.player.credits;
  desk(h, 'tip');
  assert.equal(h.state.player.credits, c0);
  assert.ok(h.of('toast').some((t) => /Dock there/.test(t.text)), 'the refusal is a receipt');
  dockAt(h, listing.stationId);

  desk(h, 'tip');
  assert.equal(listing.tip, true, 'the tip lands');
  const board = lot.impoundLotBoard(h.state);
  assert.equal(board.auction.strike, listing.auction.strike, 'the board now shows the quiet paper');
  const tipCharge = h.of('economy:chargeCredits').find((p) => /impound_lot:tip:/.test(p.reason));
  assert.equal(tipCharge.amount, board.tipFeeCr, 'the board quotes the price the verb charges');

  desk(h, 'quiet');
  assert.equal(listing.dispute.outcome, 'quieted');

  desk(h, 'watch', { on: true });
  assert.equal(listing.watched, true);
  desk(h, 'watch', { on: false });
  assert.equal(listing.watched, false);

  desk(h, 'haggle');
  assert.ok(listing.haggles >= 1, 'the attendant hears the haggle');

  const holdFee = lot.impoundLotBoard(h.state).holdFeeCr;
  desk(h, 'hold');
  assert.ok(listing.hold && listing.hold.kind === 'deposit', 'the hold freezes the book');
  assert.equal(h.of('economy:chargeCredits').at(-1).amount, holdFee);
  assert.ok(h.of('impoundLot:deskAnswered').every((p) => typeof p.verb === 'string'));
  for (const t of [...h.of('toast'), ...h.of('comms:popup')]) {
    assert.ok(!RAW_ID.test(t.text), `no internal id on a player line: ${t.text}`);
  }
});

test('a sealed bid placed through the desk intent wins over the quiet paper', () => {
  const h = bootLot();
  const listing = postLot(h, 'loss_bid0', 801);
  dockAt(h, listing.stationId);
  desk(h, 'bid', { amount: listing.auction.strike + 10 });
  assert.equal(listing.hold, null, 'no bid before the block opens');
  assert.ok(h.of('toast').some((t) => /auction/.test(t.text)));
  while (!lot.impoundListingFor(h.state)?.auction.open) advanceDays(h, 1);
  const live = lot.impoundListingFor(h.state);
  assert.ok(live, 'the hull is still on the block');
  desk(h, 'bid', { amount: live.auction.strike });
  assert.equal(live.hold && live.hold.kind, 'bid', 'a bid at the strike holds the hull');
});

test('a haggled ask under the floor never climbs back on the next markdown', () => {
  const h = bootLot();
  const listing = postLot(h, 'loss_floor0', 811);
  normalizeOpen(h, listing);
  listing.ask = Math.round(listing.auction.floor * 0.8);
  listing.auction.strike = Math.max(1, Math.round(listing.auction.floor * 0.5));
  const before = listing.ask;
  advanceDays(h, 1);
  // The strike heals up to the floor, so the quiet bidder takes a sub-floor ask that day —
  // at the agreed price, not at a floor the markdown climbed back to.
  const live = lot.impoundListingFor(h.state);
  const closed = h.of('impoundLot:closed').at(-1);
  const price = live ? live.ask : closed && closed.price;
  assert.ok(Number.isFinite(price), 'the book either still lists or closed with a price');
  // The day's storage fee is an honest cradle bill on top of the agreed price; nothing else adds.
  const fee = h.of('impoundLot:feesAccrued').reduce((a, p) => a + (p.fee || 0), 0);
  assert.ok(price <= before + fee, `price ${price} must not rise above the agreed ${before} + ${fee} storage`);
  assert.ok(price < listing.auction.floor, 'the markdown did not lift the ask back to the floor');
});

function normalizeOpen(h, listing) {
  lot.impoundListingFor(h.state);
  listing.auction.open = true;
  listing.auction.opensDay = listing.postDay;
}

test('the insider tip speaks days from today, never the book\'s day index', () => {
  const h = bootLot();
  const listing = postWhere(h, (l) => !!l.redeem, 'loss_tipd');
  assert.ok(listing, 'a book the kin will redeem');
  dockAt(h, listing.stationId);
  desk(h, 'tip');
  const line = h.of('comms:popup').map((p) => p.text).find((t) => /quiet paper tops out/.test(t));
  assert.ok(line, 'the tip line is spoken');
  assert.ok(!/around day \d/.test(line), line);
  assert.match(line, /comes for it (tomorrow|any day now|in about \d+ days)/);
});

test('the kin\'s ransom is answerable from the desk intent at its berth', () => {
  let lossId = null;
  for (let k = 0; k < 500 && !lossId; k += 1) {
    if (unit(hash32(`loss_r${k}`, 'impound-ransom')) < ECON.ransomChance) lossId = `loss_r${k}`;
  }
  const h = bootLot({ credits: 0 });
  lot.ensureImpoundLotWiring(h.state, { bus: h.bus });
  const def = SHIPS.find((s) => s.id === 'ship_wasp');
  const owned = { defId: def.id, fittings: new Array(buildSlotList(def).length).fill(null), appearance: null };
  owned.impoundShadow = mintImpoundShadow({ lossId, callsign: 'Marrow' }, h.state.simTime);
  h.state.player.ownedShips.push(owned);
  h.state.player.activeShipIndex = h.state.player.ownedShips.length - 1;
  dockAt(h, 'station_helios');
  assert.equal(owned.impoundShadow.ransom.state, 'offered');
  const amount = owned.impoundShadow.ransom.amount;
  desk(h, 'acceptRansom');
  assert.equal(owned.impoundShadow.ransom.state, 'paid');
  assert.equal(h.state.player.credits, amount, 'the kin pay through economy:grantCredits');
  desk(h, 'acceptRansom');
  assert.equal(h.state.player.credits, amount, 'paid once');
});

// ── Helix docket harness ──────────────────────────────────────────────────────────
function bootHelix({ credits = 50000 } = {}) {
  const bus = createBus();
  const sim = createSimulation({ seed: 4242, bus, systems: [factionHelix] });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_sedna_dark';
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 60000, z: 60000 }, radius: 12, mass: 24, hull: 100, hullMax: 100, collides: true });
  state.playerId = player.id;
  state.player.credits = credits;
  const charges = [];
  bus.on('economy:chargeCredits', (p) => { charges.push(p); state.player.credits = Math.max(0, state.player.credits - p.amount); });
  bus.on('economy:grantCredits', (p) => { state.player.credits += p.amount; });
  const offers = [];
  bus.on('helix:serviceOffer', (p) => offers.push(p));
  const logs = [];
  bus.on('comms:log', (p) => logs.push(p));
  const hx = () => ensureHelixState(state);
  const quiet = () => {
    const h = hx();
    h.nextDeskAt = 1e12;
    for (const k of Object.keys(h.desks)) { h.desks[k].nextNoticeAt = 1e12; h.desks[k].nextAuditAt = 1e12; }
  };
  const spawnDesk = (x, z) => {
    const e = sim.spawn({
      type: 'ship', team: 0, pos: { x, z }, radius: HELIX_DESKS.deskRadius, mass: HELIX_DESKS.deskMass,
      hull: HELIX_DESKS.deskHull, hullMax: HELIX_DESKS.deskHull, collides: true,
      data: { helixAudit: true, helixDeskId: 'desk:test', name: 'ASSESSMENT DESK' },
    });
    sim.runTicks(2);
    return e;
  };
  const sys = sim.registry.get('faction_helix');
  return { sim, state, bus, player, charges, offers, logs, hx, quiet, spawnDesk, sys };
}

function fakeDeck() {
  const offered = new Map();
  return {
    offered,
    offerDecision(spec) { offered.set(spec.id, spec); return true; },
    resolveDecision(id) { offered.delete(id); },
  };
}

test('the service ring offers the docket on its edge and clears on leaving', () => {
  const { sim, state, player, offers, hx, quiet, spawnDesk, sys } = bootHelix();
  try {
    spawnDesk(player.pos.x + 900, player.pos.z);
    quiet();
    sys._postFine(state, hx(), 'unlogged_transit', 110, { subjectId: state.playerId });
    sim.runTicks(3);
    assert.equal(offers.filter((o) => o.open).length, 0, 'out of reach, nothing is offered');
    player.pos.x += 800; // inside serveR of the desk
    sim.runTicks(3);
    const open = offers.filter((o) => o.open);
    assert.equal(open.length, 1, 'one offer on the edge, not one per tick');
    assert.equal(open[0].fines.length, 1);
    assert.equal(open[0].manifestValid, false);
    player.pos.x -= 2000;
    sim.runTicks(2);
    assert.equal(offers.at(-1).clear, true, 'leaving the ring clears the card');
  } finally { sim.dispose(); }
});

test('the prompt-deck card settles, contests, files and remits through docketChoice intents', () => {
  const { sim, state, player, bus, charges, hx, quiet, spawnDesk, sys } = bootHelix();
  const deck = fakeDeck();
  setPromptDeck(deck);
  const adapter = Object.create(impoundPayPrompt);
  try {
    adapter.init({ bus, state });
    spawnDesk(player.pos.x + 100, player.pos.z);
    quiet();
    const fineA = sys._postFine(state, hx(), 'unlogged_transit', 110, { subjectId: state.playerId });
    sim.runTicks(2);
    let card = deck.offered.get('helix-docket');
    assert.ok(card, 'the ring puts the docket on the deck');
    const ids = card.choices.map((c) => c.id);
    assert.ok(ids.includes(`pay:${fineA.id}`) && ids.includes(`contest:${fineA.id}`) && ids.includes('manifest') && ids.includes('leave'), ids.join(','));
    for (const c of card.choices) assert.ok(!RAW_ID.test(c.label), c.label);
    assert.ok(!RAW_ID.test(card.detail) && !RAW_ID.test(card.headline));

    // SETTLE: the fine is paid through economy:chargeCredits.
    card.onChoose(`pay:${fineA.id}`);
    assert.equal(fineA.status, 'paid');
    assert.equal(charges.at(-1).reason, `helix_fine:${fineA.id}`);
    card = deck.offered.get('helix-docket');
    assert.ok(card && !card.choices.some((c) => c.id.startsWith('pay:')), 'the card re-opens with what is left');

    // FILE MANIFEST: once per window.
    card.onChoose('manifest');
    assert.ok(hx().manifest && state.simTime < hx().manifest.expiresAt, 'the manifest is on file');
    const manifestCharges = charges.filter((c) => c.reason === 'helix_manifest:filed').length;
    bus.emit('helix:docketChoice', { verb: 'manifest' });
    assert.equal(charges.filter((c) => c.reason === 'helix_manifest:filed').length, manifestCharges, 'no second fee inside the window');
    assert.equal(deck.offered.get('helix-docket'), undefined, 'nothing left to do — the card stays closed');

    // CONTEST: heard once.
    const fineB = sys._postFine(state, hx(), 'lien', 200, { subjectId: state.playerId });
    sim.runTicks(2);
    card = deck.offered.get('helix-docket');
    card.onChoose(`contest:${fineB.id}`);
    assert.equal(fineB.contested, true);
    card = deck.offered.get('helix-docket');
    if (fineB.status === 'open') {
      assert.ok(!card.choices.some((c) => c.id.startsWith('contest:')), 'an instrument is heard once');
    }

    // REMIT: the warrant is spent.
    const w = sys._postWarrant(state, hx(), 'writ_killed');
    sim.runTicks(2);
    card = deck.offered.get('helix-docket');
    const remit = card.choices.find((c) => c.id === 'remit');
    const cost = Math.round(HELIX_WARRANT.settleBaseCr + w.heat * HELIX_WARRANT.settlePerHeatCr);
    assert.equal(remit.label, `REMIT ${cost} CR`);
    card.onChoose('remit');
    assert.equal(w.state, 'settled');
    assert.equal(charges.at(-1).reason, `helix_remit:${w.id}`);
  } finally {
    adapter.destroy();
    setPromptDeck(null);
    sim.dispose();
  }
});

test('a short purse refuses the settlement and the same card comes back', () => {
  const { sim, state, player, bus, hx, quiet, spawnDesk, sys } = bootHelix({ credits: 0 });
  const deck = fakeDeck();
  setPromptDeck(deck);
  const adapter = Object.create(impoundPayPrompt);
  try {
    adapter.init({ bus, state });
    spawnDesk(player.pos.x + 100, player.pos.z);
    quiet();
    // Larger than any precedent bonus the first desk meeting pays out.
    const fine = sys._postFine(state, hx(), 'unlogged_transit', 50000, { subjectId: state.playerId });
    sim.runTicks(2);
    deck.offered.get('helix-docket').onChoose(`pay:${fine.id}`);
    assert.equal(fine.status, 'open', 'no partial settlement');
    assert.ok(deck.offered.get('helix-docket'), 'the counter is still open');
  } finally {
    adapter.destroy();
    setPromptDeck(null);
    sim.dispose();
  }
});

test('a manifest notice answered at the ring writes the manifest the audit reads', () => {
  const { sim, state, player, hx, quiet, spawnDesk, sys } = bootHelix();
  try {
    spawnDesk(player.pos.x + 100, player.pos.z);
    quiet();
    const rec = hx().desks['desk:test'];
    sys._postNotice(state, hx(), rec, 'manifest', {});
    player.vel = { x: 0, z: 0 };
    sim.runTicks(Math.ceil((HELIX_NOTICES.dwellS + 1) * 60));
    const n = hx().notices.find((x) => x.kind === 'manifest');
    assert.equal(n.state, 'verified');
    assert.ok(hx().manifest && state.simTime < hx().manifest.expiresAt, 'the declaration is on file');
    assert.ok(hx().manifest.expiresAt - hx().manifest.filedAt === HELIX_FINES.manifestValidS);
  } finally { sim.dispose(); }
});

test('Bureau lines name the filing by serial, never by ledger key', () => {
  const { sim, state, player, logs, hx, quiet, spawnDesk, sys } = bootHelix();
  try {
    spawnDesk(player.pos.x + 100, player.pos.z);
    quiet();
    sys._postNotice(state, hx(), hx().desks['desk:test'], 'pack', {});
    const line = logs.map((l) => l.text).find((t) => /^VARIANCE/.test(t));
    assert.ok(line, 'the notice is spoken');
    assert.match(line, /^VARIANCE No\. \d+:/);
    assert.ok(!/four hulls/.test(line));
  } finally { sim.dispose(); }
});
