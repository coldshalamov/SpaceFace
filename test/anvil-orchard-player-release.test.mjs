import assert from 'node:assert/strict';
import test from 'node:test';

import { ORCHARD_GEOMETRY as G } from '../src/data/anvilOrchardBody.js';
import { describeEntity, listComponents } from '../src/systems/interactionDescriptors.js';
import { mining as miningDefinition } from '../src/systems/mining.js';
import { ANVIL_ORCHARD } from '../src/data/anvilOrchard.js';
import { setup } from './fixtures/anvil-orchard-custody-source.mjs';

const DT = 1 / 60;
const SOCKET = 1;
const COMPONENT_ID = `orchard_socket_${SOCKET}`;
const tail = (h, tick) => {
  h.sim.state.tick = tick;
  h.owner.step(DT, tick);
  h.owner.publishCompletedOrchardContacts(h.owner.completedOrchardTail(), () => h.owner.drainContactImpacts());
};

function makeFrameTargetable(frame) {
  Object.assign(frame.data, {
    placeId: 'place_anvil_storm_orchard',
    authoredAssetId: G.assetId,
    authoredPayloadAssetId: G.assetId,
    worldSiteTargetable: true,
    isLandmark: true,
    landmarkId: ANVIL_ORCHARD.id,
  });
}

function selectSocket(state, frame, componentId = COMPONENT_ID) {
  state.player.targetId = frame.id;
  delete state.input.worldObjectTargetId;
  state.ui.componentSelection = {
    targetId: frame.id,
    stableKey: describeEntity(state, frame).stableKey,
    componentId,
    kind: 'machine',
    verb: 'mine',
  };
  state.input.actions = { ...(state.input.actions || {}), siteBeam: true };
  state.input.fireGroup = 2;
}

test('the selected Orchard socket releases through the normal beam and resumes safely after save/load', async () => {
  const h = await setup();
  const mining = Object.create(miningDefinition);
  const denials = [];
  try {
    makeFrameTargetable(h.frame);
    assert.equal(h.accept(4, SOCKET), 4);
    h.worker.pos.x = h.frame.pos.x;
    h.worker.pos.z = h.frame.pos.z - 180;
    const state = h.sim.state;
    h.facade._syncSg02DynamicAuthorityEntities(state);
    const componentSnapshot = JSON.stringify(state.sites.anvilOrchard);
    const components = listComponents(state, h.frame);
    assert.deepEqual(components.map(component => component.componentId), [
      'orchard_socket_0', 'orchard_socket_1', 'orchard_socket_2',
    ]);
    assert.equal(components[SOCKET].status, 'stowed');
    assert.equal(JSON.stringify(state.sites.anvilOrchard), componentSnapshot,
      'component enumeration is a read-only view of the finite ledger');

    h.sim.bus.on('beam:denied', payload => denials.push(payload));
    mining.init({ state, bus: h.sim.bus, helpers: h.sim.helpers, registry: h.sim.registry });
    state.tick = 0;
    state.input.fireGroup = 2;
    state.input.actions = { siteBeam: true };
    state.player.targetId = h.frame.id;
    state.ui.componentSelection = null;
    const beforeUnselected = JSON.stringify(state.sites.anvilOrchard);
    mining.update(DT, state);
    assert.equal(JSON.stringify(state.sites.anvilOrchard), beforeUnselected,
      'a selected frame without a selected socket cannot cut, extract, or debit finite custody');
    assert.equal(h.frame.data.cutProgress, undefined, 'the frame never falls through to generic wreck cutting');
    assert.equal(denials.at(-1)?.reason, 'orchard-select-socket');

    selectSocket(state, h.frame);
    const startingCredits = state.player.credits;
    const started = JSON.stringify(state.sites.anvilOrchard);
    mining.update(DT, state);
    const accepted = state.sites.anvilOrchard.sockets[SOCKET];
    assert.equal(accepted.status, 'releasing');
    assert.equal(accepted.operation, 'opening');
    assert.equal(accepted.progress, 0);
    assert.equal(accepted.acceptedTick, 0);
    assert.equal(state.player.credits, startingCredits, 'release does not use repair/economy routes');
    assert.equal(state.sites.anvilOrchard.sourceRemaining, 44, 'release does not debit or duplicate the harvested lot');
    assert.notEqual(JSON.stringify(state.sites.anvilOrchard), started);

    // The sim owner steps before the registered mining slot in the default route. Releasing the
    // beam after a save leaves only finite history; a new explicit beam gesture re-arms its motor.
    for (let tick = 1; tick <= 9; tick++) {
      tail(h, tick);
      mining.update(DT, state);
    }
    assert.equal(state.sites.anvilOrchard.sockets[SOCKET].progress, 9);
    const save = h.sim.registry.get('save');
    const envelope = JSON.parse(JSON.stringify(save.serialize('orchard-player-release-resume')));
    assert.ok(envelope.data.physics, 'save retains native frame and pod custody');
    delete envelope.checksum;
    assert.equal(save.loadEnvelope(envelope), true);
    h.facade._finishNativeRestore();
    assert.equal(await h.facade.prepareBackend(state), true);
    h.facade._syncSg02DynamicAuthorityEntities(state);
    h.owner = h.facade._sg02;
    h.frame = state.entityList.find(entity => entity.data?.orchardKind === 'frame');
    h.pod = state.entityList.find(entity => entity.data?.orchardKind === 'pod');
    h.worker = state.entities.get(state.playerId);
    assert.ok(h.frame && h.pod);
    assert.equal(state.sites.anvilOrchard.sockets[SOCKET].progress, 9);
    assert.equal(h.owner.readOrchardFramePose(h.frame)?.completedNativeTick, null,
      'a cold-restored pose cannot masquerade as new completed-step evidence');

    // The saved row does not recreate its motor intent. With the held input released, one more
    // native tail remains at the saved partial pose and cannot hand the pod off.
    state.input.fireGroup = null;
    state.input.actions = { ...(state.input.actions || {}), siteBeam: false };
    state.ui.componentSelection = null;
    mining.update(DT, state);
    tail(h, 10);
    assert.equal(state.sites.anvilOrchard.sockets[SOCKET].progress, 9);
    assert.equal(state.sites.anvilOrchard.sockets[SOCKET].status, 'releasing');
    assert.equal(h.owner.records.get(h.pod.id).body.isFixed(), true);
    assert.equal(h.facade.readOrchardPodReady(h.pod), null);

    // Continue is a new explicit beam gesture. It safely re-arms the partial native opening.
    selectSocket(state, h.frame);
    const beforeResumeRequest = state.sites.anvilOrchard.sockets[SOCKET].progress;
    mining.update(DT, state);
    assert.equal(state.sites.anvilOrchard.sockets[SOCKET].progress, beforeResumeRequest);
    for (let tick = 11; tick <= 31; tick++) {
      tail(h, tick);
      mining.update(DT, state);
    }

    const released = state.sites.anvilOrchard.sockets[SOCKET];
    assert.equal(released.status, 'drifting');
    assert.equal(released.operation, 'open');
    assert.equal(released.progress, 30);
    assert.equal(released.handoff, 'ready');
    assert.equal(released.openedTick, 31);
    assert.equal(released.readyTick, 31);
    assert.equal(state.sites.anvilOrchard.sourceRemaining, 44);
    assert.equal(state.sites.anvilOrchard.lots.length, 1);
    assert.equal(h.pod.data.masslineTetherable, true);
    assert.equal(h.owner.records.get(h.pod.id).body.isDynamic(), true);
    const ready = h.facade.readOrchardPodReady(h.pod);
    assert.ok(ready);
    assert.equal(ready.provenance, 'live-handoff');
  } finally {
    mining.destroy?.();
    h.close();
  }
});

test('an open fixed pod remains handoff-eligible after the player releases the beam for a native step', async () => {
  const h = await setup();
  const mining = Object.create(miningDefinition);
  try {
    makeFrameTargetable(h.frame);
    assert.equal(h.accept(4, SOCKET), 4);
    assert.equal(h.accept(4, SOCKET + 1), 4);
    h.worker.pos.x = h.frame.pos.x;
    h.worker.pos.z = h.frame.pos.z - 180;
    const state = h.sim.state;
    const podForSocket = socket => {
      const lotId = state.sites.anvilOrchard.sockets[socket].lotId;
      return [...state.entities.values()].find(entity => entity.data?.orchardKind === 'pod'
        && entity.data.worldRecordId === lotId);
    };
    h.pod = podForSocket(SOCKET);
    const secondPod = podForSocket(SOCKET + 1);
    assert.ok(h.pod && secondPod);
    h.facade._syncSg02DynamicAuthorityEntities(state);
    mining.init({ state, bus: h.sim.bus, helpers: h.sim.helpers, registry: h.sim.registry });

    selectSocket(state, h.frame);
    mining.update(DT, state);
    for (let tick = 1; tick < ANVIL_ORCHARD.openingSteps; tick++) {
      tail(h, tick);
      mining.update(DT, state);
    }

    // The native step opens the socket, but the player releases B before the mining system sees
    // that receipt. This leaves a valid fixed pod and a durable open row, with no handoff yet.
    tail(h, ANVIL_ORCHARD.openingSteps);
    state.input.fireGroup = null;
    state.input.actions = { siteBeam: false };
    mining.update(DT, state);
    const slot = state.sites.anvilOrchard.sockets[SOCKET];
    assert.equal(slot.operation, 'open');
    assert.equal(slot.handoff, 'fixed');
    assert.equal(slot.openedTick, ANVIL_ORCHARD.openingSteps);
    assert.equal(h.owner.records.get(h.pod.id).body.isFixed(), true);

    // Another retained socket's actual motor progress yields fresh frame evidence while the first
    // pod remains open and fixed. Continuing socket one must not be rejected just because this
    // canonical tick is newer than its historical openedTick.
    selectSocket(state, h.frame, `orchard_socket_${SOCKET + 1}`);
    mining.update(DT, state);
    for (let tick = ANVIL_ORCHARD.openingSteps + 1; tick < ANVIL_ORCHARD.openingSteps * 2; tick++) {
      tail(h, tick);
      mining.update(DT, state);
    }
    tail(h, ANVIL_ORCHARD.openingSteps * 2);
    state.input.fireGroup = null;
    state.input.actions = { siteBeam: false };
    mining.update(DT, state);
    assert.equal(state.sites.anvilOrchard.sockets[SOCKET + 1].operation, 'open');
    assert.equal(h.owner.records.get(secondPod.id).body.isFixed(), true);

    const pose = h.owner.readOrchardFramePose(h.frame);
    assert.equal(pose?.kind, 'completed-step');
    assert.equal(pose?.canonicalTick, ANVIL_ORCHARD.openingSteps * 2);
    assert.ok(pose.canonicalTick > slot.openedTick);
    assert.equal(pose.progress?.[SOCKET], ANVIL_ORCHARD.openingSteps);

    selectSocket(state, h.frame);
    mining.update(DT, state);
    const resumed = state.sites.anvilOrchard.sockets[SOCKET];
    assert.equal(resumed.status, 'drifting');
    assert.equal(resumed.handoff, 'ready');
    assert.equal(resumed.openedTick, ANVIL_ORCHARD.openingSteps);
    assert.equal(resumed.readyTick, ANVIL_ORCHARD.openingSteps * 2);
    assert.equal(h.owner.records.get(h.pod.id).body.isDynamic(), true);
    assert.ok(h.facade.readOrchardPodReady(h.pod));
  } finally {
    mining.destroy?.();
    h.close();
  }
});
