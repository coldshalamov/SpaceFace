// Presentation reads authoritative state; it never writes gameplay heat, dock or run state.
export const TEMPERATURES = Object.freeze(['flight', 'menu', 'docked', 'wanted', 'crucible', 'works']);
const CRUCIBLE_SCREENS = new Set(['crucible', 'crucibleDraft', 'crucibleResults', 'crucibleLab']);
const WORKS_SCREENS = new Set(['drill', 'asteroid']);
export const TEMPERATURE_EVENTS = Object.freeze([
  'mode:changed', 'heat:changed', 'dock:docked', 'dock:undocked',
  'sim:pause', 'sim:resume', 'game:started', 'save:loaded',
  'run:started', 'run:transitioned', 'run:ended',
]);

export function setTemperature(name, root = globalThis.document?.documentElement) {
  if (!TEMPERATURES.includes(name)) throw new RangeError(`Unknown kit temperature: ${name}`);
  if (!root?.dataset) return false;
  if (root.dataset.kTemp === name) return false;
  root.dataset.kTemp = name;
  return true;
}

/** top can be supplied by a screen owner/test; no polling or DOM writes to discover it. */
export function deriveTemperature(state, top = globalThis.document?.body?.dataset.kScreen || '') {
  if (WORKS_SCREENS.has(top)) return 'works';
  // The pinned run owner uses state.run.kind/phase, not the spec's illustrative crucible.run.
  const run = state?.run;
  const inRun = run?.kind === 'survival' && typeof run.phase === 'string'
    && !['inactive', 'ended'].includes(run.phase);
  if (CRUCIBLE_SCREENS.has(top) || inRun) return 'crucible';
  if ((state?.player?.heat ?? 0) >= 0.15) return 'wanted';
  if (state?.ui?.docked === true) return 'docked';
  if (top === 'mainMenu') return 'flight';
  if (top || state?.mode === 'menu') return 'menu';
  return 'flight';
}

/** Returns the apply callback (spec API), with .dispose() for UI lifecycle teardown. */
export function bindTemperature(bus, state, { root, getTop } = {}) {
  if (typeof bus?.on !== 'function') throw new TypeError('kit.bindTemperature requires the event bus');
  let disposed = false;
  let eventTop;
  const apply = () => {
    if (disposed) return false;
    const top = getTop ? getTop() : eventTop ?? globalThis.document?.body?.dataset.kScreen ?? '';
    return setTemperature(deriveTemperature(state, top), root);
  };
  const offs = TEMPERATURE_EVENTS.map(name => bus.on(name, apply));
  offs.push(bus.on('ui:screenTop', payload => {
    eventTop = typeof payload?.id === 'string' ? payload.id : '';
    apply();
  }));
  apply.dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const off of offs) if (typeof off === 'function') off();
  };
  apply();
  return apply;
}
