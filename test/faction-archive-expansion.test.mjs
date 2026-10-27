// faction-archive-expansion — THE STACKS layer added to src/systems/faction_archive.js.
//
// Proves the book end to end on the real system and the real events:
//   · accessions and deeds: reads, corrections, returns, and errands accrue into
//     the standing tiers that scale every price the stacks make
//   · the desk: held quill folios bought at premium (forgeries burned on
//     receipt), notice relief written back to the deserter's own ledger
//   · royalties: copied logs publish once and pay once; suppression sells once
//   · errands: deliver-on-arrival, recover-the-lost-folio, read-for-the-stacks —
//     each settles once, expiry costs a little face
//   · the black file: kills mark, annotate (faster censor pulses), expunge
//     (desk refusal, drones withdraw), circulate to other factions, forgive
//     on a clock, and penance strikes one early
//   · couriers: a bounded cast that walks between Archive bodies on the impulse
//     membrane, each a mobile desk
//   · save-safety: JSON round-trips keep every latch; money never moves twice
//
// Determinism: simTime clocks, hash32 picks. Money via economy:grantCredits/
// chargeCredits taps; standing via faction:repDelta taps.
//
// Run: node --test test/faction-archive-expansion.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { occupantGenerationOf } from '../src/core/entity.js';
import {
  archiveRedaction,
  ensureArchiveState,
  isRedacted,
  redactionBlackout,
  archiveStanding,
  archiveBoard,
  archiveTierFor,
  ARCHIVE_TIERS,
  ARCHIVE_DESK,
  ARCHIVE_ERRANDS,
  ARCHIVE_BLACK_FILE,
  ARCHIVE_COURIERS,
  ARCHIVE_FIELD,
} from '../src/systems/faction_archive.js';
import { quillFolioPrice } from '../src/systems/quill.js';
import {
  ARCHIVE_REDACTION,
  ARCHIVE_PAGE_DRONES,
  ARCHIVE_INDEX_HEAD,
} from '../src/data/factions/archive.js';

const SEED = 7734;
const tick = (s) => Math.ceil(s * 60);

function boot({ credits = 50000 } = {}) {
  const bus = createBus();
  const sim = createSimulation({ seed: SEED, bus, systems: [archiveRedaction] });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_pallas_drift';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true, data: {},
  });
  state.playerId = player.id;
  state.player.credits = credits;
  const events = { grants: [], charges: [], reps: [], logs: [] };
  bus.on('economy:grantCredits', (p) => {
    if (!p) return;
    state.player.credits = Math.round(state.player.credits + Math.round(p.amount || 0));
    events.grants.push(p);
  });
  bus.on('economy:chargeCredits', (p) => {
    if (!p) return;
    const a = Math.round(p.amount || 0);
    // The sole writer's exact-payment envelope (economy._onChargeCreditsRequest):
    // requireFull charges only when the live balance still matches the quote and
    // covers the amount — commit() runs the service latch, then the money moves.
    // A short or stale wallet refuses and writes nothing.
    if (p.requireFull === true) {
      if (p.result === true) return;
      p.result = false;
      const live = Math.max(0, Math.round(state.player.credits || 0));
      if (live !== Math.max(0, Math.round(p.expectedCredits || 0)) || live < a
          || typeof p.commit !== 'function') return;
      if (p.commit() !== true) return;
      state.player.credits = live - a;
      p.result = true;
      events.charges.push(p);
      return;
    }
    state.player.credits = Math.max(0, Math.round(state.player.credits - a));
    events.charges.push(p);
  });
  bus.on('faction:repDelta', (p) => events.reps.push(p));
  bus.on('comms:log', (p) => events.logs.push(p));
  const on = (ev) => {
    const heard = [];
    bus.on(ev, (p) => heard.push(p));
    return heard;
  };
  const sys = sim.registry.get('archiveRedaction');
  return { sim, state, bus, player, events, on, sys };
}

// ── fixture bodies ────────────────────────────────────────────────────────────

const station = (sim, x = 0, z = 0) => sim.spawn({
  type: 'station', team: 0, factionId: 'faction_archive',
  pos: { x, z }, radius: 120, mass: 1e6, hull: 1e6, hullMax: 1e6, collides: true,
  data: { stationId: 'station_drift', services: ['reading_room'], name: 'Reading Room' },
});

const censor = (sim, x, z) => sim.spawn({
  type: 'ship', team: 1, factionId: 'faction_archive',
  pos: { x, z }, radius: 20, mass: 80, hull: 500, hullMax: 500, collides: true,
  data: { censorFrigate: true, role: 'censor-frigate', name: 'Censor Frigate' },
});

const pageDrone = (sim, x, z) => sim.spawn({
  type: 'drone', team: 1, factionId: 'faction_archive',
  pos: { x, z }, radius: 5, mass: 2, hull: 10, hullMax: 10, collides: true,
  data: { pageDrone: true },
});

/** A real kill wire: the emitter flips `alive` before the bus hears it. */
const killBy = (state, bus, victim, killerId, extra = {}) => {
  victim.alive = false;
  bus.emit('entity:killed', {
    id: victim.id, killerId, type: victim.type,
    pos: { x: victim.pos.x, z: victim.pos.z },
    factionId: victim.factionId ?? null,
    ...extra,
  });
};

// ── the deserter's ledger, minted by hand (schema-1 so the desk trusts it) ─────

function mintLedger(state, folios = [], over = {}) {
  state.story.quillLedger = {
    schema: 1, seq: folios.length, saleSeq: 0,
    folios,
    sold: 0, earnedCr: 0, seized: 0, burned: 0, forged: 0,
    exposure: 0, exposureAt: 0,
    quietUntil: 0, burnedMarketUntil: 0, nextSaleAt: 0,
    answered: {}, errand: null, errandsDone: 0, rebound: false,
    pressAnnounced: false,
    redactorSeq: 0, redactorNextAt: 0, redactorUntil: 0, redactorLosses: 0,
    ...over,
  };
  return state.story.quillLedger;
}

const folio = (over = {}) => ({
  id: 'folio_1', markerId: 'mk_1', sectorId: 'sector_orcus_shadow',
  kind: 'manifest', grade: 2, impression: 1, forged: false, burned: false,
  copiedAt: 0, status: 'held', priceCr: 0, grantedCr: 0, soldAt: 0, saleSeq: 0,
  buyer: null,
  ...over,
});

const seedCopy = (state, over = {}) => {
  const a = ensureArchiveState(state);
  const row = {
    id: `copy_${a.copiedLogs.length + 1}`, at: state.simTime, tick: state.tick,
    sectorId: 'sector_pallas_drift', tradeGoodId: ARCHIVE_PAGE_DRONES.copiedTradeGoodId,
    note: `flight log page ${a.copiedLogs.length + 1}`,
    published: false, suppressed: false, soldAt: 0, royaltyCr: 0, suppressCr: 0,
    ...over,
  };
  a.copiedLogs.push(row);
  return row;
};

const granted = (events, prefix) =>
  events.grants.filter((g) => String(g.reason || '').startsWith(prefix));
const charged = (events, prefix) =>
  events.charges.filter((c) => String(c.reason || '').startsWith(prefix));
const repFor = (events, factionId) =>
  events.reps.filter((r) => r.factionId === factionId)
    .reduce((a, r) => a + r.delta, 0);
const repTotal = (events, prefix) =>
  events.reps.filter((r) => String(r.reason || '').startsWith(prefix))
    .reduce((a, r) => a + r.delta, 0);

// ── 1. The contract and the board ────────────────────────────────────────────

test('exports: the old contract is intact and the stacks are additive', () => {
  assert.equal(archiveRedaction.name, 'archiveRedaction');
  for (const fn of [ensureArchiveState, isRedacted, redactionBlackout,
    archiveStanding, archiveBoard, archiveTierFor]) {
    assert.equal(typeof fn, 'function');
  }
  assert.equal(archiveTierFor(0).id, 'unfiled');
  assert.equal(archiveTierFor(ARCHIVE_TIERS[4].deeds).id, 'edition');
  assert.ok(ARCHIVE_DESK.premium > 1 && ARCHIVE_DESK.forgeryPremium > ARCHIVE_DESK.namesPremium);
  assert.ok(ARCHIVE_DESK.copyPublishDelayS > 0);
  assert.ok(ARCHIVE_ERRANDS.maxOpen >= 1 && ARCHIVE_BLACK_FILE.expungeAt >= 2);
  assert.ok(ARCHIVE_COURIERS.maxLive <= ARCHIVE_COURIERS.sentPerSector);
  const { sim, state } = boot();
  try {
    const board = archiveBoard(state);
    assert.equal(board.standing.tier, 0);
    for (const k of ['accessions', 'errands', 'marks', 'copiedLogs']) {
      assert.ok(Array.isArray(board[k]), `board.${k}`);
    }
    board.errands.push({ bogus: true });
    assert.equal(archiveBoard(state).errands.length, 0, 'the snapshot is a copy, not the ledger');
  } finally {
    sim.dispose();
  }
});

test('a pre-stacks save heals: the old three fields survive normalization', () => {
  const { sim, state } = boot();
  try {
    state.archive = { redaction: null, copiedLogs: [{ at: 5, tick: 1, sectorId: 's', tradeGoodId: 'x', note: 'n' }], droneCopies: 7 };
    const a = ensureArchiveState(state);
    assert.equal(a.droneCopies, 7, 'the old counter survives');
    assert.equal(a.copiedLogs.length, 1);
    assert.equal(a.copiedLogs[0].published, false, 'old rows gain the desk latches');
    assert.equal(a.deeds, 0);
    assert.ok(Array.isArray(a.accessions) && Array.isArray(a.marks));
    assert.ok(a.desk && a.errands && a.traffic);
    assert.ok(JSON.parse(JSON.stringify(state.archive)), 'the whole book serializes');
  } finally {
    sim.dispose();
  }
});

// ── 2. Accessions, deeds, tiers ──────────────────────────────────────────────

test('index reads file deeds once per body; the tier speaks on the climb', () => {
  const { sim, state, bus, player, on } = boot();
  try {
    const filed = on('archive:indexFiled');
    const tiers = on('archive:tier');
    player.data = { ...(player.data || {}), lineHeadId: ARCHIVE_INDEX_HEAD.id };
    const mk = (markerId, x) => sim.spawn({
      type: 'payload', team: 0, pos: { x, z: 0 }, radius: 6, mass: 12,
      hull: 10, hullMax: 10, collides: true, data: { name: 'Slate', markerId },
    });
    const a = ensureArchiveState(state);
    a.deeds = ARCHIVE_TIERS[1].deeds - 1; // one read short of Indexed

    const first = mk('marker_a', 40);
    state.player.tether = { active: true, targetId: first.id };
    sim.runTicks(tick(ARCHIVE_INDEX_HEAD.scanTimeS) + 2);
    assert.equal(filed.length, 1, 'the read filed');
    assert.equal(a.deeds, ARCHIVE_TIERS[1].deeds, 'the deed counted');
    assert.equal(tiers.length, 1, 'the tier crossing spoke once');
    assert.equal(tiers[0].id, 'indexed');

    // Re-read the same key: the stacks already have it — no second deed.
    const deeds = a.deeds;
    player.data.indexScanId = -1; // force a fresh read edge on the same body
    sim.runTicks(tick(ARCHIVE_INDEX_HEAD.scanTimeS) + 2);
    assert.equal(a.deeds, deeds, 'a known body earns no second deed');

    // A body with no durable key is noted, not shelved.
    const keyless = sim.spawn({
      type: 'payload', team: 0, pos: { x: 50, z: 0 }, radius: 6, mass: 12,
      hull: 10, hullMax: 10, collides: true, data: { name: 'Pebble' },
    });
    state.player.tether = { active: true, targetId: keyless.id };
    player.data.indexScanId = -1;
    sim.runTicks(tick(ARCHIVE_INDEX_HEAD.scanTimeS) + 2);
    assert.equal(a.deeds, deeds, 'a keyless read is not a deed');
    assert.equal(archiveStanding(state).id, 'indexed');
  } finally {
    sim.dispose();
  }
});

// ── 3. The desk: folio buyback on the deserter's own price law ────────────────

test('the desk buys held quill folios at premium, once each, and calms the notice', () => {
  const { sim, state, events, on } = boot();
  try {
    const bought = on('archive:folioBought');
    station(sim, 0, 0); // the desk ring covers the player at 0,0
    const names = folio({ id: 'f_names', kind: 'names', grade: 1 });
    const manifest = folio({ id: 'f_man', kind: 'manifest', grade: 2 });
    const ledger = mintLedger(state, [names, manifest], { exposure: 50, exposureAt: state.simTime });
    const namesPrice = quillFolioPrice(names, ledger, state.simTime);
    const manPrice = quillFolioPrice(manifest, ledger, state.simTime);

    sim.runTicks(3);
    assert.equal(bought.length, 1, 'one cadence, one buyback — the best page first');
    const sold = ledger.folios.find((f) => f.status === 'sold');
    assert.equal(sold.id === 'f_names' || sold.id === 'f_man', true);
    const first = bought[0];
    const firstFolio = ledger.folios.find((f) => f.id === first.folioId);
    assert.equal(firstFolio.buyer, 'the Archive');
    const base = first.folioId === 'f_names' ? namesPrice : manPrice;
    const prem = first.folioId === 'f_names' ? ARCHIVE_DESK.namesPremium : ARCHIVE_DESK.premium;
    assert.equal(first.priceCr, Math.max(1, Math.round(base * prem * 1.0)));
    assert.equal(granted(events, 'archive:folio:').length, 1);
    assert.ok(ledger.exposure < 50, 'returning pages calms the deserter notice');
    assert.equal(ledger.saleSeq, 1, 'the deserter seq counts the Archive sale too');
    assert.ok(archiveStanding(state).foliosBought >= 1);

    // The second held page sells on the next cadence — then the shelf is empty.
    sim.runTicks(tick(ARCHIVE_DESK.buyCadenceS) + 4);
    assert.equal(bought.length, 2, 'one folio per cadence');
    sim.runTicks(tick(ARCHIVE_DESK.buyCadenceS * 3));
    assert.equal(bought.length, 2, 'no held pages, no further sales');
    assert.equal(granted(events, 'archive:folio:').length, 2, 'money moved exactly twice');
    assert.equal(repTotal(events, 'archive:cite:folio_returned_first'), 3, 'first return cited once');
  } finally {
    sim.dispose();
  }
});

test('a returned forgery is paid dearest and burned on receipt', () => {
  const { sim, state, events, on } = boot();
  try {
    const bought = on('archive:folioBought');
    station(sim, 0, 0);
    const lie = folio({ id: 'f_lie', kind: 'forgery', grade: 3, forged: true });
    const ledger = mintLedger(state, [lie]);
    const price = quillFolioPrice(lie, ledger, state.simTime);
    sim.runTicks(3);
    assert.equal(bought.length, 1);
    const f = ledger.folios[0];
    assert.equal(f.burned, true, 'a lie in a sealed hand is burned on receipt');
    assert.equal(bought[0].priceCr, Math.max(1, Math.round(price * ARCHIVE_DESK.forgeryPremium)));
    assert.equal(archiveStanding(state).forgeriesBurned, 1);
    assert.equal(repTotal(events, 'archive:forgery_returned'), 2, 'returning a lie is a deed the stacks honor');
  } finally {
    sim.dispose();
  }
});

test('the desk closes to the expunged — refusal, not trades', () => {
  const { sim, state, player, on } = boot();
  try {
    const refused = on('archive:deskRefused');
    const bought = on('archive:folioBought');
    station(sim, 0, 0);
    mintLedger(state, [folio({ id: 'f1', kind: 'manifest', grade: 3 })]);
    const a = ensureArchiveState(state);
    // Three live marks put the pilot outside the stacks.
    for (let i = 0; i < ARCHIVE_BLACK_FILE.expungeAt; i++) {
      const d = pageDrone(sim, 500 + i, 500);
      killBy(state, sim.bus, d, player.id);
    }
    assert.ok(a.expungedUntil > state.simTime, 'the file is shut');
    sim.runTicks(tick(ARCHIVE_DESK.buyCadenceS) + 4);
    assert.equal(bought.length, 0, 'the stacks refuse the expunged');
    assert.ok(refused.length >= 1, 'the desk spoke the refusal');
  } finally {
    sim.dispose();
  }
});

// ── 4. Royalties and suppression ─────────────────────────────────────────────

test('a copied log publishes once and pays its royalty once — even across a restore', () => {
  const { sim, state, events, on } = boot();
  try {
    const published = on('archive:copyPublished');
    const row = seedCopy(state, { at: state.simTime - ARCHIVE_DESK.copyPublishDelayS - 5 });
    sim.runTicks(3);
    assert.equal(published.length, 1, 'the page sold');
    assert.equal(row.published, true);
    assert.equal(granted(events, 'archive:royalty').length, 1);
    assert.equal(granted(events, 'archive:royalty')[0].amount, row.royaltyCr);
    assert.ok(row.royaltyCr >= ARCHIVE_DESK.copyRoyaltyCr, 'standing scales the cut');

    // A replayed save cannot re-sell the page: the latch rode the envelope.
    state.archive = JSON.parse(JSON.stringify(state.archive));
    sim.runTicks(30);
    assert.equal(published.length, 1, 'the same page never sells twice');
    assert.equal(granted(events, 'archive:royalty').length, 1);
  } finally {
    sim.dispose();
  }
});

test('the desk offers suppression; buying it keeps the page off the market forever', () => {
  const { sim, state, player, events, on } = boot();
  try {
    const offered = on('archive:suppressOffered');
    const suppressed = on('archive:copySuppressed');
    station(sim, 0, 0);
    const row = seedCopy(state, { at: state.simTime }); // fresh — not yet publishable
    sim.runTicks(3);
    assert.equal(offered.length >= 1, true, 'the desk offered the shelf price');
    const a = ensureArchiveState(state);
    assert.equal(a.desk.offer.logKey, row.id);
    assert.equal(a.desk.offer.costCr, ARCHIVE_DESK.suppressCostCr, 'first suppression at list');

    const creditsBefore = state.player.credits;
    const done = sim.registry.get('archiveRedaction').archiveSuppressCopy(state);
    assert.ok(done, 'the offer accepted');
    assert.equal(row.suppressed, true);
    assert.equal(charged(events, 'archive:suppress')[0].amount, ARCHIVE_DESK.suppressCostCr);
    assert.equal(state.player.credits, creditsBefore - ARCHIVE_DESK.suppressCostCr);
    assert.equal(suppressed.length, 1);
    assert.equal(a.desk.suppressedCount, 1, 'the next one costs more');
    assert.equal(a.desk.offer, null, 'the offer clears on the sale');

    // Past the publish delay: a suppressed page can never publish.
    row.at = state.simTime - ARCHIVE_DESK.copyPublishDelayS - 5;
    sim.runTicks(30);
    assert.equal(row.published, false);
    // And the second suppression costs the grown price.
    const row2 = seedCopy(state, { at: state.simTime });
    sim.runTicks(3);
    assert.equal(a.desk.offer.logKey, row2.id);
    assert.ok(a.desk.offer.costCr > ARCHIVE_DESK.suppressCostCr, 'the shelf price grows');
    player.pos.x = 0; // still at the desk
    assert.ok(sim.registry.get('archiveRedaction').archiveSuppressCopy(state));
    assert.equal(charged(events, 'archive:suppress').length, 2);
  } finally {
    sim.dispose();
  }
});

test('a thin wallet buys nothing: suppression and penance are exact payments', () => {
  const { sim, state, player, events } = boot({ credits: 50 });
  try {
    const sys = sim.registry.get('archiveRedaction');
    station(sim, 0, 0);
    const row = seedCopy(state, { at: state.simTime });
    sim.runTicks(3);
    const a = ensureArchiveState(state);

    // Suppression is priced; 50cr is not the price. A refusal latches nothing
    // and costs nothing — no free page off the shelf, no clamped zero-charge.
    const denied = sys.archiveSuppressCopy(state);
    assert.equal(denied, null, 'a thin wallet cannot take the page off the shelf');
    assert.equal(row.suppressed, false, 'no latch without payment');
    assert.equal(a.desk.suppressedCount, 0);
    assert.equal(state.player.credits, 50, 'a refusal costs nothing');
    assert.equal(charged(events, 'archive:suppress').length, 0,
      'a refused sale books no charge');

    // Fund the wallet: the same sale lands exactly once.
    state.player.credits = 10000;
    const done = sys.archiveSuppressCopy(state);
    assert.ok(done && row.suppressed === true);
    const paid = charged(events, 'archive:suppress');
    assert.equal(paid.length, 1);
    assert.equal(state.player.credits, 10000 - ARCHIVE_DESK.suppressCostCr);

    // Penance the same way: short money strikes no marks.
    killBy(state, sim.bus, pageDrone(sim, 5, 0), player.id);
    assert.ok(a.marks.some((m) => m.forgiven !== true));
    state.player.credits = 40;
    assert.equal(sys.archiveDoPenance(state), null, 'broke pilots make no amends');
    assert.ok(a.marks.some((m) => m.forgiven !== true), 'the mark still stands');
    assert.equal(charged(events, 'archive:penance').length, 0);
    state.player.credits = 1000;
    const struck = sys.archiveDoPenance(state);
    assert.ok(struck && struck.forgiven === true);
    assert.equal(charged(events, 'archive:penance').length, 1);
    assert.equal(state.player.credits, 1000 - ARCHIVE_DESK.penanceCostCr);
  } finally {
    sim.dispose();
  }
});

// ── 5. The errand board ──────────────────────────────────────────────────────

test('a buyback arms the page home; arrival delivers it once', () => {
  const { sim, state, events, on } = boot();
  try {
    const posted = on('archive:errandPosted');
    const settled = on('archive:errandSettled');
    station(sim, 0, 0);
    mintLedger(state, [folio({ id: 'f_home', kind: 'manifest', grade: 2, sectorId: 'sector_orcus_shadow' })]);
    sim.runTicks(3);
    const deliver = posted.find((p) => p.kind === 'deliver');
    assert.ok(deliver, 'the bought page arms its journey home');
    assert.equal(deliver.sectorId, 'sector_orcus_shadow');

    // Arrival IS the delivery — and it can only settle once.
    sim.bus.emit('sector:enter', { sectorId: 'sector_orcus_shadow' });
    assert.equal(settled.length, 1);
    assert.equal(settled[0].how, 'delivered');
    assert.equal(granted(events, 'archive:errand:deliver').length, 1);
    assert.ok(repTotal(events, 'archive:errand_deliver') >= ARCHIVE_ERRANDS.deliverRep);
    assert.equal(repTotal(events, 'archive:cite:errand_1'), 2, 'first errand cited once');

    sim.bus.emit('sector:enter', { sectorId: 'sector_orcus_shadow' });
    assert.equal(settled.length, 1, 'a replayed arrival pays nothing');
    assert.equal(archiveStanding(state).errandsDone, 1);
  } finally {
    sim.dispose();
  }
});

test('a lost folio: the field page is taken up and any desk ring closes the carry', () => {
  const { sim, state, player, events, on } = boot();
  try {
    const recovered = on('archive:folioRecovered');
    const settled = on('archive:errandSettled');
    const sys = sim.registry.get('archiveRedaction');
    station(sim, 0, 0);
    const desks = sys._scanDesks(state);
    assert.ok(desks.length >= 1, 'the station reads as a desk');

    sys._postErrand(state, 'recover', desks);
    const a = ensureArchiveState(state);
    const row = a.errands.open.find((r) => r.kind === 'recover');
    assert.ok(row, 'the board posted the recovery');
    const folioBody = state.entities.get(row.folioId);
    assert.ok(folioBody && folioBody.data.archiveLostFolio === true, 'the page drifts in the field');
    assert.equal(row.folioGen, occupantGenerationOf(folioBody), 'the row is generation-bound');
    assert.ok(Math.hypot(folioBody.pos.x, folioBody.pos.z) > 500, 'it is out there, not in your lap');

    // Walk out and take it up.
    player.pos.x = folioBody.pos.x; player.pos.z = folioBody.pos.z;
    sim.runTicks(3);
    assert.equal(recovered.length, 1, 'the page rides your hold');
    assert.equal(row.phase, 'return');
    assert.ok(!state.entityList.includes(folioBody) || folioBody.alive === false, 'the body left the field');

    // Home — any desk ring closes the carry.
    player.pos.x = 0; player.pos.z = 0;
    sim.runTicks(3);
    assert.equal(settled.length, 1);
    assert.equal(settled[0].how, 'recovered');
    assert.equal(granted(events, 'archive:errand:recover').length, 1);
    assert.equal(repTotal(events, 'archive:errand_recover'), ARCHIVE_ERRANDS.recoverRep);
    sim.runTicks(5);
    assert.equal(settled.length, 1, 'a settled errand never settles twice');
  } finally {
    sim.dispose();
  }
});

test('a read errand resolves on the next Index read; an ignored page expires', () => {
  const { sim, state, player, events, on } = boot();
  try {
    const settled = on('archive:errandSettled');
    const expired = on('archive:errandExpired');
    const sys = sim.registry.get('archiveRedaction');
    player.data = { ...(player.data || {}), lineHeadId: ARCHIVE_INDEX_HEAD.id };
    station(sim, 0, 0);
    sys._postErrand(state, 'read', sys._scanDesks(state));
    const a = ensureArchiveState(state);
    assert.ok(a.errands.open.some((r) => r.kind === 'read'), 'the board wants a fresh read');

    const body = sim.spawn({
      type: 'payload', team: 0, pos: { x: 40, z: 0 }, radius: 6, mass: 12,
      hull: 10, hullMax: 10, collides: true, data: { name: 'Slate', markerId: 'mk_read' },
    });
    state.player.tether = { active: true, targetId: body.id };
    sim.runTicks(tick(ARCHIVE_INDEX_HEAD.scanTimeS) + 2);
    assert.equal(settled.length, 1);
    assert.equal(settled[0].kind, 'read');
    assert.equal(granted(events, 'archive:errand:read').length, 1);

    // An ignored request lapses on the board's clock and costs a little face.
    sys._postErrand(state, 'read', sys._scanDesks(state));
    const stale = a.errands.open.find((r) => r.kind === 'read');
    assert.ok(stale, 'the board posted again');
    stale.expiresAt = state.simTime - 1;
    sim.runTicks(2);
    assert.equal(expired.length >= 1, true, 'the page waited too long');
    assert.ok(repTotal(events, 'archive:errand_expired') <= ARCHIVE_ERRANDS.expireRep);
  } finally {
    sim.dispose();
  }
});

test('a lapsed recover errand takes its lost page home — no drifting orphans', () => {
  const { sim, state } = boot();
  try {
    const sys = sim.registry.get('archiveRedaction');
    station(sim, 0, 0);
    sys._postErrand(state, 'recover', sys._scanDesks(state));
    const a = ensureArchiveState(state);
    const row = a.errands.open.find((r) => r.kind === 'recover');
    assert.ok(row && row.folioId != null, 'the board dropped the page into the field');
    const folio = state.entities.get(row.folioId);
    assert.ok(folio && folio.alive !== false, 'the lost page drifts');

    // The request lapses: the page goes home with it — it must not keep
    // scanning "the board wants it back" over a closed request.
    row.expiresAt = state.simTime;
    sim.runTicks(2);
    assert.equal(a.errands.open.length, 0, 'the board closed the request');
    assert.equal(folio.alive, false, 'the page drifted home with its request');
  } finally {
    sim.dispose();
  }
});

// ── 6. The black file ────────────────────────────────────────────────────────

test('killing the stacks files marks: annotation shortens the pulse, deepens the dark', () => {
  const { sim, state, player, events, on } = boot();
  try {
    const marked = on('archive:marked');
    const annotated = on('archive:annotated');
    const a = ensureArchiveState(state);
    const d = pageDrone(sim, 500, 500);
    killBy(state, sim.bus, d, player.id);
    assert.equal(marked.length, 1);
    assert.equal(marked[0].kind, 'page_drone');
    assert.equal(a.marks.length, 1);
    assert.equal(a.marks[0].forgiven, false);
    assert.ok(a.annotatedUntil > state.simTime, 'the file annotates you');
    assert.equal(annotated.length, 1);
    assert.equal(repFor(events, 'faction_archive'), ARCHIVE_BLACK_FILE.droneRep);

    // The same kill receipt replayed is a stale wire — the file writes once.
    sim.bus.emit('entity:killed', { id: d.id, killerId: player.id, type: 'drone', factionId: 'faction_archive' });
    assert.equal(a.marks.length, 1, 'one death, one mark');

    // Annotated: the censor's pulse beat and the dark's hold both worsen.
    const c = censor(sim, ARCHIVE_REDACTION.pulseRadius - 200, 0);
    sim.step();
    const red = a.redaction;
    assert.ok(red && red.active, 'the pulse still lands');
    const dur = red.untilSimTime - state.simTime;
    assert.ok(dur > ARCHIVE_REDACTION.durationS * 1.2,
      `annotated dark holds longer (${dur.toFixed(1)}s vs ${ARCHIVE_REDACTION.durationS}s)`);
    const pulseKey = `${c.id}:${occupantGenerationOf(c) ?? 'x'}`;
    const nextPulse = sim.registry.get('archiveRedaction')._pulseAt.get(pulseKey);
    assert.ok(nextPulse - state.simTime < ARCHIVE_REDACTION.pulsePeriodS,
      'the annotated are pulsed on a shorter beat');
  } finally {
    sim.dispose();
  }
});

test('burning a censor circulates your file to another shelf; a reading room, to all of them', () => {
  const { sim, state, player, events, on } = boot();
  try {
    const circulated = on('archive:fileCirculated');
    const c = censor(sim, 500, 500);
    killBy(state, sim.bus, c, player.id);
    assert.equal(repFor(events, 'faction_archive'), ARCHIVE_BLACK_FILE.censorRep);
    const others = events.reps.filter((r) => r.factionId !== 'faction_archive');
    assert.equal(others.length, 1, 'one other shelf reads your name');
    assert.equal(others[0].delta, ARCHIVE_BLACK_FILE.circulateRep);
    assert.equal(circulated.length, 1);

    const room = station(sim, 900, 900);
    killBy(state, sim.bus, room, player.id);
    const shelfHits = events.reps.filter((r) => r.factionId !== 'faction_archive'
      && r.delta === ARCHIVE_BLACK_FILE.roomCirculateRep);
    assert.ok(shelfHits.length >= 5, 'burning a reading room unites the galaxy against you');
    const mark = ensureArchiveState(state).marks.find((m) => m.kind === 'reading_room');
    assert.ok(mark, 'the burn is in the file');
    assert.equal(repTotal(events, 'archive:mark_reading_room'), ARCHIVE_BLACK_FILE.roomRep);
  } finally {
    sim.dispose();
  }
});

test('marks forgive on the file clock; enough open marks expunge; penance opens the file early', () => {
  const { sim, state, player, events, on } = boot();
  try {
    const forgiven = on('archive:markForgiven');
    const expunged = on('archive:expunged');
    const amnesty = on('archive:amnesty');
    const penance = on('archive:penance');
    const a = ensureArchiveState(state);
    station(sim, 0, 0);

    // One mark forgives on its clock.
    const d0 = pageDrone(sim, 400, 400);
    killBy(state, sim.bus, d0, player.id);
    assert.equal(a.marks.length, 1);
    a.marks[0].forgiveAt = state.simTime + 2;
    sim.runTicks(tick(3));
    assert.equal(forgiven.length, 1, 'the margin note faded');
    assert.equal(a.marks[0].forgiven, true);

    // Marks to the expunge line shut the file.
    while (a.marks.filter((m) => !m.forgiven).length < ARCHIVE_BLACK_FILE.expungeAt) {
      killBy(state, sim.bus, pageDrone(sim, 600, 600), player.id);
    }
    assert.ok(a.expungedUntil > state.simTime, 'the file is shut');
    assert.equal(expunged.length, 1);

    // Penance at the desk: pay, the oldest mark forgives, the file reopens.
    const creditsBefore = state.player.credits;
    const sys = sim.registry.get('archiveRedaction');
    const struck = sys.archiveDoPenance(state);
    assert.ok(struck && struck.forgiven, 'amends struck the oldest mark');
    assert.equal(charged(events, 'archive:penance')[0].amount, ARCHIVE_DESK.penanceCostCr);
    assert.equal(state.player.credits, creditsBefore - ARCHIVE_DESK.penanceCostCr);
    assert.equal(penance.length, 1);
    assert.ok(repTotal(events, 'archive:penance') >= ARCHIVE_DESK.penanceRep);
    assert.equal(amnesty.length, 1, 'with marks under the line the file reopens');
    assert.equal(amnesty[0].cause, 'penance');
    assert.ok(state.simTime >= a.expungedUntil, 'the expunge lifted with the payment');
  } finally {
    sim.dispose();
  }
});

test('a lapsed expunge with marks still standing keeps the file shut — no false amnesty', () => {
  const { sim, state, player, on } = boot();
  try {
    const amnesty = on('archive:amnesty');
    const expunged = on('archive:expunged');
    const a = ensureArchiveState(state);
    // Drive the expunge live, then let the clock lapse while the marks stand.
    for (let i = 0; i < ARCHIVE_BLACK_FILE.expungeAt; i++) {
      killBy(state, sim.bus, pageDrone(sim, 700 + i, 700), player.id);
    }
    assert.ok(a.expungedUntil > state.simTime);
    a.expungedUntil = state.simTime + 0.5; // lapse on the next beat
    sim.runTicks(tick(1));
    // The marks still stand — the door stays closed, no amnesty spoken.
    assert.equal(amnesty.length, 0, 'the Archive does not forgive what still stands');
    assert.ok(a.expungedUntil > state.simTime, 'the file stayed shut');
    assert.equal(expunged.length >= 2, true, 'the shut file reasserted');

    // Forgive the marks out and the next lapse speaks amnesty honestly.
    for (const m of a.marks) m.forgiveAt = state.simTime + 0.2;
    a.expungedUntil = state.simTime + 0.5;
    sim.runTicks(tick(1));
    assert.equal(amnesty.length, 1, 'clean marks finally reopen the file');
    assert.equal(amnesty[0].cause, 'lapse');
  } finally {
    sim.dispose();
  }
});

// ── 7. The expunge in the field ──────────────────────────────────────────────

test('the expunged are not worth recording: page drones withdraw instead of copying', () => {
  const { sim, state, player } = boot();
  try {
    const a = ensureArchiveState(state);
    a.expungedUntil = state.simTime + 120;
    const d = pageDrone(sim, player.pos.x + 200, player.pos.z);
    sim.runTicks(60);
    assert.equal(d.data.departing, true, 'the drone wrote you off and left');
    assert.equal(a.droneCopies, 0, 'the expunged leave no pages');
    assert.equal(a.copiedLogs.length, 0);
  } finally {
    sim.dispose();
  }
});

test('the annotated get read faster: page drones copy on the shortened clock', () => {
  const { sim, state, player } = boot();
  try {
    const a = ensureArchiveState(state);
    a.annotatedUntil = state.simTime + 120;
    pageDrone(sim, player.pos.x + 100, player.pos.z); // inside copyRange on arrival beat
    // On the normal clock the first copy lands at copyTimeS; annotated lands sooner.
    sim.runTicks(tick(ARCHIVE_PAGE_DRONES.copyTimeS * ARCHIVE_BLACK_FILE.annotatedCopyMult) + 4);
    assert.equal(a.droneCopies, 1, 'the annotated pilot is read on the short clock');
  } finally {
    sim.dispose();
  }
});

// ── 8. The couriers ──────────────────────────────────────────────────────────

test('couriers spawn bounded from a desk and steer on the impulse membrane', () => {
  const { sim, state, on } = boot();
  try {
    const spawned = on('archive:courierSpawn');
    const hailed = on('archive:courierHail');
    station(sim, 0, 0);
    const a = ensureArchiveState(state);
    sim.runTicks(tick(ARCHIVE_COURIERS.firstSpawnS) + 4);
    assert.equal(spawned.length, 1, 'the first skiff left the desk');
    const courier = state.entityList.find((e) => e.alive !== false && e.data?.archiveCourier === true);
    assert.ok(courier, 'a courier hull walks the stacks');
    assert.equal(courier.factionId, 'faction_archive');
    const live = Object.values(a.traffic.live);
    assert.equal(live.length, 1);
    assert.ok(live[0].destId != null, 'the skiff has a shelf to reach');
    assert.ok(hailed.length >= 1, 'it hailed its desk as you stood near');

    // Homing is a queued impulse — the membrane owns the velocity.
    const vxBefore = courier.vel.x;
    sim.step();
    const cmds = consumePhysicsCommand(courier);
    assert.ok(cmds && cmds.impulses.length >= 1, 'the walk is a queued impulse');
    const last = cmds.impulses[cmds.impulses.length - 1];
    assert.ok(Number.isFinite(last.x) && Number.isFinite(last.z));
    assert.equal(courier.vel.x, vxBefore, 'vel is the membrane\'s, never ours');

    // The cast stays bounded even on a long visit.
    sim.runTicks(tick(ARCHIVE_COURIERS.spawnGapS * ARCHIVE_COURIERS.sentPerSector + 20));
    assert.ok(a.traffic.sent <= ARCHIVE_COURIERS.sentPerSector, 'the cast is bounded per sector');
    const liveCouriers = state.entityList.filter((e) => e.alive !== false && e.data?.archiveCourier === true);
    assert.ok(liveCouriers.length <= ARCHIVE_COURIERS.maxLive, 'never more than maxLive walking');
  } finally {
    sim.dispose();
  }
});

test('a courier skiff is a mobile desk; killing one files the mark', () => {
  const { sim, state, player, events, on } = boot();
  try {
    const bought = on('archive:folioBought');
    const marked = on('archive:marked');
    station(sim, 6000, 6000); // the room is far — only the skiff's desk reaches
    const a = ensureArchiveState(state);
    sim.runTicks(tick(ARCHIVE_COURIERS.firstSpawnS) + 4);
    const courier = state.entityList.find((e) => e.alive !== false && e.data?.archiveCourier === true);
    assert.ok(courier, 'the skiff is out');
    const sys = sim.registry.get('archiveRedaction');
    assert.equal(sys._deskKind(courier), 'courier', 'a skiff is a small desk');

    // Stand on the skiff: its desk buys a held folio though the room is far.
    mintLedger(state, [folio({ id: 'f_skiff', kind: 'manifest', grade: 2 })]);
    player.pos.x = courier.pos.x + 100;
    player.pos.z = courier.pos.z;
    sim.runTicks(3);
    assert.equal(bought.length, 1, 'the mobile desk traded');
    assert.equal(bought[0].deskKind, 'courier');

    // Kill it — the file opens on you.
    killBy(state, sim.bus, courier, player.id);
    assert.equal(marked.length, 1);
    assert.equal(marked[0].kind, 'courier');
    assert.equal(repTotal(events, 'archive:mark_courier'), ARCHIVE_BLACK_FILE.courierRep);
  } finally {
    sim.dispose();
  }
});

// ── 8b. The field cast — the stacks seed their own censors and drones ────────
// No fixture flags here: the whole point is that production seeds the bodies
// the ears read, or redaction and the copy economy are test-only fiction.

test('the field cast is real: censors and drones seed on home turf, bounded', () => {
  const { sim, state, player, on } = boot();
  try {
    const spawns = on('archive:fieldCastSpawn');
    station(sim, 0, 0);
    const a = ensureArchiveState(state);

    // The patrol answers the first beat; the drones follow on the gap clock.
    sim.runTicks(tick(ARCHIVE_FIELD.firstSpawnS) + 2);
    assert.equal(spawns.length, 1, 'the first cast hull is out');
    assert.equal(spawns[0].kind, 'censor', 'the censor patrol answers first');
    const censors = state.entityList.filter(
      (e) => e.alive !== false && e.data?.censorFrigate === true);
    assert.equal(censors.length, 1, 'a real censor frigate walks the sector');
    assert.equal(censors[0].data.archiveFieldCast, true);
    assert.equal(censors[0].factionId, 'faction_archive');

    sim.runTicks(tick(ARCHIVE_FIELD.spawnGapS) + 2);
    assert.equal(spawns[1] && spawns[1].kind, 'drone', 'a drone joins the field');

    // The seeded drone is the real copy pipeline — park one in range and its
    // own ear writes the page, no fixture anywhere. (Assert before the bounds
    // run: a done drone departs and leaves the cast on its own clock.)
    const drone = state.entityList.find(
      (e) => e.alive !== false && e.data?.pageDrone === true);
    assert.ok(drone, 'a seeded drone rides the field');
    drone.pos.x = player.pos.x + 60;
    drone.pos.z = player.pos.z;
    const copiesBefore = a.droneCopies;
    sim.runTicks(tick(ARCHIVE_PAGE_DRONES.copyTimeS) + 2);
    assert.ok(a.droneCopies > copiesBefore, 'the seeded drone copied a page');
    assert.ok(a.copiedLogs.length >= 1);

    // Bounds hold: sent caps close the visit's book; live caps count by flag.
    sim.runTicks(tick(ARCHIVE_FIELD.spawnGapS) * (ARCHIVE_FIELD.dronesPerSector + 2) + 2);
    assert.ok(a.traffic.censorSent <= ARCHIVE_FIELD.censorsPerSector);
    assert.ok(a.traffic.droneSent <= ARCHIVE_FIELD.dronesPerSector);
    assert.ok(
      state.entityList.filter((e) => e.alive !== false && e.data?.pageDrone === true).length
        <= ARCHIVE_FIELD.droneLiveMax,
      'the live cap counts every flagged hull');

    // And the cast feeds the black file: burning the patrol marks the pilot.
    killBy(state, sim.bus, censors[0], player.id);
    assert.equal(a.marks.some((m) => m.kind === 'censor'), true);

    // Off home turf the field is quiet — a fresh sector reseeds the visit book.
    const spawnedSoFar = spawns.length;
    state.world.currentSectorId = 'sector_tethys_junction';
    sim.bus.emit('sector:enter', { sectorId: 'sector_tethys_junction' });
    sim.runTicks(tick(ARCHIVE_FIELD.firstSpawnS + ARCHIVE_FIELD.spawnGapS) + 2);
    assert.equal(spawns.length, spawnedSoFar,
      'the stacks field nothing off the authored redaction map');
    assert.equal(a.traffic.censorSent, 0, 'the visit book reseeded');
  } finally {
    sim.dispose();
  }
});

// ── 9. Once-only, replay, hostile saves ──────────────────────────────────────

test('the first correction is cited once; later swings are just deeds', () => {
  const { sim, state, player, events, on } = boot();
  try {
    const cited = on('archive:cited');
    const c = censor(sim, ARCHIVE_REDACTION.pulseRadius - 200, 0);
    sim.step();
    assert.equal(isRedacted(state), true);
    // Swing out: the escape files the correction and the citation pays once.
    player.pos.x = c.pos.x + ARCHIVE_REDACTION.pulseRadius + ARCHIVE_REDACTION.escapeRadiusBonus + 60;
    sim.step();
    assert.equal(isRedacted(state), false);
    assert.equal(cited.length, 1);
    assert.equal(cited[0].key, 'correction_first');
    assert.equal(granted(events, 'archive:cite:correction_first').length, 1);
    const a = ensureArchiveState(state);
    assert.ok(a.deeds >= 1, 'a swing-out is a deed the stacks respect');
    assert.ok(a.accessions.some((r) => r.kind === 'correction'));

    // Ride the dark again and swing out again: a deed, never a second citation.
    player.pos.x = 0;
    sim.runTicks(tick(ARCHIVE_REDACTION.pulsePeriodS) + 2);
    assert.equal(isRedacted(state), true, 'the censor re-pulsed');
    player.pos.x = c.pos.x + ARCHIVE_REDACTION.pulseRadius + ARCHIVE_REDACTION.escapeRadiusBonus + 60;
    sim.step();
    assert.equal(cited.length, 1, 'the citation is once-only');
    assert.equal(granted(events, 'archive:cite:correction_first').length, 1);
  } finally {
    sim.dispose();
  }
});

test('a dead censor\'s recycled id grants no false swing-out', () => {
  const { sim, state, player, on } = boot();
  try {
    const lifted = on('archive:redactionLifted');
    const cited = on('archive:cited');
    const c = censor(sim, ARCHIVE_REDACTION.pulseRadius - 200, 0);
    sim.step();
    assert.equal(isRedacted(state), true);
    const a = ensureArchiveState(state);
    const realGen = a.redaction.censorGen;
    assert.ok(realGen != null, 'the field recorded its pulser\'s generation');

    // The censor dies and its id lands on a stranger far away — the field must
    // read "the pulser is gone", never "the pilot swung out".
    killBy(state, sim.bus, c, 9999); // some other hand, not the pilot
    const stranger = sim.spawn({
      type: 'ship', team: 2, pos: { x: 90000, z: 90000 }, radius: 12, mass: 24,
      hull: 50, hullMax: 50, collides: true, data: {},
    });
    a.redaction.censorId = stranger.id; // the recycled id, a different generation
    player.pos.x = 0; player.pos.z = 0; // the pilot never moved
    sim.step();
    assert.equal(isRedacted(state), false, 'the field still lifts');
    assert.equal(lifted.length, 1);
    assert.equal(lifted[0].escaped, false, 'gone is not escaped');
    assert.equal(cited.length, 0, 'no correction pays for a stranger\'s distance');
    assert.equal(ensureArchiveState(state).deeds, 0, 'no unearned deed');
  } finally {
    sim.dispose();
  }
});

test('the book survives a save round-trip: stamps, latches, and clocks all hold', () => {
  const { sim, state, events, on } = boot();
  try {
    const published = on('archive:copyPublished');
    station(sim, 0, 0);
    const row = seedCopy(state, { at: state.simTime - ARCHIVE_DESK.copyPublishDelayS - 5 });
    mintLedger(state, [folio({ id: 'f_rt', kind: 'manifest', grade: 2 })]);
    sim.runTicks(3);

    // Mid-flight snapshot: a sold folio, a published copy, deeds, a live mark.
    const d = pageDrone(sim, 500, 500);
    killBy(state, sim.bus, d, state.playerId);
    state.archive = JSON.parse(JSON.stringify(state.archive));
    const a = ensureArchiveState(state);
    assert.equal(a.marks.length, 1, 'the mark rode the envelope');
    assert.equal(a.cited.correction_first == null, true, 'uncited keys stay absent');
    assert.ok(a.desk.foliosBought >= 1);

    // Everything that already fired stays fired; the honest work continues.
    sim.runTicks(30);
    assert.equal(published.length, 1, 'the sold page never re-sells');
    assert.equal(granted(events, 'archive:royalty').length, 1);
    assert.equal(granted(events, 'archive:folio:').length, 1);
  } finally {
    sim.dispose();
  }
});

test('malformed book rows drop on ensure and the book stays plain JSON', () => {
  const { sim, state } = boot();
  try {
    state.archive = {
      redaction: { active: true, untilSimTime: 'never' }, // hostile: clamp, not a stuck dark
      copiedLogs: ['junk', { id: 'c1' }, 42],
      accessions: 'not-array',
      cited: 'junk', indexed: { a: 'x', b: 5 },
      desk: 'x',
      errands: { seq: 'z', open: [{ id: 'e1', kind: 'bogus' }, { id: 'e2', kind: 'deliver' }, 'no'], done: -4 },
      marks: [{ kind: 'nonsense', victimId: 'seven' }, { kind: 'censor', victimId: 3, gen: 2, at: 1, forgiveAt: 2 }],
      annotatedUntil: 'soon', expungedUntil: NaN,
      circulated: { faction_scn: 'two' },
      traffic: { sectorId: 7, sent: 'x', live: { k1: { name: 9, destId: 'q' } } },
      junkField: [1, 2, 3],
    };
    const a = ensureArchiveState(state);
    assert.ok(a.redaction && Number.isFinite(a.redaction.untilSimTime), 'the stuck dark gets a real clock');
    assert.equal(a.copiedLogs.length, 1, 'malformed copy rows drop');
    assert.equal(a.accessions.length, 0);
    assert.deepEqual(a.cited, {});
    assert.equal(a.indexed.b, 5);
    assert.equal(a.indexed.a, 0);
    assert.equal(a.errands.open.length, 1, 'bogus errand kinds drop');
    assert.equal(a.errands.open[0].id, 'e2');
    assert.equal(a.errands.done, 0);
    assert.equal(a.marks.length, 1);
    assert.equal(a.marks[0].kind, 'censor', 'a nonsense kind normalizes to archivist or drops');
    assert.equal(a.annotatedUntil, 0);
    assert.equal(a.expungedUntil, 0);
    assert.equal(a.circulated.faction_scn, 0);
    assert.equal(a.traffic.sent, 0);
    assert.equal(a.traffic.live.k1.destId, null, 'a non-integer dest is unprovable identity');
    assert.equal('junkField' in a, false, 'the root record is whitelisted');
    JSON.parse(JSON.stringify(state.archive));

    // A Map is not a ledger — it would serialize to {} and eat the book.
    state.archive = new Map([['deeds', 9]]);
    const healed = ensureArchiveState(state);
    assert.equal(healed.deeds, 0);
    assert.equal(state.archive instanceof Map, false);
    JSON.parse(JSON.stringify(state.archive));
  } finally {
    sim.dispose();
  }
});

test('a restore rebinds the lost-folio generation — the cold row adopts no impostor', () => {
  const { sim, state } = boot();
  try {
    const sys = sim.registry.get('archiveRedaction');
    station(sim, 0, 0);
    sys._postErrand(state, 'recover', sys._scanDesks(state));
    const a = ensureArchiveState(state);
    const row = a.errands.open.find((r) => r.kind === 'recover');
    const folioBody = state.entities.get(row.folioId);
    const realGen = occupantGenerationOf(folioBody);
    // A save restores with fresh generations: the stored one goes stale, the tag stays true.
    row.folioGen = (realGen ?? 1) + 1000;
    sim.bus.emit('save:loaded', {});
    assert.equal(row.folioGen, realGen, 'the tag re-binds the generation');
    sim.runTicks(3);
    assert.ok(a.errands.open.includes(row), 'a re-bound errand stays open');

    // A folio truly gone lapses the row honestly instead of adopting a stranger.
    state.entities.get(row.folioId).alive = false;
    sim.runTicks(3);
    assert.ok(!a.errands.open.includes(row), 'the lost page closes the request');
  } finally {
    sim.dispose();
  }
});

// ── 10. Once-only amnesty and stale-crumb healing ────────────────────────────

test('penance reopening the file speaks amnesty exactly once — no lapse echo', () => {
  const { sim, state, player, events, on } = boot();
  try {
    const amnesty = on('archive:amnesty');
    const a = ensureArchiveState(state);
    station(sim, 0, 0);
    for (let i = 0; i < ARCHIVE_BLACK_FILE.expungeAt; i++) {
      killBy(state, sim.bus, pageDrone(sim, 700 + i, 700), player.id);
    }
    assert.ok(a.expungedUntil > state.simTime, 'the file is shut');

    const sys = sim.registry.get('archiveRedaction');
    const struck = sys.archiveDoPenance(state);
    assert.ok(struck && struck.forgiven, 'amends struck a mark');
    assert.equal(amnesty.length, 1, 'the penance spoke its amnesty');
    assert.equal(amnesty[0].cause, 'penance');

    // The penance already told the story — the file's own clock must not
    // re-voice the same reopening as a lapse on the next beat.
    sim.runTicks(12);
    assert.equal(amnesty.length, 1, 'the tick cannot echo the penance amnesty');
    const barks = events.logs.filter((l) => /reopens your file/.test(String(l.text || '')));
    assert.equal(barks.length, 1, 'the bark speaks once');
  } finally {
    sim.dispose();
  }
});

test('a restore re-baselines the amnesty latch — a closed file is a state, not an edge', () => {
  const { sim, state, player, on } = boot();
  try {
    const amnesty = on('archive:amnesty');
    const a = ensureArchiveState(state);
    for (let i = 0; i < ARCHIVE_BLACK_FILE.expungeAt; i++) {
      killBy(state, sim.bus, pageDrone(sim, 800 + i, 800), player.id);
    }
    assert.ok(a.expungedUntil > state.simTime, 'the file is shut');
    sim.runTicks(tick(2)); // the live latch has read the shut file

    // The loaded book: the expunge already ran out and every mark forgave —
    // both states, not edges. The restore must re-baseline the transition
    // detector or the first post-load tick voices a phantom amnesty.
    for (const m of a.marks) { m.forgiven = true; m.forgiveAt = 0; }
    a.expungedUntil = state.simTime - 0.5; // >0 but past: closed before this session
    assert.ok(a.expungedUntil > 0 && state.simTime > a.expungedUntil);
    sim.bus.emit('save:loaded', {});
    sim.runTicks(6);
    assert.equal(amnesty.length, 0, 'a file already closed in the save speaks nothing');
  } finally {
    sim.dispose();
  }
});

test('a stale redaction crumb heals — the body cannot stay dark without the field', () => {
  const { sim, state, player, on } = boot();
  try {
    const lifted = on('archive:redactionLifted');
    const a = ensureArchiveState(state);
    a.redaction = null; // the book is clean…
    player.data.redacted = true;
    player.data.enginesDark = true; // …but a hand-cut save pinned the dark on the body
    sim.step();
    assert.equal(isRedacted(state), false);
    assert.equal(player.data.redacted, false, 'the crumb clears with no field behind it');
    assert.equal(player.data.enginesDark, false);
    assert.equal(lifted.length, 0, 'a heal is not a lift — no dark ever stood');
  } finally {
    sim.dispose();
  }
});
