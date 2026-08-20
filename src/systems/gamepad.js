// Gamepad polling layer (goal P1-12).
//
// Polls navigator.getGamepads() once per tick and exposes normalized, deadzoned axes plus
// per-action button state (pressed / released / held / analog value). The layer is intentionally
// dumb: it only translates the raw standard-gamepad layout into game actions. Flight behavior is
// merged in src/systems/input.js; UI navigation is consumed in src/ui/input.js.
//
// Standard mapping (Xbox / PlayStation equivalent):
//   0  A / Cross      -> accept / dock when prompted; otherwise Massline thumb action in flight
//   1  B / Circle      -> cancel / back
//   2  X / Square      -> cycle target
//   3  Y / Triangle    -> codex / journal
//   4  LB / L1         -> brake / reverse thrust
//   5  RB / R1         -> boost
//   6  LT / L2         -> mine beam (analog)
//   7  RT / R2         -> fire (analog)
//   8  View / Select   -> star map
//   9  Menu / Start    -> pause
//  11  R3              -> countermeasure
//  12  D-pad up        -> UI nav up; auto-target / draw-to-fly toggle in flight
//  13  D-pad down      -> UI nav down
//  14  D-pad left      -> UI nav left
//  15  D-pad right     -> UI nav right

const STD = {
  accept: 0,
  cancel: 1,
  action: 2, // X / Square
  alt: 3,    // Y / Triangle
  l1: 4,
  r1: 5,
  l2: 6,
  r2: 7,
  view: 8,
  menu: 9,
  l3: 10,
  r3: 11,
  dUp: 12,
  dDown: 13,
  dLeft: 14,
  dRight: 15,
  home: 16,
};

// An action can be bound to multiple physical buttons (e.g. accept also fires in flight).
const ACTION_MAP = {
  fire: ['r2'],
  mine: ['l2'],
  boost: ['r1'],
  brake: ['l1'],
  cycleTarget: ['action'],
  autoTarget: ['dUp'],
  map: ['view'],
  codex: ['alt'],
  pause: ['menu'],
  countermeasure: ['r3'],
  accept: ['accept'],
  massline: ['accept'],
  cancel: ['cancel'],
  tabPrev: ['l1'],
  tabNext: ['r1'],
  // Travel Burn latch (atlas D5 / W1-5). L3 (left stick click, STD index 10) was the only
  // standard-layout button still unbound, and it is the right one on the merits: the left stick
  // is the throttle hand, so "press the throttle stick in" reads as committing to a long burn.
  // It is an edge (`.pressed`), never a hold — the latch owns the state, not the button.
  travelBurn: ['l3'],
};

const DEFAULT_DEADZONE = 0.12;

/** Diagnostic wall stamp only — never used for aim/helm arbitration (F4). */
function nowMs() {
  if (typeof performance !== 'undefined' && performance.now) return performance.now();
  return Date.now();
}

function applyDeadzone(v, d) {
  const a = Math.abs(v);
  if (a < d) return 0;
  const sign = v < 0 ? -1 : 1;
  return sign * ((a - d) / (1 - d));
}

function readButton(pad, name) {
  const idx = STD[name];
  if (idx == null || !pad || !pad.buttons) return null;
  const b = pad.buttons[idx];
  if (!b) return null;
  const value = typeof b.value === 'number' ? b.value : (b.pressed ? 1 : 0);
  return {
    pressed: !!(b.pressed || value > 0.5),
    value,
  };
}

export function createGamepad(ctx) {
  const bus = ctx && ctx.bus;
  const state = ctx && ctx.state;

  const gp = {
    connected: false,
    id: '',
    // F4/G9: (tick, sequence) activity for authoritative device arbitration (not wall-ms).
    lastActiveTick: -1,
    lastActiveSeq: -1,
    _wasActive: false,
    /** Diagnostic only — do not use for aim/helm selection. */
    lastActiveMs: 0,

    axes: {
      leftX: 0,
      leftY: 0,
      rightX: 0,
      rightY: 0,
      l2: 0,
      r2: 0,
    },

    // action -> { held, pressed, released, value }
    actions: {},
    _prev: {},

    isConnected() {
      return this.connected;
    },

    getAxis(name) {
      return this.axes[name] || 0;
    },

    getAction(name) {
      return this.actions[name] || { held: false, pressed: false, released: false, value: 0 };
    },

    tick(/* dt */ _dt, tickState = null, inputHost = null) {
      // Prefer live state passed from input.update so tick stamps stay authoritative.
      const live = tickState || state;
      const cfg =
        (live && live.settings && live.settings.controls && live.settings.controls.gamepad) ||
        {};
      const enabled = cfg.enabled !== false;
      const dz = typeof cfg.deadzone === 'number' ? cfg.deadzone : DEFAULT_DEADZONE;
      const invertY = !!cfg.invertY;

      let pad = null;
      if (enabled && typeof navigator !== 'undefined' && navigator.getGamepads) {
        const pads = navigator.getGamepads();
        for (let i = 0; i < pads.length; i++) {
          const p = pads[i];
          if (p && p.connected) {
            pad = p;
            break;
          }
        }
      }

      const wasConnected = this.connected;
      if (!pad && wasConnected) {
        this.connected = false;
        this.id = '';
        this._resetState();
        if (bus && bus.emit) bus.emit('gamepad:disconnected', {});
        return;
      }
      if (pad && !wasConnected) {
        this.connected = true;
        this.id = pad.id || 'gamepad';
        // G9: connection is a discrete activity event — bump shared sequence.
        if (inputHost && typeof inputHost._bumpActivityStamp === 'function') {
          const stamp = inputHost._bumpActivityStamp(live);
          this.lastActiveTick = stamp.tick;
          this.lastActiveSeq = stamp.seq;
        } else {
          this.lastActiveTick = live && Number.isFinite(live.tick) ? (live.tick | 0) : 0;
        }
        this.lastActiveMs = nowMs(); // diagnostic only
        if (bus && bus.emit) bus.emit('gamepad:connected', { id: this.id });
      }
      if (!pad) {
        this._resetState();
        return;
      }

      this.axes.leftX = applyDeadzone(pad.axes[0] || 0, dz);
      this.axes.leftY = applyDeadzone(pad.axes[1] || 0, dz);
      this.axes.rightX = applyDeadzone(pad.axes[2] || 0, dz);
      this.axes.rightY = applyDeadzone(pad.axes[3] || 0, dz) * (invertY ? -1 : 1);
      this.axes.l2 = Math.max(0, pad.buttons[6] ? pad.buttons[6].value : 0);
      this.axes.r2 = Math.max(0, pad.buttons[7] ? pad.buttons[7].value : 0);

      let activity =
        Math.abs(this.axes.leftX) > 0.001 ||
        Math.abs(this.axes.leftY) > 0.001 ||
        Math.abs(this.axes.rightX) > 0.001 ||
        Math.abs(this.axes.rightY) > 0.001 ||
        this.axes.l2 > 0.001 ||
        this.axes.r2 > 0.001;

      const actions = {};
      const prev = this._prev;
      for (const action in ACTION_MAP) {
        const names = ACTION_MAP[action];
        let held = false;
        let value = 0;
        for (const n of names) {
          const btn = readButton(pad, n);
          if (!btn) continue;
          if (btn.pressed) held = true;
          if (btn.value > value) value = btn.value;
        }
        if (held) activity = true;
        const was = !!prev[action];
        actions[action] = {
          held,
          pressed: held && !was,
          released: !held && was,
          value,
        };
        prev[action] = held;
      }
      this.actions = actions;

      if (activity) {
        // G9: update tick every held frame for cross-tick recency, but only bump the
        // shared sequence on new activity edges (not continuous hold re-stamps).
        const tick = live && Number.isFinite(live.tick) ? (live.tick | 0) : 0;
        this.lastActiveTick = tick;
        let edge = !this._wasActive;
        if (!edge) {
          for (const action in actions) {
            if (actions[action] && actions[action].pressed) {
              edge = true;
              break;
            }
          }
        }
        if (edge) {
          if (inputHost && typeof inputHost._bumpActivityStamp === 'function') {
            const stamp = inputHost._bumpActivityStamp(live);
            this.lastActiveTick = stamp.tick;
            this.lastActiveSeq = stamp.seq;
          } else {
            this.lastActiveSeq = (this.lastActiveSeq | 0) + 1;
          }
        }
        this._wasActive = true;
        this.lastActiveMs = nowMs(); // diagnostic only
      } else {
        this._wasActive = false;
      }
    },

    _resetState() {
      this.axes.leftX = 0;
      this.axes.leftY = 0;
      this.axes.rightX = 0;
      this.axes.rightY = 0;
      this.axes.l2 = 0;
      this.axes.r2 = 0;
      const actions = {};
      for (const action in ACTION_MAP) {
        actions[action] = { held: false, pressed: false, released: false, value: 0 };
      }
      this.actions = actions;
      this._prev = {};
      this._wasActive = false;
    },
  };

  gp._resetState();
  return gp;
}
