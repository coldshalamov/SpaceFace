// Asteroid screen input controller — DRIVE / BUILD mode state machine.
// DRIVE reuses the shipped fixed-step drill input controller (hold-to-move, bounded catch-up).
// BUILD parks the rover and moves a cell cursor instead: arrows/WASD move it, Enter places or
// paints, Delete dismantles, Q/E cycle the palette. Keyboard-first by design — the whole build
// loop is reachable without a pointer (a11y parity with the shipped drill lens).
import { createDrillInputController } from '../screens/drill.js';
import { DRILL_CONST } from '../../systems/drill.js';

const { COLS, ROWS } = DRILL_CONST;

export const MODES = Object.freeze({ DRIVE: 'drive', BUILD: 'build' });

export function createAsteroidController({ drillSys, getDrillState, controlMap, hooks }) {
  const drive = createDrillInputController({ drillSys, getState: getDrillState });
  const state = {
    mode: MODES.DRIVE,
    cursor: { col: Math.floor(COLS / 2), row: 1 },
    paletteIndex: 0,
    dragPaint: null, // 'on' | 'off' while pointer-painting overlays
  };

  function setMode(mode) {
    if (state.mode === mode) return false;
    state.mode = mode;
    if (mode === MODES.BUILD) {
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
    state.cursor.col = Math.max(0, Math.min(COLS - 1, state.cursor.col + dc));
    state.cursor.row = Math.max(0, Math.min(ROWS - 1, state.cursor.row + dr));
    if (hooks.onCursorMoved) hooks.onCursorMoved(state.cursor);
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
    if (state.mode === MODES.DRIVE) {
      const direction = directionFor(code);
      if (direction) {
        if (!ev.repeat && drive.press(direction) && hooks.onDriveStep) hooks.onDriveStep();
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
      const [dc, dr] = CURSOR_VECTORS[direction];
      moveCursor(dc, dr);
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
    if (/^Digit[1-9]$/.test(code)) {
      if (hooks.onSelectPalette) hooks.onSelectPalette(Number(code.slice(5)) - 1);
      ev.preventDefault();
      return true;
    }
    return false;
  }

  function onKeyUp(ev) {
    if (state.mode !== MODES.DRIVE) return false;
    const direction = directionFor(ev.code);
    if (direction) {
      drive.release(direction);
      ev.preventDefault();
      return true;
    }
    return false;
  }

  return {
    state,
    drive,
    setMode,
    moveCursor,
    onKeyDown,
    onKeyUp,
    tick(dt) { if (state.mode === MODES.DRIVE) return drive.tick(dt); return false; },
    cancel() { drive.cancel(); state.dragPaint = null; },
  };
}
