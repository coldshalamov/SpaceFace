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
// This is the default map; Settings may overlay player remaps (PQ-164.01) stored at
// settings.controls.gamepad.bindings — resolved per tick by resolveGamepadBindings().
export const GAMEPAD_DEFAULT_BINDINGS = Object.freeze({
  fire: Object.freeze(['r2']),
  mine: Object.freeze(['l2']),
  boost: Object.freeze(['r1']),
  brake: Object.freeze(['l1']),
  cycleTarget: Object.freeze(['action']),
  autoTarget: Object.freeze(['dUp']),
  map: Object.freeze(['view']),
  codex: Object.freeze(['alt']),
  pause: Object.freeze(['menu']),
  countermeasure: Object.freeze(['r3']),
  accept: Object.freeze(['accept']),
  massline: Object.freeze(['accept']),
  cancel: Object.freeze(['cancel']),
  tabPrev: Object.freeze(['l1']),
  tabNext: Object.freeze(['r1']),
  // Travel Burn latch (atlas D5 / W1-5). L3 (left stick click, STD index 10) was the only
  // standard-layout button still unbound, and it is the right one on the merits: the left stick
  // is the throttle hand, so "press the throttle stick in" reads as committing to a long burn.
  // It is an edge (`.pressed`), never a hold — the latch owns the state, not the button.
  travelBurn: Object.freeze(['l3']),
});
const ACTION_MAP = GAMEPAD_DEFAULT_BINDINGS;

// Player-facing glyph per standard-layout button (PQ-164.01). Short primary names — the
// Settings layout note and Help carry the dual Xbox/PlayStation naming.
export const GAMEPAD_BUTTON_LABELS = Object.freeze({
  accept: 'A',
  cancel: 'B',
  action: 'X',
  alt: 'Y',
  l1: 'LB',
  r1: 'RB',
  l2: 'LT',
  r2: 'RT',
  view: 'View',
  menu: 'Menu',
  l3: 'L3',
  r3: 'R3',
  dUp: 'D-Pad Up',
  dDown: 'D-Pad Down',
  dLeft: 'D-Pad Left',
  dRight: 'D-Pad Right',
  home: 'Home',
});

// --- Remapping (PQ-164.01) -------------------------------------------------------------------
// A button may serve two actions only when their contexts are disjoint — a modal-only verb
// (cancel, station tab cycling) is inert in flight, and flight verbs are neutralized while a
// modal owns input — or when the pair is a designed arbitration (A/Cross is Massline in flight
// but dock/accept under the dock prompt; brake/boost share LB/RB with station tab cycling).
const PAD_ACTION_CONTEXT = Object.freeze({
  accept: 'both',
  map: 'both',
  pause: 'both',
  codex: 'flight',
  fire: 'flight',
  mine: 'flight',
  boost: 'flight',
  brake: 'flight',
  cycleTarget: 'flight',
  autoTarget: 'flight',
  countermeasure: 'flight',
  travelBurn: 'flight',
  massline: 'flight',
  cancel: 'modal',
  tabPrev: 'modal',
  tabNext: 'modal',
});
const PAD_SHARE_PAIRS = new Set(['accept|massline']);

export function gamepadShareAllowed(a, b) {
  if (a === b) return true;
  if (PAD_SHARE_PAIRS.has([a, b].sort().join('|'))) return true;
  const ca = PAD_ACTION_CONTEXT[a] || 'both';
  const cb = PAD_ACTION_CONTEXT[b] || 'both';
  return (ca === 'flight' && cb === 'modal') || (ca === 'modal' && cb === 'flight');
}

/**
 * The action that already owns `stdName` in `map` and may not share it with `action`, or null.
 * Used by the Settings capture for conflict detection and by the resolver to drop illegal shares
 * stored in a stale/hand-edited profile.
 */
export function findGamepadBindConflict(map, action, stdName) {
  for (const other in map) {
    if (other === action) continue;
    const list = map[other];
    if (!list || !list.includes(stdName)) continue;
    if (!gamepadShareAllowed(action, other)) return other;
  }
  return null;
}

/**
 * Resolved action -> [std button names] for the live settings. Player overrides at
 * settings.controls.gamepad.bindings replace an action's whole list; unknown actions/buttons and
 * illegal shares are dropped (canonical declaration order wins). With no overrides this returns
 * the frozen default map — callers on the hot tick path must not allocate.
 */
export function resolveGamepadBindings(settings) {
  const custom = settings && settings.controls && settings.controls.gamepad
    ? settings.controls.gamepad.bindings : null;
  if (!custom || typeof custom !== 'object' || Array.isArray(custom)) return ACTION_MAP;
  const owners = {}; // std button name -> [actions holding it]
  const claimable = (action, name) =>
    (owners[name] || []).every((other) => gamepadShareAllowed(action, other));
  const place = (action, names) => {
    const kept = [];
    for (const name of names) {
      if (!claimable(action, name)) continue;
      kept.push(name);
      (owners[name] || (owners[name] = [])).push(action);
    }
    return kept;
  };
  const sanitize = (raw) => {
    const names = Array.isArray(raw) ? raw : [raw];
    const out = [];
    for (const n of names) {
      if (typeof n === 'string' && STD[n] != null && !out.includes(n)) out.push(n);
    }
    return out;
  };
  const has = (a) => Object.prototype.hasOwnProperty.call(custom, a);
  const out = {};
  // Pass 1: untouched actions keep their shipped defaults (the stock map is internally legal).
  for (const action in ACTION_MAP) {
    if (has(action)) continue;
    out[action] = place(action, ACTION_MAP[action]);
  }
  // Pass 2: overrides claim buttons in canonical order. An override that loses every button to a
  // disallowed share (corrupt or hand-edited profile) falls back to the action's default, so a
  // stored map can never leave the pad worse than stock. An explicitly empty list is a deliberate
  // unbind and stays empty.
  for (const action in ACTION_MAP) {
    if (!has(action)) continue;
    const raw = custom[action];
    if (Array.isArray(raw) && raw.length === 0) { out[action] = []; continue; }
    const desired = sanitize(raw);
    // An all-invalid or fully conflicted override is corrupt data, not a choice — restore the
    // action's default rather than leave a dead verb.
    let kept = desired.length ? place(action, desired) : [];
    if (kept.length === 0) kept = place(action, ACTION_MAP[action]);
    out[action] = kept;
  }
  return out;
}

const DEFAULT_DEADZONE = 0.12;

// --- Haptics (PQ-164.03) ---------------------------------------------------------------------------
// Line tension, slams and boost are carried on the pad's rumble motors. Intensity is a function of
// the momentum in play: a loaded Massline, an impact and a boost all read stronger the faster the
// player (or the struck body) is moving. Reduce-motion silences every channel — haptics are
// vestibular, so the accessibility flag that kills camera shake kills rumble too.
export const HAPTIC_REF_MOMENTUM = 120;    // WU/s where momentum-scaled rumble is full
export const HAPTIC_SLAM_REF_DP = 8000;    // physics impulse at a full-intensity slam
export const HAPTIC_RUMBLE_MS = 120;       // actuator effect duration; refreshed each active tick
export const HAPTIC_SLAM_DECAY_TICKS = 18; // ~0.3 s pulse at 60 Hz, decayed on sim ticks
const HAPTIC_BOOST_FLOOR = 0.30;           // a boost at a standstill still hums

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : (n > 1 ? 1 : n);
}

function round4(v) {
  return Math.round(v * 10000) / 10000;
}

/**
 * Pure haptic frame. `momentum` is world units/s; `lineLoad` and `slam` are already 0..1
 * (line load from tetherGameplay.computeTetherLoad, slam from the physics impulse). Returns the
 * per-channel intensity plus the dual-rumble motor split (strong = low-freq/left, weak =
 * high-freq/right). Reduce-motion returns an all-zero, disabled frame before anything is scaled.
 */
export function computeHapticFrame(input = {}) {
  if (input.reduceMotion === true) {
    return { enabled: false, reduceMotion: true, momentum: 0, line: 0, slam: 0, boost: 0, weak: 0, strong: 0 };
  }
  const momentum = clamp01(Number(input.momentum) / HAPTIC_REF_MOMENTUM);
  const line = input.lineActive && input.lineLoad > 0 ? clamp01(input.lineLoad) : 0;
  const boost = input.boost ? clamp01(HAPTIC_BOOST_FLOOR + (1 - HAPTIC_BOOST_FLOOR) * momentum) : 0;
  const slam = clamp01(input.slam);
  const strong = Math.max(line, slam, boost * 0.5);
  const weak = Math.max(boost, slam * 0.8, line * 0.5);
  return {
    enabled: true,
    reduceMotion: false,
    momentum: round4(momentum),
    line: round4(line),
    slam: round4(slam),
    boost: round4(boost),
    weak: round4(clamp01(weak)),
    strong: round4(clamp01(strong)),
  };
}

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

  // PQ-164.03: latch the strongest recent slam from the physics authority. The pulse decays on sim
  // ticks (never wall time) so the haptic is deterministic and replay-safe. Both impact receipts
  // are read: `physics:impact` owns the raw impulse (`dp`) and `combat:collisionConsequence` owns
  // the settled exchange (`exchangedMomentum`). Only contacts the player was part of rumble.
  let slamPeak = 0;
  let slamTicks = 0;
  const registerSlam = (momentum) => {
    const intensity = clamp01(Number(momentum) / HAPTIC_SLAM_REF_DP);
    if (!(intensity > 0)) return;
    slamPeak = Math.max(slamTicks > 0 ? slamPeak : 0, intensity);
    slamTicks = HAPTIC_SLAM_DECAY_TICKS;
  };
  const playerIsInvolved = (p) => {
    const pid = state && state.playerId != null ? state.playerId : null;
    if (pid == null || !p) return false;
    return p.playerInvolved === true
      || p.aId === pid || p.bId === pid
      || p.targetId === pid || p.otherId === pid
      || !!(p.provenance && p.provenance.actorId === pid);
  };
  const onImpact = (p) => {
    if (!playerIsInvolved(p)) return;
    const momentum = Number.isFinite(p.dp) ? p.dp
      : Number.isFinite(p.exchangedMomentum) ? p.exchangedMomentum
      : p.impulse;
    registerSlam(momentum);
  };
  if (bus && typeof bus.on === 'function') {
    bus.on('physics:impact', onImpact);
    bus.on('combat:collisionConsequence', onImpact);
  }

  const gp = {
    connected: false,
    id: '',
    // F4/G9: (tick, sequence) activity for authoritative device arbitration (not wall-ms).
    lastActiveTick: -1,
    lastActiveSeq: -1,
    _wasActive: false,
    /** Diagnostic only — do not use for aim/helm selection. */
    lastActiveMs: 0,

    // PQ-164.03: last resolved haptic frame (pure data; the actuator is driven from tick).
    haptics: { enabled: true, reduceMotion: false, momentum: 0, line: 0, slam: 0, boost: 0, weak: 0, strong: 0 },
    _hapticActive: false,

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

    // PQ-164.01 remap: raw button edge queue + capture flag for the Settings rebind flow.
    // While captureMode is set every action reports inert — neither the sim merge nor the UI
    // layer may act on a button the player is in the middle of binding.
    captureMode: false,
    lastButton: null,
    _prevButtons: {},
    _pressQueue: [],
    _mapCache: { source: undefined, map: ACTION_MAP },

    /** Std button names pressed since the last drain (for the Settings pad-capture flow). */
    drainButtonPresses() {
      const q = this._pressQueue;
      this._pressQueue = [];
      return q;
    },

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

      // PQ-164.01: resolved binding map, rebuilt only when the stored override object changes.
      const customBindings = cfg.bindings;
      if (this._mapCache.source !== customBindings) {
        this._mapCache.source = customBindings;
        this._mapCache.map = resolveGamepadBindings(live && live.settings);
      }
      const actionMap = this._mapCache.map;

      // Raw button edges for the remap capture — recorded for every standard button, bound or
      // not, so an unbound button can still be offered to the capture handler.
      const prevButtons = this._prevButtons;
      for (const name in STD) {
        const idx = STD[name];
        const b = pad.buttons && pad.buttons[idx];
        const pressed = !!(b && (b.pressed || b.value > 0.5));
        if (pressed && !prevButtons[name]) {
          if (this._pressQueue.length < 8) this._pressQueue.push(name);
          this.lastButton = name;
        }
        prevButtons[name] = pressed;
      }

      let activity =
        Math.abs(this.axes.leftX) > 0.001 ||
        Math.abs(this.axes.leftY) > 0.001 ||
        Math.abs(this.axes.rightX) > 0.001 ||
        Math.abs(this.axes.rightY) > 0.001 ||
        this.axes.l2 > 0.001 ||
        this.axes.r2 > 0.001;

      const actions = {};
      const prev = this._prev;
      for (const action in actionMap) {
        const names = actionMap[action];
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
      if (this.captureMode) {
        // Remap capture: edges still reach the queue above, but every action reports inert so
        // neither the sim merge nor the UI layer acts on a button mid-bind.
        const inert = {};
        for (const action in actions) {
          inert[action] = { held: false, pressed: false, released: false, value: 0 };
        }
        this.actions = inert;
      } else {
        this.actions = actions;
      }

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

      this._stepHaptics(pad, live, cfg);
    },

    // PQ-164.03: resolve the frame from live momentum/tether/boost and the latched slam pulse, then
    // drive the pad. Reduce-motion (or a disabled `controls.gamepad.haptics`) yields an inert frame
    // and resets the motors; the frame is always recorded on `this.haptics` for inspection.
    _stepHaptics(pad, live, cfg) {
      const reduceMotion = !!(live && live.settings && live.settings.video
        && live.settings.video.motionReduce);
      const disabled = !!(cfg && cfg.haptics === false);
      const slam = slamTicks > 0 ? slamPeak * (slamTicks / HAPTIC_SLAM_DECAY_TICKS) : 0;
      if (slamTicks > 0) slamTicks -= 1;

      const player = live && live.entities && typeof live.entities.get === 'function'
        ? live.entities.get(live.playerId)
        : null;
      const speed = player && player.vel
        ? Math.hypot(Number(player.vel.x) || 0, Number(player.vel.z) || 0)
        : 0;
      const tether = live && live.player && live.player.tether;
      const frame = computeHapticFrame({
        momentum: speed,
        lineActive: !!(tether && tether.active),
        lineLoad: tether ? tether.load : 0,
        boost: !!(this.actions.boost && this.actions.boost.held),
        slam,
        reduceMotion: reduceMotion || disabled,
      });
      this.haptics = frame;
      this._applyHaptics(pad, frame);
    },

    // Dual-rumble where the browser exposes it; the older single-motor pulse() otherwise. Active
    // frames are re-issued every tick (the effect is short), and the motors are reset once when the
    // frame goes quiet so a disconnected/reduce-motion pad is never left buzzing.
    _applyHaptics(pad, frame) {
      const actuator = pad && (pad.vibrationActuator
        || (Array.isArray(pad.hapticActuators) && pad.hapticActuators[0]));
      if (!actuator) return;
      const active = !!(frame && frame.enabled && (frame.strong > 0.001 || frame.weak > 0.001));
      if (!active) {
        if (this._hapticActive && typeof actuator.reset === 'function') {
          try { actuator.reset(); } catch (_) { /* haptics are best-effort */ }
        }
        this._hapticActive = false;
        return;
      }
      this._hapticActive = true;
      try {
        if (typeof actuator.playEffect === 'function') {
          actuator.playEffect('dual-rumble', {
            startDelay: 0,
            duration: HAPTIC_RUMBLE_MS,
            weakMagnitude: frame.weak,
            strongMagnitude: frame.strong,
          });
        } else if (typeof actuator.pulse === 'function') {
          actuator.pulse(frame.strong, HAPTIC_RUMBLE_MS);
        }
      } catch (_) { /* haptics are best-effort */ }
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
      this._prevButtons = {};
      this._pressQueue = [];
      this.lastButton = null;
      this._wasActive = false;
    },
  };

  gp._resetState();
  return gp;
}
