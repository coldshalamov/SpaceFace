import assert from 'node:assert/strict';
import test from 'node:test';

import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import {
  CAPITAL_PHASE_RUNTIME_ID,
  IRON_MAW_PHASE_IDS,
  capitalRuntime,
} from '../src/systems/capitalRuntime.js';
import { combat, makeEnemySpawnSpec } from '../src/systems/combat.js';
import { heavyPartsRuntime } from '../src/systems/heavyPartsRuntime.js';
import { mining } from '../src/systems/mining.js';
import { world } from '../src/systems/world.js';

function boot(t, { withWorld = false } = {}) {
  const systems = [heavyPartsRuntime, capitalRuntime, combat, mining, ...(withWorld ? [world] : [])];
  const sim = createSimulation({
    seed: 2020,
    systems,
    updateOrder: [heavyPartsRuntime, capitalRuntime, combat, mining],
  });
  t.after(() => sim.dispose());
  const { state, bus, registry } = sim;
  state.mode = 'flight';
  state.input.actions = {};
  const player = sim.spawn({
    type: 'ship', team: 0, factionId: 'faction_free',
    pos: { x: -120, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 12, mass: 180, hull: 160, hullMax: 160,
    armorHp: 0, armorMax: 0, shield: 0, shieldMax: 0,
    cap: 1000, capMax: 1000, collides: true,
    physicsBody: {
      schemaVersion: 1, radius: 12, mass: 180, inertiaY: 12_960,
      dynamic: true, ccd: true, revision: 0,
    },
    data: { defId: 'ship_bastion', combatProfileId: 'combat_profile_standard_ship', weapons: [] },
  });
  state.playerId = player.id;
  if (withWorld) {
    state.simTime = 90;
    state.world.currentSectorId = 'sector_ashfall_reach';
    state.world.activeSector = {
      id: 'sector_ashfall_reach',
      pois: [],
      hazards: [],
      boss: null,
    };
  }
  const spec = makeEnemySpawnSpec('dreadnought_boss', 9, { x: 120, z: 0 });
  spec.data.isBoss = true;
  spec.data.bossSectorId = 'sector_ashfall_reach';
  spec.data.bossPoiId = 'poi_boss';
  const maw = sim.spawn(spec);
  if (withWorld) state.world.activeSector.boss = { entityId: maw.id, poiId: 'poi_boss' };
  const events = [];
  for (const name of [
    'capital:phaseChanged', 'encounter:choiceOffered', 'capital:choiceStarted',
    'capital:resolved', 'capital:reactorArmed', 'capital:reactorCookOff',
    'heavy:beamExtracted', 'boss:resolved', 'boss:defeated', 'entity:killed',
  ]) bus.on(name, (payload) => events.push({ name, payload }));
  return { sim, state, bus, registry, player, maw, events };
}

function part(route, partId) {
  const record = route.maw.data.heavyPartsRuntime.parts.find((row) => row.partId === partId);
  assert.ok(record, `physical part ${partId} exists`);
  const entity = route.state.entities.get(record.entityId);
  assert.ok(entity && entity.type === 'heavyPart');
  return { record, entity };
}

function destroyPart(route, partId) {
  const target = part(route, partId);
  route.bus.emit('projectile:hit', {
    targetId: target.entity.id,
    ownerId: route.player.id,
    damage: 100_000,
    damageType: 'kinetic',
    weaponId: 'wpn_siege_lance_l',
    pos: { x: target.entity.pos.x, z: target.entity.pos.z },
  });
  assert.equal(target.record.destroyed, true, `${partId} is detached by the combat damage owner`);
  return target;
}

function stripToDecision(route) {
  const recipe = route.maw.data.heavyPartRecipe;
  const [screen, drives] = recipe.phases;
  for (const partId of screen.objectivePartIds) destroyPart(route, partId);
  assert.equal(route.maw.data.capitalRuntime.phaseId, IRON_MAW_PHASE_IDS.drives);
  for (const partId of drives.objectivePartIds) destroyPart(route, partId);
  assert.equal(route.maw.data.capitalRuntime.phaseId, IRON_MAW_PHASE_IDS.decision);
  assert.equal(route.maw.data.heavyDisabled, true);
  assert.equal(route.maw.data.stationaryTerrain, true);
  assert.equal(route.maw.alive, true);
}

function choose(route, choiceId) {
  route.bus.emit('encounter:choose', {
    encounterId: `capital:iron-maw:${route.maw.id}`,
    choiceId,
  });
  assert.equal(route.maw.data.capitalRuntime.decision.choiceId, choiceId);
  assert.equal(route.maw.data.capitalRuntime.decision.status, 'active');
}

test('Iron Maw phases advance only from exact physical PD and drive losses', (t) => {
  const route = boot(t);
  const runtime = route.maw.data.capitalRuntime;
  assert.equal(runtime.runtimeId, CAPITAL_PHASE_RUNTIME_ID);
  assert.equal(runtime.phaseId, IRON_MAW_PHASE_IDS.screen);

  route.bus.emit('projectile:hit', {
    targetId: route.maw.id,
    ownerId: route.player.id,
    damage: 1_000_000,
    damageType: 'kinetic',
    weaponId: 'wpn_siege_lance_l',
    pos: { x: route.maw.pos.x, z: route.maw.pos.z },
  });
  assert.equal(route.maw.alive, true);
  assert.equal(route.maw.hull, 1, 'fresh capital hull damage is lethality-floored before the strip');
  assert.equal(runtime.phaseId, IRON_MAW_PHASE_IDS.screen,
    'hull percentage is not a phase trigger');

  const screenIds = route.maw.data.heavyPartRecipe.phases[0].objectivePartIds;
  for (const partId of screenIds.slice(0, -1)) destroyPart(route, partId);
  assert.equal(runtime.phaseId, IRON_MAW_PHASE_IDS.screen,
    'the surviving exact PD cluster keeps the screen phase live');
  destroyPart(route, screenIds.at(-1));
  assert.equal(runtime.phaseId, IRON_MAW_PHASE_IDS.drives);

  const driveIds = route.maw.data.heavyPartRecipe.phases[1].objectivePartIds;
  destroyPart(route, driveIds[0]);
  assert.equal(runtime.phaseId, IRON_MAW_PHASE_IDS.drives);
  destroyPart(route, driveIds[1]);
  assert.equal(runtime.phaseId, IRON_MAW_PHASE_IDS.decision);
  assert.equal(route.maw.data.heavyDisabled, true);
  assert.equal(route.maw.data.beamExtractableHeavy, false,
    'the generic heavy extraction verb cannot choose the capital finale');
  assert.ok(part(route, 'iron_maw_broadside_port').entity.alive,
    'non-objective turrets remain real physical parts instead of vanishing at a phase boundary');

  route.registry.get('capitalRuntime').update(SIM_DT, route.state);
  const offer = route.events.find((event) => event.name === 'encounter:choiceOffered');
  assert.deepEqual(offer.payload.options.map((option) => option.id), ['board_lite', 'tow', 'destroy']);
  assert.equal(JSON.stringify(offer.payload).includes('PHASE 2'), false,
    'the runtime does not replace the physical transition with phase-banner text');
});

test('board-lite requires the finite industrial-beam breach and settles the world once', (t) => {
  const route = boot(t, { withWorld: true });
  stripToDecision(route);
  choose(route, 'board_lite');
  assert.equal(route.maw.data.beamExtractableHeavy, true);
  route.state.player.tether = { active: true, targetId: route.maw.id };

  const miner = route.registry.get('mining');
  assert.equal(miner._extractDisabledHeavy(route.player, route.maw, 240, 1), true);
  assert.equal(miner._extractDisabledHeavy(route.player, route.maw, 240, 1), false,
    'the breach payload is finite');
  const payload = route.state.entityList.find((entity) =>
    entity.type === 'payload' && entity.data?.payloadType === 'iron_maw_boarding_salvage');
  assert.ok(payload && payload.collides, 'boarding yields one physical authored salvage payload');
  assert.deepEqual(payload.data.salvagePool, {
    cmdty_scrap_metal: 24,
    cmdty_salvage_electronics: 12,
    cmdty_quantum_cores: 1,
  });
  assert.equal(route.maw.data.capitalRuntime.decision.outcome, 'boarded');
  assert.equal(route.events.filter((event) => event.name === 'boss:resolved').length, 1);
  assert.equal(route.events.filter((event) => event.name === 'boss:defeated').length, 1);
  const discovery = route.state.world.discovery.sector_ashfall_reach.pois.poi_boss;
  assert.equal(discovery.bossDefeated, true);
  assert.equal(discovery.resolutionOutcome, 'boarded');
  assert.equal(route.maw.alive, true, 'board-lite does not secretly destroy the hulk');
});

test('tow needs a live Massline and real SG-02 displacement; finish needs an ordinary kill', async (t) => {
  const tow = boot(t);
  stripToDecision(tow);
  choose(tow, 'tow');
  const capital = tow.registry.get('capitalRuntime');
  const originX = tow.maw.pos.x;
  tow.maw.pos.set(originX + 400, 0, tow.maw.pos.z);
  capital.update(SIM_DT, tow.state);
  assert.equal(tow.maw.data.capitalRuntime.decision.status, 'active',
    'position change without a live Massline cannot resolve the tow');
  tow.maw.pos.set(originX, 0, tow.maw.pos.z);
  tow.player.vel.set(-220, 0, 0);
  tow.state.player.tether = { active: true, targetId: tow.maw.id, attachmentId: 'iron-maw-tow' };

  const dynamics = await createSg02DynamicBodyOwner({ fixedDt: SIM_DT, quantum: 1e-5, mode: 'rapier-dynamic' });
  t.after(() => dynamics.dispose());
  dynamics.syncFromEntities([tow.player, tow.maw]);
  assert.ok(dynamics.createAttachment({
    attachmentId: 'iron-maw-tow',
    defId: 'tether_standard',
    ownerId: tow.player.id,
    targetId: tow.maw.id,
    sourceWorld: tow.player.pos,
    targetWorld: tow.maw.pos,
    restLength: 80,
    tick: tow.state.tick,
  }));
  for (let i = 0; i < 7_200
    && Math.hypot(tow.maw.pos.x - originX, tow.maw.pos.z) < 325; i++) dynamics.step(SIM_DT);
  const displaced = Math.hypot(tow.maw.pos.x - originX, tow.maw.pos.z);
  assert.ok(displaced >= 320, `the real SG-02 line must move the 2,000-mass hulk, got ${displaced}`);
  capital.update(SIM_DT, tow.state);
  assert.equal(tow.maw.data.capitalRuntime.decision.outcome, 'towed');
  assert.equal(tow.maw.alive, true);

  const finish = boot(t, { withWorld: true });
  stripToDecision(finish);
  choose(finish, 'destroy');
  assert.equal(finish.events.filter((event) => event.name === 'capital:reactorArmed').length, 1);
  assert.equal(finish.maw.alive, true, 'choosing finish only arms the reactor; it is not a menu kill');
  finish.bus.emit('projectile:hit', {
    targetId: finish.maw.id,
    ownerId: finish.player.id,
    damage: 1_000_000,
    damageType: 'kinetic',
    weaponId: 'wpn_siege_lance_l',
    pos: { x: finish.maw.pos.x, z: finish.maw.pos.z },
  });
  assert.equal(finish.maw.alive, false);
  assert.equal(finish.events.filter((event) => event.name === 'entity:killed'
    && event.payload.id === finish.maw.id).length, 1);
  assert.equal(finish.events.filter((event) => event.name === 'capital:reactorCookOff').length, 1);
  assert.equal(finish.events.filter((event) => event.name === 'boss:defeated'
    && event.payload.outcome === 'destroyed').length, 1);
});
