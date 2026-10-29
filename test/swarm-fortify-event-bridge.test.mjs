import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { runSession } from '../src/systems/runSession.js';
import { swarmFortify } from '../src/systems/swarmFortify.js';
import { projectBridgeEvent } from '../scripts/lib/simEventBridge.mjs';

test('the construction view and purchase verdict cross the real worker event projection', () => {
  const sim = createSimulation({ seed: 41, systems: [runSession, swarmFortify] });
  try {
    sim.registry.get('runSession').begin({ kind: 'survival', ruleset: 'swarm', seed: 41 });
    Object.assign(sim.state.run, { phase: 'draft', wave: 1, credits: 750 });
    const player = sim.spawn({ type: 'ship', pos: { x: 0, z: 0 }, team: 0, radius: 8 });
    sim.state.playerId = player.id;
    sim.bus.emit('run:started', {});
    const owner = sim.registry.get('swarmFortify');
    let view;
    sim.bus.on('swarm:fortifyState', receipt => { view = receipt; });
    sim.bus.emit('swarm:fortifyStateRequested', { requestId: 1 });
    assert.equal(view.sockets.length, 6);
    const projected = projectBridgeEvent('swarm:fortifyState', view);
    assert.equal(projected.dropped, false, JSON.stringify(projected.hits));
    const received = structuredClone(projected.flat);
    assert.equal(received.requestId, 1);
    assert.deepEqual(received.sockets[0].devices.tesla_pair.positions,
      view.sockets[0].devices.tesla_pair.positions);

    const purchase = owner.build({ requestId: 2, runToken: view.runToken,
      deviceId: 'gravity_beacon', socketId: 'front-near' });
    assert.equal(purchase.accepted, true, JSON.stringify(purchase));
    const verdict = projectBridgeEvent('swarm:fortifyBuildResolved', purchase);
    assert.equal(verdict.dropped, false, JSON.stringify(verdict.hits));
    assert.equal(structuredClone(verdict.flat).readModel.structures[0].hull, 140);
    assert.equal(verdict.flat.readModel.credits, 670);
  } finally { sim.registry.get('swarmFortify').destroy(); sim.dispose(); }
});
