import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { save } from '../src/save/saveSystem.js';
import {
  AFTERMATH_COLD_CLEANUP_S,
  aftermathForSector,
  aftermathLifecycleForMarker,
  aftermathWrecks,
} from '../src/systems/aftermathWrecks.js';
import { mining } from '../src/systems/mining.js';

const SECTOR_ID = 'sector_helios_prime';

function boot(seed = 26074) {
  const systems = [aftermathWrecks, mining, save];
  const sim = createSimulation({ seed, systems, updateOrder: systems });
  const zone = zonesForSector(SECTOR_ID)[0];
  const origin = sectorLocalToGlobalForSector(zone.center, SECTOR_ID);
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = SECTOR_ID;
  sim.state.player.miningBeam = {
    tierId: 'beam_mk1', range: 220, dps: 18, directToCargo: false,
    heat: 0, heatMax: 10_000, heatRate: 0.1, coolRate: 100,
  };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { ...origin }, vel: { x: 0, z: 0 }, radius: 8,
    hull: 100, hullMax: 100, data: { defId: 'ship_kestrel' },
  });
  sim.state.playerId = player.id;
  return { sim, state: sim.state, player, origin, owner: sim.registry.get('aftermathWrecks') };
}

function killAt(route, suffix, offset) {
  const victim = route.sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_reach',
    pos: { x: route.origin.x + offset, z: route.origin.z }, vel: { x: 0, z: 0 },
    radius: 7, hull: 0, hullMax: 80,
    data: { defId: 'ship_corsair', shipClass: 'corsair_raider', name: `Cleanup ${suffix}` },
  });
  victim.alive = false;
  route.sim.bus.emit('entity:killed', {
    id: victim.id,
    killerId: route.player.id,
    type: 'ship',
    victimClass: 'corsair_raider',
    factionId: victim.factionId,
    pos: { ...victim.pos },
    vel: { ...victim.vel },
    sectorId: SECTOR_ID,
    data: victim.data,
  });
  const marker = aftermathForSector(route.state, SECTOR_ID).find((row) => row.victimId === victim.id);
  const wreck = route.state.entityList.find((entity) => entity && entity.alive !== false
    && entity.type === 'wreck' && entity.data?.markerId === marker.markerId);
  assert.ok(marker && wreck);
  return { marker, wreck };
}

function poolTotal(pool) {
  return Object.values(pool || {}).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
}

test('untouched cold hulks are picked clean at twenty minutes while active owners and authored wrecks survive', () => {
  const route = boot();
  try {
    const abandoned = killAt(route, 'abandoned', 60);
    const engaged = killAt(route, 'engaged', 100);
    const claimed = killAt(route, 'claimed', 140);
    const ancient = route.sim.spawn({
      type: 'wreck', team: 2, pos: { x: route.origin.x + 180, z: route.origin.z },
      radius: 20, hull: 1, hullMax: 1, flags: { persistent: true },
      data: { uniqueWreckId: 'wreck_hms_horizon', salvagePool: { cmdty_exotic_matter: 2 } },
    });
    const removedQty = poolTotal(abandoned.marker.salvagePool);
    const engagedPool = structuredClone(engaged.marker.salvagePool);
    const claimedPool = structuredClone(claimed.marker.salvagePool);
    const scavenged = [];
    route.sim.bus.on('aftermathWreck:scavenged', (payload) => scavenged.push(payload));

    route.state.simTime = engaged.marker.t + 121;
    route.state.tick = 30;
    route.owner.update(0.5, route.state);
    route.state.player.targetId = engaged.wreck.id;
    route.state.player.tether = {
      active: true, targetId: engaged.wreck.id, attachmentId: 'massline:cleanup-engaged',
    };
    const partial = route.owner.applyColdDerelictBoardingBeam({
      wreck: engaged.wreck, minerId: route.player.id, dps: 1, dt: 1,
    });
    assert.equal(partial.handled, true);
    assert.ok(engaged.marker.coldDerelictBoarding.cutProgress > 0);
    route.state.player.tether = null;
    claimed.wreck.data.salvorClaimedBy = 'traffic:salvor:cleanup-owner';

    route.state.simTime = abandoned.marker.t + AFTERMATH_COLD_CLEANUP_S - 0.01;
    route.state.tick = 60;
    route.owner.update(0.5, route.state);
    assert.ok(aftermathForSector(route.state, SECTOR_ID).some((row) => row.markerId === abandoned.marker.markerId));

    route.state.simTime = abandoned.marker.t + AFTERMATH_COLD_CLEANUP_S;
    route.state.tick = 90;
    const cleanupContext = {
      lifecycle: aftermathLifecycleForMarker(abandoned.marker, route.state.simTime),
      wreckClass: abandoned.marker.wreckClass,
      uniqueWreckId: abandoned.wreck.data.uniqueWreckId,
      authoredWreckId: abandoned.wreck.data.authoredWreckId,
      playerVisitSalvageOnly: abandoned.wreck.data.playerVisitSalvageOnly,
      salvorClaimedBy: abandoned.wreck.data.salvorClaimedBy,
      boarding: abandoned.marker.coldDerelictBoarding,
    };
    assert.equal(
      route.owner._coldHulkCleanupEligible(
        abandoned.marker,
        abandoned.wreck,
        cleanupContext.lifecycle,
      ),
      true,
      JSON.stringify(cleanupContext),
    );
    route.owner.update(0.5, route.state);
    assert.equal(aftermathForSector(route.state, SECTOR_ID).some((row) => row.markerId === abandoned.marker.markerId), false);
    assert.equal(abandoned.wreck.alive, false);
    assert.deepEqual(abandoned.marker.salvagePool, {}, 'remaining value is deleted at its sole durable source');
    assert.deepEqual(scavenged, [{
      markerId: abandoned.marker.markerId,
      wreckId: abandoned.wreck.id,
      sectorId: SECTOR_ID,
      removedQty,
      reason: 'cold_hulk_scavenged',
    }]);
    assert.deepEqual(engaged.marker.salvagePool, engagedPool);
    assert.deepEqual(claimed.marker.salvagePool, claimedPool);
    assert.ok(aftermathForSector(route.state, SECTOR_ID).some((row) => row.markerId === engaged.marker.markerId));
    assert.ok(aftermathForSector(route.state, SECTOR_ID).some((row) => row.markerId === claimed.marker.markerId));
    assert.equal(ancient.alive, true, 'authored unique wrecks never enter ordinary Aftermath cleanup');
    assert.equal(route.state.entityList.filter((entity) => entity && entity.alive !== false
      && entity.type === 'pickup').length, 0, 'cleanup does not eject or duplicate the deleted pool');

    const envelope = route.sim.registry.get('save').serialize('plan26-cold-cleanup');
    assert.equal(route.sim.registry.get('save').loadEnvelope(structuredClone(envelope), 'plan26-cold-cleanup'), true);
    assert.equal(aftermathForSector(route.state, SECTOR_ID).some((row) => row.markerId === abandoned.marker.markerId), false,
      'Continue cannot rematerialize a cleaned marker');
    const restoredEngaged = aftermathForSector(route.state, SECTOR_ID)
      .find((row) => row.markerId === engaged.marker.markerId);
    assert.ok(restoredEngaged && restoredEngaged.coldDerelictBoarding.cutProgress > 0,
      'partial player boarding remains outside cleanup through Continue');
  } finally {
    route.sim.dispose();
  }
});
