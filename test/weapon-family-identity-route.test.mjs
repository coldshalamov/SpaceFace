import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { FACTION_PALETTES } from '../src/data/palettes.js';
import { WEAPONS } from '../src/data/weapons.js';
import {
  AUDIO_RECIPE_BY_ID,
  MAX_AUDIO_VOICES,
  audio,
  resolveWeaponAudioSignature,
} from '../src/audio/audioSystem.js';
import { weapons } from '../src/systems/weapons.js';
import { flightColorsForEntity, resolveWeaponRecipe } from '../src/render/weapons/index.js';

const FAMILY_CASES = Object.freeze([
  Object.freeze({ weaponId: 'wpn_plasma_cannon_m', audioId: 'sfx_wpn_plasma', variant: 'thermal-bolt' }),
  Object.freeze({ weaponId: 'wpn_flak_turret_s', audioId: 'sfx_wpn_flak', variant: 'flak' }),
  Object.freeze({ weaponId: 'wpn_emp_disruptor_m', audioId: 'sfx_wpn_emp', variant: 'disruptor' }),
  Object.freeze({ weaponId: 'wpn_concussion_cannon_m', audioId: 'sfx_wpn_concussion', variant: 'concussion-slug' }),
  Object.freeze({ weaponId: 'wpn_siege_lance_l', audioId: 'sfx_wpn_siege_lance', variant: 'siege-lance' }),
]);

const WPN = new Map(WEAPONS.map((definition) => [definition.id, definition]));

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

function fireThroughProductionOwner(weaponId, factionId, team = 1) {
  const definition = WPN.get(weaponId);
  assert.ok(definition, `catalog weapon ${weaponId} exists`);
  const bus = createBus();
  const entities = new Map();
  const projectiles = [];
  const fires = [];
  const shooter = {
    id: 41,
    type: 'ship',
    alive: true,
    team,
    factionId,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 8,
    mass: 40,
    cap: 2000,
    capMax: 2000,
    flags: {},
    data: { weapons: [runtimeWeapon(definition)], combat: {} },
  };
  entities.set(shooter.id, shooter);
  const state = {
    mode: 'flight',
    tick: 0,
    simTime: 0,
    playerId: shooter.id,
    entities,
    entityList: [shooter],
    input: { fire: true, aimAngle: 0, actions: {} },
    player: { tether: {}, targetId: null },
    combat: { beams: [] },
    runtime: { features: {} },
  };
  const helpers = {
    getEntity(id) { return entities.get(id); },
    spawnEntity(spec) {
      const entity = {
        id: 100 + projectiles.length,
        alive: true,
        flags: {},
        prevPos: { ...(spec.pos || { x: 0, z: 0 }) },
        ...spec,
      };
      entities.set(entity.id, entity);
      state.entityList.push(entity);
      projectiles.push(entity);
      return entity;
    },
  };
  const host = Object.create(weapons);
  host.state = state;
  host.bus = bus;
  host.helpers = helpers;
  host._byId = WPN;
  host._rng = () => 0.5;
  bus.on('combat:fire', (payload) => fires.push(payload));

  host._serviceShip(shooter, true, true, 1 / 60, state, 0, null, null);

  assert.equal(fires.length, 1, `${weaponId} emits one real combat:fire receipt`);
  assert.equal(projectiles.length, 1, `${weaponId} launches one physical projectile`);
  return { state, shooter, fire: fires[0], projectile: projectiles[0] };
}

test('five specialist catalog families reach distinct finite voices through real combat:fire receipts', () => {
  const heard = [];
  const semanticSignatures = new Set();
  const visualSignatures = new Set();
  for (const row of FAMILY_CASES) {
    const route = fireThroughProductionOwner(row.weaponId, 'faction_reach');
    const signature = resolveWeaponAudioSignature(route.fire, route.state);
    assert.equal(signature.recipeId, row.audioId);

    const calls = [];
    const audioHost = Object.create(audio);
    audioHost.state = route.state;
    audioHost.play = (recipeId, options) => calls.push({ recipeId, options });
    audioHost._onFire(route.fire);
    assert.deepEqual(calls.map((call) => call.recipeId), [row.audioId],
      `${row.weaponId} reaches its family voice through AudioSystem._onFire`);
    heard.push(calls[0]);

    const recipe = AUDIO_RECIPE_BY_ID[row.audioId];
    assert.ok(recipe);
    assert.equal(recipe.category, 'weapon');
    assert.equal(String(recipe.type).startsWith('continuous'), false);
    const release = recipe.gainEnvelope
      ? Number(recipe.gainEnvelope.release)
      : Math.max(...recipe.layers.map((id) => Number(AUDIO_RECIPE_BY_ID[id].gainEnvelope.release)));
    assert.ok(release <= 0.4,
      `${row.audioId} stays a finite combat one-shot`);
    semanticSignatures.add([
      recipe.type,
      recipe.wave || '',
      recipe.baseFreq || '',
      recipe.filterType || '',
      recipe.filterFreq || '',
      recipe.repeatCount || 0,
      (recipe.layers || []).join(','),
    ].join(':'));

    const visual = resolveWeaponRecipe(route.projectile.data.weaponId, route.projectile.data);
    assert.equal(visual.variant, row.variant);
    visualSignatures.add([
      visual.flight.boltVariant,
      visual.flight.dashLength,
      visual.flight.width,
      visual.flight.ribbonWidth,
    ].join(':'));
  }
  assert.equal(heard.length, FAMILY_CASES.length);
  assert.equal(semanticSignatures.size, FAMILY_CASES.length,
    'plasma, flak, EMP, concussion, and siege differ by synthesis character, not pitch-only aliases');
  assert.equal(visualSignatures.size, FAMILY_CASES.length,
    'family identity remains readable by shape/cadence when color perception or audio is unavailable');
  assert.equal(MAX_AUDIO_VOICES, 12, 'all five voices stay under the existing bounded AudioSystem pool');
  assert.equal(AUDIO_RECIPE_BY_ID.sfx_wpn_flak.repeatCount, 2,
    'the flak typewriter is one bounded voice with three scheduled reports');
});

test('real hostile projectiles inherit canonical faction colors without replacing family structure', () => {
  const factionIds = ['faction_scn', 'faction_mts', 'faction_dmc', 'faction_reach', 'faction_quiet'];
  const colorsByFaction = new Map();
  for (let i = 0; i < FAMILY_CASES.length; i++) {
    const row = FAMILY_CASES[i];
    const factionId = factionIds[i];
    const route = fireThroughProductionOwner(row.weaponId, factionId);
    assert.equal(route.projectile.factionId, factionId,
      'Weapons owner carries shooter faction identity onto the projectile entity');
    const recipe = resolveWeaponRecipe(row.weaponId, route.projectile.data);
    const colors = flightColorsForEntity(recipe, route.projectile, {});
    assert.deepEqual(colors, {
      core: FACTION_PALETTES[factionId].thruster,
      sheath: FACTION_PALETTES[factionId].accent,
    });
    colorsByFaction.set(factionId, `${colors.core}:${colors.sheath}`);
  }
  assert.equal(colorsByFaction.size, factionIds.length);
  assert.equal(new Set(colorsByFaction.values()).size, factionIds.length,
    'hostile factions do not collapse to one generic red projectile palette');

  const concord = fireThroughProductionOwner('wpn_plasma_cannon_m', 'faction_scn');
  const reach = fireThroughProductionOwner('wpn_plasma_cannon_m', 'faction_reach');
  const concordColors = flightColorsForEntity(resolveWeaponRecipe('wpn_plasma_cannon_m'), concord.projectile, {});
  const reachColors = flightColorsForEntity(resolveWeaponRecipe('wpn_plasma_cannon_m'), reach.projectile, {});
  assert.notDeepEqual(concordColors, reachColors,
    'the same hostile weapon reads as its firing faction while retaining the same plasma recipe');

  const friendly = fireThroughProductionOwner('wpn_plasma_cannon_m', 'faction_scn', 0);
  const friendlyRecipe = resolveWeaponRecipe('wpn_plasma_cannon_m');
  assert.deepEqual(flightColorsForEntity(friendlyRecipe, friendly.projectile, {}), {
    core: friendlyRecipe.flight.coreColor,
    sheath: friendlyRecipe.flight.sheathColor,
  }, 'player projectile colors keep the authored family identity');
});
