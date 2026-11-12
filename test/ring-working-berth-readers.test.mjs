// CPU reader evidence. Viewer poses and acquisition status are explicit staging
// after a real default-worker boot; this is not flight, latch or GPU acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { laneRpc } from '../src/core/simLaneCommands.js';
import { fakeDom } from './helpers/fake-dom.mjs';

globalThis.document = fakeDom();
const { buildLocalModel, buildSystemModel, galaxyMapScreen,
  resolveGalaxyMapPrimaryAction, emitGalaxyMapPrimaryAction } = await import('../src/ui/galaxyMap.js');
const { targetDisplayName, targetInteractionClass, objectInfoLine } = await import('../src/ui/targetPanel.js');
const { masslineHud, massPreviewWord } = await import('../src/ui/masslineHud.js');
const { crackerRunEntryGuidance, isCrackerRunWorkLoad } = await import('../src/ui/crackerRunGuidance.js');
const { flightDestinationSurface, resolveFlightObjectiveCommand,
  objectiveBearingGlyph, objectiveTravelReadout } = await import('../src/ui/hud.js');
const { VX_FREE_DRIVE_POI, VX_FREE_DRIVE_ENTRY_GUIDANCE,
  VX_FREE_DRIVE_SECTOR_ID: SID } = await import('../src/data/vxFreeDriveRing.js');

const scenarioContract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8'));

function browserWorker() {
  const entry = new URL('../src/core/wholeSimBrowserWorker.js', import.meta.url).href;
  return new Worker(new URL(`data:text/javascript,${encodeURIComponent(`
    import { parentPort } from 'node:worker_threads';
    const pending = [];
    globalThis.self = globalThis;
    globalThis.postMessage = (message, transfer) => {
      parentPort.postMessage(message, Array.isArray(transfer) ? transfer : []);
      if (message.kind === 'bye') parentPort.close();
    };
    parentPort.on('message', data => typeof self.onmessage === 'function'
      ? self.onmessage({ data }) : pending.push(data));
    await import(${JSON.stringify(entry)});
    for (const data of pending.splice(0)) self.onmessage({ data });
  `)}`), { type: 'module' });
}

// Invoke the actual selected-contact inspector with only its surrounding shell
// stubbed. Its classification, stable resolve, escaping and HTML branch are real.
function inspect(state, target) {
  let html = '';
  const screen = Object.assign(Object.create(galaxyMapScreen), {
    _ctx: { state }, _root: { querySelector: () => null },
    _selectedTarget: target, _inspectorDetails: {}, _setCourseButton: {}, _activeTab: 'overview',
    _syncPublicIdentity() {}, _updateEngageControl() {}, _updatePlotControl() {},
    _renderTabs() {}, _renderPlaceActions() {}, _renderNoteSlot() {},
    _paintInspectorBody(_state, _details, _button, rendered) { html = rendered; },
  });
  screen._updateInspector();
  return html;
}

function acquisitionCaption(state, target) {
  const doc = fakeDom();
  const dom = Object.fromEntries(['previewEl', 'previewMark', 'previewSourceMark', 'previewSvg']
    .map(key => [key, doc._make('div')]));
  // Presentation-only receipt staging, not an assertion about acquisition range.
  state.masslineAcquisition = { id: 'reader-fixture', selected: { targetId: target.id, status: 'ready' } };
  const player = state.entities.get(state.playerId);
  masslineHud._updateAcquisitionPreview(dom, state, player,
    () => ({ x: 500, y: 350, onScreen: true }));
  return dom.previewEl.textContent;
}

test('default worker original working load reaches the real chart, target, Line and berth readers', async () => {
  const state = createGameState(4242), bus = createBus(), worker = browserWorker();
  state.timeScale = 0;
  let receive, lane;
  const exited = new Promise((done, reject) => {
    worker.once('exit', code => code === 0 ? done() : reject(new Error(`worker exit ${code}`)));
    worker.once('error', reject);
  });
  try {
    worker.on('message', message => receive?.(message));
    lane = createSimLaneRuntime({ state, bus, registry: {},
      flags: { lane: 'worker', warnings: [], sab: false }, clockMode: 'worker-local',
      helpers: { scenarioContract },
      channelFactory: () => ({ post: message => worker.postMessage(message),
        onMessage: handler => { receive = handler; }, terminate() {} }),
    });
    await lane.readyPromise;
    assert.equal((await laneRpc('newGameBoot', { opts: { seed: 4242 } })).ok, true);
    const load = [...state.entities.values()].find(e => e.data?.oneOffId === 'oneoff_cracker_loose_ore_tub');
    assert.ok(load, 'the production world owner publishes the original physical load');
    assert.equal(state.world.records?.byId?.[load.data.worldRecordId], undefined,
      'fresh materialization is public before its first durable capture row');
    assert.equal(isCrackerRunWorkLoad(state, load), true);
    assert.equal(load.mass, 24, 'the real worker supplies the mass; the UI does not invent it');
    assert.equal(targetDisplayName(load, { state, concealWreck: true }), 'Loose ore tub');
    assert.equal(targetInteractionClass(load, state), 'Movable yard load');

    const index = state.entityIndex;
    const contact = buildLocalModel(state).contacts.find(c => c.entityId === load.id);
    assert.ok(contact, 'the actual main local chart admits the exact work load');
    assert.equal(contact.stable.key, `record:${load.data.worldRecordId}`);
    // The worker-main realm uses the fallback; exercise the existing in-realm
    // indexed lane with this same published body, without fabricating a body.
    state.entityIndex = { __spacefaceEntityIndexV1: true, ready: true,
      shipLike: [], stations: [], asteroids: [], payloads: [], wrecks: [load] };
    assert.ok(buildLocalModel(state).contacts.some(c => c.entityId === load.id), 'indexed model agrees');
    state.entityIndex = index;
    const action = resolveGalaxyMapPrimaryAction(state, contact);
    assert.equal(action.coursePayload.targetEntityId, load.id);
    assert.equal(action.coursePayload.stable.key, contact.stable.key);
    assert.match(inspect(state, contact), /Movable yard load/);
    assert.match(inspect(state, contact), /Aim at the tub.*to latch.*gently to tow.*again to cut/);
    assert.doesNotMatch(objectInfoLine(load, state), /Salvageable/);
    state.settings.controls.bindings = { ...state.settings.controls.bindings, tether: ['KeyJ'] };
    assert.match(inspect(state, contact), /tap J to latch.*tap J again to cut/,
      'selected inspector resolves current binding rather than caching model copy');
    assert.match(objectInfoLine(load, state), /tap J to latch.*tap J again to cut/);
    state.settings.controls.bindings.tether = [];
    assert.match(inspect(state, contact), /Bind the Line control in Settings/);
    state.settings.controls.bindings.tether = ['KeyJ'];
    assert.match(acquisitionCaption(state, load), /^LOOSE ORE TUB · MASS 24 · /);
    const savedMass = load.mass, savedBody = load.physicsBody;
    delete load.mass; delete load.physicsBody;
    assert.equal(massPreviewWord(load, state.entities.get(state.playerId).mass, state), '');
    assert.doesNotMatch(acquisitionCaption(state, load), /24|MASS/,
      'unknown mirrored mass does not fall back to the authored 24t');
    load.mass = savedMass; load.physicsBody = savedBody;

    const poi = buildSystemModel(state, SID).points.find(p => p.id === VX_FREE_DRIVE_POI.id);
    assert.match(poi.chartNote, /outer entry buoy.*solid Mouth gantry.*load on the Line/);
    const entryAction = resolveGalaxyMapPrimaryAction(state, poi);
    entryAction.coursePayload.autopilot = false;
    assert.equal(emitGalaxyMapPrimaryAction(bus, entryAction), true);
    await laneRpc('journalRebuild');
    // Viewer-only arrival staging. No worker body moves or game time advances.
    state.mode = 'flight';
    const player = state.entities.get(state.playerId);
    player.pos = { x: poi.x + 30, z: poi.z + 10 };
    const command = resolveFlightObjectiveCommand(state), beforeNav = structuredClone(state.nav);
    const entry = crackerRunEntryGuidance(state, command.waypoint);
    const shown = flightDestinationSurface(state, command);
    const entryRead = objectiveTravelReadout(state, command.waypoint).distanceText;
    const mouthRead = objectiveTravelReadout(state, entry.mouth).distanceText;
    assert.notEqual(entryRead, mouthRead);
    assert.ok(shown.line.includes(`Entry buoy ${objectiveBearingGlyph(state, command.waypoint)} ${entryRead}`));
    assert.ok(shown.line.includes(`Mouth ${objectiveBearingGlyph(state, entry.mouth)} ${mouthRead}`));
    assert.ok(shown.line.includes(VX_FREE_DRIVE_ENTRY_GUIDANCE.instruction));
    assert.deepEqual(state.nav, beforeNav, 'the landmark readout never replaces the entry course');
    const ordinary = { ...command.waypoint, pos: { x: command.waypoint.pos.x + 1, z: command.waypoint.pos.z } };
    state.nav.waypoint = ordinary;
    assert.equal(crackerRunEntryGuidance(state, ordinary), null);
    assert.doesNotMatch(flightDestinationSurface(state, { owner: 'navigation', waypoint: ordinary }).line, /Entry buoy.*Mouth/);

    // Only exact original identity qualifies, never a public-looking name/asset.
    const impostor = { ...load, id: 'same-name-other-wreck', data: {
      name: load.data.name, placeId: load.data.placeId, worldRecordId: 'another-record',
    } };
    state.entities.set(impostor.id, impostor);
    assert.equal(targetDisplayName(impostor, { state }), 'Derelict');
    assert.equal(isCrackerRunWorkLoad(state, impostor), false);
    state.entityIndex = null;
    assert.equal(buildLocalModel(state).contacts.some(c => c.entityId === impostor.id), false);
    const oldData = load.data;
    for (const wrong of [
      { ...oldData, worldRecordId: 'wrong-record' },
      { ...oldData, identityKey: 'worldOneOff:other' },
      { ...oldData, oneOffId: 'other' },
    ]) {
      load.data = wrong;
      assert.equal(isCrackerRunWorkLoad(state, load), false);
      assert.equal(targetDisplayName(load, { state }), 'Derelict');
    }
    load.data = oldData;
    state.world.records ||= { byId: {} };
    const recordId = load.data.worldRecordId;
    state.world.records.byId[recordId] = { recordId, identityKey: 'a different original', kind: 'wreck', alive: true };
    assert.equal(isCrackerRunWorkLoad(state, load), false, 'a conflicting captured identity never grants the exception');
    state.world.records.byId[recordId] = { recordId, identityKey: oldData.identityKey,
      kind: 'wreck', alive: false, outcome: 'destroyed' };
    assert.equal(isCrackerRunWorkLoad(state, load), false);
    assert.doesNotMatch(inspect(state, contact), /Aim at the tub|Movable yard load/);
    delete state.world.records.byId[recordId];
    const replacement = { ...impostor, id: load.id, occupantGeneration: load.occupantGeneration + 1 };
    state.entities.set(load.id, replacement);
    assert.equal(isCrackerRunWorkLoad(state, load), false, 'a stale original facade is not the current occupant');
    assert.equal(targetDisplayName(replacement, { state }), 'Derelict');
    assert.doesNotMatch(inspect(state, contact), /Aim at the tub|Movable yard load/);
    state.entities.set(load.id, load);
    load.alive = false;
    assert.equal(isCrackerRunWorkLoad(state, load), false);
    load.alive = true;
    state.world.currentSectorId = 'sector_ceres_belt';
    assert.equal(isCrackerRunWorkLoad(state, load), false);
    assert.equal(targetDisplayName(load, { state }), 'Derelict');
  } finally { lane?.close(); await exited; }
});
