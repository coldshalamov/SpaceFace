// Seed 4242. The flight WANTED alert reports live decay outside the search zone, names the
// hold inside it, and never lets a later cooling transition masquerade as HUNTERS INBOUND.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { heat, heatLevelFor } from '../src/systems/heat.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { spawnJettisonedCargoPod } from '../src/systems/lootShards.js';
import { wantedAlertText } from '../src/ui/wantedReason.js';

test('seed 4242 wanted alert follows real level drops and evidence expiry without sticky hunter copy', () => {
  const bus = createBus();
  const sim = createSimulation({ seed: 4242, bus, systems: [lawSecurity, heat] });
  const { state } = sim;
  state.mode = 'flight';
  state.simTime = 30;
  state.world.currentSectorId = 'sector_helios_prime';
  state.onboarding = { active: false, finished: true, beatDoneAt: { dock: 20 } };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 12, mass: 39, hull: 140, hullMax: 140, collides: true,
    data: { defId: 'ship_hitch', name: 'Hitch', isPlayer: true },
  });
  state.playerId = player.id;
  sim.spawn({
    type: 'station', team: 2, factionId: 'faction_scn', pos: { x: 200, z: 0 }, radius: 90,
    data: { stationId: 'station_helios', name: 'Helios Station', dockRadius: 220 },
  });
  sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_scn', pos: { x: 80, z: 40 }, radius: 14,
    data: { defId: 'ship_wasp', name: 'Patrol-1', ai: { lawful: true, role: 'patrol' } },
  });
  const owner = sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_scn', pos: { x: 40, z: -20 }, radius: 14,
    data: { defId: 'ship_mule', name: 'Owner', trafficRole: 'shuttle', ai: { civilian: true, passive: true } },
  });
  const pod = spawnJettisonedCargoPod(state, {
    pos: { x: 18, z: 0 }, vel: { x: 0, z: 0 }, commodityId: 'cmdty_provisions', amount: 1,
    ownerId: owner.id, ownerName: 'Owner',
  }, sim.helpers);
  const packets = [];
  bus.on('heat:changed', (p) => packets.push(p));
  try {
    bus.emit('pickup:collected', {
      collectorId: player.id, pickupId: pod.id, acceptedAmount: 1, pos: { ...pod.pos },
    });
    assert.equal(heatLevelFor(state.player.heat), 2);
    assert.equal(
      wantedAlertText(state.player.heat, ' · CARGO THEFT', false, state),
      'WANTED · CARGO THEFT · leave search zone',
    );

    const zone = state.player.heatZone;
    player.pos.x = zone.center.x + zone.radius + 250;
    const beforeDrop = wantedAlertText(state.player.heat, ' · CARGO THEFT', false, state);
    assert.match(beforeDrop, /^WANTED · CARGO THEFT · clears in \d+s$/);

    // Run through the real 6s level-2 drop. The packet is a cooling transition, so the alert
    // remains plain WANTED instead of reviving escalation copy.
    for (let i = 0; i < 7; i += 1) sim.runTicks(60);
    const dropped = packets.find((p) => p.level === 1 && p.value <= 0.2);
    assert.ok(dropped, `expected an emitted level drop in ${JSON.stringify(packets)}`);
    const duringLevelOne = wantedAlertText(state.player.heat, ' · CARGO THEFT', false, state);
    assert.match(duringLevelOne, /^WANTED · CARGO THEFT · clears in \d+s$/);
    assert.doesNotMatch(duringLevelOne, /HUNTERS INBOUND/);

    // Continue through expiry/clear. No emitted packet in the whole sequence may produce hunter copy.
    for (let i = 0; i < 8; i += 1) sim.runTicks(60);
    for (const packet of packets) {
      const line = wantedAlertText(packet.value, ' · CARGO THEFT', false, state);
      assert.doesNotMatch(line, /HUNTERS INBOUND/);
    }
    assert.equal(wantedAlertText(0, '', false, state).includes('clears in'), false);
  } finally {
    sim.dispose();
  }
});
