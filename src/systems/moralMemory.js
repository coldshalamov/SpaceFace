// Generalized durable mercy/debt seam. The record lives under state.story, which already
// round-trips through saves; this module owns no update loop and needs no registry slot.
import { hash32 } from '../core/rng.js';

export const MORAL_MEMORY_VERSION = 1;
export const MORAL_MEMORY_MAX_DEBTS = 128;

export function moralTrapPartyId(offer) {
  if (!offer || !offer.stationId) return null;
  return `trap-party:${offer.stationId}:${offer.factionId || 'independent'}`;
}

export function lastTrapRefusal(state, partyId) {
  const memory = state && state.story && state.story.moralMemory;
  if (!partyId || !memory || !Array.isArray(memory.order)) return null;
  for (let i = memory.order.length - 1; i >= 0; i--) {
    const debt = memory.debts && memory.debts[memory.order[i]];
    if (debt && debt.refusal && debt.refusal.partyId === partyId) return debt;
  }
  return null;
}

export function ensureMoralMemory(state) {
  const story = state.story || (state.story = { flags: {} });
  const source = story.moralMemory;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    story.moralMemory = freshMemory();
  }
  const memory = story.moralMemory;
  memory.schemaVersion = MORAL_MEMORY_VERSION;
  if (!memory.debts || typeof memory.debts !== 'object' || Array.isArray(memory.debts)) memory.debts = {};
  if (!Array.isArray(memory.order)) memory.order = [];
  if (!Number.isInteger(memory.mercyCount) || memory.mercyCount < 0) memory.mercyCount = 0;
  return memory;
}
export function rememberMoralDebt(state, payload = {}) {
  const id = String(payload.id || payload.aceId || payload.targetId || '').trim();
  if (!id) return null;
  const memory = ensureMoralMemory(state);
  if (memory.debts[id]) return memory.debts[id];
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
  memory.debts[id] = debt;
  memory.order.push(id);
  while (memory.order.length > MORAL_MEMORY_MAX_DEBTS) {
    delete memory.debts[memory.order.shift()];
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
  const debt = memory.debts[String(id || '')];
  if (!debt || debt.status !== 'pending') return null;
  debt.status = 'revealed';
  debt.revealedAt = finite(state.simTime, 0);
  return debt;
}

export function pendingMoralDebt(state, id) {
  const memory = ensureMoralMemory(state);
  const debt = memory.debts[String(id || '')];
  return debt && debt.status === 'pending' ? debt : null;
}

// A terminal close that is not a comeback: custody, death-in-custody, pardon. The h7
// moral-return picker only reads pending returnable debts, so settling blocks every return path.
export function settleMoralDebt(state, id, how = 'custody') {
  const memory = ensureMoralMemory(state);
  const debt = memory.debts[String(id || '')];
  if (!debt || debt.status !== 'pending') return null;
  debt.status = 'settled';
  debt.settledHow = String(how || 'custody');
  debt.settledAt = finite(state.simTime, 0);
  return debt;
}

// The vengeful comeback happened (moralMemory:vengefulReturn): the debt's story is told.
// Records the return on the debt without reopening it — the picker only reads 'pending'.
export function markMoralDebtReturned(state, id) {
  const memory = ensureMoralMemory(state);
  const debt = memory.debts[String(id || '')];
  if (!debt || debt.status === 'returned') return debt || null;
  debt.status = 'returned';
  debt.returnedAt = finite(state.simTime, 0);
  return debt;
}

function freshMemory() {
  return { schemaVersion: MORAL_MEMORY_VERSION, mercyCount: 0, debts: {}, order: [] };
}

function finite(value, fallback) {
  return Number.isFinite(value) ? Number(value) : fallback;
}
