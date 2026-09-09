import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import {
  applyFlashAccessibility,
  resolveVfxAccessibilityProfile,
} from '../src/render/vfxAccessibility.js';
import {
  EVENT_LIGHT_POOL_SIZE,
  RIBBON_DISCONTINUITY_MAX_WU,
  RIBBON_NPC_OWNER_CAP,
  eventLightPoolSizeFor,
  resolveMasslineAccessibilityPolicy,
  vfx,
} from '../src/render/vfx.js';

test('event-light shader structure stays invariant across live accessibility and quality settings', () => {
  assert.equal(eventLightPoolSizeFor({ particleQuality: 'high', motionReduce: false }), EVENT_LIGHT_POOL_SIZE);
  assert.equal(eventLightPoolSizeFor({ particleQuality: 'low', motionReduce: false }), EVENT_LIGHT_POOL_SIZE);
  assert.equal(eventLightPoolSizeFor({ particleQuality: 'high', motionReduce: true }), EVENT_LIGHT_POOL_SIZE);
});

test('reduced-flash presentation stays readable without full-screen intensity spikes', () => {
  const full = resolveVfxAccessibilityProfile({ video: {}, accessibility: {} });
  const reduced = resolveVfxAccessibilityProfile({
    video: {},
    accessibility: { flashReduce: true },
  });
  const authored = { life: 0.06, size0: 30, size1: 90, opacity0: 1, opacity1: 0 };
  const fullFlash = applyFlashAccessibility(authored, full);
  const reducedFlash = applyFlashAccessibility(authored, reduced);

  assert.deepEqual(fullFlash, authored);
  assert.ok(reducedFlash.opacity0 <= 0.32);
  assert.ok(reducedFlash.size0 < authored.size0);
  assert.ok(reducedFlash.size1 < authored.size1);
  assert.ok(reducedFlash.life >= 0.1,
    'reduced flashes trade the instantaneous spike for a lower, slightly longer cue');
  assert.equal(reduced.eventLightPeakScale, 0.24);
});

test('the pooled VFX choke points apply reduced-flash policy to every effect family', () => {
  const scene = new THREE.Scene();
  const state = {
    playerId: 1,
    entities: new Map([[1, { id: 1, pos: { x: 0, z: 0 } }]]),
    entityList: [],
    settings: {
      video: { particleQuality: 'high', motionReduce: false, engineTrails: true },
      accessibility: { flashReduce: false },
    },
    render: { scene },
  };
  const bus = createBus();
  const system = Object.create(vfx);
  system.init({ state, bus, helpers: {} });

  const normal = system._spawnSprite(0, 0, 0, 0, 0.06, 30, 90, 1, 0, '#ffffff', 0, 0);
  system._flashLight({ x: 0, z: 0 }, '#ffffff', 10, 8, 100);
  const normalPeak = system._lights[0].peak;

  state.settings.accessibility.flashReduce = true;
  const reduced = system._spawnSprite(0, 0, 0, 0, 0.06, 30, 90, 1, 0, '#ffffff', 0, 0);
  const reducedCombustion = system._spawnSprite(4, 0, 0, 0, 0.08, 24, 70, 0.8, 0,
    '#ff6a24', 0, 0, 2.2, 0);
  system._flashLight({ x: 0, z: 0 }, '#ffffff', 10, 8, 100);
  const reducedPeak = system._lights[1].peak;

  assert.ok(reduced.op0 < normal.op0);
  assert.ok(reduced.size1 < normal.size1);
  assert.ok(reducedCombustion.op0 <= 0.32,
    'irregular combustion must use the same reduced-flash choke point as generic flash cards');
  assert.ok(reducedCombustion.size1 < 70);
  assert.ok(reducedPeak < normalPeak * 0.3);
});

test('luminous velocity ribbons honor flash, motion, quality, and engine-trail settings live', () => {
  const scene = new THREE.Scene();
  const player = {
    id: 1, type: 'ship', alive: true, radius: 12, rot: 0,
    pos: { x: 0, z: 0 }, vel: { x: 120, z: 0 }, maxSpeed: 120,
    flags: {}, data: {}, _flightFrame: { throttle: 1 },
  };
  const npc = {
    id: 2, type: 'ship', alive: true, radius: 24, rot: 0,
    pos: { x: 0, z: 0 }, vel: { x: 120, z: 0 }, maxSpeed: 120,
    flags: {}, data: { defId: 'ship_ironback' }, _flightFrame: { throttle: 1 },
  };
  const state = {
    playerId: player.id,
    player: { cruise: null, targetId: npc.id },
    entities: new Map([[player.id, player], [npc.id, npc]]),
    entityList: [player, npc],
    settings: {
      video: { particleQuality: 'high', motionReduce: false, engineTrails: true },
      accessibility: { flashReduce: false },
    },
    render: { scene },
  };
  const bus = createBus();
  const system = Object.create(vfx);
  system.init({ state, bus, helpers: {} });

  system._updateRibbonTrails(1 / 60);
  player.pos.x = 12;
  npc.pos.x = 12;
  system._updateRibbonTrails(1 / 30);
  assert.equal(system._ribbonTrails.has(player.id), false,
    'the player never enters _ribbonTrails');
  const trail = system._ribbonTrails.get(npc.id);
  assert.ok(trail && trail.getMesh().visible,
    'the eligible NPC receives a live ordinary-route ribbon');
  const material = trail.getMaterial();
  const fullOpacity = material.uniforms.uOpacity.value;
  const fullRadiance = material.uniforms.uRadiance.value;
  assert.ok(fullOpacity > 0.5 && fullRadiance > 1,
    'default presentation keeps a bright HDR filament and colored sheath');

  const rebuildWake = () => {
    npc.pos.x += 2;
    system._updateRibbonTrails(1 / 60);
    npc.pos.x += 12;
    system._updateRibbonTrails(1 / 30);
    assert.equal(trail.getMesh().visible, true, 'boundary reset must reseed into a live wake');
  };
  for (const event of ['ship:appearanceChanged', 'world:playerRelocated', 'save:restoring',
    'sector:exit', 'game:new']) {
    bus.emit(event, event === 'ship:appearanceChanged' ? { id: npc.id } : {});
    assert.equal(trail.getMesh().visible, false, `${event} must clear stale ribbon geometry`);
    assert.equal(trail.inspect().visiblePointCount, 0, `${event} must clear ribbon history`);
    rebuildWake();
  }
  system.reprojectFrame(-4096, 2048);
  assert.equal(trail.getMesh().visible, false, 'floating-origin shift must clear stale ribbon geometry');
  assert.equal(trail.inspect().visiblePointCount, 0, 'floating-origin shift must clear ribbon history');
  rebuildWake();

  npc.vel.x = 5000;
  npc.pos.x += RIBBON_DISCONTINUITY_MAX_WU * 4;
  system._updateRibbonTrails(0.1);
  assert.equal(trail.getMesh().visible, false,
    'an extreme-speed un-signaled teleport must reseed instead of drawing a screen bridge');
  assert.equal(trail.inspect().visiblePointCount, 1,
    'the production discontinuity ceiling must retain only the current nozzle pose');
  npc.vel.x = 120;
  rebuildWake();

  const reducedFlashShapes = [
    ['accessibility.flashReduce', () => { state.settings.accessibility.flashReduce = true; }],
    ['video.flashReduce', () => { state.settings.video.flashReduce = true; }],
    ['accessibility.reducedFlash', () => { state.settings.accessibility.reducedFlash = true; }],
  ];
  for (const [label, enableReducedFlash] of reducedFlashShapes) {
    state.settings.accessibility.flashReduce = false;
    state.settings.accessibility.reducedFlash = false;
    state.settings.video.flashReduce = false;
    enableReducedFlash();
    player.pos.x += 4;
    system._updateRibbonTrails(1 / 60);
    assert.ok(material.uniforms.uOpacity.value < fullOpacity, `${label} must lower ribbon coverage`);
    assert.ok(material.uniforms.uRadiance.value < fullRadiance,
      `${label} must lower HDR energy without changing trail topology`);
  }
  state.settings.accessibility.reducedFlash = false;

  state.settings.video.engineTrails = false;
  system._updateRibbonTrails(1 / 60);
  assert.equal(trail.getMesh().visible, false, 'engineTrails=false hides and clears the wake immediately');
  assert.equal(trail.inspect().visiblePointCount, 0);

  state.settings.video.engineTrails = true;
  state.settings.video.motionReduce = true;
  system._updateRibbonTrails(1 / 60);
  assert.equal(trail.getMesh().visible, false, 'motionReduce retains compact propulsion without the long wake');

  state.settings.video.motionReduce = false;
  state.settings.video.particleQuality = 'low';
  system._updateRibbonTrails(1 / 60);
  assert.equal(trail.getMesh().visible, false, 'low quality does not leave stale high-quality ribbon geometry');
});

test('dense fleets keep ribbon owners and full NPC history rebuilds bounded', () => {
  const scene = new THREE.Scene();
  const player = {
    id: 1, type: 'ship', alive: true, radius: 12, rot: 0,
    pos: { x: 0, z: 0 }, vel: { x: 120, z: 0 }, maxSpeed: 120,
    flags: {}, data: {}, _flightFrame: { throttle: 1 },
  };
  const npcs = [];
  for (let i = 0; i < RIBBON_NPC_OWNER_CAP * 3; i++) {
    npcs.push({
      id: 100 + i,
      type: 'ship',
      alive: true,
      radius: 24,
      rot: 0,
      pos: { x: 2400 + i * 3, z: 40 },
      vel: { x: 60, z: 0 },
      maxSpeed: 120,
      flags: {},
      data: {},
      _flightFrame: { throttle: 1 },
    });
  }
  const entityList = [player, ...npcs];
  const state = {
    playerId: player.id,
    player: { cruise: null, targetId: npcs[npcs.length - 1].id },
    entities: new Map(entityList.map((e) => [e.id, e])),
    entityList,
    settings: {
      video: { particleQuality: 'high', motionReduce: false, engineTrails: true },
      accessibility: { flashReduce: false },
    },
    render: { scene },
  };
  const system = Object.create(vfx);
  system.init({ state, bus: createBus(), helpers: {} });
  system._trailTierFor = (e, ctx) => (e.id === ctx.targetId ? 'full' : 'reduced');

  const frames = 12;
  for (let frame = 0; frame < frames; frame++) {
    system._trailFrameIndex++;
    for (let i = 0; i < entityList.length; i++) {
      const e = entityList[i];
      e.pos.x += e.vel.x / 60;
    }
    system._updateRibbonTrails(1 / 60);
  }

  let rebuildsBeforeRepeatedToken = 0;
  for (const [id, trail] of system._ribbonTrails) {
    if (id !== player.id && id !== state.player.targetId) {
      rebuildsBeforeRepeatedToken += trail.inspect().fullRebuildCount;
    }
  }
  for (let i = 0; i < entityList.length; i++) entityList[i].pos.x += entityList[i].vel.x / 120;
  system._updateRibbonTrails(1 / 120);
  let rebuildsAfterRepeatedToken = 0;
  for (const [id, trail] of system._ribbonTrails) {
    if (id !== player.id && id !== state.player.targetId) {
      rebuildsAfterRepeatedToken += trail.inspect().fullRebuildCount;
    }
  }
  assert.equal(rebuildsAfterRepeatedToken, rebuildsBeforeRepeatedToken,
    'a high-refresh display frame sharing the same trail tick must not repeat full NPC uploads');

  assert.equal(system._ribbonTrails.has(player.id), false,
    'the player never enters _ribbonTrails');
  assert.ok(system._ribbonTrails.size <= RIBBON_NPC_OWNER_CAP,
    `dense fleet created ${system._ribbonTrails.size} ribbons above the NPC cap`);
  let npcOwners = 0;
  let headSyncs = 0;
  for (const [id, trail] of system._ribbonTrails) {
    if (id === player.id) continue;
    npcOwners++;
    const stats = trail.inspect();
    assert.equal(stats.capacity, 24, 'NPC ribbon capacity must remain fixed');
    if (id === state.player.targetId) {
      assert.ok(stats.fullRebuildCount > Math.ceil(frames / 3),
        'the selected target must retain full-rate presentation inside the fixed owner budget');
    } else {
      assert.ok(stats.fullRebuildCount <= Math.ceil(frames / 3),
        `reduced NPC ${id} rebuilt full history ${stats.fullRebuildCount} times in ${frames} frames`);
      const range = trail.getMesh().geometry.attributes.position.updateRanges[0];
      assert.equal(range && range.count, 6,
        `cadenced NPC ${id} must publish a two-vertex partial upload on repeated trail ticks`);
      assert.equal(range.count * Float32Array.BYTES_PER_ELEMENT, 24,
        `cadenced NPC ${id} head upload must remain 24 bytes`);
    }
    headSyncs += stats.headSyncCount;
    const entity = state.entities.get(id);
    const positions = trail.getMesh().geometry.attributes.position.array;
    const headX = (positions[0] + positions[3]) * 0.5;
    const expectedNozzleX = entity.pos.x - entity.radius * 0.88;
    assert.ok(Math.abs(headX - expectedNozzleX) < 5e-4,
      `cadenced NPC ${id} head ${headX} detached from live nozzle ${expectedNozzleX}`);
  }
  assert.equal(npcOwners, RIBBON_NPC_OWNER_CAP,
    'dense fleet must retain exactly the bounded NPC presentation budget');
  assert.ok(system._ribbonTrails.has(state.player.targetId),
    'a late-list selected target must claim the reserved high-fidelity NPC slot');
  assert.ok(headSyncs > 0,
    'cadence-reduced NPC ribbons must use cheap live-head synchronization between rebuilds');
});

test('Massline accessibility freezes rapid motion/pulses while retaining a steady structural read', () => {
  const full = resolveMasslineAccessibilityPolicy({ video: {}, accessibility: {} });
  const motion = resolveMasslineAccessibilityPolicy({
    video: { motionReduce: true },
    accessibility: {},
  });
  const flash = resolveMasslineAccessibilityPolicy({
    video: {},
    accessibility: { flashReduce: true },
  });
  const both = resolveMasslineAccessibilityPolicy({
    video: { motionReduce: true },
    accessibility: { flashReduce: true },
  });

  assert.equal(full.animateMotion, true);
  assert.equal(full.animatePulse, true);
  assert.equal(motion.animateMotion, false);
  assert.equal(motion.animatePulse, false);
  assert.equal(motion.motionAmplitudeScale, 0);
  assert.equal(flash.animateMotion, true,
    'reduced flash may retain non-luminance geometry motion');
  assert.equal(flash.animatePulse, false);
  assert.equal(flash.pulseScale, 0);
  assert.ok(flash.radianceScale > 0 && flash.radianceScale < 1,
    'reduced flash lowers HDR energy without deleting the line');
  assert.ok(flash.opacityScale > 0 && flash.opacityScale < 1,
    'the static cable silhouette remains visible');
  assert.equal(both.animateMotion, false);
  assert.equal(both.animatePulse, false);
  assert.ok(both.radianceScale > 0);
});

test('default player-owned Massline suppresses every snap transient while retaining its structure', () => {
  const scene = new THREE.Scene();
  const player = {
    id: 1, alive: true, type: 'ship', radius: 6, rot: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
  };
  const target = {
    id: 2, alive: true, type: 'station', radius: 20,
    pos: { x: 80, z: 0 }, vel: { x: 0, z: 0 }, data: {},
  };
  const tether = {
    active: true,
    targetId: target.id,
    restLength: 70,
    strain: 0,
    load: 0.6,
    phase: 'loaded',
    reeling: false,
  };
  const state = {
    playerId: player.id,
    player: { tether },
    entities: new Map([[player.id, player], [target.id, target]]),
    settings: { video: {}, accessibility: {} },
    simTime: 12,
  };
  const system = Object.create(vfx);
  Object.assign(system, {
    state,
    helpers: { player: () => player },
    _scene: scene,
    _ctmp: new THREE.Color(),
    _spawnLocalXZ: {},
    _entityLocalXZ: {},
    _burst: 1,
    _ent: (id) => state.entities.get(id),
    _toLocalXZ(x, z, out) { out.x = x; out.z = z; return out; },
    _bloomRadianceScale: () => 1.4,
    _spawnParticle() {},
    _spawnSprite() {},
  });
  system._initTetherCable();
  system._updateTetherCable(1);
  tether.active = false;

  const capture = (snapAge) => {
    const cable = system._tetherCable;
    cable.snapAge = snapAge;
    cable.latchAge = 999;
    cable.fade = 1;
    cable.loadSmooth = 0.6;
    cable.strainSmooth = 0;
    cable.reelGlow = 0;
    system._updateTetherCable(0);
    const core = cable.mesh.geometry.attributes.position.array;
    const glow = cable.glow.geometry.attributes.position.array;
    return {
      coreIntensity: cable.mesh.material.uniforms.uIntensity.value,
      glowIntensity: cable.glow.material.uniforms.uIntensity.value,
      glowOpacity: cable.glow.material.uniforms.uOpacity.value,
      bandOpacity: cable.band.material.opacity,
      coreWidth: Math.hypot(core[0] - core[3], core[2] - core[5]) * 0.5,
      glowWidth: Math.hypot(glow[0] - glow[3], glow[2] - glow[5]) * 0.5,
      anchorOpacity: cable.anchor.material.opacity,
      anchorCoreOpacity: cable.anchorCore.material.opacity,
      anchorCoreColor: cable.anchorCore.material.color.getHexString(),
      targetHaloOpacity: cable.targetHalo.material.opacity,
      visible: cable.mesh.visible && cable.band.visible && cable.anchor.visible,
    };
  };

  const fullSnap = capture(0);
  const fullSteady = capture(999);
  assert.ok(fullSnap.coreIntensity > fullSteady.coreIntensity);
  assert.ok(fullSnap.glowIntensity > fullSteady.glowIntensity);
  assert.ok(fullSnap.glowOpacity > fullSteady.glowOpacity);
  assert.ok(fullSnap.bandOpacity > fullSteady.bandOpacity);
  assert.ok(fullSnap.coreWidth > fullSteady.coreWidth);
  assert.ok(fullSnap.glowWidth > fullSteady.glowWidth);
  assert.ok(fullSnap.anchorOpacity > fullSteady.anchorOpacity);
  assert.ok(fullSnap.anchorCoreOpacity > fullSteady.anchorCoreOpacity);
  assert.notEqual(fullSnap.anchorCoreColor, fullSteady.anchorCoreColor);
  assert.ok(fullSnap.targetHaloOpacity > fullSteady.targetHaloOpacity);

  state.settings.video.motionReduce = true;
  state.settings.accessibility.flashReduce = true;
  const reducedSnap = capture(0);
  const reducedSteady = capture(999);
  assert.deepEqual(reducedSnap, reducedSteady,
    'snap whitening, luminance, opacity, widths, hitch, and anchor transients share one policy');
  assert.equal(reducedSnap.visible, true);
  assert.ok(reducedSnap.coreIntensity > 0 && reducedSnap.glowOpacity > 0
    && reducedSnap.bandOpacity > 0 && reducedSnap.anchorOpacity > 0,
  'the static cable, band, and anchor remain readable');
});

test('the alternate Massline ribbon applies reduced-flash HDR and reduced-motion pulse policy live', () => {
  const makeMaterial = () => ({
    uniforms: {
      uTime: { value: -1 },
      uIntensity: { value: 0 },
      uOpacity: { value: 0 },
      uPulse: { value: -1 },
    },
  });
  const coreMaterial = makeMaterial();
  const haloMaterial = makeMaterial();
  const ribbon = {
    visible: false,
    position: { set() {} },
    rotation: { y: 0 },
    scale: { set() {} },
    userData: {
      energyCore: { material: coreMaterial },
      energyHalo: { material: haloMaterial },
    },
  };
  const player = { id: 1, alive: true, pos: { x: 0, z: 0 } };
  const other = { id: 2, alive: true, pos: { x: 40, z: 0 } };
  const state = {
    playerId: player.id,
    entities: new Map([[player.id, player], [other.id, other]]),
    combat: {
      attachments: {
        byId: {
          incoming: {
            state: 'active',
            ownerId: other.id,
            targetId: player.id,
            masslineTelemetry: { tensionFraction: 0.8, overloadRatio: 1.2 },
          },
        },
      },
    },
    settings: { video: {}, accessibility: {} },
  };
  const system = Object.create(vfx);
  Object.assign(system, {
    state,
    _energy: { ribbon },
    _t: 12,
    _spawnLocalXZ: {},
    _bloomRadianceScale: () => 1.4,
    _toLocalXZ(x, z, out) { out.x = x; out.z = z; return out; },
  });

  system._updateEnergyMassline(1 / 60);
  const full = {
    time: coreMaterial.uniforms.uTime.value,
    intensity: coreMaterial.uniforms.uIntensity.value,
    opacity: coreMaterial.uniforms.uOpacity.value,
    pulse: coreMaterial.uniforms.uPulse.value,
  };
  state.settings.video.motionReduce = true;
  state.settings.accessibility.flashReduce = true;
  system._updateEnergyMassline(1 / 60);

  assert.equal(coreMaterial.uniforms.uTime.value, 0);
  assert.equal(coreMaterial.uniforms.uPulse.value, 0);
  assert.ok(coreMaterial.uniforms.uIntensity.value > 0);
  assert.ok(coreMaterial.uniforms.uIntensity.value < full.intensity);
  assert.ok(coreMaterial.uniforms.uOpacity.value > 0);
  assert.ok(coreMaterial.uniforms.uOpacity.value < full.opacity);
  assert.equal(full.time, 12);
  assert.ok(full.pulse > 1);
});
