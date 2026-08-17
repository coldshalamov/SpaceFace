import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import H1_DISTRESS from '../src/data/encounters/220-depth-h1-distress-from-inside.js';
import { ENCOUNTERS } from '../src/data/encounters/index.generated.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import {
  VOLS_BLACK_BOX,
  VOLS_BLACK_BOX_CARGO_ID,
  VOLS_BLACK_BOX_SHAPE_ID,
  volsBlackBoxRecord,
} from '../src/data/volsBlackBox.js';
import { save } from '../src/save/saveSystem.js';
import { encounterDirector, planEncounters } from '../src/systems/encounterDirector.js';
import { BINDINGS } from '../src/ui/bindings.js';
import { codexScreen, requestCodexTab } from '../src/ui/screens/codex.js';

const SECTOR_ID = 'sector_helios_prime';

test('boarding the ordinary Tessera distress wreck projects one Vols account that survives Continue', () => {
  const route = boot(53_300_001);
  try {
    assert.equal(ENCOUNTERS[VOLS_BLACK_BOX_SHAPE_ID], H1_DISTRESS);
    assert.ok(H1_DISTRESS.weight > 0 && H1_DISTRESS.gates?.uniqueOnce === true);
    assert.equal(VOLS_BLACK_BOX.logs.length, 4);
    const planned = plannedH1(route.state.meta.seed);
    assert.ok(planned, 'the ordinary encounter planner admits the Tessera distress at Helios yard');

    preparePriorYardVisit(route);
    const encounterId = 'plan53:vols-recorder';
    const result = route.director.requestAuthoredEncounter({
      shapeId: VOLS_BLACK_BOX_SHAPE_ID,
      encounterId,
      sectorId: SECTOR_ID,
      anchor: planned.zoneCenter,
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    const wreck = [...route.state.entities.values()].find((entity) => entity?.type === 'wreck'
      && entity.data?.encounterId === encounterId);
    assert.equal(wreck?.data?.storyPropKind, 'vols_mayday_wreck');
    assert.equal(volsBlackBoxRecord(route.state.story), null,
      'hearing the physical mayday before boarding is not a recovery receipt');

    route.bus.emit('encounter:choose', { encounterId, choiceId: 'board' });
    assert.deepEqual(route.cargoReceipts, [{
      id: VOLS_BLACK_BOX_CARGO_ID,
      label: 'Captain Vols black box',
      source: 'depth_program_e1',
    }]);
    assert.deepEqual(route.state.story.persistentCargo, [VOLS_BLACK_BOX_CARGO_ID]);
    assert.equal(route.state.story.depthProgramEncounters.completed[VOLS_BLACK_BOX_SHAPE_ID].outcome,
      'boarded');

    const record = volsBlackBoxRecord(route.state.story);
    assert.equal(record.encounterId, encounterId);
    assert.equal(record.sectorId, SECTOR_ID);
    assert.equal(record.logs.length, 4);
    assert.match(record.note, /five on the manifest, four on the mayday/i);
    assert.deepEqual(volsBlackBoxRecord(route.state.story), record);
    assert.deepEqual(route.state.story.persistentCargo, [VOLS_BLACK_BOX_CARGO_ID],
      're-projecting Codex cannot duplicate the story-cargo receipt');

    const saveOwner = route.sim.registry.get('save');
    const envelope = saveOwner.serialize('plan53-vols-recorder');
    assert.equal(saveOwner.loadEnvelope(structuredClone(envelope), 'plan53-vols-recorder'), true);
    const continued = volsBlackBoxRecord(route.state.story);
    assert.deepEqual(continued.logs, record.logs);
    assert.equal(continued.encounterId, encounterId);
    assert.deepEqual(route.state.story.persistentCargo, [VOLS_BLACK_BOX_CARGO_ID]);

    const cargoOnlyStory = { persistentCargo: [VOLS_BLACK_BOX_CARGO_ID] };
    assert.equal(volsBlackBoxRecord(cargoOnlyStory).sectorId, SECTOR_ID,
      'bounded encounter history is optional once the durable story cargo exists');

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

test('listening or leaving the Tessera mayday cannot manufacture its Codex account', () => {
  for (const choiceId of ['listen', 'leave']) {
    const route = boot(choiceId === 'listen' ? 53_300_002 : 53_300_003);
    try {
      const encounterId = `plan53:vols-${choiceId}`;
      const result = route.director.requestAuthoredEncounter({
        shapeId: VOLS_BLACK_BOX_SHAPE_ID,
        encounterId,
        sectorId: SECTOR_ID,
        anchor: { x: -1760, z: -1260 },
        force: true,
      });
      assert.equal(result.ok, true, JSON.stringify(result));
      route.bus.emit('encounter:choose', { encounterId, choiceId });
      assert.equal(volsBlackBoxRecord(route.state.story), null);
      assert.equal(route.state.story.persistentCargo.includes(VOLS_BLACK_BOX_CARGO_ID), false);
      assert.equal(route.cargoReceipts.length, 0);
    } finally {
      route.sim.dispose();
    }
  }
});

function boot(seed) {
  const systems = [encounterDirector, save];
  const sim = createSimulation({ seed, systems, updateOrder: systems });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR_ID;
  state.story.beatIndex = 3;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 100, hull: 100, hullMax: 100,
    data: { intent: {}, ai: {} },
  });
  state.playerId = player.id;
  const cargoReceipts = [];
  bus.on('cargo:persistentAdded', (payload) => cargoReceipts.push(structuredClone(payload)));
  return {
    sim,
    state,
    bus,
    player,
    cargoReceipts,
    director: sim.registry.get('encounterDirector'),
  };
}

function plannedH1(seed) {
  for (let day = 0; day < 80; day += 1) {
    const planned = planEncounters(
      seed,
      SECTOR_ID,
      day,
      zonesForSector(SECTOR_ID),
      null,
      { [VOLS_BLACK_BOX_SHAPE_ID]: H1_DISTRESS },
    ).find((row) => row.shapeId === VOLS_BLACK_BOX_SHAPE_ID);
    if (planned) return planned;
  }
  return null;
}

function preparePriorYardVisit(route) {
  route.state.world.discovery[SECTOR_ID] = {
    discovered: true,
    pois: { poi_helios_yard: { discovered: true, identified: false } },
  };
  route.bus.emit('poi:discovered', { poiId: 'poi_helios_yard', type: 'derelict' });
  route.sim.step(1);
}
