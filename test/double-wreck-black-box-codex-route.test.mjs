import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createGameState } from '../src/core/gameState.js';
import DOUBLE_WRECK from '../src/data/encounters/361-rare-double-wreck.js';
import { DOUBLE_WRECK_BLACK_BOXES } from '../src/data/doubleWreckBlackBoxes.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { scanner } from '../src/systems/scanner.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { world } from '../src/systems/world.js';
import { BINDINGS } from '../src/ui/bindings.js';
import {
  codexScreen,
  doubleWreckBlackBoxRecords,
  requestCodexTab,
} from '../src/ui/screens/codex.js';

test('the paired recorder catalog is two authored accounts interleaved into one collision chronology', () => {
  assert.equal(DOUBLE_WRECK_BLACK_BOXES.length, 2);
  assert.deepEqual(DOUBLE_WRECK_BLACK_BOXES.map((box) => box.logs.length), [4, 4]);
  const chronology = DOUBLE_WRECK_BLACK_BOXES
    .flatMap((box) => box.logs.map((log) => ({ sequence: log.sequence, side: box.side })))
    .sort((a, b) => a.sequence - b.sequence);
  assert.deepEqual(chronology.map((entry) => entry.sequence), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(chronology.map((entry) => entry.side), ['a', 'b', 'a', 'b', 'a', 'b', 'a', 'b']);
});

test('the production Double Wreck requires scanning, preserves collection order, and survives Continue in Codex', () => {
  const route = boot();
  try {
    const live = requestDoubleWreck(route, 'plan53:double-wreck');
    route.bus.emit('encounter:choose', { encounterId: live.id, choiceId: 'read' });
    const a = wreckForSide(route, live, 'a');
    const b = wreckForSide(route, live, 'b');
    assert.equal(a.data.storyPropKind, 'rare_double_wreck_a');
    assert.equal(b.data.storyPropKind, 'rare_double_wreck_b');
    assert.equal(doubleWreckBlackBoxRecords(route.state.story).length, 0,
      'finding the bodies does not unlock lore before a recorder is scanned and collected');

    route.state.input.actions.scanPulse = true;
    route.sim.registry.get('scanner').update(0, route.state);
    assert.equal(a.data.scanned, true);
    assert.equal(b.data.scanned, true);

    collect(route, b);
    let [record] = doubleWreckBlackBoxRecords(route.state.story);
    assert.equal(record.recoveredCount, 1);
    assert.deepEqual(record.recoveryOrder, ['b']);
    assert.deepEqual(record.logs.map((log) => log.sequence), [2, 4, 6, 8]);
    assert.ok(route.state.story.persistentCargo.includes(`rare_black_box:double-b:${live.id}`));
    assert.equal(route.state.story.persistentCargo.includes(`rare_black_box:double-a:${live.id}`), false);

    collect(route, a);
    [record] = doubleWreckBlackBoxRecords(route.state.story);
    assert.equal(record.complete, true);
    assert.deepEqual(record.recoveryOrder, ['b', 'a'],
      'Codex retains physical collection order even though it interleaves the log chronology');
    assert.deepEqual(record.logs.map((log) => log.sequence), [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual(record.logs.map((log) => log.side), ['a', 'b', 'a', 'b', 'a', 'b', 'a', 'b']);
    assert.match(record.logs[6].text, /I held course/);
    assert.match(record.logs[7].text, /So did I/);
    assert.equal(route.resolved.at(-1)?.outcome, 'both_manifests_recovered');
    assert.equal(route.codexUpdates.length, 2);

    const historyBeforeDuplicate = JSON.stringify(route.state.story.flags.rareSpawns.history);
    route.bus.emit('entity:destroyed', { id: b.id, type: 'wreck' });
    assert.equal(JSON.stringify(route.state.story.flags.rareSpawns.history), historyBeforeDuplicate,
      'a duplicate physical event cannot collect or unlock either recorder twice');

    const savedStoryBytes = JSON.stringify(route.state.story);
    const continued = createGameState(route.state.meta.seed);
    continued.story = JSON.parse(savedStoryBytes);
    assert.equal(JSON.stringify(continued.story), savedStoryBytes,
      'the existing story save owner carries both recorder receipts byte-for-byte');
    assert.deepEqual(doubleWreckBlackBoxRecords(continued.story), [record]);
    continued.story.flags.rareSpawns.history = [];
    assert.deepEqual(doubleWreckBlackBoxRecords(continued.story)[0].recoveryOrder, ['b', 'a'],
      'the permanent story cargo reconstructs both accounts after bounded rare history rolls over');

    const previous = {
      activeTab: codexScreen._activeTab,
      body: codexScreen._body,
      query: codexScreen._query,
    };
    try {
      codexScreen._body = null;
      codexScreen._activeTab = 'Story';
      codexScreen._query = '';
      requestCodexTab('Black Boxes');
      codexScreen.onShow({ state: continued });
      assert.equal(codexScreen._activeTab, 'Black Boxes',
        'the normal Codex accepts a direct request for the player-visible Black Boxes tab');
      assert.equal(BINDINGS.codex.code, 'KeyK', 'the existing default-route Codex key remains the access path');
    } finally {
      Object.assign(codexScreen, previous);
    }
  } finally {
    route.sim.dispose();
  }
});

test('cutting an unscanned recorder free loses that side instead of manufacturing a log', () => {
  const route = boot(53_000_002);
  try {
    const live = requestDoubleWreck(route, 'plan53:unscanned');
    route.bus.emit('encounter:choose', { encounterId: live.id, choiceId: 'read' });
    const a = wreckForSide(route, live, 'a');
    const b = wreckForSide(route, live, 'b');
    collect(route, a);
    assert.equal(doubleWreckBlackBoxRecords(route.state.story).length, 0);
    assert.equal(route.state.story.persistentCargo.includes(`rare_black_box:double-a:${live.id}`), false);

    route.state.input.actions.scanPulse = true;
    route.sim.registry.get('scanner').update(0, route.state);
    assert.equal(b.data.scanned, true);
    collect(route, b);
    const [partial] = doubleWreckBlackBoxRecords(route.state.story);
    assert.equal(partial.complete, false);
    assert.deepEqual(partial.recoveryOrder, ['b']);
    assert.equal(route.resolved.at(-1)?.outcome, 'manifests_incomplete');
  } finally {
    route.sim.dispose();
  }
});

function boot(seed = 53_000_001) {
  const sim = createSimulation({
    seed,
    systems: [world, scanner, encounterDirector],
    updateOrder: [world, scanner, encounterDirector],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.input = { actions: { scanPulse: false } };
  state.world.currentSectorId = 'sector_ceres_belt';
  const player = sim.spawn(makeShipEntitySpec('ship_kestrel', {
    team: 0,
    factionId: 'faction_free',
    isPlayer: true,
    player: state.player,
    pos: { x: 0, z: 0 },
  }));
  state.playerId = player.id;
  const resolved = [];
  const codexUpdates = [];
  bus.on('encounter:resolved', (payload) => resolved.push(structuredClone(payload)));
  bus.on('codex:blackBoxRecovered', (payload) => codexUpdates.push(structuredClone(payload)));
  return { sim, state, bus, player, resolved, codexUpdates };
}

function requestDoubleWreck(route, encounterId) {
  const result = route.sim.registry.get('encounterDirector').requestAuthoredEncounter({
    shapeId: DOUBLE_WRECK.id,
    encounterId,
    sectorId: route.state.world.currentSectorId,
    anchor: { x: 320, z: -180 },
    zoneType: DOUBLE_WRECK.zoneTypes[0],
    zoneRadius: 520,
    force: true,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  const live = route.state.encounterDirector.live[encounterId];
  assert.ok(live);
  return live;
}

function wreckForSide(route, live, side) {
  const id = live.data.wreckIds.find((wreckId) => live.data.wreckSideById[wreckId] === side);
  const wreck = route.state.entities.get(id);
  assert.ok(wreck && wreck.alive !== false, `missing live box ${side}`);
  return wreck;
}

function collect(route, wreck) {
  route.bus.emit('salvage:completed', { wreckId: wreck.id, loot: {} });
  wreck.alive = false;
  route.bus.emit('entity:destroyed', { id: wreck.id, type: 'wreck' });
}
