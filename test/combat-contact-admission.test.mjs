// Contact admission under saturation — the feel contract for player-visible combat contacts:
//
//  1. sustained residents (plume, field power, material contact, gyre payload) can never consume
//     every event-light slot; at least EVENT_LIGHT_TRANSIENT_RESERVE slots stay for contacts,
//     and a refused resident degrades for the frame and re-upserts on a later one;
//  2. a player-caused / player-target damage receipt derives its own high priority from
//     deriveVfxAdmissionMetadata instead of a fixed admission, so it beats ambient NPC flashes;
//  3. a player-facing structural contact admits per primitive group: a full shard pool drops only
//     the ejecta beats and keeps the contact blade / internal vent, and a fully refused player
//     contact never falls back to the fixed-palette generic cone;
//  4. `projectile:hit` and `combat:damage` for one attacker/target/tick are ONE contact: one pooled
//     light, one authored structural sheet, and duplicate receipts contribute residue only;
//  5. no new light count is introduced (fixed pool, fixed scene light census).
//
// Presentation only: no simulation is advanced, no damage is applied, no golden files move.

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import {
  EVENT_LIGHT_POOL_SIZE,
  EVENT_LIGHT_TRANSIENT_RESERVE,
  vfx,
} from '../src/render/vfx.js';
import {
  ArcadeStructuralFx,
  ARCADE_STRUCTURAL_FX_CAPACITY,
} from '../src/render/combat/arcadeStructuralFx.js';
import { makeImpactRecord } from '../src/render/combat/impactEventRecord.js';
import { arbitrateStructuralImpactCue } from '../src/presentation/cueArbitration.js';
import {
  deriveVfxAdmissionMetadata,
  isPlayerFacingVfxAdmission,
} from '../src/presentation/vfxAdmissionPriority.js';

const PLAYER_ID = 1;
const TARGET_ID = 9;
const AMBIENT_TARGET_ID = 77;
const AMBIENT_ATTACKER_ID = 44;
const KINETIC_WEAPON = 'wpn_autocannon_s';
// Concussion keeps the legacy propellant/impact family (keepLegacyHit), so `projectile:hit`
// reaches its own contact light before `combat:damage` reports the layer result.
const LEGACY_HIT_WEAPON = 'wpn_concussion_cannon_m';

function makeCanvas() {
  const listeners = [];
  return {
    addEventListener(type, fn) { listeners.push({ type, fn }); },
    removeEventListener(type, fn) {
      for (let i = listeners.length - 1; i >= 0; i--) {
        if (listeners[i].type === type && listeners[i].fn === fn) listeners.splice(i, 1);
      }
    },
    dispatchEvent(event) {
      for (const listener of listeners) {
        if (listener.type === (event && event.type)) listener.fn(event);
      }
      return true;
    },
  };
}

function makeHarness() {
  const scene = new THREE.Scene();
  const player = {
    id: PLAYER_ID,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 4, z: 1 },
    rot: 0,
    radius: 6,
    shield: 0,
  };
  const target = {
    id: TARGET_ID,
    type: 'ship',
    alive: true,
    pos: { x: 8, z: 3 },
    vel: { x: -2, z: 0 },
    rot: 0,
    radius: 8,
    shield: 0,
  };
  const state = {
    playerId: PLAYER_ID,
    player: { targetId: TARGET_ID },
    entities: new Map([[PLAYER_ID, player], [TARGET_ID, target]]),
    entityList: [player, target],
    simTime: 12,
    tick: 720,
    settings: {
      video: { particleQuality: 'low', motionReduce: false, engineTrails: false },
      accessibility: { flashReduce: false },
    },
    render: {
      scene,
      renderer: { domElement: makeCanvas() },
    },
  };
  const bus = createBus();
  const system = Object.create(vfx);
  system.init({ state, bus, helpers: { player: () => player } });
  return { system, state, bus, player, target, scene };
}

function spawned(fx) {
  const stats = fx.stats();
  return {
    blades: stats.blades.spawned,
    arcs: stats.arcs.spawned,
    shards: stats.shards.spawned,
    plates: stats.plates.spawned,
  };
}

function totalSpawned(fx) {
  const s = spawned(fx);
  return s.blades + s.arcs + s.shards + s.plates;
}

function contactRecord(overrides = {}) {
  return makeImpactRecord(undefined, {
    x: 4, y: 0.4, z: -2,
    nx: 0, ny: 0, nz: 1,
    axisSigned: true,
    severity: 0.45,
    materialId: 'hull',
    radiusWU: 6,
    simTime: 12,
    serial: 7,
    eventClass: 'pinprick',
    ...overrides,
  });
}

function damagePayload(overrides = {}) {
  return {
    attackerId: PLAYER_ID,
    targetId: TARGET_ID,
    weaponId: KINETIC_WEAPON,
    hullHit: true,
    armorHit: false,
    amount: 18,
    pos: { x: 8, z: 3 },
    normal: { x: -1, z: 0 },
    approach: { x: 1, z: 0 },
    ...overrides,
  };
}

function captureImpactView(system) {
  system._initArcadeStructural();
  const fx = system._arcadeStructural;
  const captured = { view: null, count: 0 };
  const realEmit = fx.emitImpact.bind(fx);
  fx.emitImpact = (rec, view) => {
    captured.count += 1;
    captured.view = { ...view };
    return realEmit(rec, view);
  };
  return captured;
}

// ── 1. sustained residents cannot starve the transient reserve ───────────────

test('sustained residents leave the transient reserve and re-upsert after a release', () => {
  const { system, scene } = makeHarness();
  assert.equal(EVENT_LIGHT_POOL_SIZE, 6);
  assert.equal(EVENT_LIGHT_TRANSIENT_RESERVE, 2);
  assert.equal(scene.children.filter((child) => child.isPointLight).length, EVENT_LIGHT_POOL_SIZE);

  // Every sustained key the renderer can hold at once, plus the plume — six requests for six slots.
  const keys = [
    'player-plume',
    'field-power-0',
    'field-power-1',
    'living-material-contact',
    'gyre-payload',
    'law-wanted-flip',
  ];
  const residents = keys.filter((key) => system._claimEventLightSlot(0.9, key));
  assert.equal(residents.length, EVENT_LIGHT_POOL_SIZE - EVENT_LIGHT_TRANSIENT_RESERVE,
    'residents stop at the transient reserve');
  assert.equal(
    system._lights.filter((slot) => slot.active && slot.sustainedKey != null).length,
    residents.length,
  );
  assert.equal(system._freeLightCount, EVENT_LIGHT_TRANSIENT_RESERVE,
    'two slots stay free for contact flashes');

  // Both reserved slots admit a real contact light.
  for (let i = 0; i < EVENT_LIGHT_TRANSIENT_RESERVE; i++) {
    assert.equal(
      system._flashLight({ x: i, z: 0 }, '#ff9a5a', 2.6, 12, 90, 0.6),
      true,
      'a contact light always has a home under sustained load',
    );
  }
  assert.equal(system._activeLightCount, EVENT_LIGHT_POOL_SIZE);

  // An extra resident is refused while the pool is full, then re-upserts on a later frame once a
  // resident releases — the caller retries every frame, so a refusal is a one-frame degrade.
  assert.equal(system._claimEventLightSlot(0.99, 'extra-resident'), null);
  system._retireEventLightSlot(system._findSustainedEventLight('field-power-0'));
  assert.ok(system._claimEventLightSlot(0.99, 'extra-resident'),
    'a released resident slot is claimable on the next upsert');

  // The visible light count never moves: same six objects, same scene census.
  assert.equal(scene.children.filter((child) => child.isPointLight).length, EVENT_LIGHT_POOL_SIZE);
  assert.equal(system._lights.length, EVENT_LIGHT_POOL_SIZE);
  system.destroy();
});

// ── 2. player contact priority under ambient load ────────────────────────────

test('collision receipts read the player side from either slot', () => {
  const { system } = makeHarness();
  const ram = system._collisionAdmission({ aId: TARGET_ID, bId: PLAYER_ID, pos: { x: 4, z: 0 } }, 0.5);
  const consequenceVictim = system._collisionAdmission(
    { targetId: PLAYER_ID, otherId: AMBIENT_ATTACKER_ID, pos: { x: 1, z: 0 } },
    0.5,
  );
  const consequenceRam = system._collisionAdmission(
    { targetId: AMBIENT_TARGET_ID, otherId: PLAYER_ID, pos: { x: 5, z: 0 } },
    0.5,
  );
  const ambient = system._collisionAdmission(
    { aId: AMBIENT_ATTACKER_ID, bId: AMBIENT_TARGET_ID, pos: { x: 300, z: 0 } },
    0.5,
  );
  assert.equal(isPlayerFacingVfxAdmission(ram), true, 'player is the second collider');
  assert.equal(isPlayerFacingVfxAdmission(consequenceVictim), true, 'player is the victim');
  assert.equal(isPlayerFacingVfxAdmission(consequenceRam), true, 'player is the rammer');
  assert.equal(isPlayerFacingVfxAdmission(ambient), false, 'NPC-on-NPC scrape');
  assert.ok(ram.admissionPriority > ambient.admissionPriority + 0.2);
  system.destroy();
});

test('a player collision admits per group with the derived band', () => {
  const { system } = makeHarness();
  const view = captureImpactView(system);
  assert.equal(system._onPhysicsImpact({
    backend: 'rapier-dynamic',
    consequenceKernelVersion: 1,
    tick: 720,
    aId: TARGET_ID,
    bId: PLAYER_ID,
    pos: { x: 4, z: 1 },
    impulse: 900,
    dp: 900,
  }), true);
  assert.ok(view.view, 'the player collision composed an authored contact sheet');
  assert.equal(view.view.partial, true, 'player collisions admit per primitive group');
  assert.ok(view.view.priority > 0.5, `collision priority ${view.view.priority} clears ambient`);
  system.destroy();
});

test('player-caused and player-target receipts outrank ambient NPC load', () => {
  const { system, state, bus } = makeHarness();
  const playerAdmission = deriveVfxAdmissionMetadata(damagePayload(), state);
  const incomingAdmission = deriveVfxAdmissionMetadata(
    { attackerId: AMBIENT_ATTACKER_ID, targetId: PLAYER_ID, pos: { x: 1, z: 0 } },
    state,
  );
  const ambientAdmission = deriveVfxAdmissionMetadata(
    {
      attackerId: AMBIENT_ATTACKER_ID,
      targetId: AMBIENT_TARGET_ID,
      pos: { x: 400, z: 0 },
    },
    state,
  );
  assert.equal(isPlayerFacingVfxAdmission(playerAdmission), true, 'player-caused');
  assert.equal(isPlayerFacingVfxAdmission(incomingAdmission), true, 'player-target');
  assert.equal(isPlayerFacingVfxAdmission(ambientAdmission), false, 'NPC-on-NPC ambient');
  assert.ok(
    playerAdmission.admissionPriority > ambientAdmission.admissionPriority + 0.2,
    `player ${playerAdmission.admissionPriority} must clear ambient ${ambientAdmission.admissionPriority}`,
  );

  // Six ambient contact flashes already hold the whole pool at the weakest priority.
  for (let i = 0; i < EVENT_LIGHT_POOL_SIZE; i++) {
    assert.equal(system._flashLight({ x: i, z: 0 }, '#ffffff', 1.2, 9, 60, 0.12), true);
  }
  const view = captureImpactView(system);
  bus.emit('combat:damage', damagePayload({ armorHit: true, hullHit: false }));

  const playerLit = system._lights.filter(
    (slot) => slot.active && slot.admissionPriority >= 0.7,
  );
  assert.equal(playerLit.length, 1,
    'the player contact evicted an ambient flash instead of being refused');
  assert.ok(view.view, 'the player contact composed an authored structural sheet');
  assert.equal(view.view.partial, true, 'a player-facing contact admits per primitive group');
  assert.ok(
    view.view.priority >= playerAdmission.admissionPriority - 1e-9,
    `structural priority ${view.view.priority} carries the derived band`,
  );

  // The same receipt for an ambient pair keeps its authored floor and stays all-or-nothing.
  bus.emit('combat:damage', damagePayload({
    attackerId: AMBIENT_ATTACKER_ID,
    targetId: AMBIENT_TARGET_ID,
    pos: { x: 400, z: 0 },
  }));
  assert.equal(view.view.partial, false, 'ambient contacts do not get per-group admission');
  system.destroy();
});

test('incoming fire on the player clears the authored ambient contact band', () => {
  const { system, bus } = makeHarness();
  // Six NPC contacts at the authored impact preset band (0.6) — the full pool.
  for (let i = 0; i < EVENT_LIGHT_POOL_SIZE; i++) {
    assert.equal(system._flashLight({ x: i, z: 0 }, '#ff9a5a', 2.6, 12, 90, 0.6), true);
  }
  bus.emit('combat:damage', damagePayload({
    attackerId: AMBIENT_ATTACKER_ID,
    targetId: PLAYER_ID,
    pos: { x: 1, z: 0 },
  }));
  const contact = system._contactReceipts.get(
    `${AMBIENT_ATTACKER_ID}\u0000${PLAYER_ID}\u0000720`,
  );
  assert.ok(contact, 'the incoming hit has a contact record');
  assert.ok(contact.lightOwner, 'incoming fire owns a contact light');
  assert.ok(contact.lightPriority >= 0.78,
    `player-target light ${contact.lightPriority} clears the 0.6 authored band`);
  assert.equal(system._activeLightCount, EVENT_LIGHT_POOL_SIZE, 'still exactly six lights');
  system.destroy();
});

test('a stale contact record cannot re-arm a slot recycled by another event', () => {
  const { system } = makeHarness();
  const contact = {
    tick: 1, lightOwner: null, lightSlot: -1, lightPriority: 0, lightSerial: -1,
    damagePictured: false,
  };
  assert.equal(system._emitContactLight(contact, { x: 0, z: 0 }, 'graze', undefined, 0.2), true);
  const slotIndex = contact.lightSlot;
  // Five unrelated transients at 0.95 make the weak contact light the obvious eviction target.
  for (let i = 0; i < EVENT_LIGHT_POOL_SIZE - 1; i++) {
    assert.equal(system._flashLight({ x: i + 2, z: 2 }, '#ffffff', 2, 9, 80, 0.95), true);
  }
  assert.equal(system._flashLight({ x: 40, z: 40 }, '#ffffff', 3, 9, 80, 1), true);
  assert.notEqual(system._lights[slotIndex].admissionSerial, contact.lightSerial);
  assert.equal(system._lights[slotIndex].admissionPriority, 1,
    'the stronger event recycled the slot');

  // A late preferred receipt cannot overwrite the 1.0 occupant: the normal pool law refuses 0.9.
  assert.equal(
    system._emitContactLight(contact, { x: 7, z: 7 }, 'shield', { peak: 4 }, 0.9),
    false,
  );
  assert.equal(contact.lightOwner, null, 'the stale record forgot its ownership');
  assert.equal(system._lights[slotIndex].admissionPriority, 1,
    'the stronger event keeps its slot');
  assert.equal(system._activeLightCount, EVENT_LIGHT_POOL_SIZE);
  system.destroy();
});

// ── 3. per-primitive structural admission ────────────────────────────────────

test('per-primitive admission keeps the contact blade when the shard pool is full', () => {
  const fx = new ArcadeStructuralFx(null);
  const spec = { x: 1, z: -1, y: 0.4, priority: 0.9, life: 30 };
  for (let i = 0; i < ARCADE_STRUCTURAL_FX_CAPACITY.shards; i++) fx.spawnShard(spec);
  const before = spawned(fx);

  // Ambient decoration keeps the pre-existing all-or-nothing refusal.
  const ambient = fx.emitImpact(contactRecord(), { x: 0, y: 0.4, z: 0, priority: 0.55 });
  assert.equal(ambient, 0, 'a saturated ambient cue is refused whole');
  assert.deepEqual(spawned(fx), before);

  // A player-facing contact drops only the primitive group that is full.
  const player = fx.emitImpact(contactRecord({ serial: 8 }), {
    x: 0, y: 0.4, z: 0, priority: 0.8, partial: true,
  });
  assert.ok(player > 0, 'the player contact still draws');
  const after = spawned(fx);
  assert.ok(after.blades > before.blades,
    'the primary contact blade survives a full shard pool');
  assert.ok(after.arcs > before.arcs, 'the authored aftermath arc still draws');
  assert.equal(after.shards, before.shards, 'the refused group drops only its own beats');
  assert.equal(fx.stats().cues.refused, 1);
  assert.equal(fx.stats().cues.admitted, 1);
  fx.dispose();
});

test('the impact arbiter reports per-group fit without changing the ambient contract', () => {
  const full = { live: true, admission() { return 'refuse'; } };
  const free = { live: true, admission() { return 'free'; } };
  const groups = [null, null];

  const ambient = arbitrateStructuralImpactCue([free, full], { priority: 0.5 });
  assert.equal(ambient.admitted, false);
  assert.equal(ambient.reason, 'over_budget');

  const player = arbitrateStructuralImpactCue([free, full], {
    priority: 0.5, partial: true, groups,
  });
  assert.equal(player.admitted, true);
  assert.deepEqual(groups, [true, false], 'only the group whose own budget fits is admitted');

  const none = arbitrateStructuralImpactCue([full, full], {
    priority: 0.5, partial: true, groups,
  });
  assert.equal(none.admitted, false);
  assert.equal(none.reason, 'over_budget');
  assert.deepEqual(groups, [false, false]);
});

test('a refused player contact never falls back to the fixed-palette cone', () => {
  const { system, bus } = makeHarness();
  system._initArcadeStructural();
  const fx = system._arcadeStructural;
  const spec = { x: 1, z: -1, y: 0.4, priority: 0.99, life: 30 };
  for (const pool of [fx.blades, fx.arcs, fx.shards, fx.plates]) {
    for (let i = 0; i < pool.capacity; i++) pool.spawn(spec);
  }
  const cones = [];
  system._impactParticleCone = (...args) => { cones.push(args); };

  bus.emit('combat:damage', damagePayload());
  assert.equal(cones.length, 0,
    'a saturated player contact draws residue, never the generic fixed-palette cone');
  assert.equal(fx.stats().cues.refused, 1, 'the structural sheet really was refused');
  system.destroy();
});

// ── 4. one receipt per contact ───────────────────────────────────────────────

test('projectile:hit and combat:damage for one contact produce one primary light', () => {
  const { system, state, bus } = makeHarness();
  system._initArcadeStructural();
  const fx = system._arcadeStructural;

  bus.emit('projectile:hit', {
    targetId: TARGET_ID,
    ownerId: PLAYER_ID,
    weaponId: LEGACY_HIT_WEAPON,
    pos: { x: 8, z: 3 },
    approach: { x: 1, z: 0 },
    normal: { x: -1, z: 0 },
    damage: 18,
  });
  assert.equal(system._activeLightCount, 1, 'the hit receipt owns the contact light');
  assert.equal(totalSpawned(fx), 0, 'an ordinary hit composes no structural sheet by itself');

  bus.emit('combat:damage', damagePayload());
  assert.equal(system._activeLightCount, 1,
    'combat:damage for the same contact must not light a second one');
  assert.ok(totalSpawned(fx) > 0, 'the damage receipt still owns the authored contact structure');
  const afterDamage = totalSpawned(fx);

  const records = [...system._contactReceipts.values()];
  assert.equal(records.length, 1, 'one contact identity for both receipts');
  assert.equal(records[0].lightOwner, 'impact', 'the first admitted receipt owns the light slot');
  assert.equal(records[0].damagePictured, true);

  // A repeat of the same receipt is residue only: no second light, no second structural sheet.
  bus.emit('combat:damage', damagePayload());
  assert.equal(system._activeLightCount, 1);
  assert.equal(totalSpawned(fx), afterDamage, 'a duplicate receipt cannot respawn the sheet');

  // A later tick is a different contact and earns its own light + record.
  state.tick += 1;
  bus.emit('combat:damage', damagePayload());
  assert.equal(system._activeLightCount, 2, 'a new tick is a new contact');
  assert.equal(system._contactReceipts.size, 2);
  system.destroy();
});

test('the preferred player receipt takes over a contact light in place', () => {
  const { system } = makeHarness();
  // One contact identity; the first admission is ambient, the preferred one is player-facing.
  const contact = system._contactReceipt({
    attackerId: AMBIENT_ATTACKER_ID,
    targetId: AMBIENT_TARGET_ID,
    pos: { x: 4, z: 0 },
  });
  assert.ok(contact);
  assert.equal(system._emitContactLight(contact, { x: 4, z: 0 }, 'impact', undefined, 0.2), true);
  assert.equal(system._activeLightCount, 1);
  const slot = system._lights.find((entry) => entry.active);
  assert.ok(slot.admissionPriority < 0.5, 'the first light carried the ambient band');

  assert.equal(system._emitContactLight(contact, { x: 4, z: 0 }, 'impact', undefined, 0.85), true);
  assert.equal(system._activeLightCount, 1,
    'the preferred receipt re-arms the same slot instead of adding a light');
  assert.ok(slot.active && slot.admissionPriority >= 0.85,
    'the preferred player receipt now authors the contact light');
  assert.equal(contact.lightOwner, 'impact');
  assert.ok(contact.lightPriority >= 0.85);
  system.destroy();
});

// ── 5. no new light count ────────────────────────────────────────────────────

test('contact admission never adds a visible light or a new pool slot', () => {
  const { system, scene, bus } = makeHarness();
  const count = () => scene.children.filter((child) => child.isPointLight).length;
  assert.equal(count(), EVENT_LIGHT_POOL_SIZE);
  const objects = system._lights.map((slot) => slot.obj);
  bus.emit('projectile:hit', {
    targetId: TARGET_ID,
    ownerId: PLAYER_ID,
    weaponId: LEGACY_HIT_WEAPON,
    pos: { x: 8, z: 3 },
    approach: { x: 1, z: 0 },
    normal: { x: -1, z: 0 },
    damage: 18,
  });
  bus.emit('combat:damage', damagePayload());
  assert.equal(count(), EVENT_LIGHT_POOL_SIZE);
  assert.equal(system._lights.length, EVENT_LIGHT_POOL_SIZE);
  assert.deepEqual(system._lights.map((slot) => slot.obj), objects);
  system.destroy();
});
