// Generalized durable mercy/debt seam. The record lives under state.story, which already
// round-trips through saves; this module owns no update loop and needs no registry slot.
import { hash32 } from '../core/rng.js';

export const MORAL_MEMORY_VERSION = 1;

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
  memory.mercyCount += 1;
  memory.debts[id] = debt;
  memory.order.push(id);
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

export function nextMoralDebt(state) {
  const memory = ensureMoralMemory(state);
  for (const id of memory.order) {
    const debt = memory.debts[id];
    if (debt && debt.status === 'pending') return debt;
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

function freshMemory() {
  return { schemaVersion: MORAL_MEMORY_VERSION, mercyCount: 0, debts: {}, order: [] };
}

function finite(value, fallback) {
  return Number.isFinite(value) ? Number(value) : fallback;
}
