// Contract-retained aftermath hulls defer ambient salvor claims — the same ownership law
// gardenFeedMass already enforces on the Understory side. Run 115 evidence: a marked Cinder
// hull cut loose inside Rook's ring sat unclaimed ~80 s while the booth refused it — a
// dispatched yard cutter can stake salvorClaimedBy on the contract's only deliverable and
// strand the pad sale forever (rookBoothEligible refuses claimed freight).
import test from 'node:test';
import assert from 'node:assert/strict';

// Import order matters: traffic.js ↔ trafficRoleOps.js cycle — traffic resolves first.
import { traffic } from '../src/systems/traffic.js';
import { aftermathForSector, aftermathWrecks } from '../src/systems/aftermathWrecks.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';

const SECTOR_ID = 'sector_charon_expanse';
const CINDER_TAG = 'campaign47a:b2:cinder';

class Bus {
  constructor() {
    this.handlers = new Map();
    this.log = [];
  }
  on(name, fn) {
    const list = this.handlers.get(name) || [];
    list.push(fn);
    this.handlers.set(name, list);
  }
  off(name, fn) {
    this.handlers.set(name, (this.handlers.get(name) || []).filter((entry) => entry !== fn));
  }
  emit(name, payload) {
    this.log.push({ name, payload });
    for (const fn of [...(this.handlers.get(name) || [])]) fn(payload);
  }
}

function boot(seed = 4242) {
  const state = {
    meta: { seed },
    tick: 60,
    simTime: 0,
    playerId: 1,
    player: { cargo: { items: {}, capVolume: 40, usedVolume: 0, usedMass: 0 }, miningBeam: null },
    world: { currentSectorId: SECTOR_ID },
    entities: new Map(),
    entityList: [],
    missions: { active: [] },
    rng() { return 0.35; },
  };
  const bus = new Bus();
  let nextEntityId = 900;
  const helpers = {
    spawnEntity(spec) {
      const entity = {
        ...spec,
        id: Number.isSafeInteger(spec.id) && spec.id > 0 ? spec.id : nextEntityId++,
        alive: true,
        pos: { ...(spec.pos || { x: 0, z: 0 }) },
        vel: { ...(spec.vel || { x: 0, z: 0 }) },
        rot: spec.rot || 0,
        data: spec.data ? JSON.parse(JSON.stringify(spec.data)) : {},
      };
      if (spec.id != null && spec.id >= nextEntityId) nextEntityId = spec.id + 1;
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (entity) entity.alive = false;
      state.entities.delete(id);
      const at = state.entityList.indexOf(entity);
      if (at >= 0) state.entityList.splice(at, 1);
      return entity;
    },
  };
  const registry = { get: (name) => (name === 'aftermathWrecks' ? aftermathWrecks : null) };
  aftermathWrecks.init({ state, bus, helpers, registry });
  // The salvor owner, stood up on the same state/registry: traffic spreads trafficRoleOps —
  // its claim path only needs state, helpers and the registry seam it already uses elsewhere.
  const ops = Object.create(traffic);
  ops.state = state;
  ops.helpers = helpers;
  ops._registry = registry;
  return { state, bus, helpers, registry, ops };
}

function cinderMission(markerId) {
  return {
    id: 'm_5',
    storyTag: CINDER_TAG,
    status: 'active',
    destSectorId: SECTOR_ID,
    objectiveTarget: 3,
    objectiveProgress: 3,
    completedTargetSlots: [0, 1, 2],
    targetEntityIds: [],
    params: {
      cinderRouteVersion: 1,
      cinderTargetOwnerId: 'm_5',
      cinderIssuedSlots: [0, 1, 2],
      cinderMarkedWrecks: [{ slot: 0, markerId }],
    },
  };
}

// A marked wasp dies carrying the contract identity — the same stamp stampCinderWasp +
// missionSpawningOps place on the live body — so makeMarker records victimMission and the
// hull it leaves is canonical contract material.
function plantMarkedWaspWreck(ctx, slot = 0) {
  const zone = zonesForSector(SECTOR_ID)[0];
  const pos = sectorLocalToGlobalForSector(zone.center, SECTOR_ID);
  const victim = {
    id: 42 + slot,
    type: 'ship',
    alive: false,
    pos: { ...pos },
    vel: { x: 5, z: 2 },
    mass: 22,
    factionId: 'faction_cinder',
    data: {
      defId: 'ship_wasp',
      shipClass: 'wasp',
      name: 'Cinder One · marked Wasp',
      missionId: 'm_5',
      missionTag: 'm_5',
      missionPinned: true,
      missionTargetSlot: slot,
      missionStoryTag: CINDER_TAG,
      missionRouteVersion: 1,
    },
  };
  ctx.state.entities.set(victim.id, victim);
  ctx.state.entityList.push(victim);
  ctx.bus.emit('entity:killed', {
    id: victim.id,
    killerId: 1,
    type: 'ship',
    victimClass: 'wasp',
    pos: { ...pos },
    sectorId: SECTOR_ID,
  });
  const marker = aftermathForSector(ctx.state, SECTOR_ID)
    .find((row) => row && row.victimId === victim.id);
  assert.ok(marker, 'kill marker recorded');
  assert.ok(marker.victimMission, 'marker carries the contract identity');
  ctx.state.entities.delete(victim.id);
  ctx.state.entityList.splice(ctx.state.entityList.indexOf(victim), 1);
  return marker;
}

function materialize(ctx, marker) {
  const spec = aftermathWrecks._specForMarker(marker);
  const wreck = ctx.helpers.spawnEntity(spec);
  assert.ok(aftermathWrecks._bindLiveMarker(marker, wreck), 'wreck bound to marker');
  wreck.data.salvorNoticeAt = 0; // notice already fired — the body is claimable on sight
  return wreck;
}

test('a contract-retained marked hull defers cleanup claims until the contract releases it', () => {
  const h = boot();
  const marker = plantMarkedWaspWreck(h, 0);
  const m = cinderMission(marker.markerId);
  h.state.missions.active.push(m);
  const wreck = materialize(h, marker);

  // The aftermath owner reads retention from the live contract + bound marker.
  assert.equal(aftermathWrecks.contractRetainedWreck(wreck), true, 'retained hull is contract-owned');
  // A second killed wasp's hull in the same field answers false — the contract's
  // marked list names only the retained markerIds, not every victim-mission wreck.
  const plain = plantMarkedWaspWreck(h, 1);
  const plainWreck = materialize(h, plain);
  assert.equal(aftermathWrecks.contractRetainedWreck(plainWreck), false, 'ordinary wreck is not retained');

  // The claim path refuses to stake it — pick, defer, and stamp all agree.
  assert.equal(h.ops._deferOrdinaryCleanupClaim(wreck), true);
  assert.equal(h.ops._stampSalvorClaim(wreck, 'crew'), false);
  assert.equal(wreck.data.salvorClaimedBy, undefined, 'no claim stamped');
  assert.equal(h.ops._pickUnclaimedSalvageTarget({ pos: { x: wreck.pos.x, z: wreck.pos.z } }), plainWreck,
    'the sweep skips the retained hull and takes the ordinary one');
  assert.equal(plainWreck.data.salvorClaimedBy, undefined, 'pick does not stamp — reservation is a later act');

  // The contract releasing the hull (delivered/stripped/destroyed) restores the ordinary law.
  m.params.cinderMarkedWrecks[0].disposition = 'delivered';
  assert.equal(aftermathWrecks.contractRetainedWreck(wreck), false, 'delivered hull is released');
  assert.equal(h.ops._deferOrdinaryCleanupClaim(wreck), false);
  assert.equal(h.ops._stampSalvorClaim(wreck, 'crew'), true, 'released hull is claimable again');
  assert.equal(wreck.data.salvorClaimedBy, 'crew');
});

test('retention reads the suspended retry row too — a failed-and-retained route still owns its hulls', () => {
  const h = boot();
  const marker = plantMarkedWaspWreck(h, 0);
  const m = cinderMission(marker.markerId);
  m.status = 'suspended';
  h.state.missions.cinderRetry = m; // retainCinderRetry's snapshot shape
  const wreck = materialize(h, marker);
  assert.equal(aftermathWrecks.contractRetainedWreck(wreck), true);
  assert.equal(h.ops._stampSalvorClaim(wreck, 'crew'), false);
});
