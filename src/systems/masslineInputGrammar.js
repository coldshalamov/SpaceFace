// Fixed-tick Massline gesture grammar. Device bindings remain in input.js.
// CADENCE: a tap cuts; a hold NEVER cuts on release, even when the pilot did not move an axis.
// Intent memory helps ENTER line control, but never keeps winding after an axis returns neutral.
export const MASSLINE_HOLD_S = 0.16;
export const MASSLINE_INTENT_WINDOW_S = 0.22;
const DEADZONE = 0.08;

export function neutralMasslineCommand(target = {}) {
  target.phase = 'idle'; target.latch = false; target.cut = false;
  target.lineControl = false; target.lineLength = 0; target.reelIn = 0; target.payOut = 0;
  target.orbitDirection = 0; target.pump = false; target.buffered = false; target.source = null;
  return target;
}

export function createMasslineInputGrammar() {
  const command = neutralMasslineCommand({});
  let wasHeld = false, heldS = 0, pressStartedAttached = false, enteredLineControl = false;
  let pressSource = null, blockUntilRelease = false;
  let rememberedLineLength = 0, rememberedLineAgeS = Infinity;
  let rememberedOrbit = 0, rememberedOrbitAgeS = Infinity;

  function reset(block = false) {
    wasHeld = false; heldS = 0; pressStartedAttached = false; enteredLineControl = false;
    pressSource = null; blockUntilRelease = !!block;
    rememberedLineLength = 0; rememberedLineAgeS = Infinity;
    rememberedOrbit = 0; rememberedOrbitAgeS = Infinity;
    return neutralMasslineCommand(command);
  }

  function step(dt, raw = {}) {
    neutralMasslineCommand(command);
    const tickS = Number.isFinite(dt) ? Math.max(0, Math.min(0.25, dt)) : 0;
    if (!(tickS > 0)) return command;
    const held = !!raw.held, attached = !!raw.attached;
    const lineLength = axis(raw.lineLength), orbit = axis(raw.orbitDirection);
    if (lineLength) { rememberedLineLength = lineLength; rememberedLineAgeS = 0; }
    else if ((rememberedLineAgeS += tickS) > MASSLINE_INTENT_WINDOW_S) rememberedLineLength = 0;
    if (orbit) { rememberedOrbit = orbit; rememberedOrbitAgeS = 0; }
    else if ((rememberedOrbitAgeS += tickS) > MASSLINE_INTENT_WINDOW_S) rememberedOrbit = 0;

    if (blockUntilRelease) {
      if (!held) { blockUntilRelease = false; rememberedLineLength = 0; rememberedOrbit = 0; }
      wasHeld = held;
      return command;
    }
    const pressed = held && !wasHeld, released = !held && wasHeld;
    if (pressed) {
      heldS = 0; pressStartedAttached = attached; enteredLineControl = false;
      pressSource = raw.source || null;
      if (!attached) { command.phase = 'preview'; command.latch = true; }
    }
    let justEntered = false;
    if (held) {
      heldS += tickS;
      if (attached && heldS + 1e-10 >= MASSLINE_HOLD_S && !enteredLineControl) {
        enteredLineControl = true;
        justEntered = true;
      }
    }
    let releaseSource = null;
    if (released) {
      releaseSource = pressSource;
      command.cut = attached && pressStartedAttached && heldS < MASSLINE_HOLD_S - 1e-10;
      heldS = 0; pressStartedAttached = false; enteredLineControl = false; pressSource = null;
      rememberedLineLength = 0; rememberedOrbit = 0;
    }
    if (attached) command.phase = enteredLineControl && held ? 'line-control' : 'latched';
    if (attached && enteredLineControl && held) {
      // Pre-gesture memory is consumed ONCE. Neutral/reversal then reaches the winch this tick.
      const resolvedLine = justEntered && !lineLength ? rememberedLineLength : lineLength;
      const resolvedOrbit = justEntered && !orbit ? rememberedOrbit : orbit;
      command.lineControl = true;
      command.lineLength = resolvedLine; command.reelIn = Math.max(0, -resolvedLine);
      command.payOut = Math.max(0, resolvedLine); command.orbitDirection = resolvedOrbit;
      command.pump = !!raw.pump;
      command.buffered = justEntered && ((!lineLength && !!resolvedLine) || (!orbit && !!resolvedOrbit));
    }
    command.source = held ? pressSource : releaseSource;
    wasHeld = held;
    return command;
  }
  function snapshot() { return { ...command }; }
  return Object.freeze({ step, reset, snapshot, command });
}
function axis(value) {
  if (!Number.isFinite(value) || Math.abs(value) <= DEADZONE) return 0;
  return Math.max(-1, Math.min(1, value));
}
