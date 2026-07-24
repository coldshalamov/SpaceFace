// Tick-indexed input tape → real flight key transitions + Massline input grammar.
// Reuses transitionFlightKeyState and createMasslineInputGrammar — no fake controllers.

import { transitionFlightKeyState } from '../../systems/input.js';
import { createMasslineInputGrammar } from '../../systems/masslineInputGrammar.js';

/**
 * Normalize compiled tape into per-tick buckets (events ordered by sequence, frames last-wins).
 * @param {{ events?: object[], frames?: object[] }} tape
 */
export function normalizeTape(tape = {}) {
  const events = Array.isArray(tape.events) ? tape.events.slice() : [];
  events.sort((a, b) => (a.tick - b.tick) || ((a.sequence | 0) - (b.sequence | 0)));
  const frames = Array.isArray(tape.frames)
    ? tape.frames.slice().sort((a, b) => a.tick - b.tick)
    : [];
  return { events, frames };
}

/**
 * Last-frame-wins resolve (same contract as masslineControlLab.resolveInput / sf-sim normalizeTape).
 */
export function resolveFrameInput(frames, tick) {
  if (!Array.isArray(frames) || frames.length === 0) return null;
  let current = null;
  for (const frame of frames) {
    if (frame.tick <= tick) current = frame;
    else break;
  }
  return current;
}

/**
 * Create a sticky input driver that applies raw events through production grammars each tick.
 */
export function createInputTapeDriver(tape, options = {}) {
  const { events, frames } = normalizeTape(tape);
  let keys = Object.create(null);
  const masslineGrammar = options.masslineGrammar !== false
    ? createMasslineInputGrammar()
    : null;
  let eventIndex = 0;

  // Pre-index events by tick for O(events) total over a run.
  const eventsByTick = new Map();
  for (const ev of events) {
    const t = ev.tick | 0;
    if (!eventsByTick.has(t)) eventsByTick.set(t, []);
    eventsByTick.get(t).push(ev);
  }

  return {
    keys,
    /**
     * Apply all raw events for `tick`, then merge frame input, write state.input.
     * @param {object} state
     * @param {number} tick
     * @param {number} dt
     * @param {{ playerEntity?: object, tetherAttached?: boolean }} [ctx]
     */
    apply(state, tick, dt, ctx = {}) {
      const tickEvents = eventsByTick.get(tick | 0) || [];
      for (const ev of tickEvents) {
        if (ev.device === 'keyboard' || !ev.device) {
          keys = transitionFlightKeyState(state, keys, {
            code: ev.code || '',
            pressed: !!ev.pressed,
            blocked: false,
          });
        }
        // Frame-like payload on the event: merge keys map if provided.
        if (ev.keys && typeof ev.keys === 'object') {
          for (const [code, pressed] of Object.entries(ev.keys)) {
            keys = transitionFlightKeyState(state, keys, {
              code,
              pressed: !!pressed,
            });
          }
        }
      }
      this.keys = keys;

      const frame = resolveFrameInput(frames, tick);
      const frameInput = (frame && frame.input) || {};

      // Axes: frame input wins when authored; otherwise derive from held keys.
      const derived = deriveAxesFromKeys(keys);
      const moveX = finite(frameInput.moveX, derived.moveX);
      const moveZ = finite(frameInput.moveZ, derived.moveZ);
      const turnIntent = finite(frameInput.turnIntent, derived.turnIntent);
      const boost = frameInput.boost != null ? !!frameInput.boost : derived.boost;
      const fire = frameInput.fire != null ? !!frameInput.fire : !!keys.KeyJ;
      const aimAngle = finite(frameInput.aimAngle, ctx.playerEntity ? ctx.playerEntity.rot : 0);
      const reelDelta = finite(frameInput.reelDelta, derived.reelDelta);

      state.input = state.input || {};
      state.input.moveX = moveX;
      state.input.moveZ = moveZ;
      state.input.turnIntent = turnIntent;
      state.input.boost = boost;
      state.input.fire = fire;
      state.input.aimAngle = aimAngle;
      state.input.keys = { ...keys };
      const origin = ctx.playerEntity && ctx.playerEntity.pos
        ? ctx.playerEntity.pos
        : { x: 0, z: 0 };
      state.input.aimWorld = {
        x: origin.x + Math.cos(aimAngle) * 1000,
        z: origin.z + Math.sin(aimAngle) * 1000,
      };

      state.input.actions = state.input.actions || {};
      state.input.actions.reelDelta = reelDelta;

      // Massline grammar from real key holds (Space / KeyF) unless frame overrides the packet.
      if (masslineGrammar) {
        const tetherKey = !!(keys.KeyF || keys.Space);
        const held = frameInput.masslineHeld != null ? !!frameInput.masslineHeld : tetherKey;
        const attached = !!ctx.tetherAttached;
        const lineLength = finite(
          frameInput.lineLength,
          (keys.KeyE ? 1 : 0) - (keys.KeyQ ? 1 : 0) || reelDelta,
        );
        const orbitDirection = finite(frameInput.orbitDirection, turnIntent);
        const packet = masslineGrammar.step(dt, {
          held,
          attached,
          lineLength,
          orbitDirection,
        });
        if (frameInput.massline && typeof frameInput.massline === 'object') {
          state.input.actions.massline = { ...packet, ...frameInput.massline };
        } else {
          state.input.actions.massline = { ...packet };
        }
      } else if (frameInput.massline) {
        state.input.actions.massline = { ...frameInput.massline };
      }

      return {
        moveX,
        moveZ,
        turnIntent,
        boost,
        fire,
        reelDelta,
        keys: { ...keys },
        massline: state.input.actions.massline || null,
        frameCommands: (frame && frame.commands) || [],
      };
    },
    snapshotKeys() {
      return { ...keys };
    },
  };
}

function deriveAxesFromKeys(keys) {
  const forward = !!(keys.KeyW || keys.ArrowUp);
  const reverse = !!(keys.KeyS || keys.ArrowDown);
  const left = !!(keys.KeyA || keys.ArrowLeft);
  const right = !!(keys.KeyD || keys.ArrowRight);
  const moveZ = (forward ? 1 : 0) + (reverse ? -1 : 0);
  const moveX = (right ? 1 : 0) + (left ? -1 : 0);
  const turnIntent = moveX;
  const boost = !!(keys.ShiftLeft || keys.ShiftRight);
  // Classic reel often on brackets when bound; default empty — frame input supplies reelDelta.
  const reelDelta = 0;
  return { moveX, moveZ, turnIntent, boost, reelDelta };
}

function finite(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function hashInputTape(tape) {
  const { events, frames } = normalizeTape(tape);
  const payload = JSON.stringify({ events, frames });
  // FNV-1a 32-bit hex (stable, no crypto dependency in browser-safe path).
  let h = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
