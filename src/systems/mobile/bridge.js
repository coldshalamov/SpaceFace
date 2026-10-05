import { MobileGestures, canFly, shouldEnable, screenDirection, steerToward } from './model.js';
import { mountMobileView } from './view.js';
import { ALL_POWERS } from './catalog.js';

const NEUTRAL = () => ({ flight: { active:false, magnitude:0, boost:false, brake:false }, actions:{}, aim:null });
const VIRTUAL_ACTIONS = new Set(['tether','reelIn','reelOut','brake', ...ALL_POWERS.filter(p => p.kind !== 'ui').map(p => p.id)]);

/**
 * Adapts mobile intent to the existing input instance. No fake KeyboardEvents, physics writes,
 * global key mutations, duplicate gameplay owners, or replacement of input.update.
 * Legacy trackpad exports and tick behavior remain intact; device ownership is still input.js's.
 */
export function enhanceMobileTouch(touch, ctx = {}, {
  mountView = mountMobileView, win = globalThis.window, doc = globalThis.document,
} = {}) {
  const state = ctx.state;
  const model = new MobileGestures();
  const legacyTick = touch.tick.bind(touch), legacyClear = touch._clearTouchState.bind(touch);
  let view = null, host = null, detach = null, frame = NEUTRAL();
  let lastContext = '', lastTick = -1, allowedLastTick = false, previousHolds = {};
  const cfg = () => state?.settings?.controls?.touch || {};
  const setConfig = (key, value) => {
    if (!state?.settings) return;
    state.settings.controls ||= {}; state.settings.controls.touch ||= {};
    state.settings.controls.touch[key] = value;
    ctx.bus?.emit?.('settings:changed', { section:'controls' });
  };
  // Test/debug inspectable device state, not part of the serialized simulation.
  touch.mobile = { model, get frame() { return frame; } };

  function attach(nextHost) {
    if (!nextHost || nextHost === host) return;
    detach?.(); host = nextHost;
    const originalHeld = host._held, originalExcept = host._heldExcept;
    if (typeof originalHeld !== 'function') return;
    const virtual = action => touch.active && VIRTUAL_ACTIONS.has(action) && frame.actions[action] === true;
    const held = function(live, action) { return originalHeld.call(this, live, action) || virtual(action); };
    const except = function(live, action, code) { return originalExcept.call(this, live, action, code) || virtual(action); };
    host._held = held;
    if (typeof originalExcept === 'function') host._heldExcept = except;
    const attached = host;
    detach = () => {
      if (attached._held === held) attached._held = originalHeld;
      if (attached._heldExcept === except) attached._heldExcept = originalExcept;
      detach = null;
    };
  }
  function neutralize(role = null) {
    // A lost contact is NOT a short tether tap. Reset the authoritative grammar silently.
    if (!role || role === 'tether') {
      const grammar = host?._masslineGrammar;
      const actions = host?.state?.input?.actions || state?.input?.actions;
      // The grammar reuses a command object: preserve the last committed input snapshot.
      if (grammar?.snapshot && actions?.massline === grammar.command) actions.massline = grammar.snapshot();
      grammar?.reset?.(true);
    }
    if (!role) {
      frame = NEUTRAL();
      legacyClear();
      if (host?._holdToggleLatches) {
        for (const verb of ['boost','brake','bulletTime','massline','reelIn','reelOut']) host._holdToggleLatches[verb] = false;
      }
    } else if (role === 'fire') {
      frame.actions.fire = false; touch._btnHeld.fire = false;
      if (touch.actions.fire) touch.actions.fire.held = false;
    } else if (role === 'stick') {
      touch.axes.leftX = 0; touch.axes.leftY = 0; touch._btnHeld.boost = false;
    }
  }
  function activate(power) {
    if (!touch.active || !canFly(state, doc)) return;
    if (power.kind === 'ui') {
      model.reset(); neutralize();
      ctx.bus?.emit?.('touch:uiAction', { action:power.id });
    } else if (power.kind === 'toggle') {
      model.toggle[power.id] = !model.toggle[power.id]; model.activity = true;
    } else {
      model.pulse(power.id); model.activity = true;
    }
  }
  touch.mobile.activate = activate;
  touch._clearTouchState = () => { model.reset(); neutralize(); };
  touch.setEnabled = function(on) {
    const enable = on === true && !!doc?.body;
    if (enable && !view) {
      doc.documentElement.dataset.sfMobile = '1';
      view = mountView({ state, model, activate, reset:neutralize, config:cfg,
        saveConfig:setConfig, win, doc });
      this._overlay = view.root;
    } else if (!enable && view) {
      view.destroy(); view = null; this._overlay = null;
      delete doc.documentElement.dataset.sfMobile;
      delete doc.documentElement.dataset.sfMobileFlight;
    }
    const changed = this.active !== (enable && !!view);
    this.active = enable && !!view;
    if (!this.active) {
      model.reset(); neutralize(); detach?.(); host = null;
      allowedLastTick = false; lastContext = ''; lastTick = -1;
    }
    if (changed) ctx.bus?.emit?.(this.active ? 'touch:enabled' : 'touch:disabled', {});
  };
  touch.autoDetect = function() {
    const coarse = !!win?.matchMedia?.('(pointer: coarse)').matches;
    const enable = shouldEnable(cfg(), win?.innerWidth || 0, win?.innerHeight || 0,
      coarse, win?.navigator?.maxTouchPoints || 0);
    this._enabledByAuto = cfg().enabled == null && enable;
    this.setEnabled(enable);
  };
  touch.applyOverlayConfig = function() { view?.applyConfig(); return cfg(); };
  touch.persistEnabled = function(on) {
    setConfig('enabled', on == null ? null : !!on);
    this.autoDetect();
  };
  touch.tick = function(dt, live = state, inputHost = null) {
    if (!this.active) { legacyTick(dt, live, inputHost); return; }
    attach(inputHost);
    const context = `${live.mode}:${live.playerId}`;
    const allowed = canFly(live, doc);
    const tick = Number.isFinite(live.tick) ? live.tick : lastTick;
    if (!allowed || (lastContext && context !== lastContext) || tick < lastTick) {
      model.reset(); neutralize();
    }
    lastContext = context; lastTick = tick;
    // Entering a different flight session requires fresh contacts, never inherited holds.
    if (!allowed && allowedLastTick) view?.cancelAll();
    allowedLastTick = allowed;
    frame = allowed ? model.sample(dt) : NEUTRAL();
    frame.actions.brake = !!frame.flight.brake;
    if (allowed) for (const [action, held] of Object.entries(model.toggle)) frame.actions[action] = !!held;
    if (frame.cancelledRoles?.has('tether')) neutralize('tether');
    const p = live.entities?.get?.(live.playerId);
    const width = win?.innerWidth || 1280, height = win?.innerHeight || 800;
    const direction = frame.flight.magnitude > 0
      ? screenDirection(frame.flight.x, frame.flight.y, ctx.helpers, p, width, height) : null;
    const drive = steerToward(direction, p?.rot || 0, frame.flight.magnitude);
    this.axes.leftX = drive.turn; this.axes.leftY = -drive.thrust;
    this.axes.rightX = 0; this.axes.rightY = 0;
    // Gun drag is deliberate independent aim; otherwise weapons/tether follow stick or heading.
    let aim = frame.aim ? screenDirection(frame.aim.x, frame.aim.y, ctx.helpers, p, width, height) : direction;
    if (!aim && (frame.actions.fire || frame.actions.tether || Object.keys(frame.actions).some(a => VIRTUAL_ACTIONS.has(a) && frame.actions[a]))) {
      aim = { x:Math.cos(p?.rot || 0), z:Math.sin(p?.rot || 0) };
    }
    if (aim) { this.axes.rightX = aim.x; this.axes.rightY = -aim.z; }
    // Gesture holds never inherit desktop accessibility latches after the thumb lifts.
    const holds = { boost:frame.flight.boost, brake:frame.actions.brake, massline:frame.actions.tether,
      bulletTime:frame.actions.bulletTime, reelIn:frame.actions.reelIn, reelOut:frame.actions.reelOut };
    for (const key of Object.keys(holds)) {
      if (previousHolds[key] && !holds[key] && host?._holdToggleLatches) host._holdToggleLatches[key] = false;
    }
    previousHolds = holds;
    this._btnHeld.fire = !!frame.actions.fire;
    this._btnHeld.boost = !!frame.flight.boost;
    if (model.activity) { this._activityPending = true; model.activity = false; }
    legacyTick(dt, live, inputHost);
    // Rendering is event/tick driven, with numerics throttled by view. No second animation loop.
    view?.render(frame);
  };
  touch.destroy = function() { this.setEnabled(false); };
  return touch;
}
