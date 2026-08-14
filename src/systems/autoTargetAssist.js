// Registry shell for auto-target combat mode (runs immediately after input).
import { DEFAULTS } from './input.js';
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
  return !!(body && body.classList && typeof body.classList.contains === 'function'
    && body.classList.contains('ui-modal-open'));
}

function isAutoFireCode(state, code) {
  return !!code && binding(state, 'autoFire').includes(code);
}

function setPointerLock(enabled) {
  if (typeof document === 'undefined') return;
  const canvas = document.getElementById && document.getElementById('gl-canvas');
  if (enabled) {
    if (!canvas || document.pointerLockElement === canvas || typeof canvas.requestPointerLock !== 'function') return;
    const request = canvas.requestPointerLock();
    if (request && typeof request.catch === 'function') request.catch(() => {});
    return;
  }
  if (canvas && document.pointerLockElement === canvas && typeof document.exitPointerLock === 'function') {
    document.exitPointerLock();
  }
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
    };
    // Re-arm pointer lock from the click's user activation while the mode is on. mousedown
    // (capture) runs before the fire handler and does not consume the event.
    this._onPointerDown = () => {
      if (!this.state?.input?.autoFire || this._pointerLockAcquired) return;
      setPointerLock(true);
    };
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('pointerlockchange', this._onPointerLockChange);
      document.addEventListener('mousedown', this._onPointerDown, { capture: true });
    }
    this._unsubMode = this.bus && this.bus.on
      ? this.bus.on('mode:changed', ({ mode } = {}) => {
        if (mode !== 'flight') this.reset();
      })
      : null;
    this._unsubDock = this.bus && this.bus.on
      ? this.bus.on('dock:docked', () => this.reset())
      : null;

    this._onKeyDown = (e) => {
      if (modalInputActive() || isTextEntryTarget(e.target) || isUiCommandTarget(e.target)) return;
      const code = eventCode(e);
      if (!isAutoFireCode(this.state, code)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!this._gHeld) {
        const enabled = toggleAutoTarget(this.state, this.bus, this._runtime);
        setPointerLock(enabled);
        if (enabled && typeof document !== 'undefined') {
          const canvas = document.getElementById && document.getElementById('gl-canvas');
          this._pointerLockAcquired = !!(canvas && document.pointerLockElement === canvas);
        } else if (!enabled) {
          this._pointerLockAcquired = false;
        }
        this._gHeld = true;
      }
    };
    this._onKeyUp = (e) => {
      const code = eventCode(e);
      if (isAutoFireCode(this.state, code)) this._gHeld = false;
    };
    if (typeof addEventListener === 'function') {
      addEventListener('keydown', this._onKeyDown, { capture: true });
      addEventListener('keyup', this._onKeyUp, { capture: true });
    }
  },

  reset({ toast = false } = {}) {
    const inp = this.state && this.state.input;
    const wasEnabled = !!(inp && inp.autoFire);
    if (inp) inp.autoFire = false;
    if (this._runtime) this._runtime.refreshT = 0;
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
    }
    if (this._unsubMode) this._unsubMode();
    if (this._unsubDock) this._unsubDock();
    if (typeof removeEventListener === 'function') {
      if (this._onKeyDown) removeEventListener('keydown', this._onKeyDown, { capture: true });
      if (this._onKeyUp) removeEventListener('keyup', this._onKeyUp, { capture: true });
    }
    this._onKeyDown = null;
    this._onKeyUp = null;
    this._onPointerLockChange = null;
    this._onPointerDown = null;
    this._unsubMode = null;
    this._unsubDock = null;
    this._gHeld = false;
  },

  update(dt, state) {
    const live = state || this.state;
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
