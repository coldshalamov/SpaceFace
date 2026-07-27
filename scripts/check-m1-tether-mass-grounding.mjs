import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { MODULES } from '../src/data/modules.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { SHIPS } from '../src/data/ships.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { ensurePhysicsBodySpec, syncDerivedPhysicsMass } from '../src/core/physicsAuthority.js';
import { createSg02CombatPhysicsPort, createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { createCombatKernel } from '../src/combat/kernel.js';
import { addCargo, cargo } from '../src/systems/cargo.js';
import { buildSlotList, fittingsFromDefaultModules, getDerivedStats, makeShipEntitySpec, ships } from '../src/systems/ships.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { buildCommandMatrix } from './check-ci-report.mjs';
import { ciMatrixSourceCommand } from './lib/ciGateGraph.mjs';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(packageJson.scripts['check:m1:tether-mass'], 'node scripts/check-m1-tether-mass-grounding.mjs',
  'the M1 tether-mass check has a stable npm alias');

// `check` aggregate: lifecycle (precheck) + body must wire the gate exactly once.
{
  const lifecycle = packageJson.scripts.precheck || '';
  const matches = `${lifecycle} ${packageJson.scripts.check}`.match(/npm run check:m1:tether-mass/g) || [];
  assert.equal(matches.length, 1, 'check wires the M1 tether-mass gate exactly once');
}

// `check:ci` delegates to the complete runner rather than inlining the gate.
// Fail closed on both the delegation string and the expanded matrix the runner uses.
assert.equal(packageJson.scripts['check:ci'], 'npm run check:ci:report',
  'check:ci delegates to the ci-report aggregate');
assert.equal(packageJson.scripts['check:ci:report'], 'node scripts/check-ci-report.mjs',
  'check:ci:report runs the complete ci-report runner');
{
  // Use check-ci-report.mjs's own matrix source rather than restating it, so this gate cannot drift
  // out of agreement with the runner it is asserting about.
  const completeCheckCommand = ciMatrixSourceCommand(packageJson.scripts || {});
  const matrix = buildCommandMatrix(completeCheckCommand, packageJson.scripts || {});
  const tetherMassCommands = matrix.filter((entry) => entry.command === 'npm run check:m1:tether-mass');
  assert.equal(tetherMassCommands.length, 1,
    'check:ci complete matrix includes the M1 tether-mass gate exactly once');
}

const starterFittings = fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules);
const player = {
  efficiencyMods: {},
  cargo: { items: { cmdty_ore_iron: 20 }, usedVolume: 20, usedMass: 20, capVolume: 40, capMass: 60 },
};
const loaded = getDerivedStats(NEW_GAME.shipId, starterFittings, player);

assert.equal(loaded.dryMass, 32, 'starter dry mass is hull plus fitted modules');
assert.equal(loaded.cargoMass, 20, 'derived stats read authoritative cargo usedMass');
assert.equal(loaded.operationalMass, 52, 'operational mass includes live cargo');
assert.equal(loaded.mass, loaded.operationalMass, 'legacy mass alias is the operational mass');

const npc = getDerivedStats('ship_wasp', [], null);
assert.equal(npc.cargoMass, 0, 'NPC derivation is isolated from player cargo');

const standard = ATTACHMENT_DEFS.find((def) => def.id === 'tether_standard');
// The normal-play envelope is exactly 10× the immediately preceding live tune.
assert.equal(standard.breakTension, 10500000, 'standard compatibility threshold is 10× the prior live tune');
assert.deepEqual(
  { maxTension: standard.break.maxTension, maxImpulse: standard.break.maxImpulse, maxYank: standard.break.maxYank },
  { maxTension: 10500000, maxImpulse: 190000, maxYank: 150000 },
  'standard immutable base strength carries the 10× durability envelope',
);
assert.equal(standard.massline.automaticBreakPolicy, 'extreme_load_only',
  'normal endpoints do not enable automatic standard-Massline breakage');
assert.equal(standard.spring.maxStretchRatio, 1.44,
  'standard tether doubles the real geometric stretch envelope, not only unreachable force numbers');
assert.equal(standard.spring.reelSafeStretchRatio, 1.32,
  'active reel remains inside the doubled geometric break edge');
const immutableBaseSnapshot = JSON.stringify(standard.break);
const attachmentModule = await import('../src/combat/attachments.js');
assert.equal(typeof attachmentModule.effectiveTetherBreak, 'function',
  'attachments exports one pure effective-strength resolver');
assert.equal(typeof attachmentModule.effectiveTetherPolicy, 'function',
  'attachments exports one pure effective tether policy resolver');
for (const [rating, expected] of [
  [1, [10500000, 190000, 150000]],
  [1.5, [15750000, 285000, 225000]],
  [3, [31500000, 570000, 450000]],
  [6, [63000000, 1140000, 900000]],
]) {
  const owner = { data: { derived: { tetherSpoolMult: rating } } };
  const effective = attachmentModule.effectiveTetherBreak(standard, owner);
  assert.deepEqual(
    [effective.maxTension, effective.maxImpulse, effective.maxYank],
    expected,
    `rating ${rating} scales standard strength from the immutable base`,
  );
}
assert.equal(JSON.stringify(standard.break), immutableBaseSnapshot,
  'effective strength resolution never mutates the catalog base');
assert.equal(attachmentModule.automaticMasslineBreakAllowed(
  standard,
  { data: { derived: { tetherSpoolMult: 1 } } },
  { data: {} },
), false, 'ordinary endpoints cannot auto-break the standard line');
assert.equal(attachmentModule.automaticMasslineBreakAllowed(
  standard,
  { data: { derived: { tetherSpoolMult: 1 } } },
  { data: { masslineBreakPolicy: 'extreme_overload' } },
), true, 'future extreme-load endpoints must opt in explicitly');
const rebasedRatingThree = attachmentModule.rebasePersistedTetherPolicy(standard, {
  break: { maxTension: 3150000, maxImpulse: 57000, maxYank: 45000 },
  reelRate: standard.reelRate,
});
assert.deepEqual(
  [rebasedRatingThree.break.maxTension, rebasedRatingThree.break.maxImpulse, rebasedRatingThree.break.maxYank],
  [31500000, 570000, 450000],
  'Continue rebases a legacy snapshot while preserving its deployed spool rating',
);

const moduleById = new Map(MODULES.map((def) => [def.id, def]));
assert.equal(moduleById.get('mod_winch_hd')?.mods?.tetherSpoolMult, 1.5);
assert.equal(moduleById.get('mod_winch_hd')?.mods?.tetherReelRateMult, 1.8);
assert.equal('tetherBreakMult' in moduleById.get('mod_winch_hd').mods, false,
  'obsolete break multiplier is removed so spool rating is the sole strength source');
assert.equal(moduleById.get('mod_massline_spool_m')?.mods?.tetherSpoolMult, 3);
assert.equal(moduleById.get('mod_massline_spool_l')?.mods?.tetherSpoolMult, 6);

const leviathan = SHIPS.find((def) => def.id === 'ship_leviathan');
const leviathanSlots = buildSlotList(leviathan);
const spoolStats = (ids) => {
  const fittings = new Array(leviathanSlots.length).fill(null);
  const utilityIndexes = leviathanSlots
    .map((slot, index) => slot.type === 'utility' ? index : -1)
    .filter((index) => index >= 0);
  ids.forEach((id, index) => { fittings[utilityIndexes[index]] = id; });
  const derived = getDerivedStats(leviathan.id, fittings, null);
  return [derived.tetherSpoolMult, derived.tetherReelRateMult];
};
assert.deepEqual(spoolStats([]), [1, 1], 'no spool module resolves base strength and reel ratings');
assert.deepEqual(spoolStats(['mod_winch_hd']), [1.5, 1.8]);
assert.deepEqual(spoolStats(['mod_winch_hd', 'mod_winch_hd']), [1.5, 1.8], 'duplicate spools do not stack');
assert.deepEqual(spoolStats(['mod_winch_hd', 'mod_massline_spool_m']), [3, 1.8], 'strength and reel ratings max-fold independently');
assert.deepEqual(spoolStats(['mod_massline_spool_l', 'mod_winch_hd', 'mod_massline_spool_m']), [6, 1.8]);
assert.deepEqual(spoolStats(['mod_massline_spool_m', 'mod_winch_hd', 'mod_massline_spool_l']), [6, 1.8],
  'spool resolution is fitting-order independent');

{
  const attachment = { id: 'att_reel_hd', defId: standard.id, state: 'active', restLength: 300 };
  let requestedDelta = null;
  const attachments = {
    get() { return attachment; },
    reelPolicy() { return { reelRate: standard.reelRate * 1.8 }; },
    reel(id, delta) { requestedDelta = delta; attachment.restLength += delta; return { ok: true, attachment }; },
  };
  const reeled = tetherGameplay._reelActive.call({
    _active: { attachmentId: attachment.id },
    registry: { get() { return { kernel: { catalog: { attachments: new Map([[standard.id, standard]]) } } }; } },
  }, attachments, -999, 1);
  // _reelActive returns a truthful receipt since the PQ-003/PQ-006 pay-out work; success is the
  // receipt's changed flag, same strength as the old boolean.
  assert.equal(reeled && reeled.changed, true, 'live player reel applies and reports a changed receipt');
  assert(Math.abs(requestedDelta + standard.reelRate * 1.8) < 1e-9,
    'live player reel clamps from the immutable base rate times the effective max-folded rating');
}

{
  const strainEvents = [];
  const attachment = { id: 'att_spool_6', defId: standard.id, state: 'active', lastTension: 10500000 };
  const attachments = {
    get(id) { return id === attachment.id ? attachment : null; },
    breakPolicy(id) {
      return id === attachment.id
        ? attachmentModule.effectiveTetherBreak(standard, { data: { derived: { tetherSpoolMult: 6 } } })
        : null;
    },
  };
  tetherGameplay._emitStrain.call({
    _active: { attachmentId: attachment.id },
    _lastStrainT: -Infinity,
    _lastStrainRatio: 0,
    registry: { get() { return { kernel: { catalog: { attachments: new Map([[standard.id, standard]]) } } }; } },
    bus: { emit(name, payload) { if (name === 'tether:strain') strainEvents.push(payload); } },
  }, attachments, { simTime: 1, tick: 60 });
  assert.equal(strainEvents.length, 1);
  assert.equal(strainEvents[0].ratio, 1 / 6,
    'strain telemetry uses the effective spool threshold rather than the immutable base');
}

{
  const state = createGameState(47);
  const bus = createBus();
  const shipSystem = Object.assign({}, ships);
  const cargoSystem = Object.assign({}, cargo);
  state.player.ownedShips = [{ defId: NEW_GAME.shipId, fittings: starterFittings.slice() }];
  state.player.activeShipIndex = 0;
  const spec = makeShipEntitySpec(NEW_GAME.shipId, {
    isPlayer: true,
    player: state.player,
    fittings: starterFittings,
    pos: { x: 0, z: 0 },
  });
  const entity = { ...spec, id: 1, alive: true };
  ensurePhysicsBodySpec(entity);
  const initialPhysicsRevision = entity.physicsBody.revision;
  state.playerId = entity.id;
  state.entities.set(entity.id, entity);
  state.entityList.push(entity);
  const ctx = { state, bus, helpers: {} };
  shipSystem.init(ctx);
  cargoSystem.init(ctx);
  const eventCounts = { stats: 0, cargoCap: 0, appearance: 0, mass: 0 };
  bus.on('ship:statsChanged', () => { eventCounts.stats++; });
  bus.on('ship:cargoCapChanged', () => { eventCounts.cargoCap++; });
  bus.on('ship:appearanceChanged', () => { eventCounts.appearance++; });
  bus.on('ship:massChanged', () => { eventCounts.mass++; });
  const weaponsIdentity = entity.data.weapons;
  const fittingsIdentity = entity.data.fittings;
  const iron = COMMODITIES.find((item) => item.id === 'cmdty_ore_iron');
  assert(iron, 'iron commodity fixture exists');
  assert.equal(addCargo(state, iron.id, 1), 1);
  assert.equal(addCargo(state, iron.id, 1), 1);
  assert.equal(addCargo(state, iron.id, 1), 1);
  assert.equal(entity.data.derived.cargoMass, 0,
    'cargo events queue a deterministic mass refresh instead of rebuilding the ship synchronously per unit');
  cargoSystem.update(1 / 60, state);
  assert.equal(entity.data.derived.cargoMass, iron.massPerU * 3,
    'cargo hot path flushes authoritative usedMass once per simulation tick');
  assert.equal(entity.mass, entity.data.derived.operationalMass,
    'active entity mass follows canonical operational mass');
  assert.equal(entity.physicsBody.mass, entity.data.derived.operationalMass,
    'physics authoring mass follows canonical operational mass');
  assert.equal(entity.physicsBody.inertiaY, entity.data.derived.flightModel.inertia,
    'physics authoring inertia follows cargo-aware derived inertia');
  assert.equal(entity.physicsBody.revision, initialPhysicsRevision + 1,
    'one operational mass change produces one physics revision');
  assert.equal(entity.data.weapons, weaponsIdentity, 'cargo mass refresh preserves weapons runtime identity');
  assert.equal(entity.data.fittings, fittingsIdentity, 'cargo mass refresh preserves appearance/loadout identity');
  assert.deepEqual(eventCounts, { stats: 0, cargoCap: 0, appearance: 0, mass: 1 },
    'three same-tick cargo mutations coalesce into one narrow mass receipt and no broad ship events');
  for (let i = 0; i < 5; i++) cargoSystem.update(1 / 60, state);
  assert.equal(eventCounts.mass, 1, 'unchanged cargo mass does not emit or revise on later ticks');
}

{
  const makeBodyEntity = (id, x, mass) => ({
    id, type: 'ship', alive: true, collides: true, radius: 4, mass,
    physicsBody: {
      schemaVersion: 1, radius: 4, mass, inertiaY: mass * 2,
      dynamic: true, ccd: true, material: 'ship', revision: 0,
    },
    pos: { x, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, data: {},
  });
  const owner = makeBodyEntity(101, -8, 24);
  const target = makeBodyEntity(202, 8, 48);
  const runtime = await createSg02DynamicBodyOwner({ fixedDt: 1 / 60, quantum: 1e-5, mode: 'rapier-dynamic' });
  try {
    runtime.syncFromEntities([owner, target]);
    runtime.step(1 / 60);
    const handle = runtime.createAttachment({
      attachmentId: 'mass_update_keeps_tether', defId: 'tether_standard',
      ownerId: owner.id, targetId: target.id,
      sourceWorld: { x: -8, y: 0, z: 0 }, targetWorld: { x: 8, y: 0, z: 0 },
      restLength: 16,
      break: { maxTension: 10500000, maxImpulse: 190000, maxYank: 150000 },
      spring: { mode: 'legacy_rope' },
      tick: 0,
    });
    assert(handle, 'fixture creates a live standard tether');
    const originalRecord = runtime.records.get(owner.id);
    const originalBody = originalRecord.body;
    const originalAttachment = runtime.attachments.get(handle.attachmentId);
    const originalJoint = originalAttachment.contactJoint;
    assert(originalJoint, 'fixture creates a live Rapier joint whose identity can be checked');
    assert.equal(originalBody.mass(), 24, 'Rapier starts with the authored body mass');
    assert.equal(originalBody.principalInertia().y, 48, 'Rapier starts with the authored yaw inertia');
    owner.mass = 36;
    owner.physicsBody.mass = 36;
    owner.physicsBody.inertiaY = 72;
    owner.physicsBody.revision++;
    runtime.syncFromEntities([owner, target]);
    runtime.step(1 / 60);
    const updatedRecord = runtime.records.get(owner.id);
    assert.equal(updatedRecord, originalRecord, 'mass-only sync preserves the SG-02 record');
    assert.equal(updatedRecord.body, originalBody, 'mass-only sync preserves the Rapier body');
    assert.equal(updatedRecord.spec.mass, 36, 'live SG-02 mass updates in place');
    assert.equal(updatedRecord.spec.inertiaY, 72, 'live SG-02 inertia updates in place');
    assert.equal(updatedRecord.body.mass(), 36, 'the actual Rapier body receives the new mass');
    assert.equal(updatedRecord.body.principalInertia().y, 72, 'the actual Rapier body receives the new yaw inertia');
    assert.equal(runtime.attachments.get(handle.attachmentId), originalAttachment,
      'mass-only sync preserves the physical attachment object');
    assert.equal(runtime.attachments.get(handle.attachmentId).contactJoint, originalJoint,
      'mass-only sync preserves the live Rapier joint');
  } finally {
    runtime.dispose();
  }
}

const deriveRestoredStarter = () => {
  const state = createGameState(109);
  const bus = createBus();
  const shipSystem = Object.assign({}, ships);
  const cargoSystem = Object.assign({}, cargo);
  const payload = JSON.parse(JSON.stringify({
    ownedShips: [{ defId: NEW_GAME.shipId, fittings: starterFittings }],
    cargo: { items: { cmdty_ore_iron: 10 }, capVolume: 40, capMass: 60 },
  }));
  state.player.ownedShips = payload.ownedShips;
  state.player.activeShipIndex = 0;
  state.player.cargo.items = payload.cargo.items;
  state.player.cargo.usedMass = 999; // prior-run cache must not survive restore recomputation
  const spec = makeShipEntitySpec(NEW_GAME.shipId, {
    isPlayer: true, player: state.player, fittings: starterFittings, pos: { x: 0, z: 0 },
  });
  const entity = { ...spec, id: 1, alive: true };
  state.playerId = entity.id;
  state.entities.set(entity.id, entity);
  state.entityList.push(entity);
  const ctx = { state, bus, helpers: {} };
  shipSystem.init(ctx);
  cargoSystem.init(ctx);
  bus.emit('save:loaded', {});
  return {
    cargoMass: entity.data.derived.cargoMass,
    operationalMass: entity.data.derived.operationalMass,
    spool: entity.data.derived.tetherSpoolMult,
    physicsMass: entity.physicsBody.mass,
  };
};
const restoredA = deriveRestoredStarter();
const restoredB = deriveRestoredStarter();
assert.deepEqual(restoredB, restoredA, 'save-like cargo restore derives the same mass/spool snapshot twice');
assert.deepEqual(restoredA, { cargoMass: 8, operationalMass: 40, spool: 1, physicsMass: 40 },
  'restored cargo items replace stale caches and the empty starter has the 1.0 spool');

async function runStarterTetherSeed(seed) {
  const state = createGameState(seed);
  const starter = getDerivedStats(NEW_GAME.shipId, starterFittings, {
    efficiencyMods: {}, cargo: { usedMass: 0 },
  });
  const owner = {
    id: 301, type: 'ship', alive: true, collides: true, radius: 14, mass: starter.operationalMass,
    physicsBody: {
      schemaVersion: 1, radius: 14, mass: starter.operationalMass,
      inertiaY: starter.flightModel.inertia, dynamic: true, ccd: true, material: 'ship', revision: 0,
    },
    maxSpeed: starter.maxSpeed,
    pos: { x: -30, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, data: { derived: starter },
  };
  const anchor = {
    id: 302, type: 'asteroid', alive: true, collides: true, radius: 11, mass: 640,
    physicsBody: {
      schemaVersion: 1, radius: 11, mass: 640, inertiaY: 6400,
      dynamic: false, ccd: false, material: 'asteroid', revision: 0,
    },
    pos: { x: 30, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, data: {},
  };
  const runtime = await createSg02DynamicBodyOwner({ fixedDt: 1 / 60, quantum: 1e-5, mode: 'rapier-dynamic' });
  try {
    runtime.syncFromEntities([owner, anchor]);
    const effective = attachmentModule.effectiveTetherBreak(standard, owner);
    const handle = runtime.createAttachment({
      attachmentId: `starter_seed_${seed}`, defId: standard.id,
      ownerId: owner.id, targetId: anchor.id,
      sourceWorld: { x: -30, y: 0, z: 0 }, targetWorld: { x: 30, y: 0, z: 0 },
      restLength: 60, break: effective, spring: standard.spring, tick: 0,
    });
    const tangentImpulse = 16 + state.rng() * 2;
    runtime.applyImpulse({ entityId: owner.id, impulse: { x: 0, y: 0, z: tangentImpulse } });
    for (let tick = 0; tick < 120; tick++) runtime.step(1 / 60);
    const telemetry = runtime.getAttachmentTelemetry({ physicsHandle: handle, tick: 120 });
    assert(telemetry, `seed ${seed}: starter tether remains live`);
    assert.equal(telemetry.breakRequested, false, `seed ${seed}: starter survives normal tangent load`);
    return {
      distance: Number(telemetry.distance.toFixed(6)),
      tension: Number(telemetry.tension.toFixed(6)),
      impulse: Number(telemetry.impulse.toFixed(6)),
      attachmentId: handle.attachmentId,
    };
  } finally {
    runtime.dispose();
  }
}
for (const seed of [47, 109]) {
  assert.deepEqual(await runStarterTetherSeed(seed), await runStarterTetherSeed(seed),
    `seed ${seed}: starter tether benchmark replays deterministically`);
}

{
  const stableEntity = {
    id: 390, type: 'ship', radius: 4, mass: 24,
    physicsBody: {
      schemaVersion: 1, radius: 4, mass: 24, inertiaY: 48,
      dynamic: true, ccd: true, material: 'ship', revision: 7,
      centerOfMass: { x: 0, y: 0, z: 0 }, attachmentPoints: [], thrusters: [],
    },
    data: {},
  };
  const originalSpec = stableEntity.physicsBody;
  assert.equal(syncDerivedPhysicsMass(stableEntity, 24, 48), originalSpec,
    'unchanged derived mass preserves the authored physicsBody object');
  assert.equal(stableEntity.physicsBody.revision, 7, 'unchanged derived mass preserves the revision');
  assert.equal(syncDerivedPhysicsMass(stableEntity, 36, 72), originalSpec,
    'changed mass mutates the existing save-safe physicsBody object');
  assert.equal(stableEntity.physicsBody.revision, 8, 'a real mass/inertia change revises exactly once');
}

{
  const make = (id, x) => ({
    id, type: 'ship', alive: true, collides: true, radius: 4, mass: 24,
    physicsBody: {
      schemaVersion: 1, radius: 4, mass: 24, inertiaY: 48,
      dynamic: true, ccd: true, material: 'ship', revision: 0,
    },
    pos: { x, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    data: { derived: { tetherSpoolMult: 1 } },
  });
  const owner = make(401, -50);
  const target = make(402, 50);
  const runtime = await createSg02DynamicBodyOwner({ fixedDt: 1 / 60, quantum: 1e-5, mode: 'rapier-dynamic' });
  const breakReceipts = [];
  const breakOrder = [];
  const bus = createBus();
  bus.on('tether:nearBreak', () => breakOrder.push({ type: 'warning', tick: state.tick }));
  bus.on('tether:broken', (payload) => { breakOrder.push({ type: 'broken', tick: state.tick }); breakReceipts.push(payload); });
  const state = createGameState(0x4d3154);
  state.entities.clear();
  state.entityList.length = 0;
  state.entities.set(owner.id, owner);
  state.entities.set(target.id, target);
  state.entityList.push(owner, target);
  const helpers = { combatPhysics: createSg02CombatPhysicsPort(runtime) };
  let kernel = null;
  try {
    runtime.syncFromEntities([owner, target]);
    kernel = createCombatKernel({ state, bus, helpers, registry: { get() { return null; } } });
    const created = kernel.attachments.create({
      defId: standard.id, ownerId: owner.id, targetId: target.id,
      sourceWorld: { x: -50, y: 0, z: 0 }, targetWorld: { x: 50, y: 0, z: 0 },
    });
    assert.equal(created.ok, true, 'canonical attachment service creates the rating-1 standard tether');
    const attachment = created.attachment;
    const physicalAttachment = runtime.attachments.get(attachment.id);
    assert(physicalAttachment, 'canonical create produces the SG-02 physical attachment');
    assert.deepEqual(
      [attachment.tetherPolicy.break.maxTension, attachment.tetherPolicy.break.maxImpulse],
      [physicalAttachment.break.maxTension, physicalAttachment.break.maxImpulse],
      'semantic telemetry and the physical attachment share one frozen break threshold source',
    );
    owner.data.derived.tetherSpoolMult = 6;
    assert.deepEqual(kernel.attachments.breakPolicy(attachment.id), attachment.tetherPolicy.break,
      'refitting while attached cannot change the active line policy; the next attachment gets the new rating');
    kernel.attachments.reel(attachment.id, -999, standard.minLength);
    for (let tick = 1; tick <= 90 && attachment.state === 'active'; tick++) {
      state.tick = tick;
      state.simTime = tick / 60;
      helpers.combatPhysics.applyImpulse({ entityId: owner.id, impulse: { x: -500000, y: 0, z: 0 }, tick });
      helpers.combatPhysics.applyImpulse({ entityId: target.id, impulse: { x: 500000, y: 0, z: 0 }, tick });
      runtime.step(1 / 60);
      kernel.postPhysics(1 / 60);
    }
    const traces = state.combat.trace.events.filter((event) => event.kind === 'attachment.broken' && event.attachmentId === attachment.id);
    assert.equal(attachment.state, 'active',
      'even an excessive thrust/reversal fixture cannot sever an ordinary standard Massline');
    assert.equal(attachment.breakReason, null, 'normal load never fabricates a threshold break reason');
    assert.equal(runtime.attachments.has(attachment.id), true, 'the physical SG-02 attachment remains live');
    assert.equal(breakReceipts.length, 0, 'normal load emits no tether:broken receipt');
    assert.deepEqual(breakOrder, [], 'normal load emits neither near-break warnings nor break receipts');
    assert.equal(traces.length, 0, 'normal load appends no attachment.broken trace');
    assert.equal(attachment.masslineRuntime?.integrity, 1, 'non-breaking load does not accumulate hidden integrity damage');
    assert.equal(attachment.masslineRuntime?.overloadS, 0, 'non-breaking load does not accumulate phantom break debt');
  } finally {
    if (kernel) kernel.dispose();
    runtime.dispose();
  }
}

console.log('M1 tether mass grounding checks OK');
