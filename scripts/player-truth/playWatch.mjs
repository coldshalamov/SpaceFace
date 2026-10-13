// Watch an active flight for two harness failures that otherwise sit until the wall cap:
// sim time barely moving, and a screen that opened on top of the HUD without the script
// asking for it. Pure over recorded samples so the master-gate Circuits stall is a fixture.

/** Sim must move at least this far across STALL_WINDOW_MS of wall time, or the run stops. */
export const STALL_WINDOW_MS = 60_000;
export const STALL_MIN_SIM_S = 0.5;

/**
 * A non-HUD screen already up as the phase becomes active (the draft we just launched
 * from) gets this long to clear. A screen that replaces the flight HUD fails immediately.
 */
export const OPEN_SCREEN_GRACE_MS = 3_000;

export function isHudTop(top) {
  return top == null || top === 'hud';
}

/** Loading is not a stall and not an unexpected screen. Boot overlay or mode "loading". */
export function isLoadingSample(sample) {
  return !!(sample && (sample.mode === 'loading' || sample.boot));
}

function isGradingSample(sample) {
  return !!(sample && sample.phase === 'active' && !isLoadingSample(sample)
    && Number.isFinite(sample.sim) && Number.isFinite(sample.wall));
}

/**
 * Stall when the newest sample is active flight, the samples cover at least `windowMs`,
 * every sample in that span was active and not loading, and sim advanced less than `minSim`.
 * Returns null when the window is not yet covered or the span was not continuously playable.
 */
export function detectSimStall(samples, { windowMs = STALL_WINDOW_MS, minSim = STALL_MIN_SIM_S } = {}) {
  if (!samples || samples.length < 2) return null;
  const last = samples[samples.length - 1];
  if (!isGradingSample(last)) return null;
  const cutoff = last.wall - windowMs;
  let prior = null;
  for (const sample of samples) if (sample.wall <= cutoff) prior = sample;
  if (!prior || !isGradingSample(prior)) return null;
  const span = samples.filter((sample) => sample.wall >= prior.wall && sample.wall <= last.wall);
  if (span.some((sample) => !isGradingSample(sample))) return null;
  const simAdvanced = last.sim - prior.sim;
  if (!Number.isFinite(simAdvanced) || simAdvanced >= minSim) return null;
  return { simAdvanced, wallMs: last.wall - prior.wall, top: last.top ?? null, fromSim: prior.sim, toSim: last.sim };
}

/** A non-HUD screen during active flight. Null when the top is the HUD, or play is not active. */
export function detectUnexpectedScreen(sample) {
  if (!sample || sample.mode !== 'flight' || sample.phase !== 'active' || isLoadingSample(sample)) return null;
  if (isHudTop(sample.top)) return null;
  return { top: sample.top };
}

export function formatLastInput(input) {
  if (!input) return 'none recorded';
  if (input.kind === 'click') {
    const where = Number.isFinite(input.x) && Number.isFinite(input.y) ? `(${Math.round(input.x)}, ${Math.round(input.y)})` : '(?, ?)';
    return `click ${where}${input.element ? ` on ${input.element}` : ''}`;
  }
  if (input.kind === 'key') return `key ${input.code || '?'}`;
  return String(input.kind || 'input');
}

function inputClause(interrupt) {
  const input = formatLastInput(interrupt && interrupt.lastInput);
  const click = interrupt && interrupt.lastClick && interrupt.lastClick !== interrupt.lastInput
    ? `; click ${formatLastInput(interrupt.lastClick).replace(/^click /, '')}`
    : '';
  return `last input ${input}${click}`;
}

export function formatInterruptDetail(interrupt) {
  if (!interrupt) return 'play watch';
  if (interrupt.kind === 'screen') return `screen ${interrupt.top} opened during active play; ${inputClause(interrupt)}`;
  const top = interrupt.top == null ? 'hud' : interrupt.top;
  return `sim stalled (${Number(interrupt.simAdvanced).toFixed(2)} s sim over ${(interrupt.wallMs / 1000).toFixed(0)} s wall while phase active, top ${top}); ${inputClause(interrupt)}`;
}

export function formatPlayStop(watch) {
  const items = (watch && watch.interrupts) || [];
  const bits = items.map((item) => {
    if (item.kind === 'screen') return `screen ${item.top} opened during active play`;
    const top = item.top == null ? 'hud' : item.top;
    return `sim stalled (${Number(item.simAdvanced).toFixed(2)} s sim over ${(item.wallMs / 1000).toFixed(0)} s wall while phase active, top ${top})`;
  });
  const last = items[items.length - 1] || {};
  return `play interrupted: ${bits.join('; ') || 'play watch'}; ${inputClause(last)}`;
}

export function createPlayWatch({ windowMs = STALL_WINDOW_MS, minSim = STALL_MIN_SIM_S, graceMs = OPEN_SCREEN_GRACE_MS } = {}) {
  const samples = [];
  const interrupts = [];
  let lastInput = null;
  let lastClick = null;
  let sawHud = false;
  let nonHudSince = null;
  let activeWall0 = null;
  let activeSim0 = null;
  let activeWall1 = null;
  let activeSim1 = null;

  const record = (item) => {
    if (interrupts.some((have) => have.kind === item.kind)) return null;
    const row = { ...item, lastInput, lastClick };
    interrupts.push(row);
    return row;
  };

  return {
    get interrupts() { return interrupts; },
    setInputs(input, click) {
      if (input) lastInput = input;
      if (click) lastClick = click;
    },
    observe(sample) {
      const fresh = [];
      const screen = detectUnexpectedScreen(sample);
      if (!screen) {
        if (sample && sample.phase === 'active' && sample.mode === 'flight' && isHudTop(sample.top) && !isLoadingSample(sample)) sawHud = true;
        nonHudSince = null;
      } else if (sawHud) {
        const row = record({ kind: 'screen', top: screen.top, sim: sample.sim, t: sample.t, wall: sample.wall });
        if (row) fresh.push(row);
      } else {
        if (nonHudSince == null) nonHudSince = sample.wall;
        else if (sample.wall - nonHudSince >= graceMs) {
          const row = record({ kind: 'screen', top: screen.top, sim: sample.sim, t: sample.t, wall: sample.wall });
          if (row) fresh.push(row);
        }
      }
      const stall = detectSimStall(samples.concat([sample]), { windowMs, minSim });
      samples.push(sample);
      if (samples.length > 4000) {
        const keep = sample.wall - windowMs - 1000;
        const idx = samples.findIndex((item) => item.wall >= keep);
        if (idx > 1) samples.splice(0, idx - 1);
      }
      if (stall) {
        const row = record({ kind: 'stall', ...stall, sim: sample.sim, t: sample.t });
        if (row) fresh.push(row);
      }
      if (isGradingSample(sample)) {
        if (activeWall0 == null) { activeWall0 = sample.wall; activeSim0 = sample.sim; }
        activeWall1 = sample.wall;
        activeSim1 = sample.sim;
      }
      return fresh[0] || null;
    },
    snapshot() {
      return {
        watched: samples.length > 0,
        simAdvanced: activeSim0 == null ? null : +(activeSim1 - activeSim0).toFixed(3),
        wallMs: activeWall0 == null ? null : activeWall1 - activeWall0,
        interrupts: interrupts.map((item) => ({ ...item })),
      };
    },
  };
}
