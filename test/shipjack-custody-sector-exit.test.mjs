import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { admitVessel } from '../src/shipjack/model.js';

async function host4242() {
  const host = createSimHost();
  await host.init({ profile: 'production', seed: 4242, bridgeAll: true,
    scenarioContract: JSON.parse(readFileSync('src/data/scenarios/47a.scenario.json', 'utf8')) });
  return host;
}

function flight4242(host) {
  const { state, runtime } = host.host;
  state.mode = 'flight'; state.run.kind = 'adventure';
  state.ui.docked = false; state.ui.dockedStationId = null;
  state.world.currentSectorId = 'sector_helios_prime';
  const player = runtime.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, pos: { x: 0, z: 0 }, fittings: [] }));
  state.playerId = player.id;
  const target = runtime.spawn(makeShipEntitySpec('ship_wasp', { team: 1, pos: { x: 60, z: 0 }, fittings: [] }));
  return { state, runtime, player, target };
}

test('a continuous sector handoff preserves live custody work; a hard exit still aborts it', async () => {
  const host = await host4242();
  try {
    const { state, target } = flight4242(host);
    const sj = host.host.registry.get('shipjack');
    const vessel = admitVessel(state, target);
    const a = sj.attempt(vessel, target);
    a.phase = 'exposed';

    host.host.bus.emit('sector:exit', { sectorId: 'sector_helios_prime', continuous: true });
    assert.equal(a.phase, 'exposed', 'a continuous boundary keeps in-flight custody work');
    assert.equal(target.alive, true, 'the live hull is not parked');

    host.host.bus.emit('sector:exit', { sectorId: 'sector_helios_prime' });
    assert.equal(a.phase, 'aborted', 'a hard boundary still tears down live custody work');
  } finally { host.shutdown(); }
});

test('a secured custody attempt survives its hull being parked remote and still reaches tow', async () => {
  const host = await host4242();
  try {
    const { state, target } = flight4242(host);
    const sj = host.host.registry.get('shipjack');
    const vessel = admitVessel(state, target);
    const a = sj.attempt(vessel, target);
    a.phase = 'secured'; vessel.custodian = 'player';

    host.host.bus.emit('sector:exit', { sectorId: 'sector_helios_prime' });
    assert.equal(vessel.location.entityId, null, 'a hard exit parks the hull record');
    assert.equal(a.phase, 'secured', 'custody survives the park');

    // Sector teardown removes the live body; custody must not read that as an escape.
    state.entities.delete(target.id);
    state.entityList.splice(state.entityList.indexOf(target), 1);
    sj.update(1 / 60, state);
    assert.equal(a.phase, 'secured', 'the next tick keeps a parked hull secured');

    // Returning to the sector re-links the rematerialized body; tow then only lacks the Massline.
    state.entities.set(target.id, target);
    state.entityList.push(target);
    vessel.location.entityId = target.id;
    const denied = sj.command({ action: 'tow', targetId: target.id });
    assert.equal(denied.ok, false);
    assert.match(denied.reason, /Massline/, 'custody is held; refusal is the missing tow line, not lost custody');
  } finally { host.shutdown(); }
});
