// Live interaction binding labels (spec §15.4: "prompts use live bindings; docking defaults to E").
//
// A single source of truth for the key a player presses to perform a context action. Prompts
// (alerts), the help screen, and the input handler all read from here, so changing a binding in one
// place updates every prompt automatically — there is no hardcoded "[ ENTER ]" string that can drift
// out of sync with the actual handler. This is the lightweight "live binding registry" the spec asks
// for: prompts render from this registry, not from literal key names.

import { GAMEPAD_BUTTON_LABELS, GAMEPAD_DEFAULT_BINDINGS } from '../systems/gamepad.js';

export const BINDINGS = Object.freeze({
  // Default interact/dock action is `E` (spec §15.4 / INTEGRATION_MAP §5). The input handler in
  // src/ui/input.js must keep its case clause in sync with this value.
  dock: { key: 'e', code: 'KeyE', label: 'E' },
  // M is the primary "map" key — open at LOCAL (near-field). N is the star chart (galaxy scale).
  localmap: { key: 'm', code: 'KeyM', label: 'M' },
  starmap: { key: 'n', code: 'KeyN', label: 'N' },
  techTree: { key: 't', code: 'KeyT', label: 'T' },
  missionLog: { key: 'j', code: 'KeyJ', label: 'J' },
  drill: { key: 'b', code: 'KeyB', label: 'B' },
  // U (was C): the C key is the flight-verb SCANNER PULSE in the 2.0 input contract (GDD §7.1);
  // claim-base is a rare contextual action and yields the prime key.
  claimBase: { key: 'u', code: 'KeyU', label: 'U' },
  cargo: { key: 'i', code: 'KeyI', label: 'I' },
  comms: { key: 'l', code: 'KeyL', label: 'L' },
  codex: { key: 'k', code: 'KeyK', label: 'K' },
  // O remains the spec-locked overview pin. The Band takes the modified chord so both persistent
  // flight tools retain a discoverable keyboard path without stealing a gameplay verb.
  band: { key: 'O', code: 'KeyO', label: 'Shift+O', shift: true },
  // Wingman command radial (Micro-Loops). The comms LOG owns L, so the quick fleet-comms radial
  // lives on Z — a free key next to the movement cluster for a thumb-reachable "hands stay on the
  // stick" fleet command.
  fleetCommand: { key: 'z', code: 'KeyZ', label: 'Z' },
});

// --- Device-aware prompt glyphs (PQ-164.01) ----------------------------------------------------
// The bracket chip follows the last-used input device: ui/input.js owns device arbitration and
// pushes it here (plus the resolved pad map, so a remapped button prints its own glyph), and
// every caller of promptLabel() gets the live answer without threading a device argument.

// UI actions that a single pad button performs directly. Verbs with no pad route (drill, cargo,
// comms…) fall back to the keyboard label rather than print a pad lie.
const PAD_ACTION_FOR = Object.freeze({
  dock: 'accept',
  localmap: 'map',
  starmap: 'map',
  codex: 'codex',
});

// The touch overlay's own button captions for the UI actions it covers.
const TOUCH_LABEL_FOR = Object.freeze({
  dock: 'Dock',
  localmap: 'Map',
  starmap: 'Star',
  missionLog: 'Log',
});

let _promptDevice = 'kbm';
let _padMap = null;            // resolved gamepad action -> [std button names]
let _padCaptureHandler = null; // Settings pad-remap capture (one at a time)

export function setPromptDevice(device) {
  _promptDevice = (device === 'gamepad' || device === 'touch') ? device : 'kbm';
}
export function getPromptDevice() {
  return _promptDevice;
}
export function setGamepadPromptBindings(map) {
  _padMap = map || null;
}
export function setGamepadCaptureHandler(fn) {
  _padCaptureHandler = typeof fn === 'function' ? fn : null;
}
export function getGamepadCaptureHandler() {
  return _padCaptureHandler;
}

/** Glyph for the first button bound to a gamepad action under the live (or given) map. */
export function gamepadGlyphForAction(action, map) {
  const src = map || _padMap || GAMEPAD_DEFAULT_BINDINGS;
  const name = src && src[action] && src[action][0];
  return (name && GAMEPAD_BUTTON_LABELS[name]) || '';
}

// Render a bracketed prompt label, e.g. "[ E ] DOCK AT STATION" — or "[ A ]" on a gamepad.
export function promptLabel(action, device) {
  const dev = device || _promptDevice;
  const b = BINDINGS[action];
  if (dev === 'gamepad') {
    const padAction = PAD_ACTION_FOR[action];
    const glyph = padAction ? gamepadGlyphForAction(padAction) : '';
    if (glyph) return `[ ${glyph} ]`;
  } else if (dev === 'touch') {
    const label = TOUCH_LABEL_FOR[action];
    if (label) return `[ ${label} ]`;
  }
  return b ? `[ ${b.label} ]` : '';
}
