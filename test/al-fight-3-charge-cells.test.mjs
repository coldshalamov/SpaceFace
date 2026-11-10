import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import { weapons } from '../src/systems/weapons.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { tumbleStates } from '../src/systems/tumbleStates.js';
import { stuntGrammar } from '../src/systems/stuntGrammar.js';
import { masslineThrow } from '../src/systems/masslineThrow.js';
import { tetherGameplay, isAttachable } from '../src/systems/tetherGameplay.js';
import { ships, fittingsFromDefaultModules, makeShipEntitySpec } from '../src/systems/ships.js';
import { save } from '../src/save/saveSystem.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { applyFeatureConfigToMaps, PRODUCTION_FEATURES, snapshotFeatureMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { isDirty, DIRTY } from '../src/core/dirtyJournal.js';
import { pendingStuntBodyIds } from '../src/combat/stuntEvidence.js';

// Focused deterministic Node verification, using solver-contact/movement fixtures.
// This is not an autonomous full-fight playthrough or a renderer inspection.
const DT = 1 / 60;
let previousFlags;
let sessions;
beforeEach(() => {
  previousFlags = snapshotFeatureMaps();
  applyFeatureConfigToMaps(PRODUCTION_FEATURES);
  sessions = [];
});
afterEach(() => {
  for (const h of sessions) {
    h.owner.kernel?.dispose();
    h.sim.registry.get('collisionConsequences').destroy();
    h.sim.registry.get('tumbleStates').destroy?.();
    h.sim.registry.get('masslineThrow').destroy();
    h.sim.registry.get('save')?.destroy();
    h.sim.registry.get('stuntGrammar')?.destroy();
    h.sim.registry.get('physics')?._sg02?.dispose();
    h.sim.dispose();
  }
  restoreFeatureMaps(previousFlags);
});

function harness({ native = false, persistence = false } = {}) {
  const sim = createSimulation({
    seed: 4242,
    runtimeConfig: { profileId: 'production', features: PRODUCTION_FEATURES },
    systems: [ships, combat, weapons, tumbleStates, collisionConsequences, masslineThrow,
      ...(native ? [physics, tetherGameplay] : []), ...(persistence ? [stuntGrammar, save] : [])],
    updateOrder: [weapons, combat, tumbleStates, collisionConsequences],
    helpers: native ? {} : { combatPhysics: { applyImpulse: () => true } },
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.ui.screenStack.length = 0;
  sim.registry.get('ships').newGame();
  const player = sim.spawn(makeShipEntitySpec(NEW_GAME.shipId, {
    isPlayer: true, team: 0, pos: { x: 0, z: 0 }, rot: 0,
    fittings: fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules),
  }));
  state.playerId = player.id;
  state.input.aimAngle = 0;
  state.input.actions = {};
  const h = { sim, state, bus, player, owner: sim.registry.get('combat'), births: [], pickups: [],
    pickupDirty: [], kills: [], fires: [], empty: [] };
  bus.on('entity:spawned', p => {
    if (p.entity.data?.payloadType === 'charge_cell') {
      h.births.push({ tick: state.tick, id: p.id, entity: p.entity });
    }
  });
  bus.on('pickup:collected', p => {
    if (p.kind === 'charge_cell') {
      h.pickupDirty.push(isDirty(state, state.playerId, DIRTY.COMBAT));
      h.pickups.push({ tick: state.tick, ...p });
    }
  });
  bus.on('entity:killed', p => h.kills.push(p));
  bus.on('combat:fire', p => { if (p.ownerId === state.playerId) h.fires.push(state.tick); });
  bus.on('toast', p => { if (p.text === 'Capacitor empty') h.empty.push(state.tick); });
  h.step = (count = 1) => sim.runTicks(count, DT);
  sessions.push(h);
  return h;
}

function hostile(h, overrides = {}) {
  return h.sim.spawn({
    type: 'ship', alive: true, team: 1, mass: 16, radius: 12,
    pos: { x: -400, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    hull: 1, hullMax: 30, shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0,
    flags: {}, ...overrides,
    data: { ai: { forcePlayerTarget: true }, combatProfileId: 'combat_profile_standard_ship',
      derived: { damageReductionMult: 1 }, runCohort: 'survival', runWave: h.state.run?.wave },
    ...(overrides.data ? { data: { ai: { forcePlayerTarget: true },
      combatProfileId: 'combat_profile_standard_ship', derived: { damageReductionMult: 1 }, ...overrides.data } } : {}),
  });
}

function announceThrow(h, body) {
  h.bus.emit('massline:throw', {
    releaseId: `massline:throw:${h.state.tick}:${body.id}`, payloadId: body.id,
    payloadSpeed: 90, mode: 'snap', tick: h.state.tick, time: h.state.simTime,
  });
}

function impact(h, a, b, speed = 90) {
  h.bus.emit('physics:impact', {
    consequenceKernelVersion: 1, aId: a.id, bId: b.id,
    impulse: 16 * speed, dp: 16 * speed, tick: h.state.tick,
    pos: { x: a.pos.x - 40, z: a.pos.z }, normal: { x: -1, z: 0 }, preSolveClosingSpeed: speed,
  });
  h.bus.flush();
}

function massKill(h, overrides = {}) {
  const before = h.births.length;
  const victim = hostile(h, overrides);
  const rock = h.sim.spawn({ type: 'asteroid', mass: 5000, radius: 40,
    pos: { x: -760, z: 0 }, hull: 4000, hullMax: 4000 });
  announceThrow(h, victim);
  impact(h, victim, rock);
  assert.equal(victim.alive, false, 'real throw/collision/kernel path kills the hostile');
  const cell = h.births.at(-1)?.entity;
  assert.equal(h.births.length, before + 1, 'eligible death creates exactly one new cell');
  assert.ok(cell, `physical kill creates a charge cell: ${JSON.stringify(h.kills.at(-1))}`);
  return { victim, rock, cell };
}

function stopRegen(h) {
  // Collection fixtures isolate pickup effects; paired tapes retain every production value.
  h.player.capRegen = 0;
  h.player.data.derived.continuousDrain = 0;
}

function overlap(h, cell) {
  h.player.pos.x = cell.pos.x;
  h.player.pos.z = cell.pos.z;
}

function tape(mixed) {
  const h = harness();
  assert.equal(h.player.capMax, 80);
  assert.equal(h.player.capRegen, 12);
  assert.equal(h.player.data.derived.continuousDrain, 12);
  let cell = null;
  for (let tick = 0; tick < 5400; tick++) {
    if (tick % 1800 === 0) {
      h.state.run = { kind: 'survival', phase: 'active', ruleset: 'gauntlet', wave: 4 + tick / 1800, seed: 4242 };
      h.bus.emit('run:wavePlanned', { wave: h.state.run.wave });
    }
    h.state.input.fire = tick % 600 < 300;
    if (mixed && tick % 600 === 300) cell = massKill(h).cell;
    if (cell && h.state.simTime >= cell.data.chargeCell.collectAfter) {
      overlap(h, cell);
      cell = null;
    }
    h.step();
  }
  if (mixed) {
    assert.equal(h.pickups.length, 9, 'each released interval collects its real mass-kill cell');
    assert.ok(h.pickups.every(p => p.chargeRestored > 0));
    assert.ok(h.pickups.slice(0, -1).every(p => h.fires.some(t => t > p.tick)), 'guns refire after recharge');
  }
  return { depletion: h.empty, births: h.births.map(b => [b.tick, b.id]),
    collections: h.pickups, finalCap: h.player.cap };
}

test('seed 4242, waves 4–6: paired repeatable 90-second tapes starve guns and sustain mass play', () => {
  const guns = tape(false), mixed = tape(true);
  assert.ok(guns.depletion.length >= 3, JSON.stringify(guns.depletion));
  assert.equal(new Set(guns.depletion.map(t => Math.floor(t / 600))).size, guns.depletion.length,
    'refusals are distinct trigger holds, rearmed by real releases');
  assert.ok(mixed.depletion.length <= 1, JSON.stringify(mixed.depletion));
  assert.deepEqual(tape(false), guns);
  assert.deepEqual(tape(true), mixed);
  console.log('R393 tapes:', JSON.stringify({ guns: guns.depletion, mixed: mixed.depletion,
    births: mixed.births.length, collections: mixed.collections.length,
    gunsFinalCap: guns.finalCap, mixedFinalCap: mixed.finalCap }));
});

test('physical terrain, structure, craft and whip deaths spawn immediately and exactly once per victim object', () => {
  const h = harness();
  h.player.cap = 20;
  const cap = h.player.cap;
  const { victim, cell } = massKill(h);
  assert.equal(h.births.length, 1);
  assert.equal(h.births[0].tick, h.state.tick, 'birth is synchronous, below the 15-tick limit');
  assert.equal(h.player.cap, cap, 'creation alone does not recharge');
  assert.equal(cell.data.chargeCell.charge, 60);
  assert.equal(cell.data.chargeCell.collectAfter, h.state.simTime + 0.25);
  assert.equal(cell.data.despawnAt, h.state.simTime + 30);
  assert.equal(cell.data.physicalCustodyOnly, true);
  assert.deepEqual(cell.data.salvagePool, {});
  assert.equal(cell.ownerId, null, 'canonical factory leaves the payload unowned');
  h.bus.emit('entity:killed', h.kills[0]);
  assert.equal(h.births.length, 1);
  // Even redelivery from inside spawn publication cannot duplicate this victim.
  h.bus.on('entity:spawned', p => { if (p.entity.data?.payloadType === 'charge_cell') h.bus.emit('entity:killed', h.kills[0]); });
  h.sim.helpers.removeEntity(victim.id, { immediate: true });
  const fresh = massKill(h, { id: victim.id }).victim;
  assert.notEqual(fresh, victim);
  assert.equal(fresh.id, victim.id);
  assert.equal(h.births.length, 2, 'a recycled numeric id belongs to a new eligible object');

  const drone = hostile(h, { type: 'drone', hull: 1 });
  h.bus.emit('tether:whipImpact', { victimId: drone.id, targetId: cell.id, rating: 'crushing',
    momentum: 72000, pos: { x: -400, z: 0 }, approach: { x: 1, z: 0 }, normal: { x: -1, z: 0 } });
  assert.equal(drone.alive, false);
  assert.equal(h.kills.at(-1).cause, 'massline_whip');
  assert.equal(h.births.length, 3);

  const thrown = hostile(h, { mass: 100, hull: 10000, hullMax: 10000 });
  const struck = hostile(h, { pos: { x: -450, z: 0 } });
  announceThrow(h, thrown);
  impact(h, thrown, struck, 180);
  assert.equal(struck.alive, false);
  assert.equal(h.kills.at(-1).presentation.cause, 'ship_collision');
  assert.equal(h.births.length, 4);

  const structureVictim = hostile(h);
  const structure = h.sim.spawn({ type: 'station', mass: 5000, radius: 40, hull: 4000, hullMax: 4000,
    pos: { x: -500, z: 0 }, physicsBody: { dynamic: false } });
  announceThrow(h, structureVictim);
  impact(h, structureVictim, structure);
  assert.equal(structureVictim.alive, false);
  assert.equal(h.births.length, 5);
});

test('direct projectiles/beams, prior throws, NPC/civilian/prop deaths and mismatched receipts cannot farm cells', () => {
  const h = harness();
  const unchanged = () => ({ credits: h.state.player.credits, cargo: structuredClone(h.state.player.cargo),
    hull: h.player.hull, armor: h.player.armorHp, shield: h.player.shield, cap: h.player.cap });
  const before = unchanged();
  for (const priorThrow of [false, true]) {
    const victim = hostile(h);
    if (priorThrow) announceThrow(h, victim);
    h.bus.emit('projectile:hit', { targetId: victim.id, ownerId: h.player.id,
      damage: 999, damageType: 'kinetic', weaponId: 'wpn_autocannon_s', pos: { ...victim.pos } });
    assert.equal(victim.alive, false);
    const beamVictim = hostile(h, { pos: { x: 100, z: 0 } });
    if (priorThrow) announceThrow(h, beamVictim);
    h.state.combat.beams = [{ ownerId: h.player.id, from: { x: 0, z: 0 }, to: { x: 200, z: 0 },
      dpsThisTick: 999, dmgType: 'energy', weaponId: 'wpn_pulse_laser_s' }];
    h.owner._applyBeamDamage(h.state);
    assert.equal(beamVictim.alive, false);
    h.state.combat.beams = [];
  }
  const npcVictim = hostile(h);
  const civilian = hostile(h, { team: 2, data: { ai: { passive: true } } });
  const prop = hostile(h, { type: 'payload' });
  const physical = { origin: { kind: 'massline_whip' } };
  h.owner.kill(npcVictim, 999, physical);
  h.owner.kill(civilian, h.player.id, physical);
  h.owner.kill(prop, h.player.id, physical);
  h.bus.emit('entity:killed', { ...h.kills[0], id: -999 });
  h.bus.emit('entity:killed', { ...h.kills[0], type: 'drone', presentation: { version: 1, playerCaused: true, cause: 'terrain_collision' } });
  assert.equal(h.births.length, 0);
  assert.deepEqual(unchanged(), before, 'mechanic adds no wallet, cargo, health or on-kill capacitor writes');
  const { cell } = massKill(h);
  h.owner.kill(cell, h.player.id, physical);
  assert.equal(cell.alive, false);
  assert.equal(h.births.length, 1, 'destroying an actual charge cell cannot create another');
  assert.deepEqual(unchanged(), before);
});

test('collection respects overlap, grace, flight, life, docking and attachment, then pays one receipt', () => {
  const h = harness(); stopRegen(h);
  h.player.cap = 1;
  const { cell } = massKill(h);
  h.step(16);
  assert.equal(cell.alive, true, 'outside overlap');
  overlap(h, cell);
  cell.data.chargeCell.collectAfter = h.state.simTime + 0.25;
  h.owner.update(DT, h.state);
  assert.equal(h.player.cap, 1, 'grace');
  h.step(16);
  assert.equal(h.player.cap, 61);
  assert.equal(cell.alive, false);
  assert.equal(h.pickups.length, 1);
  assert.deepEqual(h.pickupDirty, [true], 'collection marks combat dirty before publishing feedback');
  assert.deepEqual(h.pickups[0], { tick: h.pickups[0].tick, pickupId: cell.id, collectorId: h.player.id,
    kind: 'charge_cell', amount: 1, acceptedAmount: 1, rejectedAmount: 0, chargeRestored: 60,
    pos: { x: cell.pos.x, z: cell.pos.z } });
  h.owner.update(DT, h.state);
  h.bus.emit('entity:killed', h.kills[0]);
  assert.equal(h.pickups.length, 1);

  h.player.pos.x = 1000;
  const next = massKill(h).cell;
  h.step(16); overlap(h, next);
  for (const condition of ['menu', 'docked', 'dead', 'attached']) {
    h.state.mode = condition === 'menu' ? 'menu' : 'flight';
    h.player.flags.docked = condition === 'docked';
    h.player.alive = condition !== 'dead';
    h.state.combat.attachments.byId.fixture = { state: condition === 'attached' ? 'active' : 'broken',
      ownerId: 999, targetId: next.id };
    h.owner.update(DT, h.state);
    assert.equal(h.player.cap, 61, condition);
    assert.equal(next.alive, true, condition);
  }
  h.state.combat.attachments.byId.fixture.state = 'broken';
  h.player.cap = h.player.capMax;
  h.owner.update(DT, h.state);
  assert.equal(next.alive, true, 'full capacitor leaves cell available');
  h.player.cap -= 1;
  h.owner.update(DT, h.state);
  assert.equal(h.player.cap, h.player.capMax);
  assert.equal(h.pickups.at(-1).chargeRestored, 1, 'near-full collection clamps');
  assert.equal(h.pickups.length, 2);
});

async function latch(h, cell) {
  assert.ok(h.state.entityIndex.physicsDynamics.includes(cell));
  assert.equal(isAttachable(cell, h.player.id, h.state), true);
  const p = h.sim.registry.get('physics');
  assert.equal(await p.prepareBackend(h.state), true);
  const result = h.owner.kernel.attachments.create({ defId: 'tether_standard', ownerId: h.player.id, targetId: cell.id });
  assert.equal(result.ok, true, JSON.stringify(result));
  h.sim.registry.get('tetherGameplay').update(DT, h.state);
  assert.equal(h.state.player.tether.active, true);
  return result.attachment;
}

test('physical cell latches through the real service and throws with a fresh input edge without changing motion', async () => {
  const h = harness({ native: true }); stopRegen(h); h.player.cap = 1;
  const { cell } = massKill(h);
  const attachment = await latch(h, cell);
  cell.vel.x = 60; cell.vel.z = 20;
  overlap(h, cell);
  h.step(16);
  assert.equal(cell.alive, true, 'active line preserves physical custody');
  const velocity = { x: cell.vel.x, z: cell.vel.z };
  const throwOwner = h.sim.registry.get('masslineThrow');
  h.state.settings.gameplay.masslineReleaseAssist = 'off';
  h.state.player.targetId = null;
  h.state.input.actions.throwArm = false;
  throwOwner.update(DT, h.state);
  h.state.input.actions.throwArm = true;
  throwOwner.update(DT, h.state);
  assert.equal(h.state.massline2.throw.lastThrow.payloadId, cell.id);
  assert.equal(attachment.state, 'broken');
  assert.deepEqual({ x: cell.vel.x, z: cell.vel.z }, velocity);
  assert.ok(cell.data.chargeCell.collectAfter >= h.state.simTime + 0.5);
  h.step(29);
  assert.equal(cell.alive, true, 'throw grace prevents immediate re-collection');
  assert.equal(h.player.cap, 1);
  h.step(2);
  assert.equal(cell.alive, false);
  assert.equal(h.pickups.length, 1);
});

test('core expires cells at 1800 ticks; bounded oldest-first eviction preserves attached bodies', () => {
  const h = harness();
  const { cell } = massKill(h);
  h.step(1799);
  assert.equal(cell.alive, true);
  // Core accumulates floating time. Pin the final fixed-step boundary exactly rather than
  // asking an unrelated clock owner to treat 29.9999999999996 as 30.
  h.state.simTime = cell.data.despawnAt - DT;
  h.step();
  assert.equal(cell.alive, false, '30-second deadline uses core lifetime retirement');
  assert.equal(h.state.entities.has(cell.id), false);
  const created = [];
  for (let i = 0; i < 24; i++) created.push(massKill(h).cell);
  const ordered = created.slice().sort((a, b) => a.id - b.id);
  h.state.combat.attachments.byId.fixture = { state: 'active', ownerId: h.player.id, targetId: ordered[0].id };
  massKill(h);
  assert.equal(ordered[0].alive, true, 'attached oldest survives');
  assert.equal(ordered[1].alive, false, 'same-tick births evict by numeric id');
  assert.equal(h.state.entityIndex.payloads.filter(e => e.alive && e.data.payloadType === 'charge_cell').length, 24);
});

test('wave/run boundaries, reinitialization and New Game clear transients without duplicating subscriptions', () => {
  const h = harness();
  h.state.run = { kind: 'survival', phase: 'active', wave: 4 };
  const previous = massKill(h).cell;
  assert.equal(previous.data.runWave, 4);
  h.state.run.wave = 5;
  const current = massKill(h).cell;
  h.bus.emit('run:wavePlanned', { wave: 5 });
  assert.equal(previous.alive, false);
  assert.equal(current.alive, true);
  const ambient = massKill(h, { data: {} }).cell;
  assert.equal(ambient.data.runCohort, undefined);
  h.bus.emit('run:ended', {});
  assert.equal(current.alive, false);
  assert.equal(ambient.alive, true);
  h.owner.init(h.sim.registry.ctx);
  const before = h.births.length;
  massKill(h);
  assert.equal(h.births.length, before + 1);
  h.bus.emit('game:newGame');
  assert.equal(h.state.entityIndex.payloads.some(e => e.alive && e.data.payloadType === 'charge_cell'), false);
});

test('attached cell metadata round-trips through the real in-memory save/restore and collects once on Continue', async () => {
  const h = harness({ native: true, persistence: true }); stopRegen(h); h.player.cap = 1;
  const { cell } = massKill(h);
  await latch(h, cell);
  // A loaded physical constraint is the existing retention contract. Let the real native
  // spring observe the custody; an idle, unobserved attachment alone is not a save reference.
  cell.pos.x -= 100;
  for (let tick = 0; tick < 6; tick++) {
    h.sim.registry.get('physics').update(DT, h.state);
    h.step();
  }
  assert.ok(pendingStuntBodyIds(h.state).has(cell.id), 'real loaded attachment creates an existing save reference');
  const saver = h.sim.registry.get('save');
  const saved = JSON.parse(JSON.stringify(saver.serializeData()));
  const encoded = saved.entities.persistent.find(e => e.data?.payloadType === 'charge_cell');
  assert.ok(encoded, 'active attachment retains the otherwise transient payload');
  const metadata = structuredClone(encoded.data.chargeCell);
  assert.equal(saver._restore(saved, 'quick').restored, true);
  const restored = h.state.entityList.find(e => e.data?.payloadType === 'charge_cell');
  assert.ok(restored?.alive, 'save:loaded does not delete restored cells');
  assert.deepEqual(restored.data.chargeCell, metadata);
  assert.equal(restored.data.despawnAt, encoded.data.despawnAt);
  const player = h.state.entities.get(h.state.playerId);
  h.player = player; stopRegen(h);
  const attached = Object.values(h.state.combat.attachments.byId).find(a => a.state === 'active' && a.targetId === restored.id);
  assert.ok(attached, 'Continue restores real attachment custody');
  assert.equal(h.owner.kernel.attachments.cut(attached.id, player.id, 'tether_cut').ok, true);
  overlap(h, restored);
  h.step(16);
  assert.equal(player.cap, 61);
  assert.equal(h.pickups.length, 1);
  h.owner.update(DT, h.state);
  assert.equal(h.pickups.length, 1);
});

test('older fixture and unsupported/malformed metadata cannot invent recharge', () => {
  const h = harness({ persistence: true });
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/saves/continue-v18-free.json', import.meta.url), 'utf8'));
  assert.equal(h.sim.registry.get('save')._restore(fixture.data, 'quick').restored, true);
  h.player = h.state.entities.get(h.state.playerId); stopRegen(h);
  const cap = h.player.cap;
  h.owner.update(DT, h.state);
  assert.equal(h.player.cap, cap);
  assert.equal(h.pickups.length, 0);
  const { cell } = massKill(h);
  overlap(h, cell); h.state.simTime += 1;
  const original = structuredClone(cell.data);
  const variants = [
    data => { delete data.chargeCell; }, data => { data.chargeCell.version = 2; },
    data => { data.chargeCell.charge = NaN; }, data => { data.chargeCell.charge = 0; },
    data => { data.chargeCell.collectAfter = Infinity; }, data => { data.despawnAt = NaN; },
  ];
  h.player.cap = 1;
  for (const mutate of variants) {
    cell.data = structuredClone(original); mutate(cell.data);
    h.owner.update(DT, h.state);
    assert.equal(h.player.cap, 1);
    assert.equal(cell.alive, true);
  }
});
