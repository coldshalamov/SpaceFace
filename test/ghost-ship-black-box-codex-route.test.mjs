import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import GHOST_SHIP from '../src/data/encounters/359-rare-ghost-ship.js';
import { ENCOUNTERS } from '../src/data/encounters/index.generated.js';
import {
  GHOST_SHIP_BLACK_BOX,
  GHOST_SHIP_BLACK_BOX_CARGO_PREFIX,
  ghostShipBlackBoxRecords,
} from '../src/data/ghostShipBlackBox.js';
import { save } from '../src/save/saveSystem.js';
import { cargo } from '../src/systems/cargo.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { mining } from '../src/systems/mining.js';
import { scanner } from '../src/systems/scanner.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { world } from '../src/systems/world.js';
import { BINDINGS } from '../src/ui/bindings.js';
import { codexScreen, requestCodexTab } from '../src/ui/screens/codex.js';

const STEP_S = 0.25;

test('the ordinary Ghost Ship yields a scanned physical recorder whose Codex account survives Continue', () => {
  const route = boot();
  try {
    assert.equal(ENCOUNTERS[GHOST_SHIP.id], GHOST_SHIP,
      'the Ghost Ship remains admitted to the browser/Electron encounter catalog');
    assert.ok(GHOST_SHIP.weight > 0 && GHOST_SHIP.rare === true);
    assert.equal(GHOST_SHIP_BLACK_BOX.logs.length, 4);

    const live = requestGhost(route, 'plan53:ghost-recorder');
    route.bus.emit('encounter:choose', { encounterId: live.id, choiceId: 'hail' });
    const wreck = route.state.entities.get(live.data.wreckId);
    assert.ok(wreck && wreck.data.hailResponse === 'static_loopback');
    assert.equal(ghostShipBlackBoxRecords(route.state.story).length, 0,
      'finding and hailing the hull does not unlock its recorder');

    route.state.input.actions.scanPulse = true;
    route.sim.registry.get('scanner').update(0, route.state);
    route.state.input.actions.scanPulse = false;
    assert.equal(wreck.data.scanned, true, 'the ordinary scanner resolves the cold hull first');

    placeForSalvage(route, wreck);
    beamFor(route, 15);
    const recorder = route.state.entityList.find((entity) => entity.alive !== false
      && entity.data?.rareSpawnRole === 'ghost_black_box');
    assert.ok(recorder && recorder.type === 'pickup',
      'the existing salvage completion releases a distinct physical recorder');
    assert.equal(recorder.data.commodityId, 'cmdty_salvage_electronics');
    assert.equal(route.state.player.cargo.items.cmdty_salvage_electronics || 0, 0,
      'extraction alone does not teleport the recorder into Cargo');
    assert.equal(ghostShipBlackBoxRecords(route.state.story).length, 0,
      'Codex remains locked while the recorder is loose in space');

    route.player.pos.copy(recorder.pos);
    route.player.prevPos.copy(route.player.pos);
    route.sim.step(1);
    assert.equal(route.state.player.cargo.items.cmdty_salvage_electronics, 1,
      'physical pickup reaches the existing Cargo writer');
    const [record] = ghostShipBlackBoxRecords(route.state.story);
    assert.equal(record.encounterId, live.id);
    assert.equal(record.logs.length, 4);
    assert.match(record.logs.at(-1).text, /answer came back anyway/i);
    assert.ok(route.state.story.persistentCargo.includes(
      `${GHOST_SHIP_BLACK_BOX_CARGO_PREFIX}${live.id}`,
    ));
    assert.equal(route.resolved.at(-1)?.outcome, 'black_box_recovered');
    assert.equal(route.codexUpdates.length, 1);

    const saveOwner = route.sim.registry.get('save');
    const envelope = saveOwner.serialize('plan53-ghost-recorder');
    assert.equal(saveOwner.loadEnvelope(structuredClone(envelope), 'plan53-ghost-recorder'), true);
    const [continued] = ghostShipBlackBoxRecords(route.state.story);
    assert.deepEqual(continued.logs, record.logs);
    assert.equal(continued.encounterId, record.encounterId);

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
      codexScreen.onShow({ state: route.state });
      assert.equal(codexScreen._activeTab, 'Black Boxes');
      assert.equal(BINDINGS.codex.code, 'KeyK');
    } finally {
      Object.assign(codexScreen, previous);
    }
  } finally {
    route.sim.dispose();
  }
});

test('stripping the Ghost Ship before scanning cannot manufacture a Codex account', () => {
  const route = boot(53_100_002);
  try {
    const live = requestGhost(route, 'plan53:ghost-unscanned');
    route.bus.emit('encounter:choose', { encounterId: live.id, choiceId: 'hail' });
    const wreck = route.state.entities.get(live.data.wreckId);
    placeForSalvage(route, wreck);
    beamFor(route, 15);
    assert.equal(route.resolved.at(-1)?.outcome, 'black_box_unreadable');
    assert.equal(ghostShipBlackBoxRecords(route.state.story).length, 0);
    assert.equal(route.state.entityList.some((entity) => entity.alive !== false
      && entity.data?.rareSpawnRole === 'ghost_black_box'), false);
  } finally {
    route.sim.dispose();
  }
});

function boot(seed = 53_100_001) {
  const systems = [world, scanner, encounterDirector, mining, cargo, save];
  const sim = createSimulation({ seed, systems, updateOrder: systems });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_ceres_belt';
  state.input = { actions: { scanPulse: false }, fireGroup: 0 };
  state.player.cargo.capVolume = 100;
  state.player.cargo.capMass = 1e9;
  state.player.beamMode = 'extract';
  state.ui.beamMode = 'extract';
  state.player.miningBeam = {
    tierId: 'beam_mk1', range: 220, dps: 90, directToCargo: false,
    heat: 0, heatMax: 10_000, heatRate: 0.1, coolRate: 100,
  };
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

function requestGhost(route, encounterId) {
  const result = route.sim.registry.get('encounterDirector').requestAuthoredEncounter({
    shapeId: GHOST_SHIP.id,
    encounterId,
    sectorId: route.state.world.currentSectorId,
    anchor: { x: 140, z: 0 },
    zoneType: GHOST_SHIP.zoneTypes[0],
    zoneRadius: 520,
    force: true,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  const live = route.state.encounterDirector.live[encounterId];
  assert.ok(live);
  return live;
}

function placeForSalvage(route, wreck) {
  route.player.pos.set(wreck.pos.x - 80, 0, wreck.pos.z);
  route.player.prevPos.copy(route.player.pos);
  route.player.vel.set(0, 0, 0);
  route.state.player.targetId = wreck.id;
  route.state.player.tether = {
    active: true,
    targetId: wreck.id,
    attachmentId: 'massline:ghost-recorder',
  };
}

function beamFor(route, seconds) {
  route.state.input.fireGroup = 2;
  for (let elapsed = 0; elapsed < seconds; elapsed += STEP_S) route.sim.step(STEP_S);
  route.state.input.fireGroup = 0;
  route.sim.step(1 / 60);
}
