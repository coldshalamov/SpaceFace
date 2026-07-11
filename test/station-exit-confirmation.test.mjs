// UIUX-STATION-EXIT-CONFIRMATION-TESTS-001
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  commitStationUndock,
  installStationExitGate,
  setStationExitOwner,
  stationExitNeedsConfirm,
} from '../src/ui/screens/stationHub.js';

assert.equal(stationExitNeedsConfirm('implicit', 'ready', false), true,
  'implicit Back confirms even when departure readiness is green');
assert.equal(stationExitNeedsConfirm('explicit', 'risk', false), true,
  'keyboard/gamepad Undock confirms when departure readiness reports risk');
assert.equal(stationExitNeedsConfirm('explicit', 'risk', true), false,
  'a completed pointer/touch hold is already deliberate');
assert.equal(stationExitNeedsConfirm('explicit', 'ready', false), false,
  'the explicit native Undock control can launch immediately when ready');

const delivered = [];
const bus = { emit(event, payload) { delivered.push({ event, payload }); } };
const state = { ui: { docked: true } };
const requests = [];
setStationExitOwner({ requestStationExit(request) { requests.push(request); } });
installStationExitGate({ bus, state });

bus.emit('dock:undocked', { source: 'escape' });
assert.equal(delivered.length, 0, 'bare dock:undocked cannot reach downstream side effects');
assert.deepEqual(requests.map(({ intent, source, held }) => ({ intent, source, held })), [
  { intent: 'implicit', source: 'escape', held: false },
]);

bus.emit('toast', { text: 'still routed' });
assert.equal(delivered.length, 1, 'the gate leaves unrelated events untouched');

commitStationUndock(bus, { source: 'confirmed-back' });
assert.equal(delivered.length, 2, 'the committed path emits exactly one canonical undock');
assert.equal(delivered[1].event, 'dock:undocked');
assert.deepEqual(delivered[1].payload, { source: 'confirmed-back', committed: true });

const hubSource = readFileSync(new URL('../src/ui/screens/stationHub.js', import.meta.url), 'utf8');
const managerSource = readFileSync(new URL('../src/ui/screenManager.js', import.meta.url), 'utf8');
const rootSource = readFileSync(new URL('../src/ui/uiRoot.js', import.meta.url), 'utf8');
assert.match(hubSource, /if\s*\(intent\s*===\s*'implicit'\)\s*\{[\s\S]*?_clearStationTransient\(\)/,
  'implicit Back clears station-local transient UI before prompting');
assert.match(hubSource, /cancelLabel:\s*'Stay'/,
  'station exit confirmation exposes an explicit safe choice');
assert.match(hubSource, /commitStationUndock\(bus,\s*\{\s*source:/,
  'accepted exit converges on the canonical committed event');
assert.match(managerSource, /station:exitRequest[\s\S]{0,180}intent:\s*'implicit'[\s\S]{0,180}source:\s*'backdrop'/,
  'station backdrop dismissal routes through the implicit exit owner');
assert.match(rootSource, /docked\s*===\s*true[\s\S]{0,220}!\(payload\s*&&\s*payload\.committed\)/,
  'uiRoot retains defense in depth against an uncommitted undock');

setStationExitOwner(null);
console.log('Station exit confirmation checks OK');
