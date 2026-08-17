import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { PERSISTENT_CARGO } from '../src/data/narrative.js';
import { actionForWreck } from '../src/data/salvageActions.js';
import {
  WRECK_MISSION_BLACK_BOXES,
  WRECK_MISSION_BLACK_BOX_SOURCE_KIND,
  wreckMissionBlackBoxRecords,
} from '../src/data/wreckMissionBlackBoxes.js';
import { wreckMissionById } from '../src/data/wreckMissions.js';
import { save } from '../src/save/saveSystem.js';
import { cargo } from '../src/systems/cargo.js';
import { mining } from '../src/systems/mining.js';
import { salvageActions } from '../src/systems/salvageActions.js';
import { story } from '../src/systems/story.js';
import { BINDINGS } from '../src/ui/bindings.js';
import { codexScreen, requestCodexTab } from '../src/ui/screens/codex.js';

for (const [index, definition] of WRECK_MISSION_BLACK_BOXES.entries()) {
  test(`${definition.id} reaches Codex only after its physical Cargo pickup and survives Continue`, () => {
    const route = boot(53_400_001 + index);
    try {
      const template = wreckMissionById(definition.id);
      assert.ok(template && template.type === 'salvage_retrieval' && template.tag === 'wreck_salvage');
      assert.ok(PERSISTENT_CARGO.some((entry) => entry.id === definition.cargoId
        && entry.name === definition.cargoName));
      const wreck = spawnCommunicatorWreck(route, definition.id);
      assert.equal(actionForWreck(wreck).id, 'decode_blackbox');
      assert.equal(wreck.data.salvagePool.cmdty_salvage_electronics, 1);
      assert.deepEqual(wreckMissionBlackBoxRecords(route.state.story), []);

      route.state.player.cargo.capVolume = 0;
      stripWreck(route, wreck);
      const loose = recorderPickup(route.state, definition.id);
      assert.ok(loose, 'the communicator electronics remain a distinct physical pickup');
      assert.equal(loose.flags?.persistent, true);
      assert.equal(loose.data.lotSource.sourceKind, WRECK_MISSION_BLACK_BOX_SOURCE_KIND);
      assert.equal(loose.data.lotSource.missionId, definition.id);
      assert.equal(loose.data.lotSource.cargoId, definition.cargoId);
      assert.deepEqual(wreckMissionBlackBoxRecords(route.state.story), [],
        'extraction with no Cargo custody cannot manufacture a Codex account');

      const saveOwner = route.sim.registry.get('save');
      const looseEnvelope = saveOwner.serialize(`plan53-${definition.id}-loose`);
      assert.equal(saveOwner.loadEnvelope(
        structuredClone(looseEnvelope),
        `plan53-${definition.id}-loose`,
      ), true);
      const restored = recorderPickup(route.state, definition.id);
      assert.ok(restored);
      assert.equal(restored.data.lotSource.salvagePointId, `plan53:${definition.id}`);
      assert.deepEqual(wreckMissionBlackBoxRecords(route.state.story), []);

      route.player = route.state.entities.get(route.state.playerId);
      route.state.player.cargo.capVolume = 100;
      route.player.pos.copy(restored.pos);
      route.player.prevPos.copy(restored.pos);
      route.state.input.fireGroup = 0;
      route.sim.step(1);
      assert.equal(route.state.player.cargo.items.cmdty_salvage_electronics, 1,
        'the existing Cargo writer accepts the physical recorder electronics');
      assert.equal(route.state.player.cargo.items[definition.cargoId], 1,
        'Story awards one existing persistent-cargo receipt after Cargo commits collection');
      const [record] = wreckMissionBlackBoxRecords(route.state.story);
      assert.equal(record.missionId, definition.id);
      assert.equal(record.logs.length, 4);
      assert.deepEqual(route.awards, [{
        id: definition.cargoId,
        name: definition.cargoName,
        qty: 1,
        reason: `wreck_mission_recorder:${definition.id}`,
      }]);

      route.sim.step(1);
      assert.equal(route.state.player.cargo.items[definition.cargoId], 1);
      assert.equal(route.awards.length, 1, 'collection and projection stay exactly-once');
      const recoveredEnvelope = saveOwner.serialize(`plan53-${definition.id}-recovered`);
      assert.equal(saveOwner.loadEnvelope(
        structuredClone(recoveredEnvelope),
        `plan53-${definition.id}-recovered`,
      ), true);
      assert.equal(wreckMissionBlackBoxRecords(route.state.story)[0].missionId, definition.id);
      assert.equal(route.state.player.cargo.items[definition.cargoId], 1);

      assertCodexReachable(route.state);
    } finally {
      route.sim.dispose();
    }
  });
}

test('generic communicator electronics cannot unlock one of the three named accounts', () => {
  const route = boot(53_400_010);
  try {
    const wreck = spawnCommunicatorWreck(route, 'wm_quiet_favor');
    route.state.player.cargo.capVolume = 100;
    stripWreck(route, wreck);
    for (let i = 0; i < 20
      && !(route.state.player.cargo.items.cmdty_salvage_electronics > 0); i++) route.sim.step(0.5);
    assert.equal(route.state.player.cargo.items.cmdty_salvage_electronics, 1);
    assert.deepEqual(wreckMissionBlackBoxRecords(route.state.story), []);
    assert.equal(route.awards.length, 0);
  } finally {
    route.sim.dispose();
  }
});

function boot(seed) {
  const systems = [salvageActions, cargo, story, mining, save];
  const sim = createSimulation({ seed, systems, updateOrder: systems });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_ceres_belt';
  state.input = { actions: {}, fireGroup: 0 };
  state.player.beamMode = 'extract';
  state.ui.beamMode = 'extract';
  state.player.miningBeam = {
    tierId: 'beam_mk1', range: 220, dps: 90, directToCargo: false,
    heat: 0, heatMax: 10_000, heatRate: 0.1, coolRate: 100,
  };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 100, hull: 100, hullMax: 100,
    flags: {}, data: { intent: {}, ai: {} },
  });
  state.playerId = player.id;
  state.player.cargo.capVolume = 100;
  state.player.cargo.capMass = 1e9;
  const awards = [];
  bus.on('story:persistentCargoAwarded', (payload) => awards.push(structuredClone(payload)));
  return { sim, state, bus, player, awards };
}

function spawnCommunicatorWreck(route, wreckMissionId) {
  return route.sim.spawn({
    type: 'wreck',
    pos: { x: 80, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 9,
    mass: 1e6,
    hull: 1,
    hullMax: 1,
    data: {
      parentType: 'communicator',
      isCommunicator: true,
      wreckMissionId,
      salvagePointId: `plan53:${wreckMissionId}`,
      scanLabel: 'Distress Communicator',
    },
  });
}

function stripWreck(route, wreck) {
  route.state.player.targetId = wreck.id;
  route.state.input.fireGroup = 2;
  for (let i = 0; i < 20 && wreck.alive !== false; i++) route.sim.step(0.5);
  route.state.input.fireGroup = 0;
  route.sim.step(1 / 60);
  assert.equal(wreck.alive, false, 'the production Mining owner drains the communicator wreck');
}

function recorderPickup(state, missionId) {
  return state.entityList.find((entity) => entity?.alive !== false
    && entity.type === 'pickup'
    && entity.data?.wreckMissionRecorder === true
    && entity.data?.lotSource?.missionId === missionId) || null;
}

function assertCodexReachable(state) {
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
    codexScreen.onShow({ state });
    assert.equal(codexScreen._activeTab, 'Black Boxes');
    assert.equal(BINDINGS.codex.code, 'KeyK');
  } finally {
    Object.assign(codexScreen, previous);
  }
}
