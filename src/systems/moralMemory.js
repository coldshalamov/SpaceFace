// Generalized durable mercy/debt seam. The record lives under state.story, which already
// round-trips through saves; writers can call these functions without the registry, and the
// moralMemorySystem object below is the registered runtime that makes the consequence layer
// (tick escalation, offer expiry, witness souring, moralMemory:* verbs) live in production.
//
// What lives here, beyond the debt ledger itself, is the consequence layer the ledger feeds:
//   • settlement offers — a pending debt can open a deterministic negotiation (pay reparations,
//     speak an apology, or walk away); resolving one closes the account without a gun.
//   • forgiveness — an explicit mercy path that closes a pending/revealed debt and counts on
//     the pilot's standing.
//   • witnesses — named bystanders attached to a debt whose testimony moves faction standing,
//     and whose testimony can propagate (witness chains) before it sours.
//   • pressure — vengeful debts that sit unanswered escalate; open offers expire; unheard
//     witnesses sour. tickMoralMemory is the deterministic clock for all three.
//   • feeds — deterministic hail lines, a news-desk picker, a mercy standing, and a ledger
//     digest so other systems (hails, news, endings) can speak the memory aloud.
//
// Determinism: every roll derives from state.meta.seed + stable ids via hash32/mulberry32, and
// every clock reads state.simTime. No Math.random, no wall time. All new state is plain
// JSON-safe data under state.story.moralMemory.
import { hash32 } from '../core/rng.js';
import { FRONTIER_FIRST_NAMES, FRONTIER_LAST_NAMES } from '../data/barks.js';

export const MORAL_MEMORY_VERSION = 1;
export const MORAL_MEMORY_MAX_DEBTS = 128;
export const MORAL_MEMORY_MAX_WITNESSES = 64;
// Hauler thank-you records live off memory.order by design, so they need their own bound.
export const MORAL_MEMORY_MAX_HAULER_RESCUES = 48;
// Consequence-layer clocks (sim seconds). A "day" in this sim is 600 s.
export const MORAL_TICK_S = 30;               // tickMoralMemory runs once per bucket of sim time
export const MORAL_PRESSURE_PERIOD_S = 480;   // unanswered vengeful debts harden per tier
export const MORAL_OFFER_TTL_S = 720;         // an ignored settlement offer lapses
export const MORAL_WITNESS_STALE_S = 1200;    // an unheard witness's testimony weakens
export const MORAL_WITNESS_MAX_GENERATION = 3;
const MORAL_PRESSURE_MAX_STEPS = 2;           // tick escalation caps at +2 tiers per debt
// Option kinds a minted offer can carry — anything else in a loaded offer is corrupt.
const SETTLEMENT_OPTION_KINDS = new Set(['reparations', 'apology', 'refuse']);
// Terminal offer statuses a loaded offer may legitimately carry ('open' is checked
// separately). Anything else is a corrupt shell that would wedge the debt's one
// negotiation slot forever — `if (debt.offer) return null` never distinguishes.
const SETTLEMENT_OFFER_CLOSED = new Set(['accepted', 'declined', 'expired', 'superseded', 'moot']);

export function moralTrapPartyId(offer) {
  if (!offer || !offer.stationId) return null;
  return `trap-party:${offer.stationId}:${offer.factionId || 'independent'}`;
}

export function lastTrapRefusal(state, partyId) {
  const memory = state && state.story && state.story.moralMemory;
  if (!partyId || !memory || !Array.isArray(memory.order)) return null;
  for (let i = memory.order.length - 1; i >= 0; i--) {
    const debt = memory.debts ? ownKeyed(memory.debts, memory.order[i]) : null;
    if (debt && debt.refusal && debt.refusal.partyId === partyId) return debt;
  }
  return null;
}

export function ensureMoralMemory(state) {
  // A hostile save can make story a primitive: assigning moralMemory onto a
  // number throws in strict mode before the normalizer ever runs.
  const story = (state.story && typeof state.story === 'object' && !Array.isArray(state.story))
    ? state.story
    : (state.story = { flags: {} });
  const source = story.moralMemory;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    story.moralMemory = freshMemory();
  }
  const memory = story.moralMemory;
  memory.schemaVersion = MORAL_MEMORY_VERSION;
  if (!memory.debts || typeof memory.debts !== 'object' || Array.isArray(memory.debts)) memory.debts = {};
  if (!Array.isArray(memory.order)) memory.order = [];
  // A hostile save can duplicate or overstuff the index: a duplicated id double-counts
  // the digest, and the write-time cap is the module's only bound. Same dedupe+evict
  // rules rememberMoralDebt enforces live.
  {
    const seen = new Set();
    memory.order = memory.order.filter((id) => {
      // Drop duplicates AND dangling entries — a ghost id still spent a cap
      // slot, so the bound must count only real records. A truthy primitive
      // (hostile `debts = { x: 5 }`) is no debt record either.
      const d = ownKeyed(memory.debts, id);
      if (seen.has(id) || !d || typeof d !== 'object' || Array.isArray(d)) return false;
      seen.add(id);
      return true;
    });
    while (memory.order.length > MORAL_MEMORY_MAX_DEBTS) {
      delete memory.debts[memory.order.shift()];
    }
  }
  if (!Number.isInteger(memory.mercyCount) || memory.mercyCount < 0) memory.mercyCount = 0;
  // Consequence-layer fields — normalized here so saves written before they existed still read.
  if (!memory.witnesses || typeof memory.witnesses !== 'object' || Array.isArray(memory.witnesses)) memory.witnesses = {};
  if (!Array.isArray(memory.witnessOrder)) memory.witnessOrder = [];
  {
    const seen = new Set();
    memory.witnessOrder = memory.witnessOrder.filter((id) => {
      const w = ownKeyed(memory.witnesses, id);
      if (seen.has(id) || !w || typeof w !== 'object' || Array.isArray(w)) return false;
      seen.add(id);
      return true;
    });
    while (memory.witnessOrder.length > MORAL_MEMORY_MAX_WITNESSES) {
      evictWitness(memory, memory.witnessOrder.shift());
    }
  }
  if (!Number.isInteger(memory.forgivenCount) || memory.forgivenCount < 0) memory.forgivenCount = 0;
  if (!Number.isInteger(memory.testimonyCount) || memory.testimonyCount < 0) memory.testimonyCount = 0;
  if (!Number.isInteger(memory.lastTickBucket)) memory.lastTickBucket = -1;
  // Hauler-rescue debts are kept off memory.order on purpose, so the bound that list
  // provides never reaches them — haulerOrder is their own capped index. It heals by
  // the same rules as the sibling indices (dedupe, drop dangling ids) plus two of its
  // own: an entry must actually be a hauler thank-you, and a hauler debt a damaged
  // save dropped from the index re-joins it. Sorted by recordedAt (stable) so the cap
  // always drops the oldest first — the same order the missing-field rebuild used.
  if (!Array.isArray(memory.haulerOrder)) memory.haulerOrder = [];
  {
    const seen = new Set();
    memory.haulerOrder = memory.haulerOrder.filter((k) => {
      const d = ownKeyed(memory.debts, k);
      if (seen.has(k) || !d || typeof d !== 'object' || Array.isArray(d)
        || d.cause !== HAULER_RESCUE_CAUSE) return false;
      seen.add(k);
      return true;
    });
    for (const k of Object.keys(memory.debts)) {
      const d = memory.debts[k];
      if (seen.has(k) || !d || d.cause !== HAULER_RESCUE_CAUSE) continue;
      memory.haulerOrder.push(k);
      seen.add(k);
    }
    memory.haulerOrder.sort(
      (a, b) => finite(memory.debts[a].recordedAt, 0) - finite(memory.debts[b].recordedAt, 0),
    );
  }
  evictHaulerRescues(memory);
  // A damaged offer shell must not wedge the debt: a non-object offer blocks every
  // future negotiation (`if (debt.offer) return null`), and an 'open' offer without
  // a finite expiry or a usable options list can never lapse or resolve honestly.
  // An 'open' offer on a closed account is worse: accept would charge for a settle
  // that can never land. Closing these here is silent on purpose — ensure is a
  // normalizer, not an event source. The walk covers every debt, not just indexed
  // ones, so corrupt offers on off-order records heal too.
  for (const id of Object.keys(memory.debts)) {
    const debt = memory.debts[id];
    if (!debt || debt.offer == null) continue;
    if (typeof debt.offer !== 'object' || Array.isArray(debt.offer)) { delete debt.offer; continue; }
    const offer = debt.offer;
    if (offer.status !== 'open') {
      // A recognized terminal status is legitimate one-negotiation history; an
      // unrecognized one is a corrupt shell that would wedge the slot forever.
      if (!SETTLEMENT_OFFER_CLOSED.has(offer.status)) delete debt.offer;
      continue;
    }
    if (!Number.isFinite(offer.expiresAt) || !settlementOptionsUsable(offer.options)) {
      offer.status = 'expired';
      offer.expiredAt = finite(offer.createdAt, finite(debt.recordedAt, 0));
    } else if (debt.status !== 'pending' && debt.status !== 'revealed') {
      offer.status = 'superseded';
      offer.supersededAt = finite(state.simTime, finite(offer.createdAt, finite(debt.recordedAt, 0)));
    }
  }
  return memory;
}

// Every element must be an option the settlement verbs could actually answer: a
// pickable id, a known kind, and finite numbers — a non-finite or negative costCr
// slips the wallet gate (`costCr > 0` is false) into a free settle, and a NaN
// repDelta poisons the rep intent. An empty list is just as unusable: accept can
// never resolve it, so the offer could only ever lapse or be walked away from.
function settlementOptionsUsable(options) {
  if (!Array.isArray(options) || options.length === 0) return false;
  for (const option of options) {
    if (!option || typeof option !== 'object'
      || typeof option.id !== 'string' || option.id.length === 0
      || !SETTLEMENT_OPTION_KINDS.has(option.kind)
      || !Number.isFinite(option.costCr) || option.costCr < 0
      || !Number.isFinite(option.repDelta)) return false;
  }
  return true;
}

export function rememberMoralDebt(state, payload = {}, opts = {}) {
  const id = String(payload.id || payload.aceId || payload.targetId || '').trim();
  if (!id) return null;
  const memory = ensureMoralMemory(state);
  // Own-property read: a hostile id like 'constructor' must not resolve an
  // inherited member as "already remembered" and silently drop the debt. The
  // hit must also be a record — a poisoned primitive slot (debts = {x: 5})
  // heals by minting over it rather than returning 5 as "the debt".
  const existingDebt = ownKeyed(memory.debts, id);
  if (existingDebt && typeof existingDebt === 'object' && !Array.isArray(existingDebt)) return existingDebt;
  const now = Number.isFinite(payload.t) ? Number(payload.t) : finite(state.simTime, 0);
  const simTick = Number.isInteger(payload.tick)
    ? payload.tick
    : Math.max(0, Math.round(now * 60));
  const seed = hash32(finite(state.meta && state.meta.seed, 0), id, simTick, 'moral-debt');
  const debt = {
    id,
    name: String(payload.name || payload.aceName || id),
    cause: String(payload.cause || 'spared'),
    factionId: payload.factionId || 'faction_reach',
    archetype: payload.archetype || 'corsair_raider',
    recordedAt: now,
    recordedTick: simTick,
    seed,
    disposition: (seed & 1) === 0 ? 'ally' : 'vengeful',
    status: 'pending',
    mercyOrdinal: memory.mercyCount + 1,
    escalationTier: Math.max(1, Math.min(3, Math.trunc(finite(payload.escalationTier, 1)))),
    source: payload.source || 'moralMemory:remember',
  };
  // An explicit disposition wins (an execution is never a misunderstanding); otherwise the seed rolls.
  if (payload.disposition === 'ally' || payload.disposition === 'vengeful') debt.disposition = payload.disposition;
  // Optional survivor-pod witness fields. Absent on every older record; readers must tolerate that.
  // captorFactionId / captorId: who took the survivors left behind. playerAnswered: the player's own
  // hull made the rescue (an ambient rescue hull's pickup is the world's mercy, not the player's).
  if (typeof payload.captorFactionId === 'string' && payload.captorFactionId) debt.captorFactionId = payload.captorFactionId;
  if (payload.captorId != null && payload.captorId !== '') debt.captorId = payload.captorId;
  if (payload.playerAnswered === true) debt.playerAnswered = true;
  if (payload.refusal) debt.refusal = { ...payload.refusal };
  memory.mercyCount += 1;
  // defineProperty, not `debts[id] =`: a '__proto__' id hits the proto setter on a
  // bracket write — it silently re-prototypes the map and stores nothing. An own
  // data property stores honestly and still round-trips through JSON.
  Object.defineProperty(memory.debts, id, { value: debt, writable: true, enumerable: true, configurable: true });
  memory.order.push(id);
  while (memory.order.length > MORAL_MEMORY_MAX_DEBTS) {
    delete memory.debts[memory.order.shift()];
  }
  // A deed can arrive with someone who saw it. `payload.witness` is sugar for
  // rememberMoralWitness bound to this fresh debt; it only mints on first record
  // (the dedupe path above returns early and never double-stamps a witness). The
  // caller's bus rides along so the mint still announces moralMemory:witnessed.
  if (payload.witness && typeof payload.witness === 'object') {
    rememberMoralWitness(state, { ...payload.witness, debtId: id }, opts);
  }
  return debt;
}

export function rememberAceMemoryTransition(state, payload = {}) {
  if (payload.transition !== 'fled') return null;
  return rememberMoralDebt(state, {
    id: payload.aceId,
    name: payload.aceName,
    cause: 'spared_escape',
    factionId: payload.factionId || 'faction_reach',
    escalationTier: payload.record && payload.record.returnTier,
    t: payload.t,
    source: 'aceMemory:transition',
  });
}

// Causes the h7 moral-return encounter may pick. Named opponents the runtime already
// brings back (a spared pilot, a yielded crew, an escapee, a slain prisoner's crew),
// plus a rescued pod. Other survivor-pod causes stay on the ledger and never spawn a return.
// moralTrap writes `moral_trap:<trapId>:<optionId>` — a named counterparty, matched by prefix.
export const MORAL_RETURN_CAUSES = Object.freeze(new Set([
  'accepted_surrender',
  'escaped_custody',
  'executed_prisoner',
  'rescued_survivors',
  'spared',
  'spared_escape',
]));
export const MORAL_RETURN_CAUSE_PREFIXES = Object.freeze(['moral_trap:']);

// WORLD-46 — one memory for a lane hauler whose raiders the player killed.
// Status stays off the pending/return picker, and mercyCount is not bumped:
// the next crossing says thank you. It does not open a comeback or pay anyone.
export const HAULER_RESCUE_CAUSE = 'lane_hauler_rescued';

export function moralCauseMayReturn(cause) {
  if (typeof cause !== 'string' || cause.length === 0) return false;
  if (MORAL_RETURN_CAUSES.has(cause)) return true;
  for (const prefix of MORAL_RETURN_CAUSE_PREFIXES) {
    if (cause.startsWith(prefix) && cause.length > prefix.length) return true;
  }
  return false;
}

export function nextMoralDebt(state) {
  const memory = ensureMoralMemory(state);
  for (const id of memory.order) {
    const debt = memory.debts[id];
    if (debt && debt.status === 'pending' && moralCauseMayReturn(debt.cause)) return debt;
  }
  return null;
}

export function revealMoralDebt(state, id) {
  const memory = ensureMoralMemory(state);
  const debt = ownKeyed(memory.debts, String(id || ''));
  if (!debt || debt.status !== 'pending') return null;
  debt.status = 'revealed';
  debt.revealedAt = finite(state.simTime, 0);
  return debt;
}

export function pendingMoralDebt(state, id) {
  const memory = ensureMoralMemory(state);
  const debt = ownKeyed(memory.debts, String(id || ''));
  return debt && debt.status === 'pending' ? debt : null;
}

// A terminal close that is not a comeback: custody, death-in-custody, pardon, a negotiated
// settlement. 'revealed' is accepted as well as 'pending' — a debt the return encounter
// already put a face to can still be closed by the player's hands. The h7 moral-return
// picker only reads pending returnable debts, so settling blocks every return path.
export function settleMoralDebt(state, id, how = 'custody') {
  const memory = ensureMoralMemory(state);
  const debt = ownKeyed(memory.debts, String(id || ''));
  if (!debt || (debt.status !== 'pending' && debt.status !== 'revealed')) return null;
  debt.status = 'settled';
  debt.settledHow = String(how || 'custody');
  debt.settledAt = finite(state.simTime, 0);
  // A settlement reached another way supersedes any open negotiation.
  if (debt.offer && debt.offer.status === 'open') {
    debt.offer.status = 'superseded';
    debt.offer.supersededAt = debt.settledAt;
  }
  return debt;
}

// The vengeful comeback happened (moralMemory:vengefulReturn): the debt's story is told.
// Records the return on the debt without reopening it — the picker only reads 'pending'.
export function markMoralDebtReturned(state, id) {
  const memory = ensureMoralMemory(state);
  const debt = ownKeyed(memory.debts, String(id || ''));
  if (!debt || debt.status === 'returned') return debt || null;
  // Terminal statuses are settled paper — a late vengeful-return event must not
  // rewrite a debt the player already paid, was forgiven, or is remembered.
  if (debt.status !== 'pending' && debt.status !== 'revealed') return null;
  debt.status = 'returned';
  debt.returnedAt = finite(state.simTime, 0);
  // The return itself answered the account — an open negotiation is moot.
  if (debt.offer && debt.offer.status === 'open') {
    debt.offer.status = 'moot';
    debt.offer.mootedAt = debt.returnedAt;
  }
  return debt;
}

// ── consequence layer: cause tone, mercy standing ────────────────────────────────────────────
//
// moralCauseTone classifies a recorded cause as 'mercy' | 'harm' | 'neutral' — the ledger's
// own accounting of what the player did, used by moralStandingOf and the news desk. It is a
// public pure function so hails and endings can read the same tone without re-deriving it.
const MERCY_CAUSES = new Set([
  'spared', 'spared_escape', 'accepted_surrender', 'rescued_survivors',
]);
const HARM_CAUSES = new Set([
  'executed_prisoner', 'captain_murdered', 'mutineers_burned',
  'ransomed_survivors', 'abandoned_survivors',
]);

export function moralCauseTone(cause) {
  if (MERCY_CAUSES.has(cause)) return 'mercy';
  if (HARM_CAUSES.has(cause)) return 'harm';
  return 'neutral';
}

// The pilot's standing as the ledger would phrase it — what a debtor or a news desk believes
// before any single debt is named. Forgiven debts count as mercy done twice over.
//   'unwritten'   — the ledger is empty
//   'merciful'    — real mercy and no recorded harm
//   'feared'      — harm outweighs mercy
//   'complicated' — both, or too little of either to say
export function moralStandingOf(state) {
  const memory = ensureMoralMemory(state);
  let mercy = 0;
  let harm = 0;
  for (const id of memory.order) {
    const debt = memory.debts[id];
    if (!debt) continue;
    const tone = moralCauseTone(debt.cause);
    if (tone === 'mercy') mercy += 1;
    else if (tone === 'harm') harm += 1;
  }
  const forgiven = memory.forgivenCount | 0;
  const mercyTotal = mercy + forgiven;
  let standing = 'unwritten';
  if (mercyTotal + harm === 0) standing = 'unwritten';
  else if (harm === 0 && mercyTotal >= 2) standing = 'merciful';
  else if (harm > mercyTotal && harm >= 2) standing = 'feared';
  else standing = 'complicated';
  return { mercy: mercyTotal, harm, forgiven, standing };
}

// ── consequence layer: settlement offers (debt negotiation) ─────────────────────────────────
//
// A pending or revealed debt can open ONE negotiation in its life. The offer carries concrete
// options — wire reparations, speak an apology, or close the channel — so a UI surface or a
// hail can present a real choice. Terms derive only from visible fields (cause, tier, mercy
// ordinal, witness count) and the debtor's seed: nothing in the terms reads `disposition`,
// so an offer never leaks the unrevealed ally/vengeful roll.
const SETTLEMENT_BASE_CR = Object.freeze({ blood: 2400, crossed: 1400, sour: 900, owed: 600 });

function settlementCauseClass(cause) {
  if (cause === 'executed_prisoner' || cause === 'captain_murdered' || cause === 'mutineers_burned') return 'blood';
  if (cause === 'ransomed_survivors' || cause === 'captured_survivors'
    || (typeof cause === 'string' && cause.startsWith('moral_trap:'))) return 'crossed';
  if (cause === 'spared' || cause === 'spared_escape' || cause === 'escaped_custody'
    || cause === 'accepted_surrender' || cause === 'abandoned_survivors') return 'sour';
  return 'owed';
}

// A proud debtor refuses apologies — seeded bits, independent of the disposition parity.
function debtorIsProud(debt) {
  return ((debt.seed >>> 5) & 1) === 1;
}

/** Deterministic settlement terms for a debt, or null when it cannot be negotiated. */
export function moralSettlementTerms(state, id) {
  const memory = ensureMoralMemory(state);
  const debt = ownKeyed(memory.debts, String(id || ''));
  if (!debt || (debt.status !== 'pending' && debt.status !== 'revealed')) return null;
  const tier = Math.max(1, Math.min(3, debt.escalationTier | 0));
  const ordinal = Math.max(0, debt.mercyOrdinal | 0);
  const base = SETTLEMENT_BASE_CR[settlementCauseClass(debt.cause)] || SETTLEMENT_BASE_CR.owed;
  const raw = base * (1 + 0.5 * (tier - 1)) * (1 + 0.04 * ordinal);
  const costCr = Math.max(25, Math.round(raw / 25) * 25);
  const options = [{
    id: 'pay',
    kind: 'reparations',
    label: `Wire ${costCr} cr in reparations`,
    costCr,
    repDelta: 2 + tier,
  }];
  if (!debtorIsProud(debt) && tier <= 2) {
    options.push({
      id: 'apologize',
      kind: 'apology',
      label: 'Speak the apology on the open band',
      costCr: 0,
      repDelta: 1,
    });
  }
  options.push({ id: 'walk', kind: 'refuse', label: 'Close the channel', costCr: 0, repDelta: 0 });
  return {
    debtId: debt.id,
    name: debt.name,
    factionId: debt.factionId,
    proud: debtorIsProud(debt),
    tier,
    options,
  };
}

/**
 * Open the negotiation: stamp the offer on the debt and emit 'moralMemory:settlementOffered'.
 * Idempotent while open; one negotiation per debt — a closed offer (accepted, declined,
 * expired, superseded, moot) is never re-litigated. Returns the offer or null.
 */
export function makeMoralSettlementOffer(state, id, opts = {}) {
  const memory = ensureMoralMemory(state);
  const debt = ownKeyed(memory.debts, String(id || ''));
  if (!debt || (debt.status !== 'pending' && debt.status !== 'revealed')) return null;
  const now = finite(opts.t, finite(state.simTime, 0));
  if (debt.offer && debt.offer.status === 'open') {
    if (now >= debt.offer.expiresAt) {
      expireMoralOffer(debt, debt.offer, now, opts.bus);
      return null;
    }
    return debt.offer;
  }
  if (debt.offer) return null;
  const terms = moralSettlementTerms(state, id);
  if (!terms) return null;
  const offer = {
    id: `moralOffer:${debt.id}`,
    debtId: debt.id,
    kind: 'negotiation',
    createdAt: now,
    expiresAt: now + MORAL_OFFER_TTL_S,
    status: 'open',
    seed: hash32(debt.seed, 'settlement-offer'),
    options: terms.options.map((option) => ({ ...option })),
  };
  debt.offer = offer;
  emitBus(opts.bus, 'moralMemory:settlementOffered', {
    debtId: debt.id, name: debt.name, factionId: debt.factionId,
    offer: { id: offer.id, expiresAt: offer.expiresAt, options: offer.options.map((o) => ({ ...o })) },
    t: now,
  });
  return offer;
}

/**
 * Answer an open offer. `opts.optionId` picks the option ('pay' default, 'apologize', 'walk').
 * 'pay' emits economy:chargeCredits + faction:repDelta and settles 'negotiated';
 * 'apologize' emits the smaller rep delta and settles 'pardoned'; 'walk' declines (a vengeful
 * debtor takes offense — the debt escalates). Returns { debt, offer, option } or null.
 */
export function acceptMoralSettlement(state, id, opts = {}) {
  const memory = ensureMoralMemory(state);
  const debt = ownKeyed(memory.debts, String(id || ''));
  if (!debt || !debt.offer || debt.offer.status !== 'open') return null;
  const now = finite(opts.t, finite(state.simTime, 0));
  const offer = debt.offer;
  if (now >= offer.expiresAt) {
    expireMoralOffer(debt, offer, now, opts.bus);
    return null;
  }
  const optionId = opts.optionId == null ? 'pay' : String(opts.optionId);
  const option = (Array.isArray(offer.options) ? offer.options : []).find((o) => o && o.id === optionId);
  if (!option) return null;
  if (option.kind === 'refuse') {
    return { debt, offer: declineMoralSettlement(state, id, opts), option };
  }
  // A price is a price: the clamp-at-zero charge path never refuses, so a pilot
  // who cannot pay — or whose wallet cannot be read at all — cannot settle.
  // The offer stays open for richer pockets.
  const credits = state.player && state.player.credits;
  if (option.costCr > 0 && !(Number.isFinite(credits) && credits >= option.costCr)) return null;
  // Transition before emitting: a listener re-entering on the charge/rep events
  // must find the offer already closed, never a second settle.
  const how = option.kind === 'apology' ? 'pardoned' : 'negotiated';
  offer.status = 'accepted';
  offer.acceptedAt = now;
  offer.acceptedOption = option.id;
  // Settle by the lookup key, not debt.id: a damaged save whose record's id field
  // disagrees with its map key would otherwise close a DIFFERENT account and leave
  // the negotiated one pending behind an accepted offer.
  settleMoralDebt(state, id, how);
  if (option.costCr > 0) {
    emitBus(opts.bus, 'economy:chargeCredits', {
      amount: option.costCr,
      reason: `moral_settlement:${debt.id}`,
    });
  }
  if (option.repDelta) {
    emitBus(opts.bus, 'faction:repDelta', {
      factionId: debt.factionId,
      delta: option.repDelta,
      reason: 'moralMemory:settlement',
      debtId: debt.id,
    });
  }
  emitBus(opts.bus, 'moralMemory:settled', {
    debtId: debt.id, name: debt.name, how,
    costCr: option.costCr | 0, repDelta: option.repDelta | 0,
    optionId: option.id, t: now,
  });
  return { debt, offer, option };
}

/**
 * Refuse the negotiation outright: the offer closes 'declined'. A vengeful debtor reads the
 * refusal as one more offense — the debt hardens a tier (the comeback is tougher). Returns
 * the offer or null.
 */
export function declineMoralSettlement(state, id, opts = {}) {
  const memory = ensureMoralMemory(state);
  const debt = ownKeyed(memory.debts, String(id || ''));
  if (!debt || !debt.offer || debt.offer.status !== 'open') return null;
  const now = finite(opts.t, finite(state.simTime, 0));
  const offer = debt.offer;
  // A lapsed offer is expired, not declined — same lapse path as the tick and
  // the other lazy observers, so the outcome never depends on who noticed first.
  if (now >= offer.expiresAt) {
    expireMoralOffer(debt, offer, now, opts.bus);
    return null;
  }
  offer.status = 'declined';
  offer.declinedAt = now;
  emitBus(opts.bus, 'moralMemory:settlementDeclined', {
    debtId: debt.id, name: debt.name, t: now,
  });
  if (debt.disposition === 'vengeful'
    && (debt.status === 'pending' || debt.status === 'revealed')) {
    escalateDebt(debt, now, opts.bus);
  }
  return offer;
}

// ── consequence layer: forgiveness ──────────────────────────────────────────────────────────
//
// Mercy is a choice too: a pending or revealed debt the player forgives closes 'forgiven'
// instead of 'settled' — it never returns, but it counts on the standing and a forgiven
// debtor's testimony still moves a faction. Forgiveness is one-way and once.

export function forgiveMoralDebt(state, id, opts = {}) {
  const memory = ensureMoralMemory(state);
  const debt = ownKeyed(memory.debts, String(id || ''));
  if (!debt || (debt.status !== 'pending' && debt.status !== 'revealed')) return null;
  const now = finite(opts.t, finite(state.simTime, 0));
  debt.status = 'forgiven';
  debt.forgivenAt = now;
  debt.forgivenHow = String(opts.how || 'absolution');
  if (debt.offer && debt.offer.status === 'open') {
    debt.offer.status = 'superseded';
    debt.offer.supersededAt = now;
  }
  memory.forgivenCount += 1;
  // Mercy, seen — but only where the account was mercy owed. Forgiving a harm
  // debt retires the vendetta without buying the faction's regard; a free +1 on
  // a blood account would dominate every paid settlement it sits beside.
  if (moralCauseTone(debt.cause) !== 'harm') {
    emitBus(opts.bus, 'faction:repDelta', {
      factionId: debt.factionId, delta: 1,
      reason: 'moralMemory:forgiven', debtId: debt.id,
    });
  }
  emitBus(opts.bus, 'moralMemory:forgiven', {
    id: debt.id, name: debt.name, how: debt.forgivenHow, cause: debt.cause, t: now,
  });
  return debt;
}

// ── consequence layer: witnesses and testimony chains ───────────────────────────────────────
//
// A witness is a named bystander bound to a debt: the deckhand who saw the surrender, kin of
// the executed, the broker who watched the refusal. Testimony is delivered by the player
// (deliverWitnessTestimony) and moves faction standing through faction:repDelta intents —
// sympathetic witnesses raise it, hostile ones damn it. A testified witness can propagate
// the story once (propagateMoralWitness), minting a second-generation witness closer to the
// debtor's own people. Silence has a cost: an unheard witness sours after MORAL_WITNESS_STALE_S
// and their testimony weakens.
const WITNESS_KINDS = new Set(['crew', 'kin', 'bystander', 'broker']);

export function rememberMoralWitness(state, payload = {}, opts = {}) {
  const memory = ensureMoralMemory(state);
  // Own-property read: an inherited member ('constructor' → Object) is truthy —
  // binding to it would write `witnessIds` onto the shared builtin itself. The
  // record check keeps a poisoned slot (primitive or array) from posing as a
  // debt — otherwise `debt.id` would mint 'wit:undefined:N' witness ids.
  const resolvedDebt = payload.debtId != null ? ownKeyed(memory.debts, String(payload.debtId)) : null;
  const debt = (resolvedDebt && typeof resolvedDebt === 'object' && !Array.isArray(resolvedDebt))
    ? resolvedDebt
    : null;
  const worldSeed = finite(state.meta && state.meta.seed, 0);
  let id = payload.id != null ? String(payload.id).trim() : '';
  if (!id) {
    const base = `wit:${debt ? debt.id : 'deed'}:${memory.witnessOrder.length}`;
    id = base;
    for (let n = 1; ownKeyed(memory.witnesses, id); n++) id = `${base}:${n}`; // deterministic dedupe
  }
  // Own-property read, same inherited-member hazard — and the same
  // primitive-poison heal — as the debt dedupe.
  const existingWitness = ownKeyed(memory.witnesses, id);
  if (existingWitness && typeof existingWitness === 'object' && !Array.isArray(existingWitness)) return existingWitness;
  const now = Number.isFinite(payload.t) ? Number(payload.t) : finite(state.simTime, 0);
  const tone = debt ? moralCauseTone(debt.cause) : 'neutral';
  const witness = {
    id,
    debtId: payload.debtId != null ? String(payload.debtId) : (debt ? debt.id : null),
    name: String(payload.name || witnessNameFor(worldSeed, id)),
    factionId: payload.factionId || (debt && debt.factionId) || 'faction_free',
    kind: WITNESS_KINDS.has(payload.kind) ? payload.kind : 'crew',
    disposition: payload.disposition === 'hostile' || payload.disposition === 'sympathetic'
      ? payload.disposition
      : (tone === 'harm' ? 'hostile' : 'sympathetic'),
    generation: Math.max(0, Math.min(MORAL_WITNESS_MAX_GENERATION, Math.trunc(finite(payload.generation, 0)))),
    parentId: payload.parentId != null ? String(payload.parentId) : null,
    seenAt: now,
    seenTick: Math.max(0, Math.round(now * 60)),
    seed: hash32(worldSeed, id, 'moral-witness'),
    status: 'open',
    souredAt: null,
    testifiedAt: null,
    childId: null,
    source: payload.source || 'moralMemory:witness',
  };
  Object.defineProperty(memory.witnesses, id, { value: witness, writable: true, enumerable: true, configurable: true });
  memory.witnessOrder.push(id);
  while (memory.witnessOrder.length > MORAL_MEMORY_MAX_WITNESSES) {
    evictWitness(memory, memory.witnessOrder.shift());
  }
  if (debt) {
    if (!Array.isArray(debt.witnessIds)) debt.witnessIds = [];
    if (!debt.witnessIds.includes(id)) debt.witnessIds.push(id);
  }
  emitBus(opts.bus, 'moralMemory:witnessed', {
    witness: publicWitness(witness), debtId: witness.debtId, t: now,
  });
  return witness;
}

export function moralWitnessById(state, witnessId) {
  const memory = state && state.story && state.story.moralMemory;
  if (!memory || !memory.witnesses) return null;
  const wid = String(witnessId || '');
  // Own-property read — otherwise 'toString' hands back a function as a "witness";
  // the object check keeps a poisoned primitive slot from posing as a record.
  const witness = ownKeyed(memory.witnesses, wid);
  return (witness && typeof witness === 'object' && !Array.isArray(witness)) ? witness : null;
}

/** The witnesses bound to a debt, in seen order — the chain the ledger can call on. */
export function witnessChainFor(state, debtId) {
  const memory = ensureMoralMemory(state);
  const debt = ownKeyed(memory.debts, String(debtId || ''));
  if (!debt || typeof debt !== 'object' || Array.isArray(debt) || !Array.isArray(debt.witnessIds)) return [];
  return debt.witnessIds
    .map((wid) => ownKeyed(memory.witnesses, wid))
    .filter((w) => w && typeof w === 'object' && !Array.isArray(w))
    .map((w) => publicWitness(w));
}

/**
 * What a witness's testimony would move, without delivering it — deterministic preview for
 * any surface that wants to show the stakes first. Magnitude: hostile witnesses damn (-),
 * sympathetic ones speak for you (+); kin speak louder; each propagation generation fades
 * the word; a soured witness's word halves. Rep lands on the debtor's faction at full weight
 * and on the witness's own faction (when different) at half.
 */
export function witnessTestimonyTerms(state, witnessId) {
  const memory = ensureMoralMemory(state);
  const witness = ownKeyed(memory.witnesses, String(witnessId || ''));
  if (!witness || witness.status !== 'open') return null;
  const debt = witness.debtId ? ownKeyed(memory.debts, witness.debtId) : null;
  const sign = witness.disposition === 'hostile' ? -1 : 1;
  let magnitude = (witness.disposition === 'hostile' ? 3 : 2) + (witness.kind === 'kin' ? 1 : 0);
  magnitude = Math.max(1, magnitude - (witness.generation | 0));
  if (witness.souredAt != null) magnitude = Math.max(1, Math.floor(magnitude / 2));
  const repDelta = sign * magnitude;
  const factions = [];
  if (debt && debt.factionId) factions.push({ factionId: debt.factionId, delta: repDelta });
  if (witness.factionId && (!debt || witness.factionId !== debt.factionId)) {
    const half = repDelta > 0
      ? Math.max(1, Math.floor(repDelta / 2))
      : Math.min(-1, Math.ceil(repDelta / 2));
    factions.push({ factionId: witness.factionId, delta: half });
  }
  return {
    witnessId: witness.id, debtId: witness.debtId,
    disposition: witness.disposition, soured: witness.souredAt != null,
    repDelta, factions,
  };
}

/**
 * Deliver a witness's word: faction standing moves through faction:repDelta intents, the
 * testimony is stamped, and the second onward testimony on one debt is newsworthy (word
 * travels the band — a news:publish intent). Once per witness. Returns the witness or null.
 */
export function deliverWitnessTestimony(state, witnessId, opts = {}) {
  const memory = ensureMoralMemory(state);
  const witness = ownKeyed(memory.witnesses, String(witnessId || ''));
  if (!witness || witness.status !== 'open') return null;
  const terms = witnessTestimonyTerms(state, witnessId);
  if (!terms) return null;
  const now = finite(opts.t, finite(state.simTime, 0));
  witness.status = 'testified';
  witness.testifiedAt = now;
  memory.testimonyCount += 1;
  // The second onward telling on one debt is itself newsworthy — announced after
  // the testimony event so the headline never outruns its cause. The told-count is
  // snapshotted BEFORE the rep intents run: a re-entrant testimony inside those
  // emits would otherwise fold into THIS telling's count and make the first voice
  // publish a "second voice" headline about itself.
  const debt = witness.debtId ? ownKeyed(memory.debts, witness.debtId) : null;
  let testifiedCount = 0;
  if (debt && typeof debt === 'object' && !Array.isArray(debt) && Array.isArray(debt.witnessIds)) {
    // Count DISTINCT testified witnesses: a hostile save can duplicate ids in
    // witnessIds, which would count one voice several times and mint a
    // "second telling" headline on the very first testimony.
    const counted = new Set();
    for (const wid of debt.witnessIds) {
      if (counted.has(wid)) continue;
      counted.add(wid);
      const other = ownKeyed(memory.witnesses, wid);
      if (other && other.status === 'testified') testifiedCount += 1;
    }
  }
  const headline = debt && testifiedCount >= 2;
  for (const row of terms.factions) {
    emitBus(opts.bus, 'faction:repDelta', {
      factionId: row.factionId, delta: row.delta,
      reason: 'moralMemory:testimony', witnessId: witness.id, debtId: witness.debtId,
    });
  }
  emitBus(opts.bus, 'moralMemory:testimony', {
    witnessId: witness.id, debtId: witness.debtId,
    repDelta: terms.repDelta, factions: terms.factions.map((f) => ({ ...f })),
    soured: terms.soured, t: now,
  });
  if (headline) {
    emitBus(opts.bus, 'news:publish', {
      // Keyed on the witness, not the telling count — a re-entrant testimony (a
      // listener testifying the propagated child inside this emit) can observe
      // the same count and would mint a duplicate eventId the desk would dedupe.
      id: `moral-testimony:${debt.id}:${witness.id}`,
      text: testimonyNewsLine(debt, witness),
      kind: 'moral_testimony',
      source: 'moral-memory',
      sourceRef: debt.id,
      eventId: `moral-testimony:${debt.id}:${witness.id}`,
      t: now,
    });
  }
  return witness;
}

/**
 * A testified witness tells someone who tells someone: mint the next-generation witness on
 * the chain. The story travels toward the debtor's own people when it can, else toward the
 * lawful ear. Once per witness, capped at MORAL_WITNESS_MAX_GENERATION.
 */
export function propagateMoralWitness(state, witnessId, opts = {}) {
  const memory = ensureMoralMemory(state);
  const parent = ownKeyed(memory.witnesses, String(witnessId || ''));
  if (!parent || parent.status !== 'testified') return null;
  if (parent.childId || (parent.generation | 0) >= MORAL_WITNESS_MAX_GENERATION) return null;
  const debt = parent.debtId ? ownKeyed(memory.debts, parent.debtId) : null;
  const targetFaction = debt && debt.factionId && debt.factionId !== parent.factionId
    ? debt.factionId
    : 'faction_scn';
  // Reserve the slot before minting — the witnessed event inside the mint can
  // re-enter this call, and only the reservation keeps it one child per witness.
  parent.childId = parent.id;
  const child = rememberMoralWitness(state, {
    debtId: parent.debtId,
    factionId: targetFaction,
    kind: 'bystander',
    disposition: parent.disposition,
    generation: (parent.generation | 0) + 1,
    parentId: parent.id,
    t: opts.t,
    source: 'moralMemory:propagate',
  }, opts);
  if (!child || child.id === parent.id) { parent.childId = null; return null; }
  parent.childId = child.id;
  emitBus(opts.bus, 'moralMemory:witnessPropagated', {
    parentId: parent.id, childId: child.id,
    debtId: parent.debtId, generation: child.generation,
  });
  return child;
}

// ── consequence layer: the deterministic clock ──────────────────────────────────────────────
//
// tickMoralMemory is the layer's heartbeat: unanswered vengeful debts harden a tier per
// pressure period (the comeback gets bigger), open offers lapse (a lapsed offer to a vengeful
// debtor is one more offense), and unheard witnesses sour (their later testimony halves).
// Bucketed on simTime so it is cheap every frame and identical after a save round-trip.

export function tickMoralMemory(state, opts = {}) {
  const memory = ensureMoralMemory(state);
  const now = finite(opts && opts.t, finite(state.simTime, 0));
  const bucket = Math.floor(now / MORAL_TICK_S);
  if (memory.lastTickBucket === bucket) return null;
  memory.lastTickBucket = bucket;
  const out = { escalated: [], expiredOffers: [], souredWitnesses: [], at: now };
  // Iterate snapshots: the emits inside this loop are synchronous, and a listener
  // that mutates the ledger mid-tick (records a debt, evicts a witness) must not
  // shift the indices this walk still has to visit.
  for (const id of memory.order.slice()) {
    const debt = memory.debts[id];
    if (!debt) continue;
    const offer = debt.offer;
    if (offer && offer.status === 'open' && now >= offer.expiresAt) {
      expireMoralOffer(debt, offer, now, opts.bus, out);
    }
    if ((debt.status === 'pending' || debt.status === 'revealed')
      && debt.disposition === 'vengeful'
      && moralCauseMayReturn(debt.cause)
      && (debt.escalationTier | 0) < 3
      && (debt.pressureEscalations | 0) < MORAL_PRESSURE_MAX_STEPS) {
      const since = finite(debt.lastPressureAt, debt.recordedAt);
      if (now - since >= MORAL_PRESSURE_PERIOD_S * Math.max(1, debt.escalationTier | 0)) {
        escalateDebt(debt, now, opts.bus, out);
      }
    }
  }
  for (const wid of memory.witnessOrder.slice()) {
    const witness = memory.witnesses[wid];
    if (!witness || witness.status !== 'open' || witness.souredAt != null) continue;
    if (now - witness.seenAt >= MORAL_WITNESS_STALE_S) {
      witness.souredAt = now;
      out.souredWitnesses.push(wid);
      emitBus(opts.bus, 'moralMemory:witnessSoured', {
        witnessId: wid, debtId: witness.debtId, t: now,
      });
    }
  }
  return out;
}

// One lapse path for every observer — the tick and each lazy check in the
// settlement verbs. Stamps the offer closed, announces it once, and lets a
// vengeful debtor count the silence as one more offense, identically no matter
// which code path noticed the lapse first.
function expireMoralOffer(debt, offer, now, bus, out) {
  offer.status = 'expired';
  offer.expiredAt = now;
  if (out && Array.isArray(out.expiredOffers)) out.expiredOffers.push(debt.id);
  emitBus(bus, 'moralMemory:settlementExpired', {
    debtId: debt.id, name: debt.name, offerId: offer.id, t: now,
  });
  if (debt.disposition === 'vengeful'
    && (debt.status === 'pending' || debt.status === 'revealed')) {
    escalateDebt(debt, now, bus, out);
  }
}

function escalateDebt(debt, now, bus, out) {
  if ((debt.escalationTier | 0) >= 3) return; // capped — no phantom escalation
  debt.escalationTier = Math.min(3, Math.max(1, (debt.escalationTier | 0) + 1));
  debt.pressureEscalations = (debt.pressureEscalations | 0) + 1;
  debt.lastPressureAt = now;
  if (out && Array.isArray(out.escalated)) out.escalated.push(debt.id);
  emitBus(bus, 'moralMemory:escalated', {
    debtId: debt.id, name: debt.name, tier: debt.escalationTier, t: now,
  });
}

// ── consequence layer: the feeds (hails, news, digest) ──────────────────────────────────────
//
// The memory speaks. hailLineForMoralDebt is the debtor's voice over the band — pending debts
// deliberately say nothing about disposition (the reveal belongs to the return encounter,
// and lifeLedger's no-leak rule applies here too). nextMoralNewsSeed/publishMoralNewsStory is
// the news desk's pick of the ledger's finished stories. moralLedgerSummary is the digest an
// ending or a HUD can quote.
const MORAL_HAIL_LINES = Object.freeze({
  pending: Object.freeze([
    '{name}? The ledger still has your name on it. Nothing is settled.',
    'The band still whispers {name}. Accounts like that do not drift.',
    '{name} is still out there, pilot. Debts like that keep their own orbit.',
    'The ledger holds {name} against you — open, unpaid, unanswered.',
  ]),
  ally: Object.freeze([
    '{name}: You gave me a lane when nobody had to. This crew remembers.',
    '{name}: Still flying, pilot — you are the reason.',
    '{name}: Any lane you cross, my people owe you the passage.',
  ]),
  vengeful: Object.freeze([
    '{name}: You spared me and thought that was the end of it.',
    '{name}: I keep your mercy like a debt of teeth.',
    '{name}: Every drift since, I have been coming back to you.',
  ]),
  returned: Object.freeze([
    '{name}: The ledger called. It always calls.',
    '{name}: What passed between us is paid in full.',
  ]),
  settled: Object.freeze([
    '{name}: The account is closed. Fly your lane; I fly mine.',
    '{name}: Settled is settled. The desk keeps no grudge.',
  ]),
  forgiven: Object.freeze([
    '{name}: You forgave it twice. That buys quiet out here.',
    '{name}: Mercy twice over — the band will hear of it.',
  ]),
});

/** A deterministic hail line for one debt, or null. Pending debts never leak disposition. */
export function hailLineForMoralDebt(state, id) {
  const memory = ensureMoralMemory(state);
  const key = String(id || '');
  const debt = ownKeyed(memory.debts, key);
  if (!debt) return null;
  let bucket = 'pending';
  if (debt.status === 'forgiven') bucket = 'forgiven';
  else if (debt.status === 'settled') bucket = 'settled';
  else if (debt.status === 'returned') bucket = 'returned';
  else if (debt.status === 'revealed' || debt.status === 'remembered') {
    bucket = debt.disposition === 'vengeful' ? 'vengeful' : 'ally';
  }
  const lines = MORAL_HAIL_LINES[bucket] || MORAL_HAIL_LINES.pending;
  const pick = lines[hash32(debt.seed, 'hail', bucket) % lines.length];
  return pick.replace(/\{name\}/g, debt.name);
}

/** The first pending or revealed debt speaking for a faction — a faction that remembers you. */
export function moralHailForFaction(state, factionId) {
  const memory = ensureMoralMemory(state);
  for (const id of memory.order) {
    const debt = memory.debts[id];
    if (!debt || debt.factionId !== factionId) continue;
    if (debt.status !== 'pending' && debt.status !== 'revealed') continue;
    return { debtId: debt.id, name: debt.name, line: hailLineForMoralDebt(state, debt.id) };
  }
  return null;
}

// Pod debts and the hauler thank-you have their own voices (lifeLedger's pod register, the
// bark thank-you) — the news desk does not double-voice them.
const NEWS_EXCLUDED_CAUSES = new Set([
  'rescued_survivors', 'ransomed_survivors', 'captured_survivors', 'abandoned_survivors',
  HAULER_RESCUE_CAUSE,
]);

const MORAL_NEWS_LINES = Object.freeze({
  vengeful_return: Object.freeze([
    'OLD MERCY ANSWERED IN BLOOD: {name} came back over an open ledger. The spared do not always stay grateful.',
    'THE LEDGER COLLECTS: a spared hand named {name} answered mercy with guns. Out here, kindness is a debt too.',
  ]),
  ally_return: Object.freeze([
    'A SPARED HAND REMEMBERS: {name} came back not for blood but for the pilot who let them live.',
    'MERCY REPAID IN KIND: {name} returned to the registry that spared them, offering work instead of fire.',
  ]),
  forgiven: Object.freeze([
    'PARDON ON THE BAND: {name} heard the registry choose mercy twice. Grudges die hard out here.',
    'TWICE MERCY: the ledger against {name} was closed without a shot. The lane talks about it.',
  ]),
  settled: Object.freeze([
    'OLD LEDGER CLOSED: the account under {name} was settled. The lane keeps quieter books.',
    'CUSTODY ANSWER: {name} went into lawful hands; the record calls it closed.',
  ]),
});

function newsRankFor(debt) {
  if (!debt || NEWS_EXCLUDED_CAUSES.has(debt.cause)) return null;
  if (debt.status === 'returned') return debt.disposition === 'vengeful' ? 0 : 1;
  if (debt.status === 'forgiven') return 2;
  if (debt.status === 'settled') return 3;
  return null;
}

/**
 * The next ledger story worth a headline: a finished account (vengeful returns lead, then
 * allied returns, pardons, settlements) that the desk has not cited yet. Deterministic —
 * the pick is (rank, ledger order), both stable across saves.
 */
export function nextMoralNewsSeed(state) {
  const memory = ensureMoralMemory(state);
  let best = null;
  let bestRank = Infinity;
  for (const id of memory.order) {
    const debt = memory.debts[id];
    if (!debt || debt.newsCitedAt != null) continue;
    const rank = newsRankFor(debt);
    if (rank == null || rank >= bestRank) continue;
    best = debt;
    bestRank = rank;
  }
  return best;
}

/**
 * Publish the next ledger story through news:publish and stamp it so it never repeats.
 * Returns { debt, text } or null when the desk has nothing new.
 */
export function publishMoralNewsStory(state, opts = {}) {
  const debt = nextMoralNewsSeed(state);
  if (!debt) return null;
  const kind = debt.status === 'returned'
    ? (debt.disposition === 'vengeful' ? 'vengeful_return' : 'ally_return')
    : debt.status === 'forgiven' ? 'forgiven' : 'settled';
  const lines = MORAL_NEWS_LINES[kind] || MORAL_NEWS_LINES.settled;
  const text = lines[hash32(debt.seed, 'news', kind) % lines.length]
    .replace(/\{name\}/g, debt.name);
  const now = finite(opts.t, finite(state.simTime, 0));
  debt.newsCitedAt = now;
  emitBus(opts.bus, 'news:publish', {
    id: `moral-news:${debt.id}`,
    text,
    kind: 'moral_ledger',
    source: 'moral-memory',
    sourceRef: debt.id,
    eventId: `moral-news:${debt.id}`,
    t: now,
  });
  return { debt, text };
}

/**
 * The ledger at a glance — counts a HUD or an ending can quote without reading every debt.
 * Pending dispositions are never counted (the no-leak rule): the digest says how many
 * accounts are open, never how they will land.
 */
export function moralLedgerSummary(state) {
  const memory = ensureMoralMemory(state);
  const out = {
    mercyCount: memory.mercyCount | 0,
    forgivenCount: memory.forgivenCount | 0,
    testimonyCount: memory.testimonyCount | 0,
    pending: 0, pendingReturnable: 0, revealed: 0, returned: 0,
    settled: 0, forgiven: 0, remembered: 0,
    openWitnesses: 0, openOffers: 0,
    oldestPendingAt: null,
    standing: 'unwritten',
  };
  for (const id of memory.order) {
    const debt = memory.debts[id];
    if (!debt) continue;
    if (debt.status === 'pending') {
      out.pending += 1;
      if (moralCauseMayReturn(debt.cause)) out.pendingReturnable += 1;
      if (out.oldestPendingAt == null || debt.recordedAt < out.oldestPendingAt) {
        out.oldestPendingAt = debt.recordedAt;
      }
    } else if (debt.status === 'revealed') out.revealed += 1;
    else if (debt.status === 'returned') out.returned += 1;
    else if (debt.status === 'settled') out.settled += 1;
    else if (debt.status === 'forgiven') out.forgiven += 1;
    else if (debt.status === 'remembered' && debt.cause !== HAULER_RESCUE_CAUSE) out.remembered += 1;
    if (debt.offer && debt.offer.status === 'open') out.openOffers += 1;
  }
  for (const wid of memory.witnessOrder) {
    const witness = memory.witnesses[wid];
    if (witness && witness.status === 'open') out.openWitnesses += 1;
  }
  // Hauler thank-yous live off memory.order and count exactly here — the loop
  // above skips them by cause so an order-listed one can never double-count.
  out.remembered += memory.haulerOrder.length;
  out.standing = moralStandingOf(state).standing;
  return out;
}

// ── the registered system object ────────────────────────────────────────────────────────────
//
// The ledger itself needs no registry slot — writers call these functions directly or through
// the encounterDirector's moralMemory:remember listener. This object is the consequence
// layer's runtime, registered as 'moralMemory' on the calendar clock: the moralMemory:*
// action events are live verbs any system can emit, and tickMoralMemory runs on the
// fixed step under its own 30 s simTime bucket gate (R-3a9d5dc registration fix).
export const moralMemorySystem = {
  name: 'moralMemory',

  init(ctx) {
    this.state = ctx && ctx.state;
    this.bus = (ctx && ctx.bus) || null;
    this.helpers = (ctx && ctx.helpers) || {};
    this._subs = [];
    if (this.state) ensureMoralMemory(this.state);
    const on = (evt, fn) => {
      if (!this.bus || typeof this.bus.on !== 'function') return;
      const off = this.bus.on(evt, fn);
      if (typeof off === 'function') this._subs.push(off);
    };
    on('moralMemory:witness', (p) => {
      rememberMoralWitness(this.state, p || {}, { bus: this.bus });
    });
    on('moralMemory:testify', (p) => {
      const id = p && (p.witnessId != null ? p.witnessId : p.id);
      if (id != null) deliverWitnessTestimony(this.state, id, { bus: this.bus });
    });
    on('moralMemory:propagate', (p) => {
      const id = p && (p.witnessId != null ? p.witnessId : p.id);
      if (id != null) propagateMoralWitness(this.state, id, { bus: this.bus });
    });
    on('moralMemory:offer', (p) => {
      const id = p && (p.debtId != null ? p.debtId : p.id);
      if (id != null) makeMoralSettlementOffer(this.state, id, { bus: this.bus });
    });
    on('moralMemory:settle', (p) => {
      if (!p) return;
      const id = p.debtId != null ? p.debtId : p.id;
      if (id == null) return;
      if (p.accept === false || p.decline === true) {
        declineMoralSettlement(this.state, id, { bus: this.bus });
      } else {
        acceptMoralSettlement(this.state, id, { bus: this.bus, optionId: p.optionId });
      }
    });
    on('moralMemory:forgive', (p) => {
      const id = p && (p.id != null ? p.id : p.debtId);
      if (id != null) forgiveMoralDebt(this.state, id, { bus: this.bus, how: p.how });
    });
    on('moralMemory:news', () => {
      publishMoralNewsStory(this.state, { bus: this.bus });
    });
  },

  update(_dt, state) {
    tickMoralMemory(state, { bus: this.bus });
  },

  destroy() {
    for (const off of this._subs || []) {
      try { off(); } catch (err) { /* cleanup must not throw */ }
    }
    this._subs = [];
  },
};

// ── internals ───────────────────────────────────────────────────────────────────────────────

function witnessNameFor(seed, id) {
  const h = hash32(seed, id, 'moral-witness-name');
  return `${FRONTIER_FIRST_NAMES[h % FRONTIER_FIRST_NAMES.length]} ${FRONTIER_LAST_NAMES[(h >>> 9) % FRONTIER_LAST_NAMES.length]}`;
}

function publicWitness(witness) {
  return {
    id: witness.id, debtId: witness.debtId, name: witness.name,
    factionId: witness.factionId, kind: witness.kind,
    disposition: witness.disposition, generation: witness.generation | 0,
    parentId: witness.parentId || null, childId: witness.childId || null,
    status: witness.status, seenAt: witness.seenAt,
    souredAt: witness.souredAt != null ? witness.souredAt : null,
    testifiedAt: witness.testifiedAt != null ? witness.testifiedAt : null,
  };
}

function testimonyNewsLine(debt, witness) {
  const lines = witness.disposition === 'hostile'
    ? [
      `THE BAND REMEMBERS: a second voice now names ${debt.name}'s account against the registry. Word travels.`,
      `TESTIMONY SPREADS: ${witness.name} is not the first to speak of ${debt.name}. The lane keeps score.`,
    ]
    : [
      `THE BAND REMEMBERS: another voice speaks for the registry over ${debt.name}'s account. Word travels.`,
      `TESTIMONY SPREADS: ${witness.name} adds a second telling of ${debt.name}. The lane keeps score.`,
    ];
  return lines[hash32(debt.seed, witness.id, 'testimony-news') % lines.length];
}

// Drop one witness from the map and unlink it from its host debt's chain, so an
// evicted id never lingers as a stale reference the chain would walk.
function evictWitness(memory, witnessId) {
  const gone = ownKeyed(memory.witnesses, witnessId);
  delete memory.witnesses[witnessId];
  if (gone && gone.debtId) {
    const host = ownKeyed(memory.debts, gone.debtId);
    if (host && Array.isArray(host.witnessIds)) {
      const at = host.witnessIds.indexOf(witnessId);
      if (at >= 0) host.witnessIds.splice(at, 1);
    }
  }
}

function emitBus(bus, event, payload) {
  if (bus && typeof bus.emit === 'function') bus.emit(event, payload);
}

export function haulerRescueIdFor(haulerKey) {
  const key = String(haulerKey || '').trim();
  if (!key) return null;
  return `hauler-rescue:${key}`;
}

export function rememberHaulerRescue(state, payload = {}) {
  const id = haulerRescueIdFor(payload.haulerKey);
  if (!id || !state) return null;
  const memory = ensureMoralMemory(state);
  const existing = ownKeyed(memory.debts, id);
  if (existing && typeof existing === 'object' && !Array.isArray(existing)) return existing;
  const now = Number.isFinite(payload.t) ? Number(payload.t) : finite(state.simTime, 0);
  const name = String(payload.name || 'Hauler').trim() || 'Hauler';
  const debt = {
    id,
    name,
    cause: HAULER_RESCUE_CAUSE,
    factionId: payload.factionId || 'faction_free',
    archetype: 'hauler',
    recordedAt: now,
    recordedTick: Math.max(0, Math.round(now * 60)),
    seed: hash32(finite(state.meta && state.meta.seed, 0), id, 'hauler-rescue'),
    disposition: 'ally',
    status: 'remembered',
    thankedAt: null,
    source: 'haulerRescue:cleared',
    haulerKey: String(payload.haulerKey).trim(),
  };
  // Kept off memory.order on purpose: that list is the mercy-return queue and its
  // cap drops the oldest debt. A thank-you must not evict a spared pilot — but it
  // is still bounded, on its own capped index. defineProperty like the sibling
  // write — the prefix already shields '__proto__', and uniformity keeps it that way.
  Object.defineProperty(memory.debts, id, { value: debt, writable: true, enumerable: true, configurable: true });
  memory.haulerOrder.push(id);
  evictHaulerRescues(memory);
  return debt;
}

export function unreadHaulerRescue(state, haulerKey) {
  const id = haulerRescueIdFor(haulerKey);
  if (!id || !state || !state.story || !state.story.moralMemory) return null;
  const debts = state.story.moralMemory.debts;
  const debt = debts ? ownKeyed(debts, id) : null;
  if (!debt || typeof debt !== 'object' || Array.isArray(debt)
    || debt.cause !== HAULER_RESCUE_CAUSE) return null;
  if (debt.thankedAt != null) return null;
  return debt;
}

export function markHaulerRescueThanked(state, haulerKey, t) {
  const debt = unreadHaulerRescue(state, haulerKey);
  if (!debt) return null;
  debt.thankedAt = Number.isFinite(t) ? Number(t) : finite(state && state.simTime, 0);
  return debt;
}

// Drop the oldest hauler thank-yous past the cap — preferring records already
// thanked (inert) and dangling ids, so a rescue the lane still owes a nod to
// survives the longest.
function evictHaulerRescues(memory) {
  while (memory.haulerOrder.length > MORAL_MEMORY_MAX_HAULER_RESCUES) {
    let idx = 0;
    for (let i = 0; i < memory.haulerOrder.length; i++) {
      const d = memory.debts[memory.haulerOrder[i]];
      if (!d || d.thankedAt != null) { idx = i; break; }
    }
    const evicted = memory.haulerOrder.splice(idx, 1)[0];
    delete memory.debts[evicted];
  }
}

function freshMemory() {
  return {
    schemaVersion: MORAL_MEMORY_VERSION,
    mercyCount: 0,
    debts: {},
    order: [],
    witnesses: {},
    witnessOrder: [],
    haulerOrder: [],
    forgivenCount: 0,
    testimonyCount: 0,
    lastTickBucket: -1,
  };
}

// Own-property map read: inherited members ('toString', 'constructor') and the
// '__proto__' accessor must never answer for an attacker-chosen key — every
// arbitrary-key lookup in the ledger goes through this.
function ownKeyed(map, key) {
  return Object.hasOwn(map, key) ? map[key] : null;
}

function finite(value, fallback) {
  return Number.isFinite(value) ? Number(value) : fallback;
}
