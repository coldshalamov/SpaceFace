import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { BINDINGS } from '../src/ui/bindings.js';

const settingsSource = readFileSync(new URL('../src/ui/screens/settings.js', import.meta.url), 'utf8');

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

console.log('Settings Controls discoverability OK - fixed ship/system shortcuts are visible beside flight rebinds.');
