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

export const autoTargetAssist = {
  name: 'autoTargetAssist',

  init(ctx) {
    if (this._onKeyDown) this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this._gHeld = false;
    this._runtime = createAutoTargetRuntime();
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
        toggleAutoTarget(this.state, this.bus, this._runtime);
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
    const wasEnabled = !!(inp && inp.pursuitSlot && inp.pursuitSlot.active);
    if (inp) {
      inp.autoFire = false;
      if (inp.pursuitSlot) {
        inp.pursuitSlot = {
          ...inp.pursuitSlot,
          active: false,
          reason: 'reset',
          releasedTick: Number.isFinite(this.state && this.state.tick) ? this.state.tick : null,
        };
      }
    }
    if (this._runtime) {
      this._runtime.lastActive = false;
      this._runtime.lastReason = 'reset';
    }
    this._gHeld = false;
    if (toast && wasEnabled && this.bus) {
      this.bus.emit('toast', { text: 'Pursuit assist OFF', kind: 'info', ttl: 2 });
    }
  },

  destroy() {
    this.reset();
    if (this._unsubMode) this._unsubMode();
    if (this._unsubDock) this._unsubDock();
    if (typeof removeEventListener === 'function') {
      if (this._onKeyDown) removeEventListener('keydown', this._onKeyDown, { capture: true });
      if (this._onKeyUp) removeEventListener('keyup', this._onKeyUp, { capture: true });
    }
    this._onKeyDown = null;
    this._onKeyUp = null;
    this._unsubMode = null;
    this._unsubDock = null;
    this._gHeld = false;
  },

  update(dt, state) {
    tickAutoTarget(state || this.state, dt, this.bus, this._runtime);
  },
};
