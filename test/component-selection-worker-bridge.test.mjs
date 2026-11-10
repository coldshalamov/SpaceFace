import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimCommandRing, pushLaneCommand } from '../scripts/lib/simCommandChannel.mjs';
import { applySpawnInfos } from '../scripts/lib/simReadModel.mjs';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { installSimCommandSink, uninstallSimCommandSink, laneInputWrite } from '../src/core/simLaneCommands.js';
import { applyWorldObjectSelection, clearWorldObjectSelection, createWorldObjectInteraction } from '../src/ui/worldObjectInteraction.js';
import { cycleTargetComponent } from '../src/ui/uiRoot.js';
import { PLANET_SITE } from '../src/data/planets.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';

const contract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8'));

test('real UI socket choice crosses ordered input folds into the production release consumer', async () => {
  const host = createSimHost(), ring = createSimCommandRing();
  let seq = 0;
  const sink = descriptor => pushLaneCommand(ring, descriptor);
  const tick = async () => {
    const commands = structuredClone(ring.drain());
    uninstallSimCommandSink();
    try { return await host.tick({ tick: ++seq, steps: 0, commands }); }
    finally { installSimCommandSink(sink); }
  };
  try {
    await host.init({ profile: 'production', seed: 424213, scenarioContract: contract });
    const { state, registry, runtime } = host.host;
    state.mode = 'flight'; registry.get('world').enterSector(PLANET_SITE.sectorId);
    registry.get('planetRuntime').update(0, state);
    const frame = state.entities.get(state.planet.orchardFrameId), worker = state.entities.get(state.planet.witnessId);
    const player = runtime.spawn({ ...makeShipEntitySpec('ship_kestrel', { pos: { x: frame.pos.x + 100, z: frame.pos.z } }), isPlayer: true });
    state.playerId = player.id;
    const physics = registry.get('physics'); assert.equal(await physics.prepareBackend(state), true);
    physics._sg02.syncFromEntities(state.entityList);
    worker.data.itinerary.phase = 'collect';
    assert.equal(registry.get('environmentalMachinery').acceptOrchardHarvest(worker,
      { frame, commodityId: 'cmdty_gas_hydrogen', qty: 1 }), 1);
    const spawn = await host.tick({ tick: ++seq, steps: 0, commands: [] });
    const main = createGameState(424213); main.mode = 'flight'; main.world.currentSectorId = PLANET_SITE.sectorId;
    main.sites = { anvilOrchard: structuredClone(state.sites.anvilOrchard) };
    main.planet = structuredClone(state.planet); main.playerId = player.id;
    applySpawnInfos({ entities: main.entities }, structuredClone(spawn.spawnInfos));
    const mirrorFrame = main.entities.get(frame.id); assert.ok(mirrorFrame);
    installSimCommandSink(sink);
    assert.equal(applyWorldObjectSelection(main, mirrorFrame, 'test-player-pick'), true);
    await tick();
    assert.equal(state.player.targetId, frame.id, 'the target fold arrives first');
    main.player.targetId = state.player.targetId;
    cycleTargetComponent(main, 1, createBus());
    const selected = main.ui.componentSelection;
    assert.equal(selected?.componentId, 'orchard_socket_0', 'real UI handler selects immediately');
    assert.equal(state.ui.componentSelection, null, 'the authoritative lane has not yet drained');
    await tick();
    assert.equal(state.ui.componentSelection?.componentId, 'orchard_socket_0');
    assert.equal(state.ui.componentSelection?.occupantGeneration, frame.occupantGeneration);
    state.input.actions = { ...state.input.actions, siteBeam: true };
    const outcome = registry.get('mining')._runOrchardBeam(player, frame, {}, 1 / 60, state);
    assert.equal(outcome?.ok, true, 'the actual mining owner accepts the selected physical socket');
    assert.equal(state.sites.anvilOrchard.sockets[0].status, 'releasing');
    // A malformed or stale choice cannot overwrite the current authoritative choice.
    laneInputWrite(main, 'ui.componentSelection', { ...selected, componentId: 'orchard_socket_99' });
    await tick(); assert.equal(state.ui.componentSelection.componentId, 'orchard_socket_0');
    const generation = frame.occupantGeneration; frame.occupantGeneration = generation + 1;
    await tick(); assert.equal(state.ui.componentSelection, null, 'same numeric id with another life loses selection');
    laneInputWrite(main, 'ui.componentSelection', selected);
    await tick(); assert.equal(state.ui.componentSelection, null, 'a late choice for the old life is rejected');
    frame.occupantGeneration = generation;
    clearWorldObjectSelection(main);
    assert.equal(main.ui.componentSelection, null, 'clear remains immediate on the UI');
    // The clear, new target and new component may ride one input envelope.
    applyWorldObjectSelection(main, mirrorFrame, 'test-player-pick');
    cycleTargetComponent(main, 1, createBus());
    await tick();
    assert.equal(state.player.targetId, frame.id);
    assert.equal(state.ui.componentSelection?.componentId, 'orchard_socket_0', 'ordered target and component bind together');
    const uiBus = createBus();
    const interaction = createWorldObjectInteraction({ state: main, bus: uiBus }, null);
    uiBus.emit('save:loaded', {});
    assert.equal(main.ui.componentSelection, null, 'load clears the local UI immediately');
    await tick(); assert.equal(state.ui.componentSelection, null, 'load clear crosses the same fold');
    cycleTargetComponent(main, 1, createBus()); await tick();
    assert.ok(state.ui.componentSelection);
    laneInputWrite(main, 'player.targetId', player.id);
    assert.equal(main.ui.componentSelection, null, 'changing target clears immediately');
    await tick(); assert.equal(state.ui.componentSelection, null, 'target change clears the worker');
    interaction.destroy(); await tick();
    assert.equal(state.ui.componentSelection, null, 'disposal leaves no worker selection');
  } finally { uninstallSimCommandSink(); host.shutdown(); }
});
