// Worker-lane twin of the mobile touch deck. The deck's DOM half (detector,
// view, gesture model) runs on the main realm — there is no window/document
// here — and ships its resolved frame as `touchFrame` lane DOM descriptors.
// This reducer exposes exactly the surface input.js's merge reads
// (axes/actions/isConnected/activity stamps), applying each descriptor at
// ingest so the sim-owned touch state evolves in wire order.
//
// The descriptor contract (see laneTouchSurface.js):
//   { active, axes:{leftX,leftY,rightX,rightY}, actions:{verb:held},
//     cancelledRoles:[name...], activityPending }.
// `active:false` carries no other fields — a disabled deck releases everything.

import { ALL_POWERS } from './catalog.js';

// Mirrors bridge.js's VIRTUAL_ACTIONS: the verbs whose action holds union into
// the input host's _held/_heldExcept checks for non-merge readers.
const VIRTUAL_ACTIONS = new Set([
  'tether', 'reelIn', 'reelOut', 'brake',
  ...ALL_POWERS.filter((p) => p.kind !== 'ui').map((p) => p.id),
]);

const HOLD_VERBS = ['boost', 'brake', 'bulletTime', 'massline', 'reelIn', 'reelOut'];

function clearAxes(touch) {
  touch.axes.leftX = 0; touch.axes.leftY = 0;
  touch.axes.rightX = 0; touch.axes.rightY = 0;
}
function clearActions(touch) {
  for (const action in touch.actions) {
    touch.actions[action] = { held: false, pressed: false, released: false, value: 0 };
  }
  touch._btnHeld = {};
  touch._btnPulse = {};
}

export function createLaneTouchReducer() {
  const touch = {
    name: 'touch',
    active: false,
    axes: { leftX: 0, leftY: 0, rightX: 0, rightY: 0 },
    actions: Object.create(null),
    _btnHeld: Object.create(null),
    _btnPulse: Object.create(null),
    _activityPending: false,
    lastActiveTick: -1,
    lastActiveSeq: -1,
    _overlay: null,
    _host: null,
    _prevHolds: null,
    _virtualPatched: false,
    mobile: { model: null, frame: null },
  };

  // The bridge wraps the input host's held-checks so virtual gesture verbs
  // count as held for readers outside the merge. The worker host needs the
  // same union — its authoritative verbs arrive resolved in frame.actions.
  function patchVirtualUnion(t, host) {
    if (t._virtualPatched || !host || typeof host._held !== 'function') return;
    const originalHeld = host._held;
    const originalExcept = host._heldExcept;
    const virtual = (action) => t.active && VIRTUAL_ACTIONS.has(action)
      && !!(t.actions[action] && t.actions[action].held);
    host._held = function (live, action) { return originalHeld.call(this, live, action) || virtual(action); };
    if (typeof originalExcept === 'function') {
      host._heldExcept = function (live, action, code) {
        return originalExcept.call(this, live, action, code) || virtual(action);
      };
    }
    t._virtualPatched = true;
  }

  touch.isConnected = function () { return this.active; };

  touch.applyLaneFrame = function (frame, inputHost) {
    if (inputHost) { this._host = inputHost; patchVirtualUnion(this, inputHost); }
    if (!frame || typeof frame !== 'object') return;
    if (frame.active === false) {
      this.active = false;
      clearAxes(this);
      clearActions(this);
      this._prevHolds = null;
      return;
    }
    this.active = true;
    // A verb falling true→false releases the sim host's hold-toggle latch —
    // the same reset the bridge performs on its main-lane host.
    const actions = frame.actions || {};
    const holdsNow = {
      boost: !!actions.boost, brake: !!actions.brake, bulletTime: !!actions.bulletTime,
      massline: !!actions.tether || !!actions.massline,
      reelIn: !!actions.reelIn, reelOut: !!actions.reelOut,
    };
    if (this._prevHolds && this._host && this._host._holdToggleLatches) {
      for (const key of HOLD_VERBS) {
        if (this._prevHolds[key] && !holdsNow[key]) this._host._holdToggleLatches[key] = false;
      }
    }
    this._prevHolds = holdsNow;
    if (frame.axes) {
      this.axes.leftX = Number(frame.axes.leftX) || 0;
      this.axes.leftY = Number(frame.axes.leftY) || 0;
      this.axes.rightX = Number(frame.axes.rightX) || 0;
      this.axes.rightY = Number(frame.axes.rightY) || 0;
    }
    for (const [verb, held] of Object.entries(actions)) {
      const prev = !!this.actions[verb] && this.actions[verb].held;
      this.actions[verb] = { held: !!held, pressed: !!held && !prev, released: !held && prev, value: held ? 1 : 0 };
    }
    // Lost contacts reset the worker's own massline grammar — the grammar lives
    // sim-side, so the cancelled-role signal crosses in the descriptor.
    if (Array.isArray(frame.cancelledRoles) && this._host && this._host._masslineGrammar) {
      const grammar = this._host._masslineGrammar;
      const hostActions = this._host.state && this._host.state.input && this._host.state.input.actions;
      if (frame.cancelledRoles.includes('tether')) {
        if (grammar.snapshot && hostActions && hostActions.massline === grammar.command) {
          hostActions.massline = grammar.snapshot();
        }
        if (grammar.reset) grammar.reset(true);
      }
    }
    if (frame.activityPending === true) this._activityPending = true;
    this.mobile.frame = frame;
  };

  touch.tick = function (_dt, liveState = null, inputHost = null) {
    if (inputHost) { this._host = inputHost; patchVirtualUnion(this, inputHost); }
    if (this._activityPending) {
      if (inputHost && typeof inputHost._bumpActivityStamp === 'function') {
        const stamp = inputHost._bumpActivityStamp(liveState);
        this.lastActiveTick = stamp.tick;
        this.lastActiveSeq = stamp.seq;
      } else {
        this.lastActiveTick = liveState && Number.isFinite(liveState.tick) ? (liveState.tick | 0) : 0;
        this.lastActiveSeq = (this.lastActiveSeq | 0) + 1;
      }
      this._activityPending = false;
    }
  };

  touch._clearTouchState = function () {
    clearAxes(this);
    clearActions(this);
    this._activityPending = false;
    this._prevHolds = null;
  };
  touch.setEnabled = function (on) { if (on !== true) { this._clearTouchState(); this.active = false; } };
  touch.autoDetect = function () {};
  touch.persistEnabled = function () {};
  touch.applyOverlayConfig = function () { return {}; };
  touch.destroy = function () { this._clearTouchState(); this.active = false; };

  return touch;
}
