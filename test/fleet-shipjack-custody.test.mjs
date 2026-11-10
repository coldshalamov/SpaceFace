import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { admitVessel, queryShipjack } from '../src/shipjack/model.js';

test('a working fleet hull cannot be taken into Shipjack custody or retired under the pilot', async () => {
  const host = createSimHost();
  try {
    await host.init({ profile: 'production', seed: 4242, bridgeAll: true,
      scenarioContract: JSON.parse(readFileSync('src/data/scenarios/47a.scenario.json', 'utf8')) });
    const { state, registry, runtime } = host.host;
    state.mode = 'flight'; state.run.kind = 'adventure';
    state.ui.docked = false; state.ui.dockedStationId = null;
    state.world.currentSectorId = 'sector_helios_prime';
    const player = runtime.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, pos: { x: 0, z: 0 }, fittings: [] }));
    state.playerId = player.id;
    state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: [] }, { defId: 'ship_wasp', fittings: [] }];
    state.player.activeShipIndex = 0;
    const automation = registry.get('automation'), wingmen = registry.get('wingmen');
    const ships = registry.get('ships'), shipjack = registry.get('shipjack');
    assert.equal(automation.assignFleet(1), true);
    wingmen._spawnWingmen();
    const row = state.automation.fleet[0], wing = state.entities.get(row._liveId);
    assert.ok(wing?.data?.isWingman);
    const view = queryShipjack(state, wing.id);
    assert.equal(view.eligible, false);
    assert.match(view.reason, /Return it to the hangar/);
    assert.equal(shipjack.command({ action: 'scan', targetId: wing.id }).ok, false);
    assert.equal(wing.data.vesselId, undefined, 'a normal scan does not mint a competing identity');

    // A previously issued/stale Shipjack identity still cannot cross either
    // authoritative custody seam after this hull has joined the fleet.
    const stale = admitVessel(state, wing);
    const request = { targetId: wing.id, targetGeneration: stale.generation,
      vesselId: stale.vesselId, operationId: 'fleet:stale-transfer' };
    assert.equal(ships.admitCapturedVessel(request).reason, 'fleet_assigned');
    assert.equal(ships.captureAndTransfer(request).reason, 'fleet_assigned');
    assert.equal(state.player.ownedShips.length, 2);
    assert.equal(state.player.ownedShips[1].fleetAssignmentId, row.id);

    // Defend an already-corrupt handoff without killing the current player.
    state.playerId = wing.id;
    assert.equal(automation.releaseFleet(row.id), false);
    assert.equal(wing.alive, true);
    assert.equal(state.automation.fleet[0], row);
    state.playerId = player.id;

    const enemy = runtime.spawn(makeShipEntitySpec('ship_wasp', { team: 1, pos: { x: 60, z: 0 }, fittings: [] }));
    // A stale fleet row naming a foreign entity does not claim that entity.
    row._liveId = enemy.id;
    assert.equal(queryShipjack(state, enemy.id).eligible, true);
    row._liveId = wing.id;
    assert.equal(shipjack.command({ action: 'scan', targetId: enemy.id }).ok, true);
    const hostileRequest = { targetId: enemy.id, targetGeneration: enemy.data.shipjackGeneration,
      vesselId: enemy.data.vesselId, operationId: 'fleet:hostile-transfer' };
    assert.equal(ships.admitCapturedVessel(hostileRequest).ok, true);
    assert.equal(ships.captureAndTransfer(hostileRequest).ok, true, 'ordinary unassigned hostile custody remains available');
    assert.equal(state.playerId, enemy.id);
  } finally {
    host.shutdown();
  }
});
