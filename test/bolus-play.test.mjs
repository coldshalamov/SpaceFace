import { createDamageRouter } from '../src/combat/damage.js';
import { createCombatCatalog } from '../src/combat/runtime.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
// Play pass on The Bolus. Locked cut velocities stay in bolus-cut.test.mjs.
import assert from 'node:assert/strict';
import test from 'node:test';
import { BOLUS_SECTOR_ID, bolusIrisOpenAmount } from '../src/data/theBolus.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { RECIPES } from '../src/data/audioRecipes.js';
import {
  bolusCoughDue,
  bolusCoughGap,
  bolusCoughOffset,
  bolusCrestZ,
  bolusFloaterKind,
  bolusInBerth,
  bolusIrisShutter,
  bolusNurseryRadius,
  bolusThreadZ,
  bolusToothSlips,
} from '../src/data/bolusPlay.js';
import { tickBolus } from '../src/systems/theBolus.js';

test('shutter, thread, crest, cough gap, and slip are pure', () => {
  assert.equal(bolusIrisOpenAmount(0), 0);
  assert.equal(bolusIrisOpenAmount(3), 1);
  assert.equal(bolusIrisOpenAmount(8), 0);
  assert.equal(bolusIrisShutter(0), 0);
  assert.equal(bolusIrisShutter(3), 1);
  assert.equal(bolusIrisShutter(7.2), 0.35);
  assert.equal(bolusIrisShutter(8), 0);
  assert.equal(bolusThreadZ(3, 0, 0, 400), 0);
  assert.equal(bolusThreadZ(3, 30, 0, 400), 24);
  assert.equal(bolusThreadZ(7.2, 30, 0, 400), 12);
  assert.equal(bolusThreadZ(3, 30, -960, 400), 0);
  assert.equal(bolusCrestZ(0), 46);
  assert.equal(bolusCrestZ(-960), 56);
  assert.equal(bolusCoughDue(-960, 1173, false, false), true);
  assert.equal(bolusCoughDue(-960, 1173, true, false), false);
  assert.equal(bolusCoughDue(0, 1173, false, false), false);
  assert.equal(bolusCoughGap(false), 0);
  assert.equal(bolusCoughGap(true), 48);
  assert.equal(bolusCoughOffset(true, 'cough_crease'), 48);
  assert.equal(bolusCoughOffset(true, 'cough_lip'), -48);
  assert.equal(bolusToothSlips('overload'), true);
  assert.equal(bolusToothSlips('loaded'), false);
  assert.equal(bolusNurseryRadius(false), 30);
  assert.equal(bolusNurseryRadius(true), 12);
  assert.equal(bolusFloaterKind(0, -960), 'drift');
  assert.equal(bolusFloaterKind(0.3, 0), 'heavy');
  assert.equal(bolusFloaterKind(0.4, -960), 'wake');
  assert.equal(bolusInBerth(-980, -900), true);
  assert.equal(bolusInBerth(0, 0), false);
});

test('tooth slips on a tight cable and still bites when loaded', () => {
  const tooth = fauna('tooth', 'bolus_tooth', -180, -220);
  const slip = worldFor(pilot(-180, -220), [tooth]);
  slip.state.player.tether.phase = 'overload';
  slip.state.combat.attachments.byId.line = { state: 'active', ownerId: 'p', targetId: tooth.id };
  tickBolus(slip.world, 0.1);
  assert.equal(slip.state.entities.get('p').vel.x, 0);
  assert.ok(slip.events.some((event) => event.payload && event.payload.id === 'bolus_slip'));
  tickBolus(slip.world, 0.1);
  assert.equal(slip.state.entities.get('p').vel.x, 0);

  const bite = worldFor(pilot(-180, -220), [fauna('tooth', 'bolus_tooth', -180, -220)]);
  const bitten = bite.state.entityList[0];
  bite.state.player.tether.phase = 'loaded';
  bite.state.combat.attachments.byId.line = { state: 'active', ownerId: 'p', targetId: bitten.id };
  tickBolus(bite.world, 0.1);
  assert.equal(bite.state.entities.get('p').vel.x, 160);
  assert.ok(bite.events.some((event) => event.payload && event.payload.id === 'bolus_tooth'));
});

test('iris breath and thread do not move a ship that is sitting still', () => {
  const still = worldFor(pilot(0, 400), []);
  still.state.simTime = 3;
  tickBolus(still.world, 0.1);
  assert.equal(still.state.entities.get('p').vel.z, 0);
  assert.ok(still.events.some((event) => event.payload && event.payload.id === 'bolus_breath'));
  assert.equal(still.events.some((event) => event.payload && event.payload.id === 'bolus_thread'), false);

  const moving = worldFor(pilot(0, 400, 30, 0), []);
  moving.state.simTime = 3;
  tickBolus(moving.world, 0.1);
  assert.equal(moving.state.entities.get('p').vel.z, 24);
  tickBolus(moving.world, 0.1);
  assert.equal(moving.state.entities.get('p').vel.z, 24);
  assert.equal(moving.events.filter((event) => event.payload && event.payload.id === 'bolus_thread').length, 1);

  const late = worldFor(pilot(0, 400, 30, 0), []);
  late.state.simTime = 7.2;
  tickBolus(late.world, 0.1);
  assert.equal(late.state.entities.get('p').vel.z, 12);
});

test('lane crest is harder, gutter crest stays 46, cough spits once', () => {
  const lane = worldFor(pilot(-960, 0), []);
  tickBolus(lane.world, 0.1);
  lane.state.entities.get('p').vel.z = 0;
  lane.state.simTime = 12;
  tickBolus(lane.world, 0.1);
  assert.equal(lane.state.entities.get('p').vel.z, 56);

  const gutter = worldFor(pilot(0, 0), []);
  tickBolus(gutter.world, 0.1);
  gutter.state.simTime = 12;
  tickBolus(gutter.world, 0.1);
  assert.equal(gutter.state.entities.get('p').vel.z, 46);

  const spit = worldFor(pilot(-960, 1200, 0, 40), []);
  tickBolus(spit.world, 0.1);
  assert.equal(spit.state.entities.get('p').vel.z, 80);
  const flags = ensureAlienEcologyState(spit.state).sectorFlags;
  assert.equal(flags['bolus:coughCracked'], true);
  assert.equal(flags['bolus:coughPaid'], true);
  tickBolus(spit.world, 0.1);
  assert.equal(spit.state.entities.get('p').vel.z, 80);
  assert.ok(spit.events.some((event) => event.payload && event.payload.id === 'bolus_cough'));
});

test('a baleen toll spends the spit, and the cracked lip survives the next visit', () => {
  const bag = worldFor(pilot(-960, 0, 0, 40), []);
  tickBolus(bag.world, 0.1);
  const flags = ensureAlienEcologyState(bag.state).sectorFlags;
  flags['bolus:baleenTolled'] = true;
  bag.state.entities.get('p').pos.z = 1200;
  tickBolus(bag.world, 0.1);
  assert.equal(bag.state.entities.get('p').vel.z, 40);
  assert.equal(flags['bolus:coughCracked'], undefined);

  flags['bolus:coughCracked'] = true;
  flags['bolus:coughPaid'] = true;
  bag.state.world.currentSectorId = 'sector_ashfall_choir';
  tickBolus(bag.world, 0.1);
  assert.equal(flags['bolus:inVolume'], false);
  bag.state.world.currentSectorId = BOLUS_SECTOR_ID;
  bag.state.entities.get('p').pos.z = 0;
  tickBolus(bag.world, 0.1);
  assert.equal(flags['bolus:baleenTolled'], false);
  assert.equal(flags['bolus:coughPaid'], false);
  assert.equal(flags['bolus:coughCracked'], true);
});

test('letting go of a knob protects the lane for a swing and adds no kick', () => {
  const knob = fauna('knob', 'bolus_knob', -700, -2000);
  const bag = worldFor(pilot(-960, 0), [knob]);
  bag.state.player.tether.phase = 'loaded';
  bag.state.combat.attachments.byId.line = { state: 'active', ownerId: 'p', targetId: knob.id };
  tickBolus(bag.world, 0.1);
  const player = bag.state.entities.get('p');
  player.vel.z = 0;
  bag.state.player.tether.phase = 'idle';
  tickBolus(bag.world, 0.1);
  assert.equal(player.vel.z, 0);
  assert.equal(player.vel.x, 0);
  const flags = ensureAlienEcologyState(bag.state).sectorFlags;
  assert.ok(flags['bolus:swingUntil'] > bag.state.simTime);
});

test('gall skins the acid, then the same bite returns', () => {
  const lantern = fauna('lantern', 'bolus_lantern_0', -560, -1800);
  const bag = worldFor(pilot(-560, -1800), [lantern]);
  const player = bag.state.entities.get('p');
  tickBolus(bag.world, 0.1);
  assert.equal(player.hull, 80);
  assert.equal(bag.events.filter((event) => event.payload && event.payload.id === 'bolus_gall').length, 1);
  player.pos.x = 400;
  player.pos.z = 0;
  bag.state.simTime = 0.4;
  tickBolus(bag.world, 0.1);
  assert.equal(player.hull, 80);
  bag.state.simTime = 2;
  tickBolus(bag.world, 0.1);
  assert.ok(player.hull < 80);
  assert.equal(bag.events.filter((event) => event.payload && event.payload.id === 'bolus_acid').length, 1);
  const again = worldFor(pilot(400, 0), []);
  tickBolus(again.world, 0.1);
  tickBolus(again.world, 0.1);
  assert.equal(again.events.filter((event) => event.payload && event.payload.id === 'bolus_acid').length, 1);
});

test('only the berth pauses exposure', () => {
  const dry = worldFor(pilot(-980, -900), []);
  tickBolus(dry.world, 0.1);
  assert.equal(ensureAlienEcologyState(dry.state).exposure, 0);
  const wet = worldFor(pilot(0, 0), []);
  tickBolus(wet.world, 0.1);
  assert.ok(ensureAlienEcologyState(wet.state).exposure > 0);
});

test('floaters get heavy, then fall into the lane wake, and a brush contaminates once', () => {
  const heavy = fauna('floater', 'bolus_floater_h', 0, 0);
  const bag = worldFor(pilot(0, 0), [heavy]);
  ensureAlienEcologyState(bag.state).exposure = 0.3;
  tickBolus(bag.world, 0.1);
  assert.ok(Math.abs(heavy.vel.x - 8) < 1e-6, heavy.vel.x);

  const wake = fauna('floater', 'bolus_floater_w', -960, 0);
  const wakeBag = worldFor(pilot(0, 0, 0, 12), [wake]);
  ensureAlienEcologyState(wakeBag.state).exposure = 0.4;
  tickBolus(wakeBag.world, 0.1);
  assert.equal(wake.vel.z, 12);
  assert.equal(wake.vel.x, 0);

  const brush = fauna('floater', 'bolus_floater_b', 10, 0);
  const brushBag = worldFor(pilot(0, 0), [brush]);
  tickBolus(brushBag.world, 0.1);
  const once = ensureAlienEcologyState(brushBag.state).exposure;
  assert.ok(once > 0.02);
  tickBolus(brushBag.world, 0.1);
  const twice = ensureAlienEcologyState(brushBag.state).exposure;
  assert.ok(twice - once < 0.01);
});

test('a held fingerling huddles the school and a boost scatters it', () => {
  const held = fauna('fingerling', 'bolus_fingerling_a', -560, -400);
  const other = fauna('fingerling', 'bolus_fingerling_b', -530, -400);
  other.data.bolus.anchorX = -560;
  other.data.bolus.anchorZ = -400;
  const huddle = worldFor(pilot(0, 0), [held, other]);
  huddle.state.player.tether.phase = 'loaded';
  huddle.state.combat.attachments.byId.line = { state: 'active', ownerId: 'p', targetId: held.id };
  tickBolus(huddle.world, 0.1);
  assert.ok(Math.abs(other.vel.x - (-14.4)) < 1e-6, other.vel.x);

  const loose = fauna('fingerling', 'bolus_fingerling_c', -530, -400);
  loose.data.bolus.anchorX = -560;
  loose.data.bolus.anchorZ = -400;
  const free = worldFor(pilot(0, 0), [loose]);
  tickBolus(free.world, 0.1);
  assert.ok(Math.abs(loose.vel.x) < 1e-6);

  const school = fauna('fingerling', 'bolus_fingerling_d', -560, -300);
  const scatter = worldFor(pilot(-560, -400, 60, 0), [school]);
  scatter.state.entities.get('p').flags.boosting = true;
  tickBolus(scatter.world, 0.1);
  assert.ok(Math.abs(school.vel.z - 36) < 1e-6, school.vel.z);
});

test('nose light pins a fast drum, and cutting thrust lets it slide', () => {
  const pinned = fauna('drum', 'bolus_drum_pin', 80, 0);
  const pin = worldFor(pilot(0, 0, 60, 0), [pinned]);
  for (let n = 0; n < 21; n++) tickBolus(pin.world, 0.1);
  assert.equal(pinned.vel.x, 0);
  assert.equal(pinned.vel.z, 0);

  const drum = fauna('drum', 'bolus_drum_slide', 300, -700);
  const slide = worldFor(pilot(300, -600, 60, 0), [drum]);
  for (let n = 0; n < 20; n++) tickBolus(slide.world, 0.1);
  const chased = Math.hypot(drum.vel.x, drum.vel.z);
  assert.ok(Math.abs(chased - 62) < 1e-6);
  slide.state.entities.get('p').vel.x = 0;
  slide.state.entities.get('p').vel.z = 0;
  tickBolus(slide.world, 0.1);
  assert.ok(Math.abs(Math.hypot(drum.vel.x, drum.vel.z) - 62) < 1e-6);
});

test('a held valve swallows the crest, and commits cue stitch, grit, or pleat', () => {
  const valve = fauna('valve', 'bolus_valve_0', -480, 20);
  const crest = worldFor(pilot(0, 0), [valve]);
  crest.state.player.tether.phase = 'loaded';
  crest.state.combat.attachments.byId.line = { state: 'active', ownerId: 'p', targetId: valve.id };
  tickBolus(crest.world, 0.1);
  crest.state.simTime = 12;
  tickBolus(crest.world, 0.1);
  assert.equal(crest.state.entities.get('p').vel.z, 0);
  assert.equal(ensureAlienEcologyState(crest.state).sectorFlags['bolus:peristalsisMark'], 1);

  const stitch = worldFor(pilot(0, 0), [fauna('valve', 'bolus_valve_1', -480, 20)]);
  const lip = stitch.state.entityList[0];
  stitch.state.player.tether.phase = 'loaded';
  stitch.state.combat.attachments.byId.line = { state: 'active', ownerId: 'p', targetId: lip.id };
  for (let n = 0; n < 12; n++) tickBolus(stitch.world, 0.1);
  assert.ok(stitch.events.some((event) => event.payload && event.payload.id === 'bolus_stitch'));
  assert.equal(stitch.events.some((event) => event.payload && event.payload.id === 'bolus_latch'), false);

  const grit = worldFor(pilot(0, 0), [fauna('bezoar', 'bolus_bezoar_0', 100, 100)]);
  const stone = grit.state.entityList[0];
  grit.state.player.tether.phase = 'loaded';
  grit.state.combat.attachments.byId.line = { state: 'active', ownerId: 'p', targetId: stone.id };
  for (let n = 0; n < 11; n++) tickBolus(grit.world, 0.1);
  assert.ok(grit.events.some((event) => event.payload && event.payload.id === 'bolus_grit'));

  const pleat = worldFor(pilot(0, 0), [fauna('pleat', 'bolus_pleat', -240, 1280)]);
  const fold = pleat.state.entityList[0];
  pleat.state.player.tether.phase = 'loaded';
  pleat.state.combat.attachments.byId.line = { state: 'active', ownerId: 'p', targetId: fold.id };
  for (let n = 0; n < 5; n++) tickBolus(pleat.world, 0.1);
  assert.equal(pleat.state.entities.get('p').vel.z, 64);
  assert.ok(pleat.events.some((event) => event.payload && event.payload.id === 'bolus_pleat'));
});

test('a mite flees the contact and a rib lodges in the cough', () => {
  const mite = fauna('mite', 'bolus_mite_0', 0, 30);
  const bag = worldFor(pilot(0, 0), [mite]);
  tickBolus(bag.world, 0.1);
  assert.ok(Math.abs(mite.vel.z - 36) < 1e-6, mite.vel.z);
  assert.ok(ensureAlienEcologyState(bag.state).sectorFlags['bolus:miteFleeUntil'] > 0);

  const rib = fauna('rib', 'bolus_rib', 2347, 1173);
  rib.vel = { x: 5, y: 0, z: 5 };
  const lodge = worldFor(pilot(0, 0), [rib]);
  tickBolus(lodge.world, 0.1);
  assert.equal(rib.vel.x, 0);
  assert.equal(rib.vel.z, 0);
  assert.equal(ensureAlienEcologyState(lodge.state).sectorFlags['bolus:ribLodged'], true);
});

test('play cues are recipes, not new samples', () => {
  for (const id of [
    'bolus_tooth', 'bolus_slip', 'bolus_breath', 'bolus_thread', 'bolus_grit',
    'bolus_stitch', 'bolus_pleat', 'bolus_baleen', 'bolus_gall', 'bolus_acid', 'bolus_cough',
  ]) {
    assert.ok(RECIPES.some((recipe) => recipe.id === id), id);
  }
});

test('native bodies receive the authored kick and a single cone stop at their real masses', async () => {
  const owner = await createSg02DynamicBodyOwner();
  try {
    const tooth = fauna('tooth', 'bolus_tooth', -180, -220);
    const louse = fauna('louse', 'bolus_louse_0', 100, 0);
    louse.type = 'fauna'; louse.radius = 8; louse.collides = true;
    louse.vel.x = 12;
    const player = pilot(0, 0);
    player.mass = 120; player.radius = 8; player.collides = true;
    player.physicsBody = { dynamic: true, mass: 120, radius: 8, shape: 'ball' };
    const bag = worldFor(player, [tooth, louse]);
    bag.state.settings = { gameplay: { physicsBackend: 'rapier-dynamic' } };
    bag.state.player.tether.phase = 'loaded';
    bag.state.combat.attachments.byId.line = { state: 'active', ownerId: 'p', targetId: tooth.id };
    owner.syncFromEntities([player, louse]);
    tickBolus(bag.world, 1 / 60);
    assert.equal(player.vel.x, 0, 'gameplay queues motion without writing the native mirror');
    assert.equal(louse.vel.x, 12);
    owner.step(1 / 60);
    assert.ok(Math.abs(player.vel.x - 160) < 0.05, player.vel.x);
    assert.ok(Math.abs(louse.vel.x) < 0.05, louse.vel.x);
  } finally { owner.dispose(); }
});

test('acid uses ordinary damage protection and kills once through combat', () => {
  const player = pilot(400, 0);
  const bag = worldFor(player, []);
  player.flags.invuln = true;
  tickBolus(bag.world, 0.1);
  assert.equal(player.hull, 80);
  player.flags.invuln = false;
  player.hull = 0.001;
  tickBolus(bag.world, 0.1);
  tickBolus(bag.world, 0.1);
  assert.equal(player.alive, false);
  assert.equal(bag.events.filter((e) => e.name === 'entity:killed').length, 1);
});

test('a full hold does not spend the nerve sample or contamination outcome', () => {
  const nerve = fauna('nerve', 'bolus_nerve', 0, 30);
  const bag = worldFor(pilot(0, 0), [nerve]);
  bag.state.player.cargo.capVolume = 0;
  bag.state.player.tether.phase = 'loaded';
  bag.state.combat.attachments.byId.line = { state: 'active', ownerId: 'p', targetId: nerve.id };
  for (let n = 0; n < 31; n++) tickBolus(bag.world, 0.1);
  const flags = ensureAlienEcologyState(bag.state).sectorFlags;
  assert.notEqual(flags['bolus:sampled'], true);
  assert.equal(nerve.data.bolus.spent, false);
  bag.state.player.cargo.capVolume = 100;
  tickBolus(bag.world, 0.1);
  assert.equal(flags['bolus:sampled'], true);
  assert.equal(bag.state.player.cargo.items.cmdty_live_specimen, 1);
  tickBolus(bag.world, 0.1);
  assert.equal(bag.state.player.cargo.items.cmdty_live_specimen, 1);
});

function worldFor(player, faunaList) {
  const state = {
    simTime: 0,
    playerId: 'p',
    player: { tether: { phase: 'idle' }, cargo: { items: {}, capVolume: 100, usedVolume: 0, usedMass: 0 } },
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
