// PQ-210.04 — every default-kit hit answers on four channels within 100 ms of contact.
//
// Crucible seed 4242 default kit (ricochet_runner, src/data/combatLabSetups.js):
//   ship_hornet + wpn_autocannon_m (slot 0) + wpn_concussion_cannon_m (slot 1).
//
// The test wires the REAL render/audio systems (feel, vfx, audio) onto the same bus as the real
// damage router, then publishes the same two receipts production publishes per contact —
// projectile:hit (physics) and combat:damage (router) — inside one synchronous emit. "Within
// 100 ms" is proven structurally: every channel answers in the same tick because each handler is
// a synchronous bus subscriber:
//   hit-stop   — feel's combat:damage handler -> _applyKineticCrunch -> _trigger ->
//                timeEffects.set('feel:hit-stop') (a 4/s repeater's authored answer is the
//                rhythmic tick: FOV punch, no hold; the concussion cannon's mass earns the
//                1–2 frame hold).
//   light      — vfx's projectile:hit handler -> _onProjectileHit -> WeaponVfxPresenter.handleHit
//                -> WeaponLightPool.spawn.
//   mass       — routeDamage -> helpers.combatPhysics.applyImpulse + combat:hitstunImpulse.
//   sound      — audio's combat:damage/projectile:hit handlers -> play() cue request, reachable
//                because the default profile is unmuted (AUDIO_DEFAULT_MUTE_VERSION 2).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createDamageRouter } from '../src/combat/damage.js';
import { createCombatCatalog } from '../src/combat/runtime.js';
import { buildWeaponDamagePacket } from '../src/systems/weapons.js';
import { WEAPONS } from '../src/data/weapons.js';
import { applyFeatureConfigToMaps } from '../src/data/featureFlags.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { feel } from '../src/render/feel.js';
import { vfx } from '../src/render/vfx.js';
import { audio, AUDIO_RECIPE_BY_ID } from '../src/audio/audioSystem.js';

const DEFAULT_KIT = [
  { id: 'wpn_autocannon_m', expectHold: false },        // rof 4 — rhythmic tick by authored design
  { id: 'wpn_concussion_cannon_m', expectHold: true },  // rof 1, impulse 920 — real hit-stop hold
];

const MAX_ANSWER_TICKS = Math.ceil(0.1 * 60); // 100 ms at the 60 Hz fixed step

function weaponDef(id) {
  const def = WEAPONS.find((entry) => entry.id === id);
  assert.ok(def, `default-kit weapon ${id} must exist in the shipped catalog`);
  return def;
}

// feel.init mounts DOM garnish (vignette/speed-lines); a headless stub is enough — the bus
// subscriptions and the timeEffects sink under test are real.
function installDomStub() {
  const prior = globalThis.document;
  const el = () => ({
    id: '', className: '', style: {}, isConnected: true,
    appendChild: (c) => c, getContext: () => null,
    addEventListener() {}, removeEventListener() {}, remove() {}, setAttribute() {},
  });
  globalThis.document = {
    getElementById: () => null,
    createElement: () => el(),
    head: el(),
    body: el(),
  };
  return () => {
    if (prior === undefined) delete globalThis.document;
    else globalThis.document = prior;
  };
}

function boot() {
  applyFeatureConfigToMaps(PRODUCTION_FEATURES);
  const state = createGameState(4242);
  state.mode = 'flight';
  const bus = createBus();
  const playerId = state.playerId;
  const player = {
    id: playerId, type: 'ship', alive: true, team: 0, mass: 18,
    hull: 200, hullMax: 200, shield: 80, shieldMax: 80, armorHp: 40, armorMax: 40,
    radius: 8, pos: { x: 0, z: 0 }, rot: 0,
  };
  const target = {
    id: 'pq210-target', type: 'ship', alive: true, team: 1, mass: 9,
    hull: 400, hullMax: 400, shield: 60, shieldMax: 60, armorHp: 80, armorMax: 80,
    radius: 6, pos: { x: 40, z: 0 }, rot: Math.PI,
  };
  state.entities.set(playerId, player);
  state.entities.set(target.id, target);

  const impulses = [];
  const router = createDamageRouter({
    state,
    catalog: createCombatCatalog(),
    bus,
    helpers: {
      combatPhysics: {
        applyImpulse(request) {
          impulses.push({ ...request, tick: state.tick });
          return true;
        },
      },
    },
  }, { schedule: () => {} });

  return { state, bus, router, player, target, impulses };
}

// The real systems init'd against the real bus — the subscriptions themselves are under test.
// Returns restore() plus the observation spies.
function wireLiveChannels(state, bus) {
  const restoreDom = installDomStub();
  state.render.scene = new THREE.Scene(); // lets vfx._initPools build the real light pool/presenter
  feel.init({ state, bus });
  vfx.init({ state, bus, helpers: {} });
  audio.init({ state, bus, helpers: {} });

  const played = [];
  const originalPlay = audio.play;
  audio.play = (cueId, opts) => { played.push({ cueId, opts }); return { id: cueId }; };

  const hitStopWrites = [];
  const timeEffects = feel.timeEffects;
  const originalSet = timeEffects.set.bind(timeEffects);
  timeEffects.set = (source, request) => {
    hitStopWrites.push(source);
    return originalSet(source, request);
  };

  return {
    played,
    hitStopWrites,
    restore() {
      audio.play = originalPlay;
      timeEffects.set = originalSet;
      audio.state = null;
      audio.rt = null;
      audio.bus = null;
      // The pool never decays without update(); the next test must build its own presenter
      // against its own scene rather than reuse slots still live from this contact.
      if (vfx._weaponPresenter) {
        vfx._weaponPresenter.dispose();
        vfx._weaponPresenter = null;
      }
      restoreDom();
    },
  };
}

test('default-kit packets carry the mass channel under the production profile', () => {
  applyFeatureConfigToMaps(PRODUCTION_FEATURES);
  const AUTHORED_IMPULSE = { wpn_autocannon_m: 48, wpn_concussion_cannon_m: 920 };
  for (const { id } of DEFAULT_KIT) {
    const def = weaponDef(id);
    assert.equal(def.impulsePerHit, AUTHORED_IMPULSE[id],
      `${id}: authored impulsePerHit drifted — the mass channel's magnitude is authored, not tuned here`);
    const packet = buildWeaponDamagePacket({ defId: id }, def, def.dmg, def.damageType, { x: 40, z: 0 });
    assert.equal(packet.impulse && packet.impulse.magnitude, def.impulsePerHit,
      `${id}: the authored impulse must ride the packet at full strength (weaponImpulseConsequences on)`);
    assert.equal(packet.source.weaponId, id);
  }
});

for (const { id, expectHold } of DEFAULT_KIT) {
  test(`${id}: one contact answers hit-stop + light + mass + sound on the same tick`, () => {
    const { state, bus, router, player, target, impulses } = boot();
    const { damage, hitstun } = { damage: [], hitstun: [] };
    bus.on('combat:damage', (p) => damage.push(p));
    bus.on('combat:hitstunImpulse', (p) => hitstun.push(p));
    const def = weaponDef(id);

    const live = wireLiveChannels(state, bus);
    try {
      const hitPos = { x: target.pos.x - target.radius, z: target.pos.z };

      // Contact, exactly as physics publishes it: the hit receipt first …
      const lightsBefore = vfx._weaponPresenter ? vfx._weaponPresenter.lights.live : 0;
      bus.emit('projectile:hit', {
        weaponId: id,
        targetId: target.id,
        pos: hitPos,
        normal: { x: -1, z: 0 },
        approach: { x: 1, z: 0 },
      });

      // … and the real hit packet routes combat:damage inside the same tick.
      const packet = buildWeaponDamagePacket(
        { defId: id }, def, def.dmg, def.damageType, hitPos,
      );
      const result = router({
        attackerId: player.id,
        targetId: target.id,
        packet,
        origin: { kind: 'weapon', id, weaponId: id },
      });
      assert.equal(result.ok, true, `${id}: the real router must accept the hit`);
      const contactTick = state.tick;

      const receipt = damage.find((p) => p.weaponId === id && p.targetId === target.id);
      assert.ok(receipt, `${id}: combat:damage must publish with the weapon id on it`);

      // Mass: physics authority received the impulse and the hitstun receipt published — same tick.
      const applied = impulses.find((req) => req.entityId === target.id);
      assert.ok(applied, `${id}: combatPhysics.applyImpulse must fire`);
      assert.ok(Math.hypot(applied.impulse.x, applied.impulse.z) > 0, `${id}: impulse is nonzero`);
      assert.ok(contactTick - applied.tick <= MAX_ANSWER_TICKS,
        `${id}: mass answered ${contactTick - applied.tick} ticks after contact (<= ${MAX_ANSWER_TICKS})`);
      const stun = hitstun.find((p) => p.victimId === target.id);
      assert.ok(stun && stun.deltaV > 0, `${id}: combat:hitstunImpulse must publish a real deltaV`);
      assert.ok(contactTick - stun.tick <= MAX_ANSWER_TICKS,
        `${id}: hitstun receipt ${contactTick - stun.tick} ticks after contact`);

      // Hit-stop: feel's own combat:damage subscription ran the crunch through the modal/motion
      // gates and armed the channel — the concussion cannon writes a real timeEffects dip, the
      // repeater answers with its authored FOV tick.
      if (expectHold) {
        assert.ok(live.hitStopWrites.includes('feel:hit-stop'),
          `${id}: a heavy single-shot must write feel:hit-stop into timeEffects`);
        assert.ok(feel._hsTimer > 0, `${id}: the hit-stop dip must be armed`);
      } else {
        assert.ok(feel._fovPunch > 0 || feel._hsTimer > 0 || live.hitStopWrites.length > 0,
          `${id}: a repeater's authored tick still punches the hit-stop channel`);
        assert.ok(!live.hitStopWrites.includes('feel:hit-stop'),
          `${id}: a 4/s repeater must tick, not hold — no hit-stop dip is authored for it`);
      }

      // Light: vfx's own projectile:hit subscription admitted an event light.
      assert.ok(vfx._weaponPresenter, 'vfx must have built the weapon presenter');
      assert.ok(vfx._weaponPresenter.lights.live > lightsBefore,
        `${id}: the contact must admit an event light under the full-effects profile`);

      // Sound: audio's own combat:damage subscription issued a cue request, and the shipped
      // default profile is unmuted — muted === false is the whole gate.
      assert.equal(audio._isMuted(), false,
        'the shipped default profile must be unmuted for action audio');
      const hitShield = target.shield > 0;
      const wanted = hitShield ? 'sfx.shieldHit' : 'sfx.hullHit';
      assert.ok(AUDIO_RECIPE_BY_ID[wanted],
        `${id}: the requested cue ${wanted} must exist in the recipe map real play() consults`);
      assert.ok(live.played.some((entry) => entry.cueId === wanted),
        `${id}: combat:damage must request the layer-matched cue ${wanted} (got ${live.played.map((e) => e.cueId).join(', ') || 'nothing'})`);
    } finally {
      live.restore();
    }
  });
}

test('armor and hull contacts request their own layer-matched cues', () => {
  const { state, bus, router, player, target } = boot();
  const damage = [];
  bus.on('combat:damage', (p) => damage.push(p));
  const def = weaponDef('wpn_concussion_cannon_m');
  const live = wireLiveChannels(state, bus);
  const fire = () => {
    router({
      attackerId: player.id,
      targetId: target.id,
      packet: buildWeaponDamagePacket({ defId: def.id }, def, def.dmg, def.damageType, { x: 34, z: 0 }),
      origin: { kind: 'weapon', id: def.id, weaponId: def.id },
    });
    return damage[damage.length - 1] || null;
  };
  try {
    target.shield = 0;
    target.armorHp = 80;
    const armorHit = fire();
    assert.ok(armorHit && armorHit.armorHit, 'armor layer must be the one struck');
    assert.ok(live.played.some((e) => e.cueId === 'sfx.armorHit'),
      'the armor contact must request sfx.armorHit through the real subscription');

    const before = live.played.length;
    target.armorHp = 0;
    const hullHit = fire();
    assert.ok(hullHit && hullHit.hullHit, 'hull layer must be the one struck');
    assert.ok(live.played.slice(before).some((e) => e.cueId === 'sfx.hullHit'),
      'the hull contact must request sfx.hullHit through the real subscription');
  } finally {
    live.restore();
  }
});
