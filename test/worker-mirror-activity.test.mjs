import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { getActivityFrame } from '../src/core/worldActivityManager.js';
import { SIM_TIER } from '../src/world/activityClassification.js';
import { glassHalfExtents, TABLE_SIM_ASPECT } from '../src/render/tabletopPolicy.js';

const scenarioContract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8'));

test('presentation classifies mirrored bodies without moving their journal poses or recording world state', async () => {
  const worker = createSimHost();
  const main = createGameState(47);
  let receive;
  let initRequest;
  const lane = createSimLaneRuntime({
    state: main, bus: createBus(), registry: {}, helpers: {},
    flags: { lane: 'worker', sab: false, warnings: [] }, clockMode: 'worker-local',
    channelFactory: () => ({
      onMessage(fn) { receive = fn; },
      post(msg) { if (msg.kind === 'init') initRequest = msg; },
      terminate() {},
    }),
  });
  try {
    const init = await worker.init({ ...initRequest, scenarioContract });
    receive(structuredClone({ kind: 'ready', seq: initRequest.seq, ...init }));
    await lane.readyPromise;
    const { state, runtime, journal } = worker.host;
    state.mode = 'flight';
    state.world.currentSectorId = 'sector_helios_prime';
    state.camera.zoom = 44;
    const player = runtime.spawn({
      type: 'ship', isPlayer: true, pos: { x: 0, z: 0 }, radius: 10, mass: 12,
      data: { defId: 'ship_kestrel' },
    });
    state.playerId = player.id;
    const ship = runtime.spawn({
      type: 'ship', pos: { x: 200, z: 0 }, vel: { x: 90, z: 2 }, radius: 10, mass: 12,
      data: { defId: 'ship_kestrel', durable: true },
    });
    const glassEdge = glassHalfExtents(144, 50, TABLE_SIM_ASPECT, 60).halfX;
    const terminal = (offset) => runtime.spawn({
      type: 'station', pos: { x: glassEdge + offset, z: 0 }, radius: 28, data: { dockRadius: 90 },
    });
    const glassTerminal = terminal(89);
    const runwayTerminal = terminal(91);

    let sequence = 0;
    async function present(tick, x) {
      state.tick = tick;
      state.simTime = tick / 60;
      ship.pos.x = x;
      journal.recordTransform(tick, ship);
      const reply = await worker.tick({ tick: ++sequence, steps: 0, commands: [], generation: 0 });
      receive(structuredClone({ kind: 'clockTick', ...reply }));
      return main.entities.get(ship.id);
    }

    const mirror = await present(60, 200);
    main.camera.zoom = 144;
    main.camera.liveZoom = 24;
    main.camera.fov = 30;
    main.camera.tilt = 60;
    main.settings.video.fov = 50;
    const openingFrame = getActivityFrame(main);
    assert.ok(openingFrame.renderGlassIds.has(ship.id));
    assert.ok(openingFrame.renderGlassIds.has(glassTerminal.id));
    assert.ok(openingFrame.renderRunwayIds.has(runwayTerminal.id));

    await present(120, 8000);
    getActivityFrame(main);
    await present(241, 8000);
    getActivityFrame(main);
    assert.equal(mirror.activity.simTier, SIM_TIER.S4_AGGREGATE);
    const demotion = { recordId: mirror.data.worldRecordId, records: Object.keys(main.world.records.byId) };

    assert.equal(await present(300, 200), mirror);
    const pose = { pos: { ...mirror.pos }, vel: { ...mirror.vel }, rot: mirror.rot };
    const returningFrame = getActivityFrame(main);
    assert.equal(mirror.activity.simTier, SIM_TIER.S0_EXACT);
    assert.ok(returningFrame.renderGlassIds.has(ship.id));
    assert.deepEqual({ pose: { pos: mirror.pos, vel: mirror.vel, rot: mirror.rot }, demotion },
      { pose, demotion: { recordId: undefined, records: [] } });
    assert.equal(mirror.pos.x, 200);

    // A presentation camera change still moves the bands, independent of the worker camera.
    await present(304, 200);
    main.camera.zoom = 44;
    assert.equal(getActivityFrame(main).renderGlassIds.has(glassTerminal.id), false);
  } finally {
    lane.close();
    worker.shutdown();
  }
});
