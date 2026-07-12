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
