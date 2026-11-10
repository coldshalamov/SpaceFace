import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { DOMAIN_COLD_TICKS, DOMAIN_ENUM_TICKS } from '../scripts/lib/simReadModel.mjs';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { laneCommandSink, uninstallSimCommandSink, installSimCommandSink } from '../src/core/simLaneCommands.js';
import { createLaneSystemFacade } from '../src/runtime/laneSystemFacades.js';
import { addCargo } from '../src/systems/cargo.js';
import { UNDERSTORY_RECEIVER, receiverApproach } from '../src/data/understoryReceiver.js';
import { createCampaign47aState } from '../src/story/campaign47a/campaignSchema.js';
import { getBeatStepStatus } from '../src/story/campaign47a/index.js';
import { flightDestinationSurface, resolveFlightObjectiveCommand } from '../src/ui/hud.js';

const scenarioContract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8'));
const iron = 'cmdty_ore_iron';

// CPU integration fixture: Cinder clearance, cargo, player pose and final delivery pose
// are staged. The jettison and garden receipt are produced by their real owners; no
// ordinary mining, flight, Line tow, browser, visual or audio acceptance is claimed.
test('Compost cargo action and objective cross the production worker using the same native pod', async () => {
  const host = createSimHost(), main = createGameState(47), bus = createBus();
  let receive, pending = Promise.resolve(), tick = 0, lane;
  const asWorker = async fn => { const sink = laneCommandSink(); uninstallSimCommandSink();
    try { return await fn(); } finally { if (sink) installSimCommandSink(sink); } };
  const drain = async () => { for (;;) { const prior = pending; await prior; if (prior === pending) break; } };
  try {
    lane = createSimLaneRuntime({ state: main, bus, registry: {}, helpers: {},
      flags: { lane: 'worker', sab: false, warnings: [] }, clockMode: 'worker-local',
      channelFactory: () => ({ onMessage(fn) { receive = fn; }, terminate() {}, post(message) {
        if (message.kind === 'init') pending = pending.then(async () => {
          const reply = await asWorker(() => host.init({ ...structuredClone(message), profile: 'production', seed: 47, scenarioContract }));
          receive(structuredClone({ kind: 'ready', seq: message.seq, ...reply }));
        });
        if (message.kind === 'clockCommand') pending = pending.then(async () => {
          const reply = await asWorker(() => host.tick({ ...structuredClone(message), kind: 'tick' }));
          receive(structuredClone({ kind: 'clockTick', ...reply, commandSequence: message.commandSequence }));
        });
      } }) });
    await lane.readyPromise;
    const { state, registry, runtime } = host.host;
    state.mode = 'flight'; state.run = { kind: 'adventure' }; state.ui.docked = false;
    state.world.currentSectorId = UNDERSTORY_RECEIVER.sectorId;
    state.story.beatIndex = 2; state.story.campaign47a = createCampaign47aState();
    state.story.campaign47a.stepProgress['2'] = { completed: ['cinder_board'], updatedAtS: 1 };
    state.onboarding = { active: false, finished: true };
    const player = runtime.spawn({ type: 'ship', team: 1, isPlayer: true, pos: receiverApproach(),
      vel: { x: 0, z: 0 }, radius: 12, mass: 18, hull: 100, hullMax: 100,
      data: { derived: { mass: 18, operationalMass: 18, propulsion: { mainAccel: 100 } } } });
    state.playerId = player.id; state.player.cargo.capVolume = 120; state.player.cargo.capMass = 200;
    assert.equal(addCargo(state, iron, 17), 17);
    const gardenOwner = registry.get('understoryGardens'), missions = registry.get('missions');
    await asWorker(() => gardenOwner.update(0, state));
    const garden = state.entityList.find(e => e.alive && e.data?.gardenId === UNDERSTORY_RECEIVER.gardenId);
    assert.ok(garden); await asWorker(() => missions._ensureStoryWaypoint());
    const sync = async () => { const reply = await asWorker(() => host.tick({ tick: ++tick, steps: 0, commands: [] }));
      receive(structuredClone({ kind: 'clockTick', ...reply })); return reply; };
    await sync();
    assert.match(main.nav.waypoint.reason, /free Iron Ore: jettison 17u/);
    assert.equal(flightDestinationSurface(main, resolveFlightObjectiveCommand(main)).show, true);
    const cargoFacade = createLaneSystemFacade({ state: main, bus })('cargo');
    const request = cargoFacade.jettison(iron, 17);
    lane.runner.prepareWithoutAdvance(); await drain();
    assert.equal(await request, 17);
    const pods = state.entityList.filter(e => e.alive && e.data?.jettisonedCargo);
    assert.equal(pods.length, 1);
    const pod = pods[0], life = pod.occupantGeneration;
    assert.equal(registry.get('lootShards').gardenFeedMass(pod), 13.600000000000001);
    await asWorker(() => missions._ensureStoryWaypoint()); await sync();
    assert.equal(main.nav.waypoint.targetEntityId, pod.id);
    assert.equal(main.entities.get(pod.id).occupantGeneration, life);
    assert.equal(main.nav.waypoint.stable.stamp.occupantGeneration, life);
    assert.match(main.nav.waypoint.reason, /13\.6t usable loose feed/);
    assert.match(flightDestinationSurface(main, resolveFlightObjectiveCommand(main)).line, /13\.6t usable loose feed/);
    assert.equal(state.player.cargo.items[iron] || 0, 0);
    // Explicitly stage the player pressing nearest Line after physics preparation.
    // The native tether owner creates and mirrors the real attachment.
    const physics = registry.get('physics');
    assert.equal(await asWorker(() => physics.prepareBackend(state)), true);
    physics._sg02.syncFromEntities([player, pod]);
    state.input.tetherMode = 'nearest'; state.input.aimWorld = { x: pod.pos.x, z: pod.pos.z };
    let denial; host.host.bus.on('tether:latchDenied', row => { denial = row; });
    state.input.actions ||= {}; state.input.actions.tetherFire = true;
    await asWorker(() => registry.get('tetherGameplay').update(1 / 60, state));
    state.input.actions.tetherFire = false;
    await asWorker(() => registry.get('tetherGameplay').update(1 / 60, state));
    assert.equal(state.player.tether.targetId, pod.id, JSON.stringify(denial));
    assert.equal(state.combat.attachments.byId[state.player.tether.attachmentId].targetGeneration, life);
    await asWorker(() => missions._ensureStoryWaypoint()); await sync();
    assert.match(main.nav.waypoint.reason, /13\.6t valid feed on your Line/);
    assert.match(flightDestinationSurface(main, resolveFlightObjectiveCommand(main)).line, /13\.6t valid feed on your Line/);
    // Staged final pose; no towing journey or success event is fabricated.
    pod.pos.copy(garden.pos); pod.vel.set(0, 0, 0);
    await asWorker(() => gardenOwner.update(0, state));
    assert.equal(pod.alive, false, 'the native pod is retired by intake');
    assert.equal(garden.data.gardenStage, 2);
    assert.equal(garden.data.gardenFirstPlayerGrowth.eatenId, pod.id);
    assert.deepEqual(getBeatStepStatus(state, 2).completed, ['cinder_board', 'compost']);
    await asWorker(() => missions._ensureStoryWaypoint()); await sync();
    // Story is a paced domain, unlike the live nav objective. Allow its documented
    // cold-leaf and enumeration cadence to deliver the same completion.
    for (let n = 0; n < DOMAIN_COLD_TICKS + DOMAIN_ENUM_TICKS
      && !getBeatStepStatus(main, 2).completed.includes('compost'); n++) await sync();
    assert.deepEqual(getBeatStepStatus(main, 2).completed, ['cinder_board', 'compost']);
    assert.match(main.nav.waypoint.label, /Nest/i);
    assert.equal(flightDestinationSurface(main, resolveFlightObjectiveCommand(main)).show, true);
  } finally { lane?.close(); host.shutdown(); }
});
