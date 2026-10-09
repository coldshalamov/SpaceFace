// Main-lane host for the mobile touch deck on the worker lane (Stage-E parity).
// The deck is DOM: its detector, overlay view and gesture model must run where
// window/document/matchMedia exist — the main realm. The authoritative input
// reducer lives in the worker, so each resolved frame ships as a `touchFrame`
// lane DOM descriptor and laneTouchReducer.js applies it on the sim side in
// wire order. On a non-touch device the detector never enables the deck and
// this surface ships a single inactive frame — zero steady-state traffic.
//
// The surface reuses the production touch stack (createTouch → enhanceMobileTouch)
// over the facade state, so detection, rendering, guide, dock-range and
// settings behavior are identical to the main-lane runtime.

import { createTouch } from '../touch.js';
import { laneDomEvent } from '../../core/simLaneCommands.js';

// The bridge's tick wraps the input host for virtual-verb unions and hold
// latches; on the main realm there is no input host — a stub satisfies the
// attach path while the real unions are rebuilt worker-side by the reducer.
function createStubInputHost(state) {
  return {
    state,
    _held() { return false; },
    _heldExcept() { return false; },
    _holdToggleLatches: {},
    _masslineGrammar: null,
  };
}

function round4(v) { return Math.round((Number(v) || 0) * 1e4) / 1e4; }

export function createLaneTouchSurface({ state, bus, helpers }) {
  if (typeof window === 'undefined' || typeof document === 'undefined'
    || !window || typeof window.addEventListener !== 'function') {
    return { dispose() {} };
  }
  const ctx = { state, bus, helpers };
  let touch = null;
  try {
    touch = createTouch(ctx);
  } catch (error) {
    try { console.warn('[simLane] mobile touch surface failed to construct:', (error && error.message) || error); } catch (_) {}
    return { dispose() {} };
  }
  try { touch.autoDetect(); } catch (_) {}
  const onResize = () => { try { touch.autoDetect(); } catch (_) {} };
  window.addEventListener('resize', onResize);

  const stub = createStubInputHost(state);
  let raf = 0, lastMs = 0, lastJson = '';
  let wasActive = false, destroyed = false;

  function serialize() {
    if (touch.active !== true) return { active: false };
    const frame = (touch.mobile && touch.mobile.frame) || null;
    const actions = (frame && frame.actions) || {};
    // Re-keyed object: sorted verbs keep the serialized form byte-stable for
    // dedup (the model reuses key insertion order that can vary per sample).
    const out = {};
    for (const verb of Object.keys(actions).sort()) {
      if (actions[verb] === true) out[verb] = true;
    }
    return {
      active: true,
      axes: {
        leftX: round4(touch.axes && touch.axes.leftX),
        leftY: round4(touch.axes && touch.axes.leftY),
        rightX: round4(touch.axes && touch.axes.rightX),
        rightY: round4(touch.axes && touch.axes.rightY),
      },
      actions: out,
      cancelledRoles: frame && frame.cancelledRoles ? Array.from(frame.cancelledRoles) : [],
      activityPending: touch._activityPending === true,
    };
  }

  function drive() {
    if (destroyed) return;
    const nowMs = (typeof performance !== 'undefined' && performance.now)
      ? performance.now() : Date.now();
    // Gesture clocks are wall-time — the model's flick/tap windows are human
    // timeouts, not sim ticks. Capped so a stalled frame can't mint one giant dt.
    const dt = lastMs ? Math.min((nowMs - lastMs) / 1000, 0.1) : 1 / 60;
    lastMs = nowMs;
    try {
      touch.tick(dt, state, stub);
      const ship = serialize();
      touch._activityPending = false;
      const json = JSON.stringify(ship);
      if (json !== lastJson) {
        lastJson = json;
        if (ship.active === false && wasActive === false) {
          // nothing enabled yet — the single inert frame establishes the
          // descriptor sequence; no need to ship it again.
        } else {
          laneDomEvent({ type: 'touchFrame', frame: ship });
        }
        wasActive = ship.active === true;
      }
    } catch (error) {
      try { console.warn('[simLane] mobile touch frame dropped:', (error && error.message) || error); } catch (_) {}
    }
    raf = window.requestAnimationFrame(drive);
  }
  raf = window.requestAnimationFrame(drive);

  return {
    dispose() {
      destroyed = true;
      if (raf) { try { window.cancelAnimationFrame(raf); } catch (_) {} raf = 0; }
      window.removeEventListener('resize', onResize);
      if (wasActive) {
        try { laneDomEvent({ type: 'touchFrame', frame: { active: false } }); } catch (_) {}
      }
      try { touch.destroy(); } catch (_) {}
    },
  };
}
