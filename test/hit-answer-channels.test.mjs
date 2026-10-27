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
//   beat       — feel's combat:damage handler. The PLAYER'S OWN shot answers through ONE camera
//                channel: the bounded directional weapon kick (_applyWeaponKick -> camera
//                impactKick + the 1–2 frame hold), with no FOV punch, no trauma and no beat
//                window (commit 8cad9e30298, player-caused camera silence). A hit ON the player
//                keeps the full _applyKineticCrunch -> _trigger response (FOV punch/window).
//                Presentation only — the beat channel never writes the world clock.
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
import {
  feel, WEAPON_KICK_WU_MAX, HS_CAMERA_HOLD_MAX, IMPACT_KICK_MOMENTUM_FLOOR,
} from '../src/render/feel.js';
import { vfx } from '../src/render/vfx.js';
import { audio, AUDIO_RECIPE_BY_ID } from '../src/audio/audioSystem.js';

const DEFAULT_KIT = [
  { id: 'wpn_autocannon_m', expectHold: false },        // rof 4 — rhythmic tick by authored design
  { id: 'wpn_concussion_cannon_m', expectHold: true },  // rof 1, impulse 920 — real beat window
];

// The authored beat window a fired beat leaves armed, whichever internal field carries it —
// evidence a beat landed, never a clock contract. Presentation beats never write timeScale.
function beatWindow(host) {
  return host._beatTimer ?? host._hsTimer ?? 0;
}

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

  // The camera controller is the beat channel's observable sink: the directional kick, its
  // bounded hold, and (which a player-caused hit must never reach) trauma.
  const camera = { kicks: [], holds: [], traumas: [] };
  const priorCameraCtrl = state.render.cameraCtrl;
  state.render.cameraCtrl = {
    impactKick: (dirX, dirZ, magnitude) => camera.kicks.push({ dirX, dirZ, magnitude }),
    hold: (seconds) => { camera.holds.push(seconds); return true; },
    addTrauma: (value) => camera.traumas.push(value),
  };

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
    camera,
    restore() {
      state.render.cameraCtrl = priorCameraCtrl;
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
  test(`${id}: one contact answers beat + light + mass + sound on the same tick`, () => {
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

      // Beat: feel's own combat:damage subscription answered the PLAYER-CAUSED contact through
      // the one camera channel a player's own shot owns — the bounded directional kick plus its
      // 1–2 frame hold (a repeater tick below the momentum floor earns neither) — and through
      // nothing else: no FOV punch, no beat window, no trauma
      // (the old crunch would stack a zoom punch onto the player's own aim). The channel is
      // presentation only: no automatic beat may ever write a time-effects request.
      assert.ok(!live.hitStopWrites.includes('feel:hit-stop'),
        `${id}: feel must never write the retired 'feel:hit-stop' request`);
      // Whatever the camera did, a player-caused contact never shakes, punches or arms a window.
      assert.deepEqual(live.camera.traumas, [],
        `${id}: a player-caused contact must add no screen shake`);
      assert.equal(feel._fovPunch, 0,
        `${id}: a player-caused contact must not punch the FOV envelope`);
      assert.equal(beatWindow(feel), 0,
        `${id}: a player-caused contact must not arm an automatic beat window`);
      if (expectHold) {
        // The heavy single-shot clears the momentum floor, so it earns exactly one bounded
        // directional kick riding a bounded 1-2 frame camera hold.
        assert.equal(live.camera.kicks.length, 1,
          `${id}: a heavy single-shot must answer with exactly one directional camera kick`);
        const kick = live.camera.kicks[0];
        assert.ok(kick.magnitude > 0 && kick.magnitude <= WEAPON_KICK_WU_MAX,
          `${id}: the kick must be a positive, bounded displacement (got ${kick.magnitude})`);
        assert.ok(Math.abs(kick.dirX - 1) < 1e-6 && Math.abs(kick.dirZ) < 1e-6,
          `${id}: the kick follows the shot into the target (+X from the player at the origin)`);
        assert.ok(live.camera.holds.length >= 1
          && live.camera.holds.every((s) => s > 0 && s <= HS_CAMERA_HOLD_MAX),
        `${id}: the kick rides a bounded camera hold (got ${live.camera.holds.join(', ') || 'none'})`);
      } else {
        // The repeater's authored tick sits below the kick's momentum floor on purpose (a touch,
        // not a kick): its camera answer is silence. Prove the silence is the floor doing its
        // job, not a dead kick path — the heavy single-shot above proves the path is alive.
        assert.ok(def.impulsePerHit * 1.25 < IMPACT_KICK_MOMENTUM_FLOOR,
          `${id}: a repeater tick must sit below the kick floor for its camera silence to be authored`);
        assert.deepEqual(live.camera.kicks, [],
          `${id}: a below-floor repeater tick answers the camera with nothing`);
        assert.deepEqual(live.camera.holds, [],
          `${id}: a below-floor repeater tick holds nothing`);
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

for (const { id } of DEFAULT_KIT) {
  test(`${id}: a hit ON the player keeps the full FOV/beat response and no player-shot kick`, () => {
    const { state, bus, router, player, target } = boot();
    const def = weaponDef(id);
    const live = wireLiveChannels(state, bus);
    try {
      const result = router({
        attackerId: target.id,
        targetId: player.id,
        packet: buildWeaponDamagePacket({ defId: id }, def, def.dmg, def.damageType, { x: 0, z: 0 }),
        origin: { kind: 'weapon', id, weaponId: id },
      });
      assert.equal(result.ok, true, `${id}: the real router must accept the hit on the player`);
      assert.ok(feel._fovPunch > 0 || beatWindow(feel) > 0,
        `${id}: getting hit keeps the kinetic-crunch beat (FOV punch or authored window)`);
      assert.deepEqual(live.camera.kicks, [],
        `${id}: the directional weapon kick belongs to the player's own shot, not to getting hit`);
      assert.ok(!live.hitStopWrites.includes('feel:hit-stop'),
        `${id}: feel must never write the retired 'feel:hit-stop' request`);
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
