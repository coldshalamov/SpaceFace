// Phase-B stage 1: typed command channel between the main thread (accumulator /
// directive sender) and the whole-sim worker.
//
// One FIFO ring of stamped envelopes crosses per directive: {input|bus|settings|rpc}.
// The worker folds each envelope in wire order — identical to the old ad-hoc
// {input, commands} message but every directive-side mutation now flows through a
// typed, sequenced channel that the production flip (stage 6) reuses.
//
// - input   : folded input snapshot (gamepad/keys sampled main-side; applyInput's
//             merge fold is unchanged worker-side)
// - bus     : scenario/combat commands (combatAction, scenarioBranch — same wire
//             records the tape carried)
// - settings: allowlisted state writes (pause/timeScale class — drains even on
//             steps:0 directives, matching the runner-level gate semantics)
// - rpc     : request/ack pairs for the hard-sync seams stage 5 remediates
//             (promoteAsteroidFieldRock, economy.quote, physicsPrep); stage 1 only
//             carries the transport — 'noop' echoes an ack
//
// inputCommandSeq on a completed tick names the newest input envelope that tick
// consumed — the P7 input-latency attribution completedTick.inputCommandSeq/
// inputWallMs fields were already shaped for.
//
// Pure module: no argv reads, no self-execute, no process-global mutation.

import { applyInput, applyTapeCommands } from './simScenarioDriver.mjs';

export const SIM_COMMAND_TYPES = Object.freeze({
  INPUT: 'input',
  BUS: 'bus',
  SETTINGS: 'settings',
  RPC: 'rpc',
});

// Allowlisted state paths a settings envelope may write. Bounded on purpose —
// widening is a stage-gated decision, not a call-site one.
const SETTINGS_WRITERS = Object.freeze({
  'timeScale': (state, value) => {
    if (!Number.isFinite(value) || value < 0) return { ok: false, reason: 'timeScale must be a non-negative number' };
    state.timeScale = value;
    return { ok: true };
  },
  'settings.gameplay.difficulty': (state, value) => {
    if (typeof value !== 'string' || !value) return { ok: false, reason: 'difficulty must be a non-empty string' };
    state.settings.gameplay.difficulty = value;
    return { ok: true };
  },
});

export function createSimCommandRing() {
  const pending = [];
  let seq = 0;
  let enqueued = 0;
  let drained = 0;
  return {
    push(type, p, meta = {}) {
      seq += 1;
      enqueued += 1;
      pending.push({
        seq,
        t: type,
        p: p === undefined ? null : p,
        wallMs: Number.isFinite(meta.wallMs) ? meta.wallMs : 0,
      });
      return seq;
    },
    pushInput(input, meta) { return this.push(SIM_COMMAND_TYPES.INPUT, { input }, meta); },
    pushBus(command, meta) { return this.push(SIM_COMMAND_TYPES.BUS, command, meta); },
    pushSettings(path, value, meta) { return this.push(SIM_COMMAND_TYPES.SETTINGS, { path, value }, meta); },
    pushRpc(id, op, payload, meta) { return this.push(SIM_COMMAND_TYPES.RPC, { id, op, payload }, meta); },
    drain() {
      const out = pending.splice(0, pending.length);
      drained += out.length;
      return out;
    },
    get size() { return pending.length; },
    get enqueued() { return enqueued; },
    get drained() { return drained; },
    get lastSeq() { return seq; },
  };
}

// Worker side: apply one wire envelope to the sim. ctx = { state, helpers, inputOptions }.
// Returns { type, rpcAck? , inputSeq?, inputWallMs? } so the caller can stamp
// completedTick attribution and reply acks. Throws propagate — a rejected bus
// command must fail the directive exactly as it failed the loop body before.
export function applySimCommandEnvelope(env, ctx) {
  const { state, helpers, inputOptions } = ctx;
  const p = env && env.p;
  switch (env && env.t) {
    case SIM_COMMAND_TYPES.INPUT: {
      const input = p && typeof p === 'object' && p.input && typeof p.input === 'object'
        ? p.input
        : p;
      applyInput(state, input || {}, inputOptions || {});
      return { type: SIM_COMMAND_TYPES.INPUT, inputSeq: env.seq, inputWallMs: env.wallMs };
    }
    case SIM_COMMAND_TYPES.BUS:
      applyTapeCommands(state, helpers, [p]);
      return { type: SIM_COMMAND_TYPES.BUS };
    case SIM_COMMAND_TYPES.SETTINGS: {
      const writer = p && typeof p === 'object' ? SETTINGS_WRITERS[p.path] : undefined;
      if (!writer) {
        return { type: SIM_COMMAND_TYPES.SETTINGS, ack: { path: p && p.path, ok: false, reason: 'settings-path-not-writable' } };
      }
      const result = writer(state, p.value);
      return { type: SIM_COMMAND_TYPES.SETTINGS, ack: { path: p.path, ...result } };
    }
    case SIM_COMMAND_TYPES.RPC: {
      const id = p && p.id;
      if (p && p.op === 'noop') {
        return { type: SIM_COMMAND_TYPES.RPC, rpcAck: { id, ok: true } };
      }
      return { type: SIM_COMMAND_TYPES.RPC, rpcAck: { id, ok: false, reason: 'unhandled-rpc-op' } };
    }
    default:
      return { type: 'unknown', ack: { ok: false, reason: 'unknown-envelope-type' } };
  }
}

// Drain a wire batch in order; aggregates the completedTick attribution fields
// and ack payloads the directive reply must carry.
export function drainSimCommandEnvelopes(envelopes, ctx) {
  const out = { inputSeq: 0, inputWallMs: 0, rpcAcks: [], settingsAcks: [], dropped: 0 };
  if (!Array.isArray(envelopes)) return out;
  for (const env of envelopes) {
    if (!env || typeof env !== 'object') { out.dropped += 1; continue; }
    const r = applySimCommandEnvelope(env, ctx);
    if (r.inputSeq) { out.inputSeq = r.inputSeq; out.inputWallMs = r.inputWallMs || 0; }
    if (r.rpcAck) out.rpcAcks.push(r.rpcAck);
    if (r.ack) out.settingsAcks.push(r.ack);
    if (r.type === 'unknown') out.dropped += 1;
  }
  return out;
}
