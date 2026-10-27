// Expansion coverage for the rookBooth wreck market: grading/valuation by hull state,
// the reputation-gated negotiation counter, disputed-hull filing through the law seam,
// the competing Quiet-line pad, wanted-pilot refusal, and posted-rate drift.
// Seeded everywhere a draw is exercised — state.rng is a mulberry32 stream, simTime
// advances only by hand.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRookBooth, rookBoothSpec, rookMarketPadSpec, rookStandTier, ROOK_MARKET_STANDS,
} from '../src/systems/rookBooth.js';
import { ROOK_BOOTH } from '../src/data/rook.js';
import { rookPayoutCr } from '../src/characters/rookRules.js';
// missions.js must enter the ops↔missions import cycle first (it spreads
// missionObjectiveOps at module-eval time), so import it ahead of the ops module.
import '../src/systems/missions.js';
import { missionObjectiveOps } from '../src/systems/missionObjectiveOps.js';
import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { mulberry32 } from '../src/core/rng.js';

const PAD = ROOK_BOOTH.pad;
const QUIET = ROOK_MARKET_STANDS.find((s) => s.id === 'quietline');

function fixture({ sector = ROOK_BOOTH.sectorId, kind = 'adventure', seed = 0xC0FFEE, registry = null, heat = null } = {}) {
  const bus = createBus(), events = [];
  const state = {
    simTime: 1000, tick: 600, mode: 'flight', run: { kind },
    world: { currentSectorId: sector }, entities: new Map(), entityList: [],
    story: { flags: {} }, playerId: 7, ui: { docked: false },
    rng: mulberry32(seed >>> 0),
  };
  if (heat != null) state.player = { heat };
  let id = 10;
  const helpers = {
    spawnEntity(spec) { const e = makeEntity({ ...spec, id: ++id }); state.entities.set(e.id, e); state.entityList.push(e); return e; },
    removeEntity(rid) { const e = state.entities.get(rid); if (e) e.alive = false; },
  };
  helpers.spawnEntity({ type: 'ship', id: 7, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 4, mass: 12, hull: 50, hullMax: 50, isPlayer: true });
  for (const t of [
    'comms:popup', 'economy:grantCredits', 'rookWreck:delivered', 'salvage:completed',
    'rookWreck:appraised', 'rookWreck:countered', 'rookWreck:offerLapsed',
    'rookWreck:disputeFiled', 'rookWreck:padRefused', 'wreckMarket:rates',
  ]) bus.on(t, (p) => events.push([t, p]));
  const system = createRookBooth();
  system.init({ state, bus, helpers, registry });
  const pads = () => state.entityList.filter((e) => e.alive && (e.data?.rookBooth === true || typeof e.data?.rookMarketPad === 'string'));
  const addWreck = (over = {}) => helpers.spawnEntity({
    type: 'wreck', pos: { x: PAD.x, z: PAD.z }, vel: { x: 0, z: 0 },
    radius: 30, mass: 1800, hull: 1, hullMax: 1, data: {}, ...over,
  });
  const addQuietWreck = (over = {}) => helpers.spawnEntity({
    type: 'wreck', pos: { x: QUIET.pad.x, z: QUIET.pad.z }, vel: { x: 0, z: 0 },
    radius: 30, mass: 1800, hull: 1, hullMax: 1, data: {}, ...over,
  });
  const grants = () => events.filter(([t]) => t === 'economy:grantCredits');
  const market = () => state.story.rookMarket;
  const sell = (wreck, dt = 0.5) => { system.update(dt, state); return wreck.alive === false; };
  return { bus, state, helpers, system, events, pads, addWreck, addQuietWreck, grants, market, sell };
}

/** Seed the book so the seller is a known regular without playing out N sales. */
function seedRookDeals(state, deals, extra = {}) {
  const m = state.story.rookMarket || (state.story.rookMarket = {
    schemaVersion: 1, offerSeq: 0, lastTickT: 0, stands: {},
  });
  m.stands.rook = {
    deals, massBought: 0, creditsPaid: 0, lastDealT: 0, walkOffs: 0,
    disputesFiled: 0, wantedMuteT: -Infinity, demand: 0, postedRate: 0.18, ...extra,
  };
  return m.stands.rook;
}

// ── Market presence ──────────────────────────────────────────────────────────────

test('two stands share Charon: Rook pad plus the quiet weigh-ring east of the dock', () => {
  const f = fixture();
  assert.equal(f.pads().length, 2, 'the market materializes both rings');
  const quiet = f.pads().find((e) => e.data.rookMarketPad === 'quietline');
  assert.ok(quiet, 'the quiet line has its own beacon');
  assert.equal(quiet.data.rookBooth, undefined, "the rival is not Rook's pad");
  assert.equal(quiet.collides, false, 'the rival ring never shoves a hull');
  assert.ok(Math.hypot(QUIET.pad.x - PAD.x, QUIET.pad.z - PAD.z) > ROOK_BOOTH.padRadius + QUIET.padRadius,
    'the two rings are disjoint — a hull cannot sit in both books');
  assert.deepEqual(rookMarketPadSpec('rook').pos, rookBoothSpec().pos, 'rook spec delegates to the canonical pad');
  assert.equal(rookMarketPadSpec('nope'), null);
  f.system.destroy();
  assert.equal(f.pads().length, 0, 'destroy sweeps both market pads');
});

test('the market ledger is created lazily on state.story and survives a JSON round-trip', () => {
  const f = fixture();
  f.sell(f.addWreck());
  const m = f.market();
  assert.equal(m.schemaVersion, 1);
  assert.equal(m.stands.rook.deals, 1);
  assert.equal(m.stands.rook.massBought, 1800);
  assert.equal(m.stands.rook.creditsPaid, rookPayoutCr(1800));
  const roundTripped = JSON.parse(JSON.stringify(m));
  assert.deepEqual(roundTripped, m, 'the whole ledger is plain JSON-safe data');
  // A stale/corrupt row is repaired, not trusted.
  m.stands.rook = { deals: 'junk' };
  f.system.update(0.5, f.state);
  assert.equal(f.market().stands.rook.deals, 0, 'bad rows normalize to a fresh book');
});

test('a magnitude-corrupt market row is clamped back inside the attainable band', () => {
  const f = fixture();
  f.sell(f.addWreck());
  const m = f.market();
  // Finite but absurd: shape checks alone would trust these, and a future lastTickT
  // would wedge the rate tick so the poisoned posted rate never recomputes.
  m.stands.rook.postedRate = 1e9;
  m.stands.rook.demand = 1e6;
  m.lastTickT = 1e12;
  f.system.update(0.5, f.state);
  const book = m.stands.rook;
  assert.equal(book.postedRate, ROOK_BOOTH.ratePerMass, 'an out-of-band rate resets to the book');
  assert.equal(book.demand, 0.25, 'demand clamps to the appetite ceiling');
  assert.equal(m.lastTickT, f.state.simTime, 'a future stamp cannot stall the tick');
  // In-band rows are untouched — legit drift survives the same pass.
  m.stands.rook.demand = 0.2;
  f.state.simTime += 46;
  f.system.update(0.5, f.state);
  assert.ok(m.stands.rook.demand < 0.2 && m.stands.rook.demand > 0,
    'a legit demand row survives normalization and still decays on the tick');
  // A stands block of the wrong shape loses named rows on JSON — rebuild wholesale.
  m.stands = [];
  f.system.update(0.5, f.state);
  assert.equal(Array.isArray(f.market().stands), false);
  assert.equal(f.market().stands.rook.deals, 0, 'a wrong-shape stands rebuilds fresh');
});

// ── Grading / valuation ─────────────────────────────────────────────────────────

test('grading prices hull state: fresh+intact+warm pays up, ancient pays down, bare pays book', () => {
  const f = fixture({ seed: 7 });
  const book = rookPayoutCr(1800); // 324 cr baseline
  const prime = f.addWreck({ data: {
    wreckClass: 'fresh', killedAt: 900, salvagePool: { cmdty_scrap_metal: 3 },
  } });
  f.state.simTime = 1000; // warm: 100s since the kill
  assert.ok(f.sell(prime));
  const primePaid = f.grants()[0][1].amount;
  assert.ok(primePaid > book, `fresh intact warm hull beats book (${primePaid} > ${book})`);

  const ancient = f.addWreck({ data: { wreckClass: 'ancient', killedAt: 100 } });
  assert.ok(f.sell(ancient));
  const ancientPaid = f.grants()[1][1].amount;
  assert.ok(ancientPaid < book, `a picked-clean derelict pays under book (${ancientPaid} < ${book})`);

  const bare = f.addWreck();
  assert.ok(f.sell(bare));
  assert.equal(f.grants()[2][1].amount, book, 'a data-less hull still pays the book rate');

  const delivered = f.events.filter(([t]) => t === 'rookWreck:delivered');
  assert.equal(delivered[0][1].gradeId, 'prime cut');
  assert.equal(delivered[0][1].warm, true);
  assert.equal(delivered[0][1].intact, true);
  assert.equal(delivered[1][1].gradeId, 'thin scrap');
  assert.equal(delivered[2][1].gradeId, 'book hull');
});

test('a stripped pool earns no contents bonus — grading reads what is actually aboard', () => {
  const f = fixture();
  const stripped = f.addWreck({ data: { wreckClass: 'fresh', salvagePool: { cmdty_scrap_metal: 0 } } });
  const full = f.addWreck({ pos: { x: PAD.x, z: PAD.z }, data: { wreckClass: 'fresh', salvagePool: { cmdty_scrap_metal: 2 } } });
  f.system.update(0.5, f.state);
  assert.equal(stripped.alive, false);
  assert.equal(full.alive, false);
  const paid = f.grants().map(([, p]) => p.amount);
  assert.ok(paid[1] > paid[0], `the hull that still carries pays more (${paid[1]} > ${paid[0]})`);
});

// ── Haggling ─────────────────────────────────────────────────────────────────────

test('a known seller gets the counter: offer opens, dwell sweetens, the slip closes', () => {
  const f = fixture({ seed: 0xBEEF });
  f.state.rng = () => 0.4; // under the tier-1 sweeten chance — the book always counters up
  seedRookDeals(f.state, 3); // tier 1 — the book knows this hull-puller
  const w = f.addWreck({ data: {} });
  f.system.update(0.5, f.state);
  assert.equal(w.alive, true, 'a regular arrival opens an offer instead of an instant sale');
  const offer = w.data.rookOffer;
  assert.ok(offer && offer.stand === 'rook');
  const opening = offer.quoteCr;
  assert.equal(opening, rookPayoutCr(1800), 'the opener is the full appraised quote');
  const appraised = f.events.filter(([t]) => t === 'rookWreck:appraised');
  assert.equal(appraised.length, 1);
  assert.equal(appraised[0][1].quoteCr, opening);
  assert.equal(f.grants().length, 0, 'no credits move while the hull is only quoted');

  // Hold it at rest: the book counters upward across the negotiation window
  // (1.5s steps; tier-1 runs at most two rounds before the 4.5s close).
  f.system.update(1.5, f.state);
  f.system.update(1.5, f.state);
  assert.equal(w.alive, true, 'still holding — the slip has not closed');
  const counters = f.events.filter(([t]) => t === 'rookWreck:countered');
  assert.equal(counters.length, 2, 'both negotiation steps sweetened');
  assert.ok(w.data.rookOffer.quoteCr > opening, 'the standing quote only rises');

  // The slip closes at the end of the window at the final number.
  f.system.update(1.5, f.state);
  assert.equal(w.alive, false, 'the deal closes once the book stops talking');
  const paid = f.grants()[0][1].amount;
  assert.ok(paid > opening, `closed at ${paid} > opener ${opening}`);
  const del = f.events.filter(([t]) => t === 'rookWreck:delivered')[0][1];
  assert.equal(del.standId, 'rook');
  assert.equal(del.haggleRounds, 2, 'the receipt carries how many counters ran');
});

test('hauling the hull out of the ring walks the offer — and the next opener is thinner', () => {
  const f = fixture({ seed: 42 });
  seedRookDeals(f.state, 5);
  const w = f.addWreck({ data: {} });
  f.system.update(0.5, f.state);
  const opening = w.data.rookOffer.quoteCr;

  // Pull it out of the ring — the offer dies as a walk-off.
  w.pos = { x: PAD.x + ROOK_BOOTH.padRadius + 200, z: PAD.z };
  f.system.update(0.5, f.state);
  assert.equal(w.alive, true);
  assert.equal(w.data.rookOffer, undefined, 'the offer is off the pad');
  assert.equal(w.data.rookWalkOffs, 1);
  const lapsed = f.events.filter(([t]) => t === 'rookWreck:offerLapsed');
  assert.equal(lapsed.length, 1);
  assert.equal(lapsed[0][1].reason, 'walked');
  assert.equal(f.market().stands.rook.walkOffs, 1, 'the book counts the walk');

  // Back into the ring: a fresh offer opens at a penalized opener.
  w.pos = { x: PAD.x, z: PAD.z };
  f.system.update(0.5, f.state);
  const reopen = w.data.rookOffer;
  assert.ok(reopen, 'the book will deal again');
  assert.ok(reopen.quoteCr < opening, `the second opener is thinner (${reopen.quoteCr} < ${opening})`);
  assert.equal(reopen.quoteCr, Math.round(rookPayoutCr(1800) * 0.94), 'six points off per walk');
});

test('stripping the pool mid-negotiation strips the intact premium off the quote', () => {
  const f = fixture({ seed: 7 });
  seedRookDeals(f.state, 3); // tier 1 — offers open instead of instant sale
  const w = f.addWreck({ data: { salvagePool: { cmdty_scrap_metal: 4 } } });
  f.system.update(0.5, f.state);
  const offer = w.data.rookOffer;
  assert.ok(offer, 'a regular arrival opens an offer');
  assert.equal(offer.intactPriced, true, 'the opener carried the pool');
  const intactQuote = offer.quoteCr;

  // Seller pockets the freight while the book is still talking.
  w.data.salvagePool = {};
  f.system.update(0.5, f.state);
  assert.ok(w.data.rookOffer.quoteCr < intactQuote,
    `stripped quote ${w.data.rookOffer.quoteCr} < intact opener ${intactQuote}`);
  assert.equal(w.data.rookOffer.intactPriced, false, 'the book re-read the hold');

  // The slip can still close — at the stripped number, not the premium.
  for (let i = 0; i < 12 && w.alive; i++) f.system.update(0.5, f.state);
  assert.equal(w.alive, false);
  const paid = f.grants()[0][1].amount;
  assert.ok(paid < intactQuote, `paid ${paid} < intact opener ${intactQuote}`);
});

test('a hull parked moving inside the ring keeps its offer without accruing dwell', () => {
  const f = fixture({ seed: 9 });
  seedRookDeals(f.state, 3);
  const w = f.addWreck({ data: {} });
  f.system.update(0.5, f.state);
  const offer = w.data.rookOffer;
  // It starts sliding — still inside the yard, not at rest.
  w.vel = { x: 30, z: 0 };
  w.pos = { x: PAD.x + 10, z: PAD.z };
  f.system.update(2.0, f.state);
  assert.equal(w.alive, true);
  assert.ok(w.data.rookOffer, 'a moving hull in the yard keeps its offer');
  assert.equal(w.data.rookOffer.dwell, offer.dwell, 'no dwell accrues while it slides');
  w.vel = { x: 0, z: 0 };
  for (let i = 0; i < 5 && w.alive; i++) f.system.update(1.5, f.state);
  assert.equal(w.alive, false, 'settle it and the deal completes');
});

test('a new seller does not rate the counter — the book still pays on contact', () => {
  const f = fixture();
  const w = f.addWreck();
  f.system.update(0.5, f.state);
  assert.equal(w.alive, false, 'rep-0 sells instantly, exactly as the landed law held');
  assert.equal(w.data.rookOffer, undefined);
  assert.equal(f.events.filter(([t]) => t === 'rookWreck:appraised').length, 0);
  // Walk the count up through real sales; with three hulls in the book the next
  // arrival opens the counter instead of selling on contact.
  for (let i = 0; i < 2; i++) { const x = f.addWreck(); f.system.update(0.5, f.state); assert.equal(x.alive, false); }
  const fourth = f.addWreck();
  f.system.update(0.5, f.state);
  assert.equal(fourth.alive, true, 'with three hulls in the book the pad starts negotiating');
  assert.ok(fourth.data.rookOffer);
});

// ── Disputed hulls and the law seam ─────────────────────────────────────────────

function lawStub(log) {
  return {
    reportIncident(req) {
      log.push(req);
      return {
        accepted: true, incidentReceiptId: `law:incident:test_${log.length}`,
        reportId: req.reportId, kind: req.kind, validatedWitnessedTheft: true, source: 'lawSecurity',
      };
    },
  };
}

test('a lawful-owned hull is disputed: Rook pays book price and can file the slip to law', () => {
  const reports = [];
  const registry = { get: (n) => (n === 'lawSecurity' ? lawStub(reports) : null) };
  const f = fixture({ registry });
  f.state.rng = () => 0.5; // the filing roll always lands under the 0.6 chance
  const w = f.addWreck({ data: {
    wreckClass: 'battlefield',
    provenance: { markerId: 'mk_hot_1', victimFactionId: 'faction_scn', killerId: null },
  } });
  f.system.update(0.5, f.state);
  assert.equal(reports.length, 1, 'the pad hands the slip to the law owner');
  const filed = reports[0];
  assert.equal(filed.kind, 'payload_theft');
  assert.equal(filed.offenderStableId, 'player');
  assert.equal(filed.offenderEntityId, 7);
  assert.equal(filed.payloadStableId, 'mk_hot_1', 'the durable marker names the fenced hull');
  const evt = f.events.filter(([t]) => t === 'rookWreck:disputeFiled');
  assert.equal(evt.length, 1);
  assert.equal(evt[0][1].accepted, true);
  assert.ok(evt[0][1].incidentReceiptId);
  assert.equal(f.market().stands.rook.disputesFiled, 1, 'the book records its own filings');
  assert.equal(w.alive, false, 'the hull still sells — the file is the risk, not a refusal');
});

test('a filing roll that misses stays inside the book — no report, no event', () => {
  const reports = [];
  const f = fixture({ registry: { get: (n) => (n === 'lawSecurity' ? lawStub(reports) : null) } });
  f.state.rng = () => 0.9; // over the 0.6 chance — the book pockets the slip
  f.addWreck({ data: { wreckClass: 'military', provenance: { markerId: 'mk_quiet' } } });
  f.system.update(0.5, f.state);
  assert.equal(reports.length, 0);
  assert.equal(f.events.filter(([t]) => t === 'rookWreck:disputeFiled').length, 0);
  assert.equal(f.market().stands.rook.disputesFiled, 0);
});

test('with no law owner in the registry the filing roll still resolves honestly', () => {
  const f = fixture(); // no registry — a bare sim
  f.state.rng = () => 0.5;
  const w = f.addWreck({ data: { wreckClass: 'military', provenance: { markerId: 'mk_x' } } });
  f.system.update(0.5, f.state);
  assert.equal(w.alive, false, 'the sale completes without a law system');
  const evt = f.events.filter(([t]) => t === 'rookWreck:disputeFiled');
  assert.equal(evt.length, 1, 'the attempt is still observable');
  assert.equal(evt[0][1].accepted, null);
  assert.equal(evt[0][1].reason, 'no_law');
});

test('tier-2 regulars get the book\u2019s discretion — the filing chance halves', () => {
  // A constant roll of 0.45 sits between the tier-1 chance (0.6) and the tier-2
  // discretion chance (0.3): the same draw files for a stranger and not a regular.
  const disputed = () => ({ wreckClass: 'battlefield', provenance: { markerId: 'mk_d', victimFactionId: 'faction_scn' } });

  const r0 = [];
  const f0 = fixture({ registry: { get: (n) => (n === 'lawSecurity' ? lawStub(r0) : null) } });
  f0.state.rng = () => 0.45;
  f0.addWreck({ data: disputed() });
  f0.system.update(0.5, f0.state);
  assert.equal(r0.length, 1, 'a stranger\u2019s hot hull gets filed at 0.45 < 0.6');
  assert.equal(f0.market().stands.rook.disputesFiled, 1);

  const r2 = [];
  const f2 = fixture({ registry: { get: (n) => (n === 'lawSecurity' ? lawStub(r2) : null) } });
  f2.state.rng = () => 0.45;
  seedRookDeals(f2.state, 8);
  const w = f2.addWreck({ data: disputed() });
  for (let i = 0; i < 8 && w.alive; i++) f2.system.update(1.5, f2.state); // hold through the negotiated close
  assert.equal(w.alive, false, 'the regular\u2019s negotiated sale still completes');
  assert.equal(r2.length, 0, 'for a regular the book mislays the slip at 0.45 > 0.3');
  assert.equal(f2.market().stands.rook.disputesFiled, 0);
});

test('the quiet line pays a premium on disputed plate and files nothing', () => {
  const reports = [];
  const f = fixture({ seed: 5, registry: { get: (n) => (n === 'lawSecurity' ? lawStub(reports) : null) } });
  const mil = f.addQuietWreck({ data: { wreckClass: 'military', provenance: { markerId: 'mk_mil' } } });
  f.system.update(0.5, f.state);
  assert.equal(mil.alive, false, 'the line buys hot tonnage on contact');
  assert.equal(reports.length, 0, 'no slip is ever filed — that is the service');
  const paid = f.grants()[0][1].amount;
  // 1800 * 0.15 * 1.35 (military) * 1.8 (disputed) * 0.92 (t0 skim) = 603.5 -> 604
  const expect = Math.max(QUIET.minPayoutCr, Math.round(1800 * 0.15 * 1.35 * 1.8 * 0.92));
  assert.equal(paid, expect);
  assert.ok(paid > rookPayoutCr(1800), `hot plate earns more on the quiet book (${paid} > ${rookPayoutCr(1800)})`);
  const del = f.events.filter(([t]) => t === 'rookWreck:delivered')[0][1];
  assert.equal(del.standId, 'quietline');
  assert.equal(del.disputed, true);
  const salv = f.events.filter(([t]) => t === 'salvage:completed')[0][1];
  assert.equal(salv.source, 'rook:booth:quietline', 'the take names which pad consumed it');
  assert.equal(f.market().stands.quietline.deals, 1);
  assert.equal(f.state.story.flags[ROOK_BOOTH.countFlag], undefined, "the rival's sale is not on Rook's count");
});

test('the quiet line skims less as it learns the seller', () => {
  const f = fixture();
  // Tier the quiet book directly.
  const m = f.market() || f.state.story.rookMarket;
  m.stands.quietline.deals = 8; // tier 2
  const w = f.addQuietWreck({ data: {} });
  f.system.update(0.5, f.state);
  // clean bare hull: 1800 * 0.15 * 1.0 * skim 1.0 = 270
  assert.equal(f.grants()[0][1].amount, 270, 'tier-2 skim is full payout on a bare hull');
});

// ── Wanted pilots ────────────────────────────────────────────────────────────────

test('a posted warrant darkens Rook\u2019s pad but not the quiet ring', () => {
  const f = fixture({ heat: 10 }); // heat above the wanted threshold
  const hot = f.addWreck({ data: {} });
  f.system.update(0.5, f.state);
  assert.equal(hot.alive, true, "Rook's book does not deal under a warrant");
  assert.equal(f.events.filter(([t]) => t === 'rookWreck:padRefused').length, 1);
  const refused = f.events.filter(([t, p]) => t === 'comms:popup' && p.id === `rook_wanted_${hot.id}`);
  assert.equal(refused.length, 1);
  f.system.update(0.5, f.state);
  assert.equal(f.events.filter(([t]) => t === 'rookWreck:padRefused').length, 1, 'the refusal is muted per warrant window');

  const qw = f.addQuietWreck({ data: {} });
  f.system.update(0.5, f.state);
  assert.equal(qw.alive, false, 'the quiet ring is exactly where a wanted hull sells');
});

// ── Demand drift ─────────────────────────────────────────────────────────────────

test('posted rates drift: a sale at one pad sharpens the other, ticks decay it', () => {
  const f = fixture();
  f.addWreck();
  f.system.update(0.5, f.state);
  const m = f.market();
  assert.ok(m.stands.quietline.demand > 0, 'the rival watched the sale and hungers');
  assert.ok(m.stands.rook.demand < 0, 'the fed pad wants the next hull less');

  // Rates repost on the market tick — demand 0.04 lifts the quiet book's rate.
  f.state.simTime += 46;
  f.system.update(0.5, f.state);
  const rates = f.events.filter(([t]) => t === 'wreckMarket:rates');
  assert.ok(rates.length >= 1, 'the market reposted its numbers');
  const posted = rates[rates.length - 1][1].rates;
  assert.ok(posted.quietline > QUIET.ratePerMass, `quiet bids up (${posted.quietline} > ${QUIET.ratePerMass})`);
  assert.ok(posted.rook < ROOK_BOOTH.ratePerMass, `rook's book cools (${posted.rook} < ${ROOK_BOOTH.ratePerMass})`);

  // Decay without new sales returns the book to base.
  for (let i = 0; i < 12; i++) { f.state.simTime += 46; f.system.update(0.5, f.state); }
  assert.ok(Math.abs(m.stands.rook.demand) < 0.01, 'appetite decays back toward the mean');
});

// ── Quiet line announce ──────────────────────────────────────────────────────────

test('the second ring introduces itself only to a seller the book has seen', () => {
  const f = fixture();
  const quietAnnounces = () => f.events.filter(([t, p]) => t === 'comms:popup' && p.id === 'rook_quiet_announce');
  assert.equal(quietAnnounces().length, 0, 'silent until the book knows the seller');
  f.addWreck();
  f.system.update(0.5, f.state);
  f.system.update(0.5, f.state);
  assert.equal(quietAnnounces().length, 1, 'the line hails after the first sale');
  f.system.destroy();
  const f2 = fixture();
  f2.state.story.flags['rook_quiet_announced'] = true;
  assert.equal(f2.events.filter(([t, p]) => t === 'comms:popup' && p.id === 'rook_quiet_announce').length, 0, 'once ever');
});

// ── Determinism ──────────────────────────────────────────────────────────────────

test('the same seeded run settles the same negotiation to the credit', () => {
  const run = (seed) => {
    const f = fixture({ seed });
    seedRookDeals(f.state, 4);
    const paid = [];
    for (let i = 0; i < 3; i++) {
      const w = f.addWreck({ data: { wreckClass: i === 1 ? 'fresh' : 'battlefield', killedAt: 990 } });
      for (let k = 0; k < 8 && w.alive; k++) { f.state.simTime += 1.5; f.system.update(1.5, f.state); }
      paid.push(f.grants().at(-1)[1].amount);
    }
    return paid;
  };
  assert.deepEqual(run(0xD00D), run(0xD00D), 'identical seed and cadence is bit-identical');
  assert.notDeepEqual(run(0xD00D), run(0xBEEF0), 'a different seed haggles differently');
});

test('stale offers expire instead of haunting a rematerialized hull', () => {
  const f = fixture({ seed: 3 });
  seedRookDeals(f.state, 3);
  const w = f.addWreck();
  f.system.update(0.5, f.state);
  assert.ok(w.data.rookOffer);
  // The hull rode out the sector and came back a market-lifetime later.
  f.state.simTime += 200;
  f.system.update(0.5, f.state);
  assert.equal(w.alive, true);
  const fresh = w.data.rookOffer;
  assert.ok(fresh && fresh.postedAt === f.state.simTime, 'the aged offer was re-appraised, not resumed');
  const lapsed = f.events.filter(([t]) => t === 'rookWreck:offerLapsed');
  assert.equal(lapsed[0][1].reason, 'stale');
});

test('offer lifecycle under wanted arrival: the warrant lapses an open offer without prejudice', () => {
  const f = fixture({ seed: 8 });
  seedRookDeals(f.state, 3);
  const w = f.addWreck();
  f.system.update(0.5, f.state);
  assert.ok(w.data.rookOffer);
  f.state.player = { heat: 50 }; // a warrant lands mid-negotiation
  f.system.update(0.5, f.state);
  assert.equal(w.data.rookOffer, undefined, 'the pad went dark on the open offer');
  assert.equal(w.data.rookWalkOffs, undefined, 'a warrant is not a walk-off');
  const lapsed = f.events.filter(([t]) => t === 'rookWreck:offerLapsed');
  assert.equal(lapsed[0][1].reason, 'warrant');
  f.state.player = { heat: 0 }; // cool off — the book deals again
  f.system.update(0.5, f.state);
  assert.ok(w.data.rookOffer, 'the counter reopens once the pilot is clean');
});

test('the mission consumer counts Rook pad only — the laundry never settles his contract', () => {
  const m = {
    id: 'm_rook_tow', status: 'active', type: 'rook_delivery',
    params: { rookDeliveryNeeded: 2, rookDeliveries: 0 },
    objectiveProgress: 0, objectiveTarget: 5, destSectorId: ROOK_BOOTH.sectorId,
  };
  const facade = {
    state: {
      world: { currentSectorId: ROOK_BOOTH.sectorId },
      missions: { active: [m] },
    },
    bus: { emit: () => {} },
    _bookExtrasSatisfied: () => false,
    _completeMission: () => { throw new Error('must not complete'); },
    _refreshTrackedMissionNav: () => {},
    _sayStoryLine: () => {},
  };
  missionObjectiveOps._onRookWreckDelivered.call(facade, { entityId: 1, standId: 'quietline' });
  assert.equal(m.params.rookDeliveries, 0, 'the east ring is not Rook');
  missionObjectiveOps._onRookWreckDelivered.call(facade, { entityId: 2, standId: 'rook' });
  assert.equal(m.params.rookDeliveries, 1, "Rook's own ring still counts");
  missionObjectiveOps._onRookWreckDelivered.call(facade, { entityId: 3 });
  assert.equal(m.params.rookDeliveries, 2, 'a legacy emitter without standId still counts');
});

test('tier math holds the documented boundaries', () => {
  assert.equal(rookStandTier({ deals: 0 }), 0);
  assert.equal(rookStandTier({ deals: 2 }), 0);
  assert.equal(rookStandTier({ deals: 3 }), 1);
  assert.equal(rookStandTier({ deals: 7 }), 1);
  assert.equal(rookStandTier({ deals: 8 }), 2);
  assert.equal(rookStandTier(null), 0);
});
