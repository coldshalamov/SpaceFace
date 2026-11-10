// S1 � the Swarm feel profile. Gate semantics, the deploy-time Pull/Shove phase table,
// the dying window override, the materialization stamp, the contact-owner bound rule,
// and the fodder TTK contract. Every Adventure path must read unchanged.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { compactNativeAttestationTables } from '../src/save/nativeAttestationTables.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { dyingWindowS } from '../src/combat/lifecycle.js';
import { applyFieldLifecycle, fields } from '../src/systems/fields.js';
import { FIELD_DEFS } from '../src/data/fields.js';
import { swarmFeel, SWARM_FEEL_PROFILE, SWARM_FEEL_STAMP } from '../src/data/swarmFeelProfile.js';
import { applySwarmFeelSpec, materializeWaveBatch } from '../src/systems/waveMaterialization.js';
import { COMBAT_LAB_STARTER_PACKAGES } from '../src/data/combatLabSetups.js';
import { DOOR_PUBLIC_STARTERS } from '../src/data/survivalUnlocks.js';
import { WEAPONS } from '../src/data/weapons.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';

const DT = 1 / 60;
const ARENA = 'helios_core';

function swarmRun(phase = 'active') {
  return { kind: 'survival', ruleset: 'swarm', phase, wave: 1 };
}

test('swarmFeel resolves only inside a live Swarm run', () => {
  assert.equal(swarmFeel(null), null);
  assert.equal(swarmFeel({}), null);
  assert.equal(swarmFeel({ run: { kind: 'survival', ruleset: 'swarm', phase: 'inactive' } }), null);
  assert.equal(swarmFeel({ run: { kind: 'survival', ruleset: 'gauntlet', phase: 'active' } }), null);
  assert.equal(swarmFeel({ run: { kind: 'bounty', ruleset: 'swarm', phase: 'active' } }), null);
  const feel = swarmFeel({ run: swarmRun('active') });
  assert.equal(feel, SWARM_FEEL_PROFILE);
  assert.equal(swarmFeel({ run: swarmRun('draft') }), SWARM_FEEL_PROFILE,
    'the shop phase is still a live Swarm run � deploys between waves keep the profile');
  assert.throws(() => { feel.contact.impactTransferDv = 1; }, TypeError, 'profile is frozen');
});

test('dyingWindowS: the feel gate bursts light hulls and caps mediums, heavies unchanged', () => {
  const feel = SWARM_FEEL_PROFILE;
  // Fodder band (wasp 16t, zealot 17t, dart 20t): burst on the kill tick.
  assert.equal(dyingWindowS({ mass: 16, radius: 12, feel }), 0);
  assert.equal(dyingWindowS({ mass: 32, radius: 14, feel }), 0);
  // Medium (50t) caps at the profile window even with a big overkill-free law value.
  const medium = dyingWindowS({ mass: 50, radius: 18, feel });
  assert.ok(medium > 0 && medium <= feel.dying.mediumWindowS, `medium cap ${medium}`);
  // Heavy (300t) keeps the authored law � big deaths still earn their window.
  assert.equal(
    dyingWindowS({ mass: 300, radius: 30, feel }),
    dyingWindowS({ mass: 300, radius: 30 }),
    'heavy dying window unchanged by the profile',
  );
  // Adventure: no feel input �  the whole law is bit-identical.
  assert.equal(dyingWindowS({ mass: 16, radius: 12 }), 0.55, 'Adventure keeps the authored anchor');
  assert.ok(dyingWindowS({ mass: 16, radius: 12 }) > 0, 'baseline light window is authored');
});

test('applySwarmFeelSpec stamps the spec, overrides contact material, rewrites fodder stats', () => {
  const feel = SWARM_FEEL_PROFILE;
  const wasp = { hull: 55, hullMax: 55, shield: 25, shieldMax: 25, shieldRegenRate: 5, armorHp: 8, armorMax: 8, armorFlat: 0, data: {} };
  applySwarmFeelSpec(wasp, 'wasp_swarmer', feel);
  assert.equal(wasp.data[SWARM_FEEL_STAMP], true);
  assert.equal(wasp.physicsBody.contact.restitution, feel.contact.enemyRestitution);
  assert.equal(wasp.physicsBody.contact.restitutionCombine, 'average');
  assert.equal(wasp.hull, Math.round(55 * feel.fodder.hullMult));
  assert.equal(wasp.hullMax, wasp.hull);
  assert.equal(wasp.shield, 0);
  assert.equal(wasp.shieldMax, 0);
  assert.equal(wasp.shieldRegenRate, 0);
  assert.equal(wasp.armorHp, 0);
  assert.equal(wasp.armorMax, 0);

  const corsair = { hull: 220, hullMax: 220, shield: 90, shieldMax: 90, shieldRegenRate: 9, armorHp: 20, armorMax: 20, armorFlat: 1, data: {} };
  applySwarmFeelSpec(corsair, 'corsair_raider', feel);
  assert.equal(corsair.data[SWARM_FEEL_STAMP], true, 'non-fodder hulls are still stamped');
  assert.equal(corsair.hull, 220, 'non-fodder keeps authored hull � formidable is never HP');
  assert.equal(corsair.shield, 90);
});

function materializationCtx(state, spawned) {
  const budget = makeBudgetApi(state);
  return {
    state,
    helpers: {
      spawnBudget: budget,
      spawnEntity(spec) {
        const id = state.nextEntityId++;
        const entity = { ...spec, id, alive: true, pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 } };
        state.entities.set(id, entity);
        state.entityList.push(entity);
        spawned.push(entity);
        return entity;
      },
    },
  };
}

test('materializeWaveBatch stamps every Swarm hostile and leaves unswarmed specs untouched', () => {
  const state = createGameState(7);
  state.run = swarmRun('active');
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 400, z: 0 }, type: 'ship' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  const spawned = [];
  const ctx = materializationCtx(state, spawned);
  const receipt = materializeWaveBatch(ctx, {
    enemyId: 'wasp_swarmer', count: 3, wave: 1, seed: 7, packageIndex: 0, batchIndex: 0,
    gateGroup: 'front', swarm: true, ownerId: 'survival-wave:test',
  });
  assert.equal(receipt.admitted, 3);
  for (const e of spawned) {
    assert.equal(e.data[SWARM_FEEL_STAMP], true);
    assert.equal(e.physicsBody.contact.restitution, SWARM_FEEL_PROFILE.contact.enemyRestitution);
    assert.equal(e.shield, 0);
    assert.equal(e.armorHp, 0);
    assert.ok(e.hull <= Math.round(55 * SWARM_FEEL_PROFILE.fodder.hullMult));
  }

  const stateAdventure = createGameState(7);
  stateAdventure.entities.set(player.id, { ...player });
  stateAdventure.entityList.push({ ...player });
  stateAdventure.playerId = player.id;
  const adventureSpawned = [];
  const receiptA = materializeWaveBatch(materializationCtx(stateAdventure, adventureSpawned), {
    enemyId: 'wasp_swarmer', count: 2, wave: 1, seed: 7, packageIndex: 0, batchIndex: 0,
    ownerId: 'test',
  });
  assert.equal(receiptA.admitted, 2);
  for (const e of adventureSpawned) {
    assert.notEqual(e.data[SWARM_FEEL_STAMP], true, 'no run �  no stamp');
    assert.ok(e.hull > 20, 'Adventure wasp keeps its authored hull');
  }
});

test('Swarm field deploy registers the profile phase table and profile cooldown', () => {
  const state = createGameState(11);
  state.run = swarmRun('active');
  const player = { id: state.nextEntityId++, alive: true, type: 'ship', pos: { x: 0, z: 0 }, rot: 0, radius: 6, team: 0 };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  const emitted = [];
  const bus = { on: () => () => {}, off: () => {}, emit: (e, p) => emitted.push({ event: e, payload: p }) };
  const sys = Object.create(fields);
  sys.init({
    state, bus,
    helpers: {
      spawnEntity(spec) {
        const id = state.nextEntityId++;
        const e = { ...spec, id, alive: true };
        state.entities.set(id, e);
        state.entityList.push(e);
        return e;
      },
    },
  });
  sys._deployRadial(state, state.fields, 'well');
  const fieldId = Object.keys(state.fields.deployed)[0];
  const dep = state.fields.deployed[fieldId];
  assert.ok(dep && dep.swarmFeelPhases, 'the deployed receipt carries the phase table');
  assert.equal(dep.swarmFeelPhases.punchS, SWARM_FEEL_PROFILE.pull.yankS);
  assert.equal(dep.swarmFeelPhases.punchStrengthMult, SWARM_FEEL_PROFILE.pull.yankStrengthMult);
  const kernelRec = sys._kernel.get(fieldId);
  assert.equal(kernelRec.swarmFeelPhases, undefined,
    'the kernel record stays normalized � phases live on the deployed receipt');
  assert.equal(state.fields.cooldowns.well, state.simTime + SWARM_FEEL_PROFILE.pull.cooldownS,
    'Swarm pull recharges on the profile cooldown');
  assert.equal(kernelRec.expireAt, state.simTime + SWARM_FEEL_PROFILE.pull.yankS + SWARM_FEEL_PROFILE.pull.holdS,
    'the yank-hold well expires after its two beats');

  const adventure = createGameState(11);
  adventure.entities.set(player.id, { ...player, pos: { x: 0, z: 0 } });
  adventure.entityList.push({ ...player });
  adventure.playerId = player.id;
  const sysA = Object.create(fields);
  sysA.init({
    state: adventure, bus,
    helpers: {
      spawnEntity(spec) {
        const id = adventure.nextEntityId++;
        const e = { ...spec, id, alive: true };
        adventure.entities.set(id, e);
        adventure.entityList.push(e);
        return e;
      },
    },
  });
  sysA._deployRadial(adventure, adventure.fields, 'well');
  const depA = Object.values(adventure.fields.deployed)[0];
  assert.equal(depA.swarmFeelPhases, undefined, 'Adventure well keeps the authored law');
  assert.equal(adventure.fields.cooldowns.well, adventure.simTime + FIELD_DEFS.well.cooldownS);
});

test('Swarm deployed phases: well yank� hold, repulsor punch� fading berm', () => {
  const feel = SWARM_FEEL_PROFILE;
  const wellDef = FIELD_DEFS.well;
  const repDef = FIELD_DEFS.repulsor;
  const make = () => {
    const state = createGameState(11);
    state.run = swarmRun('active');
    const player = { id: state.nextEntityId++, alive: true, type: 'ship', pos: { x: 0, z: 0 }, rot: 0, radius: 6, team: 0 };
    state.entities.set(player.id, player);
    state.entityList.push(player);
    state.playerId = player.id;
    const bus = { on: () => () => {}, off: () => {}, emit: () => {} };
    const sys = Object.create(fields);
    sys.init({
      state, bus,
      helpers: {
        spawnEntity(spec) {
          const id = state.nextEntityId++;
          const e = { ...spec, id, alive: true };
          state.entities.set(id, e);
          state.entityList.push(e);
          return e;
        },
      },
    });
    return { state, sys };
  };

  const { state, sys } = make();
  sys._deployRadial(state, state.fields, 'well');
  const wellId = Object.keys(state.fields.deployed)[0];
  const deployAt = state.simTime;
  // Mid-yank: 3x strength, 0.35x damping � the convergence spike.
  sys._applySwarmDeployedPhases(state, state.fields, deployAt + feel.pull.yankS * 0.5);
  let rec = sys._kernel.get(wellId);
  assert.ok(Math.abs(rec.strength - wellDef.strength * feel.pull.yankStrengthMult) < 1e-9);
  assert.ok(Math.abs(rec.damping - wellDef.damping * feel.pull.yankDampingMult) < 1e-9);
  // Hold: today's authored law.
  sys._applySwarmDeployedPhases(state, state.fields, deployAt + feel.pull.yankS + 0.5);
  rec = sys._kernel.get(wellId);
  assert.ok(Math.abs(rec.strength - wellDef.strength) < 1e-9);
  assert.ok(Math.abs(rec.damping - wellDef.damping) < 1e-9);

  const { state: s2, sys: sys2 } = make();
  sys2._deployRadial(s2, s2.fields, 'repulsor');
  const repId = Object.keys(s2.fields.deployed)[0];
  const at = s2.simTime;
  sys2._applySwarmDeployedPhases(s2, s2.fields, at + 0.1);
  let rec2 = sys2._kernel.get(repId);
  assert.ok(Math.abs(rec2.strength - repDef.strength * feel.shove.punchStrengthMult) < 1e-9);
  sys2._applySwarmDeployedPhases(s2, s2.fields, at + feel.shove.punchS + feel.shove.bermS * 0.5);
  rec2 = sys2._kernel.get(repId);
  assert.ok(rec2.strength < repDef.strength && rec2.strength > 0, 'berm fades through its beat');
  sys2._applySwarmDeployedPhases(s2, s2.fields, at + feel.shove.punchS + feel.shove.bermS - 1e-6);
  rec2 = sys2._kernel.get(repId);
  assert.ok(rec2.strength < repDef.strength * 0.05, 'berm is spent at the end');
});

test('applyFieldLifecycle keeps the ordinary ramp for unstamped records', () => {
  const wellDef = FIELD_DEFS.well;
  const ordinary = { kind: 'well', createdAt: 5, expireAt: 5 + wellDef.durationS, strength: wellDef.strength, damping: wellDef.damping };
  applyFieldLifecycle([ordinary], 5 + 0.2); // inside the 0.4 s windup
  assert.ok(ordinary.strength < wellDef.strength, 'windup ramp preserved for ordinary fields');
});

test('contact owner: the bowling-pin bound only rises for projectile partners at real impacts', async () => {
  const owner = await createSg02DynamicBodyOwner();
  owner.tick = 100;
  const contact = SWARM_FEEL_PROFILE.contact;
  const stamped = (id) => ({ entity: { id, data: { [SWARM_FEEL_STAMP]: true } }, _tumbling: false, expected: { vx: 0, vz: 0 } });
  const victim = stamped('victim');
  const thrower = { entity: { id: 'thrower', data: {} }, _tumbling: false, _impulseStampTick: 98, expected: { vx: 150, vz: 0 } };
  owner.records = new Map([['victim', victim], ['thrower', thrower]]);

  owner._stepContactReceipts = [{ aId: 'victim', bId: 'thrower', preSolveClosingSpeed: 60 }];
  assert.equal(owner._victimDvBound(victim), contact.impactTransferDv,
    'a thrown partner at a real impact raises the victim bound');

  owner._stepContactReceipts[0].preSolveClosingSpeed = contact.impactMinClosing - 1;
  assert.equal(owner._victimDvBound(victim), 40, 'a soft brush keeps the recovery cap');

  thrower._impulseStampTick = 98 - Math.round(contact.thrownProvenanceS * 60) - 5;
  owner._stepContactReceipts[0].preSolveClosingSpeed = 60;
  assert.equal(owner._victimDvBound(victim), 40, 'stale impulse provenance does not count');

  thrower._impulseStampTick = 98;
  thrower._tumbling = true;
  assert.equal(owner._victimDvBound(victim), contact.impactTransferDv, 'tumbling partners qualify');
  thrower._tumbling = false;

  victim._tumbling = true;
  owner._stepContactReceipts = [];
  assert.equal(owner._victimDvBound(victim), contact.impactTransferDv, 'the projectile itself keeps the bound');
  victim._tumbling = false;

  const adventure = { entity: { id: 'adventure', data: {} }, _tumbling: false, expected: { vx: 0, vz: 0 } };
  owner.records.set('adventure', adventure);
  owner._stepContactReceipts = [{ aId: 'adventure', bId: 'thrower', preSolveClosingSpeed: 60 }];
  assert.equal(owner._victimDvBound(adventure), 40, 'unstamped bodies keep the Adventure cap');
});

test('every public starter kit kills fodder inside the profile budget', () => {
  const byWeapon = new Map(WEAPONS.map((w) => [w.id, w]));
  const byEnemy = new Map(ENEMY_TYPES.map((e) => [e.id, e]));
  const packagesById = new Map(COMBAT_LAB_STARTER_PACKAGES.map((p) => [p.id, p]));
  const table = [];
  for (const kitId of DOOR_PUBLIC_STARTERS) {
    const pkg = packagesById.get(kitId);
    assert.ok(pkg, `kit ${kitId} resolves to a starter package`);
    const mount = pkg.loadout.filter((m) => String(m.defId).startsWith('wpn_'))
      .sort((a, b) => a.slotIndex - b.slotIndex)[0];
    const weapon = byWeapon.get(mount && mount.defId);
    assert.ok(weapon && weapon.dps > 0, `kit ${kitId} mounts a real gun`);
    for (const enemyId of SWARM_FEEL_PROFILE.fodder.ids) {
      const def = byEnemy.get(enemyId);
      const hull = Math.max(1, Math.round(def.hull * SWARM_FEEL_PROFILE.fodder.hullMult));
      const ttk = hull / weapon.dps;
      table.push({ kit: kitId, weapon: weapon.id, enemy: enemyId, ttk: +ttk.toFixed(3) });
      assert.ok(ttk <= SWARM_FEEL_PROFILE.fodder.killSAtMidRange,
        `${kitId} (${weapon.id}, ${weapon.dps} dps) kills ${enemyId} in ${ttk.toFixed(3)}s � over the ${SWARM_FEEL_PROFILE.fodder.killSAtMidRange}s bar`);
    }
  }
  // TTK table for the commit record � printed so the tuning note ships with the numbers.
  console.table(table);
});

test('full run: wave-one hostiles materialize stamped through the real pipeline', () => {
  const state = createGameState(7);
  const raw = createBus();
  const bus = { on: raw.on.bind(raw), off: raw.off.bind(raw), once: raw.once.bind(raw), emit: raw.emit.bind(raw) };
  const budget = makeBudgetApi(state);
  const spawned = [];
  const helpers = {
    spawnBudget: budget,
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = { ...spec, id, alive: true, pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 } };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 400, z: 0 }, type: 'ship' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  const ctx = { state, bus, helpers };
  runSession.init(ctx);
  survivalWave.init(ctx);
  survivalRun.init(ctx);

  const tickRun = (n = 1) => {
    for (let i = 0; i < n; i++) {
      survivalWave.update(DT);
      survivalRun.update(DT);
    }
  };
  state.mode = 'loading';
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: 7, arenaId: ARENA });
  bus.emit('run:loadoutReady', {});
  bus.emit('run:openingPrepareRequested', {});
  assert.equal(state.run.phase, 'draft', 'a Swarm opening stops at the armory');
  bus.emit('run:draftResolved', {});
  tickRun(1);
  bus.emit('run:waveIntroComplete', {});
  tickRun(1);
  assert.equal(state.run.phase, 'active');
  assert.ok(spawned.length > 0, 'wave one materialized');
  const stamped = spawned.filter((e) => e.data && e.data[SWARM_FEEL_STAMP] === true);
  assert.ok(stamped.length > 0, 'hostiles carry the profile stamp');
});

// Native owner seams: exercise receipt production and persistence, not just the bound helper.
function feelCraft(id, x, stamped = true) {
  return {
    id, occupantGeneration: id, type: 'ship', alive: true, radius: 6, mass: 24,
    pos: { x, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    data: stamped ? { [SWARM_FEEL_STAMP]: true } : {},
    physicsBody: { schemaVersion: 1, radius: 6, mass: 24, inertiaY: 48,
      dynamic: true, material: 'ship', ccd: false },
  };
}

async function nativeFeelPair(t, stampedPartner = true) {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  t.after(() => owner.dispose());
  const entities = [feelCraft(1, 0), feelCraft(2, 500, stampedPartner)];
  owner.syncFromEntities(entities);
  owner.step(DT);
  owner.drainContactImpacts();
  return { owner, entities };
}

function capturePair(owner) {
  const [a, b] = [owner.records.get(1), owner.records.get(2)];
  const queue = owner._eventQueue;
  owner._eventQueue = { drainContactForceEvents(cb) {
    cb({ collider1: () => a.colliders[0].handle, collider2: () => b.colliders[0].handle,
      totalForceMagnitude: () => 6e6, maxForceDirection: () => ({ x: 1, y: 0, z: 0 }) });
  } };
  try { return owner._captureContactImpacts()[0]; }
  finally { owner._eventQueue = queue; }
}

test('contact receipts keep the overlap cap until a stamped victim sees a real projectile impact', async (t) => {
  const { owner } = await nativeFeelPair(t);
  const [a, b] = [owner.records.get(1), owner.records.get(2)];
  a._impulseStampTick = b._impulseStampTick = owner.tick;
  let receipt = capturePair(owner);
  assert.equal(receipt.preSolveClosingSpeed, 0);
  assert.equal(receipt.impulse, 24 * 40, 'soft thrown contacts cannot inflate the damage receipt');
  b.expected.vx = -60;
  receipt = capturePair(owner);
  assert.equal(receipt.preSolveClosingSpeed, 60);
  assert.equal(receipt.impulse, 24 * SWARM_FEEL_PROFILE.contact.impactTransferDv);
  b.expected.vx = 0;
  b._tumbling = true;
  receipt = capturePair(owner);
  assert.equal(receipt.impulse, 24 * 40, 'a tumbling partner still needs a real impact on the stamped victim');
  delete a.entity.data[SWARM_FEEL_STAMP];
  receipt = capturePair(owner);
  assert.equal(receipt.impulse, 24 * 160, 'unstamped bodies retain the old tumble-pair receipt semantics');
});

test('throw provenance ignores zero impulses and expires on the same tick in receipts and recovery', async (t) => {
  const { owner, entities } = await nativeFeelPair(t);
  queuePhysicsImpulse(entities[1], { x: 0, y: 0, z: 0 });
  owner.step(DT);
  owner.drainContactImpacts();
  const a = owner.records.get(1), b = owner.records.get(2);
  const contact = SWARM_FEEL_PROFILE.contact;
  assert.equal(owner._swarmProjectilePartner(b, contact), false, 'a no-op did not throw the body');
  const stamp = owner.tick;
  a._impulseStampTick = b._impulseStampTick = stamp;
  b.expected.vx = -60;
  owner.tick = stamp + Math.round(contact.thrownProvenanceS * 60) - 1;
  assert.equal(capturePair(owner).impulse, 24 * contact.impactTransferDv, 'last eligible solve');
  owner.tick += 1;
  assert.equal(capturePair(owner).impulse, 24 * 40, 'the next solve cannot use expired provenance');
  owner.tick += 1; // the post-solve recovery sees the completed tick
  owner._stepContactReceipts = [{ aId: 1, bId: 2, preSolveClosingSpeed: 60 }];
  assert.equal(owner._victimDvBound(a), 40);
  b._impulseStampTick = owner.tick + 1;
  assert.equal(owner._victimDvBound(a), 40, 'future provenance cannot qualify');
});

test('recent throws survive native canonicalization and scalar reconstruction without refreshing their age', async (t) => {
  const { owner, entities } = await nativeFeelPair(t, false);
  queuePhysicsImpulse(entities[1], { x: 2400, y: 0, z: 0 });
  owner.step(DT);
  owner.drainContactImpacts();
  const stamp = owner.records.get(2)._impulseStampTick;
  const saved = owner.exportWorldSnapshot();
  assert.ok(saved);
  assert.ok(compactNativeAttestationTables(saved), 'throw metadata stays inside the native save envelope');
  assert.equal(owner.canonicalizeWorldSnapshot(saved), true);
  assert.equal(owner.records.get(2)._impulseStampTick, stamp, 'exact adoption retains the impulse clock');
  const elapsed = owner.tick - stamp;
  for (const paced of [false, true]) {
    const options = { contactEpisodeSnapshot: saved, contactEpisodeTick: saved.tick };
    if (paced) for (const _ of owner.rebuildWorldFromEntitiesSteps(entities, options)) { /* drain paced rebuild */ }
    else owner.rebuildWorldFromEntities(entities, options);
    assert.equal(owner.tick - owner.records.get(2)._impulseStampTick, elapsed, 'fallback carries age into its new owner clock');
    owner._stepContactReceipts = [{ aId: 1, bId: 2, preSolveClosingSpeed: 60 }];
    assert.equal(owner._victimDvBound(owner.records.get(1)), SWARM_FEEL_PROFILE.contact.impactTransferDv);
    owner._stepContactReceipts = null;
  }
});
