// SEED-SW-13 — a fitted gun sells levels 1 through 5. Each level shortens the cooldown
// the live weapons system writes, the receipt survives the wave boundary, and a maxed
// gun plus its named rigs surfaces one synthesis. Shelf stock and a sixth level do not.
// Seed 4242.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { SHIPS } from '../src/data/ships.js';
import { SURVIVAL_EVOLUTIONS, evolutionOffersFor } from '../src/data/survivalEvolutions.js';
import { weaponLevelOf } from '../src/data/swarmWeaponLevels.js';
import { fields } from '../src/systems/fields.js';
import { runSession } from '../src/systems/runSession.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { buildSlotList, makeShipEntitySpec, ships } from '../src/systems/ships.js';
import { survivalArena } from '../src/systems/survivalArena.js';
import { survivalDraft } from '../src/systems/survivalDraft.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { swarmElites } from '../src/systems/swarmElites.js';
import { weapons } from '../src/systems/weapons.js';

const SEED = 4242;
const ARENA = 'helios_core';
const GUN = 'wpn_pulse_laser_s';
const SHELF_GUN = 'wpn_snarl_s';

const CADENCE = SURVIVAL_EVOLUTIONS.find((row) => row.id === 'pulse_cadence');

function kestrelFittings() {
  const hull = SHIPS.find((ship) => ship.id === 'ship_kestrel');
  const slots = buildSlotList(hull);
  const fittings = slots.map((slot) => (slot.type === 'weapon' ? GUN : null));
  const utility = slots.findIndex((slot) => slot.type === 'utility');
  const named = CADENCE.consumes[0];
  if (utility >= 0) fittings[utility] = named;
  return { hull, slots, fittings };
}

function makeHarness() {
  const state = createGameState(SEED);
  const raw = createBus();
  const bus = {
    on: raw.on.bind(raw), off: raw.off.bind(raw), once: raw.once.bind(raw),
    emit(event, payload) { raw.emit(event, payload); },
  };
  const helpers = {
    hash32,
    mulberry32,
    spawnBudget: makeBudgetApi(state),
    combatPhysics: { applyImpulse() { return true; } },
    routeCombatDamage() { return { ok: true }; },
    spawnEntity(spec) {
      const entity = {
        ...spec, id: spec.id ?? state.nextEntityId++, alive: true, collides: true,
        flags: {}, data: { ...(spec.data || {}) },
        pos: { ...(spec.pos || {}) }, vel: { ...(spec.vel || {}) },
      };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
    getEntity(id) { return state.entities.get(id); },
  };
  const systems = {};
  const registry = { get: (name) => systems[name] || null };
  const ctx = { state, bus, helpers, registry };
  systems.ships = ships;
  systems.fields = fields;
  systems.swarmArena = swarmArena;
  systems.survivalDraft = survivalDraft;
  runSession.init(ctx);
  survivalWave.init(ctx);
  survivalRun.init(ctx);
  fields.init(ctx);
  ships.init(ctx);
  survivalDraft.init(ctx);
  swarmArena.init(ctx);
  swarmElites.init(ctx);
  survivalArena.init(ctx);
  weapons.init(ctx);
  state.spatialHash = null;
  state.mode = 'flight';
  const { fittings } = kestrelFittings();
  state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: fittings.slice() }];
  state.player.activeShipIndex = 0;
  state.player.moduleInventory = [
    { instanceId: 1, defId: CADENCE.consumes[1] },
    { instanceId: 2, defId: SHELF_GUN },
  ];
  const player = helpers.spawnEntity(makeShipEntitySpec('ship_kestrel', {
    isPlayer: true, team: 0, pos: { x: 400, z: 0 }, rot: 0, fittings,
  }));
  state.playerId = player.id;
  return { state, bus, player };
}

function openDraft(h, wave = 1, credits = 5000) {
  h.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: SEED, arenaId: ARENA });
  h.bus.emit('run:transitionRequested', { expectedPhase: 'loadout', nextPhase: 'draft', reason: 't', tick: 0 });
  h.state.run.wave = wave;
  h.state.run.credits = credits;
  return survivalDraft.currentOffers();
}

function levelRow(offers, level) {
  return offers.find((row) => row.service === 'weapon_level' && row.defId === GUN && row.weaponLevel === level);
}

function firedCooldown(h) {
  const gun = h.player.data.weapons.find((weapon) => weapon.defId === GUN);
  assert.ok(gun, 'the fitted pulse laser is on the hull the weapons system fires');
  gun._cooldown = 0;
  gun._heat = 0;
  h.state.mode = 'flight';
  h.state.input.fire = true;
  h.state.input.aimAngle = 0;
  if (!h.state.input.actions) h.state.input.actions = {};
  let shots = 0;
  const off = h.bus.on('combat:fire', (payload) => {
    if (payload && payload.ownerId === h.player.id && payload.weaponId === GUN) shots += 1;
  });
  weapons.update(1 / 60, h.state);
  if (typeof off === 'function') off();
  h.state.input.fire = false;
  return { cooldown: gun._cooldown, shots, rof: gun.rof };
}

test('seed 4242: fitted-gun levels change the live cooldown, survive the wave, and synthesize at five', () => {
  assert.ok(CADENCE, 'the shelf names the pulse cadence synthesis');
  assert.equal(CADENCE.requiresWeaponLevel.defId, GUN);
  assert.equal(CADENCE.requiresWeaponLevel.level, 5);
  assert.ok(CADENCE.consumes.length >= 2);
  assert.equal(CADENCE.consumes.includes(GUN), false, 'the gun is not spent');

  const h = makeHarness();
  const { slots, fittings } = kestrelFittings();
  let offers = openDraft(h);
  assert.equal(offers.some((row) => row.service === 'weapon_level' && row.defId === SHELF_GUN), false,
    'an unfitted gun has no level row');
  const first = levelRow(offers, 1);
  assert.ok(first, 'level 1 is for sale on the fitted gun');
  assert.equal(first.weaponLevel, 1);
  assert.equal(offers.some((row) => row.weaponLevel === 6), false, 'there is no sixth level');

  const prices = [];
  let slower = null;
  for (let level = 1; level <= 5; level += 1) {
    offers = survivalDraft.currentOffers();
    const row = levelRow(offers, level);
    assert.ok(row, `level ${level} is for sale`);
    if (prices.length > 0) assert.ok(row.price > prices[prices.length - 1], 'the price rises');
    prices.push(row.price);
    assert.equal(survivalDraft.resolvePick({ offerId: row.id }), true, `level ${level} purchase`);
    assert.equal(weaponLevelOf(h.state.run, GUN), level);
    if (level === 1) slower = firedCooldown(h);
    if (level === 4) {
      assert.equal(offers.concat(survivalDraft.currentOffers()).some((row) => row.id === 'evo_pulse_cadence'), false,
        'level 4 does not synthesize');
      const early = evolutionOffersFor({
        hullId: 'ship_kestrel', slots, fittings, moduleInventory: h.state.player.moduleInventory,
        modifiers: h.state.run.modifiers,
      });
      assert.equal(early.some((row) => row.id === 'evo_pulse_cadence'), false);
    }
  }

  offers = survivalDraft.currentOffers();
  const synthesis = offers.find((row) => row.id === 'evo_pulse_cadence');
  assert.ok(synthesis, 'level 5 plus the named rigs surfaces the synthesis');
  assert.equal(synthesis.defId, CADENCE.defId);
  assert.deepEqual(synthesis.consumes, CADENCE.consumes);
  assert.equal(offers.some((row) => row.service === 'weapon_level' && row.defId === GUN), false,
    'level 5 is the last row');
  assert.ok(h.state.player.ownedShips[0].fittings.includes(GUN), 'the gun stays fitted');

  const direct = evolutionOffersFor({
    hullId: 'ship_kestrel', slots, fittings, moduleInventory: h.state.player.moduleInventory,
    modifiers: h.state.run.modifiers,
  });
  assert.ok(direct.some((row) => row.id === 'evo_pulse_cadence'));

  h.bus.emit('run:transitionRequested', {
    expectedPhase: 'draft', nextPhase: 'wave_intro', reason: 'launch', tick: 30,
  });
  assert.equal(h.state.run.phase, 'wave_intro');
  assert.equal(weaponLevelOf(h.state.run, GUN), 5, 'the level rides the run across the wave boundary');
  assert.ok(h.state.run.modifiers.some((row) => row.kind === 'swarm_weapon_level' && row.defId === GUN && row.level === 5));

  ships.recomputeEntity(h.player.id);
  const faster = firedCooldown(h);
  assert.ok(slower.shots >= 1, 'level 1 fired through the weapons system');
  assert.ok(faster.shots >= 1, 'level 5 fired through the weapons system');
  assert.ok(faster.cooldown < slower.cooldown, 'level 5 cycles faster than level 1');
  assert.ok(faster.rof > slower.rof);

  weapons.destroy();
});
