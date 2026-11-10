// faction-vael-expansion — the ledger layer grown around the lien bones.
//
// Proves the expanded Vael runtime on the real system instance:
//   · patrol presence + hails + the Reading + hull-script + the mark + sealed riders
//   · invoices filed by unsettled debt (cut loose / destroyed metal / blood)
//   · invoice stages — reminder, then a writ crew that serves the bill physically
//   · hazard clauses — haul / serve / recovery, proximity-as-signature, tiered pay
//   · named debtors — clamped hulls on the run, witnessed collections
//   · the book — paper tiers, forgiveness, punctuality dividends
//   · kill-wire routing, generation guards on recycled ids, save round-trips,
//     once-only payouts, malformed state
//
// Run: node --test test/faction-vael-expansion.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import {
  vaelLiens,
  ensureVaelState,
  lienAnchorFor,
  vaelContractJobActive,
  vaelBook,
  vaelPaperTier,
  vaelOpenInvoices,
  vaelTierFor,
  VAEL_LEDGER,
  VAEL_PAPER_TIERS,
} from '../src/systems/faction_vael.js';
import { VAEL_LIEN } from '../src/data/factions/vael.js';

const SEED = 7341;
const HOME = 'sector_veil_nebula';

function boot({ sector = HOME, contract = false, credits = 50000, mode = 'flight' } = {}) {
  const bus = createBus();
  const sim = createSimulation({ seed: SEED, bus, systems: [vaelLiens] });
  const { state } = sim;
  state.mode = mode;
  state.world.currentSectorId = sector;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true, data: { name: 'PLAYER' },
  });
  state.playerId = player.id;
  state.player.credits = credits;
  state.factions = state.factions || {};
  state.factions.faction_vael = { rep: 0 };

  const charges = [], grants = [], reps = [], logs = [];
  bus.on('economy:chargeCredits', (p) => {
    charges.push(p);
    state.player.credits = Math.max(0, state.player.credits - (Number(p.amount) || 0));
  });
  bus.on('economy:grantCredits', (p) => {
    grants.push(p);
    state.player.credits += Number(p.amount) || 0;
  });
  bus.on('faction:repDelta', (p) => {
    reps.push(p);
    state.factions.faction_vael.rep += Number(p.delta) || 0;
  });
  bus.on('comms:log', (p) => logs.push(p.text || ''));
  if (contract) state.missions.active = [{ id: 'm_contract', kind: 'contract' }];
  const sys = sim.registry.get('vaelLiens');
  const collect = (name) => { const out = []; bus.on(name, (p) => out.push(p)); return out; };
  // The first tick files the sector visit row so tests can pin the visit clocks.
  sim.step();
  const visit = ensureVaelState(state).visits[sector];
  return { sim, state, bus, player, sys, visit, charges, grants, reps, logs, collect };
}

/** Pin every ambient spawn clock so a test owns what the desk does. */
function quiet(visit) {
  visit.nextPatrolAt = 1e12;
  visit.nextClauseAt = 1e12;
  visit.nextDebtorAt = 1e12;
}

const tender = (sim, x, z, extra = {}) => sim.spawn({
  type: 'ship', team: 1, factionId: 'faction_vael',
  pos: { x, z }, radius: 18, mass: 60, hull: 400, hullMax: 400, collides: true,
  data: { overrideTender: true, role: 'override-tender', name: 'Override Tender', ...extra },
});

const killBy = (bus, id, killerId, extra = {}) =>
  bus.emit('entity:killed', { id, killerId, type: 'ship', ...extra });

// ── shape / normalization ─────────────────────────────────────────────────────

test('exports are additive: the bone API and the book API both stand', () => {
  assert.equal(vaelLiens.name, 'vaelLiens');
  for (const fn of [ensureVaelState, lienAnchorFor, vaelContractJobActive,
    vaelBook, vaelPaperTier, vaelOpenInvoices, vaelTierFor]) {
    assert.equal(typeof fn, 'function');
  }
  assert.equal(typeof vaelLiens.armPageNine, 'function');
  assert.equal(typeof vaelLiens.payoffLien, 'function');
  assert.equal(typeof vaelLiens.cutLienLoose, 'function');
  assert.equal(typeof vaelLiens.payInvoice, 'function');
  assert.ok(VAEL_LEDGER.patrolMaxLive > 0 && VAEL_LEDGER.invoiceMaxOpen > 0);
  assert.ok(VAEL_PAPER_TIERS.length >= 2);
  for (let i = 1; i < VAEL_PAPER_TIERS.length; i++) {
    assert.ok(VAEL_PAPER_TIERS[i].clauses > VAEL_PAPER_TIERS[i - 1].clauses, 'tiers ascend');
  }
});

test('ensureVaelState normalizes malformed saves in place and stays plain JSON', () => {
  const { sim, state } = boot();
  try {
    state.vael = 'a spilled ledger';
    sim.step();
    const v = state.vael;
    assert.ok(v && typeof v === 'object' && !Array.isArray(v));
    assert.ok(Array.isArray(v.invoices) && Array.isArray(v.clauses) && Array.isArray(v.patrols));
    assert.ok(v.book && Number.isInteger(v.book.clauses));

    state.vael.invoices = [null, 'junk', { id: 'inv:ok', amount: 'bad', stage: 9 }, 42];
    state.vael.book = { clauses: -3, stains: 'x', settledCr: NaN };
    state.vael.writs = [{ id: 'w', invoiceId: 'i' }, 'junk'];
    sim.step();
    assert.deepEqual(state.vael.invoices.map((r) => r.id), ['inv:ok'], 'malformed rows dropped');
    assert.equal(state.vael.invoices[0].amount, 0);
    assert.equal(state.vael.invoices[0].stage, 2, 'stage clamps to its range');
    assert.equal(state.vael.book.clauses, 0);
    assert.equal(state.vael.writs.length, 1);

    const snap = JSON.parse(JSON.stringify(state.vael));
    assert.ok(!('map' in snap) && !('set' in snap), 'no Map/Set survives serialization');
    assert.equal(typeof snap.book.clauses, 'number');
  } finally {
    sim.dispose();
  }
});

// ── patrols / territory / authored reads ──────────────────────────────────────

test('patrols post in Vael space on a deterministic clock, bounded and tagged', () => {
  const { sim, state, visit, collect } = boot();
  try {
    const posted = collect('vael:patrolPosted');
    visit.nextPatrolAt = state.simTime; // the desk's patrol beat is due
    sim.step();
    assert.equal(posted.length, 1, 'one patrol posts per beat');
    const row = ensureVaelState(state).patrols[0];
    const body = state.entities.get(row.entityId);
    assert.equal(body.data.vaelPatrol, true, 'the hull wears the patrol tag');
    assert.equal(body.factionId, 'faction_vael');
    assert.equal(row.gen, body.occupantGeneration, 'the row carries the generation');

    for (let i = 0; i < 3; i++) { visit.nextPatrolAt = state.simTime; sim.step(); }
    assert.ok(ensureVaelState(state).patrols.length <= VAEL_LEDGER.patrolMaxLive,
      'live patrols stay bounded');
    // A foreign sector with no Vael signature posts nothing.
    state.world.currentSectorId = 'sector_dry_void';
    const visit2 = sys => ensureVaelState(state).visits['sector_dry_void'];
    sim.step();
    visit2().nextPatrolAt = state.simTime;
    sim.step();
    assert.equal(posted.length, ensureVaelState(state).patrols.length,
      'no patrol where the desk has no paper');
  } finally {
    sim.dispose();
  }
});

test('a patrol hails once, reads the hull once per visit, and marks open invoices', () => {
  const { sim, state, visit, sys, collect } = boot();
  try {
    quiet(visit);
    const hails = collect('vael:patrolHail');
    const readings = collect('vael:reading');
    const marks = collect('vael:marked');
    const row = sys._postPatrol(state, HOME, sys._scan(state));
    const e = state.entities.get(row.entityId);
    e.pos.x = 300; e.pos.z = 0;

    sim.step();
    assert.equal(hails.length, 1, 'the hail speaks once');
    assert.equal(readings.length, 1, 'the Reading fires for this visit');
    assert.equal(readings[0].hullMass, 24, 'the hull read is real data');
    assert.equal(readings[0].openInvoices, 0);

    // The mark needs an open invoice on the book.
    sys._fileInvoice(state, { amount: 500, mass: 12, cause: 'test' });
    sim.step();
    sim.step();
    assert.equal(marks.length, 1, 'open paper stamps the pilot');
    assert.ok(state.entities.get(state.playerId).data.vaelMarkedUntil > state.simTime);

    sim.step(); sim.step();
    assert.equal(hails.length, 1, 'the patrol does not re-hail');
    assert.equal(readings.length, 1, 'the Reading does not re-read this visit');

    // Next sector visit is a fresh reading.
    state.world.currentSectorId = 'sector_ashfall_reach';
    sim.step();
    e.pos.x = 200; e.pos.z = 0;
    sim.step();
    assert.equal(readings.length, 2, 'a new visit reads the hull again');
  } finally {
    sim.dispose();
  }
});

test('page nine at 2pt: close range makes the etched text legible, once per hull', () => {
  const { sim, state, visit, logs, collect } = boot();
  try {
    quiet(visit);
    const reads = collect('vael:hullScriptRead');
    const t = tender(sim, 100, 0); // inside hullScriptR
    sim.step();
    assert.equal(reads.length, 1);
    assert.ok(logs.some((l) => l.includes('page 9') || l.includes('ninth part')),
      'the etched addendum is legible up close');
    sim.step();
    assert.equal(reads.length, 1, 'the same hull is not re-read');
    const t2 = tender(sim, 150, 0);
    sim.step();
    assert.equal(reads.length, 2, 'a second hull is a fresh read');
  } finally {
    sim.dispose();
  }
});

// ── invoices ──────────────────────────────────────────────────────────────────

test('cutting loose ends the clamp and refiles the debt as an invoice', () => {
  const { sim, state, player, sys, visit, collect } = boot({ contract: true });
  try {
    quiet(visit);
    tender(sim, 100, 0);
    sim.runTicks(Math.ceil(VAEL_LIEN.telegraphS * 60) + 2);
    assert.ok(lienAnchorFor(state, player.id), 'clamped');
    const filed = collect('vael:invoiceFiled');
    const cuts = sys.cutLienLoose(state);
    assert.equal(cuts, 1);
    assert.equal(lienAnchorFor(state, player.id), null);
    assert.equal(filed.length, 1);
    const inv = vaelOpenInvoices(state)[0];
    assert.equal(inv.cause, 'cut_loose');
    assert.equal(inv.amount, Math.round(VAEL_LIEN.anchorMass * VAEL_LIEN.payoffPerTonne * VAEL_LEDGER.cutInvoiceFrac),
      'the scrap bill is half the settled value');
  } finally {
    sim.dispose();
  }
});

test('payInvoice settles once through the economy seam and refuses an empty hold', () => {
  const { sim, state, sys, visit, charges, reps, collect } = boot({ credits: 300 });
  try {
    quiet(visit);
    const inv = sys._fileInvoice(state, { amount: 800, mass: 20, cause: 'test' });
    assert.equal(sys.payInvoice(state), 0, 'a broke signature signs nothing');
    assert.equal(charges.length, 0);
    state.player.credits = 5000;
    const settled = collect('vael:invoiceSettled');
    const paid = sys.payInvoice(state, { invoiceId: inv.id });
    assert.equal(paid, 800);
    assert.equal(charges.length, 1, 'one charge for the bill');
    assert.equal(charges[0].reason, `vael_invoice:${inv.id}`);
    assert.equal(inv.state, 'paid');
    assert.ok(reps.some((r) => r.delta > 0 && r.reason === 'vael_invoice_paid'));
    assert.equal(sys.payInvoice(state, { invoiceId: inv.id }), 0, 'settled paper does not bill twice');
    assert.equal(charges.length, 1);
    assert.equal(vaelBook(state).paper.settledCr, 800);
  } finally {
    sim.dispose();
  }
});

test('invoices age: reminder stage, then a writ crew that serves the bill without a contract', () => {
  const { sim, state, player, sys, visit, reps, collect } = boot({ contract: false });
  try {
    quiet(visit);
    const inv = sys._fileInvoice(state, { amount: 1100, mass: 28, cause: 'unpaid_lien' });
    const reminded = collect('vael:invoiceReminded');
    const writs = collect('vael:writPosted');
    const telegraphs = collect('vael:writTelegraph');
    const served = collect('vael:writServed');

    inv.dueAt = state.simTime - 1;
    sim.step();
    assert.equal(inv.stage, 1, 'the reminder stage');
    assert.equal(reminded.length, 1);
    assert.ok(reps.some((r) => r.delta === VAEL_LEDGER.remindRep), 'the nibble stings once');
    sim.step();
    assert.equal(reminded.length, 1, 'the second notice is sent once');

    inv.dueAt = state.simTime - 1;
    sim.step();
    assert.equal(inv.stage, 2, 'the writ stage');
    sim.step();
    assert.equal(writs.length, 1, 'the crew posts');
    const writ = ensureVaelState(state).writs[0];
    assert.equal(writ.invoiceId, inv.id);
    const crew = state.entities.get(writ.tenderId);
    assert.equal(crew.data.vaelWritTender, true);
    assert.ok(writ.lanceIds.length >= 1, 'the tender does not come alone');

    // The writ serves where a contract clause never could.
    assert.equal(vaelContractJobActive(state), false, 'no contract job is running');
    crew.pos.x = player.pos.x + VAEL_LEDGER.writServeR - 40;
    crew.pos.z = player.pos.z;
    sim.step();
    assert.equal(telegraphs.length, 1, 'the writ reads itself first');
    sim.runTicks(Math.ceil(VAEL_LEDGER.writTelegraphS * 60) + 2);
    const anchor = lienAnchorFor(state, player.id);
    assert.ok(anchor, 'the bill clamped back on');
    assert.equal(served.length, 1);
    assert.equal(inv.state, 'served');
    assert.ok(anchor.mass >= VAEL_LIEN.anchorMass + inv.mass - 1e-9,
      'the served mass is the metal plus the bill in tonnes');
    const stood = state.entities.get(writ.tenderId);
    assert.ok(!stood || stood.alive === false, 'a spent crew stands down');
  } finally {
    sim.dispose();
  }
});

test('paying the invoice mid-flight recalls the writ — you cannot shoot a debt but you can settle it', () => {
  const { sim, state, sys, visit, collect } = boot();
  try {
    quiet(visit);
    const inv = sys._fileInvoice(state, { amount: 400, mass: 10, cause: 'test' });
    inv.stage = 2;
    inv.nextWritAt = state.simTime;
    sim.step();
    const writ = ensureVaelState(state).writs[0];
    assert.ok(writ, 'the crew is out');
    const recalled = collect('vael:writRecalled');
    sys.payInvoice(state, { invoiceId: inv.id });
    assert.equal(recalled.length, 1, 'settlement recalls the paper');
    assert.equal(writ.state, 'recalled');
    const crew = state.entities.get(writ.tenderId);
    assert.ok(!crew || crew.alive === false, 'the crew goes home');
  } finally {
    sim.dispose();
  }
});

test('a destroyed anchor and a dead Vael signature both bill the pilot — once each', () => {
  const { sim, state, player, sys, visit, bus, reps } = boot({ contract: true });
  try {
    quiet(visit);
    tender(sim, 100, 0);
    sim.runTicks(Math.ceil(VAEL_LIEN.telegraphS * 60) + 2);
    const anchor = lienAnchorFor(state, player.id);
    assert.ok(anchor);
    // Shoot the clamp off: the metal dies, the paper refiles at full value.
    anchor.alive = false;
    killBy(bus, anchor.id, player.id);
    killBy(bus, anchor.id, player.id); // replayed delivery
    const invs = vaelOpenInvoices(state);
    assert.equal(invs.length, 1, 'one invoice for one destroyed anchor');
    assert.equal(invs[0].cause, 'anchor_destroyed');
    assert.equal(invs[0].amount, Math.round(VAEL_LIEN.anchorMass * VAEL_LIEN.payoffPerTonne));
    assert.equal(player.mass, 24, 'the clamp mass is gone with the metal');

    // An unprovoked kill on a Vael hull is a bill, not a bounty.
    const vaelHull = tender(sim, 800, 0);
    const before = vaelOpenInvoices(state).length;
    vaelHull.alive = false;
    killBy(bus, vaelHull.id, player.id, { factionId: 'faction_vael' });
    killBy(bus, vaelHull.id, player.id, { factionId: 'faction_vael' }); // replay
    const blood = vaelOpenInvoices(state);
    assert.equal(blood.length, before + 1, 'one blood bill for one broken signature');
    assert.equal(blood[blood.length - 1].cause, 'blood');
    assert.equal(blood[blood.length - 1].amount, VAEL_LEDGER.bloodBillCr);
    assert.ok(reps.some((r) => r.delta === VAEL_LEDGER.bloodRep));
    assert.ok(ensureVaelState(state).book.stains >= 1, 'the book keeps the stain');

    // Self-defense files nothing.
    const hostile = tender(sim, 900, 0);
    hostile.alive = false;
    killBy(bus, hostile.id, player.id, { factionId: 'faction_vael', targetHostileToPlayer: true });
    assert.equal(vaelOpenInvoices(state).length, blood.length, 'a defended hull files no bill');
  } finally {
    sim.dispose();
  }
});

// ── hazard clauses ────────────────────────────────────────────────────────────

test('the desk posts clauses on the visit clock and closes to oath-breakers', () => {
  const { sim, state, visit, sys, collect } = boot();
  try {
    const posted = collect('vael:clausePosted');
    visit.nextClauseAt = state.simTime;
    sim.step();
    assert.equal(posted.length, 1);
    const clause = ensureVaelState(state).clauses[0];
    assert.ok(CLAUSE_KINDS.has(clause.kind), 'a real clause kind');
    assert.equal(clause.state, 'open');
    assert.ok(clause.payCr > 0);

    // Stains close the desk.
    ensureVaelState(state).book.stains = VAEL_LEDGER.stainsForWork;
    visit.nextClauseAt = state.simTime;
    sim.step();
    assert.equal(posted.length, 1, 'the desk is closed to broken signatures');
  } finally {
    sim.dispose();
  }
});

const CLAUSE_KINDS = new Set(['haul', 'serve', 'recovery']);

test('haul clause: proximity signs, the crate delivers to the rider buoy, pay is once', () => {
  const { sim, state, player, sys, visit, grants, collect } = boot();
  try {
    quiet(visit);
    const clause = sys._postClause(state, 'haul');
    const crate = state.entities.get(clause.crateId);
    assert.equal(crate.data.vaelCrate, true);
    assert.equal(crate.mass, VAEL_LEDGER.crateMass, 'the paperwork has weight');
    assert.ok(state.entities.get(clause.riderId).data.vaelRider, 'a rider buoy waits');

    player.pos.x = crate.pos.x; player.pos.z = crate.pos.z; // approach — the signature
    sim.step();
    assert.equal(clause.state, 'signed', 'proximity is a signature');
    assert.ok(vaelContractJobActive(state), 'a signed clause IS contract work');

    crate.pos.x = clause.deliver.x; crate.pos.z = clause.deliver.z; // towed into the ring
    const done = collect('vael:clauseDone');
    sim.step();
    assert.equal(clause.state, 'done');
    assert.equal(done.length, 1);
    const grant = grants.find((g) => g.reason === `vael_haul:${clause.id}`);
    assert.equal(grant.amount, Math.round(VAEL_LEDGER.haulPayCr * 1.0), 'unsigned-rate pay');
    assert.equal(ensureVaelState(state).book.clauses, 1, 'the book counts the honor');
    assert.equal(state.entities.get(clause.crateId), undefined, 'the crate is filed');
    sim.step(); sim.step();
    assert.equal(grants.filter((g) => g.reason === `vael_haul:${clause.id}`).length, 1,
      'a delivered clause never pays twice');
  } finally {
    sim.dispose();
  }
});

test('serve clause: the clamp lands on the defaulter and the server is paid', () => {
  const { sim, state, player, sys, visit, grants, collect } = boot();
  try {
    quiet(visit);
    const clause = sys._postClause(state, 'serve');
    const defaulter = state.entities.get(clause.targetId);
    assert.equal(defaulter.data.vaelDefaulter, true);
    const m0 = defaulter.mass;

    player.pos.x = defaulter.pos.x + VAEL_LEDGER.serveR - 60; // inside serve reach
    player.pos.z = defaulter.pos.z;
    sim.step();
    assert.equal(clause.state, 'signed');
    sim.step();
    const anchor = lienAnchorFor(state, defaulter.id);
    assert.ok(anchor, 'the clause served itself onto the subject');
    assert.equal(defaulter.mass, m0 + VAEL_LEDGER.servedAnchorMass, 'the subject got heavier');
    assert.equal(clause.state, 'done');
    assert.ok(grants.some((g) => g.reason === `vael_serve:${clause.id}`), 'the desk pays the server');
  } finally {
    sim.dispose();
  }
});

test('recovery clause: the marked debtor falls to the collector and pays once', () => {
  const { sim, state, player, sys, visit, bus, grants } = boot();
  try {
    quiet(visit);
    const clause = sys._postClause(state, 'recovery');
    const debtor = state.entities.get(clause.targetId);
    assert.equal(debtor.data.vaelClauseDebtor, true);
    assert.ok(lienAnchorFor(state, debtor.id), 'the mark carries its clamp');

    debtor.alive = false;
    killBy(bus, debtor.id, player.id, { pos: { ...debtor.pos } });
    killBy(bus, debtor.id, player.id, { pos: { ...debtor.pos } }); // replayed kill
    sim.step();
    assert.equal(clause.state, 'done');
    const hits = grants.filter((g) => g.reason === `vael_recovery:${clause.id}`);
    assert.equal(hits.length, 1, 'a recovered name pays once');
    assert.equal(hits[0].amount, VAEL_LEDGER.recoverPayCr);
  } finally {
    sim.dispose();
  }
});

test('a broken signature stains the book; unsigned offers lapse clean', () => {
  const { sim, state, player, sys, visit, reps } = boot();
  try {
    quiet(visit);
    const clause = sys._postClause(state, 'haul');
    const crate = state.entities.get(clause.crateId);
    // Unsigned deadline — the offer withdraws itself.
    clause.deadlineAt = state.simTime - 1;
    sim.step();
    assert.equal(clause.state, 'lapsed');
    assert.equal(ensureVaelState(state).book.stains, 0, 'ignored work is free');

    // Signed then abandoned — the shape of the break stays.
    const c2 = sys._postClause(state, 'haul');
    const crate2 = state.entities.get(c2.crateId);
    player.pos.x = crate2.pos.x; player.pos.z = crate2.pos.z;
    sim.step();
    assert.equal(c2.state, 'signed');
    c2.signedAt = state.simTime - VAEL_LEDGER.signedDeadlineS - 1;
    sim.step();
    assert.equal(c2.state, 'failed');
    assert.equal(ensureVaelState(state).book.stains, 1, 'the ledger keeps the break');
    assert.ok(reps.some((r) => r.delta === VAEL_LEDGER.failRep));
  } finally {
    sim.dispose();
  }
});

// ── named debtors ─────────────────────────────────────────────────────────────

test('named debtors run clamped; a witnessed collection pays the full fee', () => {
  const { sim, state, player, sys, visit, bus, grants } = boot();
  try {
    quiet(visit);
    const posted = [];
    bus.on('vael:debtorPosted', (p) => posted.push(p));
    const row = sys._postDebtor(state);
    assert.equal(posted.length, 1);
    const debtor = state.entities.get(row.entityId);
    assert.equal(debtor.data.vaelDebtor, true);
    const anchor = lienAnchorFor(state, debtor.id);
    assert.ok(anchor, 'the debtor carries its clamp');
    assert.equal(debtor.mass, 36 + VAEL_LEDGER.debtorAnchorMass, 'the debt is mass');

    // A Vael witness in reach → the full collection fee.
    tender(sim, debtor.pos.x + 200, debtor.pos.z);
    const collected = [];
    bus.on('vael:debtorCollected', (p) => collected.push(p));
    debtor.alive = false;
    killBy(bus, debtor.id, player.id, { pos: { ...debtor.pos } });
    assert.equal(row.state, 'collected');
    assert.equal(collected.length, 1);
    assert.equal(collected[0].witnessed, true);
    const fee = grants.find((g) => g.reason === `vael_debtor:${row.id}`);
    assert.equal(fee.amount, Math.round(VAEL_LEDGER.debtorCollectCr * VAEL_LEDGER.debtorWitnessBonus));
    sim.step();
    assert.equal(grants.filter((g) => g.reason === `vael_debtor:${row.id}`).length, 1, 'once');
  } finally {
    sim.dispose();
  }
});

test('a debtor downed cold pays scrap; a vanished debtor is skipped, never paid', () => {
  const { sim, state, player, sys, visit, bus, grants } = boot();
  try {
    quiet(visit);
    const row = sys._postDebtor(state);
    const debtor = state.entities.get(row.entityId);
    // No Vael witness anywhere near.
    debtor.alive = false;
    killBy(bus, debtor.id, player.id, { pos: { x: 99999, z: 99999 } });
    const fee = grants.find((g) => g.reason === `vael_debtor:${row.id}`);
    assert.equal(fee.amount, VAEL_LEDGER.debtorCollectCr, 'the cold fee is the base rate');

    // A body that simply vanishes skips — no payout.
    const row2 = sys._postDebtor(state);
    const e2 = state.entities.get(row2.entityId);
    state.entities.delete(e2.id);
    const i = state.entityList.indexOf(e2);
    if (i >= 0) state.entityList.splice(i, 1);
    const skipped = [];
    bus.on('vael:debtorSkipped', (p) => skipped.push(p));
    sim.step();
    assert.equal(row2.state, 'skipped');
    assert.equal(skipped.length, 1);
    assert.equal(grants.filter((g) => g.reason === `vael_debtor:${row2.id}`).length, 0);
  } finally {
    sim.dispose();
  }
});

test('a recycled entity id cannot steal a debtor row — the impostor is skipped', () => {
  const { sim, state, sys, visit, grants } = boot();
  try {
    quiet(visit);
    const row = sys._postDebtor(state);
    const real = state.entities.get(row.entityId);
    const stolenId = real.id;
    // The real hull is gone; an impostor body claims the number.
    state.entities.delete(stolenId);
    state.entityList.splice(state.entityList.indexOf(real), 1);
    const impostor = sim.spawn({
      type: 'ship', team: 2, pos: { x: 50, z: 50 }, radius: 14, mass: 30,
      hull: 100, hullMax: 100, collides: true, data: { name: 'IMPOSTOR' },
    });
    state.entities.set(stolenId, impostor); // force the recycle, wrong generation + no tag
    sim.step();
    assert.equal(row.state, 'skipped', 'the row does not bind the impostor');
    assert.equal(grants.filter((g) => g.reason === `vael_debtor:${row.id}`).length, 0,
      'an impostor collects nothing');
  } finally {
    sim.dispose();
  }
});

// ── the book ──────────────────────────────────────────────────────────────────

test('honored clauses climb the paper tiers and scale what the desk pays', () => {
  const { sim, state, player, sys, visit, grants, collect } = boot();
  try {
    quiet(visit);
    ensureVaelState(state).book.clauses = VAEL_PAPER_TIERS[1].clauses - 1;
    const tierEvents = collect('vael:paperTier');
    const clause = sys._postClause(state, 'serve');
    const defaulter = state.entities.get(clause.targetId);
    player.pos.x = defaulter.pos.x + VAEL_LEDGER.serveR - 60;
    player.pos.z = defaulter.pos.z;
    sim.step(); sim.step(); // sign, then serve
    assert.equal(clause.state, 'done');
    assert.equal(tierEvents.length, 1, 'the crossing speaks once');
    assert.equal(tierEvents[0].id, VAEL_PAPER_TIERS[1].id);
    assert.equal(vaelPaperTier(state).tier, VAEL_PAPER_TIERS[1].tier);
    assert.ok(vaelPaperTier(state).payMult > 1, 'better paper pays better');

    const c2 = sys._postClause(state, 'serve');
    const d2 = state.entities.get(c2.targetId);
    player.pos.x = d2.pos.x + VAEL_LEDGER.serveR - 60;
    player.pos.z = d2.pos.z;
    sim.step(); sim.step();
    const g2 = grants.find((g) => g.reason === `vael_serve:${c2.id}`);
    assert.equal(g2.amount, Math.round(VAEL_LEDGER.servePayCr * VAEL_PAPER_TIERS[1].payMult),
      'the new tier prices the next clause');
  } finally {
    sim.dispose();
  }
});

test('settled credit pays a punctuality dividend at each threshold — once each', () => {
  const { sim, state, sys, visit, grants, collect } = boot();
  try {
    quiet(visit);
    ensureVaelState(state).book.settledCr = VAEL_LEDGER.milestones[0].cr - 100;
    const milestones = collect('vael:milestone');
    const inv = sys._fileInvoice(state, { amount: 100, mass: 4, cause: 'test' });
    sys.payInvoice(state, { invoiceId: inv.id });
    assert.equal(milestones.length, 1, 'the threshold pays once');
    const div = grants.find((g) => g.reason === 'vael_dividend:0');
    assert.equal(div.amount, VAEL_LEDGER.milestones[0].pay);
    sim.step(); sim.step();
    assert.equal(grants.filter((g) => g.reason === 'vael_dividend:0').length, 1, 'never twice');
  } finally {
    sim.dispose();
  }
});

test('enough honored clauses turn a page and forgive an old stain', () => {
  const { sim, state, sys, visit, collect } = boot();
  try {
    quiet(visit);
    const v = ensureVaelState(state);
    v.book.stains = 2;
    v.book.clauses = VAEL_LEDGER.forgiveEvery;
    const pages = collect('vael:pageTurned');
    sim.step();
    assert.equal(pages.length, 1);
    assert.equal(v.book.forgiven, 1, 'one page closes one stain');
    assert.equal(vaelPaperTier(state).stains, 1);
    sim.step();
    assert.equal(pages.length, 1, 'the page turns once');
  } finally {
    sim.dispose();
  }
});

test('the sealed rider: a clean proven book earns the desk’s gift, opened on touch', () => {
  const { sim, state, player, visit, grants, collect } = boot();
  try {
    quiet(visit);
    const v = ensureVaelState(state);
    v.book.clauses = VAEL_LEDGER.giftMinClauses;
    const left = collect('vael:riderLeft');
    const opened = collect('vael:riderOpened');
    sim.step();
    assert.equal(left.length, 1, 'the desk leaves the rider');
    const pod = state.entities.get(v.giftPod.entityId);
    assert.equal(pod.data.vaelGift, true);
    pod.pos.x = player.pos.x + 50; pod.pos.z = player.pos.z;
    sim.step();
    assert.equal(opened.length, 1);
    assert.ok(grants.some((g) => g.reason === 'vael_rider_gift'), 'the rider pays the punctual');
    sim.step();
    assert.equal(opened.length, 1, 'the rider opens once');
  } finally {
    sim.dispose();
  }
});

// ── persistence / adversarial ─────────────────────────────────────────────────

test('save/load: the book survives a JSON round-trip and grants nothing for free', () => {
  const { sim, state, sys, visit, grants } = boot();
  try {
    quiet(visit);
    const v = ensureVaelState(state);
    const inv = sys._fileInvoice(state, { amount: 600, mass: 15, cause: 'test' });
    v.paid['done:cls:kept'] = 5; // a spent receipt from before the save
    const restored = JSON.parse(JSON.stringify(v));
    state.vael = restored;
    sim.step();
    const v2 = ensureVaelState(state);
    assert.equal(v2.invoices[0].id, inv.id, 'the open bill survives');
    assert.equal(v2.invoices[0].amount, 600);
    assert.equal(v2.paid['done:cls:kept'], 5, 'receipts survive');
    // A re-delivered completion cannot pay a second time.
    const clause = { id: 'cls:kept', kind: 'haul', state: 'signed', signedAt: 1 };
    v2.clauses.push(clause);
    sys._honorClause(state, clause);
    assert.equal(grants.filter((g) => g.reason === 'vael_haul:cls:kept').length, 0,
      'a spent receipt stays spent');
  } finally {
    sim.dispose();
  }
});

// ── review-regression coverage ────────────────────────────────────────────────

test('an anchor lost without release leaves no phantom mass — the desk refiles the debt', () => {
  const { sim, state, player, visit, collect } = boot({ contract: true });
  try {
    quiet(visit);
    tender(sim, 100, 0);
    sim.runTicks(Math.ceil(VAEL_LIEN.telegraphS * 60) + 2);
    const anchor = lienAnchorFor(state, player.id);
    assert.ok(anchor, 'clamped');
    assert.equal(player.mass, 24 + VAEL_LIEN.anchorMass);
    // A sector sweep / restore removes the metal with no kill event — the
    // silent-loss path every cull walks.
    anchor.alive = false;
    state.entities.delete(anchor.id);
    state.entityList.splice(state.entityList.indexOf(anchor), 1);
    const filed = collect('vael:invoiceFiled');
    sim.step();
    assert.equal(player.mass, 24, 'the phantom tonnes leave with the metal');
    assert.equal(player.data.lienMass || 0, 0, 'the hull stops carrying the addendum');
    assert.equal(filed.length, 1, 'the released lien is refiled, not forgiven');
    assert.equal(filed[0].cause, 'anchor_lost');
    const inv = vaelOpenInvoices(state)[0];
    assert.equal(inv.amount, Math.round(VAEL_LIEN.anchorMass * VAEL_LIEN.payoffPerTonne),
      'refiled at full value — the debt survives the sweep');
    assert.equal(Object.keys(ensureVaelState(state).liens).length, 0, 'the dead row is dropped');
  } finally {
    sim.dispose();
  }
});

test('a dead tender’s telegraph cannot fire on a recycled entity id', () => {
  const { sim, state, player, visit, collect } = boot({ contract: true });
  try {
    quiet(visit);
    const clamped = collect('vael:lienClamped');
    const t = tender(sim, 100, 0);
    sim.step();
    const v = ensureVaelState(state);
    assert.ok(v.telegraphs[t.id], 'the wind-up is armed');
    // The tender dies mid-wind-up and its id is recycled into a fresh occupant.
    t.alive = false;
    state.entities.delete(t.id);
    state.entityList.splice(state.entityList.indexOf(t), 1);
    const impostor = tender(sim, 100, 0);
    state.entities.delete(impostor.id);
    impostor.id = t.id;
    state.entities.set(impostor.id, impostor);
    // The stale latch is already due — if the impostor inherits it, the clamp
    // lands with zero wind-up.
    v.telegraphs[t.id].fireAt = state.simTime - 1;
    sim.step();
    assert.equal(lienAnchorFor(state, player.id), null, 'no clamp from a dead tender’s latch');
    assert.equal(clamped.length, 0);
    const fresh = v.telegraphs[impostor.id];
    assert.ok(fresh, 'the live tender arms its own wind-up');
    assert.equal(fresh.gen, impostor.occupantGeneration, 'the latch belongs to this occupant');
    assert.ok(fresh.fireAt > state.simTime - 1, 'the wind-up restarted, not inherited');
    sim.runTicks(Math.ceil(VAEL_LIEN.telegraphS * 60) + 2);
    assert.ok(lienAnchorFor(state, player.id), 'a real wind-up still clamps');
  } finally {
    sim.dispose();
  }
});

test('payoffLien/cutLienLoose with no pilot release nobody’s paper', () => {
  const { sim, state, player, sys, visit, charges } = boot({ contract: true });
  try {
    quiet(visit);
    tender(sim, 100, 0);
    sim.runTicks(Math.ceil(VAEL_LIEN.telegraphS * 60) + 2);
    assert.ok(lienAnchorFor(state, player.id));
    const row = sys._postDebtor(state); // a second, NPC-held lien
    assert.ok(lienAnchorFor(state, row.entityId));
    // The pilot's body is gone — a settlement call must not sweep the sector.
    state.entities.delete(player.id);
    state.entityList.splice(state.entityList.indexOf(player), 1);
    assert.equal(sys.payoffLien(state), 0, 'no pilot, no payoff');
    assert.equal(sys.cutLienLoose(state), 0, 'no pilot, no cut');
    assert.equal(charges.length, 0, 'nothing billed');
    assert.ok(lienAnchorFor(state, row.entityId), 'the debtor still wears its clamp');
    assert.equal(Object.keys(ensureVaelState(state).liens).length, 2, 'both liens stand');
  } finally {
    sim.dispose();
  }
});

test('a settlement re-entered inside the serve clamp cannot double-bill the invoice', () => {
  const { sim, state, player, sys, visit, bus, charges, collect } = boot();
  try {
    quiet(visit);
    const inv = sys._fileInvoice(state, { amount: 400, mass: 10, cause: 'test' });
    inv.stage = 2;
    inv.nextWritAt = state.simTime;
    sim.step();
    const writ = ensureVaelState(state).writs[0];
    const tenderBody = state.entities.get(writ.tenderId);
    tenderBody.pos.x = player.pos.x + 40;
    tenderBody.pos.z = player.pos.z;
    sim.step(); // telegraph armed
    // Pay the bill from inside the clamp's own emit — the re-entrant call must
    // read the invoice as already served, never as open paper.
    const paid = [];
    bus.on('vael:lienClamped', () => {
      if (paid.length === 0) paid.push(sys.payInvoice(state, { invoiceId: inv.id }));
    });
    const served = collect('vael:writServed');
    sim.runTicks(Math.ceil(VAEL_LEDGER.writTelegraphS * 60) + 2);
    assert.equal(served.length, 1, 'the serve lands');
    assert.equal(inv.state, 'served', 'the paper reads served, not paid-over');
    assert.equal(paid.length, 1);
    assert.equal(paid[0], 0, 'the re-entrant settle was refused — one bill, one shape');
    assert.equal(charges.length, 0, 'no charge slipped through the latch');
  } finally {
    sim.dispose();
  }
});

test('a re-entrant cut inside the invoice emit cannot file the same anchor twice', () => {
  const { sim, state, player, sys, visit, bus, collect } = boot({ contract: true });
  try {
    quiet(visit);
    tender(sim, 100, 0);
    sim.runTicks(Math.ceil(VAEL_LIEN.telegraphS * 60) + 2);
    assert.ok(lienAnchorFor(state, player.id));
    const inner = [];
    bus.on('vael:invoiceFiled', () => inner.push(sys.cutLienLoose(state)));
    const filed = collect('vael:invoiceFiled');
    const cuts = sys.cutLienLoose(state);
    assert.equal(cuts, 1);
    assert.equal(inner.length, 1, 'the emit re-entered once');
    assert.equal(inner[0], 0, 'the metal was already gone — no second filing');
    assert.equal(filed.length, 1, 'one invoice for one cut');
  } finally {
    sim.dispose();
  }
});

test('a patrol tender carries the lien anchor — the contract clamp exists in production', () => {
  const { sim, state, player, sys, visit, collect } = boot({ contract: true });
  try {
    quiet(visit);
    const row = sys._postPatrol(state, HOME, sys._scan(state));
    assert.equal(row.kind, 'tender', 'the first patrol posts a tender');
    const body = state.entities.get(row.entityId);
    assert.equal(body.data.overrideTender, true, 'the hull carries the anchor tag the telegraph scans');
    const telegraphs = collect('vael:lienTelegraph');
    body.pos.x = player.pos.x + 100;
    body.pos.z = player.pos.z;
    sim.step();
    assert.equal(telegraphs.length, 1, 'the patrol tender telegraphs mid-contract');
    sim.runTicks(Math.ceil(VAEL_LIEN.telegraphS * 60) + 2);
    assert.ok(lienAnchorFor(state, player.id), 'the production tender can serve the lien');
  } finally {
    sim.dispose();
  }
});

test('a debtor’s own clamp is paper, not a witness — cold collects pay base', () => {
  const { sim, state, player, sys, visit, bus, grants, collect } = boot();
  try {
    quiet(visit);
    const row = sys._postDebtor(state);
    const debtor = state.entities.get(row.entityId);
    assert.ok(lienAnchorFor(state, debtor.id), 'the debtor still wears its clamp');
    const collected = collect('vael:debtorCollected');
    debtor.alive = false;
    killBy(bus, debtor.id, player.id, { pos: { ...debtor.pos } });
    assert.equal(collected.length, 1);
    assert.equal(collected[0].witnessed, false, 'the debtor’s own paper does not testify');
    const fee = grants.find((g) => g.reason === `vael_debtor:${row.id}`);
    assert.equal(fee.amount, VAEL_LEDGER.debtorCollectCr, 'unwitnessed pays the base fee');
  } finally {
    sim.dispose();
  }
});

test('the ledger rides its own serialize seam; a payload-less restore wipes bleed-over', () => {
  const { sim, state, sys, visit } = boot();
  try {
    quiet(visit);
    const inv = sys._fileInvoice(state, { amount: 600, mass: 15, cause: 'test' });
    ensureVaelState(state).book.clauses = 4;
    const snap = sys.serialize();
    state.vael.invoices = [];
    state.vael.book = { clauses: 0, stains: 9 };
    sys.deserialize(JSON.parse(JSON.stringify(snap)));
    const v = ensureVaelState(state);
    assert.equal(v.invoices[0].id, inv.id, 'the open bill round-trips through the seam');
    assert.equal(v.book.clauses, 4, 'the book round-trips');
    assert.equal(v.book.stains, 0, 'the hostile stains in live state are replaced');
    // A save that carried no ledger: the restored run keeps nothing from before.
    sys._restoredFromSave = false;
    sys._afterRestore();
    assert.equal(ensureVaelState(state).invoices.length, 0, 'no-payload restore wipes, not merges');
    assert.equal(ensureVaelState(state).book.clauses, 0);
  } finally {
    sim.dispose();
  }
});

test('vaelBook is a detached read-model — poking it cannot write the ledger', () => {
  const { sim, state, sys, visit } = boot();
  try {
    quiet(visit);
    sys._fileInvoice(state, { amount: 700, mass: 10, cause: 'test' });
    sys._postClause(state, 'haul');
    const book = vaelBook(state);
    assert.equal(book.openInvoices, 1);
    assert.equal(book.invoiceTotal, 700);
    book.invoices[0].amount = 1;
    book.paper.tier = 99;
    book.clauses.push({ id: 'forged' });
    const book2 = vaelBook(state);
    assert.equal(book2.invoices[0].amount, 700, 'the ledger did not move');
    assert.equal(vaelPaperTier(state).tier, 0);
    assert.equal(book2.clauses.length, 1, 'the board read is a copy');
  } finally {
    sim.dispose();
  }
});

// ── second-pass review regressions ────────────────────────────────────────────

test('a turned page fires once — earned pages with no closable stain never re-fire', () => {
  const { sim, state, visit, collect } = boot();
  try {
    quiet(visit);
    const v = ensureVaelState(state);
    // A clean book earns a page with nothing to forgive — nothing may speak.
    v.book.clauses = VAEL_LEDGER.forgiveEvery;
    v.book.stains = 0;
    const pages = collect('vael:pageTurned');
    sim.step(); sim.step(); sim.step();
    assert.equal(pages.length, 0, 'a clean book has no page to turn');
    assert.equal(v.book.forgiven, 0);
    // Earned pages outnumber the stains: one closes, then the book goes quiet
    // — before the latch, this barked and filed a log row every tick forever.
    v.book.clauses = VAEL_LEDGER.forgiveEvery * 3;
    v.book.stains = 1;
    sim.step();
    assert.equal(pages.length, 1, 'the open stain closes once');
    assert.equal(v.book.forgiven, 1);
    sim.step(); sim.step(); sim.step();
    assert.equal(pages.length, 1, 'a turned page does not re-turn every tick');
    // A fresh stain the earned pages already cover closes on the next read.
    v.book.stains = 2;
    sim.step();
    assert.equal(pages.length, 2, 'a new stain meets the earned page once');
    assert.equal(v.book.forgiven, 2);
    sim.step();
    assert.equal(pages.length, 2);
  } finally {
    sim.dispose();
  }
});

test('a stale writ telegraph on a recycled tender id cannot serve with no wind-up', () => {
  const { sim, state, player, sys, visit, collect } = boot();
  try {
    quiet(visit);
    const inv = sys._fileInvoice(state, { amount: 400, mass: 10, cause: 'test' });
    inv.stage = 2;
    inv.nextWritAt = state.simTime;
    sim.step();
    const writ = ensureVaelState(state).writs[0];
    const crew = state.entities.get(writ.tenderId);
    crew.pos.x = player.pos.x + 40;
    crew.pos.z = player.pos.z;
    // A ghost latch — a stale bag row or a recycled id — past-due on the crew's
    // number but belonging to no writ this crew serves.
    ensureVaelState(state).writTelegraphs[crew.id] = {
      tenderId: crew.id, targetId: player.id, writId: 'writ:ghost',
      fireAt: state.simTime - 1,
    };
    const served = collect('vael:writServed');
    sim.step();
    assert.equal(served.length, 0, 'the ghost latch cannot serve');
    assert.equal(inv.state, 'open', 'the paper was never touched');
    const fresh = ensureVaelState(state).writTelegraphs[crew.id];
    assert.ok(fresh && fresh.writId === writ.id, 'the live crew arms its own wind-up');
    sim.runTicks(Math.ceil(VAEL_LEDGER.writTelegraphS * 60) + 2);
    assert.equal(served.length, 1, 'a real wind-up still serves');
    assert.equal(inv.state, 'served');
  } finally {
    sim.dispose();
  }
});

test('the lien serves only in open space — a non-flight contract telegraph never arms', () => {
  const { sim, state, player, visit, collect } = boot({ contract: true, mode: 'station' });
  try {
    quiet(visit);
    tender(sim, 100, 0); // inside clampRange with a contract job running
    const telegraphs = collect('vael:lienTelegraph');
    sim.step();
    assert.equal(Object.keys(ensureVaelState(state).telegraphs).length, 0,
      'no wind-up while the pilot is not flying');
    assert.equal(telegraphs.length, 0);
    assert.equal(lienAnchorFor(state, player.id), null);
    state.mode = 'flight';
    sim.step();
    assert.equal(telegraphs.length, 1, 'back in open space the tender reads its clause');
    sim.runTicks(Math.ceil(VAEL_LIEN.telegraphS * 60) + 2);
    assert.ok(lienAnchorFor(state, player.id), 'the wind-up still lands in flight');
  } finally {
    sim.dispose();
  }
});

test('a late kill event on an already-healed anchor cannot re-bill or re-strip', () => {
  const { sim, state, player, visit, bus, collect, sys } = boot({ contract: true });
  try {
    quiet(visit);
    tender(sim, 100, 0);
    sim.runTicks(Math.ceil(VAEL_LIEN.telegraphS * 60) + 2);
    const anchor = lienAnchorFor(state, player.id);
    assert.ok(anchor);
    assert.equal(player.mass, 24 + VAEL_LIEN.anchorMass);
    const filed = collect('vael:invoiceFiled');
    // The silent death — alive=false, no kill event yet: the heal files the paper.
    anchor.alive = false;
    sys._tickAnchors(state, 1 / 60); // heal now, corpse still addressable
    assert.equal(filed.length, 1);
    assert.equal(filed[0].cause, 'anchor_lost');
    assert.equal(player.mass, 24);
    assert.equal(anchor.data.lienReleased, true, 'the accounted corpse is stamped');
    // The kill event arrives late — before the corpse sweep. One bill, not two.
    killBy(bus, anchor.id, player.id);
    assert.equal(filed.length, 1, 'no second filing on the released corpse');
    assert.equal(player.mass, 24, 'the release cannot strip the mass twice');
    sim.step();
    assert.equal(vaelOpenInvoices(state).length, 1);
    assert.equal(player.mass, 24);
  } finally {
    sim.dispose();
  }
});

// ── third-pass review regressions ─────────────────────────────────────────────

test('malformed wind-ups heal on sight — a garbage latch cannot wedge a live tender', () => {
  const { sim, state, player, visit, collect } = boot({ contract: true });
  try {
    quiet(visit);
    const t = tender(sim, 100, 0);
    const v = ensureVaelState(state);
    // Torn/hostile bag rows: a non-finite fireAt can never fire, yet sitting
    // latched it would block the tender's own wind-up forever.
    v.telegraphs[t.id] = { tenderId: t.id, fireAt: 'never' };
    v.telegraphs['junk-key'] = 'not-an-object';
    v.writTelegraphs['ghost'] = { tenderId: 99, fireAt: 'never' }; // no writId
    v.writTelegraphs['dead-writ'] = { tenderId: 97, writId: 'writ:gone', fireAt: state.simTime };
    const telegraphs = collect('vael:lienTelegraph');
    sim.step();
    assert.equal(v.telegraphs['junk-key'], undefined, 'non-object row dropped');
    assert.equal(v.writTelegraphs['ghost'], undefined, 'a wind-up must name its writ');
    assert.equal(v.writTelegraphs['dead-writ'], undefined, 'a wind-up dies with its paper');
    const fresh = v.telegraphs[t.id];
    assert.ok(fresh && Number.isFinite(fresh.fireAt),
      'the live tender arms its own countdown instead of inheriting a dead latch');
    assert.equal(telegraphs.length, 1, 'the real wind-up still speaks once');
    sim.runTicks(Math.ceil(VAEL_LIEN.telegraphS * 60) + 2);
    assert.ok(lienAnchorFor(state, player.id), 'and it still clamps');
  } finally {
    sim.dispose();
  }
});

test('a forged high-water tier mark re-syncs to the clauses actually honored', () => {
  const { sim, state, player, sys, visit, collect } = boot();
  try {
    quiet(visit);
    const v = ensureVaelState(state);
    // The bag claims kept-party crossings the book never earned — every future
    // paperTier emit would stay silenced below the forged mark.
    v.book.clauses = VAEL_PAPER_TIERS[3].clauses - 1;
    v.book.tier = VAEL_PAPER_TIERS[3].tier;
    sim.step();
    assert.equal(v.book.tier, vaelTierFor(v.book.clauses).tier,
      'the announce mark reconciles to earned paper');
    const tierEvents = collect('vael:paperTier');
    const clause = sys._postClause(state, 'serve');
    const defaulter = state.entities.get(clause.targetId);
    player.pos.x = defaulter.pos.x + VAEL_LEDGER.serveR - 60;
    player.pos.z = defaulter.pos.z;
    sim.step(); sim.step(); // sign, then serve
    assert.equal(clause.state, 'done');
    assert.equal(tierEvents.length, 1, 'the real crossing still gets to speak');
    assert.equal(tierEvents[0].tier, VAEL_PAPER_TIERS[3].tier);
  } finally {
    sim.dispose();
  }
});

test('closing a writ mid-iteration cannot skip the next crew — gc copies the list', () => {
  const { sim, state, sys, visit, collect } = boot();
  try {
    quiet(visit);
    const v = ensureVaelState(state);
    // Five closed rows ahead of two live crews: the first close splices one
    // out and a live iteration would step over the second crew entirely.
    for (let i = 0; i < 5; i++) {
      v.writs.push({ id: `writ:old${i}`, invoiceId: `inv:old${i}`, state: 'spent' });
    }
    const invA = sys._fileInvoice(state, { amount: 100, mass: 5, cause: 'test' });
    const invB = sys._fileInvoice(state, { amount: 200, mass: 5, cause: 'test' });
    const writA = sys._postWrit(state, invA);
    const writB = sys._postWrit(state, invB);
    // Both tenders die the same night — both crews must break on one sweep.
    for (const w of [writA, writB]) {
      const t = state.entities.get(w.tenderId);
      t.alive = false;
    }
    const closed = collect('vael:writClosed');
    sim.step();
    assert.equal(writA.state, 'broken');
    assert.equal(writB.state, 'broken', 'the second crew was not skipped');
    assert.equal(closed.length, 2);
  } finally {
    sim.dispose();
  }
});

test('a recovery debtor does not flee its own clamp — only real Vael signatures', () => {
  const { sim, state, player, sys, visit } = boot();
  try {
    quiet(visit);
    const clause = sys._postClause(state, 'recovery');
    const debtor = state.entities.get(clause.targetId);
    assert.ok(lienAnchorFor(state, debtor.id), 'the mark carries its clamp');
    player.pos.x = debtor.pos.x + 100; player.pos.z = debtor.pos.z; // proximity signs
    sim.step();
    assert.equal(clause.state, 'signed');
    const steered = [];
    const orig = sys._steer;
    sys._steer = (s, e, ...rest) => { steered.push(e.id); return orig.call(sys, s, e, ...rest); };
    sim.step();
    sys._steer = orig;
    assert.equal(steered.filter((id) => id === debtor.id).length, 0,
      'the paper riding its hull is not a pursuer');
    // A live signature in reach still sends it running.
    tender(sim, debtor.pos.x + 300, debtor.pos.z);
    const again = [];
    sys._steer = (s, e, ...rest) => { again.push(e.id); return orig.call(sys, s, e, ...rest); };
    sim.step();
    sys._steer = orig;
    assert.ok(again.includes(debtor.id), 'a real tender still spooks it');
  } finally {
    sim.dispose();
  }
});
