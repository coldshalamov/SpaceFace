// build_map §24 "the picture and the sound" — the audible half.
//
// `optic:contact` (systems/weapons.js handleOpticProjectileHit) publishes the response the
// lattice gave — absorb (stone and spent/refusal prisms), reflect (metal), prism (live diamond
// ring). Each kind owns one cue so the player can hear which response happened. The optic
// cells are type 'asteroid', so the generic rock chip on `projectile:hit` would otherwise
// stack a second, wrong voice on top of the response cue.
//
// The seam under test is the real one: audio.init subscriptions on the live event bus ->
// play() cue requests, probed exactly the way hit-answer-channels.test.mjs probes combat hits.
// Burst collapse is the same admission-window shape _admitCollisionCue runs on simultaneous
// contacts: one voice per response kind per tick, re-armed on the next tick.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { makeEntity } from '../src/core/entity.js';
import {
  audio,
  AUDIO_RECIPE_BY_ID,
  OPTIC_CONTACT_RECIPES,
  OPTIC_REKINDLE_RECIPE,
  getBusForRecipe,
} from '../src/audio/audioSystem.js';
import {
  opticBookFor,
  opticFamilyIdOf,
  settleOpticContact,
} from '../src/combat/opticField.js';

// The cue ids the three responses must land on.
const CUE = {
  absorb: 'sfx_optic_absorb',
  reflect: 'sfx_optic_reflect',
  prism: 'sfx_optic_split',
};
const REKINDLE = 'sfx_optic_rekindle';
const ROCK_CHIP = 'sfx_mining_impact';

// Boot the real audio system against a real state + bus, then spy on play() — the same
// dispatch seam hit-answer-channels uses (a stubbed play still proves which cue the
// subscription requested; the recipe-map assertion proves real play() would accept it).
function wire() {
  const state = createGameState(4242);
  state.mode = 'flight';
  const bus = createBus();
  state.entities.set(state.playerId, makeEntity({
    id: state.playerId,
    type: 'ship',
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 4,
    alive: true,
  }));
  audio.init({ state, bus, helpers: {} });

  const played = [];
  const originalPlay = audio.play;
  audio.play = (cueId, opts) => { played.push({ cueId, opts: opts || {} }); return { id: cueId }; };
  return {
    state,
    bus,
    played,
    restore() {
      audio.play = originalPlay;
      audio.state = null;
      audio.rt = null;
      audio.bus = null;
    },
  };
}

// The payload shape weapons.js publishes on `optic:contact` (see handleOpticProjectileHit).
function contactPayload(kind, over = {}) {
  const material = { absorb: 'stone', reflect: 'metal', prism: 'diamond' }[kind] || 'stone';
  return {
    kind,
    reason: { absorb: 'stone', reflect: 'metal', prism: 'diamond' }[kind] || 'stone',
    materialId: material,
    projectileId: 100,
    targetId: 200,
    ownerId: 1,
    pos: { x: 24, z: 8 },
    rays: kind === 'prism' ? 8 : 0,
    spent: false,
    ...over,
  };
}

const cueIds = (played) => played.map((entry) => entry.cueId);

test('each optic contact response requests its own cue through the real subscription', () => {
  const live = wire();
  try {
    for (const kind of ['absorb', 'reflect', 'prism']) {
      live.state.tick += 1;
      live.bus.emit('optic:contact', contactPayload(kind));
    }
    for (const kind of ['absorb', 'reflect', 'prism']) {
      const hit = live.played.find((entry) => entry.cueId === CUE[kind]);
      assert.ok(hit, `${kind} must request ${CUE[kind]} (got ${cueIds(live.played).join(', ') || 'nothing'})`);
      assert.deepEqual(hit.opts.position, { x: 24, z: 8 }, `${kind} cue must stay positional at the contact`);
    }
    // The three responses are three different voices — "can hear which response happened".
    assert.equal(new Set(Object.values(CUE)).size, 3);
  } finally {
    live.restore();
  }
});

test('a spent or refused prism still thuds — absorb covers every bolt that died on the surface', () => {
  const live = wire();
  try {
    const refusals = ['spent', 'generation', 'family', 'stone'];
    for (const reason of refusals) {
      live.state.tick += 1;
      live.bus.emit('optic:contact', contactPayload('absorb', {
        reason,
        materialId: reason === 'stone' ? 'stone' : 'spent',
        spent: reason !== 'stone',
      }));
      const last = live.played[live.played.length - 1];
      assert.ok(last && last.cueId === CUE.absorb,
        `absorb reason ${reason} must request ${CUE.absorb}, got ${last && last.cueId}`);
    }
    assert.equal(live.played.length, refusals.length, 'one voice per tick, no stacking');
  } finally {
    live.restore();
  }
});

test('a same-tick lattice burst collapses to one voice per response kind', () => {
  const live = wire();
  try {
    // A prism ring lighting the neighborhood: 8 splits, splinters eating 4 stones, 2 ricochets —
    // all inside one tick.
    for (let i = 0; i < 8; i++) live.bus.emit('optic:contact', contactPayload('prism', { targetId: 200 + i }));
    for (let i = 0; i < 4; i++) live.bus.emit('optic:contact', contactPayload('absorb', { targetId: 300 + i }));
    for (let i = 0; i < 2; i++) live.bus.emit('optic:contact', contactPayload('reflect', { targetId: 400 + i }));

    assert.equal(live.played.length, 3,
      `14 contacts in one tick must speak once per kind, got ${cueIds(live.played).join(', ')}`);
    assert.deepEqual(new Set(cueIds(live.played)),
      new Set([CUE.prism, CUE.absorb, CUE.reflect]));

    // The next tick re-arms the window — a fresh prism speaks again, once.
    live.state.tick += 1;
    live.bus.emit('optic:contact', contactPayload('prism', { targetId: 500 }));
    live.bus.emit('optic:contact', contactPayload('prism', { targetId: 501 }));
    const after = live.played.slice(3);
    assert.equal(after.length, 1, 'the re-armed tick voices the new prism once');
    assert.equal(after[0].cueId, CUE.prism);
  } finally {
    live.restore();
  }
});

test('optic:rekindled is one soft shimmer per tick, never a volley', () => {
  const live = wire();
  try {
    for (let i = 0; i < 5; i++) {
      live.bus.emit('optic:rekindled', {
        targetId: 600 + i, structureId: 'field', cell: `${i},0`,
        materialId: 'diamond', pos: { x: 40 + i * 8, z: 0 },
      });
    }
    assert.equal(live.played.length, 1,
      `5 same-tick rekindles must collapse to one shimmer, got ${cueIds(live.played).join(', ')}`);
    assert.equal(live.played[0].cueId, REKINDLE);
    assert.ok(live.played[0].opts.gain <= 0.4, 'rekindle stays under the contact cues');

    // The shimmer does not consume the contact window — a prism same tick still cracks.
    live.bus.emit('optic:contact', contactPayload('prism', { targetId: 700 }));
    assert.ok(live.played.some((e) => e.cueId === CUE.prism), 'contact cues are independent of the rekindle lane');
  } finally {
    live.restore();
  }
});

test('optic cues are real recipes routed to the combat bus, distinct from the rock chip', () => {
  for (const recipeId of [...Object.values(CUE), REKINDLE]) {
    const recipe = AUDIO_RECIPE_BY_ID[recipeId];
    assert.ok(recipe, `${recipeId} must exist in the recipe map real play() consults`);
    assert.equal(getBusForRecipe(recipe, recipeId), 'combat',
      `${recipeId} rides the same combat channel as other impact cues (volume/mute path)`);
  }
  assert.equal(OPTIC_CONTACT_RECIPES.absorb, CUE.absorb);
  assert.equal(OPTIC_CONTACT_RECIPES.reflect, CUE.reflect);
  assert.equal(OPTIC_CONTACT_RECIPES.prism, CUE.prism);
  assert.equal(OPTIC_REKINDLE_RECIPE, REKINDLE);
});

test('an energy bolt on an optic cell does not stack the generic rock chip', () => {
  const live = wire();
  try {
    const cell = makeEntity({
      id: 200, type: 'asteroid', pos: { x: 24, z: 8 }, radius: 13, collides: true,
      data: { opticMaterial: 'stone' },
    });
    const plainRock = makeEntity({
      id: 201, type: 'asteroid', pos: { x: -30, z: 0 }, radius: 20, collides: true,
      data: {},
    });
    const bolt = makeEntity({
      id: 100, type: 'projectile', pos: { x: 20, z: 8 }, vel: { x: 220, z: 0 },
      radius: 0.7, collides: true,
      data: { damageType: 'energy', kind: 'bullet', damage: 8 },
    });
    const slug = makeEntity({
      id: 101, type: 'projectile', pos: { x: 20, z: 8 }, vel: { x: 220, z: 0 },
      radius: 0.7, collides: true,
      data: { damageType: 'kinetic', kind: 'bullet', damage: 8 },
    });
    for (const e of [cell, plainRock, bolt, slug]) live.state.entities.set(e.id, e);

    // The optic grammar claimed this contact: energy bolt into a tagged cell. The response
    // cue (optic:contact) is the voice — the rock chip must stay silent or the answer blurs.
    live.bus.emit('optic:contact', contactPayload('absorb'));
    live.bus.emit('projectile:hit', { projectileId: bolt.id, targetId: cell.id, pos: { x: 24, z: 8 } });
    assert.ok(live.played.some((e) => e.cueId === CUE.absorb), 'the absorb cue spoke');
    assert.ok(!live.played.some((e) => e.cueId === ROCK_CHIP),
      'the generic rock chip must not stack under the optic response');

    // A kinetic slug on the same cell is not an optic contact — it keeps the chip.
    live.state.tick += 1;
    live.bus.emit('projectile:hit', { projectileId: slug.id, targetId: cell.id, pos: { x: 24, z: 8 } });
    assert.ok(live.played.some((e) => e.cueId === ROCK_CHIP),
      'a kinetic hit on an optic cell still plays the rock chip');

    // And an energy bolt on a plain asteroid keeps the chip — only tagged cells are claimed.
    live.state.tick += 1;
    live.played.length = 0;
    live.bus.emit('projectile:hit', { projectileId: bolt.id, targetId: plainRock.id, pos: { x: -30, z: 0 } });
    assert.ok(live.played.some((e) => e.cueId === ROCK_CHIP),
      'an energy hit on ordinary rock still plays the rock chip');
  } finally {
    live.restore();
  }
});

test('the real settler vocabulary lands on the mapped cues', () => {
  // Drive settleOpticContact on real entities so a drift in plan.kind names (absorb/reflect/
  // prism) fails here instead of silently muting the field.
  const live = wire();
  try {
    const make = (id, material, x) => {
      const cell = makeEntity({
        id, type: 'asteroid', pos: { x, z: 0 }, radius: 13, collides: true,
        data: { opticMaterial: material },
      });
      live.state.entities.set(id, cell);
      return cell;
    };
    const stone = make(200, 'stone', 64);
    const metal = make(201, 'metal', 128);
    const diamond = make(202, 'diamond', 192);
    const boltFor = (id, x) => {
      const bolt = makeEntity({
        id, type: 'projectile', pos: { x, z: 0 }, vel: { x: 220, z: 0 },
        radius: 0.7, collides: true, ownerId: 1, team: 0,
        data: { damageType: 'energy', kind: 'bullet', damage: 8 },
      });
      live.state.entities.set(id, bolt);
      return bolt;
    };
    const book = new Map();

    const cases = [
      { bolt: boltFor(100, 50), target: stone, payload: { pos: { x: 51, z: 0 } } },
      { bolt: boltFor(101, 114), target: metal, payload: { pos: { x: 115, z: 0 }, normal: { x: -1, z: 0 } } },
      { bolt: boltFor(102, 178), target: diamond, payload: { pos: { x: 179, z: 0 } } },
    ];
    for (const c of cases) {
      const plan = settleOpticContact(c.bolt, c.target, c.payload, opticBookFor(book, opticFamilyIdOf(c.bolt)));
      assert.ok(plan && OPTIC_CONTACT_RECIPES[plan.kind],
        `settleOpticContact kind ${plan && plan.kind} must map to an optic cue`);
      live.state.tick += 1;
      live.bus.emit('optic:contact', {
        kind: plan.kind,
        reason: plan.reason,
        materialId: plan.materialId,
        projectileId: c.bolt.id,
        targetId: c.target.id,
        ownerId: c.bolt.ownerId,
        pos: c.payload.pos,
        rays: plan.rays ? plan.rays.length : 0,
        spent: plan.spentAt != null,
      });
    }
    assert.deepEqual(cueIds(live.played), [CUE.absorb, CUE.reflect, CUE.prism],
      'stone absorbs, metal reflects, diamond splits — three different voices');
  } finally {
    live.restore();
  }
});
