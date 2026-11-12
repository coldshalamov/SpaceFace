import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimCommandRing } from '../scripts/lib/simCommandChannel.mjs';
import { applyDomainPathUpdate } from '../scripts/lib/simReadModel.mjs';

test('paused Fortify purchase publishes the actual run purse with its matching receipt', async () => {
  const lane = createSimHost();
  const domains = new Map();
  let tick = 0;
  const apply = reply => {
    for (const update of reply.domainUpdates || []) applyDomainPathUpdate(domains, update);
  };
  const send = async (type, payload) => {
    const ring = createSimCommandRing();
    if (type) ring.pushBus({ emit: type, payload });
    const reply = structuredClone(await lane.tick({ tick: ++tick, steps: 0, commands: ring.drain() }));
    apply(reply);
    return reply;
  };
  try {
    const init = await lane.init({ profile: 'production', seed: 41, bridgeAll: true,
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8')) });
    apply(structuredClone(init));
    const { state, registry, runtime, bus, domainDiffer } = lane.host;
    state.mode = 'paused';
    registry.get('runSession').begin({ kind: 'survival', ruleset: 'swarm', seed: 41 });
    Object.assign(state.run, { phase: 'draft', wave: 1, credits: 994 });
    const player = runtime.spawn({ type: 'ship', pos: { x: 0, z: 0 }, team: 0, radius: 8 });
    state.playerId = player.id;
    bus.emit('run:started', {});
    domainDiffer.invalidateSubtree('run');
    await send();
    assert.equal(domains.get('run').credits, 994);
    const viewReply = await send('swarm:fortifyStateRequested', { requestId: 1 });
    const view = viewReply.events.find(event => event.t === 'swarm:fortifyState')?.p;
    assert.ok(view);
    const socket = view.sockets.find(row => !row.devices.kinetic_turret.blocked);
    assert.ok(socket, 'a real legal construction position is available');
    const command = { requestId: 2, runToken: view.runToken, deviceId: 'kinetic_turret', socketId: socket.id };
    const reply = await send('swarm:fortifyBuildRequested', command);
    const receipt = reply.events.find(event => event.t === 'swarm:fortifyBuildResolved')?.p;
    assert.equal(receipt?.requestId, 2);
    assert.equal(receipt?.accepted, true);
    assert.equal(receipt?.readModel.credits, 814);
    assert.equal(state.run.credits, 814);
    assert.ok(reply.domainUpdates.some(row => row.segs.join('.') === 'run.credits'), 'wallet accompanies receipt');
    assert.equal(domains.get('run').credits, 814, 'main-facing wallet agrees with the receipt');
    assert.equal([...state.entities.values()].filter(e => e.data?.swarmFortify?.deviceId === 'kinetic_turret').length, 1);
    const duplicate = await send('swarm:fortifyBuildRequested', command);
    assert.equal(duplicate.events.find(event => event.t === 'swarm:fortifyBuildResolved')?.p.accepted, true);
    assert.equal(state.run.credits, 814, 'replayed request cannot charge again');
    assert.equal([...state.entities.values()].filter(e => e.data?.swarmFortify?.deviceId === 'kinetic_turret').length, 1);
    const rejected = await send('swarm:fortifyBuildRequested', { ...command, requestId: 3 });
    assert.equal(rejected.events.find(event => event.t === 'swarm:fortifyBuildResolved')?.p.accepted, false);
    assert.equal(state.run.credits, 814, 'refusal does not charge');
    assert.equal(domains.get('run').credits, 814);
  } finally { lane.shutdown(); }
});
