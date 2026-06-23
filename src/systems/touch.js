// Touch input layer (goal P1-12 — the touch half; gamepad is in gamepad.js).
//
// Provides a virtual dual-stick touch control overlay for phones/tablets/touchscreens:
//   - LEFT half of screen  → movement joystick (drag from the resting thumb position; the delta is
//                            turnIntent (X) + moveZ (Y, up=forward), like the left gamepad stick).
//   - RIGHT half of screen → aim joystick (the delta sets aimAngle independent of the nose, like
//                            the right gamepad stick / mouse). Tap-to-fire on release is avoided —
//                            fire is an explicit button so the player can hold it.
//   - On-screen buttons (bottom-right): FIRE (hold), MINE (hold), BOOST (hold).
//
// The layer is intentionally dumb (like gamepad.js): it only translates touches into normalized
// axes + action state. Flight behavior is merged in src/systems/input.js; the overlay DOM is built
// here so it's self-contained. Auto-activates when a touch device is detected; the player can also
// toggle it in Settings. Desktops with no touch never see the overlay.
//
// Standard merge contract with input.js: touch writes the SAME fields as keyboard/mouse/gamepad
// (turnIntent/moveX/moveZ/boost/fire/fireGroup/aimWorld/aimAngle/mouseNdc), so gameplay code is
// unchanged. input.js gives touch priority when a touch is active (analogous to how kbm-vs-gamepad
// recency already works).

const STYLE_ID = 'sf-touch-style';
const OVERLAY_ID = 'sf-touch-overlay';

// Minimum screen size (px) below which we DON'T auto-enable touch — tiny screens get the overlay
// but very small viewports (e.g. devtools device emulation at 320px) are unusable. The player can
// still force-enable in Settings.
const AUTO_MIN_PX = 480;

function nowMs() {
  if (typeof performance !== 'undefined' && performance.now) return performance.now();
  return Date.now();
}

export function createTouch(ctx) {
  const bus = ctx && ctx.bus;
  const state = ctx && ctx.state;

  const touch = {
    active: false,        // is the overlay shown + touch input enabled?
    lastActiveMs: 0,
    axes: { leftX: 0, leftY: 0, rightX: 0, rightY: 0 },
    actions: {
      fire: { held: false, pressed: false, released: false, value: 0 },
      mine: { held: false, pressed: false, released: false, value: 0 },
      boost: { held: false, pressed: false, released: false, value: 0 },
    },
    _overlay: null,
    _sticks: {},   // touchId -> { side: 'left'|'right', originX, originY, curX, curY }
    _btns: {},     // button element -> action name
    _btnHeld: {},  // action -> bool (button touches, tracked separately from sticks)
    _enabledByAuto: false,

    isConnected() { return this.active; },

    // Enable/disable the overlay. Called from Settings + on auto-detect. Idempotent.
    setEnabled(on) {
      if (on && !this._overlay) this._buildOverlay();
      else if (!on && this._overlay) { this._overlay.remove(); this._overlay = null; }
      this.active = on && !!this._overlay;
      if (bus && bus.emit) bus.emit(on ? 'touch:enabled' : 'touch:disabled', {});
    },

    // Auto-detect: enable on touch devices with a usable screen. Called once on init + on resize
    // (so rotating a phone or docking/undocking a tablet re-evaluates). Respects an explicit setting
    // (settings.controls.touch.enabled) if the player has set one — never overrides a deliberate
    // choice.
    autoDetect() {
      const cfg = (state && state.settings && state.settings.controls && state.settings.controls.touch) || {};
      if (cfg.enabled != null) { this.setEnabled(cfg.enabled); return; }
      const hasTouch = (typeof window !== 'undefined') && ('ontouchstart' in window || (navigator.maxTouchPoints > 0));
      const bigEnough = (typeof window !== 'undefined') && (Math.min(innerWidth, innerHeight) >= AUTO_MIN_PX);
      const should = !!(hasTouch && bigEnough);
      if (should !== this._enabledByAuto) {
        this._enabledByAuto = should;
        this.setEnabled(should);
      }
    },

    _buildOverlay() {
      if (typeof document === 'undefined') return;
      if (!document.getElementById(STYLE_ID)) {
        const s = document.createElement('style');
        s.id = STYLE_ID;
        s.textContent = `
        #${OVERLAY_ID} { position:fixed; inset:0; pointer-events:none; z-index:60; touch-action:none;
          user-select:none; -webkit-user-select:none; }
        #${OVERLAY_ID} .sf-touch-stick { position:absolute; bottom:18px; width:140px; height:140px;
          border-radius:50%; border:2px solid rgba(120,160,200,.25); background:rgba(8,14,24,.30);
          pointer-events:auto; }
        #${OVERLAY_ID} .sf-touch-stick.left { left:18px; }
        #${OVERLAY_ID} .sf-touch-stick.right { right:18px; }
        #${OVERLAY_ID} .sf-touch-stick .sf-touch-knob { position:absolute; left:50%; top:50%;
          width:54px; height:54px; margin:-27px 0 0 -27px; border-radius:50%;
          background:rgba(57,208,255,.35); border:1px solid rgba(57,208,255,.6);
          transition:transform .06s linear; }
        #${OVERLAY_ID} .sf-touch-btn { position:absolute; bottom:24px; right:18px; pointer-events:auto;
          border-radius:50%; border:2px solid rgba(120,160,200,.3); background:rgba(8,14,24,.45);
          color:var(--ink,#d7e6ff); font-family:var(--mono,monospace); font-size:11px; letter-spacing:.08em;
          display:flex; align-items:center; justify-content:center; text-transform:uppercase;
          transition:background .08s, transform .08s; }
        #${OVERLAY_ID} .sf-touch-btn.held { background:rgba(57,208,255,.30); transform:scale(.94); }
        #${OVERLAY_ID} .sf-touch-fire { width:84px; height:84px; right:170px; }
        #${OVERLAY_ID} .sf-touch-mine { width:68px; height:68px; right:96px; bottom:30px; }
        #${OVERLAY_ID} .sf-touch-boost { width:68px; height:68px; bottom:108px; right:30px; }
        @media (max-width: 760px) { #${OVERLAY_ID} .sf-touch-stick { width:110px; height:110px; } }
        `;
        document.head.appendChild(s);
      }
      const ov = document.createElement('div');
      ov.id = OVERLAY_ID;
      ov.innerHTML =
        '<div class="sf-touch-stick left"><div class="sf-touch-knob"></div></div>' +
        '<div class="sf-touch-stick right"><div class="sf-touch-knob"></div></div>' +
        '<button class="sf-touch-btn sf-touch-fire" data-act="fire">Fire</button>' +
        '<button class="sf-touch-btn sf-touch-mine" data-act="mine">Mine</button>' +
        '<button class="sf-touch-btn sf-touch-boost" data-act="boost">Boost</button>';
      document.body.appendChild(ov);
      this._overlay = ov;
      this._wireSticks(ov);
      this._wireButtons(ov);
    },

    // The two joystick zones. A touch that STARTS inside a stick owns that touch until release;
    // the knob follows the finger, clamped to the radius. The normalized delta (−1..1) becomes the
    // axis. This is the standard mobile-twin-stick pattern (origin = where the thumb landed).
    _wireSticks(ov) {
      const sides = { left: ov.querySelector('.sf-touch-stick.left'), right: ov.querySelector('.sf-touch-stick.right') };
      for (const side of ['left', 'right']) {
        const el = sides[side];
        const knob = el.querySelector('.sf-touch-knob');
        el.addEventListener('touchstart', (e) => {
          e.preventDefault();
          const t = e.changedTouches[0];
          const r = el.getBoundingClientRect();
          this._sticks[t.identifier] = { side, ox: r.left + r.width / 2, oy: r.top + r.height / 2, r: r.width / 2 };
          this._moveKnob(knob, t, this._sticks[t.identifier]);
          this.lastActiveMs = nowMs();
        }, { passive: false });
        el.addEventListener('touchmove', (e) => {
          e.preventDefault();
          for (const t of e.changedTouches) {
            const st = this._sticks[t.identifier];
            if (st) { this._moveKnob(knob, t, st); this.lastActiveMs = nowMs(); }
          }
        }, { passive: false });
        const end = (e) => {
          e.preventDefault();
          for (const t of e.changedTouches) {
            const st = this._sticks[t.identifier];
            if (st) {
              if (st.side === 'left') { this.axes.leftX = 0; this.axes.leftY = 0; }
              else { this.axes.rightX = 0; this.axes.rightY = 0; }
              knob.style.transform = '';
              delete this._sticks[t.identifier];
            }
          }
        };
        el.addEventListener('touchend', end, { passive: false });
        el.addEventListener('touchcancel', end, { passive: false });
      }
    },

    _moveKnob(knob, touch, st) {
      const dx = touch.clientX - st.ox, dy = touch.clientY - st.oy;
      const dist = Math.hypot(dx, dy);
      const max = st.r;
      const clamped = Math.min(dist, max);
      const nx = dist > 0 ? (dx / dist) * clamped : 0;
      const ny = dist > 0 ? (dy / dist) * clamped : 0;
      knob.style.transform = 'translate(' + nx + 'px,' + ny + 'px)';
      // Normalize to −1..1 for the axis (left stick = turn/throttle; right stick = aim).
      const ax = max > 0 ? nx / max : 0;
      const ay = max > 0 ? ny / max : 0;
      if (st.side === 'left') { this.axes.leftX = ax; this.axes.leftY = ay; }
      else { this.axes.rightX = ax; this.axes.rightY = ay; }
    },

    _wireButtons(ov) {
      const btns = ov.querySelectorAll('.sf-touch-btn');
      btns.forEach((b) => {
        const act = b.getAttribute('data-act');
        this._btns[b] = act;
        const down = (e) => { e.preventDefault(); b.classList.add('held'); this._btnHeld[act] = true; this.lastActiveMs = nowMs(); };
        const up = (e) => { e.preventDefault(); b.classList.remove('held'); this._btnHeld[act] = false; };
        b.addEventListener('touchstart', down, { passive: false });
        b.addEventListener('touchend', up, { passive: false });
        b.addEventListener('touchcancel', up, { passive: false });
      });
    },

    tick() {
      if (!this.active) return;
      // Translate button-held flags into action state (pressed/released edges computed in input.js
      // merge; here we only reflect current held state, matching gamepad.js's approach).
      for (const act of ['fire', 'mine', 'boost']) {
        const held = !!this._btnHeld[act];
        const prev = !!this.actions[act] && this.actions[act].held;
        this.actions[act] = { held, pressed: held && !prev, released: !held && prev, value: held ? 1 : 0 };
      }
    },

    // Called by Settings when the player toggles touch: persist the explicit choice so autoDetect
    // stops overriding it.
    persistEnabled(on) {
      if (!state || !state.settings) return;
      state.settings.controls = state.settings.controls || {};
      state.settings.controls.touch = state.settings.controls.touch || {};
      state.settings.controls.touch.enabled = on;
      this.setEnabled(on);
      if (bus && bus.emit) bus.emit('settings:changed', { section: 'controls' });
    },
  };

  return touch;
}
