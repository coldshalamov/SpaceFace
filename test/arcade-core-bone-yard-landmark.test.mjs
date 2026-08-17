import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { SCAVENGER_SWARM } from '../src/data/anomalySites.js';
import {
  BONE_YARD,
  BONE_YARD_SALVAGE_SOURCES,
  BONE_YARD_SEGMENTS,
} from '../src/data/boneYardLandmark.js';
import { frontierRumorOffer } from '../src/data/frontierRumors.js';
import { SECTORS } from '../src/data/sectors.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { save } from '../src/save/saveSystem.js';
import { anomalyRuntime } from '../src/systems/anomalyRuntime.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { mining } from '../src/systems/mining.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { salvage } from '../src/systems/salvage.js';
import { traffic } from '../src/systems/traffic.js';
import { world } from '../src/systems/world.js';
import { buildSystemModel } from '../src/ui/galaxyMap.js';

// Intent: prove the ordinary Charon route yields one charted, moon-scale physical wreck ring whose
// real salvage pools are contested by the shipped wildlife/cutter authorities, and that the exact
// bar rumor resolves on physical arrival without inventing a second reward or claim ledger.

function playerSpec() {
  return {
    type: 'ship', team: 0, factionId: 'player', collides: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 7, mass: 90, hull: 300, hullMax: 300,
    flags: { persistent: true },
    data: { kind: 'player', isPlayer: true },
  };
}

function boot(seed = 0x25b0) {
  const sim = createSimulation({
    seed,
    systems: [cargo, economy, world, salvage, mining, npcJobsRuntime, traffic, anomalyRuntime, save],
    updateOrder: [salvage, mining, npcJobsRuntime, traffic, anomalyRuntime, economy],
  });
  const owner = sim.registry.get('world');
  owner.newGame();
  const player = sim.spawn(playerSpec());
  sim.state.playerId = player.id;
  sim.state.mode = 'flight';
  sim.state.ui.docked = false;
  sim.state.input.actions = {};
  sim.state.player.credits = 4_000;
  sim.state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 100, capMass: 100 };
  return {
    sim,
    state: sim.state,
    bus: sim.bus,
    player,
    world: owner,
    salvage: sim.registry.get('salvage'),
    traffic: sim.registry.get('traffic'),
    save: sim.registry.get('save'),
  };
}

function ringSegments(state) {
  return (state.entityList || []).filter((entity) => entity && entity.alive !== false
    && entity.type === 'wreck' && entity.data?.boneYardSegmentId);
}

function sourceWrecks(state) {
  return ringSegments(state).filter((entity) => entity.data?.salvageSourceKey);
}

function scavengers(state) {
  return (state.entityList || []).filter((entity) => entity && entity.alive !== false
    && entity.type === 'drone' && entity.data?.scavengerSwarmId === SCAVENGER_SWARM.id);
}

function claimJumpers(state) {
  return (state.entityList || []).filter((entity) => entity && entity.alive !== false
    && entity.type === 'ship' && entity.data?.salvageCompetitionRole === 'claim-jumper');
}

test('The Bone Yard charts, resolves its plate rumor, and materializes one moon-scale fused ring', () => {
  const route = boot();
  try {
    const sector = SECTORS.find((entry) => entry.id === BONE_YARD.sectorId);
    const zone = zonesForSector(BONE_YARD.sectorId).find((entry) => entry.id === BONE_YARD.zoneId);
    assert.equal(sector?.charted, true);
    assert.ok(zone && zone.boneYardLandmark === BONE_YARD.id,
      'the landmark occupies the ordinary charted-zone seam');
    assert.equal(buildSystemModel(route.state, BONE_YARD.sectorId).zones
      .some((entry) => entry.id === BONE_YARD.zoneId && entry.name === BONE_YARD.name), true,
    'the ordinary system map exposes the exact named ring');

    const offer = frontierRumorOffer(route.state, BONE_YARD.sourceStationId);
    assert.equal(offer?.id, BONE_YARD.rumorId);
    assert.equal(offer?.targetId, BONE_YARD.mapTargetId);
    assert.match(offer?.text || '', /moon-wide ring|broken bows|jump-claims/i);
    route.bus.emit('ui:purchaseFrontierRumor', {
      rumorId: offer.id,
      stationId: BONE_YARD.sourceStationId,
    });
    assert.equal(route.state.world.frontierRumors.byId[BONE_YARD.rumorId]?.phase, 'rumored');

    route.world.enterSector(BONE_YARD.sectorId, { placePlayer: false });
    assert.equal(ringSegments(route.state).length, BONE_YARD_SEGMENTS.length,
      'ordinary Charon entry materializes all eighteen fused hull masses');
    assert.equal(sourceWrecks(route.state).length, BONE_YARD_SALVAGE_SOURCES.length,
      'three open plates carry distinct conserved source records');
    assert.ok(ringSegments(route.state).every((wreck) => wreck.collides === true
      && wreck.physicsBody && Number(wreck.radius) >= 48),
    'the ring is physical wreck terrain, not a receipt or map-only glyph');
    const radial = ringSegments(route.state).map((wreck) => Math.hypot(
      wreck.pos.x - BONE_YARD.globalCenter.x,
      wreck.pos.z - BONE_YARD.globalCenter.z,
    ));
    assert.ok(Math.min(...radial) > 640 && Math.max(...radial) < 740,
      'the authored hulls describe a moon-scale curved band around an empty centre');

    route.player.pos.x = BONE_YARD.globalCenter.x;
    route.player.pos.z = BONE_YARD.globalCenter.z;
    route.sim.step(1 / 60);
    assert.equal(route.salvage._resolveBoneYardArrival(route.state), false,
      'the normal fixed-tick salvage update owns the first arrival transition');
    assert.equal(route.state.world.frontierRumors.byId[BONE_YARD.rumorId].phase, 'resolved',
      'physical arrival resolves the exact paid bearing');
    assert.equal(scavengers(route.state).length, SCAVENGER_SWARM.count,
      'the existing wildlife owner binds its bounded swarm to the open plate');
  } finally {
    route.sim.dispose();
  }
});

test('existing cutter claims create a real player-intervenable free-for-all and Continue keeps one pool', () => {
  const route = boot(0x25b1);
  try {
    route.world.enterSector(BONE_YARD.sectorId, { placePlayer: false });
    for (const wreck of sourceWrecks(route.state)) wreck.data.salvorNoticeAt = 0;
    route.traffic.update(0.25, route.state);
    const cutters = claimJumpers(route.state);
    assert.equal(cutters.length, 2, 'the shipped two-cutter cap supplies the claim-jumpers');
    assert.ok(cutters.every((cutter) => /CLAIM-JUMPER CUTTER.*BONE YARD/i.test(cutter.data.scanLabel)),
      'the physical competitors identify their role to the player');
    const claimed = sourceWrecks(route.state).find((wreck) => wreck.data.salvorClaimedBy);
    assert.ok(claimed, 'a cutter claims one real source through salvage authority');
    const sourceKey = claimed.data.salvageSourceKey;
    const sourceBefore = route.salvage._sourceSnapshot(sourceKey);
    assert.ok(sourceBefore && sourceBefore.claimId && sourceBefore.remainingQty > 0);

    route.player.pos.x = claimed.pos.x - 80;
    route.player.pos.z = claimed.pos.z;
    route.state.input.fireGroup = 2;
    route.state.input.aimAngle = 0;
    route.sim.step(8);
    route.state.input.fireGroup = 0;
    const disputed = route.salvage._sourceSnapshot(sourceKey);
    assert.equal(disputed.extracted, true, 'the player physically strips the claimed plate first');
    assert.equal(disputed.disputedBy, String(route.player.id),
      'the existing source ledger records intervention against the cutter claim');
    assert.equal(sourceWrecks(route.state).some((wreck) => wreck.data.salvageSourceKey === sourceKey), false);

    const unstrippedSources = BONE_YARD_SALVAGE_SOURCES
      .map((source) => route.salvage._sourceSnapshot(source.sourceKey))
      .filter((source) => source && !source.extracted);
    assert.equal(unstrippedSources.length, 2, 'the intervention drains only its contested plate');

    const envelope = route.save.serialize('plan25-bone-yard');
    assert.equal(Object.values(envelope.data.salvage.sources).filter((source) => !source.extracted).length, 2,
      'the real save carries both untouched conserved plates');
    assert.equal(route.save.loadEnvelope(structuredClone(envelope), 'plan25-bone-yard'), true);
    assert.equal((route.state.entityList || []).filter((entity) => entity && entity.alive !== false
      && entity.data?.salvageSourceKey).length, 2, 'Continue rematerializes both untouched source bodies');
    assert.equal(sourceWrecks(route.state).some((wreck) => wreck.data.salvageSourceKey === sourceKey), false,
      'Continue cannot remint the stripped plate');
    assert.equal(ringSegments(route.state).length, BONE_YARD_SEGMENTS.length - 1,
      'Continue reconstructs one deterministic ring with the earned physical gap');
    assert.equal(new Set(ringSegments(route.state).map((wreck) => wreck.data.boneYardSegmentId)).size,
      BONE_YARD_SEGMENTS.length - 1, 'Continue creates no duplicate fused hull slot');
  } finally {
    route.sim.dispose();
  }
});
