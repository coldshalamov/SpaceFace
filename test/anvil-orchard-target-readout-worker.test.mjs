import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGameState } from '../src/core/gameState.js';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import {
  createReadModel, applySpawnInfos, applyEntityVitals, applyDomainPathUpdate,
} from '../scripts/lib/simReadModel.mjs';
import { ANVIL_ORCHARD, normalizeOrchardRecord } from '../src/data/anvilOrchard.js';
import { isOrchardFrame } from '../src/data/anvilOrchardIdentity.js';
import { stableEntityKey } from '../src/data/interactionDescriptorCatalog.js';
import { listSelectableComponents } from '../src/systems/interactionDescriptors.js';
import { objectInfoLine } from '../src/ui/targetPanel.js';

const DT = 1 / 60;
const SOCKET = 1;

test('real Orchard production reaches the worker target card throughout release and collection', async () => {
  const lane = createSimHost();
  try {
    const init = await lane.init({ profile: 'production', seed: 4242,
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8')) });
    const { state, registry, runtime } = lane.host;
    state.mode = 'flight';
    state.ui.docked = false;
    state.world.currentSectorId = ANVIL_ORCHARD.sectorId;
    const planet = registry.get('planetRuntime');
    planet.update(0, state);
    const frame = state.entities.get(state.planet.orchardFrameId);
    const worker = state.entities.get(state.planet.witnessId);
    assert.ok(isOrchardFrame(frame), 'the ordinary planet owner admits the authored frame');
    assert.ok(worker);
    assert.equal(state.sites.anvilOrchard.sourceRemaining, 48);
    const player = runtime.spawn({ type: 'ship', team: 0, isPlayer: true, radius: 8,
      mass: 100, hull: 100, hullMax: 100,
      pos: { x: frame.pos.x, z: frame.pos.z - 180 }, vel: { x: 0, z: 0 },
      data: { defId: 'ship_kestrel', fittings: [], intent: {}, ai: {} } });
    state.playerId = player.id;
    state.player.targetId = frame.id;
    Object.assign(worker.pos, { x: frame.pos.x + 220, z: frame.pos.z });
    worker.data.itinerary.phase = 'collect';
    state.tick++;
    state.simTime = state.tick * DT;
    const physics = registry.get('physics');
    assert.equal(await physics.prepareBackend(state), true);
    physics._syncSg02DynamicAuthorityEntities(state);
    const owner = physics._sg02;
    const machine = registry.get('environmentalMachinery');
    const mining = registry.get('mining');
    assert.ok(owner.records.has(worker.id), 'the real collector is a native resident');

    const readModel = createReadModel();
    const main = createGameState(4242);
    main.entities = readModel.entities;
    main.settings.controls.bindings = { siteBeam: ['KeyH'] };
    let sequence = 0;
    let ackEnd = init.initRebuild?.end ?? 0;
    applySpawnInfos(readModel, structuredClone(init.initRebuild?.spawnInfos || []));
    async function transport() {
      const reply = structuredClone(await lane.tick({ tick: ++sequence, steps: 0, commands: [], ackEnd }));
      ackEnd = reply.journalEnd;
      applySpawnInfos(readModel, reply.spawnInfos);
      applyEntityVitals(readModel, reply.entityVitals);
      for (const update of reply.domainUpdates) {
        const segs = update.segs.length === 1 ? update.segs[0].split('.') : update.segs;
        const holder = new Map([[segs[0], main[segs[0]]]]);
        applyDomainPathUpdate(holder, { ...update, segs }, new Set());
        main[segs[0]] = holder.get(segs[0]);
      }
      return reply;
    }
    const line = () => objectInfoLine(main.entities.get(frame.id), main, main.entities.get(main.playerId), 180);
    const sentence = (expected) => {
      const text = line();
      assert.match(text, expected);
      assert.doesNotMatch(text, /anvil_|orchard_socket_|cmdty_|sector_|KeyH/);
      console.log(`tick ${main.tick}: ${text}`);
      return text;
    };
    await transport();
    console.log(`Orchard row transported: ${!!main.sites?.anvilOrchard}; frame identity: ${isOrchardFrame(main.entities.get(frame.id))}`);
    sentence(/48 units in reserve.*select a pod socket/i);
    assert.ok(normalizeOrchardRecord(main.sites.anvilOrchard));
    assert.notEqual(main.sites.anvilOrchard, state.sites.anvilOrchard);
    assert.ok(isOrchardFrame(main.entities.get(frame.id)), 'spawn transport retains authored frame identity');

    assert.equal(machine.acceptOrchardNewPod(worker, { frame, socket: SOCKET, qty: 4,
      commodityId: ANVIL_ORCHARD.commodityId }), 4);
    await transport();
    sentence(/44 units in reserve.*select a pod socket/i);
    const frontendFrame = main.entities.get(frame.id);
    const selection = { targetId: frame.id, stableKey: stableEntityKey(frontendFrame),
      componentId: `orchard_socket_${SOCKET}`, kind: 'machine', verb: 'mine' };
    main.ui.componentSelection = selection;
    assert.equal(listSelectableComponents(main, frontendFrame).length, 3);
    sentence(/Hydrogen.*4 units.*hold H to release/i);
    state.ui.componentSelection = { ...selection };
    state.input.fireGroup = 2;
    state.input.actions = { ...(state.input.actions || {}), siteBeam: true };
    mining.update(DT, state);
    assert.equal(state.sites.anvilOrchard.sockets[SOCKET].operation, 'opening');

    async function stepTo(tick, hold = true) {
      for (let next = state.tick + 1; next <= tick; next++) {
        state.tick = next;
        state.simTime = next * DT;
        owner.step(DT, next);
        owner.publishCompletedOrchardContacts(owner.completedOrchardTail(), () => owner.drainContactImpacts());
        if (hold) mining.update(DT, state);
      }
      await transport();
      assert.strictEqual(main.ui.componentSelection, selection, 'worker replies preserve main-owned selection');
    }
    const start = state.tick;
    await stepTo(start + 9);
    sentence(/4 units.*opening 30%.*hold H/i);
    await stepTo(start + 10);
    sentence(/4 units.*opening 33%.*hold H/i);
    await stepTo(start + 30);
    sentence(/4 units.*released/i);
    const pod = state.entityList.find(entity => entity.data?.orchardKind === 'pod');
    assert.ok(physics.readOrchardPodReady(pod));
    assert.equal(mining._collectPickupViaEvent(pod, player).accepted, 4);
    await transport();
    sentence(/Collected.*socket open/i);
    physics._syncSg02DynamicAuthorityEntities(state);
    assert.equal(owner.requestOrchardFiniteClose(frame, SOCKET, state), true);
    await stepTo(start + 45, false);
    sentence(/Collected.*closing 50%/i);
    await stepTo(start + 46, false);
    sentence(/Collected.*closing 53%/i);
    await stepTo(start + 60, false);
    sentence(/Collected.*socket closed/i);
    assert.equal(state.sites.anvilOrchard.sourceRemaining, 44);
    assert.equal(main.sites.anvilOrchard.sourceRemaining, 44);

    delete main.sites.anvilOrchard;
    assert.equal(line(), 'Orchard status unavailable', 'a missing custody row is safe');
    delete main.sites;
    assert.equal(line(), 'Orchard status unavailable', 'a missing sites container is safe');
  } finally { lane.shutdown(); }
});
