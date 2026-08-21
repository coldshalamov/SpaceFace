// Asteroid screen input controller — DRIVE / BUILD mode state machine.
// DRIVE delegates to the fixed-step drill input controller, which owns the surgical drive cadence
// (PQ-130.02 / design law §11.7): a tap seats exactly one cell, a hold past MOVE_HOLD_DELAY_S
// cruises one cell per beat, and a tap into rock is a bore bite. This layer's whole job is to make
// sure the *keyboard* never becomes a second, competing clock — OS auto-repeat keydowns are
// dropped on the floor here, and physical key state is tracked so releasing one of two held
// directions hands the rig to the other instead of stalling it.
// BUILD parks the rover and moves a cell cursor instead: arrows/WASD move it, Enter places or
// paints, Delete dismantles, Q/E cycle the palette. Keyboard-first by design — the whole build
// loop is reachable without a pointer (a11y parity with the shipped drill lens).
//
// PQ-130.09: the build cursor now runs on the SAME clock discipline as the rig (law §11.7 / §6.7
// "placement is chess: deliberate, snapped"). It used to ride the OS key-repeat stream, so how far
// one press moved the cursor was a function of the player's keyboard settings — a hold shot it
// across the board in a burst, and a tap on a slow-repeat machine was indistinguishable from a
// hold. Now a press is exactly one cell, the first repeat cannot land before MOVE_HOLD_DELAY_S,
// and every cell after that arrives on the MOVE_CRUISE_INTERVAL_S beat driven by tick(dt).
import { createDrillInputController } from '../screens/drill.js';
import { DRILL_CONST } from '../../systems/drill.js';

const { COLS, ROWS, MOVE_HOLD_DELAY_S, MOVE_CRUISE_INTERVAL_S } = DRILL_CONST;

export const MODES = Object.freeze({ DRIVE: 'drive', BUILD: 'build' });

// Asteroid Ops is a modal control surface, but its mode controller intentionally leaves
// non-console keys unhandled for the global UI router. Claim only keys the console consumed so a
// Build command cannot also activate a focused button, and so Escape changes exactly one layer:
// BUILD -> DRIVE, then DRIVE -> flight.
export function routeAsteroidScreenKeyDown({ controller, event, exit }) {
  if (controller.onKeyDown(event)) {
    event.stopImmediatePropagation();
    return true;
  }
  if (event.code === 'Escape') {
    event.preventDefault();
    event.stopImmediatePropagation();
    exit();
    return true;
  }
  return false;
}

export function createAsteroidController({ drillSys, getDrillState, controlMap, hooks }) {
  const drive = createDrillInputController({ drillSys, getState: getDrillState });
  // Physically-down direction keys, in press order. Not a movement clock — bookkeeping so a
  // release can hand off to a key that is still down.
  const pressedDirections = new Set();
  // The build cursor's own clock. `cursorHold` is the direction currently earning repeats;
  // `cursorTimer` is the seconds still owed before the next cell may land.
  let cursorHold = null;
  let cursorTimer = 0;
  const state = {
    mode: MODES.DRIVE,
    cursor: { col: Math.floor(COLS / 2), row: 1 },
    paletteIndex: 0,
    dragPaint: null, // 'on' | 'off' while pointer-painting overlays
  };

  function stopCursorHold() {
    cursorHold = null;
    cursorTimer = 0;
  }

  function setMode(mode) {
    if (state.mode === mode) return false;
    state.mode = mode;
    stopCursorHold();
    if (mode === MODES.BUILD) {
      pressedDirections.clear();
      drive.cancel();
      const d = getDrillState();
      if (d && d.avatar) {
        state.cursor.col = Math.max(0, Math.min(COLS - 1, d.avatar.col));
        state.cursor.row = Math.max(0, Math.min(ROWS - 1, d.avatar.row));
      }
    } else {
      state.dragPaint = null;
    }
    if (hooks.onModeChanged) hooks.onModeChanged(mode);
    return true;
  }

  function moveCursor(dc, dr) {
    const col = Math.max(0, Math.min(COLS - 1, state.cursor.col + dc));
    const row = Math.max(0, Math.min(ROWS - 1, state.cursor.row + dr));
    const moved = col !== state.cursor.col || row !== state.cursor.row;
    state.cursor.col = col;
    state.cursor.row = row;
    if (hooks.onCursorMoved) hooks.onCursorMoved(state.cursor);
    return moved;
  }

  function stepCursor(direction) {
    const v = CURSOR_VECTORS[direction];
    if (!v) return false;
    return moveCursor(v[0], v[1]);
  }

  function directionFor(code) {
    if (controlMap.left.includes(code)) return 'left';
    if (controlMap.right.includes(code)) return 'right';
    if (controlMap.up.includes(code)) return 'up';
    if (controlMap.down.includes(code)) return 'down';
    return null;
  }

  const CURSOR_VECTORS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

  function onKeyDown(ev) {
    const code = ev.code;
    if (code === 'Escape') {
      if (state.mode === MODES.BUILD) { setMode(MODES.DRIVE); ev.preventDefault(); return true; }
      return false; // screen handles exit
    }
    if (code === 'KeyB') {
      if (!ev.repeat) setMode(state.mode === MODES.BUILD ? MODES.DRIVE : MODES.BUILD);
      ev.preventDefault();
      return true;
    }
    // A number key is an intent to build in EITHER mode (law §6.7: "entered from a palette key or
    // B"). The hook answers false when the palette has no key at that index — before the first
    // Core there is no palette at all — and an unclaimed key is left to its existing owner.
    if (/^Digit[1-9]$/.test(code)) {
      // Re-selecting the same key is idempotent, so a held digit needs no repeat guard — and
      // treating repeats identically keeps "claimed or not" from flipping mid-hold.
      const took = hooks.onSelectPalette
        ? hooks.onSelectPalette(Number(code.slice(5)) - 1) !== false : false;
      if (!took) return false;
      if (state.mode !== MODES.BUILD) setMode(MODES.BUILD);
      ev.preventDefault();
      return true;
    }
    if (state.mode === MODES.DRIVE) {
      const direction = directionFor(code);
      if (direction) {
        // ev.repeat is the OS key-repeat stream. It is deliberately discarded: one physical press
        // is one tap, and every beat after it belongs to the drill clock in drive.tick().
        if (!ev.repeat) {
          pressedDirections.delete(direction);
          pressedDirections.add(direction);
          if (drive.press(direction) && hooks.onDriveStep) hooks.onDriveStep();
        }
        ev.preventDefault();
        return true;
      }
      if (controlMap.scan.includes(code)) {
        if (!ev.repeat && hooks.onScan) hooks.onScan();
        ev.preventDefault();
        return true;
      }
      return false;
    }
    // BUILD mode
    const direction = directionFor(code);
    if (direction) {
      // Same discipline as DRIVE: ev.repeat is the OS key-repeat stream and is dropped on the
      // floor. One physical press seats exactly one cell and stamps MOVE_HOLD_DELAY_S; every cell
      // after that is paid out by tick(dt) on the cruise beat.
      if (!ev.repeat) {
        pressedDirections.delete(direction);
        pressedDirections.add(direction);
        cursorHold = direction;
        cursorTimer = MOVE_HOLD_DELAY_S;
        stepCursor(direction);
      }
      ev.preventDefault();
      return true;
    }
    if (code === 'Enter' || code === 'Space') {
      if (!ev.repeat && hooks.onPlace) hooks.onPlace(state.cursor);
      ev.preventDefault();
      return true;
    }
    if (code === 'Delete' || code === 'KeyX') {
      if (!ev.repeat && hooks.onRemove) hooks.onRemove(state.cursor);
      ev.preventDefault();
      return true;
    }
    if (code === 'KeyQ' || code === 'KeyE') {
      if (!ev.repeat && hooks.onCyclePalette) hooks.onCyclePalette(code === 'KeyE' ? 1 : -1);
      ev.preventDefault();
      return true;
    }
    return false;
  }

  function onKeyUp(ev) {
    const direction = directionFor(ev.code);
    if (!direction) return false;
    // Track physical state even outside DRIVE, so a key released while the build palette is up
    // cannot come back as a phantom hold.
    pressedDirections.delete(direction);
    if (state.mode === MODES.BUILD) {
      if (cursorHold === direction) {
        // Two keys down, one released: hand the cursor to the key still held, and make it earn its
        // cruise from scratch — a new direction is a new tap, exactly as the rig treats it.
        const next = pressedDirections.size ? [...pressedDirections].pop() : null;
        if (next) { cursorHold = next; cursorTimer = MOVE_HOLD_DELAY_S; }
        else stopCursorHold();
      }
      ev.preventDefault();
      return true;
    }
    if (state.mode !== MODES.DRIVE) return false;
    const wasSteering = drive.release(direction);
    // Two keys down, one released: hand the rig to the key still held instead of stalling until
    // the player re-presses. A fresh press restarts the tap-then-hold cycle, which is correct —
    // a new direction is a new tap, and it has to earn its cruise the same way.
    if (wasSteering && pressedDirections.size) {
      const next = [...pressedDirections].pop();
      if (drive.press(next) && hooks.onDriveStep) hooks.onDriveStep();
    }
    ev.preventDefault();
    return true;
  }

  return {
    state,
    drive,
    setMode,
    moveCursor,
    onKeyDown,
    onKeyUp,
    tick(dt) {
      if (state.mode === MODES.DRIVE) return drive.tick(dt);
      if (!cursorHold) return false;
      cursorTimer -= dt;
      if (cursorTimer > 0) return false;
      // At most one cell per rendered frame, like the rig's bounded catch-up: a stalled frame must
      // never teleport the cursor several cells past the seat the player was aiming at.
      const moved = stepCursor(cursorHold);
      cursorTimer = MOVE_CRUISE_INTERVAL_S;
      if (!moved) stopCursorHold(); // pinned against an edge — stop burning beats
      return moved;
    },
    cancel() {
      pressedDirections.clear();
      drive.cancel();
      stopCursorHold();
      state.dragPaint = null;
    },
  };
}
