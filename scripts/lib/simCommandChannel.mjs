// Phase-B stage 1: typed command channel between the main thread (accumulator /
// directive sender) and the whole-sim worker.
//
// One FIFO ring of stamped envelopes crosses per directive:
// {input|bus|settings|rpc|nav|mode|spawn|remove|promote}.
// The worker folds each envelope in wire order — identical to the old ad-hoc
// {input, commands} message but every directive-side mutation now flows through a
// typed, sequenced channel that the production flip (stage 6) reuses.
//
// - input   : folded input snapshot (gamepad/keys sampled main-side; applyInput's
//             merge fold is unchanged worker-side). May also carry p.writes — the
//             input.* fold: allowlisted main-lane writes (targetId, blocked, ...)
//             applied immediately after applyInput in wire order. A writes-only
//             envelope passes input:null and skips applyInput.
// - bus     : scenario/combat commands (combatAction, scenarioBranch — same wire
//             records the tape carried)
// - settings: allowlisted state writes (pause/timeScale class — drains even on
//             steps:0 directives). The allowlist lives in src/core/simLaneCommands.js
//             and is shared with the production lane writers.
// - nav     : state.nav.waypoint set/clear (trade/set-course seam)
// - mode    : state.mode write — worker applies and emits mode:changed on its bus
// - spawn   : {token, spec} → helpers.spawnEntity; ack carries token→entity id
// - remove  : {token, id, opts} → helpers.removeEntity
// - promote : {id, source, reason} → far-row promotion seam (renderer promote sites);
//             the promoted row's aux removal rides the existing aux channel.
// - rpc     : request/ack pairs for the hard-sync seams stage 5 remediates
//             (physicsPrep, economy.quote, newGame boot); 'noop' echoes an ack.
//             Handlers live in ctx.rpcHandlers (worker-supplied).
// - dom     : stage-8 DOM-event descriptor (key/pointer/mouse/blur/resize). The
//             reducer runs whichever realm the sim is on; DOM-only facts
//             (uiCommand, offCanvas, neutralize) are computed on the DOM realm
//             before shipping. Worker applies via ctx.ingestDomEvent.
// - ui      : stage-8 ui-fold snapshot {screenStackLen, modalActive} — the sim
//             needs the screen-stack depth (not contents) for
//             shouldNeutralizeFlightInput plus the document.body modal latch.
//             Worker applies via ctx.applyUiFold.
// - viewport: stage-8 viewport size {w, h} — overrides innerWidth/innerHeight
//             reads (viewportSize/stickViewport) inside the sim realm.
//
// inputCommandSeq on a completed tick names the newest input envelope that tick
// consumed — the P7 input-latency attribution completedTick.inputCommandSeq/
// inputWallMs fields were already shaped for.
//
// Pure module: no argv reads, no self-execute, no process-global mutation.

import { applyInput, applyTapeCommands } from './simScenarioDriver.mjs';
import {
  applyLaneInputWrites,
  applyLaneMode,
  applyLaneNav,
  applyLaneSetting,
} from '../../src/core/simLaneCommands.js';

export const SIM_COMMAND_TYPES = Object.freeze({
  INPUT: 'input',
  BUS: 'bus',
  SETTINGS: 'settings',
  RPC: 'rpc',
  NAV: 'nav',
  MODE: 'mode',
  SPAWN: 'spawn',
  REMOVE: 'remove',
  PROMOTE: 'promote',
  DOM: 'dom',
  UI: 'ui',
  VIEWPORT: 'viewport',
});

export function createSimCommandRing() {
  const pending = [];
  let foldBuffer = [];
  let seq = 0;
  let enqueued = 0;
  let drained = 0;
  const ring = {
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
    pushInput(input, meta) {
      // Fold buffer rides the next input envelope — writes apply right after
      // applyInput in wire order. A writes-only flush happens at drain.
      const p = { input };
      if (foldBuffer.length) { p.writes = foldBuffer; foldBuffer = []; }
      return this.push(SIM_COMMAND_TYPES.INPUT, p, meta);
    },
    pushBus(command, meta) { return this.push(SIM_COMMAND_TYPES.BUS, command, meta); },
    pushSettings(path, value, meta) { return this.push(SIM_COMMAND_TYPES.SETTINGS, { path, value }, meta); },
    pushRpc(id, op, payload, meta) { return this.push(SIM_COMMAND_TYPES.RPC, { id, op, payload }, meta); },
    /** input.* fold from the lane layer: buffered until the next input envelope. */
    pushInputWrite(path, value) { foldBuffer.push({ path, value }); },
    /**
     * Drain the wire batch. Any fold buffer that never rode an input envelope is
     * appended as a trailing writes-only INPUT envelope so it still applies this
     * directive — after every other envelope (conservative tail placement).
     */
    drain() {
      if (foldBuffer.length) {
        this.push(SIM_COMMAND_TYPES.INPUT, { input: null, writes: foldBuffer });
        foldBuffer = [];
      }
      const out = pending.splice(0, pending.length);
      drained += out.length;
      return out;
    },
    get size() { return pending.length + foldBuffer.length; },
    get enqueued() { return enqueued; },
    get drained() { return drained; },
    get lastSeq() { return seq; },
  };
  return ring;
}

/**
 * Map a lane descriptor (src/core/simLaneCommands.js emitters) onto ring envelopes.
 * Returns the assigned seq, or null for kinds the host handles itself (rpc — the
 * sink owns correlation; it should call ring.pushRpc directly with the same id).
 */
export function pushLaneCommand(ring, d) {
  if (!ring || !d || typeof d !== 'object') return null;
  switch (d.kind) {
    case 'inputFold': ring.pushInputWrite(d.path, d.value); return ring.lastSeq;
    case 'mode': return ring.push(SIM_COMMAND_TYPES.MODE, { mode: d.mode });
    case 'nav': return ring.push(SIM_COMMAND_TYPES.NAV, { waypoint: d.waypoint, clear: d.clear === true });
    case 'settings': return ring.pushSettings(d.key, d.value);
    case 'spawn': return ring.push(SIM_COMMAND_TYPES.SPAWN, { token: d.token, spec: d.spec, meta: d.meta || null });
    case 'remove': return ring.push(SIM_COMMAND_TYPES.REMOVE, { token: d.token, id: d.id, opts: d.opts || null });
    case 'promote': return ring.push(SIM_COMMAND_TYPES.PROMOTE, { id: d.id, source: d.source, reason: d.reason });
    case 'rpc': return ring.pushRpc(d.id, d.op, d.args);
    case 'domEvent': return ring.push(SIM_COMMAND_TYPES.DOM, { d: d.d });
    // Stage-8: generic sim-bus event replay (main → worker). Rides the BUS
    // type with an { emit } payload — tape-command BUS payloads carry { kind }.
    case 'busEmit': return ring.push(SIM_COMMAND_TYPES.BUS, { emit: d.emit, payload: d.payload });
    case 'uiFold': return ring.push(SIM_COMMAND_TYPES.UI, d.p || null);
    case 'viewport': return ring.push(SIM_COMMAND_TYPES.VIEWPORT, { w: d.w, h: d.h });
    default: return null;
  }
}

// Worker side: apply one wire envelope to the sim.
// ctx = { state, helpers, inputOptions, bus, sim, registry, rpcHandlers }.
// Returns { type, rpcAck?, ack?, spawnAck?, inputSeq?, inputWallMs?, foldCount? }
// so the caller can stamp completedTick attribution and reply acks.
// Throws propagate — a rejected bus command must fail the directive exactly as
// it failed the loop body before.
export function applySimCommandEnvelope(env, ctx) {
  const { state, helpers, inputOptions } = ctx;
  const p = env && env.p;
  switch (env && env.t) {
    case SIM_COMMAND_TYPES.INPUT: {
      const input = p && typeof p === 'object' && p.input && typeof p.input === 'object'
        ? p.input
        : (p && p.input === null ? null : p);
      if (input) applyInput(state, input, inputOptions || {});
      const foldCount = applyLaneInputWrites(state, p && p.writes);
      return { type: SIM_COMMAND_TYPES.INPUT, inputSeq: env.seq, inputWallMs: env.wallMs, foldCount };
    }
    case SIM_COMMAND_TYPES.BUS:
      // { emit } payloads replay a sim-bus event that originated main-side
      // (worker-side emit capture is suppressed around the emit so it cannot
      // echo back over the wire — see emitBusEvent in the drain ctx).
      if (p && typeof p === 'object' && typeof p.emit === 'string') {
        if (typeof ctx.emitBusEvent === 'function') ctx.emitBusEvent(p.emit, p.payload);
        else if (ctx.bus && typeof ctx.bus.emit === 'function') ctx.bus.emit(p.emit, p.payload);
        return { type: SIM_COMMAND_TYPES.BUS };
      }
      applyTapeCommands(state, helpers, [p]);
      return { type: SIM_COMMAND_TYPES.BUS };
    case SIM_COMMAND_TYPES.SETTINGS: {
      const path = p && typeof p === 'object' ? p.path : undefined;
      const ok = applyLaneSetting(state, path, p && p.value);
      return { type: SIM_COMMAND_TYPES.SETTINGS, ack: { path, ok, reason: ok ? undefined : 'settings-path-not-writable' } };
    }
    case SIM_COMMAND_TYPES.NAV:
      return { type: SIM_COMMAND_TYPES.NAV, ack: { ok: applyLaneNav(state, p) } };
    case SIM_COMMAND_TYPES.MODE:
      return { type: SIM_COMMAND_TYPES.MODE, ack: { ok: applyLaneMode(state, ctx.bus, p && p.mode), mode: p && p.mode } };
    case SIM_COMMAND_TYPES.DOM:
      if (typeof ctx.ingestDomEvent === 'function') ctx.ingestDomEvent(p && p.d);
      return { type: SIM_COMMAND_TYPES.DOM };
    case SIM_COMMAND_TYPES.UI:
      if (typeof ctx.applyUiFold === 'function') ctx.applyUiFold(p);
      return { type: SIM_COMMAND_TYPES.UI };
    case SIM_COMMAND_TYPES.VIEWPORT:
      if (typeof ctx.setViewport === 'function') ctx.setViewport(p && p.w, p && p.h);
      return { type: SIM_COMMAND_TYPES.VIEWPORT };
    case SIM_COMMAND_TYPES.SPAWN: {
      const token = p && p.token;
      try {
        const rec = helpers && typeof helpers.spawnEntity === 'function'
          ? helpers.spawnEntity(p.spec)
          : null;
        const id = rec && rec.id != null ? rec.id : (typeof rec === 'number' ? rec : null);
        // meta.budgetOwner: bind the fresh entity into the lab spawn budget at apply time
        // (admission binding is sim-side, so it must happen on the sim lane).
        let bound;
        const owner = p && p.meta && p.meta.budgetOwner;
        const budget = helpers && helpers.spawnBudget;
        if (id != null && owner && budget && typeof budget.bindEntity === 'function') {
          bound = budget.bindEntity(id, owner) === true;
        }
        return { type: SIM_COMMAND_TYPES.SPAWN, spawnAck: { token, ok: id != null, id, ...(bound === undefined ? {} : { bound }) } };
      } catch (e) {
        return { type: SIM_COMMAND_TYPES.SPAWN, spawnAck: { token, ok: false, error: String((e && e.message) || e) } };
      }
    }
    case SIM_COMMAND_TYPES.REMOVE: {
      const token = p && p.token;
      try {
        if (helpers && typeof helpers.removeEntity === 'function') {
          helpers.removeEntity(p.id, p.opts || {});
        }
        return { type: SIM_COMMAND_TYPES.REMOVE, spawnAck: { token, ok: true, id: p && p.id } };
      } catch (e) {
        return { type: SIM_COMMAND_TYPES.REMOVE, spawnAck: { token, ok: false, error: String((e && e.message) || e) } };
      }
    }
    case SIM_COMMAND_TYPES.PROMOTE: {
      try {
        // ctx.promote = { farActor, asteroidRock } — worker injects the real
        // farActorTable/asteroidField functions (channel stays import-light).
        const promote = ctx.promote || {};
        const fn = (p && p.source === 'rock') ? promote.asteroidRock : promote.farActor;
        const promoted = typeof fn === 'function'
          ? fn(state, p.id, helpers, p.reason || 'lane')
          : null;
        return { type: SIM_COMMAND_TYPES.PROMOTE, ack: { ok: promoted != null && promoted !== false, id: p && p.id } };
      } catch (e) {
        return { type: SIM_COMMAND_TYPES.PROMOTE, ack: { ok: false, id: p && p.id, reason: String((e && e.message) || e) } };
      }
    }
    case SIM_COMMAND_TYPES.RPC: {
      const id = p && p.id;
      const op = p && p.op;
      if (op === 'noop') {
        return { type: SIM_COMMAND_TYPES.RPC, rpcAck: { id, ok: true } };
      }
      const handler = ctx.rpcHandlers && ctx.rpcHandlers.get(op);
      if (!handler) {
        return { type: SIM_COMMAND_TYPES.RPC, rpcAck: { id, ok: false, reason: 'unhandled-rpc-op', op } };
      }
      try {
        const result = handler(p.payload, ctx);
        if (result && typeof result.then === 'function') {
          // Async rpc: caller (handleTick) awaits pendingRpcs after the drain.
          return { type: SIM_COMMAND_TYPES.RPC, rpcPending: { id, op, promise: result } };
        }
        return { type: SIM_COMMAND_TYPES.RPC, rpcAck: { id, ok: true, result } };
      } catch (e) {
        return { type: SIM_COMMAND_TYPES.RPC, rpcAck: { id, ok: false, reason: String((e && e.message) || e), op } };
      }
    }
    default:
      return { type: 'unknown', ack: { ok: false, reason: 'unknown-envelope-type' } };
  }
}

// Drain a wire batch in order; aggregates the completedTick attribution fields,
// ack payloads, and async-rpc pendings the directive reply must carry.
export function drainSimCommandEnvelopes(envelopes, ctx) {
  const out = {
    inputSeq: 0, inputWallMs: 0, rpcAcks: [], settingsAcks: [], dropped: 0,
    spawnAcks: [], commandAcks: [], pendingRpcs: [], applied: [], foldsApplied: 0,
  };
  if (!Array.isArray(envelopes)) return out;
  for (const env of envelopes) {
    if (!env || typeof env !== 'object') { out.dropped += 1; continue; }
    const r = applySimCommandEnvelope(env, ctx);
    if (r.inputSeq) { out.inputSeq = r.inputSeq; out.inputWallMs = r.inputWallMs || 0; }
    out.foldsApplied += r.foldCount || 0;
    if (r.rpcAck) out.rpcAcks.push(r.rpcAck);
    if (r.rpcPending) out.pendingRpcs.push(r.rpcPending);
    if (r.spawnAck) out.spawnAcks.push(r.spawnAck);
    if (r.ack) {
      if (r.type === SIM_COMMAND_TYPES.SETTINGS) out.settingsAcks.push(r.ack);
      else out.commandAcks.push({ t: r.type, ...r.ack });
    }
    if (r.type === 'unknown') out.dropped += 1;
    out.applied.push({ seq: env.seq, t: env.t });
  }
  return out;
}
