// Consequence layer over the moral ledger: settlement offers, forgiveness, witnesses and
// testimony chains, the pressure tick, and the hail/news/digest feeds. Seeded, deterministic;
// drives a real bus for every emitted intent.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import {
  MORAL_MEMORY_MAX_DEBTS,
  MORAL_MEMORY_MAX_HAULER_RESCUES,
  MORAL_MEMORY_MAX_WITNESSES,
  MORAL_OFFER_TTL_S,
  MORAL_PRESSURE_PERIOD_S,
  MORAL_TICK_S,
  MORAL_WITNESS_MAX_GENERATION,
  MORAL_WITNESS_STALE_S,
  acceptMoralSettlement,
  declineMoralSettlement,
  deliverWitnessTestimony,
  ensureMoralMemory,
  forgiveMoralDebt,
  hailLineForMoralDebt,
  makeMoralSettlementOffer,
  markHaulerRescueThanked,
  markMoralDebtReturned,
  moralCauseTone,
  moralHailForFaction,
  moralLedgerSummary,
  moralMemorySystem,
  moralSettlementTerms,
  moralStandingOf,
  moralWitnessById,
  nextMoralDebt,
  nextMoralNewsSeed,
  pendingMoralDebt,
  propagateMoralWitness,
  publishMoralNewsStory,
  rememberHaulerRescue,
  rememberMoralDebt,
  rememberMoralWitness,
  revealMoralDebt,
  settleMoralDebt,
  tickMoralMemory,
  unreadHaulerRescue,
  witnessChainFor,
  witnessTestimonyTerms,
} from '../src/systems/moralMemory.js';

const SEED = 4242;
const ALL_EVENTS = [
  'moralMemory:witnessed', 'moralMemory:testimony', 'moralMemory:witnessPropagated',
  'moralMemory:witnessSoured', 'moralMemory:settlementOffered', 'moralMemory:settled',
  'moralMemory:settlementDeclined', 'moralMemory:settlementExpired',
  'moralMemory:forgiven', 'moralMemory:escalated',
  'faction:repDelta', 'economy:chargeCredits', 'economy:grantCredits', 'news:publish',
];

function freshState(seed = SEED, simTime = 0) {
  return {
    simTime,
    tick: Math.max(0, Math.round(simTime * 60)),
    meta: { seed },
    story: { flags: {} },
    world: { currentSectorId: 'sector_test' },
    player: { credits: 100000 },
  };
}

function freshBus() {
  const bus = createBus();
  const events = [];
  for (const name of ALL_EVENTS) bus.on(name, (p) => events.push({ name, p }));
  return {
    bus,
    events,
    of(name) { return events.filter((e) => e.name === name); },
  };
}

function debt(state, id, opts = {}) {
  return rememberMoralDebt(state, {
    id,
    name: opts.name || `Debtor ${id}`,
    cause: opts.cause || 'spared',
    factionId: opts.factionId || 'faction_reach',
    t: opts.t != null ? opts.t : state.simTime,
    escalationTier: opts.escalationTier,
    disposition: opts.disposition,
  });
}

// ── state normalization ────────────────────────────────────────────────────────────────────

test('ensureMoralMemory fills consequence fields on a legacy memory and stays idempotent', () => {
  const state = freshState();
  state.story.moralMemory = { schemaVersion: 1, mercyCount: 2, debts: {}, order: [] };
  const memory = ensureMoralMemory(state);
  assert.equal(memory.mercyCount, 2);
  assert.deepEqual(memory.witnesses, {});
  assert.deepEqual(memory.witnessOrder, []);
  assert.equal(memory.forgivenCount, 0);
  assert.equal(memory.testimonyCount, 0);
  assert.equal(memory.lastTickBucket, -1);
  ensureMoralMemory(state); // second pass must not reset populated fields
  memory.forgivenCount = 3;
  ensureMoralMemory(state);
  assert.equal(memory.forgivenCount, 3);
});

// ── settlement terms and offers ─────────────────────────────────────────────────────────────

test('settlement terms are deterministic, priced by visible fields, and never read disposition', () => {
  const a = freshState();
  const b = freshState();
  const da = debt(a, 'pilot-k', { cause: 'spared', t: 1 });
  const db = debt(b, 'pilot-k', { cause: 'spared', t: 1 });
  // Same seed but opposite forced dispositions: terms must be identical either way.
  da.seed = db.seed = 12345;
  da.disposition = 'ally';
  db.disposition = 'vengeful';
  assert.deepEqual(moralSettlementTerms(a, 'pilot-k'), moralSettlementTerms(b, 'pilot-k'));
  const terms = moralSettlementTerms(a, 'pilot-k');
  assert.equal(terms.debtId, 'pilot-k');
  assert.ok(Array.isArray(terms.options) && terms.options.length >= 2);
  const pay = terms.options.find((o) => o.id === 'pay');
  assert.ok(pay.costCr > 0 && pay.repDelta > 0);
  assert.ok(terms.options.every((o) => o.disposition === undefined), 'no disposition leak');
  assert.equal(moralSettlementTerms(a, 'nobody'), null);
  settleMoralDebt(a, 'pilot-k', 'custody');
  assert.equal(moralSettlementTerms(a, 'pilot-k'), null, 'a closed debt cannot be negotiated');
});

test('an opened offer emits once, dedupes, and never re-litigates', () => {
  const state = freshState();
  const { bus, of } = freshBus();
  debt(state, 'broker-d', { cause: 'moral_trap:cargo_is_weapons:turn_in', t: 0 });
  const offer = makeMoralSettlementOffer(state, 'broker-d', { bus });
  assert.ok(offer && offer.status === 'open');
  assert.equal(offer.id, 'moralOffer:broker-d');
  assert.ok(offer.expiresAt > offer.createdAt);
  assert.equal(of('moralMemory:settlementOffered').length, 1);
  const again = makeMoralSettlementOffer(state, 'broker-d', { bus });
  assert.equal(again, offer, 'an open offer is returned, not rebuilt');
  assert.equal(of('moralMemory:settlementOffered').length, 1);
  declineMoralSettlement(state, 'broker-d', { bus });
  assert.equal(makeMoralSettlementOffer(state, 'broker-d', { bus }), null, 'one negotiation per debt');
});

test('accepting the pay option charges credits, moves rep, and closes the account negotiated', () => {
  const state = freshState();
  const { bus, of } = freshBus();
  const d = debt(state, 'corsair-9', { cause: 'escaped_custody', t: 0 });
  makeMoralSettlementOffer(state, 'corsair-9', { bus });
  const terms = moralSettlementTerms(state, 'corsair-9');
  const pay = terms.options.find((o) => o.id === 'pay');
  const out = acceptMoralSettlement(state, 'corsair-9', { bus, optionId: 'pay' });
  assert.ok(out && out.option.id === 'pay');
  assert.equal(d.status, 'settled');
  assert.equal(d.settledHow, 'negotiated');
  assert.equal(d.offer.status, 'accepted');
  const charge = of('economy:chargeCredits');
  assert.equal(charge.length, 1);
  assert.equal(charge[0].p.amount, pay.costCr);
  assert.equal(charge[0].p.reason, 'moral_settlement:corsair-9');
  const rep = of('faction:repDelta');
  assert.equal(rep.length, 1);
  assert.equal(rep[0].p.factionId, 'faction_reach');
  assert.equal(rep[0].p.delta, pay.repDelta);
  assert.equal(of('moralMemory:settled').length, 1);
  assert.equal(pendingMoralDebt(state, 'corsair-9'), null);
  assert.equal(nextMoralDebt(state), null, 'a settled debt never returns');
  assert.equal(acceptMoralSettlement(state, 'corsair-9', { bus }), null, 'cannot settle twice');
});

test('the apology option settles pardoned for free; proud or hardened debtors refuse it', () => {
  const state = freshState();
  const { bus, of } = freshBus();
  const d = debt(state, 'meek-1', { cause: 'spared', t: 0 });
  d.seed = 16; // bit5 clear → not proud
  d.escalationTier = 1;
  makeMoralSettlementOffer(state, 'meek-1', { bus });
  const out = acceptMoralSettlement(state, 'meek-1', { bus, optionId: 'apologize' });
  assert.ok(out);
  assert.equal(d.settledHow, 'pardoned');
  assert.equal(of('economy:chargeCredits').length, 0, 'an apology costs no credits');
  assert.equal(of('faction:repDelta')[0].p.delta, 1);

  const state2 = freshState();
  const proud = debt(state2, 'proud-1', { cause: 'spared', t: 0 });
  proud.seed = 32; // bit5 set → proud
  const terms2 = moralSettlementTerms(state2, 'proud-1');
  assert.equal(terms2.proud, true);
  assert.equal(terms2.options.some((o) => o.id === 'apologize'), false);
  makeMoralSettlementOffer(state2, 'proud-1');
  assert.equal(acceptMoralSettlement(state2, 'proud-1', { optionId: 'apologize' }), null);

  const state3 = freshState();
  const hard = debt(state3, 'hard-1', { cause: 'executed_prisoner', t: 0 });
  hard.seed = 16;
  hard.escalationTier = 3;
  assert.equal(moralSettlementTerms(state3, 'hard-1').options.some((o) => o.id === 'apologize'), false,
    'a tier-3 grudge cannot be talked away');
});

test('declining an open offer offends a vengeful debtor: the debt hardens a tier', () => {
  const state = freshState();
  const { bus, of } = freshBus();
  const d = debt(state, 'grudge-2', { cause: 'spared', t: 0 });
  d.disposition = 'vengeful';
  d.escalationTier = 1;
  makeMoralSettlementOffer(state, 'grudge-2', { bus });
  const out = acceptMoralSettlement(state, 'grudge-2', { bus, optionId: 'walk' });
  assert.equal(out.offer.status, 'declined');
  assert.equal(d.escalationTier, 2);
  assert.equal(of('moralMemory:settlementDeclined').length, 1);
  assert.equal(of('moralMemory:escalated').length, 1);
  assert.equal(d.status, 'pending', 'the grudge is still live');

  const state2 = freshState();
  const ally = debt(state2, 'calm-2', { cause: 'spared', t: 0 });
  ally.disposition = 'ally';
  makeMoralSettlementOffer(state2, 'calm-2');
  declineMoralSettlement(state2, 'calm-2');
  assert.equal(ally.escalationTier, 1, 'an ally shrugs a declined offer');
});

test('an ignored offer expires on the tick; a vengeful debtor counts it as offense', () => {
  const state = freshState();
  const { bus, of } = freshBus();
  const d = debt(state, 'waited-3', { cause: 'spared', t: 0 });
  d.disposition = 'vengeful';
  d.escalationTier = 1;
  const offer = makeMoralSettlementOffer(state, 'waited-3', { bus });
  state.simTime = offer.expiresAt + 1;
  const tick = tickMoralMemory(state, { bus });
  assert.deepEqual(tick.expiredOffers, ['waited-3']);
  assert.equal(offer.status, 'expired');
  assert.equal(d.escalationTier, 2, 'the lapsed offer hardened the grudge');
  assert.equal(of('moralMemory:settlementExpired').length, 1);
  assert.equal(acceptMoralSettlement(state, 'waited-3', { bus }), null, 'expired offers cannot be taken');
});

// ── forgiveness ─────────────────────────────────────────────────────────────────────────────

test('forgiveness closes the account, counts on the standing, and cannot repeat', () => {
  const state = freshState();
  const { bus, of } = freshBus();
  const d = debt(state, 'twice-mercy', { cause: 'spared', t: 0 });
  const out = forgiveMoralDebt(state, 'twice-mercy', { bus, how: 'ransomed_free' });
  assert.equal(out, d);
  assert.equal(d.status, 'forgiven');
  assert.equal(d.forgivenHow, 'ransomed_free');
  assert.ok(Number.isFinite(d.forgivenAt));
  assert.equal(ensureMoralMemory(state).forgivenCount, 1);
  assert.equal(of('moralMemory:forgiven').length, 1);
  assert.equal(of('faction:repDelta')[0].p.delta, 1, 'mercy, seen');
  assert.equal(nextMoralDebt(state), null, 'a forgiven debt never returns');
  assert.equal(forgiveMoralDebt(state, 'twice-mercy', { bus }), null);
  // A revealed debt can still be forgiven; a returned one cannot.
  const d2 = debt(state, 'late-mercy', { cause: 'spared', t: 1 });
  revealMoralDebt(state, 'late-mercy');
  assert.equal(forgiveMoralDebt(state, 'late-mercy').status, 'forgiven');
  const d3 = debt(state, 'answered', { cause: 'spared', t: 2 });
  markMoralDebtReturned(state, 'answered');
  assert.equal(forgiveMoralDebt(state, 'answered'), null);
  assert.equal(ensureMoralMemory(state).forgivenCount, 2);
});

// ── witnesses and testimony chains ─────────────────────────────────────────────────────────

test('a witnessed deed mints a named witness bound to the debt, deterministically', () => {
  const a = freshState();
  const b = freshState();
  debt(a, 'pod-kill', { cause: 'executed_prisoner', t: 5 });
  debt(b, 'pod-kill', { cause: 'executed_prisoner', t: 5 });
  const wa = rememberMoralWitness(a, { debtId: 'pod-kill', kind: 'kin' });
  const wb = rememberMoralWitness(b, { debtId: 'pod-kill', kind: 'kin' });
  assert.equal(wa.id, wb.id);
  assert.equal(wa.name, wb.name, 'witness names are seed-stable');
  assert.equal(wa.disposition, 'hostile', 'kin of an executed debtor damn you');
  assert.deepEqual(wa.debtId, 'pod-kill');
  assert.deepEqual(witnessChainFor(a, 'pod-kill').map((w) => w.id), [wa.id]);
  // Sugar: a deed can carry its own witness.
  const c = freshState();
  rememberMoralDebt(c, {
    id: 'seen-spare', cause: 'spared', t: 1,
    witness: { kind: 'crew', name: 'Deckhand Pell' },
  });
  const chain = witnessChainFor(c, 'seen-spare');
  assert.equal(chain.length, 1);
  assert.equal(chain[0].name, 'Deckhand Pell');
  assert.equal(chain[0].disposition, 'sympathetic', 'a spared debtor\'s crew speaks kindly');
  // Orphan testimony still lands on the witness's own faction.
  const orphan = rememberMoralWitness(a, { id: 'lone-eye', factionId: 'faction_mts' });
  assert.equal(orphan.debtId, null);
  assert.equal(moralWitnessById(a, 'lone-eye'), orphan);
});

test('testimony moves faction standing once, previews honestly, and chains go public', () => {
  const state = freshState();
  const { bus, of } = freshBus();
  debt(state, 'spared-pilot', { cause: 'spared', t: 0, factionId: 'faction_reach' });
  const w1 = rememberMoralWitness(state, { debtId: 'spared-pilot', kind: 'crew', factionId: 'faction_mts' });
  const w2 = rememberMoralWitness(state, { debtId: 'spared-pilot', kind: 'kin' });
  const terms = witnessTestimonyTerms(state, w1.id);
  assert.equal(terms.repDelta, 2, 'sympathetic crew: +2');
  assert.deepEqual(terms.factions, [
    { factionId: 'faction_reach', delta: 2 },
    { factionId: 'faction_mts', delta: 1 },
  ]);
  deliverWitnessTestimony(state, w1.id, { bus });
  const rep = of('faction:repDelta');
  assert.equal(rep.length, 2);
  assert.deepEqual(rep.map((r) => r.p.factionId).sort(), ['faction_mts', 'faction_reach']);
  assert.equal(ensureMoralMemory(state).testimonyCount, 1);
  assert.equal(deliverWitnessTestimony(state, w1.id, { bus }), null, 'one testimony per witness');
  // kin of a mercy speaks louder (+3); the second telling on one debt is news.
  const terms2 = witnessTestimonyTerms(state, w2.id);
  assert.equal(terms2.repDelta, 3);
  deliverWitnessTestimony(state, w2.id, { bus });
  assert.equal(of('news:publish').length, 1, 'word travels the band');
  assert.match(of('news:publish')[0].p.text, /another voice|second telling/i,
    'the headline is the second telling, not just any line naming the debt');
  assert.equal(of('moralMemory:testimony').length, 2);
  // Hostile testimony damns.
  debt(state, 'burned-crew', { cause: 'mutineers_burned', t: 1 });
  const hostile = rememberMoralWitness(state, { debtId: 'burned-crew', kind: 'crew' });
  assert.equal(hostile.disposition, 'hostile');
  const before = of('faction:repDelta').length;
  deliverWitnessTestimony(state, hostile.id, { bus });
  const damnation = of('faction:repDelta').slice(before).find((r) => r.p.factionId === 'faction_reach');
  assert.ok(damnation && damnation.p.delta < 0, 'a hostile witness lowers standing');
});

test('testimony propagates one generation closer to the debtor\'s people, then stops', () => {
  const state = freshState();
  const { bus, of } = freshBus();
  debt(state, 'far-debt', { cause: 'spared', t: 0, factionId: 'faction_reach' });
  const parent = rememberMoralWitness(state, { debtId: 'far-debt', factionId: 'faction_mts', kind: 'broker' });
  assert.equal(propagateMoralWitness(state, parent.id), null, 'the unheard cannot gossip');
  deliverWitnessTestimony(state, parent.id, { bus });
  const child = propagateMoralWitness(state, parent.id, { bus });
  assert.ok(child);
  assert.equal(child.generation, 1);
  assert.equal(child.parentId, parent.id);
  assert.equal(parent.childId, child.id);
  assert.equal(child.factionId, 'faction_reach', 'the story travels toward the debtor\'s people');
  assert.equal(child.status, 'open');
  assert.equal(of('moralMemory:witnessPropagated').length, 1);
  assert.equal(propagateMoralWitness(state, parent.id), null, 'one child per witness');
  // Generation fades the word: gen-1 testimony is weaker than gen-0.
  deliverWitnessTestimony(state, child.id, { bus });
  const grandchild = propagateMoralWitness(state, child.id, { bus });
  assert.equal(grandchild.generation, 2);
  const childTerms = witnessTestimonyTerms(state, grandchild.id);
  assert.equal(childTerms.repDelta, 1, 'each retelling fades');
  // The chain cap holds.
  let cursor = grandchild;
  while (cursor && (cursor.generation | 0) < MORAL_WITNESS_MAX_GENERATION) {
    deliverWitnessTestimony(state, cursor.id, { bus });
    cursor = propagateMoralWitness(state, cursor.id, { bus });
  }
  assert.equal(cursor.generation, MORAL_WITNESS_MAX_GENERATION);
  deliverWitnessTestimony(state, cursor.id, { bus });
  assert.equal(propagateMoralWitness(state, cursor.id), null, 'generation cap reached');
});

test('unheard witnesses sour on the tick and their testimony halves', () => {
  const state = freshState();
  const { bus, of } = freshBus();
  debt(state, 'stale-debt', { cause: 'spared', t: 0 });
  const w = rememberMoralWitness(state, { debtId: 'stale-debt', kind: 'kin' });
  assert.equal(witnessTestimonyTerms(state, w.id).repDelta, 3);
  state.simTime = MORAL_WITNESS_STALE_S + 1;
  const tick = tickMoralMemory(state, { bus });
  assert.deepEqual(tick.souredWitnesses, [w.id]);
  assert.equal(of('moralMemory:witnessSoured').length, 1);
  const terms = witnessTestimonyTerms(state, w.id);
  assert.equal(terms.soured, true);
  assert.equal(terms.repDelta, 1, 'a soured witness\'s word halves');
});

// ── the pressure tick ───────────────────────────────────────────────────────────────────────

test('an unanswered vengeful debt hardens on the pressure clock, capped, and allies do not', () => {
  const state = freshState();
  const { bus, of } = freshBus();
  const grim = debt(state, 'grim-1', { cause: 'spared', t: 0 });
  grim.disposition = 'vengeful';
  const calm = debt(state, 'calm-1', { cause: 'spared', t: 0 });
  calm.disposition = 'ally';
  const pod = debt(state, 'pod-1', { cause: 'captured_survivors', t: 0 });
  pod.disposition = 'vengeful';

  state.simTime = MORAL_PRESSURE_PERIOD_S;
  const first = tickMoralMemory(state, { bus });
  assert.deepEqual(first.escalated, ['grim-1']);
  assert.equal(grim.escalationTier, 2);
  assert.equal(calm.escalationTier, 1, 'allies do not harden');
  assert.equal(pod.escalationTier, 1, 'a non-returnable cause does not escalate');
  assert.equal(of('moralMemory:escalated').length, 1);

  // Second pressure step needs a full tier-scaled period from the last bump.
  state.simTime = MORAL_PRESSURE_PERIOD_S + MORAL_PRESSURE_PERIOD_S;
  tickMoralMemory(state, { bus });
  assert.equal(grim.escalationTier, 2, 'tier-2 pressure needs a longer silence');
  state.simTime = MORAL_PRESSURE_PERIOD_S + 2 * MORAL_PRESSURE_PERIOD_S + 1;
  tickMoralMemory(state, { bus });
  assert.equal(grim.escalationTier, 3);
  assert.equal(grim.pressureEscalations, 2);
  state.simTime += 10 * MORAL_PRESSURE_PERIOD_S;
  tickMoralMemory(state, { bus });
  assert.equal(grim.escalationTier, 3, 'tier caps at 3');
  assert.equal(grim.pressureEscalations, 2, 'pressure steps are bounded');

  // Bucketing: same bucket, no work.
  state.simTime += 1;
  const still = tickMoralMemory(state, { bus });
  assert.equal(still, null, 'same sim bucket, no re-tick');
});

// ── feeds: hails, news, standing, digest ────────────────────────────────────────────────────

test('hail lines are deterministic, name the debtor, and pending debts never leak disposition', () => {
  const state = freshState();
  const ally = debt(state, 'warm-hail', { cause: 'spared', t: 0 });
  const grim = debt(state, 'cold-hail', { cause: 'spared', t: 0 });
  ally.disposition = 'ally';
  grim.disposition = 'vengeful';
  const pendingA = hailLineForMoralDebt(state, 'warm-hail');
  const pendingB = hailLineForMoralDebt(state, 'cold-hail');
  assert.ok(pendingA.includes('warm-hail'));
  assert.equal(pendingA, hailLineForMoralDebt(state, 'warm-hail'), 'same debt, same hail');
  assert.doesNotMatch(pendingA + pendingB, /coming back|debt of teeth/,
    'an unrevealed debtor\'s heart stays sealed');
  revealMoralDebt(state, 'cold-hail');
  const revealed = hailLineForMoralDebt(state, 'cold-hail');
  assert.match(revealed, /cold-hail/);
  assert.match(revealed, /spared|mercy|coming back|teeth/);
  const d = debt(state, 'absolved', { cause: 'spared', t: 1 });
  forgiveMoralDebt(state, 'absolved');
  assert.match(hailLineForMoralDebt(state, 'absolved'), /absolved/);
  assert.equal(hailLineForMoralDebt(state, 'ghost'), null);
  const hail = moralHailForFaction(state, 'faction_reach');
  assert.ok(hail && hail.debtId === 'warm-hail', 'the faction remembers the oldest open account');
  assert.equal(moralHailForFaction(state, 'faction_quiet'), null);
  void d;
});

test('the news desk publishes the finished stories once, vengeful first', () => {
  const state = freshState();
  const { bus, of } = freshBus();
  const veng = debt(state, 'blood-answer', { cause: 'spared', t: 0 });
  veng.disposition = 'vengeful';
  markMoralDebtReturned(state, 'blood-answer');
  const quiet = debt(state, 'closed-books', { cause: 'moral_trap:cargo_is_weapons:turn_in', t: 1 });
  settleMoralDebt(state, 'closed-books', 'negotiated');
  debt(state, 'pod-noise', { cause: 'abandoned_survivors', t: 2 }); // pods have their own voice
  markMoralDebtReturned(state, 'pod-noise');

  assert.equal(nextMoralNewsSeed(state).id, 'blood-answer');
  const first = publishMoralNewsStory(state, { bus });
  assert.match(first.text, /blood-answer/);
  assert.equal(of('news:publish').length, 1);
  assert.equal(of('news:publish')[0].p.id, 'moral-news:blood-answer');
  assert.equal(nextMoralNewsSeed(state).id, 'closed-books', 'the cited story never repeats');
  const second = publishMoralNewsStory(state, { bus });
  assert.match(second.text, /closed-books/);
  assert.equal(nextMoralNewsSeed(state), null, 'pod accounts do not make ledger news');
  assert.equal(publishMoralNewsStory(state, { bus }), null);
  assert.equal(of('news:publish').length, 2);
});

test('the standing and the digest count mercy against harm without leaking open dispositions', () => {
  const empty = freshState();
  assert.equal(moralStandingOf(empty).standing, 'unwritten');
  const kind = freshState();
  debt(kind, 'm1', { cause: 'spared', t: 0 });
  debt(kind, 'm2', { cause: 'accepted_surrender', t: 1 });
  assert.equal(moralStandingOf(kind).standing, 'merciful');
  debt(kind, 'h1', { cause: 'executed_prisoner', t: 2 });
  debt(kind, 'h2', { cause: 'ransomed_survivors', t: 3 });
  debt(kind, 'h3', { cause: 'abandoned_survivors', t: 4 });
  assert.equal(moralStandingOf(kind).standing, 'feared');
  debt(kind, 'm3', { cause: 'rescued_survivors', t: 5 });
  debt(kind, 'm4', { cause: 'spared_escape', t: 6 });
  const standing = moralStandingOf(kind);
  assert.equal(standing.standing, 'complicated');
  assert.equal(standing.mercy, 4);
  assert.equal(standing.harm, 3);

  const summary = moralLedgerSummary(kind);
  assert.equal(summary.mercyCount, 7);
  assert.equal(summary.pending, 7);
  assert.ok(summary.pendingReturnable >= 5, 'returnable causes counted, pods not');
  assert.equal(summary.openOffers, 0);
  assert.equal(summary.openWitnesses, 0);
  assert.equal(summary.standing, 'complicated');
  assert.equal(summary.oldestPendingAt, 0);
  assert.ok(!('allies' in summary) && !('vengeful' in summary), 'no disposition leak in the digest');
  assert.equal(moralCauseTone('spared'), 'mercy');
  assert.equal(moralCauseTone('executed_prisoner'), 'harm');
  assert.equal(moralCauseTone('moral_trap:x:y'), 'neutral');
});

// ── the opt-in system object ────────────────────────────────────────────────────────────────

test('moralMemorySystem wires the action verbs to the bus and ticks the clock', () => {
  const state = freshState();
  const { bus, of } = freshBus();
  const sys = Object.create(moralMemorySystem);
  sys.init({ state, bus, helpers: {} });
  debt(state, 'verb-debt', { cause: 'spared', t: 0 });

  bus.emit('moralMemory:witness', { debtId: 'verb-debt', kind: 'crew', name: 'Saw It' });
  assert.equal(of('moralMemory:witnessed').length, 1);
  const witness = witnessChainFor(state, 'verb-debt')[0];
  bus.emit('moralMemory:testify', { witnessId: witness.id });
  assert.equal(of('moralMemory:testimony').length, 1);

  bus.emit('moralMemory:offer', { debtId: 'verb-debt' });
  assert.equal(of('moralMemory:settlementOffered').length, 1);
  bus.emit('moralMemory:settle', { debtId: 'verb-debt', optionId: 'pay' });
  assert.equal(of('moralMemory:settled').length, 1);
  assert.equal(state.story.moralMemory.debts['verb-debt'].status, 'settled');

  const d2 = debt(state, 'verb-mercy', { cause: 'spared', t: 1 });
  bus.emit('moralMemory:forgive', { id: 'verb-mercy', how: 'absolution' });
  assert.equal(d2.status, 'forgiven');

  const d3 = debt(state, 'verb-grudge', { cause: 'spared', t: 0 });
  d3.disposition = 'vengeful';
  state.simTime = MORAL_PRESSURE_PERIOD_S + MORAL_TICK_S;
  sys.update(1 / 60, state);
  assert.equal(d3.escalationTier, 2, 'update runs the pressure clock');

  bus.emit('moralMemory:news', {});
  sys.destroy();
  const testified = of('faction:repDelta').length;
  bus.emit('moralMemory:forgive', { id: 'verb-debt' });
  assert.equal(of('faction:repDelta').length, testified, 'destroy unsubscribes');
});

// ── save round-trip ─────────────────────────────────────────────────────────────────────────

test('the whole consequence layer survives a JSON save round-trip', () => {
  const state = freshState();
  const { bus } = freshBus();
  const d = debt(state, 'saved-debt', { cause: 'executed_prisoner', t: 3 });
  rememberMoralWitness(state, { debtId: 'saved-debt', kind: 'kin' }, { bus });
  makeMoralSettlementOffer(state, 'saved-debt', { bus });
  const saved = JSON.parse(JSON.stringify({ story: state.story }));
  const restored = { story: saved.story, meta: { seed: SEED }, simTime: 3, player: { credits: 100000 } };
  const rdebt = restored.story.moralMemory.debts['saved-debt'];
  assert.equal(rdebt.offer.status, 'open');
  assert.equal(witnessChainFor(restored, 'saved-debt').length, 1);
  const out = acceptMoralSettlement(restored, 'saved-debt', { bus, optionId: 'pay' });
  assert.ok(out, 'an offer loaded from a save still resolves');
  assert.equal(rdebt.status, 'settled');
  const w = witnessChainFor(restored, 'saved-debt')[0];
  assert.ok(deliverWitnessTestimony(restored, w.id, { bus }), 'a witness loaded from a save still speaks');
  void d;
});

test('witness capacity evicts the oldest without corrupting chains', () => {
  const state = freshState();
  debt(state, 'host', { cause: 'spared', t: 0 });
  const ids = [];
  for (let i = 0; i < MORAL_MEMORY_MAX_WITNESSES + 4; i++) {
    ids.push(rememberMoralWitness(state, { debtId: 'host' }).id);
  }
  const memory = ensureMoralMemory(state);
  assert.equal(memory.witnessOrder.length, MORAL_MEMORY_MAX_WITNESSES);
  assert.equal(Object.keys(memory.witnesses).length, MORAL_MEMORY_MAX_WITNESSES);
  const chain = witnessChainFor(state, 'host');
  assert.equal(chain.length, MORAL_MEMORY_MAX_WITNESSES, 'evicted witnesses leave the chain');
  assert.equal(chain[0].id, ids[ids.length - MORAL_MEMORY_MAX_WITNESSES]);
});

// ── regression: wallet gate, lapse equivalence, offer heal, hauler bound ────────

test('a pilot who cannot pay — or whose wallet cannot be read — cannot settle', () => {
  const state = freshState();
  const { bus, of } = freshBus();
  debt(state, 'priced-1', { cause: 'spared', t: 0 });
  const offer = makeMoralSettlementOffer(state, 'priced-1', { bus });
  const cost = offer.options.find((o) => o.id === 'pay').costCr;
  assert.ok(cost > 0);
  state.player.credits = cost - 1;
  assert.equal(acceptMoralSettlement(state, 'priced-1', { bus, optionId: 'pay' }), null,
    'short credits refuses the priced option');
  assert.equal(offer.status, 'open', 'a refused price leaves the offer live');
  assert.equal(of('economy:chargeCredits').length, 0, 'no charge intent for an unpaid settle');
  assert.equal(state.story.moralMemory.debts['priced-1'].status, 'pending');

  // A wallet that cannot be read at all is broke, not a blank check.
  const bare = freshState();
  delete bare.player;
  debt(bare, 'priced-2', { cause: 'spared', t: 0 });
  makeMoralSettlementOffer(bare, 'priced-2', { bus });
  assert.equal(acceptMoralSettlement(bare, 'priced-2', { bus, optionId: 'pay' }), null,
    'a missing wallet does not settle for free');
  // …but closing the channel still costs nothing.
  const walked = acceptMoralSettlement(bare, 'priced-2', { bus, optionId: 'walk' });
  assert.ok(walked && walked.offer.status === 'declined', 'the free refusal still answers');
});

test('a stale offer expires identically no matter which path notices first', () => {
  // Lazy observe via accept: announced, and a vengeful debtor counts the offense.
  const state = freshState();
  const { bus, of } = freshBus();
  const d = debt(state, 'lazy-1', { cause: 'spared', t: 0 });
  d.disposition = 'vengeful';
  d.escalationTier = 1;
  const offer = makeMoralSettlementOffer(state, 'lazy-1', { bus });
  state.simTime = offer.expiresAt + 1;
  assert.equal(acceptMoralSettlement(state, 'lazy-1', { bus }), null);
  assert.equal(offer.status, 'expired');
  assert.equal(of('moralMemory:settlementExpired').length, 1, 'lazy expiry is announced too');
  assert.equal(d.escalationTier, 2, 'a vengeful debtor counts the lapsed offer either way');

  // Lazy observe via decline: the offer expires instead of declining.
  const state2 = freshState();
  const { bus: bus2, of: of2 } = freshBus();
  const d2 = debt(state2, 'lazy-2', { cause: 'spared', t: 0 });
  const o2 = makeMoralSettlementOffer(state2, 'lazy-2', { bus: bus2 });
  state2.simTime = o2.expiresAt + 1;
  assert.equal(declineMoralSettlement(state2, 'lazy-2', { bus: bus2 }), null);
  assert.equal(o2.status, 'expired');
  assert.equal(of2('moralMemory:settlementDeclined').length, 0, 'a lapsed offer cannot be declined');
  assert.equal(of2('moralMemory:settlementExpired').length, 1);
});

test('a damaged offer shell self-heals instead of wedging the debt', () => {
  const state = freshState();
  const d = debt(state, 'corrupt-1', { cause: 'spared', t: 0 });
  d.offer = { id: 'ghost', status: 'open' }; // no expiresAt, no options — a damaged save
  ensureMoralMemory(state);
  assert.equal(d.offer.status, 'expired', 'an open offer that can never lapse is closed');

  const d2 = debt(state, 'corrupt-2', { cause: 'spared', t: 0 });
  d2.offer = 'garbage';
  ensureMoralMemory(state);
  assert.equal(d2.offer, undefined, 'a non-object offer no longer blocks negotiation');
  assert.ok(makeMoralSettlementOffer(state, 'corrupt-2'), 'the debt can be negotiated again');

  // An 'open' offer on a closed account must never accept a charge — the heal
  // closes it before the verbs can spend on a settle that cannot land.
  const { bus, of } = freshBus();
  const d3 = debt(state, 'corrupt-3', { cause: 'spared', t: 0 });
  settleMoralDebt(state, 'corrupt-3', 'custody');
  d3.offer = {
    id: 'moralOffer:corrupt-3', status: 'open', expiresAt: 99999,
    options: [{ id: 'pay', kind: 'reparations', label: 'x', costCr: 50, repDelta: 3 }],
  };
  ensureMoralMemory(state);
  assert.equal(d3.offer.status, 'superseded', 'a dead account cannot host a live offer');
  assert.equal(acceptMoralSettlement(state, 'corrupt-3', { bus, optionId: 'pay' }), null);
  assert.equal(of('economy:chargeCredits').length, 0, 'no phantom charge on a closed debt');
  assert.equal(of('moralMemory:settled').length, 0);

  // A hostile option element — a non-finite price would slip the wallet gate —
  // expires the offer outright instead of settling free.
  const d4 = debt(state, 'corrupt-4', { cause: 'spared', t: 0 });
  d4.offer = {
    id: 'moralOffer:corrupt-4', status: 'open', expiresAt: 99999,
    options: [{ id: 'pay', kind: 'reparations', label: 'x', costCr: NaN, repDelta: 99 }],
  };
  ensureMoralMemory(state);
  assert.equal(d4.offer.status, 'expired');
  assert.equal(acceptMoralSettlement(state, 'corrupt-4', { bus, optionId: 'pay' }), null);
  assert.equal(of('economy:chargeCredits').length, 0);
  assert.equal(of('faction:repDelta').length, 0);

  // An empty options list is unusable too: nothing on it can ever be accepted.
  const d5 = debt(state, 'corrupt-5', { cause: 'spared', t: 0 });
  d5.offer = { id: 'moralOffer:corrupt-5', status: 'open', expiresAt: 99999, options: [] };
  ensureMoralMemory(state);
  assert.equal(d5.offer.status, 'expired');
  assert.equal(acceptMoralSettlement(state, 'corrupt-5', { bus, optionId: 'pay' }), null);
});

test('hauler rescues stay bounded, preferring to drop debts already thanked', () => {
  const state = freshState();
  for (let i = 0; i < MORAL_MEMORY_MAX_HAULER_RESCUES + 5; i++) {
    rememberHaulerRescue(state, { haulerKey: `h${i}`, t: i });
  }
  const memory = ensureMoralMemory(state);
  assert.equal(memory.haulerOrder.length, MORAL_MEMORY_MAX_HAULER_RESCUES);
  assert.equal(unreadHaulerRescue(state, 'h0'), null, 'the oldest rescue fell off the ledger');
  assert.ok(memory.debts['hauler-rescue:h5'], 'the cap keeps the newest rescues');
  assert.equal(moralLedgerSummary(state).remembered, MORAL_MEMORY_MAX_HAULER_RESCUES);
  // An already-thanked memory is evicted before a rescue still owed a nod.
  markHaulerRescueThanked(state, 'h47', 100);
  rememberHaulerRescue(state, { haulerKey: 'fresh', t: 999 });
  assert.equal(memory.debts['hauler-rescue:h47'], undefined, 'thanked paper drops first');
  assert.ok(unreadHaulerRescue(state, 'h5'), 'an unthanked rescue survives the thanked');
  // A save that predates the index rebuilds it on ensure.
  const legacy = freshState();
  legacy.story.moralMemory = {
    debts: { 'hauler-rescue:old': { id: 'hauler-rescue:old', cause: 'lane_hauler_rescued', recordedAt: 1, status: 'remembered' } },
    order: [],
  };
  ensureMoralMemory(legacy);
  assert.deepEqual(legacy.story.moralMemory.haulerOrder, ['hauler-rescue:old']);
  // The index heals like the sibling lists: duplicates, dangling ids, and
  // non-hauler entries drop out, and a rescue dropped from the index re-joins
  // it in recordedAt order.
  legacy.story.moralMemory.debts['hauler-rescue:new'] = { id: 'hauler-rescue:new', cause: 'lane_hauler_rescued', recordedAt: 2, status: 'remembered' };
  legacy.story.moralMemory.debts.impostor = { id: 'impostor', cause: 'spared', status: 'pending', recordedAt: 3 };
  legacy.story.moralMemory.haulerOrder = ['hauler-rescue:new', 'hauler-rescue:old', 'hauler-rescue:old', 'impostor', 'gone'];
  ensureMoralMemory(legacy);
  assert.deepEqual(legacy.story.moralMemory.haulerOrder, ['hauler-rescue:old', 'hauler-rescue:new']);
});

test('ensure dedupes and re-caps bloated index lists from a hostile save', () => {
  const state = freshState();
  debt(state, 'dup-1', { cause: 'spared', t: 0 });
  const w = rememberMoralWitness(state, { debtId: 'dup-1' });
  const memory = ensureMoralMemory(state);
  memory.order.push('dup-1', 'dup-1');
  for (let i = 0; i < MORAL_MEMORY_MAX_DEBTS + 3; i++) {
    memory.debts[`ghost-${i}`] = { id: `ghost-${i}`, cause: 'spared', status: 'settled', recordedAt: i };
    memory.order.push(`ghost-${i}`);
  }
  memory.witnessOrder.push(w.id, w.id);
  for (let i = 0; i < MORAL_MEMORY_MAX_WITNESSES + 3; i++) {
    memory.witnesses[`ghost-w-${i}`] = { id: `ghost-w-${i}`, status: 'open', debtId: 'dup-1', seenAt: 0 };
    memory.witnessOrder.push(`ghost-w-${i}`);
  }
  // Dangling entries spend no cap slots at all — they drop out before the bound counts.
  memory.order.unshift('nowhere', 'nowhere');
  memory.witnessOrder.unshift('nowhere-w');
  ensureMoralMemory(state);
  assert.equal(memory.order.length, MORAL_MEMORY_MAX_DEBTS, 'the load-time cap re-binds');
  assert.equal(memory.witnessOrder.length, MORAL_MEMORY_MAX_WITNESSES);
  assert.equal(memory.order.filter((x) => x === 'ghost-4').length, 1, 'no duplicated index entry');
  assert.equal(memory.order.includes('nowhere'), false, 'dangling ids spend no cap slot');
  assert.equal(memory.debts['dup-1'], undefined, 'the oldest entry still evicts under the cap');
  assert.equal(memory.witnesses[w.id], undefined, 'witness eviction crosses the cap identically');
  assert.equal(moralLedgerSummary(state).pending, 0, 'the digest counts each debt once');
  // Magic keys cannot wedge the maps: an inherited name is a fresh debt, and a
  // '__proto__' id stores as a real row instead of re-prototyping the map.
  assert.ok(rememberMoralDebt(state, { id: 'constructor', cause: 'spared', t: 0 }),
    'an inherited member name still records a debt');
  const proto = rememberMoralDebt(state, { id: '__proto__', cause: 'spared', t: 0 });
  assert.ok(proto && proto.id === '__proto__');
  assert.equal(Object.hasOwn(state.story.moralMemory.debts, '__proto__'), true,
    'a __proto__ id is a stored row, not a prototype swap');
  assert.equal(JSON.parse(JSON.stringify(state.story.moralMemory.debts)).__proto__.id, '__proto__',
    'the magic-key row still round-trips through a save');
});

test('hostile map poison heals instead of wedging or posing as a record', () => {
  // A primitive story must not crash the normalizer (strict-mode assignment on 5 throws).
  const primitive = freshState();
  primitive.story = 5;
  assert.ok(ensureMoralMemory(primitive), 'a primitive story is rebuilt, not assigned onto');
  assert.equal(typeof primitive.story.moralMemory, 'object');

  const state = freshState();
  const memory = ensureMoralMemory(state);
  // A poisoned primitive slot mints over rather than returning the primitive as the record.
  memory.debts['poison-1'] = 5;
  const minted = rememberMoralDebt(state, { id: 'poison-1', cause: 'spared', t: 0 });
  assert.ok(minted && minted.id === 'poison-1' && minted.status === 'pending');
  memory.witnesses['poison-w'] = 'junk';
  const w = rememberMoralWitness(state, { id: 'poison-w', debtId: 'poison-1' });
  assert.ok(w && w.id === 'poison-w' && w.status === 'open');
  assert.equal(moralWitnessById(state, 'poison-w'), w);
  // An offer with an unrecognized status is a dead shell, not a permanent wedge.
  minted.offer = { id: 'x', status: 'awaiting_review' };
  ensureMoralMemory(state);
  assert.equal(minted.offer, undefined, 'an unknown-status offer is dropped');
  assert.ok(makeMoralSettlementOffer(state, 'poison-1'), 'the debt can negotiate again');
});

test('duplicated witnessIds cannot fabricate a "second telling" headline', () => {
  const state = freshState();
  const { bus, of } = freshBus();
  debt(state, 'dup-chain', { cause: 'spared', t: 0 });
  const w = rememberMoralWitness(state, { debtId: 'dup-chain', kind: 'crew' });
  // Hostile save: the same witness id listed three times on one debt.
  state.story.moralMemory.debts['dup-chain'].witnessIds = [w.id, w.id, w.id];
  deliverWitnessTestimony(state, w.id, { bus });
  assert.equal(of('moralMemory:testimony').length, 1);
  assert.equal(of('news:publish').length, 0, 'one voice is one voice — no phantom second telling');
});

test('a listener re-entering on the intents cannot double-settle or double-testify', () => {
  const state = freshState();
  const bus = createBus();
  const events = [];
  for (const name of ALL_EVENTS) bus.on(name, (p) => events.push({ name, p }));
  const of = (name) => events.filter((e) => e.name === name);
  debt(state, 'reent-1', { cause: 'spared', t: 0 });
  makeMoralSettlementOffer(state, 'reent-1', { bus });
  // Inside the charge intent the offer is already latched: nothing re-opens it.
  bus.on('economy:chargeCredits', () => {
    acceptMoralSettlement(state, 'reent-1', { bus, optionId: 'pay' });
    settleMoralDebt(state, 'reent-1', 'custody');
    forgiveMoralDebt(state, 'reent-1', { bus });
  });
  acceptMoralSettlement(state, 'reent-1', { bus, optionId: 'pay' });
  assert.equal(of('economy:chargeCredits').length, 1);
  assert.equal(of('moralMemory:settled').length, 1);
  assert.equal(state.story.moralMemory.debts['reent-1'].status, 'settled');

  // A nested testimony inside the rep intents keeps its own snapshot: w2 counts
  // w1's latched telling and publishes ITS keyed headline; w1's own snapshot was
  // a single voice, so it publishes nothing — and never double-counts.
  debt(state, 'reent-d', { cause: 'spared', t: 1, factionId: 'faction_reach' });
  const w1 = rememberMoralWitness(state, { debtId: 'reent-d', kind: 'crew' });
  const w2 = rememberMoralWitness(state, { debtId: 'reent-d', kind: 'kin' });
  let reentered = false;
  bus.on('faction:repDelta', () => {
    if (reentered) return;
    reentered = true;
    deliverWitnessTestimony(state, w1.id, { bus });
    deliverWitnessTestimony(state, w2.id, { bus });
  });
  deliverWitnessTestimony(state, w1.id, { bus });
  assert.equal(of('moralMemory:testimony').length, 2);
  assert.equal(ensureMoralMemory(state).testimonyCount, 2);
  const news = of('news:publish');
  assert.equal(news.length, 1);
  assert.equal(news[0].p.eventId, `moral-testimony:reent-d:${w2.id}`);
});
