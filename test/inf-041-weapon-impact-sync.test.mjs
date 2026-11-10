// INF-041 — one default-kit weapon's complete impact response.
//
// A concussion-cannon hit is the authoritative receipt: one combat:damage fans out to one
// composed cue (vfx contact + light lane, audio lane), a bounded heavy crunch (1–2 frames,
// never a held pose), and nothing else. A same-tick duplicate of the same pair is consumed;
// the next tick answers again; a miss never speaks as damage. Energy beams crunch nothing.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';
import { presentationAdapters, PRESENTATION_AUDIO_CUE_BY_ID } from '../src/systems/presentationAdapters.js';
import { PRESENTATION_RECIPES } from '../src/presentation/cueRecipes.js';
import {
  CRUNCH_HOLD_MAX_S,
  CRUNCH_HOLD_MIN_S,
  resolveKineticCrunch,
} from '../src/render/feel.js';

const CONCUSSION = 'wpn_concussion_cannon_m';
const PULSE = 'wpn_pulse_laser_s';

function createHarness() {
  const player = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, mass: 200, data: {} };
  const enemy = { id: 2, type: 'ship', alive: true, team: 1, pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, mass: 200, data: {} };
  const state = {
    tick: 100,
    simTime: 100 / 60,
    playerId: player.id,
    player: { heat: 0 },
    settings: { video: {}, accessibility: {} },
    world: { currentSectorId: 'sector_ceres_belt' },
    entities: new Map([[player.id, player], [enemy.id, enemy]]),
    entityList: [player, enemy],
  };
  const bus = createBus();
  return { state, bus };
}

/** One authoritative concussion hit exactly as the damage router words it. */
function concussionHit(overrides = {}) {
  return {
    targetId: 2,
    attackerId: 1,
    amount: 12,
    applied: 12,
    type: 'kinetic',
    channels: { kinetic: 12 },
    shieldDamage: 0,
    armorDamage: 0,
    hullDamage: 12,
    shieldHit: false,
    armorHit: false,
    hullHit: true,
    dominantLayer: 'hull',
    brokeShield: false,
    isPlayer: false,
    pos: { x: 100, z: 0 },
    approach: { x: -1, z: 0 },
    normal: { x: 1, z: 0 },
    before: { hull: 50 },
    after: { hull: 38 },
    origin: { kind: 'weapon', weaponId: CONCUSSION },
    weaponId: CONCUSSION,
    ...overrides,
  };
}

test('INF-041: the damage cue rides the authored lanes with an audio mapping', () => {
  const recipe = PRESENTATION_RECIPES['combat.damage.applied'];
  assert.ok(recipe, 'the shared cue path exists');
  assert.ok(recipe.lanes && recipe.lanes.vfx && recipe.lanes.audio, 'contact/light and sound lanes, not a new path');
  assert.ok(PRESENTATION_AUDIO_CUE_BY_ID['combat.damage.applied'], 'an authored audio mapping');
});

test('INF-041: one authoritative hit composes one cue, synchronously', () => {
  const h = createHarness();
  const presenter = Object.create(presentationOrchestrator);
  const adapters = Object.create(presentationAdapters);
  const cues = [];
  h.bus.on('presentation:cue', (payload) => cues.push(payload));
  presenter.init({ state: h.state, bus: h.bus });
  adapters.init({ state: h.state, bus: h.bus });
  try {
    h.bus.emit('combat:damage', concussionHit());
    h.bus.flush();
    const damage = cues.filter((cue) => cue.id === 'combat.damage.applied');
    assert.equal(damage.length, 1, 'one hit, one composed cue — inside the same flush, far under 100 ms');
    assert.ok(damage[0].lanes && damage[0].lanes.vfx && damage[0].lanes.audio, 'light/contact and sound travel together');
    assert.ok(Number.isFinite(damage[0].position.x) && Number.isFinite(damage[0].position.z), 'the contact has a place');
    assert.ok(damage[0].magnitude > 0, 'the hit has a size');
  } finally {
    adapters.dispose();
    presenter.dispose();
  }
});

test('INF-041: a same-tick duplicate is consumed; the next tick answers again', () => {
  const h = createHarness();
  const presenter = Object.create(presentationOrchestrator);
  const adapters = Object.create(presentationAdapters);
  const cues = [];
  h.bus.on('presentation:cue', (payload) => cues.push(payload));
  presenter.init({ state: h.state, bus: h.bus });
  adapters.init({ state: h.state, bus: h.bus });
  try {
    const count = () => cues.filter((cue) => cue.id === 'combat.damage.applied').length;
    h.bus.emit('combat:damage', concussionHit());
    h.bus.emit('combat:damage', concussionHit());
    h.bus.flush();
    assert.equal(count(), 1, 'the duplicate observation draws nothing twice');
    h.state.tick += 1;
    h.state.simTime = h.state.tick / 60;
    h.bus.emit('combat:damage', concussionHit());
    h.bus.flush();
    assert.equal(count(), 2, 'a rapid hit on its own tick still answers');
  } finally {
    adapters.dispose();
    presenter.dispose();
  }
});

test('INF-041: a miss never speaks as damage', () => {
  const h = createHarness();
  const presenter = Object.create(presentationOrchestrator);
  const adapters = Object.create(presentationAdapters);
  const cues = [];
  h.bus.on('presentation:cue', (payload) => cues.push(payload));
  presenter.init({ state: h.state, bus: h.bus });
  adapters.init({ state: h.state, bus: h.bus });
  try {
    h.bus.emit('projectile:nearMiss', { attackerId: 1, targetId: 2, pos: { x: 90, z: 5 } });
    h.bus.flush();
    assert.equal(cues.filter((cue) => cue.id === 'combat.damage.applied').length, 0, 'no receipt, no impact');
  } finally {
    adapters.dispose();
    presenter.dispose();
  }
});

test('INF-041: the concussion crunch is heavy, bounded, and never holds the picture', () => {
  const receipt = concussionHit();
  const crunch = resolveKineticCrunch(receipt, { playerId: 1 });
  assert.ok(crunch, 'the default-kit shove answers physically');
  assert.ok(crunch.hsDur >= CRUNCH_HOLD_MIN_S && crunch.hsDur <= CRUNCH_HOLD_MAX_S,
    'one to two frames of dip — bounded slow time, never permanent');
  assert.equal(crunch.holdsPose, false, 'the picture is never held against a running sim');
  assert.equal(resolveKineticCrunch(receipt, { playerId: 1, motionReduce: true }), null, 'Reduce opts out');
  assert.equal(resolveKineticCrunch(receipt, { playerId: 1, mode: 'menu' }), null, 'menus feel nothing');
  assert.equal(resolveKineticCrunch(receipt, { playerId: 99 }), null, 'an uninvolved furball feels nothing');
  assert.equal(
    resolveKineticCrunch({ ...receipt, weaponId: PULSE, type: 'energy' }, { playerId: 1 }),
    null, 'an energy beam invents no crunch',
  );
});
