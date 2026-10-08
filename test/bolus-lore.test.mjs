import { createDamageRouter } from '../src/combat/damage.js';
import { createCombatCatalog } from '../src/combat/runtime.js';
// Lore pass. One-line laws. Locked velocities stay in the cut and play tests.
import assert from 'node:assert/strict';
import test from 'node:test';
import { BOLUS_SECTOR_ID, planBolusLayout } from '../src/data/theBolus.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import {
  BOLUS_LORE,
  bolusAcidScale,
  bolusFilmBeat,
  bolusHeldSwing,
  bolusPearlOpens,
  bolusValveCount,
} from '../src/data/bolusLore.js';
import { bolusIsSwingRole } from '../src/data/bolusPlay.js';
import { tickBolus } from '../src/systems/theBolus.js';

test('film, acid scale, pearl, valves, and swing roles are pure', () => {
  assert.equal(bolusFilmBeat(0), 0);
  assert.equal(bolusFilmBeat(0.25), 1);
  assert.equal(bolusFilmBeat(0.5), 2);
  assert.equal(bolusFilmBeat(0.75), 3);
  assert.equal(bolusAcidScale({}), 1);
  assert.equal(bolusAcidScale({
    'bolus:valve:bolus_valve_0': true,
    'bolus:valve:bolus_valve_1': true,
    'bolus:valve:bolus_valve_2': true,
  }), 0.5);
  assert.equal(bolusPearlOpens(0.29), true);
  assert.equal(bolusPearlOpens(0.3), false);
  assert.equal(bolusValveCount({ 'bolus:valve:bolus_valve_0': true }), 1);
  assert.equal(bolusHeldSwing('lip'), true);
  assert.equal(bolusHeldSwing('ring'), true);
  assert.equal(bolusHeldSwing('tooth'), false);
  assert.equal(bolusIsSwingRole('lip'), true);
  assert.equal(bolusIsSwingRole('ring'), true);
  assert.equal(BOLUS_LORE.pearlMax, 0.3);
});

test('the cast grew by mouth lights, a lip, a scale, a pearl, and four motes', () => {
  const rows = planBolusLayout(1);
  assert.equal(rows.length, 99);
  assert.equal(rows.filter((row) => row.role === 'knob').length, 14);
  assert.equal(rows.filter((row) => row.key.startsWith('bolus_lantern_mouth_')).length, 3);
  assert.equal(rows.filter((row) => row.role === 'mote').length, 4);
  assert.ok(rows.some((row) => row.role === 'lip' && row.mass >= 1800 && row.dynamic === false));
  assert.ok(rows.some((row) => row.role === 'scale'));
  assert.ok(rows.some((row) => row.role === 'pearl'));
  for (const row of rows) {
    if (!row.dynamic) assert.ok(row.mass >= 1800, row.key);
  }
});

test('entry says the chart once, and a carried stitch is named', () => {
  const fresh = worldFor(pilot(0, 0), []);
  tickBolus(fresh.world, 0.1);
  tickBolus(fresh.world, 0.1);
  assert.equal(toasts(fresh, BOLUS_LORE.chart).length, 1);
  assert.equal(toasts(fresh, BOLUS_LORE.stitches).length, 0);

  const back = worldFor(pilot(0, 0), []);
  ensureAlienEcologyState(back.state).sectorFlags['bolus:valve:bolus_valve_0'] = true;
  tickBolus(back.world, 0.1);
  assert.equal(toasts(back, BOLUS_LORE.stitches).length, 1);
});

test('a taut swing in the trench does not drop hull, and three stitches halve the bite', () => {
  const knob = fauna('knob', 'bolus_knob', 400, 0);
  const held = worldFor(pilot(400, 0), [knob]);
  hold(held, knob);
  tickBolus(held.world, 0.1);
  tickBolus(held.world, 0.1);
  assert.equal(held.state.entities.get('p').hull, 80);
  assert.equal(toasts(held, BOLUS_LORE.wall).length, 1);
  assert.equal(toasts(held, BOLUS_LORE.acid).length, 1);

  const bare = worldFor(pilot(400, 0), []);
  const flags = ensureAlienEcologyState(bare.state).sectorFlags;
  flags['bolus:valve:bolus_valve_0'] = true;
  flags['bolus:valve:bolus_valve_1'] = true;
  flags['bolus:valve:bolus_valve_2'] = true;
  tickBolus(bare.world, 0.1);
  const unstitched = worldFor(pilot(400, 0), []);
  tickBolus(unstitched.world, 0.1);
  assert.ok(Math.abs((80 - bare.state.entities.get('p').hull) * 2
    - (80 - unstitched.state.entities.get('p').hull)) < 1e-9);
  assert.equal(toasts(bare, BOLUS_LORE.shy).length, 0);
});

test('a filmed pearl refuses and does not spend itself', () => {
  const pearl = fauna('pearl', 'bolus_pearl', -700, 1400);
  const filmed = worldFor(pilot(-700, 1400), [pearl]);
  ensureAlienEcologyState(filmed.state).exposure = 0.5;
  hold(filmed, pearl);
  for (let n = 0; n < 25; n++) tickBolus(filmed.world, 0.1);
  const flags = ensureAlienEcologyState(filmed.state).sectorFlags;
  assert.equal(flags['bolus:pearl'], undefined);
  assert.equal(pearl.data.bolus.told, true);
  assert.equal(filmed.state.player.cargo.items.cmdty_medical || 0, 0);
  assert.equal(toasts(filmed, BOLUS_LORE.pearlShut).length, 1);

  const clean = worldFor(pilot(-700, 1400), [fauna('pearl', 'bolus_pearl', -700, 1400)]);
  const stone = clean.state.entityList[0];
  hold(clean, stone);
  for (let n = 0; n < 25; n++) tickBolus(clean.world, 0.1);
  assert.equal(ensureAlienEcologyState(clean.state).sectorFlags['bolus:pearl'], true);
  assert.equal(clean.state.player.cargo.items.cmdty_medical, 1);
});

test('a mote in the cone flees and is not pinned like a louse', () => {
  const lit = fauna('mote', 'bolus_mote_0', 80, 0);
  const cone = worldFor(pilot(0, 0), [lit]);
  tickBolus(cone.world, 0.1);
  assert.ok(Math.abs(lit.vel.x - 22) < 1e-6, lit.vel.x);
  assert.equal(lit.vel.z, 0);
  assert.equal(lit.physicsBody.dynamic, true);

  const dark = fauna('mote', 'bolus_mote_1', 0, 80);
  const shade = worldFor(pilot(0, 0), [dark]);
  tickBolus(shade.world, 0.1);
  assert.ok(Math.abs(dark.vel.x - 8) < 1e-6);
  assert.notEqual(dark.vel.x, 0);
});

test('the lip tells the truth once, the drum names the burn, and the light names a pin', () => {
  const lip = fauna('lip', 'bolus_lip', 400, 0);
  const honest = worldFor(pilot(400, 0), [lip]);
  hold(honest, lip);
  tickBolus(honest.world, 0.1);
  tickBolus(honest.world, 0.1);
  assert.equal(honest.state.entities.get('p').hull, 80);
  assert.equal(toasts(honest, BOLUS_LORE.lip).length, 1);

  const lying = worldFor(pilot(400, 0), [fauna('lip', 'bolus_lip', 400, 0)]);
  lying.state.player.tether.phase = 'overload';
  hold(lying, lying.state.entityList[0]);
  tickBolus(lying.world, 0.1);
  assert.equal(toasts(lying, BOLUS_LORE.lip).length, 0);

  const drum = fauna('drum', 'bolus_drum_0', 300, -700);
  const chase = worldFor(pilot(300, -600, 60, 0), [drum]);
  ensureAlienEcologyState(chase.state).sectorFlags['bolus:fastFor'] = 2;
  tickBolus(chase.world, 0.1);
  assert.ok(Math.abs(Math.hypot(drum.vel.x, drum.vel.z) - 62) < 1e-6);
  assert.equal(toasts(chase, BOLUS_LORE.drum).length, 1);

  const louse = fauna('louse', 'bolus_louse_0', 100, 0);
  const pin = worldFor(pilot(0, 0), [louse]);
  tickBolus(pin.world, 0.1);
  tickBolus(pin.world, 0.1);
  assert.equal(louse.vel.x, 0);
  assert.equal(louse.vel.z, 0);
  assert.equal(toasts(pin, BOLUS_LORE.light).length, 1);
});

test('comb quiets the tooth, a cone bezoar blinks the slab, a ring holds the film', () => {
  const tooth = fauna('tooth', 'bolus_tooth', -180, -220);
  const quiet = worldFor(pilot(-180, -220), [tooth]);
  ensureAlienEcologyState(quiet.state).sectorFlags['bolus:acidQuietUntil'] = 100;
  hold(quiet, tooth);
  tickBolus(quiet.world, 0.1);
  assert.equal(quiet.state.entities.get('p').vel.x, 0);
  assert.equal(toasts(quiet, BOLUS_LORE.comb).length, 1);
  assert.equal(ensureAlienEcologyState(quiet.state).sectorFlags['bolus:toothYankUntil'], undefined);

  const stone = fauna('bezoar', 'bolus_bezoar_0', 100, 0);
  const grit = worldFor(pilot(0, 0), [stone]);
  hold(grit, stone);
  for (let n = 0; n < 11; n++) tickBolus(grit.world, 0.1);
  const gritFlags = ensureAlienEcologyState(grit.state).sectorFlags;
  assert.ok(gritFlags['bolus:hushUntil'] >= 3);
  assert.equal(toasts(grit, BOLUS_LORE.grit).length, 1);

  const ring = fauna('ring', 'bolus_ring', 0, 40);
  const pause = worldFor(pilot(0, 0), [ring]);
  hold(pause, ring);
  tickBolus(pause.world, 0.1);
  tickBolus(pause.world, 0.1);
  assert.equal(ensureAlienEcologyState(pause.state).exposure, 0);
  assert.equal(toasts(pause, BOLUS_LORE.ring).length, 1);
});

test('hush walk and a held knob reread the chart without moving the ship', () => {
  const walk = worldFor(pilot(0, 400), []);
  walk.state.simTime = 3;
  ensureAlienEcologyState(walk.state).sectorFlags['bolus:hushUntil'] = 20;
  tickBolus(walk.world, 0.1);
  assert.equal(walk.state.entities.get('p').vel.z, 0);
  assert.equal(toasts(walk, BOLUS_LORE.hush).length, 1);

  const knob = fauna('knob', 'bolus_knob', 0, 0);
  const reread = worldFor(pilot(0, 0), [knob]);
  ensureAlienEcologyState(reread.state).sectorFlags['bolus:hushUntil'] = 20;
  hold(reread, knob);
  tickBolus(reread.world, 0.1);
  tickBolus(reread.world, 0.1);
  assert.equal(toasts(reread, BOLUS_LORE.chart).length, 2);
  assert.equal(reread.state.entities.get('p').vel.x, 0);
  assert.equal(reread.state.entities.get('p').vel.z, 0);
});

test('an open iris sheds half a nerve sample, and film lines arrive once', () => {
  const open = worldFor(pilot(0, 0), [fauna('nerve', 'bolus_nerve', 0, 30)]);
  open.state.simTime = 3;
  hold(open, open.state.entityList[0]);
  for (let n = 0; n < 30; n++) tickBolus(open.world, 0.1);
  const openExp = ensureAlienEcologyState(open.state).exposure;
  assert.equal(ensureAlienEcologyState(open.state).sectorFlags['bolus:breathSample'], true);
  assert.equal(toasts(open, BOLUS_LORE.breath).length, 1);

  const shut = worldFor(pilot(0, 0), [fauna('nerve', 'bolus_nerve', 0, 30)]);
  hold(shut, shut.state.entityList[0]);
  for (let n = 0; n < 30; n++) tickBolus(shut.world, 0.1);
  const shutExp = ensureAlienEcologyState(shut.state).exposure;
  assert.ok(Math.abs(shutExp - openExp - 0.04) < 1e-9, `${shutExp} vs ${openExp}`);

  const filmed = worldFor(pilot(0, 0), []);
  ensureAlienEcologyState(filmed.state).exposure = 0.8;
  tickBolus(filmed.world, 0.1);
  tickBolus(filmed.world, 0.1);
  assert.equal(toasts(filmed, BOLUS_LORE.film[0]).length, 1);
  assert.equal(toasts(filmed, BOLUS_LORE.film[1]).length, 1);
  assert.equal(toasts(filmed, BOLUS_LORE.film[2]).length, 1);
  assert.equal(ensureAlienEcologyState(filmed.state).sectorFlags['bolus:filmBeat'], 3);
});

test('the scale names the hauler and pays nothing', () => {
  const scale = fauna('scale', 'bolus_scale', -140, -540);
  const bag = worldFor(pilot(-140, -540), [scale]);
  hold(bag, scale);
  for (let n = 0; n < 15; n++) tickBolus(bag.world, 0.1);
  assert.equal(ensureAlienEcologyState(bag.state).sectorFlags['bolus:haulerRead'], true);
  assert.equal(bag.state.player.cargo.items.cmdty_medical || 0, 0);
  assert.equal(toasts(bag, BOLUS_LORE.scale).length, 1);
  assert.equal(bag.state.entities.get('p').vel.x, 0);
  assert.equal(bag.state.entities.get('p').vel.z, 0);
});

function toasts(bag, text) {
  return bag.events.filter((event) => event.name === 'toast' && event.payload && event.payload.text === text);
}

function worldFor(player, faunaList) {
  const state = {
    simTime: 0,
    playerId: 'p',
    player: { tether: { phase: 'loaded' }, cargo: { items: {}, capVolume: 100, usedVolume: 0, usedMass: 0 } },
    world: { currentSectorId: BOLUS_SECTOR_ID },
    entities: new Map([['p', player]]),
    entityList: faunaList.slice(),
    combat: { attachments: { byId: {} } },
  };
  player.id = 'p';
  player.type = 'ship';
  ensureAlienEcologyState(state);
  const events = [];
  const bus = { emit(name, payload) { events.push({ name, payload }); } };
  const helpers = { routeCombatDamage: createDamageRouter({ state, bus, catalog: createCombatCatalog(), helpers: {} }, { schedule() {} }) };
  return {
    state,
    events,
    world: {
      state,
      bus,
      helpers,
      _sectorOrigin() { return { x: 0, z: 0 }; },
    },
  };
}

function hold(bag, entity) {
  bag.state.combat.attachments.byId.line = { state: 'active', ownerId: 'p', targetId: entity.id };
}

function pilot(x, z, vx = 0, vz = 0) {
  return {
    pos: { x, y: 0, z },
    vel: { x: vx, y: 0, z: vz },
    rot: 0,
    alive: true,
    hull: 80,
    hullMax: 80,
    shield: 0,
    flags: {},
  };
}

function fauna(role, key, x, z) {
  return {
    id: key,
    alive: true,
    pos: { x, y: 0, z },
    vel: { x: 0, y: 0, z: 0 },
    rot: 0,
    homeSectorId: BOLUS_SECTOR_ID,
    physicsBody: { dynamic: true, mass: 40, radius: 8 },
    data: {
      bolus: { role, key, anchorX: x, anchorZ: z, phase: 0, hold: 0, spent: false },
      ecology: { speciesId: `bolus_${role}` },
    },
  };
}
