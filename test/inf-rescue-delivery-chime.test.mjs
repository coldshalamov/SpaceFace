// inf-rescue-delivery-chime — the delivery moment has its own audio register.
//
// The rescue loop's delivery landed as text and voice (the fee receipt, the desk answer), but
// the sound of the moment was silence or, at best, whatever the next dock clunk would be: no
// cue existed on the seam at all. Now the pod crossing the protection ring answers with the
// receiving berth's own chime — a struck bell with an answering fifth, authored as its own
// recipe, mapped through the semantic cue contract, captioned for the muted floor. The fence's
// black-market ring keeps quiet (the fence desk owns that moment's voice) and an ambulance
// hull claiming a pod in open space chimes for nobody.
//
// Seed 4242. Focused owners: src/systems/survivorPod.js (emit), src/data/audioRecipes.js +
// src/audio/audioSystem.js (recipe + mapping), scripts/check-audio-identity.mjs (contract),
// src/ui/captions.js (authored caption).
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { survivorPod } from '../src/systems/survivorPod.js';

function boot(sectorId, { voice = true } = {}) {
  const bus = createBus();
  const state = {
    mode: 'flight',
    tick: 20,
    simTime: 30,
    playerId: 1,
    meta: { seed: 4242 },
    nextEntityId: 500,
    entities: new Map(),
    entityList: [],
    world: { currentSectorId: sectorId },
    player: { tether: { active: false, targetId: null } },
    traffic: { freighters: [] },
    story: { flags: {} },
    ui: {},
  };

  function add(entity) {
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
    return entity;
  }

  const player = add({
    id: 1,
    type: 'ship',
    team: 0,
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 12,
    mass: 100,
    hull: 200,
    hullMax: 200,
    data: {},
    flags: {},
  });

  const said = [];
  const toasts = [];
  const grants = [];
  const resolved = [];
  const cues = [];
  const helpers = voice
    ? { voice: { say: (msg) => { said.push(msg); return true; } } }
    : {};
  bus.on('toast', (p) => toasts.push(p));
  bus.on('economy:grantCredits', (p) => grants.push(p));
  bus.on('survivorPod:resolved', (p) => resolved.push(p));
  bus.on('audio:cue', (p) => cues.push(p));

  survivorPod.init({ state, bus, helpers, registry: null });

  function ejectPod() {
    const id = (state.nextEntityId += 1);
    const victim = add({
      id,
      type: 'ship',
      team: 2,
      factionId: 'faction_mts',
      alive: true,
      pos: { x: 800, z: 200 },
      vel: { x: 4, z: -1 },
      radius: 14,
      mass: 160,
      hull: 10,
      hullMax: 100,
      data: { trafficRole: 'hauler', role: 'hauler', ai: { archetype: 'mule_trader', passive: true } },
      flags: {},
    });
    const pod = survivorPod._spawnCausalPod(state, victim, { pos: victim.pos, vel: victim.vel });
    assert.ok(pod, 'causal pod spawned');
    pod.pos.x = 800;
    pod.pos.z = 200;
    player.pos.x = 800;
    player.pos.z = 214;
    return pod;
  }

  function addLawfulStation(x, z) {
    return add({
      id: (state.nextEntityId += 1),
      type: 'station',
      alive: true,
      factionId: 'faction_scn',
      pos: { x, z },
      radius: 40,
      data: { stationId: 'station_chime_probe', size: 'M' },
      flags: {},
    });
  }

  function latch(pod) {
    state.player.tether = { active: true, targetId: pod.id };
    bus.emit('tether:latched', { targetId: pod.id, ownerId: player.id });
  }

  return {
    state, bus, said, toasts, grants, resolved, cues, player,
    ejectPod, addLawfulStation, latch,
    restore() {
      if (typeof survivorPod.destroy === 'function') survivorPod.destroy();
    },
  };
}

const deliveryCues = (h) => h.cues.filter((c) => c && c.id === 'rescue.delivery');
const deskLines = (h) => h.said.filter((m) => String(m.id).startsWith('survivorDesk:'));

test('the pod crossing the ring answers with the receiving chime — once, at the pod', () => {
  const h = boot('sector_kepler_scar');
  try {
    const pod = h.ejectPod();
    h.latch(pod);

    // Away from any station: the tow holds and the moment has not happened yet.
    h.state.simTime += 1;
    survivorPod.update(1 / 60, h.state);
    assert.equal(deliveryCues(h).length, 0, 'no chime away from a berth');

    h.addLawfulStation(800, 200);
    h.state.simTime += 1;
    survivorPod.update(1 / 60, h.state);

    assert.equal(h.resolved.filter((r) => r.outcome === 'rescued').length, 1, 'the rescue resolved');
    assert.equal(deskLines(h).length, 1, 'the desk still answers in words');
    const cues = deliveryCues(h);
    assert.equal(cues.length, 1, 'the delivery chime rings once');
    assert.ok(cues[0].position && Number.isFinite(cues[0].position.x) && Number.isFinite(cues[0].position.z),
      'the chime is positioned where the pod crossed');
    assert.ok(Math.abs(cues[0].position.x - pod.pos.x) < 5 && Math.abs(cues[0].position.z - pod.pos.z) < 5,
      'the chime sounds at the ring, not at some map corner');

    // A later tick never rings twice.
    h.state.simTime += 1;
    survivorPod.update(1 / 60, h.state);
    assert.equal(deliveryCues(h).length, 1, 'the chime is once per rescue');
  } finally {
    h.restore();
  }
});

test('a fence delivery and an unattended claim keep the chime silent', () => {
  // The fence: its desk owns the ransom moment's voice; a black-market ring does not chime.
  const fence = boot('sector_kepler_scar');
  try {
    const pod = fence.ejectPod();
    fence.state.entityList.push({
      id: 901,
      type: 'station',
      alive: true,
      factionId: 'faction_reach',
      pos: { x: 800, z: 200 },
      radius: 34,
      data: { stationId: 'station_kepler_scar', stationTypeId: 'blackmarket', factionId: 'faction_reach' },
      flags: {},
    });
    fence.state.entities.set(901, fence.state.entityList[fence.state.entityList.length - 1]);
    fence.latch(pod);
    fence.state.simTime += 1;
    survivorPod.update(1 / 60, fence.state);
    assert.equal(fence.resolved.filter((r) => r.outcome === 'ransomed').length, 1,
      'the fence delivery still resolves as a ransom');
    assert.equal(deliveryCues(fence).length, 0, 'the fence ring stays quiet');
  } finally {
    fence.restore();
  }

  // An ambulance hull claiming a pod nobody towed: no delivery moment, no chime.
  const unattended = boot('sector_kepler_scar');
  try {
    unattended.ejectPod();
    unattended.state.entityList.push({
      id: 902,
      type: 'ship',
      team: 0,
      factionId: 'faction_free',
      alive: true,
      pos: { x: 860, z: 200 },
      vel: { x: 0, z: 0 },
      radius: 12,
      mass: 120,
      hull: 200,
      hullMax: 200,
      data: { trafficRole: 'rescue', role: 'rescue', worldRecordId: 'wr_chime_probe' },
      flags: {},
    });
    unattended.state.entities.set(902, unattended.state.entityList[unattended.state.entityList.length - 1]);
    unattended.state.traffic.freighters.push({ id: 902, role: 'rescue' });
    unattended.state.simTime += 1;
    survivorPod.update(1 / 60, unattended.state);
    assert.equal(unattended.grants.length, 0, 'no fee without the player tow');
    assert.equal(deliveryCues(unattended).length, 0, 'an unattended claim chimes for nobody');
  } finally {
    unattended.restore();
  }
});

test('the chime resolves to its own authored recipe, distinct from the dock clunk', async () => {
  // The identity contract's own boot shape: a window mock, then the audio owners.
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  const { AUDIO_RECIPE_BY_ID, resolveAudioCueRecipeId } = await import('../src/audio/audioSystem.js');
  const { RECIPES } = await import('../src/data/audioRecipes.js');

  assert.equal(resolveAudioCueRecipeId('rescue.delivery'), 'sfx_rescue_delivery_chime',
    'the semantic cue maps to the authored recipe');
  const recipe = AUDIO_RECIPE_BY_ID.sfx_rescue_delivery_chime;
  assert.ok(recipe, 'the recipe exists in the catalog');
  assert.equal(recipe.type, 'layered', 'the chime is a layered authored voice');
  assert.ok(recipe.layers.every((id) => AUDIO_RECIPE_BY_ID[id]), 'every layer resolves');
  assert.notEqual(recipe.id, 'sfx_dock_clunk', 'the moment is not the player hull dock clunk');
  assert.ok(RECIPES.some((r) => r.id === 'sfx_rescue_delivery_chime'), 'the catalog ships the recipe');
});

test('the chime carries an authored caption for the muted floor', async () => {
  const { captionForGameplayRecipe } = await import('../src/ui/captions.js');
  const caption = captionForGameplayRecipe('sfx_rescue_delivery_chime', { category: 'comms' }, null);
  assert.ok(caption, 'the caption resolves');
  assert.equal(caption.authored, true, 'the caption is authored, not the family fallback');
  assert.match(caption.text, /berth/i, `the caption names the moment: ${caption.text}`);
});
