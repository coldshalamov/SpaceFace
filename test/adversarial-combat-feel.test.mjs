// Hostile proof for the uncommitted combat-feel / contact-VFX slice. This suite deliberately
// attacks the edges the candidate claims are safe: a saturated fixed light pool, duplicate and
// ambiguous contact receipts, player-facing priority inversion, render-only tumble reactions under
// absurd payloads, unbounded weapon kicks, the material/event audio vocabulary, and the fixed-seed
// bench schema.
//
// Every test imports the production owners directly. Where the live route needs a host, this file
// mirrors the Object.create(productionOwner) harnesses in the companion focused suites.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import {
  EVENT_LIGHT_POOL_SIZE,
  EVENT_LIGHT_TRANSIENT_RESERVE,
  vfx,
} from '../src/render/vfx.js';
import {
  ARCADE_STRUCTURAL_FX_CAPACITY,
} from '../src/render/combat/arcadeStructuralFx.js';
import {
  deriveVfxAdmissionMetadata,
  isPlayerFacingVfxAdmission,
} from '../src/presentation/vfxAdmissionPriority.js';
import {
  SUB_TUMBLE_HELM_MAX,
  SUB_TUMBLE_PITCH_MAX,
  SUB_TUMBLE_ROLL_MAX,
  SUB_TUMBLE_YAW_MAX,
  createShipMicroMotionTracker,
  resolveSubTumbleReaction,
} from '../src/render/shipMicroMotion.js';
import { readTumbleStatus } from '../src/combat/tumbleStatus.js';
import {
  CRUNCH_HOLD_MAX_S,
  HS_CAMERA_HOLD_MAX,
  WEAPON_KICK_WU_MAX,
  feel,
  resolveWeaponImpactKick,
} from '../src/render/feel.js';
import {
  IMPACT_MATERIALS,
  impactMaterialForTarget,
  normalizeImpactMaterial,
  resolveImpactAudioCue,
} from '../src/presentation/causalVfxGrammar.js';
import {
  AUDIO_RECIPE_BY_ID,
  audio,
  resolveAudioCueRecipeId,
  resolveImpactDamageVoice,
} from '../src/audio/audioSystem.js';
import {
  emitImpactAudioCue,
} from '../src/systems/presentationAdapters.js';
import {
  SCENARIOS,
  STEP_SECONDS,
  catalogSummary,
  scenarioById,
  weaponForShot,
} from '../scripts/combat-feel/catalog.mjs';
import {
  buildBeatTimes,
  buildShotPlan,
  frameForTime,
} from '../scripts/combat-feel/beatMath.mjs';
import {
  sampleCaptureManifest,
  validateCaptureManifest,
} from '../scripts/combat-feel/manifest.mjs';

const PLAYER_ID = 1;
const TARGET_ID = 9;
const AMBIENT_ATTACKER_ID = 44;
const AMBIENT_TARGET_ID = 77;
const KINETIC_WEAPON = 'wpn_autocannon_s';
const LEGACY_HIT_WEAPON = 'wpn_concussion_cannon_m';
const DT = 1 / 60;

// --- VFX host --------------------------------------------------------------------------------

function makeCanvas() {
  return {
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return true; },
  };
}

function makeVfxHarness() {
  const scene = new THREE.Scene();
  const player = {
    id: PLAYER_ID,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 6,
    shield: 0,
  };
  const target = {
    id: TARGET_ID,
    type: 'ship',
    alive: true,
    pos: { x: 8, z: 3 },
    vel: { x: 0, z: 0 },
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

function sceneLightCount(scene) {
  return scene.children.filter((child) => child.isPointLight).length;
}

function assertPoolInvariant(system, scene) {
  assert.equal(system._lights.length, EVENT_LIGHT_POOL_SIZE, 'the pool keeps its fixed size');
  assert.equal(system._activeLightCount, system._lights.filter((slot) => slot.active).length,
    'active count matches the slot table');
  assert.equal(system._freeLightCount, system._lights.filter((slot) => !slot.active).length,
    'free count matches the retired slots');
  assert.equal(sceneLightCount(scene), EVENT_LIGHT_POOL_SIZE,
    'the visible point-light census never moves');
  const seen = new Set();
  for (let i = 0; i < system._freeLightCount; i++) {
    const index = system._freeLights[i];
    assert.equal(seen.has(index), false, `free slot ${index} is listed twice`);
    seen.add(index);
    assert.equal(system._lights[index].active, false, `free slot ${index} is still active`);
  }
  for (const slot of system._lights) {
    if (slot.active && slot.sustainedKey != null) {
      assert.equal(slot.sustained, true, 'a sustained key marks the slot sustained');
    } else if (slot.active) {
      assert.equal(slot.sustained, false, 'a transient slot is not marked sustained');
    }
  }
}

function flash(system, x, priority, peak = 2.4) {
  return system._flashLight({ x, z: 0 }, '#ffffff', peak, 9, 80, priority);
}

function fillAmbientBand(system, count, priority) {
  for (let i = 0; i < count; i++) {
    assert.equal(flash(system, i, priority), true, `ambient flash ${i} was admitted`);
  }
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

function incomingPayload(overrides = {}) {
  return damagePayload({
    attackerId: AMBIENT_ATTACKER_ID,
    targetId: PLAYER_ID,
    pos: { x: 1, z: 0 },
    normal: { x: -1, z: 0 },
    approach: { x: 1, z: 0 },
    ...overrides,
  });
}

// Capture the actual light requests that reach the fixed pool (not just the return flag).
function captureLightRequests(system) {
  const calls = [];
  const realFlash = system._flashLight.bind(system);
  system._flashLight = (pos, color, peak, decayRate, dist, priority) => {
    const ok = realFlash(pos, color, peak, decayRate, dist, priority);
    calls.push({ pos, color, peak, decayRate, dist, priority, ok });
    return ok;
  };
  return calls;
}

// --- 1. light census -------------------------------------------------------------------------

test('six transient lights saturate the pool; sustained claims never displace one and recover', () => {
  const { system, scene } = makeVfxHarness();
  assert.equal(EVENT_LIGHT_POOL_SIZE, 6);
  assert.equal(EVENT_LIGHT_TRANSIENT_RESERVE, 2);
  assert.equal(sceneLightCount(scene), EVENT_LIGHT_POOL_SIZE);

  fillAmbientBand(system, EVENT_LIGHT_POOL_SIZE, 0.9);
  assert.equal(system._activeLightCount, EVENT_LIGHT_POOL_SIZE);
  assert.equal(system._freeLightCount, 0);
  const transients = system._lights.map((slot) => ({
    slot: slot.slot,
    obj: slot.obj,
    serial: slot.admissionSerial,
  }));

  // Every sustained resident the renderer can hold at once is refused: none may evict a transient.
  const residentKeys = [
    'player-plume',
    'field-power-0',
    'field-power-1',
    'living-material-contact',
    'gyre-payload',
    'law-wanted-flip',
  ];
  for (const key of residentKeys) {
    assert.equal(system._claimEventLightSlot(0.99, key), null,
      `${key} must be refused while six transients hold the pool`);
  }
  assert.equal(system._activeLightCount, EVENT_LIGHT_POOL_SIZE, 'no sustained claim changed the count');
  assert.equal(system._freeLightCount, 0, 'no sustained claim freed a slot');
  assert.equal(system._lights.filter((slot) => slot.active && slot.sustainedKey != null).length, 0,
    'no transient was converted into a resident');
  transients.forEach((before, index) => {
    const slot = system._lights[index];
    assert.equal(slot.active, true, `transient slot ${index} still active`);
    assert.equal(slot.obj, before.obj, `transient slot ${index} still owns its light object`);
    assert.equal(slot.admissionSerial, before.serial, `transient slot ${index} was not re-authored`);
  });

  // A stronger transient may evict the weakest transient, but it reuses a slot: there is no 7th.
  assert.equal(flash(system, 40, 0.95), true);
  assert.equal(system._activeLightCount, EVENT_LIGHT_POOL_SIZE);
  assert.equal(sceneLightCount(scene), EVENT_LIGHT_POOL_SIZE);
  assert.equal(system._lights.length, EVENT_LIGHT_POOL_SIZE);

  // Next frame: the transients decay, residents claim, and contacts still get their reserved slots.
  system._decayEventLights(10);
  assert.equal(system._activeLightCount, 0, 'every transient retired after its decay window');
  assert.equal(system._freeLightCount, EVENT_LIGHT_POOL_SIZE);
  let residents = 0;
  for (const key of residentKeys) {
    if (system._claimEventLightSlot(0.9, key)) residents++;
  }
  assert.equal(residents, EVENT_LIGHT_POOL_SIZE - EVENT_LIGHT_TRANSIENT_RESERVE,
    'residents stop at the transient reserve');
  assert.equal(system._freeLightCount, EVENT_LIGHT_TRANSIENT_RESERVE,
    'two slots stay transient-claimable');
  assert.equal(flash(system, 10, 0.7), true, 'contact one uses the reserve');
  assert.equal(flash(system, 11, 0.7), true, 'contact two uses the reserve');
  assert.equal(system._activeLightCount, EVENT_LIGHT_POOL_SIZE);
  assert.equal(system._claimEventLightSlot(0.99, 'extra-resident'), null,
    'a fifth resident cannot take a transient reserve slot');

  // A released resident frees a sustained slot; the refused resident re-upserts on the next frame.
  system._retireEventLightSlot(system._findSustainedEventLight('field-power-0'));
  assert.ok(system._claimEventLightSlot(0.99, 'extra-resident'),
    'the refused resident is claimable after a release');
  assert.equal(system._activeLightCount, EVENT_LIGHT_POOL_SIZE);
  assertPoolInvariant(system, scene);

  system.destroy();
  assert.equal(system._contactReceipts, null);
  assert.equal(sceneLightCount(scene), 0, 'destroy removes the pooled lights from the scene');
});

test('sector change, save restore and destroy clear receipts without resurrecting stale ids', () => {
  const { system, state, bus, scene } = makeVfxHarness();
  const hit = {
    targetId: TARGET_ID,
    ownerId: PLAYER_ID,
    weaponId: LEGACY_HIT_WEAPON,
    pos: { x: 8, z: 3 },
    approach: { x: 1, z: 0 },
    normal: { x: -1, z: 0 },
    damage: 18,
  };

  bus.emit('projectile:hit', hit);
  assert.equal(system._contactReceipts.size, 1);
  assert.equal(system._activeLightCount, 1);
  const firstRecord = [...system._contactReceipts.values()][0];
  assert.ok(firstRecord.lightSlot >= 0);

  bus.emit('sector:enter', { sectorId: 'next' });
  assert.equal(system._contactReceipts.size, 0, 'a sector change clears contact identity');
  assert.equal(system._activeLightCount, 0, 'the stale contact light is released, not left burning');
  assert.equal(sceneLightCount(scene), EVENT_LIGHT_POOL_SIZE);
  assertPoolInvariant(system, scene);

  // The same attacker/target/tick in the new sector is a NEW contact, not the old one.
  bus.emit('projectile:hit', hit);
  assert.equal(system._contactReceipts.size, 1);
  const secondRecord = [...system._contactReceipts.values()][0];
  assert.notEqual(secondRecord, firstRecord, 'the cleared record did not resurrect');
  assert.equal(system._activeLightCount, 1, 'the new contact lit one light, not a stale pair');

  bus.emit('save:loaded', {});
  assert.equal(system._contactReceipts.size, 0, 'a save restore clears contact identity');
  assert.equal(system._activeLightCount, 0, 'the pre-restore contact light is released');
  bus.emit('projectile:hit', hit);
  assert.equal(system._contactReceipts.size, 1);
  assert.notEqual([...system._contactReceipts.values()][0], secondRecord);

  // destroy is terminal for the pool and the receipt map.
  system.destroy();
  assert.equal(system._contactReceipts, null);
  assert.equal(system._lights.length, 0);
  assert.equal(sceneLightCount(scene), 0);

  // Re-initializing the same owner builds a fresh pool and a fresh receipt map; no stale id returns.
  system.init({ state, bus, helpers: { player: () => state.entities.get(PLAYER_ID) } });
  assert.equal(system._contactReceipts.size, 0);
  assert.equal(system._activeLightCount, 0);
  assert.equal(sceneLightCount(scene), EVENT_LIGHT_POOL_SIZE);
  bus.emit('projectile:hit', hit);
  assert.equal(system._contactReceipts.size, 1);
  assert.equal(system._activeLightCount, 1);
  assert.notEqual([...system._contactReceipts.values()][0], secondRecord);
  assertPoolInvariant(system, scene);
  system.destroy();
});

// --- 2. dedupe edges --------------------------------------------------------------------------

test('same attacker/target on different ticks is two contacts; one tick is one contact', () => {
  const { system, state, bus, scene } = makeVfxHarness();
  bus.emit('projectile:hit', {
    targetId: TARGET_ID,
    ownerId: PLAYER_ID,
    weaponId: LEGACY_HIT_WEAPON,
    pos: { x: 8, z: 3 },
    approach: { x: 1, z: 0 },
    normal: { x: -1, z: 0 },
    damage: 18,
  });
  assert.equal(system._contactReceipts.size, 1);
  assert.equal(system._activeLightCount, 1);

  bus.emit('combat:damage', damagePayload());
  assert.equal(system._contactReceipts.size, 1, 'the two receipts share one contact on one tick');
  assert.equal(system._activeLightCount, 1, 'the second receipt must not light a second contact');

  state.tick += 1;
  bus.emit('combat:damage', damagePayload());
  assert.equal(system._contactReceipts.size, 2, 'a later tick is a different contact');
  assert.equal(system._activeLightCount, 2, 'a later tick earns its own light');
  const records = [...system._contactReceipts.values()];
  assert.notEqual(records[0], records[1]);
  assert.equal(records[0].tick, 720);
  assert.equal(records[1].tick, 721);
  assertPoolInvariant(system, scene);
  system.destroy();
});

test('missing attacker and self-target receipts neither crash nor merge unrelated entities', () => {
  const { system, scene } = makeVfxHarness();

  // No attacker identity: there is no contact receipt, so every receipt draws on its own.
  assert.equal(system._contactReceipt({ targetId: 7 }), null);
  assert.equal(system._contactReceipt({ targetId: 7, attackerId: null, ownerId: null, sourceId: null }), null);
  assert.equal(system._emitContactLight(null, { x: 1, z: 0 }, 'impact', { peak: 1.2 }), true);
  assert.equal(system._emitContactLight(null, { x: 2, z: 0 }, 'impact', { peak: 1.2 }), true);
  assert.equal(system._contactReceipts.size, 0, 'anonymous receipts do not fabricate a contact identity');
  assert.equal(system._activeLightCount, 2, 'two anonymous contacts each get their own light');

  // attacker === target is a real self-contact; distinct self-contacts stay distinct.
  const selfFive = system._contactReceipt({ attackerId: 5, targetId: 5 });
  const selfSix = system._contactReceipt({ attackerId: 6, targetId: 6 });
  assert.ok(selfFive && selfSix);
  assert.notEqual(selfFive, selfSix, 'unrelated self-contacts never share a record');
  assert.equal(system._contactReceipts.size, 2);
  assert.equal(system._emitContactLight(selfFive, { x: 5, z: 0 }, 'impact', { peak: 1.2 }), true);
  assert.equal(system._emitContactLight(selfSix, { x: 6, z: 0 }, 'impact', { peak: 1.2 }), true);
  assert.equal(system._activeLightCount, 4);
  assert.equal(system._contactReceipts.size, 2);

  // A numeric zero attacker id is a valid identity, not a missing one.
  assert.ok(system._contactReceipt({ attackerId: 0, targetId: 8 }));
  // A malformed live damage receipt with no attacker must not throw; it still draws a light.
  assert.doesNotThrow(() => {
    system._onDamage({
      targetId: TARGET_ID,
      amount: 5,
      hullHit: true,
      pos: { x: 8, z: 3 },
      normal: { x: -1, z: 0 },
    });
  });
  assertPoolInvariant(system, scene);
  system.destroy();
});

test('a preferred receipt re-arms the one contact light in place and never adds a second', () => {
  const { system, scene } = makeVfxHarness();
  const contact = system._contactReceipt({
    attackerId: AMBIENT_ATTACKER_ID,
    targetId: AMBIENT_TARGET_ID,
    pos: { x: 4, z: 0 },
  });
  assert.ok(contact);
  assert.equal(system._emitContactLight(contact, { x: 4, z: 0 }, 'impact', { peak: 1.4 }, 0.2), true);
  assert.equal(system._activeLightCount, 1);
  const slot = system._lights.find((entry) => entry.active);
  const lightObject = slot.obj;
  assert.ok(slot.admissionPriority < 0.5);

  assert.equal(system._emitContactLight(contact, { x: 4, z: 0 }, 'impact', { peak: 2.0 }, 0.9), true);
  assert.equal(system._activeLightCount, 1,
    'the preferred receipt re-arms the same contact instead of claiming a second light');
  assert.equal(slot.active, true);
  assert.equal(slot.obj, lightObject, 'the same visible light object is re-authored');
  assert.ok(slot.admissionPriority >= 0.9);
  assert.equal(contact.lightOwner, 'impact');
  assert.ok(contact.lightPriority >= 0.9);
  assert.equal(system._lights.filter((entry) => entry.active).length, 1,
    'the older receipt light does not remain as a second light');

  // A weaker follow-up must not downgrade the contact's authorial band.
  assert.equal(system._emitContactLight(contact, { x: 4, z: 0 }, 'graze', undefined, 0.2), true);
  assert.equal(system._activeLightCount, 1);
  assert.ok(slot.admissionPriority >= 0.9, 'a weaker receipt leaves the preferred band intact');
  assertPoolInvariant(system, scene);
  system.destroy();
});

test('a stale contact record must not hijack a light slot recycled by another event', () => {
  const { system, scene } = makeVfxHarness();
  // Five strong transients leave one slot. The contact takes it at the ambient floor.
  for (let i = 0; i < EVENT_LIGHT_POOL_SIZE - 1; i++) {
    assert.equal(flash(system, i, 0.95, 5), true);
  }
  const contact = system._contactReceipt({
    attackerId: AMBIENT_ATTACKER_ID,
    targetId: AMBIENT_TARGET_ID,
  });
  assert.equal(system._emitContactLight(contact, { x: 4, z: 0 }, 'impact', { peak: 1.2 }, 0.2), true);
  assert.equal(system._activeLightCount, EVENT_LIGHT_POOL_SIZE);
  const contactSlot = contact.lightSlot;
  assert.ok(contactSlot >= 0);

  // A stronger unrelated event evicts the weak contact light and recycles that exact slot.
  assert.equal(flash(system, 120, 0.95, 5), true);
  const recycled = system._lights[contactSlot];
  assert.equal(recycled.active, true);
  assert.equal(recycled.admissionPriority, 0.95);
  const before = {
    x: recycled.obj.position.x,
    z: recycled.obj.position.z,
    color: recycled.obj.color.getHex(),
    priority: recycled.admissionPriority,
    peak: recycled.peak,
  };

  // A late preferred receipt for the old contact must not commandeer that unrelated light. It may
  // honestly refuse (the contact no longer has a light) or claim a genuinely free slot; what it
  // must not do is re-author a slot now owned by another event while reporting success.
  const accepted = system._emitContactLight(contact, { x: 7, z: 7 }, 'shield', { peak: 4 }, 0.9);
  assert.equal(
    accepted && (recycled.obj.position.x !== before.x || recycled.obj.position.z !== before.z
      || recycled.admissionPriority !== before.priority || recycled.obj.color.getHex() !== before.color
      || recycled.peak !== before.peak),
    false,
    'a stale contact record hijacked the recycled light slot and re-authored another event',
  );
  assertPoolInvariant(system, scene);
  system.destroy();
});

// --- 3. priority inversion --------------------------------------------------------------------

test('a player-caused receipt evicts a saturated ambient band (control)', () => {
  const { system, state, bus, scene } = makeVfxHarness();
  // 0.6 is the authored `impact` preset: exactly what six ambient NPC projectile contacts claim.
  fillAmbientBand(system, EVENT_LIGHT_POOL_SIZE, 0.6);
  const calls = captureLightRequests(system);
  bus.emit('projectile:hit', {
    targetId: TARGET_ID,
    ownerId: PLAYER_ID,
    weaponId: KINETIC_WEAPON,
    pos: { x: 8, z: 3 },
    approach: { x: 1, z: 0 },
    normal: { x: -1, z: 0 },
    damage: 18,
  });
  bus.emit('combat:damage', damagePayload());

  const playerLights = system._lights.filter((slot) => slot.active && slot.admissionPriority >= 0.7);
  assert.equal(playerLights.length, 1, 'the player-caused contact owns one authored light');
  assert.equal(system._activeLightCount, EVENT_LIGHT_POOL_SIZE);
  assert.ok(calls.some((call) => call.ok && call.priority >= 0.7),
    'the pool received the player band, not a refused ambient request');
  assertPoolInvariant(system, scene);
  system.destroy();
});

test('a player-target receipt beats a saturated ambient band', () => {
  const { system, state, bus, scene } = makeVfxHarness();
  fillAmbientBand(system, EVENT_LIGHT_POOL_SIZE, 0.6);
  const calls = captureLightRequests(system);
  const incoming = incomingPayload();
  const admission = deriveVfxAdmissionMetadata(incoming, state);
  assert.equal(isPlayerFacingVfxAdmission(admission), true,
    'incoming fire on the player is player-facing');

  bus.emit('projectile:hit', {
    targetId: PLAYER_ID,
    ownerId: AMBIENT_ATTACKER_ID,
    weaponId: KINETIC_WEAPON,
    pos: { x: 1, z: 0 },
    approach: { x: 1, z: 0 },
    normal: { x: -1, z: 0 },
    damage: 18,
  });
  bus.emit('combat:damage', incoming);

  // The contact record is the honest ownership read: a refused receipt leaves lightOwner null.
  const records = [...system._contactReceipts.values()];
  assert.equal(records.length, 1, 'the pair shares one contact identity');
  assert.notEqual(records[0].lightOwner, null,
    `incoming player damage lost its contact light to six ambient 0.6 flashes (derived ${admission.admissionPriority})`);
  const contactSlot = system._lights[records[0].lightSlot];
  assert.ok(contactSlot && contactSlot.active && contactSlot.admissionPriority >= 0.6,
    `the contact light did not carry the player-target band (derived ${admission.admissionPriority})`);
  assert.ok(calls.some((call) => call.ok && call.priority >= 0.6),
    'no admitted light request carried the player-target band');
  assertPoolInvariant(system, scene);
  system.destroy();
});

test('a refused player structural cue draws no generic cone; a refused ambient cue still does', () => {
  function run(incoming, payload = null) {
    const harness = makeVfxHarness();
    harness.system._initArcadeStructural();
    const fx = harness.system._arcadeStructural;
    const spec = { x: 1, z: -1, y: 0.4, priority: 0.99, life: 30 };
    for (const pool of [fx.blades, fx.arcs, fx.shards, fx.plates]) {
      for (let i = 0; i < pool.capacity; i++) pool.spawn(spec);
    }
    const cones = [];
    harness.system._impactParticleCone = (...args) => { cones.push(args); };
    harness.bus.emit('combat:damage', payload || (incoming ? incomingPayload() : damagePayload()));
    const refused = fx.stats().cues.refused;
    const result = {
      cones: cones.length,
      refused,
      contactRecord: [...harness.system._contactReceipts.values()][0] || null,
      active: harness.system._activeLightCount,
    };
    harness.system.destroy();
    return result;
  }

  // The ambient control is a true NPC-on-NPC pair, not a player-caused shot: player-caused damage
  // is player-facing and deliberately skips the generic cone.
  const ambientPayload = damagePayload({
    attackerId: AMBIENT_ATTACKER_ID,
    targetId: AMBIENT_TARGET_ID,
    pos: { x: 400, z: 0 },
  });

  const player = run(true);
  const ambient = run(false, ambientPayload);
  assert.equal(player.refused, 1, 'the player structural cue really was refused');
  assert.equal(player.cones, 0,
    'a refused player contact must not fall back to the fixed-palette generic cone');
  assert.equal(ambient.refused, 1, 'the ambient structural cue really was refused');
  assert.equal(ambient.cones, 1,
    'the control: an ambient contact keeps its generic cone fallback');
  // The player's light is independent of the structural refusal: it was still admitted.
  assert.equal(player.active, 1, 'a refused structural cue does not also lose the player contact light');
});

// --- 4. tumble safety -------------------------------------------------------------------------

function vector3(x = 0, y = 0, z = 0) {
  return { x, y, z, set(nx, ny, nz) { this.x = nx; this.y = ny; this.z = nz; } };
}

function createCraft({ baseYaw = 0, bell = false } = {}) {
  const hull = {
    position: vector3(),
    rotation: { x: 0, y: baseYaw, z: 0 },
    scale: vector3(1, 1, 1),
    children: [],
  };
  if (bell) {
    hull.children.push({
      name: 'LOD0_engine_fan_Mechanical',
      rotation: { x: 0, y: 0, z: 0 },
      scale: vector3(1, 1, 1),
      material: new THREE.MeshStandardMaterial({ name: 'SF_Shared_mechanical_dark' }),
      children: [],
    });
  }
  const mesh = {
    userData: { hull, weapons: [] },
    position: vector3(),
    rotation: { x: 0, y: -baseYaw, z: 0 },
    children: [hull],
  };
  return { mesh, hull };
}

function createRecorderBus() {
  const handlers = new Map();
  const emitted = [];
  return {
    emitted,
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(fn);
      return () => {
        const list = handlers.get(event);
        const index = list.indexOf(fn);
        if (index >= 0) list.splice(index, 1);
      };
    },
    emit(event, payload) {
      emitted.push(event);
      for (const fn of handlers.get(event) || []) fn(payload);
    },
  };
}

function npc(id, over = {}) {
  return {
    id,
    type: 'ship',
    mass: 280,
    pos: { x: 0, z: 0 },
    rot: 0,
    radius: 12,
    vel: { x: 0, z: 0 },
    flags: {},
    ...over,
  };
}

function presentFrame(tracker, entity, mesh, hull, t, options = {}) {
  hull.position.x = 0;
  hull.position.y = 0;
  hull.position.z = 0;
  hull.rotation.x = 0;
  hull.rotation.z = 0;
  mesh.rotation.y = -entity.rot;
  tracker.updateCraftMicroMotion(entity, mesh, t, DT, options);
}

function extremeDamage(targetId, over = {}) {
  return {
    targetId,
    weaponId: 'wpn_siege_lance_l',
    amount: Number.MAX_VALUE,
    hullDamage: Number.MAX_VALUE,
    hullHit: true,
    hitNormal: { x: Math.SQRT1_2, z: Math.SQRT1_2 },
    pos: { x: 1, z: 1 },
    origin: { kind: 'weapon' },
    ...over,
  };
}

function assertFiniteTransform(hull) {
  for (const value of [
    hull.position.x, hull.position.y, hull.position.z,
    hull.rotation.x, hull.rotation.y, hull.rotation.z,
    hull.scale.x, hull.scale.y, hull.scale.z,
  ]) {
    assert.equal(Number.isFinite(value), true, `non-finite hull transform ${value}`);
  }
}

test('extreme damage plus a stray combat:tumbled never writes hitstun, status, or player heading', () => {
  const tracker = createShipMicroMotionTracker();
  const bus = createRecorderBus();
  tracker.bindEvents(bus);
  const baseYaw = 0.35;
  const { mesh, hull } = createCraft({ baseYaw });
  const entity = npc(PLAYER_ID, { pos: { x: 40, z: 0 }, vel: { x: 60, z: 0 } });
  entity.angVel = 0;
  const sim = {
    combat: {
      entities: {
        1: { statuses: {} },
      },
    },
  };
  const statusBefore = JSON.stringify(sim.combat.entities[1].statuses);

  presentFrame(tracker, entity, mesh, hull, 0, { playerId: PLAYER_ID });
  assert.equal(hull.rotation.y, baseYaw, 'authored heading seeded');

  tracker.onDamage(extremeDamage(PLAYER_ID));
  tracker.onTumbled({
    victimId: PLAYER_ID,
    startedAt: -100,
    until: 100,
    durationS: 200,
    spin: 1e9,
    u: 1e9,
    tick: -1,
  });

  let staggered = false;
  for (let i = 0; i < 120; i++) {
    entity.rot = 0.02 * i;
    presentFrame(tracker, entity, mesh, hull, 0.2 + i * DT, { playerId: PLAYER_ID });
    assert.equal(hull.rotation.y, baseYaw, `player heading frame ${i}`);
    assert.equal(mesh.rotation.y, -entity.rot, `root yaw is the live sim heading frame ${i}`);
    if (Math.abs(hull.rotation.x) > 0.02 || Math.abs(hull.rotation.z) > 0.02) staggered = true;
  }
  assert.equal(staggered, true, 'the player hull still physically staggers on roll/pitch');
  assert.equal(entity.rot, 0.02 * 119, 'presentation never writes sim yaw');
  assert.equal(entity.angVel, 0, 'presentation never writes sim angular velocity');
  assert.equal(JSON.stringify(sim.combat.entities[1].statuses), statusBefore,
    'presentation never applies a hitstun/tumble status');
  assert.equal(readTumbleStatus(sim, PLAYER_ID), null);
  assert.equal(bus.emitted.includes('combat:tumbled'), false,
    'presentation never emits a tumble receipt');
  assert.equal(bus.emitted.some((name) => name.startsWith('combat:status')), false,
    'presentation never emits a status');
});

test('extreme damage and a live tumble read stay finite and write no sim status on an NPC', () => {
  const tracker = createShipMicroMotionTracker();
  const bus = createRecorderBus();
  tracker.bindEvents(bus);
  const { mesh, hull } = createCraft();
  const entity = npc(13, { mass: 16 });
  for (let i = 0; i < 8; i++) presentFrame(tracker, entity, mesh, hull, i * DT);

  const sim = { combat: { entities: { 13: { statuses: {} } } } };
  tracker.onDamage(extremeDamage(13, { pos: { x: 0, z: 1 } }));
  tracker.onTumbled({
    victimId: 13,
    startedAt: -1e9,
    until: 1e9,
    durationS: 1e9,
    spin: -1e9,
    u: 9,
    tick: 1,
  });
  const rec = tracker.getRecord(13);
  assert.ok(Number.isFinite(rec.subTumbleSeverity));
  assert.ok(rec.subTumbleSeverity <= 1.6, `severity is authored-bounded: ${rec.subTumbleSeverity}`);
  assert.equal(rec.subTumbleT >= 0, true, 'the sub-tumble beat armed');

  for (let i = 0; i < 120; i++) {
    presentFrame(tracker, entity, mesh, hull, 0.2 + i * DT);
    assertFiniteTransform(hull);
  }
  assert.ok(Math.abs(hull.rotation.x) <= SUB_TUMBLE_ROLL_MAX + 1e-6,
    `roll stays inside the authored envelope: ${hull.rotation.x}`);
  assert.ok(Math.abs(hull.rotation.z) <= SUB_TUMBLE_PITCH_MAX + 1e-6,
    `pitch stays inside the authored envelope: ${hull.rotation.z}`);
  assert.ok(Math.abs(hull.rotation.y) <= SUB_TUMBLE_YAW_MAX + SUB_TUMBLE_HELM_MAX + 0.62 + 1e-6,
    `the NPC helm loss stays inside its own ceiling: ${hull.rotation.y}`);
  assert.equal(JSON.stringify(sim.combat.entities[13].statuses), '{}',
    'the render tumble read writes no status');
  assert.equal(readTumbleStatus(sim, 13), null);
  assert.equal(bus.emitted.includes('combat:tumbled'), false);
  assert.equal(bus.emitted.some((name) => name.startsWith('combat:status')), false);
});

function graphWalk(root) {
  let count = 0;
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    assert.ok(!node.isLight, 'no per-ship light was added');
    assert.ok(!node.isPoints && !node.isSprite, 'no new points/sprite pool was added');
    count += 1;
    const children = node.children;
    if (children) for (let i = 0; i < children.length; i++) stack.push(children[i]);
  }
  return count;
}

test('the reaction path reuses retained state and allocates no per-hit reaction record', () => {
  const tracker = createShipMicroMotionTracker();
  const { mesh } = createCraft({ bell: true });
  const entity = npc(11);
  const nodesBefore = graphWalk(mesh);

  for (let i = 0; i < 10; i++) presentFrame(tracker, entity, mesh, mesh.userData.hull, i * DT);
  tracker.onDamage({
    targetId: 11,
    weaponId: 'wpn_concussion_cannon_m',
    amount: 20,
    hullDamage: 20,
    hullHit: true,
    hitNormal: { x: 0, z: 1 },
    pos: { x: 0, z: 1 },
    origin: { kind: 'weapon' },
  });
  presentFrame(tracker, entity, mesh, mesh.userData.hull, 0.3);

  const rec = tracker.getRecord(11);
  const recordRef = rec;
  const poseRef = rec.yieldPose;
  const scratchRef = rec.subTumbleScratch;
  const bellsRef = rec.bells;
  const keyCount = Object.keys(rec).length;
  const scratchKeyCount = Object.keys(scratchRef).length;
  assert.ok(poseRef && scratchRef, 'retained scratch records exist');

  const out = {};
  for (let i = 0; i < 20; i++) {
    assert.equal(resolveSubTumbleReaction(
      { weaponId: 'wpn_railgun_m', amount: 20 + i, hullHit: true },
      out,
    ), out, 'the pure resolver writes the caller record, never a fresh object');
    assert.equal(Object.keys(out).length, 11, 'the resolver output has a fixed key set');
  }

  for (let i = 0; i < 80; i++) {
    tracker.onDamage({
      targetId: 11,
      weaponId: 'wpn_concussion_cannon_m',
      amount: 8 + (i % 5),
      hullDamage: 8 + (i % 5),
      hullHit: true,
      hitNormal: { x: Math.SQRT1_2, z: Math.SQRT1_2 },
      pos: { x: 0, z: 1 },
      origin: { kind: 'weapon' },
    });
    presentFrame(tracker, entity, mesh, mesh.userData.hull, 0.4 + i * DT);
  }
  assert.equal(graphWalk(mesh), nodesBefore, 'the presented object graph did not grow');
  assert.equal(tracker.getRecord(11), recordRef, 'the per-ship record is reused');
  assert.equal(Object.keys(rec).length, keyCount, 'the record gained no per-hit/per-frame keys');
  assert.equal(Object.keys(rec.subTumbleScratch).length, scratchKeyCount,
    'the reaction scratch gained no per-hit keys');
  assert.equal(rec.yieldPose, poseRef, 'the yield pose scratch is reused');
  assert.equal(rec.subTumbleScratch, scratchRef, 'the reaction scratch is reused');
  assert.equal(rec.bells, bellsRef, 'the bell pivot list is reused');
  assert.equal(tracker.peekRecord(999), null, 'no record fabricated for an untouched id');
});

// --- 5. kick bounds ---------------------------------------------------------------------------

function feelHost(over = {}) {
  const kicks = [];
  const holds = [];
  const traumas = [];
  const state = {
    tick: 40,
    simTime: 1,
    mode: 'flight',
    playerId: PLAYER_ID,
    timeScale: 1,
    settings: { video: { motionReduce: false } },
    ui: { screenStack: [], docked: false },
    entities: new Map([
      [PLAYER_ID, { id: PLAYER_ID, type: 'ship', mass: 16, pos: { x: 0, z: 0 } }],
      [2, { id: 2, type: 'ship', mass: 20, pos: { x: 400, z: 0 } }],
    ]),
    render: {
      photoMode: { active: false },
      cameraCtrl: {
        addTrauma: (value) => traumas.push(value),
        impactKick: (dirX, dirZ, magnitude) => kicks.push({ dirX, dirZ, magnitude }),
        hold: (seconds) => { holds.push(seconds); return true; },
      },
    },
    ...over,
  };
  const bus = createBus();
  const effects = createTimeEffects(state);
  const host = Object.create(feel);
  host._injectStyle = () => {};
  host._mountVignette = () => {};
  host._ensureVignette = () => null;
  host._updateSpeedLines = () => {};
  host.init({ state, bus, timeEffects: effects });
  return { state, bus, host, kicks, holds, traumas };
}

test('huge, NaN and missing weapon fields produce a finite kick inside the authored ceiling', () => {
  const base = {
    attackerId: PLAYER_ID,
    targetId: 2,
    weaponId: 'wpn_siege_lance_l',
    hullHit: true,
    approach: { x: 1, z: 0 },
  };
  const mustKick = [
    { ...base, amount: 1e12 },
    { ...base, amount: Number.MAX_VALUE },
    { ...base, amount: 1e12, impulsePerHit: 1e18 },
  ];
  for (const payload of mustKick) {
    const kick = resolveWeaponImpactKick(payload, { mode: 'flight', playerId: PLAYER_ID });
    assert.ok(kick, `a huge heavy receipt produced a kick for amount ${String(payload.amount)}`);
    assert.equal(Number.isFinite(kick.kickWu), true);
    assert.ok(kick.kickWu > 0 && kick.kickWu <= WEAPON_KICK_WU_MAX,
      `kick ${kick.kickWu} is bounded by ${WEAPON_KICK_WU_MAX}`);
    assert.ok(kick.holdS > 0 && kick.holdS <= CRUNCH_HOLD_MAX_S,
      `hold ${kick.holdS} is the 1–2 frame contact beat`);
    assert.ok(kick.holdS <= HS_CAMERA_HOLD_MAX);
    assert.equal(Number.isFinite(kick.dirX) && Number.isFinite(kick.dirZ), true);
    assert.ok(Math.abs(Math.hypot(kick.dirX, kick.dirZ) - 1) < 1e-6, 'direction is unit');
    assert.equal(kick.holdsPose, false);
    assert.equal(kick.stallsSim, false);
    assert.equal(kick.trauma, undefined);
  }

  // NaN/garbage amounts may fail safe to silence (a light shot below the momentum floor), but a
  // produced kick must still be finite and inside the ceiling; never NaN, never unbounded.
  for (const amount of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
    const kick = resolveWeaponImpactKick({ ...base, amount }, {
      mode: 'flight', playerId: PLAYER_ID,
    });
    if (kick) {
      assert.equal(Number.isFinite(kick.kickWu), true, `amount ${String(amount)} produced NaN kick`);
      assert.ok(kick.kickWu > 0 && kick.kickWu <= WEAPON_KICK_WU_MAX);
      assert.ok(kick.holdS > 0 && kick.holdS <= CRUNCH_HOLD_MAX_S);
      assert.equal(Number.isFinite(kick.dirX) && Number.isFinite(kick.dirZ), true);
    } else {
      assert.equal(kick, null, `amount ${String(amount)} must be a bounded kick or an explicit null`);
    }
  }

  // Missing geometry: no direction, no kick; never a fabricated +X.
  assert.equal(resolveWeaponImpactKick({
    attackerId: PLAYER_ID, targetId: 2, weaponId: 'wpn_siege_lance_l', amount: 420, hullHit: true,
  }, { mode: 'flight', playerId: PLAYER_ID }), null);
  // A NaN/missing direction with a live entity line still resolves a finite kick.
  const state = {
    entities: new Map([
      [PLAYER_ID, { id: PLAYER_ID, pos: { x: 0, z: 0 } }],
      [2, { id: 2, pos: { x: 300, z: 400 } }],
    ]),
  };
  const fromEntities = resolveWeaponImpactKick({
    attackerId: PLAYER_ID,
    targetId: 2,
    weaponId: 'wpn_siege_lance_l',
    amount: 420,
    hullHit: true,
    approach: { x: Number.NaN, z: Number.NaN },
  }, { mode: 'flight', playerId: PLAYER_ID, state });
  assert.ok(fromEntities);
  assert.ok(fromEntities.kickWu <= WEAPON_KICK_WU_MAX);
  assert.ok(Math.abs(fromEntities.dirX - 0.6) < 1e-6 && Math.abs(fromEntities.dirZ - 0.8) < 1e-6,
    'the attacker→target line is the fallback direction');
});

test('the applied kick adds no trauma, FOV or timeScale and honours motion-reduce/photo mode', () => {
  const { state, host, kicks, holds, traumas } = feelHost();
  const triggers = [];
  host._trigger = (...args) => { triggers.push(args); };
  const kick = resolveWeaponImpactKick({
    attackerId: PLAYER_ID,
    targetId: 2,
    weaponId: 'wpn_siege_lance_l',
    amount: 420,
    hullHit: true,
    approach: { x: 1, z: 0 },
  }, { mode: 'flight', playerId: PLAYER_ID, state });
  assert.ok(kick);
  assert.equal(host._applyWeaponKick(kick), true);
  assert.equal(kicks.length, 1);
  assert.ok(kicks[0].magnitude > 0 && kicks[0].magnitude <= WEAPON_KICK_WU_MAX);
  assert.equal(holds.length, 1);
  assert.ok(holds[0] > 0 && holds[0] <= HS_CAMERA_HOLD_MAX);
  assert.deepEqual(traumas, [], 'the weapon kick adds no screen shake');
  assert.deepEqual(triggers, [], 'the weapon kick adds no FOV/vignette punch');
  assert.equal(host._fovPunch, 0);
  assert.equal(host._beatTimer, 0);
  assert.equal(state.timeScale, 1, 'the simulation clock is untouched');

  // Vestibular gates silence the kick at both the resolver and the live apply seam.
  state.settings.video.motionReduce = true;
  assert.equal(resolveWeaponImpactKick({
    attackerId: PLAYER_ID, targetId: 2, weaponId: 'wpn_siege_lance_l', amount: 420,
    hullHit: true, approach: { x: 1, z: 0 },
  }, { mode: 'flight', playerId: PLAYER_ID, motionReduce: true }), null);
  assert.equal(host._applyWeaponKick(kick), false);
  assert.equal(kicks.length, 1);

  state.settings.video.motionReduce = false;
  state.render.photoMode.active = true;
  assert.equal(resolveWeaponImpactKick({
    attackerId: PLAYER_ID, targetId: 2, weaponId: 'wpn_siege_lance_l', amount: 420,
    hullHit: true, approach: { x: 1, z: 0 },
  }, { mode: 'flight', playerId: PLAYER_ID, state }), null);
  assert.equal(host._applyWeaponKick(kick), false);
  assert.equal(kicks.length, 1);
  assert.equal(holds.length, 1);
  assert.equal(state.timeScale, 1);
});

// --- 6. audio ---------------------------------------------------------------------------------

function audioHost() {
  const state = createGameState(4242);
  state.mode = 'flight';
  const bus = createBus();
  const player = {
    id: state.playerId,
    type: 'ship',
    alive: true,
    team: 0,
    hull: 200,
    hullMax: 200,
    shield: 40,
    shieldMax: 40,
    armorHp: 40,
    armorMax: 40,
    radius: 6,
    pos: { x: 0, z: 0 },
    rot: 0,
    data: {},
  };
  state.entities.set(player.id, player);
  audio.init({ state, bus, helpers: {} });

  const played = [];
  const originalPlay = audio.play;
  const originalClock = audio._wallClockMs;
  let now = 1000;
  audio.play = (recipeId, opts) => {
    played.push({ recipeId, opts: opts || {} });
    return { id: recipeId };
  };
  audio._wallClockMs = () => now;
  return {
    state,
    bus,
    player,
    played,
    at(ms) { now = ms; },
    addTarget(target) { state.entities.set(target.id, target); },
    restore() {
      audio._wallClockMs = originalClock;
      audio.play = originalPlay;
      audio.state = null;
      audio.rt = null;
      audio.bus = null;
    },
  };
}

function audioTarget(id, type, over = {}) {
  return {
    id,
    type,
    alive: true,
    hull: 200,
    hullMax: 200,
    armorHp: 40,
    armorMax: 40,
    shield: 40,
    shieldMax: 40,
    pos: { x: 30, z: 0 },
    data: {},
    ...over,
  };
}

function audioDamage(overrides = {}) {
  return {
    targetId: null,
    attackerId: PLAYER_ID,
    amount: 2,
    applied: 2,
    shieldDamage: 0,
    armorDamage: 0,
    hullDamage: 0,
    shieldAbsorbed: false,
    brokeShield: false,
    dominantLayer: 'hull',
    isPlayer: false,
    pos: { x: 30, z: 0 },
    ...overrides,
  };
}

test('unknown materials and targets resolve to real recipes and never throw', () => {
  assert.equal(normalizeImpactMaterial('unobtanium'), IMPACT_MATERIALS.unknown);
  const unknown = resolveImpactAudioCue({ eventClass: 'pinprick', materialId: 'unobtanium' });
  assert.equal(unknown.cueId, 'combat.impact.generic');
  assert.equal(unknown.materialId, IMPACT_MATERIALS.unknown);
  assert.ok(AUDIO_RECIPE_BY_ID[resolveAudioCueRecipeId(unknown.cueId)],
    'the generic cue still resolves to a synthesized recipe');
  assert.equal(impactMaterialForTarget({ type: 'asteroid', data: { substance: 'unobtanium' } }, 'hull'),
    IMPACT_MATERIALS.rock, 'an unrecognized rock substance stays a rock');
  assert.equal(impactMaterialForTarget(null, 'hull'), IMPACT_MATERIALS.hull);
  assert.equal(impactMaterialForTarget(null, null), IMPACT_MATERIALS.unknown);

  const host = audioHost();
  try {
    host.addTarget(audioTarget('ghost-ship', 'ship'));
    assert.doesNotThrow(() => {
      host.bus.emit('combat:damage', audioDamage({
        targetId: 'ghost-ship', amount: 8, hullDamage: 8, hullHit: true,
      }));
    });
    assert.deepEqual(host.played.map((entry) => entry.recipeId), ['sfx.hullHit'],
      'a missing body falls back to the layer recipe, never to silence or a throw');

    host.played.length = 0;
    host.at(2000);
    assert.doesNotThrow(() => {
      host.bus.emit('combat:damage', audioDamage({
        targetId: 'not-in-the-world', amount: 8, hullDamage: 8, hullHit: true,
      }));
    });
    assert.equal(host.played.length, 1, 'an unknown target still speaks one real recipe');
  } finally {
    host.restore();
  }
});

test('a shield absorption never selects breach or detonation', () => {
  const shieldTarget = audioTarget('shielded', 'ship', { shield: 1000, shieldMax: 1000 });
  const huge = audioDamage({
    targetId: 'shielded',
    amount: 1000,
    shieldDamage: 1000,
    shieldAbsorbed: true,
    dominantLayer: 'shield',
  });
  const voice = resolveImpactDamageVoice(huge, shieldTarget);
  assert.equal(voice.cueId, 'combat.impact.shield');
  assert.equal(voice.recipeId, 'sfx.shieldHit');
  assert.notEqual(voice.recipeId, 'sfx_hull_decompress');
  assert.notEqual(voice.recipeId, 'sfx.chargeDetonate');

  const host = audioHost();
  try {
    host.addTarget(shieldTarget);
    host.bus.emit('combat:damage', huge);
    assert.deepEqual(host.played.map((entry) => entry.recipeId), ['sfx.shieldHit'],
      'a fully absorbed huge hit is still a shield contact');
  } finally {
    host.restore();
  }
});

test('two targets in one tick both speak; the same target inside 40 ms speaks once', () => {
  const host = audioHost();
  try {
    host.addTarget(audioTarget('a', 'ship'));
    host.addTarget(audioTarget('b', 'ship'));
    host.at(1000);

    host.bus.emit('combat:damage', audioDamage({
      targetId: 'a', amount: 4, hullDamage: 4, hullHit: true,
    }));
    host.bus.emit('combat:damage', audioDamage({
      targetId: 'b', amount: 4, hullDamage: 4, hullHit: true,
    }));
    assert.deepEqual(host.played.map((entry) => entry.recipeId), ['sfx.hullHit', 'sfx.hullHit'],
      'two different targets in one tick both speak');

    host.played.length = 0;
    host.addTarget(audioTarget('c', 'ship'));
    host.at(2000);
    host.bus.emit('combat:damage', audioDamage({
      targetId: 'c', amount: 4, hullDamage: 4, hullHit: true,
    }));
    host.bus.emit('combat:damage', audioDamage({
      targetId: 'c', amount: 4, hullDamage: 4, hullHit: true,
    }));
    assert.equal(host.played.length, 1, 'the same target in the same 40 ms window speaks once');

    host.at(2039);
    host.bus.emit('combat:damage', audioDamage({
      targetId: 'c', amount: 4, hullDamage: 4, hullHit: true,
    }));
    assert.equal(host.played.length, 1, '39 ms later is still inside the per-target gate');

    host.at(2040);
    host.bus.emit('combat:damage', audioDamage({
      targetId: 'c', amount: 4, hullDamage: 4, hullHit: true,
    }));
    assert.equal(host.played.length, 2, '40 ms later re-arms the target');
  } finally {
    host.restore();
  }
});

test('a rock hit speaks once across both raw owners in either dispatch order', () => {
  for (const order of ['projectile-first', 'damage-first']) {
    const host = audioHost();
    try {
      host.state.tick = 200;
      const rock = audioTarget('rock', 'asteroid', { data: { material: 'rock' } });
      host.addTarget(rock);
      const hit = {
        targetId: 'rock',
        projectileId: 'bolt',
        ownerId: PLAYER_ID,
        pos: { x: 30, z: 0 },
      };
      const damage = audioDamage({
        targetId: 'rock', amount: 3, hullDamage: 3, hullHit: true,
      });
      if (order === 'projectile-first') {
        host.bus.emit('projectile:hit', hit);
        host.bus.emit('combat:damage', damage);
      } else {
        host.bus.emit('combat:damage', damage);
        host.bus.emit('projectile:hit', hit);
      }
      assert.deepEqual(host.played.map((entry) => entry.recipeId), ['sfx_mining_impact'],
        `${order}: one rock contact must not stack two voices`);
    } finally {
      host.restore();
    }
  }
});

test('the impact cue seam emits one semantic cue and never mints a raw-owned audio:cue', () => {
  const bus = createBus();
  const presentation = [];
  const audioLane = [];
  bus.on('presentation:audioCue', (entry) => presentation.push(entry));
  bus.on('audio:cue', (entry) => audioLane.push(entry));

  const rawOwned = emitImpactAudioCue(bus, { eventClass: 'slam', materialId: 'hull' }, {
    position: { x: 12, z: -4 },
    distance: 20,
    importance: 0.9,
    playerRelevance: 1,
    duck: true,
    reducedMotion: true,
    playbackOwnedByRaw: true,
  });
  assert.equal(rawOwned.id, 'combat.impact.slam');
  assert.equal(presentation.length, 1);
  assert.equal(audioLane.length, 0, 'raw-owned playback stays out of the playable lane');

  presentation.length = 0;
  const unowned = emitImpactAudioCue(bus, { eventClass: 'breach', materialId: 'hull' }, {
    position: { x: 12, z: -4 },
    playbackOwnedByRaw: false,
  });
  assert.equal(unowned.id, 'combat.impact.breach');
  assert.equal(presentation.length, 1);
  assert.equal(audioLane.length, 1, 'an owner with no raw voice gets exactly one playable cue');

  // The vfx structural lane must use raw-owned semantics: a presentation cue for captions, no
  // impact audio:cue that would replay the same contact. (The pre-existing juice cue on
  // `combat.damage.*` is a different id family and is filtered out here.)
  const { system, state, bus: vfxBus, scene } = makeVfxHarness();
  const semantic = [];
  const impactPlayable = [];
  vfxBus.on('presentation:audioCue', (entry) => semantic.push(entry));
  vfxBus.on('audio:cue', (entry) => {
    if (typeof entry?.id === 'string' && entry.id.startsWith('combat.impact.')) impactPlayable.push(entry);
  });
  vfxBus.emit('combat:damage', damagePayload());
  assert.equal(semantic.length, 1, 'one admitted structural contact authors one semantic cue');
  assert.equal(semantic[0].playbackOwnedByRaw, true);
  assert.ok(semantic[0].id.startsWith('combat.impact.'));
  assert.equal(impactPlayable.length, 0, 'the semantic lane never mints a duplicate impact audio:cue');
  assertPoolInvariant(system, scene);
  system.destroy();
});

// --- 7. bench ---------------------------------------------------------------------------------

const clone = (value) => JSON.parse(JSON.stringify(value));

test('the same seed reproduces the beat plan; a new seed changes only the catalog seed', () => {
  for (const scenario of SCENARIOS) {
    const firstShots = buildShotPlan(scenario);
    const secondShots = buildShotPlan(scenario);
    assert.deepEqual(firstShots, secondShots, `${scenario.id}: shot plan is deterministic`);

    const firstBeats = buildBeatTimes(scenario, firstShots);
    const secondBeats = buildBeatTimes(scenario, secondShots);
    assert.deepEqual(firstBeats, secondBeats, `${scenario.id}: beat plan is deterministic`);
    for (const beat of firstBeats) {
      assert.equal(beat.frame, frameForTime(beat.atS), `${scenario.id}: ${beat.beat} frame`);
      assert.equal(beat.atS, Math.round(beat.frame * STEP_SECONDS * 1e6) / 1e6,
        `${scenario.id}: ${beat.beat} is on the 60 Hz clock`);
    }
    // The shot plan is the authored timing: a seed cannot move it.
    assert.equal(firstShots.length, scenario.shots.length);
    for (let index = 0; index < firstShots.length; index++) {
      assert.equal(firstShots[index].weaponId, weaponForShot(scenario, index).id);
    }
  }

  const first = catalogSummary(17);
  const same = catalogSummary(17);
  const other = catalogSummary(29);
  assert.deepEqual(first, same, 'the same seed produces an identical catalog summary');
  assert.notDeepEqual(first, other, 'a different seed changes the summary');
  assert.equal(first.seed, 17);
  assert.equal(other.seed, 29);
  assert.deepEqual(first.scenarios, other.scenarios, 'authored scenario timing is seed-independent');
  assert.deepEqual(first.requiredScenarios, other.requiredScenarios);
  assert.equal(first.errors.length, 0);
});

test('malformed capture manifests are rejected with a named error', () => {
  const valid = sampleCaptureManifest({ seed: 17, scenarioId: 'pulse-hull' });
  assert.deepEqual(validateCaptureManifest(valid), { ok: true, errors: [] });
  assert.equal(validateCaptureManifest(null).ok, false);
  assert.equal(validateCaptureManifest([]).ok, false);

  const reject = (label, mutate, matcher) => {
    const broken = clone(valid);
    mutate(broken);
    const result = validateCaptureManifest(broken);
    assert.equal(result.ok, false, `${label}: malformed manifest was accepted`);
    assert.ok(result.errors.length > 0, `${label}: rejection must name an error`);
    assert.ok(result.errors.some((error) => matcher.test(error)),
      `${label}: expected ${matcher}; got ${result.errors.join(' | ')}`);
  };

  reject('schema version', (m) => { m.schemaVersion = 2; }, /schemaVersion/);
  reject('kind', (m) => { m.kind = 'not-a-capture'; }, /kind/);
  reject('negative seed', (m) => { m.run.seed = -1; }, /run\.seed/);
  reject('unknown requested scenario', (m) => { m.run.scenarios.push('does-not-exist'); },
    /unknown scenario/);
  reject('missing captured scenario', (m) => { delete m.scenarios['pulse-hull']; },
    /has no capture entry/);
  reject('missing required contact beat', (m) => {
    m.scenarios['pulse-hull'].beats = m.scenarios['pulse-hull'].beats
      .filter((beat) => beat.beat !== 'contact');
  }, /missing required contact beat/);
  reject('off-frame beat', (m) => {
    m.scenarios['pulse-hull'].beats[0].frame += 1;
  }, /frame/);
  reject('out-of-order beats', (m) => {
    const beats = m.scenarios['pulse-hull'].beats;
    beats[1].atS = beats[0].atS - STEP_SECONDS;
    beats[1].frame = frameForTime(beats[1].atS);
  }, /chronological/);
  reject('absolute output path', (m) => { m.outputs.manifest = 'C:/tmp/manifest.json'; },
    /absolute Windows path/);
  reject('escaping review path', (m) => { m.outputs.review = '../escape.html'; },
    /escape the output directory/);
  reject('unobserved required evidence', (m) => {
    m.scenarios['pulse-hull'].evidence.contact = false;
  }, /required evidence was not observed/);
  reject('non-boolean evidence', (m) => {
    m.scenarios['pulse-hull'].evidence.contact = 'true';
  }, /must be boolean/);
  reject('capture-level error', (m) => {
    m.errors.push({ kind: 'driver', message: 'boom' });
  }, /capture recorded errors/);
  reject('failed complete check', (m) => {
    m.scenarios['pulse-hull'].checks[0].ok = false;
  }, /cannot carry a failed check/);
  reject('negative wall time', (m) => { m.run.wallSeconds = -1; }, /wallSeconds/);
  reject('unknown evidence name', (m) => {
    m.scenarios['pulse-hull'].evidence.made_up = true;
  }, /unknown evidence name/);
});
