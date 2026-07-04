// Live interaction binding labels (spec §15.4: "prompts use live bindings; docking defaults to E").
//
// A single source of truth for the key a player presses to perform a context action. Prompts
// (alerts), the help screen, and the input handler all read from here, so changing a binding in one
// place updates every prompt automatically — there is no hardcoded "[ ENTER ]" string that can drift
// out of sync with the actual handler. This is the lightweight "live binding registry" the spec asks
// for: prompts render from this registry, not from literal key names.

export const BINDINGS = Object.freeze({
  // Default interact/dock action is `E` (spec §15.4 / INTEGRATION_MAP §5). The input handler in
  // src/ui/input.js must keep its case clause in sync with this value.
  dock: { key: 'e', code: 'KeyE', label: 'E' },
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
});

// Render a bracketed prompt label, e.g. "[ E ] DOCK AT STATION".
export function promptLabel(action) {
  const b = BINDINGS[action];
  return b ? `[ ${b.label} ]` : '';
}
