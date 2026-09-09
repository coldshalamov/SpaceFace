// Phase B2 RED contract — automation outposts are coarse ledger math off-screen and exactly one
// authored place entity in the player's current sector. Runtime entity ids never enter saves.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { OUTPOSTS } from '../src/data/automation.js';
import { automation } from '../src/systems/automation.js';

const HELIOS = 'sector_helios_prime';
const CERES = 'sector_ceres_belt';
const PLAYER_POS = Object.freeze({ x: 940, z: -375 });
const FIELD_POS = Object.freeze({ x: 820, z: -290 });
const REFINERY_PLACE_ID = 'place_claim_outpost_refinery';

function makeState(seed = 73) {
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    isPlayer: true,
    pos: { ...PLAYER_POS },
    vel: { x: 0, z: 0 },
    data: {},
  };
  return {
    mode: 'flight',
    simTime: 100,
    meta: { seed },
    playerId: player.id,
    player: {
      credits: 1_000_000,
      droneTierCap: 4,
      researchedNodes: ['tech_outpost_charter'],
      stats: {},
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 200, capMass: 200 },
      ownedShips: [],
    },
    world: {
      currentSectorId: HELIOS,
      activeSector: {
        id: HELIOS,
        fields: [{ id: 'field_helios_test', type: 'ast_common_rock', center: { ...FIELD_POS } }],
      },
    },
    entities: new Map([[player.id, player]]),
    entityList: [player],
    entityIndex: { asteroids: [] },
    automation: null,
  };
}

function boot(seed = 73) {
  const state = makeState(seed);
  const bus = createBus();
  const spawned = [];
  let nextEntityId = 100;
  const helpers = {
    player: () => state.entities.get(state.playerId) || null,
    getEntity: (id) => state.entities.get(id) || null,
    spawnEntity(spec = {}) {
      const entity = {
        ...spec,
        id: ++nextEntityId,
        alive: true,
        pos: { ...(spec.pos || { x: 0, z: 0 }) },
        vel: { ...(spec.vel || { x: 0, z: 0 }) },
        data: { ...(spec.data || {}) },
      };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (entity) entity.alive = false;
    },
  };
  bus.on('economy:chargeCredits', ({ amount = 0 } = {}) => {
    state.player.credits = Math.max(0, state.player.credits - Math.max(0, Math.round(amount)));
  });
  bus.on('economy:grantCredits', ({ amount = 0 } = {}) => {
    state.player.credits += Math.max(0, Math.round(amount));
  });

  const inst = Object.create(automation);
  inst.init({ state, bus, helpers, registry: null });
  inst.newGame();
  inst._orePrice = () => 28;
  inst._stationPrice = () => 28;
  return { state, bus, helpers, spawned, inst };
}

function setSector(harness, sectorId) {
  harness.state.world.currentSectorId = sectorId;
  harness.state.world.activeSector = {
    id: sectorId,
    fields: sectorId === HELIOS
      ? [{ id: 'field_helios_test', type: 'ast_common_rock', center: { ...FIELD_POS } }]
      : [],
  };
}

function seedOutpost(harness, overrides = {}) {
  const def = OUTPOSTS.find((entry) => entry.id === 'outpost_refinery');
  assert.ok(def, 'refinery fixture requires the authored automation definition');
  const outpost = {
    id: overrides.id || 'outpost_test_1',
    defId: def.id,
    level: 1,
    sectorId: overrides.sectorId || HELIOS,
    pos: { ...(overrides.pos || PLAYER_POS) },
    recipeId: def.id,
    storage: 0,
    storageCap: def.storageCap,
    defense: def.defense,
    upkeepPerMin: def.upkeepPerMin,
    autoSell: true,
    raidCooldown: 0,
    status: 'producing',
    ratePerMin: 0,
    ...overrides,
  };
  harness.state.automation.outposts.push(outpost);
  return outpost;
}

function attachRuntimeEntity(harness, outpost) {
  const entity = harness.helpers.spawnEntity({
    type: 'fx',
    team: 0,
    pos: { ...outpost.pos },
    homeSectorId: outpost.sectorId,
    data: {
      kind: 'automation_outpost',
      automationOutpostId: outpost.id,
      defId: outpost.defId,
      sectorId: outpost.sectorId,
      homeSectorId: outpost.sectorId,
      placeId: REFINERY_PLACE_ID,
    },
  });
  outpost.entityId = entity.id;
  return entity;
}

function liveOutpostEntities(harness, outpostId = null) {
  return harness.state.entityList.filter((entity) => entity
    && entity.alive
    && entity.type === 'fx'
    && entity.data
    && entity.data.automationOutpostId != null
    && (outpostId == null || entity.data.automationOutpostId === outpostId));
}

test('buildOutpost anchors the ledger near the current global player or asteroid field, never origin', () => {
  const h = boot();

  assert.equal(h.inst.buildOutpost('outpost_refinery'), true);
  const outpost = h.state.automation.outposts[0];
  assert.ok(outpost, 'successful build should create an authoritative ledger record');
  assert.notDeepEqual(outpost.pos, { x: 0, z: 0 }, 'outpost must not use the legacy hardcoded origin');

  const playerDistance = Math.hypot(outpost.pos.x - PLAYER_POS.x, outpost.pos.z - PLAYER_POS.z);
  const fieldDistance = Math.hypot(outpost.pos.x - FIELD_POS.x, outpost.pos.z - FIELD_POS.z);
  assert.ok(
    Math.min(playerDistance, fieldDistance) <= 512,
    `outpost ${JSON.stringify(outpost.pos)} should be near player ${JSON.stringify(PLAYER_POS)} or field ${JSON.stringify(FIELD_POS)}`,
  );
  assert.equal(outpost.sectorId, HELIOS);
});

test('buildOutpost ignores a distant first field and stays near the player activity bubble', () => {
  const h = boot();
  h.state.world.activeSector.fields = [
    { id: 'field_distant', type: 'ast_common_rock', center: { x: 15_000, z: 9_000 } },
    { id: 'field_near', type: 'ast_common_rock', center: { x: 1_020, z: -430 } },
  ];

  assert.equal(h.inst.buildOutpost('outpost_refinery'), true);
  const outpost = h.state.automation.outposts[0];
  const playerDistance = Math.hypot(outpost.pos.x - PLAYER_POS.x, outpost.pos.z - PLAYER_POS.z);

  assert.ok(playerDistance <= 512,
    `deployment ${JSON.stringify(outpost.pos)} must stay in the current player bubble, not the first catalog field`);
});

test('a built current-sector outpost owns exactly one authored place entity through repeated sync', () => {
  const h = boot();
  assert.equal(h.inst.buildOutpost('outpost_refinery'), true);
  const outpost = h.state.automation.outposts[0];

  h.bus.emit('sector:enter', { sectorId: HELIOS, continuous: false, noTeleport: false });
  h.inst.update(1 / 60, h.state);
  h.bus.emit('sector:enter', { sectorId: HELIOS, continuous: false, noTeleport: false });
  h.inst.update(1 / 60, h.state);

  const live = liveOutpostEntities(h, outpost.id);
  assert.equal(live.length, 1, 'build, enter, and update must converge on one live outpost entity');
  const entity = live[0];
  assert.equal(entity.data.placeId, REFINERY_PLACE_ID, 'refinery uses its authored outpost place');
  assert.equal(entity.data.defId, outpost.defId);
  assert.equal(entity.data.sectorId, HELIOS);
  assert.equal(entity.homeSectorId || entity.data.homeSectorId, HELIOS);
  assert.equal(outpost.entityId, entity.id, 'ledger stores only the current runtime entity id');
});

test('presence reconciliation removes duplicate live entities for one outpost', () => {
  const h = boot();
  const outpost = seedOutpost(h);
  attachRuntimeEntity(h, outpost);
  attachRuntimeEntity(h, outpost);
  assert.equal(liveOutpostEntities(h, outpost.id).length, 2, 'fixture starts with a duplicate');

  h.inst._syncOutpostPresence(h.state.automation);

  assert.equal(liveOutpostEntities(h, outpost.id).length, 1);
  assert.equal(outpost.entityId, liveOutpostEntities(h, outpost.id)[0].id);
});

test('fixed updates never poll outpost presence when no lifecycle boundary occurred', () => {
  const h = boot();
  let syncCalls = 0;
  h.inst._syncOutpostPresence = () => { syncCalls += 1; };

  for (let tick = 0; tick < 120; tick += 1) h.inst.update(1 / 60, h.state);

  assert.equal(syncCalls, 0,
    'presence is owned by build/load/sector/decommission events, not a 60 Hz ledger walk');
});

test('hard sector exit releases the outpost entity but preserves the coarse ledger off-screen', () => {
  const h = boot();
  const outpost = seedOutpost(h);
  const entity = attachRuntimeEntity(h, outpost);

  h.bus.emit('sector:exit', { sectorId: HELIOS, continuous: false, noTeleport: false });
  setSector(h, CERES);
  h.bus.emit('sector:enter', { sectorId: CERES, continuous: false, noTeleport: false });

  assert.equal(entity.alive, false, 'hard exit releases the player-visible outpost entity');
  assert.equal(outpost.entityId == null, true, 'released runtime id is cleared from the ledger record');
  assert.equal(h.state.automation.outposts.includes(outpost), true, 'off-screen outpost math remains authoritative');
  assert.equal(liveOutpostEntities(h).length, 0, 'no outpost entity remains materialized off-screen');
});

test('entering an outpost sector rematerializes it exactly once and never spawns it off-screen', () => {
  const h = boot();
  setSector(h, CERES);
  const outpost = seedOutpost(h, { sectorId: HELIOS, pos: { ...PLAYER_POS } });

  h.bus.emit('sector:enter', { sectorId: CERES, continuous: false, noTeleport: false });
  h.inst.update(1 / 60, h.state);
  assert.equal(liveOutpostEntities(h, outpost.id).length, 0, 'foreign-sector outpost stays abstract');

  setSector(h, HELIOS);
  h.bus.emit('sector:enter', { sectorId: HELIOS, continuous: false, noTeleport: false });
  h.inst.update(1 / 60, h.state);
  h.bus.emit('sector:enter', { sectorId: HELIOS, continuous: false, noTeleport: false });
  h.inst.update(1 / 60, h.state);

  const live = liveOutpostEntities(h, outpost.id);
  assert.equal(live.length, 1, 'repeated enter/update cannot stack duplicate outpost entities');
  assert.equal(outpost.entityId, live[0].id);
});

test('sector reconciliation removes an off-screen orphan even when its ledger id was lost', () => {
  const h = boot();
  const outpost = seedOutpost(h, { sectorId: HELIOS });
  const entity = attachRuntimeEntity(h, outpost);
  delete outpost.entityId;

  setSector(h, CERES);
  h.bus.emit('sector:enter', { sectorId: CERES, continuous: false, noTeleport: false });

  assert.equal(entity.alive, false);
  assert.equal(liveOutpostEntities(h, outpost.id).length, 0);
});

test('decommissionOutpost releases its live entity before removing the ledger record', () => {
  const h = boot();
  const outpost = seedOutpost(h);
  const entity = attachRuntimeEntity(h, outpost);

  assert.equal(h.inst.decommissionOutpost(outpost.id), true);

  assert.equal(entity.alive, false, 'decommissioned outpost cannot leave an orphaned place entity');
  assert.equal(h.state.automation.outposts.some((entry) => entry.id === outpost.id), false);
  assert.equal(liveOutpostEntities(h, outpost.id).length, 0);
});

test('upkeep repossession releases its live outpost entity before removing the ledger record', () => {
  const h = boot();
  const outpost = seedOutpost(h);
  const entity = attachRuntimeEntity(h, outpost);

  h.inst._repossessOne(h.state.automation);

  assert.equal(entity.alive, false, 'repossessed outpost cannot leave an orphaned place entity');
  assert.equal(h.state.automation.outposts.some((entry) => entry.id === outpost.id), false);
  assert.equal(liveOutpostEntities(h, outpost.id).length, 0);
});

test('automation save data excludes an outpost runtime entity id', () => {
  const h = boot();
  const outpost = seedOutpost(h);
  attachRuntimeEntity(h, outpost);

  const saved = h.inst.serialize();
  assert.equal(saved.outposts.length, 1);
  assert.equal(
    Object.hasOwn(saved.outposts[0], 'entityId'),
    false,
    'runtime entity ids are session-local and must never enter save data',
  );
});

test('a loaded current-sector outpost rematerializes exactly once without a saved runtime id', () => {
  const source = boot(91);
  seedOutpost(source);
  const saved = JSON.parse(JSON.stringify(source.inst.serialize()));
  assert.equal(Object.hasOwn(saved.outposts[0], 'entityId'), false, 'fixture models the durable save contract');

  const loaded = boot(91);
  loaded.inst.deserialize(saved);
  loaded.bus.emit('sector:enter', { sectorId: HELIOS, continuous: false, noTeleport: false });
  loaded.inst.update(1 / 60, loaded.state);
  loaded.bus.emit('sector:enter', { sectorId: HELIOS, continuous: false, noTeleport: false });
  loaded.inst.update(1 / 60, loaded.state);

  const outpost = loaded.state.automation.outposts[0];
  const live = liveOutpostEntities(loaded, outpost.id);
  assert.equal(live.length, 1, 'load plus repeated sync creates exactly one visible outpost');
  assert.equal(outpost.entityId, live[0].id);
});

test('save restore suppresses stale pre-load outpost presence until automation data is restored', () => {
  const source = boot(93);
  seedOutpost(source, { id: 'outpost_from_save' });
  const saved = JSON.parse(JSON.stringify(source.inst.serialize()));

  const loaded = boot(94);
  seedOutpost(loaded, { id: 'outpost_from_previous_run' });

  loaded.bus.emit('save:restoring', { slot: 'test' });
  loaded.bus.emit('sector:enter', { sectorId: HELIOS, continuous: false, noTeleport: false });
  assert.equal(liveOutpostEntities(loaded).length, 0,
    'sector re-entry happens before automation deserialize and must not flash stale outposts');

  loaded.inst.deserialize(saved);
  loaded.bus.emit('save:loaded', { slot: 'test' });

  const live = liveOutpostEntities(loaded);
  assert.equal(live.length, 1, 'the restored ledger materializes once at the save-loaded boundary');
  assert.equal(live[0].data.automationOutpostId, 'outpost_from_save');
  assert.equal(
    loaded.spawned.some((entity) => entity.data?.automationOutpostId === 'outpost_from_previous_run'),
    false,
    'no stale pre-load structure is ever spawned during the restore sequence',
  );
});

test('a legacy origin-position outpost migrates into the current activity bubble on materialization', () => {
  const source = boot(92);
  seedOutpost(source, { pos: { x: 0, z: 0 } });
  const saved = JSON.parse(JSON.stringify(source.inst.serialize()));

  const loaded = boot(92);
  loaded.inst.deserialize(saved);
  loaded.bus.emit('sector:enter', { sectorId: HELIOS, continuous: false, noTeleport: false });

  const outpost = loaded.state.automation.outposts[0];
  const live = liveOutpostEntities(loaded, outpost.id);
  assert.notDeepEqual(outpost.pos, { x: 0, z: 0 });
  assert.equal(live.length, 1);
  assert.deepEqual(live[0].pos, outpost.pos);
});
