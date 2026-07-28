// PQ-019B — the pure outcome arbiter for the physical cargo heist.
//
// WHAT THIS IS: a deterministic, side-effect-free state machine that decides ONE immutable terminal
// outcome for one heist, from plain candidate reports. It is a library, not a registered system.
//
// PURITY CONTRACT (the reason this module exists at all):
//   * No bus, no renderer, no entities, no economy, no law, no heat, no mission, no save. It imports
//     exactly one repo symbol — hash32 — and otherwise touches nothing.
//   * Selection NEVER reads callback order, insertion order, wall time, live entity ids, or
//     randomness. Every ordering key is a value carried by the candidate itself.
//   * All owned state is plain JSON. `serializeArbiter`/`restoreArbiter` round-trip it exactly, so a
//     save boundary in the middle of arbitration is just a value copy. This module adds NO save key
//     and NO schema version: its consumer (PQ-019C) nests the record inside the mission owner's
//     already-serialized active-mission structure.
//
// WHY A SEPARATE MODULE: the owners that must act on an outcome (law, heat, NPC jobs, the physical
// receiver) each have private mutation paths and live coupling. If the decision lived inside any one
// of them, "who won" would depend on which listener ran first. Here the decision is a pure function
// of the candidate SET, so every callback permutation, duplicate delivery, and replay converges.
//
// ─── Arbitration model ──────────────────────────────────────────────────────────────────────────
// Nonterminal PROGRESS and terminal OUTCOME are separate axes. Progress is a forward-only chain the
// consumer asserts; outcome is decided once from competing candidate reports and then frozen.
//
//   scheduled -> launched -> possessed -> pursued -> escaped -> receiver_pending
//        \          \           \           \           \            \
//         \----------+-----------+-----------+-----------+------------> resolution_pending
//                                                                              |
//                                                                              v
//                                                                          terminal
//
// A decision is never taken in the same tick a candidate was reported: same-step reports are
// BUFFERED and become eligible only at `causalTick + 1`. That is what makes "all callbacks for tick
// T, in any order" a set rather than a race.
//
// ─── TWO PRECONDITIONS ON THE CONSUMER (PQ-019C) ────────────────────────────────────────────────
// SELECTION is order-independent and proven so. ADMISSION is not, and neither is stamping. Both of
// the following are the consumer's responsibility and cannot be enforced from inside a pure module:
//
//   1. WITHIN A TICK, SUBMIT BEFORE YOU STEP. `stepArbiter(T)` closes the window through `T - 1`,
//      after which a report stamped `T - 1` is refused as `stale_tick`. A consumer that steps first
//      and submits second — e.g. one that polls a publisher's candidate list after stepping — drops
//      exactly the reports it was polling for, and the heist then falls through to `expired` with no
//      terminal ever selected. The drop is RECORDED in `rejected[]` rather than silent, so it is
//      diagnosable; it is still wrong. Submit every report for the tick, then step once.
//
//   2. STAMP `causalTick` FROM THE CAUSING EVENT, NEVER FROM A CACHED OR CURRENT CLOCK. Because the
//      earliest causal fact wins across ticks (see `compareCandidates`), a low `causalTick` is a
//      PRIVILEGE: an under-stamped late report will outrank a newer, truer physical fact. The tick
//      must come from the event that caused the report — the physics impact, the destruction, the
//      expiry — not from whenever the consumer got around to forwarding it.

import { hash32 } from '../core/rng.js';

export const HEIST_ARBITER_SCHEMA = 'spaceface.heistArbiter.v1';

/** Forward-only nonterminal progress chain. Index order IS the legal order. */
export const HEIST_PROGRESS_CHAIN = Object.freeze([
  'scheduled',
  'launched',
  'possessed',
  'pursued',
  'escaped',
  'receiver_pending',
]);

export const HEIST_RESOLUTION_PHASE = 'resolution_pending';
export const HEIST_TERMINAL_PHASE = 'terminal';

export const HEIST_PHASES = Object.freeze([
  ...HEIST_PROGRESS_CHAIN,
  HEIST_RESOLUTION_PHASE,
  HEIST_TERMINAL_PHASE,
]);

/**
 * Terminal precedence, highest authority first.
 *
 * The first six are the packet's pinned chain, verbatim:
 *   destroyed > confiscated > fenced > lawful_arrival > expired > unresolved_absent
 *
 * `abandoned` is the packet's seventh terminal outcome and appears NOWHERE in that chain. RULING
 * (PQ-019B, recorded rather than silently interpolated): abandonment ranks LAST. It is the weakest
 * possible claim — a statement that nobody pursued the payload. Any physical fact (destruction,
 * confiscation, a completed fence handoff, a lawful arrival) and even a bounded timeout describe
 * something that actually happened to the capsule, and must outrank "the player walked away."
 * Placing it anywhere else would let an abandonment report erase a real physical outcome.
 */
export const HEIST_TERMINAL_PRECEDENCE = Object.freeze([
  'payload_destroyed',
  'lawful_confiscation',
  'fenced_success',
  'lawful_arrival_observed',
  'expired',
  'unresolved_absent',
  'abandoned',
]);

/** The one nonterminal report. Progress beyond possession is asserted, not arbitrated. */
export const HEIST_NONTERMINAL_KINDS = Object.freeze(['possession']);

/**
 * The TOTAL candidate vocabulary. A `kind` outside this set is rejected and RECORDED — never
 * silently dropped, because a dropped terminal report is an invisible mission soft-lock.
 *
 * Facility/physics vocabulary (`lawful_catch_contact`, `fence_contact`, …) is deliberately absent:
 * mapping a physical contact to a legal outcome is mission policy, and the arbiter must not know
 * what a fence is. The consumer performs that mapping and submits one of these kinds.
 */
export const HEIST_CANDIDATE_KINDS = Object.freeze([
  ...HEIST_TERMINAL_PRECEDENCE,
  ...HEIST_NONTERMINAL_KINDS,
]);

/** Effect-journal slots. One idempotency key per owner effect a terminal outcome may request. */
export const HEIST_EFFECT_SLOTS = Object.freeze([
  'lawIncident',
  'heatApplication',
  'jobControlRelease',
  'receiverCommit',
  'missionSettlement',
  'economyReward',
  'factionOutcome',
  'capsuleProjection',
]);

const MAX_CANDIDATES = 64;
const MAX_REJECTED = 32;

const TERMINAL_RANK = new Map(HEIST_TERMINAL_PRECEDENCE.map((kind, index) => [kind, index]));
const KIND_SET = new Set(HEIST_CANDIDATE_KINDS);
const PROGRESS_INDEX = new Map(HEIST_PROGRESS_CHAIN.map((phase, index) => [phase, index]));

/** `hash32` joins its arguments with `|`, so an id carrying `|` could forge another id's hash. */
function cleanId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 200 || trimmed.includes('|')) return null;
  return trimmed;
}

function cleanTick(value) {
  return Number.isInteger(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : null;
}

/** Deep, order-stable, JSON-safe copy. Refuses anything that cannot survive a save round-trip. */
function stableClone(value, depth = 0) {
  if (depth > 6) return undefined;
  if (value === null) return null;
  const type = typeof value;
  if (type === 'string' || type === 'boolean') return value;
  if (type === 'number') return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    const out = [];
    for (const item of value) {
      const copy = stableClone(item, depth + 1);
      if (copy !== undefined) out.push(copy);
    }
    return out;
  }
  if (type === 'object') {
    if (Object.getPrototypeOf(value) !== Object.prototype
      && Object.getPrototypeOf(value) !== null) return undefined;
    const out = {};
    for (const key of Object.keys(value).sort()) {
      const copy = stableClone(value[key], depth + 1);
      if (copy !== undefined) out[key] = copy;
    }
    return out;
  }
  return undefined;
}

export function isTerminalKind(kind) {
  return TERMINAL_RANK.has(kind);
}

/**
 * The packet's identity: hash(missionId, payloadStableId, kind, causalTick, sourceStableId).
 *
 * `proof` is deliberately NOT part of identity. Two reports of the same fact from the same source at
 * the same tick ARE the same candidate however differently they are decorated, so a metadata twin
 * cannot manufacture a second vote. The first accepted proof is kept.
 */
export function candidateIdFor({ missionId, payloadStableId, kind, causalTick, sourceStableId }) {
  return `hc_${hash32(missionId, payloadStableId, kind, causalTick, sourceStableId).toString(36)}`;
}

/**
 * Validate and canonicalize one report. Returns `{ ok: true, candidate }` or `{ ok: false, reason }`.
 * Never throws: a malformed report from any owner is data, not a crash.
 */
export function normalizeCandidate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, reason: 'not_an_object' };
  }
  const missionId = cleanId(input.missionId);
  if (!missionId) return { ok: false, reason: 'invalid_mission_id' };
  const payloadStableId = cleanId(input.payloadStableId);
  if (!payloadStableId) return { ok: false, reason: 'invalid_payload_id' };
  const sourceStableId = cleanId(input.sourceStableId);
  if (!sourceStableId) return { ok: false, reason: 'invalid_source_id' };
  const kind = typeof input.kind === 'string' ? input.kind.trim() : null;
  if (!kind || !KIND_SET.has(kind)) return { ok: false, reason: 'unknown_kind' };
  const causalTick = cleanTick(input.causalTick);
  if (causalTick === null) return { ok: false, reason: 'invalid_causal_tick' };

  let proof = {};
  if (input.proof !== undefined && input.proof !== null) {
    const cloned = stableClone(input.proof);
    if (cloned === undefined || typeof cloned !== 'object' || Array.isArray(cloned)) {
      return { ok: false, reason: 'invalid_proof' };
    }
    proof = cloned;
  }

  const candidateId = candidateIdFor({
    missionId, payloadStableId, kind, causalTick, sourceStableId,
  });
  // A caller may echo an id back (e.g. replaying a journal). It must agree with the content hash;
  // a disagreeing id is a forged or corrupted record and is refused outright.
  if (input.candidateId !== undefined && input.candidateId !== candidateId) {
    return { ok: false, reason: 'forged_candidate_id' };
  }

  return {
    ok: true,
    candidate: Object.freeze({
      candidateId,
      missionId,
      payloadStableId,
      kind,
      causalTick,
      sourceStableId,
      proof: Object.freeze(proof),
      terminal: isTerminalKind(kind),
    }),
  };
}

/**
 * Total order over candidates. EVERY key is intrinsic to the candidate — none is positional.
 *
 * 1. `causalTick` ascending. The earliest causal fact wins. RULING (PQ-019B): the packet pins
 *    precedence only "at one tick" and is silent across ticks. Earliest-first is the truthful rule —
 *    once the capsule expired at tick 100 a destruction report stamped 105 is post-hoc — and it is
 *    the only rule that makes the causalTick+1 buffer meaningful rather than decorative.
 * 2. Terminal before nonterminal, then the pinned terminal precedence chain.
 * 3. `candidateId` ascending — the packet's stated final tie-break.
 */
export function compareCandidates(a, b) {
  if (a.causalTick !== b.causalTick) return a.causalTick - b.causalTick;
  const rankA = a.terminal ? TERMINAL_RANK.get(a.kind) : HEIST_TERMINAL_PRECEDENCE.length;
  const rankB = b.terminal ? TERMINAL_RANK.get(b.kind) : HEIST_TERMINAL_PRECEDENCE.length;
  if (rankA !== rankB) return rankA - rankB;
  return a.candidateId < b.candidateId ? -1 : a.candidateId > b.candidateId ? 1 : 0;
}

/**
 * Pure selection over an explicit candidate list. The list is COPIED and sorted before anything is
 * read, so the argument's order cannot reach the result.
 *
 * `decisionTick` gates eligibility: a candidate reported at tick T is only considered from T+1.
 */
export function selectOutcome(candidates, decisionTick) {
  const tick = cleanTick(decisionTick);
  const eligible = (Array.isArray(candidates) ? candidates : [])
    .filter((c) => c && tick !== null && c.causalTick + 1 <= tick);

  // TWO LANES, NOT ONE SORT. Terminal outcome and nonterminal progress are different axes, so a
  // possession report never competes with a terminal one. Ranking them together would let an
  // earlier possession (tick 40) suppress a later confiscation (tick 41) purely because
  // earliest-causal-first put it at the head of the list — silently stranding a decided heist in
  // `possessed` forever. "Nonterminal possession applies only when no terminal candidate wins"
  // means exactly this: terminals are considered first, alone.
  const terminals = eligible.filter((c) => c.terminal).slice().sort(compareCandidates);
  if (terminals.length > 0) {
    return {
      decided: true, terminal: terminals[0], possession: null, eligibleCount: eligible.length,
    };
  }
  // The MOST RECENT possession describes who holds the capsule now; earlier ones are history.
  const possessions = eligible.filter((c) => c.kind === 'possession').slice().sort(compareCandidates);
  return {
    decided: false,
    terminal: null,
    possession: possessions.length ? possessions[possessions.length - 1] : null,
    eligibleCount: eligible.length,
  };
}

export function createArbiter({ missionId, payloadStableId, createdAtTick = 0 } = {}) {
  const mission = cleanId(missionId);
  const payload = cleanId(payloadStableId);
  if (!mission) throw new TypeError('heistArbiter: missionId is required');
  if (!payload) throw new TypeError('heistArbiter: payloadStableId is required');
  const tick = cleanTick(createdAtTick);
  return {
    schema: HEIST_ARBITER_SCHEMA,
    missionId: mission,
    payloadStableId: payload,
    createdAtTick: tick === null ? 0 : tick,
    phase: 'scheduled',
    // The last tick fully arbitrated. Reports stamped at or before it arrive after their window
    // closed and are refused as stale.
    decidedThroughTick: -1,
    candidates: [],
    candidateIds: {},
    rejected: [],
    receipt: null,
    effects: {},
  };
}

/**
 * Legal transitions:
 *   * self -> self is a no-op (replay must be able to re-assert the current phase);
 *   * a progress phase advances to exactly the NEXT link, or short-circuits to resolution_pending;
 *   * resolution_pending -> terminal;
 *   * terminal is immutable — nothing leaves it.
 */
export function isValidTransition(from, to) {
  if (!HEIST_PHASES.includes(from) || !HEIST_PHASES.includes(to)) return false;
  if (from === to) return true;
  if (from === HEIST_TERMINAL_PHASE) return false;
  if (from === HEIST_RESOLUTION_PHASE) return to === HEIST_TERMINAL_PHASE;
  if (to === HEIST_RESOLUTION_PHASE) return true;
  const fromIndex = PROGRESS_INDEX.get(from);
  const toIndex = PROGRESS_INDEX.get(to);
  return toIndex !== undefined && toIndex === fromIndex + 1;
}

/** Assert a nonterminal progress phase. Returns `{ ok, phase, reason? }`; never throws. */
export function applyTransition(arbiter, to) {
  if (!arbiter) return { ok: false, phase: null, reason: 'no_arbiter' };
  if (!isValidTransition(arbiter.phase, to)) {
    return { ok: false, phase: arbiter.phase, reason: 'illegal_transition' };
  }
  arbiter.phase = to;
  return { ok: true, phase: arbiter.phase };
}

function recordRejection(arbiter, reason, input) {
  arbiter.rejected.push({
    reason,
    kind: typeof input?.kind === 'string' ? input.kind.slice(0, 64) : null,
    sourceStableId: cleanId(input?.sourceStableId),
    causalTick: cleanTick(input?.causalTick),
  });
  while (arbiter.rejected.length > MAX_REJECTED) arbiter.rejected.shift();
}

/**
 * Buffer one report. Returns `{ accepted, reason?, candidate? }`.
 *
 * Accepted candidates are stored in sorted position, so two runs that submit the same reports in
 * different callback orders produce BYTE-IDENTICAL serialized state — not merely the same winner.
 */
export function submitCandidate(arbiter, input) {
  if (!arbiter) return { accepted: false, reason: 'no_arbiter' };

  // "Candidate journal capped and frozen at terminal." A post-terminal report cannot re-open a
  // decided outcome; refusing it here is what makes terminalReceiptCount == 1 structural.
  if (arbiter.receipt) {
    recordRejection(arbiter, 'journal_frozen', input);
    return { accepted: false, reason: 'journal_frozen' };
  }

  const normalized = normalizeCandidate(input);
  if (!normalized.ok) {
    recordRejection(arbiter, normalized.reason, input);
    return { accepted: false, reason: normalized.reason };
  }
  const candidate = normalized.candidate;

  if (candidate.missionId !== arbiter.missionId) {
    recordRejection(arbiter, 'wrong_mission', input);
    return { accepted: false, reason: 'wrong_mission' };
  }
  if (candidate.payloadStableId !== arbiter.payloadStableId) {
    recordRejection(arbiter, 'wrong_payload', input);
    return { accepted: false, reason: 'wrong_payload' };
  }
  if (candidate.causalTick <= arbiter.decidedThroughTick) {
    recordRejection(arbiter, 'stale_tick', input);
    return { accepted: false, reason: 'stale_tick' };
  }
  // Duplicate delivery is expected, not an error: the same fact, already counted once.
  if (arbiter.candidateIds[candidate.candidateId]) {
    return {
      accepted: false,
      reason: 'duplicate',
      candidate: arbiter.candidates.find((c) => c.candidateId === candidate.candidateId) || null,
    };
  }
  if (arbiter.candidates.length >= MAX_CANDIDATES) {
    recordRejection(arbiter, 'journal_full', input);
    return { accepted: false, reason: 'journal_full' };
  }

  const row = {
    candidateId: candidate.candidateId,
    missionId: candidate.missionId,
    payloadStableId: candidate.payloadStableId,
    kind: candidate.kind,
    causalTick: candidate.causalTick,
    sourceStableId: candidate.sourceStableId,
    proof: candidate.proof,
    terminal: candidate.terminal,
  };
  let at = arbiter.candidates.length;
  while (at > 0 && compareCandidates(arbiter.candidates[at - 1], row) > 0) at--;
  arbiter.candidates.splice(at, 0, row);
  arbiter.candidateIds[candidate.candidateId] = true;
  return { accepted: true, candidate: row };
}

function effectKeysFor(receiptId) {
  const keys = {};
  for (const slot of HEIST_EFFECT_SLOTS) keys[slot] = `${receiptId}:${slot}`;
  return Object.freeze(keys);
}

/**
 * Compare-and-set the ONE terminal receipt.
 *
 * Idempotent by construction: once `arbiter.receipt` exists this returns that exact receipt and does
 * not look at candidates at all. That is the whole crash-after-prepare guarantee — a process that
 * dies between prepare and commit resumes the SAME winner, because replay never re-runs selection.
 */
export function prepareTerminal(arbiter, decisionTick) {
  if (!arbiter) return { prepared: false, reason: 'no_arbiter', receipt: null };
  if (arbiter.receipt) {
    return { prepared: false, reason: 'already_prepared', receipt: arbiter.receipt, resumed: true };
  }
  const selection = selectOutcome(arbiter.candidates, decisionTick);
  if (!selection.decided) {
    return { prepared: false, reason: 'no_terminal_candidate', receipt: null, selection };
  }
  const winner = selection.terminal;
  const receiptId = `heist:receipt:${hash32(
    arbiter.missionId,
    arbiter.payloadStableId,
    winner.kind,
    winner.causalTick,
    winner.candidateId,
  ).toString(36)}`;
  arbiter.receipt = {
    receiptId,
    missionId: arbiter.missionId,
    payloadStableId: arbiter.payloadStableId,
    outcome: winner.kind,
    causalTick: winner.causalTick,
    winnerCandidateId: winner.candidateId,
    status: 'prepared',
    effectKeys: effectKeysFor(receiptId),
  };
  arbiter.phase = HEIST_RESOLUTION_PHASE;
  return { prepared: true, receipt: arbiter.receipt, selection };
}

/** Compare-and-set `prepared` -> `committed`. Re-committing is a recorded no-op, not a second commit. */
export function commitTerminal(arbiter, receiptId) {
  const receipt = arbiter?.receipt;
  if (!receipt) return { committed: false, reason: 'not_prepared', receipt: null };
  if (receiptId !== undefined && receiptId !== receipt.receiptId) {
    return { committed: false, reason: 'receipt_mismatch', receipt };
  }
  if (receipt.status === 'committed') {
    return { committed: false, reason: 'already_committed', receipt };
  }
  receipt.status = 'committed';
  arbiter.phase = HEIST_TERMINAL_PHASE;
  return { committed: true, receipt };
}

/**
 * The effect journal: the single place that answers "has this owner already acted on this receipt?"
 *
 * `applied: true` is returned to EXACTLY ONE caller per key, for the lifetime of the record — across
 * duplicate callbacks, across a crash between prepare and commit, and across a save round-trip.
 */
export function recordEffect(arbiter, effectKey, detail = {}) {
  if (!arbiter) return { applied: false, reason: 'no_arbiter', record: null };
  const key = cleanId(effectKey);
  if (!key) return { applied: false, reason: 'invalid_effect_key', record: null };
  const existing = arbiter.effects[key];
  if (existing) return { applied: false, reason: 'already_recorded', record: existing };
  const record = {
    key,
    effectId: cleanId(detail.effectId) || null,
    tick: cleanTick(detail.tick) ?? null,
    note: cleanId(detail.note) || null,
  };
  arbiter.effects[key] = record;
  return { applied: true, record };
}

export function effectRecord(arbiter, effectKey) {
  const key = cleanId(effectKey);
  return key && arbiter?.effects ? arbiter.effects[key] || null : null;
}

export function effectApplied(arbiter, effectKey) {
  return effectRecord(arbiter, effectKey) !== null;
}

/**
 * One arbitration step: close the window at `decisionTick`, apply nonterminal possession if no
 * terminal candidate outranks it, and compare-and-set a terminal receipt when one is decided.
 *
 * ORDERING PRECONDITION: this closes the admission window through `decisionTick - 1`. Submit every
 * report for the tick BEFORE calling it — see precondition 1 in the module header.
 */
export function stepArbiter(arbiter, decisionTick) {
  if (!arbiter) return { phase: null, receipt: null, possession: null };
  const tick = cleanTick(decisionTick);
  if (tick === null) return { phase: arbiter.phase, receipt: arbiter.receipt, possession: null };

  if (arbiter.receipt) {
    arbiter.decidedThroughTick = Math.max(arbiter.decidedThroughTick, tick - 1);
    return { phase: arbiter.phase, receipt: arbiter.receipt, possession: null, resumed: true };
  }

  const selection = selectOutcome(arbiter.candidates, tick);
  let possession = null;
  if (selection.decided) {
    prepareTerminal(arbiter, tick);
  } else if (selection.possession) {
    possession = selection.possession;
    // Possession is progress, not an outcome: only assert it if the chain legally allows it now.
    applyTransition(arbiter, 'possessed');
  }
  arbiter.decidedThroughTick = Math.max(arbiter.decidedThroughTick, tick - 1);
  return { phase: arbiter.phase, receipt: arbiter.receipt, possession };
}

/** Plain, order-stable snapshot. The consumer nests this inside its own serialized record. */
export function serializeArbiter(arbiter) {
  if (!arbiter) return null;
  return {
    schema: HEIST_ARBITER_SCHEMA,
    missionId: arbiter.missionId,
    payloadStableId: arbiter.payloadStableId,
    createdAtTick: arbiter.createdAtTick,
    phase: arbiter.phase,
    decidedThroughTick: arbiter.decidedThroughTick,
    candidates: arbiter.candidates.map((c) => ({
      candidateId: c.candidateId,
      missionId: c.missionId,
      payloadStableId: c.payloadStableId,
      kind: c.kind,
      causalTick: c.causalTick,
      sourceStableId: c.sourceStableId,
      proof: stableClone(c.proof) || {},
      terminal: c.terminal,
    })),
    rejected: arbiter.rejected.map((r) => ({ ...r })),
    receipt: arbiter.receipt
      ? {
        receiptId: arbiter.receipt.receiptId,
        missionId: arbiter.receipt.missionId,
        payloadStableId: arbiter.receipt.payloadStableId,
        outcome: arbiter.receipt.outcome,
        causalTick: arbiter.receipt.causalTick,
        winnerCandidateId: arbiter.receipt.winnerCandidateId,
        status: arbiter.receipt.status,
        effectKeys: { ...arbiter.receipt.effectKeys },
      }
      : null,
    effects: Object.keys(arbiter.effects).sort().reduce((out, key) => {
      out[key] = { ...arbiter.effects[key] };
      return out;
    }, {}),
  };
}

/**
 * Rebuild from a snapshot.
 *
 * Every candidate is re-normalized, so a tampered save cannot smuggle a forged id or an unknown kind
 * past the same gate a live report faces. A record that claims a decision was reached but cannot
 * produce a readable receipt yields null outright — see the fail-closed block at the end. There is
 * no half-decided arbiter, because a half-decided one is exactly the shape that pays twice.
 */
export function restoreArbiter(data) {
  if (!data || typeof data !== 'object' || data.schema !== HEIST_ARBITER_SCHEMA) return null;
  let arbiter;
  try {
    arbiter = createArbiter({
      missionId: data.missionId,
      payloadStableId: data.payloadStableId,
      createdAtTick: data.createdAtTick,
    });
  } catch {
    return null;
  }
  arbiter.phase = HEIST_PHASES.includes(data.phase) ? data.phase : 'scheduled';
  arbiter.decidedThroughTick = Number.isInteger(data.decidedThroughTick)
    ? data.decidedThroughTick
    : -1;

  for (const row of Array.isArray(data.candidates) ? data.candidates : []) {
    const normalized = normalizeCandidate(row);
    if (!normalized.ok) continue;
    const c = normalized.candidate;
    if (c.missionId !== arbiter.missionId || c.payloadStableId !== arbiter.payloadStableId) continue;
    if (arbiter.candidateIds[c.candidateId]) continue;
    if (arbiter.candidates.length >= MAX_CANDIDATES) break;
    const entry = {
      candidateId: c.candidateId,
      missionId: c.missionId,
      payloadStableId: c.payloadStableId,
      kind: c.kind,
      causalTick: c.causalTick,
      sourceStableId: c.sourceStableId,
      proof: c.proof,
      terminal: c.terminal,
    };
    let at = arbiter.candidates.length;
    while (at > 0 && compareCandidates(arbiter.candidates[at - 1], entry) > 0) at--;
    arbiter.candidates.splice(at, 0, entry);
    arbiter.candidateIds[c.candidateId] = true;
  }

  for (const row of Array.isArray(data.rejected) ? data.rejected.slice(-MAX_REJECTED) : []) {
    if (row && typeof row === 'object') {
      arbiter.rejected.push({
        reason: typeof row.reason === 'string' ? row.reason : 'unknown',
        kind: typeof row.kind === 'string' ? row.kind : null,
        sourceStableId: cleanId(row.sourceStableId),
        causalTick: cleanTick(row.causalTick),
      });
    }
  }

  const saved = data.receipt;
  if (saved && typeof saved === 'object') {
    const receiptId = cleanId(saved.receiptId);
    const winnerCandidateId = cleanId(saved.winnerCandidateId);
    const causalTick = cleanTick(saved.causalTick);
    const status = saved.status === 'committed' ? 'committed' : 'prepared';
    if (receiptId && winnerCandidateId && causalTick !== null
      && isTerminalKind(saved.outcome)) {
      arbiter.receipt = {
        receiptId,
        missionId: arbiter.missionId,
        payloadStableId: arbiter.payloadStableId,
        outcome: saved.outcome,
        causalTick,
        winnerCandidateId,
        status,
        effectKeys: effectKeysFor(receiptId),
      };
    }
  }

  // FAIL CLOSED. Phase and receipt are restored independently, so a record whose phase says a
  // decision was reached but whose receipt is missing or unreadable would come back UNFROZEN: the
  // journal would accept new candidates and `prepareTerminal` would mint a SECOND receipt, with new
  // effect keys that no longer match the effects already applied — every owner effect re-applied,
  // and possibly under a different outcome. There is no safe half-decided arbiter, so refuse the
  // whole record and let the consumer treat it as the unresolved case it actually is.
  if (!arbiter.receipt
    && (arbiter.phase === HEIST_RESOLUTION_PHASE || arbiter.phase === HEIST_TERMINAL_PHASE)) {
    return null;
  }

  for (const key of Object.keys(data.effects && typeof data.effects === 'object' ? data.effects : {})
    .sort()) {
    const row = data.effects[key];
    const clean = cleanId(key);
    if (!clean || !row || typeof row !== 'object') continue;
    arbiter.effects[clean] = {
      key: clean,
      effectId: cleanId(row.effectId) || null,
      tick: cleanTick(row.tick) ?? null,
      note: cleanId(row.note) || null,
    };
  }
  return arbiter;
}

/**
 * The packet's owner-invariant counters, read from the arbiter's own journal. Owner-side counts
 * (receiver, heat, jobs, economy) are asserted against this by the invariant suite.
 */
export function arbiterInvariants(arbiter) {
  const receipt = arbiter?.receipt || null;
  const effects = arbiter?.effects || {};
  const has = (slot) => (receipt && effects[receipt.effectKeys[slot]] ? 1 : 0);
  return {
    terminalReceiptCount: receipt ? 1 : 0,
    terminalOutcome: receipt ? receipt.outcome : null,
    terminalStatus: receipt ? receipt.status : null,
    capsuleProjectionCount: has('capsuleProjection'),
    receiverCommitCount: has('receiverCommit'),
    missionSettlementCount: has('missionSettlement'),
    economyRewardCount: has('economyReward'),
    factionOutcomeCount: has('factionOutcome'),
    heatApplicationCount: has('heatApplication'),
    lawIncidentCount: has('lawIncident'),
    candidateCount: arbiter?.candidates.length || 0,
    rejectedCount: arbiter?.rejected.length || 0,
  };
}

export default {
  createArbiter,
  submitCandidate,
  selectOutcome,
  stepArbiter,
  prepareTerminal,
  commitTerminal,
  recordEffect,
  serializeArbiter,
  restoreArbiter,
};
