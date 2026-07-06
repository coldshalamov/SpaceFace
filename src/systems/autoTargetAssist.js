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
  return key === 'f' ? 'KeyF' : '';
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
    this._fHeld = false;
    this._runtime = createAutoTargetRuntime();

    this._onKeyDown = (e) => {
      if (modalInputActive() || isTextEntryTarget(e.target) || isUiCommandTarget(e.target)) return;
      const code = eventCode(e);
      if (!isAutoFireCode(this.state, code)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!this._fHeld) {
        toggleAutoTarget(this.state, this.bus, this._runtime);
        this._fHeld = true;
      }
    };
    this._onKeyUp = (e) => {
      const code = eventCode(e);
      if (isAutoFireCode(this.state, code)) this._fHeld = false;
    };
    if (typeof addEventListener === 'function') {
      addEventListener('keydown', this._onKeyDown, { capture: true });
      addEventListener('keyup', this._onKeyUp, { capture: true });
    }
  },

  destroy() {
    if (typeof removeEventListener === 'function') {
      if (this._onKeyDown) removeEventListener('keydown', this._onKeyDown, { capture: true });
      if (this._onKeyUp) removeEventListener('keyup', this._onKeyUp, { capture: true });
    }
    this._onKeyDown = null;
    this._onKeyUp = null;
    this._fHeld = false;
  },

  update(dt, state) {
    tickAutoTarget(state || this.state, dt, this.bus, this._runtime);
  },
};