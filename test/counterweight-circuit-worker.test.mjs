import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimCommandRing, pushLaneCommand } from '../scripts/lib/simCommandChannel.mjs';
import { applyDomainPathUpdate } from '../scripts/lib/simReadModel.mjs';
import { venueAnchorGlobal } from '../src/features/counterweightCircuit/physical.js';
import { partitionUpdateSystems } from '../src/core/catchupPolicy.js';

test('worker-owned registrar actions and admission view reach the main facade', async () => {
  const lane = createSimHost(), domains = new Map(); let tick = 0;
  try {
    const init = await lane.init({ profile: 'production', seed: 4242,
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url))) });
    const { state, registry, runtime } = lane.host;
    state.mode = 'flight'; state.world.currentSectorId = 'sector_pallas_drift';
    const anchor = venueAnchorGlobal();
    const player = runtime.spawn({ type: 'ship', isPlayer: true, team: 0, pos: { x: anchor.x + 20, z: anchor.z },
      vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, collides: false, physicsBody: false,
      data: { defId: 'ship_kestrel', fittings: [], intent: {}, ai: {} } });
    state.playerId = player.id;
    const circuit = registry.get('counterweightCircuit');
    assert.ok(circuit, 'the production worker registry owns the circuit');
    const partitions = partitionUpdateSystems(runtime.manifest.authoritativeUpdateOrder
      .map(definition => runtime.getSystem(definition.name) || definition));
    for (const [label, queue] of [['normal', partitions.all], ['catchup', partitions.table]]) {
      const names = queue.map(system => system.name), at = name => names.indexOf(name);
      assert.ok(at('physics') >= 0 && at('physics') < at('counterweightCircuit'), `${label}: physics settles first`);
      assert.ok(at('tetherGameplay') >= 0 && at('tetherGameplay') < at('counterweightCircuit'), `${label}: line state settles first`);
    }
    circuit.update(1 / 60);
    const send = async (...commands) => {
      const ring = createSimCommandRing();
      for (const cmd of commands) pushLaneCommand(ring, cmd);
      const reply = await lane.tick({ tick: ++tick, steps: 0, ackEnd: init.initRebuild?.end ?? 0,
        commands: structuredClone(ring.drain()) });
      for (const update of reply.domainUpdates) applyDomainPathUpdate(domains, structuredClone(update), new Set());
      return reply;
    };
    const firstReply = await send();
    const discovery = firstReply.domainUpdates.find(u => u.segs.join('.') === 'world.counterweightCircuit.discovered');
    assert.ok(discovery, 'the bounded discovery fact reaches the worker wire');
    assert.equal(discovery.v, true);
    let offer = domains.get('counterweightCircuitOffer');
    assert.equal(offer.id, 'counterweight:registrar');
    await send({ kind: 'busEmit', emit: 'counterweightCircuit:action', payload: {
      action: 'events', offerId: offer.id, generation: offer.generation } });
    offer = domains.get('counterweightCircuitOffer');
    assert.equal(offer.id, 'counterweight:events');
    await send({ kind: 'busEmit', emit: 'counterweightCircuit:action', payload: {
      action: 'preview', eventId: 'soft_berth', offerId: offer.id, generation: offer.generation } });
    offer = domains.get('counterweightCircuitOffer');
    assert.equal(offer.id, 'counterweight:preview:soft_berth');
    await send({ kind: 'busEmit', emit: 'counterweightCircuit:action', payload: {
      action: 'practice', eventId: 'soft_berth', offerId: offer.id, generation: offer.generation } });
    const view = domains.get('counterweightCircuitView');
    assert.equal(view.eventId, 'soft_berth');
    assert.equal(view.admission.bodies.length, 2);
    assert.equal(domains.get('counterweightCircuitOffer').id, 'counterweight:progress');
    assert.equal(view.ghost, undefined, 'the frequently updated view does not contain the tape');
    const ready = { attemptId: view.attemptId, generation: view.admission.generation,
      bodies: view.admission.bodies.map(({ id, generation }) => ({ id, generation })) };
    await send({ kind: 'busEmit', emit: 'counterweightCircuit:presentationReady', payload: { ...ready, bodies: ready.bodies.slice(1) } });
    assert.equal(circuit._attempt().presentationReady, false);
    await send({ kind: 'busEmit', emit: 'counterweightCircuit:presentationReady', payload: ready });
    assert.equal(circuit._attempt().presentationReady, true, 'main admission receipt reaches the live owner');
    assert.equal(circuit._attempt().admissionPending, true, 'presentation alone cannot bypass native admission');
    // Bounded immutable tape: its selection and removal ship immediately, unchanged tape is not
    // re-sent on every progress/view update. The live feature is the sole producer in gameplay.
    state.counterweightCircuitGhost = { eventId: 'soft_berth', attemptId: view.attemptId,
      tape: { samples: Array.from({ length: 5000 }, (_, i) => i) } };
    const selected = await send();
    assert.ok(selected.domainUpdates.some(u => u.segs.join('.') === 'counterweightCircuitGhost'));
    const unchanged = await send();
    assert.equal(unchanged.domainUpdates.some(u => u.segs.join('.') === 'counterweightCircuitGhost'), false);
    state.counterweightCircuitGhost = null;
    const cleared = await send();
    assert.ok(cleared.domainUpdates.some(u => u.segs.join('.') === 'counterweightCircuitGhost'));
  } finally { lane.shutdown(); }
});
