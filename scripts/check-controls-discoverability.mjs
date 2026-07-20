import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { BINDINGS } from '../src/ui/bindings.js';

const settingsSource = readFileSync(new URL('../src/ui/screens/settings.js', import.meta.url), 'utf8');
const helpSource = readFileSync(new URL('../src/ui/screens/help.js', import.meta.url), 'utf8');
const hudSource = readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8');
const promptSource = readFileSync(new URL('../src/ui/controlPrompts.js', import.meta.url), 'utf8');

assert.match(settingsSource, /import \{ BINDINGS \} from '\.\.\/bindings\.js';/,
  'Settings Controls must read fixed interface keys from the shared UI binding registry');
assert.match(settingsSource, /export const CONTROL_SHORTCUTS = Object\.freeze\(/,
  'Settings Controls must expose a testable fixed-shortcut roster');
assert.match(settingsSource, /_renderFixedShortcuts\(pane\)/,
  'Controls tab must render the fixed ship/system shortcut reference near rebinds');
assert.match(settingsSource, /sf-controls-fixed-shortcuts/,
  'Fixed shortcut reference needs a stable style/test hook');
assert.match(settingsSource, /Ship\/System Shortcuts/,
  'Fixed shortcut section needs a clear player-facing heading');

for (const action of ['dock', 'missionLog', 'localmap', 'starmap', 'codex', 'techTree', 'cargo', 'comms', 'drill', 'claimBase']) {
  assert.match(settingsSource, new RegExp(`BINDINGS\\.${action}\\.label`),
    `Controls shortcut reference must include ${action} from the binding registry`);
}

const requiredRows = [
  ['Dock / interact', BINDINGS.dock.label],
  ['Mission Log', BINDINGS.missionLog.label],
  ['Local Map', BINDINGS.localmap.label],
  ['Star Map', BINDINGS.starmap.label],
  ['Codex', BINDINGS.codex.label],
  ['Tech Tree', BINDINGS.techTree.label],
  ['Cargo Hold', BINDINGS.cargo.label],
  ['Comms Log', BINDINGS.comms.label],
];

for (const [label] of requiredRows) {
  assert.match(settingsSource, new RegExp(`label: '${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`),
    `Controls shortcut reference must label ${label}`);
}

assert.match(settingsSource, /Fixed ship\/system shortcuts are listed below/,
  'Controls intro should explain why fixed shortcuts appear beside rebinds');
assert.match(settingsSource, /Flight keys above are rebindable here; these interface shortcuts follow the shared binding registry\./,
  'Controls footer should distinguish rebindable flight keys from fixed interface keys');
assert.match(settingsSource, /Massline: tap latch\/cut; hold line control/,
  'Settings must name the live Massline tap/hold grammar');
assert.match(settingsSource, /A\/Cross Massline \(dock\/accept when prompted\)/,
  'Settings must disclose the contextual gamepad A/Cross arbitration');
assert.match(settingsSource, /masslineBindingProfile\s*=\s*MASSLINE_BINDING_PROFILE_SPACE/,
  'Reset to defaults must explicitly adopt the current Space-primary profile');
assert.match(helpSource, /Hold \+ ↑\/↓\/←→: reel\/pay out\/orbit/,
  'Help must teach the line-control axes without inventing separate default keys');
assert.match(helpSource, /A \/ X: Massline \(dock\/accept when prompted\)/,
  'Help must teach the gamepad Massline route and its dock priority');
assert.match(hudSource, /↑ REEL · ↓ PAY OUT · ←→ ORBIT · SHIFT PUMP/,
  'The active tether HUD must visibly signal line-control mode');
assert.match(promptSource, /Space\/F Massline/,
  'Persistent keyboard hints must expose the new default and legacy alias');

console.log('Settings Controls discoverability OK - fixed ship/system shortcuts are visible beside flight rebinds.');
