import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { ANVIL_ORCHARD, createOrchardRecord, normalizeOrchardRecord } from '../src/data/anvilOrchard.js';
import { ORCHARD_GEOMETRY as G, orchardFrameBodySpec } from '../src/data/anvilOrchardBody.js';
import { stableEntityKey } from '../src/data/interactionDescriptorCatalog.js';
import { objectInfoLine } from '../src/ui/targetPanel.js';
import { mountInstrumentCard } from './helpers/infInstrumentScenario.mjs';

// UI projection tests, not a custody/flight fixture: canonical frame identity and the finite
// read-model row describe the accepted cycle2 checkpoint without copying a private save.
function fixture() {
  const state = createGameState(424214);
  state.mode = 'flight'; state.tick = 1319; state.simTime = state.tick / 60;
  state.settings.controls ||= {};
  state.settings.controls.bindings ||= {};
  state.world.currentSectorId = ANVIL_ORCHARD.sectorId;
  const player = { id: 1, type: 'ship', alive: true, team: 0, radius: 8, hull: 100,
    pos: { x: 0, z: -80 }, vel: { x: 0, z: 0 }, data: {} };
  const frame = { id: 2, occupantGeneration: 2, type: 'wreck', alive: true, radius: G.radius,
    hull: 100, hullMax: 100, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, physicsBody: orchardFrameBodySpec(),
    data: { orchardId: ANVIL_ORCHARD.id, orchardKind: 'frame', worldRecordId: G.worldRecordId,
      placeId: 'place_anvil_storm_orchard', authoredAssetId: G.assetId, authoredPayloadAssetId: G.assetId,
      masslineTetherable: false, worldSiteTargetable: true, isLandmark: true,
      salvagePool: { cmdty_scrap_metal: 4 } } };
  state.entities.set(player.id, player); state.entities.set(frame.id, frame);
  state.entityList.push(player, frame); state.playerId = player.id; state.player.targetId = frame.id;
  const row = createOrchardRecord(1);
  row.sourceRemaining = 41;
  row.lots = [
    { id: 'anvil_storm_orchard:0:1', socket: 0, cycle: 1, units: 1, outcome: 'delivered' },
    { id: 'anvil_storm_orchard:0:2', socket: 0, cycle: 2, units: 2, outcome: 'retained' },
    { id: 'anvil_storm_orchard:1:1', socket: 1, cycle: 1, units: 4, outcome: 'retained' },
  ];
  Object.assign(row.sockets[0], { cycle: 2, lotId: 'anvil_storm_orchard:0:2', status: 'stowed' });
  Object.assign(row.sockets[1], { cycle: 1, lotId: 'anvil_storm_orchard:1:1', status: 'stowed' });
  state.sites = { anvilOrchard: row };
  state.ui.componentSelection = { targetId: frame.id, stableKey: stableEntityKey(frame), componentId: 'orchard_socket_0' };
  assert.ok(normalizeOrchardRecord(row));
  return { state, player, frame, row, bus: createBus(), line: () => objectInfoLine(frame, state, player, 50) };
}

function opening(t, progress) {
  t.state.tick = 1310 + progress;
  Object.assign(t.row.sockets[0], { status: 'releasing', operation: 'opening', progress,
    acceptedTick: 1310, completedTick: t.state.tick });
  assert.ok(normalizeOrchardRecord(t.row));
}

function released(t) {
  Object.assign(t.row.sockets[0], { status: 'drifting', operation: 'open', progress: 30,
    acceptedTick: 1280, completedTick: 1310, openedTick: 1310, readyTick: 1310,
    handoff: 'ready', targetRevision: 2 });
  assert.ok(normalizeOrchardRecord(t.row));
}

test('selected Orchard socket reports its finite hydrogen amount and release key, not generic wreck salvage', () => {
  const t = fixture(), before = structuredClone(t.row);
  assert.match(t.line(), /Hydrogen/);
  assert.match(t.line(), /2 units/);
  assert.match(t.line(), /hold B to release/i);
  assert.doesNotMatch(t.line(), /Scrap|RMB|Salvageable/);
  assert.deepEqual(t.row, before, 'presentation does not change finite custody');
});

test('the mounted production target card refreshes quantity without reselecting the socket', () => {
  const t = fixture(), card = mountInstrumentCard(t);
  for (let n = 0; n < 6; n++) card.update();
  const facts = card.el.querySelector('.sf-target__object');
  assert.match(facts.textContent, /2 units/);
  t.row.lots[1].units = 3; t.row.sourceRemaining = 40;
  assert.ok(normalizeOrchardRecord(t.row));
  for (let n = 0; n < 6; n++) card.update();
  assert.match(facts.textContent, /3 units/);
  assert.doesNotMatch(facts.textContent, /2 units/);
});

test('opening progress and the held-input hint update on the same selected component', () => {
  const t = fixture(), card = mountInstrumentCard(t);
  opening(t, 9);
  for (let n = 0; n < 6; n++) card.update();
  const facts = card.el.querySelector('.sf-target__object');
  assert.match(facts.textContent, /opening 30%/i);
  assert.match(facts.textContent, /hold B/i);
  opening(t, 18);
  for (let n = 0; n < 6; n++) card.update();
  assert.match(facts.textContent, /opening 60%/i);
  t.state.tick = 1670;
  for (let n = 0; n < 6; n++) card.update();
  assert.match(facts.textContent, /opening 60%.*wait for calm/i);
  assert.doesNotMatch(facts.textContent, /hold B/i);
});

test('the release hint follows the current beam binding', () => {
  const t = fixture(); t.state.settings.controls.bindings.siteBeam = ['KeyH'];
  assert.match(t.line(), /hold H to release/i);
  assert.doesNotMatch(t.line(), /hold B/i);
  t.state.settings.controls.bindings.siteBeam = [];
  assert.match(t.line(), /hold the release beam/i);
  assert.doesNotMatch(t.line(), /hold B/i);
});

test('forecast, empty and destroyed states explain why release is unavailable', () => {
  const t = fixture(); t.state.tick = 650;
  assert.match(t.line(), /2 units/); assert.match(t.line(), /wait for calm/i);
  assert.doesNotMatch(t.line(), /hold B/i);
  t.state.ui.componentSelection.componentId = 'orchard_socket_2';
  assert.match(t.line(), /empty socket/i);
  t.row.frameStatus = 'destroyed';
  assert.match(t.line(), /frame destroyed/i);
  assert.doesNotMatch(t.line(), /hold B/i);
});

test('released, collected and closing states do not advertise another release or current native readiness', () => {
  const t = fixture(); released(t);
  assert.match(t.line(), /2 units.*released/i); assert.doesNotMatch(t.line(), /hold B|ready to collect/i);
  t.row.lots[1].outcome = 'delivered'; t.row.sockets[0].status = 'delivered';
  assert.match(t.line(), /collected.*socket open/i, 'collection precedes the actual close operation');
  assert.doesNotMatch(t.line(), /socket closed/i);
  t.row.lots[1].outcome = 'delivered'; t.state.tick = 1325;
  Object.assign(t.row.sockets[0], { status: 'delivered', operation: 'closing', progress: 15, completedTick: 1325 });
  assert.ok(normalizeOrchardRecord(t.row)); assert.match(t.line(), /collected.*closing 50%/i);
  t.state.tick = 1340;
  Object.assign(t.row.sockets[0], { operation: 'closed', progress: 0, completedTick: 1340 });
  assert.match(t.line(), /collected.*socket closed/i); assert.doesNotMatch(t.line(), /hold B|RMB/i);
});

test('a lost pod does not claim its still-open socket has closed', () => {
  const t = fixture(); released(t);
  t.row.lots[1].outcome = 'lost'; t.row.sockets[0].status = 'lost';
  assert.ok(normalizeOrchardRecord(t.row));
  assert.match(t.line(), /pod lost/i); assert.doesNotMatch(t.line(), /closed|hold B|RMB/i);
});

test('closing a retained pod socket does not invent collection or loss', () => {
  const t = fixture(); released(t); t.state.tick = 1325;
  Object.assign(t.row.sockets[0], { operation: 'closing', progress: 15, completedTick: 1325 });
  assert.ok(normalizeOrchardRecord(t.row));
  assert.match(t.line(), /2 units.*closing 50%/i);
  assert.doesNotMatch(t.line(), /collected|lost/i);
});

test('a missing or stale component selection gives a finite-source overview', () => {
  const t = fixture(); t.state.ui.componentSelection = null;
  assert.match(t.line(), /41 units in reserve.*select a pod socket/i);
  t.state.ui.componentSelection = { targetId: t.frame.id, stableKey: 'wr:another-machine', componentId: 'orchard_socket_0' };
  assert.match(t.line(), /select a pod socket/i); assert.doesNotMatch(t.line(), /hold B/i);
});

test('malformed custody, foreign sectors and stale entity handles never manufacture a release hint', () => {
  for (const mode of ['invalid-row', 'foreign-sector', 'stale-handle', 'noncanonical-source']) {
    const t = fixture();
    if (mode === 'invalid-row') t.row.sourceRemaining++;
    if (mode === 'foreign-sector') t.state.world.currentSectorId = 'sector_helios_prime';
    if (mode === 'stale-handle') t.state.entities.set(t.frame.id, { ...t.frame });
    if (mode === 'noncanonical-source') t.frame.physicsBody.shape = 'box';
    assert.match(t.line(), /Orchard status unavailable/i, mode);
    assert.doesNotMatch(t.line(), /hold B|RMB|2 units|Scrap/i, mode);
  }
});

test('ordinary wrecks keep their existing salvage facts', () => {
  const t = fixture(); t.frame.data = { salvagePool: { cmdty_ore_iron: 4 } };
  assert.match(t.line(), /Iron Ore ×4/);
  assert.doesNotMatch(t.line(), /Orchard|hold B to release/i);
});
