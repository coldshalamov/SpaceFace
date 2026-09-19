// Deterministic Massline input grammar (PQ-003 / SF-04).
//
// Raw device bindings stay in input.js. This kernel receives one normalized thumb action plus
// ship-local axes and publishes the command packet consumed by tether gameplay. All timing is
// advanced by the fixed simulation dt; browser wall time never decides tap/hold or intent memory.

export const MASSLINE_HOLD_S = 0.16;
export const MASSLINE_INTENT_WINDOW_S = 0.22;

const DEADZONE = 0.08;

export function neutralMasslineCommand(target = {}) {
  target.phase = 'idle';
  target.latch = false;
  target.cut = false;
  target.lineControl = false;
  target.lineLength = 0;
  target.reelIn = 0;
  target.payOut = 0;
  target.orbitDirection = 0;
  target.pump = false;
  target.buffered = false;
  target.source = null;
  return target;
}

export function createMasslineInputGrammar() {
  const command = neutralMasslineCommand({});
  let wasHeld = false;
  let heldS = 0;
  let pressStartedAttached = false;
  let enteredLineControl = false;
  let pressSource = null;
  let blockUntilRelease = false;
  let rememberedLineLength = 0;
  let rememberedLineAgeS = Infinity;
  let rememberedOrbit = 0;
  let rememberedOrbitAgeS = Infinity;

  function reset(block = false) {
    wasHeld = false;
    heldS = 0;
    pressStartedAttached = false;
    enteredLineControl = false;
    pressSource = null;
    blockUntilRelease = !!block;
    rememberedLineLength = 0;
    rememberedLineAgeS = Infinity;
    rememberedOrbit = 0;
    rememberedOrbitAgeS = Infinity;
    return neutralMasslineCommand(command);
  }

  function step(dt, raw = {}) {
    neutralMasslineCommand(command);
    const tickS = clamp(Number(dt) || 0, 0, 0.25);
    const held = !!raw.held;
    const attached = !!raw.attached;
    const lineLength = axis(raw.lineLength);
    const orbit = axis(raw.orbitDirection);
    let releaseSource = null;

    if (Math.abs(lineLength) > DEADZONE) {
      rememberedLineLength = lineLength;
      rememberedLineAgeS = 0;
    } else {
      rememberedLineAgeS += tickS;
      if (rememberedLineAgeS > MASSLINE_INTENT_WINDOW_S) rememberedLineLength = 0;
    }
    if (Math.abs(orbit) > DEADZONE) {
      rememberedOrbit = orbit;
      rememberedOrbitAgeS = 0;
    } else {
      rememberedOrbitAgeS += tickS;
      if (rememberedOrbitAgeS > MASSLINE_INTENT_WINDOW_S) rememberedOrbit = 0;
    }

    if (blockUntilRelease) {
      if (!held) blockUntilRelease = false;
      wasHeld = held;
      return command;
    }

    const pressed = held && !wasHeld;
    const released = !held && wasHeld;
    if (pressed) {
      heldS = 0;
      pressStartedAttached = attached;
      enteredLineControl = false;
      pressSource = raw.source || null;
      if (!attached) {
        command.phase = 'preview';
        command.latch = true;
      }
    }

    if (held) {
      heldS += tickS;
      const hasLineIntent = Math.abs(lineLength) > DEADZONE
        || Math.abs(orbit) > DEADZONE
        || !!raw.pump
        || Math.abs(rememberedLineLength) > DEADZONE
        || Math.abs(rememberedOrbit) > DEADZONE;
      if (attached && heldS >= MASSLINE_HOLD_S && hasLineIntent) enteredLineControl = true;
    }

    if (released) {
      releaseSource = pressSource;
      if (attached && pressStartedAttached && !enteredLineControl) command.cut = true;
      heldS = 0;
      pressStartedAttached = false;
      enteredLineControl = false;
      pressSource = null;
    }

    if (attached) command.phase = enteredLineControl && held ? 'line-control' : 'latched';
    if (attached && enteredLineControl && held) {
      const resolvedLine = Math.abs(lineLength) > DEADZONE ? lineLength : rememberedLineLength;
      const resolvedOrbit = Math.abs(orbit) > DEADZONE ? orbit : rememberedOrbit;
      command.lineControl = true;
      command.lineLength = resolvedLine;
      command.reelIn = Math.max(0, -resolvedLine);
      command.payOut = Math.max(0, resolvedLine);
      command.orbitDirection = resolvedOrbit;
      command.pump = !!raw.pump;
      command.buffered = (Math.abs(lineLength) <= DEADZONE && Math.abs(resolvedLine) > 0)
        || (Math.abs(orbit) <= DEADZONE && Math.abs(resolvedOrbit) > 0);
    }
    command.source = held ? pressSource : releaseSource;
    wasHeld = held;
    return command;
  }

  /** Read-only copy of the last step packet (no state change). Used after tape rebuild. */
  function snapshot() {
    return { ...command };
  }

  return Object.freeze({ step, reset, snapshot, command });
}

function axis(value) {
  const finite = Number.isFinite(value) ? value : 0;
  return Math.abs(finite) <= DEADZONE ? 0 : clamp(finite, -1, 1);
}

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}
