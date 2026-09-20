// Pure, one-shot plans + existing post-ending activity contracts. Only story applies them.
import { ENDING_IDS, SANDBOX_DEF, SANDBOX_ID, endingDef, isSandboxId } from './endingDefs.js';
import { evaluateEndingEligibility, snapshotEndingFacts, assessEndingHistory } from './eligibility.js';
import { createWrittenFinale } from './finaleRuntime.js';
import { number, timestamp, key, freeze, object } from './value.js';

export const endingReceiptId = (id, simTime, seed) => `ending_receipt:${id}:${Math.floor(Math.max(0, number(simTime)))}:${number(seed) >>> 0}`;
export const POST_ENDING_SCHEMA = 'spaceface.postEnding.v1';
const MAX_CONTINUITY_KEYS = 32;
// Preserve old evidence keys while refusing ambiguous delimiters. Numeric runtime entity ids work.
const segment = value => {
  const s = key(value);
  return s && !/[\s\u0000-\u001f:]/.test(s) && s.length <= 160 ? s : null;
};
function signalKey(def, signal, payload) {
  if (!def || signal !== def.signal) return null;
  const p = object(payload);
  if (signal === 'mission:completed') {
    const id = segment(p.missionId);
    return id && (!def.missionTypes.length || def.missionTypes.includes(p.type)) ? `mission:${id}` : null;
  }
  if (signal === 'economy:tradeCompleted') {
    const station = segment(p.stationId), commodity = segment(p.commodityId);
    return station && commodity && number(p.qty) > 0 && (!def.side || p.side === def.side)
      ? `trade:${station}:${commodity}` : null;
  }
  if (signal === 'sector:enter') {
    const id = segment(p.sectorId); return id ? `sector:${id}` : null;
  }
  if (signal === 'scan:completed') {
    const sector = segment(p.sectorId);
    if (!sector) return null; // target id alone can be recycled in another region; no 'current' alias
    if (p.targetId != null) { const target = segment(p.targetId); return target ? `scan:target:${sector}:${target}` : null; }
    return `scan:sector:${sector}`;
  }
  return null;
}
function validEvidence(def, k) {
  if (typeof k !== 'string' || k.length > 384) return false;
  const a = k.split(':');
  if (def.signal === 'mission:completed') return a.length === 2 && a[0] === 'mission' && !!segment(a[1]);
  if (def.signal === 'economy:tradeCompleted') return a.length === 3 && a[0] === 'trade' && a.slice(1).every(segment);
  if (def.signal === 'sector:enter') return a.length === 2 && a[0] === 'sector' && !!segment(a[1]);
  if (def.signal === 'scan:completed') return (a.length === 3 && a[0] === 'scan' && a[1] === 'sector' && !!segment(a[2]))
    || (a.length === 4 && a[0] === 'scan' && a[1] === 'target' && a.slice(2).every(segment));
  return false;
}
const continuityReceiptId = s => `replay_hook:${s.replayHookId}:${s.startedAtS}:${s.seed}`;
export function createPostEndingContinuity(id, simTime, seed) {
  const def = endingDef(id); if (!def?.continuity) return null;
  const c = def.continuity;
  return { schema: POST_ENDING_SCHEMA, choiceId: def.id, endingId: isSandboxId(def.id) ? null : def.id,
    sandboxMode: def.sandboxMode, directiveId: c.id, title: c.title, objective: c.objective,
    signal: c.signal, target: c.target, replayHookId: c.replayHookId,
    status: 'active', progress: 0, seenKeys: [], startedAtS: Math.floor(Math.max(0, number(simTime))),
    completedAtS: null, seed: number(seed) >>> 0, receiptId: null };
}
export function normalizePostEndingContinuity(raw) {
  const r = object(raw), def = endingDef(r.choiceId || r.endingId || r.sandboxMode);
  if (!def?.continuity || r.directiveId !== def.continuity.id) return null;
  if (r.schema && r.schema !== POST_ENDING_SCHEMA) return null;
  const out = createPostEndingContinuity(def.id, r.startedAtS, r.seed);
  out.seenKeys = [...new Set((Array.isArray(r.seenKeys) ? r.seenKeys : []).filter(k => validEvidence(def.continuity, k)))].slice(0, MAX_CONTINUITY_KEYS);
  out.progress = Math.min(out.target, out.seenKeys.length);
  out.status = out.progress >= out.target ? 'complete' : 'active';
  out.completedAtS = out.status === 'complete'
    ? (timestamp(r.completedAtS) && r.completedAtS >= out.startedAtS ? r.completedAtS : out.startedAtS) : null;
  out.receiptId = out.status === 'complete' ? continuityReceiptId(out) : null;
  return out;
}
export function advancePostEndingContinuity(raw, signal, payload = {}, simTime = 0) {
  const current = normalizePostEndingContinuity(raw);
  if (!current) return { changed: false, completed: false, state: null, reason: 'no_continuity' };
  if (current.status === 'complete') return { changed: false, completed: false, state: current, reason: 'complete' };
  if (!timestamp(simTime) || simTime < current.startedAtS) return { changed: false, completed: false, state: current, reason: 'invalid_time' };
  const k = signalKey(endingDef(current.choiceId).continuity, signal, payload);
  if (!k) return { changed: false, completed: false, state: current, reason: 'signal_mismatch' };
  if (current.seenKeys.includes(k)) return { changed: false, completed: false, state: current, reason: 'duplicate' };
  const next = { ...current, seenKeys: [...current.seenKeys, k], progress: current.progress + 1 };
  const completed = next.progress >= next.target;
  if (completed) { next.status = 'complete'; next.completedAtS = simTime; next.receiptId = continuityReceiptId(next); }
  return { changed: true, completed, state: next, key: k };
}

function buildIntents(def, receiptId) {
  const c = def.consequenceIntents, out = [];
  for (const r of c.rep) out.push({ event: 'faction:repDelta', payload: { ...r } });
  if (c.heatClear) out.push({ event: 'heat:clear', payload: { ...c.heatClear } });
  if (c.credits > 0) out.push({ event: 'economy:grantCredits', payload: { amount: c.credits, reason: c.creditReason || `endgame_${def.id}` } });
  if (c.loopBack) out.push({ event: 'endgame:loopBack', payload: {} });
  return freeze(out.map((intent, index) => ({ ...intent,
    payload: { ...intent.payload, endingReceiptId: receiptId, endingEffectId: `${receiptId}:effect:${index}` } })));
}

/** No public force/skip-eligibility escape hatch: a filed life cannot receive a second payout. */
export function planEndingResolution(state, id, opts = {}) {
  const def = endingDef(id);
  if (!def) return { ok: false, reason: 'unknown_ending' };
  const eligibility = evaluateEndingEligibility(state, def.id), facts = eligibility.facts;
  if (facts.endgameResolved) return { ok: false, reason: 'already_resolved', facts };
  if (opts.force || opts.skipEligibility) return { ok: false, reason: 'unsafe_override', facts };
  if (!eligibility.eligible) return { ok: false, reason: 'ineligible', unmet: eligibility.unmet, facts, def };
  const receiptId = endingReceiptId(def.id, facts.simTime, facts.seed);
  const sandbox = isSandboxId(def.id), intents = buildIntents(def, receiptId), c = def.consequenceIntents;
  const plan = freeze({ id: def.id, key: def.key, title: def.title, isEnding: !sandbox, isSandbox: sandbox,
    resolution: def.resolution, hudOnAccept: def.hudOnAccept, graffitiBulkhead: def.graffitiBulkhead,
    graffitiHome: def.graffitiHome, sandboxMode: def.sandboxMode,
    confirmPrompt: def.confirmPrompt, confirmHint: def.confirmHint,
    receipt: { id: receiptId, kind: sandbox ? 'sandbox_continuation' : 'ending_resolution',
      endingId: sandbox ? null : def.id, sandboxId: sandbox ? SANDBOX_ID : null,
      sandboxMode: def.sandboxMode, simTime: facts.simTime, seed: facts.seed, intents: intents.slice() },
    intents, flagsToSet: [...c.flags],
    storyWrites: { endgameChoice: sandbox ? null : def.id, endgameResolved: true, endgamePending: null,
      sandboxContinued: sandbox, identityErased: !!c.identityErased, stayedAtAshfall: !!c.stayedAtAshfall,
      contract47bPending: !!c.contract47bPending, loopBack: !!c.loopBack },
    continuity: def.continuity,
    // This frozen record must be cloned by its sole writer before adding playback cursors.
    writtenFinale: sandbox ? null : createWrittenFinale(def.id, facts, receiptId),
    assessment: assessEndingHistory(state),
  });
  return { ok: true, plan, facts, def };
}
export function planPendingConfirmation(state, id) {
  const elig = evaluateEndingEligibility(state, id);
  if (!elig.eligible) return { ok: false, reason: 'ineligible', unmet: elig.unmet, def: elig.def };
  const def = elig.def;
  return { ok: true, pending: freeze({ choice: def.id, at: elig.facts.simTime,
    title: def.title, confirmPrompt: def.confirmPrompt, confirmHint: def.confirmHint }), def, elig };
}
export function assertEndingUniqueness() {
  for (const field of ['id', 'key', 'sandboxMode', 'title']) {
    const values = ENDING_IDS.map(id => endingDef(id)[field]);
    if (new Set(values).size !== 5) throw new Error(`duplicate ending ${field}`);
  }
  if (ENDING_IDS.some(id => endingDef(id).sandboxMode === SANDBOX_DEF.sandboxMode)) throw new Error('sandbox collision');
  return true;
}
