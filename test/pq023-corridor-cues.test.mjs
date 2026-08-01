// PQ-023 `gold-corridor-required-cues` — focused contracts for the six corridor cue families.
//
// Each block pins a gap that was MEASURED at b6b6422d (see
// design/graphics-sprints/handoffs/2026-07-28-pq023-corridor-cues-audit.md). Where a test asserts an
// inequality rather than a literal, that is deliberate: the packet forbids exact effect-count tests
// that do not prove player perception, so the contract is "damage reads darker and smaller than
// nominal", not "opacity is exactly 0.1564".

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  CRITICAL_COOCCURRENCE,
  CUE_BUDGET_DECLARATION,
  CUE_LANE_BUDGETS,
  CUE_LANE_CRITICAL_RESERVE,
  chargeCueLanes,
  isCriticalCue,
  isNoneLane,
  laneBudgetReason,
  laneLimitFor,
} from '../src/presentation/cueArbitration.js';
import {
  PRESENTATION_RECIPES,
  REDUCED_CUE_MODES,
  getPresentationRecipe,
  validatePresentationRecipes,
} from '../src/presentation/cueRecipes.js';
import {
  impairedDutyCycle,
  isImpairedWorldSiteStatus,
  worldSiteConditionForStatus,
  worldSiteConditionText,
} from '../src/presentation/worldSiteDamageStates.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';
import { presentationAdapters } from '../src/systems/presentationAdapters.js';
import { installWorldSitePresentation } from '../src/render/worldSitePresentation.js';
import { worldSiteManifestById } from '../src/data/worldSiteManifests.js';
import { resolveImpactPresentationProfile } from '../src/render/vfxProfiles.js';
import { vfx } from '../src/render/vfx.js';

// ---------------------------------------------------------------- harness

function makeBus() {
  const handlers = new Map();
  const emitted = [];
  return {
    emitted,
    on(type, fn) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push(fn);
      return () => {};
    },
    emit(type, payload) {
      emitted.push({ type, payload });
      for (const fn of handlers.get(type) || []) fn(payload);
    },
    cues() { return this.emitted.filter((e) => e.type === 'presentation:cue').map((e) => e.payload); },
    suppressed() { return this.emitted.filter((e) => e.type === 'presentation:cueSuppressed').map((e) => e.payload); },
  };
}

function makeState(tick = 100) {
  return {
    tick,
    simTime: tick / 60,
    playerId: 1,
    entities: new Map([[1, { id: 1, pos: { x: 0, y: 0, z: 0 } }]]),
  };
}

function bootOrchestrator(tick = 100) {
  const bus = makeBus();
  const state = makeState(tick);
  presentationOrchestrator.init({ state, bus });
  return { bus, state };
}

// ---------------------------------------------------------- (f) arbitration

test('(f) `.none` lane placeholders are never charged budget', () => {
  assert.equal(isNoneLane('camera.none'), true);
  assert.equal(isNoneLane('vfx.direct_drill_ui'), false);
  assert.equal(isNoneLane(null), false);

  const counts = {};
  chargeCueLanes({ camera: 'camera.none', vfx: 'vfx.direct_drill_ui', audio: 'audio.mining' }, counts);
  assert.equal(counts.camera, undefined, 'a .none lane must cost nothing');
  assert.equal(counts.vfx, 1);
  assert.equal(counts.audio, 1);
});

test('(f) lane totals are unchanged from the pre-PQ-023 budget', () => {
  // The leaf redistributes the cap; it must never raise it.
  assert.deepEqual(CUE_LANE_BUDGETS, { camera: 3, vfx: 8, audio: 6, ui: 6, accessibility: 6 });
  for (const lane of Object.keys(CUE_LANE_BUDGETS)) {
    const reserve = CUE_LANE_CRITICAL_RESERVE[lane];
    assert.ok(reserve > 0, `${lane} must reserve capacity for critical cues`);
    assert.ok(reserve < CUE_LANE_BUDGETS[lane], `${lane} reserve must not consume the whole lane`);
    assert.equal(laneLimitFor(lane, true), CUE_LANE_BUDGETS[lane], `${lane} critical limit is the full cap`);
    assert.equal(laneLimitFor(lane, false), CUE_LANE_BUDGETS[lane] - reserve, `${lane} general pool excludes the reserve`);
  }
});

test('(f) the reserve is sized to critical co-occurrence, not an arbitrary constant', () => {
  // A corridor engagement can collapse a shield, disable a subsystem and snap a massline on one
  // frame. A reserve smaller than that still drops critical state, just later: measured at a
  // reserve of 2, the dense gate lost exactly one critical cue per saturated tick.
  assert.ok(CRITICAL_COOCCURRENCE >= 3);
  for (const lane of ['vfx', 'audio', 'ui', 'accessibility']) {
    assert.equal(CUE_LANE_CRITICAL_RESERVE[lane], CRITICAL_COOCCURRENCE,
      `${lane} must hold every co-occurring critical cue`);
  }
  // Camera is deliberately the exception: the packet forbids camera motion that steals control, so
  // one critical kick may land but three must not stack on a frame.
  assert.equal(CUE_LANE_CRITICAL_RESERVE.camera, 1);
});

test('(f) critical identity reuses the existing markers, not a new priority field', () => {
  assert.equal(isCriticalCue({ id: 'tether.break' }, getPresentationRecipe('tether.break')), true);
  assert.equal(isCriticalCue({ id: 'shield.collapse' }, getPresentationRecipe('shield.collapse')), true);
  assert.equal(isCriticalCue({ id: 'world_site.damage' }, getPresentationRecipe('world_site.damage')), true);
  assert.equal(isCriticalCue({ id: 'mining.drill.contact' }, getPresentationRecipe('mining.drill.contact')), false);
  assert.equal(isCriticalCue({ id: 'world_site.recovery' }, getPresentationRecipe('world_site.recovery')), false,
    'a completion receipt must not consume the reserve that exists for failures');
});

test('(f) a saturated tick drops flavor and keeps critical state', () => {
  const { bus } = bootOrchestrator();
  try {
    // Eight flavor cues arrive BEFORE the critical one, in the same tick.
    for (let i = 0; i < 8; i += 1) {
      presentationOrchestrator._emitCue('mining.drill.contact', { sourceId: 100 + i, targetId: 200 + i },
        { sourceEvent: 'test:flavor', sequence: `flavor-${i}` });
    }
    const critical = presentationOrchestrator._emitCue('tether.break', { sourceId: 1, targetId: 900 },
      { sourceEvent: 'test:critical', sequence: 'critical-1' });

    assert.equal(critical, true, 'the critical cue must survive a tick saturated by flavor');
    const ids = bus.cues().map((c) => c.id);
    assert.ok(ids.includes('tether.break'), 'tether.break must reach the bus');
    const dropped = bus.suppressed();
    assert.ok(dropped.length > 0, 'flavor must degrade once the general pool is exhausted');
    assert.ok(dropped.every((d) => d.id === 'mining.drill.contact'),
      `only flavor may be dropped, got ${dropped.map((d) => d.id).join(',')}`);
    assert.ok(dropped.every((d) => String(d.reason).startsWith('lane_budget:')));
  } finally {
    presentationOrchestrator.dispose();
  }
});

test('(f) lane budget resets per tick and duplicate suppression still applies', () => {
  const { bus, state } = bootOrchestrator();
  try {
    for (let i = 0; i < 8; i += 1) {
      presentationOrchestrator._emitCue('mining.drill.contact', { sourceId: 1, targetId: 2 },
        { sourceEvent: 'test:flavor', sequence: `s-${i}` });
    }
    const firstTickSuppressed = bus.suppressed().length;
    assert.ok(firstTickSuppressed > 0);

    state.tick += 1;
    state.simTime = state.tick / 60;
    const afterReset = presentationOrchestrator._emitCue('mining.drill.contact', { sourceId: 1, targetId: 2 },
      { sourceEvent: 'test:flavor', sequence: 's-fresh' });
    assert.equal(afterReset, true, 'a new tick must restore the general pool');

    // Same dedupe identity inside the window is still suppressed as a duplicate, not by budget.
    state.tick += 1;
    state.simTime = state.tick / 60;
    presentationOrchestrator._emitCue('mining.drill.contact', { sourceId: 1, targetId: 2 },
      { sourceEvent: 'test:flavor', sequence: 's-fresh' });
    assert.equal(bus.suppressed().at(-1).reason, 'dedupe_window');
  } finally {
    presentationOrchestrator.dispose();
  }
});

test('(f) budget declaration is data and agrees with the enforced caps', () => {
  assert.equal(CUE_BUDGET_DECLARATION.lanes, CUE_LANE_BUDGETS);
  assert.equal(CUE_BUDGET_DECLARATION.criticalReserve, CUE_LANE_CRITICAL_RESERVE);
  assert.equal(CUE_BUDGET_DECLARATION.exhaustionBehavior.nonePlaceholdersCharged, false);
  assert.equal(CUE_BUDGET_DECLARATION.exhaustionBehavior.rule, 'reservation');
  assert.equal(CUE_BUDGET_DECLARATION.allocation.hotPathAllocation, false);
});

test('(f) an unknown lane keeps its pre-PQ-023 single-slot behaviour', () => {
  const counts = { experimental: 1 };
  assert.equal(laneBudgetReason({ experimental: 'experimental.thing' }, false, counts), 'lane_budget:experimental');
  assert.equal(laneBudgetReason({ experimental: 'experimental.thing' }, false, {}), null);
});

// ------------------------------------------------- (c) world site damage cues

test('(c) a World Site failure receipt produces a critical cue naming the component', () => {
  const { bus } = bootOrchestrator(10);
  try {
    bus.emit('worldSite:failureReceipt', {
      siteId: 'world_site_wreck_cathedral',
      componentId: 'cathedral_hull',
      triggerId: 'cathedral_hull_impact',
      stageId: 'dark',
      receipt: { sequence: 1 },
    });
    const cue = bus.cues().at(-1);
    assert.equal(cue.id, 'world_site.damage');
    assert.ok(cue.tags.includes('critical'), 'losing durable player work must survive dense ticks');
    assert.match(cue.accessibilityText, /failed\.$/);
    assert.match(cue.accessibilityText, /hull/i, 'the caption must name WHICH component failed');
    assert.equal(cue.subsystemId, 'cathedral_hull');
    assert.ok(cue.playerRelevance >= 0.9, 'site damage undoes player work and is addressed to them');
  } finally {
    presentationOrchestrator.dispose();
  }
});

test('(c) only an authored recovery operation produces a recovery cue', () => {
  const { bus, state } = bootOrchestrator(10);
  try {
    // stabilize_cathedral_hull has from: ['failed'] -> it IS the recovery path.
    bus.emit('worldSite:operationReceipt', {
      siteId: 'world_site_wreck_cathedral',
      componentId: 'cathedral_hull',
      operationId: 'stabilize_cathedral_hull',
      stageId: 'stabilized',
      receipt: { sequence: 2, complete: true },
    });
    assert.equal(bus.cues().at(-1).id, 'world_site.recovery');
    assert.match(bus.cues().at(-1).accessibilityText, /restored\.$/);

    // An ordinary progress operation is not damage recovery.
    state.tick += 60;
    state.simTime = state.tick / 60;
    const before = bus.cues().length;
    bus.emit('worldSite:operationReceipt', {
      siteId: 'world_site_wreck_cathedral',
      componentId: 'registry_scan_array',
      operationId: 'extract_registry_scan',
      stageId: 'opened',
      receipt: { sequence: 3, complete: true },
    });
    assert.equal(bus.cues().length, before, 'a non-recovery operation must not emit a recovery cue');

    // An incomplete receipt is progress, not a transition.
    bus.emit('worldSite:operationReceipt', {
      siteId: 'world_site_wreck_cathedral',
      componentId: 'cathedral_hull',
      operationId: 'stabilize_cathedral_hull',
      stageId: 'dark',
      receipt: { sequence: 4, complete: false },
    });
    assert.equal(bus.cues().length, before, 'an incomplete operation must not emit a recovery cue');
  } finally {
    presentationOrchestrator.dispose();
  }
});

test('(e) a restoration must not interrupt a screen reader; a failure may', () => {
  // presentationAdapters._applyAccessibility promotes playerRelevance >= 0.9 (or importance >= 0.85)
  // to an ASSERTIVE interrupt. A payoff receipt must never pre-empt a live warning mid-sentence.
  const bus = makeBus();
  const state = makeState(10);
  state.settings = { video: {}, accessibility: {} };
  const captions = [];
  bus.on('presentation:accessibilityCue', (p) => captions.push(p));
  bus.on('accessibility:caption', (p) => captions.push(p));
  presentationOrchestrator.init({ state, bus });
  presentationAdapters.init({ state, bus });
  try {
    bus.emit('worldSite:failureReceipt', {
      siteId: 'world_site_wreck_cathedral', componentId: 'cathedral_hull',
      triggerId: 'cathedral_hull_impact', stageId: 'dark', receipt: { sequence: 1 },
    });
    state.tick = 200;
    state.simTime = state.tick / 60;
    bus.emit('worldSite:operationReceipt', {
      siteId: 'world_site_wreck_cathedral', componentId: 'cathedral_hull',
      operationId: 'stabilize_cathedral_hull', stageId: 'stabilized',
      receipt: { sequence: 2, complete: true },
    });

    const cues = bus.cues();
    const damage = cues.find((c) => c.id === 'world_site.damage');
    const recovery = cues.find((c) => c.id === 'world_site.recovery');
    assert.ok(damage.playerRelevance >= 0.9, 'damage undoes player work and is addressed to them');
    assert.ok(recovery.playerRelevance < 0.9,
      `a restoration must stay below the assertive tier, got ${recovery.playerRelevance}`);
    assert.ok(recovery.playerRelevance >= 0.88, 'but it must still clear the player-lane floor');
    assert.ok(recovery.importance < 0.85, 'and must not reach the assertive tier by importance either');
  } finally {
    presentationAdapters.dispose();
    presentationOrchestrator.dispose();
  }
});

// ------------------------------------------- (c)/(e) noncolor condition states

test('(c)(e) damage reads through opacity and scale, not colour alone', () => {
  const impaired = worldSiteConditionForStatus('failed');
  const latent = worldSiteConditionForStatus('sealed');
  const nominal = worldSiteConditionForStatus('ready');

  assert.equal(impaired.condition, 'impaired');
  assert.equal(latent.condition, 'latent');
  assert.equal(nominal.condition, 'nominal');

  // The whole point of the leaf: these must differ in channels that survive greyscale.
  assert.ok(impaired.opacityScale < latent.opacityScale, 'failed must read dimmer than sealed');
  assert.ok(latent.opacityScale < nominal.opacityScale, 'sealed must read dimmer than nominal');
  assert.ok(impaired.scaleMul < nominal.scaleMul, 'failed must read smaller than nominal');
  assert.notEqual(impaired.shape, nominal.shape, 'non-colour glyphs must differ');

  // An unrecognised status must never render as damage.
  assert.equal(worldSiteConditionForStatus('some_future_status').condition, 'nominal');
  assert.equal(worldSiteConditionForStatus(null).condition, 'nominal');
  assert.equal(isImpairedWorldSiteStatus('failed'), true);
  assert.equal(isImpairedWorldSiteStatus('ready'), false);
});

test('(d) the impaired stutter is held still in reduced motion', () => {
  const impaired = worldSiteConditionForStatus('failed');
  let sawDropout = false;
  for (let i = 0; i < 40; i += 1) {
    const t = i / 40;
    if (impairedDutyCycle(t, impaired.stutter, false) < 1) sawDropout = true;
    assert.equal(impairedDutyCycle(t, impaired.stutter, true), 1,
      'reduced motion must hold the cue steady so nothing moves');
  }
  assert.ok(sawDropout, 'full mode must actually stutter, otherwise the reduced form proves nothing');
  // Dimming survives even when the motion does not, so the state is still legible.
  assert.ok(impaired.opacityScale < 1);
});

test('(e) condition text is owner-derived and states the mechanical fact', () => {
  assert.equal(worldSiteConditionText('Cathedral hull', 'failed'), 'Cathedral hull failed.');
  assert.equal(worldSiteConditionText('Cathedral hull', 'stabilized'), 'Cathedral hull restored.');
  assert.equal(worldSiteConditionText(null, 'failed'), 'Site component failed.');
});

// --------------------------------------------- (c) fixture binding + cleanup

function cathedralEntity(stageId, componentStatuses) {
  const manifest = worldSiteManifestById('world_site_wreck_cathedral');
  const stage = manifest.stages.find((s) => s.id === stageId);
  return {
    data: {
      worldSitePresentation: {
        schemaVersion: 1,
        stageId,
        revision: 1,
        fixtures: stage.presentation.fixtures,
        animations: stage.presentation.animations,
        componentStatuses,
      },
    },
  };
}

function buildSocketRoot() {
  const root = new THREE.Group();
  for (const name of ['SOCKET_TheMarker', 'ZONE_Bridge', 'ZONE_Service_Starboard']) {
    const socket = new THREE.Group();
    socket.name = name;
    socket.userData.spacefaceSocket = true;
    root.add(socket);
  }
  return root;
}

function sampleFixtures(entity, a11y = { reducedMotion: false, reducedFlash: false }) {
  const root = buildSocketRoot();
  const controller = installWorldSitePresentation(root, entity);
  controller.update(entity, 0, a11y);
  const out = [];
  root.traverse((o) => {
    if (o.userData && o.userData.worldSitePresentationFixtureId) {
      out.push({
        id: o.userData.worldSitePresentationFixtureId,
        opacity: o.material.opacity,
        scale: o.parent.scale.x,
      });
    }
  });
  return { out, root, controller };
}

test('(c) a failed component changes its OWN fixture at a constant stage', () => {
  const healthy = sampleFixtures(cathedralEntity('stabilized', {
    registry_scan_array: 'extracted', bridge_navigation_record: 'extracted',
    marker_service_spine: 'ready', cathedral_hull: 'stabilized',
  }));
  const damaged = sampleFixtures(cathedralEntity('stabilized', {
    registry_scan_array: 'failed', bridge_navigation_record: 'failed',
    marker_service_spine: 'failed', cathedral_hull: 'failed',
  }));
  try {
    assert.equal(healthy.out.length, 3);
    assert.equal(damaged.out.length, 3);
    for (let i = 0; i < healthy.out.length; i += 1) {
      assert.ok(damaged.out[i].opacity < healthy.out[i].opacity,
        `${healthy.out[i].id} must dim when its component fails`);
      assert.ok(damaged.out[i].scale < healthy.out[i].scale,
        `${healthy.out[i].id} must shrink when its component fails`);
    }
  } finally {
    healthy.controller.dispose();
    damaged.controller.dispose();
  }
});

test('(c) the fixture controller disposes every resource it created', () => {
  const entity = cathedralEntity('stabilized', { cathedral_hull: 'failed' });
  const { root, controller } = sampleFixtures(entity);
  const disposed = [];
  root.traverse((o) => {
    if (o.userData && o.userData.worldSitePresentationFixtureId) {
      const geometry = o.geometry;
      const material = o.material;
      const originalGeometryDispose = geometry.dispose.bind(geometry);
      const originalMaterialDispose = material.dispose.bind(material);
      geometry.dispose = () => { disposed.push('geometry'); originalGeometryDispose(); };
      material.dispose = () => { disposed.push('material'); originalMaterialDispose(); };
    }
  });

  controller.dispose();
  assert.equal(disposed.filter((d) => d === 'geometry').length, 3, 'every fixture geometry disposed');
  assert.equal(disposed.filter((d) => d === 'material').length, 3, 'every fixture material disposed');

  let remaining = 0;
  root.traverse((o) => { if (o.userData && o.userData.worldSitePresentationOwned) remaining += 1; });
  assert.equal(remaining, 0, 'no owned mounts may survive disposal');
  assert.equal(root.userData.worldSitePresentationController, undefined);

  controller.dispose(); // idempotent
});

// ------------------------------------------------------ (d) recipe contract

test('(d) reduced-mode declarations are optional and vocabulary-checked', () => {
  const damage = getPresentationRecipe('world_site.damage');
  assert.ok(REDUCED_CUE_MODES.includes(damage.reducedMotionMode));
  assert.ok(REDUCED_CUE_MODES.includes(damage.reducedFlashMode));

  // Optional: the recipes outside this leaf declare nothing and must stay valid.
  const untouched = getPresentationRecipe('mining.drill.contact');
  assert.equal(untouched.reducedMotionMode, undefined);
  assert.equal(validatePresentationRecipes().ok, true, 'the whole registry must remain valid');

  // A bogus mode is rejected.
  const bad = validatePresentationRecipes({
    'x.y': { ...damage, id: 'x.y', reducedMotionMode: 'teleport' },
  });
  assert.equal(bad.ok, false);
  assert.ok(bad.issues.some((i) => i.includes('reducedMotionMode')));
});

test('(d)(e) every recipe still declares all five lanes and a voice budget', () => {
  for (const [id, recipe] of Object.entries(PRESENTATION_RECIPES)) {
    for (const lane of ['camera', 'vfx', 'audio', 'ui', 'accessibility']) {
      assert.equal(typeof recipe.lanes[lane], 'string', `${id} must declare a ${lane} lane`);
    }
    assert.ok(Number.isFinite(recipe.budgets.voices), `${id} must declare a voice budget`);
  }
});

// ------------------------------------------------- (a) weapon impact identity

test('(a) flak impacts are mechanically distinct from autocannon impacts', () => {
  const flak = resolveImpactPresentationProfile('wpn_flak_turret_s');
  const autocannon = resolveImpactPresentationProfile('wpn_autocannon_m');

  assert.equal(flak.family, 'kinetic', 'flak stays kinetic mechanically');
  assert.equal(flak.variant, 'flak');
  assert.notEqual(flak.mode, autocannon.mode, 'flak must not reuse the autocannon impact mode');
  assert.notEqual(flak.primaryShape, autocannon.primaryShape);
  assert.ok(flak.fragmentCount > autocannon.fragmentCount, 'a fragmentation burst throws more pieces');
  assert.ok(flak.lightPeak < autocannon.lightPeak,
    'flak fires in dense volleys, so each burst must stay dimmer than a single autocannon hit');
});

test('(a) the impact families remain mutually distinct', () => {
  const ids = [
    'wpn_autocannon_m', 'wpn_railgun_m', 'wpn_plasma_cannon_m',
    'wpn_missile_rack_m', 'wpn_flak_turret_s',
  ];
  const modes = ids.map((id) => resolveImpactPresentationProfile(id).mode);
  assert.equal(new Set(modes).size, modes.length, `impact modes must be unique, got ${modes.join(',')}`);
});

function captureImpactGrammar(weaponId) {
  const calls = { sprites: [], streaks: [], cones: [], lights: [] };
  const host = Object.create(vfx);
  host._scene = {};
  host._burst = 1;
  host._posFrom = () => ({ x: 10, z: 20 });
  host._ent = () => ({ factionId: 'test', shield: 0 });
  host._shieldColor = () => '#66ccff';
  host._spawnSprite = (...args) => calls.sprites.push(args);
  host._spawnProjectileTrailStreak = (...args) => calls.streaks.push(args);
  host._impactParticleCone = (...args) => calls.cones.push(args);
  host._flashLight = (...args) => calls.lights.push(args);
  host._onProjectileHit({
    weaponId,
    targetId: 17,
    approach: { x: 1, z: 0 },
    normal: { x: -1, z: 0 },
  });
  return calls;
}

test('(a) flak executes an outward volume burst instead of the autocannon fallback branch', () => {
  const autocannon = captureImpactGrammar('wpn_autocannon_m');
  const flak = captureImpactGrammar('wpn_flak_turret_s');

  assert.equal(autocannon.sprites.length, 0,
    'the autocannon remains an attached gouge and directional fragment fan');
  assert.ok(flak.sprites.length >= 1,
    'a proximity burst needs a compact visible core at the ordinary camera');
  assert.ok(flak.streaks.length >= 6,
    `flak needs an outward fragment volume, got ${flak.streaks.length} streaks`);
  assert.ok(flak.cones[0][3] >= Math.PI * 1.9,
    `flak particle spread must cover a volume, got ${flak.cones[0][3]}`);
  assert.ok(flak.cones[0][3] > autocannon.cones[0][3] * 4,
    'flak spread must remain plainly wider than the autocannon incidence fan');
});

function captureExplosionPhase(classId, phase) {
  const calls = { sprites: [], streaks: [], cones: [], lights: [], bus: [] };
  const host = Object.create(vfx);
  host._scene = {};
  host._burst = 1;
  host.state = { settings: { video: {}, accessibility: {} } };
  host.bus = { emit: (...args) => calls.bus.push(args) };
  host._spawnSprite = (...args) => calls.sprites.push(args);
  host._spawnProjectileTrailStreak = (...args) => calls.streaks.push(args);
  host._impactParticleCone = (...args) => calls.cones.push(args);
  host._flashLight = (...args) => calls.lights.push(args);
  host._emitExplosionPhase(phase, {
    classId,
    x: 0,
    z: 0,
    radius: 6,
    dirX: 1,
    dirZ: 0,
    serial: 7,
  });
  return calls;
}

test('(b) small destruction opens with a compact readable breakup, not an ordinary ring scaled down', () => {
  const small = captureExplosionPhase('small', 'ignition');
  const ordinary = captureExplosionPhase('ordinary', 'ignition');
  const SPR_FLASH = 0;
  const SPR_RING = 1;

  assert.equal(small.sprites.some((args) => args[0] === SPR_RING), false,
    'small destruction must not borrow the ordinary expanding-ring grammar');
  assert.equal(ordinary.sprites.some((args) => args[0] === SPR_RING), true,
    'ordinary destruction retains its accepted hot ring');
  const hotCore = small.sprites.find((args) => args[0] === SPR_FLASH);
  assert.ok(hotCore, 'small destruction needs a compact hot core');
  assert.ok(hotCore[6] >= 6 * 0.25,
    `small hot-core release must remain readable relative to its radius, got ${hotCore[6]}`);
  assert.ok(small.streaks.length >= 2,
    'small destruction needs an asymmetric fragment break at ignition');
});
