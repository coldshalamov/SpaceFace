// Plan 33 — weapon VFX & audio identity. Measurement for the owner gate:
// each family reaches a distinct sight+sound signature through combat:fire, and
// the event-light / weapon-light object count never changes mid-fight.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { WEAPONS } from '../src/data/weapons.js';
import {
  AUDIO_RECIPE_BY_ID,
  audio,
  recipeForWeapon,
  resolveWeaponAudioSignature,
} from '../src/audio/audioSystem.js';
import { weapons } from '../src/systems/weapons.js';
import {
  EVENT_LIGHT_POOL_SIZE,
  vfx,
} from '../src/render/vfx.js';
import {
  WEAPON_LIGHT_POOL_SIZE,
  WeaponVfxPresenter,
  flightColorsForEntity,
  resolveWeaponRecipe,
} from '../src/render/weapons/index.js';

const WPN = new Map(WEAPONS.map((definition) => [definition.id, definition]));

const FAMILY_CASES = Object.freeze([
  Object.freeze({ weaponId: 'wpn_pulse_laser_s', audioId: 'sfx_wpn_pulse_laser', variant: 'pulse-bolt' }),
  Object.freeze({ weaponId: 'wpn_autocannon_s', audioId: 'sfx_wpn_autocannon', variant: 'autocannon' }),
  Object.freeze({ weaponId: 'wpn_railgun_m', audioId: 'sfx_wpn_railgun', variant: 'railgun' }),
  Object.freeze({ weaponId: 'wpn_plasma_cannon_m', audioId: 'sfx_wpn_plasma', variant: 'thermal-bolt' }),
  Object.freeze({ weaponId: 'wpn_missile_rack_m', audioId: 'sfx_wpn_missile', variant: 'missile' }),
  Object.freeze({ weaponId: 'wpn_beam_laser_m', audioId: 'sfx_wpn_beam_laser', variant: 'continuous-beam' }),
  Object.freeze({ weaponId: 'wpn_concussion_cannon_m', audioId: 'sfx_wpn_concussion', variant: 'concussion-slug' }),
  Object.freeze({ weaponId: 'wpn_vector_mine_m', audioId: 'sfx_wpn_vector_mine', variant: 'vector-mine' }),
  Object.freeze({ weaponId: 'wpn_flak_turret_s', audioId: 'sfx_wpn_flak', variant: 'flak' }),
  Object.freeze({ weaponId: 'wpn_emp_disruptor_m', audioId: 'sfx_wpn_emp', variant: 'disruptor' }),
  Object.freeze({ weaponId: 'wpn_gravity_marker_s', audioId: 'sfx_wpn_emp', variant: 'disruptor' }),
]);

function runtimeWeapon(definition) {
  return {
    ...definition,
    defId: definition.id,
    slotIndex: 0,
    facing: definition.tracking === 'auto_turret' ? 'turret' : 'front',
    facingAngle: 0,
    gimbalArc: Math.PI * 2,
    muzzleOffset: [0.8, 0],
    _cooldown: 0,
    _heat: 0,
  };
}

function countPointLights(root) {
  let n = 0;
  root.traverse((object) => { if (object.isPointLight) n++; });
  return n;
}

function countRingGeometry(root) {
  let n = 0;
  root.traverse((object) => {
    if (object.geometry && object.geometry.type === 'RingGeometry') n++;
  });
  return n;
}

function fireThroughProductionOwner(weaponId) {
  const definition = WPN.get(weaponId);
  assert.ok(definition, `catalog weapon ${weaponId} exists`);
  const previousImpulse = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  const bus = createBus();
  const entities = new Map();
  const spawned = [];
  const fires = [];
  const shooter = {
    id: 41,
    type: 'ship',
    alive: true,
    team: 1,
    factionId: 'faction_reach',
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 8,
    mass: 40,
    cap: 4000,
    capMax: 4000,
    flags: {},
    data: {
      weapons: [runtimeWeapon(definition)],
      combat: { lockTarget: 77, lockProgress: 1 },
    },
  };
  const lockTarget = {
    id: 77,
    type: 'ship',
    alive: true,
    team: 0,
    pos: { x: 120, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 6,
  };
  entities.set(shooter.id, shooter);
  entities.set(lockTarget.id, lockTarget);
  const state = {
    mode: 'flight',
    tick: 0,
    simTime: 0,
    playerId: shooter.id,
    entities,
    entityList: [shooter, lockTarget],
    input: { fire: true, aimAngle: 0, actions: {} },
    player: { tether: {}, targetId: lockTarget.id },
    combat: { beams: [] },
    runtime: { features: {} },
  };
  const helpers = {
    getEntity(id) { return entities.get(id); },
    spawnEntity(spec) {
      const entity = {
        id: 100 + spawned.length,
        alive: true,
        flags: {},
        prevPos: { ...(spec.pos || { x: 0, z: 0 }) },
        ...spec,
      };
      entities.set(entity.id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
  };
  const host = Object.create(weapons);
  host.state = state;
  host.bus = bus;
  host.helpers = helpers;
  host._byId = WPN;
  host._rng = () => 0.5;
  host._beamFiring = new Set();
  host._beamFiringPrev = new Set();
  host._beamActiveMeta = new Map();
  bus.on('combat:fire', (payload) => fires.push(payload));

  try {
    host._serviceShip(shooter, true, true, 1 / 60, state, 0, lockTarget, null);
  } finally {
    COMBAT_FLAGS.weaponImpulseConsequences = previousImpulse;
  }

  assert.equal(fires.length, 1, `${weaponId} emits one real combat:fire receipt`);
  return { state, shooter, fire: fires[0], spawned };
}

test('vector-mine launch no longer collapses to the pulse-laser voice', () => {
  assert.equal(recipeForWeapon('wpn_vector_mine_m'), 'sfx_wpn_vector_mine');
  assert.notEqual(recipeForWeapon('wpn_vector_mine_m'), 'sfx_wpn_pulse_laser');
  assert.notEqual(AUDIO_RECIPE_BY_ID.sfx_wpn_vector_mine, AUDIO_RECIPE_BY_ID.sfx_vector_mine,
    'launch thunk and detonation crack are different recipes');
  const launch = AUDIO_RECIPE_BY_ID.sfx_wpn_vector_mine;
  const bang = AUDIO_RECIPE_BY_ID.sfx_vector_mine;
  assert.ok(launch);
  assert.ok(bang);
  assert.notEqual(launch.filterFreq, bang.filterFreq);
});

test('every named family reaches a distinct sight+sound signature through combat:fire', () => {
  const audioSignatures = new Set();
  const visualSignatures = new Set();
  const heard = [];
  for (const row of FAMILY_CASES) {
    assert.equal(recipeForWeapon(row.weaponId), row.audioId);
    const route = fireThroughProductionOwner(row.weaponId);
    const signature = resolveWeaponAudioSignature(route.fire, route.state);
    assert.equal(signature.recipeId, row.audioId);

    const calls = [];
    const audioHost = Object.create(audio);
    audioHost.state = route.state;
    audioHost.play = (recipeId, options) => calls.push({ recipeId, options });
    audioHost._startBeam = (ownerId) => calls.push({ recipeId: 'sfx_wpn_beam_laser', ownerId });
    audioHost._onFire(route.fire);
    assert.equal(calls.length, 1, `${row.weaponId} reaches AudioSystem`);
    assert.equal(calls[0].recipeId, row.audioId);
    heard.push(calls[0]);

    const recipe = AUDIO_RECIPE_BY_ID[row.audioId];
    assert.ok(recipe);
    audioSignatures.add([
      recipe.id,
      recipe.type,
      recipe.wave || '',
      recipe.baseFreq || '',
      recipe.filterType || '',
      recipe.filterFreq || '',
      recipe.repeatCount || 0,
      (recipe.layers || []).join(','),
    ].join(':'));

    const visual = resolveWeaponRecipe(row.weaponId, route.fire);
    assert.equal(visual.variant, row.variant);
    visualSignatures.add([
      visual.family,
      visual.variant,
      visual.flight.mode,
      visual.flight.boltVariant,
      visual.flight.dashLength,
      visual.flight.width,
      visual.muzzle.flipbook ? 1 : 0,
      visual.muzzle.atlasRow,
    ].join(':'));
  }
  assert.equal(heard.length, FAMILY_CASES.length);
  // Grav-marker shares the EMP voice on purpose (plan groups EMP/RCS/Grav-marker).
  assert.equal(audioSignatures.size, FAMILY_CASES.length - 1);
  assert.equal(visualSignatures.size, FAMILY_CASES.length - 1,
    'grav-marker keeps the disruptor family; every other named gun is unique by shape/cadence');
});

test('muzzle flashes reuse the hard light pools and never spawn a circular ring', () => {
  const scene = new THREE.Scene();
  const player = { id: 1, alive: true, type: 'ship', pos: { x: 0, z: 0 } };
  const system = Object.create(vfx);
  system.state = {
    playerId: player.id,
    entities: new Map([[player.id, player]]),
    entityList: [player],
    settings: {},
    render: { scene },
  };
  system.helpers = { player: () => player };
  system._scene = scene;
  system._zeroPos = { x: 0, z: 0 };
  system._spawnLocalXZ = { x: 0, z: 0 };
  system._spawnAdmissionPriority = 0.5;
  system._initEventLights();
  system._initWeaponPresenter();
  const before = countPointLights(scene);
  assert.equal(before, EVENT_LIGHT_POOL_SIZE + WEAPON_LIGHT_POOL_SIZE);

  const presenter = new WeaponVfxPresenter({ scene: new THREE.Scene() });
  for (const row of FAMILY_CASES) {
    const origin = { x: 4, z: 0 };
    system._flashLight(origin, '#ffffff', 3, 8, 90, 0.9);
    presenter.handleFire({ ownerId: player.id, weaponId: row.weaponId, origin }, origin, 0, {
      family: resolveWeaponRecipe(row.weaponId).family,
      variant: row.variant,
    });
    presenter.handleHit({
      weaponId: row.weaponId,
      pos: { x: 20, z: 0 },
      normal: { x: -1, z: 0 },
      approach: { x: 1, z: 0 },
    }, false);
  }
  assert.equal(countPointLights(scene), before, 'lights are intensity-animated, never added or removed');
  assert.equal(countRingGeometry(scene), 0);
  assert.equal(countRingGeometry(presenter.scene), 0);
});

test('hostile fire keeps family structure and only tints by faction', () => {
  const recipe = resolveWeaponRecipe('wpn_plasma_cannon_m');
  const reach = flightColorsForEntity(recipe, { team: 1, factionId: 'faction_reach' }, {});
  const scn = flightColorsForEntity(recipe, { team: 1, factionId: 'faction_scn' }, {});
  const friendly = flightColorsForEntity(recipe, { team: 0 }, {});
  assert.notDeepEqual(reach, scn);
  assert.deepEqual(friendly, { core: recipe.flight.coreColor, sheath: recipe.flight.sheathColor });
});
