import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { SECTORS } from '../src/data/sectors.js';
import { economy } from '../src/systems/economy.js';
import { sectorSim, forecastTransitFor } from '../src/systems/sectorSim.js';
import { survivorPod, CAUSAL_SURVIVOR_PAYLOAD_TYPE } from '../src/systems/survivorPod.js';
import { thermalMarkCue, THERMAL_MARK_COLORS } from '../src/systems/fields.js';
import { oreColor, vfx } from '../src/render/vfx.js';
import { broadcastDishBeatRecord, stationTicProfileId } from '../src/render/stationSideEventVfx.js';
import { WeaponVfxPresenter } from '../src/render/weapons/presenter.js';
import { CONTACT_MARK_KINDS } from '../src/render/weapons/contactMarks.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { readClusterModel } from '../src/ui/orrery/hudAdapter.js';
import { speedPhase } from '../src/ui/orrery/speedDial.js';
import { wantedAlertText } from '../src/ui/wantedReason.js';
import { miningNoiseDangerCue } from '../src/audio/combatFeedbackEar.js';

const SEED = 4242;
const CERES = 'station_ceres';

function bootEconomy() {
  const state = createGameState(SEED);
  state.meta.seed = SEED;
  state.mode = 'flight';
  state.simTime = 120;
  state.tick = 7200;
  state.playerId = 1;
  state.world.currentSectorId = 'sector_ceres_belt';
  for (const s of SECTORS) state.world.sectors[s.id] = { ...s, owner: s.factionId };
  const player = {
    id: 1, type: 'ship', alive: true, isPlayer: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, hull: 100, hullMax: 100, data: {},
  };
  state.entities = new Map([[1, player]]);
  state.entityList = [player];
  const bus = createBus();
  const toasts = [];
  bus.on('toast', (t) => toasts.push(t));
  const econ = Object.create(economy);
  econ.init({
    state, bus, helpers: {},
    registry: { get() { return null; } },
  });
  econ.newGame();
  econ.ensureMarket(CERES);
  return { state, bus, econ, toasts };
}

test('seed 4242 a yard boom says the yard is flush once, and a second flood while it lasts stays quiet', () => {
  const { state, bus, toasts } = bootEconomy();
  const flood = { sectorId: 'sector_ceres_belt', pricePressure: -0.2, yieldU: 40, commodityId: 'cmdty_ore_iron' };
  bus.emit('economy:oreFlood', flood);
  bus.flush();
  const flush = toasts.filter((t) => /yard is flush/.test(t.text));
  assert.equal(flush.length, 1);
  assert.match(flush[0].text, /Ceres/);
  bus.emit('economy:oreFlood', flood);
  bus.flush();
  assert.equal(toasts.filter((t) => /yard is flush/.test(t.text)).length, 1);
  assert.ok(Number(state.economy.stationConditions[CERES].boomUntil) > state.simTime);
});

test('seed 4242 a lost cold manifest names the perishable, and dry freight and the spoil tick stay quiet', () => {
  const { state, econ, toasts } = bootEconomy();
  econ._armColdChain(CERES, {
    freighterKey: 'dry-4242',
    manifest: { lines: [{ commodityId: 'cmdty_ore_iron' }] },
  });
  assert.equal(toasts.length, 0);
  econ._armColdChain(CERES, {
    freighterKey: 'cold-4242',
    manifest: { lines: [{ commodityId: 'cmdty_food' }, { commodityId: 'cmdty_ore_iron' }] },
  });
  assert.equal(toasts.length, 1);
  assert.match(toasts[0].text, /Cold chain broken/);
  assert.match(toasts[0].text, /Provisions/);
  assert.doesNotMatch(toasts[0].text, /Iron/);
  const market = econ.ensureMarket(CERES);
  market.cmdty_food.stock = 20;
  econ._sweepMarketPlay(state);
  assert.equal(toasts.length, 1, 'rotting stock does not toast on every tick');
});

test('seed 4242 Penn speaks on the first dump and the fifth, and a duplicate receipt does not', () => {
  const { econ, toasts } = bootEconomy();
  const dump = (id) => econ.applyPodIntake({
    stationId: CERES, commodityId: 'cmdty_ore_iron', intakeId: id, qty: 2,
  });
  const first = dump('penn-1');
  assert.equal(first.ok, true, first.reason);
  assert.equal(toasts.filter((t) => /lead/.test(t.text)).length, 1);
  for (const id of ['penn-2', 'penn-3', 'penn-4']) {
    assert.equal(dump(id).ok, true);
  }
  assert.equal(toasts.filter((t) => /Auditor Penn/.test(t.text)).length, 1);
  assert.equal(dump('penn-5').ok, true);
  const penn = toasts.filter((t) => /Auditor Penn/.test(t.text));
  assert.equal(penn.length, 2);
  assert.match(penn[1].text, /pattern/);
  const before = penn.length;
  const again = dump('penn-5');
  assert.equal(again.duplicate, true);
  assert.equal(toasts.filter((t) => /Auditor Penn/.test(t.text)).length, before);
});

test('seed 4242 a jump that bites names the crossing and the damage, and a clean arrival does not', () => {
  const state = createGameState(SEED);
  state.meta.seed = SEED;
  state.simTime = 80;
  state.playerId = 1;
  state.player.maxSpeed = 40;
  state.player.hull = 100;
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, hull: 100, maxSpeed: 40 };
  state.entities = new Map([[1, player]]);
  const bus = createBus();
  const toasts = [];
  bus.on('toast', (t) => toasts.push(t));
  const sim = Object.create(sectorSim);
  sim.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  const sectorId = 'sector_helios_prime';
  state.sectorSim.field.nodes[sectorId] = {
    ...(state.sectorSim.field.nodes[sectorId] || {}),
    danger: 0.95,
  };
  const forecast = forecastTransitFor(state, sectorId, { fromSectorId: 'sector_ceres_belt', via: 'gate' });
  assert.ok(forecast.incidentChance > 0);
  assert.ok(forecast.expectedDamage > 0);
  const arrive = (roll, via) => {
    let n = 0;
    sim._sectorStream = () => () => (n++ === 0 ? roll : 0.2);
    sim._ensureState().meta.pendingTransit = { from: 'sector_ceres_belt', to: sectorId, via };
    sim._onJumpArrive({ sectorId });
  };
  arrive(0, 'gate');
  assert.equal(toasts.length, 1);
  assert.match(toasts[0].text, /gate crossing/);
  assert.match(toasts[0].text, /damage/);
  const named = Number(toasts[0].text.match(/(\d+) damage/)[1]);
  assert.ok(named > 0);
  arrive(1, 'drive');
  assert.equal(toasts.length, 1, 'a clean crossing stays quiet');
});

test('seed 4242 a noticed survivor pod shows the air left, and an unnoticed pod stays a pod', () => {
  const state = createGameState(SEED);
  state.meta.seed = SEED;
  state.simTime = 100;
  state.mode = 'flight';
  state.playerId = 1;
  state.scenario = null;
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 } };
  const pod = {
    id: 9, type: 'payload', alive: true, pos: { x: 4000, z: 0 },
    data: {
      payloadType: CAUSAL_SURVIVOR_PAYLOAD_TYPE,
      scanLabel: 'Survivor Pod',
      survivorPodCausal: {
        entityId: 9, phase: 'adrift', expireAt: 280, playerNoticedAt: null, resolved: false,
      },
    },
  };
  state.entities = new Map([[1, player], [9, pod]]);
  const sys = Object.create(survivorPod);
  sys.init({ state, bus: createBus(), helpers: {} });
  state.survivorPod.causal.byEntityId[9] = {
    entityId: 9, phase: 'adrift', expireAt: 280, playerNoticedAt: null, resolved: false,
  };
  sys._tickCausal(state, state.survivorPod);
  assert.equal(pod.data.scanLabel, 'Survivor Pod');
  pod.pos.x = 20;
  sys._tickCausal(state, state.survivorPod);
  assert.equal(pod.data.scanLabel, 'Survivor Pod - oxygen 180s');
  assert.equal(state.survivorPod.causal.byEntityId[9].playerNoticedAt, 100);
});

test('seed 4242 a burn and a coolant patch each leave one coloured ring that cannot outlive the field', () => {
  const burn = thermalMarkCue({ id: 'b', center: { x: 1, z: 2 }, radius: 40 }, { kind: 'burn' }, 9);
  const cool = thermalMarkCue({ id: 'c', center: { x: 3, z: 4 }, radius: 90 }, { kind: 'coolant' }, 4);
  assert.equal(burn.life, 4);
  assert.equal(burn.particles, 0);
  assert.equal(burn.lights, 0);
  assert.equal(burn.color, THERMAL_MARK_COLORS.burn);
  assert.equal(cool.color, THERMAL_MARK_COLORS.coolant);
  assert.equal(cool.life, 4);
  const host = Object.create(vfx);
  host._scene = {};
  const sprites = [];
  host._spawnSprite = (...args) => { sprites.push(args); return { op0: 1 }; };
  host._onPresentationCue(cool);
  host._onPresentationCue({ id: 'nothing', particles: 0, lights: 0, position: { x: 1, z: 1 } });
  assert.equal(sprites.length, 1);
  assert.equal(sprites[0][4], 4);
  assert.equal(sprites[0][9], THERMAL_MARK_COLORS.coolant);
  assert.equal(host._lastThermalMark.lights, 0);
});

test('seed 4242 bay tics wear the pose they name, a numbered beat stays the dish, and a quiet bay is silent', () => {
  assert.equal(stationTicProfileId('dish_sweep'), 'sensor_sweep');
  assert.equal(stationTicProfileId('low_ping'), 'quiet_dock');
  assert.equal(stationTicProfileId('beacon_strobe'), 'patrol_launch');
  assert.equal(stationTicProfileId('vent_flare'), 'slag_pour');
  assert.equal(stationTicProfileId('charge_flash'), 'slag_pour');
  assert.equal(stationTicProfileId('weld_bloom'), 'repair_drone');
  assert.equal(stationTicProfileId('gantry_cycle'), 'hauler_dock');
  assert.equal(stationTicProfileId(3), 'sensor_sweep');
  assert.equal(stationTicProfileId('nope'), null);
  assert.equal(broadcastDishBeatRecord({ tic: 'nope', pos: { x: 1, z: 1 } }), null);
  assert.equal(broadcastDishBeatRecord({ quiet: true, tic: 'gantry_cycle', pos: { x: 1, z: 1 } }), null);
  const beat = broadcastDishBeatRecord({
    stationId: CERES, tic: 'gantry_cycle', pos: { x: 2, z: 3 },
  });
  assert.equal(beat.profileId, 'hauler_dock');
  assert.equal(beat.trajectory, 'dock-ease');
  const dish = broadcastDishBeatRecord({ stationId: CERES, tic: 3, pos: { x: 10, z: 4 } });
  assert.equal(dish.profileId, 'sensor_sweep');
  assert.equal(dish.trajectory, 'dish-sweep');
});

test('seed 4242 the speed dial Ref is the governed cruise, the wanted banner names the law, and a mayday says mayday', () => {
  const hitch = makeShipEntitySpec('ship_kestrel', { isPlayer: true });
  hitch.vel = { x: 0, z: 0 };
  assert.equal(hitch.driveId, undefined);
  assert.equal(hitch.propulsion.combatSpeed, 195);
  assert.ok(hitch.maxSpeed < 180);
  const state = { playerId: hitch.id, entities: new Map(), simTime: 1, player: {} };
  const model = readClusterModel(state, hitch, { ordnance: {} });
  assert.equal(model.speedRef, 195);
  assert.equal(speedPhase(180, model.speedRef), 'flight');
  const bare = readClusterModel(state, {
    id: 1, type: 'ship', alive: true, maxSpeed: 150,
    vel: { x: 0, z: 0 }, rot: 0, hull: 100, hullMax: 100, data: {},
  }, { ordnance: {} });
  assert.equal(bare.speedRef, 150);

  assert.match(wantedAlertText(0.16, '', true), /fine\/scan/);
  assert.match(wantedAlertText(0.5, '', true), /nets\/wedges/);
  assert.match(wantedAlertText(0.9, '', true), /impound\/heist/);
  for (const heat of [0.16, 0.5, 0.9]) {
    assert.doesNotMatch(wantedAlertText(heat, '', true), /LOW|MODERATE|HIGH/);
  }

  const noise = miningNoiseDangerCue({ level: 0.8, threshold: 0.5 });
  assert.equal(noise.recipeId, 'sfx_wanted_alert');
  assert.equal(noise.caption, undefined);
});

test('seed 4242 a grey rock and an ice rock cut in their own colour, and the scar face is stone', () => {
  assert.equal(oreColor('ast_common_rock'), '#c8c0a8');
  assert.equal(oreColor('ast_icy'), '#9fd8e8');
  assert.equal(oreColor('cmdty_silicate'), '#c8c0a8');
  assert.notEqual(oreColor('ast_icy'), '#d8a050');

  const host = Object.create(vfx);
  host._scene = {};
  host._burst = 1;
  host.state = { simTime: 1, playerId: 1, entities: new Map(), settings: {} };
  host._c0 = { set(hex) { this.hex = hex; } };
  host._c1 = { set(hex) { this.hex = hex; } };
  host._spawnParticle = () => {};
  host._spawnSprite = () => {};
  host._eventLight = () => {};
  host._ent = () => null;
  host._onMiningTick({ pos: { x: 0, z: 0 }, oreType: 'ast_common_rock' });
  assert.equal(host._c0.hex, '#c8c0a8');
  assert.equal(host._c1.hex, '#c8c0a8');

  const beamColor = { hex: null };
  host._miningBeam = {
    active: true,
    shaderShared: { stop: { value: 0 }, verb: { value: 0 }, seed: { value: 0 } },
    mesh: { material: { color: { set(hex) { beamColor.hex = hex; } } } },
    glow: { material: { color: { set() {} } } },
  };
  host._ent = (id) => (id === 7 ? { id: 7, data: { typeId: 'ast_icy' }, pos: { x: 1, z: 0 } } : null);
  host._onMiningStart({ targetId: 7, verb: 'extract' });
  assert.equal(host._miningBeam.color, '#9fd8e8');
  assert.equal(beamColor.hex, '#9fd8e8');

  const dust = [];
  host._composeImpact = () => true;
  host._spawnSprite = (...args) => { dust.push(args[9]); return {}; };
  host._emitJuiceCue = () => {};
  host._gas = null;
  host._onAsteroidShatter({
    pos: { x: 0, z: 0 }, typeId: 'ast_common_rock', material: 'rock', radius: 8, id: 7,
  }, false);
  assert.ok(dust.includes('#c8c0a8'));
  assert.equal(dust.includes('#cbb9a0'), false);

  const mesh = new THREE.Object3D();
  mesh.updateMatrixWorld(true);
  const rock = { id: 2, type: 'asteroid', radius: 12, alive: true };
  const presenter = new WeaponVfxPresenter({
    scene: new THREE.Scene(),
    state: {
      playerId: 1,
      entities: new Map([[2, rock]]),
      render: { meshes: new Map([[2, mesh]]) },
      settings: { video: { particleQuality: 'low' } },
      simTime: 0,
    },
  });
  try {
    presenter.stampMiningScar(2, 10, 0.3, 0, 1, 0, 0, 1.7, 1.0, CONTACT_MARK_KINDS.gouge, 0.4);
    const scar = presenter.scorches.slots.find((s) => s.alive);
    const stone = new THREE.Color('#c8c0a8');
    const molten = new THREE.Color('#ff7a2a');
    assert.ok(Math.abs(scar.r - stone.r) < 0.02);
    assert.ok(Math.abs(scar.g - stone.g) < 0.02);
    assert.ok(Math.abs(scar.b - stone.b) < 0.02);
    assert.ok(Math.abs(scar.r - molten.r) > 0.05);
    assert.equal(scar.heat0, 1);
    assert.equal(scar.markKind, CONTACT_MARK_KINDS.gouge);
  } finally {
    presenter.dispose();
  }
});
