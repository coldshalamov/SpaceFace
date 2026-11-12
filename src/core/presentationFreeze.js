/**
 * When the player is in a menu, the flight scene stays resident but must not keep
 * submitting. Dock already did this; map/station/pause use the same screen-stack
 * pause the ScreenManager already owns.
 *
 * Coming back is a resume, not a sector re-admission.
 *
 * This freezes the FLIGHT submit, not the canvas. `src/render/uiStage.js` draws a menu's own lit
 * world in the same context while this returns true; the simulation stays frozen either way, which
 * is the property the freeze exists to protect (a map that lets an off-screen enemy keep killing
 * the player is an ambush). Use `canvasIsProtectedDuringFreeze()` before drawing anything else.
 */

export function shouldFreezeFlightSubmit(state) {
  // Loading owns a real opening-scene cook. A retained launch screen must not
  // prevent prepareFrame from admitting the actors its visual gate awaits.
  // Simulation pause is evaluated separately below; the loading veil owns input.
  if (state?.mode === 'loading' && state.render?.sectorShellAdmission !== true) return false;
  return hasFlightFreeze(state);
}

/** Photo exposes the held world through the normal renderer without unpausing simulation. */
export function shouldPresentPausedPhotoFrame(state) {
  if (state?.mode !== 'paused' || state.render?.photoMode?.active !== true) return false;
  if (state.ui?.docked === true || canvasIsProtectedDuringFreeze(state)) return false;
  const stack = state.ui?.screenStack;
  return Array.isArray(stack) && stack[stack.length - 1] === 'pause';
}

function hasFlightFreeze(state) {
  const ui = state && state.ui;
  if (ui && ui.docked === true) return true;
  const stack = ui && ui.screenStack;
  if (Array.isArray(stack) && stack.length > 0) return true;
  // Intentional sector arrival cooks the live next scene before the first
  // Ceres present. Keep bloom off that working set until the cook returns.
  if (state && state.render && state.render.sectorShellAdmission === true) return true;
  return false;
}

/** One service contract shared by the browser, worker, and headless sim frozen paths. */
const HIDDEN_KEEPALIVE_SERVICES = Object.freeze([
  Object.freeze({ name: 'input', method: 'update', clock: 'sim', stateArg: true, when: 'always' }),
  Object.freeze({ name: 'save', method: 'update', clock: 'sim', stateArg: true, when: 'always' }),
  Object.freeze({ name: 'stationServices', method: 'update', clock: 'wall', stateArg: true, when: 'wall-positive' }),
  Object.freeze({ name: 'lawSecurity', method: 'keepalive', clock: 'wall', stateArg: false, when: 'wall-positive' }),
  Object.freeze({ name: 'latchNine', method: 'keepalive', clock: 'wall', stateArg: false, when: 'always' }),
  // PQ-163.03: the frozen dock ticks are the only ticks onboarding gets while berthed - the
  // dock freeze skips every non-keepalive system, so the flight-side caller in onboarding.update
  // cannot deliver the deferred store sentence at the dock that owns the store page it hooks.
  // The method self-gates on ui.docked, so it stays silent under every other freeze (menu,
  // pause, sector-shell cook) and costs one boolean read per frozen tick.
  Object.freeze({ name: 'onboarding', method: 'dockSentenceKeepalive', clock: 'sim', stateArg: true, when: 'always' }),
]);

export const HIDDEN_KEEPALIVE_SYSTEM_NAMES = Object.freeze(
  HIDDEN_KEEPALIVE_SERVICES.map((service) => service.name),
);

/**
 * Run frozen-world services with their owner-specific clocks and arguments. The optional
 * invocation hook retains host perf accounting without duplicating this service list.
 */
export function runHiddenKeepalive({
  state,
  dt = 0,
  wallDt = dt,
  getSystem,
  input = null,
  onInvoke = null,
} = {}) {
  const lookup = typeof getSystem === 'function' ? getSystem : () => null;
  for (const service of HIDDEN_KEEPALIVE_SERVICES) {
    if (service.when === 'wall-positive' && !(wallDt > 0)) continue;
    const system = service.name === 'input' && input ? input : lookup(service.name);
    if (!system || typeof system[service.method] !== 'function') continue;
    if (typeof onInvoke === 'function') onInvoke(service.name, system, service.method);
    const elapsed = service.clock === 'wall' ? wallDt : dt;
    if (service.stateArg) system[service.method](elapsed, state);
    else system[service.method](elapsed);
  }
}

export function isHiddenKeepaliveSystem(name) {
  return HIDDEN_KEEPALIVE_SYSTEM_NAMES.includes(name);
}

/**
 * Map / station / pause / dock / sector-shell cook: skip physics, combat, AI, and the
 * clock. ScreenManager already zeros timeScale; this is the registry-side skip so a
 * forced step cannot keep simulating an ambush behind a menu.
 */
export function shouldSkipFullTickSystems(state) {
  return hasFlightFreeze(state);
}

/**
 * True while an opaque UI surface fully covers the flight canvas but the simulation
 * must keep ticking — the fulfillment boarding blackout (`ui.fulfillmentBlackoutActive`)
 * advances its deterministic FSM on simTime, so freezing systems would strand it. The
 * GL submit is still pure waste: keep prepareFrame draining the presentation journal
 * (the scene stays hot for resume) and skip only the draw.
 */
export function shouldSkipFlightDraw(state) {
  // Flight only: during loading the draw call is the cook itself, and menu/pause states
  // are already caught by shouldFreezeFlightSubmit before this is reached.
  if (!state || state.mode !== 'flight') return false;
  const ui = state.ui;
  return !!(ui && ui.fulfillmentBlackoutActive === true);
}

/**
 * True when the frozen canvas is holding a picture nothing else may draw over.
 *
 * Two freezes are not menus. The loading route owns the boot shell, and a sector-shell admission is
 * mid-cook on the working set the next present needs. Both must keep the canvas they have; a menu
 * freeze must not, because a menu with nothing behind it is the black screen this whole program
 * exists to remove.
 */
export function canvasIsProtectedDuringFreeze(state) {
  if (!state) return true;
  if (state.mode === 'loading') return true;
  return !!(state.render && state.render.sectorShellAdmission === true);
}
