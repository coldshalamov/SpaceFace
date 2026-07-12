// Pure resolution plans for endings + sandbox.
// Returns deterministic intents and receipts. Never mutates state or emits events.

import {
  ENDING_IDS,
  SANDBOX_DEF,
  SANDBOX_ID,
  endingDef,
  isEndingId,
  isSandboxId,
} from './endingDefs.js';
import {
  evaluateEndingEligibility,
  snapshotEndingFacts,
} from './eligibility.js';

/**
 * Stable receipt id from simTime + ending id + seed (no Math.random).
 */
export function endingReceiptId(endingId, simTime, seed) {
  const t = Math.floor(Number(simTime) || 0);
  const s = (Number(seed) >>> 0) || 0;
  return `ending_receipt:${endingId}:${t}:${s}`;
}

export const POST_ENDING_SCHEMA = 'spaceface.postEnding.v1';
const MAX_CONTINUITY_KEYS = 32;

/** Create the durable, event-driven continuation for an ending or explicit sandbox choice. */
export function createPostEndingContinuity(choiceId, simTime, seed) {
  const def = endingDef(choiceId);
  if (!def || !def.continuity) return null;
  const t = Math.floor(Number(simTime) || 0);
  const s = (Number(seed) >>> 0) || 0;
  return {
    schema: POST_ENDING_SCHEMA,
    choiceId: def.id,
    endingId: isSandboxId(def.id) ? null : def.id,
    sandboxMode: def.sandboxMode,
    directiveId: def.continuity.id,
    title: def.continuity.title,
    objective: def.continuity.objective,
    signal: def.continuity.signal,
    target: def.continuity.target,
    replayHookId: def.continuity.replayHookId,
    status: 'active',
    progress: 0,
    seenKeys: [],
    startedAtS: t,
    completedAtS: null,
    seed: s,
    receiptId: null,
  };
}

/** Heal save payloads and reject continuity records that no longer match authored definitions. */
export function normalizePostEndingContinuity(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const def = endingDef(raw.choiceId || raw.endingId || raw.sandboxMode);
  if (!def || !def.continuity || raw.directiveId !== def.continuity.id) return null;
  const seenKeys = Array.isArray(raw.seenKeys)
    ? [...new Set(raw.seenKeys.filter((key) => typeof key === 'string' && key).slice(-MAX_CONTINUITY_KEYS))]
    : [];
  const out = createPostEndingContinuity(def.id, raw.startedAtS, raw.seed);
  out.seenKeys = seenKeys;
  // Progress is derived from durable distinct evidence keys, never trusted as a free-standing
  // counter from a partial/older save.
  out.progress = Math.min(out.target, seenKeys.length);
  out.status = raw.status === 'complete' || out.progress >= out.target ? 'complete' : 'active';
  out.completedAtS = out.status === 'complete' ? Math.floor(Number(raw.completedAtS) || raw.startedAtS || 0) : null;
  out.receiptId = out.status === 'complete'
    ? String(raw.receiptId || continuityReceiptId(out))
    : null;
  return out;
}

/** Advance a continuation from normal public gameplay events; duplicates are stable no-ops. */
export function advancePostEndingContinuity(raw, signal, payload = {}, simTime = 0) {
  const current = normalizePostEndingContinuity(raw);
  if (!current) return { changed: false, completed: false, state: null, reason: 'no_continuity' };
  if (current.status === 'complete') return { changed: false, completed: false, state: current, reason: 'complete' };
  const def = endingDef(current.choiceId);
  const key = continuitySignalKey(def && def.continuity, signal, payload);
  if (!key) return { changed: false, completed: false, state: current, reason: 'signal_mismatch' };
  if (current.seenKeys.includes(key)) return { changed: false, completed: false, state: current, reason: 'duplicate' };

  const next = { ...current, seenKeys: current.seenKeys.concat(key).slice(-MAX_CONTINUITY_KEYS) };
  next.progress = Math.min(next.target, current.progress + 1);
  const completed = next.progress >= next.target;
  if (completed) {
    next.status = 'complete';
    next.completedAtS = Math.floor(Number(simTime) || 0);
    next.receiptId = continuityReceiptId(next);
  }
  return { changed: true, completed, state: next, key };
}

function continuitySignalKey(def, signal, payload) {
  if (!def || signal !== def.signal) return null;
  const p = payload || {};
  if (signal === 'mission:completed') {
    if (!p.missionId) return null;
    if (def.missionTypes.length && !def.missionTypes.includes(p.type)) return null;
    return 'mission:' + p.missionId;
  }
  if (signal === 'economy:tradeCompleted') {
    if (def.side && p.side !== def.side) return null;
    if (!p.stationId || !p.commodityId || !(Number(p.qty) > 0)) return null;
    return 'trade:' + p.stationId + ':' + p.commodityId;
  }
  if (signal === 'sector:enter') {
    if (!p.sectorId) return null;
    return 'sector:' + p.sectorId;
  }
  if (signal === 'scan:completed') {
    const id = p.targetId != null
      ? 'target:' + (p.sectorId || 'current') + ':' + p.targetId
      : p.sectorId ? 'sector:' + p.sectorId : null;
    return id ? 'scan:' + id : null;
  }
  return null;
}

function continuityReceiptId(state) {
  return `replay_hook:${state.replayHookId}:${state.startedAtS}:${state.seed}`;
}

/**
 * Build a resolution plan if eligible and not already resolved.
 * @returns {{ ok, reason?, plan? }}
 */
export function planEndingResolution(state, endingId, opts = {}) {
  const def = endingDef(endingId);
  if (!def) return { ok: false, reason: 'unknown_ending' };

  const facts = snapshotEndingFacts(state);
  if (facts.endgameResolved && !opts.force) {
    return { ok: false, reason: 'already_resolved', facts };
  }

  // Idempotency: same choice already filed
  if (facts.endgameChoice && facts.endgameChoice === def.id && isEndingId(def.id)) {
    return { ok: false, reason: 'already_applied', facts };
  }
  if (isSandboxId(def.id) && facts.sandboxContinued) {
    return { ok: false, reason: 'already_applied', facts };
  }

  const elig = evaluateEndingEligibility(state, def.id);
  if (!elig.eligible && !opts.skipEligibility) {
    return {
      ok: false,
      reason: 'ineligible',
      unmet: elig.unmet,
      facts,
      def,
    };
  }

  const simTime = Number(state && state.simTime) || 0;
  const seed = (state && state.meta && state.meta.seed) || 0;
  const receiptId = endingReceiptId(def.id, simTime, seed);
  const intents = buildIntents(def);
  const isSandbox = isSandboxId(def.id);

  const plan = Object.freeze({
    id: def.id,
    key: def.key,
    title: def.title,
    isEnding: !isSandbox,
    isSandbox,
    resolution: def.resolution,
    hudOnAccept: def.hudOnAccept,
    graffitiBulkhead: def.graffitiBulkhead || null,
    graffitiHome: def.graffitiHome || null,
    sandboxMode: def.sandboxMode,
    confirmPrompt: def.confirmPrompt,
    confirmHint: def.confirmHint,
    receipt: Object.freeze({
      id: receiptId,
      kind: isSandbox ? 'sandbox_continuation' : 'ending_resolution',
      endingId: isSandbox ? null : def.id,
      sandboxId: isSandbox ? SANDBOX_ID : null,
      sandboxMode: def.sandboxMode,
      simTime,
      seed: seed >>> 0,
      intents: intents.slice(),
    }),
    intents,
    flagsToSet: Object.freeze(collectFlags(def)),
    storyWrites: Object.freeze({
      endgameChoice: isSandbox ? null : def.id,
      endgameResolved: true,
      endgamePending: null,
      sandboxContinued: isSandbox,
      identityErased: !!(def.consequenceIntents && def.consequenceIntents.identityErased),
      stayedAtAshfall: !!(def.consequenceIntents && def.consequenceIntents.stayedAtAshfall),
      contract47bPending: !!(def.consequenceIntents && def.consequenceIntents.contract47bPending),
      loopBack: !!(def.consequenceIntents && def.consequenceIntents.loopBack),
    }),
    continuity: def.continuity || null,
  });

  return { ok: true, plan, facts, def };
}

function buildIntents(def) {
  const c = def.consequenceIntents || {};
  const intents = [];
  for (const r of (c.rep || [])) {
    intents.push(Object.freeze({
      event: 'faction:repDelta',
      payload: Object.freeze({
        factionId: r.factionId,
        delta: r.delta,
        reason: r.reason,
      }),
    }));
  }
  if (c.heatClear) {
    intents.push(Object.freeze({
      event: 'heat:clear',
      payload: Object.freeze({ reason: c.heatClear.reason }),
    }));
  }
  if (c.credits && c.credits > 0) {
    intents.push(Object.freeze({
      event: 'economy:grantCredits',
      payload: Object.freeze({
        amount: c.credits,
        reason: c.creditReason || `endgame_${def.id}`,
      }),
    }));
  }
  if (c.loopBack) {
    intents.push(Object.freeze({
      event: 'endgame:loopBack',
      payload: Object.freeze({}),
    }));
  }
  return Object.freeze(intents);
}

function collectFlags(def) {
  const flags = [];
  const c = def.consequenceIntents || {};
  for (const f of (c.flags || [])) flags.push(f);
  if (isSandboxId(def.id)) flags.push('sandbox_continued');
  return flags;
}

/**
 * Stage a pending confirmation (pure descriptor — story writes state).
 */
export function planPendingConfirmation(state, endingId) {
  const elig = evaluateEndingEligibility(state, endingId);
  if (!elig.eligible) {
    return { ok: false, reason: 'ineligible', unmet: elig.unmet, def: elig.def };
  }
  const def = elig.def;
  const simTime = Number(state && state.simTime) || 0;
  return {
    ok: true,
    pending: Object.freeze({
      choice: def.id,
      at: simTime,
      title: def.title,
      confirmPrompt: def.confirmPrompt,
      confirmHint: def.confirmHint,
    }),
    def,
    elig,
  };
}

/**
 * Verify all five endings are unique packages (ids, keys, sandbox modes, titles).
 */
export function assertEndingUniqueness() {
  const ids = new Set();
  const keys = new Set();
  const modes = new Set();
  const titles = new Set();
  for (const id of ENDING_IDS) {
    const d = endingDef(id);
    if (!d) throw new Error(`missing ending ${id}`);
    if (ids.has(d.id)) throw new Error(`dup id ${d.id}`);
    if (keys.has(d.key)) throw new Error(`dup key ${d.key}`);
    if (modes.has(d.sandboxMode)) throw new Error(`dup sandboxMode ${d.sandboxMode}`);
    if (titles.has(d.title)) throw new Error(`dup title ${d.title}`);
    ids.add(d.id);
    keys.add(d.key);
    modes.add(d.sandboxMode);
    titles.add(d.title);
  }
  // Sandbox mode must not collide with ending modes
  if (modes.has(SANDBOX_DEF.sandboxMode)) {
    throw new Error('sandbox mode collides with ending');
  }
  return true;
}
