// Registry shell for auto-target combat mode (runs immediately after input).
import { DEFAULTS, shouldNeutralizeFlightInput } from './input.js';
import {
  createAutoTargetRuntime,
  toggleAutoTarget,
  tickAutoTarget,
} from '../combat/autoTargetMode.js';

const { BINDINGS: DEFAULT_BINDINGS, SCHEMES: SCHEME_BINDINGS } = DEFAULTS;

function activeScheme(state) {
  const s = state.settings && state.settings.gameplay && state.settings.gameplay.controlScheme;
  return SCHEME_BINDINGS[s] ? s : 'pilot';
}

function binding(state, action) {
  const cfg = state.settings && state.settings.controls && state.settings.controls.bindings;
  const scheme = SCHEME_BINDINGS[activeScheme(state)];
  const list = (cfg && cfg[action]) || (scheme && scheme[action]) || DEFAULT_BINDINGS[action];
  return Array.isArray(list) ? list : (list ? [list] : []);
}

function eventCode(e) {
  if (e && e.code) return e.code;
  const key = e && typeof e.key === 'string' ? e.key.toLowerCase() : '';
  return key === 'g' ? 'KeyG' : '';
}

function isTextEntryTarget(target) {
  if (!target || typeof target.closest !== 'function') return false;
  return !!target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""], [data-text-input]');
}

function isUiCommandTarget(target) {
  if (!target || typeof target.closest !== 'function') return false;
  return !!target.closest('button, [role="button"], a[href], input, textarea, select, [contenteditable="true"], [contenteditable=""], #ui-root, #screens');
}

function modalInputActive() {
  const body = typeof document !== 'undefined' ? document.body : null;
  if (!body || !body.classList || typeof body.classList.contains !== 'function') return false;
  return body.classList.contains('ui-modal-open') || body.classList.contains('ui-live-screen');
}

// Pure-flight gate for the canvas lock, shared with the render-loop watchdog in
// src/ui/uiRoot.js (which enforces the same invariant every frame, including while sim
// ticks are frozen by a menu). The lock is legitimate in exactly one situation: G
// combat-stick mode on, in pure flight. Anywhere else the OS cursor must come back —
// outside pure flight there is no software reticle to take its place.
export function inPureFlightForLock(state) {
  if (shouldNeutralizeFlightInput(state, modalInputActive())) return false;
  if (typeof document !== 'undefined'
    && (document.hidden === true || (typeof document.hasFocus === 'function' && !document.hasFocus()))) return false;
  return true;
}

export function pointerLockIsLegitimate(state, pureFlight) {
  return !!pureFlight && inPureFlightForLock(state) && state?.input?.autoFire === true;
}

function isAutoFireCode(state, code) {
  return !!code && binding(state, 'autoFire').includes(code);
}

function setPointerLock(enabled, state) {
  if (typeof document === 'undefined') return;
  const canvas = document.getElementById && document.getElementById('gl-canvas');
  if (enabled) {
    if (!canvas || document.pointerLockElement === canvas || typeof canvas.requestPointerLock !== 'function') return;
    try {
      const request = canvas.requestPointerLock();
      if (request && typeof request.then === 'function') {
        // A pending grant can finish after destroy() removes pointerlockchange. Keep the
        // completion tied to the requesting state so teardown cannot leave the cursor hidden.
        request.then(() => {
          if (!pointerLockIsLegitimate(state, true)) setPointerLock(false);
        }, () => {});
      }
    } catch { /* Unlocked relative mouse motion remains a supported path. */ }
    return;
  }
  if (canvas && document.pointerLockElement === canvas && typeof document.exitPointerLock === 'function') {
    try { document.exitPointerLock(); } catch { /* The UI watchdog retries on the next frame. */ }
  }
}

// The canvas lock belongs to combat-stick mode only. requestPointerLock() resolves
// asynchronously — a request still pending when the mode toggled back (a fast second G, a
// dock, a save/runtime reset that never touches the lock API) lands afterward as a lock
// nothing else releases; while held it hides the OS cursor and freezes clientX/Y, which
// pins the aim reticle dead. Skip straight out when nothing is locked so this stays a
// cheap per-tick gate.
function releasePointerLockIfHeld() {
  if (typeof document === 'undefined' || !document.pointerLockElement) return;
  setPointerLock(false);
}

export const autoTargetAssist = {
  name: 'autoTargetAssist',

  init(ctx) {
    if (this._onKeyDown) this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this._gHeld = false;
    this._runtime = createAutoTargetRuntime();
    this._pointerLockAcquired = false;
    this._onPointerLockChange = () => {
      if (typeof document === 'undefined') return;
      const canvas = document.getElementById && document.getElementById('gl-canvas');
      // Losing pointer lock is NOT an off switch: the player's contract is "G toggles the mode,
      // G turns it off". Drawing keeps working unlocked (mousemove still reports deltas); the
      // next canvas click below re-acquires the lock. The old reset here silently killed the
      // mode whenever the browser dropped the lock, leaving the player drawing into nothing.
      this._pointerLockAcquired = !!(canvas && document.pointerLockElement === canvas);
      // The converse is not symmetric: a lock that LANDS while it is not legitimate — the mode
      // is off (a still-pending request from before the toggle, or an autoFire reset that
      // bypassed this module) or the game left pure flight (a menu opened over a pending grant
      // while sim ticks were frozen) — must be released. A held lock hides the OS cursor, and
      // outside pure flight there is no software reticle to take its place: the player sits in
      // front of a menu with no cursor at all.
      if (this._pointerLockAcquired && !pointerLockIsLegitimate(this.state, inPureFlightForLock(this.state))) {
        setPointerLock(false);
        this._pointerLockAcquired = false;
      }
    };
    // Re-arm pointer lock from the click's user activation while the mode is on. mousedown
    // (capture) runs before the fire handler and does not consume the event.
    this._onPointerDown = (e) => {
      if (!this.state?.input?.autoFire || this._pointerLockAcquired
        || !inPureFlightForLock(this.state) || isUiCommandTarget(e?.target)) return;
      setPointerLock(true, this.state);
    };
    this._onVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.hidden === true) this._onBlur?.();
    };
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('pointerlockchange', this._onPointerLockChange);
      document.addEventListener('mousedown', this._onPointerDown, { capture: true });
      document.addEventListener('visibilitychange', this._onVisibilityChange);
    }
    this._unsubMode = this.bus && this.bus.on
      ? this.bus.on('mode:changed', ({ mode } = {}) => {
        if (mode !== 'flight') this.reset();
      })
      : null;
    this._unsubDock = this.bus && this.bus.on
      ? this.bus.on('dock:docked', () => this.reset())
      : null;
    // INF-093: a save transition rebuilds entities with remapped ids. A stale autoAim lock or
    // in-progress draw path would aim — and mark — the wrong ship after Continue, on routes
    // where no mode detour disarms the mode first. Release at restore start and again on
    // loaded (idempotent), mirroring bulletTime's lease-safety set.
    this._unsubSaveRestoring = this.bus && this.bus.on
      ? this.bus.on('save:restoring', () => this.reset())
      : null;
    this._unsubSaveLoaded = this.bus && this.bus.on
      ? this.bus.on('save:loaded', () => this.reset())
      : null;
    // A menu (or dock) freezes sim ticks, which stops update()'s per-tick lock reconcile —
    // and pause flips mode directly without a mode:changed event, so reset() never runs.
    // Release the LOCK at the pause boundary itself (tick-independent): the mode stays on,
    // the OS cursor comes back under the menu, and the next canvas mousedown re-acquires
    // on resume (see _onPointerDown).
    this._unsubPause = this.bus && this.bus.on
      ? this.bus.on('sim:pause', () => {
        setPointerLock(false);
        this._pointerLockAcquired = false;
      })
      : null;

    this._onKeyDown = (e) => {
      if (!inPureFlightForLock(this.state)
        || isTextEntryTarget(e.target) || isUiCommandTarget(e.target)) return;
      const code = eventCode(e);
      if (!isAutoFireCode(this.state, code)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat) return;
      if (!this._gHeld) {
        const enabled = toggleAutoTarget(this.state, this.bus, this._runtime);
        setPointerLock(enabled, this.state);
        if (enabled && typeof document !== 'undefined') {
          const canvas = document.getElementById && document.getElementById('gl-canvas');
          this._pointerLockAcquired = !!(canvas && document.pointerLockElement === canvas);
        } else if (!enabled) {
          this._pointerLockAcquired = false;
        }
        this._gHeld = true;
      }
    };
    this._onBlur = () => {
      this._gHeld = false;
      // Window focus lost (Alt-Tab, overlay): a lock held across the switch hides the OS
      // cursor with no reticle on return until something reconciles it — release now. The
      // mode stays on; the next canvas mousedown re-acquires (see _onPointerDown). The flag
      // clears eagerly: a re-acquire attempt while somehow still locked is a guarded no-op.
      setPointerLock(false);
      this._pointerLockAcquired = false;
      if (this.state?.input?.drawFlight) delete this.state.input.drawFlight;
      if (this.state?.input?.autoTargetPath) this.state.input.autoTargetPath.active = false;
    };
    this._onKeyUp = (e) => {
      const code = eventCode(e);
      if (isAutoFireCode(this.state, code)) this._gHeld = false;
    };
    if (typeof addEventListener === 'function') {
      addEventListener('keydown', this._onKeyDown, { capture: true });
      addEventListener('keyup', this._onKeyUp, { capture: true });
      addEventListener('blur', this._onBlur);
      addEventListener('pagehide', this._onBlur);
    }
  },

  reset({ toast = false } = {}) {
    const inp = this.state && this.state.input;
    const wasEnabled = !!(inp && inp.autoFire);
    if (inp) {
      inp.autoFire = false;
      if (inp.autoAim) inp.autoAim = null;
      if (inp.drawFlight) delete inp.drawFlight;
      if (inp.autoTargetPath) inp.autoTargetPath.active = false;
    }
    this._runtime = createAutoTargetRuntime();
    this._gHeld = false;
    setPointerLock(false);
    this._pointerLockAcquired = false;
    if (toast && wasEnabled && this.bus) {
      this.bus.emit('toast', { text: 'Auto-target OFF', kind: 'info', ttl: 2 });
    }
  },

  destroy() {
    this.reset();
    if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      if (this._onPointerLockChange) {
        document.removeEventListener('pointerlockchange', this._onPointerLockChange);
      }
      if (this._onPointerDown) {
        document.removeEventListener('mousedown', this._onPointerDown, { capture: true });
      }
      if (this._onVisibilityChange) document.removeEventListener('visibilitychange', this._onVisibilityChange);
    }
    if (this._unsubMode) this._unsubMode();
    if (this._unsubDock) this._unsubDock();
    if (this._unsubSaveRestoring) this._unsubSaveRestoring();
    if (this._unsubSaveLoaded) this._unsubSaveLoaded();
    if (this._unsubPause) this._unsubPause();
    if (typeof removeEventListener === 'function') {
      if (this._onKeyDown) removeEventListener('keydown', this._onKeyDown, { capture: true });
      if (this._onKeyUp) removeEventListener('keyup', this._onKeyUp, { capture: true });
      if (this._onBlur) removeEventListener('blur', this._onBlur);
      if (this._onBlur) removeEventListener('pagehide', this._onBlur);
    }
    this._onKeyDown = null;
    this._onKeyUp = null;
    this._onBlur = null;
    this._onPointerLockChange = null;
    this._onPointerDown = null;
    this._onVisibilityChange = null;
    this._unsubMode = null;
    this._unsubDock = null;
    this._unsubSaveRestoring = null;
    this._unsubSaveLoaded = null;
    this._unsubPause = null;
    this._gHeld = false;
  },

  update(dt, state) {
    const live = state || this.state;
    if (!inPureFlightForLock(live)) {
      if (live?.input?.drawFlight) delete live.input.drawFlight;
      if (live?.input?.autoAim) live.input.autoAim = null;
      if (live?.input?.autoTargetPath) live.input.autoTargetPath.active = false;
      this._runtime = createAutoTargetRuntime();
      setPointerLock(false);
      return;
    }
    // Reconcile the lock every tick, not just at toggle sites: writers like
    // main.js resetCombatInputMode clear autoFire without touching the lock API, and a lock
    // request that was pending at toggle-off lands later. Off mode must not hold it.
    if (live?.input?.autoFire !== true) releasePointerLockIfHeld();
    const controllerToggle = live && live.input && live.input.actions
      && live.input.actions.autoTargetToggle === true;
    if (controllerToggle) {
      const enabled = toggleAutoTarget(live, this.bus, this._runtime);
      // Controller draw-to-fly is a direct right-stick clutch and never needs pointer lock.
      if (!enabled) setPointerLock(false);
      this._pointerLockAcquired = false;
    }
    tickAutoTarget(live, dt, this.bus, this._runtime);
  },
};
